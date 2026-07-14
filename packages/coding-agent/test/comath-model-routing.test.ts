import type { Api, Model } from "@earendil-works/pi-ai";
import { getModel } from "@earendil-works/pi-ai/compat";
import { describe, expect, it } from "vitest";
import { type CoMathModelSettings, SettingsManager } from "../src/core/settings-manager.ts";
import { type CoMathModelCatalog, createCoMathModelRouter } from "../src/modes/comath/comath-model-routing.ts";
import type { ResearchWorkstreamModelRequest } from "../src/modes/comath/comath-task-model.ts";
import type { ResearchPath } from "../src/modes/comath/schema.ts";

const NOW = "2026-07-11T00:00:00.000Z";
const PATH: ResearchPath = {
	id: "path-1",
	title: "Finite experiment",
	objective: "Run a bounded check.",
	status: "active",
	latestFindings: [],
	blockers: [],
	suggestedNextMove: "Run the experiment.",
	priority: 1,
	createdAt: NOW,
	updatedAt: NOW,
};

function requiredModel(found: Model<Api> | undefined, reference: string): Model<Api> {
	if (!found) throw new Error(`Missing test model ${reference}.`);
	return found;
}

const SOL = requiredModel(getModel("openai-codex", "gpt-5.6-sol"), "openai-codex/gpt-5.6-sol");
const TERRA = requiredModel(getModel("openai-codex", "gpt-5.6-terra"), "openai-codex/gpt-5.6-terra");
const LUNA = requiredModel(getModel("openai-codex", "gpt-5.6-luna"), "openai-codex/gpt-5.6-luna");
const SPARK = requiredModel(getModel("openai-codex", "gpt-5.3-codex-spark"), "openai-codex/gpt-5.3-codex-spark");

function catalog(...models: Model<Api>[]): CoMathModelCatalog {
	return {
		find: (provider, modelId) =>
			models.find((candidate) => candidate.provider === provider && candidate.id === modelId),
		hasConfiguredAuth: () => true,
	};
}

function request(
	role: ResearchWorkstreamModelRequest["role"],
	purpose: ResearchWorkstreamModelRequest["purpose"],
): ResearchWorkstreamModelRequest {
	return {
		role,
		purpose,
		rootQuestion: "Does the statement hold?",
		path: PATH,
		allPaths: [PATH],
		priorFindings: [],
		inputText: "",
		prompt: "Check the task.",
	};
}

describe("co-math model routing", () => {
	it("routes every configured co-math role to the requested Codex model", () => {
		const router = createCoMathModelRouter({
			catalog: catalog(SOL, TERRA, LUNA, SPARK),
			settings: {
				coordination: "openai-codex/gpt-5.6-sol",
				research: "openai-codex/gpt-5.6-terra",
				computation: "openai-codex/gpt-5.6-terra",
			},
		});

		expect(router.getModelForRequest(request("synthesizer", "director"))?.id).toBe("gpt-5.6-sol");
		expect(router.getModelForRequest(request("specialist", "coordinator"))?.id).toBe("gpt-5.6-sol");
		expect(router.getModelForRequest(request("specialist", "revision"))?.id).toBe("gpt-5.6-sol");
		expect(router.getModelForRequest(request("specialist", "general"))?.id).toBe("gpt-5.6-terra");
		expect(router.getModelForRequest(request("specialist", "computation"))?.id).toBe("gpt-5.6-terra");
		expect(router.getModelForRequest(request("specialist", "literature"))?.id).toBe("gpt-5.6-terra");
		expect(router.getModelForRequest(request("critic", "computation"))?.id).toBe("gpt-5.6-sol");
		expect(router.getModelForRequest(request("critic", "skeptic"))?.id).toBe("gpt-5.6-sol");
		expect(router.getModelForRequest(request("synthesizer", "general"))?.id).toBe("gpt-5.6-terra");
		expect(router.warnings).toEqual([]);
	});

	it("uses Sol and Terra defaults without a foreground model", () => {
		const router = createCoMathModelRouter({ catalog: catalog(SOL, TERRA) });

		expect(router.getModelForRequest(request("specialist", "director"))?.id).toBe("gpt-5.6-sol");
		expect(router.getModelForRequest(request("specialist", "general"))?.id).toBe("gpt-5.6-terra");
		expect(router.getModelForRequest(request("specialist", "computation"))?.id).toBe("gpt-5.6-terra");
	});

	it("blocks an unavailable capability instead of using the foreground session model", () => {
		const router = createCoMathModelRouter({
			catalog: catalog(SOL, TERRA),
			settings: {
				coordination: "openai-codex/gpt-5.6-sol",
				research: "openai-codex/gpt-5.6-terra",
				computation: "openai-codex/gpt-5.6-terra",
			},
		});

		const unavailable = createCoMathModelRouter({
			catalog: {
				...catalog(SOL, TERRA),
				hasConfiguredAuth: (model) => model.id !== TERRA.id,
			},
			settings: { computation: "openai-codex/gpt-5.6-terra" },
		});

		expect(router.getModelForRequest(request("specialist", "literature"))?.id).toBe("gpt-5.6-terra");
		expect(unavailable.getModelForRequest(request("specialist", "computation"))).toBeUndefined();
		expect(unavailable.warnings).toContain(
			"Unavailable co-math computation assignment: openai-codex/gpt-5.6-terra. Affected stages will be blocked.",
		);
	});

	it("ignores legacy role settings and never selects Luna or Spark", () => {
		const settings = {
			director: "openai-codex/gpt-5.6-luna",
			literature: "openai-codex/gpt-5.6-luna",
			computation: "openai-codex/gpt-5.3-codex-spark",
		} as unknown as CoMathModelSettings;
		const router = createCoMathModelRouter({ catalog: catalog(SOL, TERRA, LUNA, SPARK), settings });

		expect(router.getModelForRequest(request("specialist", "general"))?.id).toBe("gpt-5.6-terra");
		expect(router.getModelForRequest(request("specialist", "computation"))).toBeUndefined();
		expect(router.warnings).toContain(
			"Ignoring legacy co-math model setting director; use coordination, research, or computation.",
		);
		expect(router.warnings).toContain(
			"Ignoring legacy co-math model setting literature; use coordination, research, or computation.",
		);
		expect(router.warnings).toContain(
			"Unavailable co-math computation assignment: openai-codex/gpt-5.3-codex-spark. Co-math only permits openai-codex/gpt-5.6-terra; affected stages will be blocked.",
		);
	});

	it("reads role assignments from merged settings", () => {
		const settings = SettingsManager.inMemory({
			coMath: { models: { computation: "openai-codex/gpt-5.6-terra" } },
		});
		expect(settings.getCoMathModels()).toEqual({ computation: "openai-codex/gpt-5.6-terra" });
	});
});
