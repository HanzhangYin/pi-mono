# Co-Math Async Research Workstreams Implementation Plan

> **For Codex:** Implement this plan on `/home/hermes/developer/pi-mono-comath` from the current `comath/research-exploration-mode` branch. Do not commit or push unless explicitly asked. Stage only files you change if the user later asks for a commit.

**Goal:** Make co-math research workstreams asynchronous and inspectable while running: `continue path N` should start a durable background research run, return control to the user quickly, save incremental reports after each stage, and let `show progress` / `show latest report` work before completion.

**Architecture:** Extend the existing research path/report system with a durable research workstream run lifecycle. Reuse the existing model-backed specialist → critic → synthesizer implementation, but execute it as staged background work with state updates between stages. Keep deterministic fallback and existing validation mode intact.

**Tech Stack:** TypeScript, existing Pi co-math harness, existing co-math extension state/storage, existing `pi --mode json -p --no-session` model executor pattern, Vitest. No new npm dependencies unless absolutely necessary.

---

## Motivation

The current implementation has a good first vertical slice:

```text
Explore problem
→ create research paths
→ continue path N
→ run specialist → critic → synthesizer
→ save report
→ update working paper
```

But this is still essentially one synchronous research round. The Google AI co-mathematician paper in `docs/2605.06651v2.pdf` emphasizes a stronger architecture:

```text
project coordinator
→ approved goals
→ multiple workstreams
→ workstream coordinator per workstream
→ specialized subagents/tools
→ incremental reports while work is ongoing
→ fully reviewed final report
→ warnings when workstreams stall/fail
→ user can steer while work continues
```

The next milestone should implement that missing lifecycle layer, not add another isolated model call.

This milestone should make Pi feel less like:

```text
one prompt blocks until done
```

and more like:

```text
research work starts in the background; I can inspect, steer, and read incremental progress while it runs
```

---

## Expected End Result

From a clean folder:

```bash
cd /tmp
mkdir comath-async-workstream-demo
cd comath-async-workstream-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Explore this problem: Are there infinitely many twin primes?
```

Pi creates research paths as today.

User types:

```text
continue path 2
```

Expected: Pi returns quickly after starting a durable background workstream.

User-facing output should be something like:

```text
Research workstream started

Path 2: Direct proof attempt

Current status
- Coordinator framed the path.
- Specialist research is running in the background.

You can keep steering while it runs. Try: "show progress", "show latest report", or "summarize current state".
```

Then user can immediately type:

```text
show progress
```

Expected before completion:

```text
Research workstream running

Path 2: Direct proof attempt

Current stage
Specialist attempt

Latest incremental report
- Framed the direct proof route.
- Specialist is testing whether a sieve formulation can produce prime pairs at distance 2.
```

Then:

```text
show latest report
```

Expected while running:

```text
Latest research report is still running.

Path 2: Direct proof attempt

Incremental reports
- Coordinator brief: ...
- Specialist attempt: running or completed summary ...
```

When complete, Pi should surface a completion notice and save the final report:

```text
Research workstream completed

Path 2: Direct proof attempt

Promising strategy
...
Review
...
Gap
...
Next
...

Details
- Say "show latest report" to inspect the specialist attempt and critique.
```

Bad path handling should remain:

```text
continue path 99
```

Expected:

```text
I could not find a matching active research path to continue. Ask for a summary to see the current paths.
```

No extra report should be created.

---

## Non-Goals

Do not implement:

```text
- full autonomous multi-workstream scheduler
- true parallel execution of multiple research paths
- web/literature search
- theorem prover integration
- code execution research tools
- external queue service
- database migration framework
- a web UI
```

Do not remove:

```text
- proof-validation/source-audit mode
- deterministic research fallback
- existing `show latest report` behavior for completed reports
- existing tests
```

This milestone is about lifecycle and observability, not adding new mathematical capabilities.

---

## Current Context

Important current files:

