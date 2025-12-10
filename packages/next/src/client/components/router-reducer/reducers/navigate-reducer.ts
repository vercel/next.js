import type {
  FlightRouterState,
  FlightSegmentPath,
} from '../../../../shared/lib/app-router-types'
import { createHrefFromUrl } from '../create-href-from-url'
import type {
  Mutable,
  NavigateAction,
  ReadonlyReducerState,
  AppRouterState,
} from '../router-reducer-types'
import { handleMutable } from '../handle-mutable'

import {
  navigateToSeededRoute,
  navigate as navigateUsingSegmentCache,
  type NavigationResult,
  type NavigationSeed,
} from '../../segment-cache/navigation'
import { NavigationResultTag } from '../../segment-cache/types'
import { getStaleTimeMs } from '../../segment-cache/cache'
import { cloneAppRouterState } from '../create-initial-router-state'

// These values are set by `define-env-plugin` (based on `nextConfig.experimental.staleTimes`)
// and default to 5 minutes (static) / 0 seconds (dynamic)
export const DYNAMIC_STALETIME_MS =
  Number(process.env.__NEXT_CLIENT_ROUTER_DYNAMIC_STALETIME) * 1000

export const STATIC_STALETIME_MS = getStaleTimeMs(
  Number(process.env.__NEXT_CLIENT_ROUTER_STATIC_STALETIME)
)

export function handleExternalUrl(
  state: ReadonlyReducerState,
  mutable: Mutable,
  url: string,
  pendingPush: boolean
) {
  mutable.mpaNavigation = true
  mutable.canonicalUrl = url
  mutable.pendingPush = pendingPush
  mutable.scrollableSegments = undefined

  return handleMutable(state, mutable)
}

export function generateSegmentsFromPatch(
  flightRouterPatch: FlightRouterState
): FlightSegmentPath[] {
  const segments: FlightSegmentPath[] = []
  const [segment, parallelRoutes] = flightRouterPatch

  if (Object.keys(parallelRoutes).length === 0) {
    return [[segment]]
  }

  for (const [parallelRouteKey, parallelRoute] of Object.entries(
    parallelRoutes
  )) {
    for (const childSegment of generateSegmentsFromPatch(parallelRoute)) {
      // If the segment is empty, it means we are at the root of the tree
      if (segment === '') {
        segments.push([parallelRouteKey, ...childSegment])
      } else {
        segments.push([segment, parallelRouteKey, ...childSegment])
      }
    }
  }

  return segments
}

export function handleNavigationResult(
  url: URL,
  state: ReadonlyReducerState,
  mutable: Mutable,
  asyncDebugInfo: Array<unknown> | null,
  result: NavigationResult
): AppRouterState {
  // TODO: This result type is no longer necessary. Split each branch into a
  // separate functions and call them from each place that's currently
  // returning a NavigationResult.
  switch (result.tag) {
    case NavigationResultTag.MPA: {
      // Perform an MPA navigation.
      const newState = handleExternalUrl(
        state,
        mutable,
        result.data.href,
        state.pushRef.pendingPush || result.data.navigateType === 'push'
      )
      newState.navigationId = result.navigationId
      newState.suspended = null
      return newState
    }
    case NavigationResultTag.Success: {
      // Received a new result.
      mutable.cache = result.data.cacheNode
      mutable.patchedTree = result.data.flightRouterState
      mutable.renderedSearch = result.data.renderedSearch
      mutable.canonicalUrl = result.data.canonicalUrl
      // TODO: During a refresh, we don't set the `scrollableSegments`. There's
      // some confusing and subtle logic in `handleMutable` that decides what
      // to do when `shouldScroll` is set but `scrollableSegments` is not. I'm
      // not convinced it's totally coherent but the tests assert on this
      // particular behavior so I've ported the logic as-is from the previous
      // router implementation, for now.
      mutable.scrollableSegments = result.data.scrollableSegments ?? undefined
      mutable.shouldScroll = result.data.shouldScroll
      mutable.hashFragment = result.data.hash

      // Check if the only thing that changed was the hash fragment.
      const oldUrl = new URL(state.canonicalUrl, url)
      const onlyHashChange =
        // We don't need to compare the origins, because client-driven
        // navigations are always same-origin.
        url.pathname === oldUrl.pathname &&
        url.search === oldUrl.search &&
        url.hash !== oldUrl.hash
      if (onlyHashChange) {
        // The only updated part of the URL is the hash.
        mutable.onlyHashChange = true
        mutable.shouldScroll = result.data.shouldScroll
        mutable.hashFragment = url.hash
        // Setting this to an empty array triggers a scroll for all new and
        // updated segments. See `ScrollAndFocusHandler` for more details.
        mutable.scrollableSegments = []
      }

      const newState = handleMutable(state, mutable)
      // NOTE: Intentionally setting this manually instead of in handleMutable.
      // Eventually we should inline all the logic in handleMutable into this
      // function. The separate `state.mutable` object was originally handled to
      // account for reducer actions being replayed by useReducer, but since we
      // no longer run these "reducers" during the render phase, we can get rid
      // of the extra indirection.
      newState.navigationId = result.navigationId
      newState.suspended = null
      newState.debugInfo = asyncDebugInfo

      newState.pushRef.pendingPush =
        newState.pushRef.pendingPush || result.data.navigateType === 'push'

      return newState
    }
    case NavigationResultTag.Suspended: {
      const needsRefresh = result.data
      return handleSuspendedNavigation(state, needsRefresh)
    }
    default: {
      result satisfies never
      return state
    }
  }
}

