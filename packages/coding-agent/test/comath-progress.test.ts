import { describe, expect, it } from "vitest";
import {
	formatBackgroundRunStarted,
	formatCoMathProductHelp,
	formatCoMathWelcome,
	formatContextRecorded,
	formatExistingProjectHelp,
	formatFocusNoted,
	formatInitialValidationPlan,
	formatProductActivity,
	formatProductProgress,
	formatReadyForContext,
	formatSetupStep,
	formatSteeringNoted,
	formatWaitingForContext,
} from "../src/modes/comath/comath-progress.ts";

const FORBIDDEN_PRODUCT_TERMS = [
	"Co-math research mode",
	"co-math project",
	"co-math goal",
	"co-math workstream",
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
});
