import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { ClaimStatus, CoMathProjectState } from "../examples/extensions/co-math/schema.ts";
import {
	addArtifact,
	addClaim,
	addComputationalArtifact,
	addEvidence,
	addGoal,
	addLiteratureClaimSupport,
	addLiteratureSourceArtifact,
	addMarginNote,
	addReportReviewRound,
	addResearchCoordinatorReport,
	addResearchPath,
	addResearchWorkstreamIncrementalReport,
	addResearchWorkstreamReport,
	addResearchWorkstreamRun,
	addReviewDecisionEvent,
	addReviewRound,
	addWarning,
	addWorkingPaperSection,
	addWorkstream,
	cancelQueuedRoleRun,
	createEmptyProjectState,
	dispatchQueuedRoleRun,
	failRoleRun,
	failStaleResearchWorkstreamRuns,
	finishRoleRun,
	getActiveResearchPaths,
	getActiveResearchWorkstreamRun,
	getComputationalArtifactsForReport,
	getComputationalArtifactsForRun,
	getDefaultStatePath,
	getLatestResearchCoordinatorReport,
	getLatestResearchWorkstreamReport,
	getLatestResearchWorkstreamReportForPath,
	getLatestResearchWorkstreamRun,
	getLiteratureClaimSupportsForReportOrPath,
	getLiteratureSourcesForReport,
	isClaimSynthesisEligible,
	loadProjectState,
	queueRoleRun,
	recordHumanInterventionEvent,
	recordWorkingPaperExport,
	resolveMarginNote,
	resolveWarning,
	reviseClaim,
	STALE_RESEARCH_WORKSTREAM_RUN_REASON,
	saveProjectState,
	serializeProjectState,
	setClaimStatus,
	setGoalStatus,
	setResearchFocus,
	startRoleRun,
	updateComputationalArtifact,
	updateResearchPath,
	updateResearchWorkstreamRun,
	upsertWorkingPaperSectionByTitle,
} from "../examples/extensions/co-math/storage.ts";

const FIXED_NOW = "2026-06-05T12:00:00.000Z";

function createProject(): CoMathProjectState {
	return createEmptyProjectState({
		projectId: "proj-test",
		title: "Toy co-math project",
		rootQuestion: "Can a co-math assistant preserve proof gaps?",
		now: FIXED_NOW,
	});
}

