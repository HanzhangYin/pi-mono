# Co-Math Fresh-Workspace Validation Entrypoint Cleanup Plan

> **For Claude Code:** Implement this plan on `/home/hermes/developer/pi-mono-comath` from the current `comath/research-exploration-mode` branch. Do not commit unless explicitly asked. This is a narrow UX cleanup after the natural research-entrypoint work.

## Goal

Prevent non-math operational prose in a fresh `pi comath` workspace from accidentally creating a validation project.

Current rough edge:

```text
User: run tests
Pi: creates a validation workspace with approvedGoals/workstreams
```

Desired behavior:

```text
User: run tests
Pi: explains that `pi comath` is for mathematical validation/exploration and does not create `.pi/co-math/state.json`.
```

Keep legitimate math validation prompts working.

## Motivation

Recent UX work improved research exploration:

```text
Are there infinitely many primes of the form n^2 + 1?
→ starts research exploration
→ suggests continue path 1
```

It also avoids starting research for non-math prompts. However, non-math prompts still fall through to the older validation setup path. That means ordinary operational prompts can create durable co-math state even though the user did not ask for a math validation or research task.

This makes first-run behavior feel surprising and can confuse beginners.

## Expected End Result

From a fresh folder:

```text
help
show report
show progress
run tests
run a quick sanity check
show me the files
what branch am I on?
```

should not create:

```text
.pi/co-math/state.json
```

From a fresh folder, legitimate math prompts should still work:

```text
Validate the claim: every even integer greater than 2 is a sum of two primes.
Prove or disprove: there are infinitely many primes of the form n^2 + 1.
Check this proof: [substantial proof text]
Are there infinitely many primes of the form n^2 + 1?
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
```

Expected:

```text
- validation prompts create validation state
- research prompts create research paths
- command/help prompts do not create state
- operational/dev prose does not create state
```

## Non-goals

Do not implement:

```text
- a general shell-command router
- real test running from inside co-math
- a full LLM intent classifier
- new research/workstream architecture
- source lookup changes
- coordinator changes
- broad TUI redesign
```

This should be a deterministic fresh-workspace routing cleanup.

## Current Baseline

Recent commit before this plan:

```text
bfd76d24 fix(coding-agent): streamline co-math research UX
```

Relevant files:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-prompts.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
packages/coding-agent/test/comath-harness.test.ts
packages/coding-agent/test/comath-prompts.test.ts
docs/comath-research-exploration-smoke.md
```

Existing helper to inspect:

```text
parseNaturalResearchQuestion(...)
isLikelyMathResearchQuestion(...)
normalizeCoMathPrompt(...)
```

## Task 1: Define a Fresh-Workspace Validation Prompt Gate

Add deterministic validation-intent helpers to:

```text
packages/coding-agent/src/modes/comath/comath-prompts.ts
```

Suggested exports:

```ts
export function isLikelyMathValidationPrompt(prompt: string): boolean;
export function isLikelyOperationalNonMathPrompt(prompt: string): boolean;
```

The validation gate should return true for prompts that clearly ask for mathematical validation/proof/audit, for example:

```text
Validate the claim: every even integer greater than 2 is a sum of two primes.
Validate Question 3.
Check this proof: [substantial proof text]
Review this proof of the lemma: ...
Prove or disprove: there are infinitely many primes of the form n^2 + 1.
Is this proof valid? [proof text]
Audit the following theorem/proof: ...
```

The operational non-math gate should return true for prompts like:

```text
run tests
run a quick sanity check
show me the files
what branch am I on?
list files
open package.json
npm test
git status
build the project
check the code
```

Guidance:

```text
- Keep this deterministic; no LLM.
- Prefer conservative matching.
- If a prompt is ambiguous and has no math signal, warn/help instead of creating state.
- Preserve source-pinned validation behavior where applicable.
```

## Task 2: Route Fresh-Workspace Non-Math Prompts to Help/Warning

In:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
```

Update the fresh-workspace flow so only these create state:

```text
1. explicit exploration prompts
2. natural math research questions
3. likely math validation prompts
4. source-pinned validation prompts that current code intentionally supports
```

