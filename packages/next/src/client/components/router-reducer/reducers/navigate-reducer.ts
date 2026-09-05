import type {
  NavigateAction,
  ReadonlyReducerState,
  ReducerState,
} from '../router-reducer-types'

import {
  completeHardNavigation,
  navigate as navigateUsingSegmentCache,
} from '../../app-router-state'
import { getStaleTimeMs } from '../../segment-cache/cache'
import { FreshnessPolicy } from '../../render-tree'

/**
 * Check if any `__next-page-redirect` marker exists outside a hidden Activity
 * subtree. When `cacheComponents` is enabled, React's `<Activity>` retains
 * hidden routes in the DOM with `display: none`. A stale redirect marker from
 * such a route must not trigger a hard (MPA) navigation from the active route.
 *
 * This replaces the previous document-global `getElementById` check.
 */
function hasActiveRedirectMarker(): boolean {
  const markers = document.querySelectorAll('#__next-page-redirect')
  for (let i = 0; i < markers.length; i++) {
    if (isInVisibleSubtree(markers[i])) {
      return true
    }
  }
  return false
}

/**
 * Walk up from an element's parent to determine whether it sits inside a
 * hidden subtree. React's `<Activity mode="hidden">` applies
 * `display: none` to its root; other mechanisms may use the `hidden`
 * attribute.
 *
 * We start from `element.parentElement` (not `element` itself) because the
 * marker is a `<meta>` element, which inherently has `display: none`.
 */
function isInVisibleSubtree(element: Element): boolean {
  // A marker emitted into `<head>` (e.g. a redirect captured before the first
  // flush) is always active. The browser's UA stylesheet applies
  // `display: none` to `<head>`, so we must not treat it as a hidden Activity
  // subtree. Scope the visibility walk to the rendered `<body>` subtree.
  if (document.head.contains(element)) {
    return true
  }
  let current: Element | null = element.parentElement
  while (
    current &&
    current !== document.documentElement &&
    current !== document.body
  ) {
    const style = window.getComputedStyle(current)
    if (style.display === 'none' || current.hasAttribute('hidden')) {
      return false
    }
    current = current.parentElement
  }
  return true
}

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

  // Handles case where a `<meta http-equiv="refresh">` tag is present,
  // which will trigger an MPA navigation. The check is scoped to visible
  // (non-hidden) subtrees so that stale markers left inside hidden
  // Activity routes (cacheComponents) do not force a hard navigation
  // from the active route.
  if (hasActiveRedirectMarker()) {
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
