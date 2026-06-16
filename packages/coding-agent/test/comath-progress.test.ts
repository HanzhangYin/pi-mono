import { describe, expect, it } from "vitest";
import type {
	ComputationalArtifact,
	ResearchPath,
	ResearchWorkstreamRunRecord,
} from "../examples/extensions/co-math/schema.ts";
import { STALE_RESEARCH_WORKSTREAM_RUN_REASON } from "../examples/extensions/co-math/storage.ts";
import {
	formatBackgroundRunStarted,
	formatCoMathProductHelp,
	formatCoMathResearchActivityStatus,
	formatCoMathWelcome,
	formatContextRecorded,
	formatExistingProjectHelp,
	formatFocusNoted,
	formatInitialValidationPlan,
	formatLatestResearchCoordinatorReportMissing,
	formatProductActivity,
	formatProductProgress,
	formatReadyForContext,
	formatResearchCoordinatorReport,
	formatResearchFocusUpdated,
	formatResearchPathDropped,
	formatResearchRoundCompleted,
	formatResearchRoundUpdated,
	formatResearchStateSummary,
	formatResearchWorkspacePrepared,
	formatResearchWorkstreamCompleted,
	formatResearchWorkstreamReport,
	formatResearchWorkstreamRunFailed,
	formatResearchWorkstreamRunProgress,
	formatResearchWorkstreamRunStarted,
	formatResearchWorkstreamRunStillRunningReport,
	formatResearchWorkstreamStageStarted,
	formatResearchWorkstreamStarted,
	formatSetupStep,
	formatSteeringNoted,
	formatWaitingForContext,
} from "../src/modes/comath/comath-progress.ts";
import { createCoMathResearchAutoPlan } from "../src/modes/comath/comath-research-autoplan.ts";
import { runResearchWorkstream } from "../src/modes/comath/comath-research-workstream.ts";

