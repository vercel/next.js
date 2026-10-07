import {
  compareParams,
  ParamsChange,
  getSegmentVaryPathForRequest,
  getStaticSegmentVaryPathForRequest,
} from './vary-path'
import type {
  FlightRouterState,
  CacheNode,
} from '../../../shared/lib/app-router-types'
import {
  PrefetchHint,
  StaticPrefetchDisabled,
} from '../../../shared/lib/app-router-types'
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
  type RootRouteTree,
  fetchSegmentPrefetchesUsingRuntimeRequest,
  type PendingSegmentCacheEntry,
  type SegmentCacheEntry,
  convertRouteTreeToFlightRouterState,
  doesRouteStructureMatch,
  readOrCreateRevalidatingSegmentEntry,
  upgradeToPendingSegment,
  overwriteRevalidatingSegmentCacheEntry,
  attemptToFulfillDynamicSegmentFromBFCache,
  attemptToUpgradeSegmentFromBFCache,
} from './cache'
import type { RouteCacheKey } from './cache-key'
import { createCacheKey } from './cache-key'
import { AppStage, Completeness, PrefetchPriority } from './types'
import {
  segmentCacheMap,
  getCurrentRouteCacheVersion,
  getCurrentSegmentCacheVersion,
} from './cache'
import type { CacheMap } from './cache-map'
import type { NavigationLockPrefetch } from './navigation-testing-lock'
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

  // The active render tree and head when this task was scheduled. The walks
  // compare the target route against these to decide which segments the
  // navigation would keep and which it would fetch. Compared by identity in
  // isPrefetchTaskDirty, which relies on the router state holding one
  // RootRouteTree object per committed navigation (see AppRouterState.root).
  renderTreeAtTimeOfPrefetch: RootRouteTree<CacheNode>

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
   * The stage the link asks to be prefetched up to. The scheduler turns it
   * into requests once the route tree tells it how the route is prefetched
   * (see pingRootRouteTree).
   */
  prefetchStage: AppStage

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
 * @param renderTreeAtTimeOfPrefetch The active render tree and head, and
 * their vary paths
 * @param prefetchStage The stage the link asks to be prefetched up to.
 * @param navigationLockPrefetch Testing API only. Non-null when this prefetch
 * drives a locked navigation (from `ensurePrefetchThenNavigate`); carries that
 * navigation's "wait for prefetch to fulfill" state. Null otherwise.
 */
