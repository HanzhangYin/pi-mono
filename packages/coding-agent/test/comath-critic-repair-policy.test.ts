import { describe, expect, it } from "vitest";
import { runResearchCoordinatorSynthesis } from "../src/modes/comath/comath-coordinator-synthesis.ts";
import {
	deriveCriticRepairNeed,
	extractStructuredReviewFindings,
	parseCriticRepairDirective,
} from "../src/modes/comath/comath-critic-repair-policy.ts";
import type {
	CoMathProjectState,
	ResearchPlanTaskRecord,
	ResearchTaskAttemptRecord,
} from "../src/modes/comath/schema.ts";
import { createEmptyProjectState } from "../src/modes/comath/storage.ts";

const NOW = "2026-07-15T02:00:00.000Z";
const ATTEMPT_ID = "research-attempt-task-45-1";

function createState(): CoMathProjectState {
	const state = createEmptyProjectState({
		projectId: "critic-repair",
		title: "Current conjecture",
		rootQuestion: "Prove the current conjecture.",
		now: NOW,
	});
	const task: ResearchPlanTaskRecord = {
		id: "task-45",
		planId: "plan-1",
		kind: "proof-attempt",
		status: "blocked",
		sequence: 45,
		title: "Uniform elimination theorem",
		description: "Prove elimination and saturation in all degrees.",
		acceptanceCriteria: ["Prove the global theorem."],
		dependsOnTaskIds: [],
		requiredCapabilities: ["independent-review"],
		attemptIds: [ATTEMPT_ID],
		latestAttemptId: ATTEMPT_ID,
		pathId: "path-5",
		sourceIds: [],
		claimSupportIds: [],
		computationalArtifactIds: [],
		evidenceEntryIds: [],
		reviewOutcome: "needs-revision",
		createdAt: NOW,
		updatedAt: NOW,
	};
	const attempt: ResearchTaskAttemptRecord = {
		id: ATTEMPT_ID,
		taskId: task.id,
		planId: task.planId,
		attemptNumber: 1,
		status: "needs-revision",
		currentStage: "skeptic",
		stages: [],
		computationArtifactIds: [],
		modelCalls: [],
		startedAt: NOW,
		updatedAt: NOW,
		completedAt: NOW,
	};
	return {
		...state,
		researchPaths: [
			{
				id: "path-5",
				title: "Known theorem or literature reduction",
				objective: "Prove a uniform special case.",
				status: "active",
				latestFindings: [],
				blockers: [],
				suggestedNextMove: "Repair the proof.",
				priority: 1,
				createdAt: NOW,
				updatedAt: NOW,
			},
		],
		researchPlanTasks: [task],
		researchTaskAttempts: [attempt],
	};
}

const REVIEW = [
	`NON-ACCEPTED ATTEMPT ${ATTEMPT_ID}`,
	"TASK Uniform elimination theorem: Prove elimination and saturation in all degrees.",
	"CRITIC",
	"## Required revisions",
	"- Prove the completeness of the columns and Pieri rows in degrees d+1 and d+2.",
	"- Display the three complementary pivot matrices and their determinants 1, 1, -1.",
	"- Add the graded-kernel argument proving the global isomorphism.",
	"SKEPTIC",
	"## Concerns",
	"- The global elimination order is not constructed.",
].join("\n");

