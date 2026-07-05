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
	ComputationalArtifact,
	ComputationalArtifactKind,
	ComputationalArtifactStatus,
	ConjectureRevisionKind,
	Evidence,
	EvidenceKind,
	GoalStatus,
	LiteratureClaimSupport,
	LiteratureClaimSupportStatus,
	LiteratureSearchProviderRecord,
	LiteratureSearchProviderStatus,
	LiteratureSearchRecord,
	LiteratureSourceArtifact,
	LiteratureSourceKind,
	LiteratureSourceProvider,
	LiteratureSourceType,
	MarginNote,
	MarginNoteKind,
	Report,
	ReportReviewOutcome,
	ReportReviewRoundRecord,
	ResearchBatchRecord,
	ResearchBatchStatus,
	ResearchCoordinatorNextMove,
	ResearchCoordinatorNextMovePriority,
	ResearchCoordinatorReportRecord,
	ResearchEvidenceBoardEntry,
	ResearchEvidenceClassification,
	ResearchFocus,
	ResearchPath,
	ResearchPathStatus,
	ResearchPlanRecord,
	ResearchPlanStatus,
	ResearchPlanTaskKind,
	ResearchPlanTaskRecord,
	ResearchPlanTaskStatus,
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
	| "researchBatches"
	| "researchPlans"
	| "researchPlanTasks"
	| "literatureSources"
	| "literatureSearches"
	| "literatureClaimSupports"
	| "researchEvidenceBoard"
	| "computationalArtifacts"
	| "researchCoordinatorReports"
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
				| "researchBatches"
				| "researchPlans"
				| "researchPlanTasks"
				| "literatureSources"
				| "literatureSearches"
				| "literatureClaimSupports"
				| "researchEvidenceBoard"
				| "computationalArtifacts"
				| "researchCoordinatorReports"
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
	computationalArtifactIds?: string[];
	now: string;
	actor?: CoMathActor;
}

export interface AddResearchCoordinatorReportInput {
	id?: string;
	inputReportIds?: string[];
	inputPathIds?: string[];
	inputSourceIds?: string[];
	inputComputationalArtifactIds?: string[];
	whatWeKnow: string[];
	roadblocks: string[];
	recommendedNextMoves: ResearchCoordinatorNextMove[];
	humanHelpUseful?: string[];
	suggestedPathId?: string;
	suggestedPrompt?: string;
	workingPaperSectionId?: string;
	now: string;
	actor?: CoMathActor;
}

export interface AddLiteratureSourceArtifactInput {
	id?: string;
	kind?: LiteratureSourceKind;
	title: string;
	url?: string;
	path?: string;
	provider?: LiteratureSourceProvider;
	externalId?: string;
	doi?: string;
	venue?: string;
	publishedAt?: string;
	citationCount?: number;
	sourceType?: LiteratureSourceType;
	authors?: string[];
	year?: string;
	summary: string;
	extractedText?: string;
	now: string;
	actor?: CoMathActor;
}

