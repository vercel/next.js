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
  readRouteCacheEntry,
  readOrCreateSegmentCacheEntry,
  fetchRouteOnCacheMiss,
  fetchSegmentPrefetchesUsingStaticRequest,
  EntryStatus,
  type FulfilledRouteCacheEntry,
  type RouteCacheEntry,
  type RouteTree,
  fetchSegmentPrefetchesUsingRuntimeRequest,
  type PendingSegmentCacheEntry,
  type SegmentCacheEntry,
  convertRouteTreeToFlightRouterState,
  readOrCreateRevalidatingSegmentEntry,
  upgradeToPendingSegment,
  overwriteRevalidatingSegmentCacheEntry,
  canNewFetchStrategyProvideMoreContent,
  attemptToFulfillDynamicSegmentFromBFCache,
  attemptToUpgradeSegmentFromBFCache,
} from './cache'
import type { RouteCacheKey } from './cache-key'
import { createCacheKey } from './cache-key'
import { urlSearchParamsToParsedUrlQuery } from '../../route-params'
import {
  FetchStrategy,
  type PrefetchTaskFetchStrategy,
  PrefetchPriority,
} from './types'
import {
  segmentCacheMap,
  getCurrentRouteCacheVersion,
  getCurrentSegmentCacheVersion,
} from './cache'
import type { CacheMap } from './cache-map'
import type { NavigationLockPrefetch } from './navigation-testing-lock'
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
   * The segment cache map this task operates in, captured when the task was
   * scheduled. Every segment read the task performs and every write its
   * responses perform target this map. Almost always the shared map; a task
   * scheduled while the Instant Navigation Testing lock is held gets the
   * lock scope's private map instead. Binding the map to the task means
   * tasks queued before a lock scope never leak entries into (or read out
   * of) the scope's map, and a scope task's late responses never leak into
   * the shared map. See `segmentCacheMap` in cache.ts.
   */
  segmentCacheMap: CacheMap<SegmentCacheEntry>

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
  /**
   * Set during a pass when the task spawned a segment request, or encountered
   * one that was already in flight (a Pending entry) — i.e. a response the
   * pass cares about but hasn't received yet. The task blocks instead of
   * advancing, and is re-pinged as each awaited entry settles; see
   * blockTaskOnPendingResponse for the full rationale. Each ping re-runs a
   * full traversal for the task, so expect roughly one re-pass per settling
   * entry. Re-runs don't re-spawn revalidations: when a completed
   * revalidation was re-keyed, its upsert evicts any superseded entry that
   * would shadow it (see upsertSegmentEntry in cache.ts), and when its upsert
   * was declined, the settled entry left in the revalidation slot dedupes
   * further attempts (see pingFullSegmentRevalidation).
   */
  hasPendingResponses: boolean
  spawnedRuntimePrefetches: Set<SegmentRequestKey> | null

  /**
   * True if the prefetch was cancelled.
   */
  isCanceled: boolean

  /**
   * Tracks whether the task has attempted to upgrade a fallback ISR response
   * to one based on concrete params.
   *
   * When the server serves an upgradeable fallback shell (the page hadn't been
   * prerendered with concrete params yet, but the route can be upgraded), we
   * poll the server a few times until the upgrade is complete, or until we
   * reach a limit and give up.
   *
   * - `Empty`: no loop has run yet.
   * - `Pending`: a loop is currently running.
   * - `Fulfilled`: a loop completed and obtained the upgraded version.
   * - `Rejected`: a loop ran but gave up (exhausted its retries, hit an error,
   *   or the task was canceled).
   *
   * To prevent against unbounded upgrade attempts, the loop is only attempted
   * once per task, even a Link's prefetch is rescheduled many times.
   */
  fallbackRetryStatus: EntryStatus

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
   * Instant Navigation Testing API only. Non-null when this prefetch task drives
   * a locked navigation (the `ensurePrefetchThenNavigate` path). Holds that
   * navigation's "wait for prefetch to fulfill" state, resolved when the task
   * completes. See navigation-testing-lock.ts.
   */
  _navigationLockPrefetch?: NavigationLockPrefetch | null
}

