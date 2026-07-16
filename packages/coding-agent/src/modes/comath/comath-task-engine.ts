import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { ComputationalExecutor, ComputationalScriptDraft } from "./comath-computation-executor.ts";
import { extractStructuredReviewFindings } from "./comath-critic-repair-policy.ts";
import {
	createDefaultLiteratureSourceLookup,
	enrichLiteratureSourcesWithFullText,
	extractLiteratureSearchHints,
	type LiteratureSourceLookup,
	type LiteratureSourceResult,
	type LiteratureSourceSearchResponse,
	normalizeLiteratureSourceLookupResult,
	prepareLiteratureSourceForCatalog,
} from "./comath-literature-source.ts";
import { extractCoMathJsonObject } from "./comath-markdown.ts";
import { buildMathPrimitiveDraft } from "./comath-math-primitives.ts";
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
	searchTaskSourceLiterals,
} from "./comath-task-source-context.ts";
import {
	attachAttemptArtifacts,
	attachAttemptReviewFindings,
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
import { significantContentTokens } from "./comath-text-similarity.ts";
import type {
	CoMathProjectState,
	ResearchAttemptFailure,
	ResearchPlanTaskRecord,
	ResearchReviewFindingRecord,
	ResearchTaskAttemptRecord,
	ResearchTaskAttemptStatus,
} from "./schema.ts";
import { addLiteratureSearchRecord, addLiteratureSourceArtifact } from "./storage.ts";

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

const MAX_ACCEPTED_PROJECT_CONTEXT_DETAILS = 8;
const MAX_ACCEPTED_TASK_INDEX_DESCRIPTION_CHARACTERS = 240;

export function recordExternalLiteratureSources(
	state: CoMathProjectState,
	sources: readonly LiteratureSourceResult[],
	now: string,
): CoMathProjectState {
	let next = state;
	for (const source of sources) {
		const duplicate = next.literatureSources.find((candidate) => {
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
			return !source.url && !source.path && candidate.title.toLowerCase() === source.title.toLowerCase();
		});
		const extractedText = source.extractedText?.trim();
		if (duplicate && extractedText && extractedText.length > (duplicate.extractedText?.length ?? 0)) {
			next = {
				...next,
				literatureSources: next.literatureSources.map((candidate) =>
					candidate.id === duplicate.id
						? {
								...candidate,
								...(source.url ? { url: source.url } : {}),
								...(source.provider ? { provider: source.provider } : {}),
								...(source.externalId ? { externalId: source.externalId } : {}),
								extractedText,
								citationEligibility: "citable",
								...(source.sourceFileSha256 ? { sourceFileSha256: source.sourceFileSha256 } : {}),
								updatedAt: now,
							}
						: candidate,
				),
				updatedAt: now,
			};
			continue;
		}
		next = addLiteratureSourceArtifact(next, {
			kind: source.kind ?? "unknown",
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
			authors: source.authors,
			...(source.year ? { year: source.year } : {}),
			summary: source.summary,
			...(source.extractedText ? { extractedText: source.extractedText } : {}),
			citationEligibility: source.extractedText ? "citable" : "inventory-only",
			...(source.sourceFileSha256 ? { sourceFileSha256: source.sourceFileSha256 } : {}),
			now,
			actor: "system",
		});
	}
	return next;
}

export function buildPersistedLiteratureSearchForTask(
	state: CoMathProjectState,
	task: ResearchPlanTaskRecord,
): LiteratureSourceSearchResponse | undefined {
	const taskText = [task.title, task.description, task.goal ?? "", ...task.acceptanceCriteria].join("\n");
	const referencedIds = new Set(taskText.match(/\bsource-\d+\b/gi)?.map((id) => id.toLowerCase()) ?? []);
	const taskTokens = significantContentTokens(taskText);
	const labelledStatements =
		taskText
			.match(/\b(?:theorem|conjecture|question|problem)\s+\d+(?:\.\d+)?\b/gi)
			?.map((label) => label.toLowerCase()) ?? [];
	const sources = state.literatureSources
		.filter(
			(source) =>
				source.citationEligibility === "citable" &&
				Boolean(source.extractedText) &&
				Boolean(source.sourceFileSha256),
		)
		.map((source) => {
			const exactReference = referencedIds.has(source.id.toLowerCase());
			const sourceTokens = significantContentTokens(`${source.title}\n${source.summary}`);
			const sharedTokens = [...taskTokens].filter((token) => sourceTokens.has(token)).length;
			const extractedText = source.extractedText?.toLowerCase() ?? "";
			const labelledMatch = labelledStatements.some((label) => extractedText.includes(label));
			return { source, exactReference, sharedTokens, labelledMatch };
		})
		.filter((candidate) =>
			referencedIds.size > 0 ? candidate.exactReference : candidate.sharedTokens >= 3 || candidate.labelledMatch,
		)
		.sort(
			(left, right) =>
				Number(right.exactReference) * 1_000 +
				right.sharedTokens +
				Number(right.labelledMatch) * 20 -
				(Number(left.exactReference) * 1_000 + left.sharedTokens + Number(left.labelledMatch) * 20),
		)
		.slice(0, 3)
		.map(
			({ source }): LiteratureSourceResult => ({
				id: source.id,
				title: source.title,
				kind: source.kind,
				summary: source.summary,
				extractedText: source.extractedText,
				authors: [...source.authors],
				citationEligibility: source.citationEligibility,
				sourceFileSha256: source.sourceFileSha256,
				...(source.url ? { url: source.url } : {}),
				...(source.path ? { path: source.path } : {}),
				...(source.provider ? { provider: source.provider } : {}),
				...(source.externalId ? { externalId: source.externalId } : {}),
				...(source.doi ? { doi: source.doi } : {}),
				...(source.venue ? { venue: source.venue } : {}),
				...(source.publishedAt ? { publishedAt: source.publishedAt } : {}),
				...(source.citationCount !== undefined ? { citationCount: source.citationCount } : {}),
				...(source.sourceType ? { sourceType: source.sourceType } : {}),
				...(source.year ? { year: source.year } : {}),
				...(source.workspaceRole ? { workspaceRole: source.workspaceRole } : {}),
			}),
		);
	if (sources.length === 0) return undefined;
	const query = `persisted:${sources.map((source) => source.id).join(",")}`;
	return {
		sources,
		providers: [{ provider: "workspace", query, status: "completed", candidateCount: sources.length }],
		queries: [query],
		candidateCount: sources.length,
	};
}

export function requiresExternalLiteratureLookup(
	task: ResearchPlanTaskRecord,
	persisted: LiteratureSourceSearchResponse | undefined,
): boolean {
	const taskText = [task.title, task.description, task.goal ?? "", ...task.acceptanceCriteria].join(" ");
	const requestsReplacementForDefectiveText =
		/\b(?:uncorrupted|corrupt(?:ed|ion)?|garbled|unreadable|truncated|malformed|damaged|broken extraction|missing equations?|omitted passage)\b/i.test(
			taskText,
		);
	if (task.kind === "source-refresh") {
		return (
			requestsReplacementForDefectiveText &&
			/\b(?:alternate|different|other)\b.{0,80}\b(?:provider|source|copy|version)\b|\b(?:native arxiv|publisher (?:html|pdf|source)|external provider)\b/i.test(
				taskText,
			)
		);
	}
	if (task.kind !== "literature-search") return false;
	return persisted === undefined || requestsReplacementForDefectiveText;
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
		const acceptedProjectContext = await this.loadAcceptedProjectContext(state, attemptId);
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
				const persistedLiterature = buildPersistedLiteratureSearchForTask(state, task);
				const requiresProviderSearch = requiresExternalLiteratureLookup(task, persistedLiterature);
				const literatureSearchStartedAt = requiresProviderSearch ? timestamp() : undefined;
				const externalLiteratureSearch = requiresProviderSearch
					? await this.searchExternalLiterature(state, task)
					: persistedLiterature;
				const literatureSearchCompletedAt = requiresProviderSearch ? timestamp() : undefined;
				state = await this.requireState();
				const evidencePreparedAt = timestamp();
				const sourceContext = await prepareTaskSourceContext(
					state,
					task,
					attemptId,
					evidencePreparedAt,
					path.join(path.dirname(this.stateStore.statePath), "artifacts"),
					priorFailures,
					priorReviewerFeedback,
					externalLiteratureSearch,
				);
				const committed = await this.stateStore.transactWithArtifacts(
					{ operation: "task-source-catalog", actor: "system", changedEntityIds: [attemptId, task.id] },
					[sourceContext.preparedArtifact],
					(fresh) => {
						let next = attachAttemptArtifacts(
							updateAttemptStage(fresh, {
								attemptId,
								stage: "evidence-preparation",
								status: "completed",
								now: evidencePreparedAt,
								artifactIds: [sourceContext.preparedArtifact.id],
							}),
							{ attemptId, sourceCatalogArtifactId: sourceContext.preparedArtifact.id, now: evidencePreparedAt },
						);
						if (
							externalLiteratureSearch &&
							literatureSearchStartedAt &&
							literatureSearchCompletedAt &&
							!next.literatureSearches.some((search) => search.runId === attemptId)
						) {
							next = recordExternalLiteratureSources(next, externalLiteratureSearch.sources, evidencePreparedAt);
							next = addLiteratureSearchRecord(next, {
								id: `literature-search-${attemptId}`,
								...(task.pathId ? { pathId: task.pathId } : {}),
								runId: attemptId,
								queries: externalLiteratureSearch.queries,
								providers: externalLiteratureSearch.providers,
								candidateCount: externalLiteratureSearch.candidateCount,
								startedAt: literatureSearchStartedAt,
								completedAt: literatureSearchCompletedAt,
								now: evidencePreparedAt,
								actor: "system",
							});
						}
						return { state: next, result: undefined };
					},
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
				specialist = await this.runSpecialist(
					attemptId,
					task,
					state,
					sourceContexts,
					retryContext,
					acceptedProjectContext,
				);
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
		const internalSourceEvidence = await this.loadAttemptInternalSourceEvidence(attempt);
		const literatureEvidence = sourceContexts.get("external-literature-search")?.context ?? "";

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
					buildTaskCriticPrompt(
						task,
						specialist,
						claims,
						computationEvidence,
						acceptedProjectContext,
						literatureEvidence,
						internalSourceEvidence,
					),
				);
				const artifact = await stageTextArtifact(this.stateStore.statePath, "critic", attemptId, critic);
				await this.completeTextStage(
					attemptId,
					"critic",
					artifact,
					extractStructuredReviewFindings(attemptId, "critic", critic),
				);
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
					buildTaskSynthesisPrompt(
						task,
						claims,
						critic,
						acceptedProjectContext,
						literatureEvidence,
						internalSourceEvidence,
					),
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
			const capabilityFailure = capabilityFailureFor(state, task, claims, attempt, report);
			if (capabilityFailure) {
				const capabilityFinding = capabilityReviewFinding(attemptId, capabilityFailure);
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
						if (capabilityFinding) {
							next = attachAttemptReviewFindings(next, {
								attemptId,
								findings: [capabilityFinding],
								now: blockedAt,
							});
						}
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
					buildTaskSkepticPrompt(
						task,
						claims,
						report,
						computationEvidence,
						acceptedProjectContext,
						literatureEvidence,
						internalSourceEvidence,
					),
				);
				verdict = parseSkepticVerdict(skeptic);
				const artifact = await stageTextArtifact(this.stateStore.statePath, "skeptic", attemptId, skeptic);
				await this.completeTextStage(
					attemptId,
					"skeptic",
					artifact,
					extractStructuredReviewFindings(attemptId, "skeptic", skeptic),
				);
			}
		} catch (error) {
			return this.pause(attempt, "skeptic", "skeptic-failed", message(error), timestamp());
		}
		const repairCertificateExplicitlyUnestablished =
			task.goal?.startsWith("CRITIC-DRIVEN REPAIR") === true &&
			/\b(?:requested |named |source |capability )?certificate (?:is|was|remains) not established\b/i.test(
				report.replaceAll("*", ""),
			);
		if (verdict !== "accepted" || repairCertificateExplicitlyUnestablished) {
			const finalVerdict = repairCertificateExplicitlyUnestablished ? "needs-revision" : verdict;
			const committed = await this.stateStore.transact(
				{ operation: "task-review", actor: "reviewer", changedEntityIds: [attemptId, task.id] },
				(fresh) => ({
					state: endAttempt(fresh, attemptId, finalVerdict, timestamp(), {
						stage: "skeptic",
						code: repairCertificateExplicitlyUnestablished
							? "repair-certificate-unestablished"
							: "skeptic-verdict",
						message: repairCertificateExplicitlyUnestablished
							? "The repair synthesis explicitly states that its required certificate is not established."
							: `Independent skeptic verdict: ${verdict}.`,
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
		acceptedProjectContext: string = "",
	): Promise<string> {
		const citable = [...contexts.values()].map((context) => context.context).join("\n\n");
		const inventory = state.literatureSources
			.filter((source) => source.citationEligibility === "inventory-only")
			.map((source) => `- ${source.title} (${source.id}): inventory only; not citable.`)
			.join("\n");
		const currentAttempt = requireAttempt(state, attemptId);
		const priorActionEvidence = await this.loadAttemptComputationEvidence(currentAttempt, true);
		const resumedWithSuccessfulComputation = currentAttempt.computationArtifactIds.length > 0;
		let hasSuccessfulComputation = resumedWithSuccessfulComputation;
		const referencedAttemptIds = [
			...new Set(
				[task.goal, task.description, ...task.acceptanceCriteria]
					.join("\n")
					.match(/research-attempt-[A-Za-z0-9_-]+/g) ?? [],
			),
		].filter((referencedAttemptId) => referencedAttemptId !== attemptId);
		const referencedArtifactIds = [
			...new Set(
				[task.goal, task.description, ...task.acceptanceCriteria].join("\n").match(/\b[a-f0-9]{64}\b/g) ?? [],
			),
		];
		const internalAttemptEvidence: string[] = [];
		let remainingInternalAttemptCharacters = 40_000;
		for (const referencedAttemptId of referencedAttemptIds.slice(0, 3)) {
			const referencedAttempt = state.researchTaskAttempts.find((candidate) => candidate.id === referencedAttemptId);
			if (!referencedAttempt) continue;
			for (const stage of ["specialist", "critic", "synthesis"] as const) {
				const stageArtifactId = referencedAttempt.stages
					.find((candidate) => candidate.stage === stage && candidate.status === "completed")
					?.artifactIds.at(-1);
				if (!stageArtifactId || remainingInternalAttemptCharacters <= 0) continue;
				try {
					const stageText = await this.loadAttemptStageText(referencedAttempt, stage);
					const rendered =
						`INTERNAL ATTEMPT ${referencedAttemptId} · ${stage} · ARTIFACT ${stageArtifactId}\n${stageText}`.slice(
							0,
							remainingInternalAttemptCharacters,
						);
					internalAttemptEvidence.push(rendered);
					remainingInternalAttemptCharacters -= rendered.length;
				} catch {}
			}
		}
		const internalSourceRoot = path.join(path.dirname(this.stateStore.statePath), "artifacts", "internal-sources");
		for (const artifactId of referencedArtifactIds.slice(0, 3)) {
			if (remainingInternalAttemptCharacters <= 0) break;
			let serialized: string;
			try {
				serialized = await readFile(path.join(internalSourceRoot, artifactId, "artifact.txt"), "utf8");
			} catch {
				continue;
			}
			if (createHash("sha256").update(serialized).digest("hex") !== artifactId) continue;
			const rendered =
				`REFERENCED INTERNAL ARTIFACT ${artifactId}\nLOCATOR artifacts/internal-sources/${artifactId}/artifact.txt\n${serialized}`.slice(
					0,
					remainingInternalAttemptCharacters,
				);
			internalAttemptEvidence.push(rendered);
			remainingInternalAttemptCharacters -= rendered.length;
		}
		const internalSourceText = internalAttemptEvidence.join("\n\n");
		let taskOwnedInternalSourceArtifact: CoMathPreparedArtifact | undefined;
		if (internalSourceText) {
			const artifact = await stageLineAddressedArtifact(
				this.stateStore.statePath,
				"internal-sources",
				attemptId,
				referencedAttemptIds.slice(0, 3),
				internalSourceText,
			);
			taskOwnedInternalSourceArtifact = artifact;
			await this.stateStore.transactWithArtifacts(
				{ operation: "task-internal-source", actor: "system", changedEntityIds: [attemptId, task.id] },
				[artifact],
				(fresh) => ({
					state: updateAttemptStage(fresh, {
						attemptId,
						stage: "specialist",
						status: "running",
						now: new Date().toISOString(),
						artifactIds: [artifact.id],
					}),
					result: undefined,
				}),
			);
		}
		const actionResults: string[] = [
			...(priorActionEvidence ? [`PRIOR TASK-OWNED COMPUTATION RESULTS\n${priorActionEvidence}`] : []),
			...(internalAttemptEvidence.length > 0
				? [
						`TASK-OWNED INTERNAL SOURCE SNAPSHOT\nARTIFACT ${taskOwnedInternalSourceArtifact?.id}\nLOCATOR artifacts/internal-sources/${taskOwnedInternalSourceArtifact?.id}/artifact.txt@L1-L${internalSourceText.split("\n").length + 2}\nThis is a bounded immutable snapshot of draft artifacts, not accepted project knowledge and not an external citation. Cite its artifact digest and exact line range, independently verify its mathematical content, and preserve every stated gap.\n\n${internalSourceText}`,
					]
				: []),
		];
		if (resumedWithSuccessfulComputation) {
			actionResults.push(
				"RETRY SIDE-EFFECT POLICY\nSuccessful task-owned computation artifacts survived the interrupted specialist call. Do not run another computation in this resumed stage. Return the required Markdown claim contract using the persisted results, and mark any remaining gap unsupported for independent review.",
			);
		}
		let inspectedCharacters = 0;
		const specialistPurpose =
			task.kind === "computation" ? "computation" : task.kind === "literature-search" ? "literature" : "general";
		const specialistPrompt = (): string =>
			[
				buildTaskSpecialistPrompt(task, citable, inventory, retryContext, acceptedProjectContext),
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
		const actionBudget = task.kind === "computation" ? 3 : 6;
		for (let actionCount = 0; actionCount < actionBudget; actionCount += 1) {
			const action = extractCoMathJsonObject(response);
			if (!action || typeof action.action !== "string") return response;
			if (action.action === "run_computation" || action.action === "run_math_primitive") {
				if (hasSuccessfulComputation) {
					actionResults.push(
						"COMPUTATION ACTION REFUSED\nThis task already has a successful task-owned computation. Reuse it and return the Markdown claim contract now; do not repeat side effects.",
					);
					return this.runRole(
						attemptId,
						"specialist",
						"specialist",
						"computation",
						task,
						state,
						`${specialistPrompt()}\n\nACTION BUDGET EXHAUSTED\nReturn the required Markdown claim contract, citing the successful artifact and marking every unchecked statement unsupported.`,
					);
				}
				if (
					action.action === "run_computation" &&
					(typeof action.script !== "string" || action.script.length === 0)
				)
					throw new Error("Specialist computation action omitted a script.");
				let primitiveDraft: ComputationalScriptDraft | undefined;
				try {
					primitiveDraft =
						action.action === "run_math_primitive"
							? buildMathPrimitiveDraft(
									action.primitive,
									action.input,
									typeof action.summary === "string" ? action.summary : "Exact mathematical primitive.",
								)
							: undefined;
				} catch (error) {
					actionResults.push(`MATH PRIMITIVE ACTION ERROR\n${message(error)}`);
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
				const computationDraft = primitiveDraft ?? {
					fileName: `attempt-${task.id}.py`,
					language: "python" as const,
					content: action.script as string,
					summary: typeof action.summary === "string" ? action.summary : "Specialist computation.",
				};
				const computationWorkingDirectory = path.dirname(this.stateStore.statePath);
				const result = await this.computationalExecutor.runScript(computationDraft, {
					rootQuestion: state.rootQuestion,
					pathTitle: task.title,
					pathObjective: task.goal ?? task.description,
					workingDirectory: computationWorkingDirectory,
					maxRuntimeMs: 60_000,
				});
				const scriptSha256 = createHash("sha256").update(computationDraft.content).digest("hex");
				const fullStdout = result.stdoutFileName
					? await readFile(path.join(computationWorkingDirectory, result.stdoutFileName), "utf8")
					: result.stdout;
				const fullStderr = result.stderrFileName
					? await readFile(path.join(computationWorkingDirectory, result.stderrFileName), "utf8")
					: result.stderr;
				const stdoutSha256 = createHash("sha256").update(fullStdout).digest("hex");
				const stderrSha256 = createHash("sha256").update(fullStderr).digest("hex");
				const computationArtifact = await stageJsonArtifact(this.stateStore.statePath, "computations", {
					attemptId,
					taskId: task.id,
					summary: computationDraft.summary,
					script: computationDraft.content,
					scriptSha256,
					result,
					fullOutput: {
						stdout: { fileName: result.stdoutFileName, sha256: stdoutSha256, content: fullStdout },
						stderr: { fileName: result.stderrFileName, sha256: stderrSha256, content: fullStderr },
					},
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
				hasSuccessfulComputation = result.exitCode === 0;
				actionResults.push(
					[
						result.exitCode === 0 ? "SANDBOX RESULT" : "SANDBOX EXECUTION ERROR",
						`ARTIFACT ${computationArtifact.id}`,
						`exit=${result.exitCode}`,
						result.stdout.slice(0, 40_000),
						result.stderr.slice(0, 10_000),
						...(result.exitCode === 0
							? []
							: [
									`FAILED SCRIPT SHA-256 ${scriptSha256}`,
									"FAILED SCRIPT",
									computationDraft.content.slice(0, 40_000),
									"COMPUTATION REPAIR POLICY",
									"Repair this script rather than replacing the computational approach. First isolate and validate the smallest failing boundary case and all matrix dimensions or empty-object conventions implicated by the error; then rerun the complete requested certificate. Preserve already-correct definitions and output ordering. If the same approach cannot be repaired within the remaining action budget, return an explicit unsupported gap instead of inventing output.",
								]),
					].join("\n"),
				);
				if (hasSuccessfulComputation) {
					const summary = computationDraft.summary.trim().replace(/\s+/g, " ").replaceAll("`", "'");
					const stdout = result.stdout.trim().replace(/\s+/g, " ").replaceAll("`", "'").slice(0, 12_000);
					const artifactLocator = `artifacts/computations/${computationArtifact.id}/artifact.json`;
					const failedArtifacts = actionResults.flatMap((entry) => {
						const failed = /^SANDBOX EXECUTION ERROR\nARTIFACT ([a-f0-9]{64})\nexit=(\d+)/.exec(entry);
						return failed ? [`${failed[1]} (exit ${failed[2]})`] : [];
					});
					return [
						"## Claims",
						`- [computed] ${summary} Task-owned sandbox artifact \`${computationArtifact.id}\` executed with exit status 0. Its persisted executable script has SHA-256 \`${scriptSha256}\`. Captured stdout preview: \`${stdout || "(empty)"}\`. Full captured output is immutable at \`${artifactLocator}\` in JSON fields \`fullOutput.stdout.content\` (SHA-256 \`${stdoutSha256}\`) and \`fullOutput.stderr.content\` (SHA-256 \`${stderrSha256}\`). [artifact ${computationArtifact.id}]`,
						...(failedArtifacts.length > 0
							? [
									`- [computed] Earlier task-owned sandbox execution failed and supplies no positive evidence: ${failedArtifacts.join(", ")}.`,
								]
							: []),
						"- [unsupported] This bounded computation does not by itself establish any unchecked all-parameter or parent-theorem claim.",
						"",
						"## Strategy",
						"Execute exactly one successful task-owned sandbox computation and preserve its script, digest, inputs, outputs, and exit status for independent review.",
						"",
						"## Gaps",
						"Only the explicit inputs reported by the artifact were checked; no finite computation is promoted to a universal proof.",
						"",
						"## Next",
						"Independently review the persisted computation artifact against this task's bounded acceptance criteria.",
					].join("\n");
				}
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
			if (action.action === "search_source") {
				try {
					if (typeof action.sourceId !== "string" || !Array.isArray(action.terms)) {
						throw new Error("Specialist source search omitted its source id or literal terms.");
					}
					if (action.terms.some((term) => typeof term !== "string")) {
						throw new Error("Specialist source search terms must all be strings.");
					}
					if (action.caseSensitive !== undefined && typeof action.caseSensitive !== "boolean") {
						throw new Error("Specialist source search caseSensitive flag must be boolean.");
					}
					const search = await searchTaskSourceLiterals(
						state,
						action.sourceId,
						action.terms as string[],
						action.caseSensitive === true,
					);
					const searchArtifact = await stageJsonArtifact(this.stateStore.statePath, "computations", {
						attemptId,
						taskId: task.id,
						kind: "source-literal-search",
						summary: typeof action.summary === "string" ? action.summary : "Exact fixed-literal source audit.",
						result: search,
					});
					await this.stateStore.transactWithArtifacts(
						{ operation: "task-source-search", actor: "research", changedEntityIds: [attemptId, task.id] },
						[searchArtifact],
						(fresh) => {
							const now = new Date().toISOString();
							let next = updateAttemptStage(fresh, {
								attemptId,
								stage: "specialist",
								status: "running",
								now,
								artifactIds: [searchArtifact.id],
							});
							next = attachAttemptArtifacts(next, {
								attemptId,
								computationArtifactIds: [searchArtifact.id],
								now,
							});
							return { state: next, result: undefined };
						},
					);
					hasSuccessfulComputation = true;
					const rendered = JSON.stringify(search, null, 2);
					if (inspectedCharacters + rendered.length > 40_000) {
						throw new Error("Specialist exceeded the 40,000-character source action result limit.");
					}
					inspectedCharacters += rendered.length;
					actionResults.push(
						[
							"SOURCE LITERAL SEARCH RESULT",
							`ARTIFACT ${searchArtifact.id}`,
							"Whole-source hit counts, including zero counts, are machine-checkable only as [computed] claims citing this artifact. Cite mathematical content from matching lines separately with ordinary exact source locators.",
							rendered,
						].join("\n"),
					);
				} catch (error) {
					actionResults.push(
						[
							"SOURCE SEARCH ERROR",
							message(error),
							"Submit a corrected bounded search_source action or finish with the Markdown claim contract.",
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
		findings: readonly ResearchReviewFindingRecord[] = [],
	): Promise<void> {
		const now = new Date().toISOString();
		await this.stateStore.transactWithArtifacts(
			{ operation: `task-${stage}`, actor: "research", changedEntityIds: [attemptId] },
			[artifact],
			(fresh) => {
				const updated = updateAttemptStage(fresh, {
					attemptId,
					stage,
					status: "completed",
					now,
					artifactIds: [artifact.id],
				});
				return {
					state:
						findings.length > 0 ? attachAttemptReviewFindings(updated, { attemptId, findings, now }) : updated,
					result: undefined,
				};
			},
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

	async loadAcceptedProjectContext(state: CoMathProjectState, excludeAttemptId = ""): Promise<string> {
		const artifactRoot = path.join(path.dirname(this.stateStore.statePath), "artifacts", "reports");
		const acceptedIndex: string[] = [];
		const acceptedDetails: string[] = [];
		for (const attemptId of state.canonicalProjection?.acceptedAttemptIds ?? []) {
			if (attemptId === excludeAttemptId) continue;
			const attempt = state.researchTaskAttempts.find(
				(candidate) => candidate.id === attemptId && candidate.status === "accepted",
			);
			if (!attempt?.reportArtifactId) continue;
			const report = await readTextArtifact(
				path.join(artifactRoot, attempt.reportArtifactId, "artifact.json"),
				attempt.reportArtifactId,
			);
			if (!report) continue;
			const task = state.researchPlanTasks.find((candidate) => candidate.id === attempt.taskId);
			acceptedIndex.push(
				`- ${attempt.id}: ${task?.title ?? attempt.taskId}${task?.description ? `; ${task.description.slice(0, MAX_ACCEPTED_TASK_INDEX_DESCRIPTION_CHARACTERS)}` : ""}`,
			);
			acceptedDetails.push(
				`ACCEPTED ATTEMPT ${attempt.id}${task ? `\nTASK ${task.title}` : ""}\n${report.slice(0, 8_000)}`,
			);
		}
		if (acceptedIndex.length === 0) return "";
		return [
			"ACCEPTED TASK INDEX (durable; do not repeat these objectives):",
			...acceptedIndex,
			"",
			"RECENT ACCEPTED ATTEMPT DETAILS:",
			...acceptedDetails.slice(-MAX_ACCEPTED_PROJECT_CONTEXT_DETAILS),
		].join("\n\n");
	}

	async loadRecentTaskReviewContext(state: CoMathProjectState): Promise<string> {
		const artifactRoot = path.join(path.dirname(this.stateStore.statePath), "artifacts");
		const reviewed: string[] = [];
		for (const attempt of state.researchTaskAttempts.slice(-6)) {
			if (attempt.status === "accepted" || attempt.status === "queued" || attempt.status === "running") continue;
			const feedback: string[] = [];
			for (const stage of attempt.stages) {
				if (stage.stage !== "critic" && stage.stage !== "skeptic") continue;
				for (const artifactId of stage.artifactIds.slice(-1)) {
					const text = await readTextArtifact(path.join(artifactRoot, stage.stage, artifactId, "artifact.json"));
					if (text) feedback.push(`${stage.stage.toUpperCase()}\n${text.slice(0, 6_000)}`);
				}
			}
			if (feedback.length === 0) continue;
			const task = state.researchPlanTasks.find((candidate) => candidate.id === attempt.taskId);
			reviewed.push(
				`NON-ACCEPTED ATTEMPT ${attempt.id}${task ? `\nTASK ${task.title}: ${task.description}` : ""}\n${feedback.join("\n")}`,
			);
		}
		return reviewed.slice(-3).join("\n\n");
	}

	async synchronizeHistoricalLiteratureSources(state: CoMathProjectState): Promise<CoMathProjectState> {
		const sources: LiteratureSourceResult[] = [];
		for (const attempt of state.researchTaskAttempts) {
			if (!attempt.sourceCatalogArtifactId) continue;
			const task = state.researchPlanTasks.find((candidate) => candidate.id === attempt.taskId);
			if (task?.kind !== "literature-search") continue;
			try {
				const catalog = await this.loadAttemptSourceCatalog(attempt);
				sources.push(...(catalog.externalLiteratureSearch?.sources ?? []));
			} catch {
				// Historical corruption cannot block coordinator synthesis or discard other valid catalogs.
			}
		}
		if (sources.length === 0) return state;
		const now = new Date().toISOString();
		const committed = await this.stateStore.transact(
			{ operation: "literature-source-backfill", actor: "system", changedEntityIds: [] },
			(fresh) => ({ state: recordExternalLiteratureSources(fresh, sources, now), result: undefined }),
		);
		return committed.state;
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
		bibliographicHints.push(
			...extractLiteratureSearchHints(
				state.literatureSources.flatMap((source) => (source.extractedText ? [source.extractedText] : [])),
			),
		);
		const taskQuestion = task.goal ?? task.description;
		const rootQuestion =
			bibliographicHints[0] ??
			(acceptedClaimTexts.join(" ") || `${state.rootQuestion} ${taskQuestion}`).slice(0, 2_500);
		const researchPath = task.pathId
			? state.researchPaths.find((candidate) => candidate.id === task.pathId)
			: undefined;
		const query = {
			rootQuestion,
			pathTitle: researchPath?.title ?? task.title.replace(/^User-directed:\s*/i, ""),
			pathObjective: taskQuestion,
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
		const discoveredSources = result.sources.slice(0, 10);
		const persistedIdentityHints: LiteratureSourceResult[] = state.literatureSources.map((source) => ({
			title: source.title,
			summary: source.summary,
			authors: [...source.authors],
			...(source.kind ? { kind: source.kind } : {}),
			...(source.url ? { url: source.url } : {}),
			...(source.provider ? { provider: source.provider } : {}),
			...(source.externalId ? { externalId: source.externalId } : {}),
			...(source.doi ? { doi: source.doi } : {}),
			...(source.extractedText ? { extractedText: source.extractedText } : {}),
		}));
		const sourcesWithPersistedRoutes = await enrichLiteratureSourcesWithFullText(
			[...discoveredSources, ...persistedIdentityHints],
			{ timeoutMs: query.timeoutMs },
		);
		return {
			sources: sourcesWithPersistedRoutes.slice(0, discoveredSources.length).map(prepareLiteratureSourceForCatalog),
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

	private async loadAttemptInternalSourceEvidence(attempt: ResearchTaskAttemptRecord): Promise<string> {
		const artifactRoot = path.join(path.dirname(this.stateStore.statePath), "artifacts", "internal-sources");
		const artifactIds = attempt.stages.find((stage) => stage.stage === "specialist")?.artifactIds ?? [];
		const evidence: string[] = [];
		let remaining = 40_000;
		for (const artifactId of artifactIds) {
			let serialized: string;
			try {
				serialized = await readFile(path.join(artifactRoot, artifactId, "artifact.txt"), "utf8");
			} catch {
				continue;
			}
			if (createHash("sha256").update(serialized).digest("hex") !== artifactId) continue;
			const lineCount = serialized.endsWith("\n")
				? serialized.slice(0, -1).split("\n").length
				: serialized.split("\n").length;
			const rendered = `ARTIFACT ${artifactId}\nLOCATOR artifacts/internal-sources/${artifactId}/artifact.txt@L1-L${lineCount}\n${serialized}`;
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
	state: CoMathProjectState,
	task: ResearchPlanTaskRecord,
	claims: readonly ValidatedResearchClaim[],
	attempt: ResearchTaskAttemptRecord,
	report: string,
) {
	const referencedInternalAttemptIds = [
		...new Set(
			[task.goal, task.description, ...task.acceptanceCriteria]
				.join("\n")
				.match(/research-attempt-[A-Za-z0-9_-]+/g) ?? [],
		),
	];
	const citedInternalAttemptArtifact = referencedInternalAttemptIds.some((referencedAttemptId) => {
		const referencedAttempt = state.researchTaskAttempts.find((candidate) => candidate.id === referencedAttemptId);
		return (
			referencedAttempt?.stages.some((stage) =>
				stage.artifactIds.some((artifactId) => report.includes(artifactId)),
			) ?? false
		);
	});
	const citedTaskOwnedInternalSourceArtifact =
		referencedInternalAttemptIds.length > 0 &&
		(attempt.stages
			.find((stage) => stage.stage === "specialist")
			?.artifactIds.some((artifactId) => report.includes(artifactId)) ??
			false);
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
		!claims.some((claim) => claim.classification === "source-backed" && claim.status === "validated") &&
		!citedInternalAttemptArtifact &&
		!citedTaskOwnedInternalSourceArtifact
	) {
		return {
			stage: "capability-validation" as const,
			code: "missing-source-grounding",
			message: "The task requires validated exact source grounding.",
			claimIds: [],
			retryable: false,
		};
	}
	if (
		requiresSandboxedComputationArtifact(task) &&
		attempt.computationArtifactIds.length === 0 &&
		!hasAcceptedCitedComputationArtifact(state, report) &&
		!task.dependsOnTaskIds.some((dependencyId) => {
			const dependency = state.researchPlanTasks.find((candidate) => candidate.id === dependencyId);
			if (!dependency) return false;
			return state.researchTaskAttempts.some(
				(candidate) =>
					candidate.taskId === dependency.id &&
					candidate.status === "accepted" &&
					candidate.computationArtifactIds.length > 0,
			);
		})
	) {
		return {
			stage: "capability-validation" as const,
			code: "missing-sandboxed-computation",
			message:
				"The task requires a task-owned sandbox computation artifact, an exact cited artifact from an accepted attempt, or one from an accepted named dependency.",
			claimIds: [],
			retryable: false,
		};
	}
	return undefined;
}

export function requiresSandboxedComputationArtifact(task: CoMathProjectState["researchPlanTasks"][number]): boolean {
	if (!task.requiredCapabilities.includes("sandboxed-computation")) return false;
	if (task.kind === "computation") return true;
	const contract = [task.title, task.description, task.goal, ...task.acceptanceCriteria].join("\n");
	return (
		/\b(?:run|execute|executed|executable|script|code|computer(?:-algebra)?|CAS|sandbox(?:ed)?|machine-check(?:ed|able)?|program(?:matic|matically)?|captured outputs?|exit status)\b/i.test(
			contract,
		) ||
		/\b(?:perform|run|execute|use)\s+(?:an?\s+)?(?:exact\s+|finite\s+|symbolic\s+|numerical\s+)?(?:computation|calculation|enumeration|check)\b/i.test(
			contract,
		)
	);
}

export function hasAcceptedCitedComputationArtifact(state: CoMathProjectState, report: string): boolean {
	return state.researchTaskAttempts.some(
		(candidate) =>
			candidate.status === "accepted" &&
			candidate.computationArtifactIds.some((artifactId) => report.includes(artifactId)),
	);
}

function capabilityReviewFinding(
	attemptId: string,
	failure: ResearchAttemptFailure,
): ResearchReviewFindingRecord | undefined {
	let kind: ResearchReviewFindingRecord["kind"];
	let statement: string;
	if (failure.code === "missing-sandboxed-computation") {
		kind = "computation";
		statement =
			"Provide a task-owned sandbox computation artifact, cite an exact artifact from an accepted attempt, or name an accepted computation dependency; preserve executable code, explicit inputs, captured outputs, exit status, and a stable artifact digest.";
	} else if (failure.code === "missing-external-literature-grounding") {
		kind = "source-refresh";
		statement =
			"Provide at least one validated claim grounded by a selected external provider record, including the provider, stable external identifier, and exact metadata or abstract field supporting the claim.";
	} else if (failure.code === "missing-source-grounding") {
		kind = "source-refresh";
		statement =
			"Provide validated exact source grounding for the requested certificate, with an immutable source identifier, stable locator, and bounded excerpt supporting every source-backed claim.";
	} else {
		return undefined;
	}
	return {
		id: `review-finding-${createHash("sha256")
			.update(`${attemptId}\ncapability-validation\n${failure.code}`)
			.digest("hex")
			.slice(0, 16)}`,
		stage: "capability-validation",
		kind,
		statement,
		acceptanceCriteria: [
			`Establish exactly this missing capability certificate: ${statement}`,
			"Persist the resulting evidence as a task-owned artifact and identify it explicitly in the result.",
			"Report failed execution, unavailable evidence, and zero-result checks without replacing them with prose inference.",
			"Do not claim the parent theorem; conclude only whether this capability certificate has been established.",
		],
	};
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

async function stageLineAddressedArtifact(
	statePath: string,
	kind: string,
	attemptId: string,
	sourceAttemptIds: readonly string[],
	text: string,
): Promise<CoMathPreparedArtifact> {
	const serialized = `${[
		`TASK ATTEMPT: ${attemptId}`,
		`SOURCE ATTEMPTS: ${sourceAttemptIds.join(", ")}`,
		...text.split("\n"),
	]
		.map((line, index) => `${String(index + 1).padStart(6, "0")}\t${line}`)
		.join("\n")}\n`;
	const sha256 = createHash("sha256").update(serialized).digest("hex");
	const root = path.join(path.dirname(statePath), "artifacts");
	const stagingPath = path.join(root, ".staging", `${kind}-${sha256}`);
	const finalPath = path.join(root, kind, sha256);
	await mkdir(stagingPath, { recursive: true });
	await writeFile(path.join(stagingPath, "artifact.txt"), serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
	return { id: sha256, stagingPath, finalPath, contentPath: "artifact.txt", sha256 };
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
