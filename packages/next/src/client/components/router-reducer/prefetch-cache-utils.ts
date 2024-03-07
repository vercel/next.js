import { createHrefFromUrl } from './create-href-from-url'
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

    // If the cache entry isn't reusable, rather than returning it, we want to create a new entry.
    const hasReusablePrefetch =
      existingCacheEntry.status === PrefetchCacheEntryStatus.reusable ||
      existingCacheEntry.status === PrefetchCacheEntryStatus.fresh

    if (switchedToFullPrefetch || !hasReusablePrefetch) {
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
    kind:
      kind ||
      // in dev, there's never gonna be a prefetch entry so we want to prefetch here
      (process.env.NODE_ENV === 'development'
        ? PrefetchKind.AUTO
        : PrefetchKind.TEMPORARY),
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
  const [, , , intercept] = data
  // if the prefetch corresponds with an interception route, we use the nextUrl to prefix the cache key
  const prefetchCacheKey = intercept
    ? createPrefetchCacheKey(url, nextUrl)
    : createPrefetchCacheKey(url)

  const prefetchEntry = {
    treeAtTimeOfPrefetch: tree,
    data: Promise.resolve(data),
    kind,
    prefetchTime: Date.now(),
    lastUsedTime: null,
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
    fetchServerResponse(url, tree, nextUrl, buildId, kind).then(
      (prefetchResponse) => {
        // TODO: `fetchServerResponse` should be more tighly coupled to these prefetch cache operations
        // to avoid drift between this cache key prefixing logic
        // (which is currently directly influenced by the server response)
        const [, , , intercepted] = prefetchResponse
        if (intercepted) {
          prefixExistingPrefetchCacheEntry({ url, nextUrl, prefetchCache })
        }

        return prefetchResponse
      }
    )
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

const FIVE_MINUTES = 5 * 60 * 1000
const THIRTY_SECONDS = 30 * 1000

function getPrefetchEntryCacheStatus({
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
