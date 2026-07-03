/**
 * Model-backed research director for the co-math harness.
 *
 * The director is where plan *content* comes from when a strong model is available: it proposes a
 * bounded plan from the current durable state and may amend the pending tail of the plan after
 * each completed task. Deterministic code never authors research direction here — it validates it:
 * task caps, kind whitelist, path resolution, and schema checks are enforced on every model
 * output, and any invalid or unparseable proposal falls back to the deterministic planner (for
 * creation) or a no-op (for amendment). All decisions land in durable state, so an audit of "who
 * chose this direction and why" is always possible.
 */

import { extractCoMathJsonObject } from "./comath-markdown.ts";
import { buildResearchContextPack } from "./comath-research-context.ts";
import type { ResearchWorkstreamModelExecutor } from "./comath-research-model-workstream.ts";
import {
	buildResearchPlanTaskBlueprints,
	chooseResearchPathForPlanTaskKind,
	createResearchPlanFromState,
	MAX_RESEARCH_PLAN_TASKS,
} from "./comath-research-planner.ts";
import type {
	CoMathActor,
	CoMathProjectState,
	ResearchPath,
	ResearchPlanRecord,
	ResearchPlanTaskKind,
	ResearchPlanTaskRecord,
} from "./schema.ts";
import { addResearchPlan, addResearchPlanTask, getResearchPlanTasks, updateResearchPlanTask } from "./storage.ts";

const RESEARCH_PLAN_TASK_KINDS: readonly ResearchPlanTaskKind[] = [
	"literature-search",
	"proof-attempt",
	"computation",
	"critic",
	"synthesis",
	"source-refresh",
	"export",
];

const MAX_AMENDMENT_ACTIONS = 3;
const MAX_ACCEPTANCE_CRITERIA = 4;

export interface ProposeResearchPlanInput {
	executor?: ResearchWorkstreamModelExecutor;
	now: string;
	actor?: CoMathActor;
}

export interface ProposeResearchPlanResult {
	state: CoMathProjectState;
	plan: ResearchPlanRecord;
	/** Whether the plan content came from the model or the deterministic fallback planner. */
	source: "model" | "deterministic";
}

export interface AmendResearchPlanInput {
	executor: ResearchWorkstreamModelExecutor;
	completedTask: ResearchPlanTaskRecord;
	now: string;
}

export interface AmendResearchPlanResult {
	state: CoMathProjectState;
	amended: boolean;
	addedTitles: string[];
	cancelledTitles: string[];
	reason?: string;
}

interface DirectorTaskDraft {
	kind: ResearchPlanTaskKind;
	title: string;
	description: string;
	goal?: string;
	acceptanceCriteria: string[];
	pathId?: string;
}

/**
 * Create a research plan. With an executor, the model proposes objective and tasks and the
 * deterministic validator enforces caps/kinds/paths; without one (or on any failure) the
 * deterministic planner authors the plan, so behavior degrades to the pre-director harness.
 */
