# Co-Math Conversation Mode Transparency Fix Implementation Plan

> **For Codex:** Implement this plan on branch `comath/conversation-mode`. Do not commit. Keep the patch small and validation-driven.

## Goal

Fix the remaining conversation-mode milestone blocker: after a normal co-math conversation prompt is routed through `/co`, the final visible TUI output must retain the interpretation/debug-command context.

The user should see, in the same visible result for a routed co-math action:

```text
Interpreted: start project
Equivalent debug command: /comath init 2605.06651v2 Question 3 validation

Initialized co-math project state at /tmp/comath-conversation-smoke/.pi/co-math/state.json
```

Current issue: `/co` emits the interpretation/debug text as one UI notification, then the underlying `/comath` command emits another notification. In the TUI, the second notification hides/replaces the first, so the transparency requirement is not met in real interactive use.

## Current branch and state

Work in the existing repo and branch:

```bash
cd /home/hermes/developer/pi-mono-comath
git status --short --branch
```

Expected branch:

```text
comath/conversation-mode
```

Known untracked plan from the starting state:

```text
docs/codex-comath-conversation-mode-plan.md
```

Do not delete or commit that file unless explicitly asked.

## Acceptance criteria

The milestone is complete when:

1. In co-math conversation mode, ordinary prompts do not require `/co` or `/comath`.
2. The final visible output for a routed action includes:
   - `Interpreted: ...`
   - `Equivalent debug command: /comath ...`
   - the actual underlying command result.
3. `/co <request>` also preserves the same transparency in visible output.
4. `/comath ...` behavior remains unchanged as the advanced/debug command interface.
5. Default Pi mode remains unchanged.
6. Tests cover the combined-visible-output behavior where possible.
7. Manual TUI smoke confirms the visible output includes the transparency lines.
8. Required checks pass.

## Non-goals

Do not implement:

- a new parser architecture;
- LLM-based intent parsing;
- a new state schema;
- a new TUI notification system;
- broad co-math UX redesign;
- web search behavior;
- proof logic changes;
- fuzzy report approval.

This is a small transparency/visibility fix only.

## Files to inspect first

Read the relevant code before editing:

```text
packages/coding-agent/examples/extensions/co-math/commands.ts
packages/coding-agent/examples/extensions/co-math/natural-language.ts
packages/coding-agent/examples/extensions/co-math/natural-language-help.ts
packages/coding-agent/src/core/conversation-mode.ts
packages/coding-agent/src/core/agent-session.ts
packages/coding-agent/test/co-math-extension.test.ts
packages/coding-agent/test/conversation-mode.test.ts
packages/coding-agent/test/co-math-natural-language.test.ts
```

Important function to inspect:

```ts
handleNaturalCoMathCommand(...)
showCommandMessage(...)
handleCoMathCommand(...)
```

Current problematic pattern is likely:

```ts
showCommandMessage(
	pi,
	ctx,
	[`Interpreted: ${command.interpreted}`, `Equivalent debug command: /comath ${command.args}`].join("\n"),
);
await handleCoMathCommand(pi, command.args, ctx, roleRunner);
```

That emits two visible events/notifications instead of one durable combined output.

## Preferred implementation approach

Use a small scoped output-prefix mechanism inside the co-math command handling path.

The ideal shape:

1. `/co` translates natural request to the underlying `/comath` args.
2. `/co` calls the existing `/comath` handler with an optional display prefix.
3. The underlying command result is emitted once, with the prefix included in the same message.

Conceptually:

```ts
const prefix = [`Interpreted: ${command.interpreted}`, `Equivalent debug command: /comath ${command.args}`, ""].join("\n");
await handleCoMathCommand(pi, command.args, ctx, roleRunner, { displayPrefix: prefix });
```

Then `showCommandMessage` or equivalent result-emission helper should combine:

```text
<prefix>
<actual command output>
```

for user-visible command results.

Do not rely on two separate `ctx.ui.notify(...)` calls.

## Alternative implementation if simpler

If adding an optional `displayPrefix` through `handleCoMathCommand` is invasive, introduce a small wrapper around the command UI/display context used only by `/co`.

Example concept:

```ts
function withDisplayPrefix(ctx: ExtensionCommandContext, prefix: string): ExtensionCommandContext {
	return {
		...ctx,
		ui: ctx.ui
			? {
				...ctx.ui,
				notify(text, level) {
					ctx.ui.notify(`${prefix}\n${text}`, level);
				},
			}
			: ctx.ui,
	};
}
```

But only use this if the project types make it clean and safe. Avoid `any`.

