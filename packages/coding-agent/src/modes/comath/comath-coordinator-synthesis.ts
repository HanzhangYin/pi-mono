import type {
	CoMathProjectState,
	ComputationalArtifact,
	LiteratureClaimSupport,
	LiteratureSourceArtifact,
	ResearchCoordinatorNextMove,
	ResearchCoordinatorReportRecord,
	ResearchPath,
	ResearchWorkstreamReportRecord,
	ResearchWorkstreamRunRecord,
	WorkingPaperSection,
} from "../../../examples/extensions/co-math/schema.ts";
import type { ResearchWorkstreamModelExecutor } from "./comath-research-model-workstream.ts";

export type ResearchCoordinatorReportDraft = Omit<
	ResearchCoordinatorReportRecord,
	"id" | "createdAt" | "updatedAt" | "workingPaperSectionId"
> & {
	workingPaperSectionId?: string;
};

export interface RunResearchCoordinatorSynthesisInput {
	state: CoMathProjectState;
	executor?: ResearchWorkstreamModelExecutor;
	now: string;
}

export interface ResearchCoordinatorSynthesisResult {
	report: ResearchCoordinatorReportDraft;
}

interface ParsedMarkdown {
	sections: Array<{ heading: string; items: string[] }>;
	raw: string[];
}

interface CoordinatorInputIds {
	inputReportIds: string[];
	inputPathIds: string[];
	inputSourceIds: string[];
	inputComputationalArtifactIds: string[];
}

const MAX_CONTEXT_ITEMS = 8;
const MAX_REPORT_ITEMS = 6;

export async function runResearchCoordinatorSynthesis(
	input: RunResearchCoordinatorSynthesisInput,
): Promise<ResearchCoordinatorSynthesisResult> {
	if (input.executor) {
		try {
			const path = chooseCoordinatorPath(input.state, input.now);
			const response = await input.executor.run({
				role: "synthesizer",
				rootQuestion: input.state.rootQuestion,
				path,
				allPaths: input.state.researchPaths,
				priorFindings: input.state.researchReports.flatMap((report) => report.findings).slice(-MAX_CONTEXT_ITEMS),
				inputText: buildCoordinatorContext(input.state),
				prompt: buildResearchCoordinatorPrompt(input.state),
			});
			const parsed = parseCoordinatorMarkdown(response.text, input.state);
			if (hasSubstantiveCoordinatorReport(parsed)) {
				return { report: parsed };
			}
		} catch {
			return { report: buildFallbackCoordinatorReport(input.state) };
		}
	}
	return { report: buildFallbackCoordinatorReport(input.state) };
}

export function buildResearchCoordinatorPrompt(state: CoMathProjectState): string {
	return [
		"You are the project coordinator for a mathematical research workspace.",
		"Use only the durable project state below as evidence.",
		"Distinguish finite computation from proof. A bounded computation can guide search, but cannot prove an infinite claim.",
		"Distinguish source-backed facts from unsupported literature claims.",
		"Do not claim the root question is solved unless a saved report explicitly gives a complete proof.",
		"Recommend concrete next moves with rationale.",
		"",
		buildCoordinatorContext(state),
		"",
		"Return markdown with these headings:",
		"## What we know",
		"## Roadblocks",
		"## Recommended next moves",
		"## Human help useful",
		"## Suggested next step",
	].join("\n");
}

function buildCoordinatorContext(state: CoMathProjectState): string {
	return [
		"Durable project state",
		`Root question: ${state.rootQuestion}`,
		"",
		"Research paths:",
		...formatPathsForContext(state.researchPaths),
		"",
		"Research reports:",
		...formatReportsForContext(state),
		"",
		"Source support:",
		...formatClaimSupportsForContext(state.literatureClaimSupports),
		"",
		"Literature sources:",
		...formatSourcesForContext(state.literatureSources),
		"",
		"Computation outputs:",
		...formatComputationsForContext(state),
		"",
		"Active, blocked, and failed runs:",
		...formatRunsForContext(state),
		"",
		"Working paper sections:",
		...formatWorkingPaperSectionsForContext(state.workingPaperSections),
	].join("\n");
}

