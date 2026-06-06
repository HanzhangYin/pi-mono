# Co-Math Background Dispatch and Interruptible Runs Implementation Plan

> **For Hermes:** This is the next bounded phase after `docs/co-math-queued-role-dispatch-plan.md`. Use subagent-driven-development / Codex only after the queued-dispatch implementation is committed. Hermes owns architecture alignment.

**Goal:** Allow queued co-math role runs to execute asynchronously in the current Pi session, while preserving durable run provenance, human interruption, and state safety.

**Architecture:** Add an in-process background dispatch layer on top of durable queued/running `RoleRunRecord`s. Background dispatch must transition the run to `running` and save state before starting the role runner, then complete/fail/abort by reloading the latest state from disk so concurrent human edits are not lost. This is not a daemon, scheduler, external worker, or autonomous loop.

**Tech Stack:** TypeScript, existing Pi coding-agent extension API, Vitest, existing `.pi/co-math/state.json` storage, no new dependencies.

---

## 0. Why this phase comes next

The co-math scaffold now has a durable queue:

```text
queue -> dispatch explicitly -> running -> completed/blocked/failed/aborted/cancelled
```

That is the right substrate for the paper's asynchronous workstream model, but it is still synchronous from the user's perspective: `/comath dispatch-next` and `/comath dispatch-run` wait for the role runner before returning.

The next paper-aligned behavior is bounded background execution:

```text
queue role run -> start it in background -> continue interacting -> receive completion/failure notice
```

This should be implemented as a conservative in-process session feature first, not as an external daemon. If the Pi process exits, durable `running` records remain and the existing `/comath recover-run` command remains the recovery path.

---

## 1. Framework alignment constraints

Source of truth: `/Users/hanzhangyin/Developer/2605.06651v2.pdf`, especially:

- asynchronous interactions;
- multiple active workstreams;
- user steering while agents work;
- preservation of failed, stalled, or interrupted attempts;
- progressive disclosure from status to individual run details;
- caution against non-termination/death spirals and autonomous loops.

Required commitments:

1. Background dispatch must be explicit.
   - No daemon.
   - No scheduler.
   - No automatic retry.
   - No automatic dispatch-next loop.
   - No parallel fanout command.

2. Durable state still leads.
   - The run must already be queued.
   - The command must transition queued -> running and save state before invoking the role runner.
   - If the process dies, state must show a stale `running` run that can be recovered.

3. Completion must be state-safe.
   - A background run may finish after the human has added notes, blocked workstreams, revised claims, or resolved warnings.
   - Therefore completion/failure/abort must reload the latest state from disk before applying `finishRoleRun` / `failRoleRun` and ingestion.
   - Never overwrite intervening user changes by saving a stale snapshot captured at dispatch time.

4. Human interruption is first-class.
   - The user can abort a live in-process background run.
   - If the run is not live in this process but is durably `running`, tell the user to use `/comath recover-run`.
   - Abort requests are not proof evidence and do not create fake reports.

5. Existing invariants remain unchanged.
   - Proof promotion requires attached proof evidence and no attached open warning.
   - Human notes remain artifacts/provenance, not proof.
   - Review rounds remain provenance, not proof.
   - Queued/cancelled semantics from the previous phase remain unchanged.

Unacceptable drift:

- background workers outside the current process;
- launchd/cron/daemon/scheduler integration;
- automatic retry;
- autonomous multi-run loops;
- new dependencies;
- provider/model changes;
- role JSON changes;
- proof-promotion changes;
- hidden deletion of stale running records.

---

## 2. Allowed files

Codex may modify only:

```text
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/examples/extensions/co-math/commands.ts
packages/coding-agent/examples/extensions/co-math/state-tool.ts
packages/coding-agent/examples/extensions/co-math/README.md
packages/coding-agent/test/co-math-state.test.ts
packages/coding-agent/test/co-math-extension.test.ts
```

Do not modify unless Hermes explicitly approves:

```text
packages/coding-agent/examples/extensions/co-math/role-runner.ts
packages/coding-agent/examples/extensions/co-math/agents/*.md
packages/coding-agent/test/co-math-role-runner.test.ts
package.json
npm-shrinkwrap.json
```

