import { describe, expect, it } from "vitest";
import {
	formatCanonicalCoMathSourceCitation,
	parseCoMathSourceCitations,
} from "../src/modes/comath/comath-source-citations.ts";

describe("co-math local source citations", () => {
	it("parses canonical and bounded human-readable exact line forms", () => {
		const citations = parseCoMathSourceCitations(
			"[source-6@L1489-L1502|claim=formal-document] [source-6, lines 1517–1552] [source-2: L1-L2]",
		);
		expect(citations).toEqual([
			{
				sourceId: "source-6",
				lines: { start: 1489, end: 1502 },
				explicitClaimScope: "formal-document",
				raw: "[source-6@L1489-L1502|claim=formal-document]",
				syntax: "canonical",
			},
			{
				sourceId: "source-6",
				lines: { start: 1517, end: 1552 },
				raw: "[source-6, lines 1517–1552]",
				syntax: "lines-label",
			},
			{
				sourceId: "source-2",
				lines: { start: 1, end: 2 },
				raw: "[source-2: L1-L2]",
				syntax: "compact-lines",
			},
		]);
	});

	it("leaves bare, malformed, reversed, and unbracketed references ungrounded", () => {
		expect(
			parseCoMathSourceCitations("[source-6] [source-6, lines 4-3] source-6, lines 4-6 [source-6@L0-L2]"),
		).toEqual([]);
	});

	it("formats a resolved citation canonically", () => {
		expect(
			formatCanonicalCoMathSourceCitation({
				sourceId: "source-6",
				lines: { start: 1489, end: 1502 },
				claimScope: "formal-document",
				regionKind: "formal-document",
				excerpt: "",
				excerptSha256: "digest",
				canonicalText: "",
			}),
		).toBe("[source-6@L1489-L1502|claim=formal-document]");
	});

	it("splits semicolon-separated bracket citations without treating commas as separators", () => {
		expect(
			parseCoMathSourceCitations("[source-6, lines 1897–1935; source-6@L355-L364|claim=formal-document]"),
		).toMatchObject([
			{ sourceId: "source-6", lines: { start: 1897, end: 1935 } },
			{ sourceId: "source-6", lines: { start: 355, end: 364 }, explicitClaimScope: "formal-document" },
		]);
	});

	it("carries an explicit source id across unambiguous semicolon-separated line ranges", () => {
		expect(parseCoMathSourceCitations("[source-6, lines 1240-1242; 1310-1325]")).toMatchObject([
			{ sourceId: "source-6", lines: { start: 1240, end: 1242 } },
			{ sourceId: "source-6", lines: { start: 1310, end: 1325 } },
		]);
	});
});
