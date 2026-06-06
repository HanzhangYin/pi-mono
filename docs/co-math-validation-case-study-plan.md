# Co-Math Prototype Validation Case Study Plan

> **For Hermes:** This is a validation plan, not another implementation phase. Do not add new co-math features unless the case study exposes a blocker. Use the existing `/comath` surface and preserve a clean git record.

**Goal:** Validate that the co-math scaffold works as a research workbench on one small but real mathematical workflow.

**Architecture:** Run a bounded end-to-end case study through the extension: initialize a project, create goals/workstreams, queue/dispatch roles, ingest claims/evidence/warnings, review and revise claims, maintain a living paper, export a markdown snapshot, and audit the resulting workspace. Record usability gaps separately from correctness bugs.

**Tech Stack:** Existing Pi co-math extension, `.pi/co-math/state.json`, slash commands, markdown export, optional local artifact files under a temporary validation workspace.

---

## 1. Stop condition for feature work

Before starting validation, commit the current verified implementation and path-safety fix as one feature checkpoint, or keep the diff intentionally uncommitted but do not mix validation fixes into it.

Recommended checkpoint:

```bash
cd /Users/hanzhangyin/Developer/pi-mono-comath

git add \
  packages/coding-agent/examples/extensions/co-math/README.md \
  packages/coding-agent/examples/extensions/co-math/commands.ts \
  packages/coding-agent/examples/extensions/co-math/schema.ts \
  packages/coding-agent/examples/extensions/co-math/state-tool.ts \
  packages/coding-agent/examples/extensions/co-math/storage.ts \
  packages/coding-agent/test/co-math-extension.test.ts \
  packages/coding-agent/test/co-math-state.test.ts

git commit -m "feat(coding-agent): add co-math paper export artifacts"
```

Then commit the path-safety plan and this validation plan separately if desired:

```bash
git add docs/co-math-export-path-safety-fix-plan.md docs/co-math-validation-case-study-plan.md
git commit -m "docs(coding-agent): plan co-math validation case study"
```

Do not begin new feature design until this validation run has produced a short findings report.

---

## 2. Validation question

Use a small question where correctness can be manually checked.

Default case study:

```text
Explore a tiny permutation-pattern claim: for permutations of length n <= 5, compare avoidance counts for two length-3 patterns and document any observed equality/inequality as computational evidence only.
```

This is intentionally modest. The goal is to validate the workbench flow, not solve a new theorem.

Acceptable substitute if the user wants a more relevant case:

```text
A small RLM/BWX/LTRmin sanity-check lemma with explicit n <= 5 computation and cautious prose.
```

---

## 3. Validation workspace

Run the case study outside the repo source tree if possible, e.g.:

```bash
mkdir -p /tmp/pi-comath-validation
cd /tmp/pi-comath-validation
```

If using the repo root as cwd, ensure generated `.pi/` artifacts are intentionally ignored and not mixed into source changes.

---

## 4. Manual validation script

Use the extension commands through the Pi interactive shell, not direct storage helpers. The exact command transport may be manual TUI entry or an existing command harness.

### 4.1 Initialize project

```text
/comath init Compare small permutation pattern avoidance counts for length-three patterns.
/comath goal Build a checked small-n computation artifact and a cautious working-paper summary.
/comath workstream counts: Enumerate S_n for n <= 5 and compare selected avoidance classes.
/comath status
/comath audit
```

Expected:

```text
- state is created at .pi/co-math/state.json
- one active goal
- one active workstream
- audit is clean
```

### 4.2 Register a computation artifact

Create a tiny local script in the validation workspace, for example:

```bash
mkdir -p scripts
cat > scripts/count_avoidance.py <<'PY'
from itertools import permutations

patterns = [(1,2,3), (1,3,2)]

def standardize(seq):
    order = {v: i + 1 for i, v in enumerate(sorted(seq))}
    return tuple(order[v] for v in seq)

def avoids(perm, pattern):
    k = len(pattern)
    n = len(perm)
    for i in range(n):
        for j in range(i + 1, n):
            for l in range(j + 1, n):
                if standardize((perm[i], perm[j], perm[l])) == pattern:
                    return False
    return True

for n in range(1, 6):
    row = []
    for pattern in patterns:
        row.append(sum(1 for p in permutations(range(1, n + 1)) if avoids(p, pattern)))
    print(n, *row)
PY
python3 scripts/count_avoidance.py > counts.txt
```

Then register files as metadata-only artifacts:

```text
/comath artifact-file script scripts/count_avoidance.py Avoidance counter: Brute force n <= 5 checker for selected length-three patterns.
/comath artifact-file dataset counts.txt Avoidance counts: Output table from the n <= 5 brute force checker.
/comath artifacts
/comath audit
```

Expected:

```text
- artifacts record paths
- file contents are not copied into evidence
- audit is clean
```

### 4.3 Create a claim through the role-run path, then attach manual support

There is intentionally no `/comath claim` command in the current surface. Claims enter the workspace through role-output ingestion. This is part of what validation should assess.

Use the workstream role to propose a finite, non-overclaiming claim:

```text
/comath run workstream workstream-counts
/comath runs
/comath status
/comath review-queue
/comath audit
```

Expected:

```text
- a role run record is created
- if the role proposes a claim, it should appear as claim-1 or the next available claim id
- if no claim is proposed, record this as a validation finding: the scaffold may need a manual claim-entry command or a clearer workstream prompt before real use
```

Assuming a claim was created, attach deterministic support and an uncertainty warning:

```text
/comath evidence claim-1 computation: scripts/count_avoidance.py and counts.txt report equal counts for n = 1,2,3,4,5.
/comath warning claim-1 medium: This is finite computational evidence only and does not prove equality for all n.
/comath review-queue
/comath synthesize
/comath audit
```

Expected:

```text
- claim remains not synthesis-eligible while warning is open
- synthesis/paper rendering must not present it as proved
- warning remains visible
```

### 4.4 Exercise review/revision controls

```text
/comath reviews claim-1
/comath revise-claim claim-1: For n <= 5, the brute-force script records equal counts for Av(123) and Av(132); this is finite computational evidence, not a proof. --reason Keep the statement finite and avoid overclaiming.
/comath claim-history claim-1
/comath resolve-warning warning-1
/comath evidence claim-1 proof: The finite claim follows by direct exhaustive enumeration from scripts/count_avoidance.py for n <= 5.
/comath run reviewer claim-1
/comath reviews claim-1
/comath synthesize
/comath audit
```

Expected:

```text
- claim revision preserves old statement
- warning resolution records provenance
- reviewer run is the path that can promote a claim to proved
- proof promotion succeeds only if proof evidence exists and warnings are resolved
- claim history is oldest-first
```

If the reviewer does not promote the finite claim despite proof evidence and resolved warnings, record it as a validation finding rather than forcing state by hand.

### 4.5 Exercise queued/background control plane

```text
/comath queue reviewer claim-1
/comath runs
/comath cancel-run <queued-role-run-id>: Manual validation of queue cancellation.
/comath queue synthesizer
/comath dispatch-next --background
/comath background-runs
/comath runs
/comath audit
```

Expected:

```text
- queued run is durable
- cancelled run creates no fake report/evidence/claims
- background run uses existing role-run control plane
- stale/background behavior is understandable
```

If real model invocation is undesirable during validation, stop after queue/cancel and record that background dispatch needs a separate provider-backed smoke test.

### 4.6 Living paper and export

```text
/comath paper-section Computation setup: We brute-force permutations of length n <= 5 and compare avoidance counts for 123 and 132. --sources claim-1,evidence-1,artifact-1,artifact-2
/comath margin-note paper-section-1 provenance: This section depends on scripts/count_avoidance.py and counts.txt.
/comath paper
/comath export-paper exports/validation-working-paper.md
/comath artifacts
/comath audit
```

Expected:

```text
- paper includes draft section
- paper includes margin note and provenance
- open warnings, if any, remain visible
- export creates a markdown snapshot artifact
- artifact path is inside workspace
- audit remains clean
```

### 4.7 Path-safety smoke checks

```bash
mkdir -p /tmp/pi-comath-outside
ln -s /tmp/pi-comath-outside exports-link
```

Then:

```text
/comath export-paper exports-link/escape.md --force
/comath artifact-file script exports-link/escape.md Escape: Should be rejected.
/comath audit
```

Expected:

```text
- no file appears at /tmp/pi-comath-outside/escape.md
- no artifact/event is recorded for rejected unsafe paths
- audit reports any unsafe symlink artifact paths if manually inserted
```

---

## 5. Validation report template

After the run, create a concise report in the chat or a docs file:

```text
Co-Math validation result: PASS / PASS WITH ISSUES / FAIL

Workspace:
- path:
- state file:
- exported paper:

Commands exercised:
- init/goals/workstreams/status/audit
- artifact-file/artifacts
- claims/evidence/warnings/review/revision/history
- queue/cancel/background if used
- paper-section/margin-note/paper/export-paper
- path-safety smoke checks

Correctness findings:
- [list]

Usability findings:
- [list]

Architecture findings:
- [list]

Recommended next action:
- fix blocker / improve UX / stop implementation / add real math-tool integration
```

---

## 6. Pass criteria

Validation passes if:

```text
- a clean state file is produced and audit passes at the end;
- unsafe path checks reject symlink escapes;
- claims cannot be presented as proved without proof evidence and resolved warnings;
- living paper/export preserves provenance and uncertainty;
- artifact-file remains metadata-only;
- role-run/queue/background state remains understandable and recoverable;
- the final markdown export is readable enough to inspect manually.
```

Validation fails if:

```text
- state is corrupted;
- rejected operations mutate state;
- unsafe exports write outside the workspace;
- unproved or warning-attached claims appear as accepted findings;
- audit misses dangling/broken references created through normal commands;
- the command flow is too awkward to use for a small real case study.
```

---

## 7. After validation

If validation passes:

```text
Stop scaffold implementation. Next work should be either:
- one targeted UX cleanup list from validation findings, or
- first real mathematical tool integration.
```

If validation fails:

```text
Write a narrow fix plan for the specific failed invariant. Do not add broad new architecture.
```
