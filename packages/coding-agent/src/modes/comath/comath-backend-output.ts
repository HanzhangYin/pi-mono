import type { CoMathProductRunSummary } from "./comath-progress.ts";

export function extractTranscriptPath(messages: readonly string[]): string | undefined {
	return extractField(messages, "Transcript");
}

export function extractStatus(messages: readonly string[]): string | undefined {
	return extractField(messages, "Status");
}

export function extractField(messages: readonly string[], label: string): string | undefined {
	const pattern = new RegExp(`^${label}:\\s*(.+)$`, "m");
	for (const message of messages) {
		const match = pattern.exec(message);
		if (match?.[1]) {
			return match[1].trim();
		}
	}
	return undefined;
}

export function extractRunSummary(messages: readonly string[]): CoMathProductRunSummary | undefined {
	const message = messages.find((candidate) => /^Status:\s*.+$/m.test(candidate));
	if (!message) {
		return undefined;
	}
	const report = extractField([message], "Report");
	const executionMode = extractField([message], "Execution mode");
	return {
		status: extractStatus([message]),
		background: executionMode === undefined ? undefined : executionMode === "background",
		transcriptPath: extractTranscriptPath([message]),
		reportId: report && report !== "none" ? report : undefined,
		blockers: extractBlockers(message),
	};
}

export function extractBlockers(message: string): string[] {
	const lines = message.split("\n");
	const start = lines.findIndex((line) => line.trim() === "Blockers:" || line.trim() === "Blockers");
	if (start === -1) {
		return [];
	}
	const blockers: string[] = [];
	for (const line of lines.slice(start + 1)) {
		const match = /^-\s+(.+)$/.exec(line.trim());
		if (!match) {
			break;
		}
		if (match[1].trim().toLowerCase() !== "none") {
			blockers.push(match[1].trim());
		}
	}
	return blockers;
}

export function formatProductReport(messages: readonly string[]): string | undefined {
	const message = messages.find((candidate) => /^Report\s+\S+:/.test(candidate));
	if (!message) {
		return undefined;
	}
	const blockers = extractBlockers(message);

	// When a run is "blocked" only because the model's output failed strict structured parsing, the
	// raw summary still holds useful math. Render that instead of the internal parser error.
	if (hasStructuredParseFailure(blockers)) {
		const rawSummary = extractSummaryBlock(message, REPORT_DETAIL_SECTION_HEADERS);
		const fields = rawSummary ? parseRawReportSummary(rawSummary) : undefined;
		if (fields) {
			const genuineBlockers = blockers.filter((blocker) => !isStructuredParseFailureBlocker(blocker));
			return [
				"Latest report",
				`Status: ${friendlyReviewStatus(fields.reviewStatus)}`,
				...formatRawReportSections(fields, genuineBlockers),
				"",
				"Next",
				'Say "continue" for the next step, or "focus on ..." to steer.',
			].join("\n");
		}
	}

	const summary = extractField([message], "Summary");
	const status = blockers.length > 0 ? "blocked" : "completed";
	return [
		"Latest report",
		`Status: ${status}`,
		...(summary ? ["", "Summary", sanitizeProductIds(summary)] : []),
		...(blockers.length > 0
			? ["", "Blockers", ...blockers.map((blocker) => `- ${sanitizeProductIds(blocker)}`)]
			: []),
		"",
		"Next",
		blockers.length > 0
			? 'Paste the missing statement or detail, say "continue", or say "focus on ...".'
			: 'Say "continue" for the next step, or "focus on ..." to steer.',
	].join("\n");
}

/** Marker blocker emitted by the role runner when output is not valid structured co-math JSON. */
export const STRUCTURED_PARSE_FAILURE_BLOCKER =
	"Role output was not valid structured co-math JSON; saved as report only.";

/** True when a blocker line is an internal structured-output parse/validation failure (not real math). */
export function isStructuredParseFailureBlocker(blocker: string): boolean {
	return blocker === STRUCTURED_PARSE_FAILURE_BLOCKER || blocker.startsWith("Structured output parse failure:");
}

/** True when any blocker indicates the run was blocked due to structured-output parsing. */
export function hasStructuredParseFailure(blockers: readonly string[]): boolean {
	return blockers.some(isStructuredParseFailureBlocker);
}

/** Section headers that terminate a multi-line `Summary:` block in report-detail / background output. */
const REPORT_DETAIL_SECTION_HEADERS = [
	"Blockers:",
	"Linked role run:",
	"Report review rounds:",
	"Warnings created by report reviews:",
	"Suggested next action:",
	"Status:",
	"Transcript:",
];

/**
 * Extract the full (possibly multi-line) text of a `Summary:` block, stopping at the next known
 * section header. The single-line `extractField` cannot capture raw JSON summaries that span lines.
 */
export function extractSummaryBlock(message: string, sectionHeaders: readonly string[]): string | undefined {
	const lines = message.split("\n");
	const startIndex = lines.findIndex((line) => /^Summary:/.test(line));
	if (startIndex === -1) {
		return undefined;
	}
	const collected = [lines[startIndex].replace(/^Summary:\s?/, "")];
	for (const line of lines.slice(startIndex + 1)) {
		const trimmed = line.trim();
		if (sectionHeaders.some((header) => trimmed.startsWith(header))) {
			break;
		}
		collected.push(line);
	}
	const summary = collected.join("\n").trim();
	return summary.length > 0 ? summary : undefined;
}

