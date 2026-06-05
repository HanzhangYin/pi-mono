# Co-Math Prototype Implementation Plan

> **For Hermes:** Use subagent-driven-development skill only after the user explicitly approves code implementation. Do not edit production code from this plan without approval.

**Goal:** Build a minimal Pi extension prototype of the AI co-mathematician: a persistent research-workspace assistant with coordinator, workstream, reviewer, and synthesis roles.

**Architecture:** Start as an example extension under `packages/coding-agent/examples/extensions/co-math/`, not as a core Pi feature. The extension registers one `/comath` command and one LLM-callable `comath_state` tool. Durable state is stored in explicit project-state JSON files in the target research workspace during real use, and in temporary directories during tests. The first milestone avoids autonomous theorem proving; it preserves research questions, goals, claims, evidence, warnings, failed attempts, and reviewed summaries.

**Tech Stack:** TypeScript extension loaded by jiti, `@earendil-works/pi-coding-agent` extension API, `typebox` for tool schemas, Vitest for targeted tests, Pi faux-provider harness for session-level tests.

---

## 0. Read-only package-script audit

Inspected files:

- `package.json`
- `packages/coding-agent/package.json`
- `packages/agent/package.json`
- `packages/ai/package.json`
- `packages/tui/package.json`
- `test.sh`
- `packages/coding-agent/docs/extensions.md`
- `packages/coding-agent/examples/extensions/README.md`
- `packages/coding-agent/examples/extensions/subagent/README.md`
- `packages/coding-agent/examples/extensions/tools.ts`
- `packages/coding-agent/test/suite/harness.ts`

Relevant scripts:

| Location | Script | Meaning for this work |
|---|---|---|
| repo root | `npm run check` | Required after code changes by `AGENTS.md`; runs Biome, dependency checks, shrinkwrap check, TS check, browser smoke. |
| repo root | `npm test` | Runs tests across workspaces; avoid direct full suite unless requested. |
| repo root | `./test.sh` | Repo-approved non-e2e full test wrapper; moves auth aside and unsets provider keys. Use only if broad verification is requested. |
| repo root | `npm run build` | Do not run unless requested by user. |
| `packages/coding-agent` | `npm run test` / `vitest --run` | Avoid full package test suite unless requested; use specific test files. |
| `packages/coding-agent` | `npm run build` | Do not run unless requested. |
| `packages/agent` | `test:harness` | Useful reference only; prototype should prefer coding-agent harness. |
| `packages/ai` | `generate-models` / `build` | Do not touch `models.generated.ts`; irrelevant to prototype. |

Repo-local rules from `AGENTS.md` affecting implementation:

- No commits unless the user asks.
- No `git add .`, `git add -A`, `git reset --hard`, `git clean -fd`, `git stash`, or force push.
- After code changes, run `npm run check`; fix all errors, warnings, and infos.
- If a test file is created or modified, run that specific test and iterate until it passes.
- Never run `npm run build` or `npm test` unless requested.
- For `packages/coding-agent/test/suite/`, use `test/suite/harness.ts` and the faux provider; no real provider APIs, keys, or paid tokens.
- Use erasable TypeScript syntax in `packages/*/src`, `packages/*/test`, and examples: no `enum`, no parameter properties, no namespace/module syntax, no inline dynamic imports.
- Use top-level imports only.

---

## 1. Scope and non-goals

### Build in first prototype

- A project-state schema for co-math work.
- A small state storage layer with validation and deterministic JSON output.
- A `/comath` command with subcommands for initialization and inspection.
- A `comath_state` tool callable by the model.
- Role prompts for coordinator, workstream, reviewer, and synthesizer behavior.
- Tests for state invariants and extension registration.
- A short README explaining how to run the extension manually.

### Explicit non-goals for first prototype

- No autonomous long-running background agents.
- No mathematical theorem prover.
- No real model API calls in tests.
- No core package refactor.
- No changes to provider/model generation.
- No package dependency additions unless a later step proves they are necessary.
- No commits until the user asks.

---

## 2. Proposed file layout

Create these files only after user approval:

```text
packages/coding-agent/examples/extensions/co-math/
├── README.md
├── index.ts
├── schema.ts
├── storage.ts
├── prompts.ts
├── commands.ts
├── state-tool.ts
└── agents/
    ├── coordinator.md
    ├── workstream.md
    ├── reviewer.md
    └── synthesizer.md

packages/coding-agent/test/co-math-state.test.ts
packages/coding-agent/test/co-math-extension.test.ts
```

Rationale:

- Keeping the prototype under `examples/extensions/` avoids changing core Pi behavior.
- The extension can later be promoted to a package or core feature if it proves useful.
- Tests live in `packages/coding-agent/test/` so they can import source files and extension modules directly.

---

## 3. Data model

Use plain TypeScript object types and string unions; do not use `enum`.

Core objects:

- `CoMathProjectState`
  - `version`
  - `projectId`
  - `title`
  - `rootQuestion`
  - `approvedGoals`
  - `workstreams`
  - `claims`
  - `evidence`
  - `warnings`
  - `reports`
  - `reviewQueue`
  - `updatedAt`
- `ApprovedGoal`
  - precise objective accepted by the user/coordinator.
- `Workstream`
  - role, goal, status, dependencies, latest report ids.
- `ClaimRecord`
  - mathematical claim, status, evidence ids, warnings, source workstream.
- `EvidenceRecord`
  - computation, citation, proof sketch, counterexample search, or human note.
- `WarningRecord`
  - reviewer concern that must not disappear during synthesis.
- `ReportRecord`
  - workstream/reviewer/synthesizer report with provenance.

Claim statuses:

```text
draft
experimentally_supported
proof_sketch
proved
refuted
needs_review
blocked
```

Warning statuses:

```text
open
addressed
accepted_risk
```

Important invariant:

> A synthesized mathematical assertion is not allowed to appear as `proved` unless at least one evidence record of kind `proof` is attached and no attached warning is still `open`.

---

## 4. Commands and tools

### `/comath` command

Register a single command named `comath`; parse subcommands in `commands.ts`.

Initial subcommands:

```text
/comath init <root question>
/comath status
/comath goal <goal text>
/comath workstream <name>: <goal>
/comath review-queue
/comath help
```

Behavior:

- `init` creates or loads the project state for the current cwd.
- `status` summarizes goals, workstreams, claim statuses, and open warnings.
- `goal` appends an approved goal.
- `workstream` creates a pending workstream.
- `review-queue` lists claims/reports needing review.
- `help` prints concise usage.

### `comath_state` tool

Register one tool named `comath_state` using `pi.registerTool()`.

Initial actions:

```text
read
add_goal
add_workstream
add_claim
add_evidence
add_warning
add_report
set_claim_status
list_review_queue
```

Use `StringEnum` from `@earendil-works/pi-ai` for action parameters rather than `Type.Union([...Type.Literal])`, matching the extension docs' Google-compatibility guidance.

Tool-result discipline:

- Every mutation returns a short user-visible summary.
- Every mutation includes full updated state or state metadata in `details`.
- The extension appends a custom session entry with `pi.appendEntry()` so Pi session history preserves provenance.

---

## 5. Prompt roles

Role prompts should be markdown files, not hardcoded strings where possible.

### Coordinator

Purpose:

- Break the root question into approved goals and workstreams.
- Maintain separation between proved, conjectural, experimental, and blocked material.
- Ask for review before promoting claims.

Required behavior:

- Never state a claim as proved without evidence.
- Preserve failed attempts and negative results.
- Surface open warnings in every synthesis.

### Workstream

Purpose:

- Attack one narrow goal.
- Return claims, evidence, computations, failed attempts, and blockers.

Required behavior:

- Prefer small exact examples over vague generalization.
- Mark uncertain material explicitly.
- Attach provenance to every claim.

### Reviewer

Purpose:

- Challenge claims and syntheses.
- Identify proof gaps, hidden assumptions, and missing examples.

Required behavior:

- Create `WarningRecord`s rather than silently rewriting.
- Refuse to promote claims with open warnings.

### Synthesizer

Purpose:

- Produce cautious draft prose from reviewed state.

Required behavior:

- Include a warning section when warnings remain open.
- Separate `proved`, `empirical`, `conjectural`, and `failed attempt` sections.

---

## 6. TDD implementation tasks

### Task 1: Add state schema tests

**Objective:** Define expected behavior before production code.

**Files:**

- Create: `packages/coding-agent/test/co-math-state.test.ts`

**Test cases:**

1. Creates an empty project state with version, project id, root question, and empty arrays.
2. Adds a goal with deterministic id and timestamp injection.
3. Adds a claim and refuses to mark it `proved` without proof evidence.
4. Keeps open warnings attached to claims.
5. Serializes JSON deterministically.

**Run:**

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts
```

Expected first run: FAIL because implementation files do not exist.

### Task 2: Implement minimal schema and state reducers

**Objective:** Make Task 1 pass with pure, testable functions.

**Files:**

- Create: `packages/coding-agent/examples/extensions/co-math/schema.ts`
- Create: `packages/coding-agent/examples/extensions/co-math/storage.ts`

Required exported functions:

```text
createEmptyProjectState(input)
addGoal(state, input)
addWorkstream(state, input)
addClaim(state, input)
addEvidence(state, input)
addWarning(state, input)
setClaimStatus(state, input)
serializeProjectState(state)
```

Implementation constraints:

- No `any` unless unavoidable.
- No `enum`.
- No dependency additions.
- Deterministic id/timestamp injection for tests.

**Run:** same test command as Task 1. Expected: PASS.

### Task 3: Add storage-file tests

**Objective:** Verify file read/write behavior without touching real user data.

**Files:**

- Modify: `packages/coding-agent/test/co-math-state.test.ts`

**Test cases:**

1. Writes state to a temp directory.
2. Reads it back exactly.
3. Creates parent directories.
4. Handles missing state by returning `undefined` or a clear error object.

**Run:** same specific test command. Expected first run: FAIL for missing file storage helpers.

### Task 4: Implement storage-file helpers

**Objective:** Add safe JSON persistence.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`

