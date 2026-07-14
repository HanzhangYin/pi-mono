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
import {
	deriveResearchAgenda,
	describeAgendaProvenance,
	repeatsPlannedResearchTask,
	violatesRejectedRoute,
} from "./comath-research-agenda.ts";
import { buildResearchContextPack } from "./comath-research-context.ts";
import {
	buildResearchPlanTaskBlueprints,
	chooseResearchPathForPlanTaskKind,
	createResearchPlanFromState,
	MAX_RESEARCH_PLAN_TASKS,
} from "./comath-research-planner.ts";
import type { ResearchWorkstreamModelExecutor } from "./comath-task-model.ts";
import type {
	CoMathActor,
	CoMathProjectState,
	ResearchPath,
	ResearchPlanRecord,
	ResearchPlanTaskKind,
	ResearchPlanTaskRecord,
	ResearchPlanTaskRequiredCapability,
	ResearchTaskSourceRequest,
} from "./schema.ts";
import {
	addResearchPivot,
	addResearchPlan,
	addResearchPlanTask,
	getEvidenceLineage,
	getResearchPlanTasks,
	updateResearchPlanTask,
} from "./storage.ts";

const RESEARCH_PLAN_TASK_KINDS: readonly ResearchPlanTaskKind[] = [
	"literature-search",
	"proof-attempt",
	"refutation-attempt",
	"computation",
	"source-refresh",
	"revise-conjecture",
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

/** Reapply a validated proposal to fresh durable state without replacing concurrent records. */
export function applyProposedResearchPlan(
	state: CoMathProjectState,
	proposal: ProposeResearchPlanResult,
	input: { now: string; actor?: CoMathActor },
): { state: CoMathProjectState; plan: ResearchPlanRecord } {
	let nextState = addResearchPlan(state, {
		title: proposal.plan.title,
		objective: proposal.plan.objective,
		now: input.now,
		actor: input.actor,
	});
	const plan = nextState.researchPlans.at(-1);
	if (!plan) {
		throw new Error("Could not commit the proposed research plan.");
	}
	const committedTaskIds = new Map<string, string>();
	for (const task of getResearchPlanTasks(proposal.state, proposal.plan.id)) {
		if (task.pathId && !nextState.researchPaths.some((path) => path.id === task.pathId)) {
			throw new Error(`Cannot commit a proposed task for missing research path ${task.pathId}.`);
		}
		const dependsOnTaskIds = task.dependsOnTaskIds.map((dependencyId) => {
			const committedDependencyId = committedTaskIds.get(dependencyId);
			if (!committedDependencyId) {
				throw new Error("Cannot commit a proposed task with a missing or forward dependency.");
			}
			return committedDependencyId;
		});
		nextState = addResearchPlanTask(nextState, {
			planId: plan.id,
			kind: task.kind,
			title: task.title,
			description: task.description,
			...(task.goal ? { goal: task.goal } : {}),
			acceptanceCriteria: task.acceptanceCriteria,
			dependsOnTaskIds,
			requiredCapabilities: task.requiredCapabilities,
			...(task.sourceRequests ? { sourceRequests: task.sourceRequests } : {}),
			...(task.pathId ? { pathId: task.pathId } : {}),
			now: input.now,
			actor: input.actor,
		});
		const committedTask = getResearchPlanTasks(nextState, plan.id).at(-1);
		if (!committedTask) {
			throw new Error("Could not commit a proposed research plan task.");
		}
		committedTaskIds.set(task.id, committedTask.id);
	}
	return {
		state: nextState,
		plan: nextState.researchPlans.find((candidate) => candidate.id === plan.id) ?? plan,
	};
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
	/** Original one-based task number in the director proposal. */
	taskNumber: number;
	kind: ResearchPlanTaskKind;
	title: string;
	description: string;
	goal?: string;
	acceptanceCriteria: string[];
	/** Undefined means the immediately preceding task; [] declares independence. */
	dependsOnTaskNumbers?: number[];
	requiredCapabilities: ResearchPlanTaskRequiredCapability[];
	sourceRequests?: ResearchTaskSourceRequest[];
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
				purpose: "director",
				rootQuestion: state.rootQuestion,
				path: representativePath(state, input.now),
				allPaths: state.researchPaths,
				priorFindings: state.researchReports.flatMap((report) => report.findings).slice(-8),
				inputText: buildResearchContextPack(state),
				prompt: buildDirectorPlanPrompt(state),
			});
			const drafts = ensureWorkspaceSourceRefreshFirst(state, parsePlanProposal(state, response.text));
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
				const createdTaskIds = new Map<number, string>();
				for (const draft of drafts) {
					const dependsOnTaskIds = draft.dependsOnTaskNumbers?.map((taskNumber) => {
						const taskId = createdTaskIds.get(taskNumber);
						if (!taskId) {
							throw new Error("Research plan dependency must reference an earlier retained task.");
						}
						return taskId;
					});
					nextState = addResearchPlanTask(nextState, {
						planId: plan.id,
						kind: draft.kind,
						title: draft.title,
						description: draft.description,
						...(draft.goal ? { goal: draft.goal } : {}),
						acceptanceCriteria: draft.acceptanceCriteria,
						...(dependsOnTaskIds ? { dependsOnTaskIds } : {}),
						requiredCapabilities: draft.requiredCapabilities,
						...(draft.sourceRequests ? { sourceRequests: draft.sourceRequests } : {}),
						...(draft.pathId ? { pathId: draft.pathId } : {}),
						now: input.now,
						actor: input.actor,
					});
					const createdTask = getResearchPlanTasks(nextState, plan.id).at(-1);
					if (!createdTask) {
						throw new Error("Could not create a research plan task.");
					}
					createdTaskIds.set(draft.taskNumber, createdTask.id);
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

function ensureWorkspaceSourceRefreshFirst(
	state: CoMathProjectState,
	drafts: readonly DirectorTaskDraft[],
): DirectorTaskDraft[] {
	const needsSourceRefresh =
		state.literatureSources.some((source) => source.kind === "local-file" && source.provider === "workspace") &&
		!state.researchPlanTasks.some((task) => task.kind === "source-refresh" && task.status === "completed");
	if (!needsSourceRefresh) {
		return [...drafts];
	}
	const proposedRefresh = drafts.find((draft) => draft.kind === "source-refresh");
	const path = proposedRefresh?.pathId
		? state.researchPaths.find((candidate) => candidate.id === proposedRefresh.pathId)
		: chooseResearchPathForPlanTaskKind(state, "source-refresh");
	if (!path) {
		return [...drafts];
	}
	const sourceRefresh: DirectorTaskDraft = proposedRefresh ?? {
		taskNumber: 0,
		kind: "source-refresh",
		title: "Inspect the supplied source snapshot",
		description:
			"Extract the mathematical questions, definitions, claims, and dependencies from the immutable workspace source before attempting them.",
		goal: "Produce a source-grounded problem map with exact snapshot locators and explicit uncertainty.",
		acceptanceCriteria: [
			"Identify the mathematical statements that warrant separate work.",
			"Cite the immutable source paths or revision identities used.",
		],
		requiredCapabilities: ["source-grounding", "independent-review"],
		pathId: path.id,
	};
	const remaining = drafts.filter((draft) => draft !== proposedRefresh);
	if (remaining.length < MAX_RESEARCH_PLAN_TASKS) {
		return requireSourceRefreshDependency([sourceRefresh, ...remaining], sourceRefresh.taskNumber);
	}
	return requireSourceRefreshDependency(
		[sourceRefresh, ...remaining.slice(0, MAX_RESEARCH_PLAN_TASKS - 1)],
		sourceRefresh.taskNumber,
	);
}

function requireSourceRefreshDependency(
	drafts: readonly DirectorTaskDraft[],
	sourceRefreshTaskNumber: number,
): DirectorTaskDraft[] {
	return drafts.map((draft) => {
		if (draft.taskNumber === sourceRefreshTaskNumber || !isSourceDependentTaskKind(draft.kind)) {
			return draft;
		}
		return {
			...draft,
			dependsOnTaskNumbers: Array.from(new Set([...(draft.dependsOnTaskNumbers ?? []), sourceRefreshTaskNumber])),
		};
	});
}

function isSourceDependentTaskKind(kind: ResearchPlanTaskKind): boolean {
	return (
		kind === "literature-search" ||
		kind === "computation" ||
		kind === "proof-attempt" ||
		kind === "refutation-attempt"
	);
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
			purpose: "director",
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
					...(draft.sourceRequests ? { sourceRequests: draft.sourceRequests } : {}),
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
		// Cancelling one route while adding another is a pivot; make it durable so the abandoned
		// route and the reason are never silently forgotten.
		if (cancelledTitles.length > 0 && addedTitles.length > 0) {
			nextState = addResearchPivot(nextState, {
				fromRoute: cancelledTitles.join("; "),
				toRoute: addedTitles.join("; "),
				reason: reason || "The completed step changed which route is worth pursuing.",
				taskId: input.completedTask.id,
				now: input.now,
				actor: "coordinator",
			});
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
	const agenda = deriveResearchAgenda(state);
	return [
		"ROLE",
		"You are the research director for a mathematical research workspace.",
		"TASK",
		"Design a bounded research plan from the durable state below.",
		"ROLE-SPECIFIC RULES",
		`- Between 1 and ${MAX_RESEARCH_PLAN_TASKS} tasks. Declare dependsOn as earlier one-based task numbers; omit it to depend on the immediately preceding task, or use [] only for genuinely independent work.`,
		`- Each task kind must be one of: ${RESEARCH_PLAN_TASK_KINDS.join(", ")}.`,
		"- literature-search, source-refresh, computation, proof-attempt, and refutation-attempt tasks run against a research path; give pathNumber (1-based, from the paths listed below).",
		"- Give each task a concrete goal and 1-3 acceptance criteria stating what counts as done.",
		"- Keep acceptance criteria bounded to the task's named mathematical targets. Never require an exhaustive audit of every theorem, definition, notation item, or file in the project unless the user explicitly requested that audit.",
		"- A source-refresh should recover the core statements and the definitions actually used by planned downstream tasks. It may record a source omission, ambiguity, or apparent typo as an explicit grounded result; do not require the task to invent or resolve text absent from the source.",
		"- Make each criterion satisfiable from the requested source ranges plus a small number of bounded source inspections. Do not make acceptance depend on proving that no relevant statement exists elsewhere in the directory.",
		'- Declare "sandboxed-computation" in requiredCapabilities whenever completing a task requires enumeration, scripts, numerical checks, symbolic calculation, or generator-removal tests, regardless of the task kind.',
		"- Put exact local-source inputs in sourceRequests using durable sourceId plus numeric start/end ranges. Never encode executable locators only in description prose.",
		...(state.literatureSources.some((source) => source.kind === "local-file" && source.provider === "workspace")
			? [
					"- Immutable workspace sources are supplied below. Make the first task a bounded source-refresh that extracts the task-relevant mathematical statements and cites their exact snapshot locators before proof or computation tasks.",
				]
			: []),
		"- Respect the standing constraints listed in the state below; never plan a task they exclude.",
		"- Respect recorded theorem applicability rejections and route changes; do not plan a rejected route again.",
		"- Work both sides: alongside proof attempts, plan a refutation-attempt that actively searches for counterexamples.",
		"- When evidence has refuted the current statement, plan a revise-conjecture task to repair it before more proof attempts.",
		"- Plan from what is actually known: pursue counterexamples found, prove lemmas already supported by evidence, do not repeat settled work.",
		"- Never plan to 'prove' a famous open problem outright; plan reductions, weaker targets, or evidence.",
		"- Weigh path coverage: the 'Path coverage' lines in the state below show recorded work per path and flag untouched paths. Spread suitable tasks so active paths do not stay untouched while one path absorbs everything.",
		"- You may still assign a task to a path that already has completed work, but while other suitable active paths are untouched, say in that task's goal why the worked path deserves more.",
		...(agenda.length > 0
			? [
					"",
					"Continuation agenda derived from the durable state (adopt these unless you have a concretely better plan; each line says why the work exists):",
					...describeAgendaProvenance(agenda),
				]
			: []),
		"",
		"INPUT MATERIAL",
		buildResearchContextPack(state),
		"",
		"OUTPUT CONTRACT",
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
						dependsOn: [1],
						requiredCapabilities: ["sandboxed-computation", "independent-review"],
						sourceRequests: [{ sourceId: "source-6", ranges: [{ start: 1489, end: 1552 }] }],
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
		"ROLE",
		"You are the research director for a mathematical research workspace.",
		"TASK",
		`A plan task just completed or otherwise reached a durable outcome: task ${completedTask.sequence} (${completedTask.kind}, ${completedTask.status}${completedTask.reviewOutcome ? `, review ${completedTask.reviewOutcome}` : ""}): ${completedTask.title}.`,
		"Decide whether the remaining pending tasks are still the right ones given the durable state below.",
		"ROLE-SPECIFIC RULES",
		`- At most ${MAX_AMENDMENT_ACTIONS} actions. Prefer an empty action list; amend only when new findings changed what is worth doing.`,
		"- You may only cancel PENDING tasks (by their task number) and add new tasks.",
		`- Task kinds: ${RESEARCH_PLAN_TASK_KINDS.join(", ")}. Critique and synthesis are internal attempt stages, not plan tasks. Added tasks need title, description, goal, acceptanceCriteria, and pathNumber for path-backed kinds.`,
		"- Put exact local-source inputs in sourceRequests using durable sourceId plus numeric start/end ranges. Never encode executable locators only in description prose.",
		`- Pending tasks must stay at or below ${MAX_RESEARCH_PLAN_TASKS}.`,
		"- Reallocate toward the productive side: when refuting evidence dominates, add a revise-conjecture task and cancel pending proof-attempt tasks aimed at the refuted statement; when supporting evidence dominates, cancel stale refutation work.",
		"- Weigh path coverage: the 'Path coverage' lines in the state below show recorded work per path and flag untouched paths. Before adding another task to a path that already has completed work while suitable active paths remain untouched, give the reason in the new task's goal.",
		"",
		"INPUT MATERIAL",
		"Pending tasks (input data):",
		...(pending.length > 0
			? pending.map((task) => `- Task ${task.sequence} (${task.kind}): ${task.title}`)
			: ["- (none)"]),
		"",
		...buildTwinTrackScoreboard(state),
		...buildStatementLineageContext(state),
		buildResearchContextPack(state),
		"",
		"OUTPUT CONTRACT",
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

/** Evidence counts for and against the statement, so amendments can reallocate between tracks. */
function buildTwinTrackScoreboard(state: CoMathProjectState): string[] {
	const supporting = state.researchEvidenceBoard.filter(
		(entry) => entry.classification === "theorem" || entry.classification === "computation",
	).length;
	const refuting = state.researchEvidenceBoard.filter((entry) => entry.classification === "conflicting").length;
	if (supporting === 0 && refuting === 0) {
		return [];
	}
	return [
		"Evidence balance for the current statement:",
		`- Supporting entries (proved or computation-backed): ${supporting}`,
		`- Refuting entries (conflicting or counterexample-backed): ${refuting}`,
		"",
	];
}

/** Revision ancestry of the live statement, so amendments target the current version, not a refuted ancestor. */
function buildStatementLineageContext(state: CoMathProjectState): string[] {
	const target = [...state.researchEvidenceBoard].reverse().find((entry) => {
		if (entry.classification !== "conjecture" && entry.classification !== "theorem") return false;
		return getEvidenceLineage(state, entry.id).at(-1)?.id === entry.id;
	});
	if (!target) {
		return [];
	}
	const lineage = getEvidenceLineage(state, target.id);
	if (lineage.length <= 1) {
		return [];
	}
	return [
		"Statement revision history (earliest first; plan against the LAST one):",
		// A child's revisionNote records what refuted its parent, so the note for a superseded
		// statement lives on the entry that replaced it.
		...lineage.map((entry, index) =>
			index === lineage.length - 1
				? `- Current: ${entry.claim}`
				: `- Superseded: ${entry.claim}${lineage[index + 1]?.revisionNote ? ` (${lineage[index + 1]?.revisionNote})` : ""}`,
		),
		"",
	];
}

function parsePlanProposal(state: CoMathProjectState, text: string): DirectorTaskDraft[] {
	const parsed = extractJsonObject(text);
	if (!parsed || !Array.isArray(parsed.tasks)) {
		return [];
	}
	const drafts: DirectorTaskDraft[] = [];
	for (const [index, rawTask] of parsed.tasks.entries()) {
		if (drafts.length >= MAX_RESEARCH_PLAN_TASKS) {
			break;
		}
		if (typeof rawTask !== "object" || rawTask === null) {
			continue;
		}
		const draft = validateTaskDraft(state, rawTask as Record<string, unknown>, index + 1);
		if (draft) {
			drafts.push(draft);
		} else if (hasExplicitDependencies(rawTask as Record<string, unknown>)) {
			return [];
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
function validateTaskDraft(
	state: CoMathProjectState,
	raw: Record<string, unknown>,
	taskNumber?: number,
): DirectorTaskDraft | undefined {
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
	// A route a durable theorem check already rejected must not re-enter the plan, no matter how
	// the model phrased it. Goals are exempt: they may cite the rejection as history.
	if (violatesRejectedRoute(state, `${title} ${description}`)) {
		return undefined;
	}
	const acceptanceCriteria = Array.isArray(raw.acceptanceCriteria)
		? raw.acceptanceCriteria
				.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
				.slice(0, MAX_ACCEPTANCE_CRITERIA)
				.map((item) => truncate(item.trim(), 200))
		: [];
	const dependsOnTaskNumbers = parseTaskDependencyNumbers(raw.dependsOn, taskNumber);
	if (hasExplicitDependencies(raw) && !dependsOnTaskNumbers) {
		return undefined;
	}
	const requiredCapabilities = parseRequiredCapabilities(raw.requiredCapabilities);
	const sourceRequests = parseDirectorSourceRequests(state, raw.sourceRequests);
	// A task that restates already-planned or already-completed work is repetition, not progress,
	// unless it sharpens the target with an acceptance criterion the earlier task did not have.
	if (repeatsPlannedResearchTask(state, { kind, title, description, acceptanceCriteria })) {
		return undefined;
	}
	const needsPath =
		kind === "literature-search" ||
		kind === "source-refresh" ||
		kind === "computation" ||
		kind === "proof-attempt" ||
		kind === "refutation-attempt";
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
		taskNumber: taskNumber ?? 0,
		kind,
		title,
		description,
		...(goal ? { goal } : {}),
		acceptanceCriteria,
		...(dependsOnTaskNumbers ? { dependsOnTaskNumbers } : {}),
		requiredCapabilities,
		...(sourceRequests.length > 0 ? { sourceRequests } : {}),
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

function hasExplicitDependencies(raw: Record<string, unknown>): boolean {
	return Object.hasOwn(raw, "dependsOn");
}

function parseTaskDependencyNumbers(value: unknown, taskNumber: number | undefined): number[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value) || taskNumber === undefined) {
		return undefined;
	}
	const dependencies = value.map(toPositiveInteger);
	if (dependencies.some((dependency) => dependency === undefined)) {
		return undefined;
	}
	const uniqueDependencies = Array.from(new Set(dependencies as number[]));
	return uniqueDependencies.every((dependency) => dependency < taskNumber) ? uniqueDependencies : undefined;
}

function parseRequiredCapabilities(value: unknown): ResearchPlanTaskRequiredCapability[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return Array.from(
		new Set(
			value.filter(
				(capability): capability is ResearchPlanTaskRequiredCapability =>
					capability === "source-grounding" ||
					capability === "sandboxed-computation" ||
					capability === "independent-review",
			),
		),
	);
}

function parseDirectorSourceRequests(state: CoMathProjectState, value: unknown): ResearchTaskSourceRequest[] {
	if (!Array.isArray(value)) return [];
	const requests: ResearchTaskSourceRequest[] = [];
	for (const candidate of value) {
		if (typeof candidate !== "object" || candidate === null) continue;
		const record = candidate as Record<string, unknown>;
		const sourceId = typeof record.sourceId === "string" ? record.sourceId.trim() : "";
		const source = state.literatureSources.find(
			(item) => item.id === sourceId && item.citationEligibility === "citable" && item.sourceIndexId,
		);
		if (!source || !Array.isArray(record.ranges)) continue;
		const ranges = record.ranges.flatMap((range) => {
			if (typeof range !== "object" || range === null) return [];
			const parsed = range as Record<string, unknown>;
			const start = toPositiveInteger(parsed.start);
			const end = toPositiveInteger(parsed.end);
			return start !== undefined && end !== undefined && end >= start ? [{ start, end }] : [];
		});
		if (ranges.length > 0) requests.push({ sourceId, ranges });
	}
	return requests;
}

function truncate(text: string, maxLength: number): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) {
		return normalized;
	}
	return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}
