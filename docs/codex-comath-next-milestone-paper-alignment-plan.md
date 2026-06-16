# Co-Math Next Milestone Plan: Paper Alignment Checkpoint (GitHub Mirror)

> For Codex: implement this milestone directly in-code and tests. Update only what the tasks require. Do not commit unless the user explicitly requests a commit.

## Objective
Create a bounded milestone that converts `docs/2605.06651v2.pdf` semantics into enforceable product behavior and tests, so future work can be measured against paper-aligned invariants.

## Scope
This milestone focuses on:
- deterministic intent routing and non-math safety
- research/workstream lifecycle continuity (`queued -> running -> blocked/failed/completed`)
- unsupported/uncertain claim handling
- explicit recovery visibility for stale runs
- paper-anchored completion criteria and manual evidence

It does not include:
- new external APIs
- scheduler/daemon architecture changes
- theorem-prover integrations
- PDF generation

## Files to touch
- `packages/coding-agent/src/modes/comath/comath-prompts.ts`
- `packages/coding-agent/src/modes/comath/comath-harness.ts`
- `packages/coding-agent/src/modes/comath/comath-progress.ts`
- `packages/coding-agent/src/modes/comath/comath-coordinator-synthesis.ts`
- `packages/coding-agent/examples/extensions/co-math/commands.ts`
- `packages/coding-agent/test/comath-harness.test.ts`
- `packages/coding-agent/test/comath-prompts.test.ts`
- `packages/coding-agent/test/co-math-extension.test.ts`
- `packages/coding-agent/test/comath-backend-output.test.ts`
- `docs/comath-research-exploration-smoke.md`
- `docs/2605.06651v2.pdf` (read-only reference only)

## Required evidence source (before coding)
1. Confirm route behavior and current branch state:
   - `git status --short --branch`
   - `git log --oneline -n 8`
   - `git rev-parse --abbrev-ref --symbolic-full-name @{u}` (document expected failure if no upstream)
2. Verify paper text is available in the workspace:
   - `pdftotext -layout docs/2605.06651v2.pdf /tmp/2605.06651v2.txt`
3. Confirm current working tree is clean before changes.

## Milestone tasks for Codex

### Task 1 — Build a paper-to-code alignment matrix
Create/refresh:
- `docs/codex-comath-paper-workflow-alignment-matrix.md`

Contents:
- 8–12 alignment criteria from the paper mapped to concrete code paths.
- each criterion includes:
  - exact source text excerpt (or section key)
  - expected behavior in code
  - current file path
  - status: `PASS`, `PARTIAL`, `FAIL`

Minimum required criteria:
1. deterministic research-vs-validation entrypoint split
2. user-provided source intake only for literature path (Path 5)
3. claim status stays uncertain unless evidence path exists
4. stale run visibility and recovery command path
5. review queue and review-round auditability
6. living working-paper sections contain open margin notes/warnings
7. no auto-state creation for operational/dev prose
8. no silent claim promotion without evidence

### Task 2 — Add a regression test harness for the alignment matrix
Add a new test file:
- `packages/coding-agent/test/comath-paper-alignment-checkpoint.test.ts`

Required tests (exactly one block per criterion cluster):
- `it("keeps non-math operational prompts out of co-math state")`
  - assert `isLikelyOperationalNonMathPrompt` behavior and no state mutation when no state exists.
- `it("supports explicit research-vs-validation intent without classifier changes")`
  - exercise `isLikelyMathResearchQuestion`, `isLikelyMathValidationPrompt`, and `isResearchCoordinatorPrompt` transitions.
- `it("keeps unsupported claims explicit and separated from supported claims")`
  - through literature/coordinator synthesis output shape checks.
- `it("tracks stale running state and proposes recovery output")`
  - run command/state transitions to hit `run-status latest` and `recover-run` behavior.
- `it("preserves uncertainty in report/export summaries")`
  - ensure unknown/blocked items remain visible in progress/review output.

### Task 3 — Add checkpoint-specific assertions in existing tests
Augment existing tests where existing behavior is already exercised:
- `packages/coding-agent/test/comath-harness.test.ts`
- `packages/coding-agent/test/comath-prompts.test.ts`
- `packages/coding-agent/test/comath-backend-output.test.ts`
- `packages/coding-agent/test/co-math-extension.test.ts`

Add assertions for:
- `/show progress`, `/show report`, and blocked-path messaging stability for Path 5 source-backed flows
- `extractRunSummary` and `formatProductProgress` retaining blockers/warnings
- command path when stale run exists (use existing `run-status` + `recover-run` command shapes)

### Task 4 — Update user-facing smoke to checkpoint format
Update `docs/comath-research-exploration-smoke.md` with:
- a deterministic one-shot alignment checkpoint smoke sequence:
  - repo clean check
  - fresh workspace setup
  - one unsupported+one supported claim check
  - one stale-run or interrupted-run recovery check
  - one `/comath show report` / `/comath review-queue` check
  - one paper output check (`show report`, `export-paper` or equivalent) retaining warnings
- include output snapshots that must be preserved
- include exact pass/fail marker list

### Task 5 — Make recovery copy explicit and machine-checkable
In the implementation paths for recovery/alerts, ensure output is plain and testable.
- `comath-progress.ts` (progress formatting and blocker emission)
- `comath-harness.ts` (steering flow around `continue`, `show progress`, `show report`)
- `examples/extensions/co-math/commands.ts` and role-run recovery commands (`recover-run`, `cancel-run`, `abort-run` help text)

No copy-only tweaks.
Only change phrasing where it improves deterministic state checks.

## Acceptance criteria
1. New matrix document exists with all criteria filled and line-linked to sources.
2. All new tests in `comath-paper-alignment-checkpoint.test.ts` pass.
3. At least one existing test file is strengthened with no fewer than 3 additional assertions relevant to checkpoint criteria.
4. Smoke doc includes a reproducible command sequence and expected outputs.
5. Recovery-related output assertions are deterministic (`blocked`, `stale`, `needs review`, `unsupported`) and visible in progress/report surfaces.

## Execution commands (required)
Run Vitest commands from `packages/coding-agent`, then run repo checks from the repo root:
- `cd /home/hermes/developer/pi-mono-comath/packages/coding-agent && node ../../node_modules/vitest/dist/cli.js --run test/comath-paper-alignment-checkpoint.test.ts`
- `cd /home/hermes/developer/pi-mono-comath/packages/coding-agent && node ../../node_modules/vitest/dist/cli.js --run test/comath-harness.test.ts test/comath-prompts.test.ts test/comath-backend-output.test.ts test/co-math-extension.test.ts`
- `cd /home/hermes/developer/pi-mono-comath && npm run check`
- `cd /home/hermes/developer/pi-mono-comath && git diff --check`

## Failure handling
- If any criterion is `FAIL`, do not expand scope.
- Convert `FAIL` into a follow-up implementation task and mark required evidence in the matrix with:
  - repro command
  - observed output
  - expected output
- Only then continue the same milestone.
