/**
 * Independent skeptic gate for completed research plan tasks.
 *
 * Generation is cheap; verification is the bottleneck. After a workstream-backed plan task
 * completes, the skeptic runs an adversarial model pass over the produced report with its own
 * context (not the specialist's transcript) and may propose a small bounded Python script that
 * searches for a counterexample to the report's central claim. Concerns become durable scrutiny
 * notes and evidence-board entries; a counterexample check becomes a computation record linked to
 * the task. The verdict has teeth: a step the skeptic explicitly rejects is not treated as
 * completed (the plan runner blocks it at the durable boundary), concerns mark the task
 * completed-with-concerns, and only a clean review reads as accepted. Without an executor the
 * gate is a no-op, which keeps deterministic runs byte-identical to the pre-skeptic harness.
 */

import type { ComputationalExecutor } from "./comath-computation-executor.ts";
import {
	firstCoMathMarkdownSectionItem,
	getCoMathMarkdownSectionItems,
	parseCoMathMarkdown,
} from "./comath-markdown.ts";
import { buildResearchContextPack } from "./comath-research-context.ts";
import { parseNegativeConstraints, parseTheoremApplicabilityChecks } from "./comath-research-discipline.ts";
import type { ResearchWorkstreamModelExecutor } from "./comath-research-model-workstream.ts";
import type {
	CoMathProjectState,
	ResearchEvidenceClassification,
	ResearchPlanTaskRecord,
	ResearchWorkstreamReportRecord,
} from "./schema.ts";
import {
	addComputationalArtifact,
	addMarginNote,
	addResearchConstraint,
	addTheoremApplicabilityCheck,
	getComputationalArtifactsForReport,
	upsertResearchEvidenceBoardEntry,
} from "./storage.ts";

const MAX_SKEPTIC_CONCERNS = 3;
const MAX_SKEPTIC_ARTIFACT_SUMMARIES = 6;
const MAX_SKEPTIC_ARTIFACT_SUMMARY_CHARS = 700;
const MAX_SKEPTIC_ARTIFACT_CONTEXT_CHARS = 3_600;
const SKEPTIC_SCRIPT_MAX_RUNTIME_MS = 10_000;
const COUNTEREXAMPLE_SIGNAL = /counterexample[_\s-]*found\s*[:=]?\s*(?:true|yes|1)\b|^\s*COUNTEREXAMPLE\b/im;

export interface RunSkepticGateInput {
	state: CoMathProjectState;
	task: ResearchPlanTaskRecord;
	reportId: string;
	runId?: string;
	executor: ResearchWorkstreamModelExecutor;
	computationalExecutor?: ComputationalExecutor;
	/** Repo-relative directory for the skeptic's script/output records. */
	artifactDirectory: string;
	/** Absolute working directory the script runs in. */
	workingDirectory: string;
	now: string;
}

export type SkepticVerdict = "accepted" | "needs-revision" | "rejected";

export interface RunSkepticGateResult {
	state: CoMathProjectState;
	/** The review's overall verdict; "rejected" means the step failed its acceptance criteria. */
	verdict: SkepticVerdict;
	concerns: string[];
	counterexampleFound: boolean;
	/** Computation records created by the counterexample check, for task linkage. */
	computationalArtifactIds: string[];
	evidenceEntryIds: string[];
}

/**
 * Run the skeptic over one completed task's report. Returns updated state (caller persists) plus
 * the ids to link into the task record. Any model or execution failure degrades to "no concerns"
 * rather than failing the task: verification must never be the reason durable progress is lost.
 */
