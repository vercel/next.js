import { CacheStates } from '../../../../shared/lib/app-router-context.shared-runtime'
import type { CacheNode } from '../../../../shared/lib/app-router-context.shared-runtime'
import type {
  FlightRouterState,
  FlightSegmentPath,
} from '../../../../server/app-render/types'
import { fetchServerResponse } from '../fetch-server-response'
import type { FetchServerResponseResult } from '../fetch-server-response'
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
  ThenableRecord,
} from '../router-reducer-types'
import { PrefetchKind } from '../router-reducer-types'
import { handleMutable } from '../handle-mutable'
import { applyFlightData } from '../apply-flight-data'
import {
  PrefetchCacheEntryStatus,
  getPrefetchEntryCacheStatus,
} from '../get-prefetch-cache-entry-status'
import { prunePrefetchCache } from './prune-prefetch-cache'
import { prefetchQueue } from './prefetch-reducer'

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
  flightSegmentPath: FlightSegmentPath,
  treePatch: FlightRouterState,
  data: () => ThenableRecord<FetchServerResponseResult>
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
      data
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
    shouldScroll,
  } = action
  const { pathname, hash } = url
  const href = createHrefFromUrl(url)
  const pendingPush = navigateType === 'push'
  // we want to prune the prefetch cache on every navigation to avoid it growing too large
  prunePrefetchCache(state.prefetchCache)

  const isForCurrentTree =
    JSON.stringify(mutable.previousTree) === JSON.stringify(state.tree)

  if (isForCurrentTree) {
    return handleMutable(state, mutable)
  }

  if (isExternalUrl) {
    return handleExternalUrl(state, mutable, url.toString(), pendingPush)
  }

  let prefetchValues = state.prefetchCache.get(createHrefFromUrl(url, false))

  if (
    forceOptimisticNavigation &&
    prefetchValues?.kind !== PrefetchKind.TEMPORARY
  ) {
    const segments = pathname.split('/')
    // TODO-APP: figure out something better for index pages
    segments.push('__PAGE__')

    // Optimistic tree case.
    // If the optimistic tree is deeper than the current state leave that deeper part out of the fetch
    const optimisticTree = createOptimisticTree(segments, state.tree, false)

    // we need a copy of the cache in case we need to revert to it
    const temporaryCacheNode: CacheNode = {
      ...cache,
    }

    // Copy subTreeData for the root node of the cache.
    // Note: didn't do it above because typescript doesn't like it.
    temporaryCacheNode.status = CacheStates.READY
    temporaryCacheNode.subTreeData = state.cache.subTreeData
    temporaryCacheNode.parallelRoutes = new Map(state.cache.parallelRoutes)

    let data: ThenableRecord<FetchServerResponseResult> | null = null

    const fetchResponse = () => {
      if (!data) {
        data = createRecordFromThenable(
          fetchServerResponse(url, optimisticTree, state.nextUrl, state.buildId)
        )
      }
      return data
    }

    // TODO-APP: segments.slice(1) strips '', we can get rid of '' altogether.
    // TODO-APP: re-evaluate if we need to strip the last segment
    const optimisticFlightSegmentPath = segments
      .slice(1)
      .map((segment) => ['children', segment])
      .flat()

    // Copy existing cache nodes as far as possible and fill in `data` property with the started data fetch.
    // The `data` property is used to suspend in layout-router during render if it hasn't resolved yet by the time it renders.
    const res = fillCacheWithDataProperty(
      temporaryCacheNode,
      state.cache,
      optimisticFlightSegmentPath,
      fetchResponse,
      true
    )

    // If optimistic fetch couldn't happen it falls back to the non-optimistic case.
    if (!res?.bailOptimistic) {
      mutable.previousTree = state.tree
      mutable.patchedTree = optimisticTree
      mutable.pendingPush = pendingPush
      mutable.hashFragment = hash
      mutable.shouldScroll = shouldScroll
      mutable.scrollableSegments = []
      mutable.cache = temporaryCacheNode
      mutable.canonicalUrl = href

      state.prefetchCache.set(createHrefFromUrl(url, false), {
        data: data ? createRecordFromThenable(Promise.resolve(data)) : null,
        // this will make sure that the entry will be discarded after 30s
        kind: PrefetchKind.TEMPORARY,
        prefetchTime: Date.now(),
        treeAtTimeOfPrefetch: state.tree,
        lastUsedTime: Date.now(),
      })

      return handleMutable(state, mutable)
    }
  }

  // If we don't have a prefetch value, we need to create one
  if (!prefetchValues) {
    const data = createRecordFromThenable(
      fetchServerResponse(
        url,
        state.tree,
        state.nextUrl,
        state.buildId,
        // in dev, there's never gonna be a prefetch entry so we want to prefetch here
        // in order to simulate the behavior of the prefetch cache
        process.env.NODE_ENV === 'development' ? PrefetchKind.AUTO : undefined
      )
    )

    const newPrefetchValue = {
      data: createRecordFromThenable(Promise.resolve(data)),
      // this will make sure that the entry will be discarded after 30s
      kind:
        process.env.NODE_ENV === 'development'
          ? PrefetchKind.AUTO
          : PrefetchKind.TEMPORARY,
      prefetchTime: Date.now(),
      treeAtTimeOfPrefetch: state.tree,
      lastUsedTime: null,
    }

    state.prefetchCache.set(createHrefFromUrl(url, false), newPrefetchValue)
    prefetchValues = newPrefetchValue
  }

  const prefetchEntryCacheStatus = getPrefetchEntryCacheStatus(prefetchValues)

  // The one before last item is the router state tree patch
  const { treeAtTimeOfPrefetch, data } = prefetchValues

  prefetchQueue.bump(data!)

  // Unwrap cache data with `use` to suspend here (in the reducer) until the fetch resolves.
  const [flightData, canonicalUrlOverride] = readRecordValue(data!)

  // we only want to mark this once
  if (!prefetchValues.lastUsedTime) {
    // important: we should only mark the cache node as dirty after we unsuspend from the call above
    prefetchValues.lastUsedTime = Date.now()
  }

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
    const treePatch = flightDataPath.slice(-3)[0] as FlightRouterState

    // TODO-APP: remove ''
    const flightSegmentPathWithLeadingEmpty = ['', ...flightSegmentPath]

    // Create new tree based on the flightSegmentPath and router state patch
    let newTree = applyRouterStatePatchToTree(
      // TODO-APP: remove ''
      flightSegmentPathWithLeadingEmpty,
      currentTree,
      treePatch
    )

    // If the tree patch can't be applied to the current tree then we use the tree at time of prefetch
    // TODO-APP: This should instead fill in the missing pieces in `currentTree` with the data from `treeAtTimeOfPrefetch`, then apply the patch.
    if (newTree === null) {
      newTree = applyRouterStatePatchToTree(
        // TODO-APP: remove ''
        flightSegmentPathWithLeadingEmpty,
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
          flightSegmentPath,
          treePatch,
          // eslint-disable-next-line no-loop-func
          () =>
            createRecordFromThenable(
              fetchServerResponse(
                url,
                currentTree,
                state.nextUrl,
                state.buildId
              )
            )
        )
      }

      const hardNavigate = shouldHardNavigate(
        // TODO-APP: remove ''
        flightSegmentPathWithLeadingEmpty,
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
        const scrollableSegmentPath = [...flightSegmentPath, ...subSegment]
        // Filter out the __DEFAULT__ paths as they shouldn't be scrolled to in this case.
        if (
          scrollableSegmentPath[scrollableSegmentPath.length - 1] !==
          '__DEFAULT__'
        ) {
          scrollableSegments.push(scrollableSegmentPath)
        }
      }
    }
  }

  mutable.previousTree = state.tree
  mutable.patchedTree = currentTree
  mutable.canonicalUrl = canonicalUrlOverride
    ? createHrefFromUrl(canonicalUrlOverride)
    : href
  mutable.pendingPush = pendingPush
  mutable.scrollableSegments = scrollableSegments
  mutable.hashFragment = hash
  mutable.shouldScroll = shouldScroll

  return handleMutable(state, mutable)
}