export async function proposeResearchPlan(
	state: CoMathProjectState,
	input: ProposeResearchPlanInput,
): Promise<ProposeResearchPlanResult> {
	if (input.executor) {
		try {
			const response = await input.executor.run({
				role: "synthesizer",
				rootQuestion: state.rootQuestion,
				path: representativePath(state, input.now),
				allPaths: state.researchPaths,
				priorFindings: state.researchReports.flatMap((report) => report.findings).slice(-8),
				inputText: buildResearchContextPack(state),
				prompt: buildDirectorPlanPrompt(state),
			});
			const drafts = parsePlanProposal(state, response.text);
			if (drafts.length > 0) {
				const objective =
					parseObjective(response.text) ?? `Make durable, reviewable progress on: ${state.rootQuestion}`;
				let nextState = addResearchPlan(state, {
					title: `Research plan for: ${truncate(state.rootQuestion, 96)}`,
					objective,
					now: input.now,
					actor: input.actor,
				});
				const plan = nextState.researchPlans.at(-1);
				if (!plan) {
					throw new Error("Could not create the research plan.");
				}
				for (const draft of drafts) {
					nextState = addResearchPlanTask(nextState, {
						planId: plan.id,
						kind: draft.kind,
						title: draft.title,
						description: draft.description,
						...(draft.goal ? { goal: draft.goal } : {}),
						acceptanceCriteria: draft.acceptanceCriteria,
						...(draft.pathId ? { pathId: draft.pathId } : {}),
						now: input.now,
						actor: input.actor,
					});
				}
				const persisted = nextState.researchPlans.find((candidate) => candidate.id === plan.id) ?? plan;
				return { state: nextState, plan: persisted, source: "model" };
			}
		} catch {
			// Fall through to the deterministic planner: an unusable model proposal must never
			// leave the project without a plan.
		}
	}
	const created = createResearchPlanFromState(state, { now: input.now, actor: input.actor });
	return { ...created, source: "deterministic" };
}

/**
 * Let the director amend the pending tail of the plan after a completed task: cancel pending tasks
 * that new findings made pointless, or add up to a few new bounded tasks. Completed/running tasks
 * are immutable, pending tasks stay capped at {@link MAX_RESEARCH_PLAN_TASKS}, and any parse or
 * validation failure is a silent no-op — the plan keeps executing as written.
 */
export async function amendResearchPlanAfterTask(
	state: CoMathProjectState,
	planId: string,
	input: AmendResearchPlanInput,
): Promise<AmendResearchPlanResult> {
	const noAmendment: AmendResearchPlanResult = { state, amended: false, addedTitles: [], cancelledTitles: [] };
	const plan = state.researchPlans.find((candidate) => candidate.id === planId);
	if (!plan || plan.status !== "active") {
		return noAmendment;
	}
	const tasks = getResearchPlanTasks(state, planId);
	const pending = tasks.filter((task) => task.status === "pending");
	try {
		const response = await input.executor.run({
			role: "synthesizer",
			rootQuestion: state.rootQuestion,
			path: representativePath(state, input.now),
			allPaths: state.researchPaths,
			priorFindings: state.researchReports.flatMap((report) => report.findings).slice(-8),
			inputText: buildResearchContextPack(state),
			prompt: buildDirectorAmendmentPrompt(state, input.completedTask, pending),
		});
		const parsed = extractJsonObject(response.text);
		if (!parsed || !Array.isArray(parsed.actions)) {
			return noAmendment;
		}
		const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : undefined;
		let nextState = state;
		const addedTitles: string[] = [];
		const cancelledTitles: string[] = [];
		let pendingCount = pending.length;
		for (const rawAction of parsed.actions.slice(0, MAX_AMENDMENT_ACTIONS)) {
			if (typeof rawAction !== "object" || rawAction === null) {
				continue;
			}
			const action = rawAction as Record<string, unknown>;
			if (action.type === "cancel") {
				const sequence = toPositiveInteger(action.taskNumber ?? action.task);
				const target = pending.find((task) => task.sequence === sequence && !cancelledTitles.includes(task.title));
				if (!target) {
					continue;
				}
				nextState = updateResearchPlanTask(nextState, {
					taskId: target.id,
					status: "cancelled",
					...(typeof action.reason === "string" && action.reason.trim()
						? { blockedReason: action.reason.trim() }
						: {}),
					now: input.now,
					actor: "coordinator",
				});
				cancelledTitles.push(target.title);
				pendingCount -= 1;
				continue;
			}
			if (action.type === "add") {
				if (pendingCount >= MAX_RESEARCH_PLAN_TASKS) {
					continue;
				}
				const draft = validateTaskDraft(nextState, action);
				if (!draft) {
					continue;
				}
				nextState = addResearchPlanTask(nextState, {
					planId,
					kind: draft.kind,
					title: draft.title,
					description: draft.description,
					...(draft.goal ? { goal: draft.goal } : {}),
					acceptanceCriteria: draft.acceptanceCriteria,
					...(draft.pathId ? { pathId: draft.pathId } : {}),
					now: input.now,
					actor: "coordinator",
				});
				addedTitles.push(draft.title);
				pendingCount += 1;
			}
		}
		if (addedTitles.length === 0 && cancelledTitles.length === 0) {
			return noAmendment;
		}
		return {
			state: nextState,
			amended: true,
			addedTitles,
			cancelledTitles,
			...(reason ? { reason } : {}),
		};
	} catch {
		return noAmendment;
	}
}

