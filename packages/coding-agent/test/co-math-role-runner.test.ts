import { describe, expect, it } from "vitest";
import { parseRoleRunOutput } from "../examples/extensions/co-math/role-runner.ts";

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

	it("falls back safely for non-JSON prose", () => {
		const result = parseRoleRunOutput("This is a free-form role report.");

		expect(result).toEqual({
			summary: "This is a free-form role report.",
			blockers: ["Role output was not valid structured co-math JSON; saved as report only."],
		});
		expect(result.proposedClaims).toBeUndefined();
		expect(result.reviewDecision).toBeUndefined();
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
			blockers: ["Role output was not valid structured co-math JSON; saved as report only."],
		});
		expect(result.proposedArtifacts).toBeUndefined();
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
			blockers: ["Role output was not valid structured co-math JSON; saved as report only."],
		});
		expect(invalidEvidence.proposedClaims).toBeUndefined();
		expect(invalidEvidence.reviewDecision).toBeUndefined();
		expect(invalidWarning).toEqual({
			summary: invalidWarningText,
			blockers: ["Role output was not valid structured co-math JSON; saved as report only."],
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
