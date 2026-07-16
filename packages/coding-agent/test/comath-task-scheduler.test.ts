import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CoMathStateStore } from "../src/modes/comath/comath-state-store.ts";
import type { ExecuteResearchTaskInput, ExecuteResearchTaskResult } from "../src/modes/comath/comath-task-engine.ts";
import type { ResearchTaskExecutor, ScheduleResearchTasksInput } from "../src/modes/comath/comath-task-scheduler.ts";
import { CoMathTaskScheduler } from "../src/modes/comath/comath-task-scheduler.ts";
import {
	attachAttemptToExecution,
	createTaskAttempt,
	endAttempt,
	pauseAttempt,
	resumeTaskAttempt,
} from "../src/modes/comath/comath-task-state.ts";
import type { ResearchTaskAttemptStatus } from "../src/modes/comath/schema.ts";
import {
	addResearchPlan,
	addResearchPlanTask,
	createEmptyProjectState,
	saveProjectState,
} from "../src/modes/comath/storage.ts";

const NOW = "2026-07-13T00:00:00.000Z";

type StubOutcome =
	| ResearchTaskAttemptStatus
	| {
			status: ResearchTaskAttemptStatus;
			failure: NonNullable<Parameters<typeof endAttempt>[4]>;
	  };

class StubTaskExecutor implements ResearchTaskExecutor {
	private readonly stateStore: CoMathStateStore;
	private readonly outcomes: StubOutcome[];
	readonly executedTaskIds: string[] = [];
	readonly resumedAttemptIds: string[] = [];

	constructor(stateStore: CoMathStateStore, outcomes: StubOutcome[]) {
		this.stateStore = stateStore;
		this.outcomes = [...outcomes];
	}

	async executeTask(input: ExecuteResearchTaskInput): Promise<ExecuteResearchTaskResult> {
		this.executedTaskIds.push(input.taskId);
		const nextOutcome = this.outcomes.shift() ?? "accepted";
		const outcome = typeof nextOutcome === "string" ? nextOutcome : nextOutcome.status;
		const failure = typeof nextOutcome === "string" ? undefined : nextOutcome.failure;
		const committed = await this.stateStore.transact(
			{ operation: "stub-task", actor: "system", changedEntityIds: [input.taskId] },
			(state) => {
				const created = createTaskAttempt(state, { taskId: input.taskId, now: input.now, actor: "human" });
				let next = input.executionId
					? attachAttemptToExecution(created.state, input.executionId, created.attempt.id, input.now)
					: created.state;
				if (outcome === "accepted" || outcome === "needs-revision" || outcome === "rejected") {
					next = endAttempt(next, created.attempt.id, outcome, input.now, failure);
				}
				return { state: next, result: { attemptId: created.attempt.id, status: outcome } };
			},
		);
		return committed.result;
	}

	async resumeAttempt(attemptId: string, now: string): Promise<ExecuteResearchTaskResult> {
		this.resumedAttemptIds.push(attemptId);
		const nextOutcome = this.outcomes.shift() ?? "accepted";
		const outcome = typeof nextOutcome === "string" ? nextOutcome : nextOutcome.status;
		const failure = typeof nextOutcome === "string" ? undefined : nextOutcome.failure;
		const committed = await this.stateStore.transact(
			{ operation: "stub-resume", actor: "system", changedEntityIds: [attemptId] },
			(state) => {
				let next = resumeTaskAttempt(state, attemptId, now);
				if (outcome === "accepted" || outcome === "needs-revision" || outcome === "rejected") {
					next = endAttempt(next, attemptId, outcome, now, failure);
				}
				return { state: next, result: { attemptId, status: outcome } };
			},
		);
		return committed.result;
	}
}

