import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CoMathProjectState } from "../examples/extensions/co-math/schema.ts";
import {
	addComputationalArtifact,
	addLiteratureClaimSupport,
	addResearchPath,
	addResearchWorkstreamIncrementalReport,
	addResearchWorkstreamReport,
	addResearchWorkstreamRun,
	createEmptyProjectState,
	loadProjectState,
	STALE_RESEARCH_WORKSTREAM_RUN_REASON,
	saveProjectState,
} from "../examples/extensions/co-math/storage.ts";
import type {
	ComputationalExecutionResult,
	ComputationalExecutor,
	ComputationalScriptDraft,
} from "../src/modes/comath/comath-computation-executor.ts";
import {
	type CoMathBackendCommandResult,
	CoMathHarness,
	type CoMathHarnessOptions,
} from "../src/modes/comath/comath-harness.ts";
import type { LiteratureSourceLookup, LiteratureSourceResult } from "../src/modes/comath/comath-literature-source.ts";
import type {
	ResearchWorkstreamModelExecutor,
	ResearchWorkstreamModelRequest,
} from "../src/modes/comath/comath-research-model-workstream.ts";

const OK: CoMathBackendCommandResult = { ok: true, messages: [] };

const FORBIDDEN_PRODUCT_TERMS = [
	"Co-math research mode",
	"co-math project",
	"co-math goal",
	"co-math workstream",
	"Added co-math goal",
	"Added co-math workstream",
	"Initialized co-math project state",
	"Queued co-math workstream",
	"Started co-math role run",
	"role-run",
	"queue",
	"schema",
	"artifact",
	"artifact-",
	"workstream-",
	"/comath",
];

function expectProductCopy(text: string): void {
	for (const term of FORBIDDEN_PRODUCT_TERMS) {
		expect(text).not.toContain(term);
	}
}

async function createResearchHarnessFixture(): Promise<{
	commands: string[];
	dir: string;
	harness: CoMathHarness;
	notices: string[];
	statePath: string;
}> {
	const dir = await mkdtemp(join(tmpdir(), "comath-research-harness-"));
	const statePath = join(dir, ".pi", "co-math", "state.json");
	const commands: string[] = [];
	const notices: string[] = [];
	const harness = new CoMathHarness({
		statePath,
		notify: (message) => {
			notices.push(message);
		},
		runBackendCommand: async (command) => {
			commands.push(command);
			if (command.startsWith("init ")) {
				await saveProjectState(
					statePath,
					createEmptyProjectState({
						projectId: "proj-test",
						title: command.slice("init ".length),
						rootQuestion: command.slice("init ".length),
						now: "2026-06-05T12:00:00.000Z",
					}),
				);
			}
			return OK;
		},
	});
	return { commands, dir, harness, notices, statePath };
}

const TWIN_PRIME_MODEL_RESPONSES: Record<"specialist" | "critic" | "synthesizer", string> = {
	specialist: [
		"## Findings",
		"- Twin primes are prime pairs at distance 2 such as (3, 5) and (5, 7).",
		"## Promising strategy",
		"- Consider sieve-theoretic reductions instead of a direct construction.",
		"## Gaps",
		"- No mechanism forces infinitely many prime pairs at distance 2.",
		"## Next",
		"- Compare against bounded prime gaps as a weaker target.",
	].join("\n"),
	critic: [
		"## Review",
		"- The specialist did not prove infinitude of twin primes.",
		"## Gaps",
		"- Bounded prime gaps are weaker than twin-prime infinitude.",
		"## Overclaims or source issues",
		"- No overclaims detected.",
		"## Human help useful",
		"- A number theorist could advise on the appropriate sieve method.",
	].join("\n"),
	synthesizer: [
		"## Promising strategy",
		"- A direct proof of twin-prime infinitude is out of reach; examine bounded prime gaps as context.",
		"## Findings",
		"- Twin primes remain conjecturally infinite with strong numerical support.",
		"## Review",
		"- The specialist did not prove infinitude of twin primes; do not conflate bounded prime gaps with prime pairs at distance 2.",
		"## Gap",
		"- No mechanism forces infinitely many twin primes, i.e. prime pairs at distance 2.",
		"## Human help useful",
		"- Literature guidance on sieve theory would help.",
		"## Next",
		"- Switch to a literature/source-backed path, or ask for a weaker target such as bounded prime gaps.",
		"## Working paper summary",
		"- Twin-prime infinitude is open; bounded prime gaps are a weaker, related result.",
	].join("\n"),
};

const TWIN_PRIME_LITERATURE_SOURCES: LiteratureSourceResult[] = [
	{
		kind: "paper",
		title: "Twin prime conjecture status note",
		url: "https://example.test/twin-prime-status",
		summary: "The twin-prime conjecture remains open.",
		extractedText: "The twin-prime conjecture remains open.",
	},
	{
		kind: "paper",
		title: "Bounded gaps between primes",
		url: "https://example.test/bounded-gaps",
		summary: "Bounded prime gaps are weaker than twin-prime infinitude.",
		extractedText: "A bounded gap need not be exactly 2.",
	},
];

const TWIN_PRIME_LITERATURE_RESPONSES: Record<"specialist" | "critic" | "synthesizer", string> = {
	specialist: [
		"## Findings",
		"- The twin-prime conjecture remains open. [source-1]",
		"- Bounded prime gaps are weaker than twin-prime infinitude. [source-2]",
		"## Known results",
		"- These are context sources, not a proof of the twin-prime conjecture.",
		"## Unsupported or unclear",
		"- No source here proves gaps exactly 2 occur infinitely often.",
		"## Next",
		"- Use the sources to revise the direct-proof path.",
	].join("\n"),
	critic: [
		"## Review",
		"- The specialist correctly separates bounded gaps from twin-prime infinitude.",
		"## Unsupported or unclear",
		"- No source in this report proves the twin-prime conjecture.",
		"## Gaps",
		"- Exact theorem statements should still be checked.",
		"## Human help useful",
		"- A number theorist could verify exact references.",
	].join("\n"),
	synthesizer: [
		"## Known results",
		"- The twin-prime conjecture remains open. [source-1]",
		"- Bounded prime gaps are known but do not imply gaps exactly 2. [source-2]",
		"## Findings",
		"- Source-backed context distinguishes twin-prime infinitude from weaker bounded-gap results. [source-1] [source-2]",
		"## Source-backed distinctions",
		"- Do not present bounded-gap results as a proof of the twin-prime conjecture.",
		"## Unsupported or unclear",
		"- No provided source proves infinitely many prime pairs at distance 2.",
		"## Human help useful",
		"- Exact theorem statements from a reference text would help.",
		"## Next",
		"- Use the literature findings to revise the direct-proof path or create a weaker bounded-gap path.",
		"## Working paper summary",
		"- The twin-prime conjecture remains open; bounded-gap results are weaker.",
	].join("\n"),
};

const N_SQUARED_LITERATURE_SOURCES: LiteratureSourceResult[] = [
	{
		kind: "user-provided",
		title: "Test note on prime values of polynomials",
		summary:
			"Discusses Bunyakovsky/Schinzel-style conjectural context for prime values of polynomials; does not prove infinitude for n^2 + 1.",
		extractedText:
			"Schinzel's hypothesis H would imply many prime-value statements for suitable polynomials, but this is conjectural. This note does not prove that n^2 + 1 is prime infinitely often.",
	},
];

const N_SQUARED_LITERATURE_RESPONSES: Record<"specialist" | "critic" | "synthesizer", string> = {
	specialist: [
		"## Source-backed status",
		"- The source discusses Schinzel-style conjectural context for prime values of polynomials. [source-1]",
		"## Conjectural or heuristic context",
		"- Schinzel's hypothesis H is conjectural in the supplied source. [source-1]",
		"## Unsupported or unresolved",
		"- The source does not prove that n^2 + 1 is prime infinitely often. [source-1]",
		"## Next",
		"- Ask the coordinator what to try next.",
	].join("\n"),
	critic: [
		"## Review",
		"- The specialist correctly treats the source as conjectural context.",
		"## Unsupported or unresolved",
		"- No unconditional proof of n^2 + 1 prime infinitude appears in the source.",
		"## Gaps",
		"- A source-backed unconditional theorem is still missing.",
		"## Human help useful",
		"- A reference on Landau's problems would help.",
	].join("\n"),
	synthesizer: [
		"## Source-backed status",
		"- Source-backed context supports only conjectural prime-values-of-polynomials framing. [source-1]",
		"## Conjectural or heuristic context",
		"- Schinzel-style implications are conjectural, not unconditional proofs. [source-1]",
		"## Source-backed distinctions",
		"- Do not treat the original infinitude claim as proved.",
		"## Unsupported or unresolved",
		"- No source here proves infinitely many primes of the form n^2 + 1.",
		"## Human help useful",
		"- A source on Landau's fourth problem would help.",
		"## Next",
		"- Ask the coordinator what to try next.",
	].join("\n"),
};

const N_SQUARED_COMPUTATION_RESPONSES: Record<"specialist" | "critic" | "synthesizer", string> = {
	specialist: [
		"Finite search for n^2 + 1.",
		"",
		"```python",
		"BOUND = 20",
		"print('checked_range: 1 <= n <= 20')",
		"print('prime_values_found: 7')",
		"```",
	].join("\n"),
	critic: [
		"## Review",
		"- The computation records an explicit finite range.",
		"## Limitations",
		"- A finite computation does not prove an infinite claim.",
		"## Gaps",
		"- The bridge from checked cases to a proof remains open.",
	].join("\n"),
	synthesizer: [
		"## Promising strategy",
		"- Use the checked examples to look for parity and congruence obstructions.",
		"## Findings",
		"- checked_range: 1 <= n <= 20",
		"- prime_values_found: 7",
		"## Limitations",
		"- A finite computation does not prove an infinite claim.",
		"## Gaps",
		"- The finite check is evidence, not a proof of infinitude.",
		"## Next",
		"- Use the parity observation to refine the direct-proof path.",
	].join("\n"),
};

function createTwinPrimeExecutor(): {
	executor: ResearchWorkstreamModelExecutor;
	roles: string[];
} {
	const roles: string[] = [];
	const executor: ResearchWorkstreamModelExecutor = {
		run: async (request) => {
			roles.push(request.role);
			return { text: TWIN_PRIME_MODEL_RESPONSES[request.role] };
		},
	};
	return { executor, roles };
}

function createNSquaredComputationExecutor(): {
	executor: ResearchWorkstreamModelExecutor;
	requests: ResearchWorkstreamModelRequest[];
} {
	const requests: ResearchWorkstreamModelRequest[] = [];
	const executor: ResearchWorkstreamModelExecutor = {
		run: async (request) => {
			requests.push(request);
			return { text: N_SQUARED_COMPUTATION_RESPONSES[request.role] };
		},
	};
	return { executor, requests };
}

function createTwinPrimeLiteratureExecutor(): {
	executor: ResearchWorkstreamModelExecutor;
	requests: ResearchWorkstreamModelRequest[];
} {
	const requests: ResearchWorkstreamModelRequest[] = [];
	const executor: ResearchWorkstreamModelExecutor = {
		run: async (request) => {
			requests.push(request);
			return { text: TWIN_PRIME_LITERATURE_RESPONSES[request.role] };
		},
	};
	return { executor, requests };
}

function createNSquaredLiteratureExecutor(): {
	executor: ResearchWorkstreamModelExecutor;
	requests: ResearchWorkstreamModelRequest[];
} {
	const requests: ResearchWorkstreamModelRequest[] = [];
	const executor: ResearchWorkstreamModelExecutor = {
		run: async (request) => {
			requests.push(request);
			return { text: N_SQUARED_LITERATURE_RESPONSES[request.role] };
		},
	};
	return { executor, requests };
}

function createFakeComputationalExecutor(result?: Partial<ComputationalExecutionResult>): {
	computationalExecutor: ComputationalExecutor;
	drafts: ComputationalScriptDraft[];
} {
	const drafts: ComputationalScriptDraft[] = [];
	const computationalExecutor: ComputationalExecutor = {
		runScript: async (draft) => {
			drafts.push(draft);
			return {
				command: "python3 search.py",
				exitCode: 0,
				stdout: "checked_range: 1 <= n <= 20\nprime_values_found: 7\n",
				stderr: "",
				durationMs: 7,
				scriptFileName: "search.py",
				stdoutFileName: "stdout.txt",
				...result,
			};
		},
	};
	return { computationalExecutor, drafts };
}

