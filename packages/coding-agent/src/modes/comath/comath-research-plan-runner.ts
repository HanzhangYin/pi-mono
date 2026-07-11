/**
 * Bounded executor for durable co-math research plans.
 *
 * The plan runner executes plan tasks one at a time by default, persisting state before and after
 * each task and reloading state between tasks, so an interruption always lands on a durable task
 * boundary. Independent tasks (different research paths, workstream-backed kinds) may run as a
 * bounded concurrent group when the caller asks for it — the research work overlaps, but every
 * durable commit is serialized through a shared {@link CoMathStateLock}, so the state file only
 * ever sees whole, ordered writes. There is no daemon or scheduler here: every task execution
 * happens inside an explicit user-driven call, and a paused plan is only ever resumed by an
 * explicit prompt — never automatically after an interruption. Retries re-run the interrupted task
 * from scratch; nothing is checkpointed mid-model-call.
 */

import { mkdir, writeFile } from "node:fs/promises";
import * as nodePath from "node:path";
import type { ComputationalExecutor } from "./comath-computation-executor.ts";
import { runResearchCoordinatorSynthesis } from "./comath-coordinator-synthesis.ts";
import {
	type CoMathResearchActivityPhase,
	formatCoMathResearchPhaseActivityStatus,
	formatConjectureRefuted,
	formatConjectureRevised,
	formatResearchPlanAmended,
	formatResearchPlanBlocked,
	formatResearchPlanCompleted,
	formatResearchPlanCreated,
	formatResearchPlanPaused,
	formatResearchPlanTaskCompleted,
	formatResearchPlanTaskRejectedContinuing,
	formatResearchPlanTaskStarted,
	formatSkepticReviewCompleted,
	formatStateOfProblemUpdated,
} from "./comath-progress.ts";
import { classifyResearchTaskProgress } from "./comath-research-agenda.ts";
import { amendResearchPlanAfterTask, proposeResearchPlan } from "./comath-research-director.ts";
import type { ResearchWorkstreamModelExecutor } from "./comath-research-model-workstream.ts";
import {
	applyCompletedTaskToObligations,
	applyConjectureRevisionToObligations,
	evidenceDirectlyRefutesStatement,
} from "./comath-research-obligations.ts";
import { chooseResearchPathForPlanTaskKind } from "./comath-research-planner.ts";
import { buildStateOfProblemSectionBody, STATE_OF_PROBLEM_SECTION_TITLE } from "./comath-research-product.ts";
import { runConjectureRevisionTask } from "./comath-research-revision.ts";
import {
	type CoMathResearchPhaseActivityNotify,
	type CoMathResearchRunner,
	type CoMathResearchRunnerNotify,
	foldResearchCoordinatorSynthesisReport,
	safeErrorMessage,
} from "./comath-research-runner.ts";
import {
	prepareSkepticGate,
	type SkepticIndependentCheckStatus,
	type SkepticVerdict,
} from "./comath-research-skeptic.ts";
import { CoMathStateLock } from "./comath-state-lock.ts";
import type {
	CoMathActor,
	CoMathProjectState,
	ResearchPath,
	ResearchPlanRecord,
	ResearchPlanTaskKind,
	ResearchPlanTaskRecord,
	ResearchTaskReviewOutcome,
} from "./schema.ts";
import {
	addMarginNote,
	getActiveResearchPlan,
	getNextRunnableResearchPlanTask,
	getPausedResearchPlan,
	getResearchPlanTasks,
	getTheoremApplicabilityChecksForPath,
	loadProjectState,
	recordWorkingPaperExport,
	saveProjectState,
	updateResearchPlan,
	updateResearchPlanTask,
	upsertWorkingPaperSectionByTitle,
} from "./storage.ts";

export const STALE_RESEARCH_PLAN_TASK_REASON = "Previous Pi session ended before the task finished.";

export interface CoMathResearchPlanRunnerOptions {
	statePath: string;
	notify: CoMathResearchRunnerNotify;
	researchRunner: CoMathResearchRunner;
	researchModelExecutor?: ResearchWorkstreamModelExecutor;
	/**
	 * Optional strong-model executor for the director (plan proposal/amendment) and the skeptic
	 * (independent review of finished tasks). Without it, plans come from the deterministic planner
	 * and the skeptic gate is skipped, matching the pre-director harness exactly.
	 */
	researchDirectorExecutor?: ResearchWorkstreamModelExecutor;
	/** Runs the skeptic's bounded counterexample scripts; unused without a director executor. */
	computationalExecutor?: ComputationalExecutor;
	/**
	 * Serializes every durable load→mutate→persist commit. Share one lock with the research runner
	 * and batch runner so concurrent plan tasks overlap only in their research work, never in their
	 * state writes.
	 */
	stateLock?: CoMathStateLock;
	/** Best-effort UI status for phases outside a workstream run (planning, review, amendment, …). */
	onResearchPhaseActivity?: CoMathResearchPhaseActivityNotify;
}

export interface ResearchPlanTaskExecutionOptions {
	batchId?: string;
	stepIndex?: number;
}

/** One member of a concurrent plan-task group: a preselected task plus its per-task options. */
export interface ResearchPlanTaskGroupRequest {
	taskId: string;
	options?: ResearchPlanTaskExecutionOptions;
}

export type ResearchPlanTaskExecutionOutcome =
	| { kind: "completed"; task: ResearchPlanTaskRecord; runId?: string; planCompleted: boolean }
	| {
			kind: "blocked";
			task: ResearchPlanTaskRecord;
			reason: string;
			runId?: string;
			/**
			 * False when a review rejection blocked only this task and the plan moved on to its next
			 * pending task; true when the whole plan paused at this boundary.
			 */
			planPaused: boolean;
	  }
	| { kind: "failed"; task: ResearchPlanTaskRecord; reason: string }
	| { kind: "plan-completed" }
	| { kind: "not-runnable"; reason: string };

type PlanTaskExecutionResult =
	| {
			status: "completed";
			runId?: string;
			reportId?: string;
			sourceIds?: readonly string[];
			claimSupportIds?: readonly string[];
			computationalArtifactIds?: readonly string[];
			evidenceEntryIds?: readonly string[];
			reviewOutcome?: ResearchTaskReviewOutcome;
			/** Records the independent review created; linked to the task but not its own output. */
			reviewComputationalArtifactIds?: readonly string[];
			reviewEvidenceEntryIds?: readonly string[];
	  }
	| {
			status: "blocked";
			reason: string;
			runId?: string;
			/** True when an independent review rejected an otherwise-finished step. */
			reviewRejected?: boolean;
			/** What the rejected step still produced; kept on the task so its trail survives. */
			reportId?: string;
			sourceIds?: readonly string[];
			claimSupportIds?: readonly string[];
			computationalArtifactIds?: readonly string[];
			evidenceEntryIds?: readonly string[];
	  }
	| { status: "failed"; reason: string; runId?: string };

