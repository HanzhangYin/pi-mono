import { describe, expect, it } from "vitest";
import {
	extractBlockers,
	extractRunSummary,
	extractStatus,
	extractTranscriptPath,
	formatProductReport,
	sanitizeProductIds,
} from "../src/modes/comath/comath-backend-output.ts";

const RUN_STATUS_MESSAGE = [
	"role-run-1",
	"Role: workstream",
	"Status: running",
	"Target workstream: workstream-extract-question-3-definitions",
	"Execution mode: background",
	"Live in this session: yes",
	"Transcript: .pi/co-math/transcripts/role-run-1.jsonl",
	"Report: none",
	"Created claims: none",
	"Blockers:",
	"- none",
].join("\n");

const REPORT_STATUS_MESSAGE = [
	"Report report-1: workstream role run: workstream-extract-question-3-definitions",
	"Summary: Assigned goal: extract source-backed definitions for Question 3.",
	"Blockers:",
	"- No target claim id or exact Question 3 statement was provided.",
	'- 2605.06651v2.pdf contains no literal "Question 3".',
	"Linked role run: role-run-1",
	"Report review rounds:",
	"- none",
].join("\n");

describe("co-math backend output parsing", () => {
	it("extracts transcript path and status", () => {
		expect(extractTranscriptPath([RUN_STATUS_MESSAGE])).toBe(".pi/co-math/transcripts/role-run-1.jsonl");
		expect(extractStatus([RUN_STATUS_MESSAGE])).toBe("running");
		expect(extractTranscriptPath(["no fields here"])).toBeUndefined();
		expect(extractStatus([])).toBeUndefined();
	});

	it("extracts a product run summary from run-status output", () => {
		const summary = extractRunSummary([RUN_STATUS_MESSAGE]);
		expect(summary).toEqual({
			status: "running",
			background: true,
			transcriptPath: ".pi/co-math/transcripts/role-run-1.jsonl",
			reportId: undefined,
			blockers: [],
		});
		expect(extractRunSummary(["No role run found for latest."])).toBeUndefined();
	});

	it("extracts blockers and ignores none markers", () => {
		expect(extractBlockers(RUN_STATUS_MESSAGE)).toEqual([]);
		expect(extractBlockers(REPORT_STATUS_MESSAGE)).toEqual([
			"No target claim id or exact Question 3 statement was provided.",
			'2605.06651v2.pdf contains no literal "Question 3".',
		]);
	});

	it("formats a blocked report as product copy", () => {
		const report = formatProductReport([REPORT_STATUS_MESSAGE]);
		expect(report).toBeDefined();
		expect(report).toContain("Latest report");
		expect(report).toContain("Status: blocked");
		expect(report).toContain("Summary");
		expect(report).toContain("Blockers");
		expect(report).toContain('- 2605.06651v2.pdf contains no literal "Question 3".');
		expect(report).toContain("Next");
		expect(report).not.toContain("Report report-1");
		expect(report).not.toContain("Linked role run");
		expect(report).not.toContain("/comath");
	});

	it("redacts internal ids from report summary and blockers but keeps other text", () => {
		const report = formatProductReport([
			[
				"Report report-1: workstream role run",
				"Summary: Workstream workstream-extract-question-2-definitions is blocked; see claim-3.",
				"Blockers:",
				"- Missing context for workstream-extract-question-2-definitions.",
			].join("\n"),
		]);
		expect(report).toBeDefined();
		expect(report).not.toContain("workstream-extract-question-2-definitions");
		expect(report).not.toContain("claim-3");
		expect(report).toContain("this audit step");
		expect(report).toContain("a claim");
	});

	it("sanitizeProductIds maps id prefixes and leaves plain text untouched", () => {
		expect(sanitizeProductIds("see workstream-foo-bar and role-run-2 and artifact-9")).toBe(
			"see this audit step and this run and an artifact",
		);
		expect(sanitizeProductIds("no ids here, just prose about Question 3")).toBe(
			"no ids here, just prose about Question 3",
		);
	});

	it("formats a clean report as completed", () => {
		const report = formatProductReport([
			["Report report-2: workstream role run", "Summary: All definitions extracted.", "Blockers:", "- none"].join(
				"\n",
			),
		]);
		expect(report).toContain("Status: completed");
		expect(report).not.toContain("Blockers");
		expect(formatProductReport(["No report found for latest."])).toBeUndefined();
	});
});
