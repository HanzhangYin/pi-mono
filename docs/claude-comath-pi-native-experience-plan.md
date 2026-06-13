# Co-Math Pi-Native Experience Implementation Plan

> **For Claude Code:** Implement this plan in a fresh conversation on `/home/hermes/developer/pi-mono-comath`. Do not push. Do not commit unless the user explicitly asks after validation. This plan is intentionally product/UX-driven: the goal is not another co-math feature, but making the experience feel like Pi/Claude Code/Codex rather than an extension wrapper.

## Motivation

The current `pi comath <source>` implementation is a real improvement over slash-command setup, but the user experience still reads like an extension bolted onto Pi. The interface repeatedly uses words like:

- `Co-math research mode`
- `[co-math]`
- `co-math project state`
- `co-math goal`
- `co-math workstream`
- `role-run-1`
- `artifact-1`
- `workstream-extract-question-3-definitions`
- `Queued co-math workstream`
- `Started co-math role run`

Those terms are useful implementation concepts, but they are not the desired user-facing product. The user wants the experience to feel closer to Claude Code or Codex:

1. Start Pi in a special math/research context.
2. Type a normal problem.
3. Watch Pi visibly reason/work/organize the task.
4. See concise progress updates in product language.
5. Steer naturally.
6. Only see internal IDs or debug commands when explicitly asking for details.

The next milestone should therefore be a presentation/orchestration cleanup, not more math capability. Keep the existing state model and backend commands, but hide extension-flavored output from the normal Pi surface.

## Expected End Result

Starting from a fresh scratch directory:

```bash
/home/hermes/developer/pi-mono-comath/pi-test.sh \
  comath /home/hermes/developer/pi-mono-comath/docs/2605.06651v2.pdf \
  --approve
```

The startup should look like a Pi-native assistant mode, not an extension announcement. Acceptable target shape:

```text
Pi is ready to help validate mathematical work.
Source: 2605.06651v2.pdf

Describe the problem you want to investigate.
```

It should not show product copy like:

```text
Co-math research mode
Waiting for a problem to validate.
```

Then the user types:

```text
Validate Question 3.
```

Expected visible output should be concise and agent-like:

```text
I’ll set up a source-backed validation run for: Validate Question 3.

Plan
- Pin the source and target problem.
- Extract definitions and assumptions before proof attempts.
- Audit proof dependencies, especially support/indexing gaps.
- Start with the source audit.

Working
✓ Source pinned: 2605.06651v2.pdf
✓ Validation plan created
✓ Definition/assumption audit prepared
✓ Support/indexing gap audit prepared
→ Running source audit in the background

You can keep steering while it runs. Try: "show progress", "show report", or "focus on ...".
```

It should not show backend/internal lines in normal mode:

```text
Initialized co-math project state at ...
Registered source artifact-1 ...
Added co-math goal goal-1 ...
Added co-math workstream workstream-...
Queued co-math workstream as role-run-1 ...
Started co-math role run role-run-1 ...
```

When the user types:

```text
show progress
```

Expected:

```text
Current progress
- Source audit: running
- Latest transcript: .pi/co-math/transcripts/role-run-1.jsonl
- Reports: none yet
```

IDs may appear only when useful, and should be visually secondary. The normal language should be task-centered, not implementation-centered.

When the user types:

```text
focus on the support indexing gap
```

Expected:

```text
Focus noted: support indexing gap.
I’ll prioritize that in the next audit step.
```

When the first run blocks or completes, Pi should surface a product-level event:

```text
Source audit blocked.
Reason: the source does not contain a literal "Question 3" statement.

What I need next
- the exact Question 3 statement, or
- the section/claim in the paper you mean by Question 3, or
- the supplementary source containing that question.

Say "show report" for details or paste the missing statement.
```

The debug/internal information should still be available via explicit advanced requests:

```text
show debug state
show run id
show artifacts
```

or via slash commands, but not in the default path.

## Non-Goals

Do not implement new mathematical reasoning capability in this milestone.

Do not change the storage model unless required to present the UX cleanly.

Do not remove `/comath` commands; keep them as advanced/debug fallback.

Do not build a new renderer, daemon, proof engine, scheduler, PDF generator, or dependency-heavy UI.

Do not weaken source/provenance discipline. The source artifact and transcripts must remain persisted exactly as before.

## Current Context

