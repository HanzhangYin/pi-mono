import { formatCoMathResearchParallelStepActivityStatus } from "./comath-foreground-progress.ts";
import {
	formatCoMathResearchStepActivityStatus,
	formatResearchBatchCancelled,
	formatResearchBatchCompleted,
	formatResearchBatchContinuation,
	formatResearchBatchFailed,
	formatResearchBatchPaused,
	formatResearchBatchStepCompleted,
} from "./comath-progress.ts";
import { hasRunnableResearchAgendaWork } from "./comath-research-agenda.ts";
import {
	type CoMathResearchPlanRunner,
	type ResearchPlanTaskExecutionOutcome,
	selectParallelResearchTaskGroup,
} from "./comath-research-plan-runner.ts";
import {
	type CoMathResearchPhaseActivityNotify,
	type CoMathResearchPhaseActivitySignal,
	type CoMathResearchRunner,
	type CoMathResearchRunnerNotify,
	safeErrorMessage,
} from "./comath-research-runner.ts";
import { CoMathStateLock } from "./comath-state-lock.ts";
import type { CoMathProjectState, ResearchBatchRecord, ResearchPath } from "./schema.ts";
import {
	getActiveResearchPlan,
	getLatestResearchPlan,
	getResearchPlanTasks,
	loadProjectState,
	saveProjectState,
	updateResearchBatch,
} from "./storage.ts";

export interface CoMathResearchBatchRunnerOptions {
	statePath: string;
	notify: CoMathResearchRunnerNotify;
	researchRunner: CoMathResearchRunner;
	planRunner: CoMathResearchPlanRunner;
	/**
	 * Serializes every durable load→mutate→persist commit; shared with the plan runner and research
	 * runner so batch bookkeeping never races a concurrent task's records.
	 */
	stateLock?: CoMathStateLock;
	/**
	 * How many independent plan tasks one bounded step may run at once (already clamped by the
	 * harness). Defaults to 1, which keeps execution strictly sequential.
	 */
	maxParallelResearchTasks?: number;
	/** Best-effort UI status showing which bounded step of the budget is running. */
	onResearchPhaseActivity?: CoMathResearchPhaseActivityNotify;
}

export class CoMathResearchBatchRunner {
	private readonly statePath: string;
	private readonly notify: CoMathResearchRunnerNotify;
	private readonly researchRunner: CoMathResearchRunner;
	private readonly planRunner: CoMathResearchPlanRunner;
	private readonly onResearchPhaseActivity: CoMathResearchPhaseActivityNotify | undefined;
	private readonly activeResearchBatches = new Map<string, Promise<void>>();
	private readonly stateLock: CoMathStateLock;
	private readonly maxParallelResearchTasks: number;

	constructor(options: CoMathResearchBatchRunnerOptions) {
		this.statePath = options.statePath;
		this.notify = options.notify;
		this.researchRunner = options.researchRunner;
		this.planRunner = options.planRunner;
		this.stateLock = options.stateLock ?? new CoMathStateLock();
		this.maxParallelResearchTasks = options.maxParallelResearchTasks ?? 1;
		this.onResearchPhaseActivity = options.onResearchPhaseActivity;
	}

	/** Fire a phase-activity UI signal; failures never affect batch execution. */
	private async signalPhaseActivity(signal: CoMathResearchPhaseActivitySignal): Promise<void> {
		try {
			await this.onResearchPhaseActivity?.(signal);
		} catch {
			// UI status updates are best-effort and must not affect research execution.
		}
	}

	/**
	 * Commit one batch bookkeeping change under the state lock: reload fresh state, apply the pure
	 * mutation, save. Keeps batch records intact even while plan tasks commit concurrently.
	 */
	private async commitBatchChange(
		fallbackState: CoMathProjectState,
		mutate: (state: CoMathProjectState) => CoMathProjectState,
	): Promise<CoMathProjectState> {
		return await this.stateLock.run(async () => {
			const fresh = (await loadProjectState(this.statePath)) ?? fallbackState;
			const next = mutate(fresh);
			await saveProjectState(this.statePath, next);
			return next;
		});
	}

