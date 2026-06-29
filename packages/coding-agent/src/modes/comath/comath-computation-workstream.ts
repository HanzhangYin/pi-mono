import type {
	ComputationalExecutionResult,
	ComputationalExecutor,
	ComputationalScriptDraft,
} from "./comath-computation-executor.ts";
import {
	type CoMathParsedMarkdown as ParsedMarkdown,
	parseCoMathMarkdown as parseMarkdown,
	getCoMathMarkdownSectionItems as sectionItems,
	stripCoMathBulletMarker as stripBulletMarker,
} from "./comath-markdown.ts";
import type {
	ResearchWorkstreamModelExecutor,
	ResearchWorkstreamModelRequest,
	ResearchWorkstreamStageCallbacks,
} from "./comath-research-model-workstream.ts";
import {
	buildCoordinatorBrief,
	type ResearchWorkstreamReport,
	type ResearchWorkstreamStep,
} from "./comath-research-workstream.ts";
import type { ComputationalArtifactKind, ComputationalArtifactStatus, ResearchPath } from "./schema.ts";

export interface ComputationalArtifactDraft {
	kind: ComputationalArtifactKind;
	status: ComputationalArtifactStatus;
	title: string;
	filePath?: string;
	command?: string;
	exitCode?: number;
	summary: string;
}

export interface RunComputationResearchWorkstreamInput {
	rootQuestion: string;
	path: ResearchPath;
	allPaths: readonly ResearchPath[];
	now: string;
	executor: ResearchWorkstreamModelExecutor;
	computationalExecutor: ComputationalExecutor;
	artifactDirectory: string;
	workingDirectory?: string;
	maxRuntimeMs?: number;
}

export interface ComputationResearchWorkstreamResult {
	report: ResearchWorkstreamReport;
	artifacts: ComputationalArtifactDraft[];
}

interface ScriptSelection {
	draft: ComputationalScriptDraft;
	rejectionReason?: string;
}

const DEFAULT_MAX_RUNTIME_MS = 10_000;
const MAX_SCRIPT_CHARACTERS = 8_000;
const MAX_SUMMARY_CHARACTERS = 800;

