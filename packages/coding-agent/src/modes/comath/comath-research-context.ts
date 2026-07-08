/**
 * Compact, bounded context packs for the model-facing research roles (director, skeptic).
 *
 * Long-horizon research fails when prompts become transcript dumps. Roles get a curated view of
 * the durable state — claims, evidence, paths, plan status — instead of raw history, so context
 * stays retrieval-shaped no matter how many steps the project has run.
 */

import { buildCoordinatorContext } from "./comath-coordinator-synthesis.ts";
import type {
	CoMathProjectState,
	ResearchObligationRecord,
	ResearchPlanRecord,
	ResearchPlanTaskRecord,
} from "./schema.ts";
import {
	getActiveResearchPlan,
	getLatestResearchPlan,
	getResearchObligationChildren,
	getResearchPlanTasks,
} from "./storage.ts";

/**
 * Full research context pack: the durable-state summary shared with the coordinator plus the
 * current plan and its task statuses. Used by the director when proposing or amending plans and by
 * the skeptic when reviewing a finished task.
 */
export function buildResearchContextPack(state: CoMathProjectState): string {
	// The discipline records (constraints, theorem checks, pivots) come along with the coordinator
	// context, which now includes them for every consumer.
	return [
		buildCoordinatorContext(state),
		"",
		"Research plan:",
		...formatPlanForContext(state),
		"",
		"Obligations (claims the project must establish or refute):",
		...formatObligationsForContext(state),
	].join("\n");
}

function formatObligationsForContext(state: CoMathProjectState): string[] {
	if (state.researchObligations.length === 0) {
		return ["- (none recorded yet)"];
	}
	return state.researchObligations.map((obligation) => formatObligationForContext(state, obligation));
}

function formatObligationForContext(state: CoMathProjectState, obligation: ResearchObligationRecord): string {
	const children = getResearchObligationChildren(state, obligation.id);
	const parts = [
		`- [${obligation.status}] ${obligation.statement}`,
		...(obligation.gaps.length > 0 ? [`gaps: ${obligation.gaps.length}`] : []),
		...(obligation.evidenceEntryIds.length > 0 ? [`support: ${obligation.evidenceEntryIds.length}`] : []),
		...(obligation.refutationEvidenceEntryIds.length > 0
			? [`refutations: ${obligation.refutationEvidenceEntryIds.length}`]
			: []),
		...(children.length > 0 ? [`subclaims: ${children.length}`] : []),
		...(obligation.statusReason ? [`reason: ${obligation.statusReason}`] : []),
	];
	return parts.join("; ");
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
