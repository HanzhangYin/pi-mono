/**
 * Bounded executor for durable co-math research plans.
 *
 * The plan runner executes exactly one plan task at a time, persisting state before and after each
 * task and reloading state between tasks, so an interruption always lands on a durable task
 * boundary. There is no daemon or scheduler here: every task execution happens inside an explicit
 * user-driven call, and a paused plan is only ever resumed by an explicit prompt — never
 * automatically after an interruption. Retries re-run the interrupted task from scratch; nothing is
 * checkpointed mid-model-call.
 */

import { mkdir, writeFile } from "node:fs/promises";
import * as nodePath from "node:path";
import type { ComputationalExecutor } from "./comath-computation-executor.ts";
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
import { runConjectureRevisionTask } from "./comath-research-revision.ts";
import {
	type CoMathResearchPhaseActivityNotify,
	type CoMathResearchRunner,
	type CoMathResearchRunnerNotify,
	persistResearchCoordinatorSynthesisReport,
	safeErrorMessage,
} from "./comath-research-runner.ts";
import { runSkepticGate, type SkepticVerdict } from "./comath-research-skeptic.ts";
import type {
	CoMathActor,
	CoMathProjectState,
	ResearchPath,
	ResearchPlanRecord,
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
	/** Best-effort UI status for phases outside a workstream run (planning, review, amendment, …). */
	onResearchPhaseActivity?: CoMathResearchPhaseActivityNotify;
}

export interface ResearchPlanTaskExecutionOptions {
	batchId?: string;
	stepIndex?: number;
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

export class CoMathResearchPlanRunner {
	private readonly statePath: string;
	private readonly notify: CoMathResearchRunnerNotify;
	private readonly researchRunner: CoMathResearchRunner;
	private readonly researchModelExecutor: ResearchWorkstreamModelExecutor | undefined;
	private readonly researchDirectorExecutor: ResearchWorkstreamModelExecutor | undefined;
	private readonly computationalExecutor: ComputationalExecutor | undefined;
	private readonly onResearchPhaseActivity: CoMathResearchPhaseActivityNotify | undefined;
	private readonly executingPlanIds = new Set<string>();

