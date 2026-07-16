import { textsNearlyMatch } from "./comath-text-similarity.ts";
import type { CoMathProjectState, ResearchWorkstreamReportRecord } from "./schema.ts";

export type LiteratureSearchTrigger =
	| "ungrounded-theorem"
	| "missing-source-support"
	| "referenced-prior-work"
	| "repeated-mathematical-obstruction"
	| "alternative-formulation"
	| "novelty-check";

export interface LiteratureSearchNeed {
	trigger: LiteratureSearchTrigger;
	title: string;
	description: string;
	rationale: string;
	query: string;
	pathId?: string;
}

const EXPLICIT_LITERATURE_PATTERN =
	/\b(?:literature|bibliograph(?:y|ic|ical)|arxiv|prior work|later work|known theorem|source search|search (?:for )?(?:a )?(?:source|reference)|citation search)\b/i;
const REFERENCED_PRIOR_WORK_PATTERN = /\b(?:cites?|cited|citation|references?|prior work|later work)\b/i;
const REJECTED_LITERATURE_ROUTE_PATTERN =
	/\b(?:failed|rejected|invalid|blocked|non[- ]retryable|not (?:presently )?valid|should not be repeated|do not repeat|without (?:a )?(?:changed|new) prerequisite)\b.*\b(?:literature|search|source|reference)|\b(?:literature|search|source|reference)\b.*\b(?:failed|rejected|invalid|blocked|non[- ]retryable|not (?:presently )?valid|should not be repeated|do not repeat|without (?:a )?(?:changed|new) prerequisite)\b/i;
const UNGROUNDED_THEOREM_PATTERN =
	/\b(?:ungrounded|unverified|needs? verification|standard (?:theorem|result) (?:without|lacking)|missing source support|source support (?:is )?(?:missing|required))\b/i;
const ALTERNATIVE_FORMULATION_PATTERN =
	/\b(?:alternative formulation|equivalent formulation|known special cases?|related theorems?|analog(?:ue|ous result)|classification theorem)\b/i;
const NOVELTY_PATTERN =
	/\b(?:novelty|prior art|current literature status|open status|known whether|has (?:this|it) been (?:proved|resolved|settled|published))\b/i;
const GENERATED_LITERATURE_DIRECTIVE_PATTERN =
	/^\s*(?:inspect relevant prior work:|search the external mathematical literature and arxiv for\b)/i;
const CRITIC_REPAIR_DIRECTIVE_PATTERN =
	/\bCRITIC-DRIVEN REPAIR\b|\bSOURCE ATTEMPT:\s*\S+|\bREPAIR FINDING:\s*\S+|\bTASK KIND:\s*(?:proof-attempt|refutation-attempt|computation|source-refresh)\b/i;
const INTERNAL_ARTIFACT_CITATION_PATTERN =
	/\b(?:cite|cites|cited|citation)\b[\s\S]{0,120}\b(?:artifact|outputs?|attempt|computation dependency|digest)\b|\b(?:task-owned|sandbox computation)\b[\s\S]{0,160}\b(?:artifact|outputs?|attempt|digest)\b/i;
const RESOLVED_LITERATURE_STATUS_PATTERN =
	/\b(?:inspected|reviewed|consulted|checked)\b[\s\S]{0,220}\b(?:does not|do not|did not|provides? no|states? no|establishes? no)\b[\s\S]{0,120}\b(?:theorem|statement|result|proof|certificate|source|evidence)\b/i;
const PERSISTED_SOURCE_REPAIR_PATTERN =
	/\b(?:source-\d+|persisted (?:local )?source|local source)\b.*\b(?:audit|completeness|extract(?:ion)?|keyword|locators?|occurrences?|transcrib\w*)\b|\b(?:audit|completeness|extract(?:ion)?|keyword|locators?|occurrences?|transcrib\w*)\b.*\b(?:source-\d+|persisted (?:local )?source|local source)\b/i;