export async function runSkepticGate(input: RunSkepticGateInput): Promise<RunSkepticGateResult> {
	const emptyResult: RunSkepticGateResult = {
		state: input.state,
		verdict: "accepted",
		concerns: [],
		counterexampleFound: false,
		computationalArtifactIds: [],
		evidenceEntryIds: [],
	};
	const report = input.state.researchReports.find((candidate) => candidate.id === input.reportId);
	if (!report) {
		return emptyResult;
	}
	let responseText: string;
	try {
		const response = await input.executor.run({
			role: "critic",
			rootQuestion: input.state.rootQuestion,
			path: pathForReport(input.state, report, input.now),
			allPaths: input.state.researchPaths,
			priorFindings: report.findings,
			inputText: formatReportForSkeptic(report),
			prompt: buildSkepticPrompt(input.state, input.task, report),
		});
		responseText = typeof response.text === "string" ? response.text : "";
	} catch {
		return emptyResult;
	}
	const parsed = parseCoMathMarkdown(responseText);
	const knownGaps = new Set([...report.gaps, ...report.criticisms].map(normalizeConcern));
	const concerns = getCoMathMarkdownSectionItems(parsed, "concern")
		.map((concern) => normalizeUsableConcern(concern))
		.filter((concern) => concern.length > 0 && !isNoConcernLine(concern) && !knownGaps.has(normalizeConcern(concern)))
		.slice(0, MAX_SKEPTIC_CONCERNS);

	let nextState = input.state;
	// Standing rules the skeptic derives ("Do not conflate general infinitude of primes with
	// infinitude in the quadratic sequence.") become durable reviewer constraints.
	for (const constraintText of parseNegativeConstraints(responseText)) {
		nextState = addResearchConstraint(nextState, {
			text: constraintText,
			kind: /\bconvention\b/i.test(constraintText) ? "convention" : "avoid",
			origin: "reviewer",
			now: input.now,
			actor: "reviewer",
		});
	}
	// The skeptic's own theorem checks are durable: an applicability rejection recorded here is
	// what later cautions any route that leans on the same theorem.
	for (const check of parseTheoremApplicabilityChecks(responseText)) {
		nextState = addTheoremApplicabilityCheck(nextState, {
			theorem: check.theorem,
			targetObject: check.targetObject,
			hypotheses: check.hypotheses,
			status: check.status,
			...(check.consequence ? { consequence: check.consequence } : {}),
			pathId: report.pathId,
			reportId: report.id,
			taskId: input.task.id,
			now: input.now,
			actor: "reviewer",
		});
	}
	const evidenceEntryIds: string[] = [];
	for (const concern of concerns) {
		nextState = addMarginNote(nextState, {
			id: `margin-note-${nextState.marginNotes.length + 1}`,
			kind: "scrutiny",
			subjectId: report.pathId,
			...(report.workingPaperSectionId ? { sectionId: report.workingPaperSectionId } : {}),
			message: `Independent review: ${concern}`,
			now: input.now,
			actor: "reviewer",
		});
		// The upsert merges a concern that restates an already-recorded one, so repeated review
		// rounds do not multiply the same complaint; the surviving entry id keeps the linkage exact.
		const upserted = upsertResearchEvidenceBoardEntry(nextState, {
			pathId: report.pathId,
			reportId: report.id,
			claim: concern,
			classification: classifyConcern(concern),
			rationale: "Raised by an independent review of this step, separate from the original attempt.",
			now: input.now,
			actor: "reviewer",
		});
		nextState = upserted.state;
		evidenceEntryIds.push(upserted.entryId);
	}

	const counterexampleTarget = resolveCounterexampleTarget(
		firstCoMathMarkdownSectionItem(parsed, "counterexample target"),
		report,
	);
	const script = extractPythonScript(responseText);
	const computationalArtifactIds: string[] = [];
	let counterexampleFound = false;
	if (script && counterexampleTarget && input.computationalExecutor) {
		try {
			const execution = await input.computationalExecutor.runScript(
				{
					fileName: "skeptic-check.py",
					language: "python",
					content: script,
					summary: "Independent bounded counterexample check.",
				},
				{
					rootQuestion: input.state.rootQuestion,
					pathTitle: report.pathTitle,
					pathObjective: "Search for a counterexample to the step's central claim.",
					workingDirectory: input.workingDirectory,
					maxRuntimeMs: SKEPTIC_SCRIPT_MAX_RUNTIME_MS,
				},
			);
			const checkCompleted = execution.exitCode === 0;
			counterexampleFound = checkCompleted && COUNTEREXAMPLE_SIGNAL.test(execution.stdout);
			nextState = addComputationalArtifact(nextState, {
				pathId: report.pathId,
				reportId: report.id,
				...(input.runId ? { runId: input.runId } : {}),
				kind: "script",
				status: execution.exitCode === 0 ? "completed" : "failed",
				title: "Independent counterexample check (script)",
				...(execution.scriptFileName ? { filePath: `${input.artifactDirectory}/${execution.scriptFileName}` } : {}),
				command: execution.command,
				exitCode: execution.exitCode,
				summary: script.length > 900 ? `${script.slice(0, 897)}...` : script,
				now: input.now,
				actor: "reviewer",
			});
			const scriptArtifactId = nextState.computationalArtifacts.at(-1)?.id;
			nextState = addComputationalArtifact(nextState, {
				pathId: report.pathId,
				reportId: report.id,
				...(input.runId ? { runId: input.runId } : {}),
				kind: "stdout",
				status: execution.exitCode === 0 ? "completed" : "failed",
				title: "Independent counterexample check (output)",
				...(execution.stdoutFileName ? { filePath: `${input.artifactDirectory}/${execution.stdoutFileName}` } : {}),
				exitCode: execution.exitCode,
				summary: execution.stdout.trim() || execution.stderr.trim() || "(no output)",
				now: input.now,
				actor: "reviewer",
			});
			const stdoutArtifactId = nextState.computationalArtifacts.at(-1)?.id;
			for (const artifactId of [scriptArtifactId, stdoutArtifactId]) {
				if (artifactId) {
					computationalArtifactIds.push(artifactId);
				}
			}
			const checkUpserted = upsertResearchEvidenceBoardEntry(nextState, {
				pathId: report.pathId,
				reportId: report.id,
				computationalArtifactIds,
				claim: !checkCompleted
					? `An independent bounded check was inconclusive for the report claim: ${counterexampleTarget}`
					: counterexampleFound
						? `An independent bounded check found a counterexample to the report claim: ${counterexampleTarget}`
						: `An independent bounded check did not find a counterexample to the report claim in the searched range: ${counterexampleTarget}`,
				classification: !checkCompleted ? "unsupported" : counterexampleFound ? "conflicting" : "computation",
				rationale: summarizeOutput(execution.stdout, execution.stderr),
				now: input.now,
				actor: "reviewer",
			});
			nextState = checkUpserted.state;
			evidenceEntryIds.push(checkUpserted.entryId);
			if (counterexampleFound) {
				nextState = addMarginNote(nextState, {
					id: `margin-note-${nextState.marginNotes.length + 1}`,
					kind: "warning",
					subjectId: report.pathId,
					...(report.workingPaperSectionId ? { sectionId: report.workingPaperSectionId } : {}),
					message: `Independent review found a counterexample to this report claim: ${counterexampleTarget}`,
					now: input.now,
					actor: "reviewer",
				});
			}
		} catch {
			// A failed check leaves no record; the concerns above still stand on their own.
		}
	}

	return {
		state: nextState,
		verdict: normalizeSkepticVerdict(firstCoMathMarkdownSectionItem(parsed, "verdict"), concerns),
		concerns,
		counterexampleFound,
		computationalArtifactIds,
		evidenceEntryIds,
	};
}

