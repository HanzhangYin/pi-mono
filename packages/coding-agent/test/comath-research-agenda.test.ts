import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CoMathHarness } from "../src/modes/comath/comath-harness.ts";
import {
	classifyResearchTaskProgress,
	deriveResearchAgenda,
	inferTaskKindForRoute,
	violatesRejectedRoute,
} from "../src/modes/comath/comath-research-agenda.ts";
import { buildDirectorPlanPrompt, proposeResearchPlan } from "../src/modes/comath/comath-research-director.ts";
import type { ResearchWorkstreamModelExecutor } from "../src/modes/comath/comath-research-model-workstream.ts";
import { DEGRADED_RESEARCH_GAP } from "../src/modes/comath/comath-research-obligations.ts";
import {
	buildResearchPlanTaskBlueprints,
	chooseResearchPathForPlanTaskKind,
	createResearchPlanFromState,
} from "../src/modes/comath/comath-research-planner.ts";
import type { CoMathProjectState } from "../src/modes/comath/schema.ts";
import {
	addResearchEvidenceBoardEntry,
	addResearchObligation,
	addResearchPath,
	addResearchPivot,
	addResearchPlan,
	addResearchPlanTask,
	addResearchWorkstreamReport,
	addTheoremApplicabilityCheck,
	createEmptyProjectState,
	getResearchPlanTasks,
	loadProjectState,
	saveProjectState,
	updateResearchObligation,
} from "../src/modes/comath/storage.ts";

const NOW = "2026-06-05T12:00:00.000Z";

function createResearchState(): CoMathProjectState {
	let state = createEmptyProjectState({
		projectId: "proj-test",
		title: "Is every even integer greater than 2 the sum of two primes?",
		rootQuestion: "Is every even integer greater than 2 the sum of two primes?",
		now: NOW,
	});
	state = addResearchPath(state, {
		title: "Small examples and counterexamples",
		objective: "Run bounded finite checks.",
		suggestedNextMove: "Compute small cases.",
		priority: 1,
		now: NOW,
		actor: "human",
	});
	state = addResearchPath(state, {
		title: "Direct proof attempt",
		objective: "Try a direct proof.",
		suggestedNextMove: "Check whether simple arguments apply.",
		priority: 2,
		now: NOW,
		actor: "human",
	});
	state = addResearchPath(state, {
		title: "Known theorem or literature reduction",
		objective: "Find theorem references.",
		suggestedNextMove: "Find source-backed theorem statements.",
		priority: 3,
		now: NOW,
		actor: "human",
	});
	return state;
}

function withCompletedLiteratureTask(state: CoMathProjectState): CoMathProjectState {
	let nextState = addResearchPlan(state, { title: "Plan", objective: "Progress.", now: NOW, actor: "human" });
	nextState = addResearchPlanTask(nextState, {
		planId: "research-plan-1",
		kind: "literature-search",
		title: "Check the literature for known results",
		description: "Search for sources.",
		pathId: "path-3",
		now: NOW,
		actor: "human",
	});
	const task = getResearchPlanTasks(nextState, "research-plan-1")[0];
	if (!task) {
		throw new Error("Expected a plan task.");
	}
	return {
		...nextState,
		researchPlanTasks: nextState.researchPlanTasks.map((candidate) =>
			candidate.id === task.id ? { ...candidate, status: "completed" as const } : candidate,
		),
	};
}

