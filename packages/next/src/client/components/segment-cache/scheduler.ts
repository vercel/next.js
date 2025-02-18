import type {
  FlightRouterState,
  Segment as FlightRouterStateSegment,
} from '../../../server/app-render/types'
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
  FetchStrategy,
  readOrCreateRevalidatingSegmentEntry,
  upsertSegmentEntry,
  type FulfilledSegmentCacheEntry,
  upgradeToPendingSegment,
  waitForSegmentCacheEntry,
  resetRevalidatingSegmentEntry,
} from './cache'
import type { RouteCacheKey } from './cache-key'

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
   * Whether to prefetch dynamic data, in addition to static data. This is
   * used by <Link prefetch={true}>.
   */
  includeDynamicData: boolean

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
   * Temporary state for tracking the currently running task. This is currently
   * used to track whether a task deferred some work to run background at
   * priority, but we might need it for additional state in the future.
   */
  hasBackgroundWork: boolean

  /**
   * True if the prefetch was cancelled.
   */
  isCanceled: boolean

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
 * The priority of the prefetch task. Higher numbers are higher priority.
 */
export const enum PrefetchPriority {
  /**
   * Assigned to any visible link that was hovered/touched at some point. This
   * is not removed on mouse exit, because a link that was momentarily
   * hovered is more likely to to be interacted with than one that was not.
   */
  Intent = 2,
  /**
   * The default priority for prefetch tasks.
   */
  Default = 1,
  /**
   * Assigned to tasks when they spawn non-blocking background work, like
   * revalidating a partially cached entry to see if more data is available.
   */
  Background = 0,
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

// This is intentionally low so that when a navigation happens, the browser's
// internal network queue is not already saturated with prefetch requests.
const MAX_CONCURRENT_PREFETCH_REQUESTS = 3
let inProgressRequests = 0

let sortIdCounter = 0
let didScheduleMicrotask = false

/**
 * Initiates a prefetch task for the given URL. If a prefetch for the same URL
 * is already in progress, this will bump it to the top of the queue.
 *
 * This is not a user-facing function. By the time this is called, the href is
 * expected to be validated and normalized.
 *
 * @param key The RouteCacheKey to prefetch.
 * @param treeAtTimeOfPrefetch The app's current FlightRouterState
 * @param includeDynamicData Whether to prefetch dynamic data, in addition to
 * static data. This is used by <Link prefetch={true}>.
 */
export function schedulePrefetchTask(
  key: RouteCacheKey,
  treeAtTimeOfPrefetch: FlightRouterState,
  includeDynamicData: boolean,
  priority: PrefetchPriority
): PrefetchTask {
  // Spawn a new prefetch task
  const task: PrefetchTask = {
    key,
    treeAtTimeOfPrefetch,
    priority,
    phase: PrefetchPhase.RouteTree,
    hasBackgroundWork: false,
    includeDynamicData,
    sortId: sortIdCounter++,
    isCanceled: false,
    _heapIndex: -1,
  }
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

export function bumpPrefetchTask(
  task: PrefetchTask,
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

  // Assign a new sort ID to move it ahead of all other tasks at the same
  // priority level. (Higher sort IDs are processed first.)
  task.sortId = sortIdCounter++
  task.priority = priority

  if (task._heapIndex !== -1) {
    // The task is already in the queue.
    heapResift(taskHeap, task)
  } else {
    heapPush(taskHeap, task)
  }
  ensureWorkIsScheduled()
}

function ensureWorkIsScheduled() {
  if (didScheduleMicrotask || !hasNetworkBandwidth()) {
    // Either we already scheduled a task to process the queue, or there are
    // too many concurrent requests in progress. In the latter case, the
    // queue will resume processing once more bandwidth is available.
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
 */
function hasNetworkBandwidth(): boolean {
  // TODO: Also check if there's an in-progress navigation. We should never
  // add prefetch requests to the network queue if an actual navigation is
  // taking place, to ensure there's sufficient bandwidth for render-blocking
  // data and resources.
  return inProgressRequests < MAX_CONCURRENT_PREFETCH_REQUESTS
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
  while (task !== null && hasNetworkBandwidth()) {
    const route = readOrCreateRouteCacheEntry(now, task)
    const exitStatus = pingRootRouteTree(now, task, route)

    // The `hasBackgroundWork` field is only valid for a single attempt. Reset
    // it immediately upon exit.
    const hasBackgroundWork = task.hasBackgroundWork
    task.hasBackgroundWork = false

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
      // There's also <Link prefetch={true}> which prefetches both static *and*
      // dynamic data. Similarly, we need to fallback to the old, per-page
      // behavior if PPR is disabled for a route (via the incremental opt-in).
      //
      // Those cases will be handled here.
      spawnPrefetchSubtask(fetchRouteOnCacheMiss(route, task))

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
      if (!hasNetworkBandwidth()) {
        // Stop prefetching segments until there's more bandwidth.
        return PrefetchTaskExitStatus.InProgress
      }
      const tree = route.tree

      // Determine which fetch strategy to use for this prefetch task.
      const fetchStrategy = task.includeDynamicData
        ? FetchStrategy.Full
        : route.isPPREnabled
          ? FetchStrategy.PPR
          : FetchStrategy.LoadingBoundary

      switch (fetchStrategy) {
        case FetchStrategy.PPR:
          // Individually prefetch the static shell for each segment. This is
          // the default prefetching behavior for static routes, or when PPR is
          // enabled. It will not include any dynamic data.
          return pingPPRRouteTree(now, task, route, tree)
        case FetchStrategy.Full:
        case FetchStrategy.LoadingBoundary: {
          // Prefetch multiple segments using a single dynamic request.
          const spawnedEntries = new Map<string, PendingSegmentCacheEntry>()
          const dynamicRequestTree = diffRouteTreeAgainstCurrent(
            now,
            route,
            task.treeAtTimeOfPrefetch,
            tree,
            spawnedEntries,
            fetchStrategy
          )
          const needsDynamicRequest = spawnedEntries.size > 0
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

function pingPPRRouteTree(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree
): PrefetchTaskExitStatus.InProgress | PrefetchTaskExitStatus.Done {
  const segment = readOrCreateSegmentCacheEntry(now, route, tree.key)
  pingPerSegment(now, task, route, segment, task.key, tree.key)
  if (tree.slots !== null) {
    if (!hasNetworkBandwidth()) {
      // Stop prefetching segments until there's more bandwidth.
      return PrefetchTaskExitStatus.InProgress
    }
    // Recursively ping the children.
    for (const parallelRouteKey in tree.slots) {
      const childTree = tree.slots[parallelRouteKey]
      const childExitStatus = pingPPRRouteTree(now, task, route, childTree)
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
  route: FulfilledRouteCacheEntry,
  oldTree: FlightRouterState,
  newTree: RouteTree,
  spawnedEntries: Map<string, PendingSegmentCacheEntry>,
  fetchStrategy: FetchStrategy.Full | FetchStrategy.LoadingBoundary
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
        matchSegment(newTreeChildSegment, oldTreeChildSegment)
      ) {
        // This segment is already part of the current route. Keep traversing.
        const requestTreeChild = diffRouteTreeAgainstCurrent(
          now,
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
            // inside new part of the tree. If there's no loading boundary, the
            // server will never return any data. TODO: When we prefetch the
            // route tree, the server should indicate whether there's a loading
            // boundary so the client doesn't send a second request for no
            // reason.
            const requestTreeChild =
              pingPPRDisabledRouteTreeUpToLoadingBoundary(
                now,
                route,
                newTreeChild,
                null,
                spawnedEntries
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
              route,
              newTreeChild,
              false,
              spawnedEntries
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

  const segment = readOrCreateSegmentCacheEntry(now, route, tree.key)
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
        tree.key,
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
      // TODO: The server should include a `hasLoading` field as part of the
      // route tree prefetch.
      if (segment.loading !== null) {
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
      // better to avoid doing a dynamic prefetch whenever possible.
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
  route: FulfilledRouteCacheEntry,
  tree: RouteTree,
  isInsideRefetchingParent: boolean,
  spawnedEntries: Map<string, PendingSegmentCacheEntry>
): FlightRouterState {
  // The tree we're constructing is the same shape as the tree we're navigating
  // to. But even though this is a "new" tree, some of the individual segments
  // may be cached as a result of other route prefetches.
  //
  // So we need to find the first uncached segment along each path add an
  // explicit "refetch" marker so the server knows where to start rendering.
  // Once the server starts rendering along a path, it keeps rendering the
  // entire subtree.
  const segment = readOrCreateSegmentCacheEntry(now, route, tree.key)

  let spawnedSegment: PendingSegmentCacheEntry | null = null

  switch (segment.status) {
    case EntryStatus.Empty: {
      // This segment is not cached. Include it in the request.
      spawnedSegment = upgradeToPendingSegment(segment, FetchStrategy.Full)
      break
    }
    case EntryStatus.Fulfilled: {
      // The segment is already cached.
      if (segment.isPartial) {
        // The cached segment contians dynamic holes. Since this is a Full
        // prefetch, we need to include it in the request.
        spawnedSegment = pingFullSegmentRevalidation(now, segment, tree.key)
      }
      break
    }
    case EntryStatus.Pending:
    case EntryStatus.Rejected: {
      // There's either another prefetch currently in progress, or the previous
      // attempt failed. If it wasn't a Full prefetch, fetch it again.
      if (segment.fetchStrategy !== FetchStrategy.Full) {
        spawnedSegment = pingFullSegmentRevalidation(now, segment, tree.key)
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
          route,
          childTree,
          isInsideRefetchingParent || spawnedSegment !== null,
          spawnedEntries
        )
    }
  }

  if (spawnedSegment !== null) {
    // Add the pending entry to the result map.
    spawnedEntries.set(tree.key, spawnedSegment)
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

function pingPerSegment(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  segment: SegmentCacheEntry,
  routeKey: RouteCacheKey,
  segmentKey: string
): void {
  switch (segment.status) {
    case EntryStatus.Empty:
      // Upgrade to Pending so we know there's already a request in progress
      spawnPrefetchSubtask(
        fetchSegmentOnCacheMiss(
          route,
          upgradeToPendingSegment(segment, FetchStrategy.PPR),
          routeKey,
          segmentKey
        )
      )
      break
    case EntryStatus.Pending: {
      // There's already a request in progress. Depending on what kind of
      // request it is, we may want to revalidate it.
      switch (segment.fetchStrategy) {
        case FetchStrategy.PPR:
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
              segment,
              route,
              routeKey,
              segmentKey
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
          pingPPRSegmentRevalidation(now, segment, route, routeKey, segmentKey)
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
  currentSegment: SegmentCacheEntry,
  route: FulfilledRouteCacheEntry,
  routeKey: RouteCacheKey,
  segmentKey: string
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
        segmentKey,
        spawnPrefetchSubtask(
          fetchSegmentOnCacheMiss(
            route,
            upgradeToPendingSegment(revalidatingSegment, FetchStrategy.PPR),
            routeKey,
            segmentKey
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
  currentSegment: SegmentCacheEntry,
  segmentKey: string
): PendingSegmentCacheEntry | null {
  const revalidatingSegment = readOrCreateRevalidatingSegmentEntry(
    now,
    currentSegment
  )
  if (revalidatingSegment.status === EntryStatus.Empty) {
    // During a Full prefetch, a single dynamic request is made for all the
    // segments that we need. So we don't initiate a request here directly. By
    // returning a pending entry from this function, it signals to the caller
    // that this segment should be included in the request that's sent to
    // the server.
    const pendingSegment = upgradeToPendingSegment(
      revalidatingSegment,
      FetchStrategy.Full
    )
    upsertSegmentOnCompletion(
      segmentKey,
      waitForSegmentCacheEntry(pendingSegment)
    )
    return pendingSegment
  } else {
    // There's already a revalidation in progress.
    const nonEmptyRevalidatingSegment = revalidatingSegment
    if (nonEmptyRevalidatingSegment.fetchStrategy !== FetchStrategy.Full) {
      // The existing revalidation was not fetched using the Full strategy.
      // Reset it and start a new revalidation.
      const emptySegment = resetRevalidatingSegmentEntry(
        nonEmptyRevalidatingSegment
      )
      const pendingSegment = upgradeToPendingSegment(
        emptySegment,
        FetchStrategy.Full
      )
      upsertSegmentOnCompletion(
        segmentKey,
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
  key: string,
  promise: Promise<FulfilledSegmentCacheEntry | null>
) {
  // Wait for a segment to finish loading, then upsert it into the cache
  promise.then((fulfilled) => {
    if (fulfilled !== null) {
      // Received new data. Attempt to replace the existing entry in the cache.
      upsertSegmentEntry(Date.now(), key, fulfilled)
    }
  }, noop)
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
