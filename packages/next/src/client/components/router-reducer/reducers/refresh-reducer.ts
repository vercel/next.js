import { fetchServerResponse } from '../fetch-server-response'
import { createRecordFromThenable } from '../create-record-from-thenable'
import { readRecordValue } from '../read-record-value'
import { createHrefFromUrl } from '../create-href-from-url'
import { applyRouterStatePatchToTree } from '../apply-router-state-patch-to-tree'
import { isNavigatingToNewRootLayout } from '../is-navigating-to-new-root-layout'
import {
  ReadonlyReducerState,
  ReducerState,
  RefreshAction,
} from '../router-reducer-types'
import { handleExternalUrl } from './navigate-reducer'
import { handleMutable } from '../handle-mutable'
import { CacheStates } from '../../../../shared/lib/app-router-context'
import { fillLazyItemsTillLeafWithHead } from '../fill-lazy-items-till-leaf-with-head'

export function refreshReducer(
  state: ReadonlyReducerState,
  action: RefreshAction
): ReducerState {
  const { cache, mutable, origin } = action
  const href = state.canonicalUrl

  const isForCurrentTree =
    JSON.stringify(mutable.previousTree) === JSON.stringify(state.tree)

  if (isForCurrentTree) {
    return handleMutable(state, mutable)
  }

  if (!cache.data) {
    // TODO-APP: verify that `href` is not an external url.
    // Fetch data from the root of the tree.
    cache.data = createRecordFromThenable(
      fetchServerResponse(
        new URL(href, origin),
        [state.tree[0], state.tree[1], state.tree[2], 'refetch'],
        state.nextUrl
      )
    )
  }
  const [flightData, canonicalUrlOverride] = readRecordValue(cache.data!)

  // Handle case when navigating to page in `pages` from `app`
  if (typeof flightData === 'string') {
    return handleExternalUrl(
      state,
      mutable,
      flightData,
      state.pushRef.pendingPush
    )
  }

  // Remove cache.data as it has been resolved at this point.
  cache.data = null

  // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
  const flightDataPath = flightData[0]

  // FlightDataPath with more than two items means unexpected Flight data was returned
  if (flightDataPath.length !== 3) {
    // TODO-APP: handle this case better
    console.log('REFRESH FAILED')
    return state
  }

  // Given the path can only have two items the items are only the router state and subTreeData for the root.
  const [treePatch] = flightDataPath
  const newTree = applyRouterStatePatchToTree(
    // TODO-APP: remove ''
    [''],
    state.tree,
    treePatch
  )

  if (newTree === null) {
    throw new Error('SEGMENT MISMATCH')
  }

  if (isNavigatingToNewRootLayout(state.tree, newTree)) {
    return handleExternalUrl(state, mutable, href, state.pushRef.pendingPush)
  }

  const canonicalUrlOverrideHref = canonicalUrlOverride
    ? createHrefFromUrl(canonicalUrlOverride)
    : undefined

  if (canonicalUrlOverride) {
    mutable.canonicalUrl = canonicalUrlOverrideHref
  }

  // The one before last item is the router state tree patch
  const [subTreeData, head] = flightDataPath.slice(-2)

  // Handles case where prefetch only returns the router tree patch without rendered components.
  if (subTreeData !== null) {
    cache.status = CacheStates.READY
    cache.subTreeData = subTreeData
    fillLazyItemsTillLeafWithHead(
      cache,
      // Existing cache is not passed in as `router.refresh()` has to invalidate the entire cache.
      undefined,
      treePatch,
      head
    )
    mutable.cache = cache
    mutable.prefetchCache = new Map()
  }

  mutable.previousTree = state.tree
  mutable.patchedTree = newTree
  mutable.canonicalUrl = href

  return handleMutable(state, mutable)
}
