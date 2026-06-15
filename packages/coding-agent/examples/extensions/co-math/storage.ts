import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
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
	GoalStatus,
	LiteratureClaimSupport,
	LiteratureClaimSupportStatus,
	LiteratureSourceArtifact,
	LiteratureSourceKind,
	MarginNote,
	MarginNoteKind,
	Report,
	ReportReviewOutcome,
	ReportReviewRoundRecord,
	ResearchFocus,
	ResearchPath,
	ResearchPathStatus,
	ResearchWorkstreamIncrementalReportRecord,
	ResearchWorkstreamReportRecord,
	ResearchWorkstreamReportStatus,
	ResearchWorkstreamRunRecord,
	ResearchWorkstreamRunStage,
	ResearchWorkstreamRunStatus,
	ResearchWorkstreamStepRecord,
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
	| "approvedGoals"
	| "artifacts"
	| "claims"
	| "events"
	| "evidence"
	| "reportReviewRounds"
	| "reports"
	| "reviewQueue"
	| "roleRuns"
	| "warnings"
	| "workstreams"
	| "workingPaperSections"
	| "marginNotes"
	| "researchPaths"
	| "researchReports"
	| "researchWorkstreamRuns"
	| "literatureSources"
	| "literatureClaimSupports"
	| "researchFocus"
> &
	Partial<
		Omit<
			Pick<
				CoMathProjectState,
				| "approvedGoals"
				| "artifacts"
				| "claims"
				| "events"
				| "evidence"
				| "reportReviewRounds"
				| "reports"
				| "reviewQueue"
				| "reviewRounds"
				| "claimRevisions"
				| "warnings"
				| "workingPaperSections"
				| "marginNotes"
				| "researchPaths"
				| "researchReports"
				| "researchWorkstreamRuns"
				| "literatureSources"
				| "literatureClaimSupports"
				| "researchFocus"
			>,
			"roleRuns"
		>
	> & {
		roleRuns?: LegacyRoleRun[];
		workstreams?: LegacyWorkstream[];
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
	status?: GoalStatus;
}

export interface SetGoalStatusInput {
	goalId: string;
	status: GoalStatus;
	reason?: string;
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
	sourcePath?: string;
	sourcePathKind?: "workspace" | "absolute";
	relatedClaimIds?: string[];
	relatedWorkstreamIds?: string[];
	relatedReportIds?: string[];
	now: string;
	actor?: CoMathActor;
}

export interface AddResearchPathInput {
	id?: string;
	title: string;
	objective: string;
	suggestedNextMove: string;
	priority: number;
	status?: ResearchPathStatus;
	latestFindings?: string[];
	blockers?: string[];
	now: string;
	actor?: CoMathActor;
}

export interface UpdateResearchPathInput {
	pathId: string;
	status?: ResearchPathStatus;
	latestFindings?: string[];
	blockers?: string[];
	suggestedNextMove?: string;
	priority?: number;
	now: string;
	actor?: CoMathActor;
}

export interface SetResearchFocusInput {
	pathIds: string[];
	reason: string;
	now: string;
	actor?: CoMathActor;
}

export interface AddResearchWorkstreamReportInput {
	id?: string;
	pathId: string;
	pathTitle: string;
	status: ResearchWorkstreamReportStatus;
	startedAt: string;
	completedAt: string;
	coordinatorBrief: string;
	steps: ResearchWorkstreamStepRecord[];
	promisingStrategy: string[];
	findings: string[];
	criticisms: string[];
	gaps: string[];
	humanHelpUseful: string[];
	suggestedNextMove: string;
	workingPaperSectionTitle: string;
	workingPaperSectionId?: string;
	sourceIds?: string[];
	claimSupportIds?: string[];
	now: string;
	actor?: CoMathActor;
}

export interface AddLiteratureSourceArtifactInput {
	id?: string;
	kind?: LiteratureSourceKind;
	title: string;
	url?: string;
	path?: string;
	authors?: string[];
	year?: string;
	summary: string;
	extractedText?: string;
	now: string;
	actor?: CoMathActor;
}

export interface AddLiteratureClaimSupportInput {
	id?: string;
	pathId?: string;
	reportId?: string;
	claim: string;
	sourceIds: string[];
	status: LiteratureClaimSupportStatus;
	note?: string;
	now: string;
	actor?: CoMathActor;
}

export interface AddResearchWorkstreamRunInput {
	id?: string;
	pathId: string;
	pathTitle: string;
	status?: ResearchWorkstreamRunStatus;
	currentStage?: ResearchWorkstreamRunStage;
	now: string;
	actor?: CoMathActor;
	usedFallback?: boolean;
}

export interface UpdateResearchWorkstreamRunInput {
	runId: string;
	status?: ResearchWorkstreamRunStatus;
	currentStage?: ResearchWorkstreamRunStage;
	completedAt?: string;
	finalReportId?: string;
	failureReason?: string;
	usedFallback?: boolean;
	now: string;
	actor?: CoMathActor;
}

export interface AddResearchWorkstreamIncrementalReportInput {
	runId: string;
	id?: string;
	stage: ResearchWorkstreamRunStage;
	status: ResearchWorkstreamIncrementalReportRecord["status"];
	title: string;
	summary: string;
	details: string[];
	now: string;
	actor?: CoMathActor;
}

