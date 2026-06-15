import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import * as nodePath from "node:path";
import { performance } from "node:perf_hooks";

export interface ComputationalExperimentRequest {
	rootQuestion: string;
	pathTitle: string;
	pathObjective: string;
	workingDirectory: string;
	maxRuntimeMs: number;
}

export interface ComputationalScriptDraft {
	fileName: string;
	language: "python" | "typescript";
	content: string;
	summary: string;
}

export interface ComputationalExecutionResult {
	command: string;
	exitCode: number;
	stdout: string;
	stderr: string;
	durationMs: number;
	scriptFileName?: string;
	stdoutFileName?: string;
	stderrFileName?: string;
}

export interface ComputationalExecutor {
	runScript(
		draft: ComputationalScriptDraft,
		request: ComputationalExperimentRequest,
	): Promise<ComputationalExecutionResult>;
}

export interface DefaultComputationalExecutorOptions {
	pythonCommand?: string;
	maxOutputCharacters?: number;
}

const DEFAULT_MAX_RUNTIME_MS = 10_000;
const DEFAULT_MAX_OUTPUT_CHARACTERS = 32_000;
const STDOUT_FILE_NAME = "stdout.txt";
const STDERR_FILE_NAME = "stderr.txt";

export function createDefaultComputationalExecutor(
	options: DefaultComputationalExecutorOptions = {},
): ComputationalExecutor {
	const pythonCommand = options.pythonCommand ?? "python3";
	const maxOutputCharacters = options.maxOutputCharacters ?? DEFAULT_MAX_OUTPUT_CHARACTERS;
	return {
		async runScript(draft, request) {
			if (draft.language !== "python") {
				throw new Error("Only Python computation scripts are supported.");
			}
			assertSafeScriptText(draft.content);
			const fileName = sanitizeScriptFileName(draft.fileName);
			const runtimeMs = Math.max(
				1,
				Math.min(request.maxRuntimeMs || DEFAULT_MAX_RUNTIME_MS, DEFAULT_MAX_RUNTIME_MS),
			);
			await mkdir(request.workingDirectory, { recursive: true });
			const scriptPath = nodePath.join(request.workingDirectory, fileName);
			await writeFile(scriptPath, draft.content, "utf8");
			const result = await runPythonScript({
				pythonCommand,
				scriptFileName: fileName,
				workingDirectory: request.workingDirectory,
				maxRuntimeMs: runtimeMs,
				maxOutputCharacters,
			});
			await writeFile(nodePath.join(request.workingDirectory, STDOUT_FILE_NAME), result.stdout, "utf8");
			await writeFile(nodePath.join(request.workingDirectory, STDERR_FILE_NAME), result.stderr, "utf8");
			return {
				...result,
				scriptFileName: fileName,
				stdoutFileName: STDOUT_FILE_NAME,
				stderrFileName: STDERR_FILE_NAME,
			};
		},
	};
}

interface RunPythonScriptInput {
	pythonCommand: string;
	scriptFileName: string;
	workingDirectory: string;
	maxRuntimeMs: number;
	maxOutputCharacters: number;
}

function runPythonScript(input: RunPythonScriptInput): Promise<ComputationalExecutionResult> {
	return new Promise((resolve) => {
		const startedAt = performance.now();
		let stdout = "";
		let stderr = "";
		let settled = false;
		let timedOut = false;
		const child = spawn(input.pythonCommand, [input.scriptFileName], {
			cwd: input.workingDirectory,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const timeout = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, input.maxRuntimeMs);

		const finish = (exitCode: number, extraStderr = "") => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			const timeoutMessage = timedOut ? `Timed out after ${input.maxRuntimeMs}ms.` : "";
			resolve({
				command: `${input.pythonCommand} ${input.scriptFileName}`,
				exitCode,
				stdout,
				stderr: capOutput(
					[stderr, extraStderr, timeoutMessage].filter((part) => part.length > 0).join("\n"),
					input.maxOutputCharacters,
				),
				durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
			});
		};

		child.stdout.on("data", (chunk: Buffer) => {
			stdout = capOutput(`${stdout}${chunk.toString("utf8")}`, input.maxOutputCharacters);
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr = capOutput(`${stderr}${chunk.toString("utf8")}`, input.maxOutputCharacters);
		});
		child.on("error", (error) => {
			finish(1, error.message);
		});
		child.on("close", (code) => {
			finish(code ?? (timedOut ? 124 : 1));
		});
	});
}

function sanitizeScriptFileName(fileName: string): string {
	const baseName = nodePath.basename(fileName.trim() || "search.py");
	const cleaned = baseName.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+/, "");
	if (!cleaned || cleaned === "." || cleaned === "..") {
		return "search.py";
	}
	return cleaned.endsWith(".py") ? cleaned : "search.py";
}

function assertSafeScriptText(content: string): void {
	const lowered = content.toLowerCase();
	const blockedPatterns = [
		/\bimport\s+os\b/,
		/\bfrom\s+os\s+import\b/,
		/\bimport\s+subprocess\b/,
		/\bfrom\s+subprocess\s+import\b/,
		/\bimport\s+requests\b/,
		/\bimport\s+urllib\b/,
		/\bimport\s+http\b/,
		/\bsocket\b/,
		/\bopen\s*\(/,
		/\b(?:pip|npm|pnpm|yarn|curl|wget)\b/,
	];
	if (blockedPatterns.some((pattern) => pattern.test(lowered))) {
		throw new Error("Computation script contains an unsafe operation.");
	}
}

function capOutput(output: string, maxCharacters: number): string {
	if (output.length <= maxCharacters) {
		return output;
	}
	return `${output.slice(0, maxCharacters - 3)}...`;
}
