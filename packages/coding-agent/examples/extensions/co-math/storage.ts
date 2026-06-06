import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type {
	ArtifactKind,
	ArtifactRecord,
	Claim,
	ClaimRevisionRecord,
	ClaimStatus,
	CoMathActor,
	CoMathEventKind,
	CoMathProjectState,
	CoMathRole,
	Evidence,
	EvidenceKind,
	MarginNote,
	MarginNoteKind,
	Report,
	ReviewQueueItem,
	ReviewRoundOutcome,
	ReviewRoundRecord,
	RoleRunExecutionMode,
	RoleRunRecord,
	Warning,
	WarningSeverity,
	WorkingPaperSection,
	WorkingPaperSectionStatus,
	Workstream,
	WorkstreamStatus,
} from "./schema.ts";

type LegacyWorkstream = Omit<Workstream, "latestRunIds" | "status" | "statusReason"> &
	Partial<Pick<Workstream, "latestRunIds" | "status" | "statusReason">>;
type LegacyRoleRun = Omit<RoleRunRecord, "queuedAt"> & Partial<Pick<RoleRunRecord, "queuedAt">>;
type LegacyProjectState = Omit<
	CoMathProjectState,
	"artifacts" | "events" | "roleRuns" | "workstreams" | "workingPaperSections" | "marginNotes"
> &
	Partial<
		Omit<
			Pick<
				CoMathProjectState,
				"artifacts" | "events" | "reviewRounds" | "claimRevisions" | "workingPaperSections" | "marginNotes"
			>,
			"roleRuns"
		>
	> & {
		roleRuns?: LegacyRoleRun[];
		workstreams: LegacyWorkstream[];
	};

export interface CreateEmptyProjectStateInput {
	projectId: string;
	title: string;
	rootQuestion: string;
	now: string;
}

export interface AddGoalInput {
	id: string;
	text: string;
	now: string;
	actor?: CoMathActor;
}

export interface AddWorkstreamInput {
	id: string;
	title: string;
	goalIds: string[];
	now: string;
	actor?: CoMathActor;
}

export interface AddClaimInput {
	id: string;
	workstreamId: string;
	statement: string;
	status: ClaimStatus;
	now: string;
	actor?: CoMathActor;
}

export interface AddEvidenceInput {
	id: string;
	claimId: string;
	kind: EvidenceKind;
	summary: string;
	now: string;
	actor?: CoMathActor;
}

export interface AddWarningInput {
	id: string;
	claimId: string;
	severity: WarningSeverity;
	message: string;
	now: string;
	actor?: CoMathActor;
}

export interface AddReportInput {
	id: string;
	title: string;
	summary: string;
	blockers?: string[];
	now: string;
	actor?: CoMathActor;
}

export interface AttachWorkstreamReportInput {
	workstreamId: string;
	reportId: string;
	now: string;
}

export interface AddReviewQueueItemInput {
	id: string;
	claimId: string;
	reason: string;
	now: string;
	actor?: CoMathActor;
}

export interface ResolveWarningInput {
	warningId: string;
	now: string;
	actor?: CoMathActor;
}

export interface SetClaimStatusInput {
	claimId: string;
	status: ClaimStatus;
	now: string;
	actor?: CoMathActor;
}

export interface AddArtifactInput {
	id: string;
	kind: ArtifactKind;
	title: string;
	summary: string;
	provenance?: string;
	path?: string;
	relatedClaimIds?: string[];
	relatedWorkstreamIds?: string[];
	relatedReportIds?: string[];
	now: string;
	actor?: CoMathActor;
}

export interface AddSynthesisEventInput {
	now: string;
	actor?: CoMathActor;
}

export interface AddReviewDecisionEventInput {
	claimId: string;
	status: "proved" | "needs_review" | "disproved";
	reportId: string;
	now: string;
	actor?: CoMathActor;
}

export interface SetWorkstreamStatusInput {
	workstreamId: string;
	status: WorkstreamStatus;
	statusReason?: string;
	now: string;
	actor?: CoMathActor;
}

export interface StartRoleRunInput {
	id: string;
	role: CoMathRole;
	task: string;
	targetWorkstreamId?: string;
	targetClaimId?: string;
	now: string;
	actor?: CoMathActor;
}

export interface QueueRoleRunInput {
	id: string;
	role: CoMathRole;
	task: string;
	targetWorkstreamId?: string;
	targetClaimId?: string;
	now: string;
	actor: CoMathActor;
}

export interface DispatchQueuedRoleRunInput {
	runId: string;
	now: string;
	actor: CoMathActor;
	executionMode?: RoleRunExecutionMode;
}

export interface FinishRoleRunInput {
	runId: string;
	status: "completed" | "blocked";
	reportId?: string;
	createdClaimIds?: string[];
	createdEvidenceIds?: string[];
	createdWarningIds?: string[];
	createdArtifactIds?: string[];
	blockerMessages?: string[];
	now: string;
	actor?: CoMathActor;
}

