import { sanitizeProductIds } from "./comath-backend-output.ts";
import type { CoMathResearchAutoPlan } from "./comath-research-autoplan.ts";
import { type CoMathSource, isUsableCoMathSource } from "./comath-source.ts";
import type {
	CoMathProjectState,
	ComputationalArtifact,
	LiteratureClaimSupport,
	LiteratureSourceArtifact,
	ResearchBatchRecord,
	ResearchConstraintRecord,
	ResearchCoordinatorReportRecord,
	ResearchEvidenceBoardEntry,
	ResearchObligationRecord,
	ResearchPath,
	ResearchPivotRecord,
	ResearchPlanRecord,
	ResearchPlanTaskRecord,
	ResearchWorkstreamReportRecord,
	ResearchWorkstreamRunRecord,
	TheoremApplicabilityCheckRecord,
} from "./schema.ts";
import { STALE_RESEARCH_WORKSTREAM_RUN_REASON } from "./storage.ts";

export type {
	CoMathResearchActivityPhase,
	FormatCoMathResearchActivityStatusInput,
	FormatResearchWorkstreamStageCompletedInput,
	FormatResearchWorkstreamStageStartedInput,
} from "./comath-foreground-progress.ts";
export {
	formatCoMathActivityElapsed,
	formatCoMathResearchActivityStatus,
	formatCoMathResearchPhaseActivityStatus,
	formatCoMathResearchStepActivityStatus,
	formatResearchWorkstreamRunStarted,
	formatResearchWorkstreamStageCompleted,
	formatResearchWorkstreamStageStarted,
} from "./comath-foreground-progress.ts";

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
	if (!isUsableCoMathSource(source)) {
		return [
			"Pi is ready to help validate mathematical work.",
			`Source warning: ${source.input}`,
			source.missingReason ?? "Source path is not readable.",
			"",
			"Describe the problem you want to investigate.",
		].join("\n");
	}
	const sourceLabel = source.isDirectory
		? `Source directory: ${source.displayName} (${source.files?.length ?? 0} files selected)`
		: `Source: ${source.displayName}`;
	return [
		"Pi is ready to help validate mathematical work.",
		sourceLabel,
		...(source.truncated ? ["Source selection reached its configured safety limits."] : []),
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

export function formatCoMathResearchModeOperationalPromptIgnored(): string {
	return [
		"This Pi session is focused on math research.",
		"",
		"I did not run that as a shell or git command. Describe the mathematical direction you want me to try next.",
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

export function formatResearchWorkspacePrepared(plan: CoMathResearchAutoPlan, initialPathTitle?: string): string {
	const title =
		initialPathTitle ?? plan.paths.find((path) => path.slug === plan.initialFocusSlug)?.title ?? plan.paths[0]?.title;
	return title ? `I’ll start with ${title.toLowerCase()}.` : "I’ll start with a concrete research step.";
}

export function formatUserProvidedLiteratureSourceRegistered(input: { title: string }): string {
	return [
		"Registered source context for Path 5",
		`- ${input.title}`,
		"",
		"I can use this in the source-backed literature path next.",
	].join("\n");
}

export type ResearchStateSummaryInput = Pick<CoMathProjectState, "researchPaths" | "researchFocus"> & {
	researchReports?: readonly ResearchWorkstreamReportRecord[];
	researchConstraints?: readonly ResearchConstraintRecord[];
	theoremApplicabilityChecks?: readonly TheoremApplicabilityCheckRecord[];
	researchPivots?: readonly ResearchPivotRecord[];
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
		...formatStandingConstraintLines(state.researchConstraints ?? []),
		...formatTheoremCheckLines(state.theoremApplicabilityChecks ?? []),
		...formatRoutePivotLines(state.researchPivots ?? []),
		"",
		...(best && bestIndex >= 0
			? [
					"Why",
					best.suggestedNextMove,
					"",
					"Suggested next step",
					`I can work on ${formatResearchPathLabel(state, best)} next.`,
				]
			: ["Suggested next step", "Choose a path to explore next."]),
	].join("\n");
}

function formatStandingConstraintLines(constraints: readonly ResearchConstraintRecord[]): string[] {
	const active = constraints.filter((constraint) => constraint.status === "active");
	if (active.length === 0) {
		return [];
	}
	return ["", "Standing constraints", ...active.slice(-4).map((constraint) => `- ${constraint.text}`)];
}

function formatTheoremCheckLines(checks: readonly TheoremApplicabilityCheckRecord[]): string[] {
	if (checks.length === 0) {
		return [];
	}
	return [
		"",
		"Theorem checks",
		...checks
			.slice(-3)
			.map(
				(check) =>
					`- ${check.theorem}: ${formatTheoremCheckStatus(check.status)}${check.consequence ? ` — ${check.consequence}` : ""}`,
			),
	];
}

function formatTheoremCheckStatus(status: TheoremApplicabilityCheckRecord["status"]): string {
	if (status === "applies") {
		return "applies to our object";
	}
	if (status === "rejected-as-direct-route") {
		return "does not apply directly";
	}
	return "still needs verification";
}

function formatRoutePivotLines(pivots: readonly ResearchPivotRecord[]): string[] {
	if (pivots.length === 0) {
		return [];
	}
	return [
		"",
		"Route changes",
		...pivots.slice(-3).map((pivot) => `- Dropped "${pivot.fromRoute}" for "${pivot.toRoute}": ${pivot.reason}`),
	];
}

export interface FormatDifferentResearchQuestionDetectedInput {
	currentQuestion: string;
	newQuestion: string;
}

/**
 * Shown when a prompt looks like a brand-new research question while this workspace is already
 * researching a different one. Nothing is changed: mixing two problems in one workspace silently
 * corrupts the durable research state.
 */
export function formatDifferentResearchQuestionDetected(input: FormatDifferentResearchQuestionDetectedInput): string {
	return [
		"That looks like a new research question, not steering for the current one.",
		"",
		"This workspace is researching:",
		`- ${input.currentQuestion}`,
		"You asked:",
		`- ${input.newQuestion}`,
		"",
		"I have not changed the current research, so the two problems stay separate.",
		"To explore the new question, start Pi in a fresh directory and ask it there.",
		'If you meant to steer the current research, phrase it as an instruction, for example: "focus on path 3" or "check the residues modulo 4".',
	].join("\n");
}

/** Confirms a standing constraint was made durable and will steer every later step. */
export function formatResearchConstraintRecorded(text: string): string {
	return [
		"Standing constraint recorded",
		"",
		`- ${text}`,
		"",
		'Every research step will see this and work around it. Say "show research state" to review the active constraints.',
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

export interface FormatResearchNaturalSteeringInput {
	state: Pick<CoMathProjectState, "researchPaths">;
	path?: ResearchPath;
	prompt: string;
}

export function formatResearchNaturalSteeringStarted(input: FormatResearchNaturalSteeringInput): string {
	return [
		"I’ll use that in the next attempt.",
		"",
		"Steering",
		`- ${summarizeSteeringText(input.prompt)}`,
		...(input.path ? ["", "Working on", formatResearchPathLabel(input.state, input.path)] : []),
	].join("\n");
}

export function formatResearchNaturalSteeringQueued(input: FormatResearchNaturalSteeringInput): string {
	return [
		"I’ve saved that as steering for the math work already in progress.",
		"",
		"Steering",
		`- ${summarizeSteeringText(input.prompt)}`,
		...(input.path ? ["", "Focus", formatResearchPathLabel(input.state, input.path)] : []),
	].join("\n");
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
		researchEvidenceBoard?: readonly ResearchEvidenceBoardEntry[];
		computationalArtifacts?: readonly ComputationalArtifact[];
	};
	report: ResearchWorkstreamReportView;
}

export interface FormatResearchBatchInput {
	state: Pick<CoMathProjectState, "researchPaths">;
	batch: ResearchBatchRecord;
	run?: ResearchWorkstreamRunRecord;
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

export function formatResearchBatchStarted(input: FormatResearchBatchInput): string {
	return [
		`I’ll take ${input.batch.requestedStepCount} research ${input.batch.requestedStepCount === 1 ? "step" : "steps"}.`,
		formatResearchBatchStepCount(input.batch),
		input.batch.nextPathId
			? `First path: ${formatResearchBatchPath(input.state, input.batch.nextPathId)}`
			: "I’ll work through the research plan, creating one if needed.",
		'I’ll pause when these are done — say "continue" or "work the plan for N steps" to go further.',
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

/**
 * Announced when a plan finished but the user's step budget still has room and durable state
 * offers new work: the run continues into the next derived round instead of stopping at a status
 * summary.
 */
export function formatResearchBatchContinuation(input: FormatResearchBatchInput): string {
	return [
		"The plan finished with steps left in the budget.",
		"",
		formatResearchBatchStepCount(input.batch),
		"",
		"What was just learned points to further concrete work, so I'm deriving the next round and continuing.",
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

export interface FormatResearchBatchCompletedInput extends FormatResearchBatchInput {
	/** Plan tasks still pending or blocked when the step budget ran out. */
	remainingPlanTaskCount?: number;
	/** True when the plan is done and durable state offers no further runnable line of work. */
	linesOfWorkExhausted?: boolean;
}

export function formatResearchBatchCompleted(input: FormatResearchBatchCompletedInput): string {
	const remaining = input.remainingPlanTaskCount ?? 0;
	return [
		"Research steps completed",
		"",
		formatResearchBatchStepCount(input.batch),
		"",
		...(remaining > 0
			? [
					`The step budget ran out with ${remaining === 1 ? "1 plan task" : `${remaining} plan tasks`} still waiting.`,
					'Say "continue the plan" to work the remaining tasks, or "show plan" to review them first.',
				]
			: input.linesOfWorkExhausted
				? [
						"The plan is complete and the current lines of work are exhausted; new guidance or a sharper question would open new ones.",
						'Say "show latest report" for the latest durable report.',
					]
				: ['Say "show latest report" for the latest durable report.']),
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

export interface FormatResearchPlanInput {
	plan: ResearchPlanRecord;
	tasks: readonly ResearchPlanTaskRecord[];
}

export interface FormatResearchPlanTaskInput extends FormatResearchPlanInput {
	task: ResearchPlanTaskRecord;
}

export function formatResearchPlanCreated(input: FormatResearchPlanInput): string {
	return [
		"Research plan created",
		"",
		"Objective",
		input.plan.objective,
		"",
		"Tasks",
		...formatResearchPlanTaskLines(input.tasks),
		"",
		'Say "work the plan for 3 steps" to start, or "show plan" any time.',
	].join("\n");
}

/** Plan overview shown by `show plan` / `what is the plan` / plan-first `show progress`. */
export function formatResearchPlanSummary(input: FormatResearchPlanInput): string {
	const completed = input.tasks.filter((task) => task.status === "completed").length;
	return [
		"Research plan",
		"",
		formatResearchPlanProgressLine(input.tasks),
		"",
		"Tasks",
		...formatResearchPlanTaskLines(input.tasks),
		"",
		...(input.plan.status === "paused"
			? [
					"This plan is paused.",
					...(input.plan.pauseReason ? [`Reason: ${input.plan.pauseReason}`] : []),
					'Say "resume plan" to retry from the last completed task.',
				]
			: input.plan.status === "completed"
				? ['All plan tasks are done. Say "show latest report" for the newest findings.']
				: completed < input.tasks.length
					? ['Say "continue the plan" to work the next task.']
					: ['Say "make a plan" to plan the next round of work.']),
	].join("\n");
}

export function formatResearchPlanTaskStarted(input: FormatResearchPlanTaskInput): string {
	return `Working on task ${input.task.sequence} of ${input.tasks.length}: ${input.task.title}.`;
}

export function formatResearchPlanTaskCompleted(input: FormatResearchPlanTaskInput): string {
	return [
		`Finished task ${input.task.sequence} of ${input.tasks.length}: ${input.task.title}.`,
		...(input.task.progressKind ? [formatTaskProgressKindLine(input.task.progressKind)] : []),
		formatResearchPlanProgressLine(input.tasks),
	].join("\n");
}

function formatTaskProgressKindLine(progressKind: NonNullable<ResearchPlanTaskRecord["progressKind"]>): string {
	if (progressKind === "mathematical") {
		return "This step produced new mathematical content.";
	}
	if (progressKind === "obstruction") {
		return "This step recorded why a route fails; later planning will steer around it.";
	}
	return "This step produced status and context only.";
}

export function formatResearchPlanPaused(input: FormatResearchPlanInput & { reason?: string }): string {
	return [
		"Plan paused",
		"",
		formatResearchPlanProgressLine(input.tasks),
		"",
		"Reason",
		input.reason ?? input.plan.pauseReason ?? "The current task could not finish.",
		"",
		"Next command",
		"resume plan",
	].join("\n");
}

export function formatResearchPlanCompleted(input: FormatResearchPlanInput): string {
	return [
		"Research plan completed",
		"",
		formatResearchPlanProgressLine(input.tasks),
		"",
		'Say "show latest report" for the newest findings, or "make a plan" to plan the next round.',
	].join("\n");
}

/**
 * A review rejection that blocked one step without pausing the plan: the remaining planned tasks
 * are usually exactly the work the review's diagnosis calls for, so execution moves on to them
 * instead of retrying a step that would meet the same review again.
 */
export function formatResearchPlanTaskRejectedContinuing(input: FormatResearchPlanTaskInput): string {
	return [
		`The independent review did not accept task ${input.task.sequence} of ${input.tasks.length}: ${input.task.title}.`,
		"",
		"Reason",
		input.task.blockedReason ?? "The review found the step's acceptance criteria unmet.",
		"",
		"The rejection and its concerns are recorded with the step. Moving on to the next planned task instead of retrying the same step.",
	].join("\n");
}

export function formatResearchPlanBlocked(input: FormatResearchPlanTaskInput): string {
	return [
		`Task ${input.task.sequence} of ${input.tasks.length} is blocked: ${input.task.title}.`,
		"",
		"Reason",
		input.task.blockedReason ?? "The task could not proceed with what is currently known.",
		"",
		'The plan is paused. Say "resume plan" to retry, or steer me toward a different direction.',
	].join("\n");
}

export function formatResearchPlanMissing(): string {
	return 'No research plan exists yet. Say "make a plan" to create one.';
}

export interface FormatResearchPlanAmendedInput extends FormatResearchPlanInput {
	addedTitles: readonly string[];
	cancelledTitles: readonly string[];
	reason?: string;
}

/** Announces a director amendment so direction changes are always visible to the user. */
export function formatResearchPlanAmended(input: FormatResearchPlanAmendedInput): string {
	return [
		"Plan updated based on what was just learned.",
		...(input.reason ? ["", "Why", input.reason] : []),
		...(input.addedTitles.length > 0 ? ["", "Added", ...input.addedTitles.map((title) => `- ${title}`)] : []),
		...(input.cancelledTitles.length > 0
			? ["", "No longer needed", ...input.cancelledTitles.map((title) => `- ${title}`)]
			: []),
		"",
		formatResearchPlanProgressLine(input.tasks),
		'Say "show plan" to see the updated plan.',
	].join("\n");
}

export interface FormatSkepticReviewCompletedInput {
	concerns: readonly string[];
	counterexampleFound: boolean;
}

/** Summary of the independent review of a finished step; concise, no internal ids. */
export function formatSkepticReviewCompleted(input: FormatSkepticReviewCompletedInput): string {
	return [
		input.counterexampleFound
			? "Independent review found a counterexample to this step's central claim."
			: "Independent review raised concerns about this step.",
		...(input.concerns.length > 0 ? ["", "Concerns", ...input.concerns.map((concern) => `- ${concern}`)] : []),
		"",
		input.counterexampleFound
			? "The check and its output are saved with this step. Re-examine the claim before building on it."
			: "These are recorded with the step's evidence so later work can address them.",
	].join("\n");
}

const OBLIGATION_STATUS_ORDER = ["established", "supported", "open", "refuted", "retired"] as const;

const OBLIGATION_STATUS_LABELS: Record<ResearchObligationRecord["status"], string> = {
	established: "established (reviewed and supported)",
	supported: "supported (evidence recorded, not established yet)",
	open: "open (no usable support yet)",
	refuted: "refuted",
	retired: "superseded",
};

/**
 * Ledger of what the project owes mathematically, shown by `show obligations`. Only established
 * claims read as settled; speculative and refuted statements stay visible with their gaps so the
 * durable math state is never flattered by the copy.
 */
export function formatResearchObligationsSummary(state: {
	researchObligations: readonly ResearchObligationRecord[];
}): string {
	const obligations = state.researchObligations;
	if (obligations.length === 0) {
		return 'No claims are on the ledger yet. Say "work the plan for 3 steps" to make progress first.';
	}
	const ordered = [...obligations].sort(
		(a, b) => OBLIGATION_STATUS_ORDER.indexOf(a.status) - OBLIGATION_STATUS_ORDER.indexOf(b.status),
	);
	const lines: string[] = ["What the research owes and where it stands", ""];
	for (const obligation of ordered) {
		lines.push(`- ${stripInlineSourceLabels(obligation.statement)} — ${OBLIGATION_STATUS_LABELS[obligation.status]}`);
		if (obligation.statusReason) {
			lines.push(`  Why: ${stripInlineSourceLabels(obligation.statusReason)}`);
		}
		for (const gap of obligation.gaps.slice(0, 3)) {
			lines.push(`  Gap: ${stripInlineSourceLabels(gap)}`);
		}
		if (obligation.gaps.length > 3) {
			lines.push(`  (${obligation.gaps.length - 3} more gaps recorded)`);
		}
	}
	return lines.join("\n");
}

export interface FormatConjectureRefutedInput {
	/** Human-readable line of the evidence that points against the statement. */
	evidenceHint?: string;
	/** Whether a revision step is already planned. */
	revisionPlanned: boolean;
}

/** Announces that durable evidence now points against the statement as written. */
export function formatConjectureRefuted(input: FormatConjectureRefutedInput): string {
	return [
		"The evidence now points against the statement as written.",
		...(input.evidenceHint ? ["", "What failed", `- ${stripInlineSourceLabels(input.evidenceHint)}`] : []),
		"",
		input.revisionPlanned
			? "A step to repair the statement is already planned; the refuted version stays on record."
			: 'The refuted version stays on record. Say "show evidence" for the details.',
	].join("\n");
}

export interface FormatConjectureRevisedInput {
	state: { researchEvidenceBoard: readonly ResearchEvidenceBoardEntry[] };
	revisedEntryIds: readonly string[];
}

/** Announces the revised statement(s) recorded by a revision step. */
export function formatConjectureRevised(input: FormatConjectureRevisedInput): string {
	const revised = input.state.researchEvidenceBoard.filter((entry) => input.revisedEntryIds.includes(entry.id));
	return [
		"I revised the statement to fit the evidence.",
		"",
		revised.length === 1 ? "New statement" : "New statements",
		...revised.map(
			(entry) => `- ${stripInlineSourceLabels(entry.claim)}${entry.revisionKind ? ` (${entry.revisionKind})` : ""}`,
		),
		"",
		'The earlier version stays on record with what refuted it. Say "show lineage" to see how the statement evolved.',
	].join("\n");
}

/** Indented revision tree shown by `show lineage`; concise product copy without internal ids. */
export function formatConjectureLineage(state: {
	researchEvidenceBoard: readonly ResearchEvidenceBoardEntry[];
}): string {
	const entries = state.researchEvidenceBoard;
	const linked = new Set<string>();
	for (const entry of entries) {
		if (entry.parentEntryId && entries.some((candidate) => candidate.id === entry.parentEntryId)) {
			linked.add(entry.id);
			linked.add(entry.parentEntryId);
		}
	}
	if (linked.size === 0) {
		return "The statement hasn't needed revision yet.";
	}
	const roots = entries.filter(
		(entry) => linked.has(entry.id) && (!entry.parentEntryId || !entries.some((e) => e.id === entry.parentEntryId)),
	);
	const lines: string[] = ["How the statement evolved", ""];
	const seen = new Set<string>();
	const renderNode = (entry: ResearchEvidenceBoardEntry, depth: number): void => {
		if (seen.has(entry.id)) {
			return;
		}
		seen.add(entry.id);
		const children = entries.filter((candidate) => candidate.parentEntryId === entry.id);
		const status = children.length > 0 ? "superseded" : "current";
		// A child's revisionNote records what refuted its parent.
		const refutedBy = children.find((child) => child.revisionNote)?.revisionNote;
		const detail =
			status === "superseded"
				? `superseded${refutedBy ? ` — ${stripInlineSourceLabels(refutedBy)}` : ""}`
				: `current${entry.revisionKind ? ` (${entry.revisionKind})` : ""}`;
		lines.push(`${"  ".repeat(depth)}- ${stripInlineSourceLabels(entry.claim)} — ${detail}`);
		for (const child of children) {
			renderNode(child, depth + 1);
		}
	};
	for (const root of roots) {
		renderNode(root, 0);
	}
	return lines.join("\n");
}

export function formatResearchPlanExecutionStarted(
	input: FormatResearchPlanInput & { requestedTaskCount: number },
): string {
	const nextTask = input.tasks.find((task) => task.status === "pending");
	return [
		`I’ll work ${input.requestedTaskCount} plan task${input.requestedTaskCount === 1 ? "" : "s"}.`,
		formatResearchPlanProgressLine(input.tasks),
		...(nextTask ? [`Next task: ${nextTask.title}`] : []),
	].join("\n");
}

/** Evidence-board overview shown by `show evidence`; concise product copy without internal ids. */
export function formatResearchEvidenceBoardSummary(
	state: Pick<CoMathProjectState, "researchPaths"> & {
		researchEvidenceBoard?: readonly ResearchEvidenceBoardEntry[];
	},
): string {
	const entries = state.researchEvidenceBoard ?? [];
	if (entries.length === 0) {
		return 'No evidence has been recorded yet. Say "work the plan for 3 steps" to gather some.';
	}
	const superseded = new Set(
		entries.map((entry) => entry.parentEntryId).filter((id): id is string => id !== undefined),
	);
	// Refuting evidence is what the user must not miss; it sorts above supporting evidence.
	const recent = entries.slice(-8);
	const ordered = [
		...recent.filter((entry) => entry.classification === "conflicting"),
		...recent.filter((entry) => entry.classification !== "conflicting"),
	];
	return [
		"Evidence so far",
		"",
		...ordered.map(
			(entry) =>
				`- ${formatEvidenceClassification(entry.classification)}${
					entry.claimCategory ? ` (${entry.claimCategory.replace(/-/g, " ")})` : ""
				}: ${stripInlineSourceLabels(entry.claim)} — ${
					superseded.has(entry.id)
						? "superseded; see the revised statement"
						: stripInlineSourceLabels(entry.rationale)
				}`,
		),
	].join("\n");
}

function formatResearchPlanProgressLine(tasks: readonly ResearchPlanTaskRecord[]): string {
	const completed = tasks.filter((task) => task.status === "completed").length;
	return `Progress: ${completed}/${tasks.length} tasks`;
}

function formatResearchPlanTaskLines(tasks: readonly ResearchPlanTaskRecord[]): string[] {
	if (tasks.length === 0) {
		return ["- No tasks were planned."];
	}
	return tasks.map((task) => `${task.sequence}. ${task.title} — ${formatResearchPlanTaskStatus(task.status)}`);
}

function formatResearchPlanTaskStatus(status: ResearchPlanTaskRecord["status"]): string {
	if (status === "pending") {
		return "waiting";
	}
	if (status === "running") {
		return "in progress";
	}
	if (status === "completed") {
		return "done";
	}
	if (status === "blocked") {
		return "blocked";
	}
	if (status === "failed") {
		return "stopped";
	}
	return "cancelled";
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
		"The detailed report is saved.",
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
	const evidenceBoard = formatEvidenceBoard(input.state, report);
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
		...(evidenceBoard.length > 0 ? ["", "Evidence board", ...evidenceBoard] : []),
		...(supports.length > 0 ? ["", "Claim support", ...supports] : []),
		...(references.length > 0 ? ["", "References / attachments", ...references] : []),
		...(report.gaps.length > 0 ? ["", "Open gaps", ...report.gaps.map((item) => `- ${item}`)] : []),
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
		"",
		"Suggested next step",
		suggested,
	].join("\n");
}

export function formatLatestResearchCoordinatorReportMissing(): string {
	return 'No project coordinator summary is available yet. Ask "what should we try next?" to create one.';
}

/** Announces that a synthesis step refreshed the canonical "State of the problem" summary. */
export function formatStateOfProblemUpdated(): string {
	return 'The "State of the problem" summary is up to date. Say "show the state of the problem" to read it.';
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
			const trust = formatSourceTrustSignals(source);
			return `- ${label}${locator ? ` — ${locator}` : ""}${trust ? ` — ${trust}` : ""}`;
		})
		.filter((line): line is string => line !== undefined);
}

function formatEvidenceBoard(
	state: Pick<CoMathProjectState, "researchPaths"> & {
		researchEvidenceBoard?: readonly ResearchEvidenceBoardEntry[];
	},
	report: Pick<ResearchWorkstreamReportView, "pathId"> & { claimSupportIds?: readonly string[] },
): string[] {
	const claimSupportIds = new Set(report.claimSupportIds ?? []);
	return (state.researchEvidenceBoard ?? [])
		.filter(
			(entry) =>
				entry.reportId !== undefined ||
				entry.pathId === report.pathId ||
				(entry.claimSupportId !== undefined && claimSupportIds.has(entry.claimSupportId)),
		)
		.filter(
			(entry) =>
				entry.pathId === report.pathId ||
				(entry.claimSupportId !== undefined && claimSupportIds.has(entry.claimSupportId)),
		)
		.slice(-8)
		.map((entry) => {
			const sources = entry.sourceIds.length > 0 ? ` sources: ${entry.sourceIds.join(", ")}` : "";
			const computations =
				entry.computationalArtifactIds.length > 0
					? ` computations: ${entry.computationalArtifactIds.join(", ")}`
					: "";
			return `- ${formatEvidenceClassification(entry.classification)}: ${entry.claim}${sources}${computations} — ${entry.rationale}`;
		});
}

function formatEvidenceClassification(classification: ResearchEvidenceBoardEntry["classification"]): string {
	if (classification === "survey-context") {
		return "survey/context";
	}
	return classification;
}

function formatSourceTrustSignals(source: LiteratureSourceArtifact): string {
	const signals = [
		source.sourceType ? `type: ${source.sourceType}` : undefined,
		source.venue ? `venue: ${source.venue}` : undefined,
		source.doi ? `DOI: ${source.doi}` : undefined,
		source.externalId ? `external: ${source.externalId}` : undefined,
		source.publishedAt ? `published: ${source.publishedAt}` : source.year ? `year: ${source.year}` : undefined,
		source.citationCount !== undefined ? `citations: ${source.citationCount}` : undefined,
		source.provider ? `provider: ${source.provider}` : undefined,
	];
	return signals.filter((signal): signal is string => signal !== undefined).join("; ");
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
		...(script || result ? ["- Full script and output are saved in the detailed report."] : []),
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

function summarizeSteeringText(text: string): string {
	const trimmed = text.trim().replace(/\s+/g, " ");
	if (trimmed.length <= 180) {
		return trimmed;
	}
	return `${trimmed.slice(0, 177)}...`;
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

function isComputationalPathTitle(title: string): boolean {
	return /\b(?:small examples?|counterexamples?|finite checks?|computation|computational|search|examples?)\b/i.test(
		title,
	);
}

function isLiteraturePathTitle(title: string): boolean {
	return /\b(?:known theorem|literature|reference|source)\b/i.test(title);
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
		...(pathIndex >= 0 ? ["  Next: Pi can work on this path."] : []),
		...(hasReport && pathIndex >= 0 ? ["  Report: detailed report available for this path."] : []),
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
	report: Pick<ResearchWorkstreamReportView, "pathId" | "pathTitle" | "suggestedNextMove">,
): string[] {
	// A literature step ends with the report's own concrete next move (replacement routes, direct
	// mathematics), never a canned "ask the coordinator" hand-off.
	if (normalizeResearchPathTitle(report.pathTitle) === "known theorem or literature reduction") {
		return report.suggestedNextMove.trim().length > 0
			? [stripInlineSourceLabels(report.suggestedNextMove)]
			: ["The detailed report is ready to review."];
	}
	const nextPath = chooseNextResearchPathAfter(state, report);
	const nextPathIndex = nextPath ? state.researchPaths.findIndex((path) => path.id === nextPath.id) : -1;
	if (nextPath && nextPathIndex >= 0) {
		return [describeNextPathHint(nextPath), formatResearchPathLabel(state, nextPath)];
	}
	return ["The detailed report is ready to review."];
}

function describeNextPathHint(path: ResearchPath): string {
	const title = normalizeResearchPathTitle(path.title);
	if (title === "weaker special cases") {
		return "I can turn this into smaller targets next:";
	}
	if (title === "direct proof attempt") {
		return "I can use these lemmas in a proof attempt next:";
	}
	if (/proof/i.test(path.title)) {
		return "I can try a proof-oriented path next:";
	}
	if (isLiteraturePathTitle(path.title)) {
		return "I can try a source-backed path next:";
	}
	if (isComputationalPathTitle(path.title)) {
		return "I can try the examples path next:";
	}
	return "I can try this path next:";
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
