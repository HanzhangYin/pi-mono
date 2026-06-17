# Co-Math Working-Paper Scrutiny Highlights Implementation Plan

> For Claude Code: implement this plan task-by-task. Do not commit unless the user explicitly asks. Keep changes focused and verify with the commands below.

## Motivation

The current co-math paper alignment matrix has one remaining `PARTIAL` item: living working-paper sections preserve margin notes, gaps, and warnings, but there is no dedicated user-facing surface for paper-style "this part warrants human scrutiny" highlights. The paper (`docs/2605.06651v2.pdf`) emphasizes a living working paper with inline/margin annotations that communicate uncertainty and direct human attention. This milestone closes that gap without adding new autonomy, web search, or formal proving.

## Expected End Result

A beginner or developer can inspect the working paper and immediately see a distinct scrutiny layer:

```text
/comath paper
```

Expected visible behavior:

```text
## Human scrutiny highlights
- paper-section-1: Gap — A finite computation does not prove an infinite claim.
- paper-section-1: Warning — Literature claim is unsupported by registered sources.
```

And export preserves the same information:

```text
/comath export-paper .pi/co-math/working-paper.md --force
```

Expected file content includes:

```text
## Human scrutiny highlights
```

No claim is promoted to proved or synthesis-eligible because of a highlight. Highlights are attention/provenance markers only.

## Current Context

- Branch: `comath/research-exploration-mode`
- Latest checkpoint commit: `12128806 feat(coding-agent): add co-math paper alignment checkpoint`
- Current alignment gap: `docs/codex-comath-paper-workflow-alignment-matrix.md`, criterion 6.
- Existing state already has:
  - `WorkingPaperSection.marginNoteIds` in `packages/coding-agent/examples/extensions/co-math/schema.ts`
  - `MarginNote.kind` with `gap | todo | warning | provenance | comment`
  - `addMarginNote` and `resolveMarginNote` in `storage.ts`
  - working-paper render/export in `commands.ts`
  - research report persistence that creates gap/warning margin notes in `comath-harness.ts`

## Non-goals

- Do not add live web/arXiv search.
- Do not add formal prover integration.
- Do not add a new autonomous loop.
- Do not promote unsupported claims.
- Do not expose raw IDs in beginner product output unless already on developer `/comath` surfaces.
- Do not refactor unrelated co-math architecture.

## Proposed Approach

Use the existing margin-note mechanism, not a parallel state array. Add a new margin-note kind:

```ts
export type MarginNoteKind = "gap" | "todo" | "warning" | "provenance" | "comment" | "scrutiny";
```

Then render open notes whose kind is `scrutiny`, `gap`, or `warning` as a distinct "Human scrutiny highlights" section in paper/export surfaces. This keeps persistence simple and makes highlights first-class in presentation without schema churn.

For automated research workstream reports, create at least one `scrutiny` margin note when a report has gaps, criticisms, blockers, or human-help items. Existing `gap` and `warning` notes remain intact.

## Implementation Tasks

### Task 1: Add `scrutiny` as a margin-note kind

Objective: Make scrutiny highlights a first-class typed note kind.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/schema.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts` or the nearest existing storage/command test that constructs margin notes

Steps:
1. Update `MarginNoteKind` in `schema.ts` to include `"scrutiny"`.
2. Update `normalizeMarginNoteKind` in `storage.ts` to preserve `"scrutiny"` instead of normalizing it to `"comment"`.
3. Add a regression test that loads or creates a scrutiny note and verifies the kind remains `scrutiny`.

Expected test focus:

```ts
expect(state.marginNotes.at(-1)?.kind).toBe("scrutiny");
```

### Task 2: Render a dedicated scrutiny section in `/comath paper` and export

Objective: Make the working paper visibly show human-attention items as a separate section.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

Implementation guidance:
1. Add a helper near existing paper rendering helpers:

```ts
function formatHumanScrutinyHighlights(state: CoMathProjectState): string[] {
	const highlights = state.marginNotes
		.filter((note) => note.status === "open" && isHumanScrutinyNoteKind(note.kind))
		.map((note) => formatHumanScrutinyHighlight(state, note));
	return highlights.length === 0 ? ["No human scrutiny highlights are open."] : highlights;
}