function createDeferredComputationalExecutor(): {
	computationalExecutor: ComputationalExecutor;
	drafts: ComputationalScriptDraft[];
	resolveNext(result?: Partial<ComputationalExecutionResult>): void;
} {
	const drafts: ComputationalScriptDraft[] = [];
	const pending: Array<(result: ComputationalExecutionResult) => void> = [];
	return {
		drafts,
		computationalExecutor: {
			runScript: async (draft) => {
				drafts.push(draft);
				return new Promise((resolve) => {
					pending.push(resolve);
				});
			},
		},
		resolveNext: (result) => {
			const resolve = pending.shift();
			if (!resolve) {
				throw new Error("No pending computation to resolve.");
			}
			resolve({
				command: "python3 search.py",
				exitCode: 0,
				stdout: "checked_range: 1 <= n <= 20\nprime_values_found: 7\n",
				stderr: "",
				durationMs: 7,
				scriptFileName: "search.py",
				stdoutFileName: "stdout.txt",
				...result,
			});
		},
	};
}

function createLiteratureLookup(sources: LiteratureSourceResult[]): {
	lookup: LiteratureSourceLookup;
	queries: string[];
} {
	const queries: string[] = [];
	return {
		queries,
		lookup: {
			search: async (query) => {
				queries.push(`${query.rootQuestion} ${query.pathTitle} ${query.pathObjective}`);
				return sources;
			},
		},
	};
}

function createDeferredLiteratureLookup(): {
	lookup: LiteratureSourceLookup;
	resolveNext(sources: LiteratureSourceResult[]): void;
	queries: string[];
} {
	const queries: string[] = [];
	const pending: Array<(sources: LiteratureSourceResult[]) => void> = [];
	return {
		queries,
		lookup: {
			search: async (query) => {
				queries.push(`${query.rootQuestion} ${query.pathTitle} ${query.pathObjective}`);
				return new Promise((resolve) => {
					pending.push(resolve);
				});
			},
		},
		resolveNext: (sources) => {
			const resolve = pending.shift();
			if (!resolve) {
				throw new Error("No pending source lookup to resolve.");
			}
			resolve(sources);
		},
	};
}

function createDeferredExecutor(): {
	executor: ResearchWorkstreamModelExecutor;
	requests: ResearchWorkstreamModelRequest[];
	resolveNext(text: string): void;
	rejectNext(error: Error): void;
} {
	const requests: ResearchWorkstreamModelRequest[] = [];
	const pending: Array<{ resolve: (response: { text: string }) => void; reject: (error: Error) => void }> = [];
	const executor: ResearchWorkstreamModelExecutor = {
		run: async (request) => {
			requests.push(request);
			return new Promise((resolve, reject) => {
				pending.push({ resolve, reject });
			});
		},
	};
	return {
		executor,
		requests,
		resolveNext: (text: string) => {
			const next = pending.shift();
			if (!next) {
				throw new Error("No pending model request to resolve.");
			}
			next.resolve({ text });
		},
		rejectNext: (error: Error) => {
			const next = pending.shift();
			if (!next) {
				throw new Error("No pending model request to reject.");
			}
			next.reject(error);
		},
	};
}

async function createModelHarnessFixture(
	executor: ResearchWorkstreamModelExecutor,
	literatureSourceLookup?: LiteratureSourceLookup,
	computationalExecutor?: ComputationalExecutor,
	activityCallbacks?: Pick<
		CoMathHarnessOptions,
		"onResearchWorkstreamActivityStart" | "onResearchWorkstreamActivityUpdate" | "onResearchWorkstreamActivityEnd"
	>,
): Promise<{
	dir: string;
	harness: CoMathHarness;
	notices: string[];
	statePath: string;
}> {
	const dir = await mkdtemp(join(tmpdir(), "comath-model-harness-"));
	const statePath = join(dir, ".pi", "co-math", "state.json");
	const notices: string[] = [];
	const harness = new CoMathHarness({
		statePath,
		notify: (message) => {
			notices.push(message);
		},
		runBackendCommand: async (command) => {
			if (command.startsWith("init ")) {
				await saveProjectState(
					statePath,
					createEmptyProjectState({
						projectId: "proj-test",
						title: command.slice("init ".length),
						rootQuestion: command.slice("init ".length),
						now: "2026-06-05T12:00:00.000Z",
					}),
				);
			}
			return OK;
		},
		researchModelExecutor: executor,
		...(literatureSourceLookup ? { literatureSourceLookup } : {}),
		...(computationalExecutor ? { computationalExecutor } : {}),
		...activityCallbacks,
	});
	return { dir, harness, notices, statePath };
}

async function waitForCondition(description: string, condition: () => boolean | Promise<boolean>): Promise<void> {
	for (let attempt = 0; attempt < 500; attempt += 1) {
		if (await condition()) {
			return;
		}
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});
	}
	throw new Error(`Timed out waiting for ${description}.`);
}

async function waitForProjectState(
	statePath: string,
	description: string,
	condition: (state: Awaited<ReturnType<typeof loadProjectState>>) => boolean,
): Promise<void> {
	await waitForCondition(description, async () => condition(await loadProjectState(statePath)));
}

async function loadRequiredProjectState(statePath: string) {
	const state = await loadProjectState(statePath);
	if (!state) {
		throw new Error("Expected co-math project state to exist.");
	}
	return state;
}

async function createCoordinatorHarnessFixture(input?: {
	state?: CoMathProjectState;
	executor?: ResearchWorkstreamModelExecutor;
}): Promise<{
	commands: string[];
	dir: string;
	harness: CoMathHarness;
	notices: string[];
	statePath: string;
}> {
	const dir = await mkdtemp(join(tmpdir(), "comath-coordinator-harness-"));
	const statePath = join(dir, ".pi", "co-math", "state.json");
	if (input?.state) {
		await saveProjectState(statePath, input.state);
	}
	const commands: string[] = [];
	const notices: string[] = [];
	const harness = new CoMathHarness({
		statePath,
		notify: (message) => {
			notices.push(message);
		},
		runBackendCommand: async (command) => {
			commands.push(command);
			return OK;
		},
		...(input?.executor ? { researchModelExecutor: input.executor } : {}),
	});
	return { commands, dir, harness, notices, statePath };
}

function createCoordinatorHarnessState(): CoMathProjectState {
	let state = createEmptyProjectState({
		projectId: "proj-test",
		title: "n^2 + 1 primes",
		rootQuestion: "Are there infinitely many primes of the form n^2 + 1?",
		now: "2026-06-05T12:00:00.000Z",
	});
	for (const path of [
		{
			title: "Small examples and counterexamples",
			objective: "Run bounded finite checks.",
			suggestedNextMove: "Use finite examples to guide proof attempts.",
			priority: 1,
		},
		{
			title: "Direct proof attempt",
			objective: "Try a direct proof using parity and congruences.",
			suggestedNextMove: "Use parity observations.",
			priority: 2,
		},
		{
			title: "Reformulation",
			objective: "Connect the problem to known conjectural frameworks.",
			suggestedNextMove: "Compare against prime-values-of-polynomials heuristics.",
			priority: 3,
		},
		{
			title: "Weaker special cases",
			objective: "Study bounded or restricted variants.",
			suggestedNextMove: "Try a weaker theorem.",
			priority: 4,
		},
		{
			title: "Known theorem or literature reduction",
			objective: "Find theorem references.",
			suggestedNextMove: "Find source-backed theorem statements.",
			priority: 5,
		},
	]) {
		state = addResearchPath(state, {
			...path,
			now: "2026-06-05T12:00:00.000Z",
			actor: "human",
		});
	}
	state = addComputationalArtifact(state, {
		pathId: "path-1",
		kind: "stdout",
		status: "completed",
		title: "Finite check output",
		exitCode: 0,
		summary: "checked_range: 1 <= n <= 20\nprime_values_found: 7",
		now: "2026-06-05T12:00:00.000Z",
		actor: "system",
	});
	state = addResearchWorkstreamReport(state, {
		pathId: "path-1",
		pathTitle: "Small examples and counterexamples",
		status: "completed",
		startedAt: "2026-06-05T12:00:00.000Z",
		completedAt: "2026-06-05T12:00:00.000Z",
		coordinatorBrief: "Choose a bounded finite check.",
		steps: [],
		promisingStrategy: ["Use examples to identify parity and congruence obstructions."],
		findings: ["checked_range: 1 <= n <= 20", "prime_values_found: 7"],
		criticisms: ["A finite computation does not prove an infinite claim."],
		gaps: ["A theorem-level proof is still open."],
		humanHelpUseful: [],
		suggestedNextMove: "Use the parity observation in a proof path.",
		workingPaperSectionTitle: "Examples and finite checks",
		computationalArtifactIds: ["computation-artifact-1"],
		now: "2026-06-05T12:00:00.000Z",
		actor: "synthesizer",
	});
	state = addLiteratureClaimSupport(state, {
		pathId: "path-5",
		claim: "Known theorems prove infinitely many primes of the form n^2 + 1.",
		sourceIds: [],
		status: "unsupported",
		note: "No source-backed theorem was available.",
		now: "2026-06-05T12:00:00.000Z",
		actor: "reviewer",
	});
	state = addResearchWorkstreamReport(state, {
		pathId: "path-5",
		pathTitle: "Known theorem or literature reduction",
		status: "blocked",
		startedAt: "2026-06-05T12:00:00.000Z",
		completedAt: "2026-06-05T12:00:00.000Z",
		coordinatorBrief: "Check exact source support.",
		steps: [],
		promisingStrategy: [],
		findings: [],
		criticisms: ["No source proves the needed theorem."],
		gaps: ["No source-backed theorem is available."],
		humanHelpUseful: ["Provide a reference for quadratic prime values."],
		suggestedNextMove: "Provide a source or use a reformulation path.",
		workingPaperSectionTitle: "Literature/theorem targets",
		claimSupportIds: ["claim-support-1"],
		now: "2026-06-05T12:00:00.000Z",
		actor: "synthesizer",
	});
	return state;
}

