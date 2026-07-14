import type { Api, Model } from "@earendil-works/pi-ai";
import type { CoMathModelSettings } from "../../core/settings-manager.ts";
import type { ResearchWorkstreamModelRequest } from "./comath-task-model.ts";

export interface CoMathModelCatalog {
	find(provider: string, modelId: string): Model<Api> | undefined;
	hasConfiguredAuth(model: Model<Api>): boolean;
}

export interface CoMathModelRouter {
	getModelForRequest(request: ResearchWorkstreamModelRequest): Model<Api> | undefined;
	warnings: string[];
	assignments: Readonly<Partial<Record<keyof CoMathModelSettings, Model<Api>>>>;
}

export const DEFAULT_CO_MATH_MODELS: Required<CoMathModelSettings> = {
	coordination: "openai-codex/gpt-5.6-sol",
	research: "openai-codex/gpt-5.6-terra",
	computation: "openai-codex/gpt-5.6-terra",
};

const ASSIGNMENT_KEYS = [
	"coordination",
	"research",
	"computation",
] as const satisfies readonly (keyof CoMathModelSettings)[];
const LEGACY_ASSIGNMENT_KEYS = new Set([
	"director",
	"specialist",
	"literature",
	"critic",
	"skeptic",
	"synthesizer",
	"coordinator",
	"revision",
]);

const ALLOWED_REFERENCES: Readonly<Record<keyof CoMathModelSettings, string>> = {
	coordination: DEFAULT_CO_MATH_MODELS.coordination,
	research: DEFAULT_CO_MATH_MODELS.research,
	computation: DEFAULT_CO_MATH_MODELS.computation,
};

/**
 * Resolve all configured role models once at harness startup. Capturing concrete model objects
 * keeps a long-running task on the same assignment even if the foreground session model changes.
 */
export function createCoMathModelRouter(input: {
	catalog: CoMathModelCatalog;
	settings?: CoMathModelSettings;
}): CoMathModelRouter {
	const configured = { ...(input.settings ?? {}) };
	const assignments: Partial<Record<keyof CoMathModelSettings, Model<Api>>> = {};
	const warnings: string[] = [];
	for (const key of Object.keys(configured)) {
		if (LEGACY_ASSIGNMENT_KEYS.has(key)) {
			warnings.push(`Ignoring legacy co-math model setting ${key}; use coordination, research, or computation.`);
		} else if (!ASSIGNMENT_KEYS.includes(key as keyof CoMathModelSettings)) {
			warnings.push(
				`Ignoring unsupported co-math model setting ${key}; use coordination, research, or computation.`,
			);
		}
	}
	for (const key of ASSIGNMENT_KEYS) {
		const reference = configured[key]?.trim() || DEFAULT_CO_MATH_MODELS[key];
		if (reference !== ALLOWED_REFERENCES[key]) {
			warnings.push(
				`Unavailable co-math ${key} assignment: ${reference}. Co-math only permits ${ALLOWED_REFERENCES[key]}; affected stages will be blocked.`,
			);
			continue;
		}
		const parsed = parseModelReference(reference);
		if (!parsed) {
			warnings.push(`Invalid co-math ${key} assignment: ${reference}. Affected stages will be blocked.`);
			continue;
		}
		const model = input.catalog.find(parsed.provider, parsed.modelId);
		if (!model || !input.catalog.hasConfiguredAuth(model)) {
			warnings.push(`Unavailable co-math ${key} assignment: ${reference}. Affected stages will be blocked.`);
			continue;
		}
		assignments[key] = model;
	}

	return {
		assignments,
		warnings,
		getModelForRequest(request) {
			return assignments[assignmentKeyForRequest(request)];
		},
	};
}

function assignmentKeyForRequest(request: ResearchWorkstreamModelRequest): keyof CoMathModelSettings {
	if (
		request.purpose === "director" ||
		request.purpose === "skeptic" ||
		request.purpose === "coordinator" ||
		request.purpose === "revision" ||
		request.role === "critic"
	) {
		return "coordination";
	}
	if (request.purpose === "computation") return "computation";
	return "research";
}

function parseModelReference(reference: string): { provider: string; modelId: string } | undefined {
	const slash = reference.indexOf("/");
	if (slash < 0) return undefined;
	const provider = reference.slice(0, slash).trim();
	const modelId = reference.slice(slash + 1).trim();
	return provider && modelId ? { provider, modelId } : undefined;
}
