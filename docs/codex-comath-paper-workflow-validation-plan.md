# Co-Math Paper Workflow Validation Plan

> For Codex: implement this plan only after the user explicitly asks you to run Codex. Do not broaden scope, do not start daemon/background-worker work, and do not commit unless the user explicitly asks.

Goal: Validate the co-math prototype as an end-to-end paper-to-working-paper research loop against `docs/2605.06651v2.pdf`, using the aligned goal/workstream/report-review workflow and preserving mathematical uncertainty.

Architecture: Keep this milestone focused on a local, explicit, user-steered workflow. The deliverable is not a new theorem or a formal proof engine; it is a reliable paper-shaped co-math run that demonstrates approved goals, scoped workstreams, reviewed reports, cautious claims, visible blockers, and a working-paper markdown export.

Tech Stack: TypeScript, Node built-ins only, Vitest targeted tests, existing co-math extension commands/state/prompt files.

Reference context:
- Repo: `/home/hermes/developer/pi-mono-comath`
- Branch: `comath/prototype`
- Reference paper: `docs/2605.06651v2.pdf`
- Extracted paper text may be generated temporarily with `pdftotext`; do not commit generated text unless explicitly requested.
- Co-math extension: `packages/coding-agent/examples/extensions/co-math/`
- Co-math tests: `packages/coding-agent/test/co-math-state.test.ts`, `packages/coding-agent/test/co-math-extension.test.ts`, `packages/coding-agent/test/co-math-role-runner.test.ts`
- Prior plan: `docs/codex-comath-architecture-alignment-plan.md`

Required prerequisite:
- The previous architecture-alignment implementation should be committed before starting this milestone.
- Start this milestone from a clean worktree.

Required verification commands:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

Non-goals:
- Do not add a daemon, scheduler, or autonomous background worker.
- Do not add formal proof engines or proof-assistant integration.
- Do not add external dependencies.
- Do not claim the paper's mathematics has been proved by the prototype.
- Do not auto-promote reports into proved claims.
- Do not weaken proof-promotion invariants.
- Do not generate PDF output.
- Do not modify `docs/2605.06651v2.pdf`.
- Do not broaden into general paper-ingestion infrastructure beyond this reference workflow.

Acceptance criteria:
- A user can run a complete co-math loop around the reference paper and produce:
  - proposed and approved goals,
  - at least two goal-linked workstreams,
  - at least one workstream report,
  - at least one report review,
  - at least one cautious claim with evidence or warning state,
  - a working-paper markdown export,
  - `/comath audit` with no unexpected invariant problems.
- Status commands make the next safe action visible.
- The README documents the workflow as a reproducible smoke test.
- Targeted tests and `npm run check` pass.

---

## Task 1: Add an end-to-end workflow test skeleton

Objective: Create a regression test that models the intended paper workflow without invoking real providers or reading paid/external services.

Files:
- Modify: `packages/coding-agent/test/co-math-extension.test.ts`
- Read only: `packages/coding-agent/examples/extensions/co-math/README.md`

Steps:
1. Add a new test near the other `/comath` workflow tests.
2. Initialize a temporary workspace.
3. Run `/comath init` with a root question derived from the reference paper, for example: `How should we map and validate the main mathematical structure of 2605.06651v2?`.
4. Use command helpers already present in the test suite; do not add real model calls.
5. Assert that the state file exists and loads.

Suggested test intent:

```ts
it("supports a paper-to-working-paper co-math workflow", async () => {
	// Initialize project.
	// Propose and approve goals.
	// Add two workstreams.
	// Add at least one report and report review.
	// Export a working paper.
	// Assert audit/status invariants.
});
```

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts -t "paper-to-working-paper"
```

Expected before implementation: FAIL or incomplete assertions if supporting commands/status/export are missing.

Do not modify production code in this task except where needed to make existing commands testable.

---

## Task 2: Add minimal paper-workflow seed guidance

Objective: Provide reproducible human-facing instructions for using the reference paper as a co-math workflow seed.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`

Steps:
1. Add a section named `Reference paper workflow smoke test`.
2. Include exact commands a user can run after opening the repo in the coding-agent environment.
3. Keep commands aligned with the approved-goal workflow.
4. Document that this is a workflow validation, not a proof of the paper.

Suggested README content:

