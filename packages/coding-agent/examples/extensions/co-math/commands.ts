import type { ExtensionAPI, ExtensionCommandContext } from "../../../src/core/extensions/types.ts";
import { type CoMathRole, createDefaultRoleRunner, type RoleRunner, type RoleRunResult } from "./role-runner.ts";
import type {
	ArtifactKind,
	Claim,
	CoMathProjectState,
	EvidenceKind,
	RoleRunRecord,
	RoleRunStatus,
	Warning,
	WarningSeverity,
	Workstream,
	WorkstreamStatus,
} from "./schema.ts";
import {
	addArtifact,
	addClaim,
	addEvidence,
	addGoal,
	addReport,
	addReviewDecisionEvent,
	addReviewQueueItem,
	addSynthesisEvent,
	addWarning,
	addWorkstream,
	attachWorkstreamReport,
	createEmptyProjectState,
	failRoleRun,
	finishRoleRun,
	getDefaultStatePath,
	isClaimSynthesisEligible,
	loadProjectState,
	recordHumanInterventionEvent,
	removeReviewQueueItemsForClaim,
	resolveWarning,
	saveProjectState,
	setClaimStatus,
	setWorkstreamStatus,
	startRoleRun,
} from "./storage.ts";

const HELP_TEXT = `Co-math assistant commands:
/comath help - show this help
/comath init <root question> - create a co-math project state
/comath goal <goal text> - add an approved active goal
/comath workstream <slug>: <title> - add a workstream linked to active goals
/comath evidence <claim-id> <proof|computation|reference|counterexample|note>: <summary> - attach manual evidence
/comath warning <claim-id> <low|medium|high>: <message> - attach a manual warning
/comath resolve-warning <warning-id> - mark an attached warning resolved
/comath block <workstream-id>: <reason> - manually mark a workstream blocked
/comath unblock <workstream-id>: <reason> - manually return a workstream to active with a steering note
/comath note <subject-id>: <note> - record a human steering note as a metadata artifact
/comath artifact <kind> <title>: <summary> - manually record a workspace artifact
/comath artifacts - list recorded artifacts
/comath audit - check co-math state invariants without mutating state
/comath review-queue - list claims and warnings waiting for review
/comath run <coordinator|workstream|reviewer|synthesizer> [workstream-id|claim-id] - run a bounded role and save its report
/comath runs - list recent role run records
/comath run-status <run-id> - show one role run record
/comath recover-run <run-id> <failed|aborted>: <reason> - close a stale running role run
/comath synthesize - produce cautious markdown from reviewed state
/comath timeline - show recent workspace events
/comath status - summarize the current co-math project state`;

export interface RegisterCoMathCommandOptions {
	roleRunner?: RoleRunner;
}

export function registerCoMathCommand(pi: ExtensionAPI, options: RegisterCoMathCommandOptions = {}): void {
	const roleRunner = options.roleRunner ?? createDefaultRoleRunner();
	pi.registerCommand("comath", {
		description: "Manage the co-math research workspace",
		handler: async (args, ctx) => {
			await handleCoMathCommand(pi, args, ctx, roleRunner);
		},
	});
}

async function handleCoMathCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: ExtensionCommandContext,
	roleRunner: RoleRunner,
): Promise<void> {
	const trimmedArgs = args.trim();
	const [subcommand = "help", ...rest] = trimmedArgs.length === 0 ? ["help"] : trimmedArgs.split(/\s+/);
	const remainder = rest.join(" ").trim();

	if (subcommand === "help") {
		showCommandMessage(pi, ctx, HELP_TEXT);
		return;
	}

	if (subcommand === "init") {
		await initializeProject(pi, ctx, remainder);
		return;
	}

	if (subcommand === "goal") {
		await addProjectGoal(pi, ctx, remainder);
		return;
	}

	if (subcommand === "workstream") {
		await addProjectWorkstream(pi, ctx, remainder);
		return;
	}

	if (subcommand === "evidence") {
		await addManualEvidence(pi, ctx, remainder);
		return;
	}

	if (subcommand === "warning") {
		await addManualWarning(pi, ctx, remainder);
		return;
	}

	if (subcommand === "resolve-warning") {
		await resolveManualWarning(pi, ctx, remainder);
		return;
	}

	if (subcommand === "block") {
		await setManualWorkstreamBlocked(pi, ctx, remainder);
		return;
	}

	if (subcommand === "unblock") {
		await setManualWorkstreamUnblocked(pi, ctx, remainder);
		return;
	}

	if (subcommand === "note") {
		await addHumanNote(pi, ctx, remainder);
		return;
	}

	if (subcommand === "artifact") {
		await addManualArtifact(pi, ctx, remainder);
		return;
	}

	if (subcommand === "artifacts") {
		await showArtifacts(pi, ctx);
		return;
	}

	if (subcommand === "audit") {
		await auditProjectState(pi, ctx);
		return;
	}

	if (subcommand === "run") {
		await runProjectRole(pi, ctx, remainder, roleRunner);
		return;
	}

	if (subcommand === "review-queue") {
		await showReviewQueue(pi, ctx);
		return;
	}

	if (subcommand === "runs") {
		await showRoleRuns(pi, ctx);
		return;
	}

	if (subcommand === "run-status") {
		await showRoleRunStatus(pi, ctx, remainder);
		return;
	}

	if (subcommand === "recover-run") {
		await recoverStaleRoleRun(pi, ctx, remainder);
		return;
	}

	if (subcommand === "synthesize") {
		await showProjectSynthesis(pi, ctx);
		return;
	}

	if (subcommand === "timeline") {
		await showTimeline(pi, ctx);
		return;
	}

	if (subcommand === "status") {
		await showProjectStatus(pi, ctx);
		return;
	}

	showCommandMessage(pi, ctx, `Unknown /comath command: ${subcommand}\n\n${HELP_TEXT}`);
}