export async function runComputationResearchWorkstreamStaged(
	input: RunComputationResearchWorkstreamInput,
	callbacks: ResearchWorkstreamStageCallbacks,
): Promise<ComputationResearchWorkstreamResult> {
	const rootQuestion = input.rootQuestion.trim();
	const { path, allPaths, executor } = input;
	const coordinatorBrief = buildCoordinatorBrief(path);
	await callbacks.onStageStarted?.("coordinator", "Choosing a bounded finite experiment.");
	await callbacks.onStageCompleted?.({
		stage: "coordinator",
		title: "Coordinator brief",
		summary: "Chose a bounded finite computation to gather examples without claiming a proof.",
		details: [coordinatorBrief, buildExperimentSummary(rootQuestion, path)],
	});

	await callbacks.onStageStarted?.("specialist", "Computational specialist is preparing a small script.");
	const specialistText = await runRoleSafely(
		executor,
		{
			role: "specialist",
			rootQuestion,
			path,
			allPaths,
			priorFindings: path.latestFindings,
			inputText: "",
			prompt: buildComputationSpecialistPrompt(rootQuestion, path),
		},
		buildFallbackSpecialistText(rootQuestion),
	);
	const scriptSelection = selectScriptDraft(rootQuestion, path, specialistText);
	const specialist = parseMarkdown(specialistText);
	await callbacks.onStageCompleted?.({
		stage: "specialist",
		title: "Computation script",
		summary:
			scriptSelection.rejectionReason !== undefined
				? "Rejected the model script and prepared a deterministic bounded fallback."
				: "Prepared a bounded Python script for finite evidence.",
		details: [
			scriptSelection.draft.summary,
			...(scriptSelection.rejectionReason ? [`Rejected script: ${scriptSelection.rejectionReason}`] : []),
			...renderRoleDetails(specialist).slice(0, 4),
		],
		rawText: specialistText,
	});

	await callbacks.onStageStarted?.("computation", "Running the bounded finite computation.");
	const execution = await runComputationSafely(input, scriptSelection.draft);
	await callbacks.onStageCompleted?.({
		stage: "computation",
		title: "Computation",
		summary:
			execution.exitCode === 0
				? `Finished bounded computation with exit code ${execution.exitCode}.`
				: `Computation stopped with exit code ${execution.exitCode}.`,
		details: summarizeExecutionDetails(execution),
	});

	const computationContext = buildComputationContext(scriptSelection, execution);
	await callbacks.onStageStarted?.("critic", "Critic is checking what the computation does and does not establish.");
	const criticText = await runRoleSafely(
		executor,
		{
			role: "critic",
			rootQuestion,
			path,
			allPaths,
			priorFindings: path.latestFindings,
			inputText: computationContext,
			prompt: buildComputationCriticPrompt(rootQuestion, path, computationContext),
		},
		buildFallbackCriticText(execution),
	);
	const critic = parseMarkdown(criticText);
	await callbacks.onStageCompleted?.({
		stage: "critic",
		title: "Computation review",
		summary: "Reviewed the finite computation for overclaims and limitations.",
		details: renderRoleDetails(critic),
		rawText: criticText,
	});

	await callbacks.onStageStarted?.("synthesizer", "Synthesizing computation-backed research notes.");
	const synthesizerText = await runRoleSafely(
		executor,
		{
			role: "synthesizer",
			rootQuestion,
			path,
			allPaths,
			priorFindings: path.latestFindings,
			inputText: `${computationContext}\n\nCritic review:\n${criticText}`.trim(),
			prompt: buildComputationSynthesizerPrompt(rootQuestion, path, computationContext, criticText),
		},
		buildFallbackSynthesizerText(execution),
	);
	const synthesizer = parseMarkdown(synthesizerText);
	await callbacks.onStageCompleted?.({
		stage: "synthesizer",
		title: "Synthesis",
		summary: "Synthesized finite evidence, limitations, and the next move.",
		details: renderRoleDetails(synthesizer),
		rawText: synthesizerText,
	});

	const artifacts = buildArtifactDrafts(input.artifactDirectory, scriptSelection, execution);
	const report = buildReport({
		input,
		coordinatorBrief,
		scriptSelection,
		execution,
		critic,
		synthesizer,
	});
	return { report, artifacts };
}

export function isComputationalResearchPath(path: ResearchPath): boolean {
	const combined = `${path.title} ${path.objective}`.toLowerCase();
	return /\b(?:small examples?|counterexamples?|finite checks?|computation|computational|search|examples?)\b/.test(
		combined,
	);
}

