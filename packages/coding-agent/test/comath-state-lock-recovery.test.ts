import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProjectState, saveProjectState } from "../src/modes/comath/storage.ts";

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true, force: true })));
});

describe("co-math state lock recovery", () => {
	it("immediately reclaims a fresh lock owned by a dead process", async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), "pi-comath-stale-lock-"));
		tempDirs.push(tempDir);
		const statePath = path.join(tempDir, "state.json");
		const lockPath = `${statePath}.lock`;
		await mkdir(lockPath);
		await writeFile(
			path.join(lockPath, "owner.json"),
			JSON.stringify({ pid: 2_147_483_647, createdAt: Date.now() }),
			"utf8",
		);
		const state = createEmptyProjectState({
			projectId: "stale-lock-recovery",
			title: "Stale lock recovery",
			rootQuestion: "Can research resume after interruption?",
			now: "2026-07-16T00:00:00.000Z",
		});

		await saveProjectState(statePath, state);

		const persisted = JSON.parse(await readFile(statePath, "utf8")) as { projectId?: unknown };
		expect(persisted.projectId).toBe("stale-lock-recovery");
	});
});
