# Co-Math Research Exploration Smoke

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
[ ] Output says Research workstream started and Research workstream completed.
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
[ ] show progress works before completion and reports the current stage.
[ ] show latest report shows incremental details while running, or final details after completion.
[ ] The final report is saved and linked from the run.
[ ] The final report remains problem-specific and does not claim a proof of twin-prime infinitude.
[ ] continue path 99 warns and leaves report/run counts unchanged.
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
