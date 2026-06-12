# Co-Math Conversation Mode Implementation Plan

> **For Codex:** Implement this plan on a new branch. The goal is to make co-math usable through ordinary conversation, without requiring the user to type `/co` or `/comath` for the normal workflow. Keep `/comath` as an advanced/debug interface and keep `/co` as a thin compatibility/debug alias if it already exists.

## Goal

Create a first-class co-math conversation mode in Pi.

In this mode, the user should be able to type normal messages like:

```text
Start a co-math project for 2605.06651v2 Question 3.
Set the goal to validate Question 3 using source-backed definitions.
Create a workstream to audit the support indexing gap.
Run the latest workstream.
Show me the latest report.
Request revision: keep the support gap open until a source-backed vanishing lemma is found.
What should I do next?
```

and Pi should route those messages through the co-math controller directly, without requiring:

```text
/co ...
/comath ...
```

## Branch

Start from the pushed natural-interaction branch:

```bash
cd /home/hermes/developer/pi-mono-comath
git fetch origin
git switch comath/natural-interaction-redesign
git pull --ff-only
git switch -c comath/conversation-mode
```

Do not create a new `pi-mono` checkout. This should be a branch in the current repo.

## Design principle

The `/co` work proved the controller/parser idea. This milestone should make that controller available as the normal interaction surface when co-math mode is enabled.

Do not rewrite the co-math engine.

Reuse:

- co-math state storage;
- workstreams;
- role runs;
- structured report ingestion;
- transcript artifacts;
- report reviews;
- natural-language parser from `natural-language.ts`;
- existing `/comath` command implementation.

Add only the minimal integration layer needed to route ordinary messages to co-math actions in a clearly-enabled co-math mode.

## Non-goals

Do not implement:

- a new proof engine;
- a new storage schema unless absolutely required;
- a new LLM provider;
- scheduler/daemon behavior;
- browser UI;
- web search automation;
- fuzzy report acceptance;
- destructive state deletion;
- automatic claim promotion from free text;
- a global default that hijacks ordinary Pi coding conversations.

## User-facing model

Add an explicit co-math mode entrypoint. Pick the smallest implementation that fits the existing Pi architecture.

Preferred UX, in order:

1. CLI flag:

```bash
pi --comath
```

or:

```bash
pi --mode comath
```

2. Session command to enter the mode:

```text
/comath-mode
```

3. If the existing CLI/session architecture already has a mode concept, use that.

Do not silently route all normal Pi messages to co-math in default mode. Co-math routing should happen only when the user explicitly starts or enters co-math mode.

## Expected interaction in co-math mode

In co-math mode, these plain messages should work:

```text
help
```

shows co-math conversational examples, plus notes that `/comath` is still available for debugging.

```text
Start a project for 2605.06651v2 Question 3 validation.
```

routes to co-math init.

```text
Set goal validate Question 3 using source-backed definitions and preserve proof gaps.
```

routes to co-math goal creation.

```text
Create a workstream to audit whether the stationarity proof has a support indexing gap.
```

routes to co-math workstream creation.

```text
Run the latest workstream.
```

routes to role-run execution.

```text
Show the latest report.
```

routes to report status.

```text
Show the latest run.
```

routes to run status.

```text
Request revision for latest report: keep the support/indexing gap open until a source-backed vanishing lemma is found.
```

routes to explicit report review.

```text
What should I do next?
```

routes to co-math next.

## Transparency requirement

Even without `/co`, co-math mode output should still show what action was taken.

Example:

```text
Interpreted: run latest workstream
Equivalent debug command: /comath run workstream workstream-audit-support-indexing-gap

Started co-math role run role-run-1.
Transcript: .pi/co-math/transcripts/role-run-1.jsonl
```

Use `Equivalent debug command`, not necessarily `Equivalent`, so it is clear that `/comath` is a fallback/debug view rather than the primary interface.

## Parser adjustments

The current `/co` parser may expect terse commands such as:

```text
run latest workstream
show latest report
```

Extend it conservatively to accept a few natural variants needed for plain chat:

```text
run the latest workstream
show me the latest report
show me the latest run
what should we do next?
start a co-math project for <text>
start project for <text>
set the goal to <text>
create a workstream for <text>
create a workstream that <text>
request revision: <note>
request revision for the latest report: <note>
```

Keep the parser deterministic. Do not use an LLM for intent parsing in this milestone.

Unknown messages in co-math mode should return a helpful response, not fall through to a generic coding assistant answer.

Example:

```text
I could not map that to a safe co-math action.

Try:
- Start a project for <paper/question>
- Set goal <research goal>
- Create a workstream to <specific task>
- Run the latest workstream
- Show the latest report
- Request revision for latest report: <note>
- What should I do next?

Debug interface: /comath help
```

## Review safety

Do not accept vague approval or review messages.

Reject:

```text
looks good
approve it
fine
accept
ship it
```

Return:

```text
Please use an explicit review action, for example:
Request revision for latest report: missing source-backed support lemma
Accept latest report: useful source-backed extraction, but keep support gap open
Block latest report: output contradicts the source indexing assumptions
```

This matters because report review mutates co-math state.

## Architecture options

Inspect the existing Pi command/session architecture before editing. Choose the least invasive option.

Likely implementation paths:

### Option A: Mode-specific message interceptor

If the extension API supports intercepting ordinary user messages, add a co-math message handler that is enabled only in co-math mode.

### Option B: Core session mode router

If command extensions cannot see plain messages, add a small core mode router to the chat/session loop:

```ts
type ConversationMode = "default" | "comath";
```

When mode is `"comath"`, route user text to the co-math natural controller before normal provider dispatch.

### Option C: CLI wrapper command

If core routing is too large for this milestone, add a `pi-comath` or `pi --comath` entrypoint that starts Pi with a system-level setting making ordinary text pass through the co-math controller.

Prefer A or B if feasible. Use C only if the architecture makes A/B too risky.

## Files to inspect first

Before implementing, inspect these areas:

- extension API and command registration:
  - `packages/coding-agent/src/core/extensions/`
  - `packages/coding-agent/examples/extensions/co-math/index.ts`
  - `packages/coding-agent/examples/extensions/co-math/commands.ts`

- CLI/session input routing:
  - search for command parsing, slash command dispatch, and prompt submission;
  - search terms: `registerCommand`, `slash`, `command`, `mode`, `prompt`, `sendMessage`, `user input`.

- tests:
  - `packages/coding-agent/test/co-math-extension.test.ts`
  - existing CLI/session tests if any.

Use `search_files`/ripgrep or equivalent. Do not guess the architecture.

## Suggested file changes

Likely co-math files:

- `packages/coding-agent/examples/extensions/co-math/natural-language.ts`
- `packages/coding-agent/examples/extensions/co-math/natural-language-help.ts`
- `packages/coding-agent/examples/extensions/co-math/commands.ts`
- maybe create `packages/coding-agent/examples/extensions/co-math/conversation-controller.ts`
- `packages/coding-agent/examples/extensions/co-math/README.md`

Likely core files, depending on architecture:

- files under `packages/coding-agent/src/core/` that route interactive user input;
- CLI option definitions if adding `--comath` or `--mode comath`.

Tests:

- `packages/coding-agent/test/co-math-natural-language.test.ts`
- `packages/coding-agent/test/co-math-extension.test.ts`
- add a targeted CLI/session routing test if there is an existing harness.

## Implementation task 1: Extract reusable co-math natural controller

Current `/co` likely parses and immediately translates inside command handling.

Extract a reusable function that can be called from both:

- `/co <request>`;
- co-math conversation mode plain messages.

Suggested shape:

```ts
export interface CoMathNaturalControllerResult {
  handled: boolean;
  interpreted?: string;
  debugCommand?: string;
  message?: string;
}

export async function handleCoMathNaturalRequest(...): Promise<CoMathNaturalControllerResult>;
```

The exact API should match the existing project style.

Requirements:

- no shelling out;
- no dynamic imports;
- no `any`;
- reusable by command handler and mode router;
- preserves existing `/co` behavior.

Tests:

- `/co` integration tests still pass unchanged or with small output wording updates.

## Implementation task 2: Extend parser for chat-like phrases

Add parser tests first.

Cases:

```ts
"start a co-math project for 2605.06651v2 Question 3"
"start project for Q3 validation"
"set the goal to validate Question 3"
"create a workstream for auditing the support gap"
"create a workstream that audits the support gap"
"run the latest workstream"
"show me the latest report"
"show me the latest run"
"request revision: keep the support gap open"
"request revision for the latest report: keep the support gap open"
"what should we do next?"
```

Expected outcomes should map to existing intent kinds.

For `request revision: <note>`, use latest report by default.

Do not add broad fuzzy parsing beyond these explicit patterns.

## Implementation task 3: Add co-math mode activation

Pick the least invasive architecture-compatible mechanism.

Preferred behavior:

```bash
/home/hermes/developer/pi-mono-comath/pi-test.sh \
  --comath \
  -e /home/hermes/developer/pi-mono-comath/packages/coding-agent/examples/extensions/co-math/index.ts \
  --approve
```

