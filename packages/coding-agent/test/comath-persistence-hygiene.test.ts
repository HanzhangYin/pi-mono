import { describe, expect, it } from "vitest";
import { repeatsPlannedResearchTask } from "../src/modes/comath/comath-research-agenda.ts";
import {
	applyPivotsToSuggestedNextMove,
	normalizeSuggestedNextMoveItem,
	pickSuggestedNextMove,
} from "../src/modes/comath/comath-research-discipline.ts";
import { classifyLiteratureSupport } from "../src/modes/comath/comath-research-runner.ts";
import {
	isSourceCommentaryClaim,
	mathClaimsNearlyMatch,
	stripMathDecorations,
} from "../src/modes/comath/comath-text-similarity.ts";
import type { CoMathProjectState } from "../src/modes/comath/schema.ts";
import {
	addMarginNote,
	addResearchConstraint,
	addResearchEvidenceBoardEntry,
	addResearchPlan,
	addResearchPlanTask,
	addTheoremApplicabilityCheck,
	createEmptyProjectState,
	getResearchPlanTasks,
	updateResearchPlanTask,
	upsertResearchEvidenceBoardEntry,
} from "../src/modes/comath/storage.ts";

const NOW = "2026-06-05T12:00:00.000Z";

function createState(): CoMathProjectState {
	return createEmptyProjectState({
		projectId: "proj-test",
		title: "Does the recorded polynomial take infinitely many prime values?",
		rootQuestion: "Does the recorded polynomial take infinitely many prime values?",
		now: NOW,
	});
}

describe("co-math claim comparison", () => {
	it("normalizes wrappers, markdown, LaTeX, and source labels away for comparison only", () => {
		expect(
			stripMathDecorations(
				"Unsupported by supplied sources: the **parity obstruction** argument \\(mod 4\\) is incomplete [source-3].",
			),
		).toBe("the parity obstruction argument mod 4 is incomplete .");
		expect(
			mathClaimsNearlyMatch(
				"Unsupported by supplied sources: the parity obstruction argument is incomplete for even indices.",
				"**The parity obstruction argument is incomplete for even indices**",
			),
		).toBe(true);
	});

	it("never matches claims that name different mathematics", () => {
		expect(
			mathClaimsNearlyMatch(
				"The form x^2+1 has a constrained prime divisor pattern modulo four.",
				"The form x^3+2 has a constrained prime divisor pattern modulo four.",
			),
		).toBe(false);
	});

	it("never lets a short generic text swallow a specific claim that contains its words", () => {
		expect(
			mathClaimsNearlyMatch(
				"Computation output",
				"Specialist computation output: Check moduli m<=5000 for a complete local obstruction",
			),
		).toBe(false);
	});

	it("normalizes wrapper variants so the same statement matches across labels", () => {
		expect(
			mathClaimsNearlyMatch(
				"Target statement: There are infinitely many primes of the form x^2+1.",
				"Unsupported from supplied sources: “There are infinitely many primes of the form x^2+1.”",
			),
		).toBe(true);
	});

	it("recognizes prose bibliographic commentary, not just leading source labels", () => {
		expect(
			isSourceCommentaryClaim(
				"The only directly relevant source is Carella's preprint, which claims/proposes a rigorous spectral-method proof for infinitely many primes.",
			),
		).toBe(true);
		expect(isSourceCommentaryClaim("[source-5] claims a proof of the statement.")).toBe(true);
		expect(isSourceCommentaryClaim("The polynomial takes infinitely many prime values for even indices.")).toBe(
			false,
		);
	});
});

