import { describe, expect, it } from "vitest";
import { deriveLiteratureSearchNeed } from "../src/modes/comath/comath-literature-policy.ts";
import { createEmptyProjectState } from "../src/modes/comath/storage.ts";

describe("co-math resolved literature status", () => {
	it("does not turn an inspected negative result into a fresh literature search", () => {
		const rootQuestion =
			"The project proof is internal context; the inspected literature does not state a formal theorem for the second clause.";
		const state = createEmptyProjectState({
			projectId: "resolved-literature-status",
			title: "Resolved literature status",
			rootQuestion,
			now: "2026-07-16T00:00:00.000Z",
		});
		state.researchPaths = [
			{
				id: "path-1",
				title: "Current proof path",
				objective: "Continue the proof.",
				status: "active",
				latestFindings: [],
				blockers: [],
				suggestedNextMove: rootQuestion,
				priority: 1,
				createdAt: "2026-07-16T00:00:00.000Z",
				updatedAt: "2026-07-16T00:00:00.000Z",
			},
		];
		state.researchFocus = {
			pathIds: ["path-1"],
			reason: "Continue the current proof path.",
			updatedAt: "2026-07-16T00:00:00.000Z",
		};

		expect(deriveLiteratureSearchNeed(state)).toBeUndefined();
	});

	it("does not interpret artifact citations inside a critic repair contract as prior work", () => {
		const state = createEmptyProjectState({
			projectId: "critic-repair-is-not-literature",
			title: "Computation repair",
			rootQuestion: "Compute exact integral matrices.",
			now: "2026-07-16T00:00:00.000Z",
		});
		const repair = [
			"CRITIC-DRIVEN REPAIR",
			"SOURCE ATTEMPT: attempt-1",
			"REPAIR FINDING: finding-1",
			"TASK KIND: computation",
			"Provide a task-owned artifact or cite an exact artifact from an accepted attempt.",
		].join("\n");
		state.researchPaths = [
			{
				id: "path-1",
				title: "Exact computation",
				objective: "Compute exact matrices.",
				status: "active",
				latestFindings: [],
				blockers: [],
				suggestedNextMove: repair,
				priority: 1,
				createdAt: "2026-07-16T00:00:00.000Z",
				updatedAt: "2026-07-16T00:00:00.000Z",
			},
		];
		state.researchFocus = {
			pathIds: ["path-1"],
			reason: repair,
			updatedAt: "2026-07-16T00:00:00.000Z",
		};

		expect(deriveLiteratureSearchNeed(state)).toBeUndefined();
	});

	it("does not interpret coordinator prose about citing computation artifacts as prior work", () => {
		const state = createEmptyProjectState({
			projectId: "artifact-citation-is-not-literature",
			title: "Computation certificate",
			rootQuestion: "Compute exact integral matrices.",
			now: "2026-07-16T00:00:00.000Z",
		});
		const repair =
			"The latest non-accepted task requires a bounded certificate repair. Provide a task-owned sandbox computation artifact or cite an exact artifact from an accepted attempt, with captured outputs and a stable digest.";
		state.researchPaths = [
			{
				id: "path-1",
				title: "Exact computation",
				objective: "Compute exact matrices.",
				status: "active",
				latestFindings: [],
				blockers: [],
				suggestedNextMove: repair,
				priority: 1,
				createdAt: "2026-07-16T00:00:00.000Z",
				updatedAt: "2026-07-16T00:00:00.000Z",
			},
		];
		state.researchFocus = {
			pathIds: ["path-1"],
			reason: repair,
			updatedAt: "2026-07-16T00:00:00.000Z",
		};

		expect(deriveLiteratureSearchNeed(state)).toBeUndefined();
	});

	it("does not recursively search an inspect-relevant-prior-work wrapper", () => {
		const state = createEmptyProjectState({
			projectId: "generated-literature-wrapper",
			title: "Generated literature wrapper",
			rootQuestion: "Compute exact integral matrices.",
			now: "2026-07-16T00:00:00.000Z",
		});
		const generated =
			"Inspect relevant prior work: the latest non-accepted computation needs a bounded certificate repair.";
		state.researchPaths = [
			{
				id: "path-1",
				title: "Exact computation",
				objective: "Compute exact matrices.",
				status: "active",
				latestFindings: [],
				blockers: [],
				suggestedNextMove: generated,
				priority: 1,
				createdAt: "2026-07-16T00:00:00.000Z",
				updatedAt: "2026-07-16T00:00:00.000Z",
			},
		];
		state.researchFocus = {
			pathIds: ["path-1"],
			reason: generated,
			updatedAt: "2026-07-16T00:00:00.000Z",
		};

		expect(deriveLiteratureSearchNeed(state)).toBeUndefined();
	});

	it("does not reschedule a blocked non-retryable literature route", () => {
		const state = createEmptyProjectState({
			projectId: "blocked-literature-route",
			title: "Blocked literature route",
			rootQuestion: "Continue the mathematical proof.",
			now: "2026-07-16T00:00:00.000Z",
		});
		const blocked =
			"The targeted literature search was not executed and is blocked and non-retryable without a changed prerequisite.";
		state.researchPaths = [
			{
				id: "path-1",
				title: "Current proof path",
				objective: "Continue the proof.",
				status: "active",
				latestFindings: [],
				blockers: [blocked],
				suggestedNextMove: "Prove the next internal lemma.",
				priority: 1,
				createdAt: "2026-07-16T00:00:00.000Z",
				updatedAt: "2026-07-16T00:00:00.000Z",
			},
		];
		state.researchFocus = {
			pathIds: ["path-1"],
			reason: "Continue the current proof path.",
			updatedAt: "2026-07-16T00:00:00.000Z",
		};

		expect(deriveLiteratureSearchNeed(state)).toBeUndefined();
	});
});
