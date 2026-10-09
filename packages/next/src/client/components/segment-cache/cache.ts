import type { CacheNode, Segment } from '../../../shared/lib/app-router-types'
import type React from 'react'
import {
  PrefetchHint,
  StaticAttemptHints,
} from '../../../shared/lib/app-router-types'
import {
  createVaryParams,
  readVaryParams,
  SEARCH_PARAMS_VARY_ID,
  type VaryParams,
} from '../../../shared/lib/segment-cache/vary-params-decoding'
import { readFulfilledValue } from '../../../shared/lib/rsc-transport'
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
  decodeBufferedResponse,
  decodeResponsePrefix,
  stripIsPartialByte,
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
  type VaryPath,
  type PartialVaryPath,
  getRouteVaryPath,
  getFulfilledRouteVaryPath,
  getFulfilledSegmentVaryPath,
  getSegmentVaryPathForRequest,
  getStaticSegmentVaryPathForRequest,
  getShellSegmentVaryPath,
  cloneVaryPathWithNewSearchParams,
  getPartialVaryPath,
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
  getPathnameFromRequestURL,
  getRenderedPathname,
  getRenderedSearch,
  normalizeRenderedSearch,
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
  DynamicNavigationFlightResponse,
  FlightRouterState,
  InitialRSCPayload,
  NavigationFlightResponse,
  PrefetchFlightResponse,
} from '../../../shared/lib/app-router-types'
import { prepareFlightRouterStateForRequest } from '../../flight-data-helpers'
import { STATIC_STALETIME_MS } from '../router-reducer/reducers/navigate-reducer'
import { pingVisibleLinks } from '../links'
import { AppStage, Completeness } from './types'
import { createPromiseWithResolvers } from '../../../shared/lib/promise-with-resolvers'
import { readFromBFCache, UnknownDynamicStaleTime } from './bfcache'
import {
  discoverKnownRoute,
  matchKnownRoute,
  type KnownRoutePart,
} from './optimistic-routes'
import {
  createNavigationSeed,
  decodeTransportTreeIntoRouteTree,
  createRouteTreeNode,
  readFulfilledStaleTimeSeconds,
} from './decode-server-response'
import { getNavigationBuildId } from '../../navigation-build-id'
import { NEXT_NAV_DEPLOYMENT_ID_HEADER } from '../../../lib/constants'

/**
 * Ensures a minimum stale time of 30s to avoid issues where the server sends a too
 * short-lived stale time, which would prevent anything from being prefetched.
 */
export function getStaleTimeMs(staleTimeSeconds: number): number {
  return Math.max(staleTimeSeconds, 30) * 1000
}

// How long a rejected cache entry blocks re-fetching before it may be
// retried (its staleAt is set this far in the future).
const REJECTION_BACKOFF_MS = 10 * 1000

/**
 * The staleAt to reject entries with when a prefetch fails: if we're
 * offline, expire immediately (-1) so the entry is re-fetched once the
 * scheduler is re-pinged after connectivity is restored; otherwise apply a
 * short backoff. (Unlike navigations and server actions, prefetches don't
 * await `waitForConnection`.)
 */
