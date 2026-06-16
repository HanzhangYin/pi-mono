# Co-Math Research Exploration Smoke

## Beginner Path 1 smoke

The simplest end-to-end check. From a fresh folder (no cleanup commands needed):

```bash
cd /tmp
mkdir comath-beginner-path1-demo
cd comath-beginner-path1-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

This beginner smoke uses only Path 1. Path 5 (literature) and the coordinator summary are exercised
in the advanced/developer sections below.

Then enter, one message at a time. Just ask the math question — no special prefix needed:

```text
Are there infinitely many primes of the form n^2 + 1?
```

Pi recognizes this as a math research question and prepares the workspace. The explicit form
`Explore this problem: ...` is still supported but no longer required for obvious math questions.

```text
please continue path 1
```

```text
show progress
```

```text
show research state
```

```text
show report
```

```text
show latest report
```

Command notes:

```text
- show latest report  -> the detailed report (attempt, critique, script path, results).
- show report         -> alias for show latest report.
- show progress       -> status of the active/last run while it is working.
- show research state -> the path overview with an executable suggested command.
- Polite phrasings work too, e.g. "please show the latest report".
```

Pass checklist:

```text
[ ] The bare math question (no "Explore this problem:" prefix) starts research exploration.
[ ] Pi explains it is exploring the question as a co-math problem.
[ ] The first response is "Research workspace prepared" and lists the paths.
[ ] It ends with an executable next command: continue path 1.
[ ] "please continue path 1" starts Path 1 (it does not just print "Current research state").
[ ] A Pi-native status indicator (for example `co-math: Path 1 running · ...`) shows while Path 1 runs and clears when it finishes.
[ ] The editor stays usable while Path 1 runs; "show progress" works if typed.
[ ] Completion is concise, says the finite search is evidence and not a proof, and ends with a concrete next command.
[ ] Completion does not lead with raw artifact IDs; the script/output is reachable via "show latest report".
[ ] "show research state" includes an executable suggested command (continue path N), not a sentence Pi cannot run.
[ ] "show report" and "show latest report" both show the latest detailed report.
[ ] The detailed report still includes computation artifact paths.
[ ] No orphan math bullets such as `- \[` or `- \]`.
```

## Fresh workspace non-math guard

A fresh `pi comath` workspace is for math validation/exploration: operational/dev prose must not
create a project. From a fresh folder:

```bash
cd /tmp
mkdir comath-nonmath-guard-test-1
cd comath-nonmath-guard-test-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
run tests
```

Pi should respond with guidance ("Pi co-math is for mathematical validation and exploration. …") and
not create any state. Exit Pi, then:

```bash
python3 -c 'from pathlib import Path; print("state exists:", Path(".pi/co-math/state.json").exists())'
```

Expected:

```text
state exists: False
```

Repeat (each in its own fresh folder) for `show me the files` and `what branch am I on?` — same result.
In contrast, a validation prompt such as `Validate the claim: every even integer greater than 2 is a
sum of two primes.` does create a validation workspace.

The sections below are advanced/developer smokes (Path 5 literature, coordinator summary).

Run from a clean folder:

```bash
rm -rf /tmp/comath-research-demo
mkdir -p /tmp/comath-research-demo
cd /tmp/comath-research-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Then enter:

```text
Explore this problem:
Are there infinitely many primes of the form n^2 + 1?
```

Then:

```text
summarize current state
```

```text
focus on counterexamples
```

```text
drop the direct proof path
```

```text
try a weaker theorem
```

```text
continue
```

Success criteria:

```text
[ ] Pi creates multiple research paths.
[ ] User input is visible in the main Pi interface.
[ ] Product copy says path/research, not role-run/workstream/queue.
[ ] User can focus on counterexamples.
[ ] User can abandon a path.
[ ] User can ask for a summary.
[ ] Existing validation flow still works in a separate clean folder.
```

## Research path execution smoke

