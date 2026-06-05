# Co-Math Workspace Events and Artifacts Implementation Plan

> **For Hermes:** Use subagent-driven-development or an independent review pass to check the implementation against this plan. Codex may implement this plan only as a bounded coding worker. Hermes remains responsible for conceptual alignment with `/Users/hanzhangyin/Developer/2605.06651v2.pdf`, final review, verification, and any commit.

**Goal:** Add a durable workspace event log and artifact registry so the co-math extension records provenance for role runs, state mutations, failed attempts, computations, notes, and review decisions instead of keeping only the latest aggregate state.

**Architecture:** Keep the implementation inside the existing co-math example extension. Extend the persistent `.pi/co-math/state.json` model with `events` and `artifacts`, add no-dependency storage helpers that append provenance records when existing commands mutate state, and update role-output ingestion so structured role runs can register artifacts safely. Do not add autonomous scheduling, background agents, theorem proving, provider abstractions, or a working-paper generator in this milestone.

**Tech Stack:** TypeScript, existing Pi extension command framework, existing Pi JSON role runner, no new dependencies, Vitest targeted tests, existing `npm run check` verification.

---

## 0. Framework alignment constraints from the co-math assistant paper

Source of truth: `/Users/hanzhangyin/Developer/2605.06651v2.pdf`.

The paper-relevant target is a **stateful shared mathematical workspace**, not a generic project-management CLI. The implementation must strengthen these structural features:

- persistent project memory across interactions;
- coordinator / workstream / reviewer / synthesizer role separation;
- preserved provenance for claims, evidence, warnings, reports, and review decisions;
- preservation of failed attempts, blockers, computations, references, and human notes;
- review discipline that prevents attractive prose from silently becoming a theorem;
- progressive disclosure: users can ask for status, artifacts, and history without reading raw JSON.

This milestone should therefore add **workspace memory structure** only. A patch is unacceptable if it drifts toward:

- autonomous/background agents;
- task schedulers;
- theorem prover integration;
- generic issue tracking unrelated to the mathematical workspace;
- provider/model plumbing;
- broad refactors outside the co-math extension;
- pretty synthesis that hides warnings, failed attempts, or proof gaps.

---

## 1. Scope

### Allowed files

Codex may modify only these files unless Hermes explicitly expands scope:

```text
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/examples/extensions/co-math/commands.ts
packages/coding-agent/examples/extensions/co-math/role-runner.ts
packages/coding-agent/examples/extensions/co-math/state-tool.ts
packages/coding-agent/examples/extensions/co-math/agents/coordinator.md
packages/coding-agent/examples/extensions/co-math/agents/workstream.md
packages/coding-agent/examples/extensions/co-math/agents/reviewer.md
packages/coding-agent/examples/extensions/co-math/agents/synthesizer.md
packages/coding-agent/examples/extensions/co-math/README.md
packages/coding-agent/test/co-math-state.test.ts
packages/coding-agent/test/co-math-role-runner.test.ts
packages/coding-agent/test/co-math-extension.test.ts
```

`index.ts` should not need changes. Core Pi extension APIs should not need changes. If Codex believes either must change, stop and explain why before editing.

### Explicit non-goals

Do not implement:

- autonomous long-running or background agents;
- parallel workstream scheduling;
- claim-deduplication heuristics;
- theorem prover integration;
- LaTeX or markdown working-paper generation;
- provider/model configuration changes;
- new npm dependencies;
- schema libraries such as zod;
- core package API changes;
- changes outside the listed co-math files and tests;
- commits, unless the user explicitly asks Codex to commit.

---

## 2. Target data model

Modify `packages/coding-agent/examples/extensions/co-math/schema.ts`.

Add actor, event, and artifact types near the existing primitive union types:

```ts
export type CoMathActor = "human" | "system" | "coordinator" | "workstream" | "reviewer" | "synthesizer";

export type CoMathEventKind =
	| "project_initialized"
	| "goal_added"
	| "workstream_added"
	| "role_report_saved"
	| "claim_proposed"
	| "evidence_added"
	| "warning_added"
	| "warning_resolved"
	| "review_requested"
	| "review_decision_recorded"
	| "claim_status_changed"
	| "synthesis_generated"
	| "artifact_recorded";

export type ArtifactKind =
	| "computation"
	| "latex_note"
	| "proof_sketch"
	| "counterexample_search"
	| "reference"
	| "dataset"
	| "script"
	| "figure"
	| "failed_attempt"
	| "human_note";
```

Add the event record:

```ts
export interface CoMathEvent {
	id: string;
	kind: CoMathEventKind;
	actor: CoMathActor;
	summary: string;
	subjectId?: string;
	relatedIds: string[];
	createdAt: string;
}
```

Add the artifact record:

```ts
export interface ArtifactRecord {
	id: string;
	kind: ArtifactKind;
	title: string;
	summary: string;
	provenance?: string;
	path?: string;
	relatedClaimIds: string[];
	relatedWorkstreamIds: string[];
	relatedReportIds: string[];
	createdAt: string;
	updatedAt: string;
}
```

