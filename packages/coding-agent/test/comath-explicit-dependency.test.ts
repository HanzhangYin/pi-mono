import { describe, expect, it } from "vitest";
import { addResearchPlan, addResearchPlanTask, createEmptyProjectState } from "../src/modes/comath/storage.ts";

const NOW = "2026-07-15T00:00:00.000Z";

describe("Co-Math explicit accepted-task dependencies", () => {
	it("links an explicit accepted task reference even when the draft dependency list is empty", () => {
		let state = createEmptyProjectState({
			projectId: "explicit-dependency",
			title: "Explicit dependency",
			rootQuestion: "Reuse accepted work.",
			now: NOW,
		});
		state = addResearchPlan(state, {
			id: "plan-1",
			title: "Plan",
			objective: "Reuse accepted work.",
			now: NOW,
			actor: "human",
		});
		state = addResearchPlanTask(state, {
			id: "task-1",
			planId: "plan-1",
			kind: "computation",
			title: "Exact finite computation",
			description: "Compute the exact invariants.",
			dependsOnTaskIds: [],
			now: NOW,
			actor: "human",
		});
		state = {
			...state,
			researchPlanTasks: state.researchPlanTasks.map((task) =>
				task.id === "task-1" ? { ...task, status: "completed" as const, reviewOutcome: "accepted" as const } : task,
			),
		};
		state = addResearchPlanTask(state, {
			id: "task-2",
			planId: "plan-1",
			kind: "proof-attempt",
			title: "Deduce the corollary",
			description: "Extract the ranks from accepted task 1 and prove the bounded corollary.",
			dependsOnTaskIds: [],
			now: NOW,
			actor: "human",
		});

		expect(state.researchPlanTasks.at(-1)?.dependsOnTaskIds).toEqual(["task-1"]);
	});

	it("does not infer a dependency from a task reference that is not explicitly accepted", () => {
		let state = createEmptyProjectState({
			projectId: "unaccepted-dependency",
			title: "Unaccepted dependency",
			rootQuestion: "Do not promote unaccepted work.",
			now: NOW,
		});
		state = addResearchPlan(state, {
			id: "plan-1",
			title: "Plan",
			objective: "Do not promote unaccepted work.",
			now: NOW,
			actor: "human",
		});
		state = addResearchPlanTask(state, {
			id: "task-1",
			planId: "plan-1",
			kind: "computation",
			title: "Incomplete computation",
			description: "Attempt the invariants.",
			dependsOnTaskIds: [],
			now: NOW,
			actor: "human",
		});
		state = addResearchPlanTask(state, {
			id: "task-2",
			planId: "plan-1",
			kind: "proof-attempt",
			title: "Premature deduction",
			description: "Use accepted task 1 if it becomes available.",
			dependsOnTaskIds: [],
			now: NOW,
			actor: "human",
		});

		expect(state.researchPlanTasks.at(-1)?.dependsOnTaskIds).toEqual([]);
	});
});
