import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { ComputationalExecutor } from "./comath-computation-executor.ts";
import {
	createDefaultLiteratureSourceLookup,
	extractLiteratureSearchHints,
	type LiteratureSourceLookup,
	type LiteratureSourceSearchResponse,
	normalizeLiteratureSourceLookupResult,
} from "./comath-literature-source.ts";
import { extractCoMathJsonObject } from "./comath-markdown.ts";
import type { CoMathPreparedArtifact, CoMathStateStore } from "./comath-state-store.ts";
import {
	buildValidatedClaimLedger,
	parseTaskClaims,
	type ValidatedClaimLedgerArtifact,
	type ValidatedResearchClaim,
	validateTaskClaims,
} from "./comath-task-claims.ts";
import type { ResearchWorkstreamModelExecutor } from "./comath-task-model.ts";
import {
	buildTaskCriticPrompt,
	buildTaskSkepticPrompt,
	buildTaskSpecialistPrompt,
	buildTaskSynthesisPrompt,
	type TaskRetryContext,
} from "./comath-task-prompts.ts";
import {
	formatExternalLiteratureSearch,
	inspectTaskSourceLines,
	prepareTaskSourceContext,
	type ResearchRunSourceCatalog,
} from "./comath-task-source-context.ts";
import {
	attachAttemptArtifacts,
	attachAttemptToExecution,
	createTaskAttempt,
	endAttempt,
	getPriorTaskAttemptFailures,
	initializeTaskEngine,
	pauseAttempt,
	resumeTaskAttempt,
	updateAttemptModelCall,
	updateAttemptStage,
} from "./comath-task-state.ts";
import type {
	CoMathProjectState,
	ResearchPlanTaskRecord,
	ResearchTaskAttemptRecord,
	ResearchTaskAttemptStatus,
} from "./schema.ts";

export interface ExecuteResearchTaskInput {
	taskId: string;
	executionId?: string;
	now: string;
}

export interface ExecuteResearchTaskResult {
	attemptId: string;
	status: ResearchTaskAttemptStatus;
}

export interface CoMathTaskEngineOptions {
	stateStore: CoMathStateStore;
	modelExecutor?: ResearchWorkstreamModelExecutor;
	computationalExecutor: ComputationalExecutor;
	notify?: (message: string, type?: "info" | "warning" | "error") => void | Promise<void>;
	literatureSourceLookup?: LiteratureSourceLookup;
}

/** The only active producer lifecycle for new task work. */
export class CoMathTaskEngine {
	private readonly stateStore: CoMathStateStore;
	private readonly modelExecutor: ResearchWorkstreamModelExecutor | undefined;
	private readonly computationalExecutor: ComputationalExecutor;
	private readonly notify: CoMathTaskEngineOptions["notify"];
	private readonly literatureSourceLookup: LiteratureSourceLookup;

	constructor(options: CoMathTaskEngineOptions) {
		this.stateStore = options.stateStore;
		this.modelExecutor = options.modelExecutor;
		this.computationalExecutor = options.computationalExecutor;
		this.notify = options.notify;
		this.literatureSourceLookup = options.literatureSourceLookup ?? createDefaultLiteratureSourceLookup();
	}

	async executeTask(input: ExecuteResearchTaskInput): Promise<ExecuteResearchTaskResult> {
		const created = await this.stateStore.transact(
			{ operation: "task-attempt-create", actor: "human", changedEntityIds: [input.taskId] },
			(state) => {
				const result = createTaskAttempt(state, { taskId: input.taskId, now: input.now, actor: "human" });
				const next = input.executionId
					? attachAttemptToExecution(result.state, input.executionId, result.attempt.id, input.now)
					: result.state;
				return { state: next, result: result.attempt.id };
			},
		);
		return this.runAttempt(created.result, input.now);
	}

	async resumeAttempt(attemptId: string, now: string): Promise<ExecuteResearchTaskResult> {
		await this.stateStore.transact(
			{ operation: "task-attempt-resume", actor: "human", changedEntityIds: [attemptId] },
			(state) => ({ state: resumeTaskAttempt(state, attemptId, now), result: undefined }),
		);
		return this.runAttempt(attemptId, now);
	}

