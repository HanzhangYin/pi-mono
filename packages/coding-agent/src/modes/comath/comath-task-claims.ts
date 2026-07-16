import { createHash } from "node:crypto";
import type { LiteratureSourceSearchResponse } from "./comath-literature-source.ts";
import { parseCoMathMarkdown } from "./comath-markdown.ts";
import {
	formatCanonicalCoMathSourceCitation,
	type ParsedCoMathSourceCitation,
	parseCoMathSourceCitationDetails,
} from "./comath-source-citations.ts";
import {
	loadCoMathSourceIndex,
	sourceClaimScopeForRegion,
	validateIndexedSourceLocator,
} from "./comath-source-index.ts";
import type {
	CoMathProjectState,
	CoMathSourceClaimScope,
	GroundingValidationFailure,
	LiteratureSourceArtifact,
} from "./schema.ts";

export type ResearchClaimClassification = "source-backed" | "computed" | "proved" | "conjectural" | "unsupported";
export type ValidatedResearchClaimStatus = "validated" | "unsupported" | "invalid";

export interface ValidatedGroundingRecord {
	sourceId: string;
	relation: "supports" | "refutes";
	locator:
		| { kind: "lines"; start: number; end: number }
		| {
				kind: "external-record";
				provider: string;
				doi?: string;
				externalId?: string;
				url?: string;
				lines?: { start: number; end: number };
				contentSha256?: string;
		  };
	sourceIndexId?: string;
	sourceRevisionId?: string;
	sourceRelativePath?: string;
	sourceFileSha256?: string;
	regionKind?: string;
	excerpt?: string;
	excerptSha256?: string;
	canonicalCitation: string;
}

export interface ValidatedResearchClaim {
	id: string;
	text: string;
	classification: ResearchClaimClassification;
	status: ValidatedResearchClaimStatus;
	sourceIds: string[];
	sourceScope?: CoMathSourceClaimScope;
	groundings: ValidatedGroundingRecord[];
	validationFailures: GroundingValidationFailure[];
}

export interface ValidatedClaimLedgerArtifact {
	version: 1;
	attemptId: string;
	taskId: string;
	claims: ValidatedResearchClaim[];
	sha256: string;
}

interface ParsedClaim {
	id: string;
	text: string;
	classification: ResearchClaimClassification | undefined;
	citations: ParsedCoMathSourceCitation[];
	externalCitations: ParsedExternalCitation[];
	failures: GroundingValidationFailure[];
}

interface ParsedExternalCitation {
	kind: "doi" | "arxiv" | "url";
	value: string;
	lines?: { start: number; end: number };
	canonicalCitation: string;
}

/** Parse the strict, single-source-of-truth `## Claims` contract. */
export function parseTaskClaims(text: string): ParsedClaim[] {
	const parsed = parseCoMathMarkdown(text);
	const claimsSection = parsed.sections.find((section) => section.heading.trim().toLowerCase() === "claims");
	if (!claimsSection) {
		return [
			{
				id: "claim-1",
				text: "Specialist response omitted the required ## Claims section.",
				classification: undefined,
				citations: [],
				externalCitations: [],
				failures: [failure("missing-exact-locator", "The specialist response must contain a ## Claims section.")],
			},
		];
	}
	return claimsSection.items.map((item, index) => {
		const classificationMatch = /^\[(source-backed|computed|proved|conjectural|unsupported)\]\s*/i.exec(item);
		const details = parseCoMathSourceCitationDetails(item);
		const failures: GroundingValidationFailure[] = details.malformedSegments.map((segment) =>
			failure("malformed-citation", `Malformed source citation segment: ${segment}.`),
		);
		if (!classificationMatch) {
			failures.push(failure("missing-exact-locator", "Every ## Claims bullet requires a [classification] label."));
		}
		const textWithoutLabel = item.replace(/^\[[^\]]+\]\s*/, "").trim();
		if (/^\[(?:source-\d+|artifact\s+)/i.test(textWithoutLabel)) {
			failures.push(
				failure(
					"malformed-citation",
					"Citation-only claim bullets are invalid; include the claim in the same bullet.",
				),
			);
		}
		return {
			id: `claim-${index + 1}`,
			text: textWithoutLabel,
			classification: classificationMatch?.[1]?.toLowerCase() as ResearchClaimClassification | undefined,
			citations: details.citations,
			externalCitations: parseExternalCitations(item),
			failures: dedupeFailures(failures),
		};
	});
}

