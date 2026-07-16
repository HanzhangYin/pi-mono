import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { extractMathExpressions, significantContentTokens } from "./comath-text-similarity.ts";
import type {
	CoMathSourceCitationEligibility,
	CoMathWorkspaceSourceRole,
	LiteratureSearchProviderRecord,
	LiteratureSourceArtifact,
	LiteratureSourceKind,
	LiteratureSourceProvider,
	LiteratureSourceType,
} from "./schema.ts";

const DEFAULT_PROVIDER_LIMIT = 5;
const DEFAULT_PROVIDER_TIMEOUT_MS = 8_000;
const DEFAULT_REVIEW_LIMIT = 8;
const MAX_PROVIDER_QUERIES = 2;
const MAX_FULL_TEXT_CANDIDATES = 3;
const MAX_FULL_TEXT_ROUTES_PER_SOURCE = 4;
const MIN_FULL_TEXT_CHARACTERS = 2_000;
const MAX_FULL_TEXT_CHARACTERS = 120_000;
const MAX_CATALOG_SUMMARY_CHARACTERS = 4_000;

const GENERIC_RELEVANCE_TOKENS = new Set([
	"conjecture",
	"compact",
	"context",
	"infinitely",
	"known",
	"literature",
	"many",
	"open",
	"paper",
	"prime",
	"problem",
	"proof",
	"question",
	"related",
	"result",
	"source",
	"space",
	"task",
	"theorem",
	"work",
]);

const NUMBER_THEORY_PRIMARY_TOKENS = new Set([
	"congruence",
	"diophantine",
	"divisor",
	"factorization",
	"integer",
	"prime",
	"residue",
	"sieve",
]);

const NUMBER_THEORY_SUPPORT_TOKENS = new Set([
	"arithmetic",
	"asymptotic",
	"binary",
	"counting",
	"distribution",
	"form",
	"gap",
	"modulo",
	"polynomial",
	"quadratic",
	"sequence",
	"value",
]);

export interface LiteratureSourceQuery {
	rootQuestion: string;
	pathTitle: string;
	pathObjective: string;
	maxSources: number;
	maxResultsPerProvider?: number;
	timeoutMs?: number;
}

export interface LiteratureSourceResult {
	/** Durable state id for a source already registered in the active run catalog. */
	id?: string;
	title: string;
	url?: string;
	path?: string;
	kind?: LiteratureSourceKind;
	provider?: LiteratureSourceProvider;
	externalId?: string;
	doi?: string;
	venue?: string;
	publishedAt?: string;
	citationCount?: number;
	sourceType?: LiteratureSourceType;
	summary: string;
	extractedText?: string;
	authors?: string[];
	year?: string;
	workspaceRole?: CoMathWorkspaceSourceRole;
	citationEligibility?: CoMathSourceCitationEligibility;
	sourceIndexId?: string;
	sourceRevisionId?: string;
	sourceRelativePath?: string;
	sourceFileSha256?: string;
}

export interface LiteratureSourceSearchResponse {
	sources: LiteratureSourceResult[];
	inventorySources?: LiteratureSourceResult[];
	providers: LiteratureSearchProviderRecord[];
	queries: string[];
	candidateCount: number;
}

export type LiteratureSourceLookupResult = LiteratureSourceResult[] | LiteratureSourceSearchResponse;

export interface LiteratureSourceLookup {
	search(query: LiteratureSourceQuery): Promise<LiteratureSourceLookupResult>;
}

export interface LiteratureFullTextOptions {
	timeoutMs?: number;
	fetchFn?: (url: string, timeoutMs: number) => Promise<Response>;
}

export function prepareLiteratureSourceForCatalog(source: LiteratureSourceResult): LiteratureSourceResult {
	return {
		...source,
		summary: source.summary.slice(0, MAX_CATALOG_SUMMARY_CHARACTERS),
		...(source.extractedText ? { extractedText: source.extractedText.slice(0, MAX_FULL_TEXT_CHARACTERS) } : {}),
	};
}

interface ProviderSearchOutput {
	provider: LiteratureSourceProvider;
	query: string;
	sources: LiteratureSourceResult[];
	status: LiteratureSearchProviderRecord["status"];
	error?: string;
}

export function createDefaultLiteratureSourceLookup(): LiteratureSourceLookup {
	return new CompositeLiteratureSourceLookup();
}

export function createWorkspaceLiteratureSourceLookup(input: {
	sources: readonly LiteratureSourceArtifact[];
	fallback: LiteratureSourceLookup;
	sourceContexts?: ReadonlyMap<string, string>;
}): LiteratureSourceLookup {
	return {
		search: async (query) => {
			const inventorySources = input.sources
				.filter((source) => citationEligibilityForWorkspaceRole(source.workspaceRole) === "inventory-only")
				.map(literatureSourceArtifactToResult);
			const registered = input.sources
				.filter((source) => citationEligibilityForWorkspaceRole(source.workspaceRole) === "citable")
				.map((source) => {
					const result = literatureSourceArtifactToResult(source);
					const extractedText = input.sourceContexts?.get(source.id);
					return { ...result, ...(extractedText ? { extractedText } : {}) };
				})
				.sort(compareWorkspaceSourceResults);
			const fallback = normalizeLiteratureSourceLookupResult(await input.fallback.search(query));
			const rankedFallback = rankLiteratureSources(fallback.sources, query);
			const sources = uniqueLiteratureSources([...registered, ...rankedFallback]).slice(0, query.maxSources);
			const workspaceProvider: LiteratureSearchProviderRecord =
				registered.length > 0
					? {
							provider: "workspace",
							query: query.rootQuestion,
							status: "completed",
							candidateCount: registered.length,
						}
					: {
							provider: "workspace",
							query: query.rootQuestion,
							status: "skipped",
							candidateCount: 0,
						};
			return {
				sources,
				...(inventorySources.length > 0 ? { inventorySources } : {}),
				providers: [workspaceProvider, ...fallback.providers],
				queries: fallback.queries.length > 0 ? fallback.queries : buildLiteratureSearchQueries(query),
				candidateCount: registered.length + fallback.candidateCount,
			};
		},
	};
}

