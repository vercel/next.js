import { CacheStates } from '../../../../shared/lib/app-router-context'
import { fetchServerResponse } from '../fetch-server-response'
import { createRecordFromThenable } from '../create-record-from-thenable'
import { readRecordValue } from '../read-record-value'
import { createHrefFromUrl } from '../create-href-from-url'
import { fillLazyItemsTillLeafWithHead } from '../fill-lazy-items-till-leaf-with-head'
import { applyRouterStatePatchToTree } from '../apply-router-state-patch-to-tree'
import { isNavigatingToNewRootLayout } from '../is-navigating-to-new-root-layout'
import {
  ReadonlyReducerState,
  ReducerState,
  RefreshAction,
} from '../router-reducer-types'

export function refreshReducer(
  state: ReadonlyReducerState,
  action: RefreshAction
): ReducerState {
  const { cache, mutable } = action
  const href = state.canonicalUrl

  const isForCurrentTree =
    JSON.stringify(mutable.previousTree) === JSON.stringify(state.tree)

  if (mutable.mpaNavigation && isForCurrentTree) {
    return {
      // Set href.
      canonicalUrl: mutable.canonicalUrlOverride
        ? mutable.canonicalUrlOverride
        : state.canonicalUrl,
      // TODO-APP: verify mpaNavigation not being set is correct here.
      pushRef: {
        pendingPush: true,
        mpaNavigation: mutable.mpaNavigation,
      },
      // All navigation requires scroll and focus management to trigger.
      focusAndScrollRef: { apply: false },
      // Apply cache.
      cache: state.cache,
      prefetchCache: state.prefetchCache,
      // Apply patched router state.
      tree: state.tree,
    }
  }

  // Handle concurrent rendering / strict mode case where the cache and tree were already populated.
  if (mutable.patchedTree && isForCurrentTree) {
    return {
      // Set href.
      canonicalUrl: mutable.canonicalUrlOverride
        ? mutable.canonicalUrlOverride
        : href,
      // set pendingPush (always false in this case).
      pushRef: state.pushRef,
      // Apply focus and scroll.
      // TODO-APP: might need to disable this for Fast Refresh.
      focusAndScrollRef: { apply: false },
      cache: cache,
      prefetchCache: state.prefetchCache,
      tree: mutable.patchedTree,
    }
  }

  if (!cache.data) {
    // Fetch data from the root of the tree.
    cache.data = createRecordFromThenable(
      fetchServerResponse(new URL(href, location.origin), [
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
    return {
      canonicalUrl: flightData,
      pushRef: { pendingPush: true, mpaNavigation: true },
      focusAndScrollRef: { apply: false },
      cache: state.cache,
      prefetchCache: state.prefetchCache,
      tree: state.tree,
    }
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
  const [treePatch, subTreeData, head] = flightDataPath
  const newTree = applyRouterStatePatchToTree(
    // TODO-APP: remove ''
    [''],
    state.tree,
    treePatch
  )

  if (newTree === null) {
    throw new Error('SEGMENT MISMATCH')
  }

  const canonicalUrlOverrideHref = canonicalUrlOverride
    ? createHrefFromUrl(canonicalUrlOverride)
    : undefined

  if (canonicalUrlOverride) {
    mutable.canonicalUrlOverride = canonicalUrlOverrideHref
  }

  mutable.previousTree = state.tree
  mutable.patchedTree = newTree
  mutable.mpaNavigation = isNavigatingToNewRootLayout(state.tree, newTree)

  // Set subTreeData for the root node of the cache.
  cache.status = CacheStates.READY
  cache.subTreeData = subTreeData
  fillLazyItemsTillLeafWithHead(cache, state.cache, treePatch, head)

  return {
    // Set href, this doesn't reuse the state.canonicalUrl as because of concurrent rendering the href might change between dispatching and applying.
    canonicalUrl: canonicalUrlOverrideHref ? canonicalUrlOverrideHref : href,
    // set pendingPush (always false in this case).
    pushRef: state.pushRef,
    // TODO-APP: might need to disable this for Fast Refresh.
    focusAndScrollRef: { apply: false },
    // Apply patched cache.
    cache: cache,
    prefetchCache: state.prefetchCache,
    // Apply patched router state.
    tree: newTree,
  }
}