Extend `CoMathProjectState`:

```ts
export interface CoMathProjectState {
	version: 1;
	projectId: string;
	title: string;
	rootQuestion: string;
	approvedGoals: ApprovedGoal[];
	workstreams: Workstream[];
	claims: Claim[];
	evidence: Evidence[];
	warnings: Warning[];
	reports: Report[];
	reviewQueue: ReviewQueueItem[];
	artifacts: ArtifactRecord[];
	events: CoMathEvent[];
	updatedAt: string;
}
```

Keep `version: 1` for now. This is an additive prototype schema change. `loadProjectState` must normalize older version-1 state files that do not yet contain `artifacts` or `events`.

---

## 3. Storage behavior requirements

Modify `packages/coding-agent/examples/extensions/co-math/storage.ts`.

### 3.1 Add input fields

Add optional `actor?: CoMathActor` to mutating input interfaces where provenance matters:

```ts
export interface AddGoalInput {
	id: string;
	text: string;
	now: string;
	actor?: CoMathActor;
}
```

Apply the same pattern to:

```text
AddWorkstreamInput
AddClaimInput
AddEvidenceInput
AddWarningInput
AddReportInput
AddReviewQueueItemInput
ResolveWarningInput
SetClaimStatusInput
```

Add a new input:

```ts
export interface AddArtifactInput {
	id: string;
	kind: ArtifactKind;
	title: string;
	summary: string;
	provenance?: string;
	path?: string;
	relatedClaimIds?: string[];
	relatedWorkstreamIds?: string[];
	relatedReportIds?: string[];
	now: string;
	actor?: CoMathActor;
}
```

Default missing actors to `"system"` in storage helpers. Commands should pass `"human"` for explicit slash-command mutations and role names for role-ingested mutations.

### 3.2 Add private event helper

Add a private helper in `storage.ts`:

```ts
interface AppendEventInput {
	kind: CoMathEventKind;
	actor?: CoMathActor;
	summary: string;
	subjectId?: string;
	relatedIds?: string[];
	now: string;
}

function appendEvent(state: CoMathProjectState, input: AppendEventInput): CoMathProjectState {
	return {
		...state,
		events: [
			...state.events,
			{
				id: `event-${state.events.length + 1}`,
				kind: input.kind,
				actor: input.actor ?? "system",
				summary: input.summary,
				...(input.subjectId ? { subjectId: input.subjectId } : {}),
				relatedIds: input.relatedIds ?? [],
				createdAt: input.now,
			},
		],
		updatedAt: input.now,
	};
}
```

Keep event records small and deterministic. Do not store full role-output JSON or large artifact payloads inside events. Events are an index of what happened; reports/artifacts contain details.

### 3.3 Initialize and normalize state

`createEmptyProjectState` must now return:

```ts
artifacts: [],
events: [
	{
		id: "event-1",
		kind: "project_initialized",
		actor: "human",
		summary: `Initialized co-math project: ${input.rootQuestion}`,
		subjectId: input.projectId,
		relatedIds: [],
		createdAt: input.now,
	},
],
```

Add a normalizer used by `loadProjectState`:

```ts
function normalizeProjectState(value: CoMathProjectState): CoMathProjectState {
	return {
		...value,
		artifacts: value.artifacts ?? [],
		events: value.events ?? [],
	};
}
```

Because the type will say those fields exist, use an internal legacy type or safe casts if needed. Do not break loading existing `.pi/co-math/state.json` files created by the previous prototype.

### 3.4 Event logging for existing mutations

Each mutating storage helper should append a semantically meaningful event:

```text
addGoal                    -> goal_added
addWorkstream              -> workstream_added
addClaim                   -> claim_proposed
addEvidence                -> evidence_added
addWarning                 -> warning_added
resolveWarning             -> warning_resolved
addReviewQueueItem         -> review_requested, but only when it actually inserts a new queue item
addReport                  -> role_report_saved
setClaimStatus             -> claim_status_changed, but only after invariant checks pass
```

`removeReviewQueueItemsForClaim` does not need a new event in this milestone; the review decision or claim status event explains why the queue changed.

`serializeProjectState` should continue to produce deterministic tab-indented JSON with a trailing newline.

### 3.5 Add artifact storage helper

Add and export:

```ts
export function addArtifact(state: CoMathProjectState, input: AddArtifactInput): CoMathProjectState
```

Required behavior:

- create an `ArtifactRecord` with empty related arrays when omitted;
- append it to `state.artifacts`;
- append an `artifact_recorded` event;
- update `updatedAt`;
- do not write files or dereference paths;
- treat `path` as provenance metadata only.

Expected implementation shape:

