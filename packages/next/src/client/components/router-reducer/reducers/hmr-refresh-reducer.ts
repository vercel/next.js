import {
  fetchServerResponse,
  type FetchServerResponseResult,
} from '../fetch-server-response'
import { createHrefFromUrl } from '../create-href-from-url'
import { applyRouterStatePatchToTree } from '../apply-router-state-patch-to-tree'
import { isNavigatingToNewRootLayout } from '../is-navigating-to-new-root-layout'
import type {
  ReadonlyReducerState,
  ReducerState,
  HmrRefreshAction,
  Mutable,
} from '../router-reducer-types'
import { handleExternalUrl } from './navigate-reducer'
import { handleMutable } from '../handle-mutable'
import { applyFlightData } from '../apply-flight-data'
import type { CacheNode } from '../../../../shared/lib/app-router-types'
import { createEmptyCacheNode } from '../../app-router'
import { handleSegmentMismatch } from '../handle-segment-mismatch'
import { hasInterceptionRouteInCurrentTree } from './has-interception-route-in-current-tree'

// A version of refresh reducer that keeps the cache around instead of wiping all of it.
function hmrRefreshReducerImpl(
  state: ReadonlyReducerState,
  action: HmrRefreshAction
): ReducerState {
  const { origin } = action
  const mutable: Mutable = {}
  const href = state.canonicalUrl

  mutable.preserveCustomHistoryState = false

  const cache: CacheNode = createEmptyCacheNode()
  // If the current tree was intercepted, the nextUrl should be included in the request.
  // This is to ensure that the refresh request doesn't get intercepted, accidentally triggering the interception route.
  const includeNextUrl = hasInterceptionRouteInCurrentTree(state.tree)

  // TODO-APP: verify that `href` is not an external url.
  // Fetch data from the root of the tree.
  const navigatedAt = Date.now()
  cache.lazyData = fetchServerResponse(new URL(href, origin), {
    flightRouterState: [state.tree[0], state.tree[1], state.tree[2], 'refetch'],
    nextUrl: includeNextUrl ? state.nextUrl : null,
    isHmrRefresh: true,
  })

  return cache.lazyData.then(
    (result: FetchServerResponseResult) => {
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

      let currentTree = state.tree
      let currentCache = state.cache

      for (const normalizedFlightData of flightData) {
        const { tree: treePatch, isRootRender } = normalizedFlightData
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

        const applied = applyFlightData(
          navigatedAt,
          currentCache,
          cache,
          normalizedFlightData
        )

        if (applied) {
          mutable.cache = cache
          currentCache = cache
        }

        mutable.patchedTree = newTree
        mutable.renderedSearch = renderedSearch
        mutable.canonicalUrl = createHrefFromUrl(canonicalUrl)

        currentTree = newTree
      }
      return handleMutable(state, mutable)
    },
    () => state
  )
}

function hmrRefreshReducerNoop(
  state: ReadonlyReducerState,
  _action: HmrRefreshAction
): ReducerState {
  return state
}

export const hmrRefreshReducer =
  process.env.NODE_ENV === 'production'
    ? hmrRefreshReducerNoop
    : hmrRefreshReducerImpl
