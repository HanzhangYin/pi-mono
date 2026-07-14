import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { resolvePath } from "../../utils/paths.ts";

export const CO_MATH_SOURCE_POLICY_VERSION = 1;

export interface CoMathSourceFile {
	absolutePath: string;
	relativePath: string;
	displayName: string;
	sizeBytes: number;
	modifiedAt: string;
	sha256: string;
}

export type CoMathSourceSkipReason =
	| "binary-or-unsupported"
	| "depth-limit"
	| "file-count-limit"
	| "file-size-limit"
	| "ignored-directory"
	| "scan-limit"
	| "symlink"
	| "total-size-limit"
	| "unreadable";

export interface CoMathSourceSkippedEntry {
	relativePath: string;
	reason: CoMathSourceSkipReason;
}

export interface CoMathSourceLimits {
	maxDepth: number;
	maxFiles: number;
	maxFileBytes: number;
	maxScannedEntries: number;
	maxTotalBytes: number;
}

export interface ResolveCoMathSourceOptions {
	limits?: Partial<CoMathSourceLimits>;
}

export interface CoMathSource {
	input: string;
	absolutePath: string;
	displayName: string;
	exists: boolean;
	isFile: boolean;
	isDirectory?: boolean;
	files?: CoMathSourceFile[];
	skippedEntries?: CoMathSourceSkippedEntry[];
	limits?: CoMathSourceLimits;
	totalSelectedBytes?: number;
	truncated?: boolean;
	missingReason?: string;
}

const DEFAULT_SOURCE_LIMITS: CoMathSourceLimits = {
	maxDepth: 12,
	maxFiles: 128,
	maxFileBytes: 8 * 1024 * 1024,
	maxScannedEntries: 4_096,
	maxTotalBytes: 32 * 1024 * 1024,
};

const IGNORED_DIRECTORY_NAMES = new Set([
	".git",
	".hg",
	".next",
	".nuxt",
	".pi",
	".svn",
	".turbo",
	".yarn",
	"__pycache__",
	"build",
	"coverage",
	"dist",
	"node_modules",
	"target",
	"vendor",
]);

const IGNORED_FILE_NAMES = new Set([
	".ds_store",
	"agents.md",
	"claude.md",
	"npm-shrinkwrap.json",
	"package-lock.json",
	"pnpm-lock.yaml",
	"yarn.lock",
]);

const INCLUDED_BINARY_EXTENSIONS = new Set([".pdf"]);
const EXCLUDED_BINARY_EXTENSIONS = new Set([
	".7z",
	".a",
	".avi",
	".class",
	".dylib",
	".eot",
	".exe",
	".gif",
	".gz",
	".ico",
	".jpeg",
	".jpg",
	".mov",
	".mp3",
	".mp4",
	".o",
	".otf",
	".png",
	".rar",
	".so",
	".tar",
	".tgz",
	".ttf",
	".wav",
	".webm",
	".webp",
	".woff",
	".woff2",
	".xz",
	".zip",
]);

export async function resolveCoMathSource(
	input: string | undefined,
	cwd: string,
	options: ResolveCoMathSourceOptions = {},
): Promise<CoMathSource | undefined> {
	if (input === undefined || input.trim().length === 0) {
		return undefined;
	}

	const trimmed = input.trim();
	let absolutePath: string;
	try {
		absolutePath = resolvePath(trimmed, cwd, { trim: true, normalizeUnicodeSpaces: true });
	} catch (error: unknown) {
		return missingCoMathSource(trimmed, resolve(cwd, trimmed), error);
	}
	const displayName = basename(absolutePath) || trimmed;
	try {
		const sourceStat = await lstat(absolutePath);
		if (sourceStat.isSymbolicLink()) {
			return {
				input: trimmed,
				absolutePath,
				displayName,
				exists: true,
				isFile: false,
				isDirectory: false,
				missingReason: "Source path is a symlink and is not allowed.",
			};
		}
		const limits = normalizeSourceLimits(options.limits);
		if (sourceStat.isFile()) {
			const sourceFile = await inspectSourceFile(absolutePath, displayName, sourceStat.size, limits.maxFileBytes);
			return {
				input: trimmed,
				absolutePath,
				displayName,
				exists: true,
				isFile: true,
				isDirectory: false,
				files: sourceFile ? [sourceFile] : [],
				skippedEntries: sourceFile ? [] : [{ relativePath: displayName, reason: "file-size-limit" }],
				limits,
				totalSelectedBytes: sourceFile?.sizeBytes ?? 0,
				truncated: sourceFile === undefined,
				...(sourceFile ? {} : { missingReason: "Source file exceeds the configured source-size limit." }),
			};
		}
		if (sourceStat.isDirectory()) {
			return await resolveCoMathSourceDirectory(trimmed, absolutePath, displayName, limits);
		}
		return {
			input: trimmed,
			absolutePath,
			displayName,
			exists: true,
			isFile: false,
			isDirectory: false,
			missingReason: "Source path is neither a regular file nor a directory.",
		};
	} catch (error: unknown) {
		return missingCoMathSource(trimmed, absolutePath, error);
	}
}

