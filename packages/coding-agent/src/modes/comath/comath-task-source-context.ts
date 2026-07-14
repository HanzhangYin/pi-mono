import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { LiteratureSourceSearchResponse } from "./comath-literature-source.ts";
import {
	buildCoMathCitableSourceContexts,
	type CoMathCitableSourceContext,
	loadCoMathSourceContext,
} from "./comath-source-context.ts";
import { type CoMathSourceLineRange, loadCoMathSourceIndex, resolveIndexedSourceLines } from "./comath-source-index.ts";
import { loadCoMathSourceSnapshot } from "./comath-source-snapshot.ts";
import type { CoMathPreparedArtifact } from "./comath-state-store.ts";
import type { PriorTaskAttemptFailure } from "./comath-task-state.ts";
import type { CoMathProjectState, LiteratureSourceArtifact, ResearchPlanTaskRecord } from "./schema.ts";

export interface ResearchRunSourceCatalog {
	runId: string;
	sourceIds: string[];
	inventorySourceIds: string[];
	requested: Array<{ sourceId: string; ranges: CoMathSourceLineRange[] }>;
	priorAttemptFailures: Array<{
		attemptId: string;
		attemptNumber: number;
		stage: string;
		code: string;
		message: string;
		claimIds: string[];
	}>;
	priorReviewerFeedback: string[];
	externalLiteratureSearch?: LiteratureSourceSearchResponse;
	delivered: Array<{
		sourceId: string;
		sourceRelativePath: string;
		sourceFileSha256: string;
		ranges: CoMathSourceLineRange[];
		context: string;
	}>;
	createdAt: string;
}

export interface PreparedTaskSourceContext {
	catalog: ResearchRunSourceCatalog;
	contexts: Map<string, CoMathCitableSourceContext>;
	preparedArtifact: CoMathPreparedArtifact;
}

/** Resolve one bounded specialist inspection against the same immutable index used for preparation. */
export async function inspectTaskSourceLines(
	state: CoMathProjectState,
	sourceId: string,
	range: CoMathSourceLineRange,
): Promise<string> {
	if (
		!Number.isSafeInteger(range.start) ||
		!Number.isSafeInteger(range.end) ||
		range.start < 1 ||
		range.end < range.start
	) {
		throw new Error("Source inspection requires a positive ordered line range.");
	}
	if (range.end - range.start + 1 > 200) throw new Error("Source inspection is limited to 200 lines per action.");
	const source = state.literatureSources.find(
		(candidate) =>
			candidate.id === sourceId &&
			candidate.citationEligibility === "citable" &&
			candidate.sourceIndexId &&
			candidate.sourceRelativePath &&
			candidate.sourceFileSha256,
	);
	if (!source?.sourceIndexId || !source.sourceRelativePath || !source.sourceFileSha256) {
		throw new Error(`Source ${sourceId} is not a citable indexed file.`);
	}
	const record = state.sourceIndexes.find(
		(candidate) => candidate.id === source.sourceIndexId && candidate.status === "ready",
	);
	if (!record) throw new Error(`Source index ${source.sourceIndexId} is not ready.`);
	const index = await loadCoMathSourceIndex(record.indexPath, record.indexSha256);
	const resolved = await resolveIndexedSourceLines(index, source.sourceRelativePath, range);
	if (resolved.fileSha256 !== source.sourceFileSha256) {
		throw new Error(`Source ${sourceId} digest does not match its active index.`);
	}
	const numbered = resolved.excerpt
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n")
		.replace(/\n$/, "")
		.split("\n")
		.map((line, offset) => `${range.start + offset}: ${line}`)
		.join("\n");
	return [
		`SOURCE ${sourceId}`,
		`FILE ${source.sourceRelativePath}`,
		`REVISION ${record.sourceRevisionId}`,
		`SHA256 ${source.sourceFileSha256}`,
		`LINES ${range.start}-${range.end}`,
		`REGION ${resolved.regionKind}`,
		`EXCERPT-SHA256 ${resolved.excerptSha256}`,
		numbered,
	].join("\n");
}

