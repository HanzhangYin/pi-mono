import { describe, expect, it } from "vitest";
import {
	formatCoMathProductHelp,
	formatCoMathWelcome,
	formatExistingProjectHelp,
	formatGoalCreated,
	formatPlanningStarted,
	formatProjectCreated,
	formatSourceRegistered,
	formatStartingFirstWorkstream,
	formatWorkstreamCreated,
} from "../src/modes/comath/comath-progress.ts";

describe("co-math progress messages", () => {
	it("formats source-aware startup progress", () => {
		expect(
			formatCoMathWelcome({
				input: "paper.pdf",
				absolutePath: "/tmp/paper.pdf",
				displayName: "paper.pdf",
				exists: true,
				isFile: true,
			}),
		).toContain("Source: paper.pdf");
	});

	it("formats missing-source startup warnings", () => {
		expect(
			formatCoMathWelcome({
				input: "missing.pdf",
				absolutePath: "/tmp/missing.pdf",
				displayName: "missing.pdf",
				exists: false,
				isFile: false,
				missingReason: "Source path is not readable.",
			}),
		).toContain("source warning: missing.pdf");
	});

	it("formats product help without slash commands", () => {
		const help = formatCoMathProductHelp();

		expect(help).toContain("Describe the problem");
		expect(help).toContain("show latest run");
		expect(help).not.toContain("/comath");
	});

	it("formats product setup progress", () => {
		expect(formatPlanningStarted("Validate Question 3.")).toBe(
			"Planning co-math validation workflow for: Validate Question 3.",
		);
		expect(formatProjectCreated("Validate Question 3.")).toBe("Created project: Validate Question 3.");
		expect(formatSourceRegistered("paper.pdf")).toBe("Registered source: paper.pdf");
		expect(formatGoalCreated("Validate Q3")).toBe("Created goal: Validate Q3");
		expect(formatWorkstreamCreated("Extract definitions")).toBe("Created workstream: Extract definitions");
		expect(formatStartingFirstWorkstream("Extract definitions")).toBe(
			"Starting first workstream: Extract definitions",
		);
		expect(formatExistingProjectHelp()).toContain("show latest run");
		expect(formatExistingProjectHelp()).not.toContain("/comath");
	});
});
