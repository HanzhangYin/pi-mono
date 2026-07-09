import { extractMathExpressions, significantContentTokens } from "./comath-text-similarity.ts";
import type {
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
	"theorem",
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
}

export interface LiteratureSourceSearchResponse {
	sources: LiteratureSourceResult[];
	providers: LiteratureSearchProviderRecord[];
	queries: string[];
	candidateCount: number;
}

export type LiteratureSourceLookupResult = LiteratureSourceResult[] | LiteratureSourceSearchResponse;

export interface LiteratureSourceLookup {
	search(query: LiteratureSourceQuery): Promise<LiteratureSourceLookupResult>;
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
}): LiteratureSourceLookup {
	return {
		search: async (query) => {
			const registered = input.sources.map(literatureSourceArtifactToResult);
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
	const exactProblem = normalizeQuery(query.rootQuestion);
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

export function formatLiteratureSourceForPrompt(source: LiteratureSourceResult, index: number): string {
	const sourceId = `source-${index + 1}`;
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
		...(source.extractedText ? [`Extract: ${source.extractedText}`] : []),
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
		return {
			sources: rankLiteratureSources(uniqueLiteratureSources(candidateSources), query).slice(
				0,
				Math.max(1, query.maxSources || DEFAULT_REVIEW_LIMIT),
			),
			providers: providerRecords,
			queries,
			candidateCount: candidateSources.length,
		};
	}
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
	return sources
		.map((source, index) => scoreLiteratureSource(source, topicTokens, topicExpressions, index))
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
	const relevant = formulaMatch || distinctiveTitleMatch || sharedSourceTokens.length >= 2;
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
	};
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
