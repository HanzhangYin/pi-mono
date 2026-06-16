import type { ResearchPath, ResearchWorkstreamRunStage } from "../../../examples/extensions/co-math/schema.ts";
import {
	type CoMathParsedMarkdown as ParsedMarkdown,
	parseCoMathMarkdown as parseMarkdown,
	getCoMathMarkdownSectionItems as sectionItems,
} from "./comath-markdown.ts";
import {
	buildCoordinatorBrief,
	type ResearchWorkstreamReport,
	type ResearchWorkstreamStep,
} from "./comath-research-workstream.ts";

export type ResearchWorkstreamModelRole = "specialist" | "critic" | "synthesizer";

export interface ResearchWorkstreamModelRequest {
	role: ResearchWorkstreamModelRole;
	rootQuestion: string;
	path: ResearchPath;
	allPaths: readonly ResearchPath[];
	priorFindings: readonly string[];
	/** Prior role outputs fed into this role (empty for the specialist). */
	inputText: string;
	/** Fully-built role prompt the executor should send to the model. */
	prompt: string;
}

export interface ResearchWorkstreamModelResponse {
	text: string;
}

export interface ResearchWorkstreamModelExecutor {
	run(request: ResearchWorkstreamModelRequest): Promise<ResearchWorkstreamModelResponse>;
}

export interface RunModelBackedResearchWorkstreamInput {
	rootQuestion: string;
	path: ResearchPath;
	allPaths: readonly ResearchPath[];
	now: string;
	executor: ResearchWorkstreamModelExecutor;
}

export interface ResearchWorkstreamStageResult {
	stage: ResearchWorkstreamRunStage;
	title: string;
	summary: string;
	details: string[];
	rawText?: string;
}

export interface ResearchWorkstreamStageCallbacks {
	onStageStarted?: (stage: ResearchWorkstreamRunStage, summary: string) => Promise<void> | void;
	onStageCompleted?: (result: ResearchWorkstreamStageResult) => Promise<void> | void;
}

/**
 * Run a bounded, model-backed research workstream: specialist attempt -> critic review ->
 * synthesizer. Each role is a single bounded model call through the injected executor. Outputs are
 * parsed from markdown sections; missing sections fall back to safe text extraction so this never
 * throws on imperfect model output. The harness decides when to use this vs the deterministic
 * workstream and handles executor failures by falling back to deterministic execution.
 */
export async function runModelBackedResearchWorkstream(
	input: RunModelBackedResearchWorkstreamInput,
): Promise<ResearchWorkstreamReport> {
	return runModelBackedResearchWorkstreamStaged(input, {});
}

