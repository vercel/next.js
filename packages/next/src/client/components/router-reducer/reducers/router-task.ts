import type { FlightRouterState } from '../../../../shared/lib/app-router-types'
import { invalidateBfCache } from '../../segment-cache/bfcache'
import {
  EntryStatus,
  readRouteCacheEntry,
  requestOptimisticRouteCacheEntry,
  revalidateEntireCache,
  type FulfilledRouteCacheEntry,
} from '../../segment-cache/cache'
import { createCacheKey } from '../../segment-cache/cache-key'
import {
  type NavigationSeed,
  completeHardNavigation,
  convertServerPatchToFullTree,
  navigateToKnownRoute,
} from '../../segment-cache/navigation'
import { setAppRouterState } from '../../use-action-queue'
import { createHrefFromUrl } from '../create-href-from-url'
import {
  fetchServerResponse,
  type FetchServerResponseResult,
} from '../fetch-server-response'
import { FreshnessPolicy } from '../ppr-navigations'
import {
  ACTION_HMR_REFRESH,
  ACTION_NAVIGATE,
  ACTION_REFRESH,
  ACTION_RESTORE,
  ACTION_SERVER_ACTION,
  ACTION_SERVER_PATCH,
  type AppRouterState,
  type ReducerActions,
} from '../router-reducer-types'
import {
  scheduleServerActionRequest,
  type ServerActionCall,
} from './server-action-scheduler'

type RouterTaskShared = {
  phase: RouterTaskPhase

  navigationType: NavigationType
  shouldScroll: boolean
  shouldHardNavigate: boolean
  freshness: FreshnessPolicy

  // The previous task in the queue. Tasks are sorted from newest to oldest.
  prev: RouterTask | null

  // The next pending action in the queue. This is a separate queue from the
  // main one because actions must be invoked even if a newer navigation is
  // initiated in the meantime.
  nextAction: ServerActionRouterTask | null

  then: (onFulfilled: (state: AppRouterState) => void) => void
  status: 'pending' | 'fulfilled'
  value: AppRouterState | null
  pings: Array<(_state: AppRouterState) => void>

  debugInfo: Array<unknown> | null
}

const enum RouterTaskPhase {
  ServerAction,
  Pending,
  Ready,
}

export type ServerActionRouterTask = RouterTaskShared & {
  phase: RouterTaskPhase.ServerAction
  url: URL
  data: ServerActionCall<unknown>
}

type PendingRouterTask = RouterTaskShared & {
  phase: RouterTaskPhase.Pending
  url: URL | null
  data: AbortController | null
}

type ReadyRouterTask = RouterTaskShared & {
  phase: RouterTaskPhase.Ready
  url: URL
  data: NavigationSeed | null
}

export type RouterTask =
  | ServerActionRouterTask
  | PendingRouterTask
  | ReadyRouterTask

let didScheduleMicrotask = false

// A LIFO queue of pending tasks. The algorithm for squashing multiple pending
// navigations into a single task traverses through the tasks from newest
// to oldest.
let queue: RouterTask | null = null

// The most recently queued task. It's not the same as `queue` because some
// tasks end up getting squashed into the previous task. We track this so we
// know which React promise to resolve to ping React; only the most recent one
// needs to be pinged, because it's the last one in React's state queue, and
// all the updates get entangled regardless.
let mostRecentlyQueuedTask: RouterTask | null = null

// The committed state of the router. It's updated (via useEffect) once React
// has finished rendering the update. It corresponds to the current state of
// the UI.
let currentAppRouterState: AppRouterState | null = null

export function initializeRouterTaskQueue(initialState: AppRouterState): void {
  currentAppRouterState = initialState
}

