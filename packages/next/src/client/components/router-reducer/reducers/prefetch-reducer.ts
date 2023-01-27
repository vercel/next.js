import { applyRouterStatePatchToTree } from '../apply-router-state-patch-to-tree'
import { createHrefFromUrl } from '../create-href-from-url'
import {
  PrefetchAction,
  ReducerState,
  ReadonlyReducerState,
} from '../router-reducer-types'

export function prefetchReducer(
  state: ReadonlyReducerState,
  action: PrefetchAction
): ReducerState {
  const { url, serverResponse } = action
  const [flightData, canonicalUrlOverride] = serverResponse

  if (typeof flightData === 'string') {
    return state
  }

  const href = createHrefFromUrl(url)

  // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
  const flightDataPath = flightData[0]

  // The one before last item is the router state tree patch
  const [treePatch] = flightDataPath.slice(-3)

  const flightSegmentPath = flightDataPath.slice(0, -3)

  const newTree = applyRouterStatePatchToTree(
    // TODO-APP: remove ''
    ['', ...flightSegmentPath],
    state.tree,
    treePatch
  )

  // Patch did not apply correctly
  if (newTree === null) {
    return state
  }

  // Create new tree based on the flightSegmentPath and router state patch
  state.prefetchCache.set(href, {
    flightData,
    // Create new tree based on the flightSegmentPath and router state patch
    tree: newTree,
    canonicalUrlOverride,
  })

  return state
}
