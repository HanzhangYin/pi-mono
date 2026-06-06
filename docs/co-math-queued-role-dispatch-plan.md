# Co-Math Queued Role Dispatch and Interruptible Workstreams Implementation Plan

> **For Hermes:** This is the next bounded phase after `docs/co-math-review-rounds-claim-revisions-plan.md` and `docs/co-math-review-rounds-correctness-fix-plan.md`. Use subagent-driven-development / Codex only after the current review-rounds implementation is committed. Hermes owns architecture alignment.

**Goal:** Add a persistent queued-dispatch layer so role runs can be scheduled, inspected, cancelled before execution, and dispatched later without losing provenance.

**Architecture:** This is the first async-oriented milestone, but it must remain deterministic and command-driven. Do not add a daemon, background process, scheduler, retry loop, or provider integration. Extend the existing role-run record control plane so queued work is durable before model invocation and can later be dispatched through the same ingestion path as `/comath run`.

**Tech Stack:** TypeScript, existing Pi coding-agent extension API, Vitest, existing `.pi/co-math/state.json` storage, no new dependencies.

---

## 0. Why this phase comes next

The co-math scaffold now has:

- persistent goals/workstreams/claims/evidence/warnings/reports;
- structured role output;
- event/artifact provenance;
- durable role run records;
- human steering and stale-run recovery;
- review rounds and claim revision history.

The next missing paper-aligned behavior is asynchronous workstream orchestration. The paper's assistant is not just a synchronous chatbot: it can keep multiple workstreams alive, let a coordinator schedule follow-up work, preserve stalled attempts, and let the human interrupt or redirect.

However, do **not** jump directly to background agents. The first async substrate should be a durable queue and explicit dispatcher:

```text
queue now -> inspect queue -> cancel/reprioritize -> dispatch later -> record lifecycle outcome
```

This gives us the control-plane semantics needed for real background execution later, while keeping this patch testable and safe.

---

## 1. Framework alignment constraints

Source of truth: `/Users/hanzhangyin/Developer/2605.06651v2.pdf`, especially:

- persistent shared workspace state;
- coordinator/workstream/reviewer role separation;
- asynchronous interactions and user steering;
- progressive disclosure from project state to run details;
- preservation of failed/stalled/partial attempts;
- caution against autonomous non-termination and over-eager agent loops.

Required commitments:

1. Queued work is durable provenance.
   - A queued role run must exist in state before any model invocation.
   - Cancelling queued work must leave an explicit event, not silently delete the record.

2. Dispatch is explicit.
   - No daemon.
   - No background process.
   - No automatic retry.
   - No hidden scheduler.
   - `/comath dispatch-next` or `/comath dispatch-run <run-id>` is the only execution path for queued work in this phase.

3. Model output does not control queue lifecycle.
   - The harness decides queued/running/completed/blocked/failed/aborted/cancelled.
   - The model may return blockers; blockers become `blocked`, not infrastructure failure.

4. Human interruption is first-class.
   - A user can cancel queued runs.
   - A user can inspect queued/running/stale work.
   - Recovery of running stale runs remains through the existing `/comath recover-run` command.

5. Existing invariants remain unchanged.
   - Proof promotion still requires attached proof evidence and no open attached warning.
   - Human notes and cancellation reasons are not proof evidence.
   - Review rounds remain provenance, not proof.

Unacceptable drift:

- background workers or long-lived processes;
- provider/model changes;
- new dependencies;
- autonomous multi-run loops;
- changing proof-promotion rules;
- deleting queued/cancelled run provenance;
- converting this into a generic task queue unrelated to co-math roles.

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

- background execution;
- daemon/scheduler/watchers;
- automatic retry;
- parallel dispatch;
- external queue storage;
- queue persistence outside `.pi/co-math/state.json`;
- model/provider config changes;
- new role JSON fields;
- living-paper rendering;
- LaTeX export;
- theorem prover integration;
- GitHub issue/PR automation;
- new dependencies.

This phase is a command-driven queue, not a production async runtime.

---

## 4. Data model target

### 4.1 Extend role-run statuses

In `schema.ts`, extend:

```ts
export type RoleRunStatus =
	| "queued"
	| "running"
	| "completed"
	| "blocked"
	| "failed"
	| "aborted"
	| "cancelled";
```

Semantics:

- `queued`: durable requested work that has not started model/tool invocation.
- `running`: dispatch has begun and model/tool invocation may be in progress.
- `completed`: role process succeeded with no blockers.
- `blocked`: role process succeeded but returned mathematical/project blockers.
- `failed`: infrastructure/tooling/process failure.
- `aborted`: dispatch was interrupted by user/session abort.
- `cancelled`: human cancelled queued work before dispatch.

### 4.2 Add queue timestamps/reason fields

Extend `RoleRunRecord` minimally:

```ts
queuedAt?: string;
startedAt?: string;
completedAt?: string;
cancelledAt?: string;
cancelReason?: string;
```

Current `startedAt` is required. To support queued-but-not-started runs honestly, make it optional.

Legacy normalization must preserve old records:

- if old record has `startedAt`, keep it;
- if old record lacks `queuedAt`, set `queuedAt` to `startedAt ?? updatedAt`;
- old non-queued records keep their previous status;
- no legacy record should become `queued` automatically.

### 4.3 Add queue-related event kinds

Extend `CoMathEventKind`:

```ts
| "role_run_queued"
| "role_run_cancelled"
| "role_run_dispatched"
```

Use existing `role_run_started` if it already expresses dispatch start. If both are too redundant, prefer:

- `role_run_queued` when created as queued;
- existing `role_run_started` when dispatch transitions queued -> running;
- `role_run_cancelled` when human cancels queued work.

Do not emit fake completion events for cancellation.

---

## 5. Storage helper target

Add helper functions in `storage.ts`.

### 5.1 `queueRoleRun`

Signature target:

```ts
export interface QueueRoleRunInput {
	id: string;
	role: CoMathRole;
	targetWorkstreamId?: string;
	targetClaimId?: string;
	task: string;
	now: string;
	actor: CoMathActor;
}

export function queueRoleRun(state: CoMathProjectState, input: QueueRoleRunInput): CoMathProjectState;
```

Behavior:

- appends a `RoleRunRecord` with `status: "queued"`;
- sets `queuedAt` and `updatedAt` to `now`;
- leaves `startedAt`, `completedAt`, `cancelledAt`, `reportId`, and created id arrays empty/undefined;
- links target workstream `latestRunIds` if `targetWorkstreamId` exists;
- emits `role_run_queued` event;
- if target workstream exists, consider setting it to `active` or leave status unchanged; do not mark it `running` until dispatch.

### 5.2 `dispatchQueuedRoleRun`

Signature target:

```ts
export interface DispatchQueuedRoleRunInput {
	runId: string;
	now: string;
	actor: CoMathActor;
}

export function dispatchQueuedRoleRun(state: CoMathProjectState, input: DispatchQueuedRoleRunInput): CoMathProjectState;
```

Behavior:

- only transitions `queued` -> `running`;
- throws for missing run;
- throws for statuses other than `queued`;
- sets `startedAt` and `updatedAt` to `now`;
- emits `role_run_started` or `role_run_dispatched` event;
- sets target workstream to `running` if target workstream exists.

### 5.3 `cancelQueuedRoleRun`

Signature target:

```ts
export interface CancelQueuedRoleRunInput {
	runId: string;
	reason: string;
	now: string;
	actor: CoMathActor;
}

export function cancelQueuedRoleRun(state: CoMathProjectState, input: CancelQueuedRoleRunInput): CoMathProjectState;
```

Behavior:

- only transitions `queued` -> `cancelled`;
- throws for missing run;
- throws for statuses other than `queued`;
- trims and requires non-empty reason;
- sets `cancelledAt`, `completedAt`, `updatedAt`, `cancelReason`;
- emits `role_run_cancelled` event;
- records a `human_intervention_recorded` event when actor is `human`, or use `recordHumanInterventionEvent` from command layer after cancellation.

Do not delete the run.

### 5.4 Existing helpers must remain strict

Update existing helpers if needed:

- `finishRoleRun` still accepts only `running` runs.
- `failRoleRun` still accepts only `running` runs.
- `recover-run` still closes only `running` runs.
- `cancel-run` closes only `queued` runs.

---

## 6. Command target

### 6.1 Add help entries

Add:

