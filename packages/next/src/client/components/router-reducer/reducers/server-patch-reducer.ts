import { createHrefFromUrl } from '../create-href-from-url'
import { applyRouterStatePatchToTreeSkipDefault } from '../apply-router-state-patch-to-tree'
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
import { handleSegmentMismatch } from '../handle-segment-mismatch'

export function serverPatchReducer(
  state: ReadonlyReducerState,
  action: ServerPatchAction
): ReducerState {
  const { serverResponse } = action
  const [flightData, overrideCanonicalUrl] = serverResponse

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

  for (const flightDataPath of flightData) {
    // Slices off the last segment (which is at -4) as it doesn't exist in the tree yet
    const flightSegmentPath = flightDataPath.slice(0, -4)

    const [treePatch] = flightDataPath.slice(-3, -2)
    const newTree = applyRouterStatePatchToTreeSkipDefault(
      // TODO-APP: remove ''
      ['', ...flightSegmentPath],
      currentTree,
      treePatch
    )

    if (newTree === null) {
      return handleSegmentMismatch(state, action, treePatch)
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

    const cache: CacheNode = createEmptyCacheNode()
    applyFlightData(currentCache, cache, flightDataPath)

    mutable.patchedTree = newTree
    mutable.cache = cache

    currentCache = cache
    currentTree = newTree
  }

  return handleMutable(state, mutable)
}
