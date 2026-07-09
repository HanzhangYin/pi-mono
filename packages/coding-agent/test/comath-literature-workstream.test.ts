import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	LiteratureSourceLookup,
	LiteratureSourceQuery,
	LiteratureSourceResult,
} from "../src/modes/comath/comath-literature-source.ts";
import {
	createDefaultLiteratureSourceLookup,
	normalizeLiteratureSourceLookupResult,
} from "../src/modes/comath/comath-literature-source.ts";
import { runLiteratureResearchWorkstreamStaged } from "../src/modes/comath/comath-literature-workstream.ts";
import type {
	ResearchWorkstreamModelExecutor,
	ResearchWorkstreamModelRequest,
} from "../src/modes/comath/comath-research-model-workstream.ts";
import type { ResearchPath } from "../src/modes/comath/schema.ts";

const TWIN_PRIME_QUESTION = "Are there infinitely many twin primes?";
const N_SQUARED_PLUS_ONE_QUESTION = "Are there infinitely many primes of the form n^2 + 1?";

function buildLiteraturePath(): ResearchPath {
	return {
		id: "path-5",
		title: "Known theorem or literature reduction",
		objective: "Identify whether known theorems settle, imply, or obstruct the twin-prime question.",
		status: "active",
		latestFindings: [],
		blockers: [],
		suggestedNextMove: "Use available source context first; state uncertainty rather than inventing references.",
		priority: 5,
		createdAt: "2026-06-05T12:00:00.000Z",
		updatedAt: "2026-06-05T12:00:00.000Z",
	};
}

function buildNSquaredPlusOneLiteraturePath(): ResearchPath {
	return {
		...buildLiteraturePath(),
		objective: "Identify whether known theorems settle, imply, or obstruct n^2 + 1 prime infinitude.",
	};
}

const TWIN_PRIME_SOURCES: LiteratureSourceResult[] = [
	{
		kind: "paper",
		title: "Twin prime conjecture status note",
		url: "https://example.test/twin-prime-status",
		summary: "A source stating that the twin-prime conjecture remains open.",
		extractedText: "The twin-prime conjecture remains open.",
	},
	{
		kind: "paper",
		title: "Bounded gaps between primes",
		url: "https://example.test/bounded-gaps",
		summary: "A source about bounded prime gaps.",
		extractedText: "Bounded gaps do not imply a gap exactly equal to 2.",
	},
	{
		kind: "paper",
		title: "Chen theorem summary",
		url: "https://example.test/chen-theorem",
		summary: "A source about Chen's theorem.",
		extractedText: "There are infinitely many primes p such that p + 2 is prime or semiprime.",
	},
];

const N_SQUARED_PLUS_ONE_SOURCES: LiteratureSourceResult[] = [
	{
		kind: "user-provided",
		title: "Test note on prime values of polynomials",
		summary:
			"Discusses Bunyakovsky/Schinzel-style conjectural context for prime values of polynomials; does not prove infinitude for n^2 + 1.",
		extractedText:
			"Schinzel's hypothesis H would imply many prime-value statements for suitable polynomials, but this is conjectural. This note does not prove that n^2 + 1 is prime infinitely often.",
	},
];

const N_SQUARED_PLUS_ONE_RESPONSES: Record<ResearchWorkstreamModelRequest["role"], string> = {
	specialist: [
		"## Source-backed status",
		"- The source discusses Schinzel-style conjectural context for prime values of polynomials. [source-1]",
		"## Conjectural or heuristic context",
		"- Schinzel's hypothesis H is conjectural in the supplied source. [source-1]",
		"## Unsupported or unresolved",
		"- The source does not prove that n^2 + 1 is prime infinitely often. [source-1]",
		"## Next",
		"- Keep the original claim unresolved and ask the coordinator what to try next.",
	].join("\n"),
	critic: [
		"## Review",
		"- The specialist correctly treats the source as conjectural context.",
		"## Unsupported or unresolved",
		"- No unconditional proof of n^2 + 1 prime infinitude appears in the source.",
		"## Gaps",
		"- A source-backed unconditional theorem is still missing.",
		"## Human help useful",
		"- A reference on Landau's problems would help.",
	].join("\n"),
	synthesizer: [
		"## Source-backed status",
		"- Source-backed context supports only conjectural prime-values-of-polynomials framing. [source-1]",
		"## Conjectural or heuristic context",
		"- Schinzel-style implications are conjectural, not unconditional proofs. [source-1]",
		"## Source-backed distinctions",
		"- Do not treat the original infinitude claim as proved.",
		"## Unsupported or unresolved",
		"- No source here proves infinitely many primes of the form n^2 + 1.",
		"## Human help useful",
		"- A source on Landau's fourth problem would help.",
		"## Next",
		"- Ask the coordinator what to try next.",
	].join("\n"),
};

