import type {
  FlightRouterState,
  Segment as FlightRouterStateSegment,
  Segment,
} from '../../../shared/lib/app-router-types'
import {
  PrefetchHint,
  StaticPrefetchDisabled,
} from '../../../shared/lib/app-router-types'
import { matchSegment } from '../match-segments'
import {
  readOrCreateRouteCacheEntry,
  readOrCreateSegmentCacheEntry,
  fetchRouteOnCacheMiss,
  fetchSegmentsOnCacheMiss,
  EntryStatus,
  type FulfilledRouteCacheEntry,
  type RouteCacheEntry,
  type RouteTree,
  fetchSegmentPrefetchesUsingDynamicRequest,
  type PendingSegmentCacheEntry,
  type SegmentBundle,
  convertRouteTreeToFlightRouterState,
  readOrCreateRevalidatingSegmentEntry,
  upgradeToPendingSegment,
  overwriteRevalidatingSegmentCacheEntry,
  canNewFetchStrategyProvideMoreContent,
  attemptToFulfillDynamicSegmentFromBFCache,
  attemptToUpgradeSegmentFromBFCache,
  MetadataOnlyRequestTree,
} from './cache'
import type { RouteCacheKey } from './cache-key'
import { createCacheKey } from './cache-key'
import {
  FetchStrategy,
  type PrefetchTaskFetchStrategy,
  PrefetchPriority,
} from './types'
import {
  getCurrentRouteCacheVersion,
  getCurrentSegmentCacheVersion,
} from './cache'
import {
  addSearchParamsIfPageSegment,
  PAGE_SEGMENT_KEY,
} from '../../../shared/lib/segment'
import type { SegmentRequestKey } from '../../../shared/lib/segment-cache/segment-value-encoding'
import { cleanup } from './lru'

const scheduleMicrotask =
  typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (fn: () => unknown) =>
        Promise.resolve()
          .then(fn)
          .catch((error) =>
            setTimeout(() => {
              throw error
            })
          )

export type PrefetchTask = {
  key: RouteCacheKey

  /**
   * The FlightRouterState at the time the task was initiated. This is needed
   * when falling back to the non-PPR behavior, which only prefetches up to
   * the first loading boundary.
   */
  treeAtTimeOfPrefetch: FlightRouterState

  /**
   * The cache versions at the time the task was initiated. Used to determine
   * if the cache was invalidated since the task was initiated. Route and
   * segment caches have separate versions so they can be invalidated
   * independently.
   */
  routeCacheVersion: number
  segmentCacheVersion: number

  /**
   * Whether to prefetch dynamic data, in addition to static data. This is
   * used by `<Link prefetch={true}>`.
   *
   * Note that a task with `FetchStrategy.PPR` might need to use
   * `FetchStrategy.LoadingBoundary` instead if we find out that a route
   * does not support PPR after doing the initial route prefetch.
   */
  fetchStrategy: PrefetchTaskFetchStrategy

  /**
   * sortId is an incrementing counter
   *
   * Newer prefetches are prioritized over older ones, so that as new links
   * enter the viewport, they are not starved by older links that are no
   * longer relevant. In the future, we can add additional prioritization
   * heuristics, like removing prefetches once a link leaves the viewport.
   *
   * The sortId is assigned when the prefetch is initiated, and reassigned if
   * the same task is prefetched again (effectively bumping it to the top of
   * the queue).
   *
   * TODO: We can add additional fields here to indicate what kind of prefetch
   * it is. For example, was it initiated by a link? Or was it an imperative
   * call? If it was initiated by a link, we can remove it from the queue when
   * the link leaves the viewport, but if it was an imperative call, then we
   * should keep it in the queue until it's fulfilled.
   *
   * We can also add priority levels. For example, hovering over a link could
   * increase the priority of its prefetch.
   */
  sortId: number

  /**
   * The priority of the task. Like sortId, this affects the task's position in
   * the queue, so it must never be updated without resifting the heap.
   */
  priority: PrefetchPriority

  /**
   * The phase of the task. Tasks are split into multiple phases so that their
   * priority can be adjusted based on what kind of work they're doing.
   * Concretely, prefetching the route tree is higher priority than prefetching
   * segment data.
   */
  phase: PrefetchPhase

  /**
   * These fields are temporary state for tracking the currently running task.
   * They are reset after each iteration of the task queue.
   */
  hasBackgroundWork: boolean
  spawnedRuntimePrefetches: Set<SegmentRequestKey> | null

  /**
   * True if the prefetch was cancelled.
   */
  isCanceled: boolean

  /**
   * The callback passed to `router.prefetch`, if given.
   */
  onInvalidate: null | (() => void)

  /**
   * The index of the task in the heap's backing array. Used to efficiently
   * change the priority of a task by re-sifting it, which requires knowing
   * where it is in the array. This is only used internally by the heap
   * algorithm. The naive alternative is indexOf every time a task is queued,
   * which has O(n) complexity.
   *
   * We also use this field to check whether a task is currently in the queue.
   */
  _heapIndex: number

  /**
   * Called when the prefetch task finishes (either completed or canceled).
   * Used by the Instant Navigation Testing API to await prefetch completion.
   * Not exposed in production builds by default.
   *
   * Note: "Complete" means the scheduler has no more work to do for this task
   * — all network requests have been spawned. It does not mean all data has
   * been retrieved; responses may still be in flight.
   */
  _onComplete?: () => void
}

const enum PrefetchTaskExitStatus {
  /**
   * The task yielded because there are too many requests in progress.
   */
  InProgress,

  /**
   * The task is blocked. It needs more data before it can proceed.
   *
   * Currently the only reason this happens is we're still waiting to receive a
   * route tree from the server, because we can't start prefetching the segments
   * until we know what to prefetch.
   */
  Blocked,

  /**
   * There's nothing left to prefetch.
   */
  Done,
}

/**
 * Prefetch tasks are processed in phases so that high-leverage work runs
 * before per-link work:
 *
 * - RouteTree: fetch the route's tree structure.
 * - Shell: fetch the route's reusable App Shell (param-free loading state),
 *   if the route can produce one and the feature is enabled. Bounded by
 *   filesystem-route count, not link count — so all Shell prefetches across
 *   queued tasks complete before any Speculative prefetch runs, because
 *   shell responses are shared across every navigation to the same route.
 * - Speculative: fetch the route's concrete per-link segment data.
 *
 * Higher numbers run earlier (matches heap-sort convention).
 */
const enum PrefetchPhase {
  RouteTree = 2,
  Shell = 1,
  Speculative = 0,
}

export type PrefetchSubtaskResult<T> = {
  /**
   * A promise that resolves when the network connection is closed.
   */
  closed: Promise<void>
  value: T
}

const taskHeap: Array<PrefetchTask> = []

let inProgressRequests = 0

let sortIdCounter = 0
let didScheduleMicrotask = false

// The most recently hovered (or touched, etc) link, i.e. the most recent task
// scheduled at Intent priority. There's only ever a single task at Intent
// priority at a time. We reserve special network bandwidth for this task only.
let mostRecentlyHoveredLink: PrefetchTask | null = null

// CDN cache propagation delay after revalidation (in milliseconds)
const REVALIDATION_COOLDOWN_MS = 300

// Timeout handle for the revalidation cooldown. When non-null, prefetch
// requests are blocked to allow CDN cache propagation.
let revalidationCooldownTimeoutHandle: ReturnType<typeof setTimeout> | null =
  null

/**
 * Called by the cache when revalidation occurs. Starts a cooldown period
 * during which prefetch requests are blocked to allow CDN cache propagation.
 */
export function startRevalidationCooldown(): void {
  // Clear any existing timeout in case multiple revalidations happen
  // in quick succession.
  if (revalidationCooldownTimeoutHandle !== null) {
    clearTimeout(revalidationCooldownTimeoutHandle)
  }

  // Schedule the cooldown to expire after the delay.
  revalidationCooldownTimeoutHandle = setTimeout(() => {
    revalidationCooldownTimeoutHandle = null
    // Retry the prefetch queue now that the cooldown has expired.
    pingPrefetchScheduler()
  }, REVALIDATION_COOLDOWN_MS)
}

export type IncludeDynamicData = null | 'full' | 'dynamic'

/**
 * Initiates a prefetch task for the given URL. If a prefetch for the same URL
 * is already in progress, this will bump it to the top of the queue.
 *
 * This is not a user-facing function. By the time this is called, the href is
 * expected to be validated and normalized.
 *
 * @param key The RouteCacheKey to prefetch.
 * @param treeAtTimeOfPrefetch The app's current FlightRouterState
 * @param fetchStrategy Whether to prefetch dynamic data, in addition to
 * static data. This is used by `<Link prefetch={true}>`.
 * @param _onComplete Called when the prefetch task finishes. Testing API only.
 */
