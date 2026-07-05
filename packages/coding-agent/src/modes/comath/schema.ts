export type GoalStatus = "proposed" | "approved" | "active" | "completed" | "deferred";
export type ClaimStatus = "draft" | "proof_sketch" | "needs_review" | "proved" | "disproved";
export type EvidenceKind = "proof" | "computation" | "reference" | "counterexample" | "note";
export type WarningSeverity = "low" | "medium" | "high";
export type WarningStatus = "open" | "resolved";
export type WorkstreamStatus = "active" | "running" | "blocked" | "needs_review";
export type RoleRunStatus = "queued" | "running" | "completed" | "blocked" | "failed" | "aborted" | "cancelled";
export type RoleRunExecutionMode = "foreground" | "background";
export type CoMathRole = "coordinator" | "workstream" | "reviewer" | "synthesizer";
export type ReviewRoundStatus = "open" | "completed";
export type ReviewRoundOutcome = "accepted" | "rejected" | "revision_requested" | "blocked_by_invariant";
export type ReportReviewStatus = "open" | "completed";
export type ReportReviewOutcome = "accepted" | "revision_requested" | "blocked";
export type WorkingPaperSectionStatus = "draft" | "needs_revision" | "reviewed";
export type MarginNoteKind = "gap" | "todo" | "warning" | "provenance" | "comment" | "scrutiny";
export type MarginNoteStatus = "open" | "resolved";
export type ResearchPathStatus = "active" | "promising" | "blocked" | "abandoned" | "resolved";
export type ResearchWorkstreamRole = "coordinator" | "specialist" | "critic" | "synthesizer";
export type ResearchWorkstreamReportStatus = "completed" | "blocked";
export type ResearchWorkstreamRunStatus = "queued" | "running" | "completed" | "blocked" | "failed" | "interrupted";
export type ResearchWorkstreamRunStage = ResearchWorkstreamRole | "literature-search" | "computation";
export type ResearchWorkstreamIncrementalReportStatus = "running" | "completed" | "blocked" | "failed";
export type ResearchBatchStatus = "running" | "paused" | "completed" | "failed" | "cancelled";
export type ResearchPlanStatus = "active" | "paused" | "completed" | "failed" | "cancelled";
export type ResearchPlanTaskStatus = "pending" | "running" | "completed" | "blocked" | "failed" | "cancelled";
export type ResearchPlanTaskKind =
	| "literature-search"
	| "proof-attempt"
	| "refutation-attempt"
	| "computation"
	| "critic"
	| "synthesis"
	| "source-refresh"
	| "revise-conjecture"
	| "export";
export type ConjectureRevisionKind = "weakened" | "strengthened" | "specialized" | "generalized" | "repaired";
export type LiteratureSourceKind = "web" | "paper" | "book" | "local-file" | "user-provided" | "unknown";
export type LiteratureSourceProvider =
	| "workspace"
	| "arxiv"
	| "semantic-scholar"
	| "crossref"
	| "openalex"
	| "user-provided"
	| "unknown";
export type LiteratureSourceType = "preprint" | "journal" | "conference" | "book" | "web" | "unknown";
export type LiteratureSearchProviderStatus = "completed" | "failed" | "skipped";
export type LiteratureClaimSupportStatus = "supported" | "partially-supported" | "unsupported" | "conflicting";
export type ResearchEvidenceClassification =
	| "theorem"
	| "conjecture"
	| "heuristic"
	| "computation"
	| "survey-context"
	| "unsupported"
	| "conflicting";
