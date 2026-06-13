# Co-Math Pi-Native Experience Testing Continuation Plan

> **For Claude Code:** Continue from `docs/claude-comath-pi-native-experience-plan.md`. The implementation appears to be partly or mostly done, but validation was interrupted because a tmux session was accidentally killed. This plan is for testing, verification, and minimal test-fix follow-up only. Do not restart implementation from scratch. Do not commit or push.

**Goal:** Finish validation of the current uncommitted Pi-native co-math implementation and fix only issues discovered by the required tests/smoke.

**Architecture:** Treat the current working tree as the implementation under review. Preserve the intended separation between backend co-math internals and Pi-native product output. Use automated tests first, then a careful tmux manual smoke that only creates and kills its own uniquely named session.

**Tech Stack:** TypeScript, Vitest, npm workspace scripts, tmux, Pi coding-agent CLI via `pi-test.sh`.

---

## Motivation

The previous Claude Code session implemented changes for the Pi-native co-math experience, but the testing phase did not complete because the tmux smoke session was accidentally killed. The codebase now has uncommitted changes, so the next Claude Code conversation should not re-plan or rewrite the product implementation. It should instead:

1. inspect the current diff;
2. run the targeted validation suite;
3. fix only concrete failures;
4. rerun checks;
5. perform the manual smoke safely;
6. report whether the implementation satisfies the original plan.

The most important UX requirement remains: normal `pi comath <source>` interaction should feel like Pi itself, not like a `/comath` extension/debug command stream.

## Expected End Result

When validation finishes, Claude Code should be able to report:

```text
Targeted tests: passed
Co-math regression tests: passed
npm run check: passed
git diff --check: passed
Manual tmux smoke: passed
Working tree: uncommitted changes remain, no commit made
```

The manual smoke should show Pi-native output such as:

```text
Pi is ready to help validate mathematical work.
Source: 2605.06651v2.pdf

Describe the problem you want to investigate.
```

and after:

```text
Validate Question 3.
```

normal output should use product language like:

```text
I’ll set up a source-backed validation run for: Validate Question 3.
✓ Source pinned: 2605.06651v2.pdf
✓ Validation plan created
✓ Definition/assumption audit prepared
✓ Support/indexing gap audit prepared
→ Running source audit in the background
```

Normal output must not show backend/debug phrases such as:

```text
Initialized co-math project state
Added co-math goal
Added co-math workstream
Queued co-math workstream
Started co-math role run
/comath
```

Internal IDs like `role-run-1`, `artifact-1`, and `workstream-*` may appear only in explicit debug/detail output or as part of a transcript path if unavoidable. They should not be the main user-facing concept.

## Current Working Tree Context

Before this continuation plan was written, `git status --short --branch` showed:

```text
## comath/first-class-agent-harness
 M packages/coding-agent/examples/extensions/co-math/commands.ts
 M packages/coding-agent/examples/extensions/co-math/index.ts
 M packages/coding-agent/src/main.ts
 M packages/coding-agent/src/modes/comath/comath-harness.ts
 M packages/coding-agent/src/modes/comath/comath-progress.ts
 M packages/coding-agent/test/co-math-extension.test.ts
 M packages/coding-agent/test/comath-harness.test.ts
 M packages/coding-agent/test/comath-progress.test.ts
 M packages/coding-agent/vitest.config.ts
?? docs/claude-comath-pi-native-experience-plan.md
?? docs/comath-pi-native-smoke.md
?? packages/coding-agent/src/modes/comath/comath-backend-output.ts
?? packages/coding-agent/test/comath-backend-output.test.ts
```

This continuation plan itself will add:

```text
docs/claude-comath-pi-native-testing-continuation-plan.md
```

Do not assume the exact status is unchanged; inspect it at the start.

## Safety Rules for This Continuation

