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
import { runResearchCoordinatorSynthesis } from "../src/modes/comath/comath-coordinator-synthesis.ts";
import { CoMathHarness } from "../src/modes/comath/comath-harness.ts";
import { formatProductProgress, formatResearchWorkstreamRunFailed } from "../src/modes/comath/comath-progress.ts";
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
	ResearchPath,
	ResearchWorkstreamRunRecord,
} from "../src/modes/comath/schema.ts";
import {
	addClaim,
	addMarginNote,
	createEmptyProjectState,
	getDefaultStatePath,
	isClaimSynthesisEligible,
	loadProjectState,
	resolveMarginNote,
	STALE_RESEARCH_WORKSTREAM_RUN_REASON,
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

function createCheckpointResearchPath(): ResearchPath {
	return {
		id: "path-1",
		title: "Direct proof attempt",
		objective: "Try to prove the statement directly.",
		status: "active",
		latestFindings: [],
		blockers: [],
		suggestedNextMove: "Look for a congruence obstruction.",
		priority: 1,
		createdAt: NOW,
		updatedAt: NOW,
	};
}

function createRunningRun(path: ResearchPath): ResearchWorkstreamRunRecord {
	return {
		id: "research-run-1",
		pathId: path.id,
		pathTitle: path.title,
		status: "running",
		currentStage: "specialist",
		startedAt: NOW,
		updatedAt: NOW,
		incrementalReports: [],
	};
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

	it("tracks stale running state and proposes recovery output", async () => {
		// Research-mode stale recovery output is explicit and executable.
		const path = createCheckpointResearchPath();
		const staleRun: ResearchWorkstreamRunRecord = {
			...createRunningRun(path),
			status: "interrupted",
			failureReason: STALE_RESEARCH_WORKSTREAM_RUN_REASON,
		};
		const failed = formatResearchWorkstreamRunFailed({ state: { researchPaths: [path] }, run: staleRun });
		expect(failed).toContain("interrupted");
		expect(failed).toContain("Recovery");
		expect(failed).toContain("continue path 1");

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
