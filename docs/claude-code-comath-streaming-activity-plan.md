# Claude Code handoff: stream co-math AI activity in Pi TUI

## Goal

Make Pi co-math mode feel closer to Claude Code/Codex while a background audit is running: after the initial setup milestones, the main TUI should show curated live activity such as reading, searching, checking, running tools, and drafting, instead of only showing:

```text
→ Running source audit in the background
Latest transcript: .pi/co-math/transcripts/role-run-1.jsonl
```

Do not expose raw backend commands, `/comath`, role-run ids, JSONL internals, or verbose token deltas in normal product copy. Keep those available through the transcript path and debug commands.

Do not commit or push unless explicitly asked.

## Current architecture

Relevant files:

- `packages/coding-agent/src/modes/comath/comath-harness.ts`
  - Product wrapper for co-math mode.
  - First natural prompt creates state, pins the source, adds goals/workstreams, queues the first workstream, then runs `dispatch-next --background`.
  - Currently notifies only setup milestones and `formatBackgroundRunStarted(...)`.

- `packages/coding-agent/src/modes/comath/comath-progress.ts`
  - Product-facing copy helpers.
  - `formatBackgroundRunStarted(...)` is the visible start message.
  - `formatProductProgress(...)` is used for manual `show progress`.

- `packages/coding-agent/examples/extensions/co-math/commands.ts`
  - Backend command implementation.
  - `runCoMathBackendCommand(...)` captures synchronous command messages and forwards late background messages through `options.notify(...)` after the command has returned.
  - `dispatchQueuedRoleRunById(...)` starts background runs through `startBackgroundRoleRun(...)`.
  - `executeBackgroundRoleRun(...)` calls the `RoleRunner` and only sends a completion/failure message today.
  - `sendBackgroundMessage(...)` sends late visible messages with `customType: "co-math"` and `details: { kind: "background" }`.

- `packages/coding-agent/examples/extensions/co-math/role-runner.ts`
  - Spawns Pi in JSON print mode for each bounded role:
    ```ts
    ["--mode", "json", "-p", "--no-session", "--append-system-prompt", promptPath, `Task: ${input.task}`]
    ```
  - Writes JSONL transcript events live:
    - `started`
    - `stdout` for each raw JSON stdout line
    - `stderr`
    - `final_assistant_text`
    - `closed`
  - Parses `message_end` to get the final structured JSON summary.
  - This is the best place to derive live activity because stdout is already processed incrementally.

Relevant tests:

- `packages/coding-agent/test/comath-harness.test.ts`
- `packages/coding-agent/test/comath-progress.test.ts`
- `packages/coding-agent/test/comath-backend-output.test.ts`
- Add focused tests near the code you touch. If you add or modify tests, run the specific vitest files from `packages/coding-agent`.

## Product requirements

1. Co-math mode should show live, curated activity while the background role run is active.
2. Activity should be concise and product-level, e.g.:
   ```text
   Source audit activity
   - Reading source context
   ```
   ```text
   Source audit activity
   - Searching the workspace
   ```
   ```text
   Source audit activity
   - Checking a local command
   ```
   ```text
   Source audit activity
   - Drafting the audit report
   ```
3. Do not stream every token. Do not flood the TUI.
4. Deduplicate and throttle repeated activity. A reasonable first version is one visible activity update every 2-5 seconds, plus immediate start and final completion/failure messages.
5. Preserve the detailed transcript path for debugging, but do not make users tail it manually for basic progress.
6. Keep normal product copy free of these internal terms:
   - `Co-math research mode`
   - `co-math project`
   - `co-math goal`
   - `co-math workstream`
   - `role-run`
   - `artifact-`
   - `workstream-`
   - `/comath`
7. Preserve existing background completion and failure messages.
8. Do not change the mathematical validation semantics. This is a visibility/UX feature only.

## Implementation plan

### 1. Add a typed activity callback to the role runner

In `packages/coding-agent/examples/extensions/co-math/role-runner.ts`:

- Add exported types:
  ```ts
  export type CoMathRoleActivityKind =
    | "started"
    | "thinking"
    | "reading"
    | "searching"
    | "running-command"
    | "editing"
    | "drafting"
    | "retrying"
    | "stderr"
    | "completed";

  export interface CoMathRoleActivityEvent {
    kind: CoMathRoleActivityKind;
    timestamp: string;
    role: CoMathRole;
    message: string;
    detail?: string;
  }

  export type CoMathRoleActivityCallback = (event: CoMathRoleActivityEvent) => void | Promise<void>;
  ```

