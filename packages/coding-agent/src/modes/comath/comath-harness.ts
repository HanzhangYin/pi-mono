import { stat } from "node:fs/promises";
import type { CoMathAutoPlan } from "./comath-autoplan.ts";
import { createCoMathAutoPlan } from "./comath-autoplan.ts";
import {
	extractRunSummary,
	extractStatus,
	extractTranscriptPath,
	formatProductReport,
} from "./comath-backend-output.ts";
import {
	formatBackgroundRunStarted,
	formatCoMathProductHelp,
	formatContextRecorded,
	formatFocusNoted,
	formatInitialValidationPlan,
	formatProductProgress,
	formatReadyForContext,
	formatSetupStep,
	formatSteeringNoted,
	formatWaitingForContext,
} from "./comath-progress.ts";
import type { CoMathSource } from "./comath-source.ts";

export type CoMathHarnessNoticeType = "info" | "warning" | "error";
export type CoMathHarnessNotify = (message: string, type?: CoMathHarnessNoticeType) => void | Promise<void>;
export interface CoMathBackendCommandResult {
	ok: boolean;
	messages: string[];
}
export type CoMathBackendCommandRunner = (args: string) => Promise<CoMathBackendCommandResult>;

export interface CoMathHarnessOptions {
	source?: CoMathSource;
	statePath: string;
	notify: CoMathHarnessNotify;
	runBackendCommand: CoMathBackendCommandRunner;
	createPlan?: (problemText: string, sourceTitle?: string) => CoMathAutoPlan;
	startFirstRun?: boolean;
}

export class CoMathHarness {
	private readonly source: CoMathSource | undefined;
	private readonly statePath: string;
	private readonly notify: CoMathHarnessNotify;
	private readonly runBackendCommand: CoMathBackendCommandRunner;
	private readonly createPlan: (problemText: string, sourceTitle?: string) => CoMathAutoPlan;
	private readonly startFirstRun: boolean;

	constructor(options: CoMathHarnessOptions) {
		this.source = options.source;
		this.statePath = options.statePath;
		this.notify = options.notify;
		this.runBackendCommand = options.runBackendCommand;
		this.createPlan = options.createPlan ?? createCoMathAutoPlan;
		this.startFirstRun = options.startFirstRun ?? true;
	}

	async handlePrompt(problemText: string): Promise<void> {
		const problem = problemText.trim();
		if (!problem) {
			await this.notify("Describe the problem you want to investigate.", "warning");
			return;
		}
		if (isProductHelpPrompt(problem)) {
			await this.notify(formatCoMathProductHelp());
			return;
		}
		if (await this.hasExistingState()) {
			await this.handleSteeringPrompt(problem);
			return;
		}
		await this.handleInitialProblem(problem);
	}

	private async handleInitialProblem(problem: string): Promise<void> {
		const sourceTitle = this.source?.exists && this.source.isFile ? this.source.displayName : undefined;
		const explicitWait = shouldWaitForContext(problem);
		const hasSource = !!(this.source?.exists && this.source.isFile);
		// With a source pinned but only a short problem reference, ask the human to paste the exact
		// statement/context before the first audit instead of auditing with no real context.
		const askForContext = explicitWait || (hasSource && !initialPromptIncludesContext(problem));
		// The control-flow request ("wait for pasted context before starting") must not become the
		// math root question, or the audit role obeys it and blocks even once context is supplied.
		const plan = this.createPlan(explicitWait ? cleanProblemStatement(problem) : problem, sourceTitle);
		await this.notify(formatInitialValidationPlan(plan.rootQuestion, sourceTitle, { waitForContext: askForContext }));
		if (
			!(await this.runRequiredCommand(`init ${plan.rootQuestion}`, "Could not prepare the validation workspace."))
		) {
			return;
		}
		await this.notify(formatSetupStep("Validation workspace prepared"));
		if (this.source?.exists && this.source.isFile) {
			if (
				!(await this.runRequiredCommand(
					`source ${this.source.absolutePath} ${this.source.displayName}: Primary source for ${trimTerminalPunctuation(plan.rootQuestion)}`,
					`Could not pin the source file: ${this.source.displayName}. Check the source path and try again.`,
				))
			) {
				return;
			}
			await this.notify(formatSetupStep(`Source pinned: ${this.source.displayName}`));
		} else if (this.source) {
			await this.notify(
				`Could not pin the source file: ${this.source.missingReason ?? "source is not readable."}`,
				"error",
			);
			return;
		}

		for (const goal of plan.goals) {
			if (!(await this.runRequiredCommand(`goal ${goal}`, "Could not create the validation plan."))) {
				return;
			}
		}
		await this.notify(formatSetupStep("Validation plan created"));
		for (const workstream of plan.workstreams) {
			if (
				!(await this.runRequiredCommand(
					`workstream ${workstream.slug}: ${workstream.title}`,
					"Could not prepare the audit steps.",
				))
			) {
				return;
			}
		}
		await this.notify(formatSetupStep("Definition and assumption audit prepared"));
		await this.notify(formatSetupStep("Support/indexing gap audit prepared"));
		if (this.startFirstRun) {
			if (
				!(await this.runRequiredCommand(
					`queue workstream ${plan.firstWorkstreamId}`,
					"Could not prepare the source audit.",
				))
			) {
				return;
			}
			if (askForContext) {
				// Leave the audit prepared (queued); the next substantial message becomes context and
				// auto-starts it. Explicit "wait" keeps its copy; the auto-ask uses human-first copy.
				await this.notify(explicitWait ? formatWaitingForContext(true) : formatReadyForContext());
				return;
			}
			const dispatched = await this.runCommand(
				"dispatch-next --background",
				"Could not start the source audit. Check model/provider configuration and try again.",
			);
			if (!dispatched) {
				return;
			}
			await this.notify(formatBackgroundRunStarted(extractTranscriptPath(dispatched.messages)));
		}
	}

