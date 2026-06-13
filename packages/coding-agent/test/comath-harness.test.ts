import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type CoMathBackendCommandResult, CoMathHarness } from "../src/modes/comath/comath-harness.ts";

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
	"artifact-",
	"workstream-",
	"/comath",
];

function expectProductCopy(text: string): void {
	for (const term of FORBIDDEN_PRODUCT_TERMS) {
		expect(text).not.toContain(term);
	}
}

describe("co-math harness", () => {
	it("translates the first problem prompt into silent setup commands with product notices", async () => {
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
			expect(visible).toContain("✓ Definition and assumption audit prepared");
			expect(visible).toContain("✓ Support/indexing gap audit prepared");
			expect(visible).toContain("→ Running source audit in the background");
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
				"dispatch-next --background",
			]);
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

			expect(commands).toEqual(["next", "review-queue"]);
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
