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
  type NavigationResult,
} from '../../segment-cache/navigation'
import { NavigationResultTag } from '../../segment-cache/types'
import { getStaleTimeMs } from '../../segment-cache/cache'
import { FreshnessPolicy } from '../ppr-navigations'
import { isJavaScriptURLString } from '../../../lib/javascript-url'

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
  if (isJavaScriptURLString(url)) {
    console.error(
      'Next.js has blocked a javascript: URL as a security precaution.'
    )
    return handleMutable(state, mutable)
  }

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
  pendingPush: boolean,
  result: NavigationResult
): ReducerState {
  switch (result.tag) {
    case NavigationResultTag.MPA: {
      // Perform an MPA navigation.
      const newUrl = result.data
      return handleExternalUrl(state, mutable, newUrl, pendingPush)
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
  const currentRenderedSearch = state.renderedSearch
  const result = navigateUsingSegmentCache(
    url,
    currentUrl,
    currentRenderedSearch,
    state.cache,
    state.tree,
    state.nextUrl,
    FreshnessPolicy.Default,
    shouldScroll,
    mutable
  )
  return handleNavigationResult(url, state, mutable, pendingPush, result)
}
