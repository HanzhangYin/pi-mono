import { createHash } from "node:crypto";
import { deriveCriticRepairNeed } from "./comath-critic-repair-policy.ts";
import { deriveLiteratureSearchNeed } from "./comath-literature-policy.ts";
import {
	getCoMathMarkdownSectionItems,
	type CoMathParsedMarkdown as ParsedMarkdown,
	parseCoMathMarkdown as parseMarkdown,
} from "./comath-markdown.ts";
import { formatDisciplineStateForContext } from "./comath-research-discipline.ts";
import type { ResearchWorkstreamModelExecutor } from "./comath-task-model.ts";
import { textsNearlyMatch } from "./comath-text-similarity.ts";
import { applyTheoremBoundaryPolicy } from "./comath-theorem-boundary-policy.ts";
import type {
	CoMathProjectState,
	ComputationalArtifact,
	LiteratureClaimSupport,
	LiteratureSourceArtifact,
	ResearchCoordinatorNextMove,
	ResearchCoordinatorReportRecord,
	ResearchEvidenceBoardEntry,
	ResearchPath,
	ResearchPlanTaskRecord,
	ResearchTaskAttemptRecord,
	ResearchWorkstreamReportRecord,
	ResearchWorkstreamRunRecord,
	WorkingPaperSection,
} from "./schema.ts";

export type ResearchCoordinatorReportDraft = Omit<
	ResearchCoordinatorReportRecord,
	"id" | "createdAt" | "updatedAt" | "workingPaperSectionId"
> & {
	workingPaperSectionId?: string;
};

export interface RunResearchCoordinatorSynthesisInput {
	state: CoMathProjectState;
	executor?: ResearchWorkstreamModelExecutor;
	now: string;
	acceptedProjectContext?: string;
	recentTaskReviewContext?: string;
}

export interface ResearchCoordinatorSynthesisResult {
	report: ResearchCoordinatorReportDraft;
}

export interface CoordinatorInputIds {
	inputReportIds: string[];
	inputPathIds: string[];
	inputSourceIds: string[];
	inputComputationalArtifactIds: string[];
	inputReviewFingerprint: string;
}

const MAX_CONTEXT_ITEMS = 8;
const MAX_REPORT_ITEMS = 6;
const HIGH_INFORMATION_EXPERIMENT_PROMPT = [
	"Run one bounded exact mathematical experiment on the smallest untested case relevant to the active conjecture.",
	"Choose the case and invariant by expected information gain, not ease of presentation.",
	"Persist exact inputs, executable code, stdout, stderr, exit status, outputs, and stable digests, then submit the result to independent review.",
	"If the experiment is accepted, extract one structural pattern and formulate the next proof lemma that the pattern suggests.",
	"Do not infer an all-case theorem from finite data, and do not treat unresolved audit objections as discharged.",
].join(" ");
const COMPUTATION_STRATEGY_FAILURE_LIMIT = 2;
const LONG_RESEARCH_TASK_MS = 4 * 60_000;

export async function runResearchCoordinatorSynthesis(
	input: RunResearchCoordinatorSynthesisInput,
): Promise<ResearchCoordinatorSynthesisResult> {
	if (input.executor) {
		try {
			const path = chooseCoordinatorPath(input.state, input.now);
			const response = await input.executor.run({
				role: "synthesizer",
				purpose: "coordinator",
				rootQuestion: input.state.rootQuestion,
				path,
				allPaths: input.state.researchPaths,
				priorFindings: selectCoordinatorReports(input.state)
					.flatMap((report) => report.findings)
					.slice(-MAX_CONTEXT_ITEMS),
				inputText: buildCoordinatorContext(
					input.state,
					input.acceptedProjectContext,
					input.recentTaskReviewContext,
				),
				prompt: buildResearchCoordinatorPrompt(
					input.state,
					input.acceptedProjectContext,
					input.recentTaskReviewContext,
				),
			});
			const parsed = parseCoordinatorMarkdown(response.text, input.state);
			if (hasSubstantiveCoordinatorReport(parsed)) {
				return { report: applyCoordinatorPolicies(input.state, parsed, input.recentTaskReviewContext ?? "") };
			}
		} catch {
			return {
				report: applyCoordinatorPolicies(
					input.state,
					buildFallbackCoordinatorReport(input.state, input.acceptedProjectContext, input.recentTaskReviewContext),
					input.recentTaskReviewContext ?? "",
				),
			};
		}
	}
	return {
		report: applyCoordinatorPolicies(
			input.state,
			buildFallbackCoordinatorReport(input.state, input.acceptedProjectContext, input.recentTaskReviewContext),
			input.recentTaskReviewContext ?? "",
		),
	};
}

function applyCoordinatorPolicies(
	state: CoMathProjectState,
	report: ResearchCoordinatorReportDraft,
	recentTaskReviewContext: string,
): ResearchCoordinatorReportDraft {
	return applyTheoremBoundaryPolicy(
		state,
		promoteConcreteCoordinatorMove(
			applyComputationResearchPolicy(
				state,
				applyOpportunityCostPolicy(
					state,
					applyCriticRepairPolicy(state, applyLiteratureSearchPolicy(state, report), recentTaskReviewContext),
				),
			),
		),
	);
}

