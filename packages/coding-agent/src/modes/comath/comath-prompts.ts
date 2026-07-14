/**
 * Prompt-routing helpers for the co-math interactive harness.
 *
 * Centralizing the report/progress/state command matching keeps it out of scattered regexes in the
 * harness and lets every command accept polite phrasings ("please show progress") without each call
 * site re-implementing prefix stripping. Matchers anchor on the normalized prompt so arbitrary prose
 * ("report that this theorem is false") is not turned into a command.
 */

import { isLocalPath } from "../../utils/paths.ts";
import { extractMathExpressions, squashForFormulaComparison } from "./comath-text-similarity.ts";

const POLITE_PREFIX = /^(?:please|can you|could you|would you|will you|kindly|let'?s)\b[\s,]*/i;

/** Remove leading polite/filler phrases ("please", "can you", "let's", …); repeats for stacked prefixes. */
export function stripCoMathPolitePrefix(prompt: string): string {
	let result = prompt.trim();
	while (POLITE_PREFIX.test(result)) {
		const next = result.replace(POLITE_PREFIX, "").trim();
		if (next === result) {
			break;
		}
		result = next;
	}
	return result;
}

/** Strip polite prefixes and collapse whitespace so command matchers can use simple anchored patterns. */
export function normalizeCoMathPrompt(prompt: string): string {
	return stripCoMathPolitePrefix(prompt).replace(/\s+/g, " ").trim();
}

export interface ParsedUserProvidedLiteratureSource {
	title?: string;
	url?: string;
	path?: string;
	text: string;
}

export interface ParsedCoMathSourceIntent {
	pathInput: string;
	remainingInstruction: string;
	kindHint?: "file" | "directory";
}

/**
 * Parse an explicit request to start from a local file or directory. This is intentionally narrower
 * than a general path finder: mathematical prose such as `x/y` and report commands containing the
 * word "path" must never become filesystem intake. Filesystem resolution and validation happen in
 * `comath-source.ts` after this lexical routing step.
 */
export function parseCoMathSourceIntent(prompt: string): ParsedCoMathSourceIntent | undefined {
	const stripped = stripCoMathPolitePrefix(prompt).trim();
	const match =
		/^(?:look\s+at|inspect|read|use|work\s+(?:from|with)|start\s+(?:from|with))\s+(?:the\s+)?(?:(directory|folder|repo|repository|file|source)\s*)?:?\s*(.+)$/is.exec(
			stripped,
		);
	if (!match?.[2]) {
		return undefined;
	}

	const kindToken = match[1]?.toLowerCase();
	const parsedPath = parseLeadingLocalPath(match[2], kindToken !== undefined);
	if (!parsedPath || !isLocalPath(parsedPath.pathInput)) {
		return undefined;
	}
	return {
		pathInput: parsedPath.pathInput,
		remainingInstruction: parsedPath.remainingInstruction,
		...(kindToken === "file"
			? { kindHint: "file" as const }
			: kindToken && kindToken !== "source"
				? { kindHint: "directory" as const }
				: {}),
	};
}

function parseLeadingLocalPath(
	text: string,
	allowBareRelativePath: boolean,
): { pathInput: string; remainingInstruction: string } | undefined {
	const trimmed = text.trim();
	const quote = trimmed[0];
	if (quote === '"' || quote === "'" || quote === "`") {
		const closingIndex = trimmed.indexOf(quote, 1);
		if (closingIndex <= 1) {
			return undefined;
		}
		return {
			pathInput: trimmed.slice(1, closingIndex),
			remainingInstruction: normalizeSourceRemainder(trimmed.slice(closingIndex + 1)),
		};
	}

	const controlSuffix =
		/\s+(?:and\s+)?(?:start|begin|continue|investigate|research|analy[sz]e|work)(?:\s|[.!?]|$)/i.exec(trimmed);
	const pathEnd = controlSuffix?.index ?? trimmed.length;
	const pathInput = trimmed.slice(0, pathEnd).trim();
	const pathShaped =
		/^(?:file:\/\/|~[\\/]|\.{1,2}[\\/]|[\\/]|[A-Za-z]:[\\/])/i.test(pathInput) ||
		(allowBareRelativePath && /^[^\s]+$/.test(pathInput));
	if (!pathShaped) {
		return undefined;
	}
	return {
		pathInput,
		remainingInstruction: normalizeSourceRemainder(trimmed.slice(pathEnd)),
	};
}

function normalizeSourceRemainder(value: string): string {
	return value
		.trim()
		.replace(/^(?:,|;)?\s*(?:and\s+)?/i, "")
		.replace(/[.!?]+$/, "")
		.trim();
}

export interface ParsedResearchBatchPrompt {
	requestedStepCount: number;
	pathNumber?: number;
}

const MAX_RESEARCH_BATCH_STEPS = 5;
const DEFAULT_FEW_RESEARCH_BATCH_STEPS = 3;

export function parseResearchBatchPrompt(prompt: string): ParsedResearchBatchPrompt | undefined {
	const normalized = normalizeCoMathPrompt(prompt).toLowerCase();
	const explicitPathMatch = /^work on path (\d+) for (?:a few|(\d+)) steps?$/i.exec(normalized);
	if (explicitPathMatch?.[1]) {
		const pathNumber = Number.parseInt(explicitPathMatch[1], 10);
		const requestedStepCount = parseResearchBatchStepCount(explicitPathMatch[2]);
		return pathNumber > 0 ? { pathNumber, requestedStepCount } : undefined;
	}
	const forStepsMatch = /^(?:work|continue) for (?:a few|(\d+)) steps?$/i.exec(normalized);
	if (forStepsMatch) {
		return { requestedStepCount: parseResearchBatchStepCount(forStepsMatch[1]) };
	}
	const runStepsMatch = /^run (?:a few|(\d+)) research steps?$/i.exec(normalized);
	if (runStepsMatch) {
		return { requestedStepCount: parseResearchBatchStepCount(runStepsMatch[1]) };
	}
	return undefined;
}

export function isResumeResearchBatchPrompt(prompt: string): boolean {
	return /^(?:resume research|resume batch)$/i.test(normalizeCoMathPrompt(prompt));
}

export function parseCancelResearchBatchPrompt(prompt: string): string | undefined {
	const match = /^cancel batch:\s*(.+)$/i.exec(normalizeCoMathPrompt(prompt));
	return match?.[1]?.trim() || undefined;
}

function parseResearchBatchStepCount(value: string | undefined): number {
	if (!value) {
		return DEFAULT_FEW_RESEARCH_BATCH_STEPS;
	}
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) {
		return DEFAULT_FEW_RESEARCH_BATCH_STEPS;
	}
	return Math.min(MAX_RESEARCH_BATCH_STEPS, Math.max(1, parsed));
}

