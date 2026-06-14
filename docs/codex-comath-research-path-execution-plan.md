# Co-Math Research Path Execution and Working-Paper Synthesis Plan

> **For Codex:** Implement this plan on the current co-math branch or a new feature branch if requested by the user. Do not commit unless explicitly asked. Keep research exploration mode and proof-validation mode working.

**Goal:** Turn research paths from static planning/steering records into executable research rounds that produce useful findings, update path state, track uncertainty, and synthesize into the living working paper.

**Architecture:** Reuse the current co-math research exploration state (`researchPaths`, `researchFocus`) and existing working-paper/margin-note structures. Add a small deterministic path-execution layer for the five default research paths, then wire `continue`, `continue path N`, and named-path continuations to run a path-specific research round instead of saving placeholder text.

**Tech Stack:** TypeScript, existing Pi co-math harness, existing co-math storage/schema helpers, Vitest tests under `packages/coding-agent/test/`.

---

## Motivation

The current implementation added a valuable first vertical slice:

```text
Explore this problem
→ create five research paths
→ steer focus/drop/continue
→ summarize current state
```

That matches the Google AI co-mathematician paper’s emphasis on multiple exploration paths and flexible steering. But the current `continue` behavior still uses a placeholder finding:

```text
No conclusion yet. This path should next inspect more examples or sharpen the obstruction.
```

The paper’s framework is broader. It emphasizes:

```text
- open-ended research
- computational exploration
- theorem/proof attempts
- theory building
- uncertainty management
- failed hypothesis tracking
- living working paper artifacts
- asynchronous/stateful workspaces
```

The next milestone should make research paths actually do useful work, while staying bounded and testable.

---

## Expected End Result

From a clean folder:

```bash
cd /tmp/comath-path-execution-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

User types:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
```

Pi responds:

```text
Research workspace prepared

I’ll explore several possible paths:
- Path 1: Small examples and counterexamples: ...
- Path 2: Direct proof attempt: ...
- Path 3: Reformulation: ...
- Path 4: Weaker special cases: ...
- Path 5: Known theorem or literature reduction: ...

Next
I’ll start with Path 1: Small examples and counterexamples, because it can quickly reveal what is plausible.
```

User types:

```text
continue path 1
```

Pi should no longer return a generic placeholder. It should produce a path-specific research round:

```text
Research round completed

Path 1: Small examples and counterexamples

Findings
- n = 0 gives 1, not prime.
- n = 1 gives 2, prime.
- n = 2 gives 5, prime.
- n = 3 gives 10, not prime.
- n = 4 gives 17, prime.
- n = 5 gives 26, not prime.

Uncertainty
- These examples do not prove or disprove infinitude.
- The even/odd behavior suggests a simple obstruction should be separated from deeper prime-producing behavior.

Next
Separate parity obstructions from the odd-n case, then check more odd examples.

Working paper updated
- Added notes under “Examples and evidence.”
```

Then:

```text
summarize current state
```

should include accumulated findings, uncertainty, and the updated next move.

A later:

```text
continue path 2
```

should run a direct proof-attempt round, not the example/counterexample strategy.

Validation mode must still work:

```text
Validate this proof: ...
```

must not create research paths unless the user explicitly asks to explore/research.

---

## Non-Goals

Do not implement the whole Google co-math framework in this milestone.

Do not add yet:

```text
- daemonized periodic research loops
- parallel real multi-agent execution
- web UI
- external paid API calls
- full theorem prover integration
- full literature search integration
- new npm dependencies
- broad schema rewrite
```

This milestone should be a bounded, testable product slice:

```text
research path → executable deterministic round → state update → working-paper synthesis
```

---

## Current Context

Recent commits already added:

```text
663dabd6 feat(coding-agent): add co-math research exploration mode
b65ed946 docs(coding-agent): prune superseded co-math handoff plans
```

Important current behavior:

```text
- `Explore this problem: ...` creates five deterministic paths.
- `Explore this problem:` followed by a second user message works.
- `focus on path 2`, `drop path 2`, `continue path 2`, and `continue path 99` have tests.
- `continue path 2` currently updates only path 2, but the finding is still generic.
```

