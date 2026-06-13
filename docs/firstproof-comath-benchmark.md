# First Proof co-math benchmark

## Goal

Use `docs/2602.05192.pdf` (`First Proof`, arXiv:2602.05192) as a small behavioral benchmark for Pi co-math mode.

This is not a benchmark for fully solving all First Proof questions. It is a benchmark for whether co-math behaves like a useful mathematical validation assistant:

- sets up a source-backed validation workspace;
- waits for pasted context when asked;
- records pasted context before starting;
- extracts definitions, quantifiers, and constraints before proof attempts;
- preserves uncertainty;
- identifies known LLM failure modes described by the authors;
- keeps normal product UI free of debug/internal terminology.

## Source structure

The PDF has two useful benchmark layers:

- `A.1`–`A.10`: author comments on LLM attempts and common failure modes.
- `B.1`–`B.10`: question statements plus author-written solutions.

Use Appendix B as the source of question statements and reference solutions. Use Appendix A as a guide to expected failure detection.

Do not paste the full author solution into Pi during the first-pass benchmark unless the case explicitly says to validate a candidate solution. The intended first-pass setup is: give Pi the question/context, let it plan/audit, then compare its behavior against Appendix A/B.

## Benchmark tiers

### Tier 1: UX/control-flow

Purpose: verify the co-math product flow.

Expected behavior:

- A setup-only prompt creates the workspace and pins `docs/2602.05192.pdf`.
- Pi prepares the first audit but does not start it before context is pasted.
- Follow-up context is recorded as a steering/project note.
- `continue` starts the prepared background audit.
- Normal UI copy does not expose internal commands, workstream ids, role-run ids, artifacts, queue internals, or `/comath` vocabulary.

### Tier 2: Source understanding

Purpose: verify that Pi understands the mathematical task before trying to solve it.

Expected behavior:

- identifies the target question;
- extracts definitions and notation;
- extracts quantifiers and constraints;
- lists proof obligations;
- marks uncertainty and blockers precisely.

### Tier 3: Known failure-mode detection

Purpose: verify that Pi rejects known bad solution patterns from Appendix A.

Expected behavior:

- identifies the specific defect in a candidate solution;
- distinguishes a weaker/different problem from the original problem;
- does not claim a proof when only a sketch, citation, or heuristic exists;
- reports blockers in product-safe language.

## General run protocol

Run from a scratch directory so the repository is not polluted:

```bash
cd /home/hermes/developer/pi-mono-comath
export SMOKE_ID="firstproof-bench-$(date +%s)-$$"
export SMOKE_DIR="$(mktemp -d /tmp/firstproof-bench.XXXXXX)"
printf 'session=%s\ndir=%s\n' "$SMOKE_ID" "$SMOKE_DIR"
tmux new-session -d -s "$SMOKE_ID" -x 120 -y 40 "cd '$SMOKE_DIR' && /home/hermes/developer/pi-mono-comath/pi-test.sh comath /home/hermes/developer/pi-mono-comath/docs/2602.05192.pdf --approve"
tmux attach -t "$SMOKE_ID"
```

Cleanup:

```bash
tmux kill-session -t "$SMOKE_ID"
rm -rf "$SMOKE_DIR"
```

## Global product-copy failure terms

Normal co-math product UI should not expose these unless the user explicitly asks for debug details:

```text
Co-math research mode
co-math project
co-math goal
co-math workstream
Added co-math goal
Added co-math workstream
Initialized co-math project state
Queued co-math workstream
Started co-math role run
role-run
artifact-
workstream-
/comath
```

Exception: a transcript path may contain `role-run` if that is the current path format. Prefer improving that later, but do not fail the benchmark solely for a transcript path.

## Scoring rubric

Score each dimension as 0, 1, or 2.

### Setup behavior

- 0: fails setup, starts too early, or ignores the wait-for-context request.
- 1: setup works but product copy is confusing or context handling is unclear.
- 2: setup waits, records context, and `continue` starts correctly.

### Question extraction

- 0: misses the main question.
- 1: identifies broad topic but misses critical constraints.
- 2: extracts the exact target question and constraints.

### Definition and notation tracking

- 0: does not identify required definitions/notation.
- 1: identifies some definitions but misses dependencies.
- 2: identifies key notation, assumptions, and proof dependencies.

### Known failure detection

- 0: accepts the known bad solution pattern.
- 1: expresses vague uncertainty but does not locate the failure.
- 2: identifies the specific failure described in Appendix A.

### Uncertainty discipline

- 0: invents proof progress or claims success without support.
- 1: hedges vaguely.
- 2: states precise blockers and next checks.

### Product UX

- 0: normal UI exposes internals or debug commands prominently.
- 1: minor internal terms leak.
- 2: normal-mode copy is product-safe.

