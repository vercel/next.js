import type { CacheNode } from '../../../../shared/lib/app-router-context.shared-runtime'
import type {
  FlightRouterState,
  FlightSegmentPath,
} from '../../../../server/app-render/types'
import { fetchServerResponse } from '../fetch-server-response'
import type { FetchServerResponseResult } from '../fetch-server-response'
import { createHrefFromUrl } from '../create-href-from-url'
import { invalidateCacheBelowFlightSegmentPath } from '../invalidate-cache-below-flight-segmentpath'
import { fillCacheWithDataProperty } from '../fill-cache-with-data-property'
import { applyRouterStatePatchToTreeSkipDefault } from '../apply-router-state-patch-to-tree'
import { shouldHardNavigate } from '../should-hard-navigate'
import { isNavigatingToNewRootLayout } from '../is-navigating-to-new-root-layout'
import type {
  Mutable,
  NavigateAction,
  ReadonlyReducerState,
  ReducerState,
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
import { createEmptyCacheNode } from '../../app-router'
import { DEFAULT_SEGMENT_KEY } from '../../../../shared/lib/segment'

export function handleExternalUrl(
  state: ReadonlyReducerState,
  mutable: Mutable,
  url: string,
  pendingPush: boolean
) {
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
  data: () => Promise<FetchServerResponseResult>
) {
  let appliedPatch = false

  newCache.rsc = currentCache.rsc
  newCache.prefetchRsc = currentCache.prefetchRsc
  newCache.parallelRoutes = new Map(currentCache.parallelRoutes)

  const segmentPathsToFill = generateSegmentsFromPatch(treePatch).map(
    (segment) => [...flightSegmentPath, ...segment]
  )

  for (const segmentPaths of segmentPathsToFill) {
    fillCacheWithDataProperty(newCache, currentCache, segmentPaths, data)

    appliedPatch = true
  }

  return appliedPatch
}

// These implementations are expected to diverge significantly, so I've forked
// the entire function. The one that's disabled should be dead code eliminated
// because the check here is statically inlined at build time.
export const navigateReducer = process.env.__NEXT_PPR
  ? navigateReducer_PPR
  : navigateReducer_noPPR

// This is the implementation when PPR is disabled. We can assume its behavior
// is relatively stable because it's been running in production for a while.
function navigateReducer_noPPR(
  state: ReadonlyReducerState,
  action: NavigateAction
): ReducerState {
  const { url, isExternalUrl, navigateType, shouldScroll } = action
  const mutable: Mutable = {}
  const { hash } = url
  const href = createHrefFromUrl(url)
  const pendingPush = navigateType === 'push'
  // we want to prune the prefetch cache on every navigation to avoid it growing too large
  prunePrefetchCache(state.prefetchCache)

  mutable.preserveCustomHistoryState = false

  if (isExternalUrl) {
    return handleExternalUrl(state, mutable, url.toString(), pendingPush)
  }

  let prefetchValues = state.prefetchCache.get(createHrefFromUrl(url, false))

  // If we don't have a prefetch value, we need to create one
  if (!prefetchValues) {
    const data = fetchServerResponse(
      url,
      state.tree,
      state.nextUrl,
      state.buildId,
      // in dev, there's never gonna be a prefetch entry so we want to prefetch here
      // in order to simulate the behavior of the prefetch cache
      process.env.NODE_ENV === 'development' ? PrefetchKind.AUTO : undefined
    )

    const newPrefetchValue = {
      data,
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

  return data!.then(
    ([flightData, canonicalUrlOverride, postponed]) => {
      // we only want to mark this once
      if (prefetchValues && !prefetchValues.lastUsedTime) {
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
        let newTree = applyRouterStatePatchToTreeSkipDefault(
          // TODO-APP: remove ''
          flightSegmentPathWithLeadingEmpty,
          currentTree,
          treePatch
        )

        // If the tree patch can't be applied to the current tree then we use the tree at time of prefetch
        // TODO-APP: This should instead fill in the missing pieces in `currentTree` with the data from `treeAtTimeOfPrefetch`, then apply the patch.
        if (newTree === null) {
          newTree = applyRouterStatePatchToTreeSkipDefault(
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

          const cache: CacheNode = createEmptyCacheNode()
          let applied = applyFlightData(
            currentCache,
            cache,
            flightDataPath,
            prefetchValues?.kind === 'auto' &&
              prefetchEntryCacheStatus === PrefetchCacheEntryStatus.reusable
          )

          if (
            (!applied &&
              prefetchEntryCacheStatus === PrefetchCacheEntryStatus.stale) ||
            // TODO-APP: If the prefetch was postponed, we don't want to apply it
            // until we land router changes to handle the postponed case.
            postponed
          ) {
            applied = addRefetchToLeafSegments(
              cache,
              currentCache,
              flightSegmentPath,
              treePatch,
              // eslint-disable-next-line no-loop-func
              () =>
                fetchServerResponse(
                  url,
                  currentTree,
                  state.nextUrl,
                  state.buildId
                )
            )
          }

          const hardNavigate = shouldHardNavigate(
            // TODO-APP: remove ''
            flightSegmentPathWithLeadingEmpty,
            currentTree
          )

          if (hardNavigate) {
            // Copy rsc for the root node of the cache.
            cache.rsc = currentCache.rsc
            cache.prefetchRsc = currentCache.prefetchRsc

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
              DEFAULT_SEGMENT_KEY
            ) {
              scrollableSegments.push(scrollableSegmentPath)
            }
          }
        }
      }

      mutable.patchedTree = currentTree
      mutable.canonicalUrl = canonicalUrlOverride
        ? createHrefFromUrl(canonicalUrlOverride)
        : href
      mutable.pendingPush = pendingPush
      mutable.scrollableSegments = scrollableSegments
      mutable.hashFragment = hash
      mutable.shouldScroll = shouldScroll

      return handleMutable(state, mutable)
    },
    () => state
  )
}

// This is the experimental PPR implementation. It's closer to the behavior we
// want, but is likelier to include accidental regressions because it rewrites
// existing functionality.
function navigateReducer_PPR(
  state: ReadonlyReducerState,
  action: NavigateAction
): ReducerState {
  const { url, isExternalUrl, navigateType, shouldScroll } = action
  const mutable: Mutable = {}
  const { hash } = url
  const href = createHrefFromUrl(url)
  const pendingPush = navigateType === 'push'
  // we want to prune the prefetch cache on every navigation to avoid it growing too large
  prunePrefetchCache(state.prefetchCache)

  mutable.preserveCustomHistoryState = false

  if (isExternalUrl) {
    return handleExternalUrl(state, mutable, url.toString(), pendingPush)
  }

  let prefetchValues = state.prefetchCache.get(createHrefFromUrl(url, false))

  // If we don't have a prefetch value, we need to create one
  if (!prefetchValues) {
    const data = fetchServerResponse(
      url,
      state.tree,
      state.nextUrl,
      state.buildId,
      // in dev, there's never gonna be a prefetch entry so we want to prefetch here
      // in order to simulate the behavior of the prefetch cache
      process.env.NODE_ENV === 'development' ? PrefetchKind.AUTO : undefined
    )

    const newPrefetchValue = {
      data,
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

  return data!.then(
    ([flightData, canonicalUrlOverride, postponed]) => {
      // we only want to mark this once
      if (prefetchValues && !prefetchValues.lastUsedTime) {
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
        let newTree = applyRouterStatePatchToTreeSkipDefault(
          // TODO-APP: remove ''
          flightSegmentPathWithLeadingEmpty,
          currentTree,
          treePatch
        )

        // If the tree patch can't be applied to the current tree then we use the tree at time of prefetch
        // TODO-APP: This should instead fill in the missing pieces in `currentTree` with the data from `treeAtTimeOfPrefetch`, then apply the patch.
        if (newTree === null) {
          newTree = applyRouterStatePatchToTreeSkipDefault(
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

          const cache: CacheNode = createEmptyCacheNode()
          let applied = applyFlightData(
            currentCache,
            cache,
            flightDataPath,
            prefetchValues?.kind === 'auto' &&
              prefetchEntryCacheStatus === PrefetchCacheEntryStatus.reusable
          )

          if (
            (!applied &&
              prefetchEntryCacheStatus === PrefetchCacheEntryStatus.stale) ||
            // TODO-APP: If the prefetch was postponed, we don't want to apply it
            // until we land router changes to handle the postponed case.
            postponed
          ) {
            applied = addRefetchToLeafSegments(
              cache,
              currentCache,
              flightSegmentPath,
              treePatch,
              // eslint-disable-next-line no-loop-func
              () =>
                fetchServerResponse(
                  url,
                  currentTree,
                  state.nextUrl,
                  state.buildId
                )
            )
          }

          const hardNavigate = shouldHardNavigate(
            // TODO-APP: remove ''
            flightSegmentPathWithLeadingEmpty,
            currentTree
          )

          if (hardNavigate) {
            // Copy rsc for the root node of the cache.
            cache.rsc = currentCache.rsc
            cache.prefetchRsc = currentCache.prefetchRsc

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
              DEFAULT_SEGMENT_KEY
            ) {
              scrollableSegments.push(scrollableSegmentPath)
            }
          }
        }
      }

      mutable.patchedTree = currentTree
      mutable.canonicalUrl = canonicalUrlOverride
        ? createHrefFromUrl(canonicalUrlOverride)
        : href
      mutable.pendingPush = pendingPush
      mutable.scrollableSegments = scrollableSegments
      mutable.hashFragment = hash
      mutable.shouldScroll = shouldScroll

      return handleMutable(state, mutable)
    },
    () => state
  )
}