Relevant files:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
packages/coding-agent/src/modes/comath/comath-research-autoplan.ts
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/test/comath-harness.test.ts
packages/coding-agent/test/comath-progress.test.ts
packages/coding-agent/test/comath-research-autoplan.test.ts
packages/coding-agent/test/co-math-state.test.ts
```

Existing working-paper-related files/helpers are likely in:

```text
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/commands.ts
```

Inspect those before adding new state.

---

## Design Principles

1. Product mode first.

Normal user output should read like a research notebook, not backend logs.

Avoid these terms in normal product copy:

```text
role-run
workstream
queue
schema
artifact
backend
JSON
```

2. Preserve uncertainty.

Do not imply a theorem is proved unless the system actually has proof evidence.

Use language like:

```text
Evidence
Uncertainty
Possible obstruction
Next move
```

3. Keep path strategies deterministic for now.

This milestone should be reliable under tests. Do not require actual LLM calls for path execution.

4. Reuse current state.

Prefer updating:

```text
researchPaths.latestFindings
researchPaths.blockers
researchPaths.suggestedNextMove
workingPaperSections
marginNotes
events
```

Do not introduce a large new schema unless the existing structures are insufficient.

5. Avoid fake proof claims.

Example computations are evidence, not proof. Proof attempts are sketches with gaps unless fully justified.

---

## Proposed Approach

Add a new path-execution module:

```text
packages/coding-agent/src/modes/comath/comath-research-execution.ts
```

It should export something like:

```ts
export interface ResearchRoundResult {
	pathId: string;
	pathTitle: string;
	findings: string[];
	uncertainties: string[];
	blockers: string[];
	suggestedNextMove: string;
	workingPaperSectionTitle: string;
	workingPaperSummary: string;
}

export function runResearchPathRound(input: {
	rootQuestion: string;
	path: ResearchPath;
	allPaths: readonly ResearchPath[];
	now: string;
}): ResearchRoundResult;
```

The implementation can dispatch by path title or id. Since the default autoplan is deterministic, start by handling the five default path titles:

```text
Small examples and counterexamples
Direct proof attempt
Reformulation
Weaker special cases
Known theorem or literature reduction
```

For unknown/custom paths, return a safe generic research round, but it must still be better than the old placeholder.

---

## Path-Specific Strategy Requirements

### Path 1: Small examples and counterexamples

For mathematical expressions that look computationally simple, generate a small finite table.

Minimum required special case:

```text
Are there infinitely many primes of the form n^2 + 1?
```

For that problem, compute/check values for small `n` deterministically without external dependencies.

Acceptable deterministic output:

```text
n = 0 gives 1, not prime.
n = 1 gives 2, prime.
n = 2 gives 5, prime.
n = 3 gives 10, not prime.
n = 4 gives 17, prime.
n = 5 gives 26, not prime.
n = 6 gives 37, prime.
n = 7 gives 50, not prime.
n = 8 gives 65, not prime.
n = 9 gives 82, not prime.
n = 10 gives 101, prime.
```

Important:

```text
- Do not claim this proves infinitude.
- Explicitly record uncertainty.
- Explain the parity obstruction: odd n > 1 gives even n^2 + 1 > 2, hence composite.
- Suggest checking even n or reformulating around parity.
```

If the root question is not recognized as computationally simple, produce a generic examples strategy:

```text
- Identify a small parameter range.
- Check the first few cases manually or computationally.
- Record whether any obstruction appears.
```

### Path 2: Direct proof attempt

Produce a cautious proof-strategy round.

For `n^2 + 1` primes, output should note:

```text
- A Euclid-style argument is not immediate because multiplying known primes does not preserve the form n^2 + 1.
- Parity eliminates odd n > 1 but does not settle even n.
- This resembles hard prime-values-of-polynomials questions.
```

Do not claim a proof.

Suggested next move:

```text
Try to prove a weaker statement or gather stronger computational evidence before attempting the full infinitude claim.
```

### Path 3: Reformulation

Produce possible reformulations:

```text
- prime values of polynomial f(n) = n^2 + 1
- restrict to even n after parity reduction
- relation to Bunyakovsky-type expectations / prime-producing polynomials, if stated cautiously
```

No source-backed literature claim unless a source exists. Without source, use language like:

```text
This suggests a literature-search target, not a verified theorem citation.
```

### Path 4: Weaker special cases

Propose weaker claims:

```text
- There are infinitely many n such that n^2 + 1 has no small prime factor up to B.
- There are several prime values up to a small bound.
- Characterize parity obstruction exactly.
- Prove odd n > 1 never works.
```

Optionally fully prove the parity lemma:

```text
If n is odd and n > 1, then n^2 is odd, so n^2 + 1 is even and greater than 2, hence composite.
```

### Path 5: Known theorem or literature reduction

Without external search, this path should produce source-search targets and uncertainty, not fabricated references.

For `n^2 + 1`, acceptable:

```text
- This resembles prime values of irreducible polynomials.
- Search targets: Bunyakovsky conjecture, Schinzel's hypothesis H, Landau's problems, primes of the form n^2 + 1.
- Current project has not registered a source proving the claim.
```

Do not assert the exact status unless source-backed. If you mention “open problem,” qualify it unless a source is registered.

---

## State Update Requirements

After a successful research round:

1. Update the selected research path:

```text
latestFindings += result.findings
blockers += result.blockers / uncertainties if useful
suggestedNextMove = result.suggestedNextMove
updatedAt = now
```

2. Add or update a working paper section.

Use existing helpers if available. If no helper fits, add a minimal one in storage.

Suggested section titles:

```text
Examples and evidence
Direct proof attempts
Reformulations
Weaker statements
Literature/theorem targets
```

The section should include a concise summary of the round.

3. Add margin notes for uncertainty/blockers if existing margin-note helpers are suitable.

Examples:

```text
kind: warning or gap
status: open
summary: These examples do not prove infinitude.
```

4. Add an event.

Use an existing event kind if suitable. Avoid adding many new event kinds unless needed.

---

## Product Output Requirements

Add formatter in `comath-progress.ts`, or use a new formatter module if cleaner.

Output shape:

```text
Research round completed