const EXTERNAL_SOURCE_REPLACEMENT_PATTERN =
	/\b(?:alternate|alternative|different|external|native|other|publisher)\s+(?:copy|provider|source|version)\b|\bmetadata[- ]only\b|\b(?:corrupt(?:ed|ion)?|garbled|unreadable|truncated)\b/i;
const MAX_QUERY_LENGTH = 420;

/**
 * Decide whether external literature retrieval is the next justified research action.
 *
 * The policy intentionally ignores task-attempt failures and review revisions: those are harness
 * or evidence defects, not evidence that outside mathematics is needed. Every trigger below comes
 * from semantic durable state, and a matching active or successfully completed search suppresses
 * duplicate retrieval.
 */
export function deriveLiteratureSearchNeed(state: CoMathProjectState): LiteratureSearchNeed | undefined {
	if (state.researchPlanTasks.some((task) => task.kind === "literature-search" && task.status === "running")) {
		return undefined;
	}

	const theoremCheck = [...state.theoremApplicabilityChecks]
		.reverse()
		.find((check) => check.status === "needs-verification" && check.sourceIds.length === 0);
	if (theoremCheck) {
		return suppressCompletedSearch(state, {
			trigger: "ungrounded-theorem",
			title: `Verify the theorem dependency: ${truncate(theoremCheck.theorem, 90)}`,
			description: buildSearchDescription(
				`the exact statement and hypotheses of ${theoremCheck.theorem} as applied to ${theoremCheck.targetObject}`,
			),
			rationale:
				"A durable theorem-applicability check cannot be resolved without a citable statement and hypotheses.",
			query: `${theoremCheck.theorem} ${theoremCheck.targetObject}`,
			...(theoremCheck.pathId ? { pathId: theoremCheck.pathId } : {}),
		});
	}

	const unsupportedClaim = [...state.literatureClaimSupports]
		.reverse()
		.find(
			(support) =>
				(support.status === "unsupported" || support.status === "partially-supported") &&
				support.sourceIds.length === 0,
		);
	if (unsupportedClaim) {
		return suppressCompletedSearch(state, {
			trigger: "missing-source-support",
			title: `Find source support: ${truncate(unsupportedClaim.claim, 90)}`,
			description: buildSearchDescription(`a source that states or directly bears on: ${unsupportedClaim.claim}`),
			rationale: "Durable claim support is missing, so the claim cannot be used under the evidence policy.",
			query: unsupportedClaim.claim,
			...(unsupportedClaim.pathId ? { pathId: unsupportedClaim.pathId } : {}),
		});
	}

	const currentSignals = collectCurrentSignals(state).filter(
		(signal) =>
			!RESOLVED_LITERATURE_STATUS_PATTERN.test(signal.text) &&
			!CRITIC_REPAIR_DIRECTIVE_PATTERN.test(signal.text) &&
			!INTERNAL_ARTIFACT_CITATION_PATTERN.test(signal.text),
	);
	const ungroundedSignal = currentSignals.find((signal) => UNGROUNDED_THEOREM_PATTERN.test(signal.text));
	if (ungroundedSignal) {
		return suppressCompletedSearch(state, {
			trigger: "ungrounded-theorem",
			title: `Ground the current theorem dependency: ${truncate(ungroundedSignal.text, 78)}`,
			description: buildSearchDescription(ungroundedSignal.text),
			rationale:
				"The current mathematical trajectory explicitly records an unverified theorem or missing source dependency.",
			query: ungroundedSignal.text,
			...(ungroundedSignal.pathId ? { pathId: ungroundedSignal.pathId } : {}),
		});
	}

	const priorWorkSignal = currentSignals.find(
		(signal) =>
			!REJECTED_LITERATURE_ROUTE_PATTERN.test(signal.text) &&
			(EXPLICIT_LITERATURE_PATTERN.test(signal.text) || REFERENCED_PRIOR_WORK_PATTERN.test(signal.text)),
	);
	if (priorWorkSignal) {
		return suppressCompletedSearch(state, {
			trigger: "referenced-prior-work",
			title: `Inspect relevant prior work: ${truncate(priorWorkSignal.text, 82)}`,
			description: buildSearchDescription(priorWorkSignal.text),
			rationale: "The current path explicitly identifies prior work or a targeted literature lookup as relevant.",
			query: priorWorkSignal.text,
			...(priorWorkSignal.pathId ? { pathId: priorWorkSignal.pathId } : {}),
		});
	}

	const alternativeSignal = currentSignals.find((signal) => ALTERNATIVE_FORMULATION_PATTERN.test(signal.text));
	if (alternativeSignal) {
		return suppressCompletedSearch(state, {
			trigger: "alternative-formulation",
			title: `Find known alternatives or special cases: ${truncate(alternativeSignal.text, 72)}`,
			description: buildSearchDescription(alternativeSignal.text),
			rationale: "The coordinator needs known formulations or special cases before choosing another direct route.",
			query: alternativeSignal.text,
			...(alternativeSignal.pathId ? { pathId: alternativeSignal.pathId } : {}),
		});
	}

	const noveltySignal = [
		state.rootQuestion,
		state.researchFocus?.reason ?? "",
		...currentSignals.map((signal) => signal.text),
	].find((text) => NOVELTY_PATTERN.test(text));
	if (noveltySignal) {
		const pathId = state.researchFocus?.pathIds[0];
		return suppressCompletedSearch(state, {
			trigger: "novelty-check",
			title: `Check novelty and current literature status: ${truncate(noveltySignal, 66)}`,
			description: buildSearchDescription(`current status, prior art, and later work concerning: ${noveltySignal}`),
			rationale: "A novelty or current-status conclusion requires external prior-art evidence.",
			query: noveltySignal,
			...(pathId ? { pathId } : {}),
		});
	}

	const repeatedObstruction = findRepeatedAcceptedObstruction(state);
	if (repeatedObstruction) {
		return suppressCompletedSearch(state, {
			trigger: "repeated-mathematical-obstruction",
			title: `Search around the repeated obstruction: ${truncate(repeatedObstruction.text, 72)}`,
			description: buildSearchDescription(
				`known theorems, alternative formulations, or special cases addressing this repeated obstruction: ${repeatedObstruction.text}`,
			),
			rationale:
				"Multiple accepted mathematical attempts recorded the same obstruction, so another unchanged direct attempt is not justified.",
			query: repeatedObstruction.text,
			pathId: repeatedObstruction.pathId,
		});
	}

	return undefined;
}

