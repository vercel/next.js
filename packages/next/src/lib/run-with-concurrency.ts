/**
 * Maps over `items` while limiting the number of concurrently running tasks.
 * Results are returned in the same order as the input items.
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
        stopped = true
        throw error
      }
    }
  }

  const workerCount = Math.min(maxConcurrency, items.length)
  const workers: Promise<void>[] = []
  for (let i = 0; i < workerCount; i++) {
    workers.push(runWorker())
  }

  await Promise.all(workers)
  return results as R[]
}
