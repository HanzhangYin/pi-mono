import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCoMathBackendCommand } from "../examples/extensions/co-math/commands.ts";
import {
	extractRunSummary,
	formatProductReport,
	friendlyReviewStatus,
} from "../src/modes/comath/comath-backend-output.ts";
import {
	buildCoordinatorContext,
	collectCoordinatorInputIds,
	runResearchCoordinatorSynthesis,
} from "../src/modes/comath/comath-coordinator-synthesis.ts";
import {
	acceptanceCriteriaForResearchDirective,
	CoMathHarness,
	rankCoordinatorMovesForAutonomousExecution,
	researchTaskKindForPath,
	retryablePausedResearchTask,
} from "../src/modes/comath/comath-harness.ts";
import { formatProductProgress } from "../src/modes/comath/comath-progress.ts";
import {
	isLikelyMathResearchQuestion,
	isLikelyMathValidationPrompt,
	isLikelyOperationalNonMathPrompt,
	isResearchCoordinatorPrompt,
	parseNaturalResearchQuestion,
} from "../src/modes/comath/comath-prompts.ts";
import type {
	CoMathProjectState,
	LiteratureClaimSupport,
	ResearchPlanTaskRecord,
	ResearchTaskAttemptRecord,
} from "../src/modes/comath/schema.ts";
import {
	addClaim,
	addMarginNote,
	createEmptyProjectState,
	getDefaultStatePath,
	isClaimSynthesisEligible,
	loadProjectState,
	resolveMarginNote,
	saveProjectState,
	startRoleRun,
	upsertWorkingPaperSectionByTitle,
} from "../src/modes/comath/storage.ts";

const NOW = "2026-06-16T00:00:00.000Z";

async function createCheckpointHarness(): Promise<{
	commands: string[];
	dir: string;
	harness: CoMathHarness;
	notices: string[];
	statePath: string;
}> {
	const dir = await mkdtemp(join(tmpdir(), "comath-checkpoint-"));
	const statePath = join(dir, ".pi", "co-math", "state.json");
	const commands: string[] = [];
	const notices: string[] = [];
	const harness = new CoMathHarness({
		statePath,
		notify: (message) => {
			notices.push(message);
		},
		runBackendCommand: async (command) => {
			commands.push(command);
			if (command.startsWith("init ")) {
				const rootQuestion = command.slice("init ".length);
				await saveProjectState(
					statePath,
					createEmptyProjectState({ projectId: "proj-test", title: rootQuestion, rootQuestion, now: NOW }),
				);
			}
			return { ok: true, messages: [] };
		},
	});
	return { commands, dir, harness, notices, statePath };
}

function buildCoordinatorStateWithClaims(): CoMathProjectState {
	const base = createEmptyProjectState({
		projectId: "proj-twin",
		title: "twin primes",
		rootQuestion: "Are there infinitely many twin primes?",
		now: NOW,
	});
	const supports: LiteratureClaimSupport[] = [
		{
			id: "claim-support-1",
			claim: "Bounded gaps between primes are known to exist.",
			sourceIds: ["source-1"],
			status: "supported",
			createdAt: NOW,
			updatedAt: NOW,
		},
		{
			id: "claim-support-2",
			claim: "A direct proof of the twin prime conjecture follows from these sources.",
			sourceIds: [],
			status: "unsupported",
			createdAt: NOW,
			updatedAt: NOW,
		},
	];
	return { ...base, literatureClaimSupports: supports };
}

