# Co-Math Extension Prototype

A minimal research-workspace assistant prototype for keeping a mathematical project state explicit. The extension stores goals, workstreams, claims, evidence, warnings, reports, review queues, artifacts, events, and role run records in `.pi/co-math/state.json` under the current working directory.

This example is scaffolding only. It does not establish any mathematical claim, prove a theorem, or replace human review. Treat all sample text as placeholder workflow content.

## Manual usage

From the coding-agent package:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent
pi -e examples/extensions/co-math/index.ts
```

The extension registers:

- `/comath` for user-facing workspace commands.
- `/co` for common natural-language co-math operations.
- `comath_state` for model-visible state reads and initialization.

## Natural-language interaction

Use `/co` for common co-math operations without remembering every `/comath` subcommand.

Examples:

```text
/co start a project for the reference paper
/co set goal validate Question 3 with source-backed definitions
/co create a workstream to audit the stationarity proof support gap
/co run latest workstream
/co show latest report
/co request revision for latest report: missing source-backed support lemma
/co export working paper
/co what next
```

`/comath` remains available as the advanced/debug interface.

### Natural interaction smoke test

In a scratch workspace, run the extension and use `/co` for the main workflow:

```text
/co start a project for 2605.06651v2 Question 3 validation
/co set goal validate Question 3 using source-backed definitions and preserve proof gaps
/co create a workstream to audit whether the stationarity proof has a support indexing gap
/co run latest workstream
/co show latest report
/co request revision for latest report: keep the support/indexing gap open until a source-backed vanishing lemma is found
/co what next
```

The natural interface prints the equivalent `/comath` command before execution so the advanced command surface remains inspectable.

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

### Reference paper workflow smoke test

Use this to validate the local co-math research loop against `docs/2605.06651v2.pdf`. This is workflow validation, not a proof of the paper.

1. Initialize the project:
   `/comath init Map and validate the main mathematical structure of docs/2605.06651v2.pdf`
2. Propose goals:
   `/comath propose-goal Extract the paper's main definitions, theorem statements, and dependency graph.`
   `/comath propose-goal Identify which claims need proof review, computation, or external references.`
3. Approve goals:
   `/comath approve-goal goal-1`
   `/comath approve-goal goal-2`
4. Create workstreams:
   `/comath workstream definitions-map: Definitions and theorem dependency map`
   `/comath workstream validation-questions: Proof, computation, and reference validation questions`
5. Run bounded roles and review reports:
   `/comath run workstream workstream-definitions-map`
   `/comath reports`
   `/comath review-report report-1 revision-requested: Separate definitions from theorem claims more clearly.`
6. Export the working paper:
   `/comath export-paper .pi/co-math/working-paper.md --force`
7. Audit state:
   `/comath audit`

Expected behavior:

- Workstreams link only to approved goals.
- Reports require explicit review.
- Report acceptance does not prove claims.
- Working-paper export preserves blockers and uncertainty.

## Sample commands

```text
/comath init Study endpoint behavior for a permutation class
/comath propose-goal Enumerate exact small examples
/comath approve-goal goal-1
/comath goal Prove or refute the first nontrivial endpoint monotonicity case
/comath defer-goal goal-2: Keep this milestone finite
/comath goals
/comath workstream small-examples: enumerate exact small n examples and report obstructions
/comath run coordinator
/comath run workstream workstream-small-examples
/comath evidence claim-1 proof: Checked induction in draft_3.tex:142-167
/comath warning claim-1 high: Endpoint boundary case still needs a written lemma
/comath resolve-warning warning-1
/comath block workstream-small-examples: Need a convention choice before continuing
/comath unblock workstream-small-examples: Human chose the endpoint convention
/comath note workstream-small-examples: Try the endpoint convention from draft_3
/comath artifact failed_attempt Endpoint induction attempt: Breaks when the right arm is empty.
/comath artifacts
/comath audit
/comath review-queue
/comath run reviewer claim-1
/comath reviews
/comath review-report report-1 revision-requested: Add blocker context before synthesis
/comath reports
/comath report-status report-1
/comath revise-claim claim-1: Endpoint monotonicity holds under the predecessor-canonical convention. --reason Human clarified endpoint convention
/comath claim-history claim-1
/comath synthesize
/comath paper-section Endpoint lemma: Draft text preserving the unresolved boundary issue. --sources claim-1,evidence-1,warning-1
/comath margin-note paper-section-1 gap: Need a written lemma for the endpoint boundary case
/comath margin-notes
/comath resolve-margin-note margin-note-1: Boundary lemma added to the draft section
/comath paper
/comath export-paper
/comath artifact-file script scripts/check-endpoints.py Endpoint checker: Script used for endpoint enumeration
/comath computation --command "python3 scripts/count-patterns.py --out outputs/counts.tsv" --out outputs/counts.tsv --title "Finite count table" --summary "Generated by local endpoint enumeration"
/comath timeline
/comath runs
/comath run-status role-run-1
/comath workstream-status workstream-small-examples
/comath queue workstream workstream-small-examples
/comath dispatch-next
/comath dispatch-next --background
/comath dispatch-run role-run-2
/comath dispatch-run role-run-2 --background
/comath background-runs
/comath abort-run role-run-2: User changed direction
/comath cancel-run role-run-3: Human chose a narrower decomposition
/comath recover-run role-run-1 failed: Terminal session crashed before completion
/comath next
/comath status
```

