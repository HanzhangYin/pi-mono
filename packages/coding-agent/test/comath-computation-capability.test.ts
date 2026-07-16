import { describe, expect, it } from "vitest";
import {
	hasAcceptedCitedComputationArtifact,
	requiresSandboxedComputationArtifact,
} from "../src/modes/comath/comath-task-engine.ts";
import { attachAttemptArtifacts, createTaskAttempt, endAttempt } from "../src/modes/comath/comath-task-state.ts";
import { addResearchPlan, addResearchPlanTask, createEmptyProjectState } from "../src/modes/comath/storage.ts";

const NOW = "2026-07-15T00:00:00.000Z";
const ARTIFACT_ID = "162283c7d25bcc9b6cf77717e180ce1c85e4bdcbe2d0dbabc186aab75e18d126";

describe("Co-Math computation capability", () => {
	it("does not require an executable artifact for a hand-derived symbolic proof", () => {
		let state = createEmptyProjectState({
			projectId: "symbolic-proof-capability",
			title: "Symbolic proof capability",
			rootQuestion: "Prove a determinant identity.",
			now: NOW,
		});
		state = addResearchPlan(state, {
			id: "plan-1",
			title: "Plan",
			objective: "Prove a determinant identity.",
			now: NOW,
			actor: "human",
		});
		state = addResearchPlanTask(state, {
			id: "task-1",
			planId: "plan-1",
			kind: "proof-attempt",
			title: "Bordered determinant proof",
			description: "Display the Jacobi-Trudi matrices and prove the Laplace-minor identity with all signs.",
			requiredCapabilities: ["sandboxed-computation"],
			now: NOW,
			actor: "human",
		});

		expect(requiresSandboxedComputationArtifact(state.researchPlanTasks[0]!)).toBe(false);
	});

	it("retains strict artifacts for computation tasks and explicitly executable proof checks", () => {
		let state = createEmptyProjectState({
			projectId: "executable-proof-capability",
			title: "Executable proof capability",
			rootQuestion: "Check a determinant identity.",
			now: NOW,
		});
		state = addResearchPlan(state, {
			id: "plan-1",
			title: "Plan",
			objective: "Check a determinant identity.",
			now: NOW,
			actor: "human",
		});
		state = addResearchPlanTask(state, {
			id: "proof-task",
			planId: "plan-1",
			kind: "proof-attempt",
			title: "Machine-check the identity",
			description: "Run a computer-algebra script and preserve its captured output.",
			requiredCapabilities: ["sandboxed-computation"],
			now: NOW,
			actor: "human",
		});
		state = addResearchPlanTask(state, {
			id: "computation-task",
			planId: "plan-1",
			kind: "computation",
			title: "Exact finite check",
			description: "Produce the exact result.",
			now: NOW,
			actor: "human",
		});

		expect(requiresSandboxedComputationArtifact(state.researchPlanTasks[0]!)).toBe(true);
		expect(requiresSandboxedComputationArtifact(state.researchPlanTasks[1]!)).toBe(true);
	});

	it("accepts only an exact cited artifact owned by an accepted attempt", () => {
		let state = createEmptyProjectState({
			projectId: "computation-capability",
			title: "Computation capability",
			rootQuestion: "Reuse certified finite evidence.",
			now: NOW,
		});
		state = addResearchPlan(state, {
			id: "plan-1",
			title: "Plan",
			objective: "Reuse certified finite evidence.",
			now: NOW,
			actor: "human",
		});
		state = addResearchPlanTask(state, {
			id: "task-1",
			planId: "plan-1",
			kind: "computation",
			title: "Exact computation",
			description: "Produce one exact artifact.",
			now: NOW,
			actor: "human",
		});
		const created = createTaskAttempt(state, { taskId: "task-1", now: NOW, actor: "human" });
		state = attachAttemptArtifacts(created.state, {
			attemptId: created.attempt.id,
			computationArtifactIds: [ARTIFACT_ID],
			now: NOW,
		});

		expect(hasAcceptedCitedComputationArtifact(state, `[artifact ${ARTIFACT_ID}]`)).toBe(false);

		state = endAttempt(state, created.attempt.id, "accepted", NOW);
		expect(hasAcceptedCitedComputationArtifact(state, `[artifact ${ARTIFACT_ID}]`)).toBe(true);
		expect(hasAcceptedCitedComputationArtifact(state, "The earlier computation was accepted.")).toBe(false);
		expect(hasAcceptedCitedComputationArtifact(state, `[artifact ${ARTIFACT_ID.slice(0, -1)}0]`)).toBe(false);
	});
});