```ts
export function addArtifact(state: CoMathProjectState, input: AddArtifactInput): CoMathProjectState {
	const artifact: ArtifactRecord = {
		id: input.id,
		kind: input.kind,
		title: input.title,
		summary: input.summary,
		...(input.provenance ? { provenance: input.provenance } : {}),
		...(input.path ? { path: input.path } : {}),
		relatedClaimIds: input.relatedClaimIds ?? [],
		relatedWorkstreamIds: input.relatedWorkstreamIds ?? [],
		relatedReportIds: input.relatedReportIds ?? [],
		createdAt: input.now,
		updatedAt: input.now,
	};

	return appendEvent(
		{
			...state,
			artifacts: [...state.artifacts, artifact],
			updatedAt: input.now,
		},
		{
			kind: "artifact_recorded",
			actor: input.actor,
			summary: `Recorded artifact ${input.id}: ${input.title}`,
			subjectId: input.id,
			relatedIds: [...artifact.relatedClaimIds, ...artifact.relatedWorkstreamIds, ...artifact.relatedReportIds],
			now: input.now,
		},
	);
}
```

---

## 4. Structured role-output extension

Modify `packages/coding-agent/examples/extensions/co-math/role-runner.ts`.

### 4.1 Add artifact output types

Import `ArtifactKind` from `schema.ts`.

Add:

```ts
export interface ProposedArtifact {
	kind: ArtifactKind;
	title: string;
	summary: string;
	provenance?: string;
	path?: string;
	relatedClaimIds?: string[];
	relatedWorkstreamIds?: string[];
}
```

Extend `RoleRunResult`:

```ts
export interface RoleRunResult {
	summary: string;
	proposedClaims?: ProposedClaim[];
	proposedArtifacts?: ProposedArtifact[];
	reviewDecision?: ReviewDecision;
	blockers?: string[];
	stderr?: string;
}
```

### 4.2 Parser behavior

Update `parseRoleRunOutput` validation so a valid JSON object may include `proposedArtifacts`.

Rules:

- `proposedArtifacts`, when present, must be an array;
- every artifact must have valid `kind`, non-empty `title`, and non-empty `summary`;
- optional `provenance` and `path` must be non-empty strings if present;
- optional `relatedClaimIds` and `relatedWorkstreamIds` must be arrays of non-empty strings if present;
- unknown extra fields are ignored;
- if any artifact is malformed, fall back to report-only exactly like existing malformed claim/review output;
- fallback must not include `proposedArtifacts`.

Allowed artifact kinds:

```text
computation | latex_note | proof_sketch | counterexample_search | reference | dataset | script | figure | failed_attempt | human_note
```

Do not let malformed model output create artifacts.

---

## 5. Command behavior

Modify `packages/coding-agent/examples/extensions/co-math/commands.ts`.

### 5.1 Imports and test-facing types

Import `addArtifact` and `ArtifactKind`.

Update local test-facing role result types in `co-math-extension.test.ts` as needed to include `proposedArtifacts`.

### 5.2 New user-facing commands

Extend `HELP_TEXT` with:

```text
/comath artifact <kind> <title>: <summary> - manually record a workspace artifact
/comath artifacts - list recorded artifacts
/comath timeline - show recent workspace events
```

Add subcommand branches:

```ts
if (subcommand === "artifact") {
	await addManualArtifact(pi, ctx, remainder);
	return;
}

if (subcommand === "artifacts") {
	await showArtifacts(pi, ctx);
	return;
}

if (subcommand === "timeline") {
	await showTimeline(pi, ctx);
	return;
}
```

Manual artifact command syntax:

```text
/comath artifact <kind> <title>: <summary>
```

Example:

```text
/comath artifact failed_attempt Endpoint induction attempt: Breaks when the right arm is empty; see notebook notes from 2026-06-05.
```

Parsing rules:

- first token is artifact kind;
- remaining text must contain `:`;
- text before `:` is `title`;
- text after `:` is `summary`;
- invalid kind or missing title/summary shows usage and does not mutate state;
- id format: `artifact-${existing.artifacts.length + 1}`;
- actor: `"human"`.

### 5.3 Ingest role-proposed artifacts

In `ingestRoleRunResult`, after adding the report and after any target validation, add role-proposed artifacts to state.

Rules:

- artifacts may be proposed by any role;
- every role-proposed artifact should be linked to the saved report via `relatedReportIds: [input.reportId]`;
- if the role run targeted a workstream, ensure `targetWorkstream.id` is included in `relatedWorkstreamIds` unless already present;
- if the role run targeted a claim, ensure `targetClaim.id` is included in `relatedClaimIds` unless already present;
- actor is `input.role`;
- id format: `artifact-${nextState.artifacts.length + 1}`;
- do not create files from artifact paths;
- do not mutate claims/evidence/warnings because of malformed role output; parser fallback already prevents malformed artifacts from appearing.

Implementation helper suggestion:

```ts
function ingestProposedArtifacts(state: CoMathProjectState, input: IngestRoleRunInput): CoMathProjectState {
	let nextState = state;
	for (const proposedArtifact of input.result.proposedArtifacts ?? []) {
		nextState = addArtifact(nextState, {
			id: `artifact-${nextState.artifacts.length + 1}`,
			kind: proposedArtifact.kind,
			title: proposedArtifact.title,
			summary: proposedArtifact.summary,
			provenance: proposedArtifact.provenance,
			path: proposedArtifact.path,
			relatedClaimIds: uniqueStrings([
				...(proposedArtifact.relatedClaimIds ?? []),
				...(input.targetClaim ? [input.targetClaim.id] : []),
			]),
			relatedWorkstreamIds: uniqueStrings([
				...(proposedArtifact.relatedWorkstreamIds ?? []),
				...(input.targetWorkstream ? [input.targetWorkstream.id] : []),
			]),
			relatedReportIds: [input.reportId],
			now: input.now,
			actor: input.role,
		});
	}
	return nextState;
}
```

Call this helper before returning from `ingestRoleRunResult`, including reviewer paths. Be careful not to skip artifact ingestion when a reviewer decision is present.

One safe structure:

```ts
let nextState = addReport(...);
nextState = ingestProposedArtifacts(nextState, input);
if (input.targetClaim && input.result.reviewDecision) {
	return ingestReviewerDecision(nextState, input);
}
...
```

### 5.4 Display commands

`/comath artifacts` should show a compact list, for example:

```text
Co-math artifacts
- artifact-1 [failed_attempt] Endpoint induction attempt: Breaks when the right arm is empty.
```

If empty:

```text
Co-math artifacts
No artifacts recorded.
```

`/comath timeline` should show the last 10 events in chronological order, for example:

```text
Co-math timeline
- event-1 [project_initialized] human: Initialized co-math project: Study endpoint behavior
- event-2 [goal_added] human: Added goal goal-1: Prove or refute the first case
```

If empty after loading a legacy state:

```text
Co-math timeline
No events recorded.
```

### 5.5 Status output

Update `/comath status` to include counts:

```text
Artifacts: N
Events: M
```

Do not dump all events in status. Use `/comath timeline` for that.

### 5.6 Synthesis event

When `/comath synthesize` is run, append a `synthesis_generated` event before or after rendering the deterministic synthesis message.

This command currently only displays a message. After this change it should save the state so the event is durable. The synthesis output should otherwise remain deterministic and cautious: only synthesis-eligible proved claims as findings, open warnings preserved.

---

## 6. Prompt and tool documentation updates

### 6.1 Role prompts

Update each prompt in `packages/coding-agent/examples/extensions/co-math/agents/*.md` so the final JSON schema includes optional `proposedArtifacts`.

Schema snippet to include where appropriate:

```json
{
  "summary": "Concise role report.",
  "proposedArtifacts": [
    {
      "kind": "failed_attempt",
      "title": "Short artifact title",
      "summary": "What was tried, computed, cited, or observed.",
      "provenance": "Where this came from: file path, command, citation, or role reasoning.",
      "path": "optional/local/path/or/reference",
      "relatedClaimIds": ["claim-1"],
      "relatedWorkstreamIds": ["workstream-small-examples"]
    }
  ],
  "blockers": ["Precise blocker or proof obligation."]
}
```

Role-specific guidance:

- coordinator: artifacts should usually be `human_note` or `failed_attempt` only if summarizing workspace-level observations;
- workstream: use `computation`, `counterexample_search`, `script`, `dataset`, `failed_attempt`, `proof_sketch`, or `reference` as appropriate;
- reviewer: use `proof_sketch`, `failed_attempt`, `reference`, or `human_note` to preserve checked objections and proof-gap analysis;
- synthesizer: may propose `latex_note` or `human_note`, but must not hide open warnings.

Do not encourage non-reviewer roles to make final proof promotions.

### 6.2 State tool prompt snippet

Update `state-tool.ts` prompt snippet or description to mention that the state includes events and artifacts. Do not change the tool API unless necessary; it can continue returning the full project-state JSON.

### 6.3 README

Update `README.md` to document:

- state now stores goals, workstreams, claims, evidence, warnings, reports, review queues, artifacts, and events;
- new `/comath artifact`, `/comath artifacts`, and `/comath timeline` commands;
- role JSON can include `proposedArtifacts`;
- artifact paths are metadata only; the extension does not read or write those paths;
- malformed role output remains report-only and cannot create artifacts or mutate mathematical state;
- event log is provenance, not a proof certificate.

---

## 7. TDD task list for Codex

Follow the tasks in order. Do not skip RED tests.

### Task 1: Add schema expectations for events and artifacts

**Objective:** Make tests describe the new state shape before implementation.

**Files:**