Path 1: Small examples and counterexamples

Findings
- ...
- ...

Uncertainty
- ...

Next
...

Working paper updated
- Added notes under “Examples and evidence.”
```

For unknown/custom paths:

```text
Research round completed

Path N: <title>

Findings
- I clarified what this path should inspect next.
- No theorem-level conclusion has been established yet.

Uncertainty
- This path still needs source-backed definitions, examples, or a precise subclaim.

Next
<path.suggestedNextMove or a better generated next move>
```

`formatResearchStateSummary` should include accumulated findings in compact form, e.g.:

```text
Path 1: Small examples and counterexamples: active
Latest findings
- n = 1 gives 2, prime.
- n = 3 gives 10, not prime.
Next: Separate parity obstruction from odd/even cases.
```

Keep summary concise; do not dump huge arrays.

---

## Implementation Tasks

### Task 1: Inspect existing working-paper storage helpers

Objective: Reuse existing state helpers instead of creating duplicate structures.

Files to inspect:

```text
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/commands.ts
packages/coding-agent/test/co-math-state.test.ts
```

Look for helpers involving:

```text
workingPaperSections
marginNotes
addWorkingPaperSection
updateWorkingPaperSection
addMarginNote
addSynthesisEvent
```

Do not edit yet. Record which helper to use.

### Task 2: Add failing tests for path-specific round execution

Objective: Define the new expected behavior before implementation.

Modify:

```text
packages/coding-agent/test/comath-harness.test.ts
```

Add tests for:

```text
1. continue path 1 records example/counterexample findings.
2. continue path 2 records direct-proof-attempt findings, not path 1 findings.
3. continue path 1 updates workingPaperSections.
4. summarize current state after continue includes latest findings.
5. continue path 99 still warns and does not update another path.
```

Expected checks for path 1:

```ts
expect(state.researchPaths[0]?.latestFindings.join("\n")).toContain("n = 1 gives 2, prime");
expect(state.researchPaths[0]?.latestFindings.join("\n")).toContain("n = 3 gives 10, not prime");
expect(state.researchPaths[0]?.suggestedNextMove).toContain("parity");
expect(state.workingPaperSections.some((section) => section.title.includes("Examples"))).toBe(true);
```

Expected checks for product copy:

```ts
expect(visible).toContain("Research round completed");
expect(visible).toContain("Path 1: Small examples and counterexamples");
expect(visible).toContain("Findings");
expect(visible).toContain("Uncertainty");
expect(visible).toContain("Working paper updated");
expectProductCopy(visible);
```

Run test and expect failure:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/comath-harness.test.ts
```

### Task 3: Add research execution module

Objective: Create the deterministic path-execution layer.

Create:

```text
packages/coding-agent/src/modes/comath/comath-research-execution.ts
```

Suggested exports:

```ts
import type { ResearchPath } from "../../../examples/extensions/co-math/schema.ts";

export interface ResearchRoundResult {
	pathId: string;
	pathTitle: string;
	findings: string[];
	uncertainties: string[];
	blockers: string[];
	suggestedNextMove: string;
	workingPaperSectionTitle: string;
	workingPaperSummary: string;
}

export function runResearchPathRound(input: {
	rootQuestion: string;
	path: ResearchPath;
	allPaths: readonly ResearchPath[];
	now: string;
}): ResearchRoundResult {
	// dispatch by normalized title
}
```

Use top-level imports only. No inline imports.

No `any`.

Use erasable TypeScript syntax only.

### Task 4: Implement small examples strategy

Objective: Make path 1 useful for simple computational examples.

Inside the new execution module:

```text
- detect questions containing `n^2 + 1` or `n² + 1`
- compute values for n = 0..10
- use a small deterministic primality helper
- return findings, uncertainty, next move, working-paper section metadata
```

Primality helper should be local, simple, and tested indirectly:

```ts
function isPrime(value: number): boolean {
	if (value < 2) return false;
	for (let divisor = 2; divisor * divisor <= value; divisor += 1) {
		if (value % divisor === 0) return false;
	}
	return true;
}
```

Expected findings include:

```text
n = 0 gives 1, not prime.
n = 1 gives 2, prime.
n = 3 gives 10, not prime.
```

### Task 5: Implement the other four default strategies

Objective: Make each default path produce path-specific useful content.

Implement deterministic functions for:

```text
Direct proof attempt
Reformulation
Weaker special cases
Known theorem or literature reduction
```

Each should return:

```text
- 2-4 findings
- 1-3 uncertainties/blockers
- a concrete suggested next move
- a working-paper section title and summary
```

Do not fabricate theorem citations.

For literature/theorem path, use search-target language unless registered source support exists.

### Task 6: Wire execution into harness continue flow

Objective: Replace the placeholder continue result with real path execution.

Modify:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
```

Current code around `continue` likely does:

```ts
const finding = "No conclusion yet. ...";
const nextState = updateResearchPath(...);
await this.notify(formatResearchRoundUpdated(path, finding));
```

Replace with:

```text
1. runResearchPathRound({ rootQuestion: state.rootQuestion, path, allPaths: state.researchPaths, now })
2. updateResearchPath with result.findings appended, blockers appended, suggestedNextMove updated
3. add/update working paper section
4. optionally add margin notes for uncertainties/blockers
5. notify with new research-round formatter
```

Be careful to preserve:

```text
- explicit missing path warning
- abandoned path behavior
- focused/default continue behavior
```

### Task 7: Add storage helper only if needed

Objective: Keep state update clean.

If existing helpers are awkward for adding/updating a working-paper section, add a small helper in:

```text
packages/coding-agent/examples/extensions/co-math/storage.ts
```

Possible helper:

```ts
export function upsertWorkingPaperSectionByTitle(state: CoMathProjectState, input: {
	title: string;
	content: string;
	status: WorkingPaperSectionStatus;
	now: string;
	actor?: CoMathActor;
}): CoMathProjectState
```

But only add this if existing helpers do not already support the use case.

Add tests in:

```text
packages/coding-agent/test/co-math-state.test.ts
```

### Task 8: Add product formatter for research round results

Objective: Make output notebook-like and beginner-readable.

Modify:

```text
packages/coding-agent/src/modes/comath/comath-progress.ts
```

Add something like:

```ts
export function formatResearchRoundCompleted(input: {
	state: Pick<CoMathProjectState, "researchPaths">;
	path: ResearchPath;
	findings: readonly string[];
	uncertainties: readonly string[];
	suggestedNextMove: string;
	workingPaperSectionTitle: string;
}): string
```

Output must contain:

```text
Research round completed
Findings
Uncertainty
Next
Working paper updated
```

Update `formatResearchStateSummary` to show compact latest findings.

### Task 9: Add unit tests for research execution module

Objective: Test strategy logic without the full harness.

Create:

```text
packages/coding-agent/test/comath-research-execution.test.ts
```

Test at least:

```text
1. n^2 + 1 example strategy computes expected small values.
2. direct proof strategy is cautious and does not claim proof.
3. known theorem strategy uses search-target/source-needed language, not fake citations.
4. unknown path returns safe generic result.
```

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/comath-research-execution.test.ts
```

### Task 10: Update smoke doc

Objective: Document the new manual behavior.