function buildFallbackCoordinatorReport(state: CoMathProjectState): ResearchCoordinatorReportDraft {
	const ids = collectCoordinatorInputIds(state);
	const whatWeKnow = uniqueStrings([
		...state.researchReports.flatMap((report) => report.findings).slice(-MAX_REPORT_ITEMS),
		...state.computationalArtifacts
			.filter((artifact) => artifact.status === "completed")
			.slice(-3)
			.map((artifact) => summarizeComputationArtifactForUser(state, artifact)),
		...state.literatureClaimSupports
			.filter((support) => support.status === "supported" || support.status === "partially-supported")
			.slice(-3)
			.map((support) => `${support.status}: ${support.claim}`),
		...state.researchWorkstreamRuns
			.filter((run) => run.status === "queued" || run.status === "running")
			.map(
				(run) =>
					`${formatPathLabelForId(state, run.pathId, run.pathTitle)} is still running at ${formatRunStage(run)}.`,
			),
	]);
	const roadblocks = uniqueStrings([
		...state.researchReports.flatMap((report) => report.gaps).slice(-MAX_REPORT_ITEMS),
		...state.researchReports
			.filter((report) => report.status === "blocked")
			.map((report) => `${formatPathLabelForId(state, report.pathId, report.pathTitle)} is blocked.`),
		...state.literatureClaimSupports
			.filter((support) => support.status === "unsupported" || support.sourceIds.length === 0)
			.map((support) => `Source support is still missing for: ${support.claim}`),
		...state.researchWorkstreamRuns
			.filter((run) => run.status === "blocked" || run.status === "failed")
			.map(
				(run) =>
					`${formatPathLabelForId(state, run.pathId, run.pathTitle)} stopped before a usable result: ${
						run.failureReason ?? "no final report was produced"
					}.`,
			),
		...(state.computationalArtifacts.length > 0
			? ["Finite computation is evidence for pattern-finding only; it does not prove an infinite claim."]
			: []),
	]);
	const recommendedNextMoves = buildFallbackNextMoves(state);
	const humanHelpUseful = uniqueStrings([
		...state.researchReports.flatMap((report) => report.humanHelpUseful).slice(-MAX_REPORT_ITEMS),
		...state.literatureClaimSupports
			.filter((support) => support.status === "unsupported" || support.sourceIds.length === 0)
			.map((support) => `Provide a theorem statement or source for: ${support.claim}`),
	]);
	const firstMove = recommendedNextMoves[0];
	return {
		...ids,
		whatWeKnow:
			whatWeKnow.length > 0 ? whatWeKnow : ["No completed research report has produced durable findings yet."],
		roadblocks: roadblocks.length > 0 ? roadblocks : ["No current roadblock was identified."],
		recommendedNextMoves,
		humanHelpUseful,
		...(firstMove?.pathId ? { suggestedPathId: firstMove.pathId } : {}),
		...(firstMove?.prompt ? { suggestedPrompt: firstMove.prompt } : {}),
	};
}

