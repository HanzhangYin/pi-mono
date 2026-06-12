import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type CoMathBackendCommandResult, CoMathHarness } from "../src/modes/comath/comath-harness.ts";

const OK: CoMathBackendCommandResult = { ok: true, messages: [] };

describe("co-math harness", () => {
	it("translates the first problem prompt into co-math setup commands", async () => {
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
				startFirstRun: false,
			});

			await harness.handlePrompt("Validate Question 3.");

			expect(notices.join("\n")).toContain("Planning co-math validation workflow");
			expect(notices.join("\n")).toContain("Created project: Validate Question 3.");
			expect(notices.join("\n")).toContain("Registered source: paper.pdf");
			expect(notices.join("\n")).toContain("Created goal:");
			expect(notices.join("\n")).toContain("Created workstream:");
			expect(commands).toEqual([
				"init Validate Question 3.",
				`source ${sourcePath} paper.pdf: Primary source for Validate Question 3`,
				"goal Validate Question 3 against paper.pdf using source-backed definitions and preserve proof gaps.",
				"goal Extract exact definitions, notation, assumptions, and referenced identities needed for Question 3.",
				"goal Audit proof dependencies and unsupported transitions for Question 3, especially support, indexing, boundary, and vanishing-step gaps.",
				"workstream extract-question-3-definitions: Extract source-backed definitions for Question 3",
				"workstream identify-question-3-assumptions: Identify assumptions and references for Question 3",
				"workstream audit-question-3-support-gaps: Audit support and indexing gaps for Question 3",
			]);
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
		expect(notices.join("\n")).toContain("Describe the problem");
		expect(notices.join("\n")).not.toContain("/comath");
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
			expect(notices.join("\n")).toContain("Recorded focus");
			expect(notices.join("\n")).not.toContain("/comath");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("routes product status and continue prompts", async () => {
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
			await harness.handlePrompt("show latest run");
			await harness.handlePrompt("show latest report");
			await harness.handlePrompt("show uncertainty");

			expect(commands).toEqual(["next", "run-status latest", "report-status latest", "review-queue"]);
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
			expect(notices.join("\n")).toContain("Could not register source");
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
