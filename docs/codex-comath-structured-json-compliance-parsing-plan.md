# Co-Math Structured JSON Compliance and Parsing Implementation Plan

> **For Codex:** Implement this plan with strict TDD. Keep the scope narrow. Do not add interactive chat, transcript storage, new state schema collections, or broad mathematical behavior changes.

**Goal:** Stop useful co-math role outputs from falling back to raw reports when the model returns JSON-looking content with near-valid field names or domain-specific kind labels.

**Architecture:** Fix this from both sides: make role prompts explicitly constrain enum values, and make the parser tolerant of safe near-misses that appeared during Question 3 validation. Preserve the fail-closed behavior for genuinely malformed or unsafe output.

**Tech Stack:** TypeScript, Node, Vitest, existing co-math extension files under `packages/coding-agent/examples/extensions/co-math`.

---

## Problem observed in validation

During Question 3 validation, multiple role runs produced final messages that were visually a single JSON object with useful fields:

- `summary`
- `proposedClaims`
- `proposedArtifacts`
- `blockers`

But the runner fell back to:

```text
Role completed, but output was not valid structured co-math JSON.
Saved raw output as report-<n>.
No claims were promoted from structured fields.
```

The likely causes are not that the output was useless. The output was close to the desired shape, but used enum labels that the current parser rejects.

Current strict parser locations:

```text
packages/coding-agent/examples/extensions/co-math/role-runner.ts
```

Relevant functions:

```ts
parseRoleRunOutput(...)
parseStructuredJsonText(...)
toRoleRunResult(...)
parseProposedArtifacts(...)
parseProposedEvidence(...)
isArtifactKind(...)
isEvidenceKind(...)
fallbackRoleRunResult(...)
```

Current enum definitions:

```text
packages/coding-agent/examples/extensions/co-math/schema.ts
```

Current allowed evidence kinds:

```ts
"proof" | "computation" | "reference" | "counterexample" | "note"
```

Current allowed artifact kinds:

```ts
"computation"
"latex_note"
"proof_sketch"
"counterexample_search"
"reference"
"dataset"
"script"
"figure"
"failed_attempt"
"human_note"
"working_paper_export"
```

Observed role output used kinds such as:

Evidence-like:

```text
source_state
proof_obligation
citation
derivation
source_check
source_audit
```

Artifact-like:

```text
review_note
source_extract
negative_result
source_audit
blocker_list
exact_example
```

Those are semantically useful, but currently make the whole structured result invalid.

## Design decision

Do not immediately expand the persisted schema with many new artifact/evidence kinds.

Instead:

1. Update role prompts so future models use only allowed enum values.
2. Add a small parser-normalization layer that maps known safe aliases to existing schema kinds.
3. Preserve the original labels in summaries/provenance where helpful.
4. Keep unknown enum values fail-closed unless explicitly mapped.
5. Add diagnostics so fallback reports explain why parsing failed.

This gives immediate ingestion improvement without broad state migration.

## Mapping rules

### Evidence kind aliases

Add a helper in `role-runner.ts`:

```ts
function normalizeEvidenceKind(value: unknown): EvidenceKind | undefined {
  if (value === "proof" || value === "computation" || value === "reference" || value === "counterexample" || value === "note") {
    return value;
  }
  if (value === "citation" || value === "source_state" || value === "source_check" || value === "source_audit") {
    return "reference";
  }
  if (value === "derivation" || value === "proof_sketch" || value === "proof_obligation") {
    return "proof";
  }
  if (value === "failed_attempt" || value === "review_note") {
    return "note";
  }
  return undefined;
}
```

Do not accept arbitrary strings.

### Artifact kind aliases

Add a helper in `role-runner.ts`:

```ts
function normalizeArtifactKind(value: unknown): ArtifactKind | undefined {
  if (isArtifactKind(value)) return value;
  if (value === "review_note" || value === "source_audit" || value === "blocker_list") return "human_note";
  if (value === "source_extract") return "reference";
  if (value === "negative_result") return "failed_attempt";
  if (value === "exact_example") return "computation";
  return undefined;
}
```

Use existing `isArtifactKind` for canonical values.

### Preserve original kind labels

When an alias is normalized, prefix the summary or provenance with the original kind so the user can still see it.

Example:

Input:

