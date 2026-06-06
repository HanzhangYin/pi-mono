# Co-Math Review Rounds Correctness Fix Implementation Plan

> **For Hermes:** This is a bounded fix plan for the implementation of `docs/co-math-review-rounds-claim-revisions-plan.md`. Do not start the next architecture phase until this plan is implemented and independently verified.

**Goal:** Fix review-round correctness gaps so review outcomes faithfully represent invariant-blocked proof attempts, `proof_sketch` reviewer decisions, and claim-history chronology.

**Architecture:** Keep the extension synchronous and command-driven. Do not add new top-level architecture. Repair the reviewer ingestion/outcome logic and parser/test surface so review rounds remain honest provenance and never imply acceptance when proof/warning invariants are unsatisfied.

**Tech Stack:** TypeScript, existing Pi coding-agent extension API, Vitest, existing `.pi/co-math/state.json` storage, no new dependencies.

---

## 0. Why this fix is required

The review-rounds implementation passes the automated suite, but independent review found correctness blockers.

The blockers are architectural, not formatting issues:

1. A reviewer run can record outcome `accepted` even when a later review attaches a new unresolved warning to an already-proved claim.
2. The plan says reviewer `proof_sketch` decisions should map to `revision_requested`, but `role-runner.ts` currently rejects `proof_sketch` review decisions.
3. `/comath claim-history` displays revisions/review rounds newest-first, but the plan requested oldest-first.

Do not proceed to the next phase until these are fixed.

---

## 1. Allowed files

Codex may modify only:

```text
packages/coding-agent/examples/extensions/co-math/commands.ts
packages/coding-agent/examples/extensions/co-math/role-runner.ts
packages/coding-agent/examples/extensions/co-math/README.md
packages/coding-agent/examples/extensions/co-math/state-tool.ts
packages/coding-agent/test/co-math-extension.test.ts
packages/coding-agent/test/co-math-role-runner.test.ts
packages/coding-agent/test/co-math-state.test.ts
```

Only modify `schema.ts` or `storage.ts` if a test demonstrates it is unavoidable. The expected fix should not require new schema fields.

Do not modify:

```text
package.json
npm-shrinkwrap.json
packages/coding-agent/examples/extensions/co-math/agents/*.md
unrelated packages
```

No commits.

---

## 2. Explicit non-goals

Do not implement:

- async/background orchestration;
- living-paper rendering;
- LaTeX export;
- new review-round states or top-level state records;
- new dependencies;
- model/provider changes;
- autonomous retry loops;
- broad command refactors.

---

## 3. Fix target A: accepted outcome must respect current synthesis eligibility

### Problem

Current `getReviewRoundOutcome` treats a `proved` reviewer decision as accepted when the final claim status is `proved`:

```ts
if (decision.status === "proved") {
	const claim = state.claims.find((candidate) => candidate.id === decision.claimId);
	return claim?.status === "proved" ? "accepted" : "blocked_by_invariant";
}
```

This is insufficient. If the claim was already `proved` before the run, and the reviewer adds a new open warning in the same decision, `setClaimStatus(... proved ...)` throws, but the claim may remain `proved` from before. The review round then incorrectly records `accepted` even though the run introduced unresolved obligations.

### Required behavior

A `proved` review decision should record `accepted` only if the final claim is synthesis-eligible after all evidence/warnings/resolutions from the run are ingested.

Use the existing invariant helper if available:

```ts
isClaimSynthesisEligible(state, decision.claimId)
```

Target logic:

```ts
if (decision.status === "proved") {
	return isClaimSynthesisEligible(state, decision.claimId) ? "accepted" : "blocked_by_invariant";
}
```

If `isClaimSynthesisEligible` is not currently imported into `commands.ts`, import it from `storage.ts` if exported. If not exported, either export it or compute the same predicate using existing claim/evidence/warning state. Prefer reusing/exporting the existing helper over duplicating logic.

### RED test

Add an integration test in `packages/coding-agent/test/co-math-extension.test.ts`:

Scenario:

1. Create/init a project.
2. Create a workstream and claim that is already legitimately `proved` with proof evidence and no open warnings.
3. Run reviewer for that claim with a decision:
   - `status: "proved"`
   - includes valid proof evidence if needed
   - includes a new warning, e.g. `{ severity: "high", message: "New gap" }`
4. Assert:
   - a review round is recorded;
   - `reviewRounds[0].outcome === "blocked_by_invariant"`;
   - the new warning exists and is open;
   - the claim is not synthesis-eligible;
   - the round is not `accepted`.

Expected RED before fix: outcome is incorrectly `accepted`.

### GREEN

Update outcome mapping to use synthesis eligibility / actual invariant satisfaction after ingestion.

---

## 4. Fix target B: support `proof_sketch` reviewer decisions

### Problem

`docs/co-math-review-rounds-claim-revisions-plan.md` says:

```text
If decision.status === "proof_sketch", outcome should be revision_requested.
```

But `role-runner.ts` currently parses reviewer decision status as only:

```text
proved | needs_review | disproved
```

So `proof_sketch` review decisions are treated as invalid structured output, saved as report-only fallback, and no review round is created.

### Required behavior

Accept `proof_sketch` as a valid `ReviewDecision.status`.

It should:

- parse successfully in `parseRoleRunOutput`;
- be ingested by reviewer runs;
- set the claim to `proof_sketch` through existing `setClaimStatus` behavior;
- create a review round with `outcome: "revision_requested"`;
- preserve the review queue behavior expected by existing claim status rules.

