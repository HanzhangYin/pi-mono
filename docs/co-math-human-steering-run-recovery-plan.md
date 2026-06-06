# Co-Math Human Steering and Run Recovery Implementation Plan

> **For Hermes:** This is the next bounded phase after `docs/co-math-workstream-lifecycle-run-records-plan.md`. Use subagent-driven-development for implementation. Hermes owns paper/framework alignment; Codex should implement only this plan.

**Goal:** Add explicit human steering and stale-run recovery controls on top of durable workstream lifecycle/run records, without introducing background/asynchronous execution yet.

**Architecture:** Keep the co-math extension synchronous and command-driven. Use existing workstream status, role run records, artifacts, and events as the control plane. Add small human-facing commands for marking blocked/unblocked workstreams, recording steering notes, and recovering stale `running` role runs left behind by crashes or aborted sessions.

**Tech Stack:** TypeScript, existing Pi coding-agent extension API, Vitest, existing `.pi/co-math/state.json` storage, no new dependencies.

---

## 0. Why this phase comes next

The paper architecture emphasizes that the user can steer the research process, interrupt unproductive workstreams, and help the coordinator recover from roadblocks. The previous phase added durable run records and lifecycle status, but the user still lacks first-class controls for:

- marking a workstream blocked with a human reason;
- unblocking a workstream after providing a mathematical hint or decision;
- recording a steering note without pretending it is proof evidence;
- recovering a stale `running` run if the process crashed after saving the started record;
- distinguishing aborted-run messages from failed-run messages.

This phase adds those controls while deliberately avoiding true async/background orchestration. It prepares the state model for async later by making human intervention explicit and auditable now.

---

## 1. Framework alignment constraints

Source of truth: `/Users/hanzhangyin/Developer/2605.06651v2.pdf`, especially:

- stateful workspace;
- asynchronous team as a future direction;
- user steering during evolving research;
- transparent surfacing of roadblocks;
- failed explorations preserved instead of silently restarted;
- native mathematical artifacts and uncertainty visibility.

Required commitments:

1. Human steering is provenance, not proof.
   - A steering note may create a `human_note` artifact or event.
   - It must not create proof evidence or promote claims.

2. Recovery is explicit.
   - A stale `running` run should not silently disappear.
   - The user should be able to mark it `failed` or `aborted` with a reason.

3. Workstream status changes need reasons.
   - Manual `blocked` should require a reason.
   - Manual `unblock` should record the user's reason before clearing `statusReason`.

4. Do not implement async yet.
   - No background workers, queues, schedulers, daemons, retries, or message bus.

Unacceptable drift:

- adding autonomous retries;
- treating a human note as mathematical proof evidence;
- auto-fixing stale runs during audit;
- changing provider/model behavior;
- adding dependencies;
- broad refactors of role execution.

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
```

Stop rule: if another file seems necessary, stop and explain why before editing.

---

## 3. Explicit non-goals

Do not implement:

- async/background execution;
- queue processing;
- retries;
- daemon/scheduler behavior;
- review-round records;
- new provider/model options;
- new dependencies;
- claim promotion changes;
- commits.

---

## 4. Data model target

### 4.1 Event kind

Add one event kind in `schema.ts`:

```ts
| "human_intervention_recorded"
```

Use this for manual steering notes, manual block/unblock decisions, and stale-run recovery reasons.

### 4.2 No new top-level record type yet

Do not add a `HumanInterventionRecord[]` array in this phase. Use existing:

- `events` for lightweight provenance;
- `artifacts` with kind `human_note` for longer user notes when useful.

This keeps the model small and avoids designing a full intervention-thread object before async work exists.

---

## 5. Storage helper target behavior

### 5.1 Harden role run transitions

Update `finishRoleRun` and `failRoleRun` in `storage.ts`:

- If the run id does not exist, continue to throw as today.
- If the run exists but `status !== "running"`, throw an error like:

```text
Cannot finish role run role-run-1 because it is completed.
```

or:

```text
Cannot fail role run role-run-1 because it is blocked.
```

Reason: helper-level lifecycle integrity prevents accidental double-finish/double-fail provenance.

### 5.2 Add `recordHumanInterventionEvent`

Suggested input:

```ts
export interface RecordHumanInterventionEventInput {
	summary: string;
	subjectId?: string;
	relatedIds?: string[];
	now: string;
	actor?: CoMathActor;
}
```

Behavior:

- append `human_intervention_recorded`;
- actor defaults to `human` when called by manual commands;
- do not mutate claims/evidence/warnings.

### 5.3 Optional helper: `recoverRunningRoleRun`

Either implement this as a thin wrapper around `failRoleRun`, or keep recovery command logic in `commands.ts`. If added, behavior should be:

- only allow `failed` or `aborted`;
- require the run to be currently `running`;
- call `failRoleRun`;
- record a human intervention event with the recovery reason.

Keep it small. Do not create reports.

---

## 6. User-facing command target behavior

Add help text entries:

```text
/comath block <workstream-id>: <reason> - manually mark a workstream blocked
/comath unblock <workstream-id>: <reason> - manually return a workstream to active with a steering note
/comath note <subject-id>: <note> - record a human steering note as a metadata artifact
/comath recover-run <run-id> <failed|aborted>: <reason> - close a stale running role run
```

### 6.1 `/comath block <workstream-id>: <reason>`

Behavior:

- require existing workstream;
- require non-empty reason after `:`;
- set workstream status to `blocked` with `statusReason` equal to reason;
- record `human_intervention_recorded` related to the workstream;
- show concise message.

Example output:

```text
Blocked workstream workstream-endpoints: Need a human choice of endpoint convention before continuing.
```

### 6.2 `/comath unblock <workstream-id>: <reason>`

Behavior:

- require existing workstream;
- require non-empty reason;
- set workstream status to `active` and clear `statusReason`;
- record `human_intervention_recorded` related to the workstream;
- do not alter claims/review queue;
- show concise message.

Example output:

```text
Unblocked workstream workstream-endpoints: Human supplied the endpoint convention.
```

### 6.3 `/comath note <subject-id>: <note>`

Behavior:

- `subject-id` can be a workstream id, claim id, role run id, or arbitrary string;
- create an artifact with kind `human_note`;
- link to matching workstream/claim/run where possible:
  - if subject is workstream id, `relatedWorkstreamIds: [subject]`;
  - if subject is claim id, `relatedClaimIds: [subject]`;
  - if subject is role run id, `relatedReportIds` should remain empty because run ids are not reports; include the run id in artifact provenance or event relatedIds;
- record `human_intervention_recorded`;
- do not create proof evidence.

Example output:

```text
Recorded human note artifact artifact-3 for workstream-endpoints.
```

### 6.4 `/comath recover-run <run-id> <failed|aborted>: <reason>`

Behavior:

- require existing role run;
- require role run status `running`;
- require status `failed` or `aborted`;
- require reason;
- call failure/recovery path so completedAt/errorMessage/status are set;
- set target workstream blocked when the stale run targets a workstream, as `failRoleRun` already does;
- record `human_intervention_recorded` related to run id and target id(s);
- do not create a report.

Example output:

```text
Recovered stale role run role-run-4 as failed: Terminal session crashed before completion.
```

If run is not running:

```text
Cannot recover role-run-2 because its status is completed.
```

### 6.5 Distinguish aborted notification text

Current `/comath run` failure notification may say `failed` for aborted runs. Update it so aborted runs say `aborted`.

Example:

```text
Co-math workstream role run role-run-1 aborted: Co-math role run was aborted.
```

---

## 7. Audit behavior

Keep existing audit stale-running warning. Do not auto-fix.

If a workstream is stale-running, optionally include a hint in the problem string:

```text
workstream-endpoints is running but has no running role run targeting it; use /comath recover-run if a run is stale
```

Do not make this hint brittle if existing tests already assert the shorter substring.

---

## 8. TDD tasks

### Task 1: Harden run lifecycle storage transitions

**Objective:** Prevent double-finish/double-fail helper misuse.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`
- Test: `packages/coding-agent/test/co-math-state.test.ts`

**RED tests:**

Add tests that:

- start and finish a run, then calling `finishRoleRun` again throws;
- start and finish a run, then calling `failRoleRun` throws;
- start and fail a run, then calling `finishRoleRun` throws.

Run:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts
```

Expected RED: helpers currently allow non-running transitions.

**GREEN implementation:**

- Add status guard inside `finishRoleRun` and `failRoleRun`.
- Keep missing-id behavior unchanged.

---

### Task 2: Add human intervention event helper

**Objective:** Provide a durable provenance primitive for manual steering.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/schema.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`
- Test: `packages/coding-agent/test/co-math-state.test.ts`

**RED tests:**

Add a test that `recordHumanInterventionEvent` appends an event with:

```text
kind: human_intervention_recorded
actor: human
summary
subjectId
relatedIds
```

Run state tests. Expected RED: event kind/helper missing.

**GREEN implementation:**

- Add event kind.
- Add helper.

---

### Task 3: Add `/comath block` and `/comath unblock`

**Objective:** Let the user manually steer workstream lifecycle with reasons.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**RED tests:**

Through slash-command fixture:

1. Initialize project and workstream.
2. Run `/comath block workstream-endpoints: Need a convention choice`.
3. Assert workstream status is `blocked`, statusReason is preserved, and human intervention event exists.
4. Run `/comath unblock workstream-endpoints: Chose predecessor-canonical convention`.
5. Assert status is `active`, statusReason is cleared, and another human intervention event exists.
6. Add usage tests for missing colon/reason and missing workstream.

Run extension tests. Expected RED: commands missing.

**GREEN implementation:**