Branch currently contains the first-class harness commit:

```text
70dab373 feat(coding-agent): add first-class co-math harness
```

Important current files:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
packages/coding-agent/src/modes/comath/comath-autoplan.ts
packages/coding-agent/src/modes/comath/comath-source.ts
packages/coding-agent/src/main.ts
packages/coding-agent/src/core/conversation-mode.ts
packages/coding-agent/src/core/agent-session.ts
packages/coding-agent/examples/extensions/co-math/commands.ts
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/test/comath-harness.test.ts
packages/coding-agent/test/comath-progress.test.ts
packages/coding-agent/test/comath-autoplan.test.ts
packages/coding-agent/test/comath-source.test.ts
packages/coding-agent/test/co-math-extension.test.ts
```

Manual smoke currently passes functionally, but output remains backend-flavored. Recent observed output included:

```text
[co-math]
Co-math research mode
Source: 2605.06651v2.pdf
Waiting for a problem to validate.

[co-math]
Initialized co-math project state at /tmp/.../.pi/co-math/state.json

[co-math]
Added co-math goal goal-1: ...

[co-math]
Added co-math workstream workstream-extract-question-3-definitions: ...

[co-math]
Started co-math role run role-run-1 in background.
```

This is the problem to fix.

## Design Principle

Separate two output layers:

1. Backend state/actions layer
   - existing `/comath` commands;
   - exact state IDs;
   - artifacts;
   - workstreams;
   - role runs;
   - debug details.

2. Product presentation layer
   - Pi-native messages;
   - clean progress;
   - no extension language;
   - no backend IDs unless necessary;
   - natural steering instructions.

The harness should call backend commands silently, collect their outcomes, then emit its own product-level messages.

## Task 1: Add a Product Presentation Contract

Objective: create a small explicit interface for user-facing co-math product messages so tests can enforce that normal mode does not leak extension/backend terminology.

Modify:

```text
packages/coding-agent/src/modes/comath/comath-progress.ts
```

Add product-focused functions. Suggested API:

```ts
export interface CoMathProductPlanSummary {
	problem: string;
	sourceDisplayName?: string;
	workstreamCount: number;
}

export interface CoMathProductRunSummary {
	status: "queued" | "running" | "blocked" | "completed" | "failed";
	transcriptPath?: string;
	reportSummary?: string;
	blockers?: string[];
}
```

Add functions with product copy, not backend copy:

```ts
export function formatCoMathWelcome(source: CoMathSource | undefined): string {
	if (!source) {
		return [
			"Pi is ready to help validate mathematical work.",
			"",
			"Describe the problem you want to investigate.",
		].join("\n");
	}
	if (!source.exists || !source.isFile) {
		return [
			"Pi is ready to help validate mathematical work.",
			`Source warning: ${source.input}`,
			source.missingReason ?? "Source path is not readable.",
			"",
			"Describe the problem you want to investigate.",
		].join("\n");
	}
	return [
		"Pi is ready to help validate mathematical work.",
		`Source: ${source.displayName}`,
		"",
		"Describe the problem you want to investigate.",
	].join("\n");
}
```

Replace `formatCoMathProductHelp()` with product wording:

```ts
export function formatCoMathProductHelp(): string {
	return [
		"Pi math validation help",
		"",
		"Start by describing the problem or claim you want to investigate.",
		"Example: Validate Question 3.",
		"",
		"After Pi starts working, steer naturally:",
		"  continue",
		"  show progress",
		"  show report",
		"  focus on the support indexing gap",
		"  show uncertainty",
		"",
		"Pi will organize the source, goals, audit steps, transcripts, and reports internally.",
	].join("\n");
}
```

Add a single setup-progress formatter:

```ts
export function formatInitialValidationPlan(problem: string, sourceDisplayName?: string): string {
	return [
		`I’ll set up a source-backed validation run for: ${problem}`,
		"",
		"Plan",
		"- Pin the source and target problem.",
		"- Extract definitions and assumptions before proof attempts.",
		"- Audit proof dependencies, especially support/indexing gaps.",
		"- Start with the source audit.",
		...(sourceDisplayName ? ["", `Source: ${sourceDisplayName}`] : []),
	].join("\n");
}
```

Add concise step formatters:

```ts
export function formatSetupStep(label: string): string {
	return `✓ ${label}`;
}

