import { stat } from "node:fs/promises";
import * as nodePath from "node:path";
import type {
	CoMathProjectState,
	LiteratureSourceArtifact,
	ResearchCoordinatorReportRecord,
	ResearchPath,
	ResearchWorkstreamRunRecord,
	ResearchWorkstreamRunStage,
} from "../../../examples/extensions/co-math/schema.ts";
import {
	addComputationalArtifact,
	addLiteratureClaimSupport,
	addLiteratureSourceArtifact,
	addMarginNote,
	addResearchCoordinatorReport,
	addResearchPath,
	addResearchWorkstreamIncrementalReport,
	addResearchWorkstreamReport,
	addResearchWorkstreamRun,
	failStaleResearchWorkstreamRuns,
	getActiveResearchWorkstreamRun,
	getLatestResearchCoordinatorReport,
	getLatestResearchWorkstreamReport,
	getLatestResearchWorkstreamReportForPath,
	getLatestResearchWorkstreamRun,
	loadProjectState,
	STALE_RESEARCH_WORKSTREAM_RUN_REASON,
	saveProjectState,
	setResearchFocus,
	updateComputationalArtifact,
	updateResearchPath,
	updateResearchWorkstreamRun,
	upsertWorkingPaperSectionByTitle,
} from "../../../examples/extensions/co-math/storage.ts";
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
import {
	type ComputationResearchWorkstreamResult,
	isComputationalResearchPath,
	runComputationResearchWorkstreamStaged,
} from "./comath-computation-workstream.ts";
import { runResearchCoordinatorSynthesis } from "./comath-coordinator-synthesis.ts";
import type { LiteratureSourceLookup, LiteratureSourceResult } from "./comath-literature-source.ts";
import { createDefaultLiteratureSourceLookup } from "./comath-literature-source.ts";
import {
	isLiteratureResearchPath,
	type LiteratureResearchWorkstreamResult,
	runLiteratureResearchWorkstreamStaged,
} from "./comath-literature-workstream.ts";
import {
	formatBackgroundRunStarted,
	formatCoMathProductHelp,
	formatContextRecorded,
	formatFocusNoted,
	formatInitialValidationPlan,
	formatLatestResearchCoordinatorReportMissing,
	formatProductProgress,
	formatReadyForContext,
	formatResearchCoordinatorReport,
	formatResearchFocusUpdated,
	formatResearchModelFallbackNote,
	formatResearchPathDropped,
	formatResearchStateSummary,
	formatResearchWorkspacePrepared,
	formatResearchWorkstreamAlreadyRunning,
	formatResearchWorkstreamCompleted,
	formatResearchWorkstreamReport,
	formatResearchWorkstreamRunFailed,
	formatResearchWorkstreamRunProgress,
	formatResearchWorkstreamRunStarted,
	formatResearchWorkstreamRunStillRunningReport,
	formatResearchWorkstreamStageStarted,
	formatResearchWorkstreamStarted,
	formatSetupStep,
	formatSteeringNoted,
	formatWaitingForContext,
} from "./comath-progress.ts";
import {
	isShowLatestCoordinatorReportPrompt,
	isShowLatestReportPrompt,
	isShowProgressPrompt,
	isShowReportForPathPrompt,
	isShowResearchStatePrompt,
	parseNaturalResearchQuestion,
	stripCoMathPolitePrefix,
} from "./comath-prompts.ts";
import { createCoMathResearchAutoPlan } from "./comath-research-autoplan.ts";
import {
	type ResearchWorkstreamModelExecutor,
	type ResearchWorkstreamStageResult,
	runModelBackedResearchWorkstreamStaged,
} from "./comath-research-model-workstream.ts";
import { type ResearchWorkstreamReport, runResearchWorkstream } from "./comath-research-workstream.ts";
import type { CoMathSource } from "./comath-source.ts";

