import type {
  TreePrefetch,
  RootTreePrefetch,
  SegmentPrefetch,
} from '../../../server/app-render/collect-segment-data'
import type {
  HeadData,
  LoadingModuleData,
} from '../../../shared/lib/app-router-types'
import type {
  CacheNodeSeedData,
  DynamicParamTypesShort,
  Segment as FlightRouterStateSegment,
} from '../../../shared/lib/app-router-types'
import { HasLoadingBoundary } from '../../../shared/lib/app-router-types'
import {
  NEXT_DID_POSTPONE_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_ROUTER_STALE_TIME_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_URL,
  RSC_CONTENT_TYPE_HEADER,
  RSC_HEADER,
} from '../app-router-headers'
import {
  createFetch,
  createFromNextReadableStream,
  type RSCResponse,
  type RequestHeaders,
} from '../router-reducer/fetch-server-response'
import {
  pingPrefetchTask,
  isPrefetchTaskDirty,
  type PrefetchTask,
  type PrefetchSubtaskResult,
  startRevalidationCooldown,
} from './scheduler'
import { getAppBuildId } from '../../app-build-id'
import { createHrefFromUrl } from '../router-reducer/create-href-from-url'
import type {
  NormalizedHref,
  NormalizedNextUrl,
  NormalizedSearch,
  RouteCacheKey,
} from './cache-key'
// TODO: Rename this module to avoid confusion with other types of cache keys
import { createCacheKey as createPrefetchRequestKey } from './cache-key'
import {
  doesStaticSegmentAppearInURL,
  getCacheKeyForDynamicParam,
  getParamValueFromCacheKey,
  getRenderedPathname,
  getRenderedSearch,
  parseDynamicParamFromURLPart,
  type RouteParam,
} from '../../route-params'
import { createTupleMap, type TupleMap, type Prefix } from './tuple-map'
import { createLRU } from './lru'
import {
  appendSegmentCacheKeyPart,
  appendSegmentRequestKeyPart,
  convertSegmentPathToStaticExportFilename,
  createSegmentCacheKeyPart,
  createSegmentRequestKeyPart,
  ROOT_SEGMENT_CACHE_KEY,
  ROOT_SEGMENT_REQUEST_KEY,
  type SegmentCacheKey,
  type SegmentRequestKey,
} from '../../../shared/lib/segment-cache/segment-value-encoding'
import type {
  FlightRouterState,
  NavigationFlightResponse,
} from '../../../shared/lib/app-router-types'
import {
  normalizeFlightData,
  prepareFlightRouterStateForRequest,
} from '../../flight-data-helpers'
import { STATIC_STALETIME_MS } from '../router-reducer/reducers/navigate-reducer'
import { pingVisibleLinks } from '../links'
import { PAGE_SEGMENT_KEY } from '../../../shared/lib/segment'
import {
  DOC_PREFETCH_RANGE_HEADER_VALUE,
  doesExportedHtmlMatchBuildId,
} from '../../../shared/lib/segment-cache/output-export-prefetch-encoding'
import { FetchStrategy } from '../segment-cache'
import { createPromiseWithResolvers } from '../../../shared/lib/promise-with-resolvers'

// A note on async/await when working in the prefetch cache:
//
// Most async operations in the prefetch cache should *not* use async/await,
// Instead, spawn a subtask that writes the results to a cache entry, and attach
// a "ping" listener to notify the prefetch queue to try again.
//
// The reason is we need to be able to access the segment cache and traverse its
// data structures synchronously. For example, if there's a synchronous update
// we can take an immediate snapshot of the cache to produce something we can
// render. Limiting the use of async/await also makes it easier to avoid race
// conditions, which is especially important because is cache is mutable.
//
// Another reason is that while we're performing async work, it's possible for
// existing entries to become stale, or for Link prefetches to be removed from
// the queue. For optimal scheduling, we need to be able to "cancel" subtasks
// that are no longer needed. So, when a segment is received from the server, we
// restart from the root of the tree that's being prefetched, to confirm all the
// parent segments are still cached. If the segment is no longer reachable from
// the root, then it's effectively canceled. This is similar to the design of
// Rust Futures, or React Suspense.

export type RouteTree = {
  cacheKey: SegmentCacheKey
  requestKey: SegmentRequestKey
  // TODO: Remove the `segment` field, now that it can be reconstructed
  // from `param`.
  segment: FlightRouterStateSegment
  param: RouteParam | null
  slots: null | {
    [parallelRouteKey: string]: RouteTree
  }
  isRootLayout: boolean

  // If this is a dynamic route, indicates whether there is a loading boundary
  // somewhere in the tree. If not, we can skip the prefetch for the data,
  // because we know it would be an empty response. (For a static/PPR route,
  // this value is disregarded, because in that model `loading.tsx` is treated
  // like any other Suspense boundary.)
  hasLoadingBoundary: HasLoadingBoundary

  // Indicates whether this route has a runtime prefetch that we can request.
  // This is determined by the server; it's not purely a user configuration
  // because the server may determine that a route is fully static and doesn't
  // need runtime prefetching regardless of the configuration.
  hasRuntimePrefetch: boolean
}

type RouteCacheEntryShared = {
  staleAt: number
  // This is false only if we're certain the route cannot be intercepted. It's
  // true in all other cases, including on initialization when we haven't yet
  // received a response from the server.
  couldBeIntercepted: boolean

  // See comment in scheduler.ts for context
  TODO_metadataStatus: EntryStatus.Empty | EntryStatus.Fulfilled
  TODO_isHeadDynamic: boolean

  // LRU-related fields
  keypath: null | Prefix<RouteCacheKeypath>
  next: null | RouteCacheEntry
  prev: null | RouteCacheEntry
  size: number
}

/**
 * Tracks the status of a cache entry as it progresses from no data (Empty),
 * waiting for server data (Pending), and finished (either Fulfilled or
 * Rejected depending on the response from the server.
 */
export const enum EntryStatus {
  Empty = 0,
  Pending = 1,
  Fulfilled = 2,
  Rejected = 3,
}

type PendingRouteCacheEntry = RouteCacheEntryShared & {
  status: EntryStatus.Empty | EntryStatus.Pending
  blockedTasks: Set<PrefetchTask> | null
  canonicalUrl: null
  renderedSearch: null
  tree: null
  head: HeadData | null
  isHeadPartial: true
  isPPREnabled: false
}

type RejectedRouteCacheEntry = RouteCacheEntryShared & {
  status: EntryStatus.Rejected
  blockedTasks: Set<PrefetchTask> | null
  canonicalUrl: null
  renderedSearch: null
  tree: null
  head: null
  isHeadPartial: true
  isPPREnabled: boolean
}

export type FulfilledRouteCacheEntry = RouteCacheEntryShared & {
  status: EntryStatus.Fulfilled
  blockedTasks: null
  canonicalUrl: string
  renderedSearch: NormalizedSearch
  tree: RouteTree
  head: HeadData
  isHeadPartial: boolean
  isPPREnabled: boolean
}

export type RouteCacheEntry =
  | PendingRouteCacheEntry
  | FulfilledRouteCacheEntry
  | RejectedRouteCacheEntry

type SegmentCacheEntryShared = {
  staleAt: number
  fetchStrategy: FetchStrategy
  revalidating: SegmentCacheEntry | null

  // LRU-related fields
  keypath: null | Prefix<SegmentCacheKeypath>
  next: null | SegmentCacheEntry
  prev: null | SegmentCacheEntry
  size: number
}

export type EmptySegmentCacheEntry = SegmentCacheEntryShared & {
  status: EntryStatus.Empty
  rsc: null
  loading: null
  isPartial: true
  promise: null
}

export type PendingSegmentCacheEntry = SegmentCacheEntryShared & {
  status: EntryStatus.Pending
  rsc: null
  loading: null
  isPartial: true
  promise: null | PromiseWithResolvers<FulfilledSegmentCacheEntry | null>
}

type RejectedSegmentCacheEntry = SegmentCacheEntryShared & {
  status: EntryStatus.Rejected
  rsc: null
  loading: null
  isPartial: true
  promise: null
}

export type FulfilledSegmentCacheEntry = SegmentCacheEntryShared & {
  status: EntryStatus.Fulfilled
  rsc: React.ReactNode | null
  loading: LoadingModuleData | Promise<LoadingModuleData>
  isPartial: boolean
  promise: null
}

export type SegmentCacheEntry =
  | EmptySegmentCacheEntry
  | PendingSegmentCacheEntry
  | RejectedSegmentCacheEntry
  | FulfilledSegmentCacheEntry

export type NonEmptySegmentCacheEntry = Exclude<
  SegmentCacheEntry,
  EmptySegmentCacheEntry
>

const isOutputExportMode =
  process.env.NODE_ENV === 'production' &&
  process.env.__NEXT_CONFIG_OUTPUT === 'export'

/**
 * Ensures a minimum stale time of 30s to avoid issues where the server sends a too
 * short-lived stale time, which would prevent anything from being prefetched.
 */
function getStaleTimeMs(staleTimeSeconds: number): number {
  return Math.max(staleTimeSeconds, 30) * 1000
}

// Route cache entries vary on multiple keys: the href and the Next-Url. Each of
// these parts needs to be included in the internal cache key. Rather than
// concatenate the keys into a single key, we use a multi-level map, where the
// first level is keyed by href, the second level is keyed by Next-Url, and so
// on (if were to add more levels).
type RouteCacheKeypath = [NormalizedHref, NormalizedNextUrl]
let routeCacheMap: TupleMap<RouteCacheKeypath, RouteCacheEntry> =
  createTupleMap()

// We use an LRU for memory management. We must update this whenever we add or
// remove a new cache entry, or when an entry changes size.
// TODO: I chose the max size somewhat arbitrarily. Consider setting this based
// on navigator.deviceMemory, or some other heuristic. We should make this
// customizable via the Next.js config, too.
const maxRouteLruSize = 10 * 1024 * 1024 // 10 MB
let routeCacheLru = createLRU<RouteCacheEntry>(
  maxRouteLruSize,
  onRouteLRUEviction
)

type SegmentCacheKeypath = [string, NormalizedSearch]
let segmentCacheMap: TupleMap<SegmentCacheKeypath, SegmentCacheEntry> =
  createTupleMap()
