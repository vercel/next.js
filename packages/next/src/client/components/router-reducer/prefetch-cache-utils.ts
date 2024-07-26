import { createHrefFromUrl } from './create-href-from-url'
import { fetchServerResponse } from './fetch-server-response'
import {
  PrefetchCacheEntryStatus,
  type PrefetchCacheEntry,
  PrefetchKind,
  type ReadonlyReducerState,
} from './router-reducer-types'
import { prefetchQueue } from './reducers/prefetch-reducer'
import type { FetchServerResponseResult } from '../../../server/app-render/types'

/**
 * Creates a cache key for the router prefetch cache
 *
 * @param url - The URL being navigated to
 * @param nextUrl - an internal URL, primarily used for handling rewrites. Defaults to '/'.
 * @return The generated prefetch cache key.
 */
function createPrefetchCacheKey(url: URL, nextUrl?: string | null) {
  const pathnameFromUrl = createHrefFromUrl(
    url,
    // Ensures the hash is not part of the cache key as it does not impact the server fetch
    false
  )

  // nextUrl is used as a cache key delimiter since entries can vary based on the Next-URL header
  if (nextUrl) {
    return `${nextUrl}%${pathnameFromUrl}`
  }

  return pathnameFromUrl
}

/**
 * Returns a prefetch cache entry if one exists. Otherwise creates a new one and enqueues a fetch request
 * to retrieve the prefetch data from the server.
 */
export function getOrCreatePrefetchCacheEntry({
  url,
  nextUrl,
  tree,
  buildId,
  prefetchCache,
  kind,
}: Pick<
  ReadonlyReducerState,
  'nextUrl' | 'prefetchCache' | 'tree' | 'buildId'
> & {
  url: URL
  kind?: PrefetchKind
}): PrefetchCacheEntry {
  let existingCacheEntry: PrefetchCacheEntry | undefined = undefined
  // We first check if there's a more specific interception route prefetch entry
  // This is because when we detect a prefetch that corresponds with an interception route, we prefix it with nextUrl (see `createPrefetchCacheKey`)
  // to avoid conflicts with other pages that may have the same URL but render different things depending on the `Next-URL` header.
  const interceptionCacheKey = createPrefetchCacheKey(url, nextUrl)
  const interceptionData = prefetchCache.get(interceptionCacheKey)

  if (interceptionData) {
    existingCacheEntry = interceptionData
  } else {
    // If we dont find a more specific interception route prefetch entry, we check for a regular prefetch entry
    const prefetchCacheKey = createPrefetchCacheKey(url)
    const prefetchData = prefetchCache.get(prefetchCacheKey)
    if (prefetchData) {
      existingCacheEntry = prefetchData
    }
  }

  if (existingCacheEntry) {
    // Grab the latest status of the cache entry and update it
    existingCacheEntry.status = getPrefetchEntryCacheStatus(existingCacheEntry)

    // when `kind` is provided, an explicit prefetch was requested.
    // if the requested prefetch is "full" and the current cache entry wasn't, we want to re-prefetch with the new intent
    const switchedToFullPrefetch =
      existingCacheEntry.kind !== PrefetchKind.FULL &&
      kind === PrefetchKind.FULL

    if (switchedToFullPrefetch) {
      return createLazyPrefetchEntry({
        tree,
        url,
        buildId,
        nextUrl,
        prefetchCache,
        // If we didn't get an explicit prefetch kind, we want to set a temporary kind
        // rather than assuming the same intent as the previous entry, to be consistent with how we
        // lazily create prefetch entries when intent is left unspecified.
        kind: kind ?? PrefetchKind.TEMPORARY,
      })
    }

    // If the existing cache entry was marked as temporary, it means it was lazily created when attempting to get an entry,
    // where we didn't have the prefetch intent. Now that we have the intent (in `kind`), we want to update the entry to the more accurate kind.
    if (kind && existingCacheEntry.kind === PrefetchKind.TEMPORARY) {
      existingCacheEntry.kind = kind
    }

    // We've determined that the existing entry we found is still valid, so we return it.
    return existingCacheEntry
  }

  // If we didn't return an entry, create a new one.
  return createLazyPrefetchEntry({
    tree,
    url,
    buildId,
    nextUrl,
    prefetchCache,
    kind: kind || PrefetchKind.TEMPORARY,
  })
}

/*
 * Used to take an existing cache entry and prefix it with the nextUrl, if it exists.
 * This ensures that we don't have conflicting cache entries for the same URL (as is the case with route interception).
 */
function prefixExistingPrefetchCacheEntry({
  url,
  nextUrl,
  prefetchCache,
}: Pick<ReadonlyReducerState, 'nextUrl' | 'prefetchCache'> & {
  url: URL
}) {
  const existingCacheKey = createPrefetchCacheKey(url)
  const existingCacheEntry = prefetchCache.get(existingCacheKey)
  if (!existingCacheEntry) {
    // no-op -- there wasn't an entry to move
    return
  }

  const newCacheKey = createPrefetchCacheKey(url, nextUrl)
  prefetchCache.set(newCacheKey, existingCacheEntry)
  prefetchCache.delete(existingCacheKey)

  return newCacheKey
}

