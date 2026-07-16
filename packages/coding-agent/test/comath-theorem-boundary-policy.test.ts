import { describe, expect, it } from "vitest";
import { runResearchCoordinatorSynthesis } from "../src/modes/comath/comath-coordinator-synthesis.ts";
import { extractStructuredReviewFindings } from "../src/modes/comath/comath-critic-repair-policy.ts";
import {
	rankCoordinatorMovesForAutonomousExecution,
	researchTaskKindForPath,
} from "../src/modes/comath/comath-harness.ts";
import {
	applyTheoremBoundaryPolicy,
	OPTIONAL_STRENGTHENING_MARKER,
	THEOREM_BOUNDARY_CONSOLIDATION_MARKER,
} from "../src/modes/comath/comath-theorem-boundary-policy.ts";
import type {
	CoMathProjectState,
	ResearchCoordinatorReportRecord,
	ResearchPlanTaskRecord,
} from "../src/modes/comath/schema.ts";
import { createEmptyProjectState } from "../src/modes/comath/storage.ts";

const NOW = "2026-07-16T00:00:00.000Z";

function createState(): CoMathProjectState {
	const state = createEmptyProjectState({
		projectId: "theorem-boundary-policy",
		title: "General research problem",
		rootQuestion: "Determine the strongest theorem supported by the current evidence.",
		now: NOW,
	});
	return {
		...state,
		researchPaths: [
			{
				id: "path-1",
				title: "Structural proof",
				objective: "Prove the strongest valid structural result.",
				status: "active",
				latestFindings: [],
				blockers: [],
				suggestedNextMove: "Continue the proof.",
				priority: 1,
				createdAt: NOW,
				updatedAt: NOW,
			},
		],
	};
}

function task(
	id: string,
	sequence: number,
	options: {
		accepted?: boolean;
		goal?: string;
		dependsOnTaskIds?: string[];
		status?: ResearchPlanTaskRecord["status"];
	} = {},
): ResearchPlanTaskRecord {
	const accepted = options.accepted ?? false;
	return {
		id,
		planId: "plan-1",
		kind: "proof-attempt",
		status: options.status ?? (accepted ? "completed" : "blocked"),
		sequence,
		title: accepted ? "Prove a structural basis lemma" : "Attempt a stronger transition formula",
		description: accepted ? "Establish an integral basis theorem." : "Prove a stronger optional identity.",
		goal: options.goal ?? (accepted ? "Prove the basis and torsion theorem." : "Prove the stronger formula."),
		acceptanceCriteria: ["An independent reviewer verifies every required step."],
		dependsOnTaskIds: options.dependsOnTaskIds ?? [],
		requiredCapabilities: ["independent-review"],
		attemptIds: accepted ? [`attempt-${sequence}`] : [],
		...(accepted ? { acceptedAttemptId: `attempt-${sequence}` } : {}),
		pathId: "path-1",
		sourceIds: [],
		claimSupportIds: [],
		computationalArtifactIds: [],
		evidenceEntryIds: [],
		reviewOutcome: accepted ? "accepted" : "needs-revision",
		createdAt: NOW,
		updatedAt: NOW,
	};
}

function report(): Omit<ResearchCoordinatorReportRecord, "id" | "createdAt" | "updatedAt" | "workingPaperSectionId"> {
	return {
		inputReportIds: [],
		inputPathIds: ["path-1"],
		inputSourceIds: [],
		inputComputationalArtifactIds: [],
		inputReviewFingerprint: "fingerprint",
		whatWeKnow: [],
		roadblocks: ["A stronger identity is still unresolved."],
		recommendedNextMoves: [
			{
				title: "Retry the stronger identity",
				pathId: "path-1",
				rationale: "The previous proof failed.",
				prompt: "Attempt the broad identity again.",
				priority: "high",
			},
		],
		humanHelpUseful: [],
		suggestedPathId: "path-1",
		suggestedPrompt: "Attempt the broad identity again.",
	};
}