- Modify: `packages/coding-agent/test/co-math-state.test.ts`
- Later modify: `packages/coding-agent/examples/extensions/co-math/schema.ts`
- Later modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`

**Step 1: Write failing tests**

Add assertions to the existing `creates an empty project state...` test:

```ts
expect(state.artifacts).toEqual([]);
expect(state.events).toEqual([
	{
		id: "event-1",
		kind: "project_initialized",
		actor: "human",
		summary: "Initialized co-math project: Can a co-math assistant preserve proof gaps?",
		subjectId: "proj-test",
		relatedIds: [],
		createdAt: FIXED_NOW,
	},
]);
```

Add a test that a legacy saved state without `artifacts` and `events` normalizes on load:

```ts
it("normalizes legacy state files without events or artifacts", async () => {
	const tempDir = await mkdtemp(path.join(tmpdir(), "pi-comath-state-legacy-"));
	try {
		const statePath = getDefaultStatePath(tempDir);
		const legacy = createProject();
		const { artifacts: _artifacts, events: _events, ...legacyWithoutNewFields } = legacy;
		await saveProjectState(statePath, legacyWithoutNewFields as CoMathProjectState);

		const loaded = await loadProjectState(statePath);

		expect(loaded?.artifacts).toEqual([]);
		expect(loaded?.events).toEqual([]);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
```

If TypeScript complains about casting too much, use a local `unknown` cast. The purpose is to prove old JSON loads safely.

**Step 2: Run RED test**

Run from `packages/coding-agent`:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts
```

Expected: FAIL because `artifacts` / `events` fields and normalization do not exist yet.

**Step 3: Implement schema and initialization**

Implement the types and `createEmptyProjectState` changes from sections 2 and 3.3.

**Step 4: Implement load normalization**

Update `loadProjectState` to return normalized state.

**Step 5: Run GREEN test**

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts
```

Expected: PASS or only later-task tests failing if already added.

---

### Task 2: Add event logging to storage mutations

**Objective:** Every important state mutation leaves a durable provenance event.

**Files:**

- Modify: `packages/coding-agent/test/co-math-state.test.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`

**Step 1: Write failing tests**

Add tests for representative mutations:

```ts
it("appends provenance events for goals, claims, evidence, warnings, and status changes", () => {
	let state = createProject();
	state = addGoal(state, {
		id: "goal-1",
		text: "Keep proof gaps visible.",
		now: FIXED_NOW,
		actor: "human",
	});
	state = addClaim(state, {
		id: "claim-1",
		workstreamId: "workstream-1",
		statement: "Proof gaps are preserved as warnings.",
		status: "needs_review",
		now: FIXED_NOW,
		actor: "workstream",
	});
	state = addEvidence(state, {
		id: "evidence-1",
		claimId: "claim-1",
		kind: "proof",
		summary: "Reviewer checked a short proof.",
		now: FIXED_NOW,
		actor: "reviewer",
	});
	state = addWarning(state, {
		id: "warning-1",
		claimId: "claim-1",
		severity: "medium",
		message: "Boundary case needs explicit text.",
		now: FIXED_NOW,
		actor: "reviewer",
	});

	expect(state.events.map((event) => event.kind)).toEqual([
		"project_initialized",
		"goal_added",
		"claim_proposed",
		"evidence_added",
		"warning_added",
	]);
	expect(state.events.at(-1)).toMatchObject({
		id: "event-5",
		actor: "reviewer",
		kind: "warning_added",
		subjectId: "warning-1",
		relatedIds: ["claim-1"],
	});
});
```

Add a test that failed proof promotion does not append a `claim_status_changed` event:

```ts
it("does not append claim status events when proof promotion is rejected", () => {
	const state = addClaim(createProject(), {
		id: "claim-1",
		workstreamId: "workstream-1",
		statement: "Unsupported theorem.",
		status: "needs_review",
		now: FIXED_NOW,
		actor: "workstream",
	});

	expect(() =>
		setClaimStatus(state, {
			claimId: "claim-1",
			status: "proved",
			now: FIXED_NOW,
			actor: "reviewer",
		}),
	).toThrow(/proof evidence/i);
	expect(state.events.map((event) => event.kind)).not.toContain("claim_status_changed");
});
```

**Step 2: Run RED test**

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts
```

Expected: FAIL because storage functions do not append events yet.

**Step 3: Implement event helper and mutation events**

Implement section 3.2 and 3.4. Keep summaries concise. Suggested summaries:

```text
goal_added: Added goal goal-1: <text>
workstream_added: Added workstream workstream-small-examples: <title>
claim_proposed: Proposed claim claim-1: <statement>
evidence_added: Added evidence evidence-1 to claim-1: <summary>
warning_added: Added warning warning-1 to claim-1: <message>
warning_resolved: Resolved warning warning-1
review_requested: Requested review for claim-1: <reason>
role_report_saved: Saved report report-1: <title>
claim_status_changed: Set claim-1 status to proved
```

**Step 4: Run GREEN test**

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts
```

Expected: PASS.

---

### Task 3: Add artifact storage helper

**Objective:** Artifacts become first-class persisted project records with provenance events.

**Files:**

- Modify: `packages/coding-agent/test/co-math-state.test.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/storage.ts`

**Step 1: Write failing test**

Add:

```ts
import { addArtifact } from "../examples/extensions/co-math/storage.ts";
```

Then test:

```ts
it("records artifacts with provenance and appends an artifact event", () => {
	let state = createProject();
	state = addArtifact(state, {
		id: "artifact-1",
		kind: "failed_attempt",
		title: "Endpoint induction attempt",
		summary: "The induction breaks when the right arm is empty.",
		provenance: "Reviewer note from a bounded role run.",
		path: "notes/endpoint-induction.md",
		relatedClaimIds: ["claim-1"],
		relatedWorkstreamIds: ["workstream-endpoints"],
		relatedReportIds: ["report-1"],
		now: FIXED_NOW,
		actor: "reviewer",
	});

	expect(state.artifacts).toEqual([
		{
			id: "artifact-1",
			kind: "failed_attempt",
			title: "Endpoint induction attempt",
			summary: "The induction breaks when the right arm is empty.",
			provenance: "Reviewer note from a bounded role run.",
			path: "notes/endpoint-induction.md",
			relatedClaimIds: ["claim-1"],
			relatedWorkstreamIds: ["workstream-endpoints"],
			relatedReportIds: ["report-1"],
			createdAt: FIXED_NOW,
			updatedAt: FIXED_NOW,
		},
	]);
	expect(state.events.at(-1)).toMatchObject({
		id: "event-2",
		kind: "artifact_recorded",
		actor: "reviewer",
		subjectId: "artifact-1",
		relatedIds: ["claim-1", "workstream-endpoints", "report-1"],
	});
});
```

**Step 2: Run RED test**

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts
```

Expected: FAIL because `addArtifact` does not exist.

**Step 3: Implement `addArtifact`**

Implement section 3.5.

**Step 4: Run GREEN test**

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts
```

Expected: PASS.

---

### Task 4: Extend structured role parser for proposed artifacts

**Objective:** Valid role JSON can propose artifacts, while malformed artifact JSON remains report-only.

**Files:**

- Modify: `packages/coding-agent/test/co-math-role-runner.test.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/role-runner.ts`

**Step 1: Write failing tests**

Add:

```ts
it("parses proposed artifacts with provenance", () => {
	const result = parseRoleRunOutput(
		JSON.stringify({
			summary: "Workstream preserved a failed attempt and a computation.",
			proposedArtifacts: [
				{
					kind: "failed_attempt",
					title: "Endpoint induction attempt",
					summary: "The induction breaks when the right arm is empty.",
					provenance: "workstream role run",
					path: "notes/endpoint-induction.md",
					relatedClaimIds: ["claim-1"],
					relatedWorkstreamIds: ["workstream-endpoints"],
				},
			],
		}),
	);

	expect(result.proposedArtifacts).toEqual([
		{
			kind: "failed_attempt",
			title: "Endpoint induction attempt",
			summary: "The induction breaks when the right arm is empty.",
			provenance: "workstream role run",
			path: "notes/endpoint-induction.md",
			relatedClaimIds: ["claim-1"],
			relatedWorkstreamIds: ["workstream-endpoints"],
		},
	]);
});
```

Add malformed fallback test:

```ts
it("falls back safely for invalid proposed artifact kinds", () => {
	const invalidArtifactText = JSON.stringify({
		summary: "Invalid artifact kind.",
		proposedArtifacts: [
			{
				kind: "experiment",
				title: "Unsupported artifact",
				summary: "This kind should not be accepted.",
			},
		],
	});

	const result = parseRoleRunOutput(invalidArtifactText);

	expect(result).toEqual({
		summary: invalidArtifactText,
		blockers: ["Role output was not valid structured co-math JSON; saved as report only."],
	});
	expect(result.proposedArtifacts).toBeUndefined();
});
```

**Step 2: Run RED test**

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-role-runner.test.ts
```

Expected: FAIL because `proposedArtifacts` is not parsed.

**Step 3: Implement parser support**

Implement section 4.

**Step 4: Run GREEN test**

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-role-runner.test.ts
```

Expected: PASS.

---

### Task 5: Ingest role-proposed artifacts and expose timeline/artifact commands

**Objective:** Role runs and manual commands persist artifacts and make provenance visible to users.

**Files:**

- Modify: `packages/coding-agent/test/co-math-extension.test.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`

**Step 1: Write failing role-ingestion test**

Add or extend a role-run test:

```ts
it("ingests structured role artifacts linked to the saved report and target workstream", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-run-artifact-"));
	try {
		const { commands, notifications } = createCoMathExtensionFixture({
			roleRunner: async () => ({
				summary: "Workstream preserved a failed attempt.",
				proposedArtifacts: [
					{
						kind: "failed_attempt",
						title: "Endpoint induction attempt",
						summary: "The induction breaks when the right arm is empty.",
						provenance: "bounded workstream role run",
					},
				],
			}),
		});
		const command = commands.get("comath");
		const ctx = createCommandContext(notifications, tempDir);

		await command?.handler("init Study endpoint behavior", ctx);
		await command?.handler("goal Preserve failed attempts", ctx);
		await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
		await command?.handler("run workstream workstream-endpoints", ctx);

		const state = await loadProjectState(getDefaultStatePath(tempDir));
		expect(state?.artifacts).toMatchObject([
			{
				id: "artifact-1",
				kind: "failed_attempt",
				title: "Endpoint induction attempt",
				relatedWorkstreamIds: ["workstream-endpoints"],
				relatedReportIds: ["report-1"],
			},
		]);
		expect(state?.events.map((event) => event.kind)).toContain("artifact_recorded");
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
```

Update the local `RoleRunResultForTest` interface in this test file to include `proposedArtifacts`.

**Step 2: Write failing manual command/display test**

Add:

```ts
it("records manual artifacts and displays artifact and timeline summaries", async () => {
	const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-artifact-command-"));
	try {
		const { commands, notifications } = createCoMathExtensionFixture();
		const command = commands.get("comath");
		const ctx = createCommandContext(notifications, tempDir);

		await command?.handler("init Study endpoint behavior", ctx);
		await command?.handler(
			"artifact failed_attempt Endpoint induction attempt: Breaks when the right arm is empty.",
			ctx,
		);
		await command?.handler("artifacts", ctx);
		await command?.handler("timeline", ctx);
		await command?.handler("status", ctx);

		const state = await loadProjectState(getDefaultStatePath(tempDir));
		expect(state?.artifacts).toMatchObject([
			{
				id: "artifact-1",
				kind: "failed_attempt",
				title: "Endpoint induction attempt",
				summary: "Breaks when the right arm is empty.",
			},
		]);
		const visibleText = notifications.join("\n");
		expect(visibleText).toContain("Co-math artifacts");
		expect(visibleText).toContain("artifact-1 [failed_attempt] Endpoint induction attempt");
		expect(visibleText).toContain("Co-math timeline");
		expect(visibleText).toContain("project_initialized");
		expect(visibleText).toContain("artifact_recorded");
		expect(visibleText).toContain("Artifacts: 1");
		expect(visibleText).toContain("Events:");
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
```

**Step 3: Run RED test**

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts
```

Expected: FAIL because commands and ingestion do not exist.

**Step 4: Implement command behavior**

Implement section 5.

For artifact kind validation, add a local helper similar to existing evidence/warning validation:

```ts
function isArtifactKind(value: string): value is ArtifactKind {
	return (
		value === "computation" ||
		value === "latex_note" ||
		value === "proof_sketch" ||
		value === "counterexample_search" ||
		value === "reference" ||
		value === "dataset" ||
		value === "script" ||
		value === "figure" ||
		value === "failed_attempt" ||
		value === "human_note"
	);
}
```

Add a small `uniqueStrings` helper if needed.

**Step 5: Run GREEN test**

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts
```

Expected: PASS.

---

### Task 6: Add synthesis-generated event

**Objective:** Synthesis runs become durable workspace events without changing the cautious synthesis content.

**Files:**

- Modify: `packages/coding-agent/test/co-math-extension.test.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/commands.ts`
- Possibly modify: `packages/coding-agent/examples/extensions/co-math/storage.ts` if an exported event helper is needed, but prefer a focused storage helper if necessary.

**Step 1: Write failing test**

Extend an existing `/comath synthesize` test or add a new one:

```ts
await command?.handler("synthesize", ctx);
const state = await loadProjectState(getDefaultStatePath(tempDir));
expect(state?.events.map((event) => event.kind)).toContain("synthesis_generated");
```

**Step 2: Run RED test**

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts
```

Expected: FAIL because synthesis currently does not persist an event.

**Step 3: Implement minimal event recording**

Prefer adding an exported storage helper:

```ts
export function addSynthesisEvent(state: CoMathProjectState, input: { now: string; actor?: CoMathActor }): CoMathProjectState {
	return appendEvent(state, {
		kind: "synthesis_generated",
		actor: input.actor,
		summary: "Generated cautious co-math synthesis from reviewed state.",
		now: input.now,
	});
}
```

Then `/comath synthesize` loads state, computes/renders the same synthesis message, saves the state with this event, and displays the same message. Do not add a generated paper artifact in this milestone.

**Step 4: Run GREEN test**

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts
```

Expected: PASS.

---

### Task 7: Update prompts, state tool docs, and README

**Objective:** Documentation and role prompts match the new architecture.

**Files:**

- Modify: `packages/coding-agent/examples/extensions/co-math/agents/coordinator.md`
- Modify: `packages/coding-agent/examples/extensions/co-math/agents/workstream.md`
- Modify: `packages/coding-agent/examples/extensions/co-math/agents/reviewer.md`
- Modify: `packages/coding-agent/examples/extensions/co-math/agents/synthesizer.md`
- Modify: `packages/coding-agent/examples/extensions/co-math/state-tool.ts`
- Modify: `packages/coding-agent/examples/extensions/co-math/README.md`
- Modify: `packages/coding-agent/test/co-math-extension.test.ts`

**Step 1: Write failing doc/prompt tests**

Add assertions in the README/prompt documentation tests for these strings:

```ts
expect(readme).toContain("/comath artifact");
expect(readme).toContain("/comath artifacts");
expect(readme).toContain("/comath timeline");
expect(readme).toContain("proposedArtifacts");
expect(readme.toLowerCase()).toContain("event log");
expect(readme.toLowerCase()).toContain("artifact registry");
expect(readme.toLowerCase()).toContain("metadata only");
```

For prompts, require:

```ts
expect(promptText).toContain("proposedArtifacts");
expect(promptText).toContain("failed_attempt");
expect(promptText).toContain("provenance");
```

For `state-tool.ts`, assert its prompt/description mentions `events` and `artifacts`.

**Step 2: Run RED test**

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts
```

Expected: FAIL until docs and prompts are updated.

**Step 3: Update docs and prompts**

Implement section 6.

**Step 4: Run GREEN test**

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts
```

Expected: PASS.

---

## 8. Required verification commands

From repo root:

```bash
git status --short
```

Expected before implementation: only this plan file should be uncommitted if Hermes has just written it.

Run targeted tests from `packages/coding-agent`:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts
```

Expected after implementation: all targeted co-math tests pass.

Then run full repo check from repo root:

```bash
npm run check
```

Expected: full check passes.

Codex must report exact command outputs, not paraphrases.

---

## 9. Acceptance criteria

The implementation is acceptable only if all of these are true:

- `CoMathProjectState` has durable `events` and `artifacts` arrays.
- Newly initialized projects contain a `project_initialized` event.
- Legacy state files without `events` or `artifacts` still load safely.
- Existing manual mutations append provenance events with deterministic ids.
- Role report ingestion appends a `role_report_saved` event.
- Workstream proposed claims still enter only as `needs_review`.
- Reviewer proof promotion remains blocked unless proof evidence exists and no attached warning remains open.
- Malformed role JSON remains report-only and cannot create artifacts, claims, warnings, evidence, or review decisions.
- Valid role JSON can include `proposedArtifacts`.
- Role-proposed artifacts link to the saved report and target claim/workstream when applicable.
- `/comath artifact`, `/comath artifacts`, and `/comath timeline` work and are tested.
- `/comath status` shows artifact and event counts without dumping all history.
- `/comath synthesize` records a durable `synthesis_generated` event without weakening cautious synthesis rules.
- README, prompts, and state-tool docs mention events/artifacts/provenance.
- No new dependencies are added.
- No files outside the allowed scope are changed.
- Targeted tests and `npm run check` pass.

---

## 10. Codex handoff prompt

Copy-paste this to Codex from repo root after committing or otherwise preserving this plan as a clean docs artifact:

```text
Implement the plan in docs/co-math-workspace-events-artifacts-plan.md.

Scope is strict. Touch only the allowed files listed in the plan. Do not edit core Pi APIs, package configuration, lockfiles, provider/model code, or unrelated tests. Do not add dependencies. Do not commit.

Architectural source of truth: /Users/hanzhangyin/Developer/2605.06651v2.pdf. This feature must strengthen the co-math assistant as a stateful mathematical workspace with provenance, artifacts, failed-attempt preservation, and review discipline. Do not turn it into autonomous background scheduling or a generic issue tracker.

Follow TDD task order:
1. Add RED tests for schema initialization and legacy normalization.
2. Implement events/artifacts schema and normalization.
3. Add RED tests for storage event logging and artifact helper.
4. Implement event logging and addArtifact.
5. Add RED tests for proposedArtifacts parsing.
6. Implement parser support with safe fallback.
7. Add RED tests for role-ingested artifacts, manual artifact command, artifacts display, timeline, status counts, and synthesis event.
8. Implement command behavior.
9. Update role prompts, state-tool docs, README, and documentation tests.
10. Run targeted tests and full check.

Required verification commands:

cd packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts
cd ../..
npm run check

git status --short

Report exact outputs and summarize every changed file. If you believe an unlisted file must change, stop and explain why before editing it.
```

---

## 11. Hermes review checklist after Codex finishes

Hermes should independently inspect:

```bash
git diff -- packages/coding-agent/examples/extensions/co-math/schema.ts

git diff -- packages/coding-agent/examples/extensions/co-math/storage.ts

git diff -- packages/coding-agent/examples/extensions/co-math/commands.ts

git diff -- packages/coding-agent/examples/extensions/co-math/role-runner.ts

git diff -- packages/coding-agent/examples/extensions/co-math/agents

git diff -- packages/coding-agent/examples/extensions/co-math/README.md

git diff -- packages/coding-agent/test/co-math-state.test.ts

git diff -- packages/coding-agent/test/co-math-role-runner.test.ts

git diff -- packages/coding-agent/test/co-math-extension.test.ts
```

Conceptual checks:

- Does the patch preserve the user-as-PI model?
- Are events compact provenance records, not huge dumps of model output?
- Are artifacts metadata/provenance records, not hidden file writes?
- Does malformed model output remain report-only?
- Are failed attempts first-class artifacts?
- Are proof promotions still strictly proof-backed and warning-free?
- Does synthesis still separate reviewed findings from warnings?
- Did Codex avoid autonomous/background behavior and provider refactors?

Verification to rerun:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-state.test.ts test/co-math-role-runner.test.ts test/co-math-extension.test.ts
cd /Users/hanzhangyin/Developer/pi-mono-comath
npm run check
```

If all checks pass, the implementation should be committed as a separate feature commit from this plan.
