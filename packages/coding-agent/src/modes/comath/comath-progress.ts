import { sanitizeProductIds } from "./comath-backend-output.ts";
import type { CoMathResearchAutoPlan } from "./comath-research-autoplan.ts";
import type { CoMathSource } from "./comath-source.ts";
import type {
	CoMathProjectState,
	ComputationalArtifact,
	LiteratureClaimSupport,
	LiteratureSourceArtifact,
	ResearchBatchRecord,
	ResearchCoordinatorReportRecord,
	ResearchPath,
	ResearchWorkstreamReportRecord,
	ResearchWorkstreamRunRecord,
	ResearchWorkstreamRunStage,
} from "./schema.ts";
import { STALE_RESEARCH_WORKSTREAM_RUN_REASON } from "./storage.ts";

export interface CoMathProductRunSummary {
	status?: string;
	background?: boolean;
	transcriptPath?: string;
	reportId?: string;
	blockers?: string[];
}

export function formatCoMathWelcome(source: CoMathSource | undefined): string {
	if (!source) {
		return [
			"Pi is ready to help validate mathematical work.",
			"",
			"Describe the problem you want to investigate.",
		].join("\n");
	}
	if (!source.exists || !source.isFile) {
		return [
			"Pi is ready to help validate mathematical work.",
			`Source warning: ${source.input}`,
			source.missingReason ?? "Source path is not readable.",
			"",
			"Describe the problem you want to investigate.",
		].join("\n");
	}
	return [
		"Pi is ready to help validate mathematical work.",
		`Source: ${source.displayName}`,
		"",
		"Describe the problem you want to investigate.",
	].join("\n");
}

export function formatCoMathProductHelp(): string {
	return [
		"Pi math validation help",
		"",
		"Start by describing the problem or claim you want to investigate.",
		"Example: Validate Question 3.",
		"",
		"After Pi starts working, steer naturally:",
		"  continue",
		"  show progress",
		"  show report",
		"  focus on the support indexing gap",
		"  show uncertainty",
		"",
		"Pi will organize the source, goals, audit steps, transcripts, and reports internally.",
	].join("\n");
}

/** Guidance shown when a fresh-workspace prompt is operational/non-math and should not create state. */
export function formatCoMathNonMathEntryGuidance(): string {
	return [
		"Pi co-math is for mathematical validation and exploration.",
		"",
		"Start with a math question, for example:",
		"Are there infinitely many primes of the form n^2 + 1?",
		"",
		"Or ask for validation, for example:",
		"Validate this proof: ...",
	].join("\n");
}

export function formatExistingProjectHelp(): string {
	return [
		"A validation run already exists in this workspace.",
		'Say "continue", "show progress", "show report", or "focus on ...".',
	].join("\n");
}

export interface InitialValidationPlanOptions {
	waitForContext?: boolean;
}

export function formatInitialValidationPlan(
	problem: string,
	sourceDisplayName?: string,
	options: InitialValidationPlanOptions = {},
): string {
	const finalStep = options.waitForContext
		? "- Wait for your pasted context before starting the first audit."
		: "- Start with the source audit.";
	return [
		`I’ll set up a source-backed validation run for: ${problem}`,
		"",
		"Plan",
		"- Pin the source and target problem.",
		"- Extract definitions and assumptions before proof attempts.",
		"- Audit proof dependencies, especially support/indexing gaps.",
		finalStep,
		...(sourceDisplayName ? ["", `Source: ${sourceDisplayName}`] : []),
	].join("\n");
}

export function formatWaitingForContext(sourceAuditPrepared: boolean): string {
	return [
		...(sourceAuditPrepared ? [formatSetupStep("Source audit prepared")] : []),
		"",
		"Paste the exact statement, definitions, assumptions, or proof context now — I’ll start validating automatically.",
		'You can also say "continue" to start right away.',
	].join("\n");
}

export function formatReadyForContext(): string {
	return [
		formatSetupStep("Source audit prepared"),
		"",
		"Please paste the question statement, candidate solution, or relevant context.",
		"I’ll start validating automatically once you do.",
	].join("\n");
}

export function formatContextRecorded(): string {
	return "Got it — I’ve added that to the validation context.";
}

export function formatSetupStep(label: string): string {
	return `✓ ${label}`;
}

export function formatBackgroundRunStarted(transcriptPath?: string): string {
	return [
		"→ Running source audit in the background",
		...(transcriptPath ? [`Latest transcript: ${transcriptPath}`] : []),
		"",
		'You can keep steering while it runs. Try: "show progress", "show report", or "focus on ...".',
	].join("\n");
}