/**
 * Map the free-text verdict onto the three durable outcomes. A surviving direct statement that
 * the report is mathematically false overrides a stale softer verdict so the plan runner blocks
 * the step. Once heading fragments and affirmative remarks have been removed, a concern-free
 * review is accepted even if its prose verdict was stale or inconsistent.
 */
function normalizeSkepticVerdict(value: string | undefined, concerns: readonly string[]): SkepticVerdict {
	const normalized = (value ?? "").trim().toLowerCase();
	if (concerns.some(isDirectFactualContradiction)) {
		return "rejected";
	}
	if (/\breject|not accepted|fails? (?:the |its )?acceptance/.test(normalized)) {
		return "rejected";
	}
	if (concerns.length === 0) {
		return "accepted";
	}
	return "needs-revision";
}

export function buildSkepticPrompt(
	state: CoMathProjectState,
	task: ResearchPlanTaskRecord,
	report: ResearchWorkstreamReportRecord,
): string {
	return [
		"You are an independent skeptic reviewing one finished research step. You did not produce it.",
		"Attack it: look for unjustified steps, overclaims, misuse of finite evidence for infinite claims, and unsupported citations.",
		"",
		`The step's task was: ${task.title}.`,
		...(task.goal ? [`Task goal: ${task.goal}`] : []),
		...(task.acceptanceCriteria.length > 0
			? ["The step claims to satisfy:", ...task.acceptanceCriteria.map((criterion) => `- ${criterion}`)]
			: []),
		"",
		"The step's report:",
		formatReportForSkeptic(report),
		"",
		...formatComputationalEvidenceForSkeptic(state, report),
		"",
		buildResearchContextPack(stateForSkepticContext(state, report)),
		"",
		"Rules:",
		`- Raise at most ${MAX_SKEPTIC_CONCERNS} NEW concerns not already listed as gaps in the report. If the report is honest about its limits, say so with an empty concerns list.`,
		"- If the report builds on a named theorem, verify its applicability against the actual object and add a `## Theorem check` section (bullets: `Theorem:`, `Object:`, one `Hypothesis: <text> - satisfied|failed|unknown` per hypothesis, `Status: applies | rejected-as-direct-route | needs-verification`, `Consequence:`).",
		'- If your review reveals a standing rule future steps must respect (e.g. "Do not treat proposed or heuristic preprints as settled proofs."), add a `## Negative constraints` section with one imperative bullet per rule.',
		"- If one mathematical claim in `Findings` or `Claimed strategy` can be tested by a small bounded computation, copy that exact claim into `## Counterexample target` and provide ONE short Python script (standard library only, no imports of os/subprocess/network, no file access, prints its verdict) that tests only that claim.",
		"- If no precise report claim is suitable, write `none` under `## Counterexample target` and do not provide a script.",
		"- The script must print `counterexample_found: true` or `counterexample_found: false` as its last line.",
		"- Do not fabricate citations. Write user-facing notes only.",
		"",
		'- In `## Verdict`, answer with exactly one of: accepted | needs-revision | rejected. Say "rejected" only when the step fails its stated acceptance criteria or its central claim is wrong; a rejected step is not treated as completed.',
		"- If a mathematical claim in the report is false, incorrect, or wrong as written, identify it under `## Concerns` and return `rejected`.",
		"",
		"Return markdown with these headings:",
		"## Verdict",
		"## Concerns",
		"## Counterexample target",
		"## Counterexample script",
	].join("\n");
}