function collectCurrentSignals(state: CoMathProjectState): Array<{ text: string; pathId?: string }> {
	const signals: Array<{ text: string; pathId?: string }> = [];
	if (state.researchFocus?.reason) {
		signals.push({
			text: state.researchFocus.reason,
			...(state.researchFocus.pathIds[0] ? { pathId: state.researchFocus.pathIds[0] } : {}),
		});
	}
	for (const pathId of state.researchFocus?.pathIds ?? []) {
		const path = state.researchPaths.find((candidate) => candidate.id === pathId);
		if (!path) continue;
		for (const text of [...path.blockers, path.suggestedNextMove]) {
			signals.push({ text, pathId });
		}
	}
	const latestCoordinatorReport = state.researchCoordinatorReports.at(-1);
	if (latestCoordinatorReport) {
		for (const text of latestCoordinatorReport.roadblocks) {
			signals.push({
				text,
				...(latestCoordinatorReport.suggestedPathId ? { pathId: latestCoordinatorReport.suggestedPathId } : {}),
			});
		}
		for (const move of latestCoordinatorReport.recommendedNextMoves) {
			signals.push({
				text: `${move.title}. ${move.rationale} ${move.prompt ?? ""}`,
				...(move.pathId ? { pathId: move.pathId } : {}),
			});
		}
	}
	return signals.filter((signal) => {
		const text = signal.text.trim();
		if (text.length === 0 || GENERATED_LITERATURE_DIRECTIVE_PATTERN.test(text)) return false;
		return !PERSISTED_SOURCE_REPAIR_PATTERN.test(text) || EXTERNAL_SOURCE_REPLACEMENT_PATTERN.test(text);
	});
}

