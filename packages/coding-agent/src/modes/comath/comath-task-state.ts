import type {
	CoMathActor,
	CoMathCanonicalProjection,
	CoMathProjectState,
	ResearchAttemptFailure,
	ResearchExecutionRecord,
	ResearchPlanTaskRecord,
	ResearchTaskAttemptRecord,
	ResearchTaskAttemptStageRecord,
	ResearchTaskAttemptStatus,
	ResearchTaskPipelineStage,
} from "./schema.ts";
import { createResearchTaskAttemptStages } from "./storage.ts";

export const CO_MATH_TASK_ENGINE_POLICY_VERSION = 1;
export const MAX_SUBSTANTIVE_TASK_ATTEMPTS = 3;
export const MAX_STAGE_RETRIES = 2;

export interface ResearchPlanResumeResult {
	state: CoMathProjectState;
	resumedTaskIds: string[];
	/** Always empty in the single-task engine; retries are attempts, never repair tasks. */
	repairTaskIds: string[];
	blockedReason?: string;
}

export interface PriorTaskAttemptFailure {
	attemptId: string;
	attemptNumber: number;
	status: ResearchTaskAttemptStatus;
	failure: ResearchAttemptFailure;
}

export function resumeResearchPlan(state: CoMathProjectState, planId: string, now: string): ResearchPlanResumeResult {
	const normalizedState: CoMathProjectState = {
		...state,
		researchPlanTasks: state.researchPlanTasks.map((task) =>
			task.planId === planId &&
			(task.status === "pending" || task.status === "blocked") &&
			!task.acceptedAttemptId &&
			!taskCanStartOrResumeAttempt(state, task)
				? {
						...task,
						status: "blocked",
						blockedReason: `Task ${task.id} has reached the ${MAX_SUBSTANTIVE_TASK_ATTEMPTS}-attempt limit and needs plan amendment or user direction.`,
						updatedAt: now,
					}
				: task,
		),
	};
	const plan = normalizedState.researchPlans.find((candidate) => candidate.id === planId);
	if (!plan)
		return { state, resumedTaskIds: [], repairTaskIds: [], blockedReason: "The research plan does not exist." };
	const tasks = normalizedState.researchPlanTasks.filter((task) => task.planId === planId);
	const resumable = tasks.filter(
		(task) =>
			(task.status === "pending" || task.status === "blocked") &&
			dependenciesHaveAcceptedAttempts(normalizedState, task) &&
			taskCanStartOrResumeAttempt(normalizedState, task),
	);
	if (resumable.length === 0) {
		const blockedReason = "The plan remains paused because no task attempt is runnable.";
		return {
			state: {
				...normalizedState,
				researchPlans: normalizedState.researchPlans.map((candidate) =>
					candidate.id === planId
						? { ...candidate, status: "paused", pauseReason: blockedReason, updatedAt: now }
						: candidate,
				),
				updatedAt: now,
			},
			resumedTaskIds: [],
			repairTaskIds: [],
			blockedReason,
		};
	}
	return {
		state: {
			...normalizedState,
			researchPlanTasks: normalizedState.researchPlanTasks.map((candidate) => {
				if (!resumable.some((task) => task.id === candidate.id)) {
					if (
						candidate.planId === planId &&
						(candidate.status === "pending" || candidate.status === "blocked") &&
						!candidate.acceptedAttemptId &&
						!taskCanStartOrResumeAttempt(normalizedState, candidate)
					) {
						return {
							...candidate,
							status: "blocked",
							blockedReason: `Task ${candidate.id} has reached the ${MAX_SUBSTANTIVE_TASK_ATTEMPTS}-attempt limit and needs plan amendment or user direction.`,
							updatedAt: now,
						};
					}
					return candidate;
				}
				const {
					blockedReason: _blockedReason,
					failureReason: _failureReason,
					reviewOutcome: _reviewOutcome,
					startedAt: _startedAt,
					completedAt: _completedAt,
					...cleanTask
				} = candidate;
				return { ...cleanTask, status: "pending", updatedAt: now };
			}),
			researchPlans: normalizedState.researchPlans.map((candidate) =>
				candidate.id === planId
					? { ...candidate, status: "active", pauseReason: undefined, updatedAt: now }
					: candidate,
			),
			updatedAt: now,
		},
		resumedTaskIds: resumable.map((task) => task.id),
		repairTaskIds: [],
	};
}

