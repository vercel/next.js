import { createHrefFromUrl } from '../create-href-from-url'
import { applyRouterStatePatchToTree } from '../apply-router-state-patch-to-tree'
import { isNavigatingToNewRootLayout } from '../is-navigating-to-new-root-layout'
import {
  ServerPatchAction,
  ReducerState,
  ReadonlyReducerState,
} from '../router-reducer-types'
import { handleExternalUrl } from './navigate-reducer'
import { applyFlightData } from '../apply-flight-data'
import { handleMutable } from '../handle-mutable'

export function serverPatchReducer(
  state: ReadonlyReducerState,
  action: ServerPatchAction
): ReducerState {
  const { flightData, overrideCanonicalUrl, cache, mutable } = action

  const isForCurrentTree =
    JSON.stringify(mutable.previousTree) === JSON.stringify(state.tree)

  if (isForCurrentTree) {
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

  let currentTree = state.tree
  let currentCache = state.cache

  for (const flightDataPath of flightData) {
    // Slices off the last segment (which is at -4) as it doesn't exist in the tree yet
    const flightSegmentPath = flightDataPath.slice(0, -4)

    const [treePatch] = flightDataPath.slice(-3, -2)
    const newTree = applyRouterStatePatchToTree(
      // TODO-APP: remove ''
      ['', ...flightSegmentPath],
      currentTree,
      treePatch
    )

    if (newTree === null) {
      throw new Error('SEGMENT MISMATCH')
    }

    if (isNavigatingToNewRootLayout(currentTree, newTree)) {
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

    applyFlightData(currentCache, cache, flightDataPath)

    mutable.previousTree = currentTree
    mutable.patchedTree = newTree
    mutable.cache = cache

    currentCache = cache
    currentTree = newTree
  }

  return handleMutable(state, mutable)
}
