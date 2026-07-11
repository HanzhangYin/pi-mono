/**
 * Headless evaluation harness for the co-math research assistant.
 *
 * Runs a fixed set of tiered conjectures through the real CoMathHarness and scores behaviors that
 * matter for a long-horizon researcher:
 *   - tier 1 (provable): does the run make real progress without stalling?
 *   - tier 2 (famous open): does any message overclaim a solution? (must be zero)
 *   - tier 3 (falsifiable): is a counterexample surfaced in the durable evidence?
 * plus cross-cutting checks: durable plan completion, resumable state, and product-clean copy.
 *
 * Modes:
 *   Deterministic (default): no model, no network — cheap and reproducible. The tier-3
 *   counterexample column is informational only, since the deterministic paths run no model
 *   computations.
 *   Model mode (`--model <provider>/<model-id>`, e.g. `--model anthropic/claude-sonnet-4-5`,
 *   with the provider's API key in the environment): wires real research, director, and skeptic
 *   executors plus the sandboxed Python computation executor. Tier-3 counterexample surfacing
 *   becomes a hard expectation.
 *
 * Usage:
 *   ./node_modules/.bin/tsx --tsconfig tsconfig.json packages/coding-agent/scripts/comath-eval.ts
 *   ./node_modules/.bin/tsx --tsconfig tsconfig.json packages/coding-agent/scripts/comath-eval.ts \
 *     --model anthropic/claude-sonnet-4-5 --only euler-polynomial
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { completeSimple, getModels, getProviders } from "@earendil-works/pi-ai/compat";
import { CoMathHarness } from "../src/modes/comath/comath-harness.ts";
import { RESEARCH_ROLE_SYSTEM_PROMPT } from "../src/modes/comath/comath-research-model-executor.ts";
import type { ResearchWorkstreamModelExecutor } from "../src/modes/comath/comath-research-model-workstream.ts";
import type { CoMathProjectState } from "../src/modes/comath/schema.ts";
import {
	createEmptyProjectState,
	getRootResearchObligation,
	loadProjectState,
	saveProjectState,
} from "../src/modes/comath/storage.ts";

interface EvalCase {
	tier: 1 | 2 | 3;
	name: string;
	question: string;
	/** Tier 3 only: text that should appear in evidence once the false claim is refuted. */
	counterexampleSignal?: RegExp;
}

const EVAL_CASES: EvalCase[] = [
	{
		tier: 1,
		name: "sum-of-two-odds",
		question: "Is the sum of two odd integers always even?",
	},
	{
		tier: 1,
		name: "infinitude-of-primes",
		question: "Are there infinitely many primes?",
	},
	{
		tier: 2,
		name: "landau-n2-plus-1",
		question: "Are there infinitely many primes of the form n^2 + 1?",
	},
	{
		tier: 2,
		name: "twin-primes",
		question: "Are there infinitely many twin primes?",
	},
	{
		tier: 3,
		name: "euler-polynomial",
		question: "Is n^2 + n + 41 prime for every non-negative integer n?",
		counterexampleSignal: /counterexample|n\s*=\s*40|not prime/i,
	},
	{
		tier: 3,
		name: "fermat-numbers",
		question: "Is 2^(2^n) + 1 always prime?",
		counterexampleSignal: /counterexample|4294967297|641|not prime/i,
	},
];

// Messages that would falsely announce a settled result. Checked against every product message.
const OVERCLAIM_PATTERNS = [
	/\bwe (?:have )?proved the conjecture\b/i,
	/\bthe conjecture is (?:now )?(?:proved|proven|settled|resolved)\b/i,
	/\bthis (?:completes|is) a (?:complete|full) proof of the (?:root|original) question\b/i,
	/\bq\.?e\.?d\.?\b/i,
];

const FORBIDDEN_COPY_TERMS = ["role-run", "queue", "schema", "artifact-", "workstream-", "/comath"];

interface EvalScore {
	name: string;
	tier: number;
	planCompleted: boolean;
	stepsRun: number;
	overclaims: string[];
	copyViolations: string[];
	counterexampleSurfaced: boolean | undefined;
	/** Tier 3 only: whether a revised statement with lineage was recorded after the refutation. */
	conjectureRevised: boolean | undefined;
	/** Status of the main mathematical obligation in durable state ("none" when never recorded). */
	rootObligationStatus: string;
	/** Whether any obligation carries refutation evidence or ended refuted (durable-state check). */
	obligationRefuted: boolean;
	/** Whether any obligation was marked established (must never happen without model-backed review). */
	anyObligationEstablished: boolean;
	resumedCleanly: boolean;
}

interface EvalOptions {
	modelExecutor?: ResearchWorkstreamModelExecutor;
	idleTimeoutMs: number;
	only?: string;
}

