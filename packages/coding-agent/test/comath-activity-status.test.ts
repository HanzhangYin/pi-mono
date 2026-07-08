import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	formatCoMathActivityElapsed,
	formatCoMathResearchPhaseActivityStatus,
	formatCoMathResearchStepActivityStatus,
} from "../src/modes/comath/comath-foreground-progress.ts";
import { CoMathHarness, type CoMathResearchPhaseActivitySignal } from "../src/modes/comath/comath-harness.ts";
import type { ResearchWorkstreamModelExecutor } from "../src/modes/comath/comath-research-model-workstream.ts";
import {
	addResearchPath,
	createEmptyProjectState,
	loadProjectState,
	saveProjectState,
} from "../src/modes/comath/storage.ts";

const NOW = "2026-06-05T12:00:00.000Z";

describe("co-math activity status formatting", () => {
	it("formats phase and step statuses as short product copy", () => {
		expect(formatCoMathResearchPhaseActivityStatus("planning")).toBe("co-math: planning the next research steps");
		expect(formatCoMathResearchPhaseActivityStatus("independent-review")).toBe(
			"co-math: independently reviewing the finished step",
		);
		expect(formatCoMathResearchPhaseActivityStatus("plan-update")).toBe(
			"co-math: updating the plan with what was learned",
		);
		expect(formatCoMathResearchStepActivityStatus(2, 3)).toBe("co-math: research step 2 of 3");
	});

	it("formats elapsed time compactly", () => {
		expect(formatCoMathActivityElapsed(0)).toBe("0s");
		expect(formatCoMathActivityElapsed(59_499)).toBe("59s");
		expect(formatCoMathActivityElapsed(65_000)).toBe("1m 05s");
		expect(formatCoMathActivityElapsed(605_000)).toBe("10m 05s");
	});
});

describe("co-math research phase activity signals", () => {
	it("keeps a live status through planning, the run, and the independent review", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-activity-signals-"));
		const statePath = join(dir, ".pi", "co-math", "state.json");
		const signals: CoMathResearchPhaseActivitySignal[] = [];
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
							objective: "Work the mathematics directly.",
							tasks: [
								{
									kind: "proof-attempt",
									title: "Prove the opening lemma",
									description: "Write the opening argument.",
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
				return { text: "## Verdict\naccepted" };
			},
		};
		const harness = new CoMathHarness({
			statePath,
			startFirstRun: false,
			notify: () => {},
			runBackendCommand: async () => ({ ok: true, messages: [] }),
			researchModelExecutor: workstreamExecutor,
			researchDirectorExecutor: directorExecutor,
			onResearchPhaseActivity: (signal) => {
				signals.push(signal);
			},
		});
		try {
			let state = createEmptyProjectState({
				projectId: "proj-test",
				title: "Is the recorded map null-homotopic?",
				rootQuestion: "Is the recorded map null-homotopic?",
				now: NOW,
			});
			state = addResearchPath(state, {
				title: "Direct proof attempt",
				objective: "Write the argument.",
				suggestedNextMove: "Write the opening lemma.",
				priority: 1,
				now: NOW,
				actor: "human",
			});
			await saveProjectState(statePath, state);
			await harness.handlePrompt("work the plan for 1 step");
			await waitForBatchCompleted(statePath);

			const startedStatuses = signals
				.filter(
					(signal): signal is Extract<CoMathResearchPhaseActivitySignal, { kind: "start" }> =>
						signal.kind === "start",
				)
				.map((signal) => signal.status);
			// The bounded step, director planning, and the independent review each held a status.
			expect(startedStatuses).toContain("co-math: research step 1 of 1");
			expect(startedStatuses).toContain("co-math: planning the next research steps");
			expect(startedStatuses).toContain("co-math: independently reviewing the finished step");
			// Every start was balanced by an end, so no stale status can linger in the footer.
			const open = new Set<string>();
			for (const signal of signals) {
				if (signal.kind === "start") {
					open.add(signal.activityId);
				} else {
					expect(open.has(signal.activityId)).toBe(true);
					open.delete(signal.activityId);
				}
			}
			expect(open.size).toBe(0);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

async function waitForBatchCompleted(statePath: string): Promise<void> {
	for (let attempt = 0; attempt < 500; attempt += 1) {
		const state = await loadProjectState(statePath);
		if (state?.researchBatches[0]?.status === "completed") {
			return;
		}
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});
	}
	throw new Error("Timed out waiting for the research batch to complete.");
}
