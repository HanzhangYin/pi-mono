# Co-Math Export Path Safety Fix Plan

> **For Hermes:** This is a narrow correctness fix for `docs/co-math-paper-export-artifact-files-plan.md`. Do not start validation until this fix is implemented and verified.

**Goal:** Close symlink/path-containment holes in `/comath export-paper`, `/comath artifact-file`, and `/comath audit`.

**Architecture:** Keep the current export/artifact feature. Replace lexical-only path containment with filesystem-aware checks using top-level `fs/promises` imports. Reject symlink escapes and symlink overwrite targets rather than trying to support them.

**Tech Stack:** TypeScript, Node `fs/promises`, existing co-math commands/tests.

---

## 1. Problem

The implementation currently uses lexical containment:

```ts
path.resolve(cwd, inputPath)
path.relative(cwdAbsolute, targetAbsolute)
```

This blocks simple `../outside.md`, but it does not block symlink escapes because `stat` and `writeFile` follow symlinks.

Examples that must become impossible:

```text
# symlinked directory escape
exports-link -> /tmp/outside
/comath export-paper exports-link/paper.md --force

# symlinked file overwrite
state-link.md -> .pi/co-math/state.json
/comath export-paper state-link.md --force

# metadata registration to outside file
outside-link.txt -> /tmp/outside.txt
/comath artifact-file script outside-link.txt Outside: File outside workspace
```

This violates the plan requirement that export writes stay inside the project root and that file artifacts represent workspace files.

---

## 2. Allowed files

Modify only:

```text
packages/coding-agent/examples/extensions/co-math/commands.ts
packages/coding-agent/test/co-math-extension.test.ts
```

Do not modify unless tests require documentation wording:

```text
packages/coding-agent/examples/extensions/co-math/README.md
```

Do not modify:

```text
schema.ts
storage.ts
state-tool.ts
role-runner.ts
agents/*.md
package.json
npm-shrinkwrap.json
```

No commits.

---

## 3. Required behavior

### 3.1 Shared path safety

Add filesystem-aware helpers in `commands.ts`.

Use top-level imports only, e.g.:

```ts
import { lstat, mkdir, realpath, stat, writeFile } from "node:fs/promises";
```

No dynamic imports.
No shell commands.
No `any`.

Required checks:

1. Resolve `cwd` to a real path using `realpath(cwd)`.
2. Reject empty paths and NUL bytes.
3. Keep the lexical containment check as a first pass.
4. For export:
   - create/check parent directory;
   - resolve real parent path;
   - require real parent path to remain inside real cwd;
   - if target exists, use `lstat`, not `stat`, to reject symbolic links before write;
   - reject directory targets;
   - reject direct or symlink/case-insensitive attempts to overwrite `.pi/co-math/state.json`.
5. For artifact-file:
   - use `lstat` on the target path;
   - reject symbolic links;
   - require target to be a regular file;
   - use `realpath(target)` and require it to remain inside real cwd.
6. For audit:
   - report symlink artifact paths as invalid;
   - report paths whose real target escapes cwd as invalid;
   - continue reporting missing paths/directories/non-md export paths;
   - do not mutate state.

Prefer rejecting symlinks outright for this milestone. Supporting safe symlinks is not needed.

### 3.2 State file protection

Export must not overwrite state even through:

```text
.pi/co-math/state.json
.pi/co-math/STATE.JSON    # on case-insensitive filesystems
state-link.md -> .pi/co-math/state.json
```

Implementation option:

- compute real state path when it exists;
- if target exists, compare real target path to real state path;
- additionally compare normalized relative path case-insensitively for `.pi/co-math/state.json` to cover case-insensitive paths before write.

### 3.3 Mutation rules

On rejected unsafe paths:

- no file write;
- no artifact added;
- no event added;
- existing state remains unchanged.

---

## 4. Tests to add first

Modify:

```text
packages/coding-agent/test/co-math-extension.test.ts
```

Add RED tests before implementation.

### Test 1: export rejects symlinked directory escape

Setup:

- create temp workspace;
- create outside temp directory;
- create symlink inside workspace, e.g. `exports-link -> outsideDir`;
- init co-math state;
- run `/comath export-paper exports-link/paper.md --force`.

Assert:

- outside file was not created;
- state artifact count unchanged;
- no `working_paper_exported` event;
- notification says path must stay inside workspace or symlink path is not allowed.

### Test 2: export rejects symlinked file target

Setup:

- init co-math state;
- create symlink `state-link.md -> .pi/co-math/state.json` inside workspace;
- run `/comath export-paper state-link.md --force`.

Assert:

- state json remains valid state, not markdown;
- no export artifact/event added;
- notification rejects symlink/state overwrite.

### Test 3: artifact-file rejects symlink to outside file

Setup:

- create outside file;
- create symlink in workspace pointing to it;
- init co-math state;
- run `/comath artifact-file script outside-link.txt Outside file: Should reject`.