- Add help entries.
- Add parsers for `<id>: <reason>`.
- Use `setWorkstreamStatus` and `recordHumanInterventionEvent`.

---

### Task 4: Add `/comath note`

**Objective:** Record human steering notes as metadata artifacts without creating proof evidence.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**RED tests:**

Add tests that:

- `/comath note workstream-endpoints: Try the endpoint convention from draft_3` creates `artifact-1` of kind `human_note`;
- artifact links to `relatedWorkstreamIds: ["workstream-endpoints"]` when subject matches a workstream;
- no `Evidence` record is created;
- human intervention event is recorded;
- `/comath artifacts` displays the note.

Expected RED: command missing.

**GREEN implementation:**

- Add command parser.
- Reuse `addArtifact` with kind `human_note`.
- Record intervention event.

---

### Task 5: Add `/comath recover-run`

**Objective:** Let user close stale running runs explicitly as failed or aborted.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**RED tests:**

Add tests that:

- create a started running run using a roleRunner that hangs/throws is not necessary; instead fixture state may be saved with a running run;
- `/comath recover-run role-run-1 failed: Terminal crashed` sets run status failed, errorMessage, completedAt, target workstream blocked, and records intervention event;
- `/comath recover-run role-run-1 aborted: User stopped stale run` sets aborted;
- recovering a completed run prints a clear refusal and does not mutate it;
- invalid status or missing reason prints usage.

Expected RED: command missing.

**GREEN implementation:**

- Add command parser for `<run-id> <failed|aborted>: <reason>`.
- Use `failRoleRun` plus human intervention event.

---

### Task 6: Add extension-level aborted run test and message fix

**Objective:** Cover command-level aborted behavior and distinguish user output.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**RED tests:**

Add a test with an aborted command context or roleRunner throwing `new Error("Co-math role run was aborted.")` and an already-aborted signal if fixture supports it. Assert:

- run status is `aborted`;
- no report is created;
- notification contains `aborted`, not `failed`.

Expected RED: message likely says failed.

**GREEN implementation:**

- Compute final failure status once in catch block.
- Use it both for `failRoleRun` and notification text.

---

### Task 7: Update audit/docs/state-tool

**Objective:** Document human steering and recovery controls.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`
- Modify: `packages/coding-agent/examples/extensions/co-math/state-tool.ts`
- Modify: `packages/coding-agent/test/co-math-extension.test.ts`

**RED tests:**

Add README/state-tool assertions for:

```text
/comath block
/comath unblock
/comath note
/comath recover-run
human intervention
stale running
not proof evidence
```

Expected RED: docs text missing.

**GREEN implementation:**

- Update README sample commands and feature summary.
- Update state-tool description.

---

### Task 8: Final verification

Run:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts

cd /Users/hanzhangyin/Developer/pi-mono-comath
npm run check
git diff --check
```

Expected:

- all targeted tests pass;
- full repo check passes;
- no diff whitespace errors.

Do not commit unless the user asks.

---

## 9. Codex handoff prompt

```text
Implement docs/co-math-human-steering-run-recovery-plan.md using strict TDD.

Scope:
- Harden role run lifecycle helpers so finish/fail only apply to running runs.
- Add human_intervention_recorded event support.
- Add /comath block, /comath unblock, /comath note, and /comath recover-run.
- Distinguish aborted run notification text from failed run text.
- Update audit/docs/state-tool tests.

Allowed files:
- packages/coding-agent/examples/extensions/co-math/schema.ts
- packages/coding-agent/examples/extensions/co-math/storage.ts
- packages/coding-agent/examples/extensions/co-math/commands.ts
- packages/coding-agent/examples/extensions/co-math/state-tool.ts
- packages/coding-agent/examples/extensions/co-math/README.md
- packages/coding-agent/test/co-math-state.test.ts
- packages/coding-agent/test/co-math-extension.test.ts

Do not modify role-runner.ts, agents/*.md, package files, lockfiles, or unrelated code. If you believe another file is required, stop and explain before editing.

Non-goals:
- no async/background execution;
- no queues/schedulers/daemons/retries;
- no provider/model changes;
- no new dependencies;
- no claim promotion changes;
- no commits.

TDD requirement:
For each task, write the failing test first, run it and report RED, implement minimal code, rerun and report GREEN.

Final verification to report exactly:
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts

cd /Users/hanzhangyin/Developer/pi-mono-comath
npm run check
git diff --check
```

---

## 10. Hermes review checklist

After Codex returns, Hermes should verify:

- changed files stay within allowed set;
- lifecycle helpers reject non-running finish/fail transitions;
- manual block/unblock records both status changes and human intervention events;
- notes create `human_note` artifacts and no proof evidence;
- recover-run only closes running runs and does not create reports;
- aborted command output says aborted;
- stale-running audit remains read-only;
- no async/background machinery was added;
- proof promotion invariant is unchanged;
- targeted tests and `npm run check` pass.
