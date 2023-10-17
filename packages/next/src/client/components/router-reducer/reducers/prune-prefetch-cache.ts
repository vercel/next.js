import type { ReducerState } from '../router-reducer-types'
import {
  PrefetchCacheEntryStatus,
  getPrefetchEntryCacheStatus,
} from '../get-prefetch-cache-entry-status'

export function prunePrefetchCache(
  prefetchCache: ReducerState['prefetchCache']
) {
  for (const [href, prefetchCacheEntry] of prefetchCache) {
    if (
      getPrefetchEntryCacheStatus(prefetchCacheEntry) ===
      PrefetchCacheEntryStatus.expired
    ) {
      prefetchCache.delete(href)
    }
  }
}
