# Co-Math Living Working Paper and Margin Notes Implementation Plan

> **For Hermes:** This is the next bounded phase after `docs/co-math-background-dispatch-plan.md`. Use Codex only after the background-dispatch implementation is committed. Hermes owns architecture alignment with the co-math paper.

**Goal:** Add a persistent living working-paper layer with section drafts, source provenance, and margin-note-style open issues.

**Architecture:** Extend `.pi/co-math/state.json` with first-class working-paper sections and margin notes. Commands create, list, render, and annotate sections deterministically. The paper layer is a projection over reviewed state and human-authored draft text; it does not prove claims, promote claims, call models, or write LaTeX/PDF files.

**Tech Stack:** TypeScript, existing Pi coding-agent extension API, Vitest, existing co-math JSON state, no new dependencies.

---

## 0. Why this phase comes next

The current prototype now has:

```text
persistent workspace state
structured role output
artifact/event provenance
workstream lifecycle + run records
human steering + recovery
review rounds + claim revisions
queued dispatch
in-process background dispatch
```

The largest remaining architectural gap versus the AI co-math paper is the “living working paper”: a shared, evolving draft that exposes claims, proof status, warnings, provenance, and margin-note-style gaps without hiding uncertainty behind polished prose.

This phase should add that working-paper layer in the smallest useful form:

```text
working paper section records + source ids + margin notes + cautious render command
```

Do not implement LaTeX export, PDF generation, theorem prover integration, model-authored paper drafting, or automatic synthesis loops yet.

---

## 1. Framework alignment constraints

Source of truth: `/Users/hanzhangyin/Developer/2605.06651v2.pdf`, especially:

- a stateful shared workspace rather than stateless chat;
- a living working paper with provenance;
- margin notes / visible unresolved issues;
- progressive disclosure from polished summary to detailed evidence and warnings;
- explicit preservation of uncertainty, failed attempts, and proof gaps;
- caution against reviewer-pleasing polished text masking weak arguments.

Required commitments:

1. Paper sections are draft workspace records, not proof certificates.
2. Margin notes are first-class open issues attached to sections or workspace subjects.
3. Rendering must preserve uncertainty:
   - open margin notes are visible;
   - open warnings are visible;
   - unreviewed or non-synthesis-eligible claim sources are explicitly marked;
   - reviewed proved claims may be labeled as findings only if `isClaimSynthesisEligible` is true.
4. No model calls are introduced by paper commands.
5. No file export is introduced in this phase.
6. No LaTeX/PDF generation is introduced in this phase.
7. Existing proof/review/run/background invariants remain unchanged.

Unacceptable drift:

- paper command promotes a claim;
- paper command creates proof evidence;
- paper command resolves warnings or margin notes automatically;
- paper rendering hides open warnings;
- model-authored paper sections without review/provenance;
- external file writes;
- new dependencies;
- background scheduling or auto-dispatch changes.

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

- LaTeX export;
- markdown file export;
- PDF generation;
- SyncTeX;
- filesystem artifact creation;
- theorem prover integration;
- model-authored paper drafting;
- automatic section updates from background runs;
- automatic margin-note resolution;
- citations/bibliography management;
- section reordering UI beyond append order;
- rich editor integration;
- new dependencies.

This phase is state + commands + rendering only.

---

## 4. State model target

### 4.1 Schema additions

Modify `schema.ts`.

Add:

```ts
export type WorkingPaperSectionStatus = "draft" | "needs_revision" | "reviewed";
export type MarginNoteKind = "gap" | "todo" | "warning" | "provenance" | "comment";
export type MarginNoteStatus = "open" | "resolved";
```

Add event kinds:

```ts
| "working_paper_section_recorded"
| "margin_note_recorded"
| "margin_note_resolved"
```

Add records:

```ts
export interface WorkingPaperSection {
	id: string;
	title: string;
	body: string;
	status: WorkingPaperSectionStatus;
	sourceClaimIds: string[];
	sourceEvidenceIds: string[];
	sourceWarningIds: string[];
	sourceArtifactIds: string[];
	sourceReviewRoundIds: string[];
	sourceRoleRunIds: string[];
	marginNoteIds: string[];
	createdAt: string;
	updatedAt: string;
}

export interface MarginNote {
	id: string;
	kind: MarginNoteKind;
	status: MarginNoteStatus;
	subjectId: string;
	sectionId?: string;
	message: string;
	resolution?: string;
	createdAt: string;
	updatedAt: string;
	resolvedAt?: string;
}
```