export interface FailRoleRunInput {
	runId: string;
	status: "failed" | "aborted";
	errorMessage: string;
	now: string;
	actor?: CoMathActor;
}

export interface CancelQueuedRoleRunInput {
	runId: string;
	reason: string;
	now: string;
	actor: CoMathActor;
}

export interface RecordHumanInterventionEventInput {
	summary: string;
	subjectId?: string;
	relatedIds?: string[];
	now: string;
	actor?: CoMathActor;
}

export interface AddReviewRoundInput {
	id: string;
	claimId: string;
	roleRunId: string;
	reportId: string;
	decisionStatus: ClaimStatus;
	outcome: ReviewRoundOutcome;
	createdEvidenceIds?: string[];
	createdWarningIds?: string[];
	resolvedWarningIds?: string[];
	now: string;
	actor?: CoMathActor;
}

export interface ReviseClaimInput {
	id: string;
	claimId: string;
	revisedStatement: string;
	reason: string;
	now: string;
	actor?: CoMathActor;
}

export interface AddWorkingPaperSectionInput {
	id: string;
	title: string;
	body: string;
	status?: WorkingPaperSectionStatus;
	sourceClaimIds?: string[];
	sourceEvidenceIds?: string[];
	sourceWarningIds?: string[];
	sourceArtifactIds?: string[];
	sourceReviewRoundIds?: string[];
	sourceRoleRunIds?: string[];
	now: string;
	actor: CoMathActor;
}

export interface AddMarginNoteInput {
	id: string;
	kind: MarginNoteKind;
	subjectId: string;
	sectionId?: string;
	message: string;
	now: string;
	actor: CoMathActor;
}

export interface ResolveMarginNoteInput {
	noteId: string;
	resolution: string;
	now: string;
	actor: CoMathActor;
}

interface AppendEventInput {
	kind: CoMathEventKind;
	actor?: CoMathActor;
	summary: string;
	subjectId?: string;
	relatedIds?: string[];
	now: string;
}

export function createEmptyProjectState(input: CreateEmptyProjectStateInput): CoMathProjectState {
	return {
		version: 1,
		projectId: input.projectId,
		title: input.title,
		rootQuestion: input.rootQuestion,
		approvedGoals: [],
		workstreams: [],
		claims: [],
		evidence: [],
		warnings: [],
		reports: [],
		reviewQueue: [],
		artifacts: [],
		roleRuns: [],
		reviewRounds: [],
		claimRevisions: [],
		workingPaperSections: [],
		marginNotes: [],
		events: [
			{
				id: "event-1",
				kind: "project_initialized",
				actor: "human",
				summary: `Initialized co-math project: ${input.rootQuestion}`,
				subjectId: input.projectId,
				relatedIds: [],
				createdAt: input.now,
			},
		],
		updatedAt: input.now,
	};
}

export function addGoal(state: CoMathProjectState, input: AddGoalInput): CoMathProjectState {
	return appendEvent(
		{
			...state,
			approvedGoals: [
				...state.approvedGoals,
				{
					id: input.id,
					text: input.text,
					status: "active",
					createdAt: input.now,
					updatedAt: input.now,
				},
			],
			updatedAt: input.now,
		},
		{
			kind: "goal_added",
			actor: input.actor,
			summary: `Added goal ${input.id}: ${input.text}`,
			subjectId: input.id,
			now: input.now,
		},
	);
}

export function addWorkstream(state: CoMathProjectState, input: AddWorkstreamInput): CoMathProjectState {
	const duplicate = state.workstreams.find((workstream) => workstream.id === input.id);
	if (duplicate) {
		throw new Error(`Duplicate workstream id: ${input.id}`);
	}

	const workstream: Workstream = {
		id: input.id,
		title: input.title,
		status: "active",
		goalIds: input.goalIds,
		claimIds: [],
		latestReportIds: [],
		latestRunIds: [],
		createdAt: input.now,
		updatedAt: input.now,
	};

	return appendEvent(
		{
			...state,
			workstreams: [...state.workstreams, workstream],
			updatedAt: input.now,
		},
		{
			kind: "workstream_added",
			actor: input.actor,
			summary: `Added workstream ${input.id}: ${input.title}`,
			subjectId: input.id,
			relatedIds: input.goalIds,
			now: input.now,
		},
	);
}