function applyComputationResearchPolicy(
	state: CoMathProjectState,
	report: ResearchCoordinatorReportDraft,
): ResearchCoordinatorReportDraft {
	const sourceTask = latestAcceptedComputationTask(state);
	if (!sourceTask) return report;
	if (hasAcceptedComputationDerivedTheory(state, sourceTask.sequence)) {
		const firstMove = report.recommendedNextMoves[0];
		const latestTheory = latestAcceptedComputationDerivedTheoryTask(state, sourceTask.sequence);
		if (latestTheory?.goal?.includes("COMPUTATION-TO-THEORY SYNTHESIS")) {
			const prompt = [
				"THEORY-TO-GENERALIZATION",
				`SOURCE ACCEPTED THEORY TASK: ${latestTheory.id}`,
				"Use the accepted lemma, invariant, or reduction as a tool on exactly one unresolved general roadblock. Do not restate the source task and do not rerun its motivating computation.",
				"Derive one new nontrivial corollary, reduction, or strictly broader symbolic statement with explicit hypotheses and a checkable proof.",
				"If the accepted result is insufficient, identify the exact missing premise and design only the smallest discriminating computation or counterexample needed to decide it.",
				"Keep finite evidence separate from the claimed general conclusion, and preserve every unresolved independent-review objection.",
			].join("\n");
			const generalizationMove: ResearchCoordinatorNextMove = {
				title: "Apply the accepted structural lemma to an open general roadblock",
				...(latestTheory.pathId ? { pathId: latestTheory.pathId } : {}),
				rationale:
					"The computation has already yielded accepted theory. The next high-information step must use that theory to obtain a new consequence rather than synthesize the same evidence again.",
				prompt,
				priority: "high",
			};
			return {
				...report,
				recommendedNextMoves: [
					generalizationMove,
					...report.recommendedNextMoves.map((move) => ({ ...move, priority: "medium" as const })),
				].slice(0, 3),
				...(latestTheory.pathId ? { suggestedPathId: latestTheory.pathId } : {}),
				suggestedPrompt: prompt,
			};
		}
		if (!firstMove || !isCertificateEnumerationMove(firstMove)) return report;
		const structuralFollowUp = report.recommendedNextMoves.find(
			(move, index) =>
				index > 0 &&
				isStructuralTheoryMove(move) &&
				!isCertificateEnumerationMove(move) &&
				!wasCoordinatorMoveAttempted(state, move),
		);
		if (!structuralFollowUp) return report;
		return {
			...report,
			roadblocks: [
				...report.roadblocks,
				"An accepted computation-derived pivot supersedes the proposed exhaustive certificate enumeration; the next task must develop an untried structural consequence instead.",
			],
			recommendedNextMoves: [
				{ ...structuralFollowUp, priority: "high" as const },
				...report.recommendedNextMoves
					.filter((move) => move !== structuralFollowUp)
					.map((move) => ({ ...move, priority: "medium" as const })),
			].slice(0, 3),
			...(structuralFollowUp.pathId ? { suggestedPathId: structuralFollowUp.pathId } : {}),
			suggestedPrompt: structuralFollowUp.prompt ?? structuralFollowUp.title,
		};
	}
	const relatedFailures = state.researchPlanTasks
		.filter(
			(task) =>
				task.sequence > sourceTask.sequence &&
				(!sourceTask.pathId || task.pathId === sourceTask.pathId) &&
				(task.reviewOutcome === "needs-revision" || task.reviewOutcome === "rejected"),
		)
		.sort((left, right) => left.sequence - right.sequence);
	const hasLongFailure = relatedFailures.some((task) => {
		const attempt = task.latestAttemptId
			? state.researchTaskAttempts.find((candidate) => candidate.id === task.latestAttemptId)
			: undefined;
		if (!attempt) return false;
		const startedAt = Date.parse(attempt.startedAt);
		const finishedAt = Date.parse(attempt.completedAt ?? attempt.updatedAt);
		return (
			Number.isFinite(startedAt) && Number.isFinite(finishedAt) && finishedAt - startedAt >= LONG_RESEARCH_TASK_MS
		);
	});
	if (relatedFailures.length >= COMPUTATION_STRATEGY_FAILURE_LIMIT || hasLongFailure) {
		const hasFailedPivot = relatedFailures.some((task) =>
			task.goal?.includes("STRATEGY PIVOT AFTER EXPENSIVE COMPUTATION"),
		);
		const alternateStructuralMove = hasFailedPivot
			? report.recommendedNextMoves.find(
					(move) =>
						!move.prompt?.startsWith("CRITIC-DRIVEN REPAIR") &&
						isStructuralTheoryMove(move) &&
						!isCertificateEnumerationMove(move),
				)
			: undefined;
		if (alternateStructuralMove) {
			return {
				...report,
				roadblocks: [
					...report.roadblocks,
					"The first computation-derived strategy pivot failed review; it remains unresolved while the next task uses a distinct structural mechanism.",
				],
				recommendedNextMoves: [
					{ ...alternateStructuralMove, priority: "high" as const },
					...report.recommendedNextMoves
						.filter((move) => move !== alternateStructuralMove)
						.map((move) => ({ ...move, priority: "medium" as const })),
				].slice(0, 3),
				...(alternateStructuralMove.pathId ? { suggestedPathId: alternateStructuralMove.pathId } : {}),
				suggestedPrompt: alternateStructuralMove.prompt ?? alternateStructuralMove.title,
			};
		}
		const prompt = [
			"STRATEGY PIVOT AFTER EXPENSIVE COMPUTATION",
			`SOURCE COMPUTATION TASK: ${sourceTask.id}`,
			"Preserve every accepted finite result and every unresolved review objection, but do not rerun the full computation or enumerate the same family of missing certificates.",
			"Replace the failed route with exactly one smaller high-information strategy: isolate a symbolic invariant, exploit a symmetry or triangularity, prove an inductive reduction, or test one minimal discriminating microcase that can refute the proposed pattern.",
			"Formulate the smallest reusable lemma that would explain the accepted data, then either prove that lemma without new large-scale computation or state the precise obstruction exposed by the microcase.",
			"Do not claim a general theorem from finite evidence and do not mark the original failed certificate established.",
		].join("\n");
		const pivotMove: ResearchCoordinatorNextMove = {
			title: "Pivot from certificate enumeration to a smaller structural lemma",
			...(sourceTask.pathId ? { pathId: sourceTask.pathId } : {}),
			rationale:
				"The computation-derived route has accumulated repeated non-accepted tasks or exceeded the long-task threshold. A smaller symbolic or discriminating step now has higher expected information gain.",
			prompt,
			priority: "high",
		};
		return {
			...report,
			roadblocks: [
				...report.roadblocks,
				"The latest computation-derived strategy became expensive without an accepted general result; its objections remain open while the next task changes method.",
			],
			recommendedNextMoves: [
				pivotMove,
				...report.recommendedNextMoves.map((move) => ({ ...move, priority: "medium" as const })),
			].slice(0, 3),
			...(sourceTask.pathId ? { suggestedPathId: sourceTask.pathId } : {}),
			suggestedPrompt: prompt,
		};
	}
	const firstMove = report.recommendedNextMoves[0];
	if (firstMove && isStructuralTheoryMove(firstMove)) return report;
	const artifactIds = sourceTask.attemptIds.flatMap((attemptId) => {
		const attempt = state.researchTaskAttempts.find((candidate) => candidate.id === attemptId);
		return attempt?.status === "accepted" ? attempt.computationArtifactIds : [];
	});
	const prompt = [
		"COMPUTATION-TO-THEORY SYNTHESIS",
		`SOURCE COMPUTATION TASK: ${sourceTask.id}`,
		...(artifactIds.length > 0 ? [`ACCEPTED ARTIFACTS: ${artifactIds.join(", ")}`] : []),
		"Extract one exact invariant or recurring structure from the accepted output and compare it with the active conjecture's predicted structure.",
		"Formulate the smallest reusable symbolic lemma that would explain the pattern, including explicit hypotheses and a falsifiable conclusion.",
		"Attempt a proof from definitions, symmetry, triangularity, or induction. If proof fails, identify one precise obstruction and one minimal discriminating microcase.",
		"Do not run another neighboring full-scale computation in this task, and do not infer an all-case theorem from finite data.",
	].join("\n");
	const synthesisMove: ResearchCoordinatorNextMove = {
		title: "Convert the accepted computation into a structural lemma",
		...(sourceTask.pathId ? { pathId: sourceTask.pathId } : {}),
		rationale:
			"An accepted finite computation has not yet produced an accepted symbolic consequence; theory extraction has higher value than another neighboring case.",
		prompt,
		priority: "high",
	};
	return {
		...report,
		recommendedNextMoves: [
			synthesisMove,
			...report.recommendedNextMoves.map((move) => ({ ...move, priority: "medium" as const })),
		].slice(0, 3),
		...(sourceTask.pathId ? { suggestedPathId: sourceTask.pathId } : {}),
		suggestedPrompt: prompt,
	};
}

function wasCoordinatorMoveAttempted(state: CoMathProjectState, move: ResearchCoordinatorNextMove): boolean {
	const candidate = normalizeCoordinatorMove(move.prompt ?? move.title);
	if (!candidate) return false;
	return state.researchPlanTasks.some((task) => {
		const taskText = normalizeCoordinatorMove([task.title, task.description, task.goal].filter(Boolean).join("\n"));
		return taskText.includes(candidate) || candidate.includes(taskText);
	});
}

function normalizeCoordinatorMove(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 240);
}

function latestAcceptedComputationTask(state: CoMathProjectState): ResearchPlanTaskRecord | undefined {
	return [...state.researchPlanTasks]
		.filter((task) => {
			if (task.reviewOutcome !== "accepted" || !task.acceptedAttemptId) return false;
			const taskText = [task.title, task.description, task.goal, ...task.acceptanceCriteria]
				.filter(Boolean)
				.join("\n");
			if (/\b(?:COMPUTATION-TO-THEORY SYNTHESIS|STRATEGY PIVOT AFTER EXPENSIVE COMPUTATION)\b/.test(taskText)) {
				return false;
			}
			const attempt = state.researchTaskAttempts.find((candidate) => candidate.id === task.acceptedAttemptId);
			return task.kind === "computation" || Boolean(attempt?.computationArtifactIds.length);
		})
		.sort((left, right) => right.sequence - left.sequence)[0];
}

function hasAcceptedComputationDerivedTheory(state: CoMathProjectState, sourceSequence: number): boolean {
	return latestAcceptedComputationDerivedTheoryTask(state, sourceSequence) !== undefined;
}

function latestAcceptedComputationDerivedTheoryTask(
	state: CoMathProjectState,
	sourceSequence: number,
): ResearchPlanTaskRecord | undefined {
	return [...state.researchPlanTasks]
		.filter((task) => {
			if (task.sequence <= sourceSequence || task.reviewOutcome !== "accepted") {
				return false;
			}
			const text = [task.title, task.description, task.goal, ...task.acceptanceCriteria].filter(Boolean).join("\n");
			return /\b(?:structural|general|symbolic|lemma|corollary|theorem|formula|identity|invariant|induct|symmetr|triangular|basis|isomorphism)\w*/i.test(
				text,
			);
		})
		.sort((left, right) => right.sequence - left.sequence)[0];
}

function isStructuralTheoryMove(move: ResearchCoordinatorNextMove): boolean {
	const text = `${move.title}\n${move.prompt ?? ""}\n${move.rationale}`;
	return (
		/\b(?:prove|derive|establish|justify|formulate)\b/i.test(text) &&
		/\b(?:structural|general|symbolic|lemma|corollary|formula|identity|invariant|induct|symmetr|triangular|basis|isomorphism)\w*/i.test(
			text,
		) &&
		!/^\s*(?:compute|execute|enumerate|recompute|run)\b/im.test(text)
	);
}

function isCertificateEnumerationMove(move: ResearchCoordinatorNextMove): boolean {
	const text = `${move.title}\n${move.prompt ?? ""}\n${move.rationale}`;
	return /\b(?:for every|all ten|all \d+|enumerat\w*|every .{0,40}witness|complete .{0,40}matri(?:x|ces)|same family of missing certificates)\b/i.test(
		text,
	);
}

