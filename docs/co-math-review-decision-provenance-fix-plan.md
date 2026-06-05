# Co-Math Review Decision Provenance Fix Plan

> **For Hermes:** This is a bounded follow-up to Codex's implementation of `docs/co-math-workspace-events-artifacts-plan.md`. Hermes should review the final diff before commit. This is not a new architecture milestone.

**Goal:** Fix two provenance gaps in the current workspace events/artifacts implementation: reviewer decisions must be recorded as explicit durable events, and warning-resolution events must not claim that nonexistent warnings were resolved.

**Architecture:** Keep the current events/artifacts design. Add one focused storage helper for `review_decision_recorded`, tighten `resolveWarning` so it is no-op for unknown/already-resolved warnings, and update reviewer-ingestion tests. Do not add review-round objects, new commands, new dependencies, or broader event/audit refactors in this patch.

**Tech Stack:** TypeScript, existing co-math extension, Vitest, no new dependencies.

---

## 0. Why this follow-up is necessary

The events/artifacts implementation passes tests and full repo checks, but independent review found two architectural blockers:

1. `schema.ts` defines `review_decision_recorded`, but no code emits it.
   - A reviewer decision is currently only visible indirectly through `role_report_saved`, evidence/warning mutations, `claim_status_changed`, or `review_requested`.
   - If a reviewer attempts `proved` and promotion is blocked by invariants, there is no explicit event recording the attempted decision status.
   - This weakens the provenance discipline required by the co-math framework.

2. `resolveWarning` always appends `warning_resolved`, even when the warning id does not exist.
   - Reviewer JSON can include arbitrary `resolvedWarningIds`.
   - A valid structured reviewer output can therefore create false durable provenance saying a nonexistent warning was resolved.

This patch should fix those two issues only.

---

## 1. Scope

### Allowed files

Codex may modify only:

```text
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/examples/extensions/co-math/commands.ts
packages/coding-agent/test/co-math-state.test.ts
packages/coding-agent/test/co-math-extension.test.ts
```

If Codex believes any other file must change, stop and explain why before editing.

### Explicit non-goals

Do not implement:

- review-round records;
- new slash commands;
- audit expansion for every event/artifact related id;
- event-log pruning/pagination;
- provider/model changes;
- autonomous/background behavior;
- new dependencies;
- commits.

---

## 2. Required behavior

### 2.1 Add explicit review-decision events

Add and export a small storage helper in `storage.ts`:

```ts
export interface AddReviewDecisionEventInput {
	claimId: string;
	status: "proved" | "needs_review" | "disproved";
	reportId: string;
	now: string;
	actor?: CoMathActor;
}

export function addReviewDecisionEvent(
	state: CoMathProjectState,
	input: AddReviewDecisionEventInput,
): CoMathProjectState {
	return appendEvent(state, {
		kind: "review_decision_recorded",
		actor: input.actor,
		summary: `Recorded review decision for ${input.claimId}: ${input.status}`,
		subjectId: input.claimId,
		relatedIds: [input.reportId],
		now: input.now,
	});
}
```

Notes:

- `subjectId` should be the reviewed claim id.
- `relatedIds` must include the saved report id so the decision can be traced to the role report.
- It is acceptable to include only `[reportId]` because `subjectId` already names the claim.
- Emit this event for every structurally valid reviewer decision whose `claimId` matches the target claim.
- Emit it before attempting proof promotion, so blocked `proved` attempts are still recorded.
- Do not emit it when `decision.claimId !== input.targetClaim.id`; that mismatch remains ignored by the current safe ingestion path.

### 2.2 Avoid false warning-resolved events

Update `resolveWarning` so it does not append a `warning_resolved` event unless the warning exists and is currently open.

Expected behavior:

```text
unknown warning id      -> return original state unchanged
already resolved warning -> return original state unchanged
open warning id         -> mark resolved and append warning_resolved event
```

This prevents reviewer-provided bogus `resolvedWarningIds` from polluting the event log.

Do not throw for unknown warning ids in `resolveWarning`; reviewer ingestion should stay tolerant. Manual `/comath resolve-warning` already checks existence before calling it.

---

## 3. TDD tasks

### Task 1: Test warning resolution provenance safety

**Files:**

- Modify: `packages/coding-agent/test/co-math-state.test.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`

**Step 1: Write failing tests**

Add `resolveWarning` to the imports if not already imported.

Add:

```ts
it("does not append warning resolved events for unknown warning ids", () => {
	const state = createProject();
	const nextState = resolveWarning(state, {
		warningId: "warning-missing",
		now: FIXED_NOW,
		actor: "reviewer",
	});

	expect(nextState).toBe(state);
	expect(nextState.events.map((event) => event.kind)).toEqual(["project_initialized"]);
});
```

Add:

```ts
it("does not append duplicate warning resolved events", () => {
	let state = addClaim(createProject(), {
		id: "claim-1",
		workstreamId: "workstream-1",
		statement: "A warning can be resolved once.",
		status: "needs_review",
		now: FIXED_NOW,
		actor: "workstream",
	});
	state = addWarning(state, {
		id: "warning-1",
		claimId: "claim-1",
		severity: "medium",
		message: "Gap to resolve.",
		now: FIXED_NOW,
		actor: "reviewer",
	});
	state = resolveWarning(state, {
		warningId: "warning-1",
		now: FIXED_NOW,
		actor: "reviewer",
	});
	const afterDuplicate = resolveWarning(state, {
		warningId: "warning-1",
		now: FIXED_NOW,
		actor: "reviewer",
	});

	expect(afterDuplicate).toBe(state);
	expect(afterDuplicate.events.filter((event) => event.kind === "warning_resolved")).toHaveLength(1);
});
```

