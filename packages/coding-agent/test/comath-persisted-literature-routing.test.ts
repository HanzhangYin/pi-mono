import { describe, expect, it } from "vitest";
import {
	buildPersistedLiteratureSearchForTask,
	requiresExternalLiteratureLookup,
} from "../src/modes/comath/comath-task-engine.ts";
import { addResearchPlan, addResearchPlanTask, createEmptyProjectState } from "../src/modes/comath/storage.ts";

const NOW = "2026-07-15T00:00:00.000Z";

describe("Co-Math persisted literature routing", () => {
	it("routes only exact referenced citable full-text records without starting a provider search", () => {
		let state = createEmptyProjectState({
			projectId: "persisted-literature",
			title: "Persisted literature",
			rootQuestion: "Compare two source statements.",
			now: NOW,
		});
		state = addResearchPlan(state, {
			id: "plan-1",
			title: "Plan",
			objective: "Compare two source statements.",
			now: NOW,
			actor: "human",
		});
		state = {
			...state,
			literatureSources: [
				{
					id: "source-2",
					kind: "paper",
					title: "Citable full text",
					doi: "10.1000/citable",
					provider: "crossref",
					authors: ["A. Author"],
					summary: "Exact theorem text.",
					extractedText: "Theorem 1. Exact statement.\nProof.",
					citationEligibility: "citable",
					sourceFileSha256: "a".repeat(64),
					createdAt: NOW,
					updatedAt: NOW,
				},
				{
					id: "source-20",
					kind: "paper",
					title: "Unreferenced full text",
					authors: [],
					summary: "Must not be selected by a source-2 substring match.",
					extractedText: "Unrelated text.",
					citationEligibility: "citable",
					sourceFileSha256: "b".repeat(64),
					createdAt: NOW,
					updatedAt: NOW,
				},
				{
					id: "source-3",
					kind: "paper",
					title: "Metadata only",
					authors: [],
					summary: "No extracted text.",
					citationEligibility: "inventory-only",
					createdAt: NOW,
					updatedAt: NOW,
				},
			],
		};
		state = addResearchPlanTask(state, {
			id: "task-1",
			planId: "plan-1",
			kind: "source-refresh",
			title: "Compare persisted statements",
			description: "Extract the exact theorem from source-2 and compare it with source-3.",
			dependsOnTaskIds: [],
			now: NOW,
			actor: "human",
		});

		const routed = buildPersistedLiteratureSearchForTask(state, state.researchPlanTasks[0]!);
		expect(routed?.sources.map((source) => source.id)).toEqual(["source-2"]);
		expect(routed?.sources[0]).toMatchObject({
			doi: "10.1000/citable",
			extractedText: "Theorem 1. Exact statement.\nProof.",
			sourceFileSha256: "a".repeat(64),
		});
		expect(routed?.providers).toEqual([
			{
				provider: "workspace",
				query: "persisted:source-2",
				status: "completed",
				candidateCount: 1,
			},
		]);
		state.researchPlanTasks[0]!.kind = "literature-search";
		expect(requiresExternalLiteratureLookup(state.researchPlanTasks[0]!, routed)).toBe(false);
		expect(requiresExternalLiteratureLookup(state.researchPlanTasks[0]!, undefined)).toBe(true);

		state.researchPlanTasks[0]!.description =
			"Apply the exact theorem text to the current proof without searching for another source.";
		const semanticRoute = buildPersistedLiteratureSearchForTask(state, state.researchPlanTasks[0]!);
		expect(semanticRoute?.sources.map((source) => source.id)).toEqual(["source-2"]);
		expect(requiresExternalLiteratureLookup(state.researchPlanTasks[0]!, semanticRoute)).toBe(false);

		state.researchPlanTasks[0]!.description =
			"Retrieve an uncorrupted replacement for source-2 because its displayed equations are garbled.";
		const defectiveRoute = buildPersistedLiteratureSearchForTask(state, state.researchPlanTasks[0]!);
		expect(defectiveRoute?.sources.map((source) => source.id)).toEqual(["source-2"]);
		expect(requiresExternalLiteratureLookup(state.researchPlanTasks[0]!, defectiveRoute)).toBe(true);

		state.researchPlanTasks[0]!.kind = "source-refresh";
		state.researchPlanTasks[0]!.description =
			"Retrieve an uncorrupted source-2 excerpt from a different provider because equations are missing.";
		expect(requiresExternalLiteratureLookup(state.researchPlanTasks[0]!, defectiveRoute)).toBe(true);
		state.researchPlanTasks[0]!.description = "Inspect the exact persisted lines from source-2.";
		expect(requiresExternalLiteratureLookup(state.researchPlanTasks[0]!, defectiveRoute)).toBe(false);
	});
});
