import { describe, expect, it } from "vitest";
import {
	buildCoordinatorContext,
	runResearchCoordinatorSynthesis,
} from "../src/modes/comath/comath-coordinator-synthesis.ts";
import { researchTaskKindForPath } from "../src/modes/comath/comath-harness.ts";
import { deriveLiteratureSearchNeed } from "../src/modes/comath/comath-literature-policy.ts";
import { deriveResearchAgenda } from "../src/modes/comath/comath-research-agenda.ts";
import type {
	CoMathProjectState,
	ResearchPlanTaskRecord,
	ResearchWorkstreamReportRecord,
} from "../src/modes/comath/schema.ts";
import { createEmptyProjectState } from "../src/modes/comath/storage.ts";

const NOW = "2026-07-15T00:00:00.000Z";

function createState(): CoMathProjectState {
	const state = createEmptyProjectState({
		projectId: "literature-policy",
		title: "Current conjecture",
		rootQuestion: "Does the current conjecture hold?",
		now: NOW,
	});
	return {
		...state,
		researchPaths: [
			{
				id: "path-1",
				title: "Direct verification",
				objective: "Verify the current finite certificate.",
				status: "active",
				latestFindings: [],
				blockers: [],
				suggestedNextMove: "Complete the independent exact verification.",
				priority: 1,
				createdAt: NOW,
				updatedAt: NOW,
			},
		],
		researchFocus: {
			pathIds: ["path-1"],
			reason: "Complete the independent exact verification of the current finite certificate.",
			updatedAt: NOW,
		},
	};
}

function task(id: string, status: ResearchPlanTaskRecord["status"]): ResearchPlanTaskRecord {
	return {
		id,
		planId: "plan-1",
		kind: "computation",
		status,
		sequence: Number(id.slice(-1)),
		title: "Independent certificate verification",
		description: "Verify the current certificate with changed exact code.",
		goal: "Repair an evidence defect without changing the mathematical question.",
		acceptanceCriteria: ["The independent certificate is complete."],
		dependsOnTaskIds: [],
		requiredCapabilities: ["sandboxed-computation", "independent-review"],
		attemptIds: [],
		pathId: "path-1",
		sourceIds: [],
		claimSupportIds: [],
		computationalArtifactIds: [],
		evidenceEntryIds: [],
		reviewOutcome: "needs-revision",
		blockedReason: "Independent skeptic verdict: needs-revision.",
		createdAt: NOW,
		updatedAt: NOW,
	};
}

function obstructionReport(id: string): ResearchWorkstreamReportRecord {
	return {
		id,
		kind: "research_workstream",
		pathId: "path-1",
		pathTitle: "Direct verification",
		status: "blocked",
		acceptanceStatus: "accepted",
		startedAt: NOW,
		completedAt: NOW,
		coordinatorBrief: "Attempt a direct proof.",
		steps: [],
		promisingStrategy: [],
		findings: [],
		criticisms: [],
		gaps: ["The integral saturation of the relation lattice is not controlled."],
		humanHelpUseful: [],
		suggestedNextMove: "Find another route around integral saturation.",
		workingPaperSectionTitle: "Direct attempt",
		sourceIds: [],
		claimSupportIds: [],
		computationalArtifactIds: [],
		createdAt: NOW,
		updatedAt: NOW,
	};
}

