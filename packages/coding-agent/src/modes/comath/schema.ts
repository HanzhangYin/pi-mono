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
/** Whether a finished report is allowed to influence canonical project state. */
export type ResearchWorkstreamReportAcceptanceStatus = "provisional" | "accepted" | "rejected";
export type ResearchWorkstreamRunStatus = "queued" | "running" | "completed" | "blocked" | "failed" | "interrupted";
export type ResearchWorkstreamRunStage =
	| ResearchWorkstreamRole
	| "literature-search"
	| "claim-validation"
	| "computation";
export type ResearchWorkstreamIncrementalReportStatus = "running" | "completed" | "blocked" | "failed";
export type ResearchBatchStatus = "running" | "paused" | "completed" | "failed" | "cancelled";
export type ResearchPlanStatus = "active" | "paused" | "completed" | "failed" | "cancelled";
export type ResearchPlanTaskStatus = "pending" | "running" | "completed" | "blocked" | "failed" | "cancelled";
/** The authoritative lifecycle for new single-engine task attempts. */
export type ResearchTaskAttemptStatus =
	| "queued"
	| "running"
	| "paused"
	| "needs-revision"
	| "rejected"
	| "accepted"
	| "failed"
	| "cancelled";
export type ResearchTaskPipelineStage =
	| "evidence-preparation"
	| "specialist"
	| "claim-validation"
	| "critic"
	| "synthesis"
	| "capability-validation"
	| "skeptic"
	| "finalization";
/**
 * What a completed plan task actually produced:
 * - "mathematical": new evidence, computations, claims, or a repaired statement.
 * - "obstruction": a durable reason a route fails (rejected theorem check, recorded pivot) —
 *   negative knowledge that steers later planning.
 * - "status": context/status only (sources listed, state summarized); no new mathematics.
 */
export type ResearchTaskProgressKind = "mathematical" | "obstruction" | "status";
/** The independent review's verdict on a task-backed report. */
export type ResearchTaskReviewOutcome = "accepted" | "needs-revision" | "rejected" | "unreviewed";
/** Machine-enforceable evidence requirements for a plan task. */
export type ResearchPlanTaskRequiredCapability = "source-grounding" | "sandboxed-computation" | "independent-review";
export interface ResearchTaskSourceRequest {
	sourceId: string;
	ranges: Array<{ start: number; end: number }>;
}
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
export type ResearchObligationStatus = "open" | "supported" | "established" | "refuted" | "retired";
export type ResearchConstraintKind = "avoid" | "convention" | "scope";
export type ResearchConstraintStatus = "active" | "retired";
export type ResearchConstraintOrigin = "human" | "director" | "reviewer";
export type TheoremHypothesisStatus = "satisfied" | "failed" | "unknown";
export type TheoremApplicabilityStatus = "applies" | "rejected-as-direct-route" | "needs-verification";
export type ResearchClaimCategory =
	| "verified-fact"
	| "source-backed-theorem"
	| "computed-anchor-result"
	| "convention-dependent-claim"
	| "plausible-interpretation"
	| "failed-route"
	| "open-caveat";
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
export type CoMathSourceClaimScope = "formal-document" | "supplemental" | "ordinary-document" | "detached-source";
export type GroundingValidationFailureCode =
	| "missing-exact-locator"
	| "unknown-source"
	| "non-citable-source"
	| "invalid-range"
	| "cross-region"
	| "scope-mismatch"
	| "digest-mismatch"
	| "non-evidence-region"
	| "malformed-citation";

export interface GroundingValidationFailure {
	code: GroundingValidationFailureCode;
	sourceId?: string;
	lines?: { start: number; end: number };
	message: string;
}
export type CoMathWorkspaceSourceRole =
	| "primary-text"
	| "compiled-binary"
	| "curated-summary"
	| "bibliographic-metadata"
	| "snapshot-metadata";
export type CoMathSourceCitationEligibility = "citable" | "inventory-only";
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
	| "research_workstream_report_reviewed"
	| "research_workstream_run_recorded"
	| "research_batch_recorded"
	| "research_plan_recorded"
	| "research_plan_task_recorded"
	| "research_obligation_recorded"
	| "research_constraint_recorded"
	| "theorem_applicability_check_recorded"
	| "research_pivot_recorded"
	| "literature_source_recorded"
	| "literature_search_recorded"
	| "literature_claim_support_recorded"
	| "research_evidence_board_entry_recorded"
	| "computational_artifact_recorded"
	| "research_coordinator_report_recorded"
	| "grounding_reference_recorded";
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
	workspaceRole?: CoMathWorkspaceSourceRole;
	citationEligibility?: CoMathSourceCitationEligibility;
	sourceIndexId?: string;
	sourceRevisionId?: string;
	sourceRelativePath?: string;
	sourceFileSha256?: string;
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
	groundingReferenceIds?: string[];
	groundingFailures?: GroundingValidationFailure[];
	sourceScope?: CoMathSourceClaimScope;
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
	/** Researcher-facing claim category (verified fact, computed anchor result, failed route, ...). */
	claimCategory?: ResearchClaimCategory;
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

