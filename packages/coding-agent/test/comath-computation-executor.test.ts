import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultComputationalExecutor } from "../src/modes/comath/comath-computation-executor.ts";

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
});
