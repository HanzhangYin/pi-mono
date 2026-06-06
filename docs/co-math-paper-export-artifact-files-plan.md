# Co-Math Working Paper Export and File-Backed Artifacts Implementation Plan

> **For Hermes:** This is the next bounded phase after `docs/co-math-living-working-paper-plan.md`. Use Codex only after the living-working-paper implementation is committed. Hermes owns alignment with the AI co-math paper and with the repository rules.

**Goal:** Add safe, deterministic file export for the living working paper and a minimal file-backed artifact registration path.

**Architecture:** Keep `.pi/co-math/state.json` as the source of truth. `/comath paper` remains a terminal render. New export commands write deterministic markdown snapshots under an allowed workspace path and register file-backed artifacts as metadata. No model calls, no LaTeX/PDF generation, no theorem-prover integration, no background dispatch changes.

**Tech Stack:** TypeScript, existing Pi coding-agent extension API, Node `fs/promises` and `path`, Vitest, existing co-math state.

---

## 0. Why this phase comes next

The current co-math prototype now has:

```text
persistent shared state
structured role output
artifacts/events
workstream lifecycle and run records
human steering and recovery
review rounds and claim revisions
queued/background dispatch
living working-paper sections and margin notes
```

The next gap versus the AI co-math paper is moving from a state-only living paper to durable workspace artifacts that a researcher can inspect, diff, cite, and preserve. This phase should add the smallest safe file layer:

```text
export the current living paper as markdown + register existing workspace files as artifacts
```

Do not jump to LaTeX/PDF generation, automatic model rewriting, theorem-prover tooling, or external artifact ingestion yet.

---

## 1. Framework alignment constraints

Source of truth: `/Users/hanzhangyin/Developer/2605.06651v2.pdf`.

This phase supports:

- living working paper snapshots;
- visible provenance;
- file-backed research artifacts;
- progressive disclosure from paper text to sources/warnings/margin notes;
- explicit preservation of uncertainty.

Required commitments:

1. State remains authoritative. Exported files are snapshots, not live state.
2. Exported paper markdown must preserve open warnings and open margin notes.
3. Exported paper markdown must mark non-synthesis-eligible claim sources exactly like `/comath paper`.
4. Export must be deterministic for the same state except for an explicit generated-at line if included.
5. File-backed artifacts are metadata records. Registering a file does not make it proof evidence.
6. Commands must avoid path traversal and accidental writes outside the workspace.
7. No LaTeX/PDF generation in this phase.
8. No model calls or automatic paper rewriting.
9. No provider/dependency/package changes.

Unacceptable drift:

- exporting hides open warnings or margin notes;
- registering a file creates `Evidence` or proves/promotes a claim;
- command accepts `../` or absolute paths outside the workspace for writes;
- command overwrites arbitrary user files without an explicit `--force`;
- PDF/LaTeX build is added;
- background/scheduler behavior changes;
- artifact files are parsed and trusted as mathematical evidence.

---

## 2. Allowed files

Codex may modify only:

```text
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/examples/extensions/co-math/commands.ts
packages/coding-agent/examples/extensions/co-math/state-tool.ts
packages/coding-agent/examples/extensions/co-math/README.md
packages/coding-agent/test/co-math-state.test.ts
packages/coding-agent/test/co-math-extension.test.ts
```

Do not modify unless Hermes explicitly approves:

```text
packages/coding-agent/examples/extensions/co-math/role-runner.ts
packages/coding-agent/examples/extensions/co-math/agents/*.md
packages/coding-agent/test/co-math-role-runner.test.ts
package.json
npm-shrinkwrap.json
```

No commits.

---

## 3. Explicit non-goals

Do not implement:

- LaTeX export;
- PDF generation;
- latexmk invocation;
- theorem prover integration;
- CAS/sage/python notebook execution;
- artifact content parsing;
- citation/bibliography management;
- model-authored section updates;
- automatic export after background completion;
- external cloud/upload integrations;
- new dependencies.

This phase is deterministic local filesystem output and artifact metadata only.

---

## 4. State model target

### 4.1 Schema additions

Modify `schema.ts`.

Add event kind:

```ts
| "working_paper_exported"
```

Add artifact path status metadata if useful but keep it minimal. Prefer extending `ArtifactRecord` only if necessary:

```ts
path?: string;
```

`path` already exists. Do not add broad artifact lifecycle states unless required by tests.

Optional but useful addition:

```ts
export type ExportFormat = "markdown";
```

Do not add LaTeX/PDF formats yet.

### 4.2 State additions

No new top-level array is required if export events and artifact records can preserve provenance.

If Codex wants a first-class `paperExports` array, stop and ask Hermes first. The first pass should use:

- `working_paper_exported` event;
- `ArtifactRecord` with kind `latex_note` or another existing kind? Prefer `latex_note` is misleading. Use existing `ArtifactKind` only if semantically acceptable.

Better minimal change: extend `ArtifactKind` with:

```ts
| "working_paper_export"
```

Then export commands can register the markdown snapshot as an artifact.

---

## 5. Storage helpers

Modify `storage.ts`.

### 5.1 Artifact kind

If `ArtifactKind` is extended with `working_paper_export`, ensure parser/type guards in `commands.ts` accept it where appropriate.

### 5.2 `recordWorkingPaperExport`

Add:

```ts
export interface RecordWorkingPaperExportInput {
	artifactId: string;
	path: string;
	title: string;
	summary: string;
	now: string;
	actor: CoMathActor;
}

export function recordWorkingPaperExport(state: CoMathProjectState, input: RecordWorkingPaperExportInput): CoMathProjectState
```

Semantics:

- require non-empty `path`, `title`, `summary`;
- create an artifact:
  - `id: input.artifactId`
  - `kind: "working_paper_export"`
  - `title: input.title`
  - `summary: input.summary`
  - `path: input.path`
  - related ids may be empty or include all current section ids only if artifact schema supports them; do not invent claim/evidence links unless explicitly sourced;
- emit `working_paper_exported` event with subject id = artifact id and related ids = working paper section ids + open warning ids + open margin note ids;
- update state timestamp.

Do not create evidence, warnings, claims, review rounds, role runs, or margin notes.

### 5.3 Existing file artifact registration

Use existing `addArtifact` if sufficient.

No separate helper is required unless command code becomes duplicated. If adding a helper, it must only create an `ArtifactRecord` and an `artifact_recorded` event.

---

## 6. Commands

Modify `commands.ts`.

### 6.1 Help text

Add:

```text
/comath export-paper [path] [--force] - write the living working paper markdown snapshot
/comath artifact-file <kind> <path> <title>: <summary> - register an existing workspace file as an artifact
```

### 6.2 Path safety helpers

Add local helpers in `commands.ts`:

```ts
function resolveWorkspaceRelativePath(cwd: string, inputPath: string): { absolutePath: string; relativePath: string } | undefined
```

Requirements:

- reject empty paths;
- reject paths containing NUL;
- reject absolute paths outside `cwd`;
- reject relative paths that resolve outside `cwd`;
- store relative paths in state, using POSIX-ish `/` separators if possible;
- create parent directories only for export command, not for artifact-file registration;
- default export path:

```text
.pi/co-math/exports/working-paper.md
```

Do not allow export to overwrite `.pi/co-math/state.json`.
Do not allow export to write outside the project root.
Do not use shell commands for file operations.

### 6.3 `/comath export-paper [path] [--force]`

Format:

```text
/comath export-paper
/comath export-paper .pi/co-math/exports/working-paper.md
/comath export-paper drafts/co-math-working-paper.md --force
```

Parsing:

- no args => default path;
- optional path;
- optional `--force` as final token;
- any other flags => usage message.

Behavior:

1. Load state.
2. Build the same markdown as `/comath paper` by reusing the existing deterministic formatter. If it is currently private, keep it private but call it from export code in the same file.
3. Ensure parent directory exists.
4. If target file exists and `--force` is absent, show:

```text
Export target already exists: <relative-path>. Use --force to overwrite.
```

and do not mutate state.
5. Write markdown using `fs/promises.writeFile`.
6. Record a `working_paper_export` artifact and `working_paper_exported` event.
7. Save state.
8. Notify:

```text
Exported living working paper to <relative-path> as artifact-<N>.
```

Requirements:

- exported markdown includes open warnings and open margin notes;
- non-synthesis-eligible claim sources are marked;
- export command must not call roleRunner/model;
- export command must not promote claims or resolve notes/warnings;
- failed write must not mutate state.

### 6.4 `/comath artifact-file <kind> <path> <title>: <summary>`

Format:

```text
/comath artifact-file computation computations/n5-table.json Small n table: Counts for n <= 5
/comath artifact-file script scripts/check-endpoints.py Endpoint checker: Script used for endpoint enumeration
```

