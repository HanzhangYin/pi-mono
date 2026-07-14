import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoMathStateLock } from "../src/modes/comath/comath-state-lock.ts";
import { CoMathStateStore } from "../src/modes/comath/comath-state-store.ts";
import { addGoal, createEmptyProjectState } from "../src/modes/comath/storage.ts";

const NOW = "2026-07-10T00:00:00.000Z";
const tempDirs: string[] = [];

async function createStore(): Promise<{
	initialState: ReturnType<typeof createEmptyProjectState>;
	store: CoMathStateStore;
}> {
	const tempDir = await mkdtemp(path.join(tmpdir(), "pi-comath-state-store-"));
	tempDirs.push(tempDir);
	return {
		initialState: createEmptyProjectState({
			projectId: "project-1",
			title: "Concurrent project",
			rootQuestion: "Do concurrent commits survive?",
			now: NOW,
		}),
		store: new CoMathStateStore(path.join(tempDir, "state.json")),
	};
}

afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true, force: true })));
});

describe("CoMathStateStore", () => {
	it("preserves both concurrent commits", async () => {
		const { initialState, store } = await createStore();

		await Promise.all([
			store.commit((state) => addGoal(state, { id: "goal-1", text: "First goal", now: NOW }), initialState),
			store.commit((state) => addGoal(state, { id: "goal-2", text: "Second goal", now: NOW }), initialState),
		]);

		expect((await store.load())?.approvedGoals.map((goal) => goal.id)).toEqual(["goal-1", "goal-2"]);
	});

	it("delegates commit ordering to one FIFO state lock", async () => {
		const run = vi.spyOn(CoMathStateLock.prototype, "run");
		const { initialState, store } = await createStore();
		const transformOrder: string[] = [];

		const first = store.commit((state) => {
			transformOrder.push("first");
			return { ...state, title: "first" };
		}, initialState);
		const second = store.commit((state) => {
			transformOrder.push(state.title);
			return { ...state, title: "second" };
		}, initialState);

		await Promise.all([first, second]);

		expect(run).toHaveBeenCalledTimes(2);
		expect(transformOrder).toEqual(["first", "first"]);
		expect((await store.load())?.title).toBe("second");
	});

	it("retries revision conflicts across independent store instances", async () => {
		const { initialState, store } = await createStore();
		const secondStore = new CoMathStateStore(store.statePath);

		await Promise.all([
			store.commit((state) => addGoal(state, { id: "goal-1", text: "First goal", now: NOW }), {
				...initialState,
			}),
			secondStore.commit((state) => addGoal(state, { id: "goal-2", text: "Second goal", now: NOW }), {
				...initialState,
			}),
		]);

		const persisted = await store.load();
		expect(persisted?.approvedGoals.map((goal) => goal.id).sort()).toEqual(["goal-1", "goal-2"]);
		expect(persisted?.revision).toBeGreaterThanOrEqual(2);
	});

	it("records a compact manifest for each transaction", async () => {
		const { initialState, store } = await createStore();

		await store.transact(
			{
				operation: "record-goal",
				actor: "system",
				changedEntityIds: ["goal-1", "goal-1"],
				publishedArtifacts: [{ id: "artifact-1", sha256: "a".repeat(64) }],
			},
			(state) => ({ state: addGoal(state, { id: "goal-1", text: "Manifest goal", now: NOW }), result: undefined }),
			initialState,
		);

		const manifests = await readdir(path.join(path.dirname(store.statePath), "revisions"));
		expect(manifests).toHaveLength(1);
		const manifest = JSON.parse(
			await readFile(path.join(path.dirname(store.statePath), "revisions", manifests[0] as string), "utf8"),
		) as Record<string, unknown>;
		expect(manifest).toMatchObject({
			operation: "record-goal",
			actor: "system",
			changedEntityIds: ["goal-1"],
			publishedArtifacts: [{ id: "artifact-1", sha256: "a".repeat(64) }],
		});
		expect(manifest.stateSha256).toMatch(/^[a-f0-9]{64}$/);
		expect((await store.load())?.lastTransactionId).toBe(manifest.transactionId);
	});

	it("archives v1 state without rewriting it", async () => {
		const { initialState, store } = await createStore();
		const legacy = { ...initialState, version: 1 };
		await writeFile(store.statePath, `${JSON.stringify(legacy, null, "\t")}\n`, "utf8");

		const archivedPath = await store.archiveLegacyState();

		expect(archivedPath).toMatch(/legacy\/state-v1-[a-f0-9]{64}\.json$/);
		expect(await store.load()).toBeUndefined();
		expect(await readFile(archivedPath as string, "utf8")).toBe(`${JSON.stringify(legacy, null, "\t")}\n`);
	});
});