```md
### Reference paper workflow smoke test

Use this to validate the local co-math research loop against `docs/2605.06651v2.pdf`.

1. Initialize the project:
   `/comath init Map and validate the main mathematical structure of docs/2605.06651v2.pdf`
2. Propose goals:
   `/comath propose-goal Extract the paper's main definitions, theorem statements, and dependency graph.`
   `/comath propose-goal Identify which claims need proof review, computation, or external references.`
3. Approve goals:
   `/comath approve-goal goal-1`
   `/comath approve-goal goal-2`
4. Create workstreams:
   `/comath workstream definitions-map: Definitions and theorem dependency map`
   `/comath workstream validation-questions: Proof, computation, and reference validation questions`
5. Run bounded roles and review reports.
6. Export the working paper:
   `/comath export-paper .pi/co-math/working-paper.md --force`
7. Audit state:
   `/comath audit`
```

Expected behavior:
- Workstreams link only to approved goals.
- Reports require explicit review.
- Report acceptance does not prove claims.
- Working-paper export preserves blockers and uncertainty.
```

Run:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
```

Expected: PASS.

---

## Task 3: Add `/comath goals` for workflow visibility

Objective: Let users inspect proposed, approved, active, completed, and deferred goals without reading JSON.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Modify: `packages/coding-agent/test/co-math-extension.test.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`

Steps:
1. Add `/comath goals` to help text.
2. Implement a handler that loads state and prints all goals grouped or annotated by status.
3. Include timestamps only if existing formatter style supports it; otherwise keep output concise.
4. Add a test that proposes, approves, and defers goals, then asserts all statuses appear.

Suggested output shape:

```text
Co-math goals
- goal-1 [approved]: Extract the paper's main definitions, theorem statements, and dependency graph.
- goal-2 [proposed]: Identify validation questions.
- goal-3 [deferred]: Explore formal proof engine integration.
```

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts -t "goals"
```

Expected: PASS.

---

## Task 4: Add `/comath reports` and `/comath report-status <report-id>`

Objective: Make workstream reports and report reviews visible as first-class workflow objects.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Modify: `packages/coding-agent/test/co-math-extension.test.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`

Steps:
1. Add `/comath reports` and `/comath report-status <report-id>` to help text.
2. Implement `/comath reports` to list report id, title, related role run if known, and latest review outcome if any.
3. Implement `/comath report-status <report-id>` to show:
   - report title,
   - summary,
   - blockers,
   - linked role run id,
   - report review rounds,
   - warnings created by report reviews,
   - suggested next action.
4. Add tests for unknown report id and a report with a review round.

Suggested `/comath reports` output shape:

```text
Co-math reports
- report-1: Definitions and theorem dependency map [latest review: revision_requested]
- report-2: Validation questions [latest review: accepted]
```

Suggested `/comath report-status report-1` output shape:

```text
Report report-1: Definitions and theorem dependency map
Summary: ...
Blockers:
- missing exact theorem dependency for Lemma X
Review rounds:
- report-review-1 [revision_requested]: Needs clearer separation between claims and definitions.
Suggested next action: /comath review-report report-1 accepted|revision-requested|blocked: <summary>
```

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts -t "report"
```

Expected: PASS.

---

## Task 5: Add `/comath next` as a safe workflow guide

Objective: Provide a concise next-action command that prevents users from accidentally skipping goal approval, report review, warning review, or audit/export steps.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Modify: `packages/coding-agent/test/co-math-extension.test.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`

Steps:
1. Add `/comath next` to help text.
2. Reuse or extend existing next-safe-action logic from status output.
3. Prefer deterministic priority order:
   - no project: `/comath init <root question>`
   - no goals: `/comath propose-goal <goal>` or `/comath goal <goal>`
   - proposed goals but no approved goals: `/comath approve-goal <goal-id>`
   - approved goals but no workstreams: `/comath workstream <slug>: <title>`
   - open warnings: `/comath review-queue`
   - unreviewed reports: `/comath review-report <report-id> ...`
   - no working-paper export: `/comath export-paper .pi/co-math/working-paper.md --force`
   - otherwise: `/comath audit`
4. Add tests for at least three states: empty initialized project, approved-goal/no-workstream project, and project with unreviewed report.

Suggested output shape:

```text
Co-math next safe action
/comath approve-goal goal-1
Reason: proposed goals exist but none are approved.
```

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts -t "next"
```

Expected: PASS.

---

## Task 6: Improve working-paper export for report reviews and blockers

Objective: Ensure exported markdown reflects the paper-loop lifecycle rather than only claims and sections.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Modify: `packages/coding-agent/test/co-math-extension.test.ts`

