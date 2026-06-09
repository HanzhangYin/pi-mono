import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "../../../src/core/extensions/types.ts";
import {
	type CoMathRole,
	createDefaultRoleRunner,
	type ReviewDecision,
	type RoleRunner,
	type RoleRunResult,
} from "./role-runner.ts";
import type {
	ArtifactKind,
	Claim,
	CoMathProjectState,
	EvidenceKind,
	MarginNote,
	MarginNoteKind,
	ReportReviewOutcome,
	ReviewRoundOutcome,
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
	addMarginNote,
	addReport,
	addReportReviewRound,
	addReviewDecisionEvent,
	addReviewQueueItem,
	addReviewRound,
	addSynthesisEvent,
	addWarning,
	addWorkingPaperSection,
	addWorkstream,
	attachWorkstreamReport,
	cancelQueuedRoleRun,
	createEmptyProjectState,
	dispatchQueuedRoleRun,
	failRoleRun,
	finishRoleRun,
	getDefaultStatePath,
	isClaimSynthesisEligible,
	loadProjectState,
	queueRoleRun,
	recordHumanInterventionEvent,
	recordWorkingPaperExport,
	removeReviewQueueItemsForClaim,
	resolveMarginNote,
	resolveWarning,
	reviseClaim,
	saveProjectState,
	setClaimStatus,
	setGoalStatus,
	setWorkstreamStatus,
	startRoleRun,
} from "./storage.ts";

interface BackgroundRoleRunHandle {
	runId: string;
	role: CoMathRole;
	startedAt: string;
	controller: AbortController;
	completion: Promise<void>;
}

const backgroundRoleRuns = new Map<string, BackgroundRoleRunHandle>();
const COMATH_COMPUTATION_TIMEOUT_MS = 60_000;
const COMATH_COMPUTATION_PREVIEW_CHARS = 2_000;
const ROLE_RUN_HEARTBEAT_INTERVAL_MS = 15_000;
const INVALID_STRUCTURED_JSON_BLOCKER = "Role output was not valid structured co-math JSON; saved as report only.";