/**
 * Reset a paused plan so its interrupted/blocked/failed tasks are retried from the last durable
 * boundary. Pure state transform; the caller decides when a user prompt justifies resuming.
 *
 * A task the independent review rejected is not retried by default: re-running the identical step
 * would meet the identical review, so a resume that blindly retried it first would loop instead of
 * progressing. Rejected tasks become retryable only when they are the plan's sole remaining work,
 * where an explicit resume can only mean "try that step again".
 */
export function resumeResearchPlan(
	state: CoMathProjectState,
	planId: string,
	now: string,
	actor: CoMathActor = "human",
): CoMathProjectState {
	const tasks = getResearchPlanTasks(state, planId);
	const stopped = tasks.filter(
		(task) => task.status === "running" || task.status === "blocked" || task.status === "failed",
	);
	const retryable = stopped.filter((task) => !isReviewRejectedTask(task));
	const hasOtherWork = retryable.length > 0 || tasks.some((task) => task.status === "pending");
	const toRetry = hasOtherWork ? retryable : stopped;
	let nextState = state;
	for (const task of toRetry) {
		nextState = updateResearchPlanTask(nextState, {
			taskId: task.id,
			status: "pending",
			now,
			actor,
		});
	}
	return updateResearchPlan(nextState, {
		planId,
		status: "active",
		clearCurrentTaskId: true,
		now,
		actor,
	});
}

function isReviewRejectedTask(task: ResearchPlanTaskRecord): boolean {
	return task.status === "blocked" && task.reviewOutcome === "rejected";
}

/**
 * A task that can never run again within this plan: done, cancelled, or rejected by the
 * independent review. A plan whose remaining tasks are all rejected has no runnable work left, so
 * treating rejections as terminal lets the plan finish and the agenda derive repair work from the
 * durably recorded concerns, instead of freezing the plan on a step that would fail review again.
 */
function isTerminalPlanTask(task: ResearchPlanTaskRecord): boolean {
	return task.status === "completed" || task.status === "cancelled" || isReviewRejectedTask(task);
}

/** A plan completes when every task is terminal and at least one actually finished or was cancelled. */
function planTasksSettled(tasks: readonly ResearchPlanTaskRecord[]): boolean {
	return (
		tasks.length > 0 &&
		tasks.every((task) => isTerminalPlanTask(task)) &&
		tasks.some((task) => task.status === "completed" || task.status === "cancelled")
	);
}

/**
 * The only task kinds that may run alongside another task. Everything else — synthesis, critic,
 * revise-conjecture, export — reads or rewrites cross-path project state and always runs alone.
 */
const PARALLELIZABLE_RESEARCH_PLAN_TASK_KINDS: ReadonlySet<ResearchPlanTaskKind> = new Set([
	"literature-search",
	"source-refresh",
	"computation",
	"proof-attempt",
	"refutation-attempt",
]);

/** Whether a pending task is even a candidate for concurrent execution (kind and pinned path). */
function isParallelizableResearchPlanTask(task: ResearchPlanTaskRecord): boolean {
	return (
		task.status === "pending" && task.pathId !== undefined && PARALLELIZABLE_RESEARCH_PLAN_TASK_KINDS.has(task.kind)
	);
}

/**
 * Select the group of plan tasks the next bounded step may run concurrently. The group always
 * starts with the plan's next runnable task (so sequence order is never reordered); later pending
 * tasks join greedily, in plan sequence order, only when they are independent of EVERY task
 * already in the group: both tasks carry a defined `pathId` and the pathIds differ, and both kinds
 * are workstream-backed ({@link PARALLELIZABLE_RESEARCH_PLAN_TASK_KINDS}). Blocked and
 * review-rejected tasks are never selected (only pending tasks are considered). Deterministic and
 * pure: same state in, same group out. A limit of 1 (or a non-parallelizable head task) yields the
 * exact single task the sequential runner would have picked.
 */
export function selectParallelResearchTaskGroup(
	state: CoMathProjectState,
	plan: ResearchPlanRecord,
	limit: number,
): ResearchPlanTaskRecord[] {
	const first = getNextRunnableResearchPlanTask(state, plan.id);
	if (!first) {
		return [];
	}
	const group = [first];
	if (limit <= 1 || !isParallelizableResearchPlanTask(first)) {
		return group;
	}
	const laterPending = getResearchPlanTasks(state, plan.id).filter(
		(task) => task.status === "pending" && task.id !== first.id,
	);
	for (const candidate of laterPending) {
		if (group.length >= limit) {
			break;
		}
		if (!isParallelizableResearchPlanTask(candidate)) {
			continue;
		}
		if (group.some((member) => member.pathId === candidate.pathId)) {
			continue;
		}
		group.push(candidate);
	}
	return group;
}

export class CoMathResearchPlanRunner {
	private readonly statePath: string;
	private readonly notify: CoMathResearchRunnerNotify;
	private readonly researchRunner: CoMathResearchRunner;
	private readonly researchModelExecutor: ResearchWorkstreamModelExecutor | undefined;
	private readonly researchDirectorExecutor: ResearchWorkstreamModelExecutor | undefined;
	private readonly computationalExecutor: ComputationalExecutor | undefined;
	private readonly onResearchPhaseActivity: CoMathResearchPhaseActivityNotify | undefined;
	private readonly stateLock: CoMathStateLock;
	/** In-process task executions per plan id, so stale-plan reconciliation never pauses live work. */
	private readonly executingPlanTaskCounts = new Map<string, number>();

	constructor(options: CoMathResearchPlanRunnerOptions) {
		this.statePath = options.statePath;
		this.notify = options.notify;
		this.researchRunner = options.researchRunner;
		this.researchModelExecutor = options.researchModelExecutor;
		this.researchDirectorExecutor = options.researchDirectorExecutor;
		this.computationalExecutor = options.computationalExecutor;
		this.stateLock = options.stateLock ?? new CoMathStateLock();
		this.onResearchPhaseActivity = options.onResearchPhaseActivity;
	}