function isHumanScrutinyNoteKind(kind: MarginNoteKind): boolean {
	return kind === "scrutiny" || kind === "gap" || kind === "warning";
}
```

2. Keep the helper type-safe with top-level imports only. Do not use inline `import("...").Type`.
3. Add this section to `buildLivingWorkingPaperMarkdown` before `## Working paper sections` or immediately after it:

```ts
"## Human scrutiny highlights",
...formatHumanScrutinyHighlights(state),
"",
```

4. Ensure each highlight includes:
   - section title or section id when available
   - note kind
   - message
   - resolved notes are omitted

Example output shape:

```text
- paper-section-1: Gap — Need a written lemma for the endpoint case.
```

Tests:
- Create a state with a working-paper section and open `scrutiny`, `gap`, and `warning` margin notes.
- Assert `/comath paper` contains `Human scrutiny highlights` and the note messages.
- Assert resolved notes do not appear in the highlight section.
- Assert ordinary `comment` notes stay in `Open margin notes` but not in `Human scrutiny highlights`.

### Task 3: Create scrutiny notes from research report uncertainty

Objective: Completed or blocked research workstream reports should automatically add explicit human-scrutiny attention markers.

Files:
- Modify: `packages/coding-agent/src/modes/comath/comath-harness.ts`
- Test: `packages/coding-agent/test/comath-harness.test.ts`

Implementation guidance:
1. In `persistResearchWorkstreamReport`, after the working-paper section is found, derive scrutiny candidates from:
   - `report.gaps`
   - `report.criticisms`
   - `report.humanHelpUseful`
   - optionally `report.status === "blocked"`
2. Keep the existing gap/warning margin-note creation.
3. Add at most one or two `scrutiny` notes per report to avoid noisy output. Prefer the clearest human-facing item:

```ts
const scrutinyMessage = report.humanHelpUseful[0] ?? report.gaps[0] ?? report.criticisms[0];
if (scrutinyMessage) {
	nextState = addMarginNote(nextState, {
		id: `margin-note-${nextState.marginNotes.length + 1}`,
		kind: "scrutiny",
		subjectId: path.id,
		...(section ? { sectionId: section.id } : {}),
		message: scrutinyMessage,
		now,
		actor: "reviewer",
	});
}
```

4. Avoid duplicate messages when the same exact text is already present as an open margin note on that section. If necessary, add a small local helper in `comath-harness.ts` that checks `nextState.marginNotes` for same `sectionId`, `kind`, and `message`.

Tests:
- Existing research workstream persistence test should assert a `scrutiny` margin note is created when gaps or human-help items exist.
- Assert the note is linked to the working-paper section via `sectionId` and the section includes the note id.

### Task 4: Surface scrutiny in product report/progress copy without exposing debug terms

Objective: Beginner-facing report/progress surfaces should communicate where human review is useful without making the default output feel like a debug extension.

Files:
- Modify: `packages/coding-agent/src/modes/comath/comath-progress.ts`
- Test: `packages/coding-agent/test/comath-progress.test.ts`

Implementation guidance:
1. In detailed `show latest report` output, add a concise section when `report.humanHelpUseful`, `report.gaps`, or linked scrutiny notes exist:

```text
Needs human attention
- ...
```

2. Keep default completion output concise. Do not add raw IDs to the beginner completion path.
3. If the current detailed report already has `Gap` and `Human help useful`, either:
   - rename/augment one to `Needs human attention`, or
   - add a short line under `Details` pointing to `/comath paper` for scrutiny highlights.
4. Do not duplicate the same bullet three times.

Tests:
- `formatResearchWorkstreamReport` includes `Needs human attention` or equivalent when gaps/human-help exist.
- The completion summary remains concise and still ends with an executable next step.

