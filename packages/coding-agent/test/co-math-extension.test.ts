import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import coMathExtension from "../examples/extensions/co-math/index.ts";
import type { CoMathProjectState } from "../examples/extensions/co-math/schema.ts";
import {
	getDefaultStatePath,
	isClaimSynthesisEligible,
	loadProjectState,
	saveProjectState,
	startRoleRun,
} from "../examples/extensions/co-math/storage.ts";
import type { ExtensionAPI, ExtensionCommandContext } from "../src/core/extensions/types.ts";

const extensionDir = join(dirname(fileURLToPath(import.meta.url)), "../examples/extensions/co-math");

type RegisteredCommandForTest = Parameters<ExtensionAPI["registerCommand"]>[1];
type RegisteredToolForTest = Parameters<ExtensionAPI["registerTool"]>[0];

interface RoleRunInputForTest {
	cwd: string;
	role: "coordinator" | "workstream" | "reviewer" | "synthesizer";
	task: string;
	signal?: AbortSignal;
}

interface ProposedEvidenceForTest {
	kind: "proof" | "computation" | "reference" | "counterexample" | "note";
	summary: string;
}

interface ProposedWarningForTest {
	severity: "low" | "medium" | "high";
	message: string;
}

interface ProposedClaimForTest {
	statement: string;
	evidence?: ProposedEvidenceForTest[];
	warnings?: ProposedWarningForTest[];
}

interface ProposedArtifactForTest {
	kind:
		| "computation"
		| "latex_note"
		| "proof_sketch"
		| "counterexample_search"
		| "reference"
		| "dataset"
		| "script"
		| "figure"
		| "failed_attempt"
		| "human_note";
	title: string;
	summary: string;
	provenance?: string;
	path?: string;
	relatedClaimIds?: string[];
	relatedWorkstreamIds?: string[];
}

interface ReviewDecisionForTest {
	claimId: string;
	status: "proved" | "proof_sketch" | "needs_review" | "disproved";
	evidence?: ProposedEvidenceForTest[];
	warnings?: ProposedWarningForTest[];
	resolvedWarningIds?: string[];
}

interface RoleRunResultForTest {
	summary: string;
	proposedClaims?: ProposedClaimForTest[];
	proposedArtifacts?: ProposedArtifactForTest[];
	reviewDecision?: ReviewDecisionForTest;
	blockers?: string[];
}

type RoleRunnerForTest = (input: RoleRunInputForTest) => Promise<RoleRunResultForTest>;

interface CoMathExtensionFixture {
	activeTools: string[];
	commands: Map<string, RegisteredCommandForTest>;
	notifications: string[];
	pi: ExtensionAPI;
	tools: Map<string, RegisteredToolForTest>;
}

interface CoMathExtensionFixtureOptions {
	roleRunner?: RoleRunnerForTest;
}

function createCoMathExtensionFixture(options: CoMathExtensionFixtureOptions = {}): CoMathExtensionFixture {
	const activeTools: string[] = [];
	const commands = new Map<string, RegisteredCommandForTest>();
	const notifications: string[] = [];
	const tools = new Map<string, RegisteredToolForTest>();
	const pi = {
		registerCommand(name: string, options: RegisteredCommandForTest): void {
			commands.set(name, options);
		},
		registerTool(tool: RegisteredToolForTest): void {
			tools.set(tool.name, tool);
			activeTools.push(tool.name);
		},
		sendMessage(message: { content: string }): void {
			notifications.push(message.content);
		},
	} as unknown as ExtensionAPI;

	const extensionWithOptions = coMathExtension as unknown as (
		pi: ExtensionAPI,
		options?: CoMathExtensionFixtureOptions,
	) => void;
	extensionWithOptions(pi, options);
	return { activeTools, commands, notifications, pi, tools };
}

function createCommandContext(notifications: string[], cwd = "/tmp/co-math-test"): ExtensionCommandContext {
	return {
		cwd,
		hasUI: true,
		ui: {
			notify: (message: string) => {
				notifications.push(message);
			},
		},
	} as unknown as ExtensionCommandContext;
}

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

async function waitForNotificationCount(notifications: string[], count: number): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (notifications.length >= count) return;
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	expect(notifications).toHaveLength(count);
}

