import { describe, expect, it } from "vitest";
import type { ResearchPath } from "../examples/extensions/co-math/schema.ts";
import { createCoMathResearchAutoPlan } from "../src/modes/comath/comath-research-autoplan.ts";
import {
	type ResearchWorkstreamModelExecutor,
	type ResearchWorkstreamModelRequest,
	runModelBackedResearchWorkstream,
} from "../src/modes/comath/comath-research-model-workstream.ts";

const TWIN_PRIME_QUESTION = "Are there infinitely many twin primes?";

function buildDirectProofPath(): ResearchPath {
	const plan = createCoMathResearchAutoPlan(TWIN_PRIME_QUESTION);
	const planPath = plan.paths.find((candidate) => candidate.title === "Direct proof attempt");
	if (!planPath) {
		throw new Error("Expected a direct proof path.");
	}
	return {
		id: "path-2",
		title: planPath.title,
		objective: planPath.objective,
		status: "active",
		latestFindings: ["(3,5) and (5,7) are twin primes."],
		blockers: [],
		suggestedNextMove: planPath.suggestedNextMove,
		priority: planPath.priority,
		createdAt: "2026-06-05T12:00:00.000Z",
		updatedAt: "2026-06-05T12:00:00.000Z",
	};
}

const TWIN_PRIME_RESPONSES: Record<ResearchWorkstreamModelRequest["role"], string> = {
	specialist: [
		"## Findings",
		"- Twin primes are prime pairs at distance 2 such as (3, 5) and (5, 7).",
		"## Promising strategy",
		"- Consider sieve-theoretic reductions rather than a direct construction.",
		"## Gaps",
		"- No mechanism forces infinitely many prime pairs at distance 2.",
		"## Next",
		"- Compare against bounded prime gaps as a weaker target.",
	].join("\n"),
	critic: [
		"## Review",
		"- The specialist did not prove infinitude of twin primes.",
		"## Gaps",
		"- Bounded prime gaps are weaker than twin-prime infinitude and must not be conflated.",
		"## Overclaims or source issues",
		"- No overclaims detected.",
		"## Human help useful",
		"- A number theorist could advise on which sieve method is appropriate.",
	].join("\n"),
	synthesizer: [
		"## Promising strategy",
		"- A direct proof of twin-prime infinitude is out of reach; examine bounded-gap results as context.",
		"## Findings",
		"- Twin primes remain conjecturally infinite with strong numerical support.",
		"## Review",
		"- Do not conflate bounded prime gaps with prime pairs at distance 2.",
		"## Gap",
		"- No mechanism was established that forces infinitely many prime pairs at distance 2.",
		"## Human help useful",
		"- Literature guidance on sieve theory would help.",
		"## Next",
		"- Switch to a literature/source-backed path, or ask for a weaker target such as bounded prime gaps.",
		"## Working paper summary",
		"- Twin-prime infinitude is open; bounded prime gaps are a weaker, related result.",
	].join("\n"),
};

function createRecordingExecutor(responses: Record<ResearchWorkstreamModelRequest["role"], string>): {
	executor: ResearchWorkstreamModelExecutor;
	requests: ResearchWorkstreamModelRequest[];
} {
	const requests: ResearchWorkstreamModelRequest[] = [];
	const executor: ResearchWorkstreamModelExecutor = {
		run: async (request) => {
			requests.push(request);
			return { text: responses[request.role] };
		},
	};
	return { executor, requests };
}

