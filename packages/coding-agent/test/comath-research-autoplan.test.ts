import { describe, expect, it } from "vitest";
import { createCoMathResearchAutoPlan } from "../src/modes/comath/comath-research-autoplan.ts";

const FORBIDDEN_PRODUCT_TERMS = ["role-run", "workstream", "artifact", "queue", "schema", "/comath", "/co"];

describe("co-math research autoplan", () => {
	it("creates default beginner-readable research paths", () => {
		const plan = createCoMathResearchAutoPlan("Are there infinitely many primes of the form n^2 + 1?");

		expect(plan.rootQuestion).toBe("Are there infinitely many primes of the form n^2 + 1?");
		expect(plan.initialFocusSlug).toBe("small-examples-counterexamples");
		expect(plan.paths.map((path) => path.title)).toEqual([
			"Small examples and counterexamples",
			"Direct proof attempt",
			"Reformulation",
			"Weaker special cases",
			"Known theorem or literature reduction",
		]);
		expect(plan.paths).toHaveLength(5);
		expect(plan.paths[0]?.objective).toContain("Are there infinitely many primes");
		expect(plan.paths[3]?.suggestedNextMove).toContain("weaker theorem");
		for (const path of plan.paths) {
			for (const term of FORBIDDEN_PRODUCT_TERMS) {
				expect(`${path.title}\n${path.objective}\n${path.suggestedNextMove}`).not.toContain(term);
			}
		}
	});
});