	private async runAttempt(attemptId: string, _now: string): Promise<ExecuteResearchTaskResult> {
		const timestamp = (): string => new Date().toISOString();
		let state = await this.requireState();
		let attempt = requireAttempt(state, attemptId);
		const task = requireTask(state, attempt.taskId);
		const priorFailures = getPriorTaskAttemptFailures(state, task.id, attemptId);
		const priorReviewerFeedback = await this.loadPriorReviewerFeedback(state, task.id, attemptId);
		const retryContext =
			priorFailures.length > 0 || priorReviewerFeedback.length > 0
				? { priorFailures, priorReviewerFeedback }
				: undefined;
		if (attempt.status === "accepted" || attempt.status === "rejected" || attempt.status === "needs-revision") {
			return { attemptId, status: attempt.status };
		}
		if (!this.modelExecutor) {
			return this.pause(
				attempt,
				"specialist",
				"model-unavailable",
				"No assigned Co-Math model is available for the specialist stage.",
				timestamp(),
			);
		}

		let sourceContexts: ReadonlyMap<string, { context: string }>;
		try {
			if (stageIsCompleted(attempt, "evidence-preparation")) {
				sourceContexts = await this.loadAttemptSourceContexts(attempt);
			} else {
				await this.stageRunning(attemptId, "evidence-preparation");
				const externalLiteratureSearch =
					task.kind === "literature-search" ? await this.searchExternalLiterature(state, task) : undefined;
				state = await this.requireState();
				const sourceContext = await prepareTaskSourceContext(
					state,
					task,
					attemptId,
					timestamp(),
					path.join(path.dirname(this.stateStore.statePath), "artifacts"),
					priorFailures,
					priorReviewerFeedback,
					externalLiteratureSearch,
				);
				const committed = await this.stateStore.transactWithArtifacts(
					{ operation: "task-source-catalog", actor: "system", changedEntityIds: [attemptId, task.id] },
					[sourceContext.preparedArtifact],
					(fresh) => ({
						state: attachAttemptArtifacts(
							updateAttemptStage(fresh, {
								attemptId,
								stage: "evidence-preparation",
								status: "completed",
								now: timestamp(),
								artifactIds: [sourceContext.preparedArtifact.id],
							}),
							{ attemptId, sourceCatalogArtifactId: sourceContext.preparedArtifact.id, now: timestamp() },
						),
						result: undefined,
					}),
				);
				state = committed.state;
				attempt = requireAttempt(state, attemptId);
				sourceContexts = sourceContext.contexts;
			}
		} catch (error) {
			return this.pause(attempt, "evidence-preparation", "source-preparation-failed", message(error), timestamp());
		}

		let specialist: string;
		try {
			if (stageIsCompleted(attempt, "specialist")) {
				specialist = await this.loadAttemptStageText(attempt, "specialist");
			} else {
				await this.stageRunning(attemptId, "specialist");
				specialist = await this.runSpecialist(attemptId, task, state, sourceContexts, retryContext);
				const artifact = await stageTextArtifact(this.stateStore.statePath, "specialist", attemptId, specialist);
				const committed = await this.stateStore.transactWithArtifacts(
					{ operation: "task-specialist", actor: "research", changedEntityIds: [attemptId] },
					[artifact],
					(fresh) => ({
						state: updateAttemptStage(fresh, {
							attemptId,
							stage: "specialist",
							status: "completed",
							now: timestamp(),
							artifactIds: [artifact.id],
						}),
						result: undefined,
					}),
				);
				state = committed.state;
				attempt = requireAttempt(state, attemptId);
			}
		} catch (error) {
			return this.pause(attempt, "specialist", "specialist-failed", message(error), timestamp());
		}

		let claims: ValidatedResearchClaim[];
		let hasClaimValidationFailure = false;
		if (stageIsCompleted(attempt, "claim-validation")) {
			claims = await this.loadAttemptClaimLedger(attempt);
		} else {
			const sourceCatalog = await this.loadAttemptSourceCatalog(attempt);
			claims = await validateTaskClaims(state, parseTaskClaims(specialist), sourceCatalog.externalLiteratureSearch);
			const ledger = buildValidatedClaimLedger(attemptId, task.id, claims);
			const ledgerArtifact = await stageJsonArtifact(this.stateStore.statePath, "claim-ledgers", ledger);
			hasClaimValidationFailure = claims.some((claim) => claim.status === "invalid");
			const ledgerCommit = await this.stateStore.transactWithArtifacts(
				{ operation: "task-claim-validation", actor: "system", changedEntityIds: [attemptId, task.id] },
				[ledgerArtifact],
				(fresh) => {
					const committedAt = timestamp();
					let next = attachAttemptArtifacts(fresh, {
						attemptId,
						claimLedgerArtifactId: ledgerArtifact.id,
						now: committedAt,
					});
					next = updateAttemptStage(next, {
						attemptId,
						stage: "claim-validation",
						status: hasClaimValidationFailure ? "blocked" : "completed",
						now: committedAt,
						artifactIds: [ledgerArtifact.id],
						...(hasClaimValidationFailure
							? { failure: claimFailure(claims, "Invalid specialist claim contract or exact grounding.") }
							: {}),
					});
					if (hasClaimValidationFailure)
						next = endAttempt(
							next,
							attemptId,
							"needs-revision",
							committedAt,
							claimFailure(claims, "Invalid specialist claim contract or exact grounding."),
						);
					return { state: next, result: undefined };
				},
			);
			state = ledgerCommit.state;
			attempt = requireAttempt(state, attemptId);
		}
		if (hasClaimValidationFailure) {
			await this.notify?.("Specialist claim validation failed before critique.", "warning");
			return { attemptId, status: attempt.status };
		}
		const computationEvidence = await this.loadAttemptComputationEvidence(attempt);

		let critic: string;
		try {
			if (stageIsCompleted(attempt, "critic")) {
				critic = await this.loadAttemptStageText(attempt, "critic");
			} else {
				await this.stageRunning(attemptId, "critic");
				critic = await this.runRole(
					attemptId,
					"critic",
					"critic",
					"general",
					task,
					state,
					buildTaskCriticPrompt(task, specialist, claims, computationEvidence),
				);
				const artifact = await stageTextArtifact(this.stateStore.statePath, "critic", attemptId, critic);
				await this.completeTextStage(attemptId, "critic", artifact);
				state = await this.requireState();
				attempt = requireAttempt(state, attemptId);
			}
		} catch (error) {
			return this.pause(attempt, "critic", "critic-failed", message(error), timestamp());
		}

		let report: string;
		if (stageIsCompleted(attempt, "synthesis")) {
			report = await this.loadAttemptStageText(attempt, "synthesis", "reports");
		} else {
			try {
				await this.stageRunning(attemptId, "synthesis");
				const synthesis = await this.runRole(
					attemptId,
					"synthesis",
					"synthesizer",
					"general",
					task,
					state,
					buildTaskSynthesisPrompt(task, claims, critic),
				);
				report = assembleValidatedReport(claims, synthesis);
			} catch (_error) {
				report = deterministicReport(claims, critic);
			}
			const reportArtifact = await stageTextArtifact(this.stateStore.statePath, "reports", attemptId, report);
			await this.stateStore.transactWithArtifacts(
				{ operation: "task-synthesis", actor: "research", changedEntityIds: [attemptId] },
				[reportArtifact],
				(fresh) => {
					const completedAt = timestamp();
					return {
						state: attachAttemptArtifacts(
							updateAttemptStage(fresh, {
								attemptId,
								stage: "synthesis",
								status: "completed",
								now: completedAt,
								artifactIds: [reportArtifact.id],
							}),
							{ attemptId, reportArtifactId: reportArtifact.id, now: completedAt },
						),
						result: undefined,
					};
				},
			);
			state = await this.requireState();
			attempt = requireAttempt(state, attemptId);
		}

		if (!stageIsCompleted(attempt, "capability-validation")) {
			const capabilityFailure = capabilityFailureFor(task, claims, attempt);
			if (capabilityFailure) {
				const committed = await this.stateStore.transact(
					{ operation: "task-capability-validation", actor: "system", changedEntityIds: [attemptId, task.id] },
					(fresh) => {
						const blockedAt = timestamp();
						let next = updateAttemptStage(fresh, {
							attemptId,
							stage: "capability-validation",
							status: "blocked",
							failure: capabilityFailure,
							now: blockedAt,
						});
						next = endAttempt(next, attemptId, "needs-revision", blockedAt, capabilityFailure);
						return { state: next, result: undefined };
					},
				);
				return { attemptId, status: requireAttempt(committed.state, attemptId).status };
			}
			await this.stageComplete(attemptId, "capability-validation");
			state = await this.requireState();
			attempt = requireAttempt(state, attemptId);
		}

		let verdict: "accepted" | "needs-revision" | "rejected";
		try {
			if (stageIsCompleted(attempt, "skeptic")) {
				verdict = parseSkepticVerdict(await this.loadAttemptStageText(attempt, "skeptic"));
			} else {
				await this.stageRunning(attemptId, "skeptic");
				const skeptic = await this.runRole(
					attemptId,
					"skeptic",
					"critic",
					"skeptic",
					task,
					state,
					buildTaskSkepticPrompt(task, claims, report, computationEvidence),
				);
				verdict = parseSkepticVerdict(skeptic);
				const artifact = await stageTextArtifact(this.stateStore.statePath, "skeptic", attemptId, skeptic);
				await this.completeTextStage(attemptId, "skeptic", artifact);
			}
		} catch (error) {
			return this.pause(attempt, "skeptic", "skeptic-failed", message(error), timestamp());
		}
		if (verdict !== "accepted") {
			const committed = await this.stateStore.transact(
				{ operation: "task-review", actor: "reviewer", changedEntityIds: [attemptId, task.id] },
				(fresh) => ({
					state: endAttempt(fresh, attemptId, verdict, timestamp(), {
						stage: "skeptic",
						code: "skeptic-verdict",
						message: `Independent skeptic verdict: ${verdict}.`,
						claimIds: [],
						retryable: false,
					}),
					result: undefined,
				}),
			);
			return { attemptId, status: requireAttempt(committed.state, attemptId).status };
		}
		const finalized = await this.stateStore.transact(
			{ operation: "task-finalization", actor: "reviewer", changedEntityIds: [attemptId, task.id] },
			(fresh) => {
				const finalizedAt = timestamp();
				let next = updateAttemptStage(fresh, {
					attemptId,
					stage: "finalization",
					status: "completed",
					now: finalizedAt,
				});
				next = endAttempt(next, attemptId, "accepted", finalizedAt);
				return { state: next, result: undefined };
			},
		);
		return { attemptId, status: requireAttempt(finalized.state, attemptId).status };
	}

