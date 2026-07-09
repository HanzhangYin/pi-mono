import * as nodePath from "node:path";
import type { ComputationalExecutor } from "./comath-computation-executor.ts";
import {
	type ComputationResearchWorkstreamResult,
	isComputationalResearchPath,
	runComputationResearchWorkstreamStaged,
} from "./comath-computation-workstream.ts";
import { runResearchCoordinatorSynthesis } from "./comath-coordinator-synthesis.ts";
import {
	formatResearchWorkstreamRunFailed,
	formatResearchWorkstreamRunStarted,
	formatResearchWorkstreamStageCompleted,
	formatResearchWorkstreamStageStarted,
} from "./comath-foreground-progress.ts";
import type { LiteratureSourceLookup } from "./comath-literature-source.ts";
import { createWorkspaceLiteratureSourceLookup } from "./comath-literature-source.ts";
import {
	isLiteratureResearchPath,
	type LiteratureResearchWorkstreamResult,
	runLiteratureResearchWorkstreamStaged,
} from "./comath-literature-workstream.ts";
import {
	formatResearchModelFallbackNote,
	formatResearchWorkstreamCompleted,
	formatResearchWorkstreamStarted,
} from "./comath-progress.ts";
import { isActionableRouteText } from "./comath-research-discipline.ts";
import {
	type ResearchWorkstreamModelExecutor,
	type ResearchWorkstreamStageResult,
	runModelBackedResearchWorkstreamStaged,
} from "./comath-research-model-workstream.ts";
import type { SpecialistComputationRecord, SpecialistRecordedClaim } from "./comath-research-specialist-loop.ts";
import { type ResearchWorkstreamReport, runResearchWorkstream } from "./comath-research-workstream.ts";
import { significantContentTokens } from "./comath-text-similarity.ts";
import type {
	CoMathProjectState,
	LiteratureClaimSupport,
	LiteratureSourceArtifact,
	MarginNoteKind,
	ResearchEvidenceClassification,
	ResearchPath,
	ResearchPlanTaskKind,
	ResearchWorkstreamRunRecord,
	ResearchWorkstreamRunStage,
	TheoremHypothesisCheck,
} from "./schema.ts";
import {
	addComputationalArtifact,
	addLiteratureClaimSupport,
	addLiteratureSearchRecord,
	addLiteratureSourceArtifact,
	addMarginNote,
	addResearchConstraint,
	addResearchCoordinatorReport,
	addResearchEvidenceBoardEntry,
	addResearchPath,
	addResearchPivot,
	addResearchWorkstreamIncrementalReport,
	addResearchWorkstreamReport,
	addResearchWorkstreamRun,
	addTheoremApplicabilityCheck,
	failStaleResearchWorkstreamRuns,
	getActiveResearchConstraints,
	loadProjectState,
	STALE_RESEARCH_WORKSTREAM_RUN_REASON,
	saveProjectState,
	updateComputationalArtifact,
	updateResearchPath,
	updateResearchWorkstreamRun,
	upsertWorkingPaperSectionByTitle,
} from "./storage.ts";

export type CoMathResearchRunnerNoticeType = "info" | "warning" | "error";
export type CoMathResearchRunnerNotify = (
	message: string,
	type?: CoMathResearchRunnerNoticeType,
) => void | Promise<void>;

export interface CoMathResearchWorkstreamActivityStartInput {
	state: Pick<CoMathProjectState, "researchPaths">;
	run: ResearchWorkstreamRunRecord;
}

export interface CoMathResearchWorkstreamActivityUpdateInput extends CoMathResearchWorkstreamActivityStartInput {
	stage: ResearchWorkstreamRunStage;
	summary: string;
}

export interface CoMathResearchWorkstreamActivityEndInput {
	runId: string;
}

export type CoMathResearchWorkstreamActivityStart = (
	input: CoMathResearchWorkstreamActivityStartInput,
) => void | Promise<void>;
export type CoMathResearchWorkstreamActivityUpdate = (
	input: CoMathResearchWorkstreamActivityUpdateInput,
) => void | Promise<void>;
export type CoMathResearchWorkstreamActivityEnd = (
	input: CoMathResearchWorkstreamActivityEndInput,
) => void | Promise<void>;

/**
 * Activity signal for research work that happens outside a workstream run: director planning, the
 * independent review of a finished step, plan amendments, synthesis, statement revision, and the
 * bounded batch step itself. `status` is finished product copy; the UI only has to display it.
 * Signals are best-effort UI hints — emitters must never let them affect research execution.
 */
export type CoMathResearchPhaseActivitySignal =
	| { kind: "start"; activityId: string; status: string }
	| { kind: "end"; activityId: string };
export type CoMathResearchPhaseActivityNotify = (signal: CoMathResearchPhaseActivitySignal) => void | Promise<void>;

export interface CoMathResearchRunnerOptions {
	statePath: string;
	notify: CoMathResearchRunnerNotify;
	researchModelExecutor?: ResearchWorkstreamModelExecutor;
	literatureSourceLookup: LiteratureSourceLookup;
	computationalExecutor: ComputationalExecutor;
	onResearchWorkstreamActivityStart?: CoMathResearchWorkstreamActivityStart;
	onResearchWorkstreamActivityUpdate?: CoMathResearchWorkstreamActivityUpdate;
	onResearchWorkstreamActivityEnd?: CoMathResearchWorkstreamActivityEnd;
}

export class CoMathResearchRunner {
	private readonly statePath: string;
	private readonly notify: CoMathResearchRunnerNotify;
	private readonly researchModelExecutor: ResearchWorkstreamModelExecutor | undefined;
	private readonly literatureSourceLookup: LiteratureSourceLookup;
	private readonly computationalExecutor: ComputationalExecutor;
	private readonly onResearchWorkstreamActivityStart: CoMathResearchWorkstreamActivityStart | undefined;
	private readonly onResearchWorkstreamActivityUpdate: CoMathResearchWorkstreamActivityUpdate | undefined;
	private readonly onResearchWorkstreamActivityEnd: CoMathResearchWorkstreamActivityEnd | undefined;
	private readonly activeResearchWorkstreams = new Map<string, Promise<void>>();

	constructor(options: CoMathResearchRunnerOptions) {
		this.statePath = options.statePath;
		this.notify = options.notify;
		this.researchModelExecutor = options.researchModelExecutor;
		this.literatureSourceLookup = options.literatureSourceLookup;
		this.computationalExecutor = options.computationalExecutor;
		this.onResearchWorkstreamActivityStart = options.onResearchWorkstreamActivityStart;
		this.onResearchWorkstreamActivityUpdate = options.onResearchWorkstreamActivityUpdate;
		this.onResearchWorkstreamActivityEnd = options.onResearchWorkstreamActivityEnd;
	}

	findResearchRun(state: CoMathProjectState, runId: string | undefined): ResearchWorkstreamRunRecord | undefined {
		return runId ? state.researchWorkstreamRuns.find((candidate) => candidate.id === runId) : undefined;
	}