function parseCoordinatorMarkdown(text: string, state: CoMathProjectState): ResearchCoordinatorReportDraft {
	const parsed = parseMarkdown(text);
	const ids = collectCoordinatorInputIds(state);
	const whatWeKnow = sectionItems(parsed, "what we know").map((item) =>
		sanitizeCoordinatorText(softenComputationProofClaim(item, state)),
	);
	const roadblocks = sectionItems(parsed, "roadblock").map(sanitizeCoordinatorText);
	const humanHelpUseful = sectionItems(parsed, "human").map(sanitizeCoordinatorText);
	let recommendedNextMoves = sectionItems(parsed, "recommended")
		.map((item, index) => parseNextMove(item, index, state))
		.filter((move): move is ResearchCoordinatorNextMove => move !== undefined)
		.map((move, index) => ({ ...move, priority: rankedPriority(index) }));
	const suggestedItems = sectionItems(parsed, "suggested")
		.map(normalizeNextStepItem)
		.filter((item) => item.length > 0);
	const firstSuggested = suggestedItems[0];
	const suggestedPath = firstSuggested ? findPathReference(state, firstSuggested) : undefined;
	if (suggestedPath && !recommendedNextMoves.some((move) => move.pathId === suggestedPath.id)) {
		recommendedNextMoves = [
			{
				title: `Continue ${formatPathLabel(state, suggestedPath)}`,
				pathId: suggestedPath.id,
				rationale: "The coordinator selected this as the suggested next step.",
				prompt: `continue path ${pathNumber(state, suggestedPath)}`,
				priority: "high",
			},
			...recommendedNextMoves.map((move, index) => ({
				...move,
				priority: index === 0 ? ("medium" as const) : move.priority,
			})),
		];
	}
	const firstMove = recommendedNextMoves[0];
	const suggestedPrompt =
		extractContinuePrompt(firstSuggested ?? "", state) ??
		(firstSuggested ? sanitizeCoordinatorText(firstSuggested) : undefined) ??
		firstMove?.prompt;
	const report: ResearchCoordinatorReportDraft = {
		...ids,
		whatWeKnow: uniqueStrings(whatWeKnow).slice(0, MAX_REPORT_ITEMS),
		roadblocks: uniqueStrings([
			...roadblocks,
			...(state.computationalArtifacts.length > 0 &&
			!roadblocks.some((item) => /\bfinite\b|\bcomputation\b|\binfinite\b/i.test(item))
				? ["Finite computation is evidence for pattern-finding only; it does not prove an infinite claim."]
				: []),
		]).slice(0, MAX_REPORT_ITEMS),
		recommendedNextMoves: fallbackNextMoves(recommendedNextMoves, state),
		humanHelpUseful: uniqueStrings(humanHelpUseful).slice(0, MAX_REPORT_ITEMS),
		...((suggestedPath?.id ?? firstMove?.pathId) ? { suggestedPathId: suggestedPath?.id ?? firstMove?.pathId } : {}),
		...(suggestedPrompt ? { suggestedPrompt } : {}),
	};
	if (report.whatWeKnow.length === 0) {
		report.whatWeKnow = buildFallbackCoordinatorReport(state).whatWeKnow;
	}
	if (report.roadblocks.length === 0) {
		report.roadblocks = buildFallbackCoordinatorReport(state).roadblocks;
	}
	return report;
}

function hasSubstantiveCoordinatorReport(report: ResearchCoordinatorReportDraft): boolean {
	return (
		report.whatWeKnow.some((item) => item.trim().length > 0) ||
		report.roadblocks.some((item) => item.trim().length > 0) ||
		report.recommendedNextMoves.some((move) => move.title.trim().length > 0)
	);
}

function buildFallbackNextMoves(state: CoMathProjectState): ResearchCoordinatorNextMove[] {
	const latestReportByPath = new Map<string, ResearchWorkstreamReportRecord>();
	for (const report of state.researchReports) {
		latestReportByPath.set(report.pathId, report);
	}
	const activePaths = state.researchPaths
		.filter((path) => path.status === "active" || path.status === "promising")
		.sort((a, b) => a.priority - b.priority);
	const moves: ResearchCoordinatorNextMove[] = [];
	const hasBlockedLiterature = hasBlockedLiteratureState(state);
	const initialUnreportedLimit = state.computationalArtifacts.length > 0 && hasBlockedLiterature ? 2 : 3;
	for (const path of activePaths.filter((path) => !latestReportByPath.has(path.id)).slice(0, initialUnreportedLimit)) {
		moves.push({
			title: `Continue ${formatPathLabel(state, path)}`,
			pathId: path.id,
			rationale: "No completed report has been recorded for this active path yet.",
			prompt: `continue path ${pathNumber(state, path)}`,
			priority: moves.length === 0 ? "high" : "medium",
		});
	}
	if (state.computationalArtifacts.length > 0 && hasBlockedLiterature) {
		const reformulation = activePaths.find((path) => /\breformulation\b/i.test(path.title));
		if (reformulation && !moves.some((move) => move.pathId === reformulation.id)) {
			moves.push({
				title: `Continue ${formatPathLabel(state, reformulation)}`,
				pathId: reformulation.id,
				rationale: "Computation gives finite guidance, while the source-backed route is blocked.",
				prompt: `continue path ${pathNumber(state, reformulation)}`,
				priority: moves.length === 0 ? "high" : "medium",
			});
		}
		moves.push({
			title: "Provide a theorem or source reference",
			rationale: "The literature path needs source-backed statements before it can support a theorem-level route.",
			priority: "medium",
		});
	}
	for (const path of activePaths) {
		if (moves.length >= 3) {
			break;
		}
		const report = latestReportByPath.get(path.id);
		if (!report || moves.some((move) => move.pathId === path.id)) {
			continue;
		}
		moves.push({
			title: `Continue ${formatPathLabel(state, path)}`,
			pathId: path.id,
			rationale: report.suggestedNextMove || "The latest report suggests another pass on this path.",
			prompt: `continue path ${pathNumber(state, path)}`,
			priority: moves.length === 0 ? "high" : "medium",
		});
	}
	if (moves.length === 0) {
		const fallbackPath = chooseDefaultPath(state);
		if (fallbackPath) {
			moves.push({
				title: `Continue ${formatPathLabel(state, fallbackPath)}`,
				pathId: fallbackPath.id,
				rationale: fallbackPath.suggestedNextMove,
				prompt: `continue path ${pathNumber(state, fallbackPath)}`,
				priority: "high",
			});
		} else {
			moves.push({
				title: "Choose a research path to continue",
				rationale: "No active research path was available in the current state.",
				priority: "medium",
			});
		}
	}
	return moves.slice(0, 3);
}

