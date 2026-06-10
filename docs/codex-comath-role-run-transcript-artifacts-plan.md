# Co-Math Role-Run Transcript Artifacts Implementation Plan

> **For Codex:** Implement this plan with strict TDD. Keep the scope narrow. Do not add interactive chat, autonomous multi-agent orchestration, broad schema migrations, or mathematical proof behavior changes.

**Goal:** Save a replayable raw transcript artifact for every co-math role run so users can inspect exactly what nested Pi/model output produced a report, claim, artifact, blocker, or structured-JSON parse failure.

**Architecture:** `executeRunningRoleRun(...)` should allocate a transcript path under the project state directory before invoking the role runner. The default Pi role runner should write raw JSON-mode stdout/stderr/process metadata to that transcript file while still parsing the final assistant message exactly as today. After completion or failure, foreground feedback and run-status/report-status should show the transcript path.

**Tech Stack:** TypeScript, Node filesystem APIs, existing co-math extension under `packages/coding-agent/examples/extensions/co-math`, Vitest tests under `packages/coding-agent/test`.

---

## Current context

Recent milestones already completed:

1. `/comath run ...` now shows visible foreground progress and completion guidance.
2. Role output parser now normalizes safe enum aliases and includes structured parse diagnostics.

The next milestone should improve auditability:

```text
For every role run, persist the raw nested Pi/model transcript so users can inspect what actually happened.
```

This is useful even when structured JSON parsing succeeds. It is especially useful when parsing fails or when a mathematical result needs provenance review.

## Non-goals

Do not implement:

- `/comath chat` or interactive role sessions.
- A transcript viewer TUI.
- Full replay of model calls.
- New proof states.
- Broad state schema migration.
- New npm dependencies.
- Real provider/model API calls in tests.

## Desired UX

After a foreground run starts:

```text
Started co-math role run role-run-4.
Role: workstream
Target: workstream-q3-support-gap
State saved: .pi/co-math/state.json
Transcript: .pi/co-math/transcripts/role-run-4.jsonl
Nested Pi execution started. This may take a while.
```

While running, existing heartbeat behavior remains unchanged.

After completion:

```text
Co-math role run role-run-4 blocked.
Saved report: report-4
Transcript: .pi/co-math/transcripts/role-run-4.jsonl
...
Inspect:
/comath run-status role-run-4
/comath report-status report-4
/comath next
```

`/comath run-status role-run-4` should include:

```text
Transcript: .pi/co-math/transcripts/role-run-4.jsonl
```

If the role process fails before producing a report, failure guidance should still include the transcript path when available.

## Transcript format

Use JSON Lines, one JSON object per line.

Path:

```text
.pi/co-math/transcripts/<role-run-id>.jsonl
```

Each line should be a small event object.

Recommended event shapes:

```ts
interface TranscriptStartedEvent {
  type: "started";
  timestamp: string;
  role: CoMathRole;
  cwd: string;
  command: string;
  args: string[];
}

interface TranscriptStdoutEvent {
  type: "stdout";
  timestamp: string;
  line: string;
}

interface TranscriptStderrEvent {
  type: "stderr";
  timestamp: string;
  text: string;
}

interface TranscriptFinalAssistantTextEvent {
  type: "final_assistant_text";
  timestamp: string;
  text: string;
}

interface TranscriptClosedEvent {
  type: "closed";
  timestamp: string;
  exitCode: number;
  aborted: boolean;
}
```

Keep the transcript raw enough to debug JSON-mode output. Do not try to normalize or redact in this milestone.

Use relative transcript paths in user-facing messages and persisted state when possible:

```text
.pi/co-math/transcripts/role-run-4.jsonl
```

Use absolute paths only internally if needed.

## State model

Add a minimal optional field to role runs if not already present:

```ts
transcriptPath?: string;
```

Persist it in `state.json` as a relative path.