	/**
	 * Whether plan tasks may execute concurrently at all. Without a research model executor every
	 * task degrades to the deterministic fallback workstream, and degraded runs must stay exactly
	 * reproducible, so they are forced back to strictly sequential execution regardless of any
	 * configured parallelism.
	 */
	supportsParallelPlanTaskExecution(): boolean {
		return this.researchModelExecutor !== undefined;
	}

	private beginPlanTaskExecution(planId: string): void {
		this.executingPlanTaskCounts.set(planId, (this.executingPlanTaskCounts.get(planId) ?? 0) + 1);
	}

	private endPlanTaskExecution(planId: string): void {
		const count = this.executingPlanTaskCounts.get(planId) ?? 0;
		if (count <= 1) {
			this.executingPlanTaskCounts.delete(planId);
		} else {
			this.executingPlanTaskCounts.set(planId, count - 1);
		}
	}

	/**
	 * Show a footer status for the duration of a research phase that runs outside a workstream run,
	 * so the user always has a live "still working" signal during model calls the run indicator does
	 * not cover. Purely cosmetic: failures are swallowed and never affect the phase itself.
	 */
	private async withPhaseActivity<T>(
		activityId: string,
		phase: CoMathResearchActivityPhase,
		work: () => Promise<T>,
	): Promise<T> {
		try {
			await this.onResearchPhaseActivity?.({
				kind: "start",
				activityId,
				status: formatCoMathResearchPhaseActivityStatus(phase),
			});
		} catch {
			// UI status updates are best-effort and must not affect research execution.
		}
		try {
			return await work();
		} finally {
			try {
				await this.onResearchPhaseActivity?.({ kind: "end", activityId });
			} catch {
				// UI status updates are best-effort and must not affect research execution.
			}
		}
	}

	/**
	 * Pause plans whose "running" task belongs to a previous process. Never resumes anything: the
	 * user must explicitly ask to resume, and the retry then restarts the task from its boundary.
	 */
	async reconcileStaleResearchPlans(state: CoMathProjectState): Promise<CoMathProjectState> {
		return await this.stateLock.run(async () => {
			const fresh = (await loadProjectState(this.statePath)) ?? state;
			let nextState = fresh;
			let changed = false;
			for (const plan of fresh.researchPlans) {
				if (plan.status !== "active" || this.executingPlanTaskCounts.has(plan.id)) {
					continue;
				}
				const runningTask = getResearchPlanTasks(fresh, plan.id).find((task) => task.status === "running");
				if (!runningTask) {
					continue;
				}
				const now = new Date().toISOString();
				nextState = updateResearchPlanTask(nextState, {
					taskId: runningTask.id,
					status: "failed",
					failureReason: STALE_RESEARCH_PLAN_TASK_REASON,
					now,
					actor: "system",
				});
				nextState = updateResearchPlan(nextState, {
					planId: plan.id,
					status: "paused",
					pauseReason: STALE_RESEARCH_PLAN_TASK_REASON,
					clearCurrentTaskId: true,
					now,
					actor: "system",
				});
				changed = true;
			}
			if (changed) {
				await saveProjectState(this.statePath, nextState);
			}
			return nextState;
		});
	}

	/**
	 * Return the plan an explicit "work/execute/continue" request should run: the active plan, a
	 * paused plan (resumed, since the request is explicit user consent), or a fresh plan created
	 * from current state. Persists any change before returning.
	 */
	async ensureExecutablePlan(): Promise<{ state: CoMathProjectState; plan: ResearchPlanRecord } | undefined> {
		const state = await loadProjectState(this.statePath);
		if (!state) {
			return undefined;
		}
		const active = getActiveResearchPlan(state);
		if (active) {
			return { state, plan: active };
		}
		const paused = getPausedResearchPlan(state);
		if (paused) {
			const resumedState = await this.stateLock.run(async () => {
				const fresh = (await loadProjectState(this.statePath)) ?? state;
				const next = resumeResearchPlan(fresh, paused.id, new Date().toISOString());
				await saveProjectState(this.statePath, next);
				return next;
			});
			const plan = resumedState.researchPlans.find((candidate) => candidate.id === paused.id) ?? paused;
			return { state: resumedState, plan };
		}
		const created = await this.withPhaseActivity("research-plan-proposal", "planning", () =>
			proposeResearchPlan(state, {
				...(this.researchDirectorExecutor ? { executor: this.researchDirectorExecutor } : {}),
				now: new Date().toISOString(),
				actor: "system",
			}),
		);
		// Plan proposal only ever runs between bounded steps (no task in flight), so committing the
		// proposal's snapshot-derived state under the lock cannot drop concurrent records.
		await this.stateLock.run(() => saveProjectState(this.statePath, created.state));
		await this.notify(
			formatResearchPlanCreated({
				plan: created.plan,
				tasks: getResearchPlanTasks(created.state, created.plan.id),
			}),
		);
		return { state: created.state, plan: created.plan };
	}

	/**
	 * Execute exactly one plan task: persist the task as running, run it, then persist the outcome.
	 * A blocked or failed task pauses the plan — except a review-rejected task with other pending
	 * work, which blocks only itself. A completed task records durable linkage to the run, report,
	 * sources, claim supports, computation outputs, and evidence entries it produced.
	 */
	async executeNextPlanTask(
		planId: string,
		options: ResearchPlanTaskExecutionOptions = {},
	): Promise<ResearchPlanTaskExecutionOutcome> {
		this.beginPlanTaskExecution(planId);
		try {
			const claim = await this.stateLock.run(() => this.claimPlanTaskHoldingLock(planId, undefined));
			if (claim.kind === "unavailable") {
				return { kind: "not-runnable", reason: claim.reason };
			}
			if (claim.kind === "no-task") {
				return await this.finishPlanWithoutRunnableTask(claim.plan);
			}
			return await this.runClaimedPlanTask(planId, claim, options, { deferPlanAmendment: false });
		} finally {
			this.endPlanTaskExecution(planId);
		}
	}

