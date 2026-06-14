# Co-Math Research Exploration Mode Implementation Plan

> **For Codex:** Implement this plan on a new branch. Do not commit unless explicitly asked. Keep the current proof-validation flow working while adding an ambitious but bounded vertical slice of Google-style research exploration.

**Goal:** Add a first product-facing co-math research exploration mode where Pi can explore multiple mathematical paths over time, accept changing objectives, and summarize the evolving research state.

**Architecture:** Reuse the existing Pi co-math harness, state, natural-language parsing, and backend command plumbing where possible. Add the smallest state/model changes needed to represent research paths and route exploration requests separately from proof validation. User-facing output must feel like a research notebook, not a debug view of workstreams, role runs, queues, or schema internals.

**Tech Stack:** TypeScript, existing Pi interactive mode, existing co-math harness under `packages/coding-agent/src/modes/comath/`, existing co-math extension under `packages/coding-agent/examples/extensions/co-math/`, Vitest.

---

## Motivation

The current co-math implementation is useful for source-backed proof validation and audit workflows, but the main product goal is broader. Co-math should behave like a mathematical research collaborator, not only a proof checker.

The Google AI co-mathematician paper in `docs/2605.06651v2.pdf` emphasizes:

- mathematics beyond final proofs;
- iterative refinement of intent;
- multiple exploration paths;
- asynchronous specialized agents;
- long-running work that can continue while the user steers;
- progressive disclosure of research state;
- living mathematical artifacts / working-paper style summaries;
- rigorous uncertainty management.

The current Pi co-math branch already has useful infrastructure:

- first-class `pi comath` entrypoint;
- project state under `.pi/co-math`;
- goals, workstreams, role runs, reports, blockers, transcripts;
- natural-language steering for validation flows;
- background audit runs and visible progress;
- product-output sanitization that hides internal IDs and parser failures.

This plan asks Codex to add a bounded research-exploration vertical slice on top of that infrastructure.

---

## Expected End Result

From a clean folder:

```bash
rm -rf /tmp/comath-research-demo
mkdir -p /tmp/comath-research-demo
cd /tmp/comath-research-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

The user types:

```text
Explore this problem:
Are there infinitely many primes of the form n^2 + 1?
```

Pi should show a product-facing response like:

```text
Research workspace prepared

I’ll explore several possible paths:
- Check small examples and possible counterexamples.
- Try direct number-theoretic arguments.
- Look for a useful reformulation.
- Try weaker special cases.
- Look for known theorem reductions or related literature.

Next
I’ll start with small examples, because they can quickly reveal what is plausible.
```

Then the user can type natural steering prompts:

```text
summarize current state
```

Expected style:

```text
Current research state

Active paths
- Small examples and counterexamples: active. Next: compute or list more examples.
- Direct proof attempt: active. Next: look for a useful congruence or density obstruction.
- Weaker special cases: active. Next: identify a tractable related statement.

Most promising next move
Continue the small-examples path, then use the pattern to choose a sharper conjecture.
```

The user can type:

```text
focus on counterexamples
```

Expected style:

```text
Focus updated

I’ll prioritize the small examples and counterexamples path.

Next
Continue that path and report any obstruction or pattern found.
```

The user can type:

```text
drop the direct proof path
```

Expected style:

```text
Path updated

Abandoned for now:
- Direct proof attempt