Do not create a new transcript collection. Do not create an artifact automatically unless an existing artifact system already has a natural, simple hook. The role run record plus visible path is enough for this milestone.

## Files likely to change

```text
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/examples/extensions/co-math/role-runner.ts
packages/coding-agent/examples/extensions/co-math/commands.ts
packages/coding-agent/test/co-math-role-runner.test.ts
packages/coding-agent/test/co-math-extension.test.ts
```

Optional docs update if there is existing co-math README/help coverage:

```text
packages/coding-agent/examples/extensions/co-math/README.md
```

Do not touch unrelated packages.

---

## Task 1: Add transcript path to role-run state

**Objective:** Persist the transcript path with each role run.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/schema.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`
- Test: `packages/coding-agent/test/co-math-state.test.ts` if state normalization tests are needed

**Implementation guidance:**

Find the `RoleRun` interface in `schema.ts` and add:

```ts
transcriptPath?: string;
```

Then update state normalization in `storage.ts` so legacy role runs without `transcriptPath` still load.

Use the existing optional string normalization style in `storage.ts`. If no helper exists, keep it local and conservative:

```ts
const transcriptPath = parseOptionalString(record.transcriptPath);
```

If the codebase uses direct object normalization instead, follow the existing style.

**Test:**

Add or update a normalization test only if there is existing coverage for optional role-run fields. Do not overbuild.

Expected behavior:

- old state without `transcriptPath` loads;
- new state with `transcriptPath` preserves it.

## Task 2: Extend role-runner input with optional transcript path

**Objective:** Allow the command layer to tell the role runner where to write raw transcript events.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/role-runner.ts`
- Test: `packages/coding-agent/test/co-math-role-runner.test.ts`

**Implementation guidance:**

Extend `RoleRunInput`:

```ts
export interface RoleRunInput {
  cwd: string;
  role: CoMathRole;
  task: string;
  signal?: AbortSignal;
  transcriptPath?: string;
}
```

Add a small transcript writer helper in `role-runner.ts`.

Suggested shape:

```ts
interface TranscriptWriter {
  write(value: Record<string, unknown>): void;
  close(): Promise<void>;
}

function createTranscriptWriter(transcriptPath: string | undefined): TranscriptWriter {
  if (!transcriptPath) return { write: () => {}, close: async () => {} };
  // create parent dir, append JSON lines, close stream
}
```

Use top-level imports only. No inline imports.

Important:

- Create parent directories with `mkdir(..., { recursive: true })` or sync equivalent before writing.
- Do not let transcript-writing failure crash a role run unless writing the initial file fails before the model process starts. Prefer fail-fast on setup error, but avoid throwing from async stream callbacks after the child process has started.
- Keep implementation simple.

## Task 3: Write transcript events from `runPiRole`