export function formatBackgroundRunStarted(transcriptPath?: string): string {
	return [
		"→ Running source audit in the background",
		...(transcriptPath ? [`Latest transcript: ${transcriptPath}`] : []),
		"",
		'You can keep steering while it runs. Try: "show progress", "show report", or "focus on ...".',
	].join("\n");
}
```

Important: these functions should not include:

```text
co-math
workstream
role-run
artifact
/comath
```

unless explicitly intended for debug-only helpers.

## Task 2: Add Product Output Sanitization Tests

Objective: make tests fail if normal product output leaks extension/backend vocabulary.

Modify:

```text
packages/coding-agent/test/comath-progress.test.ts
packages/coding-agent/test/comath-harness.test.ts
```

In `comath-progress.test.ts`, add tests similar to:

```ts
const FORBIDDEN_PRODUCT_TERMS = [
	"Co-math research mode",
	"co-math project",
	"co-math goal",
	"co-math workstream",
	"role-run",
	"artifact-",
	"workstream-",
	"/comath",
];

function expectProductCopy(text: string): void {
	for (const term of FORBIDDEN_PRODUCT_TERMS) {
		expect(text).not.toContain(term);
	}
}
```

Test:

```ts
it("formats Pi-native startup copy", () => {
	const text = formatCoMathWelcome({
		input: "/tmp/paper.pdf",
		absolutePath: "/tmp/paper.pdf",
		displayName: "paper.pdf",
		exists: true,
		isFile: true,
	});
	expect(text).toContain("Pi is ready");
	expect(text).toContain("Source: paper.pdf");
	expectProductCopy(text);
});
```

Test help text similarly.

In `comath-harness.test.ts`, change the setup test so `notices.join("\n")` must not contain forbidden terms. The backend command list may still contain internal command names; only visible `notices` must be clean.

## Task 3: Make Harness Backend Commands Silent by Default

Objective: stop normal product setup from showing backend command messages like `Initialized co-math project state`, `Added co-math goal`, and `Queued co-math workstream`.

Current issue:

`CoMathHarness` calls `runBackendCommand()`. In real UI, the backend command runner emits command messages to Pi while executing. The harness then emits additional product messages. This causes duplicate extension-like output.

Implementation approach:

Add an option to the backend runner path so product-mode calls can suppress backend command notifications while still returning messages and failure status.

Likely file:

```text
packages/coding-agent/examples/extensions/co-math/commands.ts
```

Find:

```ts
runCoMathBackendCommand
```

Change the backend runner to support options:

```ts
export interface CoMathBackendCommandOptions {
	silent?: boolean;
	productMode?: boolean;
}

export async function runCoMathBackendCommand(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	args: string,
	options: CoMathBackendCommandOptions = {},
): Promise<CoMathBackendCommandResult> {
	...
}
```

When `options.silent === true`, capture command messages but do not call the UI notification path.

If the code already captures command messages by wrapping `showCommandMessage`, reuse that mechanism. The important acceptance criterion is:

- direct `/comath` still prints normal debug/backend command output;
- `pi comath` product harness does not print backend command output during setup/steering unless explicitly requested.

Modify product-mode wiring in:

```text
packages/coding-agent/src/main.ts
```

so the harness backend runner calls:

```ts
runCoMathBackendCommand(pi, ctx, args, { silent: true, productMode: true })
```

or equivalent.

If current function signature cannot be changed cleanly, create a new narrow function:

```ts
runCoMathProductBackendCommand(...)
```

that delegates to the normal backend command handler with silent capture.

## Task 4: Emit Product Progress from the Harness, Not Backend Output

Objective: ensure setup output is a clean sequence of product messages.

Modify:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
```

Replace current output sequence:

```ts
await this.notify(formatPlanningStarted(plan.rootQuestion));
await this.runRequiredCommand(`init ${plan.rootQuestion}`, ...);
await this.notify(formatProjectCreated(plan.rootQuestion));
...
await this.notify(formatGoalCreated(goal));
...
await this.notify(formatWorkstreamCreated(workstream.goal));
...
await this.notify(formatStartingFirstWorkstream(...));
```

with a clearer product flow:

```ts
await this.notify(formatInitialValidationPlan(plan.rootQuestion, sourceTitle));

if (!(await this.runRequiredCommand(`init ${plan.rootQuestion}`, "Could not prepare the validation workspace."))) return;
await this.notify(formatSetupStep("Validation workspace prepared"));

if (source exists) {
	if (!(await this.runRequiredCommand(`source ...`, "Could not pin the source file."))) return;
	await this.notify(formatSetupStep(`Source pinned: ${this.source.displayName}`));
}

for goals/workstreams:
	await run commands silently;

await this.notify(formatSetupStep("Validation plan created"));
await this.notify(formatSetupStep("Definition and assumption audit prepared"));
await this.notify(formatSetupStep("Support/indexing gap audit prepared"));

if startFirstRun:
	await queue silently;
	const dispatchResult = await run silently;
	await this.notify(formatBackgroundRunStarted(extractTranscriptPath(dispatchResult.messages)));
```

Do not show every individual backend goal/workstream by default. Summarize.

Keep exact backend commands unchanged unless necessary.

## Task 5: Parse Useful Details from Silent Backend Results

Objective: allow product messages to include useful details like transcript path without exposing run IDs as the main concept.

Create helper in:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
```

or a new small file:

```text
packages/coding-agent/src/modes/comath/comath-backend-output.ts
```

Suggested helpers:

```ts
export function extractTranscriptPath(messages: readonly string[]): string | undefined {
	for (const message of messages) {
		const match = /^Transcript:\s*(.+)$/m.exec(message);
		if (match?.[1]) return match[1].trim();
	}
	return undefined;
}

export function extractStatus(messages: readonly string[]): string | undefined {
	for (const message of messages) {
		const match = /^Status:\s*(.+)$/m.exec(message);
		if (match?.[1]) return match[1].trim();
	}
	return undefined;
}
```

Use these helpers for `show progress`, `show report`, and background completion if available.

Tests should cover these helpers if created.

## Task 6: Add Natural Pi-Native Steering Aliases

Objective: reduce ID/debug language in normal use.

Modify:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
```

Support these natural prompts:

```text
show progress
status
what are you doing
show report
show latest report
show details
show debug state
```

Recommended behavior:

- `show progress` / `status` / `what are you doing`
  - silently call backend `run-status latest` and maybe `review-queue`;
  - display product-level summary:

```text
Current progress
- Source audit: running
- Latest transcript: .pi/co-math/transcripts/role-run-1.jsonl
- Reports: none yet
```

- `show report` / `show latest report`
  - silently call backend `report-status latest`;
  - display the report text, but sanitize command guidance and optionally rewrite the heading from `Report report-1...` to `Latest report`.

- `show details` or `show debug state`
  - may show internal IDs and debug details;
  - this is the escape hatch for advanced users.

## Task 7: Sanitize Product Report and Run Output

Objective: make `show latest run` and `show latest report` read like Pi output, not extension output.

Current observed `show latest run` output includes:

```text
role-run-1
Role: workstream
Status: running
Target workstream: workstream-extract-question-3-definitions
Execution mode: background
Live in this session: yes
Transcript: .pi/co-math/transcripts/role-run-1.jsonl
Report: none
Created claims: none
...
```

Product version should be closer to:

```text
Current progress
- Source audit: running
- Running in background: yes
- Latest transcript: .pi/co-math/transcripts/role-run-1.jsonl
- Report: none yet
- Blockers: none
```

Keep the old detailed text only for debug/detail mode.

Current observed `show latest report` output includes:

```text
Report report-1: workstream role run: workstream-extract-question-3-definitions
Summary: ...
Blockers:
...
Linked role run: role-run-1
Report review rounds:
...
Next: say "show latest run", "show latest report", or "continue".
```

Product version should be closer to:

```text
Latest report
Status: blocked

Summary
Assigned goal: extract source-backed definitions for Question 3...

Blockers
- No target claim id or exact Question 3 statement was provided.
- 2605.06651v2.pdf contains no literal "Question 3".
...

Next
Paste the exact Question 3 statement, say "continue", or say "focus on ...".
```

Implementation can be simple string transformation for this milestone. Do not overbuild a typed report renderer unless existing state APIs make it easy.

## Task 8: Remove or Demote `[co-math]` Label in Product Mode if Feasible

Objective: make product-mode messages look like Pi’s own messages rather than an extension’s messages.

Current UI labels messages from this flow as:

```text
[co-math]
```

Investigate where this label is introduced. Likely through extension command message plumbing in interactive UI/session services.