/** `make a plan`, `create a research plan`, and polite variants. */
export function isCreateResearchPlanPrompt(prompt: string): boolean {
	return /^(?:make|create|build|draft) (?:a |the )?(?:new )?(?:research )?plan$/i.test(normalizeCoMathPrompt(prompt));
}

/** `show plan`, `show the research plan`, `what is the plan`, and polite variants. */
export function isShowResearchPlanPrompt(prompt: string): boolean {
	return /^(?:show (?:me )?(?:the )?(?:current )?(?:research )?plan|what(?:'s| is) the plan\??)$/i.test(
		normalizeCoMathPrompt(prompt),
	);
}

export interface ParsedResearchPlanExecutionPrompt {
	requestedStepCount?: number;
	resume: boolean;
}

/**
 * Requests to run the durable research plan: `execute the plan`, `work the plan for 3 steps`,
 * `continue the plan`, `resume plan`. Returns `undefined` for anything else so path-level
 * continuation ("continue path 2") keeps its existing behavior.
 */
export function parseResearchPlanExecutionPrompt(prompt: string): ParsedResearchPlanExecutionPrompt | undefined {
	const normalized = normalizeCoMathPrompt(prompt).toLowerCase();
	if (/^resume (?:the )?(?:research )?plan$/.test(normalized)) {
		return { resume: true };
	}
	const stepsMatch = /^(?:work|execute|run|continue) (?:on )?(?:the )?plan for (?:a few|(\d+)) (?:more )?steps?$/.exec(
		normalized,
	);
	if (stepsMatch) {
		return { resume: false, requestedStepCount: parseResearchBatchStepCount(stepsMatch[1]) };
	}
	if (/^(?:execute|run|work|continue) (?:on )?(?:the )?plan$/.test(normalized)) {
		return { resume: false };
	}
	return undefined;
}

/** `show evidence`, `show the evidence board`, and polite variants. */
export function isShowEvidencePrompt(prompt: string): boolean {
	return /^show (?:me )?(?:the )?evidence(?: board)?$/i.test(normalizeCoMathPrompt(prompt));
}

export interface ParsedResearchConstraintPrompt {
	text: string;
	kind: "avoid" | "convention";
}

/**
 * Detect steering messages that impose a standing constraint, e.g. "do not attack arbitrary
 * Schubert multiplication" or "use the French convention for tableaux". Returns the constraint
 * text verbatim so nothing is lost in normalization.
 */
export function parseResearchConstraintPrompt(prompt: string): ParsedResearchConstraintPrompt | undefined {
	const normalized = prompt
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[.!]+$/, "");
	if (normalized.length === 0 || normalized.length > 300) {
		return undefined;
	}
	if (/^(?:please\s+)?(?:do not|don't|never|avoid|stay away from|stop attacking)\s+\S/i.test(normalized)) {
		return { text: normalized, kind: "avoid" };
	}
	if (
		/^(?:please\s+)?(?:use|assume|adopt|stick to|work in|fix)\s+.*\bconventions?\b/i.test(normalized) ||
		/^(?:please\s+)?(?:by|under) convention\b/i.test(normalized)
	) {
		return { text: normalized, kind: "convention" };
	}
	return undefined;
}

/**
 * `show the state of the problem`, `state of the problem`, `what do we know`, `where do we stand`,
 * and polite variants: requests for the canonical "state of the problem" document.
 */
export function isShowProblemStatePrompt(prompt: string): boolean {
	return /^(?:(?:show (?:me )?)?(?:the )?(?:current )?state of the problem|what do we (?:actually |really )?know(?: so far| about (?:this|the) problem)?\??|where do we stand\??)$/i.test(
		normalizeCoMathPrompt(prompt),
	);
}

/** `show obligations`, `show the claims`, `what is proved`, and polite variants. */
export function isShowObligationsPrompt(prompt: string): boolean {
	return /^(?:show (?:me )?(?:the )?(?:obligations?|claims? ledger|open claims?)|what (?:is|has been) (?:proved|established)\??)$/i.test(
		normalizeCoMathPrompt(prompt),
	);
}

/** `show lineage`, `show the conjecture history`, `how did the conjecture change`, and variants. */
export function isShowConjectureLineagePrompt(prompt: string): boolean {
	return /^(?:show (?:me )?(?:the )?(?:conjecture |statement )?(?:lineage|revision history)|show (?:me )?(?:the )?(?:conjecture|statement) history|how did the (?:conjecture|statement) (?:change|evolve)\??)$/i.test(
		normalizeCoMathPrompt(prompt),
	);
}

/** `show progress`, `status`, `what are you doing`, `show latest run`, and polite variants. */
export function isShowProgressPrompt(prompt: string): boolean {
	return /^(?:show (?:the )?(?:current )?progress|status|what are you doing\??|show (?:the )?latest run)$/i.test(
		normalizeCoMathPrompt(prompt),
	);
}

/** `show research state`, `summarize current state`, and polite variants. */
export function isShowResearchStatePrompt(prompt: string): boolean {
	return /^(?:show research state|summari[sz]e current state)$/i.test(normalizeCoMathPrompt(prompt));
}

/** `show report`, `show the report`, `show latest report`, `show the latest report`, and polite variants. */
export function isShowLatestReportPrompt(prompt: string): boolean {
	return /^show (?:the )?(?:latest )?report$/i.test(normalizeCoMathPrompt(prompt));
}

/** `show details for path N` / `show report for path N` and polite variants; returns the 1-based path number. */
export function isShowReportForPathPrompt(prompt: string): { pathNumber: number } | undefined {
	const match = /^show (?:details|report) for path (\d+)$/i.exec(normalizeCoMathPrompt(prompt));
	if (!match?.[1]) {
		return undefined;
	}
	const pathNumber = Number.parseInt(match[1], 10);
	return pathNumber > 0 ? { pathNumber } : undefined;
}

/**
 * Requests for the project coordinator to synthesize across paths ("what should we try next?",
 * "what is blocked?", "compare paths", …). Distinct from showing an already-created coordinator report.
 */
export function isResearchCoordinatorPrompt(prompt: string): boolean {
	return /^(?:what should we try next\??|what next\??|recommend (?:the )?next path|make a plan from current reports|summari[sz]e current state and recommend next steps|what is blocked\??|compare paths|project coordinator summary)$/i.test(
		prompt.trim(),
	);
}

/** `show [latest] [project] coordinator report/summary` and polite variants (distinct from a research report). */
export function isShowLatestCoordinatorReportPrompt(prompt: string): boolean {
	return /^show (?:the )?(?:latest )?(?:project )?coordinator (?:report|summary)$/i.test(
		normalizeCoMathPrompt(prompt),
	);
}

/**
 * Parse natural prompts that provide literature/reference context for Path 5. This is metadata/text
 * intake only: local paths are recorded as source metadata and are not read here.
 */
export function parseUserProvidedLiteratureSourcePrompt(
	prompt: string,
): ParsedUserProvidedLiteratureSource | undefined {
	const stripped = stripCoMathPolitePrefix(prompt);
	const normalized = normalizeCoMathPrompt(stripped);
	if (
		normalized.length === 0 ||
		isShowProgressPrompt(stripped) ||
		isShowResearchStatePrompt(stripped) ||
		isShowLatestReportPrompt(stripped) ||
		isShowReportForPathPrompt(stripped) !== undefined ||
		isShowLatestCoordinatorReportPrompt(stripped) ||
		/^(?:continue|run|start|try|work|resume|cancel)\b/i.test(normalized)
	) {
		return undefined;
	}
	const match =
		/^(?:(?:i\s+(?:found|have)\s+(?:a\s+)?(?:reference|source|paper|theorem\s+note))|(?:use\s+this\s+(?:reference|source|paper)(?:\s+for\s+path\s+\d+)?)|(?:here\s+is\s+(?:a\s+)?(?:theorem\s+note|reference|source|paper))|(?:register\s+this\s+(?:reference|source|paper))|(?:reference\s+for\s+path\s+\d+)|(?:literature\s+note))\s*:?\s*(.+)$/is.exec(
			stripped.trim(),
		);
	const text = match?.[1]?.trim();
	if (!text) {
		return undefined;
	}
	const url = extractSourceUrl(text);
	const path = extractSourcePath(text, url);
	return {
		...(url ? { url } : {}),
		...(path ? { path } : {}),
		text,
	};
}

function extractSourceUrl(text: string): string | undefined {
	const match = /\bhttps?:\/\/[^\s<>)]+/i.exec(text);
	return match?.[0]?.replace(/[.,;:!?]+$/, "");
}

