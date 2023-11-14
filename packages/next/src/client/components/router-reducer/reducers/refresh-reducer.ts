import { fetchServerResponse } from '../fetch-server-response'
import { createHrefFromUrl } from '../create-href-from-url'
import { applyRouterStatePatchToTree } from '../apply-router-state-patch-to-tree'
import { isNavigatingToNewRootLayout } from '../is-navigating-to-new-root-layout'
import type {
  ReadonlyReducerState,
  ReducerState,
  RefreshAction,
} from '../router-reducer-types'
import { handleExternalUrl } from './navigate-reducer'
import { handleMutable } from '../handle-mutable'
import { CacheStates } from '../../../../shared/lib/app-router-context.shared-runtime'
import { fillLazyItemsTillLeafWithHead } from '../fill-lazy-items-till-leaf-with-head'

export function refreshReducer(
  state: ReadonlyReducerState,
  action: RefreshAction
): ReducerState {
  const { cache, mutable, origin } = action
  const href = state.canonicalUrl

  let currentTree = state.tree

  const isForCurrentTree =
    JSON.stringify(mutable.previousTree) === JSON.stringify(currentTree)

  if (isForCurrentTree) {
    return handleMutable(state, mutable)
  }

  mutable.preserveCustomHistoryState = false

  if (!cache.data) {
    // TODO-APP: verify that `href` is not an external url.
    // Fetch data from the root of the tree.
    cache.data = fetchServerResponse(
      new URL(href, origin),
      [currentTree[0], currentTree[1], currentTree[2], 'refetch'],
      state.nextUrl,
      state.buildId
    )
  }

  return cache.data.then(
    ([flightData, canonicalUrlOverride]) => {
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

      for (const flightDataPath of flightData) {
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
            href,
            state.pushRef.pendingPush
          )
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

        mutable.previousTree = currentTree
        mutable.patchedTree = newTree
        mutable.canonicalUrl = href

        currentTree = newTree
      }

      return handleMutable(state, mutable)
    },
    () => state
  )
}
