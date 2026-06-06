# Co-Math Workstream Lifecycle and Role Run Records Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Hermes keeps architecture ownership; Codex should be used only as a bounded implementation worker.

**Goal:** Add durable workstream lifecycle state and first-class role run records so every `/comath run ...` leaves an auditable execution trace before we later add true asynchronous/background orchestration.

**Architecture:** Keep the current command-driven co-math prototype. Do not implement background agents, queues, schedulers, daemons, provider/model changes, or autonomous retries in this milestone. Add lifecycle fields to persistent state, add storage helpers for run start/finish/failure, update `/comath run` to save a running record before invoking the role runner, and expose run history through small read-only commands.

**Tech Stack:** TypeScript, existing Pi coding-agent extension API, Vitest, existing `.pi/co-math/state.json` storage, no new dependencies.

---

## 0. Framework alignment constraints

Source of truth: `/Users/hanzhangyin/Developer/2605.06651v2.pdf`, especially the co-math assistant architecture as an asynchronous, stateful mathematical workspace with a project coordinator, parallel workstreams, preserved failed hypotheses, explicit uncertainty, provenance, and human steering.

This milestone is a bridge toward that architecture. It should make the current synchronous command path record the control-plane objects that future asynchronous orchestration will need.

Required conceptual commitments:

1. A role run is not just a report.
   - It is a durable execution record with status, target, timestamps, inputs, outputs, blockers, and failures.

2. The harness decides run lifecycle status.
   - The model may report blockers.
   - The model may not directly declare that a run is durably `completed`, `failed`, or `aborted`.

3. Distinguish mathematical/project obstruction from infrastructure failure.
   - `blocked`: role process returned valid structured output but reported blockers.
   - `failed`: role process threw, exited unsuccessfully, or otherwise could not produce a valid role result.
   - `aborted`: command signal interrupted the role run.

4. Preserve partial provenance.
   - A run record must be saved before invoking the role runner.
   - If a role process fails, the failed run must remain in state.
   - If a workstream run blocks, the blockers should be preserved in both the report and the run record.

5. Keep proof discipline unchanged.
   - Do not weaken the existing invariant: a claim cannot become `proved` without proof evidence and with any attached open warning.

Unacceptable drift:

- implementing actual background/asynchronous execution in this milestone;
- adding scheduler/queue semantics beyond durable status fields;
- allowing role output to mutate run status directly;
- treating model blockers as process failures;
- broad refactors of the extension or provider invocation;
- new dependencies.

---

## 1. Allowed files

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
```

Rationale: this phase should not change model output schema or prompt behavior. The system can derive lifecycle status from existing `RoleRunResult.blockers` and caught exceptions.

Stop rule: if Codex believes another file must change, stop and explain why before editing.

---

## 2. Explicit non-goals

Do not implement:

- asynchronous/background command execution;
- task queues;
- cron/scheduler behavior;
- retry loops;
- message bus;
- long-running agent daemon;
- review-round records;
- provider/model selection changes;
- changes to `pi` invocation behavior;
- new dependencies;
- commits.

Do not add a `runStatus` field to structured role JSON. Run status is a harness-level fact.

---

## 3. Data model target

### 3.1 Workstream lifecycle

In `schema.ts`, add:

```ts
export type WorkstreamStatus = "active" | "running" | "blocked" | "needs_review";
```

Extend `Workstream`:

```ts
export interface Workstream {
	id: string;
	title: string;
	status: WorkstreamStatus;
	statusReason?: string;
	goalIds: string[];
	claimIds: string[];
	latestReportIds: string[];
	latestRunIds: string[];
	createdAt: string;
	updatedAt: string;
}
```

Status meanings:

```text
active       normal usable workstream
running      a role run targeting this workstream is currently in progress
blocked      latest workstream run returned blockers or failed before producing a usable result
needs_review workstream produced one or more claims that need reviewer validation
```

Do not add `completed` or `abandoned` yet. Those need human-facing lifecycle commands and are out of scope.

### 3.2 Role run records

In `schema.ts`, add:

```ts
export type RoleRunStatus = "running" | "completed" | "blocked" | "failed" | "aborted";
export type CoMathRole = "coordinator" | "workstream" | "reviewer" | "synthesizer";