function performNavigation() {
  didScheduleMicrotask = false
  // These are only null on page load, before hydration
  if (currentAppRouterState === null || mostRecentlyQueuedTask === null) {
    return
  }
  const baseState = currentAppRouterState

  // Process the queue to find a navigation target.
  const now = Date.now()
  const target = beginNavigation(now, baseState)
  if (target === null) {
    // The queue is either suspended or empty.
    return
  }

  // TODO: If there is a pending Server Action, but it was superseded by a
  // newer navigation, we currently commit the newer navigation without waiting
  // for the action to complete. However, this means that any optimistic updates
  // that are associated with the original action will be reverted before the
  // Server Action has finished revalidating. There are competing concerns here,
  // because we don't want to block new navigations, but we also don't want to
  // show stale data. To fix this, we should commit the newer navigation as
  // as optimistic update, but leave the rest of the queue intact. This will
  // require a change to React to allow optimistic updates to act like
  // transitions (which is likely planned anyway as part of the Gesture
  // Transitions experiment).

  // We have target we can navigate to.

  // Before proceeding to the complete phase, cancel any previous tasks that
  // weren't already cacnceled.
  cancelPreviousTasks(target)

  // Compute the new router state.
  const newState = completeNavigation(now, baseState, target)

  // Notify React to render the update.
  //
  // Only the most recently scheduled task needs to be pinged, because it's
  // the last one in the router's React state queue. We could resolve all the
  // pending promises, but there's no need — these all go into the same
  // useState queue, so React entangles all the updates into a single render.
  fulfillRouterTaskPromise(mostRecentlyQueuedTask, newState)

  if (newState === currentAppRouterState) {
    // The new state is the same as the current state, so we can commit the
    // navigation immediately. This is not just an optimization — React won't
    // run the synchronization effect if the state hasn't changed, so we need
    // to invoke it here.
    commitNavigation(newState)
  } else {
    // Do not commit the navigation yet. Leave it as-is until React commits the
    // UI. If another navigation is scheduled in the meantime, it will interrupt
    // this navigation attempt and start a new one.
  }
}

export function commitNavigation(newState: AppRouterState): void {
  // The UI has now been updated. We can reset the queue.
  // TODO: This is where we should update the browser's history state, rather
  // than in the effect that calls this function.
  currentAppRouterState = newState
  queue = null
}

export function getCurrentAppRouterState(): AppRouterState | null {
  return currentAppRouterState
}

export function dispatchAppRouterAction(action: ReducerActions): void {
  // TODO: We don't need to express these operations as "actions" anymore.
  // Callers should invoke requestNavigation, requestRefresh, et al directly.
  // Will do this in a separate PR so it can be reviewed separately.
  if (currentAppRouterState === null) {
    return
  }
  const baseState = currentAppRouterState
  switch (action.type) {
    case ACTION_NAVIGATE: {
      const shouldHardNavigate = action.isExternalUrl
      requestNavigation(
        action.url,
        action.navigateType,
        action.shouldScroll,
        shouldHardNavigate,
        FreshnessPolicy.Default
      )
      return
    }
    case ACTION_SERVER_PATCH: {
      // The dynamic response for a navigation did not match what we expected
      // based on the route information that was already cached. This implies
      // that a dynamic mutation was performed on the server. We must refresh to
      // bring the app back into a consistent state.
      //
      // This is modeled similarly to a Server Action that performs a
      // revalidation. If there was no newer navigation in the meantime, then we
      // can immediately apply the new data sent from the server. Otherwise, we
      // must schedule an async revalidation.
      const shouldHardNavigate = action.mpa
      if (action.baseTask === mostRecentlyQueuedTask) {
        // There has been no new navigation since the one that mismatched. We
        // can safely apply the data we just received from the server.
        invalidateBfCache()
        const pendingTask = requestRefresh(
          shouldHardNavigate,
          FreshnessPolicy.RefreshAll
        )
        // Immediately resolve the pending task.
        markTaskAsReady(pendingTask, action.url, action.seed)
      } else {
        requestServerActionRevalidation(shouldHardNavigate)
      }
      return
    }
    case ACTION_RESTORE: {
      const navigationType = 'traverse'
      requestNavigation(
        action.url,
        navigationType,
        false,
        false,
        FreshnessPolicy.Restore
      )
      return
    }
    case ACTION_REFRESH: {
      // TODO: Consider canceling all in-progress dynamic requests whenever
      // there's a refresh. Even if the stream is already visible to the user.
      invalidateBfCache()
      revalidateEntireCache(baseState.nextUrl, baseState.tree)
      requestRefresh(false, FreshnessPolicy.RefreshAll)
      return
    }
    case ACTION_HMR_REFRESH: {
      invalidateBfCache()
      requestRefresh(false, FreshnessPolicy.HMRRefresh)
      return
    }
    case ACTION_SERVER_ACTION: {
      const urlOfPageToInvokeActionOn = new URL(
        baseState.canonicalUrl,
        location.origin
      )
      const serverActionTask = requestServerActionNavigation(
        urlOfPageToInvokeActionOn,
        action.actionId,
        action.actionArgs,
        action.resolve,
        action.reject
      )
      scheduleServerActionRequest(serverActionTask)
      return
    }
    default:
      action satisfies never
      return
  }
}