```text
/comath queue <coordinator|workstream|reviewer|synthesizer> [workstream-id|claim-id] - queue a bounded role run without executing it
/comath dispatch-next - dispatch the oldest queued role run
/comath dispatch-run <run-id> - dispatch a specific queued role run
/comath cancel-run <run-id>: <reason> - cancel a queued role run before dispatch
```

Keep `/comath run ...` as immediate execution.

### 6.2 Queue command

Command:

```text
/comath queue <role> [target-id]
```

Behavior:

1. Parse role and target using the same target rules as `/comath run`.
2. Load state.
3. Build the same role task text that `/comath run` would use.
4. Create `role-run-N` with `status: queued`.
5. Save state.
6. Notify:

```text
Queued co-math <role> as <run-id> for later dispatch.
```

No model invocation happens.

### 6.3 Dispatch-next command

Command:

```text
/comath dispatch-next
```

Behavior:

1. Load state.
2. Find oldest queued run by append order or `queuedAt`.
3. If none, show:

```text
No queued co-math role runs.
```

4. Transition the run to `running` using storage helper.
5. Save state before invoking role runner.
6. Invoke the role runner using the queued run's role, task, and targets.
7. Reuse the same ingestion path as `/comath run`.
8. Finish as `completed`/`blocked` or fail/abort exactly like immediate run.

### 6.4 Dispatch-run command

Command:

```text
/comath dispatch-run <run-id>
```

Behavior:

- same as dispatch-next, but dispatches the specified queued run;
- unknown run -> clear error;
- non-queued run -> clear error including current status.

### 6.5 Cancel-run command

Command:

```text
/comath cancel-run <run-id>: <reason>
```

Behavior:

- parse strictly; require colon and non-empty reason;
- only queued runs can be cancelled;
- unknown run -> clear error;
- non-queued run -> explain status and mention `/comath recover-run` for stale running runs;
- save cancellation provenance;
- do not create a report;
- do not create evidence/warnings/claims/artifacts.

### 6.6 Runs/status display

Update:

- `/comath runs` should include queued and cancelled runs.
- `/comath run-status <run-id>` should display queued/cancelled fields:
  - queuedAt;
  - startedAt or none;
  - cancelledAt;
  - cancelReason.
- `/comath status` should include `queued` and `cancelled` counts.

---

## 7. Audit target

Extend `/comath audit` without mutating state.

New checks:

- queued run with `startedAt` set should be reported as suspicious;
- non-queued non-cancelled terminal run with no `startedAt` should be reported;
- cancelled run without `cancelReason` should be reported;
- cancelled run with a report/created claim/evidence/warning/artifact ids should be reported as suspicious;
- queued run with report/created claim/evidence/warning/artifact ids should be reported;
- queued run target workstream/claim must exist;
- queued run for a target workstream should appear in that workstream's `latestRunIds`.

Do not auto-fix audit findings.

---

## 8. Tests

Use strict TDD. Add RED tests first.

### 8.1 Storage tests

Modify:

```text
packages/coding-agent/test/co-math-state.test.ts
```

Add tests:

1. `queueRoleRun records a queued run and queued event`
   - create state with workstream;
   - queue role run;
   - assert status `queued`;
   - assert `queuedAt` exists;
   - assert `startedAt` absent;
   - assert event `role_run_queued`;
   - assert workstream latestRunIds includes run id.

2. `dispatchQueuedRoleRun transitions only queued runs to running`
   - queued -> running succeeds;
   - startedAt set;
   - non-queued throws.

3. `cancelQueuedRoleRun cancels only queued runs and preserves reason`
   - queued -> cancelled succeeds;
   - cancelReason stored;
   - cancelledAt/completedAt set;
   - non-queued throws.

4. `legacy role runs normalize queuedAt without changing status`
   - old running/completed records load;
   - queuedAt filled;
   - no old record becomes queued.

### 8.2 Extension command tests

Modify:

```text
packages/coding-agent/test/co-math-extension.test.ts
```

Add tests:

1. `/comath queue` does not invoke role runner
   - use roleRunner spy that throws if called;
   - queue command should pass;
   - state contains queued run;
   - no report created.

2. `/comath dispatch-next` executes oldest queued run
   - queue two runs;
   - dispatch-next;
   - assert first run completed/blocked as appropriate;
   - second remains queued.

3. `/comath dispatch-run <run-id>` executes specified queued run
   - queue two runs;
   - dispatch second by id;
   - assert second no longer queued;
   - first remains queued.

