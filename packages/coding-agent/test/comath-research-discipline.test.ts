import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCoordinatorContext } from "../src/modes/comath/comath-coordinator-synthesis.ts";
import { CoMathHarness } from "../src/modes/comath/comath-harness.ts";
import type { LiteratureSourceLookup } from "../src/modes/comath/comath-literature-source.ts";
import { formatResearchStateSummary } from "../src/modes/comath/comath-progress.ts";
import { parseResearchConstraintPrompt } from "../src/modes/comath/comath-prompts.ts";
import { buildResearchContextPack } from "../src/modes/comath/comath-research-context.ts";
import { amendResearchPlanAfterTask } from "../src/modes/comath/comath-research-director.ts";
import {
	applyPivotsToSuggestedNextMove,
	parseNegativeConstraints,
	parseRoutePivots,
	parseTheoremApplicabilityChecks,
} from "../src/modes/comath/comath-research-discipline.ts";
import type {
	ResearchWorkstreamModelExecutor,
	ResearchWorkstreamModelRequest,
} from "../src/modes/comath/comath-research-model-workstream.ts";
import { resumeResearchPlan } from "../src/modes/comath/comath-research-plan-runner.ts";
import { parseSpecialistAction } from "../src/modes/comath/comath-research-specialist-loop.ts";
import type { CoMathProjectState } from "../src/modes/comath/schema.ts";
import {
	addResearchConstraint,
	addResearchPath,
	addResearchPivot,
	addResearchPlan,
	addResearchPlanTask,
	addTheoremApplicabilityCheck,
	createEmptyProjectState,
	getActiveResearchConstraints,
	getResearchPlanTasks,
	loadProjectState,
	retireResearchConstraint,
	saveProjectState,
	updateResearchPlan,
	updateResearchPlanTask,
} from "../src/modes/comath/storage.ts";

const NOW = "2026-06-05T12:00:00.000Z";

const FORBIDDEN_PRODUCT_TERMS = ["role-run", "queue", "schema", "artifact", "workstream-", "/comath"];

function expectProductCopy(text: string): void {
	for (const term of FORBIDDEN_PRODUCT_TERMS) {
		expect(text).not.toContain(term);
	}
}

const SPECIALIST_THEOREM_CHECK_NOTE = [
	"## Findings",
	"- The pair exists, but the direct rule does not apply to it.",
	"## Theorem check",
	"- Theorem: Spink-Tewari well-aligned rule",
	"- Object: the pair from the root question",
	"- Hypothesis: pair is well-aligned - satisfied",
	"- Hypothesis: ascent condition holds - failed; fails at position 3",
	"- Status: rejected-as-direct-route",
	"- Consequence: pivot to the Grassmannian special factor plus Pieri route",
	"## Route change",
	"- From: direct well-aligned rule application",
	"- To: Grassmannian special factor plus Pieri",
	"- Reason: the ascent hypothesis fails for the pair",
	"## Promising strategy",
	"- Work through the special factor.",
	"## Gaps",
	"- The Pieri route is not yet carried out.",
	"## Next",
	"- Set up the Pieri computation.",
].join("\n");

function createSchubertState(): CoMathProjectState {
	let state = createEmptyProjectState({
		projectId: "proj-test",
		title: "Structure constants for a special Schubert pair",
		rootQuestion: "What are the structure constants for the given Schubert pair?",
		now: NOW,
	});
	state = addResearchPath(state, {
		title: "Direct proof attempt",
		objective: "Apply known multiplication rules to the pair.",
		suggestedNextMove: "Check which rules apply.",
		priority: 1,
		now: NOW,
		actor: "human",
	});
	return state;
}

