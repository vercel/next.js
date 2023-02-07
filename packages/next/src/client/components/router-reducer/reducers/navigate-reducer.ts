import {
  CacheNode,
  CacheStates,
} from '../../../../shared/lib/app-router-context'
import type {
  FlightDataPath,
  FlightSegmentPath,
} from '../../../../server/app-render'
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
  Mutable,
  NavigateAction,
  ReadonlyReducerState,
  ReducerState,
} from '../router-reducer-types'

export function handleMutable(
  state: ReadonlyReducerState,
  mutable: Mutable
): ReducerState {
  return {
    // Set href.
    canonicalUrl:
      typeof mutable.canonicalUrl !== 'undefined'
        ? mutable.canonicalUrl === state.canonicalUrl
          ? state.canonicalUrl
          : mutable.canonicalUrl
        : state.canonicalUrl,
    pushRef: {
      pendingPush:
        typeof mutable.pendingPush !== 'undefined'
          ? mutable.pendingPush
          : state.pushRef.pendingPush,
      mpaNavigation:
        typeof mutable.mpaNavigation !== 'undefined'
          ? mutable.mpaNavigation
          : state.pushRef.mpaNavigation,
    },
    // All navigation requires scroll and focus management to trigger.
    focusAndScrollRef: {
      apply:
        typeof mutable.applyFocusAndScroll !== 'undefined'
          ? mutable.applyFocusAndScroll
          : state.focusAndScrollRef.apply,
    },
    // Apply cache.
    cache: mutable.cache ? mutable.cache : state.cache,
    prefetchCache: state.prefetchCache,
    // Apply patched router state.
    tree:
      typeof mutable.patchedTree !== 'undefined'
        ? mutable.patchedTree
        : state.tree,
  }
}

export function applyFlightData(
  state: ReadonlyReducerState,
  cache: CacheNode,
  flightDataPath: FlightDataPath
): boolean {
  // The one before last item is the router state tree patch
  const [treePatch, subTreeData, head] = flightDataPath.slice(-3)

  // Handles case where prefetch only returns the router tree patch without rendered components.
  if (subTreeData === null) {
    return false
  }

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

  return true
}

export function handleExternalUrl(
  state: ReadonlyReducerState,
  mutable: Mutable,
  url: string,
  pendingPush: boolean
) {
  mutable.previousTree = state.tree
  mutable.mpaNavigation = true
  mutable.canonicalUrl = url
  mutable.pendingPush = pendingPush
  mutable.applyFocusAndScroll = false

  return handleMutable(state, mutable)
}

export function navigateReducer(
  state: ReadonlyReducerState,
  action: NavigateAction
): ReducerState {
  const {
    url,
    isExternalUrl,
    locationSearch,
    navigateType,
    cache,
    mutable,
    forceOptimisticNavigation,
  } = action
  const { pathname, search } = url
  const href = createHrefFromUrl(url)
  const pendingPush = navigateType === 'push'

  const isForCurrentTree =
    JSON.stringify(mutable.previousTree) === JSON.stringify(state.tree)

  if (isForCurrentTree) {
    return handleMutable(state, mutable)
  }

  if (isExternalUrl) {
    return handleExternalUrl(state, mutable, url.toString(), pendingPush)
  }

  const prefetchValues = state.prefetchCache.get(href)
  if (prefetchValues) {
    // The one before last item is the router state tree patch
    const { flightData, tree: newTree, canonicalUrlOverride } = prefetchValues

    // Handle case when navigating to page in `pages` from `app`
    if (typeof flightData === 'string') {
      return handleExternalUrl(state, mutable, flightData, pendingPush)
    }

    if (newTree !== null) {
      if (isNavigatingToNewRootLayout(state.tree, newTree)) {
        return handleExternalUrl(state, mutable, href, pendingPush)
      }

      // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
      const flightDataPath = flightData[0]
      const flightSegmentPath = flightDataPath.slice(
        0,
        -3
      ) as unknown as FlightSegmentPath

      const applied = applyFlightData(state, cache, flightDataPath)

      const hardNavigate =
        // TODO-APP: Revisit searchParams support
        search !== locationSearch ||
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
        mutable.cache = cache
      } else if (applied) {
        mutable.cache = cache
      }

      mutable.previousTree = state.tree
      mutable.patchedTree = newTree
      mutable.applyFocusAndScroll = true
      mutable.canonicalUrl = canonicalUrlOverride
        ? createHrefFromUrl(canonicalUrlOverride)
        : href
      mutable.pendingPush = pendingPush

      return handleMutable(state, mutable)
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
      mutable.pendingPush = pendingPush
      mutable.applyFocusAndScroll = true
      mutable.cache = cache
      mutable.canonicalUrl = href

      return handleMutable(state, mutable)
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
    return handleExternalUrl(state, mutable, flightData, pendingPush)
  }

  // Remove cache.data as it has been resolved at this point.
  cache.data = null

  // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
  const flightDataPath = flightData[0]

  // The one before last item is the router state tree patch
  const [treePatch] = flightDataPath.slice(-3, -2)

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

  if (isNavigatingToNewRootLayout(state.tree, newTree)) {
    return handleExternalUrl(state, mutable, href, pendingPush)
  }

  mutable.canonicalUrl = canonicalUrlOverride
    ? createHrefFromUrl(canonicalUrlOverride)
    : href

  mutable.previousTree = state.tree
  mutable.patchedTree = newTree
  mutable.applyFocusAndScroll = true
  mutable.pendingPush = pendingPush

  const applied = applyFlightData(state, cache, flightDataPath)
  if (applied) {
    mutable.cache = cache
  }

  return handleMutable(state, mutable)
}
