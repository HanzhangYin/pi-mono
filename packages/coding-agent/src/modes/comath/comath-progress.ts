import type {
	CoMathProjectState,
	LiteratureClaimSupport,
	LiteratureSourceArtifact,
	ResearchPath,
	ResearchWorkstreamReportRecord,
	ResearchWorkstreamRunRecord,
} from "../../../examples/extensions/co-math/schema.ts";
import { sanitizeProductIds } from "./comath-backend-output.ts";
import type { CoMathResearchAutoPlan } from "./comath-research-autoplan.ts";
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

export function formatResearchWorkspacePrepared(plan: CoMathResearchAutoPlan): string {
	return [
		"Research workspace prepared",
		"",
		"I’ll explore several possible paths:",
		...plan.paths.map((path, index) => `- Path ${index + 1}: ${path.title}: ${path.objective}`),
		"",
		"Next",
		`I’ll start with ${plan.paths[0] ? `Path 1: ${plan.paths[0].title}` : "the most concrete path"}, because it can quickly reveal what is plausible.`,
	].join("\n");
}

export type ResearchStateSummaryInput = Pick<CoMathProjectState, "researchPaths" | "researchFocus"> & {
	researchReports?: readonly ResearchWorkstreamReportRecord[];
};

export function formatResearchStateSummary(state: ResearchStateSummaryInput): string {
	const active = state.researchPaths.filter((path) => path.status === "active" || path.status === "promising");
	const blocked = state.researchPaths.filter((path) => path.status === "blocked");
	const abandoned = state.researchPaths.filter((path) => path.status === "abandoned");
	const reports = state.researchReports ?? [];
	const best = chooseResearchPath(state);
	return [
		"Current research state",
		"",
		"Active paths",
		...(active.length > 0
			? active.map((path) => formatResearchPathLine(state, path, reports))
			: ["- None right now."]),
		...(blocked.length > 0
			? ["", "Blocked paths", ...blocked.map((path) => formatResearchPathLine(state, path, reports))]
			: []),
		...(abandoned.length > 0
			? ["", "Abandoned for now", ...abandoned.map((path) => `- ${formatResearchPathLabel(state, path)}`)]
			: []),
		"",
		"Most promising next move",
		best ? `${best.suggestedNextMove}` : "Choose a path to continue.",
	].join("\n");
}

export function formatResearchFocusUpdated(path: ResearchPath, reason: string): string {
	return [
		"Focus updated",
		"",
		`I’ll prioritize the ${path.title} path.`,
		"",
		"Reason",
		reason,
		"",
		"Next",
		path.suggestedNextMove,
	].join("\n");
}

export function formatResearchPathDropped(path: ResearchPath, reason: string): string {
	return ["Path updated", "", "Abandoned for now:", `- ${path.title}`, "", "Reason", reason].join("\n");
}

export function formatResearchRoundUpdated(path: ResearchPath, finding: string): string {
	return [
		"Research round updated",
		"",
		"Path",
		path.title,
		"",
		"Finding",
		finding,
		"",
		"Next",
		path.suggestedNextMove,
	].join("\n");
}

export interface FormatResearchRoundCompletedInput {
	state: Pick<CoMathProjectState, "researchPaths">;
	path: ResearchPath;
	findings: readonly string[];
	uncertainties: readonly string[];
	suggestedNextMove: string;
	workingPaperSectionTitle: string;
}

export function formatResearchRoundCompleted(input: FormatResearchRoundCompletedInput): string {
	const uncertainties =
		input.uncertainties.length > 0 ? input.uncertainties : ["No specific uncertainty was recorded for this round."];
	return [
		"Research round completed",
		"",
		formatResearchPathLabel(input.state, input.path),
		"",
		"Findings",
		...input.findings.map((finding) => `- ${finding}`),
		"",
		"Uncertainty",
		...uncertainties.map((uncertainty) => `- ${uncertainty}`),
		"",
		"Next",
		input.suggestedNextMove,
		"",
		"Working paper updated",
		`- Added notes under "${input.workingPaperSectionTitle}."`,
	].join("\n");
}