**Step 2: Run RED test**

From `packages/coding-agent`:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts
```

Expected: FAIL until `resolveWarning` is fixed.

**Step 3: Implement minimal fix**

In `storage.ts`, make `resolveWarning` find the warning first:

```ts
const warning = state.warnings.find((candidate) => candidate.id === input.warningId);
if (!warning || warning.status === "resolved") {
	return state;
}
```

Then keep the existing append-event behavior for open warnings.

**Step 4: Run GREEN test**

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts
```

Expected: PASS.

---

### Task 2: Record reviewer decisions explicitly

**Files:**

- Modify: `packages/coding-agent/test/co-math-state.test.ts`
- Modify: `packages/coding-agent/test/co-math-extension.test.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`

**Step 1: Write storage-helper test**

Add `addReviewDecisionEvent` to imports in `co-math-state.test.ts`.

Add:

```ts
it("records review decision events linked to the saved report", () => {
	let state = createProject();
	state = addReviewDecisionEvent(state, {
		claimId: "claim-1",
		status: "proved",
		reportId: "report-1",
		now: FIXED_NOW,
		actor: "reviewer",
	});

	expect(state.events.at(-1)).toEqual({
		id: "event-2",
		kind: "review_decision_recorded",
		actor: "reviewer",
		summary: "Recorded review decision for claim-1: proved",
		subjectId: "claim-1",
		relatedIds: ["report-1"],
		createdAt: FIXED_NOW,
	});
});
```

**Step 2: Write ingestion test for blocked proof attempt**

In `co-math-extension.test.ts`, add a test that a reviewer decision with status `proved` is recorded even when promotion fails due to unresolved warning or missing proof evidence.

Suggested structure:

```ts
it("records reviewer decisions even when proof promotion is blocked by invariants", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-review-decision-event-"));
	try {
		const { commands, notifications } = createCoMathExtensionFixture({
			roleRunner: async () => ({
				summary: "Reviewer attempted promotion but left a gap.",
				reviewDecision: {
					claimId: "claim-1",
					status: "proved",
				},
			}),
		});
		const command = commands.get("comath");
		const ctx = createCommandContext(notifications, tempDir);

		await command?.handler("init Study endpoint behavior", ctx);
		await command?.handler("goal Preserve review decisions", ctx);
		await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
		await command?.handler("run workstream workstream-endpoints", ctx);
		await command?.handler("run reviewer claim-1", ctx);

		const state = await loadProjectState(getDefaultStatePath(tempDir));
		expect(state?.claims[0]?.status).toBe("needs_review");
		expect(state?.events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "review_decision_recorded",
					actor: "reviewer",
					subjectId: "claim-1",
					relatedIds: ["report-2"],
					summary: "Recorded review decision for claim-1: proved",
				}),
			]),
		);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
```

If the setup needs an initial claim, reuse an existing workstream role test pattern that creates `claim-1` with proposed claims.

**Step 3: Run RED tests**

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-extension.test.ts
```

Expected: FAIL until the helper and ingestion call are implemented.

**Step 4: Implement helper and wire it**

In `storage.ts`, add `AddReviewDecisionEventInput` and `addReviewDecisionEvent` as described in section 2.1.

In `commands.ts`:

- import `addReviewDecisionEvent`;
- in `ingestReviewerDecision`, after confirming `decision.claimId === input.targetClaim.id`, call it before resolving warnings or adding evidence:

```ts
let nextState = addReviewDecisionEvent(state, {
	claimId: decision.claimId,
	status: decision.status,
	reportId: input.reportId,
	now: input.now,
	actor: input.role,
});
```

Then continue the existing logic using that `nextState`.

**Step 5: Run GREEN tests**

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-extension.test.ts
```

Expected: PASS.

---

## 4. Required verification

Run from `packages/coding-agent`:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts
```

Expected: all co-math tests pass.

Run from repo root:

```bash
npm run check
```

Expected: full check passes.

Also report:

```bash
git status --short
```

---

## 5. Acceptance criteria

This follow-up is done only if:

- `review_decision_recorded` is emitted for every matching reviewer decision.
- The event is emitted even when a requested `proved` promotion is blocked by proof/warning invariants.
- The review-decision event links to the saved report id.
- Reviewer decisions with mismatched `claimId` remain ignored and do not emit the event.
- `resolveWarning` returns the original state unchanged for unknown warning ids.
- `resolveWarning` returns the original state unchanged for already resolved warnings.
- No false `warning_resolved` event is created for unknown or already resolved warnings.
- Existing proof-promotion invariants remain unchanged.
- No files outside the allowed scope are changed.
- Targeted tests and `npm run check` pass.

---

## 6. Codex handoff prompt

```text
Implement docs/co-math-review-decision-provenance-fix-plan.md.

This is a bounded fix, not a new feature milestone. Touch only:
- packages/coding-agent/examples/extensions/co-math/storage.ts
- packages/coding-agent/examples/extensions/co-math/commands.ts
- packages/coding-agent/test/co-math-state.test.ts
- packages/coding-agent/test/co-math-extension.test.ts

Do not add dependencies, commands, review-round objects, provider/model changes, or commits.

Fix exactly two issues:
1. Emit explicit `review_decision_recorded` events for matching reviewer decisions, linked to the saved report id, including attempted `proved` decisions that fail promotion invariants.
2. Prevent `resolveWarning` from appending `warning_resolved` events for unknown or already resolved warnings.

Follow TDD. Run:
cd packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts
cd ../..
npm run check

git status --short

Report exact outputs and summarize every changed file. Stop if you think an unlisted file must change.
```