Reason
The user asked to drop this path.
```

Normal product copy must not expose:

```text
role-run
workstream
artifact
queue
schema
claim-1
workstream-foo
/comath
/co
```

Debug commands may still exist, but they must not be required for the beginner/product flow.

---

## Non-Goals

Do not implement the full Google co-mathematician system in one pass.

Do not:

- remove or rewrite proof-validation mode;
- remove `/co` or `/comath` debug/advanced commands;
- add a web UI;
- add a theorem prover;
- add paid external APIs;
- silently mark mathematical claims as proved without evidence;
- do a broad schema rewrite if a small state extension is enough;
- create a background daemon scheduler;
- commit or push without explicit user instruction.

The goal is an ambitious but reviewable vertical slice.

---

## Branch and Safety Instructions

Before editing:

```bash
cd /home/hermes/developer/pi-mono-comath
git status --short --branch
```

If not already on a dedicated branch, create one:

```bash
git switch -c comath/research-exploration-mode
```

If the branch already exists:

```bash
git switch comath/research-exploration-mode
```

Do not stage or commit runtime files:

```text
.pi/co-math/state.json
.pi/co-math/transcripts/*
```

Do not use `git add .` or `git add -A`.

---

## Current Files to Inspect

Start by reading these files:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-autoplan.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
packages/coding-agent/src/modes/comath/comath-backend-output.ts
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/examples/extensions/co-math/natural-language.ts
packages/coding-agent/examples/extensions/co-math/natural-language-help.ts
packages/coding-agent/examples/extensions/co-math/commands.ts
packages/coding-agent/test/comath-harness.test.ts
packages/coding-agent/test/comath-progress.test.ts
packages/coding-agent/test/comath-backend-output.test.ts
packages/coding-agent/test/co-math-extension.test.ts
packages/coding-agent/test/co-math-natural-language.test.ts
packages/coding-agent/test/co-math-state.test.ts
```

Also skim the relevant paper sections in `docs/2605.06651v2.pdf`, especially the parts about:

- multiple exploration paths;
- project coordinator;
- workstreams;
- iterative refinement;
- progressive disclosure;
- working paper / research artifacts.

If using local extraction:

```bash
pdftotext -layout docs/2605.06651v2.pdf /tmp/2605.06651v2.txt
```

---

## Product Model

Add a clear product distinction between two intents:

```text
Validate this proof: checks/audits a given proof or source-backed claim.
Explore this problem: creates and steers a multi-path research exploration workspace.
```

Exploration mode should start when the user says something like:

```text
Explore this problem: ...
Research this problem: ...
Find approaches to this problem: ...
Try to solve this problem: ...
Investigate this conjecture: ...
```

Validation mode must still start for prompts like:

```text
Validate this proof.
Check this proof.
Audit this argument.
```

---

## State Model

Prefer the smallest clean state extension.

Suggested field on `CoMathProjectState`:

```ts
researchPaths?: ResearchPath[];
researchFocus?: {
	pathIds: string[];
	reason: string;
	updatedAt: string;
};
```

Suggested type:

```ts
export interface ResearchPath {
	id: string;
	title: string;
	objective: string;
	status: "active" | "promising" | "blocked" | "abandoned" | "resolved";
	latestFindings: string[];
	blockers: string[];
	suggestedNextMove: string;
	priority: number;
	createdAt: string;
	updatedAt: string;
}
```

If the existing workstream model can support this without awkward product copy, reuse it internally. But the product-facing output should say `path`, not `workstream`.

Important:

- Preserve backward compatibility for existing `.pi/co-math/state.json` files.
- Loading old state should default missing `researchPaths` to an empty array.
- Do not require migration commands for old state.

---

## Suggested Default Research Paths

When exploration starts, create several paths. Keep them simple and general:

```text
1. Small examples and counterexamples
2. Direct proof attempt
3. Reformulation
4. Weaker special cases
5. Known theorem or literature reduction
```

Each path should have a concrete objective and suggested next move.

Example for the problem `Are there infinitely many primes of the form n^2 + 1?`:

```text
Small examples and counterexamples
Objective: List initial values of n^2 + 1 and note which are prime/composite.
Suggested next move: Compute or manually inspect small n and look for modular obstructions.

Direct proof attempt
Objective: Look for a direct number-theoretic proof or obstruction.
Suggested next move: Check whether simple Euclid-style arguments apply or fail.

Reformulation
Objective: Reformulate the question in terms of polynomial prime values or known conjectures.
Suggested next move: Relate the statement to Bunyakovsky/Schinzel-type heuristics without claiming a proof.

Weaker special cases
Objective: Identify tractable weaker statements or finite computations.
Suggested next move: Prove there are many n for which n^2 + 1 has no small prime divisor, if possible.

Known theorem or literature reduction
Objective: Identify whether known theorems settle, imply, or obstruct the problem.
Suggested next move: Search memory/source context first; if no source is registered, state uncertainty rather than invent references.
```

Do not hardcode this problem. The defaults should adapt to arbitrary problem text.

---

## Implementation Tasks

### Task 1: Add failing tests for exploration intent parsing

**Objective:** Prove that natural-language parsing can distinguish exploration requests from validation requests.

**Files:**

- Modify: `packages/coding-agent/test/co-math-natural-language.test.ts`
- Modify later: `packages/coding-agent/examples/extensions/co-math/natural-language.ts`

Add tests for prompts like:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
Research this problem: classify small examples of X.
Find approaches to this conjecture: every foo has bar.
```

Expected parsed intent should include enough information for the harness/backend to start exploration mode, for example:

```ts
{
	type: "explore_problem",
	problemText: "Are there infinitely many primes of the form n^2 + 1?"
}
```

Also add a regression that validation remains validation:

```text
Validate this proof: ...
```

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-natural-language.test.ts
```

Expected initially: failing tests for the new intent.

---

### Task 2: Implement exploration intent parsing

**Objective:** Add the minimal parser support for exploration prompts.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/natural-language.ts`
- Modify if needed: `packages/coding-agent/examples/extensions/co-math/natural-language-help.ts`

Requirements:

- Detect `Explore this problem:`, `Research this problem:`, `Find approaches to`, `Investigate this conjecture`, and similar simple forms.
- Extract clean `problemText`.
- Do not route `Validate this proof` into exploration.
- Keep unknown prompts behavior unchanged.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-natural-language.test.ts
```

Expected: tests pass.

---

### Task 3: Add state model and storage helpers for research paths

**Objective:** Represent persistent research paths in co-math state.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/schema.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`
- Modify: `packages/coding-agent/test/co-math-state.test.ts`

Add or reuse types for:

```ts
ResearchPath
researchPaths
researchFocus
```

Add storage helpers such as:

```ts
addResearchPath(state, input)
updateResearchPath(state, pathId, patch)
setResearchFocus(state, pathIds, reason)
getActiveResearchPaths(state)
```

Keep helper names consistent with existing storage style.

Tests should cover:

- empty state has no research paths;
- adding paths assigns stable IDs;
- updating status to `abandoned` works;
- setting focus records focused paths and reason;
- old/minimal state without `researchPaths` loads safely.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts
```

---

### Task 4: Create deterministic exploration autoplan

**Objective:** Create multiple default research paths from a problem statement.

**Files:**

- Create or modify: `packages/coding-agent/src/modes/comath/comath-research-autoplan.ts`
- Test: `packages/coding-agent/test/comath-research-autoplan.test.ts` or existing `test/comath-harness.test.ts`

Add a deterministic planner function, for example:

```ts
export interface CoMathResearchAutoPlan {
	rootQuestion: string;
	paths: Array<{
		slug: string;
		title: string;
		objective: string;
		suggestedNextMove: string;
		priority: number;
	}>;
	initialFocusSlug: string;
}

export function createCoMathResearchAutoPlan(problemText: string): CoMathResearchAutoPlan;
```

It should create at least the five default paths:

```text
small examples and counterexamples
direct proof attempt
reformulation
weaker special cases
known theorem or literature reduction
```

Tests should assert:

- at least five paths are created;
- titles are beginner-readable;
- objectives include the original problem label where useful;
- no internal terms appear.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/comath-research-autoplan.test.ts
```

If adding a new test file is too much, put tests in `test/comath-harness.test.ts`, but prefer a focused file if the repo style allows it.

---

### Task 5: Add product formatting for research state

**Objective:** Render research paths as a notebook-like product summary.

**Files:**

- Modify or create: `packages/coding-agent/src/modes/comath/comath-progress.ts`
- Possibly modify: `packages/coding-agent/src/modes/comath/comath-backend-output.ts`
- Test: `packages/coding-agent/test/comath-progress.test.ts`

Add formatter functions such as:

```ts
formatResearchWorkspacePrepared(plan)
formatResearchStateSummary(state)
formatResearchFocusUpdated(path, reason)
formatResearchPathDropped(path, reason)
```

Product copy should include headings like:

```text
Research workspace prepared
Current research state
Active paths
Promising paths
Blocked paths
Abandoned for now
Most promising next move
Next
```

Product copy must not include:

```text
role-run
workstream
artifact
queue
schema
claim-1
workstream-foo
/comath
/co
```

Tests should check that copy is readable and sanitized.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/comath-progress.test.ts
```

---

### Task 6: Wire exploration start into the first-class harness

**Objective:** When the user says `Explore this problem: ...`, create a research workspace and paths.

**Files:**

- Modify: `packages/coding-agent/src/modes/comath/comath-harness.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts` if the harness uses backend commands for state mutation
- Test: `packages/coding-agent/test/comath-harness.test.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts` if backend command coverage is needed

Behavior:

- If no co-math project exists, initialize one with the exploration problem as root question.
- Create default research paths.
- Set initial focus to the highest-priority path, probably small examples/counterexamples.
- Notify the user with `Research workspace prepared` output.
- Do not start proof-validation audit workstreams for exploration prompts.
- Keep `Validate this proof` behavior unchanged.

Tests:

- exploration prompt creates research paths;
- validation prompt still creates validation/audit plan;
- product output lists research paths;
- no internal IDs/terms in product output.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/comath-harness.test.ts test/co-math-extension.test.ts
```

---

### Task 7: Add steering commands for research mode

**Objective:** Let the user change objectives and path priority over time.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/natural-language.ts`
- Modify: `packages/coding-agent/src/modes/comath/comath-harness.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts` if needed
- Tests:
  - `packages/coding-agent/test/co-math-natural-language.test.ts`
  - `packages/coding-agent/test/comath-harness.test.ts`
  - `packages/coding-agent/test/co-math-extension.test.ts`

Support at least:

```text
summarize current state
what is most promising?
focus on counterexamples
continue
continue path 1
continue the counterexample path
drop path 1
drop the direct proof path
try a weaker theorem
```

Expected behavior:

- `summarize current state` renders the research notebook summary.
- `what is most promising?` identifies the active/promising highest-priority path and next move.
- `focus on counterexamples` sets focus to the matching path.
- `drop path 1` or `drop the direct proof path` marks that path `abandoned`.
- `try a weaker theorem` either focuses the weaker-special-cases path or creates/updates such a path.
- `continue` chooses the focused path if one exists; otherwise chooses the highest-priority active/promising path.

Do not implement a full autonomous long-running researcher in this task. The first vertical slice may produce deterministic next-step summaries and optionally start one existing background role run if that fits the architecture cleanly.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-natural-language.test.ts test/comath-harness.test.ts test/co-math-extension.test.ts
```

---

### Task 8: Add a minimal long-horizon continuation hook

**Objective:** Make `continue` in exploration mode feel like continuing research, not rerunning validation.

**Files:**

- Modify: `packages/coding-agent/src/modes/comath/comath-harness.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts` if backend state updates are required
- Test: `packages/coding-agent/test/comath-harness.test.ts`

Minimal acceptable behavior:

- Pick the current focus path or most promising active path.
- Append a deterministic latest finding or next-step note showing that another research round happened.
- Update `updatedAt`.
- Render a product-facing summary like:

```text
Research round updated

Path
Small examples and counterexamples

Finding
No conclusion yet. This path should next inspect more examples or modular obstructions.

Next
Continue this path, switch focus, or summarize current state.
```

If it is easy and safe to dispatch an existing background role run for one path, do so. But do not block the vertical slice on deep background-agent orchestration.

Tests:

- `continue` updates the focused path;
- `continue` does not create validation audit output;
- product copy stays beginner-readable.

---

### Task 9: Add manual smoke-test documentation

**Objective:** Give humans a clean way to test the new exploration mode.

**Files:**

- Create: `docs/comath-research-exploration-smoke.md`

Include copy/paste steps:

```bash
rm -rf /tmp/comath-research-demo
mkdir -p /tmp/comath-research-demo
cd /tmp/comath-research-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Then prompts:

```text
Explore this problem:
Are there infinitely many primes of the form n^2 + 1?
```

```text
summarize current state
```

```text
focus on counterexamples
```

```text
drop the direct proof path
```

```text
try a weaker theorem
```

```text
continue
```

Success criteria:

```text
[ ] Pi creates multiple research paths.
[ ] User input is visible in the main Pi interface.
[ ] Product copy says path/research, not role-run/workstream/queue.
[ ] User can focus on counterexamples.
[ ] User can abandon a path.
[ ] User can ask for a summary.
[ ] Existing validation flow still works in a separate clean folder.
```

Do not include tmux or transcript inspection in the beginner smoke test unless needed for debugging.

---

### Task 10: Run focused tests and full check

**Objective:** Verify the implementation before handing back for review.

Run focused tests:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/comath-harness.test.ts test/comath-progress.test.ts test/comath-backend-output.test.ts test/co-math-extension.test.ts test/co-math-natural-language.test.ts test/co-math-state.test.ts
```

If you added a new research autoplan test file, include it:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/comath-research-autoplan.test.ts
```

Then run full check from repo root:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
```

Expected:

```text
all focused tests pass
npm run check passes with no errors, warnings, or infos
```

Also run:

```bash
git diff --check
```

Expected: no output.

Finally check dirty files:

```bash
git status --short
```

Expected: only source, test, and docs files related to this implementation. No `.pi/co-math` runtime state or transcript files.

---

## Manual Validation Script for the Implementer

After tests pass, manually smoke-test from a clean folder:

```bash
rm -rf /tmp/comath-research-demo
mkdir -p /tmp/comath-research-demo
cd /tmp/comath-research-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi, type:

```text
Explore this problem:
Are there infinitely many primes of the form n^2 + 1?
```

Check:

```text
[ ] Your pasted prompt is visible in the main interface.
[ ] Pi says Research workspace prepared.
[ ] Pi lists multiple paths.
[ ] Pi recommends a next move.
[ ] Pi does not expose role-run/workstream/queue/schema language in normal copy.
```

Then type:

```text
summarize current state
```

Check:

```text
[ ] Pi lists path statuses.
[ ] Pi says what is promising or what to do next.
```

Then type:

```text
focus on counterexamples
```

Check:

```text
[ ] Pi prioritizes the small examples / counterexamples path.
```

Then type:

```text
drop the direct proof path
```

Check:

```text
[ ] Pi marks the direct proof path abandoned or abandoned for now.
```

Then type:

```text
continue
```

Check:

```text
[ ] Pi continues the focused/promising research path.
[ ] It does not switch back to validation mode unexpectedly.
```

Also verify validation still works in a separate clean folder:

```bash
rm -rf /tmp/comath-validation-demo
mkdir -p /tmp/comath-validation-demo
cd /tmp/comath-validation-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi, paste:

```text
Validate this proof.

Problem:
Prove that there are infinitely many prime numbers.

Candidate proof:
Suppose there are only finitely many primes, called p1, p2, ..., pk.
Let N = p1 * p2 * ... * pk + 1.
Then N is not divisible by any of p1, p2, ..., pk.
Therefore N is prime.
This gives a new prime, contradicting the assumption that p1, p2, ..., pk were all the primes.
So there are infinitely many primes.

Please check whether this proof is correct. If it has a flaw, explain the smallest fix.
```

Expected:

```text
[ ] Pi treats this as proof validation, not research exploration.
[ ] Pi catches that “Therefore N is prime” is not justified.
```

---

## Product Copy Rules

Normal exploration-mode output should use these terms:

```text
research workspace
path
objective
finding
blocker
next move
current research state
promising path
abandoned for now
```

Avoid these in normal product copy:

```text
role-run
workstream
artifact
queue
dispatch
schema
claim id
report id
/co
/comath
```

Transcript paths may still appear only when useful for debugging or advanced status, but they should not be the main beginner-facing result.

---

## Risks and Tradeoffs

### Risk: Overbuilding a new architecture

Mitigation: Reuse existing state and harness plumbing. Add only small research-path state and formatters.

### Risk: Exploration mode becomes fake progress

Mitigation: Be honest. Use language like:

```text
No conclusion yet.
This path suggests the next useful move is...
```

Do not claim a theorem is proved without evidence.

### Risk: Product copy leaks internal machinery

Mitigation: Add tests that assert forbidden terms do not appear in normal exploration output.

### Risk: Validation mode regresses

Mitigation: Add explicit tests and manual smoke for `Validate this proof`.

### Risk: Long-running autonomous research is too large for this slice

Mitigation: Implement a minimal continuation hook first. It is acceptable for `continue` to update and summarize the current path deterministically, as long as the state model and UX support later background-agent expansion.

---

## Handoff Checklist

Before handing back for review, Codex should report:

```text
- Branch name
- Files changed
- Focused test output
- npm run check output
- Manual smoke-test result
- Any known limitations
```

Do not commit unless the user explicitly asks.

Do not hide failures. If a test or manual smoke fails, report it directly and explain what remains.
