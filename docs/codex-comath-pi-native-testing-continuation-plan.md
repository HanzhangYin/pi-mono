# Co-Math Pi-Native Experience Codex Testing Continuation Plan

> **For Codex:** Continue from `docs/claude-comath-pi-native-experience-plan.md`, but use this testing plan instead of the Claude Code continuation plan. The implementation already has uncommitted changes. The previous validation attempt was interrupted because Claude Code repeatedly killed/exited tmux sessions. Your job is to validate the current implementation with Codex and fix only concrete test/check failures. Do not restart implementation from scratch. Do not commit or push.

**Goal:** Finish validation of the current uncommitted Pi-native co-math implementation and fix only issues discovered by the required tests/smoke.

**Architecture:** Treat the current working tree as the implementation under review. Preserve the intended separation between backend co-math internals and Pi-native product output. Run automated tests first. Then do a careful manual tmux smoke where the only tmux session you create or kill is the uniquely named smoke-test session.

**Tech Stack:** TypeScript, Vitest, npm workspace scripts, tmux, Pi coding-agent CLI via `pi-test.sh`, Codex CLI.

---

## Motivation

The Pi-native co-math UX implementation was started by Claude Code, but validation did not complete because Claude Code kept killing or exiting tmux sessions during smoke testing. The codebase now contains uncommitted implementation changes. The next agent should not reimplement the feature; it should validate what is already there.

Use Codex because the remaining work is bounded and verification-heavy:

1. inspect the current diff;
2. run the targeted tests;
3. fix only concrete failures;
4. run `npm run check` and `git diff --check`;
5. perform the manual tmux smoke safely;
6. report whether the implementation satisfies the original Pi-native UX plan.

The UX requirement remains:

```text
Normal `pi comath <source>` interaction should feel like Pi itself, not like a `/comath` extension/debug command stream.
```

## Expected End Result

Codex should report:

```text
Targeted product tests: passed
Original harness tests: passed
Co-math regression tests: passed
npm run check: passed
git diff --check: passed
Manual tmux smoke: passed
Working tree: uncommitted changes remain, no commit made
```

Startup should look Pi-native, for example:

```text
Pi is ready to help validate mathematical work.
Source: 2605.06651v2.pdf

Describe the problem you want to investigate.
```

After typing:

```text
Validate Question 3.
```

normal output should look product-level, for example:

```text
I’ll set up a source-backed validation run for: Validate Question 3.
✓ Source pinned: 2605.06651v2.pdf
✓ Validation plan created
✓ Definition/assumption audit prepared
✓ Support/indexing gap audit prepared
→ Running source audit in the background
```

Normal output must not show backend/debug phrases:

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

At the time this plan was written, the branch had uncommitted changes from the Pi-native implementation. Inspect current status at the start because it may have changed.

Previously observed status included:

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

This Codex continuation plan adds:

```text
docs/codex-comath-pi-native-testing-continuation-plan.md
```

## Codex Execution Guidance

Recommended: run Codex interactively from repo root, not inside the smoke-test tmux session:

```bash
cd /home/hermes/developer/pi-mono-comath
codex
```

Then paste the prompt from the bottom of this plan.

Do not use `codex exec` if you expect Codex to stay open for follow-up instructions. `codex exec` is a one-shot command and exits by design when the prompt finishes, fails, or hits a limit. That can look like Codex "killed itself", but it is normal `exec` behavior. Use interactive `codex` for a persistent session.

If you intentionally want a one-shot run, this is acceptable, but expect it to exit afterward:

```bash
cd /home/hermes/developer/pi-mono-comath
codex exec --full-auto '<prompt from bottom of this plan>'
```

Important:

- Codex itself does not need to run inside tmux.
- If Codex is running inside a user-created tmux session, it must not type `exit`, `/exit`, `logout`, send `Ctrl+D`, detach, or kill that parent/current session.
- Codex should not start or kill any tmux session except the dedicated Pi smoke-test session described below.
- Codex should not use `tmux kill-server`.
- Codex should not run broad tmux cleanup commands.
- Codex should not kill the user's terminal, shell, or any existing agent session.
- Codex must not commit or push.

## Safety Rules

