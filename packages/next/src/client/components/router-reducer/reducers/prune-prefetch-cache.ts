import type { AppRouterState } from '../router-reducer-types'
import {
  PrefetchCacheEntryStatus,
  getPrefetchEntryCacheStatus,
} from '../get-prefetch-cache-entry-status'

export function prunePrefetchCache(
  prefetchCache: AppRouterState['prefetchCache']
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