function promoteConcreteCoordinatorMove(report: ResearchCoordinatorReportDraft): ResearchCoordinatorReportDraft {
	const firstMove = report.recommendedNextMoves[0];
	if (!firstMove || !/^continue path \d+$/i.test(firstMove.prompt?.trim() ?? "")) return report;
	const concreteIndex = report.recommendedNextMoves.findIndex(
		(move, index) =>
			index > 0 && Boolean(move.prompt?.trim()) && !/^continue path \d+$/i.test(move.prompt?.trim() ?? ""),
	);
	if (concreteIndex < 0) return report;
	const concreteMove = report.recommendedNextMoves[concreteIndex];
	if (!concreteMove?.prompt) return report;
	const { suggestedPathId: _suggestedPathId, ...reportWithoutSuggestedPath } = report;
	return {
		...reportWithoutSuggestedPath,
		recommendedNextMoves: [
			{ ...concreteMove, priority: "high" as const },
			{ ...firstMove, priority: "medium" as const },
			...report.recommendedNextMoves.filter((_, index) => index !== 0 && index !== concreteIndex),
		].slice(0, 3),
		...(concreteMove.pathId ? { suggestedPathId: concreteMove.pathId } : {}),
		suggestedPrompt: concreteMove.prompt,
	};
}

function applyOpportunityCostPolicy(
	state: CoMathProjectState,
	report: ResearchCoordinatorReportDraft,
): ResearchCoordinatorReportDraft {
	const firstMove = report.recommendedNextMoves[0];
	if (firstMove && hasFailedGenericExperiment(state) && isGenericExperimentMove(firstMove)) {
		const alternative = report.recommendedNextMoves.slice(1).find((move) => !isGenericExperimentMove(move));
		if (alternative) {
			return {
				...report,
				recommendedNextMoves: [
					{ ...alternative, priority: "high" as const },
					{ ...firstMove, priority: "medium" as const },
					...report.recommendedNextMoves.filter(
						(move) => move !== firstMove && move !== alternative && !isGenericExperimentMove(move),
					),
				].slice(0, 3),
				...(alternative.pathId ? { suggestedPathId: alternative.pathId } : {}),
				suggestedPrompt: alternative.prompt ?? alternative.title,
			};
		}
	}
	if (
		!firstMove ||
		firstMove.prompt === HIGH_INFORMATION_EXPERIMENT_PROMPT ||
		!hasFailedAuditRepair(state) ||
		!isAuditClosureText(`${firstMove.title} ${firstMove.prompt ?? ""}`)
	) {
		return report;
	}
	const experimentPath =
		(firstMove.pathId ? state.researchPaths.find((path) => path.id === firstMove.pathId) : undefined) ??
		rankCoordinatorPaths(state).find((path) =>
			/\b(?:computation|experiment|examples?|counterexamples?|finite)\b/i.test(`${path.title} ${path.objective}`),
		);
	const experimentMove = buildHighInformationExperimentMove(experimentPath);
	return {
		...report,
		recommendedNextMoves: [
			experimentMove,
			{ ...firstMove, priority: "medium" as const },
			...report.recommendedNextMoves.slice(1),
		].slice(0, 3),
		...(experimentPath ? { suggestedPathId: experimentPath.id } : {}),
		suggestedPrompt: HIGH_INFORMATION_EXPERIMENT_PROMPT,
	};
}

function hasFailedGenericExperiment(state: CoMathProjectState): boolean {
	return state.researchPlanTasks.some((task) => {
		if (!task.goal || !isGenericExperimentText(task.goal)) return false;
		const latestAttempt = task.latestAttemptId
			? state.researchTaskAttempts.find((attempt) => attempt.id === task.latestAttemptId)
			: undefined;
		return latestAttempt !== undefined && latestAttempt.status !== "accepted";
	});
}

function isGenericExperimentMove(move: ResearchCoordinatorNextMove): boolean {
	return isGenericExperimentText(`${move.title} ${move.prompt ?? ""}`);
}

function isGenericExperimentText(text: string): boolean {
	const hasConcreteInputs =
		/\b[a-z][a-z0-9_]*\s*=\s*\[[^\]]+\]/i.test(text) || /\([a-z](?:\s*,\s*[a-z])+\)\s*=\s*\([^)]+\)/i.test(text);
	if (hasConcreteInputs) return false;
	return (
		/\brun one bounded exact mathematical experiment\b.*\bsmallest untested case\b/i.test(text) ||
		(/\bsmallest untested case\b/i.test(text) && /\bexpected (?:mathematical )?information gain\b/i.test(text))
	);
}

function applyCriticRepairPolicy(
	state: CoMathProjectState,
	report: ResearchCoordinatorReportDraft,
	recentTaskReviewContext: string,
): ResearchCoordinatorReportDraft {
	const need = deriveCriticRepairNeed(state, recentTaskReviewContext);
	if (!need || requestsUnavailableFullText(state, need.certificate)) return report;
	const move: ResearchCoordinatorNextMove = {
		title: need.title,
		...(need.pathId ? { pathId: need.pathId } : {}),
		rationale: `The independent review of ${need.sourceAttemptId} named this concrete missing certificate. Complete it before another broad parent-theorem attempt.`,
		prompt: need.directive,
		priority: "high",
	};
	if (isRepeatedAuditClosureRepair(state, need.sourceAttemptId, need.certificate)) {
		const experimentPath =
			(need.pathId ? state.researchPaths.find((path) => path.id === need.pathId) : undefined) ??
			rankCoordinatorPaths(state).find((path) =>
				/\b(?:computation|experiment|examples?|counterexamples?|finite)\b/i.test(`${path.title} ${path.objective}`),
			);
		const experimentMove = buildHighInformationExperimentMove(experimentPath);
		return {
			...report,
			roadblocks: [
				`The unresolved audit or provenance repair remains recorded but is no longer forced ahead of higher-information mathematical work: ${need.certificate}`,
				...report.roadblocks,
			].slice(0, MAX_REPORT_ITEMS),
			recommendedNextMoves: [
				experimentMove,
				{ ...move, priority: "medium" as const },
				...report.recommendedNextMoves.filter(
					(candidate) =>
						!candidate.prompt?.startsWith("CRITIC-DRIVEN REPAIR") &&
						!textsNearlyMatch(`${candidate.title} ${candidate.prompt ?? ""}`, need.certificate, 0.7),
				),
			].slice(0, 3),
			...(experimentPath ? { suggestedPathId: experimentPath.id } : {}),
			suggestedPrompt: HIGH_INFORMATION_EXPERIMENT_PROMPT,
		};
	}
	return {
		...report,
		roadblocks: [
			`The latest non-accepted task requires a bounded certificate repair: ${need.certificate}`,
			...report.roadblocks,
		].slice(0, MAX_REPORT_ITEMS),
		recommendedNextMoves: [move, ...report.recommendedNextMoves].slice(0, 3),
		...(need.pathId ? { suggestedPathId: need.pathId } : {}),
		suggestedPrompt: need.directive,
	};
}

function isRepeatedAuditClosureRepair(
	state: CoMathProjectState,
	sourceAttemptId: string,
	certificate: string,
): boolean {
	if (!isAuditClosureText(certificate)) return false;
	const sourceAttempt = state.researchTaskAttempts.find((attempt) => attempt.id === sourceAttemptId);
	if (!sourceAttempt || sourceAttempt.status === "accepted") return false;
	const sourceTask = state.researchPlanTasks.find((task) => task.id === sourceAttempt.taskId);
	return sourceTask?.goal?.startsWith("CRITIC-DRIVEN REPAIR") === true;
}

function hasFailedAuditRepair(state: CoMathProjectState): boolean {
	return state.researchPlanTasks.some((task) => {
		if (!task.goal?.startsWith("CRITIC-DRIVEN REPAIR") || !isAuditClosureText(task.goal)) return false;
		const latestAttempt = task.latestAttemptId
			? state.researchTaskAttempts.find((attempt) => attempt.id === task.latestAttemptId)
			: undefined;
		return latestAttempt !== undefined && latestAttempt.status !== "accepted";
	});
}

function isAuditClosureText(text: string): boolean {
	const content = text.replace(/\b(?:SOURCE ATTEMPT|REPAIR FINDING|TASK KIND):\s*\S+/gi, "");
	return (
		/\b(?:audit|provenance|manifest|metadata|checksum|digest|occurrence counts?)\b/i.test(content) &&
		/\b(?:literature|query|resolver|citation|full[- ]text|doi|arxiv|external sources?|source (?:ids?|records?|metadata)|provider (?:queries|query|records?|metadata))\b|\bpersisted[:.]\s*source\b/i.test(
			content,
		)
	);
}

