import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CoMathHarness } from "../src/modes/comath/comath-harness.ts";
import type {
	ResearchWorkstreamModelExecutor,
	ResearchWorkstreamModelRequest,
} from "../src/modes/comath/comath-research-model-workstream.ts";
import {
	buildConjectureRevisionPrompt,
	collectRefutingEvidence,
	findRevisionTarget,
	parseConjectureRevisions,
	runConjectureRevisionTask,
} from "../src/modes/comath/comath-research-revision.ts";
import type { CoMathProjectState, ResearchPlanTaskRecord } from "../src/modes/comath/schema.ts";
import {
	addResearchEvidenceBoardEntry,
	addResearchPath,
	addResearchPlan,
	addResearchPlanTask,
	createEmptyProjectState,
	getEvidenceLineage,
	getResearchPlanTasks,
	loadProjectState,
	saveProjectState,
} from "../src/modes/comath/storage.ts";

const NOW = "2026-06-05T12:00:00.000Z";

const FORBIDDEN_PRODUCT_TERMS = ["role-run", "queue", "schema", "artifact", "workstream-", "/comath"];

function expectProductCopy(text: string): void {
	for (const term of FORBIDDEN_PRODUCT_TERMS) {
		expect(text).not.toContain(term);
	}
}

function createEulerState(): CoMathProjectState {
	let state = createEmptyProjectState({
		projectId: "proj-test",
		title: "Is n^2 + n + 41 prime for every non-negative integer n?",
		rootQuestion: "Is n^2 + n + 41 prime for every non-negative integer n?",
		now: NOW,
	});
	state = addResearchPath(state, {
		title: "Direct proof attempt",
		objective: "Try a direct proof.",
		suggestedNextMove: "Check whether simple arguments apply or fail.",
		priority: 1,
		now: NOW,
		actor: "human",
	});
	return state;
}

function stateWithRefutingEvidence(): CoMathProjectState {
	return addResearchEvidenceBoardEntry(createEulerState(), {
		claim: "n = 40 gives 41^2 = 1681, which is composite.",
		classification: "conflicting",
		rationale: "Direct factorization of the polynomial value.",
		now: NOW,
		actor: "workstream",
	});
}

function revisionTask(state: CoMathProjectState): { state: CoMathProjectState; task: ResearchPlanTaskRecord } {
	let nextState = addResearchPlan(state, { title: "Plan", objective: "Progress.", now: NOW, actor: "human" });
	nextState = addResearchPlanTask(nextState, {
		planId: "research-plan-1",
		kind: "revise-conjecture",
		title: "Repair the statement",
		description: "Propose a revised statement that fits the evidence.",
		goal: "A defensible revised statement.",
		acceptanceCriteria: ["The revision excludes exactly what failed."],
		now: NOW,
		actor: "human",
	});
	const task = getResearchPlanTasks(nextState, "research-plan-1")[0];
	if (!task) {
		throw new Error("Expected a plan task.");
	}
	return { state: nextState, task };
}

