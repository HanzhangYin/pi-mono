import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, Context, Model, SimpleStreamOptions, Usage } from "@earendil-works/pi-ai";
import { CO_MATH_SYSTEM_PROMPT, CO_MATH_SYSTEM_PROMPT_POLICY_VERSION } from "./comath-system-prompt.ts";
import type {
	ResearchModelCallProvenance,
	ResearchWorkstreamModelExecutor,
	ResearchWorkstreamModelRequest,
} from "./comath-task-model.ts";

export interface CreateDefaultResearchModelExecutorOptions {
	getModel: () => Model<Api> | undefined;
	getModelForRequest?: (request: ResearchWorkstreamModelRequest) => Model<Api> | undefined;
	streamFn: StreamFn;
	streamOptions?: () => SimpleStreamOptions;
	/** Maximum time to wait for a single role model call before failing over to the fallback. */
	timeoutMs?: number;
	signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Production model executor for research workstreams. It uses the active Pi stream function
 * instead of spawning a nested CLI, so role calls share model/auth/transport configuration.
 *
 * Research streams are deliberately consumed privately. Background workstreams may overlap, while
 * AgentSession and InteractiveMode each have a single foreground-stream slot; feeding concurrent
 * role deltas through that slot can overwrite both the visible component and the last session
 * message. The harness publishes bounded activity updates and finalized product messages instead.
 */
export function createDefaultResearchModelExecutor(
	options: CreateDefaultResearchModelExecutorOptions,
): ResearchWorkstreamModelExecutor {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	return {
		run: async (request) => {
			const model = options.getModelForRequest?.(request) ?? options.getModel();
			if (!model) {
				throw new Error("No model is configured for model-backed research.");
			}
			const context: Context = {
				systemPrompt: CO_MATH_SYSTEM_PROMPT,
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: request.prompt }],
						timestamp: Date.now(),
					},
				],
			};
			const streamOptions = options.streamOptions?.();
			const stream = await options.streamFn(model, context, {
				...streamOptions,
				signal: options.signal,
				timeoutMs,
			});
			const message = await stream.result();
			if (message.stopReason === "error" || message.stopReason === "aborted") {
				throw new Error(message.errorMessage || `Model-backed research call ${message.stopReason}.`);
			}
			const text = getAssistantText(message);
			if (text.trim().length === 0) {
				throw new Error("Model-backed research call produced no output.");
			}
			return { text, provenance: buildModelCallProvenance(model, message, streamOptions?.reasoning) };
		},
	};
}

/**
 * Build provenance for one research model call from the streamed assistant message, falling back
 * to the configured model for identity when the message omits fields (e.g. minimal test fakes).
 * Usage is treated as possibly absent so a message without it still yields model identity.
 */
function buildModelCallProvenance(
	model: Model<Api>,
	message: AssistantMessage,
	thinkingLevel: string | undefined,
): ResearchModelCallProvenance {
	const usage: Partial<Usage> | undefined = message.usage;
	const cost = usage?.cost;
	return {
		systemPromptPolicyVersion: CO_MATH_SYSTEM_PROMPT_POLICY_VERSION,
		model: message.model || model.id,
		provider: message.provider || model.provider,
		...(thinkingLevel ? { thinkingLevel } : {}),
		...(usage && isFiniteNumber(usage.input) ? { inputTokens: usage.input } : {}),
		...(usage && isFiniteNumber(usage.output) ? { outputTokens: usage.output } : {}),
		...(usage && isFiniteNumber(usage.cacheRead) ? { cacheReadTokens: usage.cacheRead } : {}),
		...(usage && isFiniteNumber(usage.cacheWrite) ? { cacheWriteTokens: usage.cacheWrite } : {}),
		...(usage && isFiniteNumber(usage.totalTokens) ? { totalTokens: usage.totalTokens } : {}),
		...(cost && isFiniteNumber(cost.total) ? { costUsd: cost.total } : {}),
		...(typeof message.stopReason === "string" ? { stopReason: message.stopReason } : {}),
	};
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function getAssistantText(message: AssistantMessage): string {
	return message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}