export interface FailStaleResearchWorkstreamRunsInput {
	activeRunIds: readonly string[];
	now: string;
	actor?: CoMathActor;
	reason?: string;
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
	transcriptPath?: string;
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
	transcriptPath?: string;
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

export interface AddReportReviewRoundInput {
	id: string;
	reportId: string;
	roleRunId: string;
	outcome: ReportReviewOutcome;
	summary: string;
	createdWarningIds?: string[];
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

export interface UpsertWorkingPaperSectionByTitleInput {
	title: string;
	body: string;
	status?: WorkingPaperSectionStatus;
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

export interface RecordWorkingPaperExportInput {
	artifactId: string;
	path: string;
	title: string;
	summary: string;
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
		reportReviewRounds: [],
		claimRevisions: [],
		workingPaperSections: [],
		marginNotes: [],
		researchPaths: [],
		researchReports: [],
		researchWorkstreamRuns: [],
		literatureSources: [],
		literatureClaimSupports: [],
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
					status: input.status ?? "active",
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

export function setGoalStatus(state: CoMathProjectState, input: SetGoalStatusInput): CoMathProjectState {
	const goal = state.approvedGoals.find((candidate) => candidate.id === input.goalId);
	if (!goal) {
		throw new Error(`Unknown goal: ${input.goalId}`);
	}
	if (goal.status === input.status) {
		return state;
	}
	const reason = input.reason?.trim();
	return appendEvent(
		{
			...state,
			approvedGoals: state.approvedGoals.map((candidate) =>
				candidate.id === input.goalId
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
			kind: "goal_status_changed",
			actor: input.actor,
			summary: `Set ${input.goalId} status to ${input.status}${reason ? `: ${reason}` : ""}`,
			subjectId: input.goalId,
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
		...(input.sourcePath ? { sourcePath: input.sourcePath } : {}),
		...(input.sourcePathKind ? { sourcePathKind: input.sourcePathKind } : {}),
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

export function addResearchPath(state: CoMathProjectState, input: AddResearchPathInput): CoMathProjectState {
	const pathRecord: ResearchPath = {
		id: input.id ?? `path-${state.researchPaths.length + 1}`,
		title: input.title,
		objective: input.objective,
		status: input.status ?? "active",
		latestFindings: input.latestFindings ?? [],
		blockers: input.blockers ?? [],
		suggestedNextMove: input.suggestedNextMove,
		priority: input.priority,
		createdAt: input.now,
		updatedAt: input.now,
	};

	return appendEvent(
		{
			...state,
			researchPaths: [...state.researchPaths, pathRecord],
			updatedAt: input.now,
		},
		{
			kind: "human_intervention_recorded",
			actor: input.actor,
			summary: `Added research path ${pathRecord.id}: ${pathRecord.title}`,
			subjectId: pathRecord.id,
			now: input.now,
		},
	);
}

export function updateResearchPath(state: CoMathProjectState, input: UpdateResearchPathInput): CoMathProjectState {
	if (!state.researchPaths.some((pathRecord) => pathRecord.id === input.pathId)) {
		return state;
	}
	return appendEvent(
		{
			...state,
			researchPaths: state.researchPaths.map((pathRecord) =>
				pathRecord.id === input.pathId
					? {
							...pathRecord,
							...(input.status ? { status: input.status } : {}),
							...(input.latestFindings ? { latestFindings: input.latestFindings } : {}),
							...(input.blockers ? { blockers: input.blockers } : {}),
							...(input.suggestedNextMove ? { suggestedNextMove: input.suggestedNextMove } : {}),
							...(input.priority !== undefined ? { priority: input.priority } : {}),
							updatedAt: input.now,
						}
					: pathRecord,
			),
			updatedAt: input.now,
		},
		{
			kind: "human_intervention_recorded",
			actor: input.actor,
			summary: `Updated research path ${input.pathId}`,
			subjectId: input.pathId,
			now: input.now,
		},
	);
}

export function setResearchFocus(state: CoMathProjectState, input: SetResearchFocusInput): CoMathProjectState {
	const knownPathIds = new Set(state.researchPaths.map((pathRecord) => pathRecord.id));
	const pathIds = uniqueStrings(input.pathIds.filter((pathId) => knownPathIds.has(pathId)));
	const focus: ResearchFocus = {
		pathIds,
		reason: input.reason,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			researchFocus: focus,
			updatedAt: input.now,
		},
		{
			kind: "human_intervention_recorded",
			actor: input.actor,
			summary: `Updated research focus: ${input.reason}`,
			relatedIds: pathIds,
			now: input.now,
		},
	);
}

export function addResearchWorkstreamReport(
	state: CoMathProjectState,
	input: AddResearchWorkstreamReportInput,
): CoMathProjectState {
	const pathId = input.pathId.trim();
	const pathTitle = input.pathTitle.trim();
	if (!pathId) {
		throw new Error("Research workstream report requires a path id.");
	}
	if (!pathTitle) {
		throw new Error("Research workstream report requires a path title.");
	}
	const id = input.id?.trim() || `research-report-${state.researchReports.length + 1}`;
	if (state.researchReports.some((report) => report.id === id)) {
		throw new Error(`Duplicate research workstream report id: ${id}`);
	}
	const report: ResearchWorkstreamReportRecord = {
		id,
		kind: "research_workstream",
		pathId,
		pathTitle,
		status: input.status,
		startedAt: input.startedAt,
		completedAt: input.completedAt,
		coordinatorBrief: input.coordinatorBrief,
		steps: input.steps.map((step) => ({ ...step, details: [...step.details] })),
		promisingStrategy: [...input.promisingStrategy],
		findings: [...input.findings],
		criticisms: [...input.criticisms],
		gaps: [...input.gaps],
		humanHelpUseful: [...input.humanHelpUseful],
		suggestedNextMove: input.suggestedNextMove,
		workingPaperSectionTitle: input.workingPaperSectionTitle,
		...(input.workingPaperSectionId ? { workingPaperSectionId: input.workingPaperSectionId } : {}),
		sourceIds: uniqueStrings(input.sourceIds ?? []),
		claimSupportIds: uniqueStrings(input.claimSupportIds ?? []),
		createdAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			researchReports: [...state.researchReports, report],
			updatedAt: input.now,
		},
		{
			kind: "research_workstream_recorded",
			actor: input.actor,
			summary: `Recorded research workstream report ${id} for ${pathTitle}`,
			subjectId: id,
			relatedIds: [pathId],
			now: input.now,
		},
	);
}

export function getLatestResearchWorkstreamReport(
	state: CoMathProjectState,
): ResearchWorkstreamReportRecord | undefined {
	return state.researchReports.at(-1);
}

export function getLatestResearchWorkstreamReportForPath(
	state: CoMathProjectState,
	pathId: string,
): ResearchWorkstreamReportRecord | undefined {
	return [...state.researchReports].reverse().find((report) => report.pathId === pathId);
}

export function addLiteratureSourceArtifact(
	state: CoMathProjectState,
	input: AddLiteratureSourceArtifactInput,
): CoMathProjectState {
	const title = input.title.trim();
	const summary = input.summary.trim();
	if (!title) {
		throw new Error("Literature source requires a title.");
	}
	if (!summary) {
		throw new Error("Literature source requires a summary.");
	}
	const url = input.url?.trim();
	const sourcePath = input.path?.trim();
	const duplicate = state.literatureSources.find((source) => {
		if (url && source.url === url) return true;
		if (sourcePath && source.path === sourcePath) return true;
		return !url && !sourcePath && source.title.toLowerCase() === title.toLowerCase();
	});
	if (duplicate) {
		return state;
	}
	const id = input.id?.trim() || `source-${state.literatureSources.length + 1}`;
	if (state.literatureSources.some((source) => source.id === id)) {
		throw new Error(`Duplicate literature source id: ${id}`);
	}
	const source: LiteratureSourceArtifact = {
		id,
		kind: input.kind ?? "unknown",
		title,
		...(url ? { url } : {}),
		...(sourcePath ? { path: sourcePath } : {}),
		authors: [...(input.authors ?? [])],
		...(input.year?.trim() ? { year: input.year.trim() } : {}),
		summary,
		...(input.extractedText?.trim() ? { extractedText: input.extractedText.trim() } : {}),
		createdAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			literatureSources: [...state.literatureSources, source],
			updatedAt: input.now,
		},
		{
			kind: "literature_source_recorded",
			actor: input.actor,
			summary: `Recorded literature source ${id}: ${title}`,
			subjectId: id,
			now: input.now,
		},
	);
}

export function addLiteratureClaimSupport(
	state: CoMathProjectState,
	input: AddLiteratureClaimSupportInput,
): CoMathProjectState {
	const claim = input.claim.trim();
	if (!claim) {
		throw new Error("Literature claim support requires a claim.");
	}
	const sourceIds = uniqueStrings(input.sourceIds);
	const id = input.id?.trim() || `claim-support-${state.literatureClaimSupports.length + 1}`;
	if (state.literatureClaimSupports.some((support) => support.id === id)) {
		throw new Error(`Duplicate literature claim support id: ${id}`);
	}
	const support: LiteratureClaimSupport = {
		id,
		...(input.pathId?.trim() ? { pathId: input.pathId.trim() } : {}),
		...(input.reportId?.trim() ? { reportId: input.reportId.trim() } : {}),
		claim,
		sourceIds,
		status: input.status,
		...(input.note?.trim() ? { note: input.note.trim() } : {}),
		createdAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			literatureClaimSupports: [...state.literatureClaimSupports, support],
			updatedAt: input.now,
		},
		{
			kind: "literature_claim_support_recorded",
			actor: input.actor,
			summary: `Recorded literature support ${id}: ${claim}`,
			subjectId: id,
			relatedIds: sourceIds,
			now: input.now,
		},
	);
}

export function getLiteratureSourcesForReport(state: CoMathProjectState, reportId: string): LiteratureSourceArtifact[] {
	const report = state.researchReports.find((candidate) => candidate.id === reportId);
	const sourceIds = new Set(report?.sourceIds ?? []);
	return state.literatureSources.filter((source) => sourceIds.has(source.id));
}

export function getLiteratureClaimSupportsForReportOrPath(
	state: CoMathProjectState,
	input: { reportId?: string; pathId?: string },
): LiteratureClaimSupport[] {
	return state.literatureClaimSupports.filter(
		(support) =>
			(input.reportId !== undefined && support.reportId === input.reportId) ||
			(input.pathId !== undefined && support.pathId === input.pathId),
	);
}

export function addResearchWorkstreamRun(
	state: CoMathProjectState,
	input: AddResearchWorkstreamRunInput,
): CoMathProjectState {
	const pathId = input.pathId.trim();
	const pathTitle = input.pathTitle.trim();
	if (!pathId) {
		throw new Error("Research workstream run requires a path id.");
	}
	if (!pathTitle) {
		throw new Error("Research workstream run requires a path title.");
	}
	const id = input.id?.trim() || `research-run-${state.researchWorkstreamRuns.length + 1}`;
	if (state.researchWorkstreamRuns.some((run) => run.id === id)) {
		throw new Error(`Duplicate research workstream run id: ${id}`);
	}
	const run: ResearchWorkstreamRunRecord = {
		id,
		pathId,
		pathTitle,
		status: input.status ?? "running",
		currentStage: input.currentStage ?? "coordinator",
		startedAt: input.now,
		updatedAt: input.now,
		incrementalReports: [],
		...(input.usedFallback !== undefined ? { usedFallback: input.usedFallback } : {}),
	};
	return appendEvent(
		{
			...state,
			researchWorkstreamRuns: [...state.researchWorkstreamRuns, run],
			updatedAt: input.now,
		},
		{
			kind: "research_workstream_run_recorded",
			actor: input.actor,
			summary: `Started research workstream run for ${pathTitle}`,
			subjectId: id,
			relatedIds: [pathId],
			now: input.now,
		},
	);
}

export function updateResearchWorkstreamRun(
	state: CoMathProjectState,
	input: UpdateResearchWorkstreamRunInput,
): CoMathProjectState {
	if (!state.researchWorkstreamRuns.some((run) => run.id === input.runId)) {
		return state;
	}
	return appendEvent(
		{
			...state,
			researchWorkstreamRuns: state.researchWorkstreamRuns.map((run) =>
				run.id === input.runId
					? {
							...run,
							...(input.status ? { status: input.status } : {}),
							...(input.currentStage ? { currentStage: input.currentStage } : {}),
							...(input.completedAt ? { completedAt: input.completedAt } : {}),
							...(input.finalReportId ? { finalReportId: input.finalReportId } : {}),
							...(input.failureReason ? { failureReason: input.failureReason } : {}),
							...(input.usedFallback !== undefined ? { usedFallback: input.usedFallback } : {}),
							updatedAt: input.now,
						}
					: run,
			),
			updatedAt: input.now,
		},
		{
			kind: "research_workstream_run_recorded",
			actor: input.actor,
			summary: `Updated research workstream run ${input.runId}`,
			subjectId: input.runId,
			now: input.now,
		},
	);
}

export function addResearchWorkstreamIncrementalReport(
	state: CoMathProjectState,
	input: AddResearchWorkstreamIncrementalReportInput,
): CoMathProjectState {
	const run = state.researchWorkstreamRuns.find((candidate) => candidate.id === input.runId);
	if (!run) {
		throw new Error(`Unknown research workstream run: ${input.runId}`);
	}
	const title = input.title.trim();
	const summary = input.summary.trim();
	if (!title) {
		throw new Error("Research workstream incremental report requires a title.");
	}
	if (!summary) {
		throw new Error("Research workstream incremental report requires a summary.");
	}
	const report: ResearchWorkstreamIncrementalReportRecord = {
		id: input.id?.trim() || `${run.id}-incremental-${run.incrementalReports.length + 1}`,
		stage: input.stage,
		status: input.status,
		title,
		summary,
		details: [...input.details],
		createdAt: input.now,
	};
	return appendEvent(
		{
			...state,
			researchWorkstreamRuns: state.researchWorkstreamRuns.map((candidate) =>
				candidate.id === input.runId
					? {
							...candidate,
							status: input.status === "running" ? "running" : candidate.status,
							currentStage: input.stage,
							incrementalReports: [...candidate.incrementalReports, report],
							updatedAt: input.now,
						}
					: candidate,
			),
			updatedAt: input.now,
		},
		{
			kind: "research_workstream_run_recorded",
			actor: input.actor,
			summary: `Recorded ${input.stage} progress for ${run.pathTitle}`,
			subjectId: input.runId,
			relatedIds: [run.pathId],
			now: input.now,
		},
	);
}

export const STALE_RESEARCH_WORKSTREAM_RUN_REASON = "Previous Pi session ended before completion.";

export function failStaleResearchWorkstreamRuns(
	state: CoMathProjectState,
	input: FailStaleResearchWorkstreamRunsInput,
): CoMathProjectState {
	const activeRunIds = new Set(input.activeRunIds);
	const reason = input.reason?.trim() || STALE_RESEARCH_WORKSTREAM_RUN_REASON;
	let nextState = state;
	for (const run of state.researchWorkstreamRuns) {
		if ((run.status === "queued" || run.status === "running") && !activeRunIds.has(run.id)) {
			nextState = updateResearchWorkstreamRun(nextState, {
				runId: run.id,
				status: "failed",
				failureReason: reason,
				now: input.now,
				actor: input.actor,
			});
		}
	}
	return nextState;
}

export function getLatestResearchWorkstreamRun(state: CoMathProjectState): ResearchWorkstreamRunRecord | undefined {
	return state.researchWorkstreamRuns.at(-1);
}

export function getActiveResearchWorkstreamRun(state: CoMathProjectState): ResearchWorkstreamRunRecord | undefined {
	return state.researchWorkstreamRuns.find((run) => run.status === "queued" || run.status === "running");
}

export function getActiveResearchPaths(state: CoMathProjectState): ResearchPath[] {
	return state.researchPaths.filter(
		(pathRecord) => pathRecord.status === "active" || pathRecord.status === "promising",
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
		...(input.transcriptPath ? { transcriptPath: input.transcriptPath } : {}),
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
							...(input.transcriptPath ? { transcriptPath: input.transcriptPath } : {}),
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

export function addReportReviewRound(state: CoMathProjectState, input: AddReportReviewRoundInput): CoMathProjectState {
	const reportReviewRound: ReportReviewRoundRecord = {
		id: input.id,
		reportId: input.reportId,
		roleRunId: input.roleRunId,
		status: "completed",
		outcome: input.outcome,
		summary: input.summary,
		createdWarningIds: input.createdWarningIds ?? [],
		createdAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			reportReviewRounds: [...state.reportReviewRounds, reportReviewRound],
			updatedAt: input.now,
		},
		{
			kind: "report_review_round_recorded",
			actor: input.actor,
			summary: `Recorded report review round ${input.id} for ${input.reportId}: ${input.outcome}`,
			subjectId: input.id,
			relatedIds: [input.reportId, input.roleRunId, ...reportReviewRound.createdWarningIds].filter(
				(relatedId) => relatedId.length > 0,
			),
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

export function upsertWorkingPaperSectionByTitle(
	state: CoMathProjectState,
	input: UpsertWorkingPaperSectionByTitleInput,
): CoMathProjectState {
	const title = input.title.trim();
	const body = input.body.trim();
	if (!title) {
		throw new Error("Working paper section requires a title.");
	}
	if (!body) {
		throw new Error("Working paper section requires a body.");
	}
	const existing = state.workingPaperSections.find(
		(section) => section.title.trim().toLowerCase() === title.toLowerCase(),
	);
	if (!existing) {
		return addWorkingPaperSection(state, {
			id: `paper-section-${state.workingPaperSections.length + 1}`,
			title,
			body,
			status: input.status,
			now: input.now,
			actor: input.actor,
		});
	}
	const nextBody = existing.body.includes(body) ? existing.body : `${existing.body}\n\n${body}`;
	return appendEvent(
		{
			...state,
			workingPaperSections: state.workingPaperSections.map((section) =>
				section.id === existing.id
					? {
							...section,
							body: nextBody,
							status: input.status ?? section.status,
							updatedAt: input.now,
						}
					: section,
			),
			updatedAt: input.now,
		},
		{
			kind: "working_paper_section_recorded",
			actor: input.actor,
			summary: `Updated working-paper section ${existing.id}: ${title}`,
			subjectId: existing.id,
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

export function recordWorkingPaperExport(
	state: CoMathProjectState,
	input: RecordWorkingPaperExportInput,
): CoMathProjectState {
	const artifactPath = input.path.trim();
	const title = input.title.trim();
	const summary = input.summary.trim();
	if (!artifactPath) {
		throw new Error("Working paper export requires a path.");
	}
	if (!title) {
		throw new Error("Working paper export requires a title.");
	}
	if (!summary) {
		throw new Error("Working paper export requires a summary.");
	}
	const withArtifact = addArtifact(state, {
		id: input.artifactId,
		kind: "working_paper_export",
		title,
		summary,
		path: artifactPath,
		now: input.now,
		actor: input.actor,
	});
	const openWarningIds = withArtifact.warnings
		.filter((warning) => warning.status === "open")
		.map((warning) => warning.id);
	const openMarginNoteIds = withArtifact.marginNotes.filter((note) => note.status === "open").map((note) => note.id);
	return appendEvent(withArtifact, {
		kind: "working_paper_exported",
		actor: input.actor,
		summary: `Exported living working paper to ${artifactPath}`,
		subjectId: input.artifactId,
		relatedIds: [
			...withArtifact.workingPaperSections.map((section) => section.id),
			...openWarningIds,
			...openMarginNoteIds,
		],
		now: input.now,
	});
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
	// Write to a unique temp file then rename so a concurrent loadProjectState (e.g. a background
	// role-run finalize) never reads a half-written file. Rename is atomic on the same filesystem.
	// A random name plus exclusive create ("wx") avoids collisions between concurrent writers.
	const tempPath = `${statePath}.${randomUUID()}.tmp`;
	try {
		await writeFile(tempPath, serializeProjectState(state), { encoding: "utf8", flag: "wx" });
		await rename(tempPath, statePath);
	} catch (error) {
		await rm(tempPath, { force: true }).catch(() => {});
		throw error;
	}
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
	const updatedAt = getStringField(value, "updatedAt", new Date(0).toISOString());
	const reports = getArrayField(value, "reports").map((record) => normalizeReport(record, updatedAt));
	const roleRuns = (value.roleRuns ?? []).map(normalizeRoleRun);
	const normalizedState: CoMathProjectState = {
		...value,
		version: 1,
		projectId: getStringField(value, "projectId", "co-math-legacy"),
		title: getStringField(value, "title", getStringField(value, "rootQuestion", "Untitled co-math project")),
		rootQuestion: getStringField(value, "rootQuestion", getStringField(value, "title", "Untitled co-math project")),
		approvedGoals: getArrayField(value, "approvedGoals").map((record) => normalizeGoal(record, updatedAt)),
		workstreams: (value.workstreams ?? []).map((workstream) => normalizeWorkstream(workstream, updatedAt)),
		claims: getArrayField(value, "claims").map((record) => normalizeClaim(record, updatedAt)),
		evidence: getArrayField(value, "evidence").map((record) => normalizeEvidence(record, updatedAt)),
		warnings: getArrayField(value, "warnings").map((record) => normalizeWarning(record, updatedAt)),
		reports,
		reviewQueue: getArrayField(value, "reviewQueue").map((record) => normalizeReviewQueueItem(record, updatedAt)),
		artifacts: getArrayField(value, "artifacts").map((record) => normalizeArtifact(record, updatedAt)),
		events: getArrayField(value, "events").map((record) => normalizeEvent(record, updatedAt)),
		roleRuns,
		reviewRounds: getArrayField(value, "reviewRounds")
			.filter(isCurrentReviewRoundRecord)
			.map((record) => normalizeReviewRound(record, updatedAt)),
		reportReviewRounds: [
			...getArrayField(value, "reportReviewRounds").map((record) => normalizeReportReviewRound(record, updatedAt)),
			...getArrayField(value, "reviewRounds")
				.filter((record) => !isCurrentReviewRoundRecord(record))
				.map((record) => normalizeLegacyReportReviewRound(record, reports, roleRuns, updatedAt)),
		],
		claimRevisions: getArrayField(value, "claimRevisions").map((record) => normalizeClaimRevision(record, updatedAt)),
		workingPaperSections: getArrayField(value, "workingPaperSections").map((record) =>
			normalizeWorkingPaperSection(record, updatedAt),
		),
		marginNotes: getArrayField(value, "marginNotes").map((record) => normalizeMarginNote(record, updatedAt)),
		researchPaths: getArrayField(value, "researchPaths").map((record, index) =>
			normalizeResearchPath(record, updatedAt, index),
		),
		researchReports: getArrayField(value, "researchReports").map((record, index) =>
			normalizeResearchWorkstreamReport(record, updatedAt, index),
		),
		researchWorkstreamRuns: getArrayField(value, "researchWorkstreamRuns").map((record, index) =>
			normalizeResearchWorkstreamRun(record, updatedAt, index),
		),
		literatureSources: getArrayField(value, "literatureSources").map((record, index) =>
			normalizeLiteratureSourceArtifact(record, updatedAt, index),
		),
		literatureClaimSupports: getArrayField(value, "literatureClaimSupports").map((record, index) =>
			normalizeLiteratureClaimSupport(record, updatedAt, index),
		),
		...(normalizeResearchFocus(value.researchFocus, updatedAt)
			? { researchFocus: normalizeResearchFocus(value.researchFocus, updatedAt) }
			: {}),
		updatedAt,
	};
	return normalizeClaimRelationshipsAndProofStatus(normalizedState);
}

function normalizeClaimRelationshipsAndProofStatus(state: CoMathProjectState): CoMathProjectState {
	const withRelationships: CoMathProjectState = {
		...state,
		claims: state.claims.map((claim) => ({
			...claim,
			evidenceIds: uniqueStrings([
				...claim.evidenceIds.filter((evidenceId) =>
					state.evidence.some((evidence) => evidence.id === evidenceId && evidence.claimId === claim.id),
				),
				...state.evidence.filter((evidence) => evidence.claimId === claim.id).map((evidence) => evidence.id),
			]),
			warningIds: uniqueStrings([
				...claim.warningIds.filter((warningId) =>
					state.warnings.some((warning) => warning.id === warningId && warning.claimId === claim.id),
				),
				...state.warnings.filter((warning) => warning.claimId === claim.id).map((warning) => warning.id),
			]),
		})),
	};
	return {
		...withRelationships,
		claims: withRelationships.claims.map((claim) =>
			claim.status === "proved" &&
			(!hasAttachedProofEvidence(withRelationships, claim) || hasAttachedOpenWarning(withRelationships, claim))
				? { ...claim, status: "needs_review" }
				: claim,
		),
	};
}

function normalizeGoal(
	value: Record<string, unknown>,
	fallbackTime: string,
): CoMathProjectState["approvedGoals"][number] {
	return {
		id: getStringField(value, "id", "goal-legacy"),
		text: getStringField(value, "text", getStringField(value, "summary", "")),
		status: normalizeGoalStatus(value.status),
		createdAt: getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime)),
		updatedAt: getStringField(value, "updatedAt", fallbackTime),
	};
}

function normalizeWorkstream(value: LegacyWorkstream, fallbackTime: string): Workstream {
	return {
		id: getStringField(value, "id", "workstream-legacy"),
		title: getStringField(value, "title", getStringField(value, "summary", "")),
		status: normalizeWorkstreamStatus(value.status),
		...(getOptionalStringField(value, "statusReason")
			? { statusReason: getOptionalStringField(value, "statusReason") }
			: {}),
		goalIds: getStringArrayField(value, "goalIds"),
		claimIds: getStringArrayField(value, "claimIds"),
		latestReportIds: getStringArrayField(value, "latestReportIds"),
		latestRunIds: value.latestRunIds ?? [],
		createdAt: getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime)),
		updatedAt: getStringField(value, "updatedAt", fallbackTime),
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
		...(getOptionalStringField(value, "transcriptPath")
			? { transcriptPath: getOptionalStringField(value, "transcriptPath") }
			: {}),
	};
}

function normalizeClaim(value: Record<string, unknown>, fallbackTime: string): Claim {
	return {
		id: getStringField(value, "id", "claim-legacy"),
		workstreamId: getStringField(value, "workstreamId", ""),
		statement: getStringField(value, "statement", ""),
		status: normalizeClaimStatus(value.status),
		evidenceIds: getStringArrayField(value, "evidenceIds"),
		warningIds: getStringArrayField(value, "warningIds"),
		createdAt: getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime)),
		updatedAt: getStringField(value, "updatedAt", fallbackTime),
	};
}

function normalizeEvidence(value: Record<string, unknown>, fallbackTime: string): Evidence {
	return {
		id: getStringField(value, "id", "evidence-legacy"),
		claimId: getStringField(value, "claimId", getStringArrayField(value, "claimIds")[0] ?? ""),
		kind: normalizeEvidenceKind(value.kind),
		summary: getStringField(value, "summary", ""),
		createdAt: getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime)),
		updatedAt: getStringField(value, "updatedAt", fallbackTime),
	};
}

function normalizeWarning(value: Record<string, unknown>, fallbackTime: string): Warning {
	return {
		id: getStringField(value, "id", "warning-legacy"),
		claimId: getStringField(value, "claimId", getStringArrayField(value, "claimIds")[0] ?? ""),
		severity: normalizeWarningSeverity(value.severity),
		status: normalizeWarningStatus(value.status),
		message: getStringField(value, "message", getStringField(value, "summary", "")),
		createdAt: getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime)),
		updatedAt: getStringField(value, "updatedAt", fallbackTime),
	};
}

function normalizeReport(value: Record<string, unknown>, fallbackTime: string): Report {
	return {
		id: getStringField(value, "id", "report-legacy"),
		title: getStringField(value, "title", "Legacy report"),
		summary: getStringField(value, "summary", getStringField(value, "status", "")),
		blockers: getStringArrayField(value, "blockers"),
		createdAt: getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime)),
		updatedAt: getStringField(value, "updatedAt", fallbackTime),
	};
}

