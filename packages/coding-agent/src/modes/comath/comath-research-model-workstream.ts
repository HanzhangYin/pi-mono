import type { ComputationalExecutor } from "./comath-computation-executor.ts";
import {
	filterCoMathProductLines,
	type CoMathParsedMarkdown as ParsedMarkdown,
	parseCoMathMarkdown as parseMarkdown,
	getCoMathMarkdownSectionItems as sectionItems,
} from "./comath-markdown.ts";
import {
	applyPivotsToSuggestedNextMove,
	buildDisciplineGuidance,
	buildProofTaskGuidance,
	buildStandingConstraintsBlock,
	dedupeRoutePivots,
	dedupeTheoremChecks,
	parseNegativeConstraints,
	parseRoutePivots,
	parseTheoremApplicabilityChecks,
	pickSuggestedNextMove,
	splitHumanHelpItems,
} from "./comath-research-discipline.ts";
import { runSpecialistToolLoop, type SpecialistToolLoopResult } from "./comath-research-specialist-loop.ts";
import {
	buildCoordinatorBrief,
	type ResearchWorkstreamReport,
	type ResearchWorkstreamStep,
} from "./comath-research-workstream.ts";
import { researchCompletionTimestamp } from "./comath-time.ts";
import type {
	ResearchConstraintRecord,
	ResearchPath,
	ResearchPlanTaskKind,
	ResearchWorkstreamRunStage,
} from "./schema.ts";

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
	/**
	 * Optional plan-task brief (goal + acceptance criteria) steering the specialist. Only the
	 * generic workstream honors this today; literature/computation workstreams have their own
	 * stage-specific prompts.
	 */
	directive?: string;
	/** Standing research constraints every role must respect (active ones are shown verbatim). */
	standingConstraints?: readonly ResearchConstraintRecord[];
	/** The plan-task kind this run executes; proof-level kinds get proof-first guidance. */
	taskKind?: ResearchPlanTaskKind;
	/**
	 * When present, the specialist stage runs as a bounded agentic tool loop (sandboxed
	 * computations mid-attempt, durable claim recording) instead of a single model call. A model
	 * that answers directly still makes exactly one call. `onFinished` hands the loop's durable
	 * side-effects (computation records, recorded claims) to the caller for persistence before the
	 * critic stage runs.
	 */
	specialistToolLoop?: {
		computationalExecutor?: ComputationalExecutor;
		workingDirectory?: string;
		maxToolActions?: number;
		onFinished?: (result: SpecialistToolLoopResult) => Promise<void> | void;
	};
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
	let specialistText: string;
	let specialistNotes: readonly string[] = [];
	if (input.specialistToolLoop) {
		const loop = await runSpecialistToolLoop({
			rootQuestion,
			path,
			allPaths,
			priorFindings,
			...(input.directive?.trim() ? { directive: input.directive.trim() } : {}),
			...(input.standingConstraints ? { standingConstraints: input.standingConstraints } : {}),
			...(input.taskKind ? { taskKind: input.taskKind } : {}),
			executor,
			...(input.specialistToolLoop.computationalExecutor
				? { computationalExecutor: input.specialistToolLoop.computationalExecutor }
				: {}),
			...(input.specialistToolLoop.workingDirectory
				? { workingDirectory: input.specialistToolLoop.workingDirectory }
				: {}),
			...(input.specialistToolLoop.maxToolActions !== undefined
				? { maxToolActions: input.specialistToolLoop.maxToolActions }
				: {}),
		});
		await input.specialistToolLoop.onFinished?.(loop);
		specialistText = loop.finalText;
		specialistNotes = loop.stageNotes;
	} else {
		specialistText = await runRole(executor, {
			role: "specialist",
			rootQuestion,
			path,
			allPaths,
			priorFindings,
			inputText: "",
			prompt: buildSpecialistPrompt(
				rootQuestion,
				path,
				priorFindings,
				input.directive,
				input.standingConstraints,
				input.taskKind,
			),
		});
	}
	const specialist = parseMarkdown(specialistText);
	await callbacks.onStageCompleted?.({
		stage: "specialist",
		title: "Specialist attempt",
		summary: "Specialist attempt completed.",
		details: [...specialistNotes, ...renderRoleDetails(specialist)],
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
		prompt: buildCriticPrompt(rootQuestion, path, specialistText, input.standingConstraints),
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
		prompt: buildSynthesizerPrompt(rootQuestion, path, specialistText, criticText, input.standingConstraints),
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
	// Human-help sections are not requested anymore; when a model volunteers one, only genuinely
	// external requests surface as human help, and the agent-actionable rest become gaps the
	// planner acts on itself.
	const humanHelp = splitHumanHelpItems(pickItems(sectionItems(synthesizer, "human"), sectionItems(critic, "human")));
	const gaps = [
		...new Set([
			...pickItems(sectionItems(synthesizer, "gap"), sectionItems(critic, "gap"), sectionItems(specialist, "gap")),
			...humanHelp.agentActionable,
			...humanHelp.external,
		]),
	];
	// Structured research-discipline sections: theorem checks, route pivots, and negative
	// constraints emitted by the roles become part of the report draft so the runner can persist
	// them. Constraints may also come from the critic's review.
	const theoremChecks = dedupeTheoremChecks([
		...parseTheoremApplicabilityChecks(specialistText),
		...parseTheoremApplicabilityChecks(criticText),
		...parseTheoremApplicabilityChecks(synthesizerText),
	]);
	const routePivots = dedupeRoutePivots([
		...parseRoutePivots(specialistText),
		...parseRoutePivots(criticText),
		...parseRoutePivots(synthesizerText),
	]);
	const negativeConstraints = [
		...new Set([
			...parseNegativeConstraints(specialistText),
			...parseNegativeConstraints(criticText),
			...parseNegativeConstraints(synthesizerText),
		]),
	];
	const parsedSuggestedNextMove = applyPivotsToSuggestedNextMove(
		pickSuggestedNextMove(sectionItems(synthesizer, "next"), sectionItems(specialist, "next")),
		routePivots,
		theoremChecks,
	);
	const suggestedNextMove = formatPathSpecificSuggestedNextMove(path, allPaths, parsedSuggestedNextMove);
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
		completedAt: researchCompletionTimestamp(input.now),
		status: "completed",
		coordinatorBrief,
		steps,
		promisingStrategy,
		findings,
		criticisms,
		gaps,
		humanHelpUseful: [],
		suggestedNextMove,
		workingPaperSectionTitle: workingPaperSectionTitle(path),
		workingPaperSummary,
		...(theoremChecks.length > 0 ? { theoremChecks } : {}),
		...(routePivots.length > 0 ? { routePivots } : {}),
		...(negativeConstraints.length > 0 ? { negativeConstraints } : {}),
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
	directive?: string,
	standingConstraints?: readonly ResearchConstraintRecord[],
	taskKind?: ResearchPlanTaskKind,
): string {
	return [
		"You are the specialist for one research path in a co-mathematician workspace.",
		`Root question: ${rootQuestion}`,
		`Selected path: ${path.title}`,
		`Path objective: ${path.objective}`,
		"Existing findings:",
		...formatPriorFindings(priorFindings),
		...buildStandingConstraintsBlock(standingConstraints ?? []),
		"",
		"Task:",
		...(directive?.trim() ? ["Task brief from the research plan:", directive.trim(), ""] : []),
		"Attempt this path. Produce useful partial progress, not polished certainty.",
		...buildProofTaskGuidance(taskKind),
		...formatPathSpecificGuidance(path),
		...buildDisciplineGuidance(),
		"Preserve uncertainty. Do not claim a proof of a famous or open problem unless you actually provide a complete proof from the information given.",
		"Do not fabricate citations.",
		"Write user-facing notes only. Do not include scratchpad planning, self-talk, or drafting narration.",
		"Keep the answer compact: short bullets, and at most one fenced code block if code is useful.",
		"",
		"Return markdown with these headings:",
		"## Findings",
		"## Promising strategy",
		"## Gaps",
		"## Next",
	].join("\n");
}

export function buildCriticPrompt(
	rootQuestion: string,
	path: ResearchPath,
	specialistText: string,
	standingConstraints?: readonly ResearchConstraintRecord[],
): string {
	return [
		"You are the critic for one research path in a co-mathematician workspace.",
		`Root question: ${rootQuestion}`,
		`Selected path: ${path.title}`,
		...buildStandingConstraintsBlock(standingConstraints ?? []),
		"",
		"Specialist attempt:",
		specialistText.trim() || "(the specialist produced no usable output)",
		"",
		"Task:",
		"Review the specialist attempt for mathematical gaps, overclaims, missing assumptions, and unsupported citations.",
		"Flag any violation of a standing constraint, and flag any use of a named theorem whose applicability was not checked against the actual object.",
		...formatPathSpecificGuidance(path),
		"Do not solve the whole problem; critique what was attempted. Preserve uncertainty. Do not fabricate citations.",
		"Write user-facing notes only. Do not include scratchpad planning, self-talk, or drafting narration.",
		"Keep the answer compact: short bullets.",
		"",
		"Return markdown with these headings:",
		"## Review",
		"## Gaps",
		"## Overclaims or source issues",
	].join("\n");
}

export function buildSynthesizerPrompt(
	rootQuestion: string,
	path: ResearchPath,
	specialistText: string,
	criticText: string,
	standingConstraints?: readonly ResearchConstraintRecord[],
): string {
	return [
		"You are the synthesizer for one research path in a co-mathematician workspace.",
		`Root question: ${rootQuestion}`,
		`Selected path: ${path.title}`,
		...buildStandingConstraintsBlock(standingConstraints ?? []),
		"",
		"Specialist attempt:",
		specialistText.trim() || "(the specialist produced no usable output)",
		"",
		"Critic review:",
		criticText.trim() || "(the critic produced no usable output)",
		"",
		"Task:",
		"Write a cautious research-workstream synthesis for the user and the working paper.",
		...formatPathSpecificGuidance(path),
		...buildDisciplineGuidance(),
		"Keep useful ideas. Preserve gaps. Do not claim proofs of famous or open problems. Avoid fabricated citations.",
		"Write user-facing notes only. Do not include scratchpad planning, self-talk, or drafting narration.",
		"Keep the answer compact: short bullets.",
		"",
		"Return markdown with these headings:",
		"## Promising strategy",
		"## Findings",
		"## Review",
		"## Gap",
		"## Next",
		"## Working paper summary",
	].join("\n");
}

function formatPathSpecificGuidance(path: ResearchPath): string[] {
	const title = path.title.trim().replace(/\s+/g, " ").toLowerCase();
	if (title === "reformulation") {
		return [
			"For this reformulation path:",
			"- Include the original question.",
			"- Separate equivalent or directly reduced frames from conjectural/literature search targets.",
			"- Explain what changes operationally for examples or proof attempts.",
			"- State what is not proved.",
			"- Make the next step executable: continue path 4.",
		];
	}
	if (title === "weaker special cases") {
		return [
			"For this weaker-special-cases path:",
			"- List candidate lemmas or weaker targets.",
			"- Mark each status: proved, equivalent target, computational evidence only, or open next target.",
			"- Separate finite checks from theorem-level claims.",
			"- Make the next step executable: continue path 2.",
		];
	}
	return [];
}

function formatPathSpecificSuggestedNextMove(
	path: ResearchPath,
	allPaths: readonly ResearchPath[],
	suggestedNextMove: string | undefined,
): string {
	const title = normalizeTitle(path.title);
	const command =
		title === "reformulation"
			? commandForPathTitle(allPaths, "weaker special cases")
			: title === "weaker special cases"
				? commandForPathTitle(allPaths, "direct proof attempt")
				: undefined;
	if (!command) {
		return suggestedNextMove ?? "Review this attempt and choose the next research move.";
	}
	if (!suggestedNextMove) {
		return title === "reformulation"
			? `Turn this into smaller targets: ${command}.`
			: `Use these lemmas in a proof attempt: ${command}.`;
	}
	if (suggestedNextMove.includes(command)) {
		return suggestedNextMove;
	}
	return `${suggestedNextMove} Next command: ${command}.`;
}

function commandForPathTitle(allPaths: readonly ResearchPath[], title: string): string | undefined {
	const normalizedTitle = normalizeTitle(title);
	const index = allPaths.findIndex((path) => normalizeTitle(path.title) === normalizedTitle);
	return index >= 0 ? `continue path ${index + 1}` : undefined;
}

function normalizeTitle(title: string): string {
	return title.trim().replace(/\s+/g, " ").toLowerCase();
}

function formatPriorFindings(priorFindings: readonly string[]): string[] {
	const findings = priorFindings.filter((finding) => finding.trim().length > 0);
	return findings.length > 0 ? findings.map((finding) => `- ${finding}`) : ["- (none yet)"];
}

function renderRoleDetails(parsed: ParsedMarkdown): string[] {
	const items = filterCoMathProductLines(parsed.sections.flatMap((section) => section.items));
	if (items.length > 0) {
		return items;
	}
	return filterCoMathProductLines(parsed.raw).slice(0, 12);
}

function pickItems(...candidates: string[][]): string[] {
	for (const candidate of candidates) {
		if (candidate.length > 0) {
			return candidate;
		}
	}
	return [];
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