	async reconcileStaleResearchWorkstreamRuns(state: CoMathProjectState): Promise<{
		state: CoMathProjectState;
		interruptedRuns: ResearchWorkstreamRunRecord[];
	}> {
		const inProcessRunIds = new Set(this.activeResearchWorkstreams.keys());
		const staleRunIds = state.researchWorkstreamRuns
			.filter((run) => (run.status === "queued" || run.status === "running") && !inProcessRunIds.has(run.id))
			.map((run) => run.id);
		if (staleRunIds.length === 0) {
			return { state, interruptedRuns: [] };
		}
		const nextState = failStaleResearchWorkstreamRuns(state, {
			activeRunIds: [...inProcessRunIds],
			now: new Date().toISOString(),
			actor: "system",
			reason: STALE_RESEARCH_WORKSTREAM_RUN_REASON,
		});
		await saveProjectState(this.statePath, nextState);
		for (const staleRunId of staleRunIds) {
			await this.notifyResearchWorkstreamActivityEnd(staleRunId);
		}
		const staleRunIdSet = new Set(staleRunIds);
		return {
			state: nextState,
			interruptedRuns: nextState.researchWorkstreamRuns.filter((run) => staleRunIdSet.has(run.id)),
		};
	}

	async runResearchWorkstreamForPath(state: CoMathProjectState, path: ResearchPath): Promise<void> {
		const now = new Date().toISOString();
		if (this.researchModelExecutor) {
			const runId = `research-run-${state.researchWorkstreamRuns.length + 1}`;
			const nextState = addResearchWorkstreamRun(state, {
				id: runId,
				pathId: path.id,
				pathTitle: path.title,
				currentStage: "coordinator",
				now,
				actor: "system",
			});
			await saveProjectState(this.statePath, nextState);
			const run = nextState.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
			if (run) {
				await this.notifyResearchWorkstreamActivityStart(nextState, run);
				await this.notify(formatResearchWorkstreamRunStarted({ state: nextState, run }));
			}
			const workstream = this.executeResearchWorkstreamInBackground(runId)
				.catch(async (error: unknown) => {
					await this.markResearchWorkstreamRunFailed(runId, safeErrorMessage(error));
				})
				.finally(async () => {
					this.activeResearchWorkstreams.delete(runId);
					await this.notifyResearchWorkstreamActivityEnd(runId);
				});
			this.activeResearchWorkstreams.set(runId, workstream);
			void workstream;
			return;
		}

		const runId = `research-run-${state.researchWorkstreamRuns.length + 1}`;
		let nextState = addResearchWorkstreamRun(state, {
			id: runId,
			pathId: path.id,
			pathTitle: path.title,
			currentStage: "coordinator",
			now,
			actor: "system",
		});
		const report = runResearchWorkstream({
			rootQuestion: state.rootQuestion,
			path,
			allPaths: state.researchPaths,
			now,
		});
		nextState = appendIncrementalReports(nextState, runId, report, now);
		nextState = persistResearchWorkstreamReport(nextState, path, report, now);
		const finalReportId = nextState.researchReports.at(-1)?.id;
		nextState = updateResearchWorkstreamRun(nextState, {
			runId,
			status: "completed",
			currentStage: "synthesizer",
			completedAt: report.completedAt,
			...(finalReportId ? { finalReportId } : {}),
			now,
			actor: "synthesizer",
		});
		await saveProjectState(this.statePath, nextState);
		await this.maybeRefreshCoordinatorAfterReport(nextState);
		const completedRun = nextState.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
		if (completedRun) {
			await this.notifyResearchWorkstreamCompletedStages(nextState, completedRun, report);
		}
		await this.notify(formatResearchWorkstreamStarted({ state: nextState, report }));
		await this.notify(formatResearchWorkstreamCompleted({ state: nextState, report }));
	}

	async runResearchWorkstreamStepForBatch(
		state: CoMathProjectState,
		path: ResearchPath,
		batchId: string,
		stepIndex: number,
	): Promise<string> {
		return this.runBoundedResearchWorkstreamStep(state, path, { batchId, stepIndex });
	}

	/**
	 * Run a single research workstream step to completion and return its run id. Unlike
	 * {@link runResearchWorkstreamForPath} this awaits the run, so bounded executors (research
	 * batches, plan tasks) can persist durable linkage between steps. Batch linkage is optional:
	 * plan tasks executed outside a batch reuse the same bounded step without batch fields.
	 */
	async runBoundedResearchWorkstreamStep(
		state: CoMathProjectState,
		path: ResearchPath,
		options: { batchId?: string; stepIndex?: number; taskBrief?: string; taskKind?: ResearchPlanTaskKind } = {},
	): Promise<string> {
		const now = new Date().toISOString();
		const runId = `research-run-${state.researchWorkstreamRuns.length + 1}`;
		let nextState = addResearchWorkstreamRun(state, {
			id: runId,
			pathId: path.id,
			pathTitle: path.title,
			currentStage: "coordinator",
			...(options.batchId ? { batchId: options.batchId } : {}),
			...(options.stepIndex !== undefined ? { batchStepIndex: options.stepIndex } : {}),
			now,
			actor: "system",
		});
		await saveProjectState(this.statePath, nextState);
		const run = nextState.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
		if (run) {
			await this.notifyResearchWorkstreamActivityStart(nextState, run);
		}
		if (this.researchModelExecutor) {
			const workstream = this.executeResearchWorkstreamInBackground(
				runId,
				options.taskBrief,
				options.taskKind,
			).finally(async () => {
				this.activeResearchWorkstreams.delete(runId);
				await this.notifyResearchWorkstreamActivityEnd(runId);
			});
			this.activeResearchWorkstreams.set(runId, workstream);
			await workstream;
			return runId;
		}
		const report = runResearchWorkstream({
			rootQuestion: state.rootQuestion,
			path,
			allPaths: state.researchPaths,
			now,
		});
		nextState = appendIncrementalReports(nextState, runId, report, now);
		nextState = persistResearchWorkstreamReport(nextState, path, report, now);
		const finalReportId = nextState.researchReports.at(-1)?.id;
		nextState = updateResearchWorkstreamRun(nextState, {
			runId,
			status: "completed",
			currentStage: "synthesizer",
			completedAt: report.completedAt,
			...(finalReportId ? { finalReportId } : {}),
			now,
			actor: "synthesizer",
		});
		await saveProjectState(this.statePath, nextState);
		await this.maybeRefreshCoordinatorAfterReport(nextState);
		const completedRun = nextState.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
		if (completedRun) {
			await this.notifyResearchWorkstreamCompletedStages(nextState, completedRun, report);
		}
		await this.notifyResearchWorkstreamActivityEnd(runId);
		await this.notify(formatResearchWorkstreamCompleted({ state: nextState, report }));
		return runId;
	}

