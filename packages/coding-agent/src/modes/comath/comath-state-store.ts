import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { CoMathStateLock } from "./comath-state-lock.ts";
import type { CoMathProjectState } from "./schema.ts";
import { CoMathStateConflictError, loadProjectState, saveProjectState } from "./storage.ts";

const MAX_COMMIT_ATTEMPTS = 5;

export type CoMathStateTransform = (state: CoMathProjectState) => CoMathProjectState;
export interface CoMathTransactionMetadata {
	operation: string;
	actor: string;
	changedEntityIds?: readonly string[];
	publishedArtifacts?: readonly { id: string; sha256: string }[];
}
export interface CoMathTransactionManifest {
	transactionId: string;
	revision: number;
	parentRevision: number;
	operation: string;
	actor: string;
	changedEntityIds: string[];
	publishedArtifacts: Array<{ id: string; sha256: string }>;
	stateSha256: string;
	committedAt: string;
}
export interface CoMathPreparedArtifact {
	id: string;
	stagingPath: string;
	finalPath: string;
	contentPath: string;
	sha256: string;
}
export interface CoMathStateCommitResult<T> {
	state: CoMathProjectState;
	result: T;
}
export type CoMathStateResultTransform<T> = (state: CoMathProjectState) => CoMathStateCommitResult<T>;

export class CoMathStateStore {
	readonly statePath: string;
	readonly stateLock = new CoMathStateLock();

	constructor(statePath: string) {
		this.statePath = statePath;
	}

	load(): Promise<CoMathProjectState | undefined> {
		return loadProjectState(this.statePath);
	}

	/**
	 * Move a v1 workspace aside before a v2 harness starts a new active workspace. The archived
	 * JSON is intentionally never normalized or written again: it remains historical evidence,
	 * rather than silently becoming eligible for v2 acceptance gates.
	 */
	archiveLegacyState(): Promise<string | undefined> {
		return this.stateLock.run(async () => {
			let raw: string;
			try {
				raw = await readFile(this.statePath, "utf8");
			} catch (error: unknown) {
				if (isMissingFileError(error)) {
					return undefined;
				}
				throw error;
			}
			let version: unknown;
			try {
				version = (JSON.parse(raw) as { version?: unknown }).version;
			} catch {
				throw new Error(`Cannot archive invalid CoMath state at ${this.statePath}.`);
			}
			if (version === 2) {
				return undefined;
			}
			const digest = createHash("sha256").update(raw).digest("hex");
			const legacyDirectory = path.join(path.dirname(this.statePath), "legacy");
			const archivedPath = path.join(legacyDirectory, `state-v1-${digest}.json`);
			await mkdir(legacyDirectory, { recursive: true });
			try {
				await rename(this.statePath, archivedPath);
			} catch (error: unknown) {
				if (!isErrorCode(error, "EEXIST")) {
					throw error;
				}
				// A previous activation already archived this exact digest. The still-present active
				// v1 file is a duplicate and must not remain writable.
				await removeFile(this.statePath);
			}
			return archivedPath;
		});
	}

	commit(transform: CoMathStateTransform, fallback?: CoMathProjectState): Promise<CoMathProjectState> {
		return this.transact(
			{ operation: "state-commit", actor: "system" },
			(state) => ({ state: transform(state), result: undefined }),
			fallback,
		).then(({ state }) => state);
	}

	commitWithResult<T>(
		transform: CoMathStateResultTransform<T>,
		fallback?: CoMathProjectState,
	): Promise<CoMathStateCommitResult<T>> {
		return this.transact({ operation: "state-commit", actor: "system" }, transform, fallback);
	}

