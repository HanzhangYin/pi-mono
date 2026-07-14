/**
 * Research-discipline conventions for the co-math harness.
 *
 * A disciplined mathematical researcher does three things this module makes durable:
 * checks a theorem's hypotheses against the actual object before building on it, records a pivot
 * when an intended route fails, and respects standing constraints ("do not attack arbitrary
 * Schubert multiplication"). Model roles are asked to express the first two through small
 * structured markdown sections (`## Theorem check`, `## Route change`) rather than free prose,
 * and this module is the single parser for those sections — a fix to the convention applies to
 * the specialist, synthesizer, and skeptic at once. Parsing is conservative: a malformed section
 * yields no record, never a guessed one.
 */

import { getCoMathMarkdownSectionItems, parseCoMathMarkdown, stripCoMathBulletMarker } from "./comath-markdown.ts";
import { normalizeTheoremKey } from "./comath-text-similarity.ts";
import type {
	CoMathProjectState,
	ResearchConstraintRecord,
	ResearchPlanTaskKind,
	TheoremApplicabilityCheckRecord,
	TheoremApplicabilityStatus,
	TheoremHypothesisCheck,
	TheoremHypothesisStatus,
} from "./schema.ts";
import { getCurrentTheoremApplicabilityChecks } from "./storage.ts";

const MAX_THEOREM_CHECKS_PER_TEXT = 3;
const MAX_PIVOTS_PER_TEXT = 3;
const MAX_NEGATIVE_CONSTRAINTS_PER_TEXT = 3;
const MAX_FIELD_LENGTH = 300;
const MAX_CONTEXT_RECORDS = 6;

/** Suggested next moves this vague are replaced by a recorded pivot's replacement route. */
const VAGUE_NEXT_MOVE =
	/ask (?:the )?coordinator|review this attempt|choose (?:a|the) (?:next )?(?:path|move|step)|what should we try next/i;

/**
 * Openings that mark a verdict or assessment rather than a route. Models sometimes put their
 * judgment of the failed route in the `To:` field ("gives related evidence only, not infinitude
 * of ..."); such text must never become a pivot destination, because the agenda would turn it into
 * a nonsense task ("Pursue the replacement route: gives related evidence only ...").
 */
