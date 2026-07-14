import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCoMathSource } from "../src/modes/comath/comath-source.ts";
import { formatCoMathSourceContextIndex, loadCoMathSourceContext } from "../src/modes/comath/comath-source-context.ts";
import { buildCoMathSourceIndex, discardStagedCoMathSourceIndex } from "../src/modes/comath/comath-source-index.ts";
import { createCoMathSourceSnapshot } from "../src/modes/comath/comath-source-snapshot.ts";
import { inspectTaskSourceLines, prepareTaskSourceContext } from "../src/modes/comath/comath-task-source-context.ts";
import {
	addCoMathSourceIndex,
	addLiteratureSourceArtifact,
	addResearchPath,
	addResearchPlan,
	addResearchPlanTask,
	createEmptyProjectState,
} from "../src/modes/comath/storage.ts";

describe("co-math source context", () => {
	it("prioritizes likely statements and bounds untrusted text from an immutable snapshot", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-source-context-"));
		try {
			const sourceRoot = join(dir, "source");
			await mkdir(sourceRoot);
			await writeFile(
				join(sourceRoot, "problem.md"),
				"# Problem\nDetermine whether property P is invariant.",
				"utf8",
			);
			await writeFile(join(sourceRoot, "notes.txt"), "0123456789\n".repeat(2_000), "utf8");
			await writeFile(join(sourceRoot, "paper.pdf"), "%PDF-1.4 fake binary payload", "utf8");
			const source = await resolveCoMathSource(sourceRoot, dir);
			if (!source) {
				throw new Error("Expected the source directory to resolve.");
			}
			const snapshot = await createCoMathSourceSnapshot(source, join(dir, ".pi", "co-math", "state.json"));
			const stagedIndex = await buildCoMathSourceIndex(snapshot);

			const materials = await loadCoMathSourceContext(snapshot, stagedIndex.index, {
				maxExcerptCharactersPerFile: 180,
				maxTotalExcerptCharacters: 320,
			});

			expect(materials.map((material) => material.relativePath)).toEqual(["problem.md", "notes.txt", "paper.pdf"]);
			expect(materials[0]?.spans[0]?.excerpt).toContain("1: # Problem");
			expect(materials[0]?.spans[0]?.excerpt).toContain("Determine whether property P is invariant.");
			expect(materials[1]?.spans[0]?.excerpt).toContain("1: 0123456789");
			expect(materials[1]?.excerptTruncated).toBe(true);
			expect(materials[2]?.spans).toEqual([]);
			expect(
				materials.reduce(
					(total, material) => total + material.spans.reduce((sum, span) => sum + span.excerpt.length, 0),
					0,
				),
			).toBeLessThanOrEqual(320);
			const index = formatCoMathSourceContextIndex(snapshot, stagedIndex.index, materials);
			expect(index).toContain(snapshot.revisionId);
			expect(index).toContain("problem.md | SHA-256");
			expect(index).toContain("notes.txt | SHA-256");
			expect(index).toContain("paper.pdf | SHA-256");
			await discardStagedCoMathSourceIndex(stagedIndex);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("reserves the total budget for mandatory ranges before generic files", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-source-reservations-"));
		try {
			const sourceRoot = join(dir, "source");
			await mkdir(sourceRoot);
			await writeFile(join(sourceRoot, "README.md"), "General introduction material.\n".repeat(300), "utf8");
			await writeFile(join(sourceRoot, "guide.md"), "Required guide statement.\n".repeat(80), "utf8");
			const tex = [
				"\\documentclass{article}",
				"\\begin{document}",
				...Array.from({ length: 900 }, (_, index) => `Required theorem detail ${index + 1}.`),
				"\\end{document}",
			];
			await writeFile(join(sourceRoot, "paper.tex"), `${tex.join("\n")}\n`, "utf8");
			const source = await resolveCoMathSource(sourceRoot, dir);
			if (!source) throw new Error("Expected the source directory to resolve.");
			const snapshot = await createCoMathSourceSnapshot(source, join(dir, ".pi", "co-math", "state.json"));
			const stagedIndex = await buildCoMathSourceIndex(snapshot);

			const materials = await loadCoMathSourceContext(snapshot, stagedIndex.index, {
				maxExcerptCharactersPerFile: 8_000,
				maxTotalExcerptCharacters: 10_000,
				mandatoryRangesByPath: new Map([
					["guide.md", [{ start: 1, end: 50 }]],
					["paper.tex", [{ start: 650, end: 850 }]],
				]),
			});

			expect(materials.find((material) => material.relativePath === "guide.md")?.spans).toEqual(
				expect.arrayContaining([expect.objectContaining({ lines: { start: 1, end: 50 } })]),
			);
			expect(materials.find((material) => material.relativePath === "paper.tex")?.spans).toEqual(
				expect.arrayContaining([expect.objectContaining({ lines: { start: 650, end: 850 } })]),
			);
			await discardStagedCoMathSourceIndex(stagedIndex);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("gives a primary TeX file discretionary context after its mandatory ranges", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-source-primary-budget-"));
		try {
			const sourceRoot = join(dir, "source");
			await mkdir(sourceRoot);
			await writeFile(join(sourceRoot, "conjectures.md"), "Summary claim.\n".repeat(800), "utf8");
			const body = Array.from({ length: 2_000 }, (_, index) => `Generic source line ${index + 1}.`);
			body[0] = "\\documentclass{article}";
			body[1] = "\\begin{document}";
			body[375] = "Define J_v as the primary ideal.";
			body[1999] = "\\end{document}";
			await writeFile(join(sourceRoot, "paper.tex"), `${body.join("\n")}\n`, "utf8");
			const source = await resolveCoMathSource(sourceRoot, dir);
			if (!source) throw new Error("Expected the source directory to resolve.");
			const snapshot = await createCoMathSourceSnapshot(source, join(dir, ".pi", "co-math", "state.json"));
			const stagedIndex = await buildCoMathSourceIndex(snapshot);

			const materials = await loadCoMathSourceContext(snapshot, stagedIndex.index, {
				maxExcerptCharactersPerFile: 24_000,
				maxTotalExcerptCharacters: 32_000,
				queryTerms: ["J_v"],
				mandatoryRangesByPath: new Map([
					[
						"paper.tex",
						[
							{ start: 1_200, end: 1_421 },
							{ start: 1_489, end: 1_552 },
							{ start: 1_897, end: 1_935 },
						],
					],
				]),
			});

			const primary = materials.find((material) => material.relativePath === "paper.tex");
			expect(materials[0]?.relativePath).toBe("paper.tex");
			expect(primary?.spans.some((span) => span.lines.start <= 376 && span.lines.end >= 376)).toBe(true);
			expect(primary?.spans).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ lines: { start: 1_200, end: 1_421 } }),
					expect.objectContaining({ lines: { start: 1_489, end: 1_552 } }),
					expect.objectContaining({ lines: { start: 1_897, end: 1_935 } }),
				]),
			);
			await discardStagedCoMathSourceIndex(stagedIndex);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("reserves only structured task ranges and records requested and delivered spans", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-task-source-context-"));
		try {
			const sourceRoot = join(dir, "source");
			await mkdir(sourceRoot);
			const body = Array.from({ length: 2_000 }, (_, index) => `Statement material ${index + 1}.`);
			body[0] = "\\documentclass{article}";
			body[1] = "\\begin{document}";
			body[375] = "Define J_v as the span of the indexed Schubert classes.";
			body[972] = "The admissible permutation v_{r,s,t,n} has these parameters.";
			body[1999] = "\\end{document}";
			await writeFile(join(sourceRoot, "paper.tex"), `${body.join("\n")}\n`, "utf8");
			const source = await resolveCoMathSource(sourceRoot, dir);
			if (!source) throw new Error("Expected the source directory to resolve.");
			const statePath = join(dir, ".pi", "co-math", "state.json");
			const snapshot = await createCoMathSourceSnapshot(source, statePath);
			const stagedIndex = await buildCoMathSourceIndex(snapshot);
			const indexedFile = stagedIndex.index.files.find((file) => file.relativePath === "paper.tex");
			if (!indexedFile) throw new Error("Expected indexed TeX.");

			let state = createEmptyProjectState({
				projectId: "structured-source-context",
				title: "Structured source context",
				rootQuestion: "Extract the statements.",
				now: "2026-07-13T00:00:00.000Z",
			});
			state = addResearchPath(state, {
				id: "path-1",
				title: "Sources",
				objective: "Inspect the primary source.",
				suggestedNextMove: "Read exact lines.",
				priority: 1,
				now: state.updatedAt,
				actor: "human",
			});
			state = addLiteratureSourceArtifact(state, {
				id: "source-6",
				kind: "local-file",
				title: "paper.tex",
				provider: "workspace",
				summary: "Primary indexed TeX.",
				workspaceRole: "primary-text",
				citationEligibility: "citable",
				sourceIndexId: "source-index-1",
				sourceRevisionId: snapshot.revisionId,
				sourceRelativePath: "paper.tex",
				sourceFileSha256: indexedFile.sha256,
				now: state.updatedAt,
				actor: "system",
			});
			state = addCoMathSourceIndex(state, {
				id: "source-index-1",
				sourceId: snapshot.sourceId,
				sourceRevisionId: snapshot.revisionId,
				sourceManifestSha256: snapshot.manifestSha256,
				indexArtifactId: stagedIndex.index.indexSha256,
				indexPath: join(stagedIndex.stagingPath, "index.json"),
				indexSha256: stagedIndex.index.indexSha256,
				policyVersion: stagedIndex.index.policyVersion,
				status: "ready",
				fileCount: stagedIndex.index.files.length,
				documentCount: stagedIndex.index.documents.length,
				now: state.updatedAt,
				actor: "system",
			});
			state = addResearchPlan(state, {
				id: "plan-1",
				title: "Plan",
				objective: "Inspect exact statements.",
				now: state.updatedAt,
				actor: "human",
			});
			state = addResearchPlanTask(state, {
				id: "task-1",
				planId: "plan-1",
				kind: "source-refresh",
				title: "Inspect exact statements",
				description: "Inspect especially lines 1380–1421, 1489–1552, and 1897–1935.",
				acceptanceCriteria: ["Extract the exact definition of J_v from the primary source."],
				pathId: "path-1",
				sourceRequests: [
					{
						sourceId: "source-6",
						ranges: [
							{ start: 1380, end: 1421 },
							{ start: 1489, end: 1552 },
							{ start: 1897, end: 1935 },
						],
					},
				],
				now: state.updatedAt,
				actor: "human",
			});
			const task = state.researchPlanTasks[0];
			if (!task) throw new Error("Expected a task.");

			const prepared = await prepareTaskSourceContext(
				state,
				task,
				"attempt-1",
				state.updatedAt,
				join(dir, ".pi", "co-math", "artifacts"),
				[],
				["The reviewer requires the admissibility constraints for v_{r,s,t,n}."],
			);

			expect(prepared.catalog.requested).toEqual(task.sourceRequests);
			expect(prepared.catalog.delivered[0]?.ranges).toEqual(
				expect.arrayContaining([
					{ start: 1380, end: 1421 },
					{ start: 1489, end: 1552 },
					{ start: 1897, end: 1935 },
				]),
			);
			const context = prepared.contexts.get("source-6")?.context ?? "";
			expect(context).toContain("LINES 1380-1421");
			expect(context).toContain("LINES 1489-1552");
			expect(context).toContain("LINES 1897-1935");
			expect(context).toContain("376: Define J_v as the span of the indexed Schubert classes.");
			expect(context).toContain("973: The admissible permutation v_{r,s,t,n} has these parameters.");
			expect(prepared.catalog.priorReviewerFeedback).toEqual([
				"The reviewer requires the admissibility constraints for v_{r,s,t,n}.",
			]);
			expect(prepared.preparedArtifact.id).toBe(prepared.preparedArtifact.sha256);
			const inspected = await inspectTaskSourceLines(state, "source-6", { start: 1517, end: 1520 });
			expect(inspected).toContain("LINES 1517-1520");
			expect(inspected).toContain("REGION formal-document");
			expect(inspected).toContain("1517: Statement material 1517.");
			await expect(inspectTaskSourceLines(state, "source-6", { start: 1, end: 201 })).rejects.toThrow(
				"limited to 200 lines",
			);

			await discardStagedCoMathSourceIndex(stagedIndex);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