export function schedulePrefetchTask(
  key: RouteCacheKey,
  treeAtTimeOfPrefetch: FlightRouterState,
  fetchStrategy: PrefetchTaskFetchStrategy,
  priority: PrefetchPriority,
  onInvalidate: null | (() => void),
  _onComplete?: () => void
): PrefetchTask {
  // Spawn a new prefetch task
  const task: PrefetchTask = {
    key,
    treeAtTimeOfPrefetch,
    routeCacheVersion: getCurrentRouteCacheVersion(),
    segmentCacheVersion: getCurrentSegmentCacheVersion(),
    priority,
    phase: PrefetchPhase.RouteTree,
    hasBackgroundWork: false,
    spawnedRuntimePrefetches: null,
    fetchStrategy,
    sortId: sortIdCounter++,
    isCanceled: false,
    onInvalidate,
    _heapIndex: -1,
  }
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    task._onComplete = _onComplete
  }

  trackMostRecentlyHoveredLink(task)

  heapPush(taskHeap, task)

  // Schedule an async task to process the queue.
  //
  // The main reason we process the queue in an async task is for batching.
  // It's common for a single JS task/event to trigger multiple prefetches.
  // By deferring to a microtask, we only process the queue once per JS task.
  // If they have different priorities, it also ensures they are processed in
  // the optimal order.
  pingPrefetchScheduler()

  return task
}

export function cancelPrefetchTask(task: PrefetchTask): void {
  // Remove the prefetch task from the queue. If the task already completed,
  // then this is a no-op.
  //
  // We must also explicitly mark the task as canceled so that a blocked task
  // does not get added back to the queue when it's pinged by the network.
  task.isCanceled = true
  heapDelete(taskHeap, task)
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    // Call completion callback. In practice this shouldn't be reached for
    // test-initiated prefetches since cancellation is only used by the Link
    // component when elements scroll out of viewport.
    const onComplete = task._onComplete
    task._onComplete = undefined
    onComplete?.()
  }
}

export function reschedulePrefetchTask(
  task: PrefetchTask,
  treeAtTimeOfPrefetch: FlightRouterState,
  fetchStrategy: PrefetchTaskFetchStrategy,
  priority: PrefetchPriority
): void {
  // Bump the prefetch task to the top of the queue, as if it were a fresh
  // task. This is essentially the same as canceling the task and scheduling
  // a new one, except it reuses the original object.
  //
  // The primary use case is to increase the priority of a Link-initated
  // prefetch on hover.
  //
  // Note: _onComplete is not reset here because it's preserved on the same
  // task object. When the rescheduled task completes, the original callback
  // will still be invoked.

  // Un-cancel the task, in case it was previously canceled.
  task.isCanceled = false
  task.phase = PrefetchPhase.RouteTree

  // Assign a new sort ID to move it ahead of all other tasks at the same
  // priority level. (Higher sort IDs are processed first.)
  task.sortId = sortIdCounter++
  task.priority =
    // If this task is the most recently hovered link, maintain its
    // Intent priority, even if the rescheduled priority is lower.
    task === mostRecentlyHoveredLink ? PrefetchPriority.Intent : priority

  task.treeAtTimeOfPrefetch = treeAtTimeOfPrefetch
  task.fetchStrategy = fetchStrategy

  trackMostRecentlyHoveredLink(task)

  if (task._heapIndex !== -1) {
    // The task is already in the queue.
    heapResift(taskHeap, task)
  } else {
    heapPush(taskHeap, task)
  }
  pingPrefetchScheduler()
}

export function isPrefetchTaskDirty(
  task: PrefetchTask,
  nextUrl: string | null,
  tree: FlightRouterState
): boolean {
  // This is used to quickly bail out of a prefetch task if the result is
  // guaranteed to not have changed since the task was initiated. This is
  // strictly an optimization — theoretically, if it always returned true, no
  // behavior should change because a full prefetch task will effectively
  // perform the same checks.
  return (
    task.routeCacheVersion !== getCurrentRouteCacheVersion() ||
    task.segmentCacheVersion !== getCurrentSegmentCacheVersion() ||
    task.treeAtTimeOfPrefetch !== tree ||
    task.key.nextUrl !== nextUrl
  )
}

function trackMostRecentlyHoveredLink(task: PrefetchTask) {
  // Track the mostly recently hovered link, i.e. the most recently scheduled
  // task at Intent priority. There must only be one such task at a time.
  if (
    task.priority === PrefetchPriority.Intent &&
    task !== mostRecentlyHoveredLink
  ) {
    if (mostRecentlyHoveredLink !== null) {
      // Bump the previously hovered link's priority down to Default.
      if (mostRecentlyHoveredLink.priority !== PrefetchPriority.Background) {
        mostRecentlyHoveredLink.priority = PrefetchPriority.Default
        heapResift(taskHeap, mostRecentlyHoveredLink)
      }
    }
    mostRecentlyHoveredLink = task
  }
}

export function pingPrefetchScheduler() {
  if (didScheduleMicrotask) {
    // Already scheduled a task to process the queue
    return
  }
  didScheduleMicrotask = true
  scheduleMicrotask(processQueueInMicrotask)
}

/**
 * Checks if we've exceeded the maximum number of concurrent prefetch requests,
 * to avoid saturating the browser's internal network queue. This is a
 * cooperative limit — prefetch tasks should check this before issuing
 * new requests.
 *
 * Also checks if we're within the revalidation cooldown window, during which
 * prefetch requests are delayed to allow CDN cache propagation.
 */
function hasNetworkBandwidth(task: PrefetchTask): boolean {
  // When offline, don't issue any prefetch requests. The scheduler will be
  // re-pinged when connectivity is restored.
  if (process.env.__NEXT_USE_OFFLINE) {
    const { getOffline } = require('../offline') as typeof import('../offline')
    if (getOffline()) {
      return false
    }
  }

  // Check if we're within the revalidation cooldown window
  if (revalidationCooldownTimeoutHandle !== null) {
    // We're within the cooldown window. Return false to prevent prefetching.
    // When the cooldown expires, the timeout will call ensureWorkIsScheduled()
    // to retry the queue.
    return false
  }

  // TODO: Also check if there's an in-progress navigation. We should never
  // add prefetch requests to the network queue if an actual navigation is
  // taking place, to ensure there's sufficient bandwidth for render-blocking
  // data and resources.

  // TODO: Consider reserving some amount of bandwidth for static prefetches.

  if (task.priority === PrefetchPriority.Intent) {
    // The most recently hovered link is allowed to exceed the default limit.
    //
    // The goal is to always have enough bandwidth to start a new prefetch
    // request when hovering over a link.
    //
    // However, because we don't abort in-progress requests, it's still possible
    // we'll run out of bandwidth. When links are hovered in quick succession,
    // there could be multiple hover requests running simultaneously.
    return inProgressRequests < 12
  }

  // The default limit is lower than the limit for a hovered link.
  return inProgressRequests < 4
}

function spawnPrefetchSubtask<T>(
  prefetchSubtask: Promise<PrefetchSubtaskResult<T> | null>
): Promise<T | null> {
  // When the scheduler spawns an async task, we don't await its result.
  // Instead, the async task writes its result directly into the cache, then
  // pings the scheduler to continue.
  //
  // We process server responses streamingly, so the prefetch subtask will
  // likely resolve before we're finished receiving all the data. The subtask
  // result includes a promise that resolves once the network connection is
  // closed. The scheduler uses this to control network bandwidth by tracking
  // and limiting the number of concurrent requests.
  inProgressRequests++
  return prefetchSubtask.then((result) => {
    if (result === null) {
      // The prefetch task errored before it could start processing the
      // network stream. Assume the connection is closed.
      onPrefetchConnectionClosed()
      return null
    }
    // Wait for the connection to close before freeing up more bandwidth.
    result.closed.then(onPrefetchConnectionClosed)
    return result.value
  })
}

function onPrefetchConnectionClosed(): void {
  inProgressRequests--

  // Notify the scheduler that we have more bandwidth, and can continue
  // processing tasks.
  pingPrefetchScheduler()
}

/**
 * Notify the scheduler that we've received new data for an in-progress
 * prefetch. The corresponding task will be added back to the queue (unless the
 * task has been canceled in the meantime).
 */
export function pingPrefetchTask(task: PrefetchTask) {
  // "Ping" a prefetch that's already in progress to notify it of new data.
  if (
    // Check if prefetch was canceled.
    task.isCanceled ||
    // Check if prefetch is already queued.
    task._heapIndex !== -1
  ) {
    return
  }
  // Add the task back to the queue.
  heapPush(taskHeap, task)
  pingPrefetchScheduler()
}

