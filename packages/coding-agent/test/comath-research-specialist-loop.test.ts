import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
	ComputationalExecutor,
	ComputationalScriptDraft,
} from "../src/modes/comath/comath-computation-executor.ts";
import { CoMathHarness } from "../src/modes/comath/comath-harness.ts";
import type { LiteratureSourceLookup } from "../src/modes/comath/comath-literature-source.ts";
import type {
	ResearchWorkstreamModelExecutor,
	ResearchWorkstreamModelRequest,
} from "../src/modes/comath/comath-research-model-workstream.ts";
import {
	buildPriorComputationDigest,
	type PriorComputationSummary,
	runSpecialistToolLoop,
} from "../src/modes/comath/comath-research-specialist-loop.ts";
import type { CoMathProjectState, ComputationalArtifact, ResearchPath } from "../src/modes/comath/schema.ts";
import {
	addResearchPath,
	createEmptyProjectState,
	loadProjectState,
	saveProjectState,
} from "../src/modes/comath/storage.ts";

const NOW = "2026-06-05T12:00:00.000Z";

const FINAL_NOTE = [
	"## Findings",
	"- Every twin prime pair beyond (3, 5) has the form (6k - 1, 6k + 1).",
	"## Promising strategy",
	"- Prove the mod-6 restriction rigorously.",
	"## Gaps",
	"- The restriction is checked, not proved.",
	"## Next",
	"- Prove the restriction.",
].join("\n");

const PRIOR_MOD6_CHECK: PriorComputationSummary = {
	title: "Specialist computation: check the mod-6 pattern",
	script: "print('checked: 100 pairs') print('violations: 0')",
	outputSummary: "checked: 100 pairs violations: 0",
	status: "completed",
};

function createPath(): ResearchPath {
	return {
		id: "path-2",
		title: "Direct proof attempt",
		objective: "Try a direct proof.",
		status: "active",
		latestFindings: [],
		blockers: [],
		suggestedNextMove: "Check simple arguments.",
		priority: 2,
		createdAt: NOW,
		updatedAt: NOW,
	};
}

function scriptedExecutor(responses: readonly string[]): {
	executor: ResearchWorkstreamModelExecutor;
	requests: ResearchWorkstreamModelRequest[];
} {
	const requests: ResearchWorkstreamModelRequest[] = [];
	return {
		requests,
		executor: {
			run: async (request) => {
				requests.push(request);
				const text = responses[Math.min(requests.length - 1, responses.length - 1)] ?? "";
				return { text };
			},
		},
	};
}

function fakeComputationalExecutor(stdout: string): {
	computationalExecutor: ComputationalExecutor;
	drafts: ComputationalScriptDraft[];
} {
	const drafts: ComputationalScriptDraft[] = [];
	return {
		drafts,
		computationalExecutor: {
			runScript: async (draft) => {
				drafts.push(draft);
				return {
					command: `python3 ${draft.fileName}`,
					exitCode: 0,
					stdout,
					stderr: "",
					durationMs: 3,
					scriptFileName: draft.fileName,
					stdoutFileName: "stdout.txt",
				};
			},
		},
	};
}