export function schedulePrefetchTask(
  key: RouteCacheKey,
  renderTreeAtTimeOfPrefetch: RootRouteTree<CacheNode>,
  prefetchStage: AppStage,
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
    renderTreeAtTimeOfPrefetch,
    routeCacheVersion: getCurrentRouteCacheVersion(),
    segmentCacheVersion: getCurrentSegmentCacheVersion(),
    segmentCacheMap: taskSegmentCacheMap,
    priority,
    phase: PrefetchPhase.RouteTree,
    hasBackgroundWork: false,
    hasPendingResponses: false,
    spawnedRuntimePrefetches: null,
    prefetchStage,
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
  renderTreeAtTimeOfPrefetch: RootRouteTree<CacheNode>,
  prefetchStage: AppStage,
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

  task.renderTreeAtTimeOfPrefetch = renderTreeAtTimeOfPrefetch
  task.prefetchStage = prefetchStage

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
  root: RootRouteTree<CacheNode>
): boolean {
  // This is used to quickly bail out of a prefetch task if the result is
  // guaranteed to not have changed since the task was initiated. This is
  // strictly an optimization — theoretically, if it always returned true, no
  // behavior should change because a full prefetch task will effectively
  // perform the same checks.
  return (
    task.routeCacheVersion !== getCurrentRouteCacheVersion() ||
    task.segmentCacheVersion !== getCurrentSegmentCacheVersion() ||
    task.renderTreeAtTimeOfPrefetch !== root ||
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
            (route.root.tree.prefetchHints &
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
      const tree = route.root.tree

      if (
        // If Partial Prefetching is enabled anywhere on the target route,
        // every link is prefetched per segment, and the stage it asks for only
        // controls how far. In practice, this means `<Link prefetch={true}>`
        // never sends a legacy full prefetch here. You're meant to use Runtime
        // Prefetching instead — that's the new pattern that replaces
        // prefetch={true}.
        //
        // Otherwise, a link asking for the shell is prefetched per segment
        // when the route supports it.
        //
        // The reason we check for the Partial Prefetching opt-in rather than
        // the `cacheComponents` flag is to support incremental adoption.
        // `prefetch={true}` will continue to work until you opt into
        // Partial Prefetching.
        (tree.prefetchHints & PrefetchHint.SubtreeHasPartialPrefetching) !==
          0 ||
        (task.prefetchStage === AppStage.Shell &&
          route.supportsPerSegmentPrefetching)
      ) {
        // For Cache Components pages, each segment may be prefetched
        // statically or using a runtime request, based on various
        // configurations and heuristics. We'll do this in two passes: first
        // traverse the tree and perform all the static prefetches.
        //
        // Then, if there are any segments that need a runtime request,
        // do another pass to perform a runtime prefetch.

        // Pick the stage to prefetch up to on this pass. During the Shell
        // phase, we request each segment's shell (keyed at the shell vary
        // paths). Otherwise, we go up to the stage the link asked for. This is
        // the only place we look at the phase. Everything below just uses the
        // stage.
        let walkStage: AppStage
        if (task.phase === PrefetchPhase.Shell) {
          walkStage = AppStage.Shell
        } else {
          switch (task.prefetchStage) {
            case AppStage.Shell:
              // Under Partial Prefetching, a link asking for the shell is
              // done after the Shell phase.
              if (walkCanUseRuntimeRequests(route)) {
                return PrefetchTaskExitStatus.Done
              }
              // Without it, we go up to the prefetch stage, which gets the
              // whole static prerender.
              walkStage = AppStage.Prefetch
              break
            case AppStage.Prefetch:
            case AppStage.Navigation:
              walkStage = task.prefetchStage
              break
          }
        }

        // The head is a one-node tree next to the route tree (see
        // createMetadataRouteTree). We prefetch it like any segment the
        // current page doesn't have. If the head was inlined into a page's
        // bundle (HeadOutlined isn't set on the root), skip it here. It will
        // arrive with that page's response, and that page's entries tell us
        // whether it needs a runtime request.
        const head = route.root.head
        if (
          !process.env.__NEXT_PREFETCH_INLINING ||
          (route.root.tree.prefetchHints & PrefetchHint.HeadOutlined) !== 0 ||
          // An inlined head that can't try a static request still needs the
          // runtime request (see pingSegmentInCacheComponentsTree). We only
          // skip the static request for an inlined head.
          (walkCanUseRuntimeRequests(route) &&
            !shouldSegmentAttemptStaticRequest(walkStage, head))
        ) {
          const headExitStatus = pingNewPartOfCacheComponentsTree(
            now,
            task,
            route,
            head,
            null,
            walkStage
          )
          if (headExitStatus === PrefetchTaskExitStatus.InProgress) {
            return PrefetchTaskExitStatus.InProgress
          }
        }

        const exitStatus = pingSharedPartOfCacheComponentsTree(
          now,
          task,
          route,
          task.renderTreeAtTimeOfPrefetch.tree,
          tree,
          null,
          walkStage
        )
        if (exitStatus === PrefetchTaskExitStatus.InProgress) {
          // Child yielded without finishing.
          return PrefetchTaskExitStatus.InProgress
        }

        // `pingSegmentInCacheComponentsTree` may have determined that
        // we need to do a runtime prefetch for one or more segments.
        // Bail out early if runtime prefetches are not permitted for this route.
        if (walkCanUseRuntimeRequests(route)) {
          // The runtime request goes up to the same stage as this pass.
          //
          // The traversal above filled in spawnedRuntimePrefetches with every
          // subtree in the new part of the tree that needs a runtime
          // prefetch. That includes the head, under its own request key, if
          // its static request wasn't enough or never happened.
          //
          // If it's null, nothing in the new part of the tree needs a runtime
          // prefetch, so we don't fetch the head either. We only runtime
          // prefetch the head if something else needs it.
          const spawnedRuntimePrefetches = task.spawnedRuntimePrefetches
          if (spawnedRuntimePrefetches !== null) {
            const spawnedEntries = new Map<
              SegmentRequestKey,
              PendingSegmentCacheEntry
            >()
            // The head has no position in the request tree — a runtime
            // response carries it beside the segments (see
            // writeServerResponseIntoCache in cache.ts) — so the head's
            // own request tree is discarded.
            pingRouteTreeAndIncludeDynamicData(
              now,
              task,
              route,
              head,
              false,
              spawnedEntries,
              walkStage,
              Completeness.CacheComplete
            )
            const requestTree = pingRuntimePrefetches(
              now,
              task,
              route,
              tree,
              spawnedRuntimePrefetches,
              spawnedEntries,
              walkStage
            )
            if (spawnedEntries.size > 0) {
              spawnPrefetchSubtask(
                fetchSegmentPrefetchesUsingRuntimeRequest(
                  task,
                  route,
                  walkStage,
                  Completeness.CacheComplete,
                  requestTree,
                  spawnedEntries
                )
              )
            }
          }
        }

        return PrefetchTaskExitStatus.Done
      }

      if (task.phase === PrefetchPhase.Shell) {
        // Shell phase only does work on routes prefetched per segment above.
        // Legacy dynamic prefetches are Shell no-ops and fall through to
        // Speculative.
        return PrefetchTaskExitStatus.Done
      }
      // Otherwise, fall back to a legacy dynamic prefetch: the
      // loading-boundary prefetch when the link asks for the shell (the route
      // can't be prefetched per segment), otherwise the legacy full prefetch.
      const legacyStage =
        task.prefetchStage === AppStage.Shell
          ? AppStage.Shell
          : AppStage.Navigation
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
      // The head has no position in the request tree — a runtime response
      // carries it beside the segments (see writeServerResponseIntoCache
      // in cache.ts) — so the head's own request tree is discarded.
      const head = route.root.head
      pingRouteTreeAndIncludeDynamicData(
        now,
        task,
        route,
        head,
        false,
        spawnedEntries,
        // The head always uses the legacy full prefetch: it has no loading
        // boundary, so a loading-boundary request would skip it.
        AppStage.Navigation,
        Completeness.FullyComplete
      )
      const dynamicRequestTree = diffRouteTreeAgainstCurrent(
        now,
        task,
        route,
        task.renderTreeAtTimeOfPrefetch.tree,
        tree,
        spawnedEntries,
        legacyStage
      )
      let needsDynamicRequest = spawnedEntries.size > 0
      if (needsDynamicRequest) {
        spawnPrefetchSubtask(
          fetchSegmentPrefetchesUsingRuntimeRequest(
            task,
            route,
            legacyStage,
            Completeness.FullyComplete,
            dynamicRequestTree,
            spawnedEntries
          )
        )
      }
      return PrefetchTaskExitStatus.Done
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
 * Whether the task can use runtime requests to prefetch the content.
 *
 * This is true for every walk of a route that opts into Partial Prefetching
 * (any segment with a partial-prefetching config, or the global `partialPrefetching`
 * flag, indicated by `SubtreeHasPartialPrefetching` on the route root),
 * in both the Shell and Speculative phases.
 *
 * Note that this does not mean that the route *will* use runtime requests --
 * it might be optimized statically, either because it does not use runtime data
 * in the shell/prefetch, or if it's forced to use static requests by
 * `export const ensureStatic = "shell" | "prefetch" | "navigation"`.
 *
 * Routes without Partial Prefetching never use runtime requests for prefetches
 * (excluding legacy dynamic prefetches)
 */
function walkCanUseRuntimeRequests(route: FulfilledRouteCacheEntry): boolean {
  return (
    (route.root.tree.prefetchHints &
      PrefetchHint.SubtreeHasPartialPrefetching) !==
    0
  )
}

/**
 * Whether a static request for this segment should be attempted.
 * This may vary on the walk's stage, because we might e.g.
 * have a shell that's static, but a prefetch that requires runtime requests.
 *
 * NOTE: Should only be used on Partial Prefetching routes, where
 * `walkCanUseRuntimeRequests` is true.
 * */
function shouldSegmentAttemptStaticRequest(
  walkStage: AppStage,
  tree: RouteTree<any>
): boolean {
  const { prefetchHints } = tree
  switch (walkStage) {
    case AppStage.Shell:
      return (prefetchHints & PrefetchHint.ShouldAttemptStaticShell) !== 0
    case AppStage.Prefetch:
      return (prefetchHints & PrefetchHint.ShouldAttemptStaticPrefetch) !== 0
    case AppStage.Navigation:
      // The hints don't track runtime data read after `navigation()`, so we
      // use the prefetch stage's hint. The static response's `u` then tells
      // us whether we still need a runtime request.
      return (prefetchHints & PrefetchHint.ShouldAttemptStaticPrefetch) !== 0
    default:
      walkStage satisfies never
      return false
  }
}

/**
 * Whether an entry has what a prefetch needs: at least the given stage, and
 * at least the given completeness at that stage. For a pending entry, we
 * check what we expect its request to return.
 *
 * With Partial Prefetching, a prefetch up to some stage needs that stage,
 * cache complete. Without it, a static prefetch needs the navigation stage,
 * and doesn't care about runtime data. A legacy prefetch needs the
 * navigation stage, fully complete. We use this to decide whether to send a
 * request. Picking between two entries once a response arrives is a separate
 * question (see isExistingSegmentEntryPreferred).
 */
function doesEntrySatisfyPrefetch(
  entry: SegmentCacheEntry,
  stage: AppStage,
  completeness: Completeness
): boolean {
  return entry.stage >= stage && entry.completeness >= completeness
}

/**
 * Whether to try a static request for a segment with a shell-stage entry,
 * before falling back to a runtime request. Having only the shell doesn't
 * tell us a static request would be pointless. (That's different from an
 * entry that came from a static prerender, where asking again would return
 * the same bytes.) So if the segment's hint says a static request is worth
 * trying (the build-time prerender didn't read runtime data), we try it, and
 * its response tells us whether we still need a runtime request.
 *
 * We check the revalidation slot so that a static request that already
 * finished without improving the entry doesn't hold off the runtime request
 * forever. That happens if it was rejected (a server miss or network error),
 * or if its response lost to the existing entry. (If it wins, it replaces
 * the shell-stage entry, and the caller reads that instead.) Reading the
 * slot creates an Empty placeholder the first time, because there's no
 * read-only version. That's fine: if we do try the request, it uses the same
 * slot.
 */
function isShellEntryEligibleForStaticAttempt(
  now: number,
  map: CacheMap<SegmentCacheEntry>,
  entry: SegmentCacheEntry,
  tree: RouteTree<null>,
  walkStage: AppStage
): boolean {
  if (walkStage === AppStage.Shell) {
    // A shell prefetch never tries a static request for a shell entry. A
    // static request can only improve an entry at an earlier stage than the
    // one it returns. Otherwise a stale hint could make the same static
    // request win its own tie forever.
    return false
  }
  if (entry.stage !== AppStage.Shell) {
    return false
  }
  if (!shouldSegmentAttemptStaticRequest(AppStage.Prefetch, tree)) {
    return false
  }
  const revalidatingEntry = readOrCreateRevalidatingSegmentEntry(
    now,
    map,
    getSegmentVaryPathForRequest(AppStage.Navigation, tree),
    getStaticSegmentVaryPathForRequest(AppStage.Navigation, tree)
  )
  return (
    revalidatingEntry.status === EntryStatus.Empty ||
    revalidatingEntry.status === EntryStatus.Pending
  )
}

/**
 * Register a subtree root (the head is one, under its own request key) for
 * the batched runtime request issued by the gate at the end of
 * pingRootRouteTree.
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

// TODO: Rename dynamic -> runtime throughout this module

/**
 * The static walk over the part of the target route that also exists on the
 * current page: the current page's node and the target route's node at the
 * same position in the tree. It mirrors the navigation's traversal order (see
 * updateRenderTreeOnNavigation in render-tree.ts): first whether the route
 * position still matches — if not, this node begins the new part of the route
 * (pingNewPartOfCacheComponentsTree) — and then whether any of the node's
 * param values changed — if so, the node and everything below it begin the
 * new part of the route too. The walk does not consult which params a
 * segment read, so it prefetches more than the navigation replaces: the
 * navigation keeps data whose read params did not change and decides each
 * descendant on its own. A node the walk keeps gets the ordinary static
 * prefetch-stage request.
 * Its children continue here wherever the current page has a child in the
 * same slot; a child in a slot the current page doesn't have enters the new
 * part of the route directly.
 *
 * A bundle can't span two stages. A kept node is prefetched up to the
 * prefetch stage, but during the Shell phase the new part is only prefetched
 * up to the shell. A bundle with both would fulfill the kept node's entry
 * with shell data. We also can't finish the bundle by fetching the new node
 * up to the prefetch stage, because that would prefetch past the shell
 * during the Shell phase, which only the Speculative phase is allowed to do.
 * So during the Shell phase, we drop the bundle wherever we move into the new
 * part, just like pingSegmentInCacheComponentsTree does. Nothing in a dropped
 * bundle was made Pending, so no entry gets stuck, and the Speculative pass
 * fetches the kept data later.
 */
function pingSharedPartOfCacheComponentsTree(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  currentTree: RouteTree<CacheNode>,
  newTree: RouteTree<null>,
  parentBundle: SegmentBundle | null,
  // The stage this pass prefetches up to (see pingRootRouteTree).
  walkStage: AppStage
): PrefetchTaskExitStatus.InProgress | PrefetchTaskExitStatus.Done {
  if (!doesRouteStructureMatch(currentTree, newTree)) {
    // We're entering the part of the target route that doesn't exist on the
    // current page.
    return pingNewPartOfCacheComponentsTree(
      now,
      task,
      route,
      newTree,
      walkStage === AppStage.Shell ? null : parentBundle,
      walkStage
    )
  }
  if (
    compareParams(currentTree.varyPath, newTree.varyPath) !== ParamsChange.None
  ) {
    // A param changed. The navigation replaces only the data that read it and
    // decides each descendant on its own (see updateRenderTreeOnNavigation in
    // render-tree.ts); this walk doesn't know what each segment read, so it
    // prefetches the whole subtree.
    return pingNewPartOfCacheComponentsTree(
      now,
      task,
      route,
      newTree,
      walkStage === AppStage.Shell ? null : parentBundle,
      walkStage
    )
  }

  // The navigation keeps this segment's current data. A kept segment always
  // gets the normal static request up to the prefetch stage, whatever the
  // phase. Shell requests, static or runtime, only apply to the new part of
  // the tree, so this pass's stage doesn't matter here. (We also ignore
  // whether it needs a runtime request. A kept segment is already rendered
  // on the current page, so a runtime prefetch has nothing to add.)
  const bundleInProgress = accumulateSegmentBundle(
    now,
    task,
    route,
    newTree,
    parentBundle,
    AppStage.Prefetch,
    true
  ).bundle

  // Recursively ping the children, continuing in lockstep with the current
  // page wherever it has a child in the same slot.
  const newTreeChildren = newTree.slots
  if (newTreeChildren !== null) {
    const currentSlots = currentTree.slots
    for (const [parallelRouteKey, newTreeChild] of newTreeChildren) {
      if (!hasNetworkBandwidth(task)) {
        // Stop prefetching segments until there's more bandwidth.
        return PrefetchTaskExitStatus.InProgress
      }
      // Only pass the bundle to the child that accepts it. A parent is
      // only ever bundled into one child.
      const bundleForChild =
        process.env.__NEXT_PREFETCH_INLINING &&
        bundleInProgress !== null &&
        newTreeChild.prefetchHints & PrefetchHint.ParentInlinedIntoSelf
          ? bundleInProgress
          : null
      let currentTreeChild: RouteTree<CacheNode> | undefined = undefined
      if (currentSlots !== null) {
        currentTreeChild = currentSlots.get(parallelRouteKey)
      }
      let childExitStatus:
        | PrefetchTaskExitStatus.InProgress
        | PrefetchTaskExitStatus.Done
      if (currentTreeChild !== undefined) {
        childExitStatus = pingSharedPartOfCacheComponentsTree(
          now,
          task,
          route,
          currentTreeChild,
          newTreeChild,
          bundleForChild,
          walkStage
        )
      } else {
        childExitStatus = pingNewPartOfCacheComponentsTree(
          now,
          task,
          route,
          newTreeChild,
          walkStage === AppStage.Shell ? null : bundleForChild,
          walkStage
        )
      }
      if (childExitStatus === PrefetchTaskExitStatus.InProgress) {
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

/**
 * The static walk over the part of the target route that doesn't exist on
 * the current page. Nothing here is compared against the current tree: every
 * segment goes through the per-segment decision point.
 */
function pingNewPartOfCacheComponentsTree(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree<null>,
  parentBundle: SegmentBundle | null,
  // The stage this pass prefetches up to (see pingRootRouteTree).
  walkStage: AppStage
): PrefetchTaskExitStatus.InProgress | PrefetchTaskExitStatus.Done {
  const accumulation = pingSegmentInCacheComponentsTree(
    now,
    task,
    route,
    tree,
    parentBundle,
    walkStage
  )
  if (accumulation === null) {
    return PrefetchTaskExitStatus.Done
  }
  const bundleInProgress = accumulation.bundle

  // Recursively ping the children.
  const treeChildren = tree.slots
  if (treeChildren !== null) {
    for (const treeChild of treeChildren.values()) {
      if (!hasNetworkBandwidth(task)) {
        // Stop prefetching segments until there's more bandwidth.
        return PrefetchTaskExitStatus.InProgress
      }
      // Only pass the bundle to the child that accepts it. A parent is
      // only ever bundled into one child.
      const bundleForChild =
        process.env.__NEXT_PREFETCH_INLINING &&
        bundleInProgress !== null &&
        treeChild.prefetchHints & PrefetchHint.ParentInlinedIntoSelf
          ? bundleInProgress
          : null
      const childExitStatus = pingNewPartOfCacheComponentsTree(
        now,
        task,
        route,
        treeChild,
        bundleForChild,
        walkStage
      )
      if (childExitStatus === PrefetchTaskExitStatus.InProgress) {
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

/**
 * The per-segment decision point of the static walk: the one place that
 * decides how a segment in the new part of the route — one the navigation
 * won't keep — is prefetched (pingNewPartOfCacheComponentsTree).
 *
 * When Cache Components is enabled (or PPR, or a fully static route when PPR
 * is disabled; those cases are treated equivalently to Cache Components), we
 * prefetch each segment individually, statically, up to the stage this pass
 * prefetches to (see pingRootRouteTree).
 *
 * This is where we decide whether we should use runtime requests, if the walk
 * is allowed to do so (see `walkCanUseRuntimeRequests`).
 *
 * If runtime requests are allowed, but the segment's node has one of the
 * `ShouldAttemptStatic{Shell,Prefetch}` hints set (either because the build-time
 * prerender accessed no runtime data, or because of `ensureStatic`), then its
 * subtree should be prefetched statically first.
 * However, the hint may be stale after a revalidation, so we'll also check the
 * `needsRuntimeRequest` promise on the static response, and will follow up with
 * a runtime request if needed.
 * Pending responses block the task, so the attempt is serial, never raced:
 * static attempt → observe → runtime (if needed).
 *
 * The static hints and `needsRuntimeRequest` have no effect if runtime requests
 * are not allowed (i.e. outside of Partial Prefetching).
 *
 * Returns the segment's bundle if we should keep going into its children.
 * Returns null if we stop at this segment, because it needs a runtime
 * request, and that request covers the whole subtree.
 */
function pingSegmentInCacheComponentsTree(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree<null>,
  parentBundle: SegmentBundle | null,
  // The stage this pass prefetches up to (see pingRootRouteTree).
  walkStage: AppStage
): { bundle: SegmentBundle | null; needsRuntimeRequest: boolean } | null {
  // Constant for the whole pass; recomputed here only because the walk is
  // recursive and the check is cheap.
  const canUseRuntimeRequests = walkCanUseRuntimeRequests(route)

  // A force-disabled segment deliberately does NOT deopt here: disabling
  // prefetch is passive. It never initiates a request — its accumulation
  // below contributes nothing — and must never be the reason a runtime
  // prefetch spawns, though it may ride along in a runtime response issued
  // on another segment's behalf.

  if (
    canUseRuntimeRequests &&
    !shouldSegmentAttemptStaticRequest(walkStage, tree)
  ) {
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
        walkStage
      )
    }
    return null
  }

  // Prefetch this segment and its subtree statically, using the normal
  // static bundling walk.
  const accumulation = accumulateSegmentBundle(
    now,
    task,
    route,
    tree,
    parentBundle,
    walkStage,
    true
  )

  if (canUseRuntimeRequests && accumulation.needsRuntimeRequest) {
    // The static attempt for this segment was insufficient. Stop the walk
    // and deopt — the runtime prefetch covers the whole subtree. (Unlike the
    // direct deopt above, any open bundle is dropped rather than finished: a
    // fulfilled InlinedIntoChild node can report a true signal while its
    // chain is still open. That's safe — nothing in an un-pinged chain was
    // upgraded to Pending, so no entry is stranded blocking the task, and
    // Empty entries in the dropped chain are re-fetched by a later pass.)
    addSpawnedRuntimePrefetch(task, tree.requestKey)
    return null
  }

  return accumulation
}

function diffRouteTreeAgainstCurrent(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  oldTree: RouteTree<CacheNode>,
  newTree: RouteTree<null>,
  spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry>,
  // The legacy dynamic prefetch's stage: Shell for the loading-boundary
  // prefetch, Navigation for the legacy full prefetch.
  legacyStage: AppStage.Shell | AppStage.Navigation
): FlightRouterState {
  // This is a single recursive traversal that does multiple things:
  // - Finds the segments that differ from the current route, comparing each
  //   segment the same way the navigation will (see
  //   updateRenderTreeOnNavigation in render-tree.ts): its route position,
  //   then whether any of its param values changed.
  // - Constructs a request tree (FlightRouterState) that describes which
  //   segments need to be prefetched and which ones are already cached.
  // - Creates a set of pending cache entries for the segments that need to
  //   be prefetched, so that a subsequent prefetch task does not request the
  //   same segments again.
  const oldSlots = oldTree.slots
  const newTreeChildren = newTree.slots
  let requestTreeChildren: Record<string, FlightRouterState> = {}
  if (newTreeChildren !== null) {
    for (const [parallelRouteKey, newTreeChild] of newTreeChildren) {
      const oldTreeChild = oldSlots?.get(parallelRouteKey)
      requestTreeChildren[parallelRouteKey] = diffSegmentAgainstCurrent(
        now,
        task,
        route,
        oldTreeChild,
        newTreeChild,
        spawnedEntries,
        legacyStage
      )
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

/**
 * The per-segment decision of a runtime request's tree walk
 * (diffRouteTreeAgainstCurrent): the segment at this position of the target
 * route, and the current page's segment at the same position, if it has one.
 * A segment the navigation keeps — same route position, and none of its param
 * values changed — is omitted from the request and the walk continues into
 * its children. Otherwise this segment begins a part of the tree that needs
 * to be prefetched (unless everything is already cached), requested according
 * to the legacy dynamic prefetch's stage.
 */
function diffSegmentAgainstCurrent(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  oldTree: RouteTree<CacheNode> | undefined,
  newTree: RouteTree<null>,
  spawnedEntries: Map<SegmentRequestKey, PendingSegmentCacheEntry>,
  legacyStage: AppStage.Shell | AppStage.Navigation
): FlightRouterState {
  if (oldTree !== undefined && doesRouteStructureMatch(oldTree, newTree)) {
    // This segment is already part of the current route.
    if (
      compareParams(oldTree.varyPath, newTree.varyPath) === ParamsChange.None
    ) {
      // The navigation keeps its data. Keep traversing.
      return diffRouteTreeAgainstCurrent(
        now,
        task,
        route,
        oldTree,
        newTree,
        spawnedEntries,
        legacyStage
      )
    }
  }
  // This segment is not part of the current route, or the navigation
  // replaces its data. We're entering a part of the tree that we need to
  // prefetch (unless everything is already cached).
  switch (legacyStage) {
    case AppStage.Shell: {
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
        (newTree.prefetchHints &
          (PrefetchHint.SegmentHasLoadingBoundary |
            PrefetchHint.SubtreeHasLoadingBoundary)) !==
        0
      if (subtreeHasLoadingBoundary) {
        return pingPPRDisabledRouteTreeUpToLoadingBoundary(
          now,
          task,
          route,
          newTree,
          null,
          spawnedEntries
        )
      }
      // There's no loading boundary within this tree. Bail out.
      return convertRouteTreeToFlightRouterState(newTree)
    }
    case AppStage.Navigation: {
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
      return pingRouteTreeAndIncludeDynamicData(
        now,
        task,
        route,
        newTree,
        false,
        spawnedEntries,
        AppStage.Navigation,
        Completeness.FullyComplete
      )
    }
  }
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

  const varyPath = getSegmentVaryPathForRequest(AppStage.Navigation, tree)
  const segment = readOrCreateSegmentCacheEntry(
    now,
    task.segmentCacheMap,
    varyPath,
    varyPath
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
      // The server might not include it in the response. The server stops at
      // the first loading boundary, so we only expect the shell, not the
      // navigation stage.
      const pendingSegment = upgradeToPendingSegment(
        segment,
        AppStage.Shell,
        Completeness.FullyComplete
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
  // What we expect the request to return, which is also what this prefetch
  // needs. For a runtime prefetch, that's this pass's stage, cache complete.
  // For the legacy full prefetch, it's the navigation stage, fully complete.
  stage: AppStage,
  completeness: Completeness
): FlightRouterState {
  // The tree we're constructing is the same shape as the tree we're navigating
  // to. But even though this is a "new" tree, some of the individual segments
  // may be cached as a result of other route prefetches.
  //
  // So we need to find the first uncached segment along each path add an
  // explicit "refetch" marker so the server knows where to start rendering.
  // Once the server starts rendering along a path, it keeps rendering the
  // entire subtree.
  // Use this request's stage for the key, not the stage the task asked for.
  // A task that asks for the shell can still have segments that always use
  // runtime prefetching (via `export const prefetch`), and those should look
  // for entries that include search params.
  const varyPath = getSegmentVaryPathForRequest(stage, tree)
  const segment = readOrCreateSegmentCacheEntry(
    now,
    task.segmentCacheMap,
    varyPath,
    varyPath
  )

  let spawnedSegment: PendingSegmentCacheEntry | null = null

  switch (segment.status) {
    case EntryStatus.Empty: {
      // This segment is not cached.
      if (completeness === Completeness.FullyComplete) {
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
      spawnedSegment = upgradeToPendingSegment(segment, stage, completeness)
      break
    }
    case EntryStatus.Fulfilled: {
      // The segment is already cached.
      if (!doesEntrySatisfyPrefetch(segment, stage, completeness)) {
        // The cached segment doesn't satisfy this request. This means we're
        // in one of these cases:
        //   - we have a static prefetch, and we're doing a runtime prefetch
        //   - we have a static or runtime prefetch, and we're doing a legacy
        //     full prefetch (or a navigation).
        // In either case, we need to include it in the request to get a more
        // complete version. However, if there's a non-stale bfcache
        // entry from a previous navigation, prefer that over making a new
        // request.
        if (completeness === Completeness.FullyComplete) {
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
          stage,
          completeness
        )
      }
      break
    }
    case EntryStatus.Pending:
    case EntryStatus.Rejected: {
      // There's either another prefetch currently in progress, or the previous
      // attempt failed. If it wouldn't satisfy this request, fetch it again.
      if (!doesEntrySatisfyPrefetch(segment, stage, completeness)) {
        spawnedSegment = pingFullSegmentRevalidation(
          now,
          task,
          tree,
          stage,
          completeness
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
          stage,
          completeness
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
  // The walk's stage, which the runtime request runs at.
  stage: AppStage
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
      stage,
      Completeness.CacheComplete
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
        stage
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
 * Returns true if an entry in the bundle doesn't have what this prefetch
 * needs, and needs a runtime request. The callers pass this up to
 * pingSegmentInCacheComponentsTree, which uses it to decide whether to fall
 * back to a runtime prefetch. There's one exception: if a cache-complete
 * shell-stage entry's segment has the static-attempt hint, we try a static
 * request up to the prefetch stage first, and return false for now (see the
 * Pending and Fulfilled case).
 */
function pingSegmentBundle(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  routeKey: RouteCacheKey,
  tree: RouteTree<null>,
  segments: SegmentBundle,
  // The stage this pass prefetches up to (see pingRootRouteTree).
  walkStage: AppStage,
  // False when finishing an open bundle chain on a runtime-prefetch bailout
  // (finishStaticBundleOnRuntimeBailout). The finish exists only to fetch
  // data the batched runtime request won't cover — Empty entries in the
  // chain — so it must not spawn revalidations over entries that are
  // already settled or in flight: the chain's terminal segments are inside
  // the deopted subtree, and re-fetching their static bundle would at best
  // duplicate the runtime request and at worst replace a runtime-complete
  // entry (e.g. a runtime shell entry) with a less complete static
  // fallback response.
  spawnRevalidations: boolean
): boolean {
  // What we expect the bundle's static request to return. During the Shell
  // phase that's the shell. Otherwise it's the whole prerender, which goes
  // through the navigation stage. The completeness depends on the mode, the
  // same way it does when we write the response. With Cache Components but
  // without Partial Prefetching, a static payload always needs runtime data.
  // With Partial Prefetching, we only send a static request when the hint
  // says the prerender didn't read runtime data. Without Cache Components,
  // static is all there is.
  const requestStage =
    walkStage === AppStage.Shell ? AppStage.Shell : AppStage.Navigation
  const requestCompleteness =
    process.env.__NEXT_CACHE_COMPONENTS && !walkCanUseRuntimeRequests(route)
      ? Completeness.NeedsRuntime
      : Completeness.CacheComplete
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
        const pendingEntry = upgradeToPendingSegment(
          nodeEntry,
          requestStage,
          requestCompleteness
        )
        if (spawnedEntries === null) {
          spawnedEntries = new Map()
        }
        spawnedEntries.set(nodeTree.requestKey, pendingEntry)
        // The pass blocks on every request it spawns, not just requests it
        // finds already in flight.
        blockTaskOnPendingResponse(task, pendingEntry)
        break
      }
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
          walkStage !== AppStage.Shell &&
          // A rejected entry keeps what its request was expected to return.
          // Only retry if that wouldn't have been enough for this prefetch.
          !(walkCanUseRuntimeRequests(route)
            ? doesEntrySatisfyPrefetch(
                nodeEntry,
                walkStage,
                Completeness.CacheComplete
              )
            : doesEntrySatisfyPrefetch(
                nodeEntry,
                AppStage.Navigation,
                Completeness.NeedsRuntime
              ))
        ) {
          const revalidatingEntry = readOrCreateRevalidatingSegmentEntry(
            now,
            task.segmentCacheMap,
            getSegmentVaryPathForRequest(requestStage, nodeTree),
            getStaticSegmentVaryPathForRequest(requestStage, nodeTree)
          )
          if (revalidatingEntry.status === EntryStatus.Empty) {
            const pendingEntry = upgradeToPendingSegment(
              revalidatingEntry,
              requestStage,
              requestCompleteness
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
      case EntryStatus.Pending:
      case EntryStatus.Fulfilled: {
        // For a pending entry, we check what we expect its request to
        // return.
        //
        // If this is the speculative phase (not the shell phase), check if we
        // should attempt to upgrade a fallback ISR response to a concrete
        // version. (Only a fulfilled entry can be one.)
        const isUpgradeableISRFallbackRetry =
          walkStage !== AppStage.Shell &&
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

        if (walkCanUseRuntimeRequests(route)) {
          // With Partial Prefetching, we're only done with this segment once
          // its entry is cache complete up to this pass's stage.
          if (
            doesEntrySatisfyPrefetch(
              nodeEntry,
              walkStage,
              Completeness.CacheComplete
            )
          ) {
            if (nodeEntry.status === EntryStatus.Pending) {
              // The in-flight response will have what we need. Wait for it
              // before the phase can complete.
              blockTaskOnPendingResponse(task, nodeEntry)
              break
            }
            // Nothing to fill, unless it's an ISR fallback to upgrade.
            if (!isUpgradeableISRFallbackRetry) {
              break
            }
          } else if (
            // An entry that needs runtime data gets a runtime request,
            // whatever the hints say, because if the shell read runtime data,
            // later stages do too. A cache-complete entry at an earlier stage
            // gets one too, unless we can try a static request first.
            nodeEntry.completeness === Completeness.NeedsRuntime ||
            !isShellEntryEligibleForStaticAttempt(
              now,
              task.segmentCacheMap,
              nodeEntry,
              nodeTree,
              walkStage
            )
          ) {
            // Return it, so the caller can switch this subtree to a runtime
            // prefetch. The runtime request covers this segment, so a static
            // request would at best duplicate it, and at worst replace runtime
            // content with static content. We don't wait for an in-flight
            // entry. The runtime request goes out in parallel.
            needsRuntimeRequest = true
            break
          } else {
            // For this shell-stage entry, we try a static request (the
            // revalidation below) before falling back to a runtime request
            // (see isShellEntryEligibleForStaticAttempt). So we don't ask for
            // a runtime request on this pass. The static request blocks the
            // task, and the next pass reads its result. It won't happen
            // twice: its response is recorded at the navigation stage, so
            // the entry isn't at the shell stage anymore. And if it finished
            // without improving the entry, the entry isn't eligible anymore,
            // so we send the runtime request after all.
          }
        } else {
          // Without Partial Prefetching, a static request is the only kind we
          // can make. Upgrade any entry that doesn't have what we need right
          // now, without putting it off, because the whole point of the
          // Speculative phase is to bring the cache up to the link's stage.
          if (nodeEntry.status === EntryStatus.Pending) {
            // The pass depends on the in-flight response. Wait for it before
            // the phase can complete.
            blockTaskOnPendingResponse(task, nodeEntry)
          }
          if (
            doesEntrySatisfyPrefetch(
              nodeEntry,
              AppStage.Navigation,
              Completeness.NeedsRuntime
            ) &&
            !isUpgradeableISRFallbackRetry
          ) {
            break
          }
        }

        if (spawnRevalidations) {
          const revalidatingEntry = readOrCreateRevalidatingSegmentEntry(
            now,
            task.segmentCacheMap,
            getSegmentVaryPathForRequest(requestStage, nodeTree),
            getStaticSegmentVaryPathForRequest(requestStage, nodeTree)
          )
          if (revalidatingEntry.status === EntryStatus.Empty) {
            const pendingEntry = upgradeToPendingSegment(
              revalidatingEntry,
              requestStage,
              requestCompleteness
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
              // needs no waiting and is not a prefetch failure. It can't leave
              // an eligible shell-stage entry stuck either, because
              // isShellEntryEligibleForStaticAttempt reads the slot. Once the
              // static request finishes, the entry isn't eligible anymore,
              // and we send the runtime request above.)
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
        requestStage
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
  // The stage this pass prefetches up to (see pingRootRouteTree). During the
  // Shell phase it's Shell, and the entries are keyed at the shell vary paths.
  walkStage: AppStage,
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
    getSegmentVaryPathForRequest(walkStage, tree),
    getStaticSegmentVaryPathForRequest(walkStage, tree)
  )

  if (
    process.env.__NEXT_PREFETCH_INLINING &&
    tree.prefetchHints & PrefetchHint.InlinedIntoChild
  ) {
    if (
      segment.status === EntryStatus.Pending &&
      // With Partial Prefetching, we only wait on an in-flight response that
      // will have what we need, like in pingSegmentBundle.
      (!walkCanUseRuntimeRequests(route) ||
        doesEntrySatisfyPrefetch(
          segment,
          walkStage,
          Completeness.CacheComplete
        ))
    ) {
      // The chain this entry joins may be dropped before it's ever pinged
      // (see the drop sites in pingSegmentInCacheComponentsTree), and only
      // the ping blocks on Pending entries. Register on the in-flight
      // response at read time instead, so the pass observes it before the
      // phase can complete even if the chain is dropped. When the chain does
      // get pinged, the ping's own registration dedupes against this one.
      blockTaskOnPendingResponse(task, segment)
    }
    return {
      bundle: { tree, entry: segment, parent: parentBundle },
      // We don't ping the bundle here, but this node's own entry might
      // already not have what we need. Report that directly. The bundle ping
      // only reports back to the segment at the end of the chain, and if that
      // segment decides for its own subtree, the ancestor above this node
      // would never find out. The same exception applies as in
      // pingSegmentBundle: for an eligible shell-stage entry, we don't ask
      // for a runtime request yet, because the bundle ping will try a static
      // request for this node first. The caller only uses this with Partial
      // Prefetching.
      needsRuntimeRequest:
        (segment.status === EntryStatus.Pending ||
          segment.status === EntryStatus.Fulfilled) &&
        !doesEntrySatisfyPrefetch(
          segment,
          walkStage,
          Completeness.CacheComplete
        ) &&
        (segment.completeness === Completeness.NeedsRuntime ||
          !isShellEntryEligibleForStaticAttempt(
            now,
            task.segmentCacheMap,
            segment,
            tree,
            walkStage
          )),
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
      tree: route.root.head,
      entry: readOrCreateSegmentCacheEntry(
        now,
        task.segmentCacheMap,
        getSegmentVaryPathForRequest(walkStage, route.root.head),
        getStaticSegmentVaryPathForRequest(walkStage, route.root.head)
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
    walkStage,
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
  // The same walk stage the parent bundle was accumulated with.
  // Any needs-runtime signal from finishing the bundle is dropped: the
  // caller is already deopting this subtree to a runtime prefetch.
  walkStage: AppStage
): void {
  const bundle = accumulateSegmentBundle(
    now,
    task,
    route,
    tree,
    parentBundle,
    walkStage,
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
          walkStage
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
  // What the request is expected to deliver.
  stage: AppStage,
  completeness: Completeness
): PendingSegmentCacheEntry | null {
  const varyPath = getSegmentVaryPathForRequest(stage, tree)
  const revalidatingSegment = readOrCreateRevalidatingSegmentEntry(
    now,
    task.segmentCacheMap,
    varyPath,
    varyPath
  )
  if (revalidatingSegment.status === EntryStatus.Empty) {
    // During a runtime or legacy full prefetch, a single request is made for
    // all the segments that we need. So we don't initiate a request here
    // directly. By returning a pending entry from this function, it signals
    // to the caller that this segment should be included in the request
    // that's sent to the server.
    const pendingSegment = upgradeToPendingSegment(
      revalidatingSegment,
      stage,
      completeness
    )
    // The upsert is handled by writeSegmentDataIntoCache
    // when the runtime request's response is written into the cache.
    return pendingSegment
  } else {
    // There's already a revalidation in progress.
    const nonEmptyRevalidatingSegment = revalidatingSegment
    if (
      !doesEntrySatisfyPrefetch(
        nonEmptyRevalidatingSegment,
        stage,
        completeness
      )
    ) {
      // The existing revalidation wouldn't satisfy this request. Reset it and
      // start a new revalidation.
      const emptySegment = overwriteRevalidatingSegmentCacheEntry(
        now,
        task.segmentCacheMap,
        varyPath
      )
      const pendingSegment = upgradeToPendingSegment(
        emptySegment,
        stage,
        completeness
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
