import type {
  NavigateAction,
  ReadonlyReducerState,
  ReducerState,
} from '../router-reducer-types'

import {
  completeHardNavigation,
  navigate as navigateUsingSegmentCache,
} from '../../segment-cache/navigation'
import { FreshnessPolicy } from '../ppr-navigations'

// This value is set by `define-env-plugin` (based on `nextConfig.experimental.staleTimes`)
// and defaults to 0 seconds. The static counterpart, STATIC_STALETIME_MS,
// lives in `shared/lib/segment-cache/response-decoding`.
export const DYNAMIC_STALETIME_MS =
  Number(process.env.__NEXT_CLIENT_ROUTER_DYNAMIC_STALETIME) * 1000

export function navigateReducer(
  state: ReadonlyReducerState,
  action: NavigateAction
): ReducerState {
  const { url, isExternalUrl, navigateType, scrollBehavior } = action

  if (isExternalUrl) {
    return completeHardNavigation(state, url, navigateType)
  }

  // Handles case where `<meta http-equiv="refresh">` tag is present,
  // which will trigger an MPA navigation.
  if (document.getElementById('__next-page-redirect')) {
    return completeHardNavigation(state, url, navigateType)
  }

  // Temporary glue code between the router reducer and the new navigation
  // implementation. Eventually we'll rewrite the router reducer to a
  // state machine.
  const currentUrl = new URL(state.canonicalUrl, location.origin)
  const currentRenderedSearch = state.renderedSearch
  return navigateUsingSegmentCache(
    state,
    url,
    currentUrl,
    currentRenderedSearch,
    state.cache,
    state.tree,
    state.nextUrl,
    FreshnessPolicy.Default,
    scrollBehavior,
    navigateType
  )
}