function requestRefresh(
  shouldHardNavigate: boolean,
  freshness: FreshnessPolicy
): RouterTask {
  const newTask = requestRouterTask() as PendingRouterTask

  newTask.phase = RouterTaskPhase.Pending
  newTask.url = null
  newTask.navigationType = 'reload'
  newTask.shouldScroll = true
  newTask.shouldHardNavigate = shouldHardNavigate
  newTask.freshness = freshness

  return newTask
}

function requestNavigation(
  url: URL,
  navigationType: NavigationType,
  shouldScroll: boolean,
  shouldHardNavigate: boolean,
  freshness: FreshnessPolicy
): RouterTask {
  const newTask = requestRouterTask() as PendingRouterTask

  newTask.phase = RouterTaskPhase.Pending
  newTask.url = url
  newTask.navigationType = navigationType
  newTask.shouldScroll = shouldScroll
  newTask.shouldHardNavigate = shouldHardNavigate
  newTask.freshness = freshness

  return newTask
}

function requestServerActionNavigation(
  urlOfPageToInvokeActionOn: URL,
  actionId: string,
  actionArgs: any[],
  fulfill: (value: unknown) => void,
  reject: (error: unknown) => void
): ServerActionRouterTask {
  const newTask = requestRouterTask() as ServerActionRouterTask

  newTask.phase = RouterTaskPhase.ServerAction
  newTask.url = urlOfPageToInvokeActionOn

  const call: ServerActionCall<unknown> = {
    actionId,
    actionArgs,
    needsRevalidate: false,

    fulfill,
    reject,
  }

  newTask.data = call

  return newTask
}

export function requestServerActionRevalidation(shouldHardNavigate: boolean) {
  // A Server Action was superseded by a newer navigation. We weren't able to
  // render the response from the action — because actions take an arbitrary
  // amount of time to execute, the response might be more stale than the data
  // that is already visible the client.
  //
  // However, the reverse might also be true: the Server Action may have
  // performed backend mutations that occurred after the most recent navigation.
  //
  // To get the app back into a consistent state, we must refresh the page.

  // TODO: We should delay the refresh a bit to give the backend some time to
  // propagate changes performed by the Server Action. This delay should apply
  // to _any_ dynamic request, including by other navigations, but it shouldn't
  // apply to cached navigation data.
  invalidateBfCache()
  requestRefresh(shouldHardNavigate, FreshnessPolicy.RefreshAll)
}

function requestRouterTask(): RouterTask {
  const pings: Array<(_state: AppRouterState) => void> = []
  const then = (ping: (_state: AppRouterState) => void) => {
    pings.push(ping)
  }
  const newTask: PendingRouterTask = {
    phase: RouterTaskPhase.Pending,
    data: null,
    url: null,

    navigationType: 'replace',
    shouldScroll: false,
    shouldHardNavigate: false,
    freshness: FreshnessPolicy.Restore,

    prev: null,

    nextAction: null,

    then,
    pings,
    status: 'pending',
    value: null,

    debugInfo: null,
  }

  if (queue !== null) {
    newTask.prev = queue
  }
  queue = newTask

  pingRouterQueue()

  // The task object itself acts like a thenable.
  const statePromise = newTask as unknown as PromiseLike<AppRouterState>
  setAppRouterState(statePromise)
  mostRecentlyQueuedTask = newTask

  return newTask
}

export function pingRouterQueue() {
  if (didScheduleMicrotask) {
    // Already scheduled a task to process the queue
    return
  }
  didScheduleMicrotask = true
  scheduleMicrotask(performNavigation)
}