describe("co-math evidence board dedupe", () => {
	it("merges the same gap arriving from different origins and keeps all provenance links", () => {
		let state = createState();
		const first = upsertResearchEvidenceBoardEntry(state, {
			claim: "Unsupported by supplied sources: the parity obstruction argument is incomplete for even indices.",
			classification: "unsupported",
			rationale: "Recorded by the critic as a gap.",
			sourceIds: ["source-1"],
			now: NOW,
			actor: "reviewer",
		});
		state = first.state;
		expect(first.merged).toBe(false);
		const second = upsertResearchEvidenceBoardEntry(state, {
			claim: "**The parity obstruction argument is incomplete for even indices**",
			classification: "unsupported",
			rationale: "Recorded as an open gap margin note for this research path.",
			sourceIds: ["source-2"],
			computationalArtifactIds: ["computation-1"],
			now: NOW,
			actor: "reviewer",
		});
		state = second.state;
		expect(second.merged).toBe(true);
		expect(second.entryId).toBe(first.entryId);
		expect(state.researchEvidenceBoard).toHaveLength(1);
		// The newcomer's links folded into the surviving entry: no provenance was lost.
		expect(state.researchEvidenceBoard[0]?.sourceIds).toEqual(["source-1", "source-2"]);
		expect(state.researchEvidenceBoard[0]?.computationalArtifactIds).toEqual(["computation-1"]);
	});

	it("keeps distinct computations separate even when a generic title shares their words", () => {
		let state = createState();
		const generic = upsertResearchEvidenceBoardEntry(state, {
			claim: "Computation output",
			classification: "computation",
			rationale: "Finite experiment output.",
			computationalArtifactIds: ["computation-1"],
			now: NOW,
			actor: "synthesizer",
		});
		state = generic.state;
		const specific = upsertResearchEvidenceBoardEntry(state, {
			claim: "Specialist computation output: Check moduli m<=5000 for a complete local obstruction",
			classification: "computation",
			rationale: "No complete local obstruction exists below the bound.",
			computationalArtifactIds: ["computation-2"],
			now: NOW,
			actor: "synthesizer",
		});
		state = specific.state;
		expect(specific.merged).toBe(false);
		expect(state.researchEvidenceBoard).toHaveLength(2);
		expect(state.researchEvidenceBoard[0]?.computationalArtifactIds).toEqual(["computation-1"]);
	});

	it("keeps genuinely distinct mathematical claims and all lineage records", () => {
		let state = createState();
		state = addResearchEvidenceBoardEntry(state, {
			claim: "The form x^2+1 has a constrained prime divisor pattern modulo four.",
			classification: "conjecture",
			rationale: "Observed on small cases.",
			now: NOW,
			actor: "workstream",
		});
		state = addResearchEvidenceBoardEntry(state, {
			claim: "The form x^3+2 has a constrained prime divisor pattern modulo four.",
			classification: "conjecture",
			rationale: "Observed on small cases.",
			now: NOW,
			actor: "workstream",
		});
		expect(state.researchEvidenceBoard).toHaveLength(2);
		// A statement revision is deliberately a new entry, however similar its wording.
		state = addResearchEvidenceBoardEntry(state, {
			claim: "The form x^2+1 has a constrained prime divisor pattern modulo four, for even x.",
			classification: "conjecture",
			rationale: "Weakened after the odd case failed.",
			parentEntryId: state.researchEvidenceBoard[0]?.id ?? "",
			revisionKind: "weakened",
			now: NOW,
			actor: "coordinator",
		});
		expect(state.researchEvidenceBoard).toHaveLength(3);
	});
});

describe("co-math literature evidence classification", () => {
	it("keeps unvalidated preprint proof claims out of theorem evidence", () => {
		expect(
			classifyLiteratureSupport({
				id: "claim-support-1",
				claim: "[source-5] is a preprint claiming a proof of the root statement.",
				sourceIds: ["source-5"],
				status: "supported",
				note: "It should not be treated as accepted literature without independent validation.",
				createdAt: NOW,
				updatedAt: NOW,
			}),
		).toBe("survey-context");
	});

	it("preserves a genuine source-backed theorem statement", () => {
		expect(
			classifyLiteratureSupport({
				id: "claim-support-2",
				claim: "Dirichlet's theorem gives infinitely many primes in every coprime arithmetic progression.",
				sourceIds: ["source-1"],
				status: "supported",
				note: "The cited source states the theorem and its coprimality condition.",
				createdAt: NOW,
				updatedAt: NOW,
			}),
		).toBe("theorem");
	});
});