const HELP_TEXT = `Co-math assistant commands:
/comath help - show this help
/comath init <root question> - create a co-math project state
/comath goal <goal text> - add an approved active goal
/comath propose-goal <goal text> - propose a goal for explicit approval
/comath approve-goal <goal-id> - mark a proposed or active goal approved
/comath defer-goal <goal-id>: <reason> - defer a goal with a human reason
/comath goals - list goals and approval statuses
/comath workstream <slug>: <title> - add a workstream linked to active goals
/comath evidence <claim-id> <proof|computation|reference|counterexample|note>: <summary> - attach manual evidence
/comath warning <claim-id> <low|medium|high>: <message> - attach a manual warning
/comath resolve-warning <warning-id> - mark an attached warning resolved
/comath block <workstream-id>: <reason> - manually mark a workstream blocked
/comath unblock <workstream-id>: <reason> - manually return a workstream to active with a steering note
/comath note <subject-id>: <note> - record a human steering note as a metadata artifact
/comath artifact <kind> <title>: <summary> - manually record a workspace artifact
/comath artifact-file <kind> <path> <title>: <summary> - register an existing workspace file as an artifact
/comath computation --command <command> --out <path> [--title <title>] [--summary <summary>] - run a local computation and record hashed output provenance
/comath artifacts - list recorded artifacts
/comath audit - check co-math state invariants without mutating state
/comath review-queue - list claims and warnings waiting for review
/comath reviews [claim-id] - list recorded reviewer rounds
/comath review-report <report-id> <accepted|revision-requested|blocked>: <summary> - record report review outcome
/comath reports - list workstream reports and latest report reviews
/comath report-status <report-id> - show one report and its review rounds
/comath revise-claim <claim-id>: <new statement> --reason <reason> - revise a claim and return it to review
/comath claim-history <claim-id> - show claim revision and review history
/comath run <coordinator|workstream|reviewer|synthesizer> [workstream-id|claim-id] - run a bounded role and save its report
/comath queue <coordinator|workstream|reviewer|synthesizer> [workstream-id|claim-id] - queue a bounded role run without executing it
/comath dispatch-next - dispatch the oldest queued role run
/comath dispatch-next --background - start the oldest queued role run asynchronously
/comath dispatch-run <run-id> - dispatch a specific queued role run
/comath dispatch-run <run-id> --background - start a specific queued role run asynchronously
/comath cancel-run <run-id>: <reason> - cancel a queued role run before dispatch
/comath background-runs - list live in-process background role runs
/comath abort-run <run-id>: <reason> - request abort for a live background role run
/comath paper-section <title>: <body> [--sources id1,id2] - record a working-paper section draft
/comath margin-note <subject-id> <gap|todo|warning|provenance|comment>: <note> - attach a margin note
/comath resolve-margin-note <note-id>: <resolution> - resolve an open margin note
/comath margin-notes [open|resolved|all] - list margin notes
/comath paper - render the current living working paper
/comath export-paper [path] [--force] - write the living working paper markdown snapshot
/comath runs - list recent role run records
/comath run-status <run-id> - show one role run record
/comath workstream-status <workstream-id> - show one workstream record
/comath recover-run <run-id> <failed|aborted>: <reason> - close a stale running role run
/comath synthesize - produce cautious markdown from reviewed state
/comath timeline - show recent workspace events
/comath next - show the next safe workflow action
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

	if (subcommand === "propose-goal") {
		await proposeProjectGoal(pi, ctx, remainder);
		return;
	}

	if (subcommand === "approve-goal") {
		await approveProjectGoal(pi, ctx, remainder);
		return;
	}

	if (subcommand === "defer-goal") {
		await deferProjectGoal(pi, ctx, remainder);
		return;
	}

	if (subcommand === "goals") {
		await showProjectGoals(pi, ctx);
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

	if (subcommand === "artifact-file") {
		await addFileArtifact(pi, ctx, remainder);
		return;
	}

	if (subcommand === "computation") {
		await runComputationArtifact(pi, ctx, remainder);
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

	if (subcommand === "queue") {
		await queueProjectRole(pi, ctx, remainder);
		return;
	}

	if (subcommand === "dispatch-next") {
		await dispatchNextQueuedRoleRun(pi, ctx, remainder, roleRunner);
		return;
	}

	if (subcommand === "dispatch-run") {
		await dispatchSpecificQueuedRoleRun(pi, ctx, remainder, roleRunner);
		return;
	}

	if (subcommand === "cancel-run") {
		await cancelQueuedProjectRole(pi, ctx, remainder);
		return;
	}

	if (subcommand === "background-runs") {
		showBackgroundRoleRuns(pi, ctx);
		return;
	}

	if (subcommand === "abort-run") {
		await abortBackgroundRoleRun(pi, ctx, remainder);
		return;
	}

	if (subcommand === "paper-section") {
		await addPaperSection(pi, ctx, remainder);
		return;
	}

	if (subcommand === "margin-note") {
		await addPaperMarginNote(pi, ctx, remainder);
		return;
	}

	if (subcommand === "resolve-margin-note") {
		await resolvePaperMarginNote(pi, ctx, remainder);
		return;
	}

	if (subcommand === "margin-notes") {
		await showMarginNotes(pi, ctx, remainder);
		return;
	}

	if (subcommand === "paper") {
		await showLivingWorkingPaper(pi, ctx);
		return;
	}

	if (subcommand === "export-paper") {
		await exportLivingWorkingPaper(pi, ctx, remainder);
		return;
	}

	if (subcommand === "review-queue") {
		await showReviewQueue(pi, ctx);
		return;
	}

	if (subcommand === "reviews") {
		await showReviewRounds(pi, ctx, remainder);
		return;
	}

	if (subcommand === "review-report") {
		await reviewProjectReport(pi, ctx, remainder);
		return;
	}

	if (subcommand === "reports") {
		await showProjectReports(pi, ctx);
		return;
	}

	if (subcommand === "report-status") {
		await showReportStatus(pi, ctx, remainder);
		return;
	}

	if (subcommand === "revise-claim") {
		await reviseProjectClaim(pi, ctx, remainder);
		return;
	}

	if (subcommand === "claim-history") {
		await showClaimHistory(pi, ctx, remainder);
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

	if (subcommand === "workstream-status") {
		await showWorkstreamStatus(pi, ctx, remainder);
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

	if (subcommand === "next") {
		await showNextSafeAction(pi, ctx);
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

async function proposeProjectGoal(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	if (text.length === 0) {
		showCommandMessage(pi, ctx, "Usage: /comath propose-goal <goal text>");
		return;
	}

	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}

	const now = new Date().toISOString();
	const goalId = `goal-${existing.approvedGoals.length + 1}`;
	const state = addGoal(existing, {
		id: goalId,
		text,
		status: "proposed",
		now,
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(pi, ctx, `Proposed co-math goal ${goalId}: ${text}`);
}

async function approveProjectGoal(pi: ExtensionAPI, ctx: ExtensionCommandContext, goalId: string): Promise<void> {
	const trimmedGoalId = goalId.trim();
	if (trimmedGoalId.length === 0) {
		showCommandMessage(pi, ctx, "Usage: /comath approve-goal <goal-id>");
		return;
	}

	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}
	const goal = existing.approvedGoals.find((candidate) => candidate.id === trimmedGoalId);
	if (!goal) {
		showCommandMessage(pi, ctx, `Unknown goal: ${trimmedGoalId}`);
		return;
	}
	if (goal.status !== "proposed" && goal.status !== "active" && goal.status !== "approved") {
		showCommandMessage(pi, ctx, `Cannot approve ${trimmedGoalId} because its status is ${goal.status}.`);
		return;
	}

	const state = setGoalStatus(existing, {
		goalId: trimmedGoalId,
		status: "approved",
		now: new Date().toISOString(),
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(pi, ctx, `Approved co-math goal ${trimmedGoalId}: ${goal.text}`);
}

async function deferProjectGoal(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const parsed = parseSubjectBodyText(text);
	if (!parsed) {
		showCommandMessage(pi, ctx, "Usage: /comath defer-goal <goal-id>: <reason>");
		return;
	}

	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}
	const goal = existing.approvedGoals.find((candidate) => candidate.id === parsed.subjectId);
	if (!goal) {
		showCommandMessage(pi, ctx, `Unknown goal: ${parsed.subjectId}`);
		return;
	}

	const now = new Date().toISOString();
	const summary = `Deferred co-math goal ${goal.id}: ${parsed.body}`;
	let state = setGoalStatus(existing, {
		goalId: goal.id,
		status: "deferred",
		reason: parsed.body,
		now,
		actor: "human",
	});
	state = recordHumanInterventionEvent(state, {
		summary,
		subjectId: goal.id,
		relatedIds: [goal.id],
		now,
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(pi, ctx, summary);
}

async function showProjectGoals(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const state = await loadProjectStateOrNotify(pi, ctx);
	if (!state) {
		return;
	}
	showCommandMessage(pi, ctx, ["Co-math goals", ...formatGoalList(state)].join("\n"));
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
	const linkableGoalIds = getLinkableGoalIds(existing);
	if (existing.approvedGoals.length > 0 && linkableGoalIds.length === 0) {
		showCommandMessage(pi, ctx, "Approve at least one goal before creating workstreams.");
		return;
	}
	const now = new Date().toISOString();
	const statePath = getDefaultStatePath(ctx.cwd);
	const state = addWorkstream(existing, {
		id: nextWorkstreamId(existing, parsed.slug),
		title: parsed.title,
		goalIds: linkableGoalIds,
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

async function addFileArtifact(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const parsed = parseArtifactFileText(text);
	if (!parsed) {
		showCommandMessage(pi, ctx, "Usage: /comath artifact-file <kind> <path> <title>: <summary>");
		return;
	}
	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}
	const resolvedPath = resolveWorkspaceRelativePath(ctx.cwd, parsed.filePath);
	if (!resolvedPath) {
		showCommandMessage(pi, ctx, "Artifact path must stay inside the workspace.");
		return;
	}
	const artifactPathCheck = await checkExistingArtifactFilePath(ctx.cwd, resolvedPath);
	if (artifactPathCheck === "missing") {
		showCommandMessage(pi, ctx, `Artifact file does not exist: ${resolvedPath.relativePath}`);
		return;
	}
	if (artifactPathCheck === "directory") {
		showCommandMessage(pi, ctx, `Artifact path is not a file: ${resolvedPath.relativePath}`);
		return;
	}
	if (artifactPathCheck === "symlink") {
		showCommandMessage(pi, ctx, `Artifact path is a symlink and is not allowed: ${resolvedPath.relativePath}`);
		return;
	}
	if (artifactPathCheck === "outside_workspace") {
		showCommandMessage(pi, ctx, "Artifact path must stay inside the workspace.");
		return;
	}

	const artifactId = `artifact-${existing.artifacts.length + 1}`;
	const state = addArtifact(existing, {
		id: artifactId,
		kind: parsed.kind,
		title: parsed.title,
		summary: parsed.summary,
		path: resolvedPath.relativePath,
		now: new Date().toISOString(),
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(
		pi,
		ctx,
		`Recorded file artifact ${artifactId} [${parsed.kind}] ${resolvedPath.relativePath}: ${parsed.title}`,
	);
}

async function runComputationArtifact(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const parsed = parseComputationText(text);
	if (!parsed) {
		showCommandMessage(
			pi,
			ctx,
			"Usage: /comath computation --command <command> --out <path> [--title <title>] [--summary <summary>]",
		);
		return;
	}
	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}
	const resolvedPath = resolveWorkspaceRelativePath(ctx.cwd, parsed.outputPath);
	if (!resolvedPath) {
		showCommandMessage(pi, ctx, "Computation output path must stay inside the workspace.");
		return;
	}
	if (isStatePathRelative(resolvedPath.relativePath)) {
		showCommandMessage(pi, ctx, "Computation output path cannot overwrite .pi/co-math/state.json.");
		return;
	}
	const exportPathCheck = await checkExportTargetPath(ctx.cwd, resolvedPath);
	if (exportPathCheck === "outside_workspace") {
		showCommandMessage(pi, ctx, "Computation output path must stay inside the workspace.");
		return;
	}
	if (exportPathCheck === "symlink") {
		showCommandMessage(
			pi,
			ctx,
			`Computation output path is a symlink and is not allowed: ${resolvedPath.relativePath}`,
		);
		return;
	}
	if (exportPathCheck === "directory") {
		showCommandMessage(pi, ctx, `Computation output path is not a file: ${resolvedPath.relativePath}`);
		return;
	}
	if (exportPathCheck === "state_file") {
		showCommandMessage(pi, ctx, "Computation output path cannot overwrite .pi/co-math/state.json.");
		return;
	}
	if (exportPathCheck === "exists") {
		showCommandMessage(pi, ctx, `Computation output target already exists: ${resolvedPath.relativePath}.`);
		return;
	}

	const result = await runForegroundComputation(parsed.command, ctx.cwd);
	if (result.timedOut) {
		showCommandMessage(
			pi,
			ctx,
			`Computation timed out after ${result.elapsedMs}ms: ${formatComputationFailurePreview(result)}`,
		);
		return;
	}
	if (result.exitCode !== 0) {
		showCommandMessage(
			pi,
			ctx,
			`Computation failed with exit code ${result.exitCode ?? "none"} after ${result.elapsedMs}ms: ${formatComputationFailurePreview(result)}`,
		);
		return;
	}

	if (!(await existingParentSegmentsAreSafe(path.resolve(ctx.cwd), path.dirname(resolvedPath.absolutePath)))) {
		showCommandMessage(
			pi,
			ctx,
			`Computation output parent path contains a symlink and is not allowed: ${resolvedPath.relativePath}`,
		);
		return;
	}
	const artifactPathCheck = await checkExistingArtifactFilePath(ctx.cwd, resolvedPath);
	if (artifactPathCheck === "missing") {
		showCommandMessage(pi, ctx, `Computation output file does not exist: ${resolvedPath.relativePath}`);
		return;
	}
	if (artifactPathCheck === "directory") {
		showCommandMessage(pi, ctx, `Computation output path is not a file: ${resolvedPath.relativePath}`);
		return;
	}
	if (artifactPathCheck === "symlink") {
		showCommandMessage(
			pi,
			ctx,
			`Computation output path is a symlink and is not allowed: ${resolvedPath.relativePath}`,
		);
		return;
	}
	if (artifactPathCheck === "outside_workspace") {
		showCommandMessage(pi, ctx, "Computation output path must stay inside the workspace.");
		return;
	}

	const outputSha256 = createHash("sha256")
		.update(await readFile(resolvedPath.absolutePath))
		.digest("hex");
	const artifactId = `artifact-${existing.artifacts.length + 1}`;
	const state = addArtifact(existing, {
		id: artifactId,
		kind: "computation",
		title: parsed.title ?? `Computation output: ${resolvedPath.relativePath}`,
		summary: parsed.summary ?? `Local computation output recorded from ${resolvedPath.relativePath}.`,
		provenance: formatComputationProvenance({
			command: parsed.command,
			elapsedMs: result.elapsedMs,
			exitCode: result.exitCode,
			outputPath: resolvedPath.relativePath,
			outputSha256,
			signal: result.signal,
			stderr: result.stderr,
			stdout: result.stdout,
		}),
		path: resolvedPath.relativePath,
		now: new Date().toISOString(),
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(
		pi,
		ctx,
		`Recorded computation artifact ${artifactId} ${resolvedPath.relativePath} sha256=${outputSha256} elapsedMs=${result.elapsedMs}`,
	);
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

interface ParsedReportReviewCommand {
	reportId: string;
	outcome: ReportReviewOutcome;
	summary: string;
}

interface ParsedArtifactCommand {
	kind: ArtifactKind;
	title: string;
	summary: string;
}

interface ParsedArtifactFileCommand {
	kind: ArtifactKind;
	filePath: string;
	title: string;
	summary: string;
}

interface ParsedComputationCommand {
	command: string;
	outputPath: string;
	title?: string;
	summary?: string;
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

interface ParsedReviseClaimCommand {
	claimId: string;
	revisedStatement: string;
	reason: string;
}

interface ParsedPaperSectionCommand {
	title: string;
	body: string;
	sourceIds: string[];
}

interface ParsedMarginNoteCommand {
	subjectId: string;
	kind: MarginNoteKind;
	message: string;
}

interface ParsedExportPaperCommand {
	filePath: string;
	force: boolean;
}

interface ResolvedWorkspacePath {
	absolutePath: string;
	relativePath: string;
}

interface ShellToken {
	value: string;
	start: number;
}

interface OutputPreview {
	text: string;
	truncated: boolean;
}

interface ComputationRunResult {
	exitCode: number | null;
	signal: NodeJS.Signals | null;
	elapsedMs: number;
	stdout: OutputPreview;
	stderr: OutputPreview;
	timedOut: boolean;
}

interface FormatComputationProvenanceInput {
	command: string;
	exitCode: number | null;
	signal: NodeJS.Signals | null;
	elapsedMs: number;
	outputPath: string;
	outputSha256: string;
	stdout: OutputPreview;
	stderr: OutputPreview;
}

type ExistingArtifactPathProblem = "missing" | "directory" | "symlink" | "outside_workspace";
type ExportTargetPathProblem = "exists" | "directory" | "symlink" | "outside_workspace" | "state_file";

interface ClassifiedPaperSources {
	claimIds: string[];
	evidenceIds: string[];
	warningIds: string[];
	artifactIds: string[];
	reviewRoundIds: string[];
	roleRunIds: string[];
	unknownIds: string[];
}

type MarginNoteFilter = "open" | "resolved" | "all";

function parseSubjectBodyText(text: string): ParsedSubjectBodyCommand | undefined {
	const separatorIndex = text.indexOf(":");
	if (separatorIndex === -1) return undefined;
	const subjectId = text.slice(0, separatorIndex).trim();
	const body = text.slice(separatorIndex + 1).trim();
	if (subjectId.length === 0 || body.length === 0) return undefined;
	return { subjectId, body };
}

function parsePaperSectionText(text: string): ParsedPaperSectionCommand | undefined {
	const sourceMarker = " --sources ";
	const sourceIndex = text.indexOf(sourceMarker);
	const sectionText = sourceIndex === -1 ? text : text.slice(0, sourceIndex).trim();
	const sourceText = sourceIndex === -1 ? "" : text.slice(sourceIndex + sourceMarker.length).trim();
	const separatorIndex = sectionText.indexOf(":");
	if (separatorIndex === -1) return undefined;
	const title = sectionText.slice(0, separatorIndex).trim();
	const body = sectionText.slice(separatorIndex + 1).trim();
	if (title.length === 0 || body.length === 0) return undefined;
	return {
		title,
		body,
		sourceIds: sourceText
			.split(",")
			.map((sourceId) => sourceId.trim())
			.filter((sourceId) => sourceId.length > 0),
	};
}

function parseMarginNoteText(text: string): ParsedMarginNoteCommand | undefined {
	const separatorIndex = text.indexOf(":");
	if (separatorIndex === -1) return undefined;
	const header = text.slice(0, separatorIndex).trim();
	const message = text.slice(separatorIndex + 1).trim();
	const [subjectId, kind, ...extra] = header.split(/\s+/);
	if (!subjectId || !kind || extra.length > 0 || message.length === 0 || !isMarginNoteKind(kind)) return undefined;
	return { subjectId, kind, message };
}

function parseExportPaperText(text: string): ParsedExportPaperCommand | undefined {
	const tokens = text.trim().length === 0 ? [] : text.trim().split(/\s+/);
	const force = tokens.at(-1) === "--force";
	const pathTokens = force ? tokens.slice(0, -1) : tokens;
	if (pathTokens.some((token) => token.startsWith("--"))) return undefined;
	if (pathTokens.length > 1) return undefined;
	return {
		filePath: pathTokens[0] ?? ".pi/co-math/exports/working-paper.md",
		force,
	};
}

function parseMarginNoteFilter(text: string): MarginNoteFilter | undefined {
	if (text.length === 0) return "open";
	if (text === "open" || text === "resolved" || text === "all") return text;
	return undefined;
}

function isMarginNoteKind(value: string): value is MarginNoteKind {
	return value === "gap" || value === "todo" || value === "warning" || value === "provenance" || value === "comment";
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

function parseArtifactFileText(text: string): ParsedArtifactFileCommand | undefined {
	const [kind, filePath, ...rest] = text.trim().split(/\s+/);
	if (!kind || !isArtifactKind(kind) || !filePath) return undefined;
	const body = rest.join(" ").trim();
	const separatorIndex = body.indexOf(":");
	if (separatorIndex === -1) return undefined;
	const title = body.slice(0, separatorIndex).trim();
	const summary = body.slice(separatorIndex + 1).trim();
	if (title.length === 0 || summary.length === 0) return undefined;
	return { kind, filePath, title, summary };
}

function parseComputationText(text: string): ParsedComputationCommand | undefined {
	const tokens = tokenizeShellLike(text);
	if (!tokens) return undefined;

	let command: string | undefined;
	let outputPath: string | undefined;
	let title: string | undefined;
	let summary: string | undefined;
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (!token) return undefined;
		if (
			token.value !== "--command" &&
			token.value !== "--out" &&
			token.value !== "--title" &&
			token.value !== "--summary"
		) {
			return undefined;
		}
		const valueToken = tokens[index + 1];
		if (!valueToken || isComputationFlag(valueToken.value)) {
			return undefined;
		}
		if (token.value === "--command") {
			command = valueToken.value;
		} else if (token.value === "--out") {
			outputPath = valueToken.value;
		} else if (token.value === "--title") {
			title = valueToken.value;
		} else {
			summary = valueToken.value;
		}
		index += 1;
	}
	if (!command || command.trim().length === 0) return undefined;
	if (!outputPath) return undefined;
	return {
		command: command.trim(),
		outputPath,
		...(title !== undefined ? { title } : {}),
		...(summary !== undefined ? { summary } : {}),
	};
}

function tokenizeShellLike(text: string): ShellToken[] | undefined {
	const tokens: ShellToken[] = [];
	let current = "";
	let tokenStart: number | undefined;
	let quote: "'" | '"' | undefined;
	let escaped = false;
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		if (!char) continue;
		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}
		if (char === "\\" && quote !== "'") {
			if (tokenStart === undefined) tokenStart = index;
			escaped = true;
			continue;
		}
		if (quote) {
			if (char === quote) {
				quote = undefined;
			} else {
				current += char;
			}
			continue;
		}
		if (char === "'" || char === '"') {
			if (tokenStart === undefined) tokenStart = index;
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			if (tokenStart !== undefined) {
				tokens.push({ value: current, start: tokenStart });
				current = "";
				tokenStart = undefined;
			}
			continue;
		}
		if (tokenStart === undefined) tokenStart = index;
		current += char;
	}
	if (escaped || quote) return undefined;
	if (tokenStart !== undefined) {
		tokens.push({ value: current, start: tokenStart });
	}
	return tokens;
}

function isComputationFlag(value: string): boolean {
	return value === "--command" || value === "--out" || value === "--title" || value === "--summary";
}

function parseReviseClaimText(text: string): ParsedReviseClaimCommand | undefined {
	const reasonMarker = " --reason ";
	const reasonIndex = text.indexOf(reasonMarker);
	if (reasonIndex === -1) return undefined;
	const claimText = text.slice(0, reasonIndex).trim();
	const reason = text.slice(reasonIndex + reasonMarker.length).trim();
	const separatorIndex = claimText.indexOf(":");
	if (separatorIndex === -1) return undefined;
	const claimId = claimText.slice(0, separatorIndex).trim();
	const revisedStatement = claimText.slice(separatorIndex + 1).trim();
	if (claimId.length === 0 || revisedStatement.length === 0 || reason.length === 0) return undefined;
	return { claimId, revisedStatement, reason };
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

function parseReportReviewText(text: string): ParsedReportReviewCommand | undefined {
	const separatorIndex = text.indexOf(":");
	if (separatorIndex === -1) return undefined;
	const header = text.slice(0, separatorIndex).trim();
	const summary = text.slice(separatorIndex + 1).trim();
	const [reportId, outcomeText, ...extra] = header.split(/\s+/);
	if (!reportId || !outcomeText || extra.length > 0 || summary.length === 0) return undefined;
	const outcome = normalizeReportReviewOutcomeText(outcomeText);
	if (!outcome) return undefined;
	return { reportId, outcome, summary };
}

function normalizeReportReviewOutcomeText(value: string): ReportReviewOutcome | undefined {
	if (value === "accepted") return "accepted";
	if (value === "revision-requested") return "revision_requested";
	if (value === "blocked") return "blocked";
	return undefined;
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
		value === "human_note" ||
		value === "working_paper_export"
	);
}

function classifyPaperSources(state: CoMathProjectState, sourceIds: string[]): ClassifiedPaperSources {
	const sources: ClassifiedPaperSources = {
		claimIds: [],
		evidenceIds: [],
		warningIds: [],
		artifactIds: [],
		reviewRoundIds: [],
		roleRunIds: [],
		unknownIds: [],
	};
	for (const sourceId of uniqueStrings(sourceIds)) {
		if (state.claims.some((claim) => claim.id === sourceId)) {
			sources.claimIds.push(sourceId);
		} else if (state.evidence.some((evidence) => evidence.id === sourceId)) {
			sources.evidenceIds.push(sourceId);
		} else if (state.warnings.some((warning) => warning.id === sourceId)) {
			sources.warningIds.push(sourceId);
		} else if (state.artifacts.some((artifact) => artifact.id === sourceId)) {
			sources.artifactIds.push(sourceId);
		} else if (state.reviewRounds.some((round) => round.id === sourceId)) {
			sources.reviewRoundIds.push(sourceId);
		} else if (state.roleRuns.some((run) => run.id === sourceId)) {
			sources.roleRunIds.push(sourceId);
		} else {
			sources.unknownIds.push(sourceId);
		}
	}
	return sources;
}

function paperSubjectExists(state: CoMathProjectState, subjectId: string): boolean {
	return (
		subjectId === "project" ||
		state.workstreams.some((workstream) => workstream.id === subjectId) ||
		state.claims.some((claim) => claim.id === subjectId) ||
		state.evidence.some((evidence) => evidence.id === subjectId) ||
		state.warnings.some((warning) => warning.id === subjectId) ||
		state.artifacts.some((artifact) => artifact.id === subjectId) ||
		state.reviewRounds.some((round) => round.id === subjectId) ||
		state.roleRuns.some((run) => run.id === subjectId) ||
		state.reports.some((report) => report.id === subjectId) ||
		state.workingPaperSections.some((section) => section.id === subjectId)
	);
}

async function auditProjectState(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const statePath = getDefaultStatePath(ctx.cwd);
	const rawProblems = await collectRawAuditProblems(statePath);
	const state = await loadProjectStateOrNotify(pi, ctx);
	if (!state) {
		return;
	}

	const problems = [...rawProblems, ...(await collectAuditProblems(state, ctx.cwd))];
	showCommandMessage(
		pi,
		ctx,
		problems.length === 0
			? "Co-math audit\nNo co-math audit problems found."
			: ["Co-math audit", ...problems.map((problem) => `- ${problem}`)].join("\n"),
	);
}

async function collectRawAuditProblems(statePath: string): Promise<string[]> {
	let value: unknown;
	try {
		value = JSON.parse(await readFile(statePath, "utf8")) as unknown;
	} catch (error) {
		if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}
	if (!isRecord(value)) return [];
	const claims = getRawRecords(value, "claims");
	const evidenceById = new Map(
		getRawRecords(value, "evidence").map((evidence) => [getRawString(evidence, "id"), evidence]),
	);
	const warningById = new Map(
		getRawRecords(value, "warnings").map((warning) => [getRawString(warning, "id"), warning]),
	);
	const problems: string[] = [];

	for (const claim of claims) {
		const claimId = getRawString(claim, "id");
		if (!claimId) continue;
		for (const evidenceId of getRawStringArray(claim, "evidenceIds")) {
			const evidence = evidenceById.get(evidenceId);
			const ownerClaimId = evidence ? getRawString(evidence, "claimId") : undefined;
			if (ownerClaimId && ownerClaimId !== claimId) {
				problems.push(`${claimId} references evidence ${evidenceId} owned by ${ownerClaimId}`);
			}
		}
		for (const warningId of getRawStringArray(claim, "warningIds")) {
			const warning = warningById.get(warningId);
			const ownerClaimId = warning ? getRawString(warning, "claimId") : undefined;
			if (ownerClaimId && ownerClaimId !== claimId) {
				problems.push(`${claimId} references warning ${warningId} owned by ${ownerClaimId}`);
			}
		}
	}

	return problems;
}

async function collectAuditProblems(state: CoMathProjectState, cwd: string): Promise<string[]> {
	const problems: string[] = [];
	const claimIds = new Set(state.claims.map((claim) => claim.id));
	const evidenceIds = new Set(state.evidence.map((evidence) => evidence.id));
	const warningIds = new Set(state.warnings.map((warning) => warning.id));
	const artifactIds = new Set(state.artifacts.map((artifact) => artifact.id));
	const reportIds = new Set(state.reports.map((report) => report.id));
	const roleRunIds = new Set(state.roleRuns.map((run) => run.id));
	const reviewRoundIds = new Set(state.reviewRounds.map((round) => round.id));
	const workstreamIds = new Set(state.workstreams.map((workstream) => workstream.id));
	const marginNoteIds = new Set(state.marginNotes.map((note) => note.id));

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

	for (const artifact of state.artifacts) {
		if (artifact.path) {
			const resolvedPath = resolveWorkspaceRelativePath(cwd, artifact.path);
			if (!resolvedPath) {
				problems.push(`${artifact.id} path ${artifact.path} is outside workspace`);
			} else {
				const artifactPathProblem = await checkExistingArtifactFilePath(cwd, resolvedPath);
				if (artifactPathProblem === "missing") {
					problems.push(`${artifact.id} path ${artifact.path} does not exist`);
				} else if (artifactPathProblem === "directory") {
					problems.push(`${artifact.id} path ${artifact.path} is not a file`);
				} else if (artifactPathProblem === "symlink") {
					problems.push(`${artifact.id} path ${artifact.path} is a symlink`);
				} else if (artifactPathProblem === "outside_workspace") {
					problems.push(`${artifact.id} path ${artifact.path} is outside workspace`);
				}
			}
		}
		if (artifact.kind === "working_paper_export" && (!artifact.path || !artifact.path.endsWith(".md"))) {
			problems.push(`${artifact.id} is a working_paper_export artifact without a .md path`);
		}
	}

	for (const event of state.events) {
		if (event.kind === "working_paper_exported" && event.subjectId && !artifactIds.has(event.subjectId)) {
			problems.push(`${event.id} working_paper_exported subject ${event.subjectId} is missing`);
		}
	}

	for (const claim of state.claims) {
		for (const evidenceId of claim.evidenceIds) {
			const evidence = state.evidence.find((candidate) => candidate.id === evidenceId);
			if (!evidenceIds.has(evidenceId)) {
				problems.push(`${claim.id} references missing evidence ${evidenceId}`);
			} else if (evidence && evidence.claimId !== claim.id) {
				problems.push(`${claim.id} references evidence ${evidenceId} owned by ${evidence.claimId}`);
			}
		}
		for (const warningId of claim.warningIds) {
			const warning = state.warnings.find((candidate) => candidate.id === warningId);
			if (!warningIds.has(warningId)) {
				problems.push(`${claim.id} references missing warning ${warningId}`);
			} else if (warning && warning.claimId !== claim.id) {
				problems.push(`${claim.id} references warning ${warningId} owned by ${warning.claimId}`);
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
		if (run.status === "queued" && run.targetWorkstreamId) {
			const workstream = state.workstreams.find((candidate) => candidate.id === run.targetWorkstreamId);
			if (workstream && !workstream.latestRunIds.includes(run.id)) {
				problems.push(`${run.id} targets workstream ${run.targetWorkstreamId} but is missing from latestRunIds`);
			}
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
		if (run.status === "queued") {
			if (run.startedAt) {
				problems.push(`${run.id} is queued but has startedAt set`);
			}
			if (run.executionMode) {
				problems.push(`${run.id} is queued but has executionMode set`);
			}
			if (hasRoleRunOutputs(run)) {
				problems.push(`${run.id} is queued but has report or created output ids`);
			}
		}
		if (run.executionMode === "background" && (run.status === "running" || isTerminalStartedStatus(run.status))) {
			if (!run.startedAt) {
				problems.push(`${run.id} is ${run.status} background run but has no startedAt`);
			}
		}
		if (run.executionMode === "background" && run.status === "running" && !backgroundRoleRuns.has(run.id)) {
			problems.push(`${run.id} is a background running record not live in this session`);
		}
		if (isTerminalStartedStatus(run.status) && !run.startedAt) {
			problems.push(`${run.id} is ${run.status} but has no startedAt`);
		}
		if (run.status === "cancelled") {
			if (!run.cancelReason) {
				problems.push(`${run.id} is cancelled but has no cancel reason`);
			}
			if (hasRoleRunOutputs(run)) {
				problems.push(`${run.id} is cancelled but has report or created output ids`);
			}
		}
	}

	for (const round of state.reviewRounds) {
		if (!claimIds.has(round.claimId)) {
			problems.push(`${round.id} points to missing claim ${round.claimId}`);
		}
		if (!roleRunIds.has(round.roleRunId)) {
			problems.push(`${round.id} points to missing role run ${round.roleRunId}`);
		}
		if (!reportIds.has(round.reportId)) {
			problems.push(`${round.id} points to missing report ${round.reportId}`);
		}
		for (const evidenceId of round.createdEvidenceIds) {
			if (!evidenceIds.has(evidenceId)) {
				problems.push(`${round.id} references missing created evidence ${evidenceId}`);
			}
		}
		for (const warningId of round.createdWarningIds) {
			if (!warningIds.has(warningId)) {
				problems.push(`${round.id} references missing created warning ${warningId}`);
			}
		}
		for (const warningId of round.resolvedWarningIds) {
			if (!warningIds.has(warningId)) {
				problems.push(`${round.id} references missing resolved warning ${warningId}`);
			}
		}
	}

	for (const round of state.reportReviewRounds) {
		if (!round.reportId || !reportIds.has(round.reportId)) {
			problems.push(`${round.id} points to missing report ${round.reportId || "(empty)"}`);
		}
		if (round.roleRunId && !roleRunIds.has(round.roleRunId)) {
			problems.push(`${round.id} points to missing role run ${round.roleRunId}`);
		}
		for (const warningId of round.createdWarningIds) {
			if (!warningIds.has(warningId)) {
				problems.push(`${round.id} references missing created warning ${warningId}`);
			}
		}
	}

	for (const revision of state.claimRevisions) {
		if (!claimIds.has(revision.claimId)) {
			problems.push(`${revision.id} points to missing claim ${revision.claimId}`);
		}
	}

	for (const section of state.workingPaperSections) {
		for (const claimId of section.sourceClaimIds) {
			if (!claimIds.has(claimId)) {
				problems.push(`${section.id} sources missing claim ${claimId}`);
			} else if (!isClaimSynthesisEligible(state, claimId)) {
				problems.push(`${section.id} sources ${claimId} which is not synthesis-eligible`);
			}
		}
		for (const evidenceId of section.sourceEvidenceIds) {
			if (!evidenceIds.has(evidenceId)) {
				problems.push(`${section.id} sources missing evidence ${evidenceId}`);
			}
		}
		for (const warningId of section.sourceWarningIds) {
			if (!warningIds.has(warningId)) {
				problems.push(`${section.id} sources missing warning ${warningId}`);
			}
		}
		for (const artifactId of section.sourceArtifactIds) {
			if (!artifactIds.has(artifactId)) {
				problems.push(`${section.id} sources missing artifact ${artifactId}`);
			}
		}
		for (const roundId of section.sourceReviewRoundIds) {
			if (!reviewRoundIds.has(roundId)) {
				problems.push(`${section.id} sources missing review round ${roundId}`);
			}
		}
		for (const runId of section.sourceRoleRunIds) {
			if (!roleRunIds.has(runId)) {
				problems.push(`${section.id} sources missing role run ${runId}`);
			}
		}
		for (const noteId of section.marginNoteIds) {
			if (!marginNoteIds.has(noteId)) {
				problems.push(`${section.id} references missing margin note ${noteId}`);
			}
		}
	}

	for (const note of state.marginNotes) {
		if (!paperSubjectExists(state, note.subjectId)) {
			problems.push(`${note.id} points to missing subject ${note.subjectId}`);
		}
		if (note.sectionId) {
			const section = state.workingPaperSections.find((candidate) => candidate.id === note.sectionId);
			if (!section) {
				problems.push(`${note.id} points to missing section ${note.sectionId}`);
			} else if (!section.marginNoteIds.includes(note.id)) {
				problems.push(`${note.id} has sectionId ${note.sectionId} but section does not include it`);
			}
		}
		if (note.status === "resolved") {
			if (!note.resolution || note.resolution.trim().length === 0) {
				problems.push(`${note.id} is resolved but has no resolution`);
			}
			if (!note.resolvedAt) {
				problems.push(`${note.id} is resolved but has no resolvedAt`);
			}
		}
		if (note.status === "open" && note.resolvedAt) {
			problems.push(`${note.id} is open but has resolvedAt set`);
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

function getRawRecords(value: Record<string, unknown>, key: string): Record<string, unknown>[] {
	const field = value[key];
	if (!Array.isArray(field)) return [];
	return field.filter(isRecord);
}

function getRawString(value: Record<string, unknown>, key: string): string | undefined {
	const field = value[key];
	return typeof field === "string" ? field : undefined;
}

function getRawStringArray(value: Record<string, unknown>, key: string): string[] {
	const field = value[key];
	if (!Array.isArray(field)) return [];
	return field.filter((item): item is string => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
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
	const run = startedState.roleRuns.find((candidate) => candidate.id === runId);
	if (!run) {
		throw new Error(`Expected started role run ${runId} to exist.`);
	}
	showCommandMessage(pi, ctx, formatRoleRunStartMessage(run, statePath, ctx.cwd));
	await executeRunningRoleRun(pi, ctx, roleRunner, statePath, startedState, run);
}

async function queueProjectRole(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const request = parseRoleRunRequest(text);
	if (!request) {
		showCommandMessage(pi, ctx, "Usage: /comath queue <coordinator|workstream|reviewer|synthesizer> [workstream-id]");
		return;
	}

	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}
	const targetWorkstream = getTargetWorkstream(existing, request);
	if (request.role === "workstream" && !targetWorkstream) {
		showCommandMessage(pi, ctx, "Usage: /comath queue workstream <workstream-id>");
		return;
	}
	const targetClaim = getTargetClaim(existing, request);
	if (request.role === "reviewer" && !targetClaim) {
		showCommandMessage(pi, ctx, "Usage: /comath queue reviewer <claim-id>");
		return;
	}

	const runId = `role-run-${existing.roleRuns.length + 1}`;
	const state = queueRoleRun(existing, {
		id: runId,
		role: request.role,
		task: buildRoleTask(request.role, existing, targetWorkstream, targetClaim),
		targetWorkstreamId: targetWorkstream?.id,
		targetClaimId: targetClaim?.id,
		now: new Date().toISOString(),
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(pi, ctx, `Queued co-math ${request.role} as ${runId} for later dispatch.`);
}

async function dispatchNextQueuedRoleRun(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	text: string,
	roleRunner: RoleRunner,
): Promise<void> {
	const background = parseBackgroundFlag(text);
	if (background === undefined) {
		showCommandMessage(pi, ctx, "Usage: /comath dispatch-next [--background]");
		return;
	}
	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}
	const queuedRun = [...existing.roleRuns]
		.filter((run) => run.status === "queued")
		.sort((left, right) => (left.queuedAt ?? left.updatedAt).localeCompare(right.queuedAt ?? right.updatedAt))[0];
	if (!queuedRun) {
		showCommandMessage(pi, ctx, "No queued co-math role runs.");
		return;
	}
	await dispatchQueuedRoleRunById(pi, ctx, roleRunner, existing, queuedRun.id, background);
}

async function dispatchSpecificQueuedRoleRun(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	runId: string,
	roleRunner: RoleRunner,
): Promise<void> {
	const parsed = parseDispatchRunText(runId);
	if (!parsed) {
		showCommandMessage(pi, ctx, "Usage: /comath dispatch-run <run-id> [--background]");
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
	if (run.status !== "queued") {
		showCommandMessage(pi, ctx, `Cannot dispatch ${run.id} because its status is ${run.status}.`);
		return;
	}
	await dispatchQueuedRoleRunById(pi, ctx, roleRunner, existing, run.id, parsed.background);
}

async function dispatchQueuedRoleRunById(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	roleRunner: RoleRunner,
	existing: CoMathProjectState,
	runId: string,
	background: boolean,
): Promise<void> {
	const statePath = getDefaultStatePath(ctx.cwd);
	const dispatchingRun = existing.roleRuns.find((candidate) => candidate.id === runId);
	if (!dispatchingRun) {
		showCommandMessage(pi, ctx, `No role run found for ${runId}.`);
		return;
	}
	const runningState = dispatchQueuedRoleRun(existing, {
		runId,
		now: new Date().toISOString(),
		actor: dispatchingRun.role,
		executionMode: background ? "background" : "foreground",
	});
	await saveProjectState(statePath, runningState);
	const run = runningState.roleRuns.find((candidate) => candidate.id === runId);
	if (!run) {
		throw new Error(`Expected dispatched role run ${runId} to exist.`);
	}
	if (background) {
		startBackgroundRoleRun(pi, ctx, roleRunner, statePath, run);
		showCommandMessage(pi, ctx, formatBackgroundRoleRunStartMessage(run));
		return;
	}
	showCommandMessage(pi, ctx, formatRoleRunStartMessage(run, statePath, ctx.cwd));
	await executeRunningRoleRun(pi, ctx, roleRunner, statePath, runningState, run);
}

async function cancelQueuedProjectRole(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const parsed = parseSubjectBodyText(text);
	if (!parsed) {
		showCommandMessage(pi, ctx, "Usage: /comath cancel-run <run-id>: <reason>");
		return;
	}

	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}
	const run = existing.roleRuns.find((candidate) => candidate.id === parsed.subjectId);
	if (!run) {
		showCommandMessage(pi, ctx, `No role run found for ${parsed.subjectId}.`);
		return;
	}
	if (run.status !== "queued") {
		showCommandMessage(
			pi,
			ctx,
			`Cannot cancel ${run.id} because its status is ${run.status}. Use /comath recover-run for stale running runs.`,
		);
		return;
	}

	const now = new Date().toISOString();
	const summary = `Cancelled queued role run ${run.id}: ${parsed.body}`;
	let state = cancelQueuedRoleRun(existing, {
		runId: run.id,
		reason: parsed.body,
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

function startBackgroundRoleRun(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	roleRunner: RoleRunner,
	statePath: string,
	run: RoleRunRecord,
): void {
	if (backgroundRoleRuns.has(run.id)) return;
	const controller = new AbortController();
	const handle: BackgroundRoleRunHandle = {
		runId: run.id,
		role: run.role,
		startedAt: run.startedAt ?? new Date().toISOString(),
		controller,
		completion: Promise.resolve(),
	};
	backgroundRoleRuns.set(run.id, handle);
	handle.completion = executeBackgroundRoleRun(pi, roleRunner, {
		cwd: ctx.cwd,
		runId: run.id,
		signal: controller.signal,
		statePath,
	})
		.catch((error) => {
			sendBackgroundMessage(
				pi,
				`Background role run ${run.id} had an unexpected error: ${getRoleRunErrorMessage(error)}`,
			);
		})
		.finally(() => {
			backgroundRoleRuns.delete(run.id);
		});
}

interface ExecuteBackgroundRoleRunInput {
	cwd: string;
	runId: string;
	signal: AbortSignal;
	statePath: string;
}

async function executeBackgroundRoleRun(
	pi: ExtensionAPI,
	roleRunner: RoleRunner,
	input: ExecuteBackgroundRoleRunInput,
): Promise<void> {
	const invocationState = await loadProjectState(input.statePath);
	const run = invocationState?.roleRuns.find((candidate) => candidate.id === input.runId);
	if (!invocationState || !run || run.status !== "running") {
		sendBackgroundMessage(pi, `Background role run ${input.runId} is no longer running; skipped invocation.`);
		return;
	}
	if (input.signal.aborted) {
		await finalizeBackgroundRoleRunError(
			pi,
			input.statePath,
			run.id,
			new Error("Co-math role run was aborted."),
			input.signal,
		);
		return;
	}
	try {
		const result = await roleRunner({
			cwd: input.cwd,
			role: run.role,
			task: run.task,
			signal: input.signal,
		});
		await finalizeBackgroundRoleRunResult(pi, input.statePath, run.id, result);
	} catch (error) {
		await finalizeBackgroundRoleRunError(pi, input.statePath, run.id, error, input.signal);
	}
}

async function finalizeBackgroundRoleRunResult(
	pi: ExtensionAPI,
	statePath: string,
	runId: string,
	result: RoleRunResult,
): Promise<void> {
	const latestState = await loadProjectState(statePath);
	const latestRun = latestState?.roleRuns.find((candidate) => candidate.id === runId);
	if (!latestState || !latestRun) {
		sendBackgroundMessage(pi, `Background role run ${runId} finished, but the durable run record is missing.`);
		return;
	}
	if (latestRun.status !== "running") {
		sendBackgroundMessage(
			pi,
			`Background role run ${runId} finished, but durable status is ${latestRun.status}; skipped late completion.`,
		);
		return;
	}
	const targetWorkstream = getRoleRunTargetWorkstream(latestState, latestRun);
	const targetClaim = getRoleRunTargetClaim(latestState, latestRun);
	const now = new Date().toISOString();
	const reportId = `report-${latestState.reports.length + 1}`;
	const ingestion = ingestRoleRunResult(latestState, {
		now,
		reportId,
		result,
		role: latestRun.role,
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
		actor: latestRun.role,
	});
	const finalState = addReviewerReviewRound(finishedState, {
		createdEvidenceIds: ingestion.createdEvidenceIds,
		createdWarningIds: ingestion.createdWarningIds,
		decision: result.reviewDecision,
		now,
		reportId,
		role: latestRun.role,
		roleRunId: runId,
		targetClaim,
	});
	await saveProjectState(statePath, finalState);
	sendBackgroundMessage(pi, `Background ${formatRoleRunMessage(latestRun.role, reportId, result)}`);
}

async function finalizeBackgroundRoleRunError(
	pi: ExtensionAPI,
	statePath: string,
	runId: string,
	error: unknown,
	signal: AbortSignal,
): Promise<void> {
	const latestState = await loadProjectState(statePath);
	const latestRun = latestState?.roleRuns.find((candidate) => candidate.id === runId);
	if (!latestState || !latestRun) {
		sendBackgroundMessage(pi, `Background role run ${runId} failed, but the durable run record is missing.`);
		return;
	}
	if (latestRun.status !== "running") {
		sendBackgroundMessage(
			pi,
			`Background role run ${runId} finished, but durable status is ${latestRun.status}; skipped late completion.`,
		);
		return;
	}
	const errorMessage = getRoleRunErrorMessage(error);
	const status = signal.aborted || errorMessage === "Co-math role run was aborted." ? "aborted" : "failed";
	const failedState = failRoleRun(latestState, {
		runId,
		status,
		errorMessage,
		now: new Date().toISOString(),
		actor: "system",
	});
	await saveProjectState(statePath, failedState);
	sendBackgroundMessage(pi, `Co-math ${latestRun.role} role run ${runId} ${status}: ${errorMessage}`);
}

async function abortBackgroundRoleRun(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const parsed = parseSubjectBodyText(text);
	if (!parsed) {
		showCommandMessage(pi, ctx, "Usage: /comath abort-run <run-id>: <reason>");
		return;
	}
	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}
	const run = existing.roleRuns.find((candidate) => candidate.id === parsed.subjectId);
	if (!run) {
		showCommandMessage(pi, ctx, `No role run found for ${parsed.subjectId}.`);
		return;
	}
	const handle = backgroundRoleRuns.get(run.id);
	if (handle && run.status === "running") {
		const now = new Date().toISOString();
		const summary = `Requested abort for background role run ${run.id}: ${parsed.body}`;
		const state = recordHumanInterventionEvent(existing, {
			summary,
			subjectId: run.id,
			relatedIds: uniqueStrings([run.id, ...getRoleRunTargetRelatedIds(run)]),
			now,
			actor: "human",
		});
		await saveProjectState(getDefaultStatePath(ctx.cwd), state);
		handle.controller.abort();
		showCommandMessage(pi, ctx, summary);
		return;
	}
	if (run.status === "running") {
		showCommandMessage(
			pi,
			ctx,
			`${run.id} is running but not live in this process. Use /comath recover-run ${run.id} aborted: ${parsed.body}`,
		);
		return;
	}
	showCommandMessage(pi, ctx, `Cannot abort ${run.id} because its status is ${run.status}.`);
}

function showBackgroundRoleRuns(pi: ExtensionAPI, ctx: ExtensionCommandContext): void {
	if (backgroundRoleRuns.size === 0) {
		showCommandMessage(pi, ctx, "No live co-math background role runs in this session.");
		return;
	}
	showCommandMessage(
		pi,
		ctx,
		[
			"Live co-math background role runs",
			...Array.from(backgroundRoleRuns.values()).map(
				(handle) => `- ${handle.runId} [${handle.role}] started ${handle.startedAt}`,
			),
			"Durable running records that are not listed here may be stale; use /comath recover-run if needed.",
		].join("\n"),
	);
}

async function addPaperSection(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const parsed = parsePaperSectionText(text);
	if (!parsed) {
		showCommandMessage(pi, ctx, "Usage: /comath paper-section <title>: <body> [--sources id1,id2]");
		return;
	}
	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}
	const sources = classifyPaperSources(existing, parsed.sourceIds);
	if (sources.unknownIds.length > 0) {
		showCommandMessage(pi, ctx, `Unknown paper section source ids: ${sources.unknownIds.join(", ")}`);
		return;
	}
	const sectionId = `paper-section-${existing.workingPaperSections.length + 1}`;
	const state = addWorkingPaperSection(existing, {
		id: sectionId,
		title: parsed.title,
		body: parsed.body,
		sourceClaimIds: sources.claimIds,
		sourceEvidenceIds: sources.evidenceIds,
		sourceWarningIds: sources.warningIds,
		sourceArtifactIds: sources.artifactIds,
		sourceReviewRoundIds: sources.reviewRoundIds,
		sourceRoleRunIds: sources.roleRunIds,
		now: new Date().toISOString(),
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(pi, ctx, `Recorded working-paper section ${sectionId}: ${parsed.title}`);
}

async function addPaperMarginNote(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const parsed = parseMarginNoteText(text);
	if (!parsed) {
		showCommandMessage(
			pi,
			ctx,
			"Usage: /comath margin-note <subject-id> <gap|todo|warning|provenance|comment>: <note>",
		);
		return;
	}
	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}
	if (!paperSubjectExists(existing, parsed.subjectId)) {
		showCommandMessage(pi, ctx, `Unknown margin note subject: ${parsed.subjectId}`);
		return;
	}
	const section = existing.workingPaperSections.find((candidate) => candidate.id === parsed.subjectId);
	const noteId = `margin-note-${existing.marginNotes.length + 1}`;
	const state = addMarginNote(existing, {
		id: noteId,
		kind: parsed.kind,
		subjectId: parsed.subjectId,
		sectionId: section?.id,
		message: parsed.message,
		now: new Date().toISOString(),
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(pi, ctx, `Recorded margin note ${noteId} for ${parsed.subjectId}.`);
}

async function resolvePaperMarginNote(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const parsed = parseSubjectBodyText(text);
	if (!parsed) {
		showCommandMessage(pi, ctx, "Usage: /comath resolve-margin-note <note-id>: <resolution>");
		return;
	}
	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}
	const note = existing.marginNotes.find((candidate) => candidate.id === parsed.subjectId);
	if (!note) {
		showCommandMessage(pi, ctx, `No margin note found for ${parsed.subjectId}.`);
		return;
	}
	if (note.status === "resolved") {
		showCommandMessage(pi, ctx, `Margin note ${note.id} is already resolved.`);
		return;
	}
	const state = resolveMarginNote(existing, {
		noteId: note.id,
		resolution: parsed.body,
		now: new Date().toISOString(),
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(pi, ctx, `Resolved margin note ${note.id}: ${parsed.body}`);
}

async function showMarginNotes(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const filter = parseMarginNoteFilter(text);
	if (!filter) {
		showCommandMessage(pi, ctx, "Usage: /comath margin-notes [open|resolved|all]");
		return;
	}
	const state = await loadProjectStateOrNotify(pi, ctx);
	if (!state) {
		return;
	}
	const notes = filter === "all" ? state.marginNotes : state.marginNotes.filter((note) => note.status === filter);
	showCommandMessage(pi, ctx, [`Co-math margin notes [${filter}]`, ...formatMarginNotes(notes)].join("\n"));
}

async function showLivingWorkingPaper(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const state = await loadProjectStateOrNotify(pi, ctx);
	if (!state) {
		return;
	}
	showCommandMessage(pi, ctx, buildLivingWorkingPaperMarkdown(state));
}

async function exportLivingWorkingPaper(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const parsed = parseExportPaperText(text);
	if (!parsed) {
		showCommandMessage(pi, ctx, "Usage: /comath export-paper [path] [--force]");
		return;
	}
	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}
	const resolvedPath = resolveWorkspaceRelativePath(ctx.cwd, parsed.filePath);
	if (!resolvedPath) {
		showCommandMessage(pi, ctx, "Export path must stay inside the workspace.");
		return;
	}
	if (isStatePathRelative(resolvedPath.relativePath)) {
		showCommandMessage(pi, ctx, "Export path cannot overwrite .pi/co-math/state.json.");
		return;
	}
	const exportPathCheck = await checkExportTargetPath(ctx.cwd, resolvedPath);
	if (exportPathCheck === "outside_workspace") {
		showCommandMessage(pi, ctx, "Export path must stay inside the workspace.");
		return;
	}
	if (exportPathCheck === "symlink") {
		showCommandMessage(pi, ctx, `Export path is a symlink and is not allowed: ${resolvedPath.relativePath}`);
		return;
	}
	if (exportPathCheck === "directory") {
		showCommandMessage(pi, ctx, `Export path is not a file: ${resolvedPath.relativePath}`);
		return;
	}
	if (exportPathCheck === "state_file") {
		showCommandMessage(pi, ctx, "Export path cannot overwrite .pi/co-math/state.json.");
		return;
	}
	if (exportPathCheck === "exists" && !parsed.force) {
		showCommandMessage(
			pi,
			ctx,
			`Export target already exists: ${resolvedPath.relativePath}. Use --force to overwrite.`,
		);
		return;
	}

	const markdown = buildLivingWorkingPaperMarkdown(existing);
	await writeFile(resolvedPath.absolutePath, `${markdown}\n`, "utf8");

	const artifactId = `artifact-${existing.artifacts.length + 1}`;
	const state = recordWorkingPaperExport(existing, {
		artifactId,
		path: resolvedPath.relativePath,
		title: "Living working paper export",
		summary: "Markdown snapshot of the living working paper.",
		now: new Date().toISOString(),
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(pi, ctx, `Exported living working paper to ${resolvedPath.relativePath} as ${artifactId}.`);
}

async function executeRunningRoleRun(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	roleRunner: RoleRunner,
	statePath: string,
	startedState: CoMathProjectState,
	run: RoleRunRecord,
): Promise<void> {
	const targetWorkstream = getRoleRunTargetWorkstream(startedState, run);
	const targetClaim = getRoleRunTargetClaim(startedState, run);
	try {
		const result = await runWithRoleRunHeartbeat(pi, ctx, run.id, () =>
			roleRunner({
				cwd: ctx.cwd,
				role: run.role,
				task: run.task,
				signal: ctx.signal,
			}),
		);
		const now = new Date().toISOString();
		const reportId = `report-${startedState.reports.length + 1}`;
		const ingestion = ingestRoleRunResult(startedState, {
			now,
			reportId,
			result,
			role: run.role,
			targetClaim,
			targetWorkstream,
		});
		const status = result.blockers && result.blockers.length > 0 ? "blocked" : "completed";
		const finishedState = finishRoleRun(ingestion.state, {
			runId: run.id,
			status,
			reportId,
			createdClaimIds: ingestion.createdClaimIds,
			createdEvidenceIds: ingestion.createdEvidenceIds,
			createdWarningIds: ingestion.createdWarningIds,
			createdArtifactIds: ingestion.createdArtifactIds,
			blockerMessages: result.blockers,
			now,
			actor: run.role,
		});
		const finalState = addReviewerReviewRound(finishedState, {
			createdEvidenceIds: ingestion.createdEvidenceIds,
			createdWarningIds: ingestion.createdWarningIds,
			decision: result.reviewDecision,
			now,
			reportId,
			role: run.role,
			roleRunId: run.id,
			targetClaim,
		});
		await saveProjectState(statePath, finalState);
		showCommandMessage(pi, ctx, formatRoleRunCompletionMessage(run, reportId, status, result, ingestion));
	} catch (error) {
		const errorMessage = getRoleRunErrorMessage(error);
		const now = new Date().toISOString();
		const status = isRoleRunAbort(ctx, errorMessage) ? "aborted" : "failed";
		const failedState = failRoleRun(startedState, {
			runId: run.id,
			status,
			errorMessage,
			now,
			actor: "system",
		});
		await saveProjectState(statePath, failedState);
		showCommandMessage(pi, ctx, formatRoleRunFailureMessage(run.id, status, errorMessage));
	}
}

async function runWithRoleRunHeartbeat<T>(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	runId: string,
	operation: () => Promise<T>,
): Promise<T> {
	const startedAt = Date.now();
	const interval = setInterval(() => {
		const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1_000);
		showCommandMessage(pi, ctx, `${runId} still running... elapsed ${elapsedSeconds}s`);
	}, ROLE_RUN_HEARTBEAT_INTERVAL_MS);
	try {
		return await operation();
	} finally {
		clearInterval(interval);
	}
}

function formatRoleRunStartMessage(run: RoleRunRecord, statePath: string, cwd: string): string {
	return [
		`Started co-math role run ${run.id}`,
		`Role: ${run.role}`,
		`Target: ${formatRoleRunTargetForUser(run)}`,
		`State saved: ${formatStatePathForUser(statePath, cwd)}`,
		"Nested Pi execution started. This may take a while.",
	].join("\n");
}

function formatBackgroundRoleRunStartMessage(run: RoleRunRecord): string {
	return [
		`Started co-math role run ${run.id} in background.`,
		`Role: ${run.role}`,
		`Target: ${formatRoleRunTargetForUser(run)}`,
		"Inspect:",
		"/comath background-runs",
		`/comath run-status ${run.id}`,
	].join("\n");
}

function formatRoleRunCompletionMessage(
	run: RoleRunRecord,
	reportId: string,
	status: "completed" | "blocked",
	result: RoleRunResult,
	ingestion: IngestRoleRunOutput,
): string {
	const lines = [
		`Co-math role run ${run.id} ${status}.`,
		`Saved report: ${reportId}`,
		`Summary: ${result.summary}`,
		...formatCreatedIdLines(ingestion),
		...formatStructuredJsonFallbackLines(reportId, result.blockers ?? []),
		...formatCompletionBlockerLines(result.blockers ?? []),
		"",
		"Inspect:",
		`/comath run-status ${run.id}`,
		`/comath report-status ${reportId}`,
		"/comath next",
	];
	return lines.join("\n");
}

function formatRoleRunFailureMessage(runId: string, status: "failed" | "aborted", errorMessage: string): string {
	return [
		`Co-math role run ${runId} ${status}: ${errorMessage}`,
		"",
		"Inspect:",
		`/comath run-status ${runId}`,
		"/comath runs",
	].join("\n");
}

function formatRoleRunTargetForUser(run: RoleRunRecord): string {
	return run.targetWorkstreamId ?? run.targetClaimId ?? "project";
}

function formatStatePathForUser(statePath: string, cwd: string): string {
	const relativePath = path.relative(cwd, statePath);
	if (relativePath.length === 0 || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
		return statePath;
	}
	return relativePath.split(path.sep).join("/");
}

function formatCreatedIdLines(ingestion: IngestRoleRunOutput): string[] {
	return [
		formatCreatedIdLine("Created claims", ingestion.createdClaimIds),
		formatCreatedIdLine("Created evidence", ingestion.createdEvidenceIds),
		formatCreatedIdLine("Created warnings", ingestion.createdWarningIds),
		formatCreatedIdLine("Created artifacts", ingestion.createdArtifactIds),
	].filter((line) => line !== undefined);
}

function formatCreatedIdLine(label: string, ids: string[]): string | undefined {
	return ids.length > 0 ? `${label}: ${ids.join(", ")}` : undefined;
}

function formatStructuredJsonFallbackLines(reportId: string, blockers: string[]): string[] {
	if (!blockers.includes(INVALID_STRUCTURED_JSON_BLOCKER)) return [];
	return [
		"Role completed, but output was not valid structured co-math JSON.",
		`Saved raw output as ${reportId}.`,
		"No claims were promoted from structured fields.",
	];
}

function formatCompletionBlockerLines(blockers: string[]): string[] {
	if (blockers.length === 0) return [];
	return ["Blockers:", ...formatBlockerLines(blockers)];
}

interface RoleRunRequest {
	role: CoMathRole;
	targetId?: string;
}

interface DispatchRunRequest {
	runId: string;
	background: boolean;
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

interface AddReviewerReviewRoundInput {
	createdEvidenceIds: string[];
	createdWarningIds: string[];
	decision?: ReviewDecision;
	now: string;
	reportId: string;
	role: CoMathRole;
	roleRunId: string;
	targetClaim?: Claim;
}

type ReviewDecisionEventStatus = "proved" | "needs_review" | "disproved";

function parseRoleRunRequest(text: string): RoleRunRequest | undefined {
	const [role, targetId] = text.trim().split(/\s+/);
	if (role === "coordinator" || role === "workstream" || role === "reviewer" || role === "synthesizer") {
		return { role, targetId };
	}
	return undefined;
}

function parseBackgroundFlag(text: string): boolean | undefined {
	if (text.length === 0) return false;
	return text === "--background" ? true : undefined;
}

function parseDispatchRunText(text: string): DispatchRunRequest | undefined {
	const [runId, flag, ...extra] = text.trim().split(/\s+/);
	if (!runId || extra.length > 0) return undefined;
	const background = flag ? parseBackgroundFlag(flag) : false;
	if (background === undefined) return undefined;
	return { runId, background };
}

function getTargetWorkstream(state: CoMathProjectState, request: RoleRunRequest): Workstream | undefined {
	if (request.role !== "workstream" || !request.targetId) return undefined;
	return state.workstreams.find((workstream) => workstream.id === request.targetId);
}

function getTargetClaim(state: CoMathProjectState, request: RoleRunRequest): Claim | undefined {
	if (request.role !== "reviewer" || !request.targetId) return undefined;
	return state.claims.find((claim) => claim.id === request.targetId);
}

function getRoleRunTargetWorkstream(state: CoMathProjectState, run: RoleRunRecord): Workstream | undefined {
	if (!run.targetWorkstreamId) return undefined;
	return state.workstreams.find((workstream) => workstream.id === run.targetWorkstreamId);
}

function getRoleRunTargetClaim(state: CoMathProjectState, run: RoleRunRecord): Claim | undefined {
	if (!run.targetClaimId) return undefined;
	return state.claims.find((claim) => claim.id === run.targetClaimId);
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
		status: getReviewDecisionEventStatus(decision.status),
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

function addReviewerReviewRound(state: CoMathProjectState, input: AddReviewerReviewRoundInput): CoMathProjectState {
	if (input.role !== "reviewer" || !input.targetClaim || !input.decision) return state;
	if (input.decision.claimId !== input.targetClaim.id) return state;
	return addReviewRound(state, {
		id: `review-round-${state.reviewRounds.length + 1}`,
		claimId: input.decision.claimId,
		roleRunId: input.roleRunId,
		reportId: input.reportId,
		decisionStatus: input.decision.status,
		outcome: getReviewRoundOutcome(state, input.decision),
		createdEvidenceIds: input.createdEvidenceIds,
		createdWarningIds: input.createdWarningIds,
		resolvedWarningIds: getResolvedReviewWarningIds(state, input.decision),
		now: input.now,
		actor: input.role,
	});
}

function getReviewRoundOutcome(state: CoMathProjectState, decision: ReviewDecision): ReviewRoundOutcome {
	if (decision.status === "proved") {
		return isClaimSynthesisEligible(state, decision.claimId) ? "accepted" : "blocked_by_invariant";
	}
	if (decision.status === "disproved") return "rejected";
	return "revision_requested";
}

function getReviewDecisionEventStatus(status: ReviewDecision["status"]): ReviewDecisionEventStatus {
	return status === "proof_sketch" ? "needs_review" : status;
}

function getResolvedReviewWarningIds(state: CoMathProjectState, decision: ReviewDecision): string[] {
	return uniqueStrings(decision.resolvedWarningIds ?? []).filter((warningId) => {
		const warning = state.warnings.find((candidate) => candidate.id === warningId);
		return warning?.status === "resolved";
	});
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(new Set(values));
}

async function runForegroundComputation(command: string, cwd: string): Promise<ComputationRunResult> {
	return new Promise((resolve) => {
		const startedAt = Date.now();
		const stdout = createOutputPreview();
		const stderr = createOutputPreview();
		let timedOut = false;
		let resolved = false;
		const child = spawn(command, {
			cwd,
			shell: true,
			windowsHide: true,
		});
		const timeout = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
		}, COMATH_COMPUTATION_TIMEOUT_MS);

		const finish = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
			if (resolved) return;
			resolved = true;
			clearTimeout(timeout);
			resolve({
				exitCode,
				signal,
				elapsedMs: Date.now() - startedAt,
				stdout,
				stderr,
				timedOut,
			});
		};

		child.stdout.on("data", (chunk: Buffer | string) => {
			appendOutputPreview(stdout, chunk);
		});
		child.stderr.on("data", (chunk: Buffer | string) => {
			appendOutputPreview(stderr, chunk);
		});
		child.on("error", (error) => {
			appendOutputPreview(stderr, error.message);
			finish(1, null);
		});
		child.on("close", (exitCode, signal) => {
			finish(exitCode, signal);
		});
	});
}

function createOutputPreview(): OutputPreview {
	return { text: "", truncated: false };
}

function appendOutputPreview(preview: OutputPreview, chunk: Buffer | string): void {
	const text = chunk.toString();
	const remaining = COMATH_COMPUTATION_PREVIEW_CHARS - preview.text.length;
	if (remaining <= 0) {
		if (text.length > 0) preview.truncated = true;
		return;
	}
	if (text.length > remaining) {
		preview.text += text.slice(0, remaining);
		preview.truncated = true;
		return;
	}
	preview.text += text;
}

function formatComputationProvenance(input: FormatComputationProvenanceInput): string {
	return [
		`command: ${input.command}`,
		"cwd: .",
		`exitCode: ${input.exitCode ?? "none"}`,
		`signal: ${input.signal ?? "none"}`,
		`elapsedMs: ${input.elapsedMs}`,
		`outputPath: ${input.outputPath}`,
		`outputSha256: ${input.outputSha256}`,
		`stdoutPreview: ${input.stdout.text.trimEnd()}`,
		`stdoutPreviewTruncated: ${input.stdout.truncated ? "true" : "false"}`,
		`stderrPreview: ${input.stderr.text.trimEnd()}`,
		`stderrPreviewTruncated: ${input.stderr.truncated ? "true" : "false"}`,
	].join("\n");
}

function formatComputationFailurePreview(result: ComputationRunResult): string {
	const stderr = result.stderr.text.trim();
	if (stderr.length > 0) return `stderr=${formatSingleLinePreview(stderr)}`;
	const stdout = result.stdout.text.trim();
	if (stdout.length > 0) return `stdout=${formatSingleLinePreview(stdout)}`;
	if (result.signal) return `signal=${result.signal}`;
	return "no output";
}

function formatSingleLinePreview(text: string): string {
	const singleLine = text.replace(/\s+/g, " ");
	return singleLine.length > 160 ? `${singleLine.slice(0, 160)}...` : singleLine;
}

function resolveWorkspaceRelativePath(cwd: string, inputPath: string): ResolvedWorkspacePath | undefined {
	if (inputPath.length === 0 || inputPath.includes("\0")) return undefined;
	const cwdAbsolute = path.resolve(cwd);
	const targetAbsolute = path.resolve(cwdAbsolute, inputPath);
	const relative = path.relative(cwdAbsolute, targetAbsolute);
	if (relative.length === 0 || relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
	return {
		absolutePath: targetAbsolute,
		relativePath: relative.split(path.sep).join("/"),
	};
}

async function checkExistingArtifactFilePath(
	cwd: string,
	resolvedPath: ResolvedWorkspacePath,
): Promise<ExistingArtifactPathProblem | undefined> {
	const pathStat = await getPathLstat(resolvedPath.absolutePath);
	if (!pathStat) return "missing";
	if (pathStat.isSymbolicLink()) return "symlink";
	if (!pathStat.isFile()) return "directory";
	const cwdReal = await realpath(cwd);
	const targetReal = await realpath(resolvedPath.absolutePath);
	return isPathInside(cwdReal, targetReal) ? undefined : "outside_workspace";
}

async function checkExportTargetPath(
	cwd: string,
	resolvedPath: ResolvedWorkspacePath,
): Promise<ExportTargetPathProblem | undefined> {
	const cwdAbsolute = path.resolve(cwd);
	const cwdReal = await realpath(cwdAbsolute);
	const parentPath = path.dirname(resolvedPath.absolutePath);
	if (!(await existingParentSegmentsAreSafe(cwdAbsolute, parentPath))) {
		return "symlink";
	}
	await mkdir(parentPath, { recursive: true });
	const parentReal = await realpath(parentPath);
	if (!isPathInsideOrEqual(cwdReal, parentReal)) {
		return "outside_workspace";
	}
	const targetStat = await getPathLstat(resolvedPath.absolutePath);
	if (!targetStat) return undefined;
	if (targetStat.isSymbolicLink()) return "symlink";
	if (targetStat.isDirectory()) return "directory";
	const stateReal = await getStatePathReal(cwd);
	if (stateReal) {
		const targetReal = await realpath(resolvedPath.absolutePath);
		if (targetReal === stateReal) return "state_file";
	}
	return "exists";
}

async function existingParentSegmentsAreSafe(cwdAbsolute: string, parentPath: string): Promise<boolean> {
	const relativeParent = path.relative(cwdAbsolute, parentPath);
	if (relativeParent.length === 0) return true;
	const segments = relativeParent.split(path.sep);
	let currentPath = cwdAbsolute;
	for (const segment of segments) {
		currentPath = path.join(currentPath, segment);
		const segmentStat = await getPathLstat(currentPath);
		if (!segmentStat) return true;
		if (segmentStat.isSymbolicLink() || !segmentStat.isDirectory()) return false;
	}
	return true;
}

async function getStatePathReal(cwd: string): Promise<string | undefined> {
	try {
		return await realpath(getDefaultStatePath(cwd));
	} catch (error) {
		if (isMissingPathError(error)) return undefined;
		throw error;
	}
}

async function getPathLstat(filePath: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
	try {
		return await lstat(filePath);
	} catch (error) {
		if (isMissingPathError(error)) return undefined;
		throw error;
	}
}

function isPathInside(parentReal: string, candidateReal: string): boolean {
	const relative = path.relative(parentReal, candidateReal);
	return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isPathInsideOrEqual(parentReal: string, candidateReal: string): boolean {
	return parentReal === candidateReal || isPathInside(parentReal, candidateReal);
}

function isStatePathRelative(relativePath: string): boolean {
	return relativePath.toLowerCase() === ".pi/co-math/state.json";
}

function isMissingPathError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
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
		"Goals:",
		...formatGoals(state),
		"Workstreams:",
		...formatWorkstreams(state),
		`Claims: ${state.claims.length}`,
		`Open warnings: ${openWarnings.length}`,
		"Instructions:",
		"- Do not promote any mathematical claim to proved unless proof evidence exists and no attached warning is open.",
		"- Treat proposed goals as unapproved unless the user explicitly approves or activates them.",
		"- Keep report review separate from claim review; accepted reports do not prove claims.",
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

function formatGoalList(state: CoMathProjectState): string[] {
	if (state.approvedGoals.length === 0) return ["No goals recorded."];
	return state.approvedGoals.map((goal) => `- ${goal.id} [${goal.status}]: ${goal.text}`);
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

async function showReviewRounds(pi: ExtensionAPI, ctx: ExtensionCommandContext, claimId: string): Promise<void> {
	const state = await loadProjectStateOrNotify(pi, ctx);
	if (!state) {
		return;
	}

	const trimmedClaimId = claimId.trim();
	const rounds = trimmedClaimId
		? state.reviewRounds.filter((round) => round.claimId === trimmedClaimId)
		: state.reviewRounds;
	if (rounds.length === 0) {
		showCommandMessage(
			pi,
			ctx,
			trimmedClaimId
				? `No review rounds recorded for ${trimmedClaimId}.`
				: "Co-math review rounds\nNo review rounds recorded.",
		);
		return;
	}

	showCommandMessage(pi, ctx, ["Co-math review rounds", ...formatReviewRounds(rounds)].join("\n"));
}

async function reviewProjectReport(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const parsed = parseReportReviewText(text);
	if (!parsed) {
		showCommandMessage(
			pi,
			ctx,
			"Usage: /comath review-report <report-id> <accepted|revision-requested|blocked>: <summary>",
		);
		return;
	}

	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) {
		return;
	}
	const report = existing.reports.find((candidate) => candidate.id === parsed.reportId);
	if (!report) {
		showCommandMessage(pi, ctx, `Unknown report: ${parsed.reportId}`);
		return;
	}

	const run = existing.roleRuns.find((candidate) => candidate.reportId === report.id);
	const reviewRoundId = `report-review-${existing.reportReviewRounds.length + 1}`;
	const state = addReportReviewRound(existing, {
		id: reviewRoundId,
		reportId: report.id,
		roleRunId: run?.id ?? "",
		outcome: parsed.outcome,
		summary: parsed.summary,
		now: new Date().toISOString(),
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(pi, ctx, `Recorded report review ${reviewRoundId} for ${report.id}: ${parsed.outcome}`);
}

async function showProjectReports(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const state = await loadProjectStateOrNotify(pi, ctx);
	if (!state) {
		return;
	}
	showCommandMessage(pi, ctx, ["Co-math reports", ...formatReportList(state)].join("\n"));
}

async function showReportStatus(pi: ExtensionAPI, ctx: ExtensionCommandContext, reportId: string): Promise<void> {
	const trimmedReportId = reportId.trim();
	if (trimmedReportId.length === 0) {
		showCommandMessage(pi, ctx, "Usage: /comath report-status <report-id>");
		return;
	}
	const state = await loadProjectStateOrNotify(pi, ctx);
	if (!state) {
		return;
	}
	const report = state.reports.find((candidate) => candidate.id === trimmedReportId);
	if (!report) {
		showCommandMessage(pi, ctx, `No report found for ${trimmedReportId}.`);
		return;
	}
	showCommandMessage(pi, ctx, formatReportDetails(state, report));
}

async function reviseProjectClaim(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const parsed = parseReviseClaimText(text);
	if (!parsed) {
		showCommandMessage(pi, ctx, "Usage: /comath revise-claim <claim-id>: <new statement> --reason <reason>");
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
	const state = reviseClaim(existing, {
		id: `claim-revision-${existing.claimRevisions.length + 1}`,
		claimId: parsed.claimId,
		revisedStatement: parsed.revisedStatement,
		reason: parsed.reason,
		now,
		actor: "human",
	});
	await saveProjectState(getDefaultStatePath(ctx.cwd), state);
	showCommandMessage(pi, ctx, `Revised claim ${parsed.claimId} and returned it to review: ${parsed.reason}`);
}

async function showClaimHistory(pi: ExtensionAPI, ctx: ExtensionCommandContext, claimId: string): Promise<void> {
	const trimmedClaimId = claimId.trim();
	if (trimmedClaimId.length === 0) {
		showCommandMessage(pi, ctx, "Usage: /comath claim-history <claim-id>");
		return;
	}

	const state = await loadProjectStateOrNotify(pi, ctx);
	if (!state) {
		return;
	}
	const claim = state.claims.find((candidate) => candidate.id === trimmedClaimId);
	if (!claim) {
		showCommandMessage(pi, ctx, `Unknown claim: ${trimmedClaimId}`);
		return;
	}

	showCommandMessage(pi, ctx, formatClaimHistory(state, claim));
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
	return state.artifacts.map((artifact) => {
		const artifactPath = artifact.path ? ` (${artifact.path})` : "";
		return `- ${artifact.id} [${artifact.kind}] ${artifact.title}${artifactPath}: ${artifact.summary}`;
	});
}

function formatMarginNotes(notes: MarginNote[]): string[] {
	if (notes.length === 0) return ["No margin notes recorded for this filter."];
	return notes.map(formatMarginNote);
}

function formatMarginNote(note: MarginNote): string {
	const subject = note.sectionId ?? note.subjectId;
	const resolution = note.status === "resolved" && note.resolution ? ` (resolved: ${note.resolution})` : "";
	return `- ${note.id} [${note.kind}/${note.status}] ${subject}: ${note.message}${resolution}`;
}

function buildLivingWorkingPaperMarkdown(state: CoMathProjectState): string {
	return [
		`# ${state.title}`,
		"",
		`Root question: ${state.rootQuestion}`,
		"",
		"Working-paper sections are draft workspace records, not proof certificates.",
		"",
		"## Goals",
		...formatGoalList(state),
		"",
		"## Workstreams",
		...formatPaperWorkstreams(state),
		"",
		"## Claims and Evidence",
		...formatPaperClaimsAndEvidence(state),
		"",
		"## Working paper sections",
		...formatWorkingPaperSections(state),
		"",
		"## Report Reviews",
		...formatPaperReportReviews(state),
		"",
		"## Open Warnings and Blockers",
		...formatOpenWarningsAndBlockers(state),
		"",
		"## Reviewed findings not yet in paper",
		...formatReviewedFindingsNotInPaper(state),
		"",
		"## Open warnings",
		...formatOpenWarnings(state),
		"",
		"## Open margin notes",
		...formatOpenMarginNotes(state),
		"",
		"## Provenance",
		...formatPaperProvenance(state),
	].join("\n");
}

