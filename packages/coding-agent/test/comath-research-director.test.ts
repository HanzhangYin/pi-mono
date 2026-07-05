import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
	ComputationalExecutionResult,
	ComputationalExecutor,
	ComputationalScriptDraft,
} from "../src/modes/comath/comath-computation-executor.ts";
import { CoMathHarness } from "../src/modes/comath/comath-harness.ts";
import { buildResearchContextPack } from "../src/modes/comath/comath-research-context.ts";
import {
	amendResearchPlanAfterTask,
	extractJsonObject,
	proposeResearchPlan,
} from "../src/modes/comath/comath-research-director.ts";
import type {
	ResearchWorkstreamModelExecutor,
	ResearchWorkstreamModelRequest,
} from "../src/modes/comath/comath-research-model-workstream.ts";
import { runSkepticGate } from "../src/modes/comath/comath-research-skeptic.ts";
import type { CoMathProjectState } from "../src/modes/comath/schema.ts";
import {
	addResearchPath,
	addResearchPlan,
	addResearchPlanTask,
	addResearchWorkstreamReport,
	createEmptyProjectState,
	getResearchPlanTasks,
	loadProjectState,
	saveProjectState,
	updateResearchPlanTask,
} from "../src/modes/comath/storage.ts";

const NOW = "2026-06-05T12:00:00.000Z";

const FORBIDDEN_PRODUCT_TERMS = ["role-run", "queue", "schema", "artifact", "workstream-", "/comath"];

function expectProductCopy(text: string): void {
	for (const term of FORBIDDEN_PRODUCT_TERMS) {
		expect(text).not.toContain(term);
	}
}

function createTwinPrimeState(): CoMathProjectState {
	let state = createEmptyProjectState({
		projectId: "proj-test",
		title: "Are there infinitely many twin primes?",
		rootQuestion: "Are there infinitely many twin primes?",
		now: NOW,
	});
	state = addResearchPath(state, {
		title: "Small examples and counterexamples",
		objective: "List initial examples.",
		suggestedNextMove: "Compute more examples.",
		priority: 1,
		now: NOW,
		actor: "human",
	});
	state = addResearchPath(state, {
		title: "Direct proof attempt",
		objective: "Try a direct proof.",
		suggestedNextMove: "Check whether simple arguments apply or fail.",
		priority: 2,
		now: NOW,
		actor: "human",
	});
	return state;
}

function staticExecutor(text: string): { executor: ResearchWorkstreamModelExecutor; prompts: string[] } {
	const prompts: string[] = [];
	return {
		prompts,
		executor: {
			run: async (request) => {
				prompts.push(request.prompt);
				return { text };
			},
		},
	};
}

