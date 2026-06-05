export type GoalStatus = "active" | "completed" | "deferred";
export type ClaimStatus = "draft" | "proof_sketch" | "needs_review" | "proved" | "disproved";
export type EvidenceKind = "proof" | "computation" | "reference" | "counterexample" | "note";
export type WarningSeverity = "low" | "medium" | "high";
export type WarningStatus = "open" | "resolved";
export type CoMathActor = "human" | "system" | "coordinator" | "workstream" | "reviewer" | "synthesizer";
export type CoMathEventKind =
	| "project_initialized"
	| "goal_added"
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
	| "artifact_recorded";
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
	| "human_note";

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
	goalIds: string[];
	claimIds: string[];
	latestReportIds: string[];
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
	updatedAt: string;
}
