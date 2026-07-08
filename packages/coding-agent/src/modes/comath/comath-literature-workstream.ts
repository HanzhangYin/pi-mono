import {
	buildLiteratureSearchQueries,
	formatLiteratureSourceForPrompt,
	type LiteratureSourceLookup,
	type LiteratureSourceResult,
	type LiteratureSourceSearchResponse,
	normalizeLiteratureSourceLookupResult,
} from "./comath-literature-source.ts";
import {
	filterCoMathProductLines,
	type CoMathParsedMarkdown as ParsedMarkdown,
	parseCoMathMarkdown as parseMarkdown,
	getCoMathMarkdownSectionItems as sectionItems,
} from "./comath-markdown.ts";
import {
	applyPivotsToSuggestedNextMove,
	buildDisciplineGuidance,
	buildStandingConstraintsBlock,
	dedupeRoutePivots,
	dedupeTheoremChecks,
	parseNegativeConstraints,
	parseRoutePivots,
	parseTheoremApplicabilityChecks,
	splitHumanHelpItems,
} from "./comath-research-discipline.ts";
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
import type { LiteratureClaimSupportStatus, ResearchConstraintRecord, ResearchPath } from "./schema.ts";

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
	/** Standing research constraints every role must respect (active ones are shown verbatim). */
	standingConstraints?: readonly ResearchConstraintRecord[];
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
	const sources = uniqueLiteratureSources(search.sources);
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
		prompt: buildLiteratureSpecialistPrompt(
			rootQuestion,
			path,
			sourceContext,
			input.directive,
			input.standingConstraints,
		),
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
		prompt: buildLiteratureCriticPrompt(rootQuestion, path, sourceContext, specialistText, input.standingConstraints),
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
		prompt: buildLiteratureSynthesizerPrompt(
			rootQuestion,
			path,
			sourceContext,
			specialistText,
			criticText,
			input.standingConstraints,
		),
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
	// Human-help sections are not requested; a volunteered one is partitioned so only genuinely
	// external requests surface, and the agent-actionable rest become gaps to act on.
	const humanHelp = splitHumanHelpItems(pickItems(sectionItems(synthesizer, "human"), sectionItems(critic, "human")));
	const gaps = [
		...new Set([
			...pickItems(
				sectionItems(synthesizer, "unresolved"),
				sectionItems(synthesizer, "unsupported"),
				sectionItems(synthesizer, "gap"),
				sectionItems(critic, "unresolved"),
				sectionItems(critic, "unsupported"),
				sectionItems(critic, "gap"),
			),
			...humanHelp.agentActionable,
			...humanHelp.external,
		]),
	];
	// Structured research-discipline sections: the literature roles are where "does theorem X
	// actually settle the root question" gets decided, so their checks, pivots, and derived
	// constraints must land in the report for durable persistence.
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
	const suggestedNextMove =
		applyPivotsToSuggestedNextMove(
			pickSuggestedNextMove(sectionItems(synthesizer, "next"), sectionItems(specialist, "next")),
			routePivots,
			theoremChecks,
		) ?? "Use the source-backed distinctions to choose a weaker or more precise next path.";
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
			humanHelpUseful: [],
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
			...(theoremChecks.length > 0 ? { theoremChecks } : {}),
			...(routePivots.length > 0 ? { routePivots } : {}),
			...(negativeConstraints.length > 0 ? { negativeConstraints } : {}),
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
	// No sources is not a dead end: the concrete next move is direct mathematics, and the durable
	// agenda will plan exactly that when the budget allows.
	const next =
		"Work the problem directly next: run bounded computations on small cases and target a weaker or special-case statement while sources are unavailable.";
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
			humanHelpUseful: [],
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

