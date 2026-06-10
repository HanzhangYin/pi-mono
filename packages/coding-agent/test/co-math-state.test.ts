import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { ClaimStatus, CoMathProjectState } from "../examples/extensions/co-math/schema.ts";
import {
	addArtifact,
	addClaim,
	addEvidence,
	addGoal,
	addMarginNote,
	addReportReviewRound,
	addReviewDecisionEvent,
	addReviewRound,
	addWarning,
	addWorkingPaperSection,
	addWorkstream,
	cancelQueuedRoleRun,
	createEmptyProjectState,
	dispatchQueuedRoleRun,
	failRoleRun,
	finishRoleRun,
	getDefaultStatePath,
	isClaimSynthesisEligible,
	loadProjectState,
	queueRoleRun,
	recordHumanInterventionEvent,
	recordWorkingPaperExport,
	resolveMarginNote,
	resolveWarning,
	reviseClaim,
	saveProjectState,
	serializeProjectState,
	setClaimStatus,
	setGoalStatus,
	startRoleRun,
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
			updatedAt: FIXED_NOW,
		});
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
				{ id: "artifact-1", kind: "script", relatedClaimIds: [] },
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
