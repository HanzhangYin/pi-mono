import type { ResearchModelCallProvenance, ResearchPath } from "./schema.ts";

export type ResearchWorkstreamModelRole = "specialist" | "critic" | "synthesizer";
export type ResearchWorkstreamModelPurpose =
	| "general"
	| "computation"
	| "literature"
	| "director"
	| "skeptic"
	| "coordinator"
	| "revision";

export interface ResearchWorkstreamModelRequest {
	role: ResearchWorkstreamModelRole;
	purpose?: ResearchWorkstreamModelPurpose;
	rootQuestion: string;
	path: ResearchPath;
	allPaths: readonly ResearchPath[];
	priorFindings: readonly string[];
	inputText: string;
	prompt: string;
}

export interface ResearchWorkstreamModelResponse {
	text: string;
	provenance?: ResearchModelCallProvenance;
}

export interface ResearchWorkstreamModelExecutor {
	run(request: ResearchWorkstreamModelRequest): Promise<ResearchWorkstreamModelResponse>;
}

export type { ResearchModelCallProvenance } from "./schema.ts";
