import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type {
	Claim,
	ClaimStatus,
	CoMathProjectState,
	Evidence,
	EvidenceKind,
	Report,
	ReviewQueueItem,
	Warning,
	WarningSeverity,
	Workstream,
} from "./schema.ts";

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
}

export interface AddWorkstreamInput {
	id: string;
	title: string;
	goalIds: string[];
	now: string;
}

export interface AddClaimInput {
	id: string;
	workstreamId: string;
	statement: string;
	status: ClaimStatus;
	now: string;
}

export interface AddEvidenceInput {
	id: string;
	claimId: string;
	kind: EvidenceKind;
	summary: string;
	now: string;
}

export interface AddWarningInput {
	id: string;
	claimId: string;
	severity: WarningSeverity;
	message: string;
	now: string;
}

export interface AddReportInput {
	id: string;
	title: string;
	summary: string;
	blockers?: string[];
	now: string;
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
}

export interface ResolveWarningInput {
	warningId: string;
	now: string;
}

export interface SetClaimStatusInput {
	claimId: string;
	status: ClaimStatus;
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
		updatedAt: input.now,
	};
}

export function addGoal(state: CoMathProjectState, input: AddGoalInput): CoMathProjectState {
	return {
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
	};
}

export function addWorkstream(state: CoMathProjectState, input: AddWorkstreamInput): CoMathProjectState {
	const duplicate = state.workstreams.find((workstream) => workstream.id === input.id);
	if (duplicate) {
		throw new Error(`Duplicate workstream id: ${input.id}`);
	}

	const workstream: Workstream = {
		id: input.id,
		title: input.title,
		goalIds: input.goalIds,
		claimIds: [],
		latestReportIds: [],
		createdAt: input.now,
		updatedAt: input.now,
	};

	return {
		...state,
		workstreams: [...state.workstreams, workstream],
		updatedAt: input.now,
	};
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

	return {
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
	};
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

	return {
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
	};
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

	return {
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
	};
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

	return {
		...state,
		reports: [...state.reports, report],
		updatedAt: input.now,
	};
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

	return {
		...state,
		reviewQueue: [...state.reviewQueue, item],
		updatedAt: input.now,
	};
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
	return {
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
	};
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

	return {
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
	};
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
		return JSON.parse(await readFile(statePath, "utf8")) as CoMathProjectState;
	} catch (error) {
		if (isMissingFileError(error)) {
			return undefined;
		}
		throw error;
	}
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
