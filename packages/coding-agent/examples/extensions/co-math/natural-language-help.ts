export const NATURAL_LANGUAGE_HELP_TEXT = `Natural co-math examples:
- /co start a project for <question or paper>
- /co set goal <research goal>
- /co create a workstream to <specific task>
- /co run latest workstream
- /co show latest report
- /co accept report <id>: <note>
- /co request revision for latest report: <note>
- /co export working paper
- /co what next

Advanced/debug interface: /comath help`;

export function formatUnknownNaturalLanguageRequest(suggestions: string[]): string {
	return [
		"I could not map that to a safe co-math action.",
		"",
		"Try one of:",
		...(suggestions.length > 0 ? suggestions : NATURAL_LANGUAGE_HELP_TEXT.split("\n").slice(1, -2)),
	].join("\n");
}

export function formatAmbiguousReviewAction(): string {
	return [
		"Please use an explicit review action, for example:",
		"/co accept latest report: useful source-backed extraction, but keep support gap open",
		"/co request revision for latest report: missing source-backed support lemma",
	].join("\n");
}
