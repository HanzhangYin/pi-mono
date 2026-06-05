import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { ExtensionAPI } from "../../../src/core/extensions/types.ts";
import type { CoMathProjectState } from "./schema.ts";
import { createEmptyProjectState, getDefaultStatePath, loadProjectState, saveProjectState } from "./storage.ts";

const CoMathStateParams = Type.Object({
	action: StringEnum(["status", "init"] as const),
	rootQuestion: Type.Optional(Type.String({ description: "Root question to initialize a project with." })),
	title: Type.Optional(Type.String({ description: "Optional project title for init." })),
});

interface CoMathStateDetails {
	action: "status" | "init";
	statePath: string;
	state?: CoMathProjectState;
	error?: string;
}

export function registerCoMathStateTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "comath_state",
		label: "Co-math State",
		description: "Read or initialize the persistent co-math project state.",
		promptSnippet:
			"Read or initialize the persistent co-math project state before making claims about project goals, workstreams, claims, evidence, or warnings.",
		parameters: CoMathStateParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const statePath = getDefaultStatePath(ctx.cwd);

			if (params.action === "init") {
				return initializeState(statePath, params.rootQuestion, params.title);
			}

			return readState(statePath);
		},
	});
}

async function initializeState(statePath: string, rootQuestion: string | undefined, title: string | undefined) {
	if (!rootQuestion || rootQuestion.trim().length === 0) {
		return {
			content: [{ type: "text" as const, text: "Error: rootQuestion is required for comath_state init." }],
			details: {
				action: "init",
				statePath,
				error: "rootQuestion required",
			} satisfies CoMathStateDetails,
		};
	}

	const now = new Date().toISOString();
	const state = createEmptyProjectState({
		projectId: `co-math-${Date.now()}`,
		title: title?.trim() || rootQuestion.trim(),
		rootQuestion: rootQuestion.trim(),
		now,
	});
	await saveProjectState(statePath, state);
	return {
		content: [{ type: "text" as const, text: `Initialized co-math project state at ${statePath}` }],
		details: {
			action: "init",
			statePath,
			state,
		} satisfies CoMathStateDetails,
	};
}

async function readState(statePath: string) {
	const state = await loadProjectState(statePath);
	if (!state) {
		return {
			content: [{ type: "text" as const, text: `No co-math project state found at ${statePath}.` }],
			details: {
				action: "status",
				statePath,
				error: "missing state",
			} satisfies CoMathStateDetails,
		};
	}

	return {
		content: [{ type: "text" as const, text: formatStateStatus(state) }],
		details: {
			action: "status",
			statePath,
			state,
		} satisfies CoMathStateDetails,
	};
}

function formatStateStatus(state: CoMathProjectState): string {
	const openWarnings = state.warnings.filter((warning) => warning.status === "open").length;
	return [
		`Co-math project: ${state.title}`,
		`Root question: ${state.rootQuestion}`,
		`Goals: ${state.approvedGoals.length}`,
		`Workstreams: ${state.workstreams.length}`,
		`Claims: ${state.claims.length}`,
		`Open warnings: ${openWarnings}`,
	].join("\n");
}
