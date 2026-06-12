# Co-Math First-Class Agent Harness Fix Implementation Plan

> **For Codex:** Implement this patch on the current `comath/first-class-agent-harness` branch. Do not commit. The existing implementation is a useful foundation, but the milestone is blocked because the product flow still feels like an extension wrapper and loses source/steering semantics.

**Goal:** Fix the first-class co-math harness so `pi comath <source>` gives a simple problem-first experience: structured source registration, visible product-level progress, automatic initial plan/run, and natural steering after setup without requiring `/co` or `/comath`.

**Architecture:** Keep the existing co-math extension/backend as internal plumbing for now. Add the smallest service-layer changes needed for structured source artifacts and product-mode steering. Product mode should be source-aware and natural-language-first; slash commands remain advanced/debug fallback only.

**Tech Stack:** TypeScript in `packages/coding-agent`; existing Pi TUI/session/extension APIs; existing co-math state/storage/role-runner code; Vitest targeted tests.

---

## Current blocker summary

The current implementation passes tests but misses key product acceptance points:

1. Source registration is only a plain `artifact reference ... Path: ...` summary. The source path is not structured in state.
2. After the first prompt creates `.pi/co-math/state.json`, all later ordinary prompts are intercepted by the harness and blocked with an existing-state message.
3. Normal product UX still tells the user to use `/comath ...`.
4. Visible progress is too generic and extension-flavored.
5. The `Validate Question 3.` auto-plan creates only two generic workstreams instead of the requested source/assumption/gap audit workflow.
6. Typing `help` in a fresh `pi comath` workspace can initialize a project for “help”.
7. Backend command “failures” often only notify and return, so the harness can continue after a failed setup step.

This plan fixes those blockers without a broad rewrite.

## Non-negotiable acceptance criteria

Manual smoke must pass:

```bash
mkdir -p /tmp/comath-agent-harness-fix-smoke
cd /tmp/comath-agent-harness-fix-smoke
/home/hermes/developer/pi-mono-comath/pi-test.sh comath /home/hermes/developer/pi-mono-comath/docs/2605.06651v2.pdf --approve
```

Inside Pi, type:

```text
help
```

Expected:

- shows co-math product help;
- does not create `.pi/co-math/state.json`;
- does not mention `/comath` as the primary path.

Then type:

```text
Validate Question 3.
```

Expected visible product-level progress includes the same substance as:

```text
Planning co-math validation workflow...
Created project: Validate Question 3.
Registered source: 2605.06651v2.pdf
Created goal: Validate Question 3 against 2605.06651v2.pdf using source-backed definitions and preserve proof gaps.
Created workstream: Extract source-backed definitions, notation, assumptions, and identities relevant to Question 3.
Created workstream: Identify assumptions and external references used by the proof of Question 3.
Created workstream: Audit support, indexing, boundary, and vanishing-step gaps in the Question 3 argument.
Starting first workstream: Extract source-backed definitions, notation, assumptions, and identities relevant to Question 3.
Started co-math role run role-run-1
Transcript: .pi/co-math/transcripts/role-run-1.jsonl
```

Then type:

```text
focus on the support indexing gap
```

Expected:

- not blocked by “project already exists”;
- records or applies the steering in product terms;
- tells the user what will happen next using natural language.

Then type:

```text
show latest run
```

Expected:

- shows latest run status in product terms;
- does not require `/comath run-status role-run-1`.

State check after setup:

```bash
cd /tmp/comath-agent-harness-fix-smoke
python3 -c 'import json; s=json.load(open(".pi/co-math/state.json")); print("goals", len(s.get("approvedGoals", []))); print("workstreams", len(s.get("workstreams", []))); print("artifacts", s.get("artifacts", [])); print("runs", [(r.get("id"), r.get("status"), r.get("transcriptPath")) for r in s.get("roleRuns", [])])'
```

Expected:

- at least 3 goals or goal-like setup items;
- exactly or at least 3 initial workstreams;
- a structured source artifact with a path field, not only a prose summary containing `Path: ...`;
- first role run started unless provider/model execution is blocked, in which case product output clearly says why.

---

## Task 1: Add a structured source artifact path

