# Co-Math Architecture Alignment Implementation Plan

> For Codex: implement this plan only after the user explicitly asks you to run Codex. Do not broaden scope, do not start daemon/background-worker work, and do not commit unless the user explicitly asks.

Goal: Align the current co-math prototype with the architecture described in `docs/2605.06651v2.pdf` by hardening state integrity, making goal approval explicit, and making workstream report review first-class while preserving mathematical uncertainty.

Architecture: Keep this as a narrow command/state/test improvement inside `packages/coding-agent/examples/extensions/co-math`. The prototype should remain a local stateful workspace with explicit user steering, durable provenance, review gates, and no hidden proof promotion. Do not introduce external services, new dependencies, a daemon, formal prover integration, or broad multi-agent orchestration in this milestone.

Tech Stack: TypeScript, Node built-ins only, Vitest targeted tests, existing co-math extension state and command helpers.

Reference context:
- Repo: `/home/hermes/developer/pi-mono-comath`
- Branch: `comath/prototype`
- Paper: `docs/2605.06651v2.pdf`
- Existing co-math docs: `packages/coding-agent/examples/extensions/co-math/README.md`
- Existing state schema: `packages/coding-agent/examples/extensions/co-math/schema.ts`
- Existing state helpers: `packages/coding-agent/examples/extensions/co-math/storage.ts`
- Existing commands: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Existing role runner: `packages/coding-agent/examples/extensions/co-math/role-runner.ts`
- Existing prompts: `packages/coding-agent/examples/extensions/co-math/agents/*.md`
- Existing tests: `packages/coding-agent/test/co-math-extension.test.ts`, `packages/coding-agent/test/co-math-state.test.ts`, `packages/coding-agent/test/co-math-role-runner.test.ts`
- Current active validation snapshot: `.pi/co-math/state.json`

Why this milestone:
- The paper architecture depends on durable state, approved goals, reviewed workstream outputs, and visible uncertainty.
- The current prototype has most of the skeleton, but the committed validation state uses older shape/status conventions than the current schema.
- Before adding bigger async agent systems, the local workspace must load, validate, and report state safely.

Non-goals:
- Do not implement a daemon or persistent external worker.
- Do not add automatic retries, hidden scheduling, or cloud execution.
- Do not add formal proof engines, AlphaProof/Aletheia/AlphaEvolve-style integrations, or model-specific behavior.
- Do not add external dependencies.
- Do not change proof-promotion invariants.
- Do not create claims/evidence/warnings automatically from computation artifacts.
- Do not generate PDF output.
- Do not rewrite the full co-math extension architecture.
- Do not modify `docs/2605.06651v2.pdf`.

Required verification commands:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

Expected final behavior:
- The committed `.pi/co-math/state.json` loads through `loadProjectState` without producing invalid runtime state.
- Legacy state records are normalized or explicitly archived without silently producing impossible current-schema values.
- Goals have an explicit approval lifecycle that matches the paper's onboarding phase.
- Workstream reports can enter a review lifecycle independent of individual claims.
- Status output surfaces approved goals, blocked workstreams, open warnings, and next safe actions.
- Existing proof-promotion rules remain intact: no claim is `proved` without proof evidence and no open attached warnings.

---

## Task 1: Add regression coverage for the committed validation state

Objective: Prove that `.pi/co-math/state.json` either loads as valid current state or exposes the current migration gap.

Files:
- Modify: `packages/coding-agent/test/co-math-state.test.ts`
- Read only: `.pi/co-math/state.json`

Steps:
1. Add a test near the existing state load/serialization tests.
2. Load the repo-root validation state with `loadProjectState`.
3. Assert that the state exists.
4. Assert every goal has current-schema fields and statuses.
5. Assert every claim status is one of the current schema statuses.
6. Assert every artifact kind is one of the current schema artifact kinds.

Suggested test shape:

```ts
it("loads the committed co-math validation state through current schema normalization", async () => {
	const state = await loadProjectState(join(process.cwd(), "..", "..", ".pi", "co-math", "state.json"));
	expect(state).toBeDefined();
	if (!state) return;

	for (const goal of state.approvedGoals) {
		expect(goal.id).toMatch(/^goal-/);
		expect(goal.text.length).toBeGreaterThan(0);
		expect(["active", "completed", "deferred"]).toContain(goal.status);
	}

	for (const claim of state.claims) {
		expect(["draft", "proof_sketch", "needs_review", "proved", "disproved"]).toContain(claim.status);
	}

	for (const artifact of state.artifacts) {
		expect([
			"computation",
			"latex_note",
			"proof_sketch",
			"counterexample_search",
			"reference",
			"dataset",
			"script",
			"figure",
			"failed_attempt",
			"human_note",
			"working_paper_export",
		]).toContain(artifact.kind);
	}
});
```

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts -t "committed co-math validation state"
```

Expected before implementation: likely FAIL because the committed validation state uses older fields such as goal `summary`, claim status `validated`, and artifact kinds like `source`, `data`, or `paper_export`.

Do not change production code in this task.

---

## Task 2: Normalize legacy validation state safely

Objective: Make old co-math state snapshots load into current schema without pretending old proof statuses are stronger than current invariants allow.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`
- Modify: `packages/coding-agent/test/co-math-state.test.ts`

