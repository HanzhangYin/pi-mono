import { createHash } from "node:crypto";
import type {
	CoMathProjectState,
	ResearchPlanTaskRecord,
	ResearchReviewFindingRecord,
	ResearchTaskAttemptRecord,
} from "./schema.ts";

const REPAIR_MARKER = "CRITIC-DRIVEN REPAIR";
const MAX_CERTIFICATE_LENGTH = 1_200;
const MAX_FAILED_REPAIR_LINEAGE_DEPTH = 2;
const ACTIONABLE_REVIEW =
	/\b(?:prove|show|establish|justify|derive|construct|display|exhibit|provide|supply|compute|execute|verify|determine|identify|ground|invoke|reissue|required?|missing|incomplete|not (?:proved|shown|constructed|displayed|established|justified))\b/i;
const CERTIFICATE_LANGUAGE =
	/\b(?:certificate|proof|argument|lemma|identity|equality|formula|bound|boundary|case|completeness|column|row|relation|lattice|minor|matrix|determinant|smith|kernel|pivot|elimination|saturation|presentation|computation|witness|counterexample|source|citation|excerpt|hypotheses|assumptions|map|morphism|involution|integral|integrality|grading|quotient|well[- ]defined)\b/i;
const SUBSTANTIVE_MATHEMATICAL_REPAIR =
	/\b(?:define|distinguish|replace|domain|codomain|hypotheses|formula|identity|equality|isomorphism|ideal|map|well[- ]defined|containment|boundary|sign|index|grading|torsion|rank)\b/i;
const RESOLVED_REVIEW_STATEMENT =
	/^(?:no\s+(?:mathematical\s+)?repair\s+is\s+required|the\b.{0,120}\btarget\s+(?:is|was|has been)\s+established\b|none\b)/i;
const DIAGNOSTIC_REVIEW_STATEMENT =
	/^(?:the\s+audit\b.{0,120}\b(?:must|should)\s+stop\b|the\b.{0,120}\btarget\s+(?:is|was|has been)\s+not\s+established\b)/i;
const COVERAGE_STOP_WORDS = new Set([
	"accepted",
	"attempt",
	"certificate",
	"claim",
	"complete",
	"conclude",
	"establish",
	"exactly",
	"finding",
	"missing",
	"parent",
	"provide",
	"provided",
	"required",
	"requested",
	"research",
	"statement",
	"task",
]);

export interface CriticRepairNeed {
	sourceAttemptId: string;
	sourceTaskId: string;
	findingId?: string;
	pathId?: string;
	kind: ResearchReviewFindingRecord["kind"];
	certificate: string;
	title: string;
	directive: string;
	acceptanceCriteria: string[];
}

export interface CriticRepairContract {
	sourceAttemptId: string;
	findingId?: string;
	integratesAcceptedRepairTaskId?: string;
	certificate: string;
	title: string;
	kind: ResearchReviewFindingRecord["kind"];
	acceptanceCriteria: string[];
}

/**
 * Turn the latest independently non-accepted review into one bounded repair certificate. The
 * review artifacts remain the durable source; the generated coordinator move persists the exact
 * contract selected from them. A source attempt is consumed once any later task carries its
 * marker, regardless of that repair's eventual verdict. A failed repair therefore generates a
 * new contract from its own review instead of reopening the broader parent task.
 */
export function deriveCriticRepairNeed(
	state: CoMathProjectState,
	recentTaskReviewContext: string,
): CriticRepairNeed | undefined {
	const integration = deriveRepairIntegrationNeed(state);
	if (integration) return integration;
	const capabilityRepair = deriveCapabilityRepairNeed(state);
	if (capabilityRepair) return capabilityRepair;
	const block = parseReviewBlocks(recentTaskReviewContext).at(-1);
	if (!block) return derivePersistedSiblingRepairNeed(state);
	const attempt = state.researchTaskAttempts.find((candidate) => candidate.id === block.attemptId);
	if (!attempt || (attempt.status !== "needs-revision" && attempt.status !== "rejected")) {
		return derivePersistedSiblingRepairNeed(state);
	}
	const sourceTask = state.researchPlanTasks.find((candidate) => candidate.id === attempt.taskId);
	if (!sourceTask) return derivePersistedSiblingRepairNeed(state);
	if (isBlockedLiteratureTask(sourceTask)) return derivePersistedSiblingRepairNeed(state);
	if (failedRepairLineageDepth(state, sourceTask) >= MAX_FAILED_REPAIR_LINEAGE_DEPTH) {
		return derivePersistedSiblingRepairNeed(state);
	}
	const structuredFinding = [...(attempt.reviewFindings ?? [])]
		.sort(
			(left, right) =>
				repairFindingPriority(sourceTask, attempt, left) - repairFindingPriority(sourceTask, attempt, right),
		)
		.find(
			(finding) =>
				!isResolvedReviewFinding(finding) &&
				!isDiagnosticReviewFinding(finding) &&
				!isAcceptedDependencyDocumentation(finding) &&
				!repairAlreadyScheduled(state, block.attemptId, finding.id) &&
				!findingCoveredByLaterAcceptedTask(state, sourceTask, finding) &&
				!repeatsUnchangedSourceRefresh(sourceTask, finding) &&
				!repeatsFailedCapabilityRepair(state, sourceTask, attempt, finding) &&
				!isSupersededArtifactForensics(sourceTask, attempt, finding),
		);
	if (structuredFinding) {
		const repair = repairForFinding(state, sourceTask, structuredFinding);
		return {
			sourceAttemptId: block.attemptId,
			sourceTaskId: sourceTask.id,
			findingId: structuredFinding.id,
			...(sourceTask.pathId ? { pathId: sourceTask.pathId } : {}),
			kind: repair.kind,
			certificate: repair.certificate,
			title: `Repair certificate: ${truncate(repair.certificate, 88)}`,
			directive: formatCriticRepairDirective(
				block.attemptId,
				repair.certificate,
				repair.acceptanceCriteria,
				undefined,
				structuredFinding.id,
				repair.kind,
			),
			acceptanceCriteria: repair.acceptanceCriteria,
		};
	}
	if ((attempt.reviewFindings ?? []).length > 0) {
		const revalidation = replacementRevalidationNeed(state, sourceTask, attempt);
		if (revalidation) return revalidation;
		return derivePersistedSiblingRepairNeed(state);
	}
	if (repairAlreadyScheduled(state, block.attemptId)) return derivePersistedSiblingRepairNeed(state);
	const certificate = selectCertificate(block.text);
	if (!certificate) return derivePersistedSiblingRepairNeed(state);
	const acceptanceCriteria = buildAcceptanceCriteria(certificate, inferRepairKind(certificate));
	const title = `Repair certificate: ${truncate(certificate, 88)}`;
	return {
		sourceAttemptId: block.attemptId,
		sourceTaskId: sourceTask.id,
		...(sourceTask.pathId ? { pathId: sourceTask.pathId } : {}),
		kind: inferRepairKind(certificate),
		certificate,
		title,
		directive: formatCriticRepairDirective(block.attemptId, certificate, acceptanceCriteria),
		acceptanceCriteria,
	};
}

