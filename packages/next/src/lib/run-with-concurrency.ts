/**
 * Drain `items` through `worker` with an adaptive concurrency limit.  Reads
 * the current cap from `getConcurrency()` on every scheduling pass so the
 * caller can grow the limit as items complete.
 *
 * `worker` is expected to handle its own per-item errors; this drain loop
 * does not abort on a single rejection.  However, when `signal` is aborted
 * the scheduler stops queueing new work, waits for in-flight units to
 * finish, and rethrows `signal.reason`.
 */
export async function runWithConcurrency<T>(
  items: ReadonlyArray<T>,
  worker: (item: T) => Promise<void>,
  options: {
    getConcurrency: () => number
    signal?: AbortSignal
  }
): Promise<void> {
  const { getConcurrency, signal } = options
  const queue = [...items]
  const active = new Set<Promise<void>>()

  while (queue.length > 0 || active.size > 0) {
    if (signal?.aborted) {
      while (active.size > 0) await Promise.race(active)
      throw signal.reason
    }
    while (queue.length > 0 && active.size < getConcurrency()) {
      const item = queue.shift()!
      const p = worker(item)
        .catch(() => {
          // worker is contractually non-throwing; defensive catch only.
        })
        .finally(() => {
          active.delete(p)
        })
      active.add(p)
    }
    if (active.size > 0) {
      await Promise.race(active)
    }
  }
}