function formatPaperWorkstreams(state: CoMathProjectState): string[] {
	if (state.workstreams.length === 0) return ["No workstreams recorded."];
	return state.workstreams.map((workstream) => {
		const reports = workstream.latestReportIds.length === 0 ? "none" : workstream.latestReportIds.join(", ");
		const goals = workstream.goalIds.length === 0 ? "none" : workstream.goalIds.join(", ");
		const reason = workstream.statusReason ? ` blocker=${workstream.statusReason}` : "";
		return `- ${workstream.id} [${workstream.status}] goals=${goals} reports=${reports}: ${workstream.title}${reason}`;
	});
}

function formatPaperClaimsAndEvidence(state: CoMathProjectState): string[] {
	if (state.claims.length === 0) return ["No claims recorded."];
	return state.claims.flatMap((claim) => [
		`- ${claim.id} [${claim.status}]: ${claim.statement}`,
		`  evidence: ${formatIdList(claim.evidenceIds)}`,
		`  warnings: ${formatIdList(claim.warningIds)}`,
	]);
}

function formatPaperReportReviews(state: CoMathProjectState): string[] {
	if (state.reportReviewRounds.length === 0) return ["No report reviews recorded."];
	return state.reportReviewRounds.map((round) => {
		const warningText = round.createdWarningIds.length === 0 ? "" : ` warnings=${round.createdWarningIds.join(", ")}`;
		return `- ${round.id} [${round.outcome}] report=${round.reportId} run=${round.roleRunId || "none"}${warningText}: ${round.summary}`;
	});
}

