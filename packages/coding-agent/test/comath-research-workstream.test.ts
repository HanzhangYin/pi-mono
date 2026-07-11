import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCoMathResearchAutoPlan } from "../src/modes/comath/comath-research-autoplan.ts";
import {
	type ResearchWorkstreamModelExecutor,
	type ResearchWorkstreamModelRole,
	type ResearchWorkstreamStageResult,
	runModelBackedResearchWorkstreamStaged,
} from "../src/modes/comath/comath-research-model-workstream.ts";
import { CoMathResearchRunner } from "../src/modes/comath/comath-research-runner.ts";
import { runResearchWorkstream } from "../src/modes/comath/comath-research-workstream.ts";
import type { ResearchPath } from "../src/modes/comath/schema.ts";
import {
	addResearchPath,
	createEmptyProjectState,
	loadProjectState,
	saveProjectState,
} from "../src/modes/comath/storage.ts";

const ROOT_QUESTION = "Are there infinitely many primes of the form n^2 + 1?";

function buildPaths(rootQuestion = ROOT_QUESTION): ResearchPath[] {
	const plan = createCoMathResearchAutoPlan(rootQuestion);
	return plan.paths.map((path, index) => ({
		id: `path-${index + 1}`,
		title: path.title,
		objective: path.objective,
		status: "active",
		latestFindings: [],
		blockers: [],
		suggestedNextMove: path.suggestedNextMove,
		priority: path.priority,
		createdAt: "2026-06-05T12:00:00.000Z",
		updatedAt: "2026-06-05T12:00:00.000Z",
	}));
}

function runForTitle(title: string, rootQuestion = ROOT_QUESTION) {
	const paths = buildPaths(rootQuestion);
	const path = paths.find((candidate) => candidate.title === title);
	if (!path) {
		throw new Error(`Missing research path for title: ${title}`);
	}
	return runResearchWorkstream({
		rootQuestion,
		path,
		allPaths: paths,
		now: "2026-06-05T12:30:00.000Z",
	});
}

