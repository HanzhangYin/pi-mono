# Co-Math Computational Exploration Workstreams Implementation Plan

> **For Codex:** Implement this plan on `/home/hermes/developer/pi-mono-comath` from the current `comath/research-exploration-mode` branch. Do not commit or push unless explicitly asked. Stage only files you change if the user later asks for a commit.

**Goal:** Add a bounded, tool-backed computational exploration workstream for co-math research paths, focused first on `Small examples and counterexamples` paths, with executable scripts, result artifacts, critic-reviewed limitations, and working-paper updates.

**Architecture:** Build on the current async research workstream lifecycle. Literature paths already produce source/provenance-backed reports; this milestone adds the analogous computational evidence layer: plan a finite experiment, generate a small script, execute it through a fakeable/safe executor, persist script/stdout/result artifacts in state, critique the limits of the finite computation, and attach those artifacts to the final research report. Keep source-backed literature workstreams, model-backed research workstreams, deterministic fallback, stale-run recovery, and proof-validation mode intact.

**Tech Stack:** TypeScript, existing Pi co-math harness/state/storage/progress modules, existing async research run lifecycle, existing model executor pattern, Node/Bun runtime constraints, Vitest. Prefer no new npm dependencies. Unit tests must use fake model/computation executors; no unit test should run expensive computation or call real providers.

---

## Motivation

The current co-math implementation has reached these paper-aligned layers:

```text
Explore problem
→ create research paths
→ async model-backed workstream
→ incremental reports
→ source-backed literature workstream with structured provenance
```

The next layer in `docs/2605.06651v2.pdf` is computational exploration. The paper describes workstreams that design a computational framework, dispatch coding agents, implement code/tests/demonstrations, attach outputs to reports, and surface limitations. This plan implements a bounded local vertical slice of that idea.

Why this matters:

```text
- Literature workstreams provide provenance over external references.
- Computational workstreams provide provenance over generated evidence.
- Both are needed before cross-workstream synthesis can feel like a real mathematical workbench.
```

This milestone should not try to build a general-purpose autonomous coding agent or a cloud search daemon. It should make one beginner-visible workflow work well:

```text
Path 1: Small examples and counterexamples
→ finite computation
→ saved script/result artifacts
→ critic says what the computation can and cannot prove
```

---

## Expected End Result

From a clean folder:

```bash
cd /tmp
mkdir comath-computation-workstream-demo
cd comath-computation-workstream-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
```

Pi creates research paths as today.

User types:

```text
continue path 1
```

Because Path 1 is `Small examples and counterexamples`, Pi starts an async computational exploration workstream.

Expected early output:

```text
Research workstream started

Path 1: Small examples and counterexamples

Current status
- Coordinator is choosing a bounded finite experiment.
- Computational specialist is preparing a small script.
- Critic will check what the computation does and does not establish.

You can keep steering while it runs. Try: "show progress", "show latest report", or "summarize current state".
```

Then:

```text
show progress
```

Expected while running:

```text
Research workstream running

Path 1: Small examples and counterexamples

Current stage
Computation

Latest incremental report
- A finite search is being run for n^2 + 1 values.
- The result will be treated as evidence, not a proof of infinitude.
```

Expected final summary:

```text
Research workstream completed

Path 1: Small examples and counterexamples

Computation
- Script: computation-artifact-1
- Result: computation-artifact-2
- Checked range: n <= 10000
- Exit code: 0

Findings
- Several n values in the checked range produce primes of the form n^2 + 1.
- Even n are the only possible n > 1, since odd n gives an even value greater than 2.

Limitations
- A finite search does not prove infinitude.
- The checked range is only evidence for pattern-finding.

Next
Use the parity observation to refine the direct-proof or literature path.

Working paper updated
- Added computational notes under "Examples and finite checks."

Details
- Say "show latest report" to inspect the computation, result, and critique.
```

`show latest report` should show attached computational artifacts and the critic’s limitations:

```text
Latest research report

Path 1: Small examples and counterexamples

Coordinator brief
...

Computation
- Script: .pi/co-math/artifacts/computation-1/search.py
- Command: python3 .pi/co-math/artifacts/computation-1/search.py
- Exit code: 0

Result summary
- ...

Critic review
- The finite computation does not prove an infinite claim.
- The primality test is deterministic for the checked range.

Attachments
- computation-artifact-1: script
- computation-artifact-2: stdout
```

---

## Non-Goals

Do not implement:

```text
- arbitrary user-supplied shell execution
- cloud or parallel search infrastructure
- long-running daemon scheduling
- package installation or dependency management
- theorem-prover integration
- a general coding-agent workbench
- computational workstreams for every path type
- automatic web search or literature lookup in this workstream
```

For this milestone, only route clearly computational/example paths, primarily:

```text
Small examples and counterexamples
finite check
computation
search
examples
counterexamples
```

Do not regress:

```text
- literature/source-backed Path 5 behavior
- normal model-backed paths 2-4
- async lifecycle and stale-run recovery
- source/provenance state normalization
- proof-validation/source-audit mode
```

---

## Current Context

Recent commits to build on:

```text
9725b2c7 feat(coding-agent): add model-backed co-math workstreams
bc8aa817 feat(coding-agent): run co-math research asynchronously
acaa6494 feat(coding-agent): add source-backed co-math literature workstreams
```

Important current files:

```text
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
packages/coding-agent/src/modes/comath/comath-research-workstream.ts
packages/coding-agent/src/modes/comath/comath-research-model-workstream.ts
packages/coding-agent/src/modes/comath/comath-literature-source.ts
packages/coding-agent/src/modes/comath/comath-literature-workstream.ts
packages/coding-agent/test/co-math-state.test.ts
packages/coding-agent/test/comath-harness.test.ts
packages/coding-agent/test/comath-progress.test.ts
packages/coding-agent/test/comath-literature-workstream.test.ts
packages/coding-agent/test/comath-research-model-workstream.test.ts
```

Before editing, inspect current code. Do not guess helper names.

---

## Design Overview

Add three bounded pieces:

```text
1. Structured computational artifacts in co-math state.
2. A fakeable computation executor with a safe local default.
3. Computational-path routing and staged workstream execution.
```

### State: computational artifacts

Extend state with structured artifacts rather than prose-only results.

Suggested types:

```ts
export type ComputationalArtifactKind = "script" | "stdout" | "stderr" | "table" | "summary";
export type ComputationalArtifactStatus = "created" | "completed" | "failed" | "blocked";

export interface ComputationalArtifact {
	id: string;
	pathId: string;
	reportId?: string;
	runId?: string;
	kind: ComputationalArtifactKind;
	status: ComputationalArtifactStatus;
	title: string;
	filePath?: string;
	command?: string;
	exitCode?: number;
	summary: string;
	createdAt: string;
	updatedAt: string;
}
```

Add to project state:

```ts
computationalArtifacts: ComputationalArtifact[];
```

Extend research reports with optional artifact links:

```ts
computationalArtifactIds: string[];
```

If existing artifact infrastructure is already suitable, reuse it only if it supports structured path/report/run links, command, exitCode, filePath, summary, and kind. Do not store computation evidence only in `workingPaperSummary` prose.

### Executor interface

Create a fakeable executor. Suggested file:

```text
packages/coding-agent/src/modes/comath/comath-computation-executor.ts
```

Suggested types:

```ts
export interface ComputationalExperimentRequest {
	rootQuestion: string;
	pathTitle: string;
	pathObjective: string;
	workingDirectory: string;
	maxRuntimeMs: number;
}

export interface ComputationalScriptDraft {
	fileName: string;
	language: "python" | "typescript";
	content: string;
	summary: string;
}

export interface ComputationalExecutionResult {
	command: string;
	exitCode: number;
	stdout: string;
	stderr: string;
	durationMs: number;
}

export interface ComputationalExecutor {
	runScript(draft: ComputationalScriptDraft, request: ComputationalExperimentRequest): Promise<ComputationalExecutionResult>;
}
```

Default execution should be conservative:

```text
- write scripts only under `.pi/co-math/artifacts/<run-id>/`
- use `python3` for Python scripts
- enforce a short timeout, e.g. 10-30 seconds
- cap stdout/stderr persisted in state/report summaries
- no network
- no package installation
- no shell interpolation of untrusted text
```

Implementation detail:

```text
Prefer Node child_process spawn/execFile, not shell strings, if the repo already uses Node APIs for this. If direct process execution is awkward in current code, make the production default a safe blocked executor for this milestone and use fake executors in tests, but the manual smoke should ideally execute a real small local script.
```

### Computational workstream stages

Create:

```text
packages/coding-agent/src/modes/comath/comath-computation-workstream.ts
```

Stage sequence:

```text
coordinator: choose a bounded finite experiment
specialist: draft a small script and explain expected output
computation: execute the script and collect stdout/stderr
critic: critique the computation, safety, and mathematical limitations
synthesizer: produce final report and working-paper update
```

Add `"computation"` to the research workstream stage type if needed.

---