export function normalizeLiteratureSourceLookupResult(
	result: LiteratureSourceLookupResult,
	query?: LiteratureSourceQuery,
): LiteratureSourceSearchResponse {
	if (Array.isArray(result)) {
		return {
			sources: result,
			providers: [],
			queries: query ? buildLiteratureSearchQueries(query) : [],
			candidateCount: result.length,
		};
	}
	return result;
}

export function buildLiteratureSearchQueries(query: LiteratureSourceQuery): string[] {
	const exactProblem = compactLiteratureSearchSeed(query.rootQuestion);
	const pathTerms = normalizeQuery([query.pathTitle, query.pathObjective].join(" "));
	const keywordTerms = extractMathKeywords([query.rootQuestion, query.pathTitle, query.pathObjective].join(" ")).join(
		" ",
	);
	return uniqueStrings([
		exactProblem,
		[exactProblem, pathTerms].filter(Boolean).join(" "),
		keywordTerms,
		inferKnownContextQuery(query.rootQuestion, keywordTerms),
	]).slice(0, 4);
}

/** Extract bounded publication-title hints from already indexed bibliographic source context. */
export function extractLiteratureSearchHints(contexts: readonly string[]): string[] {
	const hints: string[] = [];
	for (const context of contexts) {
		for (const rawLine of context.split(/\r?\n/)) {
			const line = rawLine.replace(/^\s*\d+:\s*/, "").trim();
			const candidates = [
				/<title>([^<]+)<\/title>/i.exec(line)?.[1],
				/^[-*]?\s*(?:\*\*)?title(?:\*\*)?\s*:\s*(.+)$/i.exec(line)?.[1],
				/\\title\s*\{([^{}]+)\}/i.exec(line)?.[1],
				/^\s*title\s*=\s*[{"]([^}"]+)[}"]/i.exec(line)?.[1],
			];
			for (const candidate of candidates) {
				if (!candidate) continue;
				const normalized = decodeXmlEntities(candidate)
					.replace(/[{}]/g, " ")
					.replace(/\\[a-zA-Z]+/g, " ")
					.replace(/\s+/g, " ")
					.trim();
				if (normalized.length >= 12 && normalized.length <= 240 && !/^arxiv\s+query\b/i.test(normalized)) {
					hints.push(normalized);
				}
			}
		}
	}
	return uniqueStrings(hints).slice(0, 4);
}

export function formatLiteratureSourceForPrompt(sourceId: string, source: LiteratureSourceResult): string {
	const indexedContext = source.sourceRelativePath && source.extractedText ? source.extractedText : undefined;
	return [
		`[${sourceId}] ${source.title}`,
		...(source.authors && source.authors.length > 0 ? [`Authors: ${source.authors.join(", ")}`] : []),
		...(source.year ? [`Year: ${source.year}`] : []),
		...(source.venue ? [`Venue: ${source.venue}`] : []),
		...(source.provider ? [`Provider: ${formatProviderName(source.provider)}`] : []),
		...(source.sourceType ? [`Source type: ${source.sourceType}`] : []),
		...(source.doi ? [`DOI: ${source.doi}`] : []),
		...(source.externalId ? [`External ID: ${source.externalId}`] : []),
		...(source.citationCount !== undefined ? [`Citation count: ${source.citationCount}`] : []),
		...(source.publishedAt ? [`Published: ${source.publishedAt}`] : []),
		...(source.url ? [`URL: ${source.url}`] : []),
		...(source.path ? [`Path: ${source.path}`] : []),
		`Summary: ${source.summary}`,
		...(indexedContext ? [indexedContext] : source.extractedText ? [`Extract: ${source.extractedText}`] : []),
	].join("\n");
}