function processQueueInMicrotask() {
  didScheduleMicrotask = false

  // We aim to minimize how often we read the current time. Since nearly all
  // functions in the prefetch scheduler are synchronous, we can read the time
  // once and pass it as an argument wherever it's needed.
  const now = Date.now()

  // Process the task queue until we run out of network bandwidth.
  let task = heapPeek(taskHeap)
  while (task !== null && hasNetworkBandwidth(task)) {
    task.routeCacheVersion = getCurrentRouteCacheVersion()
    task.segmentCacheVersion = getCurrentSegmentCacheVersion()

    const exitStatus = pingRoute(now, task)

    // These fields are only valid for a single attempt. Reset them after each
    // iteration of the task queue.
    const hasBackgroundWork = task.hasBackgroundWork
    task.hasBackgroundWork = false
    task.spawnedRuntimePrefetches = null

    switch (exitStatus) {
      case PrefetchTaskExitStatus.InProgress:
        // The task yielded because there are too many requests in progress.
        // Stop processing tasks until we have more bandwidth.
        return
      case PrefetchTaskExitStatus.Blocked:
        // The task is blocked. It needs more data before it can proceed.
        // Keep the task out of the queue until the server responds.
        heapPop(taskHeap)
        // Continue to the next task
        task = heapPeek(taskHeap)
        continue
      case PrefetchTaskExitStatus.Done:
        if (task.phase === PrefetchPhase.RouteTree) {
          // Finished prefetching the route tree. If App Shells are enabled,
          // run the Shell phase next; otherwise go straight to Speculative.
          task.phase = process.env.__NEXT_APP_SHELLS
            ? PrefetchPhase.Shell
            : PrefetchPhase.Speculative
          heapResift(taskHeap, task)
        } else if (task.phase === PrefetchPhase.Shell) {
          // Shell phase complete. Always advance to Speculative regardless
          // of whether Shell-phase work fired — Speculative is responsible
          // for the per-link concrete work and runs even on routes whose
          // shell phase was a no-op.
          task.phase = PrefetchPhase.Speculative
          heapResift(taskHeap, task)
        } else if (hasBackgroundWork) {
          // The task spawned additional background work. Reschedule the task
          // at background priority.
          task.priority = PrefetchPriority.Background
          heapResift(taskHeap, task)
        } else {
          // The prefetch is complete. Continue to the next task.
          if (process.env.__NEXT_EXPOSE_TESTING_API) {
            // Notify the Instant Navigation Testing API that the prefetch has
            // completed, so it can proceed with navigation.
            const onComplete = task._onComplete
            task._onComplete = undefined
            onComplete?.()
          }
          heapPop(taskHeap)
        }
        task = heapPeek(taskHeap)
        continue
      default:
        exitStatus satisfies never
    }
  }

  // Run LRU cleanup only when the scheduler is fully idle: no queued tasks and
  // no in-progress requests. At that point, all active prefetch tasks have
  // finished reading from the cache (moving recently used entries to the front
  // of the list), so only genuinely stale data gets evicted.
  if (task === null && inProgressRequests === 0) {
    cleanup()
  }
}

/**
 * Check this during a prefetch task to determine if background work can be
 * performed. If so, it evaluates to `true`. Otherwise, it returns `false`,
 * while also scheduling a background task to run later. Usage:
 *
 * @example
 * if (background(task)) {
 *   // Perform background-pri work
 * }
 *
 * TODO: Model "background" as a phase (like Shell / Speculative) rather
 * than as a priority. Conceptually it's the same pattern: defer work
 * until a later pass over the task. The current priority-based encoding
 * predates the phase model and could be unified.
 */
function background(task: PrefetchTask): boolean {
  if (task.priority === PrefetchPriority.Background) {
    return true
  }
  task.hasBackgroundWork = true
  return false
}

function pingRoute(now: number, task: PrefetchTask): PrefetchTaskExitStatus {
  const key = task.key
  const route = readOrCreateRouteCacheEntry(now, task, key)
  const exitStatus = pingRootRouteTree(now, task, route)

  if (exitStatus !== PrefetchTaskExitStatus.InProgress && key.search !== '') {
    // If the URL has a non-empty search string, also prefetch the pathname
    // without the search string. We use the searchless route tree as a base for
    // optimistic routing; see requestOptimisticRouteCacheEntry for details.
    //
    // Note that we don't need to prefetch any of the segment data. Just the
    // route tree.
    //
    // TODO: This is a temporary solution; the plan is to replace this by adding
    // a wildcard lookup method to the TupleMap implementation. This is
    // non-trivial to implement because it needs to account for things like
    // fallback route entries, hence this temporary workaround.
    const url = new URL(key.pathname, location.origin)
    const keyWithoutSearch = createCacheKey(url.href, key.nextUrl)
    const routeWithoutSearch = readOrCreateRouteCacheEntry(
      now,
      task,
      keyWithoutSearch
    )
    switch (routeWithoutSearch.status) {
      case EntryStatus.Empty: {
        if (background(task)) {
          routeWithoutSearch.status = EntryStatus.Pending
          spawnPrefetchSubtask(
            fetchRouteOnCacheMiss(routeWithoutSearch, keyWithoutSearch)
          )
        }
        break
      }
      case EntryStatus.Pending:
      case EntryStatus.Fulfilled:
      case EntryStatus.Rejected: {
        // Either the route tree is already cached, or there's already a
        // request in progress. Since we don't need to fetch any segment data
        // for this route, there's nothing left to do.
        break
      }
      default:
        routeWithoutSearch satisfies never
    }
  }

  return exitStatus
}