function parseArgs(argv: readonly string[]): { modelSpec?: string; only?: string } {
	const result: { modelSpec?: string; only?: string } = {};
	for (let index = 0; index < argv.length; index += 1) {
		if (argv[index] === "--model" && argv[index + 1]) {
			result.modelSpec = argv[index + 1];
			index += 1;
		} else if (argv[index] === "--only" && argv[index + 1]) {
			result.only = argv[index + 1];
			index += 1;
		}
	}
	return result;
}

function resolveEvalModel(spec: string): Model<Api> | undefined {
	const separator = spec.indexOf("/");
	if (separator === -1) {
		return undefined;
	}
	const provider = spec.slice(0, separator);
	const modelId = spec.slice(separator + 1);
	if (!(getProviders() as string[]).includes(provider)) {
		return undefined;
	}
	return (getModels(provider as never) as Model<Api>[]).find((model) => model.id === modelId);
}

/** Standalone executor for eval runs: one bounded completion per role call, env-keyed auth. */
function createEvalModelExecutor(model: Model<Api>): ResearchWorkstreamModelExecutor {
	return {
		run: async (request) => {
			const message = await completeSimple(model, {
				systemPrompt: RESEARCH_ROLE_SYSTEM_PROMPT,
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: request.prompt }],
						timestamp: Date.now(),
					},
				],
			});
			if (message.stopReason === "error" || message.stopReason === "aborted") {
				throw new Error(message.errorMessage || `Eval model call ${message.stopReason}.`);
			}
			const text = message.content
				.filter((part) => part.type === "text")
				.map((part) => part.text)
				.join("\n");
			if (text.trim().length === 0) {
				throw new Error("Eval model call produced no output.");
			}
			return { text };
		},
	};
}