describe("co-math theorem check dedupe", () => {
	it("treats naming variants as one check when target/consequence overlap, but keeps disagreements", () => {
		let state = createState();
		state = addTheoremApplicabilityCheck(state, {
			theorem: "Euler's criterion",
			targetObject: "the residue -1 modulo primes of interest",
			status: "applies",
			consequence: "Use the quadratic residue characterization of -1 to constrain prime divisors.",
			now: NOW,
			actor: "workstream",
		});
		state = addTheoremApplicabilityCheck(state, {
			theorem: "Euler/quadratic-residue criterion for -1",
			targetObject: "prime divisors of the form's values",
			status: "applies",
			consequence: "Use the quadratic-residue characterization of -1 to constrain prime divisors.",
			now: NOW,
			actor: "reviewer",
		});
		expect(state.theoremApplicabilityChecks).toHaveLength(1);
		// The same theorem with a materially different consequence is a new finding, not a repeat.
		state = addTheoremApplicabilityCheck(state, {
			theorem: "Euler's criterion",
			targetObject: "the residue -1 modulo primes of interest",
			status: "applies",
			consequence: "The criterion cannot be used before the primality of the divisor is established.",
			now: NOW,
			actor: "reviewer",
		});
		expect(state.theoremApplicabilityChecks).toHaveLength(2);
	});

	it("merges checks whose consequences paraphrase the same verdict about the same target", () => {
		let state = createState();
		state = addTheoremApplicabilityCheck(state, {
			theorem: "Friedlander–Iwaniec, primes \\(X^2+Y^4\\).",
			targetObject: "\\(n^2+1\\).",
			status: "rejected-as-direct-route",
			consequence: "gives a related polynomial-prime theorem, not the root statement [source-1].",
			now: NOW,
			actor: "workstream",
		});
		state = addTheoremApplicabilityCheck(state, {
			theorem: "Friedlander–Iwaniec, primes of the form \\(X^2+Y^4\\)",
			targetObject: "\\(n^2+1\\)",
			status: "rejected-as-direct-route",
			consequence: "gives related polynomial-prime infinitude, not primes \\(n^2+1\\) [source-2].",
			hypotheses: [{ hypothesis: "two variables \\(X,Y\\) vary", status: "failed" }],
			now: NOW,
			actor: "reviewer",
		});
		expect(state.theoremApplicabilityChecks).toHaveLength(1);
	});
});

describe("co-math constraint dedupe", () => {
	it("subsumes a restated rule carrying examples, labels, and LaTeX under the plain rule", () => {
		let state = createState();
		state = addResearchConstraint(state, {
			text: "Do not treat heuristic preprints as settled proofs.",
			origin: "reviewer",
			now: NOW,
			actor: "reviewer",
		});
		state = addResearchConstraint(state, {
			text: "Do not treat heuristic preprints (e.g. [source-5]'s proposed $x^2+1$ proof) as settled proofs.",
			origin: "reviewer",
			now: NOW,
			actor: "reviewer",
		});
		expect(state.researchConstraints).toHaveLength(1);
		state = addResearchConstraint(state, {
			text: "Do not present computational evidence as a proof of an infinite statement.",
			origin: "reviewer",
			now: NOW,
			actor: "reviewer",
		});
		expect(state.researchConstraints).toHaveLength(2);
	});

	it("subsumes the same rule restated with a swapped verb, but keeps different rules", () => {
		let state = createState();
		state = addResearchConstraint(state, {
			text: "Do not infer fixed one-variable prime infinitude from multivariable polynomial-prime theorems.",
			origin: "reviewer",
			now: NOW,
			actor: "reviewer",
		});
		state = addResearchConstraint(state, {
			text: "Do not cite multivariable polynomial-prime theorems as proving the one-variable statement.",
			origin: "reviewer",
			now: NOW,
			actor: "reviewer",
		});
		expect(state.researchConstraints).toHaveLength(1);
		state = addResearchConstraint(state, {
			text: "Do not infer prime infinitude from local admissibility.",
			origin: "reviewer",
			now: NOW,
			actor: "reviewer",
		});
		expect(state.researchConstraints).toHaveLength(2);
	});
});

