# Co-Math LLM-Backed Research Workstreams Implementation Plan

> **For Claude Code:** Implement this plan on the current co-math branch, or create a new branch if the user asks. Do not commit or push unless explicitly asked. Preserve the existing deterministic research scaffolding as fallback and for tests.

**Goal:** Replace purely scripted research-workstream content for generic problems with bounded LLM-backed specialist, critic, and synthesizer execution, while keeping deterministic scaffolding, progressive disclosure, durable reports, and safe fallback behavior.

**Architecture:** Keep the current co-math research path/workstream model. Add an optional model-backed execution path under `continue path N`: specialist prompt → critic prompt → synthesizer prompt → structured report → working-paper update. Use deterministic execution only when model execution is unavailable, disabled, or fails. Product output should clearly show that real research work is running, but still hide raw internal prompts/transcripts unless the user asks for the latest report.

**Tech Stack:** TypeScript, existing Pi coding-agent provider/runtime utilities, existing co-math harness/state/storage, Vitest. No new npm dependencies unless absolutely necessary.

---

## Motivation

The current co-math implementation now has the right product and state shape:

```text
Explore this problem
→ create multiple research paths
→ continue path N
→ coordinator/specialist/critic/synthesizer workstream
→ durable report
→ working-paper update
```

But the research content is still deterministic. For the special example:

```text
Are there infinitely many primes of the form n^2 + 1?
```

some useful custom behavior is programmed. For generic problems like:

```text
Are there infinitely many twin primes?
```

it still responds instantly because it uses generic templates.

This is useful scaffolding, but it is not yet the AI co-mathematician experience from `docs/2605.06651v2.pdf`.

The next milestone is:

```text
Real bounded model-backed research workstreams for non-programmed problems.
```

The point is not to make Pi prove open problems. The point is to make the specialist/critic/synthesizer steps actually reason about the specific problem and preserve uncertainty.

---

## Expected End Result

From a clean folder:

```bash
cd /tmp
mkdir comath-llm-workstream-demo
cd comath-llm-workstream-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

User types:

```text
Explore this problem: Are there infinitely many twin primes?
```

Pi creates five paths as today.

User types:

```text
continue path 2
```

Expected user-facing behavior:

```text
Research workstream started

Path 2: Direct proof attempt

Progress
- Framing the proof objective.
- Asking a specialist to try this path.
- Reviewing the attempt for gaps before updating the working paper.
- Synthesizing a cautious research note.
```

Then after a real model-backed run, Pi should produce problem-specific content, not generic template copy:

```text
Research workstream completed

Path 2: Direct proof attempt

Promising strategy
- A direct proof of twin-prime infinitude is out of reach with the current information.
- A useful smaller move is to examine sieve-theoretic reductions or bounded-gap results as context.

Review
- The specialist did not prove infinitude of twin primes.
- Any appeal to bounded prime gaps must not be confused with twin-prime infinitude.

Gap
- No mechanism was established that forces infinitely many prime pairs at distance exactly 2.

Next
Switch to a literature/source-backed path, or ask for a weaker target such as bounded prime gaps.

Working paper updated
- Added synthesized notes under "Direct proof attempts."

Details
- Say "show latest report" to inspect the specialist attempt and critique.
```

Then:

```text
show latest report
```

should show the actual internal report:

```text
Latest research report

Path 2: Direct proof attempt

Coordinator brief
...

Specialist attempt
... problem-specific model-generated attempt ...

Critic review
... problem-specific critique ...

