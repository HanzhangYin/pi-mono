# Co-Math Research Exploration Pending Intent Fix Plan

> **For Codex:** This is a focused follow-up fix for the `comath/research-exploration-mode` branch. Do not commit unless explicitly asked. Preserve the existing research exploration implementation and fix the documented beginner two-message flow.

## Current branch

Work in:

```bash
cd /home/hermes/developer/pi-mono-comath
git status --short --branch
```

Expected branch:

```text
comath/research-exploration-mode
```

If you are not on that branch, stop and ask before switching.

## Background

The research exploration implementation mostly works and validation passed:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run \
  test/comath-harness.test.ts \
  test/comath-progress.test.ts \
  test/comath-backend-output.test.ts \
  test/co-math-extension.test.ts \
  test/co-math-natural-language.test.ts \
  test/co-math-state.test.ts \
  test/comath-research-autoplan.test.ts

cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

But manual smoke found one product-flow blocker.

## Blocker

The smoke doc says the user can enter:

```text
Explore this problem:
Are there infinitely many primes of the form n^2 + 1?
```

In a terminal/TUI, this is naturally submitted as two user messages:

First message:

```text
Explore this problem:
```

Current output:

```text
Describe the problem you want to explore after the colon.
```

Second message:

```text
Are there infinitely many primes of the form n^2 + 1?
```

Current bad behavior:

```text
I’ll set up a source-backed validation run for: Are there infinitely many primes of the form n^2 + 1?
...
→ Running source audit in the background
```

Expected behavior:

```text
Research workspace prepared

I’ll explore several possible paths:
- Small examples and counterexamples
- Direct proof attempt
- Reformulation
- Weaker special cases
- Known theorem or literature reduction

Next
I’ll start with Small examples and counterexamples, because it can quickly reveal what is plausible.
```

## Goal

Support the natural two-message beginner flow:

```text
User: Explore this problem:
Pi: Describe the problem you want to explore.
User: Are there infinitely many primes of the form n^2 + 1?
Pi: Research workspace prepared ...
```

The second message must complete the pending exploration request. It must not be routed to validation mode.

## Non-goals

Do not redesign research exploration mode.

Do not rewrite the co-math state model.

Do not remove validation mode.

Do not make the research autoplan LLM-dependent.

Do not commit.

## UX requirements

1. Single-line exploration still works:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
```

2. Two-message exploration works:

```text
Explore this problem:
Are there infinitely many primes of the form n^2 + 1?
```

3. The first incomplete prompt must not initialize a validation workspace.

4. The first incomplete prompt must not create validation workstreams or queue any validation audit.

5. The next substantial user message should be interpreted as the exploration problem.

6. `help` after the incomplete prompt should show help and should not create state.

7. Empty or whitespace-only replies after the incomplete prompt should keep waiting.

8. Existing validation prompts should still route to validation mode:

```text
Validate this proof: ...
Check this proof: ...
Validate Question 3.
```

9. Product copy should avoid internal terms in normal beginner-facing output:

```text
role-run
workstream
queue
schema
artifact
```

## Recommended implementation approach

Use a small harness-level pending intent, not a broad state migration.

`CoMathHarness` already has instance fields and handles prompt routing. Add a private field like:

```ts
private pendingInitialIntent: "explore-problem" | undefined;
```

or a slightly more explicit shape:

```ts
private pendingInitialIntent:
	| { kind: "explore-problem" }
	| undefined;
