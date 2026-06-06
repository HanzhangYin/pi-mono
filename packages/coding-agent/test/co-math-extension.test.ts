import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import coMathExtension from "../examples/extensions/co-math/index.ts";
import type { CoMathProjectState } from "../examples/extensions/co-math/schema.ts";
import {
	getDefaultStatePath,
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
	status: "proved" | "needs_review" | "disproved";
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
				],
				roleRuns: [
					...(state as CoMathProjectState).roleRuns,
					{
						id: "role-run-broken",
						role: "workstream",
						status: "completed",
						targetWorkstreamId: "workstream-missing",
						targetClaimId: "claim-missing",
						task: "Role: workstream",
						reportId: "report-missing",
						createdClaimIds: ["claim-missing"],
						createdEvidenceIds: ["evidence-missing"],
						createdWarningIds: ["warning-missing"],
						createdArtifactIds: ["artifact-missing"],
						blockerMessages: [],
						startedAt: "2026-06-05T12:00:00.000Z",
						completedAt: "2026-06-05T12:00:00.000Z",
						updatedAt: "2026-06-05T12:00:00.000Z",
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
			expect(audit).toContain("workstream-notes references missing role run role-run-missing");
			expect(audit).toContain("workstream-notes is running but has no running role run targeting it");
			expect(await loadProjectState(getDefaultStatePath(tempDir))).toEqual(malformedState);
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
			const synthesis = notifications.at(-1) ?? "";
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
			expect(readme).toContain("/comath run reviewer claim-1");
			expect(readme).toContain("/comath synthesize");
			expect(readme).toContain("/comath status");
			expect(readme).toContain("/comath artifact");
			expect(readme).toContain("/comath artifacts");
			expect(readme).toContain("/comath timeline");
			expect(readme).toContain("/comath runs");
			expect(readme).toContain("/comath run-status");
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
			expect(readme.toLowerCase()).toContain("human intervention");
			expect(readme.toLowerCase()).toContain("stale running");
			expect(readme.toLowerCase()).toContain("not proof evidence");
			expect(readme).toContain("blocked");
			expect(readme).toContain("not asynchronous");
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
			expect(content).toContain("latestRunIds");
			expect(content).toContain("status");
			expect(content).toContain("human intervention");
			expect(content).toContain("stale running");
			expect(content).toContain("not proof evidence");
		});
	});
});
