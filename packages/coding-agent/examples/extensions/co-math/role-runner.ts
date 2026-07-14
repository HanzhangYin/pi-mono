import { spawn } from "node:child_process";
import * as fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ArtifactKind, EvidenceKind, WarningSeverity } from "./schema.ts";

export type CoMathRole = "coordinator" | "workstream" | "reviewer" | "synthesizer";

export type CoMathRoleActivityKind =
	| "started"
	| "thinking"
	| "reading"
	| "searching"
	| "running-command"
	| "editing"
	| "drafting"
	| "retrying"
	| "stderr"
	| "completed";

export interface CoMathRoleActivityEvent {
	kind: CoMathRoleActivityKind;
	timestamp: string;
	role: CoMathRole;
	message: string;
	detail?: string;
}

export type CoMathRoleActivityCallback = (event: CoMathRoleActivityEvent) => void | Promise<void>;

export interface RoleRunInput {
	cwd: string;
	role: CoMathRole;
	task: string;
	signal?: AbortSignal;
	transcriptPath?: string;
	onActivity?: CoMathRoleActivityCallback;
}

export interface RoleRunResult {
	summary: string;
	proposedClaims?: ProposedClaim[];
	proposedArtifacts?: ProposedArtifact[];
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

export interface ProposedArtifact {
	kind: ArtifactKind;
	title: string;
	summary: string;
	provenance?: string;
	path?: string;
	relatedClaimIds?: string[];
	relatedWorkstreamIds?: string[];
}

export interface ReviewDecision {
	claimId: string;
	status: "proved" | "proof_sketch" | "needs_review" | "disproved";
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

interface ParseFailure {
	reason: string;
}

interface TranscriptWriter {
	write(value: Record<string, unknown>): void;
	close(): Promise<void>;
}

type TranscriptStream = Pick<fs.WriteStream, "write" | "end" | "on" | "once" | "off">;

export function createDefaultRoleRunner(
	extensionDir = path.dirname(fileURLToPath(import.meta.url)),
	invocationOptions: PiInvocationOptions = {},
): RoleRunner {
	return async (input) => {
		const promptPath = path.join(extensionDir, "agents", `${input.role}.md`);
		return runPiRole(input, promptPath, invocationOptions);
	};
}

export function parseRoleRunOutput(text: string): RoleRunResult {
	const parsed = parseStructuredJsonText(text);
	if (!parsed) {
		return fallbackRoleRunResult(text, "output was not a single JSON object or fenced JSON object");
	}
	const result = toRoleRunResult(parsed);
	if (isParseFailure(result)) return fallbackRoleRunResult(text, result.reason);
	return result;
}

async function runPiRole(
	input: RoleRunInput,
	promptPath: string,
	invocationOptions: PiInvocationOptions = {},
): Promise<RoleRunResult> {
	const args = [
		"--mode",
		"json",
		"-p",
		"--no-session",
		"--no-extensions",
		"--tools",
		"read,grep,find,ls",
		"--append-system-prompt",
		promptPath,
		`Task: ${input.task}`,
	];
	const invocation = getPiInvocation(args, invocationOptions);
	const transcript = await createTranscriptWriter(input.transcriptPath);
	let stdoutBuffer = "";
	let stderr = "";
	let finalSummary = "";
	let wasAborted = false;
	let closedEventWritten = false;

	const emitActivity = (kind: CoMathRoleActivityKind, message: string, detail?: string): void => {
		void Promise.resolve(
			input.onActivity?.({
				kind,
				timestamp: new Date().toISOString(),
				role: input.role,
				message,
				...(detail ? { detail } : {}),
			}),
		).catch(() => {});
	};

	transcript.write({
		type: "started",
		transcriptFormatVersion: 2,
		messageUpdateEncoding: "delta-only",
		timestamp: new Date().toISOString(),
		role: input.role,
		cwd: input.cwd,
		command: invocation.command,
		args: invocation.args,
	});
	emitActivity("started", "Starting the audit run");

	try {
		const exitCode = await new Promise<number>((resolve) => {
			const proc = spawn(invocation.command, invocation.args, {
				cwd: input.cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});

			const writeClosedEvent = (code: number): void => {
				if (closedEventWritten) return;
				closedEventWritten = true;
				transcript.write({
					type: "closed",
					timestamp: new Date().toISOString(),
					exitCode: code,
					aborted: wasAborted,
				});
			};

			const processLine = (line: string) => {
				const event = parseJsonObject(line);
				if (!event) {
					transcript.write({ type: "stdout", timestamp: new Date().toISOString(), line });
					return;
				}
				writePiJsonTranscriptEvent(transcript, event, line);
				const activity = activityFromPiJsonEvent(event);
				if (activity) {
					emitActivity(activity.kind, activity.message, activity.detail);
				}
				if (event.type !== "message_end") return;
				const message = getObject(event.message);
				if (!message) return;
				const text = getAssistantText(message);
				if (text.length > 0) {
					finalSummary = text;
					transcript.write({
						type: "final_assistant_text",
						timestamp: new Date().toISOString(),
						text,
					});
				}
			};

			const processStdoutText = (text: string): void => {
				stdoutBuffer += text;
				const lines = stdoutBuffer.split("\n");
				stdoutBuffer = lines.pop() ?? "";
				for (const line of lines) {
					processLine(line);
				}
			};

			const processStderrText = (text: string): void => {
				stderr += text;
				transcript.write({ type: "stderr", timestamp: new Date().toISOString(), text });
				const sanitized = sanitizeStderrForActivity(text);
				if (sanitized) {
					emitActivity("stderr", "Noted a diagnostic message", sanitized);
				}
			};

			proc.stdout.on("data", (data: Buffer) => {
				processStdoutText(data.toString());
			});

			proc.stderr.on("data", (data: Buffer) => {
				processStderrText(data.toString());
			});
			proc.stdout.resume();
			proc.stderr.resume();

			proc.on("close", (code) => {
				setImmediate(() => {
					const remainingStdout = proc.stdout.read();
					if (remainingStdout) processStdoutText(remainingStdout.toString());
					const remainingStderr = proc.stderr.read();
					if (remainingStderr) processStderrText(remainingStderr.toString());
					if (stdoutBuffer.trim().length > 0) {
						processLine(stdoutBuffer);
					}
					const resolvedCode = code ?? 0;
					writeClosedEvent(resolvedCode);
					resolve(resolvedCode);
				});
			});

			proc.on("error", (error) => {
				transcript.write({ type: "stderr", timestamp: new Date().toISOString(), text: error.message });
				writeClosedEvent(1);
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
		emitActivity("completed", "Finished the audit run");
		return {
			...parseRoleRunOutput(finalSummary),
			stderr: stderr.trim() || undefined,
		};
	} finally {
		await transcript.close();
	}
}

export async function createTranscriptWriter(
	transcriptPath: string | undefined,
	createStream: (targetPath: string) => TranscriptStream = (targetPath) =>
		fs.createWriteStream(targetPath, { flags: "a" }),
): Promise<TranscriptWriter> {
	if (!transcriptPath) {
		return {
			write: () => {},
			close: async () => {},
		};
	}
	await mkdir(path.dirname(transcriptPath), { recursive: true });
	await writeFile(transcriptPath, "", "utf8");
	const stream = createStream(transcriptPath);
	let closed = false;
	let closePromise: Promise<void> | undefined;
	let settleClose: (() => void) | undefined;
	stream.on("error", () => {
		closed = true;
		settleClose?.();
	});
	return {
		write(value) {
			if (closed) return;
			stream.write(`${JSON.stringify(value)}\n`);
		},
		close: async () => {
			if (closePromise) return closePromise;
			if (closed) return;
			closePromise = new Promise<void>((resolve) => {
				const settle = () => {
					closed = true;
					stream.off("finish", settle);
					stream.off("error", settle);
					settleClose = undefined;
					resolve();
				};
				settleClose = settle;
				stream.once("finish", settle);
				stream.once("error", settle);
				try {
					stream.end();
				} catch {
					settle();
				}
			});
			await closePromise;
		},
	};
}

function writePiJsonTranscriptEvent(
	transcript: TranscriptWriter,
	event: Record<string, unknown>,
	originalLine: string,
): void {
	if (event.type !== "message_update") {
		transcript.write({ type: "stdout", timestamp: new Date().toISOString(), line: originalLine });
		return;
	}
	const assistantMessageEvent = getObject(event.assistantMessageEvent);
	if (!assistantMessageEvent) {
		transcript.write({ type: "stdout", timestamp: new Date().toISOString(), line: originalLine });
		return;
	}
	const { partial: _partial, ...compactAssistantMessageEvent } = assistantMessageEvent;
	transcript.write({
		type: "stream_update",
		timestamp: new Date().toISOString(),
		assistantMessageEvent: compactAssistantMessageEvent,
	});
}

function parseStructuredJsonText(text: string): Record<string, unknown> | undefined {
	const trimmed = text.trim();
	if (trimmed.length === 0) return undefined;
	const jsonText = getSingleFencedJsonBlock(trimmed) ?? trimmed;
	try {
		return getObject(JSON.parse(jsonText) as unknown);
	} catch {
		return undefined;
	}
}

function getSingleFencedJsonBlock(text: string): string | undefined {
	const match = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/.exec(text);
	return match?.[1];
}

function toRoleRunResult(value: Record<string, unknown>): RoleRunResult | ParseFailure {
	if (typeof value.summary !== "string" || value.summary.trim().length === 0) {
		return parseFailure("missing non-empty summary");
	}
	const proposedClaims = parseProposedClaims(value.proposedClaims);
	if (isParseFailure(proposedClaims)) return proposedClaims;
	const proposedArtifacts = parseProposedArtifacts(value.proposedArtifacts);
	if (isParseFailure(proposedArtifacts)) return proposedArtifacts;
	const reviewDecision = parseReviewDecision(value.reviewDecision);
	if (isParseFailure(reviewDecision)) return reviewDecision;
	const blockers = parseStringArray(value.blockers, "blockers");
	if (isParseFailure(blockers)) return blockers;

	return {
		summary: value.summary,
		...(proposedClaims ? { proposedClaims } : {}),
		...(proposedArtifacts ? { proposedArtifacts } : {}),
		...(reviewDecision ? { reviewDecision } : {}),
		...(blockers ? { blockers } : {}),
	};
}

function parseProposedClaims(value: unknown): ProposedClaim[] | undefined | ParseFailure {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) return parseFailure("proposedClaims must be an array");
	const claims: ProposedClaim[] = [];
	for (const [index, item] of value.entries()) {
		const claim = getObject(item);
		if (!claim) return parseFailure(`proposedClaims[${index}] must be an object`);
		if (typeof claim.statement !== "string" || claim.statement.trim().length === 0) {
			return parseFailure(`proposedClaims[${index}].statement must be a non-empty string`);
		}
		const evidence = parseProposedEvidence(claim.evidence, `proposedClaims[${index}].evidence`);
		if (isParseFailure(evidence)) return evidence;
		const warnings = parseProposedWarnings(claim.warnings, `proposedClaims[${index}].warnings`);
		if (isParseFailure(warnings)) return warnings;
		claims.push({
			statement: claim.statement,
			...(evidence ? { evidence } : {}),
			...(warnings ? { warnings } : {}),
		});
	}
	return claims;
}

function parseProposedArtifacts(value: unknown): ProposedArtifact[] | undefined | ParseFailure {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) return parseFailure("proposedArtifacts must be an array");
	const artifacts: ProposedArtifact[] = [];
	for (const [index, item] of value.entries()) {
		const artifact = getObject(item);
		if (!artifact) return parseFailure(`proposedArtifacts[${index}] must be an object`);
		const kind = normalizeArtifactKind(artifact.kind);
		if (!kind) return parseFailure(`proposedArtifacts[${index}] has unknown artifact kind: ${String(artifact.kind)}`);
		if (typeof artifact.title !== "string" || artifact.title.trim().length === 0) {
			return parseFailure(`proposedArtifacts[${index}].title must be a non-empty string`);
		}
		if (typeof artifact.summary !== "string" || artifact.summary.trim().length === 0) {
			return parseFailure(`proposedArtifacts[${index}].summary must be a non-empty string`);
		}
		const provenance = parseOptionalNonEmptyString(artifact.provenance, `proposedArtifacts[${index}].provenance`);
		if (isParseFailure(provenance)) return provenance;
		const artifactPath = parseOptionalNonEmptyString(artifact.path, `proposedArtifacts[${index}].path`);
		if (isParseFailure(artifactPath)) return artifactPath;
		const relatedClaimIds = parseStringArray(artifact.relatedClaimIds, `proposedArtifacts[${index}].relatedClaimIds`);
		if (isParseFailure(relatedClaimIds)) return relatedClaimIds;
		const relatedWorkstreamIds = parseStringArray(
			artifact.relatedWorkstreamIds,
			`proposedArtifacts[${index}].relatedWorkstreamIds`,
		);
		if (isParseFailure(relatedWorkstreamIds)) return relatedWorkstreamIds;
		artifacts.push({
			kind,
			title: artifact.title,
			summary: prefixSummaryForNormalizedKind(artifact.kind, kind, artifact.summary),
			...(provenance ? { provenance } : {}),
			...(artifactPath ? { path: artifactPath } : {}),
			...(relatedClaimIds ? { relatedClaimIds } : {}),
			...(relatedWorkstreamIds ? { relatedWorkstreamIds } : {}),
		});
	}
	return artifacts;
}

function parseProposedEvidence(value: unknown, path: string): ProposedEvidence[] | undefined | ParseFailure {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) return parseFailure(`${path} must be an array`);
	const evidence: ProposedEvidence[] = [];
	for (const [index, item] of value.entries()) {
		const record = getObject(item);
		if (!record) return parseFailure(`${path}[${index}] must be an object`);
		const kind = normalizeEvidenceKind(record.kind);
		if (!kind) return parseFailure(`${path}[${index}] has unknown evidence kind: ${String(record.kind)}`);
		if (typeof record.summary !== "string" || record.summary.trim().length === 0) {
			return parseFailure(`${path}[${index}].summary must be a non-empty string`);
		}
		evidence.push({ kind, summary: prefixSummaryForNormalizedKind(record.kind, kind, record.summary) });
	}
	return evidence;
}

function parseProposedWarnings(value: unknown, path: string): ProposedWarning[] | undefined | ParseFailure {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) return parseFailure(`${path} must be an array`);
	const warnings: ProposedWarning[] = [];
	for (const [index, item] of value.entries()) {
		const record = getObject(item);
		if (!record) return parseFailure(`${path}[${index}] must be an object`);
		if (!isWarningSeverity(record.severity)) {
			return parseFailure(`${path}[${index}].severity is invalid: ${String(record.severity)}`);
		}
		if (typeof record.message !== "string" || record.message.trim().length === 0) {
			return parseFailure(`${path}[${index}].message must be a non-empty string`);
		}
		warnings.push({ severity: record.severity, message: record.message });
	}
	return warnings;
}

function parseReviewDecision(value: unknown): ReviewDecision | undefined | ParseFailure {
	if (value === undefined) return undefined;
	const decision = getObject(value);
	if (!decision) return parseFailure("reviewDecision must be an object");
	if (typeof decision.claimId !== "string" || decision.claimId.trim().length === 0) {
		return parseFailure("reviewDecision.claimId must be a non-empty string");
	}
	if (!isReviewStatus(decision.status))
		return parseFailure(`reviewDecision.status is invalid: ${String(decision.status)}`);
	const evidence = parseProposedEvidence(decision.evidence, "reviewDecision.evidence");
	if (isParseFailure(evidence)) return evidence;
	const warnings = parseProposedWarnings(decision.warnings, "reviewDecision.warnings");
	if (isParseFailure(warnings)) return warnings;
	const resolvedWarningIds = parseStringArray(decision.resolvedWarningIds, "reviewDecision.resolvedWarningIds");
	if (isParseFailure(resolvedWarningIds)) return resolvedWarningIds;
	return {
		claimId: decision.claimId,
		status: decision.status,
		...(evidence ? { evidence } : {}),
		...(warnings ? { warnings } : {}),
		...(resolvedWarningIds ? { resolvedWarningIds } : {}),
	};
}

function parseStringArray(value: unknown, path: string): string[] | undefined | ParseFailure {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) return parseFailure(`${path} must be an array of non-empty strings`);
	const strings: string[] = [];
	for (const [index, item] of value.entries()) {
		if (typeof item !== "string" || item.trim().length === 0) {
			return parseFailure(`${path}[${index}] must be a non-empty string`);
		}
		strings.push(item);
	}
	return strings;
}

function parseOptionalNonEmptyString(value: unknown, path: string): string | undefined | ParseFailure {
	if (value === undefined) return undefined;
	if (typeof value !== "string" || value.trim().length === 0)
		return parseFailure(`${path} must be a non-empty string`);
	return value;
}

function fallbackRoleRunResult(text: string, reason?: string): RoleRunResult {
	const blockers = ["Role output was not valid structured co-math JSON; saved as report only."];
	if (reason) blockers.push(`Structured output parse failure: ${reason}`);
	return {
		summary: text.trim() || "(no role output)",
		blockers,
	};
}

function parseFailure(reason: string): ParseFailure {
	return { reason };
}

function isParseFailure(value: unknown): value is ParseFailure {
	return typeof value === "object" && value !== null && "reason" in value && typeof value.reason === "string";
}

function prefixSummaryForNormalizedKind(originalKind: unknown, normalizedKind: string, summary: string): string {
	if (typeof originalKind !== "string" || originalKind === normalizedKind) return summary;
	return `[${originalKind}] ${summary}`;
}

function normalizeArtifactKind(value: unknown): ArtifactKind | undefined {
	if (isArtifactKind(value)) return value;
	if (value === "review_note" || value === "source_audit" || value === "blocker_list") return "human_note";
	if (value === "source_extract") return "reference";
	if (value === "negative_result") return "failed_attempt";
	if (value === "exact_example") return "computation";
	return undefined;
}

function normalizeEvidenceKind(value: unknown): EvidenceKind | undefined {
	if (isEvidenceKind(value)) return value;
	if (value === "citation" || value === "source_state" || value === "source_check" || value === "source_audit") {
		return "reference";
	}
	if (value === "derivation" || value === "proof_sketch" || value === "proof_obligation") return "proof";
	if (value === "failed_attempt" || value === "review_note") return "note";
	return undefined;
}

function isArtifactKind(value: unknown): value is ArtifactKind {
	return (
		value === "computation" ||
		value === "latex_note" ||
		value === "proof_sketch" ||
		value === "counterexample_search" ||
		value === "reference" ||
		value === "dataset" ||
		value === "script" ||
		value === "figure" ||
		value === "failed_attempt" ||
		value === "human_note"
	);
}

function isEvidenceKind(value: unknown): value is EvidenceKind {
	return (
		value === "proof" ||
		value === "computation" ||
		value === "reference" ||
		value === "counterexample" ||
		value === "note"
	);
}

function isWarningSeverity(value: unknown): value is WarningSeverity {
	return value === "low" || value === "medium" || value === "high";
}

function isReviewStatus(value: unknown): value is ReviewDecision["status"] {
	return value === "proved" || value === "proof_sketch" || value === "needs_review" || value === "disproved";
}

interface PiInvocationOptions {
	currentScript?: string;
	execPath?: string;
}

export function getPiInvocation(
	args: string[],
	options: PiInvocationOptions = {},
): { command: string; args: string[] } {
	const currentScript = options.currentScript ?? process.argv[1];
	const execPath = options.execPath ?? process.execPath;
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		const tsxInvocation = getTsxInvocation(currentScript, execPath, args);
		if (tsxInvocation) return tsxInvocation;
		return { command: execPath, args: [currentScript, ...args] };
	}