```json
{
  "kind": "source_extract",
  "title": "Question 3 source definitions",
  "summary": "Key source interval is docs/first-proof.md Section B.3.",
  "provenance": "Read docs/first-proof.md."
}
```

Parsed artifact should use:

```ts
kind: "reference"
summary: "[source_extract] Key source interval is docs/first-proof.md Section B.3."
provenance: "Read docs/first-proof.md."
```

For evidence aliases, similarly prefix evidence summary:

```ts
kind: "reference"
summary: "[citation] docs/first-proof.md lines 749-753 state ..."
```

Only prefix when the original kind differs from the normalized kind.

## Tasks

### Task 1: Add parser tests for observed Question 3 JSON

**Objective:** Reproduce the current failure with close-to-valid role output from the validation session.

**Files:**

- Modify: `packages/coding-agent/test/co-math-role-runner.test.ts`
- Modify later: `packages/coding-agent/examples/extensions/co-math/role-runner.ts`

**Step 1: Add a failing test for evidence aliases**

Add a test near the existing `parseRoleRunOutput` tests:

```ts
it("normalizes source and derivation evidence aliases from role output", () => {
  const result = parseRoleRunOutput(
    JSON.stringify({
      summary: "Extracted source-backed definitions.",
      proposedClaims: [
        {
          statement: "S_n(lambda) is the finite content sector.",
          evidence: [
            { kind: "citation", summary: "docs/first-proof.md lines 730-731 define the state space." },
            { kind: "derivation", summary: "Stationarity follows after dividing by the normalizing sum." },
            { kind: "proof_obligation", summary: "Need a support lemma." },
          ],
          warnings: [{ severity: "high", message: "Support lemma not found." }],
        },
      ],
    }),
  );

  expect(result.blockers).toBeUndefined();
  expect(result.proposedClaims?.[0]?.evidence).toEqual([
    { kind: "reference", summary: "[citation] docs/first-proof.md lines 730-731 define the state space." },
    { kind: "proof", summary: "[derivation] Stationarity follows after dividing by the normalizing sum." },
    { kind: "proof", summary: "[proof_obligation] Need a support lemma." },
  ]);
});
```

**Step 2: Add a failing test for artifact aliases**

```ts
it("normalizes source and review artifact aliases from role output", () => {
  const result = parseRoleRunOutput(
    JSON.stringify({
      summary: "Audited support gap.",
      proposedArtifacts: [
        {
          kind: "source_extract",
          title: "Question 3 source definitions",
          summary: "Key source interval is docs/first-proof.md Section B.3.",
          provenance: "Read docs/first-proof.md.",
          path: "docs/first-proof.md",
        },
        {
          kind: "negative_result",
          title: "No support lemma found",
          summary: "Search found no vanishing lemma.",
          provenance: "rg over registered files.",
        },
        {
          kind: "exact_example",
          title: "Small indexing obstruction",
          summary: "For n=2, N^2 contains states outside S_2(lambda).",
        },
      ],
    }),
  );

  expect(result.blockers).toBeUndefined();
  expect(result.proposedArtifacts).toMatchObject([
    {
      kind: "reference",
      title: "Question 3 source definitions",
      summary: "[source_extract] Key source interval is docs/first-proof.md Section B.3.",
      provenance: "Read docs/first-proof.md.",
      path: "docs/first-proof.md",
    },
    {
      kind: "failed_attempt",
      title: "No support lemma found",
      summary: "[negative_result] Search found no vanishing lemma.",
    },
    {
      kind: "computation",
      title: "Small indexing obstruction",
      summary: "[exact_example] For n=2, N^2 contains states outside S_2(lambda).",
    },
  ]);
});
```

**Step 3: Verify failure**

From `packages/coding-agent`:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-role-runner.test.ts -t "normalizes source"
```

Expected: fail because current parser treats those kinds as invalid and falls back.

### Task 2: Implement enum alias normalization

**Objective:** Parse safe near-valid role output without falling back to raw reports.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/role-runner.ts`

**Step 1: Add `normalizeEvidenceKind`**

Place near `isEvidenceKind`.

Use top-level helper functions only. No inline imports. No `any`.

Implementation shape:

```ts
function normalizeEvidenceKind(value: unknown): EvidenceKind | undefined {
  if (isEvidenceKind(value)) return value;
  if (
    value === "citation" ||
    value === "source_state" ||
    value === "source_check" ||
    value === "source_audit"
  ) {
    return "reference";
  }
  if (value === "derivation" || value === "proof_sketch" || value === "proof_obligation") return "proof";
  if (value === "failed_attempt" || value === "review_note") return "note";
  return undefined;
}
```

**Step 2: Add `normalizeArtifactKind`**

Place near `isArtifactKind`.

```ts
function normalizeArtifactKind(value: unknown): ArtifactKind | undefined {
  if (isArtifactKind(value)) return value;
  if (value === "review_note" || value === "source_audit" || value === "blocker_list") return "human_note";
  if (value === "source_extract") return "reference";
  if (value === "negative_result") return "failed_attempt";
  if (value === "exact_example") return "computation";
  return undefined;
}
```

**Step 3: Add summary-prefix helper**

```ts
function prefixSummaryForNormalizedKind(originalKind: unknown, normalizedKind: string, summary: string): string {
  if (typeof originalKind !== "string" || originalKind === normalizedKind) return summary;
  return `[${originalKind}] ${summary}`;
}
```

**Step 4: Use normalization in `parseProposedEvidence`**

Replace the current direct `isEvidenceKind(record.kind)` check with:

```ts
const kind = normalizeEvidenceKind(record.kind);
if (!kind) return null;
if (typeof record.summary !== "string" || record.summary.trim().length === 0) return null;
evidence.push({ kind, summary: prefixSummaryForNormalizedKind(record.kind, kind, record.summary) });
```

**Step 5: Use normalization in `parseProposedArtifacts`**

Replace the current direct `isArtifactKind(artifact.kind)` check with:

```ts
const kind = normalizeArtifactKind(artifact.kind);
if (!kind) return null;
```

Then push:

```ts
artifacts.push({
  kind,
  title: artifact.title,
  summary: prefixSummaryForNormalizedKind(artifact.kind, kind, artifact.summary),
  ...(provenance ? { provenance } : {}),
  ...(artifactPath ? { path: artifactPath } : {}),
  ...(relatedClaimIds ? { relatedClaimIds } : {}),
  ...(relatedWorkstreamIds ? { relatedWorkstreamIds } : {}),
});
```

**Step 6: Run tests**

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-role-runner.test.ts
```

Expected: pass.

### Task 3: Add parser diagnostics for fallback

**Objective:** Make fallback reports explain why structured parsing failed.

Current fallback only says:

```text
Role output was not valid structured co-math JSON; saved as report only.
```

That is useful but not diagnostic enough. Add an internal parse-error reason that becomes a second blocker, without changing persisted schema.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/role-runner.ts`
- Modify: `packages/coding-agent/test/co-math-role-runner.test.ts`

**Step 1: Add a failing test for unknown enum diagnostics**

```ts
it("includes parse diagnostics when structured JSON has an unknown artifact kind", () => {
  const result = parseRoleRunOutput(
    JSON.stringify({
      summary: "Report with unknown artifact kind.",
      proposedArtifacts: [
        {
          kind: "brand_new_kind",
          title: "Unknown artifact",
          summary: "This should not be accepted silently.",
        },
      ],
    }),
  );

  expect(result.summary).toContain("Report with unknown artifact kind.");
  expect(result.blockers).toContain("Role output was not valid structured co-math JSON; saved as report only.");
  expect(result.blockers?.join("\n")).toContain("unknown artifact kind: brand_new_kind");
});
```

**Step 2: Change parser internals to carry failure reasons**

Keep exported `parseRoleRunOutput(text: string): RoleRunResult` unchanged.

Add internal type:

```ts
interface ParseFailure {
  reason: string;
}
```

Refactor only as much as necessary. Avoid a large parser rewrite.

Suggested small approach:

- Change `toRoleRunResult` to return `RoleRunResult | ParseFailure`.
- Add `isParseFailure` helper.
- Let parse helpers return a specific sentinel? If too invasive, add a module-local `parseFailure(reason)` helper and update the main failure points one by one.

Prefer simple explicit messages:

```text
missing non-empty summary
proposedClaims must be an array
proposedClaims[0].evidence[1] has unknown evidence kind: source_foo
proposedArtifacts[0] has unknown artifact kind: brand_new_kind
reviewDecision.status is invalid: accepted
blockers must be an array of non-empty strings
```

