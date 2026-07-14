import type { CoMathSourceLineRange } from "./comath-source-index.ts";
import type { CoMathSourceClaimScope } from "./schema.ts";

export type CoMathCitationSyntax = "canonical" | "lines-label" | "compact-lines";

export interface ParsedCoMathSourceCitation {
	sourceId: string;
	lines: CoMathSourceLineRange;
	explicitClaimScope?: CoMathSourceClaimScope;
	raw: string;
	syntax: CoMathCitationSyntax;
}

export interface ResolvedCoMathSourceCitation {
	sourceId: string;
	lines: CoMathSourceLineRange;
	claimScope: CoMathSourceClaimScope;
	regionKind: string;
	excerpt: string;
	excerptSha256: string;
	canonicalText: string;
}

export interface CoMathSourceCitationParseResult {
	citations: ParsedCoMathSourceCitation[];
	malformedSegments: string[];
}

const SCOPE_PATTERN = "formal-document|supplemental|ordinary-document|detached-source";
const CANONICAL = new RegExp(`^\\[(source-\\d+)@L(\\d+)-L(\\d+)\\|claim=(${SCOPE_PATTERN})\\]$`);
const LINES_LABEL = /^\[(source-\d+)\s*,?\s*lines\s+(\d+)\s*[-–—]\s*(\d+)\]$/i;
const COMPACT_LINES = /^\[(source-\d+)(?:\s*:\s*|\s+)L?(\d+)\s*[-–—]\s*L?(\d+)\]$/i;

/** Parse only bounded bracketed exact-line citation forms. Bare source ids are intentionally ignored. */
export function parseCoMathSourceCitations(text: string): ParsedCoMathSourceCitation[] {
	return parseCoMathSourceCitationDetails(text).citations;
}

/**
 * Parse source-like brackets once, retaining malformed segments for deterministic validation.
 * Commas only separate ranges after `lines`; semicolons separate independent source citations.
 */
export function parseCoMathSourceCitationDetails(text: string): CoMathSourceCitationParseResult {
	const citations: ParsedCoMathSourceCitation[] = [];
	const malformedSegments: string[] = [];
	for (const raw of text.match(/\[[^\]\r\n]{1,160}\]/g) ?? []) {
		const content = raw.slice(1, -1);
		if (!/\bsource-\d+\b/i.test(content)) continue;
		for (const segment of splitCitationSegments(content)) {
			const bracketed = `[${segment.trim()}]`;
			const canonical = bracketed.match(CANONICAL);
			const labelled = bracketed.match(LINES_LABEL);
			const compact = bracketed.match(COMPACT_LINES);
			const match = canonical ?? labelled ?? compact;
			if (!match) {
				if (/\bsource-\d+\b/i.test(segment)) malformedSegments.push(segment.trim());
				continue;
			}
			const start = Number.parseInt(match[2] ?? "", 10);
			const end = Number.parseInt(match[3] ?? "", 10);
			if (!match[1] || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) {
				malformedSegments.push(segment.trim());
				continue;
			}
			citations.push({
				sourceId: match[1],
				lines: { start, end },
				raw: bracketed,
				syntax: canonical ? "canonical" : labelled ? "lines-label" : "compact-lines",
				...(canonical && match[4] ? { explicitClaimScope: match[4] as CoMathSourceClaimScope } : {}),
			});
		}
	}
	const seen = new Set<string>();
	const deduplicated = citations.filter((citation) => {
		const key = `${citation.sourceId}:${citation.lines.start}:${citation.lines.end}:${citation.explicitClaimScope ?? ""}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
	return { citations: deduplicated, malformedSegments: [...new Set(malformedSegments)] };
}

function splitCitationSegments(content: string): string[] {
	let previousSourceId: string | undefined;
	return content.split(";").flatMap((segment) => {
		let trimmed = segment.trim();
		const explicitSourceId = /\b(source-\d+)\b/i.exec(trimmed)?.[1];
		if (explicitSourceId) previousSourceId = explicitSourceId;
		else if (previousSourceId && /^\d+\s*[-–—]\s*\d+$/.test(trimmed)) {
			trimmed = `${previousSourceId}, lines ${trimmed}`;
		}
		const ranges = /^(source-\d+)\s*,?\s*lines\s+(.+)$/i.exec(trimmed);
		if (!ranges?.[1] || !ranges[2]) return [trimmed];
		const rangeParts = ranges[2]
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean);
		if (rangeParts.length <= 1) return [trimmed];
		return rangeParts.map((range) => `${ranges[1]}, lines ${range}`);
	});
}

export function formatCanonicalCoMathSourceCitation(citation: ResolvedCoMathSourceCitation): string {
	return `[${citation.sourceId}@L${citation.lines.start}-L${citation.lines.end}|claim=${citation.claimScope}]`;
}