Extend `CoMathProjectState`:

```ts
workingPaperSections: WorkingPaperSection[];
marginNotes: MarginNote[];
```

### 4.2 Legacy normalization

Modify `storage.ts` normalization so older state gets:

```ts
workingPaperSections: []
marginNotes: []
```

Do not infer or fabricate paper sections from existing synthesis, reports, claims, or artifacts.

---

## 5. Storage helpers

Modify `storage.ts`.

Add input interfaces and helpers:

```ts
export interface AddWorkingPaperSectionInput {
	id: string;
	title: string;
	body: string;
	status?: WorkingPaperSectionStatus;
	sourceClaimIds?: string[];
	sourceEvidenceIds?: string[];
	sourceWarningIds?: string[];
	sourceArtifactIds?: string[];
	sourceReviewRoundIds?: string[];
	sourceRoleRunIds?: string[];
	now: string;
	actor: CoMathActor;
}

export function addWorkingPaperSection(...): CoMathProjectState
```

Semantics:

- trim title/body;
- require non-empty title and body;
- default status to `draft`;
- deduplicate source ids while preserving order;
- append section;
- emit `working_paper_section_recorded` event;
- update state `updatedAt`.

Add:

```ts
export interface AddMarginNoteInput {
	id: string;
	kind: MarginNoteKind;
	subjectId: string;
	sectionId?: string;
	message: string;
	now: string;
	actor: CoMathActor;
}

export function addMarginNote(...): CoMathProjectState
```

Semantics:

- trim message;
- require non-empty subject id and message;
- create open note;
- if `sectionId` matches a section, append note id to that section's `marginNoteIds`;
- emit `margin_note_recorded` event;
- do not create evidence/warnings/proof claims.

Add:

```ts
export interface ResolveMarginNoteInput {
	noteId: string;
	resolution: string;
	now: string;
	actor: CoMathActor;
}

export function resolveMarginNote(...): CoMathProjectState
```

Semantics:

- if missing note id, throw clear error;
- if already resolved, no-op or throw; prefer no-op with no new event to match warning-resolution provenance safeguards;
- require non-empty resolution;
- set status resolved, resolution, resolvedAt, updatedAt;
- emit `margin_note_resolved` only for a real open -> resolved transition.

---

## 6. Commands

Modify `commands.ts`.

### 6.1 Help text

Add:

```text
/comath paper-section <title>: <body> [--sources id1,id2] - record a working-paper section draft
/comath margin-note <subject-id> <gap|todo|warning|provenance|comment>: <note> - attach a margin note
/comath resolve-margin-note <note-id>: <resolution> - resolve an open margin note
/comath paper - render the current living working paper
/comath margin-notes [open|resolved|all] - list margin notes
```

### 6.2 `/comath paper-section`

Format:

```text
/comath paper-section <title>: <body> [--sources claim-1,evidence-1,warning-1,artifact-1,review-round-1,role-run-1]
```

Parsing requirements:

- colon separates title/body;
- optional ` --sources ` suffix is comma-separated;
- trim ids;
- ignore empty ids after splitting;
- classify known source ids by prefix and actual existence in state;
- unknown source ids should not be silently dropped; show an error listing unknown ids.

Behavior:

- create `paper-section-N` id;
- call `addWorkingPaperSection`;
- save state;
- notify:

```text
Recorded working-paper section paper-section-1: <title>
```

Do not call a role runner.
Do not inspect artifact file paths.
Do not promote claims.

### 6.3 `/comath margin-note`

Format:

```text
/comath margin-note <subject-id> <gap|todo|warning|provenance|comment>: <note>
```

Examples:

```text
/comath margin-note paper-section-1 gap: Need a lemma for the endpoint boundary case
/comath margin-note claim-1 warning: This claim depends on unresolved warning-2
/comath margin-note artifact-1 provenance: Computation script path is metadata only
```

Behavior:

- subject id may be a section, claim, evidence, warning, artifact, review round, role run, report, workstream, or `project`;
- if subject id is a paper section, also set `sectionId`;
- reject unknown subject ids except `project`;
- create `margin-note-N` id;
- save state;
- notify.

Do not create a `Warning` record; margin notes are paper annotations, not mathematical warning records.

### 6.4 `/comath resolve-margin-note`

Format:

```text
/comath resolve-margin-note <note-id>: <resolution>
```

Behavior:

- if missing, show `No margin note found for <note-id>.`;
- if already resolved, notify that it is already resolved and do not emit a new event;
- otherwise resolve and record event.

### 6.5 `/comath margin-notes [open|resolved|all]`

Default filter: `open`.

Render:

```text
Co-math margin notes [open]
- margin-note-1 [gap/open] paper-section-1: Need a lemma ...
```

Include section id when present.

### 6.6 `/comath paper`

Render a terminal-friendly markdown-ish living paper:

```text
# <state.title>

Root question: ...

## Working paper sections

### paper-section-1: <title> [draft]
<body>

Sources:
- claim-1 [proved/synthesis-eligible]
- warning-1 [open]
- artifact-1 [failed_attempt]

Margin notes:
- margin-note-1 [gap/open]: Need a lemma ...

## Reviewed findings not yet in paper
- claim-2: ...

## Open warnings
- warning-1 [high] on claim-1: ...

## Open margin notes
- margin-note-1 [gap] paper-section-1: ...
```

Rendering requirements:

- Always include open warnings, even if none: `No open warnings are recorded.`
- Always include open margin notes, even if none.
- For claim sources:
  - if `isClaimSynthesisEligible(state, claim.id)` is true, mark `synthesis-eligible`;
  - otherwise mark `not synthesis-eligible` and include claim status.
- Add a `Reviewed findings not yet in paper` section listing synthesis-eligible proved claims that are not used as section source claims.
- Do not present draft section text as proof.
- Do not include unreviewed claims as findings.

---

## 7. Audit rules

Extend `/comath audit` read-only checks:

Working paper section checks:

- source claim id exists;
- source evidence id exists;
- source warning id exists;
- source artifact id exists;
- source review round id exists;
- source role run id exists;
- marginNoteIds exist;
- if a section source claim is not synthesis-eligible, report:

```text
paper-section-1 sources claim-1 which is not synthesis-eligible
```

Margin note checks:

- subject id exists, unless subject id is `project`;
- sectionId exists if present;
- if `sectionId` is present, the section includes the margin note id;
- resolved note has `resolvedAt` and non-empty `resolution`;
- open note must not have `resolvedAt`.

Do not mutate state in audit.

---

## 8. State-tool / README updates

Update `state-tool.ts` summary to include:

```text
Working paper sections: N
Open margin notes: N
```

Update README with:

- sample commands for paper-section, margin-note, resolve-margin-note, paper, margin-notes;
- explanation that working-paper sections are draft workspace records;
- explanation that margin notes are paper annotations, not proof evidence;
- warning that paper rendering preserves open warnings and non-synthesis-eligible sources.

---

## 9. Tests

Use strict TDD. Add RED tests first.

### 9.1 Storage tests

Modify:

```text
packages/coding-agent/test/co-math-state.test.ts
```

Add tests:

1. `normalizes legacy state with empty working paper sections and margin notes`
   - write older state without the new arrays;
   - load;
   - assert arrays exist and are empty.

2. `adds working paper sections with source provenance and event`
   - create state with a claim/evidence/warning/artifact/review round/role run;
   - call `addWorkingPaperSection`;
   - assert section fields, deduped source ids, event kind.

3. `adds margin notes and links them to sections`
   - add section;
   - add margin note with section id;
   - assert note exists and section.marginNoteIds includes note id;
   - assert event kind.

4. `resolving missing or already resolved margin notes does not create false provenance`
   - missing should throw or be command-level handled;
   - already resolved should not append a second `margin_note_resolved` event.

### 9.2 Command tests

Modify:

```text
packages/coding-agent/test/co-math-extension.test.ts
```

Add tests:

1. `records paper sections with classified source ids`
   - init;
   - create claim/evidence/warning/artifact as needed;
   - `/comath paper-section Endpoint lemma: Draft text --sources claim-1,evidence-1,warning-1,artifact-1`
   - load state and assert section source arrays.

2. `paper-section rejects unknown source ids`
   - command with `--sources claim-missing`;
   - assert no section created and notification lists unknown id.

3. `margin-note records open notes without creating mathematical warnings`
   - create section;
   - `/comath margin-note paper-section-1 gap: Need a proof of the boundary lemma`;
   - assert `marginNotes.length === 1` and `warnings.length === 0`.

