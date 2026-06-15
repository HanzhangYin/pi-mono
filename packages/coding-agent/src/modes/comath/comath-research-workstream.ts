import type {
	ResearchPath,
	ResearchWorkstreamReportStatus,
	ResearchWorkstreamStepRecord,
} from "../../../examples/extensions/co-math/schema.ts";
import { type ResearchRoundResult, runResearchPathRound } from "./comath-research-execution.ts";

export type ResearchWorkstreamStep = ResearchWorkstreamStepRecord;

export interface ResearchWorkstreamReport {
	pathId: string;
	pathTitle: string;
	startedAt: string;
	completedAt: string;
	status: ResearchWorkstreamReportStatus;
	coordinatorBrief: string;
	steps: ResearchWorkstreamStep[];
	promisingStrategy: string[];
	findings: string[];
	criticisms: string[];
	gaps: string[];
	humanHelpUseful: string[];
	suggestedNextMove: string;
	workingPaperSectionTitle: string;
	workingPaperSummary: string;
	sourceIds?: string[];
	claimSupportIds?: string[];
	computationalArtifactIds?: string[];
}

export interface RunResearchWorkstreamInput {
	rootQuestion: string;
	path: ResearchPath;
	allPaths: readonly ResearchPath[];
	now: string;
}

interface CriticReview {
	criticisms: string[];
	gaps: string[];
}

interface Synthesis {
	promisingStrategy: string[];
	humanHelpUseful: string[];
	suggestedNextMove: string;
}

/**
 * Run a deterministic, coordinator-managed research workstream for a single research path.
 *
 * The specialist attempt reuses the existing deterministic path execution (`runResearchPathRound`)
 * so we do not duplicate the per-path mathematics; the coordinator, critic, and synthesizer add the
 * role structure, review, and curated synthesis described in the co-mathematician architecture.
 */
export function runResearchWorkstream(input: RunResearchWorkstreamInput): ResearchWorkstreamReport {
	const rootQuestion = input.rootQuestion.trim();
	const round = runResearchPathRound(input);
	const coordinatorBrief = buildCoordinatorBrief(input.path);
	const critic = buildCriticReview(rootQuestion, input.path, round);
	const synthesis = buildSynthesis(rootQuestion, input.path, round);

	const steps: ResearchWorkstreamStep[] = [
		{
			role: "coordinator",
			title: "Coordinator brief",
			summary: "Framing the objective and what would count as progress.",
			details: [coordinatorBrief],
		},
		{
			role: "specialist",
			title: "Specialist attempt",
			summary: "Trying the path-specific research move and recording what it does and does not establish.",
			details: round.findings,
		},
		{
			role: "critic",
			title: "Critic review",
			summary:
				"Reviewing the attempt for gaps, overclaims, and missing source checks before updating the working paper.",
			details: [...critic.criticisms, ...critic.gaps.map((gap) => `Gap: ${gap}`)],
		},
		{
			role: "synthesizer",
			title: "Synthesis",
			summary: "Deciding what enters the working paper and what stays an open gap.",
			details: [
				...(synthesis.promisingStrategy.length > 0 ? ["Promising strategy:", ...synthesis.promisingStrategy] : []),
				...(synthesis.humanHelpUseful.length > 0 ? ["Human help useful:", ...synthesis.humanHelpUseful] : []),
				`Next: ${synthesis.suggestedNextMove}`,
			],
		},
	];

	return {
		pathId: round.pathId,
		pathTitle: round.pathTitle,
		startedAt: input.now,
		completedAt: input.now,
		status: "completed",
		coordinatorBrief,
		steps,
		promisingStrategy: synthesis.promisingStrategy,
		findings: round.findings,
		criticisms: critic.criticisms,
		gaps: critic.gaps,
		humanHelpUseful: synthesis.humanHelpUseful,
		suggestedNextMove: synthesis.suggestedNextMove,
		workingPaperSectionTitle: round.workingPaperSectionTitle,
		workingPaperSummary: buildWorkingPaperSummary(round, critic, synthesis),
	};
}