Assert:

- no artifact added;
- no evidence/claim/warning added;
- notification rejects symlink/outside path.

### Test 4: audit reports symlink artifact paths without mutation

Setup:

- save state with an artifact path that points to a symlink inside workspace;
- run `/comath audit`.

Assert:

- audit reports symlink artifact path is invalid;
- state unchanged.

### Test 5: normal export and artifact-file still work

Existing success tests should remain green. If needed, strengthen them to prove normal non-symlink paths still work.

---

## 5. Implementation guidance

### 5.1 Helper shape

One acceptable shape:

```ts
interface SafeWorkspacePath {
	absolutePath: string;
	relativePath: string;
	realPath?: string;
}

async function resolveExportTargetPath(cwd: string, inputPath: string): Promise<SafeWorkspacePath | undefined>
async function resolveExistingArtifactFilePath(cwd: string, inputPath: string): Promise<SafeWorkspacePath | undefined>
```

Keep user-facing messages simple; tests should assert meaningful substrings, not exact wording when avoidable.

### 5.2 Real containment helper

Use `realpath` and `path.relative` against real paths:

```ts
function isPathInside(parentReal: string, candidateReal: string): boolean {
	const relative = path.relative(parentReal, candidateReal);
	return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}
```

For a parent directory, equality can be allowed only when checking the parent itself. For target files, reject workspace root as a target.

### 5.3 Export target flow

For export:

1. lexical resolve and relative-path normalize;
2. reject state path by normalized relative path, case-insensitive;
3. `await mkdir(parent, { recursive: true })` only after lexical containment passes;
4. `realpath(cwd)` and `realpath(parent)`;
5. require parent real path inside cwd real path or equal to cwd real path;
6. if target exists, `lstat(target)`;
7. reject symlink target;
8. reject directory target;
9. if target realpath equals state realpath, reject;
10. only then write.

### 5.4 Artifact-file flow

For artifact-file:

1. lexical resolve;
2. `lstat(target)`;
3. reject missing, directory, and symlink;
4. `realpath(cwd)` and `realpath(target)`;
5. require target real path inside real cwd;
6. record metadata only.

### 5.5 Audit flow

Audit can use a helper returning an enum/string reason:

```ts
type ArtifactPathProblem = "outside_workspace" | "missing" | "directory" | "symlink";
```

Do not throw for missing artifacts; report problems.

---

## 6. Verification

Run:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts

cd /Users/hanzhangyin/Developer/pi-mono-comath
npm run check
git diff --check
git status --short --untracked-files=all
git diff --name-only
```

Expected:

- targeted tests pass;
- full check passes;
- changed files limited to the allowed files plus this plan if not already committed;
- no `.pi/` export output left in repo root;
- no package/lockfile changes.

---

## 7. Codex handoff prompt

```text
Implement docs/co-math-export-path-safety-fix-plan.md using strict TDD.

Goal:
Fix symlink/path-containment holes in /comath export-paper, /comath artifact-file, and /comath audit.

Required fixes:
- Path containment must be filesystem-aware, not lexical-only.
- export-paper must reject symlinked directory escapes.
- export-paper must reject symlinked file targets, especially symlinks to .pi/co-math/state.json.
- export-paper must reject direct/case-insensitive state.json overwrite attempts.
- artifact-file must reject symlinks, including symlinks to files outside the workspace.
- audit must report symlink/outside/missing/directory artifact paths without mutating state.
- Unsafe path rejection must not write files, add artifacts, or add events.
- Normal non-symlink export and artifact-file flows must keep working.

Allowed files:
- packages/coding-agent/examples/extensions/co-math/commands.ts
- packages/coding-agent/test/co-math-extension.test.ts
- packages/coding-agent/examples/extensions/co-math/README.md only if wording must be updated

Do not modify schema.ts, storage.ts, state-tool.ts, role-runner.ts, agents/*.md, package.json, npm-shrinkwrap.json, or unrelated files. No commits.

TDD:
- Add RED tests for symlinked directory export escape, symlinked file export target, artifact-file symlink rejection, and audit symlink reporting.
- Run targeted tests and confirm the new tests fail for the expected missing safety behavior.
- Implement the minimal fix.
- Re-run targeted tests.

Final verification:
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts

cd /Users/hanzhangyin/Developer/pi-mono-comath
npm run check
git diff --check
git status --short --untracked-files=all
git diff --name-only
```

---

## 8. Hermes review checklist

After Codex returns:

- targeted tests pass;
- full `npm run check` passes;
- independent review passes;
- symlinked directory export cannot write outside workspace;
- symlinked target file export cannot overwrite state or any outside file;
- artifact-file rejects symlinks and outside real paths;
- audit reports symlink/outside artifact paths without mutation;
- normal export/artifact-file flows still work;
- no broad feature work added.
