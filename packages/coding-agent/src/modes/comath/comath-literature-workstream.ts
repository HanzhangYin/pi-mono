import type { LiteratureClaimSupportStatus, ResearchPath } from "../../../examples/extensions/co-math/schema.ts";
import {
	formatLiteratureSourceForPrompt,
	type LiteratureSourceLookup,
	type LiteratureSourceResult,
} from "./comath-literature-source.ts";
import {
	type CoMathParsedMarkdown as ParsedMarkdown,
	parseCoMathMarkdown as parseMarkdown,
	getCoMathMarkdownSectionItems as sectionItems,
} from "./comath-markdown.ts";
import type {
	ResearchWorkstreamModelExecutor,
	ResearchWorkstreamModelRequest,
	ResearchWorkstreamStageCallbacks,
} from "./comath-research-model-workstream.ts";
import {
	buildCoordinatorBrief,
	type ResearchWorkstreamReport,
	type ResearchWorkstreamStep,
} from "./comath-research-workstream.ts";

export interface LiteratureClaimSupportDraft {
	claim: string;
	sourceIds: string[];
	status: LiteratureClaimSupportStatus;
	note?: string;
}

export interface RunLiteratureResearchWorkstreamInput {
	rootQuestion: string;
	path: ResearchPath;
	allPaths: readonly ResearchPath[];
	now: string;
	executor: ResearchWorkstreamModelExecutor;
	sourceLookup: LiteratureSourceLookup;
}

export interface LiteratureResearchWorkstreamResult {
	report: ResearchWorkstreamReport;
	sources: LiteratureSourceResult[];
	claimSupports: LiteratureClaimSupportDraft[];
}