	/**
	 * Execute a preselected group of independent plan tasks concurrently. Callers pick the group
	 * with {@link selectParallelResearchTaskGroup}; each member keeps the exact per-task semantics
	 * of {@link executeNextPlanTask} — its own running/finished commits, its own review, its own
	 * outcome — and one member failing or being rejected never cancels its siblings
	 * (`Promise.allSettled`). Model and computation work overlaps; every durable commit is
	 * serialized through the shared state lock. Outcomes are returned in group (plan sequence)
	 * order. The director's post-task plan amendment is deferred until the whole group settles, so
	 * it sees every member's result and cannot race a sibling's commit.
	 */
	async executePlanTaskGroup(
		planId: string,
		requests: readonly ResearchPlanTaskGroupRequest[],
	): Promise<ResearchPlanTaskExecutionOutcome[]> {
		if (requests.length === 0) {
			return [];
		}
		this.beginPlanTaskExecution(planId);
		try {
			const settled = await Promise.allSettled(
				requests.map(async (request) => {
					const claim = await this.stateLock.run(() => this.claimPlanTaskHoldingLock(planId, request.taskId));
					if (claim.kind !== "claimed") {
						const reason =
							claim.kind === "unavailable" ? claim.reason : "The planned task is no longer ready to run.";
						return { kind: "not-runnable", reason } satisfies ResearchPlanTaskExecutionOutcome;
					}
					return await this.runClaimedPlanTask(planId, claim, request.options ?? {}, {
						deferPlanAmendment: true,
					});
				}),
			);
			const outcomes = settled.map(
				(entry): ResearchPlanTaskExecutionOutcome =>
					entry.status === "fulfilled"
						? entry.value
						: { kind: "not-runnable", reason: safeErrorMessage(entry.reason) },
			);
			// One deferred amendment for the group: after the last completed task, unless the plan
			// itself completed (a completed plan is never amended).
			const planCompleted = outcomes.some((outcome) => outcome.kind === "completed" && outcome.planCompleted);
			const lastCompleted = [...outcomes].reverse().find((outcome) => outcome.kind === "completed");
			if (lastCompleted?.kind === "completed" && !planCompleted) {
				await this.maybeAmendPlanAfterTask(planId, lastCompleted.task);
			}
			return outcomes;
		} finally {
			this.endPlanTaskExecution(planId);
		}
	}

	/**
	 * Claim one plan task as running inside the caller's lock section: reload fresh state, verify
	 * the plan is still active and the task still pending, persist the running transition. With no
	 * `taskId` the plan's next runnable task is claimed (the sequential path).
	 */
	private async claimPlanTaskHoldingLock(
		planId: string,
		taskId: string | undefined,
	): Promise<
		| { kind: "unavailable"; reason: string }
		| { kind: "no-task"; plan: ResearchPlanRecord }
		| {
				kind: "claimed";
				plan: ResearchPlanRecord;
				tasks: ResearchPlanTaskRecord[];
				task: ResearchPlanTaskRecord;
		  }
	> {
		const state = await loadProjectState(this.statePath);
		const plan = state?.researchPlans.find((candidate) => candidate.id === planId);
		if (!state || !plan) {
			return { kind: "unavailable", reason: "The research plan could not be loaded." };
		}
		if (plan.status !== "active") {
			return { kind: "unavailable", reason: `The research plan is ${plan.status}.` };
		}
		const task = taskId
			? getResearchPlanTasks(state, planId).find(
					(candidate) => candidate.id === taskId && candidate.status === "pending",
				)
			: getNextRunnableResearchPlanTask(state, planId);
		if (!task) {
			return taskId
				? { kind: "unavailable", reason: "The planned task is no longer ready to run." }
				: { kind: "no-task", plan };
		}
		const now = new Date().toISOString();
		let runningState = updateResearchPlanTask(state, {
			taskId: task.id,
			status: "running",
			startedAt: now,
			now,
			actor: "system",
		});
		runningState = updateResearchPlan(runningState, {
			planId,
			currentTaskId: task.id,
			...(plan.startedAt ? {} : { startedAt: now }),
			now,
			actor: "system",
		});
		await saveProjectState(this.statePath, runningState);
		const tasks = getResearchPlanTasks(runningState, planId);
		return { kind: "claimed", plan, tasks, task: tasks.find((candidate) => candidate.id === task.id) ?? task };
	}

	/** Run one already-claimed task to its durable outcome; the claim happened under the lock. */
	private async runClaimedPlanTask(
		planId: string,
		claim: { plan: ResearchPlanRecord; tasks: ResearchPlanTaskRecord[]; task: ResearchPlanTaskRecord },
		options: ResearchPlanTaskExecutionOptions,
		finalization: { deferPlanAmendment: boolean },
	): Promise<ResearchPlanTaskExecutionOutcome> {
		await this.notify(formatResearchPlanTaskStarted({ plan: claim.plan, tasks: claim.tasks, task: claim.task }));
		let result: PlanTaskExecutionResult;
		try {
			result = await this.executePlanTaskByKind(claim.task, options);
		} catch (error: unknown) {
			result = { status: "failed", reason: safeErrorMessage(error) };
		}
		return await this.finalizePlanTask(planId, claim.task.id, result, finalization);
	}

	private async executePlanTaskByKind(
		task: ResearchPlanTaskRecord,
		options: ResearchPlanTaskExecutionOptions,
	): Promise<PlanTaskExecutionResult> {
		const state = await loadProjectState(this.statePath);
		if (!state) {
			return { status: "failed", reason: "The research workspace could not be loaded." };
		}
		if (
			task.kind === "literature-search" ||
			task.kind === "source-refresh" ||
			task.kind === "computation" ||
			task.kind === "proof-attempt" ||
			task.kind === "refutation-attempt"
		) {
			return await this.executeWorkstreamBackedTask(state, task, options);
		}
		if (task.kind === "critic") {
			return await this.executeCriticTask(state);
		}
		if (task.kind === "revise-conjecture") {
			return await this.executeConjectureRevisionTask(task);
		}
		if (task.kind === "synthesis") {
			return await this.executeSynthesisTask(state);
		}
		return await this.executeExportTask(state);
	}

