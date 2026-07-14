import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCoMathSource } from "../src/modes/comath/comath-source.ts";
import {
	buildCoMathSourceIndex,
	discardStagedCoMathSourceIndex,
	resolveIndexedSourceLines,
	sourceClaimScopeForRegion,
} from "../src/modes/comath/comath-source-index.ts";
import { createCoMathSourceSnapshot } from "../src/modes/comath/comath-source-snapshot.ts";

describe("co-math source index", () => {
	it("indexes formal TeX, supplemental material, and exact line excerpts", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-source-index-"));
		try {
			const sourcePath = join(dir, "paper.tex");
			await writeFile(
				sourcePath,
				[
					"\\documentclass{article}",
					"\\newtheorem{conjecture}{Conjecture}",
					"\\begin{document}",
					"\\begin{conjecture}",
					"Formal statement.",
					"\\end{conjecture}",
					"\\end{document}",
					"\\begin{conjecture}",
					"Supplemental statement.",
					"\\end{conjecture}",
				].join("\n"),
				"utf8",
			);
			const source = await resolveCoMathSource(sourcePath, dir);
			if (!source) throw new Error("Expected source.");
			const snapshot = await createCoMathSourceSnapshot(source, join(dir, ".pi", "co-math", "state.json"));
			const staged = await buildCoMathSourceIndex(snapshot);
			const file = staged.index.files[0];
			expect(file?.lineCount).toBe(10);
			expect(file?.regions).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ kind: "formal-document", lines: { start: 3, end: 7 } }),
					expect.objectContaining({ kind: "supplemental-after-end", lines: { start: 8, end: 10 } }),
				]),
			);
			const formal = await resolveIndexedSourceLines(staged.index, "paper.tex", { start: 4, end: 6 });
			expect(formal.regionKind).toBe("formal-document");
			expect(formal.excerpt).toContain("4: \\begin{conjecture}");
			const supplemental = await resolveIndexedSourceLines(staged.index, "paper.tex", { start: 8, end: 10 });
			expect(sourceClaimScopeForRegion(supplemental.regionKind)).toBe("supplemental");
			await expect(resolveIndexedSourceLines(staged.index, "paper.tex", { start: 7, end: 8 })).rejects.toThrow(
				"crosses an indexed document boundary",
			);
			await discardStagedCoMathSourceIndex(staged);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("classifies included files and records rejected include paths", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-source-index-"));
		try {
			await mkdir(join(dir, "source"));
			await writeFile(
				join(dir, "source", "main.tex"),
				"\\documentclass{article}\n\\begin{document}\n\\input{body}\n\\end{document}\n",
				"utf8",
			);
			await writeFile(join(dir, "source", "body.tex"), "\\section{Body}\nText.\n", "utf8");
			const source = await resolveCoMathSource(join(dir, "source"), dir);
			if (!source) throw new Error("Expected source.");
			const snapshot = await createCoMathSourceSnapshot(source, join(dir, ".pi", "co-math", "state.json"));
			const staged = await buildCoMathSourceIndex(snapshot);
			expect(staged.index.documents[0]?.includedRelativePaths).toEqual(["body.tex"]);
			expect(staged.index.files.find((file) => file.relativePath === "body.tex")?.regions[0]?.kind).toBe(
				"included-formal-document",
			);
			await discardStagedCoMathSourceIndex(staged);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
