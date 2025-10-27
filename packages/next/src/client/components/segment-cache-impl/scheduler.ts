import type {
  FlightRouterState,
  Segment as FlightRouterStateSegment,
  Segment,
} from '../../../shared/lib/app-router-types'
import { HasLoadingBoundary } from '../../../shared/lib/app-router-types'
import { matchSegment } from '../match-segments'
import {
  readOrCreateRouteCacheEntry,
  readOrCreateSegmentCacheEntry,
  fetchRouteOnCacheMiss,
  fetchSegmentOnCacheMiss,
  EntryStatus,
  type FulfilledRouteCacheEntry,
  type RouteCacheEntry,
  type SegmentCacheEntry,
  type RouteTree,
  fetchSegmentPrefetchesUsingDynamicRequest,
  type PendingSegmentCacheEntry,
  convertRouteTreeToFlightRouterState,
  readOrCreateRevalidatingSegmentEntry,
  upsertSegmentEntry,
  type FulfilledSegmentCacheEntry,
  upgradeToPendingSegment,
  waitForSegmentCacheEntry,
  resetRevalidatingSegmentEntry,
  getSegmentKeypath,
  canNewFetchStrategyProvideMoreContent,
} from './cache'
import type { RouteCacheKey } from './cache-key'
import { createCacheKey } from './cache-key'
import {
  FetchStrategy,
  type PrefetchTaskFetchStrategy,
  getCurrentCacheVersion,
  PrefetchPriority,
} from '../segment-cache'
import {
  addSearchParamsIfPageSegment,
  PAGE_SEGMENT_KEY,
} from '../../../shared/lib/segment'
import type { SegmentCacheKey } from '../../../shared/lib/segment-cache/segment-value-encoding'

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
   * The cache version at the time the task was initiated. This is used to
   * determine if the cache was invalidated since the task was initiated.
   */
  cacheVersion: number

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
  spawnedRuntimePrefetches: Set<SegmentCacheKey> | null

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
 * Prefetch tasks are processed in two phases: first the route tree is fetched,
 * then the segments. We use this to priortize tasks that have not yet fetched
 * the route tree.
 */
