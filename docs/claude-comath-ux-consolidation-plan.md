# Co-Math UX Consolidation Refactor Plan

> **For Claude Code:** Implement this plan on `/home/hermes/developer/pi-mono-comath` from the current `comath/research-exploration-mode` branch. Do not add new co-math product features. Do not commit unless explicitly asked. This is a cleanup/refactor milestone after the beginner Path 1 polish.

## Goal

Make the existing co-math UX plumbing easier to maintain before adding more paper-architecture features.

Focus only on consolidation:

```text
1. shared markdown parsing
2. unified report/progress prompt routing
3. clearer beginner vs advanced report presentation boundaries
4. a small design note for future first-class background activity API
```

Do not change the successful beginner Path 1 behavior unless needed to preserve it during refactor.

## Motivation

The beginner Path 1 polish made the manual flow usable:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
please continue path 1
```

But the implementation still has technical debt that will slow future UX work:

```text
- parseMarkdown logic is duplicated across multiple co-math modules.
- report commands such as show report / show latest report / show details are spread across routing branches.
- beginner output and advanced/debug report output are not cleanly separated.
- co-math background activity currently uses a custom bridge rather than a reusable Pi background-activity API.
```

This plan should make the current behavior easier to maintain without expanding scope.

## Expected End Result

After implementation:

```text
- Beginner Path 1 manual smoke still passes.
- One shared markdown parser handles model/workstream/coordinator parsing.
- Display math no longer becomes orphan bullets such as `- \[` / `- \]`.
- `show report`, `show latest report`, and polite variants route through one research-report prompt helper.
- `show progress`, `status`, and polite variants route through one progress prompt helper.
- Beginner default output remains concise.
- Detailed artifact/report output remains available through `show latest report`.
- No new architecture features are introduced.
```

## Non-goals

Do not implement:

```text
- new workstream types
- new coordinator behavior
- source lookup/networking
- formal proof integration
- parallel workstreams
- a full background activity API implementation
- large TUI redesign
```

For background activity, write a small design note only, unless a trivial cleanup is needed around the existing bridge.

## Current Reference Points

Recent committed baseline:

```text
135acaf3 fix(coding-agent): polish beginner co-math path flow
```

Relevant files:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
packages/coding-agent/src/modes/comath/comath-research-model-workstream.ts
packages/coding-agent/src/modes/comath/comath-computation-workstream.ts
packages/coding-agent/src/modes/comath/comath-literature-workstream.ts
packages/coding-agent/src/modes/comath/comath-coordinator-synthesis.ts
packages/coding-agent/src/main.ts
packages/coding-agent/src/modes/interactive/interactive-mode.ts
packages/coding-agent/test/comath-harness.test.ts
packages/coding-agent/test/comath-progress.test.ts
packages/coding-agent/test/comath-computation-workstream.test.ts
docs/comath-research-exploration-smoke.md
```

Existing Pi/TUI activity references:

```text
packages/coding-agent/src/core/extensions/types.ts
packages/coding-agent/src/core/footer-data-provider.ts
packages/coding-agent/src/modes/interactive/components/footer.ts
packages/coding-agent/src/modes/interactive/interactive-mode.ts
packages/tui/src/components/loader.ts
packages/tui/src/terminal.ts
```

## Task 1: Extract Shared Co-Math Markdown Parser

Objective: remove duplicated markdown parsing logic from co-math workstream/coordinator modules.

Create:

```text
packages/coding-agent/src/modes/comath/comath-markdown.ts
packages/coding-agent/test/comath-markdown.test.ts
```

Move shared parser behavior from the current duplicated `parseMarkdown` implementations in:

```text
packages/coding-agent/src/modes/comath/comath-research-model-workstream.ts
packages/coding-agent/src/modes/comath/comath-computation-workstream.ts
packages/coding-agent/src/modes/comath/comath-literature-workstream.ts
packages/coding-agent/src/modes/comath/comath-coordinator-synthesis.ts
```

Suggested exported types/functions:

```ts
export interface CoMathMarkdownSection {
  heading: string;
  items: string[];
}

export interface CoMathParsedMarkdown {
  sections: CoMathMarkdownSection[];
  raw: string[];
}

export function parseCoMathMarkdown(text: string): CoMathParsedMarkdown;

export function getCoMathMarkdownSectionItems(
  parsed: CoMathParsedMarkdown,
  heading: string,
): string[];

export function firstCoMathMarkdownSectionItem(
  parsed: CoMathParsedMarkdown,
  heading: string,
): string | undefined;
```

Parser requirements:

```text
- Preserve existing parsed output semantics.
- Keep heading matching behavior needed by current modules.
- Keep the display-math bullet fix from the beginner polish.
- Merge display math blocks into the surrounding bullet instead of creating orphan bullets.
- Do not introduce `any`.
- Use top-level imports only.
```

Tests to add in `comath-markdown.test.ts`:

```text
- parses headings and bullet items
- retrieves section items case-insensitively if current code expects that
- preserves raw lines as current callers need
- folds display math into one bullet, not separate `[` / expression / `]` bullets
- handles blank lines and non-bullet text consistently with current duplicated copies
```

Then update all four modules to import the shared parser and delete local parser copies.

