# Co-Math Coordinator-Managed Research Workstreams Plan

> **For Claude Code:** Implement this plan on the current co-math branch, or create a new branch if the user asks. Do not commit or push unless explicitly asked. Keep existing proof-validation mode, research exploration mode, and deterministic path execution working.

**Goal:** Implement the next paper-aligned co-math milestone: when the user continues a research path, Pi creates a durable coordinator-managed research workstream with specialist attempt, critic review, synthesized report, and working-paper update, while showing only curated high-level progress in the TUI.

**Architecture:** Preserve the current user-facing research path UX, but insert a lightweight internal workstream layer under `continue path N`. The path workstream should have structured internal steps: coordinator brief, specialist attempt, critic review, synthesis, and working-paper update. The normal TUI should show progressive disclosure, not raw role chatter. Durable state should record the full report/transcript so later commands can show details.

**Tech Stack:** TypeScript, existing Pi co-math harness, existing co-math state/storage helpers, existing research path execution module, Vitest.

---

## Motivation

The current co-math branch has reached a useful milestone:

```text
Explore this problem
→ create multiple research paths
→ steer focus/drop/continue
→ run deterministic path-specific research rounds
→ update findings, uncertainty, margin notes, and working paper
```

That is a strong product slice, but it is still not close enough to the architecture described in `docs/2605.06651v2.pdf`.

The paper emphasizes an agent hierarchy:

```text
project coordinator
→ parallel workstreams
→ workstream coordinator
→ specialized sub-agents
→ reviewer/critic
→ synthesized mathematical artifact
```

It also emphasizes:

```text
- progressive disclosure
- user steering while research continues
- failed hypotheses as useful artifacts
- roadblocks surfaced to the human
- a living working paper rather than raw chat logs
```

The next milestone should make each research path feel like a real research process, not only a deterministic formatter.

---

## Expected End Result

From a clean folder:

```bash
cd /tmp/comath-workstream-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

User types:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
```

Pi prepares the research workspace as it does now.

User types:

```text
continue path 2
```

Pi should show a curated workstream lifecycle, for example:

```text
Research workstream started

Path 2: Direct proof attempt

Progress
- Framing the proof objective.
- Trying a direct proof strategy.
- Reviewing the strategy for gaps before updating the working paper.
```

Then it should complete with a synthesized result:

```text
Research workstream completed

Path 2: Direct proof attempt

Promising strategy
- Reduce the problem to the even case n = 2m, giving values 4m^2 + 1.
- Look for a mechanism that produces infinitely many prime values of this quadratic.

Review
- A Euclid-style construction does not immediately preserve the form n^2 + 1.
- The current argument gives evidence and reductions, not a proof of infinitude.

Gap
- No complete mechanism has been established for infinitely many even n with n^2 + 1 prime.

Next
Try a weaker theorem or source-backed literature check before spending more time on the full direct proof.

Working paper updated
- Added synthesized notes under “Direct proof attempts.”

Details
- Say "show latest report" to inspect the internal attempt and critique.
```

Then:

```text
show latest report
```

should show a durable report with sections like:

```text
Latest research report

Path 2: Direct proof attempt

Coordinator brief
...

Specialist attempt
...

Critic review
...

Synthesis
...
```

Important: the normal output must not expose backend/debug terms as the main experience.

Avoid normal-mode copy like:

```text
role-run
artifact
schema
queue
workstream-*
role-run-*
JSON
```

The term “research workstream” is acceptable as product language, but raw IDs and backend mechanics are not.

---

## Non-Goals

Do not implement the full Google co-mathematician architecture yet.

Do not add:

```text
- true parallel execution
- daemonized background research loops
- new paid/external API calls
- theorem prover integration
- AlphaEvolve/AlphaProof/Aletheia integrations
- web UI
- new npm dependencies
- broad schema rewrite
- automatic git commits
```

This milestone is a bounded vertical slice:

```text
continue path N
→ create durable internal research workstream
→ run specialist attempt + critic review + synthesis
→ update path + working paper
→ expose curated progress and report commands
```

The implementation may be synchronous and deterministic for now. The important product/architecture change is the internal coordinator/specialist/reviewer/report structure.

---

## Current Context

Recent relevant commits:

```text
663dabd6 feat(coding-agent): add co-math research exploration mode
b65ed946 docs(coding-agent): prune superseded co-math handoff plans
e2788fcd feat(coding-agent): execute co-math research path rounds
```

Current behavior:

```text
- `Explore this problem: ...` creates five research paths.
- `continue path 1` runs deterministic examples/counterexamples.
- `continue path 2` runs deterministic direct-proof-attempt content.
- Results update `latestFindings`, blockers/uncertainty, margin notes, and working-paper sections.
- `continue path 99` warns and does not fall back to another path.
- `summarize current state` includes compact latest findings.
```

Relevant files:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
packages/coding-agent/src/modes/comath/comath-research-execution.ts
packages/coding-agent/src/modes/comath/comath-research-autoplan.ts
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/examples/extensions/co-math/commands.ts
packages/coding-agent/test/comath-harness.test.ts
packages/coding-agent/test/comath-progress.test.ts
packages/coding-agent/test/comath-research-execution.test.ts
packages/coding-agent/test/co-math-state.test.ts
```

Before editing, inspect these files and keep changes minimal.

---

## Product Principles

1. Progressive disclosure.

The user should see:

```text
Research workstream started
Progress
Research workstream completed
Summary / gap / next move
```

They should not see the full internal transcript unless they ask:

```text
show latest report
show details for path 2
```

2. Flawed attempts are useful.

A failed direct proof should not be hidden. It should become:

```text
Promising strategy
Gap found
Human help useful
```

3. Preserve mathematical uncertainty.

Do not claim proof unless there is actually a proof. Use:

```text
evidence
strategy
gap
uncertainty
source needed
```

4. Avoid backend language in product copy.

Normal output should not expose raw IDs or implementation concepts.

5. Reuse existing state.

The repo already has co-math state, reports, working-paper sections, margin notes, research paths, and events. Prefer extending these structures carefully over creating a parallel state model.

---

## Proposed Architecture

Add a lightweight module:

```text
packages/coding-agent/src/modes/comath/comath-research-workstream.ts
```

This module should produce a structured result for a research path workstream.

Suggested types:

```ts
import type { ResearchPath } from "../../../examples/extensions/co-math/schema.ts";
import type { ResearchRoundResult } from "./comath-research-execution.ts";

export interface ResearchWorkstreamStep {
	role: "coordinator" | "specialist" | "critic" | "synthesizer";
	title: string;
	summary: string;
	details: string[];
}

export interface ResearchWorkstreamReport {
	pathId: string;
	pathTitle: string;
	startedAt: string;
	completedAt: string;
	status: "completed" | "blocked";
	coordinatorBrief: string;
	steps: ResearchWorkstreamStep[];
	promisingStrategy: string[];
	findings: string[];
	criticisms: string[];
	gaps: string[];
	humanHelpUseful: string[];
	suggestedNextMove: string;
	workingPaperSectionTitle: string;
	workingPaperSummary: string;
}

export function runResearchWorkstream(input: {
	rootQuestion: string;
	path: ResearchPath;
	allPaths: readonly ResearchPath[];
	now: string;
}): ResearchWorkstreamReport;
```

Implementation can reuse `runResearchPathRound()` internally:

```text
1. coordinator frames the path objective
2. specialist uses deterministic path execution as the attempt
3. critic reviews the attempt for gaps/overclaims
4. synthesizer writes durable report and working-paper summary
```

Do not duplicate all path logic if `comath-research-execution.ts` already has it. Instead, wrap it and add role structure/review.

---

## State Model Requirements

Inspect existing schema first. If there is already a suitable `reports` structure, reuse it.

If existing report records are too tied to source-audit role runs, add the smallest general structure needed.

Preferred minimal addition to schema:

```ts
export interface ResearchWorkstreamReportRecord {
	id: string;
	kind: "research_workstream";
	pathId: string;
	pathTitle: string;
	status: "completed" | "blocked";
	startedAt: string;
	completedAt: string;
	coordinatorBrief: string;
	steps: ResearchWorkstreamStepRecord[];
	promisingStrategy: string[];
	findings: string[];
	criticisms: string[];
	gaps: string[];
	humanHelpUseful: string[];
	suggestedNextMove: string;
	workingPaperSectionId?: string;
}
```

But do not create this exact type blindly. First inspect:

```text
packages/coding-agent/examples/extensions/co-math/schema.ts
```

Look for existing records:

```text
reports
roleRuns
artifacts
events
workingPaperSections
marginNotes
```

If existing `reports` can safely store this, prefer adding a `kind` or report fields to it over inventing a separate top-level array.

State update after a workstream should:

```text
- append a durable report
- update the selected research path findings/blockers/suggestedNextMove
- upsert the working-paper section
- add margin notes for critic gaps/uncertainties
- add an event summarizing the research workstream
```

Report IDs should be stable and human-safe internally, but normal TUI output should say:

```text
show latest report
```

not:

```text
report research-workstream-3
```

---

## Command / Prompt Behavior

### `continue path N`

Current behavior:

```text
continue path N
→ run deterministic research path round
→ print Research round completed
```

New behavior:

```text
continue path N
→ run research workstream
→ print Research workstream started/progress/completed
→ save report
→ update path and working paper
```

For now, synchronous output is acceptable. You can print started/progress immediately, run deterministic workstream, then print completed.

### `show latest report`

If latest report is a research workstream report:

```text
Latest research report

