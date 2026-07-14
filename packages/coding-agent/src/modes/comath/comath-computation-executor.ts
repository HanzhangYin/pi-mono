import { spawn } from "node:child_process";
import { access, mkdir, realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
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
	/** Fail-closed OS isolation backend. `auto` selects the native backend for this platform. */
	sandboxBackend?: "auto" | "bubblewrap" | "sandbox-exec";
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
	const sandboxBackend = options.sandboxBackend ?? "auto";
	return {
		async runScript(draft, request) {
			if (draft.language !== "python") {
				throw new Error("Only Python computation scripts are supported.");
			}
			const fileName = sanitizeScriptFileName(draft.fileName);
			const runtimeMs = Math.max(
				1,
				Math.min(request.maxRuntimeMs || DEFAULT_MAX_RUNTIME_MS, DEFAULT_MAX_RUNTIME_MS),
			);
			await mkdir(request.workingDirectory, { recursive: true });
			await mkdir(nodePath.join(request.workingDirectory, ".tmp"), { recursive: true });
			const scriptPath = nodePath.join(request.workingDirectory, fileName);
			await writeFile(scriptPath, draft.content, "utf8");
			const result = await runPythonScript({
				pythonCommand,
				scriptFileName: fileName,
				workingDirectory: request.workingDirectory,
				maxRuntimeMs: runtimeMs,
				maxOutputCharacters,
				sandboxBackend,
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
	sandboxBackend: "auto" | "bubblewrap" | "sandbox-exec";
}

interface SandboxedLaunch {
	command: string;
	args: string[];
	displayCommand: string;
	env: Record<string, string>;
	workingDirectory: string;
}

async function runPythonScript(input: RunPythonScriptInput): Promise<ComputationalExecutionResult> {
	const launch = await buildSandboxedLaunch(input);
	return new Promise((resolve) => {
		const startedAt = performance.now();
		let stdout = "";
		let stderr = "";
		let settled = false;
		let timedOut = false;
		const child = spawn(launch.command, launch.args, {
			cwd: launch.workingDirectory,
			stdio: ["ignore", "pipe", "pipe"],
			env: launch.env,
			detached: process.platform !== "win32",
		});
		const timeout = setTimeout(() => {
			timedOut = true;
			killProcessTree(child.pid);
		}, input.maxRuntimeMs);

		const finish = (exitCode: number, extraStderr = "") => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			const timeoutMessage = timedOut ? `Timed out after ${input.maxRuntimeMs}ms.` : "";
			resolve({
				command: launch.displayCommand,
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

async function buildSandboxedLaunch(input: RunPythonScriptInput): Promise<SandboxedLaunch> {
	const sandboxWorkingDirectory = await realpath(input.workingDirectory);
	const backend =
		input.sandboxBackend === "auto"
			? process.platform === "darwin"
				? "sandbox-exec"
				: process.platform === "linux"
					? "bubblewrap"
					: undefined
			: input.sandboxBackend;
	if (!backend) {
		throw new Error(`No supported computation sandbox is available on ${process.platform}.`);
	}
	const env = sandboxEnvironment(sandboxWorkingDirectory);
	if (backend === "sandbox-exec") {
		const sandboxCommand = await findExecutable("sandbox-exec", ["/usr/bin/sandbox-exec"]);
		if (!sandboxCommand) {
			throw new Error("Computation sandbox unavailable: sandbox-exec was not found.");
		}
		return {
			command: sandboxCommand,
			args: ["-p", buildSeatbeltProfile(sandboxWorkingDirectory), input.pythonCommand, input.scriptFileName],
			displayCommand: `sandbox-exec ${input.pythonCommand} ${input.scriptFileName}`,
			env,
			workingDirectory: sandboxWorkingDirectory,
		};
	}
	const bubblewrapCommand = await findExecutable("bwrap", ["/usr/bin/bwrap", "/bin/bwrap"]);
	if (!bubblewrapCommand) {
		throw new Error("Computation sandbox unavailable: bubblewrap was not found.");
	}
	const readOnlyRoots = (
		await Promise.all(
			["/usr", "/bin", "/lib", "/lib64", "/etc"].map(async (candidate) => {
				try {
					await access(candidate);
					return candidate;
				} catch {
					return undefined;
				}
			}),
		)
	).filter((candidate): candidate is string => candidate !== undefined);
	return {
		command: bubblewrapCommand,
		args: [
			"--die-with-parent",
			"--new-session",
			"--unshare-all",
			"--unshare-net",
			...readOnlyRoots.flatMap((root) => ["--ro-bind", root, root]),
			"--proc",
			"/proc",
			"--dev",
			"/dev",
			"--tmpfs",
			"/tmp",
			"--bind",
			sandboxWorkingDirectory,
			sandboxWorkingDirectory,
			"--chdir",
			sandboxWorkingDirectory,
			"--clearenv",
			...Object.entries(env).flatMap(([key, value]) => ["--setenv", key, value]),
			input.pythonCommand,
			input.scriptFileName,
		],
		displayCommand: `bwrap ${input.pythonCommand} ${input.scriptFileName}`,
		env,
		workingDirectory: sandboxWorkingDirectory,
	};
}

function buildSeatbeltProfile(workingDirectory: string): string {
	const escapedDirectory = escapeSeatbeltPath(workingDirectory);
	const escapedHome = escapeSeatbeltPath(homedir());
	return [
		"(version 1)",
		"(allow default)",
		"(deny file-write*)",
		`(deny file-read* (subpath "${escapedHome}") (subpath "/private/tmp") (subpath "/private/var/folders"))`,
		`(allow file-read* file-write* (subpath "${escapedDirectory}"))`,
		"(deny network*)",
	].join("\n");
}

function escapeSeatbeltPath(value: string): string {
	return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function sandboxEnvironment(workingDirectory: string): Record<string, string> {
	return {
		PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
		HOME: workingDirectory,
		TMPDIR: nodePath.join(workingDirectory, ".tmp"),
		LANG: "C.UTF-8",
		LC_ALL: "C.UTF-8",
		PYTHONHASHSEED: "0",
		PYTHONDONTWRITEBYTECODE: "1",
	};
}

async function findExecutable(name: string, fallbacks: readonly string[]): Promise<string | undefined> {
	const pathCandidates = (process.env.PATH ?? "")
		.split(nodePath.delimiter)
		.filter((directory) => directory.length > 0)
		.map((directory) => nodePath.join(directory, name));
	for (const candidate of [...fallbacks, ...pathCandidates]) {
		try {
			await access(candidate);
			return candidate;
		} catch {
			// Continue to the next candidate.
		}
	}
	return undefined;
}

function killProcessTree(pid: number | undefined): void {
	if (pid === undefined) {
		return;
	}
	try {
		if (process.platform === "win32") {
			process.kill(pid, "SIGKILL");
		} else {
			process.kill(-pid, "SIGKILL");
		}
	} catch {
		// The process may already have exited.
	}
}

function sanitizeScriptFileName(fileName: string): string {
	const baseName = nodePath.basename(fileName.trim() || "search.py");
	const cleaned = baseName.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+/, "");
	if (!cleaned || cleaned === "." || cleaned === "..") {
		return "search.py";
	}
	return cleaned.endsWith(".py") ? cleaned : "search.py";
}

function capOutput(output: string, maxCharacters: number): string {
	if (output.length <= maxCharacters) {
		return output;
	}
	return `${output.slice(0, maxCharacters - 3)}...`;
}
