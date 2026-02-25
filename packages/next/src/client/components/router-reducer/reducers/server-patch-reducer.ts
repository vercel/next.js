import { createHrefFromUrl } from '../create-href-from-url'
import {
  ACTION_REFRESH,
  type ServerPatchAction,
  type ReducerState,
  type ReadonlyReducerState,
} from '../router-reducer-types'
import {
  completeHardNavigation,
  navigateToKnownRoute,
} from '../../segment-cache/navigation'
import { refreshReducer } from './refresh-reducer'
import { FreshnessPolicy } from '../ppr-navigations'

export function serverPatchReducer(
  state: ReadonlyReducerState,
  action: ServerPatchAction
): ReducerState {
  // A "retry" is a navigation that happens due to a route mismatch. It's
  // similar to a refresh, because we will omit any existing dynamic data on
  // the page. But we seed the retry navigation with the exact tree that the
  // server just responded with.
  const retryMpa = action.mpa
  const retryUrl = new URL(action.url, location.origin)
  const retrySeed = action.seed
  // A retry should not create a new history entry.
  const navigateType = 'replace'
  if (retryMpa || retrySeed === null) {
    // If the server did not send back data during the mismatch, fall back to
    // an MPA navigation.
    return completeHardNavigation(state, retryUrl, navigateType)
  }
  const currentUrl = new URL(state.canonicalUrl, location.origin)
  const currentRenderedSearch = state.renderedSearch
  if (action.previousTree !== state.tree) {
    // There was another, more recent navigation since the once that
    // mismatched. We can abort the retry, but we still need to refresh the
    // page to evict any stale dynamic data.
    return refreshReducer(state, { type: ACTION_REFRESH })
  }
  // There have been no new navigations since the mismatched one. Refresh,
  // using the tree we just received from the server.
  const retryCanonicalUrl = createHrefFromUrl(retryUrl)
  const retryNextUrl = action.nextUrl
  const shouldScroll = true
  const now = Date.now()
  return navigateToKnownRoute(
    now,
    state,
    retryUrl,
    retryCanonicalUrl,
    retrySeed,
    currentUrl,
    currentRenderedSearch,
    state.cache,
    state.tree,
    FreshnessPolicy.RefreshAll,
    retryNextUrl,
    shouldScroll,
    navigateType,
    null,
    // Server patch (retry) navigations don't use route prediction. This is
    // typically a retry after a previous mismatch, so the route was already
    // marked as having a dynamic rewrite when the mismatch was detected.
    null
  )
}