function pingRootRouteTree(
  now: number,
  task: PrefetchTask,
  route: RouteCacheEntry
): PrefetchTaskExitStatus {
  switch (route.status) {
    case EntryStatus.Empty: {
      // Route is not yet cached, and there's no request already in progress.
      // Spawn a task to request the route, load it into the cache, and ping
      // the task to continue.

      // TODO: There are multiple strategies in the <Link> API for prefetching
      // a route. Currently we've only implemented the main one: per-segment,
      // static-data only.
      //
      // There's also `<Link prefetch={true}>`
      // which prefetch both static *and* dynamic data.
      // Similarly, we need to fallback to the old, per-page
      // behavior if PPR is disabled for a route (via the incremental opt-in).
      //
      // Those cases will be handled here.
      spawnPrefetchSubtask(fetchRouteOnCacheMiss(route, task.key))

      // If the request takes longer than a minute, a subsequent request should
      // retry instead of waiting for this one. When the response is received,
      // this value will be replaced by a new value based on the stale time sent
      // from the server.
      // TODO: We should probably also manually abort the fetch task, to reclaim
      // server bandwidth.
      route.staleAt = now + 60 * 1000

      // Upgrade to Pending so we know there's already a request in progress
      route.status = EntryStatus.Pending

      // Intentional fallthrough to the Pending branch
    }
    case EntryStatus.Pending: {
      // Still pending. We can't start prefetching the segments until the route
      // tree has loaded. Add the task to the set of blocked tasks so that it
      // is notified when the route tree is ready.
      const blockedTasks = route.blockedTasks
      if (blockedTasks === null) {
        route.blockedTasks = new Set([task])
      } else {
        blockedTasks.add(task)
      }
      return PrefetchTaskExitStatus.Blocked
    }
    case EntryStatus.Rejected: {
      // Route tree failed to load. Treat as a 404.
      return PrefetchTaskExitStatus.Done
    }
    case EntryStatus.Fulfilled: {
      if (task.phase === PrefetchPhase.RouteTree) {
        // Do not prefetch segment data during the route tree phase.
        return PrefetchTaskExitStatus.Done
      }
      // Recursively fill in the segment tree.
      if (!hasNetworkBandwidth(task)) {
        // Stop prefetching segments until there's more bandwidth.
        return PrefetchTaskExitStatus.InProgress
      }
      const tree = route.tree

      // A task's fetch strategy gets set to `PPR` for any "auto" prefetch.
      // If it turned out that the route isn't PPR-enabled, we need to use `LoadingBoundary` instead.
      // We don't need to do this for runtime prefetches, because those are only available in
      // `cacheComponents`, where every route is PPR.
      let fetchStrategy: FetchStrategy
      if (tree.prefetchHints & PrefetchHint.SubtreeHasPartialPrefetching) {
        // If `instant` is defined anywhere on the target route, ignore the
        // fetch strategy and switch to unified strategy used by Cache
        // Components (called `PPR` for now, will likely be renamed).
        //
        // In practice, this just means that a "full" prefetch (<Link
        // prefetch={true}>) has no effect. You're meant to use Runtime
        // Prefetching instead — that's the new pattern that replaces
        // prefetch={true}.
        //
        // The reason we check for `instant` rather than the `cacheComponents`
        // flag is to support incremental adoption. `prefetch={true}` will
        // continue to work until you opt into `instant`.
        fetchStrategy = FetchStrategy.PPR
      } else if (task.fetchStrategy === FetchStrategy.PPR) {
        fetchStrategy = route.supportsPerSegmentPrefetching
          ? FetchStrategy.PPR
          : FetchStrategy.LoadingBoundary
      } else {
        fetchStrategy = task.fetchStrategy
      }

      switch (fetchStrategy) {
        case FetchStrategy.PPR: {
          // For Cache Components pages, each segment may be prefetched
          // statically or using a runtime request, based on various
          // configurations and heuristics. We'll do this in two passes: first
          // traverse the tree and perform all the static prefetches.
          //
          // Then, if there are any segments that need a runtime request,
          // do another pass to perform a runtime prefetch.

          if (
            task.phase === PrefetchPhase.Speculative &&
            !subtreeHasSpeculativePrefetch(task, tree.prefetchHints)
          ) {
            // Nothing in the target route needs to be speculatively prefetched.
            // Bail out.
            return PrefetchTaskExitStatus.Done
          }

          pingStaticHead(now, task, route)
          const exitStatus = pingSharedPartOfCacheComponentsTree(
            now,
            task,
            route,
            task.treeAtTimeOfPrefetch,
            tree,
            null
          )
          if (exitStatus === PrefetchTaskExitStatus.InProgress) {
            // Child yielded without finishing.
            return PrefetchTaskExitStatus.InProgress
          }

          // We may need to do a runtime prefetch for one or more segments.
          // Before checking, we can do some fast checks to bail out of this
          // branch early.
          if (
            // Do any segments have runtime prefetching configured? This is
            // sent by the server as part of the prefetch hints.
            tree.prefetchHints & PrefetchHint.SubtreeHasRuntimePrefetch ||
            // Are we in the Shell prefetching phase? The Shell phase is
            // allowed to perform runtime prefetches even without an explicit
            // opt-in because the Shell for a given route is reusable across
            // all given params, by definition. So it does not lead to an
            // explosion in prefetching costs.
            // TODO: In the future, the server could emit a hint to tell us
            // *not* to prefetch via a runtime request, via build-time
            // heuristics, like if no `cookies()` call was detected. We'll
            // leave this optimization for later.
            task.phase === PrefetchPhase.Shell
          ) {
            const runtimeStrategy =
              task.phase === PrefetchPhase.Shell
                ? FetchStrategy.RuntimeShell
                : FetchStrategy.PPRRuntime

            // Always ping the runtime head — it may need to be fetched
            // independently even if all runtime segments are already
            // cached (e.g. navigating between siblings under a shared
            // runtime layout).
            const spawnedEntries = new Map<
              SegmentRequestKey,
              PendingSegmentCacheEntry
            >()
            pingRuntimeHead(now, task, route, spawnedEntries, runtimeStrategy)

            const spawnedRuntimePrefetches = task.spawnedRuntimePrefetches
            if (spawnedRuntimePrefetches !== null) {
              const requestTree = pingRuntimePrefetches(
                now,
                task,
                route,
                tree,
                spawnedRuntimePrefetches,
                spawnedEntries,
                runtimeStrategy
              )
              if (spawnedEntries.size > 0) {
                spawnPrefetchSubtask(
                  fetchSegmentPrefetchesUsingDynamicRequest(
                    task,
                    route,
                    runtimeStrategy,
                    requestTree,
                    spawnedEntries
                  )
                )
              }
            } else {
              // No segments spawned a runtime prefetch; however, the head might
              // have. If there are any spawned entries, it must have come from
              // the head. Request the metadata only.
              // TODO: Refactor the "request tree" format so that the metadata
              // is less of a special case. Right now the logic for this is
              // spread across both here
              // and fetchSegmentPrefetchesUsingDynamicRequest.
              if (spawnedEntries.size > 0) {
                spawnPrefetchSubtask(
                  fetchSegmentPrefetchesUsingDynamicRequest(
                    task,
                    route,
                    runtimeStrategy,
                    MetadataOnlyRequestTree,
                    spawnedEntries
                  )
                )
              }
            }
          }

          return PrefetchTaskExitStatus.Done
        }
        case FetchStrategy.Full:
        case FetchStrategy.PPRRuntime:
        case FetchStrategy.LoadingBoundary: {
          if (task.phase === PrefetchPhase.Shell) {
            // Shell phase only does work on routes that use the PPR strategy
            // (Cache Components routes). Other strategies are Shell no-ops
            // and fall through to Speculative.
            return PrefetchTaskExitStatus.Done
          }
          // Prefetch multiple segments using a single dynamic request.
          // TODO: We can consolidate this branch with previous one by modeling
          // it as if the first segment in the new tree has runtime prefetching
          // enabled. Will do this as a follow-up refactor. Might want to remove
          // the special metatdata case below first. In the meantime, it's not
          // really that much duplication, just would be nice to remove one of
          // these codepaths.
          const spawnedEntries = new Map<
            SegmentRequestKey,
            PendingSegmentCacheEntry
          >()
          pingRuntimeHead(now, task, route, spawnedEntries, fetchStrategy)
          const dynamicRequestTree = diffRouteTreeAgainstCurrent(
            now,
            task,
            route,
            task.treeAtTimeOfPrefetch,
            tree,
            spawnedEntries,
            fetchStrategy
          )
          let needsDynamicRequest = spawnedEntries.size > 0
          if (needsDynamicRequest) {
            spawnPrefetchSubtask(
              fetchSegmentPrefetchesUsingDynamicRequest(
                task,
                route,
                fetchStrategy,
                dynamicRequestTree,
                spawnedEntries
              )
            )
          }
          return PrefetchTaskExitStatus.Done
        }
        default:
          fetchStrategy satisfies never
      }
      break
    }
    default: {
      route satisfies never
    }
  }
  return PrefetchTaskExitStatus.Done
}

function pingStaticHead(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry
): void {
  // The Head data for a page (metadata, viewport) is not really a route
  // segment, in the sense that it doesn't appear in the route tree. But we
  // store it in the cache as if it were, using a special key.
  if (
    // TODO: Currently static App Shell extraction is not implemented for
    // per-segment prefetch responses. Instead, shell prefetches are only
    // supported via a runtime prefetch request. The head will be prefetched
    // as part of that request, so it's fine that we skip it here.
    task.phase === PrefetchPhase.Shell ||
    // If the head was inlined into a page's bundle (HeadOutlined is NOT set
    // on the root), skip the standalone fetch — the head data will arrive
    // as part of that page's response.
    (process.env.__NEXT_PREFETCH_INLINING &&
      !(route.tree.prefetchHints & PrefetchHint.HeadOutlined))
  ) {
    return
  }

  const segments: SegmentBundle = {
    tree: route.metadata,
    entry: readOrCreateSegmentCacheEntry(
      now,
      FetchStrategy.PPR,
      route.metadata
    ),
    parent: null,
  }
  pingSegmentBundle(now, route, task.key, route.metadata, segments)
}

function pingRuntimeHead(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry>,
  fetchStrategy:
    | FetchStrategy.Full
    | FetchStrategy.PPRRuntime
    | FetchStrategy.RuntimeShell
    | FetchStrategy.LoadingBoundary
): void {
  pingRouteTreeAndIncludeDynamicData(
    now,
    task,
    route,
    route.metadata,
    false,
    spawnedEntries,
    // When prefetching the head, there's no difference between Full
    // and LoadingBoundary
    fetchStrategy === FetchStrategy.LoadingBoundary
      ? FetchStrategy.Full
      : fetchStrategy
  )
}

// TODO: Rename dynamic -> runtime throughout this module

