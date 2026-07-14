import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ComputationalExecutor } from "../src/modes/comath/comath-computation-executor.ts";
import { CoMathStateStore } from "../src/modes/comath/comath-state-store.ts";
import { CoMathTaskEngine } from "../src/modes/comath/comath-task-engine.ts";
import type { ResearchWorkstreamModelExecutor } from "../src/modes/comath/comath-task-model.ts";
import {
	addResearchPath,
	addResearchPlan,
	addResearchPlanTask,
	createEmptyProjectState,
	saveProjectState,
} from "../src/modes/comath/storage.ts";

const NOW = "2026-07-13T00:00:00.000Z";

describe("co-math task engine", () => {
	it("has no production import path to the retired execution stack", async () => {
		const retiredModules = [
			"comath-research-runner.ts",
			"comath-research-plan-runner.ts",
			"comath-research-batches.ts",
			"comath-research-model-workstream.ts",
			"comath-literature-workstream.ts",
			"comath-computation-workstream.ts",
			"comath-research-specialist-loop.ts",
			"comath-research-execution.ts",
			"comath-research-workstream.ts",
			"comath-research-skeptic.ts",
			"comath-research-revision.ts",
		];
		const sourceDirectory = new URL("../src/modes/comath/", import.meta.url);
		const sourceFiles = await readdir(sourceDirectory);
		expect(sourceFiles).not.toEqual(expect.arrayContaining(retiredModules));
		const productionSource = await Promise.all(
			sourceFiles
				.filter((file) => file.endsWith(".ts"))
				.map((file) => readFile(new URL(file, sourceDirectory), "utf8")),
		);
		for (const retiredModule of retiredModules) {
			expect(productionSource.join("\n")).not.toContain(`./${retiredModule}`);
		}
	});

	it("blocks every invalid claim before critique and gives the next attempt its failure context", async () => {
		const directory = await mkdtemp(join(tmpdir(), "comath-task-engine-"));
		try {
			const statePath = join(directory, ".pi", "co-math", "state.json");
			let state = createEmptyProjectState({
				projectId: "claim-validation",
				title: "Claim validation",
				rootQuestion: "Extract the source claim.",
				now: NOW,
			});
			state = addResearchPath(state, {
				id: "path-1",
				title: "Source extraction",
				objective: "Extract a source claim.",
				suggestedNextMove: "Cite exact lines.",
				priority: 1,
				now: NOW,
				actor: "human",
			});
			state = addResearchPlan(state, {
				id: "plan-1",
				title: "Plan",
				objective: "Extract the source claim.",
				now: NOW,
				actor: "human",
			});
			state = addResearchPlanTask(state, {
				id: "task-1",
				planId: "plan-1",
				kind: "source-refresh",
				title: "Extract source claim",
				description: "Use exact local citations.",
				pathId: "path-1",
				now: NOW,
				actor: "human",
			});
			await saveProjectState(statePath, state);

			const prompts: string[] = [];
			const engine = new CoMathTaskEngine({
				stateStore: new CoMathStateStore(statePath),
				modelExecutor: {
					run: async (request) => {
						prompts.push(`${request.role}\n${request.prompt}`);
						if (request.role !== "specialist") throw new Error("Critic must not run after invalid claims.");
						return {
							text: "## Claims\n- [source-backed; extra label] A purported source claim.\n\n## Strategy\n- none\n\n## Gaps\n- citation missing\n\n## Next\n- inspect source",
						};
					},
				},
				computationalExecutor: {
					runScript: async () => ({ command: "", exitCode: 1, stdout: "", stderr: "", durationMs: 0 }),
				},
			});

			expect((await engine.executeTask({ taskId: "task-1", now: NOW })).status).toBe("needs-revision");
			expect((await engine.executeTask({ taskId: "task-1", now: NOW })).status).toBe("needs-revision");
			expect(prompts).toHaveLength(2);
			expect(prompts[1]).toContain("PRIOR ATTEMPT FAILURES");
			expect(prompts[1]).toContain("Invalid specialist claim contract or exact grounding.");

			const completed = await new CoMathStateStore(statePath).load();
			const secondAttempt = completed?.researchTaskAttempts[1];
			expect(secondAttempt?.stages.find((stage) => stage.stage === "critic")?.status).toBe("pending");
			const catalogPath = join(
				directory,
				".pi",
				"co-math",
				"artifacts",
				"source-catalogs",
				secondAttempt?.sourceCatalogArtifactId ?? "missing",
				"catalog.json",
			);
			const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
				priorAttemptFailures: Array<{ code: string }>;
			};
			expect(catalog.priorAttemptFailures).toMatchObject([{ code: "grounding-invalid" }]);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("allows a refutation task to use bounded sandbox computation and preserves its evidence", async () => {
		const directory = await mkdtemp(join(tmpdir(), "comath-task-engine-"));
		try {
			const statePath = join(directory, ".pi", "co-math", "state.json");
			let state = createEmptyProjectState({
				projectId: "computation-engine",
				title: "Computation engine",
				rootQuestion: "Check finite cases.",
				now: NOW,
			});
			state = addResearchPath(state, {
				id: "path-1",
				title: "Computation",
				objective: "Check finite cases.",
				suggestedNextMove: "Run a bounded script.",
				priority: 1,
				now: NOW,
				actor: "human",
			});
			state = addResearchPlan(state, {
				id: "plan-1",
				title: "Plan",
				objective: "Check finite cases.",
				now: NOW,
				actor: "human",
			});
			state = addResearchPlanTask(state, {
				id: "task-1",
				planId: "plan-1",
				kind: "refutation-attempt",
				title: "Run finite check",
				description: "Check the first four cases.",
				pathId: "path-1",
				now: NOW,
				actor: "human",
			});
			await saveProjectState(statePath, state);

			const requests: Array<{ role: string; purpose: string; prompt: string }> = [];
			const modelExecutor: ResearchWorkstreamModelExecutor = {
				run: async (request) => {
					const prompt = request.prompt ?? "";
					requests.push({ role: request.role, purpose: request.purpose ?? "general", prompt });
					if (
						request.role === "specialist" &&
						!prompt.includes("SANDBOX RESULT") &&
						!prompt.includes("SANDBOX EXECUTION ERROR")
					) {
						return {
							text: JSON.stringify({
								action: "run_computation",
								summary: "Initial finite check.",
								script: "raise RuntimeError('repair me')",
							}),
						};
					}
					if (request.role === "specialist") {
						if (prompt.includes("SANDBOX EXECUTION ERROR") && !prompt.includes("SANDBOX RESULT")) {
							return {
								text: JSON.stringify({
									action: "run_computation",
									summary: "Corrected finite check.",
									script: "print('checked_cases: 4')",
								}),
							};
						}
						if (!prompt.includes("SOURCE INSPECTION ERROR")) {
							expect(prompt).toContain("checked_cases: 4");
							return {
								text: JSON.stringify({
									action: "inspect_source",
									sourceId: "source-1",
									lines: { start: 1, end: 250 },
								}),
							};
						}
						expect(prompt).toContain("checked_cases: 4");
						const artifactId = /ARTIFACT ([a-f0-9]{64})/.exec(prompt)?.[1];
						if (!artifactId) throw new Error("Expected a sandbox artifact id in the follow-up prompt.");
						return {
							text: `## Claims\n- [computed] Four finite cases were checked. [artifact ${artifactId}]\n\n## Strategy\n- Bounded enumeration.\n\n## Gaps\n- This is not a proof.\n\n## Next\n- Seek a structural argument.`,
						};
					}
					if (request.purpose === "skeptic") return { text: "accepted" };
					if (request.role === "critic") return { text: "## Critique\n- claim-1 is finite evidence only." };
					return { text: "## Findings\n- claim-1 records the bounded check." };
				},
			};
			const computationalExecutor: ComputationalExecutor = {
				runScript: async (action) =>
					action.content.includes("repair me")
						? {
								command: "sandboxed-python check.py",
								exitCode: 1,
								stdout: "",
								stderr: "RuntimeError: repair me",
								durationMs: 1,
							}
						: {
								command: "sandboxed-python check.py",
								exitCode: 0,
								stdout: "checked_cases: 4\n",
								stderr: "",
								durationMs: 2,
							},
			};
			const stateStore = new CoMathStateStore(statePath);
			const engine = new CoMathTaskEngine({ stateStore, modelExecutor, computationalExecutor });

			const result = await engine.executeTask({ taskId: "task-1", now: NOW });
			const completed = await stateStore.load();
			const attempt = completed?.researchTaskAttempts[0];
			expect(result.status).toBe("accepted");
			expect(attempt?.computationArtifactIds).toHaveLength(1);
			expect(attempt?.computationArtifactIds[0]).toMatch(/^[a-f0-9]{64}$/);
			expect(attempt?.modelCalls).toHaveLength(7);
			for (const stage of attempt?.stages ?? []) {
				if (!stage.startedAt || !stage.completedAt) continue;
				expect(Date.parse(stage.completedAt)).toBeGreaterThanOrEqual(Date.parse(stage.startedAt));
			}
			expect(attempt?.stages.find((stage) => stage.stage === "specialist")?.artifactIds).toContain(
				attempt?.computationArtifactIds[0],
			);
			const computationArtifact = JSON.parse(
				await readFile(
					join(
						directory,
						".pi",
						"co-math",
						"artifacts",
						"computations",
						attempt?.computationArtifactIds[0] ?? "missing",
						"artifact.json",
					),
					"utf8",
				),
			) as { script?: string; scriptSha256?: string };
			expect(computationArtifact.script).toBe("print('checked_cases: 4')");
			expect(computationArtifact.scriptSha256).toMatch(/^[a-f0-9]{64}$/);
			expect(requests.map((request) => `${request.role}:${request.purpose}`)).toEqual([
				"specialist:general",
				"specialist:computation",
				"specialist:computation",
				"specialist:general",
				"critic:general",
				"synthesizer:general",
				"critic:skeptic",
			]);
			expect(requests.find((request) => request.role === "critic")?.prompt).toContain("checked_cases: 4");
			expect(requests.find((request) => request.purpose === "skeptic")?.prompt).toContain("checked_cases: 4");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("returns an oversized source inspection error to the specialist instead of pausing the attempt", async () => {
		const directory = await mkdtemp(join(tmpdir(), "comath-task-engine-"));
		try {
			const statePath = join(directory, ".pi", "co-math", "state.json");
			let state = createEmptyProjectState({
				projectId: "inspection-recovery",
				title: "Inspection recovery",
				rootQuestion: "Develop a bounded argument.",
				now: NOW,
			});
			state = addResearchPath(state, {
				id: "path-1",
				title: "Proof attempt",
				objective: "Develop a bounded argument.",
				suggestedNextMove: "Inspect relevant evidence.",
				priority: 1,
				now: NOW,
				actor: "human",
			});
			state = addResearchPlan(state, {
				id: "plan-1",
				title: "Plan",
				objective: "Develop a bounded argument.",
				now: NOW,
				actor: "human",
			});
			state = addResearchPlanTask(state, {
				id: "task-1",
				planId: "plan-1",
				kind: "proof-attempt",
				title: "Proof attempt",
				description: "Develop a bounded argument.",
				pathId: "path-1",
				now: NOW,
				actor: "human",
			});
			await saveProjectState(statePath, state);

			let specialistCalls = 0;
			const engine = new CoMathTaskEngine({
				stateStore: new CoMathStateStore(statePath),
				modelExecutor: {
					run: async (request) => {
						if (request.role === "specialist") {
							specialistCalls += 1;
							if (specialistCalls <= 7) {
								if (specialistCalls > 1) {
									expect(request.prompt).toContain("Source inspection is limited to 200 lines per action.");
								}
								return {
									text: JSON.stringify({
										action: "inspect_source",
										sourceId: "source-1",
										lines: { start: 1, end: 250 },
									}),
								};
							}
							expect(request.prompt).toContain("ACTION BUDGET EXHAUSTED");
							return {
								text: "## Claims\n- [conjectural] A structural argument remains to be developed.\n\n## Strategy\n- Split the inspection.\n\n## Gaps\n- No proof yet.\n\n## Next\n- Inspect a bounded range.",
							};
						}
						if (request.purpose === "skeptic") return { text: "accepted" };
						if (request.role === "critic") return { text: "## Critique\n- claim-1 remains conjectural." };
						return { text: "## Findings\n- claim-1 remains conjectural." };
					},
				},
				computationalExecutor: {
					runScript: async () => ({ command: "", exitCode: 1, stdout: "", stderr: "", durationMs: 0 }),
				},
			});

			const result = await engine.executeTask({ taskId: "task-1", now: NOW });
			const completed = await new CoMathStateStore(statePath).load();
			expect(result.status).toBe("accepted");
			expect(specialistCalls).toBe(8);
			expect(completed?.researchTaskAttempts[0]?.stages.find((stage) => stage.stage === "specialist")?.status).toBe(
				"completed",
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("persists a real provider search in literature-task evidence before the specialist call", async () => {
		const directory = await mkdtemp(join(tmpdir(), "comath-task-engine-"));
		try {
			const statePath = join(directory, ".pi", "co-math", "state.json");
			let state = createEmptyProjectState({
				projectId: "literature-engine",
				title: "Literature engine",
				rootQuestion: "Find later work on the exact conjecture.",
				now: NOW,
			});
			state = addResearchPlan(state, {
				id: "plan-1",
				title: "Plan",
				objective: "Search later work.",
				now: NOW,
				actor: "human",
			});
			state = addResearchPlanTask(state, {
				id: "task-1",
				planId: "plan-1",
				kind: "literature-search",
				title: "Search the exact conjecture",
				description: "Search bounded external providers.",
				dependsOnTaskIds: [],
				now: NOW,
				actor: "human",
			});
			await saveProjectState(statePath, state);

			let specialistPrompt = "";
			const engine = new CoMathTaskEngine({
				stateStore: new CoMathStateStore(statePath),
				literatureSourceLookup: {
					search: async () => ({
						sources: [
							{
								title: "Presenting the cohomology of a Schubert variety: Proof of the minimality conjecture",
								provider: "crossref",
								doi: "10.1112/jlms.12832",
								url: "https://doi.org/10.1112/jlms.12832",
								summary: "The abstract says: We prove the minimality conjecture.",
							},
						],
						providers: [
							{
								provider: "crossref",
								query: "Schubert ideal minimal generators",
								status: "completed",
								candidateCount: 1,
							},
						],
						queries: ["Schubert ideal minimal generators"],
						candidateCount: 1,
					}),
				},
				modelExecutor: {
					run: async (request) => {
						if (request.role === "specialist") {
							specialistPrompt = request.prompt ?? "";
							return {
								text: "## Claims\n- [source-backed] The selected Crossref abstract says that the later paper proves the minimality conjecture. [doi:10.1112/jlms.12832]\n\n## Strategy\n- Compare exact theorem text next.\n\n## Gaps\n- Metadata does not supply theorem hypotheses.\n\n## Next\n- Retrieve the paper.",
							};
						}
						if (request.purpose === "skeptic") return { text: "accepted" };
						if (request.role === "critic") return { text: "## Critique\n- Scope is limited to the abstract." };
						return {
							text: "## Strategy\n- Retrieve exact theorem text.\n\n## Gaps\n- Hypotheses remain unchecked.\n\n## Next\n- Compare statements.",
						};
					},
				},
				computationalExecutor: {
					runScript: async () => ({ command: "", exitCode: 1, stdout: "", stderr: "", durationMs: 0 }),
				},
			});

			const result = await engine.executeTask({ taskId: "task-1", now: NOW });
			expect(result.status).toBe("accepted");
			expect(specialistPrompt).toContain("EXTERNAL LITERATURE SEARCH");
			expect(specialistPrompt).toContain("10.1112/jlms.12832");
			const completed = await new CoMathStateStore(statePath).load();
			const catalogId = completed?.researchTaskAttempts[0]?.sourceCatalogArtifactId;
			const catalog = JSON.parse(
				await readFile(
					join(
						directory,
						".pi",
						"co-math",
						"artifacts",
						"source-catalogs",
						catalogId ?? "missing",
						"catalog.json",
					),
					"utf8",
				),
			) as { externalLiteratureSearch?: { providers?: Array<{ status?: string }> } };
			expect(catalog.externalLiteratureSearch?.providers).toMatchObject([{ status: "completed" }]);
			expect(completed?.researchTaskAttempts[0]?.modelCalls).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						status: "completed",
						startedAt: expect.any(String),
						completedAt: expect.any(String),
					}),
				]),
			);
			const reportId = completed?.researchTaskAttempts[0]?.reportArtifactId;
			const report = JSON.parse(
				await readFile(
					join(directory, ".pi", "co-math", "artifacts", "reports", reportId ?? "missing", "artifact.json"),
					"utf8",
				),
			) as { text: string };
			expect(report.text).toContain(
				"claim-1: The selected Crossref abstract says that the later paper proves the minimality conjecture. [doi:10.1112/jlms.12832]",
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("fails closed before a literature specialist when every external provider fails", async () => {
		const directory = await mkdtemp(join(tmpdir(), "comath-task-engine-"));
		try {
			const statePath = join(directory, ".pi", "co-math", "state.json");
			let state = createEmptyProjectState({
				projectId: "literature-failure",
				title: "Literature failure",
				rootQuestion: "Find later work.",
				now: NOW,
			});
			state = addResearchPlan(state, {
				id: "plan-1",
				title: "Plan",
				objective: "Search later work.",
				now: NOW,
				actor: "human",
			});
			state = addResearchPlanTask(state, {
				id: "task-1",
				planId: "plan-1",
				kind: "literature-search",
				title: "Search later work",
				description: "Use external providers.",
				dependsOnTaskIds: [],
				now: NOW,
				actor: "human",
			});
			await saveProjectState(statePath, state);
			let modelCalls = 0;
			const engine = new CoMathTaskEngine({
				stateStore: new CoMathStateStore(statePath),
				literatureSourceLookup: {
					search: async () => ({
						sources: [],
						providers: [
							{
								provider: "crossref",
								query: "later work",
								status: "failed",
								candidateCount: 0,
								error: "HTTP 503",
							},
						],
						queries: ["later work"],
						candidateCount: 0,
					}),
				},
				modelExecutor: {
					run: async () => {
						modelCalls += 1;
						return { text: "unexpected" };
					},
				},
				computationalExecutor: {
					runScript: async () => ({ command: "", exitCode: 1, stdout: "", stderr: "", durationMs: 0 }),
				},
			});

			const result = await engine.executeTask({ taskId: "task-1", now: NOW });
			const completed = await new CoMathStateStore(statePath).load();
			expect(result.status).toBe("paused");
			expect(modelCalls).toBe(0);
			expect(completed?.researchTaskAttempts[0]?.failure?.message).toContain("no successful provider");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("does not promote a literature task with only local or unsupported claims", async () => {
		const directory = await mkdtemp(join(tmpdir(), "comath-task-engine-"));
		try {
			const statePath = join(directory, ".pi", "co-math", "state.json");
			let state = createEmptyProjectState({
				projectId: "literature-grounding",
				title: "Literature grounding",
				rootQuestion: "Find later work.",
				now: NOW,
			});
			state = addResearchPlan(state, {
				id: "plan-1",
				title: "Plan",
				objective: "Search later work.",
				now: NOW,
				actor: "human",
			});
			state = addResearchPlanTask(state, {
				id: "task-1",
				planId: "plan-1",
				kind: "literature-search",
				title: "Search later work",
				description: "Use external providers.",
				dependsOnTaskIds: [],
				now: NOW,
				actor: "human",
			});
			await saveProjectState(statePath, state);
			let skepticCalls = 0;
			const engine = new CoMathTaskEngine({
				stateStore: new CoMathStateStore(statePath),
				literatureSourceLookup: {
					search: async () => ({
						sources: [],
						providers: [
							{
								provider: "crossref",
								query: "later work",
								status: "completed",
								candidateCount: 0,
							},
						],
						queries: ["later work"],
						candidateCount: 0,
					}),
				},
				modelExecutor: {
					run: async (request) => {
						if (request.purpose === "skeptic") {
							skepticCalls += 1;
							return { text: "accepted" };
						}
						if (request.role === "specialist") {
							return {
								text: "## Claims\n- [unsupported] No relevant external result was found.\n\n## Strategy\n- Search.\n\n## Gaps\n- No evidence.\n\n## Next\n- Refine the query.",
							};
						}
						if (request.role === "critic") return { text: "## Critique\n- No external evidence." };
						return { text: "## Findings\n- No grounded result." };
					},
				},
				computationalExecutor: {
					runScript: async () => ({ command: "", exitCode: 1, stdout: "", stderr: "", durationMs: 0 }),
				},
			});

			const result = await engine.executeTask({ taskId: "task-1", now: NOW });
			expect(result.status).toBe("needs-revision");
			expect(skepticCalls).toBe(0);
			const completed = await new CoMathStateStore(statePath).load();
			expect(completed?.researchTaskAttempts[0]?.failure?.code).toBe("missing-external-literature-grounding");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
