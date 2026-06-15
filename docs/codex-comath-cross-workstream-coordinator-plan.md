# Co-Math Cross-Workstream Coordinator Implementation Plan

> **For Codex:** Implement this plan on `/home/hermes/developer/pi-mono-comath` from the current `comath/research-exploration-mode` branch. Do not commit or push unless explicitly asked. Stage only files you change if the user later asks for a commit.

**Goal:** Add a bounded cross-workstream project coordinator that reads accumulated co-math research reports, artifacts, source support, and path state, then recommends the next research moves with explicit roadblocks and human-help requests.

**Architecture:** Build on the current paper-style workstream stack: model-backed workstreams, async lifecycle, source-backed literature workstreams, and computational workstreams. This milestone does not add another specialist worker. It adds the central project-coordinator layer from `docs/2605.06651v2.pdf`: synthesize across completed/blocked workstreams, identify what is known vs still uncertain, propose next paths, and update the working paper/margin notes with coordinator-level planning. Keep existing path continuation behavior, literature/computation routing, source/provenance state, stale-run recovery, and proof-validation mode intact.

**Tech Stack:** TypeScript, existing Pi co-math harness/state/storage/progress modules, existing `pi --mode json -p --no-session` model executor pattern, existing async research reports/artifacts/provenance state, Vitest. Prefer no new npm dependencies. Unit tests must use fake model executors and fake state; no test should call a real provider, network, or execute expensive computation.

---

## Motivation

The current co-math branch now has individual paper-style workstreams:

```text
Explore problem
→ create research paths
→ continue path N
→ async workstream
→ model-backed specialist/critic/synthesizer
→ source-backed literature workstream
→ computational workstream with artifacts
```

The next layer in `docs/2605.06651v2.pdf` is the project coordinator. The paper describes a stateful workspace where a central coordinator tracks goals, schedules workstreams, reads incremental/final reports, surfaces roadblocks, and asks the human for help.

Right now Pi can run useful individual workstreams, but the user still has to mentally integrate them:

```text
- Path 1 computation found finite examples and limitations.
- Path 5 literature workstream was blocked because no source lookup was configured.
- Path 2 direct proof attempt may have a gap.
- What should we try next?
```

The next milestone should make Pi answer that question directly.

---

## Expected End Result

From a clean folder:

```bash
cd /tmp
mkdir comath-coordinator-demo-1
cd comath-coordinator-demo-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
continue path 1
show latest report
continue path 5
show latest report
what should we try next?
```

Expected final coordinator response:

```text
Project coordinator summary

What we know
- The finite computation found examples of primes of the form n^2 + 1 and the parity obstruction for odd n > 1.
- The computation is finite evidence only; it does not prove infinitude.
- The literature/theorem path has no source-backed theorem yet because no references were available.

Current roadblocks
- No completed workstream has established a mechanism proving infinitely many prime values.
- The source-backed literature path is blocked until references or a lookup backend are available.
- Finite checks cannot settle an infinite claim.

Recommended next moves
1. Continue Path 3: reformulate the question using known conjectural frameworks for prime values of polynomials.
2. Continue Path 2: direct proof attempt using parity and modular observations from the computation.
3. Provide a source or theorem reference for quadratic prime values, then rerun the literature path.

Suggested next step
continue path 3
```

The response must be based on the durable state, not just a new generic model answer.

`show latest coordinator report` or `show coordinator report` should show details if implemented. If the team chooses not to add a new command, `show latest report` must continue to mean latest workstream report and the coordinator summary can be stored as a margin note/working-paper section. But the plan recommends a dedicated coordinator report type.

---

## Non-Goals

Do not implement:

```text
- fully autonomous recursive research loops
- parallel multi-workstream scheduling
- automatic execution of the recommended next path
- formal proof assistant integration
- web/literature lookup improvements
- computational executor improvements
- external database or server persistence
- PR/issue creation
```

Do not regress:

```text
- `continue path 1` computational routing
- `continue path 5` literature routing
- normal paths 2-4 model-backed workstreams
- stale async run recovery
- `show progress`
- `show latest report`
- source/provenance and computational artifact formatting
- proof-validation/source-audit mode
```

