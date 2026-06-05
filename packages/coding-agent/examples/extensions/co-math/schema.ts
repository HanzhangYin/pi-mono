export type GoalStatus = "active" | "completed" | "deferred";
export type ClaimStatus = "draft" | "proof_sketch" | "needs_review" | "proved" | "disproved";
export type EvidenceKind = "proof" | "computation" | "reference" | "counterexample" | "note";
export type WarningSeverity = "low" | "medium" | "high";
export type WarningStatus = "open" | "resolved";

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
	updatedAt: string;
}