1. Do not run `git reset --hard`, `git checkout .`, `git clean`, or `git stash`.
2. Do not stage, commit, or push unless the user explicitly asks after validation.
3. You are probably running inside the user's active Claude Code tmux session. Do not exit, close, kill, detach, or replace that session. Do not type `/exit`, `exit`, `logout`, `Ctrl+D`, or commands that terminate your own Claude Code session.
4. Do not run `tmux kill-server`, `tmux kill-session` without an exact `-t` target, or any command that could kill the parent/current Claude Code session.
5. Do not kill broad tmux sessions.
6. Only kill the exact smoke-test tmux session created by this plan, and only after recording its output.
7. Use a unique tmux session name with the shell PID or timestamp.
8. Use a fresh `/tmp` working directory for each smoke run.
9. If a test fails, fix the smallest relevant issue and rerun the failing test before continuing.
10. Do not remove product behavior to make tests pass.
11. Preserve direct `/comath` debug behavior unless a test reveals it is broken.
12. If manual smoke output is ambiguous, capture and quote the relevant pane text in the final report.

## Task 1: Inspect the Current Diff Before Testing

**Objective:** Understand what the previous Claude Code session changed without modifying anything.

Run from repo root:

```bash
cd /home/hermes/developer/pi-mono-comath
git status --short --branch
git diff --name-only
git diff --stat
```

Then inspect the key changed files:

```bash
git diff -- packages/coding-agent/src/modes/comath/comath-progress.ts
git diff -- packages/coding-agent/src/modes/comath/comath-harness.ts
git diff -- packages/coding-agent/src/modes/comath/comath-backend-output.ts
git diff -- packages/coding-agent/examples/extensions/co-math/commands.ts
git diff -- packages/coding-agent/src/main.ts
git diff -- packages/coding-agent/test/comath-progress.test.ts
git diff -- packages/coding-agent/test/comath-harness.test.ts
git diff -- packages/coding-agent/test/comath-backend-output.test.ts
```

Confirm these expected implementation themes are present:

- Pi-native startup/help copy;
- product-facing progress formatters;
- silent/product-mode backend command execution;
- helpers to parse backend output into product summaries;
- natural steering aliases such as `show progress` and `show report`;
- tests forbidding extension/backend copy in product output.

If those themes are missing, do not rewrite the whole implementation immediately. Report what is missing and ask the user whether to continue implementation or only test what exists.

## Task 2: Run the Smallest New/Changed Tests First

**Objective:** Validate the newly added/changed product-output units before running broader suites.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run \
  test/comath-progress.test.ts \
  test/comath-backend-output.test.ts \
  test/comath-harness.test.ts
```

Expected:

```text
PASS
```

If this fails:

1. Read the failure output fully.
2. Fix only the failing product-output or harness behavior.
3. Rerun the same command until it passes.
4. Keep direct backend command behavior intact.

Common likely failures and intended fixes:

- If tests fail because output still contains `Co-math research mode`, update product copy in `comath-progress.ts`.
- If tests fail because output still contains `Added co-math goal` or `Queued co-math workstream`, ensure product-mode backend calls are silent and harness notices are the only normal visible output.
- If tests fail because `show progress` is unsupported, add or fix the steering alias in `comath-harness.ts`.
- If tests fail because parser helpers are brittle, fix `comath-backend-output.ts` with simple line-based parsing.

## Task 3: Run the Original Targeted Plan Tests

**Objective:** Verify the implementation still satisfies the first-class harness behavior from the prior milestone.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run \
  test/comath-progress.test.ts \
  test/comath-backend-output.test.ts \
  test/comath-harness.test.ts \
  test/comath-source.test.ts \
  test/comath-autoplan.test.ts \
  test/args.test.ts \
  test/conversation-mode.test.ts
```

Expected:

```text
PASS
```

If failures occur, fix only concrete regressions. Do not update snapshots or weaken assertions unless the expected product copy intentionally changed and the assertion is stale.

## Task 4: Run Co-Math Regression Tests

**Objective:** Ensure direct `/comath` extension/debug behavior still works after product-mode output was hidden.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run \
  test/co-math-natural-language.test.ts \
  test/co-math-extension.test.ts \
  test/co-math-role-runner.test.ts \
  test/co-math-state.test.ts
```

Expected:

```text
PASS
```

Important distinction:

- Product mode should hide backend phrases.
- Direct extension/debug tests may still assert backend terms like goals, workstreams, role runs, artifacts, and `/comath` help.

Do not remove backend/debug output globally just to satisfy product-mode tests.

## Task 5: Run Repository Checks

**Objective:** Verify typecheck/lint/package checks before manual smoke.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
```

Expected:

```text
success / no errors, warnings, or infos
```

Then run:

```bash
cd /home/hermes/developer/pi-mono-comath
git diff --check
```

Expected: no output and exit code 0.

If `npm run check` fails due to TypeScript or lint issues, fix them. Do not run `npm run build` or the full `npm test` unless the user asks.

## Task 6: Prepare a Safe Manual Smoke Script Without Killing Other Sessions

**Objective:** Avoid repeating the tmux accident.

Use a unique session name. Do not use a generic name like `pi-test`, `claude`, `test`, or `comath-smoke`.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath
SMOKE_ID="comath-pi-native-$(date +%s)-$$"
SMOKE_DIR=$(mktemp -d /tmp/comath-pi-native.XXXXXX)
printf 'session=%s\ndir=%s\n' "$SMOKE_ID" "$SMOKE_DIR"
tmux new-session -d -s "$SMOKE_ID" -x 120 -y 40 "cd '$SMOKE_DIR' && /home/hermes/developer/pi-mono-comath/pi-test.sh comath /home/hermes/developer/pi-mono-comath/docs/2605.06651v2.pdf --approve"
sleep 4
tmux capture-pane -t "$SMOKE_ID" -p -S -220
```

Do not run `tmux kill-server`.

Do not run `tmux kill-session` without `-t "$SMOKE_ID"`.

If the command fails because the session name is missing, stop and inspect with:

```bash
tmux list-sessions
```

Do not kill anything from `tmux list-sessions` unless it exactly matches the session name you created.

## Task 7: Manual Smoke Step 1 — Startup and Help

**Objective:** Verify startup/help are Pi-native and help does not create state.

Send help:

```bash
tmux send-keys -t "$SMOKE_ID" "help" Enter
sleep 2
tmux capture-pane -t "$SMOKE_ID" -p -S -260
```

Expected startup/help properties:

- contains `Pi is ready` or equivalent Pi-native wording;
- contains `Source: 2605.06651v2.pdf`;
- asks the user to describe the problem/claim;
- does not advertise `/comath`;
- does not say `Co-math research mode`.

Verify no state was created by help:

```bash
python3 -c 'from pathlib import Path; import os, sys; p=Path(os.environ["SMOKE_DIR"])/".pi/co-math/state.json"; print("state exists after help:", p.exists()); sys.exit(1 if p.exists() else 0)'
```

If environment variables are not preserved because commands are run in separate shells, re-export them from the printed values:

```bash
export SMOKE_ID='<printed session value>'
export SMOKE_DIR='<printed dir value>'
```

## Task 8: Manual Smoke Step 2 — Initial Problem Setup

**Objective:** Verify typing a normal problem creates the project internally while showing product-level progress only.

Send:

```bash
tmux send-keys -t "$SMOKE_ID" "Validate Question 3." Enter
sleep 8
tmux capture-pane -t "$SMOKE_ID" -p -S -420
```

Expected visible product output:

- source-backed validation run starts;
- source is pinned;
- validation plan is created;
- definition/assumption audit is prepared;
- support/indexing gap audit is prepared;
- source audit starts in background;
- user is told they can keep steering.

Forbidden normal output:

```text
Initialized co-math project state
Added co-math goal
Added co-math workstream
Queued co-math workstream
Started co-math role run
/comath
```

If forbidden output appears, inspect whether it comes from backend command messages not being silenced. Fix the product-mode backend runner path, not the debug `/comath` path.

## Task 9: Manual Smoke Step 3 — Natural Steering

**Objective:** Verify the user can steer and inspect without extension vocabulary.

Run:

```bash
tmux send-keys -t "$SMOKE_ID" "show progress" Enter
sleep 2
tmux capture-pane -t "$SMOKE_ID" -p -S -240
```

Expected:

```text
Current progress
```

or equivalent product status. It should not require `show latest run`.

Then:

```bash
tmux send-keys -t "$SMOKE_ID" "focus on the support indexing gap" Enter
sleep 2
tmux capture-pane -t "$SMOKE_ID" -p -S -240
```

Expected:

```text
Focus noted: support indexing gap.
```

or equivalent product copy.

Then, after giving the background run time to finish or block:

```bash
sleep 15
tmux send-keys -t "$SMOKE_ID" "show report" Enter
sleep 4
tmux capture-pane -t "$SMOKE_ID" -p -S -320
```

Expected:

- product-level latest report;
- if blocked, explains missing exact Question 3 statement;
- suggests the next user action naturally;
- does not require `/comath`.

Then:

```bash
tmux send-keys -t "$SMOKE_ID" "show uncertainty" Enter
sleep 2
tmux capture-pane -t "$SMOKE_ID" -p -S -240
```

Expected:

- product-readable uncertainty/review queue output;
- no crash.

## Task 10: Manual Smoke Step 4 — Inspect State Invariants

**Objective:** Verify the Pi-native presentation did not break the backend state.

Run:

```bash
python3 -c 'import json, os, pathlib; p=pathlib.Path(os.environ["SMOKE_DIR"])/".pi/co-math/state.json"; print("state exists", p.exists()); s=json.loads(p.read_text()); print("rootQuestion", s.get("rootQuestion")); print("goals", len(s.get("approvedGoals", []))); print("workstreams", len(s.get("workstreams", []))); print("roleRuns", [(r.get("id"), r.get("status"), r.get("reportId")) for r in s.get("roleRuns", [])]); print("reports", len(s.get("reports", []))); print("sources", [(a.get("id"), a.get("sourcePathKind"), a.get("sourcePath")) for a in s.get("artifacts", []) if a.get("kind") == "source"]); transcripts=pathlib.Path(os.environ["SMOKE_DIR"])/".pi/co-math/transcripts"; print("transcripts", [str(x.relative_to(pathlib.Path(os.environ["SMOKE_DIR"]))) for x in transcripts.glob("*.jsonl")] if transcripts.exists() else [])'
```

Expected:

```text
state exists True
goals 3
workstreams 3
roleRuns at least one entry
sources includes one source artifact with sourcePathKind and sourcePath
transcripts includes at least one .jsonl file
```

A blocked report is acceptable for `Validate Question 3.` because the source PDF may not contain a literal `Question 3` statement. The important behavior is that the assistant preserves uncertainty instead of inventing the missing statement.

## Task 11: Clean Up Only the Created Smoke Session

**Objective:** Avoid killing unrelated sessions.

Run exactly:

```bash
tmux kill-session -t "$SMOKE_ID"
```

If it says the session does not exist, do not run broader kill commands. Just note it in the final report.

Leave the `/tmp/comath-pi-native.*` directory in place if it contains useful evidence. Report its path.

## Task 12: Final Diff and Report

**Objective:** Produce a concise validation report for the user.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath
git status --short --branch
git diff --name-only
```