**Objective:** Store source files in state with structured path information that role runs and future source tools can inspect.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/schema.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts` only if schema migrations/defaults require it
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-state.test.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**Problem:** Existing `artifact-file` only accepts workspace-contained paths. Product smoke uses an absolute PDF path outside `/tmp/...`, so the harness currently downgrades the source to a plain reference artifact:

```json
{
  "kind": "reference",
  "summary": "Primary source ... Path: /abs/source.pdf"
}
```

This is not sufficient.

**Implementation:**

Add an optional source path field to the artifact schema. Prefer a narrow field over a broad redesign.

Suggested shape in `schema.ts`:

```ts
sourcePath: Type.Optional(Type.String()),
sourcePathKind: Type.Optional(Type.Union([Type.Literal("workspace"), Type.Literal("absolute")])),
```

If `CoMathArtifact` is manually typed rather than generated from TypeBox, add:

```ts
sourcePath?: string;
sourcePathKind?: "workspace" | "absolute";
```

Use this field only for source/file-like artifacts. Keep existing `path` semantics for workspace-relative file artifacts.

**Command support:**

Add a new internal/product-friendly backend command, not necessarily advertised as primary UX:

```text
source <absolute-or-relative-path> <title>: <summary>
```

It should:

1. accept absolute or relative paths;
2. verify the file exists and is a regular file;
3. reject directories and symlinks using the same safety style as `artifact-file`;
4. store an artifact with:

```ts
kind: "source"
title: parsed.title
summary: parsed.summary
sourcePath: parsed absolute path or workspace-relative copied path
sourcePathKind: "absolute"
```

Do not hide the path only in summary.

**Alternative acceptable implementation:**

Copy external sources into workspace-managed storage:

```text
.pi/co-math/sources/<safe-basename>
```

and store:

```ts
kind: "source"
path: ".pi/co-math/sources/2605.06651v2.pdf"
sourcePathKind: "workspace"
```

If copying, avoid overwriting collisions. Use a stable suffix if needed, e.g. hash prefix. Do not follow symlinks unsafely.

**Tests:**

Add `co-math-extension.test.ts` coverage for backend/source command:

```ts
it("registers an absolute source file with structured source path", async () => {
  // create temp file paper.pdf
  // run backend or command: source <abs> Source paper: Primary source for Q3
  // load state
  // expect artifact.kind === "source"
  // expect artifact.sourcePath or artifact.path to be present structurally
  // expect artifact.summary).not.toContain("Path:") unless also structurally present
});
```

Add rejection tests for missing file and directory.

**Expected failure before fix:** source registration test fails because current code only uses `artifact reference ... Path: ...`.

---

## Task 2: Change the harness to use structured source registration

**Objective:** Product mode must call the new structured source command instead of `artifact reference ... Path: ...`.

**Files:**

- Modify: `packages/coding-agent/src/modes/comath/comath-harness.ts`
- Test: `packages/coding-agent/test/comath-harness.test.ts`

**Current code to replace:**

```ts
await this.runBackendCommand(
  `artifact reference ${this.source.displayName}: Primary source for ${trimTerminalPunctuation(plan.rootQuestion)}. Path: ${this.source.absolutePath}`,
);
```

**New behavior:**

Call the structured source command. Example:

```ts
await this.runBackendCommand(
  `source ${this.source.absolutePath} ${this.source.displayName}: Primary source for ${trimTerminalPunctuation(plan.rootQuestion)}`,
);
```

If you implement copy-into-workspace instead, call the command/function that does that.

**Important:** If source registration fails, stop setup and show a product-level recovery message. Do not continue creating goals/workstreams after source registration reports failure.

Because current backend commands mostly notify and return rather than throw, Task 8 adds command result status. If you do Task 8 later, temporarily add a harness-level smoke test using a fake runner that throws on source command failure.

**Tests:**

Update `comath-harness.test.ts` expected command sequence. It should expect `source ...`, not `artifact reference ... Path: ...`.

---

## Task 3: Add product-mode help before any project setup

**Objective:** `help` in `pi comath` should show product help and must not initialize a project named “help”.

**Files:**

- Modify: `packages/coding-agent/src/modes/comath/comath-progress.ts`
- Modify: `packages/coding-agent/src/modes/comath/comath-harness.ts`
- Test: `packages/coding-agent/test/comath-progress.test.ts`
- Test: `packages/coding-agent/test/comath-harness.test.ts`

**Add formatter:**

```ts
export function formatCoMathProductHelp(): string {
  return [
    "Co-math research mode",
    "",
    "Describe the problem you want to validate, for example:",
    "  Validate Question 3.",
    "",
    "After setup, steer naturally:",
    "  continue",
    "  focus on the support indexing gap",
    "  show latest run",
    "  show latest report",
    "  show uncertainty",
    "",
    "I will create goals, source-audit workstreams, transcripts, and reports automatically.",
  ].join("\n");
}
```

Do not include `/comath` in this normal help text. If you want to mention debug commands, put it behind a final line like:

```text
Advanced debug commands are still available through slash commands if needed.
```

Do not list the slash commands.

**Harness behavior:**

At the start of `handlePrompt`:

```ts
const normalized = problemText.trim().toLowerCase();
if (normalized === "help" || normalized === "?") {
  await this.notify(formatCoMathProductHelp());
  return;
}
```

**Tests:**

```ts
it("shows product help without creating setup commands", async () => {
  await harness.handlePrompt("help");
  expect(commands).toEqual([]);
  expect(notices.join("\n")).toContain("Describe the problem");
});
```

---

## Task 4: Split first-prompt setup from later steering

**Objective:** After state exists, ordinary prompts should be treated as steering/status requests instead of being blocked.

**Files:**

- Modify: `packages/coding-agent/src/modes/comath/comath-harness.ts`
- Modify: `packages/coding-agent/src/modes/comath/comath-progress.ts`
- Test: `packages/coding-agent/test/comath-harness.test.ts`

**Current bad behavior:**

```ts
if (await this.hasExistingState()) {
  await this.notify(formatHarnessBlockedByExistingState(), "warning");
  return;
}
```

This blocks all future natural prompts.

**New behavior:**

Use state existence to choose between:

```text
fresh workspace -> setup from problem
existing project -> handle steering/status prompt
```

Suggested structure:

```ts
async handlePrompt(input: string): Promise<void> {
  const prompt = input.trim();
  if (!prompt) { ... }
  if (isProductHelpPrompt(prompt)) { ... }

  if (await this.hasExistingState()) {
    await this.handleSteeringPrompt(prompt);
    return;
  }

  await this.handleInitialProblem(prompt);
}
```

Add:

```ts
private async handleSteeringPrompt(prompt: string): Promise<void> { ... }
```

Minimum steering support for this milestone:

1. `continue`
2. `show latest run`
3. `show latest report`
4. `focus on <topic>`
5. `show uncertainty`
6. fallback arbitrary steering note

Suggested command mapping:

```ts
if (/^continue$/i.test(prompt)) {
  await this.notify("Continuing with the next co-math step...");
  await this.runBackendCommand("next");
  return;
}
if (/^show (?:the )?latest run$/i.test(prompt)) {
  await this.runBackendCommand("run-status latest");
  return;
}
if (/^show (?:the )?latest report$/i.test(prompt)) {
  await this.runBackendCommand("report-status latest");
  return;
}
const focus = /^focus on (.+)$/i.exec(prompt);
if (focus?.[1]) {
  await this.runBackendCommand(`note project: Focus next work on ${focus[1]}`);
  await this.notify(`Recorded focus for the next co-math step: ${focus[1]}`);
  return;
}
if (/^show uncertainty$/i.test(prompt)) {
  await this.runBackendCommand("review-queue");
  return;
}
await this.runBackendCommand(`note project: ${prompt}`);
await this.notify("Recorded your steering note for the co-math project.");
```

Use the actual existing command syntax. If `run-status latest` or `report-status latest` is unsupported, add support for `latest` in the backend command or resolve latest from state in the harness/service.

**Product UX:**

Do not notify:

```text
use /comath status
```

Instead say:

```text
Say "continue", "show latest report", or "focus on ...".
```

**Tests:**

Add tests with a fake existing state file:

```ts
it("routes focus prompts as steering instead of blocking existing state", async () => {
  await writeFile(statePath, "{}", "utf8");
  await harness.handlePrompt("focus on the support indexing gap");
  expect(commands).toContainEqual(expect.stringContaining("note project:"));
  expect(notices.join("\n")).not.toContain("/comath");
});
```

Add tests for `show latest run`, `show latest report`, and `continue`.

---

## Task 5: Remove normal product UX references to `/comath`

**Objective:** Product-mode messages should not ask the user to use debug commands.

**Files:**

- Modify: `packages/coding-agent/src/modes/comath/comath-progress.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts` if needed to allow product output wrapping/filtering
- Test: `packages/coding-agent/test/comath-progress.test.ts`
- Test: `packages/coding-agent/test/comath-harness.test.ts`

**Fix this formatter:**

Current:

```ts
return "A co-math project already exists in this workspace. Continue with ordinary co-math prompts or use /comath status.";
```

Replace with product-level text, or remove the blocked-state formatter if Task 4 makes it unnecessary.

Suggested:

```ts
export function formatExistingProjectHelp(): string {
  return [
    "A co-math project already exists in this workspace.",
    "Say \"continue\", \"show latest report\", \"show latest run\", or \"focus on ...\".",
  ].join("\n");
}
```

**Backend command output issue:**

Some existing backend outputs include debug commands, especially around role run completion/status. Do not globally remove them for `/comath`, because debug mode can keep them. Instead, allow the product harness to request product-style output.

Minimal approach:

- Add `productMode?: boolean` to `RunCoMathBackendCommandOptions`.
- In `runCoMathBackendCommand`, if `productMode` is true, wrap/normalize notify text before sending it to `options.notify`.
- Product normalizer should remove or replace obvious debug lines like:

```text
/comath run-status ...
/comath report-status ...
/comath next
```

with:

```text
Say "show latest run", "show latest report", or "continue".
```

Keep this narrow and tested. Do not alter direct `/comath` output.

**Tests:**

Add a pure formatter test for product output normalization if implemented:

```ts
expect(formatProductBackendMessage("Next: /comath next")).not.toContain("/comath");
expect(formatProductBackendMessage(...)).toContain("continue");
```

---

## Task 6: Improve visible progress to be product-level and step-by-step

**Objective:** The user should see what the agent is doing, not only counts.

**Files:**

- Modify: `packages/coding-agent/src/modes/comath/comath-progress.ts`
- Modify: `packages/coding-agent/src/modes/comath/comath-harness.ts`
- Test: `packages/coding-agent/test/comath-progress.test.ts`
- Test: `packages/coding-agent/test/comath-harness.test.ts`

**Replace generic progress:**

Current:

```text
Co-math autoplan for: Validate Question 3.
Goals: 3
Workstreams: 2
First run: workstream-extract-question-3-definitions
```

Add product step formatters:

```ts
export function formatPlanningStarted(problem: string): string {
  return `Planning co-math validation workflow for: ${problem}`;
}