describe("co-math task scheduler", () => {
	it("pauses after three bounded revision attempts on one task", async () => {
		await withScheduler(["needs-revision", "needs-revision", "needs-revision"], async ({ scheduler, stateStore }) => {
			const scheduled = await scheduler.schedule({ requestedTaskCount: 1, now: NOW });
			expect(scheduled.results.map((result) => result.status)).toEqual([
				"needs-revision",
				"needs-revision",
				"needs-revision",
			]);
			expect(scheduled.execution.status).toBe("paused");
			const state = await stateStore.load();
			expect(state?.researchPlans[0]?.status).toBe("paused");
		});
	});

	it("continues genuinely independent pending work after another task needs revision", async () => {
		await withScheduler(["needs-revision", "accepted"], async ({ scheduler, stateStore, taskExecutor }) => {
			const state = await stateStore.load();
			if (!state) throw new Error("Expected state.");
			const withIndependent = addResearchPlanTask(state, {
				id: "task-2",
				planId: "plan-1",
				kind: "literature-search",
				title: "Independent task",
				description: "Run independently of task 1.",
				dependsOnTaskIds: [],
				now: NOW,
				actor: "human",
			});
			await saveProjectState(stateStore.statePath, withIndependent);

			const scheduled = await scheduler.schedule({ requestedTaskCount: 2, now: NOW });
			expect(taskExecutor.executedTaskIds).toEqual(["task-1", "task-2"]);
			expect(scheduled.results.map((result) => result.status)).toEqual(["needs-revision", "accepted"]);
			expect(scheduled.execution.status).toBe("completed");
			const completed = await stateStore.load();
			expect(completed?.researchPlans[0]?.status).toBe("paused");
		});
	});

	it("uses remaining execution budget for a bounded reviewer-driven retry", async () => {
		await withScheduler(["needs-revision", "accepted"], async ({ scheduler, taskExecutor }) => {
			const scheduled = await scheduler.schedule({ requestedTaskCount: 2, now: NOW });
			expect(scheduled.results.map((result) => result.status)).toEqual(["needs-revision", "accepted"]);
			expect(taskExecutor.executedTaskIds).toEqual(["task-1", "task-1"]);
			expect(scheduled.results.map((result) => result.attemptId)).toEqual([
				"research-attempt-task-1-1",
				"research-attempt-task-1-2",
			]);
			expect(scheduled.execution.status).toBe("completed");
		});
	});

	it("does not retry a non-retryable attempt failure", async () => {
		await withScheduler(
			[
				{
					status: "needs-revision",
					failure: {
						stage: "capability-validation",
						code: "missing-required-capability",
						message: "The required capability is unavailable.",
						claimIds: [],
						retryable: false,
					},
				},
				"accepted",
			],
			async ({ scheduler, taskExecutor }) => {
				const scheduled = await scheduler.schedule({ requestedTaskCount: 2, now: NOW });
				expect(scheduled.results.map((result) => result.status)).toEqual(["needs-revision"]);
				expect(taskExecutor.executedTaskIds).toEqual(["task-1"]);
				expect(scheduled.execution.status).toBe("paused");
				expect(scheduled.execution.failure?.retryable).toBe(false);
			},
		);
	});

	it("selects a newly unblocked dependent task in the same execution", async () => {
		await withScheduler(["accepted", "accepted"], async ({ scheduler, stateStore }) => {
			const state = await stateStore.load();
			if (!state) throw new Error("Expected state.");
			const withDependent = addResearchPlanTask(state, {
				id: "task-2",
				planId: "plan-1",
				kind: "proof-attempt",
				title: "Dependent task",
				description: "Run after task 1.",
				dependsOnTaskIds: ["task-1"],
				now: NOW,
				actor: "human",
			});
			await saveProjectState(stateStore.statePath, withDependent);

			const scheduled = await scheduler.schedule({ requestedTaskCount: 2, now: NOW });
			expect(scheduled.execution.status).toBe("completed");
			expect(scheduled.execution.taskIds).toEqual(["task-1", "task-2"]);
			expect(scheduled.results.map((result) => result.status)).toEqual(["accepted", "accepted"]);
		});
	});

	it("does not create a fourth attempt after bounded automatic revisions", async () => {
		await withScheduler(["needs-revision", "needs-revision", "needs-revision"], async ({ scheduler }) => {
			const first = await scheduler.schedule({ requestedTaskCount: 1, now: NOW });
			expect(first.results).toHaveLength(3);
			const ordinary = await scheduler.schedule({ requestedTaskCount: 1, now: NOW });
			expect(ordinary.results).toEqual([]);
			expect(ordinary.execution.status).toBe("paused");

			const resumedInput: ScheduleResearchTasksInput = {
				requestedTaskCount: 1,
				allowBlockedTasks: true,
				now: NOW,
			};
			const resumed = await scheduler.schedule(resumedInput);
			expect(resumed.results).toEqual([]);
			expect(resumed.execution.status).toBe("paused");
		});
	});

	it("prioritizes independent pending work before retrying a blocked task", async () => {
		await withScheduler(["needs-revision", "accepted"], async ({ scheduler, stateStore, taskExecutor }) => {
			const state = await stateStore.load();
			if (!state) throw new Error("Expected state.");
			const withIndependent = addResearchPlanTask(state, {
				id: "task-2",
				planId: "plan-1",
				kind: "literature-search",
				title: "Independent task",
				description: "Run independently of the blocked task.",
				dependsOnTaskIds: [],
				now: NOW,
				actor: "human",
			});
			await saveProjectState(stateStore.statePath, withIndependent);

			const resumed = await scheduler.schedule({ requestedTaskCount: 2, allowBlockedTasks: true, now: NOW });
			expect(resumed.results.map((result) => result.status)).toEqual(["needs-revision", "accepted"]);
			expect(taskExecutor.executedTaskIds).toEqual(["task-1", "task-2"]);
		});
	});

	it("resumes a paused infrastructure attempt instead of creating a new attempt", async () => {
		await withScheduler(["accepted"], async ({ scheduler, stateStore, taskExecutor }) => {
			const loaded = await stateStore.load();
			if (!loaded) throw new Error("Expected state.");
			const created = createTaskAttempt(loaded, { taskId: "task-1", now: NOW, actor: "human" });
			const paused = pauseAttempt(
				created.state,
				created.attempt.id,
				{
					stage: "specialist",
					code: "provider-timeout",
					message: "Provider timed out.",
					claimIds: [],
					retryable: true,
				},
				NOW,
			);
			await saveProjectState(stateStore.statePath, paused);

			const resumed = await scheduler.schedule({ requestedTaskCount: 1, allowBlockedTasks: true, now: NOW });
			expect(resumed.results[0]).toEqual({ attemptId: created.attempt.id, status: "accepted" });
			expect(taskExecutor.resumedAttemptIds).toEqual([created.attempt.id]);
			expect(taskExecutor.executedTaskIds).toEqual([]);
			const completed = await stateStore.load();
			expect(completed?.researchPlanTasks[0]?.attemptIds).toEqual([created.attempt.id]);
		});
	});

	it("resumes the most advanced paused attempt before starting fresh work", async () => {
		await withScheduler(["accepted"], async ({ scheduler, stateStore, taskExecutor }) => {
			const loaded = await stateStore.load();
			if (!loaded) throw new Error("Expected state.");
			let state = addResearchPlanTask(loaded, {
				id: "task-2",
				planId: "plan-1",
				kind: "proof-attempt",
				title: "Advanced paused task",
				description: "Resume the critic stage.",
				dependsOnTaskIds: [],
				now: NOW,
				actor: "human",
			});
			const created = createTaskAttempt(state, { taskId: "task-2", now: NOW, actor: "human" });
			state = pauseAttempt(
				created.state,
				created.attempt.id,
				{
					stage: "critic",
					code: "interrupted-execution",
					message: "Critic interrupted.",
					claimIds: [],
					retryable: true,
				},
				NOW,
			);
			await saveProjectState(stateStore.statePath, state);

			const resumed = await scheduler.schedule({ requestedTaskCount: 1, allowBlockedTasks: true, now: NOW });
			expect(resumed.results).toEqual([{ attemptId: created.attempt.id, status: "accepted" }]);
			expect(taskExecutor.resumedAttemptIds).toEqual([created.attempt.id]);
			expect(taskExecutor.executedTaskIds).toEqual([]);
		});
	});

	it("pauses the execution when task startup throws", async () => {
		const directory = await mkdtemp(join(tmpdir(), "comath-task-scheduler-"));
		try {
			const statePath = join(directory, ".pi", "co-math", "state.json");
			let state = createEmptyProjectState({
				projectId: "scheduler-error",
				title: "Scheduler error",
				rootQuestion: "Test startup failure.",
				now: NOW,
			});
			state = addResearchPlan(state, {
				id: "plan-1",
				title: "Plan",
				objective: "Test startup failure.",
				now: NOW,
				actor: "human",
			});
			state = addResearchPlanTask(state, {
				id: "task-1",
				planId: "plan-1",
				kind: "proof-attempt",
				title: "Task",
				description: "Throw on startup.",
				dependsOnTaskIds: [],
				now: NOW,
				actor: "human",
			});
			await saveProjectState(statePath, state);
			const stateStore = new CoMathStateStore(statePath);
			const scheduler = new CoMathTaskScheduler({
				stateStore,
				taskEngine: {
					executeTask: async () => {
						throw new Error("startup failed");
					},
					resumeAttempt: async () => {
						throw new Error("unexpected resume");
					},
				},
			});

			await expect(scheduler.schedule({ requestedTaskCount: 1, now: NOW })).rejects.toThrow("startup failed");
			const completed = await stateStore.load();
			expect(completed?.researchExecutions[0]?.status).toBe("paused");
			expect(completed?.researchPlans[0]?.status).toBe("paused");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});

async function withScheduler(
	outcomes: StubOutcome[],
	run: (input: {
		scheduler: CoMathTaskScheduler;
		stateStore: CoMathStateStore;
		taskExecutor: StubTaskExecutor;
	}) => Promise<void>,
): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "comath-task-scheduler-"));
	try {
		const statePath = join(directory, ".pi", "co-math", "state.json");
		let state = createEmptyProjectState({
			projectId: "scheduler",
			title: "Scheduler",
			rootQuestion: "Test scheduling.",
			now: NOW,
		});
		state = addResearchPlan(state, {
			id: "plan-1",
			title: "Plan",
			objective: "Test scheduling.",
			now: NOW,
			actor: "human",
		});
		state = addResearchPlanTask(state, {
			id: "task-1",
			planId: "plan-1",
			kind: "proof-attempt",
			title: "First task",
			description: "Run first.",
			dependsOnTaskIds: [],
			now: NOW,
			actor: "human",
		});
		await saveProjectState(statePath, state);
		const stateStore = new CoMathStateStore(statePath);
		const taskExecutor = new StubTaskExecutor(stateStore, outcomes);
		const scheduler = new CoMathTaskScheduler({
			stateStore,
			taskEngine: taskExecutor,
		});
		await run({ scheduler, stateStore, taskExecutor });
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}