function findRepeatedAcceptedObstruction(state: CoMathProjectState): { text: string; pathId: string } | undefined {
	const reports = state.researchReports.filter(
		(report) =>
			report.status === "blocked" &&
			(report.acceptanceStatus === undefined || report.acceptanceStatus === "accepted"),
	);
	for (let rightIndex = reports.length - 1; rightIndex > 0; rightIndex -= 1) {
		const right = reports[rightIndex];
		if (!right) continue;
		for (let leftIndex = rightIndex - 1; leftIndex >= 0; leftIndex -= 1) {
			const left = reports[leftIndex];
			if (!left || left.pathId !== right.pathId) continue;
			const match = findMatchingObstruction(left, right);
			if (match) return { text: match, pathId: right.pathId };
		}
	}
	return undefined;
}

function findMatchingObstruction(
	left: ResearchWorkstreamReportRecord,
	right: ResearchWorkstreamReportRecord,
): string | undefined {
	const leftObstructions = [...left.gaps, ...left.criticisms];
	const rightObstructions = [...right.gaps, ...right.criticisms];
	return rightObstructions.find((candidate) =>
		leftObstructions.some((previous) => textsNearlyMatch(previous, candidate, 0.65)),
	);
}

function suppressCompletedSearch(
	state: CoMathProjectState,
	need: LiteratureSearchNeed,
): LiteratureSearchNeed | undefined {
	if (hasMatchingExtractedSource(state, need)) return undefined;
	const taskMatched = state.researchPlanTasks.some(
		(task) =>
			task.kind === "literature-search" &&
			(task.status === "pending" || task.status === "completed") &&
			textsNearlyMatch(`${task.title} ${task.description}`, `${need.title} ${need.description}`, 0.72),
	);
	const searchMatched = state.literatureSearches.some(
		(search) =>
			search.providers.some((provider) => provider.status === "completed") &&
			search.queries.some((query) => textsNearlyMatch(query, need.query, 0.72)),
	);
	return taskMatched || searchMatched ? undefined : need;
}

function hasMatchingExtractedSource(state: CoMathProjectState, need: LiteratureSearchNeed): boolean {
	const needText = `${need.title} ${need.query}`;
	const needTokens = distinctiveSourceTokens(needText);
	return state.literatureSources.some((source) => {
		if (!source.extractedText?.trim() || source.citationEligibility === "inventory-only") return false;
		const normalizedNeed = needText.toLowerCase();
		if (source.doi && normalizedNeed.includes(source.doi.toLowerCase())) return true;
		if (source.externalId && normalizedNeed.includes(source.externalId.toLowerCase())) return true;
		if (textsNearlyMatch(source.title, needText, 0.5)) return true;
		const sourceTokens = distinctiveSourceTokens(
			`${source.title} ${source.summary} ${source.year ?? ""} ${source.publishedAt ?? ""} ${source.extractedText.slice(0, 12_000)}`,
		);
		const shared = [...needTokens].filter((token) => sourceTokens.has(token)).length;
		return shared >= 2 && shared / Math.max(1, needTokens.size) >= 0.3;
	});
}

function distinctiveSourceTokens(text: string): Set<string> {
	const ignored = new Set([
		"exact",
		"grounded",
		"missing",
		"passage",
		"remains",
		"source",
		"statement",
		"theorem",
		"ungrounded",
		"unverified",
		"verification",
	]);
	return new Set(
		(text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
			(token) => (token.length >= 5 || /^\d{4}$/.test(token)) && !ignored.has(token),
		),
	);
}

function buildSearchDescription(target: string): string {
	return `Search the external mathematical literature and arXiv for ${truncate(target, MAX_QUERY_LENGTH)}. Keep the search targeted; record exact statements, locators, and hypotheses, compare them with the current objects, and report a bounded negative result if no inspected source applies.`;
}

function truncate(text: string, maxLength: number): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}
