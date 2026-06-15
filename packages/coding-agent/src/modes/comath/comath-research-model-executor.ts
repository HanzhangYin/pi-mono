import { spawn } from "node:child_process";
import { getPiInvocation } from "../../../examples/extensions/co-math/role-runner.ts";
import type { ResearchWorkstreamModelExecutor } from "./comath-research-model-workstream.ts";

export interface CreateDefaultResearchModelExecutorOptions {
	cwd: string;
	/** Maximum time to wait for a single role model call before failing over to the fallback. */
	timeoutMs?: number;
	signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Production model executor for research workstreams. It reuses the established co-math model-call
 * pattern: spawn the `pi` CLI in `--mode json -p` and read the final assistant text. This inherits
 * the running session's provider/model/auth configuration (no second provider stack), exactly like
 * co-math role runs. On any failure (non-zero exit, timeout, empty output) it rejects so the harness
 * falls back to deterministic execution.
 */
export function createDefaultResearchModelExecutor(
	options: CreateDefaultResearchModelExecutorOptions,
): ResearchWorkstreamModelExecutor {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	return {
		run: async (request) => {
			const text = await runPiPrompt(request.prompt, options.cwd, timeoutMs, options.signal);
			return { text };
		},
	};
}

function runPiPrompt(prompt: string, cwd: string, timeoutMs: number, signal?: AbortSignal): Promise<string> {
	const invocation = getPiInvocation(["--mode", "json", "-p", "--no-session", prompt]);
	return new Promise<string>((resolve, reject) => {
		const proc = spawn(invocation.command, invocation.args, {
			cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdoutBuffer = "";
		let stderr = "";
		let finalText = "";
		let settled = false;

		const finish = (action: () => void): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			action();
		};

		const timer = setTimeout(() => {
			finish(() => {
				proc.kill("SIGTERM");
				reject(new Error("Model-backed research call timed out."));
			});
		}, timeoutMs);

		const onAbort = (): void => {
			finish(() => {
				proc.kill("SIGTERM");
				reject(new Error("Model-backed research call was aborted."));
			});
		};
		if (signal) {
			if (signal.aborted) {
				onAbort();
				return;
			}
			signal.addEventListener("abort", onAbort, { once: true });
		}

		const processLine = (line: string): void => {
			const event = parseJsonObject(line);
			if (!event || event.type !== "message_end") return;
			const text = getAssistantText(asObject(event.message));
			if (text.length > 0) {
				finalText = text;
			}
		};

		proc.stdout.on("data", (data: Buffer) => {
			stdoutBuffer += data.toString();
			const lines = stdoutBuffer.split("\n");
			stdoutBuffer = lines.pop() ?? "";
			for (const line of lines) {
				processLine(line);
			}
		});
		proc.stderr.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		proc.on("error", (error) => {
			finish(() => reject(error));
		});

		proc.on("close", (code) => {
			finish(() => {
				if (stdoutBuffer.trim().length > 0) {
					processLine(stdoutBuffer);
				}
				if (code !== 0) {
					reject(
						new Error(stderr.trim() || `Model-backed research process exited with code ${code ?? "unknown"}.`),
					);
					return;
				}
				const trimmed = finalText.trim();
				if (trimmed.length === 0) {
					reject(new Error("Model-backed research call produced no output."));
					return;
				}
				resolve(trimmed);
			});
		});
	});
}

function parseJsonObject(line: string): Record<string, unknown> | undefined {
	if (line.trim().length === 0) return undefined;
	try {
		return asObject(JSON.parse(line) as unknown);
	} catch {
		return undefined;
	}
}

function asObject(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function getAssistantText(message: Record<string, unknown> | undefined): string {
	if (!message || message.role !== "assistant" || !Array.isArray(message.content)) return "";
	for (const part of message.content) {
		const record = asObject(part);
		if (record && record.type === "text" && typeof record.text === "string") {
			return record.text;
		}
	}
	return "";
}