## Implementation Tasks

### Task 1: Inspect current state/report/run schema

Objective: Understand current state shape before adding computational artifacts.

Read:

```text
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
```

Search for:

```text
literatureSources
literatureClaimSupports
sourceIds
claimSupportIds
researchWorkstreamRuns
incrementalReports
```

Use the same normalization/storage patterns for computational artifacts.

### Task 2: Add computational artifact schema

Modify:

```text
packages/coding-agent/examples/extensions/co-math/schema.ts
```

Add computational artifact types and state field:

```ts
computationalArtifacts: ComputationalArtifact[];
```

Add optional report links:

```ts
computationalArtifactIds: string[];
```

Extend stage type if needed:

```ts
export type ResearchWorkstreamRunStage = ResearchWorkstreamRole | "literature-search" | "computation";
```

Requirements:

```text
- old states normalize with computationalArtifacts: []
- existing reports normalize with computationalArtifactIds: []
- type names match existing style
```

### Task 3: Add storage helpers

Modify:

```text
packages/coding-agent/examples/extensions/co-math/storage.ts
```

Add helpers like:

```ts
export function addComputationalArtifact(...): CoMathProjectState;
export function updateComputationalArtifact(...): CoMathProjectState;
export function getComputationalArtifactsForReport(...): ComputationalArtifact[];
export function getComputationalArtifactsForRun(...): ComputationalArtifact[];
```

Requirements:

```text
- no input-state mutation
- stable ids like `computation-artifact-1`
- event records with product-safe summaries
- filePath must remain under `.pi/co-math/artifacts/` if present
- stdout/stderr summaries should be capped before storing in artifact summary
```

Do not store huge raw outputs directly in state. Save raw stdout/stderr to artifact files and store concise summaries/paths in state.

### Task 4: Add state/storage tests

Modify:

```text
packages/coding-agent/test/co-math-state.test.ts
```

Tests:

```text
1. empty state includes computationalArtifacts: []
2. legacy state normalizes missing computationalArtifacts
3. addComputationalArtifact creates stable id and event
4. report can link computationalArtifactIds
5. getComputationalArtifactsForReport returns linked artifacts
6. artifact filePath outside `.pi/co-math/artifacts/` is rejected or normalized safely if such validation is implemented
```

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts
```

### Task 5: Add fakeable computation executor

Create:

```text
packages/coding-agent/src/modes/comath/comath-computation-executor.ts
```

Implement:

```text
- ComputationalExecutor interface
- ComputationalScriptDraft type
- ComputationalExecutionResult type
- createDefaultComputationalExecutor(...)
```

Default executor requirements:

```text
- create artifact directory under the current project workspace: `.pi/co-math/artifacts/<run-id>/`
- write script file with a safe fixed filename from the draft
- run `python3` via execFile/spawn for Python scripts
- reject unsupported languages for now
- time out after a bounded runtime
- return exitCode/stdout/stderr/duration
- never run package managers
- never use shell expansion for the command
```

If using Node child process APIs, inspect existing project conventions first. Keep imports top-level; no inline imports.

### Task 6: Add computation workstream

Create:

```text
packages/coding-agent/src/modes/comath/comath-computation-workstream.ts
```

Inputs:

```ts
export interface RunComputationResearchWorkstreamInput {
	rootQuestion: string;
	path: ResearchPath;
	allPaths: readonly ResearchPath[];
	now: string;
	executor: ResearchWorkstreamModelExecutor;
	computationalExecutor: ComputationalExecutor;
	artifactDirectory: string;
}
```

Output:

```ts
export interface ComputationResearchWorkstreamResult {
	report: ResearchWorkstreamReport;
	artifacts: ComputationalArtifactDraft[];
}
```

Use staged callbacks like existing literature/model workstreams.

Stage behavior:

```text
1. Coordinator prompt: choose one safe finite experiment.
2. Specialist prompt: draft a Python script and expected result shape.
3. Computation stage: run the script via ComputationalExecutor.
4. Critic prompt: review stdout/stderr and limitations.
5. Synthesizer prompt: produce final report with findings/gaps/next move.
```

For this milestone, allow a deterministic script-builder for known simple finite-check patterns if needed, but do not hardcode only one problem. A good fallback is a generic bounded script that records that no safe domain-specific computation was generated.

Prompt requirements:

```text
- finite computation is evidence, not proof of an infinite statement
- include checked bound/range explicitly
- separate observations from theorem claims
- mention runtime/exitCode if relevant
- if script failed, preserve failure and ask for human help
```

### Task 7: Make script drafting robust and bounded

The model may produce markdown fences. Add parser helpers to extract a Python script safely.

Requirements:

```text
- accept a single ```python fenced block
- reject multiple code blocks or unsupported language unless deterministic fallback exists
- reject scripts containing obvious unsafe operations:
  - import os
  - import subprocess
  - open(... outside normal stdout-only scripts if easy to detect
  - requests/http/network imports
  - pip/npm/package-manager strings
- cap script length
- if rejected, produce a blocked report or deterministic safe script, not a crash
```