export interface AddLiteratureSearchRecordInput {
	id?: string;
	pathId?: string;
	runId?: string;
	queries: readonly string[];
	providers: readonly LiteratureSearchProviderRecord[];
	candidateCount: number;
	selectedSourceIds?: readonly string[];
	startedAt: string;
	completedAt: string;
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

export interface AddResearchEvidenceBoardEntryInput {
	id?: string;
	pathId?: string;
	reportId?: string;
	claimSupportId?: string;
	marginNoteId?: string;
	sourceIds?: readonly string[];
	computationalArtifactIds?: readonly string[];
	claim: string;
	classification: ResearchEvidenceClassification;
	rationale: string;
	parentEntryId?: string;
	revisionKind?: ConjectureRevisionKind;
	revisionNote?: string;
	now: string;
	actor?: CoMathActor;
}

export interface AddComputationalArtifactInput {
	id?: string;
	pathId: string;
	reportId?: string;
	runId?: string;
	kind: ComputationalArtifactKind;
	status?: ComputationalArtifactStatus;
	title: string;
	filePath?: string;
	command?: string;
	exitCode?: number;
	summary: string;
	now: string;
	actor?: CoMathActor;
}

export interface UpdateComputationalArtifactInput {
	artifactId: string;
	reportId?: string;
	status?: ComputationalArtifactStatus;
	filePath?: string;
	command?: string;
	exitCode?: number;
	summary?: string;
	now: string;
	actor?: CoMathActor;
}

export interface AddResearchWorkstreamRunInput {
	id?: string;
	pathId: string;
	pathTitle: string;
	status?: ResearchWorkstreamRunStatus;
	currentStage?: ResearchWorkstreamRunStage;
	batchId?: string;
	batchStepIndex?: number;
	now: string;
	actor?: CoMathActor;
	usedFallback?: boolean;
}

export interface UpdateResearchWorkstreamRunInput {
	runId: string;
	status?: ResearchWorkstreamRunStatus;
	currentStage?: ResearchWorkstreamRunStage;
	batchId?: string;
	batchStepIndex?: number;
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

export interface AddResearchBatchInput {
	id?: string;
	requestedStepCount: number;
	initialPathId?: string;
	now: string;
	actor?: CoMathActor;
}

export interface UpdateResearchBatchInput {
	batchId: string;
	status?: ResearchBatchStatus;
	completedStepCount?: number;
	addRunId?: string;
	currentPathId?: string;
	nextPathId?: string;
	lastCompletedPathId?: string;
	interruptedRunId?: string;
	clearInterruptedRunId?: boolean;
	failureReason?: string;
	cancelReason?: string;
	completedAt?: string;
	cancelledAt?: string;
	now: string;
	actor?: CoMathActor;
}

export interface AddResearchPlanInput {
	id?: string;
	title: string;
	objective: string;
	status?: ResearchPlanStatus;
	now: string;
	actor?: CoMathActor;
}

export interface AddResearchPlanTaskInput {
	id?: string;
	planId: string;
	kind: ResearchPlanTaskKind;
	title: string;
	description: string;
	goal?: string;
	acceptanceCriteria?: readonly string[];
	pathId?: string;
	now: string;
	actor?: CoMathActor;
}

export interface UpdateResearchPlanInput {
	planId: string;
	status?: ResearchPlanStatus;
	currentTaskId?: string;
	clearCurrentTaskId?: boolean;
	pauseReason?: string;
	failureReason?: string;
	cancelReason?: string;
	startedAt?: string;
	completedAt?: string;
	cancelledAt?: string;
	now: string;
	actor?: CoMathActor;
}

export interface UpdateResearchPlanTaskInput {
	taskId: string;
	status?: ResearchPlanTaskStatus;
	runId?: string;
	reportId?: string;
	addSourceIds?: readonly string[];
	addClaimSupportIds?: readonly string[];
	addComputationalArtifactIds?: readonly string[];
	addEvidenceEntryIds?: readonly string[];
	blockedReason?: string;
	failureReason?: string;
	startedAt?: string;
	completedAt?: string;
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

const COMPUTATIONAL_ARTIFACT_SUMMARY_LIMIT = 1_000;

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
		researchBatches: [],
		researchPlans: [],
		researchPlanTasks: [],
		literatureSources: [],
		literatureSearches: [],
		literatureClaimSupports: [],
		researchEvidenceBoard: [],
		computationalArtifacts: [],
		researchCoordinatorReports: [],
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
		computationalArtifactIds: uniqueStrings(input.computationalArtifactIds ?? []),
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

export function addResearchCoordinatorReport(
	state: CoMathProjectState,
	input: AddResearchCoordinatorReportInput,
): CoMathProjectState {
	const id = input.id?.trim() || `coordinator-report-${state.researchCoordinatorReports.length + 1}`;
	if (state.researchCoordinatorReports.some((report) => report.id === id)) {
		throw new Error(`Duplicate research coordinator report id: ${id}`);
	}
	const recommendedNextMoves = input.recommendedNextMoves
		.map(normalizeResearchCoordinatorNextMoveInput)
		.filter((move): move is ResearchCoordinatorNextMove => move !== undefined);
	const report: ResearchCoordinatorReportRecord = {
		id,
		inputReportIds: sanitizeStringArray(input.inputReportIds ?? []),
		inputPathIds: sanitizeStringArray(input.inputPathIds ?? []),
		inputSourceIds: sanitizeStringArray(input.inputSourceIds ?? []),
		inputComputationalArtifactIds: sanitizeStringArray(input.inputComputationalArtifactIds ?? []),
		whatWeKnow: fallbackStringArray(input.whatWeKnow, "No durable findings have been recorded yet."),
		roadblocks: fallbackStringArray(input.roadblocks, "No current roadblock was identified."),
		recommendedNextMoves:
			recommendedNextMoves.length > 0
				? recommendedNextMoves
				: [
						{
							title: "Choose a research path to continue",
							rationale: "No specific next move was identified from the current project state.",
							priority: "medium",
						},
					],
		humanHelpUseful: sanitizeStringArray(input.humanHelpUseful ?? []),
		...(input.suggestedPathId?.trim() ? { suggestedPathId: input.suggestedPathId.trim() } : {}),
		...(input.suggestedPrompt?.trim() ? { suggestedPrompt: input.suggestedPrompt.trim() } : {}),
		...(input.workingPaperSectionId?.trim() ? { workingPaperSectionId: input.workingPaperSectionId.trim() } : {}),
		createdAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			researchCoordinatorReports: [...state.researchCoordinatorReports, report],
			updatedAt: input.now,
		},
		{
			kind: "research_coordinator_report_recorded",
			actor: input.actor,
			summary: `Recorded project coordinator report ${id}`,
			subjectId: id,
			relatedIds: uniqueStrings([
				...report.inputReportIds,
				...report.inputPathIds,
				...report.inputSourceIds,
				...report.inputComputationalArtifactIds,
				...(report.suggestedPathId ? [report.suggestedPathId] : []),
			]),
			now: input.now,
		},
	);
}

export function getLatestResearchCoordinatorReport(
	state: CoMathProjectState,
): ResearchCoordinatorReportRecord | undefined {
	return state.researchCoordinatorReports.at(-1);
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
	const doi = input.doi?.trim();
	const externalId = input.externalId?.trim();
	const duplicate = state.literatureSources.find((source) => {
		if (doi && source.doi === doi) return true;
		if (externalId && source.externalId === externalId && source.provider === input.provider) return true;
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
		...(input.provider ? { provider: input.provider } : {}),
		...(externalId ? { externalId } : {}),
		...(doi ? { doi } : {}),
		...(input.venue?.trim() ? { venue: input.venue.trim() } : {}),
		...(input.publishedAt?.trim() ? { publishedAt: input.publishedAt.trim() } : {}),
		...(typeof input.citationCount === "number" && Number.isFinite(input.citationCount)
			? { citationCount: Math.max(0, Math.floor(input.citationCount)) }
			: {}),
		...(input.sourceType ? { sourceType: input.sourceType } : {}),
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

export function addLiteratureSearchRecord(
	state: CoMathProjectState,
	input: AddLiteratureSearchRecordInput,
): CoMathProjectState {
	const queries = sanitizeStringArray(input.queries);
	if (queries.length === 0) {
		throw new Error("Literature search record requires at least one query.");
	}
	const id = input.id?.trim() || `literature-search-${state.literatureSearches.length + 1}`;
	if (state.literatureSearches.some((search) => search.id === id)) {
		throw new Error(`Duplicate literature search id: ${id}`);
	}
	const providers = input.providers.map(normalizeLiteratureSearchProviderInput);
	const selectedSourceIds = sanitizeStringArray(input.selectedSourceIds ?? []);
	const record: LiteratureSearchRecord = {
		id,
		...(input.pathId?.trim() ? { pathId: input.pathId.trim() } : {}),
		...(input.runId?.trim() ? { runId: input.runId.trim() } : {}),
		queries,
		providers,
		candidateCount: Math.max(0, Math.floor(input.candidateCount)),
		selectedSourceIds,
		startedAt: input.startedAt,
		completedAt: input.completedAt,
		createdAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			literatureSearches: [...state.literatureSearches, record],
			updatedAt: input.now,
		},
		{
			kind: "literature_search_recorded",
			actor: input.actor,
			summary: `Recorded literature search ${id}`,
			subjectId: id,
			relatedIds: uniqueStrings([...(record.pathId ? [record.pathId] : []), ...selectedSourceIds]),
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

export function addResearchEvidenceBoardEntry(
	state: CoMathProjectState,
	input: AddResearchEvidenceBoardEntryInput,
): CoMathProjectState {
	const claim = input.claim.trim();
	const rationale = input.rationale.trim();
	if (!claim) {
		throw new Error("Research evidence board entry requires a claim.");
	}
	if (!rationale) {
		throw new Error("Research evidence board entry requires a rationale.");
	}
	const sourceIds = uniqueStrings(input.sourceIds ?? []);
	const computationalArtifactIds = uniqueStrings(input.computationalArtifactIds ?? []);
	const duplicate = state.researchEvidenceBoard.find(
		(entry) =>
			entry.reportId === input.reportId &&
			entry.claimSupportId === input.claimSupportId &&
			entry.marginNoteId === input.marginNoteId &&
			entry.claim.trim().toLowerCase() === claim.toLowerCase(),
	);
	if (duplicate) {
		return state;
	}
	const id = input.id?.trim() || `evidence-board-${state.researchEvidenceBoard.length + 1}`;
	if (state.researchEvidenceBoard.some((entry) => entry.id === id)) {
		throw new Error(`Duplicate research evidence board entry id: ${id}`);
	}
	// Lineage links must resolve; a dangling parent id drops the link but keeps the entry.
	const parentEntryId = input.parentEntryId?.trim();
	const parentExists =
		parentEntryId !== undefined &&
		parentEntryId.length > 0 &&
		state.researchEvidenceBoard.some((entry) => entry.id === parentEntryId);
	const entry: ResearchEvidenceBoardEntry = {
		id,
		...(input.pathId?.trim() ? { pathId: input.pathId.trim() } : {}),
		...(input.reportId?.trim() ? { reportId: input.reportId.trim() } : {}),
		...(input.claimSupportId?.trim() ? { claimSupportId: input.claimSupportId.trim() } : {}),
		...(input.marginNoteId?.trim() ? { marginNoteId: input.marginNoteId.trim() } : {}),
		sourceIds,
		computationalArtifactIds,
		claim,
		classification: input.classification,
		rationale,
		...(parentExists ? { parentEntryId } : {}),
		...(parentExists && input.revisionKind ? { revisionKind: input.revisionKind } : {}),
		...(parentExists && input.revisionNote?.trim() ? { revisionNote: input.revisionNote.trim() } : {}),
		createdAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			researchEvidenceBoard: [...state.researchEvidenceBoard, entry],
			updatedAt: input.now,
		},
		{
			kind: "research_evidence_board_entry_recorded",
			actor: input.actor,
			summary: `Recorded evidence board entry ${id}: ${classificationLabel(input.classification)}`,
			subjectId: id,
			relatedIds: uniqueStrings([
				...(entry.pathId ? [entry.pathId] : []),
				...(entry.reportId ? [entry.reportId] : []),
				...(entry.claimSupportId ? [entry.claimSupportId] : []),
				...(entry.marginNoteId ? [entry.marginNoteId] : []),
				...sourceIds,
				...computationalArtifactIds,
			]),
			now: input.now,
		},
	);
}

/**
 * Root-to-leaf revision chain ending at the given evidence entry. Cycles and dangling parent ids
 * terminate the walk instead of looping.
 */
export function getEvidenceLineage(state: CoMathProjectState, entryId: string): ResearchEvidenceBoardEntry[] {
	const byId = new Map(state.researchEvidenceBoard.map((entry) => [entry.id, entry]));
	const chain: ResearchEvidenceBoardEntry[] = [];
	const seen = new Set<string>();
	let current = byId.get(entryId);
	while (current && !seen.has(current.id)) {
		seen.add(current.id);
		chain.unshift(current);
		current = current.parentEntryId ? byId.get(current.parentEntryId) : undefined;
	}
	return chain;
}

export function getEvidenceChildren(state: CoMathProjectState, entryId: string): ResearchEvidenceBoardEntry[] {
	return state.researchEvidenceBoard.filter((entry) => entry.parentEntryId === entryId);
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

export function addComputationalArtifact(
	state: CoMathProjectState,
	input: AddComputationalArtifactInput,
): CoMathProjectState {
	const pathId = input.pathId.trim();
	const title = input.title.trim();
	const summary = capComputationalArtifactSummary(input.summary);
	if (!pathId) {
		throw new Error("Computational artifact requires a path id.");
	}
	if (!title) {
		throw new Error("Computational artifact requires a title.");
	}
	if (!summary) {
		throw new Error("Computational artifact requires a summary.");
	}
	const id = input.id?.trim() || `computation-artifact-${state.computationalArtifacts.length + 1}`;
	if (state.computationalArtifacts.some((artifact) => artifact.id === id)) {
		throw new Error(`Duplicate computational artifact id: ${id}`);
	}
	const filePath = input.filePath ? normalizeComputationalArtifactFilePath(input.filePath) : undefined;
	const artifact: ComputationalArtifact = {
		id,
		pathId,
		...(input.reportId?.trim() ? { reportId: input.reportId.trim() } : {}),
		...(input.runId?.trim() ? { runId: input.runId.trim() } : {}),
		kind: input.kind,
		status: input.status ?? "completed",
		title,
		...(filePath ? { filePath } : {}),
		...(input.command?.trim() ? { command: input.command.trim() } : {}),
		...(input.exitCode !== undefined ? { exitCode: input.exitCode } : {}),
		summary,
		createdAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			computationalArtifacts: [...state.computationalArtifacts, artifact],
			updatedAt: input.now,
		},
		{
			kind: "computational_artifact_recorded",
			actor: input.actor,
			summary: `Recorded computation output ${id}: ${title}`,
			subjectId: id,
			relatedIds: uniqueStrings([pathId, artifact.reportId, artifact.runId].filter((id): id is string => !!id)),
			now: input.now,
		},
	);
}

export function updateComputationalArtifact(
	state: CoMathProjectState,
	input: UpdateComputationalArtifactInput,
): CoMathProjectState {
	if (!state.computationalArtifacts.some((artifact) => artifact.id === input.artifactId)) {
		return state;
	}
	const filePath = input.filePath ? normalizeComputationalArtifactFilePath(input.filePath) : undefined;
	return appendEvent(
		{
			...state,
			computationalArtifacts: state.computationalArtifacts.map((artifact) =>
				artifact.id === input.artifactId
					? {
							...artifact,
							...(input.reportId?.trim() ? { reportId: input.reportId.trim() } : {}),
							...(input.status ? { status: input.status } : {}),
							...(filePath ? { filePath } : {}),
							...(input.command?.trim() ? { command: input.command.trim() } : {}),
							...(input.exitCode !== undefined ? { exitCode: input.exitCode } : {}),
							...(input.summary !== undefined
								? { summary: capComputationalArtifactSummary(input.summary) }
								: {}),
							updatedAt: input.now,
						}
					: artifact,
			),
			updatedAt: input.now,
		},
		{
			kind: "computational_artifact_recorded",
			actor: input.actor,
			summary: `Updated computation output ${input.artifactId}`,
			subjectId: input.artifactId,
			now: input.now,
		},
	);
}

export function getComputationalArtifactsForReport(
	state: CoMathProjectState,
	reportId: string,
): ComputationalArtifact[] {
	const report = state.researchReports.find((candidate) => candidate.id === reportId);
	const linkedIds = new Set(report?.computationalArtifactIds ?? []);
	return state.computationalArtifacts.filter(
		(artifact) => artifact.reportId === reportId || linkedIds.has(artifact.id),
	);
}

export function getComputationalArtifactsForRun(state: CoMathProjectState, runId: string): ComputationalArtifact[] {
	return state.computationalArtifacts.filter((artifact) => artifact.runId === runId);
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
		...(input.batchId?.trim() ? { batchId: input.batchId.trim() } : {}),
		...(typeof input.batchStepIndex === "number" && Number.isFinite(input.batchStepIndex)
			? { batchStepIndex: Math.max(1, Math.floor(input.batchStepIndex)) }
			: {}),
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
							...(input.batchId?.trim() ? { batchId: input.batchId.trim() } : {}),
							...(typeof input.batchStepIndex === "number" && Number.isFinite(input.batchStepIndex)
								? { batchStepIndex: Math.max(1, Math.floor(input.batchStepIndex)) }
								: {}),
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

export function addResearchBatch(state: CoMathProjectState, input: AddResearchBatchInput): CoMathProjectState {
	const requestedStepCount = Math.min(5, Math.max(1, Math.floor(input.requestedStepCount)));
	const id = input.id?.trim() || `research-batch-${state.researchBatches.length + 1}`;
	if (state.researchBatches.some((batch) => batch.id === id)) {
		throw new Error(`Duplicate research batch id: ${id}`);
	}
	const initialPathId = input.initialPathId?.trim();
	const batch: ResearchBatchRecord = {
		id,
		status: "running",
		requestedStepCount,
		completedStepCount: 0,
		runIds: [],
		...(initialPathId ? { initialPathId, nextPathId: initialPathId } : {}),
		createdAt: input.now,
		startedAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			researchBatches: [...state.researchBatches, batch],
			updatedAt: input.now,
		},
		{
			kind: "research_batch_recorded",
			actor: input.actor,
			summary: `Started bounded research run for ${requestedStepCount} step${requestedStepCount === 1 ? "" : "s"}.`,
			subjectId: id,
			relatedIds: initialPathId ? [initialPathId] : [],
			now: input.now,
		},
	);
}

export function updateResearchBatch(state: CoMathProjectState, input: UpdateResearchBatchInput): CoMathProjectState {
	const batch = state.researchBatches.find((candidate) => candidate.id === input.batchId);
	if (!batch) {
		return state;
	}
	const runIds = input.addRunId?.trim()
		? [...batch.runIds, input.addRunId.trim()].filter((runId, index, all) => all.indexOf(runId) === index)
		: batch.runIds;
	const completedStepCount =
		typeof input.completedStepCount === "number" && Number.isFinite(input.completedStepCount)
			? Math.min(batch.requestedStepCount, Math.max(0, Math.floor(input.completedStepCount)))
			: batch.completedStepCount;
	return appendEvent(
		{
			...state,
			researchBatches: state.researchBatches.map((candidate) => {
				if (candidate.id !== input.batchId) {
					return candidate;
				}
				const updated: ResearchBatchRecord = {
					...candidate,
					...(input.status ? { status: input.status } : {}),
					completedStepCount,
					runIds,
					...(input.currentPathId?.trim() ? { currentPathId: input.currentPathId.trim() } : {}),
					...(input.nextPathId?.trim() ? { nextPathId: input.nextPathId.trim() } : {}),
					...(input.lastCompletedPathId?.trim() ? { lastCompletedPathId: input.lastCompletedPathId.trim() } : {}),
					...(input.interruptedRunId?.trim() ? { interruptedRunId: input.interruptedRunId.trim() } : {}),
					...(input.failureReason?.trim() ? { failureReason: input.failureReason.trim() } : {}),
					...(input.cancelReason?.trim() ? { cancelReason: input.cancelReason.trim() } : {}),
					...(input.completedAt ? { completedAt: input.completedAt } : {}),
					...(input.cancelledAt ? { cancelledAt: input.cancelledAt } : {}),
					updatedAt: input.now,
				};
				if (input.clearInterruptedRunId) {
					delete updated.interruptedRunId;
				}
				return updated;
			}),
			updatedAt: input.now,
		},
		{
			kind: "research_batch_recorded",
			actor: input.actor,
			summary: `Updated bounded research run ${input.batchId}`,
			subjectId: input.batchId,
			relatedIds: input.addRunId ? [input.addRunId] : [],
			now: input.now,
		},
	);
}

export function addResearchPlan(state: CoMathProjectState, input: AddResearchPlanInput): CoMathProjectState {
	const title = input.title.trim();
	const objective = input.objective.trim();
	if (!title) {
		throw new Error("Research plan requires a title.");
	}
	if (!objective) {
		throw new Error("Research plan requires an objective.");
	}
	const id = input.id?.trim() || `research-plan-${state.researchPlans.length + 1}`;
	if (state.researchPlans.some((plan) => plan.id === id)) {
		throw new Error(`Duplicate research plan id: ${id}`);
	}
	const plan: ResearchPlanRecord = {
		id,
		title,
		objective,
		status: input.status ?? "active",
		taskIds: [],
		createdAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			researchPlans: [...state.researchPlans, plan],
			updatedAt: input.now,
		},
		{
			kind: "research_plan_recorded",
			actor: input.actor,
			summary: `Created research plan ${id}: ${title}`,
			subjectId: id,
			now: input.now,
		},
	);
}

export function addResearchPlanTask(state: CoMathProjectState, input: AddResearchPlanTaskInput): CoMathProjectState {
	const plan = state.researchPlans.find((candidate) => candidate.id === input.planId);
	if (!plan) {
		throw new Error(`Unknown research plan: ${input.planId}`);
	}
	const title = input.title.trim();
	const description = input.description.trim();
	if (!title) {
		throw new Error("Research plan task requires a title.");
	}
	if (!description) {
		throw new Error("Research plan task requires a description.");
	}
	const id = input.id?.trim() || `research-plan-task-${state.researchPlanTasks.length + 1}`;
	if (state.researchPlanTasks.some((task) => task.id === id)) {
		throw new Error(`Duplicate research plan task id: ${id}`);
	}
	const sequence = state.researchPlanTasks.filter((task) => task.planId === plan.id).length + 1;
	const task: ResearchPlanTaskRecord = {
		id,
		planId: plan.id,
		kind: input.kind,
		status: "pending",
		sequence,
		title,
		description,
		...(input.goal?.trim() ? { goal: input.goal.trim() } : {}),
		acceptanceCriteria: sanitizeStringArray(input.acceptanceCriteria ?? []),
		...(input.pathId?.trim() ? { pathId: input.pathId.trim() } : {}),
		sourceIds: [],
		claimSupportIds: [],
		computationalArtifactIds: [],
		evidenceEntryIds: [],
		createdAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			researchPlans: state.researchPlans.map((candidate) =>
				candidate.id === plan.id
					? { ...candidate, taskIds: [...candidate.taskIds, id], updatedAt: input.now }
					: candidate,
			),
			researchPlanTasks: [...state.researchPlanTasks, task],
			updatedAt: input.now,
		},
		{
			kind: "research_plan_task_recorded",
			actor: input.actor,
			summary: `Added research plan task ${id}: ${title}`,
			subjectId: id,
			relatedIds: [plan.id, ...(task.pathId ? [task.pathId] : [])],
			now: input.now,
		},
	);
}

export function updateResearchPlan(state: CoMathProjectState, input: UpdateResearchPlanInput): CoMathProjectState {
	if (!state.researchPlans.some((plan) => plan.id === input.planId)) {
		return state;
	}
	return appendEvent(
		{
			...state,
			researchPlans: state.researchPlans.map((plan) => {
				if (plan.id !== input.planId) {
					return plan;
				}
				const updated: ResearchPlanRecord = {
					...plan,
					...(input.status ? { status: input.status } : {}),
					...(input.currentTaskId?.trim() ? { currentTaskId: input.currentTaskId.trim() } : {}),
					...(input.pauseReason?.trim() ? { pauseReason: input.pauseReason.trim() } : {}),
					...(input.failureReason?.trim() ? { failureReason: input.failureReason.trim() } : {}),
					...(input.cancelReason?.trim() ? { cancelReason: input.cancelReason.trim() } : {}),
					...(input.startedAt ? { startedAt: input.startedAt } : {}),
					...(input.completedAt ? { completedAt: input.completedAt } : {}),
					...(input.cancelledAt ? { cancelledAt: input.cancelledAt } : {}),
					updatedAt: input.now,
				};
				if (input.clearCurrentTaskId) {
					delete updated.currentTaskId;
				}
				if (input.status === "active") {
					delete updated.pauseReason;
				}
				return updated;
			}),
			updatedAt: input.now,
		},
		{
			kind: "research_plan_recorded",
			actor: input.actor,
			summary: `Updated research plan ${input.planId}`,
			subjectId: input.planId,
			now: input.now,
		},
	);
}

export function updateResearchPlanTask(
	state: CoMathProjectState,
	input: UpdateResearchPlanTaskInput,
): CoMathProjectState {
	const task = state.researchPlanTasks.find((candidate) => candidate.id === input.taskId);
	if (!task) {
		return state;
	}
	return appendEvent(
		{
			...state,
			researchPlanTasks: state.researchPlanTasks.map((candidate) =>
				candidate.id === input.taskId
					? {
							...candidate,
							...(input.status ? { status: input.status } : {}),
							...(input.runId?.trim() ? { runId: input.runId.trim() } : {}),
							...(input.reportId?.trim() ? { reportId: input.reportId.trim() } : {}),
							sourceIds: uniqueStrings([...candidate.sourceIds, ...(input.addSourceIds ?? [])]),
							claimSupportIds: uniqueStrings([
								...candidate.claimSupportIds,
								...(input.addClaimSupportIds ?? []),
							]),
							computationalArtifactIds: uniqueStrings([
								...candidate.computationalArtifactIds,
								...(input.addComputationalArtifactIds ?? []),
							]),
							evidenceEntryIds: uniqueStrings([
								...candidate.evidenceEntryIds,
								...(input.addEvidenceEntryIds ?? []),
							]),
							...(input.blockedReason?.trim() ? { blockedReason: input.blockedReason.trim() } : {}),
							...(input.failureReason?.trim() ? { failureReason: input.failureReason.trim() } : {}),
							...(input.startedAt ? { startedAt: input.startedAt } : {}),
							...(input.completedAt ? { completedAt: input.completedAt } : {}),
							updatedAt: input.now,
						}
					: candidate,
			),
			updatedAt: input.now,
		},
		{
			kind: "research_plan_task_recorded",
			actor: input.actor,
			summary: `Updated research plan task ${input.taskId}${input.status ? ` to ${input.status}` : ""}`,
			subjectId: input.taskId,
			relatedIds: uniqueStrings(
				[task.planId, input.runId, input.reportId].filter((id): id is string => !!id?.trim()),
			),
			now: input.now,
		},
	);
}

export function getActiveResearchPlan(state: CoMathProjectState): ResearchPlanRecord | undefined {
	return state.researchPlans.find((plan) => plan.status === "active");
}

export function getPausedResearchPlan(state: CoMathProjectState): ResearchPlanRecord | undefined {
	return [...state.researchPlans].reverse().find((plan) => plan.status === "paused");
}

export function getLatestResearchPlan(state: CoMathProjectState): ResearchPlanRecord | undefined {
	return state.researchPlans.at(-1);
}

export function getResearchPlanTasks(state: CoMathProjectState, planId: string): ResearchPlanTaskRecord[] {
	return state.researchPlanTasks.filter((task) => task.planId === planId).sort((a, b) => a.sequence - b.sequence);
}

/**
 * The next task the plan runner may execute: the lowest-sequence pending task. Returns `undefined`
 * while a task is still running (only one task may run at a time) or when nothing is pending.
 */
export function getNextRunnableResearchPlanTask(
	state: CoMathProjectState,
	planId: string,
): ResearchPlanTaskRecord | undefined {
	const tasks = getResearchPlanTasks(state, planId);
	if (tasks.some((task) => task.status === "running")) {
		return undefined;
	}
	return tasks.find((task) => task.status === "pending");
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
				status: "interrupted",
				failureReason: reason,
				now: input.now,
				actor: input.actor,
			});
			if (run.batchId) {
				nextState = updateResearchBatch(nextState, {
					batchId: run.batchId,
					status: "paused",
					currentPathId: run.pathId,
					nextPathId: run.pathId,
					interruptedRunId: run.id,
					now: input.now,
					actor: input.actor,
				});
			}
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

export function getActiveResearchBatch(state: CoMathProjectState): ResearchBatchRecord | undefined {
	return state.researchBatches.find((batch) => batch.status === "running");
}

export function getPausedResearchBatch(state: CoMathProjectState): ResearchBatchRecord | undefined {
	return [...state.researchBatches].reverse().find((batch) => batch.status === "paused");
}

export function getLatestResearchBatch(state: CoMathProjectState): ResearchBatchRecord | undefined {
	return state.researchBatches.at(-1);
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
		researchBatches: getArrayField(value, "researchBatches").map((record, index) =>
			normalizeResearchBatch(record, updatedAt, index),
		),
		researchPlans: getArrayField(value, "researchPlans").map((record, index) =>
			normalizeResearchPlan(record, updatedAt, index),
		),
		researchPlanTasks: getArrayField(value, "researchPlanTasks").map((record, index) =>
			normalizeResearchPlanTask(record, updatedAt, index),
		),
		literatureSources: getArrayField(value, "literatureSources").map((record, index) =>
			normalizeLiteratureSourceArtifact(record, updatedAt, index),
		),
		literatureSearches: getArrayField(value, "literatureSearches").map((record, index) =>
			normalizeLiteratureSearchRecord(record, updatedAt, index),
		),
		literatureClaimSupports: getArrayField(value, "literatureClaimSupports").map((record, index) =>
			normalizeLiteratureClaimSupport(record, updatedAt, index),
		),
		researchEvidenceBoard: getArrayField(value, "researchEvidenceBoard").map((record, index) =>
			normalizeResearchEvidenceBoardEntry(record, updatedAt, index),
		),
		computationalArtifacts: getArrayField(value, "computationalArtifacts").map((record, index) =>
			normalizeComputationalArtifact(record, updatedAt, index),
		),
		researchCoordinatorReports: getArrayField(value, "researchCoordinatorReports").map((record, index) =>
			normalizeResearchCoordinatorReport(record, updatedAt, index),
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
		computationalArtifactIds: getStringArrayField(value, "computationalArtifactIds"),
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
		...(normalizeLiteratureSourceProvider(value.provider)
			? { provider: normalizeLiteratureSourceProvider(value.provider) }
			: {}),
		...(getOptionalStringField(value, "externalId")
			? { externalId: getOptionalStringField(value, "externalId") }
			: {}),
		...(getOptionalStringField(value, "doi") ? { doi: getOptionalStringField(value, "doi") } : {}),
		...(getOptionalStringField(value, "venue") ? { venue: getOptionalStringField(value, "venue") } : {}),
		...(getOptionalStringField(value, "publishedAt")
			? { publishedAt: getOptionalStringField(value, "publishedAt") }
			: {}),
		...(typeof value.citationCount === "number" && Number.isFinite(value.citationCount)
			? { citationCount: Math.max(0, Math.floor(value.citationCount)) }
			: {}),
		...(normalizeLiteratureSourceType(value.sourceType)
			? { sourceType: normalizeLiteratureSourceType(value.sourceType) }
			: {}),
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

function normalizeLiteratureSearchRecord(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): LiteratureSearchRecord {
	const createdAt = getStringField(value, "createdAt", getStringField(value, "completedAt", fallbackTime));
	return {
		id: getStringField(value, "id", `literature-search-${index + 1}`),
		...(getOptionalStringField(value, "pathId") ? { pathId: getOptionalStringField(value, "pathId") } : {}),
		...(getOptionalStringField(value, "runId") ? { runId: getOptionalStringField(value, "runId") } : {}),
		queries: getStringArrayField(value, "queries"),
		providers: getArrayField(value, "providers").map(normalizeLiteratureSearchProviderRecord),
		candidateCount: Math.max(0, Math.floor(getNumberField(value, "candidateCount", 0))),
		selectedSourceIds: getStringArrayField(value, "selectedSourceIds"),
		startedAt: getStringField(value, "startedAt", createdAt),
		completedAt: getStringField(value, "completedAt", createdAt),
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

function normalizeResearchEvidenceBoardEntry(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): ResearchEvidenceBoardEntry {
	const createdAt = getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime));
	return {
		id: getStringField(value, "id", `evidence-board-${index + 1}`),
		...(getOptionalStringField(value, "pathId") ? { pathId: getOptionalStringField(value, "pathId") } : {}),
		...(getOptionalStringField(value, "reportId") ? { reportId: getOptionalStringField(value, "reportId") } : {}),
		...(getOptionalStringField(value, "claimSupportId")
			? { claimSupportId: getOptionalStringField(value, "claimSupportId") }
			: {}),
		...(getOptionalStringField(value, "marginNoteId")
			? { marginNoteId: getOptionalStringField(value, "marginNoteId") }
			: {}),
		sourceIds: getStringArrayField(value, "sourceIds"),
		computationalArtifactIds: getStringArrayField(value, "computationalArtifactIds"),
		claim: getStringField(value, "claim", ""),
		classification: normalizeResearchEvidenceClassification(value.classification),
		rationale: getStringField(value, "rationale", ""),
		...(getOptionalStringField(value, "parentEntryId")
			? { parentEntryId: getOptionalStringField(value, "parentEntryId") }
			: {}),
		...(normalizeConjectureRevisionKind(value.revisionKind)
			? { revisionKind: normalizeConjectureRevisionKind(value.revisionKind) }
			: {}),
		...(getOptionalStringField(value, "revisionNote")
			? { revisionNote: getOptionalStringField(value, "revisionNote") }
			: {}),
		createdAt,
		updatedAt: getStringField(value, "updatedAt", createdAt),
	};
}

function normalizeConjectureRevisionKind(value: unknown): ConjectureRevisionKind | undefined {
	if (
		value === "weakened" ||
		value === "strengthened" ||
		value === "specialized" ||
		value === "generalized" ||
		value === "repaired"
	) {
		return value;
	}
	return undefined;
}

function normalizeComputationalArtifact(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): ComputationalArtifact {
	const createdAt = getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime));
	const filePath = getOptionalStringField(value, "filePath");
	return {
		id: getStringField(value, "id", `computation-artifact-${index + 1}`),
		pathId: getStringField(value, "pathId", "path-legacy"),
		...(getOptionalStringField(value, "reportId") ? { reportId: getOptionalStringField(value, "reportId") } : {}),
		...(getOptionalStringField(value, "runId") ? { runId: getOptionalStringField(value, "runId") } : {}),
		kind: normalizeComputationalArtifactKind(value.kind),
		status: normalizeComputationalArtifactStatus(value.status),
		title: getStringField(value, "title", "Computation output"),
		...(filePath && isComputationalArtifactFilePath(filePath)
			? { filePath: normalizeComputationalArtifactFilePath(filePath) }
			: {}),
		...(getOptionalStringField(value, "command") ? { command: getOptionalStringField(value, "command") } : {}),
		...(typeof value.exitCode === "number" && Number.isFinite(value.exitCode) ? { exitCode: value.exitCode } : {}),
		summary: capComputationalArtifactSummary(getStringField(value, "summary", "")),
		createdAt,
		updatedAt: getStringField(value, "updatedAt", createdAt),
	};
}

function normalizeResearchCoordinatorReport(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): ResearchCoordinatorReportRecord {
	const createdAt = getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime));
	return {
		id: getStringField(value, "id", `coordinator-report-${index + 1}`),
		createdAt,
		updatedAt: getStringField(value, "updatedAt", createdAt),
		inputReportIds: getStringArrayField(value, "inputReportIds"),
		inputPathIds: getStringArrayField(value, "inputPathIds"),
		inputSourceIds: getStringArrayField(value, "inputSourceIds"),
		inputComputationalArtifactIds: getStringArrayField(value, "inputComputationalArtifactIds"),
		whatWeKnow: fallbackStringArray(getStringArrayField(value, "whatWeKnow"), "No durable findings were recorded."),
		roadblocks: fallbackStringArray(getStringArrayField(value, "roadblocks"), "No current roadblock was identified."),
		recommendedNextMoves: fallbackResearchCoordinatorNextMoves(
			getArrayField(value, "recommendedNextMoves")
				.map(normalizeResearchCoordinatorNextMoveRecord)
				.filter((move): move is ResearchCoordinatorNextMove => move !== undefined),
		),
		humanHelpUseful: getStringArrayField(value, "humanHelpUseful"),
		...(getOptionalStringField(value, "suggestedPathId")
			? { suggestedPathId: getOptionalStringField(value, "suggestedPathId") }
			: {}),
		...(getOptionalStringField(value, "suggestedPrompt")
			? { suggestedPrompt: getOptionalStringField(value, "suggestedPrompt") }
			: {}),
		...(getOptionalStringField(value, "workingPaperSectionId")
			? { workingPaperSectionId: getOptionalStringField(value, "workingPaperSectionId") }
			: {}),
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
		...(getOptionalStringField(value, "batchId") ? { batchId: getOptionalStringField(value, "batchId") } : {}),
		...(typeof value.batchStepIndex === "number" && Number.isFinite(value.batchStepIndex)
			? { batchStepIndex: Math.max(1, Math.floor(value.batchStepIndex)) }
			: {}),
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

function normalizeResearchBatch(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): ResearchBatchRecord {
	const createdAt = getStringField(value, "createdAt", getStringField(value, "startedAt", fallbackTime));
	const requestedStepCount = Math.min(5, Math.max(1, Math.floor(getNumberField(value, "requestedStepCount", 3))));
	const completedStepCount = Math.min(
		requestedStepCount,
		Math.max(0, Math.floor(getNumberField(value, "completedStepCount", 0))),
	);
	return {
		id: getStringField(value, "id", `research-batch-${index + 1}`),
		status: normalizeResearchBatchStatus(value.status),
		requestedStepCount,
		completedStepCount,
		runIds: getStringArrayField(value, "runIds"),
		...(getOptionalStringField(value, "initialPathId")
			? { initialPathId: getOptionalStringField(value, "initialPathId") }
			: {}),
		...(getOptionalStringField(value, "currentPathId")
			? { currentPathId: getOptionalStringField(value, "currentPathId") }
			: {}),
		...(getOptionalStringField(value, "nextPathId")
			? { nextPathId: getOptionalStringField(value, "nextPathId") }
			: {}),
		...(getOptionalStringField(value, "lastCompletedPathId")
			? { lastCompletedPathId: getOptionalStringField(value, "lastCompletedPathId") }
			: {}),
		...(getOptionalStringField(value, "interruptedRunId")
			? { interruptedRunId: getOptionalStringField(value, "interruptedRunId") }
			: {}),
		...(getOptionalStringField(value, "failureReason")
			? { failureReason: getOptionalStringField(value, "failureReason") }
			: {}),
		...(getOptionalStringField(value, "cancelReason")
			? { cancelReason: getOptionalStringField(value, "cancelReason") }
			: {}),
		createdAt,
		startedAt: getStringField(value, "startedAt", createdAt),
		updatedAt: getStringField(value, "updatedAt", createdAt),
		...(getOptionalStringField(value, "completedAt")
			? { completedAt: getOptionalStringField(value, "completedAt") }
			: {}),
		...(getOptionalStringField(value, "cancelledAt")
			? { cancelledAt: getOptionalStringField(value, "cancelledAt") }
			: {}),
	};
}

function normalizeResearchPlan(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): ResearchPlanRecord {
	const createdAt = getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime));
	return {
		id: getStringField(value, "id", `research-plan-${index + 1}`),
		title: getStringField(value, "title", "Research plan"),
		objective: getStringField(value, "objective", "Make durable progress on the root question."),
		status: normalizeResearchPlanStatus(value.status),
		taskIds: getStringArrayField(value, "taskIds"),
		...(getOptionalStringField(value, "currentTaskId")
			? { currentTaskId: getOptionalStringField(value, "currentTaskId") }
			: {}),
		...(getOptionalStringField(value, "pauseReason")
			? { pauseReason: getOptionalStringField(value, "pauseReason") }
			: {}),
		...(getOptionalStringField(value, "failureReason")
			? { failureReason: getOptionalStringField(value, "failureReason") }
			: {}),
		...(getOptionalStringField(value, "cancelReason")
			? { cancelReason: getOptionalStringField(value, "cancelReason") }
			: {}),
		createdAt,
		...(getOptionalStringField(value, "startedAt") ? { startedAt: getOptionalStringField(value, "startedAt") } : {}),
		updatedAt: getStringField(value, "updatedAt", createdAt),
		...(getOptionalStringField(value, "completedAt")
			? { completedAt: getOptionalStringField(value, "completedAt") }
			: {}),
		...(getOptionalStringField(value, "cancelledAt")
			? { cancelledAt: getOptionalStringField(value, "cancelledAt") }
			: {}),
	};
}

function normalizeResearchPlanTask(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): ResearchPlanTaskRecord {
	const createdAt = getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime));
	return {
		id: getStringField(value, "id", `research-plan-task-${index + 1}`),
		planId: getStringField(value, "planId", "research-plan-1"),
		kind: normalizeResearchPlanTaskKind(value.kind),
		status: normalizeResearchPlanTaskStatus(value.status),
		sequence: Math.max(1, Math.floor(getNumberField(value, "sequence", index + 1))),
		title: getStringField(value, "title", "Research task"),
		description: getStringField(value, "description", "Carry out the next bounded research move."),
		...(getOptionalStringField(value, "goal") ? { goal: getOptionalStringField(value, "goal") } : {}),
		acceptanceCriteria: getStringArrayField(value, "acceptanceCriteria"),
		...(getOptionalStringField(value, "pathId") ? { pathId: getOptionalStringField(value, "pathId") } : {}),
		...(getOptionalStringField(value, "runId") ? { runId: getOptionalStringField(value, "runId") } : {}),
		...(getOptionalStringField(value, "reportId") ? { reportId: getOptionalStringField(value, "reportId") } : {}),
		sourceIds: getStringArrayField(value, "sourceIds"),
		claimSupportIds: getStringArrayField(value, "claimSupportIds"),
		computationalArtifactIds: getStringArrayField(value, "computationalArtifactIds"),
		evidenceEntryIds: getStringArrayField(value, "evidenceEntryIds"),
		...(getOptionalStringField(value, "blockedReason")
			? { blockedReason: getOptionalStringField(value, "blockedReason") }
			: {}),
		...(getOptionalStringField(value, "failureReason")
			? { failureReason: getOptionalStringField(value, "failureReason") }
			: {}),
		createdAt,
		...(getOptionalStringField(value, "startedAt") ? { startedAt: getOptionalStringField(value, "startedAt") } : {}),
		updatedAt: getStringField(value, "updatedAt", createdAt),
		...(getOptionalStringField(value, "completedAt")
			? { completedAt: getOptionalStringField(value, "completedAt") }
			: {}),
	};
}