	const execName = path.basename(execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: execPath, args };
	}

	return { command: "pi", args };
}

function getTsxInvocation(
	currentScript: string,
	execPath: string,
	args: string[],
): { command: string; args: string[] } | undefined {
	if (path.extname(currentScript) !== ".ts") return undefined;
	const execName = path.basename(execPath).toLowerCase();
	if (!/^node(\.exe)?$/.test(execName)) return undefined;

	const root = findAncestorWithFile(path.dirname(currentScript), path.join("node_modules", ".bin", "tsx"));
	if (!root) return undefined;

	const tsxPath = path.join(root, "node_modules", ".bin", "tsx");
	const tsconfigPath = path.join(root, "tsconfig.json");
	const tsxArgs = fs.existsSync(tsconfigPath)
		? ["--tsconfig", tsconfigPath, currentScript, ...args]
		: [currentScript, ...args];
	return { command: tsxPath, args: tsxArgs };
}

function findAncestorWithFile(startDir: string, relativeFile: string): string | undefined {
	let currentDir = path.resolve(startDir);
	while (true) {
		if (fs.existsSync(path.join(currentDir, relativeFile))) return currentDir;
		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return undefined;
		currentDir = parentDir;
	}
}

interface CoMathActivityMapping {
	kind: CoMathRoleActivityKind;
	message: string;
	detail?: string;
}