```

Because the incomplete prompt happens before project state exists, this does not need to be persisted in `state.json`. It only needs to survive the next message in the same TUI session.

### Suggested routing logic

In `handlePrompt(problemText: string)`:

1. Trim input as today.

2. If the input is empty:
   - if there is a pending exploration intent, ask again for the problem;
   - otherwise keep existing empty-input behavior.

3. If the input is help:
   - show help;
   - do not clear the pending exploration intent unless there is a strong reason to do so.

4. If `pendingInitialIntent?.kind === "explore-problem"`:
   - if the new prompt is another incomplete exploration prompt, keep waiting;
   - if the new prompt is a complete exploration prompt, extract its problem text and start research mode;
   - otherwise treat the full prompt as the exploration problem and call `handleInitialResearchProblem(prompt)`;
   - clear `pendingInitialIntent` only after successfully starting the research workspace.

5. If there is no existing state and `isIncompleteExplorationPrompt(problem)`:
   - set `pendingInitialIntent = { kind: "explore-problem" }`;
   - notify with a clear product message;
   - return without running backend commands.

6. Keep the current single-line `parseExplorationPrompt(problem)` path.

### Product copy

Prefer a simple beginner message:

```text
Describe the problem you want to explore.
```

Optionally:

```text
Paste the problem statement, conjecture, or question. I’ll create several research paths once you do.
```

Avoid:

```text
pending intent
state
harness
schema
```

## Edge cases to handle

### Repeated incomplete prompt

```text
User: Explore this problem:
Pi: Describe the problem you want to explore.
User: Explore this problem:
Pi: Describe the problem you want to explore.
```

Should keep waiting. It should not create validation state.

### Help while pending

```text
User: Explore this problem:
Pi: Describe the problem you want to explore.
User: help
Pi: [help]
User: Are there infinitely many primes of the form n^2 + 1?
Pi: Research workspace prepared
```

### Complete exploration while pending

```text
User: Explore this problem:
Pi: Describe the problem you want to explore.
User: Explore this problem: Are there infinitely many primes of the form n^2 + 1?
Pi: Research workspace prepared
```

Should not include the literal prefix in `rootQuestion`.

### Validation after pending exploration

This is ambiguous:

```text
User: Explore this problem:
User: Validate this proof: ...
```

For now, the simplest acceptable behavior is to treat the second message as the exploration problem. But if you can implement a clear cancellation rule safely, this is better:

```text
User: Explore this problem:
User: cancel
Pi: Exploration setup cancelled.
User: Validate this proof: ...
Pi: validation mode
```

Do not overbuild this unless it is simple.

## Tests to add

Add tests in:

```text
packages/coding-agent/test/comath-harness.test.ts
```

### Test 1: incomplete exploration prompt does not initialize validation

Arrange a harness with a backend command recorder.

Act:

```ts
await harness.handlePrompt("Explore this problem:");
```

Assert:

```ts
expect(notices.join("\n")).toContain("Describe the problem you want to explore");
expect(commands).toEqual([]);
```

Also assert product copy does not contain forbidden internal terms.

### Test 2: next message completes pending exploration

Act:

```ts
await harness.handlePrompt("Explore this problem:");
await harness.handlePrompt("Are there infinitely many primes of the form n^2 + 1?");
```

Backend stub should save empty project state when it sees `init ...`, like existing tests.

Assert:

```ts
expect(visible).toContain("Research workspace prepared");
expect(visible).toContain("Small examples and counterexamples");
expect(visible).toContain("Direct proof attempt");
expect(commands).toEqual(["init Are there infinitely many primes of the form n^2 + 1?"]);
expect(commands.some((command) => command.startsWith("workstream "))).toBe(false);
expect(commands.some((command) => command.startsWith("queue workstream "))).toBe(false);
```

### Test 3: help while pending keeps pending exploration

Act:

```ts
await harness.handlePrompt("Explore this problem:");
await harness.handlePrompt("help");
await harness.handlePrompt("Are there infinitely many primes of the form n^2 + 1?");
```

Assert:

```ts
expect(visible).toContain("Research workspace prepared");
expect(commands).toEqual(["init Are there infinitely many primes of the form n^2 + 1?"]);
```

### Test 4: complete exploration prompt while pending extracts problem text

Act:

```ts
await harness.handlePrompt("Explore this problem:");
await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
```

Assert:

```ts
expect(commands).toEqual(["init Are there infinitely many primes of the form n^2 + 1?"]);
```

### Test 5: existing single-line exploration still works

Keep or add:

```ts
await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
```

Assert research workspace behavior.

### Test 6: validation still works

Use an existing validation test or add a small one proving that a normal first prompt still creates the validation plan, not research paths.

## Manual smoke test

After implementation and tests, run:

```bash
rm -rf /tmp/comath-research-demo
mkdir -p /tmp/comath-research-demo
cd /tmp/comath-research-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Submit exactly as two messages:

```text
Explore this problem:
```

Expected:

```text
Describe the problem you want to explore.
```

Then submit:

```text
Are there infinitely many primes of the form n^2 + 1?
```

Expected:

```text
Research workspace prepared
```

and the five paths appear.

Then test steering:

```text
summarize current state
```

Expected:

```text
Current research state
```

Then:

```text
focus on counterexamples
```

Expected:

```text
Focus updated
```

Then:

```text
drop the direct proof path
```

Expected:

```text
Path updated
```

Then:

```text
try a weaker theorem
```

Expected:

```text
Focus updated
```

Then:

```text
continue
```

Expected:

```text
Research round updated
```

## Validation commands

Run focused tests from the package root:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run \
  test/comath-harness.test.ts \
  test/comath-progress.test.ts \
  test/comath-backend-output.test.ts \
  test/co-math-extension.test.ts \
  test/co-math-natural-language.test.ts \
  test/co-math-state.test.ts \
  test/comath-research-autoplan.test.ts
```

Then run repository checks:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

## Completion checklist

Before handing back:

```text
[ ] Two-message exploration prompt starts research mode.
[ ] First incomplete prompt does not run backend commands.
[ ] Single-line exploration still works.
[ ] Validation mode still works.
[ ] Help while pending does not break the pending exploration request.
[ ] Product copy avoids internal implementation terms.
[ ] Focused tests pass.
[ ] npm run check passes.
[ ] git diff --check passes.
[ ] No commit made.
```

## Handoff summary format

When done, report:

```text
Implemented pending exploration intent fix.

Changed files:
- ...

Behavior verified:
- Explore this problem: [two-message flow] -> Research workspace prepared
- Single-line exploration still works
- Validation still routes to validation mode

Validation:
- focused vitest command: passed
- npm run check: passed
- git diff --check: passed

No commit made.
```
