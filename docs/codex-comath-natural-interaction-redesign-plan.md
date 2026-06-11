# Co-Math Natural Interaction Redesign Implementation Plan

> **For Codex:** Implement this plan on a new branch with strict TDD. Keep the existing `/comath` command surface as a debug/advanced interface, but add a simpler natural-language interaction layer so a user can talk to the co-math system more like Codex/Claude Code while preserving mathematical caution.

**Goal:** Create a new branch and implement a natural-language co-math controller that routes ordinary user requests into co-math actions without requiring users to remember `/comath` subcommands.

**Architecture:** Keep the current co-math extension internals: state, goals, workstreams, role runs, reports, transcript artifacts, structured ingestion, and review records. Add a small intent-planning/controller layer that interprets natural-language co-math requests, previews the planned action, and executes safe co-math operations through existing APIs. The agent should reason like a mathematical research assistant: source-backed, uncertainty-preserving, explicit about proof gaps, and never silently promote claims.

**Tech Stack:** TypeScript, existing Pi extension APIs, existing co-math extension files under `packages/coding-agent/examples/extensions/co-math/`, Vitest tests under `packages/coding-agent/test/`.

---

## Branch plan

Start from the current synced prototype branch:

```bash
cd /home/hermes/developer/pi-mono-comath
git status --short --branch
# expected: ## comath/prototype...origin/comath/prototype

git switch -c comath/natural-interaction-redesign
```

Do not create a new `pi-mono` checkout. The existing repo already contains the extension system, test harness, and working co-math internals. The new branch should be a UX/controller redesign on top of those internals.

---

## Problem statement

The current prototype works, but the user must interact through many explicit commands:

```text
/comath init ...
/comath goal ...
/comath workstream ...
/comath run workstream ...
/comath report-status ...
/comath review-report ...
/comath margin-note ...
/comath export-paper ...
```

This is too command-heavy for mathematical collaboration. The desired interaction is closer to coding agents:

```text
Start a co-math project for this paper.
Audit Question 3 against the source.
Show me the latest report.
Accept this report but keep the support gap as a blocker.
Run a source-backed workstream to check the stationarity identity.
Export the current working paper.
```

The implementation should provide a natural-language controller while keeping the existing `/comath` commands available for debugging and explicit control.

---

## Design principles

1. Reuse the existing co-math engine.
   - Do not rewrite storage.
   - Do not replace the role runner.
   - Do not remove `/comath` commands.
   - Do not add a separate agent framework.

2. Make common tasks conversational.
   - Users should not need to know exact IDs when there is an obvious latest report/run/workstream.
   - The system should explain what it is about to do in plain language.
   - The system should show the equivalent low-level `/comath` command for transparency.

3. Keep mathematical discipline.
   - Do not promote claims automatically from vague natural language.
   - Source-backed extraction remains required for mathematical claims.
   - Preserve blockers, failed attempts, warnings, and uncertainty.
   - Prefer exact source citations and registered artifacts.

4. Fail safely.
   - Ambiguous or destructive actions should ask for clarification or require explicit confirmation.
   - Unknown natural-language intents should fall back to helpful suggestions, not guesses.
   - No deleting state, reports, artifacts, or claims in this milestone.

5. Keep the milestone small.
   - This is not a fully autonomous research daemon.
   - No scheduler.
   - No new LLM provider.
   - No new dependencies unless unavoidable.
   - No browser UI.

---

## Proposed feature: `/co` natural-language command

Add a new shorter command:

```text
/co <natural-language request>
```

Examples:

```text
/co start a project for the Macdonald process paper
/co create a workstream to audit Question 3 source definitions
/co run the latest workstream
/co show the latest report
/co accept report 7 but keep the support gap as a blocker
/co export the working paper
/co what should I do next?
```

Why `/co` instead of completely command-free interaction:

- It is much easier and safer to implement inside the current extension system.
- It avoids hijacking every normal chat message.
- It still feels dramatically lighter than many `/comath` subcommands.
- A future milestone can route plain messages into `/co` automatically if the Pi extension API supports it cleanly.

Keep `/comath` as the advanced/debug command.

---

## Intent model

Create a small deterministic parser for common co-math intents. Do not call a model to parse intents in this milestone.

Supported intents for v1:

```ts
type CoMathNaturalIntent =
  | { kind: "init"; question: string }
  | { kind: "goal"; text: string }
  | { kind: "workstream"; slug: string; goal: string }
  | { kind: "run-workstream"; workstreamRef: "latest" | string }
  | { kind: "show-report"; reportRef: "latest" | string }
  | { kind: "show-run"; runRef: "latest" | string }
  | { kind: "review-report"; reportRef: "latest" | string; decision: "accepted" | "revision-requested" | "blocked"; note: string }
  | { kind: "margin-note"; targetRef: "latest-report" | string; category: string; note: string }
  | { kind: "export-paper"; path?: string; force: boolean }
  | { kind: "next" }
  | { kind: "help" }
  | { kind: "unknown"; reason: string; suggestions: string[] };
```

The parser should be conservative. It should support obvious phrases only.

Examples:

```text
start a project for <text>
initialize <text>
set goal <text>
create a workstream to <text>
run latest workstream
run workstream <id-or-slug>
show latest report
show report <id>
accept report <id>: <note>
request revision for report <id>: <note>
block report <id>: <note>
add note to latest report: <note>
export working paper
what next
help
```

Unknown or ambiguous input returns help and examples.

---

## Files likely to change

Main implementation:

- `packages/coding-agent/examples/extensions/co-math/index.ts`
- `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Create: `packages/coding-agent/examples/extensions/co-math/natural-language.ts`
- Maybe create: `packages/coding-agent/examples/extensions/co-math/natural-language-help.ts`

Tests:

- `packages/coding-agent/test/co-math-extension.test.ts`
- Create if useful: `packages/coding-agent/test/co-math-natural-language.test.ts`

Docs:

- `packages/coding-agent/examples/extensions/co-math/README.md`
- Maybe add a short manual smoke test section.

Do not modify:

- `packages/ai/src/models.generated.ts`
- generated files
- lockfiles
- package dependencies

---

## Task 1: Create natural-language intent parser tests

**Objective:** Define the supported natural-language surface before implementation.

**Files:**

- Create: `packages/coding-agent/test/co-math-natural-language.test.ts`
- Create: `packages/coding-agent/examples/extensions/co-math/natural-language.ts`

**Steps:**

1. Create an empty exported parser stub:

```ts
export type CoMathNaturalIntent = { kind: "unknown"; reason: string; suggestions: string[] };

export function parseCoMathNaturalRequest(input: string): CoMathNaturalIntent {
  return {
    kind: "unknown",
    reason: input.trim().length === 0 ? "empty request" : "unrecognized request",
    suggestions: [],
  };
}
```

2. Add tests for these parse cases:

```ts
parseCoMathNaturalRequest("start a project for 2605.06651")
// -> { kind: "init", question: "2605.06651" }

parseCoMathNaturalRequest("set goal verify Question 3")
// -> { kind: "goal", text: "verify Question 3" }

parseCoMathNaturalRequest("create a workstream to audit Question 3 source definitions")
// -> { kind: "workstream", slug: "audit-question-3-source-definitions", goal: "audit Question 3 source definitions" }

parseCoMathNaturalRequest("run latest workstream")
// -> { kind: "run-workstream", workstreamRef: "latest" }

parseCoMathNaturalRequest("show latest report")
// -> { kind: "show-report", reportRef: "latest" }

parseCoMathNaturalRequest("show report report-7")
// -> { kind: "show-report", reportRef: "report-7" }

parseCoMathNaturalRequest("accept report report-7: useful but keep the support gap open")
// -> { kind: "review-report", reportRef: "report-7", decision: "accepted", note: "useful but keep the support gap open" }

parseCoMathNaturalRequest("request revision for latest report: source gap remains")
// -> { kind: "review-report", reportRef: "latest", decision: "revision-requested", note: "source gap remains" }

parseCoMathNaturalRequest("export working paper")
// -> { kind: "export-paper", force: false }

parseCoMathNaturalRequest("what next")
// -> { kind: "next" }
```

3. Run only the new parser test and verify it fails initially:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-natural-language.test.ts
```

Expected: tests fail because parser is not implemented.

---

## Task 2: Implement conservative intent parsing

