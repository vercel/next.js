import { CacheStates } from '../../../../shared/lib/app-router-context'
import { createHrefFromUrl } from '../create-href-from-url'
import { fillLazyItemsTillLeafWithHead } from '../fill-lazy-items-till-leaf-with-head'
import { fillCacheWithNewSubTreeData } from '../fill-cache-with-new-subtree-data'
import { applyRouterStatePatchToTree } from '../apply-router-state-patch-to-tree'
import { isNavigatingToNewRootLayout } from '../is-navigating-to-new-root-layout'
import {
  ServerPatchAction,
  ReducerState,
  ReadonlyReducerState,
} from '../router-reducer-types'

export function serverPatchReducer(
  state: ReadonlyReducerState,
  action: ServerPatchAction
): ReducerState {
  const { flightData, previousTree, overrideCanonicalUrl, cache, mutable } =
    action

  // When a fetch is slow to resolve it could be that you navigated away while the request was happening or before the reducer runs.
  // In that case opt-out of applying the patch given that the data could be stale.
  if (JSON.stringify(previousTree) !== JSON.stringify(state.tree)) {
    // TODO-APP: Handle tree mismatch
    console.log('TREE MISMATCH')
    // Keep everything as-is.
    return state
  }

  if (mutable.mpaNavigation) {
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
  if (mutable.patchedTree) {
    return {
      // Keep href as it was set during navigate / restore
      canonicalUrl: mutable.canonicalUrlOverride
        ? mutable.canonicalUrlOverride
        : state.canonicalUrl,
      // Keep pushRef as server-patch only causes cache/tree update.
      pushRef: state.pushRef,
      // Keep focusAndScrollRef as server-patch only causes cache/tree update.
      focusAndScrollRef: state.focusAndScrollRef,
      // Apply patched router state
      tree: mutable.patchedTree,
      prefetchCache: state.prefetchCache,
      // Apply patched cache
      cache: cache,
    }
  }

  // Handle case when navigating to page in `pages` from `app`
  if (typeof flightData === 'string') {
    return {
      // Set href.
      canonicalUrl: flightData,
      // Enable mpaNavigation as this is a navigation that the app-router shouldn't handle.
      pushRef: { pendingPush: true, mpaNavigation: true },
      // Don't apply scroll and focus management.
      focusAndScrollRef: { apply: false },
      // Other state is kept as-is.
      cache: state.cache,
      prefetchCache: state.prefetchCache,
      tree: state.tree,
    }
  }

  // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
  const flightDataPath = flightData[0]

  // Slices off the last segment (which is at -4) as it doesn't exist in the tree yet
  const flightSegmentPath = flightDataPath.slice(0, -4)
  const [treePatch, subTreeData, head] = flightDataPath.slice(-3)

  const newTree = applyRouterStatePatchToTree(
    // TODO-APP: remove ''
    ['', ...flightSegmentPath],
    state.tree,
    treePatch
  )

  if (newTree === null) {
    throw new Error('SEGMENT MISMATCH')
  }

  const canonicalUrlOverrideHref = overrideCanonicalUrl
    ? createHrefFromUrl(overrideCanonicalUrl)
    : undefined

  if (canonicalUrlOverrideHref) {
    mutable.canonicalUrlOverride = canonicalUrlOverrideHref
  }

  mutable.patchedTree = newTree
  mutable.mpaNavigation = isNavigatingToNewRootLayout(state.tree, newTree)

  // Root refresh
  if (flightDataPath.length === 3) {
    cache.status = CacheStates.READY
    cache.subTreeData = subTreeData
    fillLazyItemsTillLeafWithHead(cache, state.cache, treePatch, head)
  } else {
    // Copy subTreeData for the root node of the cache.
    cache.status = CacheStates.READY
    cache.subTreeData = state.cache.subTreeData
    fillCacheWithNewSubTreeData(cache, state.cache, flightDataPath)
  }

  return {
    // Keep href as it was set during navigate / restore
    canonicalUrl: canonicalUrlOverrideHref
      ? canonicalUrlOverrideHref
      : state.canonicalUrl,
    // Keep pushRef as server-patch only causes cache/tree update.
    pushRef: state.pushRef,
    // Keep focusAndScrollRef as server-patch only causes cache/tree update.
    focusAndScrollRef: state.focusAndScrollRef,
    // Apply patched router state
    tree: newTree,
    prefetchCache: state.prefetchCache,
    // Apply patched cache
    cache: cache,
  }
}
