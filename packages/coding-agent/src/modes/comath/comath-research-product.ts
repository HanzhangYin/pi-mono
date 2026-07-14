/**
 * Deterministic "state of the problem" document for the co-math research workspace.
 *
 * The research run scatters its mathematics across per-run reports, evidence-board entries, margin
 * notes, working-paper sections, and coordinator summaries; this module assembles the one canonical
 * answer to "what do we actually know about this problem" purely from durable state. It is a pure
 * fold — no I/O, no model calls, same state in, same document out — and it is deliberately
 * conservative: proved facts require source support or a passed theorem check, finite computation
 * is always labeled as evidence rather than proof, and an open root question always reads as open.
 *
 * Traceability is by content, never by internal record ids: claims keep their embedded
 * `[source-N]` markers (those labels are the durable literature-source ids, assigned in the order
 * sources were recorded), and the "Sources consulted" list carries the same labels so every marker
 * resolves to a titled source.
 */

import { significantContentTokens } from "./comath-text-similarity.ts";
import type { CoMathProjectState, LiteratureSourceArtifact, ResearchEvidenceBoardEntry } from "./schema.ts";
import {
	describeObligationEstablishmentGate,
	getCurrentTheoremApplicabilityChecks,
	getRootResearchObligation,
} from "./storage.ts";

/** Working-paper section title under which the document is persisted and exported. */
export const STATE_OF_PROBLEM_SECTION_TITLE = "State of the problem";

/** Every list in the document stays readable: at most this many items, most recent kept. */
const MAX_SECTION_ITEMS = 8;
/** At most this many "unsupported" evidence entries join the open-gaps section. */
const MAX_UNSUPPORTED_GAP_ITEMS = 5;
/** Label-like fragments below this many significant tokens never count as a substantive gap. */
const MIN_SUBSTANTIVE_GAP_TOKENS = 5;

/** Claim prefix the independent review writes when its bounded check found no counterexample. */
const INDEPENDENT_CHECK_CONFIRMED = /^An independent bounded check did not find a counterexample/i;
/** Claim prefix the independent review writes when its bounded check did not complete. */
const INDEPENDENT_CHECK_INCONCLUSIVE = /^An independent bounded check was inconclusive/i;
/** Any independent-check claim, used to keep check records from double-listing as computations. */
const INDEPENDENT_CHECK_ANY = /^An independent bounded check\b/i;

/** The full chat-facing document: title line plus the section body. */
export function buildStateOfProblemDocument(state: CoMathProjectState): string {
	return [STATE_OF_PROBLEM_SECTION_TITLE, "", buildStateOfProblemSectionBody(state)].join("\n");
}

/** The document without its title line, used as the working-paper section body. */
export function buildStateOfProblemSectionBody(state: CoMathProjectState): string {
	return [
		"The question",
		state.rootQuestion.trim() || state.title.trim() || "(no question recorded)",
		describeRootQuestionVerdict(state),
		"",
		"Established facts",
		...buildEstablishedFactLines(state),
		"",
		"Computational evidence",
		...buildComputationalEvidenceLines(state),
		"",
		"Conditional results and heuristics",
		...buildConditionalLines(state),
		"",
		"Refuted or conflicting",
		...buildRefutedLines(state),
		"",
		"Open gaps",
		...buildOpenGapLines(state),
		"",
		"Sources consulted",
		...buildSourceLines(state),
	].join("\n");
}

/**
 * One-line verdict on the root question, derived from the root obligation. "Established" is the
 * storage-level gate (support, no gaps, settled subclaims, clean independent review) and is the
 * only status allowed to read as answered positively; "refuted" reads as answered negatively with
 * its refutation basis; everything else — including "supported" — remains open, with an honest
 * statement of the strongest support on record.
 */
export function describeRootQuestionVerdict(state: CoMathProjectState): string {
	const root = getRootResearchObligation(state);
	if (root?.status === "refuted") {
		const basis =
			root.statusReason ??
			resolveEvidenceEntries(state, root.refutationEvidenceEntryIds)[0]?.claim ??
			"A counterexample stands against it.";
		return `Verdict: answered negatively — the statement as written is refuted. ${basis}`;
	}
	if (root?.status === "established" && describeObligationEstablishmentGate(state, root.id).ok) {
		return "Verdict: answered — the statement is established: its support passed an independent review with no open gaps and all required subclaims settled.";
	}
	return `Verdict: the question remains open. ${describeStrongestOpenSupport(state)}`;
}

function describeStrongestOpenSupport(state: CoMathProjectState): string {
	if (selectEstablishedFacts(state).length > 0) {
		return "The strongest support so far is theorem-level and source-backed, but it does not settle the question.";
	}
	if (state.researchEvidenceBoard.some((entry) => entry.classification === "computation")) {
		return "The strongest support so far is computational only: bounded evidence, not proof.";
	}
	return "No durable mathematical support has been recorded yet.";
}

interface EstablishedFact {
	entry: ResearchEvidenceBoardEntry;
	/** Parenthetical provenance: the source labels the claim cites, or the passed theorem check. */
	provenance: string;
}

