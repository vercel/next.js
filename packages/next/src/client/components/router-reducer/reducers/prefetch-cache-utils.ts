import { createHrefFromUrl } from '../create-href-from-url'
import { fetchServerResponse } from '../fetch-server-response'
import type {
  PrefetchCacheEntry,
  PrefetchKind,
  ReadonlyReducerState,
} from '../router-reducer-types'
import { prefetchQueue } from './prefetch-reducer'

/**
 * Creates a cache key for the router prefetch cache
 *
 * @param url - The URL being navigated to
 * @param nextUrl - an internal URL, primarily used for handling rewrites. Defaults to '/'.
 * @return The generated prefetch cache key.
 */
export function createPrefetchCacheKey(url: URL, nextUrl?: string | null) {
  const pathnameFromUrl = createHrefFromUrl(
    url,
    // Ensures the hash is not part of the cache key as it does not impact the server fetch
    false
  )

  // delimit the prefix so we don't conflict with other pages

  // Route interception depends on `nextUrl` values which aren't a 1:1 mapping to a URL
  // The cache key that we store needs to use `nextUrl` to properly distinguish cache entries
  if (nextUrl) {
    return `${nextUrl}%${pathnameFromUrl}`
  }

  return pathnameFromUrl
}

export function getPrefetchCacheEntry(
  url: URL,
  state: ReadonlyReducerState
): PrefetchCacheEntry | undefined {
  // We first check if there's a more specific interception route prefetch entry
  // This is because when we detect a prefetch that corresponds with an interception route, we prefix it with nextUrl (see `createPrefetchCacheKey`)
  // to avoid conflicts with other pages that may have the same URL but render different things depending on the `Next-URL` header.
  const interceptionCacheKey = createPrefetchCacheKey(url, state.nextUrl)
  const interceptionData = state.prefetchCache.get(interceptionCacheKey)

  if (interceptionData) {
    return interceptionData
  }

  // If we dont find a more specific interception route prefetch entry, we check for a regular prefetch entry
  const prefetchCacheKey = createPrefetchCacheKey(url)
  return state.prefetchCache.get(prefetchCacheKey)
}

export function createPrefetchCacheEntry({
  state,
  url,
  kind,
  prefetchCacheKey,
}: {
  state: ReadonlyReducerState
  url: URL
  kind: PrefetchKind
  prefetchCacheKey: string
}): PrefetchCacheEntry {
  // initiates the fetch request for the prefetch and attaches a listener
  // to the promise to update the prefetch cache entry when the promise resolves (if necessary)
  const getPrefetchData = () =>
    fetchServerResponse(
      url,
      state.tree,
      state.nextUrl,
      state.buildId,
      kind
    ).then((prefetchResponse) => {
      /* [flightData, canonicalUrlOverride, postpone, intercept] */
      const [, , , intercept] = prefetchResponse
      const existingPrefetchEntry = state.prefetchCache.get(prefetchCacheKey)
      // If we discover that the prefetch corresponds with an interception route, we want to move it to
      // a prefixed cache key to avoid clobbering an existing entry.
      if (intercept && existingPrefetchEntry) {
        const prefixedCacheKey = createPrefetchCacheKey(url, state.nextUrl)
        state.prefetchCache.set(prefixedCacheKey, existingPrefetchEntry)
        state.prefetchCache.delete(prefetchCacheKey)
      }

      return prefetchResponse
    })

  const data = prefetchQueue.enqueue(getPrefetchData)

  return {
    treeAtTimeOfPrefetch: state.tree,
    data,
    kind,
    prefetchTime: Date.now(),
    lastUsedTime: null,
    key: prefetchCacheKey,
  }
}

export function prunePrefetchCache(
  prefetchCache: ReadonlyReducerState['prefetchCache']
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

export enum PrefetchCacheEntryStatus {
  fresh = 'fresh',
  reusable = 'reusable',
  expired = 'expired',
  stale = 'stale',
}

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
