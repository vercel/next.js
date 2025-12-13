import { createHrefFromUrl } from '../create-href-from-url'
import type {
  ServerPatchAction,
  ReducerState,
  ReadonlyReducerState,
  Mutable,
} from '../router-reducer-types'
import { handleExternalUrl, handleNavigationResult } from './navigate-reducer'
import { navigateToSeededRoute } from '../../segment-cache/navigation'
import { refreshReducer } from './refresh-reducer'
import { FreshnessPolicy } from '../ppr-navigations'

export function serverPatchReducer(
  state: ReadonlyReducerState,
  action: ServerPatchAction
): ReducerState {
  const mutable: Mutable = {}
  mutable.preserveCustomHistoryState = false

  // A "retry" is a navigation that happens due to a route mismatch. It's
  // similar to a refresh, because we will omit any existing dynamic data on
  // the page. But we seed the retry navigation with the exact tree that the
  // server just responded with.
  const retryMpa = action.mpa
  const retryUrl = new URL(action.url, location.origin)
  const retrySeed = action.seed
  if (retryMpa || retrySeed === null) {
    // If the server did not send back data during the mismatch, fall back to
    // an MPA navigation.
    return handleExternalUrl(state, mutable, retryUrl.href, false)
  }
  const currentUrl = new URL(state.canonicalUrl, location.origin)
  if (action.previousTree !== state.tree) {
    // There was another, more recent navigation since the once that
    // mismatched. We can abort the retry, but we still need to refresh the
    // page to evict any stale dynamic data.
    return refreshReducer(state)
  }
  // There have been no new navigations since the mismatched one. Refresh,
  // using the tree we just received from the server.
  const retryCanonicalUrl = createHrefFromUrl(retryUrl)
  const retryNextUrl = action.nextUrl
  // A retry should not create a new history entry.
  const pendingPush = false
  const shouldScroll = true
  const now = Date.now()
  const result = navigateToSeededRoute(
    now,
    retryUrl,
    retryCanonicalUrl,
    retrySeed,
    currentUrl,
    state.cache,
    state.tree,
    FreshnessPolicy.RefreshAll,
    retryNextUrl,
    shouldScroll
  )
  return handleNavigationResult(retryUrl, state, mutable, pendingPush, result)
}
