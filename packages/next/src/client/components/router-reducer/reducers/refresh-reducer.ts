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
import {
  handleMutable,
  applyFlightData,
  handleExternalUrl,
} from './navigate-reducer'

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
      fetchServerResponse(new URL(href, origin), [
        state.tree[0],
        state.tree[1],
        state.tree[2],
        'refetch',
      ])
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

  const applied = applyFlightData(state, cache, flightDataPath)

  if (applied) {
    mutable.cache = cache
  }

  mutable.previousTree = state.tree
  mutable.patchedTree = newTree
  mutable.canonicalUrl = href

  return handleMutable(state, mutable)
}