1. Do not run `git reset --hard`, `git checkout .`, `git clean`, or `git stash`.
2. Do not stage, commit, or push unless the user explicitly asks after validation.
3. Do not kill broad tmux sessions.
4. Never run `tmux kill-server`.
5. Never run `tmux kill-session` without an exact `-t "$SMOKE_ID"` target.
6. Prefer not to kill even the smoke-test session; leave it alive and report its name so the user can inspect it. If cleanup is necessary, only kill the exact smoke-test tmux session created by this plan, and only after recording its output.
7. Use a unique tmux session name with timestamp and shell PID.
8. Use a fresh `/tmp` working directory for each smoke run.
9. If a test fails, fix the smallest relevant issue and rerun the failing test before continuing.
10. Do not remove product behavior to make tests pass.
11. Preserve direct `/comath` debug behavior unless a test reveals it is broken.
12. If manual smoke output is ambiguous, capture and quote the relevant pane text in the final report.

## Task 1: Inspect Current Diff Before Testing

Run from repo root:

```bash
cd /home/hermes/developer/pi-mono-comath
git status --short --branch
git diff --name-only
git diff --stat
```

Inspect key changed files:

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

If those themes are missing, do not rewrite the whole implementation immediately. Report what is missing and ask whether to continue implementation or only test what exists.

## Task 2: Run Smallest New/Changed Tests First

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run \
  test/comath-progress.test.ts \
  test/comath-backend-output.test.ts \
  test/comath-harness.test.ts
```

Expected: pass.

If this fails:

1. Read the failure output fully.
2. Fix only the failing product-output or harness behavior.
3. Rerun the same command until it passes.
4. Keep direct backend command behavior intact.

Likely fixes:

- If output still contains `Co-math research mode`, update product copy in `comath-progress.ts`.
- If output still contains `Added co-math goal` or `Queued co-math workstream`, ensure product-mode backend calls are silent and harness notices are the only normal visible output.
- If `show progress` is unsupported, fix the steering alias in `comath-harness.ts`.
- If parser helpers are brittle, fix `comath-backend-output.ts` with simple line-based parsing.

## Task 3: Run Original Targeted Plan Tests

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

Expected: pass.

If failures occur, fix only concrete regressions. Do not weaken product-copy assertions unless they are clearly stale and the new copy still meets the UX requirement.

## Task 4: Run Co-Math Regression Tests

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run \
  test/co-math-natural-language.test.ts \
  test/co-math-extension.test.ts \
  test/co-math-role-runner.test.ts \
  test/co-math-state.test.ts
```

Expected: pass.

Important distinction:

- Product mode should hide backend phrases.
- Direct extension/debug tests may still assert backend terms like goals, workstreams, role runs, artifacts, and `/comath` help.

Do not remove backend/debug output globally just to satisfy product-mode tests.

## Task 5: Run Repository Checks