export function handleSuspendedNavigation(
  state: ReadonlyReducerState,
  needsRefresh: boolean
): AppRouterState {
  // Attempted to navigate to an unknown route. The router is blocked until
  // the server responds, or until there's another navigation.
  //
  // Return a suspended version of the current state. This will prevent
  // any entangled transition updates from committing in the meantime.
  const alreadySuspended = state.suspended
  const nextState = cloneAppRouterState(state)
  nextState.suspended = {
    needsRefresh:
      needsRefresh ||
      // Check if an existing suspended navigation already requested a refresh
      (alreadySuspended !== null && alreadySuspended.needsRefresh),
  }
  return nextState
}

export function navigateReducer(
  state: ReadonlyReducerState,
  action: NavigateAction
): AppRouterState {
  // Before proceeding, check whether this is a "continuation" navigation.
  //
  // A continuation navigation is an async navigation that occurs as a result of
  // an earlier navigation attempt.
  //
  // Semantically, the continuation is not a separate navigation, but we model
  // each attempt as a separate state update. Like a generator function, or
  // async/await.
  //
  // The main reason we don't use async/await is because we need to be able to
  // cancel the continuation if a newer navigation occurs in the meantime. To do
  // this, we compare the navigation id of the parent navigation with the
  // current navigation id. If they do not match, we cancel the continuation.
  //
  // The underlying principle here is that the most recent navigation initiated
  // by the user should always take precedence.
  const continuationId = action.continuationId
  const currentNavigationId = state.navigationId
  if (continuationId === null || continuationId === currentNavigationId) {
    // This is either a new navigation, or a continuation of the current one.
    // Proceed with the navigation.

    // If this was a continuation, we need to transfer the debug info from the
    // Flight response so the latency is properly accounted for in the React
    // DevTools.
    const asyncDebugInfo = action.seed !== null ? action.seed.debugInfo : null

    return continueNavigationReducer(
      state,
      action.url,
      action.navigateType,
      action.isExternalUrl,
      action.shouldScroll,
      action.seed,
      action.shouldRefreshDynamicData,
      asyncDebugInfo
    )
  }

  // The continuation navigation was superseded by a newer navigation. Do not
  // proceed with the continuation. However, we may need to perform a refresh.
  if (!action.shouldRefreshDynamicData) {
    // There's nothing to update. Return the previous state.
    return state
  }

  // Although the continuation was canceled, the parent navigation has
  // indicated to us that there is stale or missing dynamic data in the
  // tree. Trigger a refresh of the current tree to ensure it's consistent.
  // This is semantically similar to a Server Action refresh().
  const refreshUrl = null
  const refreshNavigateType = 'replace'
  const refreshShouldScroll = true
  const refreshIsExternalUrl = false
  const refreshSeed = null
  const refreshShouldRefreshDynamicData = true
  const asyncDebugInfo = null
  return continueNavigationReducer(
    state,
    refreshUrl,
    refreshNavigateType,
    refreshIsExternalUrl,
    refreshShouldScroll,
    refreshSeed,
    refreshShouldRefreshDynamicData,
    asyncDebugInfo
  )
}