function buildReport(input: {
	input: RunComputationResearchWorkstreamInput;
	coordinatorBrief: string;
	scriptSelection: ScriptSelection;
	execution: ComputationalExecutionResult;
	critic: ParsedMarkdown;
	synthesizer: ParsedMarkdown;
}): ResearchWorkstreamReport {
	const { path, now } = input.input;
	const execution = input.execution;
	const findings = ensureNonEmpty(
		pickItems(sectionItems(input.synthesizer, "finding"), sectionItems(input.synthesizer, "observation")),
		defaultFindings(execution),
	);
	const criticisms = ensureFiniteLimitation(
		ensureNonEmpty(
			pickItems(sectionItems(input.synthesizer, "limitation"), sectionItems(input.critic, "review")),
			defaultCriticisms(execution),
		),
	);
	const gaps = ensureNonEmpty(
		pickItems(sectionItems(input.synthesizer, "gap"), sectionItems(input.critic, "gap")),
		defaultGaps(execution),
	);
	const suggestedNextMove =
		pickSuggestedNextMove(sectionItems(input.synthesizer, "next")) ??
		"Use the finite observations to refine another path without treating the computation as a proof.";
	const promisingStrategy = ensureNonEmpty(
		pickItems(sectionItems(input.synthesizer, "promising"), sectionItems(input.synthesizer, "strategy")),
		["Use finite examples to look for obstructions and candidate lemmas, while keeping theorem claims separate."],
	);
	const steps: ResearchWorkstreamStep[] = [
		{
			role: "coordinator",
			title: "Coordinator brief",
			summary: "Choosing a bounded finite experiment.",
			details: [input.coordinatorBrief, buildExperimentSummary(input.input.rootQuestion, path)],
		},
		{
			role: "specialist",
			title: "Computation script",
			summary: "Preparing a bounded local script.",
			details: [
				input.scriptSelection.draft.summary,
				...(input.scriptSelection.rejectionReason
					? [`Rejected generated script: ${input.scriptSelection.rejectionReason}`]
					: []),
			],
		},
		{
			role: "critic",
			title: "Computation review",
			summary: "Checking computation limits before updating the working paper.",
			details: criticisms,
		},
		{
			role: "synthesizer",
			title: "Synthesis",
			summary: "Producing a cautious computation-backed note.",
			details: [...promisingStrategy, ...findings, `Next: ${suggestedNextMove}`],
		},
	];
	return {
		pathId: path.id,
		pathTitle: path.title,
		startedAt: now,
		completedAt: now,
		status: execution.exitCode === 0 ? "completed" : "blocked",
		coordinatorBrief: input.coordinatorBrief,
		steps,
		promisingStrategy,
		findings,
		criticisms,
		gaps,
		humanHelpUseful:
			execution.exitCode === 0
				? pickItems(sectionItems(input.synthesizer, "human"), sectionItems(input.critic, "human"))
				: ["Review the failed computation or adjust the finite experiment before relying on its output."],
		suggestedNextMove,
		workingPaperSectionTitle: "Examples and finite checks",
		workingPaperSummary: buildWorkingPaperSummary(path, {
			findings,
			criticisms,
			gaps,
			suggestedNextMove,
			execution,
		}),
		sourceIds: [],
		claimSupportIds: [],
		computationalArtifactIds: [],
	};
}

function buildArtifactDrafts(
	artifactDirectory: string,
	selection: ScriptSelection,
	execution: ComputationalExecutionResult,
): ComputationalArtifactDraft[] {
	const scriptFileName = execution.scriptFileName ?? sanitizeScriptFileName(selection.draft.fileName);
	const stdoutFileName = execution.stdoutFileName ?? "stdout.txt";
	const stderrFileName = execution.stderrFileName ?? "stderr.txt";
	const artifacts: ComputationalArtifactDraft[] = [
		{
			kind: "script",
			status: execution.exitCode === 0 ? "completed" : "failed",
			title: "Computation script",
			filePath: joinArtifactPath(artifactDirectory, scriptFileName),
			command: execution.command,
			exitCode: execution.exitCode,
			summary: selection.draft.summary,
		},
		{
			kind: "stdout",
			status: execution.exitCode === 0 ? "completed" : "failed",
			title: "Computation output",
			filePath: joinArtifactPath(artifactDirectory, stdoutFileName),
			command: execution.command,
			exitCode: execution.exitCode,
			summary: summarizeOutput(execution.stdout, "No standard output was produced."),
		},
	];
	if (execution.stderr.trim().length > 0) {
		artifacts.push({
			kind: "stderr",
			status: execution.exitCode === 0 ? "completed" : "failed",
			title: "Computation diagnostics",
			filePath: joinArtifactPath(artifactDirectory, stderrFileName),
			command: execution.command,
			exitCode: execution.exitCode,
			summary: summarizeOutput(execution.stderr, "No diagnostics were produced."),
		});
	}
	return artifacts;
}

