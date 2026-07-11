import { describe, expect, it } from "vitest";
import { CoMathStateLock } from "../src/modes/comath/comath-state-lock.ts";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

describe("CoMathStateLock", () => {
	it("runs contended sections one at a time in FIFO order", async () => {
		const lock = new CoMathStateLock();
		const events: string[] = [];
		let inFlight = 0;
		let peakInFlight = 0;
		const section = (name: string, delayMs: number): Promise<string> =>
			lock.run(async () => {
				inFlight += 1;
				peakInFlight = Math.max(peakInFlight, inFlight);
				events.push(`start-${name}`);
				await sleep(delayMs);
				events.push(`end-${name}`);
				inFlight -= 1;
				return name;
			});
		// The slowest section is queued first: FIFO means the fast ones still wait for it.
		const results = await Promise.all([section("a", 15), section("b", 0), section("c", 5)]);
		expect(results).toEqual(["a", "b", "c"]);
		expect(events).toEqual(["start-a", "end-a", "start-b", "end-b", "start-c", "end-c"]);
		expect(peakInFlight).toBe(1);
	});

	it("returns each section's own result and propagates its own rejection", async () => {
		const lock = new CoMathStateLock();
		await expect(lock.run(async () => 42)).resolves.toBe(42);
		await expect(
			lock.run(async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		// The chain is not poisoned: the next section still runs and resolves.
		await expect(lock.run(async () => "after-failure")).resolves.toBe("after-failure");
	});

	it("keeps later queued sections running when an earlier one rejects under contention", async () => {
		const lock = new CoMathStateLock();
		const completed: string[] = [];
		const settled = await Promise.allSettled([
			lock.run(async () => {
				await sleep(5);
				throw new Error("first failed");
			}),
			lock.run(async () => {
				completed.push("second");
				return "second";
			}),
			lock.run(async () => {
				throw new Error("third failed");
			}),
			lock.run(async () => {
				completed.push("fourth");
				return "fourth";
			}),
		]);
		expect(settled.map((entry) => entry.status)).toEqual(["rejected", "fulfilled", "rejected", "fulfilled"]);
		expect(completed).toEqual(["second", "fourth"]);
	});

	it("does not start a queued section before the previous one settles", async () => {
		const lock = new CoMathStateLock();
		let firstFinished = false;
		const first = lock.run(async () => {
			await sleep(10);
			firstFinished = true;
		});
		const second = lock.run(async () => firstFinished);
		await expect(second).resolves.toBe(true);
		await first;
	});
});
