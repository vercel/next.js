import type {
  NavigateAction,
  ReadonlyReducerState,
  ReducerState,
} from '../router-reducer-types'

import {
  completeHardNavigation,
  navigate as navigateUsingSegmentCache,
} from '../../segment-cache/navigation'
import { getStaleTimeMs } from '../../segment-cache/cache'
import { FreshnessPolicy } from '../ppr-navigations'

// These values are set by `define-env-plugin` (based on `nextConfig.experimental.staleTimes`)
// and default to 5 minutes (static) / 0 seconds (dynamic)
export const DYNAMIC_STALETIME_MS =
  Number(process.env.__NEXT_CLIENT_ROUTER_DYNAMIC_STALETIME) * 1000

export const STATIC_STALETIME_MS = getStaleTimeMs(
  Number(process.env.__NEXT_CLIENT_ROUTER_STATIC_STALETIME)
)

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

  // Clear nextUrl for same-page navigations to avoid re-triggering
  // interception rewrites. When the user navigates to the same URL they're
  // already on, we should not send the Next-Url header that would cause the
  // server to apply interception rewrites again.
  const nextUrl = url.href === currentUrl.href ? null : state.nextUrl

  return navigateUsingSegmentCache(
    state,
    url,
    currentUrl,
    currentRenderedSearch,
    state.cache,
    state.tree,
    nextUrl,
    FreshnessPolicy.Default,
    scrollBehavior,
    navigateType
  )
}
