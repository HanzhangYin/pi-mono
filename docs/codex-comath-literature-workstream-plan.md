# Co-Math Source-Backed Literature Workstreams Implementation Plan

> **For Codex:** Implement this plan on `/home/hermes/developer/pi-mono-comath` from the current `comath/research-exploration-mode` branch. Do not commit or push unless explicitly asked. Stage only files you change if the user later asks for a commit.

**Goal:** Add a source-backed literature/reference research workstream for co-math exploration, focused first on `Known theorem or literature reduction` paths, with durable source artifacts, provenance-aware reports, and no fabricated citations.

**Architecture:** Build on the current async research workstream lifecycle. Add a bounded literature workstream path that discovers or accepts references, records structured source artifacts in state, runs model-backed source-aware specialist/critic/synthesizer stages, and attaches references/provenance to incremental and final reports. Keep normal specialist/critic/synthesizer workstreams, deterministic fallback, stale-run recovery, and proof-validation mode intact.

**Tech Stack:** TypeScript, existing Pi co-math harness/state/storage/progress modules, existing `pi --mode json -p --no-session` model executor pattern, existing async research run lifecycle, Vitest. Prefer no new npm dependencies. Use fake source lookup/executor in unit tests; no unit test should call the network or a real model provider.

---

## Motivation

The current co-math implementation now supports the first two major layers of the paper-style architecture:

```text
Explore problem
→ create research paths
→ continue path N
→ async research workstream
→ coordinator/specialist/critic/synthesizer stages
→ incremental reports while running
→ durable final report
→ stale interrupted-run handling
```

The next architectural layer from `docs/2605.06651v2.pdf` is not simply “more model calls.” The paper emphasizes workstreams that use external tools and produce reviewed reports with:

```text
- exact references
- attachments
- provenance of claims
- warnings when evidence is weak
- distinction between sourced facts and model speculation
```

In the paper walkthrough, the first goal is a literature review workstream:

```text
Goal 1: Literature Review
- discover key papers
- query references directly
- identify exact statements and proofs
- attach references to the workstream report
```

For Pi/co-math, the natural bounded milestone is:

```text
Path 5: Known theorem or literature reduction
→ source-backed literature/reference workstream
```

This matters because current model-backed reports can say useful things about twin primes, Chen’s theorem, bounded gaps, etc., but they still do not record where those claims came from. A co-mathematician should make source support explicit.

---

## Expected End Result

From a clean folder:

```bash
cd /tmp
mkdir comath-literature-workstream-demo
cd comath-literature-workstream-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Explore this problem: Are there infinitely many twin primes?
```

Pi creates research paths as today.

User types:

```text
continue path 5
```

Expected: Pi starts an async literature/reference workstream because Path 5 is `Known theorem or literature reduction`.

Early output:

```text
Research workstream started

Path 5: Known theorem or literature reduction

Current status
- Coordinator is identifying what needs source support.
- Literature specialist is looking for relevant known theorems and references.

You can keep steering while it runs. Try: "show progress", "show latest report", or "summarize current state".
```

Then user types:

```text
show progress
```

Expected while running:

```text
Research workstream running

Path 5: Known theorem or literature reduction

Current stage
Literature search

Latest incremental report
- Looking for references related to the twin-prime conjecture.
- Separating exact twin-prime infinitude from weaker bounded-gap results.
- Checking whether named results are actually relevant before citing them.
```

Final report should be source-aware:

```text
Research workstream completed

Path 5: Known theorem or literature reduction

Relevant known results
- The twin-prime conjecture remains open. [source-1]
- Bounded prime gaps are known, but they do not imply gaps exactly 2. [source-2]
- Chen’s theorem gives infinitely many primes p for which p+2 is prime or semiprime. [source-3]

Source-backed distinctions
- Do not conflate bounded prime gaps with twin-prime infinitude.
- Do not present Chen/Maynard/GPY as a proof of the twin-prime conjecture.

References
- source-1: <title/source/url or local path>
- source-2: <title/source/url or local path>
- source-3: <title/source/url or local path>

Next
Use the literature findings to revise the direct-proof path, or create a weaker bounded-gap path.

Details
- Say "show latest report" to inspect source support and critique.
```

`show latest report` should display source/provenance details:

```text
Latest research report

Path 5: Known theorem or literature reduction

Coordinator brief
...

Literature findings
- Claim: bounded gaps are weaker than twin-prime infinitude.
  Support: source-2

Critic review
- No source in this report proves the twin-prime conjecture.
- Any uncited model statements are marked as unsourced.

References / attachments
- source-1: ...
- source-2: ...
```

---

## Non-Goals

Do not implement:

```text
- full autonomous literature review across arbitrary databases
- paid API integrations
- browser automation
- formal theorem proving
- citation management UI
- complete BibTeX export
- parallel multi-workstream scheduling
- code-execution or computational search workstreams
```

Do not remove or regress:

```text
- normal model-backed research workstreams for paths 1-4
- async run lifecycle and stale-run recovery
- deterministic fallback
- proof-validation/source-audit mode
- existing `show latest report` behavior
```

If reliable web/source lookup is unavailable in the Pi runtime, the workstream must degrade safely:

```text
- ask the user for source references or a source file
- mark literature claims as unsourced
- do not fabricate citations
```

---

## Current Context

Recent commits to build on:

```text
9725b2c7 feat(coding-agent): add model-backed co-math workstreams
bc8aa817 feat(coding-agent): run co-math research asynchronously
```

Important current files:

```text
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
packages/coding-agent/src/modes/comath/comath-research-model-executor.ts
packages/coding-agent/src/modes/comath/comath-research-model-workstream.ts
packages/coding-agent/src/modes/comath/comath-research-workstream.ts
packages/coding-agent/test/co-math-state.test.ts
packages/coding-agent/test/comath-harness.test.ts
packages/coding-agent/test/comath-progress.test.ts
packages/coding-agent/test/comath-research-model-workstream.test.ts
packages/coding-agent/test/comath-research-workstream.test.ts
```

Before editing, inspect the current code. Do not guess helper names.

---

## Design Overview

Add three things:

```text
1. Structured source/reference artifacts in co-math state.
2. A source lookup/extraction abstraction that is fakeable in tests.
3. Literature-specific staged workstream behavior for `Known theorem or literature reduction` paths.
```

### State: source artifacts and report references

Extend co-math state with structured literature artifacts. Exact names can vary to match repo style, but use explicit fields rather than prose-only references.

Suggested types:

```ts
export type LiteratureSourceKind = "web" | "paper" | "book" | "local-file" | "user-provided" | "unknown";

export interface LiteratureSourceArtifact {
	id: string;
	kind: LiteratureSourceKind;
	title: string;
	url?: string;
	path?: string;
	authors?: string[];
	year?: string;
	summary: string;
	extractedText?: string;
	createdAt: string;
}

export interface LiteratureClaimSupport {
	claim: string;
	sourceIds: string[];
	status: "supported" | "partially-supported" | "unsupported" | "conflicting";
	note?: string;
}
```

Add to project state:

```ts
literatureSources: LiteratureSourceArtifact[];
literatureClaimSupports: LiteratureClaimSupport[];
```

Or, if there is already a generic `artifacts` model that can safely represent this, use that existing mechanism but ensure all source facts are structured, not only prose in `summary`.

### Workstream report references

Extend research report records with optional source metadata:

```ts
sourceIds?: string[];
claimSupports?: LiteratureClaimSupport[];
```

If changing the core research report type is too broad, add a literature-specific field to `ResearchWorkstreamReportRecord` only, still optional.

### Source lookup abstraction

Create a fakeable interface. Suggested file:

```text
packages/coding-agent/src/modes/comath/comath-literature-source.ts
```

Suggested types:

```ts
export interface LiteratureSourceQuery {
	rootQuestion: string;
	pathTitle: string;
	pathObjective: string;
	maxSources: number;
}

export interface LiteratureSourceResult {
	title: string;
	url?: string;
	kind?: LiteratureSourceKind;
	summary: string;
	extractedText?: string;
	authors?: string[];
	year?: string;
}

export interface LiteratureSourceLookup {
	search(query: LiteratureSourceQuery): Promise<LiteratureSourceResult[]>;
}
```

Production source lookup can be minimal for this milestone:

```text
- if no lookup backend is available, return [] and let the model/report say sources are needed
- optionally support curated built-in source hints for smoke examples only if clearly marked as fallback hints, not fabricated live citations
```

