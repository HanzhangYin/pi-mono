import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCoMathSource } from "../src/modes/comath/comath-source.ts";
import { buildCoMathSourceIndex, discardStagedCoMathSourceIndex } from "../src/modes/comath/comath-source-index.ts";
import { createCoMathSourceSnapshot } from "../src/modes/comath/comath-source-snapshot.ts";
import { parseTaskClaims, validateTaskClaims } from "../src/modes/comath/comath-task-claims.ts";
import {
	addCoMathSourceIndex,
	addLiteratureSourceArtifact,
	createEmptyProjectState,
} from "../src/modes/comath/storage.ts";

describe("co-math task claims", () => {
	it("grounds an external metadata claim only against a selected provider record", async () => {
		const state = createEmptyProjectState({
			projectId: "external-claim",
			title: "External claim",
			rootQuestion: "Find later work.",
			now: "2026-07-13T00:00:00.000Z",
		});
		const claims = await validateTaskClaims(
			state,
			parseTaskClaims(
				"## Claims\n- [source-backed] The Crossref abstract says that this paper proves the minimality conjecture. [doi:10.1112/jlms.12832]\n",
			),
			{
				sources: [
					{
						title: "Presenting the cohomology of a Schubert variety: Proof of the minimality conjecture",
						provider: "crossref",
						doi: "10.1112/jlms.12832",
						summary: "We prove the minimality conjecture.",
					},
				],
				providers: [],
				queries: [],
				candidateCount: 1,
			},
		);
		expect(claims).toMatchObject([
			{
				status: "validated",
				sourceIds: ["literature-candidate-1"],
				groundings: [
					{
						locator: { kind: "external-record", provider: "crossref", doi: "10.1112/jlms.12832" },
						canonicalCitation: "[doi:10.1112/jlms.12832]",
					},
				],
			},
		]);
	});

	it("grounds multiple disjoint line ranges from one external full-text citation", async () => {
		const state = createEmptyProjectState({
			projectId: "external-multi-range",
			title: "External multi-range claim",
			rootQuestion: "Combine a definition and theorem statement.",
			now: "2026-07-13T00:00:00.000Z",
		});
		const claims = await validateTaskClaims(
			state,
			parseTaskClaims(
				"## Claims\n- [source-backed] The definition on line 1 and theorem on line 3 establish the result. [doi:10.1000/example, lines 1-1; lines 3-3]\n",
			),
			{
				sources: [
					{
						title: "Definition and theorem",
						provider: "crossref",
						doi: "10.1000/example",
						summary: "Definition and theorem.",
						extractedText: "1: Definition.\n2: Context.\n3: Theorem.\n4: Proof.",
						sourceFileSha256: "a".repeat(64),
					},
				],
				providers: [],
				queries: [],
				candidateCount: 1,
			},
		);

		expect(claims[0]).toMatchObject({
			status: "validated",
			groundings: [
				{ canonicalCitation: "[doi:10.1000/example, lines 1-1]", excerpt: "1: Definition." },
				{ canonicalCitation: "[doi:10.1000/example, lines 3-3]", excerpt: "3: Theorem." },
			],
		});
	});

	it("passes proof claims to mathematical review instead of rejecting their classification", async () => {
		const state = createEmptyProjectState({
			projectId: "proof-claim",
			title: "Proof claim",
			rootQuestion: "Prove a lemma.",
			now: "2026-07-13T00:00:00.000Z",
		});
		const claims = await validateTaskClaims(
			state,
			parseTaskClaims("## Claims\n- [proved] The displayed induction establishes the graded lemma.\n"),
		);
		expect(claims).toMatchObject([
			{
				classification: "proved",
				status: "unsupported",
				validationFailures: [],
			},
		]);
	});

	it("allows a comparison claim to carry independently scoped primary and summary groundings", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-task-claims-"));
		let stagedIndex: Awaited<ReturnType<typeof buildCoMathSourceIndex>> | undefined;
		try {
			const sourceRoot = join(dir, "source");
			await mkdir(sourceRoot);
			await writeFile(
				join(sourceRoot, "paper.tex"),
				"\\documentclass{article}\n\\begin{document}\nPrimary statement.\n\\end{document}\n",
				"utf8",
			);
			await writeFile(join(sourceRoot, "summary.md"), "Summary agrees with the primary statement.\n", "utf8");
			const source = await resolveCoMathSource(sourceRoot, dir);
			if (!source) throw new Error("Expected the source directory to resolve.");
			const snapshot = await createCoMathSourceSnapshot(source, join(dir, ".pi", "co-math", "state.json"));
			stagedIndex = await buildCoMathSourceIndex(snapshot);
			const tex = stagedIndex.index.files.find((file) => file.relativePath === "paper.tex");
			const summary = stagedIndex.index.files.find((file) => file.relativePath === "summary.md");
			if (!tex || !summary) throw new Error("Expected both indexed sources.");

			let state = createEmptyProjectState({
				projectId: "mixed-scope-claim",
				title: "Mixed scope claim",
				rootQuestion: "Compare the sources.",
				now: "2026-07-13T00:00:00.000Z",
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
			for (const input of [
				{
					id: "source-6",
					title: "paper.tex",
					path: "paper.tex",
					sha256: tex.sha256,
					role: "primary-text" as const,
				},
				{
					id: "source-5",
					title: "summary.md",
					path: "summary.md",
					sha256: summary.sha256,
					role: "curated-summary" as const,
				},
			]) {
				state = addLiteratureSourceArtifact(state, {
					id: input.id,
					kind: "local-file",
					title: input.title,
					provider: "workspace",
					summary: "Indexed source.",
					workspaceRole: input.role,
					citationEligibility: "citable",
					sourceIndexId: "source-index-1",
					sourceRevisionId: snapshot.revisionId,
					sourceRelativePath: input.path,
					sourceFileSha256: input.sha256,
					now: state.updatedAt,
					actor: "system",
				});
			}

			const claims = await validateTaskClaims(
				state,
				parseTaskClaims(
					"## Claims\n- [source-backed] The summary agrees with the primary statement. [source-6, lines 1-1] [source-6, lines 3-3] [source-5, lines 1-1]\n",
				),
			);

			expect(claims[0]).toMatchObject({ status: "validated", sourceIds: ["source-6", "source-5"] });
			expect(claims[0]?.sourceScope).toBeUndefined();
			expect(claims[0]?.groundings.map((grounding) => grounding.regionKind)).toEqual([
				"formal-document",
				"ordinary-document",
			]);
			expect(claims[0]?.validationFailures).toEqual([
				expect.objectContaining({ code: "non-evidence-region", sourceId: "source-6" }),
			]);
		} finally {
			if (stagedIndex) await discardStagedCoMathSourceIndex(stagedIndex);
			await rm(dir, { recursive: true, force: true });
		}
	});
});
