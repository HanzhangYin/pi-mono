export const NATURAL_LANGUAGE_HELP_TEXT = `Co-math conversation mode examples:
- Explore this problem: <open research question>
- Start a project for <question or paper>
- Set goal <research goal>
- Create a workstream to <specific task>
- Run the latest workstream
- Show the latest report
- Request revision for latest report: <note>
- What should I do next?

Debug interface: /comath help`;

export function formatUnknownNaturalLanguageRequest(_suggestions: string[]): string {
	return ["I could not map that to a safe co-math action.", "", ...NATURAL_LANGUAGE_HELP_TEXT.split("\n")].join("\n");
}

export function formatAmbiguousReviewAction(): string {
	return [
		"Please use an explicit review action, for example:",
		"Request revision for latest report: missing source-backed support lemma",
		"Accept latest report: useful source-backed extraction, but keep support gap open",
		"Block latest report: output contradicts the source indexing assumptions",
	].join("\n");
}