export function addClaim(state: CoMathProjectState, input: AddClaimInput): CoMathProjectState {
	const claim: Claim = {
		id: input.id,
		workstreamId: input.workstreamId,
		statement: input.statement,
		status: input.status,
		evidenceIds: [],
		warningIds: [],
		createdAt: input.now,
		updatedAt: input.now,
	};

	return appendEvent(
		{
			...state,
			workstreams: state.workstreams.map((workstream) =>
				workstream.id === input.workstreamId
					? {
							...workstream,
							claimIds: [...workstream.claimIds, input.id],
							updatedAt: input.now,
						}
					: workstream,
			),
			claims: [...state.claims, claim],
			updatedAt: input.now,
		},
		{
			kind: "claim_proposed",
			actor: input.actor,
			summary: `Proposed claim ${input.id}: ${input.statement}`,
			subjectId: input.id,
			relatedIds: [input.workstreamId],
			now: input.now,
		},
	);
}

export function addEvidence(state: CoMathProjectState, input: AddEvidenceInput): CoMathProjectState {
	assertClaimExists(state, input.claimId);

	const evidence: Evidence = {
		id: input.id,
		claimId: input.claimId,
		kind: input.kind,
		summary: input.summary,
		createdAt: input.now,
		updatedAt: input.now,
	};

	return appendEvent(
		{
			...state,
			claims: state.claims.map((claim) =>
				claim.id === input.claimId
					? {
							...claim,
							evidenceIds: [...claim.evidenceIds, input.id],
							updatedAt: input.now,
						}
					: claim,
			),
			evidence: [...state.evidence, evidence],
			updatedAt: input.now,
		},
		{
			kind: "evidence_added",
			actor: input.actor,
			summary: `Added evidence ${input.id} to ${input.claimId}: ${input.summary}`,
			subjectId: input.id,
			relatedIds: [input.claimId],
			now: input.now,
		},
	);
}

export function addWarning(state: CoMathProjectState, input: AddWarningInput): CoMathProjectState {
	assertClaimExists(state, input.claimId);

	const warning: Warning = {
		id: input.id,
		claimId: input.claimId,
		severity: input.severity,
		status: "open",
		message: input.message,
		createdAt: input.now,
		updatedAt: input.now,
	};

	return appendEvent(
		{
			...state,
			claims: state.claims.map((claim) =>
				claim.id === input.claimId
					? {
							...claim,
							warningIds: [...claim.warningIds, input.id],
							updatedAt: input.now,
						}
					: claim,
			),
			warnings: [...state.warnings, warning],
			updatedAt: input.now,
		},
		{
			kind: "warning_added",
			actor: input.actor,
			summary: `Added warning ${input.id} to ${input.claimId}: ${input.message}`,
			subjectId: input.id,
			relatedIds: [input.claimId],
			now: input.now,
		},
	);
}

export function addReport(state: CoMathProjectState, input: AddReportInput): CoMathProjectState {
	const report: Report = {
		id: input.id,
		title: input.title,
		summary: input.summary,
		blockers: input.blockers ?? [],
		createdAt: input.now,
		updatedAt: input.now,
	};

	return appendEvent(
		{
			...state,
			reports: [...state.reports, report],
			updatedAt: input.now,
		},
		{
			kind: "role_report_saved",
			actor: input.actor,
			summary: `Saved report ${input.id}: ${input.title}`,
			subjectId: input.id,
			now: input.now,
		},
	);
}

export function attachWorkstreamReport(
	state: CoMathProjectState,
	input: AttachWorkstreamReportInput,
): CoMathProjectState {
	return {
		...state,
		workstreams: state.workstreams.map((workstream) =>
			workstream.id === input.workstreamId
				? {
						...workstream,
						latestReportIds: [...workstream.latestReportIds, input.reportId],
						updatedAt: input.now,
					}
				: workstream,
		),
		updatedAt: input.now,
	};
}

export function addReviewQueueItem(state: CoMathProjectState, input: AddReviewQueueItemInput): CoMathProjectState {
	if (state.reviewQueue.some((item) => item.claimId === input.claimId)) {
		return state;
	}

	const item: ReviewQueueItem = {
		id: input.id,
		claimId: input.claimId,
		reason: input.reason,
		createdAt: input.now,
	};

	return appendEvent(
		{
			...state,
			reviewQueue: [...state.reviewQueue, item],
			updatedAt: input.now,
		},
		{
			kind: "review_requested",
			actor: input.actor,
			summary: `Requested review for ${input.claimId}: ${input.reason}`,
			subjectId: input.id,
			relatedIds: [input.claimId],
			now: input.now,
		},
	);
}

export function removeReviewQueueItemsForClaim(
	state: CoMathProjectState,
	claimId: string,
	now: string,
): CoMathProjectState {
	return {
		...state,
		reviewQueue: state.reviewQueue.filter((item) => item.claimId !== claimId),
		updatedAt: now,
	};
}

