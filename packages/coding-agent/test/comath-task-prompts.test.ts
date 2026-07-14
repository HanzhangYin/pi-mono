import { describe, expect, it } from "vitest";
import { buildDirectorPlanPrompt } from "../src/modes/comath/comath-research-director.ts";
import {
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
	});

	it("does not let the skeptic turn a permitted documented source gap into missing evidence", () => {
		const prompt = buildTaskSkepticPrompt(task, [], "## Findings\nThe definition is absent.");
		expect(prompt).toContain("explicitly permits recording ambiguity, discrepancy, or missing source material");
		expect(prompt).toContain("do not demand invented primary text");
	});

	it("keeps synthesized prose non-authoritative for findings", () => {
		const prompt = buildTaskSynthesisPrompt(task, [], "## Critique\n- Preserve the exact formula.");
		expect(prompt).toContain("harness renders findings directly from the immutable claim ledger");
		expect(prompt).not.toContain("## Findings\n- claim-1");
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