	startResearchBatchExecution(batchId: string): void {
		if (this.activeResearchBatches.has(batchId)) {
			return;
		}
		const batchRun = this.executeResearchBatch(batchId)
			.catch(async (error: unknown) => {
				const state = await loadProjectState(this.statePath);
				const batch = state?.researchBatches.find((candidate) => candidate.id === batchId);
				if (!state || !batch) {
					return;
				}
				const now = new Date().toISOString();
				const failedState = await this.commitBatchChange(state, (fresh) =>
					updateResearchBatch(fresh, {
						batchId,
						status: "failed",
						failureReason: safeErrorMessage(error),
						now,
						actor: "system",
					}),
				);
				const failedBatch = failedState.researchBatches.find((candidate) => candidate.id === batchId) ?? batch;
				await this.notify(formatResearchBatchFailed({ state: failedState, batch: failedBatch }), "error");
			})
			.finally(() => {
				this.activeResearchBatches.delete(batchId);
			});
		this.activeResearchBatches.set(batchId, batchRun);
		void batchRun;
	}

	private async executeResearchBatch(batchId: string): Promise<void> {
		for (;;) {
			const state = await loadProjectState(this.statePath);
			const batch = state?.researchBatches.find((candidate) => candidate.id === batchId);
			if (!state || !batch || batch.status !== "running") {
				return;
			}
			if (batch.completedStepCount >= batch.requestedStepCount) {
				await this.completeResearchBatch(state, batch);
				return;
			}
			// Without an explicit "work on path N" target, bounded steps work the durable research
			// plan (creating one if needed) instead of rotating paths directly.
			if (!batch.initialPathId) {
				if ((await this.executePlanBackedBatchStep(batch)) === "stop") {
					return;
				}
				continue;
			}
			const path = chooseNextResearchBatchPath(state, batch);
			if (!path) {
				await this.failResearchBatch(state, batch, "No active research path is available for the next step.");
				return;
			}
			const stepIndex = batch.completedStepCount + 1;
			const now = new Date().toISOString();
			const runningState = await this.commitBatchChange(state, (fresh) =>
				updateResearchBatch(fresh, {
					batchId,
					status: "running",
					currentPathId: path.id,
					nextPathId: path.id,
					now,
					actor: "system",
				}),
			);
			const runId = await this.researchRunner.runResearchWorkstreamStepForBatch(
				runningState,
				path,
				batchId,
				stepIndex,
			);
			const postRunState = await loadProjectState(this.statePath);
			const postRunBatch = postRunState?.researchBatches.find((candidate) => candidate.id === batchId);
			const run = postRunState?.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
			if (!postRunState || !postRunBatch || !run) {
				return;
			}
			if (postRunBatch.status === "cancelled") {
				await this.notify(formatResearchBatchCancelled({ state: postRunState, batch: postRunBatch }));
				return;
			}
			if (run.status === "interrupted") {
				const pausedState = await this.commitBatchChange(postRunState, (fresh) =>
					updateResearchBatch(fresh, {
						batchId,
						status: "paused",
						nextPathId: run.pathId,
						interruptedRunId: run.id,
						now: new Date().toISOString(),
						actor: "system",
					}),
				);
				const pausedBatch =
					pausedState.researchBatches.find((candidate) => candidate.id === batchId) ?? postRunBatch;
				await this.notify(formatResearchBatchPaused({ state: pausedState, batch: pausedBatch, run }), "warning");
				return;
			}
			if (run.status === "failed") {
				await this.failResearchBatch(postRunState, postRunBatch, run.failureReason ?? "The research step failed.");
				return;
			}
			const nextState = await this.commitBatchChange(postRunState, (fresh) => {
				const completedState = updateResearchBatch(fresh, {
					batchId,
					completedStepCount: stepIndex,
					addRunId: run.id,
					lastCompletedPathId: run.pathId,
					clearInterruptedRunId: true,
					now: new Date().toISOString(),
					actor: "system",
				});
				const completedBatch =
					completedState.researchBatches.find((candidate) => candidate.id === batchId) ?? postRunBatch;
				const nextPath = chooseNextResearchBatchPath(completedState, completedBatch);
				return nextPath && stepIndex < completedBatch.requestedStepCount
					? updateResearchBatch(completedState, {
							batchId,
							nextPathId: nextPath.id,
							now: new Date().toISOString(),
							actor: "system",
						})
					: completedState;
			});
			const latestBatch = nextState.researchBatches.find((candidate) => candidate.id === batchId) ?? postRunBatch;
			await this.notify(formatResearchBatchStepCompleted({ state: nextState, batch: latestBatch }));
			if (latestBatch.completedStepCount >= latestBatch.requestedStepCount) {
				await this.completeResearchBatch(nextState, latestBatch);
				return;
			}
		}
	}