Important: if wrapping UI methods, verify all display paths used by co-math command output are covered. Non-UI output goes through `pi.sendMessage`, so that path also needs the prefix if tests exercise it.

## Avoid this implementation

Do not just emit the prefix as a second permanent custom message unless there is no clean way to combine messages.

Two separate visible messages are better than a transient overwritten notification, but the preferred result is a single visible combined output because it is easier for users to read and for tests to assert.

Do not duplicate the whole `/comath` implementation in `/co`.

## Task 1: Add failing coverage for `/co` combined output

Modify:

```text
packages/coding-agent/test/co-math-extension.test.ts
```

Find the existing `/co` workflow tests, especially the natural-language workflow and latest-reference tests.

Add or adjust a test so a `/co` translated action asserts that one visible co-math message contains both the debug prefix and the underlying command result.

Suggested test shape, adapted to existing harness helpers:

```ts
it("shows natural-language interpretation with the underlying command result", async () => {
	const tempDir = await makeTempDir();
	const harness = await createCoMathHarness({ cwd: tempDir });

	await harness.runCommand("/co start a project for 2605.06651v2 Question 3 validation");

	expect(harness.messages.at(-1)?.content).toContain("Interpreted: start project");
	expect(harness.messages.at(-1)?.content).toContain(
		"Equivalent debug command: /comath init 2605.06651v2 Question 3 validation",
	);
	expect(harness.messages.at(-1)?.content).toContain("Initialized co-math project state");
});
```

Use the actual test harness names and message collection patterns in this repo. Do not invent helpers if equivalent helpers already exist.

Run the test and confirm it fails before implementing:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/co-math-extension.test.ts
```

Expected before fix: the assertion for combined output fails.

## Task 2: Implement a prefix-aware display path

Modify:

```text
packages/coding-agent/examples/extensions/co-math/commands.ts
```

Add a tiny type near the command helper types:

```ts
interface CoMathCommandDisplayOptions {
	displayPrefix?: string;
}
```

Update the internal command handler signature, if clean:

```ts
async function handleCoMathCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: ExtensionCommandContext,
	roleRunner: CoMathRoleRunner,
	displayOptions: CoMathCommandDisplayOptions = {},
): Promise<void> {
	// existing implementation
}
```

Update `showCommandMessage` to accept the same options or a direct prefix:

```ts
function showCommandMessage(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	text: string,
	displayOptions: CoMathCommandDisplayOptions = {},
): void {
	const content = displayOptions.displayPrefix ? `${displayOptions.displayPrefix}\n${text}` : text;
	if (ctx.hasUI) {
		ctx.ui.notify(content, "info");
		return;
	}

	pi.sendMessage({
		customType: "co-math",
		content,
		display: true,
		details: { kind: "command" },
	});
}
```

Then thread `displayOptions` through all `showCommandMessage(...)` calls inside `handleCoMathCommand`.

Be careful: `commands.ts` is large. Use targeted edits. Do not globally alter unrelated background messages.

If `handleCoMathCommand` has many direct `showCommandMessage` call sites and threading an argument everywhere is noisy, use a local closure inside `handleCoMathCommand`:

```ts
const show = (text: string) => showCommandMessage(pi, ctx, text, displayOptions);
```

Then replace only command-result call sites inside `handleCoMathCommand` with `show(...)` as needed.

The goal is to prefix the user-visible result of natural `/co` actions, not background completion messages.

## Task 3: Change `/co` to use the combined path

Modify `handleNaturalCoMathCommand(...)`.

Replace the separate prefix notification:

```ts
showCommandMessage(
	pi,
	ctx,
	[`Interpreted: ${command.interpreted}`, `Equivalent debug command: /comath ${command.args}`].join("\n"),
);
await handleCoMathCommand(pi, command.args, ctx, roleRunner);
```

with a combined call:

```ts
const displayPrefix = [`Interpreted: ${command.interpreted}`, `Equivalent debug command: /comath ${command.args}`, ""].join("\n");
await handleCoMathCommand(pi, command.args, ctx, roleRunner, { displayPrefix });
```

Ensure there is exactly one blank line between the debug command and the underlying result.

## Task 4: Ensure non-action `/co` output still works

Do not prefix these cases:

- `/co help`
- unknown natural-language request;
- ambiguous review action guidance;
- translation failures such as no latest report/workstream.

Those are already final outputs and should not need an equivalent `/comath` command unless one exists.

Add or preserve tests for:

```text
/co help
/co looks good
/co show latest report  // before any report exists
```

Expected: clear guidance, no accidental model call.

## Task 5: Add conversation-mode routing coverage if feasible

Current `conversation-mode.test.ts` covers only pure helper functions. Add a focused test at the best available layer to prove the full session behavior:

- `conversationMode: "comath"` routes ordinary input to `/co`;
- slash commands are not rewritten;
- missing `/co` command throws a clear error instead of sending ordinary text to the model.

If there is an existing AgentSession test harness, use it. If adding this requires a large harness, skip it and document why in the final report.

Do not add brittle TUI snapshot tests unless the repo already has a stable TUI test pattern.

## Task 6: Manual TUI smoke test

After tests pass, run this interactive smoke test from a scratch directory:

```bash
mkdir -p /tmp/comath-conversation-smoke
cd /tmp/comath-conversation-smoke