	private async executeResearchWorkstreamInBackground(
		runId: string,
		taskBrief?: string,
		taskKind?: ResearchPlanTaskKind,
	): Promise<void> {
		const state = await loadProjectState(this.statePath);
		const run = state?.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
		const path = run ? state?.researchPaths.find((candidate) => candidate.id === run.pathId) : undefined;
		if (!state || !run || !path) {
			return;
		}
		const now = new Date().toISOString();
		try {
			// The task kind, not the path's wording, chooses the workstream: a proof-attempt pinned
			// to an "examples/finite checks" path must still write mathematics, and computation or
			// literature machinery only runs for tasks that asked for it. Kind-less runs (explicit
			// "work on path N") keep the path-based selection.
			const useLiterature =
				taskKind === "literature-search" ||
				taskKind === "source-refresh" ||
				(taskKind === undefined && isLiteratureResearchPath(path));
			const useComputation =
				!useLiterature &&
				(taskKind === "computation" || (taskKind === undefined && isComputationalResearchPath(path)));
			if (useLiterature) {
				const literatureResult = await runLiteratureResearchWorkstreamStaged(
					{
						rootQuestion: state.rootQuestion,
						path,
						allPaths: state.researchPaths,
						now,
						executor: this.researchModelExecutor as ResearchWorkstreamModelExecutor,
						sourceLookup: createWorkspaceLiteratureSourceLookup({
							sources: state.literatureSources,
							fallback: this.literatureSourceLookup,
						}),
						...(taskBrief?.trim() ? { directive: taskBrief.trim() } : {}),
						standingConstraints: getActiveResearchConstraints(state),
					},
					{
						onStageStarted: async (stage, summary) => {
							await this.saveResearchWorkstreamStageStarted(state, run, stage, summary);
						},
						onStageCompleted: async (result) => {
							await this.saveResearchWorkstreamStage(runId, {
								stage: result.stage,
								status: "completed",
								title: result.title,
								summary: result.summary,
								details: result.details,
							});
						},
					},
				);
				await this.completeLiteratureResearchWorkstreamRun(runId, literatureResult);
				return;
			}
			if (useComputation) {
				const artifactPaths = this.getComputationArtifactPaths(runId);
				const computationResult = await runComputationResearchWorkstreamStaged(
					{
						rootQuestion: state.rootQuestion,
						path,
						allPaths: state.researchPaths,
						now,
						executor: this.researchModelExecutor as ResearchWorkstreamModelExecutor,
						computationalExecutor: this.computationalExecutor,
						artifactDirectory: artifactPaths.relative,
						workingDirectory: artifactPaths.absolute,
						...(taskBrief?.trim() ? { directive: taskBrief.trim() } : {}),
					},
					{
						onStageStarted: async (stage, summary) => {
							await this.saveResearchWorkstreamStageStarted(state, run, stage, summary);
						},
						onStageCompleted: async (result) => {
							await this.saveResearchWorkstreamStage(runId, {
								stage: result.stage,
								status: "completed",
								title: result.title,
								summary: result.summary,
								details: result.details,
							});
						},
					},
				);
				await this.completeComputationResearchWorkstreamRun(runId, computationResult);
				return;
			}
			// Generic (proof-oriented) paths run the specialist as a bounded agentic tool loop: it may
			// run sandboxed computations mid-attempt and record durable claims before its final note.
			// A model that answers directly degrades to the old single specialist call. Loop side
			// effects are persisted as soon as the loop finishes (before the critic runs) so they
			// survive a later interruption; claims are linked to the report after it exists.
			const specialistPaths = this.getComputationArtifactPaths(`${runId}-specialist`);
			let specialistArtifactIds: string[] = [];
			let specialistClaims: readonly SpecialistRecordedClaim[] = [];
			const report = await runModelBackedResearchWorkstreamStaged(
				{
					rootQuestion: state.rootQuestion,
					path,
					allPaths: state.researchPaths,
					now,
					executor: this.researchModelExecutor as ResearchWorkstreamModelExecutor,
					...(taskBrief?.trim() ? { directive: taskBrief.trim() } : {}),
					...(taskKind ? { taskKind } : {}),
					standingConstraints: getActiveResearchConstraints(state),
					specialistToolLoop: {
						computationalExecutor: this.computationalExecutor,
						workingDirectory: specialistPaths.absolute,
						onFinished: async (loop) => {
							specialistClaims = loop.recordedClaims;
							specialistArtifactIds = await this.persistSpecialistComputationRecords(
								runId,
								path.id,
								specialistPaths.relative,
								loop.computationRecords,
							);
						},
					},
				},
				{
					onStageStarted: async (stage, summary) => {
						await this.saveResearchWorkstreamStageStarted(state, run, stage, summary);
					},
					onStageCompleted: async (result) => {
						await this.saveResearchWorkstreamStage(runId, {
							stage: result.stage,
							status: "completed",
							title: result.title,
							summary: result.summary,
							details: result.details,
						});
					},
				},
			);
			await this.completeResearchWorkstreamRun(
				runId,
				specialistArtifactIds.length > 0
					? {
							...report,
							computationalArtifactIds: [...(report.computationalArtifactIds ?? []), ...specialistArtifactIds],
						}
					: report,
			);
			await this.persistSpecialistRecordedClaims(runId, path.id, specialistClaims);
		} catch (error: unknown) {
			await this.completeResearchWorkstreamWithFallback(runId, error);
		}
	}

	/**
	 * Persist the computations the specialist ran mid-attempt as durable computation records
	 * linked to the run; ids are folded into the final report so linkage flows to plan tasks.
	 */
	private async persistSpecialistComputationRecords(
		runId: string,
		pathId: string,
		artifactDirectory: string,
		records: readonly SpecialistComputationRecord[],
	): Promise<string[]> {
		if (records.length === 0) {
			return [];
		}
		const state = await loadProjectState(this.statePath);
		if (!state) {
			return [];
		}
		const now = new Date().toISOString();
		let nextState = state;
		const artifactIds: string[] = [];
		for (const record of records) {
			nextState = addComputationalArtifact(nextState, {
				pathId,
				runId,
				kind: record.kind,
				status: record.exitCode === undefined || record.exitCode === 0 ? "completed" : "failed",
				title: record.title,
				...(record.fileName ? { filePath: `${artifactDirectory}/${record.fileName}` } : {}),
				...(record.command ? { command: record.command } : {}),
				...(record.exitCode !== undefined ? { exitCode: record.exitCode } : {}),
				summary: record.summary,
				now,
				actor: "workstream",
			});
			const artifactId = nextState.computationalArtifacts.at(-1)?.id;
			if (artifactId) {
				artifactIds.push(artifactId);
			}
		}
		await saveProjectState(this.statePath, nextState);
		return artifactIds;
	}

