import { afterEach, describe, expect, it } from "vitest";
import type { ConversationPromptHarness } from "../src/core/conversation-mode.ts";
import { createHarness, type Harness } from "./test-harness.ts";

describe("AgentSession conversation-harness prompts", () => {
	let harness: Harness | undefined;

	afterEach(() => {
		harness?.cleanup();
		harness = undefined;
	});

	function userMessageTexts(events: Harness["events"]): string[] {
		const texts: string[] = [];
		for (const event of events) {
			if ((event.type === "message_start" || event.type === "message_end") && "message" in event) {
				const message = event.message;
				if (message.role === "user") {
					const content = message.content;
					const text =
						typeof content === "string"
							? content
							: content
									.filter((part) => part.type === "text")
									.map((part) => (part as { text: string }).text)
									.join("");
					texts.push(`${event.type}:${text}`);
				}
			}
		}
		return texts;
	}

	it("records a user message, persists it, and does not call the LLM", async () => {
		harness = createHarness();
		const handled: string[] = [];
		let eventsWhenHandled = 0;
		const conversationHarness: ConversationPromptHarness = {
			handlePrompt: async (text) => {
				handled.push(text);
				// The user message must already be visible before the harness handles the prompt.
				eventsWhenHandled = harness?.events.length ?? 0;
			},
		};
		harness.session.setConversationHarness(conversationHarness);

		await harness.session.prompt("Validate First Proof Question 2.");

		// The conversation harness handled the prompt...
		expect(handled).toEqual(["Validate First Proof Question 2."]);
		// ...and the user message was emitted as a normal user message before that.
		expect(userMessageTexts(harness.events)).toEqual([
			"message_start:Validate First Proof Question 2.",
			"message_end:Validate First Proof Question 2.",
		]);
		expect(eventsWhenHandled).toBeGreaterThanOrEqual(1);
		// The message must never reach the LLM.
		expect(harness.faux.callCount).toBe(0);
		// It is part of agent state and persisted to the session log.
		const stateUserTexts = harness.session.messages
			.filter((message) => message.role === "user")
			.map((message) =>
				typeof message.content === "string"
					? message.content
					: message.content
							.filter((part) => part.type === "text")
							.map((part) => (part as { text: string }).text)
							.join(""),
			);
		expect(stateUserTexts).toEqual(["Validate First Proof Question 2."]);
		expect(harness.session.getUserMessagesForForking().map((entry) => entry.text)).toEqual([
			"Validate First Proof Question 2.",
		]);
	});

	it("orders custom conversation messages after the user message", async () => {
		harness = createHarness();
		const conversationHarness: ConversationPromptHarness = {
			handlePrompt: async () => {
				await harness?.session.sendCustomMessage({
					customType: "co-math",
					content: "Got it — I’ve added that to the validation context.",
					display: true,
					details: { kind: "product" },
				});
			},
		};
		harness.session.setConversationHarness(conversationHarness);

		await harness.session.prompt("here is a long pasted proof context for the validation run");

		const ordered = harness.events
			.filter((event) => event.type === "message_start" && "message" in event)
			.map((event) => {
				const message = (event as { message: { role: string } }).message;
				return message.role;
			});
		// User message first, then the co-math custom message.
		expect(ordered).toEqual(["user", "custom"]);
		expect(harness.faux.callCount).toBe(0);
	});

	it("does not route slash commands through the conversation harness", async () => {
		harness = createHarness();
		const handled: string[] = [];
		harness.session.setConversationHarness({
			handlePrompt: async (text) => {
				handled.push(text);
			},
		});

		// A slash command must bypass the conversation harness (preserving normal command behavior).
		// With no matching extension command it falls through to the normal prompt path and the LLM.
		await harness.session.prompt("/unknown-command-xyz");

		expect(handled).toEqual([]);
		expect(harness.faux.callCount).toBe(1);
	});
});