const enum PrefetchPhase {
  RouteTree = 1,
  Segments = 0,
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
    ensureWorkIsScheduled()
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
 */
export function schedulePrefetchTask(
  key: RouteCacheKey,
  treeAtTimeOfPrefetch: FlightRouterState,
  fetchStrategy: PrefetchTaskFetchStrategy,
  priority: PrefetchPriority,
  onInvalidate: null | (() => void)
): PrefetchTask {
  // Spawn a new prefetch task
  const task: PrefetchTask = {
    key,
    treeAtTimeOfPrefetch,
    cacheVersion: getCurrentCacheVersion(),
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

  trackMostRecentlyHoveredLink(task)

  heapPush(taskHeap, task)

  // Schedule an async task to process the queue.
  //
  // The main reason we process the queue in an async task is for batching.
  // It's common for a single JS task/event to trigger multiple prefetches.
  // By deferring to a microtask, we only process the queue once per JS task.
  // If they have different priorities, it also ensures they are processed in
  // the optimal order.
  ensureWorkIsScheduled()

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
  ensureWorkIsScheduled()
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
  const currentCacheVersion = getCurrentCacheVersion()
  return (
    task.cacheVersion !== currentCacheVersion ||
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

function ensureWorkIsScheduled() {
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
  ensureWorkIsScheduled()
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
  ensureWorkIsScheduled()
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
    task.cacheVersion = getCurrentCacheVersion()

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
          // Finished prefetching the route tree. Proceed to prefetching
          // the segments.
          task.phase = PrefetchPhase.Segments
          heapResift(taskHeap, task)
        } else if (hasBackgroundWork) {
          // The task spawned additional background work. Reschedule the task
          // at background priority.
          task.priority = PrefetchPriority.Background
          heapResift(taskHeap, task)
        } else {
          // The prefetch is complete. Continue to the next task.
          heapPop(taskHeap)
        }
        task = heapPeek(taskHeap)
        continue
      default:
        exitStatus satisfies never
    }
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
    const url = new URL(key.href)
    url.search = ''
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
            fetchRouteOnCacheMiss(routeWithoutSearch, task, keyWithoutSearch)
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
      spawnPrefetchSubtask(fetchRouteOnCacheMiss(route, task, task.key))

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
      if (task.phase !== PrefetchPhase.Segments) {
        // Do not prefetch segment data until we've entered the segment phase.
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
      const fetchStrategy =
        task.fetchStrategy === FetchStrategy.PPR
          ? route.isPPREnabled
            ? FetchStrategy.PPR
            : FetchStrategy.LoadingBoundary
          : task.fetchStrategy

      switch (fetchStrategy) {
        case FetchStrategy.PPR: {
          // For Cache Components pages, each segment may be prefetched
          // statically or using a runtime request, based on various
          // configurations and heuristics. We'll do this in two passes: first
          // traverse the tree and perform all the static prefetches.
          //
          // Then, if there are any segments that need a runtime request,
          // do another pass to perform a runtime prefetch.
          const exitStatus = pingSharedPartOfCacheComponentsTree(
            now,
            task,
            route,
            task.treeAtTimeOfPrefetch,
            tree
          )
          if (exitStatus === PrefetchTaskExitStatus.InProgress) {
            // Child yielded without finishing.
            return PrefetchTaskExitStatus.InProgress
          }
          const spawnedRuntimePrefetches = task.spawnedRuntimePrefetches
          if (spawnedRuntimePrefetches !== null) {
            // During the first pass, we discovered segments that require a
            // runtime prefetch. Do a second pass to construct a request tree.
            const spawnedEntries = new Map<
              SegmentCacheKey,
              PendingSegmentCacheEntry
            >()
            const requestTree = pingRuntimePrefetches(
              now,
              task,
              route,
              tree,
              spawnedRuntimePrefetches,
              spawnedEntries
            )
            let needsDynamicRequest = spawnedEntries.size > 0
            if (needsDynamicRequest) {
              // Perform a dynamic prefetch request and populate the cache with
              // the result.
              spawnPrefetchSubtask(
                fetchSegmentPrefetchesUsingDynamicRequest(
                  task,
                  route,
                  FetchStrategy.PPRRuntime,
                  requestTree,
                  spawnedEntries
                )
              )
            }
          }
          return PrefetchTaskExitStatus.Done
        }
        case FetchStrategy.Full:
        case FetchStrategy.PPRRuntime:
        case FetchStrategy.LoadingBoundary: {
          // Prefetch multiple segments using a single dynamic request.
          // TODO: We can consolidate this branch with previous one by modeling
          // it as if the first segment in the new tree has runtime prefetching
          // enabled. Will do this as a follow-up refactor. Might want to remove
          // the special metatdata case below first. In the meantime, it's not
          // really that much duplication, just would be nice to remove one of
          // these codepaths.
          const spawnedEntries = new Map<
            SegmentCacheKey,
            PendingSegmentCacheEntry
          >()
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

          if (
            !needsDynamicRequest &&
            route.isHeadPartial &&
            route.TODO_metadataStatus === EntryStatus.Empty
          ) {
            // All the segment data is already cached, however, we need to issue
            // a request anyway so we can prefetch the head. Update the status
            // field to prevent additional requests from being spawned while
            // this one is in progress.
            // TODO: This is a temporary, targeted solution to fix a regression
            // we found. It exists to prevent the scheduler from sending a
            // redundant request if there's already one in progress.
            // Essentially, it will attempt once at most, then give up until the
            // route entry expires or is evicted by other means. But because
            // this doesn't have its own stale time separate from the route
            // itself, there will be edge cases where the metadata fails to be
            // fully prefetched. Consider caching metadata using a separate
            // entry type so we can model this more cleanly. The circumstances
            // that lead to this branch running in the first place are
            // relatively rare, so it's not critical.
            route.TODO_metadataStatus = EntryStatus.Fulfilled
            needsDynamicRequest = true
            // This instructs the server to only send the metadata.
            dynamicRequestTree[3] = 'metadata-only'
            // We can null out the children to reduce the request size, since
            // they won't be needed.
            dynamicRequestTree[1] = {}
          }

          if (needsDynamicRequest) {
            // Perform a dynamic prefetch request and populate the cache with
            // the result
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

function pingSharedPartOfCacheComponentsTree(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  oldTree: FlightRouterState,
  newTree: RouteTree
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

  // Prefetch this segment's static data.
  const segment = readOrCreateSegmentCacheEntry(
    now,
    task.fetchStrategy,
    route,
    newTree.cacheKey
  )
  pingStaticSegmentData(now, task, route, segment, task.key, newTree)

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
          newTreeChild
        )
      } else {
        // We've entered the "new" part of the tree. Switch
        // traversal functions.
        childExitStatus = pingNewPartOfCacheComponentsTree(
          now,
          task,
          route,
          newTreeChild
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
  tree: RouteTree
): PrefetchTaskExitStatus.InProgress | PrefetchTaskExitStatus.Done {
  // We're now prefetching in the "new" part of the tree, the part that doesn't
  // exist on the current page. (In other words, we're deeper than the
  // shared layouts.) Segments in here default to being prefetched statically.
  // However, if the server instructs us to, we may switch to a runtime
  // prefetch instead. Traverse the tree and check at each segment.
  if (tree.hasRuntimePrefetch) {
    // This route has a runtime prefetch response. Since we're below the shared
    // layout, everything from this point should be prefetched using a single,
    // combined runtime request, rather than using per-segment static requests.
    // This is true even if some of the child segments are known to be fully
    // static — once we've decided to perform a runtime prefetch, we might as
    // well respond with the static segments in the same roundtrip. (That's how
    // regular navigations work, too.) We'll still skip over segments that are
    // already cached, though.
    //
    // It's the server's responsibility to set a reasonable value of
    // `hasRuntimePrefetch`. Currently it's user-defined, but eventually, the
    // server may send a value of `false` even if the user opts in, if it
    // determines during build that the route is always fully static. There are
    // more optimizations we can do once we implement fallback param
    // tracking, too.
    //
    // Use the task object to collect the segments that need a runtime prefetch.
    // This will signal to the outer task queue that a second traversal is
    // required to construct a request tree.
    if (task.spawnedRuntimePrefetches === null) {
      task.spawnedRuntimePrefetches = new Set([tree.cacheKey])
    } else {
      task.spawnedRuntimePrefetches.add(tree.cacheKey)
    }
    // Then exit the traversal without prefetching anything further.
    return PrefetchTaskExitStatus.Done
  }

  // This segment should not be runtime prefetched. Prefetch its static data.
  const segment = readOrCreateSegmentCacheEntry(
    now,
    task.fetchStrategy,
    route,
    tree.cacheKey
  )
  pingStaticSegmentData(now, task, route, segment, task.key, tree)
  if (tree.slots !== null) {
    if (!hasNetworkBandwidth(task)) {
      // Stop prefetching segments until there's more bandwidth.
      return PrefetchTaskExitStatus.InProgress
    }
    // Recursively ping the children.
    for (const parallelRouteKey in tree.slots) {
      const childTree = tree.slots[parallelRouteKey]
      const childExitStatus = pingNewPartOfCacheComponentsTree(
        now,
        task,
        route,
        childTree
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
  spawnedEntries: Map<string, PendingSegmentCacheEntry>,
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
              newTreeChild.hasLoadingBoundary !==
              HasLoadingBoundary.SubtreeHasNoLoadingBoundary
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
    newTree.isRootLayout,
  ]
  return requestTree
}

function pingPPRDisabledRouteTreeUpToLoadingBoundary(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree,
  refetchMarkerContext: 'refetch' | 'inside-shared-layout' | null,
  spawnedEntries: Map<string, PendingSegmentCacheEntry>
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

  const segment = readOrCreateSegmentCacheEntry(
    now,
    task.fetchStrategy,
    route,
    tree.cacheKey
  )
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
        tree.cacheKey,
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
        tree.hasLoadingBoundary === HasLoadingBoundary.SegmentHasLoadingBoundary
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
    tree.isRootLayout,
  ]
  return requestTree
}

function pingRouteTreeAndIncludeDynamicData(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree,
  isInsideRefetchingParent: boolean,
  spawnedEntries: Map<string, PendingSegmentCacheEntry>,
  fetchStrategy: FetchStrategy.Full | FetchStrategy.PPRRuntime
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
    route,
    tree.cacheKey
  )

  let spawnedSegment: PendingSegmentCacheEntry | null = null

  switch (segment.status) {
    case EntryStatus.Empty: {
      // This segment is not cached. Include it in the request.
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
        // The cached segment contains dynamic holes, and was prefetched using a less specific strategy than the current one.
        // This means we're in one of these cases:
        //   - we have a static prefetch, and we're doing a runtime prefetch
        //   - we have a static or runtime prefetch, and we're doing a Full prefetch (or a navigation).
        // In either case, we need to include it in the request to get a more specific (or full) version.
        spawnedSegment = pingFullSegmentRevalidation(
          now,
          route,
          segment,
          tree,
          fetchStrategy
        )
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
        spawnedSegment = pingFullSegmentRevalidation(
          now,
          route,
          segment,
          tree,
          fetchStrategy
        )
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
    spawnedEntries.set(tree.cacheKey, spawnedSegment)
  }

  // Don't bother to add a refetch marker if one is already present in a parent.
  const refetchMarker =
    !isInsideRefetchingParent && spawnedSegment !== null ? 'refetch' : null

  const requestTree: FlightRouterState = [
    tree.segment,
    requestTreeChildren,
    null,
    refetchMarker,
    tree.isRootLayout,
  ]
  return requestTree
}

function pingRuntimePrefetches(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree,
  spawnedRuntimePrefetches: Set<SegmentCacheKey>,
  spawnedEntries: Map<string, PendingSegmentCacheEntry>
): FlightRouterState {
  // Construct a request tree (FlightRouterState) for a runtime prefetch. If
  // a segment is part of the runtime prefetch, the tree is constructed by
  // diffing against what's already in the prefetch cache. Otherwise, we send
  // a regular FlightRouterState with no special markers.
  //
  // See pingRouteTreeAndIncludeDynamicData for details.
  if (spawnedRuntimePrefetches.has(tree.cacheKey)) {
    // This segment needs a runtime prefetch.
    return pingRouteTreeAndIncludeDynamicData(
      now,
      task,
      route,
      tree,
      false,
      spawnedEntries,
      FetchStrategy.PPRRuntime
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
        spawnedEntries
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

function pingStaticSegmentData(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  segment: SegmentCacheEntry,
  routeKey: RouteCacheKey,
  tree: RouteTree
): void {
  switch (segment.status) {
    case EntryStatus.Empty:
      // Upgrade to Pending so we know there's already a request in progress
      spawnPrefetchSubtask(
        fetchSegmentOnCacheMiss(
          route,
          upgradeToPendingSegment(segment, FetchStrategy.PPR),
          routeKey,
          tree
        )
      )
      break
    case EntryStatus.Pending: {
      // There's already a request in progress. Depending on what kind of
      // request it is, we may want to revalidate it.
      switch (segment.fetchStrategy) {
        case FetchStrategy.PPR:
        case FetchStrategy.PPRRuntime:
        case FetchStrategy.Full:
          // There's already a request in progress. Don't do anything.
          break
        case FetchStrategy.LoadingBoundary:
          // There's a pending request, but because it's using the old
          // prefetching strategy, we can't be sure if it will be fulfilled by
          // the response — it might be inside the loading boundary. Perform
          // a revalidation, but because it's speculative, wait to do it at
          // background priority.
          if (background(task)) {
            // TODO: Instead of speculatively revalidating, consider including
            // `hasLoading` in the route tree prefetch response.
            pingPPRSegmentRevalidation(
              now,
              task,
              segment,
              route,
              routeKey,
              tree
            )
          }
          break
        default:
          segment.fetchStrategy satisfies never
      }
      break
    }
    case EntryStatus.Rejected: {
      // The existing entry in the cache was rejected. Depending on how it
      // was originally fetched, we may or may not want to revalidate it.
      switch (segment.fetchStrategy) {
        case FetchStrategy.PPR:
        case FetchStrategy.PPRRuntime:
        case FetchStrategy.Full:
          // The previous attempt to fetch this entry failed. Don't attempt to
          // fetch it again until the entry expires.
          break
        case FetchStrategy.LoadingBoundary:
          // There's a rejected entry, but it was fetched using the loading
          // boundary strategy. So the reason it wasn't returned by the server
          // might just be because it was inside a loading boundary. Or because
          // there was a dynamic rewrite. Revalidate it using the per-
          // segment strategy.
          //
          // Because a rejected segment will definitely prevent the segment (and
          // all of its children) from rendering, we perform this revalidation
          // immediately instead of deferring it to a background task.
          pingPPRSegmentRevalidation(now, task, segment, route, routeKey, tree)
          break
        default:
          segment.fetchStrategy satisfies never
      }
      break
    }
    case EntryStatus.Fulfilled:
      // Segment is already cached. There's nothing left to prefetch.
      break
    default:
      segment satisfies never
  }

  // Segments do not have dependent tasks, so once the prefetch is initiated,
  // there's nothing else for us to do (except write the server data into the
  // entry, which is handled by `fetchSegmentOnCacheMiss`).
}

function pingPPRSegmentRevalidation(
  now: number,
  task: PrefetchTask,
  currentSegment: SegmentCacheEntry,
  route: FulfilledRouteCacheEntry,
  routeKey: RouteCacheKey,
  tree: RouteTree
): void {
  const revalidatingSegment = readOrCreateRevalidatingSegmentEntry(
    now,
    currentSegment
  )
  switch (revalidatingSegment.status) {
    case EntryStatus.Empty:
      // Spawn a prefetch request and upsert the segment into the cache
      // upon completion.
      upsertSegmentOnCompletion(
        task.fetchStrategy,
        route,
        tree.cacheKey,
        spawnPrefetchSubtask(
          fetchSegmentOnCacheMiss(
            route,
            upgradeToPendingSegment(revalidatingSegment, FetchStrategy.PPR),
            routeKey,
            tree
          )
        )
      )
      break
    case EntryStatus.Pending:
      // There's already a revalidation in progress.
      break
    case EntryStatus.Fulfilled:
    case EntryStatus.Rejected:
      // A previous revalidation attempt finished, but we chose not to replace
      // the existing entry in the cache. Don't try again until or unless the
      // revalidation entry expires.
      break
    default:
      revalidatingSegment satisfies never
  }
}

function pingFullSegmentRevalidation(
  now: number,
  route: FulfilledRouteCacheEntry,
  currentSegment: SegmentCacheEntry,
  tree: RouteTree,
  fetchStrategy: FetchStrategy.Full | FetchStrategy.PPRRuntime
): PendingSegmentCacheEntry | null {
  const revalidatingSegment = readOrCreateRevalidatingSegmentEntry(
    now,
    currentSegment
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
    upsertSegmentOnCompletion(
      fetchStrategy,
      route,
      tree.cacheKey,
      waitForSegmentCacheEntry(pendingSegment)
    )
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
      const emptySegment = resetRevalidatingSegmentEntry(
        nonEmptyRevalidatingSegment
      )
      const pendingSegment = upgradeToPendingSegment(
        emptySegment,
        fetchStrategy
      )
      upsertSegmentOnCompletion(
        fetchStrategy,
        route,
        tree.cacheKey,
        waitForSegmentCacheEntry(pendingSegment)
      )
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

const noop = () => {}

function upsertSegmentOnCompletion(
  fetchStrategy: FetchStrategy,
  route: FulfilledRouteCacheEntry,
  cacheKey: SegmentCacheKey,
  promise: Promise<FulfilledSegmentCacheEntry | null>
) {
  // Wait for a segment to finish loading, then upsert it into the cache
  promise.then((fulfilled) => {
    if (fulfilled !== null) {
      // Received new data. Attempt to replace the existing entry in the cache.
      const keypath = getSegmentKeypath(fetchStrategy, route, cacheKey)
      upsertSegmentEntry(Date.now(), keypath, fulfilled)
    }
  }, noop)
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