function beginNavigation(
  now: number,
  baseState: AppRouterState
): ReadyRouterTask | null {
  // Collapses the queue into a single task that represents the
  while (queue !== null) {
    const task = queue
    switch (task.phase) {
      case RouterTaskPhase.ServerAction: {
        // This is a task representing a Server Action. The action may or may
        // not result in a navigation; we don't know until we receive a response
        // from the server. Suspend until we receive a response.
        return null
      }
      case RouterTaskPhase.Pending: {
        // The most recent navigation is still pending.
        const url = task.url
        if (url === null || task.navigationType === 'reload') {
          // This is a refresh. Refreshes don't affect the URL; they just
          // re-fetch the existing dynamic data.
          const prev = task.prev
          if (prev !== null) {
            // There's an earlier task in the queue. Since this is a refresh,
            // we can squash this task into the previous one. For example, if
            // the previous task is a regular navigation, the combined task will
            // perform both a navigation and a refresh.
            queue = squashRefreshIntoPrevious(prev, task)
            continue
          } else {
            // There's no earlier pending navigation. This means means the base
            // state of the task is the same as the current UI's state. We can
            // mark this task as ready.
            const baseUrl = new URL(baseState.canonicalUrl, location.origin)
            const baseSeed = convertServerPatchToFullTree(
              baseState.tree,
              null,
              baseState.renderedSearch
            )
            const finishedTask = markTaskAsReady(task, baseUrl, baseSeed)
            finishedTask.navigationType = 'reload'
            queue = finishedTask
            continue
          }
        }

        if (
          // This is an external URL.
          url.origin !== location.origin ||
          // The initiator requested a hard navigation.
          task.shouldHardNavigate
        ) {
          // Mark the task as ready without resolving the route data. This will
          // trigger a hard navigation.
          queue = markTaskAsReady(task, url, null)
          continue
        }

        // Check the prefetch cache for a matching route
        const nextUrl = getNextURLForNavigation(task, baseState)
        const prefetchSeed = readRouteFromPrefetchCache(now, url, nextUrl)
        if (prefetchSeed !== null) {
          // The route is cached.
          queue = markTaskAsReady(task, url, prefetchSeed)
          continue
        }

        // This is a navigation to an unknown route. We must request it from
        // the server. The navigation will suspend until the server responds.
        //
        // Because this navigation supersedes all previous navigations, we can
        // cancel any pending navigation requests that are already in progress.
        // We do this even before the UI commits, to free up network bandwidth.
        // Usually this done right before the complete phase, but since the
        // complete phase is currently suspended, we will do it even earlier to
        // free up network bandwidth.
        cancelPreviousTasks(task)

        // Fetch the route.
        const controller = task.data
        if (controller !== null) {
          // This task already has a request in progress. Suspend until the
          // server responds, or until there's newer navigation.
          return null
        }

        spawnRequestForUnknownRoute(task, baseState, url, nextUrl)

        return null
      }
      case RouterTaskPhase.Ready: {
        return task
      }
      default: {
        task satisfies never
        return null
      }
    }
  }
  return null
}

function completeNavigation(
  now: number,
  baseState: AppRouterState,
  target: ReadyRouterTask
): AppRouterState {
  // Compute the new router state.
  const navigationType = target.navigationType
  const url = target.url
  const seed = target.data
  if (
    seed === null ||
    target.shouldHardNavigate ||
    url.origin !== location.origin
  ) {
    // This is an MPA navigation.
    return completeHardNavigation(baseState, url, navigationType)
  }
  const baseUrl = new URL(baseState.canonicalUrl, location.origin)
  const freshness = target.freshness
  if (navigationType === 'reload' && freshness === FreshnessPolicy.Restore) {
    // This is a refresh, but the freshness policy is Restore. This is
    // equivalent to a no-op. Return the base state unchanged.
    return baseState
  }
  return navigateToKnownRoute(
    now,
    baseState,
    target,
    target.url,
    createHrefFromUrl(target.url),
    seed,
    baseUrl,
    baseState.renderedSearch,
    baseState.cache,
    baseState.tree,
    freshness,
    getNextURLForNavigation(target, baseState),
    target.shouldScroll,
    navigationType,
    target.debugInfo
  )
}