export interface CoMathRawReportFields {
	summary?: string;
	claimStatements: string[];
	evidenceSummaries: string[];
	reviewStatus?: string;
	blockers: string[];
}

/**
 * Leniently extract human-useful fields from a raw role-output summary that failed strict schema
 * validation. Returns undefined if no JSON object or no useful field is found. This never feeds
 * internal project state — it is display-only.
 */
export function parseRawReportSummary(rawSummary: string): CoMathRawReportFields | undefined {
	const json = extractJsonObject(rawSummary);
	if (!json) {
		return undefined;
	}
	const fields: CoMathRawReportFields = { claimStatements: [], evidenceSummaries: [], blockers: [] };

	const summary = json.summary;
	if (typeof summary === "string" && summary.trim().length > 0) {
		fields.summary = summary.trim();
	}

	const claims = Array.isArray(json.proposedClaims) ? json.proposedClaims : [];
	for (const claim of claims) {
		if (!claim || typeof claim !== "object") continue;
		const claimRecord = claim as Record<string, unknown>;
		if (typeof claimRecord.statement === "string" && claimRecord.statement.trim().length > 0) {
			fields.claimStatements.push(claimRecord.statement.trim());
		}
		const evidence = Array.isArray(claimRecord.evidence) ? claimRecord.evidence : [];
		for (const item of evidence) {
			if (!item || typeof item !== "object") continue;
			const evidenceSummary = (item as Record<string, unknown>).summary;
			if (typeof evidenceSummary === "string" && evidenceSummary.trim().length > 0) {
				fields.evidenceSummaries.push(evidenceSummary.trim());
			}
		}
	}

	const review = json.reviewDecision;
	if (review && typeof review === "object") {
		const status = (review as Record<string, unknown>).status;
		if (typeof status === "string" && status.trim().length > 0) {
			fields.reviewStatus = status.trim();
		}
	}

	if (Array.isArray(json.blockers)) {
		for (const blocker of json.blockers) {
			if (typeof blocker === "string" && blocker.trim().length > 0) {
				fields.blockers.push(blocker.trim());
			}
		}
	}

	const hasUseful =
		fields.summary !== undefined ||
		fields.claimStatements.length > 0 ||
		fields.evidenceSummaries.length > 0 ||
		fields.reviewStatus !== undefined;
	return hasUseful ? fields : undefined;
}

/** Map an internal review status to beginner-friendly product copy. */
export function friendlyReviewStatus(status: string | undefined): string {
	switch (status) {
		case "proved":
			return "looks valid";
		case "disproved":
			return "has a flaw";
		default:
			return "needs review";
	}
}

/** Render the body sections (Summary / Key points / Notes / Open items) for a raw-report fallback. */
export function formatRawReportSections(fields: CoMathRawReportFields, genuineBlockers: readonly string[]): string[] {
	const sections: string[] = [];
	if (fields.summary) {
		sections.push("", "Summary", sanitizeProductIds(fields.summary));
	}
	if (fields.claimStatements.length > 0) {
		sections.push("", "Key points", ...fields.claimStatements.map((line) => `- ${sanitizeProductIds(line)}`));
	}
	if (fields.evidenceSummaries.length > 0) {
		sections.push("", "Notes", ...fields.evidenceSummaries.map((line) => `- ${sanitizeProductIds(line)}`));
	}
	const openItems = [...genuineBlockers, ...fields.blockers];
	if (openItems.length > 0) {
		sections.push("", "Open items", ...openItems.map((line) => `- ${sanitizeProductIds(line)}`));
	}
	return sections;
}

/** Find and JSON.parse the first balanced object in text (tolerating fences and surrounding prose). */
function extractJsonObject(text: string): Record<string, unknown> | undefined {
	const unfenced = stripJsonFence(text.trim());
	const direct = tryParseObject(unfenced);
	if (direct) {
		return direct;
	}
	const start = unfenced.indexOf("{");
	if (start === -1) {
		return undefined;
	}
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let index = start; index < unfenced.length; index += 1) {
		const char = unfenced[index];
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (char === "\\") {
				escaped = true;
			} else if (char === '"') {
				inString = false;
			}
			continue;
		}
		if (char === '"') {
			inString = true;
		} else if (char === "{") {
			depth += 1;
		} else if (char === "}") {
			depth -= 1;
			if (depth === 0) {
				return tryParseObject(unfenced.slice(start, index + 1));
			}
		}
	}
	return undefined;
}

function stripJsonFence(text: string): string {
	const match = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/.exec(text.trim());
	return match ? match[1].trim() : text;
}

function tryParseObject(text: string): Record<string, unknown> | undefined {
	try {
		const parsed = JSON.parse(text) as unknown;
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
}

const PRODUCT_ID_REPLACEMENTS: Record<string, string> = {
	workstream: "this audit step",
	"role-run": "this run",
	artifact: "an artifact",
	goal: "a goal",
	claim: "a claim",
	evidence: "evidence",
	warning: "a warning",
	report: "a report",
};

/**
 * Redact internal co-math identifiers (e.g. `workstream-...`, `role-run-1`) that a
 * model may echo into its summary or blockers. Apply only to model-authored content,
 * never to a transcript-path line, which legitimately contains a `role-run-N` id.
 */
export function sanitizeProductIds(text: string): string {
	return text.replace(
		/\b(workstream|role-run|artifact|goal|claim|evidence|warning|report)-[A-Za-z0-9][A-Za-z0-9-]*\b/g,
		(_match, prefix: string) => PRODUCT_ID_REPLACEMENTS[prefix] ?? "this item",
	);
}
