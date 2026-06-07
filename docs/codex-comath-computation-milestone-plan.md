# Co-Math Computation Artifact Milestone Implementation Plan

> For Codex: implement this plan only after the user explicitly asks you to run Codex. Do not broaden scope, do not start unrelated co-math architecture work, and do not commit unless the user explicitly asks.

Goal: Add one narrow co-math command that runs a local foreground computation, verifies one declared output file, hashes that output, and records a provenance-rich `computation` artifact without creating claims, evidence, warnings, proof status changes, or review rounds.

Architecture: Keep this as a thin command-layer integration in `packages/coding-agent/examples/extensions/co-math/commands.ts`, reusing the existing co-math state, artifact registry, workspace path-safety helpers, and audit behavior. Use Node built-ins only. The command should be deterministic at the state/provenance level except for timestamps and elapsed time.

Tech Stack: TypeScript in the coding-agent package, Node built-ins (`node:child_process`, `node:crypto`, `node:fs/promises`, `node:path`, `node:process` if needed), Vitest targeted tests.

Current context:
- Repo: `/home/hermes/developer/pi-mono-comath`
- Branch at plan time: `comath/prototype`
- Reference paper: `docs/2605.06651v2.pdf`
- Validation plan: `docs/co-math-real-validation-plan.md`
- Existing co-math extension docs: `packages/coding-agent/examples/extensions/co-math/README.md`
- Existing command implementation: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Existing schema/state helpers: `packages/coding-agent/examples/extensions/co-math/schema.ts`, `packages/coding-agent/examples/extensions/co-math/storage.ts`
- Existing targeted tests: `packages/coding-agent/test/co-math-extension.test.ts`, `packages/coding-agent/test/co-math-state.test.ts`, `packages/coding-agent/test/co-math-role-runner.test.ts`

Why this milestone:
- Real validation showed manual execution plus `/comath artifact-file` is too weak for computation provenance.
- The next narrow blocker is provenance capture, not broad autonomous co-math orchestration.
- This command should support finite computational validation while preserving uncertainty: computation artifacts are evidence candidates, not proof certificates.

Non-goals:
- Do not implement async/background computation.
- Do not implement arbitrary shell orchestration beyond one foreground command.
- Do not create claims automatically.
- Do not attach evidence automatically.
- Do not resolve warnings automatically.
- Do not promote any claim.
- Do not implement formal proof promotion.
- Do not implement multi-agent coordinator architecture.
- Do not add external dependencies.
- Do not run Codex recursively from inside Codex.

Proposed user command:

```text
/comath computation <command> --out <path> [--title <title>] [--summary <summary>] [--force]
```

Minimum behavior:
1. Require initialized co-math state.
2. Parse a non-empty command string and required `--out <path>`.
3. Resolve `--out` relative to `ctx.cwd`.
4. Reject output paths outside the workspace.
5. Reject output paths equal to `.pi/co-math/state.json`.
6. Reject symlinked output files.
7. Reject symlinked existing parent directories / symlink escapes.
8. Run the command foreground-only with cwd `ctx.cwd`.
9. Capture exit code, signal, elapsed milliseconds, stdout preview, stderr preview.
10. Require exit code 0.
11. Require the declared output file to exist after the command.
12. Require the declared output path to be a regular file, not directory/symlink.
13. Hash the output file with SHA-256 after command success and path validation.
14. Record exactly one `computation` artifact with:
    - `kind: "computation"`
    - `path: <workspace-relative-output-path>`
    - title from `--title` or a sensible default
    - summary from `--summary` or a concise default
    - provenance string containing command, cwd, exit code, elapsed time, output path, sha256, stdout preview, stderr preview
15. Emit a concise success message including artifact id, path, hash, and elapsed time.
16. On failure, do not mutate state.

Suggested command semantics:
- The command string is everything before `--out`.
- Flags may appear after the command in any order.
- `--title` and `--summary` values may be quoted or unquoted if the existing parser supports it; if not, implement a simple tokenizer that supports shell-like single and double quotes.
- Keep the first version simple: do not support pipes specially; the command is executed by a shell so users can run normal shell commands.
- Use a bounded timeout, preferably 60 seconds initially. If the project already has a command execution timeout convention, use that. If adding a constant, name it clearly, e.g. `COMATH_COMPUTATION_TIMEOUT_MS = 60_000`.
- Truncate stdout/stderr previews to a conservative size, e.g. 2,000 characters each. Preserve whether truncation occurred.

