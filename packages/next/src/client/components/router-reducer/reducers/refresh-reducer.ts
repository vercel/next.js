import type {
  ReadonlyReducerState,
  ReducerState,
  RefreshAction,
} from '../router-reducer-types'
import {
  convertServerPatchToFullTree,
  navigateToKnownRoute,
} from '../../segment-cache/navigation'
import { invalidateSegmentCacheEntries } from '../../segment-cache/cache'
import { hasInterceptionRouteInCurrentTree } from './has-interception-route-in-current-tree'
import { FreshnessPolicy } from '../ppr-navigations'
import { invalidateBfCache } from '../../segment-cache/bfcache'

export function refreshReducer(
  state: ReadonlyReducerState,
  action: RefreshAction
): ReducerState {
  // During a refresh, we invalidate the segment cache but not the route cache.
  // The route cache contains the tree structure (which segments exist at a
  // given URL) which doesn't change during a refresh. The segment cache
  // contains the actual RSC data which needs to be re-fetched.
  //
  // The Instant Navigation Testing API can bypass cache invalidation to
  // preserve prefetched data when refreshing after an MPA navigation. This is
  // only used for testing and is not exposed in production builds by default.
  const bypassCacheInvalidation =
    process.env.__NEXT_EXPOSE_TESTING_API && action.devBypassCacheInvalidation
  if (!bypassCacheInvalidation) {
    const currentNextUrl = state.nextUrl
    const currentRouterState = state.tree
    invalidateSegmentCacheEntries(currentNextUrl, currentRouterState)
  }
  return refreshDynamicData(state, FreshnessPolicy.RefreshAll)
}

export function refreshDynamicData(
  state: ReadonlyReducerState,
  freshnessPolicy: FreshnessPolicy.RefreshAll | FreshnessPolicy.HMRRefresh
): ReducerState {
  // During a refresh, invalidate the BFCache, which may contain dynamic data.
  invalidateBfCache()

  const currentNextUrl = state.nextUrl

  // We always send the last next-url, not the current when performing a dynamic
  // request. This is because we update the next-url after a navigation, but we
  // want the same interception route to be matched that used the last next-url.
  const nextUrlForRefresh = hasInterceptionRouteInCurrentTree(state.tree)
    ? state.previousNextUrl || currentNextUrl
    : null

  // A refresh is modeled as a navigation to the current URL, but where any
  // existing dynamic data (including in shared layouts) is re-fetched.
  const currentCanonicalUrl = state.canonicalUrl
  const currentUrl = new URL(currentCanonicalUrl, location.origin)
  const currentRenderedSearch = state.renderedSearch
  const currentFlightRouterState = state.tree
  const shouldScroll = false

  // Create a NavigationSeed from the current FlightRouterState.
  // TODO: Eventually we will store this type directly on the state object
  // instead of reconstructing it on demand. Part of a larger series of
  // refactors to unify the various tree types that the client deals with.
  const refreshSeed = convertServerPatchToFullTree(
    currentFlightRouterState,
    null,
    currentRenderedSearch
  )

  const now = Date.now()
  const navigateType = 'replace'
  return navigateToKnownRoute(
    now,
    state,
    currentUrl,
    currentCanonicalUrl,
    refreshSeed,
    currentUrl,
    currentRenderedSearch,
    state.cache,
    currentFlightRouterState,
    freshnessPolicy,
    nextUrlForRefresh,
    shouldScroll,
    navigateType,
    null,
    // Refresh navigations don't use route prediction, so there's no route
    // cache entry to mark as having a dynamic rewrite on mismatch. If a
    // mismatch occurs, the retry handler will traverse the known route tree
    // to find and mark the entry.
    null
  )
}