describe("co-math project state", () => {
	it("creates an empty project state with required metadata and empty collections", () => {
		const state = createProject();

		expect(state).toEqual({
			version: 1,
			projectId: "proj-test",
			title: "Toy co-math project",
			rootQuestion: "Can a co-math assistant preserve proof gaps?",
			approvedGoals: [],
			workstreams: [],
			claims: [],
			evidence: [],
			warnings: [],
			reports: [],
			reviewQueue: [],
			artifacts: [],
			events: [
				{
					id: "event-1",
					kind: "project_initialized",
					actor: "human",
					summary: "Initialized co-math project: Can a co-math assistant preserve proof gaps?",
					subjectId: "proj-test",
					relatedIds: [],
					createdAt: FIXED_NOW,
				},
			],
			roleRuns: [],
			reviewRounds: [],
			reportReviewRounds: [],
			claimRevisions: [],
			workingPaperSections: [],
			marginNotes: [],
			researchPaths: [],
			researchReports: [],
			researchWorkstreamRuns: [],
			literatureSources: [],
			literatureClaimSupports: [],
			computationalArtifacts: [],
			researchCoordinatorReports: [],
			updatedAt: FIXED_NOW,
		});
	});

	it("adds, updates, focuses, and lists research paths", () => {
		let state = addResearchPath(createProject(), {
			title: "Small examples and counterexamples",
			objective: "List initial examples.",
			suggestedNextMove: "Compute more small examples.",
			priority: 1,
			now: FIXED_NOW,
			actor: "human",
		});
		state = addResearchPath(state, {
			title: "Direct proof attempt",
			objective: "Try a direct proof.",
			suggestedNextMove: "Look for a congruence obstruction.",
			priority: 2,
			now: FIXED_NOW,
			actor: "human",
		});
		state = updateResearchPath(state, {
			pathId: "path-2",
			status: "abandoned",
			latestFindings: ["Direct proof is not the best first move."],
			now: "2026-06-05T12:10:00.000Z",
			actor: "human",
		});
		state = setResearchFocus(state, {
			pathIds: ["path-1"],
			reason: "Prioritize counterexamples.",
			now: "2026-06-05T12:11:00.000Z",
			actor: "human",
		});

		expect(state.researchPaths).toMatchObject([
			{
				id: "path-1",
				title: "Small examples and counterexamples",
				status: "active",
				priority: 1,
			},
			{
				id: "path-2",
				title: "Direct proof attempt",
				status: "abandoned",
				latestFindings: ["Direct proof is not the best first move."],
			},
		]);
		expect(state.researchFocus).toEqual({
			pathIds: ["path-1"],
			reason: "Prioritize counterexamples.",
			updatedAt: "2026-06-05T12:11:00.000Z",
		});
		expect(getActiveResearchPaths(state).map((path) => path.id)).toEqual(["path-1"]);
	});

	it("records, finds, and round-trips research workstream reports", async () => {
		let state = addResearchPath(createProject(), {
			title: "Direct proof attempt",
			objective: "Try a direct proof.",
			suggestedNextMove: "Look for a congruence obstruction.",
			priority: 1,
			now: FIXED_NOW,
			actor: "human",
		});
		state = addResearchWorkstreamReport(state, {
			pathId: "path-1",
			pathTitle: "Direct proof attempt",
			status: "completed",
			startedAt: FIXED_NOW,
			completedAt: "2026-06-05T12:05:00.000Z",
			coordinatorBrief: "Frame the direct proof objective.",
			steps: [
				{ role: "coordinator", title: "Coordinator brief", summary: "Framed the objective.", details: ["Brief."] },
				{ role: "specialist", title: "Specialist attempt", summary: "Attempted.", details: ["Finding."] },
				{ role: "critic", title: "Critic review", summary: "Reviewed.", details: ["Gap: open."] },
				{ role: "synthesizer", title: "Synthesis", summary: "Synthesized.", details: ["Next: continue."] },
			],
			promisingStrategy: ["Reduce to the even case."],
			findings: ["A Euclid-style argument is not immediate."],
			criticisms: ["Not a proof of infinitude."],
			gaps: ["No complete mechanism established."],
			humanHelpUseful: [],
			suggestedNextMove: "Try a weaker theorem.",
			workingPaperSectionTitle: "Direct proof attempts",
			workingPaperSectionId: "paper-section-1",
			now: "2026-06-05T12:05:00.000Z",
			actor: "synthesizer",
		});

		expect(state.researchReports).toHaveLength(1);
		expect(state.researchReports[0]).toMatchObject({
			id: "research-report-1",
			kind: "research_workstream",
			pathId: "path-1",
			status: "completed",
			workingPaperSectionId: "paper-section-1",
		});
		expect(state.events.at(-1)).toMatchObject({
			kind: "research_workstream_recorded",
			actor: "synthesizer",
			subjectId: "research-report-1",
			relatedIds: ["path-1"],
		});
		expect(getLatestResearchWorkstreamReport(state)?.id).toBe("research-report-1");
		expect(getLatestResearchWorkstreamReportForPath(state, "path-1")?.id).toBe("research-report-1");
		expect(getLatestResearchWorkstreamReportForPath(state, "path-2")).toBeUndefined();

		const tempDir = await mkdtemp(path.join(tmpdir(), "pi-comath-research-report-"));
		try {
			const statePath = getDefaultStatePath(tempDir);
			await saveProjectState(statePath, state);
			const loaded = await loadProjectState(statePath);
			expect(loaded?.researchReports).toEqual(state.researchReports);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("rejects research workstream reports with empty required fields and duplicate ids", () => {
		const base = addResearchPath(createProject(), {
			title: "Direct proof attempt",
			objective: "Try a direct proof.",
			suggestedNextMove: "Look for a congruence obstruction.",
			priority: 1,
			now: FIXED_NOW,
			actor: "human",
		});
		const validInput = {
			id: "research-report-1",
			pathId: "path-1",
			pathTitle: "Direct proof attempt",
			status: "completed" as const,
			startedAt: FIXED_NOW,
			completedAt: FIXED_NOW,
			coordinatorBrief: "Brief.",
			steps: [],
			promisingStrategy: [],
			findings: [],
			criticisms: [],
			gaps: [],
			humanHelpUseful: [],
			suggestedNextMove: "Continue.",
			workingPaperSectionTitle: "Direct proof attempts",
			now: FIXED_NOW,
			actor: "synthesizer" as const,
		};
		expect(() => addResearchWorkstreamReport(base, { ...validInput, pathId: "  " })).toThrow(/path id/i);
		expect(() => addResearchWorkstreamReport(base, { ...validInput, pathTitle: "  " })).toThrow(/path title/i);
		const withReport = addResearchWorkstreamReport(base, validInput);
		expect(() => addResearchWorkstreamReport(withReport, validInput)).toThrow(/duplicate/i);
	});

	it("records literature sources, claim supports, and report source links", () => {
		let state = addResearchPath(createProject(), {
			title: "Known theorem or literature reduction",
			objective: "Check known theorem targets.",
			suggestedNextMove: "Find source-backed references.",
			priority: 1,
			now: FIXED_NOW,
			actor: "human",
		});
		state = addLiteratureSourceArtifact(state, {
			kind: "paper",
			title: "Bounded gaps between primes",
			url: "https://example.test/bounded-gaps",
			authors: ["A. Mathematician"],
			year: "2014",
			summary: "A source about bounded prime gaps.",
			now: FIXED_NOW,
			actor: "system",
		});
		const withDuplicate = addLiteratureSourceArtifact(state, {
			kind: "paper",
			title: "Duplicate title should not be added",
			url: "https://example.test/bounded-gaps",
			summary: "Same URL.",
			now: FIXED_NOW,
			actor: "system",
		});
		expect(withDuplicate.literatureSources).toEqual(state.literatureSources);
		state = addLiteratureClaimSupport(state, {
			pathId: "path-1",
			claim: "Bounded prime gaps do not imply twin-prime infinitude.",
			sourceIds: ["source-1"],
			status: "supported",
			note: "The source is related but weaker than the exact target.",
			now: FIXED_NOW,
			actor: "reviewer",
		});
		state = addResearchWorkstreamReport(state, {
			pathId: "path-1",
			pathTitle: "Known theorem or literature reduction",
			status: "completed",
			startedAt: FIXED_NOW,
			completedAt: FIXED_NOW,
			coordinatorBrief: "Check exact source support.",
			steps: [],
			promisingStrategy: ["Use bounded-gap sources carefully."],
			findings: ["Bounded gaps are weaker than twin-prime infinitude. [source-1]"],
			criticisms: [],
			gaps: [],
			humanHelpUseful: [],
			suggestedNextMove: "Compare exact theorem statements.",
			workingPaperSectionTitle: "Literature/theorem targets",
			sourceIds: ["source-1"],
			claimSupportIds: ["claim-support-1"],
			now: FIXED_NOW,
			actor: "synthesizer",
		});

		expect(state.literatureSources).toMatchObject([
			{
				id: "source-1",
				title: "Bounded gaps between primes",
				url: "https://example.test/bounded-gaps",
				authors: ["A. Mathematician"],
			},
		]);
		expect(state.literatureClaimSupports).toMatchObject([
			{
				id: "claim-support-1",
				pathId: "path-1",
				sourceIds: ["source-1"],
				status: "supported",
			},
		]);
		expect(state.researchReports[0]).toMatchObject({
			sourceIds: ["source-1"],
			claimSupportIds: ["claim-support-1"],
		});
		expect(getLiteratureSourcesForReport(state, "research-report-1").map((source) => source.id)).toEqual([
			"source-1",
		]);
		expect(
			getLiteratureClaimSupportsForReportOrPath(state, { pathId: "path-1" }).map((support) => support.id),
		).toEqual(["claim-support-1"]);
	});

	it("records computational artifacts, links reports, and rejects unsafe file paths", () => {
		let state = addResearchPath(createProject(), {
			title: "Small examples and counterexamples",
			objective: "Run a finite check.",
			suggestedNextMove: "Use the computation to guide the next proof attempt.",
			priority: 1,
			now: FIXED_NOW,
			actor: "human",
		});
		state = addResearchWorkstreamRun(state, {
			pathId: "path-1",
			pathTitle: "Small examples and counterexamples",
			currentStage: "computation",
			now: FIXED_NOW,
			actor: "system",
		});
		state = addComputationalArtifact(state, {
			pathId: "path-1",
			runId: "research-run-1",
			kind: "script",
			status: "completed",
			title: "Computation script",
			filePath: ".pi/co-math/artifacts/research-run-1/search.py",
			command: "python3 search.py",
			exitCode: 0,
			summary: "Finite search script.",
			now: FIXED_NOW,
			actor: "system",
		});
		state = addComputationalArtifact(state, {
			pathId: "path-1",
			runId: "research-run-1",
			kind: "stdout",
			status: "completed",
			title: "Computation output",
			filePath: ".pi/co-math/artifacts/research-run-1/stdout.txt",
			command: "python3 search.py",
			exitCode: 0,
			summary: "checked_range: 1 <= n <= 100\nprime_values_found: 19",
			now: FIXED_NOW,
			actor: "system",
		});
		state = addResearchWorkstreamReport(state, {
			pathId: "path-1",
			pathTitle: "Small examples and counterexamples",
			status: "completed",
			startedAt: FIXED_NOW,
			completedAt: FIXED_NOW,
			coordinatorBrief: "Choose a bounded finite check.",
			steps: [],
			promisingStrategy: ["Use finite output as evidence only."],
			findings: ["The check found prime values in the bounded range."],
			criticisms: ["A finite computation does not prove an infinite claim."],
			gaps: ["A theorem-level proof is still open."],
			humanHelpUseful: [],
			suggestedNextMove: "Use the parity observation in a proof path.",
			workingPaperSectionTitle: "Examples and finite checks",
			computationalArtifactIds: ["computation-artifact-1", "computation-artifact-2"],
			now: FIXED_NOW,
			actor: "synthesizer",
		});
		state = updateComputationalArtifact(state, {
			artifactId: "computation-artifact-1",
			reportId: "research-report-1",
			now: FIXED_NOW,
			actor: "system",
		});
		state = updateComputationalArtifact(state, {
			artifactId: "computation-artifact-2",
			reportId: "research-report-1",
			now: FIXED_NOW,
			actor: "system",
		});

		expect(state.computationalArtifacts).toMatchObject([
			{
				id: "computation-artifact-1",
				pathId: "path-1",
				reportId: "research-report-1",
				runId: "research-run-1",
				kind: "script",
				status: "completed",
				filePath: ".pi/co-math/artifacts/research-run-1/search.py",
				exitCode: 0,
			},
			{
				id: "computation-artifact-2",
				kind: "stdout",
				summary: "checked_range: 1 <= n <= 100\nprime_values_found: 19",
			},
		]);
		expect(state.events.map((event) => event.kind)).toContain("computational_artifact_recorded");
		expect(state.researchReports[0]?.computationalArtifactIds).toEqual([
			"computation-artifact-1",
			"computation-artifact-2",
		]);
		expect(getComputationalArtifactsForReport(state, "research-report-1").map((artifact) => artifact.id)).toEqual([
			"computation-artifact-1",
			"computation-artifact-2",
		]);
		expect(getComputationalArtifactsForRun(state, "research-run-1").map((artifact) => artifact.id)).toEqual([
			"computation-artifact-1",
			"computation-artifact-2",
		]);
		expect(() =>
			addComputationalArtifact(state, {
				pathId: "path-1",
				kind: "stdout",
				title: "Bad output",
				filePath: "../outside.txt",
				summary: "Bad path.",
				now: FIXED_NOW,
			}),
		).toThrow(/under \.pi\/co-math\/artifacts/i);
	});

	it("records structured project coordinator reports with input links and next moves", () => {
		let state = addResearchPath(createProject(), {
			title: "Small examples and counterexamples",
			objective: "Run a finite check.",
			suggestedNextMove: "Use examples to guide proof attempts.",
			priority: 1,
			now: FIXED_NOW,
			actor: "human",
		});
		state = addResearchPath(state, {
			title: "Direct proof attempt",
			objective: "Try a direct proof.",
			suggestedNextMove: "Use parity observations.",
			priority: 2,
			now: FIXED_NOW,
			actor: "human",
		});
		state = addResearchCoordinatorReport(state, {
			inputReportIds: [" research-report-1 ", "research-report-1"],
			inputPathIds: ["path-1", "path-2"],
			inputSourceIds: ["source-1"],
			inputComputationalArtifactIds: ["computation-artifact-1"],
			whatWeKnow: ["Finite checks found examples."],
			roadblocks: ["Finite checks do not prove infinitude."],
			recommendedNextMoves: [
				{
					title: "Continue Path 2",
					pathId: "path-2",
					rationale: "Use parity observations from the finite check.",
					prompt: "continue path 2",
					priority: "high",
				},
			],
			humanHelpUseful: ["Provide a theorem reference for quadratic prime values."],
			suggestedPathId: "path-2",
			suggestedPrompt: "continue path 2",
			now: "2026-06-05T12:20:00.000Z",
			actor: "coordinator",
		});
		state = addResearchCoordinatorReport(state, {
			whatWeKnow: ["Second summary."],
			roadblocks: [],
			recommendedNextMoves: [],
			now: "2026-06-05T12:25:00.000Z",
			actor: "coordinator",
		});

		expect(state.researchCoordinatorReports[0]).toMatchObject({
			id: "coordinator-report-1",
			inputReportIds: ["research-report-1"],
			inputPathIds: ["path-1", "path-2"],
			inputSourceIds: ["source-1"],
			inputComputationalArtifactIds: ["computation-artifact-1"],
			whatWeKnow: ["Finite checks found examples."],
			roadblocks: ["Finite checks do not prove infinitude."],
			humanHelpUseful: ["Provide a theorem reference for quadratic prime values."],
			suggestedPathId: "path-2",
			suggestedPrompt: "continue path 2",
		});
		expect(state.researchCoordinatorReports[0]?.recommendedNextMoves).toEqual([
			{
				title: "Continue Path 2",
				pathId: "path-2",
				rationale: "Use parity observations from the finite check.",
				prompt: "continue path 2",
				priority: "high",
			},
		]);
		expect(state.researchCoordinatorReports[1]).toMatchObject({
			id: "coordinator-report-2",
			roadblocks: ["No current roadblock was identified."],
			recommendedNextMoves: [
				{
					title: "Choose a research path to continue",
					rationale: "No specific next move was identified from the current project state.",
					priority: "medium",
				},
			],
		});
		expect(getLatestResearchCoordinatorReport(state)?.id).toBe("coordinator-report-2");
		expect(state.events.at(-2)).toMatchObject({
			kind: "research_coordinator_report_recorded",
			actor: "coordinator",
			subjectId: "coordinator-report-1",
			relatedIds: ["research-report-1", "path-1", "path-2", "source-1", "computation-artifact-1"],
		});
	});

	it("records and updates research workstream runs with incremental reports", () => {
		let state = addResearchPath(createProject(), {
			title: "Direct proof attempt",
			objective: "Try a direct proof.",
			suggestedNextMove: "Look for a congruence obstruction.",
			priority: 1,
			now: FIXED_NOW,
			actor: "human",
		});
		state = addResearchWorkstreamRun(state, {
			pathId: "path-1",
			pathTitle: "Direct proof attempt",
			now: FIXED_NOW,
			actor: "system",
		});
		state = addResearchWorkstreamIncrementalReport(state, {
			runId: "research-run-1",
			stage: "coordinator",
			status: "completed",
			title: "Coordinator brief",
			summary: "Framed the path.",
			details: ["Brief."],
			now: FIXED_NOW,
			actor: "coordinator",
		});
		state = addResearchWorkstreamIncrementalReport(state, {
			runId: "research-run-1",
			stage: "specialist",
			status: "running",
			title: "Specialist attempt",
			summary: "Specialist is running.",
			details: [],
			now: "2026-06-05T12:01:00.000Z",
			actor: "workstream",
		});

		expect(state.researchWorkstreamRuns).toHaveLength(1);
		expect(state.researchWorkstreamRuns[0]).toMatchObject({
			id: "research-run-1",
			pathId: "path-1",
			status: "running",
			currentStage: "specialist",
		});
		expect(state.researchWorkstreamRuns[0]?.incrementalReports.map((report) => report.stage)).toEqual([
			"coordinator",
			"specialist",
		]);
		expect(getLatestResearchWorkstreamRun(state)?.id).toBe("research-run-1");
		expect(getActiveResearchWorkstreamRun(state)?.id).toBe("research-run-1");

		state = updateResearchWorkstreamRun(state, {
			runId: "research-run-1",
			status: "completed",
			currentStage: "synthesizer",
			completedAt: "2026-06-05T12:05:00.000Z",
			finalReportId: "research-report-1",
			now: "2026-06-05T12:05:00.000Z",
			actor: "synthesizer",
		});

		expect(state.researchWorkstreamRuns[0]).toMatchObject({
			status: "completed",
			currentStage: "synthesizer",
			completedAt: "2026-06-05T12:05:00.000Z",
			finalReportId: "research-report-1",
		});
		expect(getActiveResearchWorkstreamRun(state)).toBeUndefined();
	});

	it("marks stale queued and running research workstream runs failed without touching live or completed runs", () => {
		let state = addResearchPath(createProject(), {
			title: "Direct proof attempt",
			objective: "Try a direct proof.",
			suggestedNextMove: "Look for a congruence obstruction.",
			priority: 1,
			now: FIXED_NOW,
			actor: "human",
		});
		state = addResearchWorkstreamRun(state, {
			pathId: "path-1",
			pathTitle: "Direct proof attempt",
			status: "running",
			now: FIXED_NOW,
			actor: "system",
		});
		state = addResearchWorkstreamRun(state, {
			pathId: "path-1",
			pathTitle: "Direct proof attempt",
			status: "queued",
			now: FIXED_NOW,
			actor: "system",
		});
		state = addResearchWorkstreamRun(state, {
			pathId: "path-1",
			pathTitle: "Direct proof attempt",
			status: "running",
			now: FIXED_NOW,
			actor: "system",
		});
		state = updateResearchWorkstreamRun(state, {
			runId: "research-run-3",
			status: "completed",
			currentStage: "synthesizer",
			completedAt: "2026-06-05T12:05:00.000Z",
			finalReportId: "research-report-1",
			now: "2026-06-05T12:05:00.000Z",
			actor: "synthesizer",
		});
		state = addResearchWorkstreamRun(state, {
			pathId: "path-1",
			pathTitle: "Direct proof attempt",
			status: "running",
			now: FIXED_NOW,
			actor: "system",
		});

		const nextState = failStaleResearchWorkstreamRuns(state, {
			activeRunIds: ["research-run-1"],
			now: "2026-06-05T12:10:00.000Z",
			actor: "system",
		});

		expect(nextState.researchWorkstreamRuns.map((run) => run.status)).toEqual([
			"running",
			"failed",
			"completed",
			"failed",
		]);
		expect(nextState.researchWorkstreamRuns[0]?.failureReason).toBeUndefined();
		expect(nextState.researchWorkstreamRuns[1]).toMatchObject({
			status: "failed",
			failureReason: STALE_RESEARCH_WORKSTREAM_RUN_REASON,
			updatedAt: "2026-06-05T12:10:00.000Z",
		});
		expect(nextState.researchWorkstreamRuns[2]).toMatchObject({
			status: "completed",
			finalReportId: "research-report-1",
		});
		expect(nextState.researchWorkstreamRuns[3]).toMatchObject({
			status: "failed",
			failureReason: STALE_RESEARCH_WORKSTREAM_RUN_REASON,
		});
		expect(state.researchWorkstreamRuns[1]?.status).toBe("queued");
		expect(state.researchWorkstreamRuns[3]?.status).toBe("running");
		expect(getActiveResearchWorkstreamRun(nextState)?.id).toBe("research-run-1");
	});

	it("adds a goal with deterministic id and timestamp injection", () => {
		const initial = createProject();
		const state = addGoal(initial, {
			id: "goal-1",
			text: "Separate proved claims from experimental evidence.",
			now: FIXED_NOW,
		});

		expect(initial.approvedGoals).toEqual([]);
		expect(state.approvedGoals).toEqual([
			{
				id: "goal-1",
				text: "Separate proved claims from experimental evidence.",
				status: "active",
				createdAt: FIXED_NOW,
				updatedAt: FIXED_NOW,
			},
		]);
		expect(state.updatedAt).toBe(FIXED_NOW);
	});

	it("stores proposed goals and approves them with provenance", () => {
		let state = addGoal(createProject(), {
			id: "goal-1",
			text: "Enumerate exact small examples.",
			status: "proposed",
			now: FIXED_NOW,
			actor: "human",
		});
		state = setGoalStatus(state, {
			goalId: "goal-1",
			status: "approved",
			now: "2026-06-05T12:05:00.000Z",
			actor: "human",
		});

		expect(state.approvedGoals[0]).toMatchObject({
			id: "goal-1",
			status: "approved",
			updatedAt: "2026-06-05T12:05:00.000Z",
		});
		expect(state.events.at(-1)).toMatchObject({
			kind: "goal_status_changed",
			actor: "human",
			subjectId: "goal-1",
			summary: "Set goal-1 status to approved",
		});
	});

	it("adds a workstream with active lifecycle defaults", () => {
		const state = addWorkstream(createProject(), {
			id: "workstream-endpoints",
			title: "Analyze endpoint induction",
			goalIds: ["goal-1"],
			now: FIXED_NOW,
			actor: "human",
		});

		expect(state.workstreams).toMatchObject([
			{
				id: "workstream-endpoints",
				title: "Analyze endpoint induction",
				status: "active",
				goalIds: ["goal-1"],
				claimIds: [],
				latestReportIds: [],
				latestRunIds: [],
			},
		]);
		expect(state.workstreams[0]?.statusReason).toBeUndefined();
	});

	it("starts role runs and marks target workstreams running", () => {
		let state = addWorkstream(createProject(), {
			id: "workstream-endpoints",
			title: "Analyze endpoint induction",
			goalIds: ["goal-1"],
			now: FIXED_NOW,
		});
		state = startRoleRun(state, {
			id: "role-run-1",
			role: "workstream",
			task: "Role: workstream",
			targetWorkstreamId: "workstream-endpoints",
			transcriptPath: ".pi/co-math/transcripts/role-run-1.jsonl",
			now: FIXED_NOW,
			actor: "workstream",
		});

		expect(state.roleRuns).toMatchObject([
			{
				id: "role-run-1",
				role: "workstream",
				status: "running",
				targetWorkstreamId: "workstream-endpoints",
				task: "Role: workstream",
				transcriptPath: ".pi/co-math/transcripts/role-run-1.jsonl",
				createdClaimIds: [],
				createdEvidenceIds: [],
				createdWarningIds: [],
				createdArtifactIds: [],
				blockerMessages: [],
				startedAt: FIXED_NOW,
				updatedAt: FIXED_NOW,
			},
		]);
		expect(state.workstreams[0]).toMatchObject({
			id: "workstream-endpoints",
			status: "running",
			latestRunIds: ["role-run-1"],
		});
		expect(state.events.map((event) => event.kind)).toContain("role_run_started");
		expect(state.events.map((event) => event.kind)).toContain("workstream_status_changed");
	});

	it("queues role runs without marking target workstreams running", () => {
		let state = addWorkstream(createProject(), {
			id: "workstream-endpoints",
			title: "Analyze endpoint induction",
			goalIds: [],
			now: FIXED_NOW,
		});
		state = queueRoleRun(state, {
			id: "role-run-1",
			role: "workstream",
			task: "Role: workstream",
			targetWorkstreamId: "workstream-endpoints",
			now: FIXED_NOW,
			actor: "human",
		});

		expect(state.roleRuns).toMatchObject([
			{
				id: "role-run-1",
				role: "workstream",
				status: "queued",
				targetWorkstreamId: "workstream-endpoints",
				task: "Role: workstream",
				queuedAt: FIXED_NOW,
				updatedAt: FIXED_NOW,
				createdClaimIds: [],
				createdEvidenceIds: [],
				createdWarningIds: [],
				createdArtifactIds: [],
				blockerMessages: [],
			},
		]);
		expect(state.roleRuns[0]?.startedAt).toBeUndefined();
		expect(state.workstreams[0]).toMatchObject({
			id: "workstream-endpoints",
			status: "active",
			latestRunIds: ["role-run-1"],
		});
		expect(state.events.at(-1)).toMatchObject({
			kind: "role_run_queued",
			actor: "human",
			subjectId: "role-run-1",
			relatedIds: ["workstream-endpoints"],
		});
	});

	it("dispatches only queued role runs", () => {
		let state = queueRoleRun(createProject(), {
			id: "role-run-1",
			role: "coordinator",
			task: "Role: coordinator",
			now: FIXED_NOW,
			actor: "human",
		});
		state = dispatchQueuedRoleRun(state, {
			runId: "role-run-1",
			now: "2026-06-05T12:05:00.000Z",
			actor: "coordinator",
			transcriptPath: ".pi/co-math/transcripts/role-run-1.jsonl",
		});

		expect(state.roleRuns[0]).toMatchObject({
			id: "role-run-1",
			status: "running",
			queuedAt: FIXED_NOW,
			startedAt: "2026-06-05T12:05:00.000Z",
			transcriptPath: ".pi/co-math/transcripts/role-run-1.jsonl",
			updatedAt: "2026-06-05T12:05:00.000Z",
		});
		expect(state.events.at(-1)).toMatchObject({
			kind: "role_run_started",
			actor: "coordinator",
			subjectId: "role-run-1",
		});
		expect(() =>
			dispatchQueuedRoleRun(state, {
				runId: "role-run-1",
				now: "2026-06-05T12:06:00.000Z",
				actor: "coordinator",
			}),
		).toThrow(/because it is running/);
		expect(() =>
			dispatchQueuedRoleRun(state, {
				runId: "role-run-missing",
				now: "2026-06-05T12:06:00.000Z",
				actor: "coordinator",
			}),
		).toThrow(/Unknown role run/);
	});

	it("dispatches queued role runs with background execution mode", () => {
		let state = queueRoleRun(createProject(), {
			id: "role-run-1",
			role: "coordinator",
			task: "Role: coordinator",
			now: FIXED_NOW,
			actor: "human",
		});
		state = dispatchQueuedRoleRun(state, {
			runId: "role-run-1",
			now: "2026-06-05T12:05:00.000Z",
			actor: "coordinator",
			executionMode: "background",
		});

		expect(state.roleRuns[0]).toMatchObject({
			id: "role-run-1",
			status: "running",
			executionMode: "background",
			startedAt: "2026-06-05T12:05:00.000Z",
		});
	});

	it("cancels only queued role runs and preserves the reason", () => {
		let state = queueRoleRun(createProject(), {
			id: "role-run-1",
			role: "coordinator",
			task: "Role: coordinator",
			now: FIXED_NOW,
			actor: "human",
		});
		state = cancelQueuedRoleRun(state, {
			runId: "role-run-1",
			reason: "Human chose a different decomposition.",
			now: "2026-06-05T12:07:00.000Z",
			actor: "human",
		});

		expect(state.roleRuns[0]).toMatchObject({
			id: "role-run-1",
			status: "cancelled",
			queuedAt: FIXED_NOW,
			cancelledAt: "2026-06-05T12:07:00.000Z",
			completedAt: "2026-06-05T12:07:00.000Z",
			cancelReason: "Human chose a different decomposition.",
			updatedAt: "2026-06-05T12:07:00.000Z",
		});
		expect(state.roleRuns[0]?.startedAt).toBeUndefined();
		expect(state.events.at(-1)).toMatchObject({
			kind: "role_run_cancelled",
			actor: "human",
			subjectId: "role-run-1",
		});
		expect(() =>
			cancelQueuedRoleRun(state, {
				runId: "role-run-1",
				reason: "Already cancelled.",
				now: "2026-06-05T12:08:00.000Z",
				actor: "human",
			}),
		).toThrow(/because it is cancelled/);
		expect(() =>
			cancelQueuedRoleRun(
				queueRoleRun(createProject(), {
					id: "role-run-2",
					role: "coordinator",
					task: "Role: coordinator",
					now: FIXED_NOW,
					actor: "human",
				}),
				{
					runId: "role-run-2",
					reason: "",
					now: "2026-06-05T12:08:00.000Z",
					actor: "human",
				},
			),
		).toThrow(/reason/i);
	});

	it("finishes completed role runs and marks claim-producing workstreams needs_review", () => {
		let state = addWorkstream(createProject(), {
			id: "workstream-endpoints",
			title: "Analyze endpoint induction",
			goalIds: [],
			now: FIXED_NOW,
		});
		state = startRoleRun(state, {
			id: "role-run-1",
			role: "workstream",
			task: "Role: workstream",
			targetWorkstreamId: "workstream-endpoints",
			now: FIXED_NOW,
		});
		state = finishRoleRun(state, {
			runId: "role-run-1",
			status: "completed",
			reportId: "report-1",
			createdClaimIds: ["claim-1"],
			createdEvidenceIds: ["evidence-1"],
			createdWarningIds: ["warning-1"],
			createdArtifactIds: ["artifact-1"],
			now: FIXED_NOW,
			actor: "workstream",
		});

		expect(state.roleRuns[0]).toMatchObject({
			id: "role-run-1",
			status: "completed",
			reportId: "report-1",
			createdClaimIds: ["claim-1"],
			createdEvidenceIds: ["evidence-1"],
			createdWarningIds: ["warning-1"],
			createdArtifactIds: ["artifact-1"],
			completedAt: FIXED_NOW,
		});
		expect(state.workstreams[0]).toMatchObject({
			status: "needs_review",
		});
		expect(state.events.map((event) => event.kind)).toContain("role_run_completed");
	});

	it("finishes blocked role runs with blockers and marks workstreams blocked", () => {
		let state = addWorkstream(createProject(), {
			id: "workstream-endpoints",
			title: "Analyze endpoint induction",
			goalIds: [],
			now: FIXED_NOW,
		});
		state = startRoleRun(state, {
			id: "role-run-1",
			role: "workstream",
			task: "Role: workstream",
			targetWorkstreamId: "workstream-endpoints",
			now: FIXED_NOW,
		});
		state = finishRoleRun(state, {
			runId: "role-run-1",
			status: "blocked",
			reportId: "report-1",
			blockerMessages: ["Need more small-n data before conjecture is stable."],
			now: FIXED_NOW,
			actor: "workstream",
		});

		expect(state.roleRuns[0]).toMatchObject({
			status: "blocked",
			reportId: "report-1",
			blockerMessages: ["Need more small-n data before conjecture is stable."],
		});
		expect(state.workstreams[0]).toMatchObject({
			status: "blocked",
			statusReason: "Need more small-n data before conjecture is stable.",
		});
		expect(state.events.map((event) => event.kind)).toContain("role_run_blocked");
	});

	it("fails role runs and marks target workstreams blocked", () => {
		let state = addWorkstream(createProject(), {
			id: "workstream-endpoints",
			title: "Analyze endpoint induction",
			goalIds: [],
			now: FIXED_NOW,
		});
		state = startRoleRun(state, {
			id: "role-run-1",
			role: "workstream",
			task: "Role: workstream",
			targetWorkstreamId: "workstream-endpoints",
			now: FIXED_NOW,
		});
		state = failRoleRun(state, {
			runId: "role-run-1",
			status: "failed",
			errorMessage: "Role process exited with code 1.",
			now: FIXED_NOW,
			actor: "system",
		});

		expect(state.roleRuns[0]).toMatchObject({
			status: "failed",
			errorMessage: "Role process exited with code 1.",
			completedAt: FIXED_NOW,
		});
		expect(state.workstreams[0]).toMatchObject({
			status: "blocked",
			statusReason: "Role process exited with code 1.",
		});
		expect(state.events.map((event) => event.kind)).toContain("role_run_failed");
	});

	it("records aborted role runs", () => {
		let state = startRoleRun(createProject(), {
			id: "role-run-1",
			role: "coordinator",
			task: "Role: coordinator",
			now: FIXED_NOW,
		});
		state = failRoleRun(state, {
			runId: "role-run-1",
			status: "aborted",
			errorMessage: "Co-math role run was aborted.",
			now: FIXED_NOW,
			actor: "system",
		});

		expect(state.roleRuns[0]).toMatchObject({
			status: "aborted",
			errorMessage: "Co-math role run was aborted.",
		});
		expect(state.events.map((event) => event.kind)).toContain("role_run_aborted");
	});

	it("throws for missing role run ids without creating fake provenance", () => {
		const state = createProject();

		expect(() =>
			finishRoleRun(state, {
				runId: "role-run-missing",
				status: "completed",
				now: FIXED_NOW,
			}),
		).toThrow(/Unknown role run/);
		expect(() =>
			failRoleRun(state, {
				runId: "role-run-missing",
				status: "failed",
				errorMessage: "Missing run.",
				now: FIXED_NOW,
			}),
		).toThrow(/Unknown role run/);
		expect(state.events.map((event) => event.kind)).toEqual(["project_initialized"]);
	});

	it("refuses to finish or fail role runs that are no longer running", () => {
		let state = startRoleRun(createProject(), {
			id: "role-run-1",
			role: "coordinator",
			task: "Role: coordinator",
			now: FIXED_NOW,
		});
		state = finishRoleRun(state, {
			runId: "role-run-1",
			status: "completed",
			now: FIXED_NOW,
		});

		expect(() =>
			finishRoleRun(state, {
				runId: "role-run-1",
				status: "blocked",
				now: FIXED_NOW,
			}),
		).toThrow(/Cannot finish role run role-run-1 because it is completed/);
		expect(() =>
			failRoleRun(state, {
				runId: "role-run-1",
				status: "failed",
				errorMessage: "Should not overwrite completed run.",
				now: FIXED_NOW,
			}),
		).toThrow(/Cannot fail role run role-run-1 because it is completed/);
	});

	it("refuses to finish failed role runs", () => {
		let state = startRoleRun(createProject(), {
			id: "role-run-1",
			role: "coordinator",
			task: "Role: coordinator",
			now: FIXED_NOW,
		});
		state = failRoleRun(state, {
			runId: "role-run-1",
			status: "failed",
			errorMessage: "Role process exited with code 1.",
			now: FIXED_NOW,
		});

		expect(() =>
			finishRoleRun(state, {
				runId: "role-run-1",
				status: "completed",
				now: FIXED_NOW,
			}),
		).toThrow(/Cannot finish role run role-run-1 because it is failed/);
	});

	it("appends provenance events for goals, claims, evidence, warnings, and status changes", () => {
		let state = createProject();
		state = addGoal(state, {
			id: "goal-1",
			text: "Keep proof gaps visible.",
			now: FIXED_NOW,
			actor: "human",
		});
		state = addClaim(state, {
			id: "claim-1",
			workstreamId: "workstream-1",
			statement: "Proof gaps are preserved as warnings.",
			status: "needs_review",
			now: FIXED_NOW,
			actor: "workstream",
		});
		state = addEvidence(state, {
			id: "evidence-1",
			claimId: "claim-1",
			kind: "proof",
			summary: "Reviewer checked a short proof.",
			now: FIXED_NOW,
			actor: "reviewer",
		});
		state = addWarning(state, {
			id: "warning-1",
			claimId: "claim-1",
			severity: "medium",
			message: "Boundary case needs explicit text.",
			now: FIXED_NOW,
			actor: "reviewer",
		});

		expect(state.events.map((event) => event.kind)).toEqual([
			"project_initialized",
			"goal_added",
			"claim_proposed",
			"evidence_added",
			"warning_added",
		]);
		expect(state.events.at(-1)).toMatchObject({
			id: "event-5",
			actor: "reviewer",
			kind: "warning_added",
			subjectId: "warning-1",
			relatedIds: ["claim-1"],
		});
	});

	it("does not append claim status events when proof promotion is rejected", () => {
		const state = addClaim(createProject(), {
			id: "claim-1",
			workstreamId: "workstream-1",
			statement: "Unsupported theorem.",
			status: "needs_review",
			now: FIXED_NOW,
			actor: "workstream",
		});

		expect(() =>
			setClaimStatus(state, {
				claimId: "claim-1",
				status: "proved",
				now: FIXED_NOW,
				actor: "reviewer",
			}),
		).toThrow(/proof evidence/i);
		expect(state.events.map((event) => event.kind)).not.toContain("claim_status_changed");
	});

	it("records artifacts with provenance and appends an artifact event", () => {
		let state = createProject();
		state = addArtifact(state, {
			id: "artifact-1",
			kind: "failed_attempt",
			title: "Endpoint induction attempt",
			summary: "The induction breaks when the right arm is empty.",
			provenance: "Reviewer note from a bounded role run.",
			path: "notes/endpoint-induction.md",
			relatedClaimIds: ["claim-1"],
			relatedWorkstreamIds: ["workstream-endpoints"],
			relatedReportIds: ["report-1"],
			now: FIXED_NOW,
			actor: "reviewer",
		});

		expect(state.artifacts).toEqual([
			{
				id: "artifact-1",
				kind: "failed_attempt",
				title: "Endpoint induction attempt",
				summary: "The induction breaks when the right arm is empty.",
				provenance: "Reviewer note from a bounded role run.",
				path: "notes/endpoint-induction.md",
				relatedClaimIds: ["claim-1"],
				relatedWorkstreamIds: ["workstream-endpoints"],
				relatedReportIds: ["report-1"],
				createdAt: FIXED_NOW,
				updatedAt: FIXED_NOW,
			},
		]);
		expect(state.events.at(-1)).toMatchObject({
			id: "event-2",
			kind: "artifact_recorded",
			actor: "reviewer",
			subjectId: "artifact-1",
			relatedIds: ["claim-1", "workstream-endpoints", "report-1"],
		});
	});

	it("adds working paper sections with source provenance and event", () => {
		let state = createProject();
		state = addClaim(state, {
			id: "claim-1",
			workstreamId: "workstream-1",
			statement: "Endpoint monotonicity has a draft formulation.",
			status: "needs_review",
			now: FIXED_NOW,
		});
		state = addEvidence(state, {
			id: "evidence-1",
			claimId: "claim-1",
			kind: "proof",
			summary: "Proof note.",
			now: FIXED_NOW,
		});
		state = addWarning(state, {
			id: "warning-1",
			claimId: "claim-1",
			severity: "high",
			message: "Boundary case remains open.",
			now: FIXED_NOW,
		});
		state = addArtifact(state, {
			id: "artifact-1",
			kind: "failed_attempt",
			title: "Endpoint attempt",
			summary: "Attempt breaks at the endpoint.",
			now: FIXED_NOW,
		});
		state = startRoleRun(state, {
			id: "role-run-1",
			role: "reviewer",
			task: "Role: reviewer",
			now: FIXED_NOW,
		});
		state = addReviewRound(state, {
			id: "review-round-1",
			claimId: "claim-1",
			roleRunId: "role-run-1",
			reportId: "report-1",
			decisionStatus: "needs_review",
			outcome: "revision_requested",
			now: FIXED_NOW,
		});
		state = addWorkingPaperSection(state, {
			id: "paper-section-1",
			title: " Endpoint draft ",
			body: " Draft body with visible uncertainty. ",
			sourceClaimIds: ["claim-1", "claim-1"],
			sourceEvidenceIds: ["evidence-1"],
			sourceWarningIds: ["warning-1"],
			sourceArtifactIds: ["artifact-1"],
			sourceReviewRoundIds: ["review-round-1"],
			sourceRoleRunIds: ["role-run-1"],
			now: FIXED_NOW,
			actor: "human",
		});

		expect(state.workingPaperSections).toEqual([
			{
				id: "paper-section-1",
				title: "Endpoint draft",
				body: "Draft body with visible uncertainty.",
				status: "draft",
				sourceClaimIds: ["claim-1"],
				sourceEvidenceIds: ["evidence-1"],
				sourceWarningIds: ["warning-1"],
				sourceArtifactIds: ["artifact-1"],
				sourceReviewRoundIds: ["review-round-1"],
				sourceRoleRunIds: ["role-run-1"],
				marginNoteIds: [],
				createdAt: FIXED_NOW,
				updatedAt: FIXED_NOW,
			},
		]);
		expect(state.events.at(-1)).toMatchObject({
			kind: "working_paper_section_recorded",
			actor: "human",
			subjectId: "paper-section-1",
			relatedIds: ["claim-1", "evidence-1", "warning-1", "artifact-1", "review-round-1", "role-run-1"],
		});
	});

	it("upserts working paper sections by title", () => {
		let state = upsertWorkingPaperSectionByTitle(createProject(), {
			title: "Examples and evidence",
			body: "First round.",
			now: FIXED_NOW,
			actor: "system",
		});
		state = upsertWorkingPaperSectionByTitle(state, {
			title: " examples and evidence ",
			body: "Second round.",
			now: "2026-06-05T12:05:00.000Z",
			actor: "system",
		});

		expect(state.workingPaperSections).toHaveLength(1);
		expect(state.workingPaperSections[0]).toMatchObject({
			id: "paper-section-1",
			title: "Examples and evidence",
			body: "First round.\n\nSecond round.",
			updatedAt: "2026-06-05T12:05:00.000Z",
		});
		expect(state.events.at(-1)).toMatchObject({
			kind: "working_paper_section_recorded",
			actor: "system",
			subjectId: "paper-section-1",
		});
	});

	it("adds margin notes and links them to sections", () => {
		let state = addWorkingPaperSection(createProject(), {
			id: "paper-section-1",
			title: "Endpoint draft",
			body: "Draft body.",
			now: FIXED_NOW,
			actor: "human",
		});
		state = addMarginNote(state, {
			id: "margin-note-1",
			kind: "gap",
			subjectId: "paper-section-1",
			sectionId: "paper-section-1",
			message: " Need a lemma for the endpoint boundary case. ",
			now: FIXED_NOW,
			actor: "human",
		});

		expect(state.marginNotes).toEqual([
			{
				id: "margin-note-1",
				kind: "gap",
				status: "open",
				subjectId: "paper-section-1",
				sectionId: "paper-section-1",
				message: "Need a lemma for the endpoint boundary case.",
				createdAt: FIXED_NOW,
				updatedAt: FIXED_NOW,
			},
		]);
		expect(state.workingPaperSections[0]?.marginNoteIds).toEqual(["margin-note-1"]);
		expect(state.events.at(-1)).toMatchObject({
			kind: "margin_note_recorded",
			actor: "human",
			subjectId: "margin-note-1",
			relatedIds: ["paper-section-1", "paper-section-1"],
		});
	});

	it("resolving missing or already resolved margin notes does not create false provenance", () => {
		let state = addMarginNote(createProject(), {
			id: "margin-note-1",
			kind: "todo",
			subjectId: "project",
			message: "Add a clearer introduction.",
			now: FIXED_NOW,
			actor: "human",
		});
		expect(() =>
			resolveMarginNote(state, {
				noteId: "margin-note-missing",
				resolution: "Cannot resolve a missing note.",
				now: FIXED_NOW,
				actor: "human",
			}),
		).toThrow(/Unknown margin note/);

		state = resolveMarginNote(state, {
			noteId: "margin-note-1",
			resolution: "Introduction now names the convention.",
			now: "2026-06-05T12:05:00.000Z",
			actor: "human",
		});
		const afterDuplicate = resolveMarginNote(state, {
			noteId: "margin-note-1",
			resolution: "Duplicate resolution should not create provenance.",
			now: "2026-06-05T12:06:00.000Z",
			actor: "human",
		});

		expect(afterDuplicate).toBe(state);
		expect(state.marginNotes[0]).toMatchObject({
			id: "margin-note-1",
			status: "resolved",
			resolution: "Introduction now names the convention.",
			resolvedAt: "2026-06-05T12:05:00.000Z",
			updatedAt: "2026-06-05T12:05:00.000Z",
		});
		expect(state.events.filter((event) => event.kind === "margin_note_resolved")).toHaveLength(1);
	});

	it("records working paper exports as artifacts and events", () => {
		let state = addClaim(createProject(), {
			id: "claim-1",
			workstreamId: "workstream-1",
			statement: "Export snapshots preserve visible uncertainty.",
			status: "needs_review",
			now: FIXED_NOW,
		});
		state = addWarning(state, {
			id: "warning-1",
			claimId: "claim-1",
			severity: "high",
			message: "Export must preserve this open warning.",
			now: FIXED_NOW,
		});
		state = addWorkingPaperSection(state, {
			id: "paper-section-1",
			title: "Endpoint draft",
			body: "Draft body.",
			sourceClaimIds: ["claim-1"],
			sourceWarningIds: ["warning-1"],
			now: FIXED_NOW,
			actor: "human",
		});
		state = addMarginNote(state, {
			id: "margin-note-1",
			kind: "gap",
			subjectId: "paper-section-1",
			sectionId: "paper-section-1",
			message: "Open note should be related to the export.",
			now: FIXED_NOW,
			actor: "human",
		});
		state = recordWorkingPaperExport(state, {
			artifactId: "artifact-1",
			path: ".pi/co-math/exports/working-paper.md",
			title: "Living working paper export",
			summary: "Markdown snapshot of the living working paper.",
			now: FIXED_NOW,
			actor: "human",
		});

		expect(state.artifacts).toMatchObject([
			{
				id: "artifact-1",
				kind: "working_paper_export",
				title: "Living working paper export",
				summary: "Markdown snapshot of the living working paper.",
				path: ".pi/co-math/exports/working-paper.md",
			},
		]);
		expect(state.events.at(-1)).toMatchObject({
			kind: "working_paper_exported",
			actor: "human",
			subjectId: "artifact-1",
			relatedIds: ["paper-section-1", "warning-1", "margin-note-1"],
		});
		expect(state.evidence).toEqual([]);
		expect(state.claims).toHaveLength(1);
		expect(state.warnings).toHaveLength(1);
	});

	it("working paper export artifact does not affect proof synthesis eligibility", () => {
		let state = addClaim(createProject(), {
			id: "claim-1",
			workstreamId: "workstream-1",
			statement: "A needs-review claim remains excluded after export.",
			status: "needs_review",
			now: FIXED_NOW,
		});
		state = recordWorkingPaperExport(state, {
			artifactId: "artifact-1",
			path: ".pi/co-math/exports/working-paper.md",
			title: "Living working paper export",
			summary: "Markdown snapshot of the living working paper.",
			now: FIXED_NOW,
			actor: "human",
		});

		expect(isClaimSynthesisEligible(state, "claim-1")).toBe(false);
		expect(state.evidence).toEqual([]);
		expect(state.warnings).toEqual([]);
	});

	it("does not append warning resolved events for unknown warning ids", () => {
		const state = createProject();
		const nextState = resolveWarning(state, {
			warningId: "warning-missing",
			now: FIXED_NOW,
			actor: "reviewer",
		});

		expect(nextState).toBe(state);
		expect(nextState.events.map((event) => event.kind)).toEqual(["project_initialized"]);
	});

	it("does not append duplicate warning resolved events", () => {
		let state = addClaim(createProject(), {
			id: "claim-1",
			workstreamId: "workstream-1",
			statement: "A warning can be resolved once.",
			status: "needs_review",
			now: FIXED_NOW,
			actor: "workstream",
		});
		state = addWarning(state, {
			id: "warning-1",
			claimId: "claim-1",
			severity: "medium",
			message: "Gap to resolve.",
			now: FIXED_NOW,
			actor: "reviewer",
		});
		state = resolveWarning(state, {
			warningId: "warning-1",
			now: FIXED_NOW,
			actor: "reviewer",
		});
		const afterDuplicate = resolveWarning(state, {
			warningId: "warning-1",
			now: FIXED_NOW,
			actor: "reviewer",
		});

		expect(afterDuplicate).toBe(state);
		expect(afterDuplicate.events.filter((event) => event.kind === "warning_resolved")).toHaveLength(1);
	});

	it("records review decision events linked to the saved report", () => {
		let state = createProject();
		state = addReviewDecisionEvent(state, {
			claimId: "claim-1",
			status: "proved",
			reportId: "report-1",
			now: FIXED_NOW,
			actor: "reviewer",
		});

		expect(state.events.at(-1)).toEqual({
			id: "event-2",
			kind: "review_decision_recorded",
			actor: "reviewer",
			summary: "Recorded review decision for claim-1: proved",
			subjectId: "claim-1",
			relatedIds: ["report-1"],
			createdAt: FIXED_NOW,
		});
	});

	it("records human intervention events", () => {
		let state = createProject();
		state = recordHumanInterventionEvent(state, {
			summary: "Human chose the endpoint convention.",
			subjectId: "workstream-endpoints",
			relatedIds: ["role-run-1"],
			now: FIXED_NOW,
			actor: "human",
		});

		expect(state.events.at(-1)).toEqual({
			id: "event-2",
			kind: "human_intervention_recorded",
			actor: "human",
			summary: "Human chose the endpoint convention.",
			subjectId: "workstream-endpoints",
			relatedIds: ["role-run-1"],
			createdAt: FIXED_NOW,
		});
	});

	it("records review rounds with linked provenance", () => {
		let state = createProject();
		state = addReviewRound(state, {
			id: "review-round-1",
			claimId: "claim-1",
			roleRunId: "role-run-1",
			reportId: "report-1",
			decisionStatus: "proved",
			outcome: "blocked_by_invariant",
			createdEvidenceIds: ["evidence-1"],
			createdWarningIds: ["warning-1"],
			resolvedWarningIds: ["warning-2"],
			now: FIXED_NOW,
			actor: "reviewer",
		});

		expect(state.reviewRounds).toEqual([
			{
				id: "review-round-1",
				claimId: "claim-1",
				roleRunId: "role-run-1",
				reportId: "report-1",
				status: "completed",
				decisionStatus: "proved",
				outcome: "blocked_by_invariant",
				createdEvidenceIds: ["evidence-1"],
				createdWarningIds: ["warning-1"],
				resolvedWarningIds: ["warning-2"],
				createdAt: FIXED_NOW,
				updatedAt: FIXED_NOW,
			},
		]);
		expect(state.events.at(-1)).toMatchObject({
			id: "event-2",
			kind: "review_round_recorded",
			actor: "reviewer",
			subjectId: "review-round-1",
			relatedIds: ["claim-1", "role-run-1", "report-1", "evidence-1", "warning-1", "warning-2"],
		});
	});

	it("records report review rounds with linked provenance", () => {
		let state = createProject();
		state = addReportReviewRound(state, {
			id: "report-review-1",
			reportId: "report-1",
			roleRunId: "role-run-1",
			outcome: "revision_requested",
			summary: "Report needs a clearer blocker summary.",
			createdWarningIds: ["warning-1"],
			now: FIXED_NOW,
			actor: "human",
		});

		expect(state.reportReviewRounds).toEqual([
			{
				id: "report-review-1",
				reportId: "report-1",
				roleRunId: "role-run-1",
				status: "completed",
				outcome: "revision_requested",
				summary: "Report needs a clearer blocker summary.",
				createdWarningIds: ["warning-1"],
				createdAt: FIXED_NOW,
				updatedAt: FIXED_NOW,
			},
		]);
		expect(state.events.at(-1)).toMatchObject({
			kind: "report_review_round_recorded",
			actor: "human",
			subjectId: "report-review-1",
			relatedIds: ["report-1", "role-run-1", "warning-1"],
		});
	});

	it("revises claims while preserving provenance and returning them to review", () => {
		let state = addClaim(createProject(), {
			id: "claim-1",
			workstreamId: "workstream-1",
			statement: "Initial endpoint monotonicity statement.",
			status: "proved",
			now: FIXED_NOW,
			actor: "workstream",
		});
		state = addEvidence(state, {
			id: "evidence-1",
			claimId: "claim-1",
			kind: "proof",
			summary: "Prior proof evidence remains attached.",
			now: FIXED_NOW,
			actor: "reviewer",
		});
		state = addWarning(state, {
			id: "warning-1",
			claimId: "claim-1",
			severity: "medium",
			message: "Prior warning remains attached.",
			now: FIXED_NOW,
			actor: "reviewer",
		});
		state = reviseClaim(state, {
			id: "claim-revision-1",
			claimId: "claim-1",
			revisedStatement: "Revised endpoint monotonicity statement.",
			reason: "Human clarified endpoint convention.",
			now: FIXED_NOW,
			actor: "human",
		});

		expect(state.claims[0]).toMatchObject({
			id: "claim-1",
			statement: "Revised endpoint monotonicity statement.",
			status: "needs_review",
			evidenceIds: ["evidence-1"],
			warningIds: ["warning-1"],
		});
		expect(state.claimRevisions).toEqual([
			{
				id: "claim-revision-1",
				claimId: "claim-1",
				previousStatement: "Initial endpoint monotonicity statement.",
				revisedStatement: "Revised endpoint monotonicity statement.",
				reason: "Human clarified endpoint convention.",
				actor: "human",
				createdAt: FIXED_NOW,
			},
		]);
		expect(state.reviewQueue).toMatchObject([
			{
				claimId: "claim-1",
				reason: "Claim was revised and needs reviewer validation.",
			},
		]);
		expect(state.events.at(-1)).toMatchObject({
			kind: "claim_revised",
			actor: "human",
			subjectId: "claim-1",
			relatedIds: ["claim-revision-1"],
		});
	});

	it("rejects invalid claim revisions", () => {
		const state = addClaim(createProject(), {
			id: "claim-1",
			workstreamId: "workstream-1",
			statement: "Initial claim.",
			status: "needs_review",
			now: FIXED_NOW,
		});

		expect(() =>
			reviseClaim(state, {
				id: "claim-revision-1",
				claimId: "claim-missing",
				revisedStatement: "Revised.",
				reason: "Reason.",
				now: FIXED_NOW,
			}),
		).toThrow(/Unknown claim/);
		expect(() =>
			reviseClaim(state, {
				id: "claim-revision-1",
				claimId: "claim-1",
				revisedStatement: "",
				reason: "Reason.",
				now: FIXED_NOW,
			}),
		).toThrow(/revised statement/i);
		expect(() =>
			reviseClaim(state, {
				id: "claim-revision-1",
				claimId: "claim-1",
				revisedStatement: "Revised.",
				reason: "",
				now: FIXED_NOW,
			}),
		).toThrow(/reason/i);
	});

	it("refuses to mark a claim proved without attached proof evidence", () => {
		const state = addClaim(createProject(), {
			id: "claim-1",
			workstreamId: "workstream-1",
			statement: "Every synthesized theorem needs explicit proof evidence.",
			status: "draft",
			now: FIXED_NOW,
		});

		expect(() =>
			setClaimStatus(state, {
				claimId: "claim-1",
				status: "proved",
				now: FIXED_NOW,
			}),
		).toThrow(/proof evidence/i);
	});

	it("allows proved status only after proof evidence is attached and no open warning remains", () => {
		let state = addClaim(createProject(), {
			id: "claim-1",
			workstreamId: "workstream-1",
			statement: "Reviewed claims can be promoted only after proof evidence is present.",
			status: "proof_sketch",
			now: FIXED_NOW,
		});
		state = addEvidence(state, {
			id: "evidence-1",
			claimId: "claim-1",
			kind: "proof",
			summary: "A checked proof has been recorded in the project notes.",
			now: FIXED_NOW,
		});
		state = setClaimStatus(state, {
			claimId: "claim-1",
			status: "proved",
			now: FIXED_NOW,
		});

		expect(state.claims[0]?.status satisfies ClaimStatus).toBe("proved");
		expect(state.claims[0]?.evidenceIds).toEqual(["evidence-1"]);
	});

	it("refuses to mark a claim proved while an attached warning remains open", () => {
		let state = addClaim(createProject(), {
			id: "claim-1",
			workstreamId: "workstream-1",
			statement: "A reviewer objection blocks promotion until it is resolved.",
			status: "needs_review",
			now: FIXED_NOW,
		});
		state = addEvidence(state, {
			id: "evidence-1",
			claimId: "claim-1",
			kind: "proof",
			summary: "A proof has been recorded, but the warning is still open.",
			now: FIXED_NOW,
		});
		state = addWarning(state, {
			id: "warning-1",
			claimId: "claim-1",
			severity: "high",
			message: "The reviewer still sees an unresolved endpoint case.",
			now: FIXED_NOW,
		});

		expect(() =>
			setClaimStatus(state, {
				claimId: "claim-1",
				status: "proved",
				now: FIXED_NOW,
			}),
		).toThrow(/open warning/i);
	});

	it("recognizes synthesis eligibility only for proved claims with proof evidence and no open warnings", () => {
		let state = addClaim(createProject(), {
			id: "claim-1",
			workstreamId: "workstream-1",
			statement: "Only fully reviewed claims enter synthesis findings.",
			status: "needs_review",
			now: FIXED_NOW,
		});
		expect(isClaimSynthesisEligible(state, "claim-1")).toBe(false);

		state = addEvidence(state, {
			id: "evidence-1",
			claimId: "claim-1",
			kind: "proof",
			summary: "Reviewer checked the proof line by line.",
			now: FIXED_NOW,
		});
		state = setClaimStatus(state, {
			claimId: "claim-1",
			status: "proved",
			now: FIXED_NOW,
		});

		expect(isClaimSynthesisEligible(state, "claim-1")).toBe(true);
	});

	it("keeps open warnings attached to claims", () => {
		let state = addClaim(createProject(), {
			id: "claim-1",
			workstreamId: "workstream-1",
			statement: "A synthesis should not erase reviewer objections.",
			status: "needs_review",
			now: FIXED_NOW,
		});
		state = addWarning(state, {
			id: "warning-1",
			claimId: "claim-1",
			severity: "high",
			message: "The proof sketch has not handled the boundary case.",
			now: FIXED_NOW,
		});

		expect(state.warnings).toEqual([
			{
				id: "warning-1",
				claimId: "claim-1",
				severity: "high",
				status: "open",
				message: "The proof sketch has not handled the boundary case.",
				createdAt: FIXED_NOW,
				updatedAt: FIXED_NOW,
			},
		]);
		expect(state.claims[0]?.warningIds).toEqual(["warning-1"]);
	});

	it("serializes project state deterministically", () => {
		const state = addGoal(createProject(), {
			id: "goal-1",
			text: "Record failed attempts as first-class project state.",
			now: FIXED_NOW,
		});

		expect(serializeProjectState(state)).toBe(`${JSON.stringify(state, null, "	")}\n`);
		expect(serializeProjectState(state)).toBe(serializeProjectState(state));
	});

	it("builds the default state path inside the target project directory", async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), "pi-comath-state-path-"));
		try {
			expect(getDefaultStatePath(tempDir)).toBe(path.join(tempDir, ".pi", "co-math", "state.json"));
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("writes project state and creates parent directories", async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), "pi-comath-state-save-"));
		try {
			const statePath = getDefaultStatePath(tempDir);
			const state = addGoal(createProject(), {
				id: "goal-1",
				text: "Persist goals as durable project state.",
				now: FIXED_NOW,
			});

			await saveProjectState(statePath, state);

			expect(await readFile(statePath, "utf8")).toBe(serializeProjectState(state));
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("loads saved project state exactly", async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), "pi-comath-state-load-"));
		try {
			const statePath = getDefaultStatePath(tempDir);
			const state = addGoal(createProject(), {
				id: "goal-1",
				text: "Round-trip state through JSON storage.",
				now: FIXED_NOW,
			});

			await saveProjectState(statePath, state);

			expect(await loadProjectState(statePath)).toEqual(state);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("writes atomically under concurrency and leaves no temp files behind", async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), "pi-comath-state-atomic-"));
		try {
			const statePath = getDefaultStatePath(tempDir);
			const states = Array.from({ length: 12 }, (_unused, index) =>
				addGoal(createProject(), {
					id: `goal-${index + 1}`,
					text: `Concurrent save number ${index + 1}.`,
					now: FIXED_NOW,
				}),
			);

			// Concurrent writers must never corrupt the file or collide on a temp path.
			await Promise.all(states.map((state) => saveProjectState(statePath, state)));

			// Whatever won the race, the file is complete, valid JSON for one of the states.
			const loaded = await loadProjectState(statePath);
			expect(loaded).toBeDefined();
			expect(states).toContainEqual(loaded);

			const leftoverTempFiles = (await readdir(path.dirname(statePath))).filter((name) => name.endsWith(".tmp"));
			expect(leftoverTempFiles).toEqual([]);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("normalizes legacy state files without events or artifacts", async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), "pi-comath-state-legacy-"));
		try {
			const statePath = getDefaultStatePath(tempDir);
			const legacyState = addWorkstream(createProject(), {
				id: "workstream-legacy",
				title: "Legacy workstream",
				goalIds: [],
				now: FIXED_NOW,
			});
			const legacyWithoutNewFields = {
				...legacyState,
				workstreams: legacyState.workstreams.map((workstream) => {
					const record = { ...workstream } as Record<string, unknown>;
					delete record.status;
					delete record.statusReason;
					delete record.latestRunIds;
					return record;
				}),
			} as Record<string, unknown>;
			delete legacyWithoutNewFields.artifacts;
			delete legacyWithoutNewFields.events;
			delete legacyWithoutNewFields.roleRuns;
			delete legacyWithoutNewFields.reviewRounds;
			delete legacyWithoutNewFields.claimRevisions;
			delete legacyWithoutNewFields.workingPaperSections;
			delete legacyWithoutNewFields.marginNotes;
			delete legacyWithoutNewFields.researchPaths;
			delete legacyWithoutNewFields.researchReports;
			delete legacyWithoutNewFields.researchWorkstreamRuns;
			delete legacyWithoutNewFields.literatureSources;
			delete legacyWithoutNewFields.literatureClaimSupports;
			delete legacyWithoutNewFields.computationalArtifacts;
			delete legacyWithoutNewFields.researchCoordinatorReports;
			delete legacyWithoutNewFields.researchFocus;
			await saveProjectState(statePath, legacyWithoutNewFields as unknown as CoMathProjectState);

			const loaded = await loadProjectState(statePath);

			expect(loaded?.artifacts).toEqual([]);
			expect(loaded?.events).toEqual([]);
			expect(loaded?.roleRuns).toEqual([]);
			expect(loaded?.reviewRounds).toEqual([]);
			expect(loaded?.reportReviewRounds).toEqual([]);
			expect(loaded?.claimRevisions).toEqual([]);
			expect(loaded?.workingPaperSections).toEqual([]);
			expect(loaded?.marginNotes).toEqual([]);
			expect(loaded?.researchPaths).toEqual([]);
			expect(loaded?.researchWorkstreamRuns).toEqual([]);
			expect(loaded?.literatureSources).toEqual([]);
			expect(loaded?.literatureClaimSupports).toEqual([]);
			expect(loaded?.computationalArtifacts).toEqual([]);
			expect(loaded?.researchCoordinatorReports).toEqual([]);
			expect(loaded?.researchFocus).toBeUndefined();
			expect(loaded?.workstreams[0]).toMatchObject({
				id: "workstream-legacy",
				status: "active",
				latestRunIds: [],
			});
			expect(loaded?.workstreams[0]?.statusReason).toBeUndefined();
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("normalizes legacy goal, claim, artifact, and broad review records conservatively", async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), "pi-comath-state-legacy-shapes-"));
		try {
			const statePath = getDefaultStatePath(tempDir);
			await saveProjectState(statePath, {
				version: 1,
				projectId: "legacy-project",
				title: "Legacy project",
				rootQuestion: "Can legacy state load?",
				approvedGoals: [{ id: "goal-1", summary: "Legacy goal summary" }],
				workstreams: [],
				claims: [
					{
						id: "claim-1",
						status: "validated",
						statement: "Legacy validated claim.",
						evidenceIds: ["evidence-1"],
					},
					{
						id: "claim-2",
						status: "recorded",
						statement: "Legacy recorded claim.",
					},
				],
				evidence: [
					{
						id: "evidence-1",
						claimIds: ["claim-1"],
						summary: "Legacy evidence summary.",
					},
				],
				warnings: [{ id: "warning-1", status: "open", summary: "Legacy warning summary." }],
				reports: [{ id: "report-1", title: "Legacy report", status: "exported" }],
				reviewQueue: [],
				artifacts: [
					{ id: "artifact-1", kind: "source", title: "Legacy source", path: "script.py" },
					{ id: "artifact-2", kind: "data", title: "Legacy data", path: "data.json" },
					{ id: "artifact-3", kind: "paper_export", title: "Legacy export", path: "paper.md" },
				],
				events: [],
				roleRuns: [],
				reviewRounds: [{ id: "review-1", status: "complete", summary: "Legacy broad report review." }],
				claimRevisions: [],
				workingPaperSections: [],
				marginNotes: [],
				updatedAt: FIXED_NOW,
			} as unknown as CoMathProjectState);

			const loaded = await loadProjectState(statePath);

			expect(loaded?.approvedGoals).toMatchObject([{ id: "goal-1", text: "Legacy goal summary", status: "active" }]);
			expect(loaded?.claims).toMatchObject([
				{ id: "claim-1", status: "needs_review", warningIds: [] },
				{ id: "claim-2", status: "draft", evidenceIds: [], warningIds: [] },
			]);
			expect(loaded?.evidence).toMatchObject([{ id: "evidence-1", claimId: "claim-1", kind: "note" }]);
			expect(loaded?.warnings).toMatchObject([
				{ id: "warning-1", severity: "medium", status: "open", message: "Legacy warning summary." },
			]);
			expect(loaded?.artifacts).toMatchObject([
				{ id: "artifact-1", kind: "source", relatedClaimIds: [] },
				{ id: "artifact-2", kind: "dataset", relatedWorkstreamIds: [] },
				{ id: "artifact-3", kind: "working_paper_export", relatedReportIds: [] },
			]);
			expect(loaded?.reviewRounds).toEqual([]);
			expect(loaded?.reportReviewRounds).toMatchObject([
				{
					id: "review-1",
					reportId: "report-1",
					status: "completed",
					outcome: "revision_requested",
					summary: "Legacy broad report review.",
				},
			]);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("downgrades loaded proved claims that violate proof-promotion invariants", async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), "pi-comath-state-load-proof-invariant-"));
		try {
			const statePath = getDefaultStatePath(tempDir);
			await saveProjectState(statePath, {
				...createProject(),
				claims: [
					{
						id: "claim-1",
						workstreamId: "workstream-1",
						statement: "Unsupported loaded proof claim.",
						status: "proved",
						evidenceIds: [],
						warningIds: [],
						createdAt: FIXED_NOW,
						updatedAt: FIXED_NOW,
					},
					{
						id: "claim-2",
						workstreamId: "workstream-1",
						statement: "Warning-blocked loaded proof claim.",
						status: "proved",
						evidenceIds: ["evidence-1"],
						warningIds: [],
						createdAt: FIXED_NOW,
						updatedAt: FIXED_NOW,
					},
				],
				evidence: [
					{
						id: "evidence-1",
						claimId: "claim-2",
						kind: "proof",
						summary: "Proof evidence is present.",
						createdAt: FIXED_NOW,
						updatedAt: FIXED_NOW,
					},
				],
				warnings: [
					{
						id: "warning-1",
						claimId: "claim-2",
						severity: "high",
						status: "open",
						message: "Open warning blocks proof status.",
						createdAt: FIXED_NOW,
						updatedAt: FIXED_NOW,
					},
				],
			});

			const loaded = await loadProjectState(statePath);
			expect(loaded).toBeDefined();
			if (!loaded) return;

			expect(loaded.claims).toMatchObject([
				{ id: "claim-1", status: "needs_review" },
				{ id: "claim-2", status: "needs_review", warningIds: ["warning-1"] },
			]);
			expect(isClaimSynthesisEligible(loaded, "claim-2")).toBe(false);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("reconstructs claim evidence and warning relationships from linked records during load", async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), "pi-comath-state-load-relationships-"));
		try {
			const statePath = getDefaultStatePath(tempDir);
			await saveProjectState(statePath, {
				...createProject(),
				claims: [
					{
						id: "claim-1",
						workstreamId: "workstream-1",
						statement: "Loaded relationships should become bidirectional.",
						status: "needs_review",
						evidenceIds: [],
						warningIds: [],
						createdAt: FIXED_NOW,
						updatedAt: FIXED_NOW,
					},
				],
				evidence: [
					{
						id: "evidence-1",
						claimId: "claim-1",
						kind: "computation",
						summary: "Linked by evidence.claimId only.",
						createdAt: FIXED_NOW,
						updatedAt: FIXED_NOW,
					},
				],
				warnings: [
					{
						id: "warning-1",
						claimId: "claim-1",
						severity: "medium",
						status: "open",
						message: "Linked by warning.claimId only.",
						createdAt: FIXED_NOW,
						updatedAt: FIXED_NOW,
					},
				],
			});

			const loaded = await loadProjectState(statePath);

			expect(loaded?.claims[0]).toMatchObject({
				id: "claim-1",
				evidenceIds: ["evidence-1"],
				warningIds: ["warning-1"],
			});
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("drops mismatched parent-side evidence and warning ids during load", async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), "pi-comath-state-load-ownership-"));
		try {
			const statePath = getDefaultStatePath(tempDir);
			await saveProjectState(statePath, {
				...createProject(),
				claims: [
					{
						id: "claim-1",
						workstreamId: "workstream-1",
						statement: "Parent-side ids should not borrow another claim's proof.",
						status: "proved",
						evidenceIds: ["evidence-1"],
						warningIds: ["warning-1"],
						createdAt: FIXED_NOW,
						updatedAt: FIXED_NOW,
					},
					{
						id: "claim-2",
						workstreamId: "workstream-1",
						statement: "Actual owner of the records.",
						status: "needs_review",
						evidenceIds: [],
						warningIds: [],
						createdAt: FIXED_NOW,
						updatedAt: FIXED_NOW,
					},
				],
				evidence: [
					{
						id: "evidence-1",
						claimId: "claim-2",
						kind: "proof",
						summary: "Proof belongs to claim-2.",
						createdAt: FIXED_NOW,
						updatedAt: FIXED_NOW,
					},
				],
				warnings: [
					{
						id: "warning-1",
						claimId: "claim-2",
						severity: "high",
						status: "open",
						message: "Warning belongs to claim-2.",
						createdAt: FIXED_NOW,
						updatedAt: FIXED_NOW,
					},
				],
			});

			const loaded = await loadProjectState(statePath);
			expect(loaded).toBeDefined();
			if (!loaded) return;

			expect(loaded.claims).toMatchObject([
				{
					id: "claim-1",
					status: "needs_review",
					evidenceIds: [],
					warningIds: [],
				},
				{
					id: "claim-2",
					evidenceIds: ["evidence-1"],
					warningIds: ["warning-1"],
				},
			]);
			expect(isClaimSynthesisEligible(loaded, "claim-1")).toBe(false);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("keeps legacy claim review rounds with missing report ids as claim review rounds", async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), "pi-comath-state-legacy-claim-review-"));
		try {
			const statePath = getDefaultStatePath(tempDir);
			await saveProjectState(statePath, {
				...createProject(),
				claims: [
					{
						id: "claim-1",
						workstreamId: "workstream-1",
						statement: "Claim review should stay claim-scoped.",
						status: "needs_review",
						evidenceIds: [],
						warningIds: [],
						createdAt: FIXED_NOW,
						updatedAt: FIXED_NOW,
					},
				],
				reviewRounds: [
					{
						id: "review-round-1",
						claimId: "claim-1",
						roleRunId: "role-run-1",
						status: "completed",
						decisionStatus: "needs_review",
						outcome: "revision_requested",
						createdEvidenceIds: [],
						createdWarningIds: [],
						resolvedWarningIds: [],
						createdAt: FIXED_NOW,
						updatedAt: FIXED_NOW,
					},
				],
			} as unknown as CoMathProjectState);

			const loaded = await loadProjectState(statePath);

			expect(loaded?.reviewRounds).toMatchObject([
				{
					id: "review-round-1",
					claimId: "claim-1",
					reportId: "",
				},
			]);
			expect(loaded?.reportReviewRounds).toEqual([]);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("normalizes unknown report review outcomes conservatively", async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), "pi-comath-state-report-review-outcome-"));
		try {
			const statePath = getDefaultStatePath(tempDir);
			await saveProjectState(statePath, {
				...createProject(),
				reportReviewRounds: [
					{
						id: "report-review-1",
						reportId: "report-1",
						roleRunId: "role-run-1",
						status: "completed",
						outcome: "unknown",
						summary: "Legacy unknown outcome.",
						createdWarningIds: [],
						createdAt: FIXED_NOW,
						updatedAt: FIXED_NOW,
					},
				],
			} as unknown as CoMathProjectState);

			const loaded = await loadProjectState(statePath);

			expect(loaded?.reportReviewRounds).toMatchObject([
				{
					id: "report-review-1",
					outcome: "revision_requested",
				},
			]);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("loads the committed co-math validation state through current schema normalization", async () => {
		const state = await loadProjectState(path.join(process.cwd(), "..", "..", ".pi", "co-math", "state.json"));
		expect(state).toBeDefined();
		if (!state) return;

		for (const goal of state.approvedGoals) {
			expect(goal.id).toMatch(/^goal-/);
			expect(goal.text.length).toBeGreaterThan(0);
			expect(["proposed", "approved", "active", "completed", "deferred"]).toContain(goal.status);
		}

		for (const claim of state.claims) {
			expect(["draft", "proof_sketch", "needs_review", "proved", "disproved"]).toContain(claim.status);
		}

		for (const artifact of state.artifacts) {
			expect([
				"source",
				"computation",
				"latex_note",
				"proof_sketch",
				"counterexample_search",
				"reference",
				"dataset",
				"script",
				"figure",
				"failed_attempt",
				"human_note",
				"working_paper_export",
			]).toContain(artifact.kind);
		}
	});

	it("normalizes legacy role runs with queuedAt without changing status", async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), "pi-comath-state-legacy-runs-"));
		try {
			const statePath = getDefaultStatePath(tempDir);
			const legacyState = startRoleRun(createProject(), {
				id: "role-run-1",
				role: "coordinator",
				task: "Role: coordinator",
				now: FIXED_NOW,
				actor: "coordinator",
			});
			const legacyWithoutQueuedAt = {
				...legacyState,
				roleRuns: legacyState.roleRuns.map((run) => {
					const record = { ...run } as Record<string, unknown>;
					delete record.queuedAt;
					return record;
				}),
			};
			await saveProjectState(statePath, legacyWithoutQueuedAt as unknown as CoMathProjectState);

			const loaded = await loadProjectState(statePath);

			expect(loaded?.roleRuns).toMatchObject([
				{
					id: "role-run-1",
					status: "running",
					queuedAt: FIXED_NOW,
					startedAt: FIXED_NOW,
				},
			]);
			expect(loaded?.roleRuns[0]?.status).not.toBe("queued");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("normalizes legacy started role runs with foreground execution mode", async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), "pi-comath-state-legacy-mode-"));
		try {
			const statePath = getDefaultStatePath(tempDir);
			const legacyState = startRoleRun(createProject(), {
				id: "role-run-1",
				role: "coordinator",
				task: "Role: coordinator",
				now: FIXED_NOW,
				actor: "coordinator",
			});
			const legacyWithoutExecutionMode = {
				...legacyState,
				roleRuns: legacyState.roleRuns.map((run) => {
					const record = { ...run } as Record<string, unknown>;
					delete record.executionMode;
					return record;
				}),
			};
			await saveProjectState(statePath, legacyWithoutExecutionMode as unknown as CoMathProjectState);

			const loaded = await loadProjectState(statePath);

			expect(loaded?.roleRuns[0]).toMatchObject({
				id: "role-run-1",
				status: "running",
				startedAt: FIXED_NOW,
				executionMode: "foreground",
			});
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("returns undefined for missing project state", async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), "pi-comath-state-missing-"));
		try {
			expect(await loadProjectState(getDefaultStatePath(tempDir))).toBeUndefined();
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});
});