Important security/path-safety constraints:
- Reuse existing path helpers where possible:
  - `resolveWorkspaceRelativePath`
  - `checkExistingArtifactFilePath`
  - `checkExportTargetPath`
  - `existingParentSegmentsAreSafe`
  - `isStatePathRelative`
- If the output file may not exist before running, validate the parent path before command execution using export-target-style checks.
- After command execution, validate the final output file using artifact-file-style checks.
- Reject symlinks both before and after execution.
- Do not read arbitrary workspace files except the declared `--out` file for hashing.
- Do not store full stdout/stderr in state; store previews only.

Suggested provenance format:

```text
command: python3 scripts/count_patterns.py --out outputs/counts.tsv
cwd: .
exitCode: 0
signal: none
elapsedMs: 123
outputPath: outputs/counts.tsv
outputSha256: <hex>
stdoutPreview: <first 2000 chars or empty>
stderrPreview: <first 2000 chars or empty>
```

Keep provenance plain text for now because `ArtifactRecord.provenance` is currently a string. Do not change the state schema unless tests force it.

Files likely to change:
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`
- Modify: `packages/coding-agent/test/co-math-extension.test.ts`
- Probably no schema change: `packages/coding-agent/examples/extensions/co-math/schema.ts`
- Probably no storage change: `packages/coding-agent/examples/extensions/co-math/storage.ts`

Verification commands:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

Implementation tasks:

## Task 1: Add failing tests for successful computation artifact recording

Objective: Prove the new command runs a local computation, verifies the output, hashes it, records exactly one computation artifact, and does not create claims/evidence/warnings.

Files:
- Modify: `packages/coding-agent/test/co-math-extension.test.ts`

Add a test near the existing `artifact-file` and `export-paper` tests.

Test shape:

```ts
it("computation runs a foreground command and records hashed output provenance", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-computation-"));
	try {
		await mkdir(join(tempDir, "scripts"), { recursive: true });
		await mkdir(join(tempDir, "outputs"), { recursive: true });
		await writeFile(
			join(tempDir, "scripts/write-output.mjs"),
			[
				"import { writeFile } from 'node:fs/promises';",
				"await writeFile('outputs/result.tsv', 'pattern\\tcount\\n123\\t132\\n', 'utf8');",
				"console.log('wrote counts');",
			].join("\n"),
			"utf8",
		);
		const { commands, notifications } = createCoMathExtensionFixture();
		const command = commands.get("comath");
		expect(command).toBeDefined();
		const ctx = createCommandContext(notifications, tempDir);

		await command?.handler("init Compare finite counts", ctx);
		await command?.handler(
			"computation node scripts/write-output.mjs --out outputs/result.tsv --title Count table --summary Finite count table generated locally",
			ctx,
		);

		const state = await loadProjectState(getDefaultStatePath(tempDir));
		expect(state?.artifacts).toHaveLength(1);
		expect(state?.artifacts[0]).toMatchObject({
			id: "artifact-1",
			kind: "computation",
			path: "outputs/result.tsv",
			title: "Count table",
			summary: "Finite count table generated locally",
		});
		expect(state?.artifacts[0]?.provenance).toContain("command: node scripts/write-output.mjs");
		expect(state?.artifacts[0]?.provenance).toContain("exitCode: 0");
		expect(state?.artifacts[0]?.provenance).toContain("outputPath: outputs/result.tsv");
		expect(state?.artifacts[0]?.provenance).toMatch(/outputSha256: [a-f0-9]{64}/);
		expect(state?.artifacts[0]?.provenance).toContain("stdoutPreview: wrote counts");
		expect(state?.claims).toEqual([]);
		expect(state?.evidence).toEqual([]);
		expect(state?.warnings).toEqual([]);
		expect(notifications.at(-1)).toMatch(/Recorded computation artifact artifact-1/i);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
```

Run expected failing test:

```bash
cd packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts -t "computation runs a foreground command"
```

Expected: FAIL because `/comath computation` does not exist yet.

## Task 2: Add parser and help text for `/comath computation`

Objective: Recognize the new command, require `--out`, and keep bad syntax non-mutating.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Modify: `packages/coding-agent/test/co-math-extension.test.ts`

Command help updates:
- Add to `HELP_TEXT`:

```text
/comath computation <command> --out <path> [--title <title>] [--summary <summary>] - run a local computation and record hashed output provenance
```

Dispatcher update:

```ts
if (subcommand === "computation") {
	await runComputationArtifact(pi, ctx, remainder);
	return;
}
```

Add a parser interface near other parser interfaces:

```ts
interface ParsedComputationCommand {
	command: string;
	outputPath: string;
	title?: string;
	summary?: string;
}
```

Implement `parseComputationText(text: string): ParsedComputationCommand | undefined`.

Recommended parser behavior:
- Tokenize while preserving quoted strings.
- Find `--out`, `--title`, `--summary` flags.
- The computation command is all tokens before the first recognized flag, joined by spaces.
- `--out` is required and must have a following value.
- `--title` and `--summary` are optional and must have following values if present.
- Reject unknown missing flag values.
- Reject empty command.

Add a small test:

```ts
it("computation rejects missing output path without mutating state", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-computation-usage-"));
	try {
		const { commands, notifications } = createCoMathExtensionFixture();
		const command = commands.get("comath");
		expect(command).toBeDefined();
		const ctx = createCommandContext(notifications, tempDir);

		await command?.handler("init Compare finite counts", ctx);
		await command?.handler("computation node scripts/write-output.mjs", ctx);

		const state = await loadProjectState(getDefaultStatePath(tempDir));
		expect(state?.artifacts).toEqual([]);
		expect(notifications.at(-1)).toContain("Usage: /comath computation");
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
```

Run expected failing/passing slice as implementation progresses:

```bash
cd packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts -t "computation"
```

## Task 3: Implement foreground command execution helper

Objective: Run the command in `ctx.cwd`, capture bounded stdout/stderr, elapsed time, exit code, and signal.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`

Add top-level imports:

```ts
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
```

But note current file already imports from `node:fs/promises`:

```ts
import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
```

So extend that existing import to include `readFile`; do not add a duplicate import.

Prefer `execFile` with an explicit shell rather than `exec`:

```ts
const execFileAsync = promisify(execFile);
const COMATH_COMPUTATION_TIMEOUT_MS = 60_000;
const COMATH_COMPUTATION_PREVIEW_CHARS = 2_000;
```

Helper shape:

```ts
interface ComputationRunResult {
	command: string;
	elapsedMs: number;
	exitCode: number;
	signal?: NodeJS.Signals;
	stdout: string;
	stderr: string;
}
```

Implementation note:
- `execFile("/bin/sh", ["-c", parsed.command], { cwd: ctx.cwd, timeout: COMATH_COMPUTATION_TIMEOUT_MS, maxBuffer: 1024 * 1024 })` is acceptable for this prototype.
- On non-zero exit, `execFile` rejects. Catch the error, extract `code`, `signal`, `stdout`, `stderr`, and return/throw a typed result so the command handler can show a clean message without state mutation.
- Avoid `any`. Use local narrowing helpers for error objects.

Preview helper:

```ts
function formatPreview(label: string, value: string): string {
	const normalized = value.trimEnd();
	if (normalized.length <= COMATH_COMPUTATION_PREVIEW_CHARS) return `${label}: ${normalized}`;
	return `${label}: ${normalized.slice(0, COMATH_COMPUTATION_PREVIEW_CHARS)}... [truncated]`;
}
```

Hash helper:

```ts
async function sha256File(filePath: string): Promise<string> {
	const content = await readFile(filePath);
	return createHash("sha256").update(content).digest("hex");
}
```

Do not store full file contents in state.

## Task 4: Implement path validation before and after execution

Objective: Prevent output path escapes, state-file overwrite, directories, and symlinks.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Modify: `packages/coding-agent/test/co-math-extension.test.ts`

Handler structure:

```ts
async function runComputationArtifact(pi: ExtensionAPI, ctx: ExtensionCommandContext, text: string): Promise<void> {
	const parsed = parseComputationText(text);
	if (!parsed) {
		showCommandMessage(pi, ctx, "Usage: /comath computation <command> --out <path> [--title <title>] [--summary <summary>]");
		return;
	}
	const existing = await loadProjectStateOrNotify(pi, ctx);
	if (!existing) return;

	const resolvedPath = resolveWorkspaceRelativePath(ctx.cwd, parsed.outputPath);
	if (!resolvedPath) {
		showCommandMessage(pi, ctx, "Computation output path must stay inside the workspace.");
		return;
	}
	if (isStatePathRelative(resolvedPath.relativePath)) {
		showCommandMessage(pi, ctx, "Computation output path cannot overwrite .pi/co-math/state.json.");
		return;
	}

	const preflight = await checkExportTargetPath(ctx.cwd, resolvedPath);
	if (preflight === "outside_workspace") { /* message and return */ }
	if (preflight === "symlink") { /* message and return */ }
	if (preflight === "directory") { /* message and return */ }
	if (preflight === "state_file") { /* message and return */ }

	const result = await runLocalComputation(parsed.command, ctx.cwd);
	if (result.exitCode !== 0) {
		showCommandMessage(pi, ctx, formatComputationFailure(result));
		return;
	}

	const postflight = await checkExistingArtifactFilePath(ctx.cwd, resolvedPath);
	if (postflight === "missing") { /* message and return */ }
	if (postflight === "directory") { /* message and return */ }
	if (postflight === "symlink") { /* message and return */ }
	if (postflight === "outside_workspace") { /* message and return */ }

	const outputSha256 = await sha256File(resolvedPath.absolutePath);
	// record artifact
}
```

Important: `checkExportTargetPath` may return `exists`; for computation, existing files may be overwritten by the user command. Do not add `--force` unless implementing it deliberately. If `--force` is not implemented, omit it from the public command signature. If implementing `--force`, define exact behavior and tests. Simpler first milestone: no `--force`; allow commands to write/overwrite their own `--out` file because the command itself is the side effect.

Add path-safety tests:

```ts
it("computation rejects outside output paths before running", async () => {
	// command should not run; use a command that would create marker.txt if run
});
```

```ts
it("computation rejects symlink output paths without mutating state", async () => {
	// create symlink output inside workspace pointing to a real file; command should not be allowed to register it
});
```

```ts
it("computation does not mutate state when command fails", async () => {
	// run `node -e "process.exit(7)" --out outputs/missing.tsv`; expect no artifacts
});
```

## Task 5: Record the computation artifact with provenance

Objective: Save one artifact only after command success, path validation, and hashing.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`

Use existing `addArtifact`:

```ts
const artifactId = `artifact-${existing.artifacts.length + 1}`;
const now = new Date().toISOString();
const title = parsed.title ?? `Computation output: ${resolvedPath.relativePath}`;
const summary = parsed.summary ?? "Local foreground computation output with command provenance and SHA-256 hash.";
const provenance = formatComputationProvenance({
	command: parsed.command,
	cwd: ".",
	elapsedMs: result.elapsedMs,
	exitCode: result.exitCode,
	signal: result.signal,
	outputPath: resolvedPath.relativePath,
	outputSha256,
	stdout: result.stdout,
	stderr: result.stderr,
});
const state = addArtifact(existing, {
	id: artifactId,
	kind: "computation",
	title,
	summary,
	path: resolvedPath.relativePath,
	provenance,
	now,
	actor: "human",
});
await saveProjectState(getDefaultStatePath(ctx.cwd), state);
showCommandMessage(
	pi,
	ctx,
	`Recorded computation artifact ${artifactId} (${resolvedPath.relativePath}, sha256 ${outputSha256}, ${result.elapsedMs}ms).`,
);
```

State invariants:
- Artifact should have no related claim/workstream/report ids unless this milestone explicitly adds optional flags. Do not add relation flags in this milestone.
- No evidence should be created. Users can attach evidence manually with `/comath evidence claim-1 computation: ...`.
- No warning should be created. Users can add warnings manually.

## Task 6: Update README with cautious usage

Objective: Document the new command and its finite-evidence semantics.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`

Add to sample commands after artifact-file or near the artifact section:

```text
/comath computation python3 scripts/count_patterns.py --out outputs/counts.tsv --title Finite avoidance counts --summary Brute-force counts for selected patterns up to n <= 6
```

Add prose:

```md
`/comath computation` runs one local foreground command from the current workspace, verifies the declared output file, hashes it, and records a `computation` artifact with command/output provenance. It does not create claims, attach evidence, resolve warnings, or promote proof status. Treat computation artifacts as auditable finite evidence candidates until a human or reviewer connects them to a precise finite claim.
```

Also update the command list sentence if present.

## Task 7: Run targeted tests and full project checks

Objective: Verify implementation without running the full Vitest suite.

Commands:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts -t "computation"
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

Expected:
- Computation tests pass.
- Targeted co-math tests pass.
- `npm run check` passes.
- `git diff --check` produces no whitespace errors.

If dependencies are missing:

```bash
cd /home/hermes/developer/pi-mono-comath
npm install --ignore-scripts
```

Do not use `npm test` or the full Vitest suite.

## Task 8: Manual validation smoke in disposable workspace

Objective: Verify the command improves the real validation workflow without overclaiming.

Use a disposable workspace outside the repo state, for example:

```bash
mkdir -p /tmp/pi-comath-computation-smoke/scripts /tmp/pi-comath-computation-smoke/outputs
cd /tmp/pi-comath-computation-smoke
```

Create a tiny script manually or through the CLI test harness if available:

```js
// scripts/write-counts.mjs
import { writeFile } from "node:fs/promises";
await writeFile("outputs/counts.tsv", "pattern\tn\tcount\n123\t3\t5\n132\t3\t5\n", "utf8");
console.log("wrote outputs/counts.tsv");
```

Run co-math interactively with the extension, then issue:

```text
/comath init Compare finite permutation-pattern avoidance counts.
/comath goal Produce checked finite data, cautious claims, and a working-paper summary.
/comath workstream finite-counts: Enumerate selected avoidance classes for n <= 6.
/comath computation node scripts/write-counts.mjs --out outputs/counts.tsv --title Finite count table --summary Local finite count table smoke output.
/comath artifacts
/comath audit
```

Expected:
- `artifacts` lists one computation artifact with `outputs/counts.tsv`.
- State contains a SHA-256 hash in provenance.
- No claims/evidence/warnings are created by `/comath computation`.
- `audit` is clean.

Final report for the user/Codex handoff should include:
- Exact files changed.
- Exact commands run.
- Test results.
- Whether any deviation from this plan was necessary.
- Confirmation that no claims/evidence/warnings/proof status changes are created automatically.

Risks and tradeoffs:
- Shell execution is intentionally powerful. This is acceptable because the user explicitly enters the command, but it must remain foreground-only, bounded, and workspace-provenance-oriented.
- Hashing only the declared output file is intentionally narrow. Do not try to hash every input dependency in this milestone.
- Plain-text provenance is less structured than JSON but avoids a schema migration and is compatible with existing artifact records.
- Computation artifacts are not theorem proofs. Documentation and success messages should not imply proof promotion.

Open questions for later, not this milestone:
- Should computation artifacts optionally link to a claim/workstream at creation time?
- Should the command capture input file hashes?
- Should long computations be queued/backgrounded?
- Should provenance become structured JSON in schema version 2?
- Should reviewer prompts inspect computation provenance automatically?

Codex execution prompt suggestion:

```text
Implement docs/codex-comath-computation-milestone-plan.md exactly. Stay on branch comath/prototype. Do not commit. Do not broaden scope. Add /comath computation as a foreground-only local command that records one hashed computation artifact and creates no claims/evidence/warnings/proof changes. Run only the targeted co-math tests, npm run check, and git diff --check. Report exact commands and results.
```