From the same clean folder, enter:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
```

Then:

```text
continue path 1
```

```text
summarize current state
```

```text
continue path 2
```

```text
continue path 99
```

Good signs:

```text
[ ] Path 1 reports concrete n^2 + 1 examples.
[ ] The footer/status area shows a persistent indicator such as `co-math: Path 1 running · coordinator`.
[ ] Output says Research workstream running in the background before the final result appears.
[ ] While Path 1 is active, the copy says Pi is still working and suggests show progress.
[ ] The footer/status indicator advances as the current stage changes.
[ ] The final output says Research run completed.
[ ] The footer/status indicator clears after completion.
[ ] Completion includes Promising strategy, Review, Gap, Next, and Working paper updated.
[ ] Summary includes compact latest findings and mentions report availability.
[ ] Path 2 reports direct-proof attempt content, not path 1 examples.
[ ] Path 99 warns and does not update another path or create a report.
[ ] Product copy avoids role-run/workstream-*/queue/schema/artifact.
```

## Research workstream smoke

From a clean folder:

```bash
rm -rf /tmp/comath-workstream-demo
mkdir -p /tmp/comath-workstream-demo
cd /tmp/comath-workstream-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Then enter, one message at a time:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
```

```text
continue path 2
```

```text
show latest report
```

```text
summarize current state
```

```text
continue path 99
```

Good signs:

```text
[ ] continue path 2 shows a research workstream started, progress, and completed.
[ ] Completion includes promising strategy, review, gap, next move, and a working-paper update.
[ ] show latest report shows coordinator brief, specialist attempt, critic review, and synthesis.
[ ] Summary stays compact and says: Report: available; say "show details for path 2".
[ ] show details for path 2 prints the same structured report.
[ ] continue path 99 warns and does not create a report.
[ ] Output avoids raw IDs and backend terms (role-run/workstream-*/queue/schema/artifact).
```

Optional state check (research workstream reports are durable in `researchReports`):

```bash
python3 -c 'import json, pathlib; s=json.loads(pathlib.Path(".pi/co-math/state.json").read_text()); print("paths", len(s.get("researchPaths", []))); print("research reports", len(s.get("researchReports", []))); print("sections", len(s.get("workingPaperSections", []))); print("notes", len(s.get("marginNotes", [])))'
```

Expected:

```text
5 paths
at least 1 research report
at least 1 working-paper section
at least 1 margin note
```

## Path 3/4 bridge smoke

From a new folder (no destructive cleanup):

```bash
cd /tmp
mkdir comath-path3-path4-bridge-test-1
cd comath-path3-path4-bridge-test-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Then enter, one message at a time:

```text
Are there infinitely many primes of the form n^2 + 1?
```

```text
please continue path 1
```

Wait for Path 1 to finish, then:

```text
continue path 3
```

```text
continue path 4
```

```text
show research state
```

```text
show report
```

Good signs:

```text
[ ] Path 3 explains prime-values-of-polynomial framing.
[ ] Path 3 explains even-index / 4m^2 + 1 reduction.
[ ] Path 3 says conjectural frames are not proofs.
[ ] Path 3 suggests `continue path 4`.
[ ] Path 4 lists candidate lemmas or weaker targets.
[ ] Path 4 marks parity obstruction as proved.
[ ] Path 4 marks finite evidence as computational-only.
[ ] Path 4 suggests `continue path 2`.
[ ] show research state includes an executable suggested command.
[ ] show report shows the latest detailed report with the same next move.
```

## Path 5 source-backed literature smoke

From a new folder (no destructive cleanup):

```bash
cd /tmp
mkdir comath-path5-nosource-test-1
cd comath-path5-nosource-test-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Then enter, one message at a time:

```text
Are there infinitely many primes of the form n^2 + 1?
```

```text
continue path 5
```

```text
show report
```

Good signs:

```text
[ ] Path 5 runs or blocks productively.
[ ] It says no source was available.
[ ] It does not claim the problem is proved.
[ ] It treats Bunyakovsky/Schinzel as search/conjectural targets only.
[ ] It suggests a concrete next command.
[ ] show report displays unsupported/source-needed status.
```

State probe:

```bash
python3 -c 'import json, pathlib; p=pathlib.Path(".pi/co-math/state.json"); print("state exists:", p.exists()); s=json.loads(p.read_text()); print("reports:", len(s.get("researchReports", []))); print("sources:", len(s.get("literatureSources", []))); print("claimSupports:", len(s.get("literatureClaimSupports", []))); print("latest sourceIds:", s.get("researchReports", [])[-1].get("sourceIds", [])); print("latest claimSupportIds:", s.get("researchReports", [])[-1].get("claimSupportIds", []))'
```

Expected for no-source:

```text
sources: 0
claimSupports: at least 1
latest claimSupportIds: non-empty
```

## Async research workstream smoke

From a new folder (no destructive cleanup):

```bash
cd /tmp
mkdir comath-async-workstream-demo
cd comath-async-workstream-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Then enter, one message at a time:

```text
Explore this problem: Are there infinitely many twin primes?
```

```text
continue path 2
```

```text
show progress
```

```text
show latest report
```

```text
summarize current state
```

```text
continue path 99
```

Good signs:

```text
[ ] continue path 2 starts work and returns control quickly.
[ ] The footer/status area keeps showing that a co-math path is running after control returns.
[ ] The first response says Research workstream running in the background.
[ ] The first response says Pi is still working and that the user can keep typing.
[ ] Stage updates appear while the run is active, for example Research update / Current stage.
[ ] The footer/status indicator updates as stages advance, for example coordinator, specialist, critic, synthesis.
[ ] show progress works before completion and reports the current stage in beginner-friendly terms.
[ ] show progress says the report is not ready yet while work is still active.
[ ] show latest report shows incremental details while running, or final details after completion.
[ ] The final report is saved and linked from the run.
[ ] The final report remains problem-specific and does not claim a proof of twin-prime infinitude.
[ ] continue path 99 warns and leaves report/run counts unchanged.
```

## Beginner async loading smoke

From a new folder (no destructive cleanup):

```bash
cd /tmp
mkdir comath-beginner-loading-demo
cd comath-beginner-loading-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Then enter:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
```

Then enter:

```text
continue path 1
```

Pass criteria:

```text
[ ] The user can immediately tell Path 1 is still running.
[ ] The footer/status area shows `co-math: Path 1 running · ...` while the editor remains usable.
[ ] The interface does not look like Pi is silently waiting for the next instruction.
[ ] The visible copy says Pi is still working in the background.
[ ] The visible copy tells the user they can keep typing and can say show progress.
[ ] The footer/status indicator advances as Path 1 moves through planning, computation, review, and synthesis.
[ ] The footer/status indicator clears after Path 1 completes or fails.
[ ] show progress gives meaningful current-stage information such as Running finite computation or Reviewing gaps and limits.
[ ] The final result still appears when complete.
```

Optional state check:

```bash
python3 -c 'import json, pathlib; p=pathlib.Path(".pi/co-math/state.json"); print("exists", p.exists());
if p.exists():
 s=json.loads(p.read_text()); print("paths", len(s.get("researchPaths", []))); print("runs", len(s.get("researchWorkstreamRuns", []))); print("researchReports", len(s.get("researchReports", []))); print("sections", len(s.get("workingPaperSections", [])));
 [print("run", r.get("id"), r.get("pathTitle"), r.get("status"), r.get("currentStage"), "incremental", len(r.get("incrementalReports", [])), "final", r.get("finalReportId")) for r in s.get("researchWorkstreamRuns", [])]
'
```

## Source-backed literature workstream smoke

From a new folder (no destructive cleanup):

```bash
cd /tmp
mkdir comath-literature-workstream-demo
cd comath-literature-workstream-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Then enter, one message at a time:

```text
Explore this problem: Are there infinitely many twin primes?
```

```text
continue path 5
```

```text
show progress
```

```text
show latest report
```

```text
summarize current state
```

Good signs:

```text
[ ] Path 5 starts a literature/reference workstream.
[ ] Progress mentions literature/source review.
[ ] If source lookup is configured, the report distinguishes the twin-prime conjecture from weaker bounded-gap or Chen-type results.
[ ] If source lookup is configured, sources/references are structured in state.
[ ] If source lookup is not configured, the report asks for sources and marks claims unsupported instead of inventing citations.
```

Optional state check:

```bash
python3 -c 'import json, pathlib; p=pathlib.Path(".pi/co-math/state.json"); print("exists", p.exists());
if p.exists():
 s=json.loads(p.read_text()); print("sources", len(s.get("literatureSources", []))); print("claimSupports", len(s.get("literatureClaimSupports", []))); print("runs", len(s.get("researchWorkstreamRuns", []))); print("reports", len(s.get("researchReports", [])));
 [print("source", src.get("id"), src.get("title"), src.get("url") or src.get("path") or src.get("kind")) for src in s.get("literatureSources", [])]