/** An exact, machine-checkable link from a research record to immutable source material. */
export interface GroundingReferenceRecord {
	id: string;
	subject: {
		kind: "report" | "claim-support" | "evidence" | "review" | "obligation" | "theorem-check";
		id: string;
	};
	relation: "supports" | "refutes" | "context" | "input" | "independent-check";
	/** A literature-source id or a recorded project artifact id. */
	artifactId: string;
	locator:
		| { kind: "lines"; start: number; end: number }
		| { kind: "pages"; start: number; end: number }
		| { kind: "section"; value: string }
		| { kind: "json-pointer"; value: string }
		| { kind: "whole-artifact" };
	excerpt?: string;
	excerptSha256?: string;
	sourceIndexId?: string;
	sourceRevisionId?: string;
	sourceRelativePath?: string;
	sourceFileSha256?: string;
	regionKind?:
		| "preamble"
		| "formal-document"
		| "included-formal-document"
		| "supplemental-after-end"
		| "detached-tex"
		| "ordinary-document";
	modelCallId?: string;
	validationStatus: "validated" | "legacy-unverified";
	createdAt: string;
}

export interface ResearchWorkstreamStepRecord {
	role: ResearchWorkstreamRole;
	title: string;
	summary: string;
	details: string[];
}

export interface ResearchWorkstreamReportTheoremCheck {
	theorem: string;
	targetObject: string;
	hypotheses: TheoremHypothesisCheck[];
	status: TheoremApplicabilityStatus;
	consequence?: string;
}

export interface ResearchWorkstreamReportPivot {
	fromRoute: string;
	toRoute: string;
	reason: string;
}