export async function runModelBackedResearchWorkstreamStaged(
	input: RunModelBackedResearchWorkstreamInput,
	callbacks: ResearchWorkstreamStageCallbacks,
): Promise<ResearchWorkstreamReport> {
	const rootQuestion = input.rootQuestion.trim();
	const { path, allPaths, executor } = input;
	const priorFindings = path.latestFindings;
	const coordinatorBrief = buildCoordinatorBrief(path);
	await callbacks.onStageStarted?.("coordinator", "Framing the research path.");
	await callbacks.onStageCompleted?.({
		stage: "coordinator",
		title: "Coordinator brief",
		summary: "Framed the objective and what would count as progress.",
		details: [coordinatorBrief],
	});

	await callbacks.onStageStarted?.("specialist", "Specialist research is running.");
	const specialistText = await runRole(executor, {
		role: "specialist",
		rootQuestion,
		path,
		allPaths,
		priorFindings,
		inputText: "",
		prompt: buildSpecialistPrompt(rootQuestion, path, priorFindings),
	});
	const specialist = parseMarkdown(specialistText);
	await callbacks.onStageCompleted?.({
		stage: "specialist",
		title: "Specialist attempt",
		summary: "Specialist attempt completed.",
		details: renderRoleDetails(specialist),
		rawText: specialistText,
	});

	await callbacks.onStageStarted?.("critic", "Critic review is running.");
	const criticText = await runRole(executor, {
		role: "critic",
		rootQuestion,
		path,
		allPaths,
		priorFindings,
		inputText: specialistText,
		prompt: buildCriticPrompt(rootQuestion, path, specialistText),
	});
	const critic = parseMarkdown(criticText);
	await callbacks.onStageCompleted?.({
		stage: "critic",
		title: "Critic review",
		summary: "Critic review completed.",
		details: renderRoleDetails(critic),
		rawText: criticText,
	});

	await callbacks.onStageStarted?.("synthesizer", "Synthesis is running.");
	const synthesizerText = await runRole(executor, {
		role: "synthesizer",
		rootQuestion,
		path,
		allPaths,
		priorFindings,
		inputText: `${specialistText}\n\n${criticText}`.trim(),
		prompt: buildSynthesizerPrompt(rootQuestion, path, specialistText, criticText),
	});
	const synthesizer = parseMarkdown(synthesizerText);
	await callbacks.onStageCompleted?.({
		stage: "synthesizer",
		title: "Synthesis",
		summary: "Synthesis completed.",
		details: renderRoleDetails(synthesizer),
		rawText: synthesizerText,
	});

	const promisingStrategy = pickItems(sectionItems(synthesizer, "promising"), sectionItems(specialist, "promising"));
	const findings = pickItems(sectionItems(synthesizer, "finding"), sectionItems(specialist, "finding"));
	const criticisms = pickItems(sectionItems(synthesizer, "review"), sectionItems(critic, "review"));
	const gaps = pickItems(
		sectionItems(synthesizer, "gap"),
		sectionItems(critic, "gap"),
		sectionItems(specialist, "gap"),
	);
	const humanHelpUseful = pickItems(sectionItems(synthesizer, "human"), sectionItems(critic, "human"));
	const suggestedNextMove =
		pickSuggestedNextMove(sectionItems(synthesizer, "next"), sectionItems(specialist, "next")) ??
		"Review this attempt and choose the next research move.";
	const workingPaperSummary = buildWorkingPaperSummary(path, {
		workingPaperLines: sectionItems(synthesizer, "working paper"),
		promisingStrategy,
		findings,
		gaps,
		suggestedNextMove,
	});

	const steps: ResearchWorkstreamStep[] = [
		{
			role: "coordinator",
			title: "Coordinator brief",
			summary: "Framing the proof objective.",
			details: [coordinatorBrief],
		},
		{
			role: "specialist",
			title: "Specialist attempt",
			summary: "Asking a specialist to try this path.",
			details: renderRoleDetails(specialist),
		},
		{
			role: "critic",
			title: "Critic review",
			summary: "Reviewing the attempt for gaps before updating the working paper.",
			details: renderRoleDetails(critic),
		},
		{
			role: "synthesizer",
			title: "Synthesis",
			summary: "Synthesizing a cautious research note.",
			details: renderRoleDetails(synthesizer),
		},
	];

	return {
		pathId: path.id,
		pathTitle: path.title,
		startedAt: input.now,
		completedAt: input.now,
		status: "completed",
		coordinatorBrief,
		steps,
		promisingStrategy,
		findings,
		criticisms,
		gaps,
		humanHelpUseful,
		suggestedNextMove,
		workingPaperSectionTitle: workingPaperSectionTitle(path),
		workingPaperSummary,
	};
}

async function runRole(
	executor: ResearchWorkstreamModelExecutor,
	request: ResearchWorkstreamModelRequest,
): Promise<string> {
	const response = await executor.run(request);
	return typeof response.text === "string" ? response.text : "";
}

export function buildSpecialistPrompt(
	rootQuestion: string,
	path: ResearchPath,
	priorFindings: readonly string[],
): string {
	return [
		"You are the specialist for one research path in a co-mathematician workspace.",
		`Root question: ${rootQuestion}`,
		`Selected path: ${path.title}`,
		`Path objective: ${path.objective}`,
		"Existing findings:",
		...formatPriorFindings(priorFindings),
		"",
		"Task:",
		"Attempt this path. Produce useful partial progress, not polished certainty.",
		"Preserve uncertainty. Do not claim a proof of a famous or open problem unless you actually provide a complete proof from the information given.",
		"Do not fabricate citations.",
		"",
		"Return markdown with these headings:",
		"## Findings",
		"## Promising strategy",
		"## Gaps",
		"## Next",
	].join("\n");
}

export function buildCriticPrompt(rootQuestion: string, path: ResearchPath, specialistText: string): string {
	return [
		"You are the critic for one research path in a co-mathematician workspace.",
		`Root question: ${rootQuestion}`,
		`Selected path: ${path.title}`,
		"",
		"Specialist attempt:",
		specialistText.trim() || "(the specialist produced no usable output)",
		"",
		"Task:",
		"Review the specialist attempt for mathematical gaps, overclaims, missing assumptions, and unsupported citations.",
		"Do not solve the whole problem; critique what was attempted. Preserve uncertainty. Do not fabricate citations.",
		"",
		"Return markdown with these headings:",
		"## Review",
		"## Gaps",
		"## Overclaims or source issues",
		"## Human help useful",
	].join("\n");
}