class CompositeLiteratureSourceLookup implements LiteratureSourceLookup {
	async search(query: LiteratureSourceQuery): Promise<LiteratureSourceSearchResponse> {
		const queries = buildLiteratureSearchQueries(query);
		const providerQueries = selectProviderQueries(queries, query.rootQuestion);
		const limit = Math.max(
			1,
			Math.min(DEFAULT_PROVIDER_LIMIT, query.maxResultsPerProvider ?? DEFAULT_PROVIDER_LIMIT),
		);
		const timeoutMs = Math.max(1_000, query.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS);
		const providers = createProviderAdapters();
		const providerOutputs = await Promise.all(
			providerQueries.flatMap((providerQuery) =>
				providers.map((provider) => provider(providerQuery, limit, timeoutMs)),
			),
		);
		const providerRecords: LiteratureSearchProviderRecord[] = providerOutputs.map((output) => ({
			provider: output.provider,
			query: output.query,
			status: output.status,
			candidateCount: output.sources.length,
			...(output.error ? { error: output.error } : {}),
		}));
		const candidateSources = providerOutputs.flatMap((output) => output.sources);
		const rankedSources = rankLiteratureSources(uniqueLiteratureSources(candidateSources), query);
		const enrichedSources = await enrichLiteratureSourcesWithFullText(rankedSources, { timeoutMs });
		return {
			sources: enrichedSources.slice(0, Math.max(1, query.maxSources || DEFAULT_REVIEW_LIMIT)),
			providers: providerRecords,
			queries,
			candidateCount: candidateSources.length,
		};
	}
}

export async function enrichLiteratureSourcesWithFullText(
	sources: readonly LiteratureSourceResult[],
	options: LiteratureFullTextOptions = {},
): Promise<LiteratureSourceResult[]> {
	const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS);
	const fetchFn = options.fetchFn ?? fetchWithTimeout;
	const enriched = [...sources];
	const candidateCount = Math.min(MAX_FULL_TEXT_CANDIDATES, enriched.length);
	for (let index = 0; index < candidateCount; index += 1) {
		const source = enriched[index];
		if (!source || isSubstantiveFullText(source.extractedText, source.title)) {
			continue;
		}
		const equivalentSources = enriched.filter((candidate) => publicationTitlesMatch(source.title, candidate.title));
		const replacement = await retrieveFullText(source, equivalentSources, fetchFn, timeoutMs);
		if (replacement) {
			enriched[index] = replacement;
		}
	}
	return enriched;
}

async function retrieveFullText(
	source: LiteratureSourceResult,
	equivalentSources: readonly LiteratureSourceResult[],
	fetchFn: (url: string, timeoutMs: number) => Promise<Response>,
	timeoutMs: number,
): Promise<LiteratureSourceResult | undefined> {
	for (const url of buildFullTextRoutes(source, equivalentSources).slice(0, MAX_FULL_TEXT_ROUTES_PER_SOURCE)) {
		try {
			const response = await fetchFn(url, timeoutMs);
			if (!response.ok) {
				continue;
			}
			const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
			if (contentType.includes("application/pdf")) {
				continue;
			}
			const rawBytes = new Uint8Array(await response.arrayBuffer());
			const raw = new TextDecoder().decode(rawBytes);
			const text =
				url.includes("export.arxiv.org/e-print/") || /(?:gzip|x-tar)/.test(contentType)
					? extractArxivSourceText(rawBytes)
					: contentType.includes("html") || /^\s*</.test(raw)
						? extractHtmlText(raw)
						: normalizePlainText(raw);
			if (!isSubstantiveFullText(text, source.title)) {
				continue;
			}
			const retrievalUrl = response.url || url;
			const sha256 = createHash("sha256").update(rawBytes).digest("hex");
			return {
				...source,
				url: retrievalUrl,
				sourceFileSha256: sha256,
				extractedText: formatIndexedFullText(text, retrievalUrl, sha256),
			};
		} catch {
			// A failed route falls through to the next bounded route.
		}
	}
	return undefined;
}

function buildFullTextRoutes(
	source: LiteratureSourceResult,
	equivalentSources: readonly LiteratureSourceResult[],
): string[] {
	const routes: string[] = [];
	if (source.doi) {
		routes.push(`https://doi.org/${encodeURIComponent(normalizeDoi(source.doi))}`);
	}
	const arxivIds = equivalentSources
		.map(extractArxivId)
		.filter((id): id is string => Boolean(id))
		.map((id) => id.replace(/v\d+$/i, ""));
	for (const arxivId of [...new Set(arxivIds)]) {
		routes.push(`https://arxiv.org/html/${encodeURIComponent(arxivId)}`);
		routes.push(`https://export.arxiv.org/e-print/${encodeURIComponent(arxivId)}`);
		routes.push(`https://ar5iv.labs.arxiv.org/html/${encodeURIComponent(arxivId)}`);
	}
	for (const candidate of equivalentSources) {
		if (candidate.url && !candidate.url.toLowerCase().endsWith(".pdf")) {
			routes.push(candidate.url);
		}
	}
	return [...new Set(routes)];
}

function publicationTitlesMatch(left: string, right: string): boolean {
	const normalize = (value: string) =>
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, " ")
			.trim();
	const normalizedLeft = normalize(left);
	const normalizedRight = normalize(right);
	return normalizedLeft === normalizedRight;
}

function extractArxivId(source: LiteratureSourceResult): string | undefined {
	if (source.provider === "arxiv" && source.externalId) {
		return source.externalId.replace(/^arxiv:/i, "");
	}
	for (const candidate of [source.externalId, source.url, source.id]) {
		const match = candidate?.match(
			/(?:arxiv:|arxiv\.org\/(?:abs|html|pdf)\/)([a-z-]+\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?/i,
		);
		if (match?.[1]) {
			return match[1];
		}
	}
	return undefined;
}

function extractHtmlText(html: string): string {
	const withoutNonContent = html
		.replace(/<(script|style|svg|nav|form)\b[^>]*>[\s\S]*?<\/\1>/gi, "\n")
		.replace(/<math\b[^>]*\balttext=(?:"([^"]*)"|'([^']*)')[^>]*>[\s\S]*?<\/math>/gi, (_match, double, single) =>
			decodeHtmlEntities(String(double ?? single ?? "")),
		)
		.replace(/<(?:br|hr)\s*\/?\s*>/gi, "\n")
		.replace(
			/<\/?(?:article|aside|blockquote|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|li|main|ol|p|pre|section|table|tbody|td|th|thead|tr|ul)\b[^>]*>/gi,
			"\n",
		)
		.replace(/<[^>]+>/g, " ");
	return normalizePlainText(decodeHtmlEntities(withoutNonContent));
}

