import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCoMathSource } from "../src/modes/comath/comath-source.ts";
import { createCoMathSourceSnapshot } from "../src/modes/comath/comath-source-snapshot.ts";

describe("co-math source snapshots", () => {
	it("publishes an immutable content-addressed directory snapshot", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-source-snapshot-"));
		try {
			const sourceRoot = join(dir, "source");
			await mkdir(join(sourceRoot, "nested"), { recursive: true });
			await writeFile(join(sourceRoot, "problem.md"), "Original problem", "utf8");
			await writeFile(join(sourceRoot, "nested", "proof.tex"), "Original proof", "utf8");
			const source = await resolveCoMathSource(sourceRoot, dir);
			if (!source) throw new Error("Expected resolved source.");

			const snapshot = await createCoMathSourceSnapshot(source, join(dir, ".pi", "co-math", "state.json"));
			await writeFile(join(sourceRoot, "problem.md"), "Changed later", "utf8");

			expect(snapshot.files.map((file) => file.relativePath)).toEqual(["nested/proof.tex", "problem.md"]);
			expect(await readFile(snapshot.files[1]?.snapshotAbsolutePath ?? "", "utf8")).toBe("Original problem");
			const manifest = JSON.parse(await readFile(snapshot.manifestAbsolutePath, "utf8")) as {
				manifestSha256: string;
				revisionId: string;
				files: Array<{ relativePath: string; sha256: string }>;
			};
			expect(manifest.manifestSha256).toBe(snapshot.manifestSha256);
			expect(manifest.revisionId).toBe(snapshot.revisionId);
			expect(manifest.files).toHaveLength(2);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("aborts if a source changes after discovery", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-source-snapshot-"));
		try {
			const sourcePath = join(dir, "problem.md");
			await writeFile(sourcePath, "First revision", "utf8");
			const source = await resolveCoMathSource(sourcePath, dir);
			if (!source) throw new Error("Expected resolved source.");
			await writeFile(sourcePath, "Second revision", "utf8");

			await expect(createCoMathSourceSnapshot(source, join(dir, ".pi", "co-math", "state.json"))).rejects.toThrow(
				"Source changed while it was being captured",
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("refuses to reuse a corrupted content-addressed snapshot", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-source-snapshot-"));
		try {
			const sourcePath = join(dir, "problem.md");
			const statePath = join(dir, ".pi", "co-math", "state.json");
			await writeFile(sourcePath, "Stable source", "utf8");
			const source = await resolveCoMathSource(sourcePath, dir);
			if (!source) throw new Error("Expected resolved source.");
			const snapshot = await createCoMathSourceSnapshot(source, statePath);
			await writeFile(snapshot.files[0]?.snapshotAbsolutePath ?? "", "Tampered snapshot", "utf8");

			await expect(createCoMathSourceSnapshot(source, statePath)).rejects.toThrow(
				"Existing source snapshot is corrupt",
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
