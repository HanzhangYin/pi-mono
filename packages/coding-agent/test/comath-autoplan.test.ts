import { describe, expect, it } from "vitest";
import { createCoMathAutoPlan, slugify } from "../src/modes/comath/comath-autoplan.ts";

describe("co-math autoplan", () => {
	it("creates a deterministic plan for a question prompt", () => {
		const plan = createCoMathAutoPlan("Validate Question 3.", "2605.06651v2.pdf");

		expect(plan.rootQuestion).toBe("Validate Question 3.");
		expect(plan.firstWorkstreamId).toBe("workstream-extract-question-3-definitions");
		expect(plan.goals).toEqual([
			"Validate Question 3 against 2605.06651v2.pdf using source-backed definitions and preserve proof gaps.",
			"Extract exact definitions, notation, assumptions, and referenced identities needed for Question 3.",
			"Audit proof dependencies and unsupported transitions for Question 3, especially support, indexing, boundary, and vanishing-step gaps.",
		]);
		expect(plan.workstreams).toEqual([
			{
				slug: "extract-question-3-definitions",
				title: "Extract source-backed definitions for Question 3",
				goal: "Extract source-backed definitions, notation, assumptions, and identities relevant to Question 3. Quote or cite source locations. Do not prove new claims.",
			},
			{
				slug: "identify-question-3-assumptions",
				title: "Identify assumptions and references for Question 3",
				goal: "Identify assumptions, external references, and proof dependencies used by Question 3. Preserve uncertainty when the source is ambiguous.",
			},
			{
				slug: "audit-question-3-support-gaps",
				title: "Audit support and indexing gaps for Question 3",
				goal: "Audit support, indexing, boundary, and vanishing-step gaps in the Question 3 argument. Do not fill gaps without source-backed evidence.",
			},
		]);
		expect(plan.workstreams).toHaveLength(3);
		expect(plan.workstreams[2]?.goal).toContain("support");
		expect(plan.workstreams[2]?.goal).toContain("indexing");
		expect(plan.workstreams[2]?.goal).toContain("Do not fill gaps");
	});

	it("slugifies arbitrary labels", () => {
		expect(slugify("Local Lemma: A+B")).toBe("local-lemma-a-b");
		expect(slugify("...")).toBe("problem");
	});
});
