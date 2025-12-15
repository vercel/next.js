import type {
  Mutable,
  ReadonlyReducerState,
  ReducerState,
} from '../router-reducer-types'
import { handleNavigationResult } from './navigate-reducer'
import { navigateToSeededRoute } from '../../segment-cache/navigation'
import { revalidateEntireCache } from '../../segment-cache/cache'
import { hasInterceptionRouteInCurrentTree } from './has-interception-route-in-current-tree'
import { FreshnessPolicy } from '../ppr-navigations'

export function refreshReducer(state: ReadonlyReducerState): ReducerState {
  // TODO: Currently, all refreshes purge the prefetch cache. In the future,
  // only client-side refreshes will have this behavior; the server-side
  // `refresh` should send new data without purging the prefetch cache.
  const currentNextUrl = state.nextUrl
  const currentRouterState = state.tree
  revalidateEntireCache(currentNextUrl, currentRouterState)
  return refreshDynamicData(state, FreshnessPolicy.RefreshAll)
}

export function refreshDynamicData(
  state: ReadonlyReducerState,
  freshnessPolicy: FreshnessPolicy.RefreshAll | FreshnessPolicy.HMRRefresh
): ReducerState {
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
  const shouldScroll = true

  const navigationSeed = {
    tree: state.tree,
    renderedSearch: state.renderedSearch,
    data: null,
    head: null,
  }

  const now = Date.now()
  const result = navigateToSeededRoute(
    now,
    currentUrl,
    currentCanonicalUrl,
    navigationSeed,
    currentUrl,
    currentRenderedSearch,
    state.cache,
    currentFlightRouterState,
    freshnessPolicy,
    nextUrlForRefresh,
    shouldScroll
  )

  const mutable: Mutable = {}
  mutable.preserveCustomHistoryState = false

  return handleNavigationResult(currentUrl, state, mutable, false, result)
}