export async function runLiteratureResearchWorkstreamStaged(
	input: RunLiteratureResearchWorkstreamInput,
	callbacks: ResearchWorkstreamStageCallbacks,
): Promise<LiteratureResearchWorkstreamResult> {
	const rootQuestion = input.rootQuestion.trim();
	const { path, allPaths, executor, sourceLookup } = input;
	const coordinatorBrief = buildCoordinatorBrief(path);
	await callbacks.onStageStarted?.("coordinator", "Identifying what needs source support.");
	await callbacks.onStageCompleted?.({
		stage: "coordinator",
		title: "Coordinator brief",
		summary: "Identified source-sensitive literature questions.",
		details: [coordinatorBrief],
	});

	await callbacks.onStageStarted?.("literature-search", "Literature specialist is looking for relevant sources.");
	const sources = await sourceLookup.search({
		rootQuestion,
		pathTitle: path.title,
		pathObjective: path.objective,
		maxSources: 5,
	});
	await callbacks.onStageCompleted?.({
		stage: "literature-search",
		title: "Literature search",
		summary:
			sources.length > 0
				? `Found ${sources.length} candidate source${sources.length === 1 ? "" : "s"} to review.`
				: "No source lookup backend returned references for this path.",
		details:
			sources.length > 0
				? sources.map((source, index) => `${sourceLabel(index)}: ${source.title}`)
				: ["Ask for references or a source file before treating literature claims as established."],
	});

	if (sources.length === 0) {
		return buildNoSourceResult(input, coordinatorBrief);
	}

	const sourceContext = sources.map(formatLiteratureSourceForPrompt).join("\n\n");
	await callbacks.onStageStarted?.("specialist", "Literature specialist is reviewing source-backed claims.");
	const specialistText = await runRole(executor, {
		role: "specialist",
		rootQuestion,
		path,
		allPaths,
		priorFindings: path.latestFindings,
		inputText: sourceContext,
		prompt: buildLiteratureSpecialistPrompt(rootQuestion, path, sourceContext),
	});
	const specialist = parseMarkdown(specialistText);
	await callbacks.onStageCompleted?.({
		stage: "specialist",
		title: "Literature findings",
		summary: "Reviewed candidate sources for relevant known results.",
		details: renderRoleDetails(specialist),
		rawText: specialistText,
	});

	await callbacks.onStageStarted?.("critic", "Critic is checking source support and overclaims.");
	const criticText = await runRole(executor, {
		role: "critic",
		rootQuestion,
		path,
		allPaths,
		priorFindings: path.latestFindings,
		inputText: `${sourceContext}\n\nSpecialist findings:\n${specialistText}`.trim(),
		prompt: buildLiteratureCriticPrompt(rootQuestion, path, sourceContext, specialistText),
	});
	const critic = parseMarkdown(criticText);
	await callbacks.onStageCompleted?.({
		stage: "critic",
		title: "Source-support review",
		summary: "Checked the literature findings for unsupported claims and overreach.",
		details: renderRoleDetails(critic),
		rawText: criticText,
	});

	await callbacks.onStageStarted?.("synthesizer", "Synthesizing source-aware literature report.");
	const synthesizerText = await runRole(executor, {
		role: "synthesizer",
		rootQuestion,
		path,
		allPaths,
		priorFindings: path.latestFindings,
		inputText: `${sourceContext}\n\nSpecialist findings:\n${specialistText}\n\nCritic review:\n${criticText}`.trim(),
		prompt: buildLiteratureSynthesizerPrompt(rootQuestion, path, sourceContext, specialistText, criticText),
	});
	const synthesizer = parseMarkdown(synthesizerText);
	await callbacks.onStageCompleted?.({
		stage: "synthesizer",
		title: "Synthesis",
		summary: "Synthesized source-aware research notes.",
		details: renderRoleDetails(synthesizer),
		rawText: synthesizerText,
	});

	const sourceIds = sources.map((_source, index) => sourceLabel(index));
	const findings = pickItems(sectionItems(synthesizer, "finding"), sectionItems(specialist, "finding"));
	const promisingStrategy = pickItems(
		sectionItems(synthesizer, "known result"),
		sectionItems(synthesizer, "promising"),
		sectionItems(specialist, "known result"),
		sectionItems(specialist, "finding"),
	);
	const criticisms = pickItems(sectionItems(synthesizer, "distinction"), sectionItems(critic, "review"));
	const gaps = pickItems(
		sectionItems(synthesizer, "unsupported"),
		sectionItems(synthesizer, "gap"),
		sectionItems(critic, "unsupported"),
		sectionItems(critic, "gap"),
	);
	const suggestedNextMove =
		pickItems(sectionItems(synthesizer, "next"), sectionItems(specialist, "next"))[0] ??
		"Use the source-backed distinctions to choose a weaker or more precise next path.";
	const claimSupports = buildClaimSupports({
		findings,
		criticisms,
		gaps,
		sourceIds,
	});
	const steps: ResearchWorkstreamStep[] = [
		{
			role: "coordinator",
			title: "Coordinator brief",
			summary: "Identifying source-sensitive claims.",
			details: [coordinatorBrief],
		},
		{
			role: "specialist",
			title: "Literature findings",
			summary: "Reviewing source-backed known results.",
			details: renderRoleDetails(specialist),
		},
		{
			role: "critic",
			title: "Source-support review",
			summary: "Checking overclaims, missing support, and fabricated citations.",
			details: renderRoleDetails(critic),
		},
		{
			role: "synthesizer",
			title: "Synthesis",
			summary: "Producing a source-aware literature note.",
			details: renderRoleDetails(synthesizer),
		},
	];
	return {
		sources,
		claimSupports,
		report: {
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
			humanHelpUseful: pickItems(sectionItems(synthesizer, "human"), sectionItems(critic, "human")),
			suggestedNextMove,
			workingPaperSectionTitle: "Literature/theorem targets",
			workingPaperSummary: buildWorkingPaperSummary(path, {
				findings,
				criticisms,
				gaps,
				suggestedNextMove,
				sourceIds,
			}),
			sourceIds,
			claimSupportIds: [],
		},
	};
}

