/**
 * State-derived research agenda: the mechanism that turns completed work into better future work.
 *
 * Instead of restarting every plan from the same static blueprint, the agenda reads the durable
 * research records and derives what a disciplined mathematician would do next, in priority order:
 * repair a refuted statement, pursue a recorded pivot's replacement route, close reviewable gaps,
 * settle supported subclaims, and — when the literature could not settle the question — fall back
 * to direct mathematical evidence (computations and weaker provable statements). Every item
 * carries its provenance as the task goal, so the executing role knows why the task exists.
 *
 * Two guards apply to the agenda and to model-authored plans alike: a route already rejected by a
 * theorem applicability check is never planned again, and a task title that already ran is never
 * repeated. The agenda is deterministic (no LLM) so continuation works identically with or
 * without a model and is directly testable.
 */

import { DEGRADED_RESEARCH_GAP } from "./comath-research-obligations.ts";
import type {
	CoMathProjectState,
	ResearchObligationRecord,
	ResearchPlanTaskKind,
	ResearchTaskProgressKind,
} from "./schema.ts";
import { getRootResearchObligation } from "./storage.ts";

/** Evidence classifications that constitute mathematical content rather than context. */
const MATHEMATICAL_EVIDENCE = new Set(["theorem", "computation", "conjecture", "heuristic", "conflicting"]);

const MAX_PIVOT_ITEMS = 2;
const MAX_GAP_ITEMS = 2;
const MAX_SUBCLAIM_ITEMS = 2;
const MAX_AGENDA_TEXT = 200;

export interface ResearchAgendaItem {
	kind: ResearchPlanTaskKind;
	title: string;
	description: string;
	/** Why durable state produced this item; becomes the task goal. */
	goal: string;
}

/**
 * Derive the continuation agenda from durable state. Empty for a fresh workspace (the static
 * blueprint applies there); non-empty once records exist that demand follow-up. Ordered by
 * priority; the caller caps and appends synthesis.
 */
