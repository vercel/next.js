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
  fetchSegmentPrefetchesForPPRDisabledRoute,
  type PendingSegmentCacheEntry,
  convertRouteTreeToFlightRouterState,
  FetchStrategy,
  readOrCreateRevalidatingSegmentEntry,
  upsertSegmentEntry,
  type FulfilledSegmentCacheEntry,
  upgradeToPendingSegment,
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
   * Temporary state for tracking the currently running task. This is currently
   * used to track whether a task deferred some work to run background at
   * priority, but we might need it for additional state in the future.
   */
  hasBackgroundWork: boolean

  /**
   * True if the prefetch is blocked by network data. We remove tasks from the
   * queue once they are blocked, and add them back when they receive data.
   *
   * isBlocked also indicates whether the task is currently in the queue; tasks
   * are removed from the queue when they are blocked. Use this to avoid
   * queueing the same task multiple times.
   */
  isBlocked: boolean

  /**
   * The index of the task in the heap's backing array. Used to efficiently
   * change the priority of a task by re-sifting it, which requires knowing
   * where it is in the array. This is only used internally by the heap
   * algorithm. The naive alternative is indexOf every time a task is queued,
   * which has O(n) complexity.
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
const enum PrefetchPriority {
  Default = 1,
  Background = 0,
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
 */
export function schedulePrefetchTask(
  key: RouteCacheKey,
  treeAtTimeOfPrefetch: FlightRouterState
): void {
  // Spawn a new prefetch task
  const task: PrefetchTask = {
    key,
    treeAtTimeOfPrefetch,
    priority: PrefetchPriority.Default,
    hasBackgroundWork: false,
    sortId: sortIdCounter++,
    isBlocked: false,
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
  if (!task.isBlocked) {
    // Prefetch is already queued.
    return
  }
  // Unblock the task and requeue it.
  task.isBlocked = false
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
        task.isBlocked = true

        // Continue to the next task
        heapPop(taskHeap)
        task = heapPeek(taskHeap)
        continue
      case PrefetchTaskExitStatus.Done:
        if (hasBackgroundWork) {
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
      // Recursively fill in the segment tree.
      if (!hasNetworkBandwidth()) {
        // Stop prefetching segments until there's more bandwidth.
        return PrefetchTaskExitStatus.InProgress
      }
      const tree = route.tree
      if (route.isPPREnabled) {
        return pingRouteTree(now, task, route, tree)
      } else {
        // When PPR is disabled, we can't prefetch per segment. We must fallback
        // to the old prefetch behavior and send a dynamic request.
        //
        // Construct a tree (currently a FlightRouterState) that represents
        // which segments need to be prefetched and which ones are already
        // cached. If the tree is empty, then we can exit. Otherwise, we'll send
        // the request tree to the server and use the response to populate the
        // segment cache.
        //
        // Only routes that include a loading boundary can be prefetched in this
        // way. The server will only render up to the first loading boundary
        // inside new part of the tree. If there's no loading boundary, the
        // server will never return any data.
        // TODO: When we prefetch the route tree, the server should
        // indicate whether there's a loading boundary so the client doesn't
        // send a second request for no reason.
        const spawnedEntries = new Map<string, PendingSegmentCacheEntry>()
        const dynamicRequestTree = pingRouteTreeForPPRDisabledRoute(
          now,
          route,
          task.treeAtTimeOfPrefetch,
          tree,
          spawnedEntries
        )
        const needsDynamicRequest = spawnedEntries.size > 0
        if (needsDynamicRequest) {
          // Perform a dynamic prefetch request and populate the cache with
          // the result
          spawnPrefetchSubtask(
            fetchSegmentPrefetchesForPPRDisabledRoute(
              task,
              route,
              dynamicRequestTree,
              spawnedEntries
            )
          )
        }
        return PrefetchTaskExitStatus.Done
      }
    }
    default: {
      const _exhaustiveCheck: never = route
      return PrefetchTaskExitStatus.Done
    }
  }
}

