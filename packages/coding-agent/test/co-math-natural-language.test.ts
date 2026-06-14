import { describe, expect, it } from "vitest";
import { parseCoMathNaturalRequest } from "../examples/extensions/co-math/natural-language.ts";

describe("parseCoMathNaturalRequest", () => {
	it("parses exploration intents separately from validation", () => {
		expect(
			parseCoMathNaturalRequest("Explore this problem: Are there infinitely many primes of the form n^2 + 1?"),
		).toEqual({
			kind: "explore-problem",
			problemText: "Are there infinitely many primes of the form n^2 + 1?",
		});
		expect(parseCoMathNaturalRequest("Research this problem: classify small examples of X.")).toEqual({
			kind: "explore-problem",
			problemText: "classify small examples of X.",
		});
		expect(parseCoMathNaturalRequest("Find approaches to this conjecture: every foo has bar.")).toEqual({
			kind: "explore-problem",
			problemText: "every foo has bar.",
		});
		expect(parseCoMathNaturalRequest("Investigate this conjecture: every foo has bar.")).toEqual({
			kind: "explore-problem",
			problemText: "every foo has bar.",
		});
		expect(parseCoMathNaturalRequest("Explore this problem:")).toEqual({
			kind: "unknown",
			reason: "unrecognized request",
			suggestions: expect.any(Array),
		});
		expect(parseCoMathNaturalRequest("Validate this proof: every foo has bar.")).toEqual({
			kind: "unknown",
			reason: "unrecognized request",
			suggestions: expect.any(Array),
		});
	});

	it("parses common safe co-math intents conservatively", () => {
		expect(parseCoMathNaturalRequest("start a project for 2605.06651")).toEqual({
			kind: "init",
			question: "2605.06651",
		});
		expect(parseCoMathNaturalRequest("start a co-math project for 2605.06651v2 Question 3")).toEqual({
			kind: "init",
			question: "2605.06651v2 Question 3",
		});
		expect(parseCoMathNaturalRequest("start a project for 2605.06651v2 Question 3 validation.")).toEqual({
			kind: "init",
			question: "2605.06651v2 Question 3 validation",
		});
		expect(parseCoMathNaturalRequest("start project for Q3 validation")).toEqual({
			kind: "init",
			question: "Q3 validation",
		});
		expect(parseCoMathNaturalRequest("initialize project for Question 3")).toEqual({
			kind: "init",
			question: "Question 3",
		});
		expect(parseCoMathNaturalRequest("set goal verify Question 3")).toEqual({
			kind: "goal",
			text: "verify Question 3",
		});
		expect(parseCoMathNaturalRequest("set the goal to validate Question 3")).toEqual({
			kind: "goal",
			text: "validate Question 3",
		});
		expect(parseCoMathNaturalRequest("create a workstream to audit Question 3 source definitions")).toEqual({
			kind: "workstream",
			slug: "audit-question-3-source-definitions",
			goal: "audit Question 3 source definitions",
		});
		expect(parseCoMathNaturalRequest("create a workstream for auditing the support gap")).toEqual({
			kind: "workstream",
			slug: "auditing-the-support-gap",
			goal: "auditing the support gap",
		});
		expect(parseCoMathNaturalRequest("create a workstream that audits the support gap")).toEqual({
			kind: "workstream",
			slug: "audits-the-support-gap",
			goal: "audits the support gap",
		});
		expect(parseCoMathNaturalRequest("run latest workstream")).toEqual({
			kind: "run-workstream",
			workstreamRef: "latest",
		});
		expect(parseCoMathNaturalRequest("run the latest workstream")).toEqual({
			kind: "run-workstream",
			workstreamRef: "latest",
		});
		expect(parseCoMathNaturalRequest("show latest report")).toEqual({
			kind: "show-report",
			reportRef: "latest",
		});
		expect(parseCoMathNaturalRequest("show me the latest report")).toEqual({
			kind: "show-report",
			reportRef: "latest",
		});
		expect(parseCoMathNaturalRequest("show report report-7")).toEqual({
			kind: "show-report",
			reportRef: "report-7",
		});
		expect(parseCoMathNaturalRequest("show me the latest run")).toEqual({
			kind: "show-run",
			runRef: "latest",
		});
		expect(parseCoMathNaturalRequest("accept report report-7: useful but keep the support gap open")).toEqual({
			kind: "review-report",
			reportRef: "report-7",
			decision: "accepted",
			note: "useful but keep the support gap open",
		});
		expect(parseCoMathNaturalRequest("request revision for latest report: source gap remains")).toEqual({
			kind: "review-report",
			reportRef: "latest",
			decision: "revision-requested",
			note: "source gap remains",
		});
		expect(parseCoMathNaturalRequest("request revision for the latest report: keep the support gap open")).toEqual({
			kind: "review-report",
			reportRef: "latest",
			decision: "revision-requested",
			note: "keep the support gap open",
		});
		expect(parseCoMathNaturalRequest("request revision: keep the support gap open")).toEqual({
			kind: "review-report",
			reportRef: "latest",
			decision: "revision-requested",
			note: "keep the support gap open",
		});
		expect(parseCoMathNaturalRequest("export working paper")).toEqual({
			kind: "export-paper",
			force: false,
		});
		expect(parseCoMathNaturalRequest("what next")).toEqual({ kind: "next" });
		expect(parseCoMathNaturalRequest("what should we do next?")).toEqual({ kind: "next" });
	});

	it("requires explicit report review actions", () => {
		expect(parseCoMathNaturalRequest("looks good")).toEqual({
			kind: "unknown",
			reason: "ambiguous report review action",
			suggestions: [
				"Request revision for latest report: missing source-backed support lemma",
				"Accept latest report: useful source-backed extraction, but keep support gap open",
				"Block latest report: output contradicts the source indexing assumptions",
			],
		});
	});
});
