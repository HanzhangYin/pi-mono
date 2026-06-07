# Co-Math Real Validation Plan

Goal: use the current co-math scaffold on one small genuine permutation-pattern task, then decide what narrow implementation work is actually needed.

This is not an implementation phase. Do not add new scaffold features during the validation run unless the workflow is blocked.

## Task

Validate the assistant on a finite, real combinatorial experiment:

> Compare small-n avoidance counts for two or more concrete permutation patterns, record the computation as provenance, state only finite claims, and produce a cautious working-paper export.

Preferred starting target:

```text
For n <= 6, compare |Av_n(123)|, |Av_n(132)|, and optionally one length-4 pattern class relevant to current RLM/BWX experiments.
```

Keep the mathematical claim finite unless a genuine proof is supplied.

## Workspace

Use a temporary or disposable validation workspace, not the main repo state:

```bash
mkdir -p /tmp/pi-comath-real-validation
cd /tmp/pi-comath-real-validation
```

Create:

```text
scripts/count_patterns.py
outputs/counts.tsv
notes/validation-log.md
exports/working-paper.md
```

## Run the co-math workflow

Exercise the existing command surface:

```text
/comath init Compare small permutation-pattern avoidance counts for selected patterns.
/comath goal Produce checked finite data, cautious claims, and a working-paper summary.
/comath workstream finite-counts: Enumerate selected avoidance classes for n <= 6.
```

Then write/run the counting script outside co-math, and register outputs:

```text
/comath artifact-file script scripts/count_patterns.py Count script: Brute-force avoidance counter for selected patterns.
/comath artifact-file dataset outputs/counts.tsv Count table: Finite avoidance counts produced by the script.
/comath note finite-counts: Computation was run locally; inspect script and output before treating as evidence.
```

Use role runs to create/review claims:

```text
/comath run workstream finite-counts
/comath runs
/comath review-queue
/comath evidence claim-1 computation: outputs/counts.tsv records the finite counts produced by scripts/count_patterns.py.
/comath warning claim-1 medium: This is finite computational evidence only; it does not prove an all-n identity.
/comath synthesize
/comath audit
```

If the proposed claim overstates the computation, revise it:

```text
/comath revise-claim claim-1: For n <= 6, the script outputs the recorded finite avoidance counts for the selected patterns; no all-n equality is claimed. --reason Keep validation finite and non-overclaiming.
/comath claim-history claim-1
```

Only if the finite claim is exactly supported by the script/output:

```text
/comath resolve-warning warning-1
/comath evidence claim-1 proof: The finite claim follows by direct exhaustive enumeration in scripts/count_patterns.py and the saved output outputs/counts.tsv.
/comath run reviewer claim-1
/comath reviews claim-1
/comath audit
```

Create the paper layer:

```text
/comath paper-section Finite computation setup: We brute-force selected avoidance classes up to n <= 6 and record the resulting table. --sources claim-1,evidence-1,artifact-1,artifact-2
/comath margin-note paper-section-1 provenance: This section depends on scripts/count_patterns.py and outputs/counts.tsv.
/comath paper
/comath export-paper exports/working-paper.md
/comath audit
```

## What to record

In `notes/validation-log.md`, record:

```text
- exact patterns tested
- exact command used to run the counting script
- output table
- all /comath commands used
- whether role-run-only claim creation felt natural
- whether evidence/warning/review steps felt natural
- whether exported paper was useful
- any command whose syntax or output was confusing
- any place where provenance was missing or too verbose
```

## Pass criteria

Validation passes if:

```text
- final /comath audit is clean
- generated counts are reproducible from the saved script
- every mathematical claim is finite or explicitly proved
- warnings prevent overclaiming until resolved
- reviewer promotion respects proof/evidence constraints
- paper export includes sources and open margin notes
- artifacts point to real workspace files
```

## Decision after validation

Do not implement broad architecture. Choose exactly one next action:

```text
A. If command friction dominates: plan a narrow UX cleanup.
B. If computation provenance dominates: plan a local computation-artifact integration.
C. If the workflow is already usable: stop and try a harder real math case.
```

Likely next implementation only if needed:

```text
/comath computation <command> --out <path>
```

But add it only if this validation shows manual script execution and artifact registration are too awkward.
