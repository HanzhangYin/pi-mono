/**
 * Mathematical obligation ledger for the co-math harness.
 *
 * An obligation is durable mathematical state — the claim, its assumptions, required subclaims,
 * support, refutation attempts, and gaps — kept separate from product copy. This module is the
 * single choke point through which completed plan tasks update that ledger: evidence attaches as
 * support only when it came from a real model-backed research step (a deterministic fallback run
 * records a gap instead of support, so degraded research can never silently look like progress),
 * refutation evidence flips the obligation to refuted, and the skeptic's verdict either records
 * gaps or a clean review. Establishment is never automatic here; it goes through the storage-level
 * gate, which a future verifier-backed evidence source can strengthen without changing shape.
 *
 * All functions are pure state transforms; callers persist.
 */

import { claimTargetsStatement, isSourceCommentaryClaim } from "./comath-text-similarity.ts";
import type {
	CoMathProjectState,
	ResearchEvidenceBoardEntry,
	ResearchObligationRecord,
	ResearchPlanTaskRecord,
} from "./schema.ts";
import { addResearchObligation, getRootResearchObligation, updateResearchObligation } from "./storage.ts";

export const DEGRADED_RESEARCH_GAP = "This step ran without model-backed research.";

export interface SkepticReviewOutcome {
	concerns: readonly string[];
	counterexampleFound: boolean;
}

export interface ApplyCompletedTaskToObligationsInput {
	task: ResearchPlanTaskRecord;
	reportId?: string;
	/** Whether the run that produced this task's report degraded to the deterministic fallback. */
	runUsedFallback: boolean;
	/** Whether a research model executor was available at all. */
	modelBacked: boolean;
	/** Evidence entries this task produced (specialist claims, skeptic findings, staged evidence). */
	newEvidenceEntryIds: readonly string[];
	/**
	 * Entries the independent review itself created. They never *support* the claim or spawn
	 * subclaims — a review's absence-of-refutation is not evidence for the statement — but a review
	 * counterexample still refutes.
	 */
	reviewEvidenceEntryIds?: readonly string[];
	skeptic?: SkepticReviewOutcome;
	now: string;
}

export interface ApplyConjectureRevisionToObligationsInput {
	task: ResearchPlanTaskRecord;
	/** Evidence entry of the statement that was revised away (the lineage parent). */
	parentEntryId?: string;
	/** Evidence entries of the revised statements, strongest defensible first. */
	revisedEntryIds: readonly string[];
	now: string;
}

/**
 * Fold one completed workstream-backed task into the obligation ledger. Ensures the root
 * obligation exists, then applies this task's evidence and review outcome to it.
 */