---

## Current Context

Recent commits to build on:

```text
9725b2c7 feat(coding-agent): add model-backed co-math workstreams
bc8aa817 feat(coding-agent): run co-math research asynchronously
acaa6494 feat(coding-agent): add source-backed co-math literature workstreams
d1ae5e99 feat(coding-agent): add co-math computational workstreams
```

Important current files:

```text
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
packages/coding-agent/src/modes/comath/comath-research-workstream.ts
packages/coding-agent/src/modes/comath/comath-research-model-workstream.ts
packages/coding-agent/src/modes/comath/comath-literature-workstream.ts
packages/coding-agent/src/modes/comath/comath-computation-workstream.ts
packages/coding-agent/test/co-math-state.test.ts
packages/coding-agent/test/comath-harness.test.ts
packages/coding-agent/test/comath-progress.test.ts
packages/coding-agent/test/comath-literature-workstream.test.ts
packages/coding-agent/test/comath-computation-workstream.test.ts
```

Before editing, inspect current code. Do not guess helper names or state field shapes.

---

## Design Overview

Add three bounded pieces:

```text
1. Structured coordinator reports in co-math state.
2. A model-backed coordinator synthesis function with deterministic fallback.
3. Natural-language routing for “what should we try next?” / “make a plan” / “what is blocked?”.
```

### State: coordinator reports

Add a durable coordinator report type. Suggested schema:

```ts
export interface ResearchCoordinatorReportRecord {
	id: string;
	createdAt: string;
	updatedAt: string;
	inputReportIds: string[];
	inputPathIds: string[];
	inputSourceIds: string[];
	inputComputationalArtifactIds: string[];
	whatWeKnow: string[];
	roadblocks: string[];
	recommendedNextMoves: ResearchCoordinatorNextMove[];
	humanHelpUseful: string[];
	suggestedPathId?: string;
	suggestedPrompt?: string;
	workingPaperSectionId?: string;
}

export interface ResearchCoordinatorNextMove {
	title: string;
	pathId?: string;
	rationale: string;
	prompt?: string;
	priority: "high" | "medium" | "low";
}
```

Add to state:

```ts
researchCoordinatorReports: ResearchCoordinatorReportRecord[];
```

If the project already has a generic report/working-paper section that can cleanly represent this, still add structured fields somewhere. Do not store coordinator synthesis only as prose.

### Coordinator synthesis function

Create:

```text
packages/coding-agent/src/modes/comath/comath-coordinator-synthesis.ts
```

Expose:

```ts
export interface RunResearchCoordinatorSynthesisInput {
	state: CoMathProjectState;
	executor?: ResearchWorkstreamModelExecutor;
	now: string;
}

export interface ResearchCoordinatorSynthesisResult {
	report: ResearchCoordinatorReportDraft;
}

export async function runResearchCoordinatorSynthesis(...): Promise<ResearchCoordinatorSynthesisResult>;
```

The synthesis should build a compact context from existing state:

```text
- root question
- research paths with status/latest findings
- latest workstream reports, statuses, gaps, suggested next moves
- source support status from literatureClaimSupports
- source ids/titles from literatureSources
- computational artifact summaries/exit codes/paths
- active/blocked/failed runs
- working paper sections
```

Use model-backed synthesis if `researchModelExecutor` exists. If the model call fails or is absent, use deterministic fallback that still summarizes current state and recommends a next active path.

### Natural-language routing

Add coordinator prompts:

```text
what should we try next?
what next?
recommend next path
make a plan from current reports
summarize current state and recommend next steps
what is blocked?
compare paths
project coordinator summary
show latest coordinator report
show coordinator report
```

Keep existing `summarize current state` behavior unless you intentionally enhance it. Do not break it.

Recommended behavior:

```text
- “summarize current state” stays compact and mostly path-based.
- “what should we try next?” creates/saves a coordinator report.
- “show latest coordinator report” displays the latest coordinator report.
```

---

## Implementation Tasks

