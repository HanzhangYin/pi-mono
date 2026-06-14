import { sanitizeProductIds } from "./comath-backend-output.ts";
import type { CoMathSource } from "./comath-source.ts";

export interface CoMathProductRunSummary {
	status?: string;
	background?: boolean;
	transcriptPath?: string;
	reportId?: string;
	blockers?: string[];
}

export function formatCoMathWelcome(source: CoMathSource | undefined): string {
	if (!source) {
		return [
			"Pi is ready to help validate mathematical work.",
			"",
			"Describe the problem you want to investigate.",
		].join("\n");
	}
	if (!source.exists || !source.isFile) {
		return [
			"Pi is ready to help validate mathematical work.",
			`Source warning: ${source.input}`,
			source.missingReason ?? "Source path is not readable.",
			"",
			"Describe the problem you want to investigate.",
		].join("\n");
	}
	return [
		"Pi is ready to help validate mathematical work.",
		`Source: ${source.displayName}`,
		"",
		"Describe the problem you want to investigate.",
	].join("\n");
}

export function formatCoMathProductHelp(): string {
	return [
		"Pi math validation help",
		"",
		"Start by describing the problem or claim you want to investigate.",
		"Example: Validate Question 3.",
		"",
		"After Pi starts working, steer naturally:",
		"  continue",
		"  show progress",
		"  show report",
		"  focus on the support indexing gap",
		"  show uncertainty",
		"",
		"Pi will organize the source, goals, audit steps, transcripts, and reports internally.",
	].join("\n");
}

export function formatExistingProjectHelp(): string {
	return [
		"A validation run already exists in this workspace.",
		'Say "continue", "show progress", "show report", or "focus on ...".',
	].join("\n");
}

export interface InitialValidationPlanOptions {
	waitForContext?: boolean;
}

export function formatInitialValidationPlan(
	problem: string,
	sourceDisplayName?: string,
	options: InitialValidationPlanOptions = {},
): string {
	const finalStep = options.waitForContext
		? "- Wait for your pasted context before starting the first audit."
		: "- Start with the source audit.";
	return [
		`I’ll set up a source-backed validation run for: ${problem}`,
		"",
		"Plan",
		"- Pin the source and target problem.",
		"- Extract definitions and assumptions before proof attempts.",
		"- Audit proof dependencies, especially support/indexing gaps.",
		finalStep,
		...(sourceDisplayName ? ["", `Source: ${sourceDisplayName}`] : []),
	].join("\n");
}

export function formatWaitingForContext(sourceAuditPrepared: boolean): string {
	return [
		...(sourceAuditPrepared ? [formatSetupStep("Source audit prepared")] : []),
		"",
		"Paste the exact statement, definitions, assumptions, or proof context now — I’ll start validating automatically.",
		'You can also say "continue" to start right away.',
	].join("\n");
}

export function formatReadyForContext(): string {
	return [
		formatSetupStep("Source audit prepared"),
		"",
		"Please paste the question statement, candidate solution, or relevant context.",
		"I’ll start validating automatically once you do.",
	].join("\n");
}

export function formatContextRecorded(): string {
	return "Got it — I’ve added that to the validation context.";
}

export function formatSetupStep(label: string): string {
	return `✓ ${label}`;
}

export function formatBackgroundRunStarted(transcriptPath?: string): string {
	return [
		"→ Running source audit in the background",
		...(transcriptPath ? [`Latest transcript: ${transcriptPath}`] : []),
		"",
		'You can keep steering while it runs. Try: "show progress", "show report", or "focus on ...".',
	].join("\n");
}

export interface CoMathProductActivity {
	stepLabel: string;
	message: string;
	detail?: string;
}

export function formatProductActivity(activity: CoMathProductActivity): string {
	return [
		`${activity.stepLabel} activity`,
		`- ${activity.message}`,
		...(activity.detail ? [`  ${activity.detail}`] : []),
	].join("\n");
}

export function formatFocusNoted(focus: string): string {
	return [`Focus noted: ${focus}.`, "I’ll prioritize that in the next audit step."].join("\n");
}

export function formatSteeringNoted(): string {
	return "Noted. I’ll factor that into the next audit step.";
}

function formatProductRunStatus(status: string | undefined): string {
	if (status === "queued") {
		return "prepared; waiting for you to say continue";
	}
	return status ?? "unknown";
}

export function formatProductProgress(run: CoMathProductRunSummary | undefined): string {
	if (!run) {
		return ["Current progress", "- No audit run has started yet.", '- Say "continue" to start the next step.'].join(
			"\n",
		);
	}
	const blockers = run.blockers ?? [];
	return [
		"Current progress",
		`- Source audit: ${formatProductRunStatus(run.status)}`,
		...(run.background !== undefined ? [`- Running in background: ${run.background ? "yes" : "no"}`] : []),
		...(run.transcriptPath ? [`- Latest transcript: ${run.transcriptPath}`] : []),
		`- Report: ${run.reportId ? "ready" : "none yet"}`,
		...(blockers.length === 0
			? ["- Blockers: none"]
			: ["- Blockers:", ...blockers.map((blocker) => `  - ${sanitizeProductIds(blocker)}`)]),
	].join("\n");
}
