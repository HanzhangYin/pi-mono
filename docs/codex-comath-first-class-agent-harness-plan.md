# Co-Math First-Class Agent Harness Implementation Plan

> **For Codex:** Implement this plan on a new branch after the current `comath/conversation-mode` changes are committed or otherwise intentionally preserved. Do not commit unless explicitly asked. This plan is intentionally product-shaped: the goal is to stop exposing co-math as a command-extension workflow and make it feel like a Claude Code/Codex-style interactive research agent built on Pi.

## Goal

Create a first-class co-math agent harness inside Pi so the user can provide a paper/problem and watch the system automatically plan, create goals/workstreams, start the first safe role run, and stream visible progress without requiring `/co`, `/comath`, manual goal setup, manual workstream creation, or manual `run workstream` commands.

Target user experience:

```bash
cd /tmp/q3-validation
/home/hermes/developer/pi-mono-comath/pi-test.sh comath /home/hermes/developer/pi-mono-comath/docs/2605.06651v2.pdf --approve
```

Then inside the TUI, the user types only:

```text
Validate Question 3.
```

Expected visible behavior:

```text
Co-math project created for 2605.06651v2.pdf.
Source registered: docs/2605.06651v2.pdf
Problem: Validate Question 3.

Planning validation workflow...
Created goal: Validate Question 3 against the source paper.
Created workstream: Extract source-backed definitions for Question 3.
Created workstream: Identify assumptions and external references used by the proof.
Created workstream: Audit proof gaps and unsupported transitions.

Starting first workstream: Extract source-backed definitions for Question 3.
role-run-1 running...
Transcript: .pi/co-math/transcripts/role-run-1.jsonl
```

The product should feel like:

```text
I enter a problem. I can see what the AI is doing. It manages co-math setup automatically.
```

not:

```text
I have to learn /co, /comath, goal ids, workstream ids, and run commands.
```

## Architecture

Use Pi as the skeleton:

- CLI argument parsing;
- TUI session lifecycle;
- provider/model/session handling;
- existing extension/runtime plumbing;
- existing co-math state, reports, role runner, transcript, and review structures.

Add a first-class co-math harness layer:

```text
packages/coding-agent/src/modes/comath/
  comath-mode.ts              # TUI/product mode entrypoint
  comath-harness.ts           # high-level orchestration
  comath-autoplan.ts          # deterministic problem-first planning
  comath-progress.ts          # visible progress/status formatting
  comath-source.ts            # source argument/path detection
```

Reuse existing co-math backend logic initially. It is acceptable for the first version to call existing co-math command/service internals as implementation plumbing, but the user-facing surface must not mention `/co` or `/comath` in normal mode.

Long-term direction: move co-math from `examples/extensions/co-math` toward a first-class internal package/module. Do not do that large move in this milestone unless it is necessary to avoid duplication. This milestone should be minimal and validation-driven.

## Tech stack and constraints

- TypeScript in `packages/coding-agent`.
- Use erasable TypeScript syntax only.
- No `any` unless absolutely necessary.
- No dynamic imports.
- No new dependencies.
- No changes to `packages/ai/src/models.generated.ts`.
- Do not run `npm test` or `npm run build`.
- For tests, use targeted Vitest commands from `packages/coding-agent`.
- After code changes, run `npm run check` from repo root.
- Preserve default Pi behavior.
- Preserve `/co` and `/comath` as debug/advanced fallback paths.
- Do not implement a theorem prover or autonomous proof acceptance.
- Co-math may auto-plan and auto-run source audits, but it must not mark mathematical claims as proved without explicit evidence/review.

## Current context

The repo currently has:

- conversation-mode work on branch `comath/conversation-mode`;
- `--comath` and `--mode comath` routing ordinary prompts through `/co`;
- `/co` natural-language command translation;
- `/comath` command backend;
- co-math state, role-runner, reports, transcripts, review actions;
- ongoing issue: the product still feels like an extension/command system.

Relevant existing files:

```text
packages/coding-agent/src/main.ts
packages/coding-agent/src/cli/args.ts
packages/coding-agent/src/core/agent-session.ts
packages/coding-agent/src/core/agent-session-services.ts
packages/coding-agent/src/core/sdk.ts
packages/coding-agent/src/core/conversation-mode.ts
packages/coding-agent/src/modes/interactive/interactive-mode.ts
packages/coding-agent/examples/extensions/co-math/index.ts
packages/coding-agent/examples/extensions/co-math/commands.ts
packages/coding-agent/examples/extensions/co-math/natural-language.ts
packages/coding-agent/examples/extensions/co-math/natural-language-help.ts
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/examples/extensions/co-math/role-runner.ts
packages/coding-agent/test/args.test.ts
packages/coding-agent/test/conversation-mode.test.ts
packages/coding-agent/test/co-math-extension.test.ts
packages/coding-agent/test/co-math-natural-language.test.ts
packages/coding-agent/test/co-math-role-runner.test.ts
packages/coding-agent/test/co-math-state.test.ts
```

Plan files already present and should be treated as context, not implementation output:

```text
docs/codex-comath-conversation-mode-plan.md
docs/codex-comath-conversation-mode-transparency-plan.md
```

This new plan file is:

```text
docs/codex-comath-first-class-agent-harness-plan.md
```

## UX acceptance criteria

The milestone passes when the following user journey works:

```bash
mkdir -p /tmp/comath-agent-harness-smoke
cd /tmp/comath-agent-harness-smoke
/home/hermes/developer/pi-mono-comath/pi-test.sh comath /home/hermes/developer/pi-mono-comath/docs/2605.06651v2.pdf --approve
```

Inside Pi:

```text
Validate Question 3.
```

The user should see progress/status text similar to:

```text
Co-math source: /home/hermes/developer/pi-mono-comath/docs/2605.06651v2.pdf
Waiting for a problem to validate.
```

Then after the problem:

```text
Planning co-math validation workflow...
Created project: 2605.06651v2.pdf
Registered source: docs/2605.06651v2.pdf
Created goal: Validate Question 3 against the source paper.
Created workstream: Extract source-backed definitions for Question 3.
Created workstream: Identify assumptions and external references used by the proof.
Created workstream: Audit proof gaps and unsupported transitions.
Starting first workstream: Extract source-backed definitions for Question 3.
```

If a nested role run is started, the output must include:

```text
role-run-1
.pi/co-math/transcripts/role-run-1.jsonl
```

When the role completes, output must include:

```text
Saved report: report-1
```

The user should not need to type:

```text
/co ...
/comath ...
set goal ...
create workstream ...
run latest workstream
```

Debug fallback may still exist, but it should not be presented as the primary flow.

## Product principles

1. Problem-first: user provides a problem; co-math sets up the structure.
2. Visible progress: the user sees what the agent is doing.
3. Conservative math: automatic setup is allowed; automatic proof acceptance is not.
4. Source-backed: if a paper/source file is provided, register it and make source extraction the first workstream.
5. Interruptible/steerable: after the first report, user can steer with ordinary language.
6. Debug commands remain available but hidden from normal UX.

## Non-goals

Do not implement:

- full theorem proving;
- automatic claim approval;
- a web UI;
- background daemon scheduling;
- PDF parsing beyond registering the source and using existing role behavior;
- real-time token-by-token streaming from nested role subprocesses if that requires a large role-runner rewrite;
- permanent removal of `/co` or `/comath`;
- broad repo reorganization.

Nested role progress can be a first version: visible lifecycle messages before/after the role run and transcript path while it runs. If streaming nested subprocess stdout safely is easy, add it; otherwise document it as next milestone.

---

# Implementation Plan

## Task 0: Create a clean branch/checkpoint

**Objective:** Ensure work happens on a new feature branch without losing current conversation-mode changes.

**Files:** none.

**Steps:**

1. Check current state:

```bash
cd /home/hermes/developer/pi-mono-comath
git status --short --branch
```

2. If current branch has uncommitted conversation-mode implementation that should be preserved, ask the user before committing. Do not silently discard it.

3. Create the implementation branch after the current state is intentionally preserved:

```bash
git switch -c comath/first-class-agent-harness
```

If the branch already exists:

```bash
git switch comath/first-class-agent-harness
```

**Do not commit automatically unless the user asked.**