	private async runSpecialist(
		attemptId: string,
		task: ResearchPlanTaskRecord,
		state: CoMathProjectState,
		contexts: ReadonlyMap<string, { context: string }>,
		retryContext?: TaskRetryContext,
	): Promise<string> {
		const citable = [...contexts.values()].map((context) => context.context).join("\n\n");
		const inventory = state.literatureSources
			.filter((source) => source.citationEligibility === "inventory-only")
			.map((source) => `- ${source.title} (${source.id}): inventory only; not citable.`)
			.join("\n");
		const currentAttempt = requireAttempt(state, attemptId);
		const priorActionEvidence = await this.loadAttemptComputationEvidence(currentAttempt, true);
		const actionResults: string[] = priorActionEvidence
			? [`PRIOR TASK-OWNED COMPUTATION RESULTS\n${priorActionEvidence}`]
			: [];
		let inspectedCharacters = 0;
		const specialistPurpose =
			task.kind === "computation" ? "computation" : task.kind === "literature-search" ? "literature" : "general";
		const specialistPrompt = (): string =>
			[
				buildTaskSpecialistPrompt(task, citable, inventory, retryContext),
				...(actionResults.length > 0 ? ["SPECIALIST ACTION RESULTS", ...actionResults] : []),
			].join("\n\n");
		let response = await this.runRole(
			attemptId,
			"specialist",
			"specialist",
			specialistPurpose,
			task,
			state,
			specialistPrompt(),
		);
		for (let actionCount = 0; actionCount < 6; actionCount += 1) {
			const action = extractCoMathJsonObject(response);
			if (!action || typeof action.action !== "string") return response;
			if (action.action === "run_computation") {
				if (typeof action.script !== "string" || action.script.length === 0)
					throw new Error("Specialist computation action omitted a script.");
				const result = await this.computationalExecutor.runScript(
					{
						fileName: `attempt-${task.id}.py`,
						language: "python",
						content: action.script,
						summary: typeof action.summary === "string" ? action.summary : "Specialist computation.",
					},
					{
						rootQuestion: state.rootQuestion,
						pathTitle: task.title,
						pathObjective: task.goal ?? task.description,
						workingDirectory: path.dirname(this.stateStore.statePath),
						maxRuntimeMs: 10_000,
					},
				);
				const computationArtifact = await stageJsonArtifact(this.stateStore.statePath, "computations", {
					attemptId,
					taskId: task.id,
					summary: typeof action.summary === "string" ? action.summary : "Specialist computation.",
					script: action.script,
					scriptSha256: createHash("sha256").update(action.script).digest("hex"),
					result,
				});
				await this.stateStore.transactWithArtifacts(
					{ operation: "task-computation", actor: "research", changedEntityIds: [attemptId, task.id] },
					[computationArtifact],
					(fresh) => {
						let next = updateAttemptStage(fresh, {
							attemptId,
							stage: "specialist",
							status: "running",
							now: new Date().toISOString(),
							artifactIds: [computationArtifact.id],
						});
						if (result.exitCode === 0) {
							next = attachAttemptArtifacts(next, {
								attemptId,
								computationArtifactIds: [computationArtifact.id],
								now: new Date().toISOString(),
							});
						}
						return { state: next, result: undefined };
					},
				);
				actionResults.push(
					[
						result.exitCode === 0 ? "SANDBOX RESULT" : "SANDBOX EXECUTION ERROR",
						`ARTIFACT ${computationArtifact.id}`,
						`exit=${result.exitCode}`,
						result.stdout.slice(0, 40_000),
						result.stderr.slice(0, 10_000),
					].join("\n"),
				);
				response = await this.runRole(
					attemptId,
					"specialist",
					"specialist",
					"computation",
					task,
					state,
					specialistPrompt(),
				);
				continue;
			}
			if (action.action === "inspect_source") {
				try {
					if (typeof action.sourceId !== "string" || typeof action.lines !== "object" || action.lines === null) {
						throw new Error("Specialist source inspection omitted its source id or line range.");
					}
					const lines = action.lines as Record<string, unknown>;
					if (typeof lines.start !== "number" || typeof lines.end !== "number") {
						throw new Error("Specialist source inspection requires numeric start and end lines.");
					}
					const inspected = await inspectTaskSourceLines(state, action.sourceId, {
						start: lines.start,
						end: lines.end,
					});
					if (inspectedCharacters + inspected.length > 40_000) {
						throw new Error("Specialist exceeded the 40,000-character source inspection limit.");
					}
					inspectedCharacters += inspected.length;
					actionResults.push(inspected);
				} catch (error) {
					actionResults.push(
						[
							"SOURCE INSPECTION ERROR",
							message(error),
							"Submit a corrected bounded inspect_source action or finish with the Markdown claim contract.",
						].join("\n"),
					);
				}
				response = await this.runRole(
					attemptId,
					"specialist",
					"specialist",
					specialistPurpose,
					task,
					state,
					specialistPrompt(),
				);
				continue;
			}
			return response;
		}
		const finalResponse = await this.runRole(
			attemptId,
			"specialist",
			"specialist",
			specialistPurpose,
			task,
			state,
			`${specialistPrompt()}\n\nACTION BUDGET EXHAUSTED\nDo not request another action. Return the required Markdown claim contract now, using only the evidence already supplied and marking unresolved points unsupported.`,
		);
		const finalAction = extractCoMathJsonObject(finalResponse);
		if (finalAction && typeof finalAction.action === "string") {
			throw new Error(
				"Specialist did not return the Markdown claim contract after its action budget was exhausted.",
			);
		}
		return finalResponse;
	}

