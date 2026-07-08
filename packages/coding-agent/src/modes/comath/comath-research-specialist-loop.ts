/**
 * Agentic tool loop for the specialist stage of a model-backed research workstream.
 *
 * Instead of one blind model call, the specialist may take a small number of bounded actions
 * before writing its final note: run a sandboxed Python computation mid-attempt, or record a
 * durable claim for the evidence board. Each action is a JSON object in the model response; a
 * plain markdown response is the final note, so a model that never uses tools behaves exactly
 * like the old single-call specialist (same call count, same downstream parsing).
 *
 * Boundedness and durability rules:
 * - At most {@link DEFAULT_MAX_TOOL_ACTIONS} actions (configurable), so at most actions + 1 model
 *   calls. When the budget is spent the specialist is asked once for its final note.
 * - Nothing is persisted mid-loop. Claims and computation outputs are returned to the caller and
 *   written to durable state only after the loop finishes, keeping the retry unit the whole task.
 * - Scripts run through the injected {@link ComputationalExecutor}, which enforces the sandbox
 *   (standard library only, no os/subprocess/network/file access) and the runtime cap.
 * - The specialist cannot self-certify theorems: a `theorem` classification is downgraded to
 *   `conjecture`; promotion stays with the skeptic/reviewer machinery.
 */

import type { ComputationalExecutor } from "./comath-computation-executor.ts";
import { extractCoMathJsonObject, stripCoMathJsonObjects } from "./comath-markdown.ts";
import { buildProofTaskGuidance, buildStandingConstraintsBlock } from "./comath-research-discipline.ts";
import type { ResearchWorkstreamModelExecutor } from "./comath-research-model-workstream.ts";
import type {
	ResearchClaimCategory,
	ResearchConstraintRecord,
	ResearchEvidenceClassification,
	ResearchPath,
	ResearchPlanTaskKind,
} from "./schema.ts";
import { normalizeResearchClaimCategory } from "./storage.ts";

const DEFAULT_MAX_TOOL_ACTIONS = 3;
const SCRIPT_MAX_RUNTIME_MS = 10_000;
const TOOL_OUTPUT_CAP = 2_000;
const MAX_RECORDED_CLAIMS = 5;

const RECORDABLE_CLASSIFICATIONS: readonly ResearchEvidenceClassification[] = [
	"conjecture",
	"heuristic",
	"computation",
	"survey-context",
	"unsupported",
	"conflicting",
];

export interface SpecialistRecordedClaim {
	claim: string;
	classification: ResearchEvidenceClassification;
	/** Researcher-facing category (computed anchor result, convention-dependent claim, ...). */
	claimCategory?: ResearchClaimCategory;
	rationale: string;
}

export interface SpecialistComputationRecord {
	kind: "script" | "stdout";
	title: string;
	fileName?: string;
	command?: string;
	exitCode?: number;
	summary: string;
}

export interface RunSpecialistToolLoopInput {
	rootQuestion: string;
	path: ResearchPath;
	allPaths: readonly ResearchPath[];
	priorFindings: readonly string[];
	directive?: string;
	/** Standing research constraints the specialist must respect. */
	standingConstraints?: readonly ResearchConstraintRecord[];
	/** The plan-task kind this attempt executes; proof-level kinds get proof-first guidance. */
	taskKind?: ResearchPlanTaskKind;
	executor: ResearchWorkstreamModelExecutor;
	computationalExecutor?: ComputationalExecutor;
	/** Absolute directory the specialist's scripts run in (created by the executor). */
	workingDirectory?: string;
	maxToolActions?: number;
}

export interface SpecialistToolLoopResult {
	/** Final specialist note (markdown), parsed downstream exactly like the single-call output. */
	finalText: string;
	/** Human-readable notes about the actions taken, surfaced in the stage details. */
	stageNotes: string[];
	recordedClaims: SpecialistRecordedClaim[];
	computationRecords: SpecialistComputationRecord[];
	modelCallCount: number;
}

interface ToolExchange {
	description: string;
	result: string;
}

/**
 * Run the specialist as a bounded tool loop and return its final note plus the durable
 * side-effects for the caller to persist. Throws only when the model itself is unusable (so the
 * caller's deterministic fallback engages, as with the single-call specialist).
 */
