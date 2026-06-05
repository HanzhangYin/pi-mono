import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { EvidenceKind, WarningSeverity } from "./schema.ts";

export type CoMathRole = "coordinator" | "workstream" | "reviewer" | "synthesizer";

export interface RoleRunInput {
	cwd: string;
	role: CoMathRole;
	task: string;
	signal?: AbortSignal;
}

export interface RoleRunResult {
	summary: string;
	proposedClaims?: ProposedClaim[];
	reviewDecision?: ReviewDecision;
	blockers?: string[];
	stderr?: string;
}

export interface ProposedEvidence {
	kind: EvidenceKind;
	summary: string;
}

export interface ProposedWarning {
	severity: WarningSeverity;
	message: string;
}

export interface ProposedClaim {
	statement: string;
	evidence?: ProposedEvidence[];
	warnings?: ProposedWarning[];
}

export interface ReviewDecision {
	claimId: string;
	status: "proved" | "needs_review" | "disproved";
	evidence?: ProposedEvidence[];
	warnings?: ProposedWarning[];
	resolvedWarningIds?: string[];
}

export type RoleRunner = (input: RoleRunInput) => Promise<RoleRunResult>;

interface TextPart {
	type: "text";
	text: string;
}

interface AssistantMessage {
	role?: unknown;
	content?: unknown;
}

export function createDefaultRoleRunner(extensionDir = path.dirname(fileURLToPath(import.meta.url))): RoleRunner {
	return async (input) => {
		const promptPath = path.join(extensionDir, "agents", `${input.role}.md`);
		return runPiRole(input, promptPath);
	};
}

async function runPiRole(input: RoleRunInput, promptPath: string): Promise<RoleRunResult> {
	const args = ["--mode", "json", "-p", "--no-session", "--append-system-prompt", promptPath, `Task: ${input.task}`];
	const invocation = getPiInvocation(args);
	let stdoutBuffer = "";
	let stderr = "";
	let finalSummary = "";
	let wasAborted = false;

	const exitCode = await new Promise<number>((resolve) => {
		const proc = spawn(invocation.command, invocation.args, {
			cwd: input.cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});

		const processLine = (line: string) => {
			const event = parseJsonObject(line);
			if (!event) return;
			if (event.type !== "message_end") return;
			const message = getObject(event.message);
			if (!message) return;
			const text = getAssistantText(message);
			if (text.length > 0) finalSummary = text;
		};

		proc.stdout.on("data", (data: Buffer) => {
			stdoutBuffer += data.toString();
			const lines = stdoutBuffer.split("\n");
			stdoutBuffer = lines.pop() ?? "";
			for (const line of lines) processLine(line);
		});

		proc.stderr.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		proc.on("close", (code) => {
			if (stdoutBuffer.trim().length > 0) processLine(stdoutBuffer);
			resolve(code ?? 0);
		});

		proc.on("error", () => {
			resolve(1);
		});

		if (input.signal) {
			const killProc = () => {
				wasAborted = true;
				proc.kill("SIGTERM");
			};
			if (input.signal.aborted) killProc();
			else input.signal.addEventListener("abort", killProc, { once: true });
		}
	});

	if (wasAborted) {
		throw new Error("Co-math role run was aborted.");
	}
	if (exitCode !== 0) {
		throw new Error(stderr.trim() || `Co-math role process exited with code ${exitCode}.`);
	}
	return {
		summary: finalSummary || "(no role output)",
		stderr: stderr.trim() || undefined,
	};
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}

	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}

	return { command: "pi", args };
}

function parseJsonObject(line: string): Record<string, unknown> | undefined {
	if (line.trim().length === 0) return undefined;
	try {
		const parsed = JSON.parse(line) as unknown;
		return getObject(parsed);
	} catch {
		return undefined;
	}
}

function getObject(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function getAssistantText(message: AssistantMessage): string {
	if (message.role !== "assistant" || !Array.isArray(message.content)) return "";
	for (const part of message.content) {
		const textPart = getTextPart(part);
		if (textPart) return textPart.text;
	}
	return "";
}

function getTextPart(value: unknown): TextPart | undefined {
	const part = getObject(value);
	if (!part || part.type !== "text" || typeof part.text !== "string") return undefined;
	return { type: "text", text: part.text };
}