export interface ResearchWorkstreamReportRecord {
	id: string;
	kind: "research_workstream";
	pathId: string;
	pathTitle: string;
	status: ResearchWorkstreamReportStatus;
	/** Provisional reports are durable history but cannot update paths, evidence, or the paper. */
	acceptanceStatus?: ResearchWorkstreamReportAcceptanceStatus;
	reviewedAt?: string;
	promotedAt?: string;
	rejectionReason?: string;
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
	/** Stored until review so promotion does not need the original in-memory workstream result. */
	workingPaperSummary?: string;
	workingPaperSectionId?: string;
	sourceIds: string[];
	claimSupportIds: string[];
	computationalArtifactIds: string[];
	theoremChecks?: ResearchWorkstreamReportTheoremCheck[];
	routePivots?: ResearchWorkstreamReportPivot[];
	negativeConstraints?: string[];
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

/**
 * Provenance for a single model call made during research execution: which model answered, at
 * what thinking level, and what it consumed. Every field is optional so fake/test executors and
 * providers that omit usage stay valid.
 */
export interface ResearchModelCallProvenance {
	/** Version of the static Co-Math policy supplied to the model, when known. */
	systemPromptPolicyVersion?: number;
	model?: string;
	provider?: string;
	thinkingLevel?: string;
	inputTokens?: number;
	outputTokens?: number;
	cacheReadTokens?: number;
	cacheWriteTokens?: number;
	totalTokens?: number;
	costUsd?: number;
	stopReason?: string;
}

/** A model call recorded on a research workstream run, tagged with the stage that made it. */
export interface ResearchRunModelCallRecord extends ResearchModelCallProvenance {
	/** Stable attempt-local identifier for new engine calls. Legacy records may omit it. */
	id?: string;
	stage: string;
	at: string;
	status?: "started" | "completed" | "failed";
	startedAt?: string;
	completedAt?: string;
	error?: string;
}

export interface ResearchWorkstreamRunRecord {
	id: string;
	pathId: string;
	pathTitle: string;
	status: ResearchWorkstreamRunStatus;
	currentStage: ResearchWorkstreamRunStage;
	batchId?: string;
	batchStepIndex?: number;
	/** The research plan task this run executes, when the run is task-backed. */
	taskId?: string;
	startedAt: string;
	updatedAt: string;
	completedAt?: string;
	incrementalReports: ResearchWorkstreamIncrementalReportRecord[];
	/** Compact lifecycle transcript; full prompts/responses are never duplicated here. */
	transcriptPath?: string;
	/** Model calls this run made, appended at stage boundaries. */
	modelCalls?: ResearchRunModelCallRecord[];
	finalReportId?: string;
	/** Stage that failed; retained even if a later stage provides a bounded fallback. */
	failedStage?: ResearchWorkstreamRunStage;
	failureReason?: string;
	/** Stage for which a fallback was used, without replacing successful prior stages. */
	fallbackStage?: ResearchWorkstreamRunStage;
	fallbackReason?: string;
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
	/** Completed task ids that must succeed before this task is runnable. */
	dependsOnTaskIds: string[];
	/** Evidence capabilities that must be met before this task can be accepted. */
	requiredCapabilities: ResearchPlanTaskRequiredCapability[];
	/** Exact immutable source inputs selected by the director or user; execution never reparses prose. */
	sourceRequests?: ResearchTaskSourceRequest[];
	/** The immediately preceding rejected task this deterministic repair addresses. */
	repairOfTaskId?: string;
	/** Repair depth in a rejected-task chain; ordinary tasks omit this field. */
	repairGeneration?: number;
	/** The repair task now responsible for satisfying this rejected task's descendants. */
	supersededByTaskId?: string;
	/** Immutable single-engine attempts. Legacy repair metadata above remains read-only history. */
	attemptIds: string[];
	acceptedAttemptId?: string;
	latestAttemptId?: string;
	pathId?: string;
	runId?: string;
	reportId?: string;
	sourceIds: string[];
	claimSupportIds: string[];
	computationalArtifactIds: string[];
	evidenceEntryIds: string[];
	/** Classification of what this task produced, recorded when it completes. */
	progressKind?: ResearchTaskProgressKind;
	/** The independent review's verdict on this task, when a review ran. */
	reviewOutcome?: ResearchTaskReviewOutcome;
	blockedReason?: string;
	failureReason?: string;
	createdAt: string;
	startedAt?: string;
	updatedAt: string;
	completedAt?: string;
}

export interface ResearchAttemptFailure {
	stage: ResearchTaskPipelineStage;
	code: string;
	message: string;
	claimIds: string[];
	retryable: boolean;
}

export interface ResearchTaskAttemptStageRecord {
	stage: ResearchTaskPipelineStage;
	status: "pending" | "running" | "completed" | "blocked" | "failed";
	startedAt?: string;
	completedAt?: string;
	modelCallIds: string[];
	artifactIds: string[];
	failure?: ResearchAttemptFailure;
}

/** Immutable durable execution of one task. New work is represented here, not as a repair task. */
export interface ResearchTaskAttemptRecord {
	id: string;
	taskId: string;
	planId: string;
	attemptNumber: number;
	status: ResearchTaskAttemptStatus;
	currentStage: ResearchTaskPipelineStage;
	stages: ResearchTaskAttemptStageRecord[];
	sourceCatalogArtifactId?: string;
	claimLedgerArtifactId?: string;
	reportArtifactId?: string;
	computationArtifactIds: string[];
	modelCalls: ResearchRunModelCallRecord[];
	reviewOutcome?: ResearchTaskReviewOutcome;
	failure?: ResearchAttemptFailure;
	startedAt: string;
	updatedAt: string;
	completedAt?: string;
}

export interface ResearchExecutionRecord {
	id: string;
	requestedTaskCount: number;
	pathId?: string;
	taskIds: string[];
	attemptIds: string[];
	status: "running" | "paused" | "completed" | "cancelled" | "failed";
	failure?: ResearchAttemptFailure;
	createdAt: string;
	updatedAt: string;
	completedAt?: string;
	cancelledAt?: string;
}

export interface CoMathCanonicalProjection {
	policyVersion: 1;
	acceptedAttemptIds: string[];
	acceptedLegacyReportIds: string[];
	workingPaperSectionIds: string[];
	updatedAt: string;
}

/**
 * A standing research constraint: a rule the user (or a role) imposed on how the research may
 * proceed, most importantly negative constraints ("do not attack arbitrary Schubert
 * multiplication") and convention choices. Active constraints are shown to every model role and
 * must survive session restarts.
 */
export interface ResearchConstraintRecord {
	id: string;
	text: string;
	kind: ResearchConstraintKind;
	status: ResearchConstraintStatus;
	origin: ResearchConstraintOrigin;
	retiredReason?: string;
	createdAt: string;
	updatedAt: string;
}

export interface TheoremHypothesisCheck {
	hypothesis: string;
	status: TheoremHypothesisStatus;
	note?: string;
}

/**
 * An explicit applicability check of a named theorem against the current object: which hypotheses
 * are satisfied, failed, or unknown, and what follows. A route must not silently "use theorem X" —
 * it either records `applies`, or records why not and what the consequence is (typically a pivot).
 */
export interface TheoremApplicabilityCheckRecord {
	id: string;
	theorem: string;
	/** The object/situation the theorem was checked against. */
	targetObject: string;
	hypotheses: TheoremHypothesisCheck[];
	status: TheoremApplicabilityStatus;
	/** What follows from the verdict, e.g. the pivot taken after a rejection. */
	consequence?: string;
	pathId?: string;
	reportId?: string;
	taskId?: string;
	sourceIds: string[];
	createdAt: string;
	updatedAt: string;
}

/**
 * A recorded route change: the intended route that failed or was rejected, the replacement route,
 * and why. Pivots preserve the negative space of the project so failed routes are never silently
 * retried.
 */
export interface ResearchPivotRecord {
	id: string;
	fromRoute: string;
	toRoute: string;
	reason: string;
	pathId?: string;
	taskId?: string;
	reportId?: string;
	/** The theorem check that forced this pivot, when one did. */
	applicabilityCheckId?: string;
	createdAt: string;
	updatedAt: string;
}

/**
 * A mathematical obligation: one claim the project must either establish or refute, with its
 * assumptions, subclaims (children via `parentObligationId`), supporting and refuting evidence,
 * and known gaps. Status is durable mathematical state, separate from product copy:
 * - "open": no usable support yet.
 * - "supported": has model-backed supporting evidence; gaps may remain.
 * - "established": passed the deterministic establishment gate (support present, no open gaps,
 *   all subclaims settled, and a clean independent review). The only status synthesis may
 *   present as a finding.
 * - "refuted": refutation evidence (for example a counterexample) stands against it.
 * - "retired": superseded, typically by a conjecture revision.
 */
export interface ResearchObligationRecord {
	id: string;
	statement: string;
	assumptions: string[];
	/** When set, this obligation is a required subclaim/lemma of its parent. */
	parentObligationId?: string;
	evidenceEntryIds: string[];
	computationalArtifactIds: string[];
	refutationEvidenceEntryIds: string[];
	gaps: string[];
	status: ResearchObligationStatus;
	statusReason?: string;
	/** Set when an independent review of this obligation's support raised zero concerns. */
	reviewedCleanAt?: string;
	taskId?: string;
	reportId?: string;
	createdAt: string;
	updatedAt: string;
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
	/** Fingerprint of accepted reports plus review/evidence/constraint state used for this synthesis. */
	inputReviewFingerprint?: string;
	whatWeKnow: string[];
	roadblocks: string[];
	recommendedNextMoves: ResearchCoordinatorNextMove[];
	humanHelpUseful: string[];
	suggestedPathId?: string;
	suggestedPrompt?: string;
	workingPaperSectionId?: string;
}

export interface CoMathSourceIndexRecord {
	id: string;
	sourceId: string;
	sourceRevisionId: string;
	sourceManifestSha256: string;
	indexArtifactId: string;
	indexPath: string;
	indexSha256: string;
	policyVersion: number;
	status: "ready" | "failed";
	fileCount: number;
	documentCount: number;
	warnings: string[];
	createdAt: string;
	updatedAt: string;
}

export interface CoMathProjectState {
	version: 2;
	/** Monotonic compare-and-swap revision. Legacy in-memory fixtures may omit it. */
	revision?: number;
	/** Transaction manifest that produced this active state revision, when committed through the v2 store. */
	lastTransactionId?: string;
	/** New writes use the single-task engine when this policy is present. */
	enginePolicyVersion?: 1;
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
	researchTaskAttempts: ResearchTaskAttemptRecord[];
	researchExecutions: ResearchExecutionRecord[];
	canonicalProjection?: CoMathCanonicalProjection;
	researchObligations: ResearchObligationRecord[];
	researchConstraints: ResearchConstraintRecord[];
	theoremApplicabilityChecks: TheoremApplicabilityCheckRecord[];
	researchPivots: ResearchPivotRecord[];
	literatureSources: LiteratureSourceArtifact[];
	literatureSearches: LiteratureSearchRecord[];
	literatureClaimSupports: LiteratureClaimSupport[];
	sourceIndexes: CoMathSourceIndexRecord[];
	researchEvidenceBoard: ResearchEvidenceBoardEntry[];
	computationalArtifacts: ComputationalArtifact[];
	/** Optional only for legacy state; all newly created state includes this collection. */
	groundingReferences?: GroundingReferenceRecord[];
	researchCoordinatorReports: ResearchCoordinatorReportRecord[];
	researchFocus?: ResearchFocus;
	updatedAt: string;
}