function normalizeReviewQueueItem(value: Record<string, unknown>, fallbackTime: string): ReviewQueueItem {
	return {
		id: getStringField(value, "id", "review-legacy"),
		claimId: getStringField(value, "claimId", ""),
		reason: getStringField(value, "reason", getStringField(value, "summary", "")),
		createdAt: getStringField(value, "createdAt", fallbackTime),
	};
}

function normalizeArtifact(value: Record<string, unknown>, fallbackTime: string): ArtifactRecord {
	return {
		id: getStringField(value, "id", "artifact-legacy"),
		kind: normalizeArtifactKind(value.kind),
		title: getStringField(value, "title", "Legacy artifact"),
		summary: getStringField(value, "summary", getStringField(value, "sha256", "")),
		...(getOptionalStringField(value, "provenance")
			? { provenance: getOptionalStringField(value, "provenance") }
			: {}),
		...(getOptionalStringField(value, "path") ? { path: getOptionalStringField(value, "path") } : {}),
		...(getOptionalStringField(value, "sourcePath")
			? { sourcePath: getOptionalStringField(value, "sourcePath") }
			: {}),
		...(normalizeSourcePathKind(value.sourcePathKind)
			? { sourcePathKind: normalizeSourcePathKind(value.sourcePathKind) }
			: {}),
		relatedClaimIds: getStringArrayField(value, "relatedClaimIds"),
		relatedWorkstreamIds: getStringArrayField(value, "relatedWorkstreamIds"),
		relatedReportIds: getStringArrayField(value, "relatedReportIds"),
		createdAt: getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime)),
		updatedAt: getStringField(value, "updatedAt", fallbackTime),
	};
}

