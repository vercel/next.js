/**
 * Maps `items` through `fn`, running at most `limit` calls at a time. A new
 * call starts as soon as any running call settles, so one slow item never
 * holds back the items queued behind it (unlike processing fixed groups of
 * `limit` items with `Promise.all`).
 *
 * Results are returned in the same order as `items`. Like `Promise.all`, the
 * returned promise rejects with the first error, and calls that are already
 * running keep running in the background.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  if (items.length === 0) return results

  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, items.length))
  let next = 0
  let failed = false

  const runWorker = async () => {
    while (!failed && next < items.length) {
      const index = next++
      try {
        results[index] = await fn(items[index], index)
      } catch (err) {
        failed = true
        throw err
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, runWorker))
  return results
}