or if the repo CLI uses another option style:

```bash
pi --mode comath
```

If both are easy, support only one public option for now. Avoid option sprawl.

Tests should verify:

- default mode still sends ordinary text through normal path;
- co-math mode routes ordinary text to the co-math controller;
- slash commands still work in co-math mode;
- unknown co-math messages return co-math help, not generic provider output.

## Implementation task 4: Conversation-mode help

In co-math mode, plain `help` should show co-math conversation help, not generic command help.

Output should include:

```text
Co-math conversation mode examples:
- Start a project for <question or paper>
- Set goal <research goal>
- Create a workstream to <specific task>
- Run the latest workstream
- Show the latest report
- Request revision for latest report: <note>
- What should I do next?

Debug interface: /comath help
```

`/comath help` should still show the advanced/debug command list.

## Implementation task 5: Preserve default Pi behavior

Add a regression test that normal Pi mode is not hijacked.

Example:

```text
User input: "show me the latest report"
Mode: default
Expected: not routed to co-math controller unless the user used /co or /comath.
```

The exact assertion depends on the existing test harness. The goal is to prevent co-math from taking over normal coding-agent use.

## Implementation task 6: README and manual smoke test

Update the co-math README to describe three layers:

1. Co-math conversation mode: normal user-facing mode.
2. `/co`: lightweight command alias / compatibility/debug route.
3. `/comath`: advanced/debug interface.

Add a manual smoke test:

```bash
mkdir -p /tmp/comath-conversation-smoke
cd /tmp/comath-conversation-smoke

/home/hermes/developer/pi-mono-comath/pi-test.sh \
  --comath \
  -e /home/hermes/developer/pi-mono-comath/packages/coding-agent/examples/extensions/co-math/index.ts \
  --approve
```

If the final flag is not `--comath`, update the README and this plan's smoke command to the implemented flag.

Inside Pi:

```text
help
Start a project for 2605.06651v2 Question 3 validation.
Set the goal to validate Question 3 using source-backed definitions and preserve proof gaps.
Create a workstream to audit whether the stationarity proof has a support indexing gap.
Run the latest workstream.
Show me the latest report.
Request revision for latest report: keep the support/indexing gap open until a source-backed vanishing lemma is found.
What should I do next?
```

Success criteria:

- no `/co` required;
- no `/comath` required for the normal workflow;
- output shows interpreted action and debug command;
- report is created;
- transcript path is displayed;
- review state is recorded;
- `/comath status` still works as a debug command.

## Validation commands

Run targeted tests:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-natural-language.test.ts test/co-math-extension.test.ts test/co-math-role-runner.test.ts test/co-math-state.test.ts
```

Run any new CLI/session routing test added for co-math mode.

Then run required repo check:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

Do not run `npm test` or `npm run build` unless explicitly requested.

## Acceptance criteria

The milestone is complete when:

- a user can start Pi in co-math mode;
- ordinary messages in co-math mode route to co-math actions;
- `/co` still works;
- `/comath` still works;
- default Pi mode is not hijacked;
- unknown co-math messages give safe help;
- vague review/approval remains rejected;
- tests pass;
- `npm run check` passes;
- manual smoke test is either run successfully or explicitly reported as not run.

## Suggested Codex prompt

```text
Implement docs/codex-comath-conversation-mode-plan.md.

Branch:
  comath/conversation-mode

Goal:
  Make co-math usable through ordinary conversation in an explicitly enabled co-math mode, without requiring /co or /comath for normal workflow.

Constraints:
  - Do not create a new repo.
  - Reuse the existing co-math state, role-runner, reports, transcripts, and /co natural parser.
  - Keep /comath as advanced/debug interface.
  - Keep /co working as a compatibility/debug alias.
  - Do not hijack default Pi mode.
  - Use deterministic conservative parsing only; no LLM intent parser.
  - Unknown requests return co-math help, not guesses.
  - Vague review commands remain rejected.
  - No new dependencies unless absolutely necessary.
  - Do not commit.

Validation:
  cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
  node ../../node_modules/vitest/dist/cli.js --run test/co-math-natural-language.test.ts test/co-math-extension.test.ts test/co-math-role-runner.test.ts test/co-math-state.test.ts

  cd /home/hermes/developer/pi-mono-comath
  npm run check
  git diff --check

Report:
  - Which mode activation mechanism was implemented
  - Files changed
  - Tests run and exact results
  - Whether manual smoke test was run
  - Any remaining unsupported natural-language phrases
```