Path 2: Direct proof attempt

Coordinator brief
...

Specialist attempt
...

Critic review
...

Synthesis
...

Next
...
```

If there is no report:

```text
No research report is available yet. Continue a path first.
```

Preserve existing behavior for proof-validation/source-audit latest reports. Do not break it.

### `show details for path 2`

Optional but preferred in this milestone.

Should show the latest workstream report for that path, if one exists. If not:

```text
No detailed report has been recorded for Path 2 yet. Say "continue path 2" to run one.
```

### `summarize current state`

Should remain compact but mention report availability, e.g.:

```text
Path 2: Direct proof attempt: active
Latest findings
- ...
Latest gap
- ...
Report: available; say "show details for path 2".
Next: ...
```

Do not dump full report in summary.

---

## Suggested Role Semantics

### Coordinator

Purpose:

```text
Frame what this path is trying to accomplish and what would count as progress.
```

Example:

```text
The direct proof path should test whether the conjecture can be reduced to a reusable infinitude mechanism, not merely produce more examples.
```

### Specialist

Purpose:

```text
Attempt the path-specific research move.
```

For this milestone, the specialist can reuse deterministic path execution output.

### Critic

Purpose:

```text
Review the specialist attempt for gaps, overclaims, unsupported theorem citations, or missing source checks.
```

For `n^2 + 1`, critic should catch:

```text
- examples do not imply infinitude
- Euclid-style proof does not preserve n^2 + 1 form
- literature status needs source-backed verification
```

### Synthesizer

Purpose:

```text
Decide what should enter the working paper and what should remain an open gap.
```

The synthesizer should output:

```text
- useful findings
- promising strategy if any
- gap / uncertainty
- human-help request if useful
- next move
```

---

## Implementation Tasks

### Task 1: Inspect existing report/state structures

Objective: Decide where durable research workstream reports should live.

Read in full or relevant sections:

```text
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/examples/extensions/co-math/commands.ts
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
```

Find existing support for:

```text
reports
roleRuns
artifacts
workingPaperSections
marginNotes
events
show latest report
```

Do not implement until you know whether to reuse existing `reports` or add a new minimal research-report record.

### Task 2: Add failing tests for report persistence and product output

Modify:

```text
packages/coding-agent/test/comath-harness.test.ts
```

Add tests:

```text
1. `continue path 2` creates a durable research workstream report.
2. Visible output contains `Research workstream completed`, `Promising strategy`, `Review`, `Gap`, `Working paper updated`, and `show latest report`.
3. Visible output does not expose raw IDs or backend terms.
4. `show latest report` displays coordinator/specialist/critic/synthesis sections.
5. `continue path 99` still warns and creates no report.
6. proof-validation latest-report behavior still works if existing tests cover it; add a regression if not.
```

Use existing test helpers like `createResearchHarnessFixture()` if available.

Expected product-copy assertions:

```ts
expect(visible).toContain("Research workstream completed");
expect(visible).toContain("Promising strategy");
expect(visible).toContain("Review");
expect(visible).toContain("Gap");
expect(visible).toContain("Working paper updated");
expect(visible).toContain("show latest report");
expectProductCopy(visible);
```

Also add explicit negative assertions if `expectProductCopy` does not cover these:

```ts
expect(visible).not.toMatch(/role-run-|workstream-|artifact-|schema|queue/i);
```

Run and confirm failure:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/comath-harness.test.ts
```

### Task 3: Add research workstream module

Create:

```text
packages/coding-agent/src/modes/comath/comath-research-workstream.ts
```

Implement structured deterministic workstream generation.

Use top-level imports only. No inline imports. No `any`.

Reuse:

```text
runResearchPathRound()
```

from:

```text
packages/coding-agent/src/modes/comath/comath-research-execution.ts
```

Suggested logic:

```text
const round = runResearchPathRound(...)
const critic = buildCriticReview(rootQuestion, path, round)
const synthesis = buildSynthesis(path, round, critic)
return structured report
```

Add helper functions by path title:

```text
buildCoordinatorBrief
buildSpecialistStep
buildCriticReview
buildSynthesisStep
buildHumanHelpUseful
```

Keep output deterministic and testable.

### Task 4: Add state helper to record research reports

Modify:

```text
packages/coding-agent/examples/extensions/co-math/storage.ts
```

Add the smallest helper needed, for example:

```ts
export function addResearchWorkstreamReport(
	state: CoMathProjectState,
	input: AddResearchWorkstreamReportInput,
): CoMathProjectState
```

But only after inspecting existing report structures.

The helper should:

```text
- append report
- update `updatedAt`
- append event
- avoid duplicate IDs
```

Add types to:

```text
packages/coding-agent/examples/extensions/co-math/schema.ts
```

if needed.

Add state tests in:

```text
packages/coding-agent/test/co-math-state.test.ts
```

Test:

```text
- report is appended
- event is recorded
- report can be found as latest
- empty required fields are rejected if helpers validate input
```

### Task 5: Add product formatters

Modify:

```text
packages/coding-agent/src/modes/comath/comath-progress.ts
```

Add formatters:

```ts
formatResearchWorkstreamStarted(...)
formatResearchWorkstreamCompleted(...)
formatResearchWorkstreamReport(...)
```

Normal completion output should include:

```text
Research workstream completed
Path N: ...
Promising strategy
Review
Gap
Human help useful   // only if non-empty
Next
Working paper updated
Details
- Say "show latest report" ...
```

`formatResearchWorkstreamReport` should include full details:

```text
Latest research report
Path N: ...
Coordinator brief
Specialist attempt
Critic review
Synthesis
Next
```

### Task 6: Wire `continue` flow to workstream execution

Modify:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
```

Replace current direct `runResearchPathRound()` call with:

```text
1. resolve path as before
2. notify workstream started/progress
3. runResearchWorkstream(...)
4. update research path from report findings/gaps/suggestedNextMove
5. upsert working-paper section
6. add margin notes for gaps/criticisms
7. persist research workstream report
8. save state
9. notify workstream completed
```

Preserve these existing behaviors:

```text
- missing explicit path warns and does not update anything
- abandoned path is not continued
- default continue uses focused path when no explicit path is requested
- numbered path steering works
```

### Task 7: Implement `show latest report` for research workstream reports

Inspect current handling for:

```text
show latest report
```

Preserve existing proof-validation/source-audit behavior.

Add research behavior only when the latest durable report is a research workstream report or when the current state has research paths and a latest research report.

Expected:

```text
show latest report
```

prints the full structured report from the latest research workstream.

If the latest report is still a source-audit report, preserve existing behavior.

### Task 8: Optional `show details for path N`

If implementation remains simple, add:

```text
show details for path 2
show report for path 2
```

This should find the latest research workstream report for that path.

If this adds too much complexity, skip it and document as future work. Do not overbuild.

### Task 9: Add unit tests for workstream module

Create:

```text
packages/coding-agent/test/comath-research-workstream.test.ts
```

Test:

```text
1. direct proof path includes coordinator, specialist, critic, and synthesis steps.
2. direct proof critic catches lack of infinitude mechanism for n^2 + 1.
3. examples path preserves uncertainty that examples do not prove infinitude.
4. known theorem path requests source-backed literature verification.
5. report contains workingPaperSummary and suggestedNextMove.
```

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/comath-research-workstream.test.ts
```

### Task 10: Update smoke documentation

Modify:

```text
docs/comath-research-exploration-smoke.md
```

Add a section:

```text
Research workstream smoke
```

Include simple manual steps:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
continue path 2
show latest report
summarize current state
continue path 99
```

Expected good signs:

```text
- workstream started/progress/completed output appears
- completion includes promising strategy, review, gap, next move
- latest report includes coordinator/specialist/critic/synthesis
- summary remains compact
- path 99 warns and does not create a report
```

---

## Validation Commands

Run focused tests from package root:

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
  test/comath-research-workstream.test.ts
```

Then from repo root:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

Do not run full `npm test` unless the user specifically asks.

---

## Manual Product Smoke

From a clean folder:

```bash
rm -rf /tmp/comath-workstream-demo
mkdir -p /tmp/comath-workstream-demo
cd /tmp/comath-workstream-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Type:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
```

Then:

```text
continue path 2
```

Then:

```text
show latest report
```

Then:

```text
summarize current state
```

Then:

```text
continue path 99
```

Good signs:

```text
- `continue path 2` shows workstream started/progress/completed.
- completion includes promising strategy, review, gap, next, and working-paper update.
- `show latest report` shows coordinator brief, specialist attempt, critic review, and synthesis.
- output avoids raw IDs and backend terms.
- summary is compact and mentions latest findings/gaps without dumping full report.
- `continue path 99` warns and does not create another report.
```

Optional state check:

```bash
python3 -c 'import json, pathlib; p=pathlib.Path(".pi/co-math/state.json"); s=json.loads(p.read_text()); print("paths", len(s.get("researchPaths", []))); print("reports", len(s.get("reports", []))); print("sections", len(s.get("workingPaperSections", []))); print("notes", len(s.get("marginNotes", [])))'
```

Expected:

```text
5 paths
at least 1 durable research report or equivalent persisted report record
at least 1 working-paper section
at least 1 margin note/gap note
```

Adjust the state-check field names if the implementation uses a different existing report field, but the report must be durable in state.

---

## Acceptance Criteria

This milestone is acceptable only if all are true:

```text
1. `continue path N` creates a durable structured research workstream report.
2. Workstream report includes coordinator, specialist, critic, and synthesis content.
3. Normal output uses progressive disclosure and avoids raw backend/debug terms.
4. `show latest report` displays the structured research report.
5. Path state is updated with synthesized findings/gaps/next move.
6. Working paper is updated from synthesis, not raw role chatter.
7. Margin notes or blockers capture critic gaps/uncertainties.
8. `continue path 99` still warns and creates no report.
9. Existing proof-validation/latest-report behavior is not broken.
10. Focused co-math tests pass.
11. `npm run check` passes.
12. `git diff --check` passes.
13. Manual TUI smoke passes from a clean folder.
```

---

## Risks and Pitfalls

### Risk: Overbuilding async infrastructure

Do not implement real async/parallel execution in this milestone. Synchronous deterministic workstream execution is enough.

### Risk: Raw internal logs leak into UX

The paper’s architecture uses progressive disclosure. Normal output should be curated.

Bad:

```text
Created role-run-3 for workstream-path-2; queued artifact report-4.
```

Good:

```text
Research workstream completed. Say "show latest report" for details.
```

### Risk: Duplicate state models

Before adding new arrays or types, inspect existing reports/artifacts/events. Reuse what fits.

### Risk: Breaking validation mode

This feature is for research exploration paths. Validation mode must still work with source-audit reports.

### Risk: Mathematical overclaiming

The critic should prevent overclaims. If a proof is incomplete, say so plainly.

---

## Suggested Future Milestones After This

Do not implement these now, but keep the design compatible with them:

```text
1. True background/async research workstreams.
2. Multiple workstreams running in parallel.
3. Source-backed literature specialist for Path 5.
4. Human-in-the-loop roadblock prompts.
5. Rich working-paper export with report provenance.
6. Long-running steerable research sessions.
```

---

## Claude Code Handoff Prompt

You can give Claude Code this prompt:

```text
Implement docs/claude-comath-research-workstreams-plan.md.

Use the current branch in /home/hermes/developer/pi-mono-comath. Do not commit or push unless asked.

The goal is a bounded vertical slice of the Google co-mathematician paper architecture: `continue path N` should create a durable coordinator-managed research workstream with coordinator brief, specialist attempt, critic review, synthesis, working-paper update, and progressive-disclosure TUI output. Preserve existing proof-validation mode, research exploration mode, deterministic path execution behavior where useful, numbered path steering, and `continue path 99` warning behavior.

Run the focused co-math vitest command from the plan, then `npm run check`, then `git diff --check`, and do the manual TUI smoke from a clean `/tmp/comath-workstream-demo` folder. Report changed files, tests, smoke results, and any limitations. Do not commit.
```

---

## Final Report Requirements for Claude Code

When done, report:

```text
- files changed
- how research workstream reports are stored
- how `show latest report` chooses research vs validation reports
- exact tests run and pass/fail result
- npm run check result
- git diff --check result
- manual TUI smoke result
- any known limitations or skipped optional tasks
- confirmation that no commit was made
```
