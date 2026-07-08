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
import type { CoMathResearchPlanRunner } from "./comath-research-plan-runner.ts";
import {
	type CoMathResearchPhaseActivityNotify,
	type CoMathResearchPhaseActivitySignal,
	type CoMathResearchRunner,
	type CoMathResearchRunnerNotify,
	safeErrorMessage,
} from "./comath-research-runner.ts";
import type { CoMathProjectState, ResearchBatchRecord, ResearchPath } from "./schema.ts";
import { loadProjectState, saveProjectState, updateResearchBatch } from "./storage.ts";

export interface CoMathResearchBatchRunnerOptions {
	statePath: string;
	notify: CoMathResearchRunnerNotify;
	researchRunner: CoMathResearchRunner;
	planRunner: CoMathResearchPlanRunner;
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

	constructor(options: CoMathResearchBatchRunnerOptions) {
		this.statePath = options.statePath;
		this.notify = options.notify;
		this.researchRunner = options.researchRunner;
		this.planRunner = options.planRunner;
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
				const failedState = updateResearchBatch(state, {
					batchId,
					status: "failed",
					failureReason: safeErrorMessage(error),
					now,
					actor: "system",
				});
				await saveProjectState(this.statePath, failedState);
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
			const runningState = updateResearchBatch(state, {
				batchId,
				status: "running",
				currentPathId: path.id,
				nextPathId: path.id,
				now,
				actor: "system",
			});
			await saveProjectState(this.statePath, runningState);
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
				const pausedState = updateResearchBatch(postRunState, {
					batchId,
					status: "paused",
					nextPathId: run.pathId,
					interruptedRunId: run.id,
					now: new Date().toISOString(),
					actor: "system",
				});
				await saveProjectState(this.statePath, pausedState);
				const pausedBatch =
					pausedState.researchBatches.find((candidate) => candidate.id === batchId) ?? postRunBatch;
				await this.notify(formatResearchBatchPaused({ state: pausedState, batch: pausedBatch, run }), "warning");
				return;
			}
			if (run.status === "failed") {
				await this.failResearchBatch(postRunState, postRunBatch, run.failureReason ?? "The research step failed.");
				return;
			}
			const completedState = updateResearchBatch(postRunState, {
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
			const nextState =
				nextPath && stepIndex < completedBatch.requestedStepCount
					? updateResearchBatch(completedState, {
							batchId,
							nextPathId: nextPath.id,
							now: new Date().toISOString(),
							actor: "system",
						})
					: completedState;
			await saveProjectState(this.statePath, nextState);
			const latestBatch = nextState.researchBatches.find((candidate) => candidate.id === batchId) ?? completedBatch;
			await this.notify(formatResearchBatchStepCompleted({ state: nextState, batch: latestBatch }));
			if (latestBatch.completedStepCount >= latestBatch.requestedStepCount) {
				await this.completeResearchBatch(nextState, latestBatch);
				return;
			}
		}
	}

	/**
	 * Run one plan task as the next batch step. Each task execution persists on its own durable
	 * boundaries inside the plan runner; this method only maps the task outcome onto the batch
	 * record. Returns "continue" when the batch loop should attempt another step.
	 */
	private async executePlanBackedBatchStep(batch: ResearchBatchRecord): Promise<"continue" | "stop"> {
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
			const completedState = updateResearchBatch(state, {
				batchId: batch.id,
				completedStepCount: stepIndex,
				...(outcome.runId ? { addRunId: outcome.runId } : {}),
				...(run ? { currentPathId: run.pathId, lastCompletedPathId: run.pathId } : {}),
				clearInterruptedRunId: true,
				now,
				actor: "system",
			});
			await saveProjectState(this.statePath, completedState);
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
			const rejectedState = updateResearchBatch(state, {
				batchId: batch.id,
				completedStepCount: stepIndex,
				...(outcome.runId ? { addRunId: outcome.runId } : {}),
				clearInterruptedRunId: true,
				now,
				actor: "system",
			});
			await saveProjectState(this.statePath, rejectedState);
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
		const pausedState = updateResearchBatch(state, {
			batchId: batch.id,
			status: "paused",
			...(outcome.kind === "blocked" || outcome.kind === "failed" ? { failureReason: outcome.reason } : {}),
			now,
			actor: "system",
		});
		await saveProjectState(this.statePath, pausedState);
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
		const completedState = updateResearchBatch(state, {
			batchId: batch.id,
			status: "completed",
			completedAt: now,
			now,
			actor: "system",
		});
		await saveProjectState(this.statePath, completedState);
		const completedBatch = completedState.researchBatches.find((candidate) => candidate.id === batch.id) ?? batch;
		await this.notify(formatResearchBatchCompleted({ state: completedState, batch: completedBatch }));
	}

	private async failResearchBatch(
		state: CoMathProjectState,
		batch: ResearchBatchRecord,
		reason: string,
	): Promise<void> {
		const now = new Date().toISOString();
		const failedState = updateResearchBatch(state, {
			batchId: batch.id,
			status: "failed",
			failureReason: reason,
			now,
			actor: "system",
		});
		await saveProjectState(this.statePath, failedState);
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
