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
	addReviewDecisionEvent,
	addWarning,
	createEmptyProjectState,
	getDefaultStatePath,
	isClaimSynthesisEligible,
	loadProjectState,
	resolveWarning,
	saveProjectState,
	serializeProjectState,
	setClaimStatus,
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
			const legacyWithoutNewFields = { ...createProject() } as Record<string, unknown>;
			delete legacyWithoutNewFields.artifacts;
			delete legacyWithoutNewFields.events;
			await saveProjectState(statePath, legacyWithoutNewFields as unknown as CoMathProjectState);

			const loaded = await loadProjectState(statePath);

			expect(loaded?.artifacts).toEqual([]);
			expect(loaded?.events).toEqual([]);
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
