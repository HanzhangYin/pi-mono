# Claude Code handoff: co-math setup-only mode that waits for pasted context

## Motivation

The current Pi co-math product mode starts the first background audit immediately after the first normal prompt. That is good for short prompts like `Validate Question 3.`, but it is awkward for real mathematical work where the user wants to initialize a validation workspace first and then paste a long exact problem statement, definitions, and proof context in follow-up messages.

The desired UX is:

1. User starts Pi with a source PDF.
2. User types a normal sentence such as:
   ```text
   Set up validation for Problem X, but wait for pasted context before starting.
   ```
3. Pi creates the validation workspace, pins the source, creates goals/workstreams, and prepares the first audit.
4. Pi does not dispatch the first background role run yet.
5. User pastes context into the normal input box. Pi records it as project context/steering notes.
6. User says `continue`.
7. Pi starts the queued source audit in the background and streams curated activity in the main TUI.

Do not expose `/comath`, role-run ids, workstream ids, queue internals, or backend command vocabulary in normal product copy. Keep debug details available only through existing debug paths.

Do not commit or push unless explicitly asked.

## Expected end result

Manual success transcript should look like this at product level:

```text
Pi is ready to help validate mathematical work.
Source: 2605.06651v2.pdf

Describe the problem you want to investigate.
```

User:

```text
Set up validation for Problem X, but wait for pasted context before starting.
```

Pi:

```text
I’ll set up a source-backed validation run for: Problem X

Plan
- Pin the source and target problem.
- Extract definitions and assumptions before proof attempts.
- Audit proof dependencies, especially support/indexing gaps.
- Wait for your pasted context before starting the first audit.

Source: 2605.06651v2.pdf

✓ Validation workspace prepared
✓ Source pinned: 2605.06651v2.pdf
✓ Validation plan created
✓ Definition and assumption audit prepared
✓ Support/indexing gap audit prepared
✓ Source audit prepared

Paste the exact statement, definitions, assumptions, or proof context now. Say "continue" when you are ready to start.
```

User:

```text
Here is the exact Problem X statement:
[pasted statement]
```

Pi:

```text
Noted. I’ll factor that into the next audit step.
```

User:

```text
Here is the proof context:
[pasted proof excerpt]
```

Pi:

```text
Noted. I’ll factor that into the next audit step.
```

User:

```text
continue
```

Pi:

```text
→ Running source audit in the background
Latest transcript: .pi/co-math/transcripts/role-run-1.jsonl

You can keep steering while it runs. Try: "show progress", "show report", or "focus on ...".

Source audit activity
- Reading source context
```

## Current architecture

Relevant files:

- `packages/coding-agent/src/modes/comath/comath-harness.ts`
  - Main product harness for normal co-math prompts.
  - `handlePrompt(...)` routes the first prompt to `handleInitialProblem(...)` when no state exists.
  - `handleInitialProblem(...)` currently always queues and dispatches the first run when `this.startFirstRun` is true.
  - `handleSteeringPrompt(...)` currently treats `continue` as `runCommand("next", ...)`, which shows the next safe action instead of dispatching a queued run.

- `packages/coding-agent/src/modes/comath/comath-progress.ts`
  - Product-facing copy helpers.
  - Add setup-only/waiting copy here.

- `packages/coding-agent/src/modes/comath/comath-backend-output.ts`
  - Contains `extractStatus(...)`, `extractRunSummary(...)`, and `extractTranscriptPath(...)` helpers for backend messages.
  - Reuse these instead of parsing status in the harness again.

- `packages/coding-agent/examples/extensions/co-math/commands.ts`
  - Backend `/comath queue ...` creates queued role runs.
  - Backend `dispatch-next --background` starts queued role runs.
  - Backend `run-status latest` can expose whether latest run is `queued`, `running`, etc.

Relevant tests:

- `packages/coding-agent/test/comath-harness.test.ts`
- `packages/coding-agent/test/comath-progress.test.ts`
- Existing broader backend tests in:
  - `packages/coding-agent/test/co-math-extension.test.ts`
  - `packages/coding-agent/test/co-math-role-runner.test.ts`

## Product requirements

1. A first prompt that clearly asks to wait for context must set up the workspace but not start the first background audit.
2. The first audit should still be prepared so that a later `continue` can start it without exposing queue/debug commands to the user.
3. Follow-up pasted context should be recorded as project notes using the existing steering path.
4. `continue` should start the prepared queued audit when the latest run is queued.
5. If there is no queued audit, `continue` should preserve existing behavior.
6. `show progress` after setup-only should show a product-safe status that indicates the audit is prepared/waiting, not running.
7. Normal product copy must avoid these internal terms:
   - `Co-math research mode`
   - `co-math project`
   - `co-math goal`
   - `co-math workstream`
   - `Queued co-math workstream`
   - `Started co-math role run`
   - `role-run` except inside the transcript file path if already accepted by existing UI
   - `artifact-`
   - `workstream-`
   - `/comath`
8. Do not remove the existing auto-start behavior. The normal prompt `Validate Question 3.` should still start immediately.
9. Do not add a slash command or require `/co`/`/comath` for the product path.

## Trigger language

Implement a small deterministic classifier in `comath-harness.ts`, not an LLM call.

Recommended helper:

```ts
function shouldWaitForContext(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  const asksToWait = /\bwait\b/.test(normalized) || /\bdon'?t start\b/.test(normalized) || /\bdo not start\b/.test(normalized);
  const mentionsContext = /\bcontext\b/.test(normalized) || /\bpaste[ds]?\b/.test(normalized) || /\bstatement\b/.test(normalized) || /\bproof\b/.test(normalized);
  return asksToWait && mentionsContext;
}
```

Examples that should wait:

- `Set up validation for Problem X, but wait for pasted context before starting.`
- `Initialize validation for Theorem 2.1. Do not start until I paste the proof.`
- `Prepare a validation run, wait for my exact statement and context.`

Examples that should not wait:

- `Validate Question 3.`
- `Check this theorem for support gaps.`
- `Please start auditing the proof below: ...`

Keep the classifier conservative. False negatives are better than false positives because the user can still steer normally.

## Implementation plan

### 1. Add product copy for setup-only/waiting mode

Modify `packages/coding-agent/src/modes/comath/comath-progress.ts`.

Add a formatter such as:

```ts
export function formatWaitingForContext(sourceAuditPrepared: boolean): string {
  return [
    ...(sourceAuditPrepared ? [formatSetupStep("Source audit prepared")] : []),
    "",
    'Paste the exact statement, definitions, assumptions, or proof context now. Say "continue" when you are ready to start.',
  ].join("\n");
}
```

Alternatively use a more specific name like `formatReadyForContextPrompt()`.

Update `formatInitialValidationPlan(...)` so it can replace `- Start with the source audit.` with `- Wait for your pasted context before starting the first audit.` when setup-only mode is active.

Suggested signature:

```ts
export interface InitialValidationPlanOptions {
  waitForContext?: boolean;
}

export function formatInitialValidationPlan(
  problem: string,
  sourceDisplayName?: string,
  options: InitialValidationPlanOptions = {},
): string { ... }
```

Keep existing call sites working by defaulting `options`.

Add tests in `packages/coding-agent/test/comath-progress.test.ts`:

- Default plan still contains `- Start with the source audit.`
- Wait plan contains `- Wait for your pasted context before starting the first audit.`
- Waiting copy does not contain forbidden internal terms.

### 2. Make initial setup queue but not dispatch when the prompt asks to wait

Modify `packages/coding-agent/src/modes/comath/comath-harness.ts`.

Add a local boolean inside `handleInitialProblem(...)`:

```ts
const waitForContext = shouldWaitForContext(problem);
```

