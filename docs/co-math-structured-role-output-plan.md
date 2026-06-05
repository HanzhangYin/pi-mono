# Structured Co-Math Role Output Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to review implementation task-by-task. Codex may implement this plan only as a bounded coding worker. Hermes remains responsible for conceptual alignment with `/Users/hanzhangyin/Developer/2605.06651v2.pdf`, final review, verification, and any commit.

**Goal:** Make real `/comath run coordinator|workstream|reviewer|synthesizer` role invocations return structured artifacts that can be ingested into the persistent co-math project state, instead of saving only free-form assistant text.

**Architecture:** Keep the co-math assistant as an example extension under `packages/coding-agent/examples/extensions/co-math/`. Add a small no-dependency parser/validator in `role-runner.ts` that turns the final assistant message into the existing `RoleRunResult` shape. Update role prompts to require one final JSON envelope. Preserve the current safe ingestion path in `commands.ts`: workstream claims enter as `needs_review`, reviewer promotions must remain proof-backed and warning-free, and malformed role output must not mutate mathematical claim state.

**Tech Stack:** TypeScript, existing Pi JSON event stream runner, no new dependencies, Vitest targeted tests, existing co-math extension tests.

---

## 0. Alignment constraints from the co-math assistant paper

This implementation is meant to mirror the paper’s co-math assistant framework, not build a generic agent CLI.

The paper-relevant target is:

- stateful shared mathematical workspace;
- coordinator / workstream / reviewer / synthesizer roles;
- persistent claims, evidence, warnings, reports, and review queues;
- explicit provenance and failed-attempt/blocker preservation;
- cautious synthesis that separates proved, empirical, conjectural, blocked, and warning-bearing material;
- review discipline against pretty but unsupported mathematical prose.

Therefore this task must improve **artifact fidelity** only. It must not add autonomous background agents, theorem provers, provider abstractions, async orchestration, or core package changes.

---

## 1. Scope

### Allowed files

Codex may modify only these files unless Hermes explicitly expands scope:

```text
packages/coding-agent/examples/extensions/co-math/role-runner.ts
packages/coding-agent/examples/extensions/co-math/agents/coordinator.md
packages/coding-agent/examples/extensions/co-math/agents/workstream.md
packages/coding-agent/examples/extensions/co-math/agents/reviewer.md
packages/coding-agent/examples/extensions/co-math/agents/synthesizer.md
packages/coding-agent/examples/extensions/co-math/README.md
packages/coding-agent/test/co-math-role-runner.test.ts
packages/coding-agent/test/co-math-extension.test.ts
```

`commands.ts` should not need changes because it already ingests `RoleRunResult.proposedClaims`, `reviewDecision`, and `blockers`. If Codex believes `commands.ts` must change, it must stop and explain why before editing.

### Explicit non-goals

Do not implement:

- autonomous long-running/background agents;
- parallel workstream scheduling;
- theorem prover integration;
- LaTeX working-paper generation;
- provider/model configuration changes;
- new package dependencies;
- core Pi extension API changes;
- changes outside the co-math extension and listed tests;
- commits, unless the user explicitly asks Codex to commit.

---

## 2. Structured output contract

Each role prompt must require the final assistant response to be exactly one JSON object, with no surrounding prose unless the role is deliberately unable to produce valid JSON.

The JSON object must match this conceptual shape:

```json
{
  "summary": "Concise human-readable role report.",
  "proposedClaims": [
    {
      "statement": "Mathematical statement proposed by a workstream.",
      "evidence": [
        {
          "kind": "computation",
          "summary": "Exact provenance for the computation, proof, citation, counterexample search, or note."
        }
      ],
      "warnings": [
        {
          "severity": "high",
          "message": "Why this claim must remain tentative or reviewed."
        }
      ]
    }
  ],
  "reviewDecision": {
    "claimId": "claim-1",
    "status": "needs_review",
    "evidence": [
      {
        "kind": "proof",
        "summary": "Reviewer-checked proof evidence."
      }
    ],
    "warnings": [
      {
        "severity": "medium",
        "message": "Remaining gap or hidden assumption."
      }
    ],
    "resolvedWarningIds": ["warning-1"]
  },
  "blockers": ["Precise blocker, failed attempt, or missing lemma."]
}
```

