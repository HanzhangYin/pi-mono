import type { TextContent } from "@earendil-works/pi-ai";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { MessageRenderer } from "../../core/extensions/types.ts";

interface CoMathProductMessageDetails {
	kind?: string;
	type?: string;
}

function isCoMathProductMessageDetails(value: unknown): value is CoMathProductMessageDetails {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	return "kind" in value;
}

export const renderCoMathProductMessage: MessageRenderer = (message, _options, theme) => {
	const details = isCoMathProductMessageDetails(message.details) ? message.details : undefined;
	if (details?.kind !== "product") {
		return undefined;
	}
	const text =
		typeof message.content === "string"
			? message.content
			: message.content
					.filter((part): part is TextContent => part.type === "text")
					.map((part) => part.text)
					.join("\n");
	const color = details.type === "error" ? "error" : details.type === "warning" ? "warning" : undefined;
	const container = new Container();
	container.addChild(new Spacer(1));
	container.addChild(new Text(color ? theme.fg(color, text) : text, 0, 0));
	return container;
};