function resolveCounterexampleTarget(
	requestedTarget: string | undefined,
	report: ResearchWorkstreamReportRecord,
): string | undefined {
	const normalized = requestedTarget?.replace(/\s+/g, " ").trim();
	if (!normalized || /^(?:none|n\/a|not applicable)\.?$/i.test(normalized)) {
		return undefined;
	}
	const testableClaims = [...report.findings, ...report.promisingStrategy];
	return testableClaims.find((claim) => normalizeConcern(claim) === normalizeConcern(normalized));
}

function formatReportForSkeptic(report: ResearchWorkstreamReportRecord): string {
	return [
		`Path: ${report.pathTitle}`,
		"Findings:",
		...bullets(report.findings),
		"Claimed strategy:",
		...bullets(report.promisingStrategy),
		"Self-reported gaps:",
		...bullets(report.gaps),
		"Self-reported criticisms:",
		...bullets(report.criticisms),
	].join("\n");
}

function bullets(items: readonly string[]): string[] {
	return items.length > 0 ? items.map((item) => `- ${item}`) : ["- (none)"];
}

function formatComputationalEvidenceForSkeptic(
	state: CoMathProjectState,
	report: ResearchWorkstreamReportRecord,
): string[] {
	const linkedArtifacts = getComputationalArtifactsForReport(state, report.id);
	const outputArtifacts = linkedArtifacts
		.filter((artifact) => artifact.kind !== "script")
		.sort((left, right) => artifactSummaryPriority(left.kind) - artifactSummaryPriority(right.kind))
		.slice(0, MAX_SKEPTIC_ARTIFACT_SUMMARIES);
	if (outputArtifacts.length === 0) {
		return linkedArtifacts.length === 0
			? ["Linked computational evidence: (none)"]
			: ["Linked computational evidence: no durable output summary is available; raw script text is omitted."];
	}

	const lines = [
		"Linked computational evidence (bounded durable output summaries; do not call a result missing merely because the report body omits its full table):",
	];
	let remainingChars = MAX_SKEPTIC_ARTIFACT_CONTEXT_CHARS;
	for (const artifact of outputArtifacts) {
		const exitCode = artifact.exitCode === undefined ? "" : `, exit ${artifact.exitCode}`;
		const prefix = `- ${artifact.title} [${artifact.kind}, ${artifact.status}${exitCode}]: `;
		const summary = artifact.summary.replace(/\s+/g, " ").trim();
		const availableSummaryChars = Math.min(MAX_SKEPTIC_ARTIFACT_SUMMARY_CHARS, remainingChars - prefix.length);
		if (availableSummaryChars < 40) {
			break;
		}
		const boundedSummary =
			summary.length <= availableSummaryChars
				? summary
				: `${summary.slice(0, Math.max(0, availableSummaryChars - 3))}...`;
		const line = `${prefix}${boundedSummary}`;
		lines.push(line);
		remainingChars -= line.length;
	}
	const omittedCount = linkedArtifacts.filter((artifact) => artifact.kind !== "script").length - (lines.length - 1);
	if (omittedCount > 0) {
		lines.push(`- (${omittedCount} additional output record${omittedCount === 1 ? "" : "s"} omitted)`);
	}
	return lines;
}