If setting claim status to `proof_sketch` currently removes the review queue item, adjust only if tests prove this contradicts intended behavior. Minimum required behavior for this fix is review-round creation and `revision_requested` outcome.

### RED tests

Add parser test in `packages/coding-agent/test/co-math-role-runner.test.ts`:

- `parseRoleRunOutput` accepts a JSON review decision with `status: "proof_sketch"`.
- The parsed `reviewDecision.status` is exactly `proof_sketch`.

Add integration test in `packages/coding-agent/test/co-math-extension.test.ts`:

- reviewer role returns reviewDecision `{ claimId: "claim-1", status: "proof_sketch" }`;
- one review round is recorded;
- outcome is `revision_requested`;
- decisionStatus is `proof_sketch`.

Expected RED before fix: parser fallback/no review round.

### GREEN

Update `role-runner.ts` status parser to include `proof_sketch`.

Do not add new role JSON fields.

---

## 5. Fix target C: claim-history should show chronological history oldest-first

### Problem

The original plan requires `/comath claim-history <claim-id>` to show revisions and review rounds oldest-first.

Current helper reuse appears to reverse rounds/revisions, so claim-history shows newest-first.

### Required behavior

For `/comath claim-history` only:

- revisions should be displayed oldest-first;
- review rounds should be displayed oldest-first.

It is acceptable for `/comath reviews` to remain newest-first as a recent-rounds list.

### RED test

Add integration test in `packages/coding-agent/test/co-math-extension.test.ts`:

1. Create two claim revisions for the same claim.
2. Create two review rounds for the same claim.
3. Run `/comath claim-history claim-1`.
4. Assert revision 1 appears before revision 2.
5. Assert review-round 1 appears before review-round 2.

Expected RED before fix: newest appears first.

### GREEN

Use a claim-history-specific formatter or add a formatter option:

```ts
formatReviewRounds(rounds, { order: "oldest-first" })
formatClaimRevisions(revisions, { order: "oldest-first" })
```

Prefer the smallest local change.

---

## 6. Additional regression tests from independent review

Add tests if they are not already present. These protect the review-loop semantics and should be included in this fix if lightweight.

### 6.1 Rejected outcome

Reviewer decision `status: "disproved"` records:

```text
outcome = rejected
decisionStatus = disproved
```

### 6.2 Needs-review outcome

Reviewer decision `status: "needs_review"` records:

```text
outcome = revision_requested
decisionStatus = needs_review
```

### 6.3 No review round for mismatched decision

Reviewer run targeting `claim-1` with reviewDecision for `claim-999` should:

- save role run and report;
- not create a review round.

### 6.4 Exactly one review round per valid reviewer run

A valid matching reviewer run should create exactly one review round, not duplicates.

---

## 7. Verification

Run:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts

cd /Users/hanzhangyin/Developer/pi-mono-comath
npm run check
git diff --check
```

Expected:

- all targeted tests pass;
- full repo check passes;
- no diff whitespace errors.

Also report changed files. They should be limited to the allowed list above.

---

## 8. Codex handoff prompt

```text
Implement docs/co-math-review-rounds-correctness-fix-plan.md using strict TDD.

This is a bounded correctness fix for the review-rounds / claim-revisions implementation. Do not start the next architecture phase.

Fix these blockers:
1. Review-round outcome must not record accepted when a proved decision leaves the claim non-synthesis-eligible, especially when an already-proved claim receives a new open warning.
2. Accept proof_sketch as a valid reviewer reviewDecision.status and map it to revision_requested review-round outcome.
3. /comath claim-history must show claim revisions and review rounds oldest-first.

Allowed files:
- packages/coding-agent/examples/extensions/co-math/commands.ts
- packages/coding-agent/examples/extensions/co-math/role-runner.ts
- packages/coding-agent/examples/extensions/co-math/README.md
- packages/coding-agent/examples/extensions/co-math/state-tool.ts
- packages/coding-agent/test/co-math-extension.test.ts
- packages/coding-agent/test/co-math-role-runner.test.ts
- packages/coding-agent/test/co-math-state.test.ts

Only touch schema.ts/storage.ts if tests prove it is unavoidable. Do not modify package files, agents/*.md, provider/model code, or unrelated code. No new dependencies. No commits.

TDD requirement:
- Add RED tests first for each blocker.
- Run the targeted test and report the expected failure.
- Implement minimal GREEN fix.
- Re-run targeted tests.

Final verification to report exactly:
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts

cd /Users/hanzhangyin/Developer/pi-mono-comath
npm run check
git diff --check
```

---

## 9. Hermes review checklist

After Codex returns, Hermes should verify:

- outcome `accepted` is based on actual post-ingestion synthesis eligibility, not merely final `claim.status === "proved"`;
- already-proved claim + new open warning produces `blocked_by_invariant`;
- `proof_sketch` parses as a valid reviewer decision;
- `proof_sketch` reviewer run creates exactly one review round with `revision_requested`;
- `claim-history` order is oldest-first for revisions and review rounds;
- rejected and needs-review outcomes are covered;
- mismatched reviewDecision creates no review round;
- no proof-promotion invariant changes;
- no async/background/new deps/provider changes;
- targeted tests, `npm run check`, and `git diff --check` pass.