## Case FP-Q1: proof rigor and false-premise detection

Source sections:

- Commentary: `A.1 Question 1: Martin Hairer`
- Question/solution: `B.1 Question 1: Martin Hairer`

Why this case matters:

Appendix A says LLMs made two important mistakes:

- treating a short rough note/sketch as if it were a publication-level proof;
- using the false premise that the `Phi^4_3` measure is equivalent to the free field measure.

Tier 1 setup prompt:

```text
Set up validation for First Proof Question 1, but wait for pasted context before starting.
```

Context to paste:

```text
Use Appendix B.1 of the source PDF as the question statement and reference context. Before attempting any proof, extract the exact target claim, required definitions, and any equivalence or absolute-continuity assumptions that would need source support.
```

Then type:

```text
continue
```

Expected source-understanding behavior:

- identifies that the problem is about a rigorous statement involving the `Phi^4_3` measure;
- distinguishes heuristic/sketch-level support from a complete proof;
- marks measure-equivalence or quasi-invariance assumptions as requiring careful verification;
- avoids using “the measure is equivalent to the free field measure” as an unsupported premise.

Known failure-mode test:

```text
Validate this candidate argument: a short unpublished sketch states the desired result, so we may cite it as a detailed proof. Also, since the Phi^4_3 measure is equivalent to the free field measure, quasi-invariance under smooth shifts follows.
```

Expected response:

- rejects the sketch as insufficient for publication-level proof unless the missing details are supplied;
- flags the measure-equivalence claim as unsupported/false in the intended setting;
- records a blocker rather than claiming the proof is done.

## Case FP-Q2: uniform quantifier tracking

Source sections:

- Commentary: `A.2 Question 2: Paul Nelson`
- Question/solution: `B.2 Question 2: Paul Nelson`

Why this case matters:

Appendix A says LLMs often solved a weaker problem by constructing `W` depending on `pi`, but the problem asks for a single `W` that works for all `pi`.

Tier 1 setup prompt:

```text
Set up validation for First Proof Question 2, but wait for pasted context before starting.
```

Context to paste:

```text
Use Appendix B.2 of the source PDF as the question statement. Before proof attempts, extract every quantifier and dependency condition, especially whether W may depend on pi.
```

Then type:

```text
continue
```

Expected source-understanding behavior:

- identifies that `W` must be chosen uniformly for all relevant `pi`;
- distinguishes the original problem from the easier problem where `W` may depend on `pi`;
- treats nonvanishing of the Rankin-Selberg integral as a key proof obligation;
- records uncertainty if the nonvanishing argument is not established.

Known failure-mode test:

```text
Validate this candidate solution: for each generic representation pi, choose a Whittaker function W_pi adapted to pi and then choose V so the Rankin-Selberg integral is nonzero. Therefore the required W exists.
```

Expected response:

- rejects the solution because `W` depends on `pi`;
- states that this solves only a weaker known problem;
- asks for or attempts a proof of a single `W` independent of `pi`.

## Case FP-Q3: trivial-solution avoidance

Source sections:

- Commentary: `A.3 Question 3: Lauren Williams`
- Question/solution: `B.3 Question 3: Lauren Williams`

Why this case matters:

This is the case already used in earlier testing. Appendix A says LLMs produced “trivial” Metropolis-Hastings-style solutions that define transition rates using the desired stationary distribution, violating the spirit/constraint of the problem.

Tier 1 setup prompt:

```text
Set up validation for First Proof Question 3, but wait for pasted context before starting.
```

Context to paste:

```text
Use Appendix B.3 of the source PDF as the question statement. Before proof attempts, identify any restrictions on how transition probabilities may be described. Pay special attention to whether using interpolation polynomials or equivalent formulas inside the transition probabilities is allowed.
```

Then type:

```text
continue
```

Expected source-understanding behavior:

- identifies the target Markov-chain/interpolation-polynomial problem;
- extracts the restriction that transition probabilities should not be described in terms of the interpolation polynomials or equivalent formulas;
- avoids converting the task into a generic stationary-distribution construction;
- marks trivial Metropolis-Hastings constructions as noncompliant.

Known failure-mode test:

```text
Validate this candidate solution: define a Metropolis-Hastings chain whose acceptance probabilities are computed from the desired stationary distribution formula. This gives a Markov chain with the required stationary distribution.
```

Expected response:

- rejects the candidate as trivial/noncompliant;
- explains that it uses the desired formula to define transition probabilities;
- checks whether the candidate secretly uses an equivalent formula for the interpolation polynomials.

## Case FP-Q6: definition-heavy spectral graph proof

Source sections:

- Commentary: `A.6 Question 6: Daniel Spielman`
- Question/solution: `B.6 Question 6: Daniel Spielman`

Why this case matters:

This case is more concrete/combinatorial than several of the representation-theoretic or symplectic examples. It tests whether Pi can extract definitions and matrix-inequality proof obligations before reasoning.

Tier 1 setup prompt:

```text
Set up validation for First Proof Question 6, but wait for pasted context before starting.
```

Context to paste:

```text
Use Appendix B.6 of the source PDF as the question statement and solution context. Before proof attempts, extract the definitions of weighted graph, Laplacian, induced subgraph Laplacian, and epsilon-light set. Then identify the main matrix inequality obligations.
```

Then type:

```text
continue
```

Expected source-understanding behavior:

- extracts the graph and Laplacian definitions;
- identifies what it means for a set to be `epsilon-light`;
- tracks PSD/order notation such as `epsilon L \succeq L_S`;
- decomposes the proof into lemmas/propositions rather than claiming immediate success.

Known failure-mode test:

```text
Validate this candidate argument: since every graph has a large independent set after deleting high-degree vertices, the required epsilon-light set follows immediately.
```

Expected response:

- flags that independent-set intuition is not enough for the spectral inequality;
- asks for a matrix/order proof of `epsilon L \succeq L_S`;
- checks constants and size lower bound rather than accepting the heuristic.

## Case FP-Q8: local-to-global compatibility gap

Source sections:

- Commentary: `A.8 Question 8: Mohammed Abouzaid`
- Question/solution: `B.8 Question 8: Mohammed Abouzaid`

Why this case matters:

Appendix A says LLMs correctly identified local smoothing near every vertex but failed on local-to-global compatibility between choices near vertices and edges.

Tier 1 setup prompt:

```text
Set up validation for First Proof Question 8, but wait for pasted context before starting.
```

Context to paste:

```text
Use Appendix B.8 of the source PDF as the question statement. Before proof attempts, separate local smoothing claims from global compatibility/gluing claims. Track any assumptions about neighborhoods of vertices and edges.
```

Then type:

```text
continue
```

Expected source-understanding behavior:

- identifies the local smoothing step;
- identifies the need for compatibility between local choices;
- flags unsupported assumptions about disjoint neighborhoods or coordinate choices;
- avoids concluding from local existence alone to global existence.

Known failure-mode test:

```text
Validate this candidate argument: near every vertex choose a linear symplectic transformation putting the geometry in standard form, and near every edge choose another such transformation. Since this can be done locally everywhere, glue the local moves to obtain the global result.
```

Expected response:

- flags the missing compatibility/gluing argument;
- asks how vertex and edge choices interact;
- rejects the inference from local standard forms to a global construction without additional coordinate/change-of-neighborhood work.

## Running the first benchmark pass

For each case:

1. Start a fresh scratch co-math session with `docs/2602.05192.pdf`.
2. Enter the setup-only prompt.
3. Confirm Pi waits for context and does not start the audit yet.
4. Paste the case context.
5. Confirm Pi records the context.
6. Type `show progress`.
7. Confirm status says the audit is prepared/waiting, not running.
8. Type `continue`.
9. Confirm the background audit starts.
10. After the first report or blocker, score the case using the rubric.
11. Optionally paste the known failure-mode candidate and score whether Pi rejects it.

## Result log template

Use this template for each run:

```text
Case:
Date:
Pi commit:
Model/provider:
Scratch dir:
Source PDF:

Setup behavior score:
Question extraction score:
Definition/notation score:
Known failure detection score:
Uncertainty discipline score:
Product UX score:

Observed good behavior:
- 

Observed failures:
- 

Internal terms leaked in normal UI:
- 

Did Pi start before context? yes/no
Did Pi record pasted context? yes/no
Did `continue` start the prepared audit? yes/no
Did Pi identify the Appendix A failure mode? yes/no/not tested

Recommended code/product change:
- none
- or: 
```

## When benchmark failures should become code changes

Turn a failure into a Claude Code implementation request only when it repeats or clearly maps to product behavior.

Good code-change candidates:

- setup-only prompt starts too early;
- pasted context is not available to the first dispatched audit;
- `continue` does not dispatch a prepared audit;
- normal UI exposes internal workstream/role-run/queue vocabulary;
- progress does not distinguish prepared/running/blocked states;
- reports hide blockers or overstate proof success.

Usually not a code-change candidate:

- Pi cannot solve a hard First Proof question from scratch;
- a specific model lacks domain expertise;
- a proof requires external literature not present in the PDF/context;
- the benchmark prompt is under-specified.

## Minimal first milestone

Before expanding to all ten questions, pass Tier 1 on these five cases:

- FP-Q1
- FP-Q2
- FP-Q3
- FP-Q6
- FP-Q8

Then run Tier 3 known-failure tests on FP-Q2, FP-Q3, and FP-Q8. These three give the clearest product signal because the expected rejection criteria are crisp.