Verification:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/comath-markdown.test.ts test/comath-computation-workstream.test.ts test/comath-coordinator-synthesis.test.ts test/comath-research-model-workstream.test.ts test/comath-literature-workstream.test.ts
```

## Task 2: Centralize Co-Math Prompt Routing Helpers

Objective: reduce duplicated regex routing for report/progress/state prompts.

Create or extend a small routing helper module:

```text
packages/coding-agent/src/modes/comath/comath-prompts.ts
packages/coding-agent/test/comath-prompts.test.ts
```

If a similar module already exists, use it instead of creating another.

Add helpers such as:

```ts
export function normalizeCoMathPrompt(prompt: string): string;
export function isShowProgressPrompt(prompt: string): boolean;
export function isShowResearchStatePrompt(prompt: string): boolean;
export function isShowLatestReportPrompt(prompt: string): boolean;
export function isShowReportForPathPrompt(prompt: string): { pathNumber: number } | undefined;
export function isShowLatestCoordinatorReportPrompt(prompt: string): boolean;
```

Routing requirements:

```text
- Keep current successful beginner prompt behavior.
- `show progress`, `status`, and polite variants should work.
- `show research state`, `summarize current state`, and polite variants should work.
- `show latest report`, `show report`, `show the report`, and polite variants should work.
- `show details for path 1`, `show report for path 1`, and polite variants should work.
- Keep coordinator report command distinct from ordinary latest research report.
- Avoid over-broad matching that turns arbitrary prose into commands.
```

Examples that should match:

```text
show progress
please show progress
status
show research state
please summarize current state
show report
show latest report
please show the latest report
show details for path 1
please show report for path 2
show latest coordinator report
```

Examples that should not accidentally match:

```text
run a quick sanity check
report that this theorem is false
progress on this proof may require density estimates
```

Update `comath-harness.ts` to call these helpers rather than scattering raw regexes.

Verification:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/comath-prompts.test.ts test/comath-harness.test.ts
```

## Task 3: Keep Beginner and Detailed Report Presentation Separate

Objective: make sure normal beginner output stays short while advanced detail remains available.

Review:

```text
packages/coding-agent/src/modes/comath/comath-progress.ts
```

Clarify function boundaries, for example:

```text
- beginner completion summary: used automatically when a path finishes
- detailed report formatting: used by `show latest report`
- research state summary: used by `show research state`
- running progress summary: used by `show progress`
```

Do not necessarily rename public functions if it creates too much churn, but make the boundaries clear in code and tests.

Requirements:

```text
- automatic Path 1 completion output stays concise and beginner-readable
- automatic output includes a concrete next command
- automatic output does not lead with raw artifact IDs
- `show latest report` still shows script path/result artifacts
- `show research state` still includes executable suggested command
- no output tells the user to type prose that Pi cannot handle
```

Tests:

```text
- automatic completion formatter does not expose raw artifact IDs as primary content
- detailed report formatter still includes artifact paths/details
- research state summary includes `Suggested command` and `continue path N`
```

Verification:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/comath-progress.test.ts test/comath-harness.test.ts
```

## Task 4: Review Existing Co-Math Activity Bridge, Do Not Expand It

Objective: document current activity bridge and avoid further co-math-specific UI sprawl.

Review current implementation in:

```text
packages/coding-agent/src/main.ts
packages/coding-agent/src/modes/interactive/interactive-mode.ts
packages/coding-agent/src/modes/comath/comath-harness.ts
```

Keep the current footer status behavior if the beginner smoke passes:

```text
co-math: Path 1 running · computation
```

Do not fake `AgentSession.isStreaming`.

Add comments only where useful:

```text
- explain that co-math runs are background tasks outside normal Agent streaming
- explain why footer extension status is used for now
- point to the future background activity design note
```

No large UI change in this task.

## Task 5: Add Design Note for Future First-Class Background Activity API

Objective: capture the better long-term direction without implementing it now.

Create:

```text
docs/comath-background-activity-api-notes.md
```

Include:

```text
- current behavior: AgentSession.isStreaming drives normal loader
- co-math behavior: background promises run after the normal agent turn ends
- current workaround: CoMathHarness activity callbacks -> main.ts -> InteractiveMode.setCoMathActivityStatus -> footer status
- why not fake isStreaming
- proposed future API shape
- migration path from co-math bridge to generic API
```

Possible future API sketch:

```ts
ctx.ui.startBackgroundActivity({
  key: "co-math",
  label: "Path 1",
  detail: "running computation",
  indicator: "spinner",
});

ctx.ui.updateBackgroundActivity("co-math", {
  detail: "reviewing limits",
});

ctx.ui.endBackgroundActivity("co-math");
```

Keep it short. This is a note, not an implementation spec.

## Task 6: Update Smoke Docs After Refactor

Update:

```text
docs/comath-research-exploration-smoke.md
```

Keep beginner Path 1 smoke at the top.

Make clear:

```text
- beginner smoke uses only Path 1
- Path 5 / coordinator are advanced/developer smoke
- `show latest report` is the detailed report command
- `show report` is an alias if supported
```

Avoid destructive cleanup commands in beginner instructions.

## Validation Commands

Run focused co-math suite:

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

If exact new test file names differ, adjust the command and report what changed.

Run repo checks:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

Manual beginner smoke:

```bash
cd /tmp
mkdir comath-ux-consolidation-smoke-1
cd comath-ux-consolidation-smoke-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
please continue path 1
show progress
show research state
show report
show latest report
```

Pass checklist:

```text
[ ] initial output includes `continue path 1`
[ ] `please continue path 1` starts Path 1
[ ] footer status shows co-math running while active
[ ] final output is concise and says finite computation is not proof
[ ] `show research state` includes executable suggested command
[ ] `show report` and `show latest report` both show the latest detailed report or documented equivalent behavior
[ ] detailed report still includes computation artifact paths
[ ] no orphan math bullets like `- \[` or `- \]`
```

## Final Response Required From Claude Code

Report:

```text
- files changed
- whether a shared markdown parser was extracted
- whether routing helpers were extracted
- which report/progress aliases are supported
- focused co-math suite result
- npm run check result
- git diff --check result
- manual smoke folder and result
- any behavior intentionally left unchanged
```

Do not commit unless explicitly asked.