Required helpers:

```text
getDefaultStatePath(cwd)
loadProjectState(path)
saveProjectState(path, state)
```

Default path proposal:

```text
.pi/co-math/state.json
```

Note: this path is relative to the target project cwd, not necessarily the Pi source repo. Tests must use temp dirs.

**Run:** specific state test. Expected: PASS.

### Task 5: Add extension registration tests

**Objective:** Verify the extension registers command/tool without real model calls.

**Files:**

- Create: `packages/coding-agent/test/co-math-extension.test.ts`

**Test cases:**

1. Loading the extension registers `/comath`.
2. Loading the extension registers `comath_state`.
3. `comath_state` remains active when extension tools are enabled.
4. `/comath help` produces a user-visible notification or message.

Use patterns from:

- `packages/coding-agent/test/suite/harness.ts`
- `packages/coding-agent/test/suite/regressions/3592-no-builtin-tools-keeps-extension-tools.test.ts`

**Run:**

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts
```

Expected first run: FAIL because `index.ts`, `commands.ts`, and `state-tool.ts` do not exist.

### Task 6: Implement `/comath` command and `comath_state` tool

**Objective:** Make Task 5 pass.

**Files:**

- Create: `packages/coding-agent/examples/extensions/co-math/index.ts`
- Create: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Create: `packages/coding-agent/examples/extensions/co-math/state-tool.ts`

Implementation notes:

- `index.ts` wires command + tool registration only.
- `commands.ts` parses `/comath` subcommands and calls storage helpers.
- `state-tool.ts` defines TypeBox schema and executes tool actions.
- Use `StringEnum` for action.
- Return concise content and structured `details`.

**Run:** specific extension test. Expected: PASS.

### Task 7: Add role prompts and README

**Objective:** Document manual operation and role behavior.

**Files:**

- Create: `packages/coding-agent/examples/extensions/co-math/README.md`
- Create: `packages/coding-agent/examples/extensions/co-math/agents/coordinator.md`
- Create: `packages/coding-agent/examples/extensions/co-math/agents/workstream.md`
- Create: `packages/coding-agent/examples/extensions/co-math/agents/reviewer.md`
- Create: `packages/coding-agent/examples/extensions/co-math/agents/synthesizer.md`

README should include:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
pi -e examples/extensions/co-math/index.ts
```

and sample commands:

```text
/comath init Study endpoint behavior for a permutation class
/comath goal Prove or refute the first nontrivial endpoint monotonicity case
/comath workstream small-examples: enumerate exact small n examples and report obstructions
/comath status
```

No real math claims should be presented as established in the README.

### Task 8: Run targeted verification

**Objective:** Verify the touched tests pass before broad checks.

Commands:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-extension.test.ts
```

Expected: PASS.

### Task 9: Run required repository check

**Objective:** Satisfy repo rule after code changes.

Command from repo root:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath
npm run check
```

Expected: PASS with no errors, warnings, or infos requiring fixes.

Do not run `npm run build` or `npm test` unless the user asks.

---

## 7. Manual demo after implementation

After tests and `npm run check` pass, do one controlled manual demo if the user wants it:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
pi -e examples/extensions/co-math/index.ts
```

Manual script:

```text
/comath init Explore a toy permutation-pattern conjecture
/comath goal Record exact small examples before any general proof attempt
/comath workstream examples: enumerate n <= 5 examples and report failures
/comath status
```

Expected demo outcome:

- A state file exists in the demo cwd.
- `/comath status` reports one root question, one approved goal, one workstream, zero proved claims, and zero/open warnings as appropriate.
- No claim is promoted to `proved` unless proof evidence exists.

---

## 8. Future phases, after first prototype

Possible later upgrades:

1. Integrate the existing `subagent/` example so coordinator can spawn workstream/reviewer subprocesses.
2. Add synthesis command that writes cautious markdown reports.
3. Add import/export for LaTeX draft sections.
4. Add provenance links to source files, computations, and session entries.
5. Add a warning-preserving reviewer loop.
6. Add dashboard artifact generation for project state.
7. Decide whether to promote from example extension to package or core Pi feature.

---

## 9. Approval checkpoint

Implementation should not start until the user approves. The safest next action after this plan is:

```text
Implement Task 1 only: write failing state-schema tests.
```

Then run the specific Vitest command and confirm the expected RED failure before writing production code.