Steps:
1. Inspect the current `export-paper` implementation.
2. Add a section for goals with statuses.
3. Add a section for workstreams and latest reports.
4. Add a section for report reviews.
5. Add a section for unresolved warnings/blockers.
6. Do not promote accepted reports into proved claims.
7. Add a test that exports a project with a report review and asserts the markdown includes report review outcome and blocker text.

Suggested export sections:

```md
## Goals

## Workstreams

## Claims and Evidence

## Report Reviews

## Open Warnings and Blockers

## Provenance
```

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts -t "export"
```

Expected: PASS.

---

## Task 7: Add a deterministic reference workflow fixture test

Objective: Prove the milestone acceptance criteria in one deterministic test without real model calls.

Files:
- Modify: `packages/coding-agent/test/co-math-extension.test.ts`

Steps:
1. Use commands and direct state helpers already used by existing tests.
2. Initialize a project with the reference paper root question.
3. Propose and approve two goals.
4. Create two workstreams.
5. Record or simulate one workstream report.
6. Record one report review.
7. Add one cautious claim with evidence or warning state.
8. Export working paper markdown.
9. Run audit command or call audit-visible behavior through the command API.
10. Assert output contains no unexpected invariant problems.

Required assertions:
- There are at least two goals and at least two approved/active linkable goals.
- Each workstream has at least one linked goal id.
- There is at least one report.
- There is at least one report review round.
- Report review acceptance does not make any claim `proved` by itself.
- Exported markdown includes goals, workstreams, report reviews, and warnings/blockers.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts -t "paper-to-working-paper"
```

Expected: PASS.

---

## Task 8: Update role prompts for paper-mapping discipline

Objective: Make coordinator, workstream, reviewer, and synthesizer roles consistently preserve uncertainty during paper mapping.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/agents/coordinator.md`
- Modify: `packages/coding-agent/examples/extensions/co-math/agents/workstream.md`
- Modify: `packages/coding-agent/examples/extensions/co-math/agents/reviewer.md`
- Modify: `packages/coding-agent/examples/extensions/co-math/agents/synthesizer.md`

Steps:
1. Add prompt guidance that the reference-paper workflow should separate:
   - definitions,
   - theorem statements,
   - dependency claims,
   - proof obligations,
   - computation obligations,
   - external-reference obligations.
2. Require every role to label uncertainty explicitly.
3. Require reviewers to review report quality separately from claim proof status.
4. Require synthesizer output to include blockers and non-proved claims in separate sections.
5. Keep prompts concise; do not add model-specific behavior.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
```

Expected: PASS.

---

## Task 9: Run the full validation suite

Objective: Verify the final milestone implementation.

Files:
- No direct edits unless failures expose concrete blockers.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
git status --short --branch
```

Expected:
- Targeted tests pass.
- `npm run check` passes with no warnings or infos.
- `git diff --check` emits no output.
- `git status --short --branch` shows only intended files modified.

If any test fails:
- Fix only the failing workflow blocker.
- Do not add unrelated commands or automation.
- Rerun the targeted failing test first, then full verification.

---

## Task 10: Final review checklist

Objective: Confirm the implementation remains aligned with the co-math architecture.

Checklist:
- [ ] Goal approval remains explicit.
- [ ] Workstreams are linked to approved/active goals.
- [ ] Reports are first-class and reviewable.
- [ ] Report reviews do not prove claims.
- [ ] Proof eligibility still requires owned proof evidence and no owned open warning.
- [ ] Working-paper export preserves blockers and uncertainty.
- [ ] `/comath audit` catches unexpected invariant problems.
- [ ] README smoke test is reproducible.
- [ ] No external dependencies were added.
- [ ] No daemon/background-worker architecture was introduced.
- [ ] `npm run check` passed.
- [ ] Targeted co-math tests passed.

Suggested commit message after user approval:

```bash
git add \
  packages/coding-agent/examples/extensions/co-math/README.md \
  packages/coding-agent/examples/extensions/co-math/agents/coordinator.md \
  packages/coding-agent/examples/extensions/co-math/agents/reviewer.md \
  packages/coding-agent/examples/extensions/co-math/agents/synthesizer.md \
  packages/coding-agent/examples/extensions/co-math/agents/workstream.md \
  packages/coding-agent/examples/extensions/co-math/commands.ts \
  packages/coding-agent/test/co-math-extension.test.ts

git diff --cached --check
git commit -m "feat(coding-agent): validate co-math paper workflow"
```

Do not commit unless the user explicitly asks.
