import { stat } from "node:fs/promises";
import type { CoMathAutoPlan } from "./comath-autoplan.ts";
import { createCoMathAutoPlan } from "./comath-autoplan.ts";
import {
	extractRunSummary,
	extractStatus,
	extractTranscriptPath,
	formatProductReport,
} from "./comath-backend-output.ts";
import type { ComputationalExecutor } from "./comath-computation-executor.ts";
import { createDefaultComputationalExecutor } from "./comath-computation-executor.ts";
import { runResearchCoordinatorSynthesis } from "./comath-coordinator-synthesis.ts";
import {
	formatResearchWorkstreamAlreadyRunning,
	formatResearchWorkstreamRunFailed,
	formatResearchWorkstreamRunProgress,
	formatResearchWorkstreamRunStillRunningReport,
} from "./comath-foreground-progress.ts";
import type { LiteratureSourceLookup, LiteratureSourceResult } from "./comath-literature-source.ts";
import { createDefaultLiteratureSourceLookup } from "./comath-literature-source.ts";
import {
	formatBackgroundRunStarted,
	formatCoMathNonMathEntryGuidance,
	formatCoMathProductHelp,
	formatCoMathResearchModeOperationalPromptIgnored,
	formatConjectureLineage,
	formatContextRecorded,
	formatFocusNoted,
	formatInitialValidationPlan,
	formatLatestResearchCoordinatorReportMissing,
	formatProductProgress,
	formatReadyForContext,
	formatResearchBatchCancelled,
	formatResearchBatchPaused,
	formatResearchBatchProgress,
	formatResearchBatchStarted,
	formatResearchCoordinatorReport,
	formatResearchEvidenceBoardSummary,
	formatResearchFocusUpdated,
	formatResearchNaturalSteeringQueued,
	formatResearchNaturalSteeringStarted,
	formatResearchPathDropped,
	formatResearchPlanCreated,
	formatResearchPlanExecutionStarted,
	formatResearchPlanMissing,
	formatResearchPlanSummary,
	formatResearchStateSummary,
	formatResearchWorkspacePrepared,
	formatResearchWorkstreamReport,
	formatSetupStep,
	formatSteeringNoted,
	formatUserProvidedLiteratureSourceRegistered,
	formatWaitingForContext,
} from "./comath-progress.ts";
import {
	isCreateResearchPlanPrompt,
	isLikelyMathValidationPrompt,
	isLikelyOperationalNonMathPrompt,
	isResearchCoordinatorPrompt,
	isResumeResearchBatchPrompt,
	isShowConjectureLineagePrompt,
	isShowEvidencePrompt,
	isShowLatestCoordinatorReportPrompt,
	isShowLatestReportPrompt,
	isShowProgressPrompt,
	isShowReportForPathPrompt,
	isShowResearchPlanPrompt,
	isShowResearchStatePrompt,
	type ParsedResearchPlanExecutionPrompt,
	type ParsedUserProvidedLiteratureSource,
	parseCancelResearchBatchPrompt,
	parseNaturalResearchQuestion,
	parseResearchBatchPrompt,
	parseResearchPlanExecutionPrompt,
	parseUserProvidedLiteratureSourcePrompt,
	stripCoMathPolitePrefix,
} from "./comath-prompts.ts";
import { createCoMathResearchAutoPlan } from "./comath-research-autoplan.ts";
import { CoMathResearchBatchRunner } from "./comath-research-batches.ts";
import { proposeResearchPlan } from "./comath-research-director.ts";
import type { ResearchWorkstreamModelExecutor } from "./comath-research-model-workstream.ts";
import { CoMathResearchPlanRunner, resumeResearchPlan } from "./comath-research-plan-runner.ts";
import {
	CoMathResearchRunner,
	type CoMathResearchWorkstreamActivityEnd,
	type CoMathResearchWorkstreamActivityEndInput,
	type CoMathResearchWorkstreamActivityStart,
	type CoMathResearchWorkstreamActivityStartInput,
	type CoMathResearchWorkstreamActivityUpdate,
	type CoMathResearchWorkstreamActivityUpdateInput,
} from "./comath-research-runner.ts";
import type { CoMathSource } from "./comath-source.ts";
import type {
	CoMathProjectState,
	LiteratureSourceArtifact,
	ResearchCoordinatorReportRecord,
	ResearchPath,
	ResearchWorkstreamRunRecord,
} from "./schema.ts";
import {
	addLiteratureSourceArtifact,
	addMarginNote,
	addResearchBatch,
	addResearchCoordinatorReport,
	addResearchPath,
	getActiveResearchBatch,
	getActiveResearchPlan,
	getActiveResearchWorkstreamRun,
	getLatestResearchCoordinatorReport,
	getLatestResearchPlan,
	getLatestResearchWorkstreamReport,
	getLatestResearchWorkstreamReportForPath,
	getLatestResearchWorkstreamRun,
	getPausedResearchBatch,
	getPausedResearchPlan,
	getResearchPlanTasks,
	loadProjectState,
	saveProjectState,
	setResearchFocus,
	updateResearchBatch,
	updateResearchPath,
	upsertWorkingPaperSectionByTitle,
} from "./storage.ts";

export type CoMathHarnessNoticeType = "info" | "warning" | "error";
export type CoMathHarnessNotify = (message: string, type?: CoMathHarnessNoticeType) => void | Promise<void>;
type CoMathPendingInitialIntent = { kind: "explore-problem" };
export interface CoMathBackendCommandResult {
	ok: boolean;
	messages: string[];
}
export type CoMathBackendCommandRunner = (args: string) => Promise<CoMathBackendCommandResult>;
export type {
	CoMathResearchWorkstreamActivityEnd,
	CoMathResearchWorkstreamActivityEndInput,
	CoMathResearchWorkstreamActivityStart,
	CoMathResearchWorkstreamActivityStartInput,
	CoMathResearchWorkstreamActivityUpdate,
	CoMathResearchWorkstreamActivityUpdateInput,
};

export interface CoMathHarnessOptions {
	source?: CoMathSource;
	statePath: string;
	notify: CoMathHarnessNotify;
	runBackendCommand: CoMathBackendCommandRunner;
	createPlan?: (problemText: string, sourceTitle?: string) => CoMathAutoPlan;
	startFirstRun?: boolean;
	/**
	 * Optional model executor for model-backed research workstreams. When present, `continue path N`
	 * runs a real specialist/critic/synthesizer model pass; when absent or failing, the harness uses
	 * the deterministic workstream instead.
	 */
	researchModelExecutor?: ResearchWorkstreamModelExecutor;
	/**
	 * Optional strong-model executor for the research director (model-authored plans and plan
	 * amendments) and the independent skeptic review of finished plan tasks. Without it, plans are
	 * deterministic and no skeptic pass runs.
	 */
	researchDirectorExecutor?: ResearchWorkstreamModelExecutor;
	literatureSourceLookup?: LiteratureSourceLookup;
	computationalExecutor?: ComputationalExecutor;
	onResearchWorkstreamActivityStart?: CoMathResearchWorkstreamActivityStart;
	onResearchWorkstreamActivityUpdate?: CoMathResearchWorkstreamActivityUpdate;
	onResearchWorkstreamActivityEnd?: CoMathResearchWorkstreamActivityEnd;
}

