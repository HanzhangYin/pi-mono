import * as nodePath from "node:path";
import type { ComputationalExecutor } from "./comath-computation-executor.ts";
import {
	type ComputationResearchWorkstreamResult,
	isComputationalResearchPath,
	runComputationResearchWorkstreamStaged,
} from "./comath-computation-workstream.ts";
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
import {
	type ResearchWorkstreamModelExecutor,
	type ResearchWorkstreamStageResult,
	runModelBackedResearchWorkstreamStaged,
} from "./comath-research-model-workstream.ts";
import { type ResearchWorkstreamReport, runResearchWorkstream } from "./comath-research-workstream.ts";
import type {
	CoMathProjectState,
	LiteratureSourceArtifact,
	MarginNoteKind,
	ResearchPath,
	ResearchWorkstreamRunRecord,
	ResearchWorkstreamRunStage,
} from "./schema.ts";
import {
	addComputationalArtifact,
	addLiteratureClaimSupport,
	addLiteratureSourceArtifact,
	addMarginNote,
	addResearchWorkstreamIncrementalReport,
	addResearchWorkstreamReport,
	addResearchWorkstreamRun,
	failStaleResearchWorkstreamRuns,
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
		const now = new Date().toISOString();
		const runId = `research-run-${state.researchWorkstreamRuns.length + 1}`;
		let nextState = addResearchWorkstreamRun(state, {
			id: runId,
			pathId: path.id,
			pathTitle: path.title,
			currentStage: "coordinator",
			batchId,
			batchStepIndex: stepIndex,
			now,
			actor: "system",
		});
		await saveProjectState(this.statePath, nextState);
		const run = nextState.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
		if (run) {
			await this.notifyResearchWorkstreamActivityStart(nextState, run);
		}
		if (this.researchModelExecutor) {
			const workstream = this.executeResearchWorkstreamInBackground(runId).finally(async () => {
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
		const completedRun = nextState.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
		if (completedRun) {
			await this.notifyResearchWorkstreamCompletedStages(nextState, completedRun, report);
		}
		await this.notifyResearchWorkstreamActivityEnd(runId);
		await this.notify(formatResearchWorkstreamCompleted({ state: nextState, report }));
		return runId;
	}

	private async executeResearchWorkstreamInBackground(runId: string): Promise<void> {
		const state = await loadProjectState(this.statePath);
		const run = state?.researchWorkstreamRuns.find((candidate) => candidate.id === runId);
		const path = run ? state?.researchPaths.find((candidate) => candidate.id === run.pathId) : undefined;
		if (!state || !run || !path) {
			return;
		}
		const now = new Date().toISOString();
		try {
			if (isLiteratureResearchPath(path)) {
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
			if (isComputationalResearchPath(path)) {
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
			const report = await runModelBackedResearchWorkstreamStaged(
				{
					rootQuestion: state.rootQuestion,
					path,
					allPaths: state.researchPaths,
					now,
					executor: this.researchModelExecutor as ResearchWorkstreamModelExecutor,
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
			await this.completeResearchWorkstreamRun(runId, report);
		} catch (error: unknown) {
			await this.completeResearchWorkstreamWithFallback(runId, error);
		}
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
		await this.notify(formatResearchWorkstreamCompleted({ state: nextState, report }));
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
		for (const [index, source] of result.sources.entries()) {
			const before = nextState.literatureSources;
			nextState = addLiteratureSourceArtifact(nextState, {
				kind: source.kind,
				title: source.title,
				...(source.url ? { url: source.url } : {}),
				...(source.path ? { path: source.path } : {}),
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
		const claimSupportIds: string[] = [];
		for (const support of result.claimSupports) {
			nextState = addLiteratureClaimSupport(nextState, {
				pathId: path.id,
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
	const scrutinyMessage = report.humanHelpUseful[0] ?? report.gaps[0] ?? report.criticisms[0];
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
	return addResearchWorkstreamReport(nextState, {
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
		humanHelpUseful: report.humanHelpUseful,
		suggestedNextMove: report.suggestedNextMove,
		workingPaperSectionTitle: report.workingPaperSectionTitle,
		...(section ? { workingPaperSectionId: section.id } : {}),
		sourceIds: report.sourceIds ?? [],
		claimSupportIds: report.claimSupportIds ?? [],
		computationalArtifactIds: report.computationalArtifactIds ?? [],
		now,
		actor: "synthesizer",
	});
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

function uniqueStrings(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}