export function formatProjectCreated(rootQuestion: string): string {
  return `Created project: ${rootQuestion}`;
}

export function formatSourceRegistered(sourceDisplayName: string): string {
  return `Registered source: ${sourceDisplayName}`;
}

export function formatGoalCreated(goal: string): string {
  return `Created goal: ${goal}`;
}

export function formatWorkstreamCreated(title: string): string {
  return `Created workstream: ${title}`;
}

export function formatStartingFirstWorkstream(title: string): string {
  return `Starting first workstream: ${title}`;
}
```

**Harness behavior:**

Notify before/after each major setup action:

1. planning started;
2. project created after init command succeeds;
3. source registered after source command succeeds;
4. each goal created after goal command succeeds;
5. each workstream created after workstream command succeeds;
6. first workstream starting before run command;
7. first run started after backend run command returns/starts.

This may create more messages, but that is intended for a Claude Code/Codex-like feel.

**Tests:**

Update harness test to assert notices include:

```text
Planning co-math validation workflow
Created project
Registered source
Created goal
Created workstream
Starting first workstream
```

---

## Task 7: Strengthen the Question 3 auto-plan

**Objective:** Create a source-backed, uncertainty-preserving validation workflow suitable for the paper/Q3 use case.

**Files:**

- Modify: `packages/coding-agent/src/modes/comath/comath-autoplan.ts`
- Test: `packages/coding-agent/test/comath-autoplan.test.ts`

**Required behavior for `Validate Question 3.` with `2605.06651v2.pdf`:**

Goals should include these ideas:

1. validate Question 3 against the source paper using source-backed definitions and preserve proof gaps;
2. extract exact definitions, notation, assumptions, and referenced identities needed for Question 3;
3. audit proof dependencies and unsupported transitions, especially support/indexing/vanishing-step gaps.

Workstreams should be at least three:

```ts
{
  slug: "extract-question-3-definitions",
  title: "Extract source-backed definitions for Question 3",
  goal: "Extract source-backed definitions, notation, assumptions, and identities relevant to Question 3. Quote or cite source locations. Do not prove new claims.",
}
{
  slug: "identify-question-3-assumptions",
  title: "Identify assumptions and references for Question 3",
  goal: "Identify assumptions, external references, and proof dependencies used by Question 3. Preserve uncertainty when the source is ambiguous.",
}
{
  slug: "audit-question-3-support-gaps",
  title: "Audit support and indexing gaps for Question 3",
  goal: "Audit support, indexing, boundary, and vanishing-step gaps in the Question 3 argument. Do not fill gaps without source-backed evidence.",
}
```

`firstWorkstreamId` should point to the definitions workstream.

**General behavior:**

For non-Question-3 problems, still create three conservative workstreams:

1. extract definitions/assumptions;
2. identify proof obligations/references;
3. audit gaps/counterexamples.

**Tests:**

Add exact-ish tests:

```ts
const plan = createCoMathAutoPlan("Validate Question 3.", "2605.06651v2.pdf");
expect(plan.workstreams).toHaveLength(3);
expect(plan.workstreams[0].slug).toBe("extract-question-3-definitions");
expect(plan.workstreams[2].goal).toContain("support");
expect(plan.workstreams[2].goal).toContain("indexing");
expect(plan.workstreams[2].goal).toContain("Do not fill gaps");
```

---

## Task 8: Add backend command result status or throw-on-error behavior

**Objective:** The harness must stop if a setup command fails.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Modify: `packages/coding-agent/src/modes/comath/comath-harness.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`
- Test: `packages/coding-agent/test/comath-harness.test.ts`

**Current problem:** Many command paths show a usage/error message and return. `runCoMathBackendCommand()` resolves successfully, so the harness continues.

**Minimal implementation option:**

Change backend runner signature:

```ts
export interface CoMathBackendCommandResult {
  ok: boolean;
  messages: string[];
}