export function applyCompletedTaskToObligations(
	state: CoMathProjectState,
	input: ApplyCompletedTaskToObligationsInput,
): CoMathProjectState {
	const { state: withRoot, root } = ensureRootObligation(state, input.task, input.now);
	let nextState = withRoot;
	const entries = resolveEvidenceEntries(nextState, input.newEvidenceEntryIds);
	const degraded = !input.modelBacked || input.runUsedFallback;

	if (degraded) {
		// Degraded steps must be visibly degraded in durable state: no support, one honest gap.
		return updateResearchObligation(nextState, {
			obligationId: root.id,
			addGaps: [DEGRADED_RESEARCH_GAP],
			...(input.task.id ? { taskId: input.task.id } : {}),
			...(input.reportId ? { reportId: input.reportId } : {}),
			now: input.now,
			actor: "system",
		});
	}

	// Source commentary ("[source-5] claims a proof of ...") describes the literature, not the
	// mathematics, so it never supports, refutes, or spawns an obligation. Theorem-classified
	// entries additionally have to be *about* the root statement: a survey's report of a related
	// result (a different polynomial's infinitude, say) is evidence-board material, not support for
	// the root claim. The review's own entries are excluded from support and subclaims (they may
	// still refute): "an independent check found nothing wrong" is scrutiny, not evidence.
	const reviewEntryIds = new Set(input.reviewEvidenceEntryIds ?? []);
	const mathematical = entries.filter((entry) => !isSourceCommentaryClaim(entry.claim));
	const supporting = mathematical.filter(
		(entry) =>
			!reviewEntryIds.has(entry.id) &&
			(entry.classification === "computation" ||
				(entry.classification === "theorem" && claimTargetsStatement(entry.claim, root.statement))),
	);
	const refuting = mathematical.filter((entry) => entry.classification === "conflicting");
	const subclaims = mathematical.filter(
		(entry) =>
			!reviewEntryIds.has(entry.id) &&
			(entry.classification === "conjecture" || entry.classification === "heuristic"),
	);

	// Specialist-recorded conjectures become required subclaims of the root, deduplicated by
	// statement so a re-run does not multiply obligations. The root question itself is not a
	// subclaim of itself.
	for (const entry of subclaims) {
		if (statementsMatch(entry.claim, root.statement)) {
			continue;
		}
		const existing = nextState.researchObligations.find((obligation) =>
			statementsMatch(obligation.statement, entry.claim),
		);
		if (existing) {
			nextState = updateResearchObligation(nextState, {
				obligationId: existing.id,
				addEvidenceEntryIds: [entry.id],
				now: input.now,
				actor: "system",
			});
			continue;
		}
		nextState = addResearchObligation(nextState, {
			statement: entry.claim,
			parentObligationId: root.id,
			evidenceEntryIds: [entry.id],
			computationalArtifactIds: entry.computationalArtifactIds,
			status: "supported",
			taskId: input.task.id,
			...(input.reportId ? { reportId: input.reportId } : {}),
			now: input.now,
			actor: "system",
		});
	}

	const skepticClean =
		input.skeptic !== undefined && input.skeptic.concerns.length === 0 && !input.skeptic.counterexampleFound;
	const refuted = refuting.length > 0 || input.skeptic?.counterexampleFound === true;
	const current = nextState.researchObligations.find((obligation) => obligation.id === root.id) ?? root;
	const hasSupport = current.evidenceEntryIds.length > 0 || supporting.length > 0;
	nextState = updateResearchObligation(nextState, {
		obligationId: root.id,
		...(supporting.length > 0 ? { addEvidenceEntryIds: supporting.map((entry) => entry.id) } : {}),
		...(supporting.length > 0
			? { addComputationalArtifactIds: supporting.flatMap((entry) => entry.computationalArtifactIds) }
			: {}),
		...(refuting.length > 0 ? { addRefutationEvidenceEntryIds: refuting.map((entry) => entry.id) } : {}),
		...(input.skeptic && input.skeptic.concerns.length > 0 ? { addGaps: [...input.skeptic.concerns] } : {}),
		...(skepticClean ? { reviewedCleanAt: input.now } : {}),
		...(refuted
			? {
					status: "refuted",
					statusReason: refuting[0]?.claim ?? "An independent review found a counterexample to the statement.",
				}
			: current.status === "open" && hasSupport
				? { status: "supported" }
				: {}),
		taskId: input.task.id,
		...(input.reportId ? { reportId: input.reportId } : {}),
		now: input.now,
		actor: "system",
	});
	return nextState;
}

/**
 * Fold a completed conjecture revision into the ledger: the superseded root is retired (its
 * refutation history stays on record) and the strongest revised statement opens as the new root
 * obligation. Additional alternative revisions remain on the evidence board only.
 */
export function applyConjectureRevisionToObligations(
	state: CoMathProjectState,
	input: ApplyConjectureRevisionToObligationsInput,
): CoMathProjectState {
	const revisedEntry = resolveEvidenceEntries(state, input.revisedEntryIds)[0];
	if (!revisedEntry) {
		return state;
	}
	let nextState = state;
	const oldRoot = getRootResearchObligation(nextState);
	if (oldRoot && oldRoot.status !== "retired") {
		nextState = updateResearchObligation(nextState, {
			obligationId: oldRoot.id,
			status: "retired",
			statusReason: "Superseded by a revised statement.",
			taskId: input.task.id,
			now: input.now,
			actor: "system",
		});
	}
	return addResearchObligation(nextState, {
		statement: revisedEntry.claim,
		evidenceEntryIds: [revisedEntry.id],
		taskId: input.task.id,
		now: input.now,
		actor: "system",
	});
}

function ensureRootObligation(
	state: CoMathProjectState,
	task: ResearchPlanTaskRecord,
	now: string,
): { state: CoMathProjectState; root: ResearchObligationRecord } {
	const existing = getRootResearchObligation(state);
	if (existing) {
		return { state, root: existing };
	}
	const nextState = addResearchObligation(state, {
		statement: state.rootQuestion,
		taskId: task.id,
		now,
		actor: "system",
	});
	const root = getRootResearchObligation(nextState);
	if (!root) {
		throw new Error("Could not record the root research obligation.");
	}
	return { state: nextState, root };
}

function resolveEvidenceEntries(state: CoMathProjectState, entryIds: readonly string[]): ResearchEvidenceBoardEntry[] {
	const ids = new Set(entryIds);
	return state.researchEvidenceBoard.filter((entry) => ids.has(entry.id));
}

function statementsMatch(a: string, b: string): boolean {
	return a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
}