function formatOpenWarningsAndBlockers(state: CoMathProjectState): string[] {
	const openWarnings = state.warnings.filter((warning) => warning.status === "open").map(formatWarning);
	const reportBlockers = state.reports.flatMap((report) =>
		report.blockers.map((blocker) => `- ${report.id} blocker: ${blocker}`),
	);
	const runBlockers = state.roleRuns.flatMap((run) =>
		run.blockerMessages.map((blocker) => `- ${run.id} blocker: ${blocker}`),
	);
	const workstreamBlockers = state.workstreams
		.filter((workstream) => workstream.status === "blocked" && workstream.statusReason)
		.map((workstream) => `- ${workstream.id} blocker: ${workstream.statusReason}`);
	const lines = [...openWarnings, ...reportBlockers, ...runBlockers, ...workstreamBlockers];
	return lines.length === 0 ? ["No open warnings or blockers are recorded."] : lines;
}

function formatPaperProvenance(state: CoMathProjectState): string[] {
	return [
		`- Reports: ${state.reports.length}`,
		`- Role runs: ${state.roleRuns.length}`,
		`- Artifacts: ${state.artifacts.length}`,
		`- Events: ${state.events.length}`,
	];
}

function formatWorkingPaperSections(state: CoMathProjectState): string[] {
	if (state.workingPaperSections.length === 0) return ["No working-paper sections recorded."];
	return state.workingPaperSections.flatMap((section) => [
		`### ${section.id}: ${section.title} [${section.status}]`,
		section.body,
		"",
		"Sources:",
		...formatPaperSectionSources(state, section),
		"Margin notes:",
		...formatPaperSectionMarginNotes(state, section),
		"",
	]);
}

