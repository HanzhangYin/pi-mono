import { describe, expect, it } from "vitest";
import { researchCompletionTimestamp } from "../src/modes/comath/comath-time.ts";

describe("co-math research timestamps", () => {
	it("records completion strictly after start even when the supplied clock has not advanced", () => {
		const startedAt = "2026-07-09T12:00:00.000Z";
		expect(researchCompletionTimestamp(startedAt, Date.parse(startedAt))).toBe("2026-07-09T12:00:00.001Z");
	});

	it("uses the actual later clock value", () => {
		const startedAt = "2026-07-09T12:00:00.000Z";
		expect(researchCompletionTimestamp(startedAt, Date.parse("2026-07-09T12:03:00.000Z"))).toBe(
			"2026-07-09T12:03:00.000Z",
		);
	});
});
