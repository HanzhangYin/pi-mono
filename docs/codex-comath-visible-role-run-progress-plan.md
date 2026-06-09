# Codex Plan: Co-Math Visible Role-Run Progress Feedback

## Purpose

Improve the Stage 1 co-math role-run user experience so `/comath run ...` no longer feels like a silent batch job.

The immediate problem observed during the First Proof Question 3 validation is that the user ran:

```text
/comath run workstream workstream-try-to-construct-the-markov-chain-and-prove-stationarity
```

and then saw little or no visible feedback while the nested Pi role process was running. The state eventually contained role runs and a report, but the interactive experience did not show clearly:

- that the run had started;
- which role-run id was created;
- what target was being worked on;
- whether the nested Pi process was still running;
- when it finished;
- what report id was saved;
- whether the result was completed, blocked, failed, or aborted;
- what command to run next.

This weakens the co-math experience because mathematical proof exploration needs visible steering and audit feedback.

## Non-goals

Do not implement a full Codex/Claude Code-style interactive chat in this milestone.

Do not add:

- live state mutation from assistant messages;
- a new TUI mode;
- background daemon infrastructure;
- transcript files;
- LaTeX/PDF export;
- new dependencies;
- changes to mathematical claim promotion rules;
- changes to role prompts;
- changes to report/review semantics.

This milestone is only Stage 1: visible progress and completion feedback for existing `/comath run ...` and foreground dispatch commands.

## Current relevant files

Main implementation:

```text
packages/coding-agent/examples/extensions/co-math/commands.ts
packages/coding-agent/examples/extensions/co-math/role-runner.ts
```

Tests:

```text
packages/coding-agent/test/co-math-extension.test.ts
packages/coding-agent/test/co-math-role-runner.test.ts
```

Important current functions:

```text
runProjectRole(...)
executeRunningRoleRun(...)
dispatchQueuedRoleRunById(...)
dispatchNextQueuedRoleRun(...)
formatRoleRunMessage(...)
formatRoleRunDetails(...)
```

The current foreground path creates a role run, saves it as `running`, awaits `roleRunner(...)`, then prints only the final message.

That means the user sees little feedback during the long wait.

## Existing local change to preserve

The current working tree may already contain an uncommitted fix for nested TypeScript CLI execution in development mode:

```text
packages/coding-agent/examples/extensions/co-math/role-runner.ts
packages/coding-agent/test/co-math-role-runner.test.ts
```

That fix addresses this failure:

```text
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts" for packages/coding-agent/src/cli.ts
```

Do not remove or regress it. If the files are already modified, inspect the current diff before editing and keep the `tsx` nested invocation behavior intact.

## User-facing behavior requirements

### 1. `/comath run ...` prints a start message immediately

When a foreground role run starts, print a message as soon as the `running` state is saved.

Example for a workstream:

```text
Started co-math role run role-run-4
Role: workstream
Target: workstream-try-to-construct-the-markov-chain-and-prove-stationarity
State saved: .pi/co-math/state.json
Nested Pi execution started. This may take a while.
```

Example for coordinator/synthesizer with no target:

```text
Started co-math role run role-run-5
Role: coordinator
Target: project
State saved: .pi/co-math/state.json
Nested Pi execution started. This may take a while.
```

Keep text concise. The goal is confidence that something is happening.

### 2. Foreground runs print simple elapsed-time heartbeats

While awaiting the nested role runner, print periodic heartbeat messages.

Suggested interval: 15 seconds.

Example:

```text
role-run-4 still running... elapsed 15s
role-run-4 still running... elapsed 30s
role-run-4 still running... elapsed 45s
```

Requirements:

- Heartbeats should apply to foreground `/comath run ...` and foreground dispatch paths.
- Heartbeats should stop on completion/failure/abort.
- Heartbeats must not mutate project state.
- Heartbeats must not be too frequent.
- Use `setInterval`/`clearInterval` or an equivalent small helper.
- Do not attempt token-level streaming in this milestone.

### 3. Completion message includes final status, report id, blockers, and next commands

On successful role-run execution, show the final role-run status and saved report id.

Example completed case:

```text
Co-math role run role-run-4 completed.
Saved report: report-2
Created claims: claim-3, claim-4
Created warnings: warning-2

Inspect:
/comath run-status role-run-4
/comath report-status report-2
/comath next
```

Example blocked case:

```text
Co-math role run role-run-4 blocked.
Saved report: report-2
Blockers:
- Role output was not valid structured co-math JSON; saved as report only.

Inspect:
/comath run-status role-run-4
/comath report-status report-2
/comath next
```

This should be more explicit than the existing `formatRoleRunMessage(...)` output.

### 4. Invalid structured JSON fallback is explicit

The current fallback blocker is:

```text
Role output was not valid structured co-math JSON; saved as report only.
```

If this blocker is present, the completion message must clearly say:

```text
Role completed, but output was not valid structured co-math JSON.
Saved raw output as report-<n>.
No claims were promoted from structured fields.
```

Do not change fallback semantics unless needed for wording. The key is user clarity.

### 5. Failure message includes recovery guidance

If the nested role process fails or aborts, print:

```text
Co-math role run role-run-4 failed: <error>

Inspect:
/comath run-status role-run-4
/comath runs
```

If status is `aborted`, use `aborted` rather than `failed`.

If a run is left stale in `running`, the existing recovery command is:

```text
/comath recover-run <run-id> <failed|aborted>: <reason>
```

Mention this in failure guidance only when useful, not after every success.

### 6. Background dispatch behavior remains separate

For `--background` dispatch, do not add periodic foreground heartbeats because control returns immediately.

But improve the immediate background message if needed:

```text
Started co-math role run role-run-4 in background.
Inspect:
/comath background-runs
/comath run-status role-run-4
```

Keep existing background semantics.

## Implementation approach

### Step 1: Add formatting helpers in `commands.ts`

Add small helpers near other role-run formatting helpers:

```ts
function formatRoleRunStartMessage(...): string
function formatRoleRunCompletionMessage(...): string
function formatRoleRunFailureMessage(...): string
function formatRoleRunTargetForUser(...): string
```

Prefer simple strings and arrays joined with `\n`, matching existing style.

Do not introduce classes or broad refactors.

### Step 2: Add heartbeat wrapper

Add a helper such as:

```ts
async function runWithRoleRunHeartbeat<T>(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  runId: string,
  operation: () => Promise<T>,
): Promise<T>
```

Suggested behavior:

- record `startedAt = Date.now()`;
- start interval every 15 seconds;
- each tick calls `showCommandMessage(pi, ctx, ...)`;
- clear interval in `finally`;
- return the operation result.

Be careful with TypeScript timer typing. In Node, prefer:

```ts
let interval: ReturnType<typeof setInterval> | undefined;
```

### Step 3: Use start message and heartbeat in `runProjectRole(...)`

After:

```ts
await saveProjectState(statePath, startedState);
```

print the start message before awaiting execution.

Then call `executeRunningRoleRun(...)`. The heartbeat can either wrap inside `executeRunningRoleRun` or be passed as an option. Prefer the smallest clean change.

A minimal acceptable approach:

- `runProjectRole` prints the start message;
- `executeRunningRoleRun` wraps `roleRunner(...)` with heartbeat.

### Step 4: Improve `executeRunningRoleRun(...)` completion and failure messages

Current success path ends with:

```ts
showCommandMessage(pi, ctx, formatRoleRunMessage(run.role, reportId, result));
```

Replace or augment this with a message that includes:

- run id;
- final status (`completed` or `blocked`);
- report id;
- created claim/evidence/warning/artifact ids when non-empty;
- blocker messages when present;
- invalid structured JSON wording when fallback blocker is present;
- next inspection commands.

Current failure path ends with:

```ts
showCommandMessage(pi, ctx, `Co-math ${run.role} role run ${run.id} ${status}: ${errorMessage}`);
```

Replace/augment it with formatted failure guidance.

### Step 5: Foreground dispatch paths

Inspect `dispatchQueuedRoleRunById(...)` and related foreground dispatch logic.

If foreground dispatch also calls `executeRunningRoleRun(...)`, the heartbeat/completion improvements may already apply. Ensure dispatch prints a useful immediate message when it moves a queued run to running.

Do not accidentally add heartbeats to background dispatch.

## Test plan

Follow strict TDD.

### Required tests

