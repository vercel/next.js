/**
 * Signature shared by the concurrency-limited task runners in this module.
 * Callers can switch between implementations without changing the call site.
 *
 * Shared contract: results are returned in the same order as the input items.
 * After the first rejection is observed, no new tasks are started. Tasks that
 * are already running are not cancelled; the returned promise waits for them
 * to settle and then rejects with the first error.
 */
export type RunWithConcurrencyFn = <T, R>(
  items: readonly T[],
  maxConcurrency: number,
  fn: (item: T) => Promise<R>
) => Promise<R[]>

function assertValidMaxConcurrency(maxConcurrency: number): void {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new RangeError('maxConcurrency must be a positive integer')
  }
}

/**
 * Maps over `items` with rolling concurrency: the next item starts as soon as
 * one of the `maxConcurrency` workers becomes available.
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  maxConcurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  assertValidMaxConcurrency(maxConcurrency)

  if (items.length === 0) {
    return []
  }

  // Workers finish out of order and write to `results[index]` directly, so
  // create the array at its final length instead of pushing. On the success
  // path every slot is overwritten with a real result, which is what makes
  // the `as R[]` cast at the end safe.
  const results: Array<R | undefined> = new Array(items.length).fill(undefined)

  let nextIndex = 0
  let stopped = false
  let firstError: unknown

  async function runWorker(): Promise<void> {
    while (!stopped) {
      const index = nextIndex
      if (index >= items.length) {
        return
      }
      nextIndex = index + 1

      try {
        results[index] = await fn(items[index])
      } catch (error) {
        // Other workers can finish their current task, but must not start new
        // work after an unexpected failure.
        if (!stopped) {
          stopped = true
          firstError = error
        }
        return
      }
    }
  }

  const workerCount = Math.min(maxConcurrency, items.length)
  const workers: Promise<void>[] = []
  for (let i = 0; i < workerCount; i++) {
    workers.push(runWorker())
  }

  // Workers never reject; they record the first error and stop instead, so
  // this waits for all in-flight tasks to settle.
  await Promise.all(workers)

  if (stopped) {
    throw firstError
  }

  return results as R[]
}

/**
 * Maps over `items` in fixed batches of `maxConcurrency` tasks: the next
 * batch does not start until every task in the current batch has settled.
 */
export async function runInBatches<T, R>(
  items: readonly T[],
  maxConcurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  assertValidMaxConcurrency(maxConcurrency)

  const results: R[] = []

  for (let i = 0; i < items.length; i += maxConcurrency) {
    const batch = items.slice(i, i + maxConcurrency)
    const settled = await Promise.allSettled(batch.map((item) => fn(item)))

    for (const outcome of settled) {
      if (outcome.status === 'rejected') {
        throw outcome.reason
      }
      results.push(outcome.value)
    }
  }

  return results
}