	private async runRole(
		attemptId: string,
		stage: ResearchTaskAttemptRecord["currentStage"],
		role: "specialist" | "critic" | "synthesizer",
		purpose: "general" | "computation" | "literature" | "skeptic",
		task: ResearchPlanTaskRecord,
		state: CoMathProjectState,
		prompt: string,
	): Promise<string> {
		if (!this.modelExecutor) throw new Error("No assigned Co-Math model is available.");
		const pathRecord = state.researchPaths.find((candidate) => candidate.id === task.pathId) ?? {
			id: task.pathId ?? task.id,
			title: task.title,
			objective: task.goal ?? task.description,
			suggestedNextMove: task.description,
			priority: 1,
			status: "active" as const,
			latestFindings: [],
			blockers: [],
			createdAt: task.createdAt,
			updatedAt: task.updatedAt,
		};
		const startedAt = new Date().toISOString();
		const started = await this.stateStore.transact(
			{ operation: "task-model-call-start", actor: "research", changedEntityIds: [attemptId] },
			(fresh) => {
				const attempt = requireAttempt(fresh, attemptId);
				const callId = `${attemptId}-model-call-${attempt.modelCalls.length + 1}`;
				let next = attachAttemptArtifacts(fresh, {
					attemptId,
					modelCalls: [{ id: callId, stage, at: startedAt, status: "started", startedAt }],
					now: startedAt,
				});
				next = updateAttemptStage(next, {
					attemptId,
					stage,
					status: "running",
					now: startedAt,
					modelCallIds: [callId],
				});
				return { state: next, result: callId };
			},
		);
		try {
			const response = await this.modelExecutor.run({
				role,
				purpose,
				rootQuestion: state.rootQuestion,
				path: pathRecord,
				allPaths: state.researchPaths,
				priorFindings: [],
				inputText: "",
				prompt,
			});
			const completedAt = new Date().toISOString();
			await this.stateStore.transact(
				{ operation: "task-model-call-complete", actor: "research", changedEntityIds: [attemptId] },
				(fresh) => ({
					state: updateAttemptModelCall(fresh, {
						attemptId,
						callId: started.result,
						status: "completed",
						now: completedAt,
						...(response.provenance ? { provenance: response.provenance } : {}),
					}),
					result: undefined,
				}),
			);
			return response.text;
		} catch (error) {
			const failedAt = new Date().toISOString();
			await this.stateStore.transact(
				{ operation: "task-model-call-fail", actor: "research", changedEntityIds: [attemptId] },
				(fresh) => ({
					state: updateAttemptModelCall(fresh, {
						attemptId,
						callId: started.result,
						status: "failed",
						now: failedAt,
						error: message(error),
					}),
					result: undefined,
				}),
			);
			throw error;
		}
	}

