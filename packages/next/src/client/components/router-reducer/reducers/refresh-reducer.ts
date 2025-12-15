import type {
  Mutable,
  ReadonlyReducerState,
  ReducerState,
  RefreshAction,
} from '../router-reducer-types'
import { handleNavigationResult } from './navigate-reducer'
import { navigateToSeededRoute } from '../../segment-cache/navigation'
import { revalidateEntireCache } from '../../segment-cache/cache'
import { hasInterceptionRouteInCurrentTree } from './has-interception-route-in-current-tree'
import { FreshnessPolicy } from '../ppr-navigations'

export function refreshReducer(
  state: ReadonlyReducerState,
  action: RefreshAction
): ReducerState {
  // TODO: Currently, all refreshes purge the prefetch cache. In the future,
  // only client-side refreshes will have this behavior; the server-side
  // `refresh` should send new data without purging the prefetch cache.
  const currentNextUrl = state.nextUrl
  const currentRouterState = state.tree
  revalidateEntireCache(currentNextUrl, currentRouterState)

  // We always send the last next-url, not the current when performing a dynamic
  // request. This is because we update the next-url after a navigation, but we
  // want the same interception route to be matched that used the last next-url.
  const nextUrlForRefresh = hasInterceptionRouteInCurrentTree(state.tree)
    ? state.previousNextUrl || currentNextUrl
    : null

  // A refresh is modeled as a navigation to the current URL, but where any
  // existing dynamic data (including in shared layouts) is re-fetched.
  const currentUrl = new URL(state.canonicalUrl, action.origin)
  const url = currentUrl
  const currentFlightRouterState = state.tree
  const shouldScroll = true

  const seedFlightRouterState = state.tree
  const seedRenderedSearch = state.renderedSearch
  const seedData = null
  const seedHead = null

  const result = navigateToSeededRoute(
    url,
    currentUrl,
    state.cache,
    currentFlightRouterState,
    seedFlightRouterState,
    seedRenderedSearch,
    seedData,
    seedHead,
    FreshnessPolicy.RefreshAll,
    nextUrlForRefresh,
    shouldScroll
  )

  const mutable: Mutable = {}
  mutable.preserveCustomHistoryState = false

  return handleNavigationResult(currentUrl, state, mutable, false, result)
}
