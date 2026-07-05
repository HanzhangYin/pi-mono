import { describe, expect, it } from "vitest";
import {
	formatBackgroundRunStarted,
	formatCoMathProductHelp,
	formatCoMathResearchActivityStatus,
	formatCoMathWelcome,
	formatConjectureLineage,
	formatConjectureRefuted,
	formatConjectureRevised,
	formatContextRecorded,
	formatExistingProjectHelp,
	formatFocusNoted,
	formatInitialValidationPlan,
	formatLatestResearchCoordinatorReportMissing,
	formatProductActivity,
	formatProductProgress,
	formatReadyForContext,
	formatResearchBatchCompleted,
	formatResearchBatchPaused,
	formatResearchBatchStarted,
	formatResearchBatchStepCompleted,
	formatResearchCoordinatorReport,
	formatResearchEvidenceBoardSummary,
	formatResearchFocusUpdated,
	formatResearchPathDropped,
	formatResearchPlanBlocked,
	formatResearchPlanCompleted,
	formatResearchPlanCreated,
	formatResearchPlanPaused,
	formatResearchPlanSummary,
	formatResearchPlanTaskCompleted,
	formatResearchPlanTaskStarted,
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
	formatUserProvidedLiteratureSourceRegistered,
	formatWaitingForContext,
} from "../src/modes/comath/comath-progress.ts";
import { createCoMathResearchAutoPlan } from "../src/modes/comath/comath-research-autoplan.ts";
import { runResearchWorkstream } from "../src/modes/comath/comath-research-workstream.ts";
import type {
	ComputationalArtifact,
	ResearchBatchRecord,
	ResearchEvidenceBoardEntry,
	ResearchPath,
	ResearchPlanRecord,
	ResearchPlanTaskRecord,
	ResearchWorkstreamReportRecord,
	ResearchWorkstreamRunRecord,
} from "../src/modes/comath/schema.ts";
import { STALE_RESEARCH_WORKSTREAM_RUN_REASON } from "../src/modes/comath/storage.ts";

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
		expect(workspace).toBe("I’ll start with small examples and counterexamples.");
		expect(workspace).not.toContain("continue path 1");
		expectProductCopy(workspace);

		const registered = formatUserProvidedLiteratureSourceRegistered({
			title: "Schinzel's hypothesis H predicts prime values for suitable irreducible polynomials",
		});
		expect(registered).toContain("Registered source context for Path 5");
		expect(registered).toContain("Schinzel's hypothesis H");
		expect(registered).toContain("I can use this in the source-backed literature path next.");
		expectProductCopy(registered);

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
		expect(summary).toContain("Suggested next step");
		expect(summary).toContain("I can work on Path 1: Small examples and counterexamples next.");
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
		expect(started).toContain("Research started");
		expect(started).toContain("Path 2: Direct proof attempt");
		expect(started).toContain("Progress");
		expectProductCopy(started);

		const completed = formatResearchWorkstreamCompleted({ state, report });
		expect(completed).toContain("Finished this step.");
		expect(completed).toContain("Main takeaway");
		expect(completed).toContain("Limit");
		expect(completed).toContain("Next");
		expect(completed).toContain("I can try this path next:");
		expect(completed).toContain("Path 3: Reformulation");
		expect(completed).toContain('Saved under "Direct proof attempts".');
		expect(completed).toContain("The detailed report is saved.");
		expectProductCopy(completed);

		const full = formatResearchWorkstreamReport({ state, report });
		expect(full).toContain("Latest research report");
		expect(full).toContain("Path 2: Direct proof attempt");
		expect(full).toContain("Coordinator brief");
		expect(full).toContain("Specialist attempt");
		expect(full).toContain("Critic review");
		expect(full).toContain("Synthesis");
		// Detailed report surfaces a human-attention section when the report records gaps.
		expect(report.gaps.length).toBeGreaterThan(0);
		expect(full).toContain("Needs human attention");
		expect(full).toContain(report.gaps[0] ?? "");
		expect(full).toContain("Next");
		expectProductCopy(full);
	});

	it("formats Path 3 and Path 4 completion with natural bridge suggestions", () => {
		const plan = createCoMathResearchAutoPlan("Are there infinitely many primes of the form n^2 + 1?");
		const paths = createResearchPathsFromPlan(plan);
		const reformulation = paths[2];
		const weakerCases = paths[3];
		if (!reformulation || !weakerCases) {
			throw new Error("Expected Path 3 and Path 4.");
		}
		const state = { researchPaths: paths };

		const path3Report = runResearchWorkstream({
			rootQuestion: plan.rootQuestion,
			path: reformulation,
			allPaths: paths,
			now: "2026-06-05T12:30:00.000Z",
		});
		const path3Completed = formatResearchWorkstreamCompleted({ state, report: path3Report });
		expect(path3Completed).toContain("Path 3: Reformulation");
		expect(path3Completed).toContain("Original question");
		expect(path3Completed).toContain("I can turn this into smaller targets next:");
		expect(path3Completed).toContain("Path 4: Weaker special cases");
		expectProductCopy(path3Completed);

		const path4Report = runResearchWorkstream({
			rootQuestion: plan.rootQuestion,
			path: weakerCases,
			allPaths: paths,
			now: "2026-06-05T12:30:00.000Z",
		});
		const path4Completed = formatResearchWorkstreamCompleted({ state, report: path4Report });
		expect(path4Completed).toContain("Path 4: Weaker special cases");
		expect(path4Completed).toContain("Parity obstruction");
		expect(path4Completed).toContain("I can use these lemmas in a proof attempt next:");
		expect(path4Completed).toContain("Path 2: Direct proof attempt");
		expectProductCopy(path4Completed);
	});

	it("formats research state summaries with Path 3 and Path 4 bridge suggestions", () => {
		const plan = createCoMathResearchAutoPlan("Are there infinitely many primes of the form n^2 + 1?");
		const paths = createResearchPathsFromPlan(plan);
		const reformulation = paths[2];
		const weakerCases = paths[3];
		if (!reformulation || !weakerCases) {
			throw new Error("Expected Path 3 and Path 4.");
		}

		const path3Report = toResearchReportRecord(
			runResearchWorkstream({
				rootQuestion: plan.rootQuestion,
				path: reformulation,
				allPaths: paths,
				now: "2026-06-05T12:30:00.000Z",
			}),
			"research-report-1",
		);
		const afterPath3 = formatResearchStateSummary({
			researchPaths: paths,
			researchFocus: { pathIds: ["path-1"], reason: "Start with examples.", updatedAt: "2026-06-05T12:00:00.000Z" },
			researchReports: [path3Report],
		});
		expect(afterPath3).toContain("Recent progress");
		expect(afterPath3).toContain("Path 3: Reformulation reframed the problem");
		expect(afterPath3).toContain("Suggested next step");
		expect(afterPath3).toContain("I can work on Path 4: Weaker special cases next.");
		expectProductCopy(afterPath3);

		const path4Report = toResearchReportRecord(
			runResearchWorkstream({
				rootQuestion: plan.rootQuestion,
				path: weakerCases,
				allPaths: paths,
				now: "2026-06-05T12:45:00.000Z",
			}),
			"research-report-2",
		);
		const afterPath4 = formatResearchStateSummary({
			researchPaths: paths,
			researchFocus: { pathIds: ["path-1"], reason: "Start with examples.", updatedAt: "2026-06-05T12:00:00.000Z" },
			researchReports: [path3Report, path4Report],
		});
		expect(afterPath4).toContain("Path 4: Weaker special cases isolated weaker targets");
		expect(afterPath4).toContain("Suggested next step");
		expect(afterPath4).toContain("I can work on Path 2: Direct proof attempt next.");
		expectProductCopy(afterPath4);
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
		expect(started).toContain("Working on Path 1: Small examples and counterexamples.");
		expect(started).toContain("Now: Choosing the plan.");
		expect(started).toContain("Keeping the finite check bounded.");
		expect(started).not.toContain("show progress");
		expectProductCopy(started);

		const stageUpdate = formatResearchWorkstreamStageStarted({
			state,
			run,
			stage: "computation",
			summary: "Running the bounded finite computation.",
		});
		expect(stageUpdate).toContain("Now: Running finite computation.");
		expect(stageUpdate).toContain("Running the bounded finite computation.");
		expect(stageUpdate).not.toContain("show progress");
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

		expect(progress).toContain("Research step running");
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
					provider: "semantic-scholar" as const,
					doi: "10.1000/twin",
					venue: "Number Theory Surveys",
					publishedAt: "2024-01-02",
					citationCount: 12,
					sourceType: "journal" as const,
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
			researchEvidenceBoard: [
				{
					id: "evidence-board-1",
					pathId: path.id,
					reportId: "research-report-1",
					claimSupportId: "claim-support-1",
					sourceIds: ["source-1"],
					computationalArtifactIds: [],
					claim: "The twin-prime conjecture remains open.",
					classification: "theorem" as const,
					rationale: "Source-backed status from a DOI-bearing journal source.",
					createdAt: "2026-06-05T12:00:00.000Z",
					updatedAt: "2026-06-05T12:00:00.000Z",
				},
				{
					id: "evidence-board-2",
					pathId: path.id,
					reportId: "research-report-1",
					sourceIds: [],
					computationalArtifactIds: [],
					claim: "A source proves twin-prime infinitude.",
					classification: "unsupported" as const,
					rationale: "No source id was attached to this claim.",
					createdAt: "2026-06-05T12:00:00.000Z",
					updatedAt: "2026-06-05T12:00:00.000Z",
				},
			],
		};

		const completed = formatResearchWorkstreamCompleted({ state, report });
		expect(completed).toContain("Finished this step.");
		expect(completed).toContain("The twin-prime conjecture remains open.");
		expect(completed).not.toContain("source-1:");
		expect(completed).not.toContain("(source-1)");
		expect(completed).not.toContain("[source-1]");
		expect(completed).toContain("No source proves twin-prime infinitude.");
		expect(completed).not.toContain("research-run-1");
		expectProductCopy(completed);

		const details = formatResearchWorkstreamReport({ state, report });
		expect(details).toContain("Literature findings");
		expect(details).toContain("Source-support review");
		expect(details).toContain("Evidence board");
		expect(details).toContain("theorem: The twin-prime conjecture remains open.");
		expect(details).toContain("unsupported: A source proves twin-prime infinitude.");
		expect(details).toContain("References / attachments");
		expect(details).toContain("source-1: Twin prime conjecture status note");
		expect(details).toContain("DOI: 10.1000/twin");
		expect(details).toContain("provider: semantic-scholar");
		expect(details).toContain("Claim support");
		expectProductCopy(details);
	});

	it("formats Path 5 no-source completion with source status and coordinator command", () => {
		const path = createLiteraturePath();
		const report = {
			pathId: path.id,
			pathTitle: path.title,
			status: "blocked" as const,
			coordinatorBrief: "Check exact source support.",
			steps: [],
			promisingStrategy: [],
			findings: [
				"No source was available, so no theorem claim is established for this path.",
				"Treat Bunyakovsky and Schinzel names as search targets only until a source verifies the exact statement.",
				"No unconditional proof of infinitely many primes n^2 + 1 is established in this workspace.",
			],
			criticisms: ["No source in this run supports a theorem-level claim."],
			gaps: [
				"A source-backed literature check is needed before citing named theorems.",
				"Conjectural implications must be separated from unconditional results.",
			],
			humanHelpUseful: ["Provide references or a source file for the relevant theorem targets."],
			suggestedNextMove: "Provide a reference or ask the coordinator what to try next: what should we try next?",
			workingPaperSectionTitle: "Literature/theorem targets",
			sourceIds: [],
			claimSupportIds: ["claim-support-1"],
		};
		const state = {
			researchPaths: [path],
			literatureClaimSupports: [
				{
					id: "claim-support-1",
					claim: "No source-backed theorem claim is established for this path yet.",
					sourceIds: [],
					status: "unsupported" as const,
					note: "A source-backed literature check is needed before citing named theorems.",
					createdAt: "2026-06-05T12:00:00.000Z",
					updatedAt: "2026-06-05T12:00:00.000Z",
				},
			],
		};

		const completed = formatResearchWorkstreamCompleted({ state, report });
		expect(completed).toContain("No source was available");
		expect(completed).toContain("A source-backed literature check is needed");
		expect(completed).toContain("what should we try next?");
		expectProductCopy(completed);
	});

	it("formats Path 5 source-backed completion with references and unsupported proof status", () => {
		const path = createLiteraturePath();
		const report = {
			pathId: path.id,
			pathTitle: path.title,
			status: "completed" as const,
			coordinatorBrief: "Check exact source support.",
			steps: [],
			promisingStrategy: ["Schinzel-style implications are conjectural, not unconditional proofs. [source-1]"],
			findings: [
				"Source-backed context was reviewed for prime-producing polynomial and conjectural framing. [source-1]",
				"No source in this run established an unconditional proof of infinitely many primes of the form n^2 + 1.",
				"Conjectural implications are not proofs of the original claim.",
			],
			criticisms: ["Do not treat the original infinitude claim as proved."],
			gaps: ["No source here proves infinitely many primes of the form n^2 + 1."],
			humanHelpUseful: [],
			suggestedNextMove: "Ask the coordinator what to try next.",
			workingPaperSectionTitle: "Literature/theorem targets",
			sourceIds: ["source-1"],
			claimSupportIds: ["claim-support-1", "claim-support-2"],
		};
		const state = {
			researchPaths: [path],
			literatureSources: [
				{
					id: "source-1",
					kind: "user-provided" as const,
					title: "Test note on prime values of polynomials",
					authors: [],
					summary: "Conjectural context only.",
					createdAt: "2026-06-05T12:00:00.000Z",
					updatedAt: "2026-06-05T12:00:00.000Z",
				},
			],
			literatureClaimSupports: [
				{
					id: "claim-support-1",
					claim: "Provided sources give source-backed context for conjectural prime-values-of-polynomials framing.",
					sourceIds: ["source-1"],
					status: "partially-supported" as const,
					note: "Context only; this does not by itself prove the target theorem claim.",
					createdAt: "2026-06-05T12:00:00.000Z",
					updatedAt: "2026-06-05T12:00:00.000Z",
				},
				{
					id: "claim-support-2",
					claim: "An unconditional proof of infinitely many primes of the form n^2 + 1.",
					sourceIds: [],
					status: "unsupported" as const,
					note: "No source in this run established this unconditional theorem claim.",
					createdAt: "2026-06-05T12:00:00.000Z",
					updatedAt: "2026-06-05T12:00:00.000Z",
				},
			],
		};

		const completed = formatResearchWorkstreamCompleted({ state, report });
		expect(completed).toContain("Source-backed context was reviewed");
		expect(completed).toContain("No source here proves infinitely many primes");
		expect(completed).toContain("what should we try next?");
		expectProductCopy(completed);
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
		expect(completed).toContain("Evidence");
		// The beginner completion stays product-clean: no raw artifact IDs as primary content.
		expect(completed).not.toContain("computation-artifact-1");
		expect(completed).not.toContain("computation-artifact-2");
		expect(completed).toContain("Checked range: 1 <= n <= 20");
		expect(completed).toContain("Exit code: 0");
		expect(completed).toContain("The detailed report is ready to review.");
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

		expect(warning).toContain("Research step failed");
		expect(warning).toContain("Path 1: Direct proof attempt");
		expect(warning).toContain("The research attempt stopped before producing a final report.");
		expect(warning).not.toContain("research-run-1");
		expectProductCopy(warning);
	});

	it("formats interrupted-session research workstream warnings safely", () => {
		const path = createResearchPath();
		const run: ResearchWorkstreamRunRecord = {
			...createRunningResearchWorkstreamRun(path),
			status: "interrupted",
			failureReason: STALE_RESEARCH_WORKSTREAM_RUN_REASON,
		};
		const warning = formatResearchWorkstreamRunFailed({ state: { researchPaths: [path] }, run });

		expect(warning).toContain("Research step interrupted");
		expect(warning).toContain("Path 1: Direct proof attempt");
		expect(warning).toContain("Previous Pi session ended before completion.");
		expect(warning).not.toContain("research-run-1");
		expectProductCopy(warning);
	});

	it("formats bounded research run progress without internal ids", () => {
		const path = createResearchPath();
		const batch: ResearchBatchRecord = {
			id: "research-batch-1",
			status: "running",
			requestedStepCount: 3,
			completedStepCount: 1,
			runIds: ["research-run-1"],
			nextPathId: path.id,
			createdAt: "2026-06-05T12:00:00.000Z",
			startedAt: "2026-06-05T12:00:00.000Z",
			updatedAt: "2026-06-05T12:05:00.000Z",
		};

		const started = formatResearchBatchStarted({ state: { researchPaths: [path] }, batch });
		const step = formatResearchBatchStepCompleted({ state: { researchPaths: [path] }, batch });
		const completed = formatResearchBatchCompleted({
			state: { researchPaths: [path] },
			batch: { ...batch, status: "completed", completedStepCount: 3 },
		});
		const paused = formatResearchBatchPaused({
			state: { researchPaths: [path] },
			batch: {
				...batch,
				status: "paused",
				interruptedRunId: "research-run-2",
			},
			run: {
				...createRunningResearchWorkstreamRun(path),
				id: "research-run-2",
				status: "interrupted",
				failureReason: STALE_RESEARCH_WORKSTREAM_RUN_REASON,
			},
		});

		for (const text of [started, step, completed, paused]) {
			expect(text).not.toContain("research-batch-1");
			expect(text).not.toContain("research-run-");
			expectProductCopy(text);
		}
		expect(started).toContain("I’ll take 3 research steps.");
		expect(completed).toContain("Research steps completed");
		expect(paused).toContain("Research paused");
		expect(paused).toContain("resume research");
	});

	it("formats research plan lifecycle copy without internal ids", () => {
		const plan = createResearchPlanRecord();
		const tasks = createResearchPlanTaskRecords(plan.id);

		const created = formatResearchPlanCreated({ plan, tasks });
		const summary = formatResearchPlanSummary({ plan, tasks });
		const taskStarted = formatResearchPlanTaskStarted({ plan, tasks, task: tasks[1] as ResearchPlanTaskRecord });
		const taskCompleted = formatResearchPlanTaskCompleted({
			plan,
			tasks,
			task: tasks[0] as ResearchPlanTaskRecord,
		});
		const paused = formatResearchPlanPaused({
			plan: { ...plan, status: "paused", pauseReason: "The current task could not finish." },
			tasks,
		});
		const completed = formatResearchPlanCompleted({
			plan: { ...plan, status: "completed" },
			tasks: tasks.map((task) => ({ ...task, status: "completed" as const })),
		});
		const blocked = formatResearchPlanBlocked({
			plan: { ...plan, status: "paused" },
			tasks,
			task: {
				...(tasks[1] as ResearchPlanTaskRecord),
				status: "blocked",
				blockedReason: "There is no research finding to review yet.",
			},
		});

		for (const text of [created, summary, taskStarted, taskCompleted, paused, completed, blocked]) {
			expect(text).not.toContain("research-plan");
			expect(text).not.toContain("research-run-");
			expect(text).not.toContain("path-1");
			expectProductCopy(text);
		}
		expect(created).toContain("Research plan created");
		expect(created).toContain("1. Check the literature for known results");
		expect(summary).toContain("Progress: 1/3 tasks");
		expect(summary).toContain("2. Review recent findings for gaps — waiting");
		expect(taskStarted).toContain("Working on task 2 of 3: Review recent findings for gaps.");
		expect(taskCompleted).toContain("Finished task 1 of 3: Check the literature for known results.");
		expect(paused).toContain("Plan paused");
		expect(paused).toContain("resume plan");
		expect(completed).toContain("Research plan completed");
		expect(blocked).toContain("blocked");
		expect(blocked).toContain("resume plan");
	});

	it("formats refutation and revision copy without internal ids", () => {
		const refuted = formatConjectureRefuted({
			evidenceHint: "n = 40 gives 41^2, which is composite. — Direct computation.",
			revisionPlanned: true,
		});
		const refutedNoPlan = formatConjectureRefuted({ revisionPlanned: false });
		const revised = formatConjectureRevised({
			state: {
				researchEvidenceBoard: [
					lineageEntry("evidence-board-1", "n^2 + n + 41 is prime for every non-negative integer n."),
					{
						...lineageEntry("evidence-board-2", "n^2 + n + 41 is prime for every integer 0 <= n <= 39."),
						parentEntryId: "evidence-board-1",
						revisionKind: "weakened",
						revisionNote: "n = 40 gives 41^2, which is composite.",
					},
				],
			},
			revisedEntryIds: ["evidence-board-2"],
		});

		for (const text of [refuted, refutedNoPlan, revised]) {
			expect(text).not.toContain("evidence-board");
			expectProductCopy(text);
		}
		expect(refuted).toContain("The evidence now points against the statement as written.");
		expect(refuted).toContain("n = 40 gives 41^2, which is composite.");
		expect(refuted).toContain("A step to repair the statement is already planned");
		expect(refutedNoPlan).toContain('Say "show evidence" for the details.');
		expect(revised).toContain("I revised the statement to fit the evidence.");
		expect(revised).toContain("n^2 + n + 41 is prime for every integer 0 <= n <= 39. (weakened)");
		expect(revised).toContain('Say "show lineage"');
	});

	it("renders the conjecture lineage tree and marks superseded evidence in the board summary", () => {
		const root = lineageEntry("evidence-board-1", "n^2 + n + 41 is prime for every non-negative integer n.");
		const child: ResearchEvidenceBoardEntry = {
			...lineageEntry("evidence-board-2", "n^2 + n + 41 is prime for every integer 0 <= n <= 39."),
			parentEntryId: "evidence-board-1",
			revisionKind: "weakened",
			revisionNote: "n = 40 gives 41^2, which is composite.",
		};
		const conflicting: ResearchEvidenceBoardEntry = {
			...lineageEntry("evidence-board-3", "n = 40 gives a composite value."),
			classification: "conflicting",
		};

		const trivial = formatConjectureLineage({ researchEvidenceBoard: [root] });
		expect(trivial).toBe("The statement hasn't needed revision yet.");

		const lineage = formatConjectureLineage({ researchEvidenceBoard: [root, child, conflicting] });
		expect(lineage).toContain("How the statement evolved");
		expect(lineage).toContain(
			"- n^2 + n + 41 is prime for every non-negative integer n. — superseded — n = 40 gives 41^2, which is composite.",
		);
		expect(lineage).toContain("  - n^2 + n + 41 is prime for every integer 0 <= n <= 39. — current (weakened)");
		expect(lineage).not.toContain("evidence-board");
		expectProductCopy(lineage);

		const board = formatResearchEvidenceBoardSummary({
			researchPaths: [],
			researchEvidenceBoard: [root, child, conflicting],
		});
		const lines = board.split("\n");
		const conflictIndex = lines.findIndex((line) => line.includes("n = 40 gives a composite value."));
		const rootIndex = lines.findIndex((line) => line.includes("superseded; see the revised statement"));
		expect(conflictIndex).toBeGreaterThan(-1);
		expect(rootIndex).toBeGreaterThan(-1);
		expect(conflictIndex).toBeLessThan(rootIndex);
		expectProductCopy(board);
	});
});

