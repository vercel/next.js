import { createHrefFromUrl } from '../create-href-from-url'
import {
  ACTION_REFRESH,
  type ServerPatchAction,
  type ReducerState,
  type ReadonlyReducerState,
  ScrollBehavior,
} from '../router-reducer-types'
import {
  completeHardNavigation,
  navigateToKnownRoute,
} from '../../segment-cache/navigation'
import { refreshReducer } from './refresh-reducer'
import { getCurrentNavigationLock } from '../ppr-navigations'
import { retargetRouterTransition } from '../../router-transition'

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
  const navigateType = action.navigateType
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
  //
  // The freshness policy comes from the action: a genuine tree mismatch
  // re-fetches the dynamic data (`RefreshAll`), whereas a redirect that only
  // changed the canonical URL reuses the data already in the tree
  // (`HistoryTraversal`), since the data we received is correct.
  const retryCanonicalUrl = createHrefFromUrl(retryUrl)
  const retryNextUrl = action.nextUrl
  const scrollBehavior = ScrollBehavior.Default
  const navigationLock = getCurrentNavigationLock()
  const now = Date.now()
  const newState = navigateToKnownRoute(
    now,
    state,
    retryUrl,
    retryCanonicalUrl,
    retrySeed,
    currentUrl,
    currentRenderedSearch,
    state.cache,
    state.tree,
    action.freshnessPolicy,
    retryNextUrl,
    scrollBehavior,
    navigateType,
    navigationLock,
    null,
    // Server patch (retry) navigations don't use route prediction. This is
    // typically a retry after a previous mismatch, so the route was already
    // marked as having a dynamic rewrite when the mismatch was detected.
    null,
    // Not an HMR refresh, so there's no request generation to cancel.
    undefined,
    // No pending transition: a retry is an internal correction, not a user
    // navigation. The timeline: the user's navigation optimistically committed
    // a predicted route tree (HistoryUpdater applied it, which emitted that
    // transition's `commit` event and removed it from the pending buffer).
    // Later, the dynamic response revealed the server actually rendered a
    // different tree (e.g. a dynamic rewrite/redirect), so this retry replaces
    // the committed tree with the server's authoritative one. From the user's
    // perspective the navigation already happened — emitting another
    // start/commit pair would double-count it. Passing null means the retry's
    // tree is never attached to a pending transition, so when HistoryUpdater
    // applies it, commitRouterTransition finds no match and emits nothing.
    null
  )
  // The timeline above has one exception: if the retry lands in the same
  // React batch as the navigation it corrects, the predicted tree never
  // individually reaches HistoryUpdater and the transition is still pending.
  // The retry lands the user on the server's authoritative version of that
  // same navigation, so re-point the transition at the retry's tree rather
  // than starve its commit. No-op in the already-committed case.
  retargetRouterTransition(state.tree, newState.tree)
  return newState
}