	/**
	 * Run one plan task — or a bounded group of independent plan tasks — as the next batch step(s).
	 * Each task execution persists on its own durable boundaries inside the plan runner; this
	 * method only maps the task outcomes onto the batch record. Returns "continue" when the batch
	 * loop should attempt another step.
	 */
	private async executePlanBackedBatchStep(batch: ResearchBatchRecord): Promise<"continue" | "stop"> {
		// Bounded concurrency: never wider than the remaining step budget (each task consumes one
		// step), and forced back to 1 in deterministic/fallback mode — without a research model
		// executor every task degrades to the deterministic workstream, whose results must stay
		// reproducible, so degraded runs remain strictly sequential regardless of the option.
		const remainingSteps = batch.requestedStepCount - batch.completedStepCount;
		const parallelLimit = this.planRunner.supportsParallelPlanTaskExecution()
			? Math.max(1, Math.min(this.maxParallelResearchTasks, remainingSteps))
			: 1;
		if (parallelLimit >= 2) {
			const grouped = await this.executePlanBackedBatchStepGroup(batch, parallelLimit);
			if (grouped !== "not-grouped") {
				return grouped;
			}
			// No independent second task was available: fall through to the exact sequential step.
		}
		const stepIndex = batch.completedStepCount + 1;
		// A persistent footer status for the whole bounded step: finer-grained statuses (planning,
		// run stages, the independent review) stack on top of it while they are active, and this one
		// resurfaces in the gaps between them, so the "still working" signal never goes dark
		// mid-step.
		const stepActivityId = `research-batch-step-${batch.id}-${stepIndex}`;
		await this.signalPhaseActivity({
			kind: "start",
			activityId: stepActivityId,
			status: formatCoMathResearchStepActivityStatus(stepIndex, batch.requestedStepCount),
		});
		try {
			return await this.executePlanBackedBatchStepInner(batch, stepIndex);
		} finally {
			await this.signalPhaseActivity({ kind: "end", activityId: stepActivityId });
		}
	}

	/**
	 * Run a group of independent plan tasks concurrently, each consuming one budget step. Returns
	 * "not-grouped" when the plan offers no independent second task, so the caller falls back to
	 * the unchanged sequential step. Each member keeps the exact per-task semantics: a completed or
	 * review-rejected member consumes one step; a failed or blocking member pauses the batch at the
	 * same durable boundary the sequential path would, without cancelling its siblings' work.
	 */
	private async executePlanBackedBatchStepGroup(
		batch: ResearchBatchRecord,
		parallelLimit: number,
	): Promise<"continue" | "stop" | "not-grouped"> {
		const prepared = await this.planRunner.ensureExecutablePlan();
		if (!prepared) {
			const state = await loadProjectState(this.statePath);
			const currentBatch = state?.researchBatches.find((candidate) => candidate.id === batch.id);
			if (state && currentBatch) {
				await this.failResearchBatch(state, currentBatch, "No research plan is available for the next step.");
			}
			return "stop";
		}
		const group = selectParallelResearchTaskGroup(prepared.state, prepared.plan, parallelLimit);
		if (group.length < 2) {
			return "not-grouped";
		}
		// One footer status per concurrent task, so the stacked activity display truthfully shows
		// every step in flight; the batch's cancellation signal reaches every member through the
		// shared durable batch record, exactly as it reaches a sequential step.
		const stepIndexes = group.map((_, offset) => batch.completedStepCount + 1 + offset);
		const activityIds = stepIndexes.map((stepIndex) => `research-batch-step-${batch.id}-${stepIndex}`);
		for (const [offset, stepIndex] of stepIndexes.entries()) {
			await this.signalPhaseActivity({
				kind: "start",
				activityId: activityIds[offset],
				status: formatCoMathResearchParallelStepActivityStatus(stepIndex, batch.requestedStepCount),
			});
		}
		let outcomes: ResearchPlanTaskExecutionOutcome[];
		try {
			outcomes = await this.planRunner.executePlanTaskGroup(
				prepared.plan.id,
				group.map((task, offset) => ({
					taskId: task.id,
					options: { batchId: batch.id, stepIndex: stepIndexes[offset] },
				})),
			);
		} finally {
			for (const activityId of activityIds) {
				await this.signalPhaseActivity({ kind: "end", activityId });
			}
		}
		return await this.applyPlanTaskGroupOutcomes(batch, outcomes);
	}