describe("co-math research workstream", () => {
	it("includes coordinator, specialist, critic, and synthesis steps for the direct proof path", () => {
		const report = runForTitle("Direct proof attempt");
		expect(report.steps.map((step) => step.role)).toEqual(["coordinator", "specialist", "critic", "synthesizer"]);
		expect(report.status).toBe("completed");
		expect(report.coordinatorBrief).toContain("direct proof path");
		expect(Date.parse(report.completedAt)).toBeGreaterThan(Date.parse(report.startedAt));
		const specialist = report.steps.find((step) => step.role === "specialist");
		expect(specialist?.details.join("\n")).toContain("Euclid-style argument is not immediate");
	});

	it("catches the lack of an infinitude mechanism for n^2 + 1 in the direct proof critic", () => {
		const report = runForTitle("Direct proof attempt");
		const criticisms = report.criticisms.join("\n");
		expect(criticisms).toContain("does not immediately preserve the form n^2 + 1");
		expect(criticisms).toContain("not a proof of infinitude");
		expect(report.gaps.join("\n")).toContain("No complete mechanism has been established for infinitely many even n");
		expect(report.promisingStrategy.join("\n")).toContain("4m^2 + 1");
		expect(report.suggestedNextMove).toContain("weaker theorem or a source-backed literature check");
	});

	it("preserves the uncertainty that examples do not prove infinitude", () => {
		const report = runForTitle("Small examples and counterexamples");
		expect(report.findings.join("\n")).toContain("n = 1 gives 2, prime");
		expect(report.gaps.join("\n")).toContain("do not prove or disprove infinitude");
		expect(report.criticisms.join("\n")).toContain("does not establish that infinitely many");
	});

	it("turns the reformulation path into an actionable bridge to weaker targets", () => {
		const report = runForTitle("Reformulation");
		const text = [
			report.coordinatorBrief,
			...report.findings,
			...report.criticisms,
			...report.gaps,
			...report.promisingStrategy,
			report.suggestedNextMove,
		].join("\n");

		expect(text).toContain("equivalent or related frames");
		expect(text).toContain("Polynomial prime values");
		expect(text).toContain("4m^2 + 1");
		expect(text).toContain("not a proof");
		expect(text).toContain("source-backed search targets");
		expect(report.suggestedNextMove).toContain("continue path 4");
	});

	it("turns the weaker-special-cases path into candidate lemmas for a proof attempt", () => {
		const report = runForTitle("Weaker special cases");
		const text = [
			report.coordinatorBrief,
			...report.findings,
			...report.criticisms,
			...report.gaps,
			...report.promisingStrategy,
			report.suggestedNextMove,
		].join("\n");

		expect(text).toContain("candidate lemmas or weaker targets");
		expect(text).toContain("Parity obstruction");
		expect(text).toContain("Status: proved");
		expect(text).toContain("computational evidence only");
		expect(text).toContain("Small-prime obstructions");
		expect(text).toContain("do not bridge to infinitely many primes");
		expect(report.suggestedNextMove).toContain("continue path 2");
	});

	it("requests source-backed literature verification for the known theorem path", () => {
		const report = runForTitle("Known theorem or literature reduction");
		expect(report.criticisms.join("\n")).toContain("search targets, not verified citations");
		expect(report.gaps.join("\n")).toContain("source-backed literature check is still needed");
		// The deterministic workstream no longer volunteers human help; the verification need is an
		// agent-actionable strategy line instead.
		expect(report.promisingStrategy.join("\n")).toContain("verify the exact status of the relevant theorem targets");
		expect(report.humanHelpUseful).toEqual([]);
	});

	it("produces a working-paper summary and a concrete next move", () => {
		const report = runForTitle("Weaker special cases");
		expect(report.workingPaperSectionTitle).toBe("Weaker statements");
		expect(report.workingPaperSummary).toContain("Research workstream: Weaker special cases");
		expect(report.workingPaperSummary).toContain("Findings:");
		expect(report.workingPaperSummary).toContain("Open gaps:");
		expect(report.suggestedNextMove.length).toBeGreaterThan(0);
	});

	it("stays generic and uncertainty-preserving for a non-n^2+1 problem", () => {
		const report = runForTitle("Direct proof attempt", "Is every even number greater than two a sum of two primes?");
		expect(report.steps.map((step) => step.role)).toEqual(["coordinator", "specialist", "critic", "synthesizer"]);
		expect(report.criticisms.join("\n")).not.toContain("n^2 + 1");
		expect(report.gaps.length).toBeGreaterThan(0);
		expect(report.suggestedNextMove.length).toBeGreaterThan(0);
	});
});

function roleMarkdown(role: ResearchWorkstreamModelRole): string {
	if (role === "critic") {
		return "## Review\n- The attempt is bounded.\n## Gaps\n- The mechanism is open.";
	}
	if (role === "synthesizer") {
		return [
			"## Promising strategy",
			"- Continue the bounded attempt.",
			"## Findings",
			"- A bounded observation was recorded.",
			"## Gap",
			"- The mechanism is open.",
			"## Next",
			"- Continue this path.",
		].join("\n");
	}
	return [
		"## Findings",
		"- A bounded observation was recorded.",
		"## Promising strategy",
		"- Continue the bounded attempt.",
		"## Gaps",
		"- The mechanism is open.",
		"## Next",
		"- Continue this path.",
	].join("\n");
}