const FORBIDDEN_PRODUCT_TERMS = [
	"Co-math research mode",
	"co-math project",
	"co-math goal",
	"co-math workstream",
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

describe("co-math product messages", () => {
	it("formats Pi-native startup copy", () => {
		const text = formatCoMathWelcome({
			input: "/tmp/paper.pdf",
			absolutePath: "/tmp/paper.pdf",
			displayName: "paper.pdf",
			exists: true,
			isFile: true,
		});
		expect(text).toContain("Pi is ready");
		expect(text).toContain("Source: paper.pdf");
		expect(text).toContain("Describe the problem you want to investigate.");
		expect(text).not.toContain("Co-math research mode");
		expectProductCopy(text);
	});

	it("formats sourceless startup copy", () => {
		const text = formatCoMathWelcome(undefined);
		expect(text).toContain("Pi is ready");
		expect(text).toContain("Describe the problem you want to investigate.");
		expectProductCopy(text);
	});

	it("formats missing-source startup warnings", () => {
		const text = formatCoMathWelcome({
			input: "missing.pdf",
			absolutePath: "/tmp/missing.pdf",
			displayName: "missing.pdf",
			exists: false,
			isFile: false,
			missingReason: "Source path is not readable.",
		});
		expect(text).toContain("Pi is ready");
		expect(text).toContain("Source warning: missing.pdf");
		expect(text).toContain("Source path is not readable.");
		expectProductCopy(text);
	});

	it("formats Pi-native help copy", () => {
		const help = formatCoMathProductHelp();
		expect(help).toContain("Pi math validation help");
		expect(help).toContain("show progress");
		expect(help).toContain("show report");
		expectProductCopy(help);
	});

	it("formats existing-project help with natural steering", () => {
		const help = formatExistingProjectHelp();
		expect(help).toContain("show progress");
		expectProductCopy(help);
	});

	it("formats the initial validation plan", () => {
		const text = formatInitialValidationPlan("Validate Question 3.", "paper.pdf");
		expect(text).toContain("I’ll set up a source-backed validation run for: Validate Question 3.");
		expect(text).toContain("Plan");
		expect(text).toContain("- Start with the source audit.");
		expect(text).toContain("Source: paper.pdf");
		expectProductCopy(text);
		expectProductCopy(formatInitialValidationPlan("Validate Question 3."));
	});

	it("formats the validation plan and waiting copy for setup-only mode", () => {
		const plan = formatInitialValidationPlan("Problem X", "paper.pdf", { waitForContext: true });
		expect(plan).toContain("- Wait for your pasted context before starting the first audit.");
		expect(plan).not.toContain("- Start with the source audit.");
		expectProductCopy(plan);

		const waiting = formatWaitingForContext(true);
		expect(waiting).toContain("✓ Source audit prepared");
		expect(waiting).toContain("I’ll start validating automatically");
		// "continue" remains available but must no longer be presented as required.
		expect(waiting).toContain('say "continue" to start right away');
		expect(waiting).not.toContain("when you are ready to start");
		expectProductCopy(waiting);

		expect(formatWaitingForContext(false)).not.toContain("✓ Source audit prepared");
	});

	it("formats human-first context copy without asking for continue", () => {
		const ready = formatReadyForContext();
		expect(ready).toContain("✓ Source audit prepared");
		expect(ready).toContain("Please paste the question statement, candidate solution, or relevant context.");
		expect(ready).toContain("I’ll start validating automatically once you do.");
		// Human-first copy must not tell the user to type a command.
		expect(ready).not.toContain("continue");
		expectProductCopy(ready);

		const recorded = formatContextRecorded();
		expect(recorded).toContain("added that to the validation context");
		expectProductCopy(recorded);
	});

	it("formats setup steps and background run start", () => {
		expect(formatSetupStep("Source pinned: paper.pdf")).toBe("✓ Source pinned: paper.pdf");
		const started = formatBackgroundRunStarted(".pi/co-math/transcripts/run.jsonl");
		expect(started).toContain("→ Running source audit in the background");
		expect(started).toContain("Latest transcript: .pi/co-math/transcripts/run.jsonl");
		expect(started).toContain("show progress");
		expectProductCopy(formatBackgroundRunStarted());
	});

	it("formats product activity updates without internal terms", () => {
		const activity = formatProductActivity({ stepLabel: "Source audit", message: "Reading source context" });
		expect(activity).toBe("Source audit activity\n- Reading source context");
		expectProductCopy(activity);
		const withDetail = formatProductActivity({
			stepLabel: "Source audit",
			message: "Running a local check",
			detail: "checking definitions",
		});
		expect(withDetail).toContain("- Running a local check");
		expect(withDetail).toContain("  checking definitions");
		expectProductCopy(withDetail);
	});

	it("formats focus and steering acknowledgements", () => {
		const focus = formatFocusNoted("the support indexing gap");
		expect(focus).toContain("Focus noted: the support indexing gap.");
		expectProductCopy(focus);
		expectProductCopy(formatSteeringNoted());
	});

	it("formats product progress summaries", () => {
		const progress = formatProductProgress({
			status: "running",
			background: true,
			transcriptPath: ".pi/co-math/transcripts/run.jsonl",
		});
		expect(progress).toContain("Current progress");
		expect(progress).toContain("- Source audit: running");
		expect(progress).toContain("- Running in background: yes");
		expect(progress).toContain("- Latest transcript: .pi/co-math/transcripts/run.jsonl");
		expect(progress).toContain("- Report: none yet");
		expect(progress).toContain("- Blockers: none");

		const blocked = formatProductProgress({
			status: "blocked",
			reportId: "report-1",
			blockers: ["No literal Question 3 statement in the source."],
		});
		expect(blocked).toContain("- Source audit: blocked");
		expect(blocked).toContain("- Report: ready");
		expect(blocked).toContain("- Blockers:");
		expect(blocked).toContain("  - No literal Question 3 statement in the source.");

		const queued = formatProductProgress({ status: "queued", background: false });
		expect(queued).toContain("- Source audit: prepared; waiting for you to say continue");
		expectProductCopy(queued);

		const empty = formatProductProgress(undefined);
		expect(empty).toContain("No audit run has started yet.");
		expectProductCopy(empty);
	});

	it("redacts internal ids from progress blockers", () => {
		const progress = formatProductProgress({
			status: "blocked",
			blockers: ["Need context for workstream-extract-question-2-definitions before role-run-3 can proceed."],
		});
		expect(progress).not.toContain("workstream-extract-question-2-definitions");
		expect(progress).not.toContain("role-run-3");
		expect(progress).toContain("this audit step");
		expect(progress).toContain("this run");
		expectProductCopy(progress);
	});

	it("formats research workspace and state summaries without internal terms", () => {
		const plan = createCoMathResearchAutoPlan("Are there infinitely many primes of the form n^2 + 1?");
		const workspace = formatResearchWorkspacePrepared(plan);
		expect(workspace).toContain("Research workspace prepared");
		expect(workspace).toContain("Path 1: Small examples and counterexamples");
		expect(workspace).toContain("Next");
		expect(workspace).toContain("continue path 1");
		expectProductCopy(workspace);

		const paths = plan.paths.map(
			(path, index): ResearchPath => ({
				id: `path-${index + 1}`,
				title: path.title,
				objective: path.objective,
				status: index === 1 ? "abandoned" : "active",
				latestFindings: index === 0 ? ["n = 1 gives 2, prime."] : [],
				blockers: [],
				suggestedNextMove: path.suggestedNextMove,
				priority: path.priority,
				createdAt: "2026-06-05T12:00:00.000Z",
				updatedAt: "2026-06-05T12:00:00.000Z",
			}),
		);
		const summary = formatResearchStateSummary({
			researchPaths: paths,
			researchFocus: { pathIds: ["path-1"], reason: "Focus on examples.", updatedAt: "2026-06-05T12:00:00.000Z" },
		});
		expect(summary).toContain("Current research state");
		expect(summary).toContain("Active paths");
		expect(summary).toContain("Path 1: Small examples and counterexamples");
		expect(summary).toContain("Path 2: Direct proof attempt");
		expect(summary).toContain("Latest findings");
		expect(summary).toContain("n = 1 gives 2, prime.");
		expect(summary).toContain("Abandoned for now");
		expect(summary).toContain("Suggested command");
		expect(summary).toContain("continue path 1");
		expectProductCopy(summary);
	});

	it("formats research steering updates", () => {
		const path: ResearchPath = {
			id: "path-1",
			title: "Small examples and counterexamples",
			objective: "List examples.",
			status: "active",
			latestFindings: [],
			blockers: [],
			suggestedNextMove: "Compute more examples.",
			priority: 1,
			createdAt: "2026-06-05T12:00:00.000Z",
			updatedAt: "2026-06-05T12:00:00.000Z",
		};
		expect(formatResearchFocusUpdated(path, "User asked to focus on counterexamples.")).toContain("Focus updated");
		expect(formatResearchPathDropped(path, "The user asked to drop this path.")).toContain("Abandoned for now");
		expect(formatResearchRoundUpdated(path, "No conclusion yet.")).toContain("Research round updated");
		expect(
			formatResearchRoundCompleted({
				state: { researchPaths: [path] },
				path,
				findings: ["n = 1 gives 2, prime."],
				uncertainties: ["This does not prove infinitude."],
				suggestedNextMove: "Check more examples.",
				workingPaperSectionTitle: "Examples and evidence",
			}),
		).toContain("Research round completed");
		expectProductCopy(formatResearchFocusUpdated(path, "User asked to focus on counterexamples."));
		expectProductCopy(formatResearchPathDropped(path, "The user asked to drop this path."));
		expectProductCopy(
			formatResearchRoundCompleted({
				state: { researchPaths: [path] },
				path,
				findings: ["n = 1 gives 2, prime."],
				uncertainties: ["This does not prove infinitude."],
				suggestedNextMove: "Check more examples.",
				workingPaperSectionTitle: "Examples and evidence",
			}),
		);
	});

	it("formats research workstream started, completed, and report copy", () => {
		const plan = createCoMathResearchAutoPlan("Are there infinitely many primes of the form n^2 + 1?");
		const paths = plan.paths.map(
			(planPath, index): ResearchPath => ({
				id: `path-${index + 1}`,
				title: planPath.title,
				objective: planPath.objective,
				status: "active",
				latestFindings: [],
				blockers: [],
				suggestedNextMove: planPath.suggestedNextMove,
				priority: planPath.priority,
				createdAt: "2026-06-05T12:00:00.000Z",
				updatedAt: "2026-06-05T12:00:00.000Z",
			}),
		);
		const directProof = paths[1];
		if (!directProof) {
			throw new Error("Expected a direct proof research path.");
		}
		const report = runResearchWorkstream({
			rootQuestion: plan.rootQuestion,
			path: directProof,
			allPaths: paths,
			now: "2026-06-05T12:30:00.000Z",
		});
		const state = { researchPaths: paths };

		const started = formatResearchWorkstreamStarted({ state, report });
		expect(started).toContain("Research workstream started");
		expect(started).toContain("Path 2: Direct proof attempt");
		expect(started).toContain("Progress");
		expectProductCopy(started);

		const completed = formatResearchWorkstreamCompleted({ state, report });
		expect(completed).toContain("Research run completed");
		expect(completed).toContain("Promising strategy");
		expect(completed).toContain("Review");
		expect(completed).toContain("Gap");
		expect(completed).toContain("Next");
		expect(completed).toContain("continue path");
		expect(completed).toContain("Working paper updated");
		expect(completed).toContain("show latest report");
		expectProductCopy(completed);

		const full = formatResearchWorkstreamReport({ state, report });
		expect(full).toContain("Latest research report");
		expect(full).toContain("Path 2: Direct proof attempt");
		expect(full).toContain("Coordinator brief");
		expect(full).toContain("Specialist attempt");
		expect(full).toContain("Critic review");
		expect(full).toContain("Synthesis");
		expect(full).toContain("Next");
		expectProductCopy(full);
	});

	it("makes active async research workstreams visibly running", () => {
		const path = createComputationPath();
		const run: ResearchWorkstreamRunRecord = {
			id: "research-run-1",
			pathId: path.id,
			pathTitle: path.title,
			status: "running",
			currentStage: "coordinator",
			startedAt: "2026-06-05T12:00:00.000Z",
			updatedAt: "2026-06-05T12:00:00.000Z",
			incrementalReports: [],
		};
		const state = { researchPaths: [path] };

		const started = formatResearchWorkstreamRunStarted({ state, run });
		expect(started).toContain("Research workstream running in the background");
		expect(started).toContain("Pi is still working on this path.");
		expect(started).toContain("Current stage\nChoosing the plan");
		expect(started).toContain('Say "show progress" for the latest status.');
		expectProductCopy(started);

		const stageUpdate = formatResearchWorkstreamStageStarted({
			state,
			run,
			stage: "computation",
			summary: "Running the bounded finite computation.",
		});
		expect(stageUpdate).toContain("Research update");
		expect(stageUpdate).toContain("Pi is still working in the background.");
		expect(stageUpdate).toContain("Current stage\nRunning finite computation");
		expect(stageUpdate).toContain("Running the bounded finite computation.");
		expect(stageUpdate).toContain("show progress");
		expectProductCopy(stageUpdate);

		expect(formatCoMathResearchActivityStatus({ state, run })).toBe("co-math: Path 1 running · coordinator");
		expect(formatCoMathResearchActivityStatus({ state, run, stage: "computation" })).toBe(
			"co-math: Path 1 running · computation",
		);
	});

	it("formats active research workstream progress without raw run ids", () => {
		const path = createResearchPath();
		const run = createRunningResearchWorkstreamRun(path);
		const progress = formatResearchWorkstreamRunProgress({ state: { researchPaths: [path] }, run });

		expect(progress).toContain("Research workstream running");
		expect(progress).toContain("Path 1: Direct proof attempt");
		expect(progress).toContain("Pi is still working in the background. You can keep typing.");
		expect(progress).toContain("Current stage");
		expect(progress).toContain("Trying the research path");
		expect(progress).toContain("Latest update");
		expect(progress).toContain("Testing whether a sieve formulation can produce prime pairs at distance 2.");
		expect(progress).toContain('Report: not ready yet. Say "show latest report" for partial updates.');
		expect(progress).not.toContain("research-run-1");
		expectProductCopy(progress);
	});

	it("formats active literature workstream progress naturally", () => {
		const path = createLiteraturePath();
		const run: ResearchWorkstreamRunRecord = {
			...createRunningResearchWorkstreamRun(path),
			pathId: path.id,
			pathTitle: path.title,
			currentStage: "literature-search",
			incrementalReports: [
				{
					id: "research-run-1-incremental-1",
					stage: "literature-search",
					status: "running",
					title: "Literature search",
					summary: "Looking for references related to the twin-prime conjecture.",
					details: ["Separating exact twin-prime infinitude from weaker bounded-gap results."],
					createdAt: "2026-06-05T12:01:00.000Z",
				},
			],
		};
		const progress = formatResearchWorkstreamRunProgress({ state: { researchPaths: [path] }, run });

		expect(progress).toContain("Searching references");
		expect(progress).toContain("Looking for references related to the twin-prime conjecture.");
		expect(progress).not.toContain("research-run-1");
		expectProductCopy(progress);
	});

	it("formats a running latest research report with partial reports", () => {
		const path = createResearchPath();
		const run = createRunningResearchWorkstreamRun(path);
		const report = formatResearchWorkstreamRunStillRunningReport({ state: { researchPaths: [path] }, run });

		expect(report).toContain("Latest research report is still running.");
		expect(report).toContain("Path 1: Direct proof attempt");
		expect(report).toContain("Incremental reports");
		expect(report).toContain("Coordinator brief: completed");
		expect(report).toContain("Specialist attempt: running");
		expect(report).not.toContain("research-run-1");
		expectProductCopy(report);
	});

	it("formats source-aware reports with references and unsupported claims", () => {
		const path = createLiteraturePath();
		const report = {
			pathId: path.id,
			pathTitle: path.title,
			status: "completed" as const,
			coordinatorBrief: "Check exact source support.",
			steps: [
				{
					role: "coordinator" as const,
					title: "Coordinator brief",
					summary: "Framed source support.",
					details: ["Check exact source support."],
				},
				{
					role: "specialist" as const,
					title: "Literature findings",
					summary: "Reviewed sources.",
					details: ["The twin-prime conjecture remains open. [source-1]"],
				},
				{
					role: "critic" as const,
					title: "Source-support review",
					summary: "Checked overclaims.",
					details: ["No source proves twin-prime infinitude."],
				},
			],
			promisingStrategy: ["Use source-backed distinctions."],
			findings: ["The twin-prime conjecture remains open. [source-1]"],
			criticisms: ["Do not conflate bounded gaps with gaps exactly 2."],
			gaps: ["No source proves twin-prime infinitude."],
			humanHelpUseful: [],
			suggestedNextMove: "Revise the direct-proof path.",
			workingPaperSectionTitle: "Literature/theorem targets",
			sourceIds: ["source-1"],
			claimSupportIds: ["claim-support-1", "claim-support-2"],
		};
		const state = {
			researchPaths: [path],
			literatureSources: [
				{
					id: "source-1",
					kind: "paper" as const,
					title: "Twin prime conjecture status note",
					url: "https://example.test/twin-prime-status",
					authors: [],
					summary: "The twin-prime conjecture remains open.",
					createdAt: "2026-06-05T12:00:00.000Z",
					updatedAt: "2026-06-05T12:00:00.000Z",
				},
			],
			literatureClaimSupports: [
				{
					id: "claim-support-1",
					claim: "The twin-prime conjecture remains open.",
					sourceIds: ["source-1"],
					status: "supported" as const,
					createdAt: "2026-06-05T12:00:00.000Z",
					updatedAt: "2026-06-05T12:00:00.000Z",
				},
				{
					id: "claim-support-2",
					claim: "A source proves twin-prime infinitude.",
					sourceIds: [],
					status: "unsupported" as const,
					note: "No source id was attached to this claim.",
					createdAt: "2026-06-05T12:00:00.000Z",
					updatedAt: "2026-06-05T12:00:00.000Z",
				},
			],
		};

		const completed = formatResearchWorkstreamCompleted({ state, report });
		expect(completed).toContain("References");
		expect(completed).toContain("source-1: Twin prime conjecture status note");
		expect(completed).toContain("unsupported: A source proves twin-prime infinitude.");
		expect(completed).not.toContain("research-run-1");
		expectProductCopy(completed);

		const details = formatResearchWorkstreamReport({ state, report });
		expect(details).toContain("Literature findings");
		expect(details).toContain("Source-support review");
		expect(details).toContain("References / attachments");
		expect(details).toContain("Claim support");
		expectProductCopy(details);
	});

	it("formats computation reports with concise output and attachments", () => {
		const path = createComputationPath();
		const computationalArtifacts: ComputationalArtifact[] = [
			{
				id: "computation-artifact-1",
				pathId: path.id,
				reportId: "research-report-1",
				runId: "research-run-1",
				kind: "script",
				status: "completed",
				title: "Computation script",
				filePath: ".pi/co-math/artifacts/research-run-1/search.py",
				command: "python3 search.py",
				exitCode: 0,
				summary: "Finite search script.",
				createdAt: "2026-06-05T12:00:00.000Z",
				updatedAt: "2026-06-05T12:00:00.000Z",
			},
			{
				id: "computation-artifact-2",
				pathId: path.id,
				reportId: "research-report-1",
				runId: "research-run-1",
				kind: "stdout",
				status: "completed",
				title: "Computation output",
				filePath: ".pi/co-math/artifacts/research-run-1/stdout.txt",
				command: "python3 search.py",
				exitCode: 0,
				summary: "checked_range: 1 <= n <= 20\nprime_values_found: 7",
				createdAt: "2026-06-05T12:00:00.000Z",
				updatedAt: "2026-06-05T12:00:00.000Z",
			},
		];
		const report = {
			pathId: path.id,
			pathTitle: path.title,
			status: "completed" as const,
			coordinatorBrief: "Choose a finite experiment.",
			steps: [
				{
					role: "coordinator" as const,
					title: "Coordinator brief",
					summary: "Framed finite check.",
					details: ["Choose a finite experiment."],
				},
				{
					role: "specialist" as const,
					title: "Computation script",
					summary: "Prepared script.",
					details: ["Finite search script."],
				},
				{
					role: "critic" as const,
					title: "Computation review",
					summary: "Reviewed limits.",
					details: ["A finite computation does not prove an infinite claim."],
				},
			],
			promisingStrategy: ["Use examples to find obstructions."],
			findings: ["prime_values_found: 7"],
			criticisms: ["A finite computation does not prove an infinite claim."],
			gaps: ["A proof is still open."],
			humanHelpUseful: [],
			suggestedNextMove: "Use parity to refine the direct-proof path.",
			workingPaperSectionTitle: "Examples and finite checks",
			computationalArtifactIds: ["computation-artifact-1", "computation-artifact-2"],
		};
		const state = { researchPaths: [path], computationalArtifacts };

		const completed = formatResearchWorkstreamCompleted({ state, report });
		expect(completed).toContain("Computation");
		// The beginner completion stays product-clean: no raw artifact IDs as primary content.
		expect(completed).not.toContain("computation-artifact-1");
		expect(completed).not.toContain("computation-artifact-2");
		expect(completed).toContain("Checked range: 1 <= n <= 20");
		expect(completed).toContain("Exit code: 0");
		expect(completed).toContain("show latest report");
		expectProductCopy(completed);

		const details = formatResearchWorkstreamReport({ state, report });
		expect(details).toContain("Script: .pi/co-math/artifacts/research-run-1/search.py");
		expect(details).toContain("Command: python3 search.py");
		expect(details).toContain("Result summary: checked_range: 1 <= n <= 20 prime_values_found: 7");
		expect(details).toContain("Attachments");
		expect(details).toContain("computation-artifact-1: script");
		expect(details).toContain("computation-artifact-2: stdout");
	});

	it("formats failed computation diagnostics without long raw output", () => {
		const path = createComputationPath();
		const longDiagnostics = `${"failure detail ".repeat(80)}end`;
		const state = {
			researchPaths: [path],
			computationalArtifacts: [
				{
					id: "computation-artifact-1",
					pathId: path.id,
					kind: "stderr" as const,
					status: "failed" as const,
					title: "Computation diagnostics",
					filePath: ".pi/co-math/artifacts/research-run-1/stderr.txt",
					command: "python3 search.py",
					exitCode: 1,
					summary: longDiagnostics,
					createdAt: "2026-06-05T12:00:00.000Z",
					updatedAt: "2026-06-05T12:00:00.000Z",
				},
			],
		};
		const report = {
			pathId: path.id,
			pathTitle: path.title,
			status: "blocked" as const,
			coordinatorBrief: "Choose a finite experiment.",
			steps: [],
			promisingStrategy: [],
			findings: ["The computation failed."],
			criticisms: ["A finite computation does not prove an infinite claim."],
			gaps: ["Repair the script."],
			humanHelpUseful: [],
			suggestedNextMove: "Fix the finite check.",
			workingPaperSectionTitle: "Examples and finite checks",
			computationalArtifactIds: ["computation-artifact-1"],
		};

		const details = formatResearchWorkstreamReport({ state, report });
		expect(details).toContain("Diagnostics:");
		expect(details).toContain("exit code 1");
		expect(details.length).toBeLessThan(1_500);
	});

	it("formats project coordinator summaries with friendly path labels", () => {
		const paths = [createComputationPath(), createResearchPath()];
		const text = formatResearchCoordinatorReport({
			state: { researchPaths: paths },
			report: {
				whatWeKnow: ["Finite checks found examples of n^2 + 1 primes."],
				roadblocks: ["Finite checks do not prove infinitude."],
				recommendedNextMoves: [
					{
						title: "Continue Path 2",
						pathId: "path-1",
						rationale: "Use the finite observations in a direct proof attempt.",
						prompt: "continue path 2",
						priority: "high",
					},
					{
						title: "Provide a theorem reference",
						rationale: "The literature route needs a source-backed statement.",
						priority: "medium",
					},
				],
				humanHelpUseful: ["Share a reference for quadratic prime values."],
				suggestedPathId: "path-1",
				suggestedPrompt: "continue path 2",
			},
		});

		expect(text).toContain("Project coordinator summary");
		expect(text).toContain("What we know");
		expect(text).toContain("Current roadblocks");
		expect(text).toContain("Recommended next moves");
		expect(text).toContain("1. Continue Path 1: Small examples and counterexamples");
		expect(text).toContain("Human help useful");
		expect(text).toContain("Suggested next step\ncontinue path 2");
		expect(text).not.toContain("research-report-1");
		expect(text).not.toContain("computation-artifact-1");
		expectProductCopy(text);
	});

	it("omits empty coordinator human-help sections and explains missing summaries", () => {
		const path = createResearchPath();
		const text = formatResearchCoordinatorReport({
			state: { researchPaths: [path] },
			report: {
				whatWeKnow: ["No proof has been established."],
				roadblocks: ["The direct route has a gap."],
				recommendedNextMoves: [
					{
						title: "Continue direct proof",
						pathId: path.id,
						rationale: "Clarify the gap.",
						priority: "high",
					},
				],
				humanHelpUseful: [],
			},
		});

		expect(text).not.toContain("Human help useful");
		expect(text).toContain("Suggested next step\ncontinue path 1");
		expect(formatLatestResearchCoordinatorReportMissing()).toContain("what should we try next?");
		expectProductCopy(text);
		expectProductCopy(formatLatestResearchCoordinatorReportMissing());
	});

	it("formats failed research workstream warnings without raw run ids", () => {
		const path = createResearchPath();
		const run: ResearchWorkstreamRunRecord = {
			...createRunningResearchWorkstreamRun(path),
			status: "failed",
			failureReason: "The research attempt stopped before producing a final report.",
		};
		const warning = formatResearchWorkstreamRunFailed({ state: { researchPaths: [path] }, run });

		expect(warning).toContain("Research workstream failed");
		expect(warning).toContain("Path 1: Direct proof attempt");
		expect(warning).toContain("The research attempt stopped before producing a final report.");
		expect(warning).not.toContain("research-run-1");
		expectProductCopy(warning);
	});

	it("formats interrupted-session research workstream warnings safely", () => {
		const path = createResearchPath();
		const run: ResearchWorkstreamRunRecord = {
			...createRunningResearchWorkstreamRun(path),
			status: "failed",
			failureReason: STALE_RESEARCH_WORKSTREAM_RUN_REASON,
		};
		const warning = formatResearchWorkstreamRunFailed({ state: { researchPaths: [path] }, run });

		expect(warning).toContain("Research workstream failed");
		expect(warning).toContain("Path 1: Direct proof attempt");
		expect(warning).toContain("Previous Pi session ended before completion.");
		expect(warning).not.toContain("research-run-1");
		expectProductCopy(warning);
	});
});

function createResearchPath(): ResearchPath {
	return {
		id: "path-1",
		title: "Direct proof attempt",
		objective: "Try a direct proof.",
		status: "active",
		latestFindings: [],
		blockers: [],
		suggestedNextMove: "Check whether the direct proof can be made rigorous.",
		priority: 1,
		createdAt: "2026-06-05T12:00:00.000Z",
		updatedAt: "2026-06-05T12:00:00.000Z",
	};
}

function createLiteraturePath(): ResearchPath {
	return {
		id: "path-5",
		title: "Known theorem or literature reduction",
		objective: "Check known theorem targets.",
		status: "active",
		latestFindings: [],
		blockers: [],
		suggestedNextMove: "Find source-backed references.",
		priority: 5,
		createdAt: "2026-06-05T12:00:00.000Z",
		updatedAt: "2026-06-05T12:00:00.000Z",
	};
}

function createComputationPath(): ResearchPath {
	return {
		id: "path-1",
		title: "Small examples and counterexamples",
		objective: "Gather finite examples.",
		status: "active",
		latestFindings: [],
		blockers: [],
		suggestedNextMove: "Run a bounded finite check.",
		priority: 1,
		createdAt: "2026-06-05T12:00:00.000Z",
		updatedAt: "2026-06-05T12:00:00.000Z",
	};
}

function createRunningResearchWorkstreamRun(path: ResearchPath): ResearchWorkstreamRunRecord {
	return {
		id: "research-run-1",
		pathId: path.id,
		pathTitle: path.title,
		status: "running",
		currentStage: "specialist",
		startedAt: "2026-06-05T12:00:00.000Z",
		updatedAt: "2026-06-05T12:01:00.000Z",
		incrementalReports: [
			{
				id: "research-run-1-incremental-1",
				stage: "coordinator",
				status: "completed",
				title: "Coordinator brief",
				summary: "Framed the direct proof route.",
				details: ["Path objective is to test a direct proof."],
				createdAt: "2026-06-05T12:00:10.000Z",
			},
			{
				id: "research-run-1-incremental-2",
				stage: "specialist",
				status: "running",
				title: "Specialist attempt",
				summary: "Testing whether a sieve formulation can produce prime pairs at distance 2.",
				details: ["Comparing bounded gaps with twin-prime distance 2."],
				createdAt: "2026-06-05T12:01:00.000Z",
			},
		],
	};
}