export function resolveWarning(state: CoMathProjectState, input: ResolveWarningInput): CoMathProjectState {
	const warning = state.warnings.find((candidate) => candidate.id === input.warningId);
	if (!warning || warning.status === "resolved") {
		return state;
	}

	return appendEvent(
		{
			...state,
			warnings: state.warnings.map((warning) =>
				warning.id === input.warningId
					? {
							...warning,
							status: "resolved",
							updatedAt: input.now,
						}
					: warning,
			),
			updatedAt: input.now,
		},
		{
			kind: "warning_resolved",
			actor: input.actor,
			summary: `Resolved warning ${input.warningId}`,
			subjectId: input.warningId,
			now: input.now,
		},
	);
}

export function setClaimStatus(state: CoMathProjectState, input: SetClaimStatusInput): CoMathProjectState {
	const claim = findClaim(state, input.claimId);

	if (input.status === "proved") {
		if (!hasAttachedProofEvidence(state, claim)) {
			throw new Error("Cannot mark claim proved without attached proof evidence.");
		}
		if (hasAttachedOpenWarning(state, claim)) {
			throw new Error("Cannot mark claim proved while an open warning remains attached.");
		}
	}

	return appendEvent(
		{
			...state,
			claims: state.claims.map((candidate) =>
				candidate.id === input.claimId
					? {
							...candidate,
							status: input.status,
							updatedAt: input.now,
						}
					: candidate,
			),
			updatedAt: input.now,
		},
		{
			kind: "claim_status_changed",
			actor: input.actor,
			summary: `Set ${input.claimId} status to ${input.status}`,
			subjectId: input.claimId,
			now: input.now,
		},
	);
}

export function addArtifact(state: CoMathProjectState, input: AddArtifactInput): CoMathProjectState {
	const artifact: ArtifactRecord = {
		id: input.id,
		kind: input.kind,
		title: input.title,
		summary: input.summary,
		...(input.provenance ? { provenance: input.provenance } : {}),
		...(input.path ? { path: input.path } : {}),
		relatedClaimIds: input.relatedClaimIds ?? [],
		relatedWorkstreamIds: input.relatedWorkstreamIds ?? [],
		relatedReportIds: input.relatedReportIds ?? [],
		createdAt: input.now,
		updatedAt: input.now,
	};

	return appendEvent(
		{
			...state,
			artifacts: [...state.artifacts, artifact],
			updatedAt: input.now,
		},
		{
			kind: "artifact_recorded",
			actor: input.actor,
			summary: `Recorded artifact ${input.id}: ${input.title}`,
			subjectId: input.id,
			relatedIds: [...artifact.relatedClaimIds, ...artifact.relatedWorkstreamIds, ...artifact.relatedReportIds],
			now: input.now,
		},
	);
}

export function addSynthesisEvent(state: CoMathProjectState, input: AddSynthesisEventInput): CoMathProjectState {
	return appendEvent(state, {
		kind: "synthesis_generated",
		actor: input.actor,
		summary: "Generated cautious co-math synthesis from reviewed state.",
		now: input.now,
	});
}

export function addReviewDecisionEvent(
	state: CoMathProjectState,
	input: AddReviewDecisionEventInput,
): CoMathProjectState {
	return appendEvent(state, {
		kind: "review_decision_recorded",
		actor: input.actor,
		summary: `Recorded review decision for ${input.claimId}: ${input.status}`,
		subjectId: input.claimId,
		relatedIds: [input.reportId],
		now: input.now,
	});
}

export function setWorkstreamStatus(state: CoMathProjectState, input: SetWorkstreamStatusInput): CoMathProjectState {
	const workstream = state.workstreams.find((candidate) => candidate.id === input.workstreamId);
	if (!workstream) return state;
	if (workstream.status === input.status && workstream.statusReason === input.statusReason) return state;

	return appendEvent(
		{
			...state,
			workstreams: state.workstreams.map((candidate) => {
				if (candidate.id !== input.workstreamId) return candidate;
				const { statusReason: _statusReason, ...rest } = candidate;
				return {
					...rest,
					status: input.status,
					...(input.statusReason ? { statusReason: input.statusReason } : {}),
					updatedAt: input.now,
				};
			}),
			updatedAt: input.now,
		},
		{
			kind: "workstream_status_changed",
			actor: input.actor,
			summary: `Set ${input.workstreamId} status to ${input.status}`,
			subjectId: input.workstreamId,
			now: input.now,
		},
	);
}