// NOTE: Segments and Route entries are managed by separate LRUs. We could
// combine them into a single LRU, but because they are separate types, we'd
// need to wrap each one in an extra LRU node (to maintain monomorphism, at the
// cost of additional memory).
const maxSegmentLruSize = 50 * 1024 * 1024 // 50 MB
let segmentCacheLru = createLRU<SegmentCacheEntry>(
  maxSegmentLruSize,
  onSegmentLRUEviction
)

// All invalidation listeners for the whole cache are tracked in single set.
// Since we don't yet support tag or path-based invalidation, there's no point
// tracking them any more granularly than this. Once we add granular
// invalidation, that may change, though generally the model is to just notify
// the listeners and allow the caller to poll the prefetch cache with a new
// prefetch task if desired.
let invalidationListeners: Set<PrefetchTask> | null = null

// Incrementing counter used to track cache invalidations.
let currentCacheVersion = 0

export function getCurrentCacheVersion(): number {
  return currentCacheVersion
}

/**
 * Used to clear the client prefetch cache when a server action calls
 * revalidatePath or revalidateTag. Eventually we will support only clearing the
 * segments that were actually affected, but there's more work to be done on the
 * server before the client is able to do this correctly.
 */
export function revalidateEntireCache(
  nextUrl: string | null,
  tree: FlightRouterState
) {
  currentCacheVersion++

  // Start a cooldown before re-prefetching to allow CDN cache propagation.
  startRevalidationCooldown()

  // Clearing the cache also effectively rejects any pending requests, because
  // when the response is received, it gets written into a cache entry that is
  // no longer reachable.
  // TODO: There's an exception to this case that we don't currently handle
  // correctly: background revalidations. See note in `upsertSegmentEntry`.
  routeCacheMap = createTupleMap()
  routeCacheLru = createLRU(maxRouteLruSize, onRouteLRUEviction)
  segmentCacheMap = createTupleMap()
  segmentCacheLru = createLRU(maxSegmentLruSize, onSegmentLRUEviction)

  // Prefetch all the currently visible links again, to re-fill the cache.
  pingVisibleLinks(nextUrl, tree)

  // Similarly, notify all invalidation listeners (i.e. those passed to
  // `router.prefetch(onInvalidate)`), so they can trigger a new prefetch
  // if needed.
  pingInvalidationListeners(nextUrl, tree)
}

function attachInvalidationListener(task: PrefetchTask): void {
  // This function is called whenever a prefetch task reads a cache entry. If
  // the task has an onInvalidate function associated with it — i.e. the one
  // optionally passed to router.prefetch(onInvalidate) — then we attach that
  // listener to the every cache entry that the task reads. Then, if an entry
  // is invalidated, we call the function.
  if (task.onInvalidate !== null) {
    if (invalidationListeners === null) {
      invalidationListeners = new Set([task])
    } else {
      invalidationListeners.add(task)
    }
  }
}

function notifyInvalidationListener(task: PrefetchTask): void {
  const onInvalidate = task.onInvalidate
  if (onInvalidate !== null) {
    // Clear the callback from the task object to guarantee it's not called more
    // than once.
    task.onInvalidate = null

    // This is a user-space function, so we must wrap in try/catch.
    try {
      onInvalidate()
    } catch (error) {
      if (typeof reportError === 'function') {
        reportError(error)
      } else {
        console.error(error)
      }
    }
  }
}

export function pingInvalidationListeners(
  nextUrl: string | null,
  tree: FlightRouterState
): void {
  // The rough equivalent of pingVisibleLinks, but for onInvalidate callbacks.
  // This is called when the Next-Url or the base tree changes, since those
  // may affect the result of a prefetch task. It's also called after a
  // cache invalidation.
  if (invalidationListeners !== null) {
    const tasks = invalidationListeners
    invalidationListeners = null
    for (const task of tasks) {
      if (isPrefetchTaskDirty(task, nextUrl, tree)) {
        notifyInvalidationListener(task)
      }
    }
  }
}

export function readExactRouteCacheEntry(
  now: number,
  href: NormalizedHref,
  nextUrl: NormalizedNextUrl | null
): RouteCacheEntry | null {
  const keypath: Prefix<RouteCacheKeypath> =
    nextUrl === null ? [href] : [href, nextUrl]
  const existingEntry = routeCacheMap.get(keypath)
  if (existingEntry !== null) {
    // Check if the entry is stale
    if (existingEntry.staleAt > now) {
      // Reuse the existing entry.

      // Since this is an access, move the entry to the front of the LRU.
      routeCacheLru.put(existingEntry)

      return existingEntry
    } else {
      // Evict the stale entry from the cache.
      deleteRouteFromCache(existingEntry, keypath)
    }
  }
  return null
}

export function readRouteCacheEntry(
  now: number,
  key: RouteCacheKey
): RouteCacheEntry | null {
  // First check if there's a non-intercepted entry. Most routes cannot be
  // intercepted, so this is the common case.
  const nonInterceptedEntry = readExactRouteCacheEntry(now, key.href, null)
  if (nonInterceptedEntry !== null && !nonInterceptedEntry.couldBeIntercepted) {
    // Found a match, and the route cannot be intercepted. We can reuse it.
    return nonInterceptedEntry
  }
  // There was no match. Check again but include the Next-Url this time.
  return readExactRouteCacheEntry(now, key.href, key.nextUrl)
}

export function getSegmentKeypath(
  fetchStrategy: FetchStrategy,
  route: FulfilledRouteCacheEntry,
  cacheKey: SegmentCacheKey
): Prefix<SegmentCacheKeypath> {
  // When a prefetch includes dynamic data, the search params are included
  // in the result, so we must include the search string in the segment
  // cache key. (Note that this is true even if the search string is empty.)
  //
  // If we're fetching using PPR, we do not need to include the search params in
  // the cache key, because the search params are treated as dynamic data. The
  // cache entry is valid for all possible search param values.
  const isDynamic =
    fetchStrategy === FetchStrategy.Full ||
    fetchStrategy === FetchStrategy.PPRRuntime ||
    !route.isPPREnabled
  return isDynamic && cacheKey.endsWith('/' + PAGE_SEGMENT_KEY)
    ? [cacheKey, route.renderedSearch]
    : [cacheKey]
}

export function readSegmentCacheEntry(
  now: number,
  route: FulfilledRouteCacheEntry,
  cacheKey: SegmentCacheKey
): SegmentCacheEntry | null {
  if (!cacheKey.endsWith('/' + PAGE_SEGMENT_KEY)) {
    // Fast path. Search params only exist on page segments.
    return readExactSegmentCacheEntry(now, [cacheKey])
  }

  const renderedSearch = route.renderedSearch
  if (renderedSearch !== null) {
    // Page segments may or may not contain search params. If they were prefetched
    // using a dynamic request, then we will have an entry with search params.
    // Check for that case first.
    const entryWithSearchParams = readExactSegmentCacheEntry(now, [
      cacheKey,
      renderedSearch,
    ])
    if (entryWithSearchParams !== null) {
      return entryWithSearchParams
    }
  }

  // If we did not find an entry with the given search params, check for a
  // "fallback" entry, where the search params are treated as dynamic data. This
  // is the common case because PPR/static prerenders always treat search params
  // as dynamic.
  //
  // See corresponding logic in `getSegmentKeypath`.
  const entryWithoutSearchParams = readExactSegmentCacheEntry(now, [cacheKey])
  return entryWithoutSearchParams
}

function readExactSegmentCacheEntry(
  now: number,
  keypath: Prefix<SegmentCacheKeypath>
): SegmentCacheEntry | null {
  const existingEntry = segmentCacheMap.get(keypath)
  if (existingEntry !== null) {
    // Check if the entry is stale
    if (existingEntry.staleAt > now) {
      // Reuse the existing entry.

      // Since this is an access, move the entry to the front of the LRU.
      segmentCacheLru.put(existingEntry)

      return existingEntry
    } else {
      // This is a stale entry.
      const revalidatingEntry = existingEntry.revalidating
      if (revalidatingEntry !== null) {
        // There's a revalidation in progress. Upsert it.
        const upsertedEntry = upsertSegmentEntry(
          now,
          keypath,
          revalidatingEntry
        )
        if (upsertedEntry !== null && upsertedEntry.staleAt > now) {
          // We can use the upserted revalidation entry.
          return upsertedEntry
        }
      } else {
        // Evict the stale entry from the cache.
        deleteSegmentFromCache(existingEntry, keypath)
      }
    }
  }
  return null
}

function readRevalidatingSegmentCacheEntry(
  now: number,
  owner: SegmentCacheEntry
): SegmentCacheEntry | null {
  const existingRevalidation = owner.revalidating
  if (existingRevalidation !== null) {
    if (existingRevalidation.staleAt > now) {
      // There's already a revalidation in progress. Or a previous revalidation
      // failed and it has not yet expired.
      return existingRevalidation
    } else {
      // Clear the stale revalidation from its owner.
      clearRevalidatingSegmentFromOwner(owner)
    }
  }
  return null
}

export function waitForSegmentCacheEntry(
  pendingEntry: PendingSegmentCacheEntry
): Promise<FulfilledSegmentCacheEntry | null> {
  // Because the entry is pending, there's already a in-progress request.
  // Attach a promise to the entry that will resolve when the server responds.
  let promiseWithResolvers = pendingEntry.promise
  if (promiseWithResolvers === null) {
    promiseWithResolvers = pendingEntry.promise =
      createPromiseWithResolvers<FulfilledSegmentCacheEntry | null>()
  } else {
    // There's already a promise we can use
  }
  return promiseWithResolvers.promise
}

/**
 * Checks if an entry for a route exists in the cache. If so, it returns the
 * entry, If not, it adds an empty entry to the cache and returns it.
 */