function deriveCapabilityRepairNeed(state: CoMathProjectState): CriticRepairNeed | undefined {
	for (const attempt of [...state.researchTaskAttempts].reverse()) {
		if (attempt.status !== "needs-revision" && attempt.status !== "rejected") continue;
		const sourceTask = state.researchPlanTasks.find((candidate) => candidate.id === attempt.taskId);
		if (!sourceTask) continue;
		if (isBlockedLiteratureTask(sourceTask)) continue;
		if (failedRepairLineageDepth(state, sourceTask) >= MAX_FAILED_REPAIR_LINEAGE_DEPTH) continue;
		const findings = attempt.reviewFindings ?? [];
		const finding = findings.find(
			(candidate) =>
				candidate.stage === "capability-validation" &&
				!isResolvedReviewFinding(candidate) &&
				!isDiagnosticReviewFinding(candidate) &&
				!isAcceptedDependencyDocumentation(candidate) &&
				!shouldDeferCapabilityFinding(sourceTask, attempt, candidate) &&
				!repairAlreadyScheduled(state, attempt.id, candidate.id) &&
				!findingCoveredByLaterAcceptedTask(state, sourceTask, candidate) &&
				!repeatsUnchangedSourceRefresh(sourceTask, candidate) &&
				!repeatsFailedCapabilityRepair(state, sourceTask, attempt, candidate),
		);
		if (!finding) continue;
		const repair = repairForFinding(state, sourceTask, finding);
		return {
			sourceAttemptId: attempt.id,
			sourceTaskId: sourceTask.id,
			findingId: finding.id,
			...(sourceTask.pathId ? { pathId: sourceTask.pathId } : {}),
			kind: repair.kind,
			certificate: repair.certificate,
			title: `Repair certificate: ${truncate(repair.certificate, 88)}`,
			directive: formatCriticRepairDirective(
				attempt.id,
				repair.certificate,
				repair.acceptanceCriteria,
				undefined,
				finding.id,
				repair.kind,
			),
			acceptanceCriteria: repair.acceptanceCriteria,
		};
	}
	return undefined;
}

function derivePersistedSiblingRepairNeed(state: CoMathProjectState): CriticRepairNeed | undefined {
	const candidates = state.researchTaskAttempts
		.flatMap((attempt) => {
			const sourceTask = state.researchPlanTasks.find((task) => task.id === attempt.taskId);
			return sourceTask ? [{ attempt, sourceTask }] : [];
		})
		.sort((left, right) => right.sourceTask.sequence - left.sourceTask.sequence);
	for (const { attempt, sourceTask } of candidates) {
		if (attempt.status !== "needs-revision" && attempt.status !== "rejected") continue;
		if (isBlockedLiteratureTask(sourceTask)) continue;
		if (failedRepairLineageDepth(state, sourceTask) >= MAX_FAILED_REPAIR_LINEAGE_DEPTH) continue;
		const findings = attempt.reviewFindings ?? [];
		const hasScheduledSibling = findings.some((finding) => repairAlreadyScheduled(state, attempt.id, finding.id));
		if (!hasScheduledSibling && !findings.some(isConcreteExperimentFinding)) continue;
		const finding = [...findings]
			.sort(
				(left, right) =>
					repairFindingPriority(sourceTask, attempt, left) - repairFindingPriority(sourceTask, attempt, right),
			)
			.find(
				(candidate) =>
					candidate.stage !== "capability-validation" &&
					!isResolvedReviewFinding(candidate) &&
					!isDiagnosticReviewFinding(candidate) &&
					(hasScheduledSibling || isConcreteExperimentFinding(candidate)) &&
					!isAcceptedDependencyDocumentation(candidate) &&
					SUBSTANTIVE_MATHEMATICAL_REPAIR.test(candidate.statement) &&
					!repairAlreadyScheduled(state, attempt.id, candidate.id) &&
					!findingCoveredByLaterAcceptedTask(state, sourceTask, candidate) &&
					!repeatsUnchangedSourceRefresh(sourceTask, candidate) &&
					!isSupersededArtifactForensics(sourceTask, attempt, candidate),
			);
		if (!finding) continue;
		const repair = repairForFinding(state, sourceTask, finding);
		return {
			sourceAttemptId: attempt.id,
			sourceTaskId: sourceTask.id,
			findingId: finding.id,
			...(sourceTask.pathId ? { pathId: sourceTask.pathId } : {}),
			kind: repair.kind,
			certificate: repair.certificate,
			title: `Repair certificate: ${truncate(repair.certificate, 88)}`,
			directive: formatCriticRepairDirective(
				attempt.id,
				repair.certificate,
				repair.acceptanceCriteria,
				undefined,
				finding.id,
				repair.kind,
			),
			acceptanceCriteria: repair.acceptanceCriteria,
		};
	}
	return undefined;
}