'
```

## Computational exploration workstream smoke

From a new folder (no destructive cleanup):

```bash
cd /tmp
mkdir comath-computation-workstream-demo-1
cd comath-computation-workstream-demo-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Then enter, one message at a time:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
```

```text
continue path 1
```

```text
show progress
```

```text
show latest report
```

```text
summarize current state
```

Good signs:

```text
[ ] Path 1 starts a computational/examples workstream.
[ ] Progress mentions computation or a finite check.
[ ] Script/result attachments are saved under .pi/co-math/artifacts/.
[ ] The report includes a checked range and exit code.
[ ] The critic says finite search does not prove infinitude.
[ ] The working paper is updated with observations, not a proof claim.
```

Optional state check:

```bash
python3 -c 'import json, pathlib; p=pathlib.Path(".pi/co-math/state.json"); print("exists", p.exists());
if p.exists():
 s=json.loads(p.read_text()); print("computationalArtifacts", len(s.get("computationalArtifacts", []))); print("runs", len(s.get("researchWorkstreamRuns", []))); print("reports", len(s.get("researchReports", [])));
 [print("artifact", a.get("id"), a.get("kind"), a.get("status"), a.get("filePath"), a.get("exitCode")) for a in s.get("computationalArtifacts", [])]
 [print("report", r.get("id"), r.get("status"), r.get("computationalArtifactIds")) for r in s.get("researchReports", [])]
'
```

## Cross-workstream coordinator smoke

From a new folder (no destructive cleanup):

```bash
cd /tmp
mkdir comath-coordinator-demo-1
cd comath-coordinator-demo-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Then enter, one message at a time:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
```

```text
continue path 1
```

```text
show latest report
```

```text
continue path 5
```

```text
show latest report
```

```text
what should we try next?
```

```text
show latest coordinator report
```

```text
summarize current state
```

Good signs:

```text
[ ] The project coordinator summary references both computation and literature reports.
[ ] Finite computation is not treated as proof.
[ ] Blocked literature/source state is recognized.
[ ] The summary recommends a concrete next path or source-help action.
[ ] show latest coordinator report displays the saved summary without creating another one.
[ ] summarize current state stays the compact path summary.
```

Optional state check:

```bash
python3 -c 'import json, pathlib; p=pathlib.Path(".pi/co-math/state.json"); print("exists", p.exists());
if p.exists():
 s=json.loads(p.read_text()); print("coordinatorReports", len(s.get("researchCoordinatorReports", []))); print("researchReports", len(s.get("researchReports", []))); print("computationalArtifacts", len(s.get("computationalArtifacts", []))); print("literatureClaimSupports", len(s.get("literatureClaimSupports", [])));
 [print("coordinator", r.get("id"), "inputs", r.get("inputReportIds"), "suggested", r.get("suggestedPathId"), r.get("suggestedPrompt")) for r in s.get("researchCoordinatorReports", [])]
'
```

## LLM-backed generic problem smoke

`continue path N` runs a real specialist -> critic -> synthesizer model pass when a model/provider
is configured, and falls back to the deterministic workstream when it is not. Use a generic problem
(no programmed scaffolding) so the difference is visible.

From a new folder (no destructive cleanup):

```bash
cd /tmp
mkdir comath-llm-workstream-demo
cd comath-llm-workstream-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Then enter, one message at a time:

```text
Explore this problem: Are there infinitely many twin primes?
```

```text
continue path 2
```

```text
show latest report
```

```text
summarize current state
```

Good signs (real model path):

```text
[ ] continue path 2 does not return instantly (it runs specialist/critic/synthesizer model calls).
[ ] Output is problem-specific to twin primes (e.g. distance 2, bounded prime gaps, sieve methods).
[ ] It does not claim to prove the twin prime conjecture.
[ ] show latest report contains specialist, critic, and synthesis sections from the model.
[ ] Working paper and research state update.
```

Fallback path (no model/provider configured, offline, or model call fails):

```text
[ ] Output says: "I used the local fallback for this round because model-backed research was unavailable."
[ ] The deterministic workstream still completes and persists a report.
[ ] No stack traces or provider internals appear in normal output.
```
