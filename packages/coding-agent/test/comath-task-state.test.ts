import { describe, expect, it } from "vitest";
import {
	createTaskAttempt,
	dependenciesHaveAcceptedAttempts,
	endAttempt,
	initializeTaskEngine,
	MAX_SUBSTANTIVE_TASK_ATTEMPTS,
	pauseAttempt,
	resumeResearchPlan,
	resumeTaskAttempt,
	updateAttemptStage,
} from "../src/modes/comath/comath-task-state.ts";
import type { CoMathProjectState } from "../src/modes/comath/schema.ts";
import { addResearchPlan, addResearchPlanTask, createEmptyProjectState } from "../src/modes/comath/storage.ts";

const NOW = "2026-07-13T00:00:00.000Z";

function createState(now: string): CoMathProjectState {
	return createEmptyProjectState({
		projectId: "task-engine",
		title: "Task engine",
		rootQuestion: "Test attempts",
		now,
	});
}

function createResearchPlan(state: CoMathProjectState, now: string): CoMathProjectState {
	return addResearchPlan(state, { id: "plan-1", title: "Plan", objective: "Test", now, actor: "human" });
}

function createResearchPlanTask(
	state: CoMathProjectState,
	input: { id: string; now: string; dependencies: string[] },
): CoMathProjectState {
	return addResearchPlanTask(state, {
		id: input.id,
		planId: "plan-1",
		kind: "proof-attempt",
		title: input.id,
		description: input.id,
		dependsOnTaskIds: input.dependencies,
		now: input.now,
		actor: "human",
	});
}

describe("single-task engine state", () => {
	it("creates immutable attempts on one task and does not rewire dependencies", () => {
		let state = initializeTaskEngine(createState(NOW), NOW);
		state = createResearchPlan(state, NOW);
		state = createResearchPlanTask(state, { id: "task-1", now: NOW, dependencies: [] });
		const first = createTaskAttempt(state, { taskId: "task-1", now: NOW, actor: "human" });
		state = endAttempt(first.state, first.attempt.id, "needs-revision", NOW, {
			stage: "claim-validation",
			code: "grounding-invalid",
			message: "Need exact source lines.",
			claimIds: ["claim-1"],
			retryable: false,
		});
		const second = createTaskAttempt(state, { taskId: "task-1", now: NOW, actor: "human" });

		expect(second.attempt.id).toBe("research-attempt-task-1-2");
		expect(second.state.researchPlanTasks[0]?.attemptIds).toEqual([first.attempt.id, second.attempt.id]);
		expect(second.state.researchPlanTasks[0]?.dependsOnTaskIds).toEqual([]);
		expect(second.state.researchPlanTasks[0]).toMatchObject({
			status: "running",
			latestAttemptId: second.attempt.id,
		});
		expect(second.state.researchPlanTasks[0]?.reviewOutcome).toBeUndefined();
		expect(second.state.researchPlanTasks[0]?.blockedReason).toBeUndefined();
		expect(second.state.researchPlanTasks[0]?.failureReason).toBeUndefined();
		expect(second.state.researchPlanTasks[0]?.completedAt).toBeUndefined();
	});

	it("requires accepted attempts before a dependency becomes runnable", () => {
		let state = initializeTaskEngine(createState(NOW), NOW);
		state = createResearchPlan(state, NOW);
		state = createResearchPlanTask(state, { id: "task-1", now: NOW, dependencies: [] });
		state = createResearchPlanTask(state, { id: "task-2", now: NOW, dependencies: ["task-1"] });
		const first = createTaskAttempt(state, { taskId: "task-1", now: NOW, actor: "human" });
		state = endAttempt(first.state, first.attempt.id, "accepted", NOW);

		expect(dependenciesHaveAcceptedAttempts(state, state.researchPlanTasks[1]!)).toBe(true);
	});

	it("prohibits a fourth substantive attempt", () => {
		let state = initializeTaskEngine(createState(NOW), NOW);
		state = createResearchPlan(state, NOW);
		state = createResearchPlanTask(state, { id: "task-1", now: NOW, dependencies: [] });
		for (let count = 0; count < MAX_SUBSTANTIVE_TASK_ATTEMPTS; count += 1) {
			const created = createTaskAttempt(state, { taskId: "task-1", now: NOW, actor: "human" });
			state = endAttempt(created.state, created.attempt.id, "rejected", NOW);
		}
		expect(() => createTaskAttempt(state, { taskId: "task-1", now: NOW, actor: "human" })).toThrow("attempt limit");
	});

	it("resumes independent work without resetting an exhausted task", () => {
		let state = initializeTaskEngine(createState(NOW), NOW);
		state = createResearchPlan(state, NOW);
		state = createResearchPlanTask(state, { id: "task-1", now: NOW, dependencies: [] });
		state = createResearchPlanTask(state, { id: "task-2", now: NOW, dependencies: [] });
		for (let count = 0; count < MAX_SUBSTANTIVE_TASK_ATTEMPTS; count += 1) {
			const created = createTaskAttempt(state, { taskId: "task-1", now: NOW, actor: "human" });
			state = endAttempt(created.state, created.attempt.id, "needs-revision", NOW);
		}

		const resumed = resumeResearchPlan(state, "plan-1", NOW);
		expect(resumed.resumedTaskIds).toEqual(["task-2"]);
		expect(resumed.state.researchPlanTasks[0]).toMatchObject({ status: "blocked" });
		expect(resumed.state.researchPlanTasks[0]?.attemptIds).toHaveLength(MAX_SUBSTANTIVE_TASK_ATTEMPTS);
		expect(resumed.state.researchPlanTasks[1]).toMatchObject({ status: "pending" });
	});

	it("resumes an infrastructure-paused stage on the same attempt and clears stale projected state", () => {
		let state = initializeTaskEngine(createState(NOW), NOW);
		state = createResearchPlan(state, NOW);
		state = createResearchPlanTask(state, { id: "task-1", now: NOW, dependencies: [] });
		const created = createTaskAttempt(state, { taskId: "task-1", now: NOW, actor: "human" });
		state = updateAttemptStage(created.state, {
			attemptId: created.attempt.id,
			stage: "evidence-preparation",
			status: "completed",
			now: NOW,
		});
		state = pauseAttempt(
			state,
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

		const resumedPlan = resumeResearchPlan(state, "plan-1", NOW);
		expect(resumedPlan.state.researchPlanTasks[0]).toMatchObject({ status: "pending" });
		expect(resumedPlan.state.researchPlanTasks[0]?.reviewOutcome).toBeUndefined();
		expect(resumedPlan.state.researchPlanTasks[0]?.blockedReason).toBeUndefined();

		state = resumeTaskAttempt(resumedPlan.state, created.attempt.id, NOW);
		state = updateAttemptStage(state, {
			attemptId: created.attempt.id,
			stage: "specialist",
			status: "running",
			now: NOW,
		});
		const resumedAttempt = state.researchTaskAttempts[0];
		expect(resumedAttempt?.id).toBe(created.attempt.id);
		expect(resumedAttempt?.status).toBe("running");
		expect(resumedAttempt?.failure).toBeUndefined();
		expect(resumedAttempt?.stages.find((stage) => stage.stage === "evidence-preparation")?.status).toBe("completed");
		expect(resumedAttempt?.stages.find((stage) => stage.stage === "specialist")?.failure).toBeUndefined();
		expect(state.researchPlanTasks[0]?.status).toBe("running");
	});
});