export function parseCriticRepairDirective(directive: string | undefined): CriticRepairContract | undefined {
	if (!directive?.startsWith(REPAIR_MARKER)) return undefined;
	const sourceAttemptId = /^SOURCE ATTEMPT:\s*(\S+)\s*$/im.exec(directive)?.[1];
	const findingId = /^REPAIR FINDING:\s*(\S+)\s*$/im.exec(directive)?.[1];
	const integratesAcceptedRepairTaskId = /^INTEGRATES ACCEPTED REPAIR TASK:\s*(\S+)\s*$/im.exec(directive)?.[1];
	const explicitKind = /^TASK KIND:\s*(proof-attempt|refutation-attempt|computation|source-refresh)\s*$/im.exec(
		directive,
	)?.[1] as ResearchReviewFindingRecord["kind"] | undefined;
	const certificate = extractLabeledBlock(directive, "CERTIFICATE", "ACCEPTANCE CRITERIA");
	const criteriaBlock = extractLabeledBlock(directive, "ACCEPTANCE CRITERIA", "NON-GOALS");
	const acceptanceCriteria = criteriaBlock
		.split("\n")
		.map((line) => line.replace(/^\s*-\s*/, "").trim())
		.filter(Boolean);
	if (!sourceAttemptId || !certificate || acceptanceCriteria.length === 0) return undefined;
	const inferredKind = inferRepairKind(certificate);
	return {
		sourceAttemptId,
		...(findingId ? { findingId } : {}),
		...(integratesAcceptedRepairTaskId ? { integratesAcceptedRepairTaskId } : {}),
		certificate,
		title: `Repair certificate: ${truncate(certificate, 88)}`,
		kind:
			explicitKind === "computation" && !requiresExecutableComputationCertificate(certificate)
				? inferredKind
				: explicitKind === "proof-attempt" && inferredKind !== "proof-attempt"
					? inferredKind
					: (explicitKind ?? inferredKind),
		acceptanceCriteria,
	};
}

export function isCriticRepairDirective(directive: string | undefined): boolean {
	return parseCriticRepairDirective(directive) !== undefined;
}