function uniqueLiteratureSources(sources: readonly LiteratureSourceResult[]): LiteratureSourceResult[] {
	const seen = new Set<string>();
	return sources.filter((source) => {
		const key =
			source.title.trim().toLowerCase() ||
			[source.provider ?? "", source.externalId ?? "", source.doi ?? "", source.url ?? "", source.path ?? ""]
				.filter((part) => part.length > 0)
				.join("\n");
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

function buildLiteratureSpecialistPrompt(
	rootQuestion: string,
	path: ResearchPath,
	sourceContext: string,
	directive?: string,
	standingConstraints?: readonly ResearchConstraintRecord[],
): string {
	return [
		"You are the literature specialist for one co-math research path.",
		`Root question: ${rootQuestion}`,
		`Selected path: ${path.title}`,
		`Path objective: ${path.objective}`,
		...buildStandingConstraintsBlock(standingConstraints ?? []),
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
		"Say whether the source context treats the root question as open, unresolved, conjectural, or proved.",
		"Never infer that a named conjecture, hypothesis, or heuristic proves the statement unconditionally.",
		"Separate exact results from weaker or related results (a theorem about a related object is not a theorem about this one).",
		...buildDisciplineGuidance(),
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
	standingConstraints?: readonly ResearchConstraintRecord[],
): string {
	return [
		"You are the critic for a source-backed co-math literature workstream.",
		`Root question: ${rootQuestion}`,
		`Selected path: ${path.title}`,
		...buildStandingConstraintsBlock(standingConstraints ?? []),
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
		'When your review reveals a standing rule future steps must respect (e.g. "Do not treat proposed or heuristic preprints as settled proofs."), add a `## Negative constraints` section with one imperative bullet per rule.',
		"",
		"Return markdown with these headings:",
		"## Review",
		"## Unsupported or unresolved",
		"## Gaps",
	].join("\n");
}

function buildLiteratureSynthesizerPrompt(
	rootQuestion: string,
	path: ResearchPath,
	sourceContext: string,
	specialistText: string,
	criticText: string,
	standingConstraints?: readonly ResearchConstraintRecord[],
): string {
	return [
		"You are the synthesizer for a source-backed co-math literature workstream.",
		`Root question: ${rootQuestion}`,
		`Selected path: ${path.title}`,
		...buildStandingConstraintsBlock(standingConstraints ?? []),
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
		"Never infer that a named conjecture, hypothesis, or heuristic proves the statement unconditionally.",
		"Say whether the source context treats the root question as open, unresolved, conjectural, or proved.",
		"In `## Next`, name concrete mathematical work (examples to compute, weaker statements to prove, obstructions to check) — never just more searching.",
		...buildDisciplineGuidance(),
		"",
		"Return markdown with these headings:",
		"## Source-backed status",
		"## Conjectural or heuristic context",
		"## Source-backed distinctions",
		"## Unsupported or unresolved",
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
	const items = filterCoMathProductLines(parsed.sections.flatMap((section) => section.items));
	return items.length > 0 ? items : filterCoMathProductLines(parsed.raw).slice(0, 12);
}

function pickItems(...candidates: string[][]): string[] {
	for (const candidate of candidates) {
		if (candidate.length > 0) return candidate;
	}
	return [];
}

function pickSuggestedNextMove(...candidates: string[][]): string | undefined {
	for (const candidate of candidates) {
		const items = candidate.map(normalizeNextStepItem).filter((item) => item.length > 0);
		if (items.length > 0) {
			return items.slice(0, 3).join(" ");
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
	if (!normalized || isHeadingLikeNextStep(normalized)) {
		return "";
	}
	return normalized;
}

function isHeadingLikeNextStep(item: string): boolean {
	return (
		/^(?:concrete\s+)?(?:replacement\s+)?route\s*:$/i.test(item) ||
		/^(?:possible\s+)?(?:next|future)\s+(?:steps?|investigations?|directions?|moves?|work)\s*:$/i.test(item) ||
		(/^[-\w\s]+:$/.test(item) && item.split(/\s+/).length <= 6)
	);
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
	const sourceList =
		input.sourceIds.length > 0 ? ` ${input.sourceIds.map((sourceId) => `[${sourceId}]`).join(" ")}` : "";
	return [
		`Source-backed context was reviewed for this theorem/literature path.${sourceList}`,
		"No source in this run established an unconditional proof of the root question.",
		"Conjectural implications are not proofs of the original claim.",
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
	const noProofClaim = "An unconditional proof of the root question.";
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
			claim: "Provided sources give source-backed context for this literature path.",
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
	if (isKnownTheoremOrLiteraturePath(input.path)) {
		return [
			"No source was available, so no theorem claim is established for this path.",
			"Treat named theorems and conjectures as search targets only until a source verifies the exact statement.",
			"No unconditional proof of the root question is established in this workspace.",
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