	private async stageRunning(attemptId: string, stage: ResearchTaskAttemptRecord["currentStage"]): Promise<void> {
		const now = new Date().toISOString();
		await this.stateStore.transact(
			{ operation: "task-stage-start", actor: "system", changedEntityIds: [attemptId] },
			(fresh) => ({
				state: updateAttemptStage(initializeTaskEngine(fresh, now), { attemptId, stage, status: "running", now }),
				result: undefined,
			}),
		);
	}

	private async stageComplete(attemptId: string, stage: ResearchTaskAttemptRecord["currentStage"]): Promise<void> {
		const now = new Date().toISOString();
		await this.stateStore.transact(
			{ operation: "task-stage-complete", actor: "system", changedEntityIds: [attemptId] },
			(fresh) => ({
				state: updateAttemptStage(fresh, { attemptId, stage, status: "completed", now }),
				result: undefined,
			}),
		);
	}

	private async completeTextStage(
		attemptId: string,
		stage: ResearchTaskAttemptRecord["currentStage"],
		artifact: CoMathPreparedArtifact,
	): Promise<void> {
		const now = new Date().toISOString();
		await this.stateStore.transactWithArtifacts(
			{ operation: `task-${stage}`, actor: "research", changedEntityIds: [attemptId] },
			[artifact],
			(fresh) => ({
				state: updateAttemptStage(fresh, {
					attemptId,
					stage,
					status: "completed",
					now,
					artifactIds: [artifact.id],
				}),
				result: undefined,
			}),
		);
	}