function extractArxivSourceText(input: Uint8Array): string {
	let archive = input;
	try {
		if (input[0] === 0x1f && input[1] === 0x8b) archive = gunzipSync(input);
	} catch {
		return "";
	}
	const decoder = new TextDecoder();
	const documents: string[] = [];
	for (let offset = 0; offset + 512 <= archive.length; ) {
		const header = archive.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;
		const name = decoder.decode(header.subarray(0, 100)).replace(/\0.*$/, "").trim();
		const sizeText = decoder.decode(header.subarray(124, 136)).replace(/\0.*$/, "").trim();
		const size = Number.parseInt(sizeText || "0", 8);
		if (!Number.isFinite(size) || size < 0 || offset + 512 + size > archive.length) return "";
		if (/\.(?:tex|ltx)$/i.test(name)) {
			documents.push(decoder.decode(archive.subarray(offset + 512, offset + 512 + size)));
		}
		offset += 512 + Math.ceil(size / 512) * 512;
	}
	return normalizePlainText(documents.join("\n"));
}

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&#(\d+);/g, (_match, digits: string) => String.fromCodePoint(Number(digits)))
		.replace(/&#x([\da-f]+);/gi, (_match, digits: string) => String.fromCodePoint(Number.parseInt(digits, 16)));
}

function normalizePlainText(value: string): string {
	return value
		.split(/\r?\n/)
		.map((line) => line.replace(/\s+/g, " ").trim())
		.filter(Boolean)
		.join("\n")
		.slice(0, MAX_FULL_TEXT_CHARACTERS);
}

function isSubstantiveFullText(value: string | undefined, title: string): boolean {
	if (!value || value.length < MIN_FULL_TEXT_CHARACTERS) {
		return false;
	}
	const lower = value.toLowerCase();
	if (!/\b(theorem|proposition|lemma|corollary)\b/.test(lower) || !/\bproof\b/.test(lower)) {
		return false;
	}
	const titleTokens = [...new Set(title.toLowerCase().match(/[a-z]{4,}/g) ?? [])];
	if (titleTokens.length === 0) {
		return true;
	}
	return titleTokens.filter((token) => lower.includes(token)).length >= Math.min(2, titleTokens.length);
}

function formatIndexedFullText(text: string, url: string, sha256: string): string {
	const numbered = text
		.split("\n")
		.map((line, index) => `${index + 1}: ${line}`)
		.join("\n");
	return `FULL-TEXT SOURCE\nRetrieval URL: ${url}\nContent SHA-256: ${sha256}\nIndexed passages:\n${numbered}`;
}

/**
 * Remove obviously off-topic search results and rank the remainder before any source reaches the
 * literature model. The filter is deliberately lexical and conservative: formulas, multiple
 * shared topic terms, or one distinctive title term are required. Manually registered workspace
 * sources bypass this filter in {@link createWorkspaceLiteratureSourceLookup}.
 */
export function rankLiteratureSources(
	sources: readonly LiteratureSourceResult[],
	query: LiteratureSourceQuery,
): LiteratureSourceResult[] {
	const keywordTerms = extractMathKeywords([query.rootQuestion, query.pathTitle, query.pathObjective].join(" ")).join(
		" ",
	);
	const topicText = `${query.rootQuestion} ${query.pathTitle} ${query.pathObjective} ${inferKnownContextQuery(
		query.rootQuestion,
		keywordTerms,
	)} ${inferFormulaVocabulary(query.rootQuestion)}`;
	const topicTokens = relevantTokens(topicText);
	const topicExpressions = extractMathExpressions(topicText);
	const requiresNumberTheoryAlignment = isNumberTheoryTopic(
		`${query.rootQuestion} ${query.pathTitle} ${query.pathObjective}`,
	);
	return sources
		.map((source, index) =>
			scoreLiteratureSource(source, topicTokens, topicExpressions, requiresNumberTheoryAlignment, index),
		)
		.filter((candidate) => candidate.relevant)
		.sort((left, right) => right.score - left.score || left.index - right.index)
		.map((candidate) => candidate.source);
}

function selectProviderQueries(queries: readonly string[], rootQuestion: string): string[] {
	const candidates = [queries[0], queries.at(-1), normalizeQuery(rootQuestion)].filter(
		(value): value is string => !!value?.trim(),
	);
	return uniqueStrings(candidates).slice(0, MAX_PROVIDER_QUERIES);
}