describe("model-backed research workstream", () => {
	it("calls specialist, critic, and synthesizer in order with context", async () => {
		const { executor, requests } = createRecordingExecutor(TWIN_PRIME_RESPONSES);
		const path = buildDirectProofPath();
		await runModelBackedResearchWorkstream({
			rootQuestion: TWIN_PRIME_QUESTION,
			path,
			allPaths: [path],
			now: "2026-06-05T12:30:00.000Z",
			executor,
		});

		expect(requests.map((request) => request.role)).toEqual(["specialist", "critic", "synthesizer"]);
		for (const request of requests) {
			expect(request.rootQuestion).toBe(TWIN_PRIME_QUESTION);
			expect(request.path.title).toBe("Direct proof attempt");
			expect(request.priorFindings).toContain("(3,5) and (5,7) are twin primes.");
			expect(request.prompt).toContain(TWIN_PRIME_QUESTION);
		}
		// specialist sees no prior role output; critic sees specialist; synthesizer sees both.
		expect(requests[0]?.inputText).toBe("");
		expect(requests[1]?.inputText).toContain("Twin primes are prime pairs at distance 2");
		expect(requests[2]?.inputText).toContain("The specialist did not prove infinitude of twin primes.");
	});

	it("produces twin-prime-specific report content", async () => {
		const { executor } = createRecordingExecutor(TWIN_PRIME_RESPONSES);
		const path = buildDirectProofPath();
		const report = await runModelBackedResearchWorkstream({
			rootQuestion: TWIN_PRIME_QUESTION,
			path,
			allPaths: [path],
			now: "2026-06-05T12:30:00.000Z",
			executor,
		});

		expect(report.steps.map((step) => step.role)).toEqual(["coordinator", "specialist", "critic", "synthesizer"]);
		const combined = [
			...report.promisingStrategy,
			...report.findings,
			...report.criticisms,
			...report.gaps,
			...report.steps.flatMap((step) => step.details),
		].join("\n");
		expect(combined).toContain("twin prime");
		expect(combined).toContain("distance 2");
		expect(combined).toContain("bounded prime gaps");
		expect(report.gaps.join("\n")).toContain("infinitely many prime pairs at distance 2");
		expect(report.suggestedNextMove).toContain("literature");
		expect(report.workingPaperSummary).toContain("Twin-prime infinitude is open");
		// The synthesizer must not claim it proved the conjecture.
		expect(report.suggestedNextMove.toLowerCase()).not.toContain("proves the twin prime conjecture");
	});

	it("extracts substantive next steps instead of heading-like filler", async () => {
		const { executor } = createRecordingExecutor({
			...TWIN_PRIME_RESPONSES,
			synthesizer: [
				"## Promising strategy",
				"- Use bounded-gap context cautiously.",
				"## Findings",
				"- The direct proof path has not produced a proof.",
				"## Review",
				"- The attempt is still incomplete.",
				"## Gap",
				"- No mechanism forces infinitely many twin primes.",
				"## Human help useful",
				"- Source guidance would help.",
				"## Next",
				"Possible next investigations:",
				"- Check whether a bounded-gap theorem is a useful weaker target.",
				"- Ask for source-backed literature context before citing named results.",
				"- Compare this direct path against a reformulation path.",
				"## Working paper summary",
				"- Keep the direct proof attempt marked incomplete.",
			].join("\n"),
		});
		const path = buildDirectProofPath();
		const report = await runModelBackedResearchWorkstream({
			rootQuestion: TWIN_PRIME_QUESTION,
			path,
			allPaths: [path],
			now: "2026-06-05T12:30:00.000Z",
			executor,
		});

		expect(report.suggestedNextMove).not.toContain("Possible next investigations");
		expect(report.suggestedNextMove).toContain("Check whether a bounded-gap theorem is a useful weaker target.");
		expect(report.suggestedNextMove).toContain("Ask for source-backed literature context");
		expect(report.suggestedNextMove).toContain("Compare this direct path against a reformulation path.");
	});

	it("falls back safely when role responses have no markdown sections", async () => {
		const { executor } = createRecordingExecutor({
			specialist: "I could not make meaningful progress on this path right now.",
			critic: "The attempt is incomplete.",
			synthesizer: "Treat the results as uncertain.",
		});
		const path = buildDirectProofPath();
		const report = await runModelBackedResearchWorkstream({
			rootQuestion: TWIN_PRIME_QUESTION,
			path,
			allPaths: [path],
			now: "2026-06-05T12:30:00.000Z",
			executor,
		});

		expect(report.steps).toHaveLength(4);
		expect(report.suggestedNextMove).toBe("Review this attempt and choose the next research move.");
		const specialistStep = report.steps.find((step) => step.role === "specialist");
		expect(specialistStep?.details.join("\n")).toContain("I could not make meaningful progress");
		expect(report.workingPaperSummary).toContain("Research workstream: Direct proof attempt");
	});

	it("introduces no fabricated citations when responses are empty", async () => {
		const { executor } = createRecordingExecutor({ specialist: "", critic: "", synthesizer: "" });
		const path = buildDirectProofPath();
		const report = await runModelBackedResearchWorkstream({
			rootQuestion: TWIN_PRIME_QUESTION,
			path,
			allPaths: [path],
			now: "2026-06-05T12:30:00.000Z",
			executor,
		});

		expect(report.findings).toEqual([]);
		expect(report.criticisms).toEqual([]);
		expect(report.promisingStrategy).toEqual([]);
		expect(report.gaps).toEqual([]);
		expect(report.humanHelpUseful).toEqual([]);
		expect(report.suggestedNextMove).toBe("Review this attempt and choose the next research move.");
		const everything = `${report.workingPaperSummary}\n${report.suggestedNextMove}\n${report.steps
			.flatMap((step) => step.details)
			.join("\n")}`;
		expect(everything).not.toMatch(/et al\.?|doi:|https?:\/\/|\b(18|19|20)\d{2}\b/i);
	});
});