- Extend `RoleRunInput`:
  ```ts
  onActivity?: CoMathRoleActivityCallback;
  ```

- In `runPiRole(...)`, add a small helper:
  ```ts
  const emitActivity = (kind: CoMathRoleActivityKind, message: string, detail?: string): void => {
    void Promise.resolve(input.onActivity?.({
      kind,
      timestamp: new Date().toISOString(),
      role: input.role,
      message,
      ...(detail ? { detail } : {}),
    })).catch(() => {});
  };
  ```

- Emit `started` right after the transcript `started` write.
- Emit `stderr` for meaningful stderr chunks, but keep it sanitized and low frequency. Do not print raw stack-sized chunks to the product UI.
- Emit `completed` after a non-aborted zero-exit run before returning.

### 2. Parse JSON stdout events into coarse activity

Still in `role-runner.ts`, update `processLine(line)` so it continues to write raw transcript lines exactly as today, but also maps known JSON events to activity events.

Keep the parser defensive: unknown JSON shapes should be ignored, not treated as errors.

Suggested helper shape:

```ts
function activityFromPiJsonEvent(event: Record<string, unknown>): { kind: CoMathRoleActivityKind; message: string; detail?: string } | undefined {
  // Inspect event.type and nested fields defensively.
  // Return only coarse product-safe activity.
}
```

Mapping guidance:

- `system/api_retry` or retry-like events -> `retrying`, message `Retrying the model request`.
- Tool call deltas / tool call starts with names like read/file/search -> `reading` or `searching`.
- Bash/process/terminal tool calls -> `running-command`.
- Edit/write/patch tool calls -> `editing`.
- Assistant text deltas or `message_start` / `message_delta` without tool metadata -> `thinking` or `drafting`.
- `message_end` with final assistant text -> do not emit raw final text as activity; existing final report ingestion handles completion.

Important: if exact Pi JSON event shapes are unclear, inspect a real transcript under `.pi/co-math/transcripts/*.jsonl` and add tests for the observed shapes. Do not guess by changing logic blindly.

### 3. Add product formatting for activity

In `packages/coding-agent/src/modes/comath/comath-progress.ts`:

- Add a product-facing formatter, for example:
  ```ts
  export interface CoMathProductActivity {
    stepLabel: string;
    message: string;
    detail?: string;
  }

  export function formatProductActivity(activity: CoMathProductActivity): string {
    return [
      `${activity.stepLabel} activity`,
      `- ${activity.message}`,
      ...(activity.detail ? [`  ${activity.detail}`] : []),
    ].join("\n");
  }
  ```

- Keep it free of forbidden internal terms.
- Add tests in `comath-progress.test.ts`.

If importing from `src/modes/comath/comath-progress.ts` into `examples/extensions/co-math/commands.ts` would create an awkward dependency direction, keep a local formatter in `commands.ts` instead. Prefer avoiding new cycles over centralizing prematurely.

### 4. Forward activity from background role runs

In `packages/coding-agent/examples/extensions/co-math/commands.ts`:

- Extend `BackgroundRoleRunHandle` to track activity throttling:
  ```ts
  lastActivityAt?: number;
  lastActivityKey?: string;
  pendingActivity?: CoMathRoleActivityEvent;
  activityFlushTimer?: NodeJS.Timeout;
  ```
  If `NodeJS.Timeout` is not available or undesirable in this repo’s TS setup, use `ReturnType<typeof setTimeout>`.

- When `executeBackgroundRoleRun(...)` calls `roleRunner(...)`, pass an `onActivity` callback.

- The callback should:
  1. Convert role to product step label using existing `PRODUCT_ROLE_STEP_LABELS`.
  2. Convert activity kinds to user-facing messages.
  3. Drop noisy/duplicate events.
  4. Throttle to one visible message per short interval.
  5. Send through `sendBackgroundMessage(pi, formattedText)`.

Suggested functions:

```ts
function formatCoMathRoleActivity(event: CoMathRoleActivityEvent): string | undefined { ... }
function shouldSendRoleActivity(handle: BackgroundRoleRunHandle, event: CoMathRoleActivityEvent, now: number): boolean { ... }
function sendRoleActivity(pi: ExtensionAPI, handle: BackgroundRoleRunHandle, event: CoMathRoleActivityEvent): void { ... }
```

Use product labels:

- `workstream` -> `Source audit`
- `coordinator` -> `Coordination step`
- `reviewer` -> `Review step`
- `synthesizer` -> `Synthesis step`

Example visible messages:

```text
Source audit activity
- Reading source context
```

```text
Source audit activity
- Searching the workspace
```

```text
Source audit activity
- Running a local check
```

```text
Source audit activity
- Drafting the audit report
```

Avoid showing exact shell commands by default. If commands are shown at all, truncate and sanitize them, and never expose secrets or env values.

### 5. Flush and clean up timers

When a background run completes, fails, aborts, or hits an unexpected error:

- Clear any activity timer in the handle.
- Optionally flush the latest pending non-duplicate activity before final completion, but do not let it appear after the final completion/failure message.
- Ensure `backgroundRoleRuns.delete(run.id)` still happens.

This matters because `startBackgroundRoleRun(...).finally(...)` currently only deletes the handle.

### 6. Preserve foreground behavior

Foreground `/comath dispatch-next` should continue to work. You may pass the same `onActivity` callback for foreground runs later, but do not expand scope unless needed. The requested feature is the product co-math background stream in the main TUI.

### 7. Tests

Add unit tests before or alongside implementation.

Minimum tests:

1. `role-runner` activity extraction:
   - Given sample JSON stdout event lines for a file read/search/tool call/text delta, the helper maps them to product-safe activity events.
   - Unknown event shapes return `undefined` and do not throw.

2. Background activity forwarding in `commands.ts`:
   - A fake `RoleRunner` calls `input.onActivity?.(...)` several times while running.
   - `runCoMathBackendCommand(..., productMode: true, silent: true)` with `dispatch-next --background` eventually forwards at least one product activity notification through `options.notify`.
   - Repeated duplicate activity is deduplicated/throttled.

3. Product copy tests:
   - Activity messages do not contain `/comath`, `role-run`, `workstream-`, or other forbidden internal terms.
   - Completion/failure message tests still pass.

Run focused tests from the package root:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/comath-progress.test.ts test/comath-backend-output.test.ts test/comath-harness.test.ts
```

If you add a new role-runner or command test file, include it explicitly in that command.

After code changes, run from repo root:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
```

Fix all errors, warnings, and infos before handing back.

## Manual validation

Use a scratch directory so the repo is not polluted:

```bash
cd /home/hermes/developer/pi-mono-comath
export SMOKE_ID="comath-stream-$(date +%s)-$$"
export SMOKE_DIR="$(mktemp -d /tmp/comath-stream.XXXXXX)"
printf 'session=%s\ndir=%s\n' "$SMOKE_ID" "$SMOKE_DIR"
tmux new-session -d -s "$SMOKE_ID" -x 120 -y 40 \
  "cd '$SMOKE_DIR' && /home/hermes/developer/pi-mono-comath/pi-test.sh comath /home/hermes/developer/pi-mono-comath/docs/2605.06651v2.pdf --approve"
tmux attach -t "$SMOKE_ID"
```

Inside Pi, type:

```text
Validate Question 3.
```

Expected product-level flow:

```text
I’ll set up a source-backed validation run for: Validate Question 3.

Plan
- Pin the source and target problem.
- Extract definitions and assumptions before proof attempts.
- Audit proof dependencies, especially support/indexing gaps.
- Start with the source audit.

Source: 2605.06651v2.pdf
✓ Validation workspace prepared
✓ Source pinned: 2605.06651v2.pdf
✓ Validation plan created
✓ Definition and assumption audit prepared
✓ Support/indexing gap audit prepared
→ Running source audit in the background
Latest transcript: .pi/co-math/transcripts/role-run-1.jsonl

Source audit activity
- Reading source context

Source audit activity
- Searching the workspace

Source audit activity
- Drafting the audit report
```

The exact activity labels may vary, but there should be visible updates before the final completion/blocked message.

Then type:

```text
show progress
show report
```

Expected:

- `show progress` still reports running/completed/blocked status.
- `show report` still shows sanitized product copy.
- Normal UI does not advertise `/comath` or raw role-run ids except the transcript file path.

Cleanup after the manual test:

```bash
tmux kill-session -t "$SMOKE_ID"
rm -rf "$SMOKE_DIR"
```

## Non-goals

- Do not redesign co-math state, report ingestion, or the mathematical workflow.
- Do not stream raw chain-of-thought or hidden reasoning.
- Do not show every partial token.
- Do not expose backend debug commands in normal product mode.
- Do not remove transcript logging.
- Do not commit unless explicitly asked.