const NON_ROUTE_TEXT =
	/^(?:gives?|is|are|was|were|does|do|did|cannot|can ?not|can't|could not|provides?|offers?|remains?|seems?|appears?|has|have|had|will|would|should|may|might|lacks?|shows?|yields?|only|not|no|none|nothing|unclear|unknown)\b/i;

/**
 * Whether text can serve as a route to pursue: an approach, method, or concrete move — not a
 * verdict about the abandoned route. Conservative like the section parsers: a rejected destination
 * drops the record rather than guessing one.
 */
export function isActionableRouteText(text: string): boolean {
	const normalized = text.replace(/\s+/g, " ").trim();
	return normalized.length >= 8 && !NON_ROUTE_TEXT.test(normalized);
}

export interface TheoremApplicabilityCheckDraft {
	theorem: string;
	targetObject: string;
	hypotheses: TheoremHypothesisCheck[];
	status: TheoremApplicabilityStatus;
	consequence?: string;
}

export interface ResearchPivotDraft {
	fromRoute: string;
	toRoute: string;
	reason: string;
}

/**
 * Parse `## Theorem check` sections. Convention (one bullet per line, `Theorem:` starts a new
 * check):
 *
 *   - Theorem: Spink-Tewari well-aligned rule
 *   - Object: the pair from the root question
 *   - Hypothesis: pair is well-aligned - satisfied
 *   - Hypothesis: ascent condition holds - failed; fails at position 3
 *   - Status: rejected-as-direct-route
 *   - Consequence: pivot to the Grassmannian/Pieri route
 */
export function parseTheoremApplicabilityChecks(text: string): TheoremApplicabilityCheckDraft[] {
	const items = collectDisciplineItems(text, "theorem-check");
	const drafts: TheoremApplicabilityCheckDraft[] = [];
	let current: TheoremApplicabilityCheckDraft | undefined;
	for (const item of items) {
		const field = parseFieldLine(item);
		if (!field) {
			continue;
		}
		if (field.key === "theorem") {
			if (current?.theorem) {
				drafts.push(current);
			}
			current = {
				theorem: truncateField(field.value),
				targetObject: "the current object",
				hypotheses: [],
				status: "needs-verification",
			};
			continue;
		}
		if (!current) {
			continue;
		}
		if (field.key === "object" || field.key === "current object") {
			current.targetObject = truncateField(field.value);
		} else if (field.key === "hypothesis" || field.key === "required hypothesis") {
			const hypothesis = parseHypothesis(field.value);
			if (hypothesis) {
				current.hypotheses.push(hypothesis);
			}
		} else if (field.key === "status") {
			current.status = normalizeApplicabilityStatus(field.value);
		} else if (field.key === "consequence") {
			current.consequence = truncateField(field.value);
		}
	}
	if (current?.theorem) {
		drafts.push(current);
	}
	return drafts.filter((draft) => draft.theorem.length > 0).slice(0, MAX_THEOREM_CHECKS_PER_TEXT);
}

/**
 * Parse `## Route change` sections (`From:` starts a new pivot):
 *
 *   - From: direct well-aligned rule application
 *   - To: Grassmannian special factor plus Pieri
 *   - Reason: the ascent hypothesis fails for the pair
 */
export function parseRoutePivots(text: string): ResearchPivotDraft[] {
	const items = collectDisciplineItems(text, "route-change");
	const drafts: ResearchPivotDraft[] = [];
	let current: Partial<ResearchPivotDraft> | undefined;
	for (const item of items) {
		const field = parseFieldLine(item);
		if (!field) {
			continue;
		}
		if (field.key === "from") {
			if (current?.fromRoute && current.toRoute) {
				drafts.push(finishPivot(current));
			}
			current = { fromRoute: truncateField(field.value) };
			continue;
		}
		if (!current) {
			continue;
		}
		if (field.key === "to") {
			current.toRoute = truncateField(field.value);
		} else if (field.key === "reason" || field.key === "why") {
			current.reason = truncateField(field.value);
		}
	}
	if (current?.fromRoute && current.toRoute) {
		drafts.push(finishPivot(current));
	}
	return drafts
		.filter((draft) => draft.fromRoute.length > 0 && isActionableRouteText(draft.toRoute))
		.slice(0, MAX_PIVOTS_PER_TEXT);
}

/**
 * Parse `## Negative constraints` sections: standing rules a review or literature check derived,
 * e.g. "Do not cite multivariable polynomial-prime theorems as proving n^2 + 1." Each bullet is
 * one constraint; short or non-imperative lines are dropped rather than guessed.
 */
export function parseNegativeConstraints(text: string): string[] {
	const items = collectDisciplineItems(text, "negative-constraints");
	return items
		.map((item) => truncateField(item))
		.filter(
			(item) =>
				item.length >= 12 &&
				/^(?:do not|don't|never|avoid|treat|only|require|separate|distinguish|use)\b/i.test(item),
		)
		.slice(0, MAX_NEGATIVE_CONSTRAINTS_PER_TEXT);
}

// Help requests only a human can satisfy: external access, materials, or a judgment call.
const EXTERNAL_HELP =
	/\b(?:access|paywall|subscription|licen[cs]e|upload|attach|provide|send|share|permission|credential|account|choose|decide|decision|prefer|judgment|judgement|confirm|clarif|approve)\w*/i;
const TRIVIAL_HELP = /^\(?(?:none|n\/a|nothing|no(?:ne)? (?:needed|required|at this time))\)?\.?$/i;

export interface SplitHumanHelpItems {
	/** Genuinely needs the user: external access, provided materials, or a judgment call. */
	external: string[];
	/** The agent can act on these itself; they become recorded gaps that drive later tasks. */
	agentActionable: string[];
}

/**
 * Partition "human help" suggestions: only requests that genuinely need the user (access,
 * materials, judgment) surface as human help; everything the agent could do itself (check,
 * compute, prove, search) is folded into the report's gaps so planning acts on it instead of
 * asking. Trivial placeholders ("none") are dropped.
 */
export function splitHumanHelpItems(items: readonly string[]): SplitHumanHelpItems {
	const external: string[] = [];
	const agentActionable: string[] = [];
	for (const raw of items) {
		const item = raw.replace(/\s+/g, " ").trim();
		if (item.length === 0 || TRIVIAL_HELP.test(item)) {
			continue;
		}
		if (EXTERNAL_HELP.test(item)) {
			external.push(item);
		} else {
			agentActionable.push(item);
		}
	}
	return { external, agentActionable };
}

/**
 * Keep the first check per theorem when several roles repeat the same one, comparing canonical
 * theorem names so "Friedlander–Iwaniec theorem (X^2 + Y^4)" and "Friedlander–Iwaniec as reported
 * in [source-2]" count as the same check.
 */
export function dedupeTheoremChecks(
	drafts: readonly TheoremApplicabilityCheckDraft[],
): TheoremApplicabilityCheckDraft[] {
	const seen = new Set<string>();
	return drafts.filter((draft) => {
		const key = normalizeTheoremKey(draft.theorem) || draft.theorem.toLowerCase();
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

/** Keep the first pivot per from/to pair when several roles repeat the same one. */
export function dedupeRoutePivots(drafts: readonly ResearchPivotDraft[]): ResearchPivotDraft[] {
	const seen = new Set<string>();
	return drafts.filter((draft) => {
		const key = `${draft.fromRoute.toLowerCase()}::${draft.toRoute.toLowerCase()}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

/**
 * Prompt lines teaching a role the structured sections. Shared by the specialist, synthesizer,
 * and skeptic prompts so the convention never drifts between roles.
 */
export function buildDisciplineGuidance(): string[] {
	return [
		"Before building on a named theorem, check its applicability against the actual object. When you rely on or reject a theorem, add a `## Theorem check` section with bullets:",
		"- Theorem: <name>",
		"- Object: <what it is applied to>",
		"- Hypothesis: <required hypothesis> - satisfied|failed|unknown; <where it fails, if it does>",
		"- Status: applies | rejected-as-direct-route | needs-verification",
		"- Consequence: <what follows, e.g. the replacement route after a rejection>",
		"When you abandon an intended route for a replacement, add a `## Route change` section with bullets:",
		"- From: <the route that failed or was rejected>",
		"- To: <the replacement route to pursue — an approach or move, never a verdict about the old route>",
		"- Reason: <why the change was needed>",
		'When your review reveals a standing rule future steps must respect (e.g. "Do not cite multivariable polynomial-prime theorems as proving the one-variable statement."), add a `## Negative constraints` section with one imperative bullet per rule. Only durable rules, not one-off remarks.',
		'In `## Next`, name a concrete replacement route with actionable items (references to find, computations to run, weaker statements to prove) — never just "ask the coordinator" or "review this attempt".',
	];
}

// Section labels and label-only lines that must never survive as next-move text.
const NEXT_MOVE_LABEL_PREFIX =
	/^(?:possible\s+)?(?:next|future)\s+(?:steps?|investigations?|directions?|moves?|work)\s*[:\-–—]\s*/i;
const NEXT_MOVE_SECTION_FRAGMENT =
	/^(?:route\s+change|concrete\s+replacement\s+route|replacement\s+route|theorem\s+check|negative\s+constraints?|pivot|from|to|reason)\b\s*[:\-–—]?\s*$/i;
const NEXT_MOVE_EMBEDDED_ROUTE_CHANGE = /\broute\s+change\b[\s:]*\bfrom\b/i;

/**
 * Normalize one candidate next-move line: strip markdown and heading labels, drop section
 * fragments the discipline parser owns ("Route change From ..."), and reject dangling fragments
 * that end mid-thought ("... marking separately:"). Returns "" when nothing executable survives.
 * This is the single normalizer for every workstream's `## Next` handling, so the hygiene rules
 * cannot drift between the generic, literature, and computation paths.
 */
export function normalizeSuggestedNextMoveItem(item: string): string {
	let text = stripCoMathBulletMarker(item)
		.replace(/\*\*|__|`/g, "")
		.replace(/^#+\s*/, "")
		.replace(/\s+/g, " ")
		.trim();
	text = text
		.replace(NEXT_MOVE_LABEL_PREFIX, "")
		.replace(/^next\s*:\s*/i, "")
		.trim();
	if (text.length === 0 || NEXT_MOVE_SECTION_FRAGMENT.test(text)) {
		return "";
	}
	// A short "Some label:" line is a heading, not a move.
	if (/^[-\w\s]+:$/.test(text) && text.split(/\s+/).length <= 6) {
		return "";
	}
	// Structured route-change content belongs to the pivot parser; leaking it here would persist
	// fragments like "Route change From literature search to ..." as the plan's next move.
	if (NEXT_MOVE_EMBEDDED_ROUTE_CHANGE.test(text)) {
		return "";
	}
	// A dangling fragment ends mid-thought; keep the complete sentences before it, if any.
	if (/[:;,]$/.test(text)) {
		const completeSentences = text.replace(/[^.!?]*$/, "").trim();
		text = completeSentences;
	}
	return text.length >= 8 ? text : "";
}

/**
 * First usable next move from prioritized candidate lists (typically synthesizer first, then
 * specialist). Items are normalized via {@link normalizeSuggestedNextMoveItem}; up to three
 * surviving items join into one move.
 */
export function pickSuggestedNextMove(...candidates: readonly (readonly string[])[]): string | undefined {
	for (const candidate of candidates) {
		const items = candidate.map(normalizeSuggestedNextMoveItem).filter((item) => item.length > 0);
		if (items.length > 0) {
			return items.slice(0, 3).join(" ");
		}
	}
	return undefined;
}

/**
 * Make a suggested next move concrete after a rejected route: the raw suggestion is normalized
 * first, and when it is vague, malformed, or empty and a pivot (or a rejected theorem check with a
 * consequence) was recorded, the replacement route becomes the next move.
 */
export function applyPivotsToSuggestedNextMove(
	suggestedNextMove: string | undefined,
	pivots: readonly ResearchPivotDraft[],
	checks: readonly TheoremApplicabilityCheckDraft[],
): string | undefined {
	const cleaned = suggestedNextMove ? normalizeSuggestedNextMoveItem(suggestedNextMove) : "";
	const replacement =
		[...pivots].reverse().find((pivot) => isActionableRouteText(pivot.toRoute))?.toRoute ??
		[...checks]
			.reverse()
			.find(
				(check) =>
					check.status === "rejected-as-direct-route" &&
					check.consequence !== undefined &&
					isActionableRouteText(check.consequence),
			)?.consequence;
	if (!replacement) {
		return cleaned || undefined;
	}
	if (!cleaned || VAGUE_NEXT_MOVE.test(cleaned)) {
		return `Pursue the replacement route: ${replacement}.`;
	}
	return cleaned;
}

/**
 * Durable-state sections shared by the director, skeptic, and coordinator prompts: standing
 * constraints, performed theorem checks, and route changes. One formatter so every role reads the
 * same view of the discipline records.
 */
export function formatDisciplineStateForContext(
	state: Pick<CoMathProjectState, "researchConstraints" | "theoremApplicabilityChecks" | "researchPivots">,
): string[] {
	const active = state.researchConstraints.filter((constraint) => constraint.status === "active");
	const checks = getCurrentTheoremApplicabilityChecks(state).slice(-MAX_CONTEXT_RECORDS);
	const pivots = state.researchPivots.slice(-MAX_CONTEXT_RECORDS);
	return [
		...(active.length > 0
			? [
					"",
					"Standing constraints (do not violate, do not re-attempt what they exclude):",
					...active.map((constraint) => `- [${constraint.kind}] ${constraint.text}`),
				]
			: []),
		...(checks.length > 0
			? [
					"",
					"Theorem applicability checks already performed (do not re-derive; respect rejections):",
					...checks.map((check) => formatTheoremCheckForContext(check)),
				]
			: []),
		...(pivots.length > 0
			? [
					"",
					"Route changes taken so far (do not silently retry an abandoned route):",
					...pivots.map((pivot) => `- From: ${pivot.fromRoute}; To: ${pivot.toRoute}; Reason: ${pivot.reason}`),
				]
			: []),
	];
}

function formatTheoremCheckForContext(check: TheoremApplicabilityCheckRecord): string {
	const failed = check.hypotheses.filter((hypothesis) => hypothesis.status === "failed");
	return [
		`- ${check.theorem} on ${check.targetObject}: ${check.status}`,
		...(failed.length > 0 ? [`fails: ${failed.map((hypothesis) => hypothesis.hypothesis).join("; ")}`] : []),
		...(check.consequence ? [`consequence: ${check.consequence}`] : []),
	].join("; ");
}

/**
 * Theorem-level tasks must produce mathematics, whatever the pinned path's wording says: state the
 * definitions and the precise claim, prove what can be proved, and leave computation as optional
 * support rather than the substance.
 */
export function buildProofTaskGuidance(taskKind: ResearchPlanTaskKind | undefined): string[] {
	if (taskKind !== "proof-attempt") {
		return [];
	}
	return [
		"This is a theorem-level task. Write the mathematics itself:",
		"- State the needed definitions and conventions precisely.",
		"- State the lemma or claim you are proving.",
		"- Give the proof, or an honest partial proof with the exact point of failure.",
		"- List the limitations and the next proof obligations.",
		"A bounded computation may support the argument, but must not replace it.",
	];
}

/** Prompt block listing standing constraints. Empty when there are none. */
export function buildStandingConstraintsBlock(constraints: readonly ResearchConstraintRecord[]): string[] {
	const active = constraints.filter((constraint) => constraint.status === "active");
	if (active.length === 0) {
		return [];
	}
	return [
		"Standing constraints (respect them; do not re-attempt what they exclude):",
		...active.map((constraint) => `- ${constraint.text}`),
	];
}

function parseFieldLine(item: string): { key: string; value: string } | undefined {
	const match = /^([A-Za-z][A-Za-z ]{0,24}):\s*(.+)$/.exec(item.trim());
	if (!match?.[1] || !match[2]) {
		return undefined;
	}
	return { key: match[1].trim().toLowerCase(), value: match[2].trim() };
}

type DisciplineBlock = "theorem-check" | "route-change" | "negative-constraints";

function collectDisciplineItems(text: string, block: DisciplineBlock): string[] {
	const parsed = parseCoMathMarkdown(text);
	const sectionItems =
		block === "theorem-check"
			? getCoMathMarkdownSectionItems(parsed, "theorem check")
			: block === "route-change"
				? [
						...getCoMathMarkdownSectionItems(parsed, "route change"),
						...getCoMathMarkdownSectionItems(parsed, "pivot"),
					]
				: getCoMathMarkdownSectionItems(parsed, "negative constraint");
	return sectionItems.length > 0 ? sectionItems : collectInlineDisciplineItems(text, block);
}

function collectInlineDisciplineItems(text: string, target: DisciplineBlock): string[] {
	const lines = prepareDisciplineLines(text);
	const items: string[] = [];
	let active: DisciplineBlock | undefined;
	for (const line of lines) {
		const label = parseDisciplineLabel(line);
		if (label) {
			active = label;
			continue;
		}
		if (!active) {
			active = inferDisciplineBlockFromField(line);
		}
		if (active !== target) {
			continue;
		}
		if (target === "theorem-check" && !isTheoremCheckField(line)) {
			continue;
		}
		if (target === "route-change" && !isRouteChangeField(line)) {
			continue;
		}
		if (line.length > 0) {
			items.push(line);
		}
	}
	return items;
}

function prepareDisciplineLines(text: string): string[] {
	const normalized = text
		.replace(/\*\*/g, "")
		.replace(/\b(Theorem check|Route change|Negative constraints?|Pivot):/gi, "\n$1:\n")
		.replace(/\b(Theorem|Object|Hypothesis|Status|Consequence|From|To|Reason):/g, "\n$1:");
	return normalized
		.split("\n")
		.map((line) => stripCoMathBulletMarker(line).trim())
		.filter((line) => line.length > 0);
}

function parseDisciplineLabel(line: string): DisciplineBlock | undefined {
	const normalized = line.trim().replace(/:$/, "").toLowerCase();
	if (normalized === "theorem check") {
		return "theorem-check";
	}
	if (normalized === "route change" || normalized === "pivot") {
		return "route-change";
	}
	if (normalized === "negative constraint" || normalized === "negative constraints") {
		return "negative-constraints";
	}
	return undefined;
}

function inferDisciplineBlockFromField(line: string): DisciplineBlock | undefined {
	if (isTheoremCheckField(line)) {
		return "theorem-check";
	}
	if (isRouteChangeField(line)) {
		return "route-change";
	}
	return undefined;
}

function isTheoremCheckField(line: string): boolean {
	const field = parseFieldLine(line);
	return (
		field !== undefined &&
		(field.key === "theorem" ||
			field.key === "object" ||
			field.key === "current object" ||
			field.key === "hypothesis" ||
			field.key === "required hypothesis" ||
			field.key === "status" ||
			field.key === "consequence")
	);
}

function isRouteChangeField(line: string): boolean {
	const field = parseFieldLine(line);
	return (
		field !== undefined &&
		(field.key === "from" || field.key === "to" || field.key === "reason" || field.key === "why")
	);
}

/** `<hypothesis text> - satisfied|failed|unknown[; note]`; a missing verdict reads as unknown. */
function parseHypothesis(value: string): TheoremHypothesisCheck | undefined {
	const match = /^(.*?)\s*[—–-]{1,2}\s*(satisfied|failed|unknown|holds|fails)\b[\s;:,.]*(.*)$/i.exec(value);
	if (match?.[1]) {
		const note = match[3]?.trim();
		return {
			hypothesis: truncateField(match[1]),
			status: normalizeHypothesisStatus(match[2] ?? ""),
			...(note ? { note: truncateField(note) } : {}),
		};
	}
	const hypothesis = truncateField(value);
	return hypothesis ? { hypothesis, status: "unknown" } : undefined;
}

function normalizeHypothesisStatus(value: string): TheoremHypothesisStatus {
	const normalized = value.trim().toLowerCase();
	if (normalized === "satisfied" || normalized === "holds") {
		return "satisfied";
	}
	if (normalized === "failed" || normalized === "fails") {
		return "failed";
	}
	return "unknown";
}

function normalizeApplicabilityStatus(value: string): TheoremApplicabilityStatus {
	const normalized = value.trim().toLowerCase();
	if (/^applies\b|^holds\b|^applicable\b/.test(normalized)) {
		return "applies";
	}
	if (/reject|does not apply|not applicable|fails/.test(normalized)) {
		return "rejected-as-direct-route";
	}
	return "needs-verification";
}

function finishPivot(current: Partial<ResearchPivotDraft>): ResearchPivotDraft {
	return {
		fromRoute: current.fromRoute ?? "",
		toRoute: current.toRoute ?? "",
		reason: current.reason ?? "The earlier route did not work as intended.",
	};
}

function truncateField(text: string): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= MAX_FIELD_LENGTH) {
		return normalized;
	}
	return `${normalized.slice(0, MAX_FIELD_LENGTH - 3).trimEnd()}...`;
}