export function startRoleRun(state: CoMathProjectState, input: StartRoleRunInput): CoMathProjectState {
	const run: RoleRunRecord = {
		id: input.id,
		role: input.role,
		status: "running",
		...(input.targetWorkstreamId ? { targetWorkstreamId: input.targetWorkstreamId } : {}),
		...(input.targetClaimId ? { targetClaimId: input.targetClaimId } : {}),
		task: input.task,
		createdClaimIds: [],
		createdEvidenceIds: [],
		createdWarningIds: [],
		createdArtifactIds: [],
		blockerMessages: [],
		queuedAt: input.now,
		startedAt: input.now,
		executionMode: "foreground",
		updatedAt: input.now,
	};
	let nextState = appendEvent(
		{
			...state,
			roleRuns: [...state.roleRuns, run],
			workstreams: input.targetWorkstreamId
				? state.workstreams.map((workstream) =>
						workstream.id === input.targetWorkstreamId
							? {
									...workstream,
									latestRunIds: [...workstream.latestRunIds, input.id],
									updatedAt: input.now,
								}
							: workstream,
					)
				: state.workstreams,
			updatedAt: input.now,
		},
		{
			kind: "role_run_started",
			actor: input.actor,
			summary: `Started role run ${input.id}: ${input.role}`,
			subjectId: input.id,
			relatedIds: relatedRunTargetIds(run),
			now: input.now,
		},
	);
	if (input.targetWorkstreamId) {
		nextState = setWorkstreamStatus(nextState, {
			workstreamId: input.targetWorkstreamId,
			status: "running",
			now: input.now,
			actor: input.actor,
		});
	}
	return nextState;
}

export function queueRoleRun(state: CoMathProjectState, input: QueueRoleRunInput): CoMathProjectState {
	const run: RoleRunRecord = {
		id: input.id,
		role: input.role,
		status: "queued",
		...(input.targetWorkstreamId ? { targetWorkstreamId: input.targetWorkstreamId } : {}),
		...(input.targetClaimId ? { targetClaimId: input.targetClaimId } : {}),
		task: input.task,
		createdClaimIds: [],
		createdEvidenceIds: [],
		createdWarningIds: [],
		createdArtifactIds: [],
		blockerMessages: [],
		queuedAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			roleRuns: [...state.roleRuns, run],
			workstreams: input.targetWorkstreamId
				? state.workstreams.map((workstream) =>
						workstream.id === input.targetWorkstreamId
							? {
									...workstream,
									latestRunIds: [...workstream.latestRunIds, input.id],
									updatedAt: input.now,
								}
							: workstream,
					)
				: state.workstreams,
			updatedAt: input.now,
		},
		{
			kind: "role_run_queued",
			actor: input.actor,
			summary: `Queued role run ${input.id}: ${input.role}`,
			subjectId: input.id,
			relatedIds: relatedRunTargetIds(run),
			now: input.now,
		},
	);
}

export function dispatchQueuedRoleRun(
	state: CoMathProjectState,
	input: DispatchQueuedRoleRunInput,
): CoMathProjectState {
	const run = findRoleRun(state, input.runId);
	if (run.status !== "queued") {
		throw new Error(`Cannot dispatch role run ${input.runId} because it is ${run.status}.`);
	}
	let nextState = appendEvent(
		{
			...state,
			roleRuns: state.roleRuns.map((candidate) =>
				candidate.id === input.runId
					? {
							...candidate,
							status: "running",
							startedAt: input.now,
							executionMode: input.executionMode ?? "foreground",
							updatedAt: input.now,
						}
					: candidate,
			),
			updatedAt: input.now,
		},
		{
			kind: "role_run_started",
			actor: input.actor,
			summary: `Started role run ${input.runId}: ${run.role}`,
			subjectId: input.runId,
			relatedIds: relatedRunTargetIds(run),
			now: input.now,
		},
	);
	if (run.targetWorkstreamId) {
		nextState = setWorkstreamStatus(nextState, {
			workstreamId: run.targetWorkstreamId,
			status: "running",
			now: input.now,
			actor: input.actor,
		});
	}
	return nextState;
}

export function finishRoleRun(state: CoMathProjectState, input: FinishRoleRunInput): CoMathProjectState {
	const run = findRoleRun(state, input.runId);
	if (run.status !== "running") {
		throw new Error(`Cannot finish role run ${input.runId} because it is ${run.status}.`);
	}
	const blockerMessages = input.blockerMessages ?? [];
	let nextState = appendEvent(
		{
			...state,
			roleRuns: state.roleRuns.map((candidate) =>
				candidate.id === input.runId
					? {
							...candidate,
							status: input.status,
							...(input.reportId ? { reportId: input.reportId } : {}),
							createdClaimIds: input.createdClaimIds ?? [],
							createdEvidenceIds: input.createdEvidenceIds ?? [],
							createdWarningIds: input.createdWarningIds ?? [],
							createdArtifactIds: input.createdArtifactIds ?? [],
							blockerMessages,
							completedAt: input.now,
							updatedAt: input.now,
						}
					: candidate,
			),
			updatedAt: input.now,
		},
		{
			kind: input.status === "completed" ? "role_run_completed" : "role_run_blocked",
			actor: input.actor,
			summary:
				input.status === "completed" ? `Completed role run ${input.runId}` : `Blocked role run ${input.runId}`,
			subjectId: input.runId,
			relatedIds: input.reportId ? [input.reportId] : [],
			now: input.now,
		},
	);

	if (run.targetWorkstreamId) {
		if (input.status === "blocked") {
			nextState = setWorkstreamStatus(nextState, {
				workstreamId: run.targetWorkstreamId,
				status: "blocked",
				statusReason: blockerMessages[0] ?? "Role run reported blockers.",
				now: input.now,
				actor: input.actor,
			});
		} else {
			nextState = setWorkstreamStatus(nextState, {
				workstreamId: run.targetWorkstreamId,
				status: (input.createdClaimIds?.length ?? 0) > 0 ? "needs_review" : "active",
				now: input.now,
				actor: input.actor,
			});
		}
	}
	return nextState;
}