describe("co-math research agenda", () => {
	it("is empty for a fresh workspace so the static blueprint applies unchanged", () => {
		const state = createResearchState();
		expect(deriveResearchAgenda(state)).toEqual([]);
		expect(buildResearchPlanTaskBlueprints(state).map((blueprint) => blueprint.kind)).toEqual([
			"computation",
			"proof-attempt",
			"literature-search",
			"refutation-attempt",
			"synthesis",
		]);
	});

	it("lands the twin-track default tasks on different suitable paths when two exist", () => {
		const state = addResearchPath(createResearchState(), {
			title: "Weaker special cases",
			objective: "Identify tractable weaker statements, special cases, or finite checks.",
			suggestedNextMove: "Pick a weaker statement to test.",
			priority: 4,
			now: NOW,
			actor: "human",
		});

		const blueprints = buildResearchPlanTaskBlueprints(state);
		const pathByKind = new Map(blueprints.map((blueprint) => [blueprint.kind, blueprint.pathId]));
		expect(pathByKind.get("computation")).toBe("path-1");
		expect(pathByKind.get("proof-attempt")).toBe("path-2");
		// The refutation attempt spreads to the untouched computational path instead of stacking
		// onto the path the computation task already claimed.
		expect(pathByKind.get("refutation-attempt")).toBe("path-4");
		// Rebuilding from the same state chooses identically: selection is deterministic.
		expect(buildResearchPlanTaskBlueprints(state)).toEqual(blueprints);
	});

	it("prefers the least-worked suitable path with a stable tie-break by path order", () => {
		let state = addResearchPath(createResearchState(), {
			title: "Weaker special cases",
			objective: "Identify tractable weaker statements, special cases, or finite checks.",
			suggestedNextMove: "Pick a weaker statement to test.",
			priority: 4,
			now: NOW,
			actor: "human",
		});
		// Both computational paths are untouched: the earlier path wins the tie.
		expect(chooseResearchPathForPlanTaskKind(state, "computation")?.id).toBe("path-1");

		// Recorded work on the first path moves selection to the untouched one.
		state = addResearchEvidenceBoardEntry(state, {
			pathId: "path-1",
			claim: "Small cases support the statement.",
			classification: "computation",
			rationale: "Recorded for the coverage test.",
			now: NOW,
			actor: "workstream",
		});
		expect(chooseResearchPathForPlanTaskKind(state, "computation")?.id).toBe("path-4");

		// Paths claimed while building the same plan count as work; a fresh tie falls back to path order.
		expect(chooseResearchPathForPlanTaskKind(state, "computation", { plannedPathIds: ["path-4"] })?.id).toBe(
			"path-1",
		);
	});

	it("keeps twin-track tasks on the single suitable path when only one exists", () => {
		let state = createEmptyProjectState({
			projectId: "proj-test",
			title: "Is every even integer greater than 2 the sum of two primes?",
			rootQuestion: "Is every even integer greater than 2 the sum of two primes?",
			now: NOW,
		});
		state = addResearchPath(state, {
			title: "Direct proof attempt",
			objective: "Try a direct proof.",
			suggestedNextMove: "Check whether simple arguments apply.",
			priority: 1,
			now: NOW,
			actor: "human",
		});

		const blueprints = buildResearchPlanTaskBlueprints(state);
		expect(blueprints.map((blueprint) => blueprint.kind)).toEqual([
			"proof-attempt",
			"refutation-attempt",
			"synthesis",
		]);
		expect(blueprints[0]?.pathId).toBe("path-1");
		expect(blueprints[1]?.pathId).toBe("path-1");
	});

	it("puts repairing a refuted statement first and skips it when a revision is already planned", () => {
		let state = addResearchObligation(createResearchState(), {
			statement: "Every even integer greater than 2 is the sum of two primes.",
			status: "refuted",
			statusReason: "A recorded counterexample stands against it.",
			now: NOW,
		});

		const agenda = deriveResearchAgenda(state);
		expect(agenda[0]).toMatchObject({ kind: "revise-conjecture", title: "Repair the refuted statement" });
		expect(agenda[0]?.goal).toContain("was refuted");

		state = addResearchPlan(state, { title: "Plan", objective: "Progress.", now: NOW, actor: "human" });
		state = addResearchPlanTask(state, {
			planId: "research-plan-1",
			kind: "revise-conjecture",
			title: "Repair the statement",
			description: "Propose a revised statement.",
			now: NOW,
			actor: "human",
		});
		expect(deriveResearchAgenda(state).some((item) => item.kind === "revise-conjecture")).toBe(false);
	});

	it("turns an unconsumed pivot into a task with an inferred kind and provenance goal", () => {
		const state = addResearchPivot(createResearchState(), {
			fromRoute: "literature-settlement search",
			toRoute: "residue obstruction computations on small cases",
			reason: "no accepted source settles the question",
			now: NOW,
		});

		const agenda = deriveResearchAgenda(state);
		const pivotItem = agenda.find((item) => item.title.startsWith("Pursue the replacement route"));
		expect(pivotItem).toMatchObject({ kind: "computation" });
		expect(pivotItem?.goal).toContain('The route "literature-settlement search" was abandoned');

		// Once a task carries the route, the pivot is consumed.
		let consumed = addResearchPlan(state, { title: "Plan", objective: "Progress.", now: NOW, actor: "human" });
		consumed = addResearchPlanTask(consumed, {
			planId: "research-plan-1",
			kind: "computation",
			title: "Pursue the replacement route: residue obstruction computations on small cases",
			description: "residue obstruction computations on small cases",
			pathId: "path-1",
			now: NOW,
			actor: "human",
		});
		expect(deriveResearchAgenda(consumed).some((item) => item.title.startsWith("Pursue the replacement route"))).toBe(
			false,
		);
	});

	it("infers route kinds without hardcoding any problem", () => {
		expect(inferTaskKindForRoute("cite an authoritative open-status reference")).toBe("literature-search");
		expect(inferTaskKindForRoute("residue obstruction computation over small moduli")).toBe("computation");
		expect(inferTaskKindForRoute("disprove the auxiliary claim")).toBe("refutation-attempt");
		expect(inferTaskKindForRoute("prove the weaker bounded-gap statement")).toBe("proof-attempt");
	});

	it("drops any item that names a theorem rejected as a direct route", () => {
		const state = addTheoremApplicabilityCheck(
			addResearchPivot(createResearchState(), {
				fromRoute: "structural route",
				toRoute: "apply the Spink-Tewari well-aligned rule to the pair",
				reason: "seemed promising before the check",
				now: NOW,
			}),
			{
				theorem: "Spink-Tewari well-aligned rule",
				targetObject: "the pair",
				status: "rejected-as-direct-route",
				now: NOW,
			},
		);

		expect(violatesRejectedRoute(state, "Apply the Spink-Tewari well-aligned rule directly")).toBe(true);
		expect(violatesRejectedRoute(state, "Compute residues modulo small primes")).toBe(false);
		expect(deriveResearchAgenda(state).some((item) => /spink-tewari/i.test(item.title))).toBe(false);
	});

	it("turns reviewable gaps into tasks but never the degraded-run gap", () => {
		let state = addResearchObligation(createResearchState(), {
			statement: "The main claim.",
			status: "supported",
			evidenceEntryIds: ["evidence-board-1"],
			gaps: [DEGRADED_RESEARCH_GAP],
			now: NOW,
		});
		expect(deriveResearchAgenda(state).some((item) => item.title.startsWith("Close a recorded gap"))).toBe(false);

		state = updateResearchObligation(state, {
			obligationId: "obligation-1",
			addGaps: ["The parity argument assumes the pair is coprime without proof."],
			now: NOW,
		});
		const gapItem = deriveResearchAgenda(state).find((item) => item.title.startsWith("Close a recorded gap"));
		expect(gapItem).toMatchObject({ kind: "proof-attempt" });
		expect(gapItem?.title).toContain("parity argument");
	});

	it("turns supported subclaims into settle tasks", () => {
		let state = addResearchObligation(createResearchState(), {
			statement: "The main claim.",
			now: NOW,
		});
		state = addResearchObligation(state, {
			statement: "Every counterexample must be divisible by a small prime.",
			parentObligationId: "obligation-1",
			status: "supported",
			evidenceEntryIds: ["evidence-board-1"],
			now: NOW,
		});

		const item = deriveResearchAgenda(state).find((candidate) => candidate.title.startsWith("Settle the subclaim"));
		expect(item).toMatchObject({ kind: "proof-attempt" });
		expect(item?.title).toContain("divisible by a small prime");
	});

	it("falls back to direct mathematics after an inconclusive literature pass", () => {
		const state = withCompletedLiteratureTask(createResearchState());

		const agenda = deriveResearchAgenda(state);
		expect(agenda.map((item) => item.kind)).toEqual(["computation", "proof-attempt"]);
		expect(agenda[0]?.title).toBe("Build direct evidence with bounded computations");
		expect(agenda[1]?.title).toBe("Prove a weaker or special-case statement");
		expect(agenda[0]?.goal).toContain("did not settle the question");

		// A settled root claim removes the fallback.
		const settled = addResearchObligation(state, {
			statement: state.rootQuestion,
			status: "supported",
			evidenceEntryIds: ["evidence-board-1"],
			now: NOW,
		});
		expect(deriveResearchAgenda(settled)).toEqual([]);
	});

	it("creates continuation plans from the agenda with goals and a closing synthesis", () => {
		const state = addResearchPivot(withCompletedLiteratureTask(createResearchState()), {
			fromRoute: "literature-settlement search",
			toRoute: "prove the weaker statement for even integers below a bound",
			reason: "no accepted source settles the question",
			now: NOW,
		});

		const created = createResearchPlanFromState(state, { now: NOW, actor: "human" });
		const tasks = getResearchPlanTasks(created.state, created.plan.id);
		expect(tasks[0]?.title).toContain("Pursue the replacement route");
		expect(tasks[0]?.goal).toContain("was abandoned");
		expect(tasks.at(-1)?.kind).toBe("synthesis");
		// The continuation does not restart the static blueprint.
		expect(tasks.some((task) => task.title === "Check the literature for known results")).toBe(false);
	});

	it("filters rejected routes out of model-authored plans and shows the agenda to the director", async () => {
		const state = addTheoremApplicabilityCheck(
			addResearchPivot(createResearchState(), {
				fromRoute: "direct rule application",
				toRoute: "residue obstruction computations",
				reason: "the rule was rejected for this object",
				now: NOW,
			}),
			{
				theorem: "Spink-Tewari well-aligned rule",
				targetObject: "the pair",
				status: "rejected-as-direct-route",
				now: NOW,
			},
		);

		expect(buildDirectorPlanPrompt(state)).toContain("Continuation agenda derived from the durable state");

		const executor: ResearchWorkstreamModelExecutor = {
			run: async () => ({
				text: JSON.stringify({
					objective: "Continue the research.",
					tasks: [
						{
							kind: "proof-attempt",
							title: "Apply the Spink-Tewari well-aligned rule directly",
							description: "Use the rejected rule anyway.",
							pathNumber: 2,
						},
						{
							kind: "computation",
							title: "Run the residue obstruction computations",
							description: "Carry out the replacement route.",
							pathNumber: 1,
						},
					],
				}),
			}),
		};
		const result = await proposeResearchPlan(state, { executor, now: NOW, actor: "human" });

		expect(result.source).toBe("model");
		const tasks = getResearchPlanTasks(result.state, result.plan.id);
		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.title).toBe("Run the residue obstruction computations");
		expect(tasks.some((task) => /spink-tewari/i.test(`${task.title} ${task.description}`))).toBe(false);
	});
});

