import type {
  TreePrefetch,
  RootTreePrefetch,
  SegmentPrefetch,
} from '../../../server/app-render/collect-segment-data'
import type { LoadingModuleData } from '../../../shared/lib/app-router-types'
import type {
  CacheNodeSeedData,
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
import {
  type RouteVaryPath,
  type SegmentVaryPath,
  type PartialSegmentVaryPath,
  getRouteVaryPath,
  getFulfilledRouteVaryPath,
  getSegmentVaryPathForRequest,
  appendLayoutVaryPath,
  finalizeLayoutVaryPath,
  finalizePageVaryPath,
  clonePageVaryPathWithNewSearchParams,
  type PageVaryPath,
  finalizeMetadataVaryPath,
} from './vary-path'
import { getAppBuildId } from '../../app-build-id'
import { createHrefFromUrl } from '../router-reducer/create-href-from-url'
import type { NormalizedSearch, RouteCacheKey } from './cache-key'
// TODO: Rename this module to avoid confusion with other types of cache keys
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
  type CacheMap,
  type UnknownMapEntry,
} from './cache-map'
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
  normalizeFlightData,
  prepareFlightRouterStateForRequest,
} from '../../flight-data-helpers'
import { STATIC_STALETIME_MS } from '../router-reducer/reducers/navigate-reducer'
import { pingVisibleLinks } from '../links'
import { PAGE_SEGMENT_KEY } from '../../../shared/lib/segment'
import { FetchStrategy } from './types'
import { createPromiseWithResolvers } from '../../../shared/lib/promise-with-resolvers'

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

type LayoutRouteTree = RouteTreeShared & {
  isPage: false
  varyPath: SegmentVaryPath
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
  metadata: null
  isPPREnabled: false
}

type RejectedRouteCacheEntry = RouteCacheEntryShared & {
  status: EntryStatus.Rejected
  blockedTasks: Set<PrefetchTask> | null
  canonicalUrl: null
  renderedSearch: null
  tree: null
  metadata: null
  isPPREnabled: boolean
}

export type FulfilledRouteCacheEntry = RouteCacheEntryShared & {
  status: EntryStatus.Fulfilled
  blockedTasks: null
  canonicalUrl: string
  renderedSearch: NormalizedSearch
  tree: RouteTree
  metadata: RouteTree
  isPPREnabled: boolean
}

export type RouteCacheEntry =
  | PendingRouteCacheEntry
  | FulfilledRouteCacheEntry
  | RejectedRouteCacheEntry