**Objective:** Make the parser tests pass without overgeneralizing.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/natural-language.ts`
- Test: `packages/coding-agent/test/co-math-natural-language.test.ts`

**Implementation guidance:**

- Normalize whitespace.
- Match explicit phrase prefixes with regular expressions.
- Avoid fuzzy matching for destructive or review actions.
- Generate slugs with a small local helper.
- Do not use `any`.
- Keep all imports top-level.

Suggested helpers:

```ts
function normalizeRequest(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function slugifyWorkstreamGoal(goal: string): string {
  return goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workstream";
}
```

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-natural-language.test.ts
```

Expected: pass.

---

## Task 3: Add `/co` command registration

**Objective:** Register a lightweight natural-language command without removing `/comath`.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Maybe modify: `packages/coding-agent/examples/extensions/co-math/index.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**Design:**

Register a new command:

```text
/co <request>
```

Description:

```text
Natural-language co-math assistant
```

The `/co` handler should:

1. Parse the natural-language request.
2. Translate it into an existing co-math operation.
3. Return a concise response that includes:
   - interpreted intent;
   - equivalent `/comath` command when applicable;
   - result from the underlying operation.

Example output:

```text
Interpreted: show latest report
Equivalent: /comath report-status report-7

Report report-7
...
```

Implementation option:

- Refactor existing command handling into reusable functions where needed.
- Avoid duplicating command logic.
- If refactoring is too large, implement `/co` by calling the existing command handler with translated args, but keep type boundaries clean.

Do not shell out to `pi` or invoke commands by string.

---

## Task 4: Add latest-ID resolution helpers

**Objective:** Allow natural requests like “show latest report” and “run latest workstream”.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**Behavior:**

Latest report:

- Prefer most recently created report by event/order in state.
- If no reports exist, return:

```text
No reports exist yet. Try: /co run latest workstream
```

Latest run:

- Prefer most recent role run.
- If no role runs exist, return helpful message.

Latest workstream:

- Prefer the most recently created pending/in-progress workstream.
- If none exist, use most recent workstream.
- If no workstreams exist, return helpful message.

Add tests for:

- latest report exists;
- no latest report;
- latest workstream exists;
- no latest workstream.

---

## Task 5: Implement `/co help` and unknown-intent guidance

**Objective:** Make failed natural-language input helpful rather than frustrating.

**Files:**

- Modify or create: `packages/coding-agent/examples/extensions/co-math/natural-language-help.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**Expected `/co help` output:**

```text
Natural co-math examples:
- /co start a project for <question or paper>
- /co set goal <research goal>
- /co create a workstream to <specific task>
- /co run latest workstream
- /co show latest report
- /co accept report <id>: <note>
- /co request revision for latest report: <note>
- /co export working paper
- /co what next

Advanced/debug interface: /comath help
```

Unknown input should return:

```text
I could not map that to a safe co-math action.

Try one of:
...
```

Do not silently guess.

---

## Task 6: Add review action safety behavior

**Objective:** Avoid accidental report acceptance/blocking from ambiguous natural language.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/natural-language.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**Rules:**

Accept only explicit patterns:

```text
accept report <id>: <note>
accept latest report: <note>
request revision for report <id>: <note>
request revision for latest report: <note>
block report <id>: <note>
block latest report: <note>
```

Do not accept vague forms:

```text
looks good
approve it
fine
```

For vague forms, return:

```text
Please use an explicit review action, for example:
/co accept latest report: useful source-backed extraction, but keep support gap open
/co request revision for latest report: missing source-backed support lemma
```

This matters because report review changes project state.

---

## Task 7: Add source-backed mathematical persona guidance

**Objective:** Make the natural interface feel like a mathematical collaborator, not just a command alias.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`
- Maybe modify co-math agent prompts only if needed:
  - `packages/coding-agent/examples/extensions/co-math/agents/workstream.md`
  - `packages/coding-agent/examples/extensions/co-math/agents/reviewer.md`

**Guidance:**

The natural interface should encourage prompts like:

```text
/co create a workstream to audit Question 3 against registered source files only; preserve uncertainty and list exact proof gaps
```

But do not change the role prompts unless tests or manual smoke show the current prompts are insufficient. The current prompts already preserve uncertainty and source-backed claims.

---

## Task 8: Integration tests for realistic user flow

**Objective:** Prove the natural interaction layer can perform a compact co-math workflow.

**Files:**

- Modify: `packages/coding-agent/test/co-math-extension.test.ts`

**Test flow:**

1. `/co start a project for Q3 validation`
2. `/co set goal verify stationarity proof skeleton`
3. `/co create a workstream to audit the source support gap`
4. `/co run latest workstream` using existing fake role runner test setup
5. `/co show latest report`
6. `/co request revision for latest report: support gap remains open`
7. `/co what next`

Assertions:

- State has root question.
- Goal exists.
- Workstream exists.
- Role run exists.
- Report exists.
- Review record exists.
- Output includes equivalent `/comath` commands for transparency.
- No raw fallback parsing regression.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts
```

---

## Task 9: README documentation and manual smoke test

**Objective:** Document the new interaction style with copy/paste examples.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`

Add a section:

```markdown
## Natural-language interaction

Use `/co` for common co-math operations without remembering every `/comath` subcommand.

Examples:

```text
/co start a project for the reference paper
/co set goal validate Question 3 with source-backed definitions
/co create a workstream to audit the stationarity proof support gap
/co run latest workstream
/co show latest report
/co request revision for latest report: missing source-backed support lemma
/co export working paper
/co what next
```

`/comath` remains available as the advanced/debug interface.
```

Add a manual smoke test using tmux or direct Pi session if the README already has a preferred style.

---

## Task 10: Validation commands

Run the targeted tests:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-natural-language.test.ts test/co-math-extension.test.ts test/co-math-role-runner.test.ts test/co-math-state.test.ts
```

Run full required repo check after code changes:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

Do not run `npm test` or `npm run build` unless explicitly requested.

---

## Manual smoke test

After tests pass, run a real scratch session.

```bash
mkdir -p /tmp/comath-natural-smoke
cd /tmp/comath-natural-smoke

/home/hermes/developer/pi-mono-comath/pi-test.sh \
  -e /home/hermes/developer/pi-mono-comath/packages/coding-agent/examples/extensions/co-math/index.ts \
  --approve
```

Inside Pi:

```text
/co start a project for 2605.06651v2 Question 3 validation
```

```text
/co set goal validate Question 3 using source-backed definitions and preserve proof gaps
```

```text
/co create a workstream to audit whether the stationarity proof has a support indexing gap
```

```text
/co run latest workstream
```

```text
/co show latest report
```

```text
/co request revision for latest report: keep the support/indexing gap open until a source-backed vanishing lemma is found
```

```text
/co what next
```

Success criteria:

- User can complete the workflow mostly through `/co`.
- Output shows equivalent `/comath` commands for transparency.
- A report is created.
- Structured ingestion still works.
- Transcript path still appears for role runs.
- Review action updates report review state.
- `/comath` commands still work unchanged.

---

## Risks and tradeoffs

### Risk: natural-language parser becomes too fuzzy

Mitigation:

- Keep parser deterministic and conservative.
- Unknown input returns help.
- State-mutating review actions require explicit phrases and notes.

### Risk: duplicate command logic

Mitigation:

- Prefer reusable internal functions or translated argument calls to existing command handlers.
- Keep `/comath` as source of truth where practical.

### Risk: users expect fully command-free chat

Mitigation:

- This milestone implements `/co` first.
- Future milestone can add automatic routing for ordinary messages if extension APIs support it safely.

### Risk: mathematical claims become too easy to promote

Mitigation:

- `/co` does not add direct claim-promotion shortcuts in v1.
- Review and workstream outputs still use existing structured ingestion and human review.

---

## Future milestones after `/co`

Do not implement these in this branch unless explicitly requested:

1. Plain-message auto-routing:
   - User types ordinary text without `/co`.
   - Extension decides whether it is a co-math request.

2. Interactive clarification:
   - For ambiguous requests, ask a concise follow-up question.

3. Natural-language report browsing:
   - “Show me only the blockers from the latest three reports.”

4. Source acquisition assistant:
   - “Find the cited reference [3], register it, and audit the support lemma.”

5. Mathematician reasoning modes:
   - source auditor;
   - proof checker;
   - counterexample hunter;
   - exposition synthesizer.

---

## Suggested Codex prompt

```text
Create a new branch from comath/prototype and implement docs/codex-comath-natural-interaction-redesign-plan.md.

Branch:
  comath/natural-interaction-redesign

Goal:
  Add a natural-language `/co` command for the co-math extension so users can perform common co-math workflows without remembering the full `/comath` command surface.

Constraints:
  - Keep `/comath` unchanged as advanced/debug interface.
  - Reuse existing co-math state, commands, role-runner, reports, transcripts, and structured ingestion.
  - Implement a deterministic conservative parser; do not call an LLM to parse intents.
  - Unknown or ambiguous requests must return help, not guesses.
  - Review actions require explicit phrases and notes.
  - No new dependencies.
  - No daemon, browser UI, scheduler, or proof engine.
  - Do not commit.

Validation:
  cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
  node ../../node_modules/vitest/dist/cli.js --run test/co-math-natural-language.test.ts test/co-math-extension.test.ts test/co-math-role-runner.test.ts test/co-math-state.test.ts

  cd /home/hermes/developer/pi-mono-comath
  npm run check
  git diff --check

Report:
  - Files changed
  - Tests run and exact results
  - Whether manual smoke test was run
  - Any unsupported natural-language examples
```