export function failRoleRun(state: CoMathProjectState, input: FailRoleRunInput): CoMathProjectState {
	const run = findRoleRun(state, input.runId);
	if (run.status !== "running") {
		throw new Error(`Cannot fail role run ${input.runId} because it is ${run.status}.`);
	}
	let nextState = appendEvent(
		{
			...state,
			roleRuns: state.roleRuns.map((candidate) =>
				candidate.id === input.runId
					? {
							...candidate,
							status: input.status,
							errorMessage: input.errorMessage,
							completedAt: input.now,
							updatedAt: input.now,
						}
					: candidate,
			),
			updatedAt: input.now,
		},
		{
			kind: input.status === "failed" ? "role_run_failed" : "role_run_aborted",
			actor: input.actor,
			summary: input.status === "failed" ? `Failed role run ${input.runId}` : `Aborted role run ${input.runId}`,
			subjectId: input.runId,
			now: input.now,
		},
	);
	if (run.targetWorkstreamId) {
		nextState = setWorkstreamStatus(nextState, {
			workstreamId: run.targetWorkstreamId,
			status: "blocked",
			statusReason: input.errorMessage,
			now: input.now,
			actor: input.actor,
		});
	}
	return nextState;
}

export function cancelQueuedRoleRun(state: CoMathProjectState, input: CancelQueuedRoleRunInput): CoMathProjectState {
	const run = findRoleRun(state, input.runId);
	if (run.status !== "queued") {
		throw new Error(`Cannot cancel role run ${input.runId} because it is ${run.status}.`);
	}
	const reason = input.reason.trim();
	if (!reason) {
		throw new Error("Cancelling a queued role run requires a reason.");
	}
	return appendEvent(
		{
			...state,
			roleRuns: state.roleRuns.map((candidate) =>
				candidate.id === input.runId
					? {
							...candidate,
							status: "cancelled",
							completedAt: input.now,
							cancelledAt: input.now,
							cancelReason: reason,
							updatedAt: input.now,
						}
					: candidate,
			),
			updatedAt: input.now,
		},
		{
			kind: "role_run_cancelled",
			actor: input.actor,
			summary: `Cancelled role run ${input.runId}: ${reason}`,
			subjectId: input.runId,
			relatedIds: relatedRunTargetIds(run),
			now: input.now,
		},
	);
}

export function recordHumanInterventionEvent(
	state: CoMathProjectState,
	input: RecordHumanInterventionEventInput,
): CoMathProjectState {
	return appendEvent(state, {
		kind: "human_intervention_recorded",
		actor: input.actor ?? "human",
		summary: input.summary,
		subjectId: input.subjectId,
		relatedIds: input.relatedIds,
		now: input.now,
	});
}

export function addReviewRound(state: CoMathProjectState, input: AddReviewRoundInput): CoMathProjectState {
	const reviewRound: ReviewRoundRecord = {
		id: input.id,
		claimId: input.claimId,
		roleRunId: input.roleRunId,
		reportId: input.reportId,
		status: "completed",
		decisionStatus: input.decisionStatus,
		outcome: input.outcome,
		createdEvidenceIds: input.createdEvidenceIds ?? [],
		createdWarningIds: input.createdWarningIds ?? [],
		resolvedWarningIds: input.resolvedWarningIds ?? [],
		createdAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			reviewRounds: [...state.reviewRounds, reviewRound],
			updatedAt: input.now,
		},
		{
			kind: "review_round_recorded",
			actor: input.actor,
			summary: `Recorded review round ${input.id} for ${input.claimId}: ${input.outcome}`,
			subjectId: input.id,
			relatedIds: [
				input.claimId,
				input.roleRunId,
				input.reportId,
				...reviewRound.createdEvidenceIds,
				...reviewRound.createdWarningIds,
				...reviewRound.resolvedWarningIds,
			],
			now: input.now,
		},
	);
}