/**
 * Use to seed the prefetch cache with data that has already been fetched.
 */
export function createPrefetchCacheEntryForInitialLoad({
  nextUrl,
  tree,
  prefetchCache,
  url,
  kind,
  data,
}: Pick<ReadonlyReducerState, 'nextUrl' | 'tree' | 'prefetchCache'> & {
  url: URL
  kind: PrefetchKind
  data: FetchServerResponseResult
}) {
  // if the prefetch corresponds with an interception route, we use the nextUrl to prefix the cache key
  const prefetchCacheKey = data.i
    ? createPrefetchCacheKey(url, nextUrl)
    : createPrefetchCacheKey(url)

  const prefetchEntry = {
    treeAtTimeOfPrefetch: tree,
    data: Promise.resolve(data),
    kind,
    prefetchTime: Date.now(),
    lastUsedTime: Date.now(),
    key: prefetchCacheKey,
    status: PrefetchCacheEntryStatus.fresh,
  }

  prefetchCache.set(prefetchCacheKey, prefetchEntry)

  return prefetchEntry
}

/**
 * Creates a prefetch entry entry and enqueues a fetch request to retrieve the data.
 */
function createLazyPrefetchEntry({
  url,
  kind,
  tree,
  nextUrl,
  buildId,
  prefetchCache,
}: Pick<
  ReadonlyReducerState,
  'nextUrl' | 'tree' | 'buildId' | 'prefetchCache'
> & {
  url: URL
  kind: PrefetchKind
}): PrefetchCacheEntry {
  const prefetchCacheKey = createPrefetchCacheKey(url)

  // initiates the fetch request for the prefetch and attaches a listener
  // to the promise to update the prefetch cache entry when the promise resolves (if necessary)
  const data = prefetchQueue.enqueue(() =>
    fetchServerResponse(url, {
      flightRouterState: tree,
      nextUrl,
      buildId,
      prefetchKind: kind,
    }).then((prefetchResponse) => {
      // TODO: `fetchServerResponse` should be more tighly coupled to these prefetch cache operations
      // to avoid drift between this cache key prefixing logic
      // (which is currently directly influenced by the server response)
      let newCacheKey

      if (prefetchResponse.i) {
        // Determine if we need to prefix the cache key with the nextUrl
        newCacheKey = prefixExistingPrefetchCacheEntry({
          url,
          nextUrl,
          prefetchCache,
        })
      }

      // If the prefetch was a cache hit, we want to update the existing cache entry to reflect that it was a full prefetch.
      // This is because we know that a static response will contain the full RSC payload, and can be updated to respect the `static`
      // staleTime.
      if (prefetchResponse.p) {
        const existingCacheEntry = prefetchCache.get(
          // if we prefixed the cache key due to route interception, we want to use the new key. Otherwise we use the original key
          newCacheKey ?? prefetchCacheKey
        )
        if (existingCacheEntry) {
          existingCacheEntry.kind = PrefetchKind.FULL
        }
      }

      return prefetchResponse
    })
  )

  const prefetchEntry = {
    treeAtTimeOfPrefetch: tree,
    data,
    kind,
    prefetchTime: Date.now(),
    lastUsedTime: null,
    key: prefetchCacheKey,
    status: PrefetchCacheEntryStatus.fresh,
  }

  prefetchCache.set(prefetchCacheKey, prefetchEntry)

  return prefetchEntry
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

// These values are set by `define-env-plugin` (based on `nextConfig.experimental.staleTimes`)
// and default to 5 minutes (static) / 0 seconds (dynamic)
const DYNAMIC_STALETIME_MS =
  Number(process.env.__NEXT_CLIENT_ROUTER_DYNAMIC_STALETIME) * 1000

const STATIC_STALETIME_MS =
  Number(process.env.__NEXT_CLIENT_ROUTER_STATIC_STALETIME) * 1000

function getPrefetchEntryCacheStatus({
  kind,
  prefetchTime,
  lastUsedTime,
}: PrefetchCacheEntry): PrefetchCacheEntryStatus {
  // We will re-use the cache entry data for up to the `dynamic` staletime window.
  if (Date.now() < (lastUsedTime ?? prefetchTime) + DYNAMIC_STALETIME_MS) {
    return lastUsedTime
      ? PrefetchCacheEntryStatus.reusable
      : PrefetchCacheEntryStatus.fresh
  }

  // For "auto" prefetching, we'll re-use only the loading boundary for up to `static` staletime window.
  // A stale entry will only re-use the `loading` boundary, not the full data.
  // This will trigger a "lazy fetch" for the full data.
  if (kind === 'auto') {
    if (Date.now() < prefetchTime + STATIC_STALETIME_MS) {
      return PrefetchCacheEntryStatus.stale
    }
  }

  // for "full" prefetching, we'll re-use the cache entry data for up to `static` staletime window.
  if (kind === 'full') {
    if (Date.now() < prefetchTime + STATIC_STALETIME_MS) {
      return PrefetchCacheEntryStatus.reusable
    }
  }

  return PrefetchCacheEntryStatus.expired
}