/** Build source context directly from immutable snapshot/index artifacts, never state excerpts. */
export async function prepareTaskSourceContext(
	state: CoMathProjectState,
	task: ResearchPlanTaskRecord,
	attemptId: string,
	now: string,
	artifactRoot: string,
	priorAttemptFailures: readonly PriorTaskAttemptFailure[] = [],
	priorReviewerFeedback: readonly string[] = [],
	externalLiteratureSearch?: LiteratureSourceSearchResponse,
): Promise<PreparedTaskSourceContext> {
	const indexedSources = state.literatureSources.filter(
		(source) => source.citationEligibility === "citable" && source.sourceIndexId,
	);
	const inventorySources = state.literatureSources.filter((source) => source.citationEligibility === "inventory-only");
	const contexts = new Map<string, CoMathCitableSourceContext>();
	const mandatoryByPath = mandatoryRangesForTask(task, indexedSources);
	const delivered: ResearchRunSourceCatalog["delivered"] = [];
	for (const record of state.sourceIndexes.filter((candidate) => candidate.status === "ready")) {
		const index = await loadCoMathSourceIndex(record.indexPath, record.indexSha256);
		const snapshot = await loadCoMathSourceSnapshot(path.join(index.snapshotRoot, "manifest.json"));
		const sources = indexedSources.filter((source) => source.sourceIndexId === record.id);
		const materials = await loadCoMathSourceContext(snapshot, index, {
			queryTerms: searchTerms([
				...priorReviewerFeedback,
				...task.acceptanceCriteria,
				task.goal ?? "",
				task.description,
				task.title,
			]),
			mandatoryRangesByPath: mandatoryByPath,
		});
		for (const [sourceId, context] of buildCoMathCitableSourceContexts(snapshot, index, materials, sources)) {
			contexts.set(sourceId, context);
			const source = sources.find((candidate) => candidate.id === sourceId);
			const material = source?.sourceRelativePath
				? materials.find((candidate) => candidate.relativePath === source.sourceRelativePath)
				: undefined;
			if (source?.sourceRelativePath && source.sourceFileSha256 && material) {
				delivered.push({
					sourceId,
					sourceRelativePath: source.sourceRelativePath,
					sourceFileSha256: source.sourceFileSha256,
					ranges: material.spans.map((span) => ({ ...span.lines })),
					context: context.context,
				});
			}
		}
	}
	for (const request of task.sourceRequests ?? []) {
		const source = indexedSources.find((candidate) => candidate.id === request.sourceId);
		if (!source?.sourceRelativePath)
			throw new Error(`Required source ${request.sourceId} is not a citable indexed file.`);
		const sourceDelivery = delivered.find((candidate) => candidate.sourceId === request.sourceId);
		for (const range of request.ranges) {
			if (
				!sourceDelivery?.ranges.some((candidate) => candidate.start <= range.start && candidate.end >= range.end)
			) {
				throw new Error(
					`Required source span ${request.sourceId} ${source.sourceRelativePath}:${range.start}-${range.end} was not delivered.`,
				);
			}
		}
	}
	const sourceIds = indexedSources
		.filter((source) => contexts.has(source.id))
		.sort(compareCitableSources)
		.map((source) => source.id);
	const catalog: ResearchRunSourceCatalog = {
		runId: attemptId,
		sourceIds,
		inventorySourceIds: inventorySources.map((source) => source.id),
		requested: (task.sourceRequests ?? []).map((request) => ({
			sourceId: request.sourceId,
			ranges: request.ranges.map((range) => ({ ...range })),
		})),
		priorAttemptFailures: priorAttemptFailures.map((prior) => ({
			attemptId: prior.attemptId,
			attemptNumber: prior.attemptNumber,
			stage: prior.failure.stage,
			code: prior.failure.code,
			message: prior.failure.message,
			claimIds: [...prior.failure.claimIds],
		})),
		priorReviewerFeedback: priorReviewerFeedback.map((feedback) => feedback.slice(0, 4_000)),
		...(externalLiteratureSearch ? { externalLiteratureSearch } : {}),
		delivered,
		createdAt: now,
	};
	if (externalLiteratureSearch) {
		contexts.set("external-literature-search", {
			sourceId: "external-literature-search",
			context: formatExternalLiteratureSearch(externalLiteratureSearch),
		});
	}
	const serialized = `${JSON.stringify(catalog, null, "\t")}\n`;
	const sha256 = createHash("sha256").update(serialized).digest("hex");
	const stagingPath = path.join(artifactRoot, ".staging", `source-catalog-${sha256}`);
	const finalPath = path.join(artifactRoot, "source-catalogs", sha256);
	await mkdir(stagingPath, { recursive: true });
	await writeFile(path.join(stagingPath, "catalog.json"), serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
	return {
		catalog,
		contexts,
		preparedArtifact: {
			id: sha256,
			stagingPath,
			finalPath,
			contentPath: "catalog.json",
			sha256,
		},
	};
}

export function formatExternalLiteratureSearch(search: LiteratureSourceSearchResponse): string {
	return [
		"EXTERNAL LITERATURE SEARCH",
		"This is provider metadata and abstract-level candidate material, not indexed primary theorem text.",
		`QUERIES ${search.queries.join(" | ") || "(none)"}`,
		...search.providers.map(
			(provider) =>
				`PROVIDER ${provider.provider} | ${provider.status} | candidates=${provider.candidateCount}${provider.error ? ` | error=${provider.error}` : ""}`,
		),
		...search.sources.map((source, index) =>
			[
				`CANDIDATE literature-candidate-${index + 1}`,
				`TITLE ${source.title}`,
				...(source.authors?.length ? [`AUTHORS ${source.authors.join(", ")}`] : []),
				...(source.year ? [`YEAR ${source.year}`] : []),
				...(source.doi ? [`DOI ${source.doi}`] : []),
				...(source.externalId ? [`EXTERNAL-ID ${source.externalId}`] : []),
				...(source.url ? [`URL ${source.url}`] : []),
				`SUMMARY ${source.summary}`,
			].join("\n"),
		),
		"Do not claim that a candidate theorem applies unless exact retrieved theorem text and its hypotheses are supplied. Record metadata-only leads as inconclusive.",
	].join("\n\n");
}

function mandatoryRangesForTask(
	task: ResearchPlanTaskRecord,
	sources: readonly LiteratureSourceArtifact[],
): Map<string, CoMathSourceLineRange[]> {
	const ranges = new Map<string, CoMathSourceLineRange[]>();
	for (const request of task.sourceRequests ?? []) {
		const source = sources.find((candidate) => candidate.id === request.sourceId);
		if (!source?.sourceRelativePath) continue;
		ranges.set(source.sourceRelativePath, [
			...(ranges.get(source.sourceRelativePath) ?? []),
			...request.ranges.map((range) => ({ ...range })),
		]);
	}
	return ranges;
}

function searchTerms(values: readonly string[]): string[] {
	const ignored = new Set([
		"acceptance",
		"criteria",
		"done",
		"every",
		"exact",
		"explicitly",
		"rather",
		"source-backed",
		"stated",
		"task",
		"when",
	]);
	const combined = values.join(" ");
	const compoundIdentifiers = [...combined.matchAll(/[\p{L}\p{N}]+_\{[^}\n]{1,80}\}/gu)].map((match) =>
		match[0].toLowerCase(),
	);
	const broadPrefixes = new Set(compoundIdentifiers.map((identifier) => identifier.slice(0, identifier.indexOf("{"))));
	const tokens = combined
		.split(/[^\p{L}\p{N}_-]+/u)
		.map((term) => term.toLowerCase())
		.filter(
			(term) =>
				(term.length >= 4 || /[_\d]/.test(term)) &&
				!/^source-\d+$/.test(term) &&
				!ignored.has(term) &&
				!broadPrefixes.has(term),
		);
	const seen = new Set<string>();
	return [...compoundIdentifiers, ...tokens]
		.filter((term) => {
			if (seen.has(term)) return false;
			seen.add(term);
			return true;
		})
		.slice(0, 64);
}

function compareCitableSources(left: LiteratureSourceArtifact, right: LiteratureSourceArtifact): number {
	return sourceRank(left) - sourceRank(right) || left.id.localeCompare(right.id);
}

function sourceRank(source: LiteratureSourceArtifact): number {
	if (source.workspaceRole === "primary-text") return 0;
	if (source.workspaceRole === "curated-summary") return 2;
	if (source.workspaceRole === "bibliographic-metadata") return 4;
	return 3;
}
