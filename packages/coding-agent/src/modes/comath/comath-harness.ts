import { dirname, join } from "node:path";
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
	coordinatorSynthesisInputsMatchState,
	runResearchCoordinatorSynthesis,
} from "./comath-coordinator-synthesis.ts";
import type { LiteratureSourceLookup, LiteratureSourceResult } from "./comath-literature-source.ts";
import {
	formatBackgroundRunStarted,
	formatCoMathNonMathEntryGuidance,
	formatCoMathProductHelp,
	formatCoMathResearchModeOperationalPromptIgnored,
	formatCoMathResearchPhaseActivityStatus,
	formatConjectureLineage,
	formatContextRecorded,
	formatDifferentResearchQuestionDetected,
	formatFocusNoted,
	formatInitialValidationPlan,
	formatLatestResearchCoordinatorReportMissing,
	formatProductProgress,
	formatReadyForContext,
	formatResearchConstraintRecorded,
	formatResearchCoordinatorReport,
	formatResearchEvidenceBoardSummary,
	formatResearchFocusUpdated,
	formatResearchNaturalSteeringQueued,
	formatResearchNaturalSteeringStarted,
	formatResearchObligationsSummary,
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
	isDifferentResearchQuestion,
	isLikelyMathValidationPrompt,
	isLikelyOperationalNonMathPrompt,
	isResearchCoordinatorPrompt,
	isResumeResearchBatchPrompt,
	isShowConjectureLineagePrompt,
	isShowEvidencePrompt,
	isShowLatestCoordinatorReportPrompt,
	isShowLatestReportPrompt,
	isShowObligationsPrompt,
	isShowProblemStatePrompt,
	isShowProgressPrompt,
	isShowReportForPathPrompt,
	isShowResearchPlanPrompt,
	isShowResearchStatePrompt,
	type ParsedCoMathSourceIntent,
	type ParsedResearchPlanExecutionPrompt,
	type ParsedUserProvidedLiteratureSource,
	parseCancelResearchBatchPrompt,
	parseCoMathSourceIntent,
	parseNaturalResearchQuestion,
	parseResearchBatchPrompt,
	parseResearchConstraintPrompt,
	parseResearchPlanExecutionPrompt,
	parseUserProvidedLiteratureSourcePrompt,
	stripCoMathPolitePrefix,
} from "./comath-prompts.ts";
import { createCoMathResearchAutoPlan } from "./comath-research-autoplan.ts";
import {
	applyProposedResearchPlan,
	type ProposeResearchPlanResult,
	proposeResearchPlan,
} from "./comath-research-director.ts";
import { buildStateOfProblemDocument } from "./comath-research-product.ts";
import {
	CO_MATH_SOURCE_POLICY_VERSION,
	type CoMathSource,
	isUsableCoMathSource,
	resolveCoMathSource,
} from "./comath-source.ts";
import { formatCoMathSourceContextIndex, loadCoMathSourceContext } from "./comath-source-context.ts";
import {
	buildCoMathSourceIndex,
	type CoMathStagedSourceIndex,
	discardStagedCoMathSourceIndex,
} from "./comath-source-index.ts";
import {
	type CoMathSourceSnapshot,
	createCoMathSourceSnapshot,
	loadCoMathSourceSnapshot,
} from "./comath-source-snapshot.ts";
import { CoMathStateStore } from "./comath-state-store.ts";
import { CoMathTaskEngine } from "./comath-task-engine.ts";
import type { ResearchWorkstreamModelExecutor } from "./comath-task-model.ts";
import { CoMathTaskScheduler } from "./comath-task-scheduler.ts";
import { type ResearchPlanResumeResult, resumeResearchPlan } from "./comath-task-state.ts";
import type {
	CoMathProjectState,
	LiteratureSourceArtifact,
	ResearchCoordinatorReportRecord,
	ResearchPath,
	ResearchPlanRecord,
	ResearchPlanTaskKind,
} from "./schema.ts";
import {
	addArtifact,
	addCoMathSourceIndex,
	addLiteratureSourceArtifact,
	addMarginNote,
	addResearchConstraint,
	addResearchCoordinatorReport,
	addResearchPath,
	addResearchPlan,
	addResearchPlanTask,
	areResearchPlanTaskDependenciesCompleted,
	getActiveResearchPlan,
	getLatestResearchCoordinatorReport,
	getLatestResearchPlan,
	getLatestResearchWorkstreamReport,
	getLatestResearchWorkstreamReportForPath,
	getPausedResearchPlan,
	getResearchPlanTasks,
	linkLiteratureSourcesToIndex,
	setResearchFocus,
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
export type CoMathResearchPhaseActivitySignal =
	| { kind: "start"; activityId: string; status: string }
	| { kind: "end"; activityId: string };
export type CoMathResearchPhaseActivityNotify = (signal: CoMathResearchPhaseActivitySignal) => void | Promise<void>;

export interface CoMathHarnessOptions {
	source?: CoMathSource;
	statePath: string;
	/** Working directory used to resolve a local source path supplied in the first prompt. */
	sourceCwd?: string;
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
	/**
	 * Best-effort UI status for research work outside a workstream run (planning, the independent
	 * review, plan amendment, synthesis, revision, and the bounded batch step), so the "still
	 * working" indicator never goes dark between run stages.
	 */
	onResearchPhaseActivity?: CoMathResearchPhaseActivityNotify;
	/**
	 * Step budget for the autonomous first run a fresh math question starts (default 3). Clamped to
	 * 1–10: each step is a full model-backed run plus an independent review, so the cap bounds
	 * unprompted model spend even with a misconfigured value.
	 */
	initialResearchStepCount?: number;
	/**
	 * How many independent plan tasks (different research paths, workstream-backed kinds) one
	 * bounded step may run at once. Clamped to 1–3 and DEFAULT 1: parallel completion order is
	 * nondeterministic, so sequential execution stays the library/eval default and callers opt in
	 * explicitly. Durable state commits remain strictly serialized regardless of this value, and
	 * deterministic (no-model) runs are always forced back to 1.
	 */
	maxParallelResearchTasks?: number;
}

export class CoMathHarness {
	private source: CoMathSource | undefined;
	private readonly sourceCwd: string;
	private readonly stateStore: CoMathStateStore;
	private readonly notify: CoMathHarnessNotify;
	private readonly runBackendCommand: CoMathBackendCommandRunner;
	private readonly createPlan: (problemText: string, sourceTitle?: string) => CoMathAutoPlan;
	private readonly startFirstRun: boolean;
	private readonly researchModelExecutor: ResearchWorkstreamModelExecutor | undefined;
	private readonly researchDirectorExecutor: ResearchWorkstreamModelExecutor | undefined;
	private readonly taskEngine: CoMathTaskEngine;
	private readonly taskScheduler: CoMathTaskScheduler;
	private readonly onResearchPhaseActivity: CoMathResearchPhaseActivityNotify | undefined;
	private readonly initialResearchStepCount: number;
	private pendingInitialIntent: CoMathPendingInitialIntent | undefined;

	constructor(options: CoMathHarnessOptions) {
		this.source = options.source;
		this.sourceCwd = options.sourceCwd ?? dirname(dirname(dirname(options.statePath)));
		this.stateStore = new CoMathStateStore(options.statePath);
		this.notify = options.notify;
		this.runBackendCommand = options.runBackendCommand;
		this.createPlan = options.createPlan ?? createCoMathAutoPlan;
		this.startFirstRun = options.startFirstRun ?? true;
		this.researchModelExecutor = options.researchModelExecutor;
		this.researchDirectorExecutor = options.researchDirectorExecutor;
		const computationalExecutor = options.computationalExecutor ?? createDefaultComputationalExecutor();
		this.onResearchPhaseActivity = options.onResearchPhaseActivity;
		this.initialResearchStepCount = clampInitialResearchStepCount(options.initialResearchStepCount);
		this.taskEngine = new CoMathTaskEngine({
			stateStore: this.stateStore,
			...(this.researchModelExecutor ? { modelExecutor: this.researchModelExecutor } : {}),
			...(options.literatureSourceLookup ? { literatureSourceLookup: options.literatureSourceLookup } : {}),
			computationalExecutor,
			notify: this.notify,
		});
		this.taskScheduler = new CoMathTaskScheduler({ stateStore: this.stateStore, taskEngine: this.taskEngine });
	}

	/**
	 * Show a footer status while a harness-driven research phase (plan proposal from an explicit
	 * prompt) runs. Purely cosmetic; failures never affect the phase.
	 */
	private async withPlanningActivity<T>(work: () => Promise<T>): Promise<T> {
		const signal = async (message: CoMathResearchPhaseActivitySignal): Promise<void> => {
			try {
				await this.onResearchPhaseActivity?.(message);
			} catch {
				// UI status updates are best-effort and must not affect research execution.
			}
		};
		await signal({
			kind: "start",
			activityId: "research-plan-proposal",
			status: formatCoMathResearchPhaseActivityStatus("planning"),
		});
		try {
			return await work();
		} finally {
			await signal({ kind: "end", activityId: "research-plan-proposal" });
		}
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
		const sourceIntent = parseCoMathSourceIntent(problem);
		if (await this.hasExistingState()) {
			if (sourceIntent) {
				await this.notify(
					"A CoMath workspace already exists in this directory, so I did not replace it or ingest a new source. Start Pi from a fresh working directory to investigate this source separately.",
					"warning",
				);
				return;
			}
			await this.handleSteeringPrompt(problem);
			return;
		}
		if (!this.source && sourceIntent) {
			await this.handleInitialSourceIntent(sourceIntent);
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
			isShowConjectureLineagePrompt(problem) ||
			isShowObligationsPrompt(problem) ||
			isShowProblemStatePrompt(problem)
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
		const hasUsableSource = isUsableCoMathSource(this.source);
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
		const sourceIntake = hasUsableSource && isSourceOnlyStartPrompt(problem);
		if (sourceIntake && this.source) {
			await this.handleInitialResearchProblem(buildSourceIntakeProblem(this.source), { source: this.source });
			return;
		}
		await this.handleInitialProblem(problem);
	}

	private async handleInitialSourceIntent(intent: ParsedCoMathSourceIntent): Promise<void> {
		let source = await resolveCoMathSource(intent.pathInput, this.sourceCwd);
		const punctuationTrimmed = intent.pathInput.replace(/[.,;:!?]+$/, "");
		if (!source?.exists && punctuationTrimmed !== intent.pathInput) {
			source = await resolveCoMathSource(punctuationTrimmed, this.sourceCwd);
		}
		if (!source || !isUsableCoMathSource(source)) {
			await this.notify(
				`I could not use that source path.\n${source?.missingReason ?? "Source path is not readable."}`,
				"error",
			);
			return;
		}
		if ((intent.kindHint === "directory" && !source.isDirectory) || (intent.kindHint === "file" && !source.isFile)) {
			await this.notify(
				intent.kindHint === "directory"
					? "The supplied source path is a file, not a directory."
					: "The supplied source path is a directory, not a file.",
				"error",
			);
			return;
		}
		this.source = source;
		await this.notify(
			source.isDirectory
				? `Source directory found: ${source.displayName} (${source.files?.length ?? 0} files selected).`
				: `Source file found: ${source.displayName}.`,
		);
		await this.handleInitialResearchProblem(buildSourceIntakeProblem(source, intent.remainingInstruction), {
			source,
		});
	}

	private async handleInitialResearchProblem(
		problem: string,
		options: { source?: CoMathSource } = {},
	): Promise<boolean> {
		const plan = createCoMathResearchAutoPlan(problem);
		if (!(await this.runRequiredCommand(`init ${plan.rootQuestion}`, "Could not prepare the research workspace."))) {
			return false;
		}
		const state = await this.stateStore.load();
		if (!state) {
			await this.notify("Could not load the research workspace after setup.", "error");
			return false;
		}
		if (options.source && !(await this.pinResolvedSourceSnapshot(options.source, plan.rootQuestion))) {
			return false;
		}
		const now = new Date().toISOString();
		let nextState = await this.stateStore.commit((fresh) => {
			let next = fresh;
			for (const path of plan.paths) {
				next = addResearchPath(next, {
					title: path.title,
					objective: path.objective,
					suggestedNextMove: path.suggestedNextMove,
					priority: path.priority,
					now,
					actor: "human",
				});
			}
			const initialPath = chooseInitialResearchPath(next, {
				initialFocusSlug: plan.initialFocusSlug,
			});
			return initialPath
				? setResearchFocus(next, {
						pathIds: [initialPath.id],
						reason: "Start with the most concrete research path.",
						now,
						actor: "human",
					})
				: next;
		}, state);
		await this.notify(formatResearchWorkspacePrepared(plan));
		if (options.source) {
			const proposal = await this.withPlanningActivity(() =>
				proposeResearchPlan(nextState, {
					...(this.researchDirectorExecutor ? { executor: this.researchDirectorExecutor } : {}),
					now: new Date().toISOString(),
					actor: "human",
				}),
			);
			const committed = await this.commitProposedResearchPlan(nextState, proposal);
			nextState = committed.state;
			await this.notify(
				committed.created
					? formatResearchPlanCreated({
							plan: committed.plan,
							tasks: getResearchPlanTasks(committed.state, committed.plan.id),
						})
					: formatResearchPlanSummary({
							plan: committed.plan,
							tasks: getResearchPlanTasks(committed.state, committed.plan.id),
						}),
			);
		}
		// A bare hard-math question starts one durable execution. Legacy batch records are read-only.
		if (this.startFirstRun) {
			await this.notify(
				`Starting a bounded research execution for ${this.initialResearchStepCount} task${this.initialResearchStepCount === 1 ? "" : "s"}.`,
			);
			void this.taskScheduler
				.schedule({ requestedTaskCount: this.initialResearchStepCount, now: new Date().toISOString() })
				.then((result) => this.notifyScheduledExecution(result))
				.catch((error: unknown) =>
					this.notify(
						`Task execution could not start: ${error instanceof Error ? error.message : String(error)}`,
						"error",
					),
				);
		}
		return true;
	}

	private async handleInitialProblem(problem: string): Promise<void> {
		const source = this.source;
		const hasSource = isUsableCoMathSource(source);
		const sourceTitle = hasSource && source ? source.displayName : undefined;
		const explicitWait = shouldWaitForContext(problem);
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
		if (hasSource && source) {
			if (source.files?.some((file) => file.sha256)) {
				if (!(await this.pinResolvedSourceSnapshot(source, plan.rootQuestion))) {
					return;
				}
			} else if (source.isFile) {
				if (
					!(await this.runRequiredCommand(
						`source ${source.absolutePath} ${source.displayName}: Primary source for ${trimTerminalPunctuation(plan.rootQuestion)}`,
						`Could not pin the source file: ${source.displayName}. Check the source path and try again.`,
					))
				) {
					return;
				}
				await this.notify(formatSetupStep(`Source pinned: ${source.displayName}`));
			} else {
				await this.notify("Could not create a revisioned snapshot for the source directory.", "error");
				return;
			}
		} else if (source) {
			await this.notify(
				`Could not pin the source file: ${source.missingReason ?? "source is not readable."}`,
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

	private async pinResolvedSourceSnapshot(source: CoMathSource, rootQuestion: string): Promise<boolean> {
		let snapshot: CoMathSourceSnapshot;
		let stagedIndex: CoMathStagedSourceIndex | undefined;
		try {
			snapshot = await createCoMathSourceSnapshot(source, this.stateStore.statePath);
			stagedIndex = await buildCoMathSourceIndex(snapshot);
			const index = stagedIndex;
			const sourceMaterials = await loadCoMathSourceContext(snapshot, index.index);
			const indexArtifactId = `source-index-artifact-${index.index.indexSha256.slice(0, 16)}`;
			const sourceIndexId = `source-index-${index.index.indexSha256.slice(0, 16)}`;
			await this.stateStore.transactWithArtifacts(
				{
					operation: "source-index-register",
					actor: "human",
					changedEntityIds: [sourceIndexId],
					publishedArtifacts: [{ id: indexArtifactId, sha256: index.publishedContentSha256 }],
				},
				[
					{
						id: indexArtifactId,
						stagingPath: index.stagingPath,
						finalPath: index.finalPath,
						contentPath: "index.json",
						sha256: index.publishedContentSha256,
					},
				],
				(fresh) => {
					const manifestArtifactId = nextArtifactId(fresh);
					let next = addArtifact(fresh, {
						id: manifestArtifactId,
						kind: "source",
						title: `Source manifest for ${source.displayName}`,
						summary: `Immutable source revision ${snapshot.revisionId} covering ${snapshot.files.length} selected files and ${snapshot.totalBytes} bytes.`,
						provenance: `Captured from ${source.absolutePath} with source policy version ${CO_MATH_SOURCE_POLICY_VERSION}.`,
						sourcePath: snapshot.manifestAbsolutePath,
						sourcePathKind: "absolute",
						now: new Date().toISOString(),
						actor: "human",
					});
					next = addArtifact(next, {
						id: indexArtifactId,
						kind: "source",
						title: `Source index for ${source.displayName}`,
						summary: `Deterministic local-source index ${index.index.indexSha256} with ${index.index.files.length} files and ${index.index.documents.length} TeX documents.`,
						provenance: `Derived only from immutable source revision ${snapshot.revisionId}.`,
						sourcePath: join(index.finalPath, "index.json"),
						sourcePathKind: "absolute",
						now: new Date().toISOString(),
						actor: "system",
					});
					next = addCoMathSourceIndex(next, {
						id: sourceIndexId,
						sourceId: snapshot.sourceId,
						sourceRevisionId: snapshot.revisionId,
						sourceManifestSha256: snapshot.manifestSha256,
						indexArtifactId,
						indexPath: join(index.finalPath, "index.json"),
						indexSha256: index.index.indexSha256,
						policyVersion: index.index.policyVersion,
						status: "ready",
						fileCount: index.index.files.length,
						documentCount: index.index.documents.length,
						warnings: index.index.warnings,
						now: new Date().toISOString(),
						actor: "system",
					});
					next = addLiteratureSourceArtifact(next, {
						kind: "local-file",
						title: `Source snapshot index for ${source.displayName}`,
						path: snapshot.manifestAbsolutePath,
						provider: "workspace",
						externalId: snapshot.revisionId,
						summary: `Immutable source inventory linked to ${manifestArtifactId}; revision ${snapshot.revisionId}.`,
						extractedText: formatCoMathSourceContextIndex(snapshot, index.index, sourceMaterials),
						workspaceRole: "snapshot-metadata",
						sourceIndexId,
						sourceRevisionId: snapshot.revisionId,
						now: new Date().toISOString(),
						actor: "human",
					});
					for (const file of sourceMaterials) {
						const artifactId = nextArtifactId(next);
						next = addArtifact(next, {
							id: artifactId,
							kind: "source",
							title: file.relativePath,
							summary: `Immutable source snapshot for ${trimTerminalPunctuation(rootQuestion)}. SHA-256 ${file.sha256}; revision ${snapshot.revisionId}.`,
							provenance: `Snapshot of ${source.isDirectory ? join(source.absolutePath, ...file.relativePath.split("/")) : source.absolutePath}`,
							sourcePath: file.snapshotAbsolutePath,
							sourcePathKind: "absolute",
							now: new Date().toISOString(),
							actor: "human",
						});
						next = addLiteratureSourceArtifact(next, {
							kind: "local-file",
							title: file.relativePath,
							path: file.snapshotAbsolutePath,
							provider: "workspace",
							externalId: `${snapshot.revisionId}:${file.sha256}`,
							summary: `Immutable local source linked to ${artifactId}; SHA-256 ${file.sha256}; revision ${snapshot.revisionId}. Bounded content is registered in the revision's source snapshot index; use this exact file for verification.`,
							workspaceRole: classifyWorkspaceSourceRole(file.relativePath),
							sourceIndexId,
							sourceRevisionId: snapshot.revisionId,
							sourceRelativePath: file.relativePath,
							sourceFileSha256: file.sha256,
							now: new Date().toISOString(),
							actor: "human",
						});
					}
					return { state: next, result: undefined };
				},
			);
		} catch (error: unknown) {
			if (stagedIndex) await discardStagedCoMathSourceIndex(stagedIndex);
			const message = error instanceof Error ? error.message : String(error);
			await this.notify(`Could not pin the source snapshot.\n${message}`, "error");
			return false;
		}

		await this.notify(
			formatSetupStep(
				`Source snapshot pinned: ${source.displayName} (${snapshot.files.length} files, revision ${snapshot.manifestSha256.slice(0, 12)})`,
			),
		);
		if (snapshot.truncated) {
			await this.notify(
				`Source selection reached its safety limits; ${snapshot.skippedEntries.length} skipped entries are recorded in the manifest.`,
				"warning",
			);
		}
		return true;
	}

	private async ensureSourceIndexes(state: CoMathProjectState): Promise<CoMathProjectState | undefined> {
		let nextState = state;
		const manifests = state.literatureSources.filter(
			(source) =>
				source.provider === "workspace" &&
				source.externalId?.startsWith("source-revision-") &&
				source.path?.endsWith("manifest.json"),
		);
		for (const manifest of manifests) {
			const revisionId = manifest.externalId;
			if (
				!revisionId ||
				nextState.sourceIndexes.some((index) => index.sourceRevisionId === revisionId && index.status === "ready")
			) {
				continue;
			}
			let stagedIndex: CoMathStagedSourceIndex | undefined;
			try {
				const snapshot = await loadCoMathSourceSnapshot(manifest.path ?? "");
				stagedIndex = await buildCoMathSourceIndex(snapshot);
				const index = stagedIndex;
				const materials = await loadCoMathSourceContext(snapshot, index.index);
				const indexArtifactId = `source-index-artifact-${index.index.indexSha256.slice(0, 16)}`;
				const sourceIndexId = `source-index-${index.index.indexSha256.slice(0, 16)}`;
				const sourceContext = formatCoMathSourceContextIndex(snapshot, index.index, materials);
				const committed = await this.stateStore.transactWithArtifacts(
					{ operation: "source-index-backfill", actor: "system", changedEntityIds: [sourceIndexId] },
					[
						{
							id: indexArtifactId,
							stagingPath: index.stagingPath,
							finalPath: index.finalPath,
							contentPath: "index.json",
							sha256: index.publishedContentSha256,
						},
					],
					(fresh) => {
						let next = fresh;
						if (!next.artifacts.some((artifact) => artifact.id === indexArtifactId)) {
							next = addArtifact(next, {
								id: indexArtifactId,
								kind: "source",
								title: `Source index for ${snapshot.sourceId}`,
								summary: `Deterministic local-source index ${index.index.indexSha256}.`,
								provenance: `Backfilled from immutable source revision ${snapshot.revisionId}.`,
								sourcePath: join(index.finalPath, "index.json"),
								sourcePathKind: "absolute",
								now: new Date().toISOString(),
								actor: "system",
							});
						}
						next = addCoMathSourceIndex(next, {
							id: sourceIndexId,
							sourceId: snapshot.sourceId,
							sourceRevisionId: snapshot.revisionId,
							sourceManifestSha256: snapshot.manifestSha256,
							indexArtifactId,
							indexPath: join(index.finalPath, "index.json"),
							indexSha256: index.index.indexSha256,
							policyVersion: index.index.policyVersion,
							status: "ready",
							fileCount: index.index.files.length,
							documentCount: index.index.documents.length,
							warnings: index.index.warnings,
							now: new Date().toISOString(),
							actor: "system",
						});
						next = linkLiteratureSourcesToIndex(next, {
							sourceRevisionId: snapshot.revisionId,
							sourceIndexId,
							indexContext: sourceContext,
							sourceFiles: snapshot.files.map((file) => ({
								relativePath: file.relativePath,
								sha256: file.sha256,
							})),
							now: new Date().toISOString(),
							actor: "system",
						});
						return { state: next, result: undefined };
					},
					nextState,
				);
				nextState = committed.state;
			} catch (error) {
				if (stagedIndex) await discardStagedCoMathSourceIndex(stagedIndex);
				const message = error instanceof Error ? error.message : String(error);
				await this.notify(`Could not index the immutable source snapshot. ${message}`, "error");
				return undefined;
			}
		}
		return nextState;
	}

	private async handleSteeringPrompt(prompt: string): Promise<void> {
		const state = await this.stateStore.load();
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
		const indexed = await this.ensureSourceIndexes(state);
		if (!indexed) return;
		state = indexed;
		const cancelBatchReason = parseCancelResearchBatchPrompt(prompt);
		if (cancelBatchReason) {
			const execution = [...state.researchExecutions]
				.reverse()
				.find((candidate) => candidate.status === "running" || candidate.status === "paused");
			if (!execution) {
				await this.notify("No research step sequence is active or paused.", "warning");
				return;
			}
			const now = new Date().toISOString();
			await this.stateStore.commit(
				(fresh) => ({
					...fresh,
					researchExecutions: fresh.researchExecutions.map((candidate) =>
						candidate.id === execution.id
							? { ...candidate, status: "cancelled", cancelledAt: now, updatedAt: now }
							: candidate,
					),
					updatedAt: now,
				}),
				state,
			);
			await this.notify(`Cancelled research execution ${execution.id}: ${cancelBatchReason}`);
			return;
		}
		if (isResumeResearchBatchPrompt(prompt)) {
			if (hasLiveResearchExecution(state)) {
				await this.notify(
					'A research step sequence is already active. Say "show progress" to inspect it.',
					"warning",
				);
				return;
			}
			const pausedExecution = [...state.researchExecutions]
				.reverse()
				.find((execution) => execution.status === "paused" || isStaleRunningExecution(state, execution.id));
			if (!pausedExecution) {
				await this.notify("No paused research step sequence is available to resume.", "warning");
				return;
			}
			const now = new Date().toISOString();
			const committed = await this.stateStore.commitWithResult((fresh) => {
				const activePlan = getActiveResearchPlan(fresh);
				const pausedPlan = getPausedResearchPlan(fresh);
				const planToResume =
					pausedPlan ?? (activePlan && !hasRunnableResearchPlanTask(fresh, activePlan) ? activePlan : undefined);
				const resumedPlan = planToResume ? resumeResearchPlan(fresh, planToResume.id, now) : undefined;
				return { state: resumedPlan?.state ?? fresh, result: resumedPlan };
			}, state);
			await this.notifyResearchPlanResumeOutcome(committed.state, committed.result);
			await this.notify(`Resuming research execution ${pausedExecution.id}.`);
			void this.taskScheduler
				.schedule({
					executionId: pausedExecution.id,
					allowBlockedTasks: true,
					requestedTaskCount: pausedExecution.requestedTaskCount,
					now,
				})
				.then((result) => this.notifyScheduledExecution(result))
				.catch((error: unknown) =>
					this.notify(
						`Task execution could not resume: ${error instanceof Error ? error.message : String(error)}`,
						"error",
					),
				);
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
			const proposal = await this.withPlanningActivity(() =>
				proposeResearchPlan(state, {
					...(this.researchDirectorExecutor ? { executor: this.researchDirectorExecutor } : {}),
					now: new Date().toISOString(),
					actor: "human",
				}),
			);
			const committed = await this.commitProposedResearchPlan(state, proposal);
			await this.notify(
				committed.created
					? formatResearchPlanCreated({
							plan: committed.plan,
							tasks: getResearchPlanTasks(committed.state, committed.plan.id),
						})
					: formatResearchPlanSummary({
							plan: committed.plan,
							tasks: getResearchPlanTasks(committed.state, committed.plan.id),
						}),
			);
			return;
		}
		const planExecution = parseResearchPlanExecutionPrompt(prompt);
		if (planExecution) {
			await this.handleResearchPlanExecutionPrompt(state, planExecution);
			return;
		}
		if (isShowProblemStatePrompt(prompt)) {
			// Built fresh from current durable state on every request; nothing is cached.
			await this.notify(buildStateOfProblemDocument(state));
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
		if (isShowObligationsPrompt(prompt)) {
			await this.notify(formatResearchObligationsSummary(state));
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
			// Progress prefers the durable plan, then the unified execution.
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
			const execution = [...state.researchExecutions]
				.reverse()
				.find((candidate) => candidate.status === "running" || candidate.status === "paused");
			if (isShowProgressPrompt(prompt) && execution) {
				await this.notify(
					`Research execution ${execution.id} is ${execution.status}; ${execution.attemptIds.length}/${execution.requestedTaskCount} attempts recorded.`,
					execution.status === "paused" ? "warning" : "info",
				);
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
			const activeExecution = hasLiveResearchExecution(state);
			if (activeExecution) {
				await this.notify(
					'A research step sequence is already active. Say "show progress" to inspect it.',
					"warning",
				);
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
			await this.notify(
				`Starting a bounded research execution for ${batchPrompt.requestedStepCount} task${batchPrompt.requestedStepCount === 1 ? "" : "s"}.`,
			);
			void this.taskScheduler
				.schedule({
					requestedTaskCount: batchPrompt.requestedStepCount,
					...(path ? { pathId: path.id } : {}),
					now,
				})
				.then((result) => this.notifyScheduledExecution(result))
				.catch((error: unknown) =>
					this.notify(
						`Task execution could not start: ${error instanceof Error ? error.message : String(error)}`,
						"error",
					),
				);
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
			await this.stateStore.commit(
				(fresh) =>
					setResearchFocus(fresh, {
						pathIds: [path.id],
						reason: `User asked to focus on ${trimTerminalPunctuation(focus[1])}.`,
						now,
						actor: "human",
					}),
				state,
			);
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
			await this.stateStore.commit(
				(fresh) =>
					updateResearchPath(fresh, {
						pathId: path.id,
						status: "abandoned",
						now,
						actor: "human",
					}),
				state,
			);
			await this.notify(formatResearchPathDropped(path, reason));
			return;
		}
		if (/^try a weaker theorem$/i.test(prompt)) {
			const path = findResearchPath(state, "weaker special cases");
			if (path) {
				const now = new Date().toISOString();
				await this.stateStore.commit(
					(fresh) =>
						setResearchFocus(fresh, {
							pathIds: [path.id],
							reason: "User asked to try a weaker theorem.",
							now,
							actor: "human",
						}),
					state,
				);
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
			if (hasLiveResearchExecution(state)) {
				await this.notify(
					'A research step sequence is already active. Say "show progress" to inspect it.',
					"warning",
				);
				return;
			}
			await this.runPathThroughTaskEngine(state, path);
			return;
		}
		if (isLikelyOperationalNonMathPrompt(prompt)) {
			await this.notify(formatCoMathResearchModeOperationalPromptIgnored(), "warning");
			return;
		}
		// A standalone math question that differs from this workspace's root question must never be
		// silently recorded as steering for the old project: warn and change nothing. Long prompts
		// are exempt so pasted context for the same project keeps flowing as a note.
		const candidateQuestion =
			prompt.trim().length <= 400
				? (parseExplicitResearchProblemPrompt(prompt) ?? parseNaturalResearchQuestion(prompt))
				: undefined;
		if (candidateQuestion && isDifferentResearchQuestion(candidateQuestion, [state.rootQuestion, state.title])) {
			await this.notify(
				formatDifferentResearchQuestionDetected({
					currentQuestion: state.rootQuestion,
					newQuestion: candidateQuestion,
				}),
				"warning",
			);
			return;
		}
		await this.handleNaturalResearchSteeringPrompt(state, prompt);
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
		if (hasLiveResearchExecution(state)) {
			await this.notify('A research step sequence is already active. Say "show progress" to inspect it.', "warning");
			return;
		}
		if (request.resume && !getPausedResearchPlan(state) && !getActiveResearchPlan(state)) {
			await this.notify("No paused research plan is available to resume.", "warning");
			return;
		}
		let workingState = state;
		let plan = getActiveResearchPlan(workingState);
		const paused = getPausedResearchPlan(workingState);
		const planToResume = paused ?? (plan && !hasRunnableResearchPlanTask(workingState, plan) ? plan : undefined);
		if (planToResume) {
			const resumed = await this.stateStore.commitWithResult((fresh) => {
				const result = resumeResearchPlan(fresh, planToResume.id, new Date().toISOString());
				return { state: result.state, result };
			}, workingState);
			workingState = resumed.state;
			await this.notifyResearchPlanResumeOutcome(workingState, resumed.result);
			if (resumed.result.blockedReason) {
				await this.notify(resumed.result.blockedReason, "warning");
				return;
			}
			plan = workingState.researchPlans.find((candidate) => candidate.id === planToResume.id);
		}
		if (!plan) {
			if (request.resume) {
				await this.notify("No paused research plan is available to resume.", "warning");
				return;
			}
			const proposal = await this.withPlanningActivity(() =>
				proposeResearchPlan(workingState, {
					...(this.researchDirectorExecutor ? { executor: this.researchDirectorExecutor } : {}),
					now: new Date().toISOString(),
					actor: "human",
				}),
			);
			const committed = await this.commitProposedResearchPlan(workingState, proposal);
			workingState = committed.state;
			plan = committed.plan;
			if (committed.created) {
				await this.notify(formatResearchPlanCreated({ plan, tasks: getResearchPlanTasks(workingState, plan.id) }));
			}
		}
		const tasks = getResearchPlanTasks(workingState, plan.id);
		const allowBlockedTasks = request.resume || Boolean(planToResume);
		const pendingCount = tasks.filter(
			(task) => task.status === "pending" || (allowBlockedTasks && task.status === "blocked"),
		).length;
		const runnableCount = tasks.filter(
			(task) =>
				(task.status === "pending" || (allowBlockedTasks && task.status === "blocked")) &&
				areResearchPlanTaskDependenciesCompleted(workingState, task),
		).length;
		if (pendingCount === 0 || runnableCount === 0) {
			await this.notify(formatResearchPlanSummary({ plan, tasks }));
			return;
		}
		const requestedStepCount = Math.min(5, Math.max(1, request.requestedStepCount ?? pendingCount));
		const now = new Date().toISOString();
		if (hasLiveResearchExecution(workingState)) {
			await this.notify('A research step sequence is already active. Say "show progress" to inspect it.', "warning");
			return;
		}
		await this.notify(formatResearchPlanExecutionStarted({ plan, tasks, requestedTaskCount: requestedStepCount }));
		void this.taskScheduler
			.schedule({
				requestedTaskCount: requestedStepCount,
				allowBlockedTasks,
				now,
			})
			.then((result) => this.notifyScheduledExecution(result))
			.catch((error: unknown) =>
				this.notify(
					`Task execution could not start: ${error instanceof Error ? error.message : String(error)}`,
					"error",
				),
			);
	}

	private async notifyScheduledExecution(result: Awaited<ReturnType<CoMathTaskScheduler["schedule"]>>): Promise<void> {
		const latest = result.results.at(-1);
		if (!latest) {
			await this.notify(
				`Research execution ${result.execution.id} paused because no task is currently runnable.`,
				"warning",
			);
			return;
		}
		const state = await this.stateStore.load();
		const attempt = state?.researchTaskAttempts.find((candidate) => candidate.id === latest.attemptId);
		const task = attempt ? state?.researchPlanTasks.find((candidate) => candidate.id === attempt.taskId) : undefined;
		const taskLabel = task ? `Task ${task.sequence} (${task.title})` : `Attempt ${latest.attemptId}`;
		if (result.execution.status === "completed") {
			await this.notify(
				`Research execution ${result.execution.id} completed ${result.results.length} task attempt${result.results.length === 1 ? "" : "s"}.`,
			);
			return;
		}
		const reason = attempt?.failure?.message ?? result.execution.failure?.message;
		await this.notify(
			`${taskLabel} ended ${latest.status}${reason ? `: ${reason}` : "."}\nSay "resume plan" to continue when another attempt or stage retry is appropriate.`,
			"warning",
		);
	}

	private async handleNaturalResearchSteeringPrompt(state: CoMathProjectState, prompt: string): Promise<void> {
		// A constraint-shaped steering message ("do not attack X", "use convention Y") becomes a
		// durable standing constraint instead of a one-off run: every later role prompt carries it.
		const constraint = parseResearchConstraintPrompt(prompt);
		if (constraint) {
			await this.stateStore.commit(
				(fresh) =>
					addResearchConstraint(fresh, {
						text: constraint.text,
						kind: constraint.kind,
						origin: "human",
						now: new Date().toISOString(),
						actor: "human",
					}),
				state,
			);
			await this.notify(formatResearchConstraintRecorded(constraint.text));
			return;
		}
		const path = chooseNaturalSteeringResearchPath(state, prompt);
		const now = new Date().toISOString();
		const nextState = await this.stateStore.commit(
			(fresh) => saveNaturalResearchSteering(fresh, prompt, path, now),
			state,
		);

		if (hasLiveResearchExecution(nextState)) {
			await this.notify(
				formatResearchNaturalSteeringQueued({ state: nextState, ...(path ? { path } : {}), prompt }),
			);
			return;
		}
		if (!path) {
			await this.notify(formatResearchStateSummary(nextState));
			return;
		}
		await this.notify(formatResearchNaturalSteeringStarted({ state: nextState, path, prompt }));
		await this.runPathThroughTaskEngine(nextState, path, prompt);
	}

	/** Preserve `continue path N` while routing new work through the sole task engine. */
	private async runPathThroughTaskEngine(
		state: CoMathProjectState,
		path: ResearchPath,
		directive?: string,
	): Promise<void> {
		const now = new Date().toISOString();
		const created = await this.stateStore.transact(
			{ operation: "user-directed-task", actor: "human", changedEntityIds: [path.id] },
			(fresh) => {
				let base = fresh;
				let plan = [...base.researchPlans].reverse().find((candidate) => candidate.status !== "cancelled");
				if (!plan) {
					base = addResearchPlan(base, {
						title: "User-directed research",
						objective: base.rootQuestion,
						status: "active",
						now,
						actor: "human",
					});
					plan = base.researchPlans.at(-1);
				}
				if (!plan) throw new Error("Could not create a user-directed research plan.");
				const next = addResearchPlanTask(base, {
					planId: plan.id,
					kind: researchTaskKindForPath(path),
					title: `User-directed: ${path.title}`,
					description: directive?.trim() || path.objective,
					goal: directive?.trim() || path.objective,
					acceptanceCriteria: ["Produce a bounded, independently reviewed research attempt."],
					dependsOnTaskIds: [],
					pathId: path.id,
					now,
					actor: "human",
				});
				const task = next.researchPlanTasks.at(-1);
				if (!task) throw new Error("Could not create a user-directed research task.");
				return { state: next, result: task.id };
			},
			state,
		);
		await this.notify(`Created user-directed task ${created.result} on ${path.title}.`);
		const scheduled = await this.taskScheduler.schedule({
			taskIds: [created.result],
			pathId: path.id,
			requestedTaskCount: 1,
			now,
		});
		const result = scheduled.results[0];
		if (result) await this.notify(`Task ${created.result} finished with ${result.status}.`);
	}

	private async notifyResearchPlanResumeOutcome(
		state: CoMathProjectState,
		result: ResearchPlanResumeResult | undefined,
	): Promise<void> {
		if (!result) {
			return;
		}
		for (const repairTaskId of result.repairTaskIds) {
			const repair = state.researchPlanTasks.find((task) => task.id === repairTaskId);
			const rejected = repair?.repairOfTaskId
				? state.researchPlanTasks.find((task) => task.id === repair.repairOfTaskId)
				: undefined;
			if (repair && rejected) {
				await this.notify(
					`Created repair task ${repair.sequence} for rejected task ${rejected.sequence} using the independent review concerns.`,
				);
			}
		}
		if (
			result.repairTaskIds.length === 0 &&
			result.resumedTaskIds.length > 0 &&
			state.researchPlanTasks.some((task) => task.reviewOutcome === "rejected")
		) {
			await this.notify("Resuming independent tasks before repairing the rejected prerequisite.");
		}
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
		const committed = await this.stateStore.commitWithResult((fresh) => {
			const next = addLiteratureSourceArtifact(fresh, {
				kind: result.kind,
				title: result.title,
				...(result.url ? { url: result.url } : {}),
				...(result.path ? { path: result.path } : {}),
				summary: result.summary,
				...(result.extractedText ? { extractedText: result.extractedText } : {}),
				now,
				actor: "human",
			});
			return {
				state: next,
				result: findPersistedLiteratureSource(next.literatureSources, fresh.literatureSources, result),
			};
		}, state);
		const persisted = committed.result;
		await this.notify(formatUserProvidedLiteratureSourceRegistered({ title: persisted?.title ?? result.title }));
	}

	private commitProposedResearchPlan(
		baseState: CoMathProjectState,
		proposal: ProposeResearchPlanResult,
	): Promise<{ state: CoMathProjectState; plan: ResearchPlanRecord; created: boolean }> {
		return this.stateStore
			.commitWithResult((fresh) => {
				const existing = getActiveResearchPlan(fresh) ?? getPausedResearchPlan(fresh);
				if (existing) {
					return { state: fresh, result: { plan: existing, created: false } };
				}
				if (fresh.projectId !== baseState.projectId) {
					throw new Error("Cannot commit a research plan proposed for a replaced CoMath project.");
				}
				const rebased = applyProposedResearchPlan(fresh, proposal, {
					now: new Date().toISOString(),
					actor: "human",
				});
				return { state: rebased.state, result: { plan: rebased.plan, created: true } };
			}, baseState)
			.then(({ state, result }) => ({ state, ...result }));
	}

	private async createResearchCoordinatorReport(state: CoMathProjectState): Promise<void> {
		const latestState = (await this.stateStore.load()) ?? state;
		const now = new Date().toISOString();
		const result = await runResearchCoordinatorSynthesis({
			state: latestState,
			executor: this.researchModelExecutor,
			now,
		});
		const committed = await this.stateStore.commitWithResult((fresh) => {
			if (fresh.projectId !== latestState.projectId || !coordinatorSynthesisInputsMatchState(fresh, result.report)) {
				return { state: fresh, result: undefined };
			}
			const committedAt = new Date().toISOString();
			let next = upsertWorkingPaperSectionByTitle(fresh, {
				title: "Project coordinator synthesis",
				body: buildResearchCoordinatorWorkingPaperBody(result.report),
				now: committedAt,
				actor: "coordinator",
			});
			const section = next.workingPaperSections.find(
				(candidate) => candidate.title === "Project coordinator synthesis",
			);
			next = addResearchCoordinatorReport(next, {
				...result.report,
				...(section ? { workingPaperSectionId: section.id } : {}),
				now: committedAt,
				actor: "coordinator",
			});
			const report = next.researchCoordinatorReports.at(-1);
			if (report) {
				const suggested = getCoordinatorSuggestedPrompt(next, report);
				if (suggested) {
					next = addMarginNote(next, {
						id: `margin-note-${next.marginNotes.length + 1}`,
						kind: "todo",
						subjectId: report.id,
						...(section ? { sectionId: section.id } : {}),
						message: `Suggested next step: ${suggested}`,
						now: committedAt,
						actor: "coordinator",
					});
				}
			}
			return { state: next, result: report };
		}, latestState);
		const nextState = committed.state;
		const report = committed.result;
		if (report) {
			await this.notify(formatResearchCoordinatorReport({ state: nextState, report }));
		} else {
			await this.notify("The research workspace changed before the coordinator report could be saved.", "warning");
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
			const archivedLegacyState = await this.stateStore.archiveLegacyState();
			if (archivedLegacyState) {
				await this.notify(
					"Archived the prior v1 CoMath workspace as read-only history. This prompt will start a new v2 workspace.",
					"info",
				);
				return false;
			}
			return (await this.stateStore.load()) !== undefined;
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

export function researchTaskKindForPath(path: Pick<ResearchPath, "title" | "objective">): ResearchPlanTaskKind {
	const description = `${path.title} ${path.objective}`.toLowerCase();
	if (/\b(?:literature|bibliograph|known theorem|prior work|later work|source search)\b/.test(description)) {
		return "literature-search";
	}
	if (/\b(?:comput|counterexample|enumerat|experiment|finite check|small examples?|test cases?)\b/.test(description)) {
		return "computation";
	}
	return "proof-attempt";
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

/**
 * Only the explicit "explore this problem: X" forms. Bare "explore <topic>" phrasings stay out so
 * steering like "explore the mod 4 obstruction" is never mistaken for a new root question.
 */
function parseExplicitResearchProblemPrompt(prompt: string): string | undefined {
	const normalized = prompt.trim().replace(/\s+/g, " ");
	const match =
		/^(?:(?:explore|research|investigate|find approaches to|try to solve)\s+this\s+(?:problem|conjecture|question)):\s+(.+)$/i.exec(
			normalized,
		);
	const problem = match?.[1]?.trim();
	return problem && !isIncompleteExplorationProblem(problem) ? problem : undefined;
}

function buildSourceIntakeProblem(source: CoMathSource, remainingInstruction?: string): string {
	const sourceKind = source.isDirectory ? "source directory" : "source file";
	const objective = `Identify the mathematical questions, claims, and problems in the supplied ${sourceKind} "${source.displayName}", then begin investigating them.`;
	const remaining = remainingInstruction?.trim();
	if (!remaining || /^(?:start|begin|continue)(?:\s+(?:now|working|investigating|researching))?$/i.test(remaining)) {
		return objective;
	}
	return `${objective} User direction: ${trimTerminalPunctuation(remaining)}.`;
}

function isSourceOnlyStartPrompt(prompt: string): boolean {
	if (parseCoMathSourceIntent(prompt)) {
		return true;
	}
	const normalized = stripCoMathPolitePrefix(prompt).replace(/\s+/g, " ").trim();
	if (/^(?:start|begin)(?:\s+(?:now|working|investigating|researching))?$/i.test(normalized)) {
		return true;
	}
	return (
		normalized.length <= 240 &&
		/^(?:start|begin|investigate|research|analy[sz]e)\b/i.test(normalized) &&
		/\b(?:source|directory|folder|files?|questions?|claims?|problems?|conjectures?)\b/i.test(normalized)
	);
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
	input: { initialFocusSlug: string },
): ResearchPath | undefined {
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

function nextArtifactId(state: Pick<CoMathProjectState, "artifacts">): string {
	let sequence = state.artifacts.length + 1;
	while (state.artifacts.some((artifact) => artifact.id === `artifact-${sequence}`)) {
		sequence += 1;
	}
	return `artifact-${sequence}`;
}

/**
 * Default step budget for the autonomous plan run a fresh math question starts. Each step is a
 * full model-backed workstream run plus an independent review, so this bounds unprompted model
 * spend: three steps covers a typical opening arc (a status check, a bounded computation, and a
 * first proof or refutation attempt) before pausing for the user's direction. Only the unprompted
 * first move is sized by this default — the `--comath-steps` flag overrides it (clamped below),
 * explicit prompts pick their own budget ("work the plan for N steps", capped at 5), and
 * "continue" extends work after the pause.
 */
const INITIAL_RESEARCH_BATCH_STEPS = 3;
const MAX_INITIAL_RESEARCH_BATCH_STEPS = 10;

function clampInitialResearchStepCount(requested: number | undefined): number {
	if (requested === undefined || !Number.isFinite(requested)) {
		return INITIAL_RESEARCH_BATCH_STEPS;
	}
	return Math.min(MAX_INITIAL_RESEARCH_BATCH_STEPS, Math.max(1, Math.round(requested)));
}

/**
 * Default and cap for concurrent plan tasks in one bounded step. The default stays 1 — sequential
 * execution is deterministic, and the eval and library callers rely on that — while the cap bounds
 * concurrent model spend even with a misconfigured value. Interactive sessions opt into 2 (or the
 * `--comath-parallel` flag's value) in main.
 */
const DEFAULT_MAX_PARALLEL_RESEARCH_TASKS = 1;
const MAX_MAX_PARALLEL_RESEARCH_TASKS = 3;

export function clampMaxParallelResearchTasks(requested: number | undefined): number {
	if (requested === undefined || !Number.isFinite(requested)) {
		return DEFAULT_MAX_PARALLEL_RESEARCH_TASKS;
	}
	return Math.min(MAX_MAX_PARALLEL_RESEARCH_TASKS, Math.max(1, Math.round(requested)));
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

function classifyWorkspaceSourceRole(
	relativePath: string,
): "primary-text" | "compiled-binary" | "curated-summary" | "bibliographic-metadata" {
	const normalized = relativePath.toLowerCase();
	if (normalized.endsWith(".pdf")) return "compiled-binary";
	if (normalized.endsWith(".tex") || normalized.endsWith(".ltx")) return "primary-text";
	if (normalized.endsWith(".bib") || normalized.endsWith(".xml")) return "bibliographic-metadata";
	return "curated-summary";
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
		"whatWeKnow" | "roadblocks" | "recommendedNextMoves" | "suggestedPrompt" | "suggestedPathId"
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

function hasRunnableResearchPlanTask(state: CoMathProjectState, plan: ResearchPlanRecord): boolean {
	return getResearchPlanTasks(state, plan.id).some(
		(task) => task.status === "pending" && areResearchPlanTaskDependenciesCompleted(state, task),
	);
}

function hasLiveResearchExecution(state: CoMathProjectState): boolean {
	return state.researchExecutions.some(
		(execution) => execution.status === "running" && !isStaleRunningExecution(state, execution.id),
	);
}

function isStaleRunningExecution(state: CoMathProjectState, executionId: string): boolean {
	const execution = state.researchExecutions.find((candidate) => candidate.id === executionId);
	if (!execution || execution.status !== "running" || execution.attemptIds.length === 0) return false;
	return !execution.attemptIds.some((attemptId) => {
		const attempt = state.researchTaskAttempts.find((candidate) => candidate.id === attemptId);
		return attempt?.status === "queued" || attempt?.status === "running";
	});
}
