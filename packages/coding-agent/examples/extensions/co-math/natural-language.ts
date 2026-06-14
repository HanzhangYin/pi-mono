export type CoMathNaturalIntent =
	| { kind: "explore-problem"; problemText: string }
	| { kind: "init"; question: string }
	| { kind: "goal"; text: string }
	| { kind: "workstream"; slug: string; goal: string }
	| { kind: "run-workstream"; workstreamRef: "latest" | string }
	| { kind: "show-report"; reportRef: "latest" | string }
	| { kind: "show-run"; runRef: "latest" | string }
	| {
			kind: "review-report";
			reportRef: "latest" | string;
			decision: "accepted" | "revision-requested" | "blocked";
			note: string;
	  }
	| { kind: "margin-note"; targetRef: "latest-report" | string; category: string; note: string }
	| { kind: "export-paper"; path?: string; force: boolean }
	| { kind: "next" }
	| { kind: "help" }
	| { kind: "unknown"; reason: string; suggestions: string[] };

const DEFAULT_SUGGESTIONS = [
	"Explore this problem: <open research question>",
	"Start a project for <question or paper>",
	"Set goal <research goal>",
	"Create a workstream to <specific task>",
	"Run the latest workstream",
	"Show the latest report",
	"Accept latest report: useful source-backed extraction, but keep support gap open",
	"Request revision for latest report: missing source-backed support lemma",
	"Export working paper",
	"What should I do next?",
];

const EXPLICIT_REVIEW_SUGGESTIONS = [
	"Request revision for latest report: missing source-backed support lemma",
	"Accept latest report: useful source-backed extraction, but keep support gap open",
	"Block latest report: output contradicts the source indexing assumptions",
];

export function parseCoMathNaturalRequest(input: string): CoMathNaturalIntent {
	const request = normalizeRequest(input);
	if (request.length === 0) return unknownIntent("empty request", []);
	if (request === "help") return { kind: "help" };

	const exploration = parseExplorationRequest(request);
	if (exploration) {
		return exploration;
	}

	const init =
		/^(?:start a co-math project for|start a project for|start project for|initialize project for|initialize)\s+(.+)$/i.exec(
			request,
		);
	if (init?.[1]) return { kind: "init", question: normalizeRootQuestion(init[1]) };

	const goal = /^(?:set the goal to|set goal|add goal)\s+(.+)$/i.exec(request);
	if (goal?.[1]) return { kind: "goal", text: goal[1] };

	const workstream = /^create a workstream (?:to|for|that)\s+(.+)$/i.exec(request);
	if (workstream?.[1]) {
		return { kind: "workstream", slug: slugifyWorkstreamGoal(workstream[1]), goal: workstream[1] };
	}

	if (/^run (?:the )?latest workstream$/i.test(request)) return { kind: "run-workstream", workstreamRef: "latest" };
	const runWorkstream = /^run workstream\s+(.+)$/i.exec(request);
	if (runWorkstream?.[1]) return { kind: "run-workstream", workstreamRef: runWorkstream[1] };

	if (/^show (?:me )?(?:the )?latest report$/i.test(request)) return { kind: "show-report", reportRef: "latest" };
	const showReport = /^show report\s+(\S+)$/i.exec(request);
	if (showReport?.[1]) return { kind: "show-report", reportRef: showReport[1] };

	if (/^show (?:me )?(?:the )?latest run$/i.test(request)) return { kind: "show-run", runRef: "latest" };
	const showRun = /^show run\s+(\S+)$/i.exec(request);
	if (showRun?.[1]) return { kind: "show-run", runRef: showRun[1] };

	const acceptedReport = /^accept\s+(?:report\s+(\S+)|latest report):\s+(.+)$/i.exec(request);
	if (acceptedReport?.[2]) {
		return {
			kind: "review-report",
			reportRef: normalizeLatestReportRef(acceptedReport[1]),
			decision: "accepted",
			note: acceptedReport[2],
		};
	}

	const revisionReport = /^request revision(?: for\s+(?:report\s+(\S+)|(the )?latest report))?:\s+(.+)$/i.exec(
		request,
	);
	if (revisionReport?.[3]) {
		return {
			kind: "review-report",
			reportRef: normalizeLatestReportRef(revisionReport[1]),
			decision: "revision-requested",
			note: revisionReport[3],
		};
	}

	const blockedReport = /^block\s+(?:report\s+(\S+)|latest report):\s+(.+)$/i.exec(request);
	if (blockedReport?.[2]) {
		return {
			kind: "review-report",
			reportRef: normalizeLatestReportRef(blockedReport[1]),
			decision: "blocked",
			note: blockedReport[2],
		};
	}

	const note = /^add note to\s+(latest report|\S+):\s+(.+)$/i.exec(request);
	if (note?.[1] && note[2]) {
		return {
			kind: "margin-note",
			targetRef: note[1].toLowerCase() === "latest report" ? "latest-report" : note[1],
			category: "comment",
			note: note[2],
		};
	}

	const exportPaper = /^export working paper(?:\s+(.+))?$/i.exec(request);
	if (exportPaper) {
		const exportArgs = exportPaper[1]?.trim() ?? "";
		const force = exportArgs.endsWith("--force");
		const path = (force ? exportArgs.slice(0, -"--force".length).trim() : exportArgs).trim();
		return {
			kind: "export-paper",
			...(path.length > 0 ? { path } : {}),
			force,
		};
	}

	if (/^(?:what next|what should (?:we|i) do next\??|next)$/i.test(request)) return { kind: "next" };

	if (isVagueReviewRequest(request)) {
		return unknownIntent("ambiguous report review action", EXPLICIT_REVIEW_SUGGESTIONS);
	}

	return unknownIntent("unrecognized request", DEFAULT_SUGGESTIONS);
}

function parseExplorationRequest(
	request: string,
): Extract<CoMathNaturalIntent, { kind: "explore-problem" }> | undefined {
	const patterns = [
		/^(?:explore|research|investigate)\s+this\s+(?:problem|conjecture|question):\s+(.+)$/i,
		/^find\s+approaches\s+to\s+this\s+(?:problem|conjecture|question):\s+(.+)$/i,
		/^try\s+to\s+solve\s+this\s+(?:problem|conjecture|question):\s+(.+)$/i,
		/^(?:explore|research|investigate)\s+(.+)$/i,
	];
	for (const pattern of patterns) {
		const match = pattern.exec(request);
		const problemText = match?.[1]?.trim();
		if (problemText && !isIncompleteExplorationProblem(problemText)) {
			return { kind: "explore-problem", problemText };
		}
	}
	return undefined;
}

function isIncompleteExplorationProblem(problemText: string): boolean {
	return /^this\s+(?:problem|conjecture|question):?$/i.test(problemText.trim());
}

function normalizeRequest(input: string): string {
	return input.trim().replace(/\s+/g, " ");
}

function normalizeLatestReportRef(reportRef: string | undefined): "latest" | string {
	return reportRef ?? "latest";
}

function normalizeRootQuestion(question: string): string {
	return question.replace(/\.$/, "").trim();
}

function slugifyWorkstreamGoal(goal: string): string {
	return (
		goal
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 48) || "workstream"
	);
}

function isVagueReviewRequest(request: string): boolean {
	return /^(?:looks good|approve it|fine|approved|accept it)$/i.test(request);
}

function unknownIntent(reason: string, suggestions: string[]): CoMathNaturalIntent {
	return {
		kind: "unknown",
		reason,
		suggestions,
	};
}
