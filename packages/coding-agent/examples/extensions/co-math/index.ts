import type { ExtensionAPI } from "../../../src/core/extensions/types.ts";
import { renderCoMathProductMessage } from "../../../src/modes/comath/comath-product-message-renderer.ts";
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
	pi.registerMessageRenderer("co-math", renderCoMathProductMessage);
}