describe("co-math specialist tool loop", () => {
	it("behaves as a single call when the model answers with plain markdown", async () => {
		const { executor, requests } = scriptedExecutor([FINAL_NOTE]);

		const result = await runSpecialistToolLoop({
			rootQuestion: "Are there infinitely many twin primes?",
			path: createPath(),
			allPaths: [createPath()],
			priorFindings: [],
			executor,
		});

		expect(requests).toHaveLength(1);
		expect(result.finalText).toBe(FINAL_NOTE);
		expect(result.recordedClaims).toEqual([]);
		expect(result.computationRecords).toEqual([]);
		expect(result.modelCallCount).toBe(1);
	});

	it("runs computations and records claims mid-attempt, feeding results back", async () => {
		const { executor, requests } = scriptedExecutor([
			JSON.stringify({
				action: "run_computation",
				summary: "check the mod-6 pattern",
				script: "print('checked: 100 pairs')\nprint('violations: 0')",
			}),
			JSON.stringify({
				action: "record_claim",
				claim: "All checked twin prime pairs beyond (3, 5) are congruent to (5, 1) mod 6.",
				classification: "theorem",
				rationale: "Verified for all pairs below the bound.",
			}),
			FINAL_NOTE,
		]);
		const { computationalExecutor, drafts } = fakeComputationalExecutor("checked: 100 pairs\nviolations: 0\n");

		const result = await runSpecialistToolLoop({
			rootQuestion: "Are there infinitely many twin primes?",
			path: createPath(),
			allPaths: [createPath()],
			priorFindings: [],
			directive: "Goal: A rigorous mod-6 restriction lemma.",
			executor,
			computationalExecutor,
			workingDirectory: "/tmp/unused-in-fake",
		});

		expect(requests).toHaveLength(3);
		expect(requests[0]?.prompt).toContain("Task brief from the research plan:");
		expect(requests[0]?.prompt).toContain("run_computation");
		// The second call sees the computation output; the third sees the claim confirmation.
		expect(requests[1]?.prompt).toContain("violations: 0");
		expect(requests[2]?.prompt).toContain("Recorded claim");
		expect(drafts).toHaveLength(1);
		expect(drafts[0]?.content).toContain("checked: 100 pairs");
		expect(result.finalText).toBe(FINAL_NOTE);
		expect(result.computationRecords.map((record) => record.kind)).toEqual(["script", "stdout"]);
		// The specialist cannot self-certify theorems.
		expect(result.recordedClaims).toEqual([
			{
				claim: "All checked twin prime pairs beyond (3, 5) are congruent to (5, 1) mod 6.",
				classification: "conjecture",
				rationale: "Verified for all pairs below the bound.",
			},
		]);
		expect(result.stageNotes.join("\n")).toContain("Ran a bounded computation (exit 0)");
	});

	it("forces a final note when the action budget is spent", async () => {
		const computationAction = JSON.stringify({
			action: "run_computation",
			summary: "another check",
			script: "print('ok')",
		});
		const { executor, requests } = scriptedExecutor([
			computationAction,
			computationAction,
			JSON.stringify({ action: "record_claim", claim: "A checked pattern.", rationale: "Bounded check." }),
			// Budget exhausted: the model still tries an action; the loop must not run it.
			computationAction,
		]);
		const { computationalExecutor, drafts } = fakeComputationalExecutor("ok\n");

		const result = await runSpecialistToolLoop({
			rootQuestion: "Are there infinitely many twin primes?",
			path: createPath(),
			allPaths: [createPath()],
			priorFindings: [],
			executor,
			computationalExecutor,
			workingDirectory: "/tmp/unused-in-fake",
			maxToolActions: 3,
		});

		expect(requests).toHaveLength(4);
		expect(requests[3]?.prompt).toContain("You have no actions remaining.");
		expect(drafts).toHaveLength(2);
		expect(result.finalText).toContain("## Findings");
		expect(result.finalText).toContain("spent its action budget");
	});

	it("shows prior computations in the prompt and tells the model not to repeat them", async () => {
		const { executor, requests } = scriptedExecutor([FINAL_NOTE]);

		const result = await runSpecialistToolLoop({
			rootQuestion: "Are there infinitely many twin primes?",
			path: createPath(),
			allPaths: [createPath()],
			priorFindings: [],
			priorComputations: [PRIOR_MOD6_CHECK],
			executor,
		});

		expect(requests).toHaveLength(1);
		expect(requests[0]?.prompt).toContain("Computations already run earlier in this project:");
		expect(requests[0]?.prompt).toContain(
			"- Specialist computation: check the mod-6 pattern (completed): checked: 100 pairs violations: 0",
		);
		expect(requests[0]?.prompt).toContain("Do not re-run a computation that already produced this data");
		expect(result.finalText).toBe(FINAL_NOTE);
	});

	it("reuses a completed prior result instead of re-running a nearly identical script", async () => {
		const { executor, requests } = scriptedExecutor([
			JSON.stringify({
				action: "run_computation",
				summary: "check the mod-6 pattern",
				script: "print('checked: 100 pairs')\nprint('violations: 0')",
			}),
			FINAL_NOTE,
		]);
		const { computationalExecutor, drafts } = fakeComputationalExecutor("must never be produced\n");

		const result = await runSpecialistToolLoop({
			rootQuestion: "Are there infinitely many twin primes?",
			path: createPath(),
			allPaths: [createPath()],
			priorFindings: [],
			priorComputations: [PRIOR_MOD6_CHECK],
			executor,
			computationalExecutor,
			workingDirectory: "/tmp/unused-in-fake",
		});

		expect(drafts).toHaveLength(0);
		expect(requests).toHaveLength(2);
		// The model sees the prior output as a completed action and continues from it.
		expect(requests[1]?.prompt).toContain("an essentially identical computation already ran");
		expect(requests[1]?.prompt).toContain("checked: 100 pairs violations: 0");
		expect(result.computationRecords).toEqual([]);
		expect(result.stageNotes.join("\n")).toContain("Reused a prior computation result instead of re-running it");
		expect(result.finalText).toBe(FINAL_NOTE);
	});

	it("executes a materially different script even when prior computations exist", async () => {
		const { executor } = scriptedExecutor([
			JSON.stringify({
				action: "run_computation",
				summary: "count twin prime pairs below 500",
				script: [
					"count = 0",
					"for n in range(5, 500):",
					"    if all(n % d for d in range(2, n)) and all((n + 2) % d for d in range(2, n + 2)):",
					"        count += 1",
					"print('twin pairs found:', count)",
				].join("\n"),
			}),
			FINAL_NOTE,
		]);
		const { computationalExecutor, drafts } = fakeComputationalExecutor("twin pairs found: 24\n");

		const result = await runSpecialistToolLoop({
			rootQuestion: "Are there infinitely many twin primes?",
			path: createPath(),
			allPaths: [createPath()],
			priorFindings: [],
			priorComputations: [PRIOR_MOD6_CHECK],
			executor,
			computationalExecutor,
			workingDirectory: "/tmp/unused-in-fake",
		});

		expect(drafts).toHaveLength(1);
		expect(result.computationRecords.map((record) => record.kind)).toEqual(["script", "stdout"]);
		expect(result.stageNotes.join("\n")).toContain("Ran a bounded computation (exit 0)");
	});

	it("re-executes a nearly identical script when the prior computation failed", async () => {
		const { executor } = scriptedExecutor([
			JSON.stringify({
				action: "run_computation",
				summary: "check the mod-6 pattern",
				script: "print('checked: 100 pairs')\nprint('violations: 0')",
			}),
			FINAL_NOTE,
		]);
		const { computationalExecutor, drafts } = fakeComputationalExecutor("checked: 100 pairs\nviolations: 0\n");

		const result = await runSpecialistToolLoop({
			rootQuestion: "Are there infinitely many twin primes?",
			path: createPath(),
			allPaths: [createPath()],
			priorFindings: [],
			priorComputations: [{ ...PRIOR_MOD6_CHECK, status: "failed" }],
			executor,
			computationalExecutor,
			workingDirectory: "/tmp/unused-in-fake",
		});

		expect(drafts).toHaveLength(1);
		expect(result.computationRecords.map((record) => record.kind)).toEqual(["script", "stdout"]);
		expect(result.stageNotes.join("\n")).not.toContain("Reused a prior computation result");
	});

	it("reports an unavailable computation backend back to the model and continues", async () => {
		const { executor, requests } = scriptedExecutor([
			JSON.stringify({ action: "run_computation", summary: "a check", script: "print('x')" }),
			FINAL_NOTE,
		]);

		const result = await runSpecialistToolLoop({
			rootQuestion: "Are there infinitely many twin primes?",
			path: createPath(),
			allPaths: [createPath()],
			priorFindings: [],
			executor,
		});

		expect(requests).toHaveLength(2);
		expect(requests[1]?.prompt).toContain("no computation backend is available");
		expect(result.computationRecords).toEqual([]);
		expect(result.finalText).toBe(FINAL_NOTE);
	});
});

