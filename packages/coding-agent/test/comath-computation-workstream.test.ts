import { describe, expect, it } from "vitest";
import type { ResearchPath } from "../examples/extensions/co-math/schema.ts";
import type {
	ComputationalExecutionResult,
	ComputationalExecutor,
	ComputationalScriptDraft,
} from "../src/modes/comath/comath-computation-executor.ts";
import {
	isComputationalResearchPath,
	runComputationResearchWorkstreamStaged,
} from "../src/modes/comath/comath-computation-workstream.ts";
import type {
	ResearchWorkstreamModelExecutor,
	ResearchWorkstreamModelRequest,
} from "../src/modes/comath/comath-research-model-workstream.ts";

const QUESTION = "Are there infinitely many primes of the form n^2 + 1?";

function buildExamplesPath(): ResearchPath {
	return {
		id: "path-1",
		title: "Small examples and counterexamples",
		objective: "Gather small examples and counterexamples to guide the proof search.",
		status: "active",
		latestFindings: [],
		blockers: [],
		suggestedNextMove: "Run a bounded finite check.",
		priority: 1,
		createdAt: "2026-06-05T12:00:00.000Z",
		updatedAt: "2026-06-05T12:00:00.000Z",
	};
}

function createExecutor(responses: Record<ResearchWorkstreamModelRequest["role"], string>): {
	executor: ResearchWorkstreamModelExecutor;
	requests: ResearchWorkstreamModelRequest[];
} {
	const requests: ResearchWorkstreamModelRequest[] = [];
	return {
		requests,
		executor: {
			run: async (request) => {
				requests.push(request);
				return { text: responses[request.role] };
			},
		},
	};
}

function createComputationalExecutor(result: ComputationalExecutionResult): {
	computationalExecutor: ComputationalExecutor;
	drafts: ComputationalScriptDraft[];
} {
	const drafts: ComputationalScriptDraft[] = [];
	return {
		drafts,
		computationalExecutor: {
			runScript: async (draft) => {
				drafts.push(draft);
				return result;
			},
		},
	};
}