function buildHighInformationExperimentMove(path: ResearchPath | undefined): ResearchCoordinatorNextMove {
	return {
		title: "Run the smallest untested high-information mathematical experiment",
		...(path ? { pathId: path.id } : {}),
		rationale:
			"A bounded audit repair has already failed. Preserve its objection, but spend the next task on a falsifiable mathematical experiment that can change the proof strategy.",
		prompt: HIGH_INFORMATION_EXPERIMENT_PROMPT,
		priority: "high",
	};
}

function applyLiteratureSearchPolicy(
	state: CoMathProjectState,
	report: ResearchCoordinatorReportDraft,
): ResearchCoordinatorReportDraft {
	report = removeUnsupportedFullTextMoves(state, report);
	const need = deriveLiteratureSearchNeed(state);
	if (!need) return report;
	const move: ResearchCoordinatorNextMove = {
		title: need.title,
		...(need.pathId ? { pathId: need.pathId } : {}),
		rationale: need.rationale,
		prompt: need.description,
		priority: "high",
	};
	return {
		...report,
		recommendedNextMoves: [
			move,
			...report.recommendedNextMoves.filter(
				(candidate) =>
					!/\b(?:literature|bibliograph|prior work|source search)\b/i.test(
						`${candidate.title} ${candidate.prompt ?? ""}`,
					),
			),
		].slice(0, 3),
		...(need.pathId ? { suggestedPathId: need.pathId } : {}),
		suggestedPrompt: need.description,
	};
}

function removeUnsupportedFullTextMoves(
	state: CoMathProjectState,
	report: ResearchCoordinatorReportDraft,
): ResearchCoordinatorReportDraft {
	const supportedMoves = report.recommendedNextMoves.filter(
		(move) => !requestsUnavailableFullText(state, `${move.title} ${move.rationale} ${move.prompt ?? ""}`),
	);
	if (supportedMoves.length === report.recommendedNextMoves.length) return report;
	const replacements = supportedMoves.length > 0 ? supportedMoves : buildFallbackNextMoves(state);
	const firstMove = replacements[0];
	const { suggestedPathId: _suggestedPathId, suggestedPrompt: _suggestedPrompt, ...rest } = report;
	return {
		...rest,
		recommendedNextMoves: replacements.slice(0, 3),
		...(firstMove?.pathId ? { suggestedPathId: firstMove.pathId } : {}),
		...(firstMove?.prompt ? { suggestedPrompt: firstMove.prompt } : {}),
	};
}

export function requestsUnavailableFullText(state: CoMathProjectState, moveText: string): boolean {
	if (
		!/\b(?:retrieve|obtain|download|inspect|read|ingest|extract|register|supply|provide)\b.*\b(?:full[- ]text|theorem[- ]level text|exact theorem text|theorem passages?|indexed passages?)\b/i.test(
			moveText,
		)
	) {
		return false;
	}
	const normalizedMove = moveText.toLowerCase();
	return !state.literatureSources.some((source) => {
		if (!source.extractedText?.trim() || source.citationEligibility === "inventory-only") return false;
		if (source.doi && normalizedMove.includes(source.doi.toLowerCase())) return true;
		if (source.externalId && normalizedMove.includes(source.externalId.toLowerCase())) return true;
		if (source.url && normalizedMove.includes(source.url.toLowerCase())) return true;
		return textsNearlyMatch(source.title, moveText, 0.55);
	});
}

export function buildResearchCoordinatorPrompt(
	state: CoMathProjectState,
	acceptedProjectContext = "",
	recentTaskReviewContext = "",
): string {
	return [
		"ROLE",
		"Project coordinator for a mathematical research workspace.",
		"TASK",
		"Build a concise project-level synthesis from the supplied durable state.",
		"ROLE-SPECIFIC RULES",
		"Use only the durable project state below as evidence.",
		"Canonical accepted task results are internal established project context, not external literature and not independently citable evidence.",
		"Recent non-accepted task reviews describe defects and repair requirements only; never promote their disputed findings into what is known.",
		"When a recent review names a concrete missing certificate, the deterministic repair policy will select exactly one. Do not broaden that repair into the parent theorem or combine it with adjacent concerns.",
		"Respect the standing constraints in the state below, and never recommend a route a theorem check already rejected.",
		"When a route was rejected or changed, recommend the recorded replacement route as a concrete next move.",
		"Do not recommend a task whose objective is already covered by the canonical accepted task index. Build on accepted work with a genuinely new consequence, case, proof step, or independent verification.",
		"Do not repeat a non-retryable failed task unless the durable state records a changed prerequisite.",
		"External literature providers may initially supply only metadata or abstracts. A literature task may escalate through bounded DOI, arXiv, and HTML routes; treat only persisted citable extracted text as theorem-level evidence, and record a bounded negative result when those routes fail.",
		"Treat a pending task with incomplete or blocked dependencies as blocked, not runnable. Recommend a new standalone concrete task only when accepted project context genuinely supplies the missing prerequisite.",
		"Recommend concrete next moves with rationale (references to find, computations to run, weaker statements to prove).",
		"Each recommended move must be one immediately executable task in one bullet. Never use nested numbered substeps, scheduling instructions, or a bullet whose only action is to keep later tasks separate.",
		"",
		"INPUT MATERIAL",
		buildCoordinatorContext(state, acceptedProjectContext, recentTaskReviewContext),
		"",
		"OUTPUT CONTRACT",
		"Return markdown with these headings:",
		"## What we know",
		"## Roadblocks",
		"## Recommended next moves",
		"## Suggested next step",
	].join("\n");
}

export function buildCoordinatorContext(
	state: CoMathProjectState,
	acceptedProjectContext = "",
	recentTaskReviewContext = "",
): string {
	const reports = selectCoordinatorReports(state);
	const evidence = selectCoordinatorEvidence(state);
	const supports = selectCoordinatorClaimSupports(state);
	const sources = selectCoordinatorSources(state, reports, evidence, supports);
	const computations = selectCoordinatorComputations(state, reports, evidence);
	const taskComputations = selectTaskOwnedComputations(state);
	return [
		"Durable project state",
		`Root question: ${state.rootQuestion}`,
		"",
		"Research paths:",
		...formatPathsForContext(state.researchPaths),
		"",
		"Research reports:",
		...formatReportsForContext(state, reports),
		"",
		"Canonical accepted task results (internal project context; not external literature or citable evidence):",
		acceptedProjectContext.trim() || "(none)",
		"",
		"Task-engine plan state:",
		...(state.researchPlanTasks.length > 0
			? state.researchPlanTasks.slice(-12).map((task) => {
					const latestAttempt = task.latestAttemptId
						? state.researchTaskAttempts.find((attempt) => attempt.id === task.latestAttemptId)
						: undefined;
					const dependencies = task.dependsOnTaskIds
						.map((dependencyId) => {
							const dependency = state.researchPlanTasks.find((candidate) => candidate.id === dependencyId);
							return `${dependencyId}:${dependency?.status ?? "missing"}`;
						})
						.join(", ");
					const failure = latestAttempt?.failure
						? `; failure=${latestAttempt.failure.code}; retryable=${latestAttempt.failure.retryable}`
						: task.failureReason
							? `; failure=${task.failureReason}`
							: "";
					return `- ${task.id} [${task.status}] ${task.title}; dependencies=${dependencies || "none"}; latest attempt=${latestAttempt?.status ?? "none"}${failure}`;
				})
			: ["(none)"]),
		"",
		"Recent non-accepted task reviews (defects and repair requirements; not established results):",
		recentTaskReviewContext.trim() || "(none)",
		"",
		"Source support:",
		...formatClaimSupportsForContext(supports),
		"",
		"Evidence board:",
		...formatEvidenceBoardForContext(evidence),
		"",
		"Literature sources:",
		...formatSourcesForContext(sources),
		"",
		"Computation outputs:",
		...formatComputationsForContext(state, computations),
		"",
		"Task-owned computation outputs:",
		...formatTaskOwnedComputationsForContext(taskComputations),
		"",
		"Active, blocked, and failed runs:",
		...formatRunsForContext(state),
		"",
		"Working paper sections:",
		...formatWorkingPaperSectionsForContext(state.workingPaperSections),
		...formatDisciplineStateForContext(state),
	].join("\n");
}

