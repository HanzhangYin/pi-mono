# Co-Math Review Rounds and Claim Revision Control Implementation Plan

> **For Hermes:** This is the next bounded phase after `docs/co-math-human-steering-run-recovery-plan.md`. Use subagent-driven-development for implementation. Hermes owns paper/framework alignment; Codex should implement only this plan.

**Goal:** Make reviewer passes and claim revisions first-class, auditable objects so the co-math workspace can track review loops, unresolved objections, and human/agent revisions without promoting claims unsafely.

**Architecture:** Keep the extension synchronous and command-driven. Use existing role runs, reports, warnings, events, artifacts, and human interventions as the substrate. Add review-round records linked to reviewer role runs and add explicit revision commands that preserve old claim text and route revised claims back through review.

**Tech Stack:** TypeScript, existing Pi coding-agent extension API, Vitest, existing `.pi/co-math/state.json` storage, no new dependencies.

---

## 0. Why this phase comes next

The current co-math scaffold now has:

- persistent goals/workstreams/claims/evidence/warnings/reports;
- structured role output;
- artifacts/events/provenance;
- durable role run records;
- human steering and stale-run recovery.

The next gap relative to the paper architecture is the **review loop**. Reviewer decisions are currently represented as events and report output, but there is no first-class record for:

- each review attempt on a claim;
- what the reviewer decided;
- whether the attempt accepted, rejected, or requested revision;
- which run/report/evidence/warnings belonged to that review;
- whether a claim has been revised after review feedback;
- how many review/revision cycles a claim has gone through.

The paper warns about pretty outputs masking weak arguments and reviewer-pleasing bias. First-class review rounds make the workspace more honest: review feedback becomes structured provenance rather than just prose buried in reports.

---

## 1. Framework alignment constraints

Source of truth: `/Users/hanzhangyin/Developer/2605.06651v2.pdf`, especially the architecture themes:

- stateful mathematical workspace;
- review loops and specialist reviewers;
- uncertainty and failed/partial attempts preserved;
- human steering without pretending notes are proof;
- living working paper/provenance as a later phase;
- caution against reviewer-pleasing or false-consensus outputs.

Required commitments:

1. A review round is provenance, not proof.
   - It records what the reviewer attempted/decided.
   - It must not bypass the existing proof-promotion invariant.

2. Revision preserves history.
   - Revising a claim must not overwrite the old statement silently.
   - It should create explicit revision provenance and return the claim to `needs_review`.

3. Reviewer status and claim status stay distinct.
   - A reviewer may attempt `proved`.
   - The claim may remain `needs_review` if proof evidence or warning conditions are not satisfied.
   - Review-round outcome should record this distinction.

4. Keep the system synchronous.
   - No async/background workers, queues, daemons, retries, or scheduler behavior.

Unacceptable drift:

- changing proof-promotion rules;
- treating a revision note or human note as proof evidence;
- deleting previous claim text/history;
- adding model/provider changes;
- broad refactors of role execution;
- new dependencies.

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

---

## 3. Explicit non-goals

Do not implement:

- async/background execution;
- queued runs;
- living-paper rendering;
- LaTeX export;
- theorem prover integration;
- automatic reviewer retry loops;
- automatic claim rewriting by the model;
- new role JSON fields;
- provider/model changes;
- new dependencies;
- commits.

---

## 4. Data model target

### 4.1 Add review-round status and outcome types

In `schema.ts`, add:

```ts
export type ReviewRoundStatus = "open" | "completed";
export type ReviewRoundOutcome =
	| "accepted"
	| "rejected"
	| "revision_requested"
	| "blocked_by_invariant";
```

Semantics:

- `accepted`: reviewer decision and storage invariants allowed the claim to become `proved` or `disproved`.
- `rejected`: reviewer decision set claim to `disproved`.
- `revision_requested`: reviewer decision left claim in `needs_review` or `proof_sketch`, or added warnings/obligations requiring another pass.
- `blocked_by_invariant`: reviewer attempted `proved`, but the existing proof/warning invariant prevented promotion.

If the exact mapping is awkward, implement the closest deterministic mapping and document it in tests.

### 4.2 Add `ReviewRoundRecord`

In `schema.ts`, add:

