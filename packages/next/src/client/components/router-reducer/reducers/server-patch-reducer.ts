import { createHrefFromUrl } from '../create-href-from-url'
import { applyRouterStatePatchToTree } from '../apply-router-state-patch-to-tree'
import { isNavigatingToNewRootLayout } from '../is-navigating-to-new-root-layout'
import type {
  ServerPatchAction,
  ReducerState,
  ReadonlyReducerState,
  Mutable,
} from '../router-reducer-types'
import { handleExternalUrl } from './navigate-reducer'
import { applyFlightData } from '../apply-flight-data'
import { handleMutable } from '../handle-mutable'
import type { CacheNode } from '../../../../shared/lib/app-router-context.shared-runtime'
import { createEmptyCacheNode } from '../../app-router'

export function serverPatchReducer(
  state: ReadonlyReducerState,
  action: ServerPatchAction
): ReducerState {
  const {
    serverResponse: { flightData, canonicalUrl: canonicalUrlOverride },
  } = action

  const mutable: Mutable = {}

  mutable.preserveCustomHistoryState = false

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

    const canonicalUrlOverrideHref = canonicalUrlOverride
      ? createHrefFromUrl(canonicalUrlOverride)
      : undefined

    if (canonicalUrlOverrideHref) {
      mutable.canonicalUrl = canonicalUrlOverrideHref
    }

    const cache: CacheNode = createEmptyCacheNode()
    applyFlightData(currentCache, cache, normalizedFlightData)

    mutable.patchedTree = newTree
    mutable.cache = cache

    currentCache = cache
    currentTree = newTree
  }

  return handleMutable(state, mutable)
}