function fallbackNextMoves(
	moves: ResearchCoordinatorNextMove[],
	state: CoMathProjectState,
): ResearchCoordinatorNextMove[] {
	return moves.length > 0 ? moves.slice(0, 3) : buildFallbackNextMoves(state);
}

function parseNextMove(
	item: string,
	index: number,
	state: CoMathProjectState,
): ResearchCoordinatorNextMove | undefined {
	const normalized = sanitizeCoordinatorText(normalizeNextStepItem(item));
	if (!normalized || isNextMoveDetailLabel(normalized)) {
		return undefined;
	}
	const path = findPathReference(state, normalized);
	const priority = parsePriority(normalized, index);
	const withoutPriority = normalized
		.replace(/\((?:high|medium|low)\s+priority\)/gi, "")
		.replace(/\[(?:high|medium|low)\]/gi, "")
		.trim();
	const withoutPathLead = withoutPriority.replace(/^(?:continue\s+)?path\s+\d+\s*[:.-]?\s*/i, "").trim();
	if (isNextMoveDetailLabel(withoutPathLead)) {
		return undefined;
	}
	const split = splitMoveTitleAndRationale(withoutPathLead);
	return {
		title: split.title,
		...(path ? { pathId: path.id, prompt: `continue path ${pathNumber(state, path)}` } : {}),
		rationale: split.rationale || "This move follows from the current project state.",
		priority,
	};
}

function isNextMoveDetailLabel(item: string): boolean {
	return /^(?:rationale|reason|priority|prompt|path|important caveat|caveat|note)$/i.test(item.trim());
}

function parsePriority(item: string, index: number): ResearchCoordinatorNextMove["priority"] {
	if (/\bhigh\b/i.test(item)) {
		return "high";
	}
	if (/\blow\b/i.test(item)) {
		return "low";
	}
	if (/\bmedium\b/i.test(item)) {
		return "medium";
	}
	return index === 0 ? "high" : index === 1 ? "medium" : "low";
}

function rankedPriority(index: number): ResearchCoordinatorNextMove["priority"] {
	return index === 0 ? "high" : index === 1 ? "medium" : "low";
}

function splitMoveTitleAndRationale(item: string): { title: string; rationale: string } {
	const separator = /\s+(?:--|-|because|so that)\s+/i.exec(item);
	if (separator) {
		const before = item.slice(0, separator.index).trim();
		const after = item.slice(separator.index + separator[0].length).trim();
		return {
			title: before || item,
			rationale: after || item,
		};
	}
	const colonIndex = item.indexOf(":");
	if (colonIndex > 0 && colonIndex < 80) {
		const before = item.slice(0, colonIndex).trim();
		const after = item.slice(colonIndex + 1).trim();
		return {
			title: before || item,
			rationale: after || item,
		};
	}
	return {
		title: item.length <= 96 ? item : `${item.slice(0, 93)}...`,
		rationale: item,
	};
}