	transactWithArtifacts<T>(
		metadata: CoMathTransactionMetadata,
		artifacts: readonly CoMathPreparedArtifact[],
		transform: CoMathStateResultTransform<T>,
		fallback?: CoMathProjectState,
	): Promise<CoMathStateCommitResult<T>> {
		return this.stateLock.run(async () => {
			const fresh = (await this.load()) ?? fallback;
			if (!fresh) throw new Error(`Cannot commit missing CoMath state at ${this.statePath}.`);
			for (const artifact of artifacts) await publishPreparedArtifact(artifact);
			const transformed = transform(fresh);
			const transactionId = randomUUID();
			const committed: CoMathStateCommitResult<T> = {
				...transformed,
				state: { ...transformed.state, lastTransactionId: transactionId },
			};
			const parentRevision = fresh.revision ?? 0;
			await saveProjectState(this.statePath, committed.state);
			await this.writeTransactionManifest(
				{
					...metadata,
					publishedArtifacts: [
						...(metadata.publishedArtifacts ?? []),
						...artifacts.map((artifact) => ({ id: artifact.id, sha256: artifact.sha256 })),
					],
				},
				committed.state,
				parentRevision,
				transactionId,
			);
			return committed;
		});
	}

	transact<T>(
		metadata: CoMathTransactionMetadata,
		transform: CoMathStateResultTransform<T>,
		fallback?: CoMathProjectState,
	): Promise<CoMathStateCommitResult<T>> {
		return this.stateLock.run(async () => {
			for (let attempt = 1; attempt <= MAX_COMMIT_ATTEMPTS; attempt += 1) {
				const fresh = (await this.load()) ?? fallback;
				if (!fresh) {
					throw new Error(`Cannot commit missing CoMath state at ${this.statePath}.`);
				}
				const transformed = transform(fresh);
				const transactionId = randomUUID();
				const committed: CoMathStateCommitResult<T> = {
					...transformed,
					state: { ...transformed.state, lastTransactionId: transactionId },
				};
				try {
					const parentRevision = fresh.revision ?? 0;
					await saveProjectState(this.statePath, committed.state);
					await this.writeTransactionManifest(metadata, committed.state, parentRevision, transactionId);
					return committed;
				} catch (error) {
					if (!(error instanceof CoMathStateConflictError) || attempt === MAX_COMMIT_ATTEMPTS) {
						throw error;
					}
				}
			}
			throw new Error(`Could not commit CoMath state at ${this.statePath}.`);
		});
	}

	private async writeTransactionManifest(
		metadata: CoMathTransactionMetadata,
		state: CoMathProjectState,
		parentRevision: number,
		transactionId: string,
	): Promise<void> {
		const revision = state.revision;
		if (revision === undefined) {
			throw new Error("Committed CoMath state is missing a revision.");
		}
		const manifest: CoMathTransactionManifest = {
			transactionId,
			revision,
			parentRevision,
			operation: metadata.operation.trim() || "state-commit",
			actor: metadata.actor.trim() || "system",
			changedEntityIds: uniqueStrings(metadata.changedEntityIds ?? []),
			publishedArtifacts: [...(metadata.publishedArtifacts ?? [])],
			stateSha256: createHash("sha256").update(JSON.stringify(state)).digest("hex"),
			committedAt: new Date().toISOString(),
		};
		const directory = path.join(path.dirname(this.statePath), "revisions");
		await mkdir(directory, { recursive: true });
		await writeFile(
			path.join(directory, `${String(revision).padStart(12, "0")}-${transactionId}.json`),
			`${JSON.stringify(manifest, null, "\t")}\n`,
			{ encoding: "utf8", flag: "wx" },
		);
	}
}

async function publishPreparedArtifact(artifact: CoMathPreparedArtifact): Promise<void> {
	const stagedContent = await readFile(path.join(artifact.stagingPath, artifact.contentPath));
	if (createHash("sha256").update(stagedContent).digest("hex") !== artifact.sha256) {
		throw new Error(`Prepared artifact digest mismatch: ${artifact.id}`);
	}
	await mkdir(path.dirname(artifact.finalPath), { recursive: true });
	try {
		await rename(artifact.stagingPath, artifact.finalPath);
	} catch (error: unknown) {
		if (!isErrorCode(error, "EEXIST") && !isErrorCode(error, "ENOTEMPTY")) throw error;
		const publishedContent = await readFile(path.join(artifact.finalPath, artifact.contentPath));
		if (createHash("sha256").update(publishedContent).digest("hex") !== artifact.sha256) {
			throw new Error(`Published artifact digest mismatch: ${artifact.id}`);
		}
		await rm(artifact.stagingPath, { recursive: true, force: true });
	}
}

function uniqueStrings(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function isMissingFileError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function removeFile(filePath: string): Promise<void> {
	await rm(filePath, { force: true });
}