export function isLiteratureResearchPath(path: ResearchPath): boolean {
	const combined = `${path.title} ${path.objective}`.toLowerCase();
	return /\b(?:known theorem|literature|reference|source)\b/.test(combined);
}

function buildNoSourceResult(
	input: RunLiteratureResearchWorkstreamInput,
	coordinatorBrief: string,
): LiteratureResearchWorkstreamResult {
	const finding = "No source lookup backend returned references for this path.";
	const gap = "Source-backed literature support is still needed before citing named theorems as established context.";
	const next = "Ask for references, attach a source file, or provide exact theorem statements to review.";
	const steps: ResearchWorkstreamStep[] = [
		{
			role: "coordinator",
			title: "Coordinator brief",
			summary: "Identifying source-sensitive claims.",
			details: [coordinatorBrief],
		},
		{
			role: "specialist",
			title: "Literature findings",
			summary: "No sources were available to review.",
			details: [finding],
		},
		{
			role: "critic",
			title: "Source-support review",
			summary: "Marked literature claims as unsupported without source artifacts.",
			details: [gap],
		},
		{
			role: "synthesizer",
			title: "Synthesis",
			summary: "Requesting source material before making literature claims.",
			details: [next],
		},
	];
	return {
		sources: [],
		claimSupports: [
			{
				claim: "No source-backed theorem claim is established for this path yet.",
				sourceIds: [],
				status: "unsupported",
				note: gap,
			},
		],
		report: {
			pathId: input.path.id,
			pathTitle: input.path.title,
			startedAt: input.now,
			completedAt: input.now,
			status: "blocked",
			coordinatorBrief,
			steps,
			promisingStrategy: [],
			findings: [finding],
			criticisms: ["No source in this workstream supports a theorem-level claim."],
			gaps: [gap],
			humanHelpUseful: ["Provide references or a source file for the relevant theorem targets."],
			suggestedNextMove: next,
			workingPaperSectionTitle: "Literature/theorem targets",
			workingPaperSummary: buildWorkingPaperSummary(input.path, {
				findings: [finding],
				criticisms: ["No source in this workstream supports a theorem-level claim."],
				gaps: [gap],
				suggestedNextMove: next,
				sourceIds: [],
			}),
			sourceIds: [],
			claimSupportIds: [],
		},
	};
}

function buildLiteratureSpecialistPrompt(rootQuestion: string, path: ResearchPath, sourceContext: string): string {
	return [
		"You are the literature specialist for one co-math research path.",
		`Root question: ${rootQuestion}`,
		`Selected path: ${path.title}`,
		`Path objective: ${path.objective}`,
		"",
		"Candidate sources:",
		sourceContext,
		"",
		"Task:",
		"Summarize only source-backed known results relevant to this path.",
		"Use source ids like [source-1] for every sourced claim.",
		"Do not fabricate citations or infer that a source proves more than the supplied text supports.",
		"Separate exact results from weaker or related results.",
		"",
		"Return markdown with these headings:",
		"## Findings",
		"## Known results",
		"## Unsupported or unclear",
		"## Next",
	].join("\n");
}

function buildLiteratureCriticPrompt(
	rootQuestion: string,
	path: ResearchPath,
	sourceContext: string,
	specialistText: string,
): string {
	return [
		"You are the critic for a source-backed co-math literature workstream.",
		`Root question: ${rootQuestion}`,
		`Selected path: ${path.title}`,
		"",
		"Candidate sources:",
		sourceContext,
		"",
		"Specialist findings:",
		specialistText.trim() || "(the specialist produced no usable output)",
		"",
		"Task:",
		"Flag unsupported claims, overclaims, fabricated citations, and conflations between exact and weaker results.",
		"Require source ids like [source-1] for source-backed claims.",
		"For famous open problems, do not accept a proof claim unless the supplied source text explicitly supports it.",
		"",
		"Return markdown with these headings:",
		"## Review",
		"## Unsupported or unclear",
		"## Gaps",
		"## Human help useful",
	].join("\n");
}