describe("co-math harness", () => {
	it("creates a research workspace for exploration prompts", async () => {
		const { commands, dir, harness, notices } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");

			const visible = notices.join("\n");
			expect(visible).toContain("Research workspace prepared");
			expect(visible).toContain("Path 1: Small examples and counterexamples");
			expect(visible).toContain("Small examples and counterexamples");
			expect(visible).toContain("Direct proof attempt");
			expect(visible).toContain("Next");
			expectProductCopy(visible);
			expect(commands).toEqual(["init Are there infinitely many primes of the form n^2 + 1?"]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("starts research exploration from a bare math question", async () => {
		const { commands, dir, harness, notices, statePath } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Are there infinitely many primes of the form n^2 + 1?");

			const state = await loadRequiredProjectState(statePath);
			expect(state.researchPaths.length).toBeGreaterThanOrEqual(5);
			expect(state.researchPaths[0]?.title).toBe("Small examples and counterexamples");
			const visible = notices.join("\n");
			expect(visible).toContain("This looks like a math research question");
			expect(visible).toContain("Research workspace prepared");
			expect(visible).toContain("continue path 1");
			expectProductCopy(visible);
			expect(commands).toEqual(["init Are there infinitely many primes of the form n^2 + 1?"]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("starts research exploration from natural help phrasing and strips the preamble", async () => {
		const { commands, dir, harness, notices, statePath } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Can you help me explore whether there are infinitely many twin primes?");

			const state = await loadRequiredProjectState(statePath);
			expect(state.researchPaths.length).toBeGreaterThanOrEqual(5);
			const visible = notices.join("\n");
			expect(visible).toContain("Research workspace prepared");
			expectProductCopy(visible);
			expect(commands).toEqual(["init there are infinitely many twin primes?"]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("does not create state for report/progress/state commands from a fresh workspace", async () => {
		for (const prompt of [
			"show report",
			"show latest report",
			"show progress",
			"status",
			"what are you doing?",
			"show research state",
			"show latest coordinator report",
		]) {
			const { commands, dir, harness, notices, statePath } = await createResearchHarnessFixture();
			try {
				await harness.handlePrompt(prompt);
				expect(await loadProjectState(statePath), prompt).toBeUndefined();
				expect(commands, prompt).toEqual([]);
				expect(notices.at(-1) ?? "", prompt).toContain("Start by asking a math question");
				expectProductCopy(notices.join("\n"));
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		}
	});

	it("does not create any state for help from a fresh workspace", async () => {
		const { commands, dir, harness, notices, statePath } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("help");
			expect(await loadProjectState(statePath)).toBeUndefined();
			expect(commands).toEqual([]);
			expect(notices.join("\n")).toContain("Pi math validation help");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("does not create state for source context before a research workspace exists", async () => {
		const { commands, dir, harness, notices, statePath } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt(
				"I found a reference: Schinzel's hypothesis H predicts prime values for suitable irreducible polynomials.",
			);

			expect(await loadProjectState(statePath)).toBeUndefined();
			expect(commands).toEqual([]);
			const visible = notices.join("\n");
			expect(visible).toContain("Start by asking a math research question");
			expect(visible).toContain("n^2 + 1");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("does not start research for exec/dev or non-math prose from a fresh workspace", async () => {
		for (const prompt of ["run tests", "run a quick sanity check", "report that this theorem is false"]) {
			const { dir, harness, notices, statePath } = await createResearchHarnessFixture();
			try {
				await harness.handlePrompt(prompt);
				const state = await loadProjectState(statePath);
				expect(state?.researchPaths ?? [], prompt).toEqual([]);
				expect(notices.join("\n"), prompt).not.toContain("Research workspace prepared");
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		}
	});

	it("does not create state for operational/dev prompts in a fresh workspace", async () => {
		for (const prompt of ["run tests", "run a quick sanity check", "show me the files", "what branch am I on?"]) {
			const { commands, dir, harness, notices, statePath } = await createResearchHarnessFixture();
			try {
				await harness.handlePrompt(prompt);
				expect(await loadProjectState(statePath), prompt).toBeUndefined();
				expect(commands, prompt).toEqual([]);
				const visible = notices.join("\n");
				expect(visible, prompt).toContain("Pi co-math is for mathematical validation and exploration.");
				expectProductCopy(visible);
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		}
	});

	it("creates a validation workspace for a clear math validation prompt in a fresh workspace", async () => {
		const { commands, dir, harness, notices, statePath } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Validate the claim: every even integer greater than 2 is a sum of two primes.");

			const state = await loadRequiredProjectState(statePath);
			expect(state.researchPaths).toEqual([]);
			expect(commands.some((command) => command.startsWith("init "))).toBe(true);
			const visible = notices.join("\n");
			expect(visible).not.toContain("Pi co-math is for mathematical validation and exploration.");
			expect(visible).not.toContain("Research workspace prepared");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("keeps validation behavior for a bare math question when a source is pinned", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const commands: string[] = [];
			const notices: string[] = [];
			const sourcePath = join(dir, "paper.pdf");
			const harness = new CoMathHarness({
				source: {
					input: sourcePath,
					absolutePath: sourcePath,
					displayName: "paper.pdf",
					exists: true,
					isFile: true,
				},
				statePath: join(dir, ".pi", "co-math", "state.json"),
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					commands.push(command);
					return OK;
				},
			});

			await harness.handlePrompt("Are there infinitely many primes of the form n^2 + 1?");

			const visible = notices.join("\n");
			expect(visible).not.toContain("Research workspace prepared");
			expect(visible).not.toContain("This looks like a math research question");
			expect(visible).toContain("source-backed validation run");
			expect(commands.some((command) => command.startsWith("init "))).toBe(true);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("waits for the problem after an incomplete exploration prompt", async () => {
		const { commands, dir, harness, notices } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem:");

			const visible = notices.join("\n");
			expect(visible).toContain("Describe the problem you want to explore.");
			expectProductCopy(visible);
			expect(commands).toEqual([]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("uses the next message as the pending exploration problem", async () => {
		const { commands, dir, harness, notices } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem:");
			await harness.handlePrompt("Are there infinitely many primes of the form n^2 + 1?");

			const visible = notices.join("\n");
			expect(visible).toContain("Research workspace prepared");
			expect(visible).toContain("Small examples and counterexamples");
			expect(visible).toContain("Direct proof attempt");
			expectProductCopy(visible);
			expect(commands).toEqual(["init Are there infinitely many primes of the form n^2 + 1?"]);
			expect(commands.some((command) => command.startsWith("workstream "))).toBe(false);
			expect(commands.some((command) => command.startsWith("queue workstream "))).toBe(false);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("keeps pending exploration through help and empty replies", async () => {
		const { commands, dir, harness, notices } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem:");
			await harness.handlePrompt(" ");
			await harness.handlePrompt("help");
			await harness.handlePrompt("Are there infinitely many primes of the form n^2 + 1?");

			const visible = notices.join("\n");
			expect(visible).toContain("Pi math validation help");
			expect(visible).toContain("Research workspace prepared");
			expectProductCopy(visible);
			expect(commands).toEqual(["init Are there infinitely many primes of the form n^2 + 1?"]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("extracts the problem from a complete exploration prompt while pending", async () => {
		const { commands, dir, harness } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem:");
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");

			expect(commands).toEqual(["init Are there infinitely many primes of the form n^2 + 1?"]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("can cancel pending exploration before validation", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const commands: string[] = [];
			const notices: string[] = [];
			const harness = new CoMathHarness({
				statePath: join(dir, ".pi", "co-math", "state.json"),
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					commands.push(command);
					return OK;
				},
			});

			await harness.handlePrompt("Explore this problem:");
			await harness.handlePrompt("cancel");
			await harness.handlePrompt("Validate Question 3.");

			const visible = notices.join("\n");
			expect(visible).toContain("Exploration setup cancelled.");
			expect(visible).toContain("I’ll set up a source-backed validation run for: Validate Question 3.");
			expect(commands).toContain("init Validate Question 3.");
			expect(commands.some((command) => command.startsWith("workstream "))).toBe(true);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("steers existing research paths naturally", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-research-harness-"));
		try {
			const statePath = join(dir, ".pi", "co-math", "state.json");
			const notices: string[] = [];
			const harness = new CoMathHarness({
				statePath,
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					if (command.startsWith("init ")) {
						await saveProjectState(
							statePath,
							createEmptyProjectState({
								projectId: "proj-test",
								title: command.slice("init ".length),
								rootQuestion: command.slice("init ".length),
								now: "2026-06-05T12:00:00.000Z",
							}),
						);
					}
					return OK;
				},
			});

			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("summarize current state");
			await harness.handlePrompt("focus on counterexamples");
			await harness.handlePrompt("drop the direct proof path");
			await harness.handlePrompt("try a weaker theorem");
			await harness.handlePrompt("continue");

			const visible = notices.join("\n");
			expect(visible).toContain("Current research state");
			expect(visible).toContain("Focus updated");
			expect(visible).toContain("Small examples and counterexamples");
			expect(visible).toContain("Path updated");
			expect(visible).toContain("Direct proof attempt");
			expect(visible).toContain("Weaker special cases");
			expect(visible).toContain("Research run completed");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("focuses numbered research paths", async () => {
		const { dir, harness, notices, statePath } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("focus on path 2");

			const state = await loadRequiredProjectState(statePath);
			expect(state.researchPaths[1]?.title).toBe("Direct proof attempt");
			expect(state.researchFocus?.pathIds).toEqual([state.researchPaths[1]?.id]);
			const visible = notices.join("\n");
			expect(visible).toContain("Focus updated");
			expect(visible).toContain("Direct proof attempt");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("drops numbered research paths", async () => {
		const { dir, harness, notices, statePath } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("drop path 2");

			const state = await loadRequiredProjectState(statePath);
			expect(state.researchPaths[1]?.title).toBe("Direct proof attempt");
			expect(state.researchPaths[1]?.status).toBe("abandoned");
			const visible = notices.join("\n");
			expect(visible).toContain("Path updated");
			expect(visible).toContain("Direct proof attempt");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("continues numbered research paths instead of the focused path", async () => {
		const { dir, harness, notices, statePath } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("continue path 2");

			const state = await loadRequiredProjectState(statePath);
			expect(state.researchPaths[0]?.title).toBe("Small examples and counterexamples");
			expect(state.researchPaths[0]?.latestFindings).toEqual([]);
			expect(state.researchPaths[1]?.title).toBe("Direct proof attempt");
			expect(state.researchPaths[1]?.latestFindings.join("\n")).toContain("Euclid-style argument is not immediate");
			expect(state.researchPaths[1]?.latestFindings.join("\n")).not.toContain("n = 1 gives 2, prime");
			const visible = notices.join("\n");
			expect(visible).toContain("Research run completed");
			expect(visible).toContain("Direct proof attempt");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("warns for missing numbered research paths without continuing another path", async () => {
		const { dir, harness, notices, statePath } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("continue path 99");

			const state = await loadRequiredProjectState(statePath);
			expect(state.researchPaths.every((path) => path.latestFindings.length === 0)).toBe(true);
			expect(state.researchReports).toEqual([]);
			const lastNotice = notices[notices.length - 1] ?? "";
			expect(lastNotice).toContain("I could not find a matching active research path to continue.");
			expect(lastNotice).not.toContain("Research round completed");
			expectProductCopy(lastNotice);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("continues named research paths naturally", async () => {
		const { dir, harness, statePath } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("continue the counterexample path");

			const state = await loadRequiredProjectState(statePath);
			expect(state.researchPaths[0]?.title).toBe("Small examples and counterexamples");
			expect(state.researchPaths[0]?.latestFindings.join("\n")).toContain("n = 1 gives 2, prime");
			expect(state.researchPaths[1]?.latestFindings).toEqual([]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("routes natural beginner continuation phrasings to the first path", async () => {
		const phrasings = [
			"please continue path 1",
			"please continue with path 1",
			"continue with path 1",
			"run path 1",
			"please run path 1",
			"start path 1",
			"please start path 1",
			"try path 1",
			"continue the first path",
			"please continue the first path",
			"run the first path",
			"start the first path",
			"try the first path",
		];
		for (const phrasing of phrasings) {
			const { dir, harness, notices, statePath } = await createResearchHarnessFixture();
			try {
				await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
				await harness.handlePrompt(phrasing);

				const state = await loadRequiredProjectState(statePath);
				expect(state.researchPaths[0]?.title, phrasing).toBe("Small examples and counterexamples");
				expect(state.researchPaths[0]?.latestFindings.join("\n"), phrasing).toContain("n = 1 gives 2, prime");
				expect(state.researchPaths[1]?.latestFindings, phrasing).toEqual([]);
				const visible = notices.join("\n");
				expect(visible, phrasing).toContain("Research run completed");
				expectProductCopy(visible);
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		}
	});

	it("warns when a beginner continuation phrasing names a missing path", async () => {
		const { dir, harness, notices, statePath } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("please run path 99");

			const state = await loadRequiredProjectState(statePath);
			expect(state.researchPaths.every((path) => path.latestFindings.length === 0)).toBe(true);
			expect(state.researchReports).toEqual([]);
			const lastNotice = notices[notices.length - 1] ?? "";
			expect(lastNotice).toContain("I could not find a matching active research path to continue.");
			expect(lastNotice).not.toContain("Research run completed");
			expectProductCopy(lastNotice);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("does not treat unrelated run/start/try prompts as a path continuation", async () => {
		const { dir, harness, notices, statePath } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			notices.length = 0;
			await harness.handlePrompt("run a quick sanity check on my own proof");

			const state = await loadRequiredProjectState(statePath);
			expect(state.researchPaths.every((path) => path.latestFindings.length === 0)).toBe(true);
			expect(state.researchReports).toEqual([]);
			const visible = notices.join("\n");
			expect(visible).toContain("Current research state");
			expect(visible).not.toContain("Research run completed");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("continues the examples path with findings, uncertainty, and working-paper notes", async () => {
		const { dir, harness, notices, statePath } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("continue path 1");
			await harness.handlePrompt("summarize current state");

			const state = await loadRequiredProjectState(statePath);
			const findings = state.researchPaths[0]?.latestFindings.join("\n") ?? "";
			expect(findings).toContain("n = 1 gives 2, prime");
			expect(findings).toContain("n = 3 gives 10, not prime");
			expect(state.researchPaths[0]?.suggestedNextMove).toContain("parity");
			expect(state.researchPaths[0]?.blockers.join("\n")).toContain("do not prove or disprove infinitude");
			expect(state.workingPaperSections.some((section) => section.title.includes("Examples"))).toBe(true);
			expect(state.marginNotes.length).toBeGreaterThan(0);

			// A first-class human-scrutiny note is created from report uncertainty and linked to the section.
			const scrutiny = state.marginNotes.find((note) => note.kind === "scrutiny");
			expect(scrutiny).toBeDefined();
			expect(scrutiny?.status).toBe("open");
			const examplesSection = state.workingPaperSections.find((section) => section.title.includes("Examples"));
			expect(scrutiny?.sectionId).toBe(examplesSection?.id);
			expect(examplesSection?.marginNoteIds).toContain(scrutiny?.id);

			const visible = notices.join("\n");
			expect(visible).toContain("Research run completed");
			expect(visible).toContain("Path 1: Small examples and counterexamples");
			expect(visible).toContain("Promising strategy");
			expect(visible).toContain("Review");
			expect(visible).toContain("Gap");
			expect(visible).toContain("Working paper updated");
			expect(visible).toContain("Latest findings");
			expect(visible).toContain("n = 10 gives 101, prime");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("creates a durable research workstream report with curated progress for continue path 2", async () => {
		const { dir, harness, notices, statePath } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("continue path 2");

			const state = await loadRequiredProjectState(statePath);
			expect(state.researchReports.length).toBe(1);
			const report = state.researchReports[0];
			expect(report?.kind).toBe("research_workstream");
			expect(report?.pathTitle).toBe("Direct proof attempt");
			expect(report?.status).toBe("completed");
			expect(report?.steps.map((step) => step.role)).toEqual(["coordinator", "specialist", "critic", "synthesizer"]);
			expect(report?.promisingStrategy.join("\n")).toContain("4m^2 + 1");
			expect(report?.gaps.join("\n")).toContain("infinitely many even n");
			expect(report?.workingPaperSectionId).toBeTruthy();

			const visible = notices.join("\n");
			expect(visible).toContain("Research workstream started");
			expect(visible).toContain("Research run completed");
			expect(visible).toContain("Promising strategy");
			expect(visible).toContain("Review");
			expect(visible).toContain("Gap");
			expect(visible).toContain("Working paper updated");
			expect(visible).toContain("show latest report");
			expect(visible).not.toMatch(/role-run-|workstream-|artifact-|schema|queue/i);
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("shows coordinator, specialist, critic, and synthesis sections for show latest report", async () => {
		const { dir, harness, notices, statePath } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("continue path 2");
			const before = notices.length;
			await harness.handlePrompt("show latest report");

			const reportVisible = notices.slice(before).join("\n");
			expect(reportVisible).toContain("Latest research report");
			expect(reportVisible).toContain("Path 2: Direct proof attempt");
			expect(reportVisible).toContain("Coordinator brief");
			expect(reportVisible).toContain("Specialist attempt");
			expect(reportVisible).toContain("Critic review");
			expect(reportVisible).toContain("Synthesis");
			expect(reportVisible).toContain("Next");
			expect(reportVisible).toContain("Euclid-style construction does not immediately preserve the form n^2 + 1");
			expect(reportVisible).not.toMatch(/role-run-|workstream-|artifact-|schema|queue/i);
			expectProductCopy(reportVisible);

			const state = await loadRequiredProjectState(statePath);
			expect(state.researchReports.length).toBe(1);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("shows a per-path detailed report after continuing that path", async () => {
		const { dir, harness, notices } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("continue path 5");
			const before = notices.length;
			await harness.handlePrompt("show details for path 5");

			const reportVisible = notices.slice(before).join("\n");
			expect(reportVisible).toContain("Latest research report");
			expect(reportVisible).toContain("Path 5: Known theorem or literature reduction");
			expect(reportVisible).toContain("Critic review");
			expect(reportVisible).toContain("source-backed literature check");
			expect(reportVisible).toContain("Human help useful");
			expectProductCopy(reportVisible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("makes Path 3 and Path 4 actionable in the product flow", async () => {
		const { dir, harness, notices, statePath } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("continue path 3");
			await harness.handlePrompt("summarize current state");
			await harness.handlePrompt("continue path 4");
			await harness.handlePrompt("summarize current state");

			const state = await loadRequiredProjectState(statePath);
			const path3 = state.researchPaths[2];
			const path4 = state.researchPaths[3];
			expect(path3?.latestFindings.join("\n")).toContain("Polynomial prime values");
			expect(path3?.latestFindings.join("\n")).toContain("4m^2 + 1");
			expect(path3?.latestFindings.join("\n")).toContain("not a proof");
			expect(path4?.latestFindings.join("\n")).toContain("Parity obstruction");
			expect(path4?.latestFindings.join("\n")).toContain("Status: proved");
			expect(path4?.latestFindings.join("\n")).toContain("computational evidence only");
			expect(path4?.latestFindings.join("\n")).toContain("Small-prime obstructions");

			const visible = notices.join("\n");
			expect(visible).toContain("Path 3: Reformulation");
			expect(visible).toContain("Turn this into smaller targets:");
			expect(visible).toContain("continue path 4");
			expect(visible).toContain("Path 4: Weaker special cases");
			expect(visible).toContain("Use these lemmas in a proof attempt:");
			expect(visible).toContain("continue path 2");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("explains when no detailed report exists yet", async () => {
		const { dir, harness, notices } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("show latest report");
			await harness.handlePrompt("show details for path 3");

			const visible = notices.join("\n");
			expect(visible).toContain("No research report is available yet. Continue a path first.");
			expect(visible).toContain(
				'No detailed report has been recorded for Path 3 yet. Say "continue path 3" to run one.',
			);
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("mentions report availability in the research state summary", async () => {
		const { dir, harness, notices } = await createResearchHarnessFixture();
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("continue path 2");
			const before = notices.length;
			await harness.handlePrompt("summarize current state");

			const visible = notices.slice(before).join("\n");
			expect(visible).toContain('Report: available; say "show details for path 2".');
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("creates and displays a project coordinator report from current research state", async () => {
		const requests: ResearchWorkstreamModelRequest[] = [];
		const executor: ResearchWorkstreamModelExecutor = {
			run: async (request) => {
				requests.push(request);
				return {
					text: [
						"## What we know",
						"- The finite check found examples but does not prove infinitude.",
						"- The literature path has no source-backed theorem yet.",
						"## Roadblocks",
						"- A theorem-level proof is still missing.",
						"- Source support is still missing for the literature route.",
						"## Recommended next moves",
						"- Path 3: Reformulation - Connect finite patterns to prime-values-of-polynomials heuristics.",
						"- Path 2: Direct proof attempt - Use parity observations from the finite check.",
						"## Human help useful",
						"- Provide a reference for quadratic prime values.",
						"## Suggested next step",
						"- continue path 3",
					].join("\n"),
				};
			},
		};
		const { dir, harness, notices, statePath } = await createCoordinatorHarnessFixture({
			state: createCoordinatorHarnessState(),
			executor,
		});
		try {
			await harness.handlePrompt("what should we try next?");

			const state = await loadRequiredProjectState(statePath);
			expect(requests).toHaveLength(1);
			expect(requests[0]?.prompt).toContain("A theorem-level proof is still open.");
			expect(state.researchCoordinatorReports).toHaveLength(1);
			expect(state.researchCoordinatorReports[0]).toMatchObject({
				id: "coordinator-report-1",
				suggestedPathId: "path-3",
				suggestedPrompt: "continue path 3",
				inputReportIds: ["research-report-1", "research-report-2"],
				inputComputationalArtifactIds: ["computation-artifact-1"],
			});
			expect(state.workingPaperSections.some((section) => section.title === "Project coordinator synthesis")).toBe(
				true,
			);
			expect(state.marginNotes.some((note) => note.message === "Suggested next step: continue path 3")).toBe(true);

			const visible = notices.join("\n");
			expect(visible).toContain("Project coordinator summary");
			expect(visible).toContain("What we know");
			expect(visible).toContain("Current roadblocks");
			expect(visible).toContain("Recommended next moves");
			expect(visible).toContain("Continue Path 3: Reformulation");
			expect(visible).toContain("Suggested next step\ncontinue path 3");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("shows the latest project coordinator report without creating a duplicate", async () => {
		const { dir, harness, notices, statePath } = await createCoordinatorHarnessFixture({
			state: createCoordinatorHarnessState(),
		});
		try {
			await harness.handlePrompt("what should we try next?");
			const beforeShow = notices.length;
			await harness.handlePrompt("show latest coordinator report");

			const state = await loadRequiredProjectState(statePath);
			expect(state.researchCoordinatorReports).toHaveLength(1);
			const visible = notices.slice(beforeShow).join("\n");
			expect(visible).toContain("Project coordinator summary");
			expect(visible).toContain("Suggested next step");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("asks to start exploration before coordinator prompts in an empty workspace", async () => {
		const { commands, dir, harness, notices, statePath } = await createCoordinatorHarnessFixture();
		try {
			await harness.handlePrompt("what next?");

			expect(commands).toEqual([]);
			expect(await loadProjectState(statePath)).toBeUndefined();
			expect(notices.join("\n")).toContain("Start by asking a math question");
			expectProductCopy(notices.join("\n"));
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("mentions active research runs in coordinator summaries without blocking synthesis", async () => {
		const requests: ResearchWorkstreamModelRequest[] = [];
		const pending: Array<(response: { text: string }) => void> = [];
		const executor: ResearchWorkstreamModelExecutor = {
			run: async (request) => {
				requests.push(request);
				if (request.prompt.includes("project coordinator")) {
					return {
						text: [
							"## What we know",
							"- Path 2: Direct proof attempt is still running at specialist attempt.",
							"## Roadblocks",
							"- The active path has no final report yet.",
							"## Recommended next moves",
							"- Path 3: Reformulation - Keep another route ready after the active path reports.",
							"## Suggested next step",
							"- continue path 3",
						].join("\n"),
					};
				}
				return new Promise((resolve) => {
					pending.push(resolve);
				});
			},
		};
		const { dir, harness, notices, statePath } = await createModelHarnessFixture(executor);
		const resolveNext = (text: string) => {
			const resolve = pending.shift();
			if (!resolve) {
				throw new Error("No pending model request to resolve.");
			}
			resolve({ text });
		};
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many twin primes?");
			await harness.handlePrompt("continue path 2");
			await waitForProjectState(statePath, "active research run", (state) =>
				Boolean(state?.researchWorkstreamRuns[0]?.status === "running"),
			);
			await waitForCondition("specialist request before coordinator summary", () => requests.length >= 1);
			await harness.handlePrompt("what is blocked?");

			const nextState = await loadRequiredProjectState(statePath);
			expect(nextState.researchCoordinatorReports).toHaveLength(1);
			expect(nextState.researchWorkstreamRuns[0]?.status).toBe("running");
			expect(requests[1]?.prompt).toContain("Path 2: Direct proof attempt: running");
			const visible = notices.join("\n");
			expect(visible).toContain("Project coordinator summary");
			expect(visible).toContain("Path 2: Direct proof attempt is still running");
			expectProductCopy(visible);

			resolveNext(TWIN_PRIME_MODEL_RESPONSES.specialist);
			await waitForCondition("critic request after coordinator summary", () =>
				requests.some((request) => request.role === "critic"),
			);
			resolveNext(TWIN_PRIME_MODEL_RESPONSES.critic);
			await waitForCondition(
				"final synthesizer request after coordinator summary",
				() => requests.filter((request) => request.role === "synthesizer").length >= 2,
			);
			resolveNext(TWIN_PRIME_MODEL_RESPONSES.synthesizer);
			await waitForProjectState(statePath, "completed active run after coordinator summary", (state) =>
				Boolean(state?.researchWorkstreamRuns[0]?.status === "completed"),
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("keeps show latest report scoped to research reports after coordinator summaries", async () => {
		const { dir, harness, notices, statePath } = await createCoordinatorHarnessFixture({
			state: createCoordinatorHarnessState(),
		});
		try {
			await harness.handlePrompt("what should we try next?");
			const beforeReport = notices.length;
			await harness.handlePrompt("show latest report");

			const state = await loadRequiredProjectState(statePath);
			expect(state.researchCoordinatorReports).toHaveLength(1);
			expect(state.researchReports).toHaveLength(2);
			const visible = notices.slice(beforeReport).join("\n");
			expect(visible).toContain("Latest research report");
			expect(visible).toContain("Known theorem or literature reduction");
			expect(visible).not.toContain("Project coordinator summary");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("starts model-backed research workstreams in the background and exposes active progress", async () => {
		const deferred = createDeferredExecutor();
		const { dir, harness, notices, statePath } = await createModelHarnessFixture(deferred.executor);
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many twin primes?");
			await harness.handlePrompt("continue path 2");

			await waitForProjectState(statePath, "active research run", (state) =>
				Boolean(state?.researchWorkstreamRuns.some((run) => run.status === "running")),
			);
			let state = await loadRequiredProjectState(statePath);
			expect(state.researchReports).toEqual([]);
			expect(state.researchWorkstreamRuns).toHaveLength(1);
			expect(state.researchWorkstreamRuns[0]?.pathTitle).toBe("Direct proof attempt");
			expect(notices.join("\n")).toContain("Research workstream running in the background");

			await waitForCondition("specialist request", () => deferred.requests.length >= 1);
			expect(notices.join("\n")).toContain("Research update");
			expect(notices.join("\n")).toContain("Pi is still working in the background.");
			expect(notices.join("\n")).toContain("Trying the research path");
			const beforeProgress = notices.length;
			await harness.handlePrompt("show progress");
			await harness.handlePrompt("show latest report");
			const activeVisible = notices.slice(beforeProgress).join("\n");
			expect(activeVisible).toContain("Research workstream running");
			expect(activeVisible).toContain("Trying the research path");
			expect(activeVisible).toContain("Report: not ready yet");
			expect(activeVisible).toContain("Latest research report is still running");
			expect(activeVisible).toContain("Incremental reports");
			expectProductCopy(activeVisible);

			const beforeSecondContinue = notices.length;
			await harness.handlePrompt("continue path 1");
			expect(notices.slice(beforeSecondContinue).join("\n")).toContain("already running on Path 2");
			expect(deferred.requests).toHaveLength(1);

			deferred.resolveNext(TWIN_PRIME_MODEL_RESPONSES.specialist);
			await waitForCondition("critic request", () => deferred.requests.length >= 2);
			await waitForProjectState(statePath, "specialist report", (candidate) =>
				Boolean(
					candidate?.researchWorkstreamRuns[0]?.incrementalReports.some(
						(report) => report.stage === "specialist" && report.status === "completed",
					),
				),
			);

			deferred.resolveNext(TWIN_PRIME_MODEL_RESPONSES.critic);
			await waitForCondition("synthesizer request", () => deferred.requests.length >= 3);
			deferred.resolveNext(TWIN_PRIME_MODEL_RESPONSES.synthesizer);
			await waitForProjectState(statePath, "completed research run", (candidate) =>
				Boolean(candidate?.researchWorkstreamRuns[0]?.status === "completed"),
			);

			state = await loadRequiredProjectState(statePath);
			expect(state.researchWorkstreamRuns[0]?.finalReportId).toBe("research-report-1");
			expect(state.researchWorkstreamRuns[0]?.incrementalReports.map((report) => report.stage)).toEqual([
				"coordinator",
				"specialist",
				"specialist",
				"critic",
				"critic",
				"synthesizer",
				"synthesizer",
			]);
			expect(state.researchReports).toHaveLength(1);
			expect(notices.join("\n")).toContain("Research run completed");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("emits activity callbacks for async research run start, stage update, and completion", async () => {
		const deferred = createDeferredExecutor();
		const activityEvents: string[] = [];
		const { dir, harness, statePath } = await createModelHarnessFixture(deferred.executor, undefined, undefined, {
			onResearchWorkstreamActivityStart: ({ run }) => {
				activityEvents.push(`start:${run.id}:${run.currentStage}`);
			},
			onResearchWorkstreamActivityUpdate: ({ run, stage }) => {
				activityEvents.push(`update:${run.id}:${stage}`);
			},
			onResearchWorkstreamActivityEnd: ({ runId }) => {
				activityEvents.push(`end:${runId}`);
			},
		});
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many twin primes?");
			await harness.handlePrompt("continue path 2");

			expect(activityEvents[0]).toBe("start:research-run-1:coordinator");
			await waitForCondition("specialist activity update", () =>
				activityEvents.includes("update:research-run-1:specialist"),
			);

			deferred.resolveNext(TWIN_PRIME_MODEL_RESPONSES.specialist);
			await waitForCondition("critic request", () => deferred.requests.length >= 2);
			await waitForCondition("critic activity update", () =>
				activityEvents.includes("update:research-run-1:critic"),
			);
			deferred.resolveNext(TWIN_PRIME_MODEL_RESPONSES.critic);
			await waitForCondition("synthesizer request", () => deferred.requests.length >= 3);
			await waitForCondition("synthesizer activity update", () =>
				activityEvents.includes("update:research-run-1:synthesizer"),
			);
			deferred.resolveNext(TWIN_PRIME_MODEL_RESPONSES.synthesizer);
			await waitForProjectState(statePath, "completed research run activity", (state) =>
				Boolean(state?.researchWorkstreamRuns[0]?.status === "completed"),
			);

			expect(activityEvents).toContain("update:research-run-1:coordinator");
			expect(activityEvents.at(-1)).toBe("end:research-run-1");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("does not create a research run for a bad path number", async () => {
		const deferred = createDeferredExecutor();
		const { dir, harness, statePath } = await createModelHarnessFixture(deferred.executor);
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many twin primes?");
			await harness.handlePrompt("continue path 99");

			const state = await loadRequiredProjectState(statePath);
			expect(state.researchWorkstreamRuns).toEqual([]);
			expect(state.researchReports).toEqual([]);
			expect(deferred.requests).toEqual([]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("clears activity callbacks when a research run blocks", async () => {
		const deferredLookup = createDeferredLiteratureLookup();
		const deferredExecutor = createDeferredExecutor();
		const activityEvents: string[] = [];
		const { dir, harness, statePath } = await createModelHarnessFixture(
			deferredExecutor.executor,
			deferredLookup.lookup,
			undefined,
			{
				onResearchWorkstreamActivityStart: ({ run }) => {
					activityEvents.push(`start:${run.id}`);
				},
				onResearchWorkstreamActivityUpdate: ({ run, stage }) => {
					activityEvents.push(`update:${run.id}:${stage}`);
				},
				onResearchWorkstreamActivityEnd: ({ runId }) => {
					activityEvents.push(`end:${runId}`);
				},
			},
		);
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many twin primes?");
			await harness.handlePrompt("continue path 5");
			await waitForProjectState(statePath, "literature-search running", (state) =>
				Boolean(state?.researchWorkstreamRuns[0]?.currentStage === "literature-search"),
			);
			expect(activityEvents).toContain("update:research-run-1:literature-search");

			deferredLookup.resolveNext([]);
			await waitForProjectState(statePath, "blocked literature activity cleanup", (state) =>
				Boolean(state?.researchWorkstreamRuns[0]?.status === "blocked"),
			);

			expect(activityEvents.at(-1)).toBe("end:research-run-1");
			expect(deferredExecutor.requests).toEqual([]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("shows literature-search progress while source lookup is pending", async () => {
		const deferredLookup = createDeferredLiteratureLookup();
		const deferredExecutor = createDeferredExecutor();
		const { dir, harness, notices, statePath } = await createModelHarnessFixture(
			deferredExecutor.executor,
			deferredLookup.lookup,
		);
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many twin primes?");
			await harness.handlePrompt("continue path 5");
			await waitForProjectState(statePath, "literature-search running", (state) =>
				Boolean(state?.researchWorkstreamRuns[0]?.currentStage === "literature-search"),
			);

			const before = notices.length;
			await harness.handlePrompt("show progress");
			const visible = notices.slice(before).join("\n");
			expect(visible).toContain("Research workstream running");
			expect(visible).toContain("Path 5: Known theorem or literature reduction");
			expect(visible).toContain("Searching references");
			expect(visible).toContain("Literature specialist is looking for relevant sources.");
			expect(deferredExecutor.requests).toEqual([]);
			expectProductCopy(visible);

			deferredLookup.resolveNext([]);
			await waitForProjectState(statePath, "blocked no-source literature lookup", (state) =>
				Boolean(state?.researchWorkstreamRuns[0]?.status === "blocked"),
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("routes known-theorem paths to a source-backed literature workstream", async () => {
		const { executor, requests } = createTwinPrimeLiteratureExecutor();
		const { lookup, queries } = createLiteratureLookup(TWIN_PRIME_LITERATURE_SOURCES);
		const { dir, harness, notices, statePath } = await createModelHarnessFixture(executor, lookup);
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many twin primes?");
			await harness.handlePrompt("continue path 5");
			await waitForProjectState(statePath, "completed literature report", (state) =>
				Boolean(state?.researchWorkstreamRuns[0]?.status === "completed"),
			);

			const state = await loadRequiredProjectState(statePath);
			expect(queries[0]).toContain("Known theorem or literature reduction");
			expect(requests.map((request) => request.role)).toEqual(["specialist", "critic", "synthesizer"]);
			expect(requests[0]?.prompt).toContain("[source-1] Twin prime conjecture status note");
			expect(state.literatureSources).toMatchObject([
				{ id: "source-1", title: "Twin prime conjecture status note" },
				{ id: "source-2", title: "Bounded gaps between primes" },
			]);
			expect(state.literatureClaimSupports.length).toBeGreaterThan(0);
			expect(state.researchReports[0]).toMatchObject({
				pathTitle: "Known theorem or literature reduction",
				sourceIds: ["source-1", "source-2"],
			});
			expect(state.researchReports[0]?.claimSupportIds.length).toBeGreaterThan(0);

			const visible = notices.join("\n");
			expect(visible).toContain("Literature specialist is looking for relevant known theorems and references.");
			expect(visible).toContain("References");
			expect(visible).toContain("Twin prime conjecture status note");
			expect(visible).not.toContain("source-1: Twin prime conjecture status note");
			expect(visible).not.toContain("[source-1]");
			expect(visible).toContain("Bounded prime gaps are known but do not imply gaps exactly 2");
			expectProductCopy(visible);

			const before = notices.length;
			await harness.handlePrompt("show latest report");
			const report = notices.slice(before).join("\n");
			expect(report).toContain("Literature findings");
			expect(report).toContain("Source-support review");
			expect(report).toContain("References / attachments");
			expect(report).toContain("source-1: Twin prime conjecture status note");
			expect(report).toContain("supported:");
			expectProductCopy(report);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("uses a safe no-source literature fallback without fake citations", async () => {
		const { executor, requests } = createTwinPrimeLiteratureExecutor();
		const { lookup } = createLiteratureLookup([]);
		const { dir, harness, notices, statePath } = await createModelHarnessFixture(executor, lookup);
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many twin primes?");
			await harness.handlePrompt("continue path 5");
			await waitForProjectState(statePath, "blocked no-source literature report", (state) =>
				Boolean(state?.researchWorkstreamRuns[0]?.status === "blocked"),
			);

			const state = await loadRequiredProjectState(statePath);
			expect(requests).toEqual([]);
			expect(state.literatureSources).toEqual([]);
			expect(state.literatureClaimSupports).toMatchObject([
				{
					status: "unsupported",
					sourceIds: [],
				},
			]);
			expect(state.researchReports[0]).toMatchObject({
				status: "blocked",
				sourceIds: [],
			});
			const visible = notices.join("\n");
			expect(visible).toContain("No source lookup backend returned references for this path.");
			expect(visible).toContain("No source-backed theorem claim is established for this path yet.");
			expect(visible).toContain("what should we try next?");
			expect(visible).toContain("unsupported:");
			expect(visible).not.toContain("Chen");
			expect(visible).not.toContain("Maynard");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("registers user-provided Path 5 sources after research workspace setup", async () => {
		const { executor } = createNSquaredLiteratureExecutor();
		const { dir, harness, notices, statePath } = await createModelHarnessFixture(executor);
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			const before = notices.length;
			await harness.handlePrompt(
				"I found a reference: Schinzel's hypothesis H predicts prime values for suitable irreducible polynomials, but this is conjectural and not an unconditional theorem.",
			);
			await harness.handlePrompt(
				"Literature note: Landau-style problem lists treat primes of the form n^2 + 1 as unresolved.",
			);

			const state = await loadRequiredProjectState(statePath);
			expect(state.literatureSources).toHaveLength(2);
			expect(state.literatureSources[0]).toMatchObject({
				kind: "user-provided",
				title: expect.stringContaining("Schinzel's hypothesis H predicts prime values"),
				summary: expect.stringContaining("Schinzel's hypothesis H predicts prime values"),
				extractedText: expect.stringContaining("not an unconditional theorem"),
			});
			expect(state.literatureSources[1]).toMatchObject({
				kind: "user-provided",
				title: expect.stringContaining("Landau-style problem lists"),
			});
			const visible = notices.slice(before).join("\n");
			expect(visible).toContain("Registered source context for Path 5");
			expect(visible).toContain("Next command");
			expect(visible).toContain("continue path 5");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("records unsupported n^2 + 1 Path 5 status when no source backend is available", async () => {
		const { executor, requests } = createNSquaredLiteratureExecutor();
		const { dir, harness, notices, statePath } = await createModelHarnessFixture(executor);
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("continue path 5");
			await waitForProjectState(statePath, "blocked default no-source literature report", (state) =>
				Boolean(state?.researchWorkstreamRuns[0]?.status === "blocked"),
			);

			const state = await loadRequiredProjectState(statePath);
			expect(requests).toEqual([]);
			expect(state.literatureSources).toEqual([]);
			expect(state.literatureClaimSupports).toMatchObject([
				{
					status: "unsupported",
					sourceIds: [],
					claim: "No source-backed theorem claim is established for this path yet.",
				},
			]);
			expect(state.researchReports[0]).toMatchObject({
				pathTitle: "Known theorem or literature reduction",
				status: "blocked",
				sourceIds: [],
				claimSupportIds: ["claim-support-1"],
			});
			const visible = notices.join("\n");
			expect(visible).toContain("No source was available");
			expect(visible).toContain("Bunyakovsky-type conjectures");
			expect(visible).toContain("search targets only");
			expect(visible).toContain("No unconditional proof");
			expect(visible).toContain("what should we try next?");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("uses registered Path 5 sources for source-backed claim classification", async () => {
		const { executor, requests } = createNSquaredLiteratureExecutor();
		const { dir, harness, notices, statePath } = await createModelHarnessFixture(executor);
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt(
				"I found a reference: Schinzel's hypothesis H predicts prime values for suitable irreducible polynomials, but this is conjectural and not an unconditional theorem.",
			);
			await harness.handlePrompt("continue path 5");
			await waitForProjectState(statePath, "completed registered-source literature report", (state) =>
				Boolean(state?.researchWorkstreamRuns[0]?.status === "completed"),
			);

			const state = await loadRequiredProjectState(statePath);
			expect(requests.map((request) => request.role)).toEqual(["specialist", "critic", "synthesizer"]);
			expect(requests[0]?.prompt).toContain("[source-1] Schinzel's hypothesis H predicts prime values");
			expect(requests[0]?.prompt).toContain("Extract: Schinzel's hypothesis H predicts prime values");
			expect(state.literatureSources).toHaveLength(1);
			expect(state.researchReports[0]).toMatchObject({
				pathTitle: "Known theorem or literature reduction",
				status: "completed",
				sourceIds: ["source-1"],
			});
			expect(state.researchReports[0]?.claimSupportIds.length).toBeGreaterThanOrEqual(2);
			expect(state.literatureClaimSupports).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						status: "partially-supported",
						sourceIds: ["source-1"],
						claim: expect.stringContaining("conjectural prime-values-of-polynomials framing"),
					}),
					expect.objectContaining({
						status: "unsupported",
						sourceIds: [],
						claim: expect.stringContaining("unconditional proof"),
					}),
				]),
			);
			const visible = notices.join("\n");
			expect(visible).toContain("Registered source context for Path 5");
			expect(visible).not.toContain("No source was available");
			expect(visible).toContain("partially-supported:");
			expect(visible).toContain("unsupported:");
			expect(visible).not.toContain("[source-1]");
			expect(visible).not.toMatch(/^-\s+supported:.*infinitely many primes of the form n\^2 \+ 1/im);
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("records source-backed and unsupported n^2 + 1 Path 5 claim supports", async () => {
		const { executor, requests } = createNSquaredLiteratureExecutor();
		const { lookup } = createLiteratureLookup(N_SQUARED_LITERATURE_SOURCES);
		const { dir, harness, notices, statePath } = await createModelHarnessFixture(executor, lookup);
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("continue path 5");
			await waitForProjectState(statePath, "completed source-backed n squared literature report", (state) =>
				Boolean(state?.researchWorkstreamRuns[0]?.status === "completed"),
			);

			const state = await loadRequiredProjectState(statePath);
			expect(requests.map((request) => request.role)).toEqual(["specialist", "critic", "synthesizer"]);
			expect(requests[0]?.prompt).toContain("Bunyakovsky-type conjectures");
			expect(state.literatureSources).toMatchObject([
				{
					id: "source-1",
					title: "Test note on prime values of polynomials",
				},
			]);
			expect(state.literatureClaimSupports).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						status: "partially-supported",
						sourceIds: ["source-1"],
						claim: expect.stringContaining("conjectural prime-values-of-polynomials framing"),
					}),
					expect.objectContaining({
						status: "unsupported",
						sourceIds: [],
						claim: expect.stringContaining("unconditional proof"),
					}),
				]),
			);
			expect(state.researchReports[0]).toMatchObject({
				pathTitle: "Known theorem or literature reduction",
				status: "completed",
				sourceIds: ["source-1"],
			});
			expect(state.researchReports[0]?.claimSupportIds.length).toBeGreaterThanOrEqual(2);

			const visible = notices.join("\n");
			expect(visible).toContain("Source-backed context was reviewed");
			expect(visible).toContain("No source in this run established an unconditional proof");
			expect(visible).toContain("Conjectural implications are not proofs");
			expect(visible).toContain("partially-supported:");
			expect(visible).toContain("unsupported:");
			expect(visible).toContain("Test note on prime values of polynomials");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("routes examples paths to a computation workstream and persists computation outputs", async () => {
		const { executor, requests } = createNSquaredComputationExecutor();
		const { computationalExecutor, drafts } = createFakeComputationalExecutor();
		const { dir, harness, notices, statePath } = await createModelHarnessFixture(
			executor,
			undefined,
			computationalExecutor,
		);
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("continue path 1");
			await waitForProjectState(statePath, "completed computation report", (state) =>
				Boolean(state?.researchWorkstreamRuns[0]?.status === "completed"),
			);

			const state = await loadRequiredProjectState(statePath);
			expect(requests.map((request) => request.role)).toEqual(["specialist", "critic", "synthesizer"]);
			expect(drafts[0]?.content).toContain("BOUND = 20");
			expect(state.researchWorkstreamRuns[0]).toMatchObject({
				pathTitle: "Small examples and counterexamples",
				status: "completed",
				finalReportId: "research-report-1",
			});
			expect(state.computationalArtifacts).toMatchObject([
				{
					id: "computation-artifact-1",
					kind: "script",
					status: "completed",
					filePath: ".pi/co-math/artifacts/research-run-1/search.py",
					exitCode: 0,
				},
				{
					id: "computation-artifact-2",
					kind: "stdout",
					status: "completed",
					filePath: ".pi/co-math/artifacts/research-run-1/stdout.txt",
					exitCode: 0,
				},
			]);
			expect(state.researchReports[0]).toMatchObject({
				pathTitle: "Small examples and counterexamples",
				computationalArtifactIds: ["computation-artifact-1", "computation-artifact-2"],
			});
			expect(state.literatureSources).toEqual([]);

			const visible = notices.join("\n");
			expect(visible).toContain("Coordinator is choosing a bounded finite experiment.");
			expect(visible).toContain("Computational specialist is preparing a small script.");
			expect(visible).toContain("Computation");
			// Beginner completion stays product-clean: no raw artifact IDs, points to the detailed report.
			expect(visible).toContain("Ran a small bounded script and recorded its output.");
			expect(visible).not.toContain("computation-artifact-1");
			expect(visible).toContain("A finite computation does not prove an infinite claim.");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("shows computation-stage progress while a finite check is running", async () => {
		const { executor } = createNSquaredComputationExecutor();
		const deferred = createDeferredComputationalExecutor();
		const { dir, harness, notices, statePath } = await createModelHarnessFixture(
			executor,
			undefined,
			deferred.computationalExecutor,
		);
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("continue path 1");
			await waitForProjectState(statePath, "computation running", (state) =>
				Boolean(state?.researchWorkstreamRuns[0]?.currentStage === "computation"),
			);

			const before = notices.length;
			await harness.handlePrompt("show progress");
			const visible = notices.slice(before).join("\n");
			expect(visible).toContain("Research workstream running");
			expect(visible).toContain("Path 1: Small examples and counterexamples");
			expect(visible).toContain("Current stage");
			expect(visible).toContain("Running finite computation");
			expect(visible).toContain("Running the bounded finite computation.");

			deferred.resolveNext();
			await waitForProjectState(statePath, "completed computation after deferred result", (state) =>
				Boolean(state?.researchWorkstreamRuns[0]?.status === "completed"),
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("preserves failed computation outputs and blocks the computation run visibly", async () => {
		const { executor } = createNSquaredComputationExecutor();
		const { computationalExecutor } = createFakeComputationalExecutor({
			exitCode: 1,
			stdout: "",
			stderr: "Traceback: finite check failed",
			durationMs: 4,
			stderrFileName: "stderr.txt",
		});
		const { dir, harness, notices, statePath } = await createModelHarnessFixture(
			executor,
			undefined,
			computationalExecutor,
		);
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many primes of the form n^2 + 1?");
			await harness.handlePrompt("continue path 1");
			await waitForProjectState(statePath, "blocked failed computation report", (state) =>
				Boolean(state?.researchWorkstreamRuns[0]?.status === "blocked"),
			);

			const state = await loadRequiredProjectState(statePath);
			expect(state.researchReports[0]?.status).toBe("blocked");
			expect(state.computationalArtifacts.map((artifact) => artifact.status)).toEqual([
				"failed",
				"failed",
				"failed",
			]);
			expect(state.computationalArtifacts[2]).toMatchObject({
				kind: "stderr",
				summary: "Traceback: finite check failed",
				exitCode: 1,
			});

			const before = notices.length;
			await harness.handlePrompt("show latest report");
			const visible = notices.slice(before).join("\n");
			expect(visible).toContain("Traceback: finite check failed");
			expect(visible).toContain("Exit code: 1");
			expect(visible).toContain("Attachments");
			expect(visible).toContain("computation-artifact-3");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("fails stale interrupted research runs before starting a new continue path", async () => {
		const { executor, roles } = createTwinPrimeExecutor();
		const activityEvents: string[] = [];
		const { dir, harness, notices, statePath } = await createModelHarnessFixture(executor, undefined, undefined, {
			onResearchWorkstreamActivityStart: ({ run }) => {
				activityEvents.push(`start:${run.id}`);
			},
			onResearchWorkstreamActivityEnd: ({ runId }) => {
				activityEvents.push(`end:${runId}`);
			},
		});
		try {
			let state = createEmptyProjectState({
				projectId: "proj-test",
				title: "Are there infinitely many twin primes?",
				rootQuestion: "Are there infinitely many twin primes?",
				now: "2026-06-05T12:00:00.000Z",
			});
			state = addResearchPath(state, {
				title: "Small examples and counterexamples",
				objective: "List initial examples.",
				suggestedNextMove: "Compute more examples.",
				priority: 1,
				now: "2026-06-05T12:00:00.000Z",
				actor: "human",
			});
			state = addResearchPath(state, {
				title: "Direct proof attempt",
				objective: "Try a direct proof.",
				suggestedNextMove: "Check whether simple arguments apply or fail.",
				priority: 2,
				now: "2026-06-05T12:00:00.000Z",
				actor: "human",
			});
			state = addResearchWorkstreamRun(state, {
				pathId: "path-1",
				pathTitle: "Small examples and counterexamples",
				status: "running",
				currentStage: "specialist",
				now: "2026-06-05T12:01:00.000Z",
				actor: "system",
			});
			state = addResearchWorkstreamIncrementalReport(state, {
				runId: "research-run-1",
				stage: "specialist",
				status: "running",
				title: "Specialist attempt",
				summary: "Specialist research is running.",
				details: [],
				now: "2026-06-05T12:01:00.000Z",
				actor: "system",
			});
			await saveProjectState(statePath, state);

			await harness.handlePrompt("continue path 2");
			await waitForProjectState(statePath, "completed replacement research run", (candidate) =>
				Boolean(candidate?.researchWorkstreamRuns[1]?.status === "completed"),
			);

			const nextState = await loadRequiredProjectState(statePath);
			expect(nextState.researchWorkstreamRuns).toHaveLength(2);
			expect(nextState.researchWorkstreamRuns[0]).toMatchObject({
				status: "failed",
				failureReason: STALE_RESEARCH_WORKSTREAM_RUN_REASON,
			});
			expect(nextState.researchWorkstreamRuns[1]).toMatchObject({
				pathTitle: "Direct proof attempt",
				status: "completed",
				finalReportId: "research-report-1",
			});
			expect(nextState.researchReports).toHaveLength(1);
			expect(roles).toEqual(["specialist", "critic", "synthesizer"]);
			expect(activityEvents).toContain("end:research-run-1");
			expect(activityEvents).toContain("start:research-run-2");
			expect(activityEvents.indexOf("end:research-run-1")).toBeLessThan(
				activityEvents.indexOf("start:research-run-2"),
			);
			expect(activityEvents.at(-1)).toBe("end:research-run-2");

			const visible = notices.join("\n");
			expect(visible).toContain("Previous Pi session ended before completion.");
			// Paper checkpoint: stale runs surface explicit, executable recovery.
			expect(visible).toContain("Recovery");
			expect(visible).toContain("This earlier run is stale");
			expect(visible).toContain("Research run completed");
			expect(visible).not.toContain("already running on Path 1");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("uses the model-backed workstream for a generic problem when an executor is configured", async () => {
		const { executor, roles } = createTwinPrimeExecutor();
		const { dir, harness, notices, statePath } = await createModelHarnessFixture(executor);
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many twin primes?");
			await harness.handlePrompt("continue path 2");
			await waitForProjectState(statePath, "completed model-backed report", (state) =>
				Boolean(state?.researchWorkstreamRuns[0]?.status === "completed"),
			);

			expect(roles).toEqual(["specialist", "critic", "synthesizer"]);
			const state = await loadRequiredProjectState(statePath);
			expect(state.researchReports.length).toBe(1);
			expect(state.researchWorkstreamRuns[0]?.finalReportId).toBe("research-report-1");

			const visible = notices.join("\n");
			expect(visible).toContain("Research run completed");
			expect(visible).toContain("twin primes");
			expect(visible).toContain("distance 2");
			expect(visible).toContain("bounded prime gaps");
			expect(visible).not.toContain("I used the local fallback");
			expect(visible).not.toMatch(/role-run-|workstream-|artifact-|schema|queue/i);
			expectProductCopy(visible);

			const before = notices.length;
			await harness.handlePrompt("show latest report");
			const report = notices.slice(before).join("\n");
			expect(report).toContain("Latest research report");
			expect(report).toContain("Specialist attempt");
			expect(report).toContain("Critic review");
			expect(report).toContain("Synthesis");
			expect(report).toContain("Twin primes are prime pairs at distance 2");
			expectProductCopy(report);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("falls back to deterministic workstream when the model executor fails", async () => {
		const executor: ResearchWorkstreamModelExecutor = {
			run: async () => {
				throw new Error("model unavailable");
			},
		};
		const { dir, harness, notices, statePath } = await createModelHarnessFixture(executor);
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many twin primes?");
			await harness.handlePrompt("continue path 2");
			await waitForProjectState(statePath, "completed fallback report", (state) =>
				Boolean(state?.researchWorkstreamRuns[0]?.status === "completed"),
			);

			const state = await loadRequiredProjectState(statePath);
			expect(state.researchReports.length).toBe(1);
			expect(state.researchWorkstreamRuns[0]?.usedFallback).toBe(true);

			const visible = notices.join("\n");
			expect(visible).toContain(
				"I used the local fallback for this round because model-backed research was unavailable.",
			);
			expect(visible).toContain("Research run completed");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("prepares the workspace and asks for context when a short problem references a source", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const commands: string[] = [];
			const notices: string[] = [];
			const sourcePath = join(dir, "paper.pdf");
			const harness = new CoMathHarness({
				source: {
					input: sourcePath,
					absolutePath: sourcePath,
					displayName: "paper.pdf",
					exists: true,
					isFile: true,
				},
				statePath: join(dir, ".pi", "co-math", "state.json"),
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					commands.push(command);
					return OK;
				},
			});

			await harness.handlePrompt("Validate Question 3.");

			const visible = notices.join("\n");
			expect(visible).toContain("I’ll set up a source-backed validation run for: Validate Question 3.");
			expect(visible).toContain("✓ Validation workspace prepared");
			expect(visible).toContain("✓ Source pinned: paper.pdf");
			expect(visible).toContain("✓ Validation plan created");
			expect(visible).toContain("✓ Source audit prepared");
			expect(visible).toContain("Please paste the question statement, candidate solution, or relevant context.");
			expect(visible).toContain("I’ll start validating automatically once you do.");
			// Human-first: must not auto-start before context, and must not ask the user to type "continue".
			expect(visible).not.toContain("→ Running source audit in the background");
			expect(visible).not.toContain("continue");
			expectProductCopy(visible);

			expect(commands).toEqual([
				"init Validate Question 3.",
				`source ${sourcePath} paper.pdf: Primary source for Validate Question 3`,
				"goal Validate Question 3 against paper.pdf using source-backed definitions and preserve proof gaps.",
				"goal Extract exact definitions, notation, assumptions, and referenced identities needed for Question 3.",
				"goal Audit proof dependencies and unsupported transitions for Question 3, especially support, indexing, boundary, and vanishing-step gaps.",
				"workstream extract-question-3-definitions: Extract source-backed definitions for Question 3",
				"workstream identify-question-3-assumptions: Identify assumptions and references for Question 3",
				"workstream audit-question-3-support-gaps: Audit support and indexing gaps for Question 3",
				"queue workstream workstream-extract-question-3-definitions",
			]);
			expect(commands).not.toContain("dispatch-next --background");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("still asks for context for longer single-line references that are not pasted content", async () => {
		const references = [
			"Please validate Question 3 from the attached source", // 8 words, 51 chars
			"Check this theorem for support gaps in Question 5 now", // 10 words
			"Validate First Proof Question 2 against the paper.", // contains "Proof" but is a reference
		];
		for (const reference of references) {
			const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
			try {
				const commands: string[] = [];
				const notices: string[] = [];
				const sourcePath = join(dir, "paper.pdf");
				const harness = new CoMathHarness({
					source: {
						input: sourcePath,
						absolutePath: sourcePath,
						displayName: "paper.pdf",
						exists: true,
						isFile: true,
					},
					statePath: join(dir, ".pi", "co-math", "state.json"),
					notify: (message) => {
						notices.push(message);
					},
					runBackendCommand: async (command) => {
						commands.push(command);
						return OK;
					},
				});

				await harness.handlePrompt(reference);

				expect(commands).not.toContain("dispatch-next --background");
				expect(commands.some((command) => command.startsWith("queue workstream "))).toBe(true);
				const visible = notices.join("\n");
				expect(visible).toContain("Please paste the question statement, candidate solution, or relevant context.");
				expect(visible).not.toContain("→ Running source audit in the background");
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		}
	});

	it("audits immediately when the first prompt already contains pasted context", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const commands: string[] = [];
			const notices: string[] = [];
			const sourcePath = join(dir, "paper.pdf");
			const harness = new CoMathHarness({
				source: {
					input: sourcePath,
					absolutePath: sourcePath,
					displayName: "paper.pdf",
					exists: true,
					isFile: true,
				},
				statePath: join(dir, ".pi", "co-math", "state.json"),
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					commands.push(command);
					if (command === "dispatch-next --background") {
						return { ok: true, messages: ["Started run.\nTranscript: .pi/co-math/transcripts/run-1.jsonl"] };
					}
					return OK;
				},
			});

			// Multiline pasted content on the very first message: audit right away.
			await harness.handlePrompt(
				"Validate Question 3.\nStatement: for all pi there exists a uniform W.\nCandidate: choose W depending on pi.",
			);

			expect(commands).toContain("dispatch-next --background");
			expect(notices.join("\n")).toContain("→ Running source audit in the background");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("surfaces the transcript path from the dispatched background run", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const notices: string[] = [];
			const harness = new CoMathHarness({
				statePath: join(dir, ".pi", "co-math", "state.json"),
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					if (command === "dispatch-next --background") {
						return {
							ok: true,
							messages: ["Started run in background.\nTranscript: .pi/co-math/transcripts/run-1.jsonl"],
						};
					}
					return OK;
				},
			});

			await harness.handlePrompt("Validate Question 3.");

			expect(notices.join("\n")).toContain("Latest transcript: .pi/co-math/transcripts/run-1.jsonl");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("shows product help without creating setup commands", async () => {
		const commands: string[] = [];
		const notices: string[] = [];
		const harness = new CoMathHarness({
			statePath: "/tmp/missing-comath-state.json",
			notify: (message) => {
				notices.push(message);
			},
			runBackendCommand: async (command) => {
				commands.push(command);
				return OK;
			},
		});

		await harness.handlePrompt("help");

		expect(commands).toEqual([]);
		expect(notices.join("\n")).toContain("Pi math validation help");
		expectProductCopy(notices.join("\n"));
	});

	it("routes focus prompts as steering instead of blocking existing state", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const statePath = join(dir, "state.json");
			await writeFile(statePath, "{}", "utf8");
			const commands: string[] = [];
			const notices: string[] = [];
			const harness = new CoMathHarness({
				statePath,
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					commands.push(command);
					return OK;
				},
			});

			await harness.handlePrompt("focus on the support indexing gap");

			expect(commands).toEqual(["note project: Focus next work on the support indexing gap"]);
			expect(notices.join("\n")).toContain("Focus noted: the support indexing gap.");
			expectProductCopy(notices.join("\n"));
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("answers progress prompts with a product summary", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const statePath = join(dir, "state.json");
			await writeFile(statePath, "{}", "utf8");
			const commands: string[] = [];
			const notices: string[] = [];
			const runStatusMessage = [
				"role-run-1",
				"Role: workstream",
				"Status: running",
				"Execution mode: background",
				"Transcript: .pi/co-math/transcripts/run-1.jsonl",
				"Report: none",
				"Blockers:",
				"- none",
			].join("\n");
			const harness = new CoMathHarness({
				statePath,
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					commands.push(command);
					return { ok: true, messages: command === "run-status latest" ? [runStatusMessage] : [] };
				},
			});

			await harness.handlePrompt("show progress");
			await harness.handlePrompt("status");
			await harness.handlePrompt("what are you doing");

			expect(commands).toEqual(["run-status latest", "run-status latest", "run-status latest"]);
			const visible = notices.join("\n");
			expect(visible).toContain("Current progress");
			expect(visible).toContain("- Source audit: running");
			expect(visible).toContain("- Running in background: yes");
			expect(visible).toContain("- Latest transcript: .pi/co-math/transcripts/run-1.jsonl");
			expect(visible).toContain("- Report: none yet");
			expect(visible).not.toContain("Execution mode:");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("answers report prompts with sanitized product copy", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const statePath = join(dir, "state.json");
			await writeFile(statePath, "{}", "utf8");
			const notices: string[] = [];
			const reportMessage = [
				"Report report-1: workstream role run: workstream-extract-question-3-definitions",
				"Summary: Definitions extracted with one open gap.",
				"Blockers:",
				"- The source has no literal Question 3 statement.",
				"Linked role run: role-run-1",
			].join("\n");
			const harness = new CoMathHarness({
				statePath,
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) =>
					command === "report-status latest" ? { ok: true, messages: [reportMessage] } : OK,
			});

			await harness.handlePrompt("show report");

			const visible = notices.join("\n");
			expect(visible).toContain("Latest report");
			expect(visible).toContain("Status: blocked");
			expect(visible).toContain("- The source has no literal Question 3 statement.");
			expect(visible).not.toContain("Report report-1");
			expect(visible).not.toContain("Linked role run");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("keeps internal details available behind debug prompts", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const statePath = join(dir, "state.json");
			await writeFile(statePath, "{}", "utf8");
			const commands: string[] = [];
			const notices: string[] = [];
			const harness = new CoMathHarness({
				statePath,
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					commands.push(command);
					return { ok: true, messages: [`details for ${command}`] };
				},
			});

			await harness.handlePrompt("show debug state");

			expect(commands).toEqual(["run-status latest", "status"]);
			expect(notices.join("\n")).toContain("details for run-status latest");
			expect(notices.join("\n")).toContain("details for status");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("routes continue and uncertainty prompts", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const statePath = join(dir, "state.json");
			await writeFile(statePath, "{}", "utf8");
			const commands: string[] = [];
			const harness = new CoMathHarness({
				statePath,
				notify: () => {},
				runBackendCommand: async (command) => {
					commands.push(command);
					return OK;
				},
			});

			await harness.handlePrompt("continue");
			await harness.handlePrompt("show uncertainty");

			expect(commands).toEqual(["run-status latest", "re-audit --background", "next", "review-queue"]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("stops setup when source registration fails", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const commands: string[] = [];
			const notices: string[] = [];
			const sourcePath = join(dir, "paper.pdf");
			const harness = new CoMathHarness({
				source: {
					input: sourcePath,
					absolutePath: sourcePath,
					displayName: "paper.pdf",
					exists: true,
					isFile: true,
				},
				statePath: join(dir, ".pi", "co-math", "state.json"),
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					commands.push(command);
					return { ok: !command.startsWith("source "), messages: [] };
				},
			});

			await harness.handlePrompt("Validate Question 3.");

			expect(commands.some((command) => command.startsWith("goal "))).toBe(false);
			expect(notices.join("\n")).toContain("Could not pin the source file");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("sets up but waits for context when the first prompt asks to wait", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const commands: string[] = [];
			const notices: string[] = [];
			const sourcePath = join(dir, "paper.pdf");
			const harness = new CoMathHarness({
				source: {
					input: sourcePath,
					absolutePath: sourcePath,
					displayName: "paper.pdf",
					exists: true,
					isFile: true,
				},
				statePath: join(dir, ".pi", "co-math", "state.json"),
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					commands.push(command);
					return OK;
				},
			});

			await harness.handlePrompt("Set up validation for Problem X, but wait for pasted context before starting.");

			expect(commands.some((command) => command.startsWith("queue workstream "))).toBe(true);
			expect(commands).not.toContain("dispatch-next --background");
			// The control-flow request must be stripped from the root question the audit role sees.
			expect(commands).toContain("init Problem X");
			expect(commands.join("\n")).not.toContain("wait for pasted context");

			const visible = notices.join("\n");
			expect(visible).toContain("I’ll set up a source-backed validation run for: Problem X");
			expect(visible).toContain("- Wait for your pasted context before starting the first audit.");
			expect(visible).toContain("✓ Source audit prepared");
			// Pasted context now auto-starts; "continue" stays available but is not required.
			expect(visible).toContain("I’ll start validating automatically");
			expect(visible).toContain('say "continue" to start right away');
			expect(visible).not.toContain("→ Running source audit in the background");
			expectProductCopy(visible);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("dispatches the prepared audit when continue follows a queued run", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const statePath = join(dir, "state.json");
			await writeFile(statePath, "{}", "utf8");
			const commands: string[] = [];
			const notices: string[] = [];
			const queuedRunMessage = [
				"role-run-1",
				"Role: workstream",
				"Status: queued",
				"Execution mode: background",
				"Transcript: .pi/co-math/transcripts/role-run-1.jsonl",
				"Report: none",
				"Blockers:",
				"- none",
			].join("\n");
			const harness = new CoMathHarness({
				statePath,
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					commands.push(command);
					if (command === "run-status latest") {
						return { ok: true, messages: [queuedRunMessage] };
					}
					if (command === "dispatch-next --background") {
						return {
							ok: true,
							messages: ["Started run in background.\nTranscript: .pi/co-math/transcripts/role-run-1.jsonl"],
						};
					}
					return OK;
				},
			});

			await harness.handlePrompt("continue");

			expect(commands).toEqual(["run-status latest", "dispatch-next --background"]);
			const visible = notices.join("\n");
			expect(visible).toContain("→ Running source audit in the background");
			// The transcript file path is the one accepted place a role-run id may appear.
			expect(visible).toContain("Latest transcript: .pi/co-math/transcripts/role-run-1.jsonl");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("falls back to the next safe action when continue has no queued run and no new context", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const statePath = join(dir, "state.json");
			await writeFile(statePath, "{}", "utf8");
			const commands: string[] = [];
			const completedRunMessage = ["role-run-1", "Role: workstream", "Status: completed"].join("\n");
			const harness = new CoMathHarness({
				statePath,
				notify: () => {},
				runBackendCommand: async (command) => {
					commands.push(command);
					if (command === "run-status latest") {
						return { ok: true, messages: [completedRunMessage] };
					}
					if (command === "re-audit --background") {
						return { ok: true, messages: ["No new context to audit since the last step."] };
					}
					return { ok: true, messages: [] };
				},
			});

			await harness.handlePrompt("continue");

			expect(commands).toEqual(["run-status latest", "re-audit --background", "next"]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("re-audits with new context when continue follows a finished run", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const statePath = join(dir, "state.json");
			await writeFile(statePath, "{}", "utf8");
			const commands: string[] = [];
			const notices: string[] = [];
			const completedRunMessage = ["role-run-1", "Role: workstream", "Status: completed"].join("\n");
			const harness = new CoMathHarness({
				statePath,
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					commands.push(command);
					if (command === "run-status latest") {
						return { ok: true, messages: [completedRunMessage] };
					}
					if (command === "re-audit --background") {
						return {
							ok: true,
							messages: ["Started run in background.\nTranscript: .pi/co-math/transcripts/role-run-2.jsonl"],
						};
					}
					return { ok: true, messages: [] };
				},
			});

			await harness.handlePrompt("continue");

			expect(commands).toEqual(["run-status latest", "re-audit --background"]);
			const visible = notices.join("\n");
			expect(visible).toContain("→ Running source audit in the background");
			expect(visible).toContain("Latest transcript: .pi/co-math/transcripts/role-run-2.jsonl");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("does not re-audit while an audit is still running", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const statePath = join(dir, "state.json");
			await writeFile(statePath, "{}", "utf8");
			const commands: string[] = [];
			const runningRunMessage = ["role-run-1", "Role: workstream", "Status: running"].join("\n");
			const harness = new CoMathHarness({
				statePath,
				notify: () => {},
				runBackendCommand: async (command) => {
					commands.push(command);
					return { ok: true, messages: command === "run-status latest" ? [runningRunMessage] : [] };
				},
			});

			// Repeated continue while the audit runs must never trigger a re-audit dispatch.
			await harness.handlePrompt("continue");
			await harness.handlePrompt("continue");

			expect(commands).toEqual(["run-status latest", "next", "run-status latest", "next"]);
			expect(commands).not.toContain("re-audit --background");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("auto-starts the prepared audit when the next message is pasted context", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const statePath = join(dir, "state.json");
			await writeFile(statePath, "{}", "utf8");
			const commands: string[] = [];
			const notices: string[] = [];
			const queuedRunMessage = ["role-run-1", "Role: workstream", "Status: queued"].join("\n");
			const context = "The statement asks whether W is uniform for all pi; the candidate chooses W depending on pi.";
			const harness = new CoMathHarness({
				statePath,
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					commands.push(command);
					if (command === "run-status latest") {
						return { ok: true, messages: [queuedRunMessage] };
					}
					if (command === "dispatch-next --background") {
						return {
							ok: true,
							messages: ["Started run.\nTranscript: .pi/co-math/transcripts/role-run-1.jsonl"],
						};
					}
					return OK;
				},
			});

			await harness.handlePrompt(context);

			expect(commands).toEqual([`note project: ${context}`, "run-status latest", "dispatch-next --background"]);
			const visible = notices.join("\n");
			expect(visible).toContain("Got it — I’ve added that to the validation context.");
			expect(visible).toContain("→ Running source audit in the background");
			// The transcript file path is the one accepted place a role-run id may appear.
			expect(visible).toContain("Latest transcript: .pi/co-math/transcripts/role-run-1.jsonl");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("re-audits once when context is pasted after a finished run", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const statePath = join(dir, "state.json");
			await writeFile(statePath, "{}", "utf8");
			const commands: string[] = [];
			const notices: string[] = [];
			const blockedRunMessage = ["role-run-1", "Role: workstream", "Status: blocked"].join("\n");
			const candidate =
				"Candidate bad solution: for each pi, choose a Whittaker function W depending on pi, so W is not uniform.";
			const harness = new CoMathHarness({
				statePath,
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					commands.push(command);
					if (command === "run-status latest") {
						return { ok: true, messages: [blockedRunMessage] };
					}
					if (command === "re-audit --background") {
						return {
							ok: true,
							messages: ["Started run.\nTranscript: .pi/co-math/transcripts/role-run-2.jsonl"],
						};
					}
					return OK;
				},
			});

			await harness.handlePrompt(candidate);

			expect(commands).toEqual([`note project: ${candidate}`, "run-status latest", "re-audit --background"]);
			const visible = notices.join("\n");
			expect(visible).toContain("Got it — I’ve added that to the validation context.");
			expect(visible).toContain("→ Running source audit in the background");
			expect(visible).toContain("Latest transcript: .pi/co-math/transcripts/role-run-2.jsonl");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("records pasted context without starting a duplicate while an audit is running", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const statePath = join(dir, "state.json");
			await writeFile(statePath, "{}", "utf8");
			const commands: string[] = [];
			const notices: string[] = [];
			const runningRunMessage = ["role-run-1", "Role: workstream", "Status: running"].join("\n");
			const context = "More context: also confirm the Rankin-Selberg integral is nonzero for the chosen data.";
			const harness = new CoMathHarness({
				statePath,
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					commands.push(command);
					return { ok: true, messages: command === "run-status latest" ? [runningRunMessage] : [] };
				},
			});

			await harness.handlePrompt(context);

			expect(commands).toEqual([`note project: ${context}`, "run-status latest"]);
			expect(commands).not.toContain("dispatch-next --background");
			expect(commands).not.toContain("re-audit --background");
			const visible = notices.join("\n");
			expect(visible).toContain("Got it — I’ve added that to the validation context.");
			expect(visible).not.toContain("→ Running source audit in the background");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("treats a short steering message as a note rather than pasted context", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const statePath = join(dir, "state.json");
			await writeFile(statePath, "{}", "utf8");
			const commands: string[] = [];
			const notices: string[] = [];
			const harness = new CoMathHarness({
				statePath,
				notify: (message) => {
					notices.push(message);
				},
				runBackendCommand: async (command) => {
					commands.push(command);
					return OK;
				},
			});

			await harness.handlePrompt("check lemma 2");

			expect(commands).toEqual(["note project: check lemma 2"]);
			expect(notices.join("\n")).toContain("Noted. I’ll factor that into the next audit step.");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("starts the first workstream in the background so steering remains responsive", async () => {
		const dir = await mkdtemp(join(tmpdir(), "comath-harness-"));
		try {
			const commands: string[] = [];
			const harness = new CoMathHarness({
				statePath: join(dir, ".pi", "co-math", "state.json"),
				notify: () => {},
				runBackendCommand: async (command) => {
					commands.push(command);
					return OK;
				},
			});

			await harness.handlePrompt("Validate Question 3.");

			expect(commands.at(-2)).toBe("queue workstream workstream-extract-question-3-definitions");
			expect(commands.at(-1)).toBe("dispatch-next --background");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