Add tests in:

```text
packages/coding-agent/test/co-math-extension.test.ts
```

Likely existing test harness captures command output from `showCommandMessage`. Reuse existing helpers.

Test cases:

1. Foreground `/comath run workstream <id>` prints a start message before role runner resolves.

Use a controllable/deferred fake role runner:

- run command without resolving the promise immediately;
- assert output already contains:
  - `Started co-math role run role-run-...`
  - `Role: workstream`
  - target workstream id;
  - `Nested Pi execution started`.

2. Foreground run prints completion message with report id and inspect commands.

Fake role runner resolves with:

```ts
{ summary: "Candidate found but proof incomplete." }
```

Assert output includes:

```text
completed
Saved report: report-1
/comath run-status role-run-1
/comath report-status report-1
/comath next
```

3. Blocked invalid JSON fallback message is explicit.

Fake role runner returns:

```ts
{
  summary: "raw invalid output",
  blockers: ["Role output was not valid structured co-math JSON; saved as report only."]
}
```

Assert output includes:

```text
blocked
Role completed, but output was not valid structured co-math JSON
No claims were promoted from structured fields
```

4. Failure message includes run-status guidance.

Fake role runner throws:

```ts
new Error("nested Pi failed")
```

Assert output includes:

```text
failed: nested Pi failed
/comath run-status role-run-1
/comath runs
```

5. Optional heartbeat test.

Use fake timers if the test suite already uses them. Otherwise, do not make tests wait 15 seconds.

If fake timers are convenient, assert that after advancing timers by 15 seconds, output includes:

```text
role-run-1 still running... elapsed 15s
```

If fake timers would make the test brittle, structure the heartbeat helper so the interval can be injected in tests, but avoid overengineering.

### Existing validation commands

Run targeted co-math tests from `packages/coding-agent`:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts
```

Then from repo root:

```bash
npm run check

git diff --check
```

Do not run full `npm test`.
Do not run `npm run build` unless explicitly requested.

## Manual smoke test

After tests pass, manually verify with the First Proof Q3 scratch project or a new scratch directory.

Use:

```bash
mkdir -p /tmp/comath-progress-smoke
cd /tmp/comath-progress-smoke

/home/hermes/developer/pi-mono-comath/pi-test.sh \
  -e /home/hermes/developer/pi-mono-comath/packages/coding-agent/examples/extensions/co-math/index.ts \
  --approve
```

Inside Pi:

```text
/comath init Progress smoke test root question
/comath goal Check visible progress behavior.
/comath workstream smoke: Run a short role-run progress smoke test.
/comath run workstream workstream-smoke
```

Expected visible behavior:

- immediate started message;
- if the run takes long enough, at least one heartbeat;
- final completed/blocked/failed message;
- saved report id if a report was produced;
- inspection commands.

If the model returns too fast to show a heartbeat, that is acceptable as long as start and completion messages are visible.

## Acceptance criteria

The implementation is accepted when:

- `/comath run ...` prints immediate start feedback;
- long foreground runs print periodic running feedback;
- success/blocked/failure completion messages include clear ids and next commands;
- invalid structured role output is explicitly explained;
- background behavior is not regressed;
- state semantics are unchanged;
- targeted co-math tests pass;
- `npm run check` passes;
- `git diff --check` passes.

## Suggested Codex prompt

```text
Implement docs/codex-comath-visible-role-run-progress-plan.md.

Keep the scope narrow: improve visible progress and completion feedback for existing co-math foreground role runs. Do not implement interactive chat, transcript files, new state schema, new dependencies, or mathematical behavior changes.

Before editing, inspect the current diff and preserve any existing uncommitted fix for nested TypeScript CLI execution in role-runner.ts.

Use strict TDD:
1. Add failing tests in packages/coding-agent/test/co-math-extension.test.ts for start feedback, completion feedback, invalid-JSON blocked feedback, and failure guidance.
2. Implement the smallest changes in packages/coding-agent/examples/extensions/co-math/commands.ts.
3. Preserve current state semantics and background dispatch behavior.
4. Run:
   node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts
   from packages/coding-agent.
5. Run npm run check and git diff --check from the repo root.
6. Report changed files, test output, and any manual smoke-test result.
```
