import type { CoMathProjectState, ResearchWorkstreamRunRecord, ResearchWorkstreamRunStage } from "./schema.ts";
import { STALE_RESEARCH_WORKSTREAM_RUN_REASON } from "./storage.ts";

export interface FormatResearchWorkstreamRunInput {
	state: Pick<CoMathProjectState, "researchPaths">;
	run: ResearchWorkstreamRunRecord;
}

export interface FormatResearchWorkstreamStageStartedInput {
	state: Pick<CoMathProjectState, "researchPaths">;
	run: Pick<ResearchWorkstreamRunRecord, "pathId" | "pathTitle">;
	stage: ResearchWorkstreamRunStage;
	summary: string;
}

export interface FormatResearchWorkstreamStageCompletedInput {
	state: Pick<CoMathProjectState, "researchPaths">;
	run: Pick<ResearchWorkstreamRunRecord, "pathId" | "pathTitle">;
	stage: ResearchWorkstreamRunStage;
	summary: string;
	details: readonly string[];
}

export interface FormatCoMathResearchActivityStatusInput {
	state: Pick<CoMathProjectState, "researchPaths">;
	run: Pick<ResearchWorkstreamRunRecord, "currentStage" | "pathId">;
	stage?: ResearchWorkstreamRunStage;
}

export function formatCoMathResearchActivityStatus(input: FormatCoMathResearchActivityStatusInput): string {
	const pathIndex = input.state.researchPaths.findIndex((candidate) => candidate.id === input.run.pathId);
	const pathLabel = pathIndex >= 0 ? `Path ${pathIndex + 1}` : "Path";
	return `co-math: ${pathLabel} running · ${formatResearchActivityStage(input.stage ?? input.run.currentStage)}`;
}

/**
 * Research phases that run outside a workstream run (director planning, the independent review,
 * plan amendment, synthesis, statement revision) still hold the user's attention for a full model
 * call, so each gets its own footer status instead of leaving the indicator blank.
 */
export type CoMathResearchActivityPhase = "planning" | "independent-review" | "plan-update" | "synthesis" | "revision";

export function formatCoMathResearchPhaseActivityStatus(phase: CoMathResearchActivityPhase): string {
	if (phase === "planning") {
		return "co-math: planning the next research steps";
	}
	if (phase === "independent-review") {
		return "co-math: independently reviewing the finished step";
	}
	if (phase === "plan-update") {
		return "co-math: updating the plan with what was learned";
	}
	if (phase === "synthesis") {
		return "co-math: writing the research synthesis";
	}
	return "co-math: revising the statement";
}

/** Footer status for one bounded batch step, so the user can see where the budget stands. */
export function formatCoMathResearchStepActivityStatus(stepIndex: number, requestedStepCount: number): string {
	return `co-math: research step ${stepIndex} of ${requestedStepCount}`;
}

