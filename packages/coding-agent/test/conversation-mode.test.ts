import { describe, expect, it } from "vitest";
import { getConversationModeCommand, routeConversationModePrompt } from "../src/core/conversation-mode.ts";

describe("conversation mode routing", () => {
	it("routes ordinary co-math prompts through the /co command", () => {
		expect(routeConversationModePrompt("show me the latest report", "comath")).toBe("/co show me the latest report");
		expect(routeConversationModePrompt("/comath status", "comath")).toBe("/comath status");
		expect(routeConversationModePrompt("show me the latest report", undefined)).toBe("show me the latest report");
	});

	it("declares the required command for co-math conversation mode", () => {
		expect(getConversationModeCommand("comath")).toBe("co");
		expect(getConversationModeCommand(undefined)).toBeUndefined();
	});
});