export async function runSpecialistToolLoop(input: RunSpecialistToolLoopInput): Promise<SpecialistToolLoopResult> {
	const maxToolActions = Math.max(0, input.maxToolActions ?? DEFAULT_MAX_TOOL_ACTIONS);
	const exchanges: ToolExchange[] = [];
	const stageNotes: string[] = [];
	const recordedClaims: SpecialistRecordedClaim[] = [];
	const computationRecords: SpecialistComputationRecord[] = [];
	let modelCallCount = 0;

	for (let call = 0; call <= maxToolActions; call += 1) {
		const remaining = maxToolActions - call;
		const response = await input.executor.run({
			role: "specialist",
			rootQuestion: input.rootQuestion,
			path: input.path,
			allPaths: input.allPaths,
			priorFindings: input.priorFindings,
			inputText: exchanges.map((exchange) => `${exchange.description}\n${exchange.result}`).join("\n\n"),
			prompt: buildAgenticSpecialistPrompt(input, exchanges, remaining),
		});
		modelCallCount += 1;
		const text = typeof response.text === "string" ? response.text : "";
		const action = parseSpecialistAction(text);
		if (!action || remaining === 0) {
			const finalText = action ? stripActionJson(text) : text;
			return {
				finalText: finalText.trim() || buildBudgetExhaustedNote(stageNotes),
				stageNotes,
				recordedClaims,
				computationRecords,
				modelCallCount,
			};
		}
		if (action.kind === "finish") {
			return {
				finalText: action.report.trim() || stripActionJson(text).trim() || buildBudgetExhaustedNote(stageNotes),
				stageNotes,
				recordedClaims,
				computationRecords,
				modelCallCount,
			};
		}
		if (action.kind === "record_claim") {
			if (recordedClaims.length >= MAX_RECORDED_CLAIMS) {
				exchanges.push({
					description: `Requested claim: ${action.claim}`,
					result: "Result: claim limit reached; include remaining claims in the final note instead.",
				});
				continue;
			}
			recordedClaims.push({
				claim: action.claim,
				classification: action.classification,
				...(action.claimCategory ? { claimCategory: action.claimCategory } : {}),
				rationale: action.rationale,
			});
			stageNotes.push(`Recorded a durable claim (${action.classification}): ${truncate(action.claim, 160)}`);
			exchanges.push({
				description: `Recorded claim (${action.classification}): ${action.claim}`,
				result: "Result: saved to the durable evidence for this path.",
			});
			continue;
		}
		// run_computation
		if (!input.computationalExecutor || !input.workingDirectory) {
			exchanges.push({
				description: `Requested computation: ${action.summary}`,
				result: "Result: no computation backend is available; reason from the mathematics instead.",
			});
			continue;
		}
		try {
			const execution = await input.computationalExecutor.runScript(
				{
					fileName: `specialist-check-${computationRecords.length / 2 + 1}.py`,
					language: "python",
					content: action.script,
					summary: action.summary,
				},
				{
					rootQuestion: input.rootQuestion,
					pathTitle: input.path.title,
					pathObjective: input.path.objective,
					workingDirectory: input.workingDirectory,
					maxRuntimeMs: SCRIPT_MAX_RUNTIME_MS,
				},
			);
			const output = truncate(execution.stdout.trim() || execution.stderr.trim() || "(no output)", TOOL_OUTPUT_CAP);
			computationRecords.push({
				kind: "script",
				title: `Specialist computation: ${truncate(action.summary, 80)}`,
				...(execution.scriptFileName ? { fileName: execution.scriptFileName } : {}),
				command: execution.command,
				exitCode: execution.exitCode,
				summary: truncate(action.script, 900),
			});
			computationRecords.push({
				kind: "stdout",
				title: `Specialist computation output: ${truncate(action.summary, 80)}`,
				...(execution.stdoutFileName ? { fileName: execution.stdoutFileName } : {}),
				exitCode: execution.exitCode,
				summary: output,
			});
			stageNotes.push(`Ran a bounded computation (exit ${execution.exitCode}): ${truncate(action.summary, 120)}`);
			exchanges.push({
				description: `Computation (${action.summary}) exit code ${execution.exitCode}. Output:`,
				result: output,
			});
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : "The computation could not run.";
			stageNotes.push(`A requested computation was rejected: ${truncate(message, 120)}`);
			exchanges.push({
				description: `Requested computation: ${action.summary}`,
				result: `Result: rejected (${truncate(message, 200)}). Adjust the script or reason without it.`,
			});
		}
	}
	// Unreachable: the loop always returns from the remaining === 0 branch.
	return {
		finalText: buildBudgetExhaustedNote(stageNotes),
		stageNotes,
		recordedClaims,
		computationRecords,
		modelCallCount,
	};
}

type SpecialistAction =
	| { kind: "run_computation"; summary: string; script: string }
	| {
			kind: "record_claim";
			claim: string;
			classification: ResearchEvidenceClassification;
			claimCategory?: ResearchClaimCategory;
			rationale: string;
	  }
	| { kind: "finish"; report: string };