describe("co-math paper alignment checkpoint", () => {
	it("keeps non-math operational prompts out of co-math state", async () => {
		for (const prompt of ["run tests", "git status", "show me the files", "what branch am I on?"]) {
			expect(isLikelyOperationalNonMathPrompt(prompt), prompt).toBe(true);
			expect(isLikelyMathValidationPrompt(prompt), prompt).toBe(false);
		}

		// No state mutation when no state exists.
		const { commands, dir, harness, notices, statePath } = await createCheckpointHarness();
		try {
			await harness.handlePrompt("run tests");
			expect(commands).toEqual([]);
			expect(await loadProjectState(statePath)).toBeUndefined();
			expect(notices.join("\n")).toContain("Pi co-math is for mathematical validation and exploration.");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("supports explicit research-vs-validation intent without classifier changes", () => {
		const research = "Are there infinitely many primes of the form n^2 + 1?";
		expect(isLikelyMathResearchQuestion(research)).toBe(true);
		expect(parseNaturalResearchQuestion(research)).toBe(research);

		const validation = "Validate the claim: every even integer greater than 2 is a sum of two primes.";
		expect(isLikelyMathValidationPrompt(validation)).toBe(true);
		expect(isLikelyMathResearchQuestion(validation)).toBe(false);
		expect(parseNaturalResearchQuestion(validation)).toBeUndefined();

		for (const prompt of ["what should we try next?", "what is blocked?", "compare paths"]) {
			expect(isResearchCoordinatorPrompt(prompt), prompt).toBe(true);
			expect(isLikelyOperationalNonMathPrompt(prompt), prompt).toBe(false);
			expect(isLikelyMathResearchQuestion(prompt), prompt).toBe(false);
		}
	});

	it("keeps unsupported claims explicit and separated from supported claims", async () => {
		const { report } = await runResearchCoordinatorSynthesis({ state: buildCoordinatorStateWithClaims(), now: NOW });
		const whatWeKnow = report.whatWeKnow.join("\n");
		const roadblocks = report.roadblocks.join("\n");

		// Supported claim is surfaced as known.
		expect(whatWeKnow).toContain("Bounded gaps between primes are known to exist.");
		// Unsupported claim is surfaced as a roadblock, never promoted into "what we know".
		expect(roadblocks).toContain("A direct proof of the twin prime conjecture");
		expect(whatWeKnow).not.toContain("A direct proof of the twin prime conjecture");
	});

	it("gives the coordinator canonical accepted task context without treating it as external evidence", () => {
		const state = buildCoordinatorStateWithClaims();
		state.researchTaskAttempts = [
			{
				id: "attempt-computation-1",
				taskId: "task-computation-1",
				planId: "plan-1",
				attemptNumber: 1,
				status: "accepted",
				currentStage: "finalization",
				stages: [],
				computationArtifactIds: ["content-computation-1"],
				modelCalls: [],
				reviewFindings: [],
				reportArtifactId: "report-computation-1",
				startedAt: NOW,
				updatedAt: NOW,
				completedAt: NOW,
			},
		];
		const context = buildCoordinatorContext(
			state,
			"ACCEPTED ATTEMPT task-8-1\nThe graded Nakayama reduction is accepted.",
			"NON-ACCEPTED ATTEMPT task-13-1\nCRITIC: prove the presentation before computing.",
		);
		expect(context).toContain("ACCEPTED ATTEMPT task-8-1");
		expect(context).toContain("internal project context; not external literature or citable evidence");
		expect(context).toContain("Task-engine plan state:\n(none)");
		expect(context).toContain("Recent non-accepted task reviews");
		expect(context).toContain("prove the presentation before computing");
		expect(context).toContain("Task-owned computation outputs:");
		expect(context).toContain("Content output ids: content-computation-1");
		expect(context).toContain("Reviewed report output: report-computation-1");
		expect(collectCoordinatorInputIds(state).inputComputationalArtifactIds).toContain("content-computation-1");
	});

	it("keeps accepted work visible when coordinator model synthesis falls back", async () => {
		const { report } = await runResearchCoordinatorSynthesis({
			state: buildCoordinatorStateWithClaims(),
			now: NOW,
			acceptedProjectContext: [
				"ACCEPTED TASK INDEX (durable; do not repeat these objectives):",
				"- accepted-8: Indexed graded Nakayama reduction",
				"- accepted-27: Uniform b=1 theorem",
				"",
				"RECENT ACCEPTED ATTEMPT DETAILS:",
				"ACCEPTED ATTEMPT accepted-27",
			].join("\n"),
		});
		expect(report.whatWeKnow.join("\n")).toContain("Uniform b=1 theorem");
		expect(report.whatWeKnow.join("\n")).not.toContain("No completed research report");
		expect(report.recommendedNextMoves[0]?.title).toContain("Find source support");
		expect(report.recommendedNextMoves[0]?.prompt).toContain("external mathematical literature and arXiv");
	});

	it("ranks concrete autonomous moves above tautological path continuations", () => {
		const moves = rankCoordinatorMovesForAutonomousExecution({
			suggestedPathId: "path-2",
			recommendedNextMoves: [
				{
					title: "After proving the presentation, run the full computation",
					pathId: "path-2",
					rationale: "This move has an unmet prerequisite and is not immediately executable.",
					prompt: "run the full boundary computation",
					priority: "high",
				},
				{
					title: "Continue Path 2",
					pathId: "path-2",
					rationale: "The coordinator selected this as the suggested next step.",
					prompt: "continue path 2",
					priority: "high",
				},
				{
					title: "Compute the first unresolved boundary",
					pathId: "path-4",
					rationale: "Construct an exact integral presentation and compute its Smith normal form.",
					prompt: "continue path 4",
					priority: "medium",
				},
			],
		});
		expect(moves[0]?.title).toBe("Compute the first unresolved boundary");
	});

	it("ranks executable certificates above meta-planning follow-on instructions", () => {
		const moves = rankCoordinatorMovesForAutonomousExecution({
			suggestedPathId: "path-4",
			recommendedNextMoves: [
				{
					title: "Keep the opposite boundary case as a separate follow-on task",
					pathId: "path-4",
					rationale: "Keep globalization as future work; do not infer the parent theorem.",
					priority: "high",
				},
				{
					title: "Produce one missing one-sided boundary certificate",
					pathId: "path-1",
					rationale: "Display the complete matrix and exhibit a unimodular complementary minor.",
					priority: "medium",
				},
			],
		});
		expect(moves[0]?.title).toBe("Produce one missing one-sided boundary certificate");
	});

	it("keeps strategy pivots ahead of obsolete exhaustive repairs while preferring pivot corrections", () => {
		const exhaustive = {
			title: "Repair all ten explicit matrix certificates",
			pathId: "path-1",
			rationale: "Enumerate every missing row identity from the abandoned route.",
			prompt: "CRITIC-DRIVEN REPAIR: compute all ten missing certificate matrices.",
			priority: "high" as const,
		};
		const pivot = {
			title: "Pivot from certificate enumeration to a structural lemma",
			pathId: "path-1",
			rationale: "Repeated derivations failed independent review.",
			prompt: "STRATEGY PIVOT AFTER EXPENSIVE COMPUTATION\nProve one smaller reusable lemma.",
			priority: "high" as const,
		};
		const correction = {
			title: "Produce a corrected strategy-pivot certificate",
			pathId: "path-1",
			rationale: "Repair one bounded error in the new symbolic route.",
			prompt: "Correct the strategy-pivot partition table and restate its bounded conclusion.",
			priority: "medium" as const,
		};
		const withoutCorrection = rankCoordinatorMovesForAutonomousExecution({
			suggestedPathId: "path-1",
			recommendedNextMoves: [exhaustive, pivot],
		});
		expect(withoutCorrection[0]?.title).toBe(pivot.title);
		const withCorrection = rankCoordinatorMovesForAutonomousExecution({
			suggestedPathId: "path-1",
			recommendedNextMoves: [exhaustive, pivot, correction],
		});
		expect(withCorrection[0]?.title).toBe(correction.title);
	});

	it("infers autonomous task capability from the concrete directive before the broad path label", () => {
		const path = { title: "Reformulation", objective: "Find a cleaner equivalent statement." };
		expect(researchTaskKindForPath(path, "Run sandboxed Smith-normal-form computations.")).toBe("computation");
		expect(researchTaskKindForPath(path, "Run a standalone SNF task.")).toBe("computation");
		expect(researchTaskKindForPath(path, "Enumerate the first nondegenerate cases.")).toBe("computation");
		expect(researchTaskKindForPath(path, "Retrieve a full-text paper by DOI and inspect its theorem.")).toBe(
			"literature-search",
		);
		expect(researchTaskKindForPath(path, "Extract indexed passages from the registered source.")).toBe(
			"source-refresh",
		);
		expect(researchTaskKindForPath(path, "Prove the exact integral presentation and its relation lattice.")).toBe(
			"proof-attempt",
		);
	});

	it("selects the latest retryable paused task before new autonomous work", () => {
		const state = buildCoordinatorStateWithClaims();
		const pausedTask = (
			sequence: number,
			retryable: boolean,
			description = "Produce one bounded certificate.",
		): {
			attempt: ResearchTaskAttemptRecord;
			task: ResearchPlanTaskRecord;
		} => {
			const taskId = `task-${sequence}`;
			const attemptId = `attempt-${sequence}`;
			return {
				task: {
					id: taskId,
					planId: "plan-1",
					kind: "proof-attempt",
					status: "blocked",
					sequence,
					title: `Task ${sequence}`,
					description,
					goal: description,
					acceptanceCriteria: ["Produce the certificate."],
					dependsOnTaskIds: [],
					requiredCapabilities: ["independent-review"],
					attemptIds: [attemptId],
					latestAttemptId: attemptId,
					sourceIds: [],
					claimSupportIds: [],
					computationalArtifactIds: [],
					evidenceEntryIds: [],
					reviewOutcome: "unreviewed",
					createdAt: NOW,
					updatedAt: NOW,
				},
				attempt: {
					id: attemptId,
					taskId,
					planId: "plan-1",
					attemptNumber: 1,
					status: "paused",
					currentStage: "specialist",
					stages: [],
					computationArtifactIds: [],
					modelCalls: [],
					failure: {
						stage: "specialist",
						code: "specialist-failed",
						message: "Transient provider failure.",
						claimIds: [],
						retryable,
					},
					startedAt: NOW,
					updatedAt: NOW,
				},
			};
		};
		const retryable = pausedTask(10, true);
		const nonretryable = pausedTask(11, false);
		const unavailable = pausedTask(12, true, "Ingest a verifiable full-text paper and extract theorem passages.");
		const resolved = pausedTask(
			13,
			true,
			"CRITIC-DRIVEN REPAIR\nSOURCE ATTEMPT: attempt-8\nTASK KIND: proof-attempt\nCERTIFICATE:\nThe requested quotient-conjugation target was established; no repair certificate is required.\nACCEPTANCE CRITERIA:\n- Preserve the established result.\nNON-GOALS:\n- Do not broaden the task.",
		);
		const stale = pausedTask(8, true);
		const acceptedFrontier: ResearchPlanTaskRecord = {
			...retryable.task,
			id: "task-9",
			sequence: 9,
			status: "completed",
			attemptIds: ["accepted-attempt-9"],
			latestAttemptId: "accepted-attempt-9",
			acceptedAttemptId: "accepted-attempt-9",
			reviewOutcome: "accepted",
		};
		state.researchPlanTasks = [
			stale.task,
			acceptedFrontier,
			resolved.task,
			retryable.task,
			nonretryable.task,
			unavailable.task,
		];
		state.researchTaskAttempts = [
			stale.attempt,
			resolved.attempt,
			retryable.attempt,
			nonretryable.attempt,
			unavailable.attempt,
		];

		expect(retryablePausedResearchTask(state)?.id).toBe(retryable.task.id);
	});

	it("turns a concrete coordinator directive into exact durable acceptance criteria", () => {
		const criteria = acceptanceCriteriaForResearchDirective(
			"Display the opposite-boundary matrix and exhibit a unimodular complementary minor.",
		);
		expect(criteria[0]).toContain("Display the opposite-boundary matrix");
		expect(criteria[1]).toContain("do not substitute an adjacent result");
		expect(acceptanceCriteriaForResearchDirective(undefined)).toEqual([
			"Produce a bounded, independently reviewed research attempt.",
		]);
	});

	it("recovers stale validation role runs without reviving retired research execution", async () => {
		// Validation-mode recover-run closes a stale running role run; run-status reflects the transition.
		const cwd = await mkdtemp(join(tmpdir(), "comath-checkpoint-recover-"));
		try {
			const notes: string[] = [];
			const notify = (message: string) => {
				notes.push(message);
			};
			await runCoMathBackendCommand("init Validate Question 3.", { cwd, notify });
			const statePath = getDefaultStatePath(cwd);
			const seeded = await loadProjectState(statePath);
			if (!seeded) {
				throw new Error("Expected seeded co-math state.");
			}
			await saveProjectState(
				statePath,
				startRoleRun(seeded, { id: "role-run-1", role: "workstream", task: "Audit Question 3", now: NOW }),
			);

			notes.length = 0;
			await runCoMathBackendCommand("run-status role-run-1", { cwd, notify });
			expect(notes.join("\n")).toContain("Status: running");

			notes.length = 0;
			await runCoMathBackendCommand("recover-run role-run-1 failed: stale session", { cwd, notify });
			expect(notes.join("\n")).toContain("Recovered stale role run role-run-1 as failed");

			notes.length = 0;
			await runCoMathBackendCommand("run-status role-run-1", { cwd, notify });
			expect(notes.join("\n")).toContain("Status: failed");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("preserves uncertainty in report/export summaries", () => {
		// Progress retains blockers and the blocked status.
		const progress = formatProductProgress({
			status: "blocked",
			reportId: "report-1",
			blockers: ["Missing the exact statement of Question 3."],
		});
		expect(progress).toContain("Source audit: blocked");
		expect(progress).toContain("Blockers:");
		expect(progress).toContain("Missing the exact statement of Question 3.");

		// Round-trip extraction keeps blockers visible.
		const runStatusMessage = [
			"Status: blocked",
			"Execution mode: background",
			"Report: none",
			"Blockers:",
			"- Missing the exact statement of Question 3.",
		].join("\n");
		const summary = extractRunSummary([runStatusMessage]);
		expect(summary?.status).toBe("blocked");
		expect(summary?.blockers).toEqual(["Missing the exact statement of Question 3."]);

		// Unknown review status stays "needs review"; unsupported/blocked items remain in the report.
		expect(friendlyReviewStatus(undefined)).toBe("needs review");
		const reportMessage = [
			"Report report-1:",
			"Summary: Partial progress only.",
			"Blockers:",
			"- Claim is unsupported by any source.",
		].join("\n");
		const report = formatProductReport([reportMessage]);
		expect(report).toContain("blocked");
		expect(report).toContain("unsupported by any source");
	});

	it("surfaces human scrutiny highlights without promoting unsupported claims", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "comath-checkpoint-scrutiny-"));
		try {
			const statePath = getDefaultStatePath(cwd);
			let state = createEmptyProjectState({
				projectId: "proj",
				title: "Twin primes",
				rootQuestion: "Are there infinitely many twin primes?",
				now: NOW,
			});
			state = upsertWorkingPaperSectionByTitle(state, {
				title: "Examples and evidence",
				body: "Bounded finite checks only.",
				now: NOW,
				actor: "synthesizer",
			});
			const section = state.workingPaperSections[0];
			if (!section) {
				throw new Error("Expected a working-paper section.");
			}
			state = addMarginNote(state, {
				id: "margin-note-1",
				kind: "scrutiny",
				subjectId: "path-1",
				sectionId: section.id,
				message: "A human should verify the boundary step.",
				now: NOW,
				actor: "reviewer",
			});
			state = addMarginNote(state, {
				id: "margin-note-2",
				kind: "gap",
				subjectId: "path-1",
				sectionId: section.id,
				message: "This gap was resolved later.",
				now: NOW,
				actor: "reviewer",
			});
			state = resolveMarginNote(state, {
				noteId: "margin-note-2",
				resolution: "Resolved by a later proof note.",
				now: NOW,
				actor: "human",
			});
			// An uncertain claim must never be synthesis-eligible just because a highlight exists.
			state = addClaim(state, {
				id: "claim-1",
				workstreamId: "workstream-1",
				statement: "Twin primes are infinite.",
				status: "needs_review",
				now: NOW,
			});
			await saveProjectState(statePath, state);

			const saved = await loadProjectState(statePath);
			if (!saved) {
				throw new Error("Expected saved co-math state.");
			}
			expect(isClaimSynthesisEligible(saved, "claim-1")).toBe(false);

			const notes: string[] = [];
			const paper = await runCoMathBackendCommand("paper", {
				cwd,
				notify: (message) => {
					notes.push(message);
				},
			});
			expect(paper.ok).toBe(true);
			const out = notes.join("\n");
			expect(out).toContain("## Human scrutiny highlights");
			expect(out).toContain("A human should verify the boundary step.");
			// Resolved notes do not count as open highlights.
			const highlightsBlock = (out.split("## Human scrutiny highlights")[1] ?? "").split(
				"## Working paper sections",
			)[0];
			expect(highlightsBlock).not.toContain("This gap was resolved later.");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});