```ts
export interface ReviewRoundRecord {
	id: string;
	claimId: string;
	roleRunId: string;
	reportId: string;
	status: ReviewRoundStatus;
	decisionStatus: ClaimStatus;
	outcome: ReviewRoundOutcome;
	createdEvidenceIds: string[];
	createdWarningIds: string[];
	resolvedWarningIds: string[];
	createdAt: string;
	updatedAt: string;
}
```

### 4.3 Add claim revision history

Add a lightweight revision record:

```ts
export interface ClaimRevisionRecord {
	id: string;
	claimId: string;
	previousStatement: string;
	revisedStatement: string;
	reason: string;
	actor: CoMathActor;
	createdAt: string;
}
```

Add to `CoMathProjectState`:

```ts
reviewRounds: ReviewRoundRecord[];
claimRevisions: ClaimRevisionRecord[];
```

### 4.4 Legacy normalization

Update state normalization so old state files load with:

```ts
reviewRounds: []
claimRevisions: []
```

---

## 5. Event model target

Add event kinds:

```ts
| "review_round_recorded"
| "claim_revised"
```

Use `review_round_recorded` when a reviewer run with a matching review decision is ingested.

Use `claim_revised` when `/comath revise-claim` changes a claim statement.

Do not remove or replace existing `review_decision_recorded`. The new review-round event is additional structured provenance.

---

## 6. Storage helper target behavior

### 6.1 `addReviewRound`

Add helper in `storage.ts`:

```ts
export interface AddReviewRoundInput {
	id: string;
	claimId: string;
	roleRunId: string;
	reportId: string;
	decisionStatus: ClaimStatus;
	outcome: ReviewRoundOutcome;
	createdEvidenceIds?: string[];
	createdWarningIds?: string[];
	resolvedWarningIds?: string[];
	now: string;
	actor?: CoMathActor;
}
```

Behavior:

- append `ReviewRoundRecord` with `status: "completed"`;
- append `review_round_recorded` event;
- related ids should include claim id, role run id, report id, and created/resolved ids where useful;
- do not mutate claim status itself.

### 6.2 `reviseClaim`

Add helper in `storage.ts`:

```ts
export interface ReviseClaimInput {
	id: string;
	claimId: string;
	revisedStatement: string;
	reason: string;
	now: string;
	actor?: CoMathActor;
}
```

Behavior:

- require the claim exists;
- require non-empty revised statement and reason;
- append `ClaimRevisionRecord` with previous and revised statement;
- update the claim statement;
- set claim status to `needs_review` unless it is already `needs_review`;
- do not delete existing evidence/warnings;
- ensure a review queue item exists for the claim;
- append `claim_revised` event;
- do not create proof evidence.

Important: do **not** clear warnings. A revised claim may still have open warnings; the user/reviewer must resolve them explicitly.

### 6.3 Outcome mapping helper

Add a small pure helper, either exported or local to `commands.ts`, to map reviewer ingestion to review-round outcome.

Suggested logic after `ingestReviewerDecision` has run:

```ts
if (decision.status === "proved") {
	if (finalClaim.status === "proved") return "accepted";
	return "blocked_by_invariant";
}
if (decision.status === "disproved") return "rejected";
return "revision_requested";
```

If `decision.status === "proof_sketch"`, outcome should be `revision_requested`.

---

## 7. Command target behavior

### 7.1 Reviewer run ingestion creates review round

Update `/comath run reviewer <claim-id>` path:

- after reviewer decision ingestion and run finishing, create exactly one `ReviewRoundRecord` when:
  - `targetClaim` exists;
  - `result.reviewDecision` exists;
  - `result.reviewDecision.claimId === targetClaim.id`.
- Link to the current run id and report id.
- Include created evidence/warning ids from that reviewer run.
- Include resolved warning ids from the decision, but only those that actually exist and are resolved after ingestion.
- Preserve `review_decision_recorded` event behavior.

If reviewer output has no usable review decision, do not create a review round. It remains a role run + report only.

### 7.2 `/comath reviews [claim-id]`

Add command:

```text
/comath reviews [claim-id]
```

Behavior:

- without claim id: list recent review rounds newest-first;
- with claim id: list rounds for that claim;
- include round id, claim id, outcome, decision status, run id, report id, created evidence/warning counts, resolved warning counts.

Example output:

```text
Co-math review rounds
- review-round-2 claim-1 [blocked_by_invariant] decision=proved run=role-run-4 report=report-4 warnings+1 resolved=0
- review-round-1 claim-1 [revision_requested] decision=needs_review run=role-run-2 report=report-2 evidence+1 warnings+1 resolved=0
```

### 7.3 `/comath revise-claim <claim-id>: <new statement> --reason <reason>`

Add command:

```text
/comath revise-claim claim-1: Revised statement text --reason Human clarified endpoint convention.
```

Behavior:

- require existing claim;
- require colon and non-empty revised statement;
- require `--reason` and non-empty reason;
- preserve old statement in `claimRevisions`;
- update claim statement;
- set status to `needs_review`;
- preserve evidence and warnings;
- ensure review queue item exists;
- append `claim_revised` event;
- optionally append `human_intervention_recorded` with the reason, but do not double-count if this makes tests brittle;
- show concise message.

Example output:

```text
Revised claim claim-1 and returned it to review: Human clarified endpoint convention.
```

### 7.4 `/comath claim-history <claim-id>`

Add command:

```text
/comath claim-history claim-1
```

Behavior:

- show current claim statement/status;
- show revisions oldest-first with previous/revised statement and reason;
- show review rounds for the claim oldest-first;
- show open warnings count.

Example output:

```text
Co-math claim history: claim-1
Current [needs_review]: Revised endpoint monotonicity statement.
Revisions:
- claim-revision-1: Initial endpoint claim -> Revised endpoint monotonicity statement. Reason: Human clarified endpoint convention.
Review rounds:
- review-round-1 [blocked_by_invariant] decision=proved report=report-2
Open warnings: 1
```

---

## 8. Audit behavior

Extend `/comath audit` checks:

- every review round claim id exists;
- every review round role run id exists;
- every review round report id exists;
- every review round created evidence/warning id exists;
- every resolved warning id exists;
- every claim revision claim id exists;
- a claim marked `proved` should still satisfy existing synthesis eligibility check;
- do not auto-fix anything.

---

## 9. Documentation target

Update README and state-tool descriptions to mention:

- review rounds;
- claim revision history;
- `/comath reviews`;
- `/comath revise-claim`;
- `/comath claim-history`;
- review rounds do not bypass proof-promotion invariants;
- revisions preserve previous statements and do not erase evidence/warnings.

---

## 10. TDD tasks

### Task 1: Add schema and legacy normalization

**Objective:** Introduce review round and claim revision state without breaking old state files.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/schema.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`
- Test: `packages/coding-agent/test/co-math-state.test.ts`

**RED tests:**

- `createInitialProjectState` includes empty `reviewRounds` and `claimRevisions`.
- legacy normalized state fills missing arrays.

Run:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts
```

Expected RED before implementation.

**GREEN:** Add types/state fields/normalization.

---

### Task 2: Add `addReviewRound`

**Objective:** Persist a structured review round and event.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`
- Test: `packages/coding-agent/test/co-math-state.test.ts`

**RED tests:**

- `addReviewRound` appends a completed round.
- `review_round_recorded` event is appended.
- related ids include claim/run/report.

**GREEN:** Implement helper.

---

### Task 3: Add `reviseClaim`

**Objective:** Preserve old claim statements while returning revised claims to review.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`
- Test: `packages/coding-agent/test/co-math-state.test.ts`

**RED tests:**

- revising a claim records previous/revised statement and reason;
- claim status becomes `needs_review`;
- evidence/warning ids are preserved;
- a review queue item exists;
- `claim_revised` event is appended;
- missing claim or empty fields throw.

**GREEN:** Implement helper.

---

### Task 4: Reviewer runs create review rounds

**Objective:** Link reviewer decisions to durable review-round records.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**RED tests:**

Through the slash-command fixture:

1. Workstream proposes a claim with warning.
2. Reviewer attempts `proved` without satisfying invariant.
3. Assert:
   - claim remains `needs_review`;
   - one review round exists;
   - outcome is `blocked_by_invariant`;
   - decision status is `proved`;
   - roleRunId/reportId are linked.

Add a second test where reviewer proves with proof evidence and resolved warning:

- claim becomes `proved`;
- review round outcome is `accepted`;
- created/resolved ids are recorded.

**GREEN:** Wire review-round creation into reviewer ingestion.