/**
 * Evidence entries that may appear as established facts: classified "theorem" AND either citing at
 * least one recorded literature source or matching a theorem applicability check that passed.
 * Theorem-classified entries without either backing are deliberately excluded — an unsupported
 * "theorem" claim is not a fact this document may assert.
 */
export function selectEstablishedFacts(state: CoMathProjectState): EstablishedFact[] {
	const facts: EstablishedFact[] = [];
	for (const entry of state.researchEvidenceBoard) {
		if (entry.classification !== "theorem" || isSupersededEntry(state, entry)) {
			continue;
		}
		if (entry.sourceIds.length > 0) {
			facts.push({ entry, provenance: `cites ${formatSourceLabels(state, entry.sourceIds)}` });
			continue;
		}
		const passedCheck = findPassedTheoremCheck(state, entry);
		if (passedCheck) {
			facts.push({ entry, provenance: `theorem check passed: ${passedCheck}` });
		}
	}
	return facts;
}

function buildEstablishedFactLines(state: CoMathProjectState): string[] {
	const facts = selectEstablishedFacts(state).slice(-MAX_SECTION_ITEMS);
	if (facts.length === 0) {
		return [
			"- None yet. No theorem-level statement on record carries source support or a passed theorem check, so nothing is presented as proved.",
		];
	}
	return facts.map((fact) => `- ${fact.entry.claim} (${fact.provenance})`);
}

function buildComputationalEvidenceLines(state: CoMathProjectState): string[] {
	const computations = state.researchEvidenceBoard.filter(
		(entry) => entry.classification === "computation" && !isSupersededEntry(state, entry),
	);
	if (computations.length === 0) {
		return ["- No computational evidence has been recorded yet."];
	}
	const primary = computations.filter((entry) => !INDEPENDENT_CHECK_ANY.test(entry.claim));
	const primaryReportIds = new Set(
		primary.map((entry) => entry.reportId).filter((id): id is string => id !== undefined),
	);
	// Confirmed independent checks attach to the computation they checked (same report); a check
	// with no computation alongside it stands as its own item — its claim already says what it did.
	const standaloneChecks = computations.filter(
		(entry) =>
			INDEPENDENT_CHECK_ANY.test(entry.claim) &&
			(entry.reportId === undefined || !primaryReportIds.has(entry.reportId)),
	);
	const lines = [
		...primary.map((entry) => `- ${entry.claim} — ${describeIndependentCheck(state, entry)}`),
		...standaloneChecks.map((entry) => `- ${entry.claim}`),
	].slice(-MAX_SECTION_ITEMS);
	return [
		...lines,
		"Finite computation is evidence, not proof: a bounded search cannot settle an unbounded statement.",
	];
}

/**
 * Whether an independent bounded check confirmed a computation, came back inconclusive, or never
 * ran — read from the review's own durable records: its evidence entries for the same report
 * (matching the exact claim phrasings the review writes), or its check records when the review's
 * entry was merged into the computation it checked (a restated claim folds in, keeping only the
 * check's computation links as its trace).
 */
function describeIndependentCheck(state: CoMathProjectState, entry: ResearchEvidenceBoardEntry): string {
	const linkedChecks = state.computationalArtifacts.filter(
		(record) =>
			entry.computationalArtifactIds.includes(record.id) && /independent counterexample check/i.test(record.title),
	);
	if (linkedChecks.some((record) => record.status === "completed")) {
		return "an independent bounded check found no counterexample in the searched range.";
	}
	const siblings = entry.reportId
		? state.researchEvidenceBoard.filter((candidate) => candidate.reportId === entry.reportId)
		: [];
	if (siblings.some((candidate) => INDEPENDENT_CHECK_CONFIRMED.test(candidate.claim))) {
		return "an independent bounded check found no counterexample in the searched range.";
	}
	if (siblings.some((candidate) => INDEPENDENT_CHECK_INCONCLUSIVE.test(candidate.claim)) || linkedChecks.length > 0) {
		return "an independent bounded check was attempted but was inconclusive.";
	}
	return "no independent check has been run on this result.";
}

function buildConditionalLines(state: CoMathProjectState): string[] {
	const conditional = state.researchEvidenceBoard
		.filter(
			(entry) =>
				(entry.classification === "conjecture" || entry.classification === "heuristic") &&
				!isSupersededEntry(state, entry),
		)
		.slice(-MAX_SECTION_ITEMS);
	if (conditional.length === 0) {
		return ["- No conditional results or heuristics are on record."];
	}
	return conditional.map(
		(entry) => `- ${entry.classification === "conjecture" ? "Conjecture" : "Heuristic"}: ${entry.claim}`,
	);
}

