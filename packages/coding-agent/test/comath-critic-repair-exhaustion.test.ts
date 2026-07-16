import { describe, expect, it } from "vitest";
import { runResearchCoordinatorSynthesis } from "../src/modes/comath/comath-coordinator-synthesis.ts";
import {
	deriveCriticRepairNeed,
	extractStructuredReviewFindings,
} from "../src/modes/comath/comath-critic-repair-policy.ts";
import type {
	CoMathProjectState,
	ResearchPlanTaskRecord,
	ResearchTaskAttemptRecord,
} from "../src/modes/comath/schema.ts";
import { createEmptyProjectState } from "../src/modes/comath/storage.ts";

const NOW = "2026-07-16T00:00:00.000Z";

function repairDirective(sourceAttemptId: string, certificate: string): string {
	return [
		"CRITIC-DRIVEN REPAIR",
		`SOURCE ATTEMPT: ${sourceAttemptId}`,
		"TASK KIND: proof-attempt",
		"SCOPE: Produce exactly one missing certificate from the independent review.",
		"CERTIFICATE:",
		certificate,
		"ACCEPTANCE CRITERIA:",
		`- Establish exactly this missing certificate: ${certificate}`,
		"NON-GOALS:",
		"- Do not claim the parent theorem.",
	].join("\n");
}

function task(id: string, sequence: number, attemptId: string, goal?: string): ResearchPlanTaskRecord {
	return {
		id,
		planId: "plan-1",
		kind: "proof-attempt",
		status: "blocked",
		sequence,
		title: `Task ${sequence}`,
		description: "Establish the requested certificate.",
		...(goal ? { goal } : {}),
		acceptanceCriteria: ["Establish the requested certificate."],
		dependsOnTaskIds: [],
		requiredCapabilities: ["independent-review"],
		attemptIds: [attemptId],
		latestAttemptId: attemptId,
		pathId: "path-1",
		sourceIds: [],
		claimSupportIds: [],
		computationalArtifactIds: [],
		evidenceEntryIds: [],
		reviewOutcome: "needs-revision",
		createdAt: NOW,
		updatedAt: NOW,
	};
}

function attempt(id: string, taskId: string, findingId: string): ResearchTaskAttemptRecord {
	return {
		id,
		taskId,
		planId: "plan-1",
		attemptNumber: 1,
		status: "needs-revision",
		currentStage: "skeptic",
		stages: [],
		computationArtifactIds: [],
		modelCalls: [],
		reviewFindings: [
			{
				id: findingId,
				stage: "critic",
				kind: "proof-attempt",
				statement: "Supply the exact missing theorem and proof certificate.",
				acceptanceCriteria: ["Supply the exact missing theorem and proof certificate."],
			},
		],
		startedAt: NOW,
		updatedAt: NOW,
		completedAt: NOW,
	};
}