```text
packages/coding-agent/src/main.ts
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
packages/coding-agent/src/modes/comath/comath-research-model-executor.ts
packages/coding-agent/src/modes/comath/comath-research-model-workstream.ts
packages/coding-agent/src/modes/comath/comath-research-workstream.ts
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/test/comath-harness.test.ts
packages/coding-agent/test/comath-progress.test.ts
packages/coding-agent/test/comath-research-model-workstream.test.ts
packages/coding-agent/test/comath-research-workstream.test.ts
packages/coding-agent/test/co-math-state.test.ts
```

Recent commit to build on:

```text
9725b2c7 feat(coding-agent): add model-backed co-math workstreams
```

Before editing, inspect current implementations. Do not guess types or helper names.

---

## Design Overview

Add a durable research workstream run lifecycle to co-math state.

Suggested state shape:

```ts
export type ResearchWorkstreamRunStatus = "queued" | "running" | "completed" | "blocked" | "failed";
export type ResearchWorkstreamRunStage = "coordinator" | "specialist" | "critic" | "synthesizer";

export interface ResearchWorkstreamRunRecord {
	id: string;
	pathId: string;
	pathTitle: string;
	status: ResearchWorkstreamRunStatus;
	currentStage: ResearchWorkstreamRunStage;
	startedAt: string;
	updatedAt: string;
	completedAt?: string;
	incrementalReports: ResearchWorkstreamIncrementalReportRecord[];
	finalReportId?: string;
	failureReason?: string;
	usedFallback?: boolean;
}

export interface ResearchWorkstreamIncrementalReportRecord {
	id: string;
	stage: ResearchWorkstreamRunStage;
	status: "running" | "completed" | "blocked" | "failed";
	title: string;
	summary: string;
	details: string[];
	createdAt: string;
}
```

The exact names can differ if existing conventions suggest better names.

Core lifecycle:

```text
continue path N
→ create run record status=queued/running, stage=coordinator
→ notify user quickly
→ execute stages in background
→ after each stage, save incremental report to state
→ on completion, persist final ResearchWorkstreamReport as today
→ mark run completed and link finalReportId
```

For this bounded milestone, one running research workstream at a time is acceptable. If another `continue path N` arrives while one is running, prefer a clear warning over queuing multiple jobs:

```text
A research workstream is already running on Path 2. Say "show progress" to inspect it, or wait for it to finish.
```

---

## Implementation Tasks

### Task 1: Inspect current synchronous path and state helpers

Objective: Understand exactly where `continue path N` currently runs synchronously and how reports are persisted.

Read:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-research-model-workstream.ts
packages/coding-agent/src/modes/comath/comath-research-workstream.ts
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
```

Find:

```text
- path steering parser
- runResearchWorkstreamForPath
- persistResearchWorkstreamReport
- addResearchWorkstreamReport
- latest report lookup helpers
- show progress / show latest report routing
```

Do not edit until this is clear.

### Task 2: Add state schema for research workstream runs

Modify:

```text
packages/coding-agent/examples/extensions/co-math/schema.ts
```

Add durable run and incremental report types.

Add field to project state:

```ts
researchWorkstreamRuns: ResearchWorkstreamRunRecord[];
```

Update default/migration behavior wherever state is initialized or normalized so old states load with:

```ts
researchWorkstreamRuns: []
```

### Task 3: Add storage helpers

Modify:

```text
packages/coding-agent/examples/extensions/co-math/storage.ts
```

Add helpers similar to existing report/path helpers:

```ts
export function addResearchWorkstreamRun(...): CoMathProjectState;
export function updateResearchWorkstreamRun(...): CoMathProjectState;
export function addResearchWorkstreamIncrementalReport(...): CoMathProjectState;
export function getLatestResearchWorkstreamRun(...): ResearchWorkstreamRunRecord | undefined;
export function getActiveResearchWorkstreamRun(...): ResearchWorkstreamRunRecord | undefined;
```

Requirements:

```text
- IDs deterministic and stable enough for tests, e.g. research-run-1, research-run-2.
- Updating a run must not mutate input state.
- Incremental reports append in order.
- Completed final report should link back via finalReportId.
```

### Task 4: Add state tests

Modify:

```text
packages/coding-agent/test/co-math-state.test.ts
```

Tests:

```text
1. default project state includes empty researchWorkstreamRuns.
2. old state without researchWorkstreamRuns normalizes to empty array.
3. addResearchWorkstreamRun creates `research-run-1`.
4. addResearchWorkstreamIncrementalReport appends stage reports in order.
5. updateResearchWorkstreamRun marks completed and links finalReportId.
6. getActiveResearchWorkstreamRun returns queued/running, not completed/failed.
```

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts
```