/** Resume one infrastructure-paused attempt without creating another substantive attempt. */
export function resumeTaskAttempt(state: CoMathProjectState, attemptId: string, now: string): CoMathProjectState {
	const attempt = state.researchTaskAttempts.find((candidate) => candidate.id === attemptId);
	if (!attempt) throw new Error(`Unknown research task attempt: ${attemptId}`);
	if (attempt.status !== "paused") throw new Error(`Research attempt ${attemptId} is not paused.`);
	const task = getTask(state, attempt.taskId);
	return {
		...state,
		researchTaskAttempts: state.researchTaskAttempts.map((candidate) => {
			if (candidate.id !== attemptId) return candidate;
			const { failure: _failure, completedAt: _completedAt, ...cleanAttempt } = candidate;
			return { ...cleanAttempt, status: "queued", updatedAt: now };
		}),
		researchPlanTasks: state.researchPlanTasks.map((candidate) => {
			if (candidate.id !== task.id) return candidate;
			const {
				blockedReason: _blockedReason,
				failureReason: _failureReason,
				reviewOutcome: _reviewOutcome,
				completedAt: _completedAt,
				...cleanTask
			} = candidate;
			return { ...cleanTask, status: "running", startedAt: candidate.startedAt ?? now, updatedAt: now };
		}),
		updatedAt: now,
	};
}

export function initializeTaskEngine(state: CoMathProjectState, now: string): CoMathProjectState {
	if (state.enginePolicyVersion === CO_MATH_TASK_ENGINE_POLICY_VERSION) return state;
	return {
		...state,
		enginePolicyVersion: CO_MATH_TASK_ENGINE_POLICY_VERSION,
		researchTaskAttempts: state.researchTaskAttempts ?? [],
		researchExecutions: state.researchExecutions ?? [],
		canonicalProjection: state.canonicalProjection ?? emptyCanonicalProjection(now),
		updatedAt: now,
	};
}

export function emptyCanonicalProjection(now: string): CoMathCanonicalProjection {
	return {
		policyVersion: 1,
		acceptedAttemptIds: [],
		acceptedLegacyReportIds: [],
		workingPaperSectionIds: [],
		updatedAt: now,
	};
}

export function taskHasAcceptedAttempt(state: CoMathProjectState, task: ResearchPlanTaskRecord): boolean {
	if (task.acceptedAttemptId) {
		return state.researchTaskAttempts.some(
			(attempt) =>
				attempt.id === task.acceptedAttemptId && attempt.taskId === task.id && attempt.status === "accepted",
		);
	}
	return task.status === "completed" && task.reviewOutcome === "accepted";
}

export function dependenciesHaveAcceptedAttempts(state: CoMathProjectState, task: ResearchPlanTaskRecord): boolean {
	return task.dependsOnTaskIds.every((dependencyId) => {
		const dependency = state.researchPlanTasks.find((candidate) => candidate.id === dependencyId);
		return dependency !== undefined && taskHasAcceptedAttempt(state, dependency);
	});
}

export function taskCanStartOrResumeAttempt(state: CoMathProjectState, task: ResearchPlanTaskRecord): boolean {
	const latest = task.latestAttemptId
		? state.researchTaskAttempts.find((attempt) => attempt.id === task.latestAttemptId)
		: undefined;
	if (latest?.status === "paused") return true;
	const historicalAttemptCount =
		task.attemptIds.length > 0 ? task.attemptIds.length : hasLegacyAttempt(state, task) ? 1 : 0;
	return historicalAttemptCount < MAX_SUBSTANTIVE_TASK_ATTEMPTS;
}

