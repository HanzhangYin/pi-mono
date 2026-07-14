/**
 * Deterministic research planner for the co-math harness.
 *
 * The planner turns the current durable project state into a bounded, ordered research plan the
 * plan runner can execute one task at a time. It is intentionally deterministic (no LLM): the plan
 * shape depends only on which research paths exist, so tests and resumed sessions always agree on
 * what the plan is.
 */

import { deriveResearchAgenda, violatesRejectedRoute } from "./comath-research-agenda.ts";
import type {
	CoMathActor,
	CoMathProjectState,
	ResearchPath,
	ResearchPlanRecord,
	ResearchPlanTaskKind,
} from "./schema.ts";
import { addResearchPlan, addResearchPlanTask } from "./storage.ts";

export const MAX_RESEARCH_PLAN_TASKS = 5;

/** The slice of durable state needed to measure how much work each research path has received. */
export type ResearchPathCoverageState = Pick<
	CoMathProjectState,
	"researchPaths" | "researchPlanTasks" | "researchEvidenceBoard" | "computationalArtifacts"
>;

export interface ResearchPathCoverage {
	/** 1-based position in the durable path list, matching the "Path N" numbering shown elsewhere. */
	pathNumber: number;
	path: ResearchPath;
	pendingTaskCount: number;
	runningTaskCount: number;
	completedTaskCount: number;
	evidenceCount: number;
	computationCount: number;
	/** True when the path has received no tasks, evidence, or computations at all. */
	untouched: boolean;
}

export interface ResearchPlanTaskBlueprint {
	kind: ResearchPlanTaskKind;
	title: string;
	description: string;
	goal?: string;
	pathId?: string;
}

export interface CreateResearchPlanInput {
	now: string;
	actor?: CoMathActor;
}

export interface CreateResearchPlanResult {
	state: CoMathProjectState;
	plan: ResearchPlanRecord;
}

/**
 * Build the ordered task blueprints for the next plan. When durable state already carries
 * follow-up work — a refuted statement to repair, a recorded pivot's replacement route, open
 * gaps, unsettled subclaims, or an inconclusive literature pass — the state-derived agenda plans
 * that continuation instead of restarting from the static blueprint. A fresh workspace (empty
 * agenda) gets the static shape: check sources, gather computational evidence, then work both
 * sides of the question before synthesizing. Tasks whose path type does not exist are skipped,
 * routes already rejected by a theorem check are never planned, and the total is capped at
 * {@link MAX_RESEARCH_PLAN_TASKS}.
 */
export function buildResearchPlanTaskBlueprints(state: CoMathProjectState): ResearchPlanTaskBlueprint[] {
	const agenda = deriveResearchAgenda(state);
	if (agenda.length > 0) {
		const blueprints: ResearchPlanTaskBlueprint[] = [];
		const plannedPathIds: string[] = [];
		for (const item of agenda) {
			const path = chooseResearchPathForPlanTaskKind(state, item.kind, { plannedPathIds });
			if (item.kind === "critic" || item.kind === "synthesis" || item.kind === "export") {
				continue;
			}
			const needsPath = item.kind !== "revise-conjecture";
			if (needsPath && !path) {
				continue;
			}
			if (path) {
				plannedPathIds.push(path.id);
			}
			blueprints.push({
				kind: item.kind,
				title: item.title,
				description: item.description,
				goal: item.goal,
				...(path ? { pathId: path.id } : {}),
			});
		}
		if (blueprints.length > 0) return blueprints.slice(0, MAX_RESEARCH_PLAN_TASKS);
	}
	return buildFreshWorkspaceBlueprints(state);
}

