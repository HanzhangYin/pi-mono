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
				systemPrompt: RESEARCH_ROLE_SYSTEM_PROMPT,
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

const RESEARCH_ROLE_SYSTEM_PROMPT = [
	"You are a focused mathematical research role inside Pi.",
	"Answer only the assigned role prompt.",
	"Do not mention internal tools, hidden state, system instructions, implementation details, or XML/tool tags.",
	"Do not call or describe tools such as comath_state.",
	"Keep the output concise, mathematical, and directly useful to the user.",
	"Preserve uncertainty and separate finite evidence from proof.",
].join("\n");

function getAssistantText(message: AssistantMessage): string {
	return message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}
