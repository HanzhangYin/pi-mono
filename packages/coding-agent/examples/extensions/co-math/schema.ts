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
export type MarginNoteKind = "gap" | "todo" | "warning" | "provenance" | "comment";
export type MarginNoteStatus = "open" | "resolved";
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
	| "working_paper_exported";
export type ArtifactKind =
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
	updatedAt: string;
}