## Task 1: Add CLI parsing for a first-class `comath` subcommand

**Objective:** Support `pi comath [source]` as a product entrypoint distinct from `--comath`.

**Files:**

- Modify: `packages/coding-agent/src/cli/args.ts`
- Modify: `packages/coding-agent/test/args.test.ts`

**Design:**

Add a new optional `productMode` or `entrypoint` field to `Args`:

```ts
export type ProductMode = "comath";

export interface Args {
  // existing fields...
  productMode?: ProductMode;
  comathSource?: string;
}
```

Use tabs and existing style.

Parsing rule:

- If the first non-flag argument is exactly `comath`, treat it as product mode.
- The next non-flag argument, if present and not an option value, is `comathSource`.
- Remaining non-flag arguments should remain messages/prompts if needed.
- Existing package commands (`install`, `remove`, `uninstall`, `update`, `list`, `config`) must keep their existing behavior.

Suggested parser logic near the start of `parseArgs`:

```ts
if (args[0] === "comath") {
  result.productMode = "comath";
  result.conversationMode = "comath";
  if (args[1] !== undefined && !args[1].startsWith("-")) {
    result.comathSource = args[1];
    args = ["--comath", ...args.slice(2)];
  } else {
    args = ["--comath", ...args.slice(1)];
  }
}
```

Adapt this to avoid mutating a `const args` parameter if needed. Do not break existing parsing.

**Tests:**

Add tests in `packages/coding-agent/test/args.test.ts`:

```ts
it("parses comath product mode with a source path", () => {
  const args = parseArgs(["comath", "docs/2605.06651v2.pdf"]);
  expect(args.productMode).toBe("comath");
  expect(args.conversationMode).toBe("comath");
  expect(args.comathSource).toBe("docs/2605.06651v2.pdf");
  expect(args.messages).toEqual([]);
});

it("parses comath product mode without a source path", () => {
  const args = parseArgs(["comath"]);
  expect(args.productMode).toBe("comath");
  expect(args.conversationMode).toBe("comath");
  expect(args.comathSource).toBeUndefined();
});

it("does not treat package commands as comath product mode", () => {
  const args = parseArgs(["install", "foo"]);
  expect(args.productMode).toBeUndefined();
  expect(args.messages).toEqual(["install", "foo"]);
});
```

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/args.test.ts
```

Expected: tests pass after implementation.

## Task 2: Update help text without over-promoting debug commands

**Objective:** Make CLI help show the new product entrypoint.

**Files:**

- Modify: `packages/coding-agent/src/cli/args.ts`
- Test: `packages/coding-agent/test/args.test.ts` if help output is covered.

**Help wording:**

Update usage/commands section to include:

```text
pi comath [source]              Start first-class co-math research mode
```

Update `--comath` help to make it clear it is lower-level/compatibility:

```text
--comath                       Co-math conversation routing for ordinary prompts
```

Avoid implying `/co` or `/comath` is the main UX.

## Task 3: Internally auto-load co-math support for `pi comath`

**Objective:** `pi comath ...` should not require `-e packages/.../co-math/index.ts`.

**Files:**

- Modify: `packages/coding-agent/src/main.ts`
- Possibly modify: `packages/coding-agent/src/core/agent-session-services.ts`
- Possibly modify: `packages/coding-agent/src/core/sdk.ts`
- Test: `packages/coding-agent/test/args.test.ts` or a new focused test if service construction is tested.

**Design:**

For this milestone, use the existing co-math extension as internal plumbing. Avoid moving the entire extension.

In `main.ts`, when `parsed.productMode === "comath"`, append the built-in extension path to `parsed.extensions` or the equivalent extension factory list before session creation.

Potential implementation:

```ts
function getBuiltInCoMathExtensionPath(): string {
  return path.join(getPackageDir(), "examples", "extensions", "co-math", "index.ts");
}

