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
function createPrefetchCacheKey(
  url: URL,
  prefetchKind: PrefetchKind | undefined,
  nextUrl?: string | null
) {
  // Initially we only use the pathname as the cache key. We don't want to include
  // search params so that multiple URLs with the same search parameter can re-use
  // loading states.
  let pathnameFromUrl = url.pathname

  // RSC responses can differ based on search params, specifically in the case where we aren't
  // returning a partial response (ie with `PrefetchKind.AUTO`).
  // In the auto case, since loading.js & layout.js won't have access to search params,
  // we can safely re-use that cache entry. But for full prefetches, we should not
  // re-use the cache entry as the response may differ.
  // TODO: Investigate how this should work with PPR. For now, PPR always keys on the full URL.
  if (prefetchKind === PrefetchKind.FULL || process.env.__NEXT_PPR) {
    // if we have a full prefetch, we can include the search param in the key,
    // as we'll be getting back a full response. The server might have read the search
    // params when generating the full response.
    pathnameFromUrl += url.search
  }

  // nextUrl is used as a cache key delimiter since entries can vary based on the Next-URL header
  if (nextUrl) {
    return `${nextUrl}%${pathnameFromUrl}`
  }

  return pathnameFromUrl
}

function getExistingCacheEntry(
  url: URL,
  kind: PrefetchKind | undefined,
  nextUrl: string | null,
  prefetchCache: Map<string, PrefetchCacheEntry>
): PrefetchCacheEntry | undefined {
  const interceptionCacheKey = createPrefetchCacheKey(url, kind, nextUrl)
  const cacheKeyWithParams = createPrefetchCacheKey(url, PrefetchKind.FULL)
  const cacheKey = createPrefetchCacheKey(url, kind)

  // We first check if there's a more specific interception route prefetch entry
  // This is because when we detect a prefetch that corresponds with an interception route, we prefix it with nextUrl (see `createPrefetchCacheKey`)
  // to avoid conflicts with other pages that may have the same URL but render different things depending on the `Next-URL` header.
  if (prefetchCache.has(interceptionCacheKey)) {
    return prefetchCache.get(interceptionCacheKey)
  }

  // Check for full data cache entry if search params are present.
  if (url.search && prefetchCache.has(cacheKeyWithParams)) {
    return prefetchCache.get(cacheKeyWithParams)
  }

  // Check for prefetch data associated with the requested kind
  const prefetchData = prefetchCache.get(cacheKey)
  if (prefetchData) {
    // if there are no search params, we can return whatever was in the prefetch
    // if there were search params, we should ensure that the prefetch we're using was "auto",
    // because that will contain the shareable loading data (and not the full RSC data)
    if (!url.search || prefetchData.kind === PrefetchKind.AUTO) {
      return prefetchData
    }
  }

  // Nothing was found, return undefined, which will trigger a new prefetch request
  return undefined
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
  const existingCacheEntry = getExistingCacheEntry(
    url,
    kind,
    nextUrl,
    prefetchCache
  )

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
  const existingCacheKey = createPrefetchCacheKey(url, undefined)
  const existingCacheEntry = prefetchCache.get(existingCacheKey)
  if (!existingCacheEntry) {
    // no-op -- there wasn't an entry to move
    return
  }

  const newCacheKey = createPrefetchCacheKey(
    url,
    existingCacheEntry.kind,
    nextUrl
  )
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
  data,
}: Pick<ReadonlyReducerState, 'nextUrl' | 'tree' | 'prefetchCache'> & {
  url: URL
  data: FetchServerResponseResult
}) {
  // The initial cache entry technically includes full data, but it isn't explicitly prefetched -- we just seed the
  // prefetch cache so that we can skip an extra prefetch request later, since we already have the data.
  const kind = PrefetchKind.AUTO
  // if the prefetch corresponds with an interception route, we use the nextUrl to prefix the cache key
  const prefetchCacheKey = data.i
    ? createPrefetchCacheKey(url, kind, nextUrl)
    : createPrefetchCacheKey(url, kind)

  const prefetchEntry = {
    treeAtTimeOfPrefetch: tree,
    data: Promise.resolve(data),
    kind,
    prefetchTime: Date.now(),
    lastUsedTime: Date.now(),
    key: prefetchCacheKey,
    status: PrefetchCacheEntryStatus.fresh,
  } satisfies PrefetchCacheEntry

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
  const prefetchCacheKey = createPrefetchCacheKey(url, kind)

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
  if (kind === PrefetchKind.AUTO) {
    if (Date.now() < prefetchTime + STATIC_STALETIME_MS) {
      return PrefetchCacheEntryStatus.stale
    }
  }

  // for "full" prefetching, we'll re-use the cache entry data for up to `static` staletime window.
  if (kind === PrefetchKind.FULL) {
    if (Date.now() < prefetchTime + STATIC_STALETIME_MS) {
      return PrefetchCacheEntryStatus.reusable
    }
  }

  return PrefetchCacheEntryStatus.expired
}