function buildFallbackCoordinatorReport(
	state: CoMathProjectState,
	acceptedProjectContext = "",
	recentTaskReviewContext = "",
): ResearchCoordinatorReportDraft {
	const ids = collectCoordinatorInputIds(state);
	const acceptedReports = selectCoordinatorReports(state);
	const whatWeKnow = uniqueStrings([
		...summarizeAcceptedTaskIndex(acceptedProjectContext),
		...acceptedReports.flatMap((report) => report.findings).slice(-MAX_REPORT_ITEMS),
		...state.computationalArtifacts
			.filter((artifact) => artifact.status === "completed")
			.slice(-3)
			.map((artifact) => summarizeComputationArtifactForUser(state, artifact)),
		...state.literatureClaimSupports
			.filter((support) => support.status === "supported" || support.status === "partially-supported")
			.slice(-3)
			.map((support) => `${support.status}: ${support.claim}`),
		...state.researchEvidenceBoard
			.filter((entry) => entry.classification !== "unsupported" && entry.classification !== "conflicting")
			.slice(-3)
			.map((entry) => `${entry.classification}: ${entry.claim}`),
		...state.researchWorkstreamRuns
			.filter((run) => run.status === "queued" || run.status === "running")
			.map(
				(run) =>
					`${formatPathLabelForId(state, run.pathId, run.pathTitle)} is still running at ${formatRunStage(run)}.`,
			),
	]);
	const roadblocks = uniqueStrings([
		...(recentTaskReviewContext.trim()
			? [
					"Recent non-accepted reviews still contain repair requirements; their disputed findings are not established.",
				]
			: []),
		...acceptedReports.flatMap((report) => report.gaps).slice(-MAX_REPORT_ITEMS),
		...acceptedReports
			.filter((report) => report.status === "blocked")
			.map((report) => `${formatPathLabelForId(state, report.pathId, report.pathTitle)} is blocked.`),
		...state.literatureClaimSupports
			.filter((support) => support.status === "unsupported" || support.sourceIds.length === 0)
			.map((support) => `Source support is still missing for: ${support.claim}`),
		...state.researchEvidenceBoard
			.filter((entry) => entry.classification === "unsupported" || entry.classification === "conflicting")
			.slice(-4)
			.map((entry) => `${entry.classification}: ${entry.claim}`),
		...state.researchWorkstreamRuns
			.filter((run) => run.status === "blocked" || run.status === "failed")
			.map(
				(run) =>
					`${formatPathLabelForId(state, run.pathId, run.pathTitle)} stopped before a usable result: ${
						run.failureReason ?? "no final report was produced"
					}.`,
			),
		...(state.computationalArtifacts.length > 0
			? ["Finite computation is evidence for pattern-finding only; it does not prove an infinite claim."]
			: []),
	]);
	const recommendedNextMoves = buildFallbackNextMoves(state, acceptedProjectContext.trim().length > 0);
	const firstMove = recommendedNextMoves[0];
	return {
		...ids,
		whatWeKnow:
			whatWeKnow.length > 0 ? whatWeKnow : ["No completed research report has produced durable findings yet."],
		roadblocks: roadblocks.length > 0 ? roadblocks : ["No current roadblock was identified."],
		recommendedNextMoves,
		humanHelpUseful: [],
		...(firstMove?.pathId ? { suggestedPathId: firstMove.pathId } : {}),
		...(firstMove?.prompt ? { suggestedPrompt: firstMove.prompt } : {}),
	};
}

function parseCoordinatorMarkdown(text: string, state: CoMathProjectState): ResearchCoordinatorReportDraft {
	const parsed = parseMarkdown(text);
	const ids = collectCoordinatorInputIds(state);
	const whatWeKnow = sectionItems(parsed, "what we know").map((item) =>
		sanitizeCoordinatorText(softenComputationProofClaim(item, state)),
	);
	const roadblocks = sectionItems(parsed, "roadblock").map(sanitizeCoordinatorText);
	let recommendedNextMoves = sectionItems(parsed, "recommended")
		.map((item, index) => parseNextMove(item, index, state))
		.filter((move): move is ResearchCoordinatorNextMove => move !== undefined)
		.map((move, index) => ({ ...move, priority: rankedPriority(index) }));
	const suggestedItems = sectionItems(parsed, "suggested")
		.map(normalizeNextStepItem)
		.filter((item) => item.length > 0);
	const firstSuggested = suggestedItems[0];
	const suggestedPath =
		firstSuggested && /\bpath\s+\d+\b/i.test(firstSuggested) ? findPathReference(state, firstSuggested) : undefined;
	if (suggestedPath && !recommendedNextMoves.some((move) => move.pathId === suggestedPath.id)) {
		recommendedNextMoves = [
			{
				title: `Continue ${formatPathLabel(state, suggestedPath)}`,
				pathId: suggestedPath.id,
				rationale: "The coordinator selected this as the suggested next step.",
				prompt: `continue path ${pathNumber(state, suggestedPath)}`,
				priority: "high",
			},
			...recommendedNextMoves.map((move, index) => ({
				...move,
				priority: index === 0 ? ("medium" as const) : move.priority,
			})),
		];
	}
	const firstMove = recommendedNextMoves[0];
	const suggestedPrompt =
		extractContinuePrompt(firstSuggested ?? "", state) ??
		(firstSuggested ? sanitizeCoordinatorText(firstSuggested) : undefined) ??
		firstMove?.prompt;
	const report: ResearchCoordinatorReportDraft = {
		...ids,
		whatWeKnow: uniqueStrings(whatWeKnow).slice(0, MAX_REPORT_ITEMS),
		roadblocks: uniqueStrings([
			...roadblocks,
			...(state.computationalArtifacts.length > 0 &&
			!roadblocks.some((item) => /\bfinite\b|\bcomputation\b|\binfinite\b/i.test(item))
				? ["Finite computation is evidence for pattern-finding only; it does not prove an infinite claim."]
				: []),
		]).slice(0, MAX_REPORT_ITEMS),
		recommendedNextMoves: fallbackNextMoves(recommendedNextMoves, state),
		humanHelpUseful: [],
		...((suggestedPath?.id ?? firstMove?.pathId) ? { suggestedPathId: suggestedPath?.id ?? firstMove?.pathId } : {}),
		...(suggestedPrompt ? { suggestedPrompt } : {}),
	};
	if (report.whatWeKnow.length === 0) {
		report.whatWeKnow = buildFallbackCoordinatorReport(state).whatWeKnow;
	}
	if (report.roadblocks.length === 0) {
		report.roadblocks = buildFallbackCoordinatorReport(state).roadblocks;
	}
	return report;
}

function hasSubstantiveCoordinatorReport(report: ResearchCoordinatorReportDraft): boolean {
	return (
		report.whatWeKnow.some((item) => item.trim().length > 0) ||
		report.roadblocks.some((item) => item.trim().length > 0) ||
		report.recommendedNextMoves.some((move) => move.title.trim().length > 0)
	);
}

function buildFallbackNextMoves(
	state: CoMathProjectState,
	hasAcceptedProjectContext = false,
): ResearchCoordinatorNextMove[] {
	const latestReportByPath = new Map<string, ResearchWorkstreamReportRecord>();
	for (const report of state.researchReports) {
		latestReportByPath.set(report.pathId, report);
	}
	const activePaths = rankCoordinatorPaths(state);
	const moves: ResearchCoordinatorNextMove[] = [];
	if (hasAcceptedProjectContext) {
		const path = chooseDefaultPath(state);
		moves.push({
			title: "Derive a new result beyond the canonical accepted task index",
			...(path ? { pathId: path.id } : {}),
			rationale:
				"Coordinator model synthesis was unavailable, so the next task must compare its objective with durable accepted work and advance a genuinely new consequence rather than repeat it.",
			prompt:
				"Using the canonical accepted task index, derive and independently review a new mathematical consequence not already covered by any accepted objective.",
			priority: "high",
		});
	}
	const hasBlockedLiterature = hasBlockedLiteratureState(state);
	const initialUnreportedLimit = state.computationalArtifacts.length > 0 && hasBlockedLiterature ? 2 : 3;
	for (const path of activePaths.filter((path) => !latestReportByPath.has(path.id)).slice(0, initialUnreportedLimit)) {
		moves.push({
			title: `Continue ${formatPathLabel(state, path)}`,
			pathId: path.id,
			rationale: buildPathRankingRationale(
				state,
				path,
				"No completed report has been recorded for this active path yet.",
			),
			prompt: `continue path ${pathNumber(state, path)}`,
			priority: moves.length === 0 ? "high" : "medium",
		});
	}
	if (state.computationalArtifacts.length > 0 && hasBlockedLiterature) {
		const reformulation = activePaths.find((path) => /\breformulation\b/i.test(path.title));
		if (reformulation && !moves.some((move) => move.pathId === reformulation.id)) {
			moves.push({
				title: `Continue ${formatPathLabel(state, reformulation)}`,
				pathId: reformulation.id,
				rationale: "Computation gives finite guidance, while the source-backed route is blocked.",
				prompt: `continue path ${pathNumber(state, reformulation)}`,
				priority: moves.length === 0 ? "high" : "medium",
			});
		}
		moves.push({
			title: "Provide a theorem or source reference",
			rationale: "The literature path needs source-backed statements before it can support a theorem-level route.",
			priority: "medium",
		});
	}
	for (const path of activePaths) {
		if (moves.length >= 3) {
			break;
		}
		const report = latestReportByPath.get(path.id);
		if (!report || moves.some((move) => move.pathId === path.id)) {
			continue;
		}
		moves.push({
			title: `Continue ${formatPathLabel(state, path)}`,
			pathId: path.id,
			rationale: buildPathRankingRationale(
				state,
				path,
				report.suggestedNextMove || "The latest report suggests another pass on this path.",
			),
			prompt: `continue path ${pathNumber(state, path)}`,
			priority: moves.length === 0 ? "high" : "medium",
		});
	}
	if (moves.length === 0) {
		const fallbackPath = chooseDefaultPath(state);
		if (fallbackPath) {
			moves.push({
				title: `Continue ${formatPathLabel(state, fallbackPath)}`,
				pathId: fallbackPath.id,
				rationale: fallbackPath.suggestedNextMove,
				prompt: `continue path ${pathNumber(state, fallbackPath)}`,
				priority: "high",
			});
		} else {
			moves.push({
				title: "Choose a research path to continue",
				rationale: "No active research path was available in the current state.",
				priority: "medium",
			});
		}
	}
	return moves.slice(0, 3);
}