function scoreLiteratureSource(
	source: LiteratureSourceResult,
	topicTokens: ReadonlySet<string>,
	topicExpressions: readonly string[],
	requiresNumberTheoryAlignment: boolean,
	index: number,
): { source: LiteratureSourceResult; score: number; relevant: boolean; index: number } {
	const titleTokens = relevantTokens(source.title);
	const sourceText = `${source.title} ${source.summary} ${source.extractedText ?? ""}`;
	const sourceTokens = relevantTokens(sourceText);
	const sharedTitleTokens = sharedTokens(topicTokens, titleTokens);
	const sharedSourceTokens = sharedTokens(topicTokens, sourceTokens);
	const sourceExpressions = extractMathExpressions(sourceText);
	const formulaMatch = topicExpressions.some((topicExpression) =>
		sourceExpressions.some(
			(sourceExpression) => topicExpression.includes(sourceExpression) || sourceExpression.includes(topicExpression),
		),
	);
	const distinctiveTitleMatch = sharedTitleTokens.some(
		(token) => token.length >= 6 && !GENERIC_RELEVANCE_TOKENS.has(token),
	);
	const topicMatch = formulaMatch || distinctiveTitleMatch || sharedSourceTokens.length >= 2;
	const domainAligned = !requiresNumberTheoryAlignment || formulaMatch || hasNumberTheoryAlignment(sourceText);
	const relevant = topicMatch && domainAligned;
	const sourceTypeScore =
		source.sourceType === "journal" || source.sourceType === "book"
			? 4
			: source.sourceType === "conference"
				? 3
				: source.sourceType === "preprint"
					? 1
					: 0;
	const citationScore = source.citationCount ? Math.min(4, Math.log10(source.citationCount + 1)) : 0;
	return {
		source,
		index,
		relevant,
		score:
			(formulaMatch ? 100 : 0) +
			sharedTitleTokens.length * 12 +
			sharedSourceTokens.length * 3 +
			sourceTypeScore +
			citationScore,
	};
}

function isNumberTheoryTopic(text: string): boolean {
	if (/\b(?:number theory|number-theoretic|diophantine|congruences?|divisors?|factorizations?|sieve)\b/i.test(text)) {
		return true;
	}
	return (
		/\bprimes?\b/i.test(text) &&
		(/\b(?:arithmetic|integer|quadratic|residue|values?)\b/i.test(text) ||
			/\bprimes?\s+(?:of|in|between)\b/i.test(text) ||
			extractMathExpressions(text).length > 0)
	);
}

function hasNumberTheoryAlignment(text: string): boolean {
	if (/\b(?:number theory|number-theoretic)\b/i.test(text)) {
		return true;
	}
	const tokens = significantContentTokens(text);
	const primaryCount = sharedTokens(NUMBER_THEORY_PRIMARY_TOKENS, tokens).length;
	const supportCount = sharedTokens(NUMBER_THEORY_SUPPORT_TOKENS, tokens).length;
	return primaryCount >= 2 || (primaryCount >= 1 && supportCount >= 1);
}

function relevantTokens(text: string): Set<string> {
	return new Set([...significantContentTokens(text)].filter((token) => !GENERIC_RELEVANCE_TOKENS.has(token)));
}

function sharedTokens(left: ReadonlySet<string>, right: ReadonlySet<string>): string[] {
	return [...left].filter((token) => right.has(token));
}

function inferFormulaVocabulary(text: string): string {
	const terms: string[] = [];
	if (/\^[{]?2[}]?|²/.test(text)) {
		terms.push("quadratic polynomial");
	}
	if (/\^[{]?3[}]?|³/.test(text)) {
		terms.push("cubic polynomial");
	}
	return terms.join(" ");
}

function createProviderAdapters(): Array<
	(query: string, limit: number, timeoutMs: number) => Promise<ProviderSearchOutput>
> {
	const providers = [searchArxiv, searchSemanticScholar, searchCrossref];
	if (getOpenAlexApiKey()) {
		providers.push(searchOpenAlex);
	}
	return providers;
}

async function searchArxiv(query: string, limit: number, timeoutMs: number): Promise<ProviderSearchOutput> {
	const params = new URLSearchParams({
		search_query: `all:${query}`,
		start: "0",
		max_results: String(limit),
		sortBy: "relevance",
		sortOrder: "descending",
	});
	return runProviderSearch("arxiv", query, async () => {
		const xml = await fetchText(`https://export.arxiv.org/api/query?${params.toString()}`, timeoutMs);
		return parseArxivEntries(xml).slice(0, limit);
	});
}

async function searchSemanticScholar(query: string, limit: number, timeoutMs: number): Promise<ProviderSearchOutput> {
	const params = new URLSearchParams({
		query,
		limit: String(limit),
		fields: [
			"title",
			"authors",
			"year",
			"abstract",
			"url",
			"venue",
			"externalIds",
			"citationCount",
			"publicationDate",
			"publicationTypes",
		].join(","),
	});
	const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
	return runProviderSearch("semantic-scholar", query, async () => {
		const json = await fetchJson(
			`https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`,
			timeoutMs,
			{
				...(apiKey ? { "x-api-key": apiKey } : {}),
			},
		);
		return parseSemanticScholarResponse(json).slice(0, limit);
	});
}