describe("buildPriorComputationDigest", () => {
	it("pairs script and output records, prefers the requested path, and never marks failed runs completed", () => {
		const artifacts: ComputationalArtifact[] = [
			createArtifact({
				id: "record-1",
				pathId: "path-1",
				runId: "run-1",
				kind: "script",
				status: "completed",
				title: "Computation script",
				summary: "Tabulate residues for small moduli.",
			}),
			createArtifact({
				id: "record-2",
				pathId: "path-1",
				runId: "run-1",
				kind: "stdout",
				status: "completed",
				title: "Computation output",
				summary: "residues tabulated for moduli up to 30",
			}),
			createArtifact({
				id: "record-3",
				pathId: "path-2",
				runId: "run-2",
				kind: "script",
				status: "failed",
				title: "Specialist computation: check the mod-6 pattern",
				summary: "print('violations: 0')",
			}),
			createArtifact({
				id: "record-4",
				pathId: "path-2",
				runId: "run-2",
				kind: "stdout",
				status: "failed",
				title: "Specialist computation output: check the mod-6 pattern",
				summary: "(no output)",
			}),
			// A script with no output record has nothing worth reusing.
			createArtifact({
				id: "record-5",
				pathId: "path-2",
				runId: "run-3",
				kind: "script",
				status: "completed",
				title: "Specialist computation: count pairs",
				summary: "print(1)",
			}),
		];

		expect(buildPriorComputationDigest(artifacts, "path-2")).toEqual([
			{
				title: "Specialist computation: check the mod-6 pattern",
				script: "print('violations: 0')",
				outputSummary: "(no output)",
				status: "failed",
			},
			{
				title: "Computation script",
				script: "Tabulate residues for small moduli.",
				outputSummary: "residues tabulated for moduli up to 30",
				status: "completed",
			},
		]);
	});
});