	/** Persist claims the specialist recorded mid-attempt, linked to the run's final report. */
	private async persistSpecialistRecordedClaims(
		runId: string,
		pathId: string,
		claims: readonly SpecialistRecordedClaim[],
	): Promise<void> {
		if (claims.length === 0) {
			return;
		}
		const state = await loadProjectState(this.statePath);
		if (!state) {
			return;
		}
		const reportId = state.researchWorkstreamRuns.find((candidate) => candidate.id === runId)?.finalReportId;
		const now = new Date().toISOString();
		let nextState = state;
		for (const claim of claims) {
			nextState = addResearchEvidenceBoardEntry(nextState, {
				pathId,
				...(reportId ? { reportId } : {}),
				claim: claim.claim,
				classification: claim.classification,
				...(claim.claimCategory ? { claimCategory: claim.claimCategory } : {}),
				rationale: `${claim.rationale} Recorded by the specialist during the attempt.`,
				now,
				actor: "workstream",
			});
		}
		await saveProjectState(this.statePath, nextState);
	}

	private async saveResearchWorkstreamStageStarted(
		state: CoMathProjectState,
		run: ResearchWorkstreamRunRecord,
		stage: ResearchWorkstreamRunStage,
		summary: string,
	): Promise<void> {
		await this.saveResearchWorkstreamStage(run.id, {
			stage,
			status: "running",
			title: formatStageTitle(stage),
			summary,
			details: [],
		});
		await this.notifyResearchWorkstreamActivityUpdate(state, run, stage, summary);
		if (stage === "coordinator") {
			return;
		}
		await this.notify(formatResearchWorkstreamStageStarted({ state, run, stage, summary }));
	}

	private async saveResearchWorkstreamStage(
		runId: string,
		input: Pick<ResearchWorkstreamStageResult, "stage" | "title" | "summary" | "details"> & {
			status: "running" | "completed" | "blocked" | "failed";
		},
	): Promise<void> {
		const state = await loadProjectState(this.statePath);
		if (!state?.researchWorkstreamRuns.some((run) => run.id === runId)) {
			return;
		}
		const now = new Date().toISOString();
		let nextState = updateResearchWorkstreamRun(state, {
			runId,
			...(input.status === "running" ? { status: "running" } : {}),
			currentStage: input.stage,
			now,
			actor: "system",
		});
		if (input.stage === "coordinator" && input.status === "running") {
			await saveProjectState(this.statePath, nextState);
			return;
		}
		nextState = addResearchWorkstreamIncrementalReport(nextState, {
			runId,
			stage: input.stage,
			status: input.status,
			title: input.title,
			summary: input.summary,
			details: input.details,
			now,
			actor: "system",
		});
		await saveProjectState(this.statePath, nextState);
		const run = nextState.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
		if (run && input.status === "completed") {
			await this.notify(
				formatResearchWorkstreamStageCompleted({
					state: nextState,
					run,
					stage: input.stage,
					summary: input.summary,
					details: input.details,
				}),
			);
		}
	}

	private async completeResearchWorkstreamRun(runId: string, report: ResearchWorkstreamReport): Promise<void> {
		const state = await loadProjectState(this.statePath);
		const path = state?.researchPaths.find((candidate) => candidate.id === report.pathId);
		if (!state || !path) {
			return;
		}
		const now = new Date().toISOString();
		let nextState = persistResearchWorkstreamReport(state, path, report, now);
		const finalReportId = nextState.researchReports.at(-1)?.id;
		nextState = this.persistDisciplineRecords(nextState, report, path.id, finalReportId, now);
		nextState = updateResearchWorkstreamRun(nextState, {
			runId,
			status: "completed",
			currentStage: "synthesizer",
			completedAt: report.completedAt,
			...(finalReportId ? { finalReportId } : {}),
			now,
			actor: "synthesizer",
		});
		await saveProjectState(this.statePath, nextState);
		await this.maybeRefreshCoordinatorAfterReport(nextState);
		await this.notify(formatResearchWorkstreamCompleted({ state: nextState, report }));
	}

	/**
	 * Persist the structured `## Theorem check` and `## Route change` sections a model-backed run
	 * produced. A rejected theorem check whose consequence names a replacement route also records
	 * the pivot, so "rejected-as-direct-route" is never a dead end in durable state.
	 */
	private persistDisciplineRecords(
		state: CoMathProjectState,
		report: ResearchWorkstreamReport,
		pathId: string,
		reportId: string | undefined,
		now: string,
	): CoMathProjectState {
		let nextState = state;
		for (const check of report.theoremChecks ?? []) {
			nextState = addTheoremApplicabilityCheck(nextState, {
				theorem: check.theorem,
				targetObject: check.targetObject,
				hypotheses: check.hypotheses,
				status: check.status,
				...(check.consequence ? { consequence: check.consequence } : {}),
				pathId,
				...(reportId ? { reportId } : {}),
				now,
				actor: "workstream",
			});
			const checkId = nextState.theoremApplicabilityChecks.at(-1)?.id;
			// The consequence must name a route to pursue; a verdict ("cannot settle the root
			// question") would otherwise become a pivot destination and then a nonsense agenda task.
			if (
				check.status === "rejected-as-direct-route" &&
				check.consequence &&
				isActionableRouteText(check.consequence)
			) {
				nextState = addResearchPivot(nextState, {
					fromRoute: `Direct use of ${check.theorem}`,
					toRoute: check.consequence,
					reason: describeFailedHypotheses(check.hypotheses) ?? "A required hypothesis is not satisfied.",
					pathId,
					...(reportId ? { reportId } : {}),
					...(checkId ? { applicabilityCheckId: checkId } : {}),
					now,
					actor: "workstream",
				});
			}
		}
		for (const pivot of report.routePivots ?? []) {
			nextState = addResearchPivot(nextState, {
				fromRoute: pivot.fromRoute,
				toRoute: pivot.toRoute,
				reason: pivot.reason,
				pathId,
				...(reportId ? { reportId } : {}),
				now,
				actor: "workstream",
			});
		}
		// Standing rules a review derived ("Do not treat heuristic preprints as settled proofs.")
		// become reviewer-origin constraints; duplicates of active constraints are ignored.
		for (const constraintText of report.negativeConstraints ?? []) {
			nextState = addResearchConstraint(nextState, {
				text: constraintText,
				kind: /\bconvention\b/i.test(constraintText) ? "convention" : "avoid",
				origin: "reviewer",
				now,
				actor: "reviewer",
			});
		}
		return nextState;
	}