async function initializeProject(pi: ExtensionAPI, ctx: ExtensionCommandContext, rootQuestion: string): Promise<void> {
	if (rootQuestion.length === 0) {
		showCommandMessage(pi, ctx, "Usage: /comath init <root question>");
		return;
	}

	const now = new Date().toISOString();
	const statePath = getDefaultStatePath(ctx.cwd);
	const state = createEmptyProjectState({
		projectId: `co-math-${Date.now()}`,
		title: rootQuestion,
		rootQuestion,
		now,
	});
	await saveProjectState(statePath, state);
	showCommandMessage(pi, ctx, `Initialized co-math project state at ${statePath}`);
}

async function addProjectGoal(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	if (text.length === 0) {
		showCommandMessage(pi, ctx, "Usage: /comath goal <goal text>");
		return;
	}

	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}

	const now = new Date().toISOString();
	const goalId = `goal-${existing.approvedGoals.length + 1}`;
	const statePath = getDefaultStatePath(ctx.cwd);
	const state = addGoal(existing, {
		id: goalId,
		text,
		now,
		actor: "human",
	});
	await saveProjectState(statePath, state);
	showCommandMessage(pi, ctx, `Added co-math goal ${goalId}: ${text}`);
}

async function addProjectWorkstream(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	if (text.length === 0) {
		showCommandMessage(pi, ctx, "Usage: /comath workstream <slug>: <title>");
		return;
	}

	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}

	const parsed = parseWorkstreamText(text);
	const now = new Date().toISOString();
	const statePath = getDefaultStatePath(ctx.cwd);
	const state = addWorkstream(existing, {
		id: nextWorkstreamId(existing, parsed.slug),
		title: parsed.title,
		goalIds: existing.approvedGoals.filter((goal) => goal.status === "active").map((goal) => goal.id),
		now,
		actor: "human",
	});
	await saveProjectState(statePath, state);
	const workstream = state.workstreams[state.workstreams.length - 1];
	if (!workstream) {
		throw new Error("Expected added workstream to be present in project state.");
	}
	showCommandMessage(pi, ctx, `Added co-math workstream ${workstream.id}: ${parsed.title}`);
}

