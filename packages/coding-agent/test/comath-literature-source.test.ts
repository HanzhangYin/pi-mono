import { describe, expect, it } from "vitest";
import {
	buildLiteratureSearchQueries,
	extractLiteratureSearchHints,
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
	it("extracts a bounded publication title instead of searching an entire claim ledger", () => {
		const hints = extractLiteratureSearchHints([
			"SOURCE source-5\n12: <title>Presenting the cohomology of a Schubert variety</title>\n4: <title>arXiv Query: id_list=0809.2981</title>",
		]);
		expect(hints).toEqual(["Presenting the cohomology of a Schubert variety"]);
		const queries = buildLiteratureSearchQueries({
			rootQuestion: hints[0] ?? "",
			pathTitle: "Known theorem or literature reduction",
			pathObjective: "Find later work.",
			maxSources: 8,
		});
		expect(queries[0]).toBe("Presenting the cohomology of a Schubert variety");
	});

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

	it("rejects Landau-name collisions without number-theory alignment", () => {
		const sources: LiteratureSourceResult[] = [
			{
				title: "Temperature dependence of the upper critical field of high-Tc superconductors from isothermal magnetization data. Influence of a temperature dependent Ginzburg-Landau parameter",
				summary: "A condensed-matter study of critical fields and temperature-dependent magnetization.",
			},
			{
				title: "Landau Problem in Dynamical Noncommutative Space",
				summary: "A quantum-mechanical model with noncommutative coordinates and Landau levels.",
			},
			{
				title: "Landau's problems in number theory",
				summary: "A survey including prime values of quadratic polynomials and related open questions.",
			},
			{
				title: "Almost-prime values of binary forms",
				summary: "Sieve methods for integer polynomial values and prime variables.",
			},
		];

		expect(rankLiteratureSources(sources, PRIME_QUERY).map((source) => source.title)).toEqual([
			"Almost-prime values of binary forms",
			"Landau's problems in number theory",
		]);
	});

	it("preserves exact-form and nearby number-theory sources", () => {
		const sources: LiteratureSourceResult[] = [
			{
				title: "Prime values of n^2 + 1",
				summary: "The conjectured distribution of values of this quadratic polynomial.",
			},
			{
				title: "Counting primes between consecutive squares",
				summary: "An asymptotic question about integer intervals adjacent to quadratic values.",
			},
			{
				title: "Landau levels and quadratic Hamiltonians",
				summary: "Spectral analysis for a charged particle in a magnetic field.",
			},
		];

		expect(rankLiteratureSources(sources, PRIME_QUERY).map((source) => source.title)).toEqual([
			"Prime values of n^2 + 1",
			"Counting primes between consecutive squares",
		]);
	});

	it("does not impose number-theory alignment on other meanings of prime", () => {
		const query: LiteratureSourceQuery = {
			rootQuestion: "Are there infinitely many prime knots with distinct Alexander polynomials?",
			pathTitle: "Literature search",
			pathObjective: "Find constructions in knot theory.",
			maxSources: 8,
		};
		const sources: LiteratureSourceResult[] = [
			{
				title: "Alexander invariants of satellite knots",
				summary: "Constructions of infinite families in knot theory.",
			},
		];

		expect(rankLiteratureSources(sources, query).map((source) => source.title)).toEqual([
			"Alexander invariants of satellite knots",
		]);
	});

	it("retains number-theory alignment for prime-value queries without a formula", () => {
		const query: LiteratureSourceQuery = {
			rootQuestion: "Which irreducible polynomials take prime values infinitely often?",
			pathTitle: "Literature search",
			pathObjective: "Find rigorous results and open conjectures.",
			maxSources: 8,
		};
		const sources: LiteratureSourceResult[] = [
			{
				title: "Prime values of irreducible polynomials",
				summary: "Sieve methods and asymptotic results for integer polynomial values.",
			},
		];

		expect(rankLiteratureSources(sources, query).map((source) => source.title)).toEqual([
			"Prime values of irreducible polynomials",
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