describe("co-math research discipline parsing", () => {
	it("parses a theorem check section into hypotheses, status, and consequence", () => {
		const checks = parseTheoremApplicabilityChecks(SPECIALIST_THEOREM_CHECK_NOTE);

		expect(checks).toHaveLength(1);
		expect(checks[0]).toEqual({
			theorem: "Spink-Tewari well-aligned rule",
			targetObject: "the pair from the root question",
			hypotheses: [
				{ hypothesis: "pair is well-aligned", status: "satisfied" },
				{ hypothesis: "ascent condition holds", status: "failed", note: "fails at position 3" },
			],
			status: "rejected-as-direct-route",
			consequence: "pivot to the Grassmannian special factor plus Pieri route",
		});
	});

	it("parses route changes and tolerates malformed sections without guessing", () => {
		const pivots = parseRoutePivots(SPECIALIST_THEOREM_CHECK_NOTE);
		expect(pivots).toEqual([
			{
				fromRoute: "direct well-aligned rule application",
				toRoute: "Grassmannian special factor plus Pieri",
				reason: "the ascent hypothesis fails for the pair",
			},
		]);

		expect(parseTheoremApplicabilityChecks("## Findings\n- Nothing structured here.")).toEqual([]);
		expect(parseRoutePivots("## Route change\n- Reason: no routes named.")).toEqual([]);
		// A check without a `Theorem:` line yields nothing rather than a guessed record.
		expect(parseTheoremApplicabilityChecks("## Theorem check\n- Status: applies")).toEqual([]);
	});

	it("parses inline discipline labels from model prose", () => {
		const text = [
			"## Source-backed distinctions",
			"- Related theorem context.",
			"Theorem check:",
			"Theorem: Friedlander-Iwaniec theorem on primes X^2+Y^4.",
			"Object: n^2+1.",
			"Hypothesis: fixed slice Y=1 is controlled - failed; theorem lets both variables vary.",
			"Status: rejected-as-direct-route.",
			"Consequence: treat as related multivariable evidence only.",
			"Route change:",
			"From: proving the target via multivariable prime-producing theorems.",
			"To: seek one-variable-specific evidence, e.g. almost-prime values or sieve bounds.",
			"Reason: infinitude in a multivariable family gives no lower bound on a fixed slice.",
			"Negative constraints:",
			"Do not infer the fixed one-variable case from multivariable prime-producing theorems.",
		].join("\n");

		expect(parseTheoremApplicabilityChecks(text)).toEqual([
			{
				theorem: "Friedlander-Iwaniec theorem on primes X^2+Y^4.",
				targetObject: "n^2+1.",
				hypotheses: [
					{
						hypothesis: "fixed slice Y=1 is controlled",
						status: "failed",
						note: "theorem lets both variables vary.",
					},
				],
				status: "rejected-as-direct-route",
				consequence: "treat as related multivariable evidence only.",
			},
		]);
		expect(parseRoutePivots(text)).toEqual([
			{
				fromRoute: "proving the target via multivariable prime-producing theorems.",
				toRoute: "seek one-variable-specific evidence, e.g. almost-prime values or sieve bounds.",
				reason: "infinitude in a multivariable family gives no lower bound on a fixed slice.",
			},
		]);
		expect(parseNegativeConstraints(text)).toEqual([
			"Do not infer the fixed one-variable case from multivariable prime-producing theorems.",
		]);
	});

	it("drops route changes whose destination is a verdict rather than a route", () => {
		// A model putting its assessment of the old route in `To:` must not create a pivot: the
		// agenda would otherwise spawn a task like "Pursue the replacement route: gives related
		// evidence only ...".
		const verdictDestination = [
			"## Route change",
			"- From: direct use of the Friedlander-Iwaniec theorem",
			"- To: gives related evidence and methodology only, not infinitude of the target form",
			"- Reason: both of the theorem's variables vary",
		].join("\n");
		expect(parseRoutePivots(verdictDestination)).toEqual([]);

		// A verdict-style consequence on a rejected check never becomes the suggested next move.
		const next = applyPivotsToSuggestedNextMove(
			"Ask the coordinator what to try next.",
			[],
			[
				{
					theorem: "Friedlander-Iwaniec theorem",
					targetObject: "the target form",
					hypotheses: [],
					status: "rejected-as-direct-route",
					consequence: "cannot settle the root question",
				},
			],
		);
		expect(next).toBe("Ask the coordinator what to try next.");
	});

	it("detects constraint-shaped steering prompts and leaves ordinary steering alone", () => {
		expect(parseResearchConstraintPrompt("Do not attack arbitrary Schubert multiplication.")).toEqual({
			text: "Do not attack arbitrary Schubert multiplication",
			kind: "avoid",
		});
		expect(parseResearchConstraintPrompt("please avoid the full generality of the conjecture")).toMatchObject({
			kind: "avoid",
		});
		expect(parseResearchConstraintPrompt("Use the French convention for tableaux.")).toMatchObject({
			kind: "convention",
		});
		expect(parseResearchConstraintPrompt("try the mod 6 pattern next")).toBeUndefined();
		expect(parseResearchConstraintPrompt("check lemma 2")).toBeUndefined();
	});

	it("accepts a claim category on recorded specialist claims and drops unknown ones", () => {
		const withCategory = parseSpecialistAction(
			JSON.stringify({
				action: "record_claim",
				claim: "The anchor case k = 2 gives coefficient 3.",
				classification: "computation",
				category: "computed-anchor-result",
				rationale: "Direct expansion.",
			}),
		);
		expect(withCategory).toMatchObject({ kind: "record_claim", claimCategory: "computed-anchor-result" });

		const withUnknown = parseSpecialistAction(
			JSON.stringify({
				action: "record_claim",
				claim: "A claim.",
				classification: "heuristic",
				category: "absolutely-certain",
				rationale: "None.",
			}),
		);
		expect(withUnknown).toMatchObject({ kind: "record_claim" });
		expect((withUnknown as { claimCategory?: string }).claimCategory).toBeUndefined();
	});
});