function formatPaperSectionSources(
	state: CoMathProjectState,
	section: CoMathProjectState["workingPaperSections"][number],
): string[] {
	const lines = [
		...section.sourceClaimIds.map((claimId) => formatPaperClaimSource(state, claimId)),
		...section.sourceEvidenceIds.map((evidenceId) => formatPaperEvidenceSource(state, evidenceId)),
		...section.sourceWarningIds.map((warningId) => formatPaperWarningSource(state, warningId)),
		...section.sourceArtifactIds.map((artifactId) => formatPaperArtifactSource(state, artifactId)),
		...section.sourceReviewRoundIds.map((roundId) => formatPaperReviewRoundSource(state, roundId)),
		...section.sourceRoleRunIds.map((runId) => formatPaperRoleRunSource(state, runId)),
	];
	return lines.length === 0 ? ["- none"] : lines;
}

function formatPaperClaimSource(state: CoMathProjectState, claimId: string): string {
	const claim = state.claims.find((candidate) => candidate.id === claimId);
	if (!claim) return `- ${claimId} [missing claim]`;
	const label = isClaimSynthesisEligible(state, claim.id)
		? `${claim.status}/synthesis-eligible`
		: `${claim.status}/not synthesis-eligible`;
	return `- ${claim.id} [${label}]: ${claim.statement}`;
}