Do not add real web/network calls unless the repo already has a safe established pattern and tests can avoid it.

---

## Implementation Tasks

### Task 1: Inspect existing artifact/source state and co-math report persistence

Objective: Decide whether to add new literature-specific state fields or reuse existing artifact fields.

Read:

```text
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
```

Search for:

```text
artifacts
sourcePath
source
report
researchReports
claim
provenance
```

Decision rule:

```text
If existing artifacts already support source path/url/title/content cleanly, reuse them.
Otherwise add explicit `literatureSources` and `literatureClaimSupports` fields.
```

### Task 2: Add source/provenance state schema

Modify:

```text
packages/coding-agent/examples/extensions/co-math/schema.ts
```

Add source artifact and claim-support types.

Add default arrays to `CoMathProjectState`:

```ts
literatureSources: LiteratureSourceArtifact[];
literatureClaimSupports: LiteratureClaimSupport[];
```

or equivalent if reusing existing artifact model.

Requirements:

```text
- old states normalize cleanly with empty arrays
- source artifacts have stable ids like `source-1`, `source-2`
- source support links use ids, not only titles/URLs in prose
```

### Task 3: Add storage helpers for source artifacts

Modify:

```text
packages/coding-agent/examples/extensions/co-math/storage.ts
```

Add helpers like:

```ts
export function addLiteratureSourceArtifact(...): CoMathProjectState;
export function addLiteratureClaimSupport(...): CoMathProjectState;
export function getLiteratureSourcesForReport(...): LiteratureSourceArtifact[];
export function getLiteratureClaimSupportsForReportOrPath(...): LiteratureClaimSupport[];
```

Requirements:

```text
- no mutation of input state
- duplicate URLs/titles should not create duplicate sources if easy to avoid
- helpers append events with product-safe summaries
- normalization handles old states
```

### Task 4: Add state tests

Modify:

```text
packages/coding-agent/test/co-math-state.test.ts
```

Tests:

```text
1. empty state includes source/provenance arrays.
2. legacy state without those arrays normalizes to empty arrays.
3. addLiteratureSourceArtifact creates stable `source-1` id.
4. duplicate source URL is de-duplicated or clearly allowed by tested behavior.
5. addLiteratureClaimSupport links a claim to source ids.
6. research report can link sourceIds / claimSupports if the chosen design includes report-level links.
```

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts
```

### Task 5: Create fakeable literature source lookup interface

Create:

```text
packages/coding-agent/src/modes/comath/comath-literature-source.ts
```

Implement:

```text
- LiteratureSourceLookup interface
- NullLiteratureSourceLookup or createDefaultLiteratureSourceLookup
- helpers to convert lookup results into state source artifacts
```

Default behavior for this milestone can be conservative:

```text
If no source lookup backend is configured, return [] and make the workstream ask for sources rather than fabricating citations.
```

Do not call network from tests.

### Task 6: Add source-aware literature model prompts

Create or extend:

```text
packages/coding-agent/src/modes/comath/comath-literature-workstream.ts
```

or extend:

```text
packages/coding-agent/src/modes/comath/comath-research-model-workstream.ts
```

Prefer a separate file if the logic becomes distinct.

Add a staged function like:

```ts
export interface RunLiteratureResearchWorkstreamInput {
	rootQuestion: string;
	path: ResearchPath;
	allPaths: readonly ResearchPath[];
	now: string;
	executor: ResearchWorkstreamModelExecutor;
	sourceLookup: LiteratureSourceLookup;
}

export interface LiteratureResearchWorkstreamResult {
	report: ResearchWorkstreamReport;
	sources: LiteratureSourceResult[];
	claimSupports: LiteratureClaimSupport[];
}

