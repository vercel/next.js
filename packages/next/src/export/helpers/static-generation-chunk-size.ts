/**
 * Pages per chunk for the adaptive scheduler. Workers report how many pages
 * they can take with every step, and the scheduler never sends more than
 * that, so the chunk size only bounds a single hand-off. Aim for about eight
 * chunks per worker so the tail rebalances, between 5 and 25 pages.
 */
export function getStaticGenerationChunkSize(
  pageCount: number,
  numWorkers: number,
  configured: number | undefined
): number {
  if (configured && configured > 0) return Math.floor(configured)
  const target = Math.ceil(pageCount / (Math.max(1, numWorkers) * 8))
  return Math.max(5, Math.min(25, target))
}