The current prototype implements initialization, status, goal creation and explicit goal approval, workstream creation gated on approved or active goals, manual evidence and warning attachment, warning resolution, human intervention controls, stale running run recovery, an artifact registry, an event log, workstream lifecycle status, durable role run records, queued and cancelled run provenance, invariant audits, bounded coordinator runs that save advisory reports, targeted workstream runs that can ingest structured proposed claims, evidence, warnings, and artifacts, review queues, claim review rounds, report review rounds, claim revision history, targeted reviewer runs, cautious synthesis markdown, workstream status drill-downs, and a living working-paper layer. Workstream-ingested claims are review-gated as `needs_review`; reviewer decisions can attach proof evidence, resolve warnings, record a review round, and promote a claim only when proof evidence is present and no attached warning remains open. Report reviews do not promote claims. Synthesis includes only proof-backed, warning-free, reviewed proved claims as findings and always preserves an open-warning section. Role runs and paper commands do not promote anything to `proved` without proof evidence and resolved warnings.

## Structured role output

Real role prompts ask for structured JSON as the final assistant message. Valid workstream JSON can create `needs_review` claims with attached evidence and warnings, so claims remain review-gated until a reviewer supplies proof-backed approval. Valid JSON can also include `proposedArtifacts` for computations, proof sketches, references, datasets, scripts, figures, failed attempts, and human notes. Artifact paths are metadata only; the extension does not read or write those paths. Valid reviewer JSON can update review state, attach proof evidence, add warnings, resolve warning ids, and create a review round, subject to the proof-promotion invariant that proof promotion requires proof evidence and no open attached warning.

If a role returns malformed output, invalid enum values, or free-form prose, the extension saves it as a report only with a blocker explaining the structured-output failure. Malformed role output does not mutate claims, evidence, warnings, review decisions, or artifacts. This keeps provenance, review discipline, and uncertainty visibility explicit.

The event log is provenance for workspace activity, not a proof certificate. It records actions such as project initialization, role reports, claim proposals, evidence additions, warning changes, artifact recording, and synthesis generation so users can inspect recent history with `/comath timeline`.

Role run records are control-plane provenance, not mathematical proof certificates. A workstream lifecycle can be `active`, `running`, `blocked`, or `needs_review`; `blocked` means a useful mathematical or project obstruction was preserved, not an infrastructure failure. `/comath queue` records durable queued role runs without invoking a model, `/comath dispatch-next` and `/comath dispatch-run` explicitly start queued work, and `/comath cancel-run` marks queued work cancelled with a reason. `/comath dispatch-next --background` and `/comath dispatch-run <run-id> --background` start queued work asynchronously in the current process; `/comath background-runs` lists live in-process handles, and `/comath abort-run` requests interruption. Durable running records not listed as live may be stale running records; use `/comath recover-run` to close them. The current prototype has no daemon, external background worker, automatic retry loop, or hidden scheduler.

Human intervention events preserve steering decisions such as manual block/unblock actions, human notes, and stale running run recovery. A human note is metadata and not proof evidence; it cannot promote a claim or satisfy the proof-backed synthesis invariant.

Claim revisions are human steering records. `/comath revise-claim` changes the claim statement, preserves attached evidence and warnings, records the previous and revised statements with a reason, and returns the claim to review. `/comath claim-history` shows the current claim, open warning count, claim revision history, and review rounds.

Report review rounds are process review records. `/comath review-report` records whether a report was accepted, needs revision, or is blocked. It does not create mathematical warnings or change claim status.

Working-paper sections are draft workspace records, not proof certificates. `/comath paper-section` stores human-authored draft text with explicit source ids; `/comath paper` renders the living working paper in command output only and does not export Markdown, LaTeX, PDF, or artifact files. Rendering preserves open warnings, open margin notes, and non-synthesis-eligible source labels so polished prose cannot hide proof gaps.

Margin notes are paper annotations, not proof evidence and not mathematical warning records. `/comath margin-note` records open issues on sections or workspace subjects, and `/comath resolve-margin-note` closes those annotations with provenance without resolving mathematical warnings automatically.

Working paper exports are snapshots. `/comath export-paper` writes deterministic Markdown under the workspace, refuses overwrite unless `--force` is supplied, and records the snapshot as a `working_paper_export` artifact. Exports are snapshots of state, not live state, and this prototype performs no LaTeX or PDF generation.

File-backed artifacts are metadata and not proof evidence. `/comath artifact-file` registers an existing workspace file path without reading or trusting file contents; it does not create evidence, warnings, claims, or proof status changes.

Computation artifacts are provenance records, not proof certificates. `/comath computation --command <command> --out <path>` runs one foreground local command, requires the declared workspace output file to be freshly produced, hashes it with SHA-256, and records stdout/stderr previews in artifact provenance. It does not create claims, evidence, warnings, review rounds, or proof status changes.

## Role prompts

Role prompts live under `agents/`:

- `coordinator.md` distinguishes proposed goals from approved goals and workstreams.
- `workstream.md` attacks one narrow goal and reports claims, evidence, computations, failed attempts, and blockers.
- `reviewer.md` challenges claims, distinguishes claim review from report review, and creates explicit warnings for proof gaps.
- `synthesizer.md` turns reviewed state into cautious draft prose while preserving open warnings and report review status.

## State location

For a session started in a research workspace, the default state file is:

```text
.pi/co-math/state.json
```

Run `/comath status` before relying on project state. If the file is missing, initialize it with `/comath init <root question>`.
