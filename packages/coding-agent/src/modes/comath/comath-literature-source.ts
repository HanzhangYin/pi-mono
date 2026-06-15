import type { LiteratureSourceKind } from "../../../examples/extensions/co-math/schema.ts";

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