export type ComputationalArtifactKind = "script" | "stdout" | "stderr" | "table" | "summary";
export type ComputationalArtifactStatus = "created" | "completed" | "failed" | "blocked";
export type ResearchCoordinatorNextMovePriority = "high" | "medium" | "low";
export type CoMathActor = "human" | "system" | "coordinator" | "workstream" | "reviewer" | "synthesizer";
export type CoMathEventKind =
	| "project_initialized"
	| "goal_added"
	| "goal_status_changed"
	| "workstream_added"
	| "role_report_saved"
	| "claim_proposed"
	| "evidence_added"
	| "warning_added"
	| "warning_resolved"
	| "review_requested"
	| "review_decision_recorded"
	| "claim_status_changed"
	| "synthesis_generated"
	| "artifact_recorded"
	| "role_run_queued"
	| "role_run_started"
	| "role_run_completed"
	| "role_run_blocked"
	| "role_run_failed"
	| "role_run_aborted"
	| "role_run_cancelled"
	| "workstream_status_changed"
	| "human_intervention_recorded"
	| "review_round_recorded"
	| "report_review_round_recorded"
	| "claim_revised"
	| "working_paper_section_recorded"
	| "margin_note_recorded"
	| "margin_note_resolved"
	| "working_paper_exported"
	| "research_workstream_recorded"
	| "research_workstream_run_recorded"
	| "research_batch_recorded"
	| "research_plan_recorded"
	| "research_plan_task_recorded"
	| "literature_source_recorded"
	| "literature_search_recorded"
	| "literature_claim_support_recorded"
	| "research_evidence_board_entry_recorded"
	| "computational_artifact_recorded"
	| "research_coordinator_report_recorded";
export type ArtifactKind =
	| "source"
	| "computation"
	| "latex_note"
	| "proof_sketch"
	| "counterexample_search"
	| "reference"
	| "dataset"
	| "script"
	| "figure"
	| "failed_attempt"
	| "human_note"
	| "working_paper_export";
export type ExportFormat = "markdown";

export interface ApprovedGoal {
	id: string;
	text: string;
	status: GoalStatus;
	createdAt: string;
	updatedAt: string;
}

export interface Workstream {
	id: string;
	title: string;
	status: WorkstreamStatus;
	statusReason?: string;
	goalIds: string[];
	claimIds: string[];
	latestReportIds: string[];
	latestRunIds: string[];
	createdAt: string;
	updatedAt: string;
}

export interface Claim {
	id: string;
	workstreamId: string;
	statement: string;
	status: ClaimStatus;
	evidenceIds: string[];
	warningIds: string[];
	createdAt: string;
	updatedAt: string;
}

export interface Evidence {
	id: string;
	claimId: string;
	kind: EvidenceKind;
	summary: string;
	createdAt: string;
	updatedAt: string;
}

export interface Warning {
	id: string;
	claimId: string;
	severity: WarningSeverity;
	status: WarningStatus;
	message: string;
	createdAt: string;
	updatedAt: string;
}

export interface Report {
	id: string;
	title: string;
	summary: string;
	blockers: string[];
	createdAt: string;
	updatedAt: string;
}

export interface ReviewQueueItem {
	id: string;
	claimId: string;
	reason: string;
	createdAt: string;
}

export interface CoMathEvent {
	id: string;
	kind: CoMathEventKind;
	actor: CoMathActor;
	summary: string;
	subjectId?: string;
	relatedIds: string[];
	createdAt: string;
}

export interface ArtifactRecord {
	id: string;
	kind: ArtifactKind;
	title: string;
	summary: string;
	provenance?: string;
	path?: string;
	sourcePath?: string;
	sourcePathKind?: "workspace" | "absolute";
	relatedClaimIds: string[];
	relatedWorkstreamIds: string[];
	relatedReportIds: string[];
	createdAt: string;
	updatedAt: string;
}

export interface RoleRunRecord {
	id: string;
	role: CoMathRole;
	status: RoleRunStatus;
	targetWorkstreamId?: string;
	targetClaimId?: string;
	task: string;
	executionMode?: RoleRunExecutionMode;
	reportId?: string;
	transcriptPath?: string;
	createdClaimIds: string[];
	createdEvidenceIds: string[];
	createdWarningIds: string[];
	createdArtifactIds: string[];
	blockerMessages: string[];
	errorMessage?: string;
	queuedAt?: string;
	startedAt?: string;
	completedAt?: string;
	cancelledAt?: string;
	cancelReason?: string;
	updatedAt: string;
}

export interface ReviewRoundRecord {
	id: string;
	claimId: string;
	roleRunId: string;
	reportId: string;
	status: ReviewRoundStatus;
	decisionStatus: ClaimStatus;
	outcome: ReviewRoundOutcome;
	createdEvidenceIds: string[];
	createdWarningIds: string[];
	resolvedWarningIds: string[];
	createdAt: string;
	updatedAt: string;
}

export interface ReportReviewRoundRecord {
	id: string;
	reportId: string;
	roleRunId: string;
	status: ReportReviewStatus;
	outcome: ReportReviewOutcome;
	summary: string;
	createdWarningIds: string[];
	createdAt: string;
	updatedAt: string;
}