function ensureCoMathExtension(parsed: Args): void {
  if (parsed.productMode !== "comath") return;
  const extensionPath = getBuiltInCoMathExtensionPath();
  parsed.extensions = parsed.extensions ?? [];
  if (!parsed.extensions.includes(extensionPath)) {
    parsed.extensions.push(extensionPath);
  }
}
```

Call it before extension loading/session creation.

If there is already a package/resource loader pattern for built-in resources, prefer that pattern. Do not hardcode fragile relative paths if there is an existing package-dir helper.

**Behavior:**

- `pi comath docs/foo.pdf` auto-loads co-math support.
- `pi --comath -e ...` continues to work.
- Default `pi` does not auto-load co-math.

**Tests:**

If direct `main.ts` behavior is difficult to unit test, add a small exported helper and test it:

```ts
export function getRequiredProductExtensions(parsed: Args, packageDir: string): string[] { ... }
```

Then test it without starting a full TUI.

## Task 4: Add a co-math product source model

**Objective:** Normalize optional source path information for the harness.

**Files:**

- Create: `packages/coding-agent/src/modes/comath/comath-source.ts`
- Test: `packages/coding-agent/test/comath-source.test.ts`

**Implement:**

```ts
import * as path from "node:path";

export interface CoMathSourceInput {
  original: string;
  absolutePath: string;
  displayName: string;
  exists: boolean;
}

export async function resolveCoMathSource(input: string | undefined, cwd: string): Promise<CoMathSourceInput | undefined> {
  if (!input) return undefined;
  const absolutePath = path.isAbsolute(input) ? input : path.resolve(cwd, input);
  const exists = await fileExists(absolutePath);
  return {
    original: input,
    absolutePath,
    displayName: path.basename(absolutePath),
    exists,
  };
}
```

Use `lstat` from `node:fs/promises` for `fileExists`. Do not throw on missing source; return `exists: false` so the UI can show a clear warning.

**Tests:**

- resolves relative path to absolute path;
- marks missing source as `exists: false`;
- returns undefined when no input.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/comath-source.test.ts
```

## Task 5: Add deterministic problem-first auto-planner

**Objective:** Convert a user problem plus optional source into a small fixed co-math setup plan.

**Files:**

- Create: `packages/coding-agent/src/modes/comath/comath-autoplan.ts`
- Test: `packages/coding-agent/test/comath-autoplan.test.ts`

**Important:** This is deterministic. Do not call the model. Do not fuzzy-approve math claims.

Types:

```ts
export interface CoMathAutoPlanInput {
  problem: string;
  sourceDisplayName?: string;
}

export interface CoMathAutoPlan {
  rootQuestion: string;
  goals: string[];
  workstreams: Array<{ slug: string; goal: string }>;
  firstWorkstreamSlug: string;
}
```

Behavior:

Given `problem = "Validate Question 3."` and `sourceDisplayName = "2605.06651v2.pdf"`, output:

```ts
{
  rootQuestion: "Validate Question 3.",
  goals: [
    "Validate Question 3 against 2605.06651v2.pdf using source-backed definitions and preserve proof gaps.",
    "Extract exact definitions, notation, assumptions, and referenced identities needed for Question 3.",
    "Audit the proof dependencies for unsupported transitions, support/indexing gaps, and external-reference dependencies.",
  ],
  workstreams: [
    {
      slug: "extract-question-3-definitions",
      goal: "Extract source-backed definitions, notation, assumptions, and identities relevant to Question 3. Quote or cite source locations. Do not prove new claims.",
    },
    {
      slug: "audit-question-3-proof-dependencies",
      goal: "Trace the proof dependencies for Question 3 and identify external references or unsupported transitions. Preserve uncertainty.",
    },
    {
      slug: "audit-question-3-support-gaps",
      goal: "Audit support, indexing, boundary, and vanishing-step gaps in the Question 3 argument. Do not fill gaps without source-backed evidence.",
    },
  ],
  firstWorkstreamSlug: "extract-question-3-definitions",
}
```

Generalize the slug from the problem safely:

- lower-case;
- replace non-alphanumeric with `-`;
- collapse repeated dashes;
- trim dashes;
- limit length;
- fallback to `problem`.

Do not overfit only Question 3, but include good behavior for it.

**Tests:**