4. `resolve-margin-note records one real resolution event only`
   - create note;
   - resolve once;
   - resolve again;
   - assert only one `margin_note_resolved` event.

5. `paper render marks non-synthesis-eligible claim sources`
   - create a draft/needs_review claim;
   - create paper section sourcing it;
   - `/comath paper`;
   - assert output contains `not synthesis-eligible` and does not list it as a reviewed finding.

6. `paper render includes reviewed findings not yet in paper`
   - create proved claim with proof evidence and no open warnings;
   - do not source it in any section;
   - `/comath paper`;
   - assert it appears under reviewed findings not yet in paper.

7. `paper render always includes open warnings and open margin notes`
   - add open warning and open margin note;
   - `/comath paper`;
   - assert both sections and entries are present.

8. `audit reports dangling paper section and margin note references without mutation`
   - manually save malformed state;
   - `/comath audit`;
   - assert expected problem text;
   - reload and assert malformed state remains unchanged.

9. `README and state-tool document paper commands`
   - update existing documentation tests to check command names and key safety text.

---

## 10. Implementation notes

### 10.1 Source classification helper

In `commands.ts`, implement a local helper:

```ts
interface ClassifiedPaperSources {
	claimIds: string[];
	evidenceIds: string[];
	warningIds: string[];
	artifactIds: string[];
	reviewRoundIds: string[];
	roleRunIds: string[];
	unknownIds: string[];
}
```

Classify by checking actual state arrays, not only by prefix. A malformed id that happens to have a known prefix but does not exist must be unknown.

### 10.2 Subject existence helper

For margin notes, accept subject ids that exist in any of:

```text
project
workstreams
claims
evidence
warnings
artifacts
reviewRounds
roleRuns
reports
workingPaperSections
```

Reject others.

### 10.3 No file writes

`/comath paper` renders to command output only. It must not create `paper.md`, `.tex`, PDFs, or artifacts.

### 10.4 Avoid overclaiming

Use cautious labels:

- `draft section`
- `synthesis-eligible source`
- `not synthesis-eligible source`
- `open margin note`
- `open warning`

Do not use labels like `theorem`, `proof complete`, or `paper-ready` unless they are already in user text.

---

## 11. Verification

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
- no role-runner or agent prompt changes;
- no new generated paper/export files.

---

## 12. Codex handoff prompt

```text
Implement docs/co-math-living-working-paper-plan.md using strict TDD.

Goal:
Add a persistent living working-paper layer with draft sections, source provenance, and margin-note-style annotations. This is state + commands + rendering only.

Required commands:
- /comath paper-section <title>: <body> [--sources id1,id2]
- /comath margin-note <subject-id> <gap|todo|warning|provenance|comment>: <note>
- /comath resolve-margin-note <note-id>: <resolution>
- /comath margin-notes [open|resolved|all]
- /comath paper

Required semantics:
- Working-paper sections are draft records, not proof certificates.
- Margin notes are paper annotations, not mathematical Warning records and not Evidence.
- paper-section must classify source ids by actual existing state records and reject unknown ids.
- paper render must mark non-synthesis-eligible claim sources explicitly.
- paper render must include open warnings and open margin notes.
- reviewed findings not yet sourced by a paper section should be listed separately.
- resolving an already resolved margin note must not create duplicate false provenance.
- audit must report dangling paper/margin-note references without mutating state.
- No model calls, no LaTeX export, no markdown file export, no PDF generation, no filesystem artifact creation, no new deps.
- Existing proof-promotion, review-round, run lifecycle, queue, and background dispatch invariants must remain unchanged.

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
- Add RED storage tests for legacy normalization, section creation, margin-note linking, and no duplicate resolution provenance.
- Add RED command tests for source classification/rejection, margin-note behavior, paper rendering, audit, README/state-tool docs.
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

## 13. Hermes review checklist

After Codex returns, Hermes should verify:

- schema has working paper sections and margin notes with legacy normalization;
- storage helpers emit events and do not create false provenance;
- paper-section rejects unknown source ids;
- margin-note does not create Warning/Evidence records;
- resolve-margin-note does not duplicate resolved events;
- paper render includes open warnings and open margin notes;
- paper render marks non-synthesis-eligible source claims;
- reviewed proved claims not in paper are listed separately;
- audit catches dangling paper/margin references without mutation;
- no file export or model calls were added;
- proof/review/run/background invariants are unchanged;
- targeted tests, npm run check, and git diff --check pass.
