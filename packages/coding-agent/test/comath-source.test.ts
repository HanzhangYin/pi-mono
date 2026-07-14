import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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

	it("builds a deterministic bounded manifest for a directory", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-source-"));
		try {
			await mkdir(join(dir, "source", "nested"), { recursive: true });
			await mkdir(join(dir, "source", "node_modules", "dependency"), { recursive: true });
			await writeFile(join(dir, "source", "conjectures.md"), "Conjecture A", "utf8");
			await writeFile(join(dir, "source", "nested", "proof.tex"), "\\begin{proof}...", "utf8");
			await writeFile(join(dir, "source", "image.png"), Buffer.from([0, 1, 2, 3]));
			await writeFile(join(dir, "source", "node_modules", "dependency", "notes.md"), "ignored", "utf8");
			await symlink(join(dir, "source", "conjectures.md"), join(dir, "source", "linked.md"));

			const source = await resolveCoMathSource("source", dir);

			expect(source).toMatchObject({
				exists: true,
				isFile: false,
				isDirectory: true,
				truncated: false,
			});
			expect(source?.files?.map((file) => file.relativePath)).toEqual(["conjectures.md", "nested/proof.tex"]);
			expect(source?.files?.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
			expect(source?.skippedEntries).toEqual(
				expect.arrayContaining([
					{ relativePath: "image.png", reason: "binary-or-unsupported" },
					{ relativePath: "linked.md", reason: "symlink" },
					{ relativePath: "node_modules", reason: "ignored-directory" },
				]),
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("records truncation when directory limits exclude readable files", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-source-"));
		try {
			await mkdir(join(dir, "source"));
			await writeFile(join(dir, "source", "a.md"), "a", "utf8");
			await writeFile(join(dir, "source", "b.md"), "b", "utf8");

			const source = await resolveCoMathSource("source", dir, { limits: { maxFiles: 1 } });

			expect(source?.files?.map((file) => file.relativePath)).toEqual(["a.md"]);
			expect(source?.truncated).toBe(true);
			expect(source?.skippedEntries).toContainEqual({ relativePath: "b.md", reason: "file-count-limit" });
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("rejects symlink roots and empty source directories", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-source-"));
		try {
			await mkdir(join(dir, "empty"));
			await symlink(join(dir, "empty"), join(dir, "linked"));

			const empty = await resolveCoMathSource("empty", dir);
			const linked = await resolveCoMathSource("linked", dir);

			expect(empty?.isDirectory).toBe(true);
			expect(empty?.files).toEqual([]);
			expect(empty?.missingReason).toContain("No readable source files");
			expect(linked).toMatchObject({ exists: true, isFile: false, isDirectory: false });
			expect(linked?.missingReason).toContain("symlink");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