export function readOrCreateRouteCacheEntry(
  now: number,
  task: PrefetchTask,
  key: RouteCacheKey
): RouteCacheEntry {
  attachInvalidationListener(task)

  const existingEntry = readRouteCacheEntry(now, key)
  if (existingEntry !== null) {
    return existingEntry
  }
  // Create a pending entry and add it to the cache.
  const pendingEntry: PendingRouteCacheEntry = {
    canonicalUrl: null,
    status: EntryStatus.Empty,
    blockedTasks: null,
    tree: null,
    head: null,
    isHeadPartial: true,
    // Since this is an empty entry, there's no reason to ever evict it. It will
    // be updated when the data is populated.
    staleAt: Infinity,
    // This is initialized to true because we don't know yet whether the route
    // could be intercepted. It's only set to false once we receive a response
    // from the server.
    couldBeIntercepted: true,
    // Similarly, we don't yet know if the route supports PPR.
    isPPREnabled: false,
    renderedSearch: null,

    TODO_metadataStatus: EntryStatus.Empty,
    TODO_isHeadDynamic: false,

    // LRU-related fields
    keypath: null,
    next: null,
    prev: null,
    size: 0,
  }
  const keypath: Prefix<RouteCacheKeypath> =
    key.nextUrl === null ? [key.href] : [key.href, key.nextUrl]
  routeCacheMap.set(keypath, pendingEntry)
  // Stash the keypath on the entry so we know how to remove it from the map
  // if it gets evicted from the LRU.
  pendingEntry.keypath = keypath
  routeCacheLru.put(pendingEntry)
  return pendingEntry
}

export function requestOptimisticRouteCacheEntry(
  now: number,
  requestedUrl: URL,
  nextUrl: string | null
): FulfilledRouteCacheEntry | null {
  // This function is called during a navigation when there was no matching
  // route tree in the prefetch cache. Before de-opting to a blocking,
  // unprefetched navigation, we will first attempt to construct an "optimistic"
  // route tree by checking the cache for similar routes.
  //
  // Check if there's a route with the same pathname, but with different
  // search params. We can then base our optimistic route tree on this entry.
  //
  // Conceptually, we are simulating what would happen if we did perform a
  // prefetch the requested URL, under the assumption that the server will
  // not redirect or rewrite the request in a different manner than the
  // base route tree. This assumption might not hold, in which case we'll have
  // to recover when we perform the dynamic navigation request. However, this
  // is what would happen if a route were dynamically rewritten/redirected
  // in between the prefetch and the navigation. So the logic needs to exist
  // to handle this case regardless.

  // Look for a route with the same pathname, but with an empty search string.
  // TODO: There's nothing inherently special about the empty search string;
  // it's chosen somewhat arbitrarily, with the rationale that it's the most
  // likely one to exist. But we should update this to match _any_ search
  // string. The plan is to generalize this logic alongside other improvements
  // related to "fallback" cache entries.
  const requestedSearch = requestedUrl.search as NormalizedSearch
  if (requestedSearch === '') {
    // The caller would have already checked if a route with an empty search
    // string is in the cache. So we can bail out here.
    return null
  }
  const urlWithoutSearchParams = new URL(requestedUrl)
  urlWithoutSearchParams.search = ''
  const routeWithNoSearchParams = readRouteCacheEntry(
    now,
    createPrefetchRequestKey(urlWithoutSearchParams.href, nextUrl)
  )

  if (
    routeWithNoSearchParams === null ||
    routeWithNoSearchParams.status !== EntryStatus.Fulfilled
  ) {
    // Bail out of constructing an optimistic route tree. This will result in
    // a blocking, unprefetched navigation.
    return null
  }

  // Now we have a base route tree we can "patch" with our optimistic values.

  const TODO_isHeadDynamic = routeWithNoSearchParams.TODO_isHeadDynamic
  let head
  let isHeadPartial
  let TODO_metadataStatus: EntryStatus.Empty | EntryStatus.Fulfilled
  if (TODO_isHeadDynamic) {
    // If the head was fetched via dynamic request, then we don't know
    // whether it accessed search params. So we must be conservative — we
    // cannot reuse it. The head will stream in during the dynamic navigation.
    // TODO: When Cache Components is enabled, we should track whether the
    // head varied on search params.
    // TODO: Because we're rendering a `null` viewport as the partial state, the
    // viewport will not block the navigation; it will stream in later,
    // alongside the metadata. Viewport is supposed to be blocking. This is
    // a subtle bug in the old implementation that we've preserved here. It's
    // rare enough that we're not going to fix it for apps that don't enable
    // Cache Components; when Cache Components is enabled, though, we should
    // use an infinite promise here to block the navigation. But only if the
    // entry actually varies on search params.
    head = [null, null]
    // Setting this to `true` ensures that on navigation, the head is requested.
    isHeadPartial = true
    TODO_metadataStatus = EntryStatus.Empty
  } else {
    // The head was fetched via a static/PPR request. So it's guaranteed to
    // not contain search params. We can reuse it.
    head = routeWithNoSearchParams.head
    isHeadPartial = routeWithNoSearchParams.isHeadPartial
    TODO_metadataStatus = EntryStatus.Empty
  }

  // Optimistically assume that redirects for the requested pathname do
  // not vary on the search string. Therefore, if the base route was
  // redirected to a different search string, then the optimistic route
  // should be redirected to the same search string. Otherwise, we use
  // the requested search string.
  const canonicalUrlForRouteWithNoSearchParams = new URL(
    routeWithNoSearchParams.canonicalUrl,
    requestedUrl.origin
  )
  const optimisticCanonicalSearch =
    canonicalUrlForRouteWithNoSearchParams.search !== ''
      ? // Base route was redirected. Reuse the same redirected search string.
        canonicalUrlForRouteWithNoSearchParams.search
      : requestedSearch

  // Similarly, optimistically assume that rewrites for the requested
  // pathname do not vary on the search string. Therefore, if the base
  // route was rewritten to a different search string, then the optimistic
  // route should be rewritten to the same search string. Otherwise, we use
  // the requested search string.
  const optimisticRenderedSearch =
    routeWithNoSearchParams.renderedSearch !== ''
      ? // Base route was rewritten. Reuse the same rewritten search string.
        routeWithNoSearchParams.renderedSearch
      : requestedSearch

  const optimisticUrl = new URL(
    routeWithNoSearchParams.canonicalUrl,
    location.origin
  )
  optimisticUrl.search = optimisticCanonicalSearch
  const optimisticCanonicalUrl = createHrefFromUrl(optimisticUrl)

  // Clone the base route tree, and override the relevant fields with our
  // optimistic values.
  const optimisticEntry: FulfilledRouteCacheEntry = {
    canonicalUrl: optimisticCanonicalUrl,

    status: EntryStatus.Fulfilled,
    // This isn't cloned because it's instance-specific
    blockedTasks: null,
    tree: routeWithNoSearchParams.tree,
    head,
    isHeadPartial,
    staleAt: routeWithNoSearchParams.staleAt,
    couldBeIntercepted: routeWithNoSearchParams.couldBeIntercepted,
    isPPREnabled: routeWithNoSearchParams.isPPREnabled,

    // Override the rendered search with the optimistic value.
    renderedSearch: optimisticRenderedSearch,

    TODO_metadataStatus,
    TODO_isHeadDynamic,

    // LRU-related fields
    keypath: null,
    next: null,
    prev: null,
    size: 0,
  }

  // Do not insert this entry into the cache. It only exists so we can
  // perform the current navigation. Just return it to the caller.
  return optimisticEntry
}

/**
 * Checks if an entry for a segment exists in the cache. If so, it returns the
 * entry, If not, it adds an empty entry to the cache and returns it.
 */
export function readOrCreateSegmentCacheEntry(
  now: number,
  fetchStrategy: FetchStrategy,
  route: FulfilledRouteCacheEntry,
  cacheKey: SegmentCacheKey
): SegmentCacheEntry {
  const keypath = getSegmentKeypath(fetchStrategy, route, cacheKey)
  const existingEntry = readExactSegmentCacheEntry(now, keypath)
  if (existingEntry !== null) {
    return existingEntry
  }
  // Create a pending entry and add it to the cache.
  const pendingEntry = createDetachedSegmentCacheEntry(route.staleAt)
  segmentCacheMap.set(keypath, pendingEntry)
  // Stash the keypath on the entry so we know how to remove it from the map
  // if it gets evicted from the LRU.
  pendingEntry.keypath = keypath
  segmentCacheLru.put(pendingEntry)
  return pendingEntry
}

export function readOrCreateRevalidatingSegmentEntry(
  now: number,
  prevEntry: SegmentCacheEntry
): SegmentCacheEntry {
  const existingRevalidation = readRevalidatingSegmentCacheEntry(now, prevEntry)
  if (existingRevalidation !== null) {
    return existingRevalidation
  }
  const pendingEntry = createDetachedSegmentCacheEntry(prevEntry.staleAt)

  // Background revalidations are not stored directly in the cache map or LRU;
  // they're stashed on the entry that they will (potentially) replace.
  //
  // Note that we don't actually ever clear this field, except when the entry
  // expires. When the revalidation finishes, one of two things will happen:
  //
  //  1) the revalidation is successful, `prevEntry` is removed from the cache
  //     and garbage collected (so there's no point clearing any of its fields)
  //  2) the revalidation fails, and we'll use the `revalidating` field to
  //     prevent subsequent revalidation attempts, until it expires.
  prevEntry.revalidating = pendingEntry

  return pendingEntry
}

export function upsertSegmentEntry(
  now: number,
  keypath: Prefix<SegmentCacheKeypath>,
  candidateEntry: SegmentCacheEntry
): SegmentCacheEntry | null {
  // We have a new entry that has not yet been inserted into the cache. Before
  // we do so, we need to confirm whether it takes precedence over the existing
  // entry (if one exists).
  // TODO: We should not upsert an entry if its key was invalidated in the time
  // since the request was made. We can do that by passing the "owner" entry to
  // this function and confirming it's the same as `existingEntry`.
  const existingEntry = readExactSegmentCacheEntry(now, keypath)
  if (existingEntry !== null) {
    // Don't replace a more specific segment with a less-specific one. A case where this
    // might happen is if the existing segment was fetched via
    // `<Link prefetch={true}>`.
    if (
      // We fetched the new segment using a different, less specific fetch strategy
      // than the segment we already have in the cache, so it can't have more content.
      (candidateEntry.fetchStrategy !== existingEntry.fetchStrategy &&
        !canNewFetchStrategyProvideMoreContent(
          existingEntry.fetchStrategy,
          candidateEntry.fetchStrategy
        )) ||
      // The existing entry isn't partial, but the new one is.
      // (TODO: can this be true if `candidateEntry.fetchStrategy >= existingEntry.fetchStrategy`?)
      (!existingEntry.isPartial && candidateEntry.isPartial)
    ) {
      // We're going to leave the entry on the owner's `revalidating` field
      // so that it doesn't get revalidated again unnecessarily. Downgrade the
      // Fulfilled entry to Rejected and null out the data so it can be garbage
      // collected. We leave `staleAt` intact to prevent subsequent revalidation
      // attempts only until the entry expires.
      const rejectedEntry: RejectedSegmentCacheEntry = candidateEntry as any
      rejectedEntry.status = EntryStatus.Rejected
      rejectedEntry.loading = null
      rejectedEntry.rsc = null
      return null
    }

    // Evict the existing entry from the cache.
    deleteSegmentFromCache(existingEntry, keypath)
  }
  segmentCacheMap.set(keypath, candidateEntry)
  // Stash the keypath on the entry so we know how to remove it from the map
  // if it gets evicted from the LRU.
  candidateEntry.keypath = keypath
  segmentCacheLru.put(candidateEntry)
  return candidateEntry
}