### Task 1: Inspect current state/report/progress code

Objective: Understand existing storage patterns and output formatting before adding coordinator reports.

Read:

```text
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
```

Search for:

```text
researchReports
researchWorkstreamRuns
literatureSources
literatureClaimSupports
computationalArtifacts
workingPaperSections
marginNotes
show latest report
summarize current state
```

### Task 2: Add coordinator report schema

Modify:

```text
packages/coding-agent/examples/extensions/co-math/schema.ts
```

Add:

```text
ResearchCoordinatorReportRecord
ResearchCoordinatorNextMove
```

Add to project state:

```ts
researchCoordinatorReports: ResearchCoordinatorReportRecord[];
```

Requirements:

```text
- old states normalize with researchCoordinatorReports: []
- ids are stable like coordinator-report-1
- reports link input report/path/source/computation artifact ids
- recommended next moves are structured, not prose only
```

### Task 3: Add storage helpers

Modify:

```text
packages/coding-agent/examples/extensions/co-math/storage.ts
```

Add helpers like:

```ts
export interface AddResearchCoordinatorReportInput { ... }
export function addResearchCoordinatorReport(state, input): CoMathProjectState;
export function getLatestResearchCoordinatorReport(state): ResearchCoordinatorReportRecord | undefined;
```

Requirements:

```text
- no input-state mutation
- event kind for coordinator report recorded
- normalization handles old/malformed reports conservatively
- empty arrays for missing optional lists
- report text fields are trimmed and non-empty fallbacks are applied
```

### Task 4: Add state/storage tests

Modify:

```text
packages/coding-agent/test/co-math-state.test.ts
```

Tests:

```text
1. empty project state includes researchCoordinatorReports: []
2. legacy state without researchCoordinatorReports normalizes to []
3. addResearchCoordinatorReport creates coordinator-report-1
4. input report/source/computational artifact ids are preserved
5. recommended next moves are stored with priority/rationale
6. latest coordinator report helper returns newest report
```

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts
```

### Task 5: Add coordinator synthesis module

Create:

```text
packages/coding-agent/src/modes/comath/comath-coordinator-synthesis.ts
```

Responsibilities:

```text
- build compact project context from state
- call model executor if available
- parse model markdown into structured report draft
- deterministic fallback if no executor/failure
```

Suggested staged sections for model output:

```text
## What we know
## Roadblocks
## Recommended next moves
## Human help useful
## Suggested next step
```

Prompt requirements:

```text
- use only durable project state as evidence
- distinguish computation evidence from proof
- distinguish source-backed facts from unsupported literature claims
- mention blocked/failed workstreams as roadblocks
- do not claim the mathematical problem is solved unless a report explicitly supports it
- recommend a concrete next path or human action
```

Parsing requirements:

```text
- tolerate markdown bullets and numbered lists
- cap output lists to keep TUI concise
- if suggested path id is absent, infer from recommended next move text or fallback ranking
```

### Task 6: Add deterministic fallback coordinator

In the coordinator synthesis module, implement fallback logic for no model executor or failed model call.

Fallback should:

```text
- collect latest completed/blocked reports
- list known findings from reports
- list gaps/blocked statuses as roadblocks
- prefer active paths without recent reports as next moves
- if computation exists and literature is blocked, recommend reformulation or source help
- if no reports exist, recommend continuing the current/best path
```

This fallback is important for tests and for provider failures.

### Task 7: Add coordinator synthesis tests

Create:

```text
packages/coding-agent/test/comath-coordinator-synthesis.test.ts
```

Use fake executor and handcrafted state.

Tests:

```text
1. deterministic fallback summarizes computation report and blocked literature report.
2. model-backed coordinator prompt includes report gaps, source support status, and computation artifact summaries.
3. parser extracts What we know / Roadblocks / Recommended next moves / Human help useful / Suggested next step.
4. no report can claim proof solely from computation artifacts.
5. failed model call falls back deterministically.
6. coordinator report links input report ids and artifact ids.
```

No real provider calls.

### Task 8: Add progress formatter for coordinator reports

Modify:

```text
packages/coding-agent/src/modes/comath/comath-progress.ts
```

Add:

```ts
export function formatResearchCoordinatorReport(...): string;
export function formatLatestResearchCoordinatorReportMissing(): string;
```

Expected output sections:

```text
Project coordinator summary