function buildRefutedLines(state: CoMathProjectState): string[] {
	const refutedObligations = state.researchObligations.filter((obligation) => obligation.status === "refuted");
	const conflicting = state.researchEvidenceBoard.filter((entry) => entry.classification === "conflicting");
	const lines = dedupeLines([
		...refutedObligations.map((obligation) => {
			const basis =
				obligation.statusReason ??
				resolveEvidenceEntries(state, obligation.refutationEvidenceEntryIds)[0]?.claim ??
				"Refutation evidence stands against it.";
			return `- Refuted: ${obligation.statement} — ${basis}`;
		}),
		...conflicting.map((entry) => `- Conflicting evidence: ${entry.claim}`),
	]).slice(-MAX_SECTION_ITEMS);
	if (lines.length === 0) {
		return ["- Nothing on record has been refuted."];
	}
	return lines;
}

function buildOpenGapLines(state: CoMathProjectState): string[] {
	const obligationGaps = state.researchObligations
		.filter((obligation) => obligation.status !== "retired")
		.flatMap((obligation) => obligation.gaps);
	const substantiveUnsupported = state.researchEvidenceBoard
		.filter(
			(entry) =>
				entry.classification === "unsupported" &&
				significantContentTokens(entry.claim).size >= MIN_SUBSTANTIVE_GAP_TOKENS,
		)
		.slice(-MAX_UNSUPPORTED_GAP_ITEMS)
		.map((entry) => entry.claim);
	const lines = dedupeLines([...obligationGaps, ...substantiveUnsupported].map((gap) => `- ${gap}`)).slice(
		0,
		MAX_SECTION_ITEMS,
	);
	if (lines.length === 0) {
		return ["- No open gaps have been recorded yet."];
	}
	return lines;
}

/**
 * Sources in their durable order, each carrying its own `[source-N]` label — the same label the
 * claims cite, since durable literature-source ids are assigned as `source-N` in recording order —
 * so the mapping survives even when the list is capped.
 */
function buildSourceLines(state: CoMathProjectState): string[] {
	const sources = selectProductSources(state);
	if (sources.length === 0) {
		return ["- No literature sources have been consulted yet."];
	}
	return sources.map((source) => {
		return `- [${source.id}] ${source.title} — ${describeSourceReliability(source)}`;
	});
}

/**
 * Keep every source cited by an established fact in the product, then fill the remaining bounded
 * source list with the most recently consulted sources. Provenance closure takes priority over the
 * normal section cap: a displayed fact must never point at a source omitted from the same product.
 */
function selectProductSources(state: CoMathProjectState): LiteratureSourceArtifact[] {
	const requiredIds = new Set(
		selectEstablishedFacts(state)
			.slice(-MAX_SECTION_ITEMS)
			.flatMap((fact) => fact.entry.sourceIds),
	);
	const required = state.literatureSources.filter((source) => requiredIds.has(source.id));
	const remaining = state.literatureSources
		.filter((source) => !requiredIds.has(source.id))
		.slice(-Math.max(0, MAX_SECTION_ITEMS - required.length));
	return [...required, ...remaining];
}

function describeSourceReliability(source: LiteratureSourceArtifact): string {
	if (looksLikePreprint(source)) {
		return "preprint; not peer-reviewed, treat with caution";
	}
	if (source.doi) {
		return `peer-reviewed venue (DOI ${source.doi})`;
	}
	return "provenance not verified";
}

function looksLikePreprint(source: LiteratureSourceArtifact): boolean {
	return (
		source.sourceType === "preprint" ||
		source.provider === "arxiv" ||
		(source.url !== undefined && /arxiv\.org/i.test(source.url))
	);
}

/** Human-readable label list for the sources a claim cites, with titles where they resolve. */
function formatSourceLabels(state: CoMathProjectState, sourceIds: readonly string[]): string {
	const sourceById = new Map(state.literatureSources.map((source) => [source.id, source]));
	return sourceIds
		.map((sourceId) => {
			const source = sourceById.get(sourceId);
			return source ? `${sourceId} (${source.title})` : sourceId;
		})
		.join(", ");
}

/** The passed applicability check backing a theorem entry, by report linkage or theorem name. */
function findPassedTheoremCheck(state: CoMathProjectState, entry: ResearchEvidenceBoardEntry): string | undefined {
	const matching = getCurrentTheoremApplicabilityChecks(state).filter((check) =>
		entry.claim.toLowerCase().includes(check.theorem.toLowerCase()),
	);
	const passed = matching.find((check) => check.status === "applies");
	return passed?.theorem;
}

/** An entry another entry revised away; it belongs to lineage history, not the current picture. */
function isSupersededEntry(state: CoMathProjectState, entry: ResearchEvidenceBoardEntry): boolean {
	return state.researchEvidenceBoard.some((candidate) => candidate.parentEntryId === entry.id);
}

function resolveEvidenceEntries(state: CoMathProjectState, entryIds: readonly string[]): ResearchEvidenceBoardEntry[] {
	const ids = new Set(entryIds);
	return state.researchEvidenceBoard.filter((entry) => ids.has(entry.id));
}

function dedupeLines(lines: readonly string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const line of lines) {
		const key = line.replace(/\s+/g, " ").trim().toLowerCase();
		if (key.length === 0 || seen.has(key)) {
			continue;
		}
		seen.add(key);
		result.push(line);
	}
	return result;
}