async function runComputationSafely(
	input: RunComputationResearchWorkstreamInput,
	draft: ComputationalScriptDraft,
): Promise<ComputationalExecutionResult> {
	try {
		return await input.computationalExecutor.runScript(draft, {
			rootQuestion: input.rootQuestion,
			pathTitle: input.path.title,
			pathObjective: input.path.objective,
			workingDirectory: input.workingDirectory ?? input.artifactDirectory,
			maxRuntimeMs: input.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS,
		});
	} catch (error: unknown) {
		return {
			command: `python3 ${sanitizeScriptFileName(draft.fileName)}`,
			exitCode: 1,
			stdout: "",
			stderr: safeErrorMessage(error),
			durationMs: 0,
			scriptFileName: sanitizeScriptFileName(draft.fileName),
			stdoutFileName: "stdout.txt",
			stderrFileName: "stderr.txt",
		};
	}
}

function selectScriptDraft(rootQuestion: string, path: ResearchPath, specialistText: string): ScriptSelection {
	const fallback = buildDeterministicScriptDraft(rootQuestion, path);
	const fences = [...specialistText.matchAll(/```([A-Za-z0-9_-]*)\s*\n([\s\S]*?)```/g)];
	if (fences.length !== 1) {
		return fences.length === 0
			? { draft: fallback }
			: { draft: fallback, rejectionReason: "multiple code blocks were produced" };
	}
	const language = fences[0]?.[1]?.trim().toLowerCase() || "python";
	const content = fences[0]?.[2]?.trim() ?? "";
	if (language !== "python" && language !== "py") {
		return { draft: fallback, rejectionReason: `unsupported language ${language}` };
	}
	const unsafeReason = validateScriptContent(content);
	if (unsafeReason) {
		return { draft: fallback, rejectionReason: unsafeReason };
	}
	const summary = firstNonEmptyLineBeforeFence(specialistText) ?? fallback.summary;
	return {
		draft: {
			fileName: "search.py",
			language: "python",
			content,
			summary,
		},
	};
}