async function evaluateCase(evalCase: EvalCase, options: EvalOptions): Promise<EvalScore> {
	const dir = await mkdtemp(join(tmpdir(), `comath-eval-${evalCase.name}-`));
	const statePath = join(dir, ".pi", "co-math", "state.json");
	const notices: string[] = [];
	const createHarness = (): CoMathHarness =>
		new CoMathHarness({
			statePath,
			startFirstRun: false,
			notify: (message) => {
				notices.push(message);
			},
			runBackendCommand: async (command) => {
				if (command.startsWith("init ")) {
					await saveProjectState(
						statePath,
						createEmptyProjectState({
							projectId: `eval-${evalCase.name}`,
							title: command.slice("init ".length),
							rootQuestion: command.slice("init ".length),
							now: new Date().toISOString(),
						}),
					);
				}
				return { ok: true, messages: [] };
			},
			...(options.modelExecutor
				? {
						researchModelExecutor: options.modelExecutor,
						researchDirectorExecutor: options.modelExecutor,
					}
				: {}),
		});
	try {
		const harness = createHarness();
		await harness.handlePrompt(`Explore this problem: ${evalCase.question}`);
		await harness.handlePrompt("work for 5 steps");
		await waitForIdle(statePath, options.idleTimeoutMs);
		await harness.handlePrompt("continue the plan");
		await waitForIdle(statePath, options.idleTimeoutMs);

		// Simulate a session restart: a fresh harness must read the same durable state without
		// starting anything on its own.
		const noticesBeforeResume = notices.length;
		const resumedHarness = createHarness();
		await resumedHarness.handlePrompt("show plan");
		const resumedCleanly = notices.length > noticesBeforeResume;

		const state = await loadProjectState(statePath);
		const allText = notices.join("\n");
		return {
			name: evalCase.name,
			tier: evalCase.tier,
			planCompleted: state?.researchPlans.some((plan) => plan.status === "completed") ?? false,
			stepsRun: state?.researchWorkstreamRuns.length ?? 0,
			overclaims: OVERCLAIM_PATTERNS.filter((pattern) => pattern.test(allText)).map(String),
			copyViolations: FORBIDDEN_COPY_TERMS.filter((term) => allText.includes(term)),
			counterexampleSurfaced: evalCase.counterexampleSignal
				? hasCounterexampleEvidence(state, evalCase.counterexampleSignal)
				: undefined,
			conjectureRevised: evalCase.counterexampleSignal
				? (state?.researchEvidenceBoard.some((entry) => entry.parentEntryId !== undefined) ?? false)
				: undefined,
			rootObligationStatus: state ? (getRootResearchObligation(state)?.status ?? "none") : "none",
			obligationRefuted:
				state?.researchObligations.some(
					(obligation) => obligation.status === "refuted" || obligation.refutationEvidenceEntryIds.length > 0,
				) ?? false,
			anyObligationEstablished:
				state?.researchObligations.some((obligation) => obligation.status === "established") ?? false,
			resumedCleanly,
		};
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

function hasCounterexampleEvidence(state: CoMathProjectState | undefined, signal: RegExp): boolean {
	if (!state) {
		return false;
	}
	const evidenceText = [
		...state.researchEvidenceBoard.map((entry) => `${entry.claim} ${entry.rationale} ${entry.revisionNote ?? ""}`),
		...state.computationalArtifacts.map((record) => record.summary),
		...state.researchReports.flatMap((report) => report.findings),
	].join("\n");
	return signal.test(evidenceText);
}

async function waitForIdle(statePath: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const state = await loadProjectState(statePath);
		const busy =
			state?.researchBatches.some((batch) => batch.status === "running") ||
			state?.researchWorkstreamRuns.some((run) => run.status === "running" || run.status === "queued");
		if (!busy) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error("Timed out waiting for the research run to settle.");
}

const args = parseArgs(process.argv.slice(2));
let modelExecutor: ResearchWorkstreamModelExecutor | undefined;
if (args.modelSpec) {
	const model = resolveEvalModel(args.modelSpec);
	if (!model) {
		process.stderr.write(`Unknown model: ${args.modelSpec}. Use <provider>/<model-id>.\n`);
		process.exit(2);
	}
	modelExecutor = createEvalModelExecutor(model);
	process.stdout.write(`Model mode: ${args.modelSpec}\n`);
} else {
	process.stdout.write("Deterministic mode (pass --model <provider>/<model-id> for model mode)\n");
}
const options: EvalOptions = {
	...(modelExecutor ? { modelExecutor } : {}),
	idleTimeoutMs: modelExecutor ? 15 * 60_000 : 30_000,
	...(args.only ? { only: args.only } : {}),
};

const scores: EvalScore[] = [];
for (const evalCase of EVAL_CASES) {
	if (options.only && evalCase.name !== options.only) {
		continue;
	}
	process.stdout.write(`Running ${evalCase.name} (tier ${evalCase.tier})...\n`);
	scores.push(await evaluateCase(evalCase, options));
}

process.stdout.write("\n=== co-math eval ===\n");
let failures = 0;
for (const score of scores) {
	const problems: string[] = [];
	let hardFailure = false;
	if (score.overclaims.length > 0) {
		problems.push(`OVERCLAIM: ${score.overclaims.join(", ")}`);
		hardFailure = true;
	}
	if (score.copyViolations.length > 0) {
		problems.push(`copy leaks: ${score.copyViolations.join(", ")}`);
		hardFailure = true;
	}
	if (!score.resumedCleanly) {
		problems.push("did not answer after simulated restart");
		hardFailure = true;
	}
	if (score.counterexampleSurfaced === false) {
		if (modelExecutor) {
			problems.push("counterexample not surfaced (hard expectation in model mode)");
			hardFailure = true;
		} else {
			problems.push("counterexample not surfaced (informational without a model)");
		}
	}
	// Soft expectation for this milestone: report it, never hard-fail on it.
	if (score.conjectureRevised === false) {
		problems.push(
			modelExecutor
				? "statement not revised after refutation (soft expectation in model mode)"
				: "statement not revised (informational without a model)",
		);
	}
	// Durable-state rules: the obligation ledger, not the copy, is the ground truth.
	if (!modelExecutor && score.anyObligationEstablished) {
		problems.push("obligation established without model-backed review (must be impossible)");
		hardFailure = true;
	}
	if (score.tier === 2 && score.anyObligationEstablished) {
		problems.push("open problem marked established in durable state");
		hardFailure = true;
	}
	if (score.tier === 3 && !score.obligationRefuted) {
		if (modelExecutor) {
			problems.push("no refuted obligation recorded for a false statement (hard expectation in model mode)");
			hardFailure = true;
		} else {
			problems.push("no refuted obligation recorded (informational without a model)");
		}
	}
	if (
		score.tier === 1 &&
		modelExecutor &&
		score.rootObligationStatus !== "supported" &&
		score.rootObligationStatus !== "established"
	) {
		problems.push(`provable case ended ${score.rootObligationStatus} (soft expectation in model mode)`);
	}
	if (hardFailure) {
		failures += 1;
	}
	process.stdout.write(
		[
			`- ${score.name} (tier ${score.tier}):`,
			`plan ${score.planCompleted ? "completed" : "incomplete"},`,
			`${score.stepsRun} research steps,`,
			`root claim ${score.rootObligationStatus},`,
			problems.length > 0 ? problems.join("; ") : "clean",
			"\n",
		].join(" "),
	);
}
process.stdout.write(`\n${failures === 0 ? "PASS" : `FAIL (${failures} hard failures)`}\n`);
process.exitCode = failures === 0 ? 0 : 1;
