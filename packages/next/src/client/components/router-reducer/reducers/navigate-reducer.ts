import {
  CacheNode,
  CacheStates,
} from '../../../../shared/lib/app-router-context'
import type {
  FlightRouterState,
  FlightSegmentPath,
} from '../../../../server/app-render/types'
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
import {
  PrefetchCacheEntryStatus,
  getPrefetchEntryCacheStatus,
} from '../get-prefetch-cache-entry-status'
import { prunePrefetchCache } from './prune-prefetch-cache'

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
  mutable.scrollableSegments = undefined

  return handleMutable(state, mutable)
}

function generateSegmentsFromPatch(
  flightRouterPatch: FlightRouterState
): FlightSegmentPath[] {
  const segments: FlightSegmentPath[] = []
  const [segment, parallelRoutes] = flightRouterPatch

  if (Object.keys(parallelRoutes).length === 0) {
    return [[segment]]
  }

  for (const [parallelRouteKey, parallelRoute] of Object.entries(
    parallelRoutes
  )) {
    for (const childSegment of generateSegmentsFromPatch(parallelRoute)) {
      // If the segment is empty, it means we are at the root of the tree
      if (segment === '') {
        segments.push([parallelRouteKey, ...childSegment])
      } else {
        segments.push([segment, parallelRouteKey, ...childSegment])
      }
    }
  }

  return segments
}