function stateForSkepticContext(state: CoMathProjectState, report: ResearchWorkstreamReportRecord): CoMathProjectState {
	const linkedIds = new Set(report.computationalArtifactIds);
	return {
		...state,
		computationalArtifacts: state.computationalArtifacts.filter(
			(artifact) => artifact.kind !== "script" && artifact.reportId !== report.id && !linkedIds.has(artifact.id),
		),
	};
}

function artifactSummaryPriority(kind: "script" | "stdout" | "stderr" | "table" | "summary"): number {
	switch (kind) {
		case "table":
			return 0;
		case "stdout":
			return 1;
		case "summary":
			return 2;
		case "stderr":
			return 3;
		case "script":
			return 4;
	}
}

function classifyConcern(concern: string): ResearchEvidenceClassification {
	return isDirectFactualContradiction(concern) ||
		/\b(?:conflicts?|contradicts?|inconsistent|counterexamples?)\b/i.test(concern)
		? "conflicting"
		: "unsupported";
}

function isDirectFactualContradiction(concern: string): boolean {
	return /\b(?:is|are|was|were)\s+(?:(?:mathematically|factually)\s+)?(?:false|incorrect|wrong)(?:\s+as\s+written)?\b/i.test(
		concern,
	);
}

function normalizeConcern(text: string): string {
	return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function isNoConcernLine(text: string): boolean {
	const normalized = normalizeConcern(text).replace(/[.!?]+$/g, "");
	return /^(?:none|no concerns|no new concerns|nothing|n\/a|not applicable)(?:\.|$|\s)/i.test(normalized);
}

// A remark that explicitly says nothing is wrong is review commentary, not a deficiency; it must
// not become an obligation gap, a scrutiny note, and an "unsupported claim" all at once.
const NON_DEFICIENCY_CONCERN =
	/\b(?:is|are|was|were)\s+handled\s+(?:honestly|correctly|properly|appropriately|well)\b|\bno\s+(?:(?:new|serious|major|real|substantive)\s*)*concerns?\b|\bno\s+(?:serious|major|real)?\s*overclaims?\b|\blooks\s+(?:correct|sound|fine)\b|\b(?:report|step|argument|analysis)\s+(?:explicitly\s+)?(?:acknowledges|states|notes)\s+(?:this|the)\s+(?:limitation|caveat)\b|\b(?:is|are)\s+careful\s+not\s+to\b|\bcorrectly\s+(?:separates?|distinguishes?|states?|notes?)\b/i;
const CONCERN_CLAUSE_BOUNDARY = /(?:[.!?;,]\s*|\s+)(?:however|but|yet|nevertheless)\b[:,]?\s*|[.!?;]+\s+/i;

/**
 * Normalize one concern bullet: a heading fragment ("Named theorem audit:") is trimmed back to its
 * complete sentences (usually leaving nothing), and non-deficiency remarks are dropped, so every
 * surviving concern is an actual problem a later task could address. Returns "" when nothing
 * usable remains.
 */
function normalizeUsableConcern(text: string): string {
	let normalized = text.replace(/\s+/g, " ").trim();
	if (/[:;,]$/.test(normalized)) {
		normalized = normalized.replace(/[^.!?]*$/, "").trim();
	}
	if (NON_DEFICIENCY_CONCERN.test(normalized)) {
		normalized = normalized
			.split(CONCERN_CLAUSE_BOUNDARY)
			.map((clause) => clause.trim())
			.filter((clause) => clause.length > 0 && !isNoConcernLine(clause) && !NON_DEFICIENCY_CONCERN.test(clause))
			.join(" ");
	}
	if (normalized.length < 12) {
		return "";
	}
	return normalized;
}

function extractPythonScript(text: string): string | undefined {
	const match = /```python\s*\n([\s\S]*?)```/i.exec(text);
	const script = match?.[1]?.trim();
	return script && script.length > 0 ? script : undefined;
}

function summarizeOutput(stdout: string, stderr: string): string {
	const text = (stdout.trim() || stderr.trim() || "(no output)").replace(/\s+/g, " ");
	return text.length <= 400 ? text : `${text.slice(0, 397)}...`;
}

function pathForReport(state: CoMathProjectState, report: ResearchWorkstreamReportRecord, now: string) {
	return (
		state.researchPaths.find((path) => path.id === report.pathId) ?? {
			id: report.pathId,
			title: report.pathTitle,
			objective: state.rootQuestion,
			status: "active" as const,
			latestFindings: [],
			blockers: [],
			suggestedNextMove: "Review this step.",
			priority: 1,
			createdAt: now,
			updatedAt: now,
		}
	);
}