type SegmentCacheEntryShared = {
  fetchStrategy: FetchStrategy

  // Map-related fields.
  ref: UnknownMapEntry | null
  size: number
  staleAt: number
  version: number
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
  isPartial: boolean
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

const MetadataOnlyRequestTree: FlightRouterState = [
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
  // Increment the current cache version. This does not eagerly evict anything
  // from the cache, but because all the entries are versioned, and we check
  // the version when reading from the cache, this effectively causes all
  // entries to be evicted lazily. We do it lazily because in the future,
  // actions like revalidateTag or refresh will not evict the entire cache,
  // but rather some subset of the entries.
  currentCacheVersion++

  // Start a cooldown before re-prefetching to allow CDN cache propagation.
  startRevalidationCooldown()

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
  return getFromCacheMap(
    now,
    getCurrentCacheVersion(),
    routeCacheMap,
    varyPath,
    isRevalidation
  )
}

export function readSegmentCacheEntry(
  now: number,
  varyPath: SegmentVaryPath
): SegmentCacheEntry | null {
  const isRevalidation = false
  return getFromCacheMap(
    now,
    getCurrentCacheVersion(),
    segmentCacheMap,
    varyPath,
    isRevalidation
  )
}

function readRevalidatingSegmentCacheEntry(
  now: number,
  varyPath: SegmentVaryPath
): SegmentCacheEntry | null {
  const isRevalidation = true
  return getFromCacheMap(
    now,
    getCurrentCacheVersion(),
    segmentCacheMap,
    varyPath,
    isRevalidation
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
    metadata: null,
    // This is initialized to true because we don't know yet whether the route
    // could be intercepted. It's only set to false once we receive a response
    // from the server.
    couldBeIntercepted: true,
    // Similarly, we don't yet know if the route supports PPR.
    isPPREnabled: false,
    renderedSearch: null,

    // Map-related fields
    ref: null,
    size: 0,
    // Since this is an empty entry, there's no reason to ever evict it. It will
    // be updated when the data is populated.
    staleAt: Infinity,
    version: getCurrentCacheVersion(),
  }
  const varyPath: RouteVaryPath = getRouteVaryPath(
    key.pathname,
    key.search,
    key.nextUrl
  )
  const isRevalidation = false
  setInCacheMap(routeCacheMap, varyPath, pendingEntry, isRevalidation)
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

  const optimisticRouteTree = createOptimisticRouteTree(
    routeWithNoSearchParams.tree,
    optimisticRenderedSearch
  )
  const optimisticMetadataTree = createOptimisticRouteTree(
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
    isPPREnabled: routeWithNoSearchParams.isPPREnabled,

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

function createOptimisticRouteTree(
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
      clonedSlots[parallelRouteKey] = createOptimisticRouteTree(
        childTree,
        newRenderedSearch
      )
    }
  }

  // We only need to clone the vary path if the route is a page.
  if (tree.isPage) {
    return {
      requestKey: tree.requestKey,
      segment: tree.segment,
      varyPath: clonePageVaryPathWithNewSearchParams(
        tree.varyPath,
        newRenderedSearch
      ),
      isPage: true,
      slots: clonedSlots,
      isRootLayout: tree.isRootLayout,
      hasLoadingBoundary: tree.hasLoadingBoundary,
      hasRuntimePrefetch: tree.hasRuntimePrefetch,
    }
  }

  return {
    requestKey: tree.requestKey,
    segment: tree.segment,
    varyPath: tree.varyPath,
    isPage: false,
    slots: clonedSlots,
    isRootLayout: tree.isRootLayout,
    hasLoadingBoundary: tree.hasLoadingBoundary,
    hasRuntimePrefetch: tree.hasRuntimePrefetch,
  }
}

/**
 * Checks if an entry for a segment exists in the cache. If so, it returns the
 * entry, If not, it adds an empty entry to the cache and returns it.
 */
export function readOrCreateSegmentCacheEntry(
  now: number,
  fetchStrategy: FetchStrategy,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree
): SegmentCacheEntry {
  const existingEntry = readSegmentCacheEntry(now, tree.varyPath)
  if (existingEntry !== null) {
    return existingEntry
  }
  // Create a pending entry and add it to the cache.
  const varyPathForRequest = getSegmentVaryPathForRequest(fetchStrategy, tree)
  const pendingEntry = createDetachedSegmentCacheEntry(route.staleAt)
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
  route: FulfilledRouteCacheEntry,
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
  // Create a pending entry and add it to the cache.
  const varyPathForRequest = getSegmentVaryPathForRequest(fetchStrategy, tree)
  const pendingEntry = createDetachedSegmentCacheEntry(route.staleAt)
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
  fetchStrategy: FetchStrategy,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree
) {
  // This function is called when we've already decided to replace an existing
  // revalidation entry. Create a new entry and write it into the cache,
  // overwriting the previous value.
  const varyPathForRequest = getSegmentVaryPathForRequest(fetchStrategy, tree)
  const pendingEntry = createDetachedSegmentCacheEntry(route.staleAt)
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

  if (isValueExpired(now, getCurrentCacheVersion(), candidateEntry)) {
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
      // We're going to leave revalidating entry in the cache so that it doesn't
      // get revalidated again unnecessarily. Downgrade the Fulfilled entry to
      // Rejected and null out the data so it can be garbage collected. We leave
      // `staleAt` intact to prevent subsequent revalidation attempts only until
      // the entry expires.
      const rejectedEntry: RejectedSegmentCacheEntry = candidateEntry as any
      rejectedEntry.status = EntryStatus.Rejected
      rejectedEntry.loading = null
      rejectedEntry.rsc = null
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
  staleAt: number
): EmptySegmentCacheEntry {
  const emptyEntry: EmptySegmentCacheEntry = {
    status: EntryStatus.Empty,
    // Default to assuming the fetch strategy will be PPR. This will be updated
    // when a fetch is actually initiated.
    fetchStrategy: FetchStrategy.PPR,
    rsc: null,
    loading: null,
    isPartial: true,
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
  // The next time the global cache version is incremented, the entry will
  // effectively be evicted. This happens before initiating the request, rather
  // than when receiving the response, because it's guaranteed to happen
  // before the data is read on the server.
  pendingEntry.version = getCurrentCacheVersion()
  return pendingEntry
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
  metadataVaryPath: PageVaryPath,
  staleAt: number,
  couldBeIntercepted: boolean,
  canonicalUrl: string,
  renderedSearch: NormalizedSearch,
  isPPREnabled: boolean
): FulfilledRouteCacheEntry {
  // The Head is not actually part of the route tree, but other than that, it's
  // fetched and cached like a segment. Some functions expect a RouteTree
  // object, so rather than fork the logic in all those places, we use this
  // "fake" one.
  const metadata: RouteTree = {
    requestKey: HEAD_REQUEST_KEY,
    segment: HEAD_REQUEST_KEY,
    varyPath: metadataVaryPath,
    // The metadata isn't really a "page" (though it isn't really a "segment"
    // either) but for the purposes of how this field is used, it behaves like
    // one. If this logic ever gets more complex we can change this to an enum.
    isPage: true,
    slots: null,
    isRootLayout: false,
    hasLoadingBoundary: HasLoadingBoundary.SubtreeHasNoLoadingBoundary,
    hasRuntimePrefetch: false,
  }
  const fulfilledEntry: FulfilledRouteCacheEntry = entry as any
  fulfilledEntry.status = EntryStatus.Fulfilled
  fulfilledEntry.tree = tree
  fulfilledEntry.metadata = metadata
  fulfilledEntry.staleAt = staleAt
  fulfilledEntry.couldBeIntercepted = couldBeIntercepted
  fulfilledEntry.canonicalUrl = canonicalUrl
  fulfilledEntry.renderedSearch = renderedSearch
  fulfilledEntry.isPPREnabled = isPPREnabled
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
      const childParamName = childPrefetch.name
      const childParamType = childPrefetch.paramType
      const childServerSentParamKey = childPrefetch.paramKey

      let childDoesAppearInURL: boolean
      let childSegment: FlightRouterStateSegment
      let childPartialVaryPath: PartialSegmentVaryPath | null
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
        const childParamKey =
          // The server omits this field from the prefetch response when
          // cacheComponents is enabled.
          childServerSentParamKey !== null
            ? childServerSentParamKey
            : // If no param key was sent, use the value parsed on the client.
              getCacheKeyForDynamicParam(
                childParamValue,
                '' as NormalizedSearch
              )

        childPartialVaryPath = appendLayoutVaryPath(
          partialVaryPath,
          childParamKey
        )
        childSegment = [childParamName, childParamKey, childParamType]
        childDoesAppearInURL = true
      } else {
        // This segment does not have a param. Inherit the partial vary path of
        // the parent.
        childPartialVaryPath = partialVaryPath
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
    varyPath,
    // TODO: Cheating the type system here a bit because TypeScript can't tell
    // that the type of isPage and varyPath are consistent. The fix would be to
    // create separate constructors and call the appropriate one from each of
    // the branches above. Just seems a bit overkill only for one field so I'll
    // leave it as-is for now. If isPage were wrong it would break the behavior
    // and we'd catch it quickly, anyway.
    isPage: isPage as boolean as any,
    slots,
    isRootLayout: prefetch.isRootLayout,
    // This field is only relevant to dynamic routes. For a PPR/static route,
    // there's always some partial loading state we can fetch.
    hasLoadingBoundary: HasLoadingBoundary.SegmentHasLoadingBoundary,
    hasRuntimePrefetch: prefetch.hasRuntimePrefetch,
  }
}

function convertRootFlightRouterStateToRouteTree(
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

function convertFlightRouterStateToRouteTree(
  flightRouterState: FlightRouterState,
  requestKey: SegmentRequestKey,
  parentPartialVaryPath: PartialSegmentVaryPath | null,
  renderedSearch: NormalizedSearch,
  acc: RouteTreeAccumulator
): RouteTree {
  const originalSegment = flightRouterState[0]

  let segment: FlightRouterStateSegment
  let partialVaryPath: PartialSegmentVaryPath | null
  let isPage: boolean
  let varyPath: SegmentVaryPath
  if (Array.isArray(originalSegment)) {
    isPage = false
    const paramCacheKey = originalSegment[1]
    partialVaryPath = appendLayoutVaryPath(parentPartialVaryPath, paramCacheKey)
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
    varyPath,
    // TODO: Cheating the type system here a bit because TypeScript can't tell
    // that the type of isPage and varyPath are consistent. The fix would be to
    // create separate constructors and call the appropriate one from each of
    // the branches above. Just seems a bit overkill only for one field so I'll
    // leave it as-is for now. If isPage were wrong it would break the behavior
    // and we'd catch it quickly, anyway.
    isPage: isPage as boolean as any,
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

    if (routeIsPPREnabled) {
      const prefetchStream = createPrefetchResponseStream(
        response.body,
        closed.resolve,
        function onResponseSizeUpdate(size) {
          setSizeInCacheMap(entry, size)
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

      const staleTimeMs = getStaleTimeMs(serverData.staleTime)
      fulfillRouteCacheEntry(
        entry,
        routeTree,
        metadataVaryPath,
        Date.now() + staleTimeMs,
        couldBeIntercepted,
        canonicalUrl,
        renderedSearch,
        routeIsPPREnabled
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
          setSizeInCacheMap(entry, size)
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
        setSizeInCacheMap(segmentCacheEntry, size)
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
          setSizeInCacheMap(entry, averageSize)
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
          serverData.rp?.[0] === true
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
  // For runtime prefetches, stale time is in the payload at rp[1].
  // For other responses, fall back to the header.
  const staleTimeSeconds =
    typeof serverData.rp?.[1] === 'number'
      ? serverData.rp[1]
      : parseInt(response.headers.get(NEXT_ROUTER_STALE_TIME_HEADER) ?? '', 10)
  const staleTimeMs = !isNaN(staleTimeSeconds)
    ? getStaleTimeMs(staleTimeSeconds)
    : STATIC_STALETIME_MS

  // If the response contains dynamic holes, then we must conservatively assume
  // that any individual segment might contain dynamic holes, and also the
  // head. If it did not contain dynamic holes, then we can assume every segment
  // and the head is completely static.
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

  const fulfilledEntry = fulfillRouteCacheEntry(
    entry,
    routeTree,
    metadataVaryPath,
    now + staleTimeMs,
    couldBeIntercepted,
    canonicalUrl,
    renderedSearch,
    routeIsPPREnabled
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
  spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry> | null
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

  // For runtime prefetches, stale time is in the payload at rp[1].
  // For other responses, fall back to the header.
  const staleTimeSeconds =
    typeof serverData.rp?.[1] === 'number'
      ? serverData.rp[1]
      : parseInt(response.headers.get(NEXT_ROUTER_STALE_TIME_HEADER) ?? '', 10)
  const staleTimeMs = !isNaN(staleTimeSeconds)
    ? getStaleTimeMs(staleTimeSeconds)
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
      let tree = route.tree
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
        task,
        fetchStrategy,
        route,
        tree,
        staleAt,
        seedData,
        isResponsePartial,
        spawnedEntries
      )
    }

    const head = flightData.head
    if (head !== null) {
      fulfillEntrySpawnedByRuntimePrefetch(
        now,
        fetchStrategy,
        route,
        head,
        null,
        flightData.isHeadPartial,
        staleAt,
        route.metadata,
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
  task: PrefetchTask,
  fetchStrategy:
    | FetchStrategy.LoadingBoundary
    | FetchStrategy.PPRRuntime
    | FetchStrategy.Full,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree,
  staleAt: number,
  seedData: CacheNodeSeedData,
  isResponsePartial: boolean,
  entriesOwnedByCurrentTask: Map<
    SegmentRequestKey,
    PendingSegmentCacheEntry
  > | null
) {
  // This function is used to write the result of a runtime server request
  // (CacheNodeSeedData) into the prefetch cache.
  const rsc = seedData[0]
  const loading = seedData[2]
  const isPartial = rsc === null || isResponsePartial
  fulfillEntrySpawnedByRuntimePrefetch(
    now,
    fetchStrategy,
    route,
    rsc,
    loading,
    isPartial,
    staleAt,
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
          task,
          fetchStrategy,
          route,
          childTree,
          staleAt,
          childSeedData,
          isResponsePartial,
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
    | FetchStrategy.PPRRuntime
    | FetchStrategy.Full,
  route: FulfilledRouteCacheEntry,
  rsc: React.ReactNode,
  loading: LoadingModuleData | Promise<LoadingModuleData>,
  isPartial: boolean,
  staleAt: number,
  tree: RouteTree,
  entriesOwnedByCurrentTask: Map<
    SegmentRequestKey,
    PendingSegmentCacheEntry
  > | null
) {
  // We should only write into cache entries that are owned by us. Or create
  // a new one and write into that. We must never write over an entry that was
  // created by a different task, because that causes data races.
  const ownedEntry =
    entriesOwnedByCurrentTask !== null
      ? entriesOwnedByCurrentTask.get(tree.requestKey)
      : undefined
  if (ownedEntry !== undefined) {
    fulfillSegmentCacheEntry(ownedEntry, rsc, loading, staleAt, isPartial)
  } else {
    // There's no matching entry. Attempt to create a new one.
    const possiblyNewEntry = readOrCreateSegmentCacheEntry(
      now,
      fetchStrategy,
      route,
      tree
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
        getSegmentVaryPathForRequest(fetchStrategy, tree),
        newEntry
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