export function isUsableCoMathSource(source: CoMathSource | undefined): boolean {
	if (!source?.exists) {
		return false;
	}
	if (source.files !== undefined) {
		return source.files.length > 0;
	}
	// Compatibility for callers constructing the earlier single-file shape directly.
	return source.isFile;
}

export function getCoMathSourceFiles(source: CoMathSource): CoMathSourceFile[] {
	if (source.files !== undefined) {
		return source.files;
	}
	if (!source.isFile) {
		return [];
	}
	return [
		{
			absolutePath: source.absolutePath,
			relativePath: source.displayName,
			displayName: source.displayName,
			sizeBytes: 0,
			modifiedAt: "",
			sha256: "",
		},
	];
}

async function resolveCoMathSourceDirectory(
	input: string,
	absolutePath: string,
	displayName: string,
	limits: CoMathSourceLimits,
): Promise<CoMathSource> {
	const files: CoMathSourceFile[] = [];
	const skippedEntries: CoMathSourceSkippedEntry[] = [];
	const canonicalRoot = await realpath(absolutePath);
	let scannedEntryCount = 0;
	let totalSelectedBytes = 0;
	let truncated = false;

	const skip = (relativePath: string, reason: CoMathSourceSkipReason): void => {
		if (skippedEntries.length < 512) {
			skippedEntries.push({ relativePath, reason });
		}
	};

	const walk = async (directoryPath: string, relativeDirectory: string, depth: number): Promise<void> => {
		if (scannedEntryCount >= limits.maxScannedEntries) {
			truncated = true;
			skip(relativeDirectory || ".", "scan-limit");
			return;
		}
		const directoryStat = await lstat(directoryPath);
		if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
			skip(relativeDirectory || ".", directoryStat.isSymbolicLink() ? "symlink" : "unreadable");
			return;
		}
		const canonicalDirectory = await realpath(directoryPath);
		if (!pathIsWithinRoot(canonicalRoot, canonicalDirectory)) {
			skip(relativeDirectory || ".", "symlink");
			return;
		}
		const entries = (await readdir(directoryPath, { withFileTypes: true })).sort((left, right) =>
			comparePortablePaths(left.name, right.name),
		);
		for (const entry of entries) {
			if (scannedEntryCount >= limits.maxScannedEntries) {
				truncated = true;
				skip(relativeDirectory || ".", "scan-limit");
				return;
			}
			scannedEntryCount += 1;
			const entryRelativePath = toPortablePath(
				relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name,
			);
			const entryAbsolutePath = resolve(directoryPath, entry.name);
			if (entry.isSymbolicLink()) {
				skip(entryRelativePath, "symlink");
				continue;
			}
			if (entry.isDirectory()) {
				if (IGNORED_DIRECTORY_NAMES.has(entry.name.toLowerCase())) {
					skip(entryRelativePath, "ignored-directory");
					continue;
				}
				if (depth >= limits.maxDepth) {
					truncated = true;
					skip(entryRelativePath, "depth-limit");
					continue;
				}
				await walk(entryAbsolutePath, entryRelativePath, depth + 1);
				continue;
			}
			if (!entry.isFile() || IGNORED_FILE_NAMES.has(entry.name.toLowerCase())) {
				skip(entryRelativePath, "binary-or-unsupported");
				continue;
			}
			if (files.length >= limits.maxFiles) {
				truncated = true;
				skip(entryRelativePath, "file-count-limit");
				continue;
			}
			try {
				const entryStat = await lstat(entryAbsolutePath);
				if (entryStat.isSymbolicLink() || !entryStat.isFile()) {
					skip(entryRelativePath, entryStat.isSymbolicLink() ? "symlink" : "unreadable");
					continue;
				}
				if (entryStat.size > limits.maxFileBytes) {
					truncated = true;
					skip(entryRelativePath, "file-size-limit");
					continue;
				}
				if (totalSelectedBytes + entryStat.size > limits.maxTotalBytes) {
					truncated = true;
					skip(entryRelativePath, "total-size-limit");
					continue;
				}
				const sourceFile = await inspectSourceFile(
					entryAbsolutePath,
					entryRelativePath,
					entryStat.size,
					limits.maxFileBytes,
				);
				if (!sourceFile || !(await isSupportedSourceContent(entry.name, sourceFile.absolutePath))) {
					skip(entryRelativePath, sourceFile ? "binary-or-unsupported" : "unreadable");
					continue;
				}
				files.push(sourceFile);
				totalSelectedBytes += sourceFile.sizeBytes;
			} catch {
				skip(entryRelativePath, "unreadable");
			}
		}
	};

	await walk(absolutePath, "", 0);
	files.sort((left, right) => comparePortablePaths(left.relativePath, right.relativePath));
	return {
		input,
		absolutePath,
		displayName,
		exists: true,
		isFile: false,
		isDirectory: true,
		files,
		skippedEntries,
		limits,
		totalSelectedBytes,
		truncated,
		...(files.length > 0 ? {} : { missingReason: "No readable source files were found in the directory." }),
	};
}

