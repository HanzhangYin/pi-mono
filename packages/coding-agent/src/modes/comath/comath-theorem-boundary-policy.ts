import type { ResearchCoordinatorReportDraft } from "./comath-coordinator-synthesis.ts";
import type { CoMathProjectState, ResearchCoordinatorNextMove, ResearchPlanTaskRecord } from "./schema.ts";

export const THEOREM_BOUNDARY_CONSOLIDATION_MARKER = "THEOREM-BOUNDARY CONSOLIDATION";
export const OPTIONAL_STRENGTHENING_MARKER = "OPTIONAL-STRENGTHENING WORKSTREAM";

const MINIMUM_BOUNDARY_RESULTS = 3;
const MAX_BOUNDARY_TASKS = 12;
const MAX_OPTIONAL_TASKS = 8;
const CONTRACT_CORRECTED_RETRY_MARKER = "CONTRACT-CORRECTED RETRY OF";
const BOUNDARY_OUTPUT_CONTRACT = [
	"Follow the mandatory specialist Markdown contract exactly.",
	"In ## Claims, state the strongest audited theorem as one [proved] claim bullet and state every optional strengthening as its own [conjectural] or [unsupported] claim bullet.",
	"In ## Strategy, give labelled paragraphs for Hypotheses, Dependency boundary, Consolidated proof, and Verdict.",
	"In ## Gaps, list optional statements and any missing required certificate. In ## Next, state either that the audited theorem boundary is ready for independent review or name the single required repair.",
].join(" ");

export function applyTheoremBoundaryPolicy(
	state: CoMathProjectState,
	report: ResearchCoordinatorReportDraft,
): ResearchCoordinatorReportDraft {
	const latestConsolidation = [...state.researchPlanTasks]
		.filter((task) => taskText(task).includes(THEOREM_BOUNDARY_CONSOLIDATION_MARKER))
		.sort((left, right) => right.sequence - left.sequence)[0];
	if (latestConsolidation && latestConsolidation.reviewOutcome !== "accepted") {
		if (latestConsolidation.kind !== "proof-attempt") {
			return scheduleCapabilityCorrectedBoundaryRetry(report, latestConsolidation);
		}
		const latestAttempt = latestConsolidation.latestAttemptId
			? state.researchTaskAttempts.find((attempt) => attempt.id === latestConsolidation.latestAttemptId)
			: undefined;
		if (
			latestAttempt?.failure?.stage === "claim-validation" &&
			latestAttempt.failure.code === "grounding-invalid" &&
			!taskText(latestConsolidation).includes(CONTRACT_CORRECTED_RETRY_MARKER)
		) {
			return scheduleContractCorrectedBoundaryRetry(report, latestConsolidation);
		}
		return report;
	}

	const boundaryStart = latestConsolidation?.sequence ?? 0;
	const boundaryTasks = state.researchPlanTasks
		.filter(
			(task) =>
				task.sequence > boundaryStart &&
				isAcceptedTheoremResult(task) &&
				hasClosedExplicitDependencies(state, task),
		)
		.sort((left, right) => left.sequence - right.sequence);
	if (boundaryTasks.length >= MINIMUM_BOUNDARY_RESULTS) {
		return scheduleBoundaryConsolidation(report, boundaryTasks);
	}
	if (!latestConsolidation) return report;

	const finalizedReport = annotateFinalizedBoundary(report, latestConsolidation);
	const optionalTasks = state.researchPlanTasks
		.filter(
			(task) =>
				task.id !== latestConsolidation.id &&
				task.reviewOutcome !== "accepted" &&
				task.status !== "completed" &&
				!taskText(task).includes(THEOREM_BOUNDARY_CONSOLIDATION_MARKER),
		)
		.sort((left, right) => right.sequence - left.sequence);
	if (optionalTasks.length === 0) return finalizedReport;
	const existingOptionalTask = state.researchPlanTasks.some(
		(task) => task.sequence > latestConsolidation.sequence && taskText(task).includes(OPTIONAL_STRENGTHENING_MARKER),
	);
	if (existingOptionalTask) return finalizedReport;

	return scheduleOptionalStrengthening(finalizedReport, latestConsolidation, optionalTasks);
}

