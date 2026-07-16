import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
	enrichLiteratureSourcesWithFullText,
	type LiteratureSourceResult,
	prepareLiteratureSourceForCatalog,
} from "../../../src/modes/comath/comath-literature-source.ts";
import { parseTaskClaims, validateTaskClaims } from "../../../src/modes/comath/comath-task-claims.ts";
import { recordExternalLiteratureSources } from "../../../src/modes/comath/comath-task-engine.ts";
import { formatExternalLiteratureSearch } from "../../../src/modes/comath/comath-task-source-context.ts";
import type { CoMathProjectState } from "../../../src/modes/comath/schema.ts";
import { createEmptyProjectState } from "../../../src/modes/comath/storage.ts";

function metadataSource(): LiteratureSourceResult {
	return {
		title: "Exact Certificates for Algebraic Structures",
		url: "https://arxiv.org/abs/2401.01234v2",
		provider: "arxiv",
		externalId: "2401.01234v2",
		summary: "Metadata-only abstract.",
	};
}

describe("literature full-text escalation", () => {
	it("escalates arXiv metadata to indexed, hashed theorem text", async () => {
		const calls: string[] = [];
		const body = `<html><body><h1>Exact Certificates for Algebraic Structures</h1>${"<p>Introduction and mathematical construction with precise hypotheses.</p>".repeat(
			40,
		)}<h2>Theorem 1</h2><p>Every exact certificate has the stated algebraic structure.</p><h2>Proof</h2><p>The construction and its inverse establish the claim.</p></body></html>`;
		const [result] = await enrichLiteratureSourcesWithFullText([metadataSource()], {
			fetchFn: async (url) => {
				calls.push(url);
				if (url.startsWith("https://arxiv.org/html/")) {
					return new Response("not available", { status: 404 });
				}
				return new Response(body, { headers: { "content-type": "text/html" } });
			},
		});

		expect(calls).toEqual([
			"https://arxiv.org/html/2401.01234",
			"https://export.arxiv.org/e-print/2401.01234",
			"https://ar5iv.labs.arxiv.org/html/2401.01234",
		]);
		expect(result?.url).toBe("https://ar5iv.labs.arxiv.org/html/2401.01234");
		expect(result?.sourceFileSha256).toMatch(/^[a-f0-9]{64}$/);
		expect(result?.extractedText).toContain("FULL-TEXT SOURCE");
		expect(result?.extractedText).toContain("Indexed passages:");
		expect(result?.extractedText).toContain("Theorem 1");
		expect(prepareLiteratureSourceForCatalog(result!).extractedText).toContain("FULL-TEXT SOURCE");

		const search = { sources: [result!], providers: [], queries: ["exact certificates"], candidateCount: 1 };
		expect(formatExternalLiteratureSearch(search)).toContain("FULL-TEXT SOURCE");
		const [claim] = await validateTaskClaims(
			{ literatureSources: [], sourceIndexes: [] } as unknown as CoMathProjectState,
			parseTaskClaims("## Claims\n- [source-backed] The theorem is exact. [arxiv:2401.01234v2, lines 42-43]"),
			search,
		);
		expect(claim?.status).toBe("validated");
		expect(claim?.groundings[0]?.excerpt).toContain("42:");
		expect(claim?.groundings[0]?.locator).toMatchObject({
			kind: "external-record",
			lines: { start: 42, end: 43 },
		});
	});

	it("keeps a candidate metadata-only when bounded routes lack theorem text", async () => {
		const original = metadataSource();
		const calls: string[] = [];
		const [result] = await enrichLiteratureSourcesWithFullText([original], {
			fetchFn: async (url) => {
				calls.push(url);
				return new Response("<html><body>Abstract and citation metadata only.</body></html>", {
					headers: { "content-type": "text/html" },
				});
			},
		});

		expect(calls).toEqual([
			"https://arxiv.org/html/2401.01234",
			"https://export.arxiv.org/e-print/2401.01234",
			"https://ar5iv.labs.arxiv.org/html/2401.01234",
			"https://arxiv.org/abs/2401.01234v2",
		]);
		expect(result).toEqual(original);
	});

	it("uses an equivalent persisted arXiv identity to upgrade Crossref metadata", async () => {
		const calls: string[] = [];
		const body = `<html><body><h1>Exact Certificates for Algebraic Structures</h1>${"<p>Definitions and exact hypotheses.</p>".repeat(
			60,
		)}<h2>Theorem 2</h2><p>The certificate is exact.</p><h2>Proof</h2><p>The inverse construction proves it.</p></body></html>`;
		const crossref: LiteratureSourceResult = {
			title: "Exact Certificates for Algebraic Structures",
			provider: "crossref",
			doi: "10.1000/exact",
			summary: "Metadata-only record.",
		};
		const persistedIdentity: LiteratureSourceResult = {
			...metadataSource(),
			extractedText: `FULL-TEXT SOURCE\nExact Certificates for Algebraic Structures\nTheorem and Proof\n${"Damaged equation extraction. ".repeat(100)}`,
		};
		const [result] = await enrichLiteratureSourcesWithFullText([crossref, persistedIdentity], {
			fetchFn: async (url) => {
				calls.push(url);
				if (!url.startsWith("https://ar5iv.labs.arxiv.org/")) return new Response("unavailable", { status: 404 });
				return new Response(body, { headers: { "content-type": "text/html" } });
			},
		});

		expect(calls).toEqual([
			"https://doi.org/10.1000%2Fexact",
			"https://arxiv.org/html/2401.01234",
			"https://export.arxiv.org/e-print/2401.01234",
			"https://ar5iv.labs.arxiv.org/html/2401.01234",
		]);
		expect(result?.url).toBe("https://ar5iv.labs.arxiv.org/html/2401.01234");
		expect(result?.extractedText).toContain("Theorem 2");
	});

	it("extracts exact theorem text from an arXiv source archive", async () => {
		const tex = String.raw`\title{Exact Certificates for Algebraic Structures}
\begin{theorem}For integers n with n < r, equation (8) is exact.\end{theorem}
\begin{proof}The exact source computation proves the assertion.\end{proof}
${"Exact mathematical source context. ".repeat(100)}`;
		const content = Buffer.from(tex);
		const header = Buffer.alloc(512);
		header.write("main.tex", 0, "utf8");
		header.write(content.length.toString(8).padStart(11, "0"), 124, "ascii");
		const padding = Buffer.alloc(Math.ceil(content.length / 512) * 512 - content.length);
		const archive = gzipSync(Buffer.concat([header, content, padding, Buffer.alloc(1_024)]));
		const calls: string[] = [];
		const [result] = await enrichLiteratureSourcesWithFullText([metadataSource()], {
			fetchFn: async (url) => {
				calls.push(url);
				if (url.startsWith("https://arxiv.org/html/")) return new Response("unavailable", { status: 404 });
				return new Response(archive, { headers: { "content-type": "application/gzip" } });
			},
		});

		expect(calls).toEqual(["https://arxiv.org/html/2401.01234", "https://export.arxiv.org/e-print/2401.01234"]);
		expect(result?.url).toBe("https://export.arxiv.org/e-print/2401.01234");
		expect(result?.extractedText).toContain("n < r");
		expect(result?.extractedText).toContain("equation (8) is exact");
	});

	it("persists enriched candidates as citable durable sources", () => {
		const state = createEmptyProjectState({
			projectId: "full-text-persistence",
			title: "Current problem",
			rootQuestion: "What does the theorem prove?",
			now: "2026-07-15T00:00:00.000Z",
		});
		const source = {
			...metadataSource(),
			extractedText: "FULL-TEXT SOURCE\n1: Theorem 1. Exact statement.",
			sourceFileSha256: "a".repeat(64),
		};
		const metadataPersisted = recordExternalLiteratureSources(state, [metadataSource()], "2026-07-15T00:00:30.000Z");
		expect(metadataPersisted.literatureSources[0]?.citationEligibility).toBe("inventory-only");
		const persisted = recordExternalLiteratureSources(metadataPersisted, [source], "2026-07-15T00:01:00.000Z");

		expect(persisted.literatureSources).toHaveLength(1);
		expect(persisted.literatureSources[0]).toMatchObject({
			title: source.title,
			extractedText: source.extractedText,
			citationEligibility: "citable",
			sourceFileSha256: source.sourceFileSha256,
		});
		expect(
			recordExternalLiteratureSources(persisted, [source], "2026-07-15T00:02:00.000Z").literatureSources,
		).toHaveLength(1);
	});
});