### Task 5: Update alignment docs and smoke docs

Objective: Mark the paper-alignment criterion as satisfied and document the manual smoke.

Files:
- Modify: `docs/codex-comath-paper-workflow-alignment-matrix.md`
- Modify: `docs/comath-research-exploration-smoke.md`

Required doc changes:
1. Update criterion 6 from `PARTIAL` to `PASS` only after tests prove the dedicated highlight surface exists.
2. Change the criterion 6 code path to mention:
   - `MarginNoteKind` includes `scrutiny`
   - `/comath paper` / `/comath export-paper` render `Human scrutiny highlights`
   - `comath-harness.ts` creates scrutiny notes from report uncertainty
3. Remove or update the note saying criterion 6 is partial.
4. Add a manual smoke section:

```text
/comath paper
/comath export-paper .pi/co-math/working-paper.md --force
```

Expected substrings:

```text
Human scrutiny highlights
No claim is promoted to proved by a highlight
```

### Task 6: Add or extend the checkpoint test

Objective: Keep the one-shot checkpoint proving this paper-alignment invariant.

Files:
- Modify: `packages/coding-agent/test/comath-paper-alignment-checkpoint.test.ts`

Test shape:
1. Add assertions to the existing working-paper/margin-note block if present, or add a sixth test if cleaner.
2. Construct a state/report with an open scrutiny note linked to a section.
3. Verify:
   - paper/export formatting includes `Human scrutiny highlights`
   - unsupported claims remain not synthesis-eligible
   - resolved notes do not count as open highlights

Keep the checkpoint deterministic. No network, no real provider API, no paid tokens.

## Validation Commands

Run from repo root unless noted.

Targeted tests from package root:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/comath-paper-alignment-checkpoint.test.ts
node ../../node_modules/vitest/dist/cli.js --run test/comath-harness.test.ts test/comath-progress.test.ts test/co-math-extension.test.ts
```

Full required check after code changes:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

Do not run `npm test` or `npm run build` unless the user explicitly asks.

## Manual Product Smoke

Use a fresh folder. Do not delete existing user folders.

```bash
cd /tmp
mkdir comath-scrutiny-highlights-demo-1
cd comath-scrutiny-highlights-demo-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi, type one message at a time:

```text
Are there infinitely many primes of the form n^2 + 1?
please continue path 1
show latest report
/comath paper
/comath export-paper .pi/co-math/working-paper.md --force
```

Good result:
- Research starts from the bare math question.
- Path 1 completes or blocks with uncertainty preserved.
- `show latest report` points to human attention/gaps without claiming finite computation proves the infinite statement.
- `/comath paper` contains `Human scrutiny highlights`.
- exported markdown contains `Human scrutiny highlights`.
- unsupported or uncertain claims remain unsupported/needs-review.

Bad result:
- Highlight text promotes a claim to proved.
- Highlights only appear in raw debug output and not the working paper/export.
- Resolved notes still show as open scrutiny highlights.
- Beginner output is dominated by internal IDs or extension jargon.

## Risks and Tradeoffs

- Reusing `MarginNoteKind` is intentionally minimal. It avoids a schema migration but means highlights are a presentation layer over notes, not a separate artifact class.
- Auto-generating too many scrutiny notes can make the paper noisy. Cap generated scrutiny notes per report and deduplicate exact messages.
- `gap` and `warning` already imply attention. The dedicated section should group them for human scanning without removing the original detailed sections.
- Updating the matrix to PASS is only justified if paper/export and checkpoint tests cover the new section.

## Suggested Claude Code Prompt

```text
Implement docs/claude-comath-scrutiny-highlights-plan.md exactly. Keep the milestone bounded: add first-class human scrutiny highlights using the existing margin-note mechanism, surface them in /comath paper and export, generate them from research report uncertainty, update the alignment/smoke docs, and add deterministic tests. Do not add web search, formal proving, or new autonomy. Do not commit unless I ask. Run the targeted Vitest commands, npm run check, and git diff --check before reporting back.
```