function scheduleCapabilityCorrectedBoundaryRetry(
	report: ResearchCoordinatorReportDraft,
	failedTask: ResearchPlanTaskRecord,
): ResearchCoordinatorReportDraft {
	const prompt = [
		THEOREM_BOUNDARY_CONSOLIDATION_MARKER,
		`CAPABILITY-CORRECTED RETRY OF: ${failedTask.id}`,
		stripConflictingBoundaryOutputInstruction(failedTask.goal ?? failedTask.description),
		"This is a proof consolidation and adversarial proof audit, not a computation task. Preserve the exact theorem boundary and optional-statement separation from the failed task.",
		BOUNDARY_OUTPUT_CONTRACT,
	].join("\n");
	const move: ResearchCoordinatorNextMove = {
		title: "Retry the theorem-boundary consolidation with proof capabilities",
		...(failedTask.pathId ? { pathId: failedTask.pathId } : {}),
		rationale:
			"The prior boundary task failed before mathematical review because its assigned task capability did not match a proof audit. Its mathematical target remains unattempted.",
		prompt,
		priority: "high",
	};
	return {
		...report,
		recommendedNextMoves: [
			move,
			...report.recommendedNextMoves.map((candidate) => ({ ...candidate, priority: "medium" as const })),
		].slice(0, 3),
		...(failedTask.pathId ? { suggestedPathId: failedTask.pathId } : {}),
		suggestedPrompt: prompt,
	};
}

function scheduleContractCorrectedBoundaryRetry(
	report: ResearchCoordinatorReportDraft,
	failedTask: ResearchPlanTaskRecord,
): ResearchCoordinatorReportDraft {
	const prompt = [
		THEOREM_BOUNDARY_CONSOLIDATION_MARKER,
		`${CONTRACT_CORRECTED_RETRY_MARKER}: ${failedTask.id}`,
		stripConflictingBoundaryOutputInstruction(failedTask.goal ?? failedTask.description),
		"The prior specialist proof was not mathematically reviewed because its response omitted the mandatory claim ledger. Reproduce the proof under the contract below without broadening its theorem boundary.",
		BOUNDARY_OUTPUT_CONTRACT,
	].join("\n");
	const move: ResearchCoordinatorNextMove = {
		title: "Retry the theorem-boundary audit under the specialist claim contract",
		...(failedTask.pathId ? { pathId: failedTask.pathId } : {}),
		rationale:
			"The prior proof audit reached claim validation but used a report-shaped response instead of the mandatory claim ledger. It received no mathematical critique, so one contract-corrected retry is required.",
		prompt,
		priority: "high",
	};
	return {
		...report,
		recommendedNextMoves: [
			move,
			...report.recommendedNextMoves.map((candidate) => ({ ...candidate, priority: "medium" as const })),
		].slice(0, 3),
		...(failedTask.pathId ? { suggestedPathId: failedTask.pathId } : {}),
		suggestedPrompt: prompt,
	};
}

function scheduleBoundaryConsolidation(
	report: ResearchCoordinatorReportDraft,
	boundaryTasks: readonly ResearchPlanTaskRecord[],
): ResearchCoordinatorReportDraft {
	const selectedTasks = boundaryTasks.slice(-MAX_BOUNDARY_TASKS);
	const pathId = mostFrequentPathId(selectedTasks);
	const acceptedBoundary = selectedTasks
		.map((task) => `${task.id}${task.acceptedAttemptId ? ` (${task.acceptedAttemptId})` : ""}`)
		.join(", ");
	const prompt = [
		THEOREM_BOUNDARY_CONSOLIDATION_MARKER,
		`CANONICAL ACCEPTED RESULTS: ${acceptedBoundary}`,
		"Identify the strongest theorem whose complete proof dependency boundary is closed by the canonical accepted attempts above. State the theorem and hypotheses exactly; a claim may enter the theorem only when an accepted attempt proves it and every explicitly declared dependency is accepted.",
		"Independently reconstruct and adversarially audit the proof from those accepted results. Do not rely on unresolved, rejected, blocked, running, or merely computational claims, and do not infer a general statement from finite evidence.",
		"Separate every stronger statement not used by the audited proof under Optional statements. Such statements are conjectures or future work and cannot block the theorem proved here.",
		"If the boundary is not actually closed, give needs-revision and name exactly one missing required certificate instead of finalizing anything.",
		BOUNDARY_OUTPUT_CONTRACT,
	].join("\n");
	const move: ResearchCoordinatorNextMove = {
		title: "Consolidate and independently audit the strongest dependency-closed theorem",
		...(pathId ? { pathId } : {}),
		rationale:
			"Several accepted theorem-bearing results now have closed explicit dependencies. Consolidating their exact boundary has higher value than continuing an unrelated strengthening loop.",
		prompt,
		priority: "high",
	};
	return {
		...report,
		roadblocks: [
			...report.roadblocks,
			"Unresolved claims outside the candidate theorem's dependency boundary must be classified as optional strengthening, not as blockers of the consolidation audit.",
		],
		recommendedNextMoves: [
			move,
			...report.recommendedNextMoves.map((candidate) => ({ ...candidate, priority: "medium" as const })),
		].slice(0, 3),
		...(pathId ? { suggestedPathId: pathId } : {}),
		suggestedPrompt: prompt,
	};
}