describe("co-math research discipline storage", () => {
	it("persists constraints with dedupe and retirement, and shows them to every role", () => {
		let state = createSchubertState();
		state = addResearchConstraint(state, {
			text: "Do not attack arbitrary Schubert multiplication",
			kind: "avoid",
			origin: "human",
			now: NOW,
			actor: "human",
		});
		// A duplicate active constraint is ignored.
		state = addResearchConstraint(state, {
			text: "do not attack arbitrary schubert multiplication",
			now: NOW,
		});
		state = addResearchConstraint(state, {
			text: "Use the French convention for tableaux",
			kind: "convention",
			now: NOW,
		});
		expect(state.researchConstraints).toHaveLength(2);

		const pack = buildResearchContextPack(state);
		expect(pack).toContain("Standing constraints (do not violate, do not re-attempt what they exclude):");
		expect(pack).toContain("- [avoid] Do not attack arbitrary Schubert multiplication");
		expect(pack).toContain("- [convention] Use the French convention for tableaux");

		state = retireResearchConstraint(state, {
			constraintId: "constraint-1",
			reason: "The user lifted it.",
			now: NOW,
		});
		expect(getActiveResearchConstraints(state).map((constraint) => constraint.text)).toEqual([
			"Use the French convention for tableaux",
		]);
		expect(buildResearchContextPack(state)).not.toContain("Do not attack arbitrary Schubert multiplication");
	});

	it("keeps theorem checks and pivots durable and visible in context and product copy", () => {
		let state = createSchubertState();
		state = addTheoremApplicabilityCheck(state, {
			theorem: "Spink-Tewari well-aligned rule",
			targetObject: "the pair from the root question",
			hypotheses: [
				{ hypothesis: "pair is well-aligned", status: "satisfied" },
				{ hypothesis: "ascent condition holds", status: "failed", note: "fails at position 3" },
			],
			status: "rejected-as-direct-route",
			consequence: "pivot to the Grassmannian special factor plus Pieri route",
			pathId: "path-1",
			now: NOW,
			actor: "reviewer",
		});
		state = addResearchPivot(state, {
			fromRoute: "direct well-aligned rule application",
			toRoute: "Grassmannian special factor plus Pieri",
			reason: "the ascent hypothesis fails for the pair",
			pathId: "path-1",
			applicabilityCheckId: "theorem-check-1",
			now: NOW,
		});
		// A consecutive duplicate pivot is ignored.
		state = addResearchPivot(state, {
			fromRoute: "Direct well-aligned rule application",
			toRoute: "grassmannian special factor plus pieri",
			reason: "repeat",
			now: NOW,
		});
		expect(state.researchPivots).toHaveLength(1);

		const pack = buildResearchContextPack(state);
		expect(pack).toContain("Theorem applicability checks already performed");
		expect(pack).toContain(
			"Spink-Tewari well-aligned rule on the pair from the root question: rejected-as-direct-route",
		);
		expect(pack).toContain("fails: ascent condition holds");
		expect(pack).toContain("Route changes taken so far");
		expect(pack).toContain("From: direct well-aligned rule application");

		const summary = formatResearchStateSummary(state);
		expect(summary).toContain("Theorem checks");
		expect(summary).toContain("Spink-Tewari well-aligned rule: does not apply directly");
		expect(summary).toContain("Route changes");
		expect(summary).toContain('Dropped "direct well-aligned rule application"');
		expectProductCopy(summary);
	});

	it("ignores paraphrased duplicates of constraints, theorem checks, and pivots", () => {
		let state = createSchubertState();
		// The same standing rule restated by another role in different words stays one record.
		state = addResearchConstraint(state, {
			text: "Do not infer one-variable polynomial-prime infinitude from multivariable representation results",
			origin: "reviewer",
			now: NOW,
			actor: "reviewer",
		});
		state = addResearchConstraint(state, {
			text: "Do not infer one-variable polynomial-prime infinitude from multivariable or multi-parameter results.",
			origin: "reviewer",
			now: NOW,
			actor: "reviewer",
		});
		expect(state.researchConstraints).toHaveLength(1);
		// A genuinely different rule still records.
		state = addResearchConstraint(state, {
			text: "Do not treat heuristic preprints as settled proofs.",
			now: NOW,
		});
		expect(state.researchConstraints).toHaveLength(2);

		// The same theorem with the same verdict keys to one check, across source labels and
		// parentheticals; a different verdict for the same theorem is a real update.
		state = addTheoremApplicabilityCheck(state, {
			theorem: "Friedlander-Iwaniec theorem (primes of the form X^2 + Y^4)",
			targetObject: "primes of the form n^2 + 1",
			status: "rejected-as-direct-route",
			now: NOW,
			actor: "workstream",
		});
		state = addTheoremApplicabilityCheck(state, {
			theorem: "Friedlander-Iwaniec (X^2 + Y^4) as reported in [source-2]",
			targetObject: "the same target",
			status: "rejected-as-direct-route",
			now: NOW,
			actor: "reviewer",
		});
		expect(state.theoremApplicabilityChecks).toHaveLength(1);
		state = addTheoremApplicabilityCheck(state, {
			theorem: "Friedlander-Iwaniec theorem",
			targetObject: "the two-variable family itself",
			status: "applies",
			now: NOW,
			actor: "workstream",
		});
		expect(state.theoremApplicabilityChecks).toHaveLength(2);

		// A pivot restating an earlier one's from/to in different words stays one record, even when
		// other pivots landed in between.
		state = addResearchPivot(state, {
			fromRoute: "Direct use of the Friedlander-Iwaniec theorem",
			toRoute: "seek one-variable-specific sieve evidence",
			reason: "both of the theorem's variables vary",
			now: NOW,
		});
		state = addResearchPivot(state, {
			fromRoute: "literature settlement search",
			toRoute: "bounded residue computations on small cases",
			reason: "no authoritative source was available",
			now: NOW,
		});
		state = addResearchPivot(state, {
			fromRoute: "the direct Friedlander-Iwaniec theorem use",
			toRoute: "seek sieve evidence specific to the one-variable case",
			reason: "restated by a later role",
			now: NOW,
		});
		expect(state.researchPivots).toHaveLength(2);
	});

	it("does not retry a review-rejected task on resume while other work remains", () => {
		let state = createSchubertState();
		state = addResearchPlan(state, { title: "Plan", objective: "Progress.", now: NOW, actor: "human" });
		for (const title of ["Find the settlement status", "Run the residue computation"]) {
			state = addResearchPlanTask(state, {
				planId: "research-plan-1",
				kind: "computation",
				title,
				description: title,
				pathId: "path-1",
				now: NOW,
				actor: "human",
			});
		}
		state = updateResearchPlanTask(state, {
			taskId: "research-plan-task-1",
			status: "blocked",
			blockedReason: "The independent review did not accept this step as completed.",
			reviewOutcome: "rejected",
			now: NOW,
		});
		state = updateResearchPlanTask(state, {
			taskId: "research-plan-task-2",
			status: "failed",
			failureReason: "Previous Pi session ended before the task finished.",
			now: NOW,
		});
		state = updateResearchPlan(state, {
			planId: "research-plan-1",
			status: "paused",
			pauseReason: "A plan task is blocked or stopped and needs an explicit retry.",
			now: NOW,
			actor: "system",
		});

		// Resume retries the interrupted task but not the review-rejected one: re-running the
		// identical step would meet the identical review.
		const resumed = resumeResearchPlan(state, "research-plan-1", NOW);
		const tasks = getResearchPlanTasks(resumed, "research-plan-1");
		expect(tasks[0]?.status).toBe("blocked");
		expect(tasks[1]?.status).toBe("pending");
		expect(resumed.researchPlans[0]?.status).toBe("active");

		// When the rejected step is the plan's only remaining work, an explicit resume can only
		// mean "try that step again", so it becomes retryable.
		let solo = createSchubertState();
		solo = addResearchPlan(solo, { title: "Plan", objective: "Progress.", now: NOW, actor: "human" });
		solo = addResearchPlanTask(solo, {
			planId: "research-plan-1",
			kind: "computation",
			title: "Find the settlement status",
			description: "Find the settlement status.",
			pathId: "path-1",
			now: NOW,
			actor: "human",
		});
		solo = updateResearchPlanTask(solo, {
			taskId: "research-plan-task-1",
			status: "blocked",
			blockedReason: "The independent review did not accept this step as completed.",
			reviewOutcome: "rejected",
			now: NOW,
		});
		const soloResumed = resumeResearchPlan(solo, "research-plan-1", NOW);
		expect(getResearchPlanTasks(soloResumed, "research-plan-1")[0]?.status).toBe("pending");
	});

	it("records a pivot when a director amendment swaps routes after a failed one", async () => {
		let state = createSchubertState();
		state = addResearchPlan(state, { title: "Plan", objective: "Progress.", now: NOW, actor: "human" });
		for (const [kind, title] of [
			["proof-attempt", "Apply the well-aligned rule directly"],
			["proof-attempt", "Push the direct rule to the general pair"],
			["synthesis", "Summarize"],
		] as const) {
			state = addResearchPlanTask(state, {
				planId: "research-plan-1",
				kind,
				title,
				description: title,
				...(kind === "proof-attempt" ? { pathId: "path-1" } : {}),
				now: NOW,
				actor: "human",
			});
		}
		state = updateResearchPlanTask(state, {
			taskId: "research-plan-task-1",
			status: "completed",
			completedAt: NOW,
			now: NOW,
		});
		const completedTask = getResearchPlanTasks(state, "research-plan-1")[0];
		if (!completedTask) {
			throw new Error("Expected a plan task.");
		}
		const executor: ResearchWorkstreamModelExecutor = {
			run: async () => ({
				text: JSON.stringify({
					reason: "The direct rule was rejected for the pair; the Pieri route replaces it.",
					actions: [
						{ type: "cancel", taskNumber: 2, reason: "The route was rejected." },
						{
							type: "add",
							kind: "proof-attempt",
							title: "Work the Grassmannian special factor with Pieri",
							description: "Carry out the replacement route.",
							goal: "Structure constants via the Pieri route.",
							acceptanceCriteria: ["The special factor is computed."],
							pathNumber: 1,
						},
					],
				}),
			}),
		};

		const result = await amendResearchPlanAfterTask(state, "research-plan-1", {
			executor,
			completedTask,
			now: NOW,
		});

		expect(result.amended).toBe(true);
		expect(result.state.researchPivots).toHaveLength(1);
		expect(result.state.researchPivots[0]).toMatchObject({
			fromRoute: "Push the direct rule to the general pair",
			toRoute: "Work the Grassmannian special factor with Pieri",
			reason: "The direct rule was rejected for the pair; the Pieri route replaces it.",
			taskId: completedTask.id,
		});
	});
});