function formatPaperEvidenceSource(state: CoMathProjectState, evidenceId: string): string {
	const evidence = state.evidence.find((candidate) => candidate.id === evidenceId);
	if (!evidence) return `- ${evidenceId} [missing evidence]`;
	return `- ${evidence.id} [${evidence.kind}] on ${evidence.claimId}: ${evidence.summary}`;
}

function formatPaperWarningSource(state: CoMathProjectState, warningId: string): string {
	const warning = state.warnings.find((candidate) => candidate.id === warningId);
	if (!warning) return `- ${warningId} [missing warning]`;
	return `- ${warning.id} [${warning.status}] ${warning.severity} on ${warning.claimId}: ${warning.message}`;
}

function formatPaperArtifactSource(state: CoMathProjectState, artifactId: string): string {
	const artifact = state.artifacts.find((candidate) => candidate.id === artifactId);
	if (!artifact) return `- ${artifactId} [missing artifact]`;
	return `- ${artifact.id} [${artifact.kind}]: ${artifact.title}`;
}

function formatPaperReviewRoundSource(state: CoMathProjectState, roundId: string): string {
	const round = state.reviewRounds.find((candidate) => candidate.id === roundId);
	if (!round) return `- ${roundId} [missing review round]`;
	return `- ${round.id} [${round.outcome}] ${round.claimId}: ${round.decisionStatus}`;
}