	/**
	 * Fold the group's outcomes onto the batch record in group order, mirroring the sequential
	 * per-outcome bookkeeping: completed and rejected-but-continuing members each consume one
	 * budget step; the first pausing member pauses the batch after every sibling's step is counted.
	 */
	private async applyPlanTaskGroupOutcomes(
		batch: ResearchBatchRecord,
		outcomes: readonly ResearchPlanTaskExecutionOutcome[],
	): Promise<"continue" | "stop"> {
		let state = await loadProjectState(this.statePath);
		let currentBatch = state?.researchBatches.find((candidate) => candidate.id === batch.id);
		if (!state || !currentBatch) {
			return "stop";
		}
		if (currentBatch.status === "cancelled") {
			await this.notify(formatResearchBatchCancelled({ state, batch: currentBatch }));
			return "stop";
		}
		let pauseReason: string | undefined;
		let mustPause = false;
		let planCompleted = false;
		for (const outcome of outcomes) {
			if (outcome.kind === "plan-completed") {
				planCompleted = true;
				continue;
			}
			if (outcome.kind === "completed" || (outcome.kind === "blocked" && !outcome.planPaused)) {
				const run =
					outcome.kind === "completed" && outcome.runId
						? state.researchWorkstreamRuns.find((candidate) => candidate.id === outcome.runId)
						: undefined;
				state = await this.commitBatchChange(state, (fresh) => {
					const freshBatch = fresh.researchBatches.find((candidate) => candidate.id === batch.id);
					return updateResearchBatch(fresh, {
						batchId: batch.id,
						completedStepCount: (freshBatch?.completedStepCount ?? 0) + 1,
						...(outcome.runId ? { addRunId: outcome.runId } : {}),
						...(run ? { currentPathId: run.pathId, lastCompletedPathId: run.pathId } : {}),
						clearInterruptedRunId: true,
						now: new Date().toISOString(),
						actor: "system",
					});
				});
				if (outcome.kind === "completed" && outcome.planCompleted) {
					planCompleted = true;
				}
				continue;
			}
			// Blocked (plan paused), failed, or not-runnable: pause the batch at this boundary once
			// every sibling's completed step has been counted.
			mustPause = true;
			if (pauseReason === undefined && (outcome.kind === "blocked" || outcome.kind === "failed")) {
				pauseReason = outcome.reason;
			}
		}
		currentBatch = state.researchBatches.find((candidate) => candidate.id === batch.id) ?? currentBatch;
		if (currentBatch.status === "cancelled") {
			await this.notify(formatResearchBatchCancelled({ state, batch: currentBatch }));
			return "stop";
		}
		if (mustPause) {
			const reason = pauseReason;
			await this.commitBatchChange(state, (fresh) =>
				updateResearchBatch(fresh, {
					batchId: batch.id,
					status: "paused",
					...(reason !== undefined ? { failureReason: reason } : {}),
					now: new Date().toISOString(),
					actor: "system",
				}),
			);
			return "stop";
		}
		if (currentBatch.completedStepCount >= currentBatch.requestedStepCount) {
			await this.completeResearchBatch(state, currentBatch);
			return "stop";
		}
		if (planCompleted) {
			return await this.continueOrCompleteAfterPlan(state, currentBatch);
		}
		return "continue";
	}

