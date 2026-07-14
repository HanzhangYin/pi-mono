import { describe, expect, it } from "vitest";
import { researchTaskKindForPath } from "../src/modes/comath/comath-harness.ts";

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
});
