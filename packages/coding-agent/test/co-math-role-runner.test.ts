import { EventEmitter } from "node:events";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	createDefaultRoleRunner,
	createTranscriptWriter,
	getPiInvocation,
	parseRoleRunOutput,
} from "../examples/extensions/co-math/role-runner.ts";

type TranscriptStreamFactoryForTest = NonNullable<Parameters<typeof createTranscriptWriter>[1]>;

class ErroringTranscriptStreamForTest extends EventEmitter {
	write(_chunk: string): boolean {
		queueMicrotask(() => {
			this.emit("error", new Error("async transcript write failed"));
		});
		return false;
	}

	end(): this {
		queueMicrotask(() => {
			this.emit("error", new Error("async transcript close failed"));
		});
		return this;
	}
}

describe("parseRoleRunOutput", () => {
	it("parses plain JSON role output with proposed claims", () => {
		const result = parseRoleRunOutput(
			JSON.stringify({
				summary: "Finite search found a candidate obstruction.",
				proposedClaims: [
					{
						statement: "Endpoint monotonicity fails in the tested toy class at n = 5.",
						evidence: [
							{
								kind: "computation",
								summary: "Enumerated all toy-class examples through n = 5 and found one obstruction.",
							},
						],
						warnings: [
							{
								severity: "high",
								message: "Finite enumeration is not a proof for all n.",
							},
						],
					},
				],
				blockers: ["Need a lifting argument before generalization."],
			}),
		);

		expect(result).toEqual({
			summary: "Finite search found a candidate obstruction.",
			proposedClaims: [
				{
					statement: "Endpoint monotonicity fails in the tested toy class at n = 5.",
					evidence: [
						{
							kind: "computation",
							summary: "Enumerated all toy-class examples through n = 5 and found one obstruction.",
						},
					],
					warnings: [
						{
							severity: "high",
							message: "Finite enumeration is not a proof for all n.",
						},
					],
				},
			],
			blockers: ["Need a lifting argument before generalization."],
		});
	});

	it("parses a single fenced JSON block", () => {
		const result = parseRoleRunOutput(
			[
				"```json",
				JSON.stringify({
					summary: "Coordinator found no safe promotion path yet.",
					blockers: ["Split the endpoint cases before asking for proof review."],
				}),
				"```",
			].join("\n"),
		);

		expect(result).toEqual({
			summary: "Coordinator found no safe promotion path yet.",
			blockers: ["Split the endpoint cases before asking for proof review."],
		});
	});

	it("parses reviewer decisions with proof evidence and resolved warnings", () => {
		const result = parseRoleRunOutput(
			JSON.stringify({
				summary: "Reviewer accepts the claim after checking the proof.",
				reviewDecision: {
					claimId: "claim-1",
					status: "proved",
					evidence: [
						{
							kind: "proof",
							summary: "Checked the induction with explicit endpoint boundary cases.",
						},
					],
					resolvedWarningIds: ["warning-1"],
				},
			}),
		);

		expect(result).toEqual({
			summary: "Reviewer accepts the claim after checking the proof.",
			reviewDecision: {
				claimId: "claim-1",
				status: "proved",
				evidence: [
					{
						kind: "proof",
						summary: "Checked the induction with explicit endpoint boundary cases.",
					},
				],
				resolvedWarningIds: ["warning-1"],
			},
		});
	});

	it("parses proof sketch reviewer decisions", () => {
		const result = parseRoleRunOutput(
			JSON.stringify({
				summary: "Reviewer found a useful proof sketch but wants another pass.",
				reviewDecision: {
					claimId: "claim-1",
					status: "proof_sketch",
				},
			}),
		);

		expect(result.reviewDecision).toEqual({
			claimId: "claim-1",
			status: "proof_sketch",
		});
	});

	it("falls back safely for non-JSON prose", () => {
		const result = parseRoleRunOutput("This is a free-form role report.");

		expect(result).toEqual({
			summary: "This is a free-form role report.",
			blockers: [
				"Role output was not valid structured co-math JSON; saved as report only.",
				"Structured output parse failure: output was not a single JSON object or fenced JSON object",
			],
		});
		expect(result.proposedClaims).toBeUndefined();
		expect(result.reviewDecision).toBeUndefined();
	});

	it("normalizes source and derivation evidence aliases from role output", () => {
		const result = parseRoleRunOutput(
			JSON.stringify({
				summary: "Extracted source-backed definitions.",
				proposedClaims: [
					{
						statement: "S_n(lambda) is the finite content sector.",
						evidence: [
							{ kind: "citation", summary: "docs/first-proof.md lines 730-731 define the state space." },
							{ kind: "derivation", summary: "Stationarity follows after dividing by the normalizing sum." },
							{ kind: "proof_obligation", summary: "Need a support lemma." },
						],
						warnings: [{ severity: "high", message: "Support lemma not found." }],
					},
				],
			}),
		);

		expect(result.blockers).toBeUndefined();
		expect(result.proposedClaims?.[0]?.evidence).toEqual([
			{ kind: "reference", summary: "[citation] docs/first-proof.md lines 730-731 define the state space." },
			{ kind: "proof", summary: "[derivation] Stationarity follows after dividing by the normalizing sum." },
			{ kind: "proof", summary: "[proof_obligation] Need a support lemma." },
		]);
	});

	it("normalizes source and review artifact aliases from role output", () => {
		const result = parseRoleRunOutput(
			JSON.stringify({
				summary: "Audited support gap.",
				proposedArtifacts: [
					{
						kind: "source_extract",
						title: "Question 3 source definitions",
						summary: "Key source interval is docs/first-proof.md Section B.3.",
						provenance: "Read docs/first-proof.md.",
						path: "docs/first-proof.md",
					},
					{
						kind: "negative_result",
						title: "No support lemma found",
						summary: "Search found no vanishing lemma.",
						provenance: "rg over registered files.",
					},
					{
						kind: "exact_example",
						title: "Small indexing obstruction",
						summary: "For n=2, N^2 contains states outside S_2(lambda).",
					},
				],
			}),
		);

		expect(result.blockers).toBeUndefined();
		expect(result.proposedArtifacts).toMatchObject([
			{
				kind: "reference",
				title: "Question 3 source definitions",
				summary: "[source_extract] Key source interval is docs/first-proof.md Section B.3.",
				provenance: "Read docs/first-proof.md.",
				path: "docs/first-proof.md",
			},
			{
				kind: "failed_attempt",
				title: "No support lemma found",
				summary: "[negative_result] Search found no vanishing lemma.",
			},
			{
				kind: "computation",
				title: "Small indexing obstruction",
				summary: "[exact_example] For n=2, N^2 contains states outside S_2(lambda).",
			},
		]);
	});

	it("parses proposed artifacts with provenance", () => {
		const result = parseRoleRunOutput(
			JSON.stringify({
				summary: "Workstream preserved a failed attempt and a computation.",
				proposedArtifacts: [
					{
						kind: "failed_attempt",
						title: "Endpoint induction attempt",
						summary: "The induction breaks when the right arm is empty.",
						provenance: "workstream role run",
						path: "notes/endpoint-induction.md",
						relatedClaimIds: ["claim-1"],
						relatedWorkstreamIds: ["workstream-endpoints"],
					},
				],
			}),
		);

		expect(result.proposedArtifacts).toEqual([
			{
				kind: "failed_attempt",
				title: "Endpoint induction attempt",
				summary: "The induction breaks when the right arm is empty.",
				provenance: "workstream role run",
				path: "notes/endpoint-induction.md",
				relatedClaimIds: ["claim-1"],
				relatedWorkstreamIds: ["workstream-endpoints"],
			},
		]);
	});

	it("falls back safely for invalid proposed artifact kinds", () => {
		const invalidArtifactText = JSON.stringify({
			summary: "Invalid artifact kind.",
			proposedArtifacts: [
				{
					kind: "experiment",
					title: "Unsupported artifact",
					summary: "This kind should not be accepted.",
				},
			],
		});

		const result = parseRoleRunOutput(invalidArtifactText);

		expect(result).toEqual({
			summary: invalidArtifactText,
			blockers: [
				"Role output was not valid structured co-math JSON; saved as report only.",
				"Structured output parse failure: proposedArtifacts[0] has unknown artifact kind: experiment",
			],
		});
		expect(result.proposedArtifacts).toBeUndefined();
	});

	it("includes parse diagnostics when structured JSON has an unknown artifact kind", () => {
		const result = parseRoleRunOutput(
			JSON.stringify({
				summary: "Report with unknown artifact kind.",
				proposedArtifacts: [
					{
						kind: "brand_new_kind",
						title: "Unknown artifact",
						summary: "This should not be accepted silently.",
					},
				],
			}),
		);

		expect(result.summary).toContain("Report with unknown artifact kind.");
		expect(result.blockers).toContain("Role output was not valid structured co-math JSON; saved as report only.");
		expect(result.blockers?.join("\n")).toContain("unknown artifact kind: brand_new_kind");
	});

	it("falls back safely for invalid enum values", () => {
		const invalidEvidenceText = JSON.stringify({
			summary: "Invalid evidence kind.",
			proposedClaims: [
				{
					statement: "A candidate claim.",
					evidence: [{ kind: "experiment", summary: "Ran an unsupported experiment label." }],
				},
			],
		});
		const invalidWarningText = JSON.stringify({
			summary: "Invalid warning severity.",
			proposedClaims: [
				{
					statement: "A candidate claim.",
					warnings: [{ severity: "urgent", message: "Unsupported severity." }],
				},
			],
		});
		const invalidEvidence = parseRoleRunOutput(invalidEvidenceText);
		const invalidWarning = parseRoleRunOutput(invalidWarningText);

		expect(invalidEvidence).toEqual({
			summary: invalidEvidenceText,
			blockers: [
				"Role output was not valid structured co-math JSON; saved as report only.",
				"Structured output parse failure: proposedClaims[0].evidence[0] has unknown evidence kind: experiment",
			],
		});
		expect(invalidEvidence.proposedClaims).toBeUndefined();
		expect(invalidEvidence.reviewDecision).toBeUndefined();
		expect(invalidWarning).toEqual({
			summary: invalidWarningText,
			blockers: [
				"Role output was not valid structured co-math JSON; saved as report only.",
				"Structured output parse failure: proposedClaims[0].warnings[0].severity is invalid: urgent",
			],
		});
		expect(invalidWarning.proposedClaims).toBeUndefined();
		expect(invalidWarning.reviewDecision).toBeUndefined();
	});

	it("ignores unknown extra fields in otherwise valid JSON", () => {
		const result = parseRoleRunOutput(
			JSON.stringify({
				summary: "Only known fields should be preserved.",
				extra: "ignored",
				proposedClaims: [
					{
						statement: "A candidate claim.",
						unknownClaimField: "ignored",
					},
				],
				reviewDecision: {
					claimId: "claim-1",
					status: "needs_review",
					unknownReviewField: "ignored",
				},
			}),
		);

		expect(result).toEqual({
			summary: "Only known fields should be preserved.",
			proposedClaims: [
				{
					statement: "A candidate claim.",
				},
			],
			reviewDecision: {
				claimId: "claim-1",
				status: "needs_review",
			},
		});
	});
});