async function waitForCondition(assertCondition: () => void | Promise<void>): Promise<void> {
	let lastError: unknown;
	for (let attempt = 0; attempt < 50; attempt += 1) {
		try {
			await assertCondition();
			return;
		} catch (error) {
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	}
	if (lastError instanceof Error) {
		throw lastError;
	}
	throw lastError;
}

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await stat(filePath);
		return true;
	} catch (error) {
		if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

describe("co-math extension registration", () => {
	it("registers the /comath slash command", () => {
		const { commands } = createCoMathExtensionFixture();

		const command = commands.get("comath");
		expect(command).toBeDefined();
		expect(command?.description?.toLowerCase()).toContain("co-math");
	});

	it("registers the comath_state tool", () => {
		const { tools } = createCoMathExtensionFixture();

		const tool = tools.get("comath_state");
		expect(tool).toMatchObject({
			name: "comath_state",
			description: expect.stringContaining("co-math"),
		});
		expect(tool?.parameters).toBeDefined();
	});

	it("keeps comath_state active when extension tools are enabled", () => {
		const { activeTools, tools } = createCoMathExtensionFixture();

		expect(tools.has("comath_state")).toBe(true);
		expect(activeTools).toContain("comath_state");
		expect(tools.get("comath_state")?.promptSnippet).toContain("co-math project state");
	});

	it("shows help for /comath help without making a provider request", async () => {
		const { commands, notifications } = createCoMathExtensionFixture();
		const command = commands.get("comath");
		expect(command).toBeDefined();

		await command?.handler("help", createCommandContext(notifications));
		const visibleText = notifications.join("\n").toLowerCase();

		expect(visibleText).toContain("/comath");
		expect(visibleText).toContain("init");
		expect(visibleText).toContain("goal");
		expect(visibleText).toContain("workstream");
		expect(visibleText).toContain("status");
	});

	it("adds a goal and workstream through /comath commands and reflects them in status", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-command-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior for a permutation class", ctx);
			await command?.handler("goal Prove or refute the first nontrivial endpoint monotonicity case", ctx);
			await command?.handler(
				"workstream small-examples: enumerate exact small n examples and report obstructions",
				ctx,
			);
			await command?.handler("status", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.approvedGoals).toMatchObject([
				{
					id: "goal-1",
					text: "Prove or refute the first nontrivial endpoint monotonicity case",
					status: "active",
				},
			]);
			expect(state?.workstreams).toMatchObject([
				{
					id: "workstream-small-examples",
					title: "enumerate exact small n examples and report obstructions",
					goalIds: ["goal-1"],
					claimIds: [],
				},
			]);
			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("Added co-math goal goal-1");
			expect(visibleText).toContain("Added co-math workstream workstream-small-examples");
			expect(visibleText).toContain("Goals: 1");
			expect(visibleText).toContain("Workstreams: 1");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("proposes, approves, and defers goals with explicit user commands", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-goal-lifecycle-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study a finite permutation class", ctx);
			await command?.handler("propose-goal Enumerate exact small examples", ctx);
			await command?.handler("approve-goal goal-1", ctx);
			await command?.handler("propose-goal Explore optional asymptotics", ctx);
			await command?.handler("defer-goal goal-2: Keep this milestone finite", ctx);
			const beforeUnknown = await loadProjectState(getDefaultStatePath(tempDir));
			await command?.handler("approve-goal goal-missing", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.approvedGoals).toMatchObject([
				{ id: "goal-1", status: "approved", text: "Enumerate exact small examples" },
				{ id: "goal-2", status: "deferred", text: "Explore optional asymptotics" },
			]);
			expect(state?.events.map((event) => event.kind)).toEqual(
				expect.arrayContaining(["goal_added", "goal_status_changed", "human_intervention_recorded"]),
			);
			expect(state).toEqual(beforeUnknown);
			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("Proposed co-math goal goal-1");
			expect(visibleText).toContain("Approved co-math goal goal-1");
			expect(visibleText).toContain("Deferred co-math goal goal-2: Keep this milestone finite");
			expect(visibleText).toContain("Unknown goal: goal-missing");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("lists goals with proposed, approved, active, and deferred statuses", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-goals-list-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Map a reference paper", ctx);
			await command?.handler("propose-goal Extract definitions and theorem statements", ctx);
			await command?.handler("approve-goal goal-1", ctx);
			await command?.handler("goal Preserve compatibility active goals", ctx);
			await command?.handler("propose-goal Explore formal proof engine integration", ctx);
			await command?.handler("defer-goal goal-3: Out of scope for this workflow validation", ctx);
			await command?.handler("goals", ctx);

			const goals = notifications.at(-1) ?? "";
			expect(goals).toContain("Co-math goals");
			expect(goals).toContain("goal-1 [approved]: Extract definitions and theorem statements");
			expect(goals).toContain("goal-2 [active]: Preserve compatibility active goals");
			expect(goals).toContain("goal-3 [deferred]: Explore formal proof engine integration");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("gates workstreams on approved or active goals and skips deferred goals", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-workstream-goal-gate-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study a finite permutation class", ctx);
			await command?.handler("propose-goal Enumerate exact small examples", ctx);
			await command?.handler("workstream premature: should be rejected", ctx);
			await command?.handler("status", ctx);
			let state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.workstreams).toEqual([]);
			const proposedStatus = notifications.at(-1) ?? "";
			expect(notifications.join("\n")).toContain("Approve at least one goal before creating workstreams.");
			expect(proposedStatus).toContain("- proposed: 1");
			expect(proposedStatus).toContain("- approved: 0");
			expect(proposedStatus).toContain("Next safe action: /comath approve-goal goal-1");

			await command?.handler("approve-goal goal-1", ctx);
			await command?.handler("propose-goal Later generalization", ctx);
			await command?.handler("defer-goal goal-2: Not in this milestone", ctx);
			await command?.handler("workstream small-examples: enumerate exact small n examples", ctx);
			state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.workstreams).toMatchObject([
				{
					id: "workstream-small-examples",
					goalIds: ["goal-1"],
				},
			]);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("shows deterministic next safe actions across paper workflow states", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-next-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({ summary: "Coordinator report waiting for report review." }),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("next", ctx);
			expect(notifications.at(-1)).toContain("/comath init <root question>");

			await command?.handler("init Map a reference paper", ctx);
			await command?.handler("next", ctx);
			expect(notifications.at(-1)).toContain("/comath propose-goal <goal> or /comath goal <goal>");

			await command?.handler("propose-goal Extract definitions", ctx);
			await command?.handler("next", ctx);
			expect(notifications.at(-1)).toContain("/comath approve-goal goal-1");

			await command?.handler("approve-goal goal-1", ctx);
			await command?.handler("next", ctx);
			expect(notifications.at(-1)).toContain("/comath workstream <slug>: <title>");

			await command?.handler("workstream definitions-map: Definitions and theorem dependency map", ctx);
			await command?.handler("run coordinator", ctx);
			await command?.handler("next", ctx);
			const next = notifications.at(-1) ?? "";
			expect(next).toContain("/comath review-report report-1 accepted|revision-requested|blocked: <summary>");
			expect(next).toContain("Reason: at least one report has no report review.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("does not add goals or workstreams before /comath init creates state", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-command-missing-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("goal Prove something before initialization", ctx);
			await command?.handler("workstream premature: this should not be written", ctx);

			expect(await loadProjectState(getDefaultStatePath(tempDir))).toBeUndefined();
			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("No co-math project state found");
			expect(visibleText).toContain("Run /comath init <root question>");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("refuses to run the coordinator role before /comath init creates state", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-run-missing-"));
		const roleInvocations: RoleRunInputForTest[] = [];
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async (input) => {
					roleInvocations.push(input);
					return { summary: "should not run" };
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();

			await command?.handler("run coordinator", createCommandContext(notifications, tempDir));

			expect(roleInvocations).toHaveLength(0);
			expect(await loadProjectState(getDefaultStatePath(tempDir))).toBeUndefined();
			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("No co-math project state found");
			expect(visibleText).toContain("Run /comath init <root question>");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("runs the coordinator role with a bounded state-aware task and persists its report", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-run-coordinator-"));
		const roleInvocations: RoleRunInputForTest[] = [];
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async (input) => {
					roleInvocations.push(input);
					return { summary: "Coordinator proposal: keep claims tentative and split the examples workstream." };
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior for a permutation class", ctx);
			await command?.handler("goal Prove or refute the first nontrivial endpoint monotonicity case", ctx);
			await command?.handler(
				"workstream small-examples: enumerate exact small n examples and report obstructions",
				ctx,
			);
			await command?.handler("run coordinator", ctx);

			expect(roleInvocations).toEqual([
				expect.objectContaining({
					cwd: tempDir,
					role: "coordinator",
				}),
			]);
			const task = roleInvocations[0]?.task ?? "";
			expect(task).toContain("Role: coordinator");
			expect(task).toContain("Root question: Study endpoint behavior for a permutation class");
			expect(task).toContain("goal-1: Prove or refute the first nontrivial endpoint monotonicity case");
			expect(task).toContain("workstream-small-examples: enumerate exact small n examples and report obstructions");
			expect(task).toContain("Open warnings: 0");
			expect(task).toContain("Do not promote any mathematical claim to proved");

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.claims).toEqual([]);
			expect(state?.reports).toMatchObject([
				{
					id: "report-1",
					title: "coordinator role run",
					summary: "Coordinator proposal: keep claims tentative and split the examples workstream.",
				},
			]);
			expect(notifications.join("\n")).toContain("Ran co-math coordinator and saved report report-1");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("ingests structured workstream role output as review-gated state", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-run-workstream-"));
		const roleInvocations: RoleRunInputForTest[] = [];
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async (input) => {
					roleInvocations.push(input);
					return {
						summary: "Workstream found a finite obstruction pattern; treat it as experimental.",
						proposedClaims: [
							{
								statement: "Endpoint monotonicity fails for the tested toy class at n = 5.",
								evidence: [
									{
										kind: "computation",
										summary: "Enumerated all n <= 5 toy-class examples and found one obstruction.",
									},
								],
								warnings: [
									{
										severity: "high",
										message: "Finite enumeration is not a proof for all n.",
									},
								],
							},
						],
						blockers: ["Need an exact lifting argument before any general statement."],
					};
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior for a permutation class", ctx);
			await command?.handler("goal Prove or refute the first nontrivial endpoint monotonicity case", ctx);
			await command?.handler(
				"workstream small-examples: enumerate exact small n examples and report obstructions",
				ctx,
			);
			await command?.handler("run workstream workstream-small-examples", ctx);

			expect(roleInvocations).toEqual([
				expect.objectContaining({
					cwd: tempDir,
					role: "workstream",
				}),
			]);
			const task = roleInvocations[0]?.task ?? "";
			expect(task).toContain("Role: workstream");
			expect(task).toContain("Target workstream: workstream-small-examples");
			expect(task).toContain("enumerate exact small n examples and report obstructions");

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.reports).toMatchObject([
				{
					id: "report-1",
					title: "workstream role run: workstream-small-examples",
					summary: "Workstream found a finite obstruction pattern; treat it as experimental.",
					blockers: ["Need an exact lifting argument before any general statement."],
				},
			]);
			expect(state?.roleRuns).toMatchObject([
				{
					id: "role-run-1",
					role: "workstream",
					status: "blocked",
					targetWorkstreamId: "workstream-small-examples",
					reportId: "report-1",
					createdClaimIds: ["claim-1"],
					createdEvidenceIds: ["evidence-1"],
					createdWarningIds: ["warning-1"],
					blockerMessages: ["Need an exact lifting argument before any general statement."],
				},
			]);
			expect(state?.workstreams).toMatchObject([
				{
					id: "workstream-small-examples",
					status: "blocked",
					statusReason: "Need an exact lifting argument before any general statement.",
					claimIds: ["claim-1"],
					latestReportIds: ["report-1"],
					latestRunIds: ["role-run-1"],
				},
			]);
			expect(state?.claims).toMatchObject([
				{
					id: "claim-1",
					workstreamId: "workstream-small-examples",
					statement: "Endpoint monotonicity fails for the tested toy class at n = 5.",
					status: "needs_review",
					evidenceIds: ["evidence-1"],
					warningIds: ["warning-1"],
				},
			]);
			expect(state?.claims[0]?.status).not.toBe("proved");
			expect(state?.evidence).toMatchObject([
				{
					id: "evidence-1",
					claimId: "claim-1",
					kind: "computation",
					summary: "Enumerated all n <= 5 toy-class examples and found one obstruction.",
				},
			]);
			expect(state?.warnings).toMatchObject([
				{
					id: "warning-1",
					claimId: "claim-1",
					severity: "high",
					status: "open",
					message: "Finite enumeration is not a proof for all n.",
				},
			]);
			expect(notifications.join("\n")).toContain(
				"Ran co-math workstream and saved report report-1 with 1 proposed claim",
			);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("records completed workstream role runs without created claims", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-run-completed-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Workstream checked setup notes without proposing claims.",
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("goal Preserve run records", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.roleRuns).toMatchObject([
				{
					id: "role-run-1",
					role: "workstream",
					status: "completed",
					targetWorkstreamId: "workstream-endpoints",
					reportId: "report-1",
					createdClaimIds: [],
					blockerMessages: [],
				},
			]);
			expect(state?.workstreams[0]).toMatchObject({
				id: "workstream-endpoints",
				status: "active",
				latestRunIds: ["role-run-1"],
			});
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("records report review outcomes without changing claim status", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-review-report-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Workstream proposed a report with one tentative claim.",
					proposedClaims: [{ statement: "Report review should not promote this claim." }],
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("goal Preserve report review gates", ctx);
			await command?.handler("workstream reports: analyze report lifecycle", ctx);
			await command?.handler("run workstream workstream-reports", ctx);
			await command?.handler("review-report report-1 accepted: Report is clear enough to keep.", ctx);
			await command?.handler("review-report report-1 revision-requested: Add blocker context.", ctx);
			const beforeUnknown = await loadProjectState(getDefaultStatePath(tempDir));
			await command?.handler("review-report report-missing blocked: Missing report should not mutate.", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.reportReviewRounds).toMatchObject([
				{
					id: "report-review-1",
					reportId: "report-1",
					roleRunId: "role-run-1",
					status: "completed",
					outcome: "accepted",
					summary: "Report is clear enough to keep.",
				},
				{
					id: "report-review-2",
					reportId: "report-1",
					roleRunId: "role-run-1",
					status: "completed",
					outcome: "revision_requested",
					summary: "Add blocker context.",
				},
			]);
			expect(state?.claims[0]?.status).toBe("needs_review");
			expect(state).toEqual(beforeUnknown);
			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("Recorded report review report-review-1 for report-1: accepted");
			expect(visibleText).toContain("Unknown report: report-missing");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("lists reports and shows report review status details", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-report-status-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Definitions map report separates definitions from theorem claims.",
					blockers: ["Dependency edge for Lemma X needs human confirmation."],
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Map a reference paper", ctx);
			await command?.handler("goal Build a paper map", ctx);
			await command?.handler("workstream definitions-map: Definitions and theorem dependency map", ctx);
			await command?.handler("run workstream workstream-definitions-map", ctx);
			await command?.handler(
				"review-report report-1 revision-requested: Needs clearer separation between claims and definitions.",
				ctx,
			);
			await command?.handler("reports", ctx);
			await command?.handler("report-status report-1", ctx);
			await command?.handler("report-status report-missing", ctx);

			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("Co-math reports");
			expect(visibleText).toContain(
				"report-1: workstream role run: workstream-definitions-map [latest review: revision_requested] run=role-run-1",
			);
			expect(visibleText).toContain("Report report-1: workstream role run: workstream-definitions-map");
			expect(visibleText).toContain("Summary: Definitions map report separates definitions from theorem claims.");
			expect(visibleText).toContain("- Dependency edge for Lemma X needs human confirmation.");
			expect(visibleText).toContain(
				"report-review-1 [revision_requested]: Needs clearer separation between claims and definitions.",
			);
			expect(visibleText).toContain(
				"Suggested next action: /comath review-report report-1 accepted|revision-requested|blocked: <summary>",
			);
			expect(visibleText).toContain("No report found for report-missing.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("supports a paper-to-working-paper co-math workflow", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-paper-workflow-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Mapped definitions and found validation obligations for the reference paper.",
					proposedClaims: [
						{
							statement:
								"The reference-paper workflow should separate definitions, theorem statements, dependency claims, and proof obligations.",
							evidence: [
								{
									kind: "note",
									summary: "Workflow mapping note from bounded co-math role output.",
								},
							],
							warnings: [
								{
									severity: "medium",
									message:
										"This is a workflow claim about mapping discipline, not a proof of paper mathematics.",
								},
							],
						},
					],
					blockers: ["Need human review of exact theorem dependencies before synthesis."],
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler(
				"init How should we map and validate the main mathematical structure of 2605.06651v2?",
				ctx,
			);
			await command?.handler(
				"propose-goal Extract the paper's main definitions, theorem statements, and dependency graph.",
				ctx,
			);
			await command?.handler(
				"propose-goal Identify which claims need proof review, computation, or external references.",
				ctx,
			);
			await command?.handler("approve-goal goal-1", ctx);
			await command?.handler("approve-goal goal-2", ctx);
			await command?.handler("workstream definitions-map: Definitions and theorem dependency map", ctx);
			await command?.handler(
				"workstream validation-questions: Proof, computation, and reference validation questions",
				ctx,
			);
			await command?.handler("run workstream workstream-definitions-map", ctx);
			await command?.handler("review-report report-1 accepted: Report is acceptable as a workflow map.", ctx);
			await command?.handler(
				"paper-section Reference paper map: Draft map with visible uncertainty. --sources evidence-1,warning-1,role-run-1",
				ctx,
			);
			await command?.handler("export-paper .pi/co-math/working-paper.md --force", ctx);
			await command?.handler("audit", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state).toBeDefined();
			if (!state) return;
			expect(
				state.approvedGoals.filter((goal) => goal.status === "approved" || goal.status === "active"),
			).toHaveLength(2);
			expect(state.workstreams).toHaveLength(2);
			expect(state.workstreams.every((workstream) => workstream.goalIds.length > 0)).toBe(true);
			expect(state.reports).toHaveLength(1);
			expect(state.reportReviewRounds).toHaveLength(1);
			expect(state.claims).toMatchObject([
				{
					id: "claim-1",
					status: "needs_review",
				},
			]);
			expect(state.claims[0]?.status).not.toBe("proved");

			const markdown = await readFile(join(tempDir, ".pi/co-math/working-paper.md"), "utf8");
			expect(markdown).toContain("## Goals");
			expect(markdown).toContain("## Workstreams");
			expect(markdown).toContain("## Report Reviews");
			expect(markdown).toContain("report-review-1 [accepted] report=report-1");
			expect(markdown).toContain("workflow claim about mapping discipline");
			expect(markdown).toContain("Need human review of exact theorem dependencies before synthesis.");
			expect(notifications.at(-1)).toBe("Co-math audit\nNo co-math audit problems found.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("records failed role runs without creating reports", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-run-failed-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => {
					throw new Error("Role process exited with code 1.");
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("goal Preserve failed runs", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.reports).toEqual([]);
			expect(state?.roleRuns).toMatchObject([
				{
					id: "role-run-1",
					role: "workstream",
					status: "failed",
					targetWorkstreamId: "workstream-endpoints",
					errorMessage: "Role process exited with code 1.",
				},
			]);
			expect(state?.workstreams[0]).toMatchObject({
				status: "blocked",
				statusReason: "Role process exited with code 1.",
			});
			expect(notifications.join("\n")).toContain("Co-math workstream role run role-run-1 failed");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("records aborted role runs with aborted notification text", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-run-aborted-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => {
					throw new Error("Co-math role run was aborted.");
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.reports).toEqual([]);
			expect(state?.roleRuns).toMatchObject([
				{
					id: "role-run-1",
					role: "workstream",
					status: "aborted",
					targetWorkstreamId: "workstream-endpoints",
					errorMessage: "Co-math role run was aborted.",
				},
			]);
			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("Co-math workstream role run role-run-1 aborted");
			expect(visibleText).not.toContain("Co-math workstream role run role-run-1 failed");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("displays role run lists, role run details, and lifecycle status counts", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-run-display-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Workstream created one claim for run display.",
					proposedClaims: [
						{
							statement: "Run records should expose created claim ids.",
						},
					],
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("goal Display role runs", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);
			await command?.handler("runs", ctx);
			await command?.handler("run-status role-run-1", ctx);
			await command?.handler("run-status role-run-missing", ctx);
			await command?.handler("status", ctx);

			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("Co-math role runs");
			expect(visibleText).toContain("role-run-1 [completed] workstream workstream-endpoints -> report-1");
			expect(visibleText).toContain("Role: workstream");
			expect(visibleText).toContain("Status: completed");
			expect(visibleText).toContain("Target workstream: workstream-endpoints");
			expect(visibleText).toContain("Report: report-1");
			expect(visibleText).toContain("Created claims: claim-1");
			expect(visibleText).toContain("No role run found for role-run-missing.");
			expect(visibleText).toContain("Workstream statuses:");
			expect(visibleText).toContain("- needs_review: 1");
			expect(visibleText).toContain("Role runs:");
			expect(visibleText).toContain("- completed: 1");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("displays workstream status drill-down with goals, claims, warnings, and blockers", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-workstream-status-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Workstream found a blocked tentative claim.",
					proposedClaims: [
						{
							statement: "Endpoint monotonicity needs a boundary lemma.",
							warnings: [{ severity: "high", message: "Boundary lemma missing." }],
						},
					],
					blockers: ["Need a boundary lemma."],
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("goal Analyze endpoint induction", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);
			await command?.handler("workstream-status workstream-endpoints", ctx);
			await command?.handler("workstream-status workstream-missing", ctx);

			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("Workstream workstream-endpoints: analyze endpoint induction");
			expect(visibleText).toContain("Status: blocked");
			expect(visibleText).toContain("Status reason: Need a boundary lemma.");
			expect(visibleText).toContain("goal-1 [active]: Analyze endpoint induction");
			expect(visibleText).toContain("Latest reports: report-1");
			expect(visibleText).toContain("role-run-1 [blocked]");
			expect(visibleText).toContain("claim-1 [needs_review]: Endpoint monotonicity needs a boundary lemma.");
			expect(visibleText).toContain("Attached open warnings: 1");
			expect(visibleText).toContain("Suggested next action: /comath unblock <workstream-id>: <reason>");
			expect(visibleText).toContain("No workstream found for workstream-missing.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("queues role runs without invoking the role runner", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-queue-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => {
					throw new Error("role runner should not be invoked while queueing");
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("queue workstream workstream-endpoints", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.reports).toEqual([]);
			expect(state?.roleRuns).toMatchObject([
				{
					id: "role-run-1",
					role: "workstream",
					status: "queued",
					targetWorkstreamId: "workstream-endpoints",
				},
			]);
			expect(state?.roleRuns[0]?.startedAt).toBeUndefined();
			expect(notifications.join("\n")).toContain("Queued co-math workstream as role-run-1 for later dispatch.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("dispatches the oldest queued role run", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-dispatch-next-"));
		const roleInvocations: RoleRunInputForTest[] = [];
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async (input) => {
					roleInvocations.push(input);
					return { summary: `Dispatched ${input.role}.` };
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("queue coordinator", ctx);
			await command?.handler("queue synthesizer", ctx);
			await command?.handler("dispatch-next", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(roleInvocations).toHaveLength(1);
			expect(roleInvocations[0]).toMatchObject({ role: "coordinator" });
			expect(state?.roleRuns).toMatchObject([
				{
					id: "role-run-1",
					role: "coordinator",
					status: "completed",
					reportId: "report-1",
				},
				{
					id: "role-run-2",
					role: "synthesizer",
					status: "queued",
				},
			]);
			expect(notifications.join("\n")).toContain("Ran co-math coordinator and saved report report-1");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("dispatches a specific queued role run by id", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-dispatch-run-"));
		const roleInvocations: RoleRunInputForTest[] = [];
		try {
			const { commands } = createCoMathExtensionFixture({
				roleRunner: async (input) => {
					roleInvocations.push(input);
					return { summary: `Dispatched ${input.role}.` };
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const notifications: string[] = [];
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("queue coordinator", ctx);
			await command?.handler("queue synthesizer", ctx);
			await command?.handler("dispatch-run role-run-2", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(roleInvocations).toHaveLength(1);
			expect(roleInvocations[0]).toMatchObject({ role: "synthesizer" });
			expect(state?.roleRuns).toMatchObject([
				{
					id: "role-run-1",
					status: "queued",
				},
				{
					id: "role-run-2",
					role: "synthesizer",
					status: "completed",
					reportId: "report-1",
				},
			]);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("cancels queued role runs with provenance and without invoking the role runner", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-cancel-queued-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => {
					throw new Error("role runner should not be invoked while cancelling");
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("queue coordinator", ctx);
			await command?.handler("cancel-run role-run-1: Human chose a narrower decomposition", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.reports).toEqual([]);
			expect(state?.roleRuns[0]).toMatchObject({
				id: "role-run-1",
				status: "cancelled",
				cancelReason: "Human chose a narrower decomposition",
			});
			expect(state?.events).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						kind: "role_run_cancelled",
						actor: "human",
						subjectId: "role-run-1",
					}),
					expect.objectContaining({
						kind: "human_intervention_recorded",
						actor: "human",
						subjectId: "role-run-1",
						summary: "Cancelled queued role run role-run-1: Human chose a narrower decomposition",
					}),
				]),
			);
			expect(notifications.join("\n")).toContain(
				"Cancelled queued role run role-run-1: Human chose a narrower decomposition",
			);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("refuses to cancel non-queued role runs", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-cancel-nonqueued-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({ summary: "Immediate run completed." }),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("run coordinator", ctx);
			await command?.handler("cancel-run role-run-1: Should not cancel completed run", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.roleRuns[0]).toMatchObject({
				id: "role-run-1",
				status: "completed",
				reportId: "report-1",
			});
			expect(notifications.join("\n")).toContain(
				"Cannot cancel role-run-1 because its status is completed. Use /comath recover-run for stale running runs.",
			);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("displays queued and cancelled role run status fields", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-queued-display-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("queue coordinator", ctx);
			await command?.handler("queue synthesizer", ctx);
			await command?.handler("cancel-run role-run-2: Superseded by coordinator queue item", ctx);
			await command?.handler("runs", ctx);
			await command?.handler("run-status role-run-1", ctx);
			await command?.handler("run-status role-run-2", ctx);
			await command?.handler("status", ctx);

			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("role-run-1 [queued] coordinator");
			expect(visibleText).toContain("role-run-2 [cancelled] synthesizer");
			expect(visibleText).toContain("Queued:");
			expect(visibleText).toContain("Started: none");
			expect(visibleText).toContain("Cancelled:");
			expect(visibleText).toContain("Cancel reason: Superseded by coordinator queue item");
			expect(visibleText).toContain("- queued: 1");
			expect(visibleText).toContain("- cancelled: 1");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("dispatch-next --background saves running state before role invocation", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-background-next-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => {
					const state = await loadProjectState(getDefaultStatePath(tempDir));
					expect(state?.roleRuns[0]).toMatchObject({
						id: "role-run-1",
						status: "running",
						executionMode: "background",
					});
					return { summary: "Background coordinator completed." };
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("queue coordinator", ctx);
			await command?.handler("dispatch-next --background", ctx);

			expect(notifications.join("\n")).toContain("Started co-math coordinator role run role-run-1 in background.");
			await waitForNotificationCount(notifications, 4);
			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.roleRuns[0]).toMatchObject({
				id: "role-run-1",
				status: "completed",
				executionMode: "background",
				reportId: "report-1",
			});
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("dispatch-run --background starts the specified queued run and returns before completion", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-background-run-"));
		const deferred = createDeferred<RoleRunResultForTest>();
		const roleInvocations: RoleRunInputForTest[] = [];
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async (input) => {
					roleInvocations.push(input);
					const state = await loadProjectState(getDefaultStatePath(tempDir));
					const runningRun = state?.roleRuns.find((run) => run.status === "running");
					if (runningRun?.executionMode !== "background") {
						return { summary: "Foreground fallback completed." };
					}
					return deferred.promise;
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("queue coordinator", ctx);
			await command?.handler("queue synthesizer", ctx);
			await command?.handler("dispatch-run role-run-2 --background", ctx);

			await waitForCondition(() => {
				expect(roleInvocations).toHaveLength(1);
			});
			expect(roleInvocations[0]).toMatchObject({ role: "synthesizer" });
			expect(notifications.at(-1)).toBe("Started co-math synthesizer role run role-run-2 in background.");
			let state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.reports).toEqual([]);
			expect(state?.roleRuns).toMatchObject([
				{
					id: "role-run-1",
					status: "queued",
				},
				{
					id: "role-run-2",
					status: "running",
					executionMode: "background",
				},
			]);

			deferred.resolve({ summary: "Background synthesizer completed." });
			await waitForNotificationCount(notifications, 5);
			state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.roleRuns[1]).toMatchObject({
				id: "role-run-2",
				status: "completed",
				reportId: "report-1",
			});
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("background completion preserves concurrent human notes", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-background-note-"));
		const deferred = createDeferred<RoleRunResultForTest>();
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => {
					const state = await loadProjectState(getDefaultStatePath(tempDir));
					const runningRun = state?.roleRuns.find((run) => run.status === "running");
					if (runningRun?.executionMode !== "background") {
						return { summary: "Foreground fallback completed." };
					}
					return deferred.promise;
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("queue coordinator", ctx);
			await command?.handler("dispatch-next --background", ctx);
			await command?.handler("note project: Human note while background run is pending", ctx);
			deferred.resolve({ summary: "Background coordinator completed after note." });
			await waitForNotificationCount(notifications, 5);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.roleRuns[0]).toMatchObject({
				status: "completed",
				reportId: "report-1",
			});
			expect(state?.artifacts).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						kind: "human_note",
						summary: "Human note while background run is pending",
					}),
				]),
			);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("late background completion does not overwrite recovered runs", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-background-recovered-"));
		const deferred = createDeferred<RoleRunResultForTest>();
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => {
					const state = await loadProjectState(getDefaultStatePath(tempDir));
					const runningRun = state?.roleRuns.find((run) => run.status === "running");
					if (runningRun?.executionMode !== "background") {
						return { summary: "Foreground fallback completed." };
					}
					return deferred.promise;
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("queue coordinator", ctx);
			await command?.handler("dispatch-next --background", ctx);
			await command?.handler("recover-run role-run-1 aborted: User recovered stale background run", ctx);
			deferred.resolve({ summary: "Late success should be ignored." });
			await waitForNotificationCount(notifications, 5);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.reports).toEqual([]);
			expect(state?.roleRuns[0]).toMatchObject({
				id: "role-run-1",
				status: "aborted",
				errorMessage: "User recovered stale background run",
			});
			expect(notifications.join("\n")).toContain(
				"Background role run role-run-1 finished, but durable status is aborted; skipped late completion.",
			);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("abort-run aborts live background runs and records human provenance", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-background-abort-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async (input) => {
					const state = await loadProjectState(getDefaultStatePath(tempDir));
					const runningRun = state?.roleRuns.find((run) => run.status === "running");
					if (runningRun?.executionMode !== "background") {
						return { summary: "Foreground fallback completed." };
					}
					return new Promise<RoleRunResultForTest>((_resolve, reject) => {
						input.signal?.addEventListener("abort", () => {
							reject(new Error("Co-math role run was aborted."));
						});
					});
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("queue coordinator", ctx);
			await command?.handler("dispatch-next --background", ctx);
			await command?.handler("abort-run role-run-1: User changed direction", ctx);
			await waitForNotificationCount(notifications, 5);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.reports).toEqual([]);
			expect(state?.roleRuns[0]).toMatchObject({
				id: "role-run-1",
				status: "aborted",
				errorMessage: "Co-math role run was aborted.",
			});
			expect(state?.events).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						kind: "human_intervention_recorded",
						subjectId: "role-run-1",
						summary: "Requested abort for background role run role-run-1: User changed direction",
					}),
				]),
			);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("abort-run explains stale durable running runs when they are not live", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-background-stale-abort-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			const statePath = getDefaultStatePath(tempDir);
			const state = await loadProjectState(statePath);
			expect(state).toBeDefined();
			await saveProjectState(statePath, {
				...(state as CoMathProjectState),
				roleRuns: [
					{
						id: "role-run-1",
						role: "coordinator",
						status: "running",
						task: "Role: coordinator",
						executionMode: "background",
						createdClaimIds: [],
						createdEvidenceIds: [],
						createdWarningIds: [],
						createdArtifactIds: [],
						blockerMessages: [],
						queuedAt: "2026-06-05T12:00:00.000Z",
						startedAt: "2026-06-05T12:01:00.000Z",
						updatedAt: "2026-06-05T12:01:00.000Z",
					},
				],
			});

			await command?.handler("abort-run role-run-1: User changed direction", ctx);

			expect(notifications.at(-1)).toContain(
				"role-run-1 is running but not live in this process. Use /comath recover-run role-run-1 aborted: User changed direction",
			);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("background-runs lists live handles only", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-background-list-"));
		const deferred = createDeferred<RoleRunResultForTest>();
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => {
					const state = await loadProjectState(getDefaultStatePath(tempDir));
					const runningRun = state?.roleRuns.find((run) => run.status === "running");
					if (runningRun?.executionMode !== "background") {
						return { summary: "Foreground fallback completed." };
					}
					return deferred.promise;
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("queue coordinator", ctx);
			await command?.handler("dispatch-next --background", ctx);
			await command?.handler("background-runs", ctx);

			expect(notifications.at(-1)).toContain("Live co-math background role runs");
			expect(notifications.at(-1)).toContain("role-run-1 [coordinator]");
			deferred.resolve({ summary: "Background coordinator completed." });
			await waitForNotificationCount(notifications, 5);
			await waitForCondition(async () => {
				await command?.handler("background-runs", ctx);
				expect(notifications.at(-1)).toBe("No live co-math background role runs in this session.");
			});
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("ingests structured role artifacts linked to the saved report and target workstream", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-run-artifact-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Workstream preserved a failed attempt.",
					proposedArtifacts: [
						{
							kind: "failed_attempt",
							title: "Endpoint induction attempt",
							summary: "The induction breaks when the right arm is empty.",
							provenance: "bounded workstream role run",
						},
					],
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("goal Preserve failed attempts", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.roleRuns).toMatchObject([
				expect.objectContaining({
					id: "role-run-1",
					role: "workstream",
					status: "completed",
					targetWorkstreamId: "workstream-endpoints",
					reportId: "report-1",
					createdArtifactIds: ["artifact-1"],
				}),
			]);
			expect(state?.artifacts).toMatchObject([
				{
					id: "artifact-1",
					kind: "failed_attempt",
					title: "Endpoint induction attempt",
					relatedWorkstreamIds: ["workstream-endpoints"],
					relatedReportIds: ["report-1"],
				},
			]);
			expect(state?.events.map((event) => event.kind)).toContain("artifact_recorded");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("records manual artifacts and displays artifact and timeline summaries", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-artifact-command-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler(
				"artifact failed_attempt Endpoint induction attempt: Breaks when the right arm is empty.",
				ctx,
			);
			await command?.handler("artifacts", ctx);
			await command?.handler("timeline", ctx);
			await command?.handler("status", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.artifacts).toMatchObject([
				{
					id: "artifact-1",
					kind: "failed_attempt",
					title: "Endpoint induction attempt",
					summary: "Breaks when the right arm is empty.",
				},
			]);
			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("Co-math artifacts");
			expect(visibleText).toContain("artifact-1 [failed_attempt] Endpoint induction attempt");
			expect(visibleText).toContain("Co-math timeline");
			expect(visibleText).toContain("project_initialized");
			expect(visibleText).toContain("artifact_recorded");
			expect(visibleText).toContain("Artifacts: 1");
			expect(visibleText).toContain("Events:");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("records paper sections with classified source ids", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-paper-section-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Workstream proposed a claim for paper provenance.",
					proposedClaims: [
						{
							statement: "Endpoint monotonicity has a draft formulation.",
							evidence: [{ kind: "computation", summary: "Checked examples through n = 5." }],
							warnings: [{ severity: "high", message: "Boundary case still needs a lemma." }],
						},
					],
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);
			await command?.handler("artifact failed_attempt Endpoint attempt: Breaks at the right endpoint.", ctx);
			await command?.handler(
				"paper-section Endpoint lemma: Draft text with visible uncertainty. --sources claim-1,evidence-1,warning-1,artifact-1",
				ctx,
			);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.workingPaperSections).toMatchObject([
				{
					id: "paper-section-1",
					title: "Endpoint lemma",
					body: "Draft text with visible uncertainty.",
					status: "draft",
					sourceClaimIds: ["claim-1"],
					sourceEvidenceIds: ["evidence-1"],
					sourceWarningIds: ["warning-1"],
					sourceArtifactIds: ["artifact-1"],
				},
			]);
			expect(notifications.join("\n")).toContain("Recorded working-paper section paper-section-1: Endpoint lemma");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("paper-section rejects unknown source ids", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-paper-section-unknown-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("paper-section Endpoint lemma: Draft text. --sources claim-missing", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.workingPaperSections).toEqual([]);
			expect(notifications.at(-1)).toContain("Unknown paper section source ids: claim-missing");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("margin-note records open notes without creating mathematical warnings", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-margin-note-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("paper-section Endpoint lemma: Draft body.", ctx);
			await command?.handler("margin-note paper-section-1 gap: Need a proof of the boundary lemma", ctx);
			await command?.handler("margin-notes", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.marginNotes).toMatchObject([
				{
					id: "margin-note-1",
					kind: "gap",
					status: "open",
					subjectId: "paper-section-1",
					sectionId: "paper-section-1",
					message: "Need a proof of the boundary lemma",
				},
			]);
			expect(state?.workingPaperSections[0]?.marginNoteIds).toEqual(["margin-note-1"]);
			expect(state?.warnings).toEqual([]);
			expect(notifications.at(-1)).toContain(
				"margin-note-1 [gap/open] paper-section-1: Need a proof of the boundary lemma",
			);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("resolve-margin-note records one real resolution event only", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-margin-note-resolve-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("margin-note project todo: Add a clearer introduction", ctx);
			await command?.handler("resolve-margin-note margin-note-1: Introduction now states the convention", ctx);
			await command?.handler("resolve-margin-note margin-note-1: Duplicate resolution", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.marginNotes[0]).toMatchObject({
				id: "margin-note-1",
				status: "resolved",
				resolution: "Introduction now states the convention",
			});
			expect(state?.events.filter((event) => event.kind === "margin_note_resolved")).toHaveLength(1);
			expect(notifications.at(-1)).toBe("Margin note margin-note-1 is already resolved.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("paper render marks non-synthesis-eligible claim sources", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-paper-noneligible-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Workstream proposed an unreviewed claim.",
					proposedClaims: [{ statement: "Unreviewed endpoint statement." }],
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);
			await command?.handler("paper-section Endpoint lemma: Draft body. --sources claim-1", ctx);
			await command?.handler("paper", ctx);

			const paper = notifications.at(-1) ?? "";
			expect(paper).toContain("claim-1 [needs_review/not synthesis-eligible]");
			expect(paper).toContain("## Reviewed findings not yet in paper");
			expect(paper).not.toContain("- claim-1: Unreviewed endpoint statement.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("paper render includes reviewed findings not yet in paper", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-paper-reviewed-finding-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async (input) => {
					if (input.role === "reviewer") {
						return {
							summary: "Reviewer proves the claim.",
							reviewDecision: {
								claimId: "claim-1",
								status: "proved",
								evidence: [{ kind: "proof", summary: "Checked the endpoint proof." }],
							},
						};
					}
					return {
						summary: "Workstream proposed a claim for the living paper.",
						proposedClaims: [{ statement: "Reviewed endpoint finding." }],
					};
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);
			await command?.handler("run reviewer claim-1", ctx);
			await command?.handler("paper", ctx);

			const paper = notifications.at(-1) ?? "";
			expect(paper).toContain("## Reviewed findings not yet in paper");
			expect(paper).toContain("- claim-1: Reviewed endpoint finding.");
			expect(paper).toContain("proof: Checked the endpoint proof.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("paper render always includes open warnings and open margin notes", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-paper-open-issues-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Workstream proposed a warning-bearing claim.",
					proposedClaims: [
						{
							statement: "Endpoint warning stays visible.",
							warnings: [{ severity: "high", message: "Boundary case remains open." }],
						},
					],
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);
			await command?.handler("paper-section Endpoint lemma: Draft body. --sources warning-1", ctx);
			await command?.handler("margin-note paper-section-1 warning: Section still relies on warning-1", ctx);
			await command?.handler("paper", ctx);

			const paper = notifications.at(-1) ?? "";
			expect(paper).toContain("## Open warnings");
			expect(paper).toContain("warning-1 [high] on claim-1: Boundary case remains open.");
			expect(paper).toContain("## Open margin notes");
			expect(paper).toContain("margin-note-1 [warning] paper-section-1: Section still relies on warning-1");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("export-paper writes default markdown snapshot and records artifact", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-export-default-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Workstream proposed an open warning for export.",
					proposedClaims: [
						{
							statement: "Exported paper should keep warnings visible.",
							warnings: [{ severity: "high", message: "Boundary case remains open." }],
						},
					],
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);
			await command?.handler("paper-section Endpoint lemma: Draft body. --sources claim-1,warning-1", ctx);
			await command?.handler("margin-note paper-section-1 gap: Need a boundary lemma", ctx);
			await command?.handler("export-paper", ctx);

			const markdown = await readFile(join(tempDir, ".pi/co-math/exports/working-paper.md"), "utf8");
			expect(markdown).toContain("Working-paper sections are draft workspace records, not proof certificates.");
			expect(markdown).toContain("claim-1 [needs_review/not synthesis-eligible]");
			expect(markdown).toContain("## Open warnings");
			expect(markdown).toContain("warning-1 [high] on claim-1: Boundary case remains open.");
			expect(markdown).toContain("## Open margin notes");
			expect(markdown).toContain("margin-note-1 [gap] paper-section-1: Need a boundary lemma");
			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.artifacts).toMatchObject([
				{
					id: "artifact-1",
					kind: "working_paper_export",
					path: ".pi/co-math/exports/working-paper.md",
				},
			]);
			expect(state?.events).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						kind: "working_paper_exported",
						subjectId: "artifact-1",
					}),
				]),
			);
			expect(notifications.at(-1)).toBe(
				"Exported living working paper to .pi/co-math/exports/working-paper.md as artifact-1.",
			);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("export-paper includes goals, workstreams, report reviews, and blockers", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-export-report-review-"));
		try {
			const { commands } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Definitions report with a blocker.",
					blockers: ["Need exact dependency for Proposition 2.1."],
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const notifications: string[] = [];
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Map a reference paper", ctx);
			await command?.handler("propose-goal Extract definitions and theorem statements", ctx);
			await command?.handler("approve-goal goal-1", ctx);
			await command?.handler("workstream definitions-map: Definitions and theorem dependency map", ctx);
			await command?.handler("run workstream workstream-definitions-map", ctx);
			await command?.handler("review-report report-1 blocked: Dependency blocker remains open.", ctx);
			await command?.handler("export-paper .pi/co-math/working-paper.md --force", ctx);

			const markdown = await readFile(join(tempDir, ".pi/co-math/working-paper.md"), "utf8");
			expect(markdown).toContain("## Goals");
			expect(markdown).toContain("goal-1 [approved]: Extract definitions and theorem statements");
			expect(markdown).toContain("## Workstreams");
			expect(markdown).toContain("workstream-definitions-map [blocked]");
			expect(markdown).toContain("## Report Reviews");
			expect(markdown).toContain("report-review-1 [blocked] report=report-1");
			expect(markdown).toContain("Dependency blocker remains open.");
			expect(markdown).toContain("## Open Warnings and Blockers");
			expect(markdown).toContain("report-1 blocker: Need exact dependency for Proposition 2.1.");
			expect(markdown).toContain("## Provenance");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("export-paper refuses to overwrite without force", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-export-overwrite-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("paper-section Endpoint lemma: Initial draft.", ctx);
			await command?.handler("export-paper", ctx);
			const afterFirstExport = await loadProjectState(getDefaultStatePath(tempDir));
			await command?.handler("export-paper", ctx);

			const afterRefusal = await loadProjectState(getDefaultStatePath(tempDir));
			expect(afterRefusal?.artifacts).toHaveLength(afterFirstExport?.artifacts.length ?? 0);
			expect(afterRefusal?.events).toHaveLength(afterFirstExport?.events.length ?? 0);
			expect(notifications.at(-1)).toBe(
				"Export target already exists: .pi/co-math/exports/working-paper.md. Use --force to overwrite.",
			);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("export-paper --force overwrites and records a new export artifact", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-export-force-"));
		try {
			const { commands } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const notifications: string[] = [];
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("paper-section Endpoint lemma: Initial draft.", ctx);
			await command?.handler("export-paper", ctx);
			await command?.handler("paper-section Second section: New draft section.", ctx);
			await command?.handler("export-paper --force", ctx);

			const markdown = await readFile(join(tempDir, ".pi/co-math/exports/working-paper.md"), "utf8");
			expect(markdown).toContain("paper-section-2: Second section");
			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.artifacts.filter((artifact) => artifact.kind === "working_paper_export")).toHaveLength(2);
			expect(state?.events.filter((event) => event.kind === "working_paper_exported")).toHaveLength(2);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("export-paper rejects paths outside workspace", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-export-outside-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			const before = await loadProjectState(getDefaultStatePath(tempDir));
			await command?.handler("export-paper ../outside.md", ctx);

			expect(await loadProjectState(getDefaultStatePath(tempDir))).toEqual(before);
			expect(notifications.at(-1)).toContain("Export path must stay inside the workspace.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("export-paper rejects symlinked directory escapes", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-export-symlink-dir-"));
		const outsideDir = await mkdtemp(join(tmpdir(), "pi-comath-export-outside-target-"));
		try {
			await symlink(outsideDir, join(tempDir, "exports-link"));
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			const before = await loadProjectState(getDefaultStatePath(tempDir));
			await command?.handler("export-paper exports-link/paper.md --force", ctx);

			expect(await pathExists(join(outsideDir, "paper.md"))).toBe(false);
			expect(await loadProjectState(getDefaultStatePath(tempDir))).toEqual(before);
			expect(notifications.at(-1)).toMatch(/workspace|symlink/i);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
			await rm(outsideDir, { recursive: true, force: true });
		}
	});

	it("export-paper rejects symlinked file targets", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-export-symlink-file-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			const statePath = getDefaultStatePath(tempDir);
			const before = await loadProjectState(statePath);
			await symlink(join(tempDir, ".pi/co-math/state.json"), join(tempDir, "state-link.md"));
			await command?.handler("export-paper state-link.md --force", ctx);

			const rawState = await readFile(statePath, "utf8");
			expect(() => JSON.parse(rawState)).not.toThrow();
			expect(await loadProjectState(statePath)).toEqual(before);
			expect(notifications.at(-1)).toMatch(/state\.json|symlink/i);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("export-paper does not mutate state on overwrite refusal", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-export-no-mutate-"));
		try {
			const { commands } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const notifications: string[] = [];
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("paper-section Endpoint lemma: Initial draft.", ctx);
			await command?.handler("export-paper custom.md", ctx);
			const beforeRefusal = await loadProjectState(getDefaultStatePath(tempDir));
			await command?.handler("export-paper custom.md", ctx);

			expect(await loadProjectState(getDefaultStatePath(tempDir))).toEqual(beforeRefusal);
			expect(notifications.at(-1)).toBe("Export target already exists: custom.md. Use --force to overwrite.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("artifact-file rejects symlinks to outside files", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-artifact-file-symlink-"));
		const outsideDir = await mkdtemp(join(tmpdir(), "pi-comath-artifact-file-outside-"));
		try {
			await writeFile(join(outsideDir, "outside.txt"), "outside content", "utf8");
			await symlink(join(outsideDir, "outside.txt"), join(tempDir, "outside-link.txt"));
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("artifact-file script outside-link.txt Outside file: Should reject", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.artifacts).toEqual([]);
			expect(state?.claims).toEqual([]);
			expect(state?.evidence).toEqual([]);
			expect(state?.warnings).toEqual([]);
			expect(notifications.at(-1)).toMatch(/symlink|workspace/i);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
			await rm(outsideDir, { recursive: true, force: true });
		}
	});

	it("artifact-file registers existing workspace files without reading content", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-artifact-file-"));
		try {
			await mkdir(join(tempDir, "scripts"), { recursive: true });
			await writeFile(join(tempDir, "scripts/check.py"), "secret content should remain file-only", "utf8");
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler(
				"artifact-file script scripts/check.py Endpoint checker: Small n enumeration helper",
				ctx,
			);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.artifacts).toMatchObject([
				{
					id: "artifact-1",
					kind: "script",
					path: "scripts/check.py",
					title: "Endpoint checker",
					summary: "Small n enumeration helper",
				},
			]);
			expect(state?.claims).toEqual([]);
			expect(state?.evidence).toEqual([]);
			expect(state?.warnings).toEqual([]);
			expect(notifications.at(-1)).toBe(
				"Recorded file artifact artifact-1 [script] scripts/check.py: Endpoint checker",
			);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("computation runs a foreground command and records hashed output provenance", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-computation-"));
		try {
			await mkdir(join(tempDir, "scripts"), { recursive: true });
			await mkdir(join(tempDir, "outputs"), { recursive: true });
			await writeFile(
				join(tempDir, "scripts/write-output.sh"),
				[
					"#!/bin/sh",
					'if [ "$1" != "--out" ]; then',
					"  exit 2",
					"fi",
					"printf 'pattern\\tcount\\n123\\t132\\n' > \"$2\"",
					"printf 'wrote counts\\n'",
				].join("\n"),
				"utf8",
			);
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Compare finite counts", ctx);
			await command?.handler(
				'computation --command "sh scripts/write-output.sh --out outputs/result.tsv" --out outputs/result.tsv --title "Count table" --summary "Finite count table generated locally"',
				ctx,
			);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.artifacts).toHaveLength(1);
			expect(state?.artifacts[0]).toMatchObject({
				id: "artifact-1",
				kind: "computation",
				path: "outputs/result.tsv",
				title: "Count table",
				summary: "Finite count table generated locally",
			});
			expect(state?.artifacts[0]?.provenance).toContain(
				"command: sh scripts/write-output.sh --out outputs/result.tsv",
			);
			expect(state?.artifacts[0]?.provenance).toContain("exitCode: 0");
			expect(state?.artifacts[0]?.provenance).toContain("signal: none");
			expect(state?.artifacts[0]?.provenance).toContain("outputPath: outputs/result.tsv");
			expect(state?.artifacts[0]?.provenance).toMatch(/outputSha256: [a-f0-9]{64}/);
			expect(state?.artifacts[0]?.provenance).toContain("stdoutPreview: wrote counts");
			expect(state?.artifacts[0]?.provenance).toContain("stderrPreview: ");
			expect(state?.claims).toEqual([]);
			expect(state?.evidence).toEqual([]);
			expect(state?.warnings).toEqual([]);
			expect(notifications.at(-1)).toMatch(
				/Recorded computation artifact artifact-1 outputs\/result\.tsv sha256=[a-f0-9]{64} elapsedMs=\d+/,
			);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("computation does not mutate state when the command fails", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-computation-failed-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Compare finite counts", ctx);
			const before = await loadProjectState(getDefaultStatePath(tempDir));
			await command?.handler('computation --command "false" --out outputs/result.tsv', ctx);

			expect(await loadProjectState(getDefaultStatePath(tempDir))).toEqual(before);
			expect(notifications.at(-1)).toContain("Computation failed with exit code 1");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("computation rejects existing outputs instead of forcing overwrite", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-computation-stale-output-"));
		try {
			await mkdir(join(tempDir, "outputs"), { recursive: true });
			await writeFile(join(tempDir, "outputs/result.tsv"), "stale\n", "utf8");
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Compare finite counts", ctx);
			const before = await loadProjectState(getDefaultStatePath(tempDir));
			await command?.handler(
				'computation --command "printf fresh > outputs/result.tsv" --out outputs/result.tsv',
				ctx,
			);
			await command?.handler(
				'computation --command "printf forced > outputs/result.tsv" --out outputs/result.tsv --force',
				ctx,
			);

			expect(await readFile(join(tempDir, "outputs/result.tsv"), "utf8")).toBe("stale\n");
			expect(await loadProjectState(getDefaultStatePath(tempDir))).toEqual(before);
			expect(notifications.join("\n")).toContain("Computation output target already exists: outputs/result.tsv.");
			expect(notifications.at(-1)).toContain(
				"Usage: /comath computation --command <command> --out <path> [--title <title>] [--summary <summary>]",
			);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("computation rejects unsafe output paths before running", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-computation-path-"));
		try {
			await mkdir(join(tempDir, "scripts"), { recursive: true });
			await writeFile(
				join(tempDir, "scripts/write-output.mjs"),
				"throw new Error('the command should not run for an unsafe output path');\n",
				"utf8",
			);
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Compare finite counts", ctx);
			const before = await loadProjectState(getDefaultStatePath(tempDir));
			await command?.handler('computation --command "node scripts/write-output.mjs" --out ../outside.tsv', ctx);
			await command?.handler(
				'computation --command "node scripts/write-output.mjs" --out .pi/co-math/state.json',
				ctx,
			);

			expect(await loadProjectState(getDefaultStatePath(tempDir))).toEqual(before);
			expect(notifications.join("\n")).toContain("Computation output path must stay inside the workspace.");
			expect(notifications.join("\n")).toContain("Computation output path cannot overwrite .pi/co-math/state.json.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("computation rejects output paths whose parent becomes a symlink", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-computation-parent-link-"));
		const outsideDir = await mkdtemp(join(tmpdir(), "pi-comath-computation-parent-outside-"));
		try {
			await mkdir(join(tempDir, "outputs"), { recursive: true });
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Compare finite counts", ctx);
			const before = await loadProjectState(getDefaultStatePath(tempDir));
			await command?.handler(
				`computation --command "rm -rf outputs && ln -s ${outsideDir} outputs && printf 'count\\n1\\n' > outputs/result.tsv" --out outputs/result.tsv`,
				ctx,
			);

			expect(await loadProjectState(getDefaultStatePath(tempDir))).toEqual(before);
			expect(notifications.at(-1)).toContain("Computation output parent path contains a symlink");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
			await rm(outsideDir, { recursive: true, force: true });
		}
	});

	it("artifact-file rejects missing files, directories, and outside paths", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-artifact-file-invalid-"));
		try {
			await mkdir(join(tempDir, "scripts"), { recursive: true });
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("artifact-file script scripts/missing.py Missing file: Should fail", ctx);
			await command?.handler("artifact-file script scripts Directory artifact: Should fail", ctx);
			await command?.handler("artifact-file script ../outside.py Outside path: Should fail", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.artifacts).toEqual([]);
			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("Artifact file does not exist: scripts/missing.py");
			expect(visibleText).toContain("Artifact path is not a file: scripts");
			expect(visibleText).toContain("Artifact path must stay inside the workspace.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("artifacts output includes file paths", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-artifacts-path-"));
		try {
			await mkdir(join(tempDir, "scripts"), { recursive: true });
			await writeFile(join(tempDir, "scripts/check.py"), "content", "utf8");
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler(
				"artifact-file script scripts/check.py Endpoint checker: Small n enumeration helper",
				ctx,
			);
			await command?.handler("artifacts", ctx);

			expect(notifications.at(-1)).toContain(
				"artifact-1 [script] Endpoint checker (scripts/check.py): Small n enumeration helper",
			);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("audit reports symlink artifact paths without mutation", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-audit-artifact-symlink-"));
		try {
			await writeFile(join(tempDir, "real-script.py"), "content", "utf8");
			await symlink(join(tempDir, "real-script.py"), join(tempDir, "script-link.py"));
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			const statePath = getDefaultStatePath(tempDir);
			const state = await loadProjectState(statePath);
			expect(state).toBeDefined();
			const malformedState: CoMathProjectState = {
				...(state as CoMathProjectState),
				artifacts: [
					{
						id: "artifact-1",
						kind: "script",
						title: "Symlink script",
						summary: "Audit should report symlink paths.",
						path: "script-link.py",
						relatedClaimIds: [],
						relatedWorkstreamIds: [],
						relatedReportIds: [],
						createdAt: "2026-06-05T12:00:00.000Z",
						updatedAt: "2026-06-05T12:00:00.000Z",
					},
				],
			};
			await saveProjectState(statePath, malformedState);

			await command?.handler("audit", ctx);

			expect(notifications.at(-1)).toContain("artifact-1 path script-link.py is a symlink");
			expect(await loadProjectState(statePath)).toEqual(malformedState);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("audit reports missing file-backed artifact paths without mutation", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-audit-artifact-path-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			const statePath = getDefaultStatePath(tempDir);
			const state = await loadProjectState(statePath);
			expect(state).toBeDefined();
			const malformedState: CoMathProjectState = {
				...(state as CoMathProjectState),
				artifacts: [
					{
						id: "artifact-1",
						kind: "script",
						title: "Missing script",
						summary: "Audit should report missing path.",
						path: "scripts/missing.py",
						relatedClaimIds: [],
						relatedWorkstreamIds: [],
						relatedReportIds: [],
						createdAt: "2026-06-05T12:00:00.000Z",
						updatedAt: "2026-06-05T12:00:00.000Z",
					},
					{
						id: "artifact-2",
						kind: "working_paper_export",
						title: "Bad export",
						summary: "Export should be markdown.",
						path: "exports/working-paper.txt",
						relatedClaimIds: [],
						relatedWorkstreamIds: [],
						relatedReportIds: [],
						createdAt: "2026-06-05T12:00:00.000Z",
						updatedAt: "2026-06-05T12:00:00.000Z",
					},
				],
				events: [
					...(state as CoMathProjectState).events,
					{
						id: "event-export-broken",
						kind: "working_paper_exported",
						actor: "human",
						summary: "Broken export event.",
						subjectId: "artifact-missing",
						relatedIds: [],
						createdAt: "2026-06-05T12:00:00.000Z",
					},
				],
			};
			await saveProjectState(statePath, malformedState);

			await command?.handler("audit", ctx);

			const audit = notifications.at(-1) ?? "";
			expect(audit).toContain("artifact-1 path scripts/missing.py does not exist");
			expect(audit).toContain("artifact-2 is a working_paper_export artifact without a .md path");
			expect(audit).toContain("event-export-broken working_paper_exported subject artifact-missing is missing");
			expect(await loadProjectState(statePath)).toEqual(malformedState);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("manually blocks and unblocks workstreams with human intervention events", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-block-unblock-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("goal Steer endpoint work", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("block workstream-endpoints: Need a convention choice", ctx);
			let state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.workstreams[0]).toMatchObject({
				id: "workstream-endpoints",
				status: "blocked",
				statusReason: "Need a convention choice",
			});
			expect(state?.events).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						kind: "human_intervention_recorded",
						actor: "human",
						subjectId: "workstream-endpoints",
						relatedIds: ["workstream-endpoints"],
						summary: "Blocked workstream workstream-endpoints: Need a convention choice",
					}),
				]),
			);

			await command?.handler("unblock workstream-endpoints: Chose predecessor-canonical convention", ctx);
			state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.workstreams[0]).toMatchObject({
				id: "workstream-endpoints",
				status: "active",
			});
			expect(state?.workstreams[0]?.statusReason).toBeUndefined();
			expect(state?.events).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						kind: "human_intervention_recorded",
						actor: "human",
						subjectId: "workstream-endpoints",
						relatedIds: ["workstream-endpoints"],
						summary: "Unblocked workstream workstream-endpoints: Chose predecessor-canonical convention",
					}),
				]),
			);
			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("Blocked workstream workstream-endpoints: Need a convention choice");
			expect(visibleText).toContain(
				"Unblocked workstream workstream-endpoints: Chose predecessor-canonical convention",
			);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("validates manual block and unblock commands", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-block-invalid-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("block workstream-endpoints", ctx);
			await command?.handler("unblock workstream-endpoints:", ctx);
			await command?.handler("block workstream-missing: Need a reason", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.workstreams[0]?.status).toBe("active");
			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("Usage: /comath block <workstream-id>: <reason>");
			expect(visibleText).toContain("Usage: /comath unblock <workstream-id>: <reason>");
			expect(visibleText).toContain("Unknown workstream: workstream-missing");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("records human steering notes as metadata artifacts without proof evidence", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-human-note-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("goal Steer endpoint work", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("note workstream-endpoints: Try the endpoint convention from draft_3", ctx);
			await command?.handler("artifacts", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.artifacts).toMatchObject([
				{
					id: "artifact-1",
					kind: "human_note",
					title: "Human note for workstream-endpoints",
					summary: "Try the endpoint convention from draft_3",
					provenance: "Human steering note for workstream-endpoints",
					relatedWorkstreamIds: ["workstream-endpoints"],
				},
			]);
			expect(state?.evidence).toEqual([]);
			expect(state?.events).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						kind: "human_intervention_recorded",
						subjectId: "workstream-endpoints",
						relatedIds: ["workstream-endpoints", "artifact-1"],
						summary: "Recorded human note for workstream-endpoints: Try the endpoint convention from draft_3",
					}),
				]),
			);
			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("Recorded human note artifact artifact-1 for workstream-endpoints.");
			expect(visibleText).toContain("artifact-1 [human_note] Human note for workstream-endpoints");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("recovers stale running role runs as failed with human intervention provenance", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-recover-failed-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			const statePath = getDefaultStatePath(tempDir);
			const state = await loadProjectState(statePath);
			expect(state).toBeDefined();
			await saveProjectState(
				statePath,
				startRoleRun(state as CoMathProjectState, {
					id: "role-run-1",
					role: "workstream",
					task: "Role: workstream",
					targetWorkstreamId: "workstream-endpoints",
					now: "2026-06-05T12:00:00.000Z",
					actor: "workstream",
				}),
			);

			await command?.handler("recover-run role-run-1 failed: Terminal crashed", ctx);

			const recovered = await loadProjectState(statePath);
			expect(recovered?.reports).toEqual([]);
			expect(recovered?.roleRuns[0]).toMatchObject({
				id: "role-run-1",
				status: "failed",
				errorMessage: "Terminal crashed",
			});
			expect(recovered?.workstreams[0]).toMatchObject({
				status: "blocked",
				statusReason: "Terminal crashed",
			});
			expect(recovered?.events).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						kind: "human_intervention_recorded",
						subjectId: "role-run-1",
						relatedIds: ["role-run-1", "workstream-endpoints"],
						summary: "Recovered stale role run role-run-1 as failed: Terminal crashed",
					}),
				]),
			);
			expect(notifications.join("\n")).toContain("Recovered stale role run role-run-1 as failed: Terminal crashed");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("recovers stale running role runs as aborted and refuses non-running recovery", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-recover-aborted-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Completed run for recovery refusal.",
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);
			const statePath = getDefaultStatePath(tempDir);
			const state = await loadProjectState(statePath);
			expect(state).toBeDefined();
			await saveProjectState(
				statePath,
				startRoleRun(state as CoMathProjectState, {
					id: "role-run-2",
					role: "coordinator",
					task: "Role: coordinator",
					now: "2026-06-05T12:00:00.000Z",
					actor: "coordinator",
				}),
			);

			await command?.handler("recover-run role-run-2 aborted: User stopped stale run", ctx);
			await command?.handler("recover-run role-run-1 failed: Should not mutate completed run", ctx);
			await command?.handler("recover-run role-run-2 completed: invalid", ctx);
			await command?.handler("recover-run role-run-missing failed: Missing run", ctx);
			await command?.handler("recover-run role-run-2 failed", ctx);

			const recovered = await loadProjectState(statePath);
			expect(recovered?.roleRuns[0]).toMatchObject({
				id: "role-run-1",
				status: "completed",
			});
			expect(recovered?.roleRuns[1]).toMatchObject({
				id: "role-run-2",
				status: "aborted",
				errorMessage: "User stopped stale run",
			});
			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("Recovered stale role run role-run-2 as aborted: User stopped stale run");
			expect(visibleText).toContain("Cannot recover role-run-1 because its status is completed.");
			expect(visibleText).toContain("Usage: /comath recover-run <run-id> <failed|aborted>: <reason>");
			expect(visibleText).toContain("No role run found for role-run-missing.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("lists claims and warnings waiting for review", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-review-queue-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Workstream found a finite obstruction pattern; treat it as experimental.",
					proposedClaims: [
						{
							statement: "Finite examples suggest a possible obstruction.",
							evidence: [
								{
									kind: "computation",
									summary: "Enumerated the toy class through n = 5.",
								},
							],
							warnings: [
								{
									severity: "high",
									message: "Finite enumeration is not a proof.",
								},
							],
						},
					],
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior for a permutation class", ctx);
			await command?.handler("workstream small-examples: enumerate exact small n examples", ctx);
			await command?.handler("run workstream workstream-small-examples", ctx);
			await command?.handler("review-queue", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.reviewQueue).toMatchObject([
				{
					id: "review-1",
					claimId: "claim-1",
					reason: "Workstream proposed a claim that needs reviewer validation.",
				},
			]);
			const reviewQueue = notifications.at(-1) ?? "";
			expect(reviewQueue).toContain("Review queue");
			expect(reviewQueue).toContain("claim-1 [needs_review]: Finite examples suggest a possible obstruction.");
			expect(reviewQueue).toContain("warning-1 [high] on claim-1: Finite enumeration is not a proof.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("attaches manual evidence and warnings, resolves warnings, and audits valid state", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-manual-records-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Workstream proposed a manually reviewable claim.",
					proposedClaims: [
						{
							statement: "Manual curation should attach provenance before synthesis.",
						},
					],
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior for a permutation class", ctx);
			await command?.handler("workstream notes: collect manually checked proof notes", ctx);
			await command?.handler("run workstream workstream-notes", ctx);
			await command?.handler("evidence claim-1 proof: Checked induction in draft_3.tex:142-167.", ctx);
			await command?.handler("warning claim-1 high: Endpoint boundary case still needs a written lemma.", ctx);
			await command?.handler("resolve-warning warning-1", ctx);
			await command?.handler("audit", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.evidence).toMatchObject([
				{
					id: "evidence-1",
					claimId: "claim-1",
					kind: "proof",
					summary: "Checked induction in draft_3.tex:142-167.",
				},
			]);
			expect(state?.claims[0]?.evidenceIds).toEqual(["evidence-1"]);
			expect(state?.warnings).toMatchObject([
				{
					id: "warning-1",
					claimId: "claim-1",
					severity: "high",
					status: "resolved",
					message: "Endpoint boundary case still needs a written lemma.",
				},
			]);
			expect(state?.claims[0]?.warningIds).toEqual(["warning-1"]);
			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("Added evidence evidence-1 to claim-1");
			expect(visibleText).toContain("Added warning warning-1 to claim-1");
			expect(visibleText).toContain("Resolved warning warning-1");
			expect(visibleText).toContain("Co-math audit\nNo co-math audit problems found.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("reports malformed project state in /comath audit without mutating it", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-audit-invalid-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Workstream proposed a claim for audit coverage.",
					proposedClaims: [
						{
							statement: "Audit should catch broken references.",
						},
					],
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior for a permutation class", ctx);
			await command?.handler("workstream notes: collect manually checked proof notes", ctx);
			await command?.handler("run workstream workstream-notes", ctx);
			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state).toBeDefined();
			const malformedState: CoMathProjectState = {
				...(state as CoMathProjectState),
				workstreams: (state as CoMathProjectState).workstreams.map((workstream) =>
					workstream.id === "workstream-notes"
						? {
								...workstream,
								status: "running",
								latestRunIds: ["role-run-missing"],
							}
						: workstream,
				),
				reviewQueue: [
					...(state as CoMathProjectState).reviewQueue,
					{
						id: "review-ghost",
						claimId: "claim-missing",
						reason: "Malformed fixture should be reported.",
						createdAt: "2026-06-05T12:00:00.000Z",
					},
				],
				warnings: [
					...(state as CoMathProjectState).warnings,
					{
						id: "warning-ghost",
						claimId: "claim-missing",
						severity: "medium",
						status: "open",
						message: "Dangling warning fixture.",
						createdAt: "2026-06-05T12:00:00.000Z",
						updatedAt: "2026-06-05T12:00:00.000Z",
					},
					{
						id: "warning-owned",
						claimId: "claim-1",
						severity: "medium",
						status: "open",
						message: "Owned by claim-1.",
						createdAt: "2026-06-05T12:00:00.000Z",
						updatedAt: "2026-06-05T12:00:00.000Z",
					},
				],
				evidence: [
					...(state as CoMathProjectState).evidence,
					{
						id: "evidence-owned",
						claimId: "claim-1",
						kind: "proof",
						summary: "Owned by claim-1.",
						createdAt: "2026-06-05T12:00:00.000Z",
						updatedAt: "2026-06-05T12:00:00.000Z",
					},
				],
				claims: [
					...(state as CoMathProjectState).claims,
					{
						id: "claim-owner-mismatch",
						workstreamId: "workstream-notes",
						statement: "This claim references records owned by claim-1.",
						status: "needs_review",
						evidenceIds: ["evidence-owned"],
						warningIds: ["warning-owned"],
						createdAt: "2026-06-05T12:00:00.000Z",
						updatedAt: "2026-06-05T12:00:00.000Z",
					},
				],
				roleRuns: [
					...(state as CoMathProjectState).roleRuns,
					{
						id: "role-run-broken",
						role: "workstream",
						status: "completed",
						executionMode: "foreground",
						targetWorkstreamId: "workstream-missing",
						targetClaimId: "claim-missing",
						task: "Role: workstream",
						reportId: "report-missing",
						createdClaimIds: ["claim-missing"],
						createdEvidenceIds: ["evidence-missing"],
						createdWarningIds: ["warning-missing"],
						createdArtifactIds: ["artifact-missing"],
						blockerMessages: [],
						queuedAt: "2026-06-05T12:00:00.000Z",
						startedAt: "2026-06-05T12:00:00.000Z",
						completedAt: "2026-06-05T12:00:00.000Z",
						updatedAt: "2026-06-05T12:00:00.000Z",
					},
				],
				reviewRounds: [
					...(state as CoMathProjectState).reviewRounds,
					{
						id: "review-round-broken",
						claimId: "claim-missing",
						roleRunId: "role-run-missing",
						reportId: "report-missing",
						status: "completed",
						decisionStatus: "proved",
						outcome: "accepted",
						createdEvidenceIds: ["evidence-missing"],
						createdWarningIds: ["warning-missing"],
						resolvedWarningIds: ["warning-missing"],
						createdAt: "2026-06-05T12:00:00.000Z",
						updatedAt: "2026-06-05T12:00:00.000Z",
					},
				],
				reportReviewRounds: [
					...(state as CoMathProjectState).reportReviewRounds,
					{
						id: "report-review-broken",
						reportId: "report-missing",
						roleRunId: "role-run-missing",
						status: "completed",
						outcome: "blocked",
						summary: "Malformed report review fixture should be reported.",
						createdWarningIds: ["warning-missing"],
						createdAt: "2026-06-05T12:00:00.000Z",
						updatedAt: "2026-06-05T12:00:00.000Z",
					},
				],
				claimRevisions: [
					...(state as CoMathProjectState).claimRevisions,
					{
						id: "claim-revision-broken",
						claimId: "claim-missing",
						previousStatement: "Old statement.",
						revisedStatement: "New statement.",
						reason: "Malformed fixture should be reported.",
						actor: "human",
						createdAt: "2026-06-05T12:00:00.000Z",
					},
				],
			};
			await saveProjectState(getDefaultStatePath(tempDir), malformedState);

			await command?.handler("audit", ctx);

			const audit = notifications.at(-1) ?? "";
			expect(audit).toContain("Co-math audit");
			expect(audit).toContain("review-ghost points to missing claim claim-missing");
			expect(audit).toContain("warning-ghost points to missing claim claim-missing");
			expect(audit).toContain("role-run-broken points to missing workstream workstream-missing");
			expect(audit).toContain("role-run-broken points to missing claim claim-missing");
			expect(audit).toContain("role-run-broken points to missing report report-missing");
			expect(audit).toContain("role-run-broken references missing created claim claim-missing");
			expect(audit).toContain("role-run-broken references missing created evidence evidence-missing");
			expect(audit).toContain("role-run-broken references missing created warning warning-missing");
			expect(audit).toContain("role-run-broken references missing created artifact artifact-missing");
			expect(audit).toContain("review-round-broken points to missing claim claim-missing");
			expect(audit).toContain("review-round-broken points to missing role run role-run-missing");
			expect(audit).toContain("review-round-broken points to missing report report-missing");
			expect(audit).toContain("review-round-broken references missing created evidence evidence-missing");
			expect(audit).toContain("review-round-broken references missing created warning warning-missing");
			expect(audit).toContain("review-round-broken references missing resolved warning warning-missing");
			expect(audit).toContain("report-review-broken points to missing report report-missing");
			expect(audit).toContain("report-review-broken points to missing role run role-run-missing");
			expect(audit).toContain("report-review-broken references missing created warning warning-missing");
			expect(audit).toContain("claim-owner-mismatch references evidence evidence-owned owned by claim-1");
			expect(audit).toContain("claim-owner-mismatch references warning warning-owned owned by claim-1");
			expect(audit).toContain("claim-revision-broken points to missing claim claim-missing");
			expect(audit).toContain("workstream-notes references missing role run role-run-missing");
			expect(audit).toContain("workstream-notes is running but has no running role run targeting it");
			expect(JSON.parse(await readFile(getDefaultStatePath(tempDir), "utf8")) as unknown).toEqual(malformedState);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("audits suspicious queued and cancelled role run records without mutating state", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-audit-queued-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state).toBeDefined();
			const malformedState: CoMathProjectState = {
				...(state as CoMathProjectState),
				workstreams: (state as CoMathProjectState).workstreams.map((workstream) =>
					workstream.id === "workstream-endpoints"
						? {
								...workstream,
								latestRunIds: [],
							}
						: workstream,
				),
				roleRuns: [
					{
						id: "role-run-queued-broken",
						role: "workstream",
						status: "queued",
						targetWorkstreamId: "workstream-endpoints",
						task: "Role: workstream",
						reportId: "report-missing",
						createdClaimIds: ["claim-missing"],
						createdEvidenceIds: ["evidence-missing"],
						createdWarningIds: ["warning-missing"],
						createdArtifactIds: ["artifact-missing"],
						blockerMessages: [],
						queuedAt: "2026-06-05T12:00:00.000Z",
						startedAt: "2026-06-05T12:01:00.000Z",
						updatedAt: "2026-06-05T12:01:00.000Z",
					},
					{
						id: "role-run-cancelled-broken",
						role: "coordinator",
						status: "cancelled",
						task: "Role: coordinator",
						reportId: "report-missing",
						createdClaimIds: ["claim-missing"],
						createdEvidenceIds: ["evidence-missing"],
						createdWarningIds: ["warning-missing"],
						createdArtifactIds: ["artifact-missing"],
						blockerMessages: [],
						queuedAt: "2026-06-05T12:00:00.000Z",
						cancelledAt: "2026-06-05T12:01:00.000Z",
						completedAt: "2026-06-05T12:01:00.000Z",
						updatedAt: "2026-06-05T12:01:00.000Z",
					},
				],
			};
			await saveProjectState(getDefaultStatePath(tempDir), malformedState);

			await command?.handler("audit", ctx);

			const audit = notifications.at(-1) ?? "";
			expect(audit).toContain("role-run-queued-broken is queued but has startedAt set");
			expect(audit).toContain("role-run-queued-broken is queued but has report or created output ids");
			expect(audit).toContain(
				"role-run-queued-broken targets workstream workstream-endpoints but is missing from latestRunIds",
			);
			expect(audit).toContain("role-run-cancelled-broken is cancelled but has no cancel reason");
			expect(audit).toContain("role-run-cancelled-broken is cancelled but has report or created output ids");
			expect(await loadProjectState(getDefaultStatePath(tempDir))).toEqual(malformedState);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("audits stale background running records without mutating state", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-audit-background-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			const statePath = getDefaultStatePath(tempDir);
			const state = await loadProjectState(statePath);
			expect(state).toBeDefined();
			const malformedState: CoMathProjectState = {
				...(state as CoMathProjectState),
				roleRuns: [
					{
						id: "role-run-background-stale",
						role: "coordinator",
						status: "running",
						task: "Role: coordinator",
						executionMode: "background",
						createdClaimIds: [],
						createdEvidenceIds: [],
						createdWarningIds: [],
						createdArtifactIds: [],
						blockerMessages: [],
						queuedAt: "2026-06-05T12:00:00.000Z",
						startedAt: "2026-06-05T12:01:00.000Z",
						updatedAt: "2026-06-05T12:01:00.000Z",
					},
				],
			};
			await saveProjectState(statePath, malformedState);

			await command?.handler("audit", ctx);

			expect(notifications.at(-1)).toContain(
				"role-run-background-stale is a background running record not live in this session",
			);
			expect(await loadProjectState(statePath)).toEqual(malformedState);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("audit reports dangling paper section and margin note references without mutation", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-audit-paper-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture();
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			const statePath = getDefaultStatePath(tempDir);
			const state = await loadProjectState(statePath);
			expect(state).toBeDefined();
			const malformedState: CoMathProjectState = {
				...(state as CoMathProjectState),
				workingPaperSections: [
					{
						id: "paper-section-broken",
						title: "Broken section",
						body: "Malformed state fixture.",
						status: "draft",
						sourceClaimIds: ["claim-missing"],
						sourceEvidenceIds: ["evidence-missing"],
						sourceWarningIds: ["warning-missing"],
						sourceArtifactIds: ["artifact-missing"],
						sourceReviewRoundIds: ["review-round-missing"],
						sourceRoleRunIds: ["role-run-missing"],
						marginNoteIds: ["margin-note-missing"],
						createdAt: "2026-06-05T12:00:00.000Z",
						updatedAt: "2026-06-05T12:00:00.000Z",
					},
				],
				marginNotes: [
					{
						id: "margin-note-broken",
						kind: "gap",
						status: "open",
						subjectId: "subject-missing",
						sectionId: "paper-section-broken",
						message: "Dangling note fixture.",
						resolvedAt: "2026-06-05T12:01:00.000Z",
						createdAt: "2026-06-05T12:00:00.000Z",
						updatedAt: "2026-06-05T12:01:00.000Z",
					},
					{
						id: "margin-note-resolved-broken",
						kind: "todo",
						status: "resolved",
						subjectId: "project",
						message: "Resolved without resolution metadata.",
						createdAt: "2026-06-05T12:00:00.000Z",
						updatedAt: "2026-06-05T12:01:00.000Z",
					},
				],
			};
			await saveProjectState(statePath, malformedState);

			await command?.handler("audit", ctx);

			const audit = notifications.at(-1) ?? "";
			expect(audit).toContain("paper-section-broken sources missing claim claim-missing");
			expect(audit).toContain("paper-section-broken sources missing evidence evidence-missing");
			expect(audit).toContain("paper-section-broken sources missing warning warning-missing");
			expect(audit).toContain("paper-section-broken sources missing artifact artifact-missing");
			expect(audit).toContain("paper-section-broken sources missing review round review-round-missing");
			expect(audit).toContain("paper-section-broken sources missing role run role-run-missing");
			expect(audit).toContain("paper-section-broken references missing margin note margin-note-missing");
			expect(audit).toContain("margin-note-broken points to missing subject subject-missing");
			expect(audit).toContain(
				"margin-note-broken has sectionId paper-section-broken but section does not include it",
			);
			expect(audit).toContain("margin-note-broken is open but has resolvedAt set");
			expect(audit).toContain("margin-note-resolved-broken is resolved but has no resolution");
			expect(audit).toContain("margin-note-resolved-broken is resolved but has no resolvedAt");
			expect(await loadProjectState(statePath)).toEqual(malformedState);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("runs the reviewer role against a target claim and promotes only resolved proof-backed claims", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-run-reviewer-"));
		const roleInvocations: RoleRunInputForTest[] = [];
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async (input) => {
					roleInvocations.push(input);
					if (input.role === "reviewer") {
						return {
							summary: "Reviewer accepts the claim after resolving the finite-enumeration warning.",
							reviewDecision: {
								claimId: "claim-1",
								status: "proved",
								evidence: [
									{
										kind: "proof",
										summary: "Reviewer checked the lifting argument beyond the finite cases.",
									},
								],
								resolvedWarningIds: ["warning-1"],
							},
						};
					}
					return {
						summary: "Workstream found a candidate claim with a finite-enumeration warning.",
						proposedClaims: [
							{
								statement: "Endpoint monotonicity follows for the toy class.",
								evidence: [
									{
										kind: "computation",
										summary: "Enumerated the toy class through n = 5.",
									},
								],
								warnings: [
									{
										severity: "high",
										message: "Finite enumeration is not a proof.",
									},
								],
							},
						],
					};
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior for a permutation class", ctx);
			await command?.handler("workstream small-examples: enumerate exact small n examples", ctx);
			await command?.handler("run workstream workstream-small-examples", ctx);
			await command?.handler("run reviewer claim-1", ctx);
			await command?.handler("reviews", ctx);
			await command?.handler("reviews claim-1", ctx);
			await command?.handler("reviews claim-missing", ctx);
			await command?.handler("synthesize", ctx);

			expect(roleInvocations).toHaveLength(2);
			expect(roleInvocations[1]).toMatchObject({
				cwd: tempDir,
				role: "reviewer",
			});
			const reviewerTask = roleInvocations[1]?.task ?? "";
			expect(reviewerTask).toContain("Role: reviewer");
			expect(reviewerTask).toContain("Target claim: claim-1");
			expect(reviewerTask).toContain("Endpoint monotonicity follows for the toy class.");
			expect(reviewerTask).toContain("warning-1 [high] open: Finite enumeration is not a proof.");

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.claims[0]).toMatchObject({
				id: "claim-1",
				status: "proved",
				evidenceIds: ["evidence-1", "evidence-2"],
				warningIds: ["warning-1"],
			});
			expect(state?.evidence[1]).toMatchObject({
				id: "evidence-2",
				claimId: "claim-1",
				kind: "proof",
				summary: "Reviewer checked the lifting argument beyond the finite cases.",
			});
			expect(state?.warnings[0]).toMatchObject({
				id: "warning-1",
				status: "resolved",
			});
			expect(state?.reviewQueue).toEqual([]);
			expect(state?.roleRuns).toMatchObject([
				expect.objectContaining({
					id: "role-run-1",
					role: "workstream",
					targetWorkstreamId: "workstream-small-examples",
					reportId: "report-1",
				}),
				expect.objectContaining({
					id: "role-run-2",
					role: "reviewer",
					status: "completed",
					targetClaimId: "claim-1",
					reportId: "report-2",
					createdEvidenceIds: ["evidence-2"],
				}),
			]);
			expect(state?.reviewRounds).toMatchObject([
				{
					id: "review-round-1",
					claimId: "claim-1",
					roleRunId: "role-run-2",
					reportId: "report-2",
					status: "completed",
					decisionStatus: "proved",
					outcome: "accepted",
					createdEvidenceIds: ["evidence-2"],
					createdWarningIds: [],
					resolvedWarningIds: ["warning-1"],
				},
			]);
			const synthesis = notifications.at(-1) ?? "";
			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("Co-math review rounds");
			expect(visibleText).toContain(
				"review-round-1 claim-1 [accepted] decision=proved run=role-run-2 report=report-2 evidence+1 warnings+0 resolved=1",
			);
			expect(visibleText).toContain("No review rounds recorded for claim-missing.");
			expect(synthesis).toContain("claim-1: Endpoint monotonicity follows for the toy class.");
			expect(synthesis).toContain("proof: Reviewer checked the lifting argument beyond the finite cases.");
			expect(synthesis).toContain("No open warnings are recorded.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("records reviewer decisions even when proof promotion is blocked by invariants", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-review-decision-event-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async (input) => {
					if (input.role === "reviewer") {
						return {
							summary: "Reviewer attempted promotion but left a gap.",
							reviewDecision: {
								claimId: "claim-1",
								status: "proved",
							},
						};
					}
					return {
						summary: "Workstream proposed a claim for reviewer provenance.",
						proposedClaims: [
							{
								statement: "Endpoint induction should preserve review decision provenance.",
							},
						],
					};
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("goal Preserve review decisions", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);
			await command?.handler("run reviewer claim-1", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.claims[0]?.status).toBe("needs_review");
			expect(state?.reviewRounds).toMatchObject([
				{
					id: "review-round-1",
					claimId: "claim-1",
					roleRunId: "role-run-2",
					reportId: "report-2",
					status: "completed",
					decisionStatus: "proved",
					outcome: "blocked_by_invariant",
					createdEvidenceIds: [],
					createdWarningIds: [],
					resolvedWarningIds: [],
				},
			]);
			expect(state?.events).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						kind: "review_decision_recorded",
						actor: "reviewer",
						subjectId: "claim-1",
						relatedIds: ["report-2"],
						summary: "Recorded review decision for claim-1: proved",
					}),
				]),
			);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("keeps reviewer-approved claims out of synthesis when review leaves an open warning", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-reviewer-warning-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async (input) => {
					if (input.role === "reviewer") {
						return {
							summary: "Reviewer found a new boundary warning and cannot safely promote the claim.",
							reviewDecision: {
								claimId: "claim-1",
								status: "proved",
								evidence: [
									{
										kind: "proof",
										summary: "A partial proof was checked, except for the new boundary warning.",
									},
								],
								warnings: [
									{
										severity: "medium",
										message: "The endpoint boundary case is still unresolved.",
									},
								],
							},
						};
					}
					return {
						summary: "Workstream proposed a claim with computation evidence.",
						proposedClaims: [
							{
								statement: "A warning-blocked claim must not enter synthesis findings.",
								evidence: [
									{
										kind: "computation",
										summary: "Enumerated examples through n = 5.",
									},
								],
							},
						],
					};
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior for a permutation class", ctx);
			await command?.handler("workstream small-examples: enumerate exact small n examples", ctx);
			await command?.handler("run workstream workstream-small-examples", ctx);
			await command?.handler("run reviewer claim-1", ctx);
			await command?.handler("synthesize", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.claims[0]?.status).toBe("needs_review");
			expect(state?.warnings).toMatchObject([
				{
					id: "warning-1",
					claimId: "claim-1",
					status: "open",
					message: "The endpoint boundary case is still unresolved.",
				},
			]);
			const synthesis = notifications.at(-1) ?? "";
			expect(synthesis).toContain("No reviewed proved claims are recorded.");
			expect(synthesis).toContain("warning-1 [medium] on claim-1: The endpoint boundary case is still unresolved.");
			expect(synthesis).toContain("claim-1 [needs_review] excluded from synthesis findings pending review.");
			expect(synthesis).not.toContain("claim-1: A warning-blocked claim must not enter synthesis findings.");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("records invariant-blocked review rounds when an already proved claim receives a new open warning", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-reviewer-proved-new-warning-"));
		let reviewerRunCount = 0;
		try {
			const { commands } = createCoMathExtensionFixture({
				roleRunner: async (input) => {
					if (input.role === "reviewer") {
						reviewerRunCount += 1;
						if (reviewerRunCount === 1) {
							return {
								summary: "Reviewer proves the claim.",
								reviewDecision: {
									claimId: "claim-1",
									status: "proved",
									evidence: [
										{
											kind: "proof",
											summary: "Checked the proof for the first review.",
										},
									],
								},
							};
						}
						return {
							summary: "Reviewer finds a new unresolved gap in an already proved claim.",
							reviewDecision: {
								claimId: "claim-1",
								status: "proved",
								evidence: [
									{
										kind: "proof",
										summary: "Partial proof remains useful but does not close the new gap.",
									},
								],
								warnings: [
									{
										severity: "high",
										message: "New gap",
									},
								],
							},
						};
					}
					return {
						summary: "Workstream proposed a claim for repeated review.",
						proposedClaims: [
							{
								statement: "A previously proved claim can become blocked by new obligations.",
							},
						],
					};
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const notifications: string[] = [];
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);
			await command?.handler("run reviewer claim-1", ctx);
			let state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state).toBeDefined();
			expect(isClaimSynthesisEligible(state as CoMathProjectState, "claim-1")).toBe(true);

			await command?.handler("run reviewer claim-1", ctx);

			state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.reviewRounds).toHaveLength(2);
			expect(state?.reviewRounds[1]).toMatchObject({
				id: "review-round-2",
				claimId: "claim-1",
				decisionStatus: "proved",
				outcome: "blocked_by_invariant",
				createdEvidenceIds: ["evidence-2"],
				createdWarningIds: ["warning-1"],
			});
			expect(state?.reviewRounds[1]?.outcome).not.toBe("accepted");
			expect(state?.warnings).toMatchObject([
				{
					id: "warning-1",
					claimId: "claim-1",
					status: "open",
					message: "New gap",
				},
			]);
			expect(isClaimSynthesisEligible(state as CoMathProjectState, "claim-1")).toBe(false);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("records proof sketch reviewer decisions as revision-requested review rounds", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-reviewer-proof-sketch-"));
		try {
			const { commands } = createCoMathExtensionFixture({
				roleRunner: async (input) => {
					if (input.role === "reviewer") {
						return {
							summary: "Reviewer found a proof sketch that needs another pass.",
							reviewDecision: {
								claimId: "claim-1",
								status: "proof_sketch",
							},
						};
					}
					return {
						summary: "Workstream proposed a claim for proof-sketch review.",
						proposedClaims: [
							{
								statement: "A proof sketch should stay review-gated.",
							},
						],
					};
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const notifications: string[] = [];
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);
			await command?.handler("run reviewer claim-1", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.claims[0]?.status).toBe("proof_sketch");
			expect(state?.reviewRounds).toHaveLength(1);
			expect(state?.reviewRounds[0]).toMatchObject({
				id: "review-round-1",
				claimId: "claim-1",
				decisionStatus: "proof_sketch",
				outcome: "revision_requested",
			});
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("records rejected and needs-review reviewer outcomes", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-reviewer-outcomes-"));
		let reviewerRunCount = 0;
		try {
			const { commands } = createCoMathExtensionFixture({
				roleRunner: async (input) => {
					if (input.role === "reviewer") {
						reviewerRunCount += 1;
						return {
							summary:
								reviewerRunCount === 1 ? "Reviewer requests another pass." : "Reviewer disproves the claim.",
							reviewDecision: {
								claimId: "claim-1",
								status: reviewerRunCount === 1 ? "needs_review" : "disproved",
							},
						};
					}
					return {
						summary: "Workstream proposed a claim for outcome coverage.",
						proposedClaims: [
							{
								statement: "Reviewer outcomes should be recorded faithfully.",
							},
						],
					};
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const notifications: string[] = [];
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);
			await command?.handler("run reviewer claim-1", ctx);
			await command?.handler("run reviewer claim-1", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.reviewRounds).toHaveLength(2);
			expect(state?.reviewRounds[0]).toMatchObject({
				decisionStatus: "needs_review",
				outcome: "revision_requested",
			});
			expect(state?.reviewRounds[1]).toMatchObject({
				decisionStatus: "disproved",
				outcome: "rejected",
			});
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("does not record review rounds for mismatched reviewer decisions", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-reviewer-mismatch-"));
		try {
			const { commands } = createCoMathExtensionFixture({
				roleRunner: async (input) => {
					if (input.role === "reviewer") {
						return {
							summary: "Reviewer returned a decision for the wrong claim.",
							reviewDecision: {
								claimId: "claim-999",
								status: "needs_review",
							},
						};
					}
					return {
						summary: "Workstream proposed a claim for mismatch coverage.",
						proposedClaims: [
							{
								statement: "Mismatched decisions should not create rounds.",
							},
						],
					};
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const notifications: string[] = [];
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);
			await command?.handler("run reviewer claim-1", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.reports).toHaveLength(2);
			expect(state?.roleRuns).toMatchObject([
				expect.objectContaining({ id: "role-run-1", reportId: "report-1" }),
				expect.objectContaining({ id: "role-run-2", reportId: "report-2", targetClaimId: "claim-1" }),
			]);
			expect(state?.reviewRounds).toEqual([]);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("revises claims through a human command and displays claim history", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-revise-claim-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Workstream proposed a claim that needs human statement cleanup.",
					proposedClaims: [
						{
							statement: "Endpoint monotonicity holds before conventions are fixed.",
							evidence: [
								{
									kind: "computation",
									summary: "Checked examples through n = 5.",
								},
							],
							warnings: [
								{
									severity: "medium",
									message: "Endpoint convention is ambiguous.",
								},
							],
						},
					],
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);
			await command?.handler(
				"revise-claim claim-1: Endpoint monotonicity holds under the predecessor-canonical convention. --reason Human clarified endpoint convention.",
				ctx,
			);
			await command?.handler("claim-history claim-1", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.claims[0]).toMatchObject({
				id: "claim-1",
				statement: "Endpoint monotonicity holds under the predecessor-canonical convention.",
				status: "needs_review",
				evidenceIds: ["evidence-1"],
				warningIds: ["warning-1"],
			});
			expect(state?.claimRevisions).toMatchObject([
				{
					id: "claim-revision-1",
					claimId: "claim-1",
					previousStatement: "Endpoint monotonicity holds before conventions are fixed.",
					revisedStatement: "Endpoint monotonicity holds under the predecessor-canonical convention.",
					reason: "Human clarified endpoint convention.",
					actor: "human",
				},
			]);
			expect(state?.reviewQueue).toMatchObject([
				{
					claimId: "claim-1",
					reason: "Workstream proposed a claim that needs reviewer validation.",
				},
			]);
			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("Revised claim claim-1 and returned it to review");
			expect(visibleText).toContain("Claim history for claim-1");
			expect(visibleText).toContain(
				"Current [needs_review]: Endpoint monotonicity holds under the predecessor-canonical convention.",
			);
			expect(visibleText).toContain("claim-revision-1 human: Human clarified endpoint convention.");
			expect(visibleText).toContain("Open warnings: 1");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("displays claim history revisions and review rounds oldest first", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-claim-history-order-"));
		let reviewerRunCount = 0;
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async (input) => {
					if (input.role === "reviewer") {
						reviewerRunCount += 1;
						return {
							summary:
								reviewerRunCount === 1
									? "Reviewer requests a second revision."
									: "Reviewer disproves the revised claim.",
							reviewDecision: {
								claimId: "claim-1",
								status: reviewerRunCount === 1 ? "needs_review" : "disproved",
							},
						};
					}
					return {
						summary: "Workstream proposed a claim for history ordering.",
						proposedClaims: [
							{
								statement: "Initial statement for history ordering.",
							},
						],
					};
				},
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);
			await command?.handler("revise-claim claim-1: First revised statement. --reason First revision.", ctx);
			await command?.handler("run reviewer claim-1", ctx);
			await command?.handler("revise-claim claim-1: Second revised statement. --reason Second revision.", ctx);
			await command?.handler("run reviewer claim-1", ctx);
			await command?.handler("claim-history claim-1", ctx);

			const history = notifications.at(-1) ?? "";
			expect(history.indexOf("claim-revision-1")).toBeLessThan(history.indexOf("claim-revision-2"));
			expect(history.indexOf("review-round-1")).toBeLessThan(history.indexOf("review-round-2"));
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("validates claim revision and history commands", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-revise-invalid-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Workstream proposed a claim for revision validation.",
					proposedClaims: [
						{
							statement: "Revision validation claim.",
						},
					],
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior", ctx);
			await command?.handler("workstream endpoints: analyze endpoint induction", ctx);
			await command?.handler("run workstream workstream-endpoints", ctx);
			await command?.handler("revise-claim claim-1: Revised statement without reason.", ctx);
			await command?.handler("revise-claim claim-1 Revised statement --reason Missing colon.", ctx);
			await command?.handler("revise-claim claim-missing: Revised statement. --reason Missing claim.", ctx);
			await command?.handler("revise-claim claim-1: --reason Empty statement.", ctx);
			await command?.handler("revise-claim claim-1: Revised statement. --reason", ctx);
			await command?.handler("claim-history claim-missing", ctx);
			await command?.handler("claim-history", ctx);

			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.claimRevisions).toEqual([]);
			const visibleText = notifications.join("\n");
			expect(visibleText).toContain("Usage: /comath revise-claim <claim-id>: <new statement> --reason <reason>");
			expect(visibleText).toContain("Unknown claim: claim-missing");
			expect(visibleText).toContain("Usage: /comath claim-history <claim-id>");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("produces cautious synthesis markdown from reviewed state with mandatory open-warning sections", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "pi-comath-synthesize-"));
		try {
			const { commands, notifications } = createCoMathExtensionFixture({
				roleRunner: async () => ({
					summary: "Workstream found a finite obstruction pattern; treat it as experimental.",
					proposedClaims: [
						{
							statement: "Unreviewed finite-obstruction claim should not enter synthesis findings.",
							evidence: [
								{
									kind: "computation",
									summary: "Enumerated all n <= 5 toy-class examples and found one obstruction.",
								},
							],
							warnings: [
								{
									severity: "high",
									message: "Finite enumeration is not a proof for all n.",
								},
							],
						},
					],
				}),
			});
			const command = commands.get("comath");
			expect(command).toBeDefined();
			const ctx = createCommandContext(notifications, tempDir);

			await command?.handler("init Study endpoint behavior for a permutation class", ctx);
			await command?.handler("goal Prove or refute the first nontrivial endpoint monotonicity case", ctx);
			await command?.handler(
				"workstream small-examples: enumerate exact small n examples and report obstructions",
				ctx,
			);
			await command?.handler("run workstream workstream-small-examples", ctx);
			await command?.handler("synthesize", ctx);

			const synthesis = notifications.at(-1) ?? "";
			expect(synthesis).toContain("# Co-math synthesis: Study endpoint behavior for a permutation class");
			expect(synthesis).toContain("## Proved claims");
			expect(synthesis).toContain("No reviewed proved claims are recorded.");
			expect(synthesis).toContain("## Open warnings");
			expect(synthesis).toContain("warning-1 [high] on claim-1: Finite enumeration is not a proof for all n.");
			expect(synthesis).toContain("## Excluded unreviewed claims");
			expect(synthesis).toContain("claim-1 [needs_review] excluded from synthesis findings pending review.");
			expect(synthesis).not.toContain("Unreviewed finite-obstruction claim should not enter synthesis findings.");
			const state = await loadProjectState(getDefaultStatePath(tempDir));
			expect(state?.events.map((event) => event.kind)).toContain("synthesis_generated");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	describe("documentation artifacts", () => {
		it("documents manual co-math extension usage and sample commands without established math claims", async () => {
			const readme = await readFile(join(extensionDir, "README.md"), "utf8");

			expect(readme).toContain("cd /Users/hanzhangyin/Developer/pi-mono-comath/packages/coding-agent");
			expect(readme).toContain("pi -e examples/extensions/co-math/index.ts");
			expect(readme).toContain("/comath init Study endpoint behavior for a permutation class");
			expect(readme).toContain("/comath goal Prove or refute the first nontrivial endpoint monotonicity case");
			expect(readme).toContain(
				"/comath workstream small-examples: enumerate exact small n examples and report obstructions",
			);
			expect(readme).toContain("/comath run coordinator");
			expect(readme).toContain("/comath run workstream workstream-small-examples");
			expect(readme).toContain("/comath evidence claim-1 proof: Checked induction in draft_3.tex:142-167");
			expect(readme).toContain("/comath warning claim-1 high: Endpoint boundary case still needs a written lemma");
			expect(readme).toContain("/comath resolve-warning warning-1");
			expect(readme).toContain("/comath audit");
			expect(readme).toContain("/comath review-queue");
			expect(readme).toContain("/comath reviews");
			expect(readme).toContain("/comath revise-claim");
			expect(readme).toContain("/comath claim-history");
			expect(readme).toContain("/comath run reviewer claim-1");
			expect(readme).toContain("/comath synthesize");
			expect(readme).toContain("/comath status");
			expect(readme).toContain("/comath artifact");
			expect(readme).toContain("/comath artifacts");
			expect(readme).toContain("/comath timeline");
			expect(readme).toContain("/comath runs");
			expect(readme).toContain("/comath run-status");
			expect(readme).toContain("/comath queue");
			expect(readme).toContain("/comath dispatch-next");
			expect(readme).toContain("/comath dispatch-run");
			expect(readme).toContain("/comath cancel-run");
			expect(readme).toContain("/comath dispatch-next --background");
			expect(readme).toContain("/comath dispatch-run role-run-2 --background");
			expect(readme).toContain("/comath background-runs");
			expect(readme).toContain("/comath abort-run");
			expect(readme).toContain("/comath paper-section");
			expect(readme).toContain("/comath margin-note");
			expect(readme).toContain("/comath resolve-margin-note");
			expect(readme).toContain("/comath margin-notes");
			expect(readme).toContain("/comath paper");
			expect(readme).toContain("/comath export-paper");
			expect(readme).toContain("/comath artifact-file");
			expect(readme).toContain("/comath computation");
			expect(readme).toContain("/comath block");
			expect(readme).toContain("/comath unblock");
			expect(readme).toContain("/comath note");
			expect(readme).toContain("/comath recover-run");
			expect(readme).toContain("proposedArtifacts");
			expect(readme.toLowerCase()).toContain("does not establish any mathematical claim");
			expect(readme.toLowerCase()).toContain("event log");
			expect(readme.toLowerCase()).toContain("artifact registry");
			expect(readme.toLowerCase()).toContain("metadata only");
			expect(readme.toLowerCase()).toContain("workstream lifecycle");
			expect(readme.toLowerCase()).toContain("role run records");
			expect(readme.toLowerCase()).toContain("queued");
			expect(readme.toLowerCase()).toContain("cancelled");
			expect(readme.toLowerCase()).toContain("background");
			expect(readme.toLowerCase()).toContain("human intervention");
			expect(readme.toLowerCase()).toContain("stale running");
			expect(readme).toContain("recover-run");
			expect(readme.toLowerCase()).toContain("not proof evidence");
			expect(readme.toLowerCase()).toContain("review rounds");
			expect(readme.toLowerCase()).toContain("claim revision history");
			expect(readme.toLowerCase()).toContain("proof-promotion invariant");
			expect(readme).toContain("blocked");
			expect(readme).toContain("start queued work asynchronously");
			expect(readme.toLowerCase()).toContain("working-paper sections");
			expect(readme.toLowerCase()).toContain("draft workspace records");
			expect(readme.toLowerCase()).toContain("margin notes");
			expect(readme.toLowerCase()).toContain("paper annotations");
			expect(readme.toLowerCase()).toContain("non-synthesis-eligible");
			expect(readme.toLowerCase()).toContain("exports are snapshots");
			expect(readme.toLowerCase()).toContain("file-backed artifacts");
			expect(readme.toLowerCase()).toContain("metadata and not proof evidence");
			expect(readme.toLowerCase()).toContain("computation artifacts are provenance records");
			expect(readme).toContain("SHA-256");
			expect(readme).toContain("no LaTeX or PDF generation");
			expect(readme).toContain("structured JSON");
			expect(readme).toContain("report only");
			expect(readme).toContain("malformed");
			expect(readme).toContain("claims remain review-gated");
		});

		it("defines the four role prompts with required warning and provenance discipline", async () => {
			const roleFiles = [
				["coordinator.md", ["approved goals", "workstreams", "Never state a claim as proved", "open warnings"]],
				["workstream.md", ["one narrow goal", "small exact examples", "provenance", "uncertain"]],
				["reviewer.md", ["proof gaps", "WarningRecord", "open warnings", "Refuse to promote"]],
				["synthesizer.md", ["cautious draft prose", "warning section", "proved", "failed attempt"]],
			] as const;

			for (const [fileName, expectedPhrases] of roleFiles) {
				const content = await readFile(join(extensionDir, "agents", fileName), "utf8");
				expect(content).toContain("---");
				for (const phrase of expectedPhrases) {
					expect(content).toContain(phrase);
				}
				expect(content).toContain("exactly one JSON object");
				expect(content).toContain("summary");
				expect(content).toContain("proposedClaims");
				expect(content).toContain("reviewDecision");
				expect(content).toContain("blockers");
				expect(content).toContain("proposedArtifacts");
				expect(content).toContain("failed_attempt");
				expect(content).toContain("provenance");
			}
		});

		it("documents events and artifacts in the state tool prompt", async () => {
			const content = await readFile(join(extensionDir, "state-tool.ts"), "utf8");

			expect(content).toContain("events");
			expect(content).toContain("artifacts");
			expect(content).toContain("roleRuns");
			expect(content).toContain("queued");
			expect(content).toContain("cancelled");
			expect(content).toContain("background");
			expect(content).toContain("latestRunIds");
			expect(content).toContain("status");
			expect(content).toContain("human intervention");
			expect(content).toContain("stale running");
			expect(content).toContain("not proof evidence");
			expect(content).toContain("reviewRounds");
			expect(content).toContain("claimRevisions");
			expect(content).toContain("working paper");
			expect(content).toContain("margin notes");
			expect(content).toContain("Working paper sections");
			expect(content).toContain("Open margin notes");
			expect(content).toContain("File-backed artifacts");
		});
	});
});
