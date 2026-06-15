import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEmptyProjectState, loadProjectState, saveProjectState } from "../examples/extensions/co-math/storage.ts";
import { type CoMathBackendCommandResult, CoMathHarness } from "../src/modes/comath/comath-harness.ts";
import type { ResearchWorkstreamModelExecutor } from "../src/modes/comath/comath-research-model-workstream.ts";

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

async function createModelHarnessFixture(executor: ResearchWorkstreamModelExecutor): Promise<{
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
	});
	return { dir, harness, notices, statePath };
}

async function loadRequiredProjectState(statePath: string) {
	const state = await loadProjectState(statePath);
	if (!state) {
		throw new Error("Expected co-math project state to exist.");
	}
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
			expect(visible).toContain("Research workstream completed");
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
			expect(visible).toContain("Research workstream completed");
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

			const visible = notices.join("\n");
			expect(visible).toContain("Research workstream completed");
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
			expect(visible).toContain("Research workstream completed");
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

	it("uses the model-backed workstream for a generic problem when an executor is configured", async () => {
		const { executor, roles } = createTwinPrimeExecutor();
		const { dir, harness, notices, statePath } = await createModelHarnessFixture(executor);
		try {
			await harness.handlePrompt("Explore this problem: Are there infinitely many twin primes?");
			await harness.handlePrompt("continue path 2");

			expect(roles).toEqual(["specialist", "critic", "synthesizer"]);
			const state = await loadRequiredProjectState(statePath);
			expect(state.researchReports.length).toBe(1);

			const visible = notices.join("\n");
			expect(visible).toContain("Research workstream completed");
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

			const state = await loadRequiredProjectState(statePath);
			expect(state.researchReports.length).toBe(1);

			const visible = notices.join("\n");
			expect(visible).toContain(
				"I used the local fallback for this round because model-backed research was unavailable.",
			);
			expect(visible).toContain("Research workstream completed");
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
