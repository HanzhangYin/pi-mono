import { describe, expect, it } from "vitest";
import {
	extractCoMathJsonObject,
	filterCoMathProductLines,
	firstCoMathMarkdownSectionItem,
	getCoMathMarkdownSectionItems,
	parseCoMathMarkdown,
	stripCoMathBulletMarker,
	stripCoMathJsonObjects,
} from "../src/modes/comath/comath-markdown.ts";

describe("co-math markdown parser", () => {
	it("parses headings and bullet items", () => {
		const parsed = parseCoMathMarkdown(
			["## Findings", "- First finding.", "- Second finding.", "## Next", "- Do the next thing."].join("\n"),
		);
		expect(parsed.sections.map((section) => section.heading)).toEqual(["Findings", "Next"]);
		expect(parsed.sections[0]?.items).toEqual(["First finding.", "Second finding."]);
		expect(parsed.sections[1]?.items).toEqual(["Do the next thing."]);
	});

	it("retrieves section items case-insensitively by heading substring", () => {
		const parsed = parseCoMathMarkdown(["## Promising Strategy", "- Use bounded checks."].join("\n"));
		expect(getCoMathMarkdownSectionItems(parsed, "promising")).toEqual(["Use bounded checks."]);
		expect(getCoMathMarkdownSectionItems(parsed, "STRATEGY")).toEqual(["Use bounded checks."]);
		expect(getCoMathMarkdownSectionItems(parsed, "missing")).toEqual([]);
		expect(firstCoMathMarkdownSectionItem(parsed, "promising")).toBe("Use bounded checks.");
		expect(firstCoMathMarkdownSectionItem(parsed, "missing")).toBeUndefined();
	});

	it("preserves every non-empty line as a raw entry", () => {
		const parsed = parseCoMathMarkdown(["Intro line.", "## Findings", "- A finding."].join("\n"));
		expect(parsed.raw).toEqual(["Intro line.", "A finding."]);
	});

	it("folds multi-line display math into one bullet instead of orphan delimiter bullets", () => {
		const parsed = parseCoMathMarkdown(
			["## Promising strategy", "- Study values of", "\\[", "n^2+1.", "\\]", "This is evidence, not a proof."].join(
				"\n",
			),
		);
		expect(parsed.sections[0]?.items).toEqual(["Study values of \\[ n^2+1. \\] This is evidence, not a proof."]);
		expect(parsed.sections[0]?.items.some((item) => item === "\\[" || item === "\\]")).toBe(false);
	});

	it("folds display math in loose-prose sections without orphan delimiter bullets", () => {
		// Models sometimes write a section as prose (no `- ` bullets) with display math on its own lines.
		const parsed = parseCoMathMarkdown(
			[
				"## Promising strategy",
				"Use small bounded computation for primes of the form",
				"\\[",
				"n^2+1.",
				"\\]",
				"This is useful as exploratory evidence.",
			].join("\n"),
		);
		const items = parsed.sections[0]?.items ?? [];
		expect(items.some((item) => item === "\\[" || item === "\\]" || item === "n^2+1.")).toBe(false);
		expect(items[0]).toBe("Use small bounded computation for primes of the form \\[ n^2+1. \\]");
		expect(items[1]).toBe("This is useful as exploratory evidence.");
	});

	it("folds an aligned environment with separate begin/end lines into one item", () => {
		const parsed = parseCoMathMarkdown(
			[
				"## Findings",
				"- Initial examples include:",
				"\\[",
				"\\begin{aligned}",
				"1^2+1 &= 2,\\\\",
				"2^2+1 &= 5.",
				"\\end{aligned}",
				"\\]",
			].join("\n"),
		);
		expect(parsed.sections[0]?.items).toHaveLength(1);
		expect(parsed.sections[0]?.items[0]).toContain("Initial examples include:");
		expect(parsed.sections[0]?.items[0]).toContain("\\begin{aligned}");
		expect(parsed.sections[0]?.items[0]).toContain("\\end{aligned}");
	});

	it("also folds display math separated from the bullet by a blank line", () => {
		const parsed = parseCoMathMarkdown(
			["## Findings", "- Initial examples:", "", "\\[", "1^2+1 = 2", "\\]"].join("\n"),
		);
		expect(parsed.sections[0]?.items).toEqual(["Initial examples: \\[ 1^2+1 = 2 \\]"]);
	});

	it("keeps loose prose lines separate when there is no preceding bullet", () => {
		const parsed = parseCoMathMarkdown(
			["## Coordinator brief", "The path should gather evidence.", "Finite search over an explicit range."].join(
				"\n",
			),
		);
		expect(parsed.sections[0]?.items).toEqual([
			"The path should gather evidence.",
			"Finite search over an explicit range.",
		]);
	});

	it("ignores blank lines and fenced code delimiters", () => {
		const parsed = parseCoMathMarkdown(["Finite search.", "", "```python", "print('hi')", "```"].join("\n"));
		expect(parsed.raw).toEqual(["Finite search.", "print('hi')"]);
	});

	it("strips assorted bullet markers", () => {
		expect(stripCoMathBulletMarker("- dash")).toBe("dash");
		expect(stripCoMathBulletMarker("* star")).toBe("star");
		expect(stripCoMathBulletMarker("1. numbered")).toBe("numbered");
		expect(stripCoMathBulletMarker("2) paren")).toBe("paren");
		expect(stripCoMathBulletMarker("plain text")).toBe("plain text");
	});

	it("extracts and strips only co-math action JSON objects", () => {
		const text = [
			"I need to craft a tool call.",
			'{"action":"record_claim","claim":"Finite checks found {2, 5}.","classification":"computation","rationale":"bounded"}',
			"## Findings",
			"- Keep the ordinary set {2, 5} in the report.",
		].join("\n");

		expect(extractCoMathJsonObject(text)).toMatchObject({
			action: "record_claim",
			claim: "Finite checks found {2, 5}.",
		});
		expect(stripCoMathJsonObjects(text)).toContain("Keep the ordinary set {2, 5} in the report.");
		expect(stripCoMathJsonObjects(text)).not.toContain('"action"');
		expect(filterCoMathProductLines(text.split("\n"))).toEqual([
			"## Findings",
			"- Keep the ordinary set {2, 5} in the report.",
		]);
	});
});
