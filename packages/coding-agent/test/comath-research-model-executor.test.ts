import type { StreamFn } from "@earendil-works/pi-agent-core";
import {
	type Api,
	type AssistantMessage,
	createAssistantMessageEventStream,
	type Model,
	type TextContent,
} from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { createDefaultResearchModelExecutor } from "../src/modes/comath/comath-research-model-executor.ts";
import type { ResearchWorkstreamModelRequest } from "../src/modes/comath/comath-research-model-workstream.ts";

function createModel(): Model<Api> {
	return {
		id: "mock-model",
		name: "Mock Model",
		api: "openai-completions",
		provider: "openai",
		baseUrl: "https://example.test",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 4096,
	};
}

function createAssistantMessage(text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "openai-completions",
		provider: "openai",
		model: "mock-model",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

function createRequest(prompt: string): ResearchWorkstreamModelRequest {
	return {
		role: "specialist",
		rootQuestion: "Are there infinitely many primes of the form n^2 + 1?",
		path: {
			id: "path-1",
			title: "Small examples and counterexamples",
			objective: "Test examples.",
			status: "active",
			latestFindings: [],
			blockers: [],
			suggestedNextMove: "Continue examples.",
			priority: 1,
			createdAt: "2026-06-05T12:00:00.000Z",
			updatedAt: "2026-06-05T12:00:00.000Z",
		},
		allPaths: [],
		priorFindings: [],
		inputText: "",
		prompt,
	};
}

function isTextContent(part: unknown): part is TextContent {
	return (
		typeof part === "object" &&
		part !== null &&
		(part as { type?: unknown }).type === "text" &&
		typeof (part as { text?: unknown }).text === "string"
	);
}

describe("default co-math research model executor", () => {
	it("uses the active Pi stream function and renderer instead of a nested CLI", async () => {
		const observedEvents: string[] = [];
		let observedPrompt = "";
		let observedSystemPrompt = "";
		let observedSessionId: string | undefined;
		let observedTimeoutMs = 0;
		const finalText = "## Findings\n- Streaming research output.";
		const streamFn: StreamFn = (_model, context, options) => {
			observedSystemPrompt = context.systemPrompt ?? "";
			const promptParts: string[] = [];
			for (const message of context.messages) {
				if (!Array.isArray(message.content)) continue;
				for (const part of message.content) {
					if (isTextContent(part)) {
						promptParts.push(part.text);
					}
				}
			}
			observedPrompt = promptParts.join("\n");
			observedSessionId = options?.sessionId;
			observedTimeoutMs = options?.timeoutMs ?? 0;
			const stream = createAssistantMessageEventStream();
			const partial = createAssistantMessage("");
			const final = createAssistantMessage(finalText);
			stream.push({ type: "start", partial });
			stream.push({ type: "text_start", contentIndex: 0, partial });
			stream.push({
				type: "text_delta",
				contentIndex: 0,
				delta: finalText,
				partial: createAssistantMessage(finalText),
			});
			stream.push({ type: "text_end", contentIndex: 0, content: finalText, partial: final });
			stream.push({ type: "done", reason: "stop", message: final });
			return stream;
		};
		const executor = createDefaultResearchModelExecutor({
			getModel: createModel,
			getSystemPrompt: () => "Co-math system prompt",
			streamFn,
			streamAssistantMessage: async (stream) => {
				for await (const event of stream) {
					observedEvents.push(event.type);
				}
				return stream.result();
			},
			streamOptions: () => ({ sessionId: "session-123" }),
			timeoutMs: 3210,
		});

		const result = await executor.run(createRequest("Try examples."));

		expect(result.text).toBe(finalText);
		expect(observedSystemPrompt).toBe("Co-math system prompt");
		expect(observedPrompt).toContain("Try examples.");
		expect(observedSessionId).toBe("session-123");
		expect(observedTimeoutMs).toBe(3210);
		expect(observedEvents).toEqual(["start", "text_start", "text_delta", "text_end", "done"]);
	});
});