Parsing:

- first token: existing `ArtifactKind`, including new `working_paper_export` if added;
- second token: path;
- remaining text is `<title>: <summary>`;
- title and summary required.

Behavior:

1. Load state.
2. Resolve path safely inside `cwd`.
3. Require that file exists and is a file, not a directory.
4. Do not read file contents.
5. Create artifact with `path` set to normalized relative path.
6. Save state.
7. Notify:

```text
Recorded file artifact artifact-<N> [<kind>] <relative-path>: <title>
```

Do not create evidence, warnings, claims, or proof status changes.

### 6.5 `/comath artifacts`

Update formatting to show paths when present:

```text
- artifact-1 [script] Endpoint checker (scripts/check-endpoints.py): Script used for endpoint enumeration
```

### 6.6 `/comath audit`

Add checks:

- artifact path, if present, resolves inside workspace;
- artifact path exists? For audit, report if missing but do not mutate:

```text
artifact-1 path scripts/missing.py does not exist
```

- artifact path points to directory rather than file;
- `working_paper_export` artifact has a `.md` path;
- `working_paper_exported` event subject id exists as an artifact if subject id is present.

Because audit currently does not receive `cwd` in `collectAuditProblems`, either:

- pass `ctx.cwd` into audit collection; or
- split filesystem path checks into a separate command-level function.

Do not mutate state in audit.

---

## 7. README and state-tool updates

Update README with:

- sample commands for `/comath export-paper` and `/comath artifact-file`;
- explanation that exports are snapshots;
- explanation that file artifacts are metadata and not proof evidence;
- warning that no LaTeX/PDF generation occurs.

Update `state-tool.ts` summary to include file-backed artifact count:

```text
File-backed artifacts: N
```

Do not expose file contents to the model through `comath_state`.

---

## 8. Tests

Use strict TDD. Add RED tests first.

### 8.1 Storage tests

Modify:

```text
packages/coding-agent/test/co-math-state.test.ts
```

Add tests:

1. `records working paper exports as artifacts and events`
   - create state with section/open warning/open margin note;
   - call `recordWorkingPaperExport`;
   - assert artifact kind/path/title/summary;
   - assert event kind `working_paper_exported` and related ids include section/warning/note ids;
   - assert no evidence/claims/warnings are created.

2. `working paper export artifact does not affect proof synthesis eligibility`
   - create a needs_review claim;
   - record export;
   - assert `isClaimSynthesisEligible` remains false.

### 8.2 Command tests

Modify:

```text
packages/coding-agent/test/co-math-extension.test.ts
```

Add tests:

1. `export-paper writes default markdown snapshot and records artifact`
   - init;
   - create paper section and margin note;
   - run `/comath export-paper`;
   - read `.pi/co-math/exports/working-paper.md` from disk;
   - assert markdown contains working-paper disclaimer, open margin notes, open warnings section;
   - load state and assert artifact kind `working_paper_export`, path set, event recorded.

2. `export-paper refuses to overwrite without force`
   - export once;
   - run export again without `--force`;
   - assert notification says use `--force`;
   - assert artifact count did not increase.

3. `export-paper --force overwrites and records a new export artifact`
   - export once;
   - change state by adding a section/note;
   - export with `--force`;
   - assert file contains new section;
   - assert new artifact/event recorded.

4. `export-paper rejects paths outside workspace`
   - `/comath export-paper ../outside.md`;
   - assert no file outside tempDir and no artifact/event created.

5. `export-paper does not mutate state on failed unsafe path or overwrite refusal`
   - snapshot state before command;
   - unsafe path or existing path without force;
   - reload and compare stable fields/artifact counts/events.

6. `artifact-file registers existing workspace files without reading content`
   - write temp file under workspace using test setup;
   - `/comath artifact-file script scripts/check.py Endpoint checker: Small n enumeration helper`;
   - assert artifact path and summary;
   - assert no evidence/warnings/claims created.

7. `artifact-file rejects missing files, directories, and outside paths`
   - missing path => no artifact;
   - directory path => no artifact;
   - `../outside.txt` => no artifact.

8. `artifacts output includes file paths`
   - register file artifact;
   - `/comath artifacts`;
   - assert relative path appears.

9. `audit reports missing file-backed artifact paths without mutation`
   - save state with artifact path to missing file;
   - `/comath audit`;
   - assert problem text;
   - reload state and assert unchanged.