/** Resolve local source citations exactly once against the immutable source-index artifacts. */
export async function validateTaskClaims(
	state: CoMathProjectState,
	parsedClaims: readonly ParsedClaim[],
	externalLiteratureSearch?: LiteratureSourceSearchResponse,
): Promise<ValidatedResearchClaim[]> {
	const sourceById = new Map(state.literatureSources.map((source) => [source.id, source]));
	const indexes = new Map(
		state.sourceIndexes.filter((index) => index.status === "ready").map((index) => [index.id, index]),
	);
	return Promise.all(
		parsedClaims.map(async (claim) => {
			const failures = [...claim.failures];
			const groundings: ValidatedGroundingRecord[] = [];
			const scopes = new Set<CoMathSourceClaimScope>();
			for (const citation of claim.citations) {
				const source = sourceById.get(citation.sourceId);
				if (!source) {
					failures.push(
						failure(
							"unknown-source",
							`Unknown source id ${citation.sourceId}.`,
							citation.sourceId,
							citation.lines,
						),
					);
					continue;
				}
				if (source.citationEligibility !== "citable") {
					failures.push(
						failure(
							"non-citable-source",
							`Source ${citation.sourceId} is inventory-only and cannot support claims.`,
							citation.sourceId,
							citation.lines,
						),
					);
					continue;
				}
				const resolved = await resolveCitation(source, citation, indexes);
				if ("failure" in resolved) {
					failures.push(resolved.failure);
					continue;
				}
				scopes.add(resolved.claimScope);
				groundings.push(resolved.grounding);
			}
			for (const citation of claim.externalCitations) {
				const resolved = resolveExternalCitation(citation, externalLiteratureSearch);
				if ("failure" in resolved) {
					failures.push(resolved.failure);
					continue;
				}
				groundings.push(resolved.grounding);
			}
			if (claim.classification === "source-backed" && groundings.length === 0) {
				failures.push(
					failure(
						"missing-exact-locator",
						`Claim ${claim.id} is source-backed but has no valid exact source locator.`,
					),
				);
			}
			if (claim.classification === undefined) {
				failures.push(failure("missing-exact-locator", `Claim ${claim.id} has no valid classification.`));
			}
			const deduplicatedFailures = dedupeFailures(failures);
			const hasBlockingFailure = deduplicatedFailures.some((candidate) => candidate.code !== "non-evidence-region");
			const status: ValidatedResearchClaimStatus = hasBlockingFailure
				? "invalid"
				: groundings.length > 0
					? "validated"
					: "unsupported";
			return {
				id: claim.id,
				text: canonicalizeClaimText(claim.text, groundings),
				classification: claim.classification ?? "unsupported",
				status,
				sourceIds: [...new Set(groundings.map((grounding) => grounding.sourceId))],
				...(scopes.size === 1 ? { sourceScope: [...scopes][0] } : {}),
				groundings,
				validationFailures: deduplicatedFailures,
			};
		}),
	);
}