	private async executePlanBackedBatchStepInner(
		batch: ResearchBatchRecord,
		stepIndex: number,
	): Promise<"continue" | "stop"> {
		const prepared = await this.planRunner.ensureExecutablePlan();
		if (!prepared) {
			const state = await loadProjectState(this.statePath);
			const currentBatch = state?.researchBatches.find((candidate) => candidate.id === batch.id);
			if (state && currentBatch) {
				await this.failResearchBatch(state, currentBatch, "No research plan is available for the next step.");
			}
			return "stop";
		}
		const outcome = await this.planRunner.executeNextPlanTask(prepared.plan.id, {
			batchId: batch.id,
			stepIndex,
		});
		const state = await loadProjectState(this.statePath);
		const currentBatch = state?.researchBatches.find((candidate) => candidate.id === batch.id);
		if (!state || !currentBatch) {
			return "stop";
		}
		if (currentBatch.status === "cancelled") {
			await this.notify(formatResearchBatchCancelled({ state, batch: currentBatch }));
			return "stop";
		}
		const now = new Date().toISOString();
		if (outcome.kind === "plan-completed") {
			return await this.continueOrCompleteAfterPlan(state, currentBatch);
		}
		if (outcome.kind === "completed") {
			const run = outcome.runId
				? state.researchWorkstreamRuns.find((candidate) => candidate.id === outcome.runId)
				: undefined;
			const completedState = await this.commitBatchChange(state, (fresh) =>
				updateResearchBatch(fresh, {
					batchId: batch.id,
					completedStepCount: stepIndex,
					...(outcome.runId ? { addRunId: outcome.runId } : {}),
					...(run ? { currentPathId: run.pathId, lastCompletedPathId: run.pathId } : {}),
					clearInterruptedRunId: true,
					now,
					actor: "system",
				}),
			);
			const latestBatch =
				completedState.researchBatches.find((candidate) => candidate.id === batch.id) ?? currentBatch;
			if (latestBatch.completedStepCount >= latestBatch.requestedStepCount) {
				await this.completeResearchBatch(completedState, latestBatch);
				return "stop";
			}
			if (outcome.planCompleted) {
				return await this.continueOrCompleteAfterPlan(completedState, latestBatch);
			}
			return "continue";
		}
		// A review rejection that left the plan active consumed a full bounded step (the run and its
		// review both happened), so it counts against the budget and the batch moves on to the next
		// planned task.
		if (outcome.kind === "blocked" && !outcome.planPaused) {
			const rejectedState = await this.commitBatchChange(state, (fresh) =>
				updateResearchBatch(fresh, {
					batchId: batch.id,
					completedStepCount: stepIndex,
					...(outcome.runId ? { addRunId: outcome.runId } : {}),
					clearInterruptedRunId: true,
					now,
					actor: "system",
				}),
			);
			const latestBatch =
				rejectedState.researchBatches.find((candidate) => candidate.id === batch.id) ?? currentBatch;
			if (latestBatch.completedStepCount >= latestBatch.requestedStepCount) {
				await this.completeResearchBatch(rejectedState, latestBatch);
				return "stop";
			}
			return "continue";
		}
		// Blocked, failed, or not-runnable: the plan runner already paused the plan and told the
		// user how to resume, so the batch pauses quietly at the same durable boundary.
		await this.commitBatchChange(state, (fresh) =>
			updateResearchBatch(fresh, {
				batchId: batch.id,
				status: "paused",
				...(outcome.kind === "blocked" || outcome.kind === "failed" ? { failureReason: outcome.reason } : {}),
				now,
				actor: "system",
			}),
		);
		return "stop";
	}

	/**
	 * The autonomous continuation decision: a finished plan does not end the batch while the user's
	 * step budget has room and the state-derived agenda offers genuinely new work (the agenda
	 * deduplicates against every task that already ran and filters rejected routes, so continuing
	 * can never loop over the same moves). The next loop iteration derives the continuation plan
	 * from what was just learned. When no new work is derivable, the batch completes honestly
	 * instead of re-summarizing the same status.
	 */
	private async continueOrCompleteAfterPlan(
		state: CoMathProjectState,
		batch: ResearchBatchRecord,
	): Promise<"continue" | "stop"> {
		if (batch.completedStepCount < batch.requestedStepCount && hasRunnableResearchAgendaWork(state)) {
			await this.notify(formatResearchBatchContinuation({ state, batch }));
			return "continue";
		}
		await this.completeResearchBatch(state, batch);
		return "stop";
	}