export interface RoleRunRecord {
	id: string;
	role: CoMathRole;
	status: RoleRunStatus;
	targetWorkstreamId?: string;
	targetClaimId?: string;
	task: string;
	reportId?: string;
	createdClaimIds: string[];
	createdEvidenceIds: string[];
	createdWarningIds: string[];
	createdArtifactIds: string[];
	blockerMessages: string[];
	errorMessage?: string;
	startedAt: string;
	completedAt?: string;
	updatedAt: string;
}
```

Then extend `CoMathProjectState`:

```ts
roleRuns: RoleRunRecord[];
```

Important: `CoMathRole` currently lives in `role-runner.ts`. To avoid import cycles and make role runs part of persistent schema, move or duplicate the type carefully:

Preferred path:

1. Define `CoMathRole` in `schema.ts`.
2. In `role-runner.ts`, import it as a type from `schema.ts` and remove the local exported union.
3. This is the only acceptable `role-runner.ts` change if needed. If the implementation can avoid touching `role-runner.ts`, do so.

If Codex chooses to change `role-runner.ts` only for this type move, it must also run the role-runner tests.

### 3.3 New event kinds

Extend `CoMathEventKind`:

```ts
| "role_run_started"
| "role_run_completed"
| "role_run_blocked"
| "role_run_failed"
| "role_run_aborted"
| "workstream_status_changed"
```

---

## 4. Storage helper target behavior

Add focused helpers in `storage.ts`.

### 4.1 `startRoleRun`

Suggested input:

```ts
export interface StartRoleRunInput {
	id: string;
	role: CoMathRole;
	task: string;
	targetWorkstreamId?: string;
	targetClaimId?: string;
	now: string;
	actor?: CoMathActor;
}
```

Behavior:

- append a `RoleRunRecord` with `status: "running"`;
- emit `role_run_started`;
- if `targetWorkstreamId` is present:
  - append the run id to that workstream's `latestRunIds`;
  - set workstream status to `running`;
  - clear `statusReason`;
  - emit `workstream_status_changed`.

Do not create a report here.

### 4.2 `finishRoleRun`

Suggested input:

```ts
export interface FinishRoleRunInput {
	runId: string;
	status: "completed" | "blocked";
	reportId?: string;
	createdClaimIds?: string[];
	createdEvidenceIds?: string[];
	createdWarningIds?: string[];
	createdArtifactIds?: string[];
	blockerMessages?: string[];
	now: string;
	actor?: CoMathActor;
}
```

Behavior:

- update the matching run from `running` to `completed` or `blocked`;
- set `reportId`, created id arrays, blocker messages, `completedAt`, and `updatedAt`;
- emit `role_run_completed` or `role_run_blocked`;
- if the run targets a workstream:
  - `blocked` -> workstream `blocked`, statusReason from first blocker or generic message;
  - `completed` with created claims -> workstream `needs_review`;
  - `completed` without created claims -> workstream `active`.

If the run id does not exist, throw. Do not silently create fake provenance.

### 4.3 `failRoleRun`

Suggested input:

```ts
export interface FailRoleRunInput {
	runId: string;
	status: "failed" | "aborted";
	errorMessage: string;
	now: string;
	actor?: CoMathActor;
}
```

Behavior:

- update matching run from `running` to `failed` or `aborted`;
- set `errorMessage`, `completedAt`, and `updatedAt`;
- emit `role_run_failed` or `role_run_aborted`;
- if the run targets a workstream:
  - set workstream status to `blocked`;
  - set `statusReason` to the error message.

If run id is missing, throw.

### 4.4 `setWorkstreamStatus`

Use this internally to avoid duplicating event logic.

Suggested input:

```ts
export interface SetWorkstreamStatusInput {
	workstreamId: string;
	status: WorkstreamStatus;
	statusReason?: string;
	now: string;
	actor?: CoMathActor;
}
```

Behavior:

- if status and reason are unchanged, return state unchanged;
- otherwise update status/reason/timestamp and emit `workstream_status_changed`.

---

## 5. Capturing created ids during ingestion

Current `ingestRoleRunResult` returns only the next state. It should return both state and created ids so `finishRoleRun` can link outputs to the run.

Change locally inside `commands.ts`:

```ts
interface IngestRoleRunOutput {
	state: CoMathProjectState;
	createdClaimIds: string[];
	createdEvidenceIds: string[];
	createdWarningIds: string[];
	createdArtifactIds: string[];
}
```

Then make `ingestRoleRunResult` return `IngestRoleRunOutput`.

Rules:

- Record ids only for records created by this ingestion.
- Existing warnings resolved by reviewer are not "createdWarningIds".
- Existing claims status-changed by reviewer are not "createdClaimIds".
- Artifacts from `proposedArtifacts` are `createdArtifactIds`.
- Report id is linked separately through `reportId`.

Keep this as a local command ingestion concern. Do not add run ids to every claim/evidence/warning/artifact object yet.

---

## 6. `/comath run` lifecycle flow

Modify `runProjectRole` in `commands.ts`.

Target flow:

```text
1. Parse request and validate target as today.
2. Build task string once.
3. Allocate run id: role-run-${existing.roleRuns.length + 1}.
4. Call startRoleRun(...).
5. Save state immediately.
6. Invoke roleRunner using the task string.
7. On success:
   a. reload latest started state or keep started state in memory;
   b. allocate report id from current reports length;
   c. ingest role result;
   d. decide final run status:
      - blocked if result.blockers exists and length > 0;
      - completed otherwise.
   e. call finishRoleRun with created ids and blocker messages;
   f. save final state;
   g. show user message.
