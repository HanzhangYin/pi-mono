import { describe, expect, it } from "vitest";
import {
	extractBlockers,
	extractRunSummary,
	extractStatus,
	extractTranscriptPath,
	formatProductReport,
	parseRawReportSummary,
	sanitizeProductIds,
} from "../src/modes/comath/comath-backend-output.ts";

const PRIME_PROOF_RAW_JSON = JSON.stringify(
	{
		summary:
			"The fixed proof is valid assuming the standard lemma that every integer greater than 1 has a prime divisor.",
		proposedClaims: [
			{
				statement: "There are infinitely many primes.",
				evidence: [
					{
						kind: "proof",
						summary: "The fixed proof replaces “Therefore N is prime” with a prime divisor argument.",
					},
				],
			},
		],
		reviewDecision: { claimId: "", status: "needs_review" },
		blockers: [],
	},
	null,
	2,
);

const PARSE_FAILED_REPORT_MESSAGE = [
	"Report report-2: workstream role run: workstream-validate-fixed-proof",
	`Summary: ${PRIME_PROOF_RAW_JSON}`,
	"Blockers:",
	"- Role output was not valid structured co-math JSON; saved as report only.",
	"- Structured output parse failure: reviewDecision.claimId must be a non-empty string",
	"Linked role run: role-run-1",
	"Report review rounds:",
	"- none",
].join("\n");

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

	it("renders a human-readable fallback when a report is blocked only by structured-parse failure", () => {
		const report = formatProductReport([PARSE_FAILED_REPORT_MESSAGE]);
		expect(report).toBeDefined();
		// Useful math content is surfaced...
		expect(report).toContain("Status: needs review");
		expect(report).toContain(
			"The fixed proof is valid assuming the standard lemma that every integer greater than 1 has a prime divisor.",
		);
		expect(report).toContain("Key points");
		expect(report).toContain("There are infinitely many primes.");
		expect(report).toContain("The fixed proof replaces");
		// ...and the internal parser/schema failure is not shown as the answer.
		expect(report).not.toContain("structured co-math JSON");
		expect(report).not.toContain("reviewDecision.claimId");
		expect(report).not.toContain("Structured output parse failure");
		expect(report).not.toMatch(/Summary\n\{/);
	});

	it("parseRawReportSummary extracts useful fields and ignores empty schema values", () => {
		const fields = parseRawReportSummary(PRIME_PROOF_RAW_JSON);
		expect(fields).toBeDefined();
		expect(fields?.summary).toContain("The fixed proof is valid");
		expect(fields?.claimStatements).toEqual(["There are infinitely many primes."]);
		expect(fields?.evidenceSummaries[0]).toContain("prime divisor argument");
		expect(fields?.reviewStatus).toBe("needs_review");
		// Non-JSON prose yields no fallback fields.
		expect(parseRawReportSummary("Just plain prose, no JSON here.")).toBeUndefined();
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
