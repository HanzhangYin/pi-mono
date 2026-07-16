import { describe, expect, it } from "vitest";
import { buildDirectorPlanPrompt } from "../src/modes/comath/comath-research-director.ts";
import {
	buildTaskCriticPrompt,
	buildTaskSkepticPrompt,
	buildTaskSpecialistPrompt,
	buildTaskSynthesisPrompt,
} from "../src/modes/comath/comath-task-prompts.ts";
import type { ResearchPlanTaskRecord } from "../src/modes/comath/schema.ts";
import { createEmptyProjectState } from "../src/modes/comath/storage.ts";

const task: ResearchPlanTaskRecord = {
	id: "task-1",
	planId: "plan-1",
	kind: "source-refresh",
	status: "pending",
	sequence: 1,
	title: "Extract exact statements",
	description: "Read the primary source.",
	acceptanceCriteria: ["Transcribe the formula and record ambiguities or discrepancies in the primary source."],
	dependsOnTaskIds: [],
	requiredCapabilities: ["source-grounding", "independent-review"],
	attemptIds: [],
	sourceIds: [],
	claimSupportIds: [],
	computationalArtifactIds: [],
	evidenceEntryIds: [],
	createdAt: "2026-07-13T00:00:00.000Z",
	updatedAt: "2026-07-13T00:00:00.000Z",
};

describe("co-math task prompts", () => {
	it("requires specialists to transcribe requested targets and preserve source absences", () => {
		const prompt = buildTaskSpecialistPrompt(task, "SOURCE source-6", "No inventory records.");
		expect(prompt).toContain("Check every acceptance criterion");
		expect(prompt).toContain("transcribe it");
		expect(prompt).toContain("record the precise source discrepancy or unresolved item");
		expect(prompt).toContain("[proved] Claim established by the argument");
		expect(prompt).toContain("not accepted merely because the specialist used the label");
		expect(prompt).toContain("Claims state mathematical or source content, not workflow completion");
		expect(prompt).toContain("record those details in Strategy");
	});

	it("requires reviewers to emit independently executable repair certificates", () => {
		const critic = buildTaskCriticPrompt(task, "specialist", []);
		const skeptic = buildTaskSkepticPrompt(task, [], "report");
		expect(critic).toContain("## Repair certificates");
		expect(critic).toContain("one per bullet");
		expect(skeptic).toContain("## Unresolved certificates");
		expect(skeptic).toContain("REPORT DRAFT intentionally renders those claims under ## Findings");
		expect(skeptic).toContain("never reject solely because the report uses its own report contract");
	});

	it("exposes canonical accepted results as internal, non-external context", () => {
		const prompt = buildTaskSpecialistPrompt(
			task,
			"SOURCE source-6",
			"No inventory records.",
			undefined,
			"ACCEPTED ATTEMPT accepted-1\nclaim-9: established result",
		);
		expect(prompt).toContain("ACCEPTED PROJECT RESULTS");
		expect(prompt).toContain("claim-9: established result");
		expect(prompt).toContain("prior skeptic-accepted internal results");
		expect(prompt).toContain("must not be presented as source-backed");
	});

	it("does not let the skeptic turn a permitted documented source gap into missing evidence", () => {
		const prompt = buildTaskSkepticPrompt(task, [], "## Findings\nThe definition is absent.");
		expect(prompt).toContain("explicitly permits recording ambiguity, discrepancy, or missing source material");
		expect(prompt).toContain("do not demand invented primary text");
		expect(prompt).toContain("a precise grounded omission satisfies the unavailable item");
		expect(prompt).toContain("Require evidence that the relevant bounded source ranges were inspected");
	});

	it("keeps synthesized prose non-authoritative for findings", () => {
		const prompt = buildTaskSynthesisPrompt(task, [], "## Critique\n- Preserve the exact formula.");
		expect(prompt).toContain("harness renders findings directly from the immutable claim ledger");
		expect(prompt).not.toContain("## Findings\n- claim-1");
	});

	it("keeps critic-driven repair roles scoped to one certificate", () => {
		const repairTask: ResearchPlanTaskRecord = {
			...task,
			kind: "proof-attempt",
			goal: [
				"CRITIC-DRIVEN REPAIR",
				"SOURCE ATTEMPT: attempt-1",
				"CERTIFICATE:",
				"Display a unit complementary minor.",
				"ACCEPTANCE CRITERIA:",
				"- Display the matrix and determinant.",
				"NON-GOALS:",
				"- Do not prove the parent theorem.",
			].join("\n"),
			acceptanceCriteria: ["Display the matrix and determinant."],
		};
		expect(buildTaskSpecialistPrompt(repairTask, "", "none")).toContain("Produce only the named certificate");
		expect(buildTaskSynthesisPrompt(repairTask, [], "critic")).toContain(
			"broader parent-theorem work only as future work",
		);
		expect(buildTaskSkepticPrompt(repairTask, [], "report")).toContain("Decide only whether the named certificate");
	});

	it("keeps director acceptance criteria bounded to task-relevant source work", () => {
		const prompt = buildDirectorPlanPrompt(
			createEmptyProjectState({
				projectId: "bounded-director",
				title: "Bounded director",
				rootQuestion: "Investigate the supplied conjecture.",
				now: "2026-07-13T00:00:00.000Z",
			}),
		);
		expect(prompt).toContain("Never require an exhaustive audit of every theorem");
		expect(prompt).toContain("definitions actually used by planned downstream tasks");
		expect(prompt).toContain("record a source omission, ambiguity, or apparent typo");
		expect(prompt).toContain('Declare "sandboxed-computation"');
	});
});