export type ResearchWorkstreamReportView = Pick<
	ResearchWorkstreamReportRecord,
	| "pathId"
	| "pathTitle"
	| "status"
	| "coordinatorBrief"
	| "steps"
	| "promisingStrategy"
	| "findings"
	| "criticisms"
	| "gaps"
	| "humanHelpUseful"
	| "suggestedNextMove"
	| "workingPaperSectionTitle"
> & {
	sourceIds?: readonly string[];
	claimSupportIds?: readonly string[];
};

export interface FormatResearchWorkstreamInput {
	state: Pick<CoMathProjectState, "researchPaths"> & {
		literatureSources?: readonly LiteratureSourceArtifact[];
		literatureClaimSupports?: readonly LiteratureClaimSupport[];
	};
	report: ResearchWorkstreamReportView;
}

export interface FormatResearchWorkstreamRunInput {
	state: Pick<CoMathProjectState, "researchPaths">;
	run: ResearchWorkstreamRunRecord;
}

export function formatResearchWorkstreamStarted(input: FormatResearchWorkstreamInput): string {
	const progress = ["coordinator", "specialist", "critic", "synthesizer"]
		.map((role) => input.report.steps.find((step) => step.role === role))
		.filter((step): step is ResearchWorkstreamReportView["steps"][number] => step !== undefined)
		.map((step) => `- ${step.summary}`);
	return [
		"Research workstream started",
		"",
		formatResearchReportPathLabel(input.state, input.report),
		"",
		"Progress",
		...(progress.length > 0 ? progress : ["- Working through the path."]),
	].join("\n");
}

export function formatResearchWorkstreamRunStarted(input: FormatResearchWorkstreamRunInput): string {
	if (isLiteraturePathTitle(input.run.pathTitle)) {
		return [
			"Research workstream started",
			"",
			formatResearchRunPathLabel(input.state, input.run),
			"",
			"Current status",
			"- Coordinator is identifying what needs source support.",
			"- Literature specialist is looking for relevant known theorems and references.",
			"",
			'You can keep steering while it runs. Try: "show progress", "show latest report", or "summarize current state".',
		].join("\n");
	}
	return [
		"Research workstream started",
		"",
		formatResearchRunPathLabel(input.state, input.run),
		"",
		"Current status",
		"- Coordinator framed the path.",
		"- Specialist research is running in the background.",
		"",
		'You can keep steering while it runs. Try: "show progress", "show latest report", or "summarize current state".',
	].join("\n");
}

export function formatResearchWorkstreamRunProgress(input: FormatResearchWorkstreamRunInput): string {
	const latest = input.run.incrementalReports.at(-1);
	return [
		`Research workstream ${formatResearchRunStatus(input.run.status)}`,
		"",
		formatResearchRunPathLabel(input.state, input.run),
		"",
		"Current stage",
		formatResearchStage(input.run.currentStage),
		"",
		"Latest incremental report",
		...(latest
			? [`- ${latest.title}: ${latest.summary}`, ...latest.details.slice(0, 3).map((detail) => `- ${detail}`)]
			: ["- Coordinator has framed the path; the first research attempt has not reported back yet."]),
	].join("\n");
}

export function formatResearchWorkstreamRunStillRunningReport(input: FormatResearchWorkstreamRunInput): string {
	return [
		"Latest research report is still running.",
		"",
		formatResearchRunPathLabel(input.state, input.run),
		"",
		"Incremental reports",
		...(input.run.incrementalReports.length > 0
			? input.run.incrementalReports.flatMap((report) => [
					`- ${report.title}: ${report.status}`,
					`  ${report.summary}`,
					...report.details.slice(0, 2).map((detail) => `  - ${detail}`),
				])
			: ["- No incremental report has been saved yet."]),
	].join("\n");
}

export function formatResearchWorkstreamRunFailed(input: FormatResearchWorkstreamRunInput): string {
	return [
		"Research workstream failed",
		"",
		formatResearchRunPathLabel(input.state, input.run),
		"",
		"Reason",
		input.run.failureReason ?? "The research attempt stopped before producing a final report.",
		"",
		'You can inspect progress with "show latest report" or try another path.',
	].join("\n");
}