describe("co-math margin note dedupe", () => {
	it("keeps one open note per finding and kind, while deliberate cross-kind mirroring survives", () => {
		let state = createState();
		state = addMarginNote(state, {
			id: "margin-note-1",
			kind: "scrutiny",
			subjectId: "path-1",
			message: "Independent review: The set S must be defined as a finite set of distinct primes.",
			now: NOW,
			actor: "reviewer",
		});
		// A later review round restating the same finding (without the provenance prefix) is a repeat.
		state = addMarginNote(state, {
			id: "margin-note-2",
			kind: "scrutiny",
			subjectId: "path-1",
			message: "The set S must be defined as a finite set of distinct primes.",
			now: NOW,
			actor: "reviewer",
		});
		expect(state.marginNotes).toHaveLength(1);
		// A gap note deliberately mirroring the finding for human attention is not a duplicate.
		state = addMarginNote(state, {
			id: "margin-note-2",
			kind: "gap",
			subjectId: "path-1",
			message: "The set S must be defined as a finite set of distinct primes.",
			now: NOW,
			actor: "reviewer",
		});
		expect(state.marginNotes).toHaveLength(2);
	});
});

describe("co-math suggested next move hygiene", () => {
	it("drops section fragments and labels instead of persisting them as moves", () => {
		expect(normalizeSuggestedNextMoveItem("Route change From literature settlement to residue computations")).toBe(
			"",
		);
		expect(normalizeSuggestedNextMoveItem("Concrete replacement route:")).toBe("");
		expect(normalizeSuggestedNextMoveItem("Next steps:")).toBe("");
		expect(normalizeSuggestedNextMoveItem("Next: run the residue computation for moduli up to 40")).toBe(
			"run the residue computation for moduli up to 40",
		);
	});

	it("rejects dangling fragments and falls back to later candidates or the recorded pivot", () => {
		// A fragment ending mid-thought is not a move.
		expect(normalizeSuggestedNextMoveItem("Prove the parity lemma, marking the even case separately:")).toBe("");
		expect(
			pickSuggestedNextMove(
				["Concrete replacement route:", "Route change From searching to computing"],
				["Enumerate residues for small moduli and record which classes are excluded."],
			),
		).toBe("Enumerate residues for small moduli and record which classes are excluded.");
		// With only malformed text and a recorded pivot, the pivot's destination is the move.
		expect(
			applyPivotsToSuggestedNextMove(
				"Route change From literature settlement to residue computations",
				[
					{
						fromRoute: "literature settlement search",
						toRoute: "residue obstruction computations for small moduli",
						reason: "no authoritative source was available",
					},
				],
				[],
			),
		).toBe("Pursue the replacement route: residue obstruction computations for small moduli.");
	});
});

describe("co-math plan task anti-repeat", () => {
	function withCompletedComputationTask(): CoMathProjectState {
		let state = createState();
		state = addResearchPlan(state, { title: "Plan", objective: "Progress.", now: NOW, actor: "human" });
		state = addResearchPlanTask(state, {
			planId: "research-plan-1",
			kind: "computation",
			title: "Run a bounded computation on small cases",
			description: "Enumerate values for small indices and record prime counts.",
			acceptanceCriteria: ["A table of prime counts for small indices exists."],
			now: NOW,
			actor: "human",
		});
		state = updateResearchPlanTask(state, {
			taskId: getResearchPlanTasks(state, "research-plan-1")[0]?.id ?? "",
			status: "completed",
			completedAt: NOW,
			now: NOW,
		});
		return state;
	}

	it("blocks a restated task unless it sharpens the target with a new acceptance criterion", () => {
		const state = withCompletedComputationTask();
		expect(
			repeatsPlannedResearchTask(state, {
				kind: "computation",
				title: "Run bounded computations on small cases",
				description: "Enumerate values for small indices and record the prime counts.",
			}),
		).toBe(true);
		// Naming a new bound and statistic makes the repeat a refinement, which is allowed.
		expect(
			repeatsPlannedResearchTask(state, {
				kind: "computation",
				title: "Run bounded computations on small cases",
				description: "Enumerate values for small indices and record the prime counts.",
				acceptanceCriteria: ["Counts extend to 10^6 with a residue-class breakdown of the excluded classes."],
			}),
		).toBe(false);
		// Genuinely different work is never blocked.
		expect(
			repeatsPlannedResearchTask(state, {
				kind: "proof-attempt",
				title: "Prove the parity obstruction lemma",
				description: "Write the argument excluding odd indices beyond the base case.",
			}),
		).toBe(false);
		// Wrap-up kinds recur by design.
		expect(
			repeatsPlannedResearchTask(state, {
				kind: "synthesis",
				title: "Run a bounded computation on small cases",
				description: "Enumerate values for small indices and record prime counts.",
			}),
		).toBe(false);
	});
});
