import { CacheStates } from '../../../../shared/lib/app-router-context'
import type { FlightSegmentPath } from '../../../../server/app-render'
import { fetchServerResponse } from '../fetch-server-response'
import { createRecordFromThenable } from '../create-record-from-thenable'
import { readRecordValue } from '../read-record-value'
import { createHrefFromUrl } from '../create-href-from-url'
import { fillLazyItemsTillLeafWithHead } from '../fill-lazy-items-till-leaf-with-head'
import { fillCacheWithNewSubTreeData } from '../fill-cache-with-new-subtree-data'
import { invalidateCacheBelowFlightSegmentPath } from '../invalidate-cache-below-flight-segmentpath'
import { fillCacheWithDataProperty } from '../fill-cache-with-data-property'
import { createOptimisticTree } from '../create-optimistic-tree'
import { applyRouterStatePatchToTree } from '../apply-router-state-patch-to-tree'
import { shouldHardNavigate } from '../should-hard-navigate'
import { isNavigatingToNewRootLayout } from '../is-navigating-to-new-root-layout'
import {
  NavigateAction,
  ReadonlyReducerState,
  ReducerState,
} from '../router-reducer-types'

export function navigateReducer(
  state: ReadonlyReducerState,
  action: NavigateAction
): ReducerState {
  const {
    url,
    isExternalUrl,
    navigateType,
    cache,
    mutable,
    forceOptimisticNavigation,
  } = action

  if (isExternalUrl) {
    return {
      // Set href.
      canonicalUrl: url.toString(),
      pushRef: {
        pendingPush: false,
        mpaNavigation: true,
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

  const { pathname, search } = url
  const href = createHrefFromUrl(url)
  const pendingPush = navigateType === 'push'

  const isForCurrentTree =
    JSON.stringify(mutable.previousTree) === JSON.stringify(state.tree)

  if (mutable.mpaNavigation && isForCurrentTree) {
    return {
      // Set href.
      canonicalUrl: mutable.canonicalUrlOverride
        ? mutable.canonicalUrlOverride
        : href,
      pushRef: {
        pendingPush,
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
      pushRef: {
        pendingPush,
        mpaNavigation: false,
      },
      // All navigation requires scroll and focus management to trigger.
      focusAndScrollRef: { apply: true },
      // Apply cache.
      cache: mutable.useExistingCache ? state.cache : cache,
      prefetchCache: state.prefetchCache,
      // Apply patched router state.
      tree: mutable.patchedTree,
    }
  }

  const prefetchValues = state.prefetchCache.get(href)
  if (prefetchValues) {
    // The one before last item is the router state tree patch
    const { flightData, tree: newTree, canonicalUrlOverride } = prefetchValues

    // Handle case when navigating to page in `pages` from `app`
    if (typeof flightData === 'string') {
      return {
        canonicalUrl: flightData,
        // Enable mpaNavigation
        pushRef: { pendingPush: true, mpaNavigation: true },
        // Don't apply scroll and focus management.
        focusAndScrollRef: { apply: false },
        cache: state.cache,
        prefetchCache: state.prefetchCache,
        tree: state.tree,
      }
    }

    if (newTree !== null) {
      mutable.previousTree = state.tree
      mutable.patchedTree = newTree
      mutable.mpaNavigation = isNavigatingToNewRootLayout(state.tree, newTree)

      if (newTree === null) {
        throw new Error('SEGMENT MISMATCH')
      }

      const canonicalUrlOverrideHrefVal = canonicalUrlOverride
        ? createHrefFromUrl(canonicalUrlOverride)
        : undefined
      if (canonicalUrlOverrideHrefVal) {
        mutable.canonicalUrlOverride = canonicalUrlOverrideHrefVal
      }
      mutable.mpaNavigation = isNavigatingToNewRootLayout(state.tree, newTree)

      // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
      const flightDataPath = flightData[0]
      const flightSegmentPath = flightDataPath.slice(
        0,
        -3
      ) as unknown as FlightSegmentPath
      // The one before last item is the router state tree patch
      const [treePatch, subTreeData, head] = flightDataPath.slice(-3)

      // Handles case where prefetch only returns the router tree patch without rendered components.
      if (subTreeData !== null) {
        if (flightDataPath.length === 3) {
          cache.status = CacheStates.READY
          cache.subTreeData = subTreeData
          cache.parallelRoutes = new Map()
          fillLazyItemsTillLeafWithHead(cache, state.cache, treePatch, head)
        } else {
          cache.status = CacheStates.READY
          // Copy subTreeData for the root node of the cache.
          cache.subTreeData = state.cache.subTreeData
          // Create a copy of the existing cache with the subTreeData applied.
          fillCacheWithNewSubTreeData(cache, state.cache, flightDataPath)
        }
      }

      const hardNavigate =
        // TODO-APP: Revisit if this is correct.
        search !== location.search ||
        shouldHardNavigate(
          // TODO-APP: remove ''
          ['', ...flightSegmentPath],
          state.tree
        )

      if (hardNavigate) {
        cache.status = CacheStates.READY
        // Copy subTreeData for the root node of the cache.
        cache.subTreeData = state.cache.subTreeData

        invalidateCacheBelowFlightSegmentPath(
          cache,
          state.cache,
          flightSegmentPath
        )
        // Ensure the existing cache value is used when the cache was not invalidated.
      } else if (subTreeData === null) {
        mutable.useExistingCache = true
      }

      const canonicalUrlOverrideHref = canonicalUrlOverride
        ? createHrefFromUrl(canonicalUrlOverride)
        : undefined

      if (canonicalUrlOverrideHref) {
        mutable.canonicalUrlOverride = canonicalUrlOverrideHref
      }

      return {
        // Set href.
        canonicalUrl: canonicalUrlOverrideHref
          ? canonicalUrlOverrideHref
          : href,
        // Set pendingPush.
        pushRef: { pendingPush, mpaNavigation: false },
        // All navigation requires scroll and focus management to trigger.
        focusAndScrollRef: { apply: true },
        // Apply patched cache.
        cache: mutable.useExistingCache ? state.cache : cache,
        prefetchCache: state.prefetchCache,
        // Apply patched tree.
        tree: newTree,
      }
    }
  }

  // When doing a hard push there can be two cases: with optimistic tree and without
  // The with optimistic tree case only happens when the layouts have a loading state (loading.js)
  // The without optimistic tree case happens when there is no loading state, in that case we suspend in this reducer

  // forceOptimisticNavigation is used for links that have `prefetch={false}`.
  if (forceOptimisticNavigation) {
    const segments = pathname.split('/')
    // TODO-APP: figure out something better for index pages
    segments.push('')

    // Optimistic tree case.
    // If the optimistic tree is deeper than the current state leave that deeper part out of the fetch
    const optimisticTree = createOptimisticTree(segments, state.tree, false)

    // Copy subTreeData for the root node of the cache.
    cache.status = CacheStates.READY
    cache.subTreeData = state.cache.subTreeData

    // Copy existing cache nodes as far as possible and fill in `data` property with the started data fetch.
    // The `data` property is used to suspend in layout-router during render if it hasn't resolved yet by the time it renders.
    const res = fillCacheWithDataProperty(
      cache,
      state.cache,
      // TODO-APP: segments.slice(1) strips '', we can get rid of '' altogether.
      segments.slice(1),
      () => fetchServerResponse(url, optimisticTree)
    )

    // If optimistic fetch couldn't happen it falls back to the non-optimistic case.
    if (!res?.bailOptimistic) {
      mutable.previousTree = state.tree
      mutable.patchedTree = optimisticTree
      mutable.mpaNavigation = isNavigatingToNewRootLayout(
        state.tree,
        optimisticTree
      )
      return {
        // Set href.
        canonicalUrl: href,
        // Set pendingPush.
        pushRef: { pendingPush, mpaNavigation: false },
        // All navigation requires scroll and focus management to trigger.
        focusAndScrollRef: { apply: true },
        // Apply patched cache.
        cache: cache,
        prefetchCache: state.prefetchCache,
        // Apply optimistic tree.
        tree: optimisticTree,
      }
    }
  }

  // Below is the not-optimistic case. Data is fetched at the root and suspended there without a suspense boundary.

  // If no in-flight fetch at the top, start it.
  if (!cache.data) {
    cache.data = createRecordFromThenable(fetchServerResponse(url, state.tree))
  }

  // Unwrap cache data with `use` to suspend here (in the reducer) until the fetch resolves.
  const [flightData, canonicalUrlOverride] = readRecordValue(cache.data!)

  // Handle case when navigating to page in `pages` from `app`
  if (typeof flightData === 'string') {
    return {
      canonicalUrl: flightData,
      // Enable mpaNavigation
      pushRef: { pendingPush: true, mpaNavigation: true },
      // Don't apply scroll and focus management.
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

  // The one before last item is the router state tree patch
  const [treePatch, subTreeData, head] = flightDataPath.slice(-3)

  // Path without the last segment, router state, and the subTreeData
  const flightSegmentPath = flightDataPath.slice(0, -4)

  // Create new tree based on the flightSegmentPath and router state patch
  const newTree = applyRouterStatePatchToTree(
    // TODO-APP: remove ''
    ['', ...flightSegmentPath],
    state.tree,
    treePatch
  )

  if (newTree === null) {
    throw new Error('SEGMENT MISMATCH')
  }

  const canonicalUrlOverrideHref = canonicalUrlOverride
    ? createHrefFromUrl(canonicalUrlOverride)
    : undefined
  if (canonicalUrlOverrideHref) {
    mutable.canonicalUrlOverride = canonicalUrlOverrideHref
  }
  mutable.previousTree = state.tree
  mutable.patchedTree = newTree
  mutable.mpaNavigation = isNavigatingToNewRootLayout(state.tree, newTree)

  if (flightDataPath.length === 3) {
    cache.status = CacheStates.READY
    cache.subTreeData = subTreeData
    fillLazyItemsTillLeafWithHead(cache, state.cache, treePatch, head)
  } else {
    // Copy subTreeData for the root node of the cache.
    cache.status = CacheStates.READY
    cache.subTreeData = state.cache.subTreeData
    // Create a copy of the existing cache with the subTreeData applied.
    fillCacheWithNewSubTreeData(cache, state.cache, flightDataPath)
  }

  return {
    // Set href.
    canonicalUrl: canonicalUrlOverrideHref ? canonicalUrlOverrideHref : href,
    // Set pendingPush.
    pushRef: { pendingPush, mpaNavigation: false },
    // All navigation requires scroll and focus management to trigger.
    focusAndScrollRef: { apply: true },
    // Apply patched cache.
    cache: cache,
    prefetchCache: state.prefetchCache,
    // Apply patched tree.
    tree: newTree,
  }
}
