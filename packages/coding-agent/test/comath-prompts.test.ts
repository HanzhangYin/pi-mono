import { describe, expect, it } from "vitest";
import {
	isLikelyMathResearchQuestion,
	isLikelyMathValidationPrompt,
	isLikelyOperationalNonMathPrompt,
	isShowLatestCoordinatorReportPrompt,
	isShowLatestReportPrompt,
	isShowProgressPrompt,
	isShowReportForPathPrompt,
	isShowResearchStatePrompt,
	normalizeCoMathPrompt,
	parseNaturalResearchQuestion,
	parseUserProvidedLiteratureSourcePrompt,
	stripCoMathPolitePrefix,
} from "../src/modes/comath/comath-prompts.ts";

describe("co-math prompt routing helpers", () => {
	it("strips stacked polite prefixes and collapses whitespace", () => {
		expect(stripCoMathPolitePrefix("please show progress")).toBe("show progress");
		expect(stripCoMathPolitePrefix("could you please show progress")).toBe("show progress");
		expect(normalizeCoMathPrompt("  please   show    progress ")).toBe("show progress");
	});

	it("matches progress prompts and polite variants", () => {
		for (const prompt of [
			"show progress",
			"please show progress",
			"status",
			"what are you doing?",
			"show latest run",
		]) {
			expect(isShowProgressPrompt(prompt), prompt).toBe(true);
		}
		expect(isShowResearchStatePrompt("show progress")).toBe(false);
	});

	it("matches research-state prompts and polite variants", () => {
		for (const prompt of [
			"show research state",
			"summarize current state",
			"summarise current state",
			"please summarize current state",
		]) {
			expect(isShowResearchStatePrompt(prompt), prompt).toBe(true);
		}
		expect(isShowProgressPrompt("show research state")).toBe(false);
	});

	it("matches latest-report prompts and polite variants", () => {
		for (const prompt of ["show report", "show the report", "show latest report", "please show the latest report"]) {
			expect(isShowLatestReportPrompt(prompt), prompt).toBe(true);
		}
		// `show report for path 1` is a per-path command, not the latest-report command.
		expect(isShowLatestReportPrompt("show report for path 1")).toBe(false);
	});

	it("extracts the path number from per-path report prompts", () => {
		expect(isShowReportForPathPrompt("show details for path 1")).toEqual({ pathNumber: 1 });
		expect(isShowReportForPathPrompt("please show report for path 2")).toEqual({ pathNumber: 2 });
		expect(isShowReportForPathPrompt("show report for path 0")).toBeUndefined();
		expect(isShowReportForPathPrompt("show progress")).toBeUndefined();
	});

	it("matches coordinator report prompts distinctly from research reports", () => {
		for (const prompt of [
			"show latest coordinator report",
			"show coordinator summary",
			"please show the latest project coordinator report",
		]) {
			expect(isShowLatestCoordinatorReportPrompt(prompt), prompt).toBe(true);
		}
		expect(isShowLatestReportPrompt("show latest coordinator report")).toBe(false);
		expect(isShowLatestCoordinatorReportPrompt("show latest report")).toBe(false);
	});

	it("does not turn arbitrary prose into commands", () => {
		for (const prompt of [
			"run a quick sanity check",
			"report that this theorem is false",
			"progress on this proof may require density estimates",
		]) {
			expect(isShowProgressPrompt(prompt), prompt).toBe(false);
			expect(isShowResearchStatePrompt(prompt), prompt).toBe(false);
			expect(isShowLatestReportPrompt(prompt), prompt).toBe(false);
			expect(isShowReportForPathPrompt(prompt), prompt).toBeUndefined();
			expect(isShowLatestCoordinatorReportPrompt(prompt), prompt).toBe(false);
		}
	});
});