	private async completeLiteratureResearchWorkstreamRun(
		runId: string,
		result: LiteratureResearchWorkstreamResult,
	): Promise<void> {
		const state = await loadProjectState(this.statePath);
		const path = state?.researchPaths.find((candidate) => candidate.id === result.report.pathId);
		if (!state || !path) {
			return;
		}
		const now = new Date().toISOString();
		let nextState = state;
		const sourceIdMap = new Map<string, string>();
		const expectedReportId = `research-report-${nextState.researchReports.length + 1}`;
		for (const [index, source] of result.sources.entries()) {
			const before = nextState.literatureSources;
			nextState = addLiteratureSourceArtifact(nextState, {
				kind: source.kind,
				title: source.title,
				...(source.url ? { url: source.url } : {}),
				...(source.path ? { path: source.path } : {}),
				...(source.provider ? { provider: source.provider } : {}),
				...(source.externalId ? { externalId: source.externalId } : {}),
				...(source.doi ? { doi: source.doi } : {}),
				...(source.venue ? { venue: source.venue } : {}),
				...(source.publishedAt ? { publishedAt: source.publishedAt } : {}),
				...(source.citationCount !== undefined ? { citationCount: source.citationCount } : {}),
				...(source.sourceType ? { sourceType: source.sourceType } : {}),
				authors: source.authors ?? [],
				...(source.year ? { year: source.year } : {}),
				summary: source.summary,
				...(source.extractedText ? { extractedText: source.extractedText } : {}),
				now,
				actor: "system",
			});
			const persisted = findPersistedLiteratureSource(nextState.literatureSources, before, source);
			if (persisted) {
				sourceIdMap.set(`source-${index + 1}`, persisted.id);
			}
		}
		const sourceIds = uniqueStrings([...sourceIdMap.values()]);
		nextState = addLiteratureSearchRecord(nextState, {
			pathId: path.id,
			runId,
			queries: result.search.queries,
			providers: result.search.providers,
			candidateCount: result.search.candidateCount,
			selectedSourceIds: sourceIds,
			startedAt: result.report.startedAt,
			completedAt: now,
			now,
			actor: "system",
		});
		const claimSupportIds: string[] = [];
		for (const support of result.claimSupports) {
			nextState = addLiteratureClaimSupport(nextState, {
				pathId: path.id,
				reportId: expectedReportId,
				claim: support.claim,
				sourceIds: support.sourceIds.map((sourceId) => sourceIdMap.get(sourceId) ?? sourceId),
				status: support.status,
				...(support.note ? { note: support.note } : {}),
				now,
				actor: "reviewer",
			});
			const claimSupportId = nextState.literatureClaimSupports.at(-1)?.id;
			if (claimSupportId) {
				claimSupportIds.push(claimSupportId);
			}
		}
		const report: ResearchWorkstreamReport = {
			...result.report,
			sourceIds,
			claimSupportIds,
			promisingStrategy: result.report.promisingStrategy.map((item) => remapSourceLabels(item, sourceIdMap)),
			findings: result.report.findings.map((item) => remapSourceLabels(item, sourceIdMap)),
			criticisms: result.report.criticisms.map((item) => remapSourceLabels(item, sourceIdMap)),
			gaps: result.report.gaps.map((item) => remapSourceLabels(item, sourceIdMap)),
			steps: result.report.steps.map((step) => ({
				...step,
				details: step.details.map((detail) => remapSourceLabels(detail, sourceIdMap)),
			})),
			workingPaperSummary: remapSourceLabels(result.report.workingPaperSummary, sourceIdMap),
		};
		nextState = persistResearchWorkstreamReport(nextState, path, report, now);
		const finalReportId = nextState.researchReports.at(-1)?.id;
		nextState = this.persistDisciplineRecords(nextState, report, path.id, finalReportId, now);
		nextState = updateResearchWorkstreamRun(nextState, {
			runId,
			status: report.status === "blocked" ? "blocked" : "completed",
			currentStage: "synthesizer",
			completedAt: report.completedAt,
			...(finalReportId ? { finalReportId } : {}),
			now,
			actor: "synthesizer",
		});
		await saveProjectState(this.statePath, nextState);
		await this.maybeRefreshCoordinatorAfterReport(nextState);
		await this.notify(formatResearchWorkstreamCompleted({ state: nextState, report }));
	}

	private async completeComputationResearchWorkstreamRun(
		runId: string,
		result: ComputationResearchWorkstreamResult,
	): Promise<void> {
		const state = await loadProjectState(this.statePath);
		const path = state?.researchPaths.find((candidate) => candidate.id === result.report.pathId);
		if (!state || !path) {
			return;
		}
		const now = new Date().toISOString();
		let nextState = state;
		const computationalArtifactIds: string[] = [];
		for (const artifact of result.artifacts) {
			nextState = addComputationalArtifact(nextState, {
				pathId: path.id,
				runId,
				kind: artifact.kind,
				status: artifact.status,
				title: artifact.title,
				...(artifact.filePath ? { filePath: artifact.filePath } : {}),
				...(artifact.command ? { command: artifact.command } : {}),
				...(artifact.exitCode !== undefined ? { exitCode: artifact.exitCode } : {}),
				summary: artifact.summary,
				now,
				actor: "system",
			});
			const persisted = nextState.computationalArtifacts.at(-1);
			if (persisted) {
				computationalArtifactIds.push(persisted.id);
			}
		}
		const report: ResearchWorkstreamReport = {
			...result.report,
			computationalArtifactIds,
		};
		nextState = persistResearchWorkstreamReport(nextState, path, report, now);
		const finalReportId = nextState.researchReports.at(-1)?.id;
		if (finalReportId) {
			for (const artifactId of computationalArtifactIds) {
				nextState = updateComputationalArtifact(nextState, {
					artifactId,
					reportId: finalReportId,
					now,
					actor: "system",
				});
			}
		}
		nextState = updateResearchWorkstreamRun(nextState, {
			runId,
			status: report.status === "blocked" ? "blocked" : "completed",
			currentStage: "synthesizer",
			completedAt: report.completedAt,
			...(finalReportId ? { finalReportId } : {}),
			now,
			actor: "synthesizer",
		});
		await saveProjectState(this.statePath, nextState);
		await this.maybeRefreshCoordinatorAfterReport(nextState);
		await this.notify(formatResearchWorkstreamCompleted({ state: nextState, report }));
	}