---

### Task 5: Add `/comath reviews`

**Objective:** Expose review rounds to the user.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**RED tests:**

- `/comath reviews` lists round id, claim id, outcome, decision, run id, report id.
- `/comath reviews claim-1` filters to that claim.
- missing claim with no rounds prints a clear empty message.

**GREEN:** Implement formatter and command branch.

---

### Task 6: Add `/comath revise-claim`

**Objective:** Let human corrections revise claims without losing provenance.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**RED tests:**

- command updates claim statement;
- creates claim revision record;
- sets status `needs_review`;
- preserves evidence/warnings;
- creates review queue item if missing;
- rejects missing `--reason`, missing colon, missing claim, empty statement, empty reason.

**GREEN:** Implement parser and command branch using `reviseClaim`.

---

### Task 7: Add `/comath claim-history`

**Objective:** Provide progressive disclosure for one claim's revision/review history.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**RED tests:**

- output includes current claim statement/status;
- output includes revisions;
- output includes review rounds;
- output includes open warning count;
- missing claim prints usage/not found.

**GREEN:** Implement formatter and command branch.

---

### Task 8: Extend audit

**Objective:** Catch dangling review round and claim revision links.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**RED tests:**

Create malformed persisted state with missing review round claim/run/report/evidence/warning links and missing claim revision claim id. `/comath audit` should report them and not mutate the state.

**GREEN:** Extend `collectAuditProblems`.

---

### Task 9: Update README and state-tool docs

**Objective:** Document review rounds and revision controls.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`
- Modify: `packages/coding-agent/examples/extensions/co-math/state-tool.ts`
- Test: `packages/coding-agent/test/co-math-extension.test.ts`

**RED tests:**

Add documentation assertions for:

```text
/comath reviews
/comath revise-claim
/comath claim-history
review rounds
claim revision history
proof-promotion invariant
```

**GREEN:** Update docs.

---

## 11. Final verification

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

Do not commit unless the user asks.

---

## 12. Codex handoff prompt

```text
Implement docs/co-math-review-rounds-claim-revisions-plan.md using strict TDD.

Scope:
- Add first-class ReviewRoundRecord state linked to reviewer role runs/reports/decisions.
- Add ClaimRevisionRecord state preserving old claim statements.
- Reviewer runs with valid reviewDecision create review rounds.
- Add /comath reviews, /comath revise-claim, and /comath claim-history.
- Extend audit/docs/state-tool/tests.

Allowed files:
- packages/coding-agent/examples/extensions/co-math/schema.ts
- packages/coding-agent/examples/extensions/co-math/storage.ts
- packages/coding-agent/examples/extensions/co-math/commands.ts
- packages/coding-agent/examples/extensions/co-math/state-tool.ts
- packages/coding-agent/examples/extensions/co-math/README.md
- packages/coding-agent/test/co-math-state.test.ts
- packages/coding-agent/test/co-math-extension.test.ts

Do not modify role-runner.ts, agents/*.md, package files, lockfiles, or unrelated code. If another file seems necessary, stop and explain before editing.

Non-goals:
- no async/background execution;
- no queued runs;
- no living-paper rendering or LaTeX export;
- no theorem prover/tool integration;
- no automatic reviewer retry loops;
- no new role JSON fields;
- no provider/model changes;
- no new dependencies;
- no claim promotion invariant changes;
- no commits.

TDD requirement:
For each task, write the failing test first, run it and report RED, implement minimal code, rerun and report GREEN.

Final verification to report exactly:
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts

cd /Users/hanzhangyin/Developer/pi-mono-comath
npm run check
git diff --check
```

---

## 13. Hermes review checklist

After Codex returns, Hermes should verify:

- changed files stay within allowed set;
- legacy state normalization works;
- reviewer runs create one review round when and only when a valid matching review decision exists;
- attempted `proved` decisions blocked by invariant create `blocked_by_invariant` rounds and do not promote the claim;
- accepted review rounds do not bypass proof/warning requirements;
- claim revisions preserve old statement, reason, evidence, and warnings;
- revised claims return to review;
- review/history commands expose provenance clearly;
- audit catches dangling review/revision links and remains read-only;
- no async/background/new dependencies/provider changes;
- targeted tests and `npm run check` pass.
