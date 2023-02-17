import { createHrefFromUrl } from '../create-href-from-url'
import { applyRouterStatePatchToTree } from '../apply-router-state-patch-to-tree'
import { isNavigatingToNewRootLayout } from '../is-navigating-to-new-root-layout'
import {
  ServerPatchAction,
  ReducerState,
  ReadonlyReducerState,
} from '../router-reducer-types'
import {
  handleMutable,
  applyFlightData,
  handleExternalUrl,
} from './navigate-reducer'

export function serverPatchReducer(
  state: ReadonlyReducerState,
  action: ServerPatchAction
): ReducerState {
  const { flightData, previousTree, overrideCanonicalUrl, cache, mutable } =
    action

  const isForCurrentTree =
    JSON.stringify(previousTree) === JSON.stringify(state.tree)

  // When a fetch is slow to resolve it could be that you navigated away while the request was happening or before the reducer runs.
  // In that case opt-out of applying the patch given that the data could be stale.
  if (!isForCurrentTree) {
    // TODO-APP: Handle tree mismatch
    console.log('TREE MISMATCH')
    // Keep everything as-is.
    return state
  }

  if (mutable.previousTree) {
    return handleMutable(state, mutable)
  }

  // Handle case when navigating to page in `pages` from `app`
  if (typeof flightData === 'string') {
    return handleExternalUrl(
      state,
      mutable,
      flightData,
      state.pushRef.pendingPush
    )
  }

  // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
  const flightDataPath = flightData[0]

  // Slices off the last segment (which is at -4) as it doesn't exist in the tree yet
  const flightSegmentPath = flightDataPath.slice(0, -4)
  const [treePatch] = flightDataPath.slice(-3, -2)

  const newTree = applyRouterStatePatchToTree(
    // TODO-APP: remove ''
    ['', ...flightSegmentPath],
    state.tree,
    treePatch
  )

  if (newTree === null) {
    throw new Error('SEGMENT MISMATCH')
  }

  if (isNavigatingToNewRootLayout(state.tree, newTree)) {
    return handleExternalUrl(
      state,
      mutable,
      state.canonicalUrl,
      state.pushRef.pendingPush
    )
  }

  const canonicalUrlOverrideHref = overrideCanonicalUrl
    ? createHrefFromUrl(overrideCanonicalUrl)
    : undefined

  if (canonicalUrlOverrideHref) {
    mutable.canonicalUrl = canonicalUrlOverrideHref
  }

  applyFlightData(state, cache, flightDataPath)

  mutable.previousTree = state.tree
  mutable.patchedTree = newTree
  mutable.cache = cache

  return handleMutable(state, mutable)
}
