import type { StreamFn } from "@earendil-works/pi-agent-core";
import type {
	Api,
	AssistantMessage,
	AssistantMessageEventStream,
	Context,
	Model,
	SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import type { ResearchWorkstreamModelExecutor } from "./comath-research-model-workstream.ts";

export interface CreateDefaultResearchModelExecutorOptions {
	getModel: () => Model<Api> | undefined;
	getSystemPrompt: () => string;
	streamFn: StreamFn;
	streamAssistantMessage?: (stream: AssistantMessageEventStream) => Promise<AssistantMessage>;
	streamOptions?: () => SimpleStreamOptions;
	/** Maximum time to wait for a single role model call before failing over to the fallback. */
	timeoutMs?: number;
	signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Production model executor for research workstreams. It uses the active Pi session stream function
 * instead of spawning a nested CLI, so co-math role calls share the foreground model/auth/transport
 * path and can render through the normal assistant streaming UI.
 */
export function createDefaultResearchModelExecutor(
	options: CreateDefaultResearchModelExecutorOptions,
): ResearchWorkstreamModelExecutor {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	return {
		run: async (request) => {
			const model = options.getModel();
			if (!model) {
				throw new Error("No model is configured for model-backed research.");
			}
			const context: Context = {
				systemPrompt: options.getSystemPrompt(),
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: request.prompt }],
						timestamp: Date.now(),
					},
				],
			};
			const stream = await options.streamFn(model, context, {
				...options.streamOptions?.(),
				signal: options.signal,
				timeoutMs,
			});
			const message = options.streamAssistantMessage
				? await options.streamAssistantMessage(stream)
				: await stream.result();
			if (message.stopReason === "error" || message.stopReason === "aborted") {
				throw new Error(message.errorMessage || `Model-backed research call ${message.stopReason}.`);
			}
			const text = getAssistantText(message);
			if (text.trim().length === 0) {
				throw new Error("Model-backed research call produced no output.");
			}
			return { text };
		},
	};
}

function getAssistantText(message: AssistantMessage): string {
	return message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}
