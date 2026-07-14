import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import type {
	ComputationalExecutor,
	ComputationalScriptDraft,
} from "../src/modes/comath/comath-computation-executor.ts";
import { type CoMathBackendCommandResult, CoMathHarness } from "../src/modes/comath/comath-harness.ts";
import { resolveCoMathSource } from "../src/modes/comath/comath-source.ts";
import type {
	ResearchWorkstreamModelExecutor,
	ResearchWorkstreamModelRequest,
} from "../src/modes/comath/comath-task-model.ts";
import { createEmptyProjectState, loadProjectState, replaceProjectState } from "../src/modes/comath/storage.ts";

const OK: CoMathBackendCommandResult = { ok: true, messages: [] };

describe("co-math directory intake", () => {
	it("resolves, snapshots, and routes the minimal first prompt through the research director", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-directory-intake-"));
		try {
			const sourceRoot = join(dir, "math-source");
			const statePath = join(dir, ".pi", "co-math", "state.json");
			await mkdir(join(sourceRoot, "notes"), { recursive: true });
			await writeFile(join(sourceRoot, "problems.md"), "# Problem\nDetermine whether P holds.", "utf8");
			await writeFile(join(sourceRoot, "notes", "definitions.tex"), "Definitions", "utf8");
			const commands: string[] = [];
			const notices: string[] = [];
			const directorRequests: ResearchWorkstreamModelRequest[] = [];
			const directorExecutor: ResearchWorkstreamModelExecutor = {
				run: async (request) => {
					directorRequests.push(request);
					return {
						text: JSON.stringify({
							objective: "Extract the supplied problems before attempting them.",
							tasks: [
								{
									kind: "proof-attempt",
									title: "Attempt the extracted statement",
									description: "Work on the statement found in the source snapshot.",
									goal: "Make one source-grounded proof step.",
									acceptanceCriteria: ["Cite the exact statement used."],
									pathNumber: 2,
								},
							],
						}),
					};
				},
			};
			const harness = new CoMathHarness({
				statePath,
				sourceCwd: dir,
				startFirstRun: false,
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					commands.push(command);
					if (command.startsWith("init ")) {
						const rootQuestion = command.slice("init ".length);
						await replaceProjectState(
							statePath,
							createEmptyProjectState({
								projectId: "directory-intake-test",
								title: rootQuestion,
								rootQuestion,
								now: "2026-07-12T12:00:00.000Z",
							}),
						);
					}
					return OK;
				},
				researchDirectorExecutor: directorExecutor,
			});

			await harness.handlePrompt(`Look at the directory: ${sourceRoot} and start`);

			const state = await loadProjectState(statePath);
			const snapshotRoot = join(dir, ".pi", "co-math", "artifacts", "sources");
			expect(state?.rootQuestion).toContain("Identify the mathematical questions, claims, and problems");
			expect(state?.artifacts).toHaveLength(4);
			expect(state?.artifacts.every((artifact) => artifact.kind === "source")).toBe(true);
			expect(
				state?.artifacts.every(
					(artifact) =>
						artifact.sourcePath?.startsWith(`${snapshotRoot}${sep}`) ||
						artifact.sourcePath?.includes(`${sep}artifacts${sep}source-indexes${sep}`),
				),
			).toBe(true);
			const manifestArtifact = state?.artifacts.find((artifact) => artifact.title.startsWith("Source manifest"));
			const manifest = JSON.parse(await readFile(manifestArtifact?.sourcePath ?? "", "utf8")) as {
				files: Array<{ relativePath: string; sha256: string }>;
			};
			expect(manifest.files.map((file) => file.relativePath)).toEqual(["notes/definitions.tex", "problems.md"]);
			expect(manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
			expect(state?.literatureSources).toHaveLength(3);
			expect(state?.literatureSources.every((source) => source.kind === "local-file")).toBe(true);
			expect(state?.literatureSources.every((source) => source.provider === "workspace")).toBe(true);
			expect(state?.literatureSources[0]?.externalId).toMatch(/^source-revision-[a-f0-9]{64}$/);
			expect(
				state?.literatureSources
					.slice(1)
					.every((source) => /^source-revision-[a-f0-9]{64}:[a-f0-9]{64}$/.test(source.externalId ?? "")),
			).toBe(true);
			expect(state?.literatureSources[0]?.extractedText).toContain("notes/definitions.tex");
			expect(state?.literatureSources[0]?.extractedText).toContain("problems.md");
			expect(state?.researchPaths).toHaveLength(5);
			expect(state?.researchPlans).toHaveLength(1);
			expect(state?.researchPlanTasks[0]?.kind).toBe("source-refresh");
			expect(state?.researchPlanTasks[1]?.kind).toBe("proof-attempt");
			expect(state?.workstreams).toEqual([]);
			expect(state?.roleRuns).toEqual([]);
			expect(commands).toHaveLength(1);
			expect(commands[0]).toMatch(/^init /);
			expect(commands.some((command) => command.startsWith("queue workstream "))).toBe(false);
			expect(commands).not.toContain("dispatch-next --background");
			expect(directorRequests).toHaveLength(1);
			expect(directorRequests[0]?.purpose).toBe("director");
			expect(directorRequests[0]?.prompt).toContain("Determine whether P holds.");
			expect(directorRequests[0]?.prompt).toContain("UNTRUSTED SOURCE SNAPSHOT");
			expect(notices.join("\n")).not.toContain("paste the question statement");
			expect(notices.join("\n")).toContain("Source snapshot pinned");
			expect(notices.join("\n")).toContain("Research plan created");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("routes a CLI-pinned directory followed by a bare start through the research planner", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-directory-intake-"));
		try {
			const sourceRoot = join(dir, "math-source");
			const statePath = join(dir, ".pi", "co-math", "state.json");
			await mkdir(sourceRoot);
			await writeFile(join(sourceRoot, "problem.md"), "# Question\nClassify all objects with property P.", "utf8");
			const source = await resolveCoMathSource(sourceRoot, dir);
			if (!source) {
				throw new Error("Expected the pinned source to resolve.");
			}
			const commands: string[] = [];
			const harness = new CoMathHarness({
				source,
				statePath,
				startFirstRun: false,
				notify: () => {},
				runBackendCommand: async (command) => {
					commands.push(command);
					if (command.startsWith("init ")) {
						const rootQuestion = command.slice("init ".length);
						await replaceProjectState(
							statePath,
							createEmptyProjectState({
								projectId: "pinned-directory-intake-test",
								title: rootQuestion,
								rootQuestion,
								now: "2026-07-12T12:00:00.000Z",
							}),
						);
					}
					return OK;
				},
			});

			await harness.handlePrompt("start");

			const state = await loadProjectState(statePath);
			expect(state?.researchPlans).toHaveLength(1);
			expect(state?.researchPlanTasks[0]?.kind).toBe("source-refresh");
			expect(state?.literatureSources[0]?.extractedText).toContain("Classify all objects with property P.");
			expect(state?.roleRuns).toEqual([]);
			expect(commands).toHaveLength(1);
			expect(commands).not.toContain("dispatch-next --background");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("executes the first source task through the literature roles without a legacy role run", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-directory-intake-"));
		try {
			const sourceRoot = join(dir, "math-source");
			const statePath = join(dir, ".pi", "co-math", "state.json");
			await mkdir(sourceRoot);
			await writeFile(join(sourceRoot, "question.md"), "# Question\nDoes every finite object satisfy P?", "utf8");
			const commands: string[] = [];
			const directorRequests: ResearchWorkstreamModelRequest[] = [];
			const researchRequests: ResearchWorkstreamModelRequest[] = [];
			const computationDrafts: ComputationalScriptDraft[] = [];
			const computationalExecutor: ComputationalExecutor = {
				runScript: async (draft) => {
					computationDrafts.push(draft);
					return {
						command: "sandboxed-python check.py",
						exitCode: 0,
						stdout: "checked_cases: 4\ncounterexample_found: false\n",
						stderr: "",
						durationMs: 2,
					};
				},
			};
			const directorExecutor: ResearchWorkstreamModelExecutor = {
				run: async (request) => {
					directorRequests.push(request);
					if (request.purpose === "director" && request.prompt.includes("Design a bounded research plan")) {
						return {
							text: JSON.stringify({
								objective: "Extract and investigate the supplied question.",
								tasks: [
									{
										kind: "computation",
										title: "Check bounded source examples",
										description: "Run a bounded check suggested by the extracted statement.",
										goal: "Record finite evidence without claiming a proof.",
										acceptanceCriteria: ["Persist the checked range and output."],
										pathNumber: 1,
									},
								],
							}),
						};
					}
					if (request.purpose === "director") {
						return { text: '{"reason":"","actions":[]}' };
					}
					return {
						text: [
							"## Verdict",
							"accepted",
							"## Concerns",
							"## Counterexample target",
							"No independent counterexample was found in this source-extraction step.",
						].join("\n"),
					};
				},
			};
			const researchExecutor: ResearchWorkstreamModelExecutor = {
				run: async (request) => {
					researchRequests.push(request);
					if (request.purpose === "computation" && request.role === "specialist") {
						return {
							text: [
								"Check four bounded cases.",
								"```python",
								"print('checked_cases: 4')",
								"print('counterexample_found: false')",
								"```",
							].join("\n"),
						};
					}
					if (request.purpose === "computation") {
						return {
							text: [
								"## Review",
								"- The check is finite evidence only.",
								"## Promising strategy",
								"- Use the checked cases to refine the statement.",
								"## Findings",
								"- Four cases were checked.",
								"## Limitations",
								"- Finite evidence is not a proof.",
								"## Gaps",
								"- The general case remains open.",
								"## Next",
								"- Seek a structural lemma.",
								"## Working paper summary",
								"- A bounded check found no counterexample.",
							].join("\n"),
						};
					}
					return {
						text: [
							"## Source-backed status",
							"- [source-2@L1-L2|claim=ordinary-document] asks whether every finite object satisfies P.",
							"## Conjectural or heuristic context",
							"- The source labels the statement as a question.",
							"## Source-backed distinctions",
							"- No proof is supplied in the extracted file.",
							"## Review",
							"- Preserve the statement as unresolved.",
							"## Unsupported or unresolved",
							"- The universal quantifier remains unproved.",
							"## Gaps",
							"- Definitions of object and P are missing.",
							"## Next",
							"- Extract the missing definitions.",
							"## Working paper summary",
							"- The supplied source records one unresolved universal question.",
						].join("\n"),
					};
				},
			};
			const harness = new CoMathHarness({
				statePath,
				sourceCwd: dir,
				initialResearchStepCount: 2,
				notify: () => {},
				runBackendCommand: async (command) => {
					commands.push(command);
					if (command.startsWith("init ")) {
						const rootQuestion = command.slice("init ".length);
						await replaceProjectState(
							statePath,
							createEmptyProjectState({
								projectId: "directory-role-routing-test",
								title: rootQuestion,
								rootQuestion,
								now: "2026-07-12T12:00:00.000Z",
							}),
						);
					}
					return OK;
				},
				researchModelExecutor: researchExecutor,
				researchDirectorExecutor: directorExecutor,
				literatureSourceLookup: { search: async () => [] },
				computationalExecutor,
			});

			await harness.handlePrompt(`Look at the directory: ${sourceRoot} and start`);
			await waitForState(
				statePath,
				(state) =>
					state?.researchTaskAttempts[0]?.status === "needs-revision" &&
					state.researchExecutions[0]?.status === "paused",
			);

			const state = await loadProjectState(statePath);
			expect(state?.researchPlanTasks[0]).toMatchObject({ kind: "source-refresh", status: "blocked" });
			expect(state?.researchTaskAttempts[0]).toMatchObject({
				currentStage: "capability-validation",
				status: "needs-revision",
			});
			expect(state?.researchExecutions[0]?.attemptIds).toEqual([state?.researchTaskAttempts[0]?.id]);
			expect(state?.researchWorkstreamRuns).toEqual([]);
			expect(state?.roleRuns).toEqual([]);
			expect(researchRequests.map((request) => request.role)).toEqual(["specialist", "critic", "synthesizer"]);
			expect(computationDrafts).toHaveLength(0);
			expect(directorRequests.some((request) => request.purpose === "director")).toBe(true);
			expect(directorRequests.some((request) => request.purpose === "skeptic")).toBe(false);
			expect(commands).toHaveLength(1);
			expect(commands).not.toContain("dispatch-next --background");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("does not create state for a missing prompt source", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-directory-intake-"));
		try {
			const statePath = join(dir, ".pi", "co-math", "state.json");
			const commands: string[] = [];
			const notices: string[] = [];
			const harness = new CoMathHarness({
				statePath,
				sourceCwd: dir,
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					commands.push(command);
					return OK;
				},
			});

			await harness.handlePrompt("Look at the directory: ./missing and start");

			expect(await loadProjectState(statePath)).toBeUndefined();
			expect(commands).toEqual([]);
			expect(notices.join("\n")).toContain("could not use that source path");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("does not replace an existing workspace from a later directory prompt", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-directory-intake-"));
		try {
			const sourceRoot = join(dir, "math-source");
			const statePath = join(dir, ".pi", "co-math", "state.json");
			await mkdir(sourceRoot);
			await writeFile(join(sourceRoot, "problem.md"), "Problem", "utf8");
			await replaceProjectState(
				statePath,
				createEmptyProjectState({
					projectId: "existing-project",
					title: "Existing question",
					rootQuestion: "Existing question",
					now: "2026-07-12T12:00:00.000Z",
				}),
			);
			const commands: string[] = [];
			const notices: string[] = [];
			const harness = new CoMathHarness({
				statePath,
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					commands.push(command);
					return OK;
				},
			});

			await harness.handlePrompt(`Look at the directory: ${sourceRoot} and start`);

			const state = await loadProjectState(statePath);
			expect(state?.projectId).toBe("existing-project");
			expect(state?.artifacts).toEqual([]);
			expect(commands.some((command) => command.startsWith("init "))).toBe(false);
			expect(notices.join("\n")).toContain("did not replace it or ingest a new source");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

async function waitForState(
	statePath: string,
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
	throw new Error("Timed out waiting for the source-backed research batch.");
}