export interface ClaimRevisionRecord {
	id: string;
	claimId: string;
	previousStatement: string;
	revisedStatement: string;
	reason: string;
	actor: CoMathActor;
	createdAt: string;
}

export interface WorkingPaperSection {
	id: string;
	title: string;
	body: string;
	status: WorkingPaperSectionStatus;
	sourceClaimIds: string[];
	sourceEvidenceIds: string[];
	sourceWarningIds: string[];
	sourceArtifactIds: string[];
	sourceReviewRoundIds: string[];
	sourceRoleRunIds: string[];
	marginNoteIds: string[];
	createdAt: string;
	updatedAt: string;
}

export interface MarginNote {
	id: string;
	kind: MarginNoteKind;
	status: MarginNoteStatus;
	subjectId: string;
	sectionId?: string;
	message: string;
	resolution?: string;
	createdAt: string;
	updatedAt: string;
	resolvedAt?: string;
}

export interface ResearchPath {
	id: string;
	title: string;
	objective: string;
	status: ResearchPathStatus;
	latestFindings: string[];
	blockers: string[];
	suggestedNextMove: string;
	priority: number;
	createdAt: string;
	updatedAt: string;
}

export interface ResearchFocus {
	pathIds: string[];
	reason: string;
	updatedAt: string;
}

export interface LiteratureSourceArtifact {
	id: string;
	kind: LiteratureSourceKind;
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
	authors: string[];
	year?: string;
	summary: string;
	extractedText?: string;
	createdAt: string;
	updatedAt: string;
}

export interface LiteratureSearchProviderRecord {
	provider: LiteratureSourceProvider;
	query: string;
	status: LiteratureSearchProviderStatus;
	candidateCount: number;
	error?: string;
}

export interface LiteratureSearchRecord {
	id: string;
	pathId?: string;
	runId?: string;
	queries: string[];
	providers: LiteratureSearchProviderRecord[];
	candidateCount: number;
	selectedSourceIds: string[];
	startedAt: string;
	completedAt: string;
	createdAt: string;
	updatedAt: string;
}

export interface LiteratureClaimSupport {
	id: string;
	pathId?: string;
	reportId?: string;
	claim: string;
	sourceIds: string[];
	status: LiteratureClaimSupportStatus;
	note?: string;
	createdAt: string;
	updatedAt: string;
}

export interface ResearchEvidenceBoardEntry {
	id: string;
	pathId?: string;
	reportId?: string;
	claimSupportId?: string;
	marginNoteId?: string;
	sourceIds: string[];
	computationalArtifactIds: string[];
	claim: string;
	classification: ResearchEvidenceClassification;
	rationale: string;
	/** Evidence entry this statement was revised from (conjecture lineage). */
	parentEntryId?: string;
	/** How the statement changed relative to its parent. */
	revisionKind?: ConjectureRevisionKind;
	/** One sentence recording what refuted or wounded the parent statement. */
	revisionNote?: string;
	createdAt: string;
	updatedAt: string;
}

export interface ComputationalArtifact {
	id: string;
	pathId: string;
	reportId?: string;
	runId?: string;
	kind: ComputationalArtifactKind;
	status: ComputationalArtifactStatus;
	title: string;
	filePath?: string;
	command?: string;
	exitCode?: number;
	summary: string;
	createdAt: string;
	updatedAt: string;
}

export interface ResearchWorkstreamStepRecord {
	role: ResearchWorkstreamRole;
	title: string;
	summary: string;
	details: string[];
}

export interface ResearchWorkstreamReportRecord {
	id: string;
	kind: "research_workstream";
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
	sourceIds: string[];
	claimSupportIds: string[];
	computationalArtifactIds: string[];
	createdAt: string;
	updatedAt: string;
}

export interface ResearchWorkstreamIncrementalReportRecord {
	id: string;
	stage: ResearchWorkstreamRunStage;
	status: ResearchWorkstreamIncrementalReportStatus;
	title: string;
	summary: string;
	details: string[];
	createdAt: string;
}

