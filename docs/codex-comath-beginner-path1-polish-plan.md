# Co-Math Beginner Path 1 Polish Plan

> For Codex: implement this plan on `/home/hermes/developer/pi-mono-comath` from the current `comath/research-exploration-mode` branch. Do not add new co-math architecture. Do not commit. Focus only on making the beginner Path 1 manual test feel good.

## Goal

Make this beginner flow reliable and understandable:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
please continue path 1
```

A beginner should be able to tell:

```text
1. what Pi wants them to type next,
2. whether Pi started working,
3. whether Pi is still working,
4. what Path 1 found,
5. what concrete command they can try next.
```

Do not implement new workstream types, proof tools, coordinator features, literature features, or state schemas unless absolutely required for this UX fix.

## Why this plan exists

Recent manual testing showed the architecture is growing faster than the beginner product loop.

Bad observed behavior:

```text
User: please continue path 1
Pi: Current research state
```

Expected behavior:

```text
User: please continue path 1
Pi: starts Path 1 computational workstream
```

Also bad:

```text
Pi suggests:
Compute or manually inspect small cases and look for modular obstructions.

User types that exact sentence.
Pi does not execute it.
```

A beginner-facing product must not suggest commands that it cannot handle.

## Non-goals

Do not:

```text
- add another architecture milestone from the paper
- add new workstream categories
- expand Path 5 literature behavior
- expand coordinator synthesis
- add parallel workstreams
- add formal proof integration
- expose raw state/debug concepts in beginner output
- require users to know workstream/artifact/report internals
```

Advanced/developer flows may remain available behind `show latest report`, debug commands, or existing smoke sections. The default beginner flow should be simple.

## Current known changed files

At the time this plan was written, the worktree already had uncommitted Codex changes in:

```text
docs/comath-research-exploration-smoke.md
packages/coding-agent/src/main.ts
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
packages/coding-agent/src/modes/interactive/interactive-mode.ts
packages/coding-agent/test/comath-harness.test.ts
packages/coding-agent/test/comath-progress.test.ts
```

Inspect those changes before editing. Keep useful code if it helps, but do not preserve code that fails the beginner manual test.

## Target manual test

From a fresh folder:

```bash
cd /tmp
mkdir comath-beginner-path1-polish-test-1
cd comath-beginner-path1-polish-test-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
```

Expected first response:

```text
Research workspace prepared
```

It should list paths, then give an executable next command:

```text
Next
Run the examples path:
continue path 1
```

Then type:

```text
please continue path 1
```

Pass if:

```text
- Path 1 starts.
- Pi does not print only Current research state.
- A Pi-native running/status indicator is visible while it works.
- The editor remains usable.
- The final Path 1 result appears.
```

Then type:

```text
show research state
```

Pass if:

```text
- The output includes an executable suggested command.
- It does not tell the user to type a sentence Pi cannot execute.
```

## Required fixes

### 1. Natural beginner continuation routing

Find the prompt routing in:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
```

Currently, continuation is too strict. It matches prompts that begin with `continue`, but beginner phrasing falls through.

Support at least these inputs:

```text
continue path 1
please continue path 1
please continue with path 1
continue with path 1
run path 1
please run path 1
start path 1
please start path 1
try path 1
please try path 1
continue the first path
please continue the first path
run the first path
start the first path
try the first path
```

All of these should start the same Path 1 flow as `continue path 1`.

Implementation guidance:

```text
- Prefer a small helper such as parseResearchPathContinuationPrompt(prompt, state).
- Keep exact existing behavior for `continue path N`.
- Avoid broad matching that accidentally triggers on unrelated text.
- Support ordinal words only for the first few paths if simple: first, second, third, fourth, fifth.
- Strip polite prefixes like `please`, `can you`, `could you`, `let's`, `lets` before matching.
```

Tests:

```text
- `please continue path 1` starts a Path 1 run.
- `run path 1` starts a Path 1 run.
- `start path 1` starts a Path 1 run.
- `try path 1` starts a Path 1 run.
- `please continue the first path` starts a Path 1 run.
- invalid path still warns and does not create a run.
```

### 2. Make suggested next steps executable

Current summary output can say:

```text
Most promising next move
Compute or manually inspect small cases and look for modular obstructions.
```

That is not good enough, because the user can type it and nothing happens.

Change beginner-facing research-state and workspace-prepared output to include a command Pi understands.

Preferred output:

```text
Next
Run the examples path:
continue path 1
```

For summaries:

```text
Suggested command
continue path 1
```

If keeping the prose rationale, make it secondary:

```text
Why
This checks small examples and simple obstructions first.

Suggested command
continue path 1
```

Tests:

```text
- `formatResearchStateSummary` includes `continue path 1` when Path 1 is the best next path.
- Initial exploration output includes an executable next command if that output is formatted in code under test.
- The summary does not present a bare non-executable sentence as the only next move.
```

### 3. Either execute the old suggested sentence or stop suggesting it as input

The old suggested sentence is:

```text
Compute or manually inspect small cases and look for modular obstructions.
```

Choose one of these options:

Option A, preferred if simple:

```text
Typing that sentence routes to Path 1.
```

Option B, acceptable:

```text
Do not present that sentence as a user action. Present only `continue path 1` as the command.
```

If choosing Option A, add a narrowly scoped matcher for Path 1 suggested-next-move text. Do not add a general fuzzy semantic parser.

### 4. Pi-native activity indicator, not only prose

The visible running state should use Pi's existing UI/status machinery where possible.

Relevant existing hooks:

```text
packages/coding-agent/src/core/extensions/types.ts
- ctx.ui.setStatus(...)
- ctx.ui.setWidget(...)
- ctx.ui.setWorkingMessage(...)
- ctx.ui.setWorkingVisible(...)
- ctx.ui.setWorkingIndicator(...)

