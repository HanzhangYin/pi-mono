export interface CoMathAutoPlan {
	rootQuestion: string;
	sourceTitle: string | undefined;
	goals: string[];
	workstreams: Array<{
		slug: string;
		title: string;
		goal: string;
	}>;
	firstWorkstreamId: string;
}

const MAX_LABEL_WORDS = 10;

export function createCoMathAutoPlan(problemText: string, sourceTitle?: string): CoMathAutoPlan {
	const rootQuestion = normalizeProblem(problemText);
	const label = createProblemLabel(rootQuestion);
	const sourcePhrase = sourceTitle ? ` against ${sourceTitle}` : "";
	const firstSlug = createWorkstreamSlug(rootQuestion);
	const goals = [
		`Validate ${label}${sourcePhrase} using source-backed definitions and preserve proof gaps.`,
		`Extract exact definitions, notation, assumptions, and referenced identities needed for ${label}.`,
		`Audit proof dependencies and unsupported transitions for ${label}, especially support, indexing, boundary, and vanishing-step gaps.`,
	];
	const workstreams = [
		{
			slug: firstSlug,
			title: `Extract source-backed definitions for ${label}`,
			goal: `Extract source-backed definitions, notation, assumptions, and identities relevant to ${label}. Quote or cite source locations. Do not prove new claims.`,
		},
		{
			slug: `identify-${slugify(label)}-assumptions`,
			title: `Identify assumptions and references for ${label}`,
			goal: `Identify assumptions, external references, and proof dependencies used by ${label}. Preserve uncertainty when the source is ambiguous.`,
		},
		{
			slug: `audit-${slugify(label)}-support-gaps`,
			title: `Audit support and indexing gaps for ${label}`,
			goal: `Audit support, indexing, boundary, and vanishing-step gaps in the ${label} argument. Do not fill gaps without source-backed evidence.`,
		},
	];
	return {
		rootQuestion,
		sourceTitle,
		goals,
		workstreams,
		firstWorkstreamId: `workstream-${firstSlug}`,
	};
}

function normalizeProblem(problemText: string): string {
	return problemText.trim().replace(/\s+/g, " ");
}

function createProblemLabel(rootQuestion: string): string {
	const questionMatch = rootQuestion.match(/\bquestion\s+([A-Za-z0-9.-]+)/i);
	if (questionMatch) {
		return `Question ${questionMatch[1].replace(/[.?!,;:]+$/, "")}`;
	}

	const words = rootQuestion
		.replace(/[.?!]+$/, "")
		.split(/\s+/)
		.filter((word) => word.length > 0);
	return words.slice(0, MAX_LABEL_WORDS).join(" ") || "the problem";
}

function createWorkstreamSlug(rootQuestion: string): string {
	const questionMatch = rootQuestion.match(/\bquestion\s+([A-Za-z0-9.-]+)/i);
	if (questionMatch) {
		return `extract-question-${slugify(questionMatch[1])}-definitions`;
	}
	return `extract-${slugify(createProblemLabel(rootQuestion))}-definitions`;
}

export function slugify(value: string): string {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "problem";
}