async function inspectSourceFile(
	absolutePath: string,
	relativePath: string,
	expectedSize: number,
	maxBytes: number,
): Promise<CoMathSourceFile | undefined> {
	if (expectedSize > maxBytes) {
		return undefined;
	}
	const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
	const handle = await open(absolutePath, constants.O_RDONLY | noFollow);
	try {
		const fileStat = await handle.stat();
		if (!fileStat.isFile() || fileStat.size > maxBytes) {
			return undefined;
		}
		const content = await handle.readFile();
		return {
			absolutePath,
			relativePath: toPortablePath(relativePath),
			displayName: basename(relativePath),
			sizeBytes: content.byteLength,
			modifiedAt: fileStat.mtime.toISOString(),
			sha256: createHash("sha256").update(content).digest("hex"),
		};
	} finally {
		await handle.close();
	}
}

async function isSupportedSourceContent(fileName: string, absolutePath: string): Promise<boolean> {
	const extension = extname(fileName).toLowerCase();
	if (INCLUDED_BINARY_EXTENSIONS.has(extension)) {
		return true;
	}
	if (EXCLUDED_BINARY_EXTENSIONS.has(extension)) {
		return false;
	}
	// Unknown extensions are allowed only when the file has no NUL byte in a small sample. This
	// keeps the intake generic for proof-assistant and CAS formats without ingesting arbitrary blobs.
	return sourceFileLooksTextual(absolutePath);
}

async function sourceFileLooksTextual(absolutePath: string): Promise<boolean> {
	const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
	const handle = await open(absolutePath, constants.O_RDONLY | noFollow);
	try {
		const sample = Buffer.alloc(8_192);
		const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
		return !sample.subarray(0, bytesRead).includes(0);
	} finally {
		await handle.close();
	}
}

function normalizeSourceLimits(overrides: Partial<CoMathSourceLimits> | undefined): CoMathSourceLimits {
	return {
		maxDepth: positiveInteger(overrides?.maxDepth, DEFAULT_SOURCE_LIMITS.maxDepth),
		maxFiles: positiveInteger(overrides?.maxFiles, DEFAULT_SOURCE_LIMITS.maxFiles),
		maxFileBytes: positiveInteger(overrides?.maxFileBytes, DEFAULT_SOURCE_LIMITS.maxFileBytes),
		maxScannedEntries: positiveInteger(overrides?.maxScannedEntries, DEFAULT_SOURCE_LIMITS.maxScannedEntries),
		maxTotalBytes: positiveInteger(overrides?.maxTotalBytes, DEFAULT_SOURCE_LIMITS.maxTotalBytes),
	};
}

function positiveInteger(value: number | undefined, fallback: number): number {
	return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function pathIsWithinRoot(root: string, candidate: string): boolean {
	const relativePath = relative(root, candidate);
	return (
		relativePath === "" ||
		(!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath))
	);
}

function toPortablePath(value: string): string {
	return value.split(sep).join("/");
}

function comparePortablePaths(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function missingCoMathSource(input: string, absolutePath: string, error: unknown): CoMathSource {
	const message = error instanceof Error ? error.message : String(error);
	return {
		input,
		absolutePath,
		displayName: basename(absolutePath) || input,
		exists: false,
		isFile: false,
		isDirectory: false,
		missingReason: `Source path is not readable: ${message}`,
	};
}
