import {
  fetchServerResponse,
  type FetchServerResponseResult,
} from './fetch-server-response'
import {
  PrefetchCacheEntryStatus,
  type PrefetchCacheEntry,
  PrefetchKind,
  type ReadonlyReducerState,
} from './router-reducer-types'
import { prefetchQueue } from './reducers/prefetch-reducer'

const INTERCEPTION_CACHE_KEY_MARKER = '%'

export type AliasedPrefetchCacheEntry = PrefetchCacheEntry & {
  /** This is a special property that indicates a prefetch entry associated with a different URL
   * was returned rather than the requested URL. This signals to the router that it should only
   * apply the part that doesn't depend on searchParams (specifically the loading state).
   */
  aliased?: boolean
}

/**
 * Creates a cache key for the router prefetch cache
 *
 * @param url - The URL being navigated to
 * @param nextUrl - an internal URL, primarily used for handling rewrites. Defaults to '/'.
 * @return The generated prefetch cache key.
 */
function createPrefetchCacheKeyImpl(
  url: URL,
  includeSearchParams: boolean,
  prefix?: string | null
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
  if (includeSearchParams) {
    // if we have a full prefetch, we can include the search param in the key,
    // as we'll be getting back a full response. The server might have read the search
    // params when generating the full response.
    pathnameFromUrl += url.search
  }

  if (prefix) {
    return `${prefix}${INTERCEPTION_CACHE_KEY_MARKER}${pathnameFromUrl}`
  }

  return pathnameFromUrl
}

function createPrefetchCacheKey(
  url: URL,
  kind: PrefetchKind | undefined,
  nextUrl?: string | null
) {
  return createPrefetchCacheKeyImpl(url, kind === PrefetchKind.FULL, nextUrl)
}