export function buildDirectorPlanPrompt(state: CoMathProjectState): string {
	const fallback = buildResearchPlanTaskBlueprints(state);
	return [
		"You are the research director for a mathematical research workspace.",
		"Design a bounded research plan from the durable state below.",
		"Rules:",
		`- Between 1 and ${MAX_RESEARCH_PLAN_TASKS} tasks, ordered so earlier tasks inform later ones.`,
		`- Each task kind must be one of: ${RESEARCH_PLAN_TASK_KINDS.join(", ")}.`,
		"- literature-search, source-refresh, computation, and proof-attempt tasks run against a research path; give pathNumber (1-based, from the paths listed below).",
		"- Give each task a concrete goal and 1-3 acceptance criteria stating what counts as done.",
		"- Plan from what is actually known: pursue counterexamples found, prove lemmas already supported by evidence, do not repeat settled work.",
		"- Never plan to 'prove' a famous open problem outright; plan reductions, weaker targets, or evidence.",
		"",
		buildResearchContextPack(state),
		"",
		"Return ONLY a JSON object, no prose, shaped like:",
		JSON.stringify(
			{
				objective: "one sentence",
				tasks: [
					{
						kind: fallback[0]?.kind ?? "computation",
						title: "short title",
						description: "what to do",
						goal: "what to pursue",
						acceptanceCriteria: ["done when ..."],
						pathNumber: 1,
					},
				],
			},
			null,
			1,
		),
	].join("\n");
}

export function buildDirectorAmendmentPrompt(
	state: CoMathProjectState,
	completedTask: ResearchPlanTaskRecord,
	pending: readonly ResearchPlanTaskRecord[],
): string {
	return [
		"You are the research director for a mathematical research workspace.",
		`A plan task just completed: task ${completedTask.sequence} (${completedTask.kind}): ${completedTask.title}.`,
		"Decide whether the remaining pending tasks are still the right ones given the durable state below.",
		"Rules:",
		`- At most ${MAX_AMENDMENT_ACTIONS} actions. Prefer an empty action list; amend only when new findings changed what is worth doing.`,
		"- You may only cancel PENDING tasks (by their task number) and add new tasks.",
		`- Task kinds: ${RESEARCH_PLAN_TASK_KINDS.join(", ")}. Added tasks need title, description, goal, acceptanceCriteria, and pathNumber for path-backed kinds.`,
		`- Pending tasks must stay at or below ${MAX_RESEARCH_PLAN_TASKS}.`,
		"",
		"Pending tasks:",
		...(pending.length > 0
			? pending.map((task) => `- Task ${task.sequence} (${task.kind}): ${task.title}`)
			: ["- (none)"]),
		"",
		buildResearchContextPack(state),
		"",
		"Return ONLY a JSON object, no prose, shaped like:",
		JSON.stringify(
			{
				reason: "one sentence, or empty",
				actions: [
					{ type: "cancel", taskNumber: 4, reason: "why" },
					{
						type: "add",
						kind: "computation",
						title: "short title",
						description: "what to do",
						goal: "what to pursue",
						acceptanceCriteria: ["done when ..."],
						pathNumber: 1,
					},
				],
			},
			null,
			1,
		),
		'If no change is needed, return {"reason":"","actions":[]}.',
	].join("\n");
}