export interface CoMathProductActivity {
	stepLabel: string;
	message: string;
	detail?: string;
}

export function formatProductActivity(activity: CoMathProductActivity): string {
	return [
		`${activity.stepLabel} activity`,
		`- ${activity.message}`,
		...(activity.detail ? [`  ${activity.detail}`] : []),
	].join("\n");
}

export function formatFocusNoted(focus: string): string {
	return [`Focus noted: ${focus}.`, "I’ll prioritize that in the next audit step."].join("\n");
}

export function formatSteeringNoted(): string {
	return "Noted. I’ll factor that into the next audit step.";
}

function formatProductRunStatus(status: string | undefined): string {
	if (status === "queued") {
		return "prepared; waiting for you to say continue";
	}
	return status ?? "unknown";
}

export function formatProductProgress(run: CoMathProductRunSummary | undefined): string {
	if (!run) {
		return ["Current progress", "- No audit run has started yet.", '- Say "continue" to start the next step.'].join(
			"\n",
		);
	}
	const blockers = run.blockers ?? [];
	return [
		"Current progress",
		`- Source audit: ${formatProductRunStatus(run.status)}`,
		...(run.background !== undefined ? [`- Running in background: ${run.background ? "yes" : "no"}`] : []),
		...(run.transcriptPath ? [`- Latest transcript: ${run.transcriptPath}`] : []),
		`- Report: ${run.reportId ? "ready" : "none yet"}`,
		...(blockers.length === 0
			? ["- Blockers: none"]
			: ["- Blockers:", ...blockers.map((blocker) => `  - ${sanitizeProductIds(blocker)}`)]),
	].join("\n");
}

export function formatResearchWorkspacePrepared(plan: CoMathResearchAutoPlan): string {
	const firstPath = plan.paths[0];
	return firstPath ? `I’ll start with ${firstPath.title.toLowerCase()}.` : "I’ll start with a concrete research step.";
}

export function formatUserProvidedLiteratureSourceRegistered(input: { title: string }): string {
	return ["Registered source context for Path 5", `- ${input.title}`, "", "Next command", "continue path 5"].join(
		"\n",
	);
}

export type ResearchStateSummaryInput = Pick<CoMathProjectState, "researchPaths" | "researchFocus"> & {
	researchReports?: readonly ResearchWorkstreamReportRecord[];
};

/** Research-state overview shown by `show research state` / `summarize current state`. */
export function formatResearchStateSummary(state: ResearchStateSummaryInput): string {
	const active = state.researchPaths.filter((path) => path.status === "active" || path.status === "promising");
	const blocked = state.researchPaths.filter((path) => path.status === "blocked");
	const abandoned = state.researchPaths.filter((path) => path.status === "abandoned");
	const reports = state.researchReports ?? [];
	const latestReport = reports.at(-1);
	const best = chooseResearchPathFromLatestReport(state, latestReport) ?? chooseResearchPath(state);
	const bestIndex = best ? state.researchPaths.findIndex((path) => path.id === best.id) : -1;
	const recentProgress = latestReport ? formatRecentResearchProgress(state, latestReport) : undefined;
	return [
		"Current research state",
		"",
		...(recentProgress ? ["Recent progress", `- ${recentProgress}`, ""] : []),
		"Active paths",
		...(active.length > 0
			? active.map((path) => formatResearchPathLine(state, path, reports))
			: ["- None right now."]),
		...(blocked.length > 0
			? ["", "Blocked paths", ...blocked.map((path) => formatResearchPathLine(state, path, reports))]
			: []),
		...(abandoned.length > 0
			? ["", "Abandoned for now", ...abandoned.map((path) => `- ${formatResearchPathLabel(state, path)}`)]
			: []),
		"",
		...(best && bestIndex >= 0
			? ["Why", best.suggestedNextMove, "", "Suggested command", `continue path ${bestIndex + 1}`]
			: ["Suggested command", "Choose a path to continue."]),
	].join("\n");
}

export function formatResearchFocusUpdated(path: ResearchPath, reason: string): string {
	return [
		"Focus updated",
		"",
		`I’ll prioritize the ${path.title} path.`,
		"",
		"Reason",
		reason,
		"",
		"Next",
		path.suggestedNextMove,
	].join("\n");
}

export function formatResearchPathDropped(path: ResearchPath, reason: string): string {
	return ["Path updated", "", "Abandoned for now:", `- ${path.title}`, "", "Reason", reason].join("\n");
}