Allowed values:

```text
evidence.kind: proof | computation | reference | counterexample | note
warning.severity: low | medium | high
reviewDecision.status: proved | needs_review | disproved
```

Role-specific expectations:

- `coordinator`: usually returns `summary` and `blockers`; may propose no claims. It should not mark claims proved.
- `workstream`: may return `proposedClaims`, each with provenance-rich evidence and warnings. Ingestion will still create them as `needs_review`.
- `reviewer`: may return `reviewDecision`. It must not use `proved` unless it supplies proof evidence and resolves or avoids open warnings.
- `synthesizer`: usually returns `summary` and `blockers`; actual `/comath synthesize` remains deterministic over reviewed state.

---

## 3. Parser behavior

Add and export a parser from `role-runner.ts`, for example:

```ts
export function parseRoleRunOutput(text: string): RoleRunResult
```

Expected behavior:

1. Try to parse the final assistant text as JSON.
2. Also accept a single fenced JSON block, because some models may return a final message that starts with a JSON fence and contains only the structured object inside that fence.

3. Validate only the current `RoleRunResult` fields:
   - `summary` must be a non-empty string to be accepted as structured output.
   - `proposedClaims`, when present, must be an array of objects with non-empty `statement`.
   - proposed evidence must have valid `kind` and non-empty `summary`.
   - proposed warnings must have valid `severity` and non-empty `message`.
   - `reviewDecision`, when present, must have non-empty `claimId` and valid `status`.
   - `resolvedWarningIds`, when present, must be an array of non-empty strings.
   - `blockers`, when present, must be an array of non-empty strings.
4. Ignore unknown extra fields. Do not preserve them.
5. On malformed JSON or invalid structured fields, return a safe fallback:

   ```ts
   {
     summary: text.trim() || "(no role output)",
     blockers: ["Role output was not valid structured co-math JSON; saved as report only."],
   }
   ```

6. The fallback must not include `proposedClaims` or `reviewDecision`, so malformed model output cannot mutate mathematical claims, evidence, warnings, or claim statuses.
7. Keep `stderr` behavior unchanged: `runPiRole` may still attach trimmed stderr to the returned result.

Important: parser failure should not throw during normal role runs. Throw only for process failures/aborts as today.

---

## 4. Task 1: Add parser RED tests

**Objective:** Specify valid and invalid structured role-output behavior before implementation.

**Files:**

- Create: `packages/coding-agent/test/co-math-role-runner.test.ts`
- Modify later: `packages/coding-agent/examples/extensions/co-math/role-runner.ts`

**Step 1: Write failing tests**

Create `co-math-role-runner.test.ts` with tests that import `parseRoleRunOutput` from `../examples/extensions/co-math/role-runner.ts`.

Cover at least these cases:

1. Parses a plain JSON object with:
   - `summary`
   - one `proposedClaims` item
   - computation evidence
   - high warning
   - blocker
2. Parses a fenced ` ```json ... ``` ` block.
3. Parses a reviewer `reviewDecision` with:
   - `claimId`
   - `status: "proved"`
   - proof evidence
   - `resolvedWarningIds`
4. Falls back safely for non-JSON prose:
   - preserves the prose as `summary`
   - includes the structured-output blocker
   - has no `proposedClaims`
   - has no `reviewDecision`
5. Falls back safely for invalid enum values, e.g. `kind: "experiment"` or `severity: "urgent"`.
6. Ignores unknown extra fields in otherwise valid JSON.

**Step 2: Run test to verify RED**

From `packages/coding-agent` run:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-role-runner.test.ts
```

Expected: FAIL because `parseRoleRunOutput` is not exported yet.

Do not proceed until the failure is the expected missing-export/missing-function failure, not an import path or environment error.

---

## 5. Task 2: Implement parser in `role-runner.ts`

**Objective:** Make the RED parser tests pass with minimal no-dependency validation code.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/role-runner.ts`

**Implementation notes:**