function normalizeEvent(value: Record<string, unknown>, fallbackTime: string): CoMathProjectState["events"][number] {
	return {
		id: getStringField(value, "id", "event-legacy"),
		kind: normalizeEventKind(value.kind),
		actor: normalizeActor(value.actor),
		summary: getStringField(value, "summary", ""),
		...(getOptionalStringField(value, "subjectId") ? { subjectId: getOptionalStringField(value, "subjectId") } : {}),
		relatedIds: getStringArrayField(value, "relatedIds"),
		createdAt: getStringField(value, "createdAt", fallbackTime),
	};
}

function normalizeReviewRound(value: Record<string, unknown>, fallbackTime: string): ReviewRoundRecord {
	return {
		id: getStringField(value, "id", "review-round-legacy"),
		claimId: getStringField(value, "claimId", ""),
		roleRunId: getStringField(value, "roleRunId", ""),
		reportId: getStringField(value, "reportId", ""),
		status: normalizeReviewRoundStatus(value.status),
		decisionStatus: normalizeClaimStatus(value.decisionStatus),
		outcome: normalizeReviewRoundOutcome(value.outcome),
		createdEvidenceIds: getStringArrayField(value, "createdEvidenceIds"),
		createdWarningIds: getStringArrayField(value, "createdWarningIds"),
		resolvedWarningIds: getStringArrayField(value, "resolvedWarningIds"),
		createdAt: getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime)),
		updatedAt: getStringField(value, "updatedAt", fallbackTime),
	};
}