packages/coding-agent/src/core/footer-data-provider.ts
packages/coding-agent/src/modes/interactive/components/footer.ts
packages/tui/src/components/loader.ts
packages/tui/src/components/cancellable-loader.ts
packages/tui/src/terminal.ts
```

Preferred minimum:

```text
Use footer status via the existing extension/status mechanism.
```

Example while running:

```text
co-math: Path 1 running · computation
```

When the run stage changes, update the status:

```text
co-math: Path 1 running · coordinator
co-math: Path 1 running · specialist
co-math: Path 1 running · computation
co-math: Path 1 running · critic
co-math: Path 1 running · synthesis
```

When the run finishes/fails/blocks/stales, clear it.

Important:

```text
- Do not fake AgentSession.isStreaming.
- Do not block the editor.
- Do not require a user to type `show progress` to know something is running.
- Do not rely only on a printed sentence.
```

If the current implementation already added a bridge in `main.ts` / `interactive-mode.ts`, keep it only if the manual test clearly shows the status while a run is active.

Tests:

```text
- activity start callback fires when Path 1 starts.
- activity update callback fires as stages advance.
- activity end callback fires in finally/cleanup.
- stale/interrupted runs clear activity.
```

Do not over-test actual terminal rendering if current test infrastructure does not support it. Verify with the manual tmux smoke.

### 5. Beginner-friendly Path 1 completion output

The default completion after Path 1 should be concise and useful.

Good shape:

```text
Path 1 completed: Small examples and counterexamples

What I checked
- I tested n = 1..200 for primes of the form n^2 + 1.

What we found
- Some examples work: n = 1, 2, 4, 6, 10, ...
- Odd n > 1 never work because n^2 + 1 is even and greater than 2.

Important limitation
- This finite search is evidence only. It does not prove there are infinitely many such primes.

Next
Try a proof-oriented path:
continue path 2
```

Avoid in the default completion:

```text
- raw artifact IDs as the main thing the user sees
- long repeated paragraphs
- awkward bullet formatting around display math
- raw stage names if clearer English is available
- `workstream` if a simpler word like `path` or `research run` is sufficient
```

Detailed report may still show script paths/artifacts under:

```text
show latest report
```

But even detailed report should avoid broken markdown bullets like:

```text
- \[
- n^2+1
- \]
```

### 6. Update beginner docs only

Edit:

```text
docs/comath-research-exploration-smoke.md
```

Make the top beginner smoke simple and non-destructive:

```bash
cd /tmp
mkdir comath-beginner-path1-demo
cd comath-beginner-path1-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Beginner prompts:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
please continue path 1
show research state
show latest report
```

Keep Path 5 and coordinator as advanced/developer sections, not beginner required steps.

Do not use cleanup commands such as `rm -rf` in beginner instructions.

## Validation commands

Focused co-math tests:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run \
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

Repo checks:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

Manual smoke:

```bash
cd /tmp
mkdir comath-beginner-path1-polish-test-1
cd comath-beginner-path1-polish-test-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
please continue path 1
show research state
show latest report
```

Pass checklist:

```text
[ ] Initial output gives executable next command: continue path 1.
[ ] `please continue path 1` starts Path 1.
[ ] It does not fall back to Current research state.
[ ] A Pi-native status/loading indicator is visible while Path 1 runs.
[ ] Editor remains usable while Path 1 runs.
[ ] `show progress` works if typed while active.
[ ] Running indicator clears after completion.
[ ] Completion output is concise and beginner-readable.
[ ] Completion says finite computation is not proof.
[ ] Completion includes a concrete next command.
[ ] `show research state` includes an executable suggested command.
[ ] `show latest report` still shows detailed script/result artifacts.
```

Optional state check after exiting Pi:

```bash
python3 -c 'import json, pathlib
p=pathlib.Path(".pi/co-math/state.json")
print("state exists:", p.exists())
s=json.loads(p.read_text())
print("researchReports:", len(s.get("researchReports", [])))
print("researchWorkstreamRuns:", len(s.get("researchWorkstreamRuns", [])))
print("computationalArtifacts:", len(s.get("computationalArtifacts", [])))
for r in s.get("researchWorkstreamRuns", []):
    print("run:", r.get("id"), r.get("pathTitle"), r.get("status"), r.get("currentStage"))
for a in s.get("computationalArtifacts", []):
    print("artifact:", a.get("id"), a.get("kind"), a.get("status"), a.get("filePath"), "exit", a.get("exitCode"))
'
```

Expected:

```text
researchReports >= 1
researchWorkstreamRuns >= 1
computationalArtifacts >= 2
```

## Final response from Codex

When done, report:

```text
- exact files changed
- which beginner prompts now route to Path 1
- how the running indicator is implemented
- focused co-math suite result
- npm run check result
- git diff --check result
- manual smoke folder and pass/fail notes
- any remaining beginner UX rough edges
```

Do not commit.