Implementation rules:
- Preserve old text/content where possible.
- Never map legacy `validated` to current `proved` unless current proof-promotion invariants are satisfied.
- Prefer conservative mappings:
  - legacy claim status `validated` -> `needs_review`
  - legacy claim status `recorded` -> `draft`
  - unknown claim status -> `draft`
  - legacy artifact kind `source` -> `script`
  - legacy artifact kind `data` -> `dataset`
  - legacy artifact kind `paper_export` -> `working_paper_export`
- Convert old goal `summary` to current goal `text`.
- Fill missing timestamps from `updatedAt` or a stable fallback from state-level `updatedAt`.
- Ensure missing relationship arrays become empty arrays.
- Do not mutate the file during `loadProjectState`; normalization is in-memory only unless a command later saves state.

Suggested production changes:
- Extend legacy types enough to represent old goal/claim/evidence/warning/artifact shapes.
- Add small normalization helpers:
  - `normalizeGoal`
  - `normalizeClaim`
  - `normalizeEvidence`
  - `normalizeWarning`
  - `normalizeArtifact`
- Use these helpers from `normalizeProjectState`.

Suggested helper outline:

```ts
function normalizeClaimStatus(value: unknown): ClaimStatus {
	if (value === "draft" || value === "proof_sketch" || value === "needs_review" || value === "proved" || value === "disproved") {
		return value;
	}
	if (value === "validated") return "needs_review";
	return "draft";
}

function normalizeArtifactKind(value: unknown): ArtifactKind {
	if (isCurrentArtifactKind(value)) return value;
	if (value === "source") return "script";
	if (value === "data") return "dataset";
	if (value === "paper_export") return "working_paper_export";
	return "human_note";
}
```

Also add a focused unit test using an inline legacy state object so behavior is not tied only to the committed `.pi/co-math/state.json`.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts -t "legacy"
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts -t "committed co-math validation state"
```

Expected: PASS.

---

## Task 3: Add explicit goal approval lifecycle types

Objective: Represent the paper's initial exploration phase where goals are proposed, revised, and approved before downstream work.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/schema.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`
- Modify: `packages/coding-agent/test/co-math-state.test.ts`

Current type:

```ts
export type GoalStatus = "active" | "completed" | "deferred";
```

Change to:

```ts
export type GoalStatus = "proposed" | "approved" | "active" | "completed" | "deferred";
```

Compatibility rule:
- Existing manually added goals may remain `active` to avoid breaking old state.
- New coordinator-proposed goals should start as `proposed`.
- User-approved goals should become `approved`.
- Workstream dispatch may use `approved` or `active` goals for compatibility.

Add storage helpers:
- `proposeGoal(state, input)` or extend `addGoal` with optional `status`.
- `setGoalStatus(state, input)` with actor/event provenance.

Required event:
- Add a new event kind if necessary, e.g. `goal_status_changed`.
- If adding an event kind, update all TypeScript unions and tests.

Tests:
- Proposed goal is stored with status `proposed`.
- Approving a proposed goal changes status to `approved` and appends an event.
- Legacy states without goal status normalize to `active`.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts -t "goal"
```

---

## Task 4: Add user-facing goal proposal and approval commands

Objective: Expose explicit goal lifecycle commands without relying on hidden coordinator behavior.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`
- Modify: `packages/coding-agent/test/co-math-extension.test.ts`

Commands to add:

```text
/comath propose-goal <goal text>
/comath approve-goal <goal-id>
/comath defer-goal <goal-id>: <reason>
```

Behavior:
- `/comath propose-goal` creates a goal with status `proposed`.
- `/comath approve-goal` changes status from `proposed` or `active` to `approved`.
- `/comath defer-goal` changes status to `deferred` and records a human intervention event or goal status event with the reason.
- Existing `/comath goal` should remain available and can keep creating `active` goals for compatibility, or it can become an alias for `propose-goal` only if tests and README are updated carefully.

Do not remove existing `/comath goal` behavior unless the user explicitly asks for backward compatibility cleanup.