Synthesis
... cautious summary ...
```

The response should usually take noticeably longer than the deterministic template because it runs model calls.

---

## Non-Goals

Do not implement:

```text
- full autonomous daemon
- true parallel workstreams
- background process scheduler
- external web/literature search
- theorem prover integration
- new provider abstractions if existing ones can be reused
- fabricated sources or citations
- proofs of open problems
```

Do not remove deterministic workstream execution. Keep it as:

```text
- fallback when model execution is unavailable
- stable test oracle
- safe mode for offline or CI contexts
```

---

## Current Context

Recent relevant commits:

```text
663dabd6 feat(coding-agent): add co-math research exploration mode
b65ed946 docs(coding-agent): prune superseded co-math handoff plans
e2788fcd feat(coding-agent): execute co-math research path rounds
```

There is also an uncommitted Claude Code implementation of coordinator-managed research workstreams if this plan is being applied before that commit. Inspect current git state first.

Important current files:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
packages/coding-agent/src/modes/comath/comath-progress.ts
packages/coding-agent/src/modes/comath/comath-research-execution.ts
packages/coding-agent/src/modes/comath/comath-research-workstream.ts
packages/coding-agent/examples/extensions/co-math/schema.ts
packages/coding-agent/examples/extensions/co-math/storage.ts
packages/coding-agent/test/comath-harness.test.ts
packages/coding-agent/test/comath-progress.test.ts
packages/coding-agent/test/comath-research-execution.test.ts
packages/coding-agent/test/comath-research-workstream.test.ts
packages/coding-agent/test/co-math-state.test.ts
```

Before implementation, inspect existing model/provider code. Likely locations:

```text
packages/coding-agent/src/**
packages/ai/src/**
packages/coding-agent/src/providers/**
packages/coding-agent/src/agent/**
```

Use search, not guesses:

```bash
cd /home/hermes/developer/pi-mono-comath
```

Search for existing model execution utilities:

```text
runModel
complete
generate
provider
assistant
stream
Agent
```

Use the existing project pattern. Do not invent a second provider stack.

---

## Product Requirements

### 1. Real LLM-backed content for generic problems

For a generic problem like:

```text
Explore this problem: Are there infinitely many twin primes?
continue path 2
```

Pi must not only emit generic template lines like:

```text
A direct proof should first identify which definitions and closure properties are actually available.
```

It should produce content that mentions the actual problem:

```text
twin primes
prime pairs at distance 2
bounded gaps are weaker than twin-prime infinitude
sieve/literature direction may be more appropriate
```

The exact wording does not need to be fixed, but tests should verify problem-specific signal.

### 2. Bounded, safe prompts

Each internal model call must be bounded and role-specific:

```text
specialist: attempt the selected path
critic: critique the attempt for gaps/overclaims
synthesizer: produce safe report fields
```

The model must be instructed:

```text
- preserve uncertainty
- do not claim proofs of famous/open problems unless actually proved from supplied context
- do not fabricate citations
- prefer useful partial progress, failed hypotheses, and next moves
- output concise structured text
```

### 3. Progressive disclosure

Normal TUI output should remain curated:

```text
Research workstream started
Research workstream completed
Promising strategy / Review / Gap / Next / Working paper updated
```

Detailed internal model outputs should appear in:

```text
show latest report
show details for path N
```

### 4. Fallback behavior

If LLM execution is unavailable, disabled, times out, or returns unusable output:

```text
- fall back to deterministic workstream execution
- save/report that fallback was used in internal report metadata or details
- user-facing copy should say something simple if needed: "I used the local fallback for this round."
```

Do not crash.

### 5. Configuration / testability

Tests must be able to inject a fake LLM executor.

Do not make unit tests call real provider APIs.

Likely approach:

```ts
export interface ResearchWorkstreamModelExecutor {
	run(input: ResearchWorkstreamModelRequest): Promise<ResearchWorkstreamModelResponse>;
}
```

The harness can accept an optional executor in constructor options. Production uses the real executor if available; tests use a fake.

---

## Proposed Architecture

Add a model-backed layer next to the deterministic workstream module.

Possible new file:

```text
packages/coding-agent/src/modes/comath/comath-research-model-workstream.ts
```

Suggested types:

```ts
import type { ResearchPath } from "../../../examples/extensions/co-math/schema.ts";
import type { ResearchWorkstreamReport } from "./comath-research-workstream.ts";

export interface ResearchWorkstreamModelRequest {
	role: "specialist" | "critic" | "synthesizer";
	rootQuestion: string;
	path: ResearchPath;
	allPaths: readonly ResearchPath[];
	priorFindings: readonly string[];
	inputText: string;
}

export interface ResearchWorkstreamModelResponse {
	text: string;
}

export interface ResearchWorkstreamModelExecutor {
	run(request: ResearchWorkstreamModelRequest): Promise<ResearchWorkstreamModelResponse>;
}

export interface RunModelBackedResearchWorkstreamInput {
	rootQuestion: string;
	path: ResearchPath;
	allPaths: readonly ResearchPath[];
	now: string;
	executor: ResearchWorkstreamModelExecutor;
}

export async function runModelBackedResearchWorkstream(
	input: RunModelBackedResearchWorkstreamInput,
): Promise<ResearchWorkstreamReport>;
```

The model-backed function should:

```text
1. Build coordinator brief deterministically.
2. Call specialist executor.
3. Call critic executor with specialist output.
4. Call synthesizer executor with specialist + critic output.
5. Parse or conservatively structure the outputs into ResearchWorkstreamReport.
6. If parsing fails, use safe text extraction and fallback fields rather than throwing.
```

Important: avoid a brittle “must be perfect JSON” design if existing project does not already support structured model output. A robust first slice can accept plain text and split into sections conservatively.

Preferred output strategy for model calls:

```text
Ask for markdown sections with exact headings:
## Findings
## Gaps
## Next
```

Then parse those headings. If missing, put the full response into report details and use generic safe summary.

---

## Real Executor Integration

Find the existing way Pi calls models. Do not guess.

Look for code that:

```text
- sends messages to a provider
- runs a coding agent task
- streams model output
- creates background role runs
```

Possible integration options:

### Option A: Reuse backend role-run machinery

If existing co-math role runs already know how to call a model and save transcripts, prefer reusing them.

Pros:

```text
- already has provider configuration
- already has transcript behavior
- closer to paper architecture
```

Cons:

```text
- may be more async/background-oriented than needed
```

### Option B: Add a small model executor adapter around existing provider API

If there is a simple existing `generate` or `complete` function, create:

```text
packages/coding-agent/src/modes/comath/comath-research-model-executor.ts
```

This adapter should implement `ResearchWorkstreamModelExecutor`.

Pros:

```text
- simpler vertical slice
- easier to fake in tests
```

Cons:

```text
- may duplicate some role-run transcript behavior
```

Choose the smallest path that fits existing code.

Do not introduce a dependency on Claude Code itself. This is Pi runtime functionality, not a Claude Code subprocess.

---

## Prompt Templates

Create prompt builder functions in the model-backed module or a small prompt module.

### Specialist prompt

Must include:

```text
You are the specialist for one research path in a co-mathematician workspace.
Root question: <rootQuestion>
Selected path: <path.title>
Path objective: <path.objective>
Existing findings: <priorFindings>

Task:
Attempt this path. Produce useful partial progress, not polished certainty.
Preserve uncertainty. Do not claim a proof of a famous/open problem unless you actually provide a complete proof.
Do not fabricate citations.

Return markdown with headings:
## Findings
## Promising strategy
## Gaps
## Next
```

### Critic prompt

Must include specialist output and ask:

```text
Review the specialist attempt for mathematical gaps, overclaims, missing assumptions, and unsupported citations.
Do not solve the whole problem; critique what was attempted.
Return markdown with headings:
## Review
## Gaps
## Overclaims or source issues
## Human help useful
```

### Synthesizer prompt

Must include both outputs and ask:

```text
Write a cautious research-workstream synthesis for the user and working paper.
Keep useful ideas. Preserve gaps. Avoid fabricated citations.
Return markdown with headings:
## Promising strategy
## Findings
## Review
## Gap
## Human help useful
## Next
## Working paper summary
```

---

## Implementation Tasks

### Task 1: Inspect current model/provider and role-run APIs

Objective: Identify the correct production executor integration point.

Read/search:

```text
packages/coding-agent/src
packages/ai/src
packages/coding-agent/examples/extensions/co-math
```

Search terms:

```text
provider
generate
complete
stream
model
runRole
dispatch
transcript
```

Outcome:

```text
- decide whether to use role-run machinery or a small provider adapter
- document the decision in code comments or final report
```

Do not edit before this decision.

### Task 2: Add model executor interfaces and fake-testable model workstream module