	constructor(options: CoMathResearchPlanRunnerOptions) {
		this.statePath = options.statePath;
		this.notify = options.notify;
		this.researchRunner = options.researchRunner;
		this.researchModelExecutor = options.researchModelExecutor;
		this.researchDirectorExecutor = options.researchDirectorExecutor;
		this.computationalExecutor = options.computationalExecutor;
		this.onResearchPhaseActivity = options.onResearchPhaseActivity;
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
		let nextState = state;
		let changed = false;
		for (const plan of state.researchPlans) {
			if (plan.status !== "active" || this.executingPlanIds.has(plan.id)) {
				continue;
			}
			const runningTask = getResearchPlanTasks(state, plan.id).find((task) => task.status === "running");
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
			const resumedState = resumeResearchPlan(state, paused.id, new Date().toISOString());
			await saveProjectState(this.statePath, resumedState);
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
		await saveProjectState(this.statePath, created.state);
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
		const state = await loadProjectState(this.statePath);
		const plan = state?.researchPlans.find((candidate) => candidate.id === planId);
		if (!state || !plan) {
			return { kind: "not-runnable", reason: "The research plan could not be loaded." };
		}
		if (plan.status !== "active") {
			return { kind: "not-runnable", reason: `The research plan is ${plan.status}.` };
		}
		const task = getNextRunnableResearchPlanTask(state, planId);
		if (!task) {
			return await this.finishPlanWithoutRunnableTask(state, plan);
		}
		this.executingPlanIds.add(planId);
		try {
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
			const runningTask = tasks.find((candidate) => candidate.id === task.id) ?? task;
			await this.notify(formatResearchPlanTaskStarted({ plan, tasks, task: runningTask }));
			let result: PlanTaskExecutionResult;
			try {
				result = await this.executePlanTaskByKind(runningTask, options);
			} catch (error: unknown) {
				result = { status: "failed", reason: safeErrorMessage(error) };
			}
			return await this.finalizePlanTask(planId, task.id, result);
		} finally {
			this.executingPlanIds.delete(planId);
		}
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
			const evidenceEntryIds = report
				? latest.researchEvidenceBoard.filter((entry) => entry.reportId === report.id).map((entry) => entry.id)
				: [];
			await this.maybeAnnounceRefutation(latest, task, evidenceEntryIds);
			const withObligations = applyCompletedTaskToObligations(latest, {
				task,
				...(report ? { reportId: report.id } : {}),
				runUsedFallback: run.usedFallback === true,
				modelBacked: this.researchModelExecutor !== undefined,
				newEvidenceEntryIds: evidenceEntryIds,
				...(skeptic
					? {
							skeptic: { concerns: skeptic.concerns, counterexampleFound: skeptic.counterexampleFound },
							reviewEvidenceEntryIds: skeptic.evidenceEntryIds,
						}
					: {}),
				now: new Date().toISOString(),
			});
			if (withObligations !== latest) {
				await saveProjectState(this.statePath, withObligations);
			}
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
			const gate = await this.withPhaseActivity(`independent-review-${runId}`, "independent-review", () =>
				runSkepticGate({
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
			if (gate.state !== state) {
				await saveProjectState(this.statePath, gate.state);
			}
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
		const withObligations = applyConjectureRevisionToObligations(result.state, {
			task,
			...(result.parentEntryId ? { parentEntryId: result.parentEntryId } : {}),
			revisedEntryIds: result.revisedEntryIds,
			now: new Date().toISOString(),
		});
		await saveProjectState(this.statePath, withObligations);
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
		let nextState = state;
		const now = new Date().toISOString();
		if (concern) {
			nextState = addMarginNote(nextState, {
				id: `margin-note-${nextState.marginNotes.length + 1}`,
				kind: "scrutiny",
				subjectId: report.pathId,
				...(report.workingPaperSectionId ? { sectionId: report.workingPaperSectionId } : {}),
				message: `Plan review of the latest findings: ${concern}`,
				now,
				actor: "reviewer",
			});
			await saveProjectState(this.statePath, nextState);
		}
		return { status: "completed", reportId: report.id };
	}

	private async executeSynthesisTask(state: CoMathProjectState): Promise<PlanTaskExecutionResult> {
		const result = await this.withPhaseActivity("research-synthesis", "synthesis", () =>
			persistResearchCoordinatorSynthesisReport(state, this.researchModelExecutor, new Date().toISOString()),
		);
		await saveProjectState(this.statePath, result.state);
		return { status: "completed", ...(result.reportId ? { reportId: result.reportId } : {}) };
	}

	private async executeExportTask(state: CoMathProjectState): Promise<PlanTaskExecutionResult> {
		if (state.workingPaperSections.length === 0) {
			return { status: "blocked", reason: "There is nothing in the working paper to export yet." };
		}
		const relativePath = ".pi/co-math/exports/working-paper.md";
		const projectRoot = nodePath.dirname(nodePath.dirname(nodePath.dirname(this.statePath)));
		const absolutePath = nodePath.join(projectRoot, relativePath);
		const body = [
			`# Working paper: ${state.title}`,
			"",
			...state.workingPaperSections.flatMap((section) => [`## ${section.title}`, "", section.body, ""]),
		].join("\n");
		await mkdir(nodePath.dirname(absolutePath), { recursive: true });
		await writeFile(absolutePath, body, "utf8");
		const now = new Date().toISOString();
		const nextState = recordWorkingPaperExport(state, {
			artifactId: `artifact-${state.artifacts.length + 1}`,
			path: relativePath,
			title: "Living working paper export",
			summary: `Exported ${state.workingPaperSections.length} working-paper sections.`,
			now,
			actor: "system",
		});
		await saveProjectState(this.statePath, nextState);
		return { status: "completed" };
	}

	private async finalizePlanTask(
		planId: string,
		taskId: string,
		result: PlanTaskExecutionResult,
	): Promise<ResearchPlanTaskExecutionOutcome> {
		const state = await loadProjectState(this.statePath);
		if (!state) {
			return { kind: "not-runnable", reason: "The research workspace could not be loaded." };
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
				return { kind: "not-runnable", reason: "The research plan could not be loaded." };
			}
			await this.notify(formatResearchPlanTaskCompleted({ plan, tasks: finalTasks, task }));
			if (planCompleted) {
				await this.notify(formatResearchPlanCompleted({ plan, tasks: finalTasks }));
			} else {
				await this.maybeAmendPlanAfterTask(planId, task);
			}
			return { kind: "completed", task, ...(result.runId ? { runId: result.runId } : {}), planCompleted };
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
		// A review rejection blocks only the rejected step: while another task is still pending, the
		// plan stays active and the next task runs, since the pending work is usually exactly what
		// the review's diagnosis calls for. Every other blocker pauses the plan for an explicit
		// resume, and so does a rejection that leaves nothing else runnable.
		const planContinues = reviewRejected && getNextRunnableResearchPlanTask(nextState, planId) !== undefined;
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
			return { kind: "not-runnable", reason: "The research plan could not be loaded." };
		}
		if (failed) {
			await this.notify(formatResearchPlanPaused({ plan, tasks, reason: result.reason }), "warning");
			return { kind: "failed", task, reason: result.reason };
		}
		if (planContinues) {
			await this.notify(formatResearchPlanTaskRejectedContinuing({ plan, tasks, task }), "warning");
			return {
				kind: "blocked",
				task,
				reason: result.reason,
				...(result.runId ? { runId: result.runId } : {}),
				planPaused: false,
			};
		}
		await this.notify(formatResearchPlanBlocked({ plan, tasks, task }), "warning");
		return {
			kind: "blocked",
			task,
			reason: result.reason,
			...(result.runId ? { runId: result.runId } : {}),
			planPaused: true,
		};
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
			await saveProjectState(this.statePath, amendment.state);
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

	private async finishPlanWithoutRunnableTask(
		state: CoMathProjectState,
		plan: ResearchPlanRecord,
	): Promise<ResearchPlanTaskExecutionOutcome> {
		const tasks = getResearchPlanTasks(state, plan.id);
		if (tasks.some((task) => task.status === "running")) {
			return { kind: "not-runnable", reason: "A plan task is already in progress." };
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
		if (allDone) {
			await this.notify(formatResearchPlanCompleted({ plan: finalPlan, tasks: finalTasks }));
			return { kind: "plan-completed" };
		}
		await this.notify(formatResearchPlanPaused({ plan: finalPlan, tasks: finalTasks }), "warning");
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