	private async executeWorkstreamBackedTask(
		state: CoMathProjectState,
		task: ResearchPlanTaskRecord,
		options: ResearchPlanTaskExecutionOptions,
	): Promise<PlanTaskExecutionResult> {
		const path = resolvePlanTaskPath(state, task);
		if (!path) {
			return { status: "blocked", reason: "No research direction in this workspace matches this task." };
		}
		const taskBrief = buildPlanTaskBrief(state, task, path);
		const runId = await this.researchRunner.runBoundedResearchWorkstreamStep(state, path, {
			...options,
			taskId: task.id,
			...(taskBrief ? { taskBrief } : {}),
			taskKind: task.kind,
		});
		const after = await loadProjectState(this.statePath);
		const run = after?.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
		if (!after || !run) {
			return { status: "failed", reason: "The research step did not record a durable result." };
		}
		if (run.status === "completed") {
			const report = run.finalReportId
				? after.researchReports.find((candidate) => candidate.id === run.finalReportId)
				: undefined;
			const skeptic = report ? await this.runSkepticGateForTask(after, task, report.id, runId) : undefined;
			const latest = skeptic?.state ?? after;
			// Filtering by this task's report id keeps the linkage exact even when a concurrent
			// sibling task appended its own evidence entries in the meantime.
			const evidenceEntryIds = report
				? latest.researchEvidenceBoard.filter((entry) => entry.reportId === report.id).map((entry) => entry.id)
				: [];
			await this.maybeAnnounceRefutation(latest, task, evidenceEntryIds);
			// The obligation fold is pure, so it commits under the lock against freshly loaded state:
			// a sibling's records saved during this task's run or review stay intact.
			await this.stateLock.run(async () => {
				const fresh = (await loadProjectState(this.statePath)) ?? latest;
				const withObligations = applyCompletedTaskToObligations(fresh, {
					task,
					...(report ? { reportId: report.id } : {}),
					runUsedFallback: run.usedFallback === true,
					modelBacked: this.researchModelExecutor !== undefined,
					newEvidenceEntryIds: evidenceEntryIds,
					...(skeptic
						? {
								skeptic: {
									concerns: skeptic.concerns,
									counterexampleFound: skeptic.counterexampleFound,
									independentCheckStatus: skeptic.independentCheckStatus,
								},
								reviewEvidenceEntryIds: skeptic.evidenceEntryIds,
							}
						: {}),
					now: new Date().toISOString(),
				});
				if (withObligations !== fresh) {
					await saveProjectState(this.statePath, withObligations);
				}
			});
			// An explicitly rejected step is not a completed step: the review's concerns are already
			// durable (gaps, scrutiny notes). The task blocks, but keeps its linkage to what the run
			// produced so the step's trail survives the rejection.
			if (skeptic?.verdict === "rejected") {
				return {
					status: "blocked",
					reason: `The independent review did not accept this step as completed${
						skeptic.concerns[0] ? `: ${skeptic.concerns[0]}` : "."
					}`,
					runId,
					reviewRejected: true,
					...(report
						? {
								reportId: report.id,
								sourceIds: report.sourceIds,
								claimSupportIds: report.claimSupportIds,
								computationalArtifactIds: [
									...report.computationalArtifactIds,
									...skeptic.computationalArtifactIds,
								],
								evidenceEntryIds,
							}
						: {}),
				};
			}
			return {
				status: "completed",
				runId,
				...(skeptic
					? { reviewOutcome: skeptic.verdict === "accepted" ? "accepted" : "completed-with-concerns" }
					: {}),
				...(report
					? {
							reportId: report.id,
							sourceIds: report.sourceIds,
							claimSupportIds: report.claimSupportIds,
							computationalArtifactIds: [
								...report.computationalArtifactIds,
								...(skeptic?.computationalArtifactIds ?? []),
							],
							evidenceEntryIds,
							// The review's own artifacts must not count as the task's mathematical output.
							reviewComputationalArtifactIds: skeptic?.computationalArtifactIds ?? [],
							reviewEvidenceEntryIds: skeptic?.evidenceEntryIds ?? [],
						}
					: {}),
			};
		}
		if (run.status === "blocked") {
			return {
				status: "blocked",
				reason: run.failureReason ?? "The research step reported a blocker.",
				runId,
			};
		}
		return {
			status: "failed",
			reason: run.failureReason ?? "The research step stopped before finishing.",
			runId,
		};
	}

	/**
	 * Independent skeptic review of a completed workstream-backed task. Best-effort: verification
	 * failures never fail the task; they simply leave no skeptic record. Returns the persisted
	 * state and the computation record ids for task linkage, or `undefined` when disabled.
	 *
	 * The review's model call and bounded check run OUTSIDE the state lock (they may take a long
	 * time and must not stall a concurrent sibling's commits); only the pure fold of its durable
	 * records is committed under the lock, against freshly loaded state.
	 */
	private async runSkepticGateForTask(
		state: CoMathProjectState,
		task: ResearchPlanTaskRecord,
		reportId: string,
		runId: string,
	): Promise<
		| {
				state: CoMathProjectState;
				verdict: SkepticVerdict;
				computationalArtifactIds: string[];
				evidenceEntryIds: string[];
				concerns: string[];
				counterexampleFound: boolean;
				independentCheckStatus: SkepticIndependentCheckStatus;
		  }
		| undefined
	> {
		const directorExecutor = this.researchDirectorExecutor;
		if (!directorExecutor) {
			return undefined;
		}
		try {
			const relative = `.pi/co-math/artifacts/${runId}-skeptic`;
			const projectRoot = nodePath.dirname(nodePath.dirname(nodePath.dirname(this.statePath)));
			const prepared = await this.withPhaseActivity(`independent-review-${runId}`, "independent-review", () =>
				prepareSkepticGate({
					state,
					task,
					reportId,
					runId,
					executor: directorExecutor,
					...(this.computationalExecutor ? { computationalExecutor: this.computationalExecutor } : {}),
					artifactDirectory: relative,
					workingDirectory: nodePath.join(projectRoot, relative),
					now: new Date().toISOString(),
				}),
			);
			const gate = await this.stateLock.run(async () => {
				const fresh = (await loadProjectState(this.statePath)) ?? state;
				const folded = prepared.fold(fresh);
				if (folded.state !== fresh) {
					await saveProjectState(this.statePath, folded.state);
				}
				return folded;
			});
			if (gate.concerns.length > 0 || gate.counterexampleFound) {
				await this.notify(
					formatSkepticReviewCompleted({
						concerns: gate.concerns,
						counterexampleFound: gate.counterexampleFound,
					}),
					gate.counterexampleFound ? "warning" : "info",
				);
			}
			return {
				state: gate.state,
				verdict: gate.verdict,
				computationalArtifactIds: gate.computationalArtifactIds,
				evidenceEntryIds: [...gate.evidenceEntryIds],
				concerns: [...gate.concerns],
				counterexampleFound: gate.counterexampleFound,
				independentCheckStatus: gate.independentCheckStatus,
			};
		} catch {
			return undefined;
		}
	}

	/**
	 * Announce only when a completed task's evidence explicitly refutes the root statement. A local
	 * counterexample remains visible in the task review but must not be presented as a refutation of
	 * the project conjecture.
	 */
	private async maybeAnnounceRefutation(
		state: CoMathProjectState,
		task: ResearchPlanTaskRecord,
		evidenceEntryIds: readonly string[],
	): Promise<void> {
		const entryIds = new Set(evidenceEntryIds);
		const conflicting = state.researchEvidenceBoard.find(
			(entry) =>
				entryIds.has(entry.id) &&
				entry.classification === "conflicting" &&
				evidenceDirectlyRefutesStatement(entry, state.rootQuestion),
		);
		if (!conflicting) {
			return;
		}
		const revisionPlanned = getResearchPlanTasks(state, task.planId).some(
			(candidate) => candidate.kind === "revise-conjecture" && candidate.status === "pending",
		);
		await this.notify(
			formatConjectureRefuted({
				...(conflicting ? { evidenceHint: `${conflicting.claim} — ${conflicting.rationale}` } : {}),
				revisionPlanned,
			}),
			"warning",
		);
	}