describe("computation research workstream", () => {
	it("extracts a fenced Python script, runs computation, and passes stdout into review prompts", async () => {
		const path = buildExamplesPath();
		const { executor, requests } = createExecutor({
			specialist: [
				"Finite search for n^2 + 1.",
				"",
				"```python",
				"BOUND = 20",
				"print('checked_range: 1 <= n <= 20')",
				"print('prime_values_found: 7')",
				"```",
			].join("\n"),
			critic: [
				"## Review",
				"- The computation has an explicit checked range.",
				"## Limitations",
				"- A finite computation does not prove an infinite claim.",
				"## Gaps",
				"- The bridge to a theorem remains open.",
			].join("\n"),
			synthesizer: [
				"## Promising strategy",
				"- Use finite prime values to look for obstructions.",
				"## Findings",
				"- checked_range: 1 <= n <= 20",
				"- prime_values_found: 7",
				"## Limitations",
				"- A finite computation does not prove an infinite claim.",
				"## Gaps",
				"- No theorem-level proof follows.",
				"## Next",
				"- Use parity to refine the direct-proof path.",
			].join("\n"),
		});
		const { computationalExecutor, drafts } = createComputationalExecutor({
			command: "python3 search.py",
			exitCode: 0,
			stdout: "checked_range: 1 <= n <= 20\nprime_values_found: 7\n",
			stderr: "",
			durationMs: 12,
			scriptFileName: "search.py",
			stdoutFileName: "stdout.txt",
		});
		const events: string[] = [];

		const result = await runComputationResearchWorkstreamStaged(
			{
				rootQuestion: QUESTION,
				path,
				allPaths: [path],
				now: "2026-06-05T12:30:00.000Z",
				executor,
				computationalExecutor,
				artifactDirectory: ".pi/co-math/artifacts/research-run-1",
				workingDirectory: "/tmp/comath-computation-test",
			},
			{
				onStageStarted: (stage) => {
					events.push(`start:${stage}`);
				},
				onStageCompleted: (stage) => {
					events.push(`complete:${stage.stage}`);
				},
			},
		);

		expect(events).toEqual([
			"start:coordinator",
			"complete:coordinator",
			"start:specialist",
			"complete:specialist",
			"start:computation",
			"complete:computation",
			"start:critic",
			"complete:critic",
			"start:synthesizer",
			"complete:synthesizer",
		]);
		expect(drafts[0]).toMatchObject({
			fileName: "search.py",
			language: "python",
		});
		expect(drafts[0]?.content).toContain("BOUND = 20");
		expect(requests.map((request) => request.role)).toEqual(["specialist", "critic", "synthesizer"]);
		expect(requests[1]?.prompt).toContain("checked_range: 1 <= n <= 20");
		expect(requests[2]?.prompt).toContain("Exit code: 0");
		expect(result.report.status).toBe("completed");
		expect(result.report.criticisms.join("\n")).toContain("A finite computation does not prove an infinite claim.");
		expect(result.artifacts).toMatchObject([
			{
				kind: "script",
				filePath: ".pi/co-math/artifacts/research-run-1/search.py",
				exitCode: 0,
			},
			{
				kind: "stdout",
				filePath: ".pi/co-math/artifacts/research-run-1/stdout.txt",
				summary: "checked_range: 1 <= n <= 20\nprime_values_found: 7",
			},
		]);
	});

	it("rejects unsafe model scripts and falls back to a deterministic bounded script", async () => {
		const path = buildExamplesPath();
		const { executor } = createExecutor({
			specialist: ["Unsafe script.", "", "```python", "import os", "print(os.listdir('.'))", "```"].join("\n"),
			critic: "## Review\n- A finite computation does not prove an infinite claim.\n## Gaps\n- Still open.",
			synthesizer:
				"## Findings\n- Fallback computation ran.\n## Limitations\n- A finite computation does not prove an infinite claim.\n## Next\n- Continue carefully.",
		});
		const { computationalExecutor, drafts } = createComputationalExecutor({
			command: "python3 search.py",
			exitCode: 0,
			stdout: "checked_range: 1 <= n <= 10000\nprime_values_found: 841\n",
			stderr: "",
			durationMs: 18,
			scriptFileName: "search.py",
			stdoutFileName: "stdout.txt",
		});
		const completedSummaries: string[] = [];

		const result = await runComputationResearchWorkstreamStaged(
			{
				rootQuestion: QUESTION,
				path,
				allPaths: [path],
				now: "2026-06-05T12:30:00.000Z",
				executor,
				computationalExecutor,
				artifactDirectory: ".pi/co-math/artifacts/research-run-1",
			},
			{
				onStageCompleted: (stage) => {
					completedSummaries.push(`${stage.stage}: ${stage.details.join(" ")}`);
				},
			},
		);

		expect(drafts[0]?.content).not.toContain("import os");
		expect(drafts[0]?.summary).toContain("Finite search for prime values");
		expect(completedSummaries.join("\n")).toContain("Rejected script: uses os");
		expect(result.report.status).toBe("completed");
		expect(result.report.steps[1]?.details.join("\n")).toContain("Rejected generated script: uses os");
	});

	it("turns failed computation into a blocked report with failed output records", async () => {
		const path = buildExamplesPath();
		const { executor } = createExecutor({
			specialist: ["Finite search.", "", "```python", "print('checking')", "```"].join("\n"),
			critic:
				"## Review\n- The computation failed.\n## Limitations\n- A finite computation does not prove an infinite claim.\n## Gaps\n- Repair the script.",
			synthesizer:
				"## Findings\n- The computation failed.\n## Limitations\n- A finite computation does not prove an infinite claim.\n## Gaps\n- Repair the script.\n## Next\n- Fix the finite check.",
		});
		const { computationalExecutor } = createComputationalExecutor({
			command: "python3 search.py",
			exitCode: 1,
			stdout: "",
			stderr: "Traceback: failure",
			durationMs: 3,
			scriptFileName: "search.py",
			stdoutFileName: "stdout.txt",
			stderrFileName: "stderr.txt",
		});

		const result = await runComputationResearchWorkstreamStaged(
			{
				rootQuestion: QUESTION,
				path,
				allPaths: [path],
				now: "2026-06-05T12:30:00.000Z",
				executor,
				computationalExecutor,
				artifactDirectory: ".pi/co-math/artifacts/research-run-1",
			},
			{},
		);

		expect(result.report.status).toBe("blocked");
		expect(result.report.gaps.join("\n")).toContain("Repair the script");
		expect(result.artifacts).toMatchObject([
			{ kind: "script", status: "failed", exitCode: 1 },
			{ kind: "stdout", status: "failed", exitCode: 1 },
			{ kind: "stderr", status: "failed", exitCode: 1, summary: "Traceback: failure" },
		]);
	});

	it("detects computational paths from examples and finite-check wording", () => {
		expect(isComputationalResearchPath(buildExamplesPath())).toBe(true);
		expect(
			isComputationalResearchPath({
				...buildExamplesPath(),
				title: "Direct proof attempt",
				objective: "Try to prove the main theorem from lemmas.",
			}),
		).toBe(false);
		expect(
			isComputationalResearchPath({
				...buildExamplesPath(),
				title: "Finite check",
				objective: "Search bounded examples.",
			}),
		).toBe(true);
	});
});
