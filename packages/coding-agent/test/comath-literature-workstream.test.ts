import { describe, expect, it } from "vitest";
import type { ResearchPath } from "../examples/extensions/co-math/schema.ts";
import type {
	LiteratureSourceLookup,
	LiteratureSourceQuery,
	LiteratureSourceResult,
} from "../src/modes/comath/comath-literature-source.ts";
import { runLiteratureResearchWorkstreamStaged } from "../src/modes/comath/comath-literature-workstream.ts";
import type {
	ResearchWorkstreamModelExecutor,
	ResearchWorkstreamModelRequest,
} from "../src/modes/comath/comath-research-model-workstream.ts";

const TWIN_PRIME_QUESTION = "Are there infinitely many twin primes?";

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

describe("literature research workstream", () => {
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
				maxSources: 5,
			},
		]);
		expect(events).toContain("start:literature-search");
		expect(events).toContain("complete:literature-search");
		expect(requests.map((request) => request.role)).toEqual(["specialist", "critic", "synthesizer"]);
		expect(requests[0]?.prompt).toContain("[source-1] Twin prime conjecture status note");
		expect(requests[0]?.prompt).toContain("Bounded gaps between primes");
		expect(requests[1]?.prompt).toContain("Flag unsupported claims");
		expect(requests[2]?.prompt).toContain("Do not fabricate citations");

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
		expect(result.report.findings.join("\n")).toContain("No source lookup backend returned references");
		expect(result.report.findings.join("\n")).not.toContain("Chen");
		expect(result.report.findings.join("\n")).not.toContain("Maynard");
		expect(result.claimSupports).toEqual([
			{
				claim: "No source-backed theorem claim is established for this path yet.",
				sourceIds: [],
				status: "unsupported",
				note: "Source-backed literature support is still needed before citing named theorems as established context.",
			},
		]);
	});
});