function normalizeReportReviewRound(value: Record<string, unknown>, fallbackTime: string): ReportReviewRoundRecord {
	return {
		id: getStringField(value, "id", "report-review-legacy"),
		reportId: getStringField(value, "reportId", ""),
		roleRunId: getStringField(value, "roleRunId", ""),
		status: normalizeReportReviewStatus(value.status),
		outcome: normalizeReportReviewOutcome(value.outcome),
		summary: getStringField(value, "summary", ""),
		createdWarningIds: getStringArrayField(value, "createdWarningIds"),
		createdAt: getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime)),
		updatedAt: getStringField(value, "updatedAt", fallbackTime),
	};
}

function normalizeLegacyReportReviewRound(
	value: Record<string, unknown>,
	reports: Report[],
	roleRuns: RoleRunRecord[],
	fallbackTime: string,
): ReportReviewRoundRecord {
	const reportId = getStringField(value, "reportId", reports[0]?.id ?? "");
	return {
		id: getStringField(value, "id", "report-review-legacy"),
		reportId,
		roleRunId: getStringField(value, "roleRunId", roleRuns[0]?.id ?? ""),
		status: normalizeReportReviewStatus(value.status),
		outcome: normalizeReportReviewOutcome(value.outcome),
		summary: getStringField(value, "summary", getStringField(value, "scope", "")),
		createdWarningIds: getStringArrayField(value, "createdWarningIds"),
		createdAt: getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime)),
		updatedAt: getStringField(value, "updatedAt", fallbackTime),
	};
}

