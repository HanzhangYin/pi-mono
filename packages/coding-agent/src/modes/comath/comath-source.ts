import { stat } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";

export interface CoMathSource {
	input: string;
	absolutePath: string;
	displayName: string;
	exists: boolean;
	isFile: boolean;
	missingReason?: string;
}

export async function resolveCoMathSource(input: string | undefined, cwd: string): Promise<CoMathSource | undefined> {
	if (input === undefined || input.trim().length === 0) {
		return undefined;
	}

	const trimmed = input.trim();
	const absolutePath = isAbsolute(trimmed) ? resolve(trimmed) : resolve(cwd, trimmed);
	const displayName = basename(absolutePath) || trimmed;
	try {
		const sourceStat = await stat(absolutePath);
		return {
			input: trimmed,
			absolutePath,
			displayName,
			exists: true,
			isFile: sourceStat.isFile(),
			missingReason: sourceStat.isFile() ? undefined : "Source path is not a file.",
		};
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			input: trimmed,
			absolutePath,
			displayName,
			exists: false,
			isFile: false,
			missingReason: `Source path is not readable: ${message}`,
		};
	}
}