export function createDetachedSegmentCacheEntry(
  staleAt: number
): EmptySegmentCacheEntry {
  const emptyEntry: EmptySegmentCacheEntry = {
    status: EntryStatus.Empty,
    // Default to assuming the fetch strategy will be PPR. This will be updated
    // when a fetch is actually initiated.
    fetchStrategy: FetchStrategy.PPR,
    revalidating: null,
    rsc: null,
    loading: null,
    staleAt,
    isPartial: true,
    promise: null,

    // LRU-related fields
    keypath: null,
    next: null,
    prev: null,
    size: 0,
  }
  return emptyEntry
}

export function upgradeToPendingSegment(
  emptyEntry: EmptySegmentCacheEntry,
  fetchStrategy: FetchStrategy
): PendingSegmentCacheEntry {
  const pendingEntry: PendingSegmentCacheEntry = emptyEntry as any
  pendingEntry.status = EntryStatus.Pending
  pendingEntry.fetchStrategy = fetchStrategy
  return pendingEntry
}

function deleteRouteFromCache(
  entry: RouteCacheEntry,
  keypath: Prefix<RouteCacheKeypath>
): void {
  pingBlockedTasks(entry)
  routeCacheMap.delete(keypath)
  routeCacheLru.delete(entry)
}

function deleteSegmentFromCache(
  entry: SegmentCacheEntry,
  keypath: Prefix<SegmentCacheKeypath>
): void {
  cancelEntryListeners(entry)
  segmentCacheMap.delete(keypath)
  segmentCacheLru.delete(entry)
  clearRevalidatingSegmentFromOwner(entry)
}

function clearRevalidatingSegmentFromOwner(owner: SegmentCacheEntry): void {
  // Revalidating segments are not stored in the cache directly; they're
  // stored as a field on the entry that they will (potentially) replace. So
  // to dispose of an existing revalidation, we just need to null out the field
  // on the owner.
  const revalidatingSegment = owner.revalidating
  if (revalidatingSegment !== null) {
    cancelEntryListeners(revalidatingSegment)
    owner.revalidating = null
  }
}

export function resetRevalidatingSegmentEntry(
  owner: SegmentCacheEntry
): EmptySegmentCacheEntry {
  clearRevalidatingSegmentFromOwner(owner)
  const emptyEntry = createDetachedSegmentCacheEntry(owner.staleAt)
  owner.revalidating = emptyEntry
  return emptyEntry
}

function onRouteLRUEviction(entry: RouteCacheEntry): void {
  // The LRU evicted this entry. Remove it from the map.
  const keypath = entry.keypath
  if (keypath !== null) {
    entry.keypath = null
    pingBlockedTasks(entry)
    routeCacheMap.delete(keypath)
  }
}

function onSegmentLRUEviction(entry: SegmentCacheEntry): void {
  // The LRU evicted this entry. Remove it from the map.
  const keypath = entry.keypath
  if (keypath !== null) {
    entry.keypath = null
    cancelEntryListeners(entry)
    segmentCacheMap.delete(keypath)
  }
}

function cancelEntryListeners(entry: SegmentCacheEntry): void {
  if (entry.status === EntryStatus.Pending && entry.promise !== null) {
    // There were listeners for this entry. Resolve them with `null` to indicate
    // that the prefetch failed. It's up to the listener to decide how to handle
    // this case.
    // NOTE: We don't currently propagate the reason the prefetch was canceled
    // but we could by accepting a `reason` argument.
    entry.promise.resolve(null)
    entry.promise = null
  }
}

function pingBlockedTasks(entry: {
  blockedTasks: Set<PrefetchTask> | null
}): void {
  const blockedTasks = entry.blockedTasks
  if (blockedTasks !== null) {
    for (const task of blockedTasks) {
      pingPrefetchTask(task)
    }
    entry.blockedTasks = null
  }
}

function fulfillRouteCacheEntry(
  entry: RouteCacheEntry,
  tree: RouteTree,
  head: HeadData,
  isHeadPartial: boolean,
  staleAt: number,
  couldBeIntercepted: boolean,
  canonicalUrl: string,
  renderedSearch: NormalizedSearch,
  isPPREnabled: boolean,
  isHeadDynamic: boolean
): FulfilledRouteCacheEntry {
  const fulfilledEntry: FulfilledRouteCacheEntry = entry as any
  fulfilledEntry.status = EntryStatus.Fulfilled
  fulfilledEntry.tree = tree
  fulfilledEntry.head = head
  fulfilledEntry.isHeadPartial = isHeadPartial
  fulfilledEntry.staleAt = staleAt
  fulfilledEntry.couldBeIntercepted = couldBeIntercepted
  fulfilledEntry.canonicalUrl = canonicalUrl
  fulfilledEntry.renderedSearch = renderedSearch
  fulfilledEntry.isPPREnabled = isPPREnabled
  fulfilledEntry.TODO_isHeadDynamic = isHeadDynamic
  pingBlockedTasks(entry)
  return fulfilledEntry
}

function fulfillSegmentCacheEntry(
  segmentCacheEntry: PendingSegmentCacheEntry,
  rsc: React.ReactNode,
  loading: LoadingModuleData | Promise<LoadingModuleData>,
  staleAt: number,
  isPartial: boolean
): FulfilledSegmentCacheEntry {
  const fulfilledEntry: FulfilledSegmentCacheEntry = segmentCacheEntry as any
  fulfilledEntry.status = EntryStatus.Fulfilled
  fulfilledEntry.rsc = rsc
  fulfilledEntry.loading = loading
  fulfilledEntry.staleAt = staleAt
  fulfilledEntry.isPartial = isPartial
  // Resolve any listeners that were waiting for this data.
  if (segmentCacheEntry.promise !== null) {
    segmentCacheEntry.promise.resolve(fulfilledEntry)
    // Free the promise for garbage collection.
    fulfilledEntry.promise = null
  }
  return fulfilledEntry
}

function rejectRouteCacheEntry(
  entry: PendingRouteCacheEntry,
  staleAt: number
): void {
  const rejectedEntry: RejectedRouteCacheEntry = entry as any
  rejectedEntry.status = EntryStatus.Rejected
  rejectedEntry.staleAt = staleAt
  pingBlockedTasks(entry)
}

function rejectSegmentCacheEntry(
  entry: PendingSegmentCacheEntry,
  staleAt: number
): void {
  const rejectedEntry: RejectedSegmentCacheEntry = entry as any
  rejectedEntry.status = EntryStatus.Rejected
  rejectedEntry.staleAt = staleAt
  if (entry.promise !== null) {
    // NOTE: We don't currently propagate the reason the prefetch was canceled
    // but we could by accepting a `reason` argument.
    entry.promise.resolve(null)
    entry.promise = null
  }
}

function convertRootTreePrefetchToRouteTree(
  rootTree: RootTreePrefetch,
  renderedPathname: string
) {
  // Remove trailing and leading slashes
  const pathnameParts = renderedPathname.split('/').filter((p) => p !== '')
  const index = 0
  const rootSegment = ROOT_SEGMENT_CACHE_KEY
  return convertTreePrefetchToRouteTree(
    rootTree.tree,
    rootSegment,
    null,
    ROOT_SEGMENT_REQUEST_KEY,
    ROOT_SEGMENT_CACHE_KEY,
    pathnameParts,
    index
  )
}