export function buildCoordinatorBrief(path: ResearchPath): string {
	const title = normalizeTitle(path.title);
	if (title === "direct proof attempt") {
		return "The direct proof path should test whether the conjecture reduces to a reusable infinitude mechanism, not merely produce more examples.";
	}
	if (title === "small examples and counterexamples") {
		return "The examples path should gather evidence and expose obstructions without mistaking examples for a proof.";
	}
	if (title === "reformulation") {
		return "The reformulation path should restate the question in terms of better-understood structures while flagging analogies that are not yet proved.";
	}
	if (title === "weaker special cases") {
		return "The weaker-cases path should isolate statements that can be settled now and keep them separate from the full problem.";
	}
	if (title === "known theorem or literature reduction") {
		return "The literature path should locate source-backed context and avoid citing theorems the project has not verified.";
	}
	return `This path aims to: ${path.objective.trim() || path.title}. Decide what would count as real progress before spending more effort.`;
}

function buildCriticReview(rootQuestion: string, path: ResearchPath, round: ResearchRoundResult): CriticReview {
	const title = normalizeTitle(path.title);
	const nSquaredPlusOne = isNSquaredPlusOneQuestion(rootQuestion);
	if (title === "direct proof attempt") {
		return nSquaredPlusOne
			? {
					criticisms: [
						"A Euclid-style construction does not immediately preserve the form n^2 + 1.",
						"The attempt gives evidence and reductions, not a proof of infinitude.",
					],
					gaps: ["No complete mechanism has been established for infinitely many even n with n^2 + 1 prime."],
				}
			: {
					criticisms: [
						"The attempt has not justified a direct implication from the current statement to the full conclusion.",
						"Any cited step still needs an independently checkable lemma.",
					],
					gaps: round.uncertainties,
				};
	}
	if (title === "small examples and counterexamples") {
		return nSquaredPlusOne
			? {
					criticisms: [
						"Listing prime values does not establish that infinitely many primes of the form n^2 + 1 exist.",
						"Parity removes odd n > 1 but says nothing about the infinitude of the even case.",
					],
					gaps: ["The examples do not prove or disprove infinitude of primes of the form n^2 + 1."],
				}
			: {
					criticisms: ["Examples can support or obstruct a statement but cannot prove it on their own."],
					gaps: round.uncertainties,
				};
	}
	if (title === "reformulation") {
		return {
			criticisms: nSquaredPlusOne
				? [
						"Mapping to prime values of f(n) = n^2 + 1 is a search target, not a proved equivalence.",
						"A reformulation is only a guidepost until an equivalence is proved or sourced.",
					]
				: [
						"A reformulation is only a guidepost until an equivalence is proved or sourced.",
						"Conjectural analogies must be separated from definitional restatements.",
					],
			gaps: ["No proved equivalence yet links the reformulation to the original statement."],
		};
	}
	if (title === "weaker special cases") {
		return {
			criticisms: nSquaredPlusOne
				? [
						"The proved parity lemma must not be presented as the full theorem.",
						"Finite evidence for even n does not bridge to infinitely many.",
					]
				: [
						"A proved special case must not be presented as the full theorem.",
						"Finite checks do not by themselves bridge to the full claim.",
					],
			gaps: ["The bridge from special cases and finite evidence to the full claim is still open."],
		};
	}
	if (title === "known theorem or literature reduction") {
		return {
			criticisms: nSquaredPlusOne
				? [
						"Names like Bunyakovsky or Schinzel's hypothesis H are search targets, not verified citations.",
						"No registered source currently settles the infinitude claim.",
					]
				: [
						"Search terms are not the same as verified citations.",
						"No registered source currently settles this path.",
					],
			gaps: ["A source-backed literature check is still needed before treating any cited theorem as established."],
		};
	}
	return {
		criticisms: ["The attempt has not yet produced a theorem-level conclusion."],
		gaps:
			round.uncertainties.length > 0 ? round.uncertainties : ["This path still needs a precise subclaim or source."],
	};
}

