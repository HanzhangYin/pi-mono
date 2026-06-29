import { describe, expect, it } from "vitest";
import { createCoMathResearchAutoPlan } from "../src/modes/comath/comath-research-autoplan.ts";
import { runResearchWorkstream } from "../src/modes/comath/comath-research-workstream.ts";
import type { ResearchPath } from "../src/modes/comath/schema.ts";

const ROOT_QUESTION = "Are there infinitely many primes of the form n^2 + 1?";

function buildPaths(rootQuestion = ROOT_QUESTION): ResearchPath[] {
	const plan = createCoMathResearchAutoPlan(rootQuestion);
	return plan.paths.map((path, index) => ({
		id: `path-${index + 1}`,
		title: path.title,
		objective: path.objective,
		status: "active",
		latestFindings: [],
		blockers: [],
		suggestedNextMove: path.suggestedNextMove,
		priority: path.priority,
		createdAt: "2026-06-05T12:00:00.000Z",
		updatedAt: "2026-06-05T12:00:00.000Z",
	}));
}

function runForTitle(title: string, rootQuestion = ROOT_QUESTION) {
	const paths = buildPaths(rootQuestion);
	const path = paths.find((candidate) => candidate.title === title);
	if (!path) {
		throw new Error(`Missing research path for title: ${title}`);
	}
	return runResearchWorkstream({
		rootQuestion,
		path,
		allPaths: paths,
		now: "2026-06-05T12:30:00.000Z",
	});
}

describe("co-math research workstream", () => {
	it("includes coordinator, specialist, critic, and synthesis steps for the direct proof path", () => {
		const report = runForTitle("Direct proof attempt");
		expect(report.steps.map((step) => step.role)).toEqual(["coordinator", "specialist", "critic", "synthesizer"]);
		expect(report.status).toBe("completed");
		expect(report.coordinatorBrief).toContain("direct proof path");
		const specialist = report.steps.find((step) => step.role === "specialist");
		expect(specialist?.details.join("\n")).toContain("Euclid-style argument is not immediate");
	});

	it("catches the lack of an infinitude mechanism for n^2 + 1 in the direct proof critic", () => {
		const report = runForTitle("Direct proof attempt");
		const criticisms = report.criticisms.join("\n");
		expect(criticisms).toContain("does not immediately preserve the form n^2 + 1");
		expect(criticisms).toContain("not a proof of infinitude");
		expect(report.gaps.join("\n")).toContain("No complete mechanism has been established for infinitely many even n");
		expect(report.promisingStrategy.join("\n")).toContain("4m^2 + 1");
		expect(report.suggestedNextMove).toContain("weaker theorem or a source-backed literature check");
	});

	it("preserves the uncertainty that examples do not prove infinitude", () => {
		const report = runForTitle("Small examples and counterexamples");
		expect(report.findings.join("\n")).toContain("n = 1 gives 2, prime");
		expect(report.gaps.join("\n")).toContain("do not prove or disprove infinitude");
		expect(report.criticisms.join("\n")).toContain("does not establish that infinitely many");
	});

	it("turns the reformulation path into an actionable bridge to weaker targets", () => {
		const report = runForTitle("Reformulation");
		const text = [
			report.coordinatorBrief,
			...report.findings,
			...report.criticisms,
			...report.gaps,
			...report.promisingStrategy,
			report.suggestedNextMove,
		].join("\n");

		expect(text).toContain("equivalent or related frames");
		expect(text).toContain("Polynomial prime values");
		expect(text).toContain("4m^2 + 1");
		expect(text).toContain("not a proof");
		expect(text).toContain("source-backed search targets");
		expect(report.suggestedNextMove).toContain("continue path 4");
	});

	it("turns the weaker-special-cases path into candidate lemmas for a proof attempt", () => {
		const report = runForTitle("Weaker special cases");
		const text = [
			report.coordinatorBrief,
			...report.findings,
			...report.criticisms,
			...report.gaps,
			...report.promisingStrategy,
			report.suggestedNextMove,
		].join("\n");

		expect(text).toContain("candidate lemmas or weaker targets");
		expect(text).toContain("Parity obstruction");
		expect(text).toContain("Status: proved");
		expect(text).toContain("computational evidence only");
		expect(text).toContain("Small-prime obstructions");
		expect(text).toContain("do not bridge to infinitely many primes");
		expect(report.suggestedNextMove).toContain("continue path 2");
	});

	it("requests source-backed literature verification for the known theorem path", () => {
		const report = runForTitle("Known theorem or literature reduction");
		expect(report.criticisms.join("\n")).toContain("search targets, not verified citations");
		expect(report.gaps.join("\n")).toContain("source-backed literature check is still needed");
		expect(report.humanHelpUseful.join("\n")).toContain("confirm the exact status of the relevant theorem targets");
	});

	it("produces a working-paper summary and a concrete next move", () => {
		const report = runForTitle("Weaker special cases");
		expect(report.workingPaperSectionTitle).toBe("Weaker statements");
		expect(report.workingPaperSummary).toContain("Research workstream: Weaker special cases");
		expect(report.workingPaperSummary).toContain("Findings:");
		expect(report.workingPaperSummary).toContain("Open gaps:");
		expect(report.suggestedNextMove.length).toBeGreaterThan(0);
	});

	it("stays generic and uncertainty-preserving for a non-n^2+1 problem", () => {
		const report = runForTitle("Direct proof attempt", "Is every even number greater than two a sum of two primes?");
		expect(report.steps.map((step) => step.role)).toEqual(["coordinator", "specialist", "critic", "synthesizer"]);
		expect(report.criticisms.join("\n")).not.toContain("n^2 + 1");
		expect(report.gaps.length).toBeGreaterThan(0);
		expect(report.suggestedNextMove.length).toBeGreaterThan(0);
	});
});