export function buildSynthesizerPrompt(
	rootQuestion: string,
	path: ResearchPath,
	specialistText: string,
	criticText: string,
): string {
	return [
		"You are the synthesizer for one research path in a co-mathematician workspace.",
		`Root question: ${rootQuestion}`,
		`Selected path: ${path.title}`,
		"",
		"Specialist attempt:",
		specialistText.trim() || "(the specialist produced no usable output)",
		"",
		"Critic review:",
		criticText.trim() || "(the critic produced no usable output)",
		"",
		"Task:",
		"Write a cautious research-workstream synthesis for the user and the working paper.",
		"Keep useful ideas. Preserve gaps. Do not claim proofs of famous or open problems. Avoid fabricated citations.",
		"",
		"Return markdown with these headings:",
		"## Promising strategy",
		"## Findings",
		"## Review",
		"## Gap",
		"## Human help useful",
		"## Next",
		"## Working paper summary",
	].join("\n");
}

function formatPriorFindings(priorFindings: readonly string[]): string[] {
	const findings = priorFindings.filter((finding) => finding.trim().length > 0);
	return findings.length > 0 ? findings.map((finding) => `- ${finding}`) : ["- (none yet)"];
}

function renderRoleDetails(parsed: ParsedMarkdown): string[] {
	const items = parsed.sections.flatMap((section) => section.items);
	if (items.length > 0) {
		return items;
	}
	return parsed.raw.slice(0, 12);
}

function pickItems(...candidates: string[][]): string[] {
	for (const candidate of candidates) {
		if (candidate.length > 0) {
			return candidate;
		}
	}
	return [];
}

function pickSuggestedNextMove(...candidates: string[][]): string | undefined {
	for (const candidate of candidates) {
		const nextSteps = candidate.map(normalizeNextStepItem).filter((item) => item.length > 0);
		if (nextSteps.length > 0) {
			return nextSteps.slice(0, 3).join(" ");
		}
	}
	return undefined;
}

function normalizeNextStepItem(item: string): string {
	const normalized = item
		.trim()
		.replace(/^(?:possible\s+)?(?:next|future)\s+(?:steps?|investigations?|directions?|moves?|work)\s*:\s*/i, "")
		.replace(/^next\s*:\s*/i, "")
		.trim();
	if (!normalized || isHeadingLikeNextStep(item)) {
		return "";
	}
	return normalized;
}

function isHeadingLikeNextStep(item: string): boolean {
	const normalized = item.trim();
	return (
		/^(?:possible\s+)?(?:next|future)\s+(?:steps?|investigations?|directions?|moves?|work)\s*:$/i.test(normalized) ||
		(/^[-\w\s]+:$/.test(normalized) && normalized.split(/\s+/).length <= 6)
	);
}

interface WorkingPaperSummaryInput {
	workingPaperLines: string[];
	promisingStrategy: string[];
	findings: string[];
	gaps: string[];
	suggestedNextMove: string;
}

function buildWorkingPaperSummary(path: ResearchPath, input: WorkingPaperSummaryInput): string {
	if (input.workingPaperLines.length > 0) {
		return [`Research workstream: ${path.title}`, "", ...input.workingPaperLines.map((line) => line)].join("\n");
	}
	return [
		`Research workstream: ${path.title}`,
		...(input.promisingStrategy.length > 0
			? ["", "Promising strategy:", ...input.promisingStrategy.map((item) => `- ${item}`)]
			: []),
		...(input.findings.length > 0 ? ["", "Findings:", ...input.findings.map((item) => `- ${item}`)] : []),
		...(input.gaps.length > 0 ? ["", "Open gaps:", ...input.gaps.map((item) => `- ${item}`)] : []),
		"",
		`Next: ${input.suggestedNextMove}`,
	].join("\n");
}

function workingPaperSectionTitle(path: ResearchPath): string {
	const title = path.title.trim().replace(/\s+/g, " ").toLowerCase();
	if (title === "small examples and counterexamples") {
		return "Examples and evidence";
	}
	if (title === "direct proof attempt") {
		return "Direct proof attempts";
	}
	if (title === "reformulation") {
		return "Reformulations";
	}
	if (title === "weaker special cases") {
		return "Weaker statements";
	}
	if (title === "known theorem or literature reduction") {
		return "Literature/theorem targets";
	}
	return "Research notes";
}