	private async executeConjectureRevisionTask(task: ResearchPlanTaskRecord): Promise<PlanTaskExecutionResult> {
		const state = await loadProjectState(this.statePath);
		if (!state) {
			return { status: "failed", reason: "The research workspace could not be loaded." };
		}
		const result = await this.withPhaseActivity(`statement-revision-${task.id}`, "revision", () =>
			runConjectureRevisionTask(state, {
				...(this.researchDirectorExecutor ? { executor: this.researchDirectorExecutor } : {}),
				task,
				now: new Date().toISOString(),
			}),
		);
		if (result.outcome === "blocked") {
			return { status: "blocked", reason: result.blockedReason ?? "The statement could not be revised." };
		}
		// Revision tasks always run alone (never in a parallel group), so committing the revision's
		// snapshot-derived state under the lock is safe.
		const withObligations = await this.stateLock.run(async () => {
			const next = applyConjectureRevisionToObligations(result.state, {
				task,
				...(result.parentEntryId ? { parentEntryId: result.parentEntryId } : {}),
				revisedEntryIds: result.revisedEntryIds,
				now: new Date().toISOString(),
			});
			await saveProjectState(this.statePath, next);
			return next;
		});
		await this.notify(formatConjectureRevised({ state: withObligations, revisedEntryIds: result.revisedEntryIds }));
		return {
			status: "completed",
			evidenceEntryIds: [...(result.parentEntryId ? [result.parentEntryId] : []), ...result.revisedEntryIds],
		};
	}

	private async executeCriticTask(state: CoMathProjectState): Promise<PlanTaskExecutionResult> {
		const report = state.researchReports.at(-1);
		if (!report) {
			return { status: "blocked", reason: "There is no research finding to review yet." };
		}
		const concern = report.gaps[0] ?? report.criticisms[0];
		const now = new Date().toISOString();
		if (concern) {
			await this.stateLock.run(async () => {
				const fresh = (await loadProjectState(this.statePath)) ?? state;
				const nextState = addMarginNote(fresh, {
					id: `margin-note-${fresh.marginNotes.length + 1}`,
					kind: "scrutiny",
					subjectId: report.pathId,
					...(report.workingPaperSectionId ? { sectionId: report.workingPaperSectionId } : {}),
					message: `Plan review of the latest findings: ${concern}`,
					now,
					actor: "reviewer",
				});
				await saveProjectState(this.statePath, nextState);
			});
		}
		return { status: "completed", reportId: report.id };
	}

	private async executeSynthesisTask(state: CoMathProjectState): Promise<PlanTaskExecutionResult> {
		const now = new Date().toISOString();
		// The synthesis model call runs outside the lock; only the pure fold of its report commits.
		const result = await this.withPhaseActivity("research-synthesis", "synthesis", () =>
			runResearchCoordinatorSynthesis({ state, executor: this.researchModelExecutor, now }),
		);
		const folded = await this.stateLock.run(async () => {
			const fresh = (await loadProjectState(this.statePath)) ?? state;
			const next = foldResearchCoordinatorSynthesisReport(fresh, result.report, now);
			// The canonical "state of the problem" document is a pure fold of durable state, built on
			// the state that already includes this synthesis so it reflects the final records. It lives
			// beside the coordinator's "what next" advisory, never replacing it.
			const withStateOfProblem = upsertWorkingPaperSectionByTitle(next.state, {
				title: STATE_OF_PROBLEM_SECTION_TITLE,
				body: buildStateOfProblemSectionBody(next.state),
				now,
				actor: "synthesizer",
			});
			await saveProjectState(this.statePath, withStateOfProblem);
			return { state: withStateOfProblem, ...(next.reportId ? { reportId: next.reportId } : {}) };
		});
		await this.notify(formatStateOfProblemUpdated());
		return { status: "completed", ...(folded.reportId ? { reportId: folded.reportId } : {}) };
	}

	private async executeExportTask(state: CoMathProjectState): Promise<PlanTaskExecutionResult> {
		if (state.workingPaperSections.length === 0) {
			return { status: "blocked", reason: "There is nothing in the working paper to export yet." };
		}
		const relativePath = ".pi/co-math/exports/working-paper.md";
		const projectRoot = nodePath.dirname(nodePath.dirname(nodePath.dirname(this.statePath)));
		const absolutePath = nodePath.join(projectRoot, relativePath);
		// Export tasks always run alone; the exported file and the recorded artifact commit together
		// under the lock so the record can never describe a file another commit replaced.
		await this.stateLock.run(async () => {
			const fresh = (await loadProjectState(this.statePath)) ?? state;
			// The reader's entry point is the canonical "state of the problem" summary, so the export
			// leads with it; sections are otherwise stored (and kept) in creation order, which would
			// bury it after the per-path sections that predate it.
			const orderedSections = [
				...fresh.workingPaperSections.filter((section) => section.title === STATE_OF_PROBLEM_SECTION_TITLE),
				...fresh.workingPaperSections.filter((section) => section.title !== STATE_OF_PROBLEM_SECTION_TITLE),
			];
			const body = [
				`# Working paper: ${fresh.title}`,
				"",
				...orderedSections.flatMap((section) => [`## ${section.title}`, "", section.body, ""]),
			].join("\n");
			await mkdir(nodePath.dirname(absolutePath), { recursive: true });
			await writeFile(absolutePath, body, "utf8");
			const now = new Date().toISOString();
			const nextState = recordWorkingPaperExport(fresh, {
				artifactId: `artifact-${fresh.artifacts.length + 1}`,
				path: relativePath,
				title: "Living working paper export",
				summary: `Exported ${fresh.workingPaperSections.length} working-paper sections.`,
				now,
				actor: "system",
			});
			await saveProjectState(this.statePath, nextState);
		});
		return { status: "completed" };
	}

