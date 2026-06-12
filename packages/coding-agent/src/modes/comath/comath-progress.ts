import type { CoMathSource } from "./comath-source.ts";

export function formatCoMathWelcome(source: CoMathSource | undefined): string {
	if (!source) {
		return "Co-math research mode\nWaiting for a problem to validate.";
	}
	if (!source.exists || !source.isFile) {
		return [
			`Co-math research mode source warning: ${source.input}`,
			source.missingReason ?? "Source path is not readable.",
			"Waiting for a problem to validate.",
		].join("\n");
	}
	return [`Co-math research mode`, `Source: ${source.displayName}`, "Waiting for a problem to validate."].join("\n");
}

export function formatCoMathProductHelp(): string {
	return [
		"Co-math research mode",
		"",
		"Describe the problem you want to validate, for example:",
		"  Validate Question 3.",
		"",
		"After setup, steer naturally:",
		"  continue",
		"  focus on the support indexing gap",
		"  show latest run",
		"  show latest report",
		"  show uncertainty",
		"",
		"I will create goals, source-audit workstreams, transcripts, and reports automatically.",
	].join("\n");
}

export function formatExistingProjectHelp(): string {
	return [
		"A co-math project already exists in this workspace.",
		'Say "continue", "show latest report", "show latest run", or "focus on ...".',
	].join("\n");
}

export function formatPlanningStarted(problem: string): string {
	return `Planning co-math validation workflow for: ${problem}`;
}

export function formatProjectCreated(rootQuestion: string): string {
	return `Created project: ${rootQuestion}`;
}

export function formatSourceRegistered(sourceDisplayName: string): string {
	return `Registered source: ${sourceDisplayName}`;
}

export function formatGoalCreated(goal: string): string {
	return `Created goal: ${goal}`;
}

export function formatWorkstreamCreated(title: string): string {
	return `Created workstream: ${title}`;
}

export function formatStartingFirstWorkstream(title: string): string {
	return `Starting first workstream: ${title}`;
}