function parseMarkdown(text: string): ParsedMarkdown {
	const sections: ParsedMarkdown["sections"] = [];
	const raw: string[] = [];
	let current: ParsedMarkdown["sections"][number] | undefined;
	let lastWasBullet = false;
	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();
		if (!line) {
			continue;
		}
		const headingMatch = /^#{1,6}\s+(.*)$/.exec(line);
		if (headingMatch?.[1]) {
			current = { heading: headingMatch[1].trim(), items: [] };
			sections.push(current);
			lastWasBullet = false;
			continue;
		}
		const isBullet = /^\s*(?:[-*]|\d+[.)])\s+/.test(rawLine);
		const item = stripBulletMarker(line);
		if (!item) {
			continue;
		}
		// Fold display-math delimiters and other non-bullet continuation lines into the preceding list
		// item so multi-line LaTeX (e.g. "\[", "n^2+1.", "\]") does not render as orphan "- \[" bullets.
		if (lastWasBullet && (!isBullet || isMathFragmentLine(item))) {
			appendToLastItem(raw, item);
			if (current) {
				appendToLastItem(current.items, item);
			}
			continue;
		}
		raw.push(item);
		current?.items.push(item);
		lastWasBullet = isBullet;
	}
	return { sections, raw };
}

/** A line that is only a display-math delimiter, e.g. `\[`, `\]`, `\(`, `\)`, `\begin{...}`, `\end{...}`. */
function isMathFragmentLine(item: string): boolean {
	return /^(?:\\\[|\\\]|\\\(|\\\)|\\begin\{[^}]*\}|\\end\{[^}]*\})$/.test(item.trim());
}

function appendToLastItem(items: string[], text: string): void {
	if (items.length === 0) {
		items.push(text);
		return;
	}
	items[items.length - 1] = `${items[items.length - 1]} ${text}`.replace(/\s+/g, " ").trim();
}

function sectionItems(parsed: ParsedMarkdown, keyword: string): string[] {
	const section = parsed.sections.find((candidate) => candidate.heading.toLowerCase().includes(keyword));
	if (section) {
		return section.items.map(normalizeNextStepItem).filter((item) => item.length > 0);
	}
	return [];
}

function stripBulletMarker(line: string): string {
	return line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim();
}

function normalizeNextStepItem(item: string): string {
	const normalized = item
		.trim()
		.replace(/^(?:possible\s+)?(?:next|future)\s+(?:steps?|investigations?|directions?|moves?|work)\s*:\s*/i, "")
		.replace(/^next\s*:\s*/i, "")
		.trim();
	if (!normalized || isHeadingLikeFiller(item)) {
		return "";
	}
	return normalized;
}

function isHeadingLikeFiller(item: string): boolean {
	const normalized = item.trim();
	return (
		/^(?:possible\s+)?(?:next|future)\s+(?:steps?|investigations?|directions?|moves?|work)\s*:$/i.test(normalized) ||
		(/^[-\w\s]+:$/.test(normalized) && normalized.split(/\s+/).length <= 6)
	);
}

function collectCoordinatorInputIds(state: CoMathProjectState): CoordinatorInputIds {
	return {
		inputReportIds: state.researchReports.map((report) => report.id),
		inputPathIds: state.researchPaths.map((path) => path.id),
		inputSourceIds: state.literatureSources.map((source) => source.id),
		inputComputationalArtifactIds: state.computationalArtifacts.map((artifact) => artifact.id),
	};
}

function chooseCoordinatorPath(state: CoMathProjectState, now: string): ResearchPath {
	return (
		chooseDefaultPath(state) ?? {
			id: "project-coordinator",
			title: "Project coordinator synthesis",
			objective: "Synthesize current research state and recommend next moves.",
			status: "active",
			latestFindings: [],
			blockers: [],
			suggestedNextMove: "Recommend the next useful research move.",
			priority: 1,
			createdAt: now,
			updatedAt: now,
		}
	);
}

