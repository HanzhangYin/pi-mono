import type { ResearchPath } from "./schema.ts";

export interface ResearchRoundResult {
	pathId: string;
	pathTitle: string;
	findings: string[];
	uncertainties: string[];
	blockers: string[];
	suggestedNextMove: string;
	workingPaperSectionTitle: string;
	workingPaperSummary: string;
}

export interface RunResearchPathRoundInput {
	rootQuestion: string;
	path: ResearchPath;
	allPaths: readonly ResearchPath[];
	now: string;
}

export function runResearchPathRound(input: RunResearchPathRoundInput): ResearchRoundResult {
	const title = normalizeTitle(input.path.title);
	const rootQuestion = input.rootQuestion.trim();
	if (title === "small examples and counterexamples") {
		return buildSmallExamplesRound(input.path, rootQuestion);
	}
	if (title === "direct proof attempt") {
		return buildDirectProofRound(input.path, rootQuestion);
	}
	if (title === "reformulation") {
		return buildReformulationRound(input.path, rootQuestion);
	}
	if (title === "weaker special cases") {
		return buildWeakerSpecialCasesRound(input.path, rootQuestion);
	}
	if (title === "known theorem or literature reduction") {
		return buildKnownTheoremRound(input.path, rootQuestion);
	}
	return buildGenericRound(input.path, input.allPaths.length);
}

function buildSmallExamplesRound(path: ResearchPath, rootQuestion: string): ResearchRoundResult {
	if (isNSquaredPlusOneQuestion(rootQuestion)) {
		const findings = [
			...Array.from({ length: 11 }, (_value, n) => {
				const result = n * n + 1;
				return `n = ${n} gives ${result}, ${isPrime(result) ? "prime" : "not prime"}.`;
			}),
			"For odd n > 1, n^2 + 1 is an even number greater than 2, so it is composite.",
		];
		const uncertainties = [
			"These examples do not prove or disprove infinitude.",
			"After the parity reduction, the even-n case remains the central uncertainty.",
		];
		return createResult(path, {
			findings,
			uncertainties,
			blockers: [],
			suggestedNextMove: "Separate parity obstructions from the even-n case, then check more even examples.",
			workingPaperSectionTitle: "Examples and evidence",
		});
	}
	return createResult(path, {
		findings: [
			"Identify a small parameter range where examples can be checked without assuming the conclusion.",
			"Record whether each checked case supports the statement, violates it, or exposes an obstruction.",
			"No theorem-level conclusion has been established from examples alone.",
		],
		uncertainties: ["The problem needs a precise finite test range before examples can be interpreted."],
		blockers: [],
		suggestedNextMove: "Choose the smallest meaningful parameters and record the first cases explicitly.",
		workingPaperSectionTitle: "Examples and evidence",
	});
}

function buildDirectProofRound(path: ResearchPath, rootQuestion: string): ResearchRoundResult {
	const findings = isNSquaredPlusOneQuestion(rootQuestion)
		? [
				"A Euclid-style argument is not immediate because multiplying known primes does not preserve the form n^2 + 1.",
				"Parity eliminates odd n > 1, but it does not settle whether infinitely many even n give primes.",
				"The remaining question resembles hard prime-values-of-polynomials problems.",
			]
		: [
				"A direct proof should first identify which definitions and closure properties are actually available.",
				"No direct implication from the current statement to the desired conclusion has been justified yet.",
				"A useful proof attempt should isolate one lemma that would make the main claim follow.",
			];
	return createResult(path, {
		findings,
		uncertainties: [
			"No complete proof strategy has been established.",
			"Any proof attempt still needs a precise lemma that can be checked independently.",
		],
		blockers: [],
		suggestedNextMove:
			"Try to prove a weaker statement or gather stronger computational evidence before attempting the full claim.",
		workingPaperSectionTitle: "Direct proof attempts",
	});
}

function buildReformulationRound(path: ResearchPath, rootQuestion: string): ResearchRoundResult {
	const nSquaredPlusOne = isNSquaredPlusOneQuestion(rootQuestion);
	const findings = nSquaredPlusOne
		? buildNSquaredPlusOneReformulationFindings(rootQuestion)
		: [
				"Restate the question in terms of simpler equivalent subclaims before attempting the full problem.",
				"Separate definitional reformulations from conjectural analogies.",
				"Use reformulations as search targets unless a source verifies an equivalence.",
			];
	return createResult(path, {
		findings,
		uncertainties: nSquaredPlusOne
			? buildNSquaredPlusOneReformulationUncertainties()
			: [
					"The reformulations are guideposts; they do not by themselves prove the original statement.",
					"Any equivalence to a known theorem needs source-backed verification.",
				],
		blockers: [],
		suggestedNextMove: nSquaredPlusOne
			? "Turn these reformulations into smaller lemmas and weaker targets."
			: "Compare the reformulated statement with weaker special cases that can be proved directly.",
		workingPaperSectionTitle: "Reformulations",
	});
}

function buildWeakerSpecialCasesRound(path: ResearchPath, rootQuestion: string): ResearchRoundResult {
	const nSquaredPlusOne = isNSquaredPlusOneQuestion(rootQuestion);
	const findings = nSquaredPlusOne
		? buildNSquaredPlusOneWeakerCaseFindings()
		: [
				"Choose a special case that removes one source of complexity from the main statement.",
				"Look for a finite verification task that can produce reliable evidence without proving the full claim.",
				"State weaker claims separately so they are not mistaken for the original theorem.",
			];
	return createResult(path, {
		findings,
		uncertainties: nSquaredPlusOne
			? buildNSquaredPlusOneWeakerCaseUncertainties()
			: [
					"These weaker statements do not settle the full question.",
					"The bridge from finite evidence or special cases to the full claim remains open.",
				],
		blockers: [],
		suggestedNextMove: nSquaredPlusOne
			? "Use the parity lemma and even reduction to guide a proof attempt."
			: "Prove the parity lemma cleanly in the working paper, then test even n in a larger finite range.",
		workingPaperSectionTitle: "Weaker statements",
	});
}

