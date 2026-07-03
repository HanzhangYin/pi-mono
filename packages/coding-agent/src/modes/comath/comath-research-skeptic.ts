/**
 * Independent skeptic gate for completed research plan tasks.
 *
 * Generation is cheap; verification is the bottleneck. After a workstream-backed plan task
 * completes, the skeptic runs an adversarial model pass over the produced report with its own
 * context (not the specialist's transcript) and may propose a small bounded Python script that
 * searches for a counterexample to the report's central claim. Concerns become durable scrutiny
 * notes and evidence-board entries; a counterexample check becomes a computation record linked to
 * the task. The skeptic never blocks the plan by itself — it makes doubt durable and visible so
 * the director and the human can act on it. Without an executor the gate is a no-op, which keeps
 * deterministic runs byte-identical to the pre-skeptic harness.
 */

import type { ComputationalExecutor } from "./comath-computation-executor.ts";
import { getCoMathMarkdownSectionItems, parseCoMathMarkdown } from "./comath-markdown.ts";
import { buildResearchContextPack } from "./comath-research-context.ts";
import type { ResearchWorkstreamModelExecutor } from "./comath-research-model-workstream.ts";
import type {
	CoMathProjectState,
	ResearchEvidenceClassification,
	ResearchPlanTaskRecord,
	ResearchWorkstreamReportRecord,
} from "./schema.ts";
import { addComputationalArtifact, addMarginNote, addResearchEvidenceBoardEntry } from "./storage.ts";

const MAX_SKEPTIC_CONCERNS = 3;
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

export interface RunSkepticGateResult {
	state: CoMathProjectState;
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
		.map((concern) => concern.trim())
		.filter((concern) => concern.length > 0 && !knownGaps.has(normalizeConcern(concern)))
		.slice(0, MAX_SKEPTIC_CONCERNS);

	let nextState = input.state;
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
		nextState = addResearchEvidenceBoardEntry(nextState, {
			pathId: report.pathId,
			reportId: report.id,
			claim: concern,
			classification: classifyConcern(concern),
			rationale: "Raised by an independent review of this step, separate from the original attempt.",
			now: input.now,
			actor: "reviewer",
		});
		const entryId = nextState.researchEvidenceBoard.at(-1)?.id;
		if (entryId) {
			evidenceEntryIds.push(entryId);
		}
	}

	const script = extractPythonScript(responseText);
	const computationalArtifactIds: string[] = [];
	let counterexampleFound = false;
	if (script && input.computationalExecutor) {
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
			counterexampleFound = COUNTEREXAMPLE_SIGNAL.test(execution.stdout);
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
			nextState = addResearchEvidenceBoardEntry(nextState, {
				pathId: report.pathId,
				reportId: report.id,
				computationalArtifactIds,
				claim: counterexampleFound
					? "An independent bounded check found a counterexample to this step's central claim."
					: "An independent bounded check did not find a counterexample in the searched range.",
				classification: counterexampleFound ? "conflicting" : "computation",
				rationale: summarizeOutput(execution.stdout, execution.stderr),
				now: input.now,
				actor: "reviewer",
			});
			const checkEntryId = nextState.researchEvidenceBoard.at(-1)?.id;
			if (checkEntryId) {
				evidenceEntryIds.push(checkEntryId);
			}
			if (counterexampleFound) {
				nextState = addMarginNote(nextState, {
					id: `margin-note-${nextState.marginNotes.length + 1}`,
					kind: "warning",
					subjectId: report.pathId,
					...(report.workingPaperSectionId ? { sectionId: report.workingPaperSectionId } : {}),
					message:
						"Independent review found a counterexample to this step's central claim. Re-examine before building on it.",
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
		concerns,
		counterexampleFound,
		computationalArtifactIds,
		evidenceEntryIds,
	};
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
		buildResearchContextPack(state),
		"",
		"Rules:",
		`- Raise at most ${MAX_SKEPTIC_CONCERNS} NEW concerns not already listed as gaps in the report. If the report is honest about its limits, say so with an empty concerns list.`,
		"- If the step's central mathematical claim can be tested by a small bounded computation, provide ONE short Python script (standard library only, no imports of os/subprocess/network, no file access, prints its verdict) that searches for a counterexample.",
		"- The script must print `counterexample_found: true` or `counterexample_found: false` as its last line.",
		"- Do not fabricate citations. Write user-facing notes only.",
		"",
		"Return markdown with these headings:",
		"## Verdict",
		"## Concerns",
		"## Counterexample script",
	].join("\n");
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

function classifyConcern(concern: string): ResearchEvidenceClassification {
	return /\b(?:conflict|contradict|inconsistent|counterexample)\b/i.test(concern) ? "conflicting" : "unsupported";
}

function normalizeConcern(text: string): string {
	return text.trim().replace(/\s+/g, " ").toLowerCase();
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