Tests:
1. `propose-goal` creates a proposed goal.
2. `approve-goal` approves it.
3. `defer-goal` defers it and records the reason.
4. Unknown goal id produces a clear message and does not mutate state.

Suggested test command sequence:

```ts
await command?.handler("init Study a finite permutation class", ctx);
await command?.handler("propose-goal Enumerate exact small examples", ctx);
await command?.handler("approve-goal goal-1", ctx);
```

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts -t "goal"
```

---

## Task 5: Gate new workstreams on approved or active goals

Objective: Match the paper's flow where workstreams are scheduled only after user-approved goals exist.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Modify: `packages/coding-agent/test/co-math-extension.test.ts`

Behavior:
- If a project has only `proposed` goals and no `approved`/`active` goals, `/comath workstream ...` should refuse with a message like:

```text
Approve at least one goal before creating workstreams.
```

- If a project has at least one `approved` or `active` goal, existing workstream creation behavior should continue.
- Workstreams should link only to `approved` or `active` goals by default, not `proposed` or `deferred` goals.

Tests:
1. Workstream creation is rejected when only proposed goals exist.
2. Workstream creation succeeds after approving a goal.
3. Deferred goals are not linked to new workstreams by default.
4. Existing active-goal flow still works for compatibility.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts -t "workstream"
```

---

## Task 6: Add report review lifecycle state

Objective: Make workstream reports reviewable as first-class artifacts, separate from claim review.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/schema.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`
- Modify: `packages/coding-agent/test/co-math-state.test.ts`

Add types:

```ts
export type ReportReviewStatus = "open" | "completed";
export type ReportReviewOutcome = "accepted" | "revision_requested" | "blocked";

export interface ReportReviewRoundRecord {
	id: string;
	reportId: string;
	roleRunId: string;
	status: ReportReviewStatus;
	outcome: ReportReviewOutcome;
	summary: string;
	createdWarningIds: string[];
	createdAt: string;
	updatedAt: string;
}
```

Add to `CoMathProjectState`:

```ts
reportReviewRounds: ReportReviewRoundRecord[];
```

Add event kind:

```ts
"report_review_round_recorded"
```

Storage behavior:
- New empty states initialize `reportReviewRounds: []`.
- Legacy states normalize missing `reportReviewRounds` to `[]`.
- Add helper `addReportReviewRound`.

Tests:
- Empty state includes `reportReviewRounds`.
- Legacy state missing the field normalizes to `[]`.
- Adding a report review round appends the record and an event.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts -t "report review"
```

---

## Task 7: Add report review command

Objective: Let users mark a report as reviewed, requiring explicit outcome and preserving blockers.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`
- Modify: `packages/coding-agent/test/co-math-extension.test.ts`

Command:

```text
/comath review-report <report-id> <accepted|revision-requested|blocked>: <summary>
```

Behavior:
- Requires existing report id.
- Creates one `ReportReviewRoundRecord`.
- For `accepted`, no automatic claim promotion occurs.
- For `revision-requested` or `blocked`, add a visible blocker summary to the review round.
- Do not create mathematical warnings unless the user uses `/comath warning` or a reviewer role explicitly returns warning output.

Tests:
1. Accepted report review records a completed accepted round.
2. Revision-requested report review records a completed revision-requested round.
3. Unknown report id is rejected without mutation.
4. Report review does not change claim status.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts -t "review-report"
```

---

## Task 8: Improve `/comath status` for progressive disclosure

Objective: Give the user a high-level coordinator view before they drill down into artifacts, timelines, and runs.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Modify: `packages/coding-agent/test/co-math-extension.test.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`

Status output should include:
- Root question/title.
- Goal counts by status: proposed, approved, active, completed, deferred.
- Workstream counts by status: active, running, blocked, needs_review.
- Open warning count.
- Open margin note count.
- Claims eligible for synthesis count.
- Pending review queue count.
- Report review summary: accepted/revision-requested/blocked counts.
- Next safe action suggestion.

Example next-action rules:
- If no goals exist: suggest `/comath propose-goal ...` or `/comath goal ...`.
- If proposed goals exist but none are approved/active: suggest `/comath approve-goal <goal-id>`.
- If approved/active goals exist but no workstreams: suggest `/comath workstream <slug>: <title>`.
- If open warnings exist: suggest reviewing `/comath warnings` or relevant claim history.
- If review queue has items: suggest `/comath run reviewer <claim-id>`.

Tests:
- Empty initialized project suggests adding/proposing goals.
- Project with only proposed goals suggests approval.
- Project with open warning includes warning count.
- Project with review queue includes queue count.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts -t "status"
```

---

## Task 9: Add `/comath workstream-status <id>` drill-down

Objective: Provide terminal-friendly progressive disclosure for one workstream.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`
- Modify: `packages/coding-agent/test/co-math-extension.test.ts`

