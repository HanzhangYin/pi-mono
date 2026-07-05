/**
 * Conjecture revision for the co-math harness (the Lakatos move).
 *
 * When a statement is refuted or seriously wounded, a revise-conjecture plan task asks the
 * research model to propose repaired statements. Each accepted revision is persisted as a new
 * evidence-board entry whose `parentEntryId` points at the statement it replaces, so the full
 * lineage — what was believed, what killed it, and what replaced it — stays durable and auditable.
 * The model authors content only; deterministic code validates shape, caps, and classification
 * (revisions are always recorded as conjectures, never self-certified higher). Without a model
 * executor the task blocks: a deterministic "revision" would be fake reformulation.
 */

import { extractCoMathJsonObject } from "./comath-markdown.ts";
import type { ResearchWorkstreamModelExecutor } from "./comath-research-model-workstream.ts";
import type {
	CoMathProjectState,
	ConjectureRevisionKind,
	ResearchEvidenceBoardEntry,
	ResearchPath,
	ResearchPlanTaskRecord,
} from "./schema.ts";
import { addResearchEvidenceBoardEntry, getEvidenceChildren, getEvidenceLineage } from "./storage.ts";

export const MAX_CONJECTURE_REVISIONS = 2;
const MAX_STATEMENT_LENGTH = 400;
const MAX_NOTE_LENGTH = 200;
const MAX_REFUTING_EVIDENCE_LINES = 6;

const REVISION_KINDS: readonly ConjectureRevisionKind[] = [
	"weakened",
	"strengthened",
	"specialized",
	"generalized",
	"repaired",
];

export interface ConjectureRevisionDraft {
	statement: string;
	revisionKind: ConjectureRevisionKind;
	note?: string;
}

export interface RunConjectureRevisionTaskInput {
	executor?: ResearchWorkstreamModelExecutor;
	task: ResearchPlanTaskRecord;
	now: string;
}

export interface RunConjectureRevisionTaskResult {
	state: CoMathProjectState;
	outcome: "revised" | "blocked";
	blockedReason?: string;
	/** The statement the revisions descend from. */
	parentEntryId?: string;
	revisedEntryIds: string[];
	revisions: ConjectureRevisionDraft[];
}

/**
 * Execute a revise-conjecture plan task. Persists the revised statements (and, if needed, an
 * entry for the original statement so the lineage has a root) and returns the new entry ids.
 * Nothing is persisted on a blocked outcome.
 */
export async function runConjectureRevisionTask(
	state: CoMathProjectState,
	input: RunConjectureRevisionTaskInput,
): Promise<RunConjectureRevisionTaskResult> {
	const blocked = (reason: string): RunConjectureRevisionTaskResult => ({
		state,
		outcome: "blocked",
		blockedReason: reason,
		revisedEntryIds: [],
		revisions: [],
	});
	if (!input.executor) {
		return blocked("I need a research model to propose revised statements.");
	}
	const target = findRevisionTarget(state);
	const refutingEvidence = collectRefutingEvidence(state);
	if (refutingEvidence.length === 0) {
		return blocked("Nothing has refuted or weakened the statement yet, so there is nothing to revise.");
	}
	let responseText: string;
	try {
		const response = await input.executor.run({
			role: "synthesizer",
			rootQuestion: state.rootQuestion,
			path: revisionPath(state, input.now),
			allPaths: state.researchPaths,
			priorFindings: state.researchReports.flatMap((report) => report.findings).slice(-8),
			inputText: refutingEvidence.join("\n"),
			prompt: buildConjectureRevisionPrompt(state, target, refutingEvidence, input.task),
		});
		responseText = response.text;
	} catch {
		return blocked("The research model was not able to draft revised statements this time.");
	}
	const revisions = parseConjectureRevisions(responseText);
	if (revisions.length === 0) {
		return blocked("The revision draft did not contain a usable revised statement.");
	}
	let nextState = state;
	// The lineage needs a durable root: record the original statement first if it only exists as
	// the root question.
	let parentEntryId = target?.id;
	if (!parentEntryId) {
		const beforeCount = nextState.researchEvidenceBoard.length;
		nextState = addResearchEvidenceBoardEntry(nextState, {
			claim: state.rootQuestion,
			classification: "conjecture",
			rationale: "Original statement of the research question, kept on record for the revision history.",
			now: input.now,
			actor: "coordinator",
		});
		parentEntryId = nextState.researchEvidenceBoard.at(-1)?.id;
		if (nextState.researchEvidenceBoard.length === beforeCount || !parentEntryId) {
			return blocked("The original statement could not be recorded for revision.");
		}
	}
	const revisedEntryIds: string[] = [];
	for (const revision of revisions) {
		const beforeCount = nextState.researchEvidenceBoard.length;
		nextState = addResearchEvidenceBoardEntry(nextState, {
			claim: revision.statement,
			classification: "conjecture",
			rationale: `Revised (${revision.revisionKind}) after the earlier statement was refuted or weakened.`,
			parentEntryId,
			revisionKind: revision.revisionKind,
			revisionNote: revision.note ?? refutingEvidence[0] ?? "",
			now: input.now,
			actor: "coordinator",
		});
		if (nextState.researchEvidenceBoard.length > beforeCount) {
			const entryId = nextState.researchEvidenceBoard.at(-1)?.id;
			if (entryId) {
				revisedEntryIds.push(entryId);
			}
		}
	}
	if (revisedEntryIds.length === 0) {
		return blocked("The revised statements were already on record.");
	}
	return {
		state: nextState,
		outcome: "revised",
		parentEntryId,
		revisedEntryIds,
		revisions,
	};
}

