export type ConversationMode = "comath";

export interface ConversationPromptHarness {
	handlePrompt(text: string): Promise<void>;
}

export function routeConversationModePrompt(text: string, mode: ConversationMode | undefined): string {
	if (mode === undefined || text.startsWith("/")) {
		return text;
	}
	return `/co ${text}`;
}

export function getConversationModeCommand(mode: ConversationMode | undefined): string | undefined {
	if (mode === "comath") {
		return "co";
	}
	return undefined;
}