### Task 5: Split model-backed workstream into staged execution

Modify:

```text
packages/coding-agent/src/modes/comath/comath-research-model-workstream.ts
```

Current function likely runs all stages internally:

```ts
runModelBackedResearchWorkstream(...)
```

Keep it for existing tests/fallback if useful, but add a staged API that can report after each phase.

Suggested shape:

```ts
export interface ResearchWorkstreamStageResult {
	stage: ResearchWorkstreamRunStage;
	title: string;
	summary: string;
	details: string[];
	rawText?: string;
}

export interface ResearchWorkstreamStageCallbacks {
	onStageStarted?: (stage: ResearchWorkstreamRunStage, summary: string) => Promise<void> | void;
	onStageCompleted?: (result: ResearchWorkstreamStageResult) => Promise<void> | void;
}

export async function runModelBackedResearchWorkstreamStaged(
	input: RunModelBackedResearchWorkstreamInput,
	callbacks: ResearchWorkstreamStageCallbacks,
): Promise<ResearchWorkstreamReport>;
```

Stage sequence:

```text
coordinator: deterministic brief, immediately saved
specialist: model call, save attempt
critic: model call, save critique
synthesizer: model call, save synthesis and final report
```

For deterministic fallback, either:

```text
- create a staged wrapper around `runResearchWorkstream`, or
- save one fallback incremental report before final deterministic report
```

Prefer a staged deterministic wrapper if simple.

### Task 6: Add staged workstream tests

Modify:

```text
packages/coding-agent/test/comath-research-model-workstream.test.ts
```

Tests:

```text
1. staged runner calls callbacks in coordinator → specialist → critic → synthesizer order.
2. specialist incremental report contains model-backed specialist content.
3. critic incremental report contains critique content.
4. final report remains equivalent to current non-staged behavior.
5. callback failure should propagate or be handled deliberately; choose one and test it.
```

Prefer callback failure propagation so state-save failures do not silently produce inconsistent state.

Run:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/comath-research-model-workstream.test.ts
```

### Task 7: Add a background research workstream runner in the harness

Modify:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
```

Current `continue path N` likely awaits the whole workstream. Change it to:

```text
1. Check active research workstream run.
2. If active exists, notify user and do not start another.
3. Create a new run record in state.
4. Notify "Research workstream started" quickly.
5. Start async/background execution without blocking the prompt loop.
```

Important implementation note:

This is inside a long-running TUI process. You can use a tracked in-process promise for this milestone if safer than spawning a separate process, but the durable state must be the source of truth for user-facing progress.

Suggested class field:

```ts
private readonly activeResearchWorkstreams = new Map<string, Promise<void>>();
```

But do not rely only on memory. Always inspect state before user-facing status.

When background execution updates state, use existing `saveProjectState` and `loadProjectState` to avoid stale state overwrites.

On stage completion:

```text
- reload state
- append incremental report
- update run currentStage/status/updatedAt
- save state
- optionally notify user with a concise progress update
```

On final completion:

```text
- persist final ResearchWorkstreamReport using existing persistence helper
- update run status=completed, finalReportId=<new id>
- notify formatResearchWorkstreamCompleted
```

On failure:

```text
- if model-backed path failed and deterministic fallback is available, run fallback
- mark usedFallback=true
- save fallback incremental report
- final deterministic report is okay
```

If both fail:

```text
- status=failed
- failureReason product-safe message
- notify warning
```

### Task 8: Add progress/report formatting for active runs

Modify:

```text
packages/coding-agent/src/modes/comath/comath-progress.ts
```

Add formatters:

```ts
formatResearchWorkstreamRunStarted(...)
formatResearchWorkstreamRunProgress(...)
formatResearchWorkstreamRunStillRunningReport(...)
formatResearchWorkstreamRunFailed(...)
formatResearchWorkstreamAlreadyRunning(...)
```

User-facing copy must avoid backend terms unless asked.

Good normal-mode words:

```text
Research workstream
Path 2
Current stage
Latest incremental report
Running / completed / blocked
```

Avoid normal-mode debug words:

```text
promise
map
JSON
schema
record id
executor
subprocess
```

### Task 9: Route `show progress` and `show latest report` for active research runs

Modify:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
```

When `state.researchPaths.length > 0`:

```text
show progress
→ if active researchWorkstreamRun exists, show its current stage and latest incremental report
→ else show existing research summary/progress
```

For:

```text
show latest report
```

Behavior:

```text
- if latest run is active: show running/incremental report
- else if completed final research report exists: show existing latest report
- else: tell user no report exists yet
```

For:

```text
show details for path N
```

Behavior:

```text
- if that path has an active run: show active incremental details
- else show completed report/path details as today
```

### Task 10: Add harness tests for async behavior

Modify:

```text
packages/coding-agent/test/comath-harness.test.ts
```

Use fake controllable model executor. Do not call real provider APIs.

Suggested helper:

```ts
function createDeferredExecutor(): {
	executor: ResearchWorkstreamModelExecutor;
	resolveNext(text: string): void;
	rejectNext(error: Error): void;
	requests: ResearchWorkstreamModelRequest[];
}
```

Tests:

```text
1. `continue path 2` returns after start before specialist model promise resolves.
2. State contains active researchWorkstreamRun with status running.
3. `show progress` while specialist is pending shows running stage and coordinator brief.
4. Resolving specialist appends specialist incremental report.
5. Resolving critic and synthesizer completes final report and marks run completed.
6. `show latest report` while running shows incremental reports, not "no report".
7. A second `continue path 1` while Path 2 is active warns and does not start another run.
8. Model failure uses deterministic fallback and marks usedFallback.
9. Bad path number still warns and does not create a run.
```

Be careful with fake timers/promises. Keep tests deterministic and avoid real sleeps.

### Task 11: Add progress formatter tests

Modify:

```text
packages/coding-agent/test/comath-progress.test.ts
```

Tests:

```text
1. active run progress displays path title, current stage, latest incremental report.
2. running latest report displays partial reports and says still running.
3. failed run displays a product-safe warning.
4. formatter does not leak raw ids like `research-run-1` in normal output.
```

### Task 12: Update smoke docs

Modify:

```text
docs/comath-research-exploration-smoke.md
```

Add section:

```text
Async research workstream smoke
```

Manual steps:

```bash
cd /tmp
mkdir comath-async-workstream-demo
cd comath-async-workstream-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Explore this problem: Are there infinitely many twin primes?
continue path 2
show progress
show latest report
summarize current state
continue path 99
```

Good signs:

```text
- `continue path 2` starts work and returns quickly.
- `show progress` works before completion.
- `show latest report` shows incremental details while running or final details after completion.
- final report is saved.
- bad path number does not create a run/report.
```

---

## Validation Commands

Run focused tests:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run \
  test/comath-harness.test.ts \
  test/comath-progress.test.ts \
  test/comath-backend-output.test.ts \
  test/co-math-extension.test.ts \
  test/co-math-natural-language.test.ts \
  test/co-math-state.test.ts \
  test/comath-research-autoplan.test.ts \
  test/comath-research-execution.test.ts \
  test/comath-research-workstream.test.ts \
  test/comath-research-model-workstream.test.ts
```

Then:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

Do not run full `npm test` unless the user asks.

---

## Manual Smoke Test

Use a new directory. Do not use `rm -rf` cleanup patterns.

```bash
cd /tmp
mkdir comath-async-workstream-demo-1
cd comath-async-workstream-demo-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Explore this problem: Are there infinitely many twin primes?
continue path 2
show progress
show latest report
summarize current state
continue path 99
```

