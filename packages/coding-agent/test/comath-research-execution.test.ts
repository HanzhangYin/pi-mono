import { describe, expect, it } from "vitest";
import type { ResearchPath } from "../examples/extensions/co-math/schema.ts";
import { runResearchPathRound } from "../src/modes/comath/comath-research-execution.ts";

const FIXED_NOW = "2026-06-05T12:00:00.000Z";

function createPath(title: string): ResearchPath {
	return {
		id: "path-1",
		title,
		objective: `Explore ${title}.`,
		status: "active",
		latestFindings: [],
		blockers: [],
		suggestedNextMove: "Choose the next concrete check.",
		priority: 1,
		createdAt: FIXED_NOW,
		updatedAt: FIXED_NOW,
	};
}

describe("co-math research execution", () => {
	it("computes n^2 + 1 examples for the examples path", () => {
		const path = createPath("Small examples and counterexamples");
		const result = runResearchPathRound({
			rootQuestion: "Are there infinitely many primes of the form n^2 + 1?",
			path,
			allPaths: [path],
			now: FIXED_NOW,
		});

		expect(result.findings).toContain("n = 0 gives 1, not prime.");
		expect(result.findings).toContain("n = 1 gives 2, prime.");
		expect(result.findings).toContain("n = 3 gives 10, not prime.");
		expect(result.findings).toContain("n = 10 gives 101, prime.");
		expect(result.findings.join("\n")).toContain("odd n > 1");
		expect(result.uncertainties.join("\n")).toContain("do not prove or disprove infinitude");
		expect(result.suggestedNextMove).toContain("parity");
		expect(result.workingPaperSectionTitle).toBe("Examples and evidence");
	});

	it("keeps direct proof attempts cautious", () => {
		const path = createPath("Direct proof attempt");
		const result = runResearchPathRound({
			rootQuestion: "Are there infinitely many primes of the form n^2 + 1?",
			path,
			allPaths: [path],
			now: FIXED_NOW,
		});

		const text = [...result.findings, ...result.uncertainties].join("\n");
		expect(text).toContain("Euclid-style argument is not immediate");
		expect(text).toContain("Parity eliminates odd n > 1");
		expect(text).toContain("No complete proof strategy has been established");
		expect(text).not.toContain("This proves");
		expect(text).not.toContain("proof is complete");
		expect(result.workingPaperSectionTitle).toBe("Direct proof attempts");
	});

	it("uses source-needed language for known theorem targets", () => {
		const path = createPath("Known theorem or literature reduction");
		const result = runResearchPathRound({
			rootQuestion: "Are there infinitely many primes of the form n^2 + 1?",
			path,
			allPaths: [path],
			now: FIXED_NOW,
		});

		const text = [...result.findings, ...result.uncertainties, ...result.blockers].join("\n");
		expect(text).toContain("Search targets include");
		expect(text).toContain("not registered a source");
		expect(text).toContain("source-backed literature check");
		expect(text).not.toContain("known to be open");
		expect(result.workingPaperSectionTitle).toBe("Literature/theorem targets");
	});

	it("returns a safe generic result for custom paths", () => {
		const path = createPath("Try a geometric analogy");
		const result = runResearchPathRound({
			rootQuestion: "Can this problem be explored?",
			path,
			allPaths: [path],
			now: FIXED_NOW,
		});

		expect(result.findings).toContain("No theorem-level conclusion has been established yet.");
		expect(result.uncertainties.join("\n")).toContain("source-backed definitions");
		expect(result.suggestedNextMove).toBe(path.suggestedNextMove);
		expect(result.workingPaperSectionTitle).toBe("Research notes");
	});
});