const TWIN_PRIME_RESPONSES: Record<ResearchWorkstreamModelRequest["role"], string> = {
	specialist: [
		"## Findings",
		"- The twin-prime conjecture remains open. [source-1]",
		"- Bounded prime gaps are known but do not imply gaps exactly 2. [source-2]",
		"- Chen's theorem is related but weaker than twin-prime infinitude. [source-3]",
		"## Known results",
		"- Bounded-gap and Chen-type results are source-backed context, not a proof of twin-prime infinitude.",
		"## Unsupported or unclear",
		"- No source here proves infinitely many twin primes.",
		"## Next",
		"- Use these sources to revise weaker-target paths.",
	].join("\n"),
	critic: [
		"## Review",
		"- The findings correctly separate exact twin-prime infinitude from weaker results.",
		"## Unsupported or unclear",
		"- No source in this report proves the twin-prime conjecture.",
		"## Gaps",
		"- More exact theorem statements would help.",
		"## Human help useful",
		"- A number theorist could verify exact theorem statements.",
	].join("\n"),
	synthesizer: [
		"## Known results",
		"- The twin-prime conjecture remains open. [source-1]",
		"- Bounded prime gaps are known but do not imply gaps exactly 2. [source-2]",
		"- Chen's theorem gives a prime-or-semiprime alternative, not twin-prime infinitude. [source-3]",
		"## Findings",
		"- Source-backed context distinguishes exact twin-prime infinitude from weaker bounded-gap results. [source-1] [source-2]",
		"## Source-backed distinctions",
		"- Do not present bounded-gap or Chen-type results as a proof of the twin-prime conjecture.",
		"## Unsupported or unclear",
		"- No provided source proves infinitely many prime pairs at distance 2.",
		"## Human help useful",
		"- Exact theorem statements from a reference text would help.",
		"## Next",
		"- Use the literature findings to revise the direct-proof path or create a weaker bounded-gap path.",
		"## Working paper summary",
		"- The twin-prime conjecture remains open; related bounded-gap and Chen-type results are weaker.",
	].join("\n"),
};

function createLookup(sources: LiteratureSourceResult[]): {
	lookup: LiteratureSourceLookup;
	queries: LiteratureSourceQuery[];
} {
	const queries: LiteratureSourceQuery[] = [];
	return {
		queries,
		lookup: {
			search: async (query) => {
				queries.push(query);
				return sources;
			},
		},
	};
}

function createExecutor(): {
	executor: ResearchWorkstreamModelExecutor;
	requests: ResearchWorkstreamModelRequest[];
} {
	const requests: ResearchWorkstreamModelRequest[] = [];
	return {
		requests,
		executor: {
			run: async (request) => {
				requests.push(request);
				return { text: TWIN_PRIME_RESPONSES[request.role] };
			},
		},
	};
}

function createExecutorWithResponses(responses: Record<ResearchWorkstreamModelRequest["role"], string>): {
	executor: ResearchWorkstreamModelExecutor;
	requests: ResearchWorkstreamModelRequest[];
} {
	const requests: ResearchWorkstreamModelRequest[] = [];
	return {
		requests,
		executor: {
			run: async (request) => {
				requests.push(request);
				return { text: responses[request.role] };
			},
		},
	};
}