function createArtifact(
	input: Pick<ComputationalArtifact, "id" | "pathId" | "runId" | "kind" | "status" | "title" | "summary">,
): ComputationalArtifact {
	return { ...input, createdAt: NOW, updatedAt: NOW };
}

describe("co-math specialist tool loop through the harness", () => {
	it("persists mid-attempt computations and claims with durable linkage to run, report, and task", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-loop-harness-"));
		const statePath = join(dir, ".pi", "co-math", "state.json");
		try {
			const notices: string[] = [];
			let specialistCalls = 0;
			const workstreamExecutor: ResearchWorkstreamModelExecutor = {
				run: async (request) => {
					if (request.role === "specialist") {
						specialistCalls += 1;
						if (specialistCalls === 1) {
							return {
								text: JSON.stringify({
									action: "run_computation",
									summary: "check the mod-6 pattern",
									script: "print('violations: 0')",
								}),
							};
						}
						if (specialistCalls === 2) {
							return {
								text: JSON.stringify({
									action: "record_claim",
									claim: "All checked twin prime pairs beyond (3, 5) fit the 6k pattern.",
									classification: "computation",
									rationale: "Bounded check found no violation.",
								}),
							};
						}
						return { text: FINAL_NOTE };
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
										description: "Prove the restriction.",
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
						return { text: JSON.stringify({ reason: "", actions: [] }) };
					}
					return { text: "## Verdict\naccepted\n## Concerns\n" };
				},
			};
			const { computationalExecutor, drafts } = fakeComputationalExecutor("violations: 0\n");
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
				suggestedNextMove: "Check simple arguments.",
				priority: 2,
				now: NOW,
				actor: "human",
			});
			await saveProjectState(statePath, state);

			await harness.handlePrompt("work the plan for 1 step");
			await waitFor(statePath, "completed loop-backed plan task", (candidate) =>
				Boolean(
					candidate?.researchPlanTasks[0]?.status === "completed" &&
						candidate.researchBatches[0]?.status === "completed",
				),
			);

			const finalState = await loadProjectState(statePath);
			if (!finalState) {
				throw new Error("Expected durable state.");
			}
			expect(specialistCalls).toBe(3);
			expect(drafts).toHaveLength(1);
			// Mid-attempt computation persisted with run linkage under the specialist directory.
			const script = finalState.computationalArtifacts.find((record) => record.kind === "script");
			expect(script).toMatchObject({
				pathId: "path-2",
				reportId: "research-report-1",
				runId: "research-run-1",
				filePath: ".pi/co-math/artifacts/research-run-1-specialist/specialist-check-1.py",
			});
			expect(finalState.computationalArtifacts.every((record) => record.reportId === "research-report-1")).toBe(
				true,
			);
			// Records fold into the report and from there into the plan task.
			expect(finalState.researchReports[0]?.computationalArtifactIds).toEqual(
				finalState.computationalArtifacts.map((record) => record.id),
			);
			const task = finalState.researchPlanTasks[0];
			expect(task?.computationalArtifactIds).toEqual(finalState.computationalArtifacts.map((record) => record.id));
			// The recorded claim landed on the evidence board, linked to the report, and in the task.
			const claimEntry = finalState.researchEvidenceBoard.find((entry) =>
				entry.claim.includes("fit the 6k pattern"),
			);
			expect(claimEntry).toMatchObject({
				pathId: "path-2",
				reportId: "research-report-1",
				classification: "computation",
			});
			expect(claimEntry?.rationale).toContain("Recorded by the specialist during the attempt.");
			expect(task?.evidenceEntryIds).toContain(claimEntry?.id);
			// The loop's actions land in the durable specialist stage record.
			const specialistStage = finalState.researchWorkstreamRuns[0]?.incrementalReports.find(
				(report) => report.stage === "specialist" && report.status === "completed",
			);
			expect(specialistStage?.details.join("\n")).toContain("Ran a bounded computation (exit 0)");
			expect(specialistStage?.details.join("\n")).toContain("Recorded a durable claim (computation)");
			expect(notices.length).toBeGreaterThan(0);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("threads plan-task briefs into the computation and literature specialist prompts", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-brief-harness-"));
		const statePath = join(dir, ".pi", "co-math", "state.json");
		try {
			const requests: ResearchWorkstreamModelRequest[] = [];
			const workstreamExecutor: ResearchWorkstreamModelExecutor = {
				run: async (request) => {
					requests.push(request);
					if (request.role === "specialist") {
						return { text: "## Findings\n- A bounded observation. [source-1]" };
					}
					if (request.role === "critic") {
						return { text: "## Review\n- Fine.\n## Gaps\n- Open." };
					}
					return {
						text: "## Promising strategy\n- Continue.\n## Findings\n- Recorded.\n## Gap\n- Open.\n## Next\n- Continue.",
					};
				},
			};
			const directorExecutor: ResearchWorkstreamModelExecutor = {
				run: async (request) => {
					if (request.prompt.includes("Design a bounded research plan")) {
						return {
							text: JSON.stringify({
								objective: "Gather evidence and sources for the question.",
								tasks: [
									{
										kind: "computation",
										title: "Run the bounded check",
										description: "Check small cases.",
										goal: "Numeric evidence for the pattern.",
										acceptanceCriteria: ["A verdict for the range is recorded."],
										pathNumber: 1,
									},
									{
										kind: "literature-search",
										title: "Check the sources",
										description: "Find prior results.",
										goal: "Source-backed status of the question.",
										pathNumber: 2,
									},
								],
							}),
						};
					}
					if (request.prompt.includes("A plan task just completed")) {
						return { text: JSON.stringify({ reason: "", actions: [] }) };
					}
					return { text: "## Verdict\naccepted\n## Concerns\n" };
				},
			};
			const { computationalExecutor } = fakeComputationalExecutor("checked_range: 1..20\n");
			const lookup: LiteratureSourceLookup = {
				search: async () => [
					{
						kind: "paper",
						title: "Prime values of quadratic polynomials",
						url: "https://example.test/note",
						summary: "A number-theory paper on prime values of integer quadratic polynomials.",
						extractedText: "The n^2 + 1 prime-value question remains open.",
					},
				],
			};
			const harness = new CoMathHarness({
				statePath,
				startFirstRun: false,
				notify: () => {},
				runBackendCommand: async () => ({ ok: true, messages: [] }),
				researchModelExecutor: workstreamExecutor,
				researchDirectorExecutor: directorExecutor,
				computationalExecutor,
				literatureSourceLookup: lookup,
			});
			let state = createEmptyProjectState({
				projectId: "proj-test",
				title: "n^2 + 1 primes",
				rootQuestion: "Are there infinitely many primes of the form n^2 + 1?",
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
				title: "Known theorem or literature reduction",
				objective: "Find theorem references.",
				suggestedNextMove: "Find sources.",
				priority: 2,
				now: NOW,
				actor: "human",
			});
			await saveProjectState(statePath, state);

			await harness.handlePrompt("work the plan for 2 steps");
			await waitFor(statePath, "completed brief-threading batch", (candidate) =>
				Boolean(candidate?.researchBatches[0]?.status === "completed"),
			);

			const computationSpecialist = requests.find(
				(request) => request.role === "specialist" && request.prompt.includes("computational specialist"),
			);
			expect(computationSpecialist?.prompt).toContain("Task brief from the research plan:");
			expect(computationSpecialist?.prompt).toContain("Goal: Numeric evidence for the pattern.");
			expect(computationSpecialist?.prompt).toContain("- A verdict for the range is recorded.");
			const literatureSpecialist = requests.find(
				(request) => request.role === "specialist" && request.prompt.includes("literature specialist"),
			);
			expect(literatureSpecialist?.prompt).toContain("Task brief from the research plan:");
			expect(literatureSpecialist?.prompt).toContain("Goal: Source-backed status of the question.");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

async function waitFor(
	statePath: string,
	description: string,
	condition: (state: CoMathProjectState | undefined) => boolean,
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