export function parseSpecialistAction(text: string): SpecialistAction | undefined {
	const parsed = extractCoMathJsonObject(text);
	if (!parsed || typeof parsed.action !== "string") {
		return undefined;
	}
	if (parsed.action === "finish") {
		return { kind: "finish", report: typeof parsed.report === "string" ? parsed.report : "" };
	}
	if (parsed.action === "run_computation") {
		const script = typeof parsed.script === "string" ? parsed.script.trim() : "";
		if (!script) {
			return undefined;
		}
		return {
			kind: "run_computation",
			summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : "bounded check",
			script,
		};
	}
	if (parsed.action === "record_claim") {
		const claim = typeof parsed.claim === "string" ? parsed.claim.trim() : "";
		if (!claim) {
			return undefined;
		}
		const claimCategory = normalizeResearchClaimCategory(parsed.category ?? parsed.claimCategory);
		return {
			kind: "record_claim",
			claim: truncate(claim, 400),
			classification: normalizeRecordableClassification(parsed.classification),
			...(claimCategory ? { claimCategory } : {}),
			rationale:
				typeof parsed.rationale === "string" && parsed.rationale.trim()
					? truncate(parsed.rationale.trim(), 400)
					: "Recorded by the specialist during this attempt.",
		};
	}
	return undefined;
}

/**
 * The specialist may not self-certify theorems: `theorem` downgrades to `conjecture`, and unknown
 * classifications land as `unsupported` so nothing enters the evidence board over-labeled.
 */
function normalizeRecordableClassification(value: unknown): ResearchEvidenceClassification {
	if (value === "theorem") {
		return "conjecture";
	}
	const match = RECORDABLE_CLASSIFICATIONS.find((candidate) => candidate === value);
	return match ?? "unsupported";
}

export function buildAgenticSpecialistPrompt(
	input: Pick<
		RunSpecialistToolLoopInput,
		"rootQuestion" | "path" | "priorFindings" | "directive" | "standingConstraints" | "taskKind"
	>,
	exchanges: readonly ToolExchange[],
	remainingActions: number,
): string {
	return [
		"You are the specialist for one research path in a co-mathematician workspace.",
		`Root question: ${input.rootQuestion}`,
		`Selected path: ${input.path.title}`,
		`Path objective: ${input.path.objective}`,
		"Existing findings:",
		...(input.priorFindings.length > 0 ? input.priorFindings.map((finding) => `- ${finding}`) : ["- (none yet)"]),
		...buildStandingConstraintsBlock(input.standingConstraints ?? []),
		"",
		"Task:",
		...(input.directive?.trim() ? ["Task brief from the research plan:", input.directive.trim(), ""] : []),
		"Attempt this path. Produce useful partial progress, not polished certainty.",
		...buildProofTaskGuidance(input.taskKind),
		...(exchanges.length > 0
			? ["", "Actions taken so far:", ...exchanges.map((exchange) => `${exchange.description}\n${exchange.result}`)]
			: []),
		"",
		remainingActions > 0
			? `You may take up to ${remainingActions} more bounded action${remainingActions === 1 ? "" : "s"} before your final note. To take an action, return ONLY one JSON object (no other text):`
			: "You have no actions remaining. Return your final note now.",
		...(remainingActions > 0
			? [
					'- Run a bounded computation: {"action":"run_computation","summary":"what it checks","script":"<small Python, standard library only, no os/subprocess/network/file access, prints its results>"}',
					'- Record a durable claim: {"action":"record_claim","claim":"...","classification":"conjecture|heuristic|computation|survey-context|unsupported|conflicting","category":"verified-fact|source-backed-theorem|computed-anchor-result|convention-dependent-claim|plausible-interpretation|failed-route|open-caveat","rationale":"..."}',
					"Use a computation when a finite check would sharpen the attempt; record claims for statements worth keeping even if this attempt stalls.",
					"",
					"When you are done (or if no action is needed), return your final note as plain markdown instead of JSON.",
				]
			: []),
		"",
		"The final note must use these headings:",
		"## Findings",
		"## Promising strategy",
		"## Gaps",
		"## Next",
		"Preserve uncertainty. Do not claim a proof of a famous or open problem unless you actually provide a complete proof from the information given.",
		"Treat finite computation output as evidence, never as proof of an infinite statement.",
		"Do not fabricate citations.",
		"Write user-facing notes only. Do not include scratchpad planning, self-talk, or drafting narration.",
		"Keep the answer compact: short bullets.",
	].join("\n");
}

function stripActionJson(text: string): string {
	return stripCoMathJsonObjects(text);
}

function buildBudgetExhaustedNote(stageNotes: readonly string[]): string {
	return [
		"## Findings",
		...(stageNotes.length > 0
			? stageNotes.map((note) => `- ${note}`)
			: ["- The attempt recorded no durable finding."]),
		"## Promising strategy",
		"- Revisit this path with a sharper task brief.",
		"## Gaps",
		"- The specialist spent its action budget before writing a final note.",
		"## Next",
		"- Retry this task or narrow its goal.",
	].join("\n");
}

function truncate(text: string, maxLength: number): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) {
		return normalized;
	}
	return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}
