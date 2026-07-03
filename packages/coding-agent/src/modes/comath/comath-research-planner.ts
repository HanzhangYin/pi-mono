/**
 * Deterministic research planner for the co-math harness.
 *
 * The planner turns the current durable project state into a bounded, ordered research plan the
 * plan runner can execute one task at a time. It is intentionally deterministic (no LLM): the plan
 * shape depends only on which research paths exist, so tests and resumed sessions always agree on
 * what the plan is.
 */

import { isComputationalResearchPath } from "./comath-computation-workstream.ts";
import { isLiteratureResearchPath } from "./comath-literature-workstream.ts";
import type {
	CoMathActor,
	CoMathProjectState,
	ResearchPath,
	ResearchPlanRecord,
	ResearchPlanTaskKind,
} from "./schema.ts";
import { addResearchPlan, addResearchPlanTask } from "./storage.ts";

export const MAX_RESEARCH_PLAN_TASKS = 5;

export interface ResearchPlanTaskBlueprint {
	kind: ResearchPlanTaskKind;
	title: string;
	description: string;
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
 * Build the ordered task blueprints for a fresh plan: check sources first, gather computational
 * evidence, attempt a proof step, then review and synthesize. Tasks whose path type does not exist
 * in the workspace are skipped, and the total is capped at {@link MAX_RESEARCH_PLAN_TASKS}.
 */
export function buildResearchPlanTaskBlueprints(state: CoMathProjectState): ResearchPlanTaskBlueprint[] {
	const literaturePath = chooseResearchPathForPlanTaskKind(state, "literature-search");
	const computationPath = chooseResearchPathForPlanTaskKind(state, "computation");
	const proofPath = chooseResearchPathForPlanTaskKind(state, "proof-attempt");
	const blueprints: ResearchPlanTaskBlueprint[] = [
		...(literaturePath
			? [
					{
						kind: "literature-search" as const,
						title: "Check the literature for known results",
						description: `Search for sources that settle, support, or obstruct: ${state.rootQuestion}`,
						pathId: literaturePath.id,
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
		{
			kind: "critic" as const,
			title: "Review recent findings for gaps",
			description: "Check the latest findings for overclaims, missing support, and open gaps.",
		},
		{
			kind: "synthesis" as const,
			title: "Summarize durable findings and pick the next move",
			description: "Combine what is known across paths into the working paper and recommend the next move.",
		},
	];
	return blueprints.slice(0, MAX_RESEARCH_PLAN_TASKS);
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
			...(blueprint.pathId ? { pathId: blueprint.pathId } : {}),
			now: input.now,
			actor: input.actor,
		});
	}
	const persistedPlan = nextState.researchPlans.find((candidate) => candidate.id === plan.id) ?? plan;
	return { state: nextState, plan: persistedPlan };
}

/**
 * Deterministic runtime resolution of the research path a plan task kind should execute against.
 * Used both when planning (to pin `pathId`) and when a task's pinned path was later abandoned.
 */
export function chooseResearchPathForPlanTaskKind(
	state: Pick<CoMathProjectState, "researchPaths">,
	kind: ResearchPlanTaskKind,
): ResearchPath | undefined {
	const usablePaths = state.researchPaths.filter((path) => path.status !== "abandoned");
	if (kind === "literature-search" || kind === "source-refresh") {
		return usablePaths.find((path) => isLiteratureResearchPath(path));
	}
	if (kind === "computation") {
		return usablePaths.find((path) => isComputationalResearchPath(path));
	}
	if (kind === "proof-attempt") {
		return chooseProofAttemptPath(usablePaths);
	}
	return undefined;
}

function chooseProofAttemptPath(paths: readonly ResearchPath[]): ResearchPath | undefined {
	const proofTitled = paths.find((path) => /\bproofs?\b/i.test(`${path.title} ${path.objective}`));
	if (proofTitled) {
		return proofTitled;
	}
	return [...paths]
		.filter((path) => !isLiteratureResearchPath(path) && !isComputationalResearchPath(path))
		.sort((a, b) => a.priority - b.priority)[0];
}

function truncatePlanText(text: string, maxLength: number): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) {
		return normalized;
	}
	return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}