describe("co-math theorem boundary policy", () => {
	it("prioritizes an independent consolidation audit over an unrelated strengthening loop", async () => {
		const state = createState();
		state.researchPlanTasks = [
			task("task-1", 1, { accepted: true }),
			task("task-2", 2, { accepted: true, dependsOnTaskIds: ["task-1"] }),
			task("task-3", 3, { accepted: true, dependsOnTaskIds: ["task-2"] }),
			task("task-4", 4),
		];

		const { report: synthesized } = await runResearchCoordinatorSynthesis({ state, now: NOW });

		expect(synthesized.suggestedPrompt).toContain(THEOREM_BOUNDARY_CONSOLIDATION_MARKER);
		expect(synthesized.recommendedNextMoves[0]?.title).toContain("dependency-closed theorem");
		expect(synthesized.suggestedPrompt).toContain("Optional statements");
		expect(synthesized.suggestedPrompt).toContain("In ## Claims");
		expect(synthesized.suggestedPrompt).not.toContain("Report exactly:");
		expect(researchTaskKindForPath(state.researchPaths[0]!, synthesized.suggestedPrompt)).toBe("proof-attempt");
	});

	it("does not consolidate results whose explicit proof dependencies remain open", () => {
		const state = createState();
		state.researchPlanTasks = [
			task("task-open", 1),
			task("task-1", 2, { accepted: true }),
			task("task-2", 3, { accepted: true }),
			task("task-3", 4, { accepted: true, dependsOnTaskIds: ["task-open"] }),
		];

		const result = applyTheoremBoundaryPolicy(state, report());

		expect(result.suggestedPrompt).toBe("Attempt the broad identity again.");
	});

	it("retries a boundary audit that failed under the wrong capability kind", () => {
		const state = createState();
		const failedBoundary = task("task-boundary", 4, {
			goal: `${THEOREM_BOUNDARY_CONSOLIDATION_MARKER}\nAudit the closed theorem boundary.`,
		});
		failedBoundary.kind = "computation";
		state.researchPlanTasks = [failedBoundary];

		const result = applyTheoremBoundaryPolicy(state, report());

		expect(result.suggestedPrompt).toContain("CAPABILITY-CORRECTED RETRY OF: task-boundary");
		expect(researchTaskKindForPath(state.researchPaths[0]!, result.suggestedPrompt)).toBe("proof-attempt");
	});

	it("retries one boundary proof that failed before review because it omitted the claim contract", () => {
		const state = createState();
		const failedBoundary = task("task-boundary", 4, {
			goal: `${THEOREM_BOUNDARY_CONSOLIDATION_MARKER}\nReport exactly: Theorem; Consolidated proof; Verdict.`,
		});
		failedBoundary.latestAttemptId = "attempt-boundary";
		failedBoundary.attemptIds = ["attempt-boundary"];
		state.researchPlanTasks = [failedBoundary];
		state.researchTaskAttempts = [
			{
				id: "attempt-boundary",
				taskId: failedBoundary.id,
				planId: "plan-1",
				attemptNumber: 1,
				status: "needs-revision",
				currentStage: "claim-validation",
				stages: [],
				computationArtifactIds: [],
				modelCalls: [],
				reviewFindings: [],
				failure: {
					stage: "claim-validation",
					code: "grounding-invalid",
					message: "Invalid specialist claim contract or exact grounding.",
					claimIds: ["claim-1"],
					retryable: false,
				},
				startedAt: NOW,
				updatedAt: NOW,
				completedAt: NOW,
			},
		];

		const result = applyTheoremBoundaryPolicy(state, report());

		expect(result.suggestedPrompt).toContain("CONTRACT-CORRECTED RETRY OF: task-boundary");
		expect(result.suggestedPrompt).toContain("In ## Claims");
		expect(result.suggestedPrompt).not.toContain("Report exactly:");
	});

	it("moves unresolved claims to an optional workstream after an accepted consolidation", () => {
		const state = createState();
		state.researchPlanTasks = [
			task("task-boundary", 4, {
				accepted: true,
				goal: `${THEOREM_BOUNDARY_CONSOLIDATION_MARKER}\nAudit the closed theorem boundary.`,
			}),
			task("task-optional", 5),
		];

		const result = applyTheoremBoundaryPolicy(state, report());

		expect(result.whatWeKnow.at(-1)).toContain("task-boundary is finalized");
		expect(result.suggestedPrompt).toContain(OPTIONAL_STRENGTHENING_MARKER);
		expect(result.suggestedPrompt).toContain("Do not reopen, weaken, or condition the finalized theorem");
	});

	it("does not repeatedly initialize the optional workstream", () => {
		const state = createState();
		state.researchPlanTasks = [
			task("task-boundary", 4, {
				accepted: true,
				goal: `${THEOREM_BOUNDARY_CONSOLIDATION_MARKER}\nAudit the closed theorem boundary.`,
			}),
			task("task-optional", 5, {
				goal: `${OPTIONAL_STRENGTHENING_MARKER}\nTreat this as a separate conjecture.`,
				status: "running",
			}),
		];

		const result = applyTheoremBoundaryPolicy(state, report());

		expect(result.suggestedPrompt).toBe("Attempt the broad identity again.");
		expect(result.whatWeKnow.at(-1)).toContain("claims outside that boundary are separate conjectures");
	});

	it("preserves a skeptic request to reissue a corrected theorem boundary", () => {
		const findings = extractStructuredReviewFindings(
			"attempt-boundary",
			"skeptic",
			[
				"## Verdict",
				"needs-revision",
				"## Concerns",
				"- The boundary convention is incomplete.",
				"## Unresolved certificates",
				"- [proof-attempt] Reissue the same theorem boundary with the explicit empty-case convention and complete dependency IDs.",
			].join("\n"),
		);

		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({ stage: "skeptic", kind: "proof-attempt" });
		expect(findings[0]?.statement).toContain("Reissue the same theorem boundary");
	});

	it("ranks theorem-boundary control ahead of an ordinary critic repair", () => {
		const ordered = rankCoordinatorMovesForAutonomousExecution({
			suggestedPathId: "path-1",
			recommendedNextMoves: [
				{
					title: "Repair an older computation",
					pathId: "path-1",
					rationale: "The critic requested another finite witness.",
					prompt: "CRITIC-DRIVEN REPAIR\nCompute one missing finite certificate.",
					priority: "high",
				},
				{
					title: "Separate optional strengthening",
					pathId: "path-1",
					rationale: "The accepted theorem boundary must remain finalized.",
					prompt: `${OPTIONAL_STRENGTHENING_MARKER}\nState one separate conjecture.`,
					priority: "high",
				},
			],
		});

		expect(ordered[0]?.prompt).toContain(OPTIONAL_STRENGTHENING_MARKER);
	});
});