describe("co-math conjecture revision", () => {
	it("parses and validates revision drafts with caps and kind fallback", () => {
		const drafts = parseConjectureRevisions(
			JSON.stringify({
				revisions: [
					{
						statement: "n^2 + n + 41 is prime for every integer 0 <= n <= 39.",
						revisionKind: "weakened",
						note: "n = 40 gives 41^2.",
					},
					{ statement: "Composite values of n^2 + n + 41 have density zero.", revisionKind: "made-up" },
					{ statement: "A third revision beyond the cap.", revisionKind: "repaired" },
					{ revisionKind: "weakened", note: "No statement; dropped." },
				],
			}),
		);

		expect(drafts).toHaveLength(2);
		expect(drafts[0]).toMatchObject({
			statement: "n^2 + n + 41 is prime for every integer 0 <= n <= 39.",
			revisionKind: "weakened",
			note: "n = 40 gives 41^2.",
		});
		// Unknown revision kinds fall back to "repaired" instead of being invented.
		expect(drafts[1]?.revisionKind).toBe("repaired");
		expect(parseConjectureRevisions("no json here")).toEqual([]);
		expect(parseConjectureRevisions('{"revisions": "not an array"}')).toEqual([]);
	});

	it("collects refuting evidence and builds a revision prompt around the wounded statement", () => {
		const state = stateWithRefutingEvidence();
		const { state: planState, task } = revisionTask(state);

		const refuting = collectRefutingEvidence(planState);
		expect(refuting[0]).toContain("n = 40 gives 41^2 = 1681");
		expect(findRevisionTarget(planState)).toBeUndefined();

		const prompt = buildConjectureRevisionPrompt(planState, undefined, refuting, task);
		expect(prompt).toContain("Statement under revision: Is n^2 + n + 41 prime for every non-negative integer n?");
		expect(prompt).toContain("- n = 40 gives 41^2 = 1681, which is composite.");
		expect(prompt).toContain("Task goal: A defensible revised statement.");
		expect(prompt).toContain("- The revision excludes exactly what failed.");
		expect(prompt).toContain('"revisions"');
	});

	it("persists revisions as lineage children and records the original statement as the root", async () => {
		const { state, task } = revisionTask(stateWithRefutingEvidence());
		const executor: ResearchWorkstreamModelExecutor = {
			run: async () => ({
				text: JSON.stringify({
					revisions: [
						{
							statement: "n^2 + n + 41 is prime for every integer 0 <= n <= 39.",
							revisionKind: "weakened",
							note: "n = 40 gives 41^2, which is composite.",
						},
					],
				}),
			}),
		};

		const result = await runConjectureRevisionTask(state, { executor, task, now: NOW });

		expect(result.outcome).toBe("revised");
		expect(result.revisedEntryIds).toHaveLength(1);
		const parent = result.state.researchEvidenceBoard.find((entry) => entry.id === result.parentEntryId);
		expect(parent).toMatchObject({
			claim: "Is n^2 + n + 41 prime for every non-negative integer n?",
			classification: "conjecture",
		});
		const revised = result.state.researchEvidenceBoard.find((entry) => entry.id === result.revisedEntryIds[0]);
		expect(revised).toMatchObject({
			claim: "n^2 + n + 41 is prime for every integer 0 <= n <= 39.",
			classification: "conjecture",
			parentEntryId: result.parentEntryId,
			revisionKind: "weakened",
			revisionNote: "n = 40 gives 41^2, which is composite.",
		});
		expect(getEvidenceLineage(result.state, result.revisedEntryIds[0] ?? "").map((entry) => entry.claim)).toEqual([
			"Is n^2 + n + 41 prime for every non-negative integer n?",
			"n^2 + n + 41 is prime for every integer 0 <= n <= 39.",
		]);
	});

	it("chains a second revision onto the previous one instead of the refuted root", async () => {
		const { state, task } = revisionTask(stateWithRefutingEvidence());
		const first = await runConjectureRevisionTask(state, {
			executor: {
				run: async () => ({
					text: JSON.stringify({
						revisions: [{ statement: "First revision.", revisionKind: "weakened", note: "n = 40 fails." }],
					}),
				}),
			},
			task,
			now: NOW,
		});

		const second = await runConjectureRevisionTask(first.state, {
			executor: {
				run: async (request) => {
					expect(request.prompt).toContain("Statement under revision: First revision.");
					return {
						text: JSON.stringify({
							revisions: [{ statement: "Second revision.", revisionKind: "specialized", note: "Sharper." }],
						}),
					};
				},
			},
			task,
			now: NOW,
		});

		expect(second.outcome).toBe("revised");
		const leaf = second.state.researchEvidenceBoard.find((entry) => entry.claim === "Second revision.");
		expect(getEvidenceLineage(second.state, leaf?.id ?? "").map((entry) => entry.claim)).toEqual([
			"Is n^2 + n + 41 prime for every non-negative integer n?",
			"First revision.",
			"Second revision.",
		]);
	});

	it("blocks without a model executor and persists nothing", async () => {
		const { state, task } = revisionTask(stateWithRefutingEvidence());

		const result = await runConjectureRevisionTask(state, { task, now: NOW });

		expect(result.outcome).toBe("blocked");
		expect(result.blockedReason).toBe("I need a research model to propose revised statements.");
		expect(result.state).toBe(state);
		expectProductCopy(result.blockedReason ?? "");
	});

	it("blocks when nothing has refuted the statement or when the draft is unusable", async () => {
		const { state: cleanState, task: cleanTask } = revisionTask(createEulerState());
		const cleanResult = await runConjectureRevisionTask(cleanState, {
			executor: { run: async () => ({ text: "{}" }) },
			task: cleanTask,
			now: NOW,
		});
		expect(cleanResult.outcome).toBe("blocked");
		expect(cleanResult.blockedReason).toContain("nothing to revise");

		const { state, task } = revisionTask(stateWithRefutingEvidence());
		const unusable = await runConjectureRevisionTask(state, {
			executor: { run: async () => ({ text: "Let me think about how to revise this..." }) },
			task,
			now: NOW,
		});
		expect(unusable.outcome).toBe("blocked");
		expect(unusable.blockedReason).toBe("The revision draft did not contain a usable revised statement.");
		expect(unusable.state).toBe(state);

		const failing = await runConjectureRevisionTask(state, {
			executor: {
				run: async () => {
					throw new Error("model unavailable");
				},
			},
			task,
			now: NOW,
		});
		expect(failing.outcome).toBe("blocked");
		expect(failing.state).toBe(state);
	});
});

