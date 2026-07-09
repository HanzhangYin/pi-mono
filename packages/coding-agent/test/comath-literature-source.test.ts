import { describe, expect, it } from "vitest";
import {
	type LiteratureSourceQuery,
	type LiteratureSourceResult,
	rankLiteratureSources,
} from "../src/modes/comath/comath-literature-source.ts";

const PRIME_QUERY: LiteratureSourceQuery = {
	rootQuestion: "Are there infinitely many primes of the form n^2 + 1?",
	pathTitle: "Known theorem or literature reduction",
	pathObjective: "Determine the accepted status and nearby rigorous results.",
	maxSources: 8,
};

describe("co-math literature source relevance", () => {
	it("rejects unrelated search hits before they reach the literature model", () => {
		const sources: LiteratureSourceResult[] = [
			{
				title: "Infinitely many prime knots with the same Alexander invariants",
				summary: "A knot theory paper about prime knots and Alexander invariants.",
			},
			{
				title: "Two-dimensional magnetic interactions in LaFeAsO",
				summary: "A condensed-matter study of magnetic interactions.",
			},
			{
				title: "Prime values of n^2 + 1",
				summary: "A survey of the polynomial n^2 + 1 and its conjectured prime values.",
			},
			{
				title: "Landau's problems",
				summary: "A historical survey of Landau's unsolved problems in number theory.",
			},
		];

		expect(rankLiteratureSources(sources, PRIME_QUERY).map((source) => source.title)).toEqual([
			"Prime values of n^2 + 1",
			"Landau's problems",
		]);
	});

	it("uses topic terms generically rather than hardcoding the prime example", () => {
		const query: LiteratureSourceQuery = {
			rootQuestion: "Is every compact Hausdorff space normal?",
			pathTitle: "Literature search",
			pathObjective: "Find exact separation theorem statements.",
			maxSources: 8,
		};
		const sources: LiteratureSourceResult[] = [
			{
				title: "Separation properties of compact Hausdorff spaces",
				summary: "Normality and related separation axioms for compact Hausdorff spaces.",
			},
			{
				title: "Compact operators on Hilbert space",
				summary: "Spectral properties of compact linear operators.",
			},
		];

		expect(rankLiteratureSources(sources, query).map((source) => source.title)).toEqual([
			"Separation properties of compact Hausdorff spaces",
		]);
	});
});