function buildLiteratureSynthesizerPrompt(
	rootQuestion: string,
	path: ResearchPath,
	sourceContext: string,
	specialistText: string,
	criticText: string,
): string {
	return [
		"You are the synthesizer for a source-backed co-math literature workstream.",
		`Root question: ${rootQuestion}`,
		`Selected path: ${path.title}`,
		"",
		"Candidate sources:",
		sourceContext,
		"",
		"Specialist findings:",
		specialistText.trim() || "(the specialist produced no usable output)",
		"",
		"Critic review:",
		criticText.trim() || "(the critic produced no usable output)",
		"",
		"Task:",
		"Produce a cautious source-aware report. Use source ids like [source-1] for supported claims.",
		"Clearly mark unsupported claims. Do not fabricate citations.",
		"Distinguish the exact target statement from weaker related theorems.",
		"",
		"Return markdown with these headings:",
		"## Known results",
		"## Findings",
		"## Source-backed distinctions",
		"## Unsupported or unclear",
		"## Human help useful",
		"## Next",
		"## Working paper summary",
	].join("\n");
}

async function runRole(
	executor: ResearchWorkstreamModelExecutor,
	request: ResearchWorkstreamModelRequest,
): Promise<string> {
	const response = await executor.run(request);
	return typeof response.text === "string" ? response.text : "";
}

function renderRoleDetails(parsed: ParsedMarkdown): string[] {
	const items = parsed.sections.flatMap((section) => section.items);
	return items.length > 0 ? items : parsed.raw.slice(0, 12);
}

function pickItems(...candidates: string[][]): string[] {
	for (const candidate of candidates) {
		if (candidate.length > 0) return candidate;
	}
	return [];
}

function buildClaimSupports(input: {
	findings: string[];
	criticisms: string[];
	gaps: string[];
	sourceIds: string[];
}): LiteratureClaimSupportDraft[] {
	const supports = input.findings.map((finding) => {
		const sourceIds = extractSourceIds(finding).filter((sourceId) => input.sourceIds.includes(sourceId));
		return {
			claim: finding,
			sourceIds,
			status: sourceIds.length > 0 ? ("supported" as const) : ("unsupported" as const),
			...(sourceIds.length === 0 ? { note: "No source id was attached to this claim." } : {}),
		};
	});
	return [
		...supports,
		...input.gaps.map((gap) => ({
			claim: gap,
			sourceIds: [],
			status: "unsupported" as const,
			note: "Recorded as an unsupported or unresolved literature claim.",
		})),
	];
}

function extractSourceIds(text: string): string[] {
	return [...text.matchAll(/\[(source-\d+)\]/g)]
		.map((match) => match[1])
		.filter((sourceId): sourceId is string => !!sourceId);
}

function sourceLabel(index: number): string {
	return `source-${index + 1}`;
}

function buildWorkingPaperSummary(
	path: ResearchPath,
	input: {
		findings: string[];
		criticisms: string[];
		gaps: string[];
		suggestedNextMove: string;
		sourceIds: string[];
	},
): string {
	return [
		`Research workstream: ${path.title}`,
		...(input.findings.length > 0 ? ["", "Literature findings:", ...input.findings.map((item) => `- ${item}`)] : []),
		...(input.criticisms.length > 0
			? ["", "Source-backed distinctions:", ...input.criticisms.map((item) => `- ${item}`)]
			: []),
		...(input.gaps.length > 0 ? ["", "Unsupported or unclear:", ...input.gaps.map((item) => `- ${item}`)] : []),
		...(input.sourceIds.length > 0 ? ["", `References: ${input.sourceIds.join(", ")}`] : []),
		"",
		`Next: ${input.suggestedNextMove}`,
	].join("\n");
}
