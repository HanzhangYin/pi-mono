import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import * as path from "node:path";
import {
	mathClaimsNearlyMatch,
	namesDifferentMathExpressions,
	normalizeTheoremKey,
	stripMathDecorations,
	textsNearlyMatch,
} from "./comath-text-similarity.ts";
import type {
	ArtifactKind,
	ArtifactRecord,
	Claim,
	ClaimRevisionRecord,
	ClaimStatus,
	CoMathActor,
	CoMathCanonicalProjection,
	CoMathEventKind,
	CoMathProjectState,
	CoMathRole,
	CoMathSourceCitationEligibility,
	CoMathSourceClaimScope,
	CoMathSourceIndexRecord,
	CoMathWorkspaceSourceRole,
	ComputationalArtifact,
	ComputationalArtifactKind,
	ComputationalArtifactStatus,
	ConjectureRevisionKind,
	Evidence,
	EvidenceKind,
	GoalStatus,
	GroundingReferenceRecord,
	GroundingValidationFailure,
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
	ResearchAttemptFailure,
	ResearchBatchRecord,
	ResearchBatchStatus,
	ResearchClaimCategory,
	ResearchConstraintKind,
	ResearchConstraintOrigin,
	ResearchConstraintRecord,
	ResearchCoordinatorNextMove,
	ResearchCoordinatorNextMovePriority,
	ResearchCoordinatorReportRecord,
	ResearchEvidenceBoardEntry,
	ResearchEvidenceClassification,
	ResearchExecutionRecord,
	ResearchFocus,
	ResearchObligationRecord,
	ResearchObligationStatus,
	ResearchPath,
	ResearchPathStatus,
	ResearchPivotRecord,
	ResearchPlanRecord,
	ResearchPlanStatus,
	ResearchPlanTaskKind,
	ResearchPlanTaskRecord,
	ResearchPlanTaskRequiredCapability,
	ResearchPlanTaskStatus,
	ResearchRunModelCallRecord,
	ResearchTaskAttemptRecord,
	ResearchTaskAttemptStageRecord,
	ResearchTaskAttemptStatus,
	ResearchTaskPipelineStage,
	ResearchTaskProgressKind,
	ResearchTaskReviewOutcome,
	ResearchTaskSourceRequest,
	ResearchWorkstreamIncrementalReportRecord,
	ResearchWorkstreamReportAcceptanceStatus,
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
	TheoremApplicabilityCheckRecord,
	TheoremApplicabilityStatus,
	TheoremHypothesisCheck,
	TheoremHypothesisStatus,
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
	| "researchTaskAttempts"
	| "researchExecutions"
	| "canonicalProjection"
	| "researchObligations"
	| "researchConstraints"
	| "theoremApplicabilityChecks"
	| "researchPivots"
	| "literatureSources"
	| "literatureSearches"
	| "literatureClaimSupports"
	| "sourceIndexes"
	| "researchEvidenceBoard"
	| "computationalArtifacts"
	| "groundingReferences"
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
				| "researchTaskAttempts"
				| "researchExecutions"
				| "canonicalProjection"
				| "researchObligations"
				| "researchConstraints"
				| "theoremApplicabilityChecks"
				| "researchPivots"
				| "literatureSources"
				| "literatureSearches"
				| "literatureClaimSupports"
				| "sourceIndexes"
				| "researchEvidenceBoard"
				| "computationalArtifacts"
				| "groundingReferences"
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

export interface AddResearchCoordinatorReportInput {
	id?: string;
	inputReportIds?: string[];
	inputPathIds?: string[];
	inputSourceIds?: string[];
	inputComputationalArtifactIds?: string[];
	inputReviewFingerprint?: string;
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
	workspaceRole?: CoMathWorkspaceSourceRole;
	citationEligibility?: CoMathSourceCitationEligibility;
	sourceIndexId?: string;
	sourceRevisionId?: string;
	sourceRelativePath?: string;
	sourceFileSha256?: string;
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
	groundingReferenceIds?: readonly string[];
	groundingFailures?: readonly GroundingValidationFailure[];
	sourceScope?: CoMathSourceClaimScope;
	now: string;
	actor?: CoMathActor;
}

export interface UpdateLiteratureClaimGroundingInput {
	claimSupportId: string;
	groundingReferenceIds?: readonly string[];
	groundingFailures?: readonly GroundingValidationFailure[];
	sourceScope?: CoMathSourceClaimScope;
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
	claimCategory?: ResearchClaimCategory;
	rationale: string;
	parentEntryId?: string;
	revisionKind?: ConjectureRevisionKind;
	revisionNote?: string;
	now: string;
	actor?: CoMathActor;
}

export interface AddGroundingReferenceInput {
	id?: string;
	subject: GroundingReferenceRecord["subject"];
	relation: GroundingReferenceRecord["relation"];
	artifactId: string;
	locator: GroundingReferenceRecord["locator"];
	excerpt?: string;
	excerptSha256?: string;
	sourceIndexId?: string;
	sourceRevisionId?: string;
	sourceRelativePath?: string;
	sourceFileSha256?: string;
	regionKind?: GroundingReferenceRecord["regionKind"];
	modelCallId?: string;
	validationStatus: GroundingReferenceRecord["validationStatus"];
	now: string;
	actor?: CoMathActor;
}

export interface AddCoMathSourceIndexInput {
	id?: string;
	sourceId: string;
	sourceRevisionId: string;
	sourceManifestSha256: string;
	indexArtifactId: string;
	indexPath: string;
	indexSha256: string;
	policyVersion: number;
	status: CoMathSourceIndexRecord["status"];
	fileCount: number;
	documentCount: number;
	warnings?: readonly string[];
	now: string;
	actor?: CoMathActor;
}

export interface LinkLiteratureSourcesToIndexInput {
	sourceRevisionId: string;
	sourceIndexId: string;
	indexContext: string;
	sourceFiles: readonly { relativePath: string; sha256: string }[];
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
	/** Omit for the immediately preceding task; pass [] to declare independence. */
	dependsOnTaskIds?: readonly string[];
	requiredCapabilities?: readonly ResearchPlanTaskRequiredCapability[];
	sourceRequests?: readonly ResearchTaskSourceRequest[];
	repairOfTaskId?: string;
	repairGeneration?: number;
	supersededByTaskId?: string;
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
	progressKind?: ResearchTaskProgressKind;
	reviewOutcome?: ResearchTaskReviewOutcome;
	blockedReason?: string;
	failureReason?: string;
	clearBlockedReason?: boolean;
	clearFailureReason?: boolean;
	clearReviewOutcome?: boolean;
	clearStartedAt?: boolean;
	clearCompletedAt?: boolean;
	startedAt?: string;
	completedAt?: string;
	now: string;
	actor?: CoMathActor;
}

export interface InsertResearchPlanRepairTaskInput {
	planId: string;
	rejectedTaskId: string;
	rejectionReason: string;
	now: string;
	actor: CoMathActor;
}

export interface InsertResearchPlanRepairTaskResult {
	state: CoMathProjectState;
	repairTask: ResearchPlanTaskRecord;
	rewiredTaskIds: string[];
}

export interface AddResearchObligationInput {
	id?: string;
	statement: string;
	assumptions?: readonly string[];
	parentObligationId?: string;
	evidenceEntryIds?: readonly string[];
	computationalArtifactIds?: readonly string[];
	refutationEvidenceEntryIds?: readonly string[];
	gaps?: readonly string[];
	status?: Exclude<ResearchObligationStatus, "established">;
	statusReason?: string;
	taskId?: string;
	reportId?: string;
	now: string;
	actor?: CoMathActor;
}

export interface UpdateResearchObligationInput {
	obligationId: string;
	status?: ResearchObligationStatus;
	statusReason?: string;
	addAssumptions?: readonly string[];
	addEvidenceEntryIds?: readonly string[];
	addComputationalArtifactIds?: readonly string[];
	addRefutationEvidenceEntryIds?: readonly string[];
	addGaps?: readonly string[];
	clearGaps?: boolean;
	reviewedCleanAt?: string;
	taskId?: string;
	reportId?: string;
	now: string;
	actor?: CoMathActor;
}

export interface ResearchObligationEstablishmentGate {
	ok: boolean;
	reasons: string[];
}

export interface AddResearchConstraintInput {
	id?: string;
	text: string;
	kind?: ResearchConstraintKind;
	origin?: ResearchConstraintOrigin;
	now: string;
	actor?: CoMathActor;
}

export interface RetireResearchConstraintInput {
	constraintId: string;
	reason: string;
	now: string;
	actor?: CoMathActor;
}

export interface AddTheoremApplicabilityCheckInput {
	id?: string;
	theorem: string;
	targetObject: string;
	hypotheses?: readonly TheoremHypothesisCheck[];
	status: TheoremApplicabilityStatus;
	consequence?: string;
	pathId?: string;
	reportId?: string;
	taskId?: string;
	sourceIds?: readonly string[];
	now: string;
	actor?: CoMathActor;
}

export interface AddResearchPivotInput {
	id?: string;
	fromRoute: string;
	toRoute: string;
	reason: string;
	pathId?: string;
	taskId?: string;
	reportId?: string;
	applicabilityCheckId?: string;
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
		version: 2,
		revision: 0,
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
		researchTaskAttempts: [],
		researchExecutions: [],
		researchObligations: [],
		researchConstraints: [],
		theoremApplicabilityChecks: [],
		researchPivots: [],
		literatureSources: [],
		literatureSearches: [],
		literatureClaimSupports: [],
		sourceIndexes: [],
		researchEvidenceBoard: [],
		computationalArtifacts: [],
		groundingReferences: [],
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
		...(input.inputReviewFingerprint?.trim() ? { inputReviewFingerprint: input.inputReviewFingerprint.trim() } : {}),
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
		...(input.workspaceRole ? { workspaceRole: input.workspaceRole } : {}),
		...(input.citationEligibility ? { citationEligibility: input.citationEligibility } : {}),
		...(input.sourceIndexId?.trim() ? { sourceIndexId: input.sourceIndexId.trim() } : {}),
		...(input.sourceRevisionId?.trim() ? { sourceRevisionId: input.sourceRevisionId.trim() } : {}),
		...(input.sourceRelativePath?.trim() ? { sourceRelativePath: input.sourceRelativePath.trim() } : {}),
		...(input.sourceFileSha256?.trim() ? { sourceFileSha256: input.sourceFileSha256.trim() } : {}),
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
		groundingReferenceIds: uniqueStrings(input.groundingReferenceIds ?? []),
		groundingFailures: normalizeGroundingValidationFailures(input.groundingFailures ?? []),
		...(input.sourceScope ? { sourceScope: input.sourceScope } : {}),
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

export function updateLiteratureClaimGrounding(
	state: CoMathProjectState,
	input: UpdateLiteratureClaimGroundingInput,
): CoMathProjectState {
	const support = state.literatureClaimSupports.find((candidate) => candidate.id === input.claimSupportId);
	if (!support) return state;
	const groundingReferenceIds = uniqueStrings([
		...(support.groundingReferenceIds ?? []),
		...(input.groundingReferenceIds ?? []),
	]);
	const groundingFailures = normalizeGroundingValidationFailures([
		...(support.groundingFailures ?? []),
		...(input.groundingFailures ?? []),
	]);
	return {
		...state,
		literatureClaimSupports: state.literatureClaimSupports.map((candidate) =>
			candidate.id === input.claimSupportId
				? {
						...candidate,
						groundingReferenceIds,
						groundingFailures,
						...(input.sourceScope ? { sourceScope: input.sourceScope } : {}),
						updatedAt: input.now,
					}
				: candidate,
		),
		updatedAt: input.now,
	};
}

export function addCoMathSourceIndex(state: CoMathProjectState, input: AddCoMathSourceIndexInput): CoMathProjectState {
	const existing = state.sourceIndexes.find(
		(index) => index.sourceRevisionId === input.sourceRevisionId && index.indexSha256 === input.indexSha256,
	);
	if (existing) return state;
	const id = input.id?.trim() || `source-index-${state.sourceIndexes.length + 1}`;
	if (state.sourceIndexes.some((index) => index.id === id)) throw new Error(`Duplicate source index id: ${id}`);
	const record: CoMathSourceIndexRecord = {
		id,
		sourceId: input.sourceId.trim(),
		sourceRevisionId: input.sourceRevisionId.trim(),
		sourceManifestSha256: input.sourceManifestSha256.trim(),
		indexArtifactId: input.indexArtifactId.trim(),
		indexPath: input.indexPath.trim(),
		indexSha256: input.indexSha256.trim(),
		policyVersion: input.policyVersion,
		status: input.status,
		fileCount: Math.max(0, Math.floor(input.fileCount)),
		documentCount: Math.max(0, Math.floor(input.documentCount)),
		warnings: sanitizeStringArray(input.warnings ?? []),
		createdAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{ ...state, sourceIndexes: [...state.sourceIndexes, record], updatedAt: input.now },
		{
			kind: "artifact_recorded",
			actor: input.actor,
			summary: `Recorded source index ${id} for ${record.sourceRevisionId}`,
			subjectId: id,
			relatedIds: [record.indexArtifactId],
			now: input.now,
		},
	);
}

export function linkLiteratureSourcesToIndex(
	state: CoMathProjectState,
	input: LinkLiteratureSourcesToIndexInput,
): CoMathProjectState {
	const revision = input.sourceRevisionId.trim();
	if (!revision) return state;
	const filesByExternalId = new Map<string, { relativePath: string; sha256: string }>(
		input.sourceFiles.map((file) => [`${revision}:${file.sha256}`, file] as const),
	);
	return {
		...state,
		literatureSources: state.literatureSources.map((source) => {
			if (source.provider !== "workspace" || !source.externalId?.startsWith(revision)) return source;
			const file = filesByExternalId.get(source.externalId);
			return {
				...source,
				sourceIndexId: input.sourceIndexId,
				sourceRevisionId: revision,
				...(file ? { sourceRelativePath: file.relativePath, sourceFileSha256: file.sha256 } : {}),
				...(source.externalId === revision ? { extractedText: input.indexContext } : {}),
				updatedAt: input.now,
			};
		}),
		updatedAt: input.now,
	};
}

export function addResearchEvidenceBoardEntry(
	state: CoMathProjectState,
	input: AddResearchEvidenceBoardEntryInput,
): CoMathProjectState {
	return upsertResearchEvidenceBoardEntry(state, input).state;
}

export function addGroundingReference(
	state: CoMathProjectState,
	input: AddGroundingReferenceInput,
): CoMathProjectState {
	const subjectId = input.subject.id.trim();
	const artifactId = input.artifactId.trim();
	if (!subjectId || !artifactId) {
		throw new Error("Grounding references require a subject id and artifact id.");
	}
	const id = input.id?.trim() || `grounding-${(state.groundingReferences?.length ?? 0) + 1}`;
	if ((state.groundingReferences ?? []).some((reference) => reference.id === id)) {
		throw new Error(`Duplicate grounding reference id: ${id}`);
	}
	const reference: GroundingReferenceRecord = {
		id,
		subject: { kind: input.subject.kind, id: subjectId },
		relation: input.relation,
		artifactId,
		locator: input.locator,
		...(input.excerpt?.trim() ? { excerpt: input.excerpt.trim().slice(0, 1_000) } : {}),
		...(input.excerptSha256?.trim() ? { excerptSha256: input.excerptSha256.trim() } : {}),
		...(input.sourceIndexId?.trim() ? { sourceIndexId: input.sourceIndexId.trim() } : {}),
		...(input.sourceRevisionId?.trim() ? { sourceRevisionId: input.sourceRevisionId.trim() } : {}),
		...(input.sourceRelativePath?.trim() ? { sourceRelativePath: input.sourceRelativePath.trim() } : {}),
		...(input.sourceFileSha256?.trim() ? { sourceFileSha256: input.sourceFileSha256.trim() } : {}),
		...(input.regionKind ? { regionKind: input.regionKind } : {}),
		...(input.modelCallId?.trim() ? { modelCallId: input.modelCallId.trim() } : {}),
		validationStatus: input.validationStatus,
		createdAt: input.now,
	};
	return appendEvent(
		{
			...state,
			groundingReferences: [...(state.groundingReferences ?? []), reference],
			updatedAt: input.now,
		},
		{
			kind: "grounding_reference_recorded",
			actor: input.actor,
			summary: `Recorded ${reference.relation} grounding ${id} for ${subjectId}`,
			subjectId: id,
			relatedIds: [subjectId, artifactId],
			now: input.now,
		},
	);
}

export interface UpsertResearchEvidenceBoardEntryResult {
	state: CoMathProjectState;
	/** The id of the entry now carrying this claim: the new entry, or the duplicate it merged into. */
	entryId: string;
	/** True when the claim restated an existing entry and was merged instead of appended. */
	merged: boolean;
}

/**
 * Record an evidence-board entry, merging restatements instead of appending them. The same
 * gap/limitation/claim routinely arrives from several origins (report gaps, margin notes, reviewer
 * concerns, claim supports) in slightly different wording; those merge into the first entry —
 * keeping its text and rationale — with the newcomer's source and computation links folded in so
 * no provenance is lost. Claims that name different mathematics are never merged, and lineage
 * records (statement revisions) always append: a revised statement is deliberately a new entry.
 */
export function upsertResearchEvidenceBoardEntry(
	state: CoMathProjectState,
	input: AddResearchEvidenceBoardEntryInput,
): UpsertResearchEvidenceBoardEntryResult {
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
	const isLineageRecord = !!input.parentEntryId?.trim();
	const duplicate = isLineageRecord
		? undefined
		: state.researchEvidenceBoard.find(
				(entry) =>
					entry.classification === input.classification &&
					entry.parentEntryId === undefined &&
					mathClaimsNearlyMatch(entry.claim, claim),
			);
	if (duplicate) {
		const mergedSourceIds = uniqueStrings([...duplicate.sourceIds, ...sourceIds]);
		const mergedComputationalArtifactIds = uniqueStrings([
			...duplicate.computationalArtifactIds,
			...computationalArtifactIds,
		]);
		const linksChanged =
			mergedSourceIds.length !== duplicate.sourceIds.length ||
			mergedComputationalArtifactIds.length !== duplicate.computationalArtifactIds.length;
		if (!linksChanged) {
			return { state, entryId: duplicate.id, merged: true };
		}
		const nextState = appendEvent(
			{
				...state,
				researchEvidenceBoard: state.researchEvidenceBoard.map((entry) =>
					entry.id === duplicate.id
						? {
								...entry,
								sourceIds: mergedSourceIds,
								computationalArtifactIds: mergedComputationalArtifactIds,
								updatedAt: input.now,
							}
						: entry,
				),
				updatedAt: input.now,
			},
			{
				kind: "research_evidence_board_entry_recorded",
				actor: input.actor,
				summary: `Merged a restated claim into evidence board entry ${duplicate.id}`,
				subjectId: duplicate.id,
				relatedIds: uniqueStrings([...sourceIds, ...computationalArtifactIds]),
				now: input.now,
			},
		);
		return { state: nextState, entryId: duplicate.id, merged: true };
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
		...(input.claimCategory ? { claimCategory: input.claimCategory } : {}),
		rationale,
		...(parentExists ? { parentEntryId } : {}),
		...(parentExists && input.revisionKind ? { revisionKind: input.revisionKind } : {}),
		...(parentExists && input.revisionNote?.trim() ? { revisionNote: input.revisionNote.trim() } : {}),
		createdAt: input.now,
		updatedAt: input.now,
	};
	const nextState = appendEvent(
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
	return { state: nextState, entryId: id, merged: false };
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
	const priorTasks = getResearchPlanTasks(state, plan.id);
	const sequence = priorTasks.length + 1;
	const requestedDependencies = input.dependsOnTaskIds;
	const dependsOnTaskIds =
		requestedDependencies === undefined
			? priorTasks.at(-1)
				? [priorTasks.at(-1)!.id]
				: []
			: uniqueStrings(requestedDependencies.map((dependencyId) => dependencyId.trim()).filter(Boolean));
	const priorTaskIds = new Set(priorTasks.map((task) => task.id));
	if (dependsOnTaskIds.some((dependencyId) => !priorTaskIds.has(dependencyId))) {
		throw new Error("Research plan task dependencies must reference earlier tasks in the same plan.");
	}
	const requiredCapabilities = uniqueResearchPlanTaskRequiredCapabilities([
		...(input.requiredCapabilities ?? []),
		...requiredCapabilitiesForTaskKind(input.kind),
	]);
	const repairOfTaskId = input.repairOfTaskId?.trim();
	const repairGeneration = normalizeRepairGeneration(input.repairGeneration);
	const supersededByTaskId = input.supersededByTaskId?.trim();
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
		dependsOnTaskIds,
		requiredCapabilities,
		sourceRequests: normalizeResearchTaskSourceRequests(input.sourceRequests),
		attemptIds: [],
		...(repairOfTaskId ? { repairOfTaskId } : {}),
		...(repairGeneration !== undefined ? { repairGeneration } : {}),
		...(supersededByTaskId ? { supersededByTaskId } : {}),
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

export const MAX_RESEARCH_PLAN_REPAIR_GENERATIONS = 3;

/**
 * Insert one deterministic repair task for an independently rejected task. The rejected attempt
 * remains intact; only its successor link and unfinished dependent edges change. This is a pure
 * transform so a transaction retry can safely apply it again.
 */
export function insertResearchPlanRepairTask(
	state: CoMathProjectState,
	input: InsertResearchPlanRepairTaskInput,
): InsertResearchPlanRepairTaskResult {
	const plan = state.researchPlans.find((candidate) => candidate.id === input.planId);
	if (!plan) {
		throw new Error(`Unknown research plan: ${input.planId}`);
	}
	const rejectedTask = state.researchPlanTasks.find(
		(candidate) => candidate.id === input.rejectedTaskId && candidate.planId === plan.id,
	);
	if (!rejectedTask) {
		throw new Error(`Unknown research plan task: ${input.rejectedTaskId}`);
	}
	if (rejectedTask.reviewOutcome !== "rejected") {
		throw new Error(`Research plan task ${rejectedTask.id} was not rejected by independent review.`);
	}
	const rejectionReason = input.rejectionReason.trim();
	if (!rejectionReason) {
		throw new Error("A repair task requires the independent review rejection reason.");
	}
	const existingRepair = state.researchPlanTasks.find(
		(candidate) =>
			candidate.planId === plan.id &&
			candidate.repairOfTaskId === rejectedTask.id &&
			(candidate.status === "pending" || candidate.status === "running" || candidate.status === "completed"),
	);
	if (existingRepair) {
		return { state, repairTask: existingRepair, rewiredTaskIds: [] };
	}
	const repairGeneration = (rejectedTask.repairGeneration ?? 0) + 1;
	if (repairGeneration > MAX_RESEARCH_PLAN_REPAIR_GENERATIONS) {
		throw new Error(
			`Research plan task ${rejectedTask.id} has reached the ${MAX_RESEARCH_PLAN_REPAIR_GENERATIONS}-generation repair limit.`,
		);
	}
	const repairTaskId = `research-plan-repair-${rejectedTask.id}-${repairGeneration}`;
	const sameIdTask = state.researchPlanTasks.find((candidate) => candidate.id === repairTaskId);
	if (sameIdTask) {
		if (sameIdTask.planId === plan.id && sameIdTask.repairOfTaskId === rejectedTask.id) {
			return { state, repairTask: sameIdTask, rewiredTaskIds: [] };
		}
		throw new Error(`Duplicate research plan task id: ${repairTaskId}`);
	}
	const tasks = getResearchPlanTasks(state, plan.id);
	const rejectedIndex = tasks.findIndex((candidate) => candidate.id === rejectedTask.id);
	if (rejectedIndex < 0) {
		throw new Error(`Research plan task ${rejectedTask.id} is not part of plan ${plan.id}.`);
	}
	const originalGoal = rejectedTask.goal ?? rejectedTask.description;
	const repairTask: ResearchPlanTaskRecord = {
		id: repairTaskId,
		planId: plan.id,
		kind: rejectedTask.kind,
		status: "pending",
		sequence: rejectedTask.sequence + 1,
		title: `Repair: ${rejectedTask.title}`,
		description: `Address the independent review concern while preserving the original task objective: ${originalGoal}`,
		goal: `Address the independent review of ${rejectedTask.id}:\n${rejectionReason}\n\nPreserve the original task goal:\n${originalGoal}`,
		acceptanceCriteria: uniqueStrings([
			`Resolve the independent review concern: ${rejectionReason}`,
			...rejectedTask.acceptanceCriteria,
		]),
		dependsOnTaskIds: [...rejectedTask.dependsOnTaskIds],
		requiredCapabilities: uniqueResearchPlanTaskRequiredCapabilities([
			...rejectedTask.requiredCapabilities,
			...requiredCapabilitiesForTaskKind(rejectedTask.kind),
			"independent-review",
		]),
		sourceRequests: (rejectedTask.sourceRequests ?? []).map((request) => ({
			sourceId: request.sourceId,
			ranges: request.ranges.map((range) => ({ ...range })),
		})),
		...(rejectedTask.pathId ? { pathId: rejectedTask.pathId } : {}),
		repairOfTaskId: rejectedTask.id,
		repairGeneration,
		attemptIds: [],
		sourceIds: [],
		claimSupportIds: [],
		computationalArtifactIds: [],
		evidenceEntryIds: [],
		createdAt: input.now,
		updatedAt: input.now,
	};
	const unfinishedTaskIds = new Set(
		tasks
			.filter((candidate) => candidate.status !== "completed" && candidate.status !== "cancelled")
			.map((candidate) => candidate.id),
	);
	const rewiredTaskIds: string[] = [];
	const transformedPlanTasks = state.researchPlanTasks.map((candidate) => {
		if (candidate.id === rejectedTask.id) {
			return { ...candidate, supersededByTaskId: repairTask.id, updatedAt: input.now };
		}
		if (
			candidate.planId !== plan.id ||
			!unfinishedTaskIds.has(candidate.id) ||
			!candidate.dependsOnTaskIds.includes(rejectedTask.id)
		) {
			return candidate.sequence > rejectedTask.sequence && candidate.planId === plan.id
				? { ...candidate, sequence: candidate.sequence + 1, updatedAt: input.now }
				: candidate;
		}
		rewiredTaskIds.push(candidate.id);
		return {
			...candidate,
			sequence: candidate.sequence > rejectedTask.sequence ? candidate.sequence + 1 : candidate.sequence,
			dependsOnTaskIds: uniqueStrings(
				candidate.dependsOnTaskIds.map((dependencyId) =>
					dependencyId === rejectedTask.id ? repairTask.id : dependencyId,
				),
			),
			updatedAt: input.now,
		};
	});
	const nextTasks = [...transformedPlanTasks, repairTask];
	const orderedTaskIds = [...tasks.map((candidate) => candidate.id)];
	orderedTaskIds.splice(rejectedIndex + 1, 0, repairTask.id);
	validateResearchPlanTaskGraph(
		nextTasks.filter((candidate) => candidate.planId === plan.id),
		orderedTaskIds,
	);
	const nextState = appendEvent(
		{
			...state,
			researchPlans: state.researchPlans.map((candidate) =>
				candidate.id === plan.id ? { ...candidate, taskIds: orderedTaskIds, updatedAt: input.now } : candidate,
			),
			researchPlanTasks: nextTasks,
			updatedAt: input.now,
		},
		{
			kind: "research_plan_task_recorded",
			actor: input.actor,
			summary: `Created repair task ${repairTask.id} for rejected task ${rejectedTask.id}.`,
			subjectId: repairTask.id,
			relatedIds: [plan.id, rejectedTask.id, ...rewiredTaskIds],
			now: input.now,
		},
	);
	return { state: nextState, repairTask, rewiredTaskIds };
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
			researchPlanTasks: state.researchPlanTasks.map((candidate) => {
				if (candidate.id !== input.taskId) return candidate;
				const updated: ResearchPlanTaskRecord = {
					...candidate,
					...(input.status ? { status: input.status } : {}),
					...(input.runId?.trim() ? { runId: input.runId.trim() } : {}),
					...(input.reportId?.trim() ? { reportId: input.reportId.trim() } : {}),
					sourceIds: uniqueStrings([...candidate.sourceIds, ...(input.addSourceIds ?? [])]),
					claimSupportIds: uniqueStrings([...candidate.claimSupportIds, ...(input.addClaimSupportIds ?? [])]),
					computationalArtifactIds: uniqueStrings([
						...candidate.computationalArtifactIds,
						...(input.addComputationalArtifactIds ?? []),
					]),
					evidenceEntryIds: uniqueStrings([...candidate.evidenceEntryIds, ...(input.addEvidenceEntryIds ?? [])]),
					...(input.progressKind ? { progressKind: input.progressKind } : {}),
					...(input.reviewOutcome ? { reviewOutcome: input.reviewOutcome } : {}),
					...(input.blockedReason?.trim() ? { blockedReason: input.blockedReason.trim() } : {}),
					...(input.failureReason?.trim() ? { failureReason: input.failureReason.trim() } : {}),
					...(input.startedAt ? { startedAt: input.startedAt } : {}),
					...(input.completedAt ? { completedAt: input.completedAt } : {}),
					updatedAt: input.now,
				};
				if (input.clearBlockedReason || input.status === "pending") delete updated.blockedReason;
				if (input.clearFailureReason || input.status === "pending") delete updated.failureReason;
				if (input.clearReviewOutcome) delete updated.reviewOutcome;
				if (input.clearStartedAt || input.status === "pending") delete updated.startedAt;
				if (input.clearCompletedAt || input.status === "pending") delete updated.completedAt;
				return updated;
			}),
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

/** Default evidence requirements derived from the work a task asks for, not its mathematical subject. */
export function requiredCapabilitiesForTaskKind(kind: ResearchPlanTaskKind): ResearchPlanTaskRequiredCapability[] {
	switch (kind) {
		case "source-refresh":
		case "literature-search":
			return ["source-grounding", "independent-review"];
		case "computation":
			return ["sandboxed-computation", "independent-review"];
		case "proof-attempt":
		case "refutation-attempt":
			return ["independent-review"];
		default:
			return [];
	}
}

function normalizeResearchTaskSourceRequests(value: unknown): ResearchTaskSourceRequest[] {
	if (!Array.isArray(value)) return [];
	const requests: ResearchTaskSourceRequest[] = [];
	for (const candidate of value) {
		if (typeof candidate !== "object" || candidate === null) continue;
		const record = candidate as Record<string, unknown>;
		const sourceId = getOptionalStringField(record, "sourceId");
		if (!sourceId || !Array.isArray(record.ranges)) continue;
		const ranges = record.ranges.flatMap((range) => {
			if (typeof range !== "object" || range === null) return [];
			const rangeRecord = range as Record<string, unknown>;
			const start = rangeRecord.start;
			const end = rangeRecord.end;
			return typeof start === "number" &&
				Number.isSafeInteger(start) &&
				start > 0 &&
				typeof end === "number" &&
				Number.isSafeInteger(end) &&
				end >= start
				? [{ start, end }]
				: [];
		});
		if (ranges.length > 0) requests.push({ sourceId, ranges });
	}
	return requests;
}

/** Whether every declared prerequisite completed successfully in this plan. */
export function areResearchPlanTaskDependenciesCompleted(
	state: CoMathProjectState,
	task: ResearchPlanTaskRecord,
): boolean {
	const tasksById = new Map(getResearchPlanTasks(state, task.planId).map((candidate) => [candidate.id, candidate]));
	return task.dependsOnTaskIds.every((dependencyId) => tasksById.get(dependencyId)?.status === "completed");
}

function validateResearchPlanTaskGraph(
	tasks: readonly ResearchPlanTaskRecord[],
	orderedTaskIds: readonly string[],
): void {
	const byId = new Map(tasks.map((task) => [task.id, task]));
	if (
		byId.size !== tasks.length ||
		orderedTaskIds.length !== tasks.length ||
		new Set(orderedTaskIds).size !== tasks.length
	) {
		throw new Error("Research plan repair produced duplicate task ids.");
	}
	for (let index = 0; index < orderedTaskIds.length; index += 1) {
		const taskId = orderedTaskIds[index]!;
		const task = byId.get(taskId);
		if (!task || task.sequence !== index + 1) {
			throw new Error("Research plan repair produced inconsistent task sequence ordering.");
		}
		const earlierTaskIds = new Set(orderedTaskIds.slice(0, index));
		if (task.dependsOnTaskIds.some((dependencyId) => !earlierTaskIds.has(dependencyId))) {
			throw new Error("Research plan repair produced a dangling, forward, or cyclic dependency.");
		}
	}
}

/**
 * The next task the plan runner may execute: the lowest-sequence pending task whose declared
 * prerequisites completed successfully. Returns `undefined` while a task is still running (only
 * one task may run at a time) or when nothing is ready.
 */
export function getNextRunnableResearchPlanTask(
	state: CoMathProjectState,
	planId: string,
): ResearchPlanTaskRecord | undefined {
	const tasks = getResearchPlanTasks(state, planId);
	if (tasks.some((task) => task.status === "running")) {
		return undefined;
	}
	return tasks.find((task) => task.status === "pending" && areResearchPlanTaskDependenciesCompleted(state, task));
}

export function addResearchObligation(
	state: CoMathProjectState,
	input: AddResearchObligationInput,
): CoMathProjectState {
	const statement = input.statement.replace(/\s+/g, " ").trim();
	if (!statement) {
		throw new Error("Research obligation requires a statement.");
	}
	const id = input.id?.trim() || `obligation-${state.researchObligations.length + 1}`;
	if (state.researchObligations.some((obligation) => obligation.id === id)) {
		throw new Error(`Duplicate research obligation id: ${id}`);
	}
	// A dangling parent id drops the subclaim link but keeps the obligation.
	const parentObligationId = input.parentObligationId?.trim();
	const parentExists =
		!!parentObligationId && state.researchObligations.some((obligation) => obligation.id === parentObligationId);
	const obligation: ResearchObligationRecord = {
		id,
		statement,
		assumptions: sanitizeStringArray(input.assumptions ?? []),
		...(parentExists ? { parentObligationId } : {}),
		evidenceEntryIds: uniqueStrings(input.evidenceEntryIds ?? []),
		computationalArtifactIds: uniqueStrings(input.computationalArtifactIds ?? []),
		refutationEvidenceEntryIds: uniqueStrings(input.refutationEvidenceEntryIds ?? []),
		gaps: sanitizeStringArray(input.gaps ?? []),
		status: input.status ?? "open",
		...(input.statusReason?.trim() ? { statusReason: input.statusReason.trim() } : {}),
		...(input.taskId?.trim() ? { taskId: input.taskId.trim() } : {}),
		...(input.reportId?.trim() ? { reportId: input.reportId.trim() } : {}),
		createdAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			researchObligations: [...state.researchObligations, obligation],
			updatedAt: input.now,
		},
		{
			kind: "research_obligation_recorded",
			actor: input.actor,
			summary: `Added research obligation ${id}: ${statement}`,
			subjectId: id,
			relatedIds: uniqueStrings([
				...(obligation.parentObligationId ? [obligation.parentObligationId] : []),
				...obligation.evidenceEntryIds,
				...(obligation.taskId ? [obligation.taskId] : []),
				...(obligation.reportId ? [obligation.reportId] : []),
			]),
			now: input.now,
		},
	);
}

/**
 * Update an obligation. Array fields are merged, never replaced. Setting the status to
 * "established" is gated: the update throws unless the merged record passes
 * {@link describeObligationEstablishmentGate}, so no code path can promote an obligation past its
 * unresolved gaps, unsettled subclaims, or a missing independent review.
 */
export function updateResearchObligation(
	state: CoMathProjectState,
	input: UpdateResearchObligationInput,
): CoMathProjectState {
	const existing = state.researchObligations.find((candidate) => candidate.id === input.obligationId);
	if (!existing) {
		return state;
	}
	const merged: ResearchObligationRecord = {
		...existing,
		assumptions: sanitizeStringArray([...existing.assumptions, ...(input.addAssumptions ?? [])]),
		evidenceEntryIds: uniqueStrings([...existing.evidenceEntryIds, ...(input.addEvidenceEntryIds ?? [])]),
		computationalArtifactIds: uniqueStrings([
			...existing.computationalArtifactIds,
			...(input.addComputationalArtifactIds ?? []),
		]),
		refutationEvidenceEntryIds: uniqueStrings([
			...existing.refutationEvidenceEntryIds,
			...(input.addRefutationEvidenceEntryIds ?? []),
		]),
		gaps: input.clearGaps ? [] : sanitizeStringArray([...existing.gaps, ...(input.addGaps ?? [])]),
		...(input.status ? { status: input.status } : {}),
		...(input.statusReason?.trim() ? { statusReason: input.statusReason.trim() } : {}),
		...(input.reviewedCleanAt ? { reviewedCleanAt: input.reviewedCleanAt } : {}),
		...(input.taskId?.trim() ? { taskId: input.taskId.trim() } : {}),
		...(input.reportId?.trim() ? { reportId: input.reportId.trim() } : {}),
		updatedAt: input.now,
	};
	if (input.status === "established") {
		const gate = describeGateForObligationRecord(state, merged);
		if (!gate.ok) {
			throw new Error(`Research obligation ${input.obligationId} cannot be established: ${gate.reasons.join(" ")}`);
		}
	}
	return appendEvent(
		{
			...state,
			researchObligations: state.researchObligations.map((candidate) =>
				candidate.id === input.obligationId ? merged : candidate,
			),
			updatedAt: input.now,
		},
		{
			kind: "research_obligation_recorded",
			actor: input.actor,
			summary: `Updated research obligation ${input.obligationId}${input.status ? ` to ${input.status}` : ""}`,
			subjectId: input.obligationId,
			relatedIds: uniqueStrings(
				[existing.parentObligationId, input.taskId, input.reportId].filter((id): id is string => !!id?.trim()),
			),
			now: input.now,
		},
	);
}

/**
 * The deterministic establishment gate: whether an obligation may be presented as established.
 * Kept as a pure description so callers (skeptic, synthesis, eval) can explain a refusal instead
 * of silently ignoring it. Verifier-backed evidence can later strengthen this gate without
 * changing its shape.
 */
export function describeObligationEstablishmentGate(
	state: CoMathProjectState,
	obligationId: string,
): ResearchObligationEstablishmentGate {
	const obligation = state.researchObligations.find((candidate) => candidate.id === obligationId);
	if (!obligation) {
		return { ok: false, reasons: ["The obligation does not exist."] };
	}
	return describeGateForObligationRecord(state, obligation);
}

function describeGateForObligationRecord(
	state: CoMathProjectState,
	obligation: ResearchObligationRecord,
): ResearchObligationEstablishmentGate {
	const reasons: string[] = [];
	if (obligation.status === "refuted") {
		reasons.push("The obligation is refuted.");
	}
	if (obligation.status === "retired") {
		reasons.push("The obligation was retired.");
	}
	if (obligation.evidenceEntryIds.length === 0) {
		reasons.push("There is no supporting evidence.");
	}
	if (obligation.gaps.length > 0) {
		reasons.push(`There are ${obligation.gaps.length} open gap${obligation.gaps.length === 1 ? "" : "s"}.`);
	}
	if (!obligation.reviewedCleanAt) {
		reasons.push("No independent review has passed cleanly.");
	}
	const unsettledChildren = state.researchObligations.filter(
		(candidate) =>
			candidate.parentObligationId === obligation.id &&
			candidate.status !== "established" &&
			candidate.status !== "retired",
	);
	if (unsettledChildren.length > 0) {
		reasons.push(
			`${unsettledChildren.length} required subclaim${unsettledChildren.length === 1 ? " is" : "s are"} not settled.`,
		);
	}
	return { ok: reasons.length === 0, reasons };
}

export function getResearchObligation(
	state: CoMathProjectState,
	obligationId: string,
): ResearchObligationRecord | undefined {
	return state.researchObligations.find((obligation) => obligation.id === obligationId);
}

/**
 * The project's main obligation: the latest top-level one that has not been retired (a conjecture
 * revision retires the old root and opens a replacement). Falls back to the last top-level
 * obligation when all are retired.
 */
export function getRootResearchObligation(state: CoMathProjectState): ResearchObligationRecord | undefined {
	const roots = state.researchObligations.filter((obligation) => !obligation.parentObligationId);
	return [...roots].reverse().find((obligation) => obligation.status !== "retired") ?? roots.at(-1);
}

export function getResearchObligationChildren(
	state: CoMathProjectState,
	obligationId: string,
): ResearchObligationRecord[] {
	return state.researchObligations.filter((obligation) => obligation.parentObligationId === obligationId);
}

/**
 * Record a standing research constraint. Duplicates of an active constraint are ignored, including
 * paraphrases: several roles typically restate the same rule in one run ("Do not infer one-variable
 * infinitude from multivariable results" in three phrasings), and each would otherwise become its
 * own durable record riding along in every later prompt.
 */
export function addResearchConstraint(
	state: CoMathProjectState,
	input: AddResearchConstraintInput,
): CoMathProjectState {
	const text = input.text.replace(/\s+/g, " ").trim();
	if (!text) {
		throw new Error("Research constraint requires text.");
	}
	// Compare with decorations stripped so a rule restated with examples, source labels, or LaTeX
	// wrappers ("Do not infer X from Y (e.g. [source-2]'s $X^2+Y^4$)") is subsumed by the plain
	// version already on record rather than accumulating alongside it. The threshold is slightly
	// looser than the default because constraint restatements often swap the verb ("do not cite X
	// as proving Y" vs "do not infer Y from X") while keeping the same content words.
	const duplicate = state.researchConstraints.some(
		(constraint) =>
			constraint.status === "active" &&
			textsNearlyMatch(stripMathDecorations(constraint.text), stripMathDecorations(text), 0.65),
	);
	if (duplicate) {
		return state;
	}
	const id = input.id?.trim() || `constraint-${state.researchConstraints.length + 1}`;
	if (state.researchConstraints.some((constraint) => constraint.id === id)) {
		throw new Error(`Duplicate research constraint id: ${id}`);
	}
	const constraint: ResearchConstraintRecord = {
		id,
		text,
		kind: input.kind ?? "avoid",
		status: "active",
		origin: input.origin ?? "human",
		createdAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			researchConstraints: [...state.researchConstraints, constraint],
			updatedAt: input.now,
		},
		{
			kind: "research_constraint_recorded",
			actor: input.actor,
			summary: `Added research constraint ${id}: ${text}`,
			subjectId: id,
			now: input.now,
		},
	);
}

export function retireResearchConstraint(
	state: CoMathProjectState,
	input: RetireResearchConstraintInput,
): CoMathProjectState {
	const constraint = state.researchConstraints.find((candidate) => candidate.id === input.constraintId);
	if (!constraint || constraint.status === "retired") {
		return state;
	}
	return appendEvent(
		{
			...state,
			researchConstraints: state.researchConstraints.map((candidate) =>
				candidate.id === input.constraintId
					? {
							...candidate,
							status: "retired" as const,
							retiredReason: input.reason.trim(),
							updatedAt: input.now,
						}
					: candidate,
			),
			updatedAt: input.now,
		},
		{
			kind: "research_constraint_recorded",
			actor: input.actor,
			summary: `Retired research constraint ${input.constraintId}`,
			subjectId: input.constraintId,
			now: input.now,
		},
	);
}

export function getActiveResearchConstraints(state: CoMathProjectState): ResearchConstraintRecord[] {
	return state.researchConstraints.filter((constraint) => constraint.status === "active");
}

/**
 * Record an explicit theorem applicability check against the current object. A check that names
 * the same theorem (up to source labels, parentheticals, and naming variants) with the same
 * verdict as an existing record is ignored: re-deriving "this theorem is rejected as a direct
 * route" in a later run is confirmation, not a new check. Checks are still recorded when they are
 * materially different — a different verdict, a consequence that disagrees, hypotheses with no
 * overlap, or a target naming different mathematics — since those are genuinely new findings.
 */
export function addTheoremApplicabilityCheck(
	state: CoMathProjectState,
	input: AddTheoremApplicabilityCheckInput,
): CoMathProjectState {
	const theorem = input.theorem.replace(/\s+/g, " ").trim();
	const targetObject = input.targetObject.replace(/\s+/g, " ").trim();
	if (!theorem) {
		throw new Error("Theorem applicability check requires a theorem.");
	}
	if (!targetObject) {
		throw new Error("Theorem applicability check requires a target object.");
	}
	const duplicate = state.theoremApplicabilityChecks.some((check) =>
		theoremChecksLikelyDuplicate(check, { theorem, targetObject, input }),
	);
	if (duplicate) {
		return state;
	}
	const id = input.id?.trim() || `theorem-check-${state.theoremApplicabilityChecks.length + 1}`;
	if (state.theoremApplicabilityChecks.some((check) => check.id === id)) {
		throw new Error(`Duplicate theorem applicability check id: ${id}`);
	}
	const check: TheoremApplicabilityCheckRecord = {
		id,
		theorem,
		targetObject,
		hypotheses: (input.hypotheses ?? [])
			.map((hypothesis) => ({
				hypothesis: hypothesis.hypothesis.replace(/\s+/g, " ").trim(),
				status: hypothesis.status,
				...(hypothesis.note?.trim() ? { note: hypothesis.note.trim() } : {}),
			}))
			.filter((hypothesis) => hypothesis.hypothesis.length > 0),
		status: input.status,
		...(input.consequence?.trim() ? { consequence: input.consequence.trim() } : {}),
		...(input.pathId?.trim() ? { pathId: input.pathId.trim() } : {}),
		...(input.reportId?.trim() ? { reportId: input.reportId.trim() } : {}),
		...(input.taskId?.trim() ? { taskId: input.taskId.trim() } : {}),
		sourceIds: uniqueStrings(input.sourceIds ?? []),
		createdAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			theoremApplicabilityChecks: [...state.theoremApplicabilityChecks, check],
			updatedAt: input.now,
		},
		{
			kind: "theorem_applicability_check_recorded",
			actor: input.actor,
			summary: `Recorded theorem applicability check ${id}: ${theorem} (${input.status})`,
			subjectId: id,
			relatedIds: uniqueStrings(
				[check.pathId, check.reportId, check.taskId, ...check.sourceIds].filter(
					(value): value is string => !!value,
				),
			),
			now: input.now,
		},
	);
}

/**
 * Whether a new check is a restatement of an existing one. Same verdict plus the same canonical
 * theorem name is a duplicate unless the content differs materially (disagreeing consequences,
 * hypothesis sets with no overlap, or targets naming different mathematics). Variant theorem names
 * ("Euler's criterion" vs "Euler/quadratic-residue criterion") additionally need positive overlap
 * in target or consequence before they count as the same check — a shared surname alone is not
 * enough to merge two different results.
 */
function theoremChecksLikelyDuplicate(
	existing: TheoremApplicabilityCheckRecord,
	candidate: { theorem: string; targetObject: string; input: AddTheoremApplicabilityCheckInput },
): boolean {
	if (existing.status !== candidate.input.status) {
		return false;
	}
	const existingKey = normalizeTheoremKey(existing.theorem);
	const candidateKey = normalizeTheoremKey(candidate.theorem);
	if (existingKey.length === 0 || candidateKey.length === 0) {
		return false;
	}
	const keysEqual = existingKey === candidateKey;
	if (!keysEqual && !textsNearlyMatch(existingKey, candidateKey, 0.8)) {
		return false;
	}
	if (namesDifferentMathExpressions(existing.targetObject, candidate.targetObject)) {
		return false;
	}
	const targetsMatch = textsNearlyMatch(existing.targetObject, candidate.targetObject);
	// Consequences compare with decorations stripped; when the theorem and target already agree,
	// the bar for "same consequence" is lower, since rewordings of the same verdict ("gives a
	// related theorem, not the root statement" vs "gives related infinitude, not the target")
	// share fewer tokens than a real disagreement would remove.
	const candidateConsequence = candidate.input.consequence?.trim();
	const consequencesAgree =
		!!existing.consequence &&
		!!candidateConsequence &&
		textsNearlyMatch(
			stripMathDecorations(existing.consequence),
			stripMathDecorations(candidateConsequence),
			targetsMatch ? 0.6 : 0.75,
		);
	if (existing.consequence && candidateConsequence && !consequencesAgree) {
		return false;
	}
	const candidateHypotheses = (candidate.input.hypotheses ?? [])
		.map((hypothesis) => hypothesis.hypothesis.trim())
		.filter((hypothesis) => hypothesis.length > 0);
	if (
		existing.hypotheses.length > 0 &&
		candidateHypotheses.length > 0 &&
		!existing.hypotheses.some((hypothesis) =>
			candidateHypotheses.some((candidateHypothesis) =>
				textsNearlyMatch(hypothesis.hypothesis, candidateHypothesis),
			),
		)
	) {
		return false;
	}
	if (keysEqual) {
		return true;
	}
	return targetsMatch || consequencesAgree;
}

export function getTheoremApplicabilityChecksForPath(
	state: CoMathProjectState,
	pathId: string,
): TheoremApplicabilityCheckRecord[] {
	return getCurrentTheoremApplicabilityChecks(state).filter((check) => check.pathId === pathId);
}

/**
 * Current theorem-check view for model context and execution decisions. Raw state retains every
 * historical check for auditability, while a later check of the same theorem against the same
 * object supersedes the earlier verdict. This prevents a corrected applicability audit from
 * coexisting as an active instruction with the mistake it corrected.
 */
export function getCurrentTheoremApplicabilityChecks(
	state: Pick<CoMathProjectState, "theoremApplicabilityChecks">,
): TheoremApplicabilityCheckRecord[] {
	const current: TheoremApplicabilityCheckRecord[] = [];
	for (const check of [...state.theoremApplicabilityChecks].reverse()) {
		if (current.some((candidate) => theoremChecksHaveSameSubject(candidate, check))) {
			continue;
		}
		current.push(check);
	}
	return current.reverse();
}

function theoremChecksHaveSameSubject(
	left: TheoremApplicabilityCheckRecord,
	right: TheoremApplicabilityCheckRecord,
): boolean {
	const leftKey = normalizeTheoremKey(left.theorem);
	const rightKey = normalizeTheoremKey(right.theorem);
	if (!leftKey || !rightKey || (leftKey !== rightKey && !textsNearlyMatch(leftKey, rightKey, 0.8))) {
		return false;
	}
	if (namesDifferentMathExpressions(left.targetObject, right.targetObject)) {
		return false;
	}
	return textsNearlyMatch(stripMathDecorations(left.targetObject), stripMathDecorations(right.targetObject), 0.65);
}

/** Record a route pivot. A pivot restating an existing one's from/to (paraphrases included) is ignored. */
export function addResearchPivot(state: CoMathProjectState, input: AddResearchPivotInput): CoMathProjectState {
	const fromRoute = input.fromRoute.replace(/\s+/g, " ").trim();
	const toRoute = input.toRoute.replace(/\s+/g, " ").trim();
	const reason = input.reason.replace(/\s+/g, " ").trim();
	if (!fromRoute || !toRoute) {
		throw new Error("Research pivot requires both routes.");
	}
	if (!reason) {
		throw new Error("Research pivot requires a reason.");
	}
	const duplicate = state.researchPivots.some(
		(pivot) => textsNearlyMatch(pivot.fromRoute, fromRoute) && textsNearlyMatch(pivot.toRoute, toRoute),
	);
	if (duplicate) {
		return state;
	}
	const id = input.id?.trim() || `pivot-${state.researchPivots.length + 1}`;
	if (state.researchPivots.some((pivot) => pivot.id === id)) {
		throw new Error(`Duplicate research pivot id: ${id}`);
	}
	const pivot: ResearchPivotRecord = {
		id,
		fromRoute,
		toRoute,
		reason,
		...(input.pathId?.trim() ? { pathId: input.pathId.trim() } : {}),
		...(input.taskId?.trim() ? { taskId: input.taskId.trim() } : {}),
		...(input.reportId?.trim() ? { reportId: input.reportId.trim() } : {}),
		...(input.applicabilityCheckId?.trim() ? { applicabilityCheckId: input.applicabilityCheckId.trim() } : {}),
		createdAt: input.now,
		updatedAt: input.now,
	};
	return appendEvent(
		{
			...state,
			researchPivots: [...state.researchPivots, pivot],
			updatedAt: input.now,
		},
		{
			kind: "research_pivot_recorded",
			actor: input.actor,
			summary: `Recorded research pivot ${id}: ${fromRoute} -> ${toRoute}`,
			subjectId: id,
			relatedIds: uniqueStrings(
				[pivot.pathId, pivot.taskId, pivot.reportId, pivot.applicabilityCheckId].filter(
					(value): value is string => !!value,
				),
			),
			now: input.now,
		},
	);
}

export const STALE_RESEARCH_WORKSTREAM_RUN_REASON = "Previous Pi session ended before completion.";

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
			sourceClaimIds: input.sourceClaimIds,
			sourceEvidenceIds: input.sourceEvidenceIds,
			sourceWarningIds: input.sourceWarningIds,
			sourceArtifactIds: input.sourceArtifactIds,
			sourceReviewRoundIds: input.sourceReviewRoundIds,
			sourceRoleRunIds: input.sourceRoleRunIds,
			now: input.now,
			actor: input.actor,
		});
	}
	return appendEvent(
		{
			...state,
			workingPaperSections: state.workingPaperSections.map((section) =>
				section.id === existing.id
					? {
							...section,
							body,
							status: input.status ?? section.status,
							sourceClaimIds: uniqueStrings([...section.sourceClaimIds, ...(input.sourceClaimIds ?? [])]),
							sourceEvidenceIds: uniqueStrings([
								...section.sourceEvidenceIds,
								...(input.sourceEvidenceIds ?? []),
							]),
							sourceWarningIds: uniqueStrings([...section.sourceWarningIds, ...(input.sourceWarningIds ?? [])]),
							sourceArtifactIds: uniqueStrings([
								...section.sourceArtifactIds,
								...(input.sourceArtifactIds ?? []),
							]),
							sourceReviewRoundIds: uniqueStrings([
								...section.sourceReviewRoundIds,
								...(input.sourceReviewRoundIds ?? []),
							]),
							sourceRoleRunIds: uniqueStrings([...section.sourceRoleRunIds, ...(input.sourceRoleRunIds ?? [])]),
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
	// Repeated review rounds restate the same finding; one open note per finding and kind is
	// enough. Provenance prefixes ("Independent review: ...") are stripped for comparison only.
	// Dedupe is same-kind on purpose: a scrutiny note deliberately mirrors a top gap so the human
	// sees what to check, and that cross-kind surfacing must survive.
	const duplicate = state.marginNotes.some(
		(note) =>
			note.status === "open" &&
			note.kind === input.kind &&
			note.subjectId === subjectId &&
			mathClaimsNearlyMatch(note.message, message),
	);
	if (duplicate) {
		return state;
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

const STATE_LOCK_TIMEOUT_MS = 5_000;
const STATE_LOCK_STALE_MS = 30_000;
const STATE_LOCK_RETRY_MS = 20;

export class CoMathStateConflictError extends Error {
	readonly expectedRevision: number;
	readonly actualRevision: number;

	constructor(expectedRevision: number, actualRevision: number) {
		super(`CoMath state revision conflict: expected ${expectedRevision}, found ${actualRevision}.`);
		this.name = "CoMathStateConflictError";
		this.expectedRevision = expectedRevision;
		this.actualRevision = actualRevision;
	}
}

export async function saveProjectState(statePath: string, state: CoMathProjectState): Promise<void> {
	await mkdir(path.dirname(statePath), { recursive: true });
	const lockPath = `${statePath}.lock`;
	await acquireStateFileLock(lockPath);
	try {
		const expectedRevision = normalizeStateRevision(state.revision);
		const actualRevision = await readPersistedRevision(statePath);
		if (actualRevision !== expectedRevision) {
			throw new CoMathStateConflictError(expectedRevision, actualRevision);
		}
		const nextRevision = actualRevision + 1;
		const persistedState: CoMathProjectState = { ...state, revision: nextRevision };
		// Unique temp + same-filesystem rename keeps readers from observing partial JSON. The
		// cross-process lock and revision comparison additionally prevent last-writer-wins loss.
		const tempPath = `${statePath}.${randomUUID()}.tmp`;
		try {
			await writeFile(tempPath, serializeProjectState(persistedState), { encoding: "utf8", flag: "wx" });
			await rename(tempPath, statePath);
			state.revision = nextRevision;
		} catch (error) {
			await rm(tempPath, { force: true }).catch(() => {});
			throw error;
		}
	} finally {
		await rm(lockPath, { recursive: true, force: true });
	}
}

/** Explicit project replacement used by `init`; ordinary commits must use revision-checked save. */
export async function replaceProjectState(statePath: string, state: CoMathProjectState): Promise<void> {
	await mkdir(path.dirname(statePath), { recursive: true });
	const lockPath = `${statePath}.lock`;
	await acquireStateFileLock(lockPath);
	try {
		const nextRevision = (await readPersistedRevision(statePath)) + 1;
		const persistedState: CoMathProjectState = { ...state, revision: nextRevision };
		const tempPath = `${statePath}.${randomUUID()}.tmp`;
		try {
			await writeFile(tempPath, serializeProjectState(persistedState), { encoding: "utf8", flag: "wx" });
			await rename(tempPath, statePath);
			state.revision = nextRevision;
		} catch (error) {
			await rm(tempPath, { force: true }).catch(() => {});
			throw error;
		}
	} finally {
		await rm(lockPath, { recursive: true, force: true });
	}
}

async function acquireStateFileLock(lockPath: string): Promise<void> {
	const deadline = Date.now() + STATE_LOCK_TIMEOUT_MS;
	while (true) {
		try {
			await mkdir(lockPath);
			return;
		} catch (error) {
			if (!isErrorCode(error, "EEXIST")) {
				throw error;
			}
			const lockStat = await stat(lockPath).catch(() => undefined);
			if (lockStat && Date.now() - lockStat.mtimeMs > STATE_LOCK_STALE_MS) {
				await rm(lockPath, { recursive: true, force: true });
				continue;
			}
			if (Date.now() >= deadline) {
				throw new Error(`Timed out waiting for CoMath state lock: ${lockPath}`);
			}
			await new Promise<void>((resolve) => setTimeout(resolve, STATE_LOCK_RETRY_MS));
		}
	}
}

async function readPersistedRevision(statePath: string): Promise<number> {
	try {
		const value = JSON.parse(await readFile(statePath, "utf8")) as { revision?: unknown };
		return normalizeStateRevision(value.revision);
	} catch (error) {
		if (isMissingFileError(error)) {
			return 0;
		}
		throw error;
	}
}

function normalizeStateRevision(value: unknown): number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
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
	const rawResearchPlanTasks = getArrayField(value, "researchPlanTasks");
	const researchPlanTasks = rawResearchPlanTasks.map((record, index) =>
		normalizeResearchPlanTask(record, updatedAt, index),
	);
	const taskIdsWithExplicitDependencies = new Set(
		rawResearchPlanTasks
			.map((record, index) => (Object.hasOwn(record, "dependsOnTaskIds") ? researchPlanTasks[index]?.id : undefined))
			.filter((taskId): taskId is string => taskId !== undefined),
	);
	const normalizedState: CoMathProjectState = {
		...value,
		version: 2,
		revision: normalizeStateRevision(value.revision),
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
		researchPlanTasks,
		researchTaskAttempts: getArrayField(value, "researchTaskAttempts").flatMap((record, index) => {
			const normalized = normalizeResearchTaskAttempt(record, updatedAt, index);
			return normalized ? [normalized] : [];
		}),
		researchExecutions: getArrayField(value, "researchExecutions").flatMap((record, index) => {
			const normalized = normalizeResearchExecution(record, updatedAt, index);
			return normalized ? [normalized] : [];
		}),
		...(normalizeCanonicalProjection(value.canonicalProjection, updatedAt)
			? { canonicalProjection: normalizeCanonicalProjection(value.canonicalProjection, updatedAt) }
			: {}),
		...(value.enginePolicyVersion === 1 ? { enginePolicyVersion: 1 as const } : {}),
		researchObligations: getArrayField(value, "researchObligations").map((record, index) =>
			normalizeResearchObligation(record, updatedAt, index),
		),
		researchConstraints: getArrayField(value, "researchConstraints").map((record, index) =>
			normalizeResearchConstraint(record, updatedAt, index),
		),
		theoremApplicabilityChecks: getArrayField(value, "theoremApplicabilityChecks").map((record, index) =>
			normalizeTheoremApplicabilityCheck(record, updatedAt, index),
		),
		researchPivots: getArrayField(value, "researchPivots").map((record, index) =>
			normalizeResearchPivot(record, updatedAt, index),
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
		sourceIndexes: getArrayField(value, "sourceIndexes").flatMap((record, index) => {
			const normalized = normalizeCoMathSourceIndex(record, updatedAt, index);
			return normalized ? [normalized] : [];
		}),
		researchEvidenceBoard: getArrayField(value, "researchEvidenceBoard").map((record, index) =>
			normalizeResearchEvidenceBoardEntry(record, updatedAt, index),
		),
		computationalArtifacts: getArrayField(value, "computationalArtifacts").map((record, index) =>
			normalizeComputationalArtifact(record, updatedAt, index),
		),
		groundingReferences: getArrayField(value, "groundingReferences").flatMap((record, index) => {
			const normalized = normalizeGroundingReference(record, updatedAt, index);
			return normalized ? [normalized] : [];
		}),
		researchCoordinatorReports: getArrayField(value, "researchCoordinatorReports").map((record, index) =>
			normalizeResearchCoordinatorReport(record, updatedAt, index),
		),
		...(normalizeResearchFocus(value.researchFocus, updatedAt)
			? { researchFocus: normalizeResearchFocus(value.researchFocus, updatedAt) }
			: {}),
		updatedAt,
	};
	return normalizeClaimRelationshipsAndProofStatus(
		normalizeResearchPlanTaskDependencies(normalizedState, taskIdsWithExplicitDependencies),
	);
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

/** Give legacy ordered plans their former sequential behavior while retaining explicit [] independence. */
function normalizeResearchPlanTaskDependencies(
	state: CoMathProjectState,
	taskIdsWithExplicitDependencies: ReadonlySet<string>,
): CoMathProjectState {
	const byPlan = new Map<string, ResearchPlanTaskRecord[]>();
	for (const task of state.researchPlanTasks) {
		const tasks = byPlan.get(task.planId) ?? [];
		tasks.push(task);
		byPlan.set(task.planId, tasks);
	}
	const dependenciesByTaskId = new Map<string, string[]>();
	for (const tasks of byPlan.values()) {
		tasks.sort((left, right) => left.sequence - right.sequence);
		const earlierIds = new Set<string>();
		for (const task of tasks) {
			const dependencies = taskIdsWithExplicitDependencies.has(task.id)
				? uniqueStrings(task.dependsOnTaskIds.filter((dependencyId) => earlierIds.has(dependencyId)))
				: tasks.find((candidate) => candidate.sequence === task.sequence - 1)
					? [tasks.find((candidate) => candidate.sequence === task.sequence - 1)!.id]
					: [];
			dependenciesByTaskId.set(task.id, dependencies);
			earlierIds.add(task.id);
		}
	}
	return {
		...state,
		researchPlanTasks: state.researchPlanTasks.map((task) => ({
			...task,
			dependsOnTaskIds: dependenciesByTaskId.get(task.id) ?? [],
		})),
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
		acceptanceStatus: normalizeResearchWorkstreamReportAcceptanceStatus(value.acceptanceStatus),
		...(getOptionalStringField(value, "reviewedAt")
			? { reviewedAt: getOptionalStringField(value, "reviewedAt") }
			: {}),
		...(getOptionalStringField(value, "promotedAt")
			? { promotedAt: getOptionalStringField(value, "promotedAt") }
			: {}),
		...(getOptionalStringField(value, "rejectionReason")
			? { rejectionReason: getOptionalStringField(value, "rejectionReason") }
			: {}),
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
		workingPaperSummary: getStringField(value, "workingPaperSummary", ""),
		...(getOptionalStringField(value, "workingPaperSectionId")
			? { workingPaperSectionId: getOptionalStringField(value, "workingPaperSectionId") }
			: {}),
		sourceIds: getStringArrayField(value, "sourceIds"),
		claimSupportIds: getStringArrayField(value, "claimSupportIds"),
		computationalArtifactIds: getStringArrayField(value, "computationalArtifactIds"),
		theoremChecks: getArrayField(value, "theoremChecks").map((check, checkIndex) => {
			const normalized = normalizeTheoremApplicabilityCheck(check, createdAt, checkIndex);
			return {
				theorem: normalized.theorem,
				targetObject: normalized.targetObject,
				hypotheses: normalized.hypotheses,
				status: normalized.status,
				...(normalized.consequence ? { consequence: normalized.consequence } : {}),
			};
		}),
		routePivots: getArrayField(value, "routePivots").map((pivot) => ({
			fromRoute: getStringField(pivot, "fromRoute", ""),
			toRoute: getStringField(pivot, "toRoute", ""),
			reason: getStringField(pivot, "reason", ""),
		})),
		negativeConstraints: getStringArrayField(value, "negativeConstraints"),
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
		...(normalizeCoMathWorkspaceSourceRole(value.workspaceRole)
			? { workspaceRole: normalizeCoMathWorkspaceSourceRole(value.workspaceRole) }
			: {}),
		...(value.citationEligibility === "citable" || value.citationEligibility === "inventory-only"
			? { citationEligibility: value.citationEligibility }
			: normalizeCoMathWorkspaceSourceRole(value.workspaceRole) === "compiled-binary" ||
					normalizeCoMathWorkspaceSourceRole(value.workspaceRole) === "snapshot-metadata"
				? { citationEligibility: "inventory-only" as const }
				: { citationEligibility: "citable" as const }),
		...(getOptionalStringField(value, "sourceIndexId")
			? { sourceIndexId: getOptionalStringField(value, "sourceIndexId") }
			: {}),
		...(getOptionalStringField(value, "sourceRevisionId")
			? { sourceRevisionId: getOptionalStringField(value, "sourceRevisionId") }
			: {}),
		...(getOptionalStringField(value, "sourceRelativePath")
			? { sourceRelativePath: getOptionalStringField(value, "sourceRelativePath") }
			: {}),
		...(getOptionalStringField(value, "sourceFileSha256")
			? { sourceFileSha256: getOptionalStringField(value, "sourceFileSha256") }
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
		groundingReferenceIds: getStringArrayField(value, "groundingReferenceIds"),
		groundingFailures: normalizeGroundingValidationFailures(getArrayField(value, "groundingFailures")),
		...(normalizeCoMathSourceClaimScope(value.sourceScope)
			? { sourceScope: normalizeCoMathSourceClaimScope(value.sourceScope) }
			: {}),
		createdAt,
		updatedAt: getStringField(value, "updatedAt", createdAt),
	};
}

function normalizeGroundingValidationFailures(values: readonly unknown[]): GroundingValidationFailure[] {
	const codes = new Set([
		"missing-exact-locator",
		"unknown-source",
		"non-citable-source",
		"invalid-range",
		"cross-region",
		"scope-mismatch",
		"digest-mismatch",
		"non-evidence-region",
	]);
	return values.flatMap((value) => {
		const record = asRecord(value);
		if (!record || typeof record.code !== "string" || !codes.has(record.code)) return [];
		const message = getOptionalStringField(record, "message");
		if (!message) return [];
		const lineRecord = asRecord(record.lines);
		const lines = lineRecord
			? { start: getNumberField(lineRecord, "start", 0), end: getNumberField(lineRecord, "end", 0) }
			: undefined;
		return [
			{
				code: record.code as GroundingValidationFailure["code"],
				...(getOptionalStringField(record, "sourceId")
					? { sourceId: getOptionalStringField(record, "sourceId") }
					: {}),
				...(lines &&
				Number.isSafeInteger(lines.start) &&
				Number.isSafeInteger(lines.end) &&
				lines.start > 0 &&
				lines.end >= lines.start
					? { lines }
					: {}),
				message,
			},
		];
	});
}

function normalizeCoMathSourceIndex(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): CoMathSourceIndexRecord | undefined {
	const sourceId = getOptionalStringField(value, "sourceId");
	const sourceRevisionId = getOptionalStringField(value, "sourceRevisionId");
	const sourceManifestSha256 = getOptionalStringField(value, "sourceManifestSha256");
	const indexArtifactId = getOptionalStringField(value, "indexArtifactId");
	const indexPath = getOptionalStringField(value, "indexPath");
	const indexSha256 = getOptionalStringField(value, "indexSha256");
	if (!sourceId || !sourceRevisionId || !sourceManifestSha256 || !indexArtifactId || !indexPath || !indexSha256) {
		return undefined;
	}
	const createdAt = getStringField(value, "createdAt", fallbackTime);
	return {
		id: getStringField(value, "id", `source-index-${index + 1}`),
		sourceId,
		sourceRevisionId,
		sourceManifestSha256,
		indexArtifactId,
		indexPath,
		indexSha256,
		policyVersion: Math.max(1, Math.floor(getNumberField(value, "policyVersion", 1))),
		status: value.status === "failed" ? "failed" : "ready",
		fileCount: Math.max(0, Math.floor(getNumberField(value, "fileCount", 0))),
		documentCount: Math.max(0, Math.floor(getNumberField(value, "documentCount", 0))),
		warnings: getStringArrayField(value, "warnings"),
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
		...(normalizeResearchClaimCategory(value.claimCategory)
			? { claimCategory: normalizeResearchClaimCategory(value.claimCategory) }
			: {}),
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

function normalizeGroundingReference(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): GroundingReferenceRecord | undefined {
	const subject = asRecord(value.subject);
	const locator = asRecord(value.locator);
	const subjectKind = subject?.kind;
	const subjectId = subject?.id;
	const artifactId = getOptionalStringField(value, "artifactId");
	if (
		!subject ||
		(subjectKind !== "report" &&
			subjectKind !== "claim-support" &&
			subjectKind !== "evidence" &&
			subjectKind !== "review" &&
			subjectKind !== "obligation" &&
			subjectKind !== "theorem-check") ||
		typeof subjectId !== "string" ||
		!artifactId ||
		!locator
	) {
		return undefined;
	}
	const normalizedLocator = normalizeGroundingLocator(locator);
	if (!normalizedLocator) {
		return undefined;
	}
	const relation = value.relation;
	if (
		relation !== "supports" &&
		relation !== "refutes" &&
		relation !== "context" &&
		relation !== "input" &&
		relation !== "independent-check"
	) {
		return undefined;
	}
	const validationStatus = value.validationStatus;
	if (validationStatus !== "validated" && validationStatus !== "legacy-unverified") {
		return undefined;
	}
	return {
		id: getStringField(value, "id", `grounding-${index + 1}`),
		subject: { kind: subjectKind, id: subjectId.trim() },
		relation,
		artifactId,
		locator: normalizedLocator,
		...(getOptionalStringField(value, "excerpt") ? { excerpt: getOptionalStringField(value, "excerpt") } : {}),
		...(getOptionalStringField(value, "excerptSha256")
			? { excerptSha256: getOptionalStringField(value, "excerptSha256") }
			: {}),
		...(getOptionalStringField(value, "sourceIndexId")
			? { sourceIndexId: getOptionalStringField(value, "sourceIndexId") }
			: {}),
		...(getOptionalStringField(value, "sourceRevisionId")
			? { sourceRevisionId: getOptionalStringField(value, "sourceRevisionId") }
			: {}),
		...(getOptionalStringField(value, "sourceRelativePath")
			? { sourceRelativePath: getOptionalStringField(value, "sourceRelativePath") }
			: {}),
		...(getOptionalStringField(value, "sourceFileSha256")
			? { sourceFileSha256: getOptionalStringField(value, "sourceFileSha256") }
			: {}),
		...(normalizeCoMathSourceRegionKind(value.regionKind)
			? { regionKind: normalizeCoMathSourceRegionKind(value.regionKind) }
			: {}),
		...(getOptionalStringField(value, "modelCallId")
			? { modelCallId: getOptionalStringField(value, "modelCallId") }
			: {}),
		validationStatus,
		createdAt: getStringField(value, "createdAt", fallbackTime),
	};
}

function normalizeGroundingLocator(value: Record<string, unknown>): GroundingReferenceRecord["locator"] | undefined {
	if (value.kind === "whole-artifact") return { kind: "whole-artifact" };
	if (value.kind === "section" && typeof value.value === "string" && value.value.trim()) {
		return { kind: "section", value: value.value.trim() };
	}
	if (value.kind === "json-pointer" && typeof value.value === "string" && value.value.trim()) {
		return { kind: "json-pointer", value: value.value.trim() };
	}
	if (
		(value.kind === "lines" || value.kind === "pages") &&
		typeof value.start === "number" &&
		typeof value.end === "number" &&
		Number.isSafeInteger(value.start) &&
		Number.isSafeInteger(value.end) &&
		value.start >= 1 &&
		value.end >= value.start
	) {
		return { kind: value.kind, start: value.start, end: value.end };
	}
	return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
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
		...(getOptionalStringField(value, "inputReviewFingerprint")
			? { inputReviewFingerprint: getOptionalStringField(value, "inputReviewFingerprint") }
			: {}),
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
		...(getOptionalStringField(value, "taskId") ? { taskId: getOptionalStringField(value, "taskId") } : {}),
		...(getOptionalStringField(value, "transcriptPath")
			? { transcriptPath: getOptionalStringField(value, "transcriptPath") }
			: {}),
		startedAt,
		updatedAt: getStringField(value, "updatedAt", startedAt),
		...(getOptionalStringField(value, "completedAt")
			? { completedAt: getOptionalStringField(value, "completedAt") }
			: {}),
		incrementalReports: getArrayField(value, "incrementalReports").map((report, reportIndex) =>
			normalizeResearchWorkstreamIncrementalReport(report, startedAt, reportIndex),
		),
		...(Array.isArray(value.modelCalls)
			? {
					modelCalls: getArrayField(value, "modelCalls")
						.map((call) => normalizeResearchRunModelCall(call, startedAt))
						.filter((call): call is ResearchRunModelCallRecord => call !== undefined),
				}
			: {}),
		...(getOptionalStringField(value, "finalReportId")
			? { finalReportId: getOptionalStringField(value, "finalReportId") }
			: {}),
		...(getOptionalStringField(value, "failedStage")
			? { failedStage: normalizeResearchWorkstreamStage(value.failedStage) }
			: {}),
		...(getOptionalStringField(value, "failureReason")
			? { failureReason: getOptionalStringField(value, "failureReason") }
			: {}),
		...(getOptionalStringField(value, "fallbackStage")
			? { fallbackStage: normalizeResearchWorkstreamStage(value.fallbackStage) }
			: {}),
		...(getOptionalStringField(value, "fallbackReason")
			? { fallbackReason: getOptionalStringField(value, "fallbackReason") }
			: {}),
		...(typeof value.usedFallback === "boolean" ? { usedFallback: value.usedFallback } : {}),
	};
}

/**
 * Normalize one persisted run model call. Entries without a stage are dropped; every provenance
 * field is optional, malformed values are dropped field-wise, and numbers must be finite.
 */
function normalizeResearchRunModelCall(
	value: Record<string, unknown>,
	fallbackTime: string,
): ResearchRunModelCallRecord | undefined {
	const stage = getOptionalStringField(value, "stage");
	if (!stage) {
		return undefined;
	}
	return {
		...(getOptionalStringField(value, "id") ? { id: getOptionalStringField(value, "id") } : {}),
		stage,
		at: getStringField(value, "at", fallbackTime),
		...(value.status === "started" || value.status === "completed" || value.status === "failed"
			? { status: value.status }
			: {}),
		...(getOptionalStringField(value, "startedAt") ? { startedAt: getOptionalStringField(value, "startedAt") } : {}),
		...(getOptionalStringField(value, "completedAt")
			? { completedAt: getOptionalStringField(value, "completedAt") }
			: {}),
		...(getOptionalStringField(value, "error") ? { error: getOptionalStringField(value, "error") } : {}),
		...(typeof value.systemPromptPolicyVersion === "number" &&
		Number.isSafeInteger(value.systemPromptPolicyVersion) &&
		value.systemPromptPolicyVersion > 0
			? { systemPromptPolicyVersion: value.systemPromptPolicyVersion }
			: {}),
		...(getOptionalStringField(value, "model") ? { model: getOptionalStringField(value, "model") } : {}),
		...(getOptionalStringField(value, "provider") ? { provider: getOptionalStringField(value, "provider") } : {}),
		...(getOptionalStringField(value, "thinkingLevel")
			? { thinkingLevel: getOptionalStringField(value, "thinkingLevel") }
			: {}),
		...(typeof value.inputTokens === "number" && Number.isFinite(value.inputTokens)
			? { inputTokens: value.inputTokens }
			: {}),
		...(typeof value.outputTokens === "number" && Number.isFinite(value.outputTokens)
			? { outputTokens: value.outputTokens }
			: {}),
		...(typeof value.cacheReadTokens === "number" && Number.isFinite(value.cacheReadTokens)
			? { cacheReadTokens: value.cacheReadTokens }
			: {}),
		...(typeof value.cacheWriteTokens === "number" && Number.isFinite(value.cacheWriteTokens)
			? { cacheWriteTokens: value.cacheWriteTokens }
			: {}),
		...(typeof value.totalTokens === "number" && Number.isFinite(value.totalTokens)
			? { totalTokens: value.totalTokens }
			: {}),
		...(typeof value.costUsd === "number" && Number.isFinite(value.costUsd) ? { costUsd: value.costUsd } : {}),
		...(getOptionalStringField(value, "stopReason")
			? { stopReason: getOptionalStringField(value, "stopReason") }
			: {}),
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
	const kind = normalizeResearchPlanTaskKind(value.kind);
	return {
		id: getStringField(value, "id", `research-plan-task-${index + 1}`),
		planId: getStringField(value, "planId", "research-plan-1"),
		kind,
		status: normalizeResearchPlanTaskStatus(value.status),
		sequence: Math.max(1, Math.floor(getNumberField(value, "sequence", index + 1))),
		title: getStringField(value, "title", "Research task"),
		description: getStringField(value, "description", "Carry out the next bounded research move."),
		...(getOptionalStringField(value, "goal") ? { goal: getOptionalStringField(value, "goal") } : {}),
		acceptanceCriteria: getStringArrayField(value, "acceptanceCriteria"),
		dependsOnTaskIds: getStringArrayField(value, "dependsOnTaskIds"),
		requiredCapabilities: uniqueResearchPlanTaskRequiredCapabilities([
			...getStringArrayField(value, "requiredCapabilities"),
			...requiredCapabilitiesForTaskKind(kind),
		]),
		sourceRequests: normalizeResearchTaskSourceRequests(value.sourceRequests),
		...(getOptionalStringField(value, "repairOfTaskId")
			? { repairOfTaskId: getOptionalStringField(value, "repairOfTaskId") }
			: {}),
		...(normalizeRepairGeneration(value.repairGeneration) !== undefined
			? { repairGeneration: normalizeRepairGeneration(value.repairGeneration) }
			: {}),
		...(getOptionalStringField(value, "supersededByTaskId")
			? { supersededByTaskId: getOptionalStringField(value, "supersededByTaskId") }
			: {}),
		attemptIds: getStringArrayField(value, "attemptIds"),
		...(getOptionalStringField(value, "acceptedAttemptId")
			? { acceptedAttemptId: getOptionalStringField(value, "acceptedAttemptId") }
			: {}),
		...(getOptionalStringField(value, "latestAttemptId")
			? { latestAttemptId: getOptionalStringField(value, "latestAttemptId") }
			: {}),
		...(getOptionalStringField(value, "pathId") ? { pathId: getOptionalStringField(value, "pathId") } : {}),
		...(getOptionalStringField(value, "runId") ? { runId: getOptionalStringField(value, "runId") } : {}),
		...(getOptionalStringField(value, "reportId") ? { reportId: getOptionalStringField(value, "reportId") } : {}),
		sourceIds: getStringArrayField(value, "sourceIds"),
		claimSupportIds: getStringArrayField(value, "claimSupportIds"),
		computationalArtifactIds: getStringArrayField(value, "computationalArtifactIds"),
		evidenceEntryIds: getStringArrayField(value, "evidenceEntryIds"),
		...(normalizeResearchTaskProgressKind(value.progressKind)
			? { progressKind: normalizeResearchTaskProgressKind(value.progressKind) }
			: {}),
		...(normalizeResearchTaskReviewOutcome(value.reviewOutcome)
			? { reviewOutcome: normalizeResearchTaskReviewOutcome(value.reviewOutcome) }
			: {}),
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

function normalizeResearchTaskAttempt(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): ResearchTaskAttemptRecord | undefined {
	const id = getOptionalStringField(value, "id");
	const taskId = getOptionalStringField(value, "taskId");
	const planId = getOptionalStringField(value, "planId");
	if (!id || !taskId || !planId) return undefined;
	const startedAt = getStringField(value, "startedAt", fallbackTime);
	const stages = getArrayField(value, "stages").flatMap((stage) => normalizeResearchTaskAttemptStage(stage));
	const currentStage = normalizeResearchTaskPipelineStage(value.currentStage) ?? "evidence-preparation";
	return {
		id,
		taskId,
		planId,
		attemptNumber: Math.max(1, Math.floor(getNumberField(value, "attemptNumber", index + 1))),
		status: normalizeResearchTaskAttemptStatus(value.status),
		currentStage,
		stages: stages.length > 0 ? stages : createResearchTaskAttemptStages(),
		...(getOptionalStringField(value, "sourceCatalogArtifactId")
			? { sourceCatalogArtifactId: getOptionalStringField(value, "sourceCatalogArtifactId") }
			: {}),
		...(getOptionalStringField(value, "claimLedgerArtifactId")
			? { claimLedgerArtifactId: getOptionalStringField(value, "claimLedgerArtifactId") }
			: {}),
		...(getOptionalStringField(value, "reportArtifactId")
			? { reportArtifactId: getOptionalStringField(value, "reportArtifactId") }
			: {}),
		computationArtifactIds: getStringArrayField(value, "computationArtifactIds"),
		modelCalls: getArrayField(value, "modelCalls").flatMap((call) => {
			const normalized = normalizeResearchRunModelCall(call, startedAt);
			return normalized ? [normalized] : [];
		}),
		...(normalizeResearchTaskReviewOutcome(value.reviewOutcome)
			? { reviewOutcome: normalizeResearchTaskReviewOutcome(value.reviewOutcome) }
			: {}),
		...(normalizeResearchAttemptFailure(value.failure)
			? { failure: normalizeResearchAttemptFailure(value.failure)! }
			: {}),
		startedAt,
		updatedAt: getStringField(value, "updatedAt", startedAt),
		...(getOptionalStringField(value, "completedAt")
			? { completedAt: getOptionalStringField(value, "completedAt") }
			: {}),
	};
}

function normalizeResearchTaskAttemptStage(value: Record<string, unknown>): ResearchTaskAttemptStageRecord[] {
	const stage = normalizeResearchTaskPipelineStage(value.stage);
	const status = value.status;
	if (!stage || !isResearchTaskAttemptStageStatus(status)) return [];
	return [
		{
			stage,
			status,
			...(getOptionalStringField(value, "startedAt")
				? { startedAt: getOptionalStringField(value, "startedAt") }
				: {}),
			...(getOptionalStringField(value, "completedAt")
				? { completedAt: getOptionalStringField(value, "completedAt") }
				: {}),
			modelCallIds: getStringArrayField(value, "modelCallIds"),
			artifactIds: getStringArrayField(value, "artifactIds"),
			...(normalizeResearchAttemptFailure(value.failure)
				? { failure: normalizeResearchAttemptFailure(value.failure)! }
				: {}),
		},
	];
}

function normalizeResearchExecution(
	value: Record<string, unknown>,
	fallbackTime: string,
	_index: number,
): ResearchExecutionRecord | undefined {
	const id = getOptionalStringField(value, "id");
	if (!id) return undefined;
	const createdAt = getStringField(value, "createdAt", fallbackTime);
	const status = value.status;
	if (
		status !== "running" &&
		status !== "paused" &&
		status !== "completed" &&
		status !== "cancelled" &&
		status !== "failed"
	) {
		return undefined;
	}
	return {
		id,
		requestedTaskCount: Math.max(1, Math.floor(getNumberField(value, "requestedTaskCount", 1))),
		...(getOptionalStringField(value, "pathId") ? { pathId: getOptionalStringField(value, "pathId") } : {}),
		taskIds: getStringArrayField(value, "taskIds"),
		attemptIds: getStringArrayField(value, "attemptIds"),
		status,
		...(normalizeResearchAttemptFailure(value.failure)
			? { failure: normalizeResearchAttemptFailure(value.failure)! }
			: {}),
		createdAt,
		updatedAt: getStringField(value, "updatedAt", createdAt),
		...(getOptionalStringField(value, "completedAt")
			? { completedAt: getOptionalStringField(value, "completedAt") }
			: {}),
		...(getOptionalStringField(value, "cancelledAt")
			? { cancelledAt: getOptionalStringField(value, "cancelledAt") }
			: {}),
	};
}

function normalizeCanonicalProjection(value: unknown, fallbackTime: string): CoMathCanonicalProjection | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const record = value as Record<string, unknown>;
	if (record.policyVersion !== 1) return undefined;
	return {
		policyVersion: 1,
		acceptedAttemptIds: getStringArrayField(record, "acceptedAttemptIds"),
		acceptedLegacyReportIds: getStringArrayField(record, "acceptedLegacyReportIds"),
		workingPaperSectionIds: getStringArrayField(record, "workingPaperSectionIds"),
		updatedAt: getStringField(record, "updatedAt", fallbackTime),
	};
}

function normalizeResearchAttemptFailure(value: unknown): ResearchAttemptFailure | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const record = value as Record<string, unknown>;
	const stage = normalizeResearchTaskPipelineStage(record.stage);
	const code = getOptionalStringField(record, "code");
	const message = getOptionalStringField(record, "message");
	if (!stage || !code || !message || typeof record.retryable !== "boolean") return undefined;
	return { stage, code, message, claimIds: getStringArrayField(record, "claimIds"), retryable: record.retryable };
}

function normalizeResearchTaskAttemptStatus(value: unknown): ResearchTaskAttemptStatus {
	return value === "queued" ||
		value === "running" ||
		value === "paused" ||
		value === "needs-revision" ||
		value === "rejected" ||
		value === "accepted" ||
		value === "failed" ||
		value === "cancelled"
		? value
		: "queued";
}

function normalizeResearchTaskPipelineStage(value: unknown): ResearchTaskPipelineStage | undefined {
	return value === "evidence-preparation" ||
		value === "specialist" ||
		value === "claim-validation" ||
		value === "critic" ||
		value === "synthesis" ||
		value === "capability-validation" ||
		value === "skeptic" ||
		value === "finalization"
		? value
		: undefined;
}

function isResearchTaskAttemptStageStatus(value: unknown): value is ResearchTaskAttemptStageRecord["status"] {
	return (
		value === "pending" || value === "running" || value === "completed" || value === "blocked" || value === "failed"
	);
}

export function createResearchTaskAttemptStages(): ResearchTaskAttemptStageRecord[] {
	return [
		"evidence-preparation",
		"specialist",
		"claim-validation",
		"critic",
		"synthesis",
		"capability-validation",
		"skeptic",
		"finalization",
	].map((stage) => ({
		stage: stage as ResearchTaskPipelineStage,
		status: "pending",
		modelCallIds: [],
		artifactIds: [],
	}));
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

function normalizeResearchTaskReviewOutcome(value: unknown): ResearchTaskReviewOutcome | undefined {
	if (value === "accepted" || value === "needs-revision" || value === "rejected" || value === "unreviewed") {
		return value;
	}
	if (value === "completed-with-concerns") {
		return "needs-revision";
	}
	return undefined;
}

function normalizeResearchTaskProgressKind(value: unknown): ResearchTaskProgressKind | undefined {
	if (value === "mathematical" || value === "obstruction" || value === "status") {
		return value;
	}
	return undefined;
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

function normalizeResearchObligation(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): ResearchObligationRecord {
	const createdAt = getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime));
	return {
		id: getStringField(value, "id", `obligation-${index + 1}`),
		statement: getStringField(value, "statement", "Unstated research obligation"),
		assumptions: getStringArrayField(value, "assumptions"),
		...(getOptionalStringField(value, "parentObligationId")
			? { parentObligationId: getOptionalStringField(value, "parentObligationId") }
			: {}),
		evidenceEntryIds: getStringArrayField(value, "evidenceEntryIds"),
		computationalArtifactIds: getStringArrayField(value, "computationalArtifactIds"),
		refutationEvidenceEntryIds: getStringArrayField(value, "refutationEvidenceEntryIds"),
		gaps: getStringArrayField(value, "gaps"),
		status: normalizeResearchObligationStatus(value.status),
		...(getOptionalStringField(value, "statusReason")
			? { statusReason: getOptionalStringField(value, "statusReason") }
			: {}),
		...(getOptionalStringField(value, "reviewedCleanAt")
			? { reviewedCleanAt: getOptionalStringField(value, "reviewedCleanAt") }
			: {}),
		...(getOptionalStringField(value, "taskId") ? { taskId: getOptionalStringField(value, "taskId") } : {}),
		...(getOptionalStringField(value, "reportId") ? { reportId: getOptionalStringField(value, "reportId") } : {}),
		createdAt,
		updatedAt: getStringField(value, "updatedAt", createdAt),
	};
}

function normalizeResearchConstraint(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): ResearchConstraintRecord {
	const createdAt = getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime));
	return {
		id: getStringField(value, "id", `constraint-${index + 1}`),
		text: getStringField(value, "text", "Unstated research constraint"),
		kind: normalizeResearchConstraintKind(value.kind),
		status: value.status === "retired" ? "retired" : "active",
		origin: normalizeResearchConstraintOrigin(value.origin),
		...(getOptionalStringField(value, "retiredReason")
			? { retiredReason: getOptionalStringField(value, "retiredReason") }
			: {}),
		createdAt,
		updatedAt: getStringField(value, "updatedAt", createdAt),
	};
}

function normalizeResearchConstraintKind(value: unknown): ResearchConstraintKind {
	if (value === "avoid" || value === "convention" || value === "scope") {
		return value;
	}
	return "avoid";
}

function normalizeResearchConstraintOrigin(value: unknown): ResearchConstraintOrigin {
	if (value === "human" || value === "director" || value === "reviewer") {
		return value;
	}
	return "human";
}

function normalizeTheoremApplicabilityCheck(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): TheoremApplicabilityCheckRecord {
	const createdAt = getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime));
	const hypotheses = Array.isArray(value.hypotheses) ? value.hypotheses : [];
	return {
		id: getStringField(value, "id", `theorem-check-${index + 1}`),
		theorem: getStringField(value, "theorem", "Unnamed theorem"),
		targetObject: getStringField(value, "targetObject", "the current object"),
		hypotheses: hypotheses
			.filter((raw): raw is Record<string, unknown> => typeof raw === "object" && raw !== null)
			.map((raw) => ({
				hypothesis: getStringField(raw, "hypothesis", ""),
				status: normalizeTheoremHypothesisStatus(raw.status),
				...(getOptionalStringField(raw, "note") ? { note: getOptionalStringField(raw, "note") } : {}),
			}))
			.filter((hypothesis) => hypothesis.hypothesis.length > 0),
		status: normalizeTheoremApplicabilityStatus(value.status),
		...(getOptionalStringField(value, "consequence")
			? { consequence: getOptionalStringField(value, "consequence") }
			: {}),
		...(getOptionalStringField(value, "pathId") ? { pathId: getOptionalStringField(value, "pathId") } : {}),
		...(getOptionalStringField(value, "reportId") ? { reportId: getOptionalStringField(value, "reportId") } : {}),
		...(getOptionalStringField(value, "taskId") ? { taskId: getOptionalStringField(value, "taskId") } : {}),
		sourceIds: getStringArrayField(value, "sourceIds"),
		createdAt,
		updatedAt: getStringField(value, "updatedAt", createdAt),
	};
}

function normalizeTheoremHypothesisStatus(value: unknown): TheoremHypothesisStatus {
	if (value === "satisfied" || value === "failed" || value === "unknown") {
		return value;
	}
	return "unknown";
}

function normalizeTheoremApplicabilityStatus(value: unknown): TheoremApplicabilityStatus {
	if (value === "applies" || value === "rejected-as-direct-route" || value === "needs-verification") {
		return value;
	}
	return "needs-verification";
}

function normalizeResearchPivot(
	value: Record<string, unknown>,
	fallbackTime: string,
	index: number,
): ResearchPivotRecord {
	const createdAt = getStringField(value, "createdAt", getStringField(value, "updatedAt", fallbackTime));
	return {
		id: getStringField(value, "id", `pivot-${index + 1}`),
		fromRoute: getStringField(value, "fromRoute", "an earlier route"),
		toRoute: getStringField(value, "toRoute", "a replacement route"),
		reason: getStringField(value, "reason", "The earlier route did not work."),
		...(getOptionalStringField(value, "pathId") ? { pathId: getOptionalStringField(value, "pathId") } : {}),
		...(getOptionalStringField(value, "taskId") ? { taskId: getOptionalStringField(value, "taskId") } : {}),
		...(getOptionalStringField(value, "reportId") ? { reportId: getOptionalStringField(value, "reportId") } : {}),
		...(getOptionalStringField(value, "applicabilityCheckId")
			? { applicabilityCheckId: getOptionalStringField(value, "applicabilityCheckId") }
			: {}),
		createdAt,
		updatedAt: getStringField(value, "updatedAt", createdAt),
	};
}

export function normalizeResearchClaimCategory(value: unknown): ResearchClaimCategory | undefined {
	if (
		value === "verified-fact" ||
		value === "source-backed-theorem" ||
		value === "computed-anchor-result" ||
		value === "convention-dependent-claim" ||
		value === "plausible-interpretation" ||
		value === "failed-route" ||
		value === "open-caveat"
	) {
		return value;
	}
	return undefined;
}

function normalizeResearchObligationStatus(value: unknown): ResearchObligationStatus {
	if (
		value === "open" ||
		value === "supported" ||
		value === "established" ||
		value === "refuted" ||
		value === "retired"
	) {
		return value;
	}
	return "open";
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
	if (value === "literature-search" || value === "claim-validation" || value === "computation") {
		return value;
	}
	return normalizeResearchWorkstreamRole(value);
}

function normalizeResearchWorkstreamReportStatus(value: unknown): ResearchWorkstreamReportStatus {
	return value === "blocked" ? "blocked" : "completed";
}

function normalizeResearchWorkstreamReportAcceptanceStatus(value: unknown): ResearchWorkstreamReportAcceptanceStatus {
	return value === "provisional" || value === "rejected" ? value : "accepted";
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

function normalizeCoMathSourceClaimScope(value: unknown): CoMathSourceClaimScope | undefined {
	return value === "formal-document" ||
		value === "supplemental" ||
		value === "ordinary-document" ||
		value === "detached-source"
		? value
		: undefined;
}

function normalizeCoMathWorkspaceSourceRole(value: unknown): CoMathWorkspaceSourceRole | undefined {
	return value === "primary-text" ||
		value === "compiled-binary" ||
		value === "curated-summary" ||
		value === "bibliographic-metadata" ||
		value === "snapshot-metadata"
		? value
		: undefined;
}

function normalizeCoMathSourceRegionKind(value: unknown): GroundingReferenceRecord["regionKind"] | undefined {
	return value === "preamble" ||
		value === "formal-document" ||
		value === "included-formal-document" ||
		value === "supplemental-after-end" ||
		value === "detached-tex" ||
		value === "ordinary-document"
		? value
		: undefined;
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
		value === "research_workstream_report_reviewed" ||
		value === "research_workstream_run_recorded" ||
		value === "research_batch_recorded" ||
		value === "research_plan_recorded" ||
		value === "research_plan_task_recorded" ||
		value === "research_obligation_recorded" ||
		value === "research_constraint_recorded" ||
		value === "theorem_applicability_check_recorded" ||
		value === "research_pivot_recorded" ||
		value === "literature_source_recorded" ||
		value === "literature_search_recorded" ||
		value === "literature_claim_support_recorded" ||
		value === "research_evidence_board_entry_recorded" ||
		value === "computational_artifact_recorded" ||
		value === "grounding_reference_recorded" ||
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

function uniqueResearchPlanTaskRequiredCapabilities(values: readonly string[]): ResearchPlanTaskRequiredCapability[] {
	return uniqueStrings(values).filter(
		(value): value is ResearchPlanTaskRequiredCapability =>
			value === "source-grounding" || value === "sandboxed-computation" || value === "independent-review",
	);
}

function normalizeRepairGeneration(value: unknown): number | undefined {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : undefined;
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
	return isErrorCode(error, "ENOENT");
}

function isErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
