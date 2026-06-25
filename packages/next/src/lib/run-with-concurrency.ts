/**
 * Drain `items` through `worker` with an adaptive concurrency limit.
 *
 * Re-reads the cap from `getConcurrency()` on every scheduling pass so the
 * caller can grow the limit as items complete.
 *
 * Aborts the entire drain (waiting for in-flight units to settle, then
 * rethrowing) when:
 *   - `worker` rejects on any item, OR
 *   - the caller's `signal` aborts (the rejection uses `signal.reason`).
 *
 * If you want to tolerate per-item errors, have your `worker` catch them
 * internally.
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
  // Promises currently being awaited.  Each one removes itself from the set
  // in `.finally()` once it settles.
  const active = new Set<Promise<void>>()
  // First worker rejection seen, captured here so the outer loop can stop
  // scheduling new work and rethrow once the in-flight ones drain.
  let workerError: unknown

  // Hoisted out of the inner loop to keep ESLint's `no-loop-func` happy: the
  // closure captures `workerError`, which is mutable.
  const recordError = (err: unknown) => {
    if (workerError === undefined) workerError = err
  }

  // Outer loop: keeps going until both the queue is empty *and* nothing is
  // in flight.  Each iteration either tops up the active set (inner loop
  // below) or waits for at least one in-flight unit to settle.
  while (queue.length > 0 || active.size > 0) {
    // Stop scheduling on abort or worker error.  Drain the in-flight set
    // so side effects (e.g. cache writes) settle, then rethrow.  Each
    // promise in `active` already swallows its own rejection via
    // `.catch(recordError)`, so `allSettled` never rejects itself.
    if (signal?.aborted || workerError !== undefined) {
      await Promise.allSettled(active)
      if (workerError !== undefined) throw workerError
      throw signal!.reason
    }

    // Inner loop: top up the active set until either we hit the current
    // concurrency cap or run out of queued items.
    while (queue.length > 0 && active.size < getConcurrency()) {
      const item = queue.shift()!
      const p: Promise<void> = worker(item)
        .catch(recordError)
        .finally(() => {
          active.delete(p)
        })
      active.add(p)
    }

    // Wait for at least one unit to settle before re-checking the queue.
    // Without this `await`, the outer loop would spin synchronously when
    // the queue is full but more items are queued.
    if (active.size > 0) {
      await Promise.race(active)
    }
  }
}