function fallbackNextMoves(
	moves: ResearchCoordinatorNextMove[],
	state: CoMathProjectState,
): ResearchCoordinatorNextMove[] {
	return moves.length > 0 ? moves.slice(0, 3) : buildFallbackNextMoves(state);
}

function rankCoordinatorPaths(state: CoMathProjectState): ResearchPath[] {
	return state.researchPaths
		.filter((path) => path.status === "active" || path.status === "promising")
		.map((path) => ({
			path,
			score: scoreCoordinatorPath(state, path),
		}))
		.sort((left, right) => right.score - left.score || left.path.priority - right.path.priority)
		.map((entry) => entry.path);
}

function scoreCoordinatorPath(state: CoMathProjectState, path: ResearchPath): number {
	const reports = state.researchReports.filter((report) => report.pathId === path.id);
	const boardEntries = state.researchEvidenceBoard.filter((entry) => entry.pathId === path.id);
	const sourceSupport = boardEntries.filter(
		(entry) =>
			entry.sourceIds.length > 0 && entry.classification !== "unsupported" && entry.classification !== "conflicting",
	).length;
	const computationSupport = boardEntries.filter((entry) => entry.classification === "computation").length;
	const blockers = boardEntries.filter(
		(entry) => entry.classification === "unsupported" || entry.classification === "conflicting",
	).length;
	const latestReport = reports.at(-1);
	const novelty = Math.max(0, 3 - reports.length);
	return (
		(path.status === "promising" ? 8 : 0) +
		sourceSupport * 4 +
		computationSupport * 3 +
		novelty * 2 +
		(latestReport && latestReport.findings.length > 0 ? 2 : 0) -
		blockers * 3 -
		(latestReport?.status === "blocked" ? 5 : 0)
	);
}

function buildPathRankingRationale(state: CoMathProjectState, path: ResearchPath, fallback: string): string {
	const boardEntries = state.researchEvidenceBoard.filter((entry) => entry.pathId === path.id);
	const sourceSupport = boardEntries.filter(
		(entry) =>
			entry.sourceIds.length > 0 && entry.classification !== "unsupported" && entry.classification !== "conflicting",
	).length;
	const computationSupport = boardEntries.filter((entry) => entry.classification === "computation").length;
	const blockers = boardEntries.filter(
		(entry) => entry.classification === "unsupported" || entry.classification === "conflicting",
	).length;
	const signals = [
		sourceSupport > 0 ? `${sourceSupport} source-backed signal${sourceSupport === 1 ? "" : "s"}` : undefined,
		computationSupport > 0
			? `${computationSupport} computation signal${computationSupport === 1 ? "" : "s"}`
			: undefined,
		blockers > 0 ? `${blockers} unresolved blocker${blockers === 1 ? "" : "s"}` : undefined,
		/\b(?:literature|source|reference|theorem)\b/i.test(`${path.title} ${path.objective}`) && blockers > 0
			? "more literature retrieval may help"
			: undefined,
		/\b(?:computation|examples?|finite|counterexamples?)\b/i.test(`${path.title} ${path.objective}`)
			? "more bounded computation may help"
			: undefined,
		path.status === "promising" ? "already marked promising" : undefined,
	].filter((signal): signal is string => signal !== undefined);
	return signals.length > 0 ? `${fallback} Signals: ${signals.join("; ")}.` : fallback;
}

function parseNextMove(
	item: string,
	index: number,
	state: CoMathProjectState,
): ResearchCoordinatorNextMove | undefined {
	const normalized = sanitizeCoordinatorText(normalizeNextStepItem(item));
	if (!normalized || isNextMoveDetailLabel(normalized) || isNextMoveFragment(normalized)) {
		return undefined;
	}
	const path = findPathReference(state, normalized);
	const hasExplicitPathReference = /\bpath\s+\d+\b/i.test(normalized);
	const priority = parsePriority(normalized, index);
	const withoutPriority = normalized
		.replace(/\((?:high|medium|low)\s+priority\)/gi, "")
		.replace(/\[(?:high|medium|low)\]/gi, "")
		.trim();
	const withoutPathLead = withoutPriority.replace(/^(?:continue\s+)?path\s+\d+\s*[:.-]?\s*/i, "").trim();
	if (isNextMoveDetailLabel(withoutPathLead) || isNextMoveFragment(withoutPathLead)) {
		return undefined;
	}
	const split = splitMoveTitleAndRationale(withoutPathLead);
	return {
		title: split.title,
		...(path && hasExplicitPathReference ? { pathId: path.id } : {}),
		prompt: path && hasExplicitPathReference ? `continue path ${pathNumber(state, path)}` : withoutPathLead,
		rationale: split.rationale || "This move follows from the current project state.",
		priority,
	};
}

function isNextMoveDetailLabel(item: string): boolean {
	return /^(?:rationale|reason|priority|prompt|path|important caveat|caveat|note)$/i.test(item.trim());
}

function isNextMoveFragment(item: string): boolean {
	const normalized = item.trim();
	return (
		/,$/.test(normalized) ||
		/^(?:whether|primality|least prime factor|congruence classes?|runtime|exit code)\b/i.test(normalized) ||
		(/^[a-z0-9^+()\\\s-]+$/i.test(normalized) &&
			normalized.split(/\s+/).length <= 5 &&
			!/\b(?:continue|compute|prove|check|find|source|run|compare|record|use|try|follow)\b/i.test(normalized))
	);
}

function parsePriority(item: string, index: number): ResearchCoordinatorNextMove["priority"] {
	if (/\bhigh\b/i.test(item)) {
		return "high";
	}
	if (/\blow\b/i.test(item)) {
		return "low";
	}
	if (/\bmedium\b/i.test(item)) {
		return "medium";
	}
	return index === 0 ? "high" : index === 1 ? "medium" : "low";
}

function rankedPriority(index: number): ResearchCoordinatorNextMove["priority"] {
	return index === 0 ? "high" : index === 1 ? "medium" : "low";
}

function splitMoveTitleAndRationale(item: string): { title: string; rationale: string } {
	const separator = /\s+(?:--|-|because|so that)\s+/i.exec(item);
	if (separator) {
		const before = item.slice(0, separator.index).trim();
		const after = item.slice(separator.index + separator[0].length).trim();
		return {
			title: before || item,
			rationale: after || item,
		};
	}
	const colonIndex = item.indexOf(":");
	if (colonIndex > 0 && colonIndex < 80) {
		const before = item.slice(0, colonIndex).trim();
		const after = item.slice(colonIndex + 1).trim();
		return {
			title: before || item,
			rationale: after || item,
		};
	}
	return {
		title: item.length <= 96 ? item : `${item.slice(0, 93)}...`,
		rationale: item,
	};
}

function sectionItems(parsed: ParsedMarkdown, keyword: string): string[] {
	return getCoMathMarkdownSectionItems(parsed, keyword)
		.map(normalizeNextStepItem)
		.filter((item) => item.length > 0);
}

function normalizeNextStepItem(item: string): string {
	const normalized = item
		.trim()
		.replace(/^(?:possible\s+)?(?:next|future)\s+(?:steps?|investigations?|directions?|moves?|work)\s*:\s*/i, "")
		.replace(/^next\s*:\s*/i, "")
		.trim();
	if (!normalized || isHeadingLikeFiller(item)) {
		return "";
	}
	return normalized;
}

function isHeadingLikeFiller(item: string): boolean {
	const normalized = item.trim();
	return (
		/^(?:possible\s+)?(?:next|future)\s+(?:steps?|investigations?|directions?|moves?|work)\s*:$/i.test(normalized) ||
		(/^[-\w\s]+:$/.test(normalized) && normalized.split(/\s+/).length <= 6)
	);
}

