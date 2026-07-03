/**
 * Shared markdown parsing for co-math research and coordinator workstreams.
 *
 * Several co-math modules ask a model for a markdown report with `##` headings and bullet points,
 * then read specific sections back out. This module is the single source of that parsing so a fix
 * (for example folding multi-line display math into one bullet) applies everywhere at once.
 */

export interface CoMathMarkdownSection {
	heading: string;
	items: string[];
}

export interface CoMathParsedMarkdown {
	sections: CoMathMarkdownSection[];
	/** Every non-heading, non-empty line (used by callers that have no headings to key on). */
	raw: string[];
}

const BULLET_MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/;

/**
 * Parse markdown into `##`-style sections plus a flat list of raw lines.
 *
 * Display math is folded into the preceding item so multi-line LaTeX does not become orphan
 * `- \[` / `- \]` bullets: a line that opens a display-math block (`\[`, `\begin{...}`), any line
 * inside it, and the closing line (`\]`, `\end{...}`) all merge into the item before them, whether
 * the section uses bullets or loose prose. Outside math, a non-bullet line continues the previous
 * item only when that item was a bullet, so genuinely loose prose (e.g. a coordinator brief) keeps
 * its separate lines.
 */
export function parseCoMathMarkdown(text: string): CoMathParsedMarkdown {
	const sections: CoMathMarkdownSection[] = [];
	const raw: string[] = [];
	let current: CoMathMarkdownSection | undefined;
	let lastWasBullet = false;
	let inMathBlock = false;
	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();
		if (line.length === 0) {
			continue;
		}
		if (line.startsWith("```")) {
			// A fenced code block is a hard break; never treat its delimiter as a bullet or continuation.
			lastWasBullet = false;
			inMathBlock = false;
			continue;
		}
		const headingMatch = /^#{1,6}\s+(.*)$/.exec(line);
		if (headingMatch?.[1]) {
			current = { heading: headingMatch[1].trim(), items: [] };
			sections.push(current);
			lastWasBullet = false;
			inMathBlock = false;
			continue;
		}
		const isBullet = BULLET_MARKER.test(rawLine);
		const item = stripCoMathBulletMarker(line);
		if (item.length === 0) {
			continue;
		}
		const opensMath = (/\\\[/.test(item) && !/\\\]/.test(item)) || (/\\begin\{/.test(item) && !/\\end\{/.test(item));
		const closesMath = /\\\]/.test(item) || /\\end\{/.test(item);
		const hasPrevious = current ? current.items.length > 0 : raw.length > 0;
		// Merge into the previous item when continuing display math, when this line is only a math
		// delimiter, or (outside math) when continuing a bullet with a non-bullet line.
		const continuesPrevious =
			hasPrevious && (inMathBlock || isMathFragmentLine(item) || opensMath || (lastWasBullet && !isBullet));
		if (continuesPrevious) {
			appendToLastItem(raw, item);
			if (current) {
				appendToLastItem(current.items, item);
			}
		} else {
			raw.push(item);
			current?.items.push(item);
			lastWasBullet = isBullet;
		}
		if (opensMath) {
			inMathBlock = true;
		}
		if (closesMath) {
			inMathBlock = false;
		}
	}
	return { sections, raw };
}

/** Items of the first section whose heading contains `keyword` (case-insensitive); empties removed. */
export function getCoMathMarkdownSectionItems(parsed: CoMathParsedMarkdown, keyword: string): string[] {
	const needle = keyword.toLowerCase();
	const section = parsed.sections.find((candidate) => candidate.heading.toLowerCase().includes(needle));
	return section ? section.items.filter((item) => item.length > 0) : [];
}

/** The first non-empty item of the first matching section, or `undefined`. */
export function firstCoMathMarkdownSectionItem(parsed: CoMathParsedMarkdown, keyword: string): string | undefined {
	return getCoMathMarkdownSectionItems(parsed, keyword)[0];
}

/** Extract the first JSON object from model text, tolerating code fences and surrounding prose. */
export function extractCoMathJsonObject(text: string): Record<string, unknown> | undefined {
	const withoutFences = text.replace(/```(?:json)?/gi, "\n").trim();
	const start = withoutFences.indexOf("{");
	const end = withoutFences.lastIndexOf("}");
	if (start === -1 || end <= start) {
		return undefined;
	}
	try {
		const parsed: unknown = JSON.parse(withoutFences.slice(start, end + 1));
		return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
	} catch {
		return undefined;
	}
}

/** Strip a leading bullet marker (`-`, `*`, `•`, `1.`, `1)`) from a line. */
export function stripCoMathBulletMarker(line: string): string {
	return line.replace(BULLET_MARKER, "").trim();
}

/** A line that is only a display-math delimiter, e.g. `\[`, `\]`, `\(`, `\)`, `\begin{...}`, `\end{...}`. */
function isMathFragmentLine(item: string): boolean {
	return /^(?:\\\[|\\\]|\\\(|\\\)|\\begin\{[^}]*\}|\\end\{[^}]*\})$/.test(item.trim());
}

function appendToLastItem(items: string[], text: string): void {
	if (items.length === 0) {
		items.push(text);
		return;
	}
	items[items.length - 1] = `${items[items.length - 1]} ${text}`.replace(/\s+/g, " ").trim();
}