function pingSharedPartOfCacheComponentsTree(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  oldTree: FlightRouterState,
  newTree: RouteTree,
  parentBundle: SegmentBundle | null
): PrefetchTaskExitStatus {
  // When Cache Components is enabled (or PPR, or a fully static route when PPR
  // is disabled; those cases are treated equivalently to Cache Components), we
  // start by prefetching each segment individually. Once we reach the "new"
  // part of the tree — the part that doesn't exist on the current page — we
  // may choose to switch to a runtime prefetch instead, based on the
  // information sent by the server in the route tree.
  //
  // The traversal starts in the "shared" part of the tree. Once we reach the
  // "new" part of the tree, we switch to a different traversal,
  // pingNewPartOfCacheComponentsTree.

  const bundleInProgress = accumulateSegmentBundle(
    now,
    task,
    route,
    newTree,
    parentBundle
  )

  // Recursively ping the children.
  const oldTreeChildren = oldTree[1]
  const newTreeChildren = newTree.slots
  if (newTreeChildren !== null) {
    for (const parallelRouteKey in newTreeChildren) {
      if (!hasNetworkBandwidth(task)) {
        // Stop prefetching segments until there's more bandwidth.
        return PrefetchTaskExitStatus.InProgress
      }
      const newTreeChild = newTreeChildren[parallelRouteKey]
      const newTreeChildSegment = newTreeChild.segment
      const oldTreeChild: FlightRouterState | void =
        oldTreeChildren[parallelRouteKey]
      const oldTreeChildSegment: FlightRouterStateSegment | void =
        oldTreeChild?.[0]
      // Only pass the bundle to the child that accepts it. A parent is
      // only ever bundled into one child.
      const bundleForChild =
        process.env.__NEXT_PREFETCH_INLINING &&
        bundleInProgress !== null &&
        newTreeChild.prefetchHints & PrefetchHint.ParentInlinedIntoSelf
          ? bundleInProgress
          : null
      let childExitStatus
      if (
        oldTreeChildSegment !== undefined &&
        doesCurrentSegmentMatchCachedSegment(
          route,
          newTreeChildSegment,
          oldTreeChildSegment
        )
      ) {
        // We're still in the "shared" part of the tree.
        childExitStatus = pingSharedPartOfCacheComponentsTree(
          now,
          task,
          route,
          oldTreeChild,
          newTreeChild,
          bundleForChild
        )
      } else {
        // We've entered the "new" part of the tree. Switch
        // traversal functions.
        childExitStatus = pingNewPartOfCacheComponentsTree(
          now,
          task,
          route,
          newTreeChild,
          bundleForChild
        )
      }
      if (childExitStatus === PrefetchTaskExitStatus.InProgress) {
        // Child yielded without finishing.
        return PrefetchTaskExitStatus.InProgress
      }
    }
  }

  return PrefetchTaskExitStatus.Done
}

function pingNewPartOfCacheComponentsTree(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree,
  parentBundle: SegmentBundle | null
): PrefetchTaskExitStatus.InProgress | PrefetchTaskExitStatus.Done {
  // We're now prefetching in the "new" part of the tree, the part that doesn't
  // exist on the current page. (In other words, we're deeper than the
  // shared layouts.) Segments in here default to being prefetched statically.
  // However, if the server instructs us to, we may switch to a runtime
  // prefetch instead. Traverse the tree and check at each segment.
  //
  // In the Shell phase, every new segment is treated as a runtime-prefetch
  // boundary regardless of `HasRuntimePrefetch`, because the Shell is
  // reusable across all params by definition (see the matching comment in
  // the main scheduler loop).
  //
  // TODO: If we're reasonably confident that the shell does not depend on
  // session data (cookies), we should attempt to prefetch the shell
  // statically, instead of via a runtime prefetch. This is an optimization to skip a
  // runtime shell request. For fully static pages, it doesn't matter since
  // server will respond to even a runtime request with a static response. For
  // a partially static page, we can send down a hint from the server.

  if (
    task.phase === PrefetchPhase.Speculative &&
    !subtreeHasSpeculativePrefetch(task, tree.prefetchHints)
  ) {
    // Nothing in the new part of the tree needs to be speculatively prefetched.
    // Bail out.
    return PrefetchTaskExitStatus.Done
  }

  if (
    tree.prefetchHints & PrefetchHint.HasRuntimePrefetch ||
    task.phase === PrefetchPhase.Shell
  ) {
    if (task.spawnedRuntimePrefetches === null) {
      task.spawnedRuntimePrefetches = new Set([tree.requestKey])
    } else {
      task.spawnedRuntimePrefetches.add(tree.requestKey)
    }
    // If there's a pending static bundle from a parent, we need to finish
    // prefetching it before bailing out to runtime prefetching.
    if (parentBundle !== null) {
      finishStaticBundleOnRuntimeBailout(now, task, route, tree, parentBundle)
    }
    return PrefetchTaskExitStatus.Done
  }

  const bundleInProgress = accumulateSegmentBundle(
    now,
    task,
    route,
    tree,
    parentBundle
  )

  if (tree.slots !== null) {
    if (!hasNetworkBandwidth(task)) {
      // Stop prefetching segments until there's more bandwidth.
      return PrefetchTaskExitStatus.InProgress
    }
    // Recursively ping the children.
    for (const parallelRouteKey in tree.slots) {
      const childTree = tree.slots[parallelRouteKey]
      // Only pass the bundle to the child that accepts it. A parent is
      // only ever bundled into one child.
      const bundleForChild =
        process.env.__NEXT_PREFETCH_INLINING &&
        bundleInProgress !== null &&
        childTree.prefetchHints & PrefetchHint.ParentInlinedIntoSelf
          ? bundleInProgress
          : null
      const childExitStatus = pingNewPartOfCacheComponentsTree(
        now,
        task,
        route,
        childTree,
        bundleForChild
      )
      if (childExitStatus === PrefetchTaskExitStatus.InProgress) {
        // Child yielded without finishing.
        return PrefetchTaskExitStatus.InProgress
      }
    }
  }
  // This segment and all its children have finished prefetching.
  return PrefetchTaskExitStatus.Done
}

function diffRouteTreeAgainstCurrent(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  oldTree: FlightRouterState,
  newTree: RouteTree,
  spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry>,
  fetchStrategy:
    | FetchStrategy.Full
    | FetchStrategy.PPRRuntime
    | FetchStrategy.LoadingBoundary
): FlightRouterState {
  // This is a single recursive traversal that does multiple things:
  // - Finds the parts of the target route (newTree) that are not part of
  //   of the current page (oldTree) by diffing them, using the same algorithm
  //   as a real navigation.
  // - Constructs a request tree (FlightRouterState) that describes which
  //   segments need to be prefetched and which ones are already cached.
  // - Creates a set of pending cache entries for the segments that need to
  //   be prefetched, so that a subsequent prefetch task does not request the
  //   same segments again.
  const oldTreeChildren = oldTree[1]
  const newTreeChildren = newTree.slots
  let requestTreeChildren: Record<string, FlightRouterState> = {}
  if (newTreeChildren !== null) {
    for (const parallelRouteKey in newTreeChildren) {
      const newTreeChild = newTreeChildren[parallelRouteKey]
      const newTreeChildSegment = newTreeChild.segment
      const oldTreeChild: FlightRouterState | void =
        oldTreeChildren[parallelRouteKey]
      const oldTreeChildSegment: FlightRouterStateSegment | void =
        oldTreeChild?.[0]
      if (
        oldTreeChildSegment !== undefined &&
        doesCurrentSegmentMatchCachedSegment(
          route,
          newTreeChildSegment,
          oldTreeChildSegment
        )
      ) {
        // This segment is already part of the current route. Keep traversing.
        const requestTreeChild = diffRouteTreeAgainstCurrent(
          now,
          task,
          route,
          oldTreeChild,
          newTreeChild,
          spawnedEntries,
          fetchStrategy
        )
        requestTreeChildren[parallelRouteKey] = requestTreeChild
      } else {
        // This segment is not part of the current route. We're entering a
        // part of the tree that we need to prefetch (unless everything is
        // already cached).
        switch (fetchStrategy) {
          case FetchStrategy.LoadingBoundary: {
            // When PPR is disabled, we can't prefetch per segment. We must
            // fallback to the old prefetch behavior and send a dynamic request.
            // Only routes that include a loading boundary can be prefetched in
            // this way.
            //
            // This is simlar to a "full" prefetch, but we're much more
            // conservative about which segments to include in the request.
            //
            // The server will only render up to the first loading boundary
            // inside new part of the tree. If there's no loading boundary
            // anywhere in the tree, the server will never return any data, so
            // we can skip the request.
            const subtreeHasLoadingBoundary =
              (newTreeChild.prefetchHints &
                (PrefetchHint.SegmentHasLoadingBoundary |
                  PrefetchHint.SubtreeHasLoadingBoundary)) !==
              0
            const requestTreeChild = subtreeHasLoadingBoundary
              ? pingPPRDisabledRouteTreeUpToLoadingBoundary(
                  now,
                  task,
                  route,
                  newTreeChild,
                  null,
                  spawnedEntries
                )
              : // There's no loading boundary within this tree. Bail out.
                convertRouteTreeToFlightRouterState(newTreeChild)
            requestTreeChildren[parallelRouteKey] = requestTreeChild
            break
          }
          case FetchStrategy.PPRRuntime: {
            // This is a runtime prefetch. Fetch all cacheable data in the tree,
            // not just the static PPR shell.
            const requestTreeChild = pingRouteTreeAndIncludeDynamicData(
              now,
              task,
              route,
              newTreeChild,
              false,
              spawnedEntries,
              fetchStrategy
            )
            requestTreeChildren[parallelRouteKey] = requestTreeChild
            break
          }
          case FetchStrategy.Full: {
            // This is a "full" prefetch. Fetch all the data in the tree, both
            // static and dynamic. We issue roughly the same request that we
            // would during a real navigation. The goal is that once the
            // navigation occurs, the router should not have to fetch any
            // additional data.
            //
            // Although the response will include dynamic data, opting into a
            // Full prefetch — via <Link prefetch={true}> — implicitly
            // instructs the cache to treat the response as "static", or non-
            // dynamic, since the whole point is to cache it for
            // future navigations.
            //
            // Construct a tree (currently a FlightRouterState) that represents
            // which segments need to be prefetched and which ones are already
            // cached. If the tree is empty, then we can exit. Otherwise, we'll
            // send the request tree to the server and use the response to
            // populate the segment cache.
            const requestTreeChild = pingRouteTreeAndIncludeDynamicData(
              now,
              task,
              route,
              newTreeChild,
              false,
              spawnedEntries,
              fetchStrategy
            )
            requestTreeChildren[parallelRouteKey] = requestTreeChild
            break
          }
          default:
            fetchStrategy satisfies never
        }
      }
    }
  }
  const requestTree: FlightRouterState = [
    newTree.segment,
    requestTreeChildren,
    null,
    null,
  ]
  return requestTree
}