const enum PrefetchTaskExitStatus {
  /**
   * The task yielded because there are too many requests in progress.
   */
  InProgress,

  /**
   * The task is blocked. It needs more data before it can proceed.
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
 * - Shell: fetch each segment's shell-stage variant, keyed to be reusable
 *   across all params below the root (root params are kept) — the phase's
 *   target is the conceptual App Shell. Runs if the route can produce a
 *   shell and the feature is enabled. Bounded by
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
 * @param navigationLockPrefetch Testing API only. Non-null when this prefetch
 * drives a locked navigation (from `ensurePrefetchThenNavigate`); carries that
 * navigation's "wait for prefetch to fulfill" state. Null otherwise.
 */
export function schedulePrefetchTask(
  key: RouteCacheKey,
  treeAtTimeOfPrefetch: FlightRouterState,
  fetchStrategy: PrefetchTaskFetchStrategy,
  priority: PrefetchPriority,
  onInvalidate: null | (() => void),
  navigationLockPrefetch: NavigationLockPrefetch | null
): PrefetchTask {
  // Bind the task to the segment cache map that is active right now: the
  // shared map, unless the Instant Navigation Testing lock is held, in which
  // case the task gets the lock scope's private map. This is the single
  // place work is bound to a map based on lock state — everything downstream
  // receives the map explicitly. See `segmentCacheMap` in cache.ts.
  let taskSegmentCacheMap = segmentCacheMap
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    const { getNavigationLockSegmentCacheMap } =
      require('./navigation-testing-lock') as typeof import('./navigation-testing-lock')
    const lockMap = getNavigationLockSegmentCacheMap()
    if (lockMap !== null) {
      taskSegmentCacheMap = lockMap
    }
  }

  // Spawn a new prefetch task
  const task: PrefetchTask = {
    key,
    treeAtTimeOfPrefetch,
    routeCacheVersion: getCurrentRouteCacheVersion(),
    segmentCacheVersion: getCurrentSegmentCacheVersion(),
    segmentCacheMap: taskSegmentCacheMap,
    priority,
    phase: PrefetchPhase.RouteTree,
    hasBackgroundWork: false,
    hasPendingResponses: false,
    spawnedRuntimePrefetches: null,
    fetchStrategy,
    sortId: sortIdCounter++,
    isCanceled: false,
    fallbackRetryStatus: EntryStatus.Empty,
    onInvalidate,
    _heapIndex: -1,
  }
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    task._navigationLockPrefetch = navigationLockPrefetch
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
  // A running fallback-retry loop notices `isCanceled` when it next wakes and
  // bails (settling its status to Rejected), so there's nothing to clean up here.
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

  // Note: fallback-retry state is deliberately NOT reset here. A retry loop runs
  // at most once per task, even across reschedules, so a re-hover never starts a
  // second loop. A loop already running simply continues (it only stops on
  // cancel); `fallbackRetryStatus` never returns to `Empty` once it leaves it.

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

    // These fields are only valid for a single "pass" — one pingRoute
    // invocation for a task, which is what the comments here also call an
    // attempt or an iteration. Reset them after each iteration of the
    // task queue.
    const hasBackgroundWork = task.hasBackgroundWork
    task.hasBackgroundWork = false
    task.hasPendingResponses = false
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
          // Finished prefetching the route tree. The two-phase (Shell then
          // Speculative) flow only applies to routes that have opted into
          // Partial Prefetching — either globally via the `partialPrefetching`
          // config or per segment (`prefetch: 'partial'`), both surfaced as the
          // `SubtreeHasPartialPrefetching` hint on the route tree. Every other
          // route skips the Shell phase and goes straight to Speculative.
          //
          // The route entry is fulfilled at this point (the RouteTree phase
          // just completed), so its prefetch hints are available.
          const route = readRouteCacheEntry(now, task.key)
          const routeHasPartialPrefetching =
            route !== null &&
            route.status === EntryStatus.Fulfilled &&
            (route.tree.prefetchHints &
              PrefetchHint.SubtreeHasPartialPrefetching) !==
              0
          task.phase = routeHasPartialPrefetching
            ? PrefetchPhase.Shell
            : PrefetchPhase.Speculative
          heapResift(taskHeap, task)
        } else if (task.phase === PrefetchPhase.Shell) {
          // Shell phase complete — a Done exit means the pass observed every
          // response it cares about (otherwise it would have exited Blocked;
          // see hasPendingResponses). Always advance to Speculative regardless
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
          //
          // Completion is terminal in the normal flow: a task only completes
          // after a full pass observed every response it cares about. In rare
          // cases, though, a task can complete while still registered on an
          // entry from an earlier pass whose subtree the final pass no longer
          // reached; when that entry later settles, it re-pings the completed
          // task. The re-run is a harmless idempotent no-op, but any
          // per-completion side effect added here must be idempotent or
          // once-guarded — in particular, the navigation-lock release below
          // must not fire twice (hence the nulling).
          if (
            process.env.__NEXT_EXPOSE_TESTING_API &&
            task._navigationLockPrefetch != null
          ) {
            // This locked-navigation prefetch is complete: the final pass
            // observed every segment response it cares about, so the data the
            // navigation will read has settled. Resolve the prefetch's
            // promise (awaited by `ensurePrefetchThenNavigate`) so the
            // navigation proceeds against present data rather than a
            // still-in-flight entry.
            const { resolveNavigationLockPrefetch } =
              require('./navigation-testing-lock') as typeof import('./navigation-testing-lock')
            resolveNavigationLockPrefetch(task._navigationLockPrefetch)
            // Release at most once per task: a stale registration from an
            // earlier pass can re-ping a completed task (see above), so it can
            // pass through here again.
            task._navigationLockPrefetch = null
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

function pingRoute(
  now: number,
  task: PrefetchTask
):
  | PrefetchTaskExitStatus.InProgress
  | PrefetchTaskExitStatus.Blocked
  | PrefetchTaskExitStatus.Done {
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

  if (exitStatus === PrefetchTaskExitStatus.Done && task.hasPendingResponses) {
    // The pass traversed the whole tree, but some segment responses haven't
    // arrived yet, so the current phase isn't actually complete. Block until
    // they do (see blockTaskOnPendingResponse for the full rationale).
    return PrefetchTaskExitStatus.Blocked
  }

  return exitStatus
}

function pingRootRouteTree(
  now: number,
  task: PrefetchTask,
  route: RouteCacheEntry
):
  | PrefetchTaskExitStatus.InProgress
  | PrefetchTaskExitStatus.Blocked
  | PrefetchTaskExitStatus.Done {
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
        // If Partial Prefetching is enabled anywhere on the target route,
        // ignore the fetch strategy and switch to unified strategy used by
        // Cache Components (called `PPR` for now, will likely be renamed).
        //
        // In practice, this just means that a "full" prefetch (<Link
        // prefetch={true}>) has no effect. You're meant to use Runtime
        // Prefetching instead — that's the new pattern that replaces
        // prefetch={true}.
        //
        // The reason we check for the Partial Prefetching opt-in rather than
        // the `cacheComponents` flag is to support incremental adoption.
        // `prefetch={true}` will continue to work until you opt into
        // Partial Prefetching.
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

          // Derive the static walk's parameters once per pass; the walk
          // functions below receive them as arguments and are phase-agnostic.
          // During the Shell phase the walk requests each segment's
          // shell-stage variant (keyed at the shell vary paths); otherwise
          // it's the ordinary per-segment static strategy. This is the only
          // place the phase is consulted — everything below keys off
          // the strategy.
          const staticWalkStrategy =
            task.phase === PrefetchPhase.Shell
              ? FetchStrategy.StaticShell
              : FetchStrategy.PPR

          // In PPF, links may skip speculative prefetching if they only need a shell.
          if (
            staticWalkStrategy === FetchStrategy.PPR &&
            !needsSpeculativePrefetch(
              task.fetchStrategy,
              route.tree.prefetchHints
            )
          ) {
            return PrefetchTaskExitStatus.Done
          }

          pingStaticHead(now, task, route, staticWalkStrategy)

          const exitStatus = pingSharedPartOfCacheComponentsTree(
            now,
            task,
            route,
            task.treeAtTimeOfPrefetch,
            tree,
            null,
            staticWalkStrategy
          )
          if (exitStatus === PrefetchTaskExitStatus.InProgress) {
            // Child yielded without finishing.
            return PrefetchTaskExitStatus.InProgress
          }

          // We may need to do a runtime prefetch for one or more segments.
          // Before checking, we can do some fast checks to bail out of this
          // branch early.
          //
          // Runtime prefetches are only issued for walks that require runtime
          // completeness — the same per-pass predicate that produced the
          // deopt registrations during the traversal above; see the decision
          // point in pingNewPartOfCacheComponentsTree. Which segments
          // actually need a runtime request — registered directly, or only
          // as the fallback after an insufficient static attempt — was
          // decided there.
          if (walkRequiresRuntimeCompleteness(staticWalkStrategy, route)) {
            const runtimeStrategy =
              staticWalkStrategy === FetchStrategy.StaticShell
                ? FetchStrategy.RuntimeShell
                : FetchStrategy.PPRRuntime

            // spawnedRuntimePrefetches was populated during the traversal
            // above: every subtree in the new part of the tree that needs a
            // runtime prefetch — plus, during the Shell phase, the head, if
            // its static attempt was insufficient (see above).
            //
            // If it's null, nothing in the new part of the tree is a candidate
            // for runtime prefetching, and we don't fetch the head, either —
            // the head is runtime prefetched only if one of the segments is.
            const spawnedRuntimePrefetches = task.spawnedRuntimePrefetches
            if (spawnedRuntimePrefetches !== null) {
              const spawnedEntries = new Map<
                SegmentRequestKey,
                PendingSegmentCacheEntry
              >()
              pingRuntimeHead(now, task, route, spawnedEntries, runtimeStrategy)
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
                  fetchSegmentPrefetchesUsingRuntimeRequest(
                    task,
                    route,
                    runtimeStrategy,
                    requestTree,
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
          // Prefetch multiple segments using a single runtime request.
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
              fetchSegmentPrefetchesUsingRuntimeRequest(
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

/**
 * A linked list tracking the segments to fulfill from a single prefetch
 * response, accumulated during the tree walk. The head is the requested
 * segment; subsequent nodes are parent segments whose data is bundled into
 * the same response by the server. When segments are not bundled, the list
 * has a single node.
 *
 * The chain only exists during the walk: when it's finalized,
 * pingSegmentBundle converts it into the map of spawned entries the fetch
 * fulfills (keyed by segment request key).
 */
type SegmentBundle = {
  // Null when the segment has prefetching disabled entirely
  // (prefetch: 'force-disabled' / instant = false; Partial Prefetching
  // segments have static data and occupy a real node). The bundle chain
  // passes through it but no cache entry is created for it.
  tree: RouteTree<null> | null
  entry: SegmentCacheEntry | null
  parent: SegmentBundle | null
}

/**
 * Prefetches the Head data for a page (metadata, viewport). The Head is not
 * really a route segment, in the sense that it doesn't appear in the route
 * tree, but we store it in the cache as if it were, using a special key.
 *
 * Symmetric with the per-segment decision point in
 * pingNewPartOfCacheComponentsTree: the head deopts to the runtime prefetch
 * path either when it requires runtime completeness and no static attempt is
 * happening, or when a fulfilled static head entry reported that a runtime
 * request would return more content than the entry contains. Deopting
 * registers the head under its metadata request key, which makes the runtime
 * gate in pingRootRouteTree fire even when every tree segment was
 * sufficient; pingRuntimeHead performs the actual head work.
 */
function pingStaticHead(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  // The per-pass static walk strategy; see pingRootRouteTree where
  // it's derived.
  fetchStrategy: FetchStrategy.PPR | FetchStrategy.StaticShell
): void {
  // The head is subject to the same per-pass runtime-completeness contract
  // as the route's segments: during a StaticShell walk, and during any walk
  // of a Partial Prefetching route, the head needs a response at least as
  // complete as a runtime one.
  const headRequiresRuntimeCompleteness = walkRequiresRuntimeCompleteness(
    fetchStrategy,
    route
  )
  if (
    headRequiresRuntimeCompleteness &&
    // The head is not a tree node — it hangs off the route root — so the
    // static-attempt hint is read from the root's node. (Segments read the
    // bit from their own node; see the decision point in
    // pingNewPartOfCacheComponentsTree.)
    (route.tree.prefetchHints & PrefetchHint.ShouldAttemptStaticPrefetch) === 0
  ) {
    // No static attempt: the head arrives via the runtime request instead.
    addSpawnedRuntimePrefetch(task, route.metadata.requestKey)
    return
  }

  if (
    // If the head was inlined into a page's bundle (HeadOutlined is NOT set
    // on the root), skip the standalone fetch — the head data will arrive
    // as part of that page's response, and its runtime-completeness signal
    // is carried by that page's own entries.
    process.env.__NEXT_PREFETCH_INLINING &&
    !(route.tree.prefetchHints & PrefetchHint.HeadOutlined)
  ) {
    return
  }

  const segments: SegmentBundle = {
    tree: route.metadata,
    entry: readOrCreateSegmentCacheEntry(
      now,
      task.segmentCacheMap,
      fetchStrategy,
      route.metadata
    ),
    parent: null,
  }
  const needsRuntimeRequest = pingSegmentBundle(
    now,
    task,
    route,
    task.key,
    route.metadata,
    segments,
    fetchStrategy,
    true
  )
  if (headRequiresRuntimeCompleteness && needsRuntimeRequest) {
    // The static attempt was insufficient for the head. Deopt to a
    // runtime prefetch. (Outside of runtime-completeness contexts the
    // head's signal is unused — a partial static head is filled in by the
    // navigation-time request, as with any other static segment.)
    addSpawnedRuntimePrefetch(task, route.metadata.requestKey)
  }
}

/**
 * Whether the task needs a cache entry at least as complete as a runtime
 * response for every segment it walks before the prefetch counts as done.
 * Runtime completeness is the universal contract for Partial Prefetching,
 * so the predicate is per pass, not per segment:
 *
 * - Every walk of a route that opts into Partial Prefetching (any segment
 *   with a partial-prefetching config, or the global `partialPrefetching`
 *   flag — both surfaced as SubtreeHasPartialPrefetching on the route
 *   root), in both the Shell and Speculative phases.
 * - Every StaticShell walk — the Shell phase's walk, whose target (the
 *   conceptual App Shell) must be reusable across all params by definition.
 *   (In practice this is implied by the first case — the Shell phase only
 *   runs for Partial Prefetching routes.)
 *
 * Routes without Partial Prefetching keep the static-only contract: their
 * walks prefetch static data and partial entries are acceptable — the
 * dynamic holes are filled by the navigation-time request.
 *
 * Note: The runtime contract is affordable because most
 * routes carry the ShouldAttemptStaticPrefetch hint: their segments are
 * prefetched statically and the responses' own sufficiency signal makes a
 * runtime request rare. On a hint-unset route, a walked segment deopts
 * directly to the batched runtime request.
 *
 * This is also the gate for the batched runtime request at the end of
 * pingRootRouteTree; requiring runtime completeness does not itself mean a
 * runtime request is issued for a given segment — see the decision point in
 * pingNewPartOfCacheComponentsTree.
 */
function walkRequiresRuntimeCompleteness(
  staticWalkStrategy: FetchStrategy.PPR | FetchStrategy.StaticShell,
  route: FulfilledRouteCacheEntry
): boolean {
  return (
    staticWalkStrategy === FetchStrategy.StaticShell ||
    (route.tree.prefetchHints & PrefetchHint.SubtreeHasPartialPrefetching) !== 0
  )
}

/**
 * The runtime counterpart of a pass's static walk strategy: the strategy the
 * batched runtime request uses if this walk deopts. Each phase has exactly one
 * — the Shell phase escalates to a shell-scoped runtime request
 * (RuntimeShell), the Speculative phase to a per-link concrete
 * runtime prefetch.
 */
function getRuntimeStrategyForWalk(
  staticWalkStrategy: FetchStrategy.PPR | FetchStrategy.StaticShell
): FetchStrategy.RuntimeShell | FetchStrategy.PPRRuntime {
  return staticWalkStrategy === FetchStrategy.StaticShell
    ? FetchStrategy.RuntimeShell
    : FetchStrategy.PPRRuntime
}

/**
 * Whether this phase's runtime request would return more content for a
 * fulfilled entry than the entry already holds.
 *
 * An entry records the tier its CONTENT achieved, not the one it was requested
 * at, and that tier spans both axes — so a static response that needed no
 * runtime data records the runtime counterpart of its own variant (see
 * `recordedFetchStrategy` in cache.ts). That makes this a pure tier
 * comparison: an entry at or above the phase's runtime tier has nothing to
 * gain from it.
 */
function wouldRuntimeRequestProvideMore(
  entry: SegmentCacheEntry,
  staticWalkStrategy: FetchStrategy.PPR | FetchStrategy.StaticShell
): boolean {
  return canNewFetchStrategyProvideMoreContent(
    entry.fetchStrategy,
    getRuntimeStrategyForWalk(staticWalkStrategy)
  )
}

/**
 * Whether a fulfilled shell-tier entry should take a static attempt (a
 * spawned revalidation at the walk's static tier) before its position deopts
 * to a runtime request. A shell-tier recorded entry (StaticShell or
 * RuntimeShell) is not evidence that a static attempt would be pointless —
 * unlike a concrete static (PPR) entry, where a static re-fetch would return
 * the same bytes — so when the segment's hint says a static attempt is
 * worthwhile (the build-time prerender accessed no runtime data), the
 * attempt is taken and its response's own verdict decides whether to
 * escalate afterward.
 *
 * Consults the revalidation slot so an attempt that already ran and settled
 * without healing the entry (a rejected attempt: server miss or network
 * error; a successful one upserts over the shell-tier entry, so the caller
 * reads the healed entry instead) doesn't suppress the runtime deopt
 * forever. The slot read creates an Empty placeholder on first evaluation —
 * there is no read-only variant — which is harmless: when the entry is
 * eligible, the spawn that follows claims the same slot.
 */
function isShellEntryEligibleForStaticAttempt(
  now: number,
  map: CacheMap<SegmentCacheEntry>,
  entry: SegmentCacheEntry,
  tree: RouteTree<null>,
  fetchStrategy: FetchStrategy.PPR | FetchStrategy.StaticShell
): boolean {
  if (
    (entry.fetchStrategy !== FetchStrategy.StaticShell &&
      entry.fetchStrategy !== FetchStrategy.RuntimeShell) ||
    (tree.prefetchHints & PrefetchHint.ShouldAttemptStaticPrefetch) === 0 ||
    // A StaticShell walk's static attempt is the shell tier itself, so it
    // only applies when the walk's static strategy outranks the entry.
    !canNewFetchStrategyProvideMoreContent(entry.fetchStrategy, fetchStrategy)
  ) {
    return false
  }
  const revalidatingEntry = readOrCreateRevalidatingSegmentEntry(
    now,
    map,
    fetchStrategy,
    tree
  )
  return (
    revalidatingEntry.status === EntryStatus.Empty ||
    revalidatingEntry.status === EntryStatus.Pending
  )
}

/**
 * Register a subtree root (or the head's metadata key) for the batched
 * runtime request issued by the gate at the end of pingRootRouteTree.
 */
function addSpawnedRuntimePrefetch(
  task: PrefetchTask,
  requestKey: SegmentRequestKey
): void {
  if (task.spawnedRuntimePrefetches === null) {
    task.spawnedRuntimePrefetches = new Set([requestKey])
  } else {
    task.spawnedRuntimePrefetches.add(requestKey)
  }
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
  newTree: RouteTree<null>,
  parentBundle: SegmentBundle | null,
  // The per-pass static walk strategy; see pingRootRouteTree where
  // it's derived.
  fetchStrategy: FetchStrategy.PPR | FetchStrategy.StaticShell
): PrefetchTaskExitStatus.InProgress | PrefetchTaskExitStatus.Done {
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

  // The shared part of the tree always performs the ordinary static (PPR)
  // prefetch, regardless of phase. Phase-specific strategies — the runtime
  // shell request and the Shell phase's StaticShell walk — apply only to the
  // new part of the tree, so the per-pass walk strategy is irrelevant here.
  // (The needs-runtime signal is ignored: shared segments are already
  // rendered on the current page, so a runtime prefetch has nothing to add.)
  const bundleInProgress = accumulateSegmentBundle(
    now,
    task,
    route,
    newTree,
    parentBundle,
    FetchStrategy.PPR,
    true
  ).bundle

  // Recursively ping the children.
  const oldTreeChildren = oldTree[1]
  const newTreeChildren = newTree.slots
  if (newTreeChildren !== null) {
    for (const [parallelRouteKey, newTreeChild] of newTreeChildren) {
      if (!hasNetworkBandwidth(task)) {
        // Stop prefetching segments until there's more bandwidth.
        return PrefetchTaskExitStatus.InProgress
      }
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
          bundleForChild,
          fetchStrategy
        )
      } else {
        // We've entered the "new" part of the tree. Switch
        // traversal functions.
        //
        // Bundle chains must not cross the strategy boundary: the shared
        // part walks at PPR while a Shell-phase new part walks at
        // StaticShell, and a chain spanning both would fulfill the shared
        // parent's concrete-path entry with shell-variant data. Nor may we
        // finish the chain by fetching the new-part child at PPR here —
        // that would prefetch new-part segments at the concrete tier
        // during the Shell phase, which only the Speculative phase is
        // allowed to do. So drop the bundle instead, exactly like the
        // Speculative walk's subtree bail does when a chain crosses into a
        // subtree it skips: nothing in a dropped chain was upgraded to
        // Pending, so no entry is stranded, and the inlined shared data is
        // fetched by the Speculative pass whenever its walk of the new
        // part permits the child fetch.
        const bundleForNewPart =
          fetchStrategy === FetchStrategy.StaticShell ? null : bundleForChild
        childExitStatus = pingNewPartOfCacheComponentsTree(
          now,
          task,
          route,
          newTreeChild,
          bundleForNewPart,
          fetchStrategy
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
  tree: RouteTree<null>,
  parentBundle: SegmentBundle | null,
  // The per-pass static walk strategy; see pingRootRouteTree where
  // it's derived.
  fetchStrategy: FetchStrategy.PPR | FetchStrategy.StaticShell
): PrefetchTaskExitStatus.InProgress | PrefetchTaskExitStatus.Done {
  // We're now prefetching in the "new" part of the tree, the part that
  // doesn't exist on the current page. (In other words, we're deeper than
  // the shared layouts.) Segments in here default to being prefetched
  // statically, at the per-pass strategy derived in pingRootRouteTree.
  //
  // When the walk requires runtime completeness — an entry at least as
  // complete as a runtime response for every segment before the prefetch
  // can complete (see walkRequiresRuntimeCompleteness) — this function is
  // also the per-segment decision point. If the segment's node carries the
  // ShouldAttemptStaticPrefetch hint (the build-time prerender accessed no
  // runtime data), its subtree is prefetched statically first,
  // and the responses themselves decide whether that was enough: every
  // fulfilled entry carries a needsRuntimeRequest signal. Pending responses
  // block the task, so the attempt is serial, never raced: static attempt →
  // observe → runtime only if needed. Without the hint, the segment deopts
  // directly. Deopting registers the segment's request key in
  // spawnedRuntimePrefetches; the runtime gate at the end of
  // pingRootRouteTree issues a single batched runtime request for
  // everything that accumulated, and that request re-fetches the whole
  // subtree, so the walk stops descending at a deopt.
  //
  // Outside a runtime-completeness walk the same needsRuntimeRequest signal
  // is routine and ignored — any partial entry of a page that accesses
  // runtime data carries it, and the dynamic holes are filled by the
  // navigation-time request.

  // In PPF, links may skip speculative prefetching if they only need a shell.
  if (
    fetchStrategy === FetchStrategy.PPR &&
    !needsSpeculativePrefetch(task.fetchStrategy, route.tree.prefetchHints)
  ) {
    return PrefetchTaskExitStatus.Done
  }

  // Constant for the whole pass; recomputed here only because the walk is
  // recursive and the check is cheap.
  const segmentRequiresRuntimeCompleteness = walkRequiresRuntimeCompleteness(
    fetchStrategy,
    route
  )
  // TODO: The static-attempt hint reflects the build-time prerender's whole
  // runtime-data tracking, so a page that always accesses
  // runtime data after the shell stage never attempts a static prefetch —
  // even though its shell variant is rewindable at the shell boundary and
  // perfectly reusable. The server could emit a second bit derived from the
  // shell-stage value ("a static SHELL attempt is worthwhile even though
  // the page accesses runtime data post-shell") to let such pages attempt
  // static, too.
  // A force-disabled segment deliberately does NOT deopt here: disabling
  // prefetch is passive. It never initiates a request — its accumulation
  // below contributes nothing — and must never be the reason a runtime
  // prefetch spawns, though it may ride along in a runtime response issued
  // on another segment's behalf.
  const attemptStaticPrefetchOfSegment =
    (tree.prefetchHints & PrefetchHint.ShouldAttemptStaticPrefetch) !== 0

  if (segmentRequiresRuntimeCompleteness && !attemptStaticPrefetchOfSegment) {
    // Deopt directly to a runtime prefetch, without a static attempt.
    addSpawnedRuntimePrefetch(task, tree.requestKey)
    // If there's a pending static bundle from a parent, we need to finish
    // prefetching it before bailing out to runtime prefetching.
    if (parentBundle !== null) {
      finishStaticBundleOnRuntimeBailout(
        now,
        task,
        route,
        tree,
        parentBundle,
        fetchStrategy
      )
    }
    return PrefetchTaskExitStatus.Done
  }

  // Prefetch this segment and its subtree statically, using the normal
  // static bundling walk.
  const accumulation = accumulateSegmentBundle(
    now,
    task,
    route,
    tree,
    parentBundle,
    fetchStrategy,
    true
  )
  const bundleInProgress = accumulation.bundle

  if (segmentRequiresRuntimeCompleteness && accumulation.needsRuntimeRequest) {
    // The static attempt for this segment was insufficient. Stop the walk
    // and deopt — the runtime prefetch covers the whole subtree. (Unlike the
    // direct deopt above, any open bundle is dropped rather than finished: a
    // fulfilled InlinedIntoChild node can report a true signal while its
    // chain is still open. That's safe — nothing in an un-pinged chain was
    // upgraded to Pending, so no entry is stranded blocking the task, and
    // Empty entries in the dropped chain are re-fetched by a later pass.)
    addSpawnedRuntimePrefetch(task, tree.requestKey)
    return PrefetchTaskExitStatus.Done
  }

  if (tree.slots !== null) {
    if (!hasNetworkBandwidth(task)) {
      // Stop prefetching segments until there's more bandwidth.
      return PrefetchTaskExitStatus.InProgress
    }
    // Recursively ping the children.
    for (const childTree of tree.slots.values()) {
      // Only pass the bundle to the child that accepts it. A parent is
      // only ever bundled into one child.
      const bundleForChild =
        process.env.__NEXT_PREFETCH_INLINING &&
        bundleInProgress !== null &&
        childTree.prefetchHints & PrefetchHint.ParentInlinedIntoSelf
          ? bundleInProgress
          : null
      const childResult = pingNewPartOfCacheComponentsTree(
        now,
        task,
        route,
        childTree,
        bundleForChild,
        fetchStrategy
      )
      if (childResult === PrefetchTaskExitStatus.InProgress) {
        // Child yielded without finishing.
        return PrefetchTaskExitStatus.InProgress
      }
    }
  }

  // The static attempt was sufficient for this segment (each child is its
  // own decision point) — or parts of it are still in flight, in which case
  // the task is blocked and the decision re-runs against the received
  // responses.
  return PrefetchTaskExitStatus.Done
}

function diffRouteTreeAgainstCurrent(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  oldTree: FlightRouterState,
  newTree: RouteTree<null>,
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
    for (const [parallelRouteKey, newTreeChild] of newTreeChildren) {
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
            // fallback to the old prefetch behavior and send a runtime request.
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
  if (newTree.prefetchHints !== 0) {
    requestTree[4] = newTree.prefetchHints
  }
  return requestTree
}

function pingPPRDisabledRouteTreeUpToLoadingBoundary(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree<null>,
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

  const segment = readOrCreateSegmentCacheEntry(
    now,
    task.segmentCacheMap,
    task.fetchStrategy,
    tree
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
      const pendingSegment = upgradeToPendingSegment(
        segment,
        // Set the fetch strategy to LoadingBoundary to indicate that the server
        // might not include it in the pending response. If another route is able
        // to issue a per-segment request, we'll do that in the background.
        FetchStrategy.LoadingBoundary
      )
      spawnedEntries.set(tree.requestKey, pendingSegment)
      // The pass blocks on every request it spawns, not just requests it
      // finds already in flight.
      blockTaskOnPendingResponse(task, pendingSegment)
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
      // The pass still depends on the in-flight response, so wait for it
      // before the phase can complete.
      blockTaskOnPendingResponse(task, segment)
      break
    }
    case EntryStatus.Rejected: {
      // The segment failed to load, or the server intentionally omitted it
      // from a response (both are encoded as Rejected). Skip it and keep
      // prefetching the rest of the tree; the entry's staleAt governs when it
      // may be retried. Don't register the task on the rejected entry —
      // nothing ever pings a Rejected entry.
      break
    }
    default:
      segment satisfies never
  }
  const requestTreeChildren: Record<string, FlightRouterState> = {}
  if (tree.slots !== null) {
    for (const [parallelRouteKey, childTree] of tree.slots) {
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
  if (tree.prefetchHints !== 0) {
    requestTree[4] = tree.prefetchHints
  }
  return requestTree
}

/**
 * Called during a pass when a segment's response hasn't been received yet —
 * whether the request was just spawned by this pass or was already in flight.
 * Marks the task as blocked: a phase only completes once a full pass observes
 * every segment response it cares about, because later decisions (like
 * whether a segment needs a follow-up runtime request) are made against the
 * contents of those responses, and a phase may need to restart its work based
 * on what they contain. The task is re-pinged (via pingBlockedTasks in
 * cache.ts) when the entry resolves, re-running the pass against the
 * received data. Only a pass that observes every response may advance the
 * phase or complete the task.
 *
 * Never call this for an entry that's already Rejected — nothing ever pings
 * a Rejected entry, so registering on one would strand the task. A rejected
 * segment is simply skipped: the pass keeps prefetching the rest of the tree
 * without it.
 */
function blockTaskOnPendingResponse(
  task: PrefetchTask,
  segment: { blockedTasks: Set<PrefetchTask> | null }
): void {
  // This state is reset after each iteration of the task queue. We use it to
  // inform the scheduler that the task is blocked.
  task.hasPendingResponses = true
  // Add the task to this segment's blocked tasks, so it can be rescheduled
  // once the segment finishes loading.
  if (segment.blockedTasks === null) {
    segment.blockedTasks = new Set([task])
  } else {
    segment.blockedTasks.add(task)
  }
}

function pingRouteTreeAndIncludeDynamicData(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree<null>,
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
    task.segmentCacheMap,
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
          const fulfilled = attemptToUpgradeSegmentFromBFCache(
            now,
            task.segmentCacheMap,
            tree
          )
          if (fulfilled !== null) {
            break
          }
        }
        spawnedSegment = pingFullSegmentRevalidation(
          now,
          task,
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
          task,
          tree,
          fetchStrategy
        )
      }
      if (segment.status === EntryStatus.Pending) {
        // A response for this segment is still in flight. The pass must
        // observe it before the phase can complete.
        blockTaskOnPendingResponse(task, segment)
      } else {
        // The segment failed to load, or the server intentionally omitted it
        // from a response (both are encoded as Rejected). Skip it and keep
        // prefetching the rest of the tree; the entry's staleAt governs when
        // it may be retried. Don't register the task on the rejected entry —
        // nothing ever pings a Rejected entry.
        //
        // TODO: The cache encodes real failures and intentional server
        // omissions identically (both Rejected); with per-segment skipping
        // this has no task-lifecycle consequence, but distinguishing them
        // could still be useful someday.
      }
      break
    }
    default:
      segment satisfies never
  }

  if (spawnedSegment !== null) {
    // A pass must observe the response for every request it spawns before
    // its phase can complete — not just requests it finds already in flight.
    // Block on the entry we just spawned; the task is re-pinged when it's
    // fulfilled or rejected.
    blockTaskOnPendingResponse(task, spawnedSegment)
  }

  const requestTreeChildren: Record<string, FlightRouterState> = {}
  if (tree.slots !== null) {
    for (const [parallelRouteKey, childTree] of tree.slots) {
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
  if (tree.prefetchHints !== 0) {
    requestTree[4] = tree.prefetchHints
  }
  return requestTree
}

function pingRuntimePrefetches(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree<null>,
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
    for (const [parallelRouteKey, childTree] of slots) {
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
  if (tree.prefetchHints !== 0) {
    requestTree[4] = tree.prefetchHints
  }
  return requestTree
}

/**
 * Walk a SegmentBundle, apply status-based logic to each entry, and if any
 * entries need data, spawn a single fetch request for the whole bundle.
 *
 * Returns true if a fulfilled entry in the bundle reported that a runtime
 * request would return more content than the entry contains
 * (needsRuntimeRequest, derived at write time from the response that
 * produced the entry). The callers surface this signal to the per-segment
 * decision point in pingNewPartOfCacheComponentsTree (and its analog for
 * the head in pingStaticHead), which uses it during a static attempt to
 * decide whether to fall back to a runtime prefetch. One exception withholds
 * the signal: a shell-tier entry whose segment carries the static-attempt
 * hint spawns a concrete static attempt first — see the Fulfilled case.
 */
function pingSegmentBundle(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  routeKey: RouteCacheKey,
  tree: RouteTree<null>,
  segments: SegmentBundle,
  // Per-pass static walk strategy; see pingRootRouteTree where it's derived.
  fetchStrategy: FetchStrategy.PPR | FetchStrategy.StaticShell,
  // False when finishing an open bundle chain on a runtime-prefetch bailout
  // (finishStaticBundleOnRuntimeBailout). The finish exists only to fetch
  // data the batched runtime request won't cover — Empty entries in the
  // chain — so it must not spawn revalidations over entries that are
  // already settled or in flight: the chain's terminal segments are inside
  // the deopted subtree, and re-fetching their static bundle would at best
  // duplicate the runtime request and at worst replace a runtime-complete
  // entry (e.g. a RuntimeShell-tier entry) with a less complete static
  // fallback response.
  spawnRevalidations: boolean
): boolean {
  let needsRuntimeRequest = false
  // The pending entries this task owns — Empty entries upgraded here, plus
  // any revalidations spawned here — keyed by segment request key. If any
  // accumulate, a single fetch is spawned for the whole bundle, and the
  // response fulfills them.
  let spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry> | null =
    null
  let node: SegmentBundle | null = segments
  while (node !== null) {
    const nodeEntry = node.entry
    const nodeTree = node.tree
    if (nodeEntry === null || nodeTree === null) {
      node = node.parent
      continue
    }
    switch (nodeEntry.status) {
      case EntryStatus.Empty: {
        const pendingEntry = upgradeToPendingSegment(nodeEntry, fetchStrategy)
        if (spawnedEntries === null) {
          spawnedEntries = new Map()
        }
        spawnedEntries.set(nodeTree.requestKey, pendingEntry)
        // The pass blocks on every request it spawns, not just requests it
        // finds already in flight.
        blockTaskOnPendingResponse(task, pendingEntry)
        break
      }
      case EntryStatus.Pending:
        if (
          spawnRevalidations &&
          // During a static shell attempt, never spawn revalidations — just
          // wait for the in-flight response (blocked below); its sufficiency
          // is checked on the re-run pass.
          fetchStrategy === FetchStrategy.PPR &&
          canNewFetchStrategyProvideMoreContent(
            nodeEntry.fetchStrategy,
            fetchStrategy
          )
        ) {
          const revalidatingEntry = readOrCreateRevalidatingSegmentEntry(
            now,
            task.segmentCacheMap,
            fetchStrategy,
            nodeTree
          )
          if (revalidatingEntry.status === EntryStatus.Empty) {
            const pendingEntry = upgradeToPendingSegment(
              revalidatingEntry,
              fetchStrategy
            )
            if (spawnedEntries === null) {
              spawnedEntries = new Map()
            }
            spawnedEntries.set(nodeTree.requestKey, pendingEntry)
            // Block on the revalidation request we just spawned, in
            // addition to the original in-flight entry (blocked below).
            blockTaskOnPendingResponse(task, pendingEntry)
          }
        }
        blockTaskOnPendingResponse(task, nodeEntry)
        break
      case EntryStatus.Rejected:
        if (
          spawnRevalidations &&
          // During a static shell attempt, a rejected entry is skipped
          // outright: no retry revalidation, and — deliberately — no runtime
          // fallback either (per-segment rejection semantics; the entry's
          // staleAt governs when it may be retried). Note that the cache
          // path encodes "no shell exists" (a static response whose shell
          // byte offset is 0, i.e. the page wasn't produced by staged
          // rendering) as a rejection too, so such segments get no shell
          // prefetch at all — an edge that shouldn't occur for hint-set
          // Cache Components routes.
          fetchStrategy === FetchStrategy.PPR &&
          canNewFetchStrategyProvideMoreContent(
            nodeEntry.fetchStrategy,
            fetchStrategy
          )
        ) {
          const revalidatingEntry = readOrCreateRevalidatingSegmentEntry(
            now,
            task.segmentCacheMap,
            fetchStrategy,
            nodeTree
          )
          if (revalidatingEntry.status === EntryStatus.Empty) {
            const pendingEntry = upgradeToPendingSegment(
              revalidatingEntry,
              fetchStrategy
            )
            if (spawnedEntries === null) {
              spawnedEntries = new Map()
            }
            spawnedEntries.set(nodeTree.requestKey, pendingEntry)
            // Block on the retry revalidation we just spawned, like any
            // other pending response. If the retry succeeds, its upsert
            // evicts the rejected entry (see evictShadowingSegmentEntries
            // in cache.ts) and the re-run pass reads the healed data. If it
            // rejects too, the re-run observes a settled revalidation and
            // moves on.
            blockTaskOnPendingResponse(task, pendingEntry)
          }
        }
        // The segment failed to load, or the server intentionally omitted it
        // from a response (both are encoded as Rejected). Skip it and keep
        // prefetching the rest of the bundle; the entry's staleAt governs
        // when it may be retried. Don't register the task on the rejected
        // entry itself — nothing ever pings a Rejected entry.
        break
      case EntryStatus.Fulfilled: {
        const runtimeWouldProvideMore = wouldRuntimeRequestProvideMore(
          nodeEntry,
          fetchStrategy
        )

        // An eligible shell-tier entry takes the static attempt path below
        // (the revalidation) instead of deopting straight to a runtime
        // request; see isShellEntryEligibleForStaticAttempt. The attempt
        // can't recur: its response records at least the concrete static
        // tier, which fails the shell-tier check on the re-run pass — and an
        // attempt that already settled without healing the entry reads as
        // ineligible, so the deopt proceeds after all.
        const shellEntryEligibleForStaticAttempt =
          isShellEntryEligibleForStaticAttempt(
            now,
            task.segmentCacheMap,
            nodeEntry,
            nodeTree,
            fetchStrategy
          )

        if (runtimeWouldProvideMore && !shellEntryEligibleForStaticAttempt) {
          // A runtime request would return more content for this segment
          // than the entry contains. Surface it via the return value, so the
          // caller can deopt this subtree to a runtime prefetch. (An
          // eligible shell-tier entry withholds the signal for this pass:
          // the static attempt spawned below blocks the task, and the re-run
          // pass reads the attempt's result instead.)
          needsRuntimeRequest = true
        }

        // For entries below this phase's tier, upgrade during the phase
        // itself — no background deferral, since the whole point of the
        // Speculative phase is to bring the cache up to the
        // per-link-concrete tier. `isPartial` ensures a complete entry isn't
        // re-fetched.
        //
        // Exception: when a runtime request would return more AND this walk
        // permits one, skip the static path entirely — unless the entry is
        // an eligible shell-tier entry (see above), whose static attempt IS
        // this upgrade. Otherwise the runtime request covers this segment
        // and supersedes anything a static fetch could add, so a static
        // upgrade would at best duplicate it — delivering the same content
        // twice — and at worst replace runtime content with static content.
        //
        // When no runtime request is permitted, the signal is irrelevant:
        // nothing can act on it, so it must not suppress the static upgrade.
        // That's what keeps a link prefetching static content on top of a
        // cached shell.
        const willBeSupersededByRuntimeRequest =
          runtimeWouldProvideMore &&
          !shellEntryEligibleForStaticAttempt &&
          walkRequiresRuntimeCompleteness(fetchStrategy, route)

        // Check if we should attempt to upgrade a fallback ISR response to
        // a concrete version.
        const isUpgradeableISRFallbackRetry =
          nodeEntry.isUpgradeableISRFallback &&
          // If the status is empty, then we haven't yet attempted to upgrade
          // the fallback.
          //
          // If the status is fulfilled, then the fallback was
          // successfully upgraded to a concrete version.
          //
          // Do not attempt to upgrade if the status is Pending or Rejected.
          (task.fallbackRetryStatus === EntryStatus.Empty ||
            task.fallbackRetryStatus === EntryStatus.Fulfilled)

        if (
          spawnRevalidations &&
          !willBeSupersededByRuntimeRequest &&
          ((nodeEntry.isPartial &&
            canNewFetchStrategyProvideMoreContent(
              nodeEntry.fetchStrategy,
              fetchStrategy
            )) ||
            isUpgradeableISRFallbackRetry)
        ) {
          const revalidatingEntry = readOrCreateRevalidatingSegmentEntry(
            now,
            task.segmentCacheMap,
            fetchStrategy,
            nodeTree
          )
          if (revalidatingEntry.status === EntryStatus.Empty) {
            const pendingEntry = upgradeToPendingSegment(
              revalidatingEntry,
              fetchStrategy
            )
            if (spawnedEntries === null) {
              spawnedEntries = new Map()
            }
            spawnedEntries.set(nodeTree.requestKey, pendingEntry)
            // The pass blocks on every request it spawns, including
            // revalidations of an already-fulfilled entry.
            blockTaskOnPendingResponse(task, pendingEntry)
          } else {
            // A non-empty revalidating entry means a request is already in
            // flight (or recently settled), so we dedupe and don't issue a
            // competing one — including for ISR-fallback upgrades, which then
            // share the same revalidation across tasks.
            if (revalidatingEntry.status === EntryStatus.Pending) {
              // The deduped-against revalidation is still in flight, and this
              // pass depends on its response. Wait for it before the phase
              // can complete. (A settled revalidation we chose not to use
              // needs no waiting and is not a prefetch failure — the base
              // entry here is already Fulfilled. A settled revalidation
              // can't strand an eligible shell-tier entry either:
              // isShellEntryEligibleForStaticAttempt reads the slot, so a
              // settled attempt makes the entry ineligible and the runtime
              // deopt proceeds above.)
              blockTaskOnPendingResponse(task, revalidatingEntry)
            }
          }
        }
        break
      }
      default:
        nodeEntry satisfies never
    }
    node = node.parent
  }
  if (spawnedEntries !== null) {
    spawnPrefetchSubtask(
      fetchSegmentPrefetchesUsingStaticRequest(
        task,
        route,
        routeKey,
        tree,
        spawnedEntries,
        fetchStrategy
      )
    )
  }
  return needsRuntimeRequest
}

/**
 * During the tree walk, decide whether this segment should be added to the
 * in-progress bundle (if it has InlinedIntoChild) or finalize the bundle
 * and ping it, triggering a fetch if any of its entries need data (if it
 * doesn't). Returns the updated bundle to pass to children (null if the
 * bundle was finalized here), along with the needs-runtime signal from the
 * bundle ping, if one happened (always false otherwise).
 */
function accumulateSegmentBundle(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree<null>,
  parentBundle: SegmentBundle | null,
  // Per-pass static walk strategy; see pingRootRouteTree where it's derived.
  // PPR for the normal static bundling walk; StaticShell during the Shell
  // phase's static shell attempt, whose entries are keyed at the shell
  // vary paths.
  fetchStrategy: FetchStrategy.PPR | FetchStrategy.StaticShell,
  // False when finishing a chain on a runtime-prefetch bailout; see
  // pingSegmentBundle.
  spawnRevalidations: boolean
): { bundle: SegmentBundle | null; needsRuntimeRequest: boolean } {
  // Prefetching is disabled for this segment (prefetch: 'force-disabled'):
  // the server emits identity only for its response node, and it
  // participates in the bundle chain with null tree/entry — no cache entry
  // is created for it.
  // (Partial Prefetching segments are NOT in this mask — the server emits
  // static data for them unconditionally.) Intentionally not gated by the
  // prefetch inlining flag: we never statically prefetch unprefetchable
  // segments.
  if (tree.prefetchHints & StaticPrefetchDisabled) {
    return {
      bundle: { tree: null, entry: null, parent: parentBundle },
      needsRuntimeRequest: false,
    }
  }

  const segment = readOrCreateSegmentCacheEntry(
    now,
    task.segmentCacheMap,
    fetchStrategy,
    tree
  )

  if (
    process.env.__NEXT_PREFETCH_INLINING &&
    tree.prefetchHints & PrefetchHint.InlinedIntoChild
  ) {
    if (segment.status === EntryStatus.Pending) {
      // The chain this entry joins may be dropped before it's ever pinged
      // (see the drop sites in pingNewPartOfCacheComponentsTree), and only
      // the ping blocks on Pending entries. Register on the in-flight
      // response at read time instead, so the pass observes it before the
      // phase can complete even if the chain is dropped. When the chain does
      // get pinged, the ping's own registration dedupes against this one.
      blockTaskOnPendingResponse(task, segment)
    }
    return {
      bundle: { tree, entry: segment, parent: parentBundle },
      // No bundle ping happens here, but the node's own entry may already be
      // fulfilled and insufficient. Report that signal directly: the chain
      // ping only reaches the terminal descendant, and if that descendant is
      // itself a decision point it consumes the signal for its own subtree,
      // leaving this ancestor's insufficiency invisible to the decision
      // point above it. An eligible shell-tier entry withholds the signal,
      // the same exception the bundle ping applies: deopting here would
      // pre-empt the static attempt the chain ping spawns for this node when
      // it reaches the terminal descendant (its Fulfilled case runs for
      // every node in the chain).
      needsRuntimeRequest:
        segment.status === EntryStatus.Fulfilled &&
        wouldRuntimeRequestProvideMore(segment, fetchStrategy) &&
        !isShellEntryEligibleForStaticAttempt(
          now,
          task.segmentCacheMap,
          segment,
          tree,
          fetchStrategy
        ),
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
        task.segmentCacheMap,
        fetchStrategy,
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

  const needsRuntimeRequest = pingSegmentBundle(
    now,
    task,
    route,
    task.key,
    tree,
    segments,
    fetchStrategy,
    spawnRevalidations
  )
  return { bundle: null, needsRuntimeRequest }
}

function finishStaticBundleOnRuntimeBailout(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree<null>,
  parentBundle: SegmentBundle,
  // The same static walk strategy the parent bundle was accumulated with.
  // Any needs-runtime signal from finishing the bundle is dropped: the
  // caller is already deopting this subtree to a runtime prefetch.
  fetchStrategy: FetchStrategy.PPR | FetchStrategy.StaticShell
): void {
  const bundle = accumulateSegmentBundle(
    now,
    task,
    route,
    tree,
    parentBundle,
    fetchStrategy,
    // The batched runtime request covers the deopted subtree; only fetch
    // Empty entries the chain would otherwise strand — never spawn
    // revalidations over settled or in-flight ones. See pingSegmentBundle.
    false
  ).bundle
  if (bundle === null) {
    return
  }
  if (tree.slots !== null) {
    for (const childTree of tree.slots.values()) {
      if (childTree.prefetchHints & PrefetchHint.ParentInlinedIntoSelf) {
        finishStaticBundleOnRuntimeBailout(
          now,
          task,
          route,
          childTree,
          bundle,
          fetchStrategy
        )
        return
      }
    }
  }
}

function pingFullSegmentRevalidation(
  now: number,
  task: PrefetchTask,
  tree: RouteTree<null>,
  fetchStrategy:
    | FetchStrategy.Full
    | FetchStrategy.PPRRuntime
    | FetchStrategy.RuntimeShell
): PendingSegmentCacheEntry | null {
  const revalidatingSegment = readOrCreateRevalidatingSegmentEntry(
    now,
    task.segmentCacheMap,
    fetchStrategy,
    tree
  )
  if (revalidatingSegment.status === EntryStatus.Empty) {
    // During a Full/PPRRuntime prefetch, a single runtime request is made for
    // all the segments that we need. So we don't initiate a request here
    // directly. By returning a pending entry from this function, it signals
    // to the caller that this segment should be included in the request
    // that's sent to the server.
    const pendingSegment = upgradeToPendingSegment(
      revalidatingSegment,
      fetchStrategy
    )
    // The upsert is handled by writeSegmentDataIntoCache
    // when the runtime request's response is written into the cache.
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
        task.segmentCacheMap,
        fetchStrategy,
        tree
      )
      const pendingSegment = upgradeToPendingSegment(
        emptySegment,
        fetchStrategy
      )
      // The upsert is handled by writeSegmentDataIntoCache
      // when the runtime request's response is written into the cache.
      return pendingSegment
    }
    switch (nonEmptyRevalidatingSegment.status) {
      case EntryStatus.Pending:
        // There's already an in-progress prefetch that includes this segment.
        // The pass needs the contents of that response, too. Wait for it
        // before the phase can complete.
        blockTaskOnPendingResponse(task, nonEmptyRevalidatingSegment)
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
        urlSearchParamsToParsedUrlQuery(
          new URLSearchParams(route.renderedSearch)
        )
      )
    )
  }
  // Non-page segments are compared using the same function as the server
  return matchSegment(cachedSegment, currentSegment)
}

/**
 * Decides whether to speculatively prefetch a subtree. Under Partial
 * Prefetching we only do this if the Link's prefetch prop is set to true —
 * otherwise the subtree relies on the shell that the Shell phase prefetches.
 */
export function needsSpeculativePrefetch(
  taskfetchStrategy: PrefetchTaskFetchStrategy,
  rootPrefetchHints: number
): boolean {
  if ((rootPrefetchHints & PrefetchHint.SubtreeHasPartialPrefetching) !== 0) {
    // PPF - only needs a speculative prefetch if this is a `<Link prefetch={true}>`.
    return taskfetchStrategy === FetchStrategy.Full
  } else {
    // non-PPF -- all prefetches are speculative.
    return true
  }
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