function convertTreePrefetchToRouteTree(
  prefetch: TreePrefetch,
  segment: FlightRouterStateSegment,
  param: RouteParam | null,
  requestKey: SegmentRequestKey,
  cacheKey: SegmentCacheKey,
  pathnameParts: Array<string>,
  pathnamePartsIndex: number
): RouteTree {
  // Converts the route tree sent by the server into the format used by the
  // cache. The cached version of the tree includes additional fields, such as a
  // cache key for each segment. Since this is frequently accessed, we compute
  // it once instead of on every access. This same cache key is also used to
  // request the segment from the server.

  let slots: { [parallelRouteKey: string]: RouteTree } | null = null
  const prefetchSlots = prefetch.slots
  if (prefetchSlots !== null) {
    slots = {}
    for (let parallelRouteKey in prefetchSlots) {
      const childPrefetch = prefetchSlots[parallelRouteKey]
      const childParamName = childPrefetch.name
      const childParamType = childPrefetch.paramType
      const childServerSentParamKey = childPrefetch.paramKey

      let childDoesAppearInURL: boolean
      let childParam: RouteParam | null = null
      let childSegment: FlightRouterStateSegment
      if (childParamType !== null) {
        // This segment is parameterized. Get the param from the pathname.
        const childParamValue = parseDynamicParamFromURLPart(
          childParamType,
          pathnameParts,
          pathnamePartsIndex
        )

        // Assign a cache key to the segment, based on the param value. In the
        // pre-Segment Cache implementation, the server computes this and sends
        // it in the body of the response. In the Segment Cache implementation,
        // the server sends an empty string and we fill it in here.

        // TODO: We're intentionally not adding the search param to page
        // segments here; it's tracked separately and added back during a read.
        // This would clearer if we waited to construct the segment until it's
        // read from the cache, since that's effectively what we're
        // doing anyway.
        const renderedSearch = '' as NormalizedSearch
        const childParamKey =
          // The server omits this field from the prefetch response when
          // cacheComponents is enabled.
          childServerSentParamKey !== null
            ? childServerSentParamKey
            : // If no param key was sent, use the value parsed on the client.
              getCacheKeyForDynamicParam(childParamValue, renderedSearch)

        childParam = {
          name: childParamName,
          value: childParamValue,
          type: childParamType,
        }
        childSegment = [childParamName, childParamKey, childParamType]
        childDoesAppearInURL = true
      } else {
        childSegment = childParamName
        childDoesAppearInURL = doesStaticSegmentAppearInURL(childParamName)
      }

      // Only increment the index if the segment appears in the URL. If it's a
      // "virtual" segment, like a route group, it remains the same.
      const childPathnamePartsIndex = childDoesAppearInURL
        ? pathnamePartsIndex + 1
        : pathnamePartsIndex

      const childRequestKeyPart = createSegmentRequestKeyPart(childSegment)
      const childRequestKey = appendSegmentRequestKeyPart(
        requestKey,
        parallelRouteKey,
        childRequestKeyPart
      )
      const childCacheKey = appendSegmentCacheKeyPart(
        cacheKey,
        parallelRouteKey,
        createSegmentCacheKeyPart(childRequestKeyPart, childSegment)
      )
      slots[parallelRouteKey] = convertTreePrefetchToRouteTree(
        childPrefetch,
        childSegment,
        childParam,
        childRequestKey,
        childCacheKey,
        pathnameParts,
        childPathnamePartsIndex
      )
    }
  }

  return {
    cacheKey,
    requestKey,
    segment,
    param,
    slots,
    isRootLayout: prefetch.isRootLayout,
    // This field is only relevant to dynamic routes. For a PPR/static route,
    // there's always some partial loading state we can fetch.
    hasLoadingBoundary: HasLoadingBoundary.SegmentHasLoadingBoundary,
    hasRuntimePrefetch: prefetch.hasRuntimePrefetch,
  }
}

function convertRootFlightRouterStateToRouteTree(
  flightRouterState: FlightRouterState
): RouteTree {
  return convertFlightRouterStateToRouteTree(
    flightRouterState,
    ROOT_SEGMENT_CACHE_KEY,
    ROOT_SEGMENT_REQUEST_KEY
  )
}

function convertFlightRouterStateToRouteTree(
  flightRouterState: FlightRouterState,
  cacheKey: SegmentCacheKey,
  requestKey: SegmentRequestKey
): RouteTree {
  let slots: { [parallelRouteKey: string]: RouteTree } | null = null

  const parallelRoutes = flightRouterState[1]
  for (let parallelRouteKey in parallelRoutes) {
    const childRouterState = parallelRoutes[parallelRouteKey]
    const childSegment = childRouterState[0]
    // TODO: Eventually, the param values will not be included in the response
    // from the server. We'll instead fill them in on the client by parsing
    // the URL. This is where we'll do that.
    const childRequestKeyPart = createSegmentRequestKeyPart(childSegment)
    const childRequestKey = appendSegmentRequestKeyPart(
      requestKey,
      parallelRouteKey,
      childRequestKeyPart
    )
    const childCacheKey = appendSegmentCacheKeyPart(
      cacheKey,
      parallelRouteKey,
      createSegmentCacheKeyPart(childRequestKeyPart, childSegment)
    )
    const childTree = convertFlightRouterStateToRouteTree(
      childRouterState,
      childCacheKey,
      childRequestKey
    )
    if (slots === null) {
      slots = {
        [parallelRouteKey]: childTree,
      }
    } else {
      slots[parallelRouteKey] = childTree
    }
  }
  const originalSegment = flightRouterState[0]

  let segment: FlightRouterStateSegment
  let param: RouteParam | null = null
  if (Array.isArray(originalSegment)) {
    const paramCacheKey = originalSegment[1]
    const paramType = originalSegment[2]
    const paramValue = getParamValueFromCacheKey(paramCacheKey, paramType)
    param = {
      name: originalSegment[0],
      value: paramValue === undefined ? null : paramValue,
      type: originalSegment[2] as DynamicParamTypesShort,
    }
    segment = originalSegment
  } else {
    // The navigation implementation expects the search params to be included
    // in the segment. However, in the case of a static response, the search
    // params are omitted. So the client needs to add them back in when reading
    // from the Segment Cache.
    //
    // For consistency, we'll do this for dynamic responses, too.
    //
    // TODO: We should move search params out of FlightRouterState and handle
    // them entirely on the client, similar to our plan for dynamic params.
    segment =
      typeof originalSegment === 'string' &&
      originalSegment.startsWith(PAGE_SEGMENT_KEY)
        ? PAGE_SEGMENT_KEY
        : originalSegment
  }

  return {
    cacheKey,
    requestKey,
    segment,
    param,
    slots,
    isRootLayout: flightRouterState[4] === true,
    hasLoadingBoundary:
      flightRouterState[5] !== undefined
        ? flightRouterState[5]
        : HasLoadingBoundary.SubtreeHasNoLoadingBoundary,

    // Non-static tree responses are only used by apps that haven't adopted
    // Cache Components. So this is always false.
    hasRuntimePrefetch: false,
  }
}

export function convertRouteTreeToFlightRouterState(
  routeTree: RouteTree
): FlightRouterState {
  const parallelRoutes: Record<string, FlightRouterState> = {}
  if (routeTree.slots !== null) {
    for (const parallelRouteKey in routeTree.slots) {
      parallelRoutes[parallelRouteKey] = convertRouteTreeToFlightRouterState(
        routeTree.slots[parallelRouteKey]
      )
    }
  }
  const flightRouterState: FlightRouterState = [
    routeTree.segment,
    parallelRoutes,
    null,
    null,
    routeTree.isRootLayout,
  ]
  return flightRouterState
}