async function addManualEvidence(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const parsed = parseEvidenceText(text);
	if (!parsed) {
		showCommandMessage(
			pi,
			ctx,
			"Usage: /comath evidence <claim-id> <proof|computation|reference|counterexample|note>: <summary>",
		);
		return;
	}

	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}
	if (!existing.claims.some((claim) => claim.id === parsed.claimId)) {
		showCommandMessage(pi, ctx, `Unknown claim: ${parsed.claimId}`);
		return;
	}

	const now = new Date().toISOString();
	const evidenceId = `evidence-${existing.evidence.length + 1}`;
	const state = addEvidence(existing, {
		id: evidenceId,
		claimId: parsed.claimId,
		kind: parsed.kind,
		summary: parsed.summary,
		now,
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(pi, ctx, `Added evidence ${evidenceId} to ${parsed.claimId}: ${parsed.summary}`);
}

async function addManualWarning(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const parsed = parseWarningText(text);
	if (!parsed) {
		showCommandMessage(pi, ctx, "Usage: /comath warning <claim-id> <low|medium|high>: <message>");
		return;
	}

	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}
	if (!existing.claims.some((claim) => claim.id === parsed.claimId)) {
		showCommandMessage(pi, ctx, `Unknown claim: ${parsed.claimId}`);
		return;
	}

	const now = new Date().toISOString();
	const warningId = `warning-${existing.warnings.length + 1}`;
	const state = addWarning(existing, {
		id: warningId,
		claimId: parsed.claimId,
		severity: parsed.severity,
		message: parsed.message,
		now,
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(pi, ctx, `Added warning ${warningId} to ${parsed.claimId}: ${parsed.message}`);
}

async function resolveManualWarning(pi: ExtensionAPI, ctx: ExtensionCommandContext, warningId: string): Promise<void> {
	if (warningId.length === 0) {
		showCommandMessage(pi, ctx, "Usage: /comath resolve-warning <warning-id>");
		return;
	}

	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}
	if (!existing.warnings.some((warning) => warning.id === warningId)) {
		showCommandMessage(pi, ctx, `Unknown warning: ${warningId}`);
		return;
	}

	const state = resolveWarning(existing, {
		warningId,
		now: new Date().toISOString(),
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(pi, ctx, `Resolved warning ${warningId}`);
}

async function setManualWorkstreamBlocked(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const parsed = parseSubjectBodyText(text);
	if (!parsed) {
		showCommandMessage(pi, ctx, "Usage: /comath block <workstream-id>: <reason>");
		return;
	}

	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}
	if (!existing.workstreams.some((workstream) => workstream.id === parsed.subjectId)) {
		showCommandMessage(pi, ctx, `Unknown workstream: ${parsed.subjectId}`);
		return;
	}

	const now = new Date().toISOString();
	const summary = `Blocked workstream ${parsed.subjectId}: ${parsed.body}`;
	let state = setWorkstreamStatus(existing, {
		workstreamId: parsed.subjectId,
		status: "blocked",
		statusReason: parsed.body,
		now,
		actor: "human",
	});
	state = recordHumanInterventionEvent(state, {
		summary,
		subjectId: parsed.subjectId,
		relatedIds: [parsed.subjectId],
		now,
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(pi, ctx, summary);
}

async function setManualWorkstreamUnblocked(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	text: string,
): Promise<void> {
	const parsed = parseSubjectBodyText(text);
	if (!parsed) {
		showCommandMessage(pi, ctx, "Usage: /comath unblock <workstream-id>: <reason>");
		return;
	}

	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}
	if (!existing.workstreams.some((workstream) => workstream.id === parsed.subjectId)) {
		showCommandMessage(pi, ctx, `Unknown workstream: ${parsed.subjectId}`);
		return;
	}

	const now = new Date().toISOString();
	const summary = `Unblocked workstream ${parsed.subjectId}: ${parsed.body}`;
	let state = setWorkstreamStatus(existing, {
		workstreamId: parsed.subjectId,
		status: "active",
		now,
		actor: "human",
	});
	state = recordHumanInterventionEvent(state, {
		summary,
		subjectId: parsed.subjectId,
		relatedIds: [parsed.subjectId],
		now,
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(pi, ctx, summary);
}

async function addHumanNote(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const parsed = parseSubjectBodyText(text);
	if (!parsed) {
		showCommandMessage(pi, ctx, "Usage: /comath note <subject-id>: <note>");
		return;
	}

	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}

	const now = new Date().toISOString();
	const artifactId = `artifact-${existing.artifacts.length + 1}`;
	const related = getHumanNoteRelatedIds(existing, parsed.subjectId);
	let state = addArtifact(existing, {
		id: artifactId,
		kind: "human_note",
		title: `Human note for ${parsed.subjectId}`,
		summary: parsed.body,
		provenance: `Human steering note for ${parsed.subjectId}`,
		relatedClaimIds: related.claimIds,
		relatedWorkstreamIds: related.workstreamIds,
		now,
		actor: "human",
	});
	state = recordHumanInterventionEvent(state, {
		summary: `Recorded human note for ${parsed.subjectId}: ${parsed.body}`,
		subjectId: parsed.subjectId,
		relatedIds: uniqueStrings([parsed.subjectId, artifactId]),
		now,
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(pi, ctx, `Recorded human note artifact ${artifactId} for ${parsed.subjectId}.`);
}

async function addManualArtifact(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const parsed = parseArtifactText(text);
	if (!parsed) {
		showCommandMessage(pi, ctx, "Usage: /comath artifact <kind> <title>: <summary>");
		return;
	}

	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}

	const now = new Date().toISOString();
	const artifactId = `artifact-${existing.artifacts.length + 1}`;
	const state = addArtifact(existing, {
		id: artifactId,
		kind: parsed.kind,
		title: parsed.title,
		summary: parsed.summary,
		now,
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(pi, ctx, `Recorded artifact ${artifactId}: ${parsed.title}`);
}

function getHumanNoteRelatedIds(
	state: CoMathProjectState,
	subjectId: string,
): { claimIds: string[]; workstreamIds: string[] } {
	return {
		claimIds: state.claims.some((claim) => claim.id === subjectId) ? [subjectId] : [],
		workstreamIds: state.workstreams.some((workstream) => workstream.id === subjectId) ? [subjectId] : [],
	};
}

interface ParsedEvidenceCommand {
	claimId: string;
	kind: EvidenceKind;
	summary: string;
}

interface ParsedWarningCommand {
	claimId: string;
	severity: WarningSeverity;
	message: string;
}

interface ParsedArtifactCommand {
	kind: ArtifactKind;
	title: string;
	summary: string;
}

interface ParsedRecoverRunCommand {
	runId: string;
	status: "failed" | "aborted";
	reason: string;
}

interface ParsedSubjectBodyCommand {
	subjectId: string;
	body: string;
}

function parseSubjectBodyText(text: string): ParsedSubjectBodyCommand | undefined {
	const separatorIndex = text.indexOf(":");
	if (separatorIndex === -1) return undefined;
	const subjectId = text.slice(0, separatorIndex).trim();
	const body = text.slice(separatorIndex + 1).trim();
	if (subjectId.length === 0 || body.length === 0) return undefined;
	return { subjectId, body };
}

function parseRecoverRunText(text: string): ParsedRecoverRunCommand | undefined {
	const separatorIndex = text.indexOf(":");
	if (separatorIndex === -1) return undefined;
	const header = text.slice(0, separatorIndex).trim();
	const reason = text.slice(separatorIndex + 1).trim();
	const [runId, status] = header.split(/\s+/);
	if (!runId || !isRecoverRunStatus(status) || reason.length === 0) return undefined;
	return { runId, status, reason };
}

function isRecoverRunStatus(value: string | undefined): value is "failed" | "aborted" {
	return value === "failed" || value === "aborted";
}

function parseArtifactText(text: string): ParsedArtifactCommand | undefined {
	const [kind, ...rest] = text.trim().split(/\s+/);
	if (!kind || !isArtifactKind(kind)) return undefined;
	const body = rest.join(" ").trim();
	const separatorIndex = body.indexOf(":");
	if (separatorIndex === -1) return undefined;
	const title = body.slice(0, separatorIndex).trim();
	const summary = body.slice(separatorIndex + 1).trim();
	if (title.length === 0 || summary.length === 0) return undefined;
	return { kind, title, summary };
}

function parseEvidenceText(text: string): ParsedEvidenceCommand | undefined {
	const parsed = parseClaimAttachedRecord(text);
	if (!parsed || !isEvidenceKind(parsed.kindOrSeverity)) return undefined;
	return {
		claimId: parsed.claimId,
		kind: parsed.kindOrSeverity,
		summary: parsed.body,
	};
}

function parseWarningText(text: string): ParsedWarningCommand | undefined {
	const parsed = parseClaimAttachedRecord(text);
	if (!parsed || !isWarningSeverity(parsed.kindOrSeverity)) return undefined;
	return {
		claimId: parsed.claimId,
		severity: parsed.kindOrSeverity,
		message: parsed.body,
	};
}

function parseClaimAttachedRecord(text: string): { body: string; claimId: string; kindOrSeverity: string } | undefined {
	const separatorIndex = text.indexOf(":");
	if (separatorIndex === -1) return undefined;
	const header = text.slice(0, separatorIndex).trim();
	const body = text.slice(separatorIndex + 1).trim();
	const [claimId, kindOrSeverity] = header.split(/\s+/);
	if (!claimId || !kindOrSeverity || body.length === 0) return undefined;
	return { body, claimId, kindOrSeverity };
}

function isEvidenceKind(value: string): value is EvidenceKind {
	return (
		value === "proof" ||
		value === "computation" ||
		value === "reference" ||
		value === "counterexample" ||
		value === "note"
	);
}

function isWarningSeverity(value: string): value is WarningSeverity {
	return value === "low" || value === "medium" || value === "high";
}

function isArtifactKind(value: string): value is ArtifactKind {
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

async function auditProjectState(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const state = await loadProjectStateOrNotify(pi, ctx);
	if (!state) {
		return;
	}

	const problems = collectAuditProblems(state);
	showCommandMessage(
		pi,
		ctx,
		problems.length === 0
			? "Co-math audit\nNo co-math audit problems found."
			: ["Co-math audit", ...problems.map((problem) => `- ${problem}`)].join("\n"),
	);
}

function collectAuditProblems(state: CoMathProjectState): string[] {
	const problems: string[] = [];
	const claimIds = new Set(state.claims.map((claim) => claim.id));
	const evidenceIds = new Set(state.evidence.map((evidence) => evidence.id));
	const warningIds = new Set(state.warnings.map((warning) => warning.id));
	const artifactIds = new Set(state.artifacts.map((artifact) => artifact.id));
	const reportIds = new Set(state.reports.map((report) => report.id));
	const roleRunIds = new Set(state.roleRuns.map((run) => run.id));
	const workstreamIds = new Set(state.workstreams.map((workstream) => workstream.id));

	for (const item of state.reviewQueue) {
		if (!claimIds.has(item.claimId)) {
			problems.push(`${item.id} points to missing claim ${item.claimId}`);
		}
	}

	for (const evidence of state.evidence) {
		if (!claimIds.has(evidence.claimId)) {
			problems.push(`${evidence.id} points to missing claim ${evidence.claimId}`);
		}
	}

	for (const warning of state.warnings) {
		if (!claimIds.has(warning.claimId)) {
			problems.push(`${warning.id} points to missing claim ${warning.claimId}`);
		}
	}

	for (const claim of state.claims) {
		for (const evidenceId of claim.evidenceIds) {
			if (!evidenceIds.has(evidenceId)) {
				problems.push(`${claim.id} references missing evidence ${evidenceId}`);
			}
		}
		for (const warningId of claim.warningIds) {
			if (!warningIds.has(warningId)) {
				problems.push(`${claim.id} references missing warning ${warningId}`);
			}
		}
		if (claim.status === "proved" && !isClaimSynthesisEligible(state, claim.id)) {
			problems.push(`${claim.id} is marked proved but is not synthesis-eligible`);
		}
	}

	for (const run of state.roleRuns) {
		if (run.targetWorkstreamId && !workstreamIds.has(run.targetWorkstreamId)) {
			problems.push(`${run.id} points to missing workstream ${run.targetWorkstreamId}`);
		}
		if (run.targetClaimId && !claimIds.has(run.targetClaimId)) {
			problems.push(`${run.id} points to missing claim ${run.targetClaimId}`);
		}
		if (run.reportId && !reportIds.has(run.reportId)) {
			problems.push(`${run.id} points to missing report ${run.reportId}`);
		}
		for (const claimId of run.createdClaimIds) {
			if (!claimIds.has(claimId)) {
				problems.push(`${run.id} references missing created claim ${claimId}`);
			}
		}
		for (const evidenceId of run.createdEvidenceIds) {
			if (!evidenceIds.has(evidenceId)) {
				problems.push(`${run.id} references missing created evidence ${evidenceId}`);
			}
		}
		for (const warningId of run.createdWarningIds) {
			if (!warningIds.has(warningId)) {
				problems.push(`${run.id} references missing created warning ${warningId}`);
			}
		}
		for (const artifactId of run.createdArtifactIds) {
			if (!artifactIds.has(artifactId)) {
				problems.push(`${run.id} references missing created artifact ${artifactId}`);
			}
		}
	}

	const runningWorkstreamIds = new Set(
		state.roleRuns
			.filter((run) => run.status === "running" && run.targetWorkstreamId)
			.map((run) => run.targetWorkstreamId as string),
	);
	for (const workstream of state.workstreams) {
		for (const runId of workstream.latestRunIds) {
			if (!roleRunIds.has(runId)) {
				problems.push(`${workstream.id} references missing role run ${runId}`);
			}
		}
		if (workstream.status === "running" && !runningWorkstreamIds.has(workstream.id)) {
			problems.push(`${workstream.id} is running but has no running role run targeting it`);
		}
	}

	return problems;
}

async function runProjectRole(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	text: string,
	roleRunner: RoleRunner,
): Promise<void> {
	const request = parseRoleRunRequest(text);
	if (!request) {
		showCommandMessage(pi, ctx, "Usage: /comath run <coordinator|workstream|reviewer|synthesizer> [workstream-id]");
		return;
	}

	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}

	const targetWorkstream = getTargetWorkstream(existing, request);
	if (request.role === "workstream" && !targetWorkstream) {
		showCommandMessage(pi, ctx, "Usage: /comath run workstream <workstream-id>");
		return;
	}
	const targetClaim = getTargetClaim(existing, request);
	if (request.role === "reviewer" && !targetClaim) {
		showCommandMessage(pi, ctx, "Usage: /comath run reviewer <claim-id>");
		return;
	}

	const task = buildRoleTask(request.role, existing, targetWorkstream, targetClaim);
	const runId = `role-run-${existing.roleRuns.length + 1}`;
	const startedAt = new Date().toISOString();
	const statePath = getDefaultStatePath(ctx.cwd);
	const startedState = startRoleRun(existing, {
		id: runId,
		role: request.role,
		task,
		targetWorkstreamId: targetWorkstream?.id,
		targetClaimId: targetClaim?.id,
		now: startedAt,
		actor: request.role,
	});
	await saveProjectState(statePath, startedState);

	try {
		const result = await roleRunner({
			cwd: ctx.cwd,
			role: request.role,
			task,
			signal: ctx.signal,
		});
		const now = new Date().toISOString();
		const reportId = `report-${startedState.reports.length + 1}`;
		const ingestion = ingestRoleRunResult(startedState, {
			now,
			reportId,
			result,
			role: request.role,
			targetClaim,
			targetWorkstream,
		});
		const finishedState = finishRoleRun(ingestion.state, {
			runId,
			status: result.blockers && result.blockers.length > 0 ? "blocked" : "completed",
			reportId,
			createdClaimIds: ingestion.createdClaimIds,
			createdEvidenceIds: ingestion.createdEvidenceIds,
			createdWarningIds: ingestion.createdWarningIds,
			createdArtifactIds: ingestion.createdArtifactIds,
			blockerMessages: result.blockers,
			now,
			actor: request.role,
		});
		await saveProjectState(statePath, finishedState);
		showCommandMessage(pi, ctx, formatRoleRunMessage(request.role, reportId, result));
	} catch (error) {
		const errorMessage = getRoleRunErrorMessage(error);
		const now = new Date().toISOString();
		const status = isRoleRunAbort(ctx, errorMessage) ? "aborted" : "failed";
		const failedState = failRoleRun(startedState, {
			runId,
			status,
			errorMessage,
			now,
			actor: "system",
		});
		await saveProjectState(statePath, failedState);
		showCommandMessage(pi, ctx, `Co-math ${request.role} role run ${runId} ${status}: ${errorMessage}`);
	}
}

interface RoleRunRequest {
	role: CoMathRole;
	targetId?: string;
}

interface IngestRoleRunInput {
	now: string;
	reportId: string;
	result: RoleRunResult;
	role: CoMathRole;
	targetClaim?: Claim;
	targetWorkstream?: Workstream;
}

interface IngestRoleRunOutput {
	state: CoMathProjectState;
	createdClaimIds: string[];
	createdEvidenceIds: string[];
	createdWarningIds: string[];
	createdArtifactIds: string[];
}

function parseRoleRunRequest(text: string): RoleRunRequest | undefined {
	const [role, targetId] = text.trim().split(/\s+/);
	if (role === "coordinator" || role === "workstream" || role === "reviewer" || role === "synthesizer") {
		return { role, targetId };
	}
	return undefined;
}

function getTargetWorkstream(state: CoMathProjectState, request: RoleRunRequest): Workstream | undefined {
	if (request.role !== "workstream" || !request.targetId) return undefined;
	return state.workstreams.find((workstream) => workstream.id === request.targetId);
}

function getTargetClaim(state: CoMathProjectState, request: RoleRunRequest): Claim | undefined {
	if (request.role !== "reviewer" || !request.targetId) return undefined;
	return state.claims.find((claim) => claim.id === request.targetId);
}

function ingestRoleRunResult(state: CoMathProjectState, input: IngestRoleRunInput): IngestRoleRunOutput {
	const reportTitle = input.targetWorkstream
		? `${input.role} role run: ${input.targetWorkstream.id}`
		: input.targetClaim
			? `${input.role} role run: ${input.targetClaim.id}`
			: `${input.role} role run`;
	let nextState = addReport(state, {
		id: input.reportId,
		title: reportTitle,
		summary: input.result.summary,
		blockers: input.result.blockers,
		now: input.now,
		actor: input.role,
	});
	nextState = ingestProposedArtifacts(nextState, input);

	if (input.targetClaim && input.result.reviewDecision) {
		return buildIngestOutput(state, ingestReviewerDecision(nextState, input));
	}

	if (!input.targetWorkstream) return buildIngestOutput(state, nextState);

	nextState = attachWorkstreamReport(nextState, {
		workstreamId: input.targetWorkstream.id,
		reportId: input.reportId,
		now: input.now,
	});

	for (const proposedClaim of input.result.proposedClaims ?? []) {
		const claimId = `claim-${nextState.claims.length + 1}`;
		nextState = addClaim(nextState, {
			id: claimId,
			workstreamId: input.targetWorkstream.id,
			statement: proposedClaim.statement,
			status: "needs_review",
			now: input.now,
			actor: input.role,
		});
		nextState = addReviewQueueItem(nextState, {
			id: `review-${nextState.reviewQueue.length + 1}`,
			claimId,
			reason: "Workstream proposed a claim that needs reviewer validation.",
			now: input.now,
			actor: input.role,
		});

		for (const proposedEvidence of proposedClaim.evidence ?? []) {
			nextState = addEvidence(nextState, {
				id: `evidence-${nextState.evidence.length + 1}`,
				claimId,
				kind: proposedEvidence.kind,
				summary: proposedEvidence.summary,
				now: input.now,
				actor: input.role,
			});
		}

		for (const proposedWarning of proposedClaim.warnings ?? []) {
			nextState = addWarning(nextState, {
				id: `warning-${nextState.warnings.length + 1}`,
				claimId,
				severity: proposedWarning.severity,
				message: proposedWarning.message,
				now: input.now,
				actor: input.role,
			});
		}
	}

	return buildIngestOutput(state, nextState);
}

function buildIngestOutput(initialState: CoMathProjectState, state: CoMathProjectState): IngestRoleRunOutput {
	return {
		state,
		createdClaimIds: state.claims.slice(initialState.claims.length).map((claim) => claim.id),
		createdEvidenceIds: state.evidence.slice(initialState.evidence.length).map((evidence) => evidence.id),
		createdWarningIds: state.warnings.slice(initialState.warnings.length).map((warning) => warning.id),
		createdArtifactIds: state.artifacts.slice(initialState.artifacts.length).map((artifact) => artifact.id),
	};
}

function ingestProposedArtifacts(state: CoMathProjectState, input: IngestRoleRunInput): CoMathProjectState {
	let nextState = state;
	for (const proposedArtifact of input.result.proposedArtifacts ?? []) {
		nextState = addArtifact(nextState, {
			id: `artifact-${nextState.artifacts.length + 1}`,
			kind: proposedArtifact.kind,
			title: proposedArtifact.title,
			summary: proposedArtifact.summary,
			provenance: proposedArtifact.provenance,
			path: proposedArtifact.path,
			relatedClaimIds: uniqueStrings([
				...(proposedArtifact.relatedClaimIds ?? []),
				...(input.targetClaim ? [input.targetClaim.id] : []),
			]),
			relatedWorkstreamIds: uniqueStrings([
				...(proposedArtifact.relatedWorkstreamIds ?? []),
				...(input.targetWorkstream ? [input.targetWorkstream.id] : []),
			]),
			relatedReportIds: [input.reportId],
			now: input.now,
			actor: input.role,
		});
	}
	return nextState;
}

function ingestReviewerDecision(state: CoMathProjectState, input: IngestRoleRunInput): CoMathProjectState {
	if (!input.targetClaim || !input.result.reviewDecision) return state;
	const decision = input.result.reviewDecision;
	if (decision.claimId !== input.targetClaim.id) return state;

	let nextState = addReviewDecisionEvent(state, {
		claimId: decision.claimId,
		status: decision.status,
		reportId: input.reportId,
		now: input.now,
		actor: input.role,
	});
	for (const warningId of decision.resolvedWarningIds ?? []) {
		nextState = resolveWarning(nextState, {
			warningId,
			now: input.now,
			actor: input.role,
		});
	}

	for (const proposedEvidence of decision.evidence ?? []) {
		nextState = addEvidence(nextState, {
			id: `evidence-${nextState.evidence.length + 1}`,
			claimId: decision.claimId,
			kind: proposedEvidence.kind,
			summary: proposedEvidence.summary,
			now: input.now,
			actor: input.role,
		});
	}

	for (const proposedWarning of decision.warnings ?? []) {
		nextState = addWarning(nextState, {
			id: `warning-${nextState.warnings.length + 1}`,
			claimId: decision.claimId,
			severity: proposedWarning.severity,
			message: proposedWarning.message,
			now: input.now,
			actor: input.role,
		});
	}

	if (decision.status === "proved") {
		try {
			nextState = setClaimStatus(nextState, {
				claimId: decision.claimId,
				status: "proved",
				now: input.now,
				actor: input.role,
			});
			nextState = removeReviewQueueItemsForClaim(nextState, decision.claimId, input.now);
		} catch {
			nextState = addReviewQueueItem(nextState, {
				id: `review-${nextState.reviewQueue.length + 1}`,
				claimId: decision.claimId,
				reason: "Reviewer left unresolved proof obligations or open warnings.",
				now: input.now,
				actor: input.role,
			});
		}
		return nextState;
	}

	nextState = setClaimStatus(nextState, {
		claimId: decision.claimId,
		status: decision.status,
		now: input.now,
		actor: input.role,
	});
	if (decision.status === "needs_review") {
		return addReviewQueueItem(nextState, {
			id: `review-${nextState.reviewQueue.length + 1}`,
			claimId: decision.claimId,
			reason: "Reviewer requested another review pass.",
			now: input.now,
			actor: input.role,
		});
	}
	return removeReviewQueueItemsForClaim(nextState, decision.claimId, input.now);
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(new Set(values));
}

function getRoleRunErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isRoleRunAbort(ctx: ExtensionCommandContext, errorMessage: string): boolean {
	return ctx.signal?.aborted === true || errorMessage === "Co-math role run was aborted.";
}

function formatRoleRunMessage(role: CoMathRole, reportId: string, result: RoleRunResult): string {
	if (result.reviewDecision) {
		return `Ran co-math ${role} and saved report ${reportId} with review decision for ${result.reviewDecision.claimId}: ${result.summary}`;
	}
	const proposedClaimCount = result.proposedClaims?.length ?? 0;
	if (proposedClaimCount > 0) {
		const claimWord = proposedClaimCount === 1 ? "claim" : "claims";
		return `Ran co-math ${role} and saved report ${reportId} with ${proposedClaimCount} proposed ${claimWord}: ${result.summary}`;
	}
	return `Ran co-math ${role} and saved report ${reportId}: ${result.summary}`;
}

function buildRoleTask(
	role: CoMathRole,
	state: CoMathProjectState,
	targetWorkstream?: Workstream,
	targetClaim?: Claim,
): string {
	const openWarnings = state.warnings.filter((warning) => warning.status === "open");
	const targetLines = [...formatTargetWorkstream(targetWorkstream), ...formatTargetClaim(state, targetClaim)];
	return [
		`Role: ${role}`,
		`Root question: ${state.rootQuestion}`,
		...targetLines,
		"Approved goals:",
		...formatGoals(state),
		"Workstreams:",
		...formatWorkstreams(state),
		`Claims: ${state.claims.length}`,
		`Open warnings: ${openWarnings.length}`,
		"Instructions:",
		"- Do not promote any mathematical claim to proved unless proof evidence exists and no attached warning is open.",
		"- Return proposed next steps as a concise report. Do not mutate project state directly.",
		"- Preserve failed attempts, blockers, uncertainty labels, and provenance requirements.",
	].join("\n");
}

function formatTargetWorkstream(targetWorkstream?: Workstream): string[] {
	if (!targetWorkstream) return [];
	return [`Target workstream: ${targetWorkstream.id}`, `Target workstream goal: ${targetWorkstream.title}`];
}

function formatTargetClaim(state: CoMathProjectState, targetClaim?: Claim): string[] {
	if (!targetClaim) return [];
	return [
		`Target claim: ${targetClaim.id}`,
		`Target claim status: ${targetClaim.status}`,
		`Claim statement: ${targetClaim.statement}`,
		"Claim evidence:",
		...formatTargetClaimEvidence(state, targetClaim),
		"Attached warnings:",
		...formatTargetClaimWarnings(state, targetClaim),
	];
}

function formatTargetClaimEvidence(state: CoMathProjectState, targetClaim: Claim): string[] {
	const evidenceLines = targetClaim.evidenceIds.map((evidenceId) => {
		const evidence = state.evidence.find((candidate) => candidate.id === evidenceId);
		return evidence ? `- ${evidence.id} [${evidence.kind}]: ${evidence.summary}` : `- ${evidenceId}: missing`;
	});
	return evidenceLines.length === 0 ? ["- none"] : evidenceLines;
}

function formatTargetClaimWarnings(state: CoMathProjectState, targetClaim: Claim): string[] {
	const warningLines = targetClaim.warningIds.map((warningId) => {
		const warning = state.warnings.find((candidate) => candidate.id === warningId);
		return warning
			? `- ${warning.id} [${warning.severity}] ${warning.status}: ${warning.message}`
			: `- ${warningId}: missing`;
	});
	return warningLines.length === 0 ? ["- none"] : warningLines;
}

function formatGoals(state: CoMathProjectState): string[] {
	if (state.approvedGoals.length === 0) return ["- none"];
	return state.approvedGoals.map((goal) => `- ${goal.id}: ${goal.text} [${goal.status}]`);
}

function formatWorkstreams(state: CoMathProjectState): string[] {
	if (state.workstreams.length === 0) return ["- none"];
	return state.workstreams.map((workstream) => {
		const goalList = workstream.goalIds.length === 0 ? "none" : workstream.goalIds.join(", ");
		return `- ${workstream.id}: ${workstream.title} (goals: ${goalList})`;
	});
}

async function showReviewQueue(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const state = await loadProjectStateOrNotify(pi, ctx);
	if (!state) {
		return;
	}

	const openWarnings = state.warnings.filter((warning) => warning.status === "open");
	if (state.reviewQueue.length === 0 && openWarnings.length === 0) {
		showCommandMessage(pi, ctx, "Review queue\nNo claims or open warnings are waiting for review.");
		return;
	}

	showCommandMessage(
		pi,
		ctx,
		[
			"Review queue",
			"Claims needing review:",
			...formatQueuedClaims(state),
			"Open warnings:",
			...formatOpenWarnings(state),
		].join("\n"),
	);
}

async function showArtifacts(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const state = await loadProjectStateOrNotify(pi, ctx);
	if (!state) {
		return;
	}

	showCommandMessage(pi, ctx, ["Co-math artifacts", ...formatArtifacts(state)].join("\n"));
}

function formatArtifacts(state: CoMathProjectState): string[] {
	if (state.artifacts.length === 0) return ["No artifacts recorded."];
	return state.artifacts.map(
		(artifact) => `- ${artifact.id} [${artifact.kind}] ${artifact.title}: ${artifact.summary}`,
	);
}

function formatQueuedClaims(state: CoMathProjectState): string[] {
	if (state.reviewQueue.length === 0) return ["- none"];
	return state.reviewQueue.map((item) => {
		const claim = state.claims.find((candidate) => candidate.id === item.claimId);
		if (!claim) return `- ${item.claimId}: missing claim (${item.reason})`;
		return `- ${claim.id} [${claim.status}]: ${claim.statement} (${item.reason})`;
	});
}

async function loadProjectStateOrNotify(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
): Promise<CoMathProjectState | undefined> {
	const statePath = getDefaultStatePath(ctx.cwd);
	const state = await loadProjectState(statePath);
	if (!state) {
		showCommandMessage(pi, ctx, `No co-math project state found at ${statePath}. Run /comath init <root question>.`);
		return undefined;
	}
	return state;
}

function parseWorkstreamText(text: string): { slug: string; title: string } {
	const separatorIndex = text.indexOf(":");
	if (separatorIndex === -1) {
		return {
			slug: slugify(text),
			title: text,
		};
	}

	const slugText = text.slice(0, separatorIndex).trim();
	const title = text.slice(separatorIndex + 1).trim();
	return {
		slug: slugify(slugText || title),
		title: title || slugText,
	};
}

function nextWorkstreamId(state: CoMathProjectState, slug: string): string {
	const baseId = `workstream-${slug || state.workstreams.length + 1}`;
	if (!state.workstreams.some((workstream) => workstream.id === baseId)) {
		return baseId;
	}

	let suffix = 2;
	while (state.workstreams.some((workstream) => workstream.id === `${baseId}-${suffix}`)) {
		suffix += 1;
	}
	return `${baseId}-${suffix}`;
}

function slugify(text: string): string {
	const slug = text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "untitled";
}

async function showProjectStatus(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const statePath = getDefaultStatePath(ctx.cwd);
	const state = await loadProjectState(statePath);
	if (!state) {
		showCommandMessage(pi, ctx, `No co-math project state found at ${statePath}. Run /comath init <root question>.`);
		return;
	}

	showCommandMessage(
		pi,
		ctx,
		[
			`Co-math project: ${state.title}`,
			`Root question: ${state.rootQuestion}`,
			`Goals: ${state.approvedGoals.length}`,
			`Workstreams: ${state.workstreams.length}`,
			`Claims: ${state.claims.length}`,
			`Open warnings: ${state.warnings.filter((warning) => warning.status === "open").length}`,
			`Artifacts: ${state.artifacts.length}`,
			`Events: ${state.events.length}`,
			"Workstream statuses:",
			...formatWorkstreamStatusCounts(state),
			"Role runs:",
			...formatRoleRunStatusCounts(state),
		].join("\n"),
	);
}

async function showRoleRuns(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const state = await loadProjectStateOrNotify(pi, ctx);
	if (!state) {
		return;
	}

	showCommandMessage(pi, ctx, ["Co-math role runs", ...formatRoleRunList(state)].join("\n"));
}

function formatRoleRunList(state: CoMathProjectState): string[] {
	if (state.roleRuns.length === 0) return ["No role runs recorded."];
	return [...state.roleRuns].reverse().map((run) => {
		const report = run.reportId ? ` -> ${run.reportId}` : "";
		const blockers = run.blockerMessages.length > 0 ? `\n  blockers: ${run.blockerMessages.join("; ")}` : "";
		return `- ${run.id} [${run.status}] ${formatRoleRunTarget(run)}${report}${blockers}`;
	});
}

async function showRoleRunStatus(pi: ExtensionAPI, ctx: ExtensionCommandContext, runId: string): Promise<void> {
	if (runId.length === 0) {
		showCommandMessage(pi, ctx, "Usage: /comath run-status <run-id>");
		return;
	}

	const state = await loadProjectStateOrNotify(pi, ctx);
	if (!state) {
		return;
	}

	const run = state.roleRuns.find((candidate) => candidate.id === runId);
	if (!run) {
		showCommandMessage(pi, ctx, `No role run found for ${runId}.`);
		return;
	}

	showCommandMessage(pi, ctx, formatRoleRunDetails(run));
}

async function recoverStaleRoleRun(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const parsed = parseRecoverRunText(text);
	if (!parsed) {
		showCommandMessage(pi, ctx, "Usage: /comath recover-run <run-id> <failed|aborted>: <reason>");
		return;
	}

	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}

	const run = existing.roleRuns.find((candidate) => candidate.id === parsed.runId);
	if (!run) {
		showCommandMessage(pi, ctx, `No role run found for ${parsed.runId}.`);
		return;
	}
	if (run.status !== "running") {
		showCommandMessage(pi, ctx, `Cannot recover ${run.id} because its status is ${run.status}.`);
		return;
	}

	const now = new Date().toISOString();
	const summary = `Recovered stale role run ${run.id} as ${parsed.status}: ${parsed.reason}`;
	let state = failRoleRun(existing, {
		runId: run.id,
		status: parsed.status,
		errorMessage: parsed.reason,
		now,
		actor: "human",
	});
	state = recordHumanInterventionEvent(state, {
		summary,
		subjectId: run.id,
		relatedIds: uniqueStrings([run.id, ...getRoleRunTargetRelatedIds(run)]),
		now,
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(pi, ctx, summary);
}

function formatRoleRunDetails(run: RoleRunRecord): string {
	return [
		run.id,
		`Role: ${run.role}`,
		`Status: ${run.status}`,
		...(run.targetWorkstreamId ? [`Target workstream: ${run.targetWorkstreamId}`] : []),
		...(run.targetClaimId ? [`Target claim: ${run.targetClaimId}`] : []),
		`Report: ${run.reportId ?? "none"}`,
		`Created claims: ${formatIdList(run.createdClaimIds)}`,
		`Created evidence: ${formatIdList(run.createdEvidenceIds)}`,
		`Created warnings: ${formatIdList(run.createdWarningIds)}`,
		`Created artifacts: ${formatIdList(run.createdArtifactIds)}`,
		"Blockers:",
		...formatBlockerLines(run.blockerMessages),
		...(run.errorMessage ? [`Error: ${run.errorMessage}`] : []),
		`Started: ${run.startedAt}`,
		`Completed: ${run.completedAt ?? "none"}`,
	].join("\n");
}

function formatRoleRunTarget(run: RoleRunRecord): string {
	if (run.targetWorkstreamId) return `${run.role} ${run.targetWorkstreamId}`;
	if (run.targetClaimId) return `${run.role} ${run.targetClaimId}`;
	return run.role;
}

function getRoleRunTargetRelatedIds(run: RoleRunRecord): string[] {
	return [run.targetWorkstreamId, run.targetClaimId].filter((id) => id !== undefined);
}

function formatIdList(ids: string[]): string {
	return ids.length === 0 ? "none" : ids.join(", ");
}

function formatBlockerLines(blockers: string[]): string[] {
	return blockers.length === 0 ? ["- none"] : blockers.map((blocker) => `- ${blocker}`);
}

function formatWorkstreamStatusCounts(state: CoMathProjectState): string[] {
	const statuses: WorkstreamStatus[] = ["active", "running", "blocked", "needs_review"];
	return statuses.map(
		(status) => `- ${status}: ${state.workstreams.filter((workstream) => workstream.status === status).length}`,
	);
}

function formatRoleRunStatusCounts(state: CoMathProjectState): string[] {
	const statuses: RoleRunStatus[] = ["running", "completed", "blocked", "failed", "aborted"];
	return statuses.map((status) => `- ${status}: ${state.roleRuns.filter((run) => run.status === status).length}`);
}

async function showTimeline(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const state = await loadProjectStateOrNotify(pi, ctx);
	if (!state) {
		return;
	}

	showCommandMessage(pi, ctx, ["Co-math timeline", ...formatTimeline(state)].join("\n"));
}

function formatTimeline(state: CoMathProjectState): string[] {
	const events = state.events.slice(-10);
	if (events.length === 0) return ["No events recorded."];
	return events.map((event) => `- ${event.id} [${event.kind}] ${event.actor}: ${event.summary}`);
}

async function showProjectSynthesis(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const state = await loadProjectStateOrNotify(pi, ctx);
	if (!state) {
		return;
	}

	const synthesis = buildSynthesisMarkdown(state);
	const nextState = addSynthesisEvent(state, {
		now: new Date().toISOString(),
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), nextState);
	showCommandMessage(pi, ctx, synthesis);
}

function buildSynthesisMarkdown(state: CoMathProjectState): string {
	return [
		`# Co-math synthesis: ${state.title}`,
		"",
		"This synthesis is cautious: only reviewed proved claims are included as findings. Unreviewed claims remain excluded from the findings section.",
		"",
		"## Root question",
		state.rootQuestion,
		"",
		"## Proved claims",
		...formatProvedClaims(state),
		"",
		"## Open warnings",
		...formatOpenWarnings(state),
		"",
		"## Excluded unreviewed claims",
		...formatExcludedClaims(state),
	].join("\n");
}

function formatProvedClaims(state: CoMathProjectState): string[] {
	const provedClaims = state.claims.filter((claim) => isClaimSynthesisEligible(state, claim.id));
	if (provedClaims.length === 0) return ["No reviewed proved claims are recorded."];
	return provedClaims.map((claim) => {
		const evidence = formatClaimEvidence(state, claim);
		return `- ${claim.id}: ${claim.statement}${evidence}`;
	});
}

function formatClaimEvidence(state: CoMathProjectState, claim: Claim): string {
	const evidenceSummaries = claim.evidenceIds
		.map((evidenceId) => state.evidence.find((evidence) => evidence.id === evidenceId))
		.filter((evidence) => evidence !== undefined)
		.map((evidence) => `${evidence.kind}: ${evidence.summary}`);
	if (evidenceSummaries.length === 0) return "";
	return ` (evidence: ${evidenceSummaries.join("; ")})`;
}

function formatOpenWarnings(state: CoMathProjectState): string[] {
	const openWarnings = state.warnings.filter((warning) => warning.status === "open");
	if (openWarnings.length === 0) return ["No open warnings are recorded."];
	return openWarnings.map((warning) => formatWarning(warning));
}

function formatWarning(warning: Warning): string {
	return `- ${warning.id} [${warning.severity}] on ${warning.claimId}: ${warning.message}`;
}

function formatExcludedClaims(state: CoMathProjectState): string[] {
	const excludedClaims = state.claims.filter((claim) => !isClaimSynthesisEligible(state, claim.id));
	if (excludedClaims.length === 0) return ["No unreviewed claims are excluded."];
	return excludedClaims.map(
		(claim) => `- ${claim.id} [${claim.status}] excluded from synthesis findings pending review.`,
	);
}

function showCommandMessage(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): void {
	if (ctx.hasUI) {
		ctx.ui.notify(text, "info");
		return;
	}

	pi.sendMessage({
		customType: "co-math",
		content: text,
		display: true,
		details: { kind: "command" },
	});
}