export function formatResearchWorkstreamAlreadyRunning(input: FormatResearchWorkstreamRunInput): string {
	return [
		`A research workstream is already running on ${formatResearchRunPathLabel(input.state, input.run)}.`,
		'Say "show progress" to inspect it, or wait for it to finish.',
	].join("\n");
}

export function formatResearchWorkstreamCompleted(input: FormatResearchWorkstreamInput): string {
	const { report } = input;
	const supports = formatClaimSupports(input.state, report.claimSupportIds ?? []);
	const references = formatReferences(input.state, report.sourceIds ?? []);
	return [
		"Research workstream completed",
		"",
		formatResearchReportPathLabel(input.state, report),
		"",
		"Promising strategy",
		...bulletsOrFallback(report.promisingStrategy, "No promising strategy identified yet."),
		"",
		"Review",
		...bulletsOrFallback(report.criticisms, "No review notes recorded."),
		"",
		"Gap",
		...bulletsOrFallback(report.gaps, "No open gaps recorded."),
		...(report.humanHelpUseful.length > 0
			? ["", "Human help useful", ...report.humanHelpUseful.map((item) => `- ${item}`)]
			: []),
		...(supports.length > 0 ? ["", "Source-backed distinctions", ...supports] : []),
		...(references.length > 0 ? ["", "References", ...references] : []),
		"",
		"Next",
		report.suggestedNextMove,
		"",
		"Working paper updated",
		`- Added synthesized notes under "${report.workingPaperSectionTitle}."`,
		"",
		"Details",
		'- Say "show latest report" to inspect the internal attempt and critique.',
	].join("\n");
}

export function formatResearchWorkstreamReport(input: FormatResearchWorkstreamInput): string {
	const { report } = input;
	const coordinator = report.steps.find((step) => step.role === "coordinator");
	const specialist = report.steps.find((step) => step.role === "specialist");
	const critic = report.steps.find((step) => step.role === "critic");
	const supports = formatClaimSupports(input.state, report.claimSupportIds ?? []);
	const references = formatReferences(input.state, report.sourceIds ?? []);
	return [
		"Latest research report",
		"",
		formatResearchReportPathLabel(input.state, report),
		"",
		"Coordinator brief",
		...(coordinator && coordinator.details.length > 0 ? coordinator.details : [report.coordinatorBrief]),
		"",
		specialist?.title ?? "Specialist attempt",
		...bulletsOrFallback(specialist?.details ?? report.findings, "No attempt details were recorded."),
		"",
		critic?.title ?? "Critic review",
		...bulletsOrFallback(critic?.details ?? report.criticisms, "No review details were recorded."),
		"",
		"Synthesis",
		...bulletsOrFallback(report.promisingStrategy, "No synthesized strategy was recorded."),
		...(supports.length > 0 ? ["", "Claim support", ...supports] : []),
		...(references.length > 0 ? ["", "References / attachments", ...references] : []),
		...(report.humanHelpUseful.length > 0
			? ["", "Human help useful", ...report.humanHelpUseful.map((item) => `- ${item}`)]
			: []),
		"",
		"Next",
		report.suggestedNextMove,
	].join("\n");
}

export function formatResearchModelFallbackNote(): string {
	return "I used the local fallback for this round because model-backed research was unavailable.";
}

function bulletsOrFallback(items: readonly string[], fallback: string): string[] {
	return items.length > 0 ? items.map((item) => `- ${item}`) : [`- ${fallback}`];
}

function formatReferences(
	state: Pick<CoMathProjectState, "researchPaths"> & {
		literatureSources?: readonly LiteratureSourceArtifact[];
	},
	sourceIds: readonly string[],
): string[] {
	const sourceById = new Map((state.literatureSources ?? []).map((source) => [source.id, source]));
	return sourceIds
		.map((sourceId) => {
			const source = sourceById.get(sourceId);
			if (!source) {
				return undefined;
			}
			const locator = source.url ?? source.path ?? source.kind;
			return `- ${source.id}: ${source.title}${locator ? ` — ${locator}` : ""}`;
		})
		.filter((line): line is string => line !== undefined);
}