function normalizeClaimRevision(value: Record<string, unknown>, fallbackTime: string): ClaimRevisionRecord {
	return {
		id: getStringField(value, "id", "claim-revision-legacy"),
		claimId: getStringField(value, "claimId", ""),
		previousStatement: getStringField(value, "previousStatement", ""),
		revisedStatement: getStringField(value, "revisedStatement", ""),
		reason: getStringField(value, "reason", getStringField(value, "summary", "")),
		actor: normalizeActor(value.actor),
		createdAt: getStringField(value, "createdAt", fallbackTime),
	};
}

function normalizeWorkingPaperSection(value: Record<string, unknown>, fallbackTime: string): WorkingPaperSection {
	return {
		id: getStringField(value, "id", "paper-section-legacy"),
		title: getStringField(value, "title", "Legacy section"),
		body: getStringField(value, "body", getStringField(value, "summary", "")),
		status: normalizeWorkingPaperSectionStatus(value.status),
		sourceClaimIds: getStringArrayField(value, "sourceClaimIds"),
		sourceEvidenceIds: getStringArrayField(value, "sourceEvidenceIds"),
		sourceWarningIds: getStringArrayField(value, "sourceWarningIds"),
		sourceArtifactIds: uniqueStrings([
			...getStringArrayField(value, "sourceArtifactIds"),
			...getStringArrayField(value, "artifactId"),
		]),
		sourceReviewRoundIds: getStringArrayField(value, "sourceReviewRoundIds"),
		sourceRoleRunIds: getStringArrayField(value, "sourceRoleRunIds"),
		marginNoteIds: getStringArrayField(value, "marginNoteIds"),
		createdAt: getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime)),
		updatedAt: getStringField(value, "updatedAt", fallbackTime),
	};
}

function normalizeMarginNote(value: Record<string, unknown>, fallbackTime: string): MarginNote {
	return {
		id: getStringField(value, "id", "margin-note-legacy"),
		kind: normalizeMarginNoteKind(value.kind),
		status: normalizeMarginNoteStatus(value.status),
		subjectId: getStringField(value, "subjectId", "project"),
		...(getOptionalStringField(value, "sectionId") ? { sectionId: getOptionalStringField(value, "sectionId") } : {}),
		message: getStringField(value, "message", getStringField(value, "summary", "")),
		...(getOptionalStringField(value, "resolution")
			? { resolution: getOptionalStringField(value, "resolution") }
			: {}),
		createdAt: getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime)),
		updatedAt: getStringField(value, "updatedAt", fallbackTime),
		...(getOptionalStringField(value, "resolvedAt")
			? { resolvedAt: getOptionalStringField(value, "resolvedAt") }
			: {}),
	};
}

function normalizeResearchPath(value: Record<string, unknown>, fallbackTime: string, index: number): ResearchPath {
	return {
		id: getStringField(value, "id", `path-${index + 1}`),
		title: getStringField(value, "title", "Legacy research path"),
		objective: getStringField(value, "objective", getStringField(value, "summary", "")),
		status: normalizeResearchPathStatus(value.status),
		latestFindings: getStringArrayField(value, "latestFindings"),
		blockers: getStringArrayField(value, "blockers"),
		suggestedNextMove: getStringField(value, "suggestedNextMove", "Identify the next useful research move."),
		priority: getNumberField(value, "priority", index + 1),
		createdAt: getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime)),
		updatedAt: getStringField(value, "updatedAt", fallbackTime),
	};
}