- Question 3 produces source-backed definitions first;
- no source still produces conservative goals/workstreams;
- empty/whitespace problem throws or returns clear error;
- slug generation is stable.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/comath-autoplan.test.ts
```

## Task 6: Expose a reusable co-math backend command runner

**Objective:** Allow the first-class harness to reuse existing co-math state/workstream/role-run logic without pretending the user typed `/comath`.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Possibly create: `packages/coding-agent/examples/extensions/co-math/service.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**Preferred design:**

Export a small service function from `commands.ts` or a new `service.ts`:

```ts
export interface RunCoMathBackendCommandOptions extends RegisterCoMathCommandOptions {
  cwd: string;
  notify: (message: string, type?: "info" | "warning" | "error") => void;
  sendMessage?: ExtensionAPI["sendMessage"];
}

export async function runCoMathBackendCommand(
  command: string,
  options: RunCoMathBackendCommandOptions,
): Promise<void>;
```

If creating a real `ExtensionAPI`/`ExtensionCommandContext` in tests is easier, factor out only what is needed. The key is: first-class harness code should not duplicate state mutation logic.

**Constraints:**

- No `any`.
- Keep existing command registration behavior unchanged.
- Preserve direct `/comath` output behavior.
- Do not make every internal helper public; expose only one narrow backend function.

**Alternative:** If exporting a backend runner is too invasive, use the existing extension command registry after loading the extension and invoke the registered `comath` command handler through the session’s extension runner. But this is less clean and may be harder to test.

**Tests:**

Add a regression test that calling the backend runner for:

```text
init Q3 validation
```

creates state and notifies with initialized state.

## Task 7: Add visible progress formatter

**Objective:** Centralize user-facing progress text so the harness can show what it is doing.

**Files:**

- Create: `packages/coding-agent/src/modes/comath/comath-progress.ts`
- Test: `packages/coding-agent/test/comath-progress.test.ts`

Implement pure helpers:

```ts
export function formatCoMathWelcome(source?: CoMathSourceInput): string;
export function formatAutoPlanSummary(plan: CoMathAutoPlan): string;
export function formatStepProgress(step: string): string;
export function formatFirstRunStarted(runId: string, transcriptPath: string): string;
```

Keep the wording product-level. Avoid `/co` and `/comath` in normal messages.

Expected welcome with source:

```text
Co-math source: 2605.06651v2.pdf
Waiting for a problem to validate.
```

Expected warning if source missing:

```text
Co-math source requested but not found: docs/missing.pdf
You can still describe the problem, but source-backed extraction may be blocked until the file is available.
```

## Task 8: Add first-class co-math harness orchestration

**Objective:** Implement the product loop controller that handles the first problem message by auto-setting up the project.

**Files:**

- Create: `packages/coding-agent/src/modes/comath/comath-harness.ts`
- Test: `packages/coding-agent/test/comath-harness.test.ts`

Design a small orchestrator class:

```ts
export interface CoMathHarnessOptions {
  cwd: string;
  source?: CoMathSourceInput;
  notify: (message: string, type?: "info" | "warning" | "error") => void;
  runBackendCommand: (command: string) => Promise<void>;
  startFirstRun?: boolean;
}

export class CoMathHarness {
  constructor(options: CoMathHarnessOptions);
  handleProblem(problem: string): Promise<void>;
}
```

`handleProblem` steps:

1. Validate non-empty problem.
2. Resolve auto-plan.
3. Notify: planning started.
4. Run backend init:

```text
init <problem or source/problem title>
```

5. If source exists, register it as a file-backed artifact using existing `/comath artifact-file` command syntax.

Suggested command shape if currently supported:

```text
artifact-file source <source.absolutePath> Source paper: Primary source for <problem>
```

Use the actual existing syntax from `commands.ts`/README. If the existing command syntax differs, use the existing syntax.

6. Create each goal:

```text
goal <goal text>
```

7. Create each workstream:

```text
workstream <slug>: <goal>
```

8. Start the first workstream if `startFirstRun !== false`:

```text
run workstream workstream-<firstWorkstreamSlug>
```

9. Notify a final summary with state/report inspection instructions in product terms, not debug commands.

**Safety:**