Command:

```text
/comath workstream-status <workstream-id>
```

Output should include:
- Workstream id/title/status/status reason.
- Linked goals.
- Latest report ids.
- Latest run ids and statuses.
- Claim ids and statuses.
- Attached open warnings via linked claims.
- Related artifact ids if available.
- Suggested next action.

Tests:
1. Unknown workstream id is rejected cleanly.
2. Existing workstream status shows linked goals and status.
3. Blocked workstream shows blocker reason.
4. Workstream with claims shows claim statuses and open warning count.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts -t "workstream-status"
```

---

## Task 10: Update role prompts for architecture-aligned behavior

Objective: Make coordinator, workstream, reviewer, and synthesizer prompts match the explicit goal/report lifecycle.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/agents/coordinator.md`
- Modify: `packages/coding-agent/examples/extensions/co-math/agents/workstream.md`
- Modify: `packages/coding-agent/examples/extensions/co-math/agents/reviewer.md`
- Modify: `packages/coding-agent/examples/extensions/co-math/agents/synthesizer.md`
- Modify: `packages/coding-agent/test/co-math-role-runner.test.ts` only if parser/schema expectations change.

Prompt updates:
- Coordinator must distinguish proposed goals from approved goals.
- Coordinator should not schedule workstreams against unapproved goals unless explicitly instructed by the user.
- Workstream should produce reports and blockers, not just claims.
- Reviewer should distinguish claim review from report review.
- Synthesizer should preserve report review status and open warnings.

Do not change the structured JSON output schema unless absolutely necessary. If the role JSON schema must change, add parser tests first.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-role-runner.test.ts
```

---

## Task 11: Update README with the architecture-aligned workflow

Objective: Document the current intended user flow based on the paper architecture.

Files:
- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`

Add a section near the top:

```md
## Architecture-aligned workflow

1. Initialize a workspace with `/comath init <root question>`.
2. Propose goals with `/comath propose-goal <goal>` or add compatibility goals with `/comath goal <goal>`.
3. Approve goals explicitly with `/comath approve-goal <goal-id>` before creating workstreams.
4. Create narrow workstreams with `/comath workstream <slug>: <title>`.
5. Queue or run coordinator/workstream roles.
6. Record computations with `/comath computation --command ... --out ...` as provenance artifacts only.
7. Review claims with `/comath run reviewer <claim-id>` and reports with `/comath review-report ...`.
8. Preserve warnings, failed attempts, blockers, and margin notes.
9. Use `/comath status` for top-level state and `/comath workstream-status <id>` for drill-down.
10. Export the working paper only as a snapshot; exports are not proof certificates.
```

Also update the sample command list with the new commands.

---

## Task 12: Full targeted verification

Objective: Verify the architecture alignment without running the full Vitest suite.

Commands:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
git status --short --branch
```

Expected:
- All targeted co-math tests pass.
- `npm run check` passes with no errors, warnings, or infos.
- `git diff --check` is clean.
- `git status` shows only the files changed by this plan.

Do not run `npm test` or the full Vitest suite.
Do not run `npm run build` unless the user asks.
Do not commit unless the user asks.

---

## Risks and tradeoffs

- Legacy state normalization can accidentally overstate confidence. Use conservative status mappings and keep proof promotion gated.
- Adding goal statuses can ripple through status summaries and tests. Keep `active` compatibility until the user asks to remove old behavior.
- Report review can overlap with claim review. Keep the first implementation simple: report review records process status but does not mutate claim status.
- Improved status output may become verbose. Use concise top-level counts and provide drill-down through `workstream-status`.
- This milestone intentionally avoids daemonized async execution. That is a later architecture layer after local state and review semantics are reliable.

## Open questions for later

- Should `.pi/co-math/state.json` remain a committed active workspace state or move to an archived validation fixture path?
- Should role-run structured output grow a dedicated `proposedReports` or `reportReviewDecision` field?
- Should working paper sections require accepted report reviews before becoming `reviewed`?
- Should computation artifact provenance include input file hashes in a later schema version?
- Should LaTeX export be added after Markdown export semantics stabilize?

## Suggested Codex execution prompt

```text
Implement docs/codex-comath-architecture-alignment-plan.md exactly. Stay on branch comath/prototype. Do not commit. Do not broaden scope. Start by adding failing tests for the committed .pi/co-math/state.json legacy normalization. Keep proof-promotion invariants intact. Add explicit goal approval and report review lifecycle support. Run only the targeted co-math tests, npm run check, and git diff --check. Report exact files changed, commands run, results, and any deviations from the plan.
```