function normalizeResearchWorkstreamReport(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): ResearchWorkstreamReportRecord {
	const createdAt = getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime));
	return {
		id: getStringField(value, "id", `research-report-${index + 1}`),
		kind: "research_workstream",
		pathId: getStringField(value, "pathId", "path-legacy"),
		pathTitle: getStringField(value, "pathTitle", "Research path"),
		status: normalizeResearchWorkstreamReportStatus(value.status),
		startedAt: getStringField(value, "startedAt", createdAt),
		completedAt: getStringField(value, "completedAt", createdAt),
		coordinatorBrief: getStringField(value, "coordinatorBrief", ""),
		steps: getArrayField(value, "steps").map((step) => normalizeResearchWorkstreamStep(step)),
		promisingStrategy: getStringArrayField(value, "promisingStrategy"),
		findings: getStringArrayField(value, "findings"),
		criticisms: getStringArrayField(value, "criticisms"),
		gaps: getStringArrayField(value, "gaps"),
		humanHelpUseful: getStringArrayField(value, "humanHelpUseful"),
		suggestedNextMove: getStringField(value, "suggestedNextMove", ""),
		workingPaperSectionTitle: getStringField(value, "workingPaperSectionTitle", ""),
		...(getOptionalStringField(value, "workingPaperSectionId")
			? { workingPaperSectionId: getOptionalStringField(value, "workingPaperSectionId") }
			: {}),
		sourceIds: getStringArrayField(value, "sourceIds"),
		claimSupportIds: getStringArrayField(value, "claimSupportIds"),
		createdAt,
		updatedAt: getStringField(value, "updatedAt", fallbackTime),
	};
}

function normalizeLiteratureSourceArtifact(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): LiteratureSourceArtifact {
	const createdAt = getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime));
	return {
		id: getStringField(value, "id", `source-${index + 1}`),
		kind: normalizeLiteratureSourceKind(value.kind),
		title: getStringField(value, "title", "Untitled source"),
		...(getOptionalStringField(value, "url") ? { url: getOptionalStringField(value, "url") } : {}),
		...(getOptionalStringField(value, "path") ? { path: getOptionalStringField(value, "path") } : {}),
		authors: getStringArrayField(value, "authors"),
		...(getOptionalStringField(value, "year") ? { year: getOptionalStringField(value, "year") } : {}),
		summary: getStringField(value, "summary", ""),
		...(getOptionalStringField(value, "extractedText")
			? { extractedText: getOptionalStringField(value, "extractedText") }
			: {}),
		createdAt,
		updatedAt: getStringField(value, "updatedAt", createdAt),
	};
}

function normalizeLiteratureClaimSupport(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): LiteratureClaimSupport {
	const createdAt = getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime));
	return {
		id: getStringField(value, "id", `claim-support-${index + 1}`),
		...(getOptionalStringField(value, "pathId") ? { pathId: getOptionalStringField(value, "pathId") } : {}),
		...(getOptionalStringField(value, "reportId") ? { reportId: getOptionalStringField(value, "reportId") } : {}),
		claim: getStringField(value, "claim", ""),
		sourceIds: getStringArrayField(value, "sourceIds"),
		status: normalizeLiteratureClaimSupportStatus(value.status),
		...(getOptionalStringField(value, "note") ? { note: getOptionalStringField(value, "note") } : {}),
		createdAt,
		updatedAt: getStringField(value, "updatedAt", createdAt),
	};
}

function normalizeResearchWorkstreamStep(value: Record<string, unknown>): ResearchWorkstreamStepRecord {
	return {
		role: normalizeResearchWorkstreamRole(value.role),
		title: getStringField(value, "title", ""),
		summary: getStringField(value, "summary", ""),
		details: getStringArrayField(value, "details"),
	};
}

function normalizeResearchWorkstreamRun(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): ResearchWorkstreamRunRecord {
	const startedAt = getStringField(value, "startedAt", getStringField(value, "createdAt", fallbackTime));
	return {
		id: getStringField(value, "id", `research-run-${index + 1}`),
		pathId: getStringField(value, "pathId", "path-legacy"),
		pathTitle: getStringField(value, "pathTitle", "Research path"),
		status: normalizeResearchWorkstreamRunStatus(value.status),
		currentStage: normalizeResearchWorkstreamStage(value.currentStage),
		startedAt,
		updatedAt: getStringField(value, "updatedAt", startedAt),
		...(getOptionalStringField(value, "completedAt")
			? { completedAt: getOptionalStringField(value, "completedAt") }
			: {}),
		incrementalReports: getArrayField(value, "incrementalReports").map((report, reportIndex) =>
			normalizeResearchWorkstreamIncrementalReport(report, startedAt, reportIndex),
		),
		...(getOptionalStringField(value, "finalReportId")
			? { finalReportId: getOptionalStringField(value, "finalReportId") }
			: {}),
		...(getOptionalStringField(value, "failureReason")
			? { failureReason: getOptionalStringField(value, "failureReason") }
			: {}),
		...(typeof value.usedFallback === "boolean" ? { usedFallback: value.usedFallback } : {}),
	};
}

function normalizeResearchWorkstreamIncrementalReport(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): ResearchWorkstreamIncrementalReportRecord {
	return {
		id: getStringField(value, "id", `incremental-${index + 1}`),
		stage: normalizeResearchWorkstreamStage(value.stage),
		status: normalizeResearchWorkstreamIncrementalReportStatus(value.status),
		title: getStringField(value, "title", "Research progress"),
		summary: getStringField(value, "summary", ""),
		details: getStringArrayField(value, "details"),
		createdAt: getStringField(value, "createdAt", fallbackTime),
	};
}

function normalizeResearchWorkstreamRole(value: unknown): ResearchWorkstreamStepRecord["role"] {
	if (value === "coordinator" || value === "specialist" || value === "critic" || value === "synthesizer") {
		return value;
	}
	return "coordinator";
}

function normalizeResearchWorkstreamStage(value: unknown): ResearchWorkstreamRunStage {
	if (value === "literature-search") {
		return value;
	}
	return normalizeResearchWorkstreamRole(value);
}

function normalizeResearchWorkstreamReportStatus(value: unknown): ResearchWorkstreamReportStatus {
	return value === "blocked" ? "blocked" : "completed";
}

function normalizeResearchWorkstreamRunStatus(value: unknown): ResearchWorkstreamRunStatus {
	if (
		value === "queued" ||
		value === "running" ||
		value === "completed" ||
		value === "blocked" ||
		value === "failed"
	) {
		return value;
	}
	return "running";
}

function normalizeResearchWorkstreamIncrementalReportStatus(
	value: unknown,
): ResearchWorkstreamIncrementalReportRecord["status"] {
	if (value === "running" || value === "completed" || value === "blocked" || value === "failed") {
		return value;
	}
	return "completed";
}

function normalizeLiteratureSourceKind(value: unknown): LiteratureSourceKind {
	if (
		value === "web" ||
		value === "paper" ||
		value === "book" ||
		value === "local-file" ||
		value === "user-provided" ||
		value === "unknown"
	) {
		return value;
	}
	return "unknown";
}

function normalizeLiteratureClaimSupportStatus(value: unknown): LiteratureClaimSupportStatus {
	if (value === "supported" || value === "partially-supported" || value === "unsupported" || value === "conflicting") {
		return value;
	}
	return "unsupported";
}

function normalizeResearchFocus(value: unknown, fallbackTime: string): ResearchFocus | undefined {
	if (typeof value !== "object" || value === null) {
		return undefined;
	}
	const record = value as Record<string, unknown>;
	const pathIds = getStringArrayField(record, "pathIds");
	if (pathIds.length === 0) {
		return undefined;
	}
	return {
		pathIds,
		reason: getStringField(record, "reason", "Focused by user request."),
		updatedAt: getStringField(record, "updatedAt", fallbackTime),
	};
}