describe("co-math critic repair exhaustion", () => {
	it("does not create a third failed repair descendant for one certificate lineage", () => {
		const state: CoMathProjectState = createEmptyProjectState({
			projectId: "repair-exhaustion",
			title: "Repair exhaustion",
			rootQuestion: "Establish the main theorem.",
			now: NOW,
		});
		const rootTask = task("task-root", 1, "attempt-root");
		const firstRepair = task(
			"task-repair-1",
			2,
			"attempt-repair-1",
			repairDirective("attempt-root", "Supply the exact missing theorem."),
		);
		const secondRepair = task(
			"task-repair-2",
			3,
			"attempt-repair-2",
			repairDirective("attempt-repair-1", "Supply the exact missing theorem and its durable locator."),
		);
		state.researchPlanTasks = [rootTask, firstRepair, secondRepair];
		state.researchTaskAttempts = [
			attempt("attempt-root", rootTask.id, "finding-root"),
			attempt("attempt-repair-1", firstRepair.id, "finding-repair-1"),
			attempt("attempt-repair-2", secondRepair.id, "finding-repair-2"),
		];
		const reviewContext = [
			"NON-ACCEPTED ATTEMPT attempt-repair-2",
			"CRITIC",
			"## Required revisions",
			"- Supply the exact missing theorem and proof certificate.",
		].join("\n");

		expect(deriveCriticRepairNeed(state, reviewContext)).toBeUndefined();
	});

	it("exhausts an artifactless computation lineage after a non-retryable execution failure", () => {
		const state: CoMathProjectState = createEmptyProjectState({
			projectId: "computation-repair-exhaustion",
			title: "Computation repair exhaustion",
			rootQuestion: "Compute the exact matrices.",
			now: NOW,
		});
		const rootTask = task("computation-root", 1, "computation-attempt-root");
		const firstRepair = task(
			"computation-repair-1",
			2,
			"computation-attempt-1",
			repairDirective("computation-attempt-root", "Compute and persist the exact matrix artifact.").replace(
				"TASK KIND: proof-attempt",
				"TASK KIND: computation",
			),
		);
		const secondRepair = task(
			"computation-repair-2",
			3,
			"computation-attempt-2",
			repairDirective("computation-attempt-1", "Verify every matrix and Smith-form rank.").replace(
				"TASK KIND: proof-attempt",
				"TASK KIND: computation",
			),
		);
		const rootAttempt = attempt("computation-attempt-root", rootTask.id, "computation-finding-root");
		rootAttempt.failure = {
			stage: "capability-validation",
			code: "computation-timeout",
			message: "The exact computation timed out without an artifact.",
			claimIds: [],
			retryable: false,
		};
		state.researchPlanTasks = [rootTask, firstRepair, secondRepair];
		state.researchTaskAttempts = [
			rootAttempt,
			attempt("computation-attempt-1", firstRepair.id, "computation-finding-1"),
			attempt("computation-attempt-2", secondRepair.id, "computation-finding-2"),
		];
		const reviewContext = [
			"NON-ACCEPTED ATTEMPT computation-attempt-2",
			"CRITIC",
			"## Required revisions",
			"- Provide the exact matrix and Smith-form computation certificate.",
		].join("\n");

		expect(deriveCriticRepairNeed(state, reviewContext)).toBeUndefined();
	});

	it("classifies a proof certificate from a computation parent as a proof repair", () => {
		const state: CoMathProjectState = createEmptyProjectState({
			projectId: "proof-from-computation",
			title: "Block lemma",
			rootQuestion: "Derive an exact matrix certificate.",
			now: NOW,
		});
		const rootTask = task("block-root", 1, "block-attempt-root");
		const computationTask = task(
			"block-computation",
			2,
			"block-attempt-computation",
			repairDirective("block-attempt-root", "Compute the exact matrix blocks.").replace(
				"TASK KIND: proof-attempt",
				"TASK KIND: computation",
			),
		);
		const rootAttempt = attempt("block-attempt-root", rootTask.id, "block-finding-root");
		const computationAttempt = attempt("block-attempt-computation", computationTask.id, "block-finding-proof");
		computationAttempt.reviewFindings = [
			{
				id: "block-finding-proof",
				stage: "critic",
				kind: "proof-attempt",
				statement: "Prove the block lemma identifying the complete row lattice.",
				acceptanceCriteria: ["Prove the block lemma over the integers."],
			},
		];
		state.researchPlanTasks = [rootTask, computationTask];
		state.researchTaskAttempts = [rootAttempt, computationAttempt];
		const reviewContext = [
			"NON-ACCEPTED ATTEMPT block-attempt-computation",
			"CRITIC",
			"## Required revisions",
			"- Prove the block lemma identifying the complete row lattice.",
		].join("\n");

		const need = deriveCriticRepairNeed(state, reviewContext);
		expect(need?.kind).toBe("proof-attempt");
		expect(need?.directive).toContain("TASK KIND: proof-attempt");
	});

	it("does not classify symbolic enumeration of inequalities as computation", () => {
		const findings = extractStructuredReviewFindings(
			"admissibility-attempt",
			"critic",
			[
				"## Required revisions",
				"- Enumerate and prove every admissibility inequality, containment lemma, and boundary case.",
			].join("\n"),
		);

		expect(findings).toHaveLength(1);
		expect(findings[0]?.kind).toBe("proof-attempt");
	});

	it("classifies a Smith-form literature query as source refresh", () => {
		const findings = extractStructuredReviewFindings(
			"smith-literature-attempt",
			"critic",
			[
				"## Required revisions",
				"- Search the external mathematical literature for a Smith normal form theorem and provide exact source citations.",
			].join("\n"),
		);

		expect(findings).toHaveLength(1);
		expect(findings[0]?.kind).toBe("source-refresh");
	});

	it("does not repair a blocked literature task", () => {
		const state: CoMathProjectState = createEmptyProjectState({
			projectId: "blocked-literature-repair",
			title: "Blocked literature repair",
			rootQuestion: "Continue the proof.",
			now: NOW,
		});
		const sourceTask = task("blocked-literature-task", 1, "blocked-literature-attempt");
		sourceTask.kind = "literature-search";
		sourceTask.description = "Search the literature route that is blocked and non-retryable.";
		const sourceAttempt = attempt("blocked-literature-attempt", sourceTask.id, "blocked-literature-finding");
		sourceAttempt.reviewFindings = [
			{
				id: "blocked-literature-finding",
				stage: "critic",
				kind: "source-refresh",
				statement: "Search the external mathematical literature and provide exact source citations.",
				acceptanceCriteria: ["Provide exact source citations."],
			},
		];
		state.researchPlanTasks = [sourceTask];
		state.researchTaskAttempts = [sourceAttempt];
		const reviewContext = [
			"NON-ACCEPTED ATTEMPT blocked-literature-attempt",
			"CRITIC",
			"## Required revisions",
			"- Search the external mathematical literature and provide exact source citations.",
		].join("\n");

		expect(deriveCriticRepairNeed(state, reviewContext)).toBeUndefined();
	});

	it("preserves a repeated audit repair but schedules a high-information experiment first", async () => {
		const state: CoMathProjectState = createEmptyProjectState({
			projectId: "audit-opportunity-cost",
			title: "Audit opportunity cost",
			rootQuestion: "Establish the general conjecture.",
			now: NOW,
		});
		state.researchPaths = [
			{
				id: "path-1",
				title: "Small examples and counterexamples",
				objective: "Use exact finite computation to identify the next structural lemma.",
				status: "promising",
				latestFindings: [],
				blockers: [],
				suggestedNextMove: "Compute the smallest untested case.",
				priority: 1,
				createdAt: NOW,
				updatedAt: NOW,
			},
		];
		const rootTask = task("audit-root", 1, "audit-attempt-root");
		const repairTask = task(
			"audit-repair",
			2,
			"audit-attempt-repair",
			repairDirective(
				"audit-attempt-root",
				"Persist the exact query audit, occurrence counts, resolver manifest, and SHA-256 digests.",
			).replace("TASK KIND: proof-attempt", "TASK KIND: computation"),
		);
		const repairAttempt = attempt("audit-attempt-repair", repairTask.id, "audit-finding-repair");
		repairAttempt.reviewFindings = [
			{
				id: "audit-finding-repair",
				stage: "critic",
				kind: "computation",
				statement: "Persist the exact query audit, occurrence counts, resolver manifest, and SHA-256 digests.",
				acceptanceCriteria: ["Persist the exact audit outputs and stable digests."],
			},
		];
		state.researchPlanTasks = [rootTask, repairTask];
		state.researchTaskAttempts = [attempt("audit-attempt-root", rootTask.id, "audit-finding-root"), repairAttempt];
		const reviewContext = [
			"NON-ACCEPTED ATTEMPT audit-attempt-repair",
			"CRITIC",
			"## Required revisions",
			"- Persist the exact query audit, occurrence counts, resolver manifest, and SHA-256 digests.",
		].join("\n");

		const result = await runResearchCoordinatorSynthesis({
			state,
			now: NOW,
			acceptedProjectContext: "- A smaller exact case is already accepted.",
			recentTaskReviewContext: reviewContext,
		});

		expect(result.report.recommendedNextMoves[0]?.title).toContain("smallest untested");
		expect(result.report.recommendedNextMoves[0]?.prompt).toContain("expected information gain");
		expect(result.report.recommendedNextMoves[1]?.prompt).toContain("CRITIC-DRIVEN REPAIR");
		expect(result.report.recommendedNextMoves[1]?.priority).toBe("medium");
		expect(result.report.suggestedPrompt).toBe(result.report.recommendedNextMoves[0]?.prompt);

		const secondRepair = task(
			"audit-repair-2",
			3,
			"audit-attempt-repair-2",
			repairDirective(
				"audit-attempt-repair",
				"Persist the exact query audit, occurrence counts, resolver manifest, and SHA-256 digests.",
			).replace("TASK KIND: proof-attempt", "TASK KIND: computation"),
		);
		state.researchPlanTasks.push(secondRepair);
		state.researchTaskAttempts.push(attempt("audit-attempt-repair-2", secondRepair.id, "audit-finding-repair-2"));
		const exhaustedResult = await runResearchCoordinatorSynthesis({
			state,
			now: NOW,
			executor: {
				run: async () => ({
					text: [
						"## What we know",
						"- One smaller exact case is accepted.",
						"## Roadblocks",
						"- The general theorem remains open.",
						"## Recommended next moves",
						"- Execute the persisted-source audit and resolver manifest with all occurrence counts and digests.",
						"- Compute the smallest untested case.",
						"## Suggested next step",
						"- Execute the persisted-source audit and resolver manifest with all occurrence counts and digests.",
					].join("\n"),
				}),
			},
		});

		expect(exhaustedResult.report.recommendedNextMoves[0]?.title).toContain("smallest untested");
		expect(exhaustedResult.report.recommendedNextMoves[1]?.title).toContain("persisted-source audit");
		expect(exhaustedResult.report.recommendedNextMoves[1]?.priority).toBe("medium");
		expect(exhaustedResult.report.suggestedPrompt).toContain("expected information gain");

		const computationRepairResult = await runResearchCoordinatorSynthesis({
			state,
			now: NOW,
			executor: {
				run: async () => ({
					text: [
						"## What we know",
						"- The exact finite case has a provisional matrix computation.",
						"## Roadblocks",
						"- Its canonical computation payload is missing.",
						"## Recommended next moves",
						"- CRITIC-DRIVEN REPAIR SOURCE ATTEMPT: attempt-matrix Persist the canonical computation artifact payload with ordered matrices and a stable digest for the current exact case.",
						"- Compute a different finite case.",
						"## Suggested next step",
						"- CRITIC-DRIVEN REPAIR SOURCE ATTEMPT: attempt-matrix Persist the canonical computation artifact payload with ordered matrices and a stable digest for the current exact case.",
					].join("\n"),
				}),
			},
		});

		expect(computationRepairResult.report.recommendedNextMoves[0]?.title).toContain("CRITIC-DRIVEN REPAIR");
		expect(computationRepairResult.report.recommendedNextMoves[0]?.title).not.toContain("smallest untested");

		const genericGoal = [
			"Run one bounded exact mathematical experiment on the smallest untested case relevant to the active conjecture.",
			"Choose the case and invariant by expected information gain, not ease of presentation.",
			"Persist exact inputs, executable code, outputs, and stable digests.",
		].join(" ");
		const genericTask = task("generic-experiment", 5, "generic-experiment-attempt", genericGoal);
		genericTask.kind = "computation";
		const genericAttempt = attempt("generic-experiment-attempt", genericTask.id, "generic-experiment-finding");
		genericAttempt.reviewFindings = [
			{
				id: "generic-experiment-finding",
				stage: "critic",
				kind: "computation",
				statement: genericGoal,
				acceptanceCriteria: ["Persist one replayable exact computation artifact."],
			},
		];
		state.researchPlanTasks.push(genericTask);
		state.researchTaskAttempts.push(genericAttempt);
		const genericReviewContext = [
			"NON-ACCEPTED ATTEMPT generic-experiment-attempt",
			"CRITIC",
			"## Required revisions",
			`- ${genericGoal}`,
		].join("\n");
		const scopedReplacementResult = await runResearchCoordinatorSynthesis({
			state,
			now: NOW,
			recentTaskReviewContext: genericReviewContext,
			executor: {
				run: async () => ({
					text: [
						"## What we know",
						"- A provisional finite computation selected one exact case.",
						"## Roadblocks",
						"- Replayable matrix witnesses are missing.",
						"## Recommended next moves",
						`- ${genericGoal}`,
						"- Execute the selected exact finite case with complete matrices and replay-verified Smith witnesses.",
						"## Suggested next step",
						`- ${genericGoal}`,
					].join("\n"),
				}),
			},
		});

		expect(scopedReplacementResult.report.recommendedNextMoves[0]?.title).toContain("selected exact finite case");
		expect(scopedReplacementResult.report.recommendedNextMoves[0]?.title).toContain("replay-verified");
		expect(scopedReplacementResult.report.recommendedNextMoves[1]?.priority).toBe("medium");
		expect(scopedReplacementResult.report.suggestedPrompt).not.toContain("smallest untested case");

		const concreteRepairGoal = [
			genericGoal,
			"CORRECTION REQUIRED IN THE REPLACEMENT OUTPUT:",
			"Execute the selected case with parameters (a,b,c)=(2,3,4), input=[2,2,0,0], and degrees=[4,5,6].",
		].join("\n");
		genericAttempt.reviewFindings[0]!.statement = concreteRepairGoal;
		genericAttempt.reviewFindings[0]!.acceptanceCriteria = ["Persist the specified exact computation."];
		const concreteRepairResult = await runResearchCoordinatorSynthesis({
			state,
			now: NOW,
			recentTaskReviewContext: genericReviewContext,
			executor: {
				run: async () => ({
					text: [
						"## What we know",
						"- One smaller finite case is accepted.",
						"## Roadblocks",
						"- The concrete corrected case is untested.",
						"## Recommended next moves",
						"- Compare a neighboring finite case.",
						"## Suggested next step",
						"- Compare a neighboring finite case.",
					].join("\n"),
				}),
			},
		});

		expect(concreteRepairResult.report.recommendedNextMoves[0]?.prompt).toContain("(a,b,c)=(2,3,4)");
		expect(concreteRepairResult.report.suggestedPrompt).toContain("input=[2,2,0,0]");
	});

	it("makes a substantive coordinator move executable without an explicit path label", async () => {
		const state = createEmptyProjectState({
			projectId: "pathless-concrete-move",
			title: "Pathless concrete move",
			rootQuestion: "Establish the exact finite certificate.",
			now: NOW,
		});
		state.researchPaths = [
			{
				id: "path-1",
				title: "Finite cases",
				objective: "Compute exact finite witnesses.",
				status: "active",
				latestFindings: [],
				blockers: [],
				suggestedNextMove: "Compute the next exact case.",
				priority: 1,
				createdAt: NOW,
				updatedAt: NOW,
			},
		];

		const result = await runResearchCoordinatorSynthesis({
			state,
			now: NOW,
			executor: {
				run: async () => ({
					text: [
						"## What we know",
						"- The smaller case is accepted.",
						"## Roadblocks",
						"- The next exact witness is missing.",
						"## Recommended next moves",
						"- Continue Path 1.",
						"- Execute the exact missing certificate with augmented matrices, unit rows, and determinant witnesses.",
						"## Suggested next step",
						"- Continue Path 1.",
					].join("\n"),
				}),
			},
		});

		const concreteMove = result.report.recommendedNextMoves.find((move) =>
			move.title.includes("exact missing certificate"),
		);
		expect(concreteMove?.prompt).toContain("augmented matrices");
		expect(concreteMove?.prompt).toContain("determinant witnesses");
		expect(concreteMove?.pathId).toBeUndefined();
		expect(result.report.recommendedNextMoves[0]).toBe(concreteMove);
		expect(result.report.suggestedPrompt).toBe(concreteMove?.prompt);
		expect(result.report.suggestedPathId).toBeUndefined();
	});

	it("turns accepted computations into theory and pivots after repeated failed derivations", async () => {
		const state = createEmptyProjectState({
			projectId: "computation-to-theory",
			title: "Computation to theory",
			rootQuestion: "Find and prove the governing structure.",
			now: NOW,
		});
		const computedTask = task("computed-case", 1, "computed-attempt", "Compute one exact finite case.");
		computedTask.kind = "computation";
		computedTask.status = "completed";
		computedTask.reviewOutcome = "accepted";
		computedTask.acceptedAttemptId = "computed-attempt";
		const computedAttempt = attempt("computed-attempt", computedTask.id, "unused-finding");
		computedAttempt.status = "accepted";
		computedAttempt.reviewFindings = [];
		computedAttempt.computationArtifactIds = ["accepted-computation-artifact"];
		state.researchPlanTasks.push(computedTask);
		state.researchTaskAttempts.push(computedAttempt);

		const synthesis = await runResearchCoordinatorSynthesis({
			state,
			now: NOW,
			recentTaskReviewContext: "",
			executor: {
				run: async () => ({
					text: [
						"## What we know",
						"- One exact case is accepted.",
						"## Roadblocks",
						"- The general mechanism is unknown.",
						"## Recommended next moves",
						"- Compute the next larger matrix case.",
						"## Suggested next step",
						"- Compute the next larger matrix case.",
					].join("\n"),
				}),
			},
		});
		expect(synthesis.report.suggestedPrompt).toContain("COMPUTATION-TO-THEORY SYNTHESIS");
		expect(synthesis.report.suggestedPrompt).toContain("accepted-computation-artifact");

		for (let sequence = 2; sequence <= 3; sequence += 1) {
			const failedTask = task(
				`failed-theory-${sequence}`,
				sequence,
				`failed-theory-attempt-${sequence}`,
				"Prove a structural identity explaining the accepted computation.",
			);
			failedTask.kind = "proof-attempt";
			const failedAttempt = attempt(
				`failed-theory-attempt-${sequence}`,
				failedTask.id,
				`failed-theory-finding-${sequence}`,
			);
			state.researchPlanTasks.push(failedTask);
			state.researchTaskAttempts.push(failedAttempt);
		}
		const pivot = await runResearchCoordinatorSynthesis({
			state,
			now: NOW,
			recentTaskReviewContext: "",
			executor: {
				run: async () => ({
					text: [
						"## What we know",
						"- The finite result remains accepted.",
						"## Roadblocks",
						"- Two direct derivations failed review.",
						"## Recommended next moves",
						"- Compute all remaining certificate matrices.",
						"## Suggested next step",
						"- Compute all remaining certificate matrices.",
					].join("\n"),
				}),
			},
		});
		expect(pivot.report.suggestedPrompt).toContain("STRATEGY PIVOT AFTER EXPENSIVE COMPUTATION");
		expect(pivot.report.suggestedPrompt).toContain("do not rerun the full computation");

		const failedPivotTask = task(
			"failed-pivot",
			4,
			"failed-pivot-attempt",
			"STRATEGY PIVOT AFTER EXPENSIVE COMPUTATION\nProve one smaller reusable lemma.",
		);
		failedPivotTask.kind = "proof-attempt";
		state.researchPlanTasks.push(failedPivotTask);
		state.researchTaskAttempts.push(attempt("failed-pivot-attempt", failedPivotTask.id, "failed-pivot-finding"));
		const alternate = await runResearchCoordinatorSynthesis({
			state,
			now: NOW,
			recentTaskReviewContext: "",
			executor: {
				run: async () => ({
					text: [
						"## What we know",
						"- The finite result remains accepted.",
						"## Roadblocks",
						"- The first symbolic pivot failed review.",
						"## Recommended next moves",
						"- CRITIC-DRIVEN REPAIR: prove all ten explicit identities.",
						"- Prove a standalone degree-symmetry lemma using rectangle complementation.",
						"## Suggested next step",
						"- CRITIC-DRIVEN REPAIR: prove all ten explicit identities.",
					].join("\n"),
				}),
			},
		});
		expect(alternate.report.suggestedPrompt).toContain("degree-symmetry lemma");
		expect(alternate.report.suggestedPrompt).not.toContain("STRATEGY PIVOT AFTER EXPENSIVE COMPUTATION");
	});
});
