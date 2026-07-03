import {
	buildLiteratureSearchQueries,
	formatLiteratureSourceForPrompt,
	type LiteratureSourceLookup,
	type LiteratureSourceResult,
	type LiteratureSourceSearchResponse,
	normalizeLiteratureSourceLookupResult,
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
import type { LiteratureClaimSupportStatus, ResearchPath } from "./schema.ts";

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
	/** Optional plan-task brief (goal + acceptance criteria) steering the literature specialist. */
	directive?: string;
}

export interface LiteratureResearchWorkstreamResult {
	report: ResearchWorkstreamReport;
	sources: LiteratureSourceResult[];
	search: LiteratureSourceSearchResponse;
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

	const searchQuery = {
		rootQuestion,
		pathTitle: path.title,
		pathObjective: path.objective,
		maxSources: 8,
	};
	const plannedQueries = buildLiteratureSearchQueries(searchQuery);
	await callbacks.onStageStarted?.(
		"literature-search",
		`Searching arXiv, Semantic Scholar, Crossref${process.env.OPENALEX_API_KEY || process.env.PI_OPENALEX_API_KEY ? ", OpenAlex" : ""}.`,
	);
	const search = normalizeLiteratureSourceLookupResult(await sourceLookup.search(searchQuery), searchQuery);
	const sources = search.sources;
	await callbacks.onStageCompleted?.({
		stage: "literature-search",
		title: "Literature search",
		summary:
			sources.length > 0
				? `Found ${search.candidateCount} candidate${search.candidateCount === 1 ? "" : "s"}; reviewing ${sources.length} source summar${sources.length === 1 ? "y" : "ies"}.`
				: "No source lookup backend returned references for this path.",
		details:
			sources.length > 0
				? [
						`Query: ${search.queries[0] ?? plannedQueries[0] ?? rootQuestion}`,
						...search.providers.map(formatProviderSearchStatus),
						...sources.map((source, index) => `${sourceLabel(index)}: ${source.title}`),
					]
				: [
						`Query: ${search.queries[0] ?? plannedQueries[0] ?? rootQuestion}`,
						...search.providers.map(formatProviderSearchStatus),
						"Ask for references or a source file before treating literature claims as established.",
					],
	});