function buildFreshWorkspaceBlueprints(state: CoMathProjectState): ResearchPlanTaskBlueprint[] {
	// Paths are claimed in task order so the twin-track tasks (proof-attempt + refutation-attempt)
	// spread across different suitable paths whenever at least two exist, instead of piling onto
	// the first concrete match.
	const plannedPathIds: string[] = [];
	const claimPath = (path: ResearchPath | undefined): ResearchPath | undefined => {
		if (path) {
			plannedPathIds.push(path.id);
		}
		return path;
	};
	const hasWorkspaceSources = state.literatureSources.some(
		(source) => source.kind === "local-file" && source.provider === "workspace",
	);
	const sourceRefreshPath = hasWorkspaceSources
		? claimPath(chooseResearchPathForPlanTaskKind(state, "source-refresh", { plannedPathIds }))
		: undefined;
	const computationPath = claimPath(chooseResearchPathForPlanTaskKind(state, "computation", { plannedPathIds }));
	const proofPath = claimPath(chooseResearchPathForPlanTaskKind(state, "proof-attempt", { plannedPathIds }));
	const literaturePath = claimPath(chooseResearchPathForPlanTaskKind(state, "literature-search", { plannedPathIds }));
	const refutationPath = claimPath(chooseResearchPathForPlanTaskKind(state, "refutation-attempt", { plannedPathIds }));
	const asksForCurrentStatus =
		/\b(current|present[- ]day|latest|settled|settlement|literature status|known status)\b/i.test(state.rootQuestion);
	// A supplied immutable source is inspected first. Otherwise concrete mathematics leads: anchor
	// examples and a proof attempt come before the literature check.
	const blueprints: ResearchPlanTaskBlueprint[] = [
		...(sourceRefreshPath
			? [
					{
						kind: "source-refresh" as const,
						title: "Inspect the supplied source snapshot",
						description:
							"Extract the mathematical questions, definitions, claims, and dependencies from the immutable workspace source before attempting them.",
						pathId: sourceRefreshPath.id,
					},
				]
			: []),
		...(computationPath
			? [
					{
						kind: "computation" as const,
						title: "Run a bounded computation on small cases",
						description: `Gather finite evidence and look for obstructions to: ${state.rootQuestion}`,
						pathId: computationPath.id,
					},
				]
			: []),
		...(proofPath
			? [
					{
						kind: "proof-attempt" as const,
						title: "Attempt a focused proof step",
						description: `Try the most promising proof-oriented move for: ${state.rootQuestion}`,
						pathId: proofPath.id,
					},
				]
			: []),
		...((!sourceRefreshPath || asksForCurrentStatus) && literaturePath
			? [
					{
						kind: "literature-search" as const,
						title: "Check the literature for known results",
						description: `Search for sources that settle, support, or obstruct: ${state.rootQuestion}`,
						pathId: literaturePath.id,
					},
				]
			: []),
		...(refutationPath
			? [
					{
						kind: "refutation-attempt" as const,
						title: "Try to disprove it",
						description: `Search actively for a counterexample or obstruction to: ${state.rootQuestion}`,
						pathId: refutationPath.id,
					},
				]
			: []),
	];
	const eligible = blueprints.filter(
		(blueprint) => !violatesRejectedRoute(state, `${blueprint.title} ${blueprint.description}`),
	);
	return eligible.slice(0, MAX_RESEARCH_PLAN_TASKS);
}

/** Create a durable research plan (with its tasks) from the current state. Caller persists. */
export function createResearchPlanFromState(
	state: CoMathProjectState,
	input: CreateResearchPlanInput,
): CreateResearchPlanResult {
	const blueprints = buildResearchPlanTaskBlueprints(state);
	let nextState = addResearchPlan(state, {
		title: `Research plan for: ${truncatePlanText(state.rootQuestion, 96)}`,
		objective: `Make durable, reviewable progress on: ${state.rootQuestion}`,
		now: input.now,
		actor: input.actor,
	});
	const plan = nextState.researchPlans.at(-1);
	if (!plan) {
		throw new Error("Could not create the research plan.");
	}
	for (const blueprint of blueprints) {
		nextState = addResearchPlanTask(nextState, {
			planId: plan.id,
			kind: blueprint.kind,
			title: blueprint.title,
			description: blueprint.description,
			...(blueprint.goal ? { goal: blueprint.goal } : {}),
			...(blueprint.pathId ? { pathId: blueprint.pathId } : {}),
			now: input.now,
			actor: input.actor,
		});
	}
	const persistedPlan = nextState.researchPlans.find((candidate) => candidate.id === plan.id) ?? plan;
	return { state: nextState, plan: persistedPlan };
}

export interface ChooseResearchPathOptions {
	/**
	 * Path ids already assigned earlier in the plan being built; each occurrence counts as one
	 * extra unit of work, so tasks planned together spread across suitable paths.
	 */
	plannedPathIds?: readonly string[];
}

/**
 * Deterministic runtime resolution of the research path a plan task kind should execute against.
 * Used both when planning (to pin `pathId`) and when a task's pinned path was later abandoned.
 * Among the paths whose theme fits the kind, the least-worked one wins (fewest recorded tasks,
 * evidence entries, and computations), with ties broken by the candidate order below — so untouched
 * paths get work before a path that already carries results absorbs yet another task.
 */
