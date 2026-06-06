import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ArtifactKind, EvidenceKind, WarningSeverity } from "./schema.ts";

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

export function createDefaultRoleRunner(extensionDir = path.dirname(fileURLToPath(import.meta.url))): RoleRunner {
	return async (input) => {
		const promptPath = path.join(extensionDir, "agents", `${input.role}.md`);
		return runPiRole(input, promptPath);
	};
}

export function parseRoleRunOutput(text: string): RoleRunResult {
	const parsed = parseStructuredJsonText(text);
	if (!parsed) return fallbackRoleRunResult(text);
	const result = toRoleRunResult(parsed);
	if (!result) return fallbackRoleRunResult(text);
	return result;
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
		...parseRoleRunOutput(finalSummary),
		stderr: stderr.trim() || undefined,
	};
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

function toRoleRunResult(value: Record<string, unknown>): RoleRunResult | undefined {
	if (typeof value.summary !== "string" || value.summary.trim().length === 0) return undefined;
	const proposedClaims = parseProposedClaims(value.proposedClaims);
	if (proposedClaims === null) return undefined;
	const proposedArtifacts = parseProposedArtifacts(value.proposedArtifacts);
	if (proposedArtifacts === null) return undefined;
	const reviewDecision = parseReviewDecision(value.reviewDecision);
	if (reviewDecision === null) return undefined;
	const blockers = parseStringArray(value.blockers);
	if (blockers === null) return undefined;

	return {
		summary: value.summary,
		...(proposedClaims ? { proposedClaims } : {}),
		...(proposedArtifacts ? { proposedArtifacts } : {}),
		...(reviewDecision ? { reviewDecision } : {}),
		...(blockers ? { blockers } : {}),
	};
}

function parseProposedClaims(value: unknown): ProposedClaim[] | undefined | null {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) return null;
	const claims: ProposedClaim[] = [];
	for (const item of value) {
		const claim = getObject(item);
		if (!claim || typeof claim.statement !== "string" || claim.statement.trim().length === 0) return null;
		const evidence = parseProposedEvidence(claim.evidence);
		if (evidence === null) return null;
		const warnings = parseProposedWarnings(claim.warnings);
		if (warnings === null) return null;
		claims.push({
			statement: claim.statement,
			...(evidence ? { evidence } : {}),
			...(warnings ? { warnings } : {}),
		});
	}
	return claims;
}

function parseProposedArtifacts(value: unknown): ProposedArtifact[] | undefined | null {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) return null;
	const artifacts: ProposedArtifact[] = [];
	for (const item of value) {
		const artifact = getObject(item);
		if (!artifact || !isArtifactKind(artifact.kind)) return null;
		if (typeof artifact.title !== "string" || artifact.title.trim().length === 0) return null;
		if (typeof artifact.summary !== "string" || artifact.summary.trim().length === 0) return null;
		const provenance = parseOptionalNonEmptyString(artifact.provenance);
		if (provenance === null) return null;
		const artifactPath = parseOptionalNonEmptyString(artifact.path);
		if (artifactPath === null) return null;
		const relatedClaimIds = parseStringArray(artifact.relatedClaimIds);
		if (relatedClaimIds === null) return null;
		const relatedWorkstreamIds = parseStringArray(artifact.relatedWorkstreamIds);
		if (relatedWorkstreamIds === null) return null;
		artifacts.push({
			kind: artifact.kind,
			title: artifact.title,
			summary: artifact.summary,
			...(provenance ? { provenance } : {}),
			...(artifactPath ? { path: artifactPath } : {}),
			...(relatedClaimIds ? { relatedClaimIds } : {}),
			...(relatedWorkstreamIds ? { relatedWorkstreamIds } : {}),
		});
	}
	return artifacts;
}

function parseProposedEvidence(value: unknown): ProposedEvidence[] | undefined | null {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) return null;
	const evidence: ProposedEvidence[] = [];
	for (const item of value) {
		const record = getObject(item);
		if (!record || !isEvidenceKind(record.kind)) return null;
		if (typeof record.summary !== "string" || record.summary.trim().length === 0) return null;
		evidence.push({ kind: record.kind, summary: record.summary });
	}
	return evidence;
}

function parseProposedWarnings(value: unknown): ProposedWarning[] | undefined | null {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) return null;
	const warnings: ProposedWarning[] = [];
	for (const item of value) {
		const record = getObject(item);
		if (!record || !isWarningSeverity(record.severity)) return null;
		if (typeof record.message !== "string" || record.message.trim().length === 0) return null;
		warnings.push({ severity: record.severity, message: record.message });
	}
	return warnings;
}

function parseReviewDecision(value: unknown): ReviewDecision | undefined | null {
	if (value === undefined) return undefined;
	const decision = getObject(value);
	if (!decision) return null;
	if (typeof decision.claimId !== "string" || decision.claimId.trim().length === 0) return null;
	if (!isReviewStatus(decision.status)) return null;
	const evidence = parseProposedEvidence(decision.evidence);
	if (evidence === null) return null;
	const warnings = parseProposedWarnings(decision.warnings);
	if (warnings === null) return null;
	const resolvedWarningIds = parseStringArray(decision.resolvedWarningIds);
	if (resolvedWarningIds === null) return null;
	return {
		claimId: decision.claimId,
		status: decision.status,
		...(evidence ? { evidence } : {}),
		...(warnings ? { warnings } : {}),
		...(resolvedWarningIds ? { resolvedWarningIds } : {}),
	};
}

function parseStringArray(value: unknown): string[] | undefined | null {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) return null;
	const strings: string[] = [];
	for (const item of value) {
		if (typeof item !== "string" || item.trim().length === 0) return null;
		strings.push(item);
	}
	return strings;
}

function parseOptionalNonEmptyString(value: unknown): string | undefined | null {
	if (value === undefined) return undefined;
	if (typeof value !== "string" || value.trim().length === 0) return null;
	return value;
}

function fallbackRoleRunResult(text: string): RoleRunResult {
	return {
		summary: text.trim() || "(no role output)",
		blockers: ["Role output was not valid structured co-math JSON; saved as report only."],
	};
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