function formatClaimSupports(
	state: Pick<CoMathProjectState, "researchPaths"> & {
		literatureClaimSupports?: readonly LiteratureClaimSupport[];
	},
	claimSupportIds: readonly string[],
): string[] {
	const supportById = new Map((state.literatureClaimSupports ?? []).map((support) => [support.id, support]));
	return claimSupportIds
		.map((supportId) => {
			const support = supportById.get(supportId);
			if (!support) {
				return undefined;
			}
			const sources = support.sourceIds.length > 0 ? ` (${support.sourceIds.join(", ")})` : "";
			const note = support.note ? ` — ${support.note}` : "";
			return `- ${support.status}: ${support.claim}${sources}${note}`;
		})
		.filter((line): line is string => line !== undefined);
}

function formatResearchReportPathLabel(
	state: Pick<CoMathProjectState, "researchPaths">,
	report: Pick<ResearchWorkstreamReportView, "pathId" | "pathTitle">,
): string {
	const pathIndex = state.researchPaths.findIndex((candidate) => candidate.id === report.pathId);
	return pathIndex >= 0 ? `Path ${pathIndex + 1}: ${report.pathTitle}` : report.pathTitle;
}

function formatResearchRunPathLabel(
	state: Pick<CoMathProjectState, "researchPaths">,
	run: Pick<ResearchWorkstreamRunRecord, "pathId" | "pathTitle">,
): string {
	const pathIndex = state.researchPaths.findIndex((candidate) => candidate.id === run.pathId);
	return pathIndex >= 0 ? `Path ${pathIndex + 1}: ${run.pathTitle}` : run.pathTitle;
}

function formatResearchRunStatus(status: ResearchWorkstreamRunRecord["status"]): string {
	if (status === "queued") {
		return "queued";
	}
	if (status === "running") {
		return "running";
	}
	if (status === "completed") {
		return "completed";
	}
	if (status === "blocked") {
		return "blocked";
	}
	return "failed";
}

function formatResearchStage(stage: ResearchWorkstreamRunRecord["currentStage"]): string {
	if (stage === "coordinator") {
		return "Coordinator brief";
	}
	if (stage === "literature-search") {
		return "Literature search";
	}
	if (stage === "specialist") {
		return "Specialist attempt";
	}
	if (stage === "critic") {
		return "Critic review";
	}
	return "Synthesis";
}

function isLiteraturePathTitle(title: string): boolean {
	return /\b(?:known theorem|literature|reference|source)\b/i.test(title);
}

function formatResearchPathLine(
	state: Pick<CoMathProjectState, "researchPaths">,
	path: ResearchPath,
	reports: readonly ResearchWorkstreamReportRecord[],
): string {
	const findings = path.latestFindings.slice(-3);
	const pathIndex = state.researchPaths.findIndex((candidate) => candidate.id === path.id);
	const hasReport = reports.some((report) => report.pathId === path.id);
	return [
		`- ${formatResearchPathLabel(state, path)}: ${path.status}`,
		...(findings.length > 0 ? ["  Latest findings", ...findings.map((finding) => `  - ${finding}`)] : []),
		`  Next: ${path.suggestedNextMove}`,
		...(hasReport && pathIndex >= 0 ? [`  Report: available; say "show details for path ${pathIndex + 1}".`] : []),
	].join("\n");
}

function formatResearchPathLabel(state: Pick<CoMathProjectState, "researchPaths">, path: ResearchPath): string {
	const pathIndex = state.researchPaths.findIndex((candidate) => candidate.id === path.id);
	return pathIndex >= 0 ? `Path ${pathIndex + 1}: ${path.title}` : path.title;
}

function chooseResearchPath(
	state: Pick<CoMathProjectState, "researchPaths" | "researchFocus">,
): ResearchPath | undefined {
	const focused = state.researchFocus?.pathIds
		.map((pathId) => state.researchPaths.find((path) => path.id === pathId))
		.find((path): path is ResearchPath => path !== undefined && path.status !== "abandoned");
	if (focused) {
		return focused;
	}
	return [...state.researchPaths]
		.filter((path) => path.status === "active" || path.status === "promising")
		.sort((a, b) => a.priority - b.priority)[0];
}