const TOOL_ACTIVITY_BY_NAME: Record<string, CoMathActivityMapping> = {
	read: { kind: "reading", message: "Reading source context" },
	find: { kind: "searching", message: "Searching the workspace" },
	grep: { kind: "searching", message: "Searching the workspace" },
	ls: { kind: "searching", message: "Searching the workspace" },
	bash: { kind: "running-command", message: "Running a local check" },
	edit: { kind: "editing", message: "Updating workspace notes" },
	write: { kind: "editing", message: "Updating workspace notes" },
};

export function activityFromPiJsonEvent(event: Record<string, unknown>): CoMathActivityMapping | undefined {
	const type = typeof event.type === "string" ? event.type : undefined;
	if (!type) return undefined;

	if (type === "tool_execution_start") {
		const toolName = typeof event.toolName === "string" ? event.toolName.toLowerCase() : undefined;
		if (!toolName) return undefined;
		return TOOL_ACTIVITY_BY_NAME[toolName] ?? { kind: "running-command", message: "Running a local check" };
	}

	if (isRetryEvent(type, event)) {
		return { kind: "retrying", message: "Retrying the model request" };
	}

	if (type === "message_update") {
		const innerType = getAssistantMessageEventType(event.assistantMessageEvent);
		if (innerType === "thinking_start") return { kind: "thinking", message: "Working through the proof context" };
		if (innerType === "text_start") return { kind: "drafting", message: "Drafting the audit report" };
		return undefined;
	}

	return undefined;
}

function isRetryEvent(type: string, event: Record<string, unknown>): boolean {
	if (type === "api_retry" || type === "retry") return true;
	if (type !== "system") return false;
	const subtype = typeof event.subtype === "string" ? event.subtype : undefined;
	return subtype === "api_retry" || subtype === "retry";
}

function getAssistantMessageEventType(value: unknown): string | undefined {
	const inner = getObject(value);
	return inner && typeof inner.type === "string" ? inner.type : undefined;
}

function sanitizeStderrForActivity(text: string): string | undefined {
	const firstLine = text
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	if (!firstLine) return undefined;
	const truncated = firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
	return truncated;
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