Good outcome:

```text
- `continue path 2` starts a background research workstream and returns control quickly.
- If the workstream is still running, `show progress` reports the current stage.
- `show latest report` shows incremental reports while running or final report after completion.
- Final report remains problem-specific and does not claim a proof of twin-prime infinitude.
- `continue path 99` warns and leaves report/run counts unchanged.
```

State inspection after smoke:

```bash
python3 -c 'import json, pathlib; p=pathlib.Path(".pi/co-math/state.json"); print("exists", p.exists());
if p.exists():
 s=json.loads(p.read_text()); print("paths", len(s.get("researchPaths", []))); print("runs", len(s.get("researchWorkstreamRuns", []))); print("researchReports", len(s.get("researchReports", []))); print("sections", len(s.get("workingPaperSections", [])));
 [print("run", r.get("id"), r.get("pathTitle"), r.get("status"), r.get("currentStage"), "incremental", len(r.get("incrementalReports", [])), "final", r.get("finalReportId")) for r in s.get("researchWorkstreamRuns", [])]
'
```

---

## Acceptance Criteria

Implementation is acceptable only if:

```text
1. `continue path N` creates a durable researchWorkstreamRun.
2. `continue path N` returns before all model-backed stages finish.
3. Incremental reports are saved after coordinator/specialist/critic/synthesizer stages.
4. `show progress` works while a research workstream is running.
5. `show latest report` works while a research workstream is running.
6. Completed run links to final durable research report.
7. Deterministic fallback still works and marks fallback usage.
8. Failed/blocked runs are preserved, not silently deleted.
9. Only one active research workstream is allowed for this milestone, with a clear warning.
10. Bad path numbers do not create runs or reports.
11. Proof-validation mode still passes existing tests.
12. No unit test calls a real model provider.
13. Focused co-math test command passes.
14. `npm run check` passes.
15. `git diff --check` passes.
16. Manual smoke confirms active-run progress/report behavior.
```

---

## Risks and Pitfalls

### Stale state overwrites

Background callbacks must reload latest state before saving updates. Do not hold one initial state object and overwrite later user notes/progress.

### Hidden synchronous blocking

If `continue path N` still waits for all three model calls before returning, this milestone failed.

### Dangling background promises

If the TUI exits, in-process background promises may die. That is acceptable for this bounded milestone if the run is marked failed/abandoned on next startup or at least does not corrupt state. Do not build an external job daemon yet.

### Duplicate runs

A second `continue path N` during an active run should warn, not create duplicate model calls.

### Raw ids in normal UX

Normal product copy should not show `research-run-1`, JSON fields, or internal executor names. Detailed debug output can include more if existing debug commands already do.

### Test flakiness

Do not use real sleeps in unit tests. Use deferred promises or fake executors.

---

## Suggested Codex Prompt

```text
Implement docs/codex-comath-async-research-workstreams-plan.md.

Use /home/hermes/developer/pi-mono-comath on the current comath/research-exploration-mode branch. Do not commit or push unless asked.

Goal: make co-math research workstreams asynchronous and inspectable while running. `continue path N` should start a durable background research workstream, return quickly, save incremental reports after coordinator/specialist/critic/synthesizer stages, and let `show progress` / `show latest report` work before completion. Keep deterministic fallback and proof-validation mode intact.

Use fake/deferred executors in tests; no unit test may call a real model provider. Avoid real sleeps. Run the focused co-math test command, `npm run check`, and `git diff --check`. Do a manual TUI smoke from a fresh temp folder. Report changed files, exact tests run, smoke result, whether the workstream actually returned before completion, and limitations. Do not commit.
```

---

## Final Report Requirements for Codex

When done, report:

```text
- files changed
- state fields/helpers added
- how background execution is implemented
- how stale state overwrites are avoided
- how incremental reports are saved
- how `show progress` behaves while running
- how `show latest report` behaves while running
- fallback behavior
- exact tests run and results
- npm run check result
- git diff --check result
- manual smoke result
- known limitations
- confirmation that no commit was made
```