function pingRouteTree(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree
): PrefetchTaskExitStatus.InProgress | PrefetchTaskExitStatus.Done {
  const segment = readOrCreateSegmentCacheEntry(now, route, tree.key)
  pingSegment(now, task, route, segment, task.key, tree.key, tree.token)
  if (tree.slots !== null) {
    if (!hasNetworkBandwidth()) {
      // Stop prefetching segments until there's more bandwidth.
      return PrefetchTaskExitStatus.InProgress
    }
    // Recursively ping the children.
    for (const parallelRouteKey in tree.slots) {
      const childTree = tree.slots[parallelRouteKey]
      const childExitStatus = pingRouteTree(now, task, route, childTree)
      if (childExitStatus === PrefetchTaskExitStatus.InProgress) {
        // Child yielded without finishing.
        return PrefetchTaskExitStatus.InProgress
      }
    }
  }
  // This segment and all its children have finished prefetching.
  return PrefetchTaskExitStatus.Done
}

function pingRouteTreeForPPRDisabledRoute(
  now: number,
  route: FulfilledRouteCacheEntry,
  oldTree: FlightRouterState,
  newTree: RouteTree,
  spawnedEntries: Map<string, PendingSegmentCacheEntry>
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
      let requestTreeChild
      if (
        oldTreeChildSegment !== undefined &&
        matchSegment(newTreeChildSegment, oldTreeChildSegment)
      ) {
        // This segment is already part of the current route. Keep traversing.
        requestTreeChild = pingRouteTreeForPPRDisabledRoute(
          now,
          route,
          oldTreeChild,
          newTreeChild,
          spawnedEntries
        )
      } else {
        // This segment is not part of the current route. We're entering a
        // part of the tree that we need to prefetch (unless everything is
        // already cached).
        requestTreeChild = createDynamicRequestTreeForPartiallyCachedSegments(
          now,
          route,
          newTreeChild,
          null,
          spawnedEntries
        )
      }
      requestTreeChildren[parallelRouteKey] = requestTreeChild
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

function createDynamicRequestTreeForPartiallyCachedSegments(
  now: number,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree,
  refetchMarkerContext: 'refetch' | 'inside-shared-layout' | null,
  spawnedEntries: Map<string, PendingSegmentCacheEntry>
): FlightRouterState {
  // The tree we're constructing is the same shape as the tree we're navigating
  // to — specifically, it's the subtree that isn't present in the previous
  // route. But even though this is a "new" tree, some of the individual
  // segments may be cached as a result of other route prefetches.
  //
  // So we need to find the first uncached segment along each path
  // add an explicit "refetch" marker so the server knows where to start
  // rendering. Once the server starts rendering along a path, it keeps
  // rendering until it hits a loading boundary. We use `refetchMarkerContext`
  // to represent the nearest parent marker.

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
        createDynamicRequestTreeForPartiallyCachedSegments(
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

function pingSegment(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  segment: SegmentCacheEntry,
  routeKey: RouteCacheKey,
  segmentKey: string,
  accessToken: string | null
): void {
  if (accessToken === null) {
    // We don't have an access token for this segment, which means we can't
    // do a per-segment prefetch. This happens when the route tree was
    // returned by a dynamic server response. Or if the server has decided
    // not to grant access to this segment.
    return
  }
  switch (segment.status) {
    case EntryStatus.Empty:
      // Upgrade to Pending so we know there's already a request in progress
      spawnPrefetchSubtask(
        fetchSegmentOnCacheMiss(
          route,
          upgradeToPendingSegment(segment, FetchStrategy.PPR),
          routeKey,
          segmentKey,
          accessToken
        )
      )
      break
    case EntryStatus.Pending: {
      // There's already a request in progress. Depending on what kind of
      // request it is, we may want to
      switch (segment.fetchStrategy) {
        case FetchStrategy.PPR:
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
              segmentKey,
              accessToken
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
          pingPPRSegmentRevalidation(
            now,
            segment,
            route,
            routeKey,
            segmentKey,
            accessToken
          )
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
  segmentKey: string,
  accessToken: string | null
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
            segmentKey,
            accessToken
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

  // sortId is an incrementing counter assigned to prefetches. We want to
  // process the newest prefetches first.
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
