import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import type { CoMathSourceSnapshot, CoMathSourceSnapshotFile } from "./comath-source-snapshot.ts";

export const CO_MATH_SOURCE_INDEX_POLICY_VERSION = 1;

export type CoMathSourceFileKind =
	| "tex"
	| "markdown"
	| "plain-text"
	| "json"
	| "xml"
	| "unsupported-binary"
	| "invalid-text";
export type CoMathSourceRegionKind =
	| "preamble"
	| "formal-document"
	| "included-formal-document"
	| "supplemental-after-end"
	| "detached-tex"
	| "ordinary-document";

export interface CoMathSourceLineRange {
	start: number;
	end: number;
}

export interface CoMathSourceIndexedRegion {
	kind: CoMathSourceRegionKind;
	lines: CoMathSourceLineRange;
	documentId?: string;
	reason?: string;
}

export interface CoMathSourceIncludeEdge {
	fromRelativePath: string;
	toRelativePath?: string;
	command: "input" | "include" | "subfile";
	line: number;
	status: "resolved" | "missing" | "outside-snapshot" | "cyclic";
	requestedPath: string;
}

export interface CoMathSourceIndexedSection {
	kind: "part" | "chapter" | "section" | "subsection" | "subsubsection";
	title: string;
	lines: CoMathSourceLineRange;
	regionKind: CoMathSourceRegionKind;
	documentId?: string;
}

export interface CoMathSourceIndexedFile {
	relativePath: string;
	sha256: string;
	sizeBytes: number;
	kind: CoMathSourceFileKind;
	lineCount?: number;
	hasFinalNewline?: boolean;
	regions: CoMathSourceIndexedRegion[];
	sections: CoMathSourceIndexedSection[];
	includeEdges: CoMathSourceIncludeEdge[];
	discoveredEnvironmentNames: string[];
	warnings: string[];
}

export interface CoMathSourceDocument {
	id: string;
	entryRelativePath: string;
	status: "complete" | "missing-begin" | "missing-end" | "ambiguous";
	beginDocumentLine?: number;
	endDocumentLine?: number;
	includedRelativePaths: string[];
	warnings: string[];
}

export interface CoMathSourceIndexArtifact {
	version: 1;
	policyVersion: number;
	sourceId: string;
	sourceRevisionId: string;
	sourceManifestSha256: string;
	snapshotRoot: string;
	files: CoMathSourceIndexedFile[];
	documents: CoMathSourceDocument[];
	warnings: string[];
	indexSha256: string;
}

export interface CoMathStagedSourceIndex {
	index: CoMathSourceIndexArtifact;
	stagingPath: string;
	finalPath: string;
	publishedContentSha256: string;
}

export interface ResolvedIndexedSourceLines {
	relativePath: string;
	fileSha256: string;
	lines: CoMathSourceLineRange;
	regionKind: CoMathSourceRegionKind;
	documentId?: string;
	excerpt: string;
	excerptSha256: string;
}

export type ValidatedIndexedSourceLocator = ResolvedIndexedSourceLines;

interface ParsedTexLine {
	line: number;
	text: string;
}

const TEXT_EXTENSIONS = new Map<string, CoMathSourceFileKind>([
	[".tex", "tex"],
	[".ltx", "tex"],
	[".sty", "tex"],
	[".md", "markdown"],
	[".markdown", "markdown"],
	[".txt", "plain-text"],
	[".rst", "plain-text"],
	[".json", "json"],
	[".xml", "xml"],
	[".html", "xml"],
	[".htm", "xml"],
]);
const VERBATIM_ENVIRONMENTS = new Set(["verbatim", "verbatim*", "Verbatim", "lstlisting", "minted"]);