export function formatResearchRoundUpdated(path: ResearchPath, finding: string): string {
	return [
		"Research round updated",
		"",
		"Path",
		path.title,
		"",
		"Finding",
		finding,
		"",
		"Next",
		path.suggestedNextMove,
	].join("\n");
}

export interface FormatResearchRoundCompletedInput {
	state: Pick<CoMathProjectState, "researchPaths">;
	path: ResearchPath;
	findings: readonly string[];
	uncertainties: readonly string[];
	suggestedNextMove: string;
	workingPaperSectionTitle: string;
}

export function formatResearchRoundCompleted(input: FormatResearchRoundCompletedInput): string {
	const uncertainties =
		input.uncertainties.length > 0 ? input.uncertainties : ["No specific uncertainty was recorded for this round."];
	return [
		"Research round completed",
		"",
		formatResearchPathLabel(input.state, input.path),
		"",
		"Findings",
		...input.findings.map((finding) => `- ${finding}`),
		"",
		"Uncertainty",
		...uncertainties.map((uncertainty) => `- ${uncertainty}`),
		"",
		"Next",
		input.suggestedNextMove,
		"",
		"Working paper updated",
		`- Added notes under "${input.workingPaperSectionTitle}."`,
	].join("\n");
}

export type ResearchWorkstreamReportView = Pick<
	ResearchWorkstreamReportRecord,
	| "pathId"
	| "pathTitle"
	| "status"
	| "coordinatorBrief"
	| "steps"
	| "promisingStrategy"
	| "findings"
	| "criticisms"
	| "gaps"
	| "humanHelpUseful"
	| "suggestedNextMove"
	| "workingPaperSectionTitle"
> & {
	sourceIds?: readonly string[];
	claimSupportIds?: readonly string[];
	computationalArtifactIds?: readonly string[];
};

export interface FormatResearchWorkstreamInput {
	state: Pick<CoMathProjectState, "researchPaths"> & {
		literatureSources?: readonly LiteratureSourceArtifact[];
		literatureClaimSupports?: readonly LiteratureClaimSupport[];
		computationalArtifacts?: readonly ComputationalArtifact[];
	};
	report: ResearchWorkstreamReportView;
}

export interface FormatResearchWorkstreamRunInput {
	state: Pick<CoMathProjectState, "researchPaths">;
	run: ResearchWorkstreamRunRecord;
}