Do not overbuild a full sandbox. The safety contract for this milestone is bounded local scripts with obvious-danger rejection and short timeout.

### Task 8: Route computational/example paths to computation workstream

Modify:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
```

Add constructor option:

```ts
computationalExecutor?: ComputationalExecutor;
```

Route selected path:

```text
if isLiteratureResearchPath(path): literature workstream
else if isComputationalResearchPath(path): computation workstream
else: normal research workstream
```

Detection should use title/objective terms, not only path number:

```text
small examples
counterexamples
finite check
computation
computational
search
examples
```

Path 1 generated by exploration should route to computation.

### Task 9: Persist computation artifacts and link reports

Modify harness completion flow.

On computation workstream completion:

```text
1. save script artifact metadata
2. save stdout/stderr/result artifact metadata
3. persist final report with computationalArtifactIds
4. mark run completed/blocked/failed and finalReportId
5. update working paper with computational summary
6. notify the user with computation summary and limitations
```

Raw files should live under:

```text
.pi/co-math/artifacts/<run-id>/
```

State should include relative or project-local file paths, not absolute temp-only implementation paths, unless existing state conventions prefer absolute paths.

### Task 10: Add progress/report formatting

Modify:

```text
packages/coding-agent/src/modes/comath/comath-progress.ts
```

Add sections when computational artifacts exist:

```text
Computation
- Script: <artifact label/path>
- Result: <artifact label/path>
- Exit code: 0

Attachments
- computation-artifact-1: script — .pi/co-math/artifacts/...
- computation-artifact-2: stdout — .pi/co-math/artifacts/...
```

Requirements:

```text
- normal output must not dump raw stdout if long
- show latest report can show concise stdout excerpts
- failed computations should show error/exit code and preserve artifact links
- avoid raw internal run ids in normal copy where possible
```

### Task 11: Add computation-workstream tests

Create:

```text
packages/coding-agent/test/comath-computation-workstream.test.ts
```

Use fake model executor and fake computation executor.

Tests:

```text
1. finite experiment stage calls specialist then computation then critic then synthesizer.
2. script fenced block is extracted and passed to computation executor.
3. unsafe script is rejected or blocked with a clear reason.
4. stdout/exitCode are passed into critic/synthesizer prompts.
5. final report includes limitations saying finite search does not prove infinitude.
6. failed script result becomes blocked/failed report rather than crash.
```

No real provider calls.

### Task 12: Add harness tests

Modify:

```text
packages/coding-agent/test/comath-harness.test.ts
```

Tests:

```text
1. `continue path 1` routes to computation workstream.
2. `continue path 5` still routes to literature workstream.
3. non-computational/non-literature path still routes to normal model workstream.
4. show progress while computation is running shows computation stage.
5. final state has computationalArtifacts and report.computationalArtifactIds.
6. failed computation preserves a failed artifact and visible blocker.
7. duplicate active-run blocking still works.
8. stale-run recovery still works for computation workstreams.
```

Use deferred fake executor to test running-state progress.

### Task 13: Add progress formatter tests

Modify:

```text
packages/coding-agent/test/comath-progress.test.ts
```

Tests:

```text
1. completed computation report displays computation artifact summary.
2. show latest report displays attachments concisely.
3. failed computation report shows exit code/failure without raw stack spam.
4. normal report without computational artifacts is unchanged.
```

### Task 14: Update smoke documentation

Modify:

```text
docs/comath-research-exploration-smoke.md
```

Add section:

```text
Computational exploration workstream smoke
```

Manual steps:

```bash
cd /tmp
mkdir comath-computation-workstream-demo-1
cd comath-computation-workstream-demo-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
continue path 1
show progress
show latest report
summarize current state
```

Good signs:

```text
- Path 1 starts a computational/examples workstream.
- Progress mentions computation or finite check.
- Script/result artifacts are saved under .pi/co-math/artifacts/.
- Report includes checked range and exit code.
- Critic says finite search does not prove infinitude.
- Working paper is updated with observations, not a proof claim.
```

Add state inspection command:

```bash
python3 -c 'import json, pathlib; p=pathlib.Path(".pi/co-math/state.json"); print("exists", p.exists());
if p.exists():
 s=json.loads(p.read_text()); print("computationalArtifacts", len(s.get("computationalArtifacts", []))); print("runs", len(s.get("researchWorkstreamRuns", []))); print("reports", len(s.get("researchReports", [])));
 [print("artifact", a.get("id"), a.get("kind"), a.get("status"), a.get("filePath"), a.get("exitCode")) for a in s.get("computationalArtifacts", [])]
 [print("report", r.get("id"), r.get("status"), r.get("computationalArtifactIds")) for r in s.get("researchReports", [])]