export async function runLiteratureResearchWorkstreamStaged(...): Promise<LiteratureResearchWorkstreamResult>;
```

Stage sequence:

```text
coordinator: identify source questions
literature-search: lookup sources or record none available
specialist: summarize source-backed known results
critic: check overclaims, unsupported claims, fabricated citations
synthesizer: produce final source-aware report
```

You may reuse existing `specialist`, `critic`, `synthesizer` roles, but progress copy should call the source stage `Literature search`.

Prompt requirements:

```text
- distinguish sourced facts from model background knowledge
- never fabricate citations
- if sources are absent, say so and ask for references
- for famous open problems, do not claim a theorem settles them unless source text supports it
- use source ids like [source-1]
```

### Task 7: Add literature-workstream tests with fake lookup and fake executor

Create:

```text
packages/coding-agent/test/comath-literature-workstream.test.ts
```

Tests:

```text
1. lookup receives root question and path objective.
2. fake source results are passed into specialist/critic/synthesizer prompts.
3. final report includes source ids for supported claims.
4. absent sources produce a safe “sources needed” report, not fake citations.
5. critic prompt asks to flag unsupported or overclaimed references.
6. twin-prime fake sources distinguish twin-prime conjecture, Chen theorem, and bounded gaps.
```

No real model/network calls.

### Task 8: Route Path 5 / known theorem paths to literature workstream

Modify:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
```

When `continue path N` starts a research run:

```text
if selected path title/objective is literature-like:
  run literature workstream staged
else:
  run normal model-backed research workstream staged
```

Literature-like detection should be simple and tested:

```text
Known theorem or literature reduction
literature
known theorem
reference
source
```

Do not rely only on path number `5`; use the path title/objective so this works after user-created paths.

Constructor option:

```ts
literatureSourceLookup?: LiteratureSourceLookup;
```

Production can pass a conservative default lookup.

### Task 9: Persist source artifacts and link them to reports

Modify harness persistence flow.

On literature workstream completion:

```text
1. add source artifacts to state
2. add claim supports to state
3. persist final report with sourceIds / claimSupports links
4. mark run completed and link finalReportId
5. update working paper with source-aware summary
```

During incremental stages:

```text
- literature-search stage should save an incremental report listing found source titles or “no sources available yet”
```

Important:

```text
Do not only mention source titles in report prose. Save structured source artifacts in state.
```

### Task 10: Add progress and report formatting for references

Modify:

```text
packages/coding-agent/src/modes/comath/comath-progress.ts
```

Update final and running report formatters to include reference summaries when available:

```text
References
- source-1: Title — URL/path
- source-2: Title — URL/path
```

Normal output can show short source ids if they are user-facing attachment labels (`source-1`) and not raw internal ids like `research-run-1`.

Formatter requirements:

```text
- no raw JSON or internal executor details
- no fabricated “citation” formatting when source URL/title missing
- unsupported claims marked clearly
```

### Task 11: Add harness tests for literature routing and persistence

Modify:

```text
packages/coding-agent/test/comath-harness.test.ts
```

Use fake source lookup and deferred fake executor.

Tests:

```text
1. `continue path 5` starts a literature workstream, not normal direct workstream.
2. `show progress` while lookup/specialist is running shows Literature search / source-aware status.
3. source artifacts are persisted in state after lookup/final completion.
4. final report links source ids.
5. `show latest report` displays references.
6. absent lookup results produce safe no-source warning and no fake citations.
7. non-literature paths still use normal model-backed research workstream.
8. stale-run recovery still works for literature workstreams.
```

### Task 12: Add progress formatter tests

Modify:

```text
packages/coding-agent/test/comath-progress.test.ts
```

Tests:

```text
1. report formatter shows source/reference section.
2. unsupported claims are visible as unsupported.
3. normal product copy does not leak raw run ids or executor details.
4. active literature run progress says Literature search or Source review naturally.
```

### Task 13: Update smoke documentation

Modify:

```text
docs/comath-research-exploration-smoke.md
```

Add section:

```text
Source-backed literature workstream smoke
```

Manual steps:

```bash
cd /tmp
mkdir comath-literature-workstream-demo-1
cd comath-literature-workstream-demo-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Explore this problem: Are there infinitely many twin primes?
continue path 5
show progress
show latest report
summarize current state
```

Good signs:

```text
- Path 5 starts a literature/reference workstream.
- Progress mentions literature/source review.
- Report distinguishes twin-prime conjecture from bounded gaps/Chen-type results.
- Sources/references are structured in state if lookup provided any.
- If no lookup is available, report asks for sources and marks claims unsourced instead of inventing citations.
```

Add state inspection command:

```bash
python3 -c 'import json, pathlib; p=pathlib.Path(".pi/co-math/state.json"); print("exists", p.exists());
if p.exists():
 s=json.loads(p.read_text()); print("sources", len(s.get("literatureSources", []))); print("claimSupports", len(s.get("literatureClaimSupports", []))); print("runs", len(s.get("researchWorkstreamRuns", []))); print("reports", len(s.get("researchReports", [])));
 [print("source", src.get("id"), src.get("title"), src.get("url") or src.get("path") or src.get("kind")) for src in s.get("literatureSources", [])]
'
```

Adjust field names if implementation reuses `artifacts` instead of `literatureSources`.

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
  test/comath-literature-workstream.test.ts
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
mkdir comath-literature-workstream-demo-1
cd comath-literature-workstream-demo-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Explore this problem: Are there infinitely many twin primes?
continue path 5
show progress
show latest report
summarize current state
```

Good outcome if source lookup is configured:

```text
- literature workstream starts asynchronously
- progress mentions source/literature review
- references/source artifacts are saved
- final report distinguishes twin-prime conjecture, Chen theorem, and bounded gaps
- report does not claim a proof of twin-prime infinitude
```

Good outcome if source lookup is not configured:

```text
- literature workstream still runs or safely blocks
- report says sources are needed / unavailable
- no fake citations are created
- state records zero sources or user-needed source status explicitly
```

---

## Acceptance Criteria

Implementation is acceptable only if:

```text
1. Literature/source artifacts are represented in structured state, not prose only.
2. Old states normalize without source/provenance fields.
3. Source lookup is fakeable and tests do not call network or real providers.
4. Literature-like paths route to a source-aware workstream.
5. Non-literature paths still use the normal research workstream.
6. Literature workstream runs asynchronously using the existing run lifecycle.
7. Incremental reports include a literature/source stage.
8. Final reports link source ids or explicitly mark claims unsupported.
9. `show latest report` displays references/provenance naturally.
10. No fabricated citations appear when no sources are available.
11. Twin-prime smoke distinguishes exact twin-prime infinitude from bounded gaps/Chen-type results.
12. Stale-run recovery still works.
13. Focused test command passes.
14. `npm run check` passes.
15. `git diff --check` passes.
16. Manual smoke result is reported with whether real source lookup was used or safe no-source fallback was used.
```

---

## Risks and Pitfalls

### Fabricated citations

This is the main risk. If source lookup returns no sources, the workstream must not invent titles, URLs, theorem names, or publication details. It may use general mathematical background only if marked unsourced.

### Prose-only provenance

A report line like “Source: Wikipedia” is not enough. Source support must be stored in structured state with ids and linked claims/reports.

### Overclaiming source support

A source about bounded prime gaps does not support the twin-prime conjecture. Critic prompts and tests must catch this distinction.

### Web/network fragility

Do not make tests depend on network. Production lookup can be conservative or disabled if a robust existing network path is unavailable.

### UX clutter

Normal product output should show references compactly. Detailed source excerpts belong in `show latest report`, not the default completion summary.

---

## Suggested Codex Prompt

```text
Implement docs/codex-comath-literature-workstream-plan.md.

Use /home/hermes/developer/pi-mono-comath on the current comath/research-exploration-mode branch. Do not commit or push unless asked.

Goal: add a source-backed literature/reference co-math research workstream for literature-like paths, especially “Known theorem or literature reduction”. Build on the existing async research workstream lifecycle. The workstream should record structured source artifacts/provenance in state, distinguish sourced claims from unsupported model claims, and avoid fabricated citations. Use fake source lookup and fake model executors in tests; no unit test may call the network or a real provider.

Run the focused co-math test command from the plan, then `npm run check`, then `git diff --check`. Do a manual TUI smoke from a fresh temp folder. Report changed files, source/provenance state fields added, whether production source lookup is real or safe no-source fallback, exact tests run, smoke result, and limitations. Do not commit.
```

---

## Final Report Requirements for Codex

When done, report:

```text
- files changed
- source/provenance state fields/helpers added
- how literature-like paths are detected
- how source lookup works in production
- how source lookup is faked in tests
- how reports link sources/claim supports
- how unsupported claims are represented
- behavior when no sources are available
- exact tests run and results
- npm run check result
- git diff --check result
- manual smoke result
- known limitations
- confirmation that no commit was made
```
