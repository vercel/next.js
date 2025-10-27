import {
  fetchServerResponse,
  type FetchServerResponseResult,
} from '../fetch-server-response'
import { createHrefFromUrl } from '../create-href-from-url'
import { applyRouterStatePatchToTree } from '../apply-router-state-patch-to-tree'
import { isNavigatingToNewRootLayout } from '../is-navigating-to-new-root-layout'
import type {
  Mutable,
  ReadonlyReducerState,
  ReducerState,
  RefreshAction,
} from '../router-reducer-types'
import { handleExternalUrl } from './navigate-reducer'
import { handleMutable } from '../handle-mutable'
import type { CacheNode } from '../../../../shared/lib/app-router-types'
import { fillLazyItemsTillLeafWithHead } from '../fill-lazy-items-till-leaf-with-head'
import { createEmptyCacheNode } from '../../app-router'
import { handleSegmentMismatch } from '../handle-segment-mismatch'
import { hasInterceptionRouteInCurrentTree } from './has-interception-route-in-current-tree'
import { refreshInactiveParallelSegments } from '../refetch-inactive-parallel-segments'
import { revalidateEntireCache } from '../../segment-cache'

export function refreshReducer(
  state: ReadonlyReducerState,
  action: RefreshAction
): ReducerState {
  const { origin } = action
  const mutable: Mutable = {}
  const href = state.canonicalUrl

  let currentTree = state.tree

  mutable.preserveCustomHistoryState = false

  const cache: CacheNode = createEmptyCacheNode()

  // If the current tree was intercepted, the nextUrl should be included in the request.
  // This is to ensure that the refresh request doesn't get intercepted, accidentally triggering the interception route.
  const includeNextUrl = hasInterceptionRouteInCurrentTree(state.tree)

  // TODO-APP: verify that `href` is not an external url.
  // Fetch data from the root of the tree.
  cache.lazyData = fetchServerResponse(new URL(href, origin), {
    flightRouterState: [
      currentTree[0],
      currentTree[1],
      currentTree[2],
      'refetch',
    ],
    nextUrl: includeNextUrl ? state.nextUrl : null,
  })

  const navigatedAt = Date.now()
  return cache.lazyData.then(
    async (result: FetchServerResponseResult) => {
      // Handle case when navigating to page in `pages` from `app`
      if (typeof result === 'string') {
        return handleExternalUrl(
          state,
          mutable,
          result,
          state.pushRef.pendingPush
        )
      }

      const { flightData, canonicalUrl, renderedSearch } = result

      // Remove cache.lazyData as it has been resolved at this point.
      cache.lazyData = null

      for (const normalizedFlightData of flightData) {
        const {
          tree: treePatch,
          seedData: cacheNodeSeedData,
          head,
          isRootRender,
        } = normalizedFlightData

        if (!isRootRender) {
          // TODO-APP: handle this case better
          console.log('REFRESH FAILED')
          return state
        }

        const newTree = applyRouterStatePatchToTree(
          // TODO-APP: remove ''
          [''],
          currentTree,
          treePatch,
          state.canonicalUrl
        )

        if (newTree === null) {
          return handleSegmentMismatch(state, action, treePatch)
        }

        if (isNavigatingToNewRootLayout(currentTree, newTree)) {
          return handleExternalUrl(
            state,
            mutable,
            href,
            state.pushRef.pendingPush
          )
        }

        mutable.canonicalUrl = createHrefFromUrl(canonicalUrl)

        // Handles case where prefetch only returns the router tree patch without rendered components.
        if (cacheNodeSeedData !== null) {
          const rsc = cacheNodeSeedData[0]
          const loading = cacheNodeSeedData[2]
          cache.rsc = rsc
          cache.prefetchRsc = null
          cache.loading = loading
          fillLazyItemsTillLeafWithHead(
            navigatedAt,
            cache,
            // Existing cache is not passed in as `router.refresh()` has to invalidate the entire cache.
            undefined,
            treePatch,
            cacheNodeSeedData,
            head
          )
          revalidateEntireCache(state.nextUrl, newTree)
        }

        await refreshInactiveParallelSegments({
          navigatedAt,
          state,
          updatedTree: newTree,
          updatedCache: cache,
          includeNextUrl,
          canonicalUrl: mutable.canonicalUrl || state.canonicalUrl,
        })

        mutable.cache = cache
        mutable.patchedTree = newTree
        mutable.renderedSearch = renderedSearch

        currentTree = newTree
      }

      return handleMutable(state, mutable)
    },
    () => state
  )
}