export function markTaskAsReady(
  task: RouterTask,
  url: URL,
  seed: NavigationSeed | null
): ReadyRouterTask {
  const finishedTask = task as unknown as ReadyRouterTask
  finishedTask.phase = RouterTaskPhase.Ready
  finishedTask.url = url
  finishedTask.data = seed
  return finishedTask
}

export function accumulateTaskFreshness(
  task: RouterTask,
  freshness: FreshnessPolicy
): void {
  task.freshness = task.freshness > freshness ? task.freshness : freshness
}

function squashRefreshIntoPrevious(
  prev: RouterTask,
  refreshTask: PendingRouterTask
): RouterTask {
  accumulateTaskFreshness(prev, refreshTask.freshness)

  // Any data associated with the newer task is no longer usable.
  dropDataFromTask(refreshTask)

  // Also, because it's being squashed with a newer task, data received from the
  // server as part of the previous navigation is no longer usable (with some
  // exceptions, like if the newer task is a back/forward navigation, or a
  // Server Action that results in a no-op).
  if (refreshTask.freshness > FreshnessPolicy.Restore) {
    dropDataFromTask(prev)
  }

  return prev
}

function cancelPreviousTasks(parentTask: RouterTask) {
  // The data in the previous tasks is no longer usable, because it's been
  // superseded by a newer navigation. Cancel the requests and drop any seed
  // data that was already received.
  //
  // The freshness of the previous tasks will also be accumulated, i.e. if one
  // of the previous tasks was a refresh, then the parent task becomes a
  // refresh, too.
  let prev = parentTask.prev
  while (prev !== null) {
    dropDataFromTask(prev)
    accumulateTaskFreshness(parentTask, prev.freshness)
    prev = prev.prev
  }

  // Disconnect the canceled tasks from the queue.
  parentTask.prev = null

  return parentTask
}

function dropDataFromTask(task: RouterTask) {
  switch (task.phase) {
    case RouterTaskPhase.ServerAction: {
      // This Server Action is still pending, but if it does end up returning
      // new render data due to a refresh or revalidation, we cannot use the
      // result, because there was a newer navigation in the meantime. Instead,
      // it should kick off a separate revalidation request after the
      // action completes.
      const call = task.data
      call.needsRevalidate = true
      break
    }
    case RouterTaskPhase.Pending: {
      const controller = task.data
      if (controller !== null) {
        // Cancel the request.
        // TODO: Flight will treat this as an error. We want to suspend the
        // stream rather than error it, to distinguish it from a network error.
        // Will do this in a separate PR.
        // controller.abort()
        task.data = null
      }
      break
    }
    case RouterTaskPhase.Ready: {
      const seed = task.data
      if (seed !== null) {
        // The dynamic data associated with this server response is no longer
        // usable, usually due to a refresh or revalidation. Drop it to prevent
        // it from being used in subsequent navigations.
        const newSeed: NavigationSeed = {
          data: null,
          head: null,

          // The route tree itself is not affected by a refresh. Keep it as-is.
          routeTree: seed.routeTree,
          metadataVaryPath: seed.metadataVaryPath,
          renderedSearch: seed.renderedSearch,
        }
        task.data = newSeed
      }
      break
    }
    default: {
      task satisfies never
      break
    }
  }
}

function fulfillRouterTaskPromise(task: RouterTask, state: AppRouterState) {
  if (task.status === 'pending') {
    task.status = 'fulfilled'
    task.value = state
    task.pings.forEach((ping) => ping(state))
  }
}

function readRouteFromPrefetchCache(
  now: number,
  url: URL,
  nextUrl: string | null
): NavigationSeed | null {
  const href = url.href

  const cacheKey = createCacheKey(href, nextUrl)
  const route = readRouteCacheEntry(now, cacheKey)
  if (route !== null && route.status === EntryStatus.Fulfilled) {
    // We have a matching prefetch.
    return convertRouteCacheEntryToNavigationSeed(route)
  }

  // There was no matching route tree in the cache. Let's see if we can
  // construct an "optimistic" route tree.
  //
  // Do not construct an optimistic route tree if there was a cache hit, but
  // the entry has a rejected status, since it may have been rejected due to a
  // rewrite or redirect based on the search params.
  //
  // TODO: There are multiple reasons a prefetch might be rejected; we should
  // track them explicitly and choose what to do here based on that.
  if (route === null || route.status !== EntryStatus.Rejected) {
    const optimisticRoute = requestOptimisticRouteCacheEntry(now, url, nextUrl)
    if (optimisticRoute !== null) {
      // We have an optimistic route tree. Proceed with the normal flow.
      return convertRouteCacheEntryToNavigationSeed(optimisticRoute)
    }
  }

  return null
}