describe("natural math research question detection", () => {
	it("accepts bare math questions and returns the question", () => {
		for (const prompt of [
			"Are there infinitely many primes of the form n^2 + 1?",
			"Is every even integer greater than 2 a sum of two primes?",
			"Can every positive integer be written as a sum of four squares?",
			"How many primes are there of the form n^2 + 1?",
		]) {
			expect(isLikelyMathResearchQuestion(prompt), prompt).toBe(true);
			expect(parseNaturalResearchQuestion(prompt), prompt).toBe(prompt);
		}
	});

	it("accepts natural research/help phrasing and strips the preamble", () => {
		expect(
			parseNaturalResearchQuestion("Can you help me explore whether there are infinitely many twin primes?"),
		).toBe("there are infinitely many twin primes?");
		expect(parseNaturalResearchQuestion("Help me investigate whether every Collatz sequence reaches 1.")).toBe(
			"every Collatz sequence reaches 1.",
		);
	});

	it("rejects commands, exec/dev prompts, and non-math prose", () => {
		for (const prompt of [
			"run tests",
			"run a quick sanity check",
			"show me the files",
			"what branch am I on?",
			"report that this theorem is false",
			"progress on this proof may require density estimates",
			"show report",
			"show latest report",
			"show progress",
			"status",
			"what are you doing?",
			"show research state",
			"show latest coordinator report",
			"help",
		]) {
			expect(parseNaturalResearchQuestion(prompt), prompt).toBeUndefined();
			expect(isLikelyMathResearchQuestion(prompt), prompt).toBe(false);
		}
	});
});

describe("fresh-workspace validation vs operational gate", () => {
	it("recognizes operational/dev prompts", () => {
		for (const prompt of [
			"run tests",
			"run a quick sanity check",
			"git status",
			"npm test",
			"what branch am I on?",
			"show me the files",
			"list files",
			"open package.json",
			"build the project",
		]) {
			expect(isLikelyOperationalNonMathPrompt(prompt), prompt).toBe(true);
			expect(isLikelyMathValidationPrompt(prompt), prompt).toBe(false);
		}
	});

	it("recognizes math validation prompts", () => {
		for (const prompt of [
			"Validate the claim: every even integer greater than 2 is a sum of two primes.",
			"Validate Question 3.",
			"Check this proof: assume n is even, then n^2 + 1 is odd.",
			"Review this proof of the lemma: ...",
			"Prove or disprove: there are infinitely many primes of the form n^2 + 1.",
			"Is this proof valid? Suppose the sequence is bounded.",
			"Audit the following theorem and proof: ...",
		]) {
			expect(isLikelyMathValidationPrompt(prompt), prompt).toBe(true);
			expect(isLikelyOperationalNonMathPrompt(prompt), prompt).toBe(false);
		}
	});

	it("does not treat commands, help, or empty prose as validation prompts", () => {
		for (const prompt of ["show report", "show progress", "help", "the weather is nice today", "check the code"]) {
			expect(isLikelyMathValidationPrompt(prompt), prompt).toBe(false);
		}
	});
});

describe("user-provided literature source prompts", () => {
	it("parses pasted reference text", () => {
		expect(
			parseUserProvidedLiteratureSourcePrompt(
				"I found a reference: Schinzel's hypothesis H predicts prime values for suitable irreducible polynomials, but this is conjectural and not an unconditional theorem.",
			),
		).toEqual({
			text: "Schinzel's hypothesis H predicts prime values for suitable irreducible polynomials, but this is conjectural and not an unconditional theorem.",
		});
	});

	it("parses URL metadata", () => {
		expect(
			parseUserProvidedLiteratureSourcePrompt(
				"Register this reference: https://example.test/schinzel-h Note says Schinzel's hypothesis H is conjectural.",
			),
		).toEqual({
			url: "https://example.test/schinzel-h",
			text: "https://example.test/schinzel-h Note says Schinzel's hypothesis H is conjectural.",
		});
	});

	it("parses local path metadata without reading it", () => {
		expect(
			parseUserProvidedLiteratureSourcePrompt(
				"Use this source for path 5: ./notes/schinzel.md Schinzel H is conjectural context only.",
			),
		).toEqual({
			path: "./notes/schinzel.md",
			text: "./notes/schinzel.md Schinzel H is conjectural context only.",
		});
	});

	it("rejects operational and steering prompts", () => {
		for (const prompt of ["show report", "continue path 5", "run tests", "what branch am I on?"]) {
			expect(parseUserProvidedLiteratureSourcePrompt(prompt), prompt).toBeUndefined();
		}
	});
});