Non-math operational prompts should notify and return without calling `handleInitialProblem(...)`.

Suggested warning copy:

```text
Pi co-math is for mathematical validation and exploration.
Start with a math question, for example:
Are there infinitely many primes of the form n^2 + 1?

Or ask for validation, for example:
Validate this proof: ...
```

Important:

```text
- Do not break `help`.
- Do not create `.pi/co-math/state.json` for rejected prompts.
- Do not block legitimate validation prompts.
- Do not change behavior after a co-math project already exists unless necessary.
```

## Task 3: Preserve Pinned-Source Validation Behavior

If `pi-test.sh comath <source.pdf> --approve` starts with a pinned source, validation prompts should still behave as before.

Examples:

```text
Validate Question 3.
Please validate Question 3 from the attached source.
```

Expected:

```text
- asks for pasted context if current behavior does that
- does not start research exploration
- does not warn as non-math operational prose
```

Add tests or update existing tests to lock this down.

## Task 4: Add Tests

Update:

```text
packages/coding-agent/test/comath-prompts.test.ts
packages/coding-agent/test/comath-harness.test.ts
```

Prompt helper tests:

```text
isLikelyOperationalNonMathPrompt("run tests") === true
isLikelyOperationalNonMathPrompt("git status") === true
isLikelyOperationalNonMathPrompt("what branch am I on?") === true
isLikelyOperationalNonMathPrompt("show me the files") === true
isLikelyMathValidationPrompt("Validate the claim: every even integer greater than 2 is a sum of two primes.") === true
isLikelyMathValidationPrompt("Check this proof: ...") === true
isLikelyMathValidationPrompt("Prove or disprove: there are infinitely many primes of the form n^2 + 1.") === true
```

Harness tests:

```text
fresh `run tests` does not create state
fresh `show me the files` does not create state
fresh `what branch am I on?` does not create state
fresh validation prompt still creates validation workspace
fresh natural math question still creates research paths
fresh `help` still does not create state
fresh `show report` still does not create state
source-pinned validation prompt still goes to validation flow
```

## Task 5: Update Smoke Docs

Update:

```text
docs/comath-research-exploration-smoke.md
```

Add a short "Fresh workspace non-math guard" smoke section:

```bash
cd /tmp
mkdir comath-nonmath-guard-test-1
cd comath-nonmath-guard-test-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
run tests
```

Exit Pi, then shell:

```bash
python3 -c 'from pathlib import Path; print("state exists:", Path(".pi/co-math/state.json").exists())'
```

Expected:

```text
state exists: False
```

Repeat manually if desired for:

```text
show me the files
what branch am I on?
```

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

Manual positive smoke:

```bash
cd /tmp
mkdir comath-validation-entry-positive-test-1
cd comath-validation-entry-positive-test-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Validate the claim: every even integer greater than 2 is a sum of two primes.
```

Expected:

```text
- validation workspace prepared
- `.pi/co-math/state.json` exists
- approvedGoals/workstreams exist
```

Manual negative smoke:

```bash
cd /tmp
mkdir comath-validation-entry-negative-test-1
cd comath-validation-entry-negative-test-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
run tests
```

Exit Pi, then shell:

```bash
python3 -c 'from pathlib import Path; print("state exists:", Path(".pi/co-math/state.json").exists())'
```

Expected:

```text
state exists: False
```

Manual research smoke should still pass:

```bash
cd /tmp
mkdir comath-natural-entry-regression-test-1
cd comath-natural-entry-regression-test-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Are there infinitely many primes of the form n^2 + 1?
please continue path 1
```

Expected:

```text
- research workspace prepared
- `continue path 1` suggested
- Path 1 starts
```

## Final Response Required From Claude Code

Report:

```text
- files changed
- which non-math prompts are now rejected without state
- which validation prompts still create validation state
- source-pinned behavior result
- focused co-math suite result
- npm run check result
- git diff --check result
- manual positive validation smoke folder/result
- manual negative non-math smoke folder/result
- manual research regression smoke folder/result
- any remaining UX rough edges
```

Do not commit unless explicitly asked.