function continueNavigationReducer(
  state: ReadonlyReducerState,
  requestedUrl: URL | null,
  navigateType: 'push' | 'replace',
  isExternalUrl: boolean,
  shouldScroll: boolean,
  seed: NavigationSeed | null,
  shouldRefreshDynamicData: boolean,
  asyncDebugInfo: Array<unknown> | null
) {
  // Everything from this point is the same whether this is a continuation or
  // a new navigation.
  const mutable: Mutable = {}
  mutable.preserveCustomHistoryState = false

  // Check if the router is currently suspended, and if so, if there's a
  // pending refresh.
  let needsRefresh = false
  const suspended = state.suspended
  if (suspended === null) {
    // The router is not currently suspended. Only refresh if the current
    // navigation has requested it.
    needsRefresh = shouldRefreshDynamicData
  } else {
    const didRefreshWhileSuspended = suspended.needsRefresh
    needsRefresh = didRefreshWhileSuspended || shouldRefreshDynamicData
    if (didRefreshWhileSuspended) {
      // There's been a refresh since navigation request was made. Drop the
      // segment data we just received from the server. We can still use the
      // route tree, though.
      if (seed !== null) {
        seed = {
          tree: seed.tree,
          renderedSearch: seed.renderedSearch,
          data: null,
          head: null,
          debugInfo: asyncDebugInfo,
        }
      }
    }
  }

  // Check if this is a refresh. A refresh is almost identical to a same-page
  // navigation, but it must never supersede any pending navigation. Whereas
  // a same-page navigation effectively cancels any previous navigation.
  const currentCanonicalUrl = state.canonicalUrl
  const currentUrl = new URL(currentCanonicalUrl, location.origin)
  let url = requestedUrl
  if (url === null) {
    // If no URL is provided by the action, this is a refresh.
    if (suspended !== null) {
      // A refresh canot proceed while the router is suspended, because we
      // don't know what the next route will be. Remain suspended until the
      // pending navigation resumes.
      return handleRefreshWhileSuspended(state)
    }
    // Otherwise, proceed with the refresh. We model this the same as a
    // navigation to the current URL.
    url = currentUrl
  }

  const canonicalUrl = createHrefFromUrl(url)
  if (isExternalUrl) {
    return handleExternalUrl(
      state,
      mutable,
      canonicalUrl,
      navigateType === 'push'
    )
  }

  // Handles case where `<meta http-equiv="refresh">` tag is present,
  // which will trigger an MPA navigation.
  if (document.getElementById('__next-page-redirect')) {
    return handleExternalUrl(
      state,
      mutable,
      canonicalUrl,
      navigateType === 'push'
    )
  }

  // Temporary glue code between the router reducer and the new navigation
  // implementation. Eventually we'll rewrite the router reducer to a
  // state machine.
  const currentNavigationId = state.navigationId
  const result =
    seed !== null
      ? navigateToSeededRoute(
          Date.now(),
          currentNavigationId,
          url,
          canonicalUrl,
          seed,
          currentUrl,
          state.cache,
          state.tree,
          needsRefresh,
          navigateType,
          state.nextUrl,
          state.previousNextUrl,
          shouldScroll
        )
      : navigateUsingSegmentCache(
          currentNavigationId,
          url,
          currentUrl,
          currentCanonicalUrl,
          state.renderedSearch,
          state.cache,
          state.tree,
          state.nextUrl,
          state.previousNextUrl,
          needsRefresh,
          navigateType,
          shouldScroll
        )
  return handleNavigationResult(url, state, mutable, asyncDebugInfo, result)
}

export function handleRefreshWhileSuspended(state: ReadonlyReducerState) {
  // A refresh was requested, but the router is currently suspended by a
  // blocking navigation. We can't refresh yet because we don't know what the
  // next route will be. Set `needsRefresh` to true to force the next
  // navigation to refresh the dynamic data.
  const clone = cloneAppRouterState(state)
  clone.suspended = {
    needsRefresh: true,
  }
  return clone
}