/**
 * The statement currently under attack: the most recent conjecture-classified entry that has not
 * itself been superseded by a revision. Undefined when the statement only exists as the root
 * question.
 */
export function findRevisionTarget(state: CoMathProjectState): ResearchEvidenceBoardEntry | undefined {
	return [...state.researchEvidenceBoard]
		.reverse()
		.find(
			(entry) =>
				(entry.classification === "conjecture" || entry.classification === "theorem") &&
				getEvidenceChildren(state, entry.id).length === 0,
		);
}

/** Durable evidence pointing against the statement as written, most recent first. */
export function collectRefutingEvidence(state: CoMathProjectState): string[] {
	const lines: string[] = [];
	for (const entry of [...state.researchEvidenceBoard].reverse()) {
		if (entry.classification === "conflicting") {
			lines.push(`${entry.claim} — ${entry.rationale}`);
		}
	}
	for (const note of [...state.marginNotes].reverse()) {
		if (note.kind === "scrutiny" && note.status === "open") {
			lines.push(note.message);
		}
	}
	const latestReport = state.researchReports.at(-1);
	for (const criticism of latestReport?.criticisms ?? []) {
		lines.push(criticism);
	}
	return lines
		.map((line) => line.replace(/\s+/g, " ").trim())
		.filter(Boolean)
		.slice(0, MAX_REFUTING_EVIDENCE_LINES);
}

export function buildConjectureRevisionPrompt(
	state: CoMathProjectState,
	target: ResearchEvidenceBoardEntry | undefined,
	refutingEvidence: readonly string[],
	task: ResearchPlanTaskRecord,
): string {
	const lineage = target ? getEvidenceLineage(state, target.id) : [];
	return [
		"You are revising a mathematical statement that the evidence has refuted or weakened.",
		"Propose repaired statements in the spirit of Lakatos: keep what the evidence supports, exclude exactly what failed.",
		"Rules:",
		`- Propose 1 to ${MAX_CONJECTURE_REVISIONS} revised statements, strongest defensible first.`,
		`- Each revisionKind must be one of: ${REVISION_KINDS.join(", ")}.`,
		"- Each revision needs a one-sentence note naming exactly what refuted the earlier statement.",
		"- Do not restate the refuted statement unchanged, and do not claim any revision is proved.",
		"",
		`Statement under revision: ${target?.claim ?? state.rootQuestion}`,
		...(lineage.length > 1
			? ["Earlier revisions of this statement:", ...lineage.slice(0, -1).map((entry) => `- ${entry.claim}`)]
			: []),
		"",
		"Evidence against the statement as written:",
		...refutingEvidence.map((line) => `- ${line}`),
		"",
		...(task.goal ? [`Task goal: ${task.goal}`] : []),
		...(task.acceptanceCriteria.length > 0
			? ["Done when:", ...task.acceptanceCriteria.map((criterion) => `- ${criterion}`)]
			: []),
		"",
		"Return ONLY a JSON object, no prose, shaped like:",
		JSON.stringify(
			{
				revisions: [{ statement: "revised statement", revisionKind: "weakened", note: "what failed" }],
			},
			null,
			1,
		),
	].join("\n");
}

/** Parse and validate the model's revision JSON. Invalid entries are dropped, never repaired. */
export function parseConjectureRevisions(text: string): ConjectureRevisionDraft[] {
	const parsed = extractCoMathJsonObject(text);
	if (!parsed || !Array.isArray(parsed.revisions)) {
		return [];
	}
	const drafts: ConjectureRevisionDraft[] = [];
	for (const raw of parsed.revisions.slice(0, MAX_CONJECTURE_REVISIONS)) {
		if (typeof raw !== "object" || raw === null) {
			continue;
		}
		const revision = raw as Record<string, unknown>;
		const statement =
			typeof revision.statement === "string" ? truncate(revision.statement.trim(), MAX_STATEMENT_LENGTH) : "";
		if (!statement) {
			continue;
		}
		const revisionKind = REVISION_KINDS.find((candidate) => candidate === revision.revisionKind) ?? "repaired";
		const note =
			typeof revision.note === "string" && revision.note.trim()
				? truncate(revision.note.trim(), MAX_NOTE_LENGTH)
				: undefined;
		drafts.push({ statement, revisionKind, ...(note ? { note } : {}) });
	}
	return drafts;
}

function revisionPath(state: CoMathProjectState, now: string): ResearchPath {
	const active = [...state.researchPaths]
		.filter((path) => path.status !== "abandoned")
		.sort((a, b) => a.priority - b.priority)[0];
	return (
		active ?? {
			id: "path-revision",
			title: "Statement revision",
			objective: state.rootQuestion,
			status: "active",
			latestFindings: [],
			blockers: [],
			suggestedNextMove: "Propose a repaired statement.",
			priority: 1,
			createdAt: now,
			updatedAt: now,
		}
	);
}

function truncate(text: string, maxLength: number): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) {
		return normalized;
	}
	return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}