function addRefetchToLeafSegments(
  newCache: CacheNode,
  currentCache: CacheNode,
  currentTree: FlightRouterState,
  flightSegmentPath: FlightSegmentPath,
  treePatch: FlightRouterState,
  url: URL,
  nextUrl: string
) {
  let appliedPatch = false

  newCache.status = CacheStates.READY
  newCache.subTreeData = currentCache.subTreeData
  newCache.parallelRoutes = new Map(currentCache.parallelRoutes)

  const segmentPathsToFill = generateSegmentsFromPatch(treePatch).map(
    (segment) => [...flightSegmentPath, ...segment]
  )

  for (const segmentPaths of segmentPathsToFill) {
    const res = fillCacheWithDataProperty(
      newCache,
      currentCache,
      segmentPaths,
      () => fetchServerResponse(url, currentTree, nextUrl)
    )
    if (!res?.bailOptimistic) {
      appliedPatch = true
    }
  }

  return appliedPatch
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

  // we want to prune the prefetch cache on every navigation to avoid it growing too large
  prunePrefetchCache(state.prefetchCache)

  const prefetchValues = state.prefetchCache.get(createHrefFromUrl(url, false))

  if (prefetchValues) {
    const prefetchEntryCacheStatus = getPrefetchEntryCacheStatus(prefetchValues)
    prefetchValues.lastUsedTime = Date.now()

    // The one before last item is the router state tree patch
    const { treeAtTimeOfPrefetch, data } = prefetchValues

    // Unwrap cache data with `use` to suspend here (in the reducer) until the fetch resolves.
    const [flightData, canonicalUrlOverride] = readRecordValue(data!)

    // Handle case when navigating to page in `pages` from `app`
    if (typeof flightData === 'string') {
      return handleExternalUrl(state, mutable, flightData, pendingPush)
    }

    let currentTree = state.tree
    let currentCache = state.cache
    let scrollableSegments: FlightSegmentPath[] = []
    for (const flightDataPath of flightData) {
      const flightSegmentPath = flightDataPath.slice(
        0,
        -4
      ) as unknown as FlightSegmentPath
      // The one before last item is the router state tree patch
      const [treePatch] = flightDataPath.slice(-3) as [FlightRouterState]

      // Create new tree based on the flightSegmentPath and router state patch
      let newTree = applyRouterStatePatchToTree(
        // TODO-APP: remove ''
        ['', ...flightSegmentPath],
        currentTree,
        treePatch
      )

      // If the tree patch can't be applied to the current tree then we use the tree at time of prefetch
      // TODO-APP: This should instead fill in the missing pieces in `currentTree` with the data from `treeAtTimeOfPrefetch`, then apply the patch.
      if (newTree === null) {
        newTree = applyRouterStatePatchToTree(
          // TODO-APP: remove ''
          ['', ...flightSegmentPath],
          treeAtTimeOfPrefetch,
          treePatch
        )
      }

      if (newTree !== null) {
        if (isNavigatingToNewRootLayout(currentTree, newTree)) {
          return handleExternalUrl(state, mutable, href, pendingPush)
        }

        let applied = applyFlightData(
          currentCache,
          cache,
          flightDataPath,
          prefetchValues.kind === 'auto' &&
            prefetchEntryCacheStatus === PrefetchCacheEntryStatus.reusable
        )

        if (
          !applied &&
          prefetchEntryCacheStatus === PrefetchCacheEntryStatus.stale
        ) {
          applied = addRefetchToLeafSegments(
            cache,
            currentCache,
            currentTree,
            flightSegmentPath,
            treePatch,
            url,
            state.nextUrl!
          )
        }

        const hardNavigate = shouldHardNavigate(
          // TODO-APP: remove ''
          ['', ...flightSegmentPath],
          currentTree
        )

        if (hardNavigate) {
          cache.status = CacheStates.READY
          // Copy subTreeData for the root node of the cache.
          cache.subTreeData = currentCache.subTreeData

          invalidateCacheBelowFlightSegmentPath(
            cache,
            currentCache,
            flightSegmentPath
          )
          // Ensure the existing cache value is used when the cache was not invalidated.
          mutable.cache = cache
        } else if (applied) {
          mutable.cache = cache
        }

        currentCache = cache
        currentTree = newTree

        for (const subSegment of generateSegmentsFromPatch(treePatch)) {
          scrollableSegments.push(
            // the last segment is the same as the first segment in the patch
            [...flightSegmentPath.slice(0, -1), ...subSegment].filter(
              (segment) => segment !== '__PAGE__'
            )
          )
        }
      }
    }

    mutable.previousTree = state.tree
    mutable.patchedTree = currentTree
    mutable.scrollableSegments = scrollableSegments
    mutable.canonicalUrl = canonicalUrlOverride
      ? createHrefFromUrl(canonicalUrlOverride)
      : href
    mutable.pendingPush = pendingPush
    mutable.hashFragment = hash

    return handleMutable(state, mutable)
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

    const data = fetchServerResponse(url, optimisticTree, state.nextUrl)
    // TODO-APP: segments.slice(1) strips '', we can get rid of '' altogether.
    // TODO-APP: re-evaluate if we need to strip the last segment
    const optimisticFlightSegmentPath = segments
      .slice(1)
      .map((segment) => ['children', segment])
      .flat()

    // Copy existing cache nodes as far as possible and fill in `data` property with the started data fetch.
    // The `data` property is used to suspend in layout-router during render if it hasn't resolved yet by the time it renders.
    const res = fillCacheWithDataProperty(
      cache,
      state.cache,
      optimisticFlightSegmentPath,
      () => data
    )

    // If optimistic fetch couldn't happen it falls back to the non-optimistic case.
    if (!res?.bailOptimistic) {
      mutable.previousTree = state.tree
      mutable.patchedTree = optimisticTree
      mutable.pendingPush = pendingPush
      mutable.hashFragment = hash
      mutable.scrollableSegments = []
      mutable.cache = cache
      mutable.canonicalUrl = href

      state.prefetchCache.set(createHrefFromUrl(url, false), {
        data: Promise.resolve(data),
        // this will make sure that the entry will be discarded after 30s
        kind: 'temporary',
        prefetchTime: Date.now(),
        treeAtTimeOfPrefetch: state.tree,
        lastUsedTime: Date.now(),
      })

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

  state.prefetchCache.set(createHrefFromUrl(url, false), {
    data: Promise.resolve(cache.data!),
    // this will make sure that the entry will be discarded after 30s
    kind: 'temporary',
    prefetchTime: Date.now(),
    treeAtTimeOfPrefetch: state.tree,
    lastUsedTime: Date.now(),
  })

  // Unwrap cache data with `use` to suspend here (in the reducer) until the fetch resolves.
  const [flightData, canonicalUrlOverride] = readRecordValue(cache.data!)

  console.log('reading flight data', flightData)
  // Handle case when navigating to page in `pages` from `app`
  if (typeof flightData === 'string') {
    return handleExternalUrl(state, mutable, flightData, pendingPush)
  }

  // Remove cache.data as it has been resolved at this point.
  cache.data = null

  let currentTree = state.tree
  let currentCache = state.cache
  let scrollableSegments: FlightSegmentPath[] = []
  for (const flightDataPath of flightData) {
    // The one before last item is the router state tree patch
    const [treePatch] = flightDataPath.slice(-3, -2)

    // Path without the last segment, router state, and the subTreeData
    const flightSegmentPath = flightDataPath.slice(0, -4)

    // Create new tree based on the flightSegmentPath and router state patch
    const newTree = applyRouterStatePatchToTree(
      // TODO-APP: remove ''
      ['', ...flightSegmentPath],
      currentTree,
      treePatch
    )

    if (newTree === null) {
      throw new Error('SEGMENT MISMATCH')
    }

    if (isNavigatingToNewRootLayout(currentTree, newTree)) {
      return handleExternalUrl(state, mutable, href, pendingPush)
    }

    mutable.canonicalUrl = canonicalUrlOverride
      ? createHrefFromUrl(canonicalUrlOverride)
      : href

    const applied = applyFlightData(currentCache, cache, flightDataPath)
    if (applied) {
      mutable.cache = cache
      currentCache = cache
    }

    currentTree = newTree

    for (const subSegment of generateSegmentsFromPatch(treePatch)) {
      scrollableSegments.push(
        [...flightSegmentPath, ...subSegment].filter(
          (segment) => segment !== '__PAGE__'
        )
      )
    }
  }

  mutable.previousTree = state.tree
  mutable.patchedTree = currentTree
  mutable.scrollableSegments = scrollableSegments
  mutable.pendingPush = pendingPush
  mutable.hashFragment = hash

  return handleMutable(state, mutable)
}