// Used to request all the dynamic data for a route, rather than just a subset,
// e.g. during a refresh or a revalidation. Typically this gets constructed
// during the normal flow when diffing the route tree, but for an unprefetched
// navigation, where we don't know the structure of the target route, we use
// this instead.
const DynamicRequestTreeForEntireRoute: FlightRouterState = [
  '',
  {},
  null,
  'refetch',
]

function spawnRequestForUnknownRoute(
  task: PendingRouterTask,
  baseState: AppRouterState,
  url: URL,
  nextUrl: string | null
) {
  fetchUnknownRoute(task, baseState, url, nextUrl).then(pingRouterQueue)
}

function getNextURLForNavigation(
  task: RouterTask,
  baseState: AppRouterState
): string | null {
  if (task.navigationType === 'reload') {
    // During a refresh, the Next-URL header should correspond to the tree that
    // originally navigated to the current route. Yes, the name of this
    // field is confusing. See `completeSoftNavigation` for more details.
    return baseState.previousNextUrl
  }
  // During a push or replace, the Next-URL header should correspond to the
  // base tree.
  return baseState.nextUrl
}

export function getNextURLForServerAction(
  baseState: AppRouterState
): string | null {
  // Similar to a refresh, the Next-URL sent by a Server Action request
  // corresponds to the tree that originally navigated to the current route. If
  // the Server Action ends up triggering a redirect, then the server is
  // responsible for forwarding the correct Next-URL header to the new route.
  return baseState.previousNextUrl
}

async function fetchUnknownRoute(
  task: PendingRouterTask,
  baseState: AppRouterState,
  url: URL,
  nextUrl: string | null
) {
  let dynamicRequestTree: FlightRouterState
  switch (task.freshness) {
    case FreshnessPolicy.Default:
    case FreshnessPolicy.Restore:
      dynamicRequestTree = baseState.tree
      break
    case FreshnessPolicy.Hydration: // <- shouldn't happen during client nav
    case FreshnessPolicy.RefreshAll:
    case FreshnessPolicy.HMRRefresh:
      dynamicRequestTree = DynamicRequestTreeForEntireRoute
      break
    default:
      task.freshness satisfies never
      dynamicRequestTree = baseState.tree
      break
  }

  const controller = new AbortController()
  const signal = controller.signal
  task.data = controller

  let result: FetchServerResponseResult | null = null
  try {
    result = await fetchServerResponse(url, {
      flightRouterState: dynamicRequestTree,
      nextUrl,
      signal,
    })
  } catch {}

  if (task.data !== controller || signal.aborted) {
    // The request was canceled.
    return
  }

  // The controller is no longer needed.
  task.data = null

  if (typeof result === 'string') {
    const redirectUrl = new URL(result, location.origin)
    markTaskAsReady(task, redirectUrl, null)
  } else if (result === null) {
    markTaskAsReady(task, url, null)
  } else {
    const flightData = result.flightData
    const canonicalUrl = result.canonicalUrl
    const renderedSearch = result.renderedSearch
    const debugInfo = result.debugInfo
    const seed = convertServerPatchToFullTree(
      baseState.tree,
      flightData,
      renderedSearch
    )
    markTaskAsReady(task, new URL(canonicalUrl, location.origin), seed)
    task.debugInfo = debugInfo
  }
}

function convertRouteCacheEntryToNavigationSeed(
  route: FulfilledRouteCacheEntry
): NavigationSeed {
  const routeTree = route.tree
  const renderedSearch = route.renderedSearch
  const prefetchSeed: NavigationSeed = {
    renderedSearch,
    routeTree,
    metadataVaryPath: route.metadata.varyPath as any,
    data: null,
    head: null,
  }
  return prefetchSeed
}

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