Relevant files to inspect:

```text
packages/coding-agent/src/core/agent-session.ts
packages/coding-agent/src/core/agent-session-services.ts
packages/coding-agent/src/core/sdk.ts
packages/coding-agent/src/main.ts
packages/coding-agent/src/modes/interactive/interactive-mode.ts
```

Acceptance priority:

1. Best: product-mode harness notices appear as normal Pi/system assistant progress without `[co-math]`.
2. Acceptable: use a neutral label like `[pi]` or no bracket label for harness notices, while direct `/comath` commands still use `[co-math]`.
3. If label removal is too invasive, leave the label but make all message text Pi-native. Record this as a non-blocking limitation in the implementation report.

Do not risk destabilizing normal extension command output. The normal extension/debug path must keep working.

## Task 9: Add Product-Mode Manual Smoke Test Documentation

Objective: make the new expected UX clear for future validation.

Create or modify:

```text
docs/comath-pi-native-smoke.md
```

Include:

```bash
tmpdir=$(mktemp -d /tmp/comath-pi-native.XXXXXX)
cd "$tmpdir"
/home/hermes/developer/pi-mono-comath/pi-test.sh \
  comath /home/hermes/developer/pi-mono-comath/docs/2605.06651v2.pdf \
  --approve
```

Then interactive steps:

```text
help
Validate Question 3.
show progress
focus on the support indexing gap
show report
show uncertainty
```

Expected checks:

- help does not create state;
- startup and help use Pi-native wording;
- normal setup output does not include backend/internal phrases;
- source is structurally recorded;
- 3 goals and 3 workstreams exist in state;
- first run starts in background;
- transcript exists;
- report can be shown naturally;
- blocked result is acceptable if source lacks the exact target statement.

Include a note that `/comath` remains an advanced/debug fallback and should not be advertised in normal product output.

## Task 10: Update Tests for Manual Smoke Acceptance

Objective: ensure automated tests protect the product copy.

Add or update tests in:

```text
packages/coding-agent/test/comath-harness.test.ts
packages/coding-agent/test/comath-progress.test.ts
packages/coding-agent/test/co-math-extension.test.ts
```

Minimum assertions:

1. Startup copy:

```ts
expect(formatCoMathWelcome(source)).toContain("Pi is ready");
expect(formatCoMathWelcome(source)).not.toContain("Co-math research mode");
```

2. Help copy:

```ts
expect(formatCoMathProductHelp()).toContain("Pi math validation help");
expect(formatCoMathProductHelp()).not.toContain("/comath");
expect(formatCoMathProductHelp()).not.toContain("workstream"); // if using user-facing alternative wording
```

3. Harness setup notices:

```ts
await harness.handlePrompt("Validate Question 3.");
const visible = notices.join("\n");
expect(visible).toContain("I’ll set up a source-backed validation run");
expect(visible).toContain("✓ Source pinned");
expect(visible).toContain("→ Running source audit in the background");
expect(visible).not.toContain("Added co-math goal");
expect(visible).not.toContain("Queued co-math workstream");
expect(visible).not.toContain("role-run");
expect(visible).not.toContain("artifact-");
expect(visible).not.toContain("/comath");
```

4. Backend commands still occur:

```ts
expect(commands).toContain("init Validate Question 3.");
expect(commands.some((command) => command.startsWith("goal "))).toBe(true);
expect(commands.some((command) => command.startsWith("workstream "))).toBe(true);
```

This protects the intended separation: backend internals still run, but visible product output is clean.

## Task 11: Validation Commands

Run from repo root unless otherwise specified.

Targeted tests:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run \
  test/comath-progress.test.ts \
  test/comath-harness.test.ts \
  test/comath-source.test.ts \
  test/comath-autoplan.test.ts \
  test/args.test.ts \
  test/conversation-mode.test.ts
```

Co-math regression tests:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run \
  test/co-math-natural-language.test.ts \
  test/co-math-extension.test.ts \
  test/co-math-role-runner.test.ts \
  test/co-math-state.test.ts
```

