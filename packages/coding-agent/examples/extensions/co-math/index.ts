import type { ExtensionAPI } from "../../../src/core/extensions/types.ts";
import { type RegisterCoMathCommandOptions, registerCoMathCommand } from "./commands.ts";
import { registerCoMathStateTool } from "./state-tool.ts";

export interface CoMathExtensionOptions extends RegisterCoMathCommandOptions {}

export default function coMathExtension(pi: ExtensionAPI, options: CoMathExtensionOptions = {}): void {
	registerCoMathCommand(pi, options);
	registerCoMathStateTool(pi);
}