describe("co-math twin-track harness flow", () => {
	it("refutes the statement, announces it, and revises it with durable lineage", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-lineage-harness-"));
		const statePath = join(dir, ".pi", "co-math", "state.json");
		try {
			const notices: string[] = [];
			const specialistRequests: ResearchWorkstreamModelRequest[] = [];
			let specialistCalls = 0;
			const workstreamExecutor: ResearchWorkstreamModelExecutor = {
				run: async (request) => {
					if (request.role === "specialist") {
						specialistRequests.push(request);
						specialistCalls += 1;
						if (specialistCalls === 1) {
							return {
								text: JSON.stringify({
									action: "record_claim",
									claim: "n = 40 gives 41^2 = 1681, which is composite.",
									classification: "conflicting",
									rationale: "Direct factorization: 40^2 + 40 + 41 = 41^2.",
								}),
							};
						}
						return {
							text: [
								"## Findings",
								"- The polynomial fails at n = 40, so the statement is false as written.",
								"## Promising strategy",
								"- Repair the statement to the verified range.",
								"## Gaps",
								"- A repaired statement has not been proposed yet.",
								"## Next",
								"- Revise the statement.",
							].join("\n"),
						};
					}
					if (request.role === "critic") {
						return { text: "## Review\n- The factorization is correct.\n## Gaps\n- None." };
					}
					return {
						text: [
							"## Promising strategy",
							"- Repair the statement.",
							"## Findings",
							"- The statement fails at n = 40.",
							"## Gap",
							"- A repaired statement is still missing.",
							"## Next",
							"- Revise the statement.",
						].join("\n"),
					};
				},
			};
			const directorExecutor: ResearchWorkstreamModelExecutor = {
				run: async (request) => {
					if (request.prompt.includes("Design a bounded research plan")) {
						return {
							text: JSON.stringify({
								objective: "Settle whether the Euler polynomial is prime for all n.",
								tasks: [
									{
										kind: "refutation-attempt",
										title: "Search for a composite value",
										description: "Look for a counterexample to the primality claim.",
										goal: "Find n with n^2 + n + 41 composite, or report strong evidence there is none.",
										acceptanceCriteria: ["A verdict backed by a concrete computation or argument."],
										pathNumber: 1,
									},
									{
										kind: "synthesis",
										title: "Summarize durable findings",
										description: "Fold results into the working paper.",
									},
								],
							}),
						};
					}
					if (request.prompt.includes("A plan task just completed")) {
						// Only add the revision task once; later amendments leave the plan as written.
						if (request.prompt.includes("(revise-conjecture)")) {
							return { text: JSON.stringify({ reason: "", actions: [] }) };
						}
						return {
							text: JSON.stringify({
								reason: "The statement was refuted, so it needs a repaired version.",
								actions: [
									{
										type: "add",
										kind: "revise-conjecture",
										title: "Repair the statement",
										description: "Propose a revised statement that fits the evidence.",
										goal: "A defensible revised statement.",
										acceptanceCriteria: ["The revision excludes exactly what failed."],
									},
								],
							}),
						};
					}
					if (request.prompt.includes("You are revising a mathematical statement")) {
						return {
							text: JSON.stringify({
								revisions: [
									{
										statement: "n^2 + n + 41 is prime for every integer 0 <= n <= 39.",
										revisionKind: "weakened",
										note: "n = 40 gives 41^2, which is composite.",
									},
								],
							}),
						};
					}
					// Skeptic review: sound, no concerns, no script.
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
			await saveProjectState(statePath, createEulerState());

			await harness.handlePrompt("work the plan for 3 steps");
			await waitFor(statePath, "completed twin-track plan", (state) =>
				Boolean(
					state?.researchPlans[0]?.status === "completed" && state.researchBatches[0]?.status === "completed",
				),
			);

			const state = await loadProjectState(statePath);
			if (!state) {
				throw new Error("Expected durable state.");
			}
			expect(state.researchPlanTasks.map((task) => [task.kind, task.status])).toEqual([
				["refutation-attempt", "completed"],
				["synthesis", "completed"],
				["revise-conjecture", "completed"],
			]);
			// The falsification directive reached the specialist prompt.
			expect(specialistRequests[0]?.prompt).toContain("disprove the statement");
			expect(specialistRequests[0]?.prompt).toContain(
				"Goal: Find n with n^2 + n + 41 composite, or report strong evidence there is none.",
			);
			// The refuting claim landed on the evidence board, linked to the refutation task.
			const conflicting = state.researchEvidenceBoard.find((entry) => entry.classification === "conflicting");
			expect(conflicting?.claim).toContain("n = 40");
			const refutationTask = state.researchPlanTasks[0];
			expect(refutationTask?.evidenceEntryIds).toContain(conflicting?.id);
			// The revision recorded the original statement as the lineage root and the repair as its child.
			const revised = state.researchEvidenceBoard.find((entry) => entry.parentEntryId !== undefined);
			expect(revised).toMatchObject({
				claim: "n^2 + n + 41 is prime for every integer 0 <= n <= 39.",
				classification: "conjecture",
				revisionKind: "weakened",
			});
			const lineage = getEvidenceLineage(state, revised?.id ?? "");
			expect(lineage.map((entry) => entry.claim)).toEqual([
				"Is n^2 + n + 41 prime for every non-negative integer n?",
				"n^2 + n + 41 is prime for every integer 0 <= n <= 39.",
			]);
			const reviseTask = state.researchPlanTasks[2];
			expect(reviseTask?.evidenceEntryIds).toEqual(expect.arrayContaining([lineage[0]?.id, revised?.id]));

			const visible = notices.join("\n");
			expect(visible).toContain("The evidence now points against the statement as written.");
			expect(visible).toContain("Plan updated based on what was just learned.");
			expect(visible).toContain("I revised the statement to fit the evidence.");
			expect(visible).toContain("n^2 + n + 41 is prime for every integer 0 <= n <= 39. (weakened)");
			expectProductCopy(visible);

			// The lineage is visible on demand, tree-shaped, without internal ids.
			const before = notices.length;
			await harness.handlePrompt("show lineage");
			const lineageView = notices.slice(before).join("\n");
			expect(lineageView).toContain("How the statement evolved");
			expect(lineageView).toContain("superseded");
			expect(lineageView).toContain("current (weakened)");
			expect(lineageView).not.toContain("evidence-board");
			expectProductCopy(lineageView);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("blocks the revision task and pauses the plan when no research model is available", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-lineage-blocked-"));
		const statePath = join(dir, ".pi", "co-math", "state.json");
		try {
			const notices: string[] = [];
			const harness = new CoMathHarness({
				statePath,
				startFirstRun: false,
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async () => ({ ok: true, messages: [] }),
			});
			const { state } = revisionTask(stateWithRefutingEvidence());
			await saveProjectState(statePath, state);

			await harness.handlePrompt("execute the plan");
			await waitFor(statePath, "paused plan after blocked revision task", (candidate) =>
				Boolean(
					candidate?.researchPlans[0]?.status === "paused" && candidate.researchBatches[0]?.status === "paused",
				),
			);

			const nextState = await loadProjectState(statePath);
			expect(nextState?.researchPlanTasks[0]).toMatchObject({
				kind: "revise-conjecture",
				status: "blocked",
				blockedReason: "I need a research model to propose revised statements.",
			});
			expect(nextState?.researchEvidenceBoard.some((entry) => entry.parentEntryId !== undefined)).toBe(false);
			expect(notices.join("\n")).toContain("resume plan");
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
