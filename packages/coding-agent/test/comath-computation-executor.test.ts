import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultComputationalExecutor } from "../src/modes/comath/comath-computation-executor.ts";
import { buildMathPrimitiveDraft } from "../src/modes/comath/comath-math-primitives.ts";

const tempDirs: string[] = [];

afterEach(async () => {
	delete process.env.COMATH_SANDBOX_SECRET;
	await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("default computational executor sandbox", () => {
	it("runs ordinary mathematics with a scrubbed environment and no access outside the work directory", async () => {
		const parent = await mkdtemp(path.join(tmpdir(), "pi-comath-sandbox-"));
		tempDirs.push(parent);
		const workingDirectory = path.join(parent, "work");
		const secretPath = path.join(parent, "secret.txt");
		await writeFile(secretPath, "host-secret", "utf8");
		process.env.COMATH_SANDBOX_SECRET = "host-environment-secret";
		const executor = createDefaultComputationalExecutor();

		const result = await executor.runScript(
			{
				fileName: "check.py",
				language: "python",
				content: [
					"import os",
					"print('sum', sum(k * k for k in range(5)))",
					`try:\n    open(${JSON.stringify(secretPath)}, 'r').read()\n    print('outside_file', 'visible')\nexcept Exception:\n    print('outside_file', 'blocked')`,
					"print('secret_env', 'visible' if os.environ.get('COMATH_SANDBOX_SECRET') else 'blocked')",
				].join("\n"),
				summary: "Exercise the isolated Python runtime.",
			},
			{
				rootQuestion: "Can a bounded calculation be isolated?",
				pathTitle: "Computation",
				pathObjective: "Run an ordinary finite calculation.",
				workingDirectory,
				maxRuntimeMs: 10_000,
			},
		);

		if (result.exitCode !== 0) {
			throw new Error(JSON.stringify(result));
		}
		expect(result.stdout).toContain("sum 30");
		expect(result.stdout).toContain("outside_file blocked");
		expect(result.stdout).toContain("secret_env blocked");
		expect(result.command).toMatch(/^(?:sandbox-exec|bwrap) /);
	});

	it("retains complete per-script output files while bounding result previews", async () => {
		const workingDirectory = await mkdtemp(path.join(tmpdir(), "pi-comath-output-"));
		tempDirs.push(workingDirectory);
		const executor = createDefaultComputationalExecutor({ maxOutputCharacters: 64 });

		const result = await executor.runScript(
			{
				fileName: "large-certificate.py",
				language: "python",
				content: "import sys\nprint('o' * 1000)\nprint('e' * 1000, file=sys.stderr)",
				summary: "Emit a certificate larger than the model-facing preview.",
			},
			{
				rootQuestion: "Can a large exact certificate be retained?",
				pathTitle: "Computation",
				pathObjective: "Retain complete output without expanding model context.",
				workingDirectory,
				maxRuntimeMs: 10_000,
			},
		);

		expect(result.stdout).toHaveLength(64);
		expect(result.stdout).toMatch(/\.\.\.$/);
		expect(result.stderr).toHaveLength(64);
		expect(result.stderr).toMatch(/\.\.\.$/);
		expect(result.stdoutFileName).toMatch(/^large-certificate\.[a-f0-9]{12}\.stdout\.txt$/);
		expect(result.stderrFileName).toBe(result.stdoutFileName?.replace(".stdout.txt", ".stderr.txt"));
		expect(await readFile(path.join(workingDirectory, result.stdoutFileName!), "utf8")).toBe(`${"o".repeat(1000)}\n`);
		expect(await readFile(path.join(workingDirectory, result.stderrFileName!), "utf8")).toBe(`${"e".repeat(1000)}\n`);
	});

	it("runs exact matrix and partition-Pieri primitives without model-authored scripts", async () => {
		const workingDirectory = await mkdtemp(path.join(tmpdir(), "pi-comath-primitives-"));
		tempDirs.push(workingDirectory);
		const executor = createDefaultComputationalExecutor();
		const request = {
			rootQuestion: "Produce exact finite mathematical certificates.",
			pathTitle: "Primitive checks",
			pathObjective: "Check integer invariants and Pieri rows.",
			workingDirectory,
			maxRuntimeMs: 10_000,
		};

		const matrixResult = await executor.runScript(
			buildMathPrimitiveDraft("integer-matrix", {
				matrix: [
					[2, 4],
					[1, 3],
				],
			}),
			request,
		);
		expect(matrixResult.exitCode).toBe(0);
		expect(JSON.parse(matrixResult.stdout)).toMatchObject({
			primitive: "integer-matrix",
			rank: 2,
			determinant: 2,
			determinantalDivisors: [1, 2],
			smithDiagonal: [1, 2],
		});

		const pieriResult = await executor.runScript(
			buildMathPrimitiveDraft("partition-pieri", {
				lower: [2, 2, 0],
				upper: [3, 3, 3],
				degree: 7,
				hDegrees: [1],
			}),
			request,
		);
		expect(pieriResult.exitCode).toBe(0);
		expect(JSON.parse(pieriResult.stdout)).toMatchObject({
			primitive: "partition-pieri",
			columns: [
				[3, 3, 1],
				[3, 2, 2],
			],
			matrixShape: [3, 2],
			rank: 2,
			smithDiagonal: [1, 1],
			quotientFreeRank: 0,
			saturatedFullColumnRank: true,
		});

		const witnessedPieriResult = await executor.runScript(
			buildMathPrimitiveDraft("partition-pieri", {
				lower: [2, 2, 0],
				upper: [3, 3, 3],
				degrees: [4, 7],
				hDegrees: [1],
				requireSmithWitnesses: true,
			}),
			request,
		);
		expect(witnessedPieriResult.exitCode).toBe(0);
		const witnessedPieri = JSON.parse(witnessedPieriResult.stdout);
		expect(witnessedPieri.degreeResults[0]).toMatchObject({
			degree: 4,
			MShape: [0, 1],
			DShape: [0, 1],
			UShape: [0, 0],
			VShape: [1, 1],
			V: [[1]],
			operationLog: [],
			checks: {
				UMVEqualsD: true,
				replayEqualsTracked: true,
				unimodularU: true,
				unimodularV: true,
			},
		});
		expect(witnessedPieri.degreeResults[1]).toMatchObject({
			degree: 7,
			MShape: [3, 2],
			DShape: [3, 2],
			smithDiagonal: [1, 1],
			checks: {
				UMVEqualsD: true,
				replayEqualsTracked: true,
				diagonal: true,
				smithPositivityDivisibility: true,
				unimodularU: true,
				unimodularV: true,
			},
		});
		expect(witnessedPieri.degreeResults[1].operationLog.length).toBeGreaterThan(0);

		const wideDegreeResult = await executor.runScript(
			buildMathPrimitiveDraft("partition-pieri", {
				lower: [0],
				upper: [32],
				degrees: Array.from({ length: 33 }, (_, index) => index),
				hDegrees: [1],
				requireSmithWitnesses: true,
			}),
			request,
		);
		expect(wideDegreeResult.exitCode).toBe(0);
		expect(JSON.parse(wideDegreeResult.stdout).degreeResults).toHaveLength(33);

		const multiDegreeResult = await executor.runScript(
			buildMathPrimitiveDraft("partition-pieri", {
				lower: [2, 2, 0],
				upper: [3, 3, 3],
				degrees: [6, 7],
				hDegrees: [1],
			}),
			request,
		);
		expect(multiDegreeResult.exitCode).toBe(0);
		expect(JSON.parse(multiDegreeResult.stdout)).toMatchObject({
			primitive: "partition-pieri",
			degreeResults: [{ degree: 6 }, { degree: 7 }],
		});

		const interiorResult = await executor.runScript(
			buildMathPrimitiveDraft("partition-pieri", {
				lower: [2, 2, 0, 0],
				upper: [4, 4, 4, 4],
				degrees: Array.from({ length: 13 }, (_, index) => index + 4),
				hDegrees: [1, 2, 3, 4],
			}),
			request,
		);
		expect(interiorResult.exitCode).toBe(0);
		expect(JSON.parse(interiorResult.stdout).degreeResults).toHaveLength(13);

		const asymmetricInteriorResult = await executor.runScript(
			buildMathPrimitiveDraft("partition-pieri", {
				lower: [2, 2, 0, 0, 0],
				upper: [4, 4, 4, 4, 4],
				degrees: Array.from({ length: 17 }, (_, index) => index + 4),
				hDegrees: [1, 2, 3, 4],
			}),
			request,
		);
		expect(asymmetricInteriorResult.exitCode).toBe(0);
		const asymmetricInterior = JSON.parse(
			await readFile(path.join(workingDirectory, asymmetricInteriorResult.stdoutFileName!), "utf8"),
		);
		expect(asymmetricInterior.degreeResults).toHaveLength(17);
		expect(asymmetricInterior.certificateSummary).toMatchObject({
			supportDegreeRange: [4, 20],
			enumeratedAllSupportDegrees: true,
			vanishesOutsideSupportDegreeRange: true,
			completeSourceRowsIncluded: true,
		});
		expect(asymmetricInterior.certificateSummary.degreeSummaries).toHaveLength(17);
		expect(asymmetricInterior.certificateSummary.zeroRows).toContainEqual({
			degree: 20,
			hDegree: 2,
			source: [4, 4, 4, 3, 3],
		});
		expect(
			asymmetricInterior.degreeResults.find((result: { degree: number }) => result.degree === 20)?.rows,
		).toContainEqual({
			hDegree: 2,
			source: [4, 4, 4, 3, 3],
			coefficients: [0],
		});
	});
});