	private async completeResearchWorkstreamWithFallback(runId: string, error: unknown): Promise<void> {
		const state = await loadProjectState(this.statePath);
		const run = state?.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
		const path = run ? state?.researchPaths.find((candidate) => candidate.id === run.pathId) : undefined;
		if (!state || !run || !path) {
			return;
		}
		const now = new Date().toISOString();
		try {
			const report = runResearchWorkstream({
				rootQuestion: state.rootQuestion,
				path,
				allPaths: state.researchPaths,
				now,
			});
			let nextState = updateResearchWorkstreamRun(state, {
				runId,
				status: "running",
				currentStage: "coordinator",
				usedFallback: true,
				now,
				actor: "system",
			});
			nextState = appendIncrementalReports(nextState, runId, report, now);
			nextState = persistResearchWorkstreamReport(nextState, path, report, now);
			const finalReportId = nextState.researchReports.at(-1)?.id;
			nextState = updateResearchWorkstreamRun(nextState, {
				runId,
				status: "completed",
				currentStage: "synthesizer",
				completedAt: report.completedAt,
				usedFallback: true,
				...(finalReportId ? { finalReportId } : {}),
				now,
				actor: "synthesizer",
			});
			await saveProjectState(this.statePath, nextState);
			await this.maybeRefreshCoordinatorAfterReport(nextState);
			const completedRun = nextState.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
			if (completedRun) {
				await this.notifyResearchWorkstreamCompletedStages(nextState, completedRun, report);
			}
			await this.notify(formatResearchModelFallbackNote());
			await this.notify(formatResearchWorkstreamCompleted({ state: nextState, report }));
		} catch (fallbackError: unknown) {
			const failureMessage = safeErrorMessage(fallbackError) || safeErrorMessage(error);
			const latest = (await loadProjectState(this.statePath)) ?? state;
			const failedState = updateResearchWorkstreamRun(latest, {
				runId,
				status: "failed",
				failureReason: failureMessage,
				now: new Date().toISOString(),
				actor: "system",
			});
			await saveProjectState(this.statePath, failedState);
			const failedRun = failedState.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
			if (failedRun) {
				await this.notify(formatResearchWorkstreamRunFailed({ state: failedState, run: failedRun }), "error");
			}
		}
	}

	private async markResearchWorkstreamRunFailed(runId: string, reason: string): Promise<void> {
		const state = await loadProjectState(this.statePath);
		if (!state?.researchWorkstreamRuns.some((run) => run.id === runId)) {
			return;
		}
		const failedState = updateResearchWorkstreamRun(state, {
			runId,
			status: "failed",
			failureReason: reason,
			now: new Date().toISOString(),
			actor: "system",
		});
		await saveProjectState(this.statePath, failedState);
		const run = failedState.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
		if (run) {
			await this.notify(formatResearchWorkstreamRunFailed({ state: failedState, run }), "error");
		}
	}

	private async notifyResearchWorkstreamCompletedStages(
		state: CoMathProjectState,
		run: ResearchWorkstreamRunRecord,
		report: ResearchWorkstreamReport,
	): Promise<void> {
		for (const step of report.steps) {
			await this.notify(
				formatResearchWorkstreamStageCompleted({
					state,
					run,
					stage: step.role,
					summary: step.summary,
					details: step.details,
				}),
			);
		}
	}

	private getComputationArtifactPaths(runId: string): { relative: string; absolute: string } {
		const relative = `.pi/co-math/artifacts/${runId}`;
		const projectRoot = nodePath.dirname(nodePath.dirname(nodePath.dirname(this.statePath)));
		return {
			relative,
			absolute: nodePath.join(projectRoot, relative),
		};
	}

	private async notifyResearchWorkstreamActivityStart(
		state: Pick<CoMathProjectState, "researchPaths">,
		run: ResearchWorkstreamRunRecord,
	): Promise<void> {
		try {
			await this.onResearchWorkstreamActivityStart?.({ state, run });
		} catch {
			// UI status updates are best-effort and must not affect research execution.
		}
	}

	private async notifyResearchWorkstreamActivityUpdate(
		state: Pick<CoMathProjectState, "researchPaths">,
		run: ResearchWorkstreamRunRecord,
		stage: ResearchWorkstreamRunStage,
		summary: string,
	): Promise<void> {
		try {
			await this.onResearchWorkstreamActivityUpdate?.({ state, run, stage, summary });
		} catch {
			// UI status updates are best-effort and must not affect research execution.
		}
	}

	private async notifyResearchWorkstreamActivityEnd(runId: string): Promise<void> {
		try {
			await this.onResearchWorkstreamActivityEnd?.({ runId });
		} catch {
			// UI status updates are best-effort and must not affect research execution.
		}
	}

	private async maybeRefreshCoordinatorAfterReport(state: CoMathProjectState): Promise<void> {
		if (state.researchReports.length === 0 || state.researchReports.length % 2 !== 0) {
			return;
		}
		const latestCoordinator = state.researchCoordinatorReports.at(-1);
		if (latestCoordinator?.inputReportIds.length === state.researchReports.length) {
			return;
		}
		const result = await persistResearchCoordinatorSynthesisReport(
			state,
			this.researchModelExecutor,
			new Date().toISOString(),
		);
		await saveProjectState(this.statePath, result.state);
	}
}

/**
 * Run the project coordinator synthesis and fold its report, working-paper section, and path
 * decisions into the state. Shared by the automatic post-report refresh and the plan runner's
 * synthesis task. The caller persists the returned state.
 */
export async function persistResearchCoordinatorSynthesisReport(
	state: CoMathProjectState,
	executor: ResearchWorkstreamModelExecutor | undefined,
	now: string,
): Promise<{ state: CoMathProjectState; reportId?: string }> {
	const result = await runResearchCoordinatorSynthesis({ state, executor, now });
	let nextState = upsertWorkingPaperSectionByTitle(state, {
		title: "Project coordinator synthesis",
		body: buildCoordinatorWorkingPaperBody(result.report),
		now,
		actor: "coordinator",
	});
	const section = nextState.workingPaperSections.find(
		(candidate) => candidate.title === "Project coordinator synthesis",
	);
	nextState = addResearchCoordinatorReport(nextState, {
		...result.report,
		...(section ? { workingPaperSectionId: section.id } : {}),
		now,
		actor: "coordinator",
	});
	const report = nextState.researchCoordinatorReports.at(-1);
	if (report) {
		nextState = applyCoordinatorPathDecisions(nextState, report, now);
	}
	return { state: nextState, ...(report ? { reportId: report.id } : {}) };
}

function appendIncrementalReports(
	state: CoMathProjectState,
	runId: string,
	report: ResearchWorkstreamReport,
	now: string,
): CoMathProjectState {
	let nextState = state;
	for (const step of report.steps) {
		nextState = addResearchWorkstreamIncrementalReport(nextState, {
			runId,
			stage: step.role,
			status: "completed",
			title: step.title,
			summary: step.summary,
			details: step.details,
			now,
			actor: "system",
		});
	}
	return nextState;
}

