# Co-Math Source-Backed Path 5 Plan

> **For Codex:** Implement this plan on `/home/hermes/developer/pi-mono-comath` from the current `comath/research-exploration-mode` branch. Do not commit unless explicitly asked. This is a bounded Path 5 milestone: make the known-theorem/literature path useful and provenance-first. Do not add broad web search, formal proving, or coordinator expansion in this pass.

## Goal

Make Path 5 produce a useful, conservative, source-backed theorem/literature status report.

For the motivating problem:

```text
Are there infinitely many primes of the form n^2 + 1?
```

Path 5 should distinguish:

```text
- what is known from registered sources
- what is conjectural framing
- what remains unsupported/open
- what the user should try next
```

The core product goal is:

```text
Path 5 should never invent citations, never treat conjectures as proofs, and should clearly say when no source is available.
```

## Motivation

The current research path sequence is now useful through Path 4:

```text
Path 1: examples and computation
Path 2: direct proof attempt
Path 3: reformulation bridge
Path 4: weaker lemmas / candidate targets
```

The missing paper-aligned piece is Path 5:

```text
Known theorem or literature reduction
```

Currently Path 5 is safe but thin. It can say that `n^2 + 1` resembles prime-values-of-polynomials questions and mentions Bunyakovsky/Schinzel-style targets, but it does not yet give a satisfying source-backed status.

The co-mathematician paper architecture depends on source/provenance-aware workstreams. Before expanding coordinator synthesis, Path 5 should produce reliable literature/theorem inputs for the coordinator.

## Expected End Result

Manual flow:

```text
Are there infinitely many primes of the form n^2 + 1?
please continue path 1
continue path 3
continue path 4
continue path 5
show report
```

Good Path 5 output with no source backend:

```text
Path 5 completed: Known theorem or literature reduction

Source-backed status
- No source was available, so no theorem claim is established.
- Names such as Bunyakovsky or Schinzel are search targets only.
- Do not treat the original infinitude claim as proved.

What this means
- Continue treating the full problem as open in this workspace.
- Use Path 4 weaker targets or provide a reference for source-backed review.

Next
what should we try next?
```

Good Path 5 output with a fake/test source backend:

```text
Path 5 completed: Known theorem or literature reduction

Source-backed status
- Source supports that Bunyakovsky/Schinzel-type conjectures would imply prime values for suitable polynomials.
- Source does not provide an unconditional proof for n^2 + 1.
- The original problem remains unresolved unless another source proves it.

References
- [source title/path/url]

Claim support
- supported: conjectural implication context
- unsupported: unconditional infinitude of primes n^2 + 1

Next
what should we try next?
```

## Non-goals

Do not implement:

```text
- live web search
- broad citation generation
- arXiv API integration
- source downloaders
- formal proof assistant integration
- coordinator feature expansion
- new autonomous agents
- a full theorem database
```

Use the existing `LiteratureSourceLookup` abstraction and tests/fakes.

## Current Relevant Code

Files likely to change:

```text
packages/coding-agent/src/modes/comath/comath-literature-workstream.ts
packages/coding-agent/src/modes/comath/comath-literature-source.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
packages/coding-agent/src/modes/comath/comath-research-workstream.ts
packages/coding-agent/src/modes/comath/comath-research-execution.ts
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/test/comath-literature-workstream.test.ts
packages/coding-agent/test/comath-progress.test.ts
packages/coding-agent/test/comath-harness.test.ts
packages/coding-agent/test/comath-coordinator-synthesis.test.ts
packages/coding-agent/examples/extensions/co-math/schema.ts
```

Relevant current pieces:

```text
comath-literature-source.ts
- LiteratureSourceLookup
- LiteratureSourceResult
- createDefaultLiteratureSourceLookup() currently returns a null lookup

comath-literature-workstream.ts
- runLiteratureResearchWorkstreamStaged(...)
- buildNoSourceResult(...)
- isLiteratureResearchPath(...)
- stores literature sources and claim supports through harness path

schema.ts
- LiteratureSourceArtifact
- LiteratureClaimSupport
- LiteratureClaimSupportStatus: supported | partially-supported | unsupported | conflicting
```

Existing behavior to preserve:

```text
- no-source literature path must stay conservative
- source records must be structured state, not only prose
- claim support records must link to source ids when sources exist
- show latest report must display source/reference context
```

## Design Principles

### 1. Provenance first

Every literature/theorem claim must be one of:

```text
supported
partially-supported
unsupported
conflicting
```

Unsupported claims are acceptable if clearly labeled.

### 2. No invented citations

Do not hardcode fake bibliographic facts as if verified.

For `n^2 + 1`, it is okay to mention search targets like:

```text
Bunyakovsky conjecture
Schinzel's hypothesis H
Landau-style open problems
prime values of irreducible polynomials
```

but only as search targets or source-backed context, not as established proof.

### 3. Useful no-source fallback

If no sources are returned, Path 5 should still help the user by explaining:

```text
- what cannot be claimed
- what terms to search for
- what source context would be useful
- what next command to use
```

### 4. Beginner output first, detailed output second

Normal completion should say the conclusion plainly.
Detailed report can include source ids, paths, and claim-support details.
Avoid raw internal ids in normal copy unless already established as detailed-report behavior.

## Task 1: Improve No-Source Path 5 Output

Modify:

```text
packages/coding-agent/src/modes/comath/comath-literature-workstream.ts
```

Improve `buildNoSourceResult(...)` so Path 5 no-source output is not just blocked/generic. It should produce structured findings for known-theorem/literature paths.

For `n^2 + 1`, recommended no-source findings:

```text
No source was available, so no theorem claim is established for this path.
Search targets: prime values of polynomials, Bunyakovsky-type conjectures, Schinzel's hypothesis H, Landau-style problem lists, and primes of the form n^2 + 1.
Treat those names as search targets only until a source verifies the exact statement.
No unconditional proof of infinitely many primes n^2 + 1 is established in this workspace.
```

Recommended gaps:

```text
A source-backed literature check is needed before citing named theorems.
Conjectural implications must be separated from unconditional results.
```

Recommended next:

```text
Provide a reference or ask the coordinator what to try next.
```

Completion output should include an executable command:

```text
what should we try next?
```

or:

```text
show research state
```

Acceptance:

```text
continue path 5
```

with the default null lookup must produce a useful no-source report, not a failure-looking dead end.

## Task 2: Add Path 5 Source-Backed Classification Helpers

Modify:

```text
packages/coding-agent/src/modes/comath/comath-literature-workstream.ts
```

Add small deterministic helpers for synthesizing safe status when sources exist. Example names:

```ts
function buildPath5SourceBackedStatus(...): string[]
function buildPath5ClaimSupports(...): LiteratureClaimSupportDraft[]
function isKnownTheoremOrLiteraturePath(path: ResearchPath): boolean
function isNSquaredPlusOneQuestion(rootQuestion: string): boolean
```

The goal is not to replace model-backed output. The goal is to ensure Path 5 always includes safe status categories even if the model output is thin.

For `n^2 + 1` with sources, ensure report findings include concepts like:

```text
Source-backed context was reviewed for prime-producing polynomial / conjectural framing.
No source in this run established an unconditional proof of infinitely many primes of the form n^2 + 1 unless the source explicitly says so.
Conjectural implications are not proofs of the original claim.
```

If a fake/test source explicitly says a theorem is conjectural, Path 5 should classify it as source-backed context but not proof.

## Task 3: Strengthen Literature Prompts for Path 5

Modify:

```text
packages/coding-agent/src/modes/comath/comath-literature-workstream.ts
```

The specialist/critic/synthesizer prompts should require:

```text
- separate unconditional theorem claims from conjectural claims
- quote/source-reference every theorem claim from provided sources
- mark unsupported claims explicitly
- never infer that Bunyakovsky/Schinzel proves the original statement unconditionally
- for n^2 + 1, say whether source context treats the problem as open/unresolved/conjectural/proved
```

Add a required output shape in the prompt, for example:

```text
## Source-backed status
- ...

## Conjectural or heuristic context
- ...

## Unsupported or unresolved
- ...

## Next
- ...
```

Make parser extraction pick up these sections if possible.

## Task 4: Improve Completion and Report Presentation for Path 5

Modify:

```text
packages/coding-agent/src/modes/comath/comath-progress.ts
```

When latest completed report path title is:

```text
Known theorem or literature reduction
```

normal completion should show a Path 5-specific section:

```text
Source-backed status
- ...

What this means
- ...

Next
what should we try next?
```

Detailed report should still show:

```text
References
Claim support
```

Acceptance:

```text
show report
```

after Path 5 should show references/claim support if sources exist, and unsupported status if no sources exist.

## Task 5: Ensure Structured State Is Saved