function validateScriptContent(content: string): string | undefined {
	if (content.length === 0) {
		return "empty script";
	}
	if (content.length > MAX_SCRIPT_CHARACTERS) {
		return "script exceeded the length limit";
	}
	const lowered = content.toLowerCase();
	const blockedPatterns: Array<[RegExp, string]> = [
		[/\bimport\s+os\b/, "uses os"],
		[/\bfrom\s+os\s+import\b/, "uses os"],
		[/\bimport\s+subprocess\b/, "uses subprocess"],
		[/\bfrom\s+subprocess\s+import\b/, "uses subprocess"],
		[/\bimport\s+requests\b/, "uses network requests"],
		[/\bimport\s+urllib\b/, "uses network access"],
		[/\bimport\s+http\b/, "uses network access"],
		[/\bsocket\b/, "uses network access"],
		[/\bopen\s*\(/, "uses file access"],
		[/\b(?:pip|npm|pnpm|yarn|curl|wget)\b/, "uses package manager or download commands"],
	];
	return blockedPatterns.find(([pattern]) => pattern.test(lowered))?.[1];
}

function buildDeterministicScriptDraft(rootQuestion: string, path: ResearchPath): ComputationalScriptDraft {
	if (isNSquaredPlusOneQuestion(rootQuestion)) {
		return {
			fileName: "search.py",
			language: "python",
			content: [
				"import math",
				"",
				"BOUND = 10000",
				"",
				"def is_prime(value):",
				"    if value < 2:",
				"        return False",
				"    if value == 2:",
				"        return True",
				"    if value % 2 == 0:",
				"        return False",
				"    limit = math.isqrt(value)",
				"    candidate = 3",
				"    while candidate <= limit:",
				"        if value % candidate == 0:",
				"            return False",
				"        candidate += 2",
				"    return True",
				"",
				"hits = []",
				"for n in range(1, BOUND + 1):",
				"    value = n * n + 1",
				"    if is_prime(value):",
				"        hits.append((n, value))",
				"",
				"print(f'checked_range: 1 <= n <= {BOUND}')",
				"print(f'prime_values_found: {len(hits)}')",
				"print(f'first_hits: {hits[:20]}')",
				"print('parity_note: odd n > 1 gives even n^2 + 1 > 2, so only n = 1 or even n can work.')",
			].join("\n"),
			summary: "Finite search for prime values of n^2 + 1 with n <= 10000.",
		};
	}
	if (/\btwin primes?\b/i.test(rootQuestion)) {
		return {
			fileName: "search.py",
			language: "python",
			content: [
				"import math",
				"",
				"BOUND = 10000",
				"",
				"def is_prime(value):",
				"    if value < 2:",
				"        return False",
				"    if value == 2:",
				"        return True",
				"    if value % 2 == 0:",
				"        return False",
				"    limit = math.isqrt(value)",
				"    candidate = 3",
				"    while candidate <= limit:",
				"        if value % candidate == 0:",
				"            return False",
				"        candidate += 2",
				"    return True",
				"",
				"pairs = []",
				"for p in range(2, BOUND - 1):",
				"    if is_prime(p) and is_prime(p + 2):",
				"        pairs.append((p, p + 2))",
				"",
				"print(f'checked_range: p <= {BOUND}')",
				"print(f'twin_prime_pairs_found: {len(pairs)}')",
				"print(f'first_pairs: {pairs[:20]}')",
			].join("\n"),
			summary: "Finite search for twin-prime pairs with p <= 10000.",
		};
	}
	return {
		fileName: "search.py",
		language: "python",
		content: [
			"BOUND = 100",
			"print(f'checked_range: 1 <= n <= {BOUND}')",
			"print('generic_finite_check: no domain-specific safe computation was generated')",
			"print('observation: this records only that a bounded computation was requested')",
		].join("\n"),
		summary: `Generic bounded finite check for ${path.title}.`,
	};
}

function buildComputationSpecialistPrompt(rootQuestion: string, path: ResearchPath): string {
	return [
		"You are the computational specialist for one co-math research path.",
		`Root question: ${rootQuestion}`,
		`Selected path: ${path.title}`,
		`Path objective: ${path.objective}`,
		"",
		"Task:",
		"Design one bounded finite experiment and provide a small Python script.",
		"Use only Python standard-library computation, no network, no files, no subprocesses, no package installs.",
		"Print the checked bound/range and concise results to stdout.",
		"Treat finite output as evidence for pattern-finding, not as proof of any infinite statement.",
		"",
		"Return a short summary followed by exactly one fenced Python block.",
	].join("\n");
}

function buildComputationCriticPrompt(rootQuestion: string, path: ResearchPath, computationContext: string): string {
	return [
		"You are the critic for a computation-backed co-math research path.",
		`Root question: ${rootQuestion}`,
		`Selected path: ${path.title}`,
		"",
		"Computation context:",
		computationContext,
		"",
		"Task:",
		"Review the computation for safety, checked range, mathematical limitations, and overclaims.",
		"State explicitly that finite computation does not prove an infinite claim when relevant.",
		"",
		"Return markdown with these headings:",
		"## Review",
		"## Limitations",
		"## Gaps",
		"## Human help useful",
	].join("\n");
}

function buildComputationSynthesizerPrompt(
	rootQuestion: string,
	path: ResearchPath,
	computationContext: string,
	criticText: string,
): string {
	return [
		"You are the synthesizer for a computation-backed co-math research path.",
		`Root question: ${rootQuestion}`,
		`Selected path: ${path.title}`,
		"",
		"Computation context:",
		computationContext,
		"",
		"Critic review:",
		criticText.trim() || "(the critic produced no usable output)",
		"",
		"Task:",
		"Produce cautious research notes. Separate observations from theorem claims.",
		"Include the checked bound/range, runtime or exit code, and the fact that finite search is not a proof of infinitude.",
		"",
		"Return markdown with these headings:",
		"## Promising strategy",
		"## Findings",
		"## Limitations",
		"## Gaps",
		"## Human help useful",
		"## Next",
		"## Working paper summary",
	].join("\n");
}

async function runRoleSafely(
	executor: ResearchWorkstreamModelExecutor,
	request: ResearchWorkstreamModelRequest,
	fallbackText: string,
): Promise<string> {
	try {
		const response = await executor.run(request);
		return typeof response.text === "string" && response.text.trim().length > 0 ? response.text : fallbackText;
	} catch {
		return fallbackText;
	}
}

function buildFallbackSpecialistText(rootQuestion: string): string {
	const draft = buildDeterministicScriptDraft(rootQuestion, {
		id: "path-fallback",
		title: "Small examples and counterexamples",
		objective: "Gather finite examples.",
		status: "active",
		latestFindings: [],
		blockers: [],
		suggestedNextMove: "Run a bounded finite check.",
		priority: 1,
		createdAt: "",
		updatedAt: "",
	});
	return [draft.summary, "", "```python", draft.content, "```"].join("\n");
}

function buildFallbackCriticText(execution: ComputationalExecutionResult): string {
	return [
		"## Review",
		`- The computation exited with code ${execution.exitCode}.`,
		"- The output is finite computational evidence, not a theorem-level proof.",
		"## Limitations",
		"- A finite computation does not prove an infinite claim.",
		"## Gaps",
		...(execution.exitCode === 0
			? ["- The bridge from checked cases to a general theorem remains open."]
			: ["- The failed script must be fixed before using its output as evidence."]),
	].join("\n");
}

function buildFallbackSynthesizerText(execution: ComputationalExecutionResult): string {
	return [
		"## Promising strategy",
		"- Use the finite output to guide examples and candidate lemmas.",
		"## Findings",
		`- The bounded computation exited with code ${execution.exitCode}.`,
		...summarizeExecutionDetails(execution).map((detail) => `- ${detail}`),
		"## Limitations",
		"- A finite computation does not prove an infinite claim.",
		"## Gaps",
		...(execution.exitCode === 0
			? ["- The general proof or disproof is still open."]
			: ["- The computation failed and should be corrected before drawing conclusions."]),
		"## Next",
		"- Use the finite observations to refine the direct-proof or literature path.",
	].join("\n");
}

function renderRoleDetails(parsed: ParsedMarkdown): string[] {
	const items = parsed.sections.flatMap((section) => section.items);
	return items.length > 0 ? items : parsed.raw.slice(0, 12);
}

function pickItems(...candidates: string[][]): string[] {
	for (const candidate of candidates) {
		if (candidate.length > 0) {
			return candidate;
		}
	}
	return [];
}

function ensureNonEmpty(items: string[], fallback: string[]): string[] {
	return items.length > 0 ? items : fallback;
}

function ensureFiniteLimitation(items: string[]): string[] {
	return items.some((item) => /finite computation does not prove|finite search does not prove/i.test(item))
		? items
		: [...items, "A finite computation does not prove an infinite claim."];
}

function defaultFindings(execution: ComputationalExecutionResult): string[] {
	if (execution.exitCode !== 0) {
		return [`The computation did not complete successfully; exit code ${execution.exitCode}.`];
	}
	return summarizeExecutionDetails(execution);
}

function defaultCriticisms(execution: ComputationalExecutionResult): string[] {
	return execution.exitCode === 0
		? [
				"The finite output is evidence for pattern-finding only.",
				"A finite computation does not prove an infinite claim.",
			]
		: [
				"The computation failed, so its output should not be used as mathematical evidence yet.",
				"A failed finite computation does not prove or disprove the target statement.",
			];
}

function defaultGaps(execution: ComputationalExecutionResult): string[] {
	return execution.exitCode === 0
		? ["The checked finite range does not bridge to a theorem-level infinite statement."]
		: ["The computational experiment needs repair before it can inform this path."];
}

function pickSuggestedNextMove(items: string[]): string | undefined {
	const substantive = items
		.map((item) =>
			item
				.trim()
				.replace(
					/^(?:possible\s+)?(?:next|future)\s+(?:steps?|investigations?|directions?|moves?|work)\s*:\s*/i,
					"",
				)
				.replace(/^next\s*:\s*/i, "")
				.trim(),
		)
		.filter((item) => item.length > 0 && !/^[-\w\s]+:$/.test(item));
	return substantive.length > 0 ? substantive.slice(0, 3).join(" ") : undefined;
}

function buildComputationContext(selection: ScriptSelection, execution: ComputationalExecutionResult): string {
	return [
		"Script summary:",
		selection.draft.summary,
		...(selection.rejectionReason ? ["", `Rejected generated script: ${selection.rejectionReason}`] : []),
		"",
		`Command: ${execution.command}`,
		`Exit code: ${execution.exitCode}`,
		`Duration ms: ${execution.durationMs}`,
		"",
		"Stdout:",
		execution.stdout.trim() || "(none)",
		"",
		"Stderr:",
		execution.stderr.trim() || "(none)",
	].join("\n");
}

function summarizeExecutionDetails(execution: ComputationalExecutionResult): string[] {
	const lines = execution.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.slice(0, 5);
	return [
		`Exit code: ${execution.exitCode}`,
		`Runtime: ${execution.durationMs}ms`,
		...lines,
		...(execution.stderr.trim().length > 0 ? [`Diagnostics: ${summarizeOutput(execution.stderr, "")}`] : []),
	];
}

function summarizeOutput(output: string, fallback: string): string {
	const trimmed = output.trim();
	if (!trimmed) {
		return fallback;
	}
	if (trimmed.length <= MAX_SUMMARY_CHARACTERS) {
		return trimmed;
	}
	return `${trimmed.slice(0, MAX_SUMMARY_CHARACTERS - 3)}...`;
}

function buildExperimentSummary(rootQuestion: string, path: ResearchPath): string {
	if (isNSquaredPlusOneQuestion(rootQuestion)) {
		return "Finite search for prime values of n^2 + 1 over an explicit range, with parity noted separately.";
	}
	if (/\btwin primes?\b/i.test(rootQuestion)) {
		return "Finite search for twin-prime pairs over an explicit range.";
	}
	return `Finite example search for ${path.title}; observations must remain separate from proof claims.`;
}

function buildWorkingPaperSummary(
	path: ResearchPath,
	input: {
		findings: string[];
		criticisms: string[];
		gaps: string[];
		suggestedNextMove: string;
		execution: ComputationalExecutionResult;
	},
): string {
	return [
		`Research workstream: ${path.title}`,
		"",
		"Computation:",
		`- Command: ${input.execution.command}`,
		`- Exit code: ${input.execution.exitCode}`,
		`- Runtime: ${input.execution.durationMs}ms`,
		"",
		"Findings:",
		...input.findings.map((item) => `- ${item}`),
		"",
		"Limitations:",
		...input.criticisms.map((item) => `- ${item}`),
		...(input.gaps.length > 0 ? ["", "Open gaps:", ...input.gaps.map((item) => `- ${item}`)] : []),
		"",
		`Next: ${input.suggestedNextMove}`,
	].join("\n");
}

function firstNonEmptyLineBeforeFence(text: string): string | undefined {
	return text
		.split("```")[0]
		?.split("\n")
		.map((line) => stripBulletMarker(line.trim()))
		.find((line) => line.length > 0);
}

function sanitizeScriptFileName(fileName: string): string {
	const baseName = fileName.trim().split(/[\\/]/).at(-1) ?? "search.py";
	const cleaned = baseName.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+/, "");
	return cleaned.endsWith(".py") && cleaned !== "." && cleaned !== ".." ? cleaned : "search.py";
}

function joinArtifactPath(directory: string, fileName: string): string {
	return `${directory.replace(/\/+$/, "")}/${fileName.replace(/^\/+/, "")}`;
}

function isNSquaredPlusOneQuestion(rootQuestion: string): boolean {
	return /\bn\s*(?:\^2|²)\s*\+\s*1\b/i.test(rootQuestion);
}

function safeErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}
	if (typeof error === "string" && error.trim().length > 0) {
		return error.trim();
	}
	return "The computation stopped unexpectedly.";
}