export class CoMathHarness {
	private readonly source: CoMathSource | undefined;
	private readonly statePath: string;
	private readonly notify: CoMathHarnessNotify;
	private readonly runBackendCommand: CoMathBackendCommandRunner;
	private readonly createPlan: (problemText: string, sourceTitle?: string) => CoMathAutoPlan;
	private readonly startFirstRun: boolean;
	private readonly researchModelExecutor: ResearchWorkstreamModelExecutor | undefined;
	private readonly researchDirectorExecutor: ResearchWorkstreamModelExecutor | undefined;
	private readonly researchRunner: CoMathResearchRunner;
	private readonly researchPlanRunner: CoMathResearchPlanRunner;
	private readonly researchBatchRunner: CoMathResearchBatchRunner;
	private pendingInitialIntent: CoMathPendingInitialIntent | undefined;

	constructor(options: CoMathHarnessOptions) {
		this.source = options.source;
		this.statePath = options.statePath;
		this.notify = options.notify;
		this.runBackendCommand = options.runBackendCommand;
		this.createPlan = options.createPlan ?? createCoMathAutoPlan;
		this.startFirstRun = options.startFirstRun ?? true;
		this.researchModelExecutor = options.researchModelExecutor;
		this.researchDirectorExecutor = options.researchDirectorExecutor;
		const computationalExecutor = options.computationalExecutor ?? createDefaultComputationalExecutor();
		this.researchRunner = new CoMathResearchRunner({
			statePath: this.statePath,
			notify: this.notify,
			researchModelExecutor: this.researchModelExecutor,
			literatureSourceLookup: options.literatureSourceLookup ?? createDefaultLiteratureSourceLookup(),
			computationalExecutor,
			onResearchWorkstreamActivityStart: options.onResearchWorkstreamActivityStart,
			onResearchWorkstreamActivityUpdate: options.onResearchWorkstreamActivityUpdate,
			onResearchWorkstreamActivityEnd: options.onResearchWorkstreamActivityEnd,
		});
		this.researchPlanRunner = new CoMathResearchPlanRunner({
			statePath: this.statePath,
			notify: this.notify,
			researchRunner: this.researchRunner,
			...(this.researchModelExecutor ? { researchModelExecutor: this.researchModelExecutor } : {}),
			...(this.researchDirectorExecutor ? { researchDirectorExecutor: this.researchDirectorExecutor } : {}),
			computationalExecutor,
		});
		this.researchBatchRunner = new CoMathResearchBatchRunner({
			statePath: this.statePath,
			notify: this.notify,
			researchRunner: this.researchRunner,
			planRunner: this.researchPlanRunner,
		});
	}

	async handlePrompt(problemText: string): Promise<void> {
		const problem = problemText.trim();
		if (!problem) {
			await this.notify(
				this.pendingInitialIntent?.kind === "explore-problem"
					? "Describe the problem you want to explore."
					: "Describe the problem you want to investigate.",
				"warning",
			);
			return;
		}
		if (isProductHelpPrompt(problem)) {
			await this.notify(formatCoMathProductHelp());
			return;
		}
		if (this.pendingInitialIntent?.kind === "explore-problem") {
			if (isCancelPrompt(problem)) {
				this.pendingInitialIntent = undefined;
				await this.notify("Exploration setup cancelled.");
				return;
			}
			if (isIncompleteExplorationPrompt(problem)) {
				await this.notify("Describe the problem you want to explore.", "warning");
				return;
			}
			const explorationProblem = parseExplorationPrompt(problem) ?? problem;
			if (await this.handleInitialResearchProblem(explorationProblem)) {
				this.pendingInitialIntent = undefined;
			}
			return;
		}
		if (await this.hasExistingState()) {
			await this.handleSteeringPrompt(problem);
			return;
		}
		if (parseUserProvidedLiteratureSourcePrompt(problem)) {
			await this.notify(
				'Start by asking a math research question before adding source context, for example: "Are there infinitely many primes of the form n^2 + 1?"',
				"warning",
			);
			return;
		}
		if (isIncompleteExplorationPrompt(problem)) {
			this.pendingInitialIntent = { kind: "explore-problem" };
			await this.notify("Describe the problem you want to explore.", "warning");
			return;
		}
		const explorationProblem = parseExplorationPrompt(problem);
		if (explorationProblem) {
			await this.handleInitialResearchProblem(explorationProblem);
			return;
		}
		// Recognized report/progress/state commands need a workspace first; never create state for them.
		if (
			isResearchCoordinatorPrompt(problem) ||
			isShowLatestCoordinatorReportPrompt(problem) ||
			isShowProgressPrompt(problem) ||
			isShowResearchStatePrompt(problem) ||
			isShowLatestReportPrompt(problem) ||
			isShowReportForPathPrompt(problem) !== undefined ||
			isShowResearchPlanPrompt(problem) ||
			isCreateResearchPlanPrompt(problem) ||
			parseResearchPlanExecutionPrompt(problem) !== undefined ||
			isShowEvidencePrompt(problem) ||
			isShowConjectureLineagePrompt(problem)
		) {
			await this.notify(
				'Start by asking a math question, for example: "Are there infinitely many primes of the form n^2 + 1?"',
				"warning",
			);
			return;
		}
		// Let beginners start exploration by typing a bare math question (no "Explore this problem:" prefix).
		// Only when no source is pinned: a pinned source means validation mode, where the first message is
		// the statement to audit, so bare questions must keep flowing to the validation path.
		const hasUsableSource = !!(this.source?.exists && this.source.isFile);
		const naturalResearchQuestion = hasUsableSource ? undefined : parseNaturalResearchQuestion(problem);
		if (naturalResearchQuestion) {
			await this.notify("I’ll start working on this as a math research problem.");
			await this.handleInitialResearchProblem(naturalResearchQuestion);
			return;
		}
		// Sourceless fresh workspace: only create a validation project for clear math validation prompts.
		// Operational/dev prose and other non-math input get guidance instead of durable state. A pinned
		// source keeps the existing validation behavior (the first message is the statement to audit).
		if (!hasUsableSource && !isLikelyMathValidationPrompt(problem)) {
			await this.notify(formatCoMathNonMathEntryGuidance(), "warning");
			return;
		}
		await this.handleInitialProblem(problem);
	}

	private async handleInitialResearchProblem(problem: string): Promise<boolean> {
		const plan = createCoMathResearchAutoPlan(problem);
		if (!(await this.runRequiredCommand(`init ${plan.rootQuestion}`, "Could not prepare the research workspace."))) {
			return false;
		}
		const state = await loadProjectState(this.statePath);
		if (!state) {
			await this.notify("Could not load the research workspace after setup.", "error");
			return false;
		}
		const now = new Date().toISOString();
		let nextState = state;
		for (const path of plan.paths) {
			nextState = addResearchPath(nextState, {
				title: path.title,
				objective: path.objective,
				suggestedNextMove: path.suggestedNextMove,
				priority: path.priority,
				now,
				actor: "human",
			});
		}
		const initialPath = chooseInitialResearchPath(nextState, {
			initialFocusSlug: plan.initialFocusSlug,
			preferLiterature: this.researchModelExecutor !== undefined,
		});
		if (initialPath) {
			nextState = setResearchFocus(nextState, {
				pathIds: [initialPath.id],
				reason: "Start with the most concrete research path.",
				now,
				actor: "human",
			});
		}
		await saveProjectState(this.statePath, nextState);
		await this.notify(formatResearchWorkspacePrepared(plan, initialPath?.title));
		if (this.startFirstRun && initialPath) {
			await this.researchRunner.runResearchWorkstreamForPath(nextState, initialPath);
		}
		return true;
	}

