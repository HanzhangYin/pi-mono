import type { CoMathStateStore } from "./comath-state-store.ts";
import type { ExecuteResearchTaskInput, ExecuteResearchTaskResult } from "./comath-task-engine.ts";
import {
	createResearchExecution,
	dependenciesHaveAcceptedAttempts,
	initializeTaskEngine,
	taskCanStartOrResumeAttempt,
	taskHasAcceptedAttempt,
} from "./comath-task-state.ts";
import type { CoMathProjectState, ResearchExecutionRecord, ResearchPlanTaskRecord } from "./schema.ts";

export interface ScheduleResearchTasksInput {
	executionId?: string;
	/** Explicit resume permission for a task whose latest substantive attempt needs revision. */
	allowBlockedTasks?: boolean;
	taskIds?: readonly string[];
	pathId?: string;
	requestedTaskCount: number;
	now: string;
}

/** Durable execution scheduler. It owns task selection only; the task engine owns lifecycle. */
export class CoMathTaskScheduler {
	private readonly stateStore: CoMathStateStore;
	private readonly taskEngine: ResearchTaskExecutor;

	constructor(options: { stateStore: CoMathStateStore; taskEngine: ResearchTaskExecutor }) {
		this.stateStore = options.stateStore;
		this.taskEngine = options.taskEngine;
	}

	async schedule(
		input: ScheduleResearchTasksInput,
	): Promise<{ execution: ResearchExecutionRecord; results: ExecuteResearchTaskResult[] }> {
		const created = await this.stateStore.transact(
			{ operation: "research-execution-create", actor: "human" },
			(state) => {
				const initialized = initializeTaskEngine(state, input.now);
				if (input.executionId) {
					const existing = initialized.researchExecutions.find((execution) => execution.id === input.executionId);
					if (!existing) throw new Error(`Unknown research execution: ${input.executionId}`);
					const resumed: ResearchExecutionRecord = { ...existing, status: "running", updatedAt: input.now };
					delete resumed.failure;
					return {
						state: {
							...initialized,
							researchExecutions: initialized.researchExecutions.map((execution) =>
								execution.id === resumed.id ? resumed : execution,
							),
							updatedAt: input.now,
						},
						result: resumed,
					};
				}
				const result = createResearchExecution(initialized, {
					taskIds: [],
					requestedTaskCount: input.requestedTaskCount,
					...(input.pathId ? { pathId: input.pathId } : {}),
					now: input.now,
				});
				return { state: result.state, result: result.execution };
			},
		);
		const results: ExecuteResearchTaskResult[] = [];
		const limit = Math.max(1, input.requestedTaskCount);
		const selectedTaskIds = new Set<string>();
		let revisionTaskId: string | undefined;
		while (revisionTaskId || selectedTaskIds.size < limit) {
			const state = await this.stateStore.load();
			if (!state) throw new Error("Co-Math project state is missing.");
			const execution = state.researchExecutions.find((candidate) => candidate.id === created.result.id);
			if (!execution || execution.status !== "running") break;
			const task = selectRunnableTasks(
				state,
				revisionTaskId ? { ...input, taskIds: [revisionTaskId], allowBlockedTasks: true } : input,
			)[0];
			if (!task) {
				await this.finishExecution(
					execution.id,
					results.length > 0 ? "completed" : "paused",
					new Date().toISOString(),
				);
				break;
			}
			selectedTaskIds.add(task.id);
			const pausedAttempt = task.latestAttemptId
				? state.researchTaskAttempts.find(
						(candidate) => candidate.id === task.latestAttemptId && candidate.status === "paused",
					)
				: undefined;
			const selectedAt = new Date().toISOString();
			await this.stateStore.transact(
				{ operation: "research-execution-select-task", actor: "system", changedEntityIds: [execution.id, task.id] },
				(fresh) => ({
					state: {
						...fresh,
						researchExecutions: fresh.researchExecutions.map((candidate) =>
							candidate.id === execution.id
								? {
										...candidate,
										taskIds: [...new Set([...candidate.taskIds, task.id])],
										...(pausedAttempt
											? { attemptIds: [...new Set([...candidate.attemptIds, pausedAttempt.id])] }
											: {}),
										updatedAt: selectedAt,
									}
								: candidate,
						),
						updatedAt: selectedAt,
					},
					result: undefined,
				}),
			);
			let result: ExecuteResearchTaskResult;
			try {
				result = pausedAttempt
					? await this.taskEngine.resumeAttempt(pausedAttempt.id, selectedAt)
					: await this.taskEngine.executeTask({
							taskId: task.id,
							executionId: execution.id,
							now: selectedAt,
						});
			} catch (error) {
				await this.finishExecution(execution.id, "paused", new Date().toISOString());
				throw error;
			}
			results.push(result);
			if (result.status !== "accepted") {
				const afterAttempt = await this.stateStore.load();
				const independentPendingTask = afterAttempt
					? selectRunnableTasks(afterAttempt, { ...input, allowBlockedTasks: false }).find(
							(candidate) => candidate.id !== task.id,
						)
					: undefined;
				if (
					(result.status === "needs-revision" || result.status === "rejected") &&
					independentPendingTask &&
					selectedTaskIds.size < limit
				) {
					revisionTaskId = undefined;
					continue;
				}
				const taskAfterAttempt = afterAttempt?.researchPlanTasks.find((candidate) => candidate.id === task.id);
				const attemptAfterAttempt = afterAttempt?.researchTaskAttempts.find(
					(candidate) => candidate.id === result.attemptId,
				);
				if (
					(result.status === "needs-revision" || result.status === "rejected") &&
					afterAttempt &&
					taskAfterAttempt &&
					attemptAfterAttempt?.failure?.retryable !== false &&
					taskCanStartOrResumeAttempt(afterAttempt, taskAfterAttempt)
				) {
					revisionTaskId = task.id;
					continue;
				}
				await this.finishExecution(execution.id, "paused", new Date().toISOString(), result.attemptId);
				break;
			}
			revisionTaskId = undefined;
		}
		if (selectedTaskIds.size >= limit) {
			const latest = await this.stateStore.load();
			const execution = latest?.researchExecutions.find((candidate) => candidate.id === created.result.id);
			if (execution?.status === "running") {
				await this.finishExecution(created.result.id, "completed", new Date().toISOString());
			}
		}
		const state = await this.stateStore.load();
		if (!state) throw new Error("Co-Math project state is missing.");
		const completed =
			state.researchExecutions.find((execution) => execution.id === created.result.id) ?? created.result;
		return { execution: completed, results };
	}