export function getPriorTaskAttemptFailures(
	state: CoMathProjectState,
	taskId: string,
	excludeAttemptId?: string,
): PriorTaskAttemptFailure[] {
	return state.researchTaskAttempts
		.filter((attempt) => attempt.taskId === taskId && attempt.id !== excludeAttemptId && attempt.failure)
		.map((attempt) => ({
			attemptId: attempt.id,
			attemptNumber: attempt.attemptNumber,
			status: attempt.status,
			failure: attempt.failure!,
		}));
}

export function createTaskAttempt(
	state: CoMathProjectState,
	input: { taskId: string; now: string; actor: CoMathActor },
): { state: CoMathProjectState; attempt: ResearchTaskAttemptRecord } {
	const stateWithEngine = initializeTaskEngine(state, input.now);
	const task = getTask(stateWithEngine, input.taskId);
	if (!dependenciesHaveAcceptedAttempts(stateWithEngine, task)) {
		throw new Error(`Task ${task.id} is waiting for an accepted prerequisite.`);
	}
	const latest = task.latestAttemptId
		? stateWithEngine.researchTaskAttempts.find((attempt) => attempt.id === task.latestAttemptId)
		: undefined;
	if (latest && (latest.status === "queued" || latest.status === "running" || latest.status === "paused")) {
		return { state: stateWithEngine, attempt: latest };
	}
	const historicalAttemptCount =
		task.attemptIds.length > 0 ? task.attemptIds.length : hasLegacyAttempt(stateWithEngine, task) ? 1 : 0;
	if (historicalAttemptCount >= MAX_SUBSTANTIVE_TASK_ATTEMPTS) {
		throw new Error(
			`Task ${task.id} has reached the ${MAX_SUBSTANTIVE_TASK_ATTEMPTS}-attempt limit and needs plan amendment or user direction.`,
		);
	}
	const attemptNumber = historicalAttemptCount + 1;
	const id = `research-attempt-${task.id}-${attemptNumber}`;
	const attempt: ResearchTaskAttemptRecord = {
		id,
		taskId: task.id,
		planId: task.planId,
		attemptNumber,
		status: "queued",
		currentStage: "evidence-preparation",
		stages: createResearchTaskAttemptStages(),
		computationArtifactIds: [],
		modelCalls: [],
		startedAt: input.now,
		updatedAt: input.now,
	};
	return {
		state: {
			...stateWithEngine,
			researchTaskAttempts: [...stateWithEngine.researchTaskAttempts, attempt],
			researchPlanTasks: stateWithEngine.researchPlanTasks.map((candidate) =>
				candidate.id === task.id
					? (() => {
							const {
								blockedReason: _blockedReason,
								failureReason: _failureReason,
								reviewOutcome: _reviewOutcome,
								startedAt: _startedAt,
								completedAt: _completedAt,
								...cleanTask
							} = candidate;
							return {
								...cleanTask,
								attemptIds: uniqueIds([...candidate.attemptIds, id]),
								latestAttemptId: id,
								status: "running",
								startedAt: input.now,
								updatedAt: input.now,
							};
						})()
					: candidate,
			),
			updatedAt: input.now,
		},
		attempt,
	};
}

export function updateAttemptStage(
	state: CoMathProjectState,
	input: {
		attemptId: string;
		stage: ResearchTaskPipelineStage;
		status: ResearchTaskAttemptStageRecord["status"];
		now: string;
		modelCallIds?: readonly string[];
		artifactIds?: readonly string[];
		failure?: ResearchAttemptFailure;
	},
): CoMathProjectState {
	return withAttempt(state, input.attemptId, (attempt) => {
		const stages = attempt.stages.map((candidate) => {
			if (candidate.stage !== input.stage) return candidate;
			const base =
				input.status === "running"
					? (() => {
							const { completedAt: _completedAt, failure: _failure, ...cleanStage } = candidate;
							return cleanStage;
						})()
					: candidate;
			return {
				...base,
				status: input.status,
				...(input.status === "running" && !candidate.startedAt ? { startedAt: input.now } : {}),
				...(input.status === "completed" || input.status === "blocked" || input.status === "failed"
					? { completedAt: input.now }
					: {}),
				modelCallIds: uniqueIds([...candidate.modelCallIds, ...(input.modelCallIds ?? [])]),
				artifactIds: uniqueIds([...candidate.artifactIds, ...(input.artifactIds ?? [])]),
				...(input.failure ? { failure: input.failure } : {}),
			};
		});
		const baseAttempt =
			input.status === "running"
				? (() => {
						const { completedAt: _completedAt, failure: _failure, ...cleanAttempt } = attempt;
						return cleanAttempt;
					})()
				: attempt;
		return {
			...baseAttempt,
			status: input.status === "running" ? "running" : attempt.status,
			currentStage: input.stage,
			stages,
			...(input.failure ? { failure: input.failure } : {}),
			updatedAt: input.now,
		};
	});
}