async function searchCrossref(query: string, limit: number, timeoutMs: number): Promise<ProviderSearchOutput> {
	const params = new URLSearchParams({
		"query.bibliographic": query,
		rows: String(limit),
		select:
			"DOI,title,author,published-print,published-online,container-title,abstract,URL,type,is-referenced-by-count",
	});
	if (process.env.CROSSREF_MAILTO) {
		params.set("mailto", process.env.CROSSREF_MAILTO);
	}
	return runProviderSearch("crossref", query, async () => {
		const json = await fetchJson(`https://api.crossref.org/works?${params.toString()}`, timeoutMs);
		return parseCrossrefResponse(json).slice(0, limit);
	});
}

async function searchOpenAlex(query: string, limit: number, timeoutMs: number): Promise<ProviderSearchOutput> {
	const params = new URLSearchParams({
		search: query,
		"per-page": String(limit),
		select:
			"id,doi,title,display_name,authorships,publication_year,publication_date,primary_location,abstract_inverted_index,cited_by_count,type",
	});
	const apiKey = getOpenAlexApiKey();
	if (apiKey) {
		params.set("api_key", apiKey);
	}
	if (process.env.OPENALEX_MAILTO) {
		params.set("mailto", process.env.OPENALEX_MAILTO);
	}
	return runProviderSearch("openalex", query, async () => {
		const json = await fetchJson(`https://api.openalex.org/works?${params.toString()}`, timeoutMs);
		return parseOpenAlexResponse(json).slice(0, limit);
	});
}

async function runProviderSearch(
	provider: LiteratureSourceProvider,
	query: string,
	search: () => Promise<LiteratureSourceResult[]>,
): Promise<ProviderSearchOutput> {
	try {
		return { provider, query, sources: await search(), status: "completed" };
	} catch (error) {
		return { provider, query, sources: [], status: "failed", error: errorMessage(error) };
	}
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
	const response = await fetchWithTimeout(url, timeoutMs);
	return response.text();
}

async function fetchJson(url: string, timeoutMs: number, headers?: Record<string, string>): Promise<unknown> {
	const response = await fetchWithTimeout(url, timeoutMs, headers);
	return response.json() as Promise<unknown>;
}

async function fetchWithTimeout(url: string, timeoutMs: number, headers?: Record<string, string>): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, { signal: controller.signal, headers });
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		return response;
	} finally {
		clearTimeout(timeout);
	}
}

function parseArxivEntries(xml: string): LiteratureSourceResult[] {
	return matchAll(xml, /<entry>([\s\S]*?)<\/entry>/g).flatMap((entry) => {
		const title = xmlText(tagContent(entry, "title"));
		const summary = xmlText(tagContent(entry, "summary"));
		const id = xmlText(tagContent(entry, "id"));
		if (!title || !summary) {
			return [];
		}
		const publishedAt = xmlText(tagContent(entry, "published"));
		const externalId = arxivIdFromUrl(id);
		return [
			{
				title,
				provider: "arxiv",
				externalId,
				url: id || undefined,
				kind: "paper",
				sourceType: "preprint",
				authors: matchAll(entry, /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g).map(xmlText),
				year: publishedAt.slice(0, 4) || undefined,
				publishedAt: publishedAt || undefined,
				summary,
			},
		];
	});
}

function parseSemanticScholarResponse(value: unknown): LiteratureSourceResult[] {
	const data = getArray((value as Record<string, unknown> | undefined)?.data);
	return data.flatMap((record) => {
		const title = getString(record.title);
		const summary = getString(record.abstract);
		if (!title || !summary) {
			return [];
		}
		const externalIds = getRecord(record.externalIds);
		const doi = getString(externalIds?.DOI);
		const arxiv = getString(externalIds?.ArXiv);
		return [
			{
				title,
				provider: "semantic-scholar",
				externalId: arxiv || doi || undefined,
				doi: doi || undefined,
				url: getString(record.url) || undefined,
				kind: "paper",
				sourceType: inferSourceTypeFromValues(getStringArray(record.publicationTypes), getString(record.venue)),
				authors: getArray(record.authors)
					.map((author) => getString(author.name))
					.filter(isNonEmptyString),
				year: numberToString(record.year),
				venue: getString(record.venue) || undefined,
				publishedAt: getString(record.publicationDate) || undefined,
				citationCount: getFiniteNumber(record.citationCount),
				summary,
			},
		];
	});
}

function parseCrossrefResponse(value: unknown): LiteratureSourceResult[] {
	const message = getRecord((value as Record<string, unknown> | undefined)?.message);
	const items = getArray(message?.items);
	return items.flatMap((record) => {
		const title = getStringArray(record.title)[0] ?? "";
		const summary = stripHtml(getString(record.abstract));
		if (!title) {
			return [];
		}
		const doi = getString(record.DOI);
		const publishedAt =
			datePartsToDate(getRecord(record["published-print"])) ??
			datePartsToDate(getRecord(record["published-online"]));
		return [
			{
				title,
				provider: "crossref",
				externalId: doi || undefined,
				doi: doi || undefined,
				url: getString(record.URL) || (doi ? `https://doi.org/${doi}` : undefined),
				kind: "paper",
				sourceType: inferCrossrefSourceType(getString(record.type)),
				authors: getArray(record.author)
					.map((author) => [getString(author.given), getString(author.family)].filter(Boolean).join(" "))
					.filter(isNonEmptyString),
				year: publishedAt?.slice(0, 4),
				venue: getStringArray(record["container-title"])[0],
				publishedAt,
				citationCount: getFiniteNumber(record["is-referenced-by-count"]),
				summary: summary || "Crossref metadata record; no abstract was provided.",
			},
		];
	});
}