8. On thrown error:
   a. mark run failed or aborted;
   b. save final state;
   c. show user a concise failure message;
   d. do not create a report.
```

Aborted detection:

- If `ctx.signal.aborted` is true or the error message matches the existing abort error (`Co-math role run was aborted.`), use `aborted`.
- Otherwise use `failed`.

Important: if the role process returns valid output with malformed structured JSON fallback, that is still a successful process run. The parser already produces report-only output with blockers. The run should be `blocked` if blockers are present, not `failed`.

---

## 7. User-facing commands

Add to help text:

```text
/comath runs - list recent role run records
/comath run-status <run-id> - show one role run record
```

### 7.1 `/comath runs`

Output recent runs, newest last or newest first. Prefer newest first for quick inspection.

Example:

```text
Co-math role runs
- role-run-3 [blocked] workstream workstream-endpoints -> report-3
  blockers: Need more small-n data before conjecture is stable.
- role-run-2 [completed] reviewer claim-1 -> report-2
- role-run-1 [completed] workstream workstream-endpoints -> report-1
```

If none:

```text
Co-math role runs
No role runs recorded.
```

### 7.2 `/comath run-status <run-id>`

Example:

```text
role-run-3
Role: workstream
Status: blocked
Target workstream: workstream-endpoints
Report: report-3
Created claims: claim-2, claim-3
Created evidence: evidence-4
Created warnings: none
Created artifacts: artifact-2
Blockers:
- Need more small-n data before conjecture is stable.
Started: 2026-...
Completed: 2026-...
```

Unknown id:

```text
No role run found for role-run-missing.
```

### 7.3 `/comath status`

Add compact counts:

```text
Workstream statuses:
- active: N
- running: N
- blocked: N
- needs_review: N
Role runs:
- running: N
- completed: N
- blocked: N
- failed: N
- aborted: N
```

Keep existing status lines.

---

## 8. Audit additions

Extend `collectAuditProblems` in `commands.ts`.

Add checks:

- each `roleRun.targetWorkstreamId`, if present, points to an existing workstream;
- each `roleRun.targetClaimId`, if present, points to an existing claim;
- each `roleRun.reportId`, if present, points to an existing report;
- every `createdClaimIds` entry exists;
- every `createdEvidenceIds` entry exists;
- every `createdWarningIds` entry exists;
- every `createdArtifactIds` entry exists;
- every `workstream.latestRunIds` entry points to an existing role run;
- any workstream with `status: "running"` but no running role run targeting it is reported as a possible stale running status.

Do not auto-fix audit findings.

---

## 9. Documentation updates

Update `README.md`:

- mention workstream lifecycle statuses;
- mention durable role run records;
- add sample commands:

```text
/comath runs
/comath run-status role-run-1
```

Clarify:

- run records are control-plane provenance, not mathematical proof certificates;
- `blocked` is a useful mathematical/project obstruction, not infrastructure failure;
- true asynchronous/background work is not implemented yet.

Update `state-tool.ts` prompt text to mention `roleRuns` and workstream `status`/`latestRunIds`.

---

## 10. TDD tasks

Each implementation task should follow strict RED-GREEN-REFACTOR. Run the named targeted test first and confirm it fails for the expected missing behavior before writing production code.

### Task 1: Add schema fields and legacy normalization tests

**Objective:** Make workstream lifecycle and role run arrays part of durable state while keeping old state files loadable.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/schema.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`
- Test: `packages/coding-agent/test/co-math-state.test.ts`

**RED tests:**

Add tests that expect:

- `createEmptyProjectState(...).roleRuns` equals `[]`;
- newly added workstreams have `status: "active"`, no `statusReason`, and `latestRunIds: []`;
- legacy state lacking `roleRuns`, `workstream.status`, and `workstream.latestRunIds` loads with safe defaults.