function formatPaperRoleRunSource(state: CoMathProjectState, runId: string): string {
	const run = state.roleRuns.find((candidate) => candidate.id === runId);
	if (!run) return `- ${runId} [missing role run]`;
	return `- ${run.id} [${formatRoleRunStatus(run)}]: ${formatRoleRunTarget(run)}`;
}

function formatPaperSectionMarginNotes(
	state: CoMathProjectState,
	section: CoMathProjectState["workingPaperSections"][number],
): string[] {
	const notes = section.marginNoteIds
		.map((noteId) => state.marginNotes.find((note) => note.id === noteId))
		.filter((note) => note !== undefined);
	return notes.length === 0
		? ["- none"]
		: notes.map((note) => `- ${note.id} [${note.kind}/${note.status}]: ${note.message}`);
}

function formatReviewedFindingsNotInPaper(state: CoMathProjectState): string[] {
	const paperClaimIds = new Set(state.workingPaperSections.flatMap((section) => section.sourceClaimIds));
	const findings = state.claims.filter(
		(claim) => isClaimSynthesisEligible(state, claim.id) && !paperClaimIds.has(claim.id),
	);
	if (findings.length === 0) return ["No reviewed findings are waiting to be added to paper sections."];
	return findings.map((claim) => `- ${claim.id}: ${claim.statement}${formatClaimEvidence(state, claim)}`);
}

function formatOpenMarginNotes(state: CoMathProjectState): string[] {
	const openNotes = state.marginNotes.filter((note) => note.status === "open");
	if (openNotes.length === 0) return ["No open margin notes are recorded."];
	return openNotes.map((note) => {
		const section = note.sectionId ? ` ${note.sectionId}` : "";
		return `- ${note.id} [${note.kind}]${section}: ${note.message}`;
	});
}

function formatReviewRounds(rounds: CoMathProjectState["reviewRounds"]): string[] {
	return [...rounds].reverse().map(formatReviewRound);
}

function formatReportList(state: CoMathProjectState): string[] {
	if (state.reports.length === 0) return ["No reports recorded."];
	return state.reports.map((report) => {
		const run = findReportRoleRun(state, report.id);
		const latestReview = getLatestReportReview(state, report.id);
		const runText = run ? ` run=${run.id}` : "";
		const reviewText = latestReview ? latestReview.outcome : "none";
		return `- ${report.id}: ${report.title} [latest review: ${reviewText}]${runText}`;
	});
}

function formatReportDetails(state: CoMathProjectState, report: CoMathProjectState["reports"][number]): string {
	const run = findReportRoleRun(state, report.id);
	const reviews = state.reportReviewRounds.filter((round) => round.reportId === report.id);
	const createdWarningIds = uniqueStrings(reviews.flatMap((round) => round.createdWarningIds));
	return [
		`Report ${report.id}: ${report.title}`,
		`Summary: ${report.summary}`,
		"Blockers:",
		...formatBlockerLines(report.blockers),
		`Linked role run: ${run?.id ?? "none"}`,
		"Report review rounds:",
		...formatReportReviewRounds(reviews),
		"Warnings created by report reviews:",
		...(createdWarningIds.length === 0
			? ["- none"]
			: createdWarningIds.map((warningId) => formatPaperWarningSource(state, warningId))),
		`Suggested next action: ${getReportNextAction(report, reviews)}`,
	].join("\n");
}

function formatReportReviewRounds(rounds: CoMathProjectState["reportReviewRounds"]): string[] {
	if (rounds.length === 0) return ["- none"];
	return rounds.map((round) => `- ${round.id} [${round.outcome}]: ${round.summary}`);
}

function findReportRoleRun(state: CoMathProjectState, reportId: string): RoleRunRecord | undefined {
	return state.roleRuns.find((run) => run.reportId === reportId);
}

