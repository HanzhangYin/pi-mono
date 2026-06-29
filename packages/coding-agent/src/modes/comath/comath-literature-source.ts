import type { LiteratureSourceArtifact, LiteratureSourceKind } from "./schema.ts";

export interface LiteratureSourceQuery {
	rootQuestion: string;
	pathTitle: string;
	pathObjective: string;
	maxSources: number;
}

export interface LiteratureSourceResult {
	title: string;
	url?: string;
	path?: string;
	kind?: LiteratureSourceKind;
	summary: string;
	extractedText?: string;
	authors?: string[];
	year?: string;
}

export interface LiteratureSourceLookup {
	search(query: LiteratureSourceQuery): Promise<LiteratureSourceResult[]>;
}

class NullLiteratureSourceLookup implements LiteratureSourceLookup {
	async search(): Promise<LiteratureSourceResult[]> {
		return [];
	}
}

export function createDefaultLiteratureSourceLookup(): LiteratureSourceLookup {
	return new NullLiteratureSourceLookup();
}

export function createWorkspaceLiteratureSourceLookup(input: {
	sources: readonly LiteratureSourceArtifact[];
	fallback: LiteratureSourceLookup;
}): LiteratureSourceLookup {
	return {
		search: async (query) => {
			const registered = input.sources.map(literatureSourceArtifactToResult);
			const fallbackSources = await input.fallback.search(query);
			return uniqueLiteratureSources([...registered, ...fallbackSources]).slice(0, query.maxSources);
		},
	};
}

export function formatLiteratureSourceForPrompt(source: LiteratureSourceResult, index: number): string {
	const sourceId = `source-${index + 1}`;
	return [
		`[${sourceId}] ${source.title}`,
		...(source.authors && source.authors.length > 0 ? [`Authors: ${source.authors.join(", ")}`] : []),
		...(source.year ? [`Year: ${source.year}`] : []),
		...(source.url ? [`URL: ${source.url}`] : []),
		...(source.path ? [`Path: ${source.path}`] : []),
		`Summary: ${source.summary}`,
		...(source.extractedText ? [`Extract: ${source.extractedText}`] : []),
	].join("\n");
}

function literatureSourceArtifactToResult(source: LiteratureSourceArtifact): LiteratureSourceResult {
	return {
		title: source.title,
		kind: source.kind,
		...(source.url ? { url: source.url } : {}),
		...(source.path ? { path: source.path } : {}),
		summary: source.summary,
		...(source.extractedText ? { extractedText: source.extractedText } : {}),
		authors: source.authors,
		...(source.year ? { year: source.year } : {}),
	};
}

function uniqueLiteratureSources(sources: readonly LiteratureSourceResult[]): LiteratureSourceResult[] {
	const seen = new Set<string>();
	return sources.filter((source) => {
		const key = source.url ?? source.path ?? source.title.trim().toLowerCase();
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}