describe("co-math literature search policy", () => {
	it("does not initialize search for indexed sources or repeated review failures", async () => {
		const state = createState();
		state.researchPlanTasks = [task("task-1", "blocked"), task("task-2", "blocked")];
		state.literatureSources = [
			{
				id: "source-1",
				kind: "local-file",
				title: "Indexed source paper",
				provider: "workspace",
				authors: [],
				summary: "The local source contains citations.",
				extractedText: "A classical theorem is cited in the source.",
				createdAt: NOW,
				updatedAt: NOW,
			},
		];
		state.researchCoordinatorReports = [
			{
				id: "coordinator-1",
				createdAt: NOW,
				updatedAt: NOW,
				inputReportIds: [],
				inputPathIds: ["path-1"],
				inputSourceIds: ["source-1"],
				inputComputationalArtifactIds: [],
				whatWeKnow: [],
				roadblocks: ["The failed literature search should not be repeated without a changed prerequisite."],
				recommendedNextMoves: [],
				humanHelpUseful: [],
				suggestedPathId: "path-1",
			},
		];

		expect(deriveLiteratureSearchNeed(state)).toBeUndefined();
		expect(deriveResearchAgenda(state).some((item) => item.kind === "literature-search")).toBe(false);
		const { report } = await runResearchCoordinatorSynthesis({ state, now: NOW });
		expect(report.recommendedNextMoves.some((move) => /literature/i.test(move.prompt ?? ""))).toBe(false);
	});

	it("starts a targeted search for an unresolved theorem dependency", async () => {
		const state = createState();
		state.researchPlanTasks = [
			{
				...task("task-1", "pending"),
				kind: "literature-search",
				title: "Search an unrelated historical bibliography",
				description: "Find references for a different abandoned route.",
			},
		];
		state.theoremApplicabilityChecks = [
			{
				id: "check-1",
				theorem: "Integral form of the structure theorem",
				targetObject: "the quotient module in the current proof",
				hypotheses: [{ hypothesis: "The relation lattice is saturated", status: "unknown" }],
				status: "needs-verification",
				pathId: "path-1",
				sourceIds: [],
				createdAt: NOW,
				updatedAt: NOW,
			},
		];

		const need = deriveLiteratureSearchNeed(state);
		expect(need?.trigger).toBe("ungrounded-theorem");
		expect(deriveResearchAgenda(state)[0]?.kind).toBe("literature-search");
		const { report } = await runResearchCoordinatorSynthesis({ state, now: NOW });
		expect(report.recommendedNextMoves[0]?.prompt).toContain("external mathematical literature and arXiv");
		expect(researchTaskKindForPath(state.researchPaths[0]!, report.suggestedPrompt)).toBe("literature-search");

		state.researchPlanTasks = [
			{
				...task("task-2", "pending"),
				kind: "literature-search",
				title: need!.title,
				description: need!.description,
			},
		];
		expect(deriveLiteratureSearchNeed(state)).toBeUndefined();
	});

	it("does not search again when matching citable extracted theorem text is already durable", () => {
		const state = createState();
		state.researchCoordinatorReports = [
			{
				id: "coordinator-1",
				createdAt: NOW,
				updatedAt: NOW,
				inputReportIds: [],
				inputPathIds: ["path-1"],
				inputSourceIds: [],
				inputComputationalArtifactIds: [],
				whatWeKnow: [],
				roadblocks: ["The 2024 minimality theorem passage remains ungrounded."],
				recommendedNextMoves: [],
				humanHelpUseful: [],
				suggestedPathId: "path-1",
			},
		];
		state.literatureSources = [
			{
				id: "source-2024",
				kind: "paper",
				title: "Minimal generating sets for Schubert ideals",
				provider: "arxiv",
				authors: [],
				year: "2024",
				summary: "Proves the integral minimality theorem with exact hypotheses.",
				extractedText: "FULL-TEXT SOURCE\nTheorem 1.2 proves minimality over the integral coefficient ring.",
				citationEligibility: "citable",
				createdAt: NOW,
				updatedAt: NOW,
			},
		];

		expect(deriveLiteratureSearchNeed(state)).toBeUndefined();
		state.literatureSources[0]!.extractedText = undefined;
		expect(deriveLiteratureSearchNeed(state)?.trigger).toBe("ungrounded-theorem");
	});

	it("keeps citable extracted sources in coordinator context ahead of recent metadata", () => {
		const state = createState();
		state.literatureSources = [
			{
				id: "source-full-text",
				kind: "paper",
				title: "The exact minimality theorem",
				provider: "arxiv",
				authors: [],
				summary: "Exact theorem source.",
				extractedText: "FULL-TEXT SOURCE\n1: Theorem with exact hypotheses.",
				citationEligibility: "citable",
				createdAt: NOW,
				updatedAt: NOW,
			},
			...Array.from({ length: 12 }, (_, index) => ({
				id: `source-metadata-${index}`,
				kind: "paper" as const,
				title: `Recent unrelated metadata ${index}`,
				provider: "crossref" as const,
				authors: [],
				summary: "Metadata only.",
				citationEligibility: "inventory-only" as const,
				createdAt: NOW,
				updatedAt: NOW,
			})),
		];

		const context = buildCoordinatorContext(state);
		expect(context).toContain("source-full-text: The exact minimality theorem");
		expect(context).toContain("Extracted full text: citable");
	});

	it("searches only after repeated accepted mathematical obstruction, not failed attempts", () => {
		const state = createState();
		state.researchReports = [obstructionReport("report-1"), obstructionReport("report-2")];

		expect(deriveLiteratureSearchNeed(state)?.trigger).toBe("repeated-mathematical-obstruction");
	});

	it("does not repeat a successfully completed matching search", () => {
		const state = createState();
		state.theoremApplicabilityChecks = [
			{
				id: "check-1",
				theorem: "Integral form of the structure theorem",
				targetObject: "the quotient module in the current proof",
				hypotheses: [],
				status: "needs-verification",
				pathId: "path-1",
				sourceIds: [],
				createdAt: NOW,
				updatedAt: NOW,
			},
		];
		const query = deriveLiteratureSearchNeed(state)?.query;
		expect(query).toBeDefined();
		state.literatureSearches = [
			{
				id: "search-1",
				pathId: "path-1",
				queries: [query!],
				providers: [
					{
						provider: "arxiv",
						query: query!,
						status: "completed",
						candidateCount: 0,
					},
				],
				candidateCount: 0,
				selectedSourceIds: [],
				startedAt: NOW,
				completedAt: NOW,
				createdAt: NOW,
				updatedAt: NOW,
			},
		];

		expect(deriveLiteratureSearchNeed(state)).toBeUndefined();
	});

	it("does not turn a persisted-source audit failure or generated search wrapper into another search", () => {
		const state = createState();
		state.researchCoordinatorReports = [
			{
				id: "coordinator-1",
				createdAt: NOW,
				updatedAt: NOW,
				inputReportIds: [],
				inputPathIds: ["path-1"],
				inputSourceIds: ["source-30"],
				inputComputationalArtifactIds: [],
				whatWeKnow: [],
				roadblocks: [
					"The latest source-30 extraction was not established: it omitted exact occurrences and a complete keyword audit.",
				],
				recommendedNextMoves: [
					{
						title: "Inspect relevant prior work: repair the source-30 extraction",
						pathId: "path-1",
						rationale: "A local completeness certificate is missing.",
						prompt:
							"Search the external mathematical literature and arXiv for the failed source-30 keyword audit.",
						priority: "high",
					},
				],
				humanHelpUseful: [],
				suggestedPathId: "path-1",
			},
		];

		expect(deriveLiteratureSearchNeed(state)).toBeUndefined();
		expect(deriveResearchAgenda(state).some((item) => item.kind === "literature-search")).toBe(false);
	});

	it("still escalates a corrupted persisted source when an alternate provider is requested", () => {
		const state = createState();
		state.researchPaths[0]!.blockers = [
			"The persisted source-29 extraction is corrupted; search arXiv for an alternate provider copy.",
		];

		expect(deriveLiteratureSearchNeed(state)?.trigger).toBe("referenced-prior-work");
	});

	it("does not schedule theorem-level full-text retrieval without a matching extracted source", async () => {
		const state = createState();
		const { report } = await runResearchCoordinatorSynthesis({
			state,
			now: NOW,
			executor: {
				run: async () => ({
					text: [
						"## What we know",
						"- A metadata search found a later paper.",
						"## Roadblocks",
						"- Exact theorem text is unavailable.",
						"## Recommended next moves",
						"- Retrieve theorem-level full text from the later paper.",
						"- Prove the remaining integral saturation lemma directly.",
						"## Suggested next step",
						"- Retrieve theorem-level full text from the later paper.",
					].join("\n"),
				}),
			},
		});

		expect(report.recommendedNextMoves.some((move) => /theorem-level full text/i.test(move.title))).toBe(false);
		expect(report.recommendedNextMoves.some((move) => /saturation lemma/i.test(move.title))).toBe(true);
		expect(report.suggestedPrompt ?? "").not.toMatch(/theorem-level full text/i);
	});

	it("rejects ingest-and-extract wording for unavailable full text", async () => {
		const state = createState();
		const { report } = await runResearchCoordinatorSynthesis({
			state,
			now: NOW,
			executor: {
				run: async () => ({
					text: [
						"## What we know",
						"- Only a metadata record is available.",
						"## Roadblocks",
						"- Exact theorem text is unavailable.",
						"## Recommended next moves",
						"- Ingest a verifiable full-text copy, then extract indexed passages for its theorem hypotheses.",
						"- Prove the remaining saturation lemma directly.",
						"## Suggested next step",
						"- Ingest a verifiable full-text copy, then extract indexed passages for its theorem hypotheses.",
					].join("\n"),
				}),
			},
		});

		expect(report.recommendedNextMoves.some((move) => /full-text copy/i.test(move.title))).toBe(false);
		expect(report.recommendedNextMoves.some((move) => /saturation lemma/i.test(move.title))).toBe(true);
		expect(report.suggestedPrompt ?? "").not.toMatch(/full-text copy/i);
	});
});