export function pauseAttempt(
	state: CoMathProjectState,
	attemptId: string,
	failure: ResearchAttemptFailure,
	now: string,
): CoMathProjectState {
	return projectAttemptStatus(
		updateAttemptStage(state, { attemptId, stage: failure.stage, status: "blocked", failure, now }),
		attemptId,
		"paused",
		now,
	);
}

export function endAttempt(
	state: CoMathProjectState,
	attemptId: string,
	status: Extract<ResearchTaskAttemptStatus, "needs-revision" | "rejected" | "accepted" | "failed" | "cancelled">,
	now: string,
	failure?: ResearchAttemptFailure,
): CoMathProjectState {
	return projectAttemptStatus(state, attemptId, status, now, failure);
}

export function attachAttemptArtifacts(
	state: CoMathProjectState,
	input: {
		attemptId: string;
		sourceCatalogArtifactId?: string;
		claimLedgerArtifactId?: string;
		reportArtifactId?: string;
		computationArtifactIds?: readonly string[];
		modelCalls?: ReadonlyArray<ResearchTaskAttemptRecord["modelCalls"][number]>;
		now: string;
	},
): CoMathProjectState {
	return withAttempt(state, input.attemptId, (attempt) => ({
		...attempt,
		...(input.sourceCatalogArtifactId ? { sourceCatalogArtifactId: input.sourceCatalogArtifactId } : {}),
		...(input.claimLedgerArtifactId ? { claimLedgerArtifactId: input.claimLedgerArtifactId } : {}),
		...(input.reportArtifactId ? { reportArtifactId: input.reportArtifactId } : {}),
		computationArtifactIds: uniqueIds([...attempt.computationArtifactIds, ...(input.computationArtifactIds ?? [])]),
		modelCalls: [...attempt.modelCalls, ...(input.modelCalls ?? [])],
		updatedAt: input.now,
	}));
}

export function updateAttemptModelCall(
	state: CoMathProjectState,
	input: {
		attemptId: string;
		callId: string;
		status: "completed" | "failed";
		now: string;
		provenance?: Partial<ResearchTaskAttemptRecord["modelCalls"][number]>;
		error?: string;
	},
): CoMathProjectState {
	return withAttempt(state, input.attemptId, (attempt) => {
		if (!attempt.modelCalls.some((call) => call.id === input.callId)) {
			throw new Error(`Unknown model call ${input.callId} on attempt ${input.attemptId}.`);
		}
		return {
			...attempt,
			modelCalls: attempt.modelCalls.map((call) =>
				call.id === input.callId
					? {
							...call,
							...(input.provenance ?? {}),
							id: call.id,
							stage: call.stage,
							at: call.at,
							status: input.status,
							completedAt: input.now,
							...(input.error ? { error: input.error } : {}),
						}
					: call,
			),
			updatedAt: input.now,
		};
	});
}

export function createResearchExecution(
	state: CoMathProjectState,
	input: { taskIds: readonly string[]; requestedTaskCount: number; pathId?: string; now: string },
): { state: CoMathProjectState; execution: ResearchExecutionRecord } {
	const next = initializeTaskEngine(state, input.now);
	const execution: ResearchExecutionRecord = {
		id: `research-execution-${next.researchExecutions.length + 1}`,
		requestedTaskCount: Math.max(1, Math.floor(input.requestedTaskCount)),
		...(input.pathId ? { pathId: input.pathId } : {}),
		taskIds: uniqueIds(input.taskIds),
		attemptIds: [],
		status: "running",
		createdAt: input.now,
		updatedAt: input.now,
	};
	return {
		state: { ...next, researchExecutions: [...next.researchExecutions, execution], updatedAt: input.now },
		execution,
	};
}