- If any backend command fails, stop and show clear recovery text.
- If source file is missing, do not register it; show warning and still create source-extraction workstream with blocker warning.
- Do not continue creating duplicate goals/workstreams if state already appears initialized. For first milestone, simplest acceptable behavior: if state exists, show a message asking user whether to continue/reset instead of mutating. Since confirmation UI may be larger, detect state exists and emit:

```text
A co-math project already exists here. I will not auto-initialize over it. Tell me what to focus on next, or use the debug interface to reset manually.
```

Tests should cover no accidental overwrite.

## Task 9: Add `runCoMathMode` entrypoint

**Objective:** Start interactive Pi in co-math product mode with source-aware welcome/progress behavior.

**Files:**

- Create: `packages/coding-agent/src/modes/comath/comath-mode.ts`
- Modify: `packages/coding-agent/src/modes/index.ts`
- Modify: `packages/coding-agent/src/main.ts`
- Test: `packages/coding-agent/test/comath-mode.test.ts` if feasible.

Design:

```ts
export interface CoMathModeOptions extends InteractiveModeOptions {
  source?: string;
}

export async function runCoMathMode(
  runtimeHost: AgentSessionRuntime,
  options: CoMathModeOptions,
): Promise<number>;
```

Practical implementation option:

- Reuse `InteractiveMode` and existing session creation.
- Ensure session has `conversationMode: "comath"`.
- Ensure co-math extension is auto-loaded.
- Inject a co-math welcome message into the TUI on startup via an initial custom message or existing extension UI notification.
- Ensure the first ordinary user problem gets routed to the co-math harness rather than to a raw model prompt.

If the existing `AgentSession.prompt` routing is already `conversationMode: "comath"` -> `/co`, then update that routing for `productMode: "comath"` to use a new higher-level handler:

```text
ordinary prompt -> co-math harness auto-plan/setup
slash command -> existing slash command behavior
```

Do not route problem-first product mode through `/co` if that only creates one intent at a time. `/co` is too low-level for this milestone.

## Task 10: Extend conversation routing to support product-mode harness

**Objective:** Ordinary prompts in first-class co-math mode should hit the auto-planner first.

**Files:**

- Modify: `packages/coding-agent/src/core/conversation-mode.ts`
- Modify: `packages/coding-agent/src/core/agent-session.ts`
- Modify: `packages/coding-agent/src/core/sdk.ts`
- Test: `packages/coding-agent/test/conversation-mode.test.ts`
- Test: `packages/coding-agent/test/comath-harness.test.ts`

Current route helper likely does:

```ts
return `/co ${text}`;
```

For product harness, add a distinction:

```ts
export type ConversationMode = "comath";
export type ConversationRouter = "co-command" | "comath-harness";
```

or add a separate session option:

```ts
coMathHarness?: CoMathHarnessController;
```

Behavior:

- `--comath` continues old compatibility behavior through `/co` unless intentionally changed.
- `pi comath [source]` uses the harness.
- Slash commands are preserved.
- If harness is unavailable, fail with a clear error; do not send to model.

Test cases:

```ts
expect(routeConversationModePrompt("hello", { mode: "comath", router: "co-command" })).toBe("/co hello");
expect(routeConversationModePrompt("hello", { mode: "comath", router: "harness" })).toEqual({ type: "harness", text: "hello" });
expect(routeConversationModePrompt("/help", ...)).toBe("/help");
```

Adapt to actual function shape.

## Task 11: Make visible progress appear in TUI history/status

**Objective:** The user should see Claude Code/Codex-style progress messages while co-math auto-setup happens.

**Files:**

- Modify: `packages/coding-agent/src/modes/interactive/interactive-mode.ts` only if needed.
- Modify/create: `packages/coding-agent/src/modes/comath/comath-progress.ts`
- Test: unit tests for progress text; manual smoke for TUI.

Implementation guidance:

Use existing extension UI APIs where possible:

- `ctx.ui.notify(...)` for visible notifications;
- `ctx.ui.setWorkingMessage(...)` while work is in progress;
- `pi.sendMessage({ customType: "co-math", content, display: true, ... })` for durable chat history messages.

For product-level progress, prefer durable displayed messages over transient notifications. The previous transparency bug came from overwritten notifications. Avoid repeating that.

The output should show step-by-step state transitions:

```text
Planning co-math validation workflow...
Creating project...
Registering source...
Creating validation goals...
Creating workstreams...
Starting first source-audit role...
```

If a nested role run is started and only final output is available, show:

```text
Starting first source-audit role. This can take a while.
Transcript: .pi/co-math/transcripts/role-run-1.jsonl
```

Then show final report id when available.

## Task 12: Add problem-first parser behavior only where needed

**Objective:** Distinguish problem descriptions from commands without making the user learn syntax.

**Files:**

- Modify or create: `packages/coding-agent/src/modes/comath/comath-autoplan.ts`
- Maybe modify: `packages/coding-agent/examples/extensions/co-math/natural-language.ts`
- Test: `packages/coding-agent/test/comath-autoplan.test.ts`

Rules:

- Empty input -> ask for a problem.
- `help` -> show product help.
- `continue`, `focus on ...`, `show uncertainty`, `show latest report` can be future steering commands, but for this milestone only support:
  - first problem auto-setup;
  - `help`;
  - existing slash commands pass through.
- If the project already has a report and the user says `continue`, it is acceptable to say:

```text
Continuation steering is not implemented yet. I can show the latest report or you can describe the next focus.
```

Do not overbuild steering in this milestone.

## Task 13: Add tests for first problem auto-setup

**Objective:** Verify the full auto-plan sequence without using real provider APIs.

**Files:**

- Create/modify: `packages/coding-agent/test/comath-harness.test.ts`

Test with fake backend command runner:

```ts
it("auto-initializes goals, workstreams, and first run from a problem", async () => {
  const commands: string[] = [];
  const messages: string[] = [];
  const harness = new CoMathHarness({
    cwd: "/tmp/project",
    source: { original: "docs/paper.pdf", absolutePath: "/tmp/project/docs/paper.pdf", displayName: "paper.pdf", exists: true },
    notify: (message) => messages.push(message),
    runBackendCommand: async (command) => { commands.push(command); },
  });

  await harness.handleProblem("Validate Question 3.");

  expect(commands[0]).toContain("init");
  expect(commands).toContainEqual(expect.stringContaining("goal Validate Question 3"));
  expect(commands).toContainEqual(expect.stringContaining("workstream extract-question-3-definitions:"));
  expect(commands).toContainEqual(expect.stringContaining("run workstream workstream-extract-question-3-definitions"));
  expect(messages.join("\n")).toContain("Planning co-math validation workflow");
});
```

Use exact existing command syntax in final assertions.

Add missing-source test:

```ts
it("warns and still plans when source path is missing", async () => { ... });
```

Add no-overwrite test if state-existence detection is included.

## Task 14: Add product-mode AgentSession/route tests

**Objective:** Ensure ordinary product-mode prompts do not go to the LLM by accident.

**Files:**

- Modify: `packages/coding-agent/test/conversation-mode.test.ts`
- Possibly use: `packages/coding-agent/test/test-harness.ts`

Test minimum:

- Product-mode ordinary prompt invokes harness or required command path.
- Product-mode slash command passes through unchanged.
- If harness/co-math support is unavailable, throw a clear error.
- Default mode ordinary prompt still goes to the model.

If full AgentSession coverage pulls in problematic TUI modules, keep helper-level tests and document the limitation. But try to use `test/test-harness.ts` first because it already provides a faux provider and event capture.

## Task 15: Update README/user docs

**Objective:** Document the simple user flow, not command plumbing.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`
- Possibly add: `docs/comath-agent-harness-smoke.md` if useful.

README should lead with:

```bash
pi comath <paper-or-project-source>
```

Then:

```text
Validate Question 3.
```

Do not lead with `/comath` commands. Put debug commands under:

```text
Advanced/debug fallback
```

Document expected behavior:

- project created;
- source registered;
- goals/workstreams created automatically;
- first workstream starts;
- transcript/report saved;
- user reviews next.

## Task 16: Manual smoke test without a real provider where possible

**Objective:** Verify the product entrypoint starts and visible setup works.

Try a smoke test that does not require a paid model call first. If the first role run necessarily uses a real provider, add an option/env/test path to stop before role run.

If not already present, add a temporary/no-run flag only for development if it is clean:

```bash
pi comath docs/2605.06651v2.pdf --comath-no-run
```

But avoid adding public flags unless necessary. Prefer using existing tests for no-provider validation.

Manual TUI smoke with real role run:

```bash
mkdir -p /tmp/comath-agent-harness-smoke
cd /tmp/comath-agent-harness-smoke

