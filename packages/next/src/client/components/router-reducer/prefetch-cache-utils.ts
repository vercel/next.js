import {
  PrefetchCacheEntryStatus,
  type AppRouterState,
  type PrefetchCacheEntry,
} from './router-reducer-types'
import { addPathPrefix } from '../../../shared/lib/router/utils/add-path-prefix'
import { pathHasPrefix } from '../../../shared/lib/router/utils/path-has-prefix'
import { createHrefFromUrl } from './create-href-from-url'

/**
 * Creates a cache key for the router prefetch cache
 *
 * @param url - The URL being navigated to
 * @param nextUrl - an internal URL, primarily used for handling rewrites. Defaults to '/'.
 * @return The generated prefetch cache key.
 */
export function createPrefetchCacheKey(url: URL, nextUrl: string | null) {
  const pathnameFromUrl = createHrefFromUrl(
    url,
    // Ensures the hash is not part of the cache key as it does not impact the server fetch
    false
  )

  // delimit the prefix so we don't conflict with other pages
  const nextUrlPrefix = `${nextUrl}%`

  // Route interception depends on `nextUrl` values which aren't a 1:1 mapping to a URL
  // The cache key that we store needs to use `nextUrl` to properly distinguish cache entries
  if (nextUrl && !pathHasPrefix(pathnameFromUrl, nextUrl)) {
    return addPathPrefix(pathnameFromUrl, nextUrlPrefix)
  }

  return pathnameFromUrl
}

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

const FIVE_MINUTES = 5 * 60 * 1000
const THIRTY_SECONDS = 30 * 1000

export function getPrefetchEntryCacheStatus({
  kind,
  prefetchTime,
  lastUsedTime,
}: PrefetchCacheEntry): PrefetchCacheEntryStatus {
  // if the cache entry was prefetched or read less than 30s ago, then we want to re-use it
  if (Date.now() < (lastUsedTime ?? prefetchTime) + THIRTY_SECONDS) {
    return lastUsedTime
      ? PrefetchCacheEntryStatus.reusable
      : PrefetchCacheEntryStatus.fresh
  }

  // if the cache entry was prefetched less than 5 mins ago, then we want to re-use only the loading state
  if (kind === 'auto') {
    if (Date.now() < prefetchTime + FIVE_MINUTES) {
      return PrefetchCacheEntryStatus.stale
    }
  }

  // if the cache entry was prefetched less than 5 mins ago and was a "full" prefetch, then we want to re-use it "full
  if (kind === 'full') {
    if (Date.now() < prefetchTime + FIVE_MINUTES) {
      return PrefetchCacheEntryStatus.reusable
    }
  }

  return PrefetchCacheEntryStatus.expired
}