export function deriveResearchAgenda(state: CoMathProjectState): ResearchAgendaItem[] {
	const items: ResearchAgendaItem[] = [
		...deriveRevisionItems(state),
		...derivePivotItems(state),
		...deriveGapItems(state),
		...deriveSubclaimItems(state),
		...deriveLiteratureFallbackItems(state),
	];
	const seen = new Set<string>();
	return items.filter((item) => {
		// Only the actionable text counts: a goal may cite a rejected route as history ("X was
		// abandoned because ..."), which is exactly the memory we want to keep.
		if (violatesRejectedRoute(state, `${item.title} ${item.description}`)) {
			return false;
		}
		if (taskAlreadyPlanned(state, item.title)) {
			return false;
		}
		const key = normalizeAgendaText(item.title);
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

/** Whether the agenda currently offers real work (something besides wrap-up tasks). */
export function hasRunnableResearchAgendaWork(state: CoMathProjectState): boolean {
	return deriveResearchAgenda(state).some((item) => item.kind !== "synthesis" && item.kind !== "export");
}

export interface ClassifyResearchTaskProgressInput {
	kind: ResearchPlanTaskKind;
	reportId?: string;
	evidenceEntryIds: readonly string[];
	computationalArtifactIds: readonly string[];
}

/**
 * Classify what a completed task actually produced. Mathematical content (evidence, computations,
 * claims, a repaired statement) outranks a recorded obstruction (a rejected theorem check or a
 * pivot — negative knowledge that steers later planning), which outranks status/context. The
 * answer to "did this step move the mathematics or only describe it?" becomes durable state.
 */
export function classifyResearchTaskProgress(
	state: CoMathProjectState,
	input: ClassifyResearchTaskProgressInput,
): ResearchTaskProgressKind {
	if (input.kind === "revise-conjecture") {
		return "mathematical";
	}
	if (input.computationalArtifactIds.length > 0) {
		return "mathematical";
	}
	const entryIds = new Set(input.evidenceEntryIds);
	const hasMathematicalEvidence = state.researchEvidenceBoard.some(
		(entry) => entryIds.has(entry.id) && MATHEMATICAL_EVIDENCE.has(entry.classification),
	);
	if (hasMathematicalEvidence) {
		return "mathematical";
	}
	if (input.reportId) {
		const reportId = input.reportId;
		const learnedObstruction =
			state.theoremApplicabilityChecks.some((check) => check.reportId === reportId) ||
			state.researchPivots.some((pivot) => pivot.reportId === reportId);
		if (learnedObstruction) {
			return "obstruction";
		}
	}
	return "status";
}

/**
 * True when the text names a theorem that a durable applicability check already rejected as a
 * direct route. Used to keep both the deterministic agenda and model-authored plan tasks from
 * re-planning an invalid route.
 */
export function violatesRejectedRoute(
	state: Pick<CoMathProjectState, "theoremApplicabilityChecks">,
	text: string,
): boolean {
	const normalizedText = normalizeAgendaText(text);
	return state.theoremApplicabilityChecks.some((check) => {
		if (check.status !== "rejected-as-direct-route") {
			return false;
		}
		const theorem = normalizeAgendaText(check.theorem);
		return theorem.length >= 6 && normalizedText.includes(theorem);
	});
}

/** A refuted statement with no repair scheduled yet comes first: everything else builds on it. */
function deriveRevisionItems(state: CoMathProjectState): ResearchAgendaItem[] {
	const root = getRootResearchObligation(state);
	if (!root || root.status !== "refuted") {
		return [];
	}
	const revisionHandled = state.researchPlanTasks.some(
		(task) =>
			task.kind === "revise-conjecture" &&
			(task.status === "pending" || task.status === "running" || task.updatedAt >= root.updatedAt),
	);
	if (revisionHandled) {
		return [];
	}
	return [
		{
			kind: "revise-conjecture",
			title: "Repair the refuted statement",
			description: "Propose a revised statement that keeps what the evidence supports and excludes what failed.",
			goal: `The statement "${truncateAgendaText(root.statement)}" was refuted${root.statusReason ? `: ${truncateAgendaText(root.statusReason)}` : "."} Later work needs a defensible target.`,
		},
	];
}

/** Recorded pivots whose replacement route has not been scheduled become concrete tasks. */
function derivePivotItems(state: CoMathProjectState): ResearchAgendaItem[] {
	const unconsumed = [...state.researchPivots]
		.reverse()
		.filter((pivot) => !routeAlreadyPursued(state, pivot.toRoute))
		.slice(0, MAX_PIVOT_ITEMS);
	return unconsumed.map((pivot) => ({
		kind: inferTaskKindForRoute(pivot.toRoute),
		title: `Pursue the replacement route: ${truncateAgendaText(pivot.toRoute, 90)}`,
		description: truncateAgendaText(pivot.toRoute),
		goal: `The route "${truncateAgendaText(pivot.fromRoute, 90)}" was abandoned (${truncateAgendaText(pivot.reason, 120)}); this is its recorded replacement.`,
	}));
}

/** Open, reviewable gaps on live obligations become gap-closing tasks. Degraded-run gaps are not closable by planning. */
function deriveGapItems(state: CoMathProjectState): ResearchAgendaItem[] {
	const items: ResearchAgendaItem[] = [];
	for (const obligation of liveObligations(state)) {
		for (const gap of obligation.gaps) {
			if (gap === DEGRADED_RESEARCH_GAP || items.length >= MAX_GAP_ITEMS) {
				continue;
			}
			items.push({
				kind: "proof-attempt",
				title: `Close a recorded gap: ${truncateAgendaText(gap, 90)}`,
				description: `Address the recorded gap: ${truncateAgendaText(gap)}`,
				goal: `An independent review left this gap on "${truncateAgendaText(obligation.statement, 120)}"; it blocks establishing the claim.`,
			});
		}
	}
	return items;
}

/** Supported subclaims that are not yet settled become focused proof attempts. */
function deriveSubclaimItems(state: CoMathProjectState): ResearchAgendaItem[] {
	const root = getRootResearchObligation(state);
	return state.researchObligations
		.filter(
			(obligation) =>
				obligation.parentObligationId !== undefined &&
				obligation.parentObligationId === root?.id &&
				obligation.status === "supported",
		)
		.slice(0, MAX_SUBCLAIM_ITEMS)
		.map((obligation) => ({
			kind: "proof-attempt" as const,
			title: `Settle the subclaim: ${truncateAgendaText(obligation.statement, 90)}`,
			description: `Prove or refute the recorded subclaim: ${truncateAgendaText(obligation.statement)}`,
			goal: "The subclaim has supporting evidence but no settled status; the main claim cannot be established over an unsettled subclaim.",
		}));
}

/**
 * When a literature pass ran but the root claim still has no support, the next move is direct
 * mathematics, not more literature: computations for evidence and a weaker provable statement.
 */
function deriveLiteratureFallbackItems(state: CoMathProjectState): ResearchAgendaItem[] {
	const literatureRan = state.researchPlanTasks.some(
		(task) => task.kind === "literature-search" && task.status === "completed",
	);
	if (!literatureRan) {
		return [];
	}
	const root = getRootResearchObligation(state);
	const rootUnsettled = !root || root.status === "open";
	if (!rootUnsettled) {
		return [];
	}
	const goal =
		"The literature pass did not settle the question, so progress must come from direct mathematical evidence instead of more searching.";
	return [
		{
			kind: "computation",
			title: "Build direct evidence with bounded computations",
			description: `Run small-case and obstruction computations that support, refute, or sharpen: ${truncateAgendaText(state.rootQuestion, 120)}`,
			goal,
		},
		{
			kind: "proof-attempt",
			title: "Prove a weaker or special-case statement",
			description: `Identify and prove a weaker, conditional, or special-case version of: ${truncateAgendaText(state.rootQuestion, 120)}`,
			goal,
		},
	];
}

/** Route kind inference from the replacement-route text; computation beats literature beats proof. */
export function inferTaskKindForRoute(route: string): ResearchPlanTaskKind {
	const normalized = route.toLowerCase();
	if (/\b(?:comput|numeric|enumerat|residue|obstruction|example|anchor|small case|search)\w*/.test(normalized)) {
		return "computation";
	}
	if (/\b(?:cite|citation|reference|literature|source|survey|open-status|bibliograph)\w*/.test(normalized)) {
		return "literature-search";
	}
	if (/\b(?:counterexample|disprove|falsify|refute)\w*/.test(normalized)) {
		return "refutation-attempt";
	}
	return "proof-attempt";
}

function liveObligations(state: CoMathProjectState): ResearchObligationRecord[] {
	return state.researchObligations.filter(
		(obligation) => obligation.status !== "refuted" && obligation.status !== "retired",
	);
}

function routeAlreadyPursued(state: CoMathProjectState, route: string): boolean {
	const normalizedRoute = normalizeAgendaText(truncateAgendaText(route, 90));
	if (normalizedRoute.length === 0) {
		return true;
	}
	return state.researchPlanTasks.some((task) =>
		normalizeAgendaText(`${task.title} ${task.description} ${task.goal ?? ""}`).includes(normalizedRoute),
	);
}

function taskAlreadyPlanned(state: CoMathProjectState, title: string): boolean {
	const normalizedTitle = normalizeAgendaText(title);
	return state.researchPlanTasks.some(
		(task) =>
			normalizeAgendaText(task.title) === normalizedTitle &&
			(task.status === "pending" || task.status === "running" || task.status === "completed"),
	);
}

function normalizeAgendaText(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function truncateAgendaText(text: string, maxLength: number = MAX_AGENDA_TEXT): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) {
		return normalized;
	}
	return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

/** Agenda lines for the director prompt: each with its durable-state provenance. */
export function describeAgendaProvenance(items: readonly ResearchAgendaItem[]): string[] {
	return items.map((item) => `- (${item.kind}) ${item.title} — ${item.goal}`);
}
