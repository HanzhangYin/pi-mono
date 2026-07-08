/**
 * Text-similarity helpers for durable co-math records.
 *
 * Several roles (specialist, critic, synthesizer, skeptic) describe the same mathematical fact in
 * different words within a single run, so exact-text comparison is not enough to keep the durable
 * ledgers free of paraphrased duplicates or off-target attachments. These helpers are deliberately
 * lexical — significant-token containment and squashed math-expression matching — never semantic
 * guesses: when two texts do not share enough content to be confidently the same, they are treated
 * as different, so a real new record is never silently dropped.
 */

/** Common words that carry no mathematical content when comparing statements. */
const SIMILARITY_STOPWORDS = new Set([
	"a",
	"an",
	"and",
	"any",
	"are",
	"as",
	"at",
	"be",
	"but",
	"by",
	"do",
	"for",
	"from",
	"in",
	"into",
	"is",
	"it",
	"its",
	"not",
	"of",
	"on",
	"or",
	"such",
	"that",
	"the",
	"their",
	"there",
	"this",
	"to",
	"with",
]);

/** Significant lowercase tokens (singularized, stopwords removed) for containment comparison. */
export function significantContentTokens(text: string): Set<string> {
	return new Set(
		text
			.toLowerCase()
			.split(/[^a-z0-9^]+/)
			.map((token) => token.replace(/s$/, ""))
			.filter((token) => token.length >= 2 && !SIMILARITY_STOPWORDS.has(token)),
	);
}

/**
 * Whether two texts say substantially the same thing: the smaller text's significant tokens are
 * almost all contained in the larger one. Used to stop paraphrased duplicates of the same standing
 * rule or route from multiplying in durable state.
 */
export function textsNearlyMatch(a: string, b: string, threshold = 0.75): boolean {
	const tokensA = significantContentTokens(a);
	const tokensB = significantContentTokens(b);
	if (tokensA.size === 0 || tokensB.size === 0) {
		return a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
	}
	const shared = [...tokensA].filter((token) => tokensB.has(token)).length;
	return shared / Math.min(tokensA.size, tokensB.size) >= threshold;
}

/** Lowercase text with everything but alphanumerics and math operators removed. */
export function squashForFormulaComparison(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9^+\-*/=]/g, "");
}

/**
 * Math expressions like `n^2+1` from the whitespace-squashed text; short fragments are ignored.
 * Squashing glues trailing prose onto an expression ("n^2 + 41 prime for" → "n^2+41primefor"), and
 * hyphenated words read as subtraction ("non-negative"), so trailing word runs (three or more
 * letters — a word, never a variable) and dangling operators are trimmed off until none remain.
 */
export function extractMathExpressions(text: string): string[] {
	const squashed = squashForFormulaComparison(text);
	return [...squashed.matchAll(/[a-z0-9](?:\^[a-z0-9]+)?(?:[+\-*/=][a-z0-9^]+)+/g)]
		.map((match) => trimExpressionTail(match[0]))
		.filter((expression) => expression.length >= 4);
}

function trimExpressionTail(expression: string): string {
	let result = expression;
	for (;;) {
		const next = result.replace(/[a-z]{3,}$/, "").replace(/[+\-*/=^]+$/, "");
		if (next === result) {
			return result;
		}
		result = next;
	}
}

/**
 * A canonical key for a theorem name: parentheticals, bracketed source labels, "as reported in"
 * suffixes, and the word "theorem" are stripped so "Friedlander–Iwaniec theorem (X^2 + Y^4)" and
 * "Friedlander–Iwaniec (X² + Y⁴) as reported in [source-2]" both key to the same check.
 */
export function normalizeTheoremKey(theorem: string): string {
	return theorem
		.toLowerCase()
		.replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
		.replace(/\b(?:as (?:reported|stated|cited|described) (?:in|by)|from|via|per)\b.*$/, " ")
		.replace(/\btheorems?\b|\bresults?\b/g, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/**
 * Whether a claim is commentary about a bibliography entry ("[source-5] claims a proof of ...")
 * rather than a mathematical statement in its own right. Source commentary belongs on the evidence
 * board, never in the obligation ledger: what a preprint asserts is not support for the claim.
 */
export function isSourceCommentaryClaim(claim: string): boolean {
	return /^[\s"'*]*\[?source[\s-]?\d+\]?\b/i.test(claim);
}

/**
 * Whether a claim is plausibly about the given statement, as opposed to reporting a related but
 * different result. A claim about a statement either contains one of the statement's math
 * expressions or shares most of its significant tokens; a claim that names only *different* math
 * expressions is about a different object and must not attach as support.
 */
export function claimTargetsStatement(claim: string, statement: string): boolean {
	const statementExpressions = extractMathExpressions(statement);
	const squashedClaim = squashForFormulaComparison(claim);
	if (statementExpressions.some((expression) => squashedClaim.includes(expression))) {
		return true;
	}
	if (statementExpressions.length > 0 && extractMathExpressions(claim).length > 0) {
		// Both sides name concrete expressions and none match: the claim is about something else.
		return false;
	}
	const statementTokens = significantContentTokens(statement);
	const claimTokens = significantContentTokens(claim);
	if (statementTokens.size === 0 || claimTokens.size === 0) {
		return false;
	}
	const shared = [...statementTokens].filter((token) => claimTokens.has(token)).length;
	return shared / statementTokens.size >= 0.6;
}