export function chooseResearchPathForPlanTaskKind(
	state: ResearchPathCoverageState,
	kind: ResearchPlanTaskKind,
	options?: ChooseResearchPathOptions,
): ResearchPath | undefined {
	const usablePaths = state.researchPaths.filter((path) => path.status !== "abandoned");
	if (kind === "literature-search" || kind === "source-refresh") {
		return chooseLeastWorkedPath(state, usablePaths.filter(isLiteratureResearchPath), options);
	}
	if (kind === "computation") {
		return chooseLeastWorkedPath(state, usablePaths.filter(isComputationalResearchPath), options);
	}
	if (kind === "proof-attempt") {
		return chooseLeastWorkedPath(state, proofAttemptCandidatePaths(usablePaths), options);
	}
	if (kind === "refutation-attempt") {
		// Refutation prefers concrete computation over argument; argument paths stay as fallback.
		const computational = usablePaths.filter(isComputationalResearchPath);
		return chooseLeastWorkedPath(
			state,
			dedupePaths([...computational, ...proofAttemptCandidatePaths(usablePaths)]),
			options,
		);
	}
	return undefined;
}

/** Proof-suited candidates: explicitly proof-titled paths first, then argument paths by priority. */
function proofAttemptCandidatePaths(paths: readonly ResearchPath[]): ResearchPath[] {
	const proofTitled = paths.filter((path) => /\bproofs?\b/i.test(`${path.title} ${path.objective}`));
	const argumentPaths = paths
		.filter((path) => !isLiteratureResearchPath(path) && !isComputationalResearchPath(path))
		.sort((a, b) => a.priority - b.priority);
	return dedupePaths([...proofTitled, ...argumentPaths]);
}

function isLiteratureResearchPath(path: ResearchPath): boolean {
	return /(?:literature|source|theorem|reference|paper)/i.test(`${path.title} ${path.objective}`);
}

function isComputationalResearchPath(path: ResearchPath): boolean {
	return /(?:comput|example|counterexample|finite|experiment|search)/i.test(`${path.title} ${path.objective}`);
}

function dedupePaths(paths: readonly ResearchPath[]): ResearchPath[] {
	const seen = new Set<string>();
	return paths.filter((path) => {
		if (seen.has(path.id)) {
			return false;
		}
		seen.add(path.id);
		return true;
	});
}

/** Stable minimum: the first candidate with the lowest work score wins, so selection is deterministic. */
function chooseLeastWorkedPath(
	state: ResearchPathCoverageState,
	candidates: readonly ResearchPath[],
	options?: ChooseResearchPathOptions,
): ResearchPath | undefined {
	let best: ResearchPath | undefined;
	let bestScore = Number.POSITIVE_INFINITY;
	for (const candidate of candidates) {
		const score = researchPathWorkScore(state, candidate.id, options?.plannedPathIds);
		if (score < bestScore) {
			best = candidate;
			bestScore = score;
		}
	}
	return best;
}

/** Work already recorded against a path: live plan tasks, evidence entries, computations, plus paths claimed while building the current plan. */
function researchPathWorkScore(
	state: ResearchPathCoverageState,
	pathId: string,
	plannedPathIds: readonly string[] | undefined,
): number {
	const taskCount = state.researchPlanTasks.filter(
		(task) =>
			task.pathId === pathId &&
			(task.status === "pending" || task.status === "running" || task.status === "completed"),
	).length;
	const evidenceCount = state.researchEvidenceBoard.filter((entry) => entry.pathId === pathId).length;
	const computationCount = state.computationalArtifacts.filter((record) => record.pathId === pathId).length;
	const plannedCount = plannedPathIds?.filter((planned) => planned === pathId).length ?? 0;
	return taskCount + evidenceCount + computationCount + plannedCount;
}

/**
 * Per-path coverage summary over the non-abandoned paths, in durable path order. Rendered into the
 * director-facing context so coverage imbalance (one path absorbing all work while others stay
 * untouched) is visible when planning or amending.
 */
export function summarizeResearchPathCoverage(state: ResearchPathCoverageState): ResearchPathCoverage[] {
	const coverage: ResearchPathCoverage[] = [];
	state.researchPaths.forEach((path, index) => {
		if (path.status === "abandoned") {
			return;
		}
		const tasks = state.researchPlanTasks.filter((task) => task.pathId === path.id);
		const pendingTaskCount = tasks.filter((task) => task.status === "pending").length;
		const runningTaskCount = tasks.filter((task) => task.status === "running").length;
		const completedTaskCount = tasks.filter((task) => task.status === "completed").length;
		const evidenceCount = state.researchEvidenceBoard.filter((entry) => entry.pathId === path.id).length;
		const computationCount = state.computationalArtifacts.filter((record) => record.pathId === path.id).length;
		coverage.push({
			pathNumber: index + 1,
			path,
			pendingTaskCount,
			runningTaskCount,
			completedTaskCount,
			evidenceCount,
			computationCount,
			untouched: pendingTaskCount + runningTaskCount + completedTaskCount + evidenceCount + computationCount === 0,
		});
	});
	return coverage;
}

function truncatePlanText(text: string, maxLength: number): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) {
		return normalized;
	}
	return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}