	if (sources.length === 0) {
		return buildNoSourceResult(input, coordinatorBrief, search);
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
		prompt: buildLiteratureSpecialistPrompt(rootQuestion, path, sourceContext, input.directive),
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
	const path5Status = buildPath5SourceBackedStatus({
		rootQuestion,
		path,
		sourceIds,
	});
	const findings = uniqueStrings([
		...path5Status,
		...pickItems(
			sectionItems(synthesizer, "source-backed status"),
			sectionItems(synthesizer, "finding"),
			sectionItems(specialist, "source-backed status"),
			sectionItems(specialist, "finding"),
		),
	]);
	const promisingStrategy = pickItems(
		sectionItems(synthesizer, "known result"),
		sectionItems(synthesizer, "promising"),
		sectionItems(synthesizer, "conjectural"),
		sectionItems(specialist, "known result"),
		sectionItems(specialist, "conjectural"),
		sectionItems(specialist, "finding"),
	);
	const criticisms = pickItems(sectionItems(synthesizer, "distinction"), sectionItems(critic, "review"));
	const gaps = pickItems(
		sectionItems(synthesizer, "unresolved"),
		sectionItems(synthesizer, "unsupported"),
		sectionItems(synthesizer, "gap"),
		sectionItems(critic, "unresolved"),
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
	const path5ClaimSupports = buildPath5ClaimSupports({
		rootQuestion,
		path,
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
		search,
		claimSupports: uniqueClaimSupports([...path5ClaimSupports, ...claimSupports]),
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
	search: LiteratureSourceSearchResponse,
): LiteratureResearchWorkstreamResult {
	const sourceStatus = buildNoSourceFindings(input);
	const gaps = buildNoSourceGaps(input);
	const next = isKnownTheoremOrLiteraturePath(input.path)
		? "Provide a reference or ask the coordinator what to try next: what should we try next?"
		: "Ask for references, attach a source file, or provide exact theorem statements to review.";
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
			details: sourceStatus,
		},
		{
			role: "critic",
			title: "Source-support review",
			summary: "Marked literature claims as unsupported without source artifacts.",
			details: gaps,
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
		search,
		claimSupports: buildPath5ClaimSupports({
			rootQuestion: input.rootQuestion,
			path: input.path,
			sourceIds: [],
		}),
		report: {
			pathId: input.path.id,
			pathTitle: input.path.title,
			startedAt: input.now,
			completedAt: input.now,
			status: "blocked",
			coordinatorBrief,
			steps,
			promisingStrategy: [],
			findings: sourceStatus,
			criticisms: ["No source in this run supports a theorem-level claim."],
			gaps,
			humanHelpUseful: ["Provide references or a source file for the relevant theorem targets."],
			suggestedNextMove: next,
			workingPaperSectionTitle: "Literature/theorem targets",
			workingPaperSummary: buildWorkingPaperSummary(input.path, {
				findings: sourceStatus,
				criticisms: ["No source in this run supports a theorem-level claim."],
				gaps,
				suggestedNextMove: next,
				sourceIds: [],
			}),
			sourceIds: [],
			claimSupportIds: [],
		},
	};
}

function formatProviderSearchStatus(provider: LiteratureSourceSearchResponse["providers"][number]): string {
	const providerName = formatProviderName(provider.provider);
	if (provider.status === "completed") {
		return `${providerName}: ${provider.candidateCount} candidate${provider.candidateCount === 1 ? "" : "s"}`;
	}
	if (provider.status === "skipped") {
		return `${providerName}: skipped`;
	}
	return `${providerName}: unavailable${provider.error ? ` (${provider.error})` : ""}`;
}

function formatProviderName(provider: LiteratureSourceSearchResponse["providers"][number]["provider"]): string {
	if (provider === "arxiv") return "arXiv";
	if (provider === "semantic-scholar") return "Semantic Scholar";
	if (provider === "crossref") return "Crossref";
	if (provider === "openalex") return "OpenAlex";
	if (provider === "workspace") return "workspace";
	if (provider === "user-provided") return "user-provided";
	return "unknown";
}

function buildLiteratureSpecialistPrompt(
	rootQuestion: string,
	path: ResearchPath,
	sourceContext: string,
	directive?: string,
): string {
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
		...(directive?.trim() ? ["Task brief from the research plan:", directive.trim(), ""] : []),
		"Summarize only source-backed known results relevant to this path.",
		"Use source ids like [source-1] for every sourced claim.",
		"Do not fabricate citations or infer that a source proves more than the supplied text supports.",
		"Separate unconditional theorem claims from conjectural or heuristic claims.",
		"Mark unsupported claims explicitly.",
		"For n^2 + 1, say whether the source context treats the problem as open, unresolved, conjectural, or proved.",
		"Never infer that Bunyakovsky-type conjectures or Schinzel's hypothesis H prove the original statement unconditionally.",
		"Separate exact results from weaker or related results.",
		"",
		"Return markdown with these headings:",
		"## Source-backed status",
		"## Conjectural or heuristic context",
		"## Unsupported or unresolved",
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
		"Separate unconditional theorem claims from conjectural claims.",
		"Mark unsupported claims explicitly.",
		"For famous open problems, do not accept a proof claim unless the supplied source text explicitly supports it.",
		"For n^2 + 1, reject any unconditional proof claim unless the supplied source text explicitly proves it.",
		"",
		"Return markdown with these headings:",
		"## Review",
		"## Unsupported or unresolved",
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
		"Separate unconditional theorem claims from conjectural or heuristic claims.",
		"Distinguish the exact target statement from weaker related theorems.",
		"Never infer that Bunyakovsky-type conjectures or Schinzel's hypothesis H prove the original statement unconditionally.",
		"For n^2 + 1, say whether the source context treats the problem as open, unresolved, conjectural, or proved.",
		"",
		"Return markdown with these headings:",
		"## Source-backed status",
		"## Conjectural or heuristic context",
		"## Source-backed distinctions",
		"## Unsupported or unresolved",
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

function buildPath5SourceBackedStatus(input: {
	rootQuestion: string;
	path: ResearchPath;
	sourceIds: string[];
}): string[] {
	if (!isKnownTheoremOrLiteraturePath(input.path)) {
		return [];
	}
	if (isNSquaredPlusOneQuestion(input.rootQuestion)) {
		const sourceList =
			input.sourceIds.length > 0 ? ` ${input.sourceIds.map((sourceId) => `[${sourceId}]`).join(" ")}` : "";
		return [
			`Source-backed context was reviewed for prime-producing polynomial and conjectural framing.${sourceList}`,
			"No source in this run established an unconditional proof of infinitely many primes of the form n^2 + 1.",
			"Conjectural implications are not proofs of the original claim.",
		];
	}
	return [
		"Source-backed context was reviewed for this theorem/literature path.",
		"No theorem claim should be treated as established unless it is supported by a listed source.",
	];
}

function buildPath5ClaimSupports(input: {
	rootQuestion: string;
	path: ResearchPath;
	sourceIds: string[];
}): LiteratureClaimSupportDraft[] {
	if (!isKnownTheoremOrLiteraturePath(input.path)) {
		return [];
	}
	const noProofClaim = isNSquaredPlusOneQuestion(input.rootQuestion)
		? "An unconditional proof of infinitely many primes of the form n^2 + 1."
		: "The target theorem claim for this path.";
	if (input.sourceIds.length === 0) {
		return [
			{
				claim: "No source-backed theorem claim is established for this path yet.",
				sourceIds: [],
				status: "unsupported",
				note: "A source-backed literature check is needed before citing named theorems.",
			},
		];
	}
	return [
		{
			claim: isNSquaredPlusOneQuestion(input.rootQuestion)
				? "Provided sources give source-backed context for conjectural prime-values-of-polynomials framing."
				: "Provided sources give source-backed context for this literature path.",
			sourceIds: input.sourceIds,
			status: "partially-supported",
			note: "Context only; this does not by itself prove the target theorem claim.",
		},
		{
			claim: noProofClaim,
			sourceIds: [],
			status: "unsupported",
			note: "No source in this run established this unconditional theorem claim.",
		},
	];
}

function buildNoSourceFindings(input: RunLiteratureResearchWorkstreamInput): string[] {
	if (isKnownTheoremOrLiteraturePath(input.path) && isNSquaredPlusOneQuestion(input.rootQuestion)) {
		return [
			"No source was available, so no theorem claim is established for this path.",
			"Search targets: prime values of polynomials, Bunyakovsky-type conjectures, Schinzel's hypothesis H, Landau-style problem lists, and primes of the form n^2 + 1.",
			"Treat those names as search targets only until a source verifies the exact statement.",
			"No unconditional proof of infinitely many primes n^2 + 1 is established in this workspace.",
		];
	}
	return [
		"No source lookup backend returned references for this path.",
		"No source-backed theorem claim is established for this path yet.",
	];
}

function buildNoSourceGaps(input: RunLiteratureResearchWorkstreamInput): string[] {
	if (isKnownTheoremOrLiteraturePath(input.path)) {
		return [
			"A source-backed literature check is needed before citing named theorems.",
			"Conjectural implications must be separated from unconditional results.",
		];
	}
	return ["Source-backed literature support is still needed before citing named theorems as established context."];
}

function isKnownTheoremOrLiteraturePath(path: ResearchPath): boolean {
	const title = path.title.trim().replace(/\s+/g, " ").toLowerCase();
	return (
		title === "known theorem or literature reduction" ||
		/\b(?:known theorem|literature|reference|source)\b/.test(title)
	);
}

function isNSquaredPlusOneQuestion(rootQuestion: string): boolean {
	return /\bn\s*(?:\^2|²)\s*\+\s*1\b/i.test(rootQuestion);
}

function uniqueClaimSupports(supports: LiteratureClaimSupportDraft[]): LiteratureClaimSupportDraft[] {
	const seen = new Set<string>();
	return supports.filter((support) => {
		const key = `${support.status}\n${support.claim}\n${support.sourceIds.join(",")}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

function uniqueStrings(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
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