Do not commit.

Final report must include:

1. Whether each validation command passed.
2. Any failures encountered and what was changed to fix them.
3. Whether manual smoke passed.
4. The smoke directory path.
5. The tmux session name used.
6. Whether the `[co-math]` label is gone, changed, or still a known limitation.
7. Whether forbidden backend phrases appeared in normal mode.
8. State invariant results: goals/workstreams/roleRuns/source/transcripts.
9. Remaining UX caveats.
10. Confirmation that no commit or push was performed.

## If Tests Fail Repeatedly

If the same area fails after two focused fixes, stop and report:

```text
Blocked in validation.
Failing command: ...
Failing test: ...
Likely cause: ...
Files touched during attempted fix: ...
Recommended next implementation step: ...
```

Do not keep making broad rewrites.

## Suggested First Prompt for Claude Code

Use this in a fresh Claude Code conversation from repo root:

```text
Continue from docs/claude-comath-pi-native-experience-plan.md using docs/claude-comath-pi-native-testing-continuation-plan.md. The implementation already has uncommitted changes, but the previous testing phase was interrupted because a tmux session was accidentally killed. Do not restart the implementation. Important: you are running inside the user's active Claude Code tmux session; do not exit it, detach it, kill it, type /exit, run exit/logout, send Ctrl+D, or otherwise terminate your own session. Inspect the current diff, run the targeted tests, fix only concrete test/check failures, run npm run check and git diff --check, then perform the manual tmux smoke using a unique session name and only kill that exact smoke-test session after capturing output. Do not commit or push. Report validation results, smoke output, state invariants, remaining UX caveats, and whether forbidden backend phrases still appear in normal product mode.
```
