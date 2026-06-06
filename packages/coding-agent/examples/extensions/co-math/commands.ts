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
	removeReviewQueueItemsForClaim,
	resolveMarginNote,
	resolveWarning,
	reviseClaim,
	saveProjectState,
	setClaimStatus,
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
/comath reviews [claim-id] - list recorded reviewer rounds
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

	if (subcommand === "review-queue") {
		await showReviewQueue(pi, ctx);
		return;
	}

	if (subcommand === "reviews") {
		await showReviewRounds(pi, ctx, remainder);
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
		showCommandMessage(pi, ctx, `Started co-math ${run.role} role run ${run.id} in background.`);
		return;
	}
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
		const result = await roleRunner({
			cwd: ctx.cwd,
			role: run.role,
			task: run.task,
			signal: ctx.signal,
		});
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
		const finishedState = finishRoleRun(ingestion.state, {
			runId: run.id,
			status: result.blockers && result.blockers.length > 0 ? "blocked" : "completed",
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
		showCommandMessage(pi, ctx, formatRoleRunMessage(run.role, reportId, result));
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
		showCommandMessage(pi, ctx, `Co-math ${run.role} role run ${run.id} ${status}: ${errorMessage}`);
	}
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
	return state.artifacts.map(
		(artifact) => `- ${artifact.id} [${artifact.kind}] ${artifact.title}: ${artifact.summary}`,
	);
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
		"## Working paper sections",
		...formatWorkingPaperSections(state),
		"",
		"## Reviewed findings not yet in paper",
		...formatReviewedFindingsNotInPaper(state),
		"",
		"## Open warnings",
		...formatOpenWarnings(state),
		"",
		"## Open margin notes",
		...formatOpenMarginNotes(state),
	].join("\n");
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
			`Working paper sections: ${state.workingPaperSections.length}`,
			`Open margin notes: ${state.marginNotes.filter((note) => note.status === "open").length}`,
			`Events: ${state.events.length}`,
			`Live background runs: ${backgroundRoleRuns.size}`,
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

function formatWorkstreamStatusCounts(state: CoMathProjectState): string[] {
	const statuses: WorkstreamStatus[] = ["active", "running", "blocked", "needs_review"];
	return statuses.map(
		(status) => `- ${status}: ${state.workstreams.filter((workstream) => workstream.status === status).length}`,
	);
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