export interface FormatResearchBatchInput {
	state: Pick<CoMathProjectState, "researchPaths">;
	batch: ResearchBatchRecord;
	run?: ResearchWorkstreamRunRecord;
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

export function formatResearchWorkstreamStarted(input: FormatResearchWorkstreamInput): string {
	const progress = ["coordinator", "specialist", "critic", "synthesizer"]
		.map((role) => input.report.steps.find((step) => step.role === role))
		.filter((step): step is ResearchWorkstreamReportView["steps"][number] => step !== undefined)
		.map((step) => `- ${step.summary}`);
	return [
		"Research started",
		"",
		formatResearchReportPathLabel(input.state, input.report),
		"",
		"Progress",
		...(progress.length > 0 ? progress : ["- Working through the path."]),
	].join("\n");
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

/** Running progress shown by `show progress` while a research run is active. */
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
	return [`Finished: ${formatResearchStage(input.stage)}.`, sanitizeForegroundStageText(input.summary)].join("\n");
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

export function formatResearchBatchStarted(input: FormatResearchBatchInput): string {
	return [
		`I’ll take ${input.batch.requestedStepCount} research ${input.batch.requestedStepCount === 1 ? "step" : "steps"}.`,
		formatResearchBatchStepCount(input.batch),
		input.batch.nextPathId
			? `First path: ${formatResearchBatchPath(input.state, input.batch.nextPathId)}`
			: "First path: Pi will choose the best available research path.",
	].join("\n");
}

export function formatResearchBatchProgress(input: FormatResearchBatchInput): string {
	const run = input.run;
	return [
		`Research steps ${input.batch.status}`,
		"",
		formatResearchBatchStepCount(input.batch),
		"",
		run ? `Current path: ${formatResearchRunPathLabel(input.state, run)}` : formatResearchBatchNextPathLine(input),
		...(run ? ["", "Current stage", formatResearchStage(run.currentStage)] : []),
		"",
		input.batch.status === "paused"
			? 'This run is paused. Say "resume research" to retry from the last durable boundary.'
			: 'Say "show progress" for the latest status.',
	].join("\n");
}

export function formatResearchBatchStepCompleted(input: FormatResearchBatchInput): string {
	return [
		"Research step completed",
		"",
		formatResearchBatchStepCount(input.batch),
		"",
		formatResearchBatchNextPathLine(input),
	].join("\n");
}

export function formatResearchBatchPaused(input: FormatResearchBatchInput): string {
	return [
		"Research paused",
		"",
		formatResearchBatchStepCount(input.batch),
		"",
		input.run
			? `Interrupted path: ${formatResearchRunPathLabel(input.state, input.run)}`
			: formatResearchBatchNextPathLine(input),
		"",
		"Reason",
		input.run?.failureReason ?? STALE_RESEARCH_WORKSTREAM_RUN_REASON,
		"",
		"Next command",
		"resume research",
	].join("\n");
}

export function formatResearchBatchCompleted(input: FormatResearchBatchInput): string {
	return [
		"Research steps completed",
		"",
		formatResearchBatchStepCount(input.batch),
		"",
		'Say "show latest report" for the latest durable report.',
	].join("\n");
}

export function formatResearchBatchCancelled(input: FormatResearchBatchInput): string {
	return [
		"Research steps cancelled",
		"",
		formatResearchBatchStepCount(input.batch),
		...(input.batch.cancelReason ? ["", "Reason", input.batch.cancelReason] : []),
	].join("\n");
}

export function formatResearchBatchFailed(input: FormatResearchBatchInput): string {
	return [
		"Research steps failed",
		"",
		formatResearchBatchStepCount(input.batch),
		"",
		"Reason",
		input.batch.failureReason ?? "Pi could not choose another research path.",
	].join("\n");
}

export function formatResearchWorkstreamAlreadyRunning(input: FormatResearchWorkstreamRunInput): string {
	return [
		`I’m already working on ${formatResearchRunPathLabel(input.state, input.run)}.`,
		'Say "show progress" to inspect it, or wait for it to finish.',
	].join("\n");
}

/**
 * Beginner-facing summary emitted automatically when a research run finishes. Stays concise: no raw
 * artifact IDs, ends with a concrete next command. The full attempt/critique/artifacts live in
 * {@link formatResearchWorkstreamReport} (`show latest report`).
 */
export function formatResearchWorkstreamCompleted(input: FormatResearchWorkstreamInput): string {
	const { report } = input;
	const computation = formatComputationSummary(input.state, report.computationalArtifactIds ?? []);
	const nextLines = formatResearchCompletionNextLines(input.state, report);
	const mainTakeaway = firstNonEmpty(report.findings, report.promisingStrategy, report.criticisms);
	const limit = firstNonEmpty(report.gaps, report.criticisms);
	return [
		"Finished this step.",
		"",
		formatResearchReportPathLabel(input.state, report),
		"",
		"Main takeaway",
		`- ${mainTakeaway ? stripInlineSourceLabels(mainTakeaway) : "No durable takeaway was recorded yet."}`,
		...(computation.length > 0 ? ["", "Evidence", ...computation.slice(0, 3)] : []),
		...(limit ? ["", "Limit", `- ${stripInlineSourceLabels(limit)}`] : []),
		"",
		"Next",
		...nextLines,
		"",
		`Saved under "${report.workingPaperSectionTitle}".`,
		'Details: say "show latest report".',
	].join("\n");
}

/**
 * Detailed report shown by `show latest report` / `show details for path N`. May expose internal
 * detail (script paths, artifact IDs, attachments) that the beginner completion deliberately omits.
 */
export function formatResearchWorkstreamReport(input: FormatResearchWorkstreamInput): string {
	const { report } = input;
	const coordinator = report.steps.find((step) => step.role === "coordinator");
	const specialist = report.steps.find((step) => step.role === "specialist");
	const critic = report.steps.find((step) => step.role === "critic");
	const supports = formatClaimSupports(input.state, report.claimSupportIds ?? []);
	const references = formatReferences(input.state, report.sourceIds ?? []);
	const computation = formatComputationDetails(input.state, report.computationalArtifactIds ?? []);
	const attachments = formatComputationAttachments(input.state, report.computationalArtifactIds ?? []);
	return [
		"Latest research report",
		"",
		formatResearchReportPathLabel(input.state, report),
		"",
		"Coordinator brief",
		...(coordinator && coordinator.details.length > 0 ? coordinator.details : [report.coordinatorBrief]),
		...(computation.length > 0 ? ["", "Computation", ...computation] : []),
		"",
		specialist?.title ?? "Specialist attempt",
		...bulletsOrFallback(specialist?.details ?? report.findings, "No attempt details were recorded."),
		"",
		critic?.title ?? "Critic review",
		...bulletsOrFallback(critic?.details ?? report.criticisms, "No review details were recorded."),
		"",
		"Synthesis",
		...bulletsOrFallback(report.promisingStrategy, "No synthesized strategy was recorded."),
		...(attachments.length > 0 ? ["", "Attachments", ...attachments] : []),
		...(supports.length > 0 ? ["", "Claim support", ...supports] : []),
		...(references.length > 0 ? ["", "References / attachments", ...references] : []),
		...(report.gaps.length > 0 ? ["", "Needs human attention", ...report.gaps.map((item) => `- ${item}`)] : []),
		...(report.humanHelpUseful.length > 0
			? ["", "Human help useful", ...report.humanHelpUseful.map((item) => `- ${item}`)]
			: []),
		"",
		"Next",
		report.suggestedNextMove,
	].join("\n");
}

export type ResearchCoordinatorReportView = Pick<
	ResearchCoordinatorReportRecord,
	"whatWeKnow" | "roadblocks" | "recommendedNextMoves" | "humanHelpUseful" | "suggestedPathId" | "suggestedPrompt"
>;

export interface FormatResearchCoordinatorReportInput {
	state: Pick<CoMathProjectState, "researchPaths">;
	report: ResearchCoordinatorReportView;
}

export function formatResearchCoordinatorReport(input: FormatResearchCoordinatorReportInput): string {
	const suggested = formatCoordinatorSuggestedNextStep(input);
	return [
		"Project coordinator summary",
		"",
		"What we know",
		...bulletsOrFallback(input.report.whatWeKnow, "No durable findings have been recorded yet."),
		"",
		"Current roadblocks",
		...bulletsOrFallback(input.report.roadblocks, "No current roadblock was identified."),
		"",
		"Recommended next moves",
		...formatCoordinatorNextMoves(input),
		...(input.report.humanHelpUseful.length > 0
			? ["", "Human help useful", ...input.report.humanHelpUseful.map((item) => `- ${item}`)]
			: []),
		"",
		"Suggested next step",
		suggested,
	].join("\n");
}

export function formatLatestResearchCoordinatorReportMissing(): string {
	return 'No project coordinator summary is available yet. Ask "what should we try next?" to create one.';
}

export function formatResearchModelFallbackNote(): string {
	return "I used the local fallback for this round because model-backed research was unavailable.";
}

function bulletsOrFallback(items: readonly string[], fallback: string): string[] {
	return items.length > 0 ? items.map((item) => `- ${item}`) : [`- ${fallback}`];
}

function firstNonEmpty(...groups: readonly string[][]): string | undefined {
	for (const group of groups) {
		const item = group.find((candidate) => candidate.trim().length > 0);
		if (item) {
			return item;
		}
	}
	return undefined;
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

function formatCoordinatorNextMoves(input: FormatResearchCoordinatorReportInput): string[] {
	if (input.report.recommendedNextMoves.length === 0) {
		return ["1. Choose a research path to continue."];
	}
	return input.report.recommendedNextMoves.map((move, index) => {
		const path = move.pathId
			? input.state.researchPaths.find((candidate) => candidate.id === move.pathId)
			: undefined;
		const pathPrefix = path ? `Continue ${formatResearchPathLabel(input.state, path)}: ` : "";
		const title = move.title.replace(/^continue\s+path\s+\d+\s*:?\s*/i, "").trim();
		return `${index + 1}. ${pathPrefix}${title}${move.rationale ? ` - ${move.rationale}` : ""}`;
	});
}

function formatCoordinatorSuggestedNextStep(input: FormatResearchCoordinatorReportInput): string {
	if (input.report.suggestedPrompt) {
		return input.report.suggestedPrompt;
	}
	const suggestedPath = input.report.suggestedPathId
		? input.state.researchPaths.find((path) => path.id === input.report.suggestedPathId)
		: undefined;
	if (suggestedPath) {
		const index = input.state.researchPaths.findIndex((path) => path.id === suggestedPath.id);
		return `continue path ${index + 1}`;
	}
	const firstMove = input.report.recommendedNextMoves[0];
	const firstMovePath = firstMove?.pathId
		? input.state.researchPaths.find((path) => path.id === firstMove.pathId)
		: undefined;
	if (firstMovePath) {
		const index = input.state.researchPaths.findIndex((path) => path.id === firstMovePath.id);
		return `continue path ${index + 1}`;
	}
	return firstMove?.prompt ?? "Choose one recommended move.";
}

function formatReferences(
	state: Pick<CoMathProjectState, "researchPaths"> & {
		literatureSources?: readonly LiteratureSourceArtifact[];
	},
	sourceIds: readonly string[],
	options: { includeIds?: boolean } = {},
): string[] {
	const sourceById = new Map((state.literatureSources ?? []).map((source) => [source.id, source]));
	const includeIds = options.includeIds ?? true;
	return sourceIds
		.map((sourceId) => {
			const source = sourceById.get(sourceId);
			if (!source) {
				return undefined;
			}
			const locator = source.url ?? source.path ?? source.kind;
			const label = includeIds ? `${source.id}: ${source.title}` : source.title;
			return `- ${label}${locator ? ` — ${locator}` : ""}`;
		})
		.filter((line): line is string => line !== undefined);
}

function formatClaimSupports(
	state: Pick<CoMathProjectState, "researchPaths"> & {
		literatureClaimSupports?: readonly LiteratureClaimSupport[];
	},
	claimSupportIds: readonly string[],
	options: { includeSourceIds?: boolean } = {},
): string[] {
	const supportById = new Map((state.literatureClaimSupports ?? []).map((support) => [support.id, support]));
	const includeSourceIds = options.includeSourceIds ?? true;
	return claimSupportIds
		.map((supportId) => {
			const support = supportById.get(supportId);
			if (!support) {
				return undefined;
			}
			const sources = includeSourceIds && support.sourceIds.length > 0 ? ` (${support.sourceIds.join(", ")})` : "";
			const claim = includeSourceIds ? support.claim : stripInlineSourceLabels(support.claim);
			const noteText = includeSourceIds
				? support.note
				: support.note
					? stripInlineSourceLabels(support.note)
					: undefined;
			const note = noteText ? ` — ${noteText}` : "";
			return `- ${support.status}: ${claim}${sources}${note}`;
		})
		.filter((line): line is string => line !== undefined);
}

/**
 * Beginner-facing computation summary for the automatic completion message. Intentionally omits raw
 * artifact IDs and file paths so the completion stays product-clean; the script path, command, and
 * output live in the detailed `show latest report` view (see {@link formatComputationDetails}).
 */
function formatComputationSummary(
	state: Pick<CoMathProjectState, "researchPaths"> & {
		computationalArtifacts?: readonly ComputationalArtifact[];
	},
	artifactIds: readonly string[],
): string[] {
	const artifacts = getComputationalArtifactsByIds(state, artifactIds);
	if (artifacts.length === 0) {
		return [];
	}
	const script = artifacts.find((artifact) => artifact.kind === "script");
	const result =
		artifacts.find((artifact) => artifact.kind === "stdout") ??
		artifacts.find((artifact) => artifact.kind === "summary");
	const exitCode = result?.exitCode ?? script?.exitCode;
	const checkedRange = result?.summary
		.split("\n")
		.map((line) => line.trim())
		.find((line) => /^checked_range:/i.test(line));
	return [
		...(script ? ["- Ran a small bounded script and recorded its output."] : []),
		...(checkedRange ? [`- Checked range: ${checkedRange.replace(/^checked_range:\s*/i, "")}`] : []),
		...(exitCode !== undefined ? [`- Exit code: ${exitCode}`] : []),
		...(script || result ? ['- Full script and output: say "show latest report".'] : []),
	];
}

function formatComputationDetails(
	state: Pick<CoMathProjectState, "researchPaths"> & {
		computationalArtifacts?: readonly ComputationalArtifact[];
	},
	artifactIds: readonly string[],
): string[] {
	const artifacts = getComputationalArtifactsByIds(state, artifactIds);
	if (artifacts.length === 0) {
		return [];
	}
	const script = artifacts.find((artifact) => artifact.kind === "script");
	const result =
		artifacts.find((artifact) => artifact.kind === "stdout") ??
		artifacts.find((artifact) => artifact.kind === "summary");
	const diagnostics = artifacts.find((artifact) => artifact.kind === "stderr");
	return [
		...(script?.filePath ? [`- Script: ${script.filePath}`] : script ? [`- Script: ${script.id}`] : []),
		...(script?.command ? [`- Command: ${script.command}`] : []),
		...(result?.exitCode !== undefined ? [`- Exit code: ${result.exitCode}`] : []),
		...(result ? [`- Result summary: ${summarizeArtifactText(result.summary)}`] : []),
		...(diagnostics ? [`- Diagnostics: ${summarizeArtifactText(diagnostics.summary)}`] : []),
	];
}

function formatComputationAttachments(
	state: Pick<CoMathProjectState, "researchPaths"> & {
		computationalArtifacts?: readonly ComputationalArtifact[];
	},
	artifactIds: readonly string[],
): string[] {
	return getComputationalArtifactsByIds(state, artifactIds).map((artifact) => {
		const locator = artifact.filePath ? ` — ${artifact.filePath}` : "";
		const exitCode = artifact.exitCode !== undefined ? ` — exit code ${artifact.exitCode}` : "";
		return `- ${artifact.id}: ${artifact.kind}${locator}${exitCode}`;
	});
}

function getComputationalArtifactsByIds(
	state: Pick<CoMathProjectState, "researchPaths"> & {
		computationalArtifacts?: readonly ComputationalArtifact[];
	},
	artifactIds: readonly string[],
): ComputationalArtifact[] {
	const selectedIds = new Set(artifactIds);
	return (state.computationalArtifacts ?? []).filter((artifact) => selectedIds.has(artifact.id));
}

function summarizeArtifactText(summary: string): string {
	const trimmed = summary.trim().replace(/\s+/g, " ");
	if (trimmed.length <= 240) {
		return trimmed;
	}
	return `${trimmed.slice(0, 237)}...`;
}

function formatResearchReportPathLabel(
	state: Pick<CoMathProjectState, "researchPaths">,
	report: Pick<ResearchWorkstreamReportView, "pathId" | "pathTitle">,
): string {
	const pathIndex = state.researchPaths.findIndex((candidate) => candidate.id === report.pathId);
	return pathIndex >= 0 ? `Path ${pathIndex + 1}: ${report.pathTitle}` : report.pathTitle;
}

function formatResearchRunPathLabel(
	state: Pick<CoMathProjectState, "researchPaths">,
	run: Pick<ResearchWorkstreamRunRecord, "pathId" | "pathTitle">,
): string {
	const pathIndex = state.researchPaths.findIndex((candidate) => candidate.id === run.pathId);
	return pathIndex >= 0 ? `Path ${pathIndex + 1}: ${run.pathTitle}` : run.pathTitle;
}

function formatResearchBatchStepCount(batch: ResearchBatchRecord): string {
	return `Progress: ${batch.completedStepCount}/${batch.requestedStepCount} steps`;
}

function formatResearchBatchNextPathLine(input: FormatResearchBatchInput): string {
	if (input.batch.nextPathId) {
		return `Next path: ${formatResearchBatchPath(input.state, input.batch.nextPathId)}`;
	}
	return "Next path: Pi will choose the best available research path.";
}

function formatResearchBatchPath(state: Pick<CoMathProjectState, "researchPaths">, pathId: string): string {
	const path = state.researchPaths.find((candidate) => candidate.id === pathId);
	if (!path) {
		return "selected path";
	}
	const index = state.researchPaths.findIndex((candidate) => candidate.id === path.id);
	return index >= 0 ? `Path ${index + 1}: ${path.title}` : path.title;
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

function formatResearchPathLine(
	state: Pick<CoMathProjectState, "researchPaths">,
	path: ResearchPath,
	reports: readonly ResearchWorkstreamReportRecord[],
): string {
	const findings = path.latestFindings.slice(-3);
	const pathIndex = state.researchPaths.findIndex((candidate) => candidate.id === path.id);
	const hasReport = reports.some((report) => report.pathId === path.id);
	return [
		`- ${formatResearchPathLabel(state, path)}: ${path.status}`,
		...(findings.length > 0 ? ["  Latest findings", ...findings.map((finding) => `  - ${finding}`)] : []),
		`  Why: ${path.suggestedNextMove}`,
		...(pathIndex >= 0 ? [`  Next: continue path ${pathIndex + 1}`] : []),
		...(hasReport && pathIndex >= 0 ? [`  Report: available; say "show details for path ${pathIndex + 1}".`] : []),
	].join("\n");
}

function formatResearchPathLabel(state: Pick<CoMathProjectState, "researchPaths">, path: ResearchPath): string {
	const pathIndex = state.researchPaths.findIndex((candidate) => candidate.id === path.id);
	return pathIndex >= 0 ? `Path ${pathIndex + 1}: ${path.title}` : path.title;
}

function chooseNextResearchPathAfter(
	state: Pick<CoMathProjectState, "researchPaths">,
	report: Pick<ResearchWorkstreamReportView, "pathId" | "pathTitle">,
): ResearchPath | undefined {
	const title = normalizeResearchPathTitle(report.pathTitle);
	if (title === "reformulation") {
		return findActiveResearchPathByTitle(state, "weaker special cases");
	}
	if (title === "weaker special cases") {
		return findActiveResearchPathByTitle(state, "direct proof attempt");
	}
	if (title === "known theorem or literature reduction") {
		return undefined;
	}
	const completedIndex = state.researchPaths.findIndex((path) => path.id === report.pathId);
	const isCandidate = (path: ResearchPath): boolean =>
		path.id !== report.pathId && (path.status === "active" || path.status === "promising");
	const after = state.researchPaths.slice(completedIndex + 1).find(isCandidate);
	return after ?? state.researchPaths.find(isCandidate);
}

function formatResearchCompletionNextLines(
	state: Pick<CoMathProjectState, "researchPaths">,
	report: Pick<ResearchWorkstreamReportView, "pathId" | "pathTitle">,
): string[] {
	if (normalizeResearchPathTitle(report.pathTitle) === "known theorem or literature reduction") {
		return ["Ask the coordinator for the next useful move:", "what should we try next?"];
	}
	const nextPath = chooseNextResearchPathAfter(state, report);
	const nextPathIndex = nextPath ? state.researchPaths.findIndex((path) => path.id === nextPath.id) : -1;
	if (nextPath && nextPathIndex >= 0) {
		return [describeNextPathHint(nextPath), `continue path ${nextPathIndex + 1}`];
	}
	return ['Say "show latest report" to review the full write-up.'];
}

function describeNextPathHint(path: ResearchPath): string {
	const title = normalizeResearchPathTitle(path.title);
	if (title === "weaker special cases") {
		return "Turn this into smaller targets:";
	}
	if (title === "direct proof attempt") {
		return "Use these lemmas in a proof attempt:";
	}
	if (/proof/i.test(path.title)) {
		return "Try a proof-oriented path:";
	}
	if (isLiteraturePathTitle(path.title)) {
		return "Try a source-backed path:";
	}
	if (isComputationalPathTitle(path.title)) {
		return "Try the examples path:";
	}
	return "Try the next path:";
}

function chooseResearchPathFromLatestReport(
	state: Pick<CoMathProjectState, "researchPaths">,
	report: Pick<ResearchWorkstreamReportRecord, "pathTitle"> | undefined,
): ResearchPath | undefined {
	if (!report) {
		return undefined;
	}
	const title = normalizeResearchPathTitle(report.pathTitle);
	if (title === "reformulation") {
		return findActiveResearchPathByTitle(state, "weaker special cases");
	}
	if (title === "weaker special cases") {
		return findActiveResearchPathByTitle(state, "direct proof attempt");
	}
	return undefined;
}

function formatRecentResearchProgress(
	state: Pick<CoMathProjectState, "researchPaths">,
	report: Pick<ResearchWorkstreamReportRecord, "pathId" | "pathTitle">,
): string {
	const label = formatResearchReportPathLabel(state, report);
	const title = normalizeResearchPathTitle(report.pathTitle);
	if (title === "reformulation") {
		return `${label} reframed the problem as prime values of n^2 + 1 and reduced attention to even n / 4m^2 + 1.`;
	}
	if (title === "weaker special cases") {
		return `${label} isolated weaker targets: parity lemma, even reduction, finite evidence, and small-prime obstruction checks.`;
	}
	return `${label} recorded a research update.`;
}

function findActiveResearchPathByTitle(
	state: Pick<CoMathProjectState, "researchPaths">,
	title: string,
): ResearchPath | undefined {
	const normalizedTitle = normalizeResearchPathTitle(title);
	return state.researchPaths.find(
		(path) =>
			normalizeResearchPathTitle(path.title) === normalizedTitle &&
			(path.status === "active" || path.status === "promising"),
	);
}

function normalizeResearchPathTitle(title: string): string {
	return title.trim().replace(/\s+/g, " ").toLowerCase();
}

function chooseResearchPath(
	state: Pick<CoMathProjectState, "researchPaths" | "researchFocus">,
): ResearchPath | undefined {
	const focused = state.researchFocus?.pathIds
		.map((pathId) => state.researchPaths.find((path) => path.id === pathId))
		.find((path): path is ResearchPath => path !== undefined && path.status !== "abandoned");
	if (focused) {
		return focused;
	}
	return [...state.researchPaths]
		.filter((path) => path.status === "active" || path.status === "promising")
		.sort((a, b) => a.priority - b.priority)[0];
}