Repo check:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
```

Whitespace check:

```bash
cd /home/hermes/developer/pi-mono-comath
git diff --check
```

Manual smoke:

```bash
cd /home/hermes/developer/pi-mono-comath
tmux kill-session -t comath-pi-native-smoke 2>/dev/null || true
tmpdir=$(mktemp -d /tmp/comath-pi-native.XXXXXX)
printf '%s\n' "$tmpdir"
tmux new-session -d -s comath-pi-native-smoke -x 120 -y 40 "cd '$tmpdir' && /home/hermes/developer/pi-mono-comath/pi-test.sh comath /home/hermes/developer/pi-mono-comath/docs/2605.06651v2.pdf --approve"
sleep 4
tmux capture-pane -t comath-pi-native-smoke -p -S -220
```

Then send:

```bash
tmux send-keys -t comath-pi-native-smoke "help" Enter
sleep 2
tmux capture-pane -t comath-pi-native-smoke -p -S -260
```

Verify help is Pi-native and no state file exists:

```bash
python3 -c 'from pathlib import Path; import sys; p=Path("'$tmpdir'/.pi/co-math/state.json"); print("state exists after help:", p.exists()); sys.exit(1 if p.exists() else 0)'
```

Then send:

```bash
tmux send-keys -t comath-pi-native-smoke "Validate Question 3." Enter
sleep 8
tmux capture-pane -t comath-pi-native-smoke -p -S -420
```

Check manually that normal output does not include these phrases:

```text
Added co-math goal
Added co-math workstream
Initialized co-math project state
Queued co-math workstream
Started co-math role run
/comath
```

Then send:

```bash
tmux send-keys -t comath-pi-native-smoke "show progress" Enter
sleep 2
tmux capture-pane -t comath-pi-native-smoke -p -S -220

tmux send-keys -t comath-pi-native-smoke "focus on the support indexing gap" Enter
sleep 2
tmux capture-pane -t comath-pi-native-smoke -p -S -220

tmux send-keys -t comath-pi-native-smoke "show report" Enter
sleep 10
tmux capture-pane -t comath-pi-native-smoke -p -S -300
```

Finally inspect state:

```bash
python3 -c 'import json, pathlib; p=pathlib.Path("'$tmpdir'/.pi/co-math/state.json"); s=json.loads(p.read_text()); print("goals", len(s.get("approvedGoals", []))); print("workstreams", len(s.get("workstreams", []))); print("roleRuns", [(r.get("id"), r.get("status"), r.get("reportId")) for r in s.get("roleRuns", [])]); print("sources", [(a.get("id"), a.get("sourcePathKind"), a.get("sourcePath")) for a in s.get("artifacts", []) if a.get("kind") == "source"])'
```

Cleanup:

```bash
tmux kill-session -t comath-pi-native-smoke
```

## Task 12: Implementation Report Required from Claude Code

When done, Claude Code should report:

1. Files changed.
2. What backend terms were removed from normal product output.
3. Whether `[co-math]` label was removed, changed, or left as a known limitation.
4. Exact targeted test results.
5. Exact `npm run check` result.
6. Exact `git diff --check` result.
7. Manual smoke summary with captured key output.
8. Any remaining UX caveats.
9. Confirmation that no commit was made.

## Acceptance Criteria

This milestone passes only if all of these are true:

- `pi comath <source>` still works.
- `help` before setup does not create state.
- Startup and help read as Pi-native product copy.
- Typing a problem automatically sets up the validation run.
- Normal visible setup output does not include backend/internal phrases:
  - `Added co-math goal`
  - `Added co-math workstream`
  - `Initialized co-math project state`
  - `Queued co-math workstream`
  - `Started co-math role run`
  - `/comath`
- `show progress` works naturally.
- `focus on ...` works naturally.
- `show report` works naturally.
- Source remains structurally recorded in state.
- Three goals and three audit steps/workstreams are still created internally.
- First audit still starts in background.
- Direct `/comath` debug commands still work.
- All targeted tests pass.
- `npm run check` passes.
- `git diff --check` passes.

## Suggested First Prompt for Claude Code

Use this in a fresh Claude Code conversation from repo root:

```text
Please implement docs/claude-comath-pi-native-experience-plan.md exactly. The goal is to make `pi comath <source>` feel Pi-native / Claude-Code-like instead of extension-like. Preserve the backend state model and `/comath` debug commands, but make normal product output hide backend terms and show clean progress. Do not commit. Run the targeted tests, `npm run check`, `git diff --check`, and the manual tmux smoke from the plan. Report files changed, validation results, smoke output, and remaining caveats.
```