Run:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts
```

Expected RED: tests fail because `roleRuns`, `Workstream.status`, or `latestRunIds` do not exist yet.

**GREEN implementation:**

- Add `WorkstreamStatus`, `RoleRunStatus`, `RoleRunRecord`, and possibly schema-level `CoMathRole`.
- Extend `CoMathProjectState` with `roleRuns`.
- Extend `createEmptyProjectState` and `addWorkstream`.
- Extend legacy normalization for old states and old workstreams.

**GREEN verification:**

Run the same command. Expected: state tests pass.

---

### Task 2: Add storage helpers for workstream status and role run lifecycle

**Objective:** Provide small durable mutation helpers for run start, finish, failure, and workstream status changes.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`
- Test: `packages/coding-agent/test/co-math-state.test.ts`

**RED tests:**

Add tests for:

1. `startRoleRun` appends a running run, emits `role_run_started`, sets target workstream to `running`, and appends `latestRunIds`.
2. `finishRoleRun` with `completed` links report/created ids, emits `role_run_completed`, and sets workstream to `needs_review` when created claims are present.
3. `finishRoleRun` with `blocked` records blockers, emits `role_run_blocked`, and sets workstream to `blocked` with a reason.
4. `failRoleRun` with `failed` records error, emits `role_run_failed`, and sets target workstream to `blocked`.
5. `failRoleRun` with `aborted` emits `role_run_aborted`.
6. Missing run id throws; no fake provenance is created.

Run:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts
```

Expected RED: helper exports do not exist.

**GREEN implementation:**

- Add `setWorkstreamStatus`, `startRoleRun`, `finishRoleRun`, `failRoleRun`.
- Add event kinds and event summaries.
- Keep helper behavior minimal; no command parsing in storage.

**GREEN verification:**

Run the same command. Expected: state tests pass.

---

### Task 3: Wire `/comath run` to save started and completed/blocked/failed records

**Objective:** Ensure every role invocation leaves a run record, including thrown failures.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**RED tests:**

Add extension tests through public slash-command handlers:

1. Successful workstream run creates `role-run-1` with `status: "completed"`, `reportId: "report-1"`, target workstream id, and linked `latestRunIds`.
2. Workstream run that returns `blockers: [...]` creates `status: "blocked"`, keeps blocker messages, creates a report, and sets workstream `blocked`.
3. Workstream run that proposes a claim creates `createdClaimIds: ["claim-1"]` and sets workstream `needs_review`.
4. Reviewer run creates a run record targeting the claim and links its report.
5. Role runner throwing creates a `failed` run record, does not create a report, and sets target workstream `blocked` when applicable.

Run:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts
```

Expected RED: run records are missing.

**GREEN implementation:**

- Build the role task once before invoking `roleRunner`.
- Allocate run id before invocation.
- Save state after `startRoleRun` and before `roleRunner`.
- Change `ingestRoleRunResult` to return created ids along with state.
- On success, call `finishRoleRun` with `completed` or `blocked` depending on blockers.
- On error, call `failRoleRun` with `failed` or `aborted` and save.

**GREEN verification:**

Run the same command. Expected: extension tests pass.

---

### Task 4: Add `/comath runs`, `/comath run-status`, and status summaries

**Objective:** Expose role run records and lifecycle counts to the user without changing mutation behavior.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**RED tests:**

Add tests that:

- run one or two role commands;
- call `/comath runs` and expect `Co-math role runs`, run id, role, status, target, and report id;
- call `/comath run-status role-run-1` and expect linked created ids/blockers/timestamps;
- call `/comath run-status role-run-missing` and expect a clear not-found message;
- call `/comath status` and expect workstream status and role run status counts.

Run:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts
```

Expected RED: commands/output are missing.

**GREEN implementation:**

- Extend help text.
- Add `runs` and `run-status` subcommands.
- Add format helpers for counts and details.
- Keep output concise and terminal-friendly.

**GREEN verification:**

Run the same command. Expected: extension tests pass.

---

### Task 5: Extend audit for run/workstream references

**Objective:** Make broken run references visible without auto-fixing state.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts` or `packages/coding-agent/test/co-math-state.test.ts`

**RED tests:**

Add a test state with intentionally broken references:

- role run points to missing workstream;
- role run points to missing report;
- role run lists missing created artifact;
- workstream latestRunIds points to missing run;
- workstream is `running` but no running role run targets it.

Call `/comath audit` and expect each problem to appear.

