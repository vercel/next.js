/**
 * Maps over `items` while limiting the number of concurrently running tasks.
 * Results are returned in the same order as the input items.
 *
 * After the first rejection is observed, no new tasks are started. Tasks that
 * are already running are not cancelled; the returned promise waits for them
 * to settle and then rejects with the first error.
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  maxConcurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new RangeError('maxConcurrency must be a positive integer')
  }

  if (items.length === 0) {
    return []
  }

  // Fill the array up front so that out-of-order completions do not make it
  // sparse. Every entry is replaced before this function returns.
  const results: Array<R | undefined> = []
  for (let i = 0; i < items.length; i++) {
    results.push(undefined)
  }

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