function isCurrentReviewRoundRecord(value: Record<string, unknown>): boolean {
	return typeof value.claimId === "string";
}

function normalizeGoalStatus(value: unknown): GoalStatus {
	if (
		value === "proposed" ||
		value === "approved" ||
		value === "active" ||
		value === "completed" ||
		value === "deferred"
	) {
		return value;
	}
	if (value === "complete") return "completed";
	return "active";
}

function normalizeClaimStatus(value: unknown): ClaimStatus {
	if (
		value === "draft" ||
		value === "proof_sketch" ||
		value === "needs_review" ||
		value === "proved" ||
		value === "disproved"
	) {
		return value;
	}
	if (value === "validated") return "needs_review";
	return "draft";
}

function normalizeArtifactKind(value: unknown): ArtifactKind {
	if (isCurrentArtifactKind(value)) return value;
	if (value === "data") return "dataset";
	if (value === "paper_export") return "working_paper_export";
	return "human_note";
}

function normalizeSourcePathKind(value: unknown): ArtifactRecord["sourcePathKind"] | undefined {
	if (value === "workspace" || value === "absolute") return value;
	return undefined;
}

function normalizeEvidenceKind(value: unknown): EvidenceKind {
	if (
		value === "proof" ||
		value === "computation" ||
		value === "reference" ||
		value === "counterexample" ||
		value === "note"
	) {
		return value;
	}
	return "note";
}

function normalizeWarningSeverity(value: unknown): WarningSeverity {
	if (value === "low" || value === "medium" || value === "high") return value;
	return "medium";
}

function normalizeWarningStatus(value: unknown): Warning["status"] {
	if (value === "open" || value === "resolved") return value;
	return "open";
}

function normalizeWorkstreamStatus(value: unknown): WorkstreamStatus {
	if (value === "active" || value === "running" || value === "blocked" || value === "needs_review") return value;
	return "active";
}

function normalizeReviewRoundStatus(value: unknown): ReviewRoundRecord["status"] {
	if (value === "open" || value === "completed") return value;
	if (value === "complete") return "completed";
	return "completed";
}

function normalizeReviewRoundOutcome(value: unknown): ReviewRoundOutcome {
	if (
		value === "accepted" ||
		value === "rejected" ||
		value === "revision_requested" ||
		value === "blocked_by_invariant"
	) {
		return value;
	}
	return "revision_requested";
}

function normalizeReportReviewStatus(value: unknown): ReportReviewRoundRecord["status"] {
	if (value === "open" || value === "completed") return value;
	if (value === "complete") return "completed";
	return "completed";
}

function normalizeReportReviewOutcome(value: unknown): ReportReviewOutcome {
	if (value === "accepted" || value === "revision_requested" || value === "blocked") return value;
	return "revision_requested";
}

function normalizeWorkingPaperSectionStatus(value: unknown): WorkingPaperSectionStatus {
	if (value === "draft" || value === "needs_revision" || value === "reviewed") return value;
	return "draft";
}

function normalizeMarginNoteKind(value: unknown): MarginNoteKind {
	if (value === "gap" || value === "todo" || value === "warning" || value === "provenance" || value === "comment") {
		return value;
	}
	return "comment";
}

function normalizeMarginNoteStatus(value: unknown): MarginNote["status"] {
	if (value === "open" || value === "resolved") return value;
	return "open";
}

function normalizeResearchPathStatus(value: unknown): ResearchPathStatus {
	if (
		value === "active" ||
		value === "promising" ||
		value === "blocked" ||
		value === "abandoned" ||
		value === "resolved"
	) {
		return value;
	}
	return "active";
}

function normalizeActor(value: unknown): CoMathActor {
	if (
		value === "human" ||
		value === "system" ||
		value === "coordinator" ||
		value === "workstream" ||
		value === "reviewer" ||
		value === "synthesizer"
	) {
		return value;
	}
	return "system";
}

function normalizeEventKind(value: unknown): CoMathEventKind {
	if (isCurrentEventKind(value)) return value;
	return "human_intervention_recorded";
}

function isCurrentArtifactKind(value: unknown): value is ArtifactKind {
	return (
		value === "source" ||
		value === "computation" ||
		value === "latex_note" ||
		value === "proof_sketch" ||
		value === "counterexample_search" ||
		value === "reference" ||
		value === "dataset" ||
		value === "script" ||
		value === "figure" ||
		value === "failed_attempt" ||
		value === "human_note" ||
		value === "working_paper_export"
	);
}

function isCurrentEventKind(value: unknown): value is CoMathEventKind {
	return (
		value === "project_initialized" ||
		value === "goal_added" ||
		value === "goal_status_changed" ||
		value === "workstream_added" ||
		value === "role_report_saved" ||
		value === "claim_proposed" ||
		value === "evidence_added" ||
		value === "warning_added" ||
		value === "warning_resolved" ||
		value === "review_requested" ||
		value === "review_decision_recorded" ||
		value === "claim_status_changed" ||
		value === "synthesis_generated" ||
		value === "artifact_recorded" ||
		value === "role_run_queued" ||
		value === "role_run_started" ||
		value === "role_run_completed" ||
		value === "role_run_blocked" ||
		value === "role_run_failed" ||
		value === "role_run_aborted" ||
		value === "role_run_cancelled" ||
		value === "workstream_status_changed" ||
		value === "human_intervention_recorded" ||
		value === "review_round_recorded" ||
		value === "report_review_round_recorded" ||
		value === "claim_revised" ||
		value === "working_paper_section_recorded" ||
		value === "margin_note_recorded" ||
		value === "margin_note_resolved" ||
		value === "working_paper_exported" ||
		value === "research_workstream_recorded" ||
		value === "research_workstream_run_recorded" ||
		value === "literature_source_recorded" ||
		value === "literature_claim_support_recorded"
	);
}

function getArrayField(value: object, key: string): Record<string, unknown>[] {
	const field = (value as Record<string, unknown>)[key];
	if (!Array.isArray(field)) return [];
	return field.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
}

function getStringArrayField(value: object, key: string): string[] {
	const field = (value as Record<string, unknown>)[key];
	if (typeof field === "string") return [field];
	if (!Array.isArray(field)) return [];
	return field.filter((item): item is string => typeof item === "string");
}

function getStringField(value: object, key: string, fallback: string): string {
	const field = (value as Record<string, unknown>)[key];
	return typeof field === "string" ? field : fallback;
}

function getNumberField(value: object, key: string, fallback: number): number {
	const field = (value as Record<string, unknown>)[key];
	return typeof field === "number" && Number.isFinite(field) ? field : fallback;
}

function getOptionalStringField(value: object, key: string): string | undefined {
	const field = (value as Record<string, unknown>)[key];
	return typeof field === "string" && field.length > 0 ? field : undefined;
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
		return evidence?.claimId === claim.id && evidence.kind === "proof";
	});
}

function hasAttachedOpenWarning(state: CoMathProjectState, claim: Claim): boolean {
	return claim.warningIds.some((warningId) => {
		const warning = state.warnings.find((candidate) => candidate.id === warningId);
		return warning?.claimId === claim.id && warning.status === "open";
	});
}

function isMissingFileError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