Inspect and update if needed:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/examples/extensions/co-math/schema.ts
```

For source-backed Path 5 runs, ensure state contains:

```text
literatureSources: structured records
literatureClaimSupports: structured support records
researchReports[].sourceIds
researchReports[].claimSupportIds
```

No-source Path 5 should still record at least one unsupported claim-support record if current state model supports that without source ids.

Acceptance state probe after Path 5:

```bash
python3 -c 'import json, pathlib; s=json.loads(pathlib.Path(".pi/co-math/state.json").read_text()); print("sources", len(s.get("literatureSources", []))); print("claimSupports", len(s.get("literatureClaimSupports", []))); print("reports", len(s.get("researchReports", []))); print(s.get("researchReports", [])[-1].get("sourceIds", [])); print(s.get("researchReports", [])[-1].get("claimSupportIds", []))'
```

For no-source default, acceptable:

```text
sources 0
claimSupports >= 1
latest report claimSupportIds non-empty
```

For fake-source tests, expected:

```text
sources >= 1
claimSupports >= 2
latest report sourceIds non-empty
latest report claimSupportIds non-empty
```

## Task 6: Add Tests

Update/add tests:

```text
packages/coding-agent/test/comath-literature-workstream.test.ts
packages/coding-agent/test/comath-harness.test.ts
packages/coding-agent/test/comath-progress.test.ts
packages/coding-agent/test/comath-coordinator-synthesis.test.ts
```

Required tests:

### No-source Path 5 test

Use the default/null source lookup.

Assert:

```text
- report status is blocked or completed with clear unsupported status, whichever current conventions prefer
- findings mention no source available
- findings mention search targets only, not proof
- gaps mention source-backed literature check
- claimSupports includes unsupported claim
- no fabricated sources are created
- suggested next move includes a useful executable command or coordinator next step
```

### Fake-source Path 5 test

Use a fake `LiteratureSourceLookup` returning a source like:

```ts
{
  title: "Test note on prime values of polynomials",
  kind: "user-provided",
  summary: "Discusses Bunyakovsky/Schinzel-style conjectural context for prime values of polynomials; does not prove infinitude for n^2 + 1.",
  extractedText: "Schinzel's hypothesis H would imply many prime-value statements for suitable polynomials, but this is conjectural. This note does not prove that n^2 + 1 is prime infinitely often.",
}
```

Assert:

```text
- source is saved as structured literature source
- report sourceIds includes it
- claim support distinguishes conjectural context from unconditional proof
- no finding says the original claim is proved
- show report displays the reference
```

### Progress formatting test

Assert Path 5 completion includes:

```text
Source-backed status
not a proof / unsupported / no unconditional proof
what should we try next? OR show research state
```

### Coordinator context test

Since the next milestone will be coordinator synthesis, ensure Path 5 outputs are visible to coordinator context.

Assert:

```text
- coordinator context includes literatureSources
- coordinator context includes literatureClaimSupports
- coordinator does not ignore unsupported Path 5 status
```

Do not add real network/API tests.

## Task 7: Update Smoke Docs

Update:

```text
docs/comath-research-exploration-smoke.md
```

Add a section:

```text
## Path 5 source-backed literature smoke
```

Manual no-source smoke:

```bash
cd /tmp
mkdir comath-path5-nosource-test-1
cd comath-path5-nosource-test-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Are there infinitely many primes of the form n^2 + 1?
continue path 5
show report
```

Good signs:

```text
[ ] Path 5 runs or blocks productively.
[ ] It says no source was available.
[ ] It does not claim the problem is proved.
[ ] It treats Bunyakovsky/Schinzel as search/conjectural targets only.
[ ] It suggests a concrete next command.
[ ] show report displays unsupported/source-needed status.
```

State probe:

```bash
python3 -c 'import json, pathlib; p=pathlib.Path(".pi/co-math/state.json"); print("state exists:", p.exists()); s=json.loads(p.read_text()); print("reports:", len(s.get("researchReports", []))); print("sources:", len(s.get("literatureSources", []))); print("claimSupports:", len(s.get("literatureClaimSupports", []))); print("latest sourceIds:", s.get("researchReports", [])[-1].get("sourceIds", [])); print("latest claimSupportIds:", s.get("researchReports", [])[-1].get("claimSupportIds", []))'
```

Expected for no-source:

```text
sources: 0
claimSupports: at least 1
latest claimSupportIds: non-empty
```

## Manual Acceptance Smoke

Run:

```bash
cd /tmp
mkdir comath-path5-nosource-test-1
cd comath-path5-nosource-test-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Are there infinitely many primes of the form n^2 + 1?
continue path 5
```

Expected:

```text
- visible co-math activity status while running
- Path 5 output says source-backed literature support is needed
- no theorem is invented
- no unconditional proof is claimed
- next command is executable
```

Then:

```text
show report
```

Expected:

```text
Latest research report
References or source status
Claim support or unsupported status
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
- no-source Path 5 behavior
- fake/source-backed Path 5 behavior
- how claims are classified as supported / partially-supported / unsupported / conflicting
- whether structured literatureSources and literatureClaimSupports are saved
- focused co-math suite result
- npm run check result
- git diff --check result
- manual no-source smoke folder and result
- remaining UX rough edges
```

Do not commit unless explicitly asked.