export function collectCoordinatorInputIds(state: CoMathProjectState): CoordinatorInputIds {
	const reports = selectCoordinatorReports(state);
	const evidence = selectCoordinatorEvidence(state);
	const supports = selectCoordinatorClaimSupports(state);
	return {
		inputReportIds: reports.map((report) => report.id),
		inputPathIds: state.researchPaths.map((path) => path.id),
		inputSourceIds: selectCoordinatorSources(state, reports, evidence, supports).map((source) => source.id),
		inputComputationalArtifactIds: [
			...new Set([
				...selectCoordinatorComputations(state, reports, evidence).map((artifact) => artifact.id),
				...selectTaskOwnedComputations(state).flatMap((attempt) => attempt.computationArtifactIds),
			]),
		],
		inputReviewFingerprint: coordinatorReviewFingerprint(state, reports),
	};
}

export function coordinatorSynthesisInputsMatchState(
	state: CoMathProjectState,
	report: Pick<
		ResearchCoordinatorReportDraft,
		"inputReportIds" | "inputPathIds" | "inputSourceIds" | "inputComputationalArtifactIds" | "inputReviewFingerprint"
	>,
): boolean {
	const current = collectCoordinatorInputIds(state);
	return (
		orderedIdsEqual(report.inputReportIds, current.inputReportIds) &&
		orderedIdsEqual(report.inputPathIds, current.inputPathIds) &&
		orderedIdsEqual(report.inputSourceIds, current.inputSourceIds) &&
		orderedIdsEqual(report.inputComputationalArtifactIds, current.inputComputationalArtifactIds) &&
		report.inputReviewFingerprint === current.inputReviewFingerprint
	);
}

function orderedIdsEqual(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((id, index) => id === right[index]);
}

function selectCoordinatorReports(state: CoMathProjectState): ResearchWorkstreamReportRecord[] {
	return state.researchReports
		.filter((report) => report.acceptanceStatus === undefined || report.acceptanceStatus === "accepted")
		.slice(-MAX_CONTEXT_ITEMS);
}