function pingPPRDisabledRouteTreeUpToLoadingBoundary(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree,
  refetchMarkerContext: 'refetch' | 'inside-shared-layout' | null,
  spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry>
): FlightRouterState {
  // This function is similar to pingRouteTreeAndIncludeDynamicData, except the
  // server is only going to return a minimal loading state — it will stop
  // rendering at the first loading boundary. Whereas a Full prefetch is
  // intentionally aggressive and tries to pretfetch all the data that will be
  // needed for a navigation, a LoadingBoundary prefetch is much more
  // conservative. For example, it will omit from the request tree any segment
  // that is already cached, regardles of whether it's partial or full. By
  // contrast, a Full prefetch will refetch partial segments.

  // "inside-shared-layout" tells the server where to start looking for a
  // loading boundary.
  let refetchMarker: 'refetch' | 'inside-shared-layout' | null =
    refetchMarkerContext === null ? 'inside-shared-layout' : null

  const segment = readOrCreateSegmentCacheEntry(now, task.fetchStrategy, tree)
  switch (segment.status) {
    case EntryStatus.Empty: {
      // This segment is not cached. Add a refetch marker so the server knows
      // to start rendering here.
      // TODO: Instead of a "refetch" marker, we could just omit this subtree's
      // FlightRouterState from the request tree. I think this would probably
      // already work even without any updates to the server. For consistency,
      // though, I'll send the full tree and we'll look into this later as part
      // of a larger redesign of the request protocol.

      // Add the pending cache entry to the result map.
      spawnedEntries.set(
        tree.requestKey,
        upgradeToPendingSegment(
          segment,
          // Set the fetch strategy to LoadingBoundary to indicate that the server
          // might not include it in the pending response. If another route is able
          // to issue a per-segment request, we'll do that in the background.
          FetchStrategy.LoadingBoundary
        )
      )
      if (refetchMarkerContext !== 'refetch') {
        refetchMarker = refetchMarkerContext = 'refetch'
      } else {
        // There's already a parent with a refetch marker, so we don't need
        // to add another one.
      }
      break
    }
    case EntryStatus.Fulfilled: {
      // The segment is already cached.
      const segmentHasLoadingBoundary =
        (tree.prefetchHints & PrefetchHint.SegmentHasLoadingBoundary) !== 0
      if (segmentHasLoadingBoundary) {
        // This segment has a loading boundary, which means the server won't
        // render its children. So there's nothing left to prefetch along this
        // path. We can bail out.
        return convertRouteTreeToFlightRouterState(tree)
      }
      // NOTE: If the cached segment were fetched using PPR, then it might be
      // partial. We could get a more complete version of the segment by
      // including it in this non-PPR request.
      //
      // We're intentionally choosing not to, though, because it's generally
      // better to avoid doing a full prefetch whenever possible.
      break
    }
    case EntryStatus.Pending: {
      // There's another prefetch currently in progress. Don't add the refetch
      // marker yet, so the server knows it can skip rendering this segment.
      break
    }
    case EntryStatus.Rejected: {
      // The segment failed to load. We shouldn't issue another request until
      // the stale time has elapsed.
      break
    }
    default:
      segment satisfies never
  }
  const requestTreeChildren: Record<string, FlightRouterState> = {}
  if (tree.slots !== null) {
    for (const parallelRouteKey in tree.slots) {
      const childTree = tree.slots[parallelRouteKey]
      requestTreeChildren[parallelRouteKey] =
        pingPPRDisabledRouteTreeUpToLoadingBoundary(
          now,
          task,
          route,
          childTree,
          refetchMarkerContext,
          spawnedEntries
        )
    }
  }
  const requestTree: FlightRouterState = [
    tree.segment,
    requestTreeChildren,
    null,
    refetchMarker,
  ]
  return requestTree
}

function pingRouteTreeAndIncludeDynamicData(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree,
  isInsideRefetchingParent: boolean,
  spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry>,
  fetchStrategy:
    | FetchStrategy.Full
    | FetchStrategy.PPRRuntime
    | FetchStrategy.RuntimeShell
): FlightRouterState {
  // The tree we're constructing is the same shape as the tree we're navigating
  // to. But even though this is a "new" tree, some of the individual segments
  // may be cached as a result of other route prefetches.
  //
  // So we need to find the first uncached segment along each path add an
  // explicit "refetch" marker so the server knows where to start rendering.
  // Once the server starts rendering along a path, it keeps rendering the
  // entire subtree.
  const segment = readOrCreateSegmentCacheEntry(
    now,
    // Note that `fetchStrategy` might be different from `task.fetchStrategy`,
    // and we have to use the former here.
    // We can have a task with `FetchStrategy.PPR` where some of its segments are configured to
    // always use runtime prefetching (via `export const prefetch`), and those should check for
    // entries that include search params.
    fetchStrategy,
    tree
  )

  let spawnedSegment: PendingSegmentCacheEntry | null = null

  switch (segment.status) {
    case EntryStatus.Empty: {
      // This segment is not cached.
      if (fetchStrategy === FetchStrategy.Full) {
        // Check if there's a matching entry in the bfcache. If so, fulfill the
        // segment using the bfcache entry instead of issuing a new request.
        const fulfilled = attemptToFulfillDynamicSegmentFromBFCache(
          now,
          segment,
          tree
        )
        if (fulfilled !== null) {
          break
        }
      }
      // Include it in the request.
      spawnedSegment = upgradeToPendingSegment(segment, fetchStrategy)
      break
    }
    case EntryStatus.Fulfilled: {
      // The segment is already cached.
      if (
        segment.isPartial &&
        canNewFetchStrategyProvideMoreContent(
          segment.fetchStrategy,
          fetchStrategy
        )
      ) {
        // The cached segment contains dynamic holes, and was prefetched using a
        // less specific strategy than the current one. This means we're in one
        // of these cases:
        //   - we have a static prefetch, and we're doing a runtime prefetch
        //   - we have a static or runtime prefetch, and we're doing a Full
        //     prefetch (or a navigation).
        // In either case, we need to include it in the request to get a more
        // specific (or full) version. However, if there's a non-stale bfcache
        // entry from a previous navigation, prefer that over making a new
        // request.
        if (fetchStrategy === FetchStrategy.Full) {
          const fulfilled = attemptToUpgradeSegmentFromBFCache(now, tree)
          if (fulfilled !== null) {
            break
          }
        }
        spawnedSegment = pingFullSegmentRevalidation(now, tree, fetchStrategy)
      }
      break
    }
    case EntryStatus.Pending:
    case EntryStatus.Rejected: {
      // There's either another prefetch currently in progress, or the previous
      // attempt failed. If the new strategy can provide more content, fetch it again.
      if (
        canNewFetchStrategyProvideMoreContent(
          segment.fetchStrategy,
          fetchStrategy
        )
      ) {
        spawnedSegment = pingFullSegmentRevalidation(now, tree, fetchStrategy)
      }
      break
    }
    default:
      segment satisfies never
  }
  const requestTreeChildren: Record<string, FlightRouterState> = {}
  if (tree.slots !== null) {
    for (const parallelRouteKey in tree.slots) {
      const childTree = tree.slots[parallelRouteKey]
      requestTreeChildren[parallelRouteKey] =
        pingRouteTreeAndIncludeDynamicData(
          now,
          task,
          route,
          childTree,
          isInsideRefetchingParent || spawnedSegment !== null,
          spawnedEntries,
          fetchStrategy
        )
    }
  }

  if (spawnedSegment !== null) {
    // Add the pending entry to the result map.
    spawnedEntries.set(tree.requestKey, spawnedSegment)
  }

  // Don't bother to add a refetch marker if one is already present in a parent.
  const refetchMarker =
    !isInsideRefetchingParent && spawnedSegment !== null ? 'refetch' : null

  const requestTree: FlightRouterState = [
    tree.segment,
    requestTreeChildren,
    null,
    refetchMarker,
  ]
  return requestTree
}

