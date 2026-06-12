import { stat } from "node:fs/promises";
import type { CoMathAutoPlan } from "./comath-autoplan.ts";
import { createCoMathAutoPlan } from "./comath-autoplan.ts";
import {
	formatCoMathProductHelp,
	formatGoalCreated,
	formatPlanningStarted,
	formatProjectCreated,
	formatSourceRegistered,
	formatStartingFirstWorkstream,
	formatWorkstreamCreated,
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
			await this.notify("Enter a problem to validate in co-math mode.", "warning");
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
		const plan = this.createPlan(problem, sourceTitle);
		await this.notify(formatPlanningStarted(plan.rootQuestion));
		if (!(await this.runRequiredCommand(`init ${plan.rootQuestion}`, "Could not create the co-math project."))) {
			return;
		}
		await this.notify(formatProjectCreated(plan.rootQuestion));
		if (this.source?.exists && this.source.isFile) {
			if (
				!(await this.runRequiredCommand(
					`source ${this.source.absolutePath} ${this.source.displayName}: Primary source for ${trimTerminalPunctuation(plan.rootQuestion)}`,
					`Could not register source: ${this.source.displayName}. Check the source path and try again.`,
				))
			) {
				return;
			}
			await this.notify(formatSourceRegistered(this.source.displayName));
		} else if (this.source) {
			await this.notify(
				`Could not register source: ${this.source.missingReason ?? "source is not readable."}`,
				"error",
			);
			return;
		}

		for (const goal of plan.goals) {
			if (!(await this.runRequiredCommand(`goal ${goal}`, `Could not create goal: ${goal}`))) {
				return;
			}
			await this.notify(formatGoalCreated(goal));
		}
		for (const workstream of plan.workstreams) {
			if (
				!(await this.runRequiredCommand(
					`workstream ${workstream.slug}: ${workstream.title}`,
					`Could not create workstream: ${workstream.title}`,
				))
			) {
				return;
			}
			await this.notify(formatWorkstreamCreated(workstream.goal));
		}
		if (this.startFirstRun) {
			await this.notify(formatStartingFirstWorkstream(plan.workstreams[0]?.goal ?? plan.firstWorkstreamId));
			if (
				!(await this.runRequiredCommand(
					`queue workstream ${plan.firstWorkstreamId}`,
					"Could not queue the first co-math role run.",
				))
			) {
				return;
			}
			await this.runRequiredCommand(
				"dispatch-next --background",
				"Could not start the first co-math role run. Check model/provider configuration and try again.",
			);
		}
	}

	private async handleSteeringPrompt(prompt: string): Promise<void> {
		if (/^continue$/i.test(prompt)) {
			await this.notify("Continuing with the next co-math step...");
			await this.runRequiredCommand("next", "Could not identify the next co-math step.");
			return;
		}
		if (/^show (?:the )?latest run$/i.test(prompt)) {
			await this.runRequiredCommand("run-status latest", "Could not show the latest co-math run.");
			return;
		}
		if (/^show (?:the )?latest report$/i.test(prompt)) {
			await this.runRequiredCommand("report-status latest", "Could not show the latest co-math report.");
			return;
		}
		const focus = /^focus on (.+)$/i.exec(prompt);
		if (focus?.[1]) {
			await this.runRequiredCommand(
				`note project: Focus next work on ${focus[1]}`,
				"Could not record the co-math focus note.",
			);
			await this.notify(`Recorded focus for the next co-math step: ${focus[1]}`);
			return;
		}
		if (/^show uncertainty$/i.test(prompt)) {
			await this.runRequiredCommand("review-queue", "Could not show current co-math uncertainty.");
			return;
		}
		await this.runRequiredCommand(`note project: ${prompt}`, "Could not record the co-math steering note.");
		await this.notify("Recorded your steering note for the co-math project.");
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
		try {
			const result = await this.runBackendCommand(command);
			if (result.ok) {
				return true;
			}
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			await this.notify(`${recovery}\n${message}`, "error");
			return false;
		}
		await this.notify(recovery, "error");
		return false;
	}
}

function trimTerminalPunctuation(value: string): string {
	return value.replace(/[.?!]+$/, "");
}

function isProductHelpPrompt(prompt: string): boolean {
	const normalized = prompt.trim().toLowerCase();
	return normalized === "help" || normalized === "?";
}