function parseExternalCitations(text: string): ParsedExternalCitation[] {
	const citations: ParsedExternalCitation[] = [];
	for (const match of text.matchAll(/\[(doi|arxiv|url)\s*:\s*([^\],\s]+)([^\]]*)\]/gi)) {
		const kind = match[1]?.toLowerCase();
		const rawValue = match[2]?.trim();
		if ((kind !== "doi" && kind !== "arxiv" && kind !== "url") || !rawValue) continue;
		const value = kind === "doi" ? normalizeDoi(rawValue) : rawValue;
		const ranges = [...(match[3] ?? "").matchAll(/lines?\s+(\d+)\s*-\s*(\d+)/gi)].map((range) => ({
			start: Number(range[1]),
			end: Number(range[2]),
		}));
		if (ranges.length === 0) {
			citations.push({ kind, value, canonicalCitation: `[${kind}:${value}]` });
			continue;
		}
		for (const lines of ranges) {
			citations.push({
				kind,
				value,
				lines,
				canonicalCitation: `[${kind}:${value}, lines ${lines.start}-${lines.end}]`,
			});
		}
	}
	const seen = new Set<string>();
	return citations.filter((citation) => {
		const key = `${citation.kind}:${citation.value.toLowerCase()}:${citation.lines?.start ?? ""}-${citation.lines?.end ?? ""}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function resolveExternalCitation(
	citation: ParsedExternalCitation,
	search: LiteratureSourceSearchResponse | undefined,
): { grounding: ValidatedGroundingRecord } | { failure: GroundingValidationFailure } {
	const candidateIndex = search?.sources.findIndex((source) => {
		if (citation.kind === "doi") return normalizeDoi(source.doi ?? "") === citation.value;
		if (citation.kind === "arxiv") return (source.externalId ?? "").toLowerCase() === citation.value.toLowerCase();
		return (source.url ?? "") === citation.value;
	});
	const candidate = candidateIndex === undefined || candidateIndex < 0 ? undefined : search?.sources[candidateIndex];
	if (!candidate) {
		return {
			failure: failure(
				"unknown-source",
				`External citation ${citation.canonicalCitation} is absent from the active literature source catalog.`,
				`${citation.kind}:${citation.value}`,
			),
		};
	}
	const sourceId = `literature-candidate-${(candidateIndex ?? 0) + 1}`;
	let excerpt = `${candidate.title}\n${candidate.summary}`;
	if (citation.lines) {
		if (
			citation.lines.start < 1 ||
			citation.lines.end < citation.lines.start ||
			citation.lines.end - citation.lines.start + 1 > 200
		) {
			return {
				failure: failure(
					"invalid-range",
					`External citation ${citation.canonicalCitation} has an invalid or over-200-line range.`,
					sourceId,
					citation.lines,
				),
			};
		}
		if (!candidate.extractedText || !candidate.sourceFileSha256) {
			return {
				failure: failure(
					"missing-exact-locator",
					`External citation ${citation.canonicalCitation} requests full-text lines from a metadata-only candidate.`,
					sourceId,
					citation.lines,
				),
			};
		}
		const passage = extractExternalIndexedPassage(candidate.extractedText, citation.lines);
		if (!passage) {
			return {
				failure: failure(
					"invalid-range",
					`External citation ${citation.canonicalCitation} is outside the supplied indexed full text.`,
					sourceId,
					citation.lines,
				),
			};
		}
		excerpt = passage;
	}
	return {
		grounding: {
			sourceId,
			relation: "supports",
			locator: {
				kind: "external-record",
				provider: candidate.provider ?? "unknown",
				...(candidate.doi ? { doi: normalizeDoi(candidate.doi) } : {}),
				...(candidate.externalId ? { externalId: candidate.externalId } : {}),
				...(candidate.url ? { url: candidate.url } : {}),
				...(citation.lines ? { lines: citation.lines } : {}),
				...(citation.lines && candidate.sourceFileSha256 ? { contentSha256: candidate.sourceFileSha256 } : {}),
			},
			excerpt,
			excerptSha256: createHash("sha256").update(excerpt).digest("hex"),
			canonicalCitation: citation.canonicalCitation,
		},
	};
}

function extractExternalIndexedPassage(
	extractedText: string,
	lines: { start: number; end: number },
): string | undefined {
	const indexed = new Map<number, string>();
	for (const line of extractedText.split("\n")) {
		const match = /^(\d+):\s?(.*)$/.exec(line);
		if (match?.[1] && match[2] !== undefined) indexed.set(Number(match[1]), match[2]);
	}
	const passage: string[] = [];
	for (let line = lines.start; line <= lines.end; line += 1) {
		const text = indexed.get(line);
		if (text === undefined) return undefined;
		passage.push(`${line}: ${text}`);
	}
	return passage.join("\n");
}

export function buildValidatedClaimLedger(
	attemptId: string,
	taskId: string,
	claims: readonly ValidatedResearchClaim[],
): ValidatedClaimLedgerArtifact {
	const core = { version: 1 as const, attemptId, taskId, claims: [...claims] };
	return { ...core, sha256: createHash("sha256").update(JSON.stringify(core)).digest("hex") };
}

async function resolveCitation(
	source: LiteratureSourceArtifact,
	citation: ParsedCoMathSourceCitation,
	indexes: ReadonlyMap<string, CoMathProjectState["sourceIndexes"][number]>,
): Promise<
	{ grounding: ValidatedGroundingRecord; claimScope: CoMathSourceClaimScope } | { failure: GroundingValidationFailure }
> {
	if (!source.sourceIndexId || !source.sourceRelativePath || !source.sourceFileSha256 || !source.sourceRevisionId) {
		return {
			failure: failure(
				"digest-mismatch",
				`Source ${source.id} is missing immutable index linkage.`,
				source.id,
				citation.lines,
			),
		};
	}
	const indexRecord = indexes.get(source.sourceIndexId);
	if (!indexRecord)
		return {
			failure: failure(
				"digest-mismatch",
				`Source ${source.id} has no ready source index.`,
				source.id,
				citation.lines,
			),
		};
	try {
		const index = await loadCoMathSourceIndex(indexRecord.indexPath, indexRecord.indexSha256);
		const resolved = await validateIndexedSourceLocator(index, source.sourceRelativePath, citation.lines);
		if (resolved.fileSha256 !== source.sourceFileSha256) {
			return {
				failure: failure(
					"digest-mismatch",
					`Source ${source.id} digest does not match the active index.`,
					source.id,
					citation.lines,
				),
			};
		}
		const scope = sourceClaimScopeForRegion(resolved.regionKind);
		if (!scope || resolved.regionKind === "preamble") {
			return {
				failure: failure(
					"non-evidence-region",
					`Source ${source.id} lines ${citation.lines.start}-${citation.lines.end} are not an evidence region.`,
					source.id,
					citation.lines,
				),
			};
		}
		if (citation.explicitClaimScope && citation.explicitClaimScope !== scope) {
			return {
				failure: failure(
					"scope-mismatch",
					`Source ${source.id} citation scope does not match indexed ${resolved.regionKind} lines.`,
					source.id,
					citation.lines,
				),
			};
		}
		return {
			claimScope: scope,
			grounding: {
				sourceId: source.id,
				relation: "supports",
				locator: { kind: "lines", start: citation.lines.start, end: citation.lines.end },
				sourceIndexId: source.sourceIndexId,
				sourceRevisionId: source.sourceRevisionId,
				sourceRelativePath: source.sourceRelativePath,
				sourceFileSha256: source.sourceFileSha256,
				regionKind: resolved.regionKind,
				excerpt: resolved.excerpt,
				excerptSha256: resolved.excerptSha256,
				canonicalCitation: formatCanonicalCoMathSourceCitation({
					sourceId: source.id,
					lines: citation.lines,
					claimScope: scope,
					regionKind: resolved.regionKind,
					excerpt: resolved.excerpt,
					excerptSha256: resolved.excerptSha256,
					canonicalText: "",
				}),
			},
		};
	} catch (error) {
		return {
			failure: failure(
				"invalid-range",
				error instanceof Error ? error.message : String(error),
				source.id,
				citation.lines,
			),
		};
	}
}

function canonicalizeClaimText(text: string, groundings: readonly ValidatedGroundingRecord[]): string {
	if (groundings.length === 0) return text;
	const claim = text
		.replace(/\[source-\d+[^\]]*\]/gi, " ")
		.replace(/\[(?:doi|arxiv|url)\s*:[^\]]+\]/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
	const citations = [...new Set(groundings.map((grounding) => grounding.canonicalCitation))];
	return `${claim} ${citations.join(" ")}`.trim();
}

function normalizeDoi(value: string): string {
	return value
		.replace(/^https?:\/\/doi\.org\//i, "")
		.trim()
		.toLowerCase();
}

function failure(
	code: GroundingValidationFailure["code"],
	message: string,
	sourceId?: string,
	lines?: { start: number; end: number },
): GroundingValidationFailure {
	return { code, message, ...(sourceId ? { sourceId } : {}), ...(lines ? { lines } : {}) };
}

function dedupeFailures(failures: readonly GroundingValidationFailure[]): GroundingValidationFailure[] {
	const seen = new Set<string>();
	return failures.filter((candidate) => {
		const key = `${candidate.code}:${candidate.sourceId ?? ""}:${candidate.lines?.start ?? ""}:${candidate.lines?.end ?? ""}:${candidate.message}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