function parsePlanProposal(state: CoMathProjectState, text: string): DirectorTaskDraft[] {
	const parsed = extractJsonObject(text);
	if (!parsed || !Array.isArray(parsed.tasks)) {
		return [];
	}
	const drafts: DirectorTaskDraft[] = [];
	for (const rawTask of parsed.tasks) {
		if (drafts.length >= MAX_RESEARCH_PLAN_TASKS) {
			break;
		}
		if (typeof rawTask !== "object" || rawTask === null) {
			continue;
		}
		const draft = validateTaskDraft(state, rawTask as Record<string, unknown>);
		if (draft) {
			drafts.push(draft);
		}
	}
	return drafts;
}

function parseObjective(text: string): string | undefined {
	const parsed = extractJsonObject(text);
	const objective = parsed && typeof parsed.objective === "string" ? parsed.objective.trim() : "";
	return objective.length > 0 ? truncate(objective, 300) : undefined;
}

/**
 * Validate one model-authored task against the deterministic invariants: known kind, non-empty
 * title/description, bounded criteria, and a resolvable non-abandoned research path for
 * workstream-backed kinds. Returns `undefined` when the task cannot be made safe.
 */
function validateTaskDraft(state: CoMathProjectState, raw: Record<string, unknown>): DirectorTaskDraft | undefined {
	const kind = RESEARCH_PLAN_TASK_KINDS.find((candidate) => candidate === raw.kind);
	if (!kind) {
		return undefined;
	}
	const title = typeof raw.title === "string" ? truncate(raw.title.trim(), 120) : "";
	if (!title) {
		return undefined;
	}
	const goal = typeof raw.goal === "string" && raw.goal.trim() ? truncate(raw.goal.trim(), 300) : undefined;
	const description =
		typeof raw.description === "string" && raw.description.trim()
			? truncate(raw.description.trim(), 400)
			: (goal ?? title);
	const acceptanceCriteria = Array.isArray(raw.acceptanceCriteria)
		? raw.acceptanceCriteria
				.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
				.slice(0, MAX_ACCEPTANCE_CRITERIA)
				.map((item) => truncate(item.trim(), 200))
		: [];
	const needsPath =
		kind === "literature-search" || kind === "source-refresh" || kind === "computation" || kind === "proof-attempt";
	let pathId: string | undefined;
	if (needsPath) {
		const pathNumber = toPositiveInteger(raw.pathNumber ?? raw.path);
		const byNumber = pathNumber !== undefined ? state.researchPaths[pathNumber - 1] : undefined;
		const resolved =
			byNumber && byNumber.status !== "abandoned" ? byNumber : chooseResearchPathForPlanTaskKind(state, kind);
		if (!resolved) {
			return undefined;
		}
		pathId = resolved.id;
	}
	return {
		kind,
		title,
		description,
		...(goal ? { goal } : {}),
		acceptanceCriteria,
		...(pathId ? { pathId } : {}),
	};
}

/** Extract the first JSON object from model text. Re-exported for callers of the director API. */
export const extractJsonObject = extractCoMathJsonObject;

function representativePath(state: CoMathProjectState, now: string): ResearchPath {
	const active = [...state.researchPaths]
		.filter((path) => path.status !== "abandoned")
		.sort((a, b) => a.priority - b.priority)[0];
	return (
		active ?? {
			id: "path-director",
			title: "Research direction",
			objective: state.rootQuestion,
			status: "active",
			latestFindings: [],
			blockers: [],
			suggestedNextMove: "Plan the next bounded research move.",
			priority: 1,
			createdAt: now,
			updatedAt: now,
		}
	);
}

function toPositiveInteger(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
		return Math.floor(value);
	}
	if (typeof value === "string" && /^\d+$/.test(value.trim())) {
		const parsed = Number.parseInt(value.trim(), 10);
		return parsed >= 1 ? parsed : undefined;
	}
	return undefined;
}

function truncate(text: string, maxLength: number): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) {
		return normalized;
	}
	return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}
