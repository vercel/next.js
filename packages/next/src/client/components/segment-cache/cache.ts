import type {
  TreePrefetch,
  RootTreePrefetch,
  SegmentPrefetchResponse,
} from '../../../server/app-render/collect-segment-data'
import type {
  CacheNodeSeedData,
  FlightData,
  Segment as FlightRouterStateSegment,
} from '../../../shared/lib/app-router-types'
import { PrefetchHint } from '../../../shared/lib/app-router-types'
import {
  readVaryParams,
  type VaryParams,
  type VaryParamsIterable,
} from '../../../shared/lib/segment-cache/vary-params-decoding'
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
  resolveShellStageData,
  type RSCResponse,
  type RequestHeaders,
} from '../router-reducer/fetch-server-response'
import { fetch } from './fetch'
import {
  pingPrefetchTask,
  isPrefetchTaskDirty,
  type PrefetchTask,
  type PrefetchSubtaskResult,
} from './scheduler'
import {
  type RouteVaryPath,
  type SegmentVaryPath,
  type PartialSegmentVaryPath,
  getRouteVaryPath,
  getFulfilledRouteVaryPath,
  getFulfilledSegmentVaryPath,
  getSegmentVaryPathForRequest,
  getShellSegmentVaryPath,
  appendLayoutVaryPath,
  finalizeLayoutVaryPath,
  finalizePageVaryPath,
  clonePageVaryPathWithNewSearchParams,
  type PageVaryPath,
  type LayoutVaryPath,
  finalizeMetadataVaryPath,
  getPartialPageVaryPath,
  getPartialLayoutVaryPath,
  getRenderedSearchFromVaryPath,
} from './vary-path'
import { createHrefFromUrl } from '../router-reducer/create-href-from-url'
import type {
  NormalizedPathname,
  NormalizedSearch,
  NormalizedNextUrl,
  RouteCacheKey,
} from './cache-key'
import { createCacheKey as createPrefetchRequestKey } from './cache-key'
import {
  doesStaticSegmentAppearInURL,
  getCacheKeyForDynamicParam,
  getRenderedPathname,
  getRenderedSearch,
  parseDynamicParamFromURLPart,
} from '../../route-params'
import {
  createCacheMap,
  getFromCacheMap,
  setInCacheMap,
  setSizeInCacheMap,
  deleteFromCacheMap,
  isValueExpired,
  EntryStatus,
  type CacheMap,
  type UnknownMapEntry,
} from './cache-map'
export { EntryStatus } from './cache-map'
import {
  appendSegmentRequestKeyPart,
  convertSegmentPathToStaticExportFilename,
  createSegmentRequestKeyPart,
  HEAD_REQUEST_KEY,
  ROOT_SEGMENT_REQUEST_KEY,
  type SegmentRequestKey,
} from '../../../shared/lib/segment-cache/segment-value-encoding'
import type {
  FlightRouterState,
  NavigationFlightResponse,
} from '../../../shared/lib/app-router-types'
import {
  type NormalizedFlightData,
  normalizeFlightData,
  prepareFlightRouterStateForRequest,
} from '../../flight-data-helpers'
import { STATIC_STALETIME_MS } from '../router-reducer/reducers/navigate-reducer'
import { pingVisibleLinks } from '../links'
import { PAGE_SEGMENT_KEY } from '../../../shared/lib/segment'
import { FetchStrategy } from './types'
import { createPromiseWithResolvers } from '../../../shared/lib/promise-with-resolvers'
import { readFromBFCache, UnknownDynamicStaleTime } from './bfcache'
import { discoverKnownRoute, matchKnownRoute } from './optimistic-routes'
import { convertServerPatchToFullTree, type NavigationSeed } from './navigation'
import { getNavigationBuildId } from '../../navigation-build-id'
import { NEXT_NAV_DEPLOYMENT_ID_HEADER } from '../../../lib/constants'

/**
 * Ensures a minimum stale time of 30s to avoid issues where the server sends a too
 * short-lived stale time, which would prevent anything from being prefetched.
 */
export function getStaleTimeMs(staleTimeSeconds: number): number {
  return Math.max(staleTimeSeconds, 30) * 1000
}

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

type RouteTreeShared = {
  requestKey: SegmentRequestKey
  // TODO: Remove the `segment` field, now that it can be reconstructed
  // from `param`.
  segment: FlightRouterStateSegment
  // The vary path used to key this segment's App Shell entry: the segment's
  // vary path with every non-root param replaced with Fallback (see
  // getShellSegmentVaryPath). Precomputed once during tree construction so we
  // don't have to recompute it on every shell request.
  shellVaryPath: SegmentVaryPath
  refreshState: RefreshState | null
  slots: null | {
    [parallelRouteKey: string]: RouteTree
  }
  // Bitmask of PrefetchHint flags. Encodes route structure metadata:
  // root layout, loading boundaries, instant configs, and runtime prefetch
  // hints.
  prefetchHints: number
}

export type RefreshState = {
  canonicalUrl: string
  renderedSearch: NormalizedSearch
}

type LayoutRouteTree = RouteTreeShared & {
  isPage: false
  varyPath: LayoutVaryPath
}

type PageRouteTree = RouteTreeShared & {
  isPage: true
  varyPath: PageVaryPath
}

export type RouteTree = LayoutRouteTree | PageRouteTree

type RouteCacheEntryShared = {
  // This is false only if we're certain the route cannot be intercepted. It's
  // true in all other cases, including on initialization when we haven't yet
  // received a response from the server.
  couldBeIntercepted: boolean

  // Map-related fields.
  ref: UnknownMapEntry | null
  size: number
  staleAt: number
  version: number
}

export type PendingRouteCacheEntry = RouteCacheEntryShared & {
  status: EntryStatus.Empty | EntryStatus.Pending
  blockedTasks: Set<PrefetchTask> | null
  canonicalUrl: null
  renderedSearch: null
  tree: null
  metadata: null
  supportsPerSegmentPrefetching: false
}

type RejectedRouteCacheEntry = RouteCacheEntryShared & {
  status: EntryStatus.Rejected
  blockedTasks: Set<PrefetchTask> | null
  canonicalUrl: null
  renderedSearch: null
  tree: null
  metadata: null
  supportsPerSegmentPrefetching: boolean
}

export type FulfilledRouteCacheEntry = RouteCacheEntryShared & {
  status: EntryStatus.Fulfilled
  blockedTasks: null
  canonicalUrl: string
  renderedSearch: NormalizedSearch
  tree: RouteTree
  metadata: RouteTree
  supportsPerSegmentPrefetching: boolean
  // When true, this entry should not be used as a template for route
  // prediction. Set when we discover that the URL was rewritten by middleware
  // to a different route structure (e.g., /foo was rewritten to /bar). Since
  // rewrite behavior can vary by param value, we can't safely predict the
  // route structure for other URLs matching this pattern.
  hasDynamicRewrite: boolean
}

export type RouteCacheEntry =
  | PendingRouteCacheEntry
  | FulfilledRouteCacheEntry
  | RejectedRouteCacheEntry

type SegmentCacheEntryShared = {
  fetchStrategy: FetchStrategy

  /**
   * True if this entry was fulfilled from a fallback shell response (the page
   * had not yet been prerendered with concrete params). The scheduler uses
   * this to retry the static prefetch, since a more complete version may
   * become available once the server's background regeneration finishes.
   *
   * Distinct from `isPartial`: a fully-prerendered PPR page can have partial
   * segments that should NOT be retried. See `SegmentPrefetchResponse`.
   */
  isUpgradeableISRFallback: boolean

  // Map-related fields.
  ref: UnknownMapEntry | null
  size: number
  staleAt: number
  version: number
}

export type EmptySegmentCacheEntry = SegmentCacheEntryShared & {
  status: EntryStatus.Empty
  rsc: null
  isPartial: true
  promise: null
}

export type PendingSegmentCacheEntry = SegmentCacheEntryShared & {
  status: EntryStatus.Pending
  rsc: null
  isPartial: boolean
  promise: null | PromiseWithResolvers<FulfilledSegmentCacheEntry | null>
}

type RejectedSegmentCacheEntry = SegmentCacheEntryShared & {
  status: EntryStatus.Rejected
  rsc: null
  isPartial: true
  promise: null
}