function persistResearchWorkstreamReport(
	state: CoMathProjectState,
	path: ResearchPath,
	report: ResearchWorkstreamReport,
	now: string,
): CoMathProjectState {
	let nextState = updateResearchPath(state, {
		pathId: path.id,
		latestFindings: [...path.latestFindings, ...report.findings],
		blockers: uniqueStrings([...path.blockers, ...report.gaps]),
		suggestedNextMove: report.suggestedNextMove,
		now,
		actor: "system",
	});
	nextState = upsertWorkingPaperSectionByTitle(nextState, {
		title: report.workingPaperSectionTitle,
		body: report.workingPaperSummary,
		now,
		actor: "synthesizer",
	});
	const section = nextState.workingPaperSections.find(
		(candidate) => candidate.title === report.workingPaperSectionTitle,
	);
	const noteCandidates = [
		...report.gaps.map((message) => ({ kind: "gap" as const, message })),
		...report.criticisms.map((message) => ({ kind: "warning" as const, message })),
	].slice(0, 3);
	for (const candidate of noteCandidates) {
		nextState = addMarginNote(nextState, {
			id: `margin-note-${nextState.marginNotes.length + 1}`,
			kind: candidate.kind,
			subjectId: path.id,
			...(section ? { sectionId: section.id } : {}),
			message: candidate.message,
			now,
			actor: "reviewer",
		});
	}
	const scrutinyMessage = report.gaps[0] ?? report.criticisms[0];
	if (scrutinyMessage && !hasOpenMarginNote(nextState, section?.id, "scrutiny", scrutinyMessage)) {
		nextState = addMarginNote(nextState, {
			id: `margin-note-${nextState.marginNotes.length + 1}`,
			kind: "scrutiny",
			subjectId: path.id,
			...(section ? { sectionId: section.id } : {}),
			message: scrutinyMessage,
			now,
			actor: "reviewer",
		});
	}
	nextState = addResearchWorkstreamReport(nextState, {
		pathId: report.pathId,
		pathTitle: report.pathTitle,
		status: report.status,
		startedAt: report.startedAt,
		completedAt: report.completedAt,
		coordinatorBrief: report.coordinatorBrief,
		steps: report.steps,
		promisingStrategy: report.promisingStrategy,
		findings: report.findings,
		criticisms: report.criticisms,
		gaps: report.gaps,
		humanHelpUseful: [],
		suggestedNextMove: report.suggestedNextMove,
		workingPaperSectionTitle: report.workingPaperSectionTitle,
		...(section ? { workingPaperSectionId: section.id } : {}),
		sourceIds: report.sourceIds ?? [],
		claimSupportIds: report.claimSupportIds ?? [],
		computationalArtifactIds: report.computationalArtifactIds ?? [],
		now,
		actor: "synthesizer",
	});
	const persistedReport = nextState.researchReports.at(-1);
	return persistedReport ? addEvidenceBoardEntriesForReport(nextState, persistedReport, now) : nextState;
}

function addEvidenceBoardEntriesForReport(
	state: CoMathProjectState,
	report: NonNullable<CoMathProjectState["researchReports"][number]>,
	now: string,
): CoMathProjectState {
	let nextState = state;
	const supportById = new Map(state.literatureClaimSupports.map((support) => [support.id, support]));
	const artifactById = new Map(state.computationalArtifacts.map((artifact) => [artifact.id, artifact]));
	for (const supportId of report.claimSupportIds) {
		const support = supportById.get(supportId);
		if (!support) {
			continue;
		}
		nextState = addResearchEvidenceBoardEntry(nextState, {
			pathId: report.pathId,
			reportId: report.id,
			claimSupportId: support.id,
			sourceIds: support.sourceIds,
			claim: support.claim,
			classification: classifyLiteratureSupport(support),
			rationale: evidenceRationaleForLiteratureSupport(state, support),
			now,
			actor: "synthesizer",
		});
	}
	for (const artifactId of report.computationalArtifactIds) {
		const artifact = artifactById.get(artifactId);
		if (!artifact || artifact.kind === "script" || artifact.kind === "stderr") {
			continue;
		}
		// A generic title ("Computation output") is not a claim: it says nothing about what was
		// computed, and identical generic titles from different runs would merge distinct
		// computations into one entry. Enrich it with the output summary so the claim states the
		// actual result.
		const summary = summarizeEvidenceText(artifact.summary);
		const claim =
			significantContentTokens(artifact.title).size >= 5 || summary.length === 0
				? artifact.title
				: `${artifact.title}: ${summary}`;
		nextState = addResearchEvidenceBoardEntry(nextState, {
			pathId: report.pathId,
			reportId: report.id,
			computationalArtifactIds: [artifact.id],
			claim,
			classification: "computation",
			rationale: summary || artifact.title,
			now,
			actor: "synthesizer",
		});
	}
	for (const gap of report.gaps.filter((candidate) => isEvidenceWorthyGap(candidate)).slice(0, 3)) {
		nextState = addResearchEvidenceBoardEntry(nextState, {
			pathId: report.pathId,
			reportId: report.id,
			claim: gap,
			classification: classifyUnsupportedOrConflictingText(gap),
			rationale: "Recorded by the critic/synthesizer as a gap or unresolved blocker.",
			now,
			actor: "reviewer",
		});
	}
	for (const note of state.marginNotes.filter((candidate) => candidate.subjectId === report.pathId).slice(-3)) {
		nextState = addResearchEvidenceBoardEntry(nextState, {
			pathId: report.pathId,
			reportId: report.id,
			marginNoteId: note.id,
			claim: note.message,
			classification: classifyMarginNote(note.kind, note.message),
			rationale: `Recorded as an open ${note.kind} margin note for this research path.`,
			now,
			actor: "reviewer",
		});
	}
	return nextState;
}

/**
 * Whether a report gap belongs on the evidence board as an unsupported claim. Imperative rules
 * ("Do not cite X as proving Y") are constraints and already persist as constraint records; label
 * fragments ("Named theorem audit:") are not claims at all.
 */