Pass it to `formatInitialValidationPlan(...)`.

Change the first-run block from “queue and dispatch if `this.startFirstRun`” to:

- If `this.startFirstRun` is false: preserve current test-helper behavior and do not queue or dispatch.
- Else always queue the first workstream after setup succeeds.
- If `waitForContext` is true: notify waiting copy and return without dispatching.
- Else dispatch immediately as today.

The resulting control flow should be:

```ts
if (this.startFirstRun) {
  if (!(await this.runRequiredCommand(`queue workstream ${plan.firstWorkstreamId}`, "Could not prepare the source audit."))) {
    return;
  }
  if (waitForContext) {
    await this.notify(formatWaitingForContext(true));
    return;
  }
  const dispatched = await this.runCommand(
    "dispatch-next --background",
    "Could not start the source audit. Check model/provider configuration and try again.",
  );
  if (!dispatched) return;
  await this.notify(formatBackgroundRunStarted(extractTranscriptPath(dispatched.messages)));
}
```

Use product wording like “prepare the source audit,” not “queue.”

### 3. Make `continue` dispatch a queued prepared audit

Modify `handleSteeringPrompt(...)` in `comath-harness.ts`.

Current behavior:

```ts
if (/^continue$/i.test(prompt)) {
  const result = await this.runCommand("next", "Could not identify the next step.");
  ...
}
```

New behavior:

1. On `continue`, first call `run-status latest` via `tryCommand(...)`.
2. If result is ok and `extractStatus(result.messages) === "queued"`, run `dispatch-next --background`.
3. If dispatch succeeds, notify `formatBackgroundRunStarted(extractTranscriptPath(dispatched.messages))`.
4. Return.
5. Otherwise preserve old `next` behavior.

Pseudo-code:

```ts
if (/^continue$/i.test(prompt)) {
  const latestRun = await this.tryCommand("run-status latest");
  if (latestRun?.ok && extractStatus(latestRun.messages) === "queued") {
    const dispatched = await this.runCommand(
      "dispatch-next --background",
      "Could not start the prepared source audit. Check model/provider configuration and try again.",
    );
    if (dispatched) {
      await this.notify(formatBackgroundRunStarted(extractTranscriptPath(dispatched.messages)));
    }
    return;
  }

  const result = await this.runCommand("next", "Could not identify the next step.");
  if (result) {
    await this.notify(joinProductMessages(result.messages) || "Nothing to do right now.");
  }
  return;
}
```

Import `extractStatus` from `comath-backend-output.ts`.

### 4. Product progress for queued/prepared state

`formatProductProgress(...)` currently prints raw status value:

```text
- Source audit: queued
```

That is acceptable but less product-like. Prefer mapping queued to prepared/waiting:

```ts
function formatProductRunStatus(status: string | undefined): string {
  if (status === "queued") return "prepared; waiting for you to say continue";
  return status ?? "unknown";
}
```

Then use:

```ts
`- Source audit: ${formatProductRunStatus(run.status)}`
```

Add/update tests in `comath-progress.test.ts`.

### 5. Harness tests

Update `packages/coding-agent/test/comath-harness.test.ts`.

Add a new test: first prompt can set up and wait.

Expected commands for:

```text
Set up validation for Problem X, but wait for pasted context before starting.
```

Should include setup commands and queue command, but not dispatch:

```ts
expect(commands).toContain("queue workstream workstream-problem-x");
expect(commands).not.toContain("dispatch-next --background");
```

Expected visible text:

- Contains `✓ Source audit prepared`
- Contains `Say "continue" when you are ready to start.`
- Does not contain `→ Running source audit in the background`
- Passes `expectProductCopy(...)`

Add a second test: `continue` dispatches a queued prepared audit.

Setup:

- Create fake state file so `handlePrompt("continue")` routes to steering.
- Make fake `runBackendCommand` return a queued run for `run-status latest`:
  ```text
  role-run-1
  Role: workstream
  Status: queued
  Execution mode: background
  Transcript: .pi/co-math/transcripts/role-run-1.jsonl
  Report: none
  Blockers:
  - none
  ```
- Make fake `dispatch-next --background` return:
  ```text
  Started run in background.
  Transcript: .pi/co-math/transcripts/role-run-1.jsonl
  ```

Expected commands:

```ts
expect(commands).toEqual(["run-status latest", "dispatch-next --background"]);
```

Expected visible text:

- Contains `→ Running source audit in the background`
- Contains transcript path

Add a third test: `continue` preserves old behavior if there is no queued run.

- `run-status latest` returns ok with `Status: completed` or returns not ok.
- Expected commands include `next` after the status check.

### 6. Avoid accidental state creation from help

Do not change help behavior. Existing test `shows product help without creating setup commands` must still pass.

### 7. Validation commands

Run focused tests from `packages/coding-agent`:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/comath-progress.test.ts test/comath-backend-output.test.ts test/comath-harness.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts
```

Then run required repo check from root:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
```

Do not run `npm test` or `npm run build` unless explicitly asked.

## Manual smoke test

Use a scratch directory so the repo is not polluted:

```bash
cd /home/hermes/developer/pi-mono-comath
export SMOKE_ID="comath-wait-context-$(date +%s)-$$"
export SMOKE_DIR="$(mktemp -d /tmp/comath-wait-context.XXXXXX)"
printf 'session=%s\ndir=%s\n' "$SMOKE_ID" "$SMOKE_DIR"
tmux new-session -d -s "$SMOKE_ID" -x 120 -y 40 "cd '$SMOKE_DIR' && /home/hermes/developer/pi-mono-comath/pi-test.sh comath /home/hermes/developer/pi-mono-comath/docs/2605.06651v2.pdf --approve"
tmux attach -t "$SMOKE_ID"
```

Inside Pi, type:

```text
Set up validation for Problem X, but wait for pasted context before starting.
```

Expected:

- Setup milestones appear.
- `Source audit prepared` appears.
- There is no `Running source audit in the background` yet.
- No streamed activity appears yet.

Then type:

```text
Here is the exact Problem X statement: For testing, treat this as the target claim. Check whether every referenced definition and proof step is supported by the source or this pasted context.
```

Expected:

```text
Noted. I’ll factor that into the next audit step.
```

Then type:

```text
show progress
```

Expected product-safe status such as:

```text
Current progress
- Source audit: prepared; waiting for you to say continue
- Report: none yet
- Blockers: none
```

Then type:

```text
continue
```

Expected:

- The queued audit starts.
- `→ Running source audit in the background` appears.
- Streamed activity begins.

Then type after activity starts:

```text
show progress
```

Expected:

- Status is running/background or later blocked/completed.

Cleanup after the manual test:

```bash
tmux kill-session -t "$SMOKE_ID"
rm -rf "$SMOKE_DIR"
```

## Risks and tradeoffs

- Conservative trigger detection may miss some natural phrasing. That is acceptable for v1; users can phrase the request with `wait` and `context`/`paste`.
- Aggressive trigger detection would be worse because it could unexpectedly stop auto-start for normal prompts.
- If `continue` changes behavior too broadly, it could surprise users. Limit dispatch-on-continue to the case where `run-status latest` is explicitly `queued`.
- Queuing before context means the role run task text is still based on the initial problem. This is acceptable because pasted context is recorded as project notes before dispatch. If later tests show the role runner does not read project notes, extend the role task construction in the backend so queued runs include current project notes at dispatch time. Do not do that unless needed.

## Non-goals

- Do not redesign co-math state schema.
- Do not add a new slash command.
- Do not require users to use `/co` or `/comath`.
- Do not remove immediate auto-start for normal prompts.
- Do not stream hidden reasoning or raw JSON.
- Do not commit or push unless explicitly asked.