/** Build a staged, immutable index from an already immutable source snapshot. */
export async function buildCoMathSourceIndex(snapshot: CoMathSourceSnapshot): Promise<CoMathStagedSourceIndex> {
	const parsedFiles = await Promise.all(snapshot.files.map((file) => parseSnapshotFile(file)));
	const files = new Map(parsedFiles.map((file) => [file.record.relativePath, file]));
	const documents = classifyTexDocuments(files);
	const indexedFiles = [...files.values()].map((file) => file.record).sort(compareByPath);
	const warnings = uniqueStrings([
		...documents.flatMap((document) => document.warnings),
		...indexedFiles.flatMap((file) => file.warnings.map((warning) => `${file.relativePath}: ${warning}`)),
	]);
	const core = {
		version: 1 as const,
		policyVersion: CO_MATH_SOURCE_INDEX_POLICY_VERSION,
		sourceId: snapshot.sourceId,
		sourceRevisionId: snapshot.revisionId,
		sourceManifestSha256: snapshot.manifestSha256,
		snapshotRoot: snapshot.snapshotRoot,
		files: indexedFiles,
		documents,
		warnings,
	};
	const indexSha256 = sha256(JSON.stringify(core));
	const index: CoMathSourceIndexArtifact = { ...core, indexSha256 };
	const artifactRoot = join(dirname(dirname(dirname(snapshot.snapshotRoot))), "source-indexes");
	const stagingPath = join(artifactRoot, ".staging", randomUUID());
	const finalPath = join(artifactRoot, indexSha256);
	await mkdir(stagingPath, { recursive: true });
	const serialized = `${JSON.stringify(index, null, "\t")}\n`;
	await writeFile(join(stagingPath, "index.json"), serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
	return { index, stagingPath, finalPath, publishedContentSha256: sha256(serialized) };
}

export async function publishCoMathSourceIndex(staged: CoMathStagedSourceIndex): Promise<void> {
	await mkdir(dirname(staged.finalPath), { recursive: true });
	try {
		await rename(staged.stagingPath, staged.finalPath);
	} catch (error: unknown) {
		if (!(await isReusableIndex(staged.finalPath, staged.index.indexSha256, staged.publishedContentSha256))) {
			throw error;
		}
		await rm(staged.stagingPath, { recursive: true, force: true });
	}
}

export async function discardStagedCoMathSourceIndex(staged: CoMathStagedSourceIndex): Promise<void> {
	await rm(staged.stagingPath, { recursive: true, force: true });
}

export async function loadCoMathSourceIndex(
	indexPath: string,
	expectedSha256: string,
): Promise<CoMathSourceIndexArtifact> {
	const raw = await readFile(indexPath, "utf8");
	const parsed = JSON.parse(raw) as CoMathSourceIndexArtifact;
	if (
		parsed.version !== 1 ||
		parsed.policyVersion !== CO_MATH_SOURCE_INDEX_POLICY_VERSION ||
		parsed.indexSha256 !== expectedSha256
	) {
		throw new Error("Source index metadata does not match the expected policy or digest.");
	}
	const { indexSha256: _indexSha256, ...core } = parsed;
	if (sha256(JSON.stringify(core)) !== expectedSha256) {
		throw new Error("Source index digest mismatch.");
	}
	return parsed;
}

export async function resolveIndexedSourceLines(
	index: CoMathSourceIndexArtifact,
	sourceRelativePath: string,
	range: CoMathSourceLineRange,
): Promise<ResolvedIndexedSourceLines> {
	const file = index.files.find((candidate) => candidate.relativePath === sourceRelativePath);
	if (!file || file.lineCount === undefined) {
		throw new Error(`Source file is not line-indexed: ${sourceRelativePath}`);
	}
	if (!isValidRange(range, file.lineCount)) {
		throw new Error(`Invalid source line range ${range.start}-${range.end} for ${sourceRelativePath}.`);
	}
	const region = findContainingRegion(file.regions, range);
	if (!region) {
		throw new Error(`Source line range ${range.start}-${range.end} crosses an indexed document boundary.`);
	}
	const path = findSnapshotFilePath(index, sourceRelativePath);
	const raw = await readFile(path);
	if (sha256(raw) !== file.sha256) {
		throw new Error(`Source file digest mismatch: ${sourceRelativePath}`);
	}
	const bytes = sliceRawLines(raw, range);
	return {
		relativePath: sourceRelativePath,
		fileSha256: file.sha256,
		lines: { ...range },
		regionKind: region.kind,
		...(region.documentId ? { documentId: region.documentId } : {}),
		excerpt: formatNumberedLines(bytes.toString("utf8"), range.start),
		excerptSha256: sha256(bytes),
	};
}

export async function validateIndexedSourceLocator(
	index: CoMathSourceIndexArtifact,
	sourceRelativePath: string,
	range: CoMathSourceLineRange,
): Promise<ValidatedIndexedSourceLocator> {
	return resolveIndexedSourceLines(index, sourceRelativePath, range);
}

export function sourceClaimScopeForRegion(
	region: CoMathSourceRegionKind,
): "formal-document" | "supplemental" | "ordinary-document" | "detached-source" {
	if (region === "formal-document" || region === "included-formal-document") return "formal-document";
	if (region === "supplemental-after-end") return "supplemental";
	if (region === "detached-tex") return "detached-source";
	return "ordinary-document";
}

function findSnapshotFilePath(index: CoMathSourceIndexArtifact, relativePath: string): string {
	return join(index.snapshotRoot, "files", ...relativePath.split("/"));
}

function classifyTexDocuments(files: Map<string, ParsedSourceFile>): CoMathSourceDocument[] {
	const roots = [...files.values()].filter(
		(file) => file.record.kind === "tex" && file.tex?.hasDocumentClass && file.tex.beginDocumentLine !== undefined,
	);
	const documents: CoMathSourceDocument[] = [];
	for (const [index, root] of roots.entries()) {
		const documentId = `document-${index + 1}`;
		const begin = root.tex?.beginDocumentLine;
		const end = root.tex?.endDocumentLine;
		const warnings: string[] = [];
		const status = end === undefined ? "missing-end" : "complete";
		if (end === undefined) warnings.push("No effective \\end{document} was found.");
		if (begin === undefined) warnings.push("No effective \\begin{document} was found.");
		applyRootRegions(root.record, begin, end, documentId);
		const included = new Set<string>();
		classifyIncludes(files, root.record.relativePath, "formal-document", documentId, [], included);
		documents.push({
			id: documentId,
			entryRelativePath: root.record.relativePath,
			status,
			...(begin ? { beginDocumentLine: begin } : {}),
			...(end ? { endDocumentLine: end } : {}),
			includedRelativePaths: [...included].sort(),
			warnings,
		});
	}
	for (const file of files.values()) {
		if (file.record.kind !== "tex") continue;
		if (file.record.regions.length === 0) {
			file.record.regions.push({ kind: "detached-tex", lines: { start: 1, end: file.lineCount } });
		}
		file.record.sections = sectionsFor(file.tex?.lines ?? [], file.record.regions);
	}
	return documents;
}

function classifyIncludes(
	files: Map<string, ParsedSourceFile>,
	path: string,
	regionKind: CoMathSourceRegionKind,
	documentId: string,
	stack: string[],
	included: Set<string>,
): void {
	const file = files.get(path);
	if (!file?.tex) return;
	for (const include of file.tex.includes) {
		const region = regionAt(file.record.regions, include.line) ?? regionKind;
		const resolved = resolveInclude(path, include.requestedPath, files);
		if (resolved.status !== "resolved" || !resolved.path) {
			include.edge.status = resolved.status;
			continue;
		}
		include.edge.toRelativePath = resolved.path;
		if (stack.includes(resolved.path) || resolved.path === path) {
			include.edge.status = "cyclic";
			continue;
		}
		const child = files.get(resolved.path);
		if (!child) {
			include.edge.status = "missing";
			continue;
		}
		include.edge.status = "resolved";
		included.add(resolved.path);
		const childKind =
			region === "preamble"
				? "preamble"
				: region === "supplemental-after-end"
					? "supplemental-after-end"
					: "included-formal-document";
		child.record.regions.push({ kind: childKind, lines: { start: 1, end: child.lineCount }, documentId });
		classifyIncludes(files, resolved.path, childKind, documentId, [...stack, path], included);
	}
}

function applyRootRegions(
	file: CoMathSourceIndexedFile,
	begin: number | undefined,
	end: number | undefined,
	documentId: string,
): void {
	const lineCount = file.lineCount ?? 0;
	if (!begin || lineCount === 0) return;
	if (begin > 1) file.regions.push({ kind: "preamble", lines: { start: 1, end: begin - 1 }, documentId });
	file.regions.push({ kind: "formal-document", lines: { start: begin, end: end ?? lineCount }, documentId });
	if (end !== undefined && end < lineCount) {
		file.regions.push({ kind: "supplemental-after-end", lines: { start: end + 1, end: lineCount }, documentId });
	}
}

async function parseSnapshotFile(file: CoMathSourceSnapshotFile): Promise<ParsedSourceFile> {
	const raw = await readFile(file.snapshotAbsolutePath);
	if (sha256(raw) !== file.sha256) throw new Error(`Snapshot file digest mismatch: ${file.relativePath}`);
	const kind = fileKind(file.relativePath);
	const base: CoMathSourceIndexedFile = {
		relativePath: file.relativePath,
		sha256: file.sha256,
		sizeBytes: file.sizeBytes,
		kind,
		regions: [],
		sections: [],
		includeEdges: [],
		discoveredEnvironmentNames: [],
		warnings: [],
	};
	if (kind === "unsupported-binary") return { record: base, lineCount: 0 };
	const text = raw.toString("utf8");
	if (!Buffer.from(text, "utf8").equals(raw)) {
		base.kind = "invalid-text";
		base.warnings.push("File is not valid UTF-8 and was not line-indexed.");
		return { record: base, lineCount: 0 };
	}
	const lineCount = countPhysicalLines(raw);
	base.lineCount = lineCount;
	base.hasFinalNewline = raw.length > 0 && raw[raw.length - 1] === 10;
	if (kind !== "tex") {
		if (lineCount > 0) base.regions.push({ kind: "ordinary-document", lines: { start: 1, end: lineCount } });
		return { record: base, lineCount };
	}
	const tex = parseTex(text, lineCount, file.relativePath, base);
	return { record: base, tex, lineCount };
}

function parseTex(text: string, lineCount: number, path: string, record: CoMathSourceIndexedFile): ParsedTex {
	const lines = text.split(/\n/).map((line, index) => ({ line: index + 1, text: stripTrailingCarriageReturn(line) }));
	const parsedLines: ParsedTexLine[] = [];
	const includes: ParsedTexInclude[] = [];
	let inVerbatim: string | undefined;
	let hasDocumentClass = false;
	let beginDocumentLine: number | undefined;
	let endDocumentLine: number | undefined;
	for (const item of lines) {
		let value = item.text;
		if (inVerbatim) {
			if (new RegExp(String.raw`\\end\s*\{${escapeRegExp(inVerbatim)}\}`).test(value)) inVerbatim = undefined;
			parsedLines.push({ line: item.line, text: "" });
			continue;
		}
		value = stripTexComment(value);
		const beginVerbatim = /\\begin\s*\{([^}]+)\}/.exec(value)?.[1];
		if (beginVerbatim && VERBATIM_ENVIRONMENTS.has(beginVerbatim)) {
			inVerbatim = beginVerbatim;
			parsedLines.push({ line: item.line, text: "" });
			continue;
		}
		parsedLines.push({ line: item.line, text: value });
		if (/\\documentclass(?:\s*\[[^\]]*\])?\s*\{[^}]+\}/.test(value)) hasDocumentClass = true;
		if (beginDocumentLine === undefined && /\\begin\s*\{document\}/.test(value)) beginDocumentLine = item.line;
		if (beginDocumentLine !== undefined && endDocumentLine === undefined && /\\end\s*\{document\}/.test(value)) {
			endDocumentLine = item.line;
		}
		for (const match of value.matchAll(/\\(?:newtheorem|newtheorem\*)\s*\{([^}]+)\}/g)) {
			if (match[1]) record.discoveredEnvironmentNames.push(match[1]);
		}
		for (const match of value.matchAll(/\\(input|include|subfile)\s*\{([^}]+)\}/g)) {
			const command = match[1] as CoMathSourceIncludeEdge["command"];
			const requestedPath = match[2]?.trim();
			if (!requestedPath) continue;
			const edge: CoMathSourceIncludeEdge = {
				fromRelativePath: path,
				command,
				line: item.line,
				status: "missing",
				requestedPath,
			};
			record.includeEdges.push(edge);
			includes.push({ line: item.line, requestedPath, edge });
		}
	}
	record.discoveredEnvironmentNames = uniqueStrings(record.discoveredEnvironmentNames).sort();
	if (inVerbatim) record.warnings.push(`Unclosed verbatim environment: ${inVerbatim}.`);
	if (lineCount === 0) record.warnings.push("Empty TeX file.");
	return { lines: parsedLines, includes, hasDocumentClass, beginDocumentLine, endDocumentLine };
}

