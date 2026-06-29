import {
	formatResearchBatchCancelled,
	formatResearchBatchCompleted,
	formatResearchBatchFailed,
	formatResearchBatchPaused,
	formatResearchBatchStepCompleted,
} from "./comath-progress.ts";
import {
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
}

export class CoMathResearchBatchRunner {
	private readonly statePath: string;
	private readonly notify: CoMathResearchRunnerNotify;
	private readonly researchRunner: CoMathResearchRunner;
	private readonly activeResearchBatches = new Map<string, Promise<void>>();

	constructor(options: CoMathResearchBatchRunnerOptions) {
		this.statePath = options.statePath;
		this.notify = options.notify;
		this.researchRunner = options.researchRunner;
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