function buildKnownTheoremRound(path: ResearchPath, rootQuestion: string): ResearchRoundResult {
	const findings = isNSquaredPlusOneQuestion(rootQuestion)
		? [
				"This resembles questions about prime values of irreducible polynomials.",
				"Search targets include Bunyakovsky-type expectations, Schinzel's hypothesis H, Landau-style problem lists, and primes of the form n^2 + 1.",
				"The current project has not registered a source proving the infinitude claim.",
			]
		: [
				"Identify theorem names, standard conjectures, and survey terms that could help locate source-backed context.",
				"Separate search targets from verified citations.",
				"The current project has not registered a source that settles this path.",
			];
	return createResult(path, {
		findings,
		uncertainties: [
			"Without a registered source, literature status should be treated as a search target rather than a fact.",
			"Do not rely on theorem names until a source confirms the exact statement needed.",
		],
		blockers: ["A source-backed literature check is still needed before citing this path as established context."],
		suggestedNextMove:
			"Register a reliable source or search notes, then verify the exact status of the relevant theorem targets.",
		workingPaperSectionTitle: "Literature/theorem targets",
	});
}

function buildGenericRound(path: ResearchPath, pathCount: number): ResearchRoundResult {
	return createResult(path, {
		findings: [
			"I clarified what this path should inspect next.",
			"No theorem-level conclusion has been established yet.",
			`This path should be compared against the other ${pathCount} active research paths before prioritizing it further.`,
		],
		uncertainties: ["This path still needs source-backed definitions, examples, or a precise subclaim."],
		blockers: [],
		suggestedNextMove: path.suggestedNextMove || "Define the next concrete subclaim or example check for this path.",
		workingPaperSectionTitle: "Research notes",
	});
}

function createResult(
	path: ResearchPath,
	input: Omit<ResearchRoundResult, "pathId" | "pathTitle" | "workingPaperSummary">,
): ResearchRoundResult {
	return {
		pathId: path.id,
		pathTitle: path.title,
		...input,
		workingPaperSummary: formatWorkingPaperSummary(path.title, input),
	};
}

function formatWorkingPaperSummary(
	pathTitle: string,
	input: Pick<ResearchRoundResult, "findings" | "uncertainties" | "blockers" | "suggestedNextMove">,
): string {
	return [
		`Research round: ${pathTitle}`,
		"",
		"Findings:",
		...input.findings.map((finding) => `- ${finding}`),
		"",
		"Uncertainty:",
		...input.uncertainties.map((uncertainty) => `- ${uncertainty}`),
		...(input.blockers.length > 0 ? ["", "Open blockers:", ...input.blockers.map((blocker) => `- ${blocker}`)] : []),
		"",
		`Next: ${input.suggestedNextMove}`,
	].join("\n");
}

function isNSquaredPlusOneQuestion(rootQuestion: string): boolean {
	return /\bn\s*(?:\^2|²)\s*\+\s*1\b/i.test(rootQuestion);
}

function buildNSquaredPlusOneReformulationFindings(rootQuestion: string): string[] {
	return [
		`Original question: ${rootQuestion}`,
		"Frame 1 - Polynomial prime values: ask whether f(n) = n^2 + 1 takes prime values infinitely often.",
		"Frame 2 - Even-index reduction: odd n > 1 never work; the unresolved part is whether 4m^2 + 1 is prime infinitely often.",
		"Frame 3 - Conjectural/literature frame: Bunyakovsky/Schinzel-type heuristics would predict infinitude, but this is not a proof and needs source-backed context.",
		"Practical consequence: stop spending computation on odd n > 1; focus examples and proof attempts on even n.",
	];
}

function buildNSquaredPlusOneReformulationUncertainties(): string[] {
	return [
		"The even-index reduction is useful, but it does not prove infinitely many prime values.",
		"Conjectural frames are search targets unless a source verifies the exact statement.",
	];
}

function buildNSquaredPlusOneWeakerCaseFindings(): string[] {
	return [
		"Lemma 1 - Parity obstruction: if n > 1 is odd, then n^2 + 1 is composite. Status: proved.",
		"Lemma 2 - Even reduction: the open part is whether 4m^2 + 1 is prime infinitely often. Status: equivalent target after excluding odd n > 1; not a proof.",
		"Target 3 - Finite evidence: among checked n, record prime values of n^2 + 1. Status: computational evidence only.",
		"Target 4 - Small-prime obstructions: for small primes p, identify residue classes where n^2 + 1 is divisible by p. Status: good next computation/proof target.",
	];
}

function buildNSquaredPlusOneWeakerCaseUncertainties(): string[] {
	return [
		"The parity lemma is a real theorem but much weaker than the original claim.",
		"Finite evidence and small-prime obstruction checks do not prove infinitude.",
	];
}

function normalizeTitle(title: string): string {
	return title.trim().replace(/\s+/g, " ").toLowerCase();
}

function isPrime(value: number): boolean {
	if (value < 2) {
		return false;
	}
	for (let divisor = 2; divisor * divisor <= value; divisor += 1) {
		if (value % divisor === 0) {
			return false;
		}
	}
	return true;
}