describe("co-math model-backed research workstream provenance", () => {
	it("surfaces per-stage model-call provenance from the executor", async () => {
		const paths = buildPaths();
		const path = paths.find((candidate) => candidate.title === "Direct proof attempt");
		if (!path) {
			throw new Error("Missing direct proof path.");
		}
		let callCount = 0;
		const executor: ResearchWorkstreamModelExecutor = {
			run: async (request) => {
				callCount += 1;
				return {
					text: roleMarkdown(request.role),
					provenance: { model: "fake-model", inputTokens: callCount * 10, costUsd: callCount * 0.001 },
				};
			},
		};
		const stageResults: ResearchWorkstreamStageResult[] = [];

		await runModelBackedResearchWorkstreamStaged(
			{
				rootQuestion: ROOT_QUESTION,
				path,
				allPaths: paths,
				now: "2026-06-05T12:30:00.000Z",
				executor,
			},
			{
				onStageCompleted: (result) => {
					stageResults.push(result);
				},
			},
		);

		const byStage = new Map(stageResults.map((result) => [result.stage, result]));
		expect(byStage.get("coordinator")?.provenance).toBeUndefined();
		expect(byStage.get("specialist")?.provenance).toEqual([{ model: "fake-model", inputTokens: 10, costUsd: 0.001 }]);
		expect(byStage.get("critic")?.provenance).toEqual([{ model: "fake-model", inputTokens: 20, costUsd: 0.002 }]);
		expect(byStage.get("synthesizer")?.provenance).toEqual([
			{ model: "fake-model", inputTokens: 30, costUsd: 0.003 },
		]);
	});

	it("persists taskId and model calls on a completed task-backed run", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-run-provenance-runner-"));
		const statePath = join(dir, ".pi", "co-math", "state.json");
		try {
			const executor: ResearchWorkstreamModelExecutor = {
				run: async (request) => ({
					text: roleMarkdown(request.role),
					provenance: {
						model: "fake-model",
						provider: "test-provider",
						thinkingLevel: "high",
						inputTokens: 11,
						outputTokens: 7,
						totalTokens: 18,
						costUsd: 0.002,
						stopReason: "stop",
					},
				}),
			};
			const runner = new CoMathResearchRunner({
				statePath,
				notify: async () => {},
				researchModelExecutor: executor,
				literatureSourceLookup: { search: async () => [] },
				computationalExecutor: {
					runScript: async (draft) => ({
						command: `python3 ${draft.fileName}`,
						exitCode: 0,
						stdout: "",
						stderr: "",
						durationMs: 1,
						scriptFileName: draft.fileName,
						stdoutFileName: "stdout.txt",
					}),
				},
			});
			let state = createEmptyProjectState({
				projectId: "proj-test",
				title: "Provenance project",
				rootQuestion: ROOT_QUESTION,
				now: "2026-06-05T12:00:00.000Z",
			});
			state = addResearchPath(state, {
				title: "Direct proof attempt",
				objective: "Try a direct proof.",
				suggestedNextMove: "Check simple arguments.",
				priority: 1,
				now: "2026-06-05T12:00:00.000Z",
				actor: "human",
			});
			await saveProjectState(statePath, state);
			const path = state.researchPaths[0];
			if (!path) {
				throw new Error("Missing research path.");
			}

			const runId = await runner.runBoundedResearchWorkstreamStep(state, path, {
				taskId: "plan-task-1",
				taskKind: "proof-attempt",
			});

			const finalState = await loadProjectState(statePath);
			const run = finalState?.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
			expect(run?.status).toBe("completed");
			expect(run?.usedFallback).toBeUndefined();
			expect(run?.taskId).toBe("plan-task-1");
			expect(run?.modelCalls?.map((call) => call.stage)).toEqual(["specialist", "critic", "synthesizer"]);
			expect(run?.modelCalls?.[0]).toMatchObject({
				model: "fake-model",
				provider: "test-provider",
				thinkingLevel: "high",
				inputTokens: 11,
				outputTokens: 7,
				totalTokens: 18,
				costUsd: 0.002,
				stopReason: "stop",
			});
			expect(run?.modelCalls?.every((call) => typeof call.at === "string" && call.at.length > 0)).toBe(true);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