	private async handleInitialProblem(problem: string): Promise<void> {
		const sourceTitle = this.source?.exists && this.source.isFile ? this.source.displayName : undefined;
		const explicitWait = shouldWaitForContext(problem);
		const hasSource = !!(this.source?.exists && this.source.isFile);
		// With a source pinned but only a short problem reference, ask the human to paste the exact
		// statement/context before the first audit instead of auditing with no real context.
		const askForContext = explicitWait || (hasSource && !initialPromptIncludesContext(problem));
		// The control-flow request ("wait for pasted context before starting") must not become the
		// math root question, or the audit role obeys it and blocks even once context is supplied.
		const plan = this.createPlan(explicitWait ? cleanProblemStatement(problem) : problem, sourceTitle);
		await this.notify(formatInitialValidationPlan(plan.rootQuestion, sourceTitle, { waitForContext: askForContext }));
		if (
			!(await this.runRequiredCommand(`init ${plan.rootQuestion}`, "Could not prepare the validation workspace."))
		) {
			return;
		}
		await this.notify(formatSetupStep("Validation workspace prepared"));
		if (this.source?.exists && this.source.isFile) {
			if (
				!(await this.runRequiredCommand(
					`source ${this.source.absolutePath} ${this.source.displayName}: Primary source for ${trimTerminalPunctuation(plan.rootQuestion)}`,
					`Could not pin the source file: ${this.source.displayName}. Check the source path and try again.`,
				))
			) {
				return;
			}
			await this.notify(formatSetupStep(`Source pinned: ${this.source.displayName}`));
		} else if (this.source) {
			await this.notify(
				`Could not pin the source file: ${this.source.missingReason ?? "source is not readable."}`,
				"error",
			);
			return;
		}

		for (const goal of plan.goals) {
			if (!(await this.runRequiredCommand(`goal ${goal}`, "Could not create the validation plan."))) {
				return;
			}
		}
		await this.notify(formatSetupStep("Validation plan created"));
		for (const workstream of plan.workstreams) {
			if (
				!(await this.runRequiredCommand(
					`workstream ${workstream.slug}: ${workstream.title}`,
					"Could not prepare the audit steps.",
				))
			) {
				return;
			}
		}
		await this.notify(formatSetupStep("Definition and assumption audit prepared"));
		await this.notify(formatSetupStep("Support/indexing gap audit prepared"));
		if (this.startFirstRun) {
			if (
				!(await this.runRequiredCommand(
					`queue workstream ${plan.firstWorkstreamId}`,
					"Could not prepare the source audit.",
				))
			) {
				return;
			}
			if (askForContext) {
				// Leave the audit prepared (queued); the next substantial message becomes context and
				// auto-starts it. Explicit "wait" keeps its copy; the auto-ask uses human-first copy.
				await this.notify(explicitWait ? formatWaitingForContext(true) : formatReadyForContext());
				return;
			}
			const dispatched = await this.runCommand(
				"dispatch-next --background",
				"Could not start the source audit. Check model/provider configuration and try again.",
			);
			if (!dispatched) {
				return;
			}
			await this.notify(formatBackgroundRunStarted(extractTranscriptPath(dispatched.messages)));
		}
	}

	private async handleSteeringPrompt(prompt: string): Promise<void> {
		const state = await loadProjectState(this.statePath);
		if (parseUserProvidedLiteratureSourcePrompt(prompt) && !state?.researchPaths.length) {
			await this.notify(
				'Source context for Path 5 is available after you start a research workspace. Ask a math question first, for example: "Are there infinitely many primes of the form n^2 + 1?"',
				"warning",
			);
			return;
		}
		if (state?.researchPaths.length) {
			await this.handleResearchSteeringPrompt(state, prompt);
			return;
		}
		if (isIncompleteExplorationPrompt(prompt)) {
			this.pendingInitialIntent = { kind: "explore-problem" };
			await this.notify("Describe the problem you want to explore.", "warning");
			return;
		}
		const explorationProblem = parseExplorationPrompt(prompt);
		if (explorationProblem) {
			await this.handleInitialResearchProblem(explorationProblem);
			return;
		}
		if (/^continue$/i.test(prompt)) {
			const latestRun = await this.tryCommand("run-status latest");
			const latestStatus = latestRun?.ok ? extractStatus(latestRun.messages) : undefined;
			if (latestStatus === "queued") {
				const dispatched = await this.runCommand(
					"dispatch-next --background",
					"Could not start the prepared source audit. Check model/provider configuration and try again.",
				);
				if (dispatched) {
					await this.notify(formatBackgroundRunStarted(extractTranscriptPath(dispatched.messages)));
				}
				return;
			}
			// Do not start a re-audit while one is still running; let it finish first.
			if (latestStatus !== "running") {
				const reaudit = await this.tryCommand("re-audit --background");
				const reauditTranscript = reaudit?.ok ? extractTranscriptPath(reaudit.messages) : undefined;
				if (reauditTranscript) {
					await this.notify(formatBackgroundRunStarted(reauditTranscript));
					return;
				}
			}
			const result = await this.runCommand("next", "Could not identify the next step.");
			if (result) {
				await this.notify(joinProductMessages(result.messages) || "Nothing to do right now.");
			}
			return;
		}
		if (isShowProgressPrompt(prompt)) {
			const result = await this.tryCommand("run-status latest");
			if (!result?.ok) {
				await this.notify(formatProductProgress(undefined));
				return;
			}
			await this.notify(formatProductProgress(extractRunSummary(result.messages)));
			return;
		}
		if (isShowLatestReportPrompt(prompt)) {
			const result = await this.tryCommand("report-status latest");
			if (!result?.ok) {
				await this.notify('No report yet. The first audit may still be running; say "show progress" to check.');
				return;
			}
			await this.notify(formatProductReport(result.messages) ?? joinProductMessages(result.messages));
			return;
		}
		if (/^show (?:details|debug state)$/i.test(prompt)) {
			const runStatus = await this.tryCommand("run-status latest");
			const projectStatus = await this.tryCommand("status");
			const details = [...(runStatus?.messages ?? []), ...(projectStatus?.messages ?? [])].join("\n\n").trim();
			await this.notify(details.length > 0 ? details : "No debug details are available yet.");
			return;
		}
		const focus = /^focus on (.+)$/i.exec(prompt);
		if (focus?.[1]) {
			const focusTarget = trimTerminalPunctuation(focus[1]);
			if (
				!(await this.runRequiredCommand(
					`note project: Focus next work on ${focusTarget}`,
					"Could not record that focus.",
				))
			) {
				return;
			}
			await this.notify(formatFocusNoted(focusTarget));
			return;
		}
		if (/^show uncertainty$/i.test(prompt)) {
			const result = await this.runCommand("review-queue", "Could not show current uncertainty.");
			if (result) {
				await this.notify(joinProductMessages(result.messages) || "Nothing is waiting for review.");
			}
			return;
		}
		await this.handleContextOrSteering(prompt);
	}