4. `/comath cancel-run` cancels queued run and records provenance
   - queue run;
   - cancel with reason;
   - assert status cancelled;
   - no report;
   - role runner not invoked;
   - event `role_run_cancelled` and/or human intervention event present.

5. `/comath cancel-run` refuses running/completed runs
   - create immediate run or dispatch queued run;
   - attempt cancel;
   - assert status unchanged;
   - user-facing message explains current status.

6. `/comath run` still works as immediate execution
   - existing tests should continue to pass;
   - add a targeted assertion that immediate run creates `running` then terminal status, not queued.

7. `/comath status`, `/comath runs`, `/comath run-status` mention queued/cancelled fields.

8. Audit catches suspicious queued/cancelled references without mutating state.

### 8.3 README/state-tool tests

Existing documentation assertions should be extended to include:

```text
/comath queue
/comath dispatch-next
/comath dispatch-run
/comath cancel-run
queued
cancelled
```

---

## 9. Implementation notes

### 9.1 Avoid duplicating run ingestion

If `commands.ts` currently has one large immediate-run function, extract only the smallest shared helpers needed:

- parse role/target;
- build task;
- execute a prepared running run record;
- ingest result and finish/fail.

Do not broadly rewrite the command module.

A good local shape is:

```ts
interface PreparedRoleRun {
	run: RoleRunRecord;
	role: CoMathRole;
	task: string;
	targetWorkstream?: Workstream;
	targetClaim?: Claim;
}
```

Then both immediate `/comath run` and queued dispatch can call a shared internal execution helper.

### 9.2 Preserve run id stability

Queued run id should be the final run id. Do not create a second run id during dispatch.

Bad:

```text
queue role-run-3 -> dispatch creates role-run-4
```

Good:

```text
queue role-run-3 -> dispatch role-run-3 -> role-run-3 completed
```

### 9.3 Dispatch should save before invoking model

Critical invariant:

```text
queued -> running must be saved before roleRunner.run is called
```

This preserves crash/abort provenance.

### 9.4 Cancellation is not recovery

- `cancel-run`: queued only, before invocation.
- `recover-run`: stale running only, after a dispatch/start was interrupted.

Keep messages and tests clear.

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
- no role-runner or agent prompt changes.

---

## 11. Codex handoff prompt

```text
Implement docs/co-math-queued-role-dispatch-plan.md using strict TDD.

This is the first async-oriented co-math milestone, but keep it command-driven and deterministic. Do not add background workers, daemons, schedulers, automatic retries, new dependencies, provider/model changes, role JSON fields, or broad refactors.

Goal:
- Add durable queued role runs.
- Add explicit dispatch commands.
- Add cancellation for queued work.
- Reuse existing role-run ingestion and proof/review invariants.

Required commands:
- /comath queue <coordinator|workstream|reviewer|synthesizer> [workstream-id|claim-id]
- /comath dispatch-next
- /comath dispatch-run <run-id>
- /comath cancel-run <run-id>: <reason>

Required semantics:
- Queued runs are durable RoleRunRecord objects with status queued.
- Dispatch transitions the same run id queued -> running before invoking the role runner and saves state first.
- Dispatch finishes through the same completed/blocked/failed/aborted ingestion path as /comath run.
- Cancel only works for queued runs, never running/completed/blocked/failed/aborted runs.
- Cancellation preserves provenance and does not create reports/evidence/claims/warnings/artifacts.
- /comath run remains immediate execution and must keep working.
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
- Add RED tests first for storage queue/dispatch/cancel helpers.
- Add RED tests first for /comath queue, dispatch-next, dispatch-run, cancel-run.
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

- queued run records are durable before dispatch;
- queued run id is reused during dispatch;
- dispatch saves `running` state before role invocation;
- dispatch-next uses oldest queued run;
- dispatch-run targets a specific queued run;
- cancel-run only cancels queued runs and records reason;
- immediate `/comath run` behavior is unchanged;
- run lists/status/audit include queued/cancelled correctly;
- no fake reports/evidence are created for queued/cancelled runs;
- proof-promotion invariant is unchanged;
- review-round behavior from previous phase still passes;
- no async daemon/background/new deps/provider changes;
- targeted tests, `npm run check`, and `git diff --check` pass.