describe("getPiInvocation", () => {
	it("contains async transcript stream errors and resolves close safely", async () => {
		const root = mkdtempSync(join(tmpdir(), "co-math-role-transcript-error-"));
		const writeErrorStream = new ErroringTranscriptStreamForTest();
		const closeErrorStream = new ErroringTranscriptStreamForTest();
		const toTranscriptStream = (
			stream: ErroringTranscriptStreamForTest,
		): ReturnType<TranscriptStreamFactoryForTest> => stream as unknown as ReturnType<TranscriptStreamFactoryForTest>;

		const writeErrorWriter = await createTranscriptWriter(join(root, "write-error.jsonl"), () =>
			toTranscriptStream(writeErrorStream),
		);
		writeErrorWriter.write({ type: "started" });
		await new Promise<void>((resolve) => {
			setImmediate(resolve);
		});
		await expect(writeErrorWriter.close()).resolves.toBeUndefined();

		const closeErrorWriter = await createTranscriptWriter(join(root, "close-error.jsonl"), () =>
			toTranscriptStream(closeErrorStream),
		);
		await expect(closeErrorWriter.close()).resolves.toBeUndefined();
	});

	it("writes JSONL transcript events for a controlled Pi JSON-mode process", async () => {
		const root = mkdtempSync(join(tmpdir(), "co-math-role-transcript-"));
		const scriptPath = join(root, "fake-pi.sh");
		const extensionDir = join(root, "extension");
		const transcriptPath = join(root, ".pi", "co-math", "transcripts", "role-run-1.jsonl");
		mkdirSync(join(extensionDir, "agents"), { recursive: true });
		writeFileSync(join(extensionDir, "agents", "workstream.md"), "fake prompt\n");
		writeFileSync(
			scriptPath,
			[
				"#!/bin/sh",
				'printf \'%s\\n\' \'{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"{\\"summary\\":\\"ok\\",\\"blockers\\":[\\"still blocked\\"]}"}]}}\'',
				"printf '%s\\n' 'diagnostic stderr' >&2",
			].join("\n"),
		);
		chmodSync(scriptPath, 0o755);
		const roleRunner = createDefaultRoleRunner(extensionDir, {
			currentScript: join(root, "missing-current-script"),
			execPath: scriptPath,
		});

		const result = await roleRunner({
			cwd: root,
			role: "workstream",
			task: "Role: workstream",
			transcriptPath,
		});

		expect(result.summary).toBe("ok");
		expect(result.blockers).toEqual(["still blocked"]);
		const events = readFileSync(transcriptPath, "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as { type: string; [key: string]: unknown });
		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: "started", role: "workstream", command: scriptPath }),
				expect.objectContaining({ type: "stdout", line: expect.stringContaining('"message_end"') }),
				expect.objectContaining({ type: "stderr", text: "diagnostic stderr\n" }),
				expect.objectContaining({
					type: "final_assistant_text",
					text: '{"summary":"ok","blockers":["still blocked"]}',
				}),
				expect.objectContaining({ type: "closed", exitCode: 0, aborted: false }),
			]),
		);
	});

	it("uses tsx when a development TypeScript cli script is running under node", () => {
		const root = mkdtempSync(join(tmpdir(), "co-math-role-runner-"));
		const tsxPath = join(root, "node_modules", ".bin", "tsx");
		const scriptPath = join(root, "packages", "coding-agent", "src", "cli.ts");
		const tsconfigPath = join(root, "tsconfig.json");
		mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
		mkdirSync(join(root, "packages", "coding-agent", "src"), { recursive: true });
		writeFileSync(tsxPath, "#!/usr/bin/env node\n");
		writeFileSync(scriptPath, "export {};\n");
		writeFileSync(tsconfigPath, "{}\n");

		const invocation = getPiInvocation(["--mode", "json"], {
			currentScript: scriptPath,
			execPath: "/usr/bin/node",
		});

		expect(invocation).toEqual({
			command: tsxPath,
			args: ["--tsconfig", tsconfigPath, scriptPath, "--mode", "json"],
		});
	});
});