function pingRuntimePrefetches(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree,
  spawnedRuntimePrefetches: Set<SegmentRequestKey>,
  spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry>,
  fetchStrategy: FetchStrategy.PPRRuntime | FetchStrategy.RuntimeShell
): FlightRouterState {
  // Construct a request tree (FlightRouterState) for a runtime prefetch. If
  // a segment is part of the runtime prefetch, the tree is constructed by
  // diffing against what's already in the prefetch cache. Otherwise, we send
  // a regular FlightRouterState with no special markers.
  //
  // See pingRouteTreeAndIncludeDynamicData for details.
  if (spawnedRuntimePrefetches.has(tree.requestKey)) {
    // This segment needs a runtime prefetch.
    return pingRouteTreeAndIncludeDynamicData(
      now,
      task,
      route,
      tree,
      false,
      spawnedEntries,
      fetchStrategy
    )
  }
  let requestTreeChildren: Record<string, FlightRouterState> = {}
  const slots = tree.slots
  if (slots !== null) {
    for (const parallelRouteKey in slots) {
      const childTree = slots[parallelRouteKey]
      requestTreeChildren[parallelRouteKey] = pingRuntimePrefetches(
        now,
        task,
        route,
        childTree,
        spawnedRuntimePrefetches,
        spawnedEntries,
        fetchStrategy
      )
    }
  }

  // This segment is not part of the runtime prefetch. Clone the base tree.
  const requestTree: FlightRouterState = [
    tree.segment,
    requestTreeChildren,
    null,
    null,
  ]
  return requestTree
}

/**
 * Walk a SegmentBundle, apply status-based logic to each entry, and if any
 * entries need data, spawn a single fetch request for the whole bundle.
 */
function pingSegmentBundle(
  now: number,
  route: FulfilledRouteCacheEntry,
  routeKey: RouteCacheKey,
  tree: RouteTree,
  segments: SegmentBundle
): void {
  let segmentCount = 0
  let needsFetch = false
  let node: SegmentBundle | null = segments
  while (node !== null) {
    segmentCount++
    const nodeEntry = node.entry
    const nodeTree = node.tree
    if (nodeEntry === null || nodeTree === null) {
      node = node.parent
      continue
    }
    switch (nodeEntry.status) {
      case EntryStatus.Empty:
        upgradeToPendingSegment(nodeEntry, FetchStrategy.PPR)
        needsFetch = true
        break
      case EntryStatus.Pending:
        if (
          canNewFetchStrategyProvideMoreContent(
            nodeEntry.fetchStrategy,
            FetchStrategy.PPR
          )
        ) {
          const revalidatingEntry = readOrCreateRevalidatingSegmentEntry(
            now,
            FetchStrategy.PPR,
            nodeTree
          )
          if (revalidatingEntry.status === EntryStatus.Empty) {
            upgradeToPendingSegment(revalidatingEntry, FetchStrategy.PPR)
            node.entry = revalidatingEntry
            needsFetch = true
          } else {
            node.entry = null
          }
        } else {
          node.entry = null
        }
        break
      case EntryStatus.Rejected:
        if (
          canNewFetchStrategyProvideMoreContent(
            nodeEntry.fetchStrategy,
            FetchStrategy.PPR
          )
        ) {
          const revalidatingEntry = readOrCreateRevalidatingSegmentEntry(
            now,
            FetchStrategy.PPR,
            nodeTree
          )
          if (revalidatingEntry.status === EntryStatus.Empty) {
            upgradeToPendingSegment(revalidatingEntry, FetchStrategy.PPR)
            node.entry = revalidatingEntry
            needsFetch = true
          } else {
            node.entry = null
          }
        } else {
          node.entry = null
        }
        break
      case EntryStatus.Fulfilled:
        // For shell entries (less specific than PPR), upgrade during the
        // Speculative phase itself — no background deferral, since the
        // whole point of the Speculative phase is to bring the cache up
        // to the per-link-concrete tier. `isPartial` ensures a complete
        // entry isn't re-fetched.
        if (
          nodeEntry.isPartial &&
          canNewFetchStrategyProvideMoreContent(
            nodeEntry.fetchStrategy,
            FetchStrategy.PPR
          )
        ) {
          const revalidatingEntry = readOrCreateRevalidatingSegmentEntry(
            now,
            FetchStrategy.PPR,
            nodeTree
          )
          if (revalidatingEntry.status === EntryStatus.Empty) {
            upgradeToPendingSegment(revalidatingEntry, FetchStrategy.PPR)
            node.entry = revalidatingEntry
            needsFetch = true
          } else {
            node.entry = null
          }
        } else {
          node.entry = null
        }
        break
      default:
        nodeEntry satisfies never
    }
    node = node.parent
  }
  if (!needsFetch) {
    return
  }
  spawnPrefetchSubtask(
    fetchSegmentsOnCacheMiss(route, routeKey, tree, segments, segmentCount)
  )
}

/**
 * During the tree walk, decide whether this segment should be added to the
 * in-progress bundle (if it has InlinedIntoChild) or finalize the bundle
 * and trigger a fetch (if it doesn't). Returns the updated bundle to pass
 * to children, or null if a fetch was triggered.
 */
function accumulateSegmentBundle(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree,
  parentBundle: SegmentBundle | null
): SegmentBundle | null {
  // Static prefetching is disabled for this segment (runtime prefetch or
  // instant = false). It participates in the bundle chain with null
  // tree/entry — no cache entry is created, and the server emits null for
  // this slot. This check is intentionally NOT gated by the prefetch
  // inlining feature flag: we never statically prefetch segments that are
  // runtime-prefetched or unprefetchable, regardless of bundling.
  if (tree.prefetchHints & StaticPrefetchDisabled) {
    return {
      tree: null,
      entry: null,
      parent: parentBundle,
    }
  }

  if (task.phase === PrefetchPhase.Shell) {
    // The static-bundle path is for per-segment static (PPR) prefetches.
    // Shell phase issues a single combined RuntimeShell request via
    // pingRoute's runtime gate block — it neither needs nor wants the
    // static bundle entries (which would be Pending PPR at concrete
    // keypaths, blocking the RuntimeShell request and missing the shell
    // vary-path placement we need for Fallback reuse). Skip entirely.
    return null
  }
  const segment = readOrCreateSegmentCacheEntry(now, task.fetchStrategy, tree)

  if (
    process.env.__NEXT_PREFETCH_INLINING &&
    tree.prefetchHints & PrefetchHint.InlinedIntoChild
  ) {
    return {
      tree,
      entry: segment,
      parent: parentBundle,
    }
  }

  // Not bundled. Build a single-node bundle and ping it. If this page
  // accepts the head (HeadInlinedIntoSelf), prepend the head's cache entry
  // to the bundle.
  let effectiveParent: SegmentBundle | null = parentBundle
  if (
    process.env.__NEXT_PREFETCH_INLINING &&
    tree.prefetchHints & PrefetchHint.HeadInlinedIntoSelf
  ) {
    effectiveParent = {
      tree: route.metadata,
      entry: readOrCreateSegmentCacheEntry(
        now,
        FetchStrategy.PPR,
        route.metadata
      ),
      parent: parentBundle,
    }
  }

  const segments: SegmentBundle = {
    tree,
    entry: segment,
    parent: effectiveParent,
  }

  pingSegmentBundle(now, route, task.key, tree, segments)
  return null
}

function finishStaticBundleOnRuntimeBailout(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree,
  parentBundle: SegmentBundle
): void {
  if (task.phase === PrefetchPhase.Shell) {
    // Same reason as the gate in accumulateSegmentBundle: no static-bundle
    // work during Shell phase. (Should already be unreachable since
    // accumulateSegmentBundle returns null during Shell, leaving every
    // parentBundle null at the runtime-bailout call site — gating here
    // as defense in depth.)
    return
  }
  const bundle = accumulateSegmentBundle(now, task, route, tree, parentBundle)
  if (bundle === null) {
    return
  }
  if (tree.slots !== null) {
    for (const parallelRouteKey in tree.slots) {
      const childTree = tree.slots[parallelRouteKey]
      if (childTree.prefetchHints & PrefetchHint.ParentInlinedIntoSelf) {
        finishStaticBundleOnRuntimeBailout(now, task, route, childTree, bundle)
        return
      }
    }
  }
}