What we know
- ...

Current roadblocks
- ...

Recommended next moves
1. ...
2. ...

Human help useful
- ...

Suggested next step
continue path 3
```

Formatting requirements:

```text
- no raw JSON
- avoid raw internal ids in normal copy except friendly path numbers
- if referencing artifacts/sources, use compact labels and descriptions
- keep output concise enough for terminal TUI
```

### Task 9: Add harness routing for coordinator prompts

Modify:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
```

Add natural-language handling after project state exists and before generic fallbacks.

Prompts:

```text
what should we try next?
what next?
recommend next path
make a plan from current reports
project coordinator summary
what is blocked?
compare paths
show latest coordinator report
show coordinator report
```

Behavior:

```text
- “what should we try next?” creates a new coordinator report, saves it, updates working paper/margin notes if appropriate, and prints it.
- “show latest coordinator report” displays the latest saved coordinator report without creating a new one.
- If no project exists, ask the user to start with `Explore this problem: ...` rather than creating empty state.
- If a research workstream is actively running, coordinator report should mention active run status but not block.
```

### Task 10: Persist coordinator reports and working-paper updates

When creating a coordinator report:

```text
1. load latest state
2. run coordinator synthesis with latest state
3. persist coordinator report
4. optionally upsert working paper section titled “Project coordinator synthesis”
5. optionally add margin note for suggested next step
6. notify user with formatted report
```

Important:

```text
- Report must be based on latest state, not stale state captured before user’s most recent workstream completion.
- Do not auto-start the recommended next path.
```

### Task 11: Add harness tests

Modify:

```text
packages/coding-agent/test/comath-harness.test.ts
```

Tests:

```text
1. `what should we try next?` creates and displays a coordinator report.
2. coordinator report uses completed computation and blocked literature reports.
3. `show latest coordinator report` displays existing report without creating a duplicate.
4. prompt before project exists asks user to start exploration and does not create state.
5. active running workstream is mentioned but does not prevent coordinator summary.
6. existing `summarize current state` still works.
7. `show latest report` still shows latest workstream report, not coordinator report.
8. path recommendation uses friendly path labels, not raw ids.
```

Use fake model executor or fallback state. Do not call real provider.

### Task 12: Add progress formatter tests

Modify:

```text
packages/coding-agent/test/comath-progress.test.ts
```

Tests:

```text
1. coordinator report formatter shows What we know / Roadblocks / Recommended next moves.
2. formatter shows human-help section only when non-empty.
3. formatter avoids raw report ids/artifact ids in default copy where practical.
4. missing latest coordinator report gives helpful message.
```

### Task 13: Update smoke docs

Modify:

```text
docs/comath-research-exploration-smoke.md
```

Add section:

```text
Cross-workstream coordinator smoke
```

Manual steps:

```bash
cd /tmp
mkdir comath-coordinator-demo-1
cd comath-coordinator-demo-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
continue path 1
show latest report
continue path 5
show latest report
what should we try next?
show latest coordinator report
summarize current state
```

Good signs:

```text
- coordinator summary references both computation and literature reports
- finite computation is not treated as proof
- blocked literature/source state is recognized
- recommends a concrete next path or source-help action
- saved coordinator report count increases by one
- `show latest coordinator report` does not create another report
```

State inspection command:

```bash
python3 -c 'import json, pathlib; p=pathlib.Path(".pi/co-math/state.json"); print("exists", p.exists());
if p.exists():
 s=json.loads(p.read_text()); print("coordinatorReports", len(s.get("researchCoordinatorReports", []))); print("researchReports", len(s.get("researchReports", []))); print("computationalArtifacts", len(s.get("computationalArtifacts", []))); print("literatureClaimSupports", len(s.get("literatureClaimSupports", [])));
 [print("coordinator", r.get("id"), "inputs", r.get("inputReportIds"), "suggested", r.get("suggestedPathId"), r.get("suggestedPrompt")) for r in s.get("researchCoordinatorReports", [])]
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
  test/comath-computation-workstream.test.ts \
  test/comath-coordinator-synthesis.test.ts
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
mkdir comath-coordinator-demo-1
cd comath-coordinator-demo-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
continue path 1
show latest report
continue path 5
show latest report
what should we try next?
show latest coordinator report
```