	private async finalizePlanTask(
		planId: string,
		taskId: string,
		result: PlanTaskExecutionResult,
		finalization: { deferPlanAmendment: boolean },
	): Promise<ResearchPlanTaskExecutionOutcome> {
		// All state mutation happens in this locked commit; notifications and the (model-backed)
		// plan amendment run after the lock is released.
		const committed = await this.stateLock.run(() => this.commitPlanTaskResultHoldingLock(planId, taskId, result));
		if (committed.kind === "unavailable") {
			return { kind: "not-runnable", reason: committed.reason };
		}
		const { plan, tasks, task } = committed;
		if (committed.kind === "completed") {
			await this.notify(formatResearchPlanTaskCompleted({ plan, tasks, task }));
			if (committed.planCompleted) {
				await this.notify(formatResearchPlanCompleted({ plan, tasks }));
			} else if (!finalization.deferPlanAmendment) {
				await this.maybeAmendPlanAfterTask(planId, task);
			}
			return {
				kind: "completed",
				task,
				...(result.runId ? { runId: result.runId } : {}),
				planCompleted: committed.planCompleted,
			};
		}
		const reason = result.status === "completed" ? "" : result.reason;
		const runId = result.runId;
		if (committed.failed) {
			await this.notify(formatResearchPlanPaused({ plan, tasks, reason }), "warning");
			return { kind: "failed", task, reason };
		}
		if (committed.planContinues) {
			await this.notify(formatResearchPlanTaskRejectedContinuing({ plan, tasks, task }), "warning");
			return { kind: "blocked", task, reason, ...(runId ? { runId } : {}), planPaused: false };
		}
		await this.notify(formatResearchPlanBlocked({ plan, tasks, task }), "warning");
		return { kind: "blocked", task, reason, ...(runId ? { runId } : {}), planPaused: true };
	}

	/** Locked commit of one task's outcome; pure transform of freshly loaded state plus the save. */
	private async commitPlanTaskResultHoldingLock(
		planId: string,
		taskId: string,
		result: PlanTaskExecutionResult,
	): Promise<
		| { kind: "unavailable"; reason: string }
		| {
				kind: "completed";
				plan: ResearchPlanRecord;
				tasks: ResearchPlanTaskRecord[];
				task: ResearchPlanTaskRecord;
				planCompleted: boolean;
		  }
		| {
				kind: "stopped";
				plan: ResearchPlanRecord;
				tasks: ResearchPlanTaskRecord[];
				task: ResearchPlanTaskRecord;
				failed: boolean;
				planContinues: boolean;
		  }
	> {
		const state = await loadProjectState(this.statePath);
		if (!state) {
			return { kind: "unavailable", reason: "The research workspace could not be loaded." };
		}
		const now = new Date().toISOString();
		if (result.status === "completed") {
			const completedTask = state.researchPlanTasks.find((candidate) => candidate.id === taskId);
			// Progress classification counts only the task's own output: records the independent
			// review created (its check scripts, its concern entries) are review provenance, not the
			// step's mathematical content.
			const reviewComputationIds = new Set(result.reviewComputationalArtifactIds ?? []);
			const reviewEvidenceIds = new Set(result.reviewEvidenceEntryIds ?? []);
			const progressKind = completedTask
				? classifyResearchTaskProgress(state, {
						kind: completedTask.kind,
						...(result.reportId ? { reportId: result.reportId } : {}),
						evidenceEntryIds: (result.evidenceEntryIds ?? []).filter((id) => !reviewEvidenceIds.has(id)),
						computationalArtifactIds: (result.computationalArtifactIds ?? []).filter(
							(id) => !reviewComputationIds.has(id),
						),
					})
				: undefined;
			let nextState = updateResearchPlanTask(state, {
				taskId,
				status: "completed",
				completedAt: now,
				...(result.runId ? { runId: result.runId } : {}),
				...(result.reportId ? { reportId: result.reportId } : {}),
				...(result.sourceIds ? { addSourceIds: result.sourceIds } : {}),
				...(result.claimSupportIds ? { addClaimSupportIds: result.claimSupportIds } : {}),
				...(result.computationalArtifactIds
					? { addComputationalArtifactIds: result.computationalArtifactIds }
					: {}),
				...(result.evidenceEntryIds ? { addEvidenceEntryIds: result.evidenceEntryIds } : {}),
				...(progressKind ? { progressKind } : {}),
				...(result.reviewOutcome ? { reviewOutcome: result.reviewOutcome } : {}),
				now,
				actor: "system",
			});
			nextState = updateResearchPlan(nextState, { planId, clearCurrentTaskId: true, now, actor: "system" });
			const tasks = getResearchPlanTasks(nextState, planId);
			// A concurrently running sibling is not terminal, so a group can only complete the plan
			// once its very last member commits.
			const planCompleted = planTasksSettled(tasks);
			if (planCompleted) {
				nextState = updateResearchPlan(nextState, {
					planId,
					status: "completed",
					completedAt: now,
					now,
					actor: "system",
				});
			}
			await saveProjectState(this.statePath, nextState);
			const finalTasks = getResearchPlanTasks(nextState, planId);
			const task = finalTasks.find((candidate) => candidate.id === taskId);
			const plan = nextState.researchPlans.find((candidate) => candidate.id === planId);
			if (!task || !plan) {
				return { kind: "unavailable", reason: "The research plan could not be loaded." };
			}
			return { kind: "completed", plan, tasks: finalTasks, task, planCompleted };
		}
		const failed = result.status === "failed";
		const reviewRejected = result.status === "blocked" && result.reviewRejected === true;
		let nextState = updateResearchPlanTask(state, {
			taskId,
			status: failed ? "failed" : "blocked",
			...(result.runId ? { runId: result.runId } : {}),
			...(failed ? { failureReason: result.reason } : { blockedReason: result.reason }),
			...(result.status === "blocked"
				? {
						...(result.reportId ? { reportId: result.reportId } : {}),
						...(result.sourceIds ? { addSourceIds: result.sourceIds } : {}),
						...(result.claimSupportIds ? { addClaimSupportIds: result.claimSupportIds } : {}),
						...(result.computationalArtifactIds
							? { addComputationalArtifactIds: result.computationalArtifactIds }
							: {}),
						...(result.evidenceEntryIds ? { addEvidenceEntryIds: result.evidenceEntryIds } : {}),
						...(reviewRejected ? { reviewOutcome: "rejected" as const } : {}),
					}
				: {}),
			now,
			actor: "system",
		});
		// A review rejection blocks only the rejected step: while another task is still pending — or
		// a concurrent sibling is still running — the plan stays active and that work proceeds, since
		// pending work is usually exactly what the review's diagnosis calls for. Every other blocker
		// pauses the plan for an explicit resume, and so does a rejection that leaves nothing else
		// runnable. (In sequential operation no sibling can be running here, so this matches the old
		// "next runnable task exists" check exactly.)
		const remainingTasks = getResearchPlanTasks(nextState, planId);
		const planContinues =
			reviewRejected &&
			remainingTasks.some((candidate) => candidate.status === "pending" || candidate.status === "running");
		nextState = updateResearchPlan(nextState, {
			planId,
			...(planContinues ? {} : { status: "paused", pauseReason: result.reason }),
			clearCurrentTaskId: true,
			now,
			actor: "system",
		});
		await saveProjectState(this.statePath, nextState);
		const tasks = getResearchPlanTasks(nextState, planId);
		const task = tasks.find((candidate) => candidate.id === taskId);
		const plan = nextState.researchPlans.find((candidate) => candidate.id === planId);
		if (!task || !plan) {
			return { kind: "unavailable", reason: "The research plan could not be loaded." };
		}
		return { kind: "stopped", plan, tasks, task, failed, planContinues };
	}