	private async handleResearchSteeringPrompt(state: CoMathProjectState, prompt: string): Promise<void> {
		const reconciled = await this.researchRunner.reconcileStaleResearchWorkstreamRuns(state);
		state = await this.researchPlanRunner.reconcileStaleResearchPlans(reconciled.state);
		const latestInterruptedRun = reconciled.interruptedRuns.at(-1);
		const cancelBatchReason = parseCancelResearchBatchPrompt(prompt);
		if (cancelBatchReason) {
			const activeBatch = getActiveResearchBatch(state);
			const pausedBatch = getPausedResearchBatch(state);
			const batch = activeBatch ?? pausedBatch;
			if (!batch) {
				await this.notify("No research step sequence is active or paused.", "warning");
				return;
			}
			const now = new Date().toISOString();
			const nextState = updateResearchBatch(state, {
				batchId: batch.id,
				status: "cancelled",
				cancelReason: cancelBatchReason,
				cancelledAt: now,
				now,
				actor: "human",
			});
			await saveProjectState(this.statePath, nextState);
			const nextBatch = nextState.researchBatches.find((candidate) => candidate.id === batch.id) ?? batch;
			await this.notify(formatResearchBatchCancelled({ state: nextState, batch: nextBatch }));
			return;
		}
		if (isResumeResearchBatchPrompt(prompt)) {
			const activeRun = getActiveResearchWorkstreamRun(state);
			const activeBatch = getActiveResearchBatch(state);
			if (activeRun || activeBatch) {
				await this.notify(
					activeRun
						? formatResearchWorkstreamAlreadyRunning({ state, run: activeRun })
						: 'A research step sequence is already active. Say "show progress" to inspect it.',
					"warning",
				);
				return;
			}
			const pausedBatch = getPausedResearchBatch(state);
			if (!pausedBatch) {
				await this.notify("No paused research step sequence is available to resume.", "warning");
				return;
			}
			const now = new Date().toISOString();
			const nextState = updateResearchBatch(state, {
				batchId: pausedBatch.id,
				status: "running",
				now,
				actor: "human",
			});
			await saveProjectState(this.statePath, nextState);
			const resumedBatch =
				nextState.researchBatches.find((candidate) => candidate.id === pausedBatch.id) ?? pausedBatch;
			await this.notify(formatResearchBatchProgress({ state: nextState, batch: resumedBatch }));
			this.researchBatchRunner.startResearchBatchExecution(resumedBatch.id);
			return;
		}
		const providedSource = parseUserProvidedLiteratureSourcePrompt(prompt);
		if (providedSource) {
			await this.registerUserProvidedLiteratureSource(state, providedSource);
			return;
		}
		if (isShowResearchPlanPrompt(prompt)) {
			const plan = getActiveResearchPlan(state) ?? getPausedResearchPlan(state) ?? getLatestResearchPlan(state);
			if (!plan) {
				await this.notify(formatResearchPlanMissing());
				return;
			}
			await this.notify(formatResearchPlanSummary({ plan, tasks: getResearchPlanTasks(state, plan.id) }));
			return;
		}
		if (isCreateResearchPlanPrompt(prompt)) {
			const existing = getActiveResearchPlan(state) ?? getPausedResearchPlan(state);
			if (existing) {
				await this.notify(
					formatResearchPlanSummary({ plan: existing, tasks: getResearchPlanTasks(state, existing.id) }),
				);
				return;
			}
			const created = await proposeResearchPlan(state, {
				...(this.researchDirectorExecutor ? { executor: this.researchDirectorExecutor } : {}),
				now: new Date().toISOString(),
				actor: "human",
			});
			await saveProjectState(this.statePath, created.state);
			await this.notify(
				formatResearchPlanCreated({
					plan: created.plan,
					tasks: getResearchPlanTasks(created.state, created.plan.id),
				}),
			);
			return;
		}
		const planExecution = parseResearchPlanExecutionPrompt(prompt);
		if (planExecution) {
			await this.handleResearchPlanExecutionPrompt(state, planExecution);
			return;
		}
		if (isShowEvidencePrompt(prompt)) {
			await this.notify(formatResearchEvidenceBoardSummary(state));
			return;
		}
		if (isShowConjectureLineagePrompt(prompt)) {
			await this.notify(formatConjectureLineage(state));
			return;
		}
		if (isShowLatestCoordinatorReportPrompt(prompt)) {
			const report = getLatestResearchCoordinatorReport(state);
			if (!report) {
				await this.notify(formatLatestResearchCoordinatorReportMissing());
				return;
			}
			await this.notify(formatResearchCoordinatorReport({ state, report }));
			return;
		}
		if (isResearchCoordinatorPrompt(prompt)) {
			await this.createResearchCoordinatorReport(state);
			return;
		}
		if (isShowProgressPrompt(prompt) || isShowResearchStatePrompt(prompt)) {
			// Progress prefers the durable plan, then the bounded batch, then the single active run.
			const progressPlan = getActiveResearchPlan(state) ?? getPausedResearchPlan(state);
			if (isShowProgressPrompt(prompt) && progressPlan) {
				await this.notify(
					formatResearchPlanSummary({
						plan: progressPlan,
						tasks: getResearchPlanTasks(state, progressPlan.id),
					}),
				);
				return;
			}
			const activeBatch = getActiveResearchBatch(state);
			const pausedBatch = getPausedResearchBatch(state);
			if (isShowProgressPrompt(prompt) && (activeBatch || pausedBatch)) {
				if (activeBatch) {
					await this.notify(
						formatResearchBatchProgress({
							state,
							batch: activeBatch,
							run: getActiveResearchWorkstreamRun(state),
						}),
					);
				} else if (pausedBatch) {
					await this.notify(
						formatResearchBatchPaused({
							state,
							batch: pausedBatch,
							run: this.researchRunner.findResearchRun(state, pausedBatch.interruptedRunId),
						}),
						"warning",
					);
				}
				return;
			}
			const activeRun = getActiveResearchWorkstreamRun(state);
			if (isShowProgressPrompt(prompt) && activeRun) {
				await this.notify(formatResearchWorkstreamRunProgress({ state, run: activeRun }));
				return;
			}
			if (isShowProgressPrompt(prompt) && latestInterruptedRun) {
				await this.notify(formatResearchWorkstreamRunFailed({ state, run: latestInterruptedRun }), "warning");
				return;
			}
			await this.notify(formatResearchStateSummary(state));
			return;
		}
		if (/^(?:what is most promising\??|what's most promising\??)$/i.test(prompt)) {
			await this.notify(formatResearchStateSummary(state));
			return;
		}
		const detailsForPath = isShowReportForPathPrompt(prompt);
		if (detailsForPath) {
			const pathNumber = detailsForPath.pathNumber;
			const path = state.researchPaths[pathNumber - 1];
			if (!path) {
				await this.notify(
					"I could not find that research path. Ask for a summary to see the current paths.",
					"warning",
				);
				return;
			}
			const activeRun = getActiveResearchWorkstreamRun(state);
			if (activeRun?.pathId === path.id) {
				await this.notify(formatResearchWorkstreamRunStillRunningReport({ state, run: activeRun }));
				return;
			}
			const report = getLatestResearchWorkstreamReportForPath(state, path.id);
			if (!report) {
				await this.notify(
					`No detailed report has been recorded for Path ${pathNumber} yet. Say "continue path ${pathNumber}" to run one.`,
				);
				return;
			}
			await this.notify(formatResearchWorkstreamReport({ state, report }));
			return;
		}
		if (isShowLatestReportPrompt(prompt)) {
			const latestRun = getLatestResearchWorkstreamRun(state);
			if (latestRun && (latestRun.status === "queued" || latestRun.status === "running")) {
				await this.notify(formatResearchWorkstreamRunStillRunningReport({ state, run: latestRun }));
				return;
			}
			if (latestRun?.status === "failed" && !latestRun.finalReportId) {
				await this.notify(formatResearchWorkstreamRunFailed({ state, run: latestRun }), "warning");
				return;
			}
			const report = getLatestResearchWorkstreamReport(state);
			if (!report) {
				await this.notify("No research report is available yet. Continue a path first.");
				return;
			}
			await this.notify(formatResearchWorkstreamReport({ state, report }));
			return;
		}
		const batchPrompt = parseResearchBatchPrompt(prompt);
		if (batchPrompt) {
			const activeRun = getActiveResearchWorkstreamRun(state);
			if (activeRun) {
				await this.notify(formatResearchWorkstreamAlreadyRunning({ state, run: activeRun }), "warning");
				return;
			}
			const activeBatch = getActiveResearchBatch(state);
			if (activeBatch) {
				await this.notify(
					'A research step sequence is already active. Say "show progress" to inspect it.',
					"warning",
				);
				return;
			}
			const pausedBatch = getPausedResearchBatch(state);
			if (pausedBatch) {
				await this.notify(formatResearchBatchPaused({ state, batch: pausedBatch }), "warning");
				return;
			}
			const path = batchPrompt.pathNumber ? state.researchPaths[batchPrompt.pathNumber - 1] : undefined;
			if (batchPrompt.pathNumber && !path) {
				await this.notify(
					"I could not find that research path. Ask for a summary to see the current paths.",
					"warning",
				);
				return;
			}
			const now = new Date().toISOString();
			const nextState = addResearchBatch(state, {
				requestedStepCount: batchPrompt.requestedStepCount,
				...(path ? { initialPathId: path.id } : {}),
				now,
				actor: "human",
			});
			await saveProjectState(this.statePath, nextState);
			const batch = nextState.researchBatches.at(-1);
			if (!batch) {
				await this.notify("Could not start the research steps.", "error");
				return;
			}
			await this.notify(formatResearchBatchStarted({ state: nextState, batch }));
			this.researchBatchRunner.startResearchBatchExecution(batch.id);
			return;
		}
		const focus = /^focus on (.+)$/i.exec(prompt);
		if (focus?.[1]) {
			const path = findResearchPath(state, focus[1]);
			if (!path) {
				await this.notify(
					"I could not find a matching research path. Ask for a summary to see the current paths.",
					"warning",
				);
				return;
			}
			const now = new Date().toISOString();
			const nextState = setResearchFocus(state, {
				pathIds: [path.id],
				reason: `User asked to focus on ${trimTerminalPunctuation(focus[1])}.`,
				now,
				actor: "human",
			});
			await saveProjectState(this.statePath, nextState);
			await this.notify(
				formatResearchFocusUpdated(path, `User asked to focus on ${trimTerminalPunctuation(focus[1])}.`),
			);
			return;
		}
		const drop = /^drop (?:the )?(.+?)(?: path)?$/i.exec(prompt);
		if (drop?.[1]) {
			const path = findResearchPath(state, drop[1]);
			if (!path) {
				await this.notify("I could not find a matching research path to drop.", "warning");
				return;
			}
			const reason = "The user asked to drop this path.";
			const now = new Date().toISOString();
			const nextState = updateResearchPath(state, {
				pathId: path.id,
				status: "abandoned",
				now,
				actor: "human",
			});
			await saveProjectState(this.statePath, nextState);
			await this.notify(formatResearchPathDropped(path, reason));
			return;
		}
		if (/^try a weaker theorem$/i.test(prompt)) {
			const path = findResearchPath(state, "weaker special cases");
			if (path) {
				const now = new Date().toISOString();
				const nextState = setResearchFocus(state, {
					pathIds: [path.id],
					reason: "User asked to try a weaker theorem.",
					now,
					actor: "human",
				});
				await saveProjectState(this.statePath, nextState);
				await this.notify(formatResearchFocusUpdated(path, "User asked to try a weaker theorem."));
			}
			return;
		}
		const continuation = parseResearchPathContinuationPrompt(state, prompt);
		if (continuation) {
			const { explicit, path } = continuation;
			if (!path) {
				await this.notify(
					explicit
						? "I could not find a matching active research path to continue. Ask for a summary to see the current paths."
						: "No active research path is ready to continue.",
					"warning",
				);
				return;
			}
			const activeRun = getActiveResearchWorkstreamRun(state);
			if (activeRun) {
				await this.notify(formatResearchWorkstreamAlreadyRunning({ state, run: activeRun }), "warning");
				return;
			}
			if (getActiveResearchBatch(state)) {
				await this.notify(
					'A research step sequence is already active. Say "show progress" to inspect it.',
					"warning",
				);
				return;
			}
			if (latestInterruptedRun) {
				await this.notify(formatResearchWorkstreamRunFailed({ state, run: latestInterruptedRun }), "warning");
			}
			await this.researchRunner.runResearchWorkstreamForPath(state, path);
			return;
		}
		if (isLikelyOperationalNonMathPrompt(prompt)) {
			await this.notify(formatCoMathResearchModeOperationalPromptIgnored(), "warning");
			return;
		}
		await this.handleNaturalResearchSteeringPrompt(state, prompt, latestInterruptedRun);
		return;
	}

	/**
	 * Explicit "execute/work/continue/resume the plan" requests. All of these are user consent to
	 * run bounded plan work, so a paused plan is resumed here (never automatically) and the tasks
	 * run through the bounded batch executor so pause/resume and interruption recovery stay shared.
	 */
	private async handleResearchPlanExecutionPrompt(
		state: CoMathProjectState,
		request: ParsedResearchPlanExecutionPrompt,
	): Promise<void> {
		const activeRun = getActiveResearchWorkstreamRun(state);
		if (activeRun) {
			await this.notify(formatResearchWorkstreamAlreadyRunning({ state, run: activeRun }), "warning");
			return;
		}
		if (getActiveResearchBatch(state)) {
			await this.notify('A research step sequence is already active. Say "show progress" to inspect it.', "warning");
			return;
		}
		if (request.resume && !getPausedResearchPlan(state) && !getActiveResearchPlan(state)) {
			await this.notify("No paused research plan is available to resume.", "warning");
			return;
		}
		let workingState = state;
		let plan = getActiveResearchPlan(workingState);
		if (!plan) {
			const paused = getPausedResearchPlan(workingState);
			if (paused) {
				workingState = resumeResearchPlan(workingState, paused.id, new Date().toISOString());
				await saveProjectState(this.statePath, workingState);
				plan = workingState.researchPlans.find((candidate) => candidate.id === paused.id);
			}
		}
		if (!plan) {
			if (request.resume) {
				await this.notify("No paused research plan is available to resume.", "warning");
				return;
			}
			const created = await proposeResearchPlan(workingState, {
				...(this.researchDirectorExecutor ? { executor: this.researchDirectorExecutor } : {}),
				now: new Date().toISOString(),
				actor: "human",
			});
			workingState = created.state;
			plan = created.plan;
			await saveProjectState(this.statePath, workingState);
			await this.notify(formatResearchPlanCreated({ plan, tasks: getResearchPlanTasks(workingState, plan.id) }));
		}
		const tasks = getResearchPlanTasks(workingState, plan.id);
		const pendingCount = tasks.filter((task) => task.status === "pending").length;
		if (pendingCount === 0) {
			await this.notify(formatResearchPlanSummary({ plan, tasks }));
			return;
		}
		const requestedStepCount = Math.min(5, Math.max(1, request.requestedStepCount ?? pendingCount));
		const now = new Date().toISOString();
		const pausedBatch = getPausedResearchBatch(workingState);
		let batchId: string;
		let nextState: CoMathProjectState;
		if (pausedBatch && !pausedBatch.initialPathId) {
			// Re-open the paused bounded run instead of stacking a second one for the same plan.
			nextState = updateResearchBatch(workingState, {
				batchId: pausedBatch.id,
				status: "running",
				clearInterruptedRunId: true,
				now,
				actor: "human",
			});
			batchId = pausedBatch.id;
		} else {
			nextState = addResearchBatch(workingState, { requestedStepCount, now, actor: "human" });
			const batch = nextState.researchBatches.at(-1);
			if (!batch) {
				await this.notify("Could not start the plan tasks.", "error");
				return;
			}
			batchId = batch.id;
		}
		await saveProjectState(this.statePath, nextState);
		await this.notify(formatResearchPlanExecutionStarted({ plan, tasks, requestedTaskCount: requestedStepCount }));
		this.researchBatchRunner.startResearchBatchExecution(batchId);
	}

	private async handleNaturalResearchSteeringPrompt(
		state: CoMathProjectState,
		prompt: string,
		latestInterruptedRun: ResearchWorkstreamRunRecord | undefined,
	): Promise<void> {
		const path = chooseNaturalSteeringResearchPath(state, prompt);
		const now = new Date().toISOString();
		const nextState = saveNaturalResearchSteering(state, prompt, path, now);
		await saveProjectState(this.statePath, nextState);

		const activeRun = getActiveResearchWorkstreamRun(state);
		if (activeRun) {
			const activePath = nextState.researchPaths.find((candidate) => candidate.id === activeRun.pathId) ?? path;
			await this.notify(
				formatResearchNaturalSteeringQueued({
					state: nextState,
					...(activePath ? { path: activePath } : {}),
					prompt,
				}),
			);
			return;
		}
		if (getActiveResearchBatch(state)) {
			await this.notify(
				formatResearchNaturalSteeringQueued({ state: nextState, ...(path ? { path } : {}), prompt }),
			);
			return;
		}
		if (latestInterruptedRun) {
			await this.notify(
				formatResearchWorkstreamRunFailed({ state: nextState, run: latestInterruptedRun }),
				"warning",
			);
		}
		if (!path) {
			await this.notify(formatResearchStateSummary(nextState));
			return;
		}
		await this.notify(formatResearchNaturalSteeringStarted({ state: nextState, path, prompt }));
		await this.researchRunner.runResearchWorkstreamForPath(nextState, path);
	}

	private async registerUserProvidedLiteratureSource(
		state: CoMathProjectState,
		source: ParsedUserProvidedLiteratureSource,
	): Promise<void> {
		const now = new Date().toISOString();
		const title = deriveUserProvidedLiteratureSourceTitle(source);
		const result: LiteratureSourceResult = {
			kind: "user-provided",
			title,
			...(source.url ? { url: source.url } : {}),
			...(source.path ? { path: source.path } : {}),
			summary: summarizeUserProvidedLiteratureSource(source),
			extractedText: source.text,
		};
		const nextState = addLiteratureSourceArtifact(state, {
			kind: result.kind,
			title: result.title,
			...(result.url ? { url: result.url } : {}),
			...(result.path ? { path: result.path } : {}),
			summary: result.summary,
			...(result.extractedText ? { extractedText: result.extractedText } : {}),
			now,
			actor: "human",
		});
		await saveProjectState(this.statePath, nextState);
		const persisted = findPersistedLiteratureSource(nextState.literatureSources, state.literatureSources, result);
		await this.notify(formatUserProvidedLiteratureSourceRegistered({ title: persisted?.title ?? result.title }));
	}

	private async createResearchCoordinatorReport(state: CoMathProjectState): Promise<void> {
		const latestState = (await loadProjectState(this.statePath)) ?? state;
		const now = new Date().toISOString();
		const result = await runResearchCoordinatorSynthesis({
			state: latestState,
			executor: this.researchModelExecutor,
			now,
		});
		let nextState = upsertWorkingPaperSectionByTitle(latestState, {
			title: "Project coordinator synthesis",
			body: buildResearchCoordinatorWorkingPaperBody(result.report),
			now,
			actor: "coordinator",
		});
		const section = nextState.workingPaperSections.find(
			(candidate) => candidate.title === "Project coordinator synthesis",
		);
		nextState = addResearchCoordinatorReport(nextState, {
			...result.report,
			...(section ? { workingPaperSectionId: section.id } : {}),
			now,
			actor: "coordinator",
		});
		const report = nextState.researchCoordinatorReports.at(-1);
		if (report) {
			const suggested = getCoordinatorSuggestedPrompt(nextState, report);
			if (suggested) {
				nextState = addMarginNote(nextState, {
					id: `margin-note-${nextState.marginNotes.length + 1}`,
					kind: "todo",
					subjectId: report.id,
					...(section ? { sectionId: section.id } : {}),
					message: `Suggested next step: ${suggested}`,
					now,
					actor: "coordinator",
				});
			}
		}
		await saveProjectState(this.statePath, nextState);
		if (report) {
			await this.notify(formatResearchCoordinatorReport({ state: nextState, report }));
		}
	}

	/**
	 * Default handling for an unrecognized message: record it, then — if it looks like pasted
	 * context/candidate rather than a short steering note — automatically start the prepared audit
	 * (first context) or trigger one re-audit (after a finished run). A run already in flight only
	 * records the context so repeated messages cannot start duplicate audits.
	 */
	private async handleContextOrSteering(prompt: string): Promise<void> {
		if (!(await this.runRequiredCommand(`note project: ${prompt}`, "Could not record that steering note."))) {
			return;
		}
		if (!looksLikePastedContext(prompt)) {
			await this.notify(formatSteeringNoted());
			return;
		}
		const latestRun = await this.tryCommand("run-status latest");
		const latestStatus = latestRun?.ok ? extractStatus(latestRun.messages) : undefined;
		if (latestStatus === "queued") {
			const dispatched = await this.runCommand(
				"dispatch-next --background",
				"Could not start the source audit. Check model/provider configuration and try again.",
			);
			if (dispatched) {
				await this.notify(formatContextRecorded());
				await this.notify(formatBackgroundRunStarted(extractTranscriptPath(dispatched.messages)));
			}
			return;
		}
		if (latestStatus === "completed" || latestStatus === "blocked") {
			const reaudit = await this.tryCommand("re-audit --background");
			const transcript = reaudit?.ok ? extractTranscriptPath(reaudit.messages) : undefined;
			await this.notify(formatContextRecorded());
			if (transcript) {
				await this.notify(formatBackgroundRunStarted(transcript));
			}
			return;
		}
		// A run is queued-and-dispatching or running: record context only, never start a duplicate.
		await this.notify(formatContextRecorded());
	}

	private async hasExistingState(): Promise<boolean> {
		try {
			const stateStat = await stat(this.statePath);
			return stateStat.isFile();
		} catch {
			return false;
		}
	}

	private async runRequiredCommand(command: string, recovery: string): Promise<boolean> {
		return (await this.runCommand(command, recovery)) !== undefined;
	}

	private async runCommand(command: string, recovery: string): Promise<CoMathBackendCommandResult | undefined> {
		try {
			const result = await this.runBackendCommand(command);
			if (result.ok) {
				return result;
			}
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			await this.notify(`${recovery}\n${message}`, "error");
			return undefined;
		}
		await this.notify(recovery, "error");
		return undefined;
	}

	private async tryCommand(command: string): Promise<CoMathBackendCommandResult | undefined> {
		try {
			return await this.runBackendCommand(command);
		} catch {
			return undefined;
		}
	}
}

function trimTerminalPunctuation(value: string): string {
	return value.replace(/[.?!]+$/, "");
}

function deriveUserProvidedLiteratureSourceTitle(source: ParsedUserProvidedLiteratureSource): string {
	if (source.title?.trim()) {
		return truncateSourceText(source.title.trim(), 96);
	}
	const sourceText = firstSubstantiveSourceText(source);
	if (sourceText) {
		return truncateSourceText(sourceText, 96);
	}
	return source.url ?? source.path ?? "User-provided literature note";
}

function summarizeUserProvidedLiteratureSource(source: ParsedUserProvidedLiteratureSource): string {
	const sourceText = firstSubstantiveSourceText(source);
	if (sourceText) {
		return truncateSourceText(sourceText, 220);
	}
	if (source.url) {
		return `User-provided source URL: ${source.url}`;
	}
	if (source.path) {
		return `User-provided source path: ${source.path}`;
	}
	return truncateSourceText(source.text, 220);
}

function firstSubstantiveSourceText(source: ParsedUserProvidedLiteratureSource): string | undefined {
	let text = source.text.trim();
	if (source.url) {
		text = text.replaceAll(source.url, " ");
	}
	if (source.path) {
		text = text.replaceAll(source.path, " ");
	}
	text = text.replace(/\s+/g, " ").trim();
	if (!text) {
		return undefined;
	}
	const firstSentence = /^(.+?[.!?])(?:\s|$)/.exec(text)?.[1]?.trim();
	return trimTerminalPunctuation(firstSentence ?? text);
}

function truncateSourceText(text: string, maxLength: number): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) {
		return normalized;
	}
	return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function cleanProblemStatement(problem: string): string {
	const withoutLeadVerb = problem
		.trim()
		.replace(
			/^(?:please\s+)?(?:set[\s-]?up|initiali[sz]e|prepare|create|begin|start)\s+(?:a\s+)?(?:source-backed\s+)?validation(?:\s+run)?\s+(?:for|of|on)\s+/i,
			"",
		);
	const clauses = withoutLeadVerb
		.split(/\s*(?:,|;|\.|\bbut\b)\s*/i)
		.map((clause) => clause.trim())
		.filter((clause) => clause.length > 0);
	const kept = clauses.filter(
		(clause) => !/\b(?:wait|don'?t start|do not start|before starting|until i|until you)\b/i.test(clause),
	);
	const cleaned = kept.join(". ").trim();
	return cleaned.length > 0 ? cleaned : withoutLeadVerb.trim();
}

/**
 * Strict detector for the FIRST prompt: decides whether the user already pasted the actual problem
 * content (so we can audit immediately) versus a short reference like "Validate First Proof
 * Question 2." or "Please validate Question 3 from the attached source" (so we should ask for
 * context first). Conservative on purpose — a false "needs context" only costs one extra paste,
 * whereas a false "has context" launches an audit with nothing real to check. Note "First Proof"
 * must NOT count as a proof marker, so labels are start-anchored and require a colon.
 */
function initialPromptIncludesContext(text: string): boolean {
	const trimmed = text.trim();
	if (trimmed.includes("\n")) {
		return true;
	}
	if (
		/^(?:context|candidate|statement|proof|definition|assumptions?|claim|theorem|lemma)\b[^\n]{0,40}:/i.test(trimmed)
	) {
		return true;
	}
	const words = trimmed.split(/\s+/).filter((word) => word.length > 0);
	return words.length >= 40 || trimmed.length >= 240;
}

/**
 * Looser detector for messages AFTER setup, once Pi has asked for context. At that point any
 * substantial reply is the pasted context/candidate; short replies stay ordinary steering notes.
 */
function looksLikePastedContext(text: string): boolean {
	const trimmed = text.trim();
	if (trimmed.includes("\n")) {
		return true;
	}
	const words = trimmed.split(/\s+/).filter((word) => word.length > 0);
	return trimmed.length >= 40 || words.length >= 8;
}

function shouldWaitForContext(prompt: string): boolean {
	const normalized = prompt.toLowerCase();
	const asksToWait =
		/\bwait\b/.test(normalized) || /\bdon'?t start\b/.test(normalized) || /\bdo not start\b/.test(normalized);
	const mentionsContext =
		/\bcontext\b/.test(normalized) ||
		/\bpaste[ds]?\b/.test(normalized) ||
		/\bstatement\b/.test(normalized) ||
		/\bproof\b/.test(normalized);
	return asksToWait && mentionsContext;
}

function isProductHelpPrompt(prompt: string): boolean {
	const normalized = prompt.trim().toLowerCase();
	return normalized === "help" || normalized === "?";
}

function isCancelPrompt(prompt: string): boolean {
	const normalized = prompt.trim().toLowerCase();
	return normalized === "cancel" || normalized === "never mind" || normalized === "nevermind";
}

function joinProductMessages(messages: readonly string[]): string {
	return messages.map(demoteBackendHeading).join("\n\n").trim();
}

function demoteBackendHeading(message: string): string {
	return message.replace(/^Co-math (\w)/, (_match, first: string) => first.toUpperCase());
}

function parseExplorationPrompt(prompt: string): string | undefined {
	const normalized = prompt.trim().replace(/\s+/g, " ");
	const patterns = [
		/^(?:explore|research|investigate)\s+this\s+(?:problem|conjecture|question):\s+(.+)$/i,
		/^find\s+approaches\s+to\s+this\s+(?:problem|conjecture|question):\s+(.+)$/i,
		/^try\s+to\s+solve\s+this\s+(?:problem|conjecture|question):\s+(.+)$/i,
		/^(?:explore|research|investigate)\s+(.+)$/i,
	];
	for (const pattern of patterns) {
		const match = pattern.exec(normalized);
		const problem = match?.[1]?.trim();
		if (problem && !isIncompleteExplorationProblem(problem)) {
			return problem;
		}
	}
	return undefined;
}

function isIncompleteExplorationPrompt(prompt: string): boolean {
	return /^(?:explore|research|investigate)\s+this\s+(?:problem|conjecture|question):?$/i.test(prompt.trim());
}

function isIncompleteExplorationProblem(problem: string): boolean {
	return /^this\s+(?:problem|conjecture|question):?$/i.test(problem.trim());
}

function findResearchPath(state: Pick<CoMathProjectState, "researchPaths">, query: string): ResearchPath | undefined {
	const numbered = parseResearchPathNumber(query);
	if (numbered !== undefined) {
		return state.researchPaths[numbered - 1];
	}
	const normalizedQuery = normalizePathQuery(query);
	const terms = normalizedQuery.split(/\s+/).filter((term) => term.length > 2);
	let best: { path: ResearchPath; score: number } | undefined;
	for (const path of state.researchPaths) {
		const title = normalizePathQuery(path.title);
		const objective = normalizePathQuery(path.objective);
		const score = terms.reduce((total, term) => {
			if (title.includes(term)) {
				return total + 3;
			}
			if (objective.includes(term)) {
				return total + 1;
			}
			return total;
		}, 0);
		if (score > 0 && (!best || score > best.score)) {
			best = { path, score };
		}
	}
	return best?.path;
}

function chooseNaturalSteeringResearchPath(state: CoMathProjectState, prompt: string): ResearchPath | undefined {
	const namedPath = findResearchPath(state, prompt);
	if (namedPath && namedPath.status !== "abandoned") {
		return namedPath;
	}
	return resolveDefaultContinueResearchPath(state).path;
}

function chooseInitialResearchPath(
	state: CoMathProjectState,
	input: { initialFocusSlug: string; preferLiterature: boolean },
): ResearchPath | undefined {
	if (input.preferLiterature) {
		const literaturePath = state.researchPaths.find((path) =>
			/\b(?:known theorem|literature|reference|source)\b/i.test(`${path.title} ${path.objective}`),
		);
		if (literaturePath) {
			return literaturePath;
		}
	}
	const slugTitle = input.initialFocusSlug.replace(/-/g, " ");
	const initialBySlug = findResearchPath(state, slugTitle);
	return initialBySlug ?? state.researchPaths.find((path) => path.priority === 1);
}

function saveNaturalResearchSteering(
	state: CoMathProjectState,
	prompt: string,
	path: ResearchPath | undefined,
	now: string,
): CoMathProjectState {
	const noteText = summarizeNaturalSteeringPrompt(prompt);
	let nextState = upsertWorkingPaperSectionByTitle(state, {
		title: "User steering",
		body: `- ${noteText}`,
		status: "draft",
		now,
		actor: "human",
	});
	if (path) {
		nextState = setResearchFocus(nextState, {
			pathIds: [path.id],
			reason: `User steering: ${noteText}`,
			now,
			actor: "human",
		});
	}
	const section = nextState.workingPaperSections.find(
		(candidate) => candidate.title.trim().toLowerCase() === "user steering",
	);
	nextState = addMarginNote(nextState, {
		id: `margin-note-${nextState.marginNotes.length + 1}`,
		kind: "comment",
		subjectId: path?.id ?? section?.id ?? nextState.projectId,
		...(section ? { sectionId: section.id } : {}),
		message: `User steering: ${noteText}`,
		now,
		actor: "human",
	});
	return nextState;
}

function summarizeNaturalSteeringPrompt(prompt: string): string {
	const normalized = prompt.trim().replace(/\s+/g, " ");
	if (normalized.length <= 220) {
		return normalized;
	}
	return `${normalized.slice(0, 217).trimEnd()}...`;
}

function parseResearchPathNumber(query: string): number | undefined {
	const match = /^\s*(?:path\s*)?(\d+)\s*$/i.exec(trimTerminalPunctuation(query.trim()));
	if (!match?.[1]) {
		return undefined;
	}
	const pathNumber = Number.parseInt(match[1], 10);
	return pathNumber > 0 ? pathNumber : undefined;
}

const RESEARCH_PATH_ORDINALS: Record<string, number> = {
	first: 1,
	second: 2,
	third: 3,
	fourth: 4,
	fifth: 5,
};

/**
 * Match natural beginner phrasings that should start (or continue) a numbered research path, e.g.
 * "continue path 1", "please continue with path 1", "run path 2", "start the first path", or a bare
 * "continue". Returns `undefined` when the prompt is not a continuation request so normal handling
 * (the research-state summary) takes over.
 */
function parseResearchPathContinuationPrompt(
	state: CoMathProjectState,
	prompt: string,
): { explicit: boolean; path?: ResearchPath } | undefined {
	const stripped = stripCoMathPolitePrefix(prompt.trim());
	const match = /^(continue|run|start|try)\b\s*(?:with\s+)?(.*)$/i.exec(stripped);
	if (!match) {
		return undefined;
	}
	const verb = match[1].toLowerCase();
	const target = (match[2] ?? "").trim();
	if (target.length === 0) {
		// A bare verb. "continue" keeps the focus/priority fallback; "run"/"start"/"try" on their own
		// are too ambiguous to treat as a path continuation.
		return verb === "continue" ? resolveDefaultContinueResearchPath(state) : undefined;
	}
	const index = parseResearchPathOrdinal(target) ?? parseResearchPathNumber(target);
	if (index !== undefined) {
		const path = state.researchPaths[index - 1];
		if (path && path.status !== "abandoned") {
			return { explicit: true, path };
		}
		return { explicit: true };
	}
	// A non-numeric target. Keep fuzzy path-name matching for "continue …" only; the beginner verbs
	// require an explicit numbered/ordinal path so unrelated prompts ("run a quick check") still fall
	// through to the normal summary.
	if (verb !== "continue") {
		return undefined;
	}
	const path = findResearchPath(state, target);
	if (path && path.status !== "abandoned") {
		return { explicit: true, path };
	}
	return { explicit: true };
}

function resolveDefaultContinueResearchPath(state: CoMathProjectState): { explicit: boolean; path?: ResearchPath } {
	const focused = state.researchFocus?.pathIds
		.map((pathId) => state.researchPaths.find((path) => path.id === pathId))
		.find((path): path is ResearchPath => path !== undefined && path.status !== "abandoned");
	if (focused) {
		return { explicit: false, path: focused };
	}
	return {
		explicit: false,
		path: [...state.researchPaths]
			.filter((path) => path.status === "active" || path.status === "promising")
			.sort((a, b) => a.priority - b.priority)[0],
	};
}

/**
 * Resolve a small set of ordinal words ("first" … "fifth", optionally wrapped in "the …" / "… path")
 * to a 1-based path index. Returns `undefined` for anything that is not purely an ordinal so free-text
 * like "first-order logic" falls through to fuzzy matching instead.
 */
function parseResearchPathOrdinal(query: string): number | undefined {
	const normalized = query
		.toLowerCase()
		.replace(/[^a-z\s]/g, " ")
		.replace(/\b(?:the|path|paths|with|one)\b/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return RESEARCH_PATH_ORDINALS[normalized];
}

function normalizePathQuery(value: string): string {
	return value
		.toLowerCase()
		.replace(/\b(?:the|a|an|path|on|to)\b/g, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function findPersistedLiteratureSource(
	current: readonly LiteratureSourceArtifact[],
	previous: readonly LiteratureSourceArtifact[],
	source: LiteratureSourceResult,
): LiteratureSourceArtifact | undefined {
	const previousIds = new Set(previous.map((candidate) => candidate.id));
	return (
		current.find((candidate) => !previousIds.has(candidate.id)) ??
		current.find((candidate) => {
			if (source.url && candidate.url === source.url) return true;
			if (source.path && candidate.path === source.path) return true;
			return candidate.title.toLowerCase() === source.title.trim().toLowerCase();
		})
	);
}

function buildResearchCoordinatorWorkingPaperBody(
	report: Pick<
		ResearchCoordinatorReportRecord,
		"whatWeKnow" | "roadblocks" | "recommendedNextMoves" | "humanHelpUseful" | "suggestedPrompt" | "suggestedPathId"
	>,
): string {
	return [
		"Project coordinator synthesis",
		"",
		"What we know:",
		...report.whatWeKnow.map((item) => `- ${item}`),
		"",
		"Current roadblocks:",
		...report.roadblocks.map((item) => `- ${item}`),
		"",
		"Recommended next moves:",
		...report.recommendedNextMoves.map((move, index) => {
			const prompt = move.prompt ? ` (${move.prompt})` : "";
			return `${index + 1}. ${move.title}${prompt}: ${move.rationale}`;
		}),
		...(report.humanHelpUseful.length > 0
			? ["", "Human help useful:", ...report.humanHelpUseful.map((item) => `- ${item}`)]
			: []),
		...(report.suggestedPrompt ? ["", `Suggested next step: ${report.suggestedPrompt}`] : []),
	].join("\n");
}

function getCoordinatorSuggestedPrompt(
	state: Pick<CoMathProjectState, "researchPaths">,
	report: Pick<ResearchCoordinatorReportRecord, "suggestedPrompt" | "suggestedPathId" | "recommendedNextMoves">,
): string | undefined {
	if (report.suggestedPrompt) {
		return report.suggestedPrompt;
	}
	const path = report.suggestedPathId
		? state.researchPaths.find((candidate) => candidate.id === report.suggestedPathId)
		: undefined;
	if (path) {
		const index = state.researchPaths.findIndex((candidate) => candidate.id === path.id);
		return `continue path ${index + 1}`;
	}
	return report.recommendedNextMoves[0]?.prompt;
}