describe("literature research workstream", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("default lookup queries scholarly providers and deduplicates overlapping DOI records", async () => {
		const previousOpenAlexKey = process.env.OPENALEX_API_KEY;
		const previousPiOpenAlexKey = process.env.PI_OPENALEX_API_KEY;
		delete process.env.OPENALEX_API_KEY;
		delete process.env.PI_OPENALEX_API_KEY;
		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			if (url.startsWith("https://export.arxiv.org/api/query")) {
				return new Response(
					[
						'<?xml version="1.0" encoding="UTF-8"?>',
						"<feed>",
						"<entry>",
						"<id>https://arxiv.org/abs/2401.00001</id>",
						"<title>Prime values of quadratic polynomials</title>",
						"<summary>Survey context for prime values of quadratic polynomials.</summary>",
						"<published>2024-01-02T00:00:00Z</published>",
						"<author><name>A. Author</name></author>",
						"</entry>",
						"</feed>",
					].join(""),
					{ status: 200 },
				);
			}
			if (url.startsWith("https://api.semanticscholar.org/graph/v1/paper/search")) {
				return Response.json({
					data: [
						{
							title: "Landau fourth problem survey",
							abstract: "Discusses the open status of primes of the form n squared plus one.",
							url: "https://example.test/semantic-landau",
							venue: "Number Theory Surveys",
							year: 2022,
							externalIds: { DOI: "10.1000/landau" },
							citationCount: 7,
							authors: [{ name: "B. Scholar" }],
							publicationTypes: ["JournalArticle"],
						},
					],
				});
			}
			if (url.startsWith("https://api.crossref.org/works")) {
				return Response.json({
					message: {
						items: [
							{
								DOI: "10.1000/landau",
								title: ["Landau fourth problem survey"],
								abstract: "<jats:p>Crossref duplicate metadata.</jats:p>",
								URL: "https://doi.org/10.1000/landau",
								type: "journal-article",
								"container-title": ["Number Theory Surveys"],
								"is-referenced-by-count": 9,
								author: [{ given: "B.", family: "Scholar" }],
								"published-online": { "date-parts": [[2022, 3, 4]] },
							},
						],
					},
				});
			}
			return new Response("not found", { status: 404 });
		});
		vi.stubGlobal("fetch", fetchMock);
		try {
			const lookup = createDefaultLiteratureSourceLookup();
			const result = normalizeLiteratureSourceLookupResult(
				await lookup.search({
					rootQuestion: N_SQUARED_PLUS_ONE_QUESTION,
					pathTitle: "Known theorem or literature reduction",
					pathObjective: "Find source-backed context.",
					maxSources: 8,
				}),
			);

			expect(fetchMock).toHaveBeenCalledTimes(6);
			expect(result.candidateCount).toBe(6);
			expect(result.sources).toHaveLength(2);
			expect(result.providers).toHaveLength(6);
			expect(new Set(result.providers.map((provider) => provider.query)).size).toBe(2);
			expect(result.providers.every((provider) => provider.status === "completed")).toBe(true);
			expect(result.sources.map((source) => source.title)).toEqual([
				"Prime values of quadratic polynomials",
				"Landau fourth problem survey",
			]);
		} finally {
			if (previousOpenAlexKey === undefined) {
				delete process.env.OPENALEX_API_KEY;
			} else {
				process.env.OPENALEX_API_KEY = previousOpenAlexKey;
			}
			if (previousPiOpenAlexKey === undefined) {
				delete process.env.PI_OPENALEX_API_KEY;
			} else {
				process.env.PI_OPENALEX_API_KEY = previousPiOpenAlexKey;
			}
		}
	});

	it("passes fake sources into source-aware role prompts and returns source-linked supports", async () => {
		const { lookup, queries } = createLookup(TWIN_PRIME_SOURCES);
		const { executor, requests } = createExecutor();
		const path = buildLiteraturePath();
		const events: string[] = [];

		const result = await runLiteratureResearchWorkstreamStaged(
			{
				rootQuestion: TWIN_PRIME_QUESTION,
				path,
				allPaths: [path],
				now: "2026-06-05T12:30:00.000Z",
				executor,
				sourceLookup: lookup,
			},
			{
				onStageStarted: (stage) => {
					events.push(`start:${stage}`);
				},
				onStageCompleted: (stageResult) => {
					events.push(`complete:${stageResult.stage}`);
				},
			},
		);

		expect(queries).toEqual([
			{
				rootQuestion: TWIN_PRIME_QUESTION,
				pathTitle: "Known theorem or literature reduction",
				pathObjective: path.objective,
				maxSources: 8,
			},
		]);
		expect(events).toContain("start:literature-search");
		expect(events).toContain("complete:literature-search");
		expect(requests.map((request) => request.role)).toEqual(["specialist", "critic", "synthesizer"]);
		expect(requests[0]?.prompt).toContain("[source-1] Twin prime conjecture status note");
		expect(requests[0]?.prompt).toContain("Bounded gaps between primes");
		expect(requests[1]?.prompt).toContain("Flag unsupported claims");
		expect(requests[1]?.prompt).toContain("Separate unconditional theorem claims from conjectural claims");
		expect(requests[2]?.prompt).toContain("Do not fabricate citations");
		expect(requests[2]?.prompt).toContain("Conjectural or heuristic context");

		expect(result.sources).toHaveLength(3);
		expect(result.report.sourceIds).toEqual(["source-1", "source-2", "source-3"]);
		expect(result.report.findings.join("\n")).toContain("[source-1]");
		expect(result.report.findings.join("\n")).toContain("[source-2]");
		expect(result.claimSupports.some((support) => support.status === "supported")).toBe(true);
		expect(result.claimSupports.some((support) => support.sourceIds.includes("source-1"))).toBe(true);
		expect(result.report.gaps.join("\n")).toContain(
			"No provided source proves infinitely many prime pairs at distance 2",
		);
	});

	it("classifies n^2 + 1 fake-source context without treating conjectures as proof", async () => {
		const { lookup } = createLookup(N_SQUARED_PLUS_ONE_SOURCES);
		const { executor, requests } = createExecutorWithResponses(N_SQUARED_PLUS_ONE_RESPONSES);
		const path = buildNSquaredPlusOneLiteraturePath();

		const result = await runLiteratureResearchWorkstreamStaged(
			{
				rootQuestion: N_SQUARED_PLUS_ONE_QUESTION,
				path,
				allPaths: [path],
				now: "2026-06-05T12:30:00.000Z",
				executor,
				sourceLookup: lookup,
			},
			{},
		);

		expect(requests).toHaveLength(3);
		expect(requests[0]?.prompt).toContain("whether the source context treats the root question as open");
		expect(result.sources).toHaveLength(1);
		expect(result.report.sourceIds).toEqual(["source-1"]);
		expect(result.report.findings.join("\n")).toContain("Source-backed context was reviewed");
		expect(result.report.findings.join("\n")).toContain("No source in this run established an unconditional proof");
		expect(result.report.findings.join("\n")).toContain("Conjectural implications are not proofs");
		expect(result.report.findings.join("\n")).toContain("[source-1]");
		expect(result.claimSupports).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					status: "partially-supported",
					sourceIds: ["source-1"],
					claim: expect.stringContaining("source-backed context for this literature path"),
				}),
				expect.objectContaining({
					status: "unsupported",
					sourceIds: [],
					claim: expect.stringContaining("unconditional proof"),
				}),
			]),
		);
		expect(
			[...result.report.findings, ...result.report.promisingStrategy, ...result.report.criticisms].join("\n"),
		).not.toMatch(/\b(proves|proved|establishes) infinitely many primes of the form n\^2 \+ 1\b/i);
	});

	it("deduplicates source labels and extracts inline discipline blocks", async () => {
		const duplicateSources: LiteratureSourceResult[] = [
			{
				kind: "paper",
				title: "Repeated source title",
				url: "https://example.test/one",
				summary: "First copy.",
			},
			{
				kind: "paper",
				title: "Repeated source title",
				url: "https://example.test/two",
				summary: "Second copy.",
			},
		];
		const responses: Record<ResearchWorkstreamModelRequest["role"], string> = {
			specialist: [
				"## Source-backed status",
				"- The source gives related multivariable context. [source-1]",
				"## Unsupported or unresolved",
				"- No one-variable theorem is established. [source-1]",
				"## Next",
				"- Continue with a one-variable sieve check.",
			].join("\n"),
			critic: [
				"## Review",
				"- The multivariable theorem is not a direct proof.",
				"Theorem check:",
				"Theorem: Multivariable prime theorem.",
				"Object: n^2+1.",
				"Hypothesis: fixed one-variable slice is controlled - failed.",
				"Status: rejected-as-direct-route.",
				"Consequence: use it only as related context.",
				"Route change:",
				"From: use the multivariable theorem directly.",
				"To: seek one-variable-specific sieve evidence.",
				"Reason: fixed slices are not controlled.",
				"Negative constraints:",
				"Do not infer fixed one-variable prime infinitude from multivariable theorems.",
			].join("\n"),
			synthesizer: [
				"## Source-backed status",
				"- Source-backed context is related only. [source-1]",
				"## Source-backed distinctions",
				"- The related theorem does not imply the target.",
				"## Unsupported or unresolved",
				"- The one-variable target is unresolved here.",
				"## Next",
				"- Concrete replacement route:",
				"- Compute initial data for n^2+1.",
				"- Prove admissibility directly.",
			].join("\n"),
		};
		const { lookup } = createLookup(duplicateSources);
		const { executor } = createExecutorWithResponses(responses);
		const path = buildNSquaredPlusOneLiteraturePath();

		const result = await runLiteratureResearchWorkstreamStaged(
			{
				rootQuestion: N_SQUARED_PLUS_ONE_QUESTION,
				path,
				allPaths: [path],
				now: "2026-06-05T12:30:00.000Z",
				executor,
				sourceLookup: lookup,
			},
			{},
		);

		expect(result.sources).toHaveLength(1);
		expect(result.report.sourceIds).toEqual(["source-1"]);
		expect(result.report.suggestedNextMove).toBe("Compute initial data for n^2+1. Prove admissibility directly.");
		expect(result.report.theoremChecks).toEqual([
			expect.objectContaining({
				theorem: "Multivariable prime theorem.",
				status: "rejected-as-direct-route",
				consequence: "use it only as related context.",
			}),
		]);
		expect(result.report.routePivots).toEqual([
			{
				fromRoute: "use the multivariable theorem directly.",
				toRoute: "seek one-variable-specific sieve evidence.",
				reason: "fixed slices are not controlled.",
			},
		]);
		expect(result.report.negativeConstraints).toEqual([
			"Do not infer fixed one-variable prime infinitude from multivariable theorems.",
		]);
	});

	it("returns a safe unsupported report without model calls when no sources are available", async () => {
		const { lookup } = createLookup([]);
		const { executor, requests } = createExecutor();
		const path = buildLiteraturePath();

		const result = await runLiteratureResearchWorkstreamStaged(
			{
				rootQuestion: TWIN_PRIME_QUESTION,
				path,
				allPaths: [path],
				now: "2026-06-05T12:30:00.000Z",
				executor,
				sourceLookup: lookup,
			},
			{},
		);

		expect(requests).toEqual([]);
		expect(result.sources).toEqual([]);
		expect(result.report.status).toBe("blocked");
		expect(result.report.sourceIds).toEqual([]);
		expect(result.report.findings.join("\n")).toContain(
			"No source was available, so no theorem claim is established",
		);
		expect(result.report.findings.join("\n")).not.toContain("Chen");
		expect(result.report.findings.join("\n")).not.toContain("Maynard");
		expect(result.claimSupports).toEqual([
			{
				claim: "No source-backed theorem claim is established for this path yet.",
				sourceIds: [],
				status: "unsupported",
				note: "A source-backed literature check is needed before citing named theorems.",
			},
		]);
	});

	it("returns an actionable n^2 + 1 no-source Path 5 report", async () => {
		const { lookup } = createLookup([]);
		const { executor, requests } = createExecutor();
		const path = buildNSquaredPlusOneLiteraturePath();

		const result = await runLiteratureResearchWorkstreamStaged(
			{
				rootQuestion: N_SQUARED_PLUS_ONE_QUESTION,
				path,
				allPaths: [path],
				now: "2026-06-05T12:30:00.000Z",
				executor,
				sourceLookup: lookup,
			},
			{},
		);

		expect(requests).toEqual([]);
		expect(result.sources).toEqual([]);
		expect(result.report.status).toBe("blocked");
		expect(result.report.findings.join("\n")).toContain("No source was available");
		expect(result.report.findings.join("\n")).toContain(
			"Treat named theorems and conjectures as search targets only",
		);
		expect(result.report.findings.join("\n")).toContain("search targets only");
		expect(result.report.findings.join("\n")).toContain("No unconditional proof");
		expect(result.report.gaps.join("\n")).toContain("source-backed literature check");
		expect(result.report.gaps.join("\n")).toContain("Conjectural implications");
		expect(result.report.suggestedNextMove).toContain("Work the problem directly next");
		expect(result.claimSupports).toEqual([
			{
				claim: "No source-backed theorem claim is established for this path yet.",
				sourceIds: [],
				status: "unsupported",
				note: "A source-backed literature check is needed before citing named theorems.",
			},
		]);
	});
});