	private async pause(
		attempt: ResearchTaskAttemptRecord,
		stage: ResearchTaskAttemptRecord["currentStage"],
		code: string,
		detail: string,
		now: string,
	): Promise<ExecuteResearchTaskResult> {
		const failure = { stage, code, message: detail, claimIds: [], retryable: true };
		const committed = await this.stateStore.transact(
			{ operation: "task-pause", actor: "system", changedEntityIds: [attempt.id] },
			(fresh) => ({ state: pauseAttempt(fresh, attempt.id, failure, now), result: undefined }),
		);
		await this.notify?.(`Task ${attempt.taskId} paused at ${stage}: ${detail}`, "warning");
		return { attemptId: attempt.id, status: requireAttempt(committed.state, attempt.id).status };
	}

	private async loadPriorReviewerFeedback(
		state: CoMathProjectState,
		taskId: string,
		excludeAttemptId: string,
	): Promise<string[]> {
		const artifactRoot = path.join(path.dirname(this.stateStore.statePath), "artifacts");
		const attempts = state.researchTaskAttempts.filter(
			(candidate) => candidate.taskId === taskId && candidate.id !== excludeAttemptId,
		);
		const feedback: string[] = [];
		for (const prior of attempts) {
			for (const stage of prior.stages) {
				if (stage.stage !== "critic" && stage.stage !== "skeptic") continue;
				for (const artifactId of stage.artifactIds) {
					const text = await readTextArtifact(path.join(artifactRoot, stage.stage, artifactId, "artifact.json"));
					if (text) feedback.push(`ATTEMPT ${prior.attemptNumber} ${stage.stage.toUpperCase()}\n${text}`);
				}
			}
		}
		return feedback.slice(-4).map((text) => text.slice(0, 4_000));
	}