export function reviseClaim(state: CoMathProjectState, input: ReviseClaimInput): CoMathProjectState {
	const claim = findClaim(state, input.claimId);
	const revisedStatement = input.revisedStatement.trim();
	const reason = input.reason.trim();
	if (!revisedStatement) {
		throw new Error("Claim revision requires a revised statement.");
	}
	if (!reason) {
		throw new Error("Claim revision requires a reason.");
	}

	const revision: ClaimRevisionRecord = {
		id: input.id,
		claimId: input.claimId,
		previousStatement: claim.statement,
		revisedStatement,
		reason,
		actor: input.actor ?? "human",
		createdAt: input.now,
	};
	let nextState: CoMathProjectState = {
		...state,
		claims: state.claims.map((candidate) =>
			candidate.id === input.claimId
				? {
						...candidate,
						statement: revisedStatement,
						status: "needs_review",
						updatedAt: input.now,
					}
				: candidate,
		),
		claimRevisions: [...state.claimRevisions, revision],
		updatedAt: input.now,
	};
	nextState = addReviewQueueItem(nextState, {
		id: `review-${state.reviewQueue.length + 1}`,
		claimId: input.claimId,
		reason: "Claim was revised and needs reviewer validation.",
		now: input.now,
		actor: input.actor,
	});
	return appendEvent(nextState, {
		kind: "claim_revised",
		actor: input.actor,
		summary: `Revised claim ${input.claimId}: ${reason}`,
		subjectId: input.claimId,
		relatedIds: [input.id],
		now: input.now,
	});
}

export function addWorkingPaperSection(
	state: CoMathProjectState,
	input: AddWorkingPaperSectionInput,
): CoMathProjectState {
	const title = input.title.trim();
	const body = input.body.trim();
	if (!title) {
		throw new Error("Working paper section requires a title.");
	}
	if (!body) {
		throw new Error("Working paper section requires a body.");
	}
	const section: WorkingPaperSection = {
		id: input.id,
		title,
		body,
		status: input.status ?? "draft",
		sourceClaimIds: uniqueStrings(input.sourceClaimIds ?? []),
		sourceEvidenceIds: uniqueStrings(input.sourceEvidenceIds ?? []),
		sourceWarningIds: uniqueStrings(input.sourceWarningIds ?? []),
		sourceArtifactIds: uniqueStrings(input.sourceArtifactIds ?? []),
		sourceReviewRoundIds: uniqueStrings(input.sourceReviewRoundIds ?? []),
		sourceRoleRunIds: uniqueStrings(input.sourceRoleRunIds ?? []),
		marginNoteIds: [],
		createdAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			workingPaperSections: [...state.workingPaperSections, section],
			updatedAt: input.now,
		},
		{
			kind: "working_paper_section_recorded",
			actor: input.actor,
			summary: `Recorded working-paper section ${input.id}: ${title}`,
			subjectId: input.id,
			relatedIds: [
				...section.sourceClaimIds,
				...section.sourceEvidenceIds,
				...section.sourceWarningIds,
				...section.sourceArtifactIds,
				...section.sourceReviewRoundIds,
				...section.sourceRoleRunIds,
			],
			now: input.now,
		},
	);
}

export function addMarginNote(state: CoMathProjectState, input: AddMarginNoteInput): CoMathProjectState {
	const subjectId = input.subjectId.trim();
	const message = input.message.trim();
	if (!subjectId) {
		throw new Error("Margin note requires a subject id.");
	}
	if (!message) {
		throw new Error("Margin note requires a message.");
	}
	const note: MarginNote = {
		id: input.id,
		kind: input.kind,
		status: "open",
		subjectId,
		...(input.sectionId ? { sectionId: input.sectionId } : {}),
		message,
		createdAt: input.now,
		updatedAt: input.now,
	};
	const nextSections = state.workingPaperSections.map((section) =>
		section.id === input.sectionId
			? {
					...section,
					marginNoteIds: uniqueStrings([...section.marginNoteIds, input.id]),
					updatedAt: input.now,
				}
			: section,
	);
	return appendEvent(
		{
			...state,
			workingPaperSections: nextSections,
			marginNotes: [...state.marginNotes, note],
			updatedAt: input.now,
		},
		{
			kind: "margin_note_recorded",
			actor: input.actor,
			summary: `Recorded margin note ${input.id} for ${subjectId}: ${message}`,
			subjectId: input.id,
			relatedIds: input.sectionId ? [subjectId, input.sectionId] : [subjectId],
			now: input.now,
		},
	);
}