'
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
  test/comath-research-model-workstream.test.ts \
  test/comath-literature-workstream.test.ts \
  test/comath-computation-workstream.test.ts
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

Use a new directory. Do not use cleanup/deletion patterns.

```bash
cd /tmp
mkdir comath-computation-workstream-demo-1
cd comath-computation-workstream-demo-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
continue path 1
show progress
show latest report
summarize current state
```

Good outcome:

```text
- computation workstream starts asynchronously
- progress reports computation stage
- script/result artifacts are saved under .pi/co-math/artifacts/
- final report includes finite observations and limitations
- no finite computation is presented as proof of infinitude
```

Also smoke twin primes if time allows:

```text
Explore this problem: Are there infinitely many twin primes?
continue path 1
show latest report
```

Good outcome:

```text
- scans a bounded range for twin-prime pairs or safely blocks if no safe script generated
- preserves the distinction between examples and proof
```

---

## Acceptance Criteria

Implementation is acceptable only if:

```text
1. Computational artifacts are represented in structured state, not prose only.
2. Old states normalize without computationalArtifacts.
3. Computation executor is fakeable and tests do not call real providers or expensive computation.
4. Production execution is bounded, local, and safe by default.
5. Path 1 / examples paths route to computational exploration.
6. Path 5 / literature paths still route to literature workstream.
7. Other paths still use normal model-backed research workstream.
8. Async lifecycle and incremental reports work for computation stage.
9. Script/result artifacts are linked to final reports.
10. show latest report displays artifacts and limitations.
11. Failed or rejected scripts are preserved visibly, not hidden.
12. No finite computation is presented as proof of an infinite statement.
13. Stale-run recovery still works.
14. Focused test command passes.
15. npm run check passes.
16. git diff --check passes.
17. Manual smoke result is reported with exact artifact counts and file paths.
```

---

## Risks and Pitfalls

### Unsafe code execution

This is the main risk. Keep scripts bounded, generated under a project artifact directory, run without shell expansion, and reject obvious unsafe operations. Do not run package managers or network code.

### Overclaiming finite evidence

The critic and final report must explicitly say finite search does not prove infinitude.

### State bloat

Do not store huge stdout/stderr in state. Store files and summaries.

### Product-copy clutter

Normal output should say `Computation`, `Findings`, `Limitations`, and `Attachments`, not raw executor internals.

### Regression of literature path

Path 5 routing was just added. Add tests proving it still wins over generic model/computation routing.

---

## Suggested Codex Prompt

```text
Implement docs/codex-comath-computational-workstream-plan.md.

Use /home/hermes/developer/pi-mono-comath on the current comath/research-exploration-mode branch. Do not commit or push unless asked.

Goal: add a bounded tool-backed computational exploration workstream for examples/counterexamples paths, especially Path 1. Build on the existing async research workstream lifecycle. The workstream should create structured computational artifacts in state, execute a safe local finite-check script or block safely, link script/result artifacts to the final report, and critique mathematical limitations so finite evidence is never presented as proof.

Use fake model/computation executors in tests. Do not call real providers or expensive computation from unit tests. Keep production execution local, bounded, no network, no package managers, no shell interpolation.

Run the focused co-math test command from the plan, then `npm run check`, then `git diff --check`. Do a manual TUI smoke from a fresh temp folder. Report changed files, computational artifact state fields added, executor safety behavior, exact tests run, smoke result including artifact counts/file paths, and limitations. Do not commit.
```

---

## Final Report Requirements for Codex

When done, report:

```text
- files changed
- computational artifact state fields/helpers added
- how computational paths are detected
- how production computation execution is bounded/safe
- how fake computation executor is used in tests
- how script/result artifacts are persisted and linked to reports
- behavior for failed/rejected scripts
- exact tests run and results
- npm run check result
- git diff --check result
- manual smoke result with artifact counts and paths
- known limitations
- confirmation that no commit was made
```
