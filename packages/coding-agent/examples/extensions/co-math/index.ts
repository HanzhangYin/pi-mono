import type { TextContent } from "@earendil-works/pi-ai";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { ExtensionAPI } from "../../../src/core/extensions/types.ts";
import { type RegisterCoMathCommandOptions, registerCoMathCommand } from "./commands.ts";
import { registerCoMathStateTool } from "./state-tool.ts";

export interface CoMathExtensionOptions extends RegisterCoMathCommandOptions {}

export default function coMathExtension(pi: ExtensionAPI, options: CoMathExtensionOptions = {}): void {
	registerCoMathCommand(pi, options);
	registerCoMathStateTool(pi);
	registerCoMathProductMessageRenderer(pi);
}

/**
 * Product-mode harness notices render as plain Pi output without the
 * bracketed extension label. Command/background messages from direct
 * /comath usage fall through to the default [co-math] rendering.
 */
function registerCoMathProductMessageRenderer(pi: ExtensionAPI): void {
	pi.registerMessageRenderer("co-math", (message, _options, theme) => {
		const details = message.details as { kind?: string; type?: string } | undefined;
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
	});
}