	private async searchExternalLiterature(
		state: CoMathProjectState,
		task: ResearchPlanTaskRecord,
	): Promise<LiteratureSourceSearchResponse> {
		const acceptedClaimTexts: string[] = [];
		const bibliographicHints: string[] = [];
		const groundingTaskIds = new Set([
			...task.dependsOnTaskIds,
			...state.researchPlanTasks
				.filter(
					(candidate) =>
						candidate.planId === task.planId &&
						candidate.kind === "source-refresh" &&
						candidate.acceptedAttemptId,
				)
				.map((candidate) => candidate.id),
		]);
		for (const groundingTaskId of groundingTaskIds) {
			const dependency = state.researchPlanTasks.find((candidate) => candidate.id === groundingTaskId);
			const acceptedAttempt = dependency?.acceptedAttemptId
				? state.researchTaskAttempts.find((candidate) => candidate.id === dependency.acceptedAttemptId)
				: undefined;
			if (!acceptedAttempt?.claimLedgerArtifactId) continue;
			try {
				const claims = await this.loadAttemptClaimLedger(acceptedAttempt);
				acceptedClaimTexts.push(
					...claims
						.filter((claim) => claim.classification === "source-backed" && claim.status === "validated")
						.map((claim) => claim.text.replace(/\[source-\d+[^\]]*\]/gi, "").trim()),
				);
				const catalog = await this.loadAttemptSourceCatalog(acceptedAttempt);
				bibliographicHints.push(...extractLiteratureSearchHints(catalog.delivered.map((item) => item.context)));
			} catch {
				// A corrupt historical artifact cannot contribute search terms; active evidence preparation still validates itself.
			}
		}
		const rootQuestion =
			bibliographicHints[0] ??
			(acceptedClaimTexts.join(" ") || `${task.title}. ${task.goal ?? task.description}`).slice(0, 2_500);
		const query = {
			rootQuestion,
			pathTitle: task.title,
			pathObjective: task.goal ?? task.description,
			maxSources: 10,
			maxResultsPerProvider: 5,
			timeoutMs: 8_000,
		};
		const result = normalizeLiteratureSourceLookupResult(await this.literatureSourceLookup.search(query), query);
		if (!result.providers.some((provider) => provider.provider !== "workspace" && provider.status === "completed")) {
			const failures = result.providers
				.filter((provider) => provider.provider !== "workspace")
				.map((provider) => `${provider.provider}: ${provider.error ?? provider.status}`)
				.join("; ");
			throw new Error(`External literature search had no successful provider${failures ? ` (${failures})` : ""}.`);
		}
		return {
			sources: result.sources.slice(0, 10).map((source) => {
				const { extractedText: _extractedText, ...metadata } = source;
				return { ...metadata, summary: source.summary.slice(0, 4_000) };
			}),
			providers: result.providers,
			queries: result.queries.slice(0, 4),
			candidateCount: result.candidateCount,
		};
	}

	private async loadAttemptSourceContexts(
		attempt: ResearchTaskAttemptRecord,
	): Promise<ReadonlyMap<string, { context: string }>> {
		const catalog = await this.loadAttemptSourceCatalog(attempt);
		const contexts = new Map<string, { context: string }>();
		for (const delivered of catalog.delivered) {
			contexts.set(delivered.sourceId, { context: delivered.context });
		}
		if (catalog.externalLiteratureSearch) {
			contexts.set("external-literature-search", {
				context: formatExternalLiteratureSearch(catalog.externalLiteratureSearch),
			});
		}
		return contexts;
	}

	private async loadAttemptSourceCatalog(attempt: ResearchTaskAttemptRecord): Promise<ResearchRunSourceCatalog> {
		if (!attempt.sourceCatalogArtifactId) throw new Error("Completed source preparation has no catalog artifact.");
		const artifactId = attempt.sourceCatalogArtifactId;
		const artifactPath = path.join(
			path.dirname(this.stateStore.statePath),
			"artifacts",
			"source-catalogs",
			artifactId,
			"catalog.json",
		);
		const parsed = await readJsonArtifact(artifactPath, artifactId);
		if (!isRecord(parsed) || !Array.isArray(parsed.delivered)) {
			throw new Error(`Source catalog artifact ${artifactId} is invalid.`);
		}
		const catalog = parsed as unknown as ResearchRunSourceCatalog;
		for (const delivered of catalog.delivered) {
			if (typeof delivered.sourceId !== "string" || typeof delivered.context !== "string") {
				throw new Error(`Source catalog artifact ${artifactId} contains an invalid delivery.`);
			}
		}
		return catalog;
	}

	private async loadAttemptStageText(
		attempt: ResearchTaskAttemptRecord,
		stage: "specialist" | "critic" | "synthesis" | "skeptic",
		artifactDirectory: string = stage,
	): Promise<string> {
		const stageRecord = attempt.stages.find((candidate) => candidate.stage === stage);
		const artifactId = stageRecord?.artifactIds.at(-1);
		if (!artifactId) throw new Error(`Completed ${stage} stage has no output artifact.`);
		const artifactPath = path.join(
			path.dirname(this.stateStore.statePath),
			"artifacts",
			artifactDirectory,
			artifactId,
			"artifact.json",
		);
		const text = await readTextArtifact(artifactPath, artifactId);
		if (!text) throw new Error(`Completed ${stage} artifact ${artifactId} is invalid.`);
		return text;
	}

	private async loadAttemptClaimLedger(attempt: ResearchTaskAttemptRecord): Promise<ValidatedResearchClaim[]> {
		if (!attempt.claimLedgerArtifactId) throw new Error("Completed claim validation has no ledger artifact.");
		const artifactId = attempt.claimLedgerArtifactId;
		const artifactPath = path.join(
			path.dirname(this.stateStore.statePath),
			"artifacts",
			"claim-ledgers",
			artifactId,
			"artifact.json",
		);
		const parsed = await readJsonArtifact(artifactPath, artifactId);
		if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.claims)) {
			throw new Error(`Claim ledger artifact ${artifactId} is invalid.`);
		}
		const ledger = parsed as unknown as ValidatedClaimLedgerArtifact;
		if (ledger.attemptId !== attempt.id || ledger.taskId !== attempt.taskId) {
			throw new Error(`Claim ledger artifact ${artifactId} does not belong to attempt ${attempt.id}.`);
		}
		return ledger.claims;
	}

	private async loadAttemptComputationEvidence(
		attempt: ResearchTaskAttemptRecord,
		includeFailedStageArtifacts: boolean = false,
	): Promise<string> {
		const artifactRoot = path.join(path.dirname(this.stateStore.statePath), "artifacts", "computations");
		const evidence: string[] = [];
		let remaining = 40_000;
		const specialistArtifactIds = includeFailedStageArtifacts
			? (attempt.stages.find((stage) => stage.stage === "specialist")?.artifactIds ?? [])
			: [];
		for (const artifactId of [...new Set([...attempt.computationArtifactIds, ...specialistArtifactIds])]) {
			let parsed: unknown;
			try {
				parsed = await readJsonArtifact(path.join(artifactRoot, artifactId, "artifact.json"), artifactId);
			} catch {
				continue;
			}
			const rendered = `ARTIFACT ${artifactId}\n${JSON.stringify(parsed, null, 2)}`;
			if (remaining <= 0) break;
			const bounded = rendered.slice(0, remaining);
			evidence.push(bounded);
			remaining -= bounded.length;
		}
		return evidence.join("\n\n");
	}

	private async requireState(): Promise<CoMathProjectState> {
		const state = await this.stateStore.load();
		if (!state) throw new Error("Co-Math project state is missing.");
		return state;
	}
}