tmux kill-session -t comath-agent-harness-smoke 2>/dev/null || true
tmux new-session -d -s comath-agent-harness-smoke -x 120 -y 36 "/home/hermes/developer/pi-mono-comath/pi-test.sh comath /home/hermes/developer/pi-mono-comath/docs/2605.06651v2.pdf --approve"
sleep 3
tmux capture-pane -t comath-agent-harness-smoke -p -S -200
```

Then:

```bash
tmux send-keys -t comath-agent-harness-smoke "Validate Question 3." Enter
sleep 5
tmux capture-pane -t comath-agent-harness-smoke -p -S -300
```

If the role run is long:

```bash
sleep 30
tmux capture-pane -t comath-agent-harness-smoke -p -S -300
```

Pass criteria:

- startup mentions co-math product mode/source;
- user typed only a problem, no slash command;
- visible progress shows planning/setup steps;
- state file exists;
- goals and workstreams are created;
- first role run starts or a clear no-provider/error message appears;
- no raw `/co` or `/comath` command is required in the main user flow.

Verify files:

```bash
cd /tmp/comath-agent-harness-smoke
wc -c .pi/co-math/state.json
python3 -c 'import json; s=json.load(open(".pi/co-math/state.json")); print("goals", len(s.get("approvedGoals", []))); print("workstreams", len(s.get("workstreams", []))); print("runs", len(s.get("roleRuns", []))); print("reports", len(s.get("reports", [])))'
```

Clean up tmux:

```bash
tmux kill-session -t comath-agent-harness-smoke
```

## Task 17: Required validation commands

Run targeted tests:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/args.test.ts test/conversation-mode.test.ts test/comath-source.test.ts test/comath-autoplan.test.ts test/comath-progress.test.ts test/comath-harness.test.ts
node ../../node_modules/vitest/dist/cli.js --run test/co-math-natural-language.test.ts test/co-math-extension.test.ts test/co-math-role-runner.test.ts test/co-math-state.test.ts
```

Then from repo root:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

Do not run full `npm test`.

## Task 18: Final implementation report format

When done, report exactly:

```text
Implemented docs/codex-comath-first-class-agent-harness-plan.md

Changed:
- ...

User-facing behavior:
- ...

Validation:
- command: result
- command: result

Manual smoke:
- command/path used
- what was visible
- whether role run started
- state/report/transcript files observed

Limitations:
- ...

No commit made.
```

If manual smoke cannot be run because it requires a real provider/API, say that directly and include the best no-provider validation that was run.

---

# Implementation notes and pitfalls

## Avoid extension-looking UX

Normal output should not say:

```text
Equivalent debug command: /comath ...
```

That was useful for `/co`, but this milestone is first-class product mode. Debug commands can appear only under an explicit advanced/debug section or error recovery text.

## Keep `/co` and `/comath`

Do not delete or degrade them. They are useful for tests/debugging and for recovery.

## Do not silently call the model for setup

Auto-planning is deterministic. The model/role run should start only after the state/workstream setup is visible and saved.

## Preserve mathematical caution

The default workstreams should say things like:

```text
Do not prove new claims.
Quote or cite source locations.
Preserve uncertainty.
Do not fill gaps without source-backed evidence.
```

## Stream/progress pragmatism

The user wants to see what the AI is doing. For this milestone, visible progress can be lifecycle-level:

- planning;
- project created;
- source registered;
- goals created;
- workstreams created;
- role run started;
- transcript path;
- report saved.

Token-level streaming from the nested role is a separate milestone unless it is already easy to surface from `role-runner.ts`.

## Best next milestone after this

After this plan is implemented and verified, the next milestone should be:

```text
Nested role progress streaming and live report preview
```

That would make the first-class co-math mode even closer to Claude Code/Codex by showing role progress while the subagent is actually reasoning, not just before/after lifecycle states.