**Objective:** Capture nested Pi JSON-mode output and process metadata.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/role-runner.ts`
- Test: `packages/coding-agent/test/co-math-role-runner.test.ts`

**Implementation guidance:**

In `runPiRole(...)`, after computing `invocation`, create the writer:

```ts
const transcript = await createTranscriptWriter(input.transcriptPath);
```

Because `runPiRole` is already async, this can be awaited before spawning.

Write a started event before spawn or immediately after spawn:

```ts
transcript.write({
  type: "started",
  timestamp: new Date().toISOString(),
  role: input.role,
  cwd: input.cwd,
  command: invocation.command,
  args: invocation.args,
});
```

When stdout lines arrive, write each complete line before or after parsing:

```ts
transcript.write({ type: "stdout", timestamp: new Date().toISOString(), line });
```

When stderr chunks arrive:

```ts
transcript.write({ type: "stderr", timestamp: new Date().toISOString(), text: data.toString() });
```

When `finalSummary` is updated:

```ts
transcript.write({ type: "final_assistant_text", timestamp: new Date().toISOString(), text });
```

On close:

```ts
transcript.write({ type: "closed", timestamp: new Date().toISOString(), exitCode: code ?? 0, aborted: wasAborted });
await transcript.close();
```

Be careful with the Promise flow. Ensure the transcript is closed before `runPiRole` returns or throws.

A simple approach is:

- declare `let closeTranscript: (() => Promise<void>) | undefined`;
- close in a `finally` block around the role process result handling;
- avoid double-closing.

## Task 4: Add role-runner tests with a fake Pi script

**Objective:** Verify a transcript file is written without invoking a real model.

**Files:**

- Modify: `packages/coding-agent/test/co-math-role-runner.test.ts`

**Test approach:**

There are already tests around `getPiInvocation` and `parseRoleRunOutput`. Add a new test for `createDefaultRoleRunner` or `runPiRole` only if exported. If `runPiRole` is not exported, prefer testing through `createDefaultRoleRunner` with a controlled script path if the existing harness supports it.

If direct testing is awkward, export a minimal helper only if necessary. Avoid exporting internals just for convenience unless current tests already do that pattern.

Recommended fake stdout content should mimic Pi JSON mode:

```json
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"{\"summary\":\"ok\",\"blockers\":[\"still blocked\"]}"}]}}
```

Assertions:

- result summary is `ok`;
- transcript file exists;
- transcript contains a `started` event;
- transcript contains a `stdout` event with the raw JSON line;
- transcript contains a `final_assistant_text` event;
- transcript contains a `closed` event.

Command:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-role-runner.test.ts
```

Expected: pass.

## Task 5: Allocate transcript path in the command layer

**Objective:** Every real `/comath run ...` role run should get a deterministic transcript path.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**Implementation guidance:**

Find where a role run transitions to `running` and invokes the role runner. This is likely near `executeRunningRoleRun(...)`.

When the role run id is known, compute:

```ts
const transcriptPath = `.pi/co-math/transcripts/${roleRun.id}.jsonl`;
```

or, if a helper exists for state-relative paths, use that helper.

Persist it on the role-run record before invoking the role runner.

Pass the absolute or cwd-relative path to the role runner:

```ts
await roleRunner({
  cwd,
  role: roleRun.role,
  task,
  signal,
  transcriptPath: join(cwd, transcriptPath),
});
```

Use whatever cwd/state-path conventions the extension currently uses. The persisted value should be relative and user-facing.

Important:

- The transcript path should exist for completed, blocked, failed, and aborted runs whenever the role process was attempted.
- If a run is queued but not started, no transcript path is needed.
- Preserve existing background/foreground behavior.

## Task 6: Show transcript path in foreground start/completion/failure messages

**Objective:** Users should discover the transcript path without inspecting `state.json`.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**Expected start feedback:**

```text
Transcript: .pi/co-math/transcripts/role-run-1.jsonl
```

Include this near the existing `State saved:` line.

**Expected completion feedback:**

Include the same transcript line after report id or near inspect commands.

**Expected failure feedback:**

If `transcriptPath` exists, include it in failed run output too.

Do not remove existing progress/heartbeat lines.

## Task 7: Show transcript path in `/comath run-status`

**Objective:** Users can find transcript paths later.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

Find the run-status formatting function and add:

```text
Transcript: <path>
```

only when present.

Keep output concise.

## Task 8: Add extension-level tests for transcript persistence and display

**Objective:** Prove `/comath run ...` records and displays transcript paths.

**Files:**

- Modify: `packages/coding-agent/test/co-math-extension.test.ts`

Add tests using the existing fake role runner fixture.

Test 1: foreground start/completion output includes transcript path.

Expected notifications contain:

```text
Transcript: .pi/co-math/transcripts/role-run-1.jsonl
```

Test 2: state role run includes transcript path.

```ts
expect(state?.roleRuns[0]?.transcriptPath).toBe(".pi/co-math/transcripts/role-run-1.jsonl");
```

Test 3: `/comath run-status role-run-1` includes transcript path.

