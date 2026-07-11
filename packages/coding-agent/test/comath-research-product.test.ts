import { describe, expect, it } from "vitest";
import {
	buildStateOfProblemDocument,
	buildStateOfProblemSectionBody,
	describeRootQuestionVerdict,
	STATE_OF_PROBLEM_SECTION_TITLE,
} from "../src/modes/comath/comath-research-product.ts";
import type { CoMathProjectState, ResearchEvidenceClassification } from "../src/modes/comath/schema.ts";
import {
	addComputationalArtifact,
	addLiteratureSourceArtifact,
	addResearchEvidenceBoardEntry,
	addResearchObligation,
	addTheoremApplicabilityCheck,
	createEmptyProjectState,
	updateResearchObligation,
} from "../src/modes/comath/storage.ts";

const NOW = "2026-06-05T12:00:00.000Z";

const FORBIDDEN_PRODUCT_TERMS = ["role-run", "queue", "schema", "artifact", "workstream-", "/comath"];

const INTERNAL_ID_PATTERNS = [/evidence-board-\d/, /obligation-\d/, /research-plan-task-/];

function expectProductDocument(text: string): void {
	for (const term of FORBIDDEN_PRODUCT_TERMS) {
		expect(text).not.toContain(term);
	}
	for (const pattern of INTERNAL_ID_PATTERNS) {
		expect(text).not.toMatch(pattern);
	}
}

function createState(): CoMathProjectState {
	return createEmptyProjectState({
		projectId: "proj-test",
		title: "Are there infinitely many primes of the form n^2 + 1?",
		rootQuestion: "Are there infinitely many primes of the form n^2 + 1?",
		now: NOW,
	});
}

function withEvidence(
	state: CoMathProjectState,
	claim: string,
	classification: ResearchEvidenceClassification,
	extra: { sourceIds?: string[]; reportId?: string } = {},
): CoMathProjectState {
	return addResearchEvidenceBoardEntry(state, {
		claim,
		classification,
		rationale: "Recorded for the state-of-problem test.",
		...(extra.sourceIds ? { sourceIds: extra.sourceIds } : {}),
		...(extra.reportId ? { reportId: extra.reportId } : {}),
		now: NOW,
		actor: "workstream",
	});
}