Create:

```text
packages/coding-agent/src/modes/comath/comath-research-model-workstream.ts
```

Add interfaces:

```text
ResearchWorkstreamModelRequest
ResearchWorkstreamModelResponse
ResearchWorkstreamModelExecutor
RunModelBackedResearchWorkstreamInput
```

Add prompt builders and parsers.

Add:

```ts
export async function runModelBackedResearchWorkstream(...): Promise<ResearchWorkstreamReport>
```

Initial implementation can be tested with a fake executor only.

### Task 3: Add unit tests for model-backed workstream using fake executor

Create:

```text
packages/coding-agent/test/comath-research-model-workstream.test.ts
```

Tests:

```text
1. Specialist, critic, and synthesizer requests are sent in order.
2. Requests include root question, selected path, and prior findings.
3. Twin-prime fake responses produce report content mentioning twin primes / distance 2.
4. Missing sections fall back safely without throwing.
5. No fake citations are introduced by parser/fallback code.
```

Run:

```bash
cd /home/hermes/developer/pi-mono-comath/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/comath-research-model-workstream.test.ts
```

### Task 4: Wire optional executor into CoMathHarness

Modify:

```text
packages/coding-agent/src/modes/comath/comath-harness.ts
```

Add optional constructor option:

```ts
researchModelExecutor?: ResearchWorkstreamModelExecutor;
```

For `continue path N`:

```text
if executor exists:
  run model-backed workstream
else:
  run deterministic workstream
```

If model-backed workstream throws or times out:

```text
- catch error
- run deterministic fallback
- include a product-safe note if appropriate
```

Keep existing state persistence path shared:

```text
report → update path → upsert working paper → add margin notes → save report → notify
```

Do not duplicate state update logic.

Refactor if useful:

```ts
private async persistResearchWorkstreamReport(...)
```

### Task 5: Add harness tests for model-backed generic problem

Modify:

```text
packages/coding-agent/test/comath-harness.test.ts
```

Add tests using fake executor:

```text
1. Generic twin-prime problem uses fake model executor on `continue path 2`.
2. Visible output includes twin-prime-specific synthesis, not just generic deterministic copy.
3. `show latest report` includes specialist/critic/synthesizer details from fake executor.
4. If fake executor throws, deterministic fallback still completes and persists a report.
```

Important assertion examples:

```ts
expect(visible).toContain("twin primes");
expect(visible).toContain("distance 2");
expect(visible).toContain("bounded prime gaps");
expect(visible).toContain("Research workstream completed");
expectProductCopy(visible);
```

Fallback test should assert:

```text
- no crash
- report exists
- output says local fallback or report details mention fallback
```

### Task 6: Add production executor only after locating existing API

Depending on Task 1, implement one of:

```text
packages/coding-agent/src/modes/comath/comath-research-model-executor.ts
```

or reuse existing role-run machinery.

Requirements:

```text
- no new provider configuration invented
- respects existing model/provider settings
- bounded output/token behavior if available
- no real model calls in unit tests
```

If production integration is too invasive, implement the interface and fake-test path now, then make production executor a clearly documented follow-up. But prefer a real adapter if the existing API is straightforward.

### Task 7: Product progress copy

Modify:

```text
packages/coding-agent/src/modes/comath/comath-progress.ts
```

When model-backed executor is used, progress should communicate real model-backed work without debug terms:

```text
Research workstream started

Path 2: Direct proof attempt

Progress
- Framing the proof objective.
- Asking a specialist to try this path.
- Reviewing the attempt for gaps before updating the working paper.
- Synthesizing a cautious research note.
```

When fallback is used, product copy can say:

```text
I used the local fallback for this round because model-backed research was unavailable.
```

Do not expose stack traces or provider internals in normal output.

### Task 8: Update smoke documentation

Modify:

```text
docs/comath-research-exploration-smoke.md
```

Add section:

```text
LLM-backed generic problem smoke
```

Manual steps:

```text
Explore this problem: Are there infinitely many twin primes?
continue path 2
show latest report
summarize current state
```

Good signs:

```text
- response takes longer than deterministic local fallback
- output mentions twin primes / distance 2 / bounded gaps or another problem-specific concept
- output does not claim proof of twin-prime conjecture
- latest report includes specialist, critic, and synthesis sections
- fallback behavior is clear if no model executor is configured
```

### Task 9: Validation commands

Run focused tests:

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
  test/comath-research-model-workstream.test.ts
```

Then:

```bash
cd /home/hermes/developer/pi-mono-comath
npm run check
git diff --check
```

Do not run full `npm test` unless the user asks.

### Task 10: Manual product smoke

Use a new temp folder. Do not use destructive cleanup commands.

```bash
cd /tmp
mkdir comath-llm-workstream-demo-1
cd comath-llm-workstream-demo-1
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Inside Pi:

```text
Explore this problem: Are there infinitely many twin primes?
continue path 2
show latest report
summarize current state
```

Good signs:

```text
- `continue path 2` does not return instantly if production model executor is configured.
- output is problem-specific to twin primes.
- it does not claim to prove the conjecture.
- report contains specialist, critic, and synthesis sections.
- working paper/state updates happen.
```

If no model executor is configured in the dev environment, smoke fallback path instead:

```text
- output explicitly indicates local fallback or report details mention fallback
- deterministic workstream still works
```

---

## Acceptance Criteria

Implementation is acceptable only if:

```text
1. Model executor interface exists and is injectable in tests.
2. Model-backed workstream runs specialist → critic → synthesizer in order.
3. Generic twin-prime fake executor test produces problem-specific report content.
4. `continue path N` uses model-backed workstream when executor is configured.
5. Deterministic fallback still works when executor is absent or fails.
6. No unit test calls a real provider API.
7. Normal product output remains curated and avoids raw backend/debug terms.
8. `show latest report` displays detailed model-backed report sections.
9. Existing deterministic tests still pass.
10. Existing validation/source-audit mode still works.
11. Focused test command passes.
12. `npm run check` passes.
13. `git diff --check` passes.
14. Manual smoke documents whether real model path or fallback path was exercised.
```

---

## Risks and Pitfalls

### Risk: Provider integration guessed incorrectly

Do not invent a new provider stack. Inspect the repo first and follow existing patterns.

### Risk: Tests accidentally call real models

All unit tests must use fake executors.

### Risk: Overclaiming famous/open problems

Prompts and critic role must explicitly prevent this.

Bad output:

```text
This proves the twin prime conjecture.
```

Good output:

```text
This does not prove the twin prime conjecture; it identifies a plausible weaker/literature direction.
```

### Risk: brittle JSON parsing

Prefer robust markdown-section parsing or tolerant structured extraction unless existing model API supports reliable JSON schema.

### Risk: raw internal output in TUI

Keep raw prompts/details in `show latest report`, not the default completion summary.

---

## Suggested Claude Code Prompt

Use this prompt for Claude Code:

```text
Implement docs/claude-comath-llm-backed-research-workstreams-plan.md.

Use /home/hermes/developer/pi-mono-comath. Do not commit or push unless asked.

Goal: add bounded model-backed co-math research workstreams for generic problems. `continue path N` should use injected/real model-backed specialist → critic → synthesizer execution when available, produce problem-specific reports for prompts like twin primes, preserve uncertainty, and fall back to deterministic workstreams if model execution is unavailable or fails.

First inspect the existing model/provider/role-run APIs and reuse the repo’s existing pattern. Do not invent a second provider stack. No unit test may call a real provider API; use fake executors.

Run the focused vitest command from the plan, then `npm run check`, then `git diff --check`. Do a manual TUI smoke from a new temp folder without destructive cleanup commands. Report changed files, how production model execution is integrated or why it is deferred, tests run, smoke result, and limitations. Do not commit.
```

---

## Final Report Requirements for Claude Code

When done, report:

```text
- files changed
- model/provider integration point used
- whether real production model execution is implemented or only injectable/fake-tested
- fallback behavior
- exact tests run and pass/fail results
- npm run check result
- git diff --check result
- manual smoke result for twin primes
- whether response was real model-backed or fallback
- known limitations
- confirmation that no commit was made
```
