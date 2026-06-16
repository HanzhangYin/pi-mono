# Co-Math Natural First-Message Entrypoint Plan

> **For Codex:** Implement this plan on `/home/hermes/developer/pi-mono-comath` from the current `comath/research-exploration-mode` branch. Do not commit unless explicitly asked. This is a narrow UX milestone: make the first co-math prompt natural, without adding new research architecture.

## Goal

Let beginners start co-math exploration by typing an ordinary math question, without requiring the magic phrase:

```text
Explore this problem: ...
```

Current good flow:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
please continue path 1
```

Desired flow:

```text
Are there infinitely many primes of the form n^2 + 1?
please continue path 1
```

Pi should infer that the first message is a mathematical research/exploration question and initialize the same research workspace.

## Motivation

The beginner Path 1 flow is now much better after recent polish:

```text
- Path 1 has natural continuation routing.
- `please continue path 1` starts Path 1.
- co-math footer status shows active background work.
- completion output is concise and says finite computation is not proof.
- `show report` / `show latest report` show detailed artifacts.
```

The biggest remaining beginner friction is the entrypoint. A new user should not need to know a special incantation before asking a math question.

The product should feel like:

```text
ask a math question → Pi prepares a research workspace → Pi suggests the first useful command
```

not:

```text
remember to prefix the question with `Explore this problem:`
```

## Current Context / Assumptions

Before editing, inspect current uncommitted work. At plan creation time, the worktree included an uncommitted Claude implementation for UX consolidation:

```text
M docs/comath-research-exploration-smoke.md
M packages/coding-agent/src/main.ts
M packages/coding-agent/src/modes/comath/comath-computation-workstream.ts
M packages/coding-agent/src/modes/comath/comath-coordinator-synthesis.ts
M packages/coding-agent/src/modes/comath/comath-harness.ts
M packages/coding-agent/src/modes/comath/comath-literature-workstream.ts
M packages/coding-agent/src/modes/comath/comath-progress.ts
M packages/coding-agent/src/modes/comath/comath-research-model-workstream.ts
M packages/coding-agent/src/modes/interactive/interactive-mode.ts
M packages/coding-agent/test/comath-harness.test.ts
M packages/coding-agent/test/comath-progress.test.ts
?? docs/claude-comath-ux-consolidation-plan.md
?? docs/comath-background-activity-api-notes.md
?? packages/coding-agent/src/modes/comath/comath-markdown.ts
?? packages/coding-agent/src/modes/comath/comath-prompts.ts
?? packages/coding-agent/test/comath-markdown.test.ts
?? packages/coding-agent/test/comath-prompts.test.ts
```

Do not overwrite or revert those changes. Build on them if present.

Important current files:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-prompts.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
packages/coding-agent/src/modes/comath/comath-research-autoplan.ts
packages/coding-agent/test/comath-harness.test.ts
packages/coding-agent/test/comath-prompts.test.ts
packages/coding-agent/test/comath-progress.test.ts
docs/comath-research-exploration-smoke.md
```

## Non-goals

Do not add:

```text
- new workstream types
- more coordinator behavior
- formal proof integration
- source lookup behavior
- parallel workstreams
- a new UI framework
- a broad semantic intent classifier backed by an LLM
```

This should be a small, deterministic routing/product polish.

## Desired Beginner Transcript

Fresh folder:

```bash
cd /tmp
mkdir comath-natural-entry-test-1
cd comath-natural-entry-test-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Are there infinitely many primes of the form n^2 + 1?
```

Expected response:

```text
This looks like a math research question. I’ll explore it as a co-math problem.

Research workspace prepared

I’ll explore several possible paths:
- Path 1: Small examples and counterexamples: ...
- Path 2: Direct proof attempt: ...
- Path 3: Reformulation: ...
- Path 4: Weaker special cases: ...
- Path 5: Known theorem or literature reduction: ...

Next
Run the examples path:
continue path 1
```

Then:

```text
please continue path 1
```

Expected:

```text
Path 1 starts, footer status appears, final beginner summary appears.
```

## Required Behavior

### 1. Bare math questions should start research exploration

These should initialize research exploration from an empty workspace:

```text
Are there infinitely many primes of the form n^2 + 1?
Is every even integer greater than 2 a sum of two primes?
Can every positive integer be written as a sum of four squares?
How many primes are there of the form n^2 + 1?
Can you help me explore whether there are infinitely many twin primes?
Help me investigate whether every Collatz sequence reaches 1.
```

Expected for each:

```text
- create `.pi/co-math/state.json`
- initialize research paths
- show `Research workspace prepared`
- include executable next command `continue path 1`
```

### 2. Existing explicit exploration prompts must keep working

Keep these working exactly or better:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
Explore this problem:
Are there infinitely many primes of the form n^2 + 1?
I want to explore this problem: Are there infinitely many primes of the form n^2 + 1?
```

Incomplete prompt should still ask for the problem and not create state:

```text
Explore this problem:
```

Expected:

```text
Describe the problem you want to explore.
```

Then the next substantial message should start exploration.

### 3. Help/status/report commands must not create state

From a fresh folder, these should not initialize a project:

```text
help
show report
show latest report
show progress
status
what are you doing?
show research state
show latest coordinator report
```

Expected:

```text
- helpful warning/help output
- no `.pi/co-math/state.json` created
```

### 4. Non-math operational prose must not accidentally start co-math research

From a fresh folder, these should not create research state:

```text
run tests
run a quick sanity check
show me the files
what branch am I on?
report that this theorem is false
progress on this proof may require density estimates
```

Expected:

```text
- do not initialize co-math research paths
- fall back to existing behavior or product help/warning, depending on current harness design
```

### 5. Ambiguous cases can ask for confirmation instead of guessing

If a prompt looks like a generic instruction rather than a math question, do not force research setup. It is acceptable to ask:

```text
Do you want to explore this as a co-math research problem? If so, say `explore this problem: ...`.
```

But do not ask confirmation for obvious math questions like:

```text
Are there infinitely many primes of the form n^2 + 1?
```

## Implementation Approach

### Step 1: Add deterministic natural exploration detection

Prefer adding this to:

```text
packages/coding-agent/src/modes/comath/comath-prompts.ts
```

Suggested exports:

```ts
export function parseNaturalResearchQuestion(prompt: string): string | undefined;
export function isLikelyMathResearchQuestion(prompt: string): boolean;
```

Keep heuristics conservative and deterministic.

Good positive signals:

```text
- prompt ends with `?`
- contains math/research words such as prime, primes, integer, theorem, conjecture, proof, prove, disprove, infinitely many, polynomial, equation, sequence, graph, group, ring, field, number, n^2, mod, modulo, divisor, composite
- starts with natural research/help phrasing:
  - can you help me explore ...
  - help me investigate ...
  - can we study ...
  - investigate whether ...
  - explore whether ...
```

Good negative signals:

```text
- existing command prompts: help, status, show progress, show report, show research state
- shell/dev commands: run tests, npm, git, build, check, lint, install, branch, files
- pure control prompts: continue, cancel, stop
- very short vague prompts without math content
```

Suggested conservative rule:

```text
Start natural exploration only if:
- workspace has no existing co-math state, and
- prompt is not a recognized co-math command, and
- prompt has an obvious math/research signal, and
- prompt is phrased as a question or explicit explore/investigate/help request.
```

Do not use an LLM for detection.

### Step 2: Route natural questions before generic validation fallback

In:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
```

Find the initial/no-state flow. Current code has logic around:

```text
parseExplorationPrompt(...)
isIncompleteExplorationPrompt(...)
handleInitialResearchProblem(...)
handleInitialProblem(...)
```

Add a branch before the generic `handleInitialProblem(problem)` fallback:

```ts
const naturalResearchQuestion = parseNaturalResearchQuestion(problem);
if (naturalResearchQuestion) {
  await this.notify("This looks like a math research question. I’ll explore it as a co-math problem.");
  await this.handleInitialResearchProblem(naturalResearchQuestion);
  return;
}
```

Use the project’s existing notification style. If adding the extra explanatory sentence makes tests brittle, it can be part of the formatted exploration output instead, but the manual UX should clearly explain why Pi started research.

Important:

```text
- Do not change behavior after a project already exists unless explicitly intended.
- Existing follow-up commands should still route normally.
- Pending initial exploration intent should continue to work.
```

### Step 3: Keep explicit exploration prompt behavior canonical

Make sure this still uses the existing parser:

```text
Explore this problem: ...
```

Natural detection should not replace or weaken explicit parser behavior.

### Step 4: Add tests

Add tests in whichever file is most appropriate:

```text
packages/coding-agent/test/comath-prompts.test.ts
packages/coding-agent/test/comath-harness.test.ts
```

Required prompt-helper tests:

```text
parseNaturalResearchQuestion("Are there infinitely many primes of the form n^2 + 1?") returns the question
parseNaturalResearchQuestion("Can you help me explore whether there are infinitely many twin primes?") returns normalized question
parseNaturalResearchQuestion("run tests") returns undefined
parseNaturalResearchQuestion("show report") returns undefined
parseNaturalResearchQuestion("help") returns undefined
parseNaturalResearchQuestion("report that this theorem is false") returns undefined
```

Required harness tests:

```text
- bare math question initializes research workspace and creates research paths
- bare math question output includes Research workspace prepared
- bare math question output includes continue path 1
- help from fresh workspace does not create state
- show report from fresh workspace does not create state
- explicit Explore this problem still works
- incomplete Explore this problem asks for a problem and creates no state
```

If current test harness makes state existence hard to assert, assert via command calls/messages used by existing tests.

### Step 5: Update smoke docs

Update:

```text
docs/comath-research-exploration-smoke.md
```

Put the new natural entrypoint at the top of the beginner smoke.

Use non-destructive fresh-folder commands:

```bash
cd /tmp
mkdir comath-natural-entry-demo
cd comath-natural-entry-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Beginner prompts:

```text
Are there infinitely many primes of the form n^2 + 1?
please continue path 1
show progress
show report
```

Mention that explicit `Explore this problem: ...` remains supported but is no longer required for obvious math questions.

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

Manual smoke:

```bash
cd /tmp
mkdir comath-natural-entry-test-1
cd comath-natural-entry-test-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Are there infinitely many primes of the form n^2 + 1?
please continue path 1
show progress
show research state
show report
```

Pass checklist:

```text
[ ] Bare math question initializes research workspace.
[ ] Output explains Pi is exploring it as a co-math problem, or otherwise makes the transition clear.
[ ] Output says Research workspace prepared.
[ ] Output includes executable next command `continue path 1`.
[ ] `please continue path 1` starts Path 1.
[ ] Footer/status shows co-math running while active.
[ ] Final Path 1 output says finite computation is not proof.
[ ] `show research state` includes executable suggested command.
[ ] `show report` shows detailed report/artifacts after completion.
```

Negative smoke: fresh folder, no state should be created.

```bash
cd /tmp
mkdir comath-natural-entry-negative-test-1
cd comath-natural-entry-negative-test-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
help
```

Exit Pi, then shell:

```bash
python3 -c 'from pathlib import Path; p=Path(".pi/co-math/state.json"); print("state exists:", p.exists())'
```

Expected:

```text
state exists: False
```

Repeat in another fresh folder for:

```text
show report
run tests
```

These should also not create research state.

## Final Response Required From Codex

When done, report:

```text
- files changed
- exact natural prompts supported
- exact prompts intentionally rejected
- how false positives are avoided
- focused co-math suite result
- npm run check result
- git diff --check result
- manual positive smoke folder and result
- manual negative smoke folder(s) and result
- any remaining UX rough edges
```

Do not commit unless explicitly asked.