function annotateFinalizedBoundary(
	report: ResearchCoordinatorReportDraft,
	consolidation: ResearchPlanTaskRecord,
): ResearchCoordinatorReportDraft {
	const boundaryStatement = `Accepted theorem-boundary consolidation ${consolidation.id} is finalized at its audited dependency boundary; claims outside that boundary are separate conjectures or future work.`;
	return {
		...report,
		whatWeKnow: report.whatWeKnow.includes(boundaryStatement)
			? report.whatWeKnow
			: [...report.whatWeKnow, boundaryStatement],
		roadblocks: [
			...report.roadblocks,
			"Open optional strengthenings do not alter or block the finalized theorem boundary.",
		],
	};
}

function scheduleOptionalStrengthening(
	report: ResearchCoordinatorReportDraft,
	consolidation: ResearchPlanTaskRecord,
	optionalTasks: readonly ResearchPlanTaskRecord[],
): ResearchCoordinatorReportDraft {
	const selectedTasks = optionalTasks.slice(0, MAX_OPTIONAL_TASKS);
	const pathId = mostFrequentPathId(selectedTasks) ?? consolidation.pathId;
	const prompt = [
		OPTIONAL_STRENGTHENING_MARKER,
		`FINALIZED THEOREM BOUNDARY: ${consolidation.id}`,
		`UNRESOLVED CANDIDATES: ${selectedTasks.map((task) => task.id).join(", ")}`,
		"Choose exactly one unresolved statement outside the finalized theorem's dependency boundary. State it exactly as a separate conjecture or proposed theorem, with explicit hypotheses, and explain why it is not required by the finalized result.",
		"Then choose the smallest high-information proof, refutation, literature, or exact-computation step for that statement. Do not reopen, weaken, or condition the finalized theorem on this optional work.",
		"Preserve every existing review objection. If the candidate is underspecified, repair only its statement before attempting proof or computation.",
	].join("\n");
	const move: ResearchCoordinatorNextMove = {
		title: "Isolate one optional strengthening as a separate conjecture workstream",
		...(pathId ? { pathId } : {}),
		rationale:
			"The strongest dependency-closed theorem has passed consolidation. Remaining claims should now be pursued independently without being allowed to block or contaminate that theorem.",
		prompt,
		priority: "high",
	};
	return {
		...report,
		recommendedNextMoves: [
			move,
			...report.recommendedNextMoves.map((candidate) => ({ ...candidate, priority: "medium" as const })),
		].slice(0, 3),
		...(pathId ? { suggestedPathId: pathId } : {}),
		suggestedPrompt: prompt,
	};
}

function isAcceptedTheoremResult(task: ResearchPlanTaskRecord): boolean {
	if (task.kind !== "proof-attempt" || task.reviewOutcome !== "accepted" || !task.acceptedAttemptId) return false;
	if (taskText(task).includes(OPTIONAL_STRENGTHENING_MARKER)) return false;
	return /\b(?:theorem|corollary|lemma|identity|formula|isomorphism|involution|basis|presentation|classification|minimality|rank|torsion|pairing|kernel)\b/i.test(
		taskText(task),
	);
}

function hasClosedExplicitDependencies(state: CoMathProjectState, task: ResearchPlanTaskRecord): boolean {
	return task.dependsOnTaskIds.every((dependencyId) => {
		const dependency = state.researchPlanTasks.find((candidate) => candidate.id === dependencyId);
		return dependency?.reviewOutcome === "accepted" && Boolean(dependency.acceptedAttemptId);
	});
}

function mostFrequentPathId(tasks: readonly ResearchPlanTaskRecord[]): string | undefined {
	const counts = new Map<string, number>();
	for (const task of tasks) {
		if (task.pathId) counts.set(task.pathId, (counts.get(task.pathId) ?? 0) + 1);
	}
	return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
}

function taskText(task: ResearchPlanTaskRecord): string {
	return [task.title, task.description, task.goal, ...task.acceptanceCriteria].filter(Boolean).join("\n");
}

function stripConflictingBoundaryOutputInstruction(text: string): string {
	return text
		.split("\n")
		.filter((line) => !line.trim().startsWith("Report exactly:"))
		.join("\n");
}