function resolveInclude(
	fromPath: string,
	requested: string,
	files: ReadonlyMap<string, ParsedSourceFile>,
): { status: CoMathSourceIncludeEdge["status"]; path?: string } {
	if (posix.isAbsolute(requested)) return { status: "outside-snapshot" };
	const base = posix.normalize(posix.join(posix.dirname(fromPath), requested));
	if (base === ".." || base.startsWith("../")) return { status: "outside-snapshot" };
	const candidates = [base, ...(posix.extname(base) ? [] : [`${base}.tex`])];
	const found = candidates.find((candidate) => files.has(candidate));
	return found ? { status: "resolved", path: found } : { status: "missing" };
}

function sectionsFor(
	lines: readonly ParsedTexLine[],
	regions: readonly CoMathSourceIndexedRegion[],
): CoMathSourceIndexedSection[] {
	const sections: CoMathSourceIndexedSection[] = [];
	for (const line of lines) {
		const match = /\\(part|chapter|section|subsection|subsubsection)\*?\s*\{([^}]*)\}/.exec(line.text);
		if (!match?.[1] || match[2] === undefined) continue;
		const region = regionAt(regions, line.line);
		if (!region) continue;
		sections.push({
			kind: match[1] as CoMathSourceIndexedSection["kind"],
			title: match[2].replace(/\s+/g, " ").trim(),
			lines: { start: line.line, end: line.line },
			regionKind: region.kind,
			...(region.documentId ? { documentId: region.documentId } : {}),
		});
	}
	return sections;
}