10. `README and state-tool document export/file artifact commands`
    - update existing documentation tests.

---

## 9. Implementation notes

### 9.1 Use Node APIs only

Use top-level imports only:

```ts
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
```

No dynamic imports.
No shell commands.
No `any`.
No non-erasable TypeScript syntax.

### 9.2 Path containment

Use `path.resolve(cwd, inputPath)` and verify the result is inside `cwd`:

```ts
const cwdAbsolute = path.resolve(cwd);
const targetAbsolute = path.resolve(cwdAbsolute, inputPath);
const relative = path.relative(cwdAbsolute, targetAbsolute);
const isInside = relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
```

Allow default `.pi/co-math/exports/working-paper.md`.
Reject empty relative result if the target is the workspace root.
Reject NUL bytes.

### 9.3 Export markdown source

Do not duplicate `/comath paper` rendering if possible. Reuse `buildLivingWorkingPaperMarkdown`.

If adding an export header, keep it deterministic enough for tests. Prefer no timestamp in the file body. The event timestamp already captures export time.

### 9.4 Artifact kind naming

Use `working_paper_export`, not `latex_note`, for markdown paper snapshots. If adding this artifact kind requires updating parser/tests, do so only in the allowed files.

---

## 10. Verification

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

- targeted co-math tests pass;
- full repo check passes;
- no whitespace errors;
- changed files limited to allowed files;
- no package/lockfile changes;
- no role-runner or agent prompt changes;
- no `.pi/` export files committed or left in repo root test workspace;
- no generated paper artifacts outside test temp dirs during tests.

---

## 11. Codex handoff prompt

```text
Implement docs/co-math-paper-export-artifact-files-plan.md using strict TDD.

Goal:
Add safe deterministic markdown export for the living working paper and minimal file-backed artifact registration.

Required commands:
- /comath export-paper [path] [--force]
- /comath artifact-file <kind> <path> <title>: <summary>

Required semantics:
- State remains authoritative; exported files are snapshots.
- export-paper writes markdown using the same cautious renderer as /comath paper.
- export-paper default path is .pi/co-math/exports/working-paper.md.
- export-paper refuses overwrite unless --force is present.
- export-paper rejects paths outside the workspace and must not mutate state on unsafe path/overwrite refusal.
- export-paper records a working_paper_export artifact and working_paper_exported event after a successful write.
- artifact-file registers an existing workspace file path as artifact metadata only; it does not read file contents.
- artifact-file rejects missing files, directories, and paths outside the workspace.
- file-backed artifacts are not Evidence and do not promote claims.
- /comath artifacts shows artifact paths.
- /comath audit reports missing/invalid artifact paths without mutation.
- No LaTeX/PDF generation, no markdown auto-export loop, no model calls, no new deps, no provider changes.
- Existing proof/review/run/background/living-paper invariants remain unchanged.

Allowed files:
- packages/coding-agent/examples/extensions/co-math/schema.ts
- packages/coding-agent/examples/extensions/co-math/storage.ts
- packages/coding-agent/examples/extensions/co-math/commands.ts
- packages/coding-agent/examples/extensions/co-math/state-tool.ts
- packages/coding-agent/examples/extensions/co-math/README.md
- packages/coding-agent/test/co-math-state.test.ts
- packages/coding-agent/test/co-math-extension.test.ts

Do not touch role-runner.ts, agents/*.md, package.json, npm-shrinkwrap.json, or unrelated files. No commits.

TDD requirement:
- Add RED storage tests for export artifact/event behavior and proof-invariant preservation.
- Add RED command tests for export success, overwrite refusal, --force, unsafe paths, artifact-file registration/rejection, artifacts output, audit, and docs.
- Run targeted tests and report expected failures.
- Implement minimal GREEN changes.
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

## 12. Hermes review checklist

After Codex returns, Hermes should verify:

- export-paper writes deterministic markdown containing open warnings, open margin notes, and non-synthesis-eligible labels;
- export-paper refuses overwrite without --force and does not mutate state on refusal;
- export-paper rejects outside paths and state.json target;
- export success records exactly one artifact and one export event;
- artifact-file requires existing workspace file and never reads content;
- artifact-file does not create Evidence/Warning/Claim records;
- artifacts output includes paths;
- audit reports missing/invalid paths without mutation;
- no LaTeX/PDF/export loop/model calls/deps were added;
- proof/review/run/background/living-paper invariants are unchanged;
- targeted tests, npm run check, and git diff --check pass.