Run:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
```

Expected: no errors, warnings, or infos.

Then run:

```bash
cd /home/hermes/developer/pi-mono-comath
git diff --check
```

Expected: no output and exit code 0.

Do not run `npm run build` or the full `npm test` unless the user asks.

## Task 6: Safe Manual Smoke Setup

Use a unique tmux session name and fresh temp directory.

Run:

```bash
cd /home/hermes/developer/pi-mono-comath
export SMOKE_ID="comath-pi-native-$(date +%s)-$$"
export SMOKE_DIR=$(mktemp -d /tmp/comath-pi-native.XXXXXX)
printf 'session=%s\ndir=%s\n' "$SMOKE_ID" "$SMOKE_DIR"
tmux new-session -d -s "$SMOKE_ID" -x 120 -y 40 "cd '$SMOKE_DIR' && /home/hermes/developer/pi-mono-comath/pi-test.sh comath /home/hermes/developer/pi-mono-comath/docs/2605.06651v2.pdf --approve"
sleep 4
tmux capture-pane -t "$SMOKE_ID" -p -S -220
```

Do not run `tmux kill-server`.

Do not run `tmux kill-session` except:

```bash
tmux kill-session -t "$SMOKE_ID"
```

and only at cleanup time.

## Task 7: Manual Smoke — Startup and Help

Send help:

```bash
tmux send-keys -t "$SMOKE_ID" "help" Enter
sleep 2
tmux capture-pane -t "$SMOKE_ID" -p -S -260
```

Expected:

- contains `Pi is ready` or equivalent Pi-native wording;
- contains `Source: 2605.06651v2.pdf`;
- asks the user to describe the problem/claim;
- does not advertise `/comath`;
- does not say `Co-math research mode`.

Verify help did not create state:

```bash
python3 -c 'from pathlib import Path; import os, sys; p=Path(os.environ["SMOKE_DIR"])/".pi/co-math/state.json"; print("state exists after help:", p.exists()); sys.exit(1 if p.exists() else 0)'
```

If env vars are lost because commands run in separate shells, re-export from printed values:

```bash
export SMOKE_ID='<printed session value>'
export SMOKE_DIR='<printed dir value>'
```

## Task 8: Manual Smoke — Initial Problem Setup

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

## Task 9: Manual Smoke — Natural Steering

Run:

```bash
tmux send-keys -t "$SMOKE_ID" "show progress" Enter
sleep 2
tmux capture-pane -t "$SMOKE_ID" -p -S -240
```

Expected product-level status such as:

```text
Current progress
```

Then:

```bash
tmux send-keys -t "$SMOKE_ID" "focus on the support indexing gap" Enter
sleep 2
tmux capture-pane -t "$SMOKE_ID" -p -S -240
```

Expected product copy such as:

```text
Focus noted: support indexing gap.
```

Then give the background run time to finish or block:

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

## Task 10: Manual Smoke — Inspect State Invariants

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

A blocked report is acceptable for `Validate Question 3.` because the source PDF may not contain a literal `Question 3` statement. The important behavior is preserving uncertainty instead of inventing the missing statement.

## Task 11: Leave Smoke Session Available for Inspection

Preferred: do not kill the smoke-test session. Report the exact session name and leave it available so the user can inspect it manually:

```bash
tmux capture-pane -t "$SMOKE_ID" -p -S -320
```

Only if cleanup is explicitly needed after capturing output, run exactly:

```bash
tmux kill-session -t "$SMOKE_ID"
```

If it says the session does not exist, do not run broader kill commands. Just note it in the final report.

Leave the `/tmp/comath-pi-native.*` directory in place if it contains useful evidence. Report its path.

## Task 12: Final Diff and Report

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

## Suggested Codex Prompt

Recommended interactive flow from repo root:

```bash
cd /home/hermes/developer/pi-mono-comath
codex
```

Then paste this prompt into the interactive Codex session:

```text
Continue from docs/claude-comath-pi-native-experience-plan.md using docs/codex-comath-pi-native-testing-continuation-plan.md. The implementation already has uncommitted changes, but the previous validation phase was interrupted because Claude Code repeatedly killed/exited tmux sessions. Do not restart the implementation. Important: you are in an interactive Codex session; do not exit yourself, do not type exit/logout, and do not terminate the parent terminal or tmux session. Inspect the current diff, run the targeted tests, fix only concrete test/check failures, run npm run check and git diff --check, then perform the manual tmux smoke using a unique session name. Never run tmux kill-server or broad tmux cleanup commands. Prefer leaving the smoke-test tmux session alive and reporting its name; if you do clean it up, only kill that exact smoke-test session after capturing output. Do not commit or push. Report validation results, smoke output, state invariants, remaining UX caveats, and whether forbidden backend phrases still appear in normal product mode.
```

If you deliberately want a one-shot non-interactive run, you may use `codex exec`, but it will exit by design after the prompt completes or fails. That exit is not a tmux failure:

```bash
cd /home/hermes/developer/pi-mono-comath
codex exec --full-auto 'Continue from docs/claude-comath-pi-native-experience-plan.md using docs/codex-comath-pi-native-testing-continuation-plan.md. The implementation already has uncommitted changes, but the previous validation phase was interrupted because Claude Code repeatedly killed/exited tmux sessions. Do not restart the implementation. Inspect the current diff, run the targeted tests, fix only concrete test/check failures, run npm run check and git diff --check, then perform the manual tmux smoke using a unique session name. Never run tmux kill-server or broad tmux cleanup commands. Prefer leaving the smoke-test tmux session alive and reporting its name; if you do clean it up, only kill that exact smoke-test session after capturing output. Do not commit or push. Report validation results, smoke output, state invariants, remaining UX caveats, and whether forbidden backend phrases still appear in normal product mode.'
```