describe("state of the problem document", () => {
	it("reads an open root question as open with computation-only support and no established facts", () => {
		let state = createState();
		state = addResearchObligation(state, {
			statement: state.rootQuestion,
			now: NOW,
			actor: "system",
		});
		state = withEvidence(
			state,
			"All n up to 10^6 were checked and 112 primes of the form n^2 + 1 were found.",
			"computation",
			{ reportId: "research-report-1" },
		);

		const document = buildStateOfProblemDocument(state);
		expect(document.startsWith(STATE_OF_PROBLEM_SECTION_TITLE)).toBe(true);
		expect(document).toContain("The question");
		expect(document).toContain("Are there infinitely many primes of the form n^2 + 1?");
		expect(document).toContain("Verdict: the question remains open.");
		expect(document).toContain("computational only: bounded evidence, not proof");
		expect(document).not.toContain("answered");
		expect(document).toContain(
			"None yet. No theorem-level statement on record carries source support or a passed theorem check",
		);
		expect(document).toContain("no independent check has been run on this result");
		expect(document).toContain("Finite computation is evidence, not proof");
		expectProductDocument(document);
	});

	it("admits only supported theorem entries into established facts", () => {
		let state = createState();
		state = addLiteratureSourceArtifact(state, {
			kind: "paper",
			title: "Primes represented by quadratic polynomials",
			url: "https://arxiv.org/abs/1234.5678",
			summary: "Survey of quadratic prime-value results.",
			now: NOW,
			actor: "system",
		});
		state = withEvidence(
			state,
			"The Friedlander–Iwaniec theorem shows infinitely many primes of the form X^2 + Y^4. [source-1]",
			"theorem",
			{ sourceIds: ["source-1"] },
		);
		state = withEvidence(
			state,
			"Every quadratic polynomial with positive leading coefficient takes infinitely many prime values.",
			"theorem",
		);

		const document = buildStateOfProblemDocument(state);
		expect(document).toContain("The Friedlander–Iwaniec theorem shows infinitely many primes of the form X^2 + Y^4.");
		expect(document).toContain("(cites source-1 (Primes represented by quadratic polynomials))");
		// The unsupported "theorem" claim is not promoted anywhere in the document.
		expect(document).not.toContain(
			"Every quadratic polynomial with positive leading coefficient takes infinitely many prime values.",
		);
		expect(document).toContain("The strongest support so far is theorem-level and source-backed");
		expectProductDocument(document);
	});

	it("admits theorem entries backed by a passed theorem applicability check", () => {
		let state = createState();
		state = addTheoremApplicabilityCheck(state, {
			theorem: "Dirichlet's theorem on arithmetic progressions",
			targetObject: "primes congruent to 1 mod 4",
			status: "applies",
			hypotheses: [{ hypothesis: "gcd of first term and modulus is 1", status: "satisfied" }],
			now: NOW,
			actor: "workstream",
		});
		state = withEvidence(
			state,
			"Dirichlet's theorem on arithmetic progressions gives infinitely many primes congruent to 1 mod 4.",
			"theorem",
		);

		const document = buildStateOfProblemDocument(state);
		expect(document).toContain(
			"Dirichlet's theorem on arithmetic progressions gives infinitely many primes congruent to 1 mod 4. (theorem check passed: Dirichlet's theorem on arithmetic progressions)",
		);
		expectProductDocument(document);
	});

	it("answers negatively when the root obligation is refuted, with the refutation basis", () => {
		let state = createEmptyProjectState({
			projectId: "proj-test",
			title: "Is n^2 + n + 41 prime for every non-negative integer n?",
			rootQuestion: "Is n^2 + n + 41 prime for every non-negative integer n?",
			now: NOW,
		});
		state = addResearchObligation(state, {
			statement: state.rootQuestion,
			status: "refuted",
			statusReason: "n = 40 gives 40^2 + 40 + 41 = 41^2, which is composite.",
			now: NOW,
			actor: "system",
		});

		const document = buildStateOfProblemDocument(state);
		expect(describeRootQuestionVerdict(state)).toContain("answered negatively");
		expect(document).toContain("Verdict: answered negatively — the statement as written is refuted.");
		expect(document).toContain("n = 40 gives 40^2 + 40 + 41 = 41^2, which is composite.");
		expect(document).toContain("Refuted: Is n^2 + n + 41 prime for every non-negative integer n?");
		expectProductDocument(document);
	});

	it("answers positively only for an established root obligation", () => {
		let state = createEmptyProjectState({
			projectId: "proj-test",
			title: "Is the sum of two odd integers always even?",
			rootQuestion: "Is the sum of two odd integers always even?",
			now: NOW,
		});
		state = withEvidence(
			state,
			"The sum of two odd integers is even because (2a + 1) + (2b + 1) = 2(a + b + 1).",
			"theorem",
		);
		state = addResearchObligation(state, {
			statement: state.rootQuestion,
			evidenceEntryIds: ["evidence-board-1"],
			now: NOW,
			actor: "system",
		});
		// Establishment goes through the storage gate: support, no gaps, and a clean review.
		state = updateResearchObligation(state, {
			obligationId: "obligation-1",
			status: "established",
			reviewedCleanAt: NOW,
			now: NOW,
			actor: "system",
		});

		expect(describeRootQuestionVerdict(state)).toContain("Verdict: answered — the statement is established");

		// "Supported" is not "established": it must still read as open.
		let supported = createState();
		supported = addResearchObligation(supported, { statement: supported.rootQuestion, now: NOW, actor: "system" });
		supported = updateResearchObligation(supported, {
			obligationId: "obligation-1",
			status: "supported",
			now: NOW,
			actor: "system",
		});
		expect(describeRootQuestionVerdict(supported)).toContain("remains open");
	});

	it("reports confirmed and inconclusive independent checks from their durable claim text", () => {
		let state = createState();
		state = withEvidence(state, "Primes of the form n^2 + 1 persist through n = 50000.", "computation", {
			reportId: "research-report-1",
		});
		state = withEvidence(
			state,
			"An independent bounded check did not find a counterexample to the report claim in the searched range: the density of quadratic prime values stays positive in the sampled window.",
			"computation",
			{ reportId: "research-report-1" },
		);
		state = withEvidence(
			state,
			"Residue classes mod 10 of n^2 + 1 primes match the expected distribution.",
			"computation",
			{
				reportId: "research-report-2",
			},
		);
		state = withEvidence(
			state,
			"An independent bounded check was inconclusive for the report claim: Residue classes mod 10 of n^2 + 1 primes match the expected distribution.",
			"unsupported",
			{ reportId: "research-report-2" },
		);

		const document = buildStateOfProblemDocument(state);
		expect(document).toContain(
			"Primes of the form n^2 + 1 persist through n = 50000. — an independent bounded check found no counterexample in the searched range.",
		);
		expect(document).toContain(
			"Residue classes mod 10 of n^2 + 1 primes match the expected distribution. — an independent bounded check was attempted but was inconclusive.",
		);
		expectProductDocument(document);
	});

	it("reads a confirmed check off the computation entry it merged into", () => {
		let state = createState();
		state = addComputationalArtifact(state, {
			pathId: "path-1",
			kind: "script",
			status: "completed",
			title: "Independent counterexample check (script)",
			summary: "Search for a composite value of the checked form.",
			now: NOW,
			actor: "reviewer",
		});
		state = addResearchEvidenceBoardEntry(state, {
			claim: "Primes of the form n^2 + 1 persist through n = 50000.",
			classification: "computation",
			rationale: "Recorded for the state-of-problem test.",
			computationalArtifactIds: ["computation-artifact-1"],
			reportId: "research-report-1",
			now: NOW,
			actor: "workstream",
		});

		const document = buildStateOfProblemDocument(state);
		expect(document).toContain(
			"Primes of the form n^2 + 1 persist through n = 50000. — an independent bounded check found no counterexample in the searched range.",
		);
	});

	it("labels conjectures and heuristics and lists conflicting evidence", () => {
		let state = createState();
		state = withEvidence(
			state,
			"Hardy–Littlewood predicts about C * sqrt(x) / log(x) primes of the form n^2 + 1 up to x.",
			"heuristic",
		);
		state = withEvidence(state, "A weaker target: n^2 + 1 has infinitely many almost-prime values.", "conjecture");
		state = withEvidence(
			state,
			"The report claim conflicts with the recorded computation for n between 30 and 45.",
			"conflicting",
		);

		const document = buildStateOfProblemDocument(state);
		expect(document).toContain("- Heuristic: Hardy–Littlewood predicts about");
		expect(document).toContain("- Conjecture: A weaker target: n^2 + 1 has infinitely many almost-prime values.");
		expect(document).toContain(
			"- Conflicting evidence: The report claim conflicts with the recorded computation for n between 30 and 45.",
		);
		expectProductDocument(document);
	});

	it("keeps label-like unsupported fragments out of the gaps and includes substantive ones", () => {
		let state = createState();
		state = addResearchObligation(state, {
			statement: state.rootQuestion,
			gaps: ["No unconditional lower bound is known for the count of n^2 + 1 primes."],
			now: NOW,
			actor: "system",
		});
		state = withEvidence(state, "Computation output", "unsupported");
		state = withEvidence(
			state,
			"No source in the record proves infinitude for the one-variable quadratic form n^2 + 1.",
			"unsupported",
		);

		const document = buildStateOfProblemDocument(state);
		expect(document).toContain("- No unconditional lower bound is known for the count of n^2 + 1 primes.");
		expect(document).toContain(
			"- No source in the record proves infinitude for the one-variable quadratic form n^2 + 1.",
		);
		expect(document).not.toContain("- Computation output");
		expectProductDocument(document);
	});

	it("caps the open-gaps section and deduplicates repeated gaps", () => {
		let state = createState();
		state = addResearchObligation(state, {
			statement: state.rootQuestion,
			gaps: Array.from({ length: 10 }, (_, index) => `Open question number ${index + 1} about the quadratic form.`),
			now: NOW,
			actor: "system",
		});
		state = addResearchObligation(state, {
			statement: "A required subclaim about residue classes remains unproved.",
			parentObligationId: "obligation-1",
			gaps: ["Open question number 1 about the quadratic form."],
			now: NOW,
			actor: "system",
		});

		const document = buildStateOfProblemDocument(state);
		expect(document).toContain("Open question number 8 about the quadratic form.");
		expect(document).not.toContain("Open question number 9 about the quadratic form.");
		const duplicated = document.split("Open question number 1 about the quadratic form.").length - 1;
		expect(duplicated).toBe(1);
		expectProductDocument(document);
	});

	it("lists sources with their durable [source-N] labels and reliability caveats", () => {
		let state = createState();
		state = addLiteratureSourceArtifact(state, {
			kind: "paper",
			title: "A preprint on quadratic prime values",
			url: "https://arxiv.org/abs/2401.00001",
			summary: "Preprint discussing n^2 + 1.",
			now: NOW,
			actor: "system",
		});
		state = addLiteratureSourceArtifact(state, {
			kind: "paper",
			title: "A journal treatment of prime-representing polynomials",
			doi: "10.1000/quadratic-primes",
			summary: "Peer-reviewed treatment.",
			now: NOW,
			actor: "system",
		});
		state = withEvidence(state, "The survey confirms the problem is open as stated. [source-2]", "theorem", {
			sourceIds: ["source-2"],
		});

		const document = buildStateOfProblemDocument(state);
		expect(document).toContain(
			"- [source-1] A preprint on quadratic prime values — preprint; not peer-reviewed, treat with caution",
		);
		expect(document).toContain(
			"- [source-2] A journal treatment of prime-representing polynomials — peer-reviewed venue (DOI 10.1000/quadratic-primes)",
		);
		// The marker embedded in the claim stays as-is and resolves against the labeled source list.
		expect(document).toContain("The survey confirms the problem is open as stated. [source-2]");
		expectProductDocument(document);
	});

	it("is deterministic and offers a body without the title line for the working-paper section", () => {
		let state = createState();
		state = withEvidence(state, "All n up to 10^4 were checked for primality of n^2 + 1.", "computation");

		const document = buildStateOfProblemDocument(state);
		expect(buildStateOfProblemDocument(state)).toBe(document);
		const body = buildStateOfProblemSectionBody(state);
		expect(document).toBe([STATE_OF_PROBLEM_SECTION_TITLE, "", body].join("\n"));
		expect(body.startsWith("The question")).toBe(true);
	});

	it("stays truthful on a completely empty workspace", () => {
		const document = buildStateOfProblemDocument(createState());
		expect(document).toContain(
			"Verdict: the question remains open. No durable mathematical support has been recorded yet.",
		);
		expect(document).toContain("- No computational evidence has been recorded yet.");
		expect(document).toContain("- No conditional results or heuristics are on record.");
		expect(document).toContain("- Nothing on record has been refuted.");
		expect(document).toContain("- No open gaps have been recorded yet.");
		expect(document).toContain("- No literature sources have been consulted yet.");
		expectProductDocument(document);
	});
});
