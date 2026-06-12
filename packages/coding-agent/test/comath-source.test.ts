import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCoMathSource } from "../src/modes/comath/comath-source.ts";

describe("co-math source resolution", () => {
	it("resolves an existing relative source file", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-source-"));
		try {
			await writeFile(join(dir, "paper.pdf"), "pdf", "utf8");

			const source = await resolveCoMathSource("paper.pdf", dir);

			expect(source).toMatchObject({
				input: "paper.pdf",
				absolutePath: join(dir, "paper.pdf"),
				displayName: "paper.pdf",
				exists: true,
				isFile: true,
			});
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("returns a warning-ready source for a missing path", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-source-"));
		try {
			const source = await resolveCoMathSource("missing.pdf", dir);

			expect(source).toMatchObject({
				input: "missing.pdf",
				absolutePath: join(dir, "missing.pdf"),
				displayName: "missing.pdf",
				exists: false,
				isFile: false,
			});
			expect(source?.missingReason).toContain("Source path is not readable");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