function getExistingCacheEntry(
  url: URL,
  kind: PrefetchKind = PrefetchKind.TEMPORARY,
  nextUrl: string | null,
  prefetchCache: Map<string, PrefetchCacheEntry>,
  allowAliasing: boolean
): AliasedPrefetchCacheEntry | undefined {
  // We first check if there's a more specific interception route prefetch entry
  // This is because when we detect a prefetch that corresponds with an interception route, we prefix it with nextUrl (see `createPrefetchCacheKey`)
  // to avoid conflicts with other pages that may have the same URL but render different things depending on the `Next-URL` header.
  for (const maybeNextUrl of [nextUrl, null]) {
    const cacheKeyWithParams = createPrefetchCacheKeyImpl(
      url,
      true,
      maybeNextUrl
    )
    const cacheKeyWithoutParams = createPrefetchCacheKeyImpl(
      url,
      false,
      maybeNextUrl
    )

    // First, we check if we have a cache entry that exactly matches the URL
    const cacheKeyToUse = url.search
      ? cacheKeyWithParams
      : cacheKeyWithoutParams

    const existingEntry = prefetchCache.get(cacheKeyToUse)
    if (existingEntry && allowAliasing) {
      // We know we're returning an aliased entry when the pathname matches but the search params don't,
      const isAliased =
        existingEntry.url.pathname === url.pathname &&
        existingEntry.url.search !== url.search

      if (isAliased) {
        return {
          ...existingEntry,
          aliased: true,
        }
      }

      return existingEntry
    }

    // If the request contains search params, and we're not doing a full prefetch, we can return the
    // param-less entry if it exists.
    // This is technically covered by the check at the bottom of this function, which iterates over cache entries,
    // but lets us arrive there quicker in the param-full case.
    const entryWithoutParams = prefetchCache.get(cacheKeyWithoutParams)
    if (
      process.env.NODE_ENV !== 'development' &&
      allowAliasing &&
      url.search &&
      kind !== PrefetchKind.FULL &&
      entryWithoutParams &&
      // We shouldn't return the aliased entry if it was relocated to a new cache key.
      // Since it's rewritten, it could respond with a completely different loading state.
      !entryWithoutParams.key.includes(INTERCEPTION_CACHE_KEY_MARKER)
    ) {
      return { ...entryWithoutParams, aliased: true }
    }
  }

  // If we've gotten to this point, we didn't find a specific cache entry that matched
  // the request URL.
  // We attempt a partial match by checking if there's a cache entry with the same pathname.
  // Regardless of what we find, since it doesn't correspond with the requested URL, we'll mark it "aliased".
  // This will signal to the router that it should only apply the loading state on the prefetched data.
  if (
    process.env.NODE_ENV !== 'development' &&
    kind !== PrefetchKind.FULL &&
    allowAliasing
  ) {
    for (const cacheEntry of prefetchCache.values()) {
      if (
        cacheEntry.url.pathname === url.pathname &&
        // We shouldn't return the aliased entry if it was relocated to a new cache key.
        // Since it's rewritten, it could respond with a completely different loading state.
        !cacheEntry.key.includes(INTERCEPTION_CACHE_KEY_MARKER)
      ) {
        return { ...cacheEntry, aliased: true }
      }
    }
  }

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
  prefetchCache,
  kind,
  allowAliasing = true,
}: Pick<ReadonlyReducerState, 'nextUrl' | 'prefetchCache' | 'tree'> & {
  url: URL
  kind?: PrefetchKind
  allowAliasing: boolean
}): AliasedPrefetchCacheEntry {
  const existingCacheEntry = getExistingCacheEntry(
    url,
    kind,
    nextUrl,
    prefetchCache,
    allowAliasing
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
      // If we switched to a full prefetch, validate that the existing cache entry contained partial data.
      // It's possible that the cache entry was seeded with full data but has a cache type of "auto" (ie when cache entries
      // are seeded but without a prefetch intent)
      existingCacheEntry.data.then((prefetchResponse) => {
        const isFullPrefetch =
          Array.isArray(prefetchResponse.flightData) &&
          prefetchResponse.flightData.some((flightData) => {
            // If we started rendering from the root and we returned RSC data (seedData), we already had a full prefetch.
            return flightData.isRootRender && flightData.seedData !== null
          })

        if (!isFullPrefetch) {
          return createLazyPrefetchEntry({
            tree,
            url,
            nextUrl,
            prefetchCache,
            // If we didn't get an explicit prefetch kind, we want to set a temporary kind
            // rather than assuming the same intent as the previous entry, to be consistent with how we
            // lazily create prefetch entries when intent is left unspecified.
            kind: kind ?? PrefetchKind.TEMPORARY,
          })
        }
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
  existingCacheKey,
}: Pick<ReadonlyReducerState, 'nextUrl' | 'prefetchCache'> & {
  url: URL
  existingCacheKey: string
}) {
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
  prefetchCache.set(newCacheKey, { ...existingCacheEntry, key: newCacheKey })
  prefetchCache.delete(existingCacheKey)

  return newCacheKey
}

/**
 * Use to seed the prefetch cache with data that has already been fetched.
 */
export function createSeededPrefetchCacheEntry({
  nextUrl,
  tree,
  prefetchCache,
  url,
  data,
  kind,
}: Pick<ReadonlyReducerState, 'nextUrl' | 'tree' | 'prefetchCache'> & {
  url: URL
  data: FetchServerResponseResult
  kind: PrefetchKind
}) {
  // The initial cache entry technically includes full data, but it isn't explicitly prefetched -- we just seed the
  // prefetch cache so that we can skip an extra prefetch request later, since we already have the data.
  // if the prefetch corresponds with an interception route, we use the nextUrl to prefix the cache key
  const prefetchCacheKey = data.couldBeIntercepted
    ? createPrefetchCacheKey(url, kind, nextUrl)
    : createPrefetchCacheKey(url, kind)

  const prefetchEntry = {
    treeAtTimeOfPrefetch: tree,
    data: Promise.resolve(data),
    kind,
    prefetchTime: Date.now(),
    lastUsedTime: Date.now(),
    staleTime: -1,
    key: prefetchCacheKey,
    status: PrefetchCacheEntryStatus.fresh,
    url,
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
  prefetchCache,
}: Pick<ReadonlyReducerState, 'nextUrl' | 'tree' | 'prefetchCache'> & {
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
      prefetchKind: kind,
    }).then((prefetchResponse) => {
      // TODO: `fetchServerResponse` should be more tighly coupled to these prefetch cache operations
      // to avoid drift between this cache key prefixing logic
      // (which is currently directly influenced by the server response)
      let newCacheKey

      if (prefetchResponse.couldBeIntercepted) {
        // Determine if we need to prefix the cache key with the nextUrl
        newCacheKey = prefixExistingPrefetchCacheEntry({
          url,
          existingCacheKey: prefetchCacheKey,
          nextUrl,
          prefetchCache,
        })
      }

      // If the prefetch was a cache hit, we want to update the existing cache entry to reflect that it was a full prefetch.
      // This is because we know that a static response will contain the full RSC payload, and can be updated to respect the `static`
      // staleTime.
      if (prefetchResponse.prerendered) {
        const existingCacheEntry = prefetchCache.get(
          // if we prefixed the cache key due to route interception, we want to use the new key. Otherwise we use the original key
          newCacheKey ?? prefetchCacheKey
        )
        if (existingCacheEntry) {
          existingCacheEntry.kind = PrefetchKind.FULL
          if (prefetchResponse.staleTime !== -1) {
            // This is the stale time that was collected by the server during
            // static generation. Use this in place of the default stale time.
            existingCacheEntry.staleTime = prefetchResponse.staleTime
          }
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
    staleTime: -1,
    key: prefetchCacheKey,
    status: PrefetchCacheEntryStatus.fresh,
    url,
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

export const STATIC_STALETIME_MS =
  Number(process.env.__NEXT_CLIENT_ROUTER_STATIC_STALETIME) * 1000

function getPrefetchEntryCacheStatus({
  kind,
  prefetchTime,
  lastUsedTime,
  staleTime,
}: PrefetchCacheEntry): PrefetchCacheEntryStatus {
  if (staleTime !== -1) {
    // `staleTime` is the value sent by the server during static generation.
    // When this is available, it takes precedence over any of the heuristics
    // that follow.
    //
    // TODO: When PPR is enabled, the server will *always* return a stale time
    // when prefetching. We should never use a prefetch entry that hasn't yet
    // received data from the server. So the only two cases should be 1) we use
    // the server-generated stale time 2) the unresolved entry is discarded.
    return Date.now() < prefetchTime + staleTime
      ? PrefetchCacheEntryStatus.fresh
      : PrefetchCacheEntryStatus.stale
  }

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