Do not expose stack traces.

**Step 3: Update `fallbackRoleRunResult` signature**

Change:

```ts
function fallbackRoleRunResult(text: string): RoleRunResult
```

to:

```ts
function fallbackRoleRunResult(text: string, reason?: string): RoleRunResult
```

Return blockers:

```ts
const blockers = ["Role output was not valid structured co-math JSON; saved as report only."];
if (reason) blockers.push(`Structured output parse failure: ${reason}`);
```

**Step 4: Wire parse failure reasons**

`parseRoleRunOutput` should distinguish:

- not JSON at all;
- JSON parsed but schema invalid.

Example behavior:

```ts
export function parseRoleRunOutput(text: string): RoleRunResult {
  const parsed = parseStructuredJsonText(text);
  if (!parsed) return fallbackRoleRunResult(text, "output was not a single JSON object or fenced JSON object");
  const result = toRoleRunResult(parsed);
  if (isParseFailure(result)) return fallbackRoleRunResult(text, result.reason);
  return result;
}
```

Exact implementation can differ, but tests must cover the diagnostic.

**Step 5: Run parser tests**

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-role-runner.test.ts
```

Expected: pass.

### Task 4: Update role prompts to list allowed enum values and alias guidance

**Objective:** Reduce future invalid structured output at the source.

**Files:**

Modify all role prompts:

```text
packages/coding-agent/examples/extensions/co-math/agents/coordinator.md
packages/coding-agent/examples/extensions/co-math/agents/workstream.md
packages/coding-agent/examples/extensions/co-math/agents/reviewer.md
packages/coding-agent/examples/extensions/co-math/agents/synthesizer.md
```

**Step 1: Add explicit enum constraints in every prompt**

Each prompt's final-output schema should state:

```text
Allowed evidence kinds only: proof, computation, reference, counterexample, note.
Allowed artifact kinds only: computation, latex_note, proof_sketch, counterexample_search, reference, dataset, script, figure, failed_attempt, human_note.
Allowed warning severities only: low, medium, high.
Allowed reviewDecision.status values only: proved, proof_sketch, needs_review, disproved.
```

Do not mention `working_paper_export` as a role-produced artifact kind unless current code expects role agents to produce it. It is a persisted artifact kind but not needed for role output.

**Step 2: Add mapping guidance for common domain labels**

Add a concise instruction:

```text
If you want to describe a citation, source extract, source audit, proof obligation, blocker list, negative result, exact example, or review note, do not invent a new kind. Use one of the allowed kinds and put the descriptive label in the title or summary.