export async function fetchRouteOnCacheMiss(
  entry: PendingRouteCacheEntry,
  task: PrefetchTask,
  key: RouteCacheKey
): Promise<PrefetchSubtaskResult<null> | null> {
  // This function is allowed to use async/await because it contains the actual
  // fetch that gets issued on a cache miss. Notice it writes the result to the
  // cache entry directly, rather than return data that is then written by
  // the caller.
  const href = key.href
  const nextUrl = key.nextUrl
  const segmentPath = '/_tree' as SegmentRequestKey

  const headers: RequestHeaders = {
    [RSC_HEADER]: '1',
    [NEXT_ROUTER_PREFETCH_HEADER]: '1',
    [NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]: segmentPath,
  }
  if (nextUrl !== null) {
    headers[NEXT_URL] = nextUrl
  }

  try {
    let response
    let urlAfterRedirects
    if (isOutputExportMode) {
      // In output: "export" mode, we can't use headers to request a particular
      // segment. Instead, we encode the extra request information into the URL.
      // This is not part of the "public" interface of the app; it's an internal
      // Next.js implementation detail that the app developer should not need to
      // concern themselves with.
      //
      // For example, to request a segment:
      //
      //   Path passed to <Link>:   /path/to/page
      //   Path passed to fetch:    /path/to/page/__next-segments/_tree
      //
      //   (This is not the exact protocol, just an illustration.)
      //
      // Before we do that, though, we need to account for redirects. Even in
      // output: "export" mode, a proxy might redirect the page to a different
      // location, but we shouldn't assume or expect that they also redirect all
      // the segment files, too.
      //
      // To check whether the page is redirected, we perform a range request of
      // the first N bytes of the HTML document. The canonical URL is determined
      // from the response.
      //
      // Then we can use the canonical URL to request the route tree.
      //
      // NOTE: We could embed the route tree into the HTML document, to avoid
      // a second request. We're not doing that currently because it would make
      // the HTML document larger and affect normal page loads.
      const url = new URL(href)
      const htmlResponse = await fetch(href, {
        headers: {
          Range: DOC_PREFETCH_RANGE_HEADER_VALUE,
        },
      })
      const partialHtml = await htmlResponse.text()
      if (!doesExportedHtmlMatchBuildId(partialHtml, getAppBuildId())) {
        // The target page is not part of this app, or it belongs to a
        // different build.
        rejectRouteCacheEntry(entry, Date.now() + 10 * 1000)
        return null
      }
      urlAfterRedirects = htmlResponse.redirected
        ? new URL(htmlResponse.url)
        : url
      response = await fetchPrefetchResponse(
        addSegmentPathToUrlInOutputExportMode(urlAfterRedirects, segmentPath),
        headers
      )
    } else {
      // "Server" mode. We can use request headers instead of the pathname.
      // TODO: The eventual plan is to get rid of our custom request headers and
      // encode everything into the URL, using a similar strategy to the
      // "output: export" block above.
      const url = new URL(href)
      response = await fetchPrefetchResponse(url, headers)
      urlAfterRedirects =
        response !== null && response.redirected ? new URL(response.url) : url
    }

    if (
      !response ||
      !response.ok ||
      // 204 is a Cache miss. Though theoretically this shouldn't happen when
      // PPR is enabled, because we always respond to route tree requests, even
      // if it needs to be blockingly generated on demand.
      response.status === 204 ||
      !response.body
    ) {
      // Server responded with an error, or with a miss. We should still cache
      // the response, but we can try again after 10 seconds.
      rejectRouteCacheEntry(entry, Date.now() + 10 * 1000)
      return null
    }

    // TODO: The canonical URL is the href without the origin. I think
    // historically the reason for this is because the initial canonical URL
    // gets passed as a prop to the top-level React component, which means it
    // needs to be computed during SSR. If it were to include the origin, it
    // would need to always be same as location.origin on the client, to prevent
    // a hydration mismatch. To sidestep this complexity, we omit the origin.
    //
    // However, since this is neither a native URL object nor a fully qualified
    // URL string, we need to be careful about how we use it. To prevent subtle
    // mistakes, we should create a special type for it, instead of just string.
    // Or, we should just use a (readonly) URL object instead. The type of the
    // prop that we pass to seed the initial state does not need to be the same
    // type as the state itself.
    const canonicalUrl = createHrefFromUrl(urlAfterRedirects)

    // Check whether the response varies based on the Next-Url header.
    const varyHeader = response.headers.get('vary')
    const couldBeIntercepted =
      varyHeader !== null && varyHeader.includes(NEXT_URL)

    // Track when the network connection closes.
    const closed = createPromiseWithResolvers<void>()

    // This checks whether the response was served from the per-segment cache,
    // rather than the old prefetching flow. If it fails, it implies that PPR
    // is disabled on this route.
    const routeIsPPREnabled =
      response.headers.get(NEXT_DID_POSTPONE_HEADER) === '2' ||
      // In output: "export" mode, we can't rely on response headers. But if we
      // receive a well-formed response, we can assume it's a static response,
      // because all data is static in this mode.
      isOutputExportMode

    // Regardless of the type of response, we will never receive dynamic
    // metadata as part of this prefetch request.
    const isHeadDynamic = false

    if (routeIsPPREnabled) {
      const prefetchStream = createPrefetchResponseStream(
        response.body,
        closed.resolve,
        function onResponseSizeUpdate(size) {
          routeCacheLru.updateSize(entry, size)
        }
      )
      const serverData = await createFromNextReadableStream<RootTreePrefetch>(
        prefetchStream,
        headers
      )
      if (serverData.buildId !== getAppBuildId()) {
        // The server build does not match the client. Treat as a 404. During
        // an actual navigation, the router will trigger an MPA navigation.
        // TODO: Consider moving the build ID to a response header so we can check
        // it before decoding the response, and so there's one way of checking
        // across all response types.
        // TODO: We should cache the fact that this is an MPA navigation.
        rejectRouteCacheEntry(entry, Date.now() + 10 * 1000)
        return null
      }

      // Get the params that were used to render the target page. These may
      // be different from the params in the request URL, if the page
      // was rewritten.
      const renderedPathname = getRenderedPathname(response)
      const renderedSearch = getRenderedSearch(response)

      const routeTree = convertRootTreePrefetchToRouteTree(
        serverData,
        renderedPathname
      )

      const staleTimeMs = getStaleTimeMs(serverData.staleTime)
      fulfillRouteCacheEntry(
        entry,
        routeTree,
        serverData.head,
        serverData.isHeadPartial,
        Date.now() + staleTimeMs,
        couldBeIntercepted,
        canonicalUrl,
        renderedSearch,
        routeIsPPREnabled,
        isHeadDynamic
      )
    } else {
      // PPR is not enabled for this route. The server responds with a
      // different format (FlightRouterState) that we need to convert.
      // TODO: We will unify the responses eventually. I'm keeping the types
      // separate for now because FlightRouterState has so many
      // overloaded concerns.
      const prefetchStream = createPrefetchResponseStream(
        response.body,
        closed.resolve,
        function onResponseSizeUpdate(size) {
          routeCacheLru.updateSize(entry, size)
        }
      )
      const serverData =
        await createFromNextReadableStream<NavigationFlightResponse>(
          prefetchStream,
          headers
        )
      if (serverData.b !== getAppBuildId()) {
        // The server build does not match the client. Treat as a 404. During
        // an actual navigation, the router will trigger an MPA navigation.
        // TODO: Consider moving the build ID to a response header so we can check
        // it before decoding the response, and so there's one way of checking
        // across all response types.
        // TODO: We should cache the fact that this is an MPA navigation.
        rejectRouteCacheEntry(entry, Date.now() + 10 * 1000)
        return null
      }

      writeDynamicTreeResponseIntoCache(
        Date.now(),
        task,
        // The non-PPR response format is what we'd get if we prefetched these segments
        // using the LoadingBoundary fetch strategy, so mark their cache entries accordingly.
        FetchStrategy.LoadingBoundary,
        response as RSCResponse<NavigationFlightResponse>,
        serverData,
        entry,
        couldBeIntercepted,
        canonicalUrl,
        routeIsPPREnabled
      )
    }

    if (!couldBeIntercepted && nextUrl !== null) {
      // This route will never be intercepted. So we can use this entry for all
      // requests to this route, regardless of the Next-Url header. This works
      // because when reading the cache we always check for a valid
      // non-intercepted entry first.
      //
      // Re-key the entry. Since we're in an async task, we must first confirm
      // that the entry hasn't been concurrently modified by a different task.
      const currentKeypath: Prefix<RouteCacheKeypath> = [href, nextUrl]
      const expectedEntry = routeCacheMap.get(currentKeypath)
      if (expectedEntry === entry) {
        routeCacheMap.delete(currentKeypath)
        const newKeypath: Prefix<RouteCacheKeypath> = [href]
        routeCacheMap.set(newKeypath, entry)
        // We don't need to update the LRU because the entry is already in it.
        // But since we changed the keypath, we do need to update that, so we
        // know how to remove it from the map if it gets evicted from the LRU.
        entry.keypath = newKeypath
      } else {
        // Something else modified this entry already. Since the re-keying is
        // just a performance optimization, we can safely skip it.
      }
    }
    // Return a promise that resolves when the network connection closes, so
    // the scheduler can track the number of concurrent network connections.
    return { value: null, closed: closed.promise }
  } catch (error) {
    // Either the connection itself failed, or something bad happened while
    // decoding the response.
    rejectRouteCacheEntry(entry, Date.now() + 10 * 1000)
    return null
  }
}

export async function fetchSegmentOnCacheMiss(
  route: FulfilledRouteCacheEntry,
  segmentCacheEntry: PendingSegmentCacheEntry,
  routeKey: RouteCacheKey,
  tree: RouteTree
): Promise<PrefetchSubtaskResult<FulfilledSegmentCacheEntry> | null> {
  // This function is allowed to use async/await because it contains the actual
  // fetch that gets issued on a cache miss. Notice it writes the result to the
  // cache entry directly, rather than return data that is then written by
  // the caller.
  //
  // Segment fetches are non-blocking so we don't need to ping the scheduler
  // on completion.

  // Use the canonical URL to request the segment, not the original URL. These
  // are usually the same, but the canonical URL will be different if the route
  // tree response was redirected. To avoid an extra waterfall on every segment
  // request, we pass the redirected URL instead of the original one.
  const url = new URL(route.canonicalUrl, routeKey.href)
  const nextUrl = routeKey.nextUrl

  const requestKey = tree.requestKey
  const normalizedRequestKey =
    requestKey === ROOT_SEGMENT_REQUEST_KEY
      ? // The root segment is a special case. To simplify the server-side
        // handling of these requests, we encode the root segment path as
        // `_index` instead of as an empty string. This should be treated as
        // an implementation detail and not as a stable part of the protocol.
        // It just needs to match the equivalent logic that happens when
        // prerendering the responses. It should not leak outside of Next.js.
        ('/_index' as SegmentRequestKey)
      : requestKey

  const headers: RequestHeaders = {
    [RSC_HEADER]: '1',
    [NEXT_ROUTER_PREFETCH_HEADER]: '1',
    [NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]: normalizedRequestKey,
  }
  if (nextUrl !== null) {
    headers[NEXT_URL] = nextUrl
  }

  const requestUrl = isOutputExportMode
    ? // In output: "export" mode, we need to add the segment path to the URL.
      addSegmentPathToUrlInOutputExportMode(url, normalizedRequestKey)
    : url
  try {
    const response = await fetchPrefetchResponse(requestUrl, headers)
    if (
      !response ||
      !response.ok ||
      response.status === 204 || // Cache miss
      // This checks whether the response was served from the per-segment cache,
      // rather than the old prefetching flow. If it fails, it implies that PPR
      // is disabled on this route. Theoretically this should never happen
      // because we only issue requests for segments once we've verified that
      // the route supports PPR.
      (response.headers.get(NEXT_DID_POSTPONE_HEADER) !== '2' &&
        // In output: "export" mode, we can't rely on response headers. But if
        // we receive a well-formed response, we can assume it's a static
        // response, because all data is static in this mode.
        !isOutputExportMode) ||
      !response.body
    ) {
      // Server responded with an error, or with a miss. We should still cache
      // the response, but we can try again after 10 seconds.
      rejectSegmentCacheEntry(segmentCacheEntry, Date.now() + 10 * 1000)
      return null
    }

    // Track when the network connection closes.
    const closed = createPromiseWithResolvers<void>()

    // Wrap the original stream in a new stream that never closes. That way the
    // Flight client doesn't error if there's a hanging promise.
    const prefetchStream = createPrefetchResponseStream(
      response.body,
      closed.resolve,
      function onResponseSizeUpdate(size) {
        segmentCacheLru.updateSize(segmentCacheEntry, size)
      }
    )
    const serverData = await (createFromNextReadableStream(
      prefetchStream,
      headers
    ) as Promise<SegmentPrefetch>)
    if (serverData.buildId !== getAppBuildId()) {
      // The server build does not match the client. Treat as a 404. During
      // an actual navigation, the router will trigger an MPA navigation.
      // TODO: Consider moving the build ID to a response header so we can check
      // it before decoding the response, and so there's one way of checking
      // across all response types.
      rejectSegmentCacheEntry(segmentCacheEntry, Date.now() + 10 * 1000)
      return null
    }
    return {
      value: fulfillSegmentCacheEntry(
        segmentCacheEntry,
        serverData.rsc,
        serverData.loading,
        // TODO: The server does not currently provide per-segment stale time.
        // So we use the stale time of the route.
        route.staleAt,
        serverData.isPartial
      ),
      // Return a promise that resolves when the network connection closes, so
      // the scheduler can track the number of concurrent network connections.
      closed: closed.promise,
    }
  } catch (error) {
    // Either the connection itself failed, or something bad happened while
    // decoding the response.
    rejectSegmentCacheEntry(segmentCacheEntry, Date.now() + 10 * 1000)
    return null
  }
}