- Use top-level imports only; no dynamic imports.
- Do not use `any`.
- Do not use `enum`, namespace, or other non-erasable TypeScript syntax.
- Keep helpers local to `role-runner.ts` unless reuse is already needed.
- Prefer explicit type guards:
  - `isEvidenceKind(value: unknown): value is EvidenceKind`
  - `isWarningSeverity(value: unknown): value is WarningSeverity`
  - `isReviewStatus(value: unknown): value is ReviewDecision["status"]`
- Reuse existing `getObject` if appropriate.
- Validation should be strict for known fields but ignore unknown fields.

**Step 1: Implement only enough parser code to pass the tests.**

Suggested helper structure:

```text
parseRoleRunOutput(text)
  -> parseStructuredJsonText(text)
  -> toRoleRunResult(parsed, originalText)
  -> parseProposedClaims(...)
  -> parseProposedEvidence(...)
  -> parseProposedWarnings(...)
  -> parseReviewDecision(...)
  -> parseStringArray(...)
  -> fallbackRoleRunResult(originalText)
```

**Step 2: Run parser tests to verify GREEN**

From `packages/coding-agent`:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-role-runner.test.ts
```

Expected: PASS.

---

## 6. Task 3: Wire parser into real Pi role runs

**Objective:** Ensure default role execution returns structured `RoleRunResult` when the model follows the prompt.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/role-runner.ts`

**Change:**

In `runPiRole`, replace the final return shape that currently does this:

```ts
return {
  summary: finalSummary || "(no role output)",
  stderr: stderr.trim() || undefined,
};
```

with logic equivalent to:

```text
const result = parseRoleRunOutput(finalSummary)
return { ...result, stderr: trimmed stderr if present }
```

Do not change process invocation, abort handling, stderr collection, or Pi JSON event parsing.

**Step 1: Add or extend tests**

Prefer adding focused parser tests unless a process-level test is easy without real Pi invocation. Do not call real providers or real model APIs in tests.

If adding an integration-style test, it must use existing fake runners/harnesses only.

**Step 2: Run targeted tests**

From `packages/coding-agent`:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-role-runner.test.ts test/co-math-extension.test.ts
```

Expected: PASS.

---

## 7. Task 4: Update role prompts to demand the JSON envelope

**Objective:** Make actual coordinator/workstream/reviewer/synthesizer runs likely to produce parser-compatible output.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/agents/coordinator.md`
- Modify: `packages/coding-agent/examples/extensions/co-math/agents/workstream.md`
- Modify: `packages/coding-agent/examples/extensions/co-math/agents/reviewer.md`
- Modify: `packages/coding-agent/examples/extensions/co-math/agents/synthesizer.md`
- Modify if needed: `packages/coding-agent/test/co-math-extension.test.ts`

**Prompt requirements:**

Each role prompt must add a section like:

```text
## Required final output

Your final assistant message must be exactly one JSON object and no surrounding prose.
Use this schema:
...
If you have no claims, evidence, warnings, review decision, or blockers, omit those fields or use empty arrays.
Never invent claim ids. Reviewer decisions must use the target claim id provided in the task.
Do not set reviewDecision.status to proved unless proof evidence is explicit and no attached warning remains open unless it is listed in resolvedWarningIds.
```

Role-specific refinements:

- Coordinator should emphasize workstream planning and blockers, not proof promotion.
- Workstream should emphasize `proposedClaims` with evidence/warnings and preserve failed attempts as `blockers`.
- Reviewer should emphasize `reviewDecision` and warning creation/resolution.
- Synthesizer should emphasize cautious summary only; deterministic `/comath synthesize` remains the authoritative synthesis path.

**Step 1: Write/adjust documentation artifact tests first**

In `co-math-extension.test.ts`, update the prompt documentation test so it checks for the new JSON-output discipline in each role prompt. Keep this narrow; do not overfit exact full prompt text.

Suggested expected phrases:

```text
exactly one JSON object
summary
proposedClaims
reviewDecision
blockers
```

**Step 2: Run RED for updated documentation test**