function parseOpenAlexResponse(value: unknown): LiteratureSourceResult[] {
	const results = getArray((value as Record<string, unknown> | undefined)?.results);
	return results.flatMap((record) => {
		const title = getString(record.title) || getString(record.display_name);
		if (!title) {
			return [];
		}
		const primaryLocation = getRecord(record.primary_location);
		const source = getRecord(primaryLocation?.source);
		const doi = normalizeDoi(getString(record.doi));
		const abstract = abstractFromOpenAlexInvertedIndex(record.abstract_inverted_index);
		return [
			{
				title,
				provider: "openalex",
				externalId: getString(record.id) || doi || undefined,
				doi: doi || undefined,
				url: doi ? `https://doi.org/${doi}` : getString(record.id) || undefined,
				kind: "paper",
				sourceType: inferOpenAlexSourceType(getString(record.type)),
				authors: getArray(record.authorships)
					.map((authorship) => getString(getRecord(authorship.author)?.display_name))
					.filter(isNonEmptyString),
				year: numberToString(record.publication_year),
				venue: getString(source?.display_name) || undefined,
				publishedAt: getString(record.publication_date) || undefined,
				citationCount: getFiniteNumber(record.cited_by_count),
				summary: abstract || "OpenAlex metadata record; no abstract was provided.",
			},
		];
	});
}

function literatureSourceArtifactToResult(source: LiteratureSourceArtifact): LiteratureSourceResult {
	return {
		id: source.id,
		title: source.title,
		kind: source.kind,
		...(source.url ? { url: source.url } : {}),
		...(source.path ? { path: source.path } : {}),
		...(source.provider ? { provider: source.provider } : { provider: "workspace" as const }),
		...(source.externalId ? { externalId: source.externalId } : {}),
		...(source.doi ? { doi: source.doi } : {}),
		...(source.venue ? { venue: source.venue } : {}),
		...(source.publishedAt ? { publishedAt: source.publishedAt } : {}),
		...(source.citationCount !== undefined ? { citationCount: source.citationCount } : {}),
		...(source.sourceType ? { sourceType: source.sourceType } : {}),
		summary: source.summary,
		...(source.extractedText ? { extractedText: source.extractedText } : {}),
		authors: source.authors,
		...(source.year ? { year: source.year } : {}),
		...(source.workspaceRole ? { workspaceRole: source.workspaceRole } : {}),
		citationEligibility: citationEligibilityForWorkspaceRole(source.workspaceRole),
		...(source.sourceIndexId ? { sourceIndexId: source.sourceIndexId } : {}),
		...(source.sourceRevisionId ? { sourceRevisionId: source.sourceRevisionId } : {}),
		...(source.sourceRelativePath ? { sourceRelativePath: source.sourceRelativePath } : {}),
		...(source.sourceFileSha256 ? { sourceFileSha256: source.sourceFileSha256 } : {}),
	};
}

export function citationEligibilityForWorkspaceRole(
	role: CoMathWorkspaceSourceRole | undefined,
): CoMathSourceCitationEligibility {
	return role === "snapshot-metadata" || role === "compiled-binary" ? "inventory-only" : "citable";
}

function compareWorkspaceSourceResults(left: LiteratureSourceResult, right: LiteratureSourceResult): number {
	return (
		workspaceSourceRank(left.workspaceRole) - workspaceSourceRank(right.workspaceRole) ||
		left.title.localeCompare(right.title)
	);
}

function workspaceSourceRank(role: CoMathWorkspaceSourceRole | undefined): number {
	if (role === "primary-text") return 0;
	if (role === "curated-summary") return 1;
	if (role === undefined) return 2;
	if (role === "bibliographic-metadata") return 3;
	return 4;
}

