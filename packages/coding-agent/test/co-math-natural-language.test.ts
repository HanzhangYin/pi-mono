import { describe, expect, it } from "vitest";
import { parseCoMathNaturalRequest } from "../examples/extensions/co-math/natural-language.ts";

describe("parseCoMathNaturalRequest", () => {
	it("parses common safe co-math intents conservatively", () => {
		expect(parseCoMathNaturalRequest("start a project for 2605.06651")).toEqual({
			kind: "init",
			question: "2605.06651",
		});
		expect(parseCoMathNaturalRequest("initialize project for Question 3")).toEqual({
			kind: "init",
			question: "Question 3",
		});
		expect(parseCoMathNaturalRequest("set goal verify Question 3")).toEqual({
			kind: "goal",
			text: "verify Question 3",
		});
		expect(parseCoMathNaturalRequest("create a workstream to audit Question 3 source definitions")).toEqual({
			kind: "workstream",
			slug: "audit-question-3-source-definitions",
			goal: "audit Question 3 source definitions",
		});
		expect(parseCoMathNaturalRequest("run latest workstream")).toEqual({
			kind: "run-workstream",
			workstreamRef: "latest",
		});
		expect(parseCoMathNaturalRequest("show latest report")).toEqual({
			kind: "show-report",
			reportRef: "latest",
		});
		expect(parseCoMathNaturalRequest("show report report-7")).toEqual({
			kind: "show-report",
			reportRef: "report-7",
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
		expect(parseCoMathNaturalRequest("export working paper")).toEqual({
			kind: "export-paper",
			force: false,
		});
		expect(parseCoMathNaturalRequest("what next")).toEqual({ kind: "next" });
	});

	it("requires explicit report review actions", () => {
		expect(parseCoMathNaturalRequest("looks good")).toEqual({
			kind: "unknown",
			reason: "ambiguous report review action",
			suggestions: [
				"/co accept latest report: useful source-backed extraction, but keep support gap open",
				"/co request revision for latest report: missing source-backed support lemma",
			],
		});
	});
});
