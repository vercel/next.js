/**
 * Pages per chunk for the adaptive scheduler. A worker renders one chunk at a
 * time with up to `maxConcurrency` pages in flight, so a chunk smaller than
 * `maxConcurrency` can't fill the worker. Aim for about four chunks per
 * worker so late chunks can rebalance, capped at three windows' worth of
 * pages so a slow chunk doesn't become the tail.
 */
export function getStaticGenerationChunkSize(
  pageCount: number,
  numWorkers: number,
  maxConcurrency: number,
  configured: number | undefined
): number {
  if (configured && configured > 0) return Math.floor(configured)
  const target = Math.ceil(pageCount / (Math.max(1, numWorkers) * 4))
  return Math.max(
    1,
    Math.max(maxConcurrency, Math.min(3 * maxConcurrency, target))
  )
}