export function extractStructuredReviewFindings(
	attemptId: string,
	stage: Extract<ResearchReviewFindingRecord["stage"], "critic" | "skeptic">,
	review: string,
): ResearchReviewFindingRecord[] {
	if (stage === "skeptic" && /^## Verdict\s*\n\s*accepted\s*$/im.test(review)) return [];
	const headings =
		stage === "critic"
			? ["Repair certificates", "Required revisions", "Concerns"]
			: ["Unresolved certificates", "Concerns"];
	const findings: ResearchReviewFindingRecord[] = [];
	const seen = new Set<string>();
	for (const heading of headings) {
		const section = extractMarkdownSection(review, heading);
		if (!section) continue;
		for (const bullet of extractTopLevelBullets(section)) {
			const normalizedBullet = normalizeText(bullet);
			const explicitKind = /^\[(proof-attempt|refutation-attempt|computation|source-refresh)\]\s*/i.exec(
				normalizedBullet,
			)?.[1] as ResearchReviewFindingRecord["kind"] | undefined;
			const untagged = normalizedBullet.replace(
				/^\[(?:proof-attempt|refutation-attempt|computation|source-refresh)\]\s*/i,
				"",
			);
			if (
				/^(?:avoid|do not|don't|never|refrain)\b/i.test(untagged) ||
				RESOLVED_REVIEW_STATEMENT.test(untagged) ||
				DIAGNOSTIC_REVIEW_STATEMENT.test(untagged)
			)
				continue;
			const statement = normalizeRepairObligation(untagged);
			if (!ACTIONABLE_REVIEW.test(statement) || !CERTIFICATE_LANGUAGE.test(statement)) continue;
			const normalized = statement.toLowerCase();
			if (seen.has(normalized)) continue;
			seen.add(normalized);
			const bounded = truncate(statement, MAX_CERTIFICATE_LENGTH);
			const kind = explicitKind ?? inferRepairKind(bounded);
			findings.push({
				id: `review-finding-${createHash("sha256")
					.update(`${attemptId}\n${stage}\n${normalized}`)
					.digest("hex")
					.slice(0, 16)}`,
				stage,
				kind,
				statement: bounded,
				acceptanceCriteria: buildAcceptanceCriteria(bounded, kind),
			});
		}
		if (findings.length > 0 && (heading === "Repair certificates" || heading === "Unresolved certificates")) {
			break;
		}
	}
	return findings;
}

function parseReviewBlocks(context: string): Array<{ attemptId: string; text: string }> {
	const matches = context.matchAll(
		/(?:^|\n\n)NON-ACCEPTED ATTEMPT\s+(\S+)\n([\s\S]*?)(?=\n\nNON-ACCEPTED ATTEMPT\s+|$)/g,
	);
	return [...matches].flatMap((match) => (match[1] && match[2] ? [{ attemptId: match[1], text: match[2] }] : []));
}

function selectCertificate(review: string): string | undefined {
	for (const heading of ["Repair certificates", "Unresolved certificates", "Required revisions", "Concerns"]) {
		const section = extractMarkdownSection(review, heading);
		if (!section) continue;
		for (const bullet of extractTopLevelBullets(section)) {
			const normalized = normalizeText(bullet);
			if (
				/^(?:avoid|do not|don't|never|refrain)\b/i.test(normalized) ||
				RESOLVED_REVIEW_STATEMENT.test(normalized) ||
				DIAGNOSTIC_REVIEW_STATEMENT.test(normalized)
			)
				continue;
			if (ACTIONABLE_REVIEW.test(normalized) && CERTIFICATE_LANGUAGE.test(normalized)) {
				return truncate(normalizeRepairObligation(normalized), MAX_CERTIFICATE_LENGTH);
			}
		}
	}
	return undefined;
}

function extractMarkdownSection(text: string, heading: string): string {
	const expression = new RegExp(
		`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|\\n(?:CRITIC|SKEPTIC)\\s*\\n|$)`,
		"i",
	);
	return expression.exec(text)?.[1]?.trim() ?? "";
}

function extractTopLevelBullets(section: string): string[] {
	const bullets: string[] = [];
	let current = "";
	for (const line of section.split("\n")) {
		if (/^-\s+/.test(line)) {
			if (current) bullets.push(current);
			current = line.replace(/^-\s+/, "");
		} else if (current && line.trim() && !/^\s+-\s+/.test(line)) {
			current += ` ${line.trim()}`;
		}
	}
	if (current) bullets.push(current);
	return bullets;
}

function buildAcceptanceCriteria(certificate: string, kind: ResearchReviewFindingRecord["kind"]): string[] {
	if (kind === "source-refresh") {
		return [
			`Establish exactly this missing source certificate: ${certificate}`,
			"Identify the inspected source and provide stable locators with bounded exact excerpts for every stated theorem and hypothesis.",
			"If the inspected source omits the requested material or is unavailable, record that limitation explicitly instead of inferring the missing statement.",
			"Do not claim the parent theorem; conclude only whether this source certificate has been established.",
		];
	}
	return [
		`Establish exactly this missing certificate: ${certificate}`,
		"Make every object, boundary case, and claimed equality used by the certificate explicit.",
		"Provide a checkable proof or exact computational witness, including unit, determinant, or finite data values when they are part of the certificate.",
		"Do not claim the parent theorem; conclude only whether this certificate has been established.",
	];
}

function deriveRepairIntegrationNeed(state: CoMathProjectState): CriticRepairNeed | undefined {
	for (const acceptedRepair of [...state.researchPlanTasks].reverse()) {
		if (
			acceptedRepair.status !== "completed" ||
			acceptedRepair.reviewOutcome !== "accepted" ||
			acceptedRepair.goal?.includes("INTEGRATES ACCEPTED REPAIR TASK:")
		) {
			continue;
		}
		const acceptedContract = parseCriticRepairDirective(acceptedRepair.goal);
		if (!acceptedContract || integrationAlreadyScheduled(state, acceptedRepair.id)) continue;
		const sourceAttempt = state.researchTaskAttempts.find(
			(candidate) => candidate.id === acceptedContract.sourceAttemptId,
		);
		if (!sourceAttempt || (sourceAttempt.status !== "needs-revision" && sourceAttempt.status !== "rejected")) {
			continue;
		}
		const sourceTask = state.researchPlanTasks.find((candidate) => candidate.id === sourceAttempt.taskId);
		const sourceContract = parseCriticRepairDirective(sourceTask?.goal);
		if (!sourceTask || !sourceContract) continue;
		const rootTask = sourceContract.kind === "computation" ? findRootComputationTask(state, sourceTask) : undefined;
		const rootTaskCertificate = rootTask
			? rootTask.goal?.trim() || rootTask.description.trim() || rootTask.title.trim()
			: undefined;
		const certificate =
			sourceContract.kind === "computation"
				? (rootTaskCertificate ??
					rootComputationCertificate(sourceContract.certificate) ??
					sourceContract.certificate)
				: sourceContract.certificate;
		const acceptedCertificate =
			acceptedContract.kind === "computation"
				? rootComputationCertificate(acceptedContract.certificate)
				: acceptedContract.certificate;
		if (sourceContract.kind === "computation" && acceptedCertificate === certificate) continue;
		if (laterAcceptedTaskCoversContract(state, acceptedRepair, sourceContract.kind, certificate)) {
			continue;
		}
		const acceptanceCriteria =
			sourceContract.kind === "computation"
				? rootTask?.acceptanceCriteria.length
					? rootTask.acceptanceCriteria
					: buildAcceptanceCriteria(certificate, sourceContract.kind)
				: sourceTask.acceptanceCriteria.length
					? sourceTask.acceptanceCriteria
					: buildAcceptanceCriteria(certificate, sourceContract.kind);
		return {
			sourceAttemptId: sourceAttempt.id,
			sourceTaskId: sourceTask.id,
			...(sourceContract.findingId ? { findingId: sourceContract.findingId } : {}),
			...(sourceTask.pathId ? { pathId: sourceTask.pathId } : {}),
			kind: sourceContract.kind,
			certificate,
			title: `Revalidate repaired certificate: ${truncate(certificate, 77)}`,
			directive: formatCriticRepairDirective(
				sourceAttempt.id,
				certificate,
				acceptanceCriteria,
				acceptedRepair.id,
				sourceContract.findingId,
				sourceContract.kind,
			),
			acceptanceCriteria,
		};
	}
	return undefined;
}

function formatCriticRepairDirective(
	sourceAttemptId: string,
	certificate: string,
	acceptanceCriteria: readonly string[],
	integratesAcceptedRepairTaskId?: string,
	findingId?: string,
	kind?: ResearchReviewFindingRecord["kind"],
): string {
	return [
		REPAIR_MARKER,
		`SOURCE ATTEMPT: ${sourceAttemptId}`,
		...(findingId ? [`REPAIR FINDING: ${findingId}`] : []),
		`TASK KIND: ${kind ?? inferRepairKind(certificate)}`,
		...(integratesAcceptedRepairTaskId ? [`INTEGRATES ACCEPTED REPAIR TASK: ${integratesAcceptedRepairTaskId}`] : []),
		integratesAcceptedRepairTaskId
			? "SCOPE: Revalidate exactly the bounded parent certificate using the accepted child repair. Do not broaden it into the parent theorem."
			: "SCOPE: Produce exactly one missing certificate from the independent review. Do not reattempt the parent theorem.",
		"CERTIFICATE:",
		certificate,
		"ACCEPTANCE CRITERIA:",
		...acceptanceCriteria.map((criterion) => `- ${criterion}`),
		"NON-GOALS:",
		"- Do not solve adjacent review concerns in this task.",
		"- Do not promote the rejected parent claim into accepted project knowledge.",
	].join("\n");
}

function extractLabeledBlock(text: string, start: string, end: string): string {
	const expression = new RegExp(`${start}:\\s*\\n([\\s\\S]*?)\\n${end}:`, "i");
	return expression.exec(text)?.[1]?.trim() ?? "";
}

function repairAlreadyScheduled(state: CoMathProjectState, sourceAttemptId: string, findingId?: string): boolean {
	const marker = findingId ? `REPAIR FINDING: ${findingId}` : `SOURCE ATTEMPT: ${sourceAttemptId}`;
	return state.researchPlanTasks.some((task) => task.goal?.includes(marker));
}

function failedRepairLineageDepth(state: CoMathProjectState, sourceTask: ResearchPlanTaskRecord): number {
	if (
		parseCriticRepairDirective(sourceTask.goal)?.kind === "computation" &&
		!hasArtifactlessNonRetryableFailureInLineage(state, sourceTask)
	) {
		return 0;
	}
	let depth = 0;
	let currentTask: ResearchPlanTaskRecord | undefined = sourceTask;
	const visitedTaskIds = new Set<string>();
	while (currentTask && !visitedTaskIds.has(currentTask.id)) {
		visitedTaskIds.add(currentTask.id);
		const contract = parseCriticRepairDirective(currentTask.goal);
		if (!contract) return depth;
		depth += 1;
		const parentAttempt = state.researchTaskAttempts.find((candidate) => candidate.id === contract.sourceAttemptId);
		currentTask = parentAttempt
			? state.researchPlanTasks.find((candidate) => candidate.id === parentAttempt.taskId)
			: undefined;
	}
	return depth;
}

function isBlockedLiteratureTask(sourceTask: ResearchPlanTaskRecord): boolean {
	if (sourceTask.kind !== "literature-search" && sourceTask.kind !== "source-refresh") return false;
	const taskText = [sourceTask.title, sourceTask.description, sourceTask.goal, ...sourceTask.acceptanceCriteria]
		.filter(Boolean)
		.join("\n");
	return /\b(?:blocked|non[- ]retryable|do not repeat|should not be (?:repeated|retried))\b/i.test(taskText);
}

function hasArtifactlessNonRetryableFailureInLineage(
	state: CoMathProjectState,
	sourceTask: ResearchPlanTaskRecord,
): boolean {
	let currentTask: ResearchPlanTaskRecord | undefined = sourceTask;
	const visitedTaskIds = new Set<string>();
	while (currentTask && !visitedTaskIds.has(currentTask.id)) {
		visitedTaskIds.add(currentTask.id);
		const attempts = currentTask.attemptIds.flatMap((attemptId) => {
			const attempt = state.researchTaskAttempts.find((candidate) => candidate.id === attemptId);
			return attempt ? [attempt] : [];
		});
		if (
			attempts.some((attempt) => attempt.failure?.retryable === false && attempt.computationArtifactIds.length === 0)
		) {
			return true;
		}
		const contract = parseCriticRepairDirective(currentTask.goal);
		if (!contract) return false;
		const parentAttempt = state.researchTaskAttempts.find((candidate) => candidate.id === contract.sourceAttemptId);
		currentTask = parentAttempt
			? state.researchPlanTasks.find((candidate) => candidate.id === parentAttempt.taskId)
			: undefined;
	}
	return false;
}

function findingCoveredByLaterAcceptedTask(
	state: CoMathProjectState,
	sourceTask: ResearchPlanTaskRecord,
	finding: ResearchReviewFindingRecord,
): boolean {
	const findingKind = effectiveRepairKind(finding);
	const findingTokens = coverageTokens([finding.statement, ...finding.acceptanceCriteria].join("\n"));
	if (findingTokens.size < 3) return false;
	return state.researchPlanTasks.some((task) => {
		if (
			task.sequence <= sourceTask.sequence ||
			task.status !== "completed" ||
			task.reviewOutcome !== "accepted" ||
			(sourceTask.pathId && task.pathId !== sourceTask.pathId) ||
			!taskCanCoverFinding(task, findingKind)
		) {
			return false;
		}
		const taskTokens = coverageTokens(
			[task.title, task.description, task.goal, ...task.acceptanceCriteria].filter(Boolean).join("\n"),
		);
		const sharedCount = [...findingTokens].filter((token) => taskTokens.has(token)).length;
		return sharedCount >= 3 && sharedCount / Math.min(findingTokens.size, taskTokens.size) >= 0.2;
	});
}

function taskCanCoverFinding(task: ResearchPlanTaskRecord, findingKind: ResearchReviewFindingRecord["kind"]): boolean {
	const taskKind =
		parseCriticRepairDirective(task.goal)?.kind ??
		inferRepairKind(
			[task.kind, task.title, task.description, task.goal, ...task.acceptanceCriteria].filter(Boolean).join("\n"),
		);
	if (findingKind === "source-refresh") {
		return task.kind === "literature-search" || task.kind === "source-refresh" || taskKind === "source-refresh";
	}
	return taskKind === findingKind;
}

function coverageTokens(text: string): Set<string> {
	return new Set(
		(text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
			(token) => (token.length >= 4 || /^\d{4,}$/.test(token)) && !COVERAGE_STOP_WORDS.has(token),
		),
	);
}

function integrationAlreadyScheduled(state: CoMathProjectState, acceptedRepairTaskId: string): boolean {
	const marker = `INTEGRATES ACCEPTED REPAIR TASK: ${acceptedRepairTaskId}`;
	return state.researchPlanTasks.some((task) => task.goal?.includes(marker));
}

function laterAcceptedTaskCoversContract(
	state: CoMathProjectState,
	acceptedRepair: ResearchPlanTaskRecord,
	kind: ResearchReviewFindingRecord["kind"],
	certificate: string,
): boolean {
	const certificateTokens = coverageTokens(certificate);
	const requiredAssignments = parameterAssignments(certificate);
	if (certificateTokens.size < 4) return false;
	return state.researchPlanTasks.some((task) => {
		if (
			task.sequence <= acceptedRepair.sequence ||
			task.status !== "completed" ||
			task.reviewOutcome !== "accepted" ||
			!taskCanCoverFinding(task, kind)
		) {
			return false;
		}
		const taskText = [task.title, task.description, task.goal, ...task.acceptanceCriteria].filter(Boolean).join("\n");
		const taskAssignments = parameterAssignments(taskText);
		if (![...requiredAssignments].every((assignment) => taskAssignments.has(assignment))) return false;
		const taskTokens = coverageTokens(taskText);
		const sharedCount = [...certificateTokens].filter((token) => taskTokens.has(token)).length;
		return sharedCount >= 4 && sharedCount / Math.min(certificateTokens.size, taskTokens.size) >= 0.3;
	});
}

function parameterAssignments(text: string): Set<string> {
	return new Set(
		[...text.matchAll(/\b([a-z][a-z0-9_]*)\s*=\s*(\d+)\b/gi)].map(
			(match) => `${match[1]?.toLowerCase()}=${match[2]}`,
		),
	);
}

function repeatsUnchangedSourceRefresh(
	sourceTask: CoMathProjectState["researchPlanTasks"][number],
	finding: ResearchReviewFindingRecord,
): boolean {
	return (
		finding.kind === "source-refresh" &&
		sourceTask.kind === "source-refresh" &&
		parseCriticRepairDirective(sourceTask.goal)?.kind === "source-refresh"
	);
}

function repeatsFailedCapabilityRepair(
	state: CoMathProjectState,
	sourceTask: ResearchPlanTaskRecord,
	sourceAttempt: ResearchTaskAttemptRecord,
	finding: ResearchReviewFindingRecord,
): boolean {
	if (
		finding.stage !== "capability-validation" ||
		sourceAttempt.computationArtifactIds.length > 0 ||
		sourceAttempt.failure?.stage !== "capability-validation"
	) {
		return false;
	}
	const contract = parseCriticRepairDirective(sourceTask.goal);
	if (!contract) return false;
	const parentAttempt = state.researchTaskAttempts.find((candidate) => candidate.id === contract.sourceAttemptId);
	return (
		parentAttempt?.failure?.stage === "capability-validation" &&
		parentAttempt.failure.code === sourceAttempt.failure.code &&
		parentAttempt.computationArtifactIds.length === 0
	);
}

function inferRepairKind(certificate: string): ResearchReviewFindingRecord["kind"] {
	if (/^\s*(?:prove|show|justify|derive)\b/i.test(certificate)) return "proof-attempt";
	if (
		/\b(?:search (?:the )?(?:external )?(?:mathematical )?literature|literature search|search (?:the )?arxiv|arxiv search|source-refresh|full[- ]text retrieval)\b/i.test(
			certificate,
		)
	) {
		return "source-refresh";
	}
	if (requiresExecutableComputationCertificate(certificate)) {
		return "computation";
	}
	if (
		/\b(?:source|citation|excerpt|reference|ground|literature|full[- ]text|doi|indexed passages?|theorem passages?)\w*/i.test(
			certificate,
		)
	) {
		return "source-refresh";
	}
	if (/\b(?:counterexample|refut|disprove|falsif)\w*/i.test(certificate)) return "refutation-attempt";
	return "proof-attempt";
}

function requiresExecutableComputationCertificate(certificate: string): boolean {
	return (
		/\b(?:sandbox(?:ed)?|script|executable code|computer(?:-algebra)?|CAS|machine-check(?:ed|able)?|task-owned computation artifact|captured outputs?|exit status|smith(?:[- ]normal[- ]form)?|SNF|invariant factors?)\b/i.test(
			certificate,
		) ||
		/^\s*(?:compute|calculate|enumerate|run|execute)\b/i.test(certificate) ||
		/\b(?:fixed|explicit) inputs?\b[\s\S]{0,160}\b(?:matri(?:x|ces)|vectors?|ranks?|values?|invariant factors?|finite data)\b/i.test(
			certificate,
		)
	);
}

function repairFindingPriority(
	sourceTask: ResearchPlanTaskRecord,
	attempt: ResearchTaskAttemptRecord,
	finding: ResearchReviewFindingRecord,
): number {
	if (finding.stage === "capability-validation") {
		return shouldDeferCapabilityFinding(sourceTask, attempt, finding) ? 3 : 0;
	}
	return finding.stage === "critic" ? 1 : 2;
}

function shouldDeferCapabilityFinding(
	sourceTask: ResearchPlanTaskRecord,
	attempt: ResearchTaskAttemptRecord,
	finding: ResearchReviewFindingRecord,
): boolean {
	const sourceKind =
		parseCriticRepairDirective(sourceTask.goal)?.kind ??
		inferRepairKind(
			[sourceTask.title, sourceTask.description, sourceTask.goal, ...sourceTask.acceptanceCriteria]
				.filter(Boolean)
				.join("\n"),
		);
	if (effectiveRepairKind(finding) === sourceKind) return false;
	return (attempt.reviewFindings ?? []).some(
		(candidate) =>
			candidate.stage !== "capability-validation" &&
			effectiveRepairKind(candidate) === sourceKind &&
			SUBSTANTIVE_MATHEMATICAL_REPAIR.test(candidate.statement),
	);
}

function isAcceptedDependencyDocumentation(finding: ResearchReviewFindingRecord): boolean {
	const text = [finding.statement, ...finding.acceptanceCriteria].join("\n");
	return (
		/\b(?:accepted (?:attempt|artifact|computation|dependency)|formal (?:argument|proof|isomorphism).{0,80}(?:proved|correct)|proved conditionally)\b/is.test(
			text,
		) &&
		/\b(?:cite|documentary|locator|stdout|stderr|exit status|sha-?256|digest|provenance|complete record)\b/i.test(
			text,
		)
	);
}

function isResolvedReviewFinding(finding: ResearchReviewFindingRecord): boolean {
	return RESOLVED_REVIEW_STATEMENT.test(finding.statement.trim());
}

function isDiagnosticReviewFinding(finding: ResearchReviewFindingRecord): boolean {
	return DIAGNOSTIC_REVIEW_STATEMENT.test(finding.statement.trim());
}

function isConcreteExperimentFinding(finding: ResearchReviewFindingRecord): boolean {
	if (effectiveRepairKind(finding) !== "computation") return false;
	const text = [finding.statement, ...finding.acceptanceCriteria].join("\n");
	return /\b[a-z][a-z0-9_]*\s*=\s*\[[^\]]+\]/i.test(text) || /\([a-z](?:\s*,\s*[a-z])+\)\s*=\s*\([^)]+\)/i.test(text);
}

function effectiveRepairKind(finding: ResearchReviewFindingRecord): ResearchReviewFindingRecord["kind"] {
	const inferred = inferRepairKind(finding.statement);
	if (finding.kind === "computation" && !requiresExecutableComputationCertificate(finding.statement)) {
		return inferred;
	}
	return inferred === "proof-attempt" ? finding.kind : inferred;
}

function repairForFinding(
	state: CoMathProjectState,
	sourceTask: ResearchPlanTaskRecord,
	finding: ResearchReviewFindingRecord,
): {
	kind: ResearchReviewFindingRecord["kind"];
	certificate: string;
	acceptanceCriteria: string[];
} {
	const sourceRepair = parseCriticRepairDirective(sourceTask.goal);
	const effectiveKind = effectiveRepairKind(finding);
	const inheritedRepair =
		effectiveKind === "computation" && sourceRepair
			? findSourceRepairContract(state, sourceRepair.sourceAttemptId)
			: undefined;
	const rootTask =
		effectiveKind === "computation"
			? findRootComputationTask(state, sourceTask)
			: effectiveKind === "source-refresh"
				? findRootSourceTask(state, sourceTask)
				: undefined;
	const baseRepair = [sourceRepair, inheritedRepair]
		.filter((repair): repair is CriticRepairContract => repair !== undefined)
		.sort((left, right) => right.certificate.length - left.certificate.length)[0];
	const rootTaskCertificate = rootTask
		? rootTask.goal?.trim() || rootTask.description.trim() || rootTask.title.trim()
		: undefined;
	const baseCertificate =
		effectiveKind === "computation" || effectiveKind === "source-refresh"
			? (rootTaskCertificate ?? rootComputationCertificate(baseRepair?.certificate))
			: baseRepair?.certificate;
	const sourceCorrection =
		effectiveKind === "computation" && sourceRepair?.certificate.includes("CORRECTION ")
			? undefined
			: sourceRepair?.certificate;
	const findingStatement = normalizeRepairObligation(finding.statement);
	const requirements = [sourceCorrection, findingStatement].filter((requirement): requirement is string =>
		Boolean(requirement && requirement !== baseCertificate),
	);
	const certificate = baseCertificate
		? [
				baseCertificate,
				...requirements.map((requirement) =>
					effectiveKind === "computation"
						? `CORRECTION REQUIRED IN THE REPLACEMENT OUTPUT:\n${requirement}`
						: `REPAIR REQUIREMENT:\n${requirement}`,
				),
			].join("\n\n")
		: finding.statement;
	return {
		kind: effectiveKind,
		certificate,
		acceptanceCriteria: [
			...new Set([
				...(rootTask?.acceptanceCriteria ?? []),
				...(inheritedRepair?.acceptanceCriteria ?? []),
				...(sourceRepair?.acceptanceCriteria ?? []),
				...finding.acceptanceCriteria,
			]),
		],
	};
}

function findRootSourceTask(
	state: CoMathProjectState,
	sourceTask: ResearchPlanTaskRecord,
): ResearchPlanTaskRecord | undefined {
	let current = sourceTask;
	const visited = new Set<string>();
	while (!visited.has(current.id)) {
		visited.add(current.id);
		const contract = parseCriticRepairDirective(current.goal);
		if (!contract) {
			return current.kind === "source-refresh" || current.kind === "literature-search" ? current : undefined;
		}
		if (contract.kind !== "source-refresh") return undefined;
		const sourceAttempt = state.researchTaskAttempts.find((candidate) => candidate.id === contract.sourceAttemptId);
		const parentTask = sourceAttempt
			? state.researchPlanTasks.find((candidate) => candidate.id === sourceAttempt.taskId)
			: undefined;
		if (!parentTask) return undefined;
		current = parentTask;
	}
	return undefined;
}

function findRootComputationTask(
	state: CoMathProjectState,
	sourceTask: ResearchPlanTaskRecord,
): ResearchPlanTaskRecord | undefined {
	let current = sourceTask;
	const visited = new Set<string>();
	while (!visited.has(current.id)) {
		visited.add(current.id);
		const contract = parseCriticRepairDirective(current.goal);
		if (!contract) {
			const taskText = [
				current.kind,
				current.title,
				current.description,
				current.goal,
				...current.acceptanceCriteria,
			]
				.filter(Boolean)
				.join("\n");
			return current.kind === "computation" || inferRepairKind(taskText) === "computation" ? current : undefined;
		}
		if (contract.kind !== "computation") return undefined;
		const sourceAttempt = state.researchTaskAttempts.find((candidate) => candidate.id === contract.sourceAttemptId);
		const parentTask = sourceAttempt
			? state.researchPlanTasks.find((candidate) => candidate.id === sourceAttempt.taskId)
			: undefined;
		if (!parentTask) return undefined;
		current = parentTask;
	}
	return undefined;
}

function findSourceRepairContract(
	state: CoMathProjectState,
	sourceAttemptId: string,
): CriticRepairContract | undefined {
	const attempt = state.researchTaskAttempts.find((candidate) => candidate.id === sourceAttemptId);
	const task = attempt ? state.researchPlanTasks.find((candidate) => candidate.id === attempt.taskId) : undefined;
	return parseCriticRepairDirective(task?.goal);
}

function isSupersededArtifactForensics(
	sourceTask: ResearchPlanTaskRecord,
	attempt: ResearchTaskAttemptRecord,
	finding: ResearchReviewFindingRecord,
): boolean {
	if (
		attempt.computationArtifactIds.length === 0 ||
		finding.kind !== "source-refresh" ||
		!sourceTask.goal?.includes("do not establish provenance of the superseded output")
	) {
		return false;
	}
	const referencedIds = finding.statement.match(/\b[a-f0-9]{64}\b/g) ?? [];
	return referencedIds.length > 0 && referencedIds.every((id) => !attempt.computationArtifactIds.includes(id));
}

function rootComputationCertificate(certificate: string | undefined): string | undefined {
	return certificate?.split(/\n\n(?:CORRECTION CONTEXT|CORRECTION REQUIRED)[^\n]*:\n/, 1)[0]?.trim();
}

function replacementRevalidationNeed(
	state: CoMathProjectState,
	sourceTask: ResearchPlanTaskRecord,
	attempt: ResearchTaskAttemptRecord,
): CriticRepairNeed | undefined {
	const findings = attempt.reviewFindings ?? [];
	if (
		attempt.computationArtifactIds.length === 0 ||
		findings.length === 0 ||
		!findings.every((finding) => isSupersededArtifactForensics(sourceTask, attempt, finding)) ||
		repairAlreadyScheduled(state, attempt.id)
	) {
		return undefined;
	}
	const contract = parseCriticRepairDirective(sourceTask.goal);
	const certificate = rootComputationCertificate(contract?.certificate);
	if (!certificate || contract?.kind !== "computation") return undefined;
	const acceptanceCriteria = buildAcceptanceCriteria(certificate, "computation");
	return {
		sourceAttemptId: attempt.id,
		sourceTaskId: sourceTask.id,
		...(sourceTask.pathId ? { pathId: sourceTask.pathId } : {}),
		kind: "computation",
		certificate,
		title: `Revalidate replacement computation: ${truncate(certificate, 72)}`,
		directive: formatCriticRepairDirective(
			attempt.id,
			certificate,
			acceptanceCriteria,
			undefined,
			undefined,
			"computation",
		),
		acceptanceCriteria,
	};
}

function normalizeText(text: string): string {
	return text.replace(/\\\n/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeRepairObligation(statement: string): string {
	const normalized = normalizeText(statement);
	const missing = /^(.+?)\s+(?:is|are)\s+(?:(?:therefore|still)\s+)*(?:missing|absent)(.*?)[.]?$/i.exec(normalized);
	if (missing?.[1]) {
		const subject = `${missing[1][0]?.toLowerCase() ?? ""}${missing[1].slice(1)}`;
		return `Provide ${subject}${missing[2] ?? ""}.`;
	}
	const notSupplied = /^(.+?)\s+(?:has|have)\s+not\s+been\s+(?:provided|supplied|displayed|computed)(.*?)[.]?$/i.exec(
		normalized,
	);
	if (notSupplied?.[1]) {
		const subject = `${notSupplied[1][0]?.toLowerCase() ?? ""}${notSupplied[1].slice(1)}`;
		return `Provide ${subject}${notSupplied[2] ?? ""}.`;
	}
	return normalized;
}

function truncate(text: string, limit: number): string {
	return text.length <= limit ? text : `${text.slice(0, limit - 3).trimEnd()}...`;
}