Stop rule: if another file seems necessary, stop and explain why before editing.

No commits.

---

## 3. Explicit non-goals

Do not implement:

- external background process;
- daemon/scheduler/watchers;
- automatic retry;
- queue priorities;
- dependencies between queued runs;
- parallel fanout;
- automatic dispatch loops;
- persistent background worker registry outside `.pi/co-math/state.json`;
- provider/model config changes;
- new role JSON fields;
- living-paper rendering;
- LaTeX export;
- theorem prover integration;
- new dependencies.

This phase is in-process asynchronous dispatch only.

---

## 4. User-facing command target

### 4.1 Add background dispatch commands

Add help entries:

```text
/comath dispatch-next --background - start the oldest queued role run asynchronously
/comath dispatch-run <run-id> --background - start a specific queued role run asynchronously
/comath background-runs - list live in-process background role runs
/comath abort-run <run-id>: <reason> - request abort for a live background role run
```

Keep existing foreground commands unchanged:

```text
/comath dispatch-next
/comath dispatch-run <run-id>
/comath run <role> [target]
```

### 4.2 `dispatch-next --background`

Behavior:

1. Load state.
2. Find oldest queued run exactly like foreground `dispatch-next`.
3. Transition that same run id queued -> running.
4. Save state before invoking the role runner.
5. Create an `AbortController` for this run.
6. Store a live handle in a module-level map.
7. Start the role runner in a promise chain without awaiting it.
8. Immediately notify:

```text
Started co-math <role> role run <run-id> in background.
```

9. When the promise resolves/rejects, finalize against latest state and send a completion/failure/abort message through `pi.sendMessage`.

### 4.3 `dispatch-run <run-id> --background`

Same as `dispatch-next --background`, but targets a specified queued run.

Required errors:

- unknown run -> `No role run found for <run-id>.`
- non-queued run -> `Cannot dispatch <run-id> because its status is <status>.`
- already live in current process -> clear message and no duplicate invocation.

### 4.4 `background-runs`

Show live in-process background handles, not merely durable `running` records.

If none:

```text
No live co-math background role runs in this session.
```

If present:

```text
Live co-math background role runs
- role-run-3 [workstream] started <timestamp>
```

Also mention:

```text
Durable running records that are not listed here may be stale; use /comath recover-run if needed.
```

### 4.5 `abort-run <run-id>: <reason>`

Behavior:

1. Parse strictly with colon and non-empty reason.
2. If run id is live in the module-level background map:
   - record a `human_intervention_recorded` event with the abort request reason;
   - call the stored abort controller;
   - notify that abort was requested;
   - do not directly mark the run failed/aborted unless the role runner rejects or aborts.
3. If run id exists durably with `running` status but is not live:
   - tell the user it is not live in this process and suggest `/comath recover-run <run-id> aborted: <reason>`.
4. If run id exists but is not running:
   - explain current status.
5. If run id is missing:
   - show no-run-found message.

Do not create reports, evidence, claims, warnings, or artifacts for abort requests.

---

## 5. Internal design target

### 5.1 Add minimal execution mode metadata

Add to `schema.ts`:

```ts
export type RoleRunExecutionMode = "foreground" | "background";
```

Extend `RoleRunRecord`:

```ts
executionMode?: RoleRunExecutionMode;
```

Storage semantics:

- immediate `/comath run` sets `executionMode: "foreground"`;
- foreground dispatch sets `executionMode: "foreground"`;
- background dispatch sets `executionMode: "background"`;
- queued records may omit `executionMode` until dispatch;
- legacy normalization should leave old records valid, preferably with `executionMode: "foreground"` for records that already have `startedAt`.

This is useful for `/comath run-status`, audit, and debugging stale runs.

### 5.2 Extend dispatch helper input

Update `dispatchQueuedRoleRun` input to accept:

```ts
executionMode?: RoleRunExecutionMode;
```

Behavior:

- default to `foreground` if omitted;
- write `executionMode` when transitioning queued -> running.

Do not add background behavior to storage helpers. Storage should only model state transitions.

### 5.3 Module-level live handle map

In `commands.ts`, add a module-level map:

```ts
interface BackgroundRoleRunHandle {
	runId: string;
	role: CoMathRole;
	startedAt: string;
	controller: AbortController;
	completion: Promise<void>;
}

const backgroundRoleRuns = new Map<string, BackgroundRoleRunHandle>();
```

Rules:

- key by run id;
- insert before starting role runner;
- delete in `finally` after completion/failure/abort handling;
- never persist controller or promise;
- do not treat the map as source of truth for durable status.

### 5.4 Refactor execution helper carefully

Current foreground helper likely takes a started state snapshot. For background, introduce a shared lower-level helper that accepts:

```ts
interface ExecuteRunningRoleRunOptions {
	pi: ExtensionAPI;
	cwd: string;
	statePath: string;
	runId: string;
	signal?: AbortSignal;
	notify: (message: string) => void;
}
```

Important behavior:

1. Load current state at invocation start only to get the running run and task.
2. Invoke `roleRunner` with the task and signal.
3. On result or error, reload latest state from disk before mutating state.
4. Find the run in latest state.
5. If latest run is no longer `running`, do not call `finishRoleRun` / `failRoleRun`.
   - Notify that completion was ignored because the run is now `<status>`.
   - This prevents a human `recover-run` from being overwritten by a late background completion.
6. If still running, ingest result and finish/fail/abort normally.

Foreground dispatch may continue using the existing path, but it is safer to reuse the same latest-state finalization helper for both foreground and background.

### 5.5 Background notification

Do not depend on `ctx.ui` after a command handler returns.

Use a small helper for background completion messages:

```ts
function sendBackgroundMessage(pi: ExtensionAPI, text: string): void {
	pi.sendMessage({
		customType: "co-math",
		content: text,
		display: true,
		details: { kind: "background" },
	});
}
```

For the immediate acknowledgement inside the command handler, existing `showCommandMessage` is fine.

---

## 6. State-safety requirements

These requirements are the main point of this phase.

### 6.1 Save running state before invocation

Testable invariant:

```text
When the background role runner starts, .pi/co-math/state.json already contains the run with status running and executionMode background.
```

Write a command-level test where the fake role runner reads the state file during invocation and asserts the run is already `running`.

### 6.2 Preserve concurrent human changes

Testable invariant:

```text
If the human records a note while a background role run is pending, the note still exists after the background run completes.
```

Use a deferred promise fake role runner:

1. queue run;
2. dispatch background;
3. before resolving fake role runner, call `/comath note project: human note while running`;
4. resolve fake role runner;
5. wait for completion;
6. load state;
7. assert the human_note artifact still exists and the run completed.

### 6.3 Do not overwrite recovery

Testable invariant:

```text
If a background role run is recovered while the role runner is still pending, late completion must not change its recovered status.
```

Use a fake role runner that resolves only after recovery:

1. queue run;
2. dispatch background;
3. recover run as aborted or failed;
4. resolve fake role runner with a success result;
5. assert final status remains aborted/failed;
6. assert no fake report was created from the late result.

### 6.4 Abort live background run

Testable invariant:

```text
abort-run calls the live AbortController and the eventual role runner rejection marks the run aborted.
```

Use a fake role runner that listens to signal abort and rejects with the existing abort message, or otherwise simulates abort behavior.

---

## 7. Audit/status/display target

### 7.1 `/comath run-status`

Show execution mode when present:

```text
Execution mode: background
```

For background running runs, it is acceptable to say whether it is live in this process:

```text
Live in this session: yes
```

or

```text
Live in this session: no; use /comath recover-run if stale
```

### 7.2 `/comath runs`

Include a compact marker:

```text
role-run-3 [running/background] workstream
```

Keep output terminal-friendly.

### 7.3 `/comath status`

Add or preserve counts for running/queued/cancelled. If simple, add:

```text
Live background runs: N
```

### 7.4 `/comath audit`

Add read-only checks:

- running background run with no `startedAt` -> problem;
- background terminal run with no `startedAt` -> problem;
- queued run should not have `executionMode` unless you intentionally choose to store planned mode; if it has `executionMode: background`, document and test that choice;
- background running records that are not live should be reported as possible stale records, not auto-fixed.