	private async finishExecution(
		executionId: string,
		status: "paused" | "completed",
		now: string,
		failedAttemptId?: string,
	): Promise<void> {
		await this.stateStore.transact(
			{ operation: "research-execution-finish", actor: "system", changedEntityIds: [executionId] },
			(fresh) => {
				const failedAttempt = failedAttemptId
					? fresh.researchTaskAttempts.find((attempt) => attempt.id === failedAttemptId)
					: undefined;
				const execution = fresh.researchExecutions.find((candidate) => candidate.id === executionId);
				const planIds = new Set(
					(execution?.taskIds ?? []).flatMap((taskId) => {
						const task = fresh.researchPlanTasks.find((candidate) => candidate.id === taskId);
						return task ? [task.planId] : [];
					}),
				);
				const completedPlanIds = new Set(
					[...planIds].filter((planId) => {
						const tasks = fresh.researchPlanTasks.filter((task) => task.planId === planId);
						return (
							status === "completed" &&
							tasks.length > 0 &&
							tasks.every((task) => task.status === "cancelled" || taskHasAcceptedAttempt(fresh, task))
						);
					}),
				);
				const blockedPlanIds = new Set(
					[...planIds].filter((planId) =>
						fresh.researchPlanTasks.some(
							(task) =>
								task.planId === planId && task.status === "blocked" && !taskHasAcceptedAttempt(fresh, task),
						),
					),
				);
				return {
					state: {
						...fresh,
						researchExecutions: fresh.researchExecutions.map((candidate) =>
							candidate.id === executionId
								? {
										...candidate,
										status,
										...(failedAttempt?.failure ? { failure: failedAttempt.failure } : {}),
										updatedAt: now,
										...(status === "completed" ? { completedAt: now } : {}),
									}
								: candidate,
						),
						researchPlans: fresh.researchPlans.map((plan) =>
							planIds.has(plan.id)
								? {
										...plan,
										status:
											status === "paused" || blockedPlanIds.has(plan.id)
												? "paused"
												: completedPlanIds.has(plan.id)
													? "completed"
													: plan.status,
										...(status === "paused" || blockedPlanIds.has(plan.id)
											? { pauseReason: failedAttempt?.failure?.message ?? "A task attempt needs revision." }
											: {}),
										updatedAt: now,
										...(completedPlanIds.has(plan.id) ? { completedAt: now } : {}),
									}
								: plan,
						),
						updatedAt: now,
					},
					result: undefined,
				};
			},
		);
	}
}

export interface ResearchTaskExecutor {
	executeTask(input: ExecuteResearchTaskInput): Promise<ExecuteResearchTaskResult>;
	resumeAttempt(attemptId: string, now: string): Promise<ExecuteResearchTaskResult>;
}

function selectRunnableTasks(state: CoMathProjectState, input: ScheduleResearchTasksInput): ResearchPlanTaskRecord[] {
	const wanted = input.taskIds ? new Set(input.taskIds) : undefined;
	return state.researchPlanTasks
		.filter((task) => (!wanted || wanted.has(task.id)) && (!input.pathId || task.pathId === input.pathId))
		.filter((task) => task.status === "pending" || (input.allowBlockedTasks === true && task.status === "blocked"))
		.filter((task) => !task.acceptedAttemptId && dependenciesHaveAcceptedAttempts(state, task))
		.filter((task) => taskCanStartOrResumeAttempt(state, task))
		.sort((left, right) => {
			const leftPaused = left.latestAttemptId
				? state.researchTaskAttempts.find(
						(attempt) => attempt.id === left.latestAttemptId && attempt.status === "paused",
					)
				: undefined;
			const rightPaused = right.latestAttemptId
				? state.researchTaskAttempts.find(
						(attempt) => attempt.id === right.latestAttemptId && attempt.status === "paused",
					)
				: undefined;
			if (leftPaused && !rightPaused) return -1;
			if (rightPaused && !leftPaused) return 1;
			if (leftPaused && rightPaused) {
				const stageOrder = [
					"evidence-preparation",
					"specialist",
					"claim-validation",
					"critic",
					"synthesis",
					"capability-validation",
					"skeptic",
					"finalization",
				] as const;
				const stageDifference =
					stageOrder.indexOf(rightPaused.currentStage) - stageOrder.indexOf(leftPaused.currentStage);
				if (stageDifference !== 0) return stageDifference;
			}
			if (left.status === "pending" && right.status !== "pending") return -1;
			if (right.status === "pending" && left.status !== "pending") return 1;
			return left.sequence - right.sequence;
		});
}
