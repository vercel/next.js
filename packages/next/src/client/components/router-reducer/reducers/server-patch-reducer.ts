import { createHrefFromUrl } from '../create-href-from-url'
import { applyRouterStatePatchToTree } from '../apply-router-state-patch-to-tree'
import { isNavigatingToNewRootLayout } from '../is-navigating-to-new-root-layout'
import type {
  ServerPatchAction,
  ReducerState,
  ReadonlyReducerState,
  Mutable,
} from '../router-reducer-types'
import { handleExternalUrl, handleNavigationResult } from './navigate-reducer'
import { applyFlightData } from '../apply-flight-data'
import { handleMutable } from '../handle-mutable'
import type { CacheNode } from '../../../../shared/lib/app-router-types'
import { createEmptyCacheNode } from '../../app-router'
import { navigateToSeededRoute } from '../../segment-cache/navigation'
import { refreshReducer } from './refresh-reducer'
import { FreshnessPolicy } from '../ppr-navigations'

export function serverPatchReducer(
  state: ReadonlyReducerState,
  action: ServerPatchAction
): ReducerState {
  const { serverResponse, navigatedAt, retry, previousTree } = action

  const mutable: Mutable = {}

  mutable.preserveCustomHistoryState = false

  if (retry !== null) {
    // A "retry" is a navigation that happens due to a route mismatch. It's
    // similar to a refresh, because we will omit any existing dynamic data on
    // the page. But we seed the retry navigation with the exact tree that the
    // server just responded with.
    const retryMpa = retry.mpa
    const retryUrl = new URL(retry.url, location.origin)
    const retrySeed = retry.seed
    if (retryMpa || retrySeed === null) {
      // If the server did not send back data during the mismatch, fall back to
      // an MPA navigation.
      return handleExternalUrl(state, mutable, retryUrl.href, false)
    }
    const currentUrl = new URL(state.canonicalUrl, location.origin)
    if (previousTree !== state.tree) {
      // There was another, more recent navigation since the once that
      // mismatched. We can abort the retry, but we still need to refresh the
      // page to evict any stale dynamic data.
      return refreshReducer(state)
    }
    // There have been no new navigations since the mismatched one. Refresh,
    // using the tree we just received from the server.
    const retryCanonicalUrl = createHrefFromUrl(retryUrl)
    const retryNextUrl = retry.nextUrl
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

  // TODO: The rest of this reducer will be deleted once we migrate the
  // remaining to reducers to no longer rely on the lazy data fetch that happens
  // on mismatch in LayoutRouter.

  if (serverResponse === null) {
    // No data provided. Fall back to a hard refresh.
    return handleExternalUrl(
      state,
      mutable,
      state.canonicalUrl,
      state.pushRef.pendingPush
    )
  }

  // Handle case when navigating to page in `pages` from `app`
  if (typeof serverResponse === 'string') {
    return handleExternalUrl(
      state,
      mutable,
      serverResponse,
      state.pushRef.pendingPush
    )
  }

  const { flightData, canonicalUrl, renderedSearch } = serverResponse

  let currentTree = state.tree
  let currentCache = state.cache

  for (const normalizedFlightData of flightData) {
    const { segmentPath: flightSegmentPath, tree: treePatch } =
      normalizedFlightData

    const newTree = applyRouterStatePatchToTree(
      // TODO-APP: remove ''
      ['', ...flightSegmentPath],
      currentTree,
      treePatch,
      state.canonicalUrl
    )

    // `applyRouterStatePatchToTree` returns `null` when it determined that the server response is not applicable to the current tree.
    // In other words, the server responded with a tree that doesn't match what the client is currently rendering.
    // This can happen if the server patch action took longer to resolve than a subsequent navigation which would have changed the tree.
    // Previously this case triggered an MPA navigation but it should be safe to simply discard the server response rather than forcing
    // the entire page to reload.
    if (newTree === null) {
      return state
    }

    if (isNavigatingToNewRootLayout(currentTree, newTree)) {
      return handleExternalUrl(
        state,
        mutable,
        state.canonicalUrl,
        state.pushRef.pendingPush
      )
    }

    mutable.canonicalUrl = createHrefFromUrl(canonicalUrl)

    const cache: CacheNode = createEmptyCacheNode()
    applyFlightData(navigatedAt, currentCache, cache, normalizedFlightData)

    mutable.patchedTree = newTree
    mutable.renderedSearch = renderedSearch
    mutable.cache = cache

    currentCache = cache
    currentTree = newTree
  }

  return handleMutable(state, mutable)
}
