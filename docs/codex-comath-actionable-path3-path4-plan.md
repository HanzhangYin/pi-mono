# Co-Math Actionable Path 3 + Path 4 Plan

> **For Codex:** Implement this plan on `/home/hermes/developer/pi-mono-comath` from the current `comath/research-exploration-mode` branch. Do not commit unless explicitly asked. There may already be uncommitted validation-entrypoint cleanup changes in the worktree; inspect and preserve them. This is a bounded product milestone: make Path 3 and Path 4 useful intermediate research products, not a new architecture expansion.

## Goal

Turn these currently thin paths into actionable, beginner-readable research outputs:

```text
Path 3: Reformulation
Path 4: Weaker special cases
```

For the motivating problem:

```text
Are there infinitely many primes of the form n^2 + 1?
```

Path 3 should produce a clear reformulation map.
Path 4 should produce concrete candidate lemmas / weaker targets.

The beginner should understand how these paths bridge:

```text
Path 1 examples → Path 3 reformulation → Path 4 weaker lemmas → Path 2 proof attempt
```

## Motivation

The current co-math implementation has made Path 1 and Path 2 useful enough for beginner testing:

```text
Path 1: computational examples/counterexamples with finite-proof caveats
Path 2: direct proof strategy / obstruction notes
```

Paths 3 and 4 exist, but are not yet strong product experiences. They currently mostly produce generic research notes such as:

```text
- Reformulate as prime values of f(n) = n^2 + 1.
- Focus on even n; writing n = 2m gives 4m^2 + 1.
- Prove the parity lemma cleanly, then test even n.
```

Those are mathematically reasonable, but the output should become more structured and actionable. The user should get named frames, candidate lemmas, statuses, and next commands.

This matches the co-mathematician paper architecture better than adding more agents right now: the system should help transform examples into reformulations and smaller claims before trying more proof/literature machinery.

## Expected End Result

Manual flow:

```text
Are there infinitely many primes of the form n^2 + 1?
please continue path 1
continue path 3
continue path 4
show research state
show report
```

Expected product behavior:

```text
- Path 1 still works as before.
- Path 3 explains equivalent/related frames in a structured way.
- Path 3 clearly separates proved reductions from conjectural/literature search targets.
- Path 3 recommends `continue path 4`.
- Path 4 lists candidate lemmas/weaker targets with statuses.
- Path 4 distinguishes proved, computational-only, and open targets.
- Path 4 recommends `continue path 2` or another executable command.
- show research state summarizes these results and includes an executable suggested command.
- show report still shows detailed report output.
```

## Non-goals

Do not implement:

```text
- new workstream types
- source lookup changes
- Path 5 reference ingestion
- formal proof assistant integration
- coordinator expansion
- parallel workstreams
- new state schema unless necessary for presentation
- a full theorem database
```

Prefer improving existing Path 3/4 round content and formatting.

## Current Context

Relevant files:

```text
packages/coding-agent/src/modes/comath/comath-research-execution.ts
packages/coding-agent/src/modes/comath/comath-research-workstream.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/test/comath-research-execution.test.ts
packages/coding-agent/test/comath-research-workstream.test.ts
packages/coding-agent/test/comath-progress.test.ts
packages/coding-agent/test/comath-harness.test.ts
docs/comath-research-exploration-smoke.md
```

Recent relevant committed baseline:

```text
bfd76d24 fix(coding-agent): streamline co-math research UX
135acaf3 fix(coding-agent): polish beginner co-math path flow
```

At the time this plan was written, there may also be uncommitted validation-entrypoint cleanup changes:

```text
M docs/comath-research-exploration-smoke.md
M packages/coding-agent/src/modes/comath/comath-harness.ts
M packages/coding-agent/src/modes/comath/comath-progress.ts
M packages/coding-agent/src/modes/comath/comath-prompts.ts
M packages/coding-agent/test/comath-harness.test.ts
M packages/coding-agent/test/comath-prompts.test.ts
?? docs/claude-comath-validation-entrypoint-cleanup-plan.md
```

Do not overwrite or revert that work.

## Current Path 3/4 Behavior to Improve

In:

```text
packages/coding-agent/src/modes/comath/comath-research-execution.ts
```

Current Path 3 roughly does:

```text
Reformulate the question as prime values of f(n) = n^2 + 1.
After parity reduction, focus on even n; writing n = 2m gives 4m^2 + 1.
This suggests literature-search targets around prime-producing polynomials.
```

Current Path 4 roughly does:

```text
The parity lemma is proved.
A weaker computational goal is to find many even n with n^2 + 1 prime.
Another weaker goal is to show infinitely many n with no small prime factor.
```

Keep these ideas, but make them structured, beginner-readable, and tied to next commands.

## Design Principles

### 1. Make outputs actionable

Each path completion should answer:

```text
What did this path produce?
What is proved vs heuristic vs computational?
What exact command should I type next?
```