function lineageEntry(id: string, claim: string): ResearchEvidenceBoardEntry {
	return {
		id,
		sourceIds: [],
		computationalArtifactIds: [],
		claim,
		classification: "conjecture",
		rationale: "Recorded for the lineage test.",
		createdAt: "2026-06-05T12:00:00.000Z",
		updatedAt: "2026-06-05T12:00:00.000Z",
	};
}

function createResearchPlanRecord(): ResearchPlanRecord {
	return {
		id: "research-plan-1",
		title: "Research plan for: Are there infinitely many primes of the form n^2 + 1?",
		objective: "Make durable, reviewable progress on: Are there infinitely many primes of the form n^2 + 1?",
		status: "active",
		taskIds: ["research-plan-task-1", "research-plan-task-2", "research-plan-task-3"],
		createdAt: "2026-06-05T12:00:00.000Z",
		updatedAt: "2026-06-05T12:00:00.000Z",
	};
}

function createResearchPlanTaskRecords(planId: string): ResearchPlanTaskRecord[] {
	const base = {
		planId,
		acceptanceCriteria: [],
		sourceIds: [],
		claimSupportIds: [],
		computationalArtifactIds: [],
		evidenceEntryIds: [],
		createdAt: "2026-06-05T12:00:00.000Z",
		updatedAt: "2026-06-05T12:00:00.000Z",
	};
	return [
		{
			...base,
			id: "research-plan-task-1",
			kind: "literature-search",
			status: "completed",
			sequence: 1,
			title: "Check the literature for known results",
			description: "Search for relevant sources.",
			pathId: "path-1",
			runId: "research-run-1",
		},
		{
			...base,
			id: "research-plan-task-2",
			kind: "critic",
			status: "pending",
			sequence: 2,
			title: "Review recent findings for gaps",
			description: "Check the latest findings for overclaims.",
		},
		{
			...base,
			id: "research-plan-task-3",
			kind: "synthesis",
			status: "pending",
			sequence: 3,
			title: "Summarize durable findings and pick the next move",
			description: "Fold findings into the working paper.",
		},
	];
}

function createResearchPathsFromPlan(plan: ReturnType<typeof createCoMathResearchAutoPlan>): ResearchPath[] {
	return plan.paths.map(
		(path, index): ResearchPath => ({
			id: `path-${index + 1}`,
			title: path.title,
			objective: path.objective,
			status: "active",
			latestFindings: [],
			blockers: [],
			suggestedNextMove: path.suggestedNextMove,
			priority: path.priority,
			createdAt: "2026-06-05T12:00:00.000Z",
			updatedAt: "2026-06-05T12:00:00.000Z",
		}),
	);
}

function toResearchReportRecord(
	report: ReturnType<typeof runResearchWorkstream>,
	id: string,
): ResearchWorkstreamReportRecord {
	return {
		...report,
		id,
		kind: "research_workstream",
		sourceIds: report.sourceIds ?? [],
		claimSupportIds: report.claimSupportIds ?? [],
		computationalArtifactIds: report.computationalArtifactIds ?? [],
		createdAt: report.completedAt,
		updatedAt: report.completedAt,
	};
}

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