	private async handleSteeringPrompt(prompt: string): Promise<void> {
		if (/^continue$/i.test(prompt)) {
			const latestRun = await this.tryCommand("run-status latest");
			const latestStatus = latestRun?.ok ? extractStatus(latestRun.messages) : undefined;
			if (latestStatus === "queued") {
				const dispatched = await this.runCommand(
					"dispatch-next --background",
					"Could not start the prepared source audit. Check model/provider configuration and try again.",
				);
				if (dispatched) {
					await this.notify(formatBackgroundRunStarted(extractTranscriptPath(dispatched.messages)));
				}
				return;
			}
			// Do not start a re-audit while one is still running; let it finish first.
			if (latestStatus !== "running") {
				const reaudit = await this.tryCommand("re-audit --background");
				const reauditTranscript = reaudit?.ok ? extractTranscriptPath(reaudit.messages) : undefined;
				if (reauditTranscript) {
					await this.notify(formatBackgroundRunStarted(reauditTranscript));
					return;
				}
			}
			const result = await this.runCommand("next", "Could not identify the next step.");
			if (result) {
				await this.notify(joinProductMessages(result.messages) || "Nothing to do right now.");
			}
			return;
		}
		if (
			/^(?:show (?:the )?(?:current )?progress|status|what are you doing\??|show (?:the )?latest run)$/i.test(prompt)
		) {
			const result = await this.tryCommand("run-status latest");
			if (!result?.ok) {
				await this.notify(formatProductProgress(undefined));
				return;
			}
			await this.notify(formatProductProgress(extractRunSummary(result.messages)));
			return;
		}
		if (/^show (?:the )?(?:latest )?report$/i.test(prompt)) {
			const result = await this.tryCommand("report-status latest");
			if (!result?.ok) {
				await this.notify('No report yet. The first audit may still be running; say "show progress" to check.');
				return;
			}
			await this.notify(formatProductReport(result.messages) ?? joinProductMessages(result.messages));
			return;
		}
		if (/^show (?:details|debug state)$/i.test(prompt)) {
			const runStatus = await this.tryCommand("run-status latest");
			const projectStatus = await this.tryCommand("status");
			const details = [...(runStatus?.messages ?? []), ...(projectStatus?.messages ?? [])].join("\n\n").trim();
			await this.notify(details.length > 0 ? details : "No debug details are available yet.");
			return;
		}
		const focus = /^focus on (.+)$/i.exec(prompt);
		if (focus?.[1]) {
			const focusTarget = trimTerminalPunctuation(focus[1]);
			if (
				!(await this.runRequiredCommand(
					`note project: Focus next work on ${focusTarget}`,
					"Could not record that focus.",
				))
			) {
				return;
			}
			await this.notify(formatFocusNoted(focusTarget));
			return;
		}
		if (/^show uncertainty$/i.test(prompt)) {
			const result = await this.runCommand("review-queue", "Could not show current uncertainty.");
			if (result) {
				await this.notify(joinProductMessages(result.messages) || "Nothing is waiting for review.");
			}
			return;
		}
		await this.handleContextOrSteering(prompt);
	}

	/**
	 * Default handling for an unrecognized message: record it, then — if it looks like pasted
	 * context/candidate rather than a short steering note — automatically start the prepared audit
	 * (first context) or trigger one re-audit (after a finished run). A run already in flight only
	 * records the context so repeated messages cannot start duplicate audits.
	 */
	private async handleContextOrSteering(prompt: string): Promise<void> {
		if (!(await this.runRequiredCommand(`note project: ${prompt}`, "Could not record that steering note."))) {
			return;
		}
		if (!looksLikePastedContext(prompt)) {
			await this.notify(formatSteeringNoted());
			return;
		}
		const latestRun = await this.tryCommand("run-status latest");
		const latestStatus = latestRun?.ok ? extractStatus(latestRun.messages) : undefined;
		if (latestStatus === "queued") {
			const dispatched = await this.runCommand(
				"dispatch-next --background",
				"Could not start the source audit. Check model/provider configuration and try again.",
			);
			if (dispatched) {
				await this.notify(formatContextRecorded());
				await this.notify(formatBackgroundRunStarted(extractTranscriptPath(dispatched.messages)));
			}
			return;
		}
		if (latestStatus === "completed" || latestStatus === "blocked") {
			const reaudit = await this.tryCommand("re-audit --background");
			const transcript = reaudit?.ok ? extractTranscriptPath(reaudit.messages) : undefined;
			await this.notify(formatContextRecorded());
			if (transcript) {
				await this.notify(formatBackgroundRunStarted(transcript));
			}
			return;
		}
		// A run is queued-and-dispatching or running: record context only, never start a duplicate.
		await this.notify(formatContextRecorded());
	}

