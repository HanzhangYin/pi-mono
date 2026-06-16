# Co-Math User-Provided Source Ingestion Plan

> **For Codex:** Implement this plan on `/home/hermes/developer/pi-mono-comath` from the current `comath/research-exploration-mode` branch. Do not commit unless explicitly asked. This is the next bounded Path 5 milestone after the conservative source-needed literature path.

## Goal

Let users provide reference/source context naturally, save it as structured `literatureSources`, and make Path 5 use those sources when classifying theorem/literature claims.

The target beginner workflow:

```text
Are there infinitely many primes of the form n^2 + 1?
I found a reference: Schinzel's hypothesis H predicts prime values for suitable irreducible polynomials, but this is conjectural and not an unconditional theorem.
continue path 5
show report
```

Expected result:

```text
- Pi registers the reference as source context for Path 5.
- `continue path 5` no longer says no source was available.
- Path 5 says the source supports conjectural context.
- Path 5 says the source does not prove the original claim.
- Claim support includes partially-supported and unsupported entries.
```

## Motivation

Path 5 now behaves safely when no source exists:

```text
No source was available.
No theorem claim is established.
Bunyakovsky/Schinzel are search targets only.
```

That is correct but incomplete. The next paper-aligned step is source grounding: the user should be able to give Pi a theorem note, paper reference, URL, or pasted excerpt, and Path 5 should classify claims against that source.

Do this before live web search. The paper architecture emphasizes grounded specialist/critic/synthesizer workstreams and uncertainty-preserving source support. User-provided ingestion is the smallest reliable path to that.

## Non-goals

Do not implement:

```text
- live web search
- arXiv API lookup
- source downloading
- PDF parsing
- formal proof assistant integration
- coordinator expansion
- a general browser/search agent
```

This pass only handles user-provided text/URL/path metadata as source records.

## Relevant Current Files

Likely files to change:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-literature-source.ts
packages/coding-agent/src/modes/comath/comath-literature-workstream.ts
packages/coding-agent/src/modes/comath/comath-prompts.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/test/comath-harness.test.ts
packages/coding-agent/test/comath-literature-workstream.test.ts
packages/coding-agent/test/comath-prompts.test.ts
packages/coding-agent/test/comath-progress.test.ts
docs/comath-research-exploration-smoke.md
```

Existing state fields to preserve/use:

```text
literatureSources
literatureClaimSupports
researchReports[].sourceIds
researchReports[].claimSupportIds
```

Existing source abstraction:

```text
LiteratureSourceLookup
LiteratureSourceResult
```

## Task 1: Add Prompt Helpers for Reference Intake

Modify:

```text
packages/coding-agent/src/modes/comath/comath-prompts.ts
```

Add deterministic helpers such as:

```ts
export interface ParsedUserProvidedLiteratureSource {
  title?: string;
  url?: string;
  path?: string;
  text: string;
}

export function parseUserProvidedLiteratureSourcePrompt(prompt: string): ParsedUserProvidedLiteratureSource | undefined;
```

Support prompts like:

```text
I found a reference: ...
Use this source for path 5: ...
Here is a theorem note: ...
Register this reference: ...
Reference for path 5: ...
Literature note: ...
```

Extract obvious URL if present:

```text
https://...
```

Extract obvious local path if present, but do not read the file in this pass unless existing code already supports safe source reading. Store the path as metadata only.

Reject non-source prompts:

```text
show report
continue path 5
run tests
what branch am I on?
```

Tests:

```text
- parses pasted reference text
- parses URL metadata
- parses local path metadata
- rejects operational prompts
```

## Task 2: Save User Sources as Structured State

Modify:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
```

In existing project state, before normal continuation routing, detect source-intake prompts and save a `literatureSources` record.

Expected source record shape should use existing schema fields. If the schema requires more fields, match current conventions.

Suggested values:

```text
kind: user-provided
source title: derived from prefix or first short sentence
summary: short summary from the provided text, deterministic if possible
extractedText: full provided source text
url/path: if present
```

Output to user:

```text
Registered this as source context for Path 5.
Next command
continue path 5
```

Important:

```text
- Do not create a new research path.
- Do not run Path 5 immediately unless the user asked both to register and continue.
- Do not overwrite existing sources.
- Multiple source notes should append multiple source records.
```

Tests:

```text
- after initial research workspace, pasted reference creates one literature source
- response suggests continue path 5
- second reference appends another source
- source prompt before workspace warns to ask a math question first, or creates minimal state only if existing design supports that; prefer warning/no state
```

## Task 3: Make Path 5 Lookup Use Registered Sources

Modify:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-literature-source.ts
```

Current `LiteratureSourceLookup` is injected and the default returns no sources. Add a workspace-aware lookup wrapper when launching a literature workstream:

```text
registered state.literatureSources + configured lookup results
```

Behavior:

```text
- If user-provided sources exist, Path 5 receives them.
- If configured lookup also returns sources, include both, de-duplicated where simple.
- If no sources exist, keep the current no-source fallback.
```

Avoid changing the public source lookup interface unless necessary.

Tests:

```text
- state-registered source is passed to Path 5
- Path 5 report sourceIds non-empty
- literatureSources preserved in state
```

## Task 4: Preserve Claim-Support Discipline

Modify as needed:

```text
packages/coding-agent/src/modes/comath/comath-literature-workstream.ts
```

For the motivating source text:

```text
Schinzel's hypothesis H predicts prime values for suitable irreducible polynomials, but this is conjectural and not an unconditional theorem.
```

Path 5 should produce:

```text
partially-supported: conjectural prime-values-of-polynomials context
unsupported: unconditional proof of infinitely many primes n^2 + 1
```

It must not produce:

```text
supported: infinitely many primes n^2 + 1 are proved
```

Tests:

```text
- source-backed Path 5 does not say original claim is proved
- report has sourceIds
- report has claimSupportIds
- at least one claim support is partially-supported
- at least one claim support is unsupported
```

## Task 5: Improve User-Facing Output

Modify:

```text
packages/coding-agent/src/modes/comath/comath-progress.ts
```

After source registration, output should be concise:

```text
Registered source context for Path 5
- [short title or first sentence]

Next command
continue path 5
```

After Path 5 with registered source, completion should include:

```text
Source-backed status
- The source supports conjectural/heuristic context around prime-producing polynomials.
- The source does not provide an unconditional proof for n^2 + 1.

What this means
- Treat the original problem as unresolved in this workspace.
- Use the source as context for Path 2/4, not as a proof.

Next
what should we try next?
```

Avoid raw internal ids in the normal completion. Detailed `show report` may include source/reference detail as existing behavior allows.

## Task 6: Update Smoke Docs

Update:

```text
docs/comath-research-exploration-smoke.md
```

Add:

```text
## Path 5 user-provided source smoke
```

Manual smoke:

```bash
cd /tmp
mkdir comath-path5-source-ingestion-test-1
cd comath-path5-source-ingestion-test-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Are there infinitely many primes of the form n^2 + 1?
I found a reference: Schinzel's hypothesis H predicts prime values for suitable irreducible polynomials, but this is conjectural and not an unconditional theorem.
continue path 5
show report
```

Expected:

```text
[ ] source registered
[ ] Path 5 uses registered source
[ ] no-source warning does not appear
[ ] conjectural context is partially-supported
[ ] unconditional proof claim is unsupported
[ ] no claim says the original problem is proved
```

State probe:

```bash
python3 -c 'import json, pathlib; s=json.loads(pathlib.Path(".pi/co-math/state.json").read_text()); print("sources:", len(s.get("literatureSources", []))); print("claimSupports:", len(s.get("literatureClaimSupports", []))); r=s.get("researchReports", [])[-1]; print("sourceIds:", r.get("sourceIds", [])); print("claimSupportIds:", r.get("claimSupportIds", [])); print([(c.get("status"), c.get("claim")) for c in s.get("literatureClaimSupports", [])])'
```

Expected:

```text
sources: >= 1
claimSupports: >= 2
sourceIds: non-empty
claimSupportIds: non-empty
partially-supported
unsupported
```

## Validation Commands

Focused co-math suite:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run \
  test/comath-markdown.test.ts \
  test/comath-prompts.test.ts \
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

Repo checks:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

Do not run `npm test` or `npm run build` unless explicitly asked.

## Final Response Required From Codex

Report:

```text
- files changed
- supported source-intake prompt forms
- how registered sources are stored
- how Path 5 uses registered sources
- claim-support statuses observed
- focused co-math suite result
- npm run check result
- git diff --check result
- manual source-ingestion smoke folder/result
- remaining UX rough edges
```