function chooseDefaultPath(state: CoMathProjectState): ResearchPath | undefined {
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

function findPathReference(state: CoMathProjectState, text: string): ResearchPath | undefined {
	const match = /\bpath\s+(\d+)\b/i.exec(text);
	if (match?.[1]) {
		return state.researchPaths[Number.parseInt(match[1], 10) - 1];
	}
	const normalized = normalizePathText(text);
	return state.researchPaths.find((path) => {
		const haystack = normalizePathText(`${path.title} ${path.objective}`);
		return normalized
			.split(/\s+/)
			.filter((term) => term.length > 3)
			.some((term) => haystack.includes(term));
	});
}

function extractContinuePrompt(text: string, state: CoMathProjectState): string | undefined {
	const path = findPathReference(state, text);
	return path ? `continue path ${pathNumber(state, path)}` : undefined;
}

function pathNumber(state: CoMathProjectState, path: ResearchPath): number {
	const index = state.researchPaths.findIndex((candidate) => candidate.id === path.id);
	return index >= 0 ? index + 1 : path.priority;
}

function formatPathLabel(state: CoMathProjectState, path: ResearchPath): string {
	return `Path ${pathNumber(state, path)}: ${path.title}`;
}

function formatPathLabelForId(state: CoMathProjectState, pathId: string, fallbackTitle: string): string {
	const path = state.researchPaths.find((candidate) => candidate.id === pathId);
	return path ? formatPathLabel(state, path) : fallbackTitle;
}

function normalizePathText(value: string): string {
	return value
		.toLowerCase()
		.replace(/\b(?:the|a|an|path|continue|try|on|to)\b/g, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function hasBlockedLiteratureState(state: CoMathProjectState): boolean {
	return (
		state.researchReports.some(
			(report) =>
				report.status === "blocked" && /\b(?:literature|source|reference|theorem)\b/i.test(report.pathTitle),
		) ||
		state.literatureClaimSupports.some(
			(support) => support.status === "unsupported" || support.sourceIds.length === 0,
		)
	);
}

function softenComputationProofClaim(item: string, state: CoMathProjectState): string {
	if (
		state.computationalArtifacts.length > 0 &&
		/\b(?:comput|finite|checked|search|examples?)\w*.*\b(?:prove|proves|proved|establishes?)\b/i.test(item)
	) {
		return "The recorded computation is finite evidence only; it does not prove an infinite claim.";
	}
	return item;
}

function sanitizeCoordinatorText(value: string): string {
	return value
		.trim()
		.replace(/\*\*/g, "")
		.replace(/`/g, "")
		.replace(/\brole-runs?\b/gi, "runs")
		.replace(/\bworkstreams?\b/gi, "research paths")
		.replace(/\bartifacts?\b/gi, "outputs")
		.replace(/\bqueues?\b/gi, "plans")
		.replace(/\bschemas?\b/gi, "formats");
}

function uniqueStrings(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => sanitizeCoordinatorText(value)).filter((value) => value.length > 0))];
}

function formatPathsForContext(paths: readonly ResearchPath[]): string[] {
	if (paths.length === 0) {
		return ["- (none)"];
	}
	return paths.map((path, index) =>
		[
			`- Path ${index + 1} [${path.status}, priority ${path.priority}]: ${path.title}`,
			`  Objective: ${path.objective}`,
			...(path.latestFindings.length > 0 ? [`  Latest findings: ${path.latestFindings.slice(-3).join(" | ")}`] : []),
			...(path.blockers.length > 0 ? [`  Blockers: ${path.blockers.slice(-3).join(" | ")}`] : []),
			`  Suggested next move: ${path.suggestedNextMove}`,
		].join("\n"),
	);
}

function formatReportsForContext(state: CoMathProjectState): string[] {
	if (state.researchReports.length === 0) {
		return ["- (none)"];
	}
	return state.researchReports
		.slice(-MAX_CONTEXT_ITEMS)
		.map((report) =>
			[
				`- ${report.id} on ${formatPathLabelForId(state, report.pathId, report.pathTitle)}: ${report.status}`,
				...(report.findings.length > 0 ? [`  Findings: ${report.findings.slice(0, 3).join(" | ")}`] : []),
				...(report.gaps.length > 0 ? [`  Gaps: ${report.gaps.slice(0, 3).join(" | ")}`] : []),
				...(report.criticisms.length > 0 ? [`  Criticisms: ${report.criticisms.slice(0, 3).join(" | ")}`] : []),
				...(report.humanHelpUseful.length > 0
					? [`  Human help useful: ${report.humanHelpUseful.slice(0, 2).join(" | ")}`]
					: []),
				...(report.sourceIds.length > 0 ? [`  Source ids: ${report.sourceIds.join(", ")}`] : []),
				...(report.claimSupportIds.length > 0 ? [`  Claim support ids: ${report.claimSupportIds.join(", ")}`] : []),
				...(report.computationalArtifactIds.length > 0
					? [`  Computation output ids: ${report.computationalArtifactIds.join(", ")}`]
					: []),
				`  Suggested next move: ${report.suggestedNextMove}`,
			].join("\n"),
		);
}

function formatClaimSupportsForContext(supports: readonly LiteratureClaimSupport[]): string[] {
	if (supports.length === 0) {
		return ["- (none)"];
	}
	return supports
		.slice(-MAX_CONTEXT_ITEMS)
		.map((support) =>
			[
				`- ${support.id}: ${support.status}`,
				`  Claim: ${support.claim}`,
				`  Sources: ${support.sourceIds.length > 0 ? support.sourceIds.join(", ") : "none"}`,
				...(support.note ? [`  Note: ${support.note}`] : []),
			].join("\n"),
		);
}

function formatSourcesForContext(sources: readonly LiteratureSourceArtifact[]): string[] {
	if (sources.length === 0) {
		return ["- (none)"];
	}
	return sources
		.slice(-MAX_CONTEXT_ITEMS)
		.map((source) =>
			[
				`- ${source.id}: ${source.title}`,
				`  Kind: ${source.kind}`,
				...((source.url ?? source.path) ? [`  Locator: ${source.url ?? source.path ?? ""}`] : []),
				`  Summary: ${summarizeText(source.summary)}`,
			].join("\n"),
		);
}

function formatComputationsForContext(state: CoMathProjectState): string[] {
	if (state.computationalArtifacts.length === 0) {
		return ["- (none)"];
	}
	return state.computationalArtifacts
		.slice(-MAX_CONTEXT_ITEMS)
		.map((artifact) =>
			[
				`- ${artifact.id} on ${formatPathLabelForId(state, artifact.pathId, artifact.pathId)}: ${artifact.kind} ${artifact.status}`,
				...(artifact.exitCode !== undefined ? [`  Exit code: ${artifact.exitCode}`] : []),
				...(artifact.filePath ? [`  File: ${artifact.filePath}`] : []),
				`  Summary: ${summarizeText(artifact.summary)}`,
			].join("\n"),
		);
}

function formatRunsForContext(state: CoMathProjectState): string[] {
	const relevant = state.researchWorkstreamRuns.filter(
		(run) =>
			run.status === "queued" || run.status === "running" || run.status === "blocked" || run.status === "failed",
	);
	if (relevant.length === 0) {
		return ["- (none)"];
	}
	return relevant
		.slice(-MAX_CONTEXT_ITEMS)
		.map((run) =>
			[
				`- ${formatPathLabelForId(state, run.pathId, run.pathTitle)}: ${run.status}`,
				`  Stage: ${formatRunStage(run)}`,
				...(run.failureReason ? [`  Reason: ${run.failureReason}`] : []),
				...(run.incrementalReports.at(-1) ? [`  Latest: ${run.incrementalReports.at(-1)?.summary ?? ""}`] : []),
			].join("\n"),
		);
}

function formatWorkingPaperSectionsForContext(sections: readonly WorkingPaperSection[]): string[] {
	if (sections.length === 0) {
		return ["- (none)"];
	}
	return sections.slice(-MAX_CONTEXT_ITEMS).map((section) => `- ${section.title}: ${summarizeText(section.body)}`);
}

function formatRunStage(run: ResearchWorkstreamRunRecord): string {
	if (run.currentStage === "literature-search") {
		return "literature search";
	}
	if (run.currentStage === "computation") {
		return "computation";
	}
	if (run.currentStage === "specialist") {
		return "specialist attempt";
	}
	if (run.currentStage === "critic") {
		return "critic review";
	}
	if (run.currentStage === "synthesizer") {
		return "synthesis";
	}
	return "coordinator framing";
}

function summarizeComputationArtifactForUser(state: CoMathProjectState, artifact: ComputationalArtifact): string {
	return `${formatPathLabelForId(state, artifact.pathId, artifact.pathId)} recorded finite computation output: ${summarizeText(
		artifact.summary,
	)}`;
}

function summarizeText(value: string, limit = 280): string {
	const compact = value.trim().replace(/\s+/g, " ");
	if (compact.length <= limit) {
		return compact;
	}
	return `${compact.slice(0, limit - 3)}...`;
}