function isEvidenceWorthyGap(gap: string): boolean {
	const normalized = gap.replace(/\s+/g, " ").trim();
	if (normalized.length < 12 || /[:;,]$/.test(normalized)) {
		return false;
	}
	return !/^(?:do not|don't|never|avoid)\b/i.test(normalized);
}

function classifyLiteratureSupport(support: LiteratureClaimSupport): ResearchEvidenceClassification {
	if (support.status === "conflicting") {
		return "conflicting";
	}
	if (support.status === "unsupported" || support.sourceIds.length === 0) {
		return "unsupported";
	}
	const text = `${support.claim} ${support.note ?? ""}`.toLowerCase();
	if (/\b(?:conjecture|conjectural|hypothesis|open|unresolved)\b/.test(text)) {
		return "conjecture";
	}
	if (/\b(?:heuristic|predict|expected|probabilistic)\b/.test(text)) {
		return "heuristic";
	}
	if (
		/\b(?:irrelevant|does not|do not|not imply|not establish|not prove|no source|no supplied|not settled|related but|weaker|different|context only)\b/.test(
			text,
		)
	) {
		return "survey-context";
	}
	if (/\b(?:survey|context|background|review)\b/.test(text) || support.status === "partially-supported") {
		return "survey-context";
	}
	return "theorem";
}

function classifyUnsupportedOrConflictingText(text: string): ResearchEvidenceClassification {
	return /\b(?:conflict|contradict|inconsistent)\b/i.test(text) ? "conflicting" : "unsupported";
}

function classifyMarginNote(kind: MarginNoteKind, message: string): ResearchEvidenceClassification {
	if (kind === "warning" || kind === "gap" || kind === "scrutiny") {
		return classifyUnsupportedOrConflictingText(message);
	}
	return "survey-context";
}

function evidenceRationaleForLiteratureSupport(
	state: Pick<CoMathProjectState, "literatureSources">,
	support: LiteratureClaimSupport,
): string {
	const sources = support.sourceIds
		.map((sourceId) => state.literatureSources.find((source) => source.id === sourceId))
		.filter((source): source is LiteratureSourceArtifact => source !== undefined);
	const sourceSignals = sources.map(formatSourceTrustSignal);
	return [
		support.note ?? `Recorded as ${support.status} by the literature workstream.`,
		...(sourceSignals.length > 0 ? [`Sources: ${sourceSignals.join("; ")}`] : []),
	].join(" ");
}

function formatSourceTrustSignal(source: LiteratureSourceArtifact): string {
	const pieces = [
		source.title,
		source.sourceType ? `type ${source.sourceType}` : undefined,
		source.venue ? `venue ${source.venue}` : undefined,
		source.doi ? "DOI present" : undefined,
		source.externalId ? `external id ${source.externalId}` : undefined,
		source.publishedAt ?? source.year,
		source.provider ? `via ${source.provider}` : undefined,
	];
	return pieces.filter((piece): piece is string => piece !== undefined && piece.length > 0).join(", ");
}

function summarizeEvidenceText(value: string): string {
	const normalized = value.trim().replace(/\s+/g, " ");
	return normalized.length <= 280 ? normalized : `${normalized.slice(0, 277)}...`;
}

function buildCoordinatorWorkingPaperBody(
	report: Pick<
		CoMathProjectState["researchCoordinatorReports"][number],
		"whatWeKnow" | "roadblocks" | "recommendedNextMoves" | "suggestedPrompt"
	>,
): string {
	return [
		"Project coordinator synthesis",
		"",
		"What we know:",
		...report.whatWeKnow.map((item) => `- ${item}`),
		"",
		"Current roadblocks:",
		...report.roadblocks.map((item) => `- ${item}`),
		"",
		"Recommended next moves:",
		...report.recommendedNextMoves.map((move, index) => {
			const prompt = move.prompt ? ` (${move.prompt})` : "";
			return `${index + 1}. ${move.title}${prompt}: ${move.rationale}`;
		}),
		...(report.suggestedPrompt ? ["", `Suggested next step: ${report.suggestedPrompt}`] : []),
	].join("\n");
}

function applyCoordinatorPathDecisions(
	state: CoMathProjectState,
	report: CoMathProjectState["researchCoordinatorReports"][number],
	now: string,
): CoMathProjectState {
	let nextState = state;
	const suggestedPath = report.suggestedPathId
		? nextState.researchPaths.find((path) => path.id === report.suggestedPathId)
		: undefined;
	if (suggestedPath && suggestedPath.status === "active") {
		nextState = updateResearchPath(nextState, {
			pathId: suggestedPath.id,
			status: "promising",
			now,
			actor: "coordinator",
		});
	}
	for (const path of [...nextState.researchPaths]) {
		if (path.status === "abandoned" || path.status === "resolved") {
			continue;
		}
		const latestReport = [...nextState.researchReports].reverse().find((candidate) => candidate.pathId === path.id);
		if (latestReport?.status === "blocked") {
			const blockedReportCount = nextState.researchReports.filter(
				(candidate) => candidate.pathId === path.id && candidate.status === "blocked",
			).length;
			nextState = updateResearchPath(nextState, {
				pathId: path.id,
				status: blockedReportCount >= 3 && path.id !== suggestedPath?.id ? "abandoned" : "blocked",
				now,
				actor: "coordinator",
			});
		}
	}
	for (const move of report.recommendedNextMoves) {
		if (move.pathId || !/\b(?:split|subpath|new path)\b/i.test(`${move.title} ${move.rationale}`)) {
			continue;
		}
		const title = move.title.replace(/^split\s+/i, "").trim() || "Coordinator subpath";
		if (nextState.researchPaths.some((path) => normalizePathTitle(path.title) === normalizePathTitle(title))) {
			continue;
		}
		nextState = addResearchPath(nextState, {
			title,
			objective: move.rationale,
			suggestedNextMove: move.prompt ?? move.rationale,
			priority: nextState.researchPaths.length + 1,
			now,
			actor: "coordinator",
		});
	}
	return nextState;
}

function normalizePathTitle(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function hasOpenMarginNote(
	state: Pick<CoMathProjectState, "marginNotes">,
	sectionId: string | undefined,
	kind: MarginNoteKind,
	message: string,
): boolean {
	return state.marginNotes.some(
		(note) =>
			note.status === "open" && note.kind === kind && note.sectionId === sectionId && note.message === message,
	);
}

function formatStageTitle(stage: ResearchWorkstreamRunStage): string {
	if (stage === "coordinator") {
		return "Coordinator brief";
	}
	if (stage === "literature-search") {
		return "Literature search";
	}
	if (stage === "computation") {
		return "Computation";
	}
	if (stage === "specialist") {
		return "Specialist attempt";
	}
	if (stage === "critic") {
		return "Critic review";
	}
	return "Synthesis";
}

function findPersistedLiteratureSource(
	current: readonly LiteratureSourceArtifact[],
	previous: readonly LiteratureSourceArtifact[],
	source: LiteratureResearchWorkstreamResult["sources"][number],
): LiteratureSourceArtifact | undefined {
	const previousIds = new Set(previous.map((candidate) => candidate.id));
	return (
		current.find((candidate) => !previousIds.has(candidate.id)) ??
		current.find((candidate) => {
			if (source.doi && candidate.doi === source.doi) return true;
			if (
				source.externalId &&
				candidate.externalId === source.externalId &&
				candidate.provider === source.provider
			) {
				return true;
			}
			if (source.url && candidate.url === source.url) return true;
			if (source.path && candidate.path === source.path) return true;
			return candidate.title.toLowerCase() === source.title.trim().toLowerCase();
		})
	);
}

function remapSourceLabels(value: string, sourceIdMap: ReadonlyMap<string, string>): string {
	let remapped = value;
	for (const [temporaryId, persistedId] of sourceIdMap) {
		remapped = remapped.replaceAll(`[${temporaryId}]`, `[${persistedId}]`);
	}
	return remapped;
}

export function safeErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}
	if (typeof error === "string" && error.trim().length > 0) {
		return error.trim();
	}
	return "The research attempt stopped unexpectedly.";
}

function describeFailedHypotheses(hypotheses: readonly TheoremHypothesisCheck[]): string | undefined {
	const failed = hypotheses.filter((hypothesis) => hypothesis.status === "failed");
	if (failed.length === 0) {
		return undefined;
	}
	return failed
		.map((hypothesis) => `${hypothesis.hypothesis} fails${hypothesis.note ? ` (${hypothesis.note})` : ""}`)
		.join("; ");
}

function uniqueStrings(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}