export function attachAttemptToExecution(
	state: CoMathProjectState,
	executionId: string,
	attemptId: string,
	now: string,
): CoMathProjectState {
	return {
		...state,
		researchExecutions: state.researchExecutions.map((execution) =>
			execution.id === executionId
				? { ...execution, attemptIds: uniqueIds([...execution.attemptIds, attemptId]), updatedAt: now }
				: execution,
		),
		updatedAt: now,
	};
}

function projectAttemptStatus(
	state: CoMathProjectState,
	attemptId: string,
	status: ResearchTaskAttemptStatus,
	now: string,
	failure?: ResearchAttemptFailure,
): CoMathProjectState {
	const attempt = state.researchTaskAttempts.find((candidate) => candidate.id === attemptId);
	if (!attempt) throw new Error(`Unknown research task attempt: ${attemptId}`);
	const task = getTask(state, attempt.taskId);
	const taskStatus =
		status === "accepted" ? "completed" : status === "running" || status === "queued" ? "running" : "blocked";
	const reviewOutcome =
		status === "accepted"
			? "accepted"
			: status === "rejected"
				? "rejected"
				: status === "needs-revision"
					? "needs-revision"
					: "unreviewed";
	return {
		...state,
		researchTaskAttempts: state.researchTaskAttempts.map((candidate) =>
			candidate.id === attemptId
				? {
						...candidate,
						status,
						...(failure ? { failure } : {}),
						updatedAt: now,
						...(isTerminal(status) ? { completedAt: now } : {}),
					}
				: candidate,
		),
		researchPlanTasks: state.researchPlanTasks.map((candidate) =>
			candidate.id === task.id
				? {
						...candidate,
						status: taskStatus,
						reviewOutcome,
						...(status === "accepted" ? { acceptedAttemptId: attemptId, completedAt: now } : {}),
						...(status === "accepted" ? {} : { blockedReason: failure?.message ?? candidate.blockedReason }),
						updatedAt: now,
					}
				: candidate,
		),
		canonicalProjection:
			status === "accepted"
				? {
						...(state.canonicalProjection ?? emptyCanonicalProjection(now)),
						acceptedAttemptIds: uniqueIds([...(state.canonicalProjection?.acceptedAttemptIds ?? []), attemptId]),
						updatedAt: now,
					}
				: state.canonicalProjection,
		updatedAt: now,
	};
}

function withAttempt(
	state: CoMathProjectState,
	attemptId: string,
	transform: (attempt: ResearchTaskAttemptRecord) => ResearchTaskAttemptRecord,
): CoMathProjectState {
	if (!state.researchTaskAttempts.some((attempt) => attempt.id === attemptId)) {
		throw new Error(`Unknown research task attempt: ${attemptId}`);
	}
	return {
		...state,
		researchTaskAttempts: state.researchTaskAttempts.map((attempt) =>
			attempt.id === attemptId ? transform(attempt) : attempt,
		),
	};
}

function getTask(state: CoMathProjectState, taskId: string): ResearchPlanTaskRecord {
	const task = state.researchPlanTasks.find((candidate) => candidate.id === taskId);
	if (!task) throw new Error(`Unknown research plan task: ${taskId}`);
	return task;
}

function hasLegacyAttempt(state: CoMathProjectState, task: ResearchPlanTaskRecord): boolean {
	return Boolean(task.runId || task.reportId || state.researchWorkstreamRuns.some((run) => run.taskId === task.id));
}

function isTerminal(status: ResearchTaskAttemptStatus): boolean {
	return (
		status === "needs-revision" ||
		status === "rejected" ||
		status === "accepted" ||
		status === "failed" ||
		status === "cancelled"
	);
}

function uniqueIds(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