export type CoMathHarnessNoticeType = "info" | "warning" | "error";
export type CoMathHarnessNotify = (message: string, type?: CoMathHarnessNoticeType) => void | Promise<void>;
type CoMathPendingInitialIntent = { kind: "explore-problem" };
export interface CoMathBackendCommandResult {
	ok: boolean;
	messages: string[];
}
export type CoMathBackendCommandRunner = (args: string) => Promise<CoMathBackendCommandResult>;
export interface CoMathResearchWorkstreamActivityStartInput {
	state: Pick<CoMathProjectState, "researchPaths">;
	run: ResearchWorkstreamRunRecord;
}
export interface CoMathResearchWorkstreamActivityUpdateInput extends CoMathResearchWorkstreamActivityStartInput {
	stage: ResearchWorkstreamRunStage;
	summary: string;
}
export interface CoMathResearchWorkstreamActivityEndInput {
	runId: string;
}
export type CoMathResearchWorkstreamActivityStart = (
	input: CoMathResearchWorkstreamActivityStartInput,
) => void | Promise<void>;
export type CoMathResearchWorkstreamActivityUpdate = (
	input: CoMathResearchWorkstreamActivityUpdateInput,
) => void | Promise<void>;
export type CoMathResearchWorkstreamActivityEnd = (
	input: CoMathResearchWorkstreamActivityEndInput,
) => void | Promise<void>;

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
	private readonly literatureSourceLookup: LiteratureSourceLookup;
	private readonly computationalExecutor: ComputationalExecutor;
	private readonly onResearchWorkstreamActivityStart: CoMathResearchWorkstreamActivityStart | undefined;
	private readonly onResearchWorkstreamActivityUpdate: CoMathResearchWorkstreamActivityUpdate | undefined;
	private readonly onResearchWorkstreamActivityEnd: CoMathResearchWorkstreamActivityEnd | undefined;
	private readonly activeResearchWorkstreams = new Map<string, Promise<void>>();
	private pendingInitialIntent: CoMathPendingInitialIntent | undefined;

	constructor(options: CoMathHarnessOptions) {
		this.source = options.source;
		this.statePath = options.statePath;
		this.notify = options.notify;
		this.runBackendCommand = options.runBackendCommand;
		this.createPlan = options.createPlan ?? createCoMathAutoPlan;
		this.startFirstRun = options.startFirstRun ?? true;
		this.researchModelExecutor = options.researchModelExecutor;
		this.literatureSourceLookup = options.literatureSourceLookup ?? createDefaultLiteratureSourceLookup();
		this.computationalExecutor = options.computationalExecutor ?? createDefaultComputationalExecutor();
		this.onResearchWorkstreamActivityStart = options.onResearchWorkstreamActivityStart;
		this.onResearchWorkstreamActivityUpdate = options.onResearchWorkstreamActivityUpdate;
		this.onResearchWorkstreamActivityEnd = options.onResearchWorkstreamActivityEnd;
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
			isShowReportForPathPrompt(problem) !== undefined
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
			await this.notify("This looks like a math research question. I’ll explore it as a co-math problem.");
			await this.handleInitialResearchProblem(naturalResearchQuestion);
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
		const initialPath = nextState.researchPaths.find((path) => path.priority === 1);
		if (initialPath) {
			nextState = setResearchFocus(nextState, {
				pathIds: [initialPath.id],
				reason: "Start with the most concrete research path.",
				now,
				actor: "human",
			});
		}
		await saveProjectState(this.statePath, nextState);
		await this.notify(formatResearchWorkspacePrepared(plan));
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
		if (state?.researchPaths.length) {
			await this.handleResearchSteeringPrompt(state, prompt);
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
		const reconciled = await this.reconcileStaleResearchWorkstreamRuns(state);
		state = reconciled.state;
		const latestInterruptedRun = reconciled.interruptedRuns.at(-1);
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
			if (isShowProgressPrompt(prompt) && latestInterruptedRun) {
				await this.notify(formatResearchWorkstreamRunFailed({ state, run: latestInterruptedRun }), "warning");
				return;
			}
			const activeRun = getActiveResearchWorkstreamRun(state);
			if (isShowProgressPrompt(prompt) && activeRun) {
				await this.notify(formatResearchWorkstreamRunProgress({ state, run: activeRun }));
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
			if (latestInterruptedRun) {
				await this.notify(formatResearchWorkstreamRunFailed({ state, run: latestInterruptedRun }), "warning");
			}
			await this.runResearchWorkstreamForPath(state, path);
			return;
		}
		await this.notify(formatResearchStateSummary(state));
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

	private async reconcileStaleResearchWorkstreamRuns(state: CoMathProjectState): Promise<{
		state: CoMathProjectState;
		interruptedRuns: ResearchWorkstreamRunRecord[];
	}> {
		const inProcessRunIds = new Set(this.activeResearchWorkstreams.keys());
		const staleRunIds = state.researchWorkstreamRuns
			.filter((run) => (run.status === "queued" || run.status === "running") && !inProcessRunIds.has(run.id))
			.map((run) => run.id);
		if (staleRunIds.length === 0) {
			return { state, interruptedRuns: [] };
		}
		const nextState = failStaleResearchWorkstreamRuns(state, {
			activeRunIds: [...inProcessRunIds],
			now: new Date().toISOString(),
			actor: "system",
			reason: STALE_RESEARCH_WORKSTREAM_RUN_REASON,
		});
		await saveProjectState(this.statePath, nextState);
		for (const staleRunId of staleRunIds) {
			await this.notifyResearchWorkstreamActivityEnd(staleRunId);
		}
		const staleRunIdSet = new Set(staleRunIds);
		return {
			state: nextState,
			interruptedRuns: nextState.researchWorkstreamRuns.filter((run) => staleRunIdSet.has(run.id)),
		};
	}

	/**
	 * Run a coordinator-managed research workstream for a single path: specialist attempt, critic
	 * review, and synthesis. Use a model-backed pass when an executor is configured, falling back to
	 * deterministic execution if it is absent or fails. Persist the durable structured report, update
	 * the path, working paper, and margin notes, then surface only curated progress to the user.
	 */
	private async runResearchWorkstreamForPath(state: CoMathProjectState, path: ResearchPath): Promise<void> {
		const now = new Date().toISOString();
		if (this.researchModelExecutor) {
			const runId = `research-run-${state.researchWorkstreamRuns.length + 1}`;
			const nextState = addResearchWorkstreamRun(state, {
				id: runId,
				pathId: path.id,
				pathTitle: path.title,
				currentStage: "coordinator",
				now,
				actor: "system",
			});
			await saveProjectState(this.statePath, nextState);
			const run = nextState.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
			if (run) {
				await this.notifyResearchWorkstreamActivityStart(nextState, run);
				await this.notify(formatResearchWorkstreamRunStarted({ state: nextState, run }));
			}
			const workstream = this.executeResearchWorkstreamInBackground(runId)
				.catch(async (error: unknown) => {
					await this.markResearchWorkstreamRunFailed(runId, safeErrorMessage(error));
				})
				.finally(async () => {
					this.activeResearchWorkstreams.delete(runId);
					await this.notifyResearchWorkstreamActivityEnd(runId);
				});
			this.activeResearchWorkstreams.set(runId, workstream);
			void workstream;
			return;
		}

		const runId = `research-run-${state.researchWorkstreamRuns.length + 1}`;
		let nextState = addResearchWorkstreamRun(state, {
			id: runId,
			pathId: path.id,
			pathTitle: path.title,
			currentStage: "coordinator",
			now,
			actor: "system",
		});
		const report = runResearchWorkstream({
			rootQuestion: state.rootQuestion,
			path,
			allPaths: state.researchPaths,
			now,
		});
		nextState = this.appendIncrementalReports(nextState, runId, report, now);
		nextState = this.persistResearchWorkstreamReport(nextState, path, report, now);
		const finalReportId = nextState.researchReports.at(-1)?.id;
		nextState = updateResearchWorkstreamRun(nextState, {
			runId,
			status: "completed",
			currentStage: "synthesizer",
			completedAt: report.completedAt,
			...(finalReportId ? { finalReportId } : {}),
			now,
			actor: "synthesizer",
		});
		await saveProjectState(this.statePath, nextState);
		await this.notify(formatResearchWorkstreamStarted({ state: nextState, report }));
		await this.notify(formatResearchWorkstreamCompleted({ state: nextState, report }));
	}

	private async executeResearchWorkstreamInBackground(runId: string): Promise<void> {
		const state = await loadProjectState(this.statePath);
		const run = state?.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
		const path = run ? state?.researchPaths.find((candidate) => candidate.id === run.pathId) : undefined;
		if (!state || !run || !path) {
			return;
		}
		const now = new Date().toISOString();
		try {
			if (isLiteratureResearchPath(path)) {
				const literatureResult = await runLiteratureResearchWorkstreamStaged(
					{
						rootQuestion: state.rootQuestion,
						path,
						allPaths: state.researchPaths,
						now,
						executor: this.researchModelExecutor as ResearchWorkstreamModelExecutor,
						sourceLookup: this.literatureSourceLookup,
					},
					{
						onStageStarted: async (stage, summary) => {
							await this.saveResearchWorkstreamStageStarted(state, run, stage, summary);
						},
						onStageCompleted: async (result) => {
							await this.saveResearchWorkstreamStage(runId, {
								stage: result.stage,
								status: "completed",
								title: result.title,
								summary: result.summary,
								details: result.details,
							});
						},
					},
				);
				await this.completeLiteratureResearchWorkstreamRun(runId, literatureResult);
				return;
			}
			if (isComputationalResearchPath(path)) {
				const artifactPaths = this.getComputationArtifactPaths(runId);
				const computationResult = await runComputationResearchWorkstreamStaged(
					{
						rootQuestion: state.rootQuestion,
						path,
						allPaths: state.researchPaths,
						now,
						executor: this.researchModelExecutor as ResearchWorkstreamModelExecutor,
						computationalExecutor: this.computationalExecutor,
						artifactDirectory: artifactPaths.relative,
						workingDirectory: artifactPaths.absolute,
					},
					{
						onStageStarted: async (stage, summary) => {
							await this.saveResearchWorkstreamStageStarted(state, run, stage, summary);
						},
						onStageCompleted: async (result) => {
							await this.saveResearchWorkstreamStage(runId, {
								stage: result.stage,
								status: "completed",
								title: result.title,
								summary: result.summary,
								details: result.details,
							});
						},
					},
				);
				await this.completeComputationResearchWorkstreamRun(runId, computationResult);
				return;
			}
			const report = await runModelBackedResearchWorkstreamStaged(
				{
					rootQuestion: state.rootQuestion,
					path,
					allPaths: state.researchPaths,
					now,
					executor: this.researchModelExecutor as ResearchWorkstreamModelExecutor,
				},
				{
					onStageStarted: async (stage, summary) => {
						await this.saveResearchWorkstreamStageStarted(state, run, stage, summary);
					},
					onStageCompleted: async (result) => {
						await this.saveResearchWorkstreamStage(runId, {
							stage: result.stage,
							status: "completed",
							title: result.title,
							summary: result.summary,
							details: result.details,
						});
					},
				},
			);
			await this.completeResearchWorkstreamRun(runId, report);
		} catch (error: unknown) {
			await this.completeResearchWorkstreamWithFallback(runId, error);
		}
	}

	private async saveResearchWorkstreamStageStarted(
		state: CoMathProjectState,
		run: ResearchWorkstreamRunRecord,
		stage: ResearchWorkstreamRunStage,
		summary: string,
	): Promise<void> {
		await this.saveResearchWorkstreamStage(run.id, {
			stage,
			status: "running",
			title: formatStageTitle(stage),
			summary,
			details: [],
		});
		await this.notifyResearchWorkstreamActivityUpdate(state, run, stage, summary);
		if (stage === "coordinator") {
			return;
		}
		await this.notify(formatResearchWorkstreamStageStarted({ state, run, stage, summary }));
	}

	private async saveResearchWorkstreamStage(
		runId: string,
		input: Pick<ResearchWorkstreamStageResult, "stage" | "title" | "summary" | "details"> & {
			status: "running" | "completed" | "blocked" | "failed";
		},
	): Promise<void> {
		const state = await loadProjectState(this.statePath);
		if (!state?.researchWorkstreamRuns.some((run) => run.id === runId)) {
			return;
		}
		const now = new Date().toISOString();
		let nextState = updateResearchWorkstreamRun(state, {
			runId,
			...(input.status === "running" ? { status: "running" } : {}),
			currentStage: input.stage,
			now,
			actor: "system",
		});
		if (input.stage === "coordinator" && input.status === "running") {
			await saveProjectState(this.statePath, nextState);
			return;
		}
		nextState = addResearchWorkstreamIncrementalReport(nextState, {
			runId,
			stage: input.stage,
			status: input.status,
			title: input.title,
			summary: input.summary,
			details: input.details,
			now,
			actor: "system",
		});
		await saveProjectState(this.statePath, nextState);
	}

	private async completeResearchWorkstreamRun(runId: string, report: ResearchWorkstreamReport): Promise<void> {
		const state = await loadProjectState(this.statePath);
		const path = state?.researchPaths.find((candidate) => candidate.id === report.pathId);
		if (!state || !path) {
			return;
		}
		const now = new Date().toISOString();
		let nextState = this.persistResearchWorkstreamReport(state, path, report, now);
		const finalReportId = nextState.researchReports.at(-1)?.id;
		nextState = updateResearchWorkstreamRun(nextState, {
			runId,
			status: "completed",
			currentStage: "synthesizer",
			completedAt: report.completedAt,
			...(finalReportId ? { finalReportId } : {}),
			now,
			actor: "synthesizer",
		});
		await saveProjectState(this.statePath, nextState);
		await this.notify(formatResearchWorkstreamCompleted({ state: nextState, report }));
	}

	private async completeLiteratureResearchWorkstreamRun(
		runId: string,
		result: LiteratureResearchWorkstreamResult,
	): Promise<void> {
		const state = await loadProjectState(this.statePath);
		const path = state?.researchPaths.find((candidate) => candidate.id === result.report.pathId);
		if (!state || !path) {
			return;
		}
		const now = new Date().toISOString();
		let nextState = state;
		const sourceIdMap = new Map<string, string>();
		for (const [index, source] of result.sources.entries()) {
			const before = nextState.literatureSources;
			nextState = addLiteratureSourceArtifact(nextState, {
				kind: source.kind,
				title: source.title,
				...(source.url ? { url: source.url } : {}),
				...(source.path ? { path: source.path } : {}),
				authors: source.authors ?? [],
				...(source.year ? { year: source.year } : {}),
				summary: source.summary,
				...(source.extractedText ? { extractedText: source.extractedText } : {}),
				now,
				actor: "system",
			});
			const persisted = findPersistedLiteratureSource(nextState.literatureSources, before, source);
			if (persisted) {
				sourceIdMap.set(`source-${index + 1}`, persisted.id);
			}
		}
		const sourceIds = uniqueStrings([...sourceIdMap.values()]);
		const claimSupportIds: string[] = [];
		for (const support of result.claimSupports) {
			nextState = addLiteratureClaimSupport(nextState, {
				pathId: path.id,
				claim: support.claim,
				sourceIds: support.sourceIds.map((sourceId) => sourceIdMap.get(sourceId) ?? sourceId),
				status: support.status,
				...(support.note ? { note: support.note } : {}),
				now,
				actor: "reviewer",
			});
			const claimSupportId = nextState.literatureClaimSupports.at(-1)?.id;
			if (claimSupportId) {
				claimSupportIds.push(claimSupportId);
			}
		}
		const report: ResearchWorkstreamReport = {
			...result.report,
			sourceIds,
			claimSupportIds,
			promisingStrategy: result.report.promisingStrategy.map((item) => remapSourceLabels(item, sourceIdMap)),
			findings: result.report.findings.map((item) => remapSourceLabels(item, sourceIdMap)),
			criticisms: result.report.criticisms.map((item) => remapSourceLabels(item, sourceIdMap)),
			gaps: result.report.gaps.map((item) => remapSourceLabels(item, sourceIdMap)),
			steps: result.report.steps.map((step) => ({
				...step,
				details: step.details.map((detail) => remapSourceLabels(detail, sourceIdMap)),
			})),
			workingPaperSummary: remapSourceLabels(result.report.workingPaperSummary, sourceIdMap),
		};
		nextState = this.persistResearchWorkstreamReport(nextState, path, report, now);
		const finalReportId = nextState.researchReports.at(-1)?.id;
		nextState = updateResearchWorkstreamRun(nextState, {
			runId,
			status: report.status === "blocked" ? "blocked" : "completed",
			currentStage: "synthesizer",
			completedAt: report.completedAt,
			...(finalReportId ? { finalReportId } : {}),
			now,
			actor: "synthesizer",
		});
		await saveProjectState(this.statePath, nextState);
		await this.notify(formatResearchWorkstreamCompleted({ state: nextState, report }));
	}

	private async completeComputationResearchWorkstreamRun(
		runId: string,
		result: ComputationResearchWorkstreamResult,
	): Promise<void> {
		const state = await loadProjectState(this.statePath);
		const path = state?.researchPaths.find((candidate) => candidate.id === result.report.pathId);
		if (!state || !path) {
			return;
		}
		const now = new Date().toISOString();
		let nextState = state;
		const computationalArtifactIds: string[] = [];
		for (const artifact of result.artifacts) {
			nextState = addComputationalArtifact(nextState, {
				pathId: path.id,
				runId,
				kind: artifact.kind,
				status: artifact.status,
				title: artifact.title,
				...(artifact.filePath ? { filePath: artifact.filePath } : {}),
				...(artifact.command ? { command: artifact.command } : {}),
				...(artifact.exitCode !== undefined ? { exitCode: artifact.exitCode } : {}),
				summary: artifact.summary,
				now,
				actor: "system",
			});
			const persisted = nextState.computationalArtifacts.at(-1);
			if (persisted) {
				computationalArtifactIds.push(persisted.id);
			}
		}
		const report: ResearchWorkstreamReport = {
			...result.report,
			computationalArtifactIds,
		};
		nextState = this.persistResearchWorkstreamReport(nextState, path, report, now);
		const finalReportId = nextState.researchReports.at(-1)?.id;
		if (finalReportId) {
			for (const artifactId of computationalArtifactIds) {
				nextState = updateComputationalArtifact(nextState, {
					artifactId,
					reportId: finalReportId,
					now,
					actor: "system",
				});
			}
		}
		nextState = updateResearchWorkstreamRun(nextState, {
			runId,
			status: report.status === "blocked" ? "blocked" : "completed",
			currentStage: "synthesizer",
			completedAt: report.completedAt,
			...(finalReportId ? { finalReportId } : {}),
			now,
			actor: "synthesizer",
		});
		await saveProjectState(this.statePath, nextState);
		await this.notify(formatResearchWorkstreamCompleted({ state: nextState, report }));
	}

	private async completeResearchWorkstreamWithFallback(runId: string, error: unknown): Promise<void> {
		const state = await loadProjectState(this.statePath);
		const run = state?.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
		const path = run ? state?.researchPaths.find((candidate) => candidate.id === run.pathId) : undefined;
		if (!state || !run || !path) {
			return;
		}
		const now = new Date().toISOString();
		try {
			const report = runResearchWorkstream({
				rootQuestion: state.rootQuestion,
				path,
				allPaths: state.researchPaths,
				now,
			});
			let nextState = updateResearchWorkstreamRun(state, {
				runId,
				status: "running",
				currentStage: "coordinator",
				usedFallback: true,
				now,
				actor: "system",
			});
			nextState = this.appendIncrementalReports(nextState, runId, report, now);
			nextState = this.persistResearchWorkstreamReport(nextState, path, report, now);
			const finalReportId = nextState.researchReports.at(-1)?.id;
			nextState = updateResearchWorkstreamRun(nextState, {
				runId,
				status: "completed",
				currentStage: "synthesizer",
				completedAt: report.completedAt,
				usedFallback: true,
				...(finalReportId ? { finalReportId } : {}),
				now,
				actor: "synthesizer",
			});
			await saveProjectState(this.statePath, nextState);
			await this.notify(formatResearchModelFallbackNote());
			await this.notify(formatResearchWorkstreamCompleted({ state: nextState, report }));
		} catch (fallbackError: unknown) {
			const failureMessage = safeErrorMessage(fallbackError) || safeErrorMessage(error);
			const latest = (await loadProjectState(this.statePath)) ?? state;
			const failedState = updateResearchWorkstreamRun(latest, {
				runId,
				status: "failed",
				failureReason: failureMessage,
				now: new Date().toISOString(),
				actor: "system",
			});
			await saveProjectState(this.statePath, failedState);
			const failedRun = failedState.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
			if (failedRun) {
				await this.notify(formatResearchWorkstreamRunFailed({ state: failedState, run: failedRun }), "error");
			}
		}
	}

	private async markResearchWorkstreamRunFailed(runId: string, reason: string): Promise<void> {
		const state = await loadProjectState(this.statePath);
		if (!state?.researchWorkstreamRuns.some((run) => run.id === runId)) {
			return;
		}
		const failedState = updateResearchWorkstreamRun(state, {
			runId,
			status: "failed",
			failureReason: reason,
			now: new Date().toISOString(),
			actor: "system",
		});
		await saveProjectState(this.statePath, failedState);
		const run = failedState.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
		if (run) {
			await this.notify(formatResearchWorkstreamRunFailed({ state: failedState, run }), "error");
		}
	}

	private appendIncrementalReports(
		state: CoMathProjectState,
		runId: string,
		report: ResearchWorkstreamReport,
		now: string,
	): CoMathProjectState {
		let nextState = state;
		for (const step of report.steps) {
			nextState = addResearchWorkstreamIncrementalReport(nextState, {
				runId,
				stage: step.role,
				status: "completed",
				title: step.title,
				summary: step.summary,
				details: step.details,
				now,
				actor: "system",
			});
		}
		return nextState;
	}

	/**
	 * Shared persistence for a completed research workstream (model-backed or deterministic): update
	 * the path findings/blockers, upsert the working-paper section, record critic gaps/criticisms as
	 * margin notes, and append the durable structured report. Returns the next state to save.
	 */
	private persistResearchWorkstreamReport(
		state: CoMathProjectState,
		path: ResearchPath,
		report: ResearchWorkstreamReport,
		now: string,
	): CoMathProjectState {
		let nextState = updateResearchPath(state, {
			pathId: path.id,
			latestFindings: [...path.latestFindings, ...report.findings],
			blockers: uniqueStrings([...path.blockers, ...report.gaps]),
			suggestedNextMove: report.suggestedNextMove,
			now,
			actor: "system",
		});
		nextState = upsertWorkingPaperSectionByTitle(nextState, {
			title: report.workingPaperSectionTitle,
			body: report.workingPaperSummary,
			now,
			actor: "synthesizer",
		});
		const section = nextState.workingPaperSections.find(
			(candidate) => candidate.title === report.workingPaperSectionTitle,
		);
		const noteCandidates = [
			...report.gaps.map((message) => ({ kind: "gap" as const, message })),
			...report.criticisms.map((message) => ({ kind: "warning" as const, message })),
		].slice(0, 3);
		for (const candidate of noteCandidates) {
			nextState = addMarginNote(nextState, {
				id: `margin-note-${nextState.marginNotes.length + 1}`,
				kind: candidate.kind,
				subjectId: path.id,
				...(section ? { sectionId: section.id } : {}),
				message: candidate.message,
				now,
				actor: "reviewer",
			});
		}
		return addResearchWorkstreamReport(nextState, {
			pathId: report.pathId,
			pathTitle: report.pathTitle,
			status: report.status,
			startedAt: report.startedAt,
			completedAt: report.completedAt,
			coordinatorBrief: report.coordinatorBrief,
			steps: report.steps,
			promisingStrategy: report.promisingStrategy,
			findings: report.findings,
			criticisms: report.criticisms,
			gaps: report.gaps,
			humanHelpUseful: report.humanHelpUseful,
			suggestedNextMove: report.suggestedNextMove,
			workingPaperSectionTitle: report.workingPaperSectionTitle,
			...(section ? { workingPaperSectionId: section.id } : {}),
			sourceIds: report.sourceIds ?? [],
			claimSupportIds: report.claimSupportIds ?? [],
			computationalArtifactIds: report.computationalArtifactIds ?? [],
			now,
			actor: "synthesizer",
		});
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

	private getComputationArtifactPaths(runId: string): { relative: string; absolute: string } {
		const relative = `.pi/co-math/artifacts/${runId}`;
		const projectRoot = nodePath.dirname(nodePath.dirname(nodePath.dirname(this.statePath)));
		return {
			relative,
			absolute: nodePath.join(projectRoot, relative),
		};
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

	// Research runs execute as background promises after the agent turn ends, so the normal streaming
	// loader does not cover them. These callbacks let a host (interactive mode) surface a footer status
	// for the active run; they are best-effort and decoupled from execution. The interactive wiring is
	// a stopgap pending a first-class background-activity API — see
	// docs/comath-background-activity-api-notes.md.
	private async notifyResearchWorkstreamActivityStart(
		state: Pick<CoMathProjectState, "researchPaths">,
		run: ResearchWorkstreamRunRecord,
	): Promise<void> {
		try {
			await this.onResearchWorkstreamActivityStart?.({ state, run });
		} catch {
			// UI status updates are best-effort and must not affect research execution.
		}
	}

	private async notifyResearchWorkstreamActivityUpdate(
		state: Pick<CoMathProjectState, "researchPaths">,
		run: ResearchWorkstreamRunRecord,
		stage: ResearchWorkstreamRunStage,
		summary: string,
	): Promise<void> {
		try {
			await this.onResearchWorkstreamActivityUpdate?.({ state, run, stage, summary });
		} catch {
			// UI status updates are best-effort and must not affect research execution.
		}
	}

	private async notifyResearchWorkstreamActivityEnd(runId: string): Promise<void> {
		try {
			await this.onResearchWorkstreamActivityEnd?.({ runId });
		} catch {
			// UI status updates are best-effort and must not affect research execution.
		}
	}
}

function trimTerminalPunctuation(value: string): string {
	return value.replace(/[.?!]+$/, "");
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

function isResearchCoordinatorPrompt(prompt: string): boolean {
	return /^(?:what should we try next\??|what next\??|recommend (?:the )?next path|make a plan from current reports|summari[sz]e current state and recommend next steps|what is blocked\??|compare paths|project coordinator summary)$/i.test(
		prompt.trim(),
	);
}

function findResearchPath(state: Pick<CoMathProjectState, "researchPaths">, query: string): ResearchPath | undefined {
	const numbered = parseResearchPathNumber(query);
	if (numbered !== undefined) {
		return state.researchPaths[numbered - 1];
	}
	const normalizedQuery = normalizePathQuery(query);
	return state.researchPaths.find((path) => {
		const haystack = normalizePathQuery(`${path.title} ${path.objective}`);
		return normalizedQuery
			.split(/\s+/)
			.filter((term) => term.length > 2)
			.some((term) => haystack.includes(term));
	});
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

function formatStageTitle(stage: ResearchWorkstreamRunStage): string {
	if (stage === "coordinator") {
		return "Coordinator brief";
	}
	if (stage === "literature-search") {
		return "Literature search";
	}
	if (stage === "computation") {
		return "Computation";
	}
	if (stage === "specialist") {
		return "Specialist attempt";
	}
	if (stage === "critic") {
		return "Critic review";
	}
	return "Synthesis";
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

function remapSourceLabels(value: string, sourceIdMap: ReadonlyMap<string, string>): string {
	let remapped = value;
	for (const [temporaryId, persistedId] of sourceIdMap) {
		remapped = remapped.replaceAll(`[${temporaryId}]`, `[${persistedId}]`);
	}
	return remapped;
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

function safeErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}
	if (typeof error === "string" && error.trim().length > 0) {
		return error.trim();
	}
	return "The research attempt stopped unexpectedly.";
}

function uniqueStrings(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}