/** Compact elapsed-time suffix for the footer status ("42s", "3m 05s"). */
export function formatCoMathActivityElapsed(elapsedMs: number): string {
	const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
	if (totalSeconds < 60) {
		return `${totalSeconds}s`;
	}
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function formatResearchWorkstreamRunStarted(input: FormatResearchWorkstreamRunInput): string {
	const pathLabel = formatResearchRunPathLabel(input.state, input.run);
	const stage = formatResearchStage(input.run.currentStage);
	if (isLiteraturePathTitle(input.run.pathTitle)) {
		return [`Working on ${pathLabel}.`, `Now: ${stage}.`, "Checking source-backed context."].join("\n");
	}
	if (isComputationalPathTitle(input.run.pathTitle)) {
		return [`Working on ${pathLabel}.`, `Now: ${stage}.`, "Keeping the finite check bounded."].join("\n");
	}
	return [`Working on ${pathLabel}.`, `Now: ${stage}.`, "I’ll keep the gaps explicit."].join("\n");
}

export function formatResearchWorkstreamRunProgress(input: FormatResearchWorkstreamRunInput): string {
	const latest = input.run.incrementalReports.at(-1);
	return [
		`Research step ${formatResearchRunStatus(input.run.status)}`,
		"",
		formatResearchRunPathLabel(input.state, input.run),
		"",
		input.run.status === "queued" || input.run.status === "running"
			? "Pi is still working in the background. You can keep typing."
			: "This run is no longer active.",
		"",
		"Current stage",
		formatResearchStage(input.run.currentStage),
		"",
		"Latest update",
		...(latest
			? [
					`- ${formatResearchStage(latest.stage)}: ${latest.summary}`,
					...latest.details.slice(0, 3).map((detail) => `- ${detail}`),
				]
			: ["- Coordinator has framed the path; the first research attempt has not reported back yet."]),
		"",
		input.run.finalReportId
			? "Report: ready."
			: 'Report: not ready yet. Say "show latest report" for partial updates.',
	].join("\n");
}

export function formatResearchWorkstreamStageStarted(input: FormatResearchWorkstreamStageStartedInput): string {
	return [`Now: ${formatResearchStage(input.stage)}.`, sanitizeForegroundStageText(input.summary)].join("\n");
}

export function formatResearchWorkstreamStageCompleted(input: FormatResearchWorkstreamStageCompletedInput): string {
	const details =
		input.stage === "literature-search"
			? input.details
					.slice(0, 5)
					.map(sanitizeForegroundStageText)
					.filter((detail) => detail.length > 0)
			: [];
	return [
		`Finished: ${formatResearchStage(input.stage)}.`,
		sanitizeForegroundStageText(input.summary),
		...details,
	].join("\n");
}

export function formatResearchWorkstreamRunStillRunningReport(input: FormatResearchWorkstreamRunInput): string {
	return [
		"Latest research report is still running.",
		"",
		formatResearchRunPathLabel(input.state, input.run),
		"",
		"Incremental reports",
		...(input.run.incrementalReports.length > 0
			? input.run.incrementalReports.flatMap((report) => [
					`- ${report.title}: ${report.status}`,
					`  ${report.summary}`,
					...report.details.slice(0, 2).map((detail) => `  - ${detail}`),
				])
			: ["- No incremental report has been saved yet."]),
	].join("\n");
}

export function formatResearchWorkstreamRunFailed(input: FormatResearchWorkstreamRunInput): string {
	const pathIndex = input.state.researchPaths.findIndex((candidate) => candidate.id === input.run.pathId);
	const isStale = input.run.failureReason === STALE_RESEARCH_WORKSTREAM_RUN_REASON;
	const retryCommand = pathIndex >= 0 ? `continue path ${pathIndex + 1}` : undefined;
	if (input.run.status === "interrupted") {
		return [
			"Research step interrupted",
			"",
			formatResearchRunPathLabel(input.state, input.run),
			"",
			"Reason",
			input.run.failureReason ?? STALE_RESEARCH_WORKSTREAM_RUN_REASON,
			"",
			"Recovery",
			...(isStale ? ["- The earlier Pi session ended before this path finished."] : []),
			retryCommand ? `- Re-run this path: ${retryCommand}` : '- Try another path or say "show research state".',
			'- Inspect progress with "show latest report".',
		].join("\n");
	}
	return [
		"Research step failed",
		"",
		formatResearchRunPathLabel(input.state, input.run),
		"",
		"Reason",
		input.run.failureReason ?? "The research attempt stopped before producing a final report.",
		"",
		"Recovery",
		...(isStale ? ["- This earlier run is stale; it did not finish."] : []),
		retryCommand ? `- Re-run this path: ${retryCommand}` : '- Try another path or say "show research state".',
		'- Inspect progress with "show latest report".',
	].join("\n");
}

export function formatResearchWorkstreamAlreadyRunning(input: FormatResearchWorkstreamRunInput): string {
	return [
		`I’m already working on ${formatResearchRunPathLabel(input.state, input.run)}.`,
		'Say "show progress" to inspect it, or wait for it to finish.',
	].join("\n");
}

function formatResearchRunPathLabel(
	state: Pick<CoMathProjectState, "researchPaths">,
	run: Pick<ResearchWorkstreamRunRecord, "pathId" | "pathTitle">,
): string {
	const pathIndex = state.researchPaths.findIndex((candidate) => candidate.id === run.pathId);
	return pathIndex >= 0 ? `Path ${pathIndex + 1}: ${run.pathTitle}` : run.pathTitle;
}

function formatResearchRunStatus(status: ResearchWorkstreamRunRecord["status"]): string {
	if (status === "queued") {
		return "queued";
	}
	if (status === "running") {
		return "running";
	}
	if (status === "completed") {
		return "completed";
	}
	if (status === "blocked") {
		return "blocked";
	}
	if (status === "interrupted") {
		return "interrupted";
	}
	return "failed";
}

function formatResearchStage(stage: ResearchWorkstreamRunRecord["currentStage"]): string {
	if (stage === "coordinator") {
		return "Choosing the plan";
	}
	if (stage === "literature-search") {
		return "Searching references";
	}
	if (stage === "computation") {
		return "Running finite computation";
	}
	if (stage === "specialist") {
		return "Trying the research path";
	}
	if (stage === "critic") {
		return "Reviewing gaps and limits";
	}
	return "Writing the summary";
}

function formatResearchActivityStage(stage: ResearchWorkstreamRunStage): string {
	if (stage === "synthesizer") {
		return "synthesis";
	}
	if (stage === "literature-search") {
		return "literature";
	}
	return stage;
}

function isLiteraturePathTitle(title: string): boolean {
	return /\b(?:known theorem|literature|reference|source)\b/i.test(title);
}

function isComputationalPathTitle(title: string): boolean {
	return /\b(?:small examples?|counterexamples?|finite checks?|computation|computational|search|examples?)\b/i.test(
		title,
	);
}

function stripInlineSourceLabels(value: string): string {
	return value
		.replace(/\s*\[source-\d+\]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function sanitizeForegroundStageText(value: string): string {
	return stripInlineSourceLabels(value)
		.replace(/\bsource-\d+:\s*/gi, "")
		.trim();
}