function extractSourcePath(text: string, url: string | undefined): string | undefined {
	const withoutUrl = url ? text.replace(url, " ") : text;
	const match =
		/(?:^|\s)((?:\.{1,2}\/|\/|~\/)[^\s,;:]+|[A-Za-z0-9._-]+\.(?:bib|html?|md|markdown|pdf|tex|txt))(?:\s|$)/i.exec(
			withoutUrl,
		);
	return match?.[1]?.replace(/[.,;:!?]+$/, "");
}

// Math/research vocabulary that signals a question is a mathematical research problem.
const MATH_RESEARCH_TERMS =
	/\b(?:primes?|integers?|theorem|conjecture|proofs?|prove|disprove|infinitely\s+many|infinitude|polynomials?|equations?|sequences?|series|graphs?|groups?|rings?|fields?|numbers?|divisors?|divisible|composite|modulo|congruence|congruent|factorial|fibonacci|collatz|goldbach|twin\s+primes?|squares?|sum\s+of|rational|irrational|even\s+(?:integer|number)|odd\s+(?:integer|number)|natural\s+number)\b/i;

// Mathematical notation such as n^2, x^k, "mod", or comparison/quantifier symbols.
const MATH_NOTATION = /\b[a-z]\^[0-9a-z]|[0-9]\^[0-9]|\bmod\b|≡|∑|∏|∀|∃|∈|≤|≥|≠/i;