function uniqueLiteratureSources(sources: readonly LiteratureSourceResult[]): LiteratureSourceResult[] {
	const seen = new Set<string>();
	return sources.filter((source) => {
		const key = literatureSourceDedupKey(source);
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

function literatureSourceDedupKey(source: LiteratureSourceResult): string {
	if (source.doi) return `doi:${normalizeDoi(source.doi)}`;
	if (source.provider && source.externalId) return `${source.provider}:${source.externalId.trim().toLowerCase()}`;
	if (source.url) return `url:${source.url.trim().toLowerCase()}`;
	if (source.path) return `path:${source.path.trim().toLowerCase()}`;
	return `title:${source.title.replace(/\s+/g, " ").trim().toLowerCase()}`;
}

function extractMathKeywords(value: string): string[] {
	const normalized = value
		.toLowerCase()
		.replace(/n\^2/g, "n squared")
		.replace(/[^a-z0-9+\s-]/g, " ");
	const stopwords = new Set(["are", "there", "with", "from", "form", "path", "this", "that", "the", "and", "for"]);
	const tokens = normalized
		.split(/\s+/)
		.map((token) => token.trim())
		.filter((token) => token.length > 2 && !stopwords.has(token));
	return uniqueStrings(tokens).slice(0, 10);
}

function compactLiteratureSearchSeed(value: string): string {
	const normalized = normalizeQuery(value);
	if (normalized.length <= 240) return normalized;
	const words = normalized
		.toLowerCase()
		.replace(/\\[a-zA-Z]+/g, " ")
		.match(/[a-z][a-z0-9-]{3,}/g);
	if (!words) return normalized.slice(0, 240).trim();
	const counts = new Map<string, { count: number; first: number }>();
	for (const [index, word] of words.entries()) {
		if (GENERIC_RELEVANCE_TOKENS.has(word)) continue;
		const existing = counts.get(word);
		counts.set(word, existing ? { ...existing, count: existing.count + 1 } : { count: 1, first: index });
	}
	const selected = [...counts.entries()]
		.sort(
			([leftWord, left], [rightWord, right]) =>
				right.count - left.count ||
				Math.min(rightWord.length, 12) - Math.min(leftWord.length, 12) ||
				left.first - right.first,
		)
		.slice(0, 10)
		.sort(([, left], [, right]) => left.first - right.first)
		.map(([word]) => word);
	return selected.join(" ") || normalized.slice(0, 240).trim();
}

function inferKnownContextQuery(rootQuestion: string, keywordTerms: string): string {
	if (/n\s*(?:\^2|squared)\s*\+\s*1/i.test(rootQuestion)) {
		return "Landau problem prime values n^2 + 1";
	}
	return keywordTerms;
}

function normalizeQuery(value: string): string {
	return value
		.replace(/[“”]/g, '"')
		.replace(/[’]/g, "'")
		.replace(/[?!.:,;]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function formatProviderName(provider: LiteratureSourceProvider): string {
	if (provider === "arxiv") return "arXiv";
	if (provider === "semantic-scholar") return "Semantic Scholar";
	if (provider === "crossref") return "Crossref";
	if (provider === "openalex") return "OpenAlex";
	if (provider === "workspace") return "workspace";
	if (provider === "user-provided") return "user-provided";
	return "unknown";
}

function getOpenAlexApiKey(): string | undefined {
	return process.env.OPENALEX_API_KEY || process.env.PI_OPENALEX_API_KEY || undefined;
}

function matchAll(value: string, pattern: RegExp): string[] {
	return [...value.matchAll(pattern)].map((match) => match[1] ?? "");
}

function tagContent(value: string, tagName: string): string {
	const match = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`).exec(value);
	return match?.[1] ?? "";
}

function xmlText(value: string): string {
	return decodeXmlEntities(stripHtml(value).replace(/\s+/g, " ").trim());
}

function decodeXmlEntities(value: string): string {
	return value
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

function stripHtml(value: string): string {
	return value
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function arxivIdFromUrl(value: string): string | undefined {
	const match = /\/abs\/([^/?#]+)/.exec(value);
	return match?.[1];
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return undefined;
}

function getArray(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.filter((item): item is Record<string, unknown> => getRecord(item) !== undefined)
		: [];
}

function getString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function getStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.map(getString).filter(isNonEmptyString);
}

function getFiniteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numberToString(value: unknown): string | undefined {
	return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

function isNonEmptyString(value: string): boolean {
	return value.trim().length > 0;
}

function uniqueStrings(values: readonly string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of values) {
		const normalized = value.replace(/\s+/g, " ").trim();
		const key = normalized.toLowerCase();
		if (normalized && !seen.has(key)) {
			seen.add(key);
			result.push(normalized);
		}
	}
	return result;
}

function datePartsToDate(record: Record<string, unknown> | undefined): string | undefined {
	const dateParts = record?.["date-parts"];
	if (!Array.isArray(dateParts) || !Array.isArray(dateParts[0])) {
		return undefined;
	}
	const [year, month, day] = dateParts[0];
	if (typeof year !== "number") {
		return undefined;
	}
	return [
		year,
		typeof month === "number" ? String(month).padStart(2, "0") : undefined,
		typeof day === "number" ? String(day).padStart(2, "0") : undefined,
	]
		.filter(Boolean)
		.join("-");
}

function normalizeDoi(value: string): string {
	return value.replace(/^https?:\/\/doi\.org\//i, "").trim();
}

function abstractFromOpenAlexInvertedIndex(value: unknown): string | undefined {
	const record = getRecord(value);
	if (!record) {
		return undefined;
	}
	const words: Array<{ word: string; index: number }> = [];
	for (const [word, positions] of Object.entries(record)) {
		if (!Array.isArray(positions)) {
			continue;
		}
		for (const position of positions) {
			if (typeof position === "number") {
				words.push({ word, index: position });
			}
		}
	}
	return words
		.sort((left, right) => left.index - right.index)
		.map((entry) => entry.word)
		.join(" ")
		.trim();
}

function inferSourceTypeFromValues(publicationTypes: readonly string[], venue: string): LiteratureSourceType {
	const joined = `${publicationTypes.join(" ")} ${venue}`.toLowerCase();
	if (joined.includes("conference")) return "conference";
	if (joined.includes("book")) return "book";
	if (venue) return "journal";
	return "unknown";
}

function inferCrossrefSourceType(value: string): LiteratureSourceType {
	if (value.includes("journal")) return "journal";
	if (value.includes("conference")) return "conference";
	if (value.includes("book")) return "book";
	return "unknown";
}

function inferOpenAlexSourceType(value: string): LiteratureSourceType {
	if (value.includes("preprint")) return "preprint";
	if (value.includes("book")) return "book";
	if (value.includes("proceedings")) return "conference";
	if (value) return "journal";
	return "unknown";
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