function pingFullSegmentRevalidation(
  now: number,
  tree: RouteTree,
  fetchStrategy:
    | FetchStrategy.Full
    | FetchStrategy.PPRRuntime
    | FetchStrategy.RuntimeShell
): PendingSegmentCacheEntry | null {
  const revalidatingSegment = readOrCreateRevalidatingSegmentEntry(
    now,
    fetchStrategy,
    tree
  )
  if (revalidatingSegment.status === EntryStatus.Empty) {
    // During a Full/PPRRuntime prefetch, a single dynamic request is made for all the
    // segments that we need. So we don't initiate a request here directly. By
    // returning a pending entry from this function, it signals to the caller
    // that this segment should be included in the request that's sent to
    // the server.
    const pendingSegment = upgradeToPendingSegment(
      revalidatingSegment,
      fetchStrategy
    )
    // The upsert is handled by fulfillEntrySpawnedByRuntimePrefetch
    // when the dynamic prefetch response is written into the cache.
    return pendingSegment
  } else {
    // There's already a revalidation in progress.
    const nonEmptyRevalidatingSegment = revalidatingSegment
    if (
      canNewFetchStrategyProvideMoreContent(
        nonEmptyRevalidatingSegment.fetchStrategy,
        fetchStrategy
      )
    ) {
      // The existing revalidation was fetched using a less specific strategy.
      // Reset it and start a new revalidation.
      const emptySegment = overwriteRevalidatingSegmentCacheEntry(
        now,
        fetchStrategy,
        tree
      )
      const pendingSegment = upgradeToPendingSegment(
        emptySegment,
        fetchStrategy
      )
      // The upsert is handled by fulfillEntrySpawnedByRuntimePrefetch
      // when the dynamic prefetch response is written into the cache.
      return pendingSegment
    }
    switch (nonEmptyRevalidatingSegment.status) {
      case EntryStatus.Pending:
        // There's already an in-progress prefetch that includes this segment.
        return null
      case EntryStatus.Fulfilled:
      case EntryStatus.Rejected:
        // A previous revalidation attempt finished, but we chose not to replace
        // the existing entry in the cache. Don't try again until or unless the
        // revalidation entry expires.
        return null
      default:
        nonEmptyRevalidatingSegment satisfies never
        return null
    }
  }
}

function doesCurrentSegmentMatchCachedSegment(
  route: FulfilledRouteCacheEntry,
  currentSegment: Segment,
  cachedSegment: Segment
): boolean {
  if (cachedSegment === PAGE_SEGMENT_KEY) {
    // In the FlightRouterState stored by the router, the page segment has the
    // rendered search params appended to the name of the segment. In the
    // prefetch cache, however, this is stored separately. So, when comparing
    // the router's current FlightRouterState to the cached FlightRouterState,
    // we need to make sure we compare both parts of the segment.
    // TODO: This is not modeled clearly. We use the same type,
    // FlightRouterState, for both the CacheNode tree _and_ the prefetch cache
    // _and_ the server response format, when conceptually those are three
    // different things and treated in different ways. We should encode more of
    // this information into the type design so mistakes are less likely.
    return (
      currentSegment ===
      addSearchParamsIfPageSegment(
        PAGE_SEGMENT_KEY,
        Object.fromEntries(new URLSearchParams(route.renderedSearch))
      )
    )
  }
  // Non-page segments are compared using the same function as the server
  return matchSegment(cachedSegment, currentSegment)
}

/**
 * Decides whether to skip the speculative prefetch of a subtree. Usually we
 * only perform a speculative prefetch if the Link's prefetch prop is set to
 * true. However, we also will do a speculative prefetch if the prefetching
 * mode of the segment is set to "unstable_eager".
 */
function subtreeHasSpeculativePrefetch(
  task: PrefetchTask,
  prefetchHints: number
): boolean {
  if (!process.env.__NEXT_APP_SHELLS) {
    // When App Shells is disabled, all prefetches implicitly include the
    // speculative (non-shell) part of the target.
    return true
  }

  return (
    // Check if this is a "full" prefetch (<Link prefetch={true}>).
    task.fetchStrategy === FetchStrategy.Full ||
    // Check if something in this subtree is configured to be eagerly
    // prefetched at the route level.
    (prefetchHints & PrefetchHint.SubtreeHasEagerPrefetch) !== 0
  )
}

// -----------------------------------------------------------------------------
// The remainder of the module is a MinHeap implementation. Try not to put any
// logic below here unless it's related to the heap algorithm. We can extract
// this to a separate module if/when we need multiple kinds of heaps.
// -----------------------------------------------------------------------------

function compareQueuePriority(a: PrefetchTask, b: PrefetchTask) {
  // Since the queue is a MinHeap, this should return a positive number if b is
  // higher priority than a, and a negative number if a is higher priority
  // than b.

  // `priority` is an integer, where higher numbers are higher priority.
  const priorityDiff = b.priority - a.priority
  if (priorityDiff !== 0) {
    return priorityDiff
  }

  // If the priority is the same, check which phase the prefetch is in — is it
  // prefetching the route tree, or the segments? Route trees are prioritized.
  const phaseDiff = b.phase - a.phase
  if (phaseDiff !== 0) {
    return phaseDiff
  }

  // Finally, check the insertion order. `sortId` is an incrementing counter
  // assigned to prefetches. We want to process the newest prefetches first.
  return b.sortId - a.sortId
}

function heapPush(heap: Array<PrefetchTask>, node: PrefetchTask): void {
  const index = heap.length
  heap.push(node)
  node._heapIndex = index
  heapSiftUp(heap, node, index)
}

function heapPeek(heap: Array<PrefetchTask>): PrefetchTask | null {
  return heap.length === 0 ? null : heap[0]
}

function heapPop(heap: Array<PrefetchTask>): PrefetchTask | null {
  if (heap.length === 0) {
    return null
  }
  const first = heap[0]
  first._heapIndex = -1
  const last = heap.pop() as PrefetchTask
  if (last !== first) {
    heap[0] = last
    last._heapIndex = 0
    heapSiftDown(heap, last, 0)
  }
  return first
}

function heapDelete(heap: Array<PrefetchTask>, node: PrefetchTask): void {
  const index = node._heapIndex
  if (index !== -1) {
    node._heapIndex = -1
    if (heap.length !== 0) {
      const last = heap.pop() as PrefetchTask
      if (last !== node) {
        heap[index] = last
        last._heapIndex = index
        heapSiftDown(heap, last, index)
      }
    }
  }
}

function heapResift(heap: Array<PrefetchTask>, node: PrefetchTask): void {
  const index = node._heapIndex
  if (index !== -1) {
    if (index === 0) {
      heapSiftDown(heap, node, 0)
    } else {
      const parentIndex = (index - 1) >>> 1
      const parent = heap[parentIndex]
      if (compareQueuePriority(parent, node) > 0) {
        // The parent is larger. Sift up.
        heapSiftUp(heap, node, index)
      } else {
        // The parent is smaller (or equal). Sift down.
        heapSiftDown(heap, node, index)
      }
    }
  }
}

function heapSiftUp(
  heap: Array<PrefetchTask>,
  node: PrefetchTask,
  i: number
): void {
  let index = i
  while (index > 0) {
    const parentIndex = (index - 1) >>> 1
    const parent = heap[parentIndex]
    if (compareQueuePriority(parent, node) > 0) {
      // The parent is larger. Swap positions.
      heap[parentIndex] = node
      node._heapIndex = parentIndex
      heap[index] = parent
      parent._heapIndex = index

      index = parentIndex
    } else {
      // The parent is smaller. Exit.
      return
    }
  }
}

function heapSiftDown(
  heap: Array<PrefetchTask>,
  node: PrefetchTask,
  i: number
): void {
  let index = i
  const length = heap.length
  const halfLength = length >>> 1
  while (index < halfLength) {
    const leftIndex = (index + 1) * 2 - 1
    const left = heap[leftIndex]
    const rightIndex = leftIndex + 1
    const right = heap[rightIndex]

    // If the left or right node is smaller, swap with the smaller of those.
    if (compareQueuePriority(left, node) < 0) {
      if (rightIndex < length && compareQueuePriority(right, left) < 0) {
        heap[index] = right
        right._heapIndex = index
        heap[rightIndex] = node
        node._heapIndex = rightIndex

        index = rightIndex
      } else {
        heap[index] = left
        left._heapIndex = index
        heap[leftIndex] = node
        node._heapIndex = leftIndex

        index = leftIndex
      }
    } else if (rightIndex < length && compareQueuePriority(right, node) < 0) {
      heap[index] = right
      right._heapIndex = index
      heap[rightIndex] = node
      node._heapIndex = rightIndex

      index = rightIndex
    } else {
      // Neither child is smaller. Exit.
      return
    }
  }
}