tmux kill-session -t comath-conv-smoke 2>/dev/null || true
tmux new-session -d -s comath-conv-smoke -x 100 -y 30 "/home/hermes/developer/pi-mono-comath/pi-test.sh --comath -e /home/hermes/developer/pi-mono-comath/packages/coding-agent/examples/extensions/co-math/index.ts --approve"
sleep 3
tmux send-keys -t comath-conv-smoke "help" Enter
sleep 2
tmux capture-pane -t comath-conv-smoke -p
```

Expected: visible co-math conversation-mode help.

Then:

```bash
tmux send-keys -t comath-conv-smoke "Start a project for 2605.06651v2 Question 3 validation." Enter
sleep 2
tmux capture-pane -t comath-conv-smoke -p -S -200
```

Expected visible output includes all three parts:

```text
Interpreted: start project
Equivalent debug command: /comath init 2605.06651v2 Question 3 validation
Initialized co-math project state at /tmp/comath-conversation-smoke/.pi/co-math/state.json
```

Then:

```bash
tmux send-keys -t comath-conv-smoke "Set the goal to validate Question 3 using source-backed definitions." Enter
sleep 2
tmux capture-pane -t comath-conv-smoke -p -S -200
```

Expected visible output includes:

```text
Interpreted: set goal
Equivalent debug command: /comath goal validate Question 3 using source-backed definitions.
Added goal goal-1
```

Finally clean up:

```bash
tmux kill-session -t comath-conv-smoke
```

## Validation commands

Run the exact focused tests:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/conversation-mode.test.ts test/co-math-natural-language.test.ts test/co-math-extension.test.ts test/args.test.ts
node ../../node_modules/vitest/dist/cli.js --run test/co-math-role-runner.test.ts test/co-math-state.test.ts test/co-math-extension.test.ts
```

Then run the required repo check:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

Do not run `npm test` or `npm run build` unless the user asks.

## Review checklist

Before reporting back, verify:

- No `any` was introduced.
- No dynamic imports were introduced.
- No unrelated schema/storage changes.
- `/comath` direct command output is unchanged except if tests intentionally update stable wording.
- `/co` action output includes both transparency lines and result text.
- Conversation-mode ordinary prompt uses the same `/co` path and gets the fixed output.
- Default mode remains unchanged.
- Manual smoke test result is reported honestly.

## Suggested Codex prompt

```text
Implement docs/codex-comath-conversation-mode-transparency-plan.md.

Branch:
  comath/conversation-mode

Goal:
  Fix the remaining co-math conversation-mode blocker: ordinary co-math prompts routed through /co must leave the interpreted action and equivalent debug /comath command visible together with the underlying command result in the TUI.

Constraints:
  - Keep the patch small.
  - Do not redesign the parser.
  - Do not change co-math storage/schema.
  - Do not change default Pi mode behavior.
  - Keep /comath as advanced/debug interface.
  - Keep /co working.
  - Do not use transient overwritten UI notifications for the transparency lines.
  - Prefer one combined visible output containing: Interpreted, Equivalent debug command, and command result.
  - No new dependencies.
  - Do not commit.

Validation:
  cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
  node ../../node_modules/vitest/dist/cli.js --run test/conversation-mode.test.ts test/co-math-natural-language.test.ts test/co-math-extension.test.ts test/args.test.ts
  node ../../node_modules/vitest/dist/cli.js --run test/co-math-role-runner.test.ts test/co-math-state.test.ts test/co-math-extension.test.ts

  cd /home/hermes/developer/pi-mono-comath
  npm run check
  git diff --check

Manual smoke:
  Run the tmux smoke in the plan and report whether the visible TUI output includes Interpreted, Equivalent debug command, and the underlying command result.

Report:
  - Files changed
  - Tests run and exact results
  - Manual smoke result
  - Any remaining limitations
```