	private async completeResearchBatch(state: CoMathProjectState, batch: ResearchBatchRecord): Promise<void> {
		if (batch.status === "completed") {
			return;
		}
		const now = new Date().toISOString();
		const completedState = await this.commitBatchChange(state, (fresh) =>
			updateResearchBatch(fresh, {
				batchId: batch.id,
				status: "completed",
				completedAt: now,
				now,
				actor: "system",
			}),
		);
		const completedBatch = completedState.researchBatches.find((candidate) => candidate.id === batch.id) ?? batch;
		// Tell the user honestly where the work stands: how many plan tasks the step budget left
		// behind, or that the plan is done and durable state offers no further line of work.
		const plan = getActiveResearchPlan(completedState) ?? getLatestResearchPlan(completedState);
		const remainingPlanTaskCount = plan
			? getResearchPlanTasks(completedState, plan.id).filter(
					(task) => task.status === "pending" || task.status === "blocked",
				).length
			: 0;
		const linesOfWorkExhausted =
			plan?.status === "completed" && remainingPlanTaskCount === 0 && !hasRunnableResearchAgendaWork(completedState);
		await this.notify(
			formatResearchBatchCompleted({
				state: completedState,
				batch: completedBatch,
				...(remainingPlanTaskCount > 0 ? { remainingPlanTaskCount } : {}),
				...(linesOfWorkExhausted ? { linesOfWorkExhausted: true } : {}),
			}),
		);
	}

	private async failResearchBatch(
		state: CoMathProjectState,
		batch: ResearchBatchRecord,
		reason: string,
	): Promise<void> {
		const now = new Date().toISOString();
		const failedState = await this.commitBatchChange(state, (fresh) =>
			updateResearchBatch(fresh, {
				batchId: batch.id,
				status: "failed",
				failureReason: reason,
				now,
				actor: "system",
			}),
		);
		const failedBatch = failedState.researchBatches.find((candidate) => candidate.id === batch.id) ?? batch;
		await this.notify(formatResearchBatchFailed({ state: failedState, batch: failedBatch }), "error");
	}
}

function chooseNextResearchBatchPath(state: CoMathProjectState, batch: ResearchBatchRecord): ResearchPath | undefined {
	const explicitPath = batch.initialPathId
		? state.researchPaths.find((path) => path.id === batch.initialPathId && path.status !== "abandoned")
		: undefined;
	if (explicitPath) {
		return explicitPath;
	}
	const retryPath =
		batch.nextPathId && batch.interruptedRunId
			? state.researchPaths.find((path) => path.id === batch.nextPathId && path.status !== "abandoned")
			: undefined;
	if (retryPath) {
		return retryPath;
	}
	const focused = state.researchFocus?.pathIds
		.map((pathId) => state.researchPaths.find((path) => path.id === pathId))
		.find((path): path is ResearchPath => path !== undefined && path.status !== "abandoned");
	if (focused) {
		return focused;
	}
	const coordinatorSuggested = [...state.researchCoordinatorReports]
		.reverse()
		.map((report) =>
			report.suggestedPathId
				? state.researchPaths.find((path) => path.id === report.suggestedPathId && path.status !== "abandoned")
				: undefined,
		)
		.find((path): path is ResearchPath => path !== undefined);
	if (coordinatorSuggested) {
		return coordinatorSuggested;
	}
	const candidates = [...state.researchPaths]
		.filter((path) => path.status === "active" || path.status === "promising")
		.sort((a, b) => a.priority - b.priority);
	if (candidates.length === 0) {
		return undefined;
	}
	const lastIndex = batch.lastCompletedPathId
		? candidates.findIndex((path) => path.id === batch.lastCompletedPathId)
		: -1;
	return candidates[(lastIndex + 1 + candidates.length) % candidates.length];
}