	/**
	 * Give the director one bounded chance to amend the pending tail of the plan after a completed
	 * task. No-op without a director executor or on any failure; amendments are persisted and
	 * announced so direction changes are always visible and auditable.
	 */
	private async maybeAmendPlanAfterTask(planId: string, completedTask: ResearchPlanTaskRecord): Promise<void> {
		const directorExecutor = this.researchDirectorExecutor;
		if (!directorExecutor) {
			return;
		}
		try {
			const state = await loadProjectState(this.statePath);
			if (!state) {
				return;
			}
			const amendment = await this.withPhaseActivity(`plan-amendment-${completedTask.id}`, "plan-update", () =>
				amendResearchPlanAfterTask(state, planId, {
					executor: directorExecutor,
					completedTask,
					now: new Date().toISOString(),
				}),
			);
			if (!amendment.amended) {
				return;
			}
			// Amendments only run at task/group boundaries (nothing else in flight), so committing the
			// amendment's snapshot-derived state under the lock cannot drop concurrent records.
			await this.stateLock.run(() => saveProjectState(this.statePath, amendment.state));
			const plan = amendment.state.researchPlans.find((candidate) => candidate.id === planId);
			if (plan) {
				await this.notify(
					formatResearchPlanAmended({
						plan,
						tasks: getResearchPlanTasks(amendment.state, planId),
						addedTitles: amendment.addedTitles,
						cancelledTitles: amendment.cancelledTitles,
						...(amendment.reason ? { reason: amendment.reason } : {}),
					}),
				);
			}
		} catch {
			// A failed amendment leaves the plan as written; execution continues unchanged.
		}
	}

	private async finishPlanWithoutRunnableTask(plan: ResearchPlanRecord): Promise<ResearchPlanTaskExecutionOutcome> {
		const settled = await this.stateLock.run(async () => {
			const state = await loadProjectState(this.statePath);
			if (!state) {
				return undefined;
			}
			const tasks = getResearchPlanTasks(state, plan.id);
			if (tasks.some((task) => task.status === "running")) {
				return { kind: "in-progress" as const };
			}
			const now = new Date().toISOString();
			const allDone = planTasksSettled(tasks);
			const nextState = updateResearchPlan(state, {
				planId: plan.id,
				status: allDone ? "completed" : "paused",
				...(allDone
					? { completedAt: now }
					: { pauseReason: "A plan task is blocked or stopped and needs an explicit retry." }),
				clearCurrentTaskId: true,
				now,
				actor: "system",
			});
			await saveProjectState(this.statePath, nextState);
			const finalPlan = nextState.researchPlans.find((candidate) => candidate.id === plan.id) ?? plan;
			const finalTasks = getResearchPlanTasks(nextState, plan.id);
			return { kind: "settled" as const, allDone, finalPlan, finalTasks };
		});
		if (!settled) {
			return { kind: "not-runnable", reason: "The research workspace could not be loaded." };
		}
		if (settled.kind === "in-progress") {
			return { kind: "not-runnable", reason: "A plan task is already in progress." };
		}
		if (settled.allDone) {
			await this.notify(formatResearchPlanCompleted({ plan: settled.finalPlan, tasks: settled.finalTasks }));
			return { kind: "plan-completed" };
		}
		await this.notify(formatResearchPlanPaused({ plan: settled.finalPlan, tasks: settled.finalTasks }), "warning");
		return { kind: "not-runnable", reason: "No plan task is ready to run." };
	}
}

/**
 * Compact brief handed to the executing workstream: goal plus what "done" means. Refutation tasks
 * always carry a falsification directive, even when the task has no model-authored goal, so the
 * specialist works against the statement instead of for it. Theorem applicability rejections
 * recorded on the task's path become explicit cautions, so a rejected route is never silently
 * retried by a later step.
 */
function buildPlanTaskBrief(
	state: CoMathProjectState,
	task: ResearchPlanTaskRecord,
	path: ResearchPath | undefined,
): string | undefined {
	const rejectedChecks = path
		? getTheoremApplicabilityChecksForPath(state, path.id).filter(
				(check) => check.status === "rejected-as-direct-route",
			)
		: [];
	const lines = [
		...(task.kind === "refutation-attempt"
			? [
					"Your job on this step is to disprove the statement, not to support it.",
					"Prefer concrete computations over argument: search for a counterexample or a structural obstruction.",
					"If a computation refutes the statement, say so plainly — a counterexample here is success, not failure.",
				]
			: []),
		...(task.goal ? [`Goal: ${task.goal}`] : []),
		...(task.acceptanceCriteria.length > 0
			? ["Done when:", ...task.acceptanceCriteria.map((criterion) => `- ${criterion}`)]
			: []),
		...(rejectedChecks.length > 0
			? [
					"Route cautions (already checked; do not build on these as direct routes):",
					...rejectedChecks
						.slice(-3)
						.map(
							(check) =>
								`- ${check.theorem} was rejected for ${check.targetObject}${check.consequence ? `; instead: ${check.consequence}` : ""}`,
						),
				]
			: []),
	];
	return lines.length > 0 ? lines.join("\n") : undefined;
}

function resolvePlanTaskPath(state: CoMathProjectState, task: ResearchPlanTaskRecord): ResearchPath | undefined {
	if (task.pathId) {
		const pinned = state.researchPaths.find(
			(candidate) => candidate.id === task.pathId && candidate.status !== "abandoned",
		);
		if (pinned) {
			return pinned;
		}
	}
	return chooseResearchPathForPlanTaskKind(state, task.kind);
}