export async function runCoMathBackendCommand(...): Promise<CoMathBackendCommandResult>
```

Collect messages sent through `notify`/`sendMessage`. Detect known failure messages in the backend runner if full command refactor is too large:

```ts
const failurePrefixes = [
  "Usage:",
  "Artifact file does not exist:",
  "Artifact path is not a file:",
  "Artifact path is a symlink",
  "Artifact path must stay inside the workspace.",
  "Co-math project state not found",
];
```

Better implementation option:

Refactor command handlers used by product setup to return explicit command result objects. This is cleaner but larger. Keep the patch bounded.

**Harness behavior:**

Create a helper:

```ts
private async runRequiredCommand(command: string, recovery: string): Promise<boolean> {
  const result = await this.runBackendCommand(command);
  if (!result.ok) {
    await this.notify(recovery, "error");
    return false;
  }
  return true;
}
```

If keeping `runBackendCommand: (args) => Promise<void>` for compatibility, at least have fake runner tests cover thrown errors:

```ts
runBackendCommand: async (command) => {
  if (command.startsWith("source ")) throw new Error("source missing");
}
```

Then assert later commands are not run.

**Tests:**

```ts
it("stops setup when source registration fails", async () => {
  const commands: string[] = [];
  const harness = new CoMathHarness({
    ...,
    runBackendCommand: async (command) => {
      commands.push(command);
      if (command.startsWith("source ")) throw new Error("source failed");
    },
  });
  await harness.handlePrompt("Validate Question 3.");
  expect(commands.some((c) => c.startsWith("goal "))).toBe(false);
  expect(notices.join("\n")).toContain("could not register source");
});
```

---

## Task 9: Improve `pi comath` CLI parsing for first non-flag argument

**Objective:** Make `comath` robust when used after normal options.

**Files:**

- Modify: `packages/coding-agent/src/cli/args.ts`
- Test: `packages/coding-agent/test/args.test.ts`

**Current limitation:** Product mode only triggers if `parseInput[0] === "comath"`.

**Required:** First non-flag argument exactly `comath` should start product mode, as long as it is not a value consumed by an option.

Examples that should pass:

```ts
parseArgs(["comath", "docs/paper.pdf"])
parseArgs(["--approve", "comath", "docs/paper.pdf"])
parseArgs(["--model", "gpt-5.5", "comath", "docs/paper.pdf"])
```

Examples that should not accidentally trigger product mode:

```ts
parseArgs(["--name", "comath"])
parseArgs(["--system-prompt", "comath"])
parseArgs(["install", "comath"])
```

**Implementation guidance:**

Avoid a fragile pre-pass that does not know which flags consume values. Prefer handling inside the existing parse loop:

- keep a `canDetectProductCommand` boolean true until a package command or message is parsed;
- when encountering a flag that consumes a value, consume it before checking product command;
- when encountering a non-flag `arg === "comath"` and no prior normal message, switch `productMode = "comath"`, `conversationMode = "comath"`, then consume the next non-flag source if present.

If this is too invasive, keep current behavior and mark as non-blocking. But the tests above are preferred.

---

## Task 10: Product-mode output normalization for role run completion/status

**Objective:** Role run messages shown in product mode should suggest natural next actions.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Modify: `packages/coding-agent/src/modes/comath/comath-progress.ts` if formatter lives there
- Test: `packages/coding-agent/test/co-math-extension.test.ts` or new pure test

**Problem:** Existing role run/status messages include direct `/comath` commands. Keep that in direct debug mode; normalize only through product backend runner.

**Implementation:**

Add function near backend runner:

```ts
export function formatCoMathProductBackendMessage(message: string): string {
  const lines = message.split("\n");
  const filtered = lines.filter((line) => !line.trim().startsWith("/comath "));
  const hadDebugCommand = filtered.length !== lines.length;
  if (!hadDebugCommand) return message;
  return [
    ...filtered,
    "",
    "Next: say \"show latest run\", \"show latest report\", or \"continue\".",
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
```

Use it only when `RunCoMathBackendCommandOptions.productMode === true`.

In `main.ts`, pass `productMode: true` from harness backend runner.

**Tests:**

```ts
expect(formatCoMathProductBackendMessage("Next:\n/comath next")).not.toContain("/comath");
expect(formatCoMathProductBackendMessage("Next:\n/comath next")).toContain("continue");
```

---

## Task 11: Update docs/readme for the simple flow

**Objective:** Make documentation match the first-class product mode.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/README.md` if present
- Modify: `docs/codex-comath-first-class-agent-harness-plan.md` only if Codex wants to add notes; not required

Lead with:

```bash
pi comath <paper-or-source-file>
```

Then:

```text
Validate Question 3.
```

Document natural steering:

```text
continue
focus on the support indexing gap
show latest run
show latest report
show uncertainty
```

Put slash commands under:

```text
Advanced/debug fallback
```

Do not lead with `/comath`.

---

## Task 12: Validation commands

Run exactly:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/args.test.ts test/conversation-mode.test.ts test/comath-source.test.ts test/comath-autoplan.test.ts test/comath-progress.test.ts test/comath-harness.test.ts
node ../../node_modules/vitest/dist/cli.js --run test/co-math-natural-language.test.ts test/co-math-extension.test.ts test/co-math-role-runner.test.ts test/co-math-state.test.ts
```

Then:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

Manual smoke:

```bash
mkdir -p /tmp/comath-agent-harness-fix-smoke
cd /tmp/comath-agent-harness-fix-smoke
/home/hermes/developer/pi-mono-comath/pi-test.sh comath /home/hermes/developer/pi-mono-comath/docs/2605.06651v2.pdf --approve
```

Inside Pi:

```text
help
Validate Question 3.
focus on the support indexing gap
show latest run
```

State check:

```bash
cd /tmp/comath-agent-harness-fix-smoke
python3 -c 'import json; s=json.load(open(".pi/co-math/state.json")); print("goals", len(s.get("approvedGoals", []))); print("workstreams", len(s.get("workstreams", []))); print("artifacts", s.get("artifacts", [])); print("runs", [(r.get("id"), r.get("status"), r.get("transcriptPath")) for r in s.get("roleRuns", [])])'
```

Pass criteria:

- `help` does not initialize state;
- `Validate Question 3.` auto-sets up project;
- source artifact has structured path data;
- at least 3 workstreams are created, including a support/indexing gap audit;
- first role run starts or a clear product-level blocker appears;
- follow-up steering prompt is not blocked;
- normal product output does not require `/comath`.

---

## Final report format for Codex

When complete, report:

```text
Implemented docs/codex-comath-first-class-agent-harness-fix-plan.md

Changed:
- ...

Fixed blockers:
- Source registration: ...
- Product steering after setup: ...
- Product help: ...
- Progress output: ...
- Question 3 autoplan: ...
- Debug command hiding: ...

Validation:
- command: result
- command: result
- npm run check: result
- git diff --check: result

Manual smoke:
- startup source/welcome observed: ...
- help did not create state: ...
- Validate Question 3 setup observed: ...
- steering prompt observed: ...
- state artifact path check: ...

Limitations:
- ...

No commit made.
```

Do not commit.