export interface ResearchWorkstreamRunRecord {
	id: string;
	pathId: string;
	pathTitle: string;
	status: ResearchWorkstreamRunStatus;
	currentStage: ResearchWorkstreamRunStage;
	batchId?: string;
	batchStepIndex?: number;
	startedAt: string;
	updatedAt: string;
	completedAt?: string;
	incrementalReports: ResearchWorkstreamIncrementalReportRecord[];
	finalReportId?: string;
	failureReason?: string;
	usedFallback?: boolean;
}

export interface ResearchBatchRecord {
	id: string;
	status: ResearchBatchStatus;
	requestedStepCount: number;
	completedStepCount: number;
	runIds: string[];
	initialPathId?: string;
	currentPathId?: string;
	nextPathId?: string;
	lastCompletedPathId?: string;
	interruptedRunId?: string;
	failureReason?: string;
	cancelReason?: string;
	createdAt: string;
	startedAt: string;
	updatedAt: string;
	completedAt?: string;
	cancelledAt?: string;
}

export interface ResearchPlanRecord {
	id: string;
	title: string;
	objective: string;
	status: ResearchPlanStatus;
	taskIds: string[];
	currentTaskId?: string;
	pauseReason?: string;
	failureReason?: string;
	cancelReason?: string;
	createdAt: string;
	startedAt?: string;
	updatedAt: string;
	completedAt?: string;
	cancelledAt?: string;
}

export interface ResearchPlanTaskRecord {
	id: string;
	planId: string;
	kind: ResearchPlanTaskKind;
	status: ResearchPlanTaskStatus;
	sequence: number;
	title: string;
	description: string;
	/** Free-form task goal the executing role should pursue (model-authored plans). */
	goal?: string;
	/** What "done" means for this task; shown to the executing role and the skeptic. */
	acceptanceCriteria: string[];
	pathId?: string;
	runId?: string;
	reportId?: string;
	sourceIds: string[];
	claimSupportIds: string[];
	computationalArtifactIds: string[];
	evidenceEntryIds: string[];
	blockedReason?: string;
	failureReason?: string;
	createdAt: string;
	startedAt?: string;
	updatedAt: string;
	completedAt?: string;
}

export interface ResearchCoordinatorNextMove {
	title: string;
	pathId?: string;
	rationale: string;
	prompt?: string;
	priority: ResearchCoordinatorNextMovePriority;
}

export interface ResearchCoordinatorReportRecord {
	id: string;
	createdAt: string;
	updatedAt: string;
	inputReportIds: string[];
	inputPathIds: string[];
	inputSourceIds: string[];
	inputComputationalArtifactIds: string[];
	whatWeKnow: string[];
	roadblocks: string[];
	recommendedNextMoves: ResearchCoordinatorNextMove[];
	humanHelpUseful: string[];
	suggestedPathId?: string;
	suggestedPrompt?: string;
	workingPaperSectionId?: string;
}

export interface CoMathProjectState {
	version: 1;
	projectId: string;
	title: string;
	rootQuestion: string;
	approvedGoals: ApprovedGoal[];
	workstreams: Workstream[];
	claims: Claim[];
	evidence: Evidence[];
	warnings: Warning[];
	reports: Report[];
	reviewQueue: ReviewQueueItem[];
	artifacts: ArtifactRecord[];
	events: CoMathEvent[];
	roleRuns: RoleRunRecord[];
	reviewRounds: ReviewRoundRecord[];
	reportReviewRounds: ReportReviewRoundRecord[];
	claimRevisions: ClaimRevisionRecord[];
	workingPaperSections: WorkingPaperSection[];
	marginNotes: MarginNote[];
	researchPaths: ResearchPath[];
	researchReports: ResearchWorkstreamReportRecord[];
	researchWorkstreamRuns: ResearchWorkstreamRunRecord[];
	researchBatches: ResearchBatchRecord[];
	researchPlans: ResearchPlanRecord[];
	researchPlanTasks: ResearchPlanTaskRecord[];
	literatureSources: LiteratureSourceArtifact[];
	literatureSearches: LiteratureSearchRecord[];
	literatureClaimSupports: LiteratureClaimSupport[];
	researchEvidenceBoard: ResearchEvidenceBoardEntry[];
	computationalArtifacts: ComputationalArtifact[];
	researchCoordinatorReports: ResearchCoordinatorReportRecord[];
	researchFocus?: ResearchFocus;
	updatedAt: string;
}
