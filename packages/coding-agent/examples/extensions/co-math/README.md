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
- `comath_state` for model-visible state reads and initialization.

## Sample commands

```text
/comath init Study endpoint behavior for a permutation class
/comath goal Prove or refute the first nontrivial endpoint monotonicity case
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
/comath revise-claim claim-1: Endpoint monotonicity holds under the predecessor-canonical convention. --reason Human clarified endpoint convention
/comath claim-history claim-1
/comath synthesize
/comath timeline
/comath runs
/comath run-status role-run-1
/comath queue workstream workstream-small-examples
/comath dispatch-next
/comath dispatch-next --background
/comath dispatch-run role-run-2
/comath dispatch-run role-run-2 --background
/comath background-runs
/comath abort-run role-run-2: User changed direction
/comath cancel-run role-run-3: Human chose a narrower decomposition
/comath recover-run role-run-1 failed: Terminal session crashed before completion
/comath status
```

The current prototype implements initialization, status, goal creation, workstream creation, manual evidence and warning attachment, warning resolution, human intervention controls, stale running run recovery, an artifact registry, an event log, workstream lifecycle status, durable role run records, queued and cancelled run provenance, invariant audits, bounded coordinator runs that save advisory reports, targeted workstream runs that can ingest structured proposed claims, evidence, warnings, and artifacts, review queues, review rounds, claim revision history, targeted reviewer runs, and cautious synthesis markdown. Workstream-ingested claims are review-gated as `needs_review`; reviewer decisions can attach proof evidence, resolve warnings, record a review round, and promote a claim only when proof evidence is present and no attached warning remains open. Synthesis includes only proof-backed, warning-free, reviewed proved claims as findings and always preserves an open-warning section. Role runs do not promote anything to `proved` without proof evidence and resolved warnings.

## Structured role output

Real role prompts ask for structured JSON as the final assistant message. Valid workstream JSON can create `needs_review` claims with attached evidence and warnings, so claims remain review-gated until a reviewer supplies proof-backed approval. Valid JSON can also include `proposedArtifacts` for computations, proof sketches, references, datasets, scripts, figures, failed attempts, and human notes. Artifact paths are metadata only; the extension does not read or write those paths. Valid reviewer JSON can update review state, attach proof evidence, add warnings, resolve warning ids, and create a review round, subject to the proof-promotion invariant that proof promotion requires proof evidence and no open attached warning.

If a role returns malformed output, invalid enum values, or free-form prose, the extension saves it as a report only with a blocker explaining the structured-output failure. Malformed role output does not mutate claims, evidence, warnings, review decisions, or artifacts. This keeps provenance, review discipline, and uncertainty visibility explicit.

The event log is provenance for workspace activity, not a proof certificate. It records actions such as project initialization, role reports, claim proposals, evidence additions, warning changes, artifact recording, and synthesis generation so users can inspect recent history with `/comath timeline`.

Role run records are control-plane provenance, not mathematical proof certificates. A workstream lifecycle can be `active`, `running`, `blocked`, or `needs_review`; `blocked` means a useful mathematical or project obstruction was preserved, not an infrastructure failure. `/comath queue` records durable queued role runs without invoking a model, `/comath dispatch-next` and `/comath dispatch-run` explicitly start queued work, and `/comath cancel-run` marks queued work cancelled with a reason. `/comath dispatch-next --background` and `/comath dispatch-run <run-id> --background` start queued work asynchronously in the current process; `/comath background-runs` lists live in-process handles, and `/comath abort-run` requests interruption. Durable running records not listed as live may be stale running records; use `/comath recover-run` to close them. The current prototype has no daemon, external background worker, automatic retry loop, or hidden scheduler.

Human intervention events preserve steering decisions such as manual block/unblock actions, human notes, and stale running run recovery. A human note is metadata and not proof evidence; it cannot promote a claim or satisfy the proof-backed synthesis invariant.

Claim revisions are human steering records. `/comath revise-claim` changes the claim statement, preserves attached evidence and warnings, records the previous and revised statements with a reason, and returns the claim to review. `/comath claim-history` shows the current claim, open warning count, claim revision history, and review rounds.

## Role prompts

Role prompts live under `agents/`:

- `coordinator.md` breaks a root question into approved goals and workstreams.
- `workstream.md` attacks one narrow goal and reports claims, evidence, computations, failed attempts, and blockers.
- `reviewer.md` challenges claims and creates explicit warnings for proof gaps.
- `synthesizer.md` turns reviewed state into cautious draft prose while preserving open warnings.

## State location

For a session started in a research workspace, the default state file is:

```text
.pi/co-math/state.json
```

Run `/comath status` before relying on project state. If the file is missing, initialize it with `/comath init <root question>`.