### 2. Hide internal debug concepts in default output

Default completion should avoid leading with:

```text
workstream
artifact ids
schema
queue
role-run
```

Detailed report can still include technical details where already expected.

### 3. Preserve uncertainty

Do not claim:

```text
- Bunyakovsky proves infinitude
- Schinzel proves infinitude
- finite computation proves infinitely many primes
- reformulation alone proves equivalence unless it really does
```

### 4. Keep implementation small

Prefer enriching existing deterministic path-specific rounds and presentation. Do not create a new architecture layer.

## Task 1: Add Structured Presentation Helpers for Path 3/4 Text

Objective: make Path 3/4 findings easy to format consistently without adding new state.

Modify:

```text
packages/coding-agent/src/modes/comath/comath-research-execution.ts
```

Add small helper functions for the n^2 + 1 problem, for example:

```ts
function buildNSquaredPlusOneReformulationFindings(): string[]
function buildNSquaredPlusOneWeakerCaseFindings(): string[]
```

The output may still be `string[]`, but format items so downstream presentation can show clear labels.

Recommended Path 3 findings:

```text
Original question: Are there infinitely many primes of the form n^2 + 1?
Frame 1 — Polynomial prime values: ask whether f(n) = n^2 + 1 takes prime values infinitely often.
Frame 2 — Even-index reduction: odd n > 1 never work; the unresolved part is whether 4m^2 + 1 is prime infinitely often.
Frame 3 — Conjectural/literature frame: Bunyakovsky/Schinzel-type heuristics would predict infinitude, but this is not a proof and needs source-backed context.
Practical consequence: stop spending computation on odd n > 1; focus examples and proof attempts on even n.
```

Recommended Path 3 uncertainties:

```text
The even-index reduction is useful, but it does not prove infinitely many prime values.
Conjectural frames are search targets unless a source verifies the exact statement.
```

Recommended Path 3 next move:

```text
Turn these reformulations into smaller lemmas and weaker targets.
```

But user-facing completion should also include an executable command:

```text
continue path 4
```

Recommended Path 4 findings:

```text
Lemma 1 — Parity obstruction: if n > 1 is odd, then n^2 + 1 is composite. Status: proved.
Lemma 2 — Even reduction: the open part is whether 4m^2 + 1 is prime infinitely often. Status: equivalent target after excluding odd n > 1; not a proof.
Target 3 — Finite evidence: among checked n, record prime values of n^2 + 1. Status: computational evidence only.
Target 4 — Small-prime obstructions: for small primes p, identify residue classes where n^2 + 1 is divisible by p. Status: good next computation/proof target.
```

Recommended Path 4 uncertainties:

```text
The parity lemma is a real theorem but much weaker than the original claim.
Finite evidence and small-prime obstruction checks do not prove infinitude.
```

Recommended Path 4 next move:

```text
Use the parity lemma and even reduction to guide a proof attempt.
```

User-facing command:

```text
continue path 2
```

## Task 2: Improve Path 3/4 Specialist/Critic/Synthesis Copy

Objective: make the model-backed/staged research workstream output for Path 3/4 match the same actionable product shape.

Modify as needed:

```text
packages/coding-agent/src/modes/comath/comath-research-workstream.ts
packages/coding-agent/src/modes/comath/comath-research-model-workstream.ts
```

Current `buildCoordinatorBrief`, `buildCriticReview`, and `buildSynthesis` already special-case reformulation and weaker special cases.

Improve these so Path 3/4 output emphasizes:

Path 3:

```text
- original question
- equivalent/related frames
- what changes operationally
- what is not proved
- next command: continue path 4
```

Path 4:

```text
- candidate lemmas
- status: proved / equivalent target / computational-only / open
- what can be checked next
- next command: continue path 2
```

Do not make the model invent citations. Path 3 can mention conjectural frames as search targets, not verified facts.

## Task 3: Ensure Completion Formatting Shows Executable Commands

Objective: make automatic Path 3/4 completion beginner-actionable.

Inspect:

```text
packages/coding-agent/src/modes/comath/comath-progress.ts
```

Ensure completion output for Path 3 includes something like:

```text
Next
Turn this into smaller targets:
continue path 4
```

Ensure completion output for Path 4 includes something like:

```text
Next
Use these lemmas in a proof attempt:
continue path 2
```

If there is already a generic `describeNextPathHint` or similar helper, extend it rather than duplicating formatter logic.

Do not regress Path 1 completion.

## Task 4: Update Research State Summary for Path 3/4 Progression

Objective: after Path 3/4 complete, `show research state` should make the bridge clear.

Modify:

```text
packages/coding-agent/src/modes/comath/comath-progress.ts
```

Desired after Path 3:

```text
Current research state

Recent progress
- Path 3 reframed the problem as prime values of n^2 + 1 and reduced attention to even n / 4m^2 + 1.

Suggested command
continue path 4
```

Desired after Path 4:

```text
Current research state

Recent progress
- Path 4 isolated weaker targets: parity lemma, even reduction, finite evidence, and small-prime obstruction checks.

Suggested command
continue path 2
```

It is okay if the exact wording differs, but it must include executable commands and must not suggest prose that Pi cannot route.

## Task 5: Add/Update Tests

Likely tests:

```text
packages/coding-agent/test/comath-research-execution.test.ts
packages/coding-agent/test/comath-research-workstream.test.ts
packages/coding-agent/test/comath-progress.test.ts
packages/coding-agent/test/comath-harness.test.ts
```

Add tests for deterministic path rounds:

```text
- Path 3 for n^2 + 1 includes polynomial prime values.
- Path 3 includes even-index reduction / 4m^2 + 1.
- Path 3 does not claim conjectural frames are proofs.
- Path 3 suggested next move leads to Path 4 or completion formatter shows `continue path 4`.
- Path 4 includes parity lemma with status proved.
- Path 4 includes finite evidence with status computational-only.
- Path 4 includes small-prime obstruction target.
- Path 4 suggested next move leads to Path 2 or completion formatter shows `continue path 2`.
```

Add harness/product tests if feasible:

```text
- bare question → continue path 3 creates a completed report with actionable reformulation copy.
- bare question → continue path 4 creates a completed report with candidate lemmas/weaker targets.
- show research state after Path 3 includes `continue path 4`.
- show research state after Path 4 includes `continue path 2`.
```

Keep tests deterministic using existing fake executors where available. No real provider calls in tests.

## Task 6: Update Smoke Docs

Update:

```text
docs/comath-research-exploration-smoke.md
```

Add an advanced-but-still-beginner-readable smoke section:

```text
## Path 3/4 bridge smoke
```

Use non-destructive fresh-folder commands:

```bash
cd /tmp
mkdir comath-path3-path4-bridge-test-1
cd comath-path3-path4-bridge-test-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Are there infinitely many primes of the form n^2 + 1?
please continue path 1
continue path 3
continue path 4
show research state
show report
```

Good signs:

```text
[ ] Path 3 explains prime-values-of-polynomial framing.
[ ] Path 3 explains even-index / 4m^2 + 1 reduction.
[ ] Path 3 says conjectural frames are not proofs.
[ ] Path 3 suggests `continue path 4`.
[ ] Path 4 lists candidate lemmas or weaker targets.
[ ] Path 4 marks parity obstruction as proved.
[ ] Path 4 marks finite evidence as computational-only.
[ ] Path 4 suggests `continue path 2`.
[ ] show research state includes an executable suggested command.
```

## Manual Acceptance Smoke

Run:

```bash
cd /tmp
mkdir comath-path3-path4-bridge-test-1
cd comath-path3-path4-bridge-test-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Are there infinitely many primes of the form n^2 + 1?
please continue path 1
```

Wait for Path 1 to complete, then:

```text
continue path 3
```

Expected Path 3 good output:

```text
Path 3 completed: Reformulation

Equivalent or related frames
- Polynomial prime values: f(n) = n^2 + 1.
- Even-index reduction: odd n > 1 never work; focus on 4m^2 + 1.
- Conjectural/literature frame: Bunyakovsky/Schinzel-type heuristics are search targets, not proofs.

Next
continue path 4
```

Then:

```text
continue path 4
```

Expected Path 4 good output:

```text
Path 4 completed: Weaker special cases

Candidate lemmas
- Parity obstruction: proved.
- Even reduction: useful target, not a proof.
- Finite evidence: computational-only.
- Small-prime obstruction checks: next target.

Next
continue path 2
```

Then:

```text
show research state
```

Expected:

```text
Suggested command
continue path 2
```

or another clearly justified executable next command.

## Validation Commands

Focused co-math suite:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run \
  test/comath-markdown.test.ts \
  test/comath-prompts.test.ts \
  test/comath-harness.test.ts \
  test/comath-progress.test.ts \
  test/comath-backend-output.test.ts \
  test/co-math-extension.test.ts \
  test/co-math-natural-language.test.ts \
  test/co-math-state.test.ts \
  test/comath-research-autoplan.test.ts \
  test/comath-research-execution.test.ts \
  test/comath-research-workstream.test.ts \
  test/comath-research-model-workstream.test.ts \
  test/comath-literature-workstream.test.ts \
  test/comath-computation-workstream.test.ts \
  test/comath-coordinator-synthesis.test.ts
```

Repo checks:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

Do not run `npm test` or `npm run build` unless explicitly asked.

## Final Response Required From Codex

Report:

```text
- files changed
- exact Path 3 behavior added
- exact Path 4 behavior added
- how the output distinguishes proved / conjectural / computational-only claims
- focused co-math suite result
- npm run check result
- git diff --check result
- manual smoke folder and pass/fail notes
- any remaining UX rough edges
```

Do not commit unless explicitly asked.
