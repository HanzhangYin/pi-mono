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
	const summary = extractField([message], "Summary");
	const blockers = extractBlockers(message);
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