function getLatestReportReview(
	state: CoMathProjectState,
	reportId: string,
): CoMathProjectState["reportReviewRounds"][number] | undefined {
	return [...state.reportReviewRounds]
		.filter((round) => round.reportId === reportId)
		.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

function getReportNextAction(
	report: CoMathProjectState["reports"][number],
	reviews: CoMathProjectState["reportReviewRounds"],
): string {
	const latestReview = [...reviews].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
	if (!latestReview || latestReview.outcome === "revision_requested" || latestReview.outcome === "blocked") {
		return `/comath review-report ${report.id} accepted|revision-requested|blocked: <summary>`;
	}
	return "/comath status";
}

function formatClaimHistory(state: CoMathProjectState, claim: Claim): string {
	const revisions = state.claimRevisions.filter((revision) => revision.claimId === claim.id);
	const rounds = state.reviewRounds.filter((round) => round.claimId === claim.id);
	const openWarningCount = claim.warningIds.filter((warningId) => {
		const warning = state.warnings.find((candidate) => candidate.id === warningId);
		return warning?.status === "open";
	}).length;
	return [
		`Claim history for ${claim.id}`,
		`Current [${claim.status}]: ${claim.statement}`,
		`Evidence: ${formatIdList(claim.evidenceIds)}`,
		`Warnings: ${formatIdList(claim.warningIds)}`,
		`Open warnings: ${openWarningCount}`,
		"Revisions:",
		...formatClaimRevisionsChronologically(revisions),
		"Review rounds:",
		...formatReviewRoundsChronologically(rounds),
	].join("\n");
}

function formatReviewRoundsChronologically(rounds: CoMathProjectState["reviewRounds"]): string[] {
	return rounds.length === 0 ? ["- none"] : rounds.map(formatReviewRound);
}

function formatReviewRound(round: CoMathProjectState["reviewRounds"][number]): string {
	return `- ${round.id} ${round.claimId} [${round.outcome}] decision=${round.decisionStatus} run=${round.roleRunId} report=${round.reportId} evidence+${round.createdEvidenceIds.length} warnings+${round.createdWarningIds.length} resolved=${round.resolvedWarningIds.length}`;
}

function formatClaimRevisionsChronologically(revisions: CoMathProjectState["claimRevisions"]): string[] {
	if (revisions.length === 0) return ["- none"];
	return revisions.map(formatClaimRevision);
}

function formatClaimRevision(revision: CoMathProjectState["claimRevisions"][number]): string {
	return `- ${revision.id} ${revision.actor}: ${revision.reason}\n  previous: ${revision.previousStatement}\n  revised: ${revision.revisedStatement}`;
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

function getLinkableGoalIds(state: CoMathProjectState): string[] {
	return state.approvedGoals
		.filter((goal) => goal.status === "approved" || goal.status === "active")
		.map((goal) => goal.id);
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
			"Goal statuses:",
			...formatGoalStatusCounts(state),
			`Workstreams: ${state.workstreams.length}`,
			"Workstream statuses:",
			...formatWorkstreamStatusCounts(state),
			`Claims: ${state.claims.length}`,
			`Open warnings: ${state.warnings.filter((warning) => warning.status === "open").length}`,
			`Open margin notes: ${state.marginNotes.filter((note) => note.status === "open").length}`,
			`Claims eligible for synthesis: ${state.claims.filter((claim) => isClaimSynthesisEligible(state, claim.id)).length}`,
			`Pending review queue: ${state.reviewQueue.length}`,
			"Report reviews:",
			...formatReportReviewCounts(state),
			`Artifacts: ${state.artifacts.length}`,
			`Working paper sections: ${state.workingPaperSections.length}`,
			`Events: ${state.events.length}`,
			`Live background runs: ${backgroundRoleRuns.size}`,
			"Role runs:",
			...formatRoleRunStatusCounts(state),
			`Next safe action: ${getNextSafeActionDetails(state).action}`,
		].join("\n"),
	);
}

async function showNextSafeAction(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const state = await loadProjectState(getDefaultStatePath(ctx.cwd));
	const details = state
		? getNextSafeActionDetails(state)
		: {
				action: "/comath init <root question>",
				reason: "no co-math project state exists.",
			};
	showCommandMessage(pi, ctx, ["Co-math next safe action", details.action, `Reason: ${details.reason}`].join("\n"));
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
		return `- ${run.id} [${formatRoleRunStatus(run)}] ${formatRoleRunTarget(run)}${report}${blockers}`;
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

async function showWorkstreamStatus(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	workstreamId: string,
): Promise<void> {
	const trimmedWorkstreamId = workstreamId.trim();
	if (trimmedWorkstreamId.length === 0) {
		showCommandMessage(pi, ctx, "Usage: /comath workstream-status <workstream-id>");
		return;
	}

	const state = await loadProjectStateOrNotify(pi, ctx);
	if (!state) {
		return;
	}

	const workstream = state.workstreams.find((candidate) => candidate.id === trimmedWorkstreamId);
	if (!workstream) {
		showCommandMessage(pi, ctx, `No workstream found for ${trimmedWorkstreamId}.`);
		return;
	}

	showCommandMessage(pi, ctx, formatWorkstreamDetails(state, workstream));
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
		`Execution mode: ${run.executionMode ?? "none"}`,
		...(run.executionMode === "background"
			? [`Live in this session: ${backgroundRoleRuns.has(run.id) ? "yes" : "no; use /comath recover-run if stale"}`]
			: []),
		`Report: ${run.reportId ?? "none"}`,
		`Created claims: ${formatIdList(run.createdClaimIds)}`,
		`Created evidence: ${formatIdList(run.createdEvidenceIds)}`,
		`Created warnings: ${formatIdList(run.createdWarningIds)}`,
		`Created artifacts: ${formatIdList(run.createdArtifactIds)}`,
		"Blockers:",
		...formatBlockerLines(run.blockerMessages),
		...(run.errorMessage ? [`Error: ${run.errorMessage}`] : []),
		`Queued: ${run.queuedAt ?? "none"}`,
		`Started: ${run.startedAt ?? "none"}`,
		`Cancelled: ${run.cancelledAt ?? "none"}`,
		`Cancel reason: ${run.cancelReason ?? "none"}`,
		`Completed: ${run.completedAt ?? "none"}`,
	].join("\n");
}

function formatWorkstreamDetails(state: CoMathProjectState, workstream: Workstream): string {
	const claims = workstream.claimIds
		.map((claimId) => state.claims.find((claim) => claim.id === claimId))
		.filter((claim) => claim !== undefined);
	const openWarningIds = claims.flatMap((claim) =>
		claim.warningIds.filter((warningId) => {
			const warning = state.warnings.find((candidate) => candidate.id === warningId);
			return warning?.status === "open";
		}),
	);
	const relatedArtifactIds = state.artifacts
		.filter(
			(artifact) =>
				artifact.relatedWorkstreamIds.includes(workstream.id) ||
				artifact.relatedClaimIds.some((claimId) => workstream.claimIds.includes(claimId)) ||
				artifact.relatedReportIds.some((reportId) => workstream.latestReportIds.includes(reportId)),
		)
		.map((artifact) => artifact.id);
	return [
		`Workstream ${workstream.id}: ${workstream.title}`,
		`Status: ${workstream.status}`,
		`Status reason: ${workstream.statusReason ?? "none"}`,
		"Linked goals:",
		...formatLinkedGoals(state, workstream.goalIds),
		`Latest reports: ${formatIdList(workstream.latestReportIds)}`,
		"Latest runs:",
		...formatWorkstreamRuns(state, workstream.latestRunIds),
		"Claims:",
		...formatWorkstreamClaims(claims),
		`Attached open warnings: ${openWarningIds.length}`,
		`Open warning ids: ${formatIdList(openWarningIds)}`,
		`Related artifacts: ${formatIdList(relatedArtifactIds)}`,
		`Suggested next action: ${getWorkstreamNextAction(workstream, openWarningIds.length)}`,
	].join("\n");
}

function formatLinkedGoals(state: CoMathProjectState, goalIds: string[]): string[] {
	if (goalIds.length === 0) return ["- none"];
	return goalIds.map((goalId) => {
		const goal = state.approvedGoals.find((candidate) => candidate.id === goalId);
		return goal ? `- ${goal.id} [${goal.status}]: ${goal.text}` : `- ${goalId}: missing`;
	});
}

function formatWorkstreamRuns(state: CoMathProjectState, runIds: string[]): string[] {
	if (runIds.length === 0) return ["- none"];
	return runIds.map((runId) => {
		const run = state.roleRuns.find((candidate) => candidate.id === runId);
		return run ? `- ${run.id} [${formatRoleRunStatus(run)}]` : `- ${runId}: missing`;
	});
}

function formatWorkstreamClaims(claims: Claim[]): string[] {
	if (claims.length === 0) return ["- none"];
	return claims.map((claim) => `- ${claim.id} [${claim.status}]: ${claim.statement}`);
}

function getWorkstreamNextAction(workstream: Workstream, openWarningCount: number): string {
	if (workstream.status === "blocked") return "/comath unblock <workstream-id>: <reason>";
	if (openWarningCount > 0) return "/comath review-queue";
	if (workstream.status === "needs_review") return "/comath run reviewer <claim-id>";
	return "/comath run workstream <workstream-id>";
}

function formatRoleRunTarget(run: RoleRunRecord): string {
	if (run.targetWorkstreamId) return `${run.role} ${run.targetWorkstreamId}`;
	if (run.targetClaimId) return `${run.role} ${run.targetClaimId}`;
	return run.role;
}

function formatRoleRunStatus(run: RoleRunRecord): string {
	return run.executionMode === "background" ? `${run.status}/background` : run.status;
}

function getRoleRunTargetRelatedIds(run: RoleRunRecord): string[] {
	return [run.targetWorkstreamId, run.targetClaimId].filter((id) => id !== undefined);
}

function hasRoleRunOutputs(run: RoleRunRecord): boolean {
	return (
		run.reportId !== undefined ||
		run.createdClaimIds.length > 0 ||
		run.createdEvidenceIds.length > 0 ||
		run.createdWarningIds.length > 0 ||
		run.createdArtifactIds.length > 0
	);
}

function isTerminalStartedStatus(status: RoleRunStatus): boolean {
	return status === "completed" || status === "blocked" || status === "failed" || status === "aborted";
}

function formatIdList(ids: string[]): string {
	return ids.length === 0 ? "none" : ids.join(", ");
}

function formatBlockerLines(blockers: string[]): string[] {
	return blockers.length === 0 ? ["- none"] : blockers.map((blocker) => `- ${blocker}`);
}

function formatGoalStatusCounts(state: CoMathProjectState): string[] {
	const statuses = ["proposed", "approved", "active", "completed", "deferred"] as const;
	return statuses.map(
		(status) => `- ${status}: ${state.approvedGoals.filter((goal) => goal.status === status).length}`,
	);
}

function formatWorkstreamStatusCounts(state: CoMathProjectState): string[] {
	const statuses: WorkstreamStatus[] = ["active", "running", "blocked", "needs_review"];
	return statuses.map(
		(status) => `- ${status}: ${state.workstreams.filter((workstream) => workstream.status === status).length}`,
	);
}

function formatReportReviewCounts(state: CoMathProjectState): string[] {
	const outcomes = ["accepted", "revision_requested", "blocked"] as const;
	return outcomes.map(
		(outcome) => `- ${outcome}: ${state.reportReviewRounds.filter((round) => round.outcome === outcome).length}`,
	);
}

interface NextSafeActionDetails {
	action: string;
	reason: string;
}

function getNextSafeActionDetails(state: CoMathProjectState): NextSafeActionDetails {
	const openWarningCount = state.warnings.filter((warning) => warning.status === "open").length;
	const firstProposedGoal = state.approvedGoals.find((goal) => goal.status === "proposed");
	const firstUnreviewedReport = state.reports.find(
		(report) => !state.reportReviewRounds.some((round) => round.reportId === report.id),
	);
	const hasWorkingPaperExport = state.artifacts.some((artifact) => artifact.kind === "working_paper_export");
	if (state.approvedGoals.length === 0) {
		return {
			action: "/comath propose-goal <goal> or /comath goal <goal>",
			reason: "no goals exist.",
		};
	}
	if (getLinkableGoalIds(state).length === 0) {
		return {
			action: `/comath approve-goal ${firstProposedGoal?.id ?? "<goal-id>"}`,
			reason: "proposed goals exist but none are approved.",
		};
	}
	if (state.workstreams.length === 0) {
		return {
			action: "/comath workstream <slug>: <title>",
			reason: "approved or active goals exist but no workstreams exist.",
		};
	}
	if (openWarningCount > 0) {
		return {
			action: "/comath review-queue",
			reason: "open warnings need review.",
		};
	}
	if (state.reviewQueue.length > 0) {
		return {
			action: "/comath run reviewer <claim-id>",
			reason: "claims are waiting in the review queue.",
		};
	}
	if (firstUnreviewedReport) {
		return {
			action: `/comath review-report ${firstUnreviewedReport.id} accepted|revision-requested|blocked: <summary>`,
			reason: "at least one report has no report review.",
		};
	}
	if (!hasWorkingPaperExport) {
		return {
			action: "/comath export-paper .pi/co-math/working-paper.md --force",
			reason: "no working-paper export artifact exists.",
		};
	}
	return {
		action: "/comath audit",
		reason: "workflow state has goals, workstreams, reviewed reports, and an export.",
	};
}

function formatRoleRunStatusCounts(state: CoMathProjectState): string[] {
	const statuses: RoleRunStatus[] = ["queued", "running", "completed", "blocked", "failed", "aborted", "cancelled"];
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

function sendBackgroundMessage(pi: ExtensionAPI, text: string): void {
	pi.sendMessage({
		customType: "co-math",
		content: text,
		display: true,
		details: { kind: "background" },
	});
}
