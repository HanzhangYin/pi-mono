export interface CoMathResearchPathPlan {
	slug: string;
	title: string;
	objective: string;
	suggestedNextMove: string;
	priority: number;
}

export interface CoMathResearchAutoPlan {
	rootQuestion: string;
	paths: CoMathResearchPathPlan[];
	initialFocusSlug: string;
}

export function createCoMathResearchAutoPlan(problemText: string): CoMathResearchAutoPlan {
	const rootQuestion = normalizeProblem(problemText);
	const label = createProblemLabel(rootQuestion);
	const paths: CoMathResearchPathPlan[] = [
		{
			slug: "small-examples-counterexamples",
			title: "Small examples and counterexamples",
			objective: `List initial examples for ${label} and note which support or obstruct the conjecture.`,
			suggestedNextMove: "Compute or manually inspect small cases and look for modular obstructions.",
			priority: 1,
		},
		{
			slug: "direct-proof-attempt",
			title: "Direct proof attempt",
			objective: `Look for a direct proof strategy or obstruction for ${label}.`,
			suggestedNextMove: "Check whether simple Euclid-style, congruence, or density arguments apply or fail.",
			priority: 2,
		},
		{
			slug: "reformulation",
			title: "Reformulation",
			objective: `Reformulate ${label} in terms of better-known structures, conjectures, or equivalent statements.`,
			suggestedNextMove:
				"Relate the statement to known heuristics or equivalent formulations without claiming proof.",
			priority: 3,
		},
		{
			slug: "weaker-special-cases",
			title: "Weaker special cases",
			objective: `Identify tractable weaker statements, special cases, or finite checks related to ${label}.`,
			suggestedNextMove:
				"Choose a weaker theorem that could be tested or proved without resolving the full problem.",
			priority: 4,
		},
		{
			slug: "known-theorem-literature-reduction",
			title: "Known theorem or literature reduction",
			objective: `Identify whether known theorems settle, imply, or obstruct ${label}.`,
			suggestedNextMove: "Use available source context first; state uncertainty rather than inventing references.",
			priority: 5,
		},
	];
	return {
		rootQuestion,
		paths,
		initialFocusSlug: paths[0].slug,
	};
}

function normalizeProblem(problemText: string): string {
	return problemText.trim().replace(/\s+/g, " ");
}

function createProblemLabel(rootQuestion: string): string {
	const trimmed = rootQuestion.replace(/[.?!]+$/, "");
	const words = trimmed.split(/\s+/).filter((word) => word.length > 0);
	return words.slice(0, 12).join(" ") || "the problem";
}
