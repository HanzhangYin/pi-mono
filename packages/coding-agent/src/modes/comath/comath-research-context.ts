/**
 * Compact, bounded context packs for the model-facing research roles (director, skeptic).
 *
 * Long-horizon research fails when prompts become transcript dumps. Roles get a curated view of
 * the durable state — claims, evidence, paths, plan status — instead of raw history, so context
 * stays retrieval-shaped no matter how many steps the project has run.
 */

import { buildCoordinatorContext } from "./comath-coordinator-synthesis.ts";
import type { CoMathProjectState, ResearchPlanRecord, ResearchPlanTaskRecord } from "./schema.ts";
import { getActiveResearchPlan, getLatestResearchPlan, getResearchPlanTasks } from "./storage.ts";

/**
 * Full research context pack: the durable-state summary shared with the coordinator plus the
 * current plan and its task statuses. Used by the director when proposing or amending plans and by
 * the skeptic when reviewing a finished task.
 */
export function buildResearchContextPack(state: CoMathProjectState): string {
	return [buildCoordinatorContext(state), "", "Research plan:", ...formatPlanForContext(state)].join("\n");
}

function formatPlanForContext(state: CoMathProjectState): string[] {
	const plan = getActiveResearchPlan(state) ?? getLatestResearchPlan(state);
	if (!plan) {
		return ["- (no research plan yet)"];
	}
	const tasks = getResearchPlanTasks(state, plan.id);
	return [
		`- Plan status: ${plan.status}; objective: ${plan.objective}`,
		...tasks.map((task) => formatPlanTaskForContext(task)),
	];
}

function formatPlanTaskForContext(task: ResearchPlanTaskRecord): string {
	const goal = task.goal ? `; goal: ${task.goal}` : "";
	const criteria = task.acceptanceCriteria.length > 0 ? `; done when: ${task.acceptanceCriteria.join("; ")}` : "";
	return `- Task ${task.sequence} (${task.kind}, ${task.status}): ${task.title}${goal}${criteria}`;
}

export interface ResearchPlanContextView {
	plan: ResearchPlanRecord;
	tasks: ResearchPlanTaskRecord[];
}