export async function fetchSegmentPrefetchesUsingDynamicRequest(
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  fetchStrategy:
    | FetchStrategy.LoadingBoundary
    | FetchStrategy.PPRRuntime
    | FetchStrategy.Full,
  dynamicRequestTree: FlightRouterState,
  spawnedEntries: Map<SegmentCacheKey, PendingSegmentCacheEntry>
): Promise<PrefetchSubtaskResult<null> | null> {
  const url = new URL(route.canonicalUrl, task.key.href)
  const nextUrl = task.key.nextUrl
  const headers: RequestHeaders = {
    [RSC_HEADER]: '1',
    [NEXT_ROUTER_STATE_TREE_HEADER]:
      prepareFlightRouterStateForRequest(dynamicRequestTree),
  }
  if (nextUrl !== null) {
    headers[NEXT_URL] = nextUrl
  }
  switch (fetchStrategy) {
    case FetchStrategy.Full: {
      // We omit the prefetch header from a full prefetch because it's essentially
      // just a navigation request that happens ahead of time — it should include
      // all the same data in the response.
      break
    }
    case FetchStrategy.PPRRuntime: {
      headers[NEXT_ROUTER_PREFETCH_HEADER] = '2'
      break
    }
    case FetchStrategy.LoadingBoundary: {
      headers[NEXT_ROUTER_PREFETCH_HEADER] = '1'
      break
    }
    default: {
      fetchStrategy satisfies never
    }
  }

  try {
    const response = await fetchPrefetchResponse(url, headers)
    if (!response || !response.ok || !response.body) {
      // Server responded with an error, or with a miss. We should still cache
      // the response, but we can try again after 10 seconds.
      rejectSegmentEntriesIfStillPending(spawnedEntries, Date.now() + 10 * 1000)
      return null
    }

    const renderedSearch = getRenderedSearch(response)
    if (renderedSearch !== route.renderedSearch) {
      // The search params that were used to render the target page are
      // different from the search params in the request URL. This only happens
      // when there's a dynamic rewrite in between the tree prefetch and the
      // data prefetch.
      // TODO: For now, since this is an edge case, we reject the prefetch, but
      // the proper way to handle this is to evict the stale route tree entry
      // then fill the cache with the new response.
      rejectSegmentEntriesIfStillPending(spawnedEntries, Date.now() + 10 * 1000)
      return null
    }

    // Track when the network connection closes.
    const closed = createPromiseWithResolvers<void>()

    let fulfilledEntries: Array<FulfilledSegmentCacheEntry> | null = null
    const prefetchStream = createPrefetchResponseStream(
      response.body,
      closed.resolve,
      function onResponseSizeUpdate(totalBytesReceivedSoFar) {
        // When processing a dynamic response, we don't know how large each
        // individual segment is, so approximate by assiging each segment
        // the average of the total response size.
        if (fulfilledEntries === null) {
          // Haven't received enough data yet to know which segments
          // were included.
          return
        }
        const averageSize = totalBytesReceivedSoFar / fulfilledEntries.length
        for (const entry of fulfilledEntries) {
          segmentCacheLru.updateSize(entry, averageSize)
        }
      }
    )
    const serverData = await (createFromNextReadableStream(
      prefetchStream,
      headers
    ) as Promise<NavigationFlightResponse>)

    const isResponsePartial =
      fetchStrategy === FetchStrategy.PPRRuntime
        ? // A runtime prefetch may have holes.
          !!response.headers.get(NEXT_DID_POSTPONE_HEADER)
        : // Full and LoadingBoundary prefetches cannot have holes.
          // (even if we did set the prefetch header, we only use this codepath for non-PPR-enabled routes)
          false

    // Aside from writing the data into the cache, this function also returns
    // the entries that were fulfilled, so we can streamingly update their sizes
    // in the LRU as more data comes in.
    fulfilledEntries = writeDynamicRenderResponseIntoCache(
      Date.now(),
      task,
      fetchStrategy,
      response as RSCResponse<NavigationFlightResponse>,
      serverData,
      isResponsePartial,
      route,
      spawnedEntries
    )

    // Return a promise that resolves when the network connection closes, so
    // the scheduler can track the number of concurrent network connections.
    return { value: null, closed: closed.promise }
  } catch (error) {
    rejectSegmentEntriesIfStillPending(spawnedEntries, Date.now() + 10 * 1000)
    return null
  }
}

function writeDynamicTreeResponseIntoCache(
  now: number,
  task: PrefetchTask,
  fetchStrategy:
    | FetchStrategy.LoadingBoundary
    | FetchStrategy.PPRRuntime
    | FetchStrategy.Full,
  response: RSCResponse<NavigationFlightResponse>,
  serverData: NavigationFlightResponse,
  entry: PendingRouteCacheEntry,
  couldBeIntercepted: boolean,
  canonicalUrl: string,
  routeIsPPREnabled: boolean
) {
  // Get the URL that was used to render the target page. This may be different
  // from the URL in the request URL, if the page was rewritten.
  const renderedSearch = getRenderedSearch(response)

  const normalizedFlightDataResult = normalizeFlightData(serverData.f)
  if (
    // A string result means navigating to this route will result in an
    // MPA navigation.
    typeof normalizedFlightDataResult === 'string' ||
    normalizedFlightDataResult.length !== 1
  ) {
    rejectRouteCacheEntry(entry, now + 10 * 1000)
    return
  }
  const flightData = normalizedFlightDataResult[0]
  if (!flightData.isRootRender) {
    // Unexpected response format.
    rejectRouteCacheEntry(entry, now + 10 * 1000)
    return
  }

  const flightRouterState = flightData.tree
  // TODO: Extract to function
  const staleTimeHeaderSeconds = response.headers.get(
    NEXT_ROUTER_STALE_TIME_HEADER
  )
  const staleTimeMs =
    staleTimeHeaderSeconds !== null
      ? getStaleTimeMs(parseInt(staleTimeHeaderSeconds, 10))
      : STATIC_STALETIME_MS

  // If the response contains dynamic holes, then we must conservatively assume
  // that any individual segment might contain dynamic holes, and also the
  // head. If it did not contain dynamic holes, then we can assume every segment
  // and the head is completely static.
  const isResponsePartial =
    response.headers.get(NEXT_DID_POSTPONE_HEADER) === '1'

  // Since this is a dynamic response, we must conservatively assume that the
  // head responded with dynamic data.
  const isHeadDynamic = true

  const fulfilledEntry = fulfillRouteCacheEntry(
    entry,
    convertRootFlightRouterStateToRouteTree(flightRouterState),
    flightData.head,
    flightData.isHeadPartial,
    now + staleTimeMs,
    couldBeIntercepted,
    canonicalUrl,
    renderedSearch,
    routeIsPPREnabled,
    isHeadDynamic
  )

  // If the server sent segment data as part of the response, we should write
  // it into the cache to prevent a second, redundant prefetch request.
  //
  // TODO: When `clientSegmentCache` is enabled, the server does not include
  // segment data when responding to a route tree prefetch request. However,
  // when `clientSegmentCache` is set to "client-only", and PPR is enabled (or
  // the page is fully static), the normal check is bypassed and the server
  // responds with the full page. This is a temporary situation until we can
  // remove the "client-only" option. Then, we can delete this function call.
  writeDynamicRenderResponseIntoCache(
    now,
    task,
    fetchStrategy,
    response,
    serverData,
    isResponsePartial,
    fulfilledEntry,
    null
  )
}

function rejectSegmentEntriesIfStillPending(
  entries: Map<SegmentCacheKey, SegmentCacheEntry>,
  staleAt: number
): Array<FulfilledSegmentCacheEntry> {
  const fulfilledEntries = []
  for (const entry of entries.values()) {
    if (entry.status === EntryStatus.Pending) {
      rejectSegmentCacheEntry(entry, staleAt)
    } else if (entry.status === EntryStatus.Fulfilled) {
      fulfilledEntries.push(entry)
    }
  }
  return fulfilledEntries
}

function writeDynamicRenderResponseIntoCache(
  now: number,
  task: PrefetchTask,
  fetchStrategy:
    | FetchStrategy.LoadingBoundary
    | FetchStrategy.PPRRuntime
    | FetchStrategy.Full,
  response: RSCResponse<NavigationFlightResponse>,
  serverData: NavigationFlightResponse,
  isResponsePartial: boolean,
  route: FulfilledRouteCacheEntry,
  spawnedEntries: Map<SegmentCacheKey, PendingSegmentCacheEntry> | null
): Array<FulfilledSegmentCacheEntry> | null {
  if (serverData.b !== getAppBuildId()) {
    // The server build does not match the client. Treat as a 404. During
    // an actual navigation, the router will trigger an MPA navigation.
    // TODO: Consider moving the build ID to a response header so we can check
    // it before decoding the response, and so there's one way of checking
    // across all response types.
    if (spawnedEntries !== null) {
      rejectSegmentEntriesIfStillPending(spawnedEntries, now + 10 * 1000)
    }
    return null
  }

  const flightDatas = normalizeFlightData(serverData.f)
  if (typeof flightDatas === 'string') {
    // This means navigating to this route will result in an MPA navigation.
    // TODO: We should cache this, too, so that the MPA navigation is immediate.
    return null
  }

  const staleTimeHeaderSeconds = response.headers.get(
    NEXT_ROUTER_STALE_TIME_HEADER
  )
  const staleTimeMs =
    staleTimeHeaderSeconds !== null
      ? getStaleTimeMs(parseInt(staleTimeHeaderSeconds, 10))
      : STATIC_STALETIME_MS
  const staleAt = now + staleTimeMs

  for (const flightData of flightDatas) {
    const seedData = flightData.seedData
    if (seedData !== null) {
      // The data sent by the server represents only a subtree of the app. We
      // need to find the part of the task tree that matches the response.
      //
      // segmentPath represents the parent path of subtree. It's a repeating
      // pattern of parallel route key and segment:
      //
      //   [string, Segment, string, Segment, string, Segment, ...]
      const segmentPath = flightData.segmentPath
      let requestKey = ROOT_SEGMENT_REQUEST_KEY
      let cacheKey = ROOT_SEGMENT_CACHE_KEY
      for (let i = 0; i < segmentPath.length; i += 2) {
        const parallelRouteKey: string = segmentPath[i]
        const segment: FlightRouterStateSegment = segmentPath[i + 1]
        const requestKeyPart = createSegmentRequestKeyPart(segment)
        requestKey = appendSegmentRequestKeyPart(
          requestKey,
          parallelRouteKey,
          requestKeyPart
        )
        cacheKey = appendSegmentCacheKeyPart(
          cacheKey,
          parallelRouteKey,
          createSegmentCacheKeyPart(requestKeyPart, segment)
        )
      }

      writeSeedDataIntoCache(
        now,
        task,
        fetchStrategy,
        route,
        staleAt,
        flightData.tree,
        seedData,
        isResponsePartial,
        cacheKey,
        requestKey,
        spawnedEntries
      )
    }

    // During a dynamic request, the server sends back new head data for the
    // page. Overwrite the existing head with the new one. Note that we're
    // intentionally not taking into account whether the existing head is
    // already complete, even though the incoming head might not have finished
    // streaming in yet. This is to prioritize consistency of the head with
    // the segment data (though it's still not a guarantee, since some of the
    // segment data may be reused from a previous request).
    route.head = flightData.head
    route.isHeadPartial = flightData.isHeadPartial
    route.TODO_isHeadDynamic = true

    // TODO: Currently the stale time of the route tree represents the
    // stale time of both the route tree *and* all the segment data. So we
    // can't just overwrite this field; we have to use whichever value is
    // lower. In the future, though, the plan is to track segment lifetimes
    // separately from the route tree lifetime.
    if (staleAt < route.staleAt) {
      route.staleAt = staleAt
    }
  }
  // Any entry that's still pending was intentionally not rendered by the
  // server, because it was inside the loading boundary. Mark them as rejected
  // so we know not to fetch them again.
  // TODO: If PPR is enabled on some routes but not others, then it's possible
  // that a different page is able to do a per-segment prefetch of one of the
  // segments we're marking as rejected here. We should mark on the segment
  // somehow that the reason for the rejection is because of a non-PPR prefetch.
  // That way a per-segment prefetch knows to disregard the rejection.
  if (spawnedEntries !== null) {
    const fulfilledEntries = rejectSegmentEntriesIfStillPending(
      spawnedEntries,
      now + 10 * 1000
    )
    return fulfilledEntries
  }
  return null
}