function getPrefetchErrorStaleAt(error: unknown): number {
  if (process.env.__NEXT_USE_OFFLINE) {
    const { checkOfflineError } =
      require('../offline') as typeof import('../offline')
    if (checkOfflineError(error)) {
      return -1
    }
  }
  return Date.now() + REJECTION_BACKOFF_MS
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

/**
 * The output of a single segment from an RSC server response, stored
 * directly on the RouteTree node it describes.
 *
 * `rsc` may be null: that means the response skipped this segment — it
 * acknowledged the position without rendering it (e.g. an ancestor of a
 * rendered subtree that the client is expected to already have). This is
 * distinct from the RouteTree node's `data` slot being null, which means
 * the response carried no information about the segment at all.
 */
export type RSCSegmentData = {
  rsc: React.ReactNode
  /**
   * Whether anything in the segment's output is not fully resolved:
   * dynamic holes, runtime holes, anything suspended.
   * Resolved at the decode boundary from whichever signal is authoritative
   * for the response's wire form: the staged per-node encoding of
   * per-segment prefetch responses, or the response-level partiality for
   * boolean-form responses (see the `isPartial` derivation in
   * decodeTransportNode).
   *
   * A cache write converts it to the entry's completeness (see
   * writeSegmentDataIntoCache).
   */
  isPartial: boolean
  /**
   * The source of the params this segment's output depends on (root params
   * included). Null means unknown — tracking wasn't enabled, or the decode
   * had no root params to union in — so consumers key on all params.
   */
  varyParams: VaryParams | null
  /**
   * The segment's own staleTime in seconds, when the response carries one
   * (per-segment prefetch responses only — see TransportSegmentData['s']).
   * Null means the response-level staleness governs this segment.
   */
  staleTimeSeconds: number | null
}

export type RouteTree<TData> = {
  requestKey: SegmentRequestKey
  segment: Segment
  varyPath: VaryPath
  // The vary path used for shell-scoped keying of this segment: the
  // segment's vary path with every non-root param replaced with Fallback
  // (see getShellSegmentVaryPath), so one shell-stage entry serves all param
  // values below the root. Precomputed once during tree construction so we
  // don't have to recompute it on every shell request.
  shellVaryPath: VaryPath
  refreshState: RefreshState | null
  data: TData
  // Keyed by parallel route slot name. Stored as a Map rather than a plain
  // object because slot names are app-defined; with a plain object, every
  // distinct combination of slot names creates a different hidden class,
  // making keyed access to the slots megamorphic.
  slots: null | Map<string, RouteTree<TData>>
  // Bitmask of PrefetchHint flags. Encodes route structure metadata:
  // root layout, loading boundaries, instant configs, and runtime prefetch
  // hints.
  prefetchHints: number
}

export type RefreshState = {
  canonicalUrl: string
  renderedSearch: NormalizedSearch
}

// A route's complete render structure. The head is fetched, cached, and
// rendered like a page segment, but it has no position in the route tree, so
// it sits beside the tree as its own one-node tree (see
// createMetadataRouteTree). This is the shape a server response decodes to,
// the router state holds, and a navigation produces.
export type RootRouteTree<TData> = {
  tree: RouteTree<TData>
  head: RouteTree<TData>
}

export function createRootRouteTree<TData>(
  tree: RouteTree<TData>,
  head: RouteTree<TData>
): RootRouteTree<TData> {
  return { tree, head }
}

export function doesRouteStructureMatch<TCurrent, TNext>(
  currentTree: RouteTree<TCurrent>,
  nextTree: RouteTree<TNext>
): boolean {
  // The request key includes the param names and types, but not the values.
  if (currentTree.requestKey !== nextTree.requestKey) {
    return false
  }
  // The root request key is always empty (even for global Not Found), so we
  // have to compare the root segment directly.
  return (
    nextTree.requestKey !== ROOT_SEGMENT_REQUEST_KEY ||
    currentTree.segment === nextTree.segment
  )
}

type RouteCacheEntryShared = {
  // This is false only if we're certain the route cannot be intercepted. It's
  // true in all other cases, including on initialization when we haven't yet
  // received a response from the server.
  couldBeIntercepted: boolean

  // The node in the known route tree whose pattern this entry was predicted
  // from (see matchKnownRoute); the path from the root to that node is the
  // URL shape. Null for entries the server resolved. A predicted entry is a
  // guess that the URL's rewrite (if any) behaves statically; if the server's
  // rendered tree diverges from it, the node is marked so the shape is never
  // predicted again (see KnownRoutePart.hasDynamicRewrite).
  //
  // This is declared on every entry variant (not just fulfilled entries) so
  // that all RouteCacheEntry objects share a single hidden class; it is
  // pre-initialized to `null` when the entry is created.
  predictedFrom: KnownRoutePart | null

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
  root: null
  supportsPerSegmentPrefetching: false
}

type RejectedRouteCacheEntry = RouteCacheEntryShared & {
  status: EntryStatus.Rejected
  blockedTasks: Set<PrefetchTask> | null
  canonicalUrl: null
  renderedSearch: null
  root: null
  supportsPerSegmentPrefetching: boolean
}

export type FulfilledRouteCacheEntry = RouteCacheEntryShared & {
  status: EntryStatus.Fulfilled
  blockedTasks: null
  canonicalUrl: string
  renderedSearch: NormalizedSearch
  root: RootRouteTree<null>
  supportsPerSegmentPrefetching: boolean
}

export type RouteCacheEntry =
  | PendingRouteCacheEntry
  | FulfilledRouteCacheEntry
  | RejectedRouteCacheEntry

type SegmentCacheEntryShared = {
  /**
   * How far the render that produced this entry went, and what's still
   * missing at that stage. A fulfilled entry records what its payload says
   * (see writeSegmentDataIntoCache). A pending entry records what we expect
   * its request to return, and a rejected entry keeps those values. An Empty
   * entry only has placeholders. The scheduler uses these to check whether
   * an entry has what a prefetch needs (see doesEntrySatisfyPrefetch), and
   * isExistingSegmentEntryPreferred uses them to pick between two entries.
   */
  stage: AppStage
  completeness: Completeness

  /**
   * True if this entry was fulfilled from a fallback shell response (the page
   * had not yet been prerendered with concrete params). The scheduler uses
   * this to retry the static prefetch, since a more complete version may
   * become available once the server's background regeneration finishes.
   *
   * Distinct from completeness: a fully-prerendered PPR page can have partial
   * segments that should NOT be retried. See `NavigationFlightResponse['f']`.
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
  blockedTasks: Set<PrefetchTask> | null
  rsc: null
  promise: null
}

export type PendingSegmentCacheEntry = SegmentCacheEntryShared & {
  status: EntryStatus.Pending
  blockedTasks: Set<PrefetchTask> | null
  rsc: null
  promise: null | PromiseWithResolvers<FulfilledSegmentCacheEntry | null>
}

type RejectedSegmentCacheEntry = SegmentCacheEntryShared & {
  status: EntryStatus.Rejected
  blockedTasks: Set<PrefetchTask> | null
  rsc: null
  promise: null
}

export type FulfilledSegmentCacheEntry = SegmentCacheEntryShared & {
  status: EntryStatus.Fulfilled
  blockedTasks: null
  rsc: React.ReactNode | null
  // The source of the params `rsc` depends on, recorded under exactly the
  // condition the entry's key trusts it (see the re-key derivation in
  // writeSegmentDataIntoCache). Null means unknown: consumers assume the
  // output depends on every param. A navigation that renders this entry's
  // `rsc` as its final data carries it onto the CacheNode.
  varyParams: VaryParams | null
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

export const MetadataOnlyRequestTree: FlightRouterState = [
  '',
  {},
  null,
  'metadata-only',
]

const routeCacheMap: CacheMap<RouteCacheEntry> = createCacheMap()

/**
 * The shared segment cache map. Segment cache functions do not access this
 * ambiently — every unit of work is bound to a map when it is created, and
 * reads and writes receive that map explicitly:
 *
 * - A prefetch task captures its map when it is scheduled
 *   (`PrefetchTask.segmentCacheMap` in scheduler.ts). Almost always this one;
 *   a task scheduled while the Instant Navigation Testing lock is held gets
 *   the lock scope's private map instead (which starts empty and is discarded
 *   at release), so a locked navigation observes only data fetched under the
 *   lock — never a stale entry left in the shared cache by an earlier
 *   navigation, prefetch, or scope.
 * - A locked navigation inherits the map of the prefetch task that drives it
 *   (see `ensurePrefetchThenNavigate` in navigation.ts).
 * - Everything else — unlocked navigations, hydration, and router work that
 *   is not a captured navigation (refreshes, history-traversal restores,
 *   server-action redirects, server patches) — uses this shared map
 *   directly, even while a lock is held.
 *
 * Binding at creation means a task queued before a lock scope begins never
 * leaks entries into the scope's map (or reads out of it), and a scope task's
 * late responses never leak into the shared map.
 */
export const segmentCacheMap: CacheMap<SegmentCacheEntry> = createCacheMap()

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
  root: RootRouteTree<CacheNode>
): void {
  currentRouteCacheVersion++
  currentSegmentCacheVersion++

  pingVisibleLinks(nextUrl, root)
  pingInvalidationListeners(nextUrl, root)
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
  root: RootRouteTree<CacheNode>
): void {
  currentRouteCacheVersion++

  pingVisibleLinks(nextUrl, root)
  pingInvalidationListeners(nextUrl, root)
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
  root: RootRouteTree<CacheNode>
): void {
  currentSegmentCacheVersion++

  pingVisibleLinks(nextUrl, root)
  pingInvalidationListeners(nextUrl, root)
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
  root: RootRouteTree<CacheNode>
): void {
  // The rough equivalent of pingVisibleLinks, but for onInvalidate callbacks.
  // This is called when the Next-Url or the base tree changes, since those
  // may affect the result of a prefetch task. It's also called after a
  // cache invalidation.
  if (invalidationListeners !== null) {
    const tasks = invalidationListeners
    invalidationListeners = null
    for (const task of tasks) {
      if (isPrefetchTaskDirty(task, nextUrl, root)) {
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

/**
 * Reads the cache entry for a segment during a navigation. Unlike a plain
 * lookup, prefers a Fulfilled entry over a more-specific Pending or Rejected
 * entry: during a navigation, a less-specific shell entry (e.g. params ->
 * Fallback) should be rendered immediately rather than blocking on a
 * more-specific Pending entry that may still be in-flight.
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
  // The map the navigation is bound to: a locked navigation's driving-task
  // map, or the shared map otherwise.
  map: CacheMap<SegmentCacheEntry>,
  varyPath: VaryPath,
  restrictToShell: boolean = false
): SegmentCacheEntry | null {
  const isRevalidation = false

  let lookupVaryPath = varyPath
  if (process.env.__NEXT_EXPOSE_TESTING_API && restrictToShell) {
    // Instant Navigation Testing API: we're navigating to a link that 1) has
    // Partial Prefetching enabled, and 2) does not have a prefetch prop set.
    // Only the shell may render, not anything that varies on concrete route
    // params.
    lookupVaryPath = getShellSegmentVaryPath(varyPath)
  }

  // Prefer a Fulfilled entry (e.g. a cached shell) over a more-specific
  // Pending/Rejected one so it renders immediately instead of blocking on an
  // in-flight entry.
  const fulfilled = getFromCacheMap(
    now,
    getCurrentSegmentCacheVersion(),
    map,
    lookupVaryPath,
    isRevalidation,
    true
  )
  if (fulfilled !== null) {
    return fulfilled
  }
  return getFromCacheMap(
    now,
    getCurrentSegmentCacheVersion(),
    map,
    lookupVaryPath,
    isRevalidation,
    false
  )
}

function readRevalidatingSegmentCacheEntry(
  now: number,
  map: CacheMap<SegmentCacheEntry>,
  varyPath: VaryPath
): SegmentCacheEntry | null {
  const isRevalidation = true
  return getFromCacheMap(
    now,
    getCurrentSegmentCacheVersion(),
    map,
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
    root: null,
    // This is initialized to true because we don't know yet whether the route
    // could be intercepted. It's only set to false once we receive a response
    // from the server.
    couldBeIntercepted: true,
    // Similarly, we don't yet know if the route supports PPR.
    supportsPerSegmentPrefetching: false,
    predictedFrom: null,
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
      : normalizeRenderedSearch(requestedSearch)

  const optimisticUrl = new URL(
    routeWithNoSearchParams.canonicalUrl,
    location.origin
  )
  optimisticUrl.search = optimisticCanonicalSearch
  const optimisticCanonicalUrl = createHrefFromUrl(optimisticUrl)

  const optimisticRouteTree = deprecated_createOptimisticRouteTree(
    routeWithNoSearchParams.root.tree,
    optimisticRenderedSearch
  )
  const baseMetadataTree = routeWithNoSearchParams.root.head
  const optimisticMetadataTree = createMetadataRouteTree(
    cloneVaryPathWithNewSearchParams(
      baseMetadataTree.varyPath,
      optimisticRenderedSearch
    ),
    baseMetadataTree.prefetchHints,
    null
  )

  // Clone the base route tree, and override the relevant fields with our
  // optimistic values.
  const optimisticEntry: FulfilledRouteCacheEntry = {
    canonicalUrl: optimisticCanonicalUrl,

    status: EntryStatus.Fulfilled,
    // This isn't cloned because it's instance-specific
    blockedTasks: null,
    root: createRootRouteTree(optimisticRouteTree, optimisticMetadataTree),
    couldBeIntercepted: routeWithNoSearchParams.couldBeIntercepted,
    supportsPerSegmentPrefetching:
      routeWithNoSearchParams.supportsPerSegmentPrefetching,
    predictedFrom: null,

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
  tree: RouteTree<null>,
  newRenderedSearch: NormalizedSearch
): RouteTree<null> {
  // Create a new route tree that identical to the original one except for
  // the rendered search string, which is contained in the vary path.

  let clonedSlots: Map<string, RouteTree<null>> | null = null
  const originalSlots = tree.slots
  if (originalSlots !== null) {
    clonedSlots = new Map()
    for (const [parallelRouteKey, childTree] of originalSlots) {
      clonedSlots.set(
        parallelRouteKey,
        deprecated_createOptimisticRouteTree(childTree, newRenderedSearch)
      )
    }
  }

  // The shell vary path Fallbacks search params, so it's unaffected by the
  // new rendered search and can be reused as-is.
  return {
    requestKey: tree.requestKey,
    segment: tree.segment,
    shellVaryPath: tree.shellVaryPath,
    refreshState: tree.refreshState,
    // Optimistic trees are structure-only. (The input tree comes from the
    // route cache, which never carries render output.)
    data: null,
    varyPath: cloneVaryPathWithNewSearchParams(
      tree.varyPath,
      newRenderedSearch
    ),
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
  // The map the calling task operates in (`PrefetchTask.segmentCacheMap`,
  // captured when the task was scheduled).
  map: CacheMap<SegmentCacheEntry>,
  // The vary path to read from (see getSegmentVaryPathForRequest). A shell
  // prefetch reads from the shell vary path, because that's where its request
  // writes. If it read from the concrete path, it might find a deeper entry
  // for this URL and check the wrong one. Everything else reads from the
  // concrete path, which still finds entries stored under a more generic key.
  varyPath: VaryPath,
  // The vary path to store a new entry under, which is the request's own.
  varyPathForRequest: VaryPath
): SegmentCacheEntry {
  const existingEntry = getFromCacheMap(
    now,
    getCurrentSegmentCacheVersion(),
    map,
    varyPath,
    false,
    false
  )
  if (existingEntry !== null) {
    return existingEntry
  }
  return insertEmptySegmentCacheEntry(now, map, varyPathForRequest)
}

/**
 * Creates an empty segment cache entry and inserts it into the cache, keyed
 * at the vary path the request's pending entry is stored under. The stale time
 * is set to a default value; the actual stale time will be set when the entry
 * is fulfilled with data from the server response.
 */
function insertEmptySegmentCacheEntry(
  now: number,
  map: CacheMap<SegmentCacheEntry>,
  varyPathForRequest: VaryPath
): EmptySegmentCacheEntry {
  const emptyEntry = createDetachedSegmentCacheEntry(now)
  const isRevalidation = false
  setInCacheMap(map, varyPathForRequest, emptyEntry, isRevalidation)
  return emptyEntry
}

export function readOrCreateRevalidatingSegmentEntry(
  now: number,
  // The map the calling task operates in (`PrefetchTask.segmentCacheMap`).
  map: CacheMap<SegmentCacheEntry>,
  // The vary path to read from; see readOrCreateSegmentCacheEntry.
  varyPath: VaryPath,
  // Where to store the revalidation: the request's own vary path.
  varyPathForRequest: VaryPath
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
  // a concern because the keypath is based solely on the request, not on data
  // contained in the response.
  const existingEntry = readRevalidatingSegmentCacheEntry(now, map, varyPath)
  if (existingEntry !== null) {
    return existingEntry
  }
  // Create a pending entry and add it to the cache. The stale time is set to a
  // default value; the actual stale time will be set when the entry is
  // fulfilled with data from the server response.
  const pendingEntry = createDetachedSegmentCacheEntry(now)
  const isRevalidation = true
  setInCacheMap(map, varyPathForRequest, pendingEntry, isRevalidation)
  return pendingEntry
}

export function overwriteRevalidatingSegmentCacheEntry(
  now: number,
  // The map the calling task operates in (`PrefetchTask.segmentCacheMap`).
  map: CacheMap<SegmentCacheEntry>,
  // Where to store the revalidation: the request's own vary path.
  varyPathForRequest: VaryPath
) {
  // This function is called when we've already decided to replace an existing
  // revalidation entry. Create a new entry and write it into the cache,
  // overwriting the previous value. The stale time is set to a default value;
  // the actual stale time will be set when the entry is fulfilled with data
  // from the server response.
  const pendingEntry = createDetachedSegmentCacheEntry(now)
  const isRevalidation = true
  setInCacheMap(map, varyPathForRequest, pendingEntry, isRevalidation)
  return pendingEntry
}

/**
 * Whether to keep an existing cache entry instead of replacing it with a new
 * one at the same keypath. (Shadow eviction uses `doesEntryCoverEntry`
 * instead.) This has to be strict and deterministic. Otherwise a
 * revalidation can read back the entry it meant to replace, and loop.
 *
 * We only keep the existing entry if it's strictly better. The more complete
 * entry wins, whatever its stage. If they're equally complete, the deeper
 * stage wins. If they're tied, the new entry replaces the old one. An Empty
 * entry never wins, because it has no data.
 */
function isExistingSegmentEntryPreferred(
  existingEntry: SegmentCacheEntry,
  candidateEntry: SegmentCacheEntry
): boolean {
  if (existingEntry.status === EntryStatus.Empty) {
    return false
  }
  // TODO: A Pending entry has no data yet, so we compare what we expect its
  // request to return. Should it ever win over fulfilled data that arrives in
  // the meantime?
  if (existingEntry.completeness !== candidateEntry.completeness) {
    return existingEntry.completeness > candidateEntry.completeness
  }
  return existingEntry.stage > candidateEntry.stage
}

/**
 * Whether `entry` has everything `other` has: at least the same stage, and at
 * least the same completeness. Shadow eviction uses this to tell whether a
 * more specific entry is still useful, since it might have param-specific
 * content that a more generic one doesn't. An Empty entry has no data, so it
 * covers nothing, and anything covers it.
 */
function doesEntryCoverEntry(
  entry: SegmentCacheEntry,
  other: SegmentCacheEntry
): boolean {
  if (other.status === EntryStatus.Empty) {
    return true
  }
  if (entry.status === EntryStatus.Empty) {
    return false
  }
  return entry.stage >= other.stage && entry.completeness >= other.completeness
}

export function upsertSegmentEntry(
  now: number,
  // The map the whole upsert (existing-entry read, insert, shadow eviction)
  // operates in. Prefetch response-write paths pass the spawning task's map
  // (`PrefetchTask.segmentCacheMap`), so a response that lands after a
  // testing-lock scope boundary still writes into the map its entries
  // live in.
  map: CacheMap<SegmentCacheEntry>,
  varyPath: VaryPath,
  candidateEntry: SegmentCacheEntry,
  // The fully concrete vary path a read for this segment position resolves
  // against (all concrete param values, i.e. `tree.varyPath`) — the most
  // specific path a read would use. Note this is the opposite of the
  // generalized keying path that `getSegmentVaryPathForRequest` computes.
  // Used to detect and evict stale entries at more specific keypaths that
  // would otherwise shadow the candidate. Pass null when there's no request
  // context; the shadow check is skipped.
  lookupVaryPath: VaryPath | null
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

  const existingEntry = getFromCacheMap(
    now,
    getCurrentSegmentCacheVersion(),
    map,
    varyPath,
    false,
    false
  )
  if (existingEntry !== null) {
    // Don't replace a more specific segment with a less-specific one. A case where this
    // might happen is if the existing segment was fetched via
    // `<Link prefetch={true}>`.
    if (isExistingSegmentEntryPreferred(existingEntry, candidateEntry)) {
      // The candidate does not supersede the existing entry. Leave the
      // existing entry in place and discard the candidate by not inserting it.
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

    // Ping any tasks blocked on the existing entry before replacing it so they
    // re-run and pick up the new entry. Without this, tasks waiting on the
    // existing Empty/Pending entry would be stranded — the new fulfilled
    // candidate has no blockedTasks of its own.
    if (
      existingEntry.status === EntryStatus.Empty ||
      existingEntry.status === EntryStatus.Pending
    ) {
      pingBlockedTasks(existingEntry)
    }

    // Replace the existing entry by writing the candidate over its keypath
    // below (the same mechanism `overwriteRevalidatingSegmentCacheEntry`
    // uses). We intentionally do NOT call `deleteFromCacheMap` first: deleting
    // vacates the canonical slot, and `deleteMapEntry` promotes a pending
    // Revalidation-slot entry into the vacated slot — which the immediate
    // insert below would then silently overwrite. The in-flight revalidation
    // would vanish from the map, so the next scheduler pass would find an
    // empty revalidation slot and spawn a duplicate request instead of
    // deduping against it. Replacing in place never vacates the slot, so
    // promotion never runs and the pending revalidating entry stays in its
    // Revalidation slot where `readOrCreateRevalidatingSegmentEntry`'s dedupe
    // finds it.
    //
    // The displaced entry's map/LRU accounting is handled by the replacement
    // itself: `setMapEntryValue` drops the displaced value's `ref` and
    // `updateLruSize` swaps its size for the candidate's, which is exactly
    // what delete-then-insert did.
  }

  const isRevalidation = false
  setInCacheMap(map, varyPath, candidateEntry, isRevalidation)

  if (lookupVaryPath !== null) {
    evictShadowingSegmentEntries(now, map, lookupVaryPath, candidateEntry)
  }

  return candidateEntry
}

/**
 * Evicts stale entries at more specific keypaths that shadow a just-inserted
 * candidate entry.
 *
 * A response can be written to the cache at a MORE GENERIC vary path than the
 * path the request was issued against — for example, the server may report
 * that a segment doesn't vary on a param, so the entry is re-keyed with that
 * param as Fallback. Meanwhile, an older, less useful entry can exist at a
 * more specific path within the same fallback chain — for example, a partial
 * shell entry keyed with root params concrete (see
 * `getShellSegmentVaryPath`). Because segment lookup is
 * most-specific-match-wins, every subsequent read at the concrete request
 * path keeps returning the stale specific entry, and the more complete
 * generic entry is unreachable from that URL. That both wastes the completed
 * request and can loop: a prefetch task that revalidated the segment reads
 * back the same stale entry, decides it needs to revalidate again, and
 * repeats forever.
 *
 * The upsert is the one moment we know the ordering between the two entries:
 * the candidate was produced by a request for this segment position, and
 * `lookupVaryPath` is the fully concrete path a read for that position
 * resolves against, so any entry that a read at that path would return in the
 * candidate's stead is directly comparable to it. Precedence only applies to
 * entries at the same key. A more specific entry at a different key is only
 * useless if the candidate has everything it has (see `doesEntryCoverEntry`).
 * Otherwise it might have deeper, param-specific content. If the entry is
 * settled and the candidate covers it, we never want to match it again, so we
 * delete it. That makes the candidate reachable.
 *
 * Pending entries are never evicted here: they're owned by an in-flight
 * request that will settle them. Empty entries ARE evictable — they're
 * unclaimed placeholders with nothing in them, so they must not shadow real
 * data; their blocked tasks are pinged so they re-run against the candidate.
 */
function evictShadowingSegmentEntries(
  now: number,
  map: CacheMap<SegmentCacheEntry>,
  lookupVaryPath: VaryPath,
  candidateEntry: SegmentCacheEntry
): void {
  // There can in principle be multiple shadowing entries at successively less
  // specific keypaths, so loop until the read returns the candidate (or an
  // entry we don't supersede). Each iteration re-reads and re-checks from
  // scratch (in part because `deleteFromCacheMap` can promote a settled
  // Revalidation-slot value into the just-vacated slot, surfacing a new entry
  // at the same keypath). Each iteration deletes an entry from the map, so
  // the loop terminates naturally; the bound is defensive, and 32 is far
  // beyond any real fallback chain, which is bounded by the vary
  // path's length.
  for (let i = 0; i < 32; i++) {
    const shadowEntry = getFromCacheMap(
      now,
      getCurrentSegmentCacheVersion(),
      map,
      lookupVaryPath,
      false,
      false
    )
    if (shadowEntry === null || shadowEntry === candidateEntry) {
      // The candidate is reachable from the lookup path (or the read missed
      // entirely, e.g. because the candidate expired). Done.
      return
    }
    if (shadowEntry.status === EntryStatus.Pending) {
      // Don't evict a Pending entry. An in-flight request owns it, and it
      // will settle on its own. (An Empty entry is different. It has nothing
      // in it, so the candidate always covers it, and we evict it below. That
      // wakes any tasks blocked on it, so they run again and find the
      // candidate.)
      return
    }
    if (!doesEntryCoverEntry(candidateEntry, shadowEntry)) {
      // The shadowing entry has something the candidate doesn't, like a
      // deeper stage with param-specific content. Leave it, so reads at this
      // path keep finding it.
      return
    }
    // The candidate covers the shadowing entry. Evict it. Settled entries
    // shouldn't have blocked tasks (Fulfilled always has `blockedTasks:
    // null`, and Rejected entries were pinged at rejection), but an Empty
    // entry may have them — ping before deleting, matching the upsert-evict
    // pattern above.
    pingBlockedTasks(shadowEntry)
    deleteFromCacheMap(shadowEntry)
  }
}

export function createDetachedSegmentCacheEntry(
  now: number
): EmptySegmentCacheEntry {
  // Default stale time for pending segment cache entries. The actual stale time
  // is set when the entry is fulfilled with data from the server response.
  const staleAt = now + 30 * 1000
  const emptyEntry: EmptySegmentCacheEntry = {
    status: EntryStatus.Empty,
    blockedTasks: null,
    // Placeholders. They're replaced when a fetch is actually initiated.
    stage: AppStage.Shell,
    completeness: Completeness.NeedsRuntime,
    rsc: null,
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
  // What we expect the request to return.
  stage: AppStage,
  completeness: Completeness
): PendingSegmentCacheEntry {
  const pendingEntry: PendingSegmentCacheEntry = emptyEntry as any
  pendingEntry.status = EntryStatus.Pending
  pendingEntry.stage = stage
  pendingEntry.completeness = completeness

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
  tree: RouteTree<RSCSegmentData | null>
): FulfilledSegmentCacheEntry | null {
  // Attempts to fulfill an empty segment cache entry using data from the
  // bfcache. This is only valid during a legacy full prefetch (i.e. one that
  // includes dynamic data), because the bfcache stores data from navigations
  // which always include dynamic data.

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

    const pendingSegment = upgradeToPendingSegment(
      segment,
      AppStage.Navigation,
      Completeness.FullyComplete
    )
    return fulfillSegmentCacheEntry(
      pendingSegment,
      bfcacheEntry.rsc,
      dynamicPrefetchStaleAt,
      bfcacheEntry.varyParams,
      // bfcache data is concrete, never an ISR fallback.
      false,
      AppStage.Navigation,
      Completeness.FullyComplete
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
  // The map the calling task operates in (`PrefetchTask.segmentCacheMap`).
  map: CacheMap<SegmentCacheEntry>,
  tree: RouteTree<RSCSegmentData | null>
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
      AppStage.Navigation,
      Completeness.FullyComplete
    )
    const newEntry = fulfillSegmentCacheEntry(
      pendingSegment,
      bfcacheEntry.rsc,
      dynamicPrefetchStaleAt,
      bfcacheEntry.varyParams,
      // bfcache data is concrete, never an ISR fallback.
      false,
      AppStage.Navigation,
      Completeness.FullyComplete
    )
    const segmentVaryPath = getSegmentVaryPathForRequest(
      AppStage.Navigation,
      tree
    )
    const upserted = upsertSegmentEntry(
      now,
      map,
      segmentVaryPath,
      newEntry,
      // The concrete lookup path this BFCache upgrade applies to. (In
      // practice a legacy dynamic path is already fully concrete, so nothing
      // can shadow the new entry and the shadow check is a no-op.)
      tree.varyPath
    )
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

/**
 * The head's request key on the client. The server's own key for the head,
 * HEAD_REQUEST_KEY, carries no path information: there is only one head per
 * URL, so the server has no need to distinguish parallel pages. On the client
 * the request key is the head's cache identity and what doesRouteStructureMatch
 * compares, so the head takes its page's request key with HEAD_REQUEST_KEY
 * appended — the key the server would have assigned had the head been a
 * segment below the page — and two pages' heads never match. The head varies
 * on the same params as its page, so the rest of its vary path is the page's.
 * The page must be the route's own: a page in a slot retained from another
 * URL (one with a refresh state) belongs to that URL's head. When a route has
 * multiple parallel pages of its own, the first one is used; the keys only
 * differ in route groups and slot names, so any of them works as long as it
 * is always the same one.
 */
export function getHeadRequestKey(
  pageRequestKey: SegmentRequestKey
): SegmentRequestKey {
  return (pageRequestKey + HEAD_REQUEST_KEY) as SegmentRequestKey
}

export function createMetadataRouteTree<TData>(
  metadataVaryPath: VaryPath,
  // The route root's prefetch hints. The head has no node of its own on the
  // wire, so the route-level hint that applies to it is copied from the root.
  rootPrefetchHints: number,
  // The head's payload, with the same lifetimes as a segment node's `data`
  // (see RouteTree): null in the route cache, the response's decoded
  // head on a navigation seed, a CacheNode on the router state.
  data: TData
): RouteTree<TData> {
  // The head is a one-node tree beside the route tree (see RootRouteTree). It
  // has no position in the route tree, but it's fetched, cached, compared, and
  // rendered like a segment, so it is a RouteTree node like any other.
  const metadata: RouteTree<TData> = {
    // The first entry of the head's vary path (see getHeadRequestKey). The
    // server knows nothing of this key; it is always asked for
    // HEAD_REQUEST_KEY, which is why the segment stays the bare marker.
    requestKey: metadataVaryPath.value,
    segment: HEAD_REQUEST_KEY,
    shellVaryPath: getShellSegmentVaryPath(metadataVaryPath),
    refreshState: null,
    data,
    varyPath: metadataVaryPath,
    slots: null,
    // Only the static-attempt bits apply to the head: it's a route-level
    // fact ("static per-segment responses may exist for this route"), and
    // it's what lets a shell-stage cached head attempt a static head fetch
    // before deopting to a runtime request (see the shell-stage eligibility
    // check in pingSegmentBundle). The other bits describe tree structure
    // the head doesn't participate in.
    prefetchHints: rootPrefetchHints & StaticAttemptHints,
  }
  return metadata
}

/**
 * Returns an equivalent tree with `data: null` at every node, cloning only
 * the subtrees that carry data. Called when a tree is stored in the route
 * cache: route cache entries live indefinitely, so retaining render output
 * there would pin RSC payloads in memory outside the segment cache's eviction
 * control. See the lifecycle note on RouteTree.
 */
function stripDataFromRouteTree(
  tree: RouteTree<RSCSegmentData | null>
): RouteTree<null> {
  let clonedSlots: Map<string, RouteTree<null>> | null = null
  const slots = tree.slots
  if (slots !== null) {
    for (const [parallelRouteKey, childTree] of slots) {
      const strippedChild = stripDataFromRouteTree(childTree)
      if (strippedChild !== childTree && clonedSlots === null) {
        // Sound cast: any copied value that isn't overwritten below is one
        // where stripDataFromRouteTree returned the child unchanged, which
        // means that subtree carries no data.
        clonedSlots = new Map(slots) as Map<string, RouteTree<null>>
      }
      if (clonedSlots !== null) {
        clonedSlots.set(parallelRouteKey, strippedChild)
      }
    }
  }
  if (tree.data === null && clonedSlots === null) {
    // Neither this node nor any descendant carries data. Reuse it as-is.
    // This is the common case for trees that never carried render output
    // (e.g. route tree prefetch responses). Sound cast for the same reason.
    return tree as RouteTree<null>
  }
  // Sound cast: clonedSlots is null here only if every child subtree was
  // verified data-free by the loop above.
  const strippedSlots = (clonedSlots ?? slots) as Map<
    string,
    RouteTree<null>
  > | null
  return {
    requestKey: tree.requestKey,
    segment: tree.segment,
    shellVaryPath: tree.shellVaryPath,
    refreshState: tree.refreshState,
    data: null,
    varyPath: tree.varyPath,
    slots: strippedSlots,
    prefetchHints: tree.prefetchHints,
  }
}

export function fulfillRouteCacheEntry(
  now: number,
  entry: PendingRouteCacheEntry,
  root: RootRouteTree<RSCSegmentData | null>,
  couldBeIntercepted: boolean,
  canonicalUrl: string,
  renderedSearch: NormalizedSearch,
  supportsPerSegmentPrefetching: boolean
): FulfilledRouteCacheEntry {
  const tree = root.tree
  const fulfilledEntry: FulfilledRouteCacheEntry = entry as any
  fulfilledEntry.status = EntryStatus.Fulfilled
  fulfilledEntry.root = createRootRouteTree(
    stripDataFromRouteTree(tree),
    stripDataFromRouteTree(root.head)
  )
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
  pingBlockedTasks(entry)
  return fulfilledEntry
}

export function writeRouteIntoCache(
  now: number,
  pathname: NormalizedPathname,
  search: NormalizedSearch,
  nextUrl: string | null,
  root: RootRouteTree<RSCSegmentData | null>,
  couldBeIntercepted: boolean,
  canonicalUrl: string,
  renderedSearch: NormalizedSearch,
  supportsPerSegmentPrefetching: boolean
): FulfilledRouteCacheEntry {
  const pendingEntry = createDetachedRouteCacheEntry()
  const fulfilledEntry = fulfillRouteCacheEntry(
    now,
    pendingEntry,
    root,
    couldBeIntercepted,
    canonicalUrl,
    renderedSearch,
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

function fulfillSegmentCacheEntry(
  segmentCacheEntry: PendingSegmentCacheEntry,
  rsc: React.ReactNode,
  staleAt: number,
  varyParams: VaryParams | null,
  // Only static (per-segment PPR) responses can be ISR fallbacks; all other
  // callers pass false. Always assigned (even when false) so that re-fulfilling
  // a previously-fallback entry with a concrete response clears the flag and
  // ends the retry loop.
  isUpgradeableISRFallback: boolean,
  // What the payload reports, which replaces the expected values set by
  // upgradeToPendingSegment. See SegmentCacheEntryShared['stage'].
  stage: AppStage,
  completeness: Completeness
): FulfilledSegmentCacheEntry {
  const fulfilledEntry: FulfilledSegmentCacheEntry = segmentCacheEntry as any
  fulfilledEntry.status = EntryStatus.Fulfilled
  fulfilledEntry.rsc = rsc
  fulfilledEntry.staleAt = staleAt
  fulfilledEntry.varyParams = varyParams
  fulfilledEntry.isUpgradeableISRFallback = isUpgradeableISRFallback
  fulfilledEntry.stage = stage
  fulfilledEntry.completeness = completeness
  // Resolve any listeners that were waiting for this data.
  if (segmentCacheEntry.promise !== null) {
    segmentCacheEntry.promise.resolve(fulfilledEntry)
    // Free the promise for garbage collection.
    fulfilledEntry.promise = null
  }
  pingBlockedTasks(segmentCacheEntry)
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
  pingBlockedTasks(entry)
}

export type RouteTreeAccumulator = {
  metadataVaryPath: VaryPath | null
  // Whether the decoded tree's segment identities diverged from the base
  // tree it was overlaid onto. See NavigationSeed.treeDivergedFromBase.
  treeDivergedFromBase: boolean
}

export function convertRootFlightRouterStateToRouteTree(
  flightRouterState: FlightRouterState,
  renderedSearch: NormalizedSearch,
  acc: RouteTreeAccumulator
): RouteTree<null> {
  return convertFlightRouterStateToRouteTree(
    flightRouterState,
    ROOT_SEGMENT_REQUEST_KEY,
    null,
    renderedSearch,
    acc
  )
}

export function rebaseInactiveRouteTree<TData>(
  treeToRebase: RouteTree<TData>
): RouteTree<null> {
  // A parallel route slot that the target route doesn't provide keeps the
  // slot already active on the current route, under the new parent. The slot
  // sits at the same route position, so its request keys and vary paths are
  // unchanged: copy the structure and drop the payloads, which belong to the
  // previous render and are reused separately by render-tree.
  let slots: Map<string, RouteTree<null>> | null = null
  if (treeToRebase.slots !== null) {
    slots = new Map()
    for (const [parallelRouteKey, child] of treeToRebase.slots) {
      slots.set(parallelRouteKey, rebaseInactiveRouteTree(child))
    }
  }
  return {
    requestKey: treeToRebase.requestKey,
    segment: treeToRebase.segment,
    varyPath: treeToRebase.varyPath,
    shellVaryPath: treeToRebase.shellVaryPath,
    refreshState: treeToRebase.refreshState,
    data: null,
    slots,
    prefetchHints: treeToRebase.prefetchHints,
  }
}

export function convertFlightRouterStateToRouteTree(
  flightRouterState: FlightRouterState,
  requestKey: SegmentRequestKey,
  parentPartialVaryPath: PartialVaryPath | null,
  parentRenderedSearch: NormalizedSearch,
  acc: RouteTreeAccumulator
): RouteTree<null> {
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
  // Use the incoming search params, even if the response has no new data for
  // this segment. The base tree may still have the previous URL's. History
  // restores pass in their saved search params instead.
  const renderedSearch =
    refreshState !== null ? refreshState.renderedSearch : parentRenderedSearch

  const tree = createRouteTreeNode<null>(
    originalSegment,
    isRootParam,
    requestKey,
    parentPartialVaryPath,
    renderedSearch,
    refreshState,
    acc
  )
  const partialVaryPath = getPartialVaryPath(tree.varyPath)

  let slots: Map<string, RouteTree<null>> | null = null

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
      slots = new Map()
    }
    slots.set(parallelRouteKey, childTree)
  }

  tree.slots = slots
  tree.prefetchHints = flightRouterState[4] ?? 0
  return tree
}

export function convertRouteTreeToFlightRouterState<TData>(
  routeTree: RouteTree<TData>
): FlightRouterState {
  const parallelRoutes: Record<string, FlightRouterState> = {}
  const slots = routeTree.slots
  if (slots !== null) {
    for (const [parallelRouteKey, childTree] of slots) {
      parallelRoutes[parallelRouteKey] =
        convertRouteTreeToFlightRouterState(childTree)
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
        rejectRouteCacheEntry(entry, Date.now() + REJECTION_BACKOFF_MS)
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
      rejectRouteCacheEntry(entry, Date.now() + REJECTION_BACKOFF_MS)
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
    // returns. This mechanism is only still meaningful for legacy full
    // prefetches, which use incremental streaming. Consider removing the
    // `closed` plumbing for buffered prefetch paths.
    const closed = createPromiseWithResolvers<void>()

    // Note this doesn't imply PPR is enabled for the route: fully static
    // routes serve from the per-segment cache too. What it does tell us is
    // that per-segment prefetching is supported, which is what the route
    // entry records below.
    const supportsPerSegmentPrefetching = wasServedFromPerSegmentCache(response)

    // Decode the response. Routes that support per-segment prefetching
    // respond from static storage; other routes respond with a live render
    // (see the isRouteTreePrefetchRequest branch in
    // walk-tree-with-flight-router-state). Both are
    // NavigationFlightResponses carrying a buildId and a structure-only
    // transport tree — which is all this flow reads — so one decode path
    // serves both.
    const buffer = await bufferPrefetchResponseBody(response.body)
    closed.resolve()
    setSizeInCacheMap(entry, buffer.byteLength)
    const serverData = await decodeBufferedResponse<NavigationFlightResponse>(
      buffer,
      headers
    )

    if (
      (response.headers.get(NEXT_NAV_DEPLOYMENT_ID_HEADER) ?? serverData.b) !==
      getNavigationBuildId()
    ) {
      // The server build does not match the client. Treat as a 404. During
      // an actual navigation, the router will trigger an MPA navigation.
      // TODO: We should cache the fact that this is an MPA navigation.
      rejectRouteCacheEntry(entry, Date.now() + REJECTION_BACKOFF_MS)
      return null
    }

    const transportData = serverData.t
    if (transportData === undefined || serverData.n !== undefined) {
      // The response carries no route tree (e.g. it's an MPA navigation), so
      // there's nothing to cache.
      rejectRouteCacheEntry(entry, Date.now() + REJECTION_BACKOFF_MS)
      return null
    }

    // Get the params that were used to render the target page. These may
    // be different from the params in the request URL, if the page
    // was rewritten. The rendered pathname is also used to fill in the param
    // values the server omitted from the response (omitting them keeps the
    // response cacheable across param values).
    const renderedPathname = getRenderedPathname(response)
    const renderedSearch = getRenderedSearch(response)

    // Decode the server-sent tree into the RouteTree format used by the
    // client cache.
    //
    // During this traversal, we accumulate additional data into this
    // "accumulator" object.
    const acc: RouteTreeAccumulator = {
      metadataVaryPath: null,
      treeDivergedFromBase: false,
    }
    const routeTree = decodeTransportTreeIntoRouteTree(
      transportData.t,
      null,
      // The tree is structure-only (no data nodes), so there are no vary
      // params to decode...
      null,
      // ...and no partiality either; the conservative value is never read.
      true,
      renderedPathname,
      renderedSearch,
      acc
    )
    const metadataVaryPath = acc.metadataVaryPath
    if (metadataVaryPath === null) {
      rejectRouteCacheEntry(entry, Date.now() + REJECTION_BACKOFF_MS)
      return null
    }

    discoverKnownRoute(
      Date.now(),
      pathname,
      search,
      nextUrl,
      entry,
      {
        tree: routeTree,
        head: createMetadataRouteTree(
          metadataVaryPath,
          routeTree.prefetchHints,
          null
        ),
      },
      couldBeIntercepted,
      canonicalUrl,
      renderedSearch,
      supportsPerSegmentPrefetching,
      false // hasDynamicRewrite
    )

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
    rejectRouteCacheEntry(entry, getPrefetchErrorStaleAt(error))
    return null
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

export async function fetchSegmentPrefetchesUsingStaticRequest(
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  routeKey: RouteCacheKey,
  tree: RouteTree<RSCSegmentData | null>,
  // The pending cache entries this task spawned for the bundle, keyed by
  // segment request key. The response fulfills them when it arrives.
  spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry>,
  // The stage the bundle's entries were spawned at: the shell, or the whole
  // prerender (Navigation). The request is the same either way. This only
  // controls which payload of the response fulfills the entries.
  stage: AppStage.Shell | AppStage.Navigation
): Promise<PrefetchSubtaskResult<null> | null> {
  // This function is allowed to use async/await because it contains the actual
  // fetch that gets issued on a cache miss. Notice it writes the result to the
  // cache entry directly, rather than return data that is then written by
  // the caller.
  //
  // Segment fetches are non-blocking so we don't need to ping the scheduler
  // on completion.
  let isUpgradeableISRFallback
  try {
    isUpgradeableISRFallback = await fetchAndWritePerSegmentPrefetchResponse(
      task,
      route,
      routeKey,
      tree,
      spawnedEntries,
      stage,
      // Write the response even if it's an upgradeable fallback shell — the
      // fallback content is better than nothing while the retry loop waits
      // for the concrete version.
      false
    )
  } catch (error) {
    // The connection failed, or the response couldn't be decoded. Reject the
    // pending entries so they don't stay Pending forever, and get retried
    // once the entry expires.
    rejectSegmentEntriesIfStillPending(
      spawnedEntries,
      getPrefetchErrorStaleAt(error)
    )
    return null
  }

  if (isUpgradeableISRFallback === null) {
    // The response was fetched but isn't usable yet (server error/miss, empty
    // data, or a build-id mismatch — the server may be transiently unready).
    // Reject with a short backoff so the entries are retried soon.
    rejectSegmentEntriesIfStillPending(
      spawnedEntries,
      Date.now() + REJECTION_BACKOFF_MS
    )
    return null
  }

  return {
    value: null,
    // The response is fully buffered before it's decoded, so the network
    // connection is already closed by the time the fetch returns. See TODO
    // in fetchRouteOnCacheMiss about removing `closed` for buffered
    // prefetch paths.
    closed: Promise.resolve(),
  }
}

/**
 * Issues a single segment-bundle prefetch request, validates and decodes the
 * response, and writes every payload of it into the cache — the full
 * payload, and, when the response carries a shell byte boundary, a second
 * decode of the same bytes truncated at that boundary, the segments'
 * shell-stage variant — through writeResponsePayloadsIntoCache, which picks
 * the payload that fulfills the spawned entries and the stage and
 * completeness each payload records.
 *
 * Returns whether the response was an upgradeable ISR fallback shell (the
 * page hadn't been prerendered with concrete params yet), or `null` if the
 * response was fetched but isn't usable yet (server error/miss, empty data,
 * or a build-id mismatch — the server may be transiently unready, so it's
 * worth retrying; nothing is written and no entries are rejected). THROWS if
 * the connection failed or the response couldn't be decoded; re-issuing the
 * identical request won't fix that, so callers should give up rather
 * than retry.
 *
 * When the response is an upgradeable fallback shell, this also starts the
 * task's localized fallback-retry loop (at most one per task, ever), BEFORE
 * writing the fallback content — see the comment on the transition below.
 *
 * The retry loop calls this again to re-issue the same request until the
 * server has the concrete version, passing its own pending entries and
 * `discardFallbackResponse`, so a response that is STILL a fallback isn't
 * pointlessly re-written over the identical fallback content the initial
 * fetch already cached.
 */
async function fetchAndWritePerSegmentPrefetchResponse(
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  routeKey: RouteCacheKey,
  tree: RouteTree<RSCSegmentData | null>,
  spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry>,
  stage: AppStage.Shell | AppStage.Navigation,
  // When true, a response that is still an upgradeable fallback shell is
  // discarded instead of written (the fallback-retry loop's re-issued
  // requests).
  discardFallbackResponse: boolean
): Promise<boolean | null> {
  // Use the canonical URL to request the segment, not the original URL. These
  // are usually the same, but the canonical URL will be different if the route
  // tree response was redirected. To avoid an extra waterfall on every segment
  // request, we pass the redirected URL instead of the original one.
  const url = new URL(route.canonicalUrl, location.origin)
  const nextUrl = routeKey.nextUrl

  let normalizedRequestKey: SegmentRequestKey
  if (tree.segment === HEAD_REQUEST_KEY) {
    // The head's request key is its client cache identity; the server only
    // knows the head by its bare marker, which is also the head node's
    // segment (see createMetadataRouteTree).
    normalizedRequestKey = HEAD_REQUEST_KEY
  } else if (tree.requestKey === ROOT_SEGMENT_REQUEST_KEY) {
    // The root segment is a special case. To simplify the server-side
    // handling of these requests, we encode the root segment path as
    // `_index` instead of as an empty string. This should be treated as
    // an implementation detail and not as a stable part of the protocol.
    // It just needs to match the equivalent logic that happens when
    // prerendering the responses. It should not leak outside of Next.js.
    normalizedRequestKey = '/_index' as SegmentRequestKey
  } else {
    normalizedRequestKey = tree.requestKey
  }

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
    // Theoretically this check should never fail, because we only issue
    // requests for segments once we've verified that the route supports PPR.
    !wasServedFromPerSegmentCache(response) ||
    !response.body
  ) {
    // Server responded with an error or a miss — fetched but not usable.
    return null
  }

  const buffer = await bufferPrefetchResponseBody(response.body)

  // Parse the response. Always a PrefetchFlightResponse. A connection drop
  // or malformed stream throws here, which propagates to the caller as a
  // non-retryable failure.
  const serverResponse = await decodeBufferedResponse<PrefetchFlightResponse>(
    buffer,
    headers
  )

  if (serverResponse.t === undefined) {
    // The response carries no segment data at all — not usable.
    // writeServerResponseIntoCache checks this again, but this fetch-layer
    // copy is deliberate: it must run before the fallback-retry loop is
    // started and before the payload writes below, neither of which should
    // happen for an empty response.
    return null
  }
  if (
    (response.headers.get(NEXT_NAV_DEPLOYMENT_ID_HEADER) ??
      serverResponse.b) !== getNavigationBuildId()
  ) {
    // The server build does not match the client. Treat as a 404. During
    // an actual navigation, the router will trigger an MPA navigation.
    return null
  }

  // True if the server served an upgradeable fallback shell (the page hadn't
  // been prerendered with concrete params yet, but the route can be
  // upgraded once the server's background regeneration finishes).
  const isUpgradeableISRFallback = serverResponse.f === true
  if (isUpgradeableISRFallback) {
    if (discardFallbackResponse) {
      // Still a fallback — the server hasn't finished regenerating. Don't
      // write it; the retry loop will re-issue the request.
      return true
    }
    // Drive a localized retry loop to pick up the concrete version once the
    // server's background regeneration finishes. Only the first fallback
    // response per task starts a loop (`fallbackRetryStatus === Empty`);
    // once it leaves Empty, no second loop is started — sibling bundle
    // responses that also got a fallback don't, and neither does a re-hover.
    //
    // The transition to Pending must happen BEFORE the fallback content is
    // written below: fulfilling an entry pings the tasks blocked on it, and
    // a scheduler pass that ran before the transition would observe a
    // fulfilled fallback entry with the retry gate still Empty and spawn a
    // duplicate revalidation request (see isUpgradeableISRFallbackRetry in
    // pingSegmentBundle in scheduler.ts).
    if (task.fallbackRetryStatus === EntryStatus.Empty && !task.isCanceled) {
      task.fallbackRetryStatus = EntryStatus.Pending
      // Fire-and-forget: the loop drives itself via timers and pings the
      // task on success.
      void retryUpgradeableFallbackPrefetch(
        task,
        route,
        routeKey,
        tree,
        spawnedEntries
      )
    }
  }

  // If the response lists where its shell ends, decode the buffered bytes a
  // second time, cut off there. That's what gives us the shell: each
  // segment's param-dependent rows come after the cut, so they decode as
  // pending, and render as the param fallback. Values like
  // `needsRuntimeRequest` and `isPartial` that resolve after the cut also
  // read as pending. So a runtime data access after the shell doesn't mark
  // the shell itself as needing a runtime request.
  // If `a` is missing, the response has no shell. The server leaves it out
  // when the page wasn't staged (see renderSegmentPrefetch). An unresolved
  // `a` would be a bug, since we have the whole buffer, but we treat it the
  // same way. Either way the scheduler skips these segments instead of
  // sending a runtime request (see writeResponsePayloadsIntoCache). That
  // costs us a shell prefetch, but it never puts content from after the
  // shell where a shell belongs.
  const stageByteLengths =
    serverResponse.a !== undefined
      ? readFulfilledValue(serverResponse.a, undefined)
      : undefined
  let shellResponse: PrefetchFlightResponse | null
  if (stageByteLengths === undefined) {
    shellResponse = null
  } else if (stageByteLengths.length === 0) {
    // The shell ends at the end of the response.
    shellResponse = serverResponse
  } else {
    try {
      shellResponse = await decodeBufferedResponse<PrefetchFlightResponse>(
        buffer.subarray(0, stageByteLengths[AppStage.Shell]),
        headers
      )
    } catch {
      // The truncated prefix couldn't be decoded. Treat it as if no shell
      // exists; the full payload is still usable. (If the bundle was spawned
      // for the shell, its entries are rejected, and the scheduler skips them
      // instead of sending a runtime request. See
      // writeResponsePayloadsIntoCache.)
      shellResponse = null
    }
  }

  // If the response lists where the prefetch stage ends, decode the bytes up
  // to there, just to read `u`. That tells us whether anything up to the end
  // of the prefetch stage read runtime data. If the prefix can't be decoded,
  // we only use the full payload's `u`, as if no offset was listed.
  const prefetchStageByteLength: number | undefined =
    stageByteLengths?.[AppStage.Prefetch]
  let prefetchStageNeedsRuntimeRequest: PrefetchFlightResponse['u'] = undefined
  if (prefetchStageByteLength !== undefined) {
    try {
      const prefetchStageResponse =
        await decodeBufferedResponse<PrefetchFlightResponse>(
          buffer.subarray(0, prefetchStageByteLength),
          headers
        )
      prefetchStageNeedsRuntimeRequest = prefetchStageResponse.u
    } catch {}
  }

  // The pathname the page was rendered for, derived the same way the route
  // tree fetch derives it (the rewritten-path header when the request was
  // rewritten, the request URL otherwise) so the vary paths computed from
  // this response's decoded tree agree with the ones on the route entry's
  // tree. In output: "export" mode the response URL has the segment filename
  // appended to the pathname, so derive it from the page URL instead
  // (rewrites don't exist on a static host).
  const renderedPathname = isOutputExportMode
    ? getPathnameFromRequestURL(url)
    : getRenderedPathname(response)

  // Write the payloads into the cache. Each payload is decoded like any
  // other server response — a root-anchored tree plus an optional head, with
  // no base overlay (the response covers its own spine) — and written
  // through the same path as a live-render response. Notes on the
  // arguments:
  // - Dynamic segments the server sent without a param value (`k: null`) are
  //   parsed from the rendered pathname, and the rendered search is the one
  //   the route tree was built with, so the decoded tree's vary paths agree
  //   with the ones on the route entry's tree.
  // - The build id was already verified above, so none is passed.
  // - The response-level staleness is only a fallback, for segments that
  //   don't carry their own staleTime (per-segment responses normally
  //   always do).
  // - Response-level partiality is unused for per-segment writes — each
  //   segment (and the head) carries its own partiality via the staged
  //   promise encoding, which the decode reads in preference to the
  //   response-level value — so the conservative value (true) is passed.
  // - The head is keyed at the route's own metadata vary path: the head has
  //   no tree position, so the decode could only derive a vary path for it
  //   from a page node in the payload's own tree. A per-segment response
  //   carries only the spine from the root to the requested segment, so any
  //   response whose terminal isn't a page has no page node to key the head
  //   from; the standalone head response is one such case.
  const now = Date.now()
  const metadataVaryPath = route.root.head.varyPath
  writeResponsePayloadsIntoCache(
    now,
    stage,
    serverResponse,
    shellResponse,
    prefetchStageNeedsRuntimeRequest,
    null,
    // The payloads are root-anchored (no base tree), so there's no
    // prediction to diverge from.
    null,
    renderedPathname,
    route.renderedSearch,
    undefined,
    now + STATIC_STALETIME_MS,
    true,
    metadataVaryPath,
    spawnedEntries,
    buffer.byteLength,
    task.segmentCacheMap
  )
  return isUpgradeableISRFallback
}

/**
 * Reads a stale-at time from the staleTime async iterable of a fully-buffered
 * response — stage decodes, which go through
 * `bufferPrefetchResponseBody`. Drains synchronously via
 * `readFulfilledStaleTimeSeconds` (see decode-server-response). A missing
 * iterable, or a truncated shell decode whose value landed past the
 * boundary, reads as absent and falls back to the static stale time.
 *
 * For the one response kind that isn't buffered when read — a legacy full
 * response — use `resolveStaleAt` instead, since its values aren't
 * materialized synchronously.
 */
function readFulfilledStaleAt(
  now: number,
  staleTime: AsyncIterable<number> | undefined
): number {
  if (staleTime === undefined) {
    return now + STATIC_STALETIME_MS
  }
  const staleTimeSeconds = readFulfilledStaleTimeSeconds(staleTime)
  if (staleTimeSeconds === null) {
    return now + STATIC_STALETIME_MS
  }
  return now + getStaleTimeMs(staleTimeSeconds)
}

/**
 * The localized retry loop for an upgradeable fallback shell. Re-issues the
 * exact same segment-bundle request up to MAX_FALLBACK_RETRIES times,
 * FALLBACK_RETRY_DELAY_MS apart, until the server returns the concrete
 * (upgraded) version. The fetch writes the upgraded response through the
 * same payload writes as the initial fetch, so every slot the initial fetch
 * wrote, including the shell paths, is upgraded. On success the loop pings
 * the task, so the task's *other* fallback segments get re-attempted. If
 * every attempt is still a fallback (or fails), it gives up.
 *
 * Conceptually the whole loop is one request. Until it settles, it's in
 * flight for every segment in the bundle, so it owns a pending entry in each
 * segment's revalidation slot, expecting what a static request returns: the
 * whole prerender. A prefetch that needs more than the fallback waits on
 * those entries instead of sending its own request. The concrete version
 * fulfills them. If the loop gives up, it rejects them, and the prefetch
 * moves on to a runtime request.
 *
 * A loop runs at most once per task, ever (fetchAndWritePerSegmentPrefetchResponse
 * gates on `fallbackRetryStatus === Empty`, set to `Pending` before this runs
 * and never reset to `Empty`). The sleep timer is never `clearTimeout`-ed, so
 * the awaited sleep always settles; the loop simply checks `isCanceled` after
 * waking and bails if the task was canceled in the meantime. On success the
 * status becomes `Fulfilled`; on any non-success exit (exhausted retries,
 * fetch error, or cancel) it becomes `Rejected`.
 */
async function retryUpgradeableFallbackPrefetch(
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  routeKey: RouteCacheKey,
  tree: RouteTree<RSCSegmentData | null>,
  // The entries the initial fetch spawned. The fallback content settles
  // them; the loop only uses their keys.
  spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry>
): Promise<void> {
  // This runs before the initial fetch writes the fallback, so a prefetch
  // pinged by that write already sees the loop's pending entries.
  const now = Date.now()
  const loopEntries = new Map<SegmentRequestKey, PendingSegmentCacheEntry>()
  const addLoopEntries = (node: RouteTree<unknown>) => {
    if (spawnedEntries.has(node.requestKey)) {
      const revalidatingEntry = readOrCreateRevalidatingSegmentEntry(
        now,
        task.segmentCacheMap,
        getSegmentVaryPathForRequest(AppStage.Navigation, node),
        getStaticSegmentVaryPathForRequest(AppStage.Navigation, node)
      )
      if (revalidatingEntry.status === EntryStatus.Empty) {
        // Fallbacks are only upgradeable with Partial Prefetching, where a
        // static request is expected to be cache complete.
        loopEntries.set(
          node.requestKey,
          upgradeToPendingSegment(
            revalidatingEntry,
            AppStage.Navigation,
            Completeness.CacheComplete
          )
        )
      }
    }
    if (node.slots !== null) {
      for (const child of node.slots.values()) {
        addLoopEntries(child)
      }
    }
  }
  addLoopEntries(route.root.tree)
  addLoopEntries(route.root.head)

  for (let attempt = 0; attempt < MAX_FALLBACK_RETRIES; attempt++) {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, FALLBACK_RETRY_DELAY_MS)
    )

    if (task.isCanceled) {
      break
    }

    let isUpgradeableISRFallback
    try {
      isUpgradeableISRFallback = await fetchAndWritePerSegmentPrefetchResponse(
        task,
        route,
        routeKey,
        tree,
        loopEntries,
        // The concrete version's full payload fulfills the loop's entries.
        AppStage.Navigation,
        // A response that is still a fallback shell is discarded rather than
        // pointlessly re-written over the identical fallback content the
        // initial fetch already cached. The loop's entries stay pending.
        true
      )
    } catch {
      // A hard failure (connection dropped, or the response couldn't be
      // decoded). Re-issuing the identical request won't fix it, so give up.
      break
    }
    if (task.isCanceled) {
      break
    }
    if (isUpgradeableISRFallback === null) {
      // Got a response that wasn't usable yet (the server hasn't finished
      // regenerating). Try again, or give up once the budget is exhausted.
      continue
    }
    if (isUpgradeableISRFallback) {
      // Still a fallback shell — the server hasn't finished regenerating yet.
      continue
    }

    // Success: the server returned the concrete (upgraded) version, and the
    // fetch wrote it into the cache. The task's other fallback segments are
    // now allowed to revalidate.
    task.fallbackRetryStatus = EntryStatus.Fulfilled
    pingPrefetchTask(task)
    return
  }

  // The loop finished without success (exhausted its retries, broke out on a
  // fetch error, or the task was canceled). It won't run again for this task.
  task.fallbackRetryStatus = EntryStatus.Rejected
  rejectSegmentEntriesIfStillPending(
    loopEntries,
    Date.now() + REJECTION_BACKOFF_MS
  )
}

// The runtime version of fetchSegmentPrefetchesUsingStaticRequest. The two
// get their payloads differently. Here it's one runtime request (streamed, for
// legacy full prefetches). There it's a buffered per-segment response that we
// decode twice to get the shell. Both write their payloads the same way
// (writeResponsePayloadsIntoCache).
export async function fetchSegmentPrefetchesUsingRuntimeRequest(
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  // The stage the request asks for.
  stage: AppStage,
  // What we expect the request to return: CacheComplete for a runtime
  // prefetch, FullyComplete for a legacy dynamic one. The spawned entries
  // were created with the same value.
  completeness: Completeness,
  requestTree: FlightRouterState,
  spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry>
): Promise<PrefetchSubtaskResult<null> | null> {
  const key = task.key
  const url = new URL(route.canonicalUrl, location.origin)
  const nextUrl = key.nextUrl

  // When the request tree was derived from a predicted route entry, pass the
  // node it was predicted from to the write path so the prediction can be
  // disabled if the server's rendered tree diverges from it. For an entry
  // the server resolved this is null: a divergence from it says nothing
  // about route prediction, and its unfulfilled entries take the usual
  // backoff.
  let dynamicRequestTree: FlightRouterState
  let predictedFrom: KnownRoutePart | null
  if (
    spawnedEntries.size === 1 &&
    spawnedEntries.has(route.root.head.requestKey)
  ) {
    // Only the head is pending, so ask the server for metadata only: it skips
    // the segments and renders just the head. The stub is not derived from
    // the route entry, so divergence from it carries no signal.
    dynamicRequestTree = MetadataOnlyRequestTree
    predictedFrom = null
  } else {
    dynamicRequestTree = requestTree
    predictedFrom = route.predictedFrom
  }

  const headers: RequestHeaders = {
    [RSC_HEADER]: '1',
    [NEXT_ROUTER_STATE_TREE_HEADER]:
      prepareFlightRouterStateForRequest(dynamicRequestTree),
  }
  if (nextUrl !== null) {
    headers[NEXT_URL] = nextUrl
  }
  if (completeness === Completeness.FullyComplete) {
    if (stage === AppStage.Shell) {
      // The legacy loading-boundary prefetch.
      headers[NEXT_ROUTER_PREFETCH_HEADER] = '1'
    } else {
      // We omit the prefetch header from a legacy full prefetch because it's
      // essentially just a navigation request that happens ahead of time —
      // it should include all the same data in the response.
    }
  } else if (stage === AppStage.Shell) {
    // A runtime prefetch of the shell.
    headers[NEXT_ROUTER_PREFETCH_HEADER] = '3'
  } else {
    // A runtime prefetch up to the prefetch stage.
    headers[NEXT_ROUTER_PREFETCH_HEADER] = '2'
  }

  try {
    const response = await fetchPrefetchResponse(url, headers)
    if (!response || !response.ok || !response.body) {
      // Server responded with an error, or with a miss. We should still cache
      // the response, but we can try again after 10 seconds.
      rejectSegmentEntriesIfStillPending(
        spawnedEntries,
        Date.now() + REJECTION_BACKOFF_MS
      )
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
      rejectSegmentEntriesIfStillPending(
        spawnedEntries,
        Date.now() + REJECTION_BACKOFF_MS
      )
      return null
    }

    // Track when the network connection closes. Only meaningful for legacy
    // full prefetches which use incremental streaming. For buffered
    // paths, this is resolved immediately — see TODO in fetchRouteOnCacheMiss.
    const closed = createPromiseWithResolvers<void>()

    // With Cached Navigations, the response's bytes are kept here as they're
    // passed to the decoder, so prefixes (like the shell) can be cut from them.
    let responseChunks: Array<Uint8Array> | null =
      process.env.__NEXT_CACHE_COMPONENTS &&
      process.env.__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS
        ? []
        : null

    let fulfilledEntries: Array<FulfilledSegmentCacheEntry> | null = null
    let bufferedResponseSize: number | null = null
    let serverDataPromise: Promise<DynamicNavigationFlightResponse>
    if (
      completeness === Completeness.FullyComplete &&
      stage === AppStage.Navigation
    ) {
      // Legacy full prefetches are dynamic responses stored in the prefetch cache.
      // They don't carry vary params or other cache metadata, so there's no
      // need to buffer them. Use the incremental version to allow data to be
      // processed as it arrives.
      const prefetchStream = createIncrementalPrefetchResponseStream(
        response.body,
        closed.resolve,
        function onChunk(chunk, totalBytesReceivedSoFar) {
          if (responseChunks !== null) {
            responseChunks.push(chunk)
          }

          // Incrementally update the size of the cache entry in the LRU.
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
      serverDataPromise =
        createFromNextReadableStream<DynamicNavigationFlightResponse>(
          prefetchStream,
          headers,
          { allowPartialStream: true }
        )
    } else {
      const buffer = await bufferPrefetchResponseBody(response.body)
      closed.resolve()
      bufferedResponseSize = buffer.byteLength
      if (responseChunks !== null) {
        responseChunks.push(buffer)
      }
      serverDataPromise =
        decodeBufferedResponse<DynamicNavigationFlightResponse>(buffer, headers)
    }

    const serverData = await serverDataPromise

    const now = Date.now()
    const staleAt = await resolveStaleAt(now, serverData.s, response)
    const buildId =
      response.headers.get(NEXT_NAV_DEPLOYMENT_ID_HEADER) ?? serverData.b

    // Cut the shell out of the response, if it has one. We can only do that
    // if we kept the response's bytes, which we only do with Cached
    // Navigations.
    const shellResponse =
      responseChunks !== null
        ? await resolveStageResponse(
            responseChunks,
            serverData,
            AppStage.Shell,
            headers
          )
        : null
    // Decode up to the end of the prefetch stage, just to read `u`. If the
    // prefix can't be decoded, we only use the full payload's `u`.
    const prefetchStageResponse =
      responseChunks !== null
        ? await resolveStageResponse(
            responseChunks,
            serverData,
            AppStage.Prefetch,
            headers
          )
        : null
    // Every prefix has been cut, so stop keeping the response's bytes.
    responseChunks = null

    // Runtime prefetch responses are partial when the server marks the
    // response as '~' (Partial). Legacy dynamic prefetch responses are always
    // complete.
    const isFullResponsePartial =
      completeness === Completeness.CacheComplete && response.isPartial

    let entriesToFulfill: Map<
      SegmentRequestKey,
      PendingSegmentCacheEntry
    > | null = spawnedEntries
    if (
      completeness === Completeness.CacheComplete &&
      serverData.u !== undefined &&
      readFulfilledValue(serverData.u, false, /* rejectedValue */ true) ===
        true &&
      (prefetchStageResponse?.u === undefined ||
        readFulfilledValue(
          prefetchStageResponse.u,
          false,
          /* rejectedValue */ true
        ) === true)
    ) {
      // We sent a runtime request, but got back a static prerender that
      // still needs runtime data (for example, the server served a stale
      // prerender). Asking again won't get us more, so treat it as a failed
      // attempt. We still write the payload, but we reject the spawned
      // entries, and their backoff limits how often we retry. This check
      // matches how writeServerResponseIntoCache records a static payload's
      // completeness, so if you change one, change the other.
      rejectSegmentEntriesIfStillPending(
        spawnedEntries,
        now + REJECTION_BACKOFF_MS
      )
      entriesToFulfill = null
    }

    // Aside from writing the data into the cache, this also returns the
    // entries that were fulfilled, so we can streamingly update their sizes
    // in the LRU as more data comes in (legacy full responses, which
    // stream).
    fulfilledEntries = writeResponsePayloadsIntoCache(
      now,
      // The stage we expect the request to reach. A runtime prefetch reaches
      // the stage it asks for. A legacy dynamic prefetch reaches the
      // navigation stage.
      completeness === Completeness.FullyComplete ? AppStage.Navigation : stage,
      serverData,
      shellResponse,
      prefetchStageResponse?.u,
      dynamicRequestTree,
      predictedFrom,
      // Navigation responses always include the param values in the tree, so
      // there's no pathname to parse them from (nor a need to).
      null,
      renderedSearch,
      buildId,
      staleAt,
      isFullResponsePartial,
      null,
      entriesToFulfill,
      bufferedResponseSize,
      task.segmentCacheMap
    )

    // Return a promise that resolves when the network connection closes, so
    // the scheduler can track the number of concurrent network connections.
    return { value: null, closed: closed.promise }
  } catch (error) {
    rejectSegmentEntriesIfStillPending(
      spawnedEntries,
      getPrefetchErrorStaleAt(error)
    )
    return null
  }
}

function rejectSegmentEntriesIfStillPending(
  entries: Map<SegmentRequestKey, SegmentCacheEntry>,
  staleAt: number
): void {
  for (const entry of entries.values()) {
    if (entry.status === EntryStatus.Pending) {
      rejectSegmentCacheEntry(entry, staleAt)
    }
  }
}

/**
 * Writes a prefetch response's payloads into the cache: the full payload,
 * plus its shell payload when the response carries one. This is the write
 * orchestration shared by the prefetch response kinds — per-segment
 * static responses (fetchAndWritePerSegmentPrefetchResponse) and
 * live-render responses (fetchSegmentPrefetchesUsingRuntimeRequest, and the
 * prefetch response a navigation carries, via
 * writeNavigationResponseIntoCache)
 * — which differ in how they obtain their payloads but not in what must
 * happen to them.
 *
 * Returns the entries the fulfilling payload's write produced content into
 * (so the streaming caller can keep updating their LRU sizes as bytes
 * arrive), or null if nothing entered the cache.
 */
function writeResponsePayloadsIntoCache(
  now: number,
  // The stage we expect the request to reach. We use it to pick which payload
  // fulfills the spawned entries. It's also the stage a live render's full
  // payload reached, since the response doesn't say.
  expectedStage: AppStage,
  fullPayload: NavigationFlightResponse,
  // The response's shell payload: null (the response carries no shell),
  // `fullPayload` itself (the shell IS the full response), or a distinct
  // stage decode truncated at the shell byte boundary.
  shellPayload: NavigationFlightResponse | null,
  // The response's `u` as of the end of the prefetch stage. Only the full
  // payload's write uses it. See writeServerResponseIntoCache.
  prefetchStageNeedsRuntimeRequest: NavigationFlightResponse['u'],
  // The next five are threaded through to every write; see
  // writeServerResponseIntoCache for their meaning.
  baseTree: FlightRouterState | null,
  predictedFrom: KnownRoutePart | null,
  renderedPathname: string | null,
  renderedSearch: string,
  buildId: string | undefined,
  // Response-level staleness of the full payload. The shell payload's own
  // staleness is read off the shell decode below (a shell payload is always
  // fully buffered).
  staleAt: number,
  // Whether anything in the full payload is not fully resolved (dynamic or
  // runtime holes, anything suspended). Shell payload writes don't use it,
  // because a shell is always partial. (Per-segment payloads say which nodes
  // are partial, and ignore this value.)
  isFullResponsePartial: boolean,
  metadataVaryPath: VaryPath | null,
  // The pending entries this response fulfills. Null when the caller owns
  // none (the embedded runtime prefetch stream), in which case every write
  // is a detached upsert.
  spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry> | null,
  // The response's size in bytes, distributed across the entries the
  // fulfilling payload's write produced; null when unknown (streamed legacy
  // full responses — the caller sizes those incrementally as bytes
  // arrive instead).
  responseByteLength: number | null,
  // The map the work that spawned this response's request is bound to. See
  // writeServerResponseIntoCache.
  map: CacheMap<SegmentCacheEntry>
): Array<FulfilledSegmentCacheEntry> | null {
  // The stage the full payload reached. A static prerender (the payload has
  // `u`) renders through the navigation stage. A live render reaches the
  // stage it was asked for.
  const fullStage =
    fullPayload.u !== undefined ? AppStage.Navigation : expectedStage

  let fulfilledEntries: Array<FulfilledSegmentCacheEntry> | null
  if (shellPayload === null) {
    if (fullPayload.u !== undefined && expectedStage === AppStage.Shell) {
      // We asked for a shell, but got a static prerender without one. Either
      // it didn't list where its stages end (a bug in Next.js), or the shell
      // prefix couldn't be decoded. The full payload is still useful, so we
      // write it, but we reject the spawned entries so the task isn't stuck
      // waiting on them. The scheduler doesn't send a runtime request for
      // rejected segments. It skips them (see the Rejected case in
      // pingSegmentBundle), so these segments get no prefetch until the
      // backoff expires.
      writeServerResponseIntoCache(
        now,
        fullStage,
        fullPayload,
        prefetchStageNeedsRuntimeRequest,
        baseTree,
        predictedFrom,
        renderedPathname,
        renderedSearch,
        buildId,
        staleAt,
        isFullResponsePartial,
        metadataVaryPath,
        null,
        map
      )
      if (spawnedEntries !== null) {
        rejectSegmentEntriesIfStillPending(
          spawnedEntries,
          now + REJECTION_BACKOFF_MS
        )
      }
      return null
    }
    // Either the server didn't say where the shell ends, or this was a
    // runtime shell request that a live render answered, so the payload is
    // already a shell. Either way, it fulfills the spawned entries.
    fulfilledEntries = writeServerResponseIntoCache(
      now,
      fullStage,
      fullPayload,
      prefetchStageNeedsRuntimeRequest,
      baseTree,
      predictedFrom,
      renderedPathname,
      renderedSearch,
      buildId,
      staleAt,
      isFullResponsePartial,
      metadataVaryPath,
      spawnedEntries,
      map
    )
  } else if (shellPayload === fullPayload) {
    // The shell is the whole response, so the page has nothing past its
    // shell. We write it once, as the full payload, and it fulfills the
    // spawned entries. Writing it as the full payload also means it's keyed
    // by the params the server said it depends on. The fact that there's no
    // separate shell isn't enough reason to store it in the shell slot (see
    // writeSegmentDataIntoCache).
    fulfilledEntries = writeServerResponseIntoCache(
      now,
      fullStage,
      fullPayload,
      prefetchStageNeedsRuntimeRequest,
      baseTree,
      predictedFrom,
      renderedPathname,
      renderedSearch,
      buildId,
      staleAt,
      isFullResponsePartial,
      metadataVaryPath,
      spawnedEntries,
      map
    )
  } else {
    // The shell is a strict prefix of the response. Write both payloads.
    // The one that matches the stage the spawned entries asked for fulfills
    // them, and the other is just upserted. If we fulfilled a shell entry
    // with the full payload, we'd store content that doesn't match the
    // entry's shell vary path. Every later read at that key would get the
    // wrong content, and so could a navigation that's already rendering the
    // pending entry.
    //
    // The full payload is written first, so the shell write's precedence
    // checks and shadow eviction compare against the fresh concrete entry
    // rather than whatever stale entry preceded it. (Fulfillment pings only
    // enqueue scheduler work that runs after this synchronous block.)
    const fullFulfilledEntries = writeServerResponseIntoCache(
      now,
      fullStage,
      fullPayload,
      prefetchStageNeedsRuntimeRequest,
      baseTree,
      predictedFrom,
      renderedPathname,
      renderedSearch,
      buildId,
      staleAt,
      isFullResponsePartial,
      metadataVaryPath,
      expectedStage === AppStage.Shell ? null : spawnedEntries,
      map
    )

    const shellFulfilledEntries = writeServerResponseIntoCache(
      now,
      AppStage.Shell,
      shellPayload,
      undefined,
      baseTree,
      predictedFrom,
      renderedPathname,
      renderedSearch,
      buildId,
      // The shell payload carries its own staleness, independent of the
      // full payload's. Shell decodes are fully buffered, so it's read
      // synchronously; when absent (per-segment responses carry staleTime
      // per node instead) this falls back to the same static stale time the
      // per-segment writes use as their response-level fallback.
      readFulfilledStaleAt(now, shellPayload.s),
      // A shell payload is a strict subset of the full response, so it does
      // not represent the entire UI of the target page — it's partial
      // by construction.
      true,
      metadataVaryPath,
      expectedStage === AppStage.Shell ? spawnedEntries : null,
      map
    )
    fulfilledEntries =
      expectedStage === AppStage.Shell
        ? shellFulfilledEntries
        : fullFulfilledEntries
  }

  // Entries created by a detached write aren't sized: one wire response is
  // only charged to the LRU once, to the entries it fulfilled.
  if (
    responseByteLength !== null &&
    fulfilledEntries !== null &&
    fulfilledEntries.length > 0
  ) {
    const averageSize = responseByteLength / fulfilledEntries.length
    for (const entry of fulfilledEntries) {
      setSizeInCacheMap(entry, averageSize)
    }
  }
  return fulfilledEntries
}

/**
 * Writes a decoded server response into the segment cache: decodes the
 * response's transport tree into a RouteTree — overlaid on `baseTree` when
 * the response is an overlay over existing client state, root-anchored when
 * it covers its own spine (per-segment prefetch payloads) — then writes
 * every rendered segment, plus the head, into the cache. Fulfills the
 * entries in `spawnedEntries` that the response covers; rejects the rest, so
 * a task blocked on them isn't stranded. Returns the entries the write
 * produced content into — fulfilled spawned entries plus installed detached
 * upserts — for LRU size accounting, or null if nothing entered the cache.
 *
 * Serves every response kind: live-render prefetch responses (runtime
 * prefetches, and legacy full and loading-boundary prefetches outside
 * Partial Prefetching), prerender stage decodes (shell-stage
 * extraction, cached navigations, the initial payload), embedded runtime
 * prefetch streams, and the payloads of per-segment prefetch responses.
 */
function writeServerResponseIntoCache(
  now: number,
  // The stage the payload reached: Navigation for a static full payload,
  // Shell for a shell payload. A live render's response doesn't say what
  // stage it reached, so for its full payload this is the stage we expected
  // the request to reach. It's the only input here that doesn't come from
  // the response.
  stage: AppStage,
  // The decoded response payload to write. For a per-segment prefetch
  // response this is one of its payloads: the full response, or the
  // truncated shell decode.
  response: NavigationFlightResponse,
  // The response's `u` as of the end of the prefetch stage, if the response
  // lists where that is (see the `a` field). Undefined otherwise.
  prefetchStageNeedsRuntimeRequest: NavigationFlightResponse['u'],
  // The base router state the response overlays. Null when the response's
  // tree is root-anchored (per-segment prefetch payloads).
  baseTree: FlightRouterState | null,
  // Non-null when `baseTree` was predicted: the node in the known route tree
  // whose pattern it was predicted from (see matchKnownRoute). The
  // prediction assumes the URL's rewrite (if any) behaves statically; if the
  // server's rendered tree diverges from the base, that prediction failed —
  // the rewrite behaves dynamically, so the params baked into the request
  // are wrong. The node is marked so the shape is never predicted again, and
  // the entries that could not be fulfilled are rejected with immediate
  // expiration so the task retries right away — against the server-resolved
  // route this time. The response data is still written into the cache: it's
  // real data keyed by what the server actually rendered, useful regardless
  // of whether the prediction matched.
  predictedFrom: KnownRoutePart | null,
  // The pathname the response was rendered for, used to resolve dynamic
  // segments the server sent without a param value (`k: null`). Null for
  // responses that always carry concrete values (navigation responses).
  renderedPathname: string | null,
  renderedSearch: string,
  buildId: string | undefined,
  // Response-level staleness; a segment (or the head) with its own
  // staleTime overrides it.
  staleAt: number,
  // Whether anything in the response is not fully resolved: dynamic holes, runtime holes, anything suspended.
  // Threaded into the decode, where each segment's (and the head's)
  // partiality is resolved from it and the wire form (see
  // createNavigationSeed). Per-segment prefetch responses encode
  // partiality per node, so their writes pass the conservative value
  // (true), which is never read.
  isResponsePartial: boolean,
  // Where to key the head; see createNavigationSeed.
  metadataVaryPath: VaryPath | null,
  spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry> | null,
  // The map the work that spawned this response's request is bound to: the
  // spawning task's `PrefetchTask.segmentCacheMap` for prefetches, the
  // navigation's map for navigation-side writes. Binding the write to the
  // requesting work means a response that lands after a testing-lock scope
  // boundary still writes into the map its entries live in.
  map: CacheMap<SegmentCacheEntry>
): Array<FulfilledSegmentCacheEntry> | null {
  // Which layer owns the buildId check differs by flow. The route and
  // segment fetch layers check it themselves (see fetchRouteOnCacheMiss and
  // fetchAndWritePerSegmentPrefetchResponse) because they need the early-out
  // before side effects this layer can't undo — starting the fallback-retry
  // loop, writing the second (shell) payload — and then pass no buildId
  // here. This check owns it for the flows that don't: live-render prefetch
  // responses and complete prerenders written from navigations, which pass
  // their buildId through.
  if (buildId && buildId !== getNavigationBuildId()) {
    // The server build does not match the client. Treat as a 404. During
    // an actual navigation, the router will trigger an MPA navigation.
    if (spawnedEntries !== null) {
      rejectSegmentEntriesIfStillPending(
        spawnedEntries,
        now + REJECTION_BACKOFF_MS
      )
    }
    return null
  }

  const transportData = response.t
  if (transportData === undefined) {
    // The response carries no tree. Settle anything we own so a task blocked
    // on it isn't stranded.
    if (spawnedEntries !== null) {
      rejectSegmentEntriesIfStillPending(
        spawnedEntries,
        now + REJECTION_BACKOFF_MS
      )
    }
    return null
  }

  const navigationSeed = createNavigationSeed(
    now,
    baseTree,
    transportData,
    // Root params are emitted once at the top level of the response; the
    // decode unions them into the head's and each segment's own set. For
    // per-segment prefetch responses this must be read from the payload
    // being written: a truncated shell decode rewinds the response's
    // late-resolving values to the shell stage.
    response.r ?? null,
    // The decode resolves each segment's partiality from this and the wire:
    // boolean-form nodes resolve to this response-level value; staged
    // (promise-form) nodes encode partiality per node and ignore it.
    isResponsePartial,
    renderedPathname,
    renderedSearch,
    metadataVaryPath,
    // Only navigations consume the seed's dynamicStaleAt; cache writes pass
    // unknown to use the default.
    UnknownDynamicStaleTime
  )

  const treeDivergedFromPrediction =
    predictedFrom !== null && navigationSeed.treeDivergedFromBase
  if (treeDivergedFromPrediction) {
    predictedFrom.hasDynamicRewrite = true
  }

  // Only static (per-segment) responses can be ISR fallbacks (`f`).
  //
  // Every static prerender sends `u`, which says whether the render read
  // runtime data. Live renders don't send it. We read `u` here, from this
  // payload's own decode, instead of once when the response is fetched. That
  // way a shell decode reads a runtime access that happened after the shell
  // as pending, which counts as `false`, since the shell itself doesn't need
  // that data. Getting this wrong is only costly in one direction. A wrong
  // `true` wastes a runtime request, but a wrong `false` skips a runtime
  // request that had more content. So a rejected row (an aborted prerender
  // errors the rows that were still pending) has to count as `true`, the same
  // way the server reads it (see the `u` read in collect-segment-data.tsx).
  const isUpgradeableISRFallback = response.f === true

  // The payload's completeness, which every segment that's still partial
  // records. Without Cache Components, every render is complete. A live
  // render has everything except dynamic holes, which prefetches never fill.
  // A payload with `u` is a static prerender (live renders never send it).
  // Without Partial Prefetching, a static prerender always needs a runtime
  // request. With it, we record the payload at the deepest stage that didn't
  // read runtime data, as cache complete. We check the payload's own stage
  // first, then the prefetch stage. If neither works, it needs a runtime
  // request.
  let payloadStage = stage
  let payloadCompleteness: Completeness
  if (!process.env.__NEXT_CACHE_COMPONENTS) {
    payloadCompleteness = Completeness.FullyComplete
  } else if (response.u === undefined) {
    payloadCompleteness = Completeness.CacheComplete
  } else if (
    (navigationSeed.root.tree.prefetchHints &
      PrefetchHint.SubtreeHasPartialPrefetching) ===
    0
  ) {
    payloadCompleteness = Completeness.NeedsRuntime
  } else if (
    readFulfilledValue(response.u, false, /* rejectedValue */ true) === false
  ) {
    payloadCompleteness = Completeness.CacheComplete
  } else if (
    prefetchStageNeedsRuntimeRequest !== undefined &&
    readFulfilledValue(
      prefetchStageNeedsRuntimeRequest,
      false,
      /* rejectedValue */ true
    ) === false
  ) {
    // The payload has content past the prefetch stage, but we record it as
    // the prefetch stage anyway. That way a link that only needs the prefetch
    // stage stops here, and a link that needs more sends a runtime request.
    payloadStage = AppStage.Prefetch
    payloadCompleteness = Completeness.CacheComplete
  } else {
    payloadCompleteness = Completeness.NeedsRuntime
  }

  const routeTree = navigationSeed.root.tree

  // The route tree carries the render output of every segment the response
  // included, so a single traversal from the root writes all of it into
  // the cache.
  const writtenEntries: Array<FulfilledSegmentCacheEntry> = []
  writeTreeDataIntoCache(
    now,
    map,
    payloadStage,
    payloadCompleteness,
    response.u,
    routeTree,
    staleAt,
    spawnedEntries,
    isUpgradeableISRFallback,
    writtenEntries
  )

  const metadataTree = navigationSeed.root.head
  const headData = metadataTree.data
  if (headData !== null && headData.rsc !== null) {
    // The head follows the same stale-time rules as a segment.
    const headStaleAt =
      headData.staleTimeSeconds !== null
        ? now + getStaleTimeMs(headData.staleTimeSeconds)
        : staleAt

    const writtenHeadEntry = writeSegmentDataIntoCache(
      now,
      map,
      payloadStage,
      payloadCompleteness,
      response.u,
      headData.rsc,
      // The decode already resolved the head's partiality from the wire
      // form and the response-level value — see the head read in
      // createNavigationSeed.
      headData.isPartial,
      headStaleAt,
      headData.varyParams,
      metadataTree,
      spawnedEntries,
      isUpgradeableISRFallback
    )
    if (writtenHeadEntry !== null) {
      writtenEntries.push(writtenHeadEntry)
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
    rejectSegmentEntriesIfStillPending(
      spawnedEntries,
      // When the response diverged from the prediction, the leftover entries
      // can never be fulfilled — their keys were derived from the wrong
      // tree. Reject with an immediate expiration instead of the usual
      // backoff so the task retries right away. The prediction was disabled
      // above, so the retry resolves the route on the server instead of
      // predicting it again.
      treeDivergedFromPrediction ? -1 : now + REJECTION_BACKOFF_MS
    )
  }
  return writtenEntries.length > 0 ? writtenEntries : null
}

function writeTreeDataIntoCache(
  now: number,
  map: CacheMap<SegmentCacheEntry>,
  stage: AppStage,
  payloadCompleteness: Completeness,
  needsRuntimeRequest: NavigationFlightResponse['u'],
  tree: RouteTree<RSCSegmentData | null>,
  staleAt: number,
  spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry> | null,
  isUpgradeableISRFallback: boolean,
  // Accumulates the entries the walk wrote content into (fulfilled spawned
  // entries and installed detached upserts), for LRU size accounting.
  writtenEntries: Array<FulfilledSegmentCacheEntry>
) {
  // Writes the render output embedded in the route tree into the
  // prefetch cache.
  const data = tree.data
  if (data !== null && data.rsc !== null) {
    // A segment carries its own staleTime only in per-segment prefetch
    // responses; everywhere else the response-level staleness governs.
    const entryStaleAt =
      data.staleTimeSeconds !== null
        ? now + getStaleTimeMs(data.staleTimeSeconds)
        : staleAt
    const writtenEntry = writeSegmentDataIntoCache(
      now,
      map,
      stage,
      payloadCompleteness,
      needsRuntimeRequest,
      data.rsc,
      data.isPartial,
      entryStaleAt,
      data.varyParams,
      tree,
      spawnedEntries,
      isUpgradeableISRFallback
    )
    if (writtenEntry !== null) {
      writtenEntries.push(writtenEntry)
    }
  } else {
    // Either the response carried no information for this segment (no data
    // object — e.g. the identity spine of a per-segment prefetch response,
    // or a slot reused from the base tree), or it acknowledged the position
    // without rendering it (a data object with a null rsc — an intermediate
    // position on the path to a rendered subtree). Nothing to write either
    // way, but the children may have output, so keep descending.
  }

  // Recursively write the child data into the cache.
  const slots = tree.slots
  if (slots !== null) {
    for (const childTree of slots.values()) {
      writeTreeDataIntoCache(
        now,
        map,
        stage,
        payloadCompleteness,
        needsRuntimeRequest,
        childTree,
        staleAt,
        spawnedEntries,
        isUpgradeableISRFallback,
        writtenEntries
      )
    }
  }
}

/**
 * Writes one segment's render output into the cache: fulfills the entry at
 * the same tree position if this task owns one, otherwise creates one (or
 * upserts a detached one). Shared by every response kind. A partial segment
 * records the payload's stage and completeness; a segment with no holes is
 * fully complete — see `recordedStage` below.
 *
 * Returns the entry this write produced content into — the fulfilled spawned
 * entry, or the detached entry the upsert installed — so the caller can
 * charge the response's size to it. Null when nothing entered the cache (the
 * upsert declined a detached candidate).
 */
function writeSegmentDataIntoCache(
  now: number,
  map: CacheMap<SegmentCacheEntry>,
  // The stage the payload reached (see writeServerResponseIntoCache). The
  // entry is keyed by it.
  stage: AppStage,
  // The payload's completeness (see writeServerResponseIntoCache).
  payloadCompleteness: Completeness,
  // The payload's `u`. If it's there, the payload is a static prerender, so
  // its key leaves out search params when the server doesn't report vary
  // params.
  needsRuntimeRequest: NavigationFlightResponse['u'],
  rsc: React.ReactNode,
  isPartial: boolean,
  staleAt: number,
  segmentVaryParams: VaryParams | null,
  tree: RouteTree<RSCSegmentData | null>,
  spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry> | null,
  // Whether the response is an upgradeable fallback shell. Always false for
  // live-render responses — they are never ISR fallbacks.
  isUpgradeableISRFallback: boolean
): FulfilledSegmentCacheEntry | null {
  // A segment with no holes is fully complete: a navigation doesn't need to
  // request anything else for it, and there are no later stages to fetch,
  // whatever stage the payload reached. We still key it by the payload's
  // stage.
  const recordedCompleteness = isPartial
    ? payloadCompleteness
    : Completeness.FullyComplete
  const recordedStage =
    recordedCompleteness === Completeness.FullyComplete
      ? AppStage.Navigation
      : stage

  // Decide whether to re-key the entry under a more generic vary path based on
  // which params the segment actually depends on.
  //
  // Key the entry by the params the server said this segment depends on. The
  // point of the shell is to reuse one copy for every param value, but we can
  // only do that if we know the content doesn't depend on those params, and
  // the server's report is how we know.
  //
  // Without that report, assume every param varies — a response without a
  // shell/full split is also what a page fully prerendered at concrete
  // params looks like, and keying that at the shell path would serve one
  // slug's content to every sibling. The exception is a shell variant,
  // which reduces param-dependent content to param fallbacks, so it really
  // is good for any value of them (its request path below IS the shell
  // vary path).
  let fulfilledVaryPath: VaryPath | null = null
  // The dependency source the entry records, so a navigation that renders
  // its content can tell which params that content read. It is the same
  // evidence the key derivation below trusts, under the same condition, with
  // the same correction; otherwise null, and consumers assume every param.
  let recordedVaryParams: VaryParams | null = null
  if (process.env.__NEXT_VARY_PARAMS && segmentVaryParams !== null) {
    // Read the reported set now, when the key is chosen. The payload is fully
    // buffered by the time it's written, so the source has settled; a read of
    // null means the report is unavailable and every param varies.
    let varyParams = readVaryParams(segmentVaryParams)
    if (varyParams !== null) {
      if (
        stage === AppStage.Shell &&
        needsRuntimeRequest === undefined &&
        varyParams.has(SEARCH_PARAMS_VARY_ID)
      ) {
        // SPECIAL CASE: for a runtime shell payload, we ignore the search
        // params in the server's vary params, so the key uses a fallback for
        // search. This is only here because of a known compromise in how the
        // server reports search params. Accessing `searchParams` counts as a
        // dependency as soon as it happens, even if the render suspends there
        // and the shell only has the fallback. So the page and head of a
        // shell render report search params, even though the shell has no
        // content that depends on them.
        // If we trusted that, we'd key the shell at a specific search value,
        // and shell reads (which use a fallback for every non-root param, see
        // getShellSegmentVaryPath) would never find it. A runtime shell
        // always reduces search-dependent content to fallbacks, so its key
        // shouldn't vary on search. We still use the rest of the report.
        //
        // Nothing else should rely on this. For every other payload, and
        // every other param, we use what the server reports.
        //
        // TODO: Reconsider special-casing this on the server instead: don't
        // report a param access that never resolved past the fallback cut in
        // the emitted stage. A shell payload's evidence would then be
        // accurate, and this branch could be deleted.
        varyParams = new Set(varyParams)
        varyParams.delete(SEARCH_PARAMS_VARY_ID)
        recordedVaryParams = createVaryParams(varyParams)
      } else {
        recordedVaryParams = segmentVaryParams
      }
      fulfilledVaryPath = getFulfilledSegmentVaryPath(tree.varyPath, varyParams)
    }
  }

  // The canonical path to (re-)key the entry at. When the derivation above
  // produced a path, use that; otherwise fall back to the payload's own
  // keying (this is load-bearing for entries spawned as revalidations:
  // without the re-key they'd stay in their Revalidation slot forever,
  // invisible to canonical reads, and the partial entry that prompted the
  // revalidation would keep serving navigations). A static prerender never
  // depends on search params, and a live render is keyed by its concrete
  // values.
  let canonicalVaryPath: VaryPath
  if (fulfilledVaryPath !== null) {
    canonicalVaryPath = fulfilledVaryPath
  } else if (needsRuntimeRequest !== undefined) {
    canonicalVaryPath = getStaticSegmentVaryPathForRequest(stage, tree)
  } else {
    canonicalVaryPath = getSegmentVaryPathForRequest(stage, tree)
  }

  // We should only write into cache entries that are owned by us. Or create
  // a new one and write into that. We must never write over an entry that was
  // created by a different task, because that causes data races.
  //
  // The status check matters for the fallback-retry loop, which re-writes a
  // response over entries the initial fetch already settled: those writes
  // must fall through to the detached path below.
  const ownedEntry =
    spawnedEntries !== null ? spawnedEntries.get(tree.requestKey) : undefined
  const isOwned =
    ownedEntry !== undefined && ownedEntry.status === EntryStatus.Pending
  let fulfilledEntry: FulfilledSegmentCacheEntry
  if (isOwned) {
    // We own this entry — fulfill it directly.
    fulfilledEntry = fulfillSegmentCacheEntry(
      ownedEntry,
      rsc,
      staleAt,
      recordedVaryParams,
      isUpgradeableISRFallback,
      recordedStage,
      recordedCompleteness
    )
  } else {
    // We don't own an entry for this segment. Create a detached one and
    // attempt to insert it at the canonical path.
    fulfilledEntry = fulfillSegmentCacheEntry(
      upgradeToPendingSegment(
        createDetachedSegmentCacheEntry(now),
        recordedStage,
        recordedCompleteness
      ),
      rsc,
      staleAt,
      recordedVaryParams,
      isUpgradeableISRFallback,
      recordedStage,
      recordedCompleteness
    )
  }
  // Insert through the upsert so the usual precedence rules apply — an
  // existing entry with more complete content is never downgraded, and a
  // shadowed Empty/Pending entry's blocked tasks are pinged. (In the
  // common case the slot already holds the entry we just fulfilled, which
  // the upsert replaces in place; but the re-key is load-bearing for
  // entries whose spawn path differs from the canonical path — e.g.
  // spawned revalidations, which would otherwise stay in their
  // Revalidation slot forever, invisible to canonical reads, while the
  // partial entry that prompted the revalidation kept serving
  // navigations.)
  //
  // The concrete lookup path (tree.varyPath) is passed so that when the
  // canonical path is more generic, any stale settled entry — or unclaimed
  // Empty placeholder — at a more specific path that would shadow the
  // fulfilled entry is evicted. Without this, a shadowed re-keyed entry is
  // unreachable at the concrete read path: the scheduler would keep
  // re-reading the stale entry and, for a revalidation, respawn it
  // forever. See evictShadowingSegmentEntries.
  const installedEntry = upsertSegmentEntry(
    now,
    map,
    canonicalVaryPath,
    fulfilledEntry,
    tree.varyPath
  )
  if (installedEntry === null && !isOwned) {
    // The upsert declined the detached candidate (an existing entry took
    // precedence, or the candidate was already expired), so no cache slot
    // holds this write's content — nothing for the caller to charge to
    // the LRU. (An owned entry is returned regardless: it was fulfilled
    // above and stays live for waiters that hold it, whether or not the
    // re-key installed it.)
    return null
  }
  return fulfilledEntry
}

async function fetchPrefetchResponse(
  url: URL,
  headers: RequestHeaders
): Promise<RSCResponse | null> {
  const fetchPriority = 'low'
  const response = await createFetch(url, headers, fetchPriority)
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

/**
 * Whether the response was served from the per-segment-capable static
 * prerender, rather than the old prefetching flow. If this fails, it implies
 * that PPR is disabled on the route.
 */
function wasServedFromPerSegmentCache(response: RSCResponse): boolean {
  return (
    response.headers.get(NEXT_DID_POSTPONE_HEADER) === '2' ||
    // In output: "export" mode, we can't rely on response headers. But if we
    // receive a well-formed response, we can assume it's a static response,
    // because all data is static in this mode.
    isOutputExportMode
  )
}

/**
 * Reads a prefetch response body to completion and returns the bytes as a
 * single contiguous buffer.
 *
 * Buffering the entire response before passing it to the Flight client
 * ensures that when Flight processes the stream, all model data is available
 * synchronously. This is what makes the decode boundary's thenable-status
 * reads (vary params, isPartial, staleTime — see decode-server-response)
 * sound: if data arrived in multiple network chunks, the thenables might not
 * yet be fulfilled. (`decodeBufferedResponse` performs the matching
 * single-chunk decode.)
 *
 * TODO: There are too many intermediate stream transformations in the
 * prefetch response pipeline (e.g. stripIsPartialByte, this function).
 * These could all be consolidated into a single transformation. Refactor
 * once the cached navigations experiment lands.
 */
export async function bufferPrefetchResponseBody(
  body: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  // Read the response from the network.
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
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
  if (chunks.length === 1) {
    return chunks[0]
  } else if (chunks.length > 1) {
    const buffer = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      buffer.set(chunk, offset)
      offset += chunk.byteLength
    }
    return buffer
  } else {
    return new Uint8Array(0)
  }
}

/**
 * Creates a streaming (non-buffered) prefetch response stream for legacy
 * full prefetches. These are essentially dynamic responses that get stored in the
 * prefetch cache — they don't carry vary params or other cache metadata that
 * requires synchronous thenable resolution, so there's no need to buffer them.
 * They should continue to stream so consumers can process data as it arrives.
 */
function createIncrementalPrefetchResponseStream(
  originalFlightStream: ReadableStream<Uint8Array>,
  onStreamClose: () => void,
  onChunk: (chunk: Uint8Array, totalByteLength: number) => void
): ReadableStream<Uint8Array> {
  // Each chunk is passed to the caller along with the total byte length so
  // far, so it can incrementally update the size of the cache entry in the LRU.
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

          totalByteLength += value.byteLength
          onChunk(value, totalByteLength)
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

function getStaleAtFromHeader(now: number, response: RSCResponse): number {
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
 * Reads a stale-at time by `await`ing the staleTime async iterable (last
 * yielded value wins) and, if a `response` is given and the iterable yields
 * nothing, falling back to the `Next-Router-Stale-Time` header.
 *
 * The async form is required for the two things `readFulfilledStaleAt` can't
 * do: the header fallback, and reading a legacy full prefetch response — the
 * one response kind that isn't buffered before it's read, so its iterable
 * values must be awaited rather than drained synchronously off their thenable
 * status.
 *
 * Buffered responses (static PPR, runtime prefetch, stage decodes) don't need
 * the async form: segment bundles and the shell-stage decode already read
 * staleTime synchronously via `readFulfilledStaleAt`, and the remaining
 * buffered callers here could be moved to it too.
 */
export async function resolveStaleAt(
  now: number,
  staleTimeIterable: AsyncIterable<number> | undefined,
  response?: RSCResponse
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
 * Writes the prefetch response that a navigation response, or the initial RSC
 * payload, carries into the segment cache, so later navigations can be served
 * from the cache. It carries at most one: an embedded runtime prefetch stream
 * (`p`), from a live render, or the response itself, when it's a complete
 * prerender. Either way, the full payload and its shell (when it has one) are
 * written like any other prefetch response. This flow owns no pending
 * entries, so every write is a detached upsert.
 */
export async function writeNavigationResponseIntoCache(
  now: number,
  response: NavigationFlightResponse,
  // Whether the response is partial. With Cached Navigations, a response that
  // isn't partial is a complete prerender, which is itself a prefetch response.
  // TODO: Temporary. Read this from the response once it says whether it's a
  // complete prerender, instead of having each caller pass it.
  isResponsePartial: boolean,
  // The response's bytes, when they were kept, so a shell can be cut from
  // them. Null otherwise.
  responseChunks: Array<Uint8Array> | null,
  baseTree: FlightRouterState,
  renderedSearch: string,
  // The map the work that spawned this response's request is bound to. See
  // writeServerResponseIntoCache.
  map: CacheMap<SegmentCacheEntry>
): Promise<void> {
  let prefetchResponse: NavigationFlightResponse
  let shellResponse: NavigationFlightResponse | null
  let prefetchStageNeedsRuntimeRequest: NavigationFlightResponse['u'] =
    undefined
  let staleAt: number
  let isPartial: boolean
  if (response.p != null) {
    const stripped = await stripIsPartialByte(response.p)
    const buffer = await bufferPrefetchResponseBody(stripped.stream)
    prefetchResponse = await decodeBufferedResponse<NavigationFlightResponse>(
      buffer,
      undefined
    )
    isPartial = stripped.isPartial
    // The stream is fully buffered, so we can read its stale time and stage
    // byte lengths synchronously. If we can't read the stage byte lengths (an
    // aborted render errors them, and a cut-off stream leaves them pending),
    // we treat it as having no shell, and still write the full payload.
    staleAt = readFulfilledStaleAt(now, prefetchResponse.s)
    const stageByteLengths =
      prefetchResponse.a !== undefined
        ? readFulfilledValue(prefetchResponse.a, undefined)
        : undefined
    if (stageByteLengths === undefined) {
      shellResponse = null
    } else if (stageByteLengths.length === 0) {
      // The shell is the full response.
      shellResponse = prefetchResponse
    } else {
      shellResponse = await decodeResponsePrefix<NavigationFlightResponse>(
        [buffer],
        stageByteLengths[AppStage.Shell],
        undefined
      )
    }
  } else if (
    process.env.__NEXT_CACHE_COMPONENTS &&
    process.env.__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS &&
    !isResponsePartial
  ) {
    prefetchResponse = response
    isPartial = false
    staleAt = await resolveStaleAt(now, response.s)
    shellResponse =
      responseChunks !== null
        ? await resolveStageResponse(
            responseChunks,
            response,
            AppStage.Shell,
            undefined
          )
        : null
    // Decode up to the end of the prefetch stage, just to read `u`. If the
    // prefix can't be decoded, we only use the full payload's `u`.
    if (responseChunks !== null) {
      const prefetchStageResponse = await resolveStageResponse(
        responseChunks,
        response,
        AppStage.Prefetch,
        undefined
      )
      prefetchStageNeedsRuntimeRequest = prefetchStageResponse?.u
    }
  } else {
    return
  }

  writeResponsePayloadsIntoCache(
    now,
    // Every prefetch response a navigation carries renders through the
    // navigation stage.
    AppStage.Navigation,
    prefetchResponse,
    shellResponse,
    prefetchStageNeedsRuntimeRequest,
    baseTree,
    // The base tree is the navigation's current tree, not a prediction;
    // divergence from it carries no signal.
    null,
    // Navigation responses always include the param values in the tree, so
    // there's no pathname to parse them from (nor a need to).
    null,
    renderedSearch,
    // A navigation to a different build is an MPA navigation, so there's no
    // build to check.
    undefined,
    staleAt,
    isPartial,
    null,
    // This flow owns no pending entries; every write is a detached upsert.
    null,
    // Detached writes aren't sized; see writeResponsePayloadsIntoCache.
    null,
    map
  )
}

/**
 * Returns a prerender response as it was at the end of the given stage.
 *
 * - If the response has no `a`, it wasn't staged, so we can't cut out the
 *   stage. Returns null.
 * - If `a` doesn't list the stage, the stage ends at the end of the response.
 *   Returns `flightResponse` itself (callers compare by reference).
 * - Otherwise, decodes the response's bytes up to the stage's offset (see
 *   `decodeResponsePrefix`).
 */
async function resolveStageResponse<
  T extends NavigationFlightResponse | InitialRSCPayload,
>(
  chunks: Array<Uint8Array>,
  flightResponse: T,
  stage: AppStage.Shell | AppStage.Prefetch,
  headers: RequestHeaders | undefined
): Promise<T | null> {
  if (flightResponse.a === undefined) {
    // The render wasn't staged.
    return null
  }

  const stageByteLengths = await flightResponse.a
  const stageByteLength: number | undefined = stageByteLengths[stage]
  if (stageByteLength === undefined) {
    // The stage is the whole response. Return the response itself instead of
    // null, so callers can tell this apart from "the stage can't be cut".
    // They check by reference. The per-segment prefetch fetch does the same
    // (see fetchAndWritePerSegmentPrefetchResponse).
    return flightResponse
  }

  return decodeResponsePrefix<T>(chunks, stageByteLength, headers)
}