Good outcome:

```text
- `continue path 1` produces computation artifacts/report.
- `continue path 5` produces source/literature blocked or sourced report.
- `what should we try next?` creates a coordinator report.
- coordinator summary references both prior reports.
- coordinator recognizes finite evidence is not proof.
- coordinator recognizes literature/source gap.
- coordinator recommends a concrete next path or human source action.
- `show latest coordinator report` displays the same saved report and does not create a duplicate.
```

---

## Acceptance Criteria

Implementation is acceptable only if:

```text
1. Coordinator reports are represented in structured state, not prose only.
2. Old states normalize without researchCoordinatorReports.
3. Coordinator synthesis reads existing reports, source support, computation artifacts, paths, and active/blocked runs.
4. “what should we try next?” creates and saves a coordinator report.
5. “show latest coordinator report” displays an existing report without creating a duplicate.
6. Existing `show latest report` still shows workstream reports.
7. Existing `summarize current state` still works.
8. Coordinator does not claim finite computation proves an infinite statement.
9. Coordinator distinguishes source-backed from unsupported literature claims.
10. Coordinator recommends concrete next moves with rationale.
11. Deterministic fallback works when no model executor is available or the model call fails.
12. Focused test command passes.
13. `npm run check` passes.
14. `git diff --check` passes.
15. Manual smoke result is reported with coordinator report count and suggested next move.
```

---

## Risks and Pitfalls

### Generic model answer not grounded in state

The coordinator must synthesize durable state. The prompt should include only compact state facts, and tests should assert the prompt includes report gaps/artifacts/source support.

### Overclaiming from computation

The coordinator must repeat that finite searches are evidence, not proof.

### Ignoring blocked literature/source state

If a literature report is blocked due missing sources, that must become a roadblock or human-help item.

### Duplicating report semantics

`show latest report` already means latest workstream report. Do not silently change it to coordinator report. Add `show latest coordinator report` for coordinator synthesis.

### UX clutter

Coordinator summaries should use friendly path labels and concise prose. Avoid raw internal ids in the default output.

---

## Suggested Codex Prompt

```text
Implement docs/codex-comath-cross-workstream-coordinator-plan.md.

Use /home/hermes/developer/pi-mono-comath on the current comath/research-exploration-mode branch. Do not commit or push unless asked.

Goal: add a bounded cross-workstream project coordinator for co-math. It should synthesize accumulated researchReports, research paths, source/provenance state, computational artifacts, and active/blocked runs, then recommend next research moves with roadblocks and human-help requests. Add structured coordinator reports in state. Route natural prompts like “what should we try next?” to create a coordinator report, and “show latest coordinator report” to display it without creating a duplicate.

Use fake model executors in tests. Do not call real providers from unit tests. Preserve existing `show latest report`, `summarize current state`, literature routing, computation routing, stale-run recovery, and proof-validation behavior.

Run the focused co-math test command from the plan, then `npm run check`, then `git diff --check`. Do a manual TUI smoke from a fresh temp folder after running a computation and literature path. Report changed files, coordinator state fields/helpers, prompt routing, exact tests run, smoke result with coordinator report count/suggested next move, and limitations. Do not commit.
```

---

## Final Report Requirements for Codex

When done, report:

```text
- files changed
- coordinator report state fields/helpers added
- how coordinator prompts are detected
- how synthesis uses workstream reports/source supports/computation artifacts
- deterministic fallback behavior
- how `show latest coordinator report` differs from `show latest report`
- exact tests run and results
- npm run check result
- git diff --check result
- manual smoke result with coordinator report count and suggested next move
- known limitations
- confirmation that no commit was made
```