function regionAt(regions: readonly CoMathSourceIndexedRegion[], line: number): CoMathSourceIndexedRegion | undefined {
	return regions.find((region) => line >= region.lines.start && line <= region.lines.end);
}

function findContainingRegion(
	regions: readonly CoMathSourceIndexedRegion[],
	range: CoMathSourceLineRange,
): CoMathSourceIndexedRegion | undefined {
	return regions.find((region) => range.start >= region.lines.start && range.end <= region.lines.end);
}

function sliceRawLines(raw: Buffer, range: CoMathSourceLineRange): Buffer {
	const starts = lineStarts(raw);
	const startOffset = starts[range.start - 1];
	const endOffset = range.end < starts.length ? starts[range.end] : raw.length;
	if (startOffset === undefined || endOffset === undefined) throw new Error("Line range is outside source content.");
	return raw.subarray(startOffset, endOffset);
}

function lineStarts(raw: Buffer): number[] {
	if (raw.length === 0) return [];
	const starts = [0];
	for (let index = 0; index < raw.length; index += 1) {
		if (raw[index] === 10 && index + 1 < raw.length) starts.push(index + 1);
	}
	return starts;
}

function countPhysicalLines(raw: Buffer): number {
	if (raw.length === 0) return 0;
	let lineFeeds = 0;
	for (const byte of raw) if (byte === 10) lineFeeds += 1;
	return lineFeeds + (raw[raw.length - 1] === 10 ? 0 : 1);
}