export type FulfilledSegmentCacheEntry = SegmentCacheEntryShared & {
  status: EntryStatus.Fulfilled
  rsc: React.ReactNode | null
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

/**
 * A linked list of segment cache entries to fulfill from a single prefetch
 * response. The head is the requested segment; subsequent nodes are parent
 * segments whose data is bundled into the same response by the server.
 *
 * When segments are not bundled, the list has a single node. The list
 * maps 1:1 to the data array in the SegmentPrefetchResponse the server returns.
 */
export type SegmentBundle = {
  // Null when the segment has prefetching disabled (instant = false).
  // The bundle chain passes through it but no cache entry is created.
  tree: RouteTree | null
  entry: SegmentCacheEntry | null
  parent: SegmentBundle | null
}

const isOutputExportMode =
  process.env.NODE_ENV === 'production' &&
  process.env.__NEXT_CONFIG_OUTPUT === 'export'

export const MetadataOnlyRequestTree: FlightRouterState = [
  '',
  {},
  null,
  'metadata-only',
]

let routeCacheMap: CacheMap<RouteCacheEntry> = createCacheMap()
let segmentCacheMap: CacheMap<SegmentCacheEntry> = createCacheMap()

// All invalidation listeners for the whole cache are tracked in single set.
// Since we don't yet support tag or path-based invalidation, there's no point
// tracking them any more granularly than this. Once we add granular
// invalidation, that may change, though generally the model is to just notify
// the listeners and allow the caller to poll the prefetch cache with a new
// prefetch task if desired.
let invalidationListeners: Set<PrefetchTask> | null = null

// Incrementing counters used to track cache invalidations. Route and segment
// caches have separate versions so they can be invalidated independently.
// Invalidation does not eagerly evict anything from the cache; entries are
// lazily evicted when read.
let currentRouteCacheVersion = 0
let currentSegmentCacheVersion = 0

export function getCurrentRouteCacheVersion(): number {
  return currentRouteCacheVersion
}

export function getCurrentSegmentCacheVersion(): number {
  return currentSegmentCacheVersion
}

/**
 * Invalidates all prefetch cache entries (both route and segment caches).
 *
 * After invalidation, triggers re-prefetching of visible links and notifies
 * invalidation listeners.
 */
export function invalidateEntirePrefetchCache(
  nextUrl: string | null,
  tree: FlightRouterState
): void {
  currentRouteCacheVersion++
  currentSegmentCacheVersion++

  pingVisibleLinks(nextUrl, tree)
  pingInvalidationListeners(nextUrl, tree)
}

/**
 * Invalidates all route cache entries. Route entries contain the tree structure
 * (which segments exist at a given URL) but not the segment data itself.
 *
 * After invalidation, triggers re-prefetching of visible links and notifies
 * invalidation listeners.
 */
export function invalidateRouteCacheEntries(
  nextUrl: string | null,
  tree: FlightRouterState
): void {
  currentRouteCacheVersion++

  pingVisibleLinks(nextUrl, tree)
  pingInvalidationListeners(nextUrl, tree)
}

/**
 * Invalidates all segment cache entries. Segment entries contain the actual
 * RSC data for each segment.
 *
 * After invalidation, triggers re-prefetching of visible links and notifies
 * invalidation listeners.
 */
export function invalidateSegmentCacheEntries(
  nextUrl: string | null,
  tree: FlightRouterState
): void {
  currentSegmentCacheVersion++

  pingVisibleLinks(nextUrl, tree)
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

export function readRouteCacheEntry(
  now: number,
  key: RouteCacheKey
): RouteCacheEntry | null {
  const varyPath: RouteVaryPath = getRouteVaryPath(
    key.pathname,
    key.search,
    key.nextUrl
  )
  const isRevalidation = false
  const existingEntry = getFromCacheMap(
    now,
    getCurrentRouteCacheVersion(),
    routeCacheMap,
    varyPath,
    isRevalidation,
    false
  )
  if (existingEntry !== null) {
    return existingEntry
  }

  // No cache hit. Attempt to construct from template using the new
  // optimistic routing mechanism (pattern-based matching).
  if (process.env.__NEXT_OPTIMISTIC_ROUTING) {
    return matchKnownRoute(now, key.pathname, key.search)
  }

  return null
}

export function readSegmentCacheEntry(
  now: number,
  varyPath: SegmentVaryPath
): SegmentCacheEntry | null {
  const isRevalidation = false
  return getFromCacheMap(
    now,
    getCurrentSegmentCacheVersion(),
    segmentCacheMap,
    varyPath,
    isRevalidation,
    false
  )
}

/**
 * Like `readSegmentCacheEntry`, but prefers a Fulfilled entry over a
 * more-specific Pending or Rejected entry. Use this during a navigation, where
 * a less-specific shell entry (e.g. params -> Fallback) should be rendered
 * immediately rather than blocking on a more-specific Pending entry that may
 * still be in-flight.
 *
 * Performs up to two lookups:
 *  1. An `onlyMatchFulfilled` lookup that walks past Pending/Rejected entries
 *     at more-specific keypaths to find a Fulfilled fallback (e.g. a cached
 *     shell).
 *  2. If no Fulfilled entry is found, a regular lookup that returns the most
 *     specific match regardless of status.
 */
export function readSegmentCacheEntryForNavigation(
  now: number,
  varyPath: SegmentVaryPath
): SegmentCacheEntry | null {
  const isRevalidation = false
  const fulfilled = getFromCacheMap(
    now,
    getCurrentSegmentCacheVersion(),
    segmentCacheMap,
    varyPath,
    isRevalidation,
    true
  )
  if (fulfilled !== null) {
    return fulfilled
  }
  return getFromCacheMap(
    now,
    getCurrentSegmentCacheVersion(),
    segmentCacheMap,
    varyPath,
    isRevalidation,
    false
  )
}

function readRevalidatingSegmentCacheEntry(
  now: number,
  varyPath: SegmentVaryPath
): SegmentCacheEntry | null {
  const isRevalidation = true
  return getFromCacheMap(
    now,
    getCurrentSegmentCacheVersion(),
    segmentCacheMap,
    varyPath,
    isRevalidation,
    false
  )
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

function createDetachedRouteCacheEntry(): PendingRouteCacheEntry {
  return {
    canonicalUrl: null,
    status: EntryStatus.Empty,
    blockedTasks: null,
    tree: null,
    metadata: null,
    // This is initialized to true because we don't know yet whether the route
    // could be intercepted. It's only set to false once we receive a response
    // from the server.
    couldBeIntercepted: true,
    // Similarly, we don't yet know if the route supports PPR.
    supportsPerSegmentPrefetching: false,
    renderedSearch: null,

    // Map-related fields
    ref: null,
    size: 0,
    // Since this is an empty entry, there's no reason to ever evict it. It will
    // be updated when the data is populated.
    staleAt: Infinity,
    version: getCurrentRouteCacheVersion(),
  }
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
  const pendingEntry = createDetachedRouteCacheEntry()
  const varyPath: RouteVaryPath = getRouteVaryPath(
    key.pathname,
    key.search,
    key.nextUrl
  )
  const isRevalidation = false
  setInCacheMap(routeCacheMap, varyPath, pendingEntry, isRevalidation)
  return pendingEntry
}

// TODO: This function predates the new optimisticRouting feature and will be
// removed once optimisticRouting is stable. The new mechanism (matchKnownRoute)
// handles search param variations more robustly as part of the general route
// prediction system. This fallback remains for when optimisticRouting is
// disabled (staticChildren is null).
export function deprecated_requestOptimisticRouteCacheEntry(
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

  const optimisticRouteTree = deprecated_createOptimisticRouteTree(
    routeWithNoSearchParams.tree,
    optimisticRenderedSearch
  )
  const optimisticMetadataTree = deprecated_createOptimisticRouteTree(
    routeWithNoSearchParams.metadata,
    optimisticRenderedSearch
  )

  // Clone the base route tree, and override the relevant fields with our
  // optimistic values.
  const optimisticEntry: FulfilledRouteCacheEntry = {
    canonicalUrl: optimisticCanonicalUrl,

    status: EntryStatus.Fulfilled,
    // This isn't cloned because it's instance-specific
    blockedTasks: null,
    tree: optimisticRouteTree,
    metadata: optimisticMetadataTree,
    couldBeIntercepted: routeWithNoSearchParams.couldBeIntercepted,
    supportsPerSegmentPrefetching:
      routeWithNoSearchParams.supportsPerSegmentPrefetching,
    hasDynamicRewrite: routeWithNoSearchParams.hasDynamicRewrite,

    // Override the rendered search with the optimistic value.
    renderedSearch: optimisticRenderedSearch,

    // Map-related fields
    ref: null,
    size: 0,
    staleAt: routeWithNoSearchParams.staleAt,
    version: routeWithNoSearchParams.version,
  }

  // Do not insert this entry into the cache. It only exists so we can
  // perform the current navigation. Just return it to the caller.
  return optimisticEntry
}

function deprecated_createOptimisticRouteTree(
  tree: RouteTree,
  newRenderedSearch: NormalizedSearch
): RouteTree {
  // Create a new route tree that identical to the original one except for
  // the rendered search string, which is contained in the vary path.

  let clonedSlots: Record<string, RouteTree> | null = null
  const originalSlots = tree.slots
  if (originalSlots !== null) {
    clonedSlots = {}
    for (const parallelRouteKey in originalSlots) {
      const childTree = originalSlots[parallelRouteKey]
      clonedSlots[parallelRouteKey] = deprecated_createOptimisticRouteTree(
        childTree,
        newRenderedSearch
      )
    }
  }

  // We only need to clone the vary path if the route is a page.
  if (tree.isPage) {
    // The shell vary path Fallbacks search params, so it's unaffected by the
    // new rendered search and can be reused as-is.
    return {
      requestKey: tree.requestKey,
      segment: tree.segment,
      shellVaryPath: tree.shellVaryPath,
      refreshState: tree.refreshState,
      varyPath: clonePageVaryPathWithNewSearchParams(
        tree.varyPath,
        newRenderedSearch
      ),
      isPage: true,
      slots: clonedSlots,

      prefetchHints: tree.prefetchHints,
    }
  }

  return {
    requestKey: tree.requestKey,
    segment: tree.segment,
    shellVaryPath: tree.shellVaryPath,
    refreshState: tree.refreshState,
    varyPath: tree.varyPath,
    isPage: false,
    slots: clonedSlots,
    prefetchHints: tree.prefetchHints,
  }
}

/**
 * Checks if an entry for a segment exists in the cache. If so, it returns the
 * entry, If not, it adds an empty entry to the cache and returns it.
 */
export function readOrCreateSegmentCacheEntry(
  now: number,
  fetchStrategy: FetchStrategy,
  tree: RouteTree
): SegmentCacheEntry {
  const existingEntry = readSegmentCacheEntry(now, tree.varyPath)
  if (existingEntry !== null) {
    return existingEntry
  }
  // Create a pending entry and add it to the cache. The stale time is set to a
  // default value; the actual stale time will be set when the entry is
  // fulfilled with data from the server response.
  const varyPathForRequest = getSegmentVaryPathForRequest(fetchStrategy, tree)
  const pendingEntry = createDetachedSegmentCacheEntry(now)
  const isRevalidation = false
  setInCacheMap(
    segmentCacheMap,
    varyPathForRequest,
    pendingEntry,
    isRevalidation
  )
  return pendingEntry
}

export function readOrCreateRevalidatingSegmentEntry(
  now: number,
  fetchStrategy: FetchStrategy,
  tree: RouteTree
): SegmentCacheEntry {
  // This function is called when we've already confirmed that a particular
  // segment is cached, but we want to perform another request anyway in case it
  // returns more complete and/or fresher data than we already have. The logic
  // for deciding whether to replace the existing entry is handled elsewhere;
  // this function just handles retrieving a cache entry that we can use to
  // track the revalidation.
  //
  // The reason revalidations are stored in the cache is because we need to be
  // able to dedupe multiple revalidation requests. The reason they have to be
  // handled specially is because we shouldn't overwrite a "normal" entry if
  // one exists at the same keypath. So, for each internal cache location, there
  // is a special "revalidation" slot that is used solely for this purpose.
  //
  // You can think of it as if all the revalidation entries were stored in a
  // separate cache map from the canonical entries, and then transfered to the
  // canonical cache map once the request is complete — this isn't how it's
  // actually implemented, since it's more efficient to store them in the same
  // data structure as the normal entries, but that's how it's modeled
  // conceptually.

  // TODO: Once we implement Fallback behavior for params, where an entry is
  // re-keyed based on response information, we'll need to account for the
  // possibility that the keypath of the previous entry is more generic than
  // the keypath of the revalidating entry. In other words, the server could
  // return a less generic entry upon revalidation. For now, though, this isn't
  // a concern because the keypath is based solely on the prefetch strategy,
  // not on data contained in the response.
  const existingEntry = readRevalidatingSegmentCacheEntry(now, tree.varyPath)
  if (existingEntry !== null) {
    return existingEntry
  }
  // Create a pending entry and add it to the cache. The stale time is set to a
  // default value; the actual stale time will be set when the entry is
  // fulfilled with data from the server response.
  const varyPathForRequest = getSegmentVaryPathForRequest(fetchStrategy, tree)
  const pendingEntry = createDetachedSegmentCacheEntry(now)
  const isRevalidation = true
  setInCacheMap(
    segmentCacheMap,
    varyPathForRequest,
    pendingEntry,
    isRevalidation
  )
  return pendingEntry
}

export function overwriteRevalidatingSegmentCacheEntry(
  now: number,
  fetchStrategy: FetchStrategy,
  tree: RouteTree
) {
  // This function is called when we've already decided to replace an existing
  // revalidation entry. Create a new entry and write it into the cache,
  // overwriting the previous value. The stale time is set to a default value;
  // the actual stale time will be set when the entry is fulfilled with data
  // from the server response.
  const varyPathForRequest = getSegmentVaryPathForRequest(fetchStrategy, tree)
  const pendingEntry = createDetachedSegmentCacheEntry(now)
  const isRevalidation = true
  setInCacheMap(
    segmentCacheMap,
    varyPathForRequest,
    pendingEntry,
    isRevalidation
  )
  return pendingEntry
}

export function upsertSegmentEntry(
  now: number,
  varyPath: SegmentVaryPath,
  candidateEntry: SegmentCacheEntry
): SegmentCacheEntry | null {
  // We have a new entry that has not yet been inserted into the cache. Before
  // we do so, we need to confirm whether it takes precedence over the existing
  // entry (if one exists).
  // TODO: We should not upsert an entry if its key was invalidated in the time
  // since the request was made. We can do that by passing the "owner" entry to
  // this function and confirming it's the same as `existingEntry`.

  if (isValueExpired(now, getCurrentSegmentCacheVersion(), candidateEntry)) {
    // The entry is expired. We cannot upsert it.
    return null
  }

  const existingEntry = readSegmentCacheEntry(now, varyPath)
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
      // The existing entry supersedes the candidate. Leave the existing entry
      // in place and discard the candidate by not inserting it.
      //
      // We must not mutate the candidate here (e.g. downgrade it to Rejected or
      // null out its `rsc`). The caller does not transfer exclusive ownership
      // of it: it may already have been fulfilled, resolving its promise to a
      // waiter that holds the entry and reads `rsc` off it later. A navigation
      // seed is such a waiter, via `waitForSegmentCacheEntry`. Nulling `rsc`
      // after the fact resolves that read to `null`, so the waiter loses the
      // data it was about to render. Declining to insert it is enough: the
      // existing entry stays canonical, and the candidate keeps its valid (if
      // less complete) data for any waiter that already took it.
      return null
    }

    // Evict the existing entry from the cache.
    deleteFromCacheMap(existingEntry)
  }

  const isRevalidation = false
  setInCacheMap(segmentCacheMap, varyPath, candidateEntry, isRevalidation)
  return candidateEntry
}

export function createDetachedSegmentCacheEntry(
  now: number
): EmptySegmentCacheEntry {
  // Default stale time for pending segment cache entries. The actual stale time
  // is set when the entry is fulfilled with data from the server response.
  const staleAt = now + 30 * 1000
  const emptyEntry: EmptySegmentCacheEntry = {
    status: EntryStatus.Empty,
    // Default to assuming the fetch strategy will be PPR. This will be updated
    // when a fetch is actually initiated.
    fetchStrategy: FetchStrategy.PPR,
    rsc: null,
    isPartial: true,
    isUpgradeableISRFallback: false,
    promise: null,

    // Map-related fields
    ref: null,
    size: 0,
    staleAt,
    version: 0,
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

  if (fetchStrategy === FetchStrategy.Full) {
    // We can assume the response will contain the full segment data. Set this
    // to false so we know it's OK to omit this segment from any navigation
    // requests that may happen while the data is still pending.
    pendingEntry.isPartial = false
  }

  // Set the version here, since this is right before the request is initiated.
  // The next time the segment cache version is incremented, the entry will
  // effectively be evicted. This happens before initiating the request, rather
  // than when receiving the response, because it's guaranteed to happen
  // before the data is read on the server.
  pendingEntry.version = getCurrentSegmentCacheVersion()
  return pendingEntry
}

export function attemptToFulfillDynamicSegmentFromBFCache(
  now: number,
  segment: EmptySegmentCacheEntry,
  tree: RouteTree
): FulfilledSegmentCacheEntry | null {
  // Attempts to fulfill an empty segment cache entry using data from the
  // bfcache. This is only valid during a Full prefetch (i.e. one that includes
  // dynamic data), because the bfcache stores data from navigations which
  // always include dynamic data.

  // We always use the canonical vary path when checking the bfcache. This is
  // the same operation we'd use to access the cache during a
  // regular navigation.
  const varyPath = tree.varyPath

  // Read from the BFCache without expiring it (pass -1). We check freshness
  // ourselves using navigatedAt, because the BFCache's staleAt may have been
  // overridden by a per-page unstable_dynamicStaleTime and can't be used to
  // derive the original request time.
  const bfcacheEntry = readFromBFCache(varyPath)
  if (bfcacheEntry !== null) {
    // The stale time for dynamic prefetches (default: 5 mins) is different
    // from the stale time for regular navigations (default: 0 secs). Use
    // navigatedAt to compute the correct expiry for prefetch purposes.
    const dynamicPrefetchStaleAt =
      bfcacheEntry.navigatedAt + STATIC_STALETIME_MS
    if (now > dynamicPrefetchStaleAt) {
      return null
    }

    const pendingSegment = upgradeToPendingSegment(segment, FetchStrategy.Full)
    const isPartial = false
    return fulfillSegmentCacheEntry(
      pendingSegment,
      bfcacheEntry.rsc,
      dynamicPrefetchStaleAt,
      isPartial,
      // bfcache data is concrete, never an ISR fallback.
      false
    )
  }
  return null
}

/**
 * Attempts to replace an existing segment cache entry with data from the
 * bfcache. Unlike `attemptToFulfillDynamicSegmentFromBFCache` (which fills an
 * empty entry), this creates a new entry and upserts it, so it works even when
 * the segment is already fulfilled.
 */
export function attemptToUpgradeSegmentFromBFCache(
  now: number,
  tree: RouteTree
): FulfilledSegmentCacheEntry | null {
  const varyPath = tree.varyPath
  const bfcacheEntry = readFromBFCache(varyPath)
  if (bfcacheEntry !== null) {
    const dynamicPrefetchStaleAt =
      bfcacheEntry.navigatedAt + STATIC_STALETIME_MS
    if (now > dynamicPrefetchStaleAt) {
      return null
    }
    const pendingSegment = upgradeToPendingSegment(
      createDetachedSegmentCacheEntry(now),
      FetchStrategy.Full
    )
    const isPartial = false
    const newEntry = fulfillSegmentCacheEntry(
      pendingSegment,
      bfcacheEntry.rsc,
      dynamicPrefetchStaleAt,
      isPartial,
      // bfcache data is concrete, never an ISR fallback.
      false
    )
    const segmentVaryPath = getSegmentVaryPathForRequest(
      FetchStrategy.Full,
      tree
    )
    const upserted = upsertSegmentEntry(now, segmentVaryPath, newEntry)
    if (upserted !== null && upserted.status === EntryStatus.Fulfilled) {
      return upserted
    }
  }
  return null
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

export function createMetadataRouteTree(
  metadataVaryPath: PageVaryPath
): RouteTree {
  // The Head is not actually part of the route tree, but other than that, it's
  // fetched and cached like a segment. Some functions expect a RouteTree
  // object, so rather than fork the logic in all those places, we use this
  // "fake" one.
  const metadata: RouteTree = {
    requestKey: HEAD_REQUEST_KEY,
    segment: HEAD_REQUEST_KEY,
    shellVaryPath: getShellSegmentVaryPath(metadataVaryPath),
    refreshState: null,
    varyPath: metadataVaryPath,
    // The metadata isn't really a "page" (though it isn't really a "segment"
    // either) but for the purposes of how this field is used, it behaves like
    // one. If this logic ever gets more complex we can change this to an enum.
    isPage: true,
    slots: null,
    prefetchHints: 0,
  }
  return metadata
}

export function fulfillRouteCacheEntry(
  now: number,
  entry: PendingRouteCacheEntry,
  tree: RouteTree,
  metadataVaryPath: PageVaryPath,
  couldBeIntercepted: boolean,
  canonicalUrl: string,
  supportsPerSegmentPrefetching: boolean
): FulfilledRouteCacheEntry {
  // Get the rendered search from the vary path
  const renderedSearch =
    getRenderedSearchFromVaryPath(metadataVaryPath) ?? ('' as NormalizedSearch)
  const fulfilledEntry: FulfilledRouteCacheEntry = entry as any
  fulfilledEntry.status = EntryStatus.Fulfilled
  fulfilledEntry.tree = tree
  fulfilledEntry.metadata = createMetadataRouteTree(metadataVaryPath)
  // Route structure is essentially static — it only changes on deploy.
  // Always use the static stale time.
  // NOTE: An exception is rewrites/redirects in middleware or proxy, which can
  // change routes dynamically. We have other strategies for handling those.
  //
  // If the route tree has stale inlining hints (e.g. the initial RSC payload
  // for a build-time static page, generated before collectPrefetchHints ran),
  // immediately expire the entry so it gets re-fetched with correct hints.
  // The segment data itself is still valid — only the route tree (which
  // contains the hint bits) needs to be re-fetched.
  if (tree.prefetchHints & PrefetchHint.InliningHintsStale) {
    fulfilledEntry.staleAt = -1
  } else {
    fulfilledEntry.staleAt = now + STATIC_STALETIME_MS
  }
  fulfilledEntry.couldBeIntercepted = couldBeIntercepted
  fulfilledEntry.canonicalUrl = canonicalUrl
  fulfilledEntry.renderedSearch = renderedSearch
  fulfilledEntry.supportsPerSegmentPrefetching = supportsPerSegmentPrefetching
  fulfilledEntry.hasDynamicRewrite = false
  pingBlockedTasks(entry)
  return fulfilledEntry
}

export function writeRouteIntoCache(
  now: number,
  pathname: NormalizedPathname,
  search: NormalizedSearch,
  nextUrl: string | null,
  tree: RouteTree,
  metadataVaryPath: PageVaryPath,
  couldBeIntercepted: boolean,
  canonicalUrl: string,
  supportsPerSegmentPrefetching: boolean
): FulfilledRouteCacheEntry {
  const pendingEntry = createDetachedRouteCacheEntry()
  const fulfilledEntry = fulfillRouteCacheEntry(
    now,
    pendingEntry,
    tree,
    metadataVaryPath,
    couldBeIntercepted,
    canonicalUrl,
    supportsPerSegmentPrefetching
  )
  const varyPath = getFulfilledRouteVaryPath(
    pathname,
    search,
    nextUrl as NormalizedNextUrl | null,
    couldBeIntercepted
  )
  const isRevalidation = false
  setInCacheMap(routeCacheMap, varyPath, fulfilledEntry, isRevalidation)
  return fulfilledEntry
}

/**
 * Marks a route cache entry as having a dynamic rewrite. Called when we
 * discover that a route pattern has dynamic rewrite behavior - i.e., we used
 * an optimistic route tree for prediction, but the server responded with a
 * different rendered pathname.
 *
 * Once marked, attempts to use this entry as a template for prediction will
 * bail out to server resolution.
 */
export function markRouteEntryAsDynamicRewrite(
  entry: FulfilledRouteCacheEntry
): void {
  entry.hasDynamicRewrite = true
  // Note: The caller is responsible for also calling invalidateRouteCacheEntries
  // to invalidate other entries that may have been derived from this template
  // before we knew it had a dynamic rewrite.
}

function fulfillSegmentCacheEntry(
  segmentCacheEntry: PendingSegmentCacheEntry,
  rsc: React.ReactNode,
  staleAt: number,
  isPartial: boolean,
  // Only static (per-segment PPR) responses can be ISR fallbacks; all other
  // callers pass false. Always assigned (even when false) so that re-fulfilling
  // a previously-fallback entry with a concrete response clears the flag and
  // ends the retry loop.
  isUpgradeableISRFallback: boolean
): FulfilledSegmentCacheEntry {
  const fulfilledEntry: FulfilledSegmentCacheEntry = segmentCacheEntry as any
  fulfilledEntry.status = EntryStatus.Fulfilled
  fulfilledEntry.rsc = rsc
  fulfilledEntry.staleAt = staleAt
  fulfilledEntry.isPartial = isPartial
  fulfilledEntry.isUpgradeableISRFallback = isUpgradeableISRFallback
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

type RouteTreeAccumulator = {
  metadataVaryPath: PageVaryPath | null
}

function convertRootTreePrefetchToRouteTree(
  rootTree: RootTreePrefetch,
  renderedPathname: string,
  renderedSearch: NormalizedSearch,
  acc: RouteTreeAccumulator
) {
  // Remove trailing and leading slashes
  const pathnameParts = renderedPathname.split('/').filter((p) => p !== '')
  const index = 0
  const rootSegment = ROOT_SEGMENT_REQUEST_KEY
  return convertTreePrefetchToRouteTree(
    rootTree.tree,
    rootSegment,
    null,
    ROOT_SEGMENT_REQUEST_KEY,
    pathnameParts,
    index,
    renderedSearch,
    acc
  )
}

function convertTreePrefetchToRouteTree(
  prefetch: TreePrefetch,
  segment: FlightRouterStateSegment,
  partialVaryPath: PartialSegmentVaryPath | null,
  requestKey: SegmentRequestKey,
  pathnameParts: Array<string>,
  pathnamePartsIndex: number,
  renderedSearch: NormalizedSearch,
  acc: RouteTreeAccumulator
): RouteTree {
  // Converts the route tree sent by the server into the format used by the
  // cache. The cached version of the tree includes additional fields, such as a
  // cache key for each segment. Since this is frequently accessed, we compute
  // it once instead of on every access. This same cache key is also used to
  // request the segment from the server.

  let slots: { [parallelRouteKey: string]: RouteTree } | null = null
  let isPage: boolean
  let varyPath: SegmentVaryPath
  const prefetchSlots = prefetch.slots
  if (prefetchSlots !== null) {
    isPage = false
    varyPath = finalizeLayoutVaryPath(requestKey, partialVaryPath)

    slots = {}
    for (let parallelRouteKey in prefetchSlots) {
      const childPrefetch = prefetchSlots[parallelRouteKey]
      const childSegmentName = childPrefetch.name
      const childParam = childPrefetch.param

      let childDoesAppearInURL: boolean
      let childSegment: FlightRouterStateSegment
      let childPartialVaryPath: PartialSegmentVaryPath | null
      if (childParam !== null) {
        // This segment is parameterized. Get the param from the pathname.
        const childParamValue = parseDynamicParamFromURLPart(
          childParam.type,
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
        const childParamKey =
          // The server omits this field from the prefetch response when
          // cacheComponents is enabled.
          childParam.key !== null
            ? childParam.key
            : // If no param key was sent, use the value parsed on the client.
              getCacheKeyForDynamicParam(
                childParamValue,
                '' as NormalizedSearch
              )

        childPartialVaryPath = appendLayoutVaryPath(
          partialVaryPath,
          childParamKey,
          childSegmentName,
          // The child's param is a root param iff the child segment is at or
          // above the root layout, which the server marks directly.
          (childPrefetch.prefetchHints & PrefetchHint.IsRootLayoutOrAbove) !== 0
        )
        childSegment = [
          childSegmentName,
          childParamKey,
          childParam.type,
          childParam.siblings,
        ]
        childDoesAppearInURL = true
      } else {
        // This segment does not have a param. Inherit the partial vary path of
        // the parent.
        childPartialVaryPath = partialVaryPath
        childSegment = childSegmentName
        childDoesAppearInURL = doesStaticSegmentAppearInURL(childSegmentName)
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
      slots[parallelRouteKey] = convertTreePrefetchToRouteTree(
        childPrefetch,
        childSegment,
        childPartialVaryPath,
        childRequestKey,
        pathnameParts,
        childPathnamePartsIndex,
        renderedSearch,
        acc
      )
    }
  } else {
    if (requestKey.endsWith(PAGE_SEGMENT_KEY)) {
      // This is a page segment.
      isPage = true
      varyPath = finalizePageVaryPath(
        requestKey,
        renderedSearch,
        partialVaryPath
      )
      // The metadata "segment" is not part the route tree, but it has the same
      // conceptual params as a page segment. Write the vary path into the
      // accumulator object. If there are multiple parallel pages, we use the
      // first one. Which page we choose is arbitrary as long as it's
      // consistently the same one every time every time. See
      // finalizeMetadataVaryPath for more details.
      if (acc.metadataVaryPath === null) {
        acc.metadataVaryPath = finalizeMetadataVaryPath(
          requestKey,
          renderedSearch,
          partialVaryPath
        )
      }
    } else {
      // This is a layout segment.
      isPage = false
      varyPath = finalizeLayoutVaryPath(requestKey, partialVaryPath)
    }
  }

  return {
    requestKey,
    segment,
    shellVaryPath: getShellSegmentVaryPath(varyPath),
    refreshState: null,
    // TODO: Cheating the type system here a bit because TypeScript can't tell
    // that the type of isPage and varyPath are consistent. The fix would be to
    // create separate constructors and call the appropriate one from each of
    // the branches above. Just seems a bit overkill only for one field so I'll
    // leave it as-is for now. If isPage were wrong it would break the behavior
    // and we'd catch it quickly, anyway.
    varyPath: varyPath as any,
    isPage: isPage as boolean as any,
    slots,
    prefetchHints: prefetch.prefetchHints,
  }
}

export function convertRootFlightRouterStateToRouteTree(
  flightRouterState: FlightRouterState,
  renderedSearch: NormalizedSearch,
  acc: RouteTreeAccumulator
): RouteTree {
  return convertFlightRouterStateToRouteTree(
    flightRouterState,
    ROOT_SEGMENT_REQUEST_KEY,
    null,
    renderedSearch,
    acc
  )
}

export function convertReusedFlightRouterStateToRouteTree(
  parentRouteTree: RouteTree,
  parallelRouteKey: string,
  flightRouterState: FlightRouterState,
  renderedSearch: NormalizedSearch,
  acc: RouteTreeAccumulator
) {
  // Create a RouteTree for a FlightRouterState that was reused from an older
  // route. This happens during a navigation when a parallel route slot does not
  // match the target route; we reuse whatever slot was already active.

  // Unlike a FlightRouterState, the RouteTree type contains backreferences to
  // the parent segments. Append the vary path to the parent's vary path.
  const parentPartialVaryPath = parentRouteTree.isPage
    ? getPartialPageVaryPath(parentRouteTree.varyPath)
    : getPartialLayoutVaryPath(parentRouteTree.varyPath)
  const segment = flightRouterState[0]
  // And the request key.
  const parentRequestKey = parentRouteTree.requestKey
  const requestKeyPart = createSegmentRequestKeyPart(segment)
  const requestKey = appendSegmentRequestKeyPart(
    parentRequestKey,
    parallelRouteKey,
    requestKeyPart
  )
  return convertFlightRouterStateToRouteTree(
    flightRouterState,
    requestKey,
    parentPartialVaryPath,
    renderedSearch,
    acc
  )
}

function convertFlightRouterStateToRouteTree(
  flightRouterState: FlightRouterState,
  requestKey: SegmentRequestKey,
  parentPartialVaryPath: PartialSegmentVaryPath | null,
  parentRenderedSearch: NormalizedSearch,
  acc: RouteTreeAccumulator
): RouteTree {
  const originalSegment = flightRouterState[0]

  // This segment's param (if any) is a root param iff the segment is at or
  // above the root layout, which the server marks directly.
  const isRootParam =
    ((flightRouterState[4] ?? 0) & PrefetchHint.IsRootLayoutOrAbove) !== 0

  // If the FlightRouterState has a refresh state, then this segment is part of
  // an inactive parallel route. It has a different rendered search query than
  // the outer parent route. In order to construct the inactive route correctly,
  // we must restore the query that was originally used to render it.
  const compressedRefreshState = flightRouterState[2] ?? null
  const refreshState =
    compressedRefreshState !== null
      ? {
          canonicalUrl: compressedRefreshState[0] as string,
          renderedSearch: compressedRefreshState[1] as NormalizedSearch,
        }
      : null
  const renderedSearch =
    refreshState !== null ? refreshState.renderedSearch : parentRenderedSearch

  let segment: FlightRouterStateSegment
  let partialVaryPath: PartialSegmentVaryPath | null
  let isPage: boolean
  let varyPath: SegmentVaryPath
  if (Array.isArray(originalSegment)) {
    isPage = false
    const paramCacheKey = originalSegment[1]
    const paramName = originalSegment[0]
    partialVaryPath = appendLayoutVaryPath(
      parentPartialVaryPath,
      paramCacheKey,
      paramName,
      isRootParam
    )
    varyPath = finalizeLayoutVaryPath(requestKey, partialVaryPath)
    segment = originalSegment
  } else {
    // This segment does not have a param. Inherit the partial vary path of
    // the parent.
    partialVaryPath = parentPartialVaryPath
    if (requestKey.endsWith(PAGE_SEGMENT_KEY)) {
      // This is a page segment.
      isPage = true

      // The navigation implementation expects the search params to be included
      // in the segment. However, in the case of a static response, the search
      // params are omitted. So the client needs to add them back in when reading
      // from the Segment Cache.
      //
      // For consistency, we'll do this for dynamic responses, too.
      //
      // TODO: We should move search params out of FlightRouterState and handle
      // them entirely on the client, similar to our plan for dynamic params.
      segment = PAGE_SEGMENT_KEY
      varyPath = finalizePageVaryPath(
        requestKey,
        renderedSearch,
        partialVaryPath
      )
      // The metadata "segment" is not part the route tree, but it has the same
      // conceptual params as a page segment. Write the vary path into the
      // accumulator object. If there are multiple parallel pages, we use the
      // first one. Which page we choose is arbitrary as long as it's
      // consistently the same one every time every time. See
      // finalizeMetadataVaryPath for more details.
      if (acc.metadataVaryPath === null) {
        acc.metadataVaryPath = finalizeMetadataVaryPath(
          requestKey,
          renderedSearch,
          partialVaryPath
        )
      }
    } else {
      // This is a layout segment.
      isPage = false
      segment = originalSegment
      varyPath = finalizeLayoutVaryPath(requestKey, partialVaryPath)
    }
  }

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
    const childTree = convertFlightRouterStateToRouteTree(
      childRouterState,
      childRequestKey,
      partialVaryPath,
      renderedSearch,
      acc
    )
    if (slots === null) {
      slots = {
        [parallelRouteKey]: childTree,
      }
    } else {
      slots[parallelRouteKey] = childTree
    }
  }

  return {
    requestKey,
    segment,
    shellVaryPath: getShellSegmentVaryPath(varyPath),
    refreshState,
    // TODO: Cheating the type system here a bit because TypeScript can't tell
    // that the type of isPage and varyPath are consistent. The fix would be to
    // create separate constructors and call the appropriate one from each of
    // the branches above. Just seems a bit overkill only for one field so I'll
    // leave it as-is for now. If isPage were wrong it would break the behavior
    // and we'd catch it quickly, anyway.
    varyPath: varyPath as any,
    isPage: isPage as boolean as any,
    slots,
    prefetchHints: flightRouterState[4] ?? 0,
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
  ]
  if (routeTree.prefetchHints !== 0) {
    flightRouterState[4] = routeTree.prefetchHints
  }
  return flightRouterState
}

export async function fetchRouteOnCacheMiss(
  entry: PendingRouteCacheEntry,
  key: RouteCacheKey
): Promise<PrefetchSubtaskResult<null> | null> {
  // This function is allowed to use async/await because it contains the actual
  // fetch that gets issued on a cache miss. Notice it writes the result to the
  // cache entry directly, rather than return data that is then written by
  // the caller.
  const pathname = key.pathname
  const search = key.search
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
    const url = new URL(pathname + search, location.origin)
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
      // To check whether the page is redirected, previously we perform a range
      // request of 64 bytes of the HTML document to check if the target page
      // is part of this app (by checking if build id matches). Only if the target
      // page is part of this app do we determine the final canonical URL.
      //
      // However, as mentioned in https://github.com/vercel/next.js/pull/85903,
      // some popular static hosting providers (like Cloudflare Pages or Render.com)
      // do not support range requests, in the worst case, the entire HTML instead
      // of 64 bytes could be returned, which is wasteful.
      //
      // So instead, we drops the check for build id here, and simply perform
      // a HEAD request to rejects 1xx/4xx/5xx responses, and then determine the
      // final URL after redirects.
      //
      // NOTE: We could embed the route tree into the HTML document, to avoid
      // a second request. We're not doing that currently because it would make
      // the HTML document larger and affect normal page loads.
      const headResponse = await fetch(url, {
        method: 'HEAD',
      })
      if (headResponse.status < 200 || headResponse.status >= 400) {
        // The target page responded w/o a successful status code
        // Could be a WAF serving a 403, or a 5xx from a backend
        //
        // Note that we can't use headResponse.ok here, because
        // Response#ok returns `false` with 3xx responses.
        rejectRouteCacheEntry(entry, Date.now() + 10 * 1000)
        return null
      }

      urlAfterRedirects = headResponse.redirected
        ? new URL(headResponse.url)
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
      response = await fetchPrefetchResponse(url, headers)
      urlAfterRedirects =
        response !== null && response.redirected ? new URL(response.url) : url
    }

    if (!response || !response.ok || !response.body) {
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

    // TODO: The `closed` promise was originally used to track when a streaming
    // network connection closes, so the scheduler could limit concurrent
    // connections. Now that prefetch responses are buffered, `closed` is
    // resolved immediately after buffering — before the outer function even
    // returns. This mechanism is only still meaningful for dynamic (Full)
    // prefetches, which use incremental streaming. Consider removing the
    // `closed` plumbing for buffered prefetch paths.
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

    if (routeIsPPREnabled) {
      const { stream: prefetchStream, size: responseSize } =
        await createNonTaskyPrefetchResponseStream(response.body)
      closed.resolve()
      setSizeInCacheMap(entry, responseSize)
      const serverData = await createFromNextReadableStream<RootTreePrefetch>(
        prefetchStream,
        headers,
        { allowPartialStream: true }
      )

      if (
        (response.headers.get(NEXT_NAV_DEPLOYMENT_ID_HEADER) ??
          serverData.buildId) !== getNavigationBuildId()
      ) {
        // The server build does not match the client. Treat as a 404. During
        // an actual navigation, the router will trigger an MPA navigation.
        // TODO: We should cache the fact that this is an MPA navigation.
        rejectRouteCacheEntry(entry, Date.now() + 10 * 1000)
        return null
      }

      // Get the params that were used to render the target page. These may
      // be different from the params in the request URL, if the page
      // was rewritten.
      const renderedPathname = getRenderedPathname(response)
      const renderedSearch = getRenderedSearch(response)

      // Convert the server-sent data into the RouteTree format used by the
      // client cache.
      //
      // During this traversal, we accumulate additional data into this
      // "accumulator" object.
      const acc: RouteTreeAccumulator = { metadataVaryPath: null }
      const routeTree = convertRootTreePrefetchToRouteTree(
        serverData,
        renderedPathname,
        renderedSearch,
        acc
      )
      const metadataVaryPath = acc.metadataVaryPath
      if (metadataVaryPath === null) {
        rejectRouteCacheEntry(entry, Date.now() + 10 * 1000)
        return null
      }

      discoverKnownRoute(
        Date.now(),
        pathname,
        search,
        nextUrl,
        entry,
        routeTree,
        metadataVaryPath,
        couldBeIntercepted,
        canonicalUrl,
        routeIsPPREnabled,
        false // hasDynamicRewrite
      )
    } else {
      // PPR is not enabled for this route. The server responds with a
      // different format (FlightRouterState) that we need to convert.
      // TODO: We will unify the responses eventually. I'm keeping the types
      // separate for now because FlightRouterState has so many
      // overloaded concerns.
      const { stream: prefetchStream, size: responseSize } =
        await createNonTaskyPrefetchResponseStream(response.body)
      closed.resolve()
      setSizeInCacheMap(entry, responseSize)
      const serverData =
        await createFromNextReadableStream<NavigationFlightResponse>(
          prefetchStream,
          headers,
          { allowPartialStream: true }
        )

      if (
        (response.headers.get(NEXT_NAV_DEPLOYMENT_ID_HEADER) ??
          serverData.b) !== getNavigationBuildId()
      ) {
        // The server build does not match the client. Treat as a 404. During
        // an actual navigation, the router will trigger an MPA navigation.
        // TODO: We should cache the fact that this is an MPA navigation.
        rejectRouteCacheEntry(entry, Date.now() + 10 * 1000)
        return null
      }

      // Read head vary params synchronously (unioning in the response-level
      // root params). Individual segments carry their own iterables in
      // CacheNodeSeedData; the root iterable is threaded down so each segment
      // unions it too.
      const headVaryParams = readVaryParams(serverData.h, serverData.r)
      writeDynamicTreeResponseIntoCache(
        Date.now(),
        // The non-PPR response format is what we'd get if we prefetched these segments
        // using the LoadingBoundary fetch strategy, so mark their cache entries accordingly.
        FetchStrategy.LoadingBoundary,
        response as RSCResponse<NavigationFlightResponse>,
        serverData,
        entry,
        couldBeIntercepted,
        canonicalUrl,
        routeIsPPREnabled,
        headVaryParams,
        serverData.r ?? null,
        pathname,
        search,
        nextUrl
      )
    }

    if (!couldBeIntercepted) {
      // This route will never be intercepted. So we can use this entry for all
      // requests to this route, regardless of the Next-Url header. This works
      // because when reading the cache we always check for a valid
      // non-intercepted entry first.

      // Re-key the entry. The `set` implementation handles removing it from
      // its previous position in the cache. We don't need to do anything to
      // update the LRU, because the entry is already in it.
      // TODO: Treat this as an upsert — should check if an entry already
      // exists at the new keypath, and if so, whether we should keep that
      // one instead.
      const fulfilledVaryPath: RouteVaryPath = getFulfilledRouteVaryPath(
        pathname,
        search,
        nextUrl,
        couldBeIntercepted
      )
      const isRevalidation = false
      setInCacheMap(routeCacheMap, fulfilledVaryPath, entry, isRevalidation)
    }
    // Return a promise that resolves when the network connection closes, so
    // the scheduler can track the number of concurrent network connections.
    return { value: null, closed: closed.promise }
  } catch (error) {
    // Either the connection itself failed, or something bad happened while
    // decoding the response. If we're offline, reject with staleAt=-1 so the
    // entry immediately expires and gets retried once the scheduler is
    // re-pinged after connectivity is restored.
    if (process.env.__NEXT_USE_OFFLINE) {
      const { checkOfflineError } =
        require('../offline') as typeof import('../offline')
      if (checkOfflineError(error)) {
        // Unlike navigations and server actions, prefetches don't await
        // waitForConnection — they just reject the cache entry with an
        // immediate expiration so it gets retried once the scheduler is
        // re-pinged after connectivity is restored.
        rejectRouteCacheEntry(entry, -1)
        return null
      }
    }
    rejectRouteCacheEntry(entry, Date.now() + 10 * 1000)
    return null
  }
}

function rejectRemainingSegmentsInBundle(
  entries: SegmentBundle,
  staleAt: number
): void {
  let node: SegmentBundle | null = entries
  while (node !== null) {
    if (node.entry !== null && node.entry.status === EntryStatus.Pending) {
      rejectSegmentCacheEntry(node.entry as PendingSegmentCacheEntry, staleAt)
    }
    node = node.parent
  }
}

// When a static (per-segment PPR) prefetch receives an upgradeable fallback
// shell, the localized retry loop re-issues the same fetch after this delay to
// pick up the concrete version once the server's background regeneration
// finishes.
const FALLBACK_RETRY_DELAY_MS = 2000

// Maximum number of fallback retries per task, to avoid looping indefinitely
// if the server keeps returning a fallback (e.g. misconfiguration).
const MAX_FALLBACK_RETRIES = 3

export async function fetchSegmentsOnCacheMiss(
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  routeKey: RouteCacheKey,
  tree: RouteTree,
  segments: SegmentBundle,
  segmentCount: number
): Promise<PrefetchSubtaskResult<null> | null> {
  // This function is allowed to use async/await because it contains the actual
  // fetch that gets issued on a cache miss. Notice it writes the result to the
  // cache entry directly, rather than return data that is then written by
  // the caller.
  //
  // Segment fetches are non-blocking so we don't need to ping the scheduler
  // on completion.
  let result
  try {
    result = await fetchSegmentsOnCacheMissImpl(route, routeKey, tree)
  } catch (error) {
    // The connection failed, or the response couldn't be decoded. Reject the
    // pending entries so they don't stay Pending forever, and get retried once
    // the entry expires. If we're offline, expire immediately (-1) so the entry
    // is re-fetched once the scheduler is re-pinged on reconnect; otherwise
    // apply a 10s backoff. (Unlike navigations and server actions, prefetches
    // don't await `waitForConnection`.)
    let staleAt = Date.now() + 10 * 1000
    if (process.env.__NEXT_USE_OFFLINE) {
      const { checkOfflineError } =
        require('../offline') as typeof import('../offline')
      if (checkOfflineError(error)) {
        staleAt = -1
      }
    }
    rejectRemainingSegmentsInBundle(segments, staleAt)
    return null
  }

  if (result === null) {
    // The response was fetched but isn't usable yet (server error/miss, empty
    // data, or a build-id mismatch — the server may be transiently unready).
    // Reject with a short backoff so the entries are retried soon.
    rejectRemainingSegmentsInBundle(segments, Date.now() + 10 * 1000)
    return null
  }

  const { serverResponse, responseSize, closed } = result

  // Write the decoded response into the cache, fulfilling the Pending entries
  // this task owns.
  writeSegmentBundleResponse(
    serverResponse,
    responseSize,
    segments,
    segmentCount,
    Date.now()
  )

  // If the server served an upgradeable fallback shell, drive a localized
  // retry loop to pick up the concrete version once the server's background
  // regeneration finishes. Only the first such response per task starts a loop
  // (`fallbackRetryStatus === Empty`); once it leaves Empty, no second loop is
  // started — sibling bundle responses that also got a fallback don't, and
  // neither does a re-hover.
  if (
    serverResponse.isUpgradeableISRFallback &&
    task.fallbackRetryStatus === EntryStatus.Empty &&
    !task.isCanceled
  ) {
    task.fallbackRetryStatus = EntryStatus.Pending
    // Fire-and-forget: the loop drives itself via timers and pings the task
    // on success.
    void retryUpgradeableFallbackPrefetch(
      task,
      route,
      routeKey,
      tree,
      segments,
      segmentCount
    )
  }

  return {
    value: null,
    closed,
  }
}

/**
 * Issues a single segment-bundle prefetch request, validates it, and decodes
 * the response. Returns the decoded `{ serverResponse, responseSize, closed }`
 * on success, or `null` if the response was fetched but isn't usable yet
 * (server error/miss, empty data, or a build-id mismatch — the server may be
 * transiently unready, so it's worth retrying). THROWS if the connection failed
 * or the response couldn't be decoded; re-issuing the identical request won't
 * fix that, so callers should give up rather than retry.
 *
 * This deliberately does NOT touch the cache — it neither writes the decoded
 * segments nor rejects entries. The caller decides what to do with the result:
 * write it (`fetchSegmentsOnCacheMiss`) or ignore it and try again (the retry
 * loop). Calling this again with the same arguments reproduces the exact same
 * request.
 */
async function fetchSegmentsOnCacheMissImpl(
  route: FulfilledRouteCacheEntry,
  routeKey: RouteCacheKey,
  tree: RouteTree
): Promise<{
  serverResponse: SegmentPrefetchResponse
  responseSize: number
  closed: Promise<void>
} | null> {
  // Use the canonical URL to request the segment, not the original URL. These
  // are usually the same, but the canonical URL will be different if the route
  // tree response was redirected. To avoid an extra waterfall on every segment
  // request, we pass the redirected URL instead of the original one.
  const url = new URL(route.canonicalUrl, location.origin)
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

  const response = await fetchPrefetchResponse(requestUrl, headers)
  if (
    !response ||
    !response.ok ||
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
    // Server responded with an error or a miss — fetched but not usable.
    return null
  }

  // See TODO in fetchRouteOnCacheMiss about removing `closed` for
  // buffered prefetch paths.
  const closed = createPromiseWithResolvers<void>()

  const { stream: prefetchStream, size: responseSize } =
    await createNonTaskyPrefetchResponseStream(response.body)
  closed.resolve()

  // Parse the response. Always a SegmentPrefetchResponse with a build ID and a
  // data array. A connection drop or malformed stream throws here, which
  // propagates to the caller as a non-retryable failure.
  const serverResponse =
    await createFromNextReadableStream<SegmentPrefetchResponse>(
      prefetchStream,
      headers,
      { allowPartialStream: true }
    )

  if (serverResponse.data.length === 0) {
    return null
  }
  if (
    (response.headers.get(NEXT_NAV_DEPLOYMENT_ID_HEADER) ??
      serverResponse.buildId) !== getNavigationBuildId()
  ) {
    // The server build does not match the client. Treat as a 404. During
    // an actual navigation, the router will trigger an MPA navigation.
    return null
  }

  return { serverResponse, responseSize, closed: closed.promise }
}

/**
 * Writes a parsed segment-bundle response into the cache: distributes the
 * response size across the bundle, then walks the segments list and the
 * response array in parallel, fulfilling/upserting each entry. Any segments
 * the server didn't return are rejected so they don't stay Pending forever.
 *
 * Shared by the initial fetch and the localized fallback-retry loop (which
 * re-issues the same request and upserts the upgraded result here).
 */
function writeSegmentBundleResponse(
  serverResponse: SegmentPrefetchResponse,
  responseSize: number,
  segments: SegmentBundle,
  segmentCount: number,
  now: number
): void {
  // Distribute the response size evenly across all segments in the bundle.
  const averageSize = responseSize / segmentCount
  let sizeNode: SegmentBundle | null = segments
  while (sizeNode !== null) {
    if (sizeNode.entry !== null) {
      setSizeInCacheMap(sizeNode.entry, averageSize)
    }
    sizeNode = sizeNode.parent
  }

  const serverDataArray = serverResponse.data

  // True if the server served an upgradeable fallback shell (page not yet
  // prerendered with concrete params, but the route can be upgraded). Applies
  // to the whole response and is recorded on each fulfilled entry.
  const responseIsUpgradeableISRFallback =
    serverResponse.isUpgradeableISRFallback

  let node: SegmentBundle | null = segments
  let dataIndex = 0
  while (node !== null && dataIndex < serverDataArray.length) {
    const data = serverDataArray[dataIndex]

    // Null data means this segment has prefetching disabled. Skip it
    // without creating a cache entry.
    if (data === null || node.tree === null) {
      node = node.parent
      dataIndex++
      continue
    }

    const entryStaleAt = now + getStaleTimeMs(data.staleTime)

    // Determine the canonical vary path for this segment. If the server
    // tells us which params the segment varies by, re-key to a more
    // generic path. Otherwise use the request vary path.
    const canonicalVaryPath =
      process.env.__NEXT_VARY_PARAMS && data.varyParams !== null
        ? getFulfilledSegmentVaryPath(node.tree.varyPath, data.varyParams)
        : getSegmentVaryPathForRequest(FetchStrategy.PPR, node.tree)

    let fulfilled: FulfilledSegmentCacheEntry | null = null
    const nodeEntry = node.entry
    if (nodeEntry !== null && nodeEntry.status === EntryStatus.Pending) {
      // We own this entry — fulfill it directly.
      fulfilled = fulfillSegmentCacheEntry(
        nodeEntry as PendingSegmentCacheEntry,
        data.rsc,
        entryStaleAt,
        data.isPartial,
        responseIsUpgradeableISRFallback
      )
    } else {
      // We don't own this entry. Create a detached entry and attempt
      // to upsert it into the canonical slot.
      const detachedEntry = createDetachedSegmentCacheEntry(now)
      fulfilled = fulfillSegmentCacheEntry(
        upgradeToPendingSegment(detachedEntry, FetchStrategy.PPR),
        data.rsc,
        entryStaleAt,
        data.isPartial,
        responseIsUpgradeableISRFallback
      )
    }

    // Set the fulfilled entry into the canonical cache slot.
    upsertSegmentEntry(now, canonicalVaryPath, fulfilled)

    node = node.parent
    dataIndex++
  }

  // If the server returned fewer segments than expected, reject any
  // remaining pending entries so they don't stay Pending forever.
  if (node !== null) {
    rejectRemainingSegmentsInBundle(node, now + 10 * 1000)
  }
}

/**
 * The localized retry loop for an upgradeable fallback shell. Re-issues the
 * exact same segment-bundle request (via `fetchSegmentsOnCacheMissImpl`) up to
 * MAX_FALLBACK_RETRIES times, FALLBACK_RETRY_DELAY_MS apart, until the server
 * returns the concrete (upgraded) version. On success it upserts the upgraded
 * segments (so they aren't re-fetched) and pings the task, so the task's
 * *other* fallback segments get re-attempted. If every attempt is still a
 * fallback (or fails), it gives up.
 *
 * A loop runs at most once per task, ever (the caller gates on
 * `fallbackRetryStatus === Empty`, set to `Pending` before this runs and never
 * reset to `Empty`). The sleep timer is never `clearTimeout`-ed, so the awaited
 * sleep always settles; the loop simply checks `isCanceled` after waking and
 * bails if the task was canceled in the meantime. On success the status becomes
 * `Fulfilled`; on any non-success exit (exhausted retries, fetch error, or
 * cancel) it becomes `Rejected`.
 */
async function retryUpgradeableFallbackPrefetch(
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  routeKey: RouteCacheKey,
  tree: RouteTree,
  segments: SegmentBundle,
  segmentCount: number
): Promise<void> {
  for (let attempt = 0; attempt < MAX_FALLBACK_RETRIES; attempt++) {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, FALLBACK_RETRY_DELAY_MS)
    )
    if (task.isCanceled) {
      break
    }

    let result
    try {
      result = await fetchSegmentsOnCacheMissImpl(route, routeKey, tree)
    } catch {
      // A hard failure (connection dropped, or the response couldn't be
      // decoded). Re-issuing the identical request won't fix it, so give up.
      break
    }
    if (task.isCanceled) {
      break
    }
    if (result === null) {
      // Got a response that wasn't usable yet (the server hasn't finished
      // regenerating). Try again, or give up once the budget is exhausted.
      continue
    }
    if (result.serverResponse.isUpgradeableISRFallback) {
      // Still a fallback shell — the server hasn't finished regenerating yet.
      continue
    }

    // Success: the server returned the concrete (upgraded) version. Write it
    // back through the same bundle — its entries were already fulfilled (with
    // the fallback) by the initial fetch, so none are Pending and every segment
    // takes the upsert path, replacing the fallback. Mark the loop fulfilled and
    // ping the task; its other fallback segments are now allowed to revalidate.
    writeSegmentBundleResponse(
      result.serverResponse,
      result.responseSize,
      segments,
      segmentCount,
      Date.now()
    )
    task.fallbackRetryStatus = EntryStatus.Fulfilled
    pingPrefetchTask(task)
    return
  }

  // The loop finished without success (exhausted its retries, broke out on a
  // fetch error, or the task was canceled). It won't run again for this task.
  task.fallbackRetryStatus = EntryStatus.Rejected
}

// TODO: The inlined prefetch flow below is temporary. Eventually, inlining
// will be the default behavior controlled by a size heuristic rather than a
// boolean flag. At that point, the per-segment and inlined fetch paths will
// merge, and these separate functions will be removed.
//
export async function fetchSegmentPrefetchesUsingDynamicRequest(
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  fetchStrategy:
    | FetchStrategy.LoadingBoundary
    | FetchStrategy.PPRRuntime
    | FetchStrategy.RuntimeShell
    | FetchStrategy.Full,
  dynamicRequestTree: FlightRouterState,
  spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry>
): Promise<PrefetchSubtaskResult<null> | null> {
  const key = task.key
  const url = new URL(route.canonicalUrl, location.origin)
  const nextUrl = key.nextUrl

  if (
    spawnedEntries.size === 1 &&
    spawnedEntries.has(route.metadata.requestKey)
  ) {
    // The only thing pending is the head. Instruct the server to
    // skip over everything else.
    // TODO: Lift this logic into the caller. Or perhaps unify the
    // "request tree" and the spawnedEntries into the same type so they are
    // guaranteed to always been in sync.
    dynamicRequestTree = MetadataOnlyRequestTree
  }

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
    case FetchStrategy.RuntimeShell: {
      headers[NEXT_ROUTER_PREFETCH_HEADER] = '3'
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

    // Track when the network connection closes. Only meaningful for Full
    // (dynamic) prefetches which use incremental streaming. For buffered
    // paths, this is resolved immediately — see TODO in fetchRouteOnCacheMiss.
    const closed = createPromiseWithResolvers<void>()

    let fulfilledEntries: Array<FulfilledSegmentCacheEntry> | null = null
    let prefetchStream: ReadableStream<Uint8Array>
    let bufferedResponseSize: number | null = null
    if (fetchStrategy === FetchStrategy.Full) {
      // Full prefetches are dynamic responses stored in the prefetch cache.
      // They don't carry vary params or other cache metadata, so there's no
      // need to buffer them. Use the incremental version to allow data to be
      // processed as it arrives.
      prefetchStream = createIncrementalPrefetchResponseStream(
        response.body,
        closed.resolve,
        function onResponseSizeUpdate(totalBytesReceivedSoFar) {
          // When processing a dynamic response, we don't know how large each
          // individual segment is, so approximate by assigning each segment
          // the average of the total response size.
          if (fulfilledEntries === null) {
            // Haven't received enough data yet to know which segments
            // were included.
            return
          }
          const averageSize = totalBytesReceivedSoFar / fulfilledEntries.length
          for (const entry of fulfilledEntries) {
            setSizeInCacheMap(entry, averageSize)
          }
        }
      )
    } else {
      const { stream, size } = await createNonTaskyPrefetchResponseStream(
        response.body
      )
      closed.resolve()
      prefetchStream = stream
      bufferedResponseSize = size
    }

    const [serverData, cacheData] = await Promise.all([
      createFromNextReadableStream<NavigationFlightResponse>(
        prefetchStream,
        headers,
        { allowPartialStream: true }
      ),
      response.cacheData,
    ])

    const now = Date.now()
    const staleAt = await getStaleAt(now, serverData.s, response)
    const buildId =
      response.headers.get(NEXT_NAV_DEPLOYMENT_ID_HEADER) ?? serverData.b

    // Check if a reusable App Shell can be extracted from the main response.
    let serverDataThatSatisfiesSpawnedEntries: NavigationFlightResponse
    // The shell and full response have independent stale times. Track the
    // staleAt that corresponds to whatever payload the spawned entries get
    // filled with below.
    let staleAtForSpawnedEntries = staleAt
    if (!process.env.__NEXT_APP_SHELLS || cacheData === null) {
      // NOTE: cacheData is always set when Cached Navigations is enabled, and
      // therefore when App Shells is enabled. This null check can be removed
      // when those flags fully land.
      serverDataThatSatisfiesSpawnedEntries = serverData
    } else {
      const shellStageData = await resolveShellStageData(
        cacheData,
        serverData,
        headers
      )
      if (shellStageData === null) {
        // No App Shell can be extracted. This usually means the entire response
        // _is_ the App Shell. The other possibility (for now, until the feature
        // is fully stabilized) is that App Shells are not yet enabled. Either
        // way, there's nothing extra for us to do: fulfill the pending entries
        // using the response from the server.
        serverDataThatSatisfiesSpawnedEntries = serverData
      } else {
        // Successfully extracted an App Shell that is a subset of the main
        // response. Depending on the type of prefetch this is, we need to
        // decide whether to fulfill the pending entries with the shell or with
        // the entire response. In either scenario, we'll be inserting _both_
        // versions of the response into the cache; the extra logic is only
        // here so that we don't fulfill pending shell entries with something
        // that's more concrete than what they expect.
        // TODO: The only reason this matters is because during a navigation,
        // if a segment is still pending, we render a promise that resolves to
        // the eventual value of that segment. But that means we cannot
        // eventually resolve that segment to something more concrete than what
        // was already requested. Hence the extra logic here. A cleaner way to
        // model this, though, is whenever we render a promise that resolves to
        // the result of a pending entry, do one additional cache look-up right
        // after the promise resolves, to ensure we never get a mismatching
        // entry. Leaving this for a follow up.
        const shellStaleAt = await getStaleAt(now, shellStageData.s)
        if (fetchStrategy === FetchStrategy.RuntimeShell) {
          // This is a Shell prefetch, so the pending entries must be fulfilled
          // with the shell.
          serverDataThatSatisfiesSpawnedEntries = shellStageData
          staleAtForSpawnedEntries = shellStaleAt

          // Separately, we'll also cache the entire response, by upserting it
          // into the cache.
          writePrerenderResponseIntoCache(
            now,
            FetchStrategy.PPR,
            serverData.f,
            buildId,
            serverData.h,
            serverData.r ?? null,
            staleAt,
            dynamicRequestTree,
            renderedSearch,
            cacheData.isResponsePartial
          )
        } else {
          // This is _not_ a Shell prefetch, so the pending entries should be
          // fulfilled with the entire response.
          serverDataThatSatisfiesSpawnedEntries = serverData

          // Additionally, we might as well upsert the extracted Shell into the
          // cache, too.

          // `shellStageData` is only provided in cases where the shell is
          // different from the main response. If they are equivalent, this
          // branch is skipped. So it follows that any shell data reaches
          // this path must be partial -- it does not represent the entire
          // UI of the target page.
          const isShellStagePartial = true
          writePrerenderResponseIntoCache(
            now,
            FetchStrategy.RuntimeShell,
            shellStageData.f,
            buildId,
            shellStageData.h,
            shellStageData.r ?? null,
            shellStaleAt,
            dynamicRequestTree,
            renderedSearch,
            isShellStagePartial
          )
        }
      }
    }

    // Read head vary params synchronously (unioning in the response-level root
    // params). Individual segments carry their own iterables in
    // CacheNodeSeedData; the root iterable is threaded down so each segment
    // unions it too.
    const rootVaryParamsIterable =
      serverDataThatSatisfiesSpawnedEntries.r ?? null
    const headVaryParams = readVaryParams(
      serverDataThatSatisfiesSpawnedEntries.h,
      rootVaryParamsIterable
    )

    // PPRRuntime and RuntimeShell prefetches are partial when the server
    // marks the response as '~' (Partial). RuntimeShell additionally omits
    // every dynamic suspense boundary below the App Shell, so its segments
    // are always partial regardless of what the server marker says.
    // Full/LoadingBoundary prefetches are always complete.
    const isResponsePartial =
      fetchStrategy === FetchStrategy.RuntimeShell ||
      (fetchStrategy === FetchStrategy.PPRRuntime &&
        (cacheData?.isResponsePartial ?? false))

    const flightDatas = normalizeFlightData(
      serverDataThatSatisfiesSpawnedEntries.f
    )
    if (typeof flightDatas === 'string') {
      rejectSegmentEntriesIfStillPending(spawnedEntries, Date.now() + 10 * 1000)
      return null
    }
    const navigationSeed = convertServerPatchToFullTree(
      now,
      dynamicRequestTree,
      flightDatas,
      renderedSearch,
      // Not needed for prefetch responses; pass unknown to use the default.
      UnknownDynamicStaleTime
    )
    // Aside from writing the data into the cache, this function also returns
    // the entries that were fulfilled, so we can streamingly update their sizes
    // in the LRU as more data comes in.
    fulfilledEntries = writeDynamicRenderResponseIntoCache(
      now,
      fetchStrategy,
      flightDatas,
      buildId,
      isResponsePartial,
      headVaryParams,
      rootVaryParamsIterable,
      staleAtForSpawnedEntries,
      navigationSeed,
      spawnedEntries
    )

    // For buffered responses, update LRU sizes now that we know which
    // entries were fulfilled.
    if (
      bufferedResponseSize !== null &&
      fulfilledEntries !== null &&
      fulfilledEntries.length > 0
    ) {
      const averageSize = bufferedResponseSize / fulfilledEntries.length
      for (const entry of fulfilledEntries) {
        setSizeInCacheMap(entry, averageSize)
      }
    }

    // Return a promise that resolves when the network connection closes, so
    // the scheduler can track the number of concurrent network connections.
    return { value: null, closed: closed.promise }
  } catch (error) {
    if (process.env.__NEXT_USE_OFFLINE) {
      const { checkOfflineError } =
        require('../offline') as typeof import('../offline')
      if (checkOfflineError(error)) {
        // Unlike navigations and server actions, prefetches don't await
        // waitForConnection — they just reject the cache entry with an
        // immediate expiration so it gets retried once the scheduler is
        // re-pinged after connectivity is restored.
        rejectSegmentEntriesIfStillPending(spawnedEntries, -1)
        return null
      }
    }
    rejectSegmentEntriesIfStillPending(spawnedEntries, Date.now() + 10 * 1000)
    return null
  }
}

function writeDynamicTreeResponseIntoCache(
  now: number,
  fetchStrategy:
    | FetchStrategy.LoadingBoundary
    | FetchStrategy.PPRRuntime
    | FetchStrategy.Full,
  response: RSCResponse<NavigationFlightResponse>,
  serverData: NavigationFlightResponse,
  entry: PendingRouteCacheEntry,
  couldBeIntercepted: boolean,
  canonicalUrl: string,
  routeIsPPREnabled: boolean,
  headVaryParams: VaryParams | null,
  rootVaryParamsIterable: VaryParamsIterable | null,
  originalPathname: string,
  originalSearch: NormalizedSearch,
  nextUrl: string | null
): void {
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
  // If the response was postponed, segments may contain dynamic holes.
  // The head has its own partiality flag (flightDataEntry.isHeadPartial)
  // which is handled separately in writeDynamicRenderResponseIntoCache.
  const isResponsePartial =
    response.headers.get(NEXT_DID_POSTPONE_HEADER) === '1'

  // Convert the server-sent data into the RouteTree format used by the
  // client cache.
  //
  // During this traversal, we accumulate additional data into this
  // "accumulator" object.
  const acc: RouteTreeAccumulator = { metadataVaryPath: null }
  const routeTree = convertRootFlightRouterStateToRouteTree(
    flightRouterState,
    renderedSearch,
    acc
  )
  const metadataVaryPath = acc.metadataVaryPath
  if (metadataVaryPath === null) {
    rejectRouteCacheEntry(entry, now + 10 * 1000)
    return
  }

  discoverKnownRoute(
    now,
    originalPathname,
    originalSearch,
    nextUrl,
    entry,
    routeTree,
    metadataVaryPath,
    couldBeIntercepted,
    canonicalUrl,
    routeIsPPREnabled,
    false // hasDynamicRewrite
  )

  // If the server sent segment data as part of the response, we should write
  // it into the cache to prevent a second, redundant prefetch request.
  // TODO: This is a leftover branch from before Client Segment Cache was
  // enabled everywhere. Tree prefetches should never include segment data.  We
  // can delete it. Leaving for a subsequent PR.
  const navigationSeed = convertServerPatchToFullTree(
    now,
    flightRouterState,
    normalizedFlightDataResult,
    renderedSearch,
    UnknownDynamicStaleTime
  )
  const buildId =
    response.headers.get(NEXT_NAV_DEPLOYMENT_ID_HEADER) ?? serverData.b
  writeDynamicRenderResponseIntoCache(
    now,
    fetchStrategy,
    normalizedFlightDataResult,
    buildId,
    isResponsePartial,
    headVaryParams,
    rootVaryParamsIterable,
    getStaleAtFromHeader(now, response),
    navigationSeed,
    null
  )
}

function rejectSegmentEntriesIfStillPending(
  entries: Map<SegmentRequestKey, SegmentCacheEntry>,
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

export function writeDynamicRenderResponseIntoCache(
  now: number,
  fetchStrategy:
    | FetchStrategy.LoadingBoundary
    | FetchStrategy.PPR
    | FetchStrategy.PPRRuntime
    | FetchStrategy.RuntimeShell
    | FetchStrategy.Full,
  flightDatas: NormalizedFlightData[],
  buildId: string | undefined,
  isResponsePartial: boolean,
  headVaryParams: VaryParams | null,
  rootVaryParamsIterable: VaryParamsIterable | null,
  staleAt: number,
  navigationSeed: NavigationSeed,
  spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry> | null
): Array<FulfilledSegmentCacheEntry> | null {
  if (buildId && buildId !== getNavigationBuildId()) {
    // The server build does not match the client. Treat as a 404. During
    // an actual navigation, the router will trigger an MPA navigation.
    if (spawnedEntries !== null) {
      rejectSegmentEntriesIfStillPending(spawnedEntries, now + 10 * 1000)
    }
    return null
  }

  const routeTree = navigationSeed.routeTree
  const metadataTree =
    navigationSeed.metadataVaryPath !== null
      ? createMetadataRouteTree(navigationSeed.metadataVaryPath)
      : null

  for (const flightDataEntry of flightDatas) {
    const seedData = flightDataEntry.seedData
    if (seedData !== null) {
      // The data sent by the server represents only a subtree of the app. We
      // need to find the part of the task tree that matches the response.
      //
      // segmentPath represents the parent path of subtree. It's a repeating
      // pattern of parallel route key and segment:
      //
      //   [string, Segment, string, Segment, string, Segment, ...]
      const segmentPath = flightDataEntry.segmentPath
      let tree = routeTree
      for (let i = 0; i < segmentPath.length; i += 2) {
        const parallelRouteKey: string = segmentPath[i]
        if (tree?.slots?.[parallelRouteKey] !== undefined) {
          tree = tree.slots[parallelRouteKey]
        } else {
          if (spawnedEntries !== null) {
            rejectSegmentEntriesIfStillPending(spawnedEntries, now + 10 * 1000)
          }
          return null
        }
      }

      writeSeedDataIntoCache(
        now,
        fetchStrategy,
        tree,
        staleAt,
        seedData,
        isResponsePartial,
        rootVaryParamsIterable,
        spawnedEntries
      )
    }

    const head = flightDataEntry.head
    if (head !== null && metadataTree !== null) {
      // When Cache Components is enabled, the server conservatively marks
      // the head as partial during static generation (isPossiblyPartialHead
      // in app-render.tsx), even for fully static pages where the head is
      // actually complete. When the response is non-partial, we override
      // this since the server confirmed no dynamic content exists.
      //
      // Without Cache Components, the server always sends the correct
      // isHeadPartial value, so no override is needed.
      const isHeadPartial =
        !isResponsePartial && process.env.__NEXT_CACHE_COMPONENTS
          ? false
          : flightDataEntry.isHeadPartial

      fulfillEntrySpawnedByRuntimePrefetch(
        now,
        fetchStrategy,
        head,
        isHeadPartial,
        staleAt,
        // For head entries, use the head-specific vary params passed as
        // parameter.
        headVaryParams,
        metadataTree,
        spawnedEntries
      )
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
  fetchStrategy:
    | FetchStrategy.LoadingBoundary
    | FetchStrategy.PPR
    | FetchStrategy.PPRRuntime
    | FetchStrategy.RuntimeShell
    | FetchStrategy.Full,
  tree: RouteTree,
  staleAt: number,
  seedData: CacheNodeSeedData,
  isResponsePartial: boolean,
  rootVaryParamsIterable: VaryParamsIterable | null,
  entriesOwnedByCurrentTask: Map<
    SegmentRequestKey,
    PendingSegmentCacheEntry
  > | null
) {
  // This function is used to write the result of a runtime server request
  // (CacheNodeSeedData) into the prefetch cache.
  const rsc = seedData[0]
  const isPartial = rsc === null || isResponsePartial
  // Each segment carries its own vary params iterable in the seed data, which
  // drains to the set of params the segment accessed during render. A null
  // iterable means tracking was not enabled (not a prerender). readVaryParams
  // unions in the response-level root params.
  const varyParams = readVaryParams(seedData[4], rootVaryParamsIterable)
  fulfillEntrySpawnedByRuntimePrefetch(
    now,
    fetchStrategy,
    rsc,
    isPartial,
    staleAt,
    varyParams,
    tree,
    entriesOwnedByCurrentTask
  )

  // Recursively write the child data into the cache.
  const slots = tree.slots
  if (slots !== null) {
    const seedDataChildren = seedData[1]
    for (const parallelRouteKey in slots) {
      const childTree = slots[parallelRouteKey]
      const childSeedData: CacheNodeSeedData | null | void =
        seedDataChildren[parallelRouteKey]
      if (childSeedData !== null && childSeedData !== undefined) {
        writeSeedDataIntoCache(
          now,
          fetchStrategy,
          childTree,
          staleAt,
          childSeedData,
          isResponsePartial,
          rootVaryParamsIterable,
          entriesOwnedByCurrentTask
        )
      }
    }
  }
}

function fulfillEntrySpawnedByRuntimePrefetch(
  now: number,
  fetchStrategy:
    | FetchStrategy.LoadingBoundary
    | FetchStrategy.PPR
    | FetchStrategy.PPRRuntime
    | FetchStrategy.RuntimeShell
    | FetchStrategy.Full,
  rsc: React.ReactNode,
  isPartial: boolean,
  staleAt: number,
  segmentVaryParams: Set<string> | null,
  tree: RouteTree,
  entriesOwnedByCurrentTask: Map<
    SegmentRequestKey,
    PendingSegmentCacheEntry
  > | null
) {
  // Decide whether to re-key the entry under a more generic vary path based on
  // which params the segment actually depends on.
  //
  // Skip re-keying for Full prefetches: as of today, `varyParams` tracking only
  // works within the static stage portion of a response. A Full prefetch
  // response covers all stages, and we can't track params during the dynamic
  // stage without dead-locking the Flight stream, so the server-reported set is
  // incomplete and can't be trusted for the full response. Re-keying with an
  // untrustworthy set could replace concrete params with Fallback and let
  // unrelated URLs read each other's content from the cache.
  //
  // For RuntimeShell prefetches, always re-key to the precomputed shell vary
  // path. A shell entry is spawned at a concrete param path but is reusable
  // across all of them; tree.shellVaryPath (root-param values kept, every other
  // param replaced with Fallback) is exactly the path that shell reads look it
  // up under.
  let fulfilledVaryPath: SegmentVaryPath | null = null
  if (process.env.__NEXT_VARY_PARAMS) {
    if (fetchStrategy === FetchStrategy.RuntimeShell) {
      fulfilledVaryPath = tree.shellVaryPath
    } else if (
      fetchStrategy !== FetchStrategy.Full &&
      segmentVaryParams !== null
    ) {
      fulfilledVaryPath = getFulfilledSegmentVaryPath(
        tree.varyPath,
        segmentVaryParams
      )
    }
  }

  // We should only write into cache entries that are owned by us. Or create
  // a new one and write into that. We must never write over an entry that was
  // created by a different task, because that causes data races.
  const ownedEntry =
    entriesOwnedByCurrentTask !== null
      ? entriesOwnedByCurrentTask.get(tree.requestKey)
      : undefined
  if (ownedEntry !== undefined) {
    const fulfilledEntry = fulfillSegmentCacheEntry(
      ownedEntry,
      rsc,
      staleAt,
      isPartial,
      // Dynamic-request (Full/Runtime) responses are not ISR fallbacks.
      false
    )
    if (fulfilledVaryPath !== null) {
      const isRevalidation = false
      setInCacheMap(
        segmentCacheMap,
        fulfilledVaryPath,
        fulfilledEntry,
        isRevalidation
      )
    }
  } else {
    // There's no matching entry. Attempt to create a new one.
    const possiblyNewEntry = readOrCreateSegmentCacheEntry(
      now,
      fetchStrategy,
      tree
    )
    if (possiblyNewEntry.status === EntryStatus.Empty) {
      // Confirmed this is a new entry. We can fulfill it.
      const newEntry = possiblyNewEntry
      const fulfilledEntry = fulfillSegmentCacheEntry(
        upgradeToPendingSegment(newEntry, fetchStrategy),
        rsc,
        staleAt,
        isPartial,
        // Dynamic-request (Full/Runtime) responses are not ISR fallbacks.
        false
      )
      if (fulfilledVaryPath !== null) {
        const isRevalidation = false
        setInCacheMap(
          segmentCacheMap,
          fulfilledVaryPath,
          fulfilledEntry,
          isRevalidation
        )
      }
    } else {
      // There was already an entry in the cache. But we may be able to
      // replace it with the new one from the server.
      const newEntry = fulfillSegmentCacheEntry(
        upgradeToPendingSegment(
          createDetachedSegmentCacheEntry(now),
          fetchStrategy
        ),
        rsc,
        staleAt,
        isPartial,
        // Dynamic-request (Full/Runtime) responses are not ISR fallbacks.
        false
      )
      const varyPath =
        fulfilledVaryPath !== null
          ? fulfilledVaryPath
          : getSegmentVaryPathForRequest(fetchStrategy, tree)
      upsertSegmentEntry(now, varyPath, newEntry)
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
  // `createNonTaskyPrefetchResponseStream` for more details.
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

export async function createNonTaskyPrefetchResponseStream(
  body: ReadableStream<Uint8Array>,
  byteLimit?: number
): Promise<{ stream: ReadableStream<Uint8Array>; size: number }> {
  // Buffer the entire response before passing it to the Flight client. This
  // ensures that when Flight processes the stream, all model data is available
  // synchronously. This is important for readVaryParams, which synchronously
  // checks the thenable status — if data arrived in multiple network chunks,
  // the thenables might not yet be fulfilled.
  //
  // TODO: There are too many intermediate stream transformations in the
  // prefetch response pipeline (e.g. stripIsPartialByte, this function).
  // These could all be consolidated into a single transformation. Refactor
  // once the cached navigations experiment lands.
  //
  // Read the response from the network, optionally truncating at byteLimit.
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (byteLimit !== undefined && size + value.byteLength >= byteLimit) {
      const remaining = byteLimit - size
      if (remaining > 0) {
        chunks.push(
          value.byteLength > remaining ? value.subarray(0, remaining) : value
        )
        size += remaining
      }
      reader.cancel()
      break
    }
    chunks.push(value)
    size += value.byteLength
  }
  // Concatenate into a single chunk so that Flight's processBinaryChunk
  // processes all rows synchronously in one call. Multiple chunks would not
  // be sufficient: even though reader.read() resolves as a microtask for
  // already-enqueued data, the `await` continuation from
  // createFromReadableStream can interleave between chunks. If the root
  // model row isn't the first row (e.g. outlined values come first), the
  // PromiseResolveThenableJob from `await` can cause the root to initialize
  // eagerly, scheduling the continuation before remaining chunks (including
  // promise value rows) are processed. A single chunk avoids this.
  let buffer: Uint8Array
  if (chunks.length === 1) {
    buffer = chunks[0]
  } else if (chunks.length > 1) {
    buffer = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      buffer.set(chunk, offset)
      offset += chunk.byteLength
    }
  } else {
    buffer = new Uint8Array(0)
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(buffer)
      controller.close()
    },
  })
  return { stream, size }
}

/**
 * Creates a streaming (non-buffered) prefetch response stream for dynamic/Full
 * prefetches. These are essentially dynamic responses that get stored in the
 * prefetch cache — they don't carry vary params or other cache metadata that
 * requires synchronous thenable resolution, so there's no need to buffer them.
 * They should continue to stream so consumers can process data as it arrives.
 */
function createIncrementalPrefetchResponseStream(
  originalFlightStream: ReadableStream<Uint8Array>,
  onStreamClose: () => void,
  onResponseSizeUpdate: (size: number) => void
): ReadableStream<Uint8Array> {
  // While processing the original stream, we incrementally update the size
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
          totalByteLength += value.byteLength
          onResponseSizeUpdate(totalByteLength)
          continue
        }
        controller.close()
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

function getStaleAtFromHeader(
  now: number,
  response: RSCResponse<unknown>
): number {
  const staleTimeSeconds = parseInt(
    response.headers.get(NEXT_ROUTER_STALE_TIME_HEADER) ?? '',
    10
  )

  const staleTimeMs = !isNaN(staleTimeSeconds)
    ? getStaleTimeMs(staleTimeSeconds)
    : STATIC_STALETIME_MS

  return now + staleTimeMs
}

/**
 * Reads the stale time from an async iterable or a response header and
 * returns a staleAt timestamp.
 *
 * TODO: Buffer the response and then read the iterable values
 * synchronously, similar to readVaryParams. This would avoid the need to
 * make this async, and we could also use it in
 * writeDynamicTreeResponseIntoCache. This will also be needed when React
 * starts leaving async iterables hanging when the outer RSC stream is
 * aborted e.g. due to sync I/O (with unstable_allowPartialStream).
 */
export async function getStaleAt(
  now: number,
  staleTimeIterable: AsyncIterable<number> | undefined,
  response?: RSCResponse<unknown>
): Promise<number> {
  if (staleTimeIterable !== undefined) {
    // Iterate the async iterable and take the last yielded value. The server
    // yields updated staleTime values during the render; the last one is the
    // final staleTime.
    let staleTimeSeconds: number | undefined
    for await (const value of staleTimeIterable) {
      staleTimeSeconds = value
    }

    if (staleTimeSeconds !== undefined) {
      const staleTimeMs = isNaN(staleTimeSeconds)
        ? STATIC_STALETIME_MS
        : getStaleTimeMs(staleTimeSeconds)

      return now + staleTimeMs
    }
  }

  if (response !== undefined) {
    return getStaleAtFromHeader(now, response)
  }

  return now + STATIC_STALETIME_MS
}

/**
 * Writes a prerender response into the segment cache at the vary path
 * determined by `fetchStrategy`. Default segments are skipped (by
 * `writeSeedDataIntoCache`) to avoid caching fallback content that would
 * block refreshes from overwriting with dynamic data.
 */
export function writePrerenderResponseIntoCache(
  now: number,
  fetchStrategy: FetchStrategy.PPR | FetchStrategy.RuntimeShell,
  flightData: FlightData,
  buildId: string | undefined,
  headVaryParamsIterable: VaryParamsIterable | null,
  rootVaryParamsIterable: VaryParamsIterable | null,
  staleAt: number,
  baseTree: FlightRouterState,
  renderedSearch: string,
  isResponsePartial: boolean
): void {
  // Root params are emitted once at the top level; readVaryParams unions them
  // into the head, and they're threaded down to each segment below.
  const headVaryParams = readVaryParams(
    headVaryParamsIterable,
    rootVaryParamsIterable
  )

  const flightDatas = normalizeFlightData(flightData)
  if (typeof flightDatas === 'string') {
    return
  }
  const navigationSeed = convertServerPatchToFullTree(
    now,
    baseTree,
    flightDatas,
    renderedSearch,
    UnknownDynamicStaleTime
  )
  writeDynamicRenderResponseIntoCache(
    now,
    fetchStrategy,
    flightDatas,
    buildId,
    isResponsePartial,
    headVaryParams,
    rootVaryParamsIterable,
    staleAt,
    navigationSeed,
    null // spawnedEntries — no pre-created entries; will create or upsert
  )
}

/**
 * Decodes an embedded runtime prefetch Flight stream, normalizes the flight
 * data, and derives a `NavigationSeed` from the base tree.
 *
 * Returns `null` if the response triggers an MPA navigation.
 */
export async function processRuntimePrefetchStream(
  now: number,
  runtimePrefetchStream: ReadableStream<Uint8Array>,
  baseTree: FlightRouterState,
  renderedSearch: string
): Promise<{
  flightDatas: NormalizedFlightData[]
  navigationSeed: NavigationSeed
  buildId: string | undefined
  isResponsePartial: boolean
  headVaryParams: VaryParams | null
  rootVaryParamsIterable: VaryParamsIterable | null
  staleAt: number
} | null> {
  const { stream, isPartial } = await stripIsPartialByte(runtimePrefetchStream)

  const serverData =
    await createFromNextReadableStream<NavigationFlightResponse>(
      stream,
      undefined,
      { allowPartialStream: true }
    )

  // Root params are emitted once at the top level; readVaryParams unions them
  // into the head, and we return the iterable so the caller can union it into
  // each segment too.
  const rootVaryParamsIterable = serverData.r ?? null
  const headVaryParams = readVaryParams(serverData.h, rootVaryParamsIterable)

  const staleAt = await getStaleAt(now, serverData.s)

  const flightDatas = normalizeFlightData(serverData.f)
  if (typeof flightDatas === 'string') {
    return null
  }
  const navigationSeed = convertServerPatchToFullTree(
    now,
    baseTree,
    flightDatas,
    renderedSearch,
    UnknownDynamicStaleTime
  )

  return {
    flightDatas,
    navigationSeed,
    buildId: serverData.b,
    isResponsePartial: isPartial,
    headVaryParams,
    rootVaryParamsIterable,
    staleAt,
  }
}

/**
 * Strips the leading isPartial byte from an RSC response stream.
 *
 * The server prepends a single byte: '~' (0x7e) for partial, '#' (0x23) for
 * complete. These bytes cannot appear as the first byte of a valid RSC Flight
 * response (Flight rows start with a hex digit or ':').
 *
 * If the first byte is not a recognized marker, the stream is returned intact
 * and `isPartial` is determined by the cachedNavigations experimental flag.
 */
export async function stripIsPartialByte(
  stream: ReadableStream<Uint8Array>
): Promise<{ stream: ReadableStream<Uint8Array>; isPartial: boolean }> {
  // When there is no recognized marker byte, the fallback depends on whether
  // Cached Navigations is enabled. When enabled, dynamic navigation responses
  // don't have a marker but may contain dynamic holes, so they are treated as
  // partial. When disabled, unmarked responses are treated as non-partial.
  const defaultIsPartial = !!process.env.__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS

  const reader = stream.getReader()
  const { done, value } = await reader.read()

  if (done || !value || value.byteLength === 0) {
    return {
      stream: new ReadableStream({ start: (c) => c.close() }),
      isPartial: defaultIsPartial,
    }
  }

  const firstByte = value[0]
  const hasMarker = firstByte === 0x23 || firstByte === 0x7e
  const isPartial = hasMarker ? firstByte === 0x7e : defaultIsPartial

  const remainder = hasMarker
    ? value.byteLength > 1
      ? value.subarray(1)
      : null
    : value

  return {
    isPartial,
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        if (remainder) {
          controller.enqueue(remainder)
        }
      },
      async pull(controller) {
        const result = await reader.read()
        if (result.done) {
          controller.close()
        } else {
          controller.enqueue(result.value)
        }
      },
    }),
  }
}
