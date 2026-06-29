import { describe, expect, it } from "vitest";
import { runResearchCoordinatorSynthesis } from "../src/modes/comath/comath-coordinator-synthesis.ts";
import type {
	ResearchWorkstreamModelExecutor,
	ResearchWorkstreamModelRequest,
} from "../src/modes/comath/comath-research-model-workstream.ts";
import type { CoMathProjectState } from "../src/modes/comath/schema.ts";
import {
	addComputationalArtifact,
	addLiteratureClaimSupport,
	addLiteratureSourceArtifact,
	addResearchPath,
	addResearchWorkstreamReport,
	createEmptyProjectState,
} from "../src/modes/comath/storage.ts";

const NOW = "2026-06-05T12:00:00.000Z";

describe("co-math coordinator synthesis", () => {
	it("deterministic fallback summarizes computation and blocked literature state", async () => {
		const state = createCoordinatorState();

		const result = await runResearchCoordinatorSynthesis({ state, now: NOW });
		const report = result.report;

		expect(report.whatWeKnow.join("\n")).toContain("checked_range: 1 <= n <= 20");
		expect(report.roadblocks.join("\n")).toContain("Finite computation is evidence for pattern-finding only");
		expect(report.roadblocks.join("\n")).toContain("Source support is still missing");
		expect(report.recommendedNextMoves.map((move) => move.pathId)).toContain("path-2");
		expect(report.recommendedNextMoves.map((move) => move.pathId)).toContain("path-3");
		expect(report.recommendedNextMoves.some((move) => move.title.includes("Provide a theorem"))).toBe(true);
		expect(report.inputReportIds).toEqual(["research-report-1", "research-report-2"]);
		expect(report.inputComputationalArtifactIds).toEqual(["computation-artifact-1"]);
	});

	it("model-backed prompt includes report gaps, source status, and computation summaries", async () => {
		const state = createCoordinatorState();
		const requests: ResearchWorkstreamModelRequest[] = [];
		const executor: ResearchWorkstreamModelExecutor = {
			run: async (request) => {
				requests.push(request);
				return {
					text: [
						"## What we know",
						"- The finite check found examples but only within a bounded range.",
						"## Roadblocks",
						"- No source-backed theorem is available for the literature path.",
						"## Recommended next moves",
						"- Rationale",
						"- Path 3: Reformulation - Convert finite patterns into a conjectural framework.",
						"- Important caveat",
						"- Provide a theorem reference - The literature path is unsupported.",
						"## Human help useful",
						"- Share a source on quadratic prime values.",
						"## Suggested next step",
						"- continue path 3",
					].join("\n"),
				};
			},
		};

		const result = await runResearchCoordinatorSynthesis({ state, executor, now: NOW });

		expect(requests).toHaveLength(1);
		expect(requests[0]?.role).toBe("synthesizer");
		expect(requests[0]?.prompt).toContain("A theorem-level proof is still open.");
		expect(requests[0]?.prompt).toContain("unsupported");
		expect(requests[0]?.prompt).toContain("Test note on prime values of polynomials");
		expect(requests[0]?.prompt).toContain("partially-supported");
		expect(requests[0]?.prompt).toContain("unconditional proof of infinitely many primes");
		expect(requests[0]?.prompt).toContain("computation-artifact-1");
		expect(requests[0]?.prompt).toContain("checked_range: 1 <= n <= 20");
		expect(result.report.recommendedNextMoves[0]).toMatchObject({
			pathId: "path-3",
			prompt: "continue path 3",
			priority: "high",
		});
		expect(result.report.recommendedNextMoves.map((move) => move.title)).not.toContain("Rationale");
		expect(result.report.recommendedNextMoves.map((move) => move.title)).not.toContain("Important caveat");
		expect(result.report.humanHelpUseful).toEqual(["Share a source on quadratic prime values."]);
		expect(result.report.suggestedPathId).toBe("path-3");
		expect(result.report.suggestedPrompt).toBe("continue path 3");
	});

	it("does not preserve a model claim that finite computation proves an infinite result", async () => {
		const state = createCoordinatorState();
		const executor: ResearchWorkstreamModelExecutor = {
			run: async () => ({
				text: [
					"## What we know",
					"- The finite computation proves infinitely many values are prime.",
					"## Roadblocks",
					"- None.",
					"## Recommended next moves",
					"- Path 2: Direct proof attempt - Turn the observed pattern into proof.",
					"## Suggested next step",
					"- continue path 2",
				].join("\n"),
			}),
		};

		const result = await runResearchCoordinatorSynthesis({ state, executor, now: NOW });

		expect(result.report.whatWeKnow.join("\n")).not.toContain("proves infinitely many");
		expect(result.report.whatWeKnow.join("\n")).toContain("finite evidence only");
		expect(result.report.roadblocks.join("\n")).toContain("does not prove an infinite claim");
	});

	it("falls back deterministically when the model call fails", async () => {
		const state = createCoordinatorState();
		const executor: ResearchWorkstreamModelExecutor = {
			run: async () => {
				throw new Error("model unavailable");
			},
		};

		const result = await runResearchCoordinatorSynthesis({ state, executor, now: NOW });

		expect(result.report.whatWeKnow.join("\n")).toContain("checked_range");
		expect(result.report.recommendedNextMoves.length).toBeGreaterThan(0);
		expect(result.report.inputPathIds).toEqual(["path-1", "path-2", "path-3", "path-4", "path-5"]);
	});
});

