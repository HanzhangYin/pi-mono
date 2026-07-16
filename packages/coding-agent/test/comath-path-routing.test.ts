import { describe, expect, it } from "vitest";
import {
	concreteCoordinatorDirectiveForAutonomousExecution,
	findResearchPath,
	researchPathForDirective,
	researchTaskKindForPath,
} from "../src/modes/comath/comath-harness.ts";

const PATHS = [
	{
		id: "path-1",
		title: "Small examples and counterexamples",
		objective: "Compute finite cases and enumerate obstructions.",
		status: "active" as const,
		latestFindings: [],
		blockers: [],
		suggestedNextMove: "Compute examples.",
		priority: 1,
		createdAt: "2026-07-13T00:00:00.000Z",
		updatedAt: "2026-07-13T00:00:00.000Z",
	},
	{
		id: "path-2",
		title: "Direct proof attempt",
		objective: "Look for a direct proof strategy.",
		status: "active" as const,
		latestFindings: [],
		blockers: [],
		suggestedNextMove: "Prove a lemma.",
		priority: 2,
		createdAt: "2026-07-13T00:00:00.000Z",
		updatedAt: "2026-07-13T00:00:00.000Z",
	},
	{
		id: "path-3",
		title: "Reformulation",
		objective: "Find equivalent statements.",
		status: "active" as const,
		latestFindings: [],
		blockers: [],
		suggestedNextMove: "Reformulate.",
		priority: 3,
		createdAt: "2026-07-13T00:00:00.000Z",
		updatedAt: "2026-07-13T00:00:00.000Z",
	},
];

describe("co-math user-directed path routing", () => {
	it("routes broad path capabilities without mathematical subject heuristics", () => {
		expect(
			researchTaskKindForPath({
				title: "Known theorem or literature reduction",
				objective: "Identify whether later work settles the question.",
			}),
		).toBe("literature-search");
		expect(
			researchTaskKindForPath({
				title: "Small examples and counterexamples",
				objective: "Test finite cases and enumerate obstructions.",
			}),
		).toBe("computation");
		expect(
			researchTaskKindForPath({
				title: "Structural reduction",
				objective: "Prove a general reduction lemma.",
			}),
		).toBe("proof-attempt");
	});

	it("routes an explicit proof directive before incidental reduction language", () => {
		expect(
			researchPathForDirective(
				PATHS,
				"Prove the conditional indecomposables reduction rigorously, including all coefficient-ring hypotheses.",
			)?.id,
		).toBe("path-2");
		expect(researchPathForDirective(PATHS, "Compute small cases and search for a counterexample.")?.id).toBe(
			"path-1",
		);
		expect(researchPathForDirective(PATHS, "Find an equivalent reformulation of the claim.")?.id).toBe("path-3");
	});

	it("does not classify proof context or negative search constraints as literature work", () => {
		expect(
			researchTaskKindForPath(
				PATHS[1]!,
				"Produce a standalone proof certificate using the persisted DOI passages; do not start a provider search when they suffice.",
			),
		).toBe("proof-attempt");
		expect(
			researchTaskKindForPath(
				PATHS[1]!,
				"Search arXiv for the cited theorem and extract its exact full-text statement.",
			),
		).toBe("literature-search");
		expect(
			researchTaskKindForPath(
				PATHS[1]!,
				"Retrieving one uncorrupted full-text excerpt from an alternate literature provider.",
			),
		).toBe("literature-search");
	});

	it("does not require a sandbox for a symbolic change-of-basis derivation", () => {
		expect(
			researchTaskKindForPath(
				PATHS[0]!,
				"Derive the cyclic quotient and compute the resulting degreewise change of basis from the accepted relations.",
			),
		).toBe("proof-attempt");
		expect(
			researchTaskKindForPath(
				PATHS[0]!,
				"Enumerate the bounded partition columns and compute the exact Smith matrix invariants.",
			),
		).toBe("computation");
	});

	it("classifies a hand-derived determinant and matrix identity as a proof", () => {
		expect(
			researchTaskKindForPath(
				PATHS[0]!,
				"Prove the standalone determinant identity by giving the explicit ordered bordered matrix, complete Laplace index sets, complementary minors, and all sign calculations.",
			),
		).toBe("proof-attempt");
		expect(
			researchTaskKindForPath(
				PATHS[0]!,
				"Compute the determinant matrices for all finite cases and preserve exact values.",
			),
		).toBe("computation");
	});

	it("honors an explicit path number before trailing steering text", () => {
		expect(findResearchPath({ researchPaths: PATHS }, "path 2 and audit the accepted claim")?.id).toBe("path-2");
	});

	it("replaces generic coordinator wrappers with a concrete per-path move", () => {
		const genericMove = {
			title: "Continue Path 1: Small examples and counterexamples",
			pathId: "path-1",
			rationale: "No completed report exists. More bounded computation may help.",
			prompt: "continue path 1",
			priority: "high" as const,
		};
		expect(concreteCoordinatorDirectiveForAutonomousExecution(genericMove, PATHS[0]!)).toBe("Compute examples.");
		expect(
			concreteCoordinatorDirectiveForAutonomousExecution(genericMove, {
				suggestedNextMove: "Continue this path.",
			}),
		).toBeUndefined();
	});
});