Modify:

```text
docs/comath-research-exploration-smoke.md
```

Add a section:

```text
Research path execution smoke
```

Include simple user steps:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
continue path 1
summarize current state
continue path 2
continue path 99
```

Expected good signs:

```text
- path 1 reports concrete n^2 + 1 examples
- summary includes latest findings
- path 2 reports direct-proof attempt content
- path 99 warns and does not update another path
```

### Task 11: Run focused validation

Run from package root:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run \
  test/comath-harness.test.ts \
  test/comath-progress.test.ts \
  test/comath-backend-output.test.ts \
  test/co-math-extension.test.ts \
  test/co-math-natural-language.test.ts \
  test/co-math-state.test.ts \
  test/comath-research-autoplan.test.ts \
  test/comath-research-execution.test.ts
```

Expected:

```text
all selected files passed
```

Then from repo root:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

Expected:

```text
npm run check passes
git diff --check passes
```

### Task 12: Manual product smoke

From a clean temp folder:

```bash
rm -rf /tmp/comath-path-execution-demo
mkdir -p /tmp/comath-path-execution-demo
cd /tmp/comath-path-execution-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Type:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
```

Then:

```text
continue path 1
```

Then:

```text
summarize current state
```

Then:

```text
continue path 2
```

Then:

```text
continue path 99
```

Good signs:

```text
- `continue path 1` shows concrete n^2 + 1 examples.
- output says `Research round completed`, not `Research round updated` with placeholder text.
- output has `Findings`, `Uncertainty`, `Next`, and `Working paper updated`.
- summary includes accumulated latest findings.
- `continue path 2` updates direct proof attempt, not path 1.
- `continue path 99` warns and does not update another path.
- no product output exposes internal terms like workstream, queue, schema, role-run, artifact.
```

Optional state check:

```bash
python3 -c 'import json, pathlib; p=pathlib.Path(".pi/co-math/state.json"); s=json.loads(p.read_text()); print(len(s["researchPaths"]), len(s.get("workingPaperSections", []))); print([(x["title"], len(x["latestFindings"])) for x in s["researchPaths"]])'
```

Expected:

```text
5 research paths
at least one working-paper section
path 1 and path 2 have findings after their respective continue commands
```

---

## Acceptance Criteria

Implementation is acceptable only if all are true:

```text
1. `continue path 1` produces concrete example/counterexample findings for n^2 + 1.
2. `continue path 2` produces direct-proof attempt content, not example content.
3. `continue path 99` warns and does not update another path.
4. Research path state accumulates findings and blockers/uncertainties.
5. Working paper sections are added or updated after a research round.
6. `summarize current state` includes compact accumulated findings.
7. Product output avoids internal backend terms.
8. Proof-validation mode still works and does not create research paths.
9. Focused tests pass.
10. `npm run check` passes.
11. `git diff --check` passes.
12. Manual smoke passes from a clean folder.
```

---

## Risks and Pitfalls

1. Overclaiming mathematical results.

Bad:

```text
This suggests there are infinitely many primes of the form n^2 + 1.
```

Better:

```text
These examples are consistent with the conjecture but do not prove infinitude.
```

2. Fabricating literature status.

Bad:

```text
This is known to be open by Landau.
```

Better without source:

```text
This resembles a known literature-search target around prime values of polynomials; verify with sources before relying on it.
```

3. Dumping too much into summaries.

Keep `summarize current state` compact. Show only the latest few findings per path.

4. Breaking validation mode.

Always rerun existing validation tests. Do not make all prompts route to exploration mode.

5. Adding complex async infrastructure too early.

This milestone is deterministic path execution. Async multi-agent work can come later.

---

## Suggested Future Milestones After This

After this milestone passes, the next likely steps are:

```text
1. Background/asynchronous path execution for longer research rounds.
2. Source-backed literature path using registered PDFs/text sources.
3. A richer working-paper export that includes path provenance and margin notes.
4. Research agenda synthesis: “what should we try next and why?”
5. Periodic long-running exploration loops with user-adjustable objectives.
```

Do not implement these in this milestone unless the user explicitly asks.

---

## Final Handoff Checklist for Codex

Before reporting back, include:

```text
- changed files
- summary of strategy implementation
- tests run with pass/fail output
- npm run check result
- git diff --check result
- manual smoke result
- whether proof-validation mode was checked
- whether any limitations remain
```

Do not commit unless explicitly asked.