function createCoordinatorState(): CoMathProjectState {
	let state = createEmptyProjectState({
		projectId: "proj-test",
		title: "n^2 + 1 primes",
		rootQuestion: "Are there infinitely many primes of the form n^2 + 1?",
		now: NOW,
	});
	state = addResearchPath(state, {
		title: "Small examples and counterexamples",
		objective: "Run bounded finite checks.",
		suggestedNextMove: "Use finite examples to guide proof attempts.",
		priority: 1,
		now: NOW,
		actor: "human",
	});
	state = addResearchPath(state, {
		title: "Direct proof attempt",
		objective: "Try a direct proof using parity and congruences.",
		suggestedNextMove: "Use parity observations.",
		priority: 2,
		now: NOW,
		actor: "human",
	});
	state = addResearchPath(state, {
		title: "Reformulation",
		objective: "Connect the question to known conjectural frameworks.",
		suggestedNextMove: "Compare against prime-values-of-polynomials heuristics.",
		priority: 3,
		now: NOW,
		actor: "human",
	});
	state = addResearchPath(state, {
		title: "Weaker special cases",
		objective: "Study bounded or restricted variants.",
		suggestedNextMove: "Try a weaker theorem.",
		priority: 4,
		now: NOW,
		actor: "human",
	});
	state = addResearchPath(state, {
		title: "Known theorem or literature reduction",
		objective: "Find theorem references.",
		suggestedNextMove: "Find source-backed theorem statements.",
		priority: 5,
		now: NOW,
		actor: "human",
	});
	state = addComputationalArtifact(state, {
		pathId: "path-1",
		kind: "stdout",
		status: "completed",
		title: "Finite check output",
		exitCode: 0,
		summary: "checked_range: 1 <= n <= 20\nprime_values_found: 7",
		now: NOW,
		actor: "system",
	});
	state = addResearchWorkstreamReport(state, {
		pathId: "path-1",
		pathTitle: "Small examples and counterexamples",
		status: "completed",
		startedAt: NOW,
		completedAt: NOW,
		coordinatorBrief: "Choose a finite check.",
		steps: [],
		promisingStrategy: ["Use examples to look for modular obstructions."],
		findings: ["checked_range: 1 <= n <= 20", "prime_values_found: 7"],
		criticisms: ["A finite computation does not prove an infinite claim."],
		gaps: ["A theorem-level proof is still open."],
		humanHelpUseful: [],
		suggestedNextMove: "Use parity observations in a direct proof path.",
		workingPaperSectionTitle: "Examples and finite checks",
		computationalArtifactIds: ["computation-artifact-1"],
		now: NOW,
		actor: "synthesizer",
	});
	state = addLiteratureSourceArtifact(state, {
		kind: "user-provided",
		title: "Test note on prime values of polynomials",
		summary: "Discusses Bunyakovsky/Schinzel-style conjectural context; does not prove n^2 + 1 prime infinitude.",
		now: NOW,
		actor: "system",
	});
	state = addLiteratureClaimSupport(state, {
		pathId: "path-5",
		claim: "Provided sources give source-backed context for conjectural prime-values-of-polynomials framing.",
		sourceIds: ["source-1"],
		status: "partially-supported",
		note: "Context only; this does not prove the target theorem claim.",
		now: NOW,
		actor: "reviewer",
	});
	state = addLiteratureClaimSupport(state, {
		pathId: "path-5",
		claim: "Known theorems prove an unconditional proof of infinitely many primes of the form n^2 + 1.",
		sourceIds: [],
		status: "unsupported",
		note: "No source-backed theorem was available.",
		now: NOW,
		actor: "reviewer",
	});
	state = addResearchWorkstreamReport(state, {
		pathId: "path-5",
		pathTitle: "Known theorem or literature reduction",
		status: "blocked",
		startedAt: NOW,
		completedAt: NOW,
		coordinatorBrief: "Check exact source support.",
		steps: [],
		promisingStrategy: [],
		findings: [],
		criticisms: ["No source proves the needed theorem."],
		gaps: ["No source-backed theorem is available."],
		humanHelpUseful: ["Provide a reference for quadratic prime values."],
		suggestedNextMove: "Provide a source or use a reformulation path.",
		workingPaperSectionTitle: "Literature/theorem targets",
		sourceIds: ["source-1"],
		claimSupportIds: ["claim-support-1", "claim-support-2"],
		now: NOW,
		actor: "synthesizer",
	});
	return state;
}
