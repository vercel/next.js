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
  navigate as navigateUsingSegmentCache,
  NavigationResultTag,
  type NavigationResult,
} from '../../segment-cache'

// These values are set by `define-env-plugin` (based on `nextConfig.experimental.staleTimes`)
// and default to 5 minutes (static) / 0 seconds (dynamic)
export const DYNAMIC_STALETIME_MS =
  Number(process.env.__NEXT_CLIENT_ROUTER_DYNAMIC_STALETIME) * 1000

export const STATIC_STALETIME_MS =
  Number(process.env.__NEXT_CLIENT_ROUTER_STATIC_STALETIME) * 1000

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

function handleNavigationResult(
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
      return handleExternalUrl(state, mutable, newUrl, pendingPush)
    }
    case NavigationResultTag.NoOp: {
      // The server responded with no change to the current page. However, if
      // the URL changed, we still need to update that.
      const newCanonicalUrl = result.data.canonicalUrl
      mutable.canonicalUrl = newCanonicalUrl

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

      return handleMutable(state, mutable)
    }
    case NavigationResultTag.Success: {
      // Received a new result.
      mutable.cache = result.data.cacheNode
      mutable.patchedTree = result.data.flightRouterState
      mutable.renderedSearch = result.data.renderedSearch
      mutable.canonicalUrl = result.data.canonicalUrl
      mutable.scrollableSegments = result.data.scrollableSegments
      mutable.shouldScroll = result.data.shouldScroll
      mutable.hashFragment = result.data.hash
      return handleMutable(state, mutable)
    }
    case NavigationResultTag.Async: {
      return result.data.then(
        (asyncResult) =>
          handleNavigationResult(url, state, mutable, pendingPush, asyncResult),
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
  const { url, isExternalUrl, navigateType, shouldScroll } = action
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
  const result = navigateUsingSegmentCache(
    url,
    currentUrl,
    state.cache,
    state.tree,
    state.nextUrl,
    shouldScroll,
    mutable
  )
  return handleNavigationResult(url, state, mutable, pendingPush, result)
}