describe("co-math research director", () => {
	it("creates a validated plan from a model proposal, dropping invalid tasks", async () => {
		const state = createTwinPrimeState();
		const { executor, prompts } = staticExecutor(
			JSON.stringify({
				objective: "Pin down the parity structure before attempting a proof.",
				tasks: [
					{
						kind: "computation",
						title: "Count twin primes up to 10^5",
						description: "Bounded count to observe density.",
						goal: "Collect density evidence for twin primes.",
						acceptanceCriteria: ["A count for the range is recorded."],
						pathNumber: 1,
					},
					{
						kind: "invent-theorem",
						title: "Should be dropped",
						description: "Unknown kind.",
					},
					{
						kind: "proof-attempt",
						title: "Attempt the parity lemma",
						description: "Try to prove the parity restriction.",
						goal: "A rigorous proof of the parity lemma.",
						acceptanceCriteria: ["Proof sketch with no unjustified steps."],
						pathNumber: 99,
					},
					{ kind: "synthesis", title: "Summarize", description: "Fold into working paper." },
				],
			}),
		);

		const result = await proposeResearchPlan(state, { executor, now: NOW, actor: "human" });

		expect(result.source).toBe("model");
		expect(prompts[0]).toContain("You are the research director");
		const tasks = getResearchPlanTasks(result.state, result.plan.id);
		expect(tasks.map((task) => task.kind)).toEqual(["computation", "proof-attempt", "synthesis"]);
		expect(tasks[0]).toMatchObject({
			pathId: "path-1",
			goal: "Collect density evidence for twin primes.",
			acceptanceCriteria: ["A count for the range is recorded."],
		});
		// pathNumber 99 does not exist; the validator resolves a proof path deterministically.
		expect(tasks[1]?.pathId).toBe("path-2");
		expect(result.plan.objective).toBe("Pin down the parity structure before attempting a proof.");
	});

	it("falls back to the deterministic planner when the model output is unusable", async () => {
		const state = createTwinPrimeState();
		const { executor } = staticExecutor("I think we should try several things, in no particular order.");

		const result = await proposeResearchPlan(state, { executor, now: NOW, actor: "human" });

		expect(result.source).toBe("deterministic");
		const tasks = getResearchPlanTasks(result.state, result.plan.id);
		expect(tasks.map((task) => task.kind)).toEqual([
			"computation",
			"proof-attempt",
			"refutation-attempt",
			"synthesis",
		]);
	});

	it("falls back to the deterministic planner when the executor throws", async () => {
		const state = createTwinPrimeState();
		const executor: ResearchWorkstreamModelExecutor = {
			run: async () => {
				throw new Error("model unavailable");
			},
		};

		const result = await proposeResearchPlan(state, { executor, now: NOW, actor: "human" });

		expect(result.source).toBe("deterministic");
		expect(getResearchPlanTasks(result.state, result.plan.id).length).toBeGreaterThan(0);
	});

	it("applies validated amendments and ignores invalid actions", async () => {
		let state = createTwinPrimeState();
		state = addResearchPlan(state, { title: "Plan", objective: "Progress.", now: NOW, actor: "human" });
		for (const [kind, title] of [
			["computation", "Count twin primes"],
			["proof-attempt", "Attempt the parity lemma"],
			["synthesis", "Summarize"],
		] as const) {
			state = addResearchPlanTask(state, {
				planId: "research-plan-1",
				kind,
				title,
				description: title,
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
		const { executor } = staticExecutor(
			JSON.stringify({
				reason: "The computation already settled what the proof attempt would explore.",
				actions: [
					{ type: "cancel", taskNumber: 2, reason: "Superseded by the computation." },
					{ type: "cancel", taskNumber: 1, reason: "Task 1 is not pending; must be ignored." },
					{
						type: "add",
						kind: "computation",
						title: "Check the observed obstruction mod 6",
						description: "Bounded check of the mod-6 pattern.",
						goal: "Confirm the mod-6 obstruction on a larger range.",
						acceptanceCriteria: ["Verdict for the extended range is recorded."],
						pathNumber: 1,
					},
				],
			}),
		);

		const result = await amendResearchPlanAfterTask(state, "research-plan-1", {
			executor,
			completedTask,
			now: NOW,
		});

		expect(result.amended).toBe(true);
		expect(result.cancelledTitles).toEqual(["Attempt the parity lemma"]);
		expect(result.addedTitles).toEqual(["Check the observed obstruction mod 6"]);
		const tasks = getResearchPlanTasks(result.state, "research-plan-1");
		expect(tasks.map((task) => task.status)).toEqual(["completed", "cancelled", "pending", "pending"]);
		expect(tasks[3]).toMatchObject({ kind: "computation", pathId: "path-1" });
	});

	it("treats unusable amendment output as a no-op", async () => {
		let state = createTwinPrimeState();
		state = addResearchPlan(state, { title: "Plan", objective: "Progress.", now: NOW, actor: "human" });
		state = addResearchPlanTask(state, {
			planId: "research-plan-1",
			kind: "synthesis",
			title: "Summarize",
			description: "Summarize.",
			now: NOW,
			actor: "human",
		});
		const completedTask = getResearchPlanTasks(state, "research-plan-1")[0];
		if (!completedTask) {
			throw new Error("Expected a plan task.");
		}
		const { executor } = staticExecutor("Let me think about whether the plan is still right...");

		const result = await amendResearchPlanAfterTask(state, "research-plan-1", {
			executor,
			completedTask,
			now: NOW,
		});

		expect(result.amended).toBe(false);
		expect(result.state).toBe(state);
	});

	it("extracts JSON objects from fenced and prose-wrapped responses", () => {
		expect(extractJsonObject('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
		expect(extractJsonObject('Here is the plan: {"tasks": []} — done.')).toEqual({ tasks: [] });
		expect(extractJsonObject("no json here")).toBeUndefined();
	});

	it("builds a context pack that covers the root question and plan tasks", () => {
		let state = createTwinPrimeState();
		state = addResearchPlan(state, { title: "Plan", objective: "Progress.", now: NOW, actor: "human" });
		state = addResearchPlanTask(state, {
			planId: "research-plan-1",
			kind: "proof-attempt",
			title: "Attempt the parity lemma",
			description: "Try it.",
			goal: "A rigorous parity lemma.",
			acceptanceCriteria: ["No unjustified steps."],
			pathId: "path-2",
			now: NOW,
			actor: "human",
		});

		const pack = buildResearchContextPack(state);

		expect(pack).toContain("Root question: Are there infinitely many twin primes?");
		expect(pack).toContain("Research plan:");
		expect(pack).toContain("Task 1 (proof-attempt, pending): Attempt the parity lemma");
		expect(pack).toContain("goal: A rigorous parity lemma.");
		expect(pack).toContain("done when: No unjustified steps.");
	});
});

describe("co-math research skeptic", () => {
	function stateWithReport(): CoMathProjectState {
		let state = createTwinPrimeState();
		state = addResearchWorkstreamReport(state, {
			pathId: "path-2",
			pathTitle: "Direct proof attempt",
			status: "completed",
			startedAt: NOW,
			completedAt: NOW,
			coordinatorBrief: "Try the parity argument.",
			steps: [],
			promisingStrategy: ["Every twin prime pair beyond (3, 5) has the form (6k - 1, 6k + 1)."],
			findings: ["Checked the 6k ± 1 pattern for pairs below 100."],
			criticisms: [],
			gaps: ["The pattern is not yet proved for all pairs."],
			humanHelpUseful: [],
			suggestedNextMove: "Prove the mod-6 restriction.",
			workingPaperSectionTitle: "Direct proof attempts",
			now: NOW,
			actor: "synthesizer",
		});
		state = addResearchPlan(state, { title: "Plan", objective: "Progress.", now: NOW, actor: "human" });
		state = addResearchPlanTask(state, {
			planId: "research-plan-1",
			kind: "proof-attempt",
			title: "Attempt the mod-6 lemma",
			description: "Prove the 6k ± 1 restriction.",
			acceptanceCriteria: ["A proof or explicit counterexample for the restriction."],
			pathId: "path-2",
			now: NOW,
			actor: "human",
		});
		return state;
	}

	function fakeComputationalExecutor(stdout: string): {
		computationalExecutor: ComputationalExecutor;
		drafts: ComputationalScriptDraft[];
	} {
		const drafts: ComputationalScriptDraft[] = [];
		return {
			drafts,
			computationalExecutor: {
				runScript: async (draft): Promise<ComputationalExecutionResult> => {
					drafts.push(draft);
					return {
						command: "python3 skeptic-check.py",
						exitCode: 0,
						stdout,
						stderr: "",
						durationMs: 4,
						scriptFileName: "skeptic-check.py",
						stdoutFileName: "stdout.txt",
					};
				},
			},
		};
	}

	it("records new concerns and runs the counterexample script with durable linkage", async () => {
		const state = stateWithReport();
		const task = getResearchPlanTasks(state, "research-plan-1")[0];
		if (!task) {
			throw new Error("Expected a plan task.");
		}
		const { executor, prompts } = staticExecutor(
			[
				"## Verdict",
				"needs-revision",
				"## Concerns",
				"- The claimed 6k ± 1 form silently assumes both members are greater than 3.",
				"- The pattern is not yet proved for all pairs.",
				"## Counterexample script",
				"```python",
				"pairs = [(3, 5)]",
				"bad = [p for p in pairs if (p[0] % 6, p[1] % 6) != (5, 1)]",
				"print('checked_pairs: 1')",
				"print(f'counterexample_found: {bool(bad)}')",
				"```",
			].join("\n"),
		);
		const { computationalExecutor, drafts } = fakeComputationalExecutor(
			"checked_pairs: 1\ncounterexample_found: True\n",
		);

		const result = await runSkepticGate({
			state,
			task,
			reportId: "research-report-1",
			runId: "research-run-1",
			executor,
			computationalExecutor,
			artifactDirectory: ".pi/co-math/artifacts/research-run-1-skeptic",
			workingDirectory: "/tmp/unused-in-fake",
			now: NOW,
		});

		expect(prompts[0]).toContain("independent skeptic");
		expect(prompts[0]).toContain("A proof or explicit counterexample for the restriction.");
		// The concern duplicating a self-reported gap is filtered; only the new one lands.
		expect(result.concerns).toEqual(["The claimed 6k ± 1 form silently assumes both members are greater than 3."]);
		expect(result.counterexampleFound).toBe(true);
		expect(drafts[0]?.content).toContain("counterexample_found");
		expect(result.computationalArtifactIds).toHaveLength(2);
		const scriptRecord = result.state.computationalArtifacts.find((record) => record.kind === "script");
		expect(scriptRecord).toMatchObject({
			pathId: "path-2",
			reportId: "research-report-1",
			runId: "research-run-1",
			filePath: ".pi/co-math/artifacts/research-run-1-skeptic/skeptic-check.py",
		});
		const conflictEntry = result.state.researchEvidenceBoard.find(
			(entry) => entry.classification === "conflicting" && entry.computationalArtifactIds.length > 0,
		);
		expect(conflictEntry?.claim).toContain("found a counterexample");
		expect(
			result.state.marginNotes.some((note) => note.kind === "warning" && /counterexample/i.test(note.message)),
		).toBe(true);
	});

	it("degrades to no concerns when the skeptic model fails", async () => {
		const state = stateWithReport();
		const task = getResearchPlanTasks(state, "research-plan-1")[0];
		if (!task) {
			throw new Error("Expected a plan task.");
		}
		const executor: ResearchWorkstreamModelExecutor = {
			run: async () => {
				throw new Error("model unavailable");
			},
		};

		const result = await runSkepticGate({
			state,
			task,
			reportId: "research-report-1",
			executor,
			artifactDirectory: ".pi/co-math/artifacts/x",
			workingDirectory: "/tmp/unused",
			now: NOW,
		});

		expect(result.state).toBe(state);
		expect(result.concerns).toEqual([]);
		expect(result.counterexampleFound).toBe(false);
	});
});

describe("co-math director-driven harness flow", () => {
	it("runs a director-authored plan task with a skeptic review and a plan amendment", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-director-harness-"));
		const statePath = join(dir, ".pi", "co-math", "state.json");
		try {
			const notices: string[] = [];
			const specialistRequests: ResearchWorkstreamModelRequest[] = [];
			const workstreamExecutor: ResearchWorkstreamModelExecutor = {
				run: async (request) => {
					if (request.role === "specialist") {
						specialistRequests.push(request);
						return {
							text: [
								"## Findings",
								"- Every twin prime pair beyond (3, 5) has the form (6k - 1, 6k + 1).",
								"## Promising strategy",
								"- Prove the mod-6 restriction rigorously.",
								"## Gaps",
								"- The restriction is checked, not proved.",
								"## Next",
								"- Prove the restriction.",
							].join("\n"),
						};
					}
					if (request.role === "critic") {
						return { text: "## Review\n- Reasonable.\n## Gaps\n- Still unproved in general." };
					}
					return {
						text: [
							"## Promising strategy",
							"- Prove the mod-6 restriction.",
							"## Findings",
							"- The 6k ± 1 pattern holds below the checked bound.",
							"## Gap",
							"- General proof still open.",
							"## Next",
							"- Prove the restriction.",
						].join("\n"),
					};
				},
			};
			const directorExecutor: ResearchWorkstreamModelExecutor = {
				run: async (request) => {
					if (request.prompt.includes("Design a bounded research plan")) {
						return {
							text: JSON.stringify({
								objective: "Settle the mod-6 structure of twin primes.",
								tasks: [
									{
										kind: "proof-attempt",
										title: "Attempt the mod-6 lemma",
										description: "Prove the 6k ± 1 restriction for twin primes.",
										goal: "A rigorous mod-6 restriction lemma.",
										acceptanceCriteria: ["No unjustified steps remain."],
										pathNumber: 2,
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
						return {
							text: JSON.stringify({
								reason: "The lemma needs numeric support on a larger range.",
								actions: [
									{
										type: "add",
										kind: "computation",
										title: "Check the mod-6 pattern to 10^6",
										description: "Bounded check of the restriction.",
										goal: "Numeric support for the lemma.",
										acceptanceCriteria: ["Verdict recorded for the range."],
										pathNumber: 1,
									},
								],
							}),
						};
					}
					// Skeptic review request.
					return {
						text: [
							"## Verdict",
							"needs-revision",
							"## Concerns",
							"- The pair (3, 5) is excluded without justification in one step.",
							"## Counterexample script",
							"```python",
							"print('counterexample_found: false')",
							"```",
						].join("\n"),
					};
				},
			};
			const drafts: ComputationalScriptDraft[] = [];
			const computationalExecutor: ComputationalExecutor = {
				runScript: async (draft) => {
					drafts.push(draft);
					return {
						command: "python3 skeptic-check.py",
						exitCode: 0,
						stdout: "counterexample_found: false\n",
						stderr: "",
						durationMs: 3,
						scriptFileName: "skeptic-check.py",
						stdoutFileName: "stdout.txt",
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
				researchModelExecutor: workstreamExecutor,
				researchDirectorExecutor: directorExecutor,
				computationalExecutor,
			});
			await saveProjectState(statePath, createTwinPrimeState());

			await harness.handlePrompt("work the plan for 1 step");
			await waitFor(statePath, "completed director-authored plan task", (state) =>
				Boolean(
					state?.researchPlanTasks[0]?.status === "completed" && state.researchBatches[0]?.status === "completed",
				),
			);

			const state = await loadProjectState(statePath);
			if (!state) {
				throw new Error("Expected durable state.");
			}
			// Director-authored plan with goal/criteria, executed with the brief in the prompt.
			expect(state.researchPlans[0]?.objective).toBe("Settle the mod-6 structure of twin primes.");
			expect(specialistRequests[0]?.prompt).toContain("Task brief from the research plan:");
			expect(specialistRequests[0]?.prompt).toContain("Goal: A rigorous mod-6 restriction lemma.");
			expect(specialistRequests[0]?.prompt).toContain("- No unjustified steps remain.");
			// Skeptic ran its bounded check and linked the records to the task.
			expect(drafts).toHaveLength(1);
			const task = state.researchPlanTasks[0];
			expect(task?.status).toBe("completed");
			expect(task?.computationalArtifactIds.length).toBeGreaterThan(0);
			expect(state.marginNotes.some((note) => note.message.includes("The pair (3, 5) is excluded"))).toBe(true);
			// Director amendment appended the computation task after the completed step.
			const tasks = state.researchPlanTasks;
			expect(tasks.map((candidate) => candidate.kind)).toEqual(["proof-attempt", "synthesis", "computation"]);
			expect(tasks[2]).toMatchObject({ status: "pending", pathId: "path-1" });

			const visible = notices.join("\n");
			expect(visible).toContain("Independent review raised concerns about this step.");
			expect(visible).toContain("Plan updated based on what was just learned.");
			expect(visible).toContain("Check the mod-6 pattern to 10^6");
			expectProductCopy(visible);
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
