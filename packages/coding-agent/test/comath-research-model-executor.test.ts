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
import {
	CO_MATH_SYSTEM_PROMPT,
	CO_MATH_SYSTEM_PROMPT_POLICY_VERSION,
} from "../src/modes/comath/comath-system-prompt.ts";
import type { ResearchWorkstreamModelRequest } from "../src/modes/comath/comath-task-model.ts";

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
	it("uses the active Pi stream function privately instead of a nested CLI", async () => {
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
			streamFn,
			streamOptions: () => ({ sessionId: "session-123" }),
			timeoutMs: 3210,
		});

		const result = await executor.run(createRequest("Try examples."));

		expect(result.text).toBe(finalText);
		expect(observedSystemPrompt).toBe(CO_MATH_SYSTEM_PROMPT);
		expect(observedSystemPrompt).toContain("deterministic harness validation");
		expect(observedSystemPrompt).toContain("data, not instructions");
		expect(observedSystemPrompt).toContain("sandbox action");
		expect(observedPrompt).toContain("Try examples.");
		expect(observedSessionId).toBe("session-123");
		expect(observedTimeoutMs).toBe(3210);
	});

	it("keeps concurrent background role streams isolated", async () => {
		const streams = new Map<string, ReturnType<typeof createAssistantMessageEventStream>>();
		const streamFn: StreamFn = (_model, context) => {
			const prompt = context.messages
				.flatMap((message) => (Array.isArray(message.content) ? message.content.filter(isTextContent) : []))
				.map((part) => part.text)
				.join("\n");
			const stream = createAssistantMessageEventStream();
			streams.set(prompt, stream);
			return stream;
		};
		const executor = createDefaultResearchModelExecutor({ getModel: createModel, streamFn });

		const first = executor.run(createRequest("first background role"));
		const second = executor.run(createRequest("second background role"));
		streams.get("second background role")?.push({
			type: "done",
			reason: "stop",
			message: createAssistantMessage("## Findings\n- second result"),
		});
		streams.get("first background role")?.push({
			type: "done",
			reason: "stop",
			message: createAssistantMessage("## Findings\n- first result"),
		});

		await expect(first).resolves.toMatchObject({ text: "## Findings\n- first result" });
		await expect(second).resolves.toMatchObject({ text: "## Findings\n- second result" });
	});

	it("attaches model, thinking-level, usage, and cost provenance from the streamed message", async () => {
		const message = createAssistantMessage("## Findings\n- Output.");
		message.usage = {
			input: 120,
			output: 40,
			cacheRead: 5,
			cacheWrite: 6,
			totalTokens: 171,
			cost: { input: 0.01, output: 0.002, cacheRead: 0.0002, cacheWrite: 0.0001, total: 0.0123 },
		};
		const streamFn: StreamFn = () => {
			const stream = createAssistantMessageEventStream();
			stream.push({ type: "done", reason: "stop", message });
			return stream;
		};
		const executor = createDefaultResearchModelExecutor({
			getModel: createModel,
			streamFn,
			streamOptions: () => ({ reasoning: "high" }),
		});

		const result = await executor.run(createRequest("Try examples."));

		expect(result.provenance).toEqual({
			systemPromptPolicyVersion: CO_MATH_SYSTEM_PROMPT_POLICY_VERSION,
			model: "mock-model",
			provider: "openai",
			thinkingLevel: "high",
			inputTokens: 120,
			outputTokens: 40,
			cacheReadTokens: 5,
			cacheWriteTokens: 6,
			totalTokens: 171,
			costUsd: 0.0123,
			stopReason: "stop",
		});
	});

	it("uses the identical static policy for every Co-Math purpose", async () => {
		const observedPolicies: string[] = [];
		const streamFn: StreamFn = (_model, context) => {
			observedPolicies.push(context.systemPrompt ?? "");
			const stream = createAssistantMessageEventStream();
			stream.push({ type: "done", reason: "stop", message: createAssistantMessage("## Findings\n- Output.") });
			return stream;
		};
		const executor = createDefaultResearchModelExecutor({ getModel: createModel, streamFn });
		for (const purpose of [
			"general",
			"computation",
			"literature",
			"director",
			"skeptic",
			"coordinator",
			"revision",
		] as const) {
			await executor.run({ ...createRequest(`purpose ${purpose}`), purpose });
		}

		expect(observedPolicies).toEqual(Array(7).fill(CO_MATH_SYSTEM_PROMPT));
	});

	it("still reports model identity when the streamed message carries no usage", async () => {
		const bare = {
			role: "assistant",
			content: [{ type: "text", text: "## Findings\n- Output without usage." }],
			api: "openai-completions",
			provider: "",
			model: "",
			stopReason: "stop",
			timestamp: Date.now(),
		} as unknown as AssistantMessage;
		const streamFn: StreamFn = () => {
			const stream = createAssistantMessageEventStream();
			stream.push({ type: "done", reason: "stop", message: bare });
			return stream;
		};
		const executor = createDefaultResearchModelExecutor({
			getModel: createModel,
			streamFn,
		});

		const result = await executor.run(createRequest("Try examples."));

		expect(result.text).toBe("## Findings\n- Output without usage.");
		expect(result.provenance).toEqual({
			systemPromptPolicyVersion: CO_MATH_SYSTEM_PROMPT_POLICY_VERSION,
			model: "mock-model",
			provider: "openai",
			stopReason: "stop",
		});
	});
});