From `packages/coding-agent`:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts
```

Expected: FAIL until prompts are updated.

**Step 3: Update prompt files**

Add the JSON envelope instructions. Keep existing provenance/warning/proof-discipline text.

**Step 4: Run GREEN**

From `packages/coding-agent`:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts
```

Expected: PASS.

---

## 8. Task 5: Update README with structured-output behavior

**Objective:** Document that real role runs now use a structured JSON artifact protocol and malformed output is saved as report-only.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`
- Modify if needed: `packages/coding-agent/test/co-math-extension.test.ts`

**Step 1: Add documentation test first**

Extend the existing README documentation test to require phrases such as:

```text
structured JSON
report only
malformed
claims remain review-gated
```

**Step 2: Run RED**

From `packages/coding-agent`:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts
```

Expected: FAIL until README is updated.

**Step 3: Update README**

Add a short section explaining:

- role prompts ask for structured JSON;
- valid workstream JSON can create `needs_review` claims with evidence/warnings;
- valid reviewer JSON can update review state, subject to the proof/warning invariant;
- malformed role output is saved as a report with a blocker and does not mutate claims;
- this preserves the paper’s co-math assistant discipline of provenance, review, and uncertainty visibility.

**Step 4: Run GREEN**

From `packages/coding-agent`:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts
```

Expected: PASS.

---

## 9. Task 6: Final targeted verification

**Objective:** Prove the structured role-output change did not regress existing co-math behavior.

From `packages/coding-agent`, run:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-role-runner.test.ts test/co-math-state.test.ts test/co-math-extension.test.ts
```

Expected: all tests PASS.

Then from repo root, because production TypeScript changed, run:

```bash
npm run check
```

Expected: PASS with no errors, warnings, or infos requiring action.

Do not run `npm test` or `npm run build` unless the user explicitly asks.

---

## 10. Acceptance criteria

Implementation is acceptable only if all of these are true:

- `parseRoleRunOutput` is exported and covered by targeted tests.
- Valid plain JSON role output becomes a structured `RoleRunResult`.
- Valid fenced JSON role output becomes a structured `RoleRunResult`.
- Invalid JSON or invalid enum fields fall back to report-only behavior.
- Fallback output cannot create claims, evidence, warnings, or review decisions.
- `runPiRole` uses the parser for the final assistant text.
- Role prompts require exactly one final JSON object.
- README documents structured output and malformed-output safety.
- Existing claim-promotion invariant remains untouched.
- Existing deterministic `/comath synthesize` safety behavior remains untouched.
- No new dependencies are added.
- No autonomous/background agent behavior is added.
- Targeted tests pass.
- `npm run check` passes.
- Git diff touches only allowed files.

---

## 11. Suggested Codex handoff prompt

Use this prompt when asking Codex to implement:

```text
Implement docs/co-math-structured-role-output-plan.md exactly.

Constraints:
- Treat Hermes as the architectural owner; do not change scope.
- Touch only the allowed files listed in the plan.
- Do not edit commands.ts unless you stop and explain why first.
- Do not add dependencies.
- Do not add autonomous/background agents, theorem prover integration, provider changes, or core Pi API changes.
- Follow TDD: write failing tests first, run the specified RED commands, then implement minimal code.
- Do not run npm test or npm run build.
- After implementation, run:
  1. cd packages/coding-agent && node ../../node_modules/vitest/dist/cli.js --run test/co-math-role-runner.test.ts test/co-math-state.test.ts test/co-math-extension.test.ts
  2. cd ../.. && npm run check
- Do not commit unless I explicitly ask.
- Report exact commands and outputs.
```

---

## 12. Review checklist for Hermes after Codex finishes

Hermes should review:

- `git diff -- packages/coding-agent/examples/extensions/co-math packages/coding-agent/test/co-math-role-runner.test.ts packages/coding-agent/test/co-math-extension.test.ts`
- whether parser fallback truly prevents claim mutation;
- whether prompts still emphasize proof/warning/provenance discipline;
- whether README accurately states limitations;
- whether all verification commands passed with real output;
- whether the implementation still mirrors the co-math assistant paper as a stateful reviewed research workspace rather than drifting toward generic agent orchestration.
