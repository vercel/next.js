import type {
  FlightRouterState,
  FlightSegmentPath,
} from '../../../../shared/lib/app-router-types'
import { createHrefFromUrl } from '../create-href-from-url'
import type {
  Mutable,
  NavigateAction,
  ReadonlyReducerState,
  ReducerState,
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
  navigationId: number,
  url: URL,
  state: ReadonlyReducerState,
  mutable: Mutable,
  pendingPush: boolean,
  result: NavigationResult
): ReducerState {
  switch (result.tag) {
    case NavigationResultTag.MPA: {
      // Perform an MPA navigation.
      const newUrl = result.data
      const newState = handleExternalUrl(state, mutable, newUrl, pendingPush)
      newState.navigationId = navigationId
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
      newState.navigationId = navigationId
      return newState
    }
    case NavigationResultTag.Async: {
      return result.data.then(
        (asyncResult) =>
          handleNavigationResult(
            navigationId,
            url,
            state,
            mutable,
            pendingPush,
            asyncResult
          ),
        // If the navigation failed, return the current state.
        // TODO: This matches the current behavior but we need to do something
        // better here if the network fails.
        () => {
          return state
        }
      )
    }
    default: {
      result satisfies never
      return state
    }
  }
}

export function navigateReducer(
  state: ReadonlyReducerState,
  action: NavigateAction
): ReducerState {
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

  if (continuationId === null) {
    // This is not a continuation. Assign a new navigation id.
    const newNavigationId = currentNavigationId + 1
    return continueNavigationReducer(
      state,
      newNavigationId,
      action.url,
      action.navigateType,
      action.isExternalUrl,
      action.shouldScroll,
      action.shouldRefreshDynamicData,
      action.seed
    )
  }

  // This is a continuation of an earlier navigation.
  if (continuationId === currentNavigationId) {
    // This is still the most recent navigation. Continue.
    return continueNavigationReducer(
      state,
      continuationId,
      action.url,
      action.navigateType,
      action.isExternalUrl,
      action.shouldScroll,
      action.shouldRefreshDynamicData,
      action.seed
    )
  }

  // The continuation navigation was superseded by a newer navigation. Do not
  // proceed with the continuation. However, we may need to perform a refresh.
  const shouldRefreshDynamicData = action.shouldRefreshDynamicData
  if (!shouldRefreshDynamicData) {
    // There's nothing to update. Return the previous state.
    return state
  }

  // Although the continuation was canceled, the parent navigation has
  // indicated to us that there is stale or missing dynamic data in the
  // tree. Trigger a refresh of the current tree to ensure it's consistent.
  // This is semantically similar to a Server Action refresh().
  const currentUrl = new URL(state.canonicalUrl, location.origin)
  const navigateType = 'replace'
  const isExternalUrl = false
  const seed = null
  return continueNavigationReducer(
    state,
    currentNavigationId,
    currentUrl,
    navigateType,
    isExternalUrl,
    action.shouldScroll,
    shouldRefreshDynamicData,
    seed
  )
}

function continueNavigationReducer(
  state: ReadonlyReducerState,
  navigationId: number,
  url: URL,
  navigateType: 'push' | 'replace',
  isExternalUrl: boolean,
  shouldScroll: boolean,
  shouldRefreshDynamicData: boolean,
  seed: NavigationSeed | null
) {
  // Everything from this point is the same whether this is a continuation or
  // a new navigation.
  const mutable: Mutable = {}
  const href = createHrefFromUrl(url)
  const pendingPush = navigateType === 'push'

  mutable.preserveCustomHistoryState = false
  mutable.pendingPush = pendingPush

  if (isExternalUrl) {
    return handleExternalUrl(state, mutable, url.toString(), pendingPush)
  }

  // Handles case where `<meta http-equiv="refresh">` tag is present,
  // which will trigger an MPA navigation.
  if (document.getElementById('__next-page-redirect')) {
    return handleExternalUrl(state, mutable, href, pendingPush)
  }

  // Temporary glue code between the router reducer and the new navigation
  // implementation. Eventually we'll rewrite the router reducer to a
  // state machine.
  const currentUrl = new URL(state.canonicalUrl, location.origin)
  const result =
    seed !== null
      ? navigateToSeededRoute(
          Date.now(),
          navigationId,
          url,
          createHrefFromUrl(url),
          seed,
          currentUrl,
          state.cache,
          state.tree,
          shouldRefreshDynamicData,
          state.nextUrl,
          shouldScroll
        )
      : navigateUsingSegmentCache(
          navigationId,
          url,
          currentUrl,
          state.cache,
          state.tree,
          state.nextUrl,
          shouldRefreshDynamicData,
          shouldScroll,
          mutable
        )
  return handleNavigationResult(
    navigationId,
    url,
    state,
    mutable,
    pendingPush,
    result
  )
}