function buildSynthesis(rootQuestion: string, path: ResearchPath, round: ResearchRoundResult): Synthesis {
	const title = normalizeTitle(path.title);
	const nSquaredPlusOne = isNSquaredPlusOneQuestion(rootQuestion);
	if (title === "direct proof attempt") {
		return {
			promisingStrategy: nSquaredPlusOne
				? [
						"Reduce the problem to the even case n = 2m, giving values 4m^2 + 1.",
						"Look for a mechanism that produces infinitely many prime values of this quadratic.",
					]
				: ["Isolate one lemma that would make the main claim follow, and try to prove that lemma first."],
			humanHelpUseful: [],
			suggestedNextMove: nSquaredPlusOne
				? "Try a weaker theorem or a source-backed literature check before spending more time on the full direct proof."
				: round.suggestedNextMove,
		};
	}
	if (title === "small examples and counterexamples") {
		return {
			promisingStrategy: nSquaredPlusOne
				? [
						"Use the verified prime values as evidence while keeping the infinitude question open.",
						"Separate the proved parity obstruction from the unresolved even-n case.",
					]
				: ["Use the checked cases as evidence and record any obstruction they reveal."],
			humanHelpUseful: [],
			suggestedNextMove: round.suggestedNextMove,
		};
	}
	if (title === "reformulation") {
		return {
			promisingStrategy: nSquaredPlusOne
				? ["Treat the question as prime values of f(n) = n^2 + 1 and compare it with provable weaker cases."]
				: ["Restate the problem via simpler equivalent subclaims and test them separately."],
			humanHelpUseful: [],
			suggestedNextMove: round.suggestedNextMove,
		};
	}
	if (title === "weaker special cases") {
		return {
			promisingStrategy: nSquaredPlusOne
				? ["Prove the parity lemma cleanly, then test even n in a larger finite range for supporting evidence."]
				: ["Prove a weaker statement that removes one source of complexity, kept separate from the full claim."],
			humanHelpUseful: [],
			suggestedNextMove: round.suggestedNextMove,
		};
	}
	if (title === "known theorem or literature reduction") {
		return {
			promisingStrategy: [
				"Register a reliable source or search notes, then verify the exact status of the relevant theorem targets.",
			],
			humanHelpUseful: [
				"A mathematician or a reliable reference could confirm the exact status of the relevant theorem targets.",
			],
			suggestedNextMove: round.suggestedNextMove,
		};
	}
	return {
		promisingStrategy: round.findings.slice(0, 2),
		humanHelpUseful: [],
		suggestedNextMove: round.suggestedNextMove,
	};
}

function buildWorkingPaperSummary(round: ResearchRoundResult, critic: CriticReview, synthesis: Synthesis): string {
	return [
		`Research workstream: ${round.pathTitle}`,
		...(synthesis.promisingStrategy.length > 0
			? ["", "Promising strategy:", ...synthesis.promisingStrategy.map((item) => `- ${item}`)]
			: []),
		"",
		"Findings:",
		...round.findings.map((finding) => `- ${finding}`),
		...(critic.gaps.length > 0 ? ["", "Open gaps:", ...critic.gaps.map((gap) => `- ${gap}`)] : []),
		"",
		`Next: ${synthesis.suggestedNextMove}`,
	].join("\n");
}

function isNSquaredPlusOneQuestion(rootQuestion: string): boolean {
	return /\bn\s*(?:\^2|²)\s*\+\s*1\b/i.test(rootQuestion);
}

function normalizeTitle(title: string): string {
	return title.trim().replace(/\s+/g, " ").toLowerCase();
}