Run:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts
```

Expected RED: audit does not yet report these problems.

**GREEN implementation:**

- Extend `collectAuditProblems` with the checks from section 8.
- Do not mutate state during audit.

**GREEN verification:**

Run the same command. Expected: extension tests pass.

---

### Task 6: Update README and state tool documentation

**Objective:** Document the new lifecycle/run-record surface and model-visible state shape.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`
- Modify: `packages/coding-agent/examples/extensions/co-math/state-tool.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**RED tests:**

Add documentation assertions that README contains:

```text
/comath runs
/comath run-status
workstream lifecycle
role run records
blocked
not asynchronous
```

Add state-tool assertions for:

```text
roleRuns
latestRunIds
status
```

Run:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts
```

Expected RED: docs text missing.

**GREEN implementation:**

- Update README manual usage and feature summary.
- Update state-tool prompt text.

**GREEN verification:**

Run the same command. Expected: extension tests pass.

---

### Task 7: Final verification

**Objective:** Verify the milestone without relying on Codex's self-report.

Run targeted tests:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts
```

Expected:

```text
Test Files  3 passed
Tests       all passed
```

Run full repo check:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath
npm run check
```

Expected:

```text
biome check passes
pinned deps pass
TS imports pass
shrinkwrap up to date
tsgo --noEmit passes
browser smoke passes
```

Run git hygiene:

```bash
git diff --check
```

Expected: no output.

Do not commit unless the user explicitly asks.

---

## 11. Codex handoff prompt

Use this as the bounded implementation prompt after this plan is committed or otherwise accepted:

```text
Implement docs/co-math-workstream-lifecycle-run-records-plan.md using strict TDD.

Scope:
- Add durable workstream lifecycle status and RoleRunRecord state.
- Every /comath run must save a running role run record before invoking the role runner.
- Successful role processes must finish the run as completed or blocked based on blockers.
- Thrown/aborted role processes must leave failed/aborted run records and preserve workstream blocked status when applicable.
- Add /comath runs and /comath run-status <run-id>.
- Extend status, audit, README, and state-tool docs.

Allowed files:
- packages/coding-agent/examples/extensions/co-math/schema.ts
- packages/coding-agent/examples/extensions/co-math/storage.ts
- packages/coding-agent/examples/extensions/co-math/commands.ts
- packages/coding-agent/examples/extensions/co-math/state-tool.ts
- packages/coding-agent/examples/extensions/co-math/README.md
- packages/coding-agent/test/co-math-state.test.ts
- packages/coding-agent/test/co-math-extension.test.ts

Do not change role-runner.ts or agents/*.md unless the schema-level CoMathRole type move truly requires a minimal type-only role-runner.ts edit. If you need any other file, stop and explain before editing.

Non-goals:
- no background/asynchronous execution;
- no queues/schedulers/daemons/retries;
- no model/provider changes;
- no new dependencies;
- no commits.

TDD requirement:
For each task, write the failing test first, run it and report the RED failure, then implement the minimal code, then rerun and report GREEN output.

Final verification to report exactly:
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts

cd /Users/hanzhangyin/Developer/pi-mono-comath
npm run check
git diff --check
```

---

## 12. Hermes review checklist after Codex returns

Before accepting the implementation, Hermes should inspect:

```bash
git diff -- packages/coding-agent/examples/extensions/co-math/schema.ts

git diff -- packages/coding-agent/examples/extensions/co-math/storage.ts

git diff -- packages/coding-agent/examples/extensions/co-math/commands.ts

git diff -- packages/coding-agent/test/co-math-state.test.ts

git diff -- packages/coding-agent/test/co-math-extension.test.ts
```

Check specifically:

- `RoleRunRecord` exists and is normalized for legacy state.
- Workstreams have `status` and `latestRunIds`.
- `/comath run` saves `running` state before invoking `roleRunner`.
- Successful blocker output becomes `blocked`, not `failed`.
- Thrown role errors become `failed`/`aborted` and do not create fake reports.
- Created ids are linked to the run record.
- Proof promotion invariant is unchanged.
- Audit catches broken run references.
- No async/background machinery was added.
- No new dependencies were added.
- Tests and `npm run check` pass from real tool output.

If the diff passes review, commit as a separate milestone:

```bash
git add \
  docs/co-math-workstream-lifecycle-run-records-plan.md \
  packages/coding-agent/examples/extensions/co-math \
  packages/coding-agent/test/co-math-state.test.ts \
  packages/coding-agent/test/co-math-extension.test.ts

git commit -m "feat(coding-agent): add co-math workstream lifecycle records"
```