Optional Test 4: failed role runner still leaves transcript path on the role run and failure output displays it. This can use a fake role runner that throws.

## Task 9: Optional manual smoke test

**Objective:** Verify real nested Pi/model transcript creation.

Only run this if the user wants a real-model smoke test. Do not run it silently in CI-style validation.

From a scratch directory:

```bash
mkdir -p /tmp/comath-transcript-smoke
cd /tmp/comath-transcript-smoke

/home/hermes/developer/pi-mono-comath/pi-test.sh \
  -e /home/hermes/developer/pi-mono-comath/packages/coding-agent/examples/extensions/co-math/index.ts \
  --approve
```

Inside Pi:

```text
/comath init Transcript smoke test
/comath goal Produce one short role report.
/comath workstream transcript-smoke: Return one short structured report with one blocker.
/comath run workstream workstream-transcript-smoke
/comath run-status role-run-1
```

Then from shell:

```bash
cd /tmp/comath-transcript-smoke
python3 - <<'PY'
from pathlib import Path
p = Path('.pi/co-math/transcripts/role-run-1.jsonl')
print(p.exists(), p.stat().st_size if p.exists() else 0)
print('\n'.join(p.read_text().splitlines()[:5]) if p.exists() else '')
PY
```

Expected:

- transcript path printed in Pi output;
- file exists;
- file contains JSONL events including `started`, `stdout`, and `closed`.

## Validation commands

Run from `packages/coding-agent`:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-role-runner.test.ts
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts
```

Then from repo root:

```bash
npm run check
git diff --check
```

Do not run full `npm test`.
Do not run `npm run build` unless explicitly requested.

## Acceptance criteria

Implementation is accepted when:

- Every started role run has a persisted `transcriptPath` on its role-run record.
- The default Pi role runner writes a JSONL transcript for real nested runs.
- Transcript JSONL includes at least `started`, raw `stdout`, raw `stderr` when present, `final_assistant_text` when present, and `closed` events.
- Foreground start/completion/failure messages show the transcript path.
- `/comath run-status <run-id>` shows the transcript path.
- Existing progress heartbeat behavior is unchanged.
- Existing structured JSON parsing behavior is unchanged.
- Targeted co-math tests pass.
- `npm run check` passes.
- `git diff --check` passes.

## Risks and mitigations

### Risk: transcript writer failure breaks role runs

Mitigation: fail early if the transcript file cannot be opened before spawn. Once opened, avoid throwing from async callbacks. Close in `finally`.

### Risk: path confusion between repo cwd and scratch cwd

Mitigation: persist relative paths for display, pass absolute paths to filesystem writer, and cover this with extension tests using temp dirs.

### Risk: huge transcript files

Mitigation: this milestone stores raw JSONL without rotation. That is acceptable for now because role runs are bounded. Do not add rotation or compression yet.

### Risk: sensitive model output persisted locally

Mitigation: transcript files live under the project’s `.pi/co-math/` scratch state, same trust boundary as `state.json`. Do not upload or expose them.

## Suggested Codex prompt

```text
Implement docs/codex-comath-role-run-transcript-artifacts-plan.md.

Keep scope narrow: save JSONL transcript files for co-math role runs and surface their paths in run feedback/status. Do not add interactive chat, transcript viewer UI, new schema collections, provider calls in tests, or broad mathematical behavior changes.

Use strict TDD:
1. Add optional transcriptPath to role-run state and normalization.
2. Extend RoleRunInput with transcriptPath.
3. Write JSONL transcript events from the default Pi role runner.
4. Allocate .pi/co-math/transcripts/<role-run-id>.jsonl in the command layer.
5. Show transcript path in start/completion/failure feedback and /comath run-status.
6. Add targeted role-runner and extension tests.
7. Run targeted co-math tests, npm run check, and git diff --check.

Preserve the Stage 1 role-run progress UX and the structured JSON alias/parsing behavior. Do not commit unless explicitly asked.
```