	private async hasExistingState(): Promise<boolean> {
		try {
			const stateStat = await stat(this.statePath);
			return stateStat.isFile();
		} catch {
			return false;
		}
	}

	private async runRequiredCommand(command: string, recovery: string): Promise<boolean> {
		return (await this.runCommand(command, recovery)) !== undefined;
	}

	private async runCommand(command: string, recovery: string): Promise<CoMathBackendCommandResult | undefined> {
		try {
			const result = await this.runBackendCommand(command);
			if (result.ok) {
				return result;
			}
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			await this.notify(`${recovery}\n${message}`, "error");
			return undefined;
		}
		await this.notify(recovery, "error");
		return undefined;
	}

	private async tryCommand(command: string): Promise<CoMathBackendCommandResult | undefined> {
		try {
			return await this.runBackendCommand(command);
		} catch {
			return undefined;
		}
	}
}

function trimTerminalPunctuation(value: string): string {
	return value.replace(/[.?!]+$/, "");
}

function cleanProblemStatement(problem: string): string {
	const withoutLeadVerb = problem
		.trim()
		.replace(
			/^(?:please\s+)?(?:set[\s-]?up|initiali[sz]e|prepare|create|begin|start)\s+(?:a\s+)?(?:source-backed\s+)?validation(?:\s+run)?\s+(?:for|of|on)\s+/i,
			"",
		);
	const clauses = withoutLeadVerb
		.split(/\s*(?:,|;|\.|\bbut\b)\s*/i)
		.map((clause) => clause.trim())
		.filter((clause) => clause.length > 0);
	const kept = clauses.filter(
		(clause) => !/\b(?:wait|don'?t start|do not start|before starting|until i|until you)\b/i.test(clause),
	);
	const cleaned = kept.join(". ").trim();
	return cleaned.length > 0 ? cleaned : withoutLeadVerb.trim();
}

/**
 * Strict detector for the FIRST prompt: decides whether the user already pasted the actual problem
 * content (so we can audit immediately) versus a short reference like "Validate First Proof
 * Question 2." or "Please validate Question 3 from the attached source" (so we should ask for
 * context first). Conservative on purpose — a false "needs context" only costs one extra paste,
 * whereas a false "has context" launches an audit with nothing real to check. Note "First Proof"
 * must NOT count as a proof marker, so labels are start-anchored and require a colon.
 */
function initialPromptIncludesContext(text: string): boolean {
	const trimmed = text.trim();
	if (trimmed.includes("\n")) {
		return true;
	}
	if (
		/^(?:context|candidate|statement|proof|definition|assumptions?|claim|theorem|lemma)\b[^\n]{0,40}:/i.test(trimmed)
	) {
		return true;
	}
	const words = trimmed.split(/\s+/).filter((word) => word.length > 0);
	return words.length >= 40 || trimmed.length >= 240;
}

/**
 * Looser detector for messages AFTER setup, once Pi has asked for context. At that point any
 * substantial reply is the pasted context/candidate; short replies stay ordinary steering notes.
 */
function looksLikePastedContext(text: string): boolean {
	const trimmed = text.trim();
	if (trimmed.includes("\n")) {
		return true;
	}
	const words = trimmed.split(/\s+/).filter((word) => word.length > 0);
	return trimmed.length >= 40 || words.length >= 8;
}

function shouldWaitForContext(prompt: string): boolean {
	const normalized = prompt.toLowerCase();
	const asksToWait =
		/\bwait\b/.test(normalized) || /\bdon'?t start\b/.test(normalized) || /\bdo not start\b/.test(normalized);
	const mentionsContext =
		/\bcontext\b/.test(normalized) ||
		/\bpaste[ds]?\b/.test(normalized) ||
		/\bstatement\b/.test(normalized) ||
		/\bproof\b/.test(normalized);
	return asksToWait && mentionsContext;
}

function isProductHelpPrompt(prompt: string): boolean {
	const normalized = prompt.trim().toLowerCase();
	return normalized === "help" || normalized === "?";
}

function joinProductMessages(messages: readonly string[]): string {
	return messages.map(demoteBackendHeading).join("\n\n").trim();
}

function demoteBackendHeading(message: string): string {
	return message.replace(/^Co-math (\w)/, (_match, first: string) => first.toUpperCase());
}
