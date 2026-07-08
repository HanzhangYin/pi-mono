import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CoMathHarness } from "../src/modes/comath/comath-harness.ts";
import { formatResearchObligationsSummary } from "../src/modes/comath/comath-progress.ts";
import { buildResearchContextPack } from "../src/modes/comath/comath-research-context.ts";
import type { ResearchWorkstreamModelExecutor } from "../src/modes/comath/comath-research-model-workstream.ts";
import {
	applyCompletedTaskToObligations,
	applyConjectureRevisionToObligations,
	DEGRADED_RESEARCH_GAP,
} from "../src/modes/comath/comath-research-obligations.ts";
import type {
	CoMathProjectState,
	ResearchEvidenceClassification,
	ResearchPlanTaskRecord,
} from "../src/modes/comath/schema.ts";
import {
	addResearchEvidenceBoardEntry,
	addResearchPath,
	addResearchPlan,
	addResearchPlanTask,
	createEmptyProjectState,
	describeObligationEstablishmentGate,
	getResearchObligationChildren,
	getResearchPlanTasks,
	getRootResearchObligation,
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

function withPlanTask(state: CoMathProjectState): { state: CoMathProjectState; task: ResearchPlanTaskRecord } {
	let nextState = addResearchPlan(state, { title: "Plan", objective: "Progress.", now: NOW, actor: "human" });
	nextState = addResearchPlanTask(nextState, {
		planId: "research-plan-1",
		kind: "proof-attempt",
		title: "Attempt a focused proof step",
		description: "Try the most promising move.",
		pathId: "path-1",
		now: NOW,
		actor: "human",
	});
	const task = getResearchPlanTasks(nextState, "research-plan-1")[0];
	if (!task) {
		throw new Error("Expected a plan task.");
	}
	return { state: nextState, task };
}

function withEvidence(
	state: CoMathProjectState,
	claim: string,
	classification: ResearchEvidenceClassification,
): { state: CoMathProjectState; entryId: string } {
	const nextState = addResearchEvidenceBoardEntry(state, {
		claim,
		classification,
		rationale: "Recorded for the obligations test.",
		now: NOW,
		actor: "workstream",
	});
	const entryId = nextState.researchEvidenceBoard.at(-1)?.id;
	if (!entryId) {
		throw new Error("Expected an evidence entry.");
	}
	return { state: nextState, entryId };
}

describe("co-math obligation ledger", () => {
	it("attaches model-backed supporting evidence and records a clean review on the root", () => {
		const base = withPlanTask(createEulerState());
		const { state, entryId } = withEvidence(
			base.state,
			"All values up to 10^6 were checked without a counterexample below n = 40.",
			"computation",
		);

		const next = applyCompletedTaskToObligations(state, {
			task: base.task,
			reportId: "research-report-1",
			runUsedFallback: false,
			modelBacked: true,
			newEvidenceEntryIds: [entryId],
			skeptic: { concerns: [], counterexampleFound: false },
			now: NOW,
		});

		const root = getRootResearchObligation(next);
		expect(root).toMatchObject({
			statement: "Is n^2 + n + 41 prime for every non-negative integer n?",
			status: "supported",
			evidenceEntryIds: [entryId],
			gaps: [],
			reviewedCleanAt: NOW,
		});
		expect(describeObligationEstablishmentGate(next, root?.id ?? "").ok).toBe(true);
		// Nothing auto-establishes: establishment stays an explicit, gated transition.
		expect(root?.status).not.toBe("established");
	});

	it("records a gap instead of support when the run degraded to the deterministic fallback", () => {
		const base = withPlanTask(createEulerState());
		const { state, entryId } = withEvidence(base.state, "A finite check that must not count.", "computation");

		for (const scenario of [
			{ runUsedFallback: true, modelBacked: true },
			{ runUsedFallback: false, modelBacked: false },
		]) {
			const next = applyCompletedTaskToObligations(state, {
				task: base.task,
				reportId: "research-report-1",
				runUsedFallback: scenario.runUsedFallback,
				modelBacked: scenario.modelBacked,
				newEvidenceEntryIds: [entryId],
				now: NOW,
			});
			const root = getRootResearchObligation(next);
			expect(root).toMatchObject({
				status: "open",
				evidenceEntryIds: [],
				gaps: [DEGRADED_RESEARCH_GAP],
			});
			expect(describeObligationEstablishmentGate(next, root?.id ?? "").ok).toBe(false);
		}
	});

	it("refutes the root on conflicting evidence and records skeptic concerns as gaps", () => {
		const base = withPlanTask(createEulerState());
		const { state, entryId } = withEvidence(
			base.state,
			"n = 40 gives 41^2 = 1681, which is composite.",
			"conflicting",
		);

		const next = applyCompletedTaskToObligations(state, {
			task: base.task,
			reportId: "research-report-1",
			runUsedFallback: false,
			modelBacked: true,
			newEvidenceEntryIds: [entryId],
			skeptic: { concerns: ["The verified range is small."], counterexampleFound: true },
			now: NOW,
		});

		const root = getRootResearchObligation(next);
		expect(root).toMatchObject({
			status: "refuted",
			statusReason: "n = 40 gives 41^2 = 1681, which is composite.",
			refutationEvidenceEntryIds: [entryId],
			gaps: ["The verified range is small."],
		});
		expect(root?.reviewedCleanAt).toBeUndefined();
		expect(describeObligationEstablishmentGate(next, root?.id ?? "").reasons).toContain("The obligation is refuted.");
	});

	it("turns specialist conjectures into subclaims without duplicating them across runs", () => {
		const base = withPlanTask(createEulerState());
		const { state, entryId } = withEvidence(
			base.state,
			"Every composite value of the polynomial is divisible by a prime at most 41.",
			"conjecture",
		);

		const input = {
			task: base.task,
			reportId: "research-report-1",
			runUsedFallback: false,
			modelBacked: true,
			newEvidenceEntryIds: [entryId],
			now: NOW,
		};
		const once = applyCompletedTaskToObligations(state, input);
		const twice = applyCompletedTaskToObligations(once, input);

		const root = getRootResearchObligation(twice);
		const children = getResearchObligationChildren(twice, root?.id ?? "");
		expect(children).toHaveLength(1);
		expect(children[0]).toMatchObject({
			statement: "Every composite value of the polynomial is divisible by a prime at most 41.",
			status: "supported",
			evidenceEntryIds: [entryId],
		});
		// An unsettled subclaim blocks establishing the root.
		expect(describeObligationEstablishmentGate(twice, root?.id ?? "").reasons).toContain(
			"1 required subclaim is not settled.",
		);
	});

	it("keeps related-theorem reports and source commentary from supporting the root", () => {
		const base = withPlanTask(createEulerState());
		// A survey's report of a theorem about a *different* polynomial family: real mathematics,
		// but not about the root statement, so it must not count as root support.
		const offTarget = withEvidence(
			base.state,
			"The Friedlander-Iwaniec theorem proves there are infinitely many primes of the form x^2 + y^4.",
			"theorem",
		);
		// Commentary about what a preprint claims: not a mathematical statement at all.
		const commentary = withEvidence(
			offTarget.state,
			"[source-5] claims or proposes a proof that the polynomial takes infinitely many prime values.",
			"heuristic",
		);
		// A theorem statement about the root's own object still attaches.
		const onTarget = withEvidence(
			commentary.state,
			"For n^2 + n + 41, every prime divisor of a value is a quadratic residue pattern prime.",
			"theorem",
		);

		const next = applyCompletedTaskToObligations(onTarget.state, {
			task: base.task,
			reportId: "research-report-1",
			runUsedFallback: false,
			modelBacked: true,
			newEvidenceEntryIds: [offTarget.entryId, commentary.entryId, onTarget.entryId],
			now: NOW,
		});

		const root = getRootResearchObligation(next);
		expect(root?.status).toBe("supported");
		expect(root?.evidenceEntryIds).toEqual([onTarget.entryId]);
		// The source commentary did not become a required subclaim of the root.
		expect(getResearchObligationChildren(next, root?.id ?? "")).toEqual([]);
	});

	it("retires the refuted root and opens the revised statement as the new root", () => {
		const base = withPlanTask(createEulerState());
		const refutation = withEvidence(base.state, "n = 40 gives 41^2, composite.", "conflicting");
		let state = applyCompletedTaskToObligations(refutation.state, {
			task: base.task,
			reportId: "research-report-1",
			runUsedFallback: false,
			modelBacked: true,
			newEvidenceEntryIds: [refutation.entryId],
			now: NOW,
		});
		const revision = withEvidence(state, "n^2 + n + 41 is prime for every integer 0 <= n <= 39.", "conjecture");
		state = applyConjectureRevisionToObligations(revision.state, {
			task: base.task,
			revisedEntryIds: [revision.entryId],
			now: NOW,
		});

		expect(state.researchObligations[0]).toMatchObject({
			status: "retired",
			statusReason: "Superseded by a revised statement.",
			refutationEvidenceEntryIds: [refutation.entryId],
		});
		expect(getRootResearchObligation(state)).toMatchObject({
			statement: "n^2 + n + 41 is prime for every integer 0 <= n <= 39.",
			status: "open",
		});
	});

	it("formats the obligation ledger and context pack without internal ids", () => {
		const base = withPlanTask(createEulerState());
		const { state, entryId } = withEvidence(base.state, "n = 40 gives 41^2, composite.", "conflicting");
		const next = applyCompletedTaskToObligations(state, {
			task: base.task,
			runUsedFallback: false,
			modelBacked: true,
			newEvidenceEntryIds: [entryId],
			skeptic: { concerns: ["The verified range is small."], counterexampleFound: true },
			now: NOW,
		});

		const summary = formatResearchObligationsSummary(next);
		expect(summary).toContain("What the research owes and where it stands");
		expect(summary).toContain("Is n^2 + n + 41 prime for every non-negative integer n? — refuted");
		expect(summary).toContain("Why: n = 40 gives 41^2, composite.");
		expect(summary).toContain("Gap: The verified range is small.");
		expect(summary).not.toContain("obligation-");
		expect(summary).not.toContain("evidence-board");
		expectProductCopy(summary);
		expect(formatResearchObligationsSummary({ researchObligations: [] })).toContain(
			"No claims are on the ledger yet.",
		);

		const pack = buildResearchContextPack(next);
		expect(pack).toContain("Obligations (claims the project must establish or refute):");
		expect(pack).toContain("[refuted] Is n^2 + n + 41 prime for every non-negative integer n?");
		expect(pack).toContain("gaps: 1");
		expect(pack).toContain("refutations: 1");
	});
});

describe("co-math obligation harness flow", () => {
	it("supports the root obligation after a clean model-backed step and a clean review", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-obligations-clean-"));
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
									action: "record_claim",
									claim: "No composite value appears for n below 40; the check ran to 10^5.",
									classification: "computation",
									rationale: "Bounded verification of the polynomial values.",
								}),
							};
						}
						return {
							text: [
								"## Findings",
								"- The statement holds on the verified range.",
								"## Promising strategy",
								"- Extend the verified range and look for structure.",
								"## Gaps",
								"- No general argument yet.",
								"## Next",
								"- Try a structural argument.",
							].join("\n"),
						};
					}
					if (request.role === "critic") {
						return { text: "## Review\n- Sound on the range.\n## Gaps\n- None." };
					}
					return {
						text: [
							"## Promising strategy",
							"- Structural argument.",
							"## Findings",
							"- Verified range is clean.",
							"## Gap",
							"- General case open.",
							"## Next",
							"- Structural argument.",
						].join("\n"),
					};
				},
			};
			const directorExecutor: ResearchWorkstreamModelExecutor = {
				run: async (request) => {
					if (request.prompt.includes("Design a bounded research plan")) {
						return {
							text: JSON.stringify({
								objective: "Check the polynomial's behavior before attempting a proof.",
								tasks: [
									{
										kind: "proof-attempt",
										title: "Verify small cases and record what holds",
										description: "Bounded verification with recorded claims.",
										goal: "Durable, checkable evidence about small cases.",
										acceptanceCriteria: ["A recorded, computation-backed claim."],
										pathNumber: 1,
									},
								],
							}),
						};
					}
					if (request.prompt.includes("A plan task just completed")) {
						return { text: JSON.stringify({ reason: "", actions: [] }) };
					}
					// Skeptic review: clean.
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

			await harness.handlePrompt("work the plan for 1 step");
			await waitFor(statePath, "completed clean obligation task", (state) =>
				Boolean(
					state?.researchPlanTasks[0]?.status === "completed" && state.researchBatches[0]?.status === "completed",
				),
			);

			const state = await loadProjectState(statePath);
			if (!state) {
				throw new Error("Expected durable state.");
			}
			const root = getRootResearchObligation(state);
			expect(root).toMatchObject({
				statement: "Is n^2 + n + 41 prime for every non-negative integer n?",
				status: "supported",
			});
			expect(root?.evidenceEntryIds.length).toBeGreaterThan(0);
			expect(root?.reviewedCleanAt).toBeDefined();
			expect(describeObligationEstablishmentGate(state, root?.id ?? "").ok).toBe(true);

			const before = notices.length;
			await harness.handlePrompt("show obligations");
			const visible = notices.slice(before).join("\n");
			expect(visible).toContain("What the research owes and where it stands");
			expect(visible).toContain("supported (evidence recorded, not established yet)");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("keeps deterministic runs from ever counting as mathematical progress", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-obligations-degraded-"));
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
			await saveProjectState(statePath, createEulerState());

			await harness.handlePrompt("work the plan for 2 steps");
			await waitFor(statePath, "completed deterministic steps", (state) =>
				Boolean(state?.researchBatches[0]?.status === "completed"),
			);

			const state = await loadProjectState(statePath);
			if (!state) {
				throw new Error("Expected durable state.");
			}
			const root = getRootResearchObligation(state);
			expect(root).toMatchObject({
				status: "open",
				evidenceEntryIds: [],
				gaps: [DEGRADED_RESEARCH_GAP],
			});
			expect(state.researchObligations.every((obligation) => obligation.status !== "established")).toBe(true);
			expect(describeObligationEstablishmentGate(state, root?.id ?? "").ok).toBe(false);
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