export function resolveMarginNote(state: CoMathProjectState, input: ResolveMarginNoteInput): CoMathProjectState {
	const note = state.marginNotes.find((candidate) => candidate.id === input.noteId);
	if (!note) {
		throw new Error(`Unknown margin note: ${input.noteId}`);
	}
	if (note.status === "resolved") {
		return state;
	}
	const resolution = input.resolution.trim();
	if (!resolution) {
		throw new Error("Resolving a margin note requires a resolution.");
	}
	return appendEvent(
		{
			...state,
			marginNotes: state.marginNotes.map((candidate) =>
				candidate.id === input.noteId
					? {
							...candidate,
							status: "resolved",
							resolution,
							resolvedAt: input.now,
							updatedAt: input.now,
						}
					: candidate,
			),
			updatedAt: input.now,
		},
		{
			kind: "margin_note_resolved",
			actor: input.actor,
			summary: `Resolved margin note ${input.noteId}: ${resolution}`,
			subjectId: input.noteId,
			relatedIds: [note.subjectId, ...(note.sectionId ? [note.sectionId] : [])],
			now: input.now,
		},
	);
}

export function isClaimSynthesisEligible(state: CoMathProjectState, claimId: string): boolean {
	const claim = findClaim(state, claimId);
	return claim.status === "proved" && hasAttachedProofEvidence(state, claim) && !hasAttachedOpenWarning(state, claim);
}

export function serializeProjectState(state: CoMathProjectState): string {
	return `${JSON.stringify(state, null, "	")}\n`;
}

export function getDefaultStatePath(cwd: string): string {
	return path.join(cwd, ".pi", "co-math", "state.json");
}

export async function saveProjectState(statePath: string, state: CoMathProjectState): Promise<void> {
	await mkdir(path.dirname(statePath), { recursive: true });
	await writeFile(statePath, serializeProjectState(state), "utf8");
}

export async function loadProjectState(statePath: string): Promise<CoMathProjectState | undefined> {
	try {
		return normalizeProjectState(JSON.parse(await readFile(statePath, "utf8")) as LegacyProjectState);
	} catch (error) {
		if (isMissingFileError(error)) {
			return undefined;
		}
		throw error;
	}
}

function normalizeProjectState(value: LegacyProjectState): CoMathProjectState {
	return {
		...value,
		workstreams: value.workstreams.map(normalizeWorkstream),
		artifacts: value.artifacts ?? [],
		events: value.events ?? [],
		roleRuns: (value.roleRuns ?? []).map(normalizeRoleRun),
		reviewRounds: value.reviewRounds ?? [],
		claimRevisions: value.claimRevisions ?? [],
		workingPaperSections: value.workingPaperSections ?? [],
		marginNotes: value.marginNotes ?? [],
	};
}

function normalizeWorkstream(value: LegacyWorkstream): Workstream {
	return {
		...value,
		status: value.status ?? "active",
		...(value.statusReason ? { statusReason: value.statusReason } : {}),
		latestRunIds: value.latestRunIds ?? [],
	};
}

function normalizeRoleRun(value: LegacyRoleRun): RoleRunRecord {
	return {
		...value,
		queuedAt: value.queuedAt ?? value.startedAt ?? value.updatedAt,
		...(value.executionMode
			? { executionMode: value.executionMode }
			: value.startedAt && value.status !== "queued" && value.status !== "cancelled"
				? { executionMode: "foreground" as const }
				: {}),
	};
}

function appendEvent(state: CoMathProjectState, input: AppendEventInput): CoMathProjectState {
	return {
		...state,
		events: [
			...state.events,
			{
				id: `event-${state.events.length + 1}`,
				kind: input.kind,
				actor: input.actor ?? "system",
				summary: input.summary,
				...(input.subjectId ? { subjectId: input.subjectId } : {}),
				relatedIds: input.relatedIds ?? [],
				createdAt: input.now,
			},
		],
		updatedAt: input.now,
	};
}

function assertClaimExists(state: CoMathProjectState, claimId: string): void {
	findClaim(state, claimId);
}

function findClaim(state: CoMathProjectState, claimId: string): Claim {
	const claim = state.claims.find((candidate) => candidate.id === claimId);
	if (!claim) {
		throw new Error(`Unknown claim: ${claimId}`);
	}
	return claim;
}

function findRoleRun(state: CoMathProjectState, runId: string): RoleRunRecord {
	const run = state.roleRuns.find((candidate) => candidate.id === runId);
	if (!run) {
		throw new Error(`Unknown role run: ${runId}`);
	}
	return run;
}

function relatedRunTargetIds(run: RoleRunRecord): string[] {
	return [run.targetWorkstreamId, run.targetClaimId].filter((id) => id !== undefined);
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(new Set(values));
}

function hasAttachedProofEvidence(state: CoMathProjectState, claim: Claim): boolean {
	return claim.evidenceIds.some((evidenceId) => {
		const evidence = state.evidence.find((candidate) => candidate.id === evidenceId);
		return evidence?.kind === "proof";
	});
}

function hasAttachedOpenWarning(state: CoMathProjectState, claim: Claim): boolean {
	return claim.warningIds.some((warningId) => {
		const warning = state.warnings.find((candidate) => candidate.id === warningId);
		return warning?.status === "open";
	});
}

function isMissingFileError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