function stageIsCompleted(
	attempt: ResearchTaskAttemptRecord,
	stage: ResearchTaskAttemptRecord["currentStage"],
): boolean {
	return attempt.stages.some((candidate) => candidate.stage === stage && candidate.status === "completed");
}

function requireAttempt(state: CoMathProjectState, attemptId: string): ResearchTaskAttemptRecord {
	const attempt = state.researchTaskAttempts.find((candidate) => candidate.id === attemptId);
	if (!attempt) throw new Error(`Unknown research attempt ${attemptId}.`);
	return attempt;
}

function requireTask(state: CoMathProjectState, taskId: string): ResearchPlanTaskRecord {
	const task = state.researchPlanTasks.find((candidate) => candidate.id === taskId);
	if (!task) throw new Error(`Unknown research task ${taskId}.`);
	return task;
}

function claimFailure(claims: readonly ValidatedResearchClaim[], message: string) {
	return {
		stage: "claim-validation" as const,
		code: "grounding-invalid",
		message,
		claimIds: claims.filter((claim) => claim.status === "invalid").map((claim) => claim.id),
		retryable: false,
	};
}

function capabilityFailureFor(
	task: ResearchPlanTaskRecord,
	claims: readonly ValidatedResearchClaim[],
	attempt: ResearchTaskAttemptRecord,
) {
	if (
		task.kind === "literature-search" &&
		!claims.some(
			(claim) =>
				claim.status === "validated" &&
				claim.groundings.some((grounding) => grounding.locator.kind === "external-record"),
		)
	) {
		return {
			stage: "capability-validation" as const,
			code: "missing-external-literature-grounding",
			message:
				"A literature-search task requires at least one claim grounded in a selected external provider record.",
			claimIds: [],
			retryable: false,
		};
	}
	if (
		task.requiredCapabilities.includes("source-grounding") &&
		!claims.some((claim) => claim.classification === "source-backed" && claim.status === "validated")
	) {
		return {
			stage: "capability-validation" as const,
			code: "missing-source-grounding",
			message: "The task requires validated exact source grounding.",
			claimIds: [],
			retryable: false,
		};
	}
	if (task.requiredCapabilities.includes("sandboxed-computation") && attempt.computationArtifactIds.length === 0) {
		return {
			stage: "capability-validation" as const,
			code: "missing-sandboxed-computation",
			message: "The task requires a task-owned sandbox computation artifact.",
			claimIds: [],
			retryable: false,
		};
	}
	return undefined;
}

function parseSkepticVerdict(text: string): "accepted" | "needs-revision" | "rejected" {
	const verdict = /^\s*(accepted|needs-revision|rejected)\s*$/im.exec(text)?.[1];
	if (verdict === "accepted" || verdict === "needs-revision" || verdict === "rejected") return verdict;
	throw new Error("Independent skeptic did not return an explicit verdict.");
}

function deterministicReport(claims: readonly ValidatedResearchClaim[], critic: string): string {
	return ["## Findings", ...claims.map((claim) => `- ${claim.id}: ${claim.text}`), "", "## Critic", critic].join("\n");
}

function assembleValidatedReport(claims: readonly ValidatedResearchClaim[], synthesis: string): string {
	return ["## Findings", ...claims.map((claim) => `- ${claim.id}: ${claim.text}`), "", synthesis.trim()]
		.filter(Boolean)
		.join("\n");
}

async function stageTextArtifact(
	statePath: string,
	kind: string,
	attemptId: string,
	text: string,
): Promise<CoMathPreparedArtifact> {
	return stageJsonArtifact(statePath, kind, {
		attemptId,
		text,
	});
}

async function stageJsonArtifact(statePath: string, kind: string, value: object): Promise<CoMathPreparedArtifact> {
	const serialized = `${JSON.stringify(value, null, "\t")}\n`;
	const sha256 = createHash("sha256").update(serialized).digest("hex");
	const root = path.join(path.dirname(statePath), "artifacts");
	const stagingPath = path.join(root, ".staging", `${kind}-${sha256}`);
	const finalPath = path.join(root, kind, sha256);
	await mkdir(stagingPath, { recursive: true });
	await writeFile(path.join(stagingPath, "artifact.json"), serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
	return { id: sha256, stagingPath, finalPath, contentPath: "artifact.json", sha256 };
}

async function readTextArtifact(artifactPath: string, expectedSha256?: string): Promise<string | undefined> {
	try {
		const parsed = await readJsonArtifact(artifactPath, expectedSha256);
		if (!isRecord(parsed) || typeof parsed.text !== "string") return undefined;
		return parsed.text;
	} catch {
		return undefined;
	}
}

async function readJsonArtifact(artifactPath: string, expectedSha256?: string): Promise<unknown> {
	const serialized = await readFile(artifactPath, "utf8");
	if (expectedSha256 && createHash("sha256").update(serialized).digest("hex") !== expectedSha256) {
		throw new Error(`Artifact digest mismatch at ${artifactPath}.`);
	}
	return JSON.parse(serialized) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