describe("co-math continuation harness flow", () => {
	it("plans the recorded pivot and mathematical fallbacks instead of restarting after a completed plan", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-agenda-harness-"));
		const statePath = join(dir, ".pi", "co-math", "state.json");
		const notices: string[] = [];
		const harness = new CoMathHarness({
			statePath,
			startFirstRun: false,
			notify: (message) => {
				notices.push(message);
			},
			runBackendCommand: async (command) => {
				if (command.startsWith("init ")) {
					await saveProjectState(
						statePath,
						createEmptyProjectState({
							projectId: "proj-test",
							title: command.slice("init ".length),
							rootQuestion: command.slice("init ".length),
							now: NOW,
						}),
					);
				}
				return { ok: true, messages: [] };
			},
		});
		try {
			await harness.handlePrompt(
				"Explore this problem: Is every even integer greater than 2 the sum of two primes?",
			);
			await harness.handlePrompt("work for 5 steps");
			await waitFor(statePath, "completed first deterministic plan", (state) =>
				Boolean(
					state?.researchPlans[0]?.status === "completed" && state.researchBatches[0]?.status === "completed",
				),
			);

			// A route failure and its recorded pivot arrive from review (simulated durable records).
			const afterFirstPlan = await loadProjectState(statePath);
			if (!afterFirstPlan) {
				throw new Error("Expected durable state.");
			}
			let seeded = addTheoremApplicabilityCheck(afterFirstPlan, {
				theorem: "Vinogradov three-primes bound",
				targetObject: "the even-integer statement",
				status: "rejected-as-direct-route",
				consequence: "the theorem covers odd integers, not the even case",
				now: new Date().toISOString(),
				actor: "reviewer",
			});
			seeded = addResearchPivot(seeded, {
				fromRoute: "settle it by the Vinogradov three-primes bound",
				toRoute: "residue obstruction computations for small even integers",
				reason: "the theorem covers odd integers, not the even case",
				now: new Date().toISOString(),
				actor: "reviewer",
			});
			await saveProjectState(statePath, seeded);

			await harness.handlePrompt("continue the plan");
			await waitFor(statePath, "completed continuation batch", (state) =>
				Boolean(state?.researchBatches[1]?.status === "completed"),
			);

			const state = await loadProjectState(statePath);
			if (!state) {
				throw new Error("Expected durable state.");
			}
			expect(state.researchPlans).toHaveLength(2);
			const continuation = getResearchPlanTasks(state, state.researchPlans[1]?.id ?? "");
			// The pivot's replacement route leads the plan; the rejected theorem never reappears; the
			// static blueprint is not restarted.
			expect(continuation[0]?.title).toContain("Pursue the replacement route");
			expect(continuation[0]?.kind).toBe("computation");
			expect(continuation.some((task) => /vinogradov/i.test(`${task.title} ${task.description}`))).toBe(false);
			expect(continuation.some((task) => task.title === "Check the literature for known results")).toBe(false);
			// The generic computation fallback is suppressed as a repeat: the first plan already ran a
			// bounded computation and this restatement names no new bound or methodology. The pivot
			// task above carries the computational direction instead.
			expect(continuation.some((task) => task.title === "Build direct evidence with bounded computations")).toBe(
				false,
			);
			expect(continuation.at(-1)?.kind).toBe("synthesis");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

describe("co-math task progress classification", () => {
	it("classifies computations, evidence, obstructions, and status deterministically", () => {
		let state = createResearchState();
		state = addResearchEvidenceBoardEntry(state, {
			claim: "A conflicting finding.",
			classification: "conflicting",
			rationale: "Recorded for the classification test.",
			now: NOW,
			actor: "workstream",
		});
		state = addResearchEvidenceBoardEntry(state, {
			claim: "Background context.",
			classification: "survey-context",
			rationale: "Recorded for the classification test.",
			now: NOW,
			actor: "workstream",
		});
		state = addResearchWorkstreamReport(state, {
			pathId: "path-2",
			pathTitle: "Direct proof attempt",
			status: "completed",
			startedAt: NOW,
			completedAt: NOW,
			coordinatorBrief: "Try it.",
			steps: [],
			promisingStrategy: [],
			findings: ["The route was checked."],
			criticisms: [],
			gaps: [],
			humanHelpUseful: [],
			suggestedNextMove: "Pivot.",
			workingPaperSectionTitle: "Direct proof attempts",
			now: NOW,
			actor: "synthesizer",
		});
		state = addTheoremApplicabilityCheck(state, {
			theorem: "Some named rule",
			targetObject: "the object",
			status: "rejected-as-direct-route",
			reportId: "research-report-1",
			now: NOW,
		});

		const base = { kind: "proof-attempt" as const, evidenceEntryIds: [], computationalArtifactIds: [] };
		expect(
			classifyResearchTaskProgress(state, { ...base, computationalArtifactIds: ["computation-artifact-1"] }),
		).toBe("mathematical");
		expect(classifyResearchTaskProgress(state, { ...base, evidenceEntryIds: ["evidence-board-1"] })).toBe(
			"mathematical",
		);
		// Context-only evidence does not count as mathematical content.
		expect(classifyResearchTaskProgress(state, { ...base, evidenceEntryIds: ["evidence-board-2"] })).toBe("status");
		expect(classifyResearchTaskProgress(state, { ...base, reportId: "research-report-1" })).toBe("obstruction");
		expect(classifyResearchTaskProgress(state, base)).toBe("status");
		expect(classifyResearchTaskProgress(state, { ...base, kind: "revise-conjecture" })).toBe("mathematical");
	});
});

describe("co-math autonomous continuation", () => {
	async function createContinuationFixture(): Promise<{
		dir: string;
		harness: CoMathHarness;
		notices: string[];
		statePath: string;
	}> {
		const dir = await mkdtemp(join(tmpdir(), "comath-autonomy-"));
		const statePath = join(dir, ".pi", "co-math", "state.json");
		const notices: string[] = [];
		const harness = new CoMathHarness({
			statePath,
			startFirstRun: false,
			notify: (message) => {
				notices.push(message);
			},
			runBackendCommand: async () => ({ ok: true, messages: [] }),
		});
		// Literature and proof paths only: the static plan has four tasks, leaving budget for the
		// derived continuation when the user asks for five steps.
		let state = createEmptyProjectState({
			projectId: "proj-test",
			title: "Does every finite group admit a presentation with the recorded property?",
			rootQuestion: "Does every finite group admit a presentation with the recorded property?",
			now: NOW,
		});
		state = addResearchPath(state, {
			title: "Direct proof attempt",
			objective: "Try a direct proof.",
			suggestedNextMove: "Check whether simple arguments apply.",
			priority: 1,
			now: NOW,
			actor: "human",
		});
		state = addResearchPath(state, {
			title: "Known theorem or literature reduction",
			objective: "Find theorem references.",
			suggestedNextMove: "Find source-backed theorem statements.",
			priority: 2,
			now: NOW,
			actor: "human",
		});
		await saveProjectState(statePath, state);
		return { dir, harness, notices, statePath };
	}

	it("continues into a derived plan within the step budget instead of stopping at the status summary", async () => {
		const { dir, harness, notices, statePath } = await createContinuationFixture();
		try {
			await harness.handlePrompt("work the plan for 5 steps");
			await waitFor(statePath, "completed autonomous batch", (state) =>
				Boolean(state?.researchBatches[0]?.status === "completed"),
			);

			const state = await loadProjectState(statePath);
			if (!state) {
				throw new Error("Expected durable state.");
			}
			// Plan 1 (four static tasks) finished inside the five-step budget; the harness derived a
			// continuation plan and ran its first task instead of stopping.
			expect(state.researchPlans).toHaveLength(2);
			expect(state.researchPlans[0]?.status).toBe("completed");
			expect(state.researchBatches[0]).toMatchObject({ status: "completed", completedStepCount: 5 });
			const continuation = getResearchPlanTasks(state, state.researchPlans[1]?.id ?? "");
			expect(continuation[0]).toMatchObject({
				title: "Prove a weaker or special-case statement",
				status: "completed",
			});
			// The continuation never repeats already-run work.
			expect(continuation.some((task) => task.title === "Check the literature for known results")).toBe(false);
			// Every completed task carries its progress classification (deterministic runs are status/context).
			const completedTasks = state.researchPlanTasks.filter((task) => task.status === "completed");
			expect(completedTasks.length).toBeGreaterThan(0);
			expect(completedTasks.every((task) => task.progressKind !== undefined)).toBe(true);

			const visible = notices.join("\n");
			expect(visible).toContain("The plan finished with steps left in the budget.");
			expect(visible).toContain("I'm deriving the next round and continuing");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("stops at the budget boundary without continuation when the budget is exactly consumed", async () => {
		const { dir, harness, notices, statePath } = await createContinuationFixture();
		try {
			await harness.handlePrompt("work the plan for 4 steps");
			await waitFor(statePath, "completed exact-budget batch", (state) =>
				Boolean(state?.researchBatches[0]?.status === "completed"),
			);

			const state = await loadProjectState(statePath);
			expect(state?.researchPlans).toHaveLength(1);
			expect(state?.researchBatches[0]).toMatchObject({ status: "completed", completedStepCount: 4 });
			expect(notices.join("\n")).not.toContain("The plan finished with steps left in the budget.");
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