function normalizeResearchPlanStatus(value: unknown): ResearchPlanStatus {
	if (
		value === "active" ||
		value === "paused" ||
		value === "completed" ||
		value === "failed" ||
		value === "cancelled"
	) {
		return value;
	}
	return "paused";
}

function normalizeResearchPlanTaskStatus(value: unknown): ResearchPlanTaskStatus {
	if (
		value === "pending" ||
		value === "running" ||
		value === "completed" ||
		value === "blocked" ||
		value === "failed" ||
		value === "cancelled"
	) {
		return value;
	}
	return "pending";
}

function normalizeResearchPlanTaskKind(value: unknown): ResearchPlanTaskKind {
	if (
		value === "literature-search" ||
		value === "proof-attempt" ||
		value === "refutation-attempt" ||
		value === "computation" ||
		value === "critic" ||
		value === "synthesis" ||
		value === "source-refresh" ||
		value === "revise-conjecture" ||
		value === "export"
	) {
		return value;
	}
	return "synthesis";
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
	if (value === "literature-search" || value === "computation") {
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
		value === "failed" ||
		value === "interrupted"
	) {
		return value;
	}
	return "running";
}

function normalizeResearchBatchStatus(value: unknown): ResearchBatchStatus {
	if (
		value === "running" ||
		value === "paused" ||
		value === "completed" ||
		value === "failed" ||
		value === "cancelled"
	) {
		return value;
	}
	return "paused";
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

function normalizeLiteratureSourceProvider(value: unknown): LiteratureSourceProvider | undefined {
	if (
		value === "workspace" ||
		value === "arxiv" ||
		value === "semantic-scholar" ||
		value === "crossref" ||
		value === "openalex" ||
		value === "user-provided" ||
		value === "unknown"
	) {
		return value;
	}
	return undefined;
}

function normalizeLiteratureSourceType(value: unknown): LiteratureSourceType | undefined {
	if (
		value === "preprint" ||
		value === "journal" ||
		value === "conference" ||
		value === "book" ||
		value === "web" ||
		value === "unknown"
	) {
		return value;
	}
	return undefined;
}

function normalizeLiteratureSearchProviderStatus(value: unknown): LiteratureSearchProviderStatus {
	if (value === "completed" || value === "failed" || value === "skipped") {
		return value;
	}
	return "failed";
}

function normalizeLiteratureSearchProviderRecord(value: Record<string, unknown>): LiteratureSearchProviderRecord {
	return {
		provider: normalizeLiteratureSourceProvider(value.provider) ?? "unknown",
		query: getStringField(value, "query", ""),
		status: normalizeLiteratureSearchProviderStatus(value.status),
		candidateCount: Math.max(0, Math.floor(getNumberField(value, "candidateCount", 0))),
		...(getOptionalStringField(value, "error") ? { error: getOptionalStringField(value, "error") } : {}),
	};
}

function normalizeLiteratureSearchProviderInput(value: LiteratureSearchProviderRecord): LiteratureSearchProviderRecord {
	return {
		provider: normalizeLiteratureSourceProvider(value.provider) ?? "unknown",
		query: value.query.trim(),
		status: normalizeLiteratureSearchProviderStatus(value.status),
		candidateCount: Math.max(0, Math.floor(value.candidateCount)),
		...(value.error?.trim() ? { error: value.error.trim() } : {}),
	};
}

function normalizeLiteratureClaimSupportStatus(value: unknown): LiteratureClaimSupportStatus {
	if (value === "supported" || value === "partially-supported" || value === "unsupported" || value === "conflicting") {
		return value;
	}
	return "unsupported";
}

function normalizeResearchEvidenceClassification(value: unknown): ResearchEvidenceClassification {
	if (
		value === "theorem" ||
		value === "conjecture" ||
		value === "heuristic" ||
		value === "computation" ||
		value === "survey-context" ||
		value === "unsupported" ||
		value === "conflicting"
	) {
		return value;
	}
	return "unsupported";
}

function normalizeComputationalArtifactKind(value: unknown): ComputationalArtifactKind {
	if (value === "script" || value === "stdout" || value === "stderr" || value === "table" || value === "summary") {
		return value;
	}
	return "summary";
}

function normalizeComputationalArtifactStatus(value: unknown): ComputationalArtifactStatus {
	if (value === "created" || value === "completed" || value === "failed" || value === "blocked") {
		return value;
	}
	return "completed";
}

function normalizeResearchCoordinatorNextMovePriority(value: unknown): ResearchCoordinatorNextMovePriority {
	if (value === "high" || value === "medium" || value === "low") {
		return value;
	}
	return "medium";
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
	if (
		value === "gap" ||
		value === "todo" ||
		value === "warning" ||
		value === "provenance" ||
		value === "comment" ||
		value === "scrutiny"
	) {
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
		value === "research_batch_recorded" ||
		value === "research_plan_recorded" ||
		value === "research_plan_task_recorded" ||
		value === "literature_source_recorded" ||
		value === "literature_search_recorded" ||
		value === "literature_claim_support_recorded" ||
		value === "research_evidence_board_entry_recorded" ||
		value === "computational_artifact_recorded" ||
		value === "research_coordinator_report_recorded"
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

function normalizeResearchCoordinatorNextMoveInput(
	move: ResearchCoordinatorNextMove,
): ResearchCoordinatorNextMove | undefined {
	const title = move.title.trim();
	const rationale = move.rationale.trim();
	if (!title && !rationale) {
		return undefined;
	}
	return {
		title: title || "Recommended next move",
		...(move.pathId?.trim() ? { pathId: move.pathId.trim() } : {}),
		rationale: rationale || "This move follows from the current project state.",
		...(move.prompt?.trim() ? { prompt: move.prompt.trim() } : {}),
		priority: normalizeResearchCoordinatorNextMovePriority(move.priority),
	};
}

function normalizeResearchCoordinatorNextMoveRecord(
	value: Record<string, unknown>,
): ResearchCoordinatorNextMove | undefined {
	const title = getStringField(value, "title", "").trim();
	const rationale = getStringField(value, "rationale", "").trim();
	if (!title && !rationale) {
		return undefined;
	}
	return {
		title: title || "Recommended next move",
		...(getOptionalStringField(value, "pathId") ? { pathId: getOptionalStringField(value, "pathId") } : {}),
		rationale: rationale || "This move follows from the current project state.",
		...(getOptionalStringField(value, "prompt") ? { prompt: getOptionalStringField(value, "prompt") } : {}),
		priority: normalizeResearchCoordinatorNextMovePriority(value.priority),
	};
}

function fallbackResearchCoordinatorNextMoves(moves: ResearchCoordinatorNextMove[]): ResearchCoordinatorNextMove[] {
	if (moves.length > 0) {
		return moves;
	}
	return [
		{
			title: "Choose a research path to continue",
			rationale: "No specific next move was identified from the current project state.",
			priority: "medium",
		},
	];
}

function sanitizeStringArray(values: readonly string[]): string[] {
	return uniqueStrings(values.map((value) => value.trim()).filter((value) => value.length > 0));
}

function fallbackStringArray(values: readonly string[], fallback: string): string[] {
	const normalized = sanitizeStringArray(values);
	return normalized.length > 0 ? normalized : [fallback];
}

function capComputationalArtifactSummary(summary: string): string {
	const trimmed = summary.trim();
	if (trimmed.length <= COMPUTATIONAL_ARTIFACT_SUMMARY_LIMIT) {
		return trimmed;
	}
	return `${trimmed.slice(0, COMPUTATIONAL_ARTIFACT_SUMMARY_LIMIT - 3)}...`;
}

function normalizeComputationalArtifactFilePath(filePath: string): string {
	const normalized = filePath.trim().replaceAll("\\", "/").replace(/^\.\//, "");
	if (!isComputationalArtifactFilePath(normalized)) {
		throw new Error("Computational artifact filePath must be under .pi/co-math/artifacts/.");
	}
	return normalized;
}

function isComputationalArtifactFilePath(filePath: string): boolean {
	const normalized = filePath.trim().replaceAll("\\", "/").replace(/^\.\//, "");
	if (!normalized.startsWith(".pi/co-math/artifacts/")) {
		return false;
	}
	if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
		return false;
	}
	return !normalized.split("/").includes("..");
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

function classificationLabel(classification: ResearchEvidenceClassification): string {
	if (classification === "survey-context") {
		return "survey/context";
	}
	return classification;
}

function uniqueStrings(values: readonly string[]): string[] {
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