function coordinatorReviewFingerprint(
	state: CoMathProjectState,
	reports: readonly ResearchWorkstreamReportRecord[],
): string {
	const payload = {
		reports: reports.map((report) => [report.id, report.updatedAt, report.acceptanceStatus]),
		tasks: state.researchPlanTasks.map((task) => [task.id, task.status, task.reviewOutcome ?? "", task.updatedAt]),
		attempts: state.researchTaskAttempts.map((attempt) => [
			attempt.id,
			attempt.status,
			attempt.currentStage,
			attempt.updatedAt,
			attempt.computationArtifactIds,
			attempt.modelCalls.map((call) => [call.id, call.status ?? "", call.completedAt ?? ""]),
			(attempt.reviewFindings ?? []).map((finding) => finding.id),
		]),
		evidence: state.researchEvidenceBoard.map((entry) => [entry.id, entry.classification, entry.updatedAt]),
		constraints: state.researchConstraints.map((constraint) => [
			constraint.id,
			constraint.status,
			constraint.updatedAt,
		]),
		marginNotes: state.marginNotes.map((note) => [note.id, note.status, note.updatedAt]),
	};
	return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function selectCoordinatorEvidence(state: CoMathProjectState): ResearchEvidenceBoardEntry[] {
	return state.researchEvidenceBoard.slice(-MAX_CONTEXT_ITEMS);
}

function selectCoordinatorClaimSupports(state: CoMathProjectState): LiteratureClaimSupport[] {
	return state.literatureClaimSupports.slice(-MAX_CONTEXT_ITEMS);
}

function selectCoordinatorSources(
	state: CoMathProjectState,
	reports: readonly ResearchWorkstreamReportRecord[],
	evidence: readonly ResearchEvidenceBoardEntry[],
	supports: readonly LiteratureClaimSupport[],
): LiteratureSourceArtifact[] {
	const requiredIds = new Set([
		...reports.flatMap((report) => report.sourceIds),
		...evidence.flatMap((entry) => entry.sourceIds),
		...supports.flatMap((support) => support.sourceIds),
		...state.literatureSources
			.filter((source) => source.extractedText?.trim() && source.citationEligibility !== "inventory-only")
			.map((source) => source.id),
	]);
	return selectRequiredAndRecent(state.literatureSources, requiredIds);
}

function selectCoordinatorComputations(
	state: CoMathProjectState,
	reports: readonly ResearchWorkstreamReportRecord[],
	evidence: readonly ResearchEvidenceBoardEntry[],
): ComputationalArtifact[] {
	const requiredIds = new Set([
		...reports.flatMap((report) => report.computationalArtifactIds),
		...evidence.flatMap((entry) => entry.computationalArtifactIds),
	]);
	return selectRequiredAndRecent(state.computationalArtifacts, requiredIds);
}

function selectTaskOwnedComputations(state: CoMathProjectState): ResearchTaskAttemptRecord[] {
	return state.researchTaskAttempts
		.filter((attempt) => attempt.computationArtifactIds.length > 0)
		.slice(-MAX_CONTEXT_ITEMS);
}

function selectRequiredAndRecent<T extends { id: string }>(items: readonly T[], requiredIds: ReadonlySet<string>): T[] {
	const required = items.filter((item) => requiredIds.has(item.id));
	const recent = items
		.filter((item) => !requiredIds.has(item.id))
		.slice(-Math.max(0, MAX_CONTEXT_ITEMS - required.length));
	return [...required, ...recent];
}

function chooseCoordinatorPath(state: CoMathProjectState, now: string): ResearchPath {
	return (
		chooseDefaultPath(state) ?? {
			id: "project-coordinator",
			title: "Project coordinator synthesis",
			objective: "Synthesize current research state and recommend next moves.",
			status: "active",
			latestFindings: [],
			blockers: [],
			suggestedNextMove: "Recommend the next useful research move.",
			priority: 1,
			createdAt: now,
			updatedAt: now,
		}
	);
}

function chooseDefaultPath(state: CoMathProjectState): ResearchPath | undefined {
	const focused = state.researchFocus?.pathIds
		.map((pathId) => state.researchPaths.find((path) => path.id === pathId))
		.find((path): path is ResearchPath => path !== undefined && path.status !== "abandoned");
	if (focused) {
		return focused;
	}
	return [...state.researchPaths]
		.filter((path) => path.status === "active" || path.status === "promising")
		.sort((a, b) => a.priority - b.priority)[0];
}

function findPathReference(state: CoMathProjectState, text: string): ResearchPath | undefined {
	const match = /\bpath\s+(\d+)\b/i.exec(text);
	if (match?.[1]) {
		return state.researchPaths[Number.parseInt(match[1], 10) - 1];
	}
	const normalized = normalizePathText(text);
	return state.researchPaths.find((path) => {
		const haystack = normalizePathText(`${path.title} ${path.objective}`);
		return normalized
			.split(/\s+/)
			.filter((term) => term.length > 3)
			.some((term) => haystack.includes(term));
	});
}

function extractContinuePrompt(text: string, state: CoMathProjectState): string | undefined {
	if (!/\bpath\s+\d+\b/i.test(text)) return undefined;
	const path = findPathReference(state, text);
	return path ? `continue path ${pathNumber(state, path)}` : undefined;
}

function pathNumber(state: CoMathProjectState, path: ResearchPath): number {
	const index = state.researchPaths.findIndex((candidate) => candidate.id === path.id);
	return index >= 0 ? index + 1 : path.priority;
}

function formatPathLabel(state: CoMathProjectState, path: ResearchPath): string {
	return `Path ${pathNumber(state, path)}: ${path.title}`;
}

function formatPathLabelForId(state: CoMathProjectState, pathId: string, fallbackTitle: string): string {
	const path = state.researchPaths.find((candidate) => candidate.id === pathId);
	return path ? formatPathLabel(state, path) : fallbackTitle;
}

function normalizePathText(value: string): string {
	return value
		.toLowerCase()
		.replace(/\b(?:the|a|an|path|continue|try|on|to)\b/g, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function hasBlockedLiteratureState(state: CoMathProjectState): boolean {
	return (
		state.researchReports.some(
			(report) =>
				report.status === "blocked" && /\b(?:literature|source|reference|theorem)\b/i.test(report.pathTitle),
		) ||
		state.literatureClaimSupports.some(
			(support) => support.status === "unsupported" || support.sourceIds.length === 0,
		)
	);
}

function softenComputationProofClaim(item: string, state: CoMathProjectState): string {
	if (
		state.computationalArtifacts.length > 0 &&
		/\b(?:comput|finite|checked|search|examples?)\w*.*\b(?:prove|proves|proved|establishes?)\b/i.test(item)
	) {
		return "The recorded computation is finite evidence only; it does not prove an infinite claim.";
	}
	return item;
}

function sanitizeCoordinatorText(value: string): string {
	return value
		.trim()
		.replace(/\*\*/g, "")
		.replace(/`/g, "")
		.replace(/\brole-runs?\b/gi, "runs")
		.replace(/\bworkstreams?\b/gi, "research paths")
		.replace(/\bartifacts?\b/gi, "outputs")
		.replace(/\bqueues?\b/gi, "plans")
		.replace(/\bschemas?\b/gi, "formats");
}

function uniqueStrings(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => sanitizeCoordinatorText(value)).filter((value) => value.length > 0))];
}

function summarizeAcceptedTaskIndex(context: string): string[] {
	const index = context.split("RECENT ACCEPTED ATTEMPT DETAILS:", 1)[0] ?? "";
	return index
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("- "))
		.slice(-MAX_CONTEXT_ITEMS)
		.map((line) => `Canonical accepted task: ${line.slice(2)}`);
}

function formatPathsForContext(paths: readonly ResearchPath[]): string[] {
	if (paths.length === 0) {
		return ["- (none)"];
	}
	return paths.map((path, index) =>
		[
			`- Path ${index + 1} [${path.status}, priority ${path.priority}]: ${path.title}`,
			`  Objective: ${path.objective}`,
			...(path.latestFindings.length > 0 ? [`  Latest findings: ${path.latestFindings.slice(-3).join(" | ")}`] : []),
			...(path.blockers.length > 0 ? [`  Blockers: ${path.blockers.slice(-3).join(" | ")}`] : []),
			`  Suggested next move: ${path.suggestedNextMove}`,
		].join("\n"),
	);
}

function formatReportsForContext(
	state: CoMathProjectState,
	reports: readonly ResearchWorkstreamReportRecord[],
): string[] {
	if (reports.length === 0) {
		return ["- (none)"];
	}
	return reports.map((report) =>
		[
			`- ${report.id} on ${formatPathLabelForId(state, report.pathId, report.pathTitle)}: ${report.status}`,
			...(report.findings.length > 0 ? [`  Findings: ${report.findings.slice(0, 3).join(" | ")}`] : []),
			...(report.gaps.length > 0 ? [`  Gaps: ${report.gaps.slice(0, 3).join(" | ")}`] : []),
			...(report.criticisms.length > 0 ? [`  Criticisms: ${report.criticisms.slice(0, 3).join(" | ")}`] : []),
			...(report.sourceIds.length > 0 ? [`  Source ids: ${report.sourceIds.join(", ")}`] : []),
			...(report.claimSupportIds.length > 0 ? [`  Claim support ids: ${report.claimSupportIds.join(", ")}`] : []),
			...(report.computationalArtifactIds.length > 0
				? [`  Computation output ids: ${report.computationalArtifactIds.join(", ")}`]
				: []),
			`  Suggested next move: ${report.suggestedNextMove}`,
		].join("\n"),
	);
}

function formatClaimSupportsForContext(supports: readonly LiteratureClaimSupport[]): string[] {
	if (supports.length === 0) {
		return ["- (none)"];
	}
	return supports.map((support) =>
		[
			`- ${support.id}: ${support.status}`,
			`  Claim: ${support.claim}`,
			`  Sources: ${support.sourceIds.length > 0 ? support.sourceIds.join(", ") : "none"}`,
			...(support.note ? [`  Note: ${support.note}`] : []),
		].join("\n"),
	);
}

function formatEvidenceBoardForContext(entries: readonly ResearchEvidenceBoardEntry[]): string[] {
	if (entries.length === 0) {
		return ["- (none)"];
	}
	return entries.map((entry) =>
		[
			`- ${entry.id}: ${entry.classification}`,
			`  Claim: ${entry.claim}`,
			...(entry.pathId ? [`  Path: ${entry.pathId}`] : []),
			...(entry.reportId ? [`  Report: ${entry.reportId}`] : []),
			...(entry.sourceIds.length > 0 ? [`  Sources: ${entry.sourceIds.join(", ")}`] : []),
			...(entry.computationalArtifactIds.length > 0
				? [`  Computations: ${entry.computationalArtifactIds.join(", ")}`]
				: []),
			`  Rationale: ${summarizeText(entry.rationale)}`,
		].join("\n"),
	);
}

function formatSourcesForContext(sources: readonly LiteratureSourceArtifact[]): string[] {
	if (sources.length === 0) {
		return ["- (none)"];
	}
	return sources.map((source) =>
		[
			`- ${source.id}: ${source.title}`,
			`  Kind: ${source.kind}`,
			...(source.sourceType ? [`  Source type: ${source.sourceType}`] : []),
			...(source.venue ? [`  Venue: ${source.venue}`] : []),
			...(source.doi ? [`  DOI: ${source.doi}`] : []),
			...(source.externalId ? [`  External id: ${source.externalId}`] : []),
			...(source.publishedAt ? [`  Published: ${source.publishedAt}`] : []),
			...(source.citationCount !== undefined ? [`  Citations: ${source.citationCount}`] : []),
			...(source.provider ? [`  Provider: ${source.provider}`] : []),
			...((source.url ?? source.path) ? [`  Locator: ${source.url ?? source.path ?? ""}`] : []),
			...(source.extractedText?.trim() && source.citationEligibility !== "inventory-only"
				? [
						`  Extracted full text: citable (${source.extractedText.length} characters)`,
						`  Extracted preview: ${summarizeText(source.extractedText, 1_200)}`,
					]
				: []),
			`  Summary: ${summarizeText(source.summary)}`,
		].join("\n"),
	);
}

function formatComputationsForContext(
	state: CoMathProjectState,
	artifacts: readonly ComputationalArtifact[],
): string[] {
	if (artifacts.length === 0) {
		return ["- (none)"];
	}
	return artifacts.map((artifact) =>
		[
			`- ${artifact.id} on ${formatPathLabelForId(state, artifact.pathId, artifact.pathId)}: ${artifact.kind} ${artifact.status}`,
			...(artifact.exitCode !== undefined ? [`  Exit code: ${artifact.exitCode}`] : []),
			...(artifact.filePath ? [`  File: ${artifact.filePath}`] : []),
			`  Summary: ${summarizeText(artifact.summary)}`,
		].join("\n"),
	);
}

function formatTaskOwnedComputationsForContext(attempts: readonly ResearchTaskAttemptRecord[]): string[] {
	if (attempts.length === 0) {
		return ["- (none)"];
	}
	return attempts.map((attempt) =>
		[
			`- ${attempt.taskId} via ${attempt.id}: ${attempt.status}`,
			`  Content output ids: ${attempt.computationArtifactIds.join(", ")}`,
			...(attempt.reportArtifactId ? [`  Reviewed report output: ${attempt.reportArtifactId}`] : []),
		].join("\n"),
	);
}

function formatRunsForContext(state: CoMathProjectState): string[] {
	const relevant = state.researchWorkstreamRuns.filter(
		(run) =>
			run.status === "queued" || run.status === "running" || run.status === "blocked" || run.status === "failed",
	);
	if (relevant.length === 0) {
		return ["- (none)"];
	}
	return relevant
		.slice(-MAX_CONTEXT_ITEMS)
		.map((run) =>
			[
				`- ${formatPathLabelForId(state, run.pathId, run.pathTitle)}: ${run.status}`,
				`  Stage: ${formatRunStage(run)}`,
				...(run.failureReason ? [`  Reason: ${run.failureReason}`] : []),
				...(run.incrementalReports.at(-1) ? [`  Latest: ${run.incrementalReports.at(-1)?.summary ?? ""}`] : []),
			].join("\n"),
		);
}

function formatWorkingPaperSectionsForContext(sections: readonly WorkingPaperSection[]): string[] {
	if (sections.length === 0) {
		return ["- (none)"];
	}
	return sections.slice(-MAX_CONTEXT_ITEMS).map((section) => `- ${section.title}: ${summarizeText(section.body)}`);
}

function formatRunStage(run: ResearchWorkstreamRunRecord): string {
	if (run.currentStage === "literature-search") {
		return "literature search";
	}
	if (run.currentStage === "computation") {
		return "computation";
	}
	if (run.currentStage === "specialist") {
		return "specialist attempt";
	}
	if (run.currentStage === "critic") {
		return "critic review";
	}
	if (run.currentStage === "synthesizer") {
		return "synthesis";
	}
	return "coordinator framing";
}

function summarizeComputationArtifactForUser(state: CoMathProjectState, artifact: ComputationalArtifact): string {
	return `${formatPathLabelForId(state, artifact.pathId, artifact.pathId)} recorded finite computation output: ${summarizeText(
		artifact.summary,
	)}`;
}

function summarizeText(value: string, limit = 280): string {
	const compact = value.trim().replace(/\s+/g, " ");
	if (compact.length <= limit) {
		return compact;
	}
	return `${compact.slice(0, limit - 3)}...`;
}