describe("co-math negative constraints and concrete next moves", () => {
	it("parses imperative negative-constraint bullets and drops non-imperative lines", () => {
		const constraints = parseNegativeConstraints(
			[
				"## Negative constraints",
				"- Do not cite multivariable polynomial-prime theorems as proving the one-variable n^2 + 1 statement.",
				"- Never treat proposed or heuristic preprints as settled proofs.",
				"- Interesting!",
				"- The problem is hard.",
				"- Avoid conflating general infinitude of primes with infinitude in the quadratic sequence.",
				"- Do not re-run the same search.",
			].join("\n"),
		);

		expect(constraints).toEqual([
			"Do not cite multivariable polynomial-prime theorems as proving the one-variable n^2 + 1 statement.",
			"Never treat proposed or heuristic preprints as settled proofs.",
			"Avoid conflating general infinitude of primes with infinitude in the quadratic sequence.",
		]);
		expect(
			parseNegativeConstraints("## Findings\n- Do not misread this; it is not in a constraints section."),
		).toEqual([]);
	});

	it("replaces a vague next move with the recorded replacement route", () => {
		const pivots = [
			{
				fromRoute: "literature-settlement search",
				toRoute: "standard-open-status citation, heuristic note, and residue obstruction computation",
				reason: "no accepted source proves the one-variable problem",
			},
		];
		expect(applyPivotsToSuggestedNextMove("Ask the coordinator what to try next.", pivots, [])).toBe(
			"Pursue the replacement route: standard-open-status citation, heuristic note, and residue obstruction computation.",
		);
		// A concrete next move is kept as written.
		expect(applyPivotsToSuggestedNextMove("Prove that odd n > 1 gives composite n^2 + 1.", pivots, [])).toBe(
			"Prove that odd n > 1 gives composite n^2 + 1.",
		);
		// A rejected theorem check's consequence works when no explicit pivot exists.
		expect(
			applyPivotsToSuggestedNextMove(
				undefined,
				[],
				[
					{
						theorem: "Merikoski multivariable prime values",
						targetObject: "the one-variable statement",
						hypotheses: [],
						status: "rejected-as-direct-route",
						consequence: "weaker provable statements",
					},
				],
			),
		).toBe("Pursue the replacement route: weaker provable statements.");
		// Nothing recorded leaves the suggestion untouched.
		expect(applyPivotsToSuggestedNextMove("Ask the coordinator what to try next.", [], [])).toBe(
			"Ask the coordinator what to try next.",
		);
	});

	it("shows constraints, checks, and pivots to the coordinator synthesis context", () => {
		let state = createSchubertState();
		state = addResearchConstraint(state, {
			text: "Do not treat heuristic preprints as settled proofs",
			origin: "reviewer",
			now: NOW,
		});
		state = addTheoremApplicabilityCheck(state, {
			theorem: "Merikoski multivariable prime values",
			targetObject: "infinitely many primes of the form n^2 + 1",
			status: "rejected-as-direct-route",
			consequence: "cannot settle the root question",
			now: NOW,
		});
		state = addResearchPivot(state, {
			fromRoute: "literature-settlement search",
			toRoute: "standard-open-status citation and weaker provable statements",
			reason: "no accepted source proves the one-variable problem",
			now: NOW,
		});

		const context = buildCoordinatorContext(state);
		expect(context).toContain("Standing constraints (do not violate, do not re-attempt what they exclude):");
		expect(context).toContain("Do not treat heuristic preprints as settled proofs");
		expect(context).toContain(
			"Merikoski multivariable prime values on infinitely many primes of the form n^2 + 1: rejected-as-direct-route",
		);
		expect(context).toContain("Route changes taken so far (do not silently retry an abandoned route):");
		// The full research context pack carries the same sections without duplicating them.
		const pack = buildResearchContextPack(state);
		expect(pack.match(/Standing constraints \(do not violate/g)).toHaveLength(1);
	});
});

describe("co-math research discipline harness flow", () => {
	it("persists constraints from steering, records theorem checks and pivots, and cautions later routes", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-discipline-harness-"));
		const statePath = join(dir, ".pi", "co-math", "state.json");
		try {
			const notices: string[] = [];
			const specialistRequests: ResearchWorkstreamModelRequest[] = [];
			const workstreamExecutor: ResearchWorkstreamModelExecutor = {
				run: async (request) => {
					if (request.role === "specialist") {
						specialistRequests.push(request);
						return { text: SPECIALIST_THEOREM_CHECK_NOTE };
					}
					if (request.role === "critic") {
						return { text: "## Review\n- The rejection is justified.\n## Gaps\n- None new." };
					}
					return {
						text: [
							"## Promising strategy",
							"- Work the special factor with Pieri.",
							"## Findings",
							"- The direct rule is rejected for this pair.",
							"## Gap",
							"- The replacement route is not finished.",
							"## Next",
							"- Set up the Pieri computation.",
						].join("\n"),
					};
				},
			};
			const directorExecutor: ResearchWorkstreamModelExecutor = {
				run: async (request) => {
					if (request.prompt.includes("Design a bounded research plan")) {
						return {
							text: JSON.stringify({
								objective: "Compute the structure constants for the pair.",
								tasks: [
									{
										kind: "proof-attempt",
										title: "Try the direct multiplication rule",
										description: "Check whether the well-aligned rule applies.",
										goal: "A verdict on the direct rule.",
										acceptanceCriteria: ["The rule's hypotheses are checked against the pair."],
										pathNumber: 1,
									},
									{
										kind: "proof-attempt",
										title: "Continue on the surviving route",
										description: "Work whichever route survived the check.",
										goal: "Progress on the surviving route.",
										acceptanceCriteria: ["A concrete step on the route is recorded."],
										pathNumber: 1,
									},
								],
							}),
						};
					}
					if (request.prompt.includes("A plan task just completed")) {
						return { text: JSON.stringify({ reason: "", actions: [] }) };
					}
					return { text: "## Verdict\nsound" };
				},
			};
			const harness = new CoMathHarness({
				statePath,
				startFirstRun: false,
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async () => ({ ok: true, messages: [] }),
				researchModelExecutor: workstreamExecutor,
				researchDirectorExecutor: directorExecutor,
			});
			await saveProjectState(statePath, createSchubertState());

			// A constraint-shaped steering message becomes durable state, not a one-off run.
			await harness.handlePrompt("Do not attack arbitrary Schubert multiplication.");
			const afterConstraint = await loadProjectState(statePath);
			expect(afterConstraint?.researchConstraints).toHaveLength(1);
			expect(afterConstraint?.researchConstraints[0]).toMatchObject({
				text: "Do not attack arbitrary Schubert multiplication",
				kind: "avoid",
				status: "active",
				origin: "human",
			});
			expect(notices.join("\n")).toContain("Standing constraint recorded");

			await harness.handlePrompt("work the plan for 2 steps");
			await waitFor(statePath, "completed both discipline plan tasks", (state) =>
				Boolean(
					state?.researchPlanTasks[1]?.status === "completed" && state.researchBatches[0]?.status === "completed",
				),
			);

			const state = await loadProjectState(statePath);
			if (!state) {
				throw new Error("Expected durable state.");
			}
			// The constraint reached the specialist prompt on every step.
			expect(specialistRequests.length).toBeGreaterThanOrEqual(2);
			for (const request of specialistRequests) {
				expect(request.prompt).toContain("Standing constraints");
				expect(request.prompt).toContain("Do not attack arbitrary Schubert multiplication");
			}
			// The theorem check parsed from the specialist's note is durable, with full hypotheses.
			const check = state.theoremApplicabilityChecks.find(
				(candidate) => candidate.theorem === "Spink-Tewari well-aligned rule",
			);
			expect(check).toMatchObject({
				targetObject: "the pair from the root question",
				status: "rejected-as-direct-route",
				pathId: "path-1",
				consequence: "pivot to the Grassmannian special factor plus Pieri route",
			});
			expect(check?.hypotheses).toEqual([
				{ hypothesis: "pair is well-aligned", status: "satisfied" },
				{ hypothesis: "ascent condition holds", status: "failed", note: "fails at position 3" },
			]);
			expect(check?.reportId).toBeDefined();
			// The rejection produced exactly one durable pivot: the explicit route change restates the
			// consequence pivot recorded from the check, so the paraphrase is not persisted twice.
			expect(state.researchPivots).toHaveLength(1);
			expect(state.researchPivots[0]?.fromRoute).toBe("Direct use of Spink-Tewari well-aligned rule");
			expect(state.researchPivots[0]?.applicabilityCheckId).toBe(check?.id);
			// The second task on the same path was cautioned about the rejected route.
			const secondPrompt = specialistRequests.at(-1)?.prompt ?? "";
			expect(secondPrompt).toContain("Route cautions (already checked; do not build on these as direct routes):");
			expect(secondPrompt).toContain("Spink-Tewari well-aligned rule was rejected");

			expectProductCopy(notices.join("\n"));
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

describe("co-math literature discipline harness flow", () => {
	const LITERATURE_SPECIALIST_NOTE = [
		"## Source-backed status",
		"- The reviewed context treats the one-variable problem as open. [source-1]",
		"## Conjectural or heuristic context",
		"- Bateman-Horn-type heuristics predict infinitude without proving it. [source-1]",
		"## Theorem check",
		"- Theorem: Merikoski multivariable prime values",
		"- Object: infinitely many primes of the form n^2 + 1",
		"- Hypothesis: related polynomial-prime context applies - satisfied",
		"- Hypothesis: theorem specializes to one variable - failed; the theorem is multivariable with no valid specialization",
		"- Status: rejected-as-direct-route",
		"- Consequence: cannot settle the root question",
		"## Route change",
		"- From: literature-settlement search",
		"- To: standard-open-status citation, Bateman-Horn heuristic note, residue obstruction computation, and weaker provable statements",
		"- Reason: no accepted source proves the one-variable problem; related multivariable results do not reduce to it",
		"## Negative constraints",
		"- Do not cite multivariable polynomial-prime theorems as proving the one-variable n^2 + 1 statement.",
		"- Do not treat proposed or heuristic preprints as settled proofs.",
		"## Unsupported or unresolved",
		"- An unconditional proof of the one-variable statement.",
		"## Next",
		"- Ask the coordinator what to try next.",
	].join("\n");

	it("persists the Merikoski-style rejection, pivot, and derived constraints from a literature step", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-discipline-literature-"));
		const statePath = join(dir, ".pi", "co-math", "state.json");
		try {
			const notices: string[] = [];
			const lookup: LiteratureSourceLookup = {
				search: async () => [
					{
						kind: "paper",
						title: "On prime values of multivariable polynomials",
						url: "https://example.test/multivariable-prime-values",
						summary: "Related multivariable polynomial prime value results.",
						extractedText: "Results concern multivariable polynomials, not the one-variable case.",
					},
				],
			};
			const executor: ResearchWorkstreamModelExecutor = {
				run: async (request) => {
					if (request.prompt.includes("literature specialist")) {
						return { text: LITERATURE_SPECIALIST_NOTE };
					}
					if (request.role === "critic") {
						return {
							text: [
								"## Review",
								"- The rejection of the multivariable route is justified. [source-1]",
								"## Negative constraints",
								"- Do not conflate general infinitude of primes with infinitude in the quadratic sequence.",
								"## Gaps",
								"- None new.",
							].join("\n"),
						};
					}
					return {
						text: [
							"## Source-backed status",
							"- The one-variable problem stays open in the reviewed context. [source-1]",
							"## Conjectural or heuristic context",
							"- Heuristics support infinitude without proof. [source-1]",
							"## Source-backed distinctions",
							"- Multivariable results do not specialize to one variable.",
							"## Unsupported or unresolved",
							"- An unconditional one-variable proof.",
							"## Human help useful",
							"- None.",
							"## Next",
							"- Ask the coordinator what to try next.",
							"## Working paper summary",
							"- The literature route cannot settle the question; pivot recorded.",
						].join("\n"),
					};
				},
			};
			const harness = new CoMathHarness({
				statePath,
				startFirstRun: false,
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async () => ({ ok: true, messages: [] }),
				researchModelExecutor: executor,
				literatureSourceLookup: lookup,
			});
			let state = createEmptyProjectState({
				projectId: "proj-test",
				title: "Are there infinitely many primes of the form n^2 + 1?",
				rootQuestion: "Are there infinitely many primes of the form n^2 + 1?",
				now: NOW,
			});
			state = addResearchPath(state, {
				title: "Known theorem or literature reduction",
				objective: "Find theorem references that settle or bound the question.",
				suggestedNextMove: "Search for source-backed theorem statements.",
				priority: 1,
				now: NOW,
				actor: "human",
			});
			await saveProjectState(statePath, state);

			await harness.handlePrompt("work the plan for 1 step");
			await waitFor(statePath, "completed literature discipline task", (candidate) =>
				Boolean(
					candidate?.researchPlanTasks[0]?.status === "completed" &&
						candidate.researchBatches[0]?.status === "completed",
				),
			);

			const nextState = await loadProjectState(statePath);
			if (!nextState) {
				throw new Error("Expected durable state.");
			}
			// The theorem applicability rejection is durable with its failed condition.
			const check = nextState.theoremApplicabilityChecks.find(
				(candidate) => candidate.theorem === "Merikoski multivariable prime values",
			);
			expect(check).toMatchObject({
				targetObject: "infinitely many primes of the form n^2 + 1",
				status: "rejected-as-direct-route",
				consequence: "cannot settle the root question",
			});
			expect(check?.hypotheses).toEqual([
				{ hypothesis: "related polynomial-prime context applies", status: "satisfied" },
				{
					hypothesis: "theorem specializes to one variable",
					status: "failed",
					note: "the theorem is multivariable with no valid specialization",
				},
			]);
			expect(check?.reportId).toBeDefined();
			// The pivot away from the literature-settlement route is durable.
			const pivot = nextState.researchPivots.find(
				(candidate) => candidate.fromRoute === "literature-settlement search",
			);
			expect(pivot).toMatchObject({
				toRoute:
					"standard-open-status citation, Bateman-Horn heuristic note, residue obstruction computation, and weaker provable statements",
				reason:
					"no accepted source proves the one-variable problem; related multivariable results do not reduce to it",
			});
			// Constraints derived by the roles are durable with reviewer origin (2 specialist + 1 critic).
			expect(getActiveResearchConstraints(nextState).map((constraint) => constraint.text)).toEqual([
				"Do not cite multivariable polynomial-prime theorems as proving the one-variable n^2 + 1 statement.",
				"Do not treat proposed or heuristic preprints as settled proofs.",
				"Do not conflate general infinitude of primes with infinitude in the quadratic sequence.",
			]);
			expect(nextState.researchConstraints.every((constraint) => constraint.origin === "reviewer")).toBe(true);
			// The vague "ask the coordinator" next move was replaced by the recorded replacement route.
			expect(nextState.researchReports[0]?.suggestedNextMove).toBe(
				"Pursue the replacement route: standard-open-status citation, Bateman-Horn heuristic note, residue obstruction computation, and weaker provable statements.",
			);
			// The coordinator's durable context now carries all of it.
			const context = buildCoordinatorContext(nextState);
			expect(context).toContain("Merikoski multivariable prime values");
			expect(context).toContain("Do not treat proposed or heuristic preprints as settled proofs.");
			expect(context).toContain("From: literature-settlement search");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

describe("co-math review gating and task-kind execution", () => {
	function createProofOverComputationFixture(skepticResponse: string): {
		harnessFor: (dir: string) => { harness: CoMathHarness; notices: string[]; statePath: string };
		specialistRequests: ResearchWorkstreamModelRequest[];
	} {
		const specialistRequests: ResearchWorkstreamModelRequest[] = [];
		const workstreamExecutor: ResearchWorkstreamModelExecutor = {
			run: async (request) => {
				if (request.role === "specialist") {
					specialistRequests.push(request);
					return {
						text: [
							"## Findings",
							"- Lemma: every local obstruction class vanishes on the recorded cover.",
							"- Proof sketch: the class restricts trivially to each chart and the overlaps are contractible.",
							"## Promising strategy",
							"- Globalize the local vanishing.",
							"## Gaps",
							"- The globalization step is not yet written.",
							"## Next",
							"- Write the globalization argument.",
						].join("\n"),
					};
				}
				if (request.role === "critic") {
					return { text: "## Review\n- The local argument is plausible.\n## Gaps\n- None new." };
				}
				return {
					text: [
						"## Promising strategy",
						"- Globalize the local vanishing.",
						"## Findings",
						"- **Proved:** Local non-obstruction holds on the cover.",
						"## Gap",
						"- Globalization is open.",
						"## Next",
						"- Write the globalization argument.",
					].join("\n"),
				};
			},
		};
		const directorExecutor: ResearchWorkstreamModelExecutor = {
			run: async (request) => {
				if (request.prompt.includes("Design a bounded research plan")) {
					return {
						text: JSON.stringify({
							objective: "Prove the local lemmas before globalizing.",
							tasks: [
								{
									kind: "proof-attempt",
									title: "Prove local non-obstruction lemmas",
									description: "Write the local vanishing proof.",
									goal: "A written proof of the local lemmas.",
									acceptanceCriteria: ["The lemma statement and proof are written."],
									pathNumber: 1,
								},
							],
						}),
					};
				}
				if (request.prompt.includes("A plan task just completed")) {
					return { text: JSON.stringify({ reason: "", actions: [] }) };
				}
				return { text: skepticResponse };
			},
		};
		return {
			specialistRequests,
			harnessFor: (dir: string) => {
				const statePath = join(dir, ".pi", "co-math", "state.json");
				const notices: string[] = [];
				const harness = new CoMathHarness({
					statePath,
					startFirstRun: false,
					notify: (message) => {
						notices.push(message);
					},
					runBackendCommand: async () => ({ ok: true, messages: [] }),
					researchModelExecutor: workstreamExecutor,
					researchDirectorExecutor: directorExecutor,
				});
				return { harness, notices, statePath };
			},
		};
	}

	async function seedComputationTitledPathState(statePath: string): Promise<void> {
		let state = createEmptyProjectState({
			projectId: "proj-test",
			title: "Is every map of the recorded type null-homotopic?",
			rootQuestion: "Is every map of the recorded type null-homotopic?",
			now: NOW,
		});
		// The pinned path is computational by title; the proof-attempt task must still write proof.
		state = addResearchPath(state, {
			title: "Small examples and counterexamples",
			objective: "Run bounded finite checks and search small cases.",
			suggestedNextMove: "Compute small cases.",
			priority: 1,
			now: NOW,
			actor: "human",
		});
		await saveProjectState(statePath, state);
	}

	it("runs a proof-attempt as proof work even on a computation-titled path", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-kind-dispatch-"));
		const { harnessFor, specialistRequests } = createProofOverComputationFixture("## Verdict\naccepted");
		const { harness, statePath } = harnessFor(dir);
		try {
			await seedComputationTitledPathState(statePath);
			await harness.handlePrompt("work the plan for 1 step");
			await waitFor(statePath, "completed kind-dispatch task", (state) =>
				Boolean(
					state?.researchPlanTasks[0]?.status === "completed" && state.researchBatches[0]?.status === "completed",
				),
			);

			const state = await loadProjectState(statePath);
			// The specialist prompt is the proof-first generic one, not the computation workstream.
			expect(specialistRequests.length).toBeGreaterThan(0);
			expect(specialistRequests[0]?.prompt).toContain("This is a theorem-level task. Write the mathematics itself:");
			expect(specialistRequests[0]?.prompt).not.toContain("computational specialist");
			// No deterministic bounded script ran for the proof task.
			expect(state?.computationalArtifacts).toEqual([]);
			expect(state?.researchPlanTasks[0]).toMatchObject({
				kind: "proof-attempt",
				status: "completed",
				reviewOutcome: "accepted",
				progressKind: "mathematical",
			});
			expect(state?.researchEvidenceBoard).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						claim: "Local non-obstruction holds on the cover.",
						classification: "theorem",
					}),
				]),
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("blocks a task the independent review rejects instead of completing it", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-review-rejected-"));
		const { harnessFor } = createProofOverComputationFixture(
			["## Verdict", "rejected", "## Concerns", "- The step does not meet its acceptance criteria."].join("\n"),
		);
		const { harness, notices, statePath } = harnessFor(dir);
		try {
			await seedComputationTitledPathState(statePath);
			await harness.handlePrompt("work the plan for 1 step");
			await waitFor(statePath, "paused plan after rejected review", (state) =>
				Boolean(state?.researchPlans[0]?.status === "paused" && state.researchBatches[0]?.status === "paused"),
			);

			const state = await loadProjectState(statePath);
			expect(state?.researchPlanTasks[0]?.status).toBe("blocked");
			expect(state?.researchPlanTasks[0]?.blockedReason).toContain(
				"The independent review did not accept this step as completed",
			);
			expect(state?.researchPlanTasks[0]?.reviewOutcome).toBe("rejected");
			expect(notices.join("\n")).toContain("resume plan");
			expectProductCopy(notices.join("\n"));
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("moves on to the next planned task when the review rejects one step", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-review-continue-"));
		const statePath = join(dir, ".pi", "co-math", "state.json");
		const notices: string[] = [];
		let skepticCalls = 0;
		const workstreamExecutor: ResearchWorkstreamModelExecutor = {
			run: async (request) => {
				if (request.role === "specialist") {
					return {
						text: [
							"## Findings",
							"- A bounded step was worked on the stated goal.",
							"## Gaps",
							"- More remains to be written.",
							"## Next",
							"- Write the next piece of the argument.",
						].join("\n"),
					};
				}
				if (request.role === "critic") {
					return { text: "## Review\n- The step is plausible.\n## Gaps\n- None new." };
				}
				return {
					text: [
						"## Promising strategy",
						"- Continue the written argument.",
						"## Findings",
						"- Progress on the stated goal was recorded.",
						"## Next",
						"- Write the next piece of the argument.",
					].join("\n"),
				};
			},
		};
		const directorExecutor: ResearchWorkstreamModelExecutor = {
			run: async (request) => {
				if (request.prompt.includes("Design a bounded research plan")) {
					return {
						text: JSON.stringify({
							objective: "Settle the status question, then work the mathematics directly.",
							tasks: [
								{
									kind: "proof-attempt",
									title: "Settle the settlement status",
									description: "Establish whether the question is already settled.",
									goal: "An authoritative settlement statement.",
									acceptanceCriteria: ["An authoritative settlement statement is produced."],
									pathNumber: 1,
								},
								{
									kind: "proof-attempt",
									title: "Prove the residue obstruction lemma",
									description: "Write the residue obstruction argument.",
									goal: "A written lemma with proof.",
									acceptanceCriteria: ["The lemma statement and proof are written."],
									pathNumber: 1,
								},
							],
						}),
					};
				}
				if (request.prompt.includes("A plan task just completed")) {
					return { text: JSON.stringify({ reason: "", actions: [] }) };
				}
				skepticCalls += 1;
				return skepticCalls === 1
					? {
							text: [
								"## Verdict",
								"rejected",
								"## Concerns",
								"- The step does not provide what its acceptance criteria demand.",
							].join("\n"),
						}
					: { text: "## Verdict\naccepted" };
			},
		};
		const harness = new CoMathHarness({
			statePath,
			startFirstRun: false,
			notify: (message) => {
				notices.push(message);
			},
			runBackendCommand: async () => ({ ok: true, messages: [] }),
			researchModelExecutor: workstreamExecutor,
			researchDirectorExecutor: directorExecutor,
		});
		try {
			await seedComputationTitledPathState(statePath);
			await harness.handlePrompt("work the plan for 2 steps");
			await waitFor(statePath, "batch completed past the rejection", (state) =>
				Boolean(state?.researchBatches[0]?.status === "completed"),
			);

			const state = await loadProjectState(statePath);
			// The rejected step is durably rejected but kept its trail to what the run produced.
			expect(state?.researchPlanTasks[0]).toMatchObject({ status: "blocked", reviewOutcome: "rejected" });
			expect(state?.researchPlanTasks[0]?.reportId).toBeDefined();
			// The plan did not pause: the second task ran and completed, which settles the plan.
			expect(state?.researchPlanTasks[1]).toMatchObject({ status: "completed", reviewOutcome: "accepted" });
			expect(state?.researchPlans[0]?.status).toBe("completed");
			// The rejected step consumed one bounded step of the user's budget.
			expect(state?.researchBatches[0]?.completedStepCount).toBe(2);
			expect(notices.join("\n")).toContain("Moving on to the next planned task instead of retrying the same step.");
			expectProductCopy(notices.join("\n"));
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("marks concerns as completed-with-concerns and keeps review artifacts out of progress classification", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-review-concerns-"));
		const { harnessFor } = createProofOverComputationFixture(
			[
				"## Verdict",
				"needs-revision",
				"## Concerns",
				"- The globalization step is asserted without an argument.",
				"## Counterexample target",
				"**Proved:** Local non-obstruction holds on the cover.",
				"## Counterexample script",
				"```python",
				"print('counterexample_found: false')",
				"```",
			].join("\n"),
		);
		const { harness, notices, statePath } = harnessFor(dir);
		try {
			await seedComputationTitledPathState(statePath);
			await harness.handlePrompt("work the plan for 1 step");
			await waitFor(statePath, "completed reviewed task", (state) =>
				Boolean(
					state?.researchPlanTasks[0]?.status === "completed" && state.researchBatches[0]?.status === "completed",
				),
			);

			const state = await loadProjectState(statePath);
			const task = state?.researchPlanTasks[0];
			expect(task).toMatchObject({ status: "completed", reviewOutcome: "completed-with-concerns" });
			// The skeptic's own script and evidence stay linked to the task but never count as the
			// step's mathematical output; the report's proved local lemma does.
			expect(task?.computationalArtifactIds.length).toBeGreaterThan(0);
			expect(task?.progressKind).toBe("mathematical");
			expect(notices.join("\n")).toContain(
				"The independent review raised concerns; they are recorded with the step.",
			);
			expectProductCopy(notices.join("\n"));
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

async function waitFor(
	statePath: string,
	description: string,
	condition: (state: Awaited<ReturnType<typeof loadProjectState>>) => boolean,
): Promise<void> {
	for (let attempt = 0; attempt < 500; attempt += 1) {
		if (condition(await loadProjectState(statePath))) {
			return;
		}
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});
	}
	throw new Error(`Timed out waiting for ${description}.`);
}