// Phrasing that frames a prompt as a research/exploration request even without a trailing "?".
const NATURAL_RESEARCH_PHRASING = /\b(?:explore|investigate|study|examine|look\s+into|figure\s+out|determine)\b/i;

// Leading exec/dev verbs that should never start co-math research, even if math words follow.
const DEV_COMMAND_PREFIX =
	/^(?:run|npm|npx|yarn|pnpm|git|make|build|rebuild|lint|install|deploy|compile|cd|ls|cat|grep|open|edit)\b/i;

// Polite/help preamble plus a research verb (and optional "whether/if") to strip from a natural question.
const NATURAL_RESEARCH_PREAMBLE =
	/^(?:(?:can|could|would|will)\s+you\s+|please\s+|i(?:'d|\s+would|\s+want\s+to|\s+wanna)\s+(?:like\s+to\s+)?|let'?s\s+|let\s+us\s+|can\s+we\s+|help\s+me\s+)*(?:help\s+me\s+)?(?:explore|investigate|study|examine|look\s+into|figure\s+out|determine)\s+(?:whether\s+|if\s+|the\s+question\s+of\s+(?:whether\s+)?)?/i;

/**
 * True when a fresh-workspace prompt looks like a mathematical research question that should start
 * co-math exploration. Conservative and deterministic (no LLM): requires a math/notation signal and
 * either a trailing "?" or explicit research phrasing, and rejects recognized commands and exec/dev
 * prompts so operational prose does not accidentally start research.
 */
export function isLikelyMathResearchQuestion(prompt: string): boolean {
	const trimmed = prompt.trim();
	if (trimmed.length === 0) {
		return false;
	}
	if (
		isShowProgressPrompt(prompt) ||
		isShowResearchStatePrompt(prompt) ||
		isShowLatestReportPrompt(prompt) ||
		isShowReportForPathPrompt(prompt) !== undefined ||
		isShowLatestCoordinatorReportPrompt(prompt)
	) {
		return false;
	}
	if (DEV_COMMAND_PREFIX.test(normalizeCoMathPrompt(prompt))) {
		return false;
	}
	const hasMathSignal = MATH_RESEARCH_TERMS.test(trimmed) || MATH_NOTATION.test(trimmed);
	if (!hasMathSignal) {
		return false;
	}
	const endsWithQuestion = /\?\s*$/.test(trimmed);
	const hasResearchPhrasing = NATURAL_RESEARCH_PHRASING.test(trimmed);
	return endsWithQuestion || hasResearchPhrasing;
}

/**
 * If the prompt is a natural math research question, return it (with any leading "can you help me
 * explore whether …" preamble stripped); otherwise `undefined`. Used to start research exploration
 * from a bare question without the explicit "Explore this problem:" prefix.
 */
export function parseNaturalResearchQuestion(prompt: string): string | undefined {
	if (!isLikelyMathResearchQuestion(prompt)) {
		return undefined;
	}
	const trimmed = prompt.trim();
	const stripped = trimmed.replace(NATURAL_RESEARCH_PREAMBLE, "").trim();
	return stripped.length > 0 ? stripped : trimmed;
}

// Generic question words that carry no signal about which mathematical problem is meant.
const QUESTION_STOPWORDS = new Set([
	"a",
	"all",
	"an",
	"and",
	"any",
	"are",
	"be",
	"by",
	"can",
	"do",
	"does",
	"every",
	"for",
	"from",
	"how",
	"i",
	"in",
	"is",
	"it",
	"many",
	"of",
	"on",
	"or",
	"that",
	"the",
	"there",
	"this",
	"to",
	"we",
	"what",
	"when",
	"which",
	"why",
	"with",
	"you",
]);

/**
 * Whether a standalone question is substantially different from the questions an existing
 * workspace is researching. Conservative on purpose: shared significant words or a shared math
 * expression count as "same project", so restatements and follow-ups keep flowing as steering.
 * Used to stop a genuinely new problem from being silently recorded as steering for the old one.
 */
export function isDifferentResearchQuestion(candidate: string, existingQuestionTexts: readonly string[]): boolean {
	const candidateTokens = significantQuestionTokens(candidate);
	if (candidateTokens.size < 2) {
		return false;
	}
	const candidateFormulas = extractMathExpressions(candidate);
	for (const existing of existingQuestionTexts) {
		if (!existing.trim()) {
			continue;
		}
		const existingTokens = significantQuestionTokens(existing);
		const shared = [...candidateTokens].filter((token) => existingTokens.has(token)).length;
		const containment = shared / Math.min(candidateTokens.size, existingTokens.size || 1);
		if (containment >= 0.6) {
			return false;
		}
		const squashedExisting = squashForFormulaComparison(existing);
		const existingFormulas = extractMathExpressions(existing);
		const squashedCandidate = squashForFormulaComparison(candidate);
		if (
			candidateFormulas.some((formula) => squashedExisting.includes(formula)) ||
			existingFormulas.some((formula) => squashedCandidate.includes(formula))
		) {
			return false;
		}
	}
	return true;
}

function significantQuestionTokens(text: string): Set<string> {
	return new Set(
		text
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.map((token) => token.replace(/s$/, ""))
			.filter((token) => token.length >= 2 && !QUESTION_STOPWORDS.has(token)),
	);
}

// Leading exec/dev verbs and operational phrases that should never create co-math state.
const OPERATIONAL_PROMPT =
	/^(?:run|npm|npx|yarn|pnpm|git|make|build|rebuild|lint|install|deploy|compile|cd|ls|cat|grep|open|edit|mkdir|touch|rm|mv|cp|chmod|export|sudo|cargo|docker|kubectl)\b|^(?:show\s+me\b|list\s+files?\b|what\s+(?:branch|files?|directory|dir|commit|status)\b|which\s+branch\b)/i;

// Proof/claim vocabulary that signals a validation request even without an explicit "validate" verb.
const MATH_PROOF_TERMS =
	/\b(?:proofs?|prove|theorem|lemma|claims?|conjecture|corollary|derivation|identity|inequality|equation)\b/i;

// Explicit framing that asks Pi to validate/audit/review a piece of mathematics.
const VALIDATION_FRAMING =
	/\b(?:validate|verify|disprove|audit)\b|\bprove\b|\bcheck\s+(?:this|the|my|the\s+following)\s+(?:proof|claim|argument|theorem|lemma|solution|derivation|reasoning|step)\b|\breview\s+(?:this|the|my)\s+(?:proof|claim|argument|theorem|lemma|solution)\b|\bis\s+(?:this|the\s+following|my)\s+(?:proof|argument|claim|solution|reasoning)\s+(?:valid|correct|right|sound|complete)\b/i;

/**
 * True for fresh-workspace prompts that are operational/dev requests rather than mathematics, e.g.
 * "run tests", "git status", "show me the files", "what branch am I on?". Deterministic (no LLM).
 */
export function isLikelyOperationalNonMathPrompt(prompt: string): boolean {
	return OPERATIONAL_PROMPT.test(normalizeCoMathPrompt(prompt));
}

/**
 * True for fresh-workspace prompts that clearly ask for mathematical validation/proof/audit, or that
 * otherwise carry a math signal. Used as the allowlist for the sourceless validation entrypoint:
 * operational/dev prose and other non-math input are excluded so they do not create durable state.
 */
export function isLikelyMathValidationPrompt(prompt: string): boolean {
	const normalized = normalizeCoMathPrompt(prompt);
	if (normalized.length === 0 || isLikelyOperationalNonMathPrompt(prompt)) {
		return false;
	}
	if (VALIDATION_FRAMING.test(normalized)) {
		return true;
	}
	return MATH_PROOF_TERMS.test(normalized) || MATH_RESEARCH_TERMS.test(normalized) || MATH_NOTATION.test(normalized);
}
