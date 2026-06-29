/**
 * Drain work through `worker` with an adaptive concurrency limit.
 *
 * Pulls items from `getNextItem()` until it returns `undefined`, which
 * signals "no more items right now" — at that point the function waits
 * for the in-flight set to drain and returns.  The caller can then call
 * `runWithConcurrency` again (e.g. after persisting state) to resume
 * with whatever items `getNextItem()` is now willing to hand out.
 *
 * `getNextItem()` is invoked synchronously every time a worker slot
 * opens up, so it doubles as both the queue source and the "is there
 * more work right now?" gate.
 *
 * Re-reads the cap from `getConcurrency()` on every scheduling pass so
 * the caller can grow the limit as items complete.
 *
 * Aborts the entire drain (waiting for in-flight units to settle, then
 * rethrowing) when:
 *   - `worker` rejects on any item, OR
 *   - the caller's `signal` aborts (the rejection uses `signal.reason`).
 *
 * If you want to tolerate per-item errors, have your `worker` catch
 * them internally.
 */
export async function runWithConcurrency<T>(
  getNextItem: () => T | undefined,
  worker: (item: T) => Promise<void>,
  options: {
    getConcurrency: () => number
    signal?: AbortSignal
  }
): Promise<void> {
  const { getConcurrency, signal } = options
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

  // We pull the next item lazily — once `getNextItem()` returns `undefined`
  // we stop trying for the rest of this call.  Tracked separately from
  // `active.size` so a momentarily-empty inflight set doesn't fool us into
  // asking again after the caller already signalled "done for now".
  let exhausted = false

  while (!exhausted || active.size > 0) {
    // Stop scheduling on abort or worker error.  Drain the in-flight set
    // so side effects (e.g. cache writes) settle, then rethrow.  Each
    // promise in `active` already swallows its own rejection via
    // `.catch(recordError)`, so `allSettled` never rejects itself.
    if (signal?.aborted || workerError !== undefined) {
      await Promise.allSettled(active)
      if (workerError !== undefined) throw workerError
      throw signal!.reason
    }

    // Top up the active set until we either hit the current concurrency
    // cap or `getNextItem()` tells us the queue is dry for now.
    while (!exhausted && active.size < getConcurrency()) {
      const item = getNextItem()
      if (item === undefined) {
        exhausted = true
        break
      }
      const p: Promise<void> = worker(item)
        .catch(recordError)
        .finally(() => {
          active.delete(p)
        })
      active.add(p)
    }

    // Wait for at least one in-flight unit to settle before checking again.
    // Without this `await`, a fully-saturated active set would spin
    // synchronously.
    if (active.size > 0) {
      await Promise.race(active)
    }
  }
}
