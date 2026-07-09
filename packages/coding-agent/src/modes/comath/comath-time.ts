/** Return a real completion time that is strictly later than the recorded start time. */
export function researchCompletionTimestamp(startedAt: string, currentTime = Date.now()): string {
	const startedTime = Date.parse(startedAt);
	const completedTime = Number.isFinite(startedTime) ? Math.max(currentTime, startedTime + 1) : currentTime;
	return new Date(completedTime).toISOString();
}
