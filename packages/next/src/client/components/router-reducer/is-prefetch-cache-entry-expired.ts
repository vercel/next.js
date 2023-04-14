import { PrefetchCacheEntry } from './router-reducer-types'

const FIVE_MINUTES = 5 * 60 * 1000
const THIRTY_SECONDS = 30 * 1000

export function isPrefetchCacheEntryExpired(
  cacheEntry: PrefetchCacheEntry
): boolean {
  return cacheEntry?.kind === 'hard'
    ? // check if the prefetchTime was less than 5 mins ago
      Date.now() < cacheEntry.prefetchTime + FIVE_MINUTES && // check if the lastUsedTime was less than 30s ago or if it was never used
        (!cacheEntry.lastUsedTime ||
          Date.now() < cacheEntry.lastUsedTime + THIRTY_SECONDS)
    : // check if the lastUsedTime was less than 30s ago or if it was never used
      !cacheEntry.lastUsedTime ||
        Date.now() < cacheEntry.lastUsedTime + THIRTY_SECONDS
}