Be careful: a durable background running record might be from a previous process, so audit should report it as a warning/problem but must not mutate it.

---

## 8. Tests

Use strict TDD. Add RED tests first.

### 8.1 Storage tests

Modify:

```text
packages/coding-agent/test/co-math-state.test.ts
```

Add tests:

1. `dispatchQueuedRoleRun records background execution mode`
   - queue role run;
   - dispatch with `executionMode: "background"`;
   - assert run is `running` and `executionMode === "background"`.

2. `legacy started role runs normalize to foreground execution mode`
   - write old state without `executionMode`;
   - load;
   - assert existing started/terminal run has `executionMode: "foreground"` or is otherwise accepted per documented normalization.

If you decide not to persist `executionMode`, do not add these tests; instead add display/status tests proving background visibility is handled via live map only. Persisting `executionMode` is preferred.

### 8.2 Command tests

Modify:

```text
packages/coding-agent/test/co-math-extension.test.ts
```

Add tests:

1. `dispatch-next --background saves running state before role invocation`
   - queue a run;
   - fake roleRunner reads the state file immediately when invoked;
   - assert status is running and executionMode background;
   - complete fake roleRunner;
   - assert terminal status.

2. `dispatch-run --background starts the specified queued run and returns immediately`
   - queue two runs;
   - dispatch second in background;
   - assert command notification occurs before roleRunner resolves;
   - assert first remains queued;
   - assert second is live/running.

3. `background completion preserves concurrent human notes`
   - use deferred roleRunner;
   - dispatch background;
   - add `/comath note project: ...` while pending;
   - resolve roleRunner;
   - load state;
   - assert human note artifact remains and run completed.

4. `late background completion does not overwrite recovered run`
   - dispatch background;
   - recover as aborted while roleRunner pending;
   - resolve roleRunner successfully;
   - assert status remains aborted and no report from late success exists.

5. `abort-run aborts a live background run and records human provenance`
   - fake roleRunner waits for signal abort;
   - dispatch background;
   - call `/comath abort-run role-run-1: user changed direction`;
   - assert eventual status aborted;
   - assert `human_intervention_recorded` event exists;
   - assert no fake report/evidence/claims/warnings/artifacts.

6. `abort-run explains stale durable running run when not live`
   - create or recover state with running background run but no live handle;
   - call abort-run;
   - assert message points to `/comath recover-run`.

7. `background-runs lists live handles only`
   - dispatch background with deferred roleRunner;
   - call background-runs;
   - assert live run listed;
   - resolve;
   - call background-runs;
   - assert none listed.

8. `foreground dispatch remains unchanged`
   - existing dispatch tests should still pass;
   - add one assertion that foreground dispatch either has `executionMode: "foreground"` or no background marker.

9. `audit reports stale background running records without mutating state`
   - write state with running/background run not live;
   - run audit;
   - assert warning/problem text;
   - reload state and assert unchanged.

### 8.3 Documentation tests

Extend README/state-tool tests to mention:

```text
/comath dispatch-next --background
/comath dispatch-run <run-id> --background
/comath background-runs
/comath abort-run
background
stale running
recover-run
```

---

## 9. Implementation notes

### 9.1 Deferred test helper

In tests, create a small deferred helper local to the test file:

```ts
function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}
```

Avoid timers/sleeps where possible.

### 9.2 Promise cleanup

Background promise chain should be fire-and-forget but handled:

```ts
const completion = executeBackgroundRoleRun(...)
	.catch((error) => {
		// final defensive notification; main helper should handle normal failures
	})
	.finally(() => {
		backgroundRoleRuns.delete(runId);
	});
```

Do not leave unhandled promise rejections.

### 9.3 Abort behavior

`AbortController.abort()` does not guarantee that arbitrary role runners stop. The command should be honest:

```text
Requested abort for background role run role-run-1.
```

The durable status should become `aborted` only when the role runner actually rejects/throws with abort. Tests can use a fake role runner that does this deterministically.

### 9.4 State reload before finalization

This is mandatory. A correct completion path looks like:

```text
role runner resolves -> loadProjectState(statePath) -> find running run -> ingest/finish -> save
```

A wrong completion path looks like:

```text
role runner resolves -> mutate stale startedState from dispatch time -> save
```

The wrong path will lose human notes and other concurrent edits.

### 9.5 Late completion after recovery

If latest state says the run is no longer `running`, skip finalization. This can happen if the human used `/comath recover-run` or another command changed the run while background work was pending.

Suggested notification:

```text
Background role run role-run-1 finished, but durable status is aborted; skipped late completion.
```

---

## 10. Verification

Run:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts

cd /Users/hanzhangyin/Developer/pi-mono-comath
npm run check
git diff --check
```

Also report:

```bash
git status --short --untracked-files=all
git diff --name-only
```

Expected:

- targeted co-math tests pass;
- full repo check passes;
- no whitespace errors;
- changed files limited to allowed files;
- no package/lockfile changes;
- no role-runner or agent prompt changes;
- no unhandled promise rejections in tests.

---

## 11. Codex handoff prompt

```text
Implement docs/co-math-background-dispatch-plan.md using strict TDD.

This is the first true asynchronous co-math execution milestone, but keep it in-process and explicit. Do not add daemons, schedulers, watchers, automatic retries, automatic dispatch loops, parallel fanout, new dependencies, provider/model changes, role JSON fields, external storage, or broad refactors.

Goal:
- Let queued role runs start in the background.
- Preserve durable queued -> running -> terminal provenance.
- Let users inspect and abort live background runs.
- Ensure background completion reloads latest state and never overwrites concurrent human edits or recovery.

Required commands:
- /comath dispatch-next --background
- /comath dispatch-run <run-id> --background
- /comath background-runs
- /comath abort-run <run-id>: <reason>

Required semantics:
- Background dispatch only works for queued runs.
- The same run id is reused.
- queued -> running is saved before invoking the role runner.
- Background command returns before the role runner resolves.
- Completion/failure/abort reloads latest state from disk before mutating.
- If latest run status is no longer running, late completion is skipped and does not overwrite recovery.
- abort-run only aborts live in-process background handles; stale durable running records still use recover-run.
- No fake reports/evidence/claims/warnings/artifacts for abort requests or cancelled work.
- Immediate /comath run and foreground dispatch behavior must remain unchanged.
- Proof-promotion and review-round invariants are unchanged.

Allowed files:
- packages/coding-agent/examples/extensions/co-math/schema.ts
- packages/coding-agent/examples/extensions/co-math/storage.ts
- packages/coding-agent/examples/extensions/co-math/commands.ts
- packages/coding-agent/examples/extensions/co-math/state-tool.ts
- packages/coding-agent/examples/extensions/co-math/README.md
- packages/coding-agent/test/co-math-state.test.ts
- packages/coding-agent/test/co-math-extension.test.ts

Do not touch role-runner.ts, agents/*.md, package.json, npm-shrinkwrap.json, or unrelated files. No commits.

TDD requirement:
- Add RED tests first for executionMode/background dispatch state.
- Add RED command tests for dispatch-next --background, dispatch-run --background, background-runs, abort-run, concurrent human note preservation, and late completion after recovery.
- Run targeted tests and report expected failures.
- Implement minimal GREEN changes.
- Re-run targeted tests.

Final verification:
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts

cd /Users/hanzhangyin/Developer/pi-mono-comath
npm run check
git diff --check
git status --short --untracked-files=all
git diff --name-only
```

---

## 12. Hermes review checklist

After Codex returns, Hermes should verify:

- background dispatch is explicit and only for queued runs;
- run id is reused;
- state is saved as running/background before roleRunner invocation;
- command returns before deferred roleRunner resolves;
- live handle map is cleaned after completion/failure/abort;
- background-runs reports live handles only;
- abort-run uses AbortController and records human provenance;
- stale durable running records are not misrepresented as live;
- completion reloads latest state before finalization;
- concurrent human notes/revisions/warning changes are not lost;
- late completion after recover-run does not overwrite recovered terminal status;
- immediate /comath run and foreground dispatch still pass;
- proof/review invariants are unchanged;
- no daemon/scheduler/retry/parallel fanout/new deps/provider changes;
- targeted tests, npm run check, and git diff --check pass.