function writeSeedDataIntoCache(
  now: number,
  task: PrefetchTask,
  fetchStrategy:
    | FetchStrategy.LoadingBoundary
    | FetchStrategy.PPRRuntime
    | FetchStrategy.Full,
  route: FulfilledRouteCacheEntry,
  staleAt: number,
  flightRouterState: FlightRouterState,
  seedData: CacheNodeSeedData,
  isResponsePartial: boolean,
  cacheKey: SegmentCacheKey,
  requestKey: SegmentRequestKey,
  entriesOwnedByCurrentTask: Map<
    SegmentCacheKey,
    PendingSegmentCacheEntry
  > | null
) {
  // This function is used to write the result of a dynamic server request
  // (CacheNodeSeedData) into the prefetch cache. It's used in cases where we
  // want to treat a dynamic response as if it were static. The two examples
  // where this happens are <Link prefetch={true}> (which implicitly opts
  // dynamic data into being static) and when prefetching a PPR-disabled route
  const rsc = seedData[0]
  const loading = seedData[2]
  const isPartial = rsc === null || isResponsePartial

  // We should only write into cache entries that are owned by us. Or create
  // a new one and write into that. We must never write over an entry that was
  // created by a different task, because that causes data races.
  const ownedEntry =
    entriesOwnedByCurrentTask !== null
      ? entriesOwnedByCurrentTask.get(cacheKey)
      : undefined
  if (ownedEntry !== undefined) {
    fulfillSegmentCacheEntry(ownedEntry, rsc, loading, staleAt, isPartial)
  } else {
    // There's no matching entry. Attempt to create a new one.
    const possiblyNewEntry = readOrCreateSegmentCacheEntry(
      now,
      fetchStrategy,
      route,
      cacheKey
    )
    if (possiblyNewEntry.status === EntryStatus.Empty) {
      // Confirmed this is a new entry. We can fulfill it.
      const newEntry = possiblyNewEntry
      fulfillSegmentCacheEntry(
        upgradeToPendingSegment(newEntry, fetchStrategy),
        rsc,
        loading,
        staleAt,
        isPartial
      )
    } else {
      // There was already an entry in the cache. But we may be able to
      // replace it with the new one from the server.
      const newEntry = fulfillSegmentCacheEntry(
        upgradeToPendingSegment(
          createDetachedSegmentCacheEntry(staleAt),
          fetchStrategy
        ),
        rsc,
        loading,
        staleAt,
        isPartial
      )
      upsertSegmentEntry(
        now,
        getSegmentKeypath(fetchStrategy, route, cacheKey),
        newEntry
      )
    }
  }
  // Recursively write the child data into the cache.
  const flightRouterStateChildren = flightRouterState[1]
  const seedDataChildren = seedData[1]
  for (const parallelRouteKey in flightRouterStateChildren) {
    const childFlightRouterState = flightRouterStateChildren[parallelRouteKey]
    const childSeedData: CacheNodeSeedData | null | void =
      seedDataChildren[parallelRouteKey]
    if (childSeedData !== null && childSeedData !== undefined) {
      const childSegment = childFlightRouterState[0]
      const childRequestKeyPart = createSegmentRequestKeyPart(childSegment)
      const childRequestKey = appendSegmentRequestKeyPart(
        requestKey,
        parallelRouteKey,
        childRequestKeyPart
      )
      const childCacheKey = appendSegmentCacheKeyPart(
        cacheKey,
        parallelRouteKey,
        createSegmentCacheKeyPart(childRequestKeyPart, childSegment)
      )
      writeSeedDataIntoCache(
        now,
        task,
        fetchStrategy,
        route,
        staleAt,
        childFlightRouterState,
        childSeedData,
        isResponsePartial,
        childCacheKey,
        childRequestKey,
        entriesOwnedByCurrentTask
      )
    }
  }
}

async function fetchPrefetchResponse<T>(
  url: URL,
  headers: RequestHeaders
): Promise<RSCResponse<T> | null> {
  const fetchPriority = 'low'
  // When issuing a prefetch request, don't immediately decode the response; we
  // use the lower level `createFromResponse` API instead because we need to do
  // some extra processing of the response stream. See
  // `createPrefetchResponseStream` for more details.
  const shouldImmediatelyDecode = false
  const response = await createFetch<T>(
    url,
    headers,
    fetchPriority,
    shouldImmediatelyDecode
  )
  if (!response.ok) {
    return null
  }

  // Check the content type
  if (isOutputExportMode) {
    // In output: "export" mode, we relaxed about the content type, since it's
    // not Next.js that's serving the response. If the status is OK, assume the
    // response is valid. If it's not a valid response, the Flight client won't
    // be able to decode it, and we'll treat it as a miss.
  } else {
    const contentType = response.headers.get('content-type')
    const isFlightResponse =
      contentType && contentType.startsWith(RSC_CONTENT_TYPE_HEADER)
    if (!isFlightResponse) {
      return null
    }
  }
  return response
}

function createPrefetchResponseStream(
  originalFlightStream: ReadableStream<Uint8Array>,
  onStreamClose: () => void,
  onResponseSizeUpdate: (size: number) => void
): ReadableStream<Uint8Array> {
  // When PPR is enabled, prefetch streams may contain references that never
  // resolve, because that's how we encode dynamic data access. In the decoded
  // object returned by the Flight client, these are reified into hanging
  // promises that suspend during render, which is effectively what we want.
  // The UI resolves when it switches to the dynamic data stream
  // (via useDeferredValue(dynamic, static)).
  //
  // However, the Flight implementation currently errors if the server closes
  // the response before all the references are resolved. As a cheat to work
  // around this, we wrap the original stream in a new stream that never closes,
  // and therefore doesn't error.
  //
  // While processing the original stream, we also incrementally update the size
  // of the cache entry in the LRU.
  let totalByteLength = 0
  const reader = originalFlightStream.getReader()
  return new ReadableStream({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read()
        if (!done) {
          // Pass to the target stream and keep consuming the Flight response
          // from the server.
          controller.enqueue(value)

          // Incrementally update the size of the cache entry in the LRU.
          // NOTE: Since prefetch responses are delivered in a single chunk,
          // it's not really necessary to do this streamingly, but I'm doing it
          // anyway in case this changes in the future.
          totalByteLength += value.byteLength
          onResponseSizeUpdate(totalByteLength)
          continue
        }
        // The server stream has closed. Exit, but intentionally do not close
        // the target stream. We do notify the caller, though.
        onStreamClose()
        return
      }
    },
  })
}

function addSegmentPathToUrlInOutputExportMode(
  url: URL,
  segmentPath: SegmentRequestKey
): URL {
  if (isOutputExportMode) {
    // In output: "export" mode, we cannot use a header to encode the segment
    // path. Instead, we append it to the end of the pathname.
    const staticUrl = new URL(url)
    const routeDir = staticUrl.pathname.endsWith('/')
      ? staticUrl.pathname.slice(0, -1)
      : staticUrl.pathname
    const staticExportFilename =
      convertSegmentPathToStaticExportFilename(segmentPath)
    staticUrl.pathname = `${routeDir}/${staticExportFilename}`
    return staticUrl
  }
  return url
}

/**
 * Checks whether the new fetch strategy is likely to provide more content than the old one.
 *
 * Generally, when an app uses dynamic data, a "more specific" fetch strategy is expected to provide more content:
 * - `LoadingBoundary` only provides static layouts
 * - `PPR` can provide shells for each segment (even for segments that use dynamic data)
 * - `PPRRuntime` can additionally include content that uses searchParams, params, or cookies
 * - `Full` includes all the content, even if it uses dynamic data
 *
 * However, it's possible that a more specific fetch strategy *won't* give us more content if:
 * - a segment is fully static
 *   (then, `PPR`/`PPRRuntime`/`Full` will all yield equivalent results)
 * - providing searchParams/params/cookies doesn't reveal any more content, e.g. because of an `await connection()`
 *   (then, `PPR` and `PPRRuntime` will yield equivalent results, only `Full` will give us more)
 * Because of this, when comparing two segments, we should also check if the existing segment is partial.
 * If it's not partial, then there's no need to prefetch it again, even using a "more specific" strategy.
 * There's currently no way to know if `PPRRuntime` will yield more data that `PPR`, so we have to assume it will.
 *
 * Also note that, in practice, we don't expect to be comparing `LoadingBoundary` to `PPR`/`PPRRuntime`,
 * because a non-PPR-enabled route wouldn't ever use the latter strategies. It might however use `Full`.
 */
export function canNewFetchStrategyProvideMoreContent(
  currentStrategy: FetchStrategy,
  newStrategy: FetchStrategy
): boolean {
  return currentStrategy < newStrategy
}
