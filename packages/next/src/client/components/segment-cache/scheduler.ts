import type { TreePrefetch } from '../../../server/app-render/collect-segment-data'
import {
  requestRouteCacheEntryFromCache,
  requestSegmentEntryFromCache,
  EntryStatus,
  type FulfilledRouteCacheEntry,
  type RouteCacheEntry,
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
   * sortId is an incrementing counter
   *
   * Newer prefetches are prioritized over older ones, so that as new links
   * enter the viewport, they are not starved by older links that are no
   * longer relevant. In the future, we can add additional prioritization
   * heuristics, like removing prefetches once a link leaves the viewport.
   *
   * The sortId is assigned when the prefetch is initiated, and reassigned if
   * the same URL is prefetched again (effectively bumping it to the top of
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
 */
export function schedulePrefetchTask(key: RouteCacheKey): void {
  // Spawn a new prefetch task
  const task: PrefetchTask = {
    key,
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

/**
 * Notifies the scheduler of an in-progress prefetch request. This is used to
 * control network bandwidth by limiting the number of concurrent requests.
 *
 * @param promise A promise that resolves when the request has finished.
 */
export function trackPrefetchRequestBandwidth(
  promiseForServerData: Promise<unknown>
) {
  inProgressRequests++
  promiseForServerData.then(
    onPrefetchRequestCompletion,
    onPrefetchRequestCompletion
  )
}

const noop = () => {}

export function spawnPrefetchSubtask(promise: Promise<any>) {
  // When the scheduler spawns an async task, we don't await its result
  // directly. Instead, the async task writes its result directly into the
  // cache, then pings the scheduler to continue.
  //
  // This function only exists to prevent warnings about unhandled promises.
  promise.then(noop, noop)
}

function onPrefetchRequestCompletion(): void {
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
    const route = requestRouteCacheEntryFromCache(now, task)
    const exitStatus = pingRouteTree(now, task, route)
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
        // The prefetch is complete. Continue to the next task.
        heapPop(taskHeap)
        task = heapPeek(taskHeap)
        continue
      default: {
        const _exhaustiveCheck: never = exitStatus
        return
      }
    }
  }
}

function pingRouteTree(
  now: number,
  task: PrefetchTask,
  route: RouteCacheEntry
): PrefetchTaskExitStatus {
  switch (route.status) {
    case EntryStatus.Pending: {
      // Still pending. We can't start prefetching the segments until the route
      // tree has loaded.
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
      requestSegmentEntryFromCache(now, task, route, tree.path, '')
      return pingSegmentTree(now, task, route, tree)
    }
    default: {
      const _exhaustiveCheck: never = route
      return PrefetchTaskExitStatus.Done
    }
  }
}

function pingSegmentTree(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: TreePrefetch
): PrefetchTaskExitStatus.InProgress | PrefetchTaskExitStatus.Done {
  if (tree.slots !== null) {
    // Recursively ping the children.
    for (const parallelRouteKey in tree.slots) {
      const childTree = tree.slots[parallelRouteKey]
      if (!hasNetworkBandwidth()) {
        // Stop prefetching segments until there's more bandwidth.
        return PrefetchTaskExitStatus.InProgress
      } else {
        const childPath = childTree.path
        const childToken = childTree.token
        requestSegmentEntryFromCache(now, task, route, childPath, childToken)
      }
      const childExitStatus = pingSegmentTree(now, task, route, childTree)
      if (childExitStatus === PrefetchTaskExitStatus.InProgress) {
        // Child yielded without finishing.
        return PrefetchTaskExitStatus.InProgress
      }
    }
  }
  // This segment and all its children have finished prefetching.
  return PrefetchTaskExitStatus.Done
}

// -----------------------------------------------------------------------------
// The remainider of the module is a MinHeap implementation. Try not to put any
// logic below here unless it's related to the heap algorithm. We can extract
// this to a separate module if/when we need multiple kinds of heaps.
// -----------------------------------------------------------------------------

function compareQueuePriority(a: PrefetchTask, b: PrefetchTask) {
  // Since the queue is a MinHeap, this should return a positive number if b is
  // higher priority than a, and a negative number if a is higher priority
  // than b.
  //
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

// Not currently used, but will be once we add the ability to update a
// task's priority.
// function heapSift(heap: Array<PrefetchTask>, node: PrefetchTask) {
//   const index = node._heapIndex
//   if (index !== -1) {
//     const parentIndex = (index - 1) >>> 1
//     const parent = heap[parentIndex]
//     if (compareQueuePriority(parent, node) > 0) {
//       // The parent is larger. Sift up.
//       heapSiftUp(heap, node, index)
//     } else {
//       // The parent is smaller (or equal). Sift down.
//       heapSiftDown(heap, node, index)
//     }
//   }
// }

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
