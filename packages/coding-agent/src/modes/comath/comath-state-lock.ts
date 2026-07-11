/**
 * Minimal FIFO async mutex for durable co-math state commits.
 *
 * Research work (model calls, bounded computations) may overlap, but every load→mutate→persist
 * section that touches the durable project state must run alone: two concurrent read-modify-write
 * sections against the same state file would silently drop one side's records. Callers wrap only
 * the commit section in {@link CoMathStateLock.run} — never a model call or long computation — so
 * in sequential operation the lock is uncontended and behavior is unchanged.
 *
 * The lock is non-reentrant: a wrapped section that awaits another wrapped section deadlocks, so
 * commit sections must stay leaf-level (pure state transforms plus the save).
 */
export class CoMathStateLock {
	/** Settlement of the most recently queued section; never rejects. */
	private tail: Promise<void> = Promise.resolve();

	/**
	 * Queue `fn` behind every previously queued section and run it exclusively, in FIFO order.
	 * Returns `fn`'s result; a rejection propagates to this caller only and never poisons the
	 * chain, so later sections still run.
	 */
	run<T>(fn: () => Promise<T>): Promise<T> {
		const result = this.tail.then(() => fn());
		this.tail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}
}