function formatNumberedLines(text: string, startLine: number): string {
	const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
	if (lines.at(-1) === "") lines.pop();
	return lines.map((line, index) => `${startLine + index}: ${line}`).join("\n");
}

function fileKind(path: string): CoMathSourceFileKind {
	const extension = posix.extname(path).toLowerCase();
	return TEXT_EXTENSIONS.get(extension) ?? "unsupported-binary";
}

function stripTexComment(line: string): string {
	for (let index = 0; index < line.length; index += 1) {
		if (line[index] !== "%") continue;
		let slashCount = 0;
		for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) slashCount += 1;
		if (slashCount % 2 === 0) return line.slice(0, index);
	}
	return line;
}

function stripTrailingCarriageReturn(value: string): string {
	return value.endsWith("\r") ? value.slice(0, -1) : value;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidRange(range: CoMathSourceLineRange, lineCount: number): boolean {
	return (
		Number.isSafeInteger(range.start) &&
		Number.isSafeInteger(range.end) &&
		range.start >= 1 &&
		range.end >= range.start &&
		range.end <= lineCount
	);
}

function compareByPath(left: CoMathSourceIndexedFile, right: CoMathSourceIndexedFile): number {
	return left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0;
}

function uniqueStrings(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function sha256(value: string | Buffer): string {
	return createHash("sha256").update(value).digest("hex");
}

async function isReusableIndex(
	path: string,
	expectedIndexSha256: string,
	expectedContentSha256: string,
): Promise<boolean> {
	if (!(await stat(path).catch(() => undefined))?.isDirectory()) return false;
	try {
		const raw = await readFile(join(path, "index.json"), "utf8");
		const parsed = JSON.parse(raw) as { indexSha256?: unknown };
		return parsed.indexSha256 === expectedIndexSha256 && sha256(raw) === expectedContentSha256;
	} catch {
		return false;
	}
}

interface ParsedTexInclude {
	line: number;
	requestedPath: string;
	edge: CoMathSourceIncludeEdge;
}

interface ParsedTex {
	lines: ParsedTexLine[];
	includes: ParsedTexInclude[];
	hasDocumentClass: boolean;
	beginDocumentLine?: number;
	endDocumentLine?: number;
}

interface ParsedSourceFile {
	record: CoMathSourceIndexedFile;
	tex?: ParsedTex;
	lineCount: number;
}
