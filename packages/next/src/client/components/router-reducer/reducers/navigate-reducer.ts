import { CacheStates } from '../../../../shared/lib/app-router-context'
import type { FlightSegmentPath } from '../../../../server/app-render/types'
import { fetchServerResponse } from '../fetch-server-response'
import { createRecordFromThenable } from '../create-record-from-thenable'
import { readRecordValue } from '../read-record-value'
import { createHrefFromUrl } from '../create-href-from-url'
import { invalidateCacheBelowFlightSegmentPath } from '../invalidate-cache-below-flight-segmentpath'
import { fillCacheWithDataProperty } from '../fill-cache-with-data-property'
import { createOptimisticTree } from '../create-optimistic-tree'
import { applyRouterStatePatchToTree } from '../apply-router-state-patch-to-tree'
import { shouldHardNavigate } from '../should-hard-navigate'
import { isNavigatingToNewRootLayout } from '../is-navigating-to-new-root-layout'
import type {
  Mutable,
  NavigateAction,
  ReadonlyReducerState,
  ReducerState,
} from '../router-reducer-types'
import { handleMutable } from '../handle-mutable'
import { applyFlightData } from '../apply-flight-data'

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
    navigateType,
    cache,
    mutable,
    forceOptimisticNavigation,
  } = action
  const { pathname, hash } = url
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

  const prefetchValues = state.prefetchCache.get(createHrefFromUrl(url, false))
  if (prefetchValues) {
    // The one before last item is the router state tree patch
    const { treeAtTimeOfPrefetch, data } = prefetchValues

    // Unwrap cache data with `use` to suspend here (in the reducer) until the fetch resolves.
    const [flightData, canonicalUrlOverride] = readRecordValue(data!)

    // Handle case when navigating to page in `pages` from `app`
    if (typeof flightData === 'string') {
      return handleExternalUrl(state, mutable, flightData, pendingPush)
    }

    // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
    const flightDataPath = flightData[0]
    const flightSegmentPath = flightDataPath.slice(
      0,
      -3
    ) as unknown as FlightSegmentPath
    // The one before last item is the router state tree patch
    const [treePatch] = flightDataPath.slice(-3)

    // Create new tree based on the flightSegmentPath and router state patch
    let newTree = applyRouterStatePatchToTree(
      // TODO-APP: remove ''
      ['', ...flightSegmentPath],
      state.tree,
      treePatch
    )

    // If the tree patch can't be applied to the current tree then we use the tree at time of prefetch
    // TODO-APP: This should instead fill in the missing pieces in `state.tree` with the data from `treeAtTimeOfPrefetch`, then apply the patch.
    if (newTree === null) {
      newTree = applyRouterStatePatchToTree(
        // TODO-APP: remove ''
        ['', ...flightSegmentPath],
        treeAtTimeOfPrefetch,
        treePatch
      )
    }

    if (newTree !== null) {
      if (isNavigatingToNewRootLayout(state.tree, newTree)) {
        return handleExternalUrl(state, mutable, href, pendingPush)
      }

      const applied = applyFlightData(state, cache, flightDataPath, true)

      const hardNavigate = shouldHardNavigate(
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
      mutable.hashFragment = hash

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
      () => fetchServerResponse(url, optimisticTree, state.nextUrl)
    )

    // If optimistic fetch couldn't happen it falls back to the non-optimistic case.
    if (!res?.bailOptimistic) {
      mutable.previousTree = state.tree
      mutable.patchedTree = optimisticTree
      mutable.pendingPush = pendingPush
      mutable.hashFragment = hash
      mutable.applyFocusAndScroll = true
      mutable.cache = cache
      mutable.canonicalUrl = href

      return handleMutable(state, mutable)
    }
  }

  // Below is the not-optimistic case. Data is fetched at the root and suspended there without a suspense boundary.

  // If no in-flight fetch at the top, start it.
  if (!cache.data) {
    cache.data = createRecordFromThenable(
      fetchServerResponse(url, state.tree, state.nextUrl)
    )
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
  mutable.hashFragment = hash

  const applied = applyFlightData(state, cache, flightDataPath)
  if (applied) {
    mutable.cache = cache
  }

  return handleMutable(state, mutable)
}