Examples:
- citation/source_extract/source_audit -> evidence kind reference or artifact kind reference
- derivation/proof_obligation -> evidence kind proof or artifact kind proof_sketch
- negative_result/support gap -> artifact kind failed_attempt
- exact_example/algebra check -> artifact kind computation
- review_note/blocker_list -> artifact kind human_note
```

**Step 3: Keep prompts concise**

Do not rewrite the whole prompt unless necessary. Patch the output discipline/final output section only.

### Task 5: Add integration test that near-valid JSON ingests claims/artifacts instead of fallback

**Objective:** Prove parser normalization results in state ingestion, not only parser return values.

**Files:**

- Modify: `packages/coding-agent/test/co-math-extension.test.ts`

**Step 1: Add a test with a fake role runner returning normalized kinds**

Use the existing test fixture around `createCoMathExtensionFixture`.

Test shape:

```ts
it("ingests role output with normalized source labels instead of saving only a raw fallback report", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-normalized-role-output-"));
  try {
    const { commands, notifications } = createCoMathExtensionFixture({
      roleRunner: async () => ({
        summary: "Source-backed support gap audit.",
        proposedClaims: [
          {
            statement: "The proof has a support gap.",
            evidence: [{ kind: "reference", summary: "[source_audit] docs/first-proof.md lines 890-911." }],
            warnings: [{ severity: "high", message: "Support lemma missing." }],
          },
        ],
        proposedArtifacts: [
          {
            kind: "failed_attempt",
            title: "No support lemma found",
            summary: "[negative_result] Search found no vanishing lemma.",
            provenance: "rg over docs.",
          },
        ],
        blockers: ["Need support lemma."],
      }),
    });
    const command = commands.get("comath");
    expect(command).toBeDefined();
    const ctx = createCommandContext(notifications, tempDir);

    await command?.handler("init Study endpoint behavior", ctx);
    await command?.handler("goal Preserve proof gaps", ctx);
    await command?.handler("workstream support-gap: audit support gap", ctx);
    await command?.handler("run workstream workstream-support-gap", ctx);

    const state = await loadProjectState(getDefaultStatePath(tempDir));
    expect(state?.claims).toHaveLength(1);
    expect(state?.artifacts).toHaveLength(1);
    expect(state?.roleRuns[0]).toMatchObject({ status: "blocked", reportId: "report-1" });
    expect(notifications.join("\n")).not.toContain("Role completed, but output was not valid structured co-math JSON.");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
```

Note: This test uses already-normalized fake role-runner data because extension tests bypass `parseRoleRunOutput`. The parser alias tests in Task 1/2 cover alias parsing directly.

### Task 6: Optional manual smoke test with the real prompt path

**Objective:** Verify the real nested Pi role output is less likely to fall back.

Do this only after automated tests pass. This invokes the interactive/model path, so it is optional unless the user explicitly wants it.

From a scratch dir:

```bash
mkdir -p /tmp/comath-json-smoke
cd /tmp/comath-json-smoke

/home/hermes/developer/pi-mono-comath/pi-test.sh \
  -e /home/hermes/developer/pi-mono-comath/packages/coding-agent/examples/extensions/co-math/index.ts \
  --approve
```

Inside Pi:

```text
/comath init Structured JSON smoke test
/comath goal Produce a source-backed claim without inventing enum kinds.
/comath workstream smoke-json: Return one claim with reference evidence and one failed_attempt artifact using only allowed enum kinds.
/comath run workstream workstream-smoke-json
/comath report-status report-1
/comath run-status role-run-1
```

Expected:

- No invalid structured JSON fallback message.
- Claim/evidence/artifact records are ingested if the model follows the prompt.
- If fallback still occurs, `blockers` include a diagnostic parse reason.

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
Do not run `npm run build` unless the user explicitly requests it.

## Acceptance criteria

The implementation is accepted when:

- Observed Q3-style evidence aliases parse into canonical evidence kinds.
- Observed Q3-style artifact aliases parse into canonical artifact kinds.
- Canonical valid role output still parses exactly as before.
- Unknown enum values still fail closed.
- Fallback reports include a parse diagnostic explaining the schema problem.
- Prompts explicitly list allowed enum values and tell roles not to invent new kinds.
- Targeted co-math tests pass.
- `npm run check` passes.
- `git diff --check` passes.

## Risks and tradeoffs

### Risk: over-normalizing bad output

Mitigation: use an explicit allowlist only. Do not accept arbitrary strings.

### Risk: losing semantic detail when aliases collapse to canonical kinds

Mitigation: prefix summaries with the original kind label, e.g. `[source_extract] ...`.

### Risk: prompt/schema drift continues

Mitigation: update all role prompts in the same change and add parser tests based on observed role outputs.

### Risk: expanding artifact/evidence enums would be cleaner long-term

Maybe, but it would require broader schema, audit, docs, and migration review. For this milestone, alias normalization is the smallest safe fix.

## Suggested Codex prompt

```text
Implement docs/codex-comath-structured-json-compliance-parsing-plan.md.

Keep scope narrow: improve co-math role output structured JSON compliance/parsing. Do not add transcript storage, interactive chat, new state collections, or broad schema migrations.

Use strict TDD:
1. Add failing parser tests in packages/coding-agent/test/co-math-role-runner.test.ts for observed Question 3 evidence/artifact aliases.
2. Implement explicit allowlist normalization in packages/coding-agent/examples/extensions/co-math/role-runner.ts.
3. Add fallback parse diagnostics for invalid structured JSON.
4. Update co-math role prompts to list allowed enum values and alias guidance.
5. Add/adjust integration coverage in packages/coding-agent/test/co-math-extension.test.ts.
6. Run targeted co-math tests, npm run check, and git diff --check.

Preserve the Stage 1 role-run progress UX and the nested TypeScript CLI invocation fix. Do not commit unless explicitly asked.
```