describe("co-math critic-driven repair policy", () => {
	it("normalizes reviewer certificates into stable structured findings", () => {
		const findings = extractStructuredReviewFindings(
			ATTEMPT_ID,
			"critic",
			"## Critique\n- claim-1 is incomplete.\n\n## Repair certificates\n- [proof-attempt] Display a unimodular minor and prove its determinant is one.\n- [source-refresh] Provide the exact missing theorem hypotheses from an indexed source.\n- [computation] Supply invariant factors for the displayed integer matrix.",
		);
		expect(findings).toHaveLength(3);
		expect(findings[0]).toMatchObject({ stage: "critic", kind: "proof-attempt" });
		expect(findings[0]?.id).toMatch(/^review-finding-[a-f0-9]{16}$/);
		expect(findings[1]).toMatchObject({ stage: "critic", kind: "source-refresh" });
		expect(findings[2]).toMatchObject({ stage: "critic", kind: "computation" });
		expect(
			parseCriticRepairDirective(
				"CRITIC-DRIVEN REPAIR\nSOURCE ATTEMPT: attempt-1\nTASK KIND: computation\nCERTIFICATE:\nSupply invariant factors.\nACCEPTANCE CRITERIA:\n- Display the exact values.\nNON-GOALS:\n- Do not broaden the task.",
			)?.kind,
		).toBe("computation");
	});

	it("does not turn an accepted skeptic explanation into an unresolved repair finding", () => {
		const findings = extractStructuredReviewFindings(
			ATTEMPT_ID,
			"skeptic",
			"## Verdict\naccepted\n\n## Concerns\n- The requested kernel identity follows from the displayed graded isomorphisms.",
		);
		expect(findings).toEqual([]);
	});

	it("prefers executable repair certificates over negative reviewer admonitions", () => {
		const findings = extractStructuredReviewFindings(
			ATTEMPT_ID,
			"critic",
			"## Critique\n- The bounded target is not established.\n\n## Repair certificates\n- [computation] Execute a fresh standalone program that prints every Smith witness matrix and verifies the determinant identities.\n\n## Required revisions\n- Do not describe Smith witnesses or determinants as emitted when they are absent.",
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({
			kind: "computation",
			statement:
				"Execute a fresh standalone program that prints every Smith witness matrix and verifies the determinant identities.",
		});
		expect(findings[0]?.statement).not.toContain("Provide do not");
	});

	it("prefers a ring-map proof certificate over audit-status diagnostics", () => {
		const findings = extractStructuredReviewFindings(
			ATTEMPT_ID,
			"skeptic",
			"## Verdict\nneeds-revision\n\n## Concerns\n- The audit therefore must stop at claim-3. The requested target was not established.\n\n## Unresolved certificates\n- [proof-attempt] Establish claim-3 exactly: prove that partition conjugation is a graded integral ring involution, then prove the quotient map is well-defined, including integrality and boundary cases.",
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({
			kind: "proof-attempt",
			statement:
				"Establish claim-3 exactly: prove that partition conjugation is a graded integral ring involution, then prove the quotient map is well-defined, including integrality and boundary cases.",
		});
	});

	it("does not schedule a critic statement that says no repair is required", () => {
		const state = createState();
		state.researchTaskAttempts[0]!.reviewFindings = [
			{
				id: "review-finding-resolved",
				stage: "critic",
				kind: "source-refresh",
				statement: "No mathematical repair is required. The requested target is established.",
				acceptanceCriteria: ["Preserve the established result."],
			},
		];
		expect(
			deriveCriticRepairNeed(
				state,
				`NON-ACCEPTED ATTEMPT ${ATTEMPT_ID}\nTASK Audit theorem.\nCRITIC\n## Required revisions\n- No mathematical repair is required. The requested target is established.`,
			),
		).toBeUndefined();
		expect(
			extractStructuredReviewFindings(
				ATTEMPT_ID,
				"critic",
				"## Required revisions\n- No mathematical repair is required. The requested target is established.\n- The requested quotient-conjugation target was established; no repair certificate is required.",
			),
		).toEqual([]);
	});

	it("classifies untagged full-text and indexed-passage repairs as source refreshes", () => {
		const findings = extractStructuredReviewFindings(
			ATTEMPT_ID,
			"skeptic",
			"## Verdict\nneeds-revision\n\n## Unresolved certificates\n- Ingest a verifiable full-text source and provide indexed theorem passages with exact hypotheses.",
		);
		expect(findings[0]?.kind).toBe("source-refresh");
		expect(findings[0]?.acceptanceCriteria[1]).toContain("stable locators");
	});

	it("turns declarative missingness findings into production obligations", () => {
		const findings = extractStructuredReviewFindings(
			ATTEMPT_ID,
			"critic",
			"## Repair certificates\n- [computation] Complete labelled rows, ordered bases, and exact Smith forms are therefore missing for degrees 26 through 32.",
		);
		expect(findings[0]?.statement).toBe(
			"Provide complete labelled rows, ordered bases, and exact Smith forms for degrees 26 through 32.",
		);
		expect(findings[0]?.acceptanceCriteria[0]).toContain("Provide complete labelled rows");
	});

	it("prioritizes a terminal capability failure over earlier reviewer refinements", () => {
		const state = createState();
		state.researchTaskAttempts[0]!.reviewFindings = [
			{
				id: "review-finding-critic",
				stage: "critic",
				kind: "proof-attempt",
				statement: "Restate all notation used by the otherwise correct matrix argument.",
				acceptanceCriteria: ["Restate the notation."],
			},
			{
				id: "review-finding-capability",
				stage: "capability-validation",
				kind: "computation",
				statement: "Provide a task-owned sandbox computation artifact with exact inputs and outputs.",
				acceptanceCriteria: ["Persist the computation artifact."],
			},
		];

		const need = deriveCriticRepairNeed(state, REVIEW);
		expect(need?.findingId).toBe("review-finding-capability");
		expect(need?.kind).toBe("computation");
	});

	it("repairs a substantive proof defect before a mismatched computation capability", () => {
		const state = createState();
		state.researchPlanTasks[0]!.goal =
			"Prove a graded quotient isomorphism and explain how it transfers accepted computations.";
		state.researchTaskAttempts[0]!.reviewFindings = [
			{
				id: "review-finding-capability",
				stage: "capability-validation",
				kind: "computation",
				statement: "Provide a task-owned sandbox computation artifact with exact inputs and outputs.",
				acceptanceCriteria: ["Persist the computation artifact."],
			},
			{
				id: "review-finding-proof-domain",
				stage: "critic",
				kind: "proof-attempt",
				statement:
					"Replace the right-hand positive-degree ideal by the ideal in the codomain and prove that the map is well-defined.",
				acceptanceCriteria: ["Define both ideals and verify the induced quotient map."],
			},
		];

		const need = deriveCriticRepairNeed(state, REVIEW);
		expect(need?.findingId).toBe("review-finding-proof-domain");
		expect(need?.kind).toBe("proof-attempt");
	});

	it("recovers an unscheduled substantive sibling after another finding was scheduled", () => {
		const state = createState();
		state.researchPlanTasks[0]!.goal = "Prove that a graded quotient map is an isomorphism.";
		state.researchTaskAttempts[0]!.reviewFindings = [
			{
				id: "review-finding-capability",
				stage: "capability-validation",
				kind: "computation",
				statement: "Provide a task-owned sandbox computation artifact.",
				acceptanceCriteria: ["Persist the artifact."],
			},
			{
				id: "review-finding-proof-domain",
				stage: "critic",
				kind: "proof-attempt",
				statement: "Define the codomain ideal and verify that the quotient map is well-defined.",
				acceptanceCriteria: ["Verify the induced quotient map."],
			},
		];
		state.researchPlanTasks.push({
			...state.researchPlanTasks[0]!,
			id: "task-46",
			sequence: 46,
			status: "pending",
			goal: [
				"CRITIC-DRIVEN REPAIR",
				`SOURCE ATTEMPT: ${ATTEMPT_ID}`,
				"REPAIR FINDING: review-finding-capability",
				"TASK KIND: computation",
				"CERTIFICATE:",
				"Provide a task-owned sandbox computation artifact.",
				"ACCEPTANCE CRITERIA:",
				"- Persist the artifact.",
				"NON-GOALS:",
				"- Do not broaden the task.",
			].join("\n"),
			attemptIds: [],
			latestAttemptId: undefined,
		});
		const olderTask: ResearchPlanTaskRecord = {
			...state.researchPlanTasks[0]!,
			id: "task-44",
			sequence: 44,
			attemptIds: ["attempt-44"],
			latestAttemptId: "attempt-44",
		};
		state.researchPlanTasks.push(olderTask, {
			...olderTask,
			id: "task-older-repair",
			sequence: 47,
			status: "pending",
			goal: [
				"CRITIC-DRIVEN REPAIR",
				"SOURCE ATTEMPT: attempt-44",
				"REPAIR FINDING: review-finding-older-capability",
				"TASK KIND: computation",
				"CERTIFICATE:",
				"Provide an exact artifact.",
				"ACCEPTANCE CRITERIA:",
				"- Persist the artifact.",
				"NON-GOALS:",
				"- Do not broaden the task.",
			].join("\n"),
			attemptIds: [],
			latestAttemptId: undefined,
		});
		state.researchTaskAttempts.push({
			...state.researchTaskAttempts[0]!,
			id: "attempt-44",
			taskId: olderTask.id,
			reviewFindings: [
				{
					id: "review-finding-older-capability",
					stage: "capability-validation",
					kind: "computation",
					statement: "Provide an exact artifact.",
					acceptanceCriteria: ["Persist the artifact."],
				},
				{
					id: "review-finding-older-proof",
					stage: "critic",
					kind: "proof-attempt",
					statement: "Define the older codomain ideal and verify its quotient map.",
					acceptanceCriteria: ["Verify the older quotient map."],
				},
			],
		});

		const need = deriveCriticRepairNeed(state, REVIEW.replaceAll(ATTEMPT_ID, "research-attempt-unrelated"));
		expect(need?.findingId).toBe("review-finding-proof-domain");
		expect(need?.kind).toBe("proof-attempt");
	});

	it("routes a generic proof finding through its explicitly required specialized capability", () => {
		const state = createState();
		state.researchTaskAttempts[0]!.reviewFindings = [
			{
				id: "review-finding-exact-computation",
				stage: "skeptic",
				kind: "proof-attempt",
				statement: "Execute an exact task-owned computation and provide every Smith diagonal and quotient rank.",
				acceptanceCriteria: ["Persist the exact computation artifact."],
			},
		];

		const need = deriveCriticRepairNeed(state, REVIEW);
		expect(need?.kind).toBe("computation");
		expect(need?.directive).toContain("TASK KIND: computation");
	});

	it("keeps executable matrix defects on the computation path despite source-labelled rows", () => {
		const state = createState();
		state.researchTaskAttempts[0]!.reviewFindings = [
			{
				id: "review-finding-zero-row",
				stage: "skeptic",
				kind: "source-refresh",
				statement: "The executable code omitted a source-labelled Pieri row whose coefficient vector is zero.",
				acceptanceCriteria: ["Persist the complete matrix."],
			},
		];

		const need = deriveCriticRepairNeed(state, REVIEW);
		expect(need?.kind).toBe("computation");
	});

	it("recovers an unscheduled capability certificate when recent review prose omits its attempt", () => {
		const state = createState();
		state.researchTaskAttempts[0]!.reviewFindings = [
			{
				id: "review-finding-capability",
				stage: "capability-validation",
				kind: "computation",
				statement: "Provide a task-owned sandbox computation artifact with exact inputs and outputs.",
				acceptanceCriteria: ["Persist the computation artifact."],
			},
		];
		state.researchPlanTasks.push({
			...state.researchPlanTasks[0]!,
			id: "task-46",
			sequence: 46,
			attemptIds: ["research-attempt-task-46-1"],
			latestAttemptId: "research-attempt-task-46-1",
		});
		state.researchTaskAttempts.push({
			...state.researchTaskAttempts[0]!,
			id: "research-attempt-task-46-1",
			taskId: "task-46",
			reviewFindings: [],
		});
		const latestOnly = REVIEW.replaceAll(ATTEMPT_ID, "research-attempt-task-46-1");

		const need = deriveCriticRepairNeed(state, latestOnly);
		expect(need?.sourceAttemptId).toBe(ATTEMPT_ID);
		expect(need?.findingId).toBe("review-finding-capability");
	});

	it("leaves accepted-dependency documentation as evidence debt instead of the next repair", () => {
		const state = createState();
		state.researchTaskAttempts[0]!.reviewFindings = [
			{
				id: "review-finding-documentary-capability",
				stage: "capability-validation",
				kind: "computation",
				statement:
					"Cite the accepted computation dependency with its exact locator, stdout, exit status, and SHA-256 digest.",
				acceptanceCriteria: ["Preserve the complete record for the accepted artifact."],
			},
		];

		expect(deriveCriticRepairNeed(state, REVIEW)).toBeUndefined();
	});

	it("recovers a concrete unscheduled experiment from durable review state", () => {
		const state = createState();
		state.researchPlanTasks[0]!.kind = "computation";
		state.researchTaskAttempts[0]!.reviewFindings = [
			{
				id: "review-finding-concrete-experiment",
				stage: "critic",
				kind: "computation",
				statement:
					"Compute the exact case (a,b,c)=(2,3,4) with lower=[2,2,0,0], upper=[5,5,5,5], and report every quotient rank and torsion factor.",
				acceptanceCriteria: ["Persist complete matrices and unimodular witnesses."],
			},
		];

		const need = deriveCriticRepairNeed(state, REVIEW.replaceAll(ATTEMPT_ID, "research-attempt-unrelated"));
		expect(need?.findingId).toBe("review-finding-concrete-experiment");
		expect(need?.kind).toBe("computation");
	});

	it("does not clone an artifact-free capability repair after the same capability failure repeats", () => {
		const state = createState();
		const parentAttempt = state.researchTaskAttempts[0]!;
		parentAttempt.currentStage = "capability-validation";
		parentAttempt.failure = {
			stage: "capability-validation",
			code: "missing-sandboxed-computation",
			message: "Missing exact computation evidence.",
			claimIds: [],
			retryable: false,
		};
		const repairTask: ResearchPlanTaskRecord = {
			...state.researchPlanTasks[0]!,
			id: "task-46",
			sequence: 46,
			goal: [
				"CRITIC-DRIVEN REPAIR",
				`SOURCE ATTEMPT: ${parentAttempt.id}`,
				"TASK KIND: computation",
				"CERTIFICATE:",
				"Provide the missing exact computation evidence.",
				"ACCEPTANCE CRITERIA:",
				"- Persist an exact artifact.",
				"NON-GOALS:",
				"- Do not broaden the task.",
			].join("\n"),
			attemptIds: ["attempt-46"],
			latestAttemptId: "attempt-46",
		};
		const repairAttempt: ResearchTaskAttemptRecord = {
			...parentAttempt,
			id: "attempt-46",
			taskId: repairTask.id,
			failure: { ...parentAttempt.failure },
			reviewFindings: [
				{
					id: "review-finding-repeated-capability",
					stage: "capability-validation",
					kind: "computation",
					statement: "Provide the missing exact computation evidence.",
					acceptanceCriteria: ["Persist an exact artifact."],
				},
			],
		};
		state.researchPlanTasks.push(repairTask);
		state.researchTaskAttempts.push(repairAttempt);

		expect(deriveCriticRepairNeed(state, REVIEW.replaceAll(ATTEMPT_ID, repairAttempt.id))).toBeUndefined();
	});

	it("preserves the exact parent certificate when capability validation requests its artifact", () => {
		const state = createState();
		state.researchPlanTasks[0]!.goal = [
			"CRITIC-DRIVEN REPAIR",
			"SOURCE ATTEMPT: attempt-parent",
			"TASK KIND: computation",
			"CERTIFICATE:",
			"Execute the exact matrix computation for lower=[1,0] and upper=[3,3].",
			"ACCEPTANCE CRITERIA:",
			"- Persist every exact Smith invariant.",
			"NON-GOALS:",
			"- Do not infer a general theorem.",
		].join("\n");
		state.researchTaskAttempts[0]!.reviewFindings = [
			{
				id: "review-finding-capability",
				stage: "capability-validation",
				kind: "computation",
				statement: "Provide a task-owned sandbox computation artifact.",
				acceptanceCriteria: ["Persist the task-owned artifact."],
			},
		];

		const need = deriveCriticRepairNeed(state, REVIEW);
		expect(need?.certificate).toContain("lower=[1,0] and upper=[3,3]");
		expect(need?.acceptanceCriteria).toContain("Persist every exact Smith invariant.");
		expect(need?.acceptanceCriteria).toContain("Persist the task-owned artifact.");
	});

	it("preserves exact source scope through a capability repair", () => {
		const state = createState();
		const sourceTask = state.researchPlanTasks[0]!;
		sourceTask.kind = "literature-search";
		sourceTask.description =
			"Compare every labelled conjecture in source-30 with theorem-level status passages in source-29.";
		sourceTask.goal = sourceTask.description;
		sourceTask.acceptanceCriteria = ["Cite complete bounded passages from both exact sources."];
		state.researchTaskAttempts[0]!.currentStage = "capability-validation";
		state.researchTaskAttempts[0]!.reviewFindings = [
			{
				id: "review-finding-source-capability",
				stage: "capability-validation",
				kind: "source-refresh",
				statement: "Provide one validated external-record claim with an exact locator.",
				acceptanceCriteria: ["Persist the external-record grounding."],
			},
		];

		const need = deriveCriticRepairNeed(state, REVIEW);
		expect(need?.certificate).toContain("source-30");
		expect(need?.certificate).toContain("source-29");
		expect(need?.certificate).toContain("validated external-record claim");
		expect(need?.acceptanceCriteria).toContain("Cite complete bounded passages from both exact sources.");
	});

	it("preserves an ordinary computation contract through capability repair descendants", () => {
		const state = createState();
		const rootTask = state.researchPlanTasks[0]!;
		const rootAttempt = state.researchTaskAttempts[0]!;
		rootTask.kind = "computation";
		rootTask.goal =
			"Execute partition-pieri with lower=[2,2,0,0], upper=[4,4,4,4], degrees=[4,...,16], and hDegrees=[1,2,3,4].";
		rootTask.acceptanceCriteria = ["Emit every ordered basis and exact Smith witness."];
		rootAttempt.reviewFindings = [
			{
				id: "review-finding-capability",
				stage: "capability-validation",
				kind: "computation",
				statement: "Provide a task-owned sandbox computation artifact.",
				acceptanceCriteria: ["Persist the task-owned artifact."],
			},
		];
		const firstRepair = deriveCriticRepairNeed(state, REVIEW);
		if (!firstRepair) throw new Error("Expected a capability repair.");
		const repairTask: ResearchPlanTaskRecord = {
			...rootTask,
			id: "task-46",
			sequence: 46,
			goal: firstRepair.directive,
			acceptanceCriteria: firstRepair.acceptanceCriteria,
			attemptIds: ["attempt-46"],
			latestAttemptId: "attempt-46",
		};
		const repairAttempt: ResearchTaskAttemptRecord = {
			...rootAttempt,
			id: "attempt-46",
			taskId: repairTask.id,
			reviewFindings: [
				{
					id: "review-finding-boundary-shape",
					stage: "critic",
					kind: "computation",
					statement: "Re-execute the same computation with explicit dimensions for every empty matrix.",
					acceptanceCriteria: ["Verify the dimension-aware matrix identity."],
				},
			],
		};
		state.researchPlanTasks.push(repairTask);
		state.researchTaskAttempts.push(repairAttempt);

		const descendant = deriveCriticRepairNeed(state, REVIEW.replaceAll(ATTEMPT_ID, repairAttempt.id));
		expect(descendant?.certificate).toContain("lower=[2,2,0,0]");
		expect(descendant?.certificate).toContain("explicit dimensions for every empty matrix");
		expect(descendant?.acceptanceCriteria).toContain("Emit every ordered basis and exact Smith witness.");
		if (!descendant) throw new Error("Expected a descendant repair.");
		const acceptedDescendant: ResearchPlanTaskRecord = {
			...repairTask,
			id: "task-47",
			sequence: 47,
			status: "completed",
			goal: descendant.directive,
			acceptanceCriteria: descendant.acceptanceCriteria,
			attemptIds: ["attempt-47"],
			latestAttemptId: "attempt-47",
			acceptedAttemptId: "attempt-47",
			reviewOutcome: "accepted",
		};
		state.researchPlanTasks.push(acceptedDescendant);
		state.researchTaskAttempts.push({
			...repairAttempt,
			id: "attempt-47",
			taskId: acceptedDescendant.id,
			status: "accepted",
			reviewFindings: [],
		});
		expect(deriveCriticRepairNeed(state, REVIEW.replaceAll(ATTEMPT_ID, repairAttempt.id))).toBeUndefined();
	});

	it("carries explicit computation inputs through a failed repair descendant", () => {
		const state = createState();
		const sourceTask = state.researchPlanTasks[0]!;
		const sourceAttempt = state.researchTaskAttempts[0]!;
		const parentTask = {
			...sourceTask,
			id: "task-parent-computation",
			attemptIds: ["attempt-parent-computation"],
			latestAttemptId: "attempt-parent-computation",
			goal: [
				"CRITIC-DRIVEN REPAIR",
				"SOURCE ATTEMPT: attempt-original",
				"TASK KIND: computation",
				"CERTIFICATE:",
				"Execute the exact computation for lower=[1,0], upper=[3,3], and degrees=[1,2,3].",
				"ACCEPTANCE CRITERIA:",
				"- Persist every exact matrix row.",
				"NON-GOALS:",
				"- Do not infer a general theorem.",
			].join("\n"),
		};
		state.researchPlanTasks.push(parentTask);
		state.researchTaskAttempts.push({
			...sourceAttempt,
			id: "attempt-parent-computation",
			taskId: parentTask.id,
			reviewFindings: [],
		});
		sourceTask.goal = [
			"CRITIC-DRIVEN REPAIR",
			"SOURCE ATTEMPT: attempt-parent-computation",
			"TASK KIND: computation",
			"CERTIFICATE:",
			"The executable code omitted one zero coefficient vector.",
			"ACCEPTANCE CRITERIA:",
			"- Preserve the zero row.",
			"NON-GOALS:",
			"- Do not infer a general theorem.",
		].join("\n");
		sourceAttempt.reviewFindings = [
			{
				id: "review-finding-capability",
				stage: "capability-validation",
				kind: "computation",
				statement: "Provide a task-owned computation artifact.",
				acceptanceCriteria: ["Persist the artifact."],
			},
		];

		const need = deriveCriticRepairNeed(state, REVIEW);
		expect(need?.certificate).toContain("lower=[1,0], upper=[3,3], and degrees=[1,2,3]");
		expect(need?.certificate).toContain("omitted one zero coefficient vector");
		expect(need?.certificate).toContain("Provide a task-owned computation artifact");
	});

	it("selects exactly the first concrete missing certificate and serializes strict criteria", () => {
		const need = deriveCriticRepairNeed(createState(), REVIEW);
		expect(need?.certificate).toBe("Prove the completeness of the columns and Pieri rows in degrees d+1 and d+2.");
		expect(need?.directive).toContain("SOURCE ATTEMPT: research-attempt-task-45-1");
		expect(need?.directive).toContain("Do not solve adjacent review concerns");
		expect(need?.directive).not.toContain("Display the three complementary pivot matrices");
		const contract = parseCriticRepairDirective(need?.directive);
		expect(contract?.kind).toBe("proof-attempt");
		expect(contract?.acceptanceCriteria).toHaveLength(4);
		expect(contract?.acceptanceCriteria[3]).toContain("Do not claim the parent theorem");
	});

	it("forces the repair ahead of broad coordinator moves", async () => {
		const { report } = await runResearchCoordinatorSynthesis({
			state: createState(),
			now: NOW,
			recentTaskReviewContext: REVIEW,
		});
		expect(report.recommendedNextMoves[0]?.title).toContain("Repair certificate");
		expect(report.recommendedNextMoves[0]?.prompt).toContain("CRITIC-DRIVEN REPAIR");
		expect(report.suggestedPrompt).toBe(report.recommendedNextMoves[0]?.prompt);
	});

	it("consumes a review once its exact repair has been scheduled", () => {
		const state = createState();
		const need = deriveCriticRepairNeed(state, REVIEW);
		if (!need) throw new Error("Expected a repair need.");
		state.researchPlanTasks.push({
			...state.researchPlanTasks[0]!,
			id: "task-46",
			sequence: 46,
			status: "pending",
			title: need.title,
			goal: need.directive,
			acceptanceCriteria: need.acceptanceCriteria,
			attemptIds: [],
			latestAttemptId: undefined,
		});
		expect(deriveCriticRepairNeed(state, REVIEW)).toBeUndefined();
	});

	it("retires a stale finding when later accepted work supplied the same certificate", () => {
		const state = createState();
		state.researchTaskAttempts[0]!.reviewFindings = [
			{
				id: "review-finding-source-refresh",
				stage: "critic",
				kind: "source-refresh",
				statement: "Obtain the 2024 minimality theorem text with its exact hypotheses and coefficient ring.",
				acceptanceCriteria: [
					"Provide stable theorem locators and bounded excerpts.",
					"Record whether the theorem proves minimal generation or freeness.",
				],
			},
			{
				id: "review-finding-unrelated-proof",
				stage: "skeptic",
				kind: "proof-attempt",
				statement: "Prove the uniform saturation formula for every degree.",
				acceptanceCriteria: ["Display a degreewise unimodular elimination."],
			},
		];
		state.researchPlanTasks.push({
			...state.researchPlanTasks[0]!,
			id: "task-46",
			kind: "literature-search",
			sequence: 46,
			status: "completed",
			title: "Retrieve the 2024 minimality theorem",
			description: "Inspect the full theorem text and its exact hypotheses and coefficient ring.",
			goal: "Determine whether the 2024 minimality theorem proves minimal generation or freeness.",
			acceptanceCriteria: ["Provide stable theorem locators and bounded excerpts."],
			attemptIds: ["attempt-46"],
			latestAttemptId: "attempt-46",
			acceptedAttemptId: "attempt-46",
			reviewOutcome: "accepted",
		});

		const need = deriveCriticRepairNeed(state, REVIEW);
		expect(need?.findingId).toBe("review-finding-unrelated-proof");
	});

	it("does not manufacture a certificate from non-actionable review prose", () => {
		const context = `NON-ACCEPTED ATTEMPT ${ATTEMPT_ID}\nTASK Broad attempt\nSKEPTIC\n## Concerns\n- The exposition is difficult to follow.`;
		expect(deriveCriticRepairNeed(createState(), context)).toBeUndefined();
	});

	it("does not scan backward into a stale review after the latest review is consumed", () => {
		const state = createState();
		const latest = deriveCriticRepairNeed(state, REVIEW);
		if (!latest) throw new Error("Expected a repair need.");
		state.researchPlanTasks.push({
			...state.researchPlanTasks[0]!,
			id: "task-46",
			sequence: 46,
			status: "blocked",
			title: latest.title,
			goal: latest.directive,
			acceptanceCriteria: latest.acceptanceCriteria,
			attemptIds: [],
		});
		const stale = REVIEW.replaceAll(ATTEMPT_ID, "research-attempt-task-44-1");
		expect(deriveCriticRepairNeed(state, `${stale}\n\n${REVIEW}`)).toBeUndefined();
	});

	it("prefers a direct replacement-artifact defect over forensics on a superseded artifact", () => {
		const state = createState();
		const currentArtifact = "a".repeat(64);
		const supersededArtifact = "b".repeat(64);
		state.researchPlanTasks[0]!.goal =
			`${state.researchPlanTasks[0]!.goal}\n\nCORRECTION CONTEXT (do not establish provenance of the superseded output):\nOld defect.`;
		state.researchTaskAttempts[0]!.computationArtifactIds = [currentArtifact];
		state.researchTaskAttempts[0]!.reviewFindings = [
			{
				id: "review-finding-old-artifact",
				stage: "critic",
				kind: "source-refresh",
				statement: `Provide code excerpts from superseded artifact ${supersededArtifact}.`,
				acceptanceCriteria: ["Inspect the old artifact."],
			},
			{
				id: "review-finding-current-artifact",
				stage: "skeptic",
				kind: "computation",
				statement: `Expose the complete stdout for replacement artifact ${currentArtifact}.`,
				acceptanceCriteria: ["Expose the current artifact output."],
			},
		];

		const need = deriveCriticRepairNeed(state, REVIEW);
		expect(need?.findingId).toBe("review-finding-current-artifact");
	});

	it("revalidates a clean root computation when only superseded-output forensics remain", () => {
		const state = createState();
		const currentArtifact = "c".repeat(64);
		const supersededArtifact = "d".repeat(64);
		const rootCertificate = "Compute the exact Smith normal form of the complete relation matrix.";
		state.researchPlanTasks[0]!.kind = "computation";
		state.researchPlanTasks[0]!.goal =
			`CRITIC-DRIVEN REPAIR\nSOURCE ATTEMPT: attempt-43\nTASK KIND: computation\nCERTIFICATE:\n${rootCertificate}\n\nCORRECTION CONTEXT (do not establish provenance of the superseded output):\nDiscard artifact ${supersededArtifact}.\nACCEPTANCE CRITERIA:\n- Execute the exact computation and preserve its artifact.\nNON-GOALS:\n- Do not inspect the superseded artifact.`;
		state.researchTaskAttempts[0]!.computationArtifactIds = [currentArtifact];
		state.researchTaskAttempts[0]!.reviewFindings = [
			{
				id: "review-finding-old-artifact",
				stage: "skeptic",
				kind: "source-refresh",
				statement: `Provide code excerpts from superseded artifact ${supersededArtifact}.`,
				acceptanceCriteria: ["Inspect the old artifact."],
			},
		];

		const need = deriveCriticRepairNeed(state, REVIEW);
		expect(need?.kind).toBe("computation");
		expect(need?.certificate).toBe(rootCertificate);
		expect(need?.title).toContain("Revalidate replacement computation");
		expect(need?.directive).not.toContain(supersededArtifact);
		if (!need) throw new Error("Expected a replacement revalidation need.");
		const acceptedTask: ResearchPlanTaskRecord = {
			...state.researchPlanTasks[0]!,
			id: "task-45",
			sequence: 45,
			status: "completed",
			title: need.title,
			goal: need.directive,
			acceptanceCriteria: need.acceptanceCriteria,
			attemptIds: ["attempt-45"],
			latestAttemptId: "attempt-45",
			acceptedAttemptId: "attempt-45",
			reviewOutcome: "accepted",
		};
		state.researchPlanTasks.push(acceptedTask);
		state.researchTaskAttempts.push({
			...state.researchTaskAttempts[0]!,
			id: "attempt-45",
			taskId: acceptedTask.id,
			status: "accepted",
			reviewFindings: [],
		});
		expect(deriveCriticRepairNeed(state, REVIEW)).toBeUndefined();
	});

	it("does not chain source refresh repairs without a changed prerequisite", () => {
		const state = createState();
		state.researchPlanTasks[0]!.kind = "source-refresh";
		state.researchPlanTasks[0]!.goal =
			"CRITIC-DRIVEN REPAIR\nSOURCE ATTEMPT: attempt-44\nTASK KIND: source-refresh\nCERTIFICATE:\nSupply a bounded source excerpt.\nACCEPTANCE CRITERIA:\n- Supply the excerpt or record its absence.\nNON-GOALS:\n- Do not broaden the task.";
		state.researchTaskAttempts[0]!.reviewFindings = [
			{
				id: "review-finding-source-loop",
				stage: "skeptic",
				kind: "source-refresh",
				statement: "Supply another bounded source excerpt for the same missing statement.",
				acceptanceCriteria: ["Supply the excerpt or record its absence."],
			},
		];

		expect(deriveCriticRepairNeed(state, REVIEW)).toBeUndefined();
	});

	it("revalidates a bounded parent certificate after its child repair is accepted", () => {
		const state = createState();
		const parent = deriveCriticRepairNeed(state, REVIEW);
		if (!parent) throw new Error("Expected a parent repair need.");
		const parentTask: ResearchPlanTaskRecord = {
			...state.researchPlanTasks[0]!,
			id: "task-46",
			sequence: 46,
			status: "blocked",
			title: parent.title,
			goal: parent.directive,
			acceptanceCriteria: parent.acceptanceCriteria,
			attemptIds: ["attempt-46"],
			latestAttemptId: "attempt-46",
		};
		const parentAttempt: ResearchTaskAttemptRecord = {
			...state.researchTaskAttempts[0]!,
			id: "attempt-46",
			taskId: parentTask.id,
			status: "needs-revision",
		};
		const childDirective = parent.directive
			.replace(ATTEMPT_ID, parentAttempt.id)
			.replace(parent.certificate, "Display the missing boundary determinant witness.");
		const childTask: ResearchPlanTaskRecord = {
			...parentTask,
			id: "task-47",
			sequence: 47,
			status: "completed",
			title: "Repair boundary determinant",
			goal: childDirective,
			acceptanceCriteria: ["Display the missing boundary determinant witness."],
			attemptIds: ["attempt-47"],
			latestAttemptId: "attempt-47",
			acceptedAttemptId: "attempt-47",
			reviewOutcome: "accepted",
		};
		state.researchPlanTasks.push(parentTask, childTask);
		state.researchTaskAttempts.push(parentAttempt, {
			...parentAttempt,
			id: "attempt-47",
			taskId: childTask.id,
			status: "accepted",
		});
		const integration = deriveCriticRepairNeed(state, REVIEW);
		expect(integration?.certificate).toBe(parent.certificate);
		expect(integration?.title).toContain("Revalidate repaired certificate");
		expect(integration?.directive).toContain("INTEGRATES ACCEPTED REPAIR TASK: task-47");
		expect(parseCriticRepairDirective(integration?.directive)?.integratesAcceptedRepairTaskId).toBe("task-47");
	});

	it("retires historical integration only after a later accepted task matches exact parameters", () => {
		const state = createState();
		const rootTask = state.researchPlanTasks[0]!;
		rootTask.kind = "computation";
		rootTask.goal = "Compute complete Smith forms for i=2, j=2, p=2, c=3 in every degree.";
		rootTask.acceptanceCriteria = ["Report every quotient rank and torsion invariant."];
		const parentRepair: ResearchPlanTaskRecord = {
			...rootTask,
			id: "task-46",
			sequence: 46,
			status: "blocked",
			goal: [
				"CRITIC-DRIVEN REPAIR",
				`SOURCE ATTEMPT: ${ATTEMPT_ID}`,
				"TASK KIND: computation",
				"CERTIFICATE:",
				rootTask.goal,
				"ACCEPTANCE CRITERIA:",
				"- Report every quotient rank and torsion invariant.",
				"NON-GOALS:",
				"- Do not infer a general theorem.",
			].join("\n"),
			attemptIds: ["attempt-46"],
			latestAttemptId: "attempt-46",
		};
		const historicalRepair: ResearchPlanTaskRecord = {
			...parentRepair,
			id: "task-47",
			sequence: 47,
			status: "completed",
			goal: [
				"CRITIC-DRIVEN REPAIR",
				"SOURCE ATTEMPT: attempt-46",
				"TASK KIND: computation",
				"CERTIFICATE:",
				"Provide a task-owned computation artifact.",
				"ACCEPTANCE CRITERIA:",
				"- Persist the artifact.",
				"NON-GOALS:",
				"- Do not infer a general theorem.",
			].join("\n"),
			attemptIds: ["attempt-47"],
			latestAttemptId: "attempt-47",
			acceptedAttemptId: "attempt-47",
			reviewOutcome: "accepted",
		};
		const neighboringCase: ResearchPlanTaskRecord = {
			...historicalRepair,
			id: "task-48",
			sequence: 48,
			goal: "Compute complete Smith forms for i=2, j=2, p=2, c=4 in every degree.",
			attemptIds: ["attempt-48"],
			latestAttemptId: "attempt-48",
			acceptedAttemptId: "attempt-48",
		};
		state.researchPlanTasks.push(parentRepair, historicalRepair, neighboringCase);
		state.researchTaskAttempts.push(
			{
				...state.researchTaskAttempts[0]!,
				id: "attempt-46",
				taskId: parentRepair.id,
				status: "needs-revision",
			},
			{
				...state.researchTaskAttempts[0]!,
				id: "attempt-47",
				taskId: historicalRepair.id,
				status: "accepted",
				reviewFindings: [],
			},
			{
				...state.researchTaskAttempts[0]!,
				id: "attempt-48",
				taskId: neighboringCase.id,
				status: "accepted",
				reviewFindings: [],
			},
		);
		expect(deriveCriticRepairNeed(state, REVIEW)?.directive).toContain("INTEGRATES ACCEPTED REPAIR TASK: task-47");

		state.researchPlanTasks.push({
			...neighboringCase,
			id: "task-49",
			sequence: 49,
			goal: "Compute complete Smith forms for i=2, j=2, p=2, c=3 in every degree and report every quotient rank and torsion invariant.",
			attemptIds: ["attempt-49"],
			latestAttemptId: "attempt-49",
			acceptedAttemptId: "attempt-49",
		});
		expect(deriveCriticRepairNeed(state, REVIEW)).toBeUndefined();
	});

	it("normalizes a mislabeled symbolic determinant repair to a proof task", () => {
		const state = createState();
		state.researchTaskAttempts[0]!.reviewFindings = [
			{
				id: "finding-symbolic-determinant",
				stage: "critic",
				kind: "computation",
				statement:
					"From the recovered statement, give the complete bordered Jacobi-Trudi matrix, specify every row and column order, compute all Laplace signs and minors, derive the congruence, and verify the boundary cases.",
				acceptanceCriteria: ["Provide the complete symbolic proof with all signs and minors."],
			},
		];

		const need = deriveCriticRepairNeed(state, REVIEW);
		expect(need?.kind).toBe("proof-attempt");
		expect(parseCriticRepairDirective(need?.directive)?.kind).toBe("proof-attempt");
	});
});
