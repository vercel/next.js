import type { CacheNode } from '../../../../shared/lib/app-router-context.shared-runtime'
import type {
  FlightRouterState,
  FlightSegmentPath,
} from '../../../../server/app-render/types'
import { fetchServerResponse } from '../fetch-server-response'
import { createHrefFromUrl } from '../create-href-from-url'
import { invalidateCacheBelowFlightSegmentPath } from '../invalidate-cache-below-flight-segmentpath'
import { applyRouterStatePatchToTree } from '../apply-router-state-patch-to-tree'
import { shouldHardNavigate } from '../should-hard-navigate'
import { isNavigatingToNewRootLayout } from '../is-navigating-to-new-root-layout'
import {
  PrefetchCacheEntryStatus,
  type Mutable,
  type NavigateAction,
  type ReadonlyReducerState,
  type ReducerState,
} from '../router-reducer-types'
import { handleMutable } from '../handle-mutable'
import { applyFlightData } from '../apply-flight-data'
import { prefetchQueue } from './prefetch-reducer'
import { createEmptyCacheNode } from '../../app-router'
import { DEFAULT_SEGMENT_KEY } from '../../../../shared/lib/segment'
import {
  listenForDynamicRequest,
  updateCacheNodeOnNavigation,
} from '../ppr-navigations'
import {
  getOrCreatePrefetchCacheEntry,
  prunePrefetchCache,
} from '../prefetch-cache-utils'
import { clearCacheNodeDataForSegmentPath } from '../clear-cache-node-data-for-segment-path'

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

function triggerLazyFetchForLeafSegments(
  newCache: CacheNode,
  currentCache: CacheNode,
  flightSegmentPath: FlightSegmentPath,
  treePatch: FlightRouterState
) {
  let appliedPatch = false

  newCache.rsc = currentCache.rsc
  newCache.prefetchRsc = currentCache.prefetchRsc
  newCache.loading = currentCache.loading
  newCache.parallelRoutes = new Map(currentCache.parallelRoutes)

  const segmentPathsToFill = generateSegmentsFromPatch(treePatch).map(
    (segment) => [...flightSegmentPath, ...segment]
  )

  for (const segmentPaths of segmentPathsToFill) {
    clearCacheNodeDataForSegmentPath(newCache, currentCache, segmentPaths)

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

  const prefetchValues = getOrCreatePrefetchCacheEntry({
    url,
    nextUrl: state.nextUrl,
    tree: state.tree,
    buildId: state.buildId,
    prefetchCache: state.prefetchCache,
  })
  const { treeAtTimeOfPrefetch, data } = prefetchValues

  prefetchQueue.bump(data)

  return data.then(
    ([flightData, canonicalUrlOverride]) => {
      let isFirstRead = false
      // we only want to mark this once
      if (!prefetchValues.lastUsedTime) {
        // important: we should only mark the cache node as dirty after we unsuspend from the call above
        prefetchValues.lastUsedTime = Date.now()
        isFirstRead = true
      }

      // Handle case when navigating to page in `pages` from `app`
      if (typeof flightData === 'string') {
        return handleExternalUrl(state, mutable, flightData, pendingPush)
      }

      // Handles case where `<meta http-equiv="refresh">` tag is present,
      // which will trigger an MPA navigation.
      if (document.getElementById('__next-page-redirect')) {
        return handleExternalUrl(state, mutable, href, pendingPush)
      }

      const updatedCanonicalUrl = canonicalUrlOverride
        ? createHrefFromUrl(canonicalUrlOverride)
        : href

      // Track if the navigation was only an update to the hash fragment
      mutable.onlyHashChange =
        !!hash &&
        state.canonicalUrl.split('#', 1)[0] ===
          updatedCanonicalUrl.split('#', 1)[0]

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
          treePatch,
          href
        )

        // If the tree patch can't be applied to the current tree then we use the tree at time of prefetch
        // TODO-APP: This should instead fill in the missing pieces in `currentTree` with the data from `treeAtTimeOfPrefetch`, then apply the patch.
        if (newTree === null) {
          newTree = applyRouterStatePatchToTree(
            // TODO-APP: remove ''
            flightSegmentPathWithLeadingEmpty,
            treeAtTimeOfPrefetch,
            treePatch,
            href
          )
        }

        if (newTree !== null) {
          if (isNavigatingToNewRootLayout(currentTree, newTree)) {
            return handleExternalUrl(state, mutable, href, pendingPush)
          }

          const cache: CacheNode = createEmptyCacheNode()
          let applied = false

          if (
            prefetchValues.status === PrefetchCacheEntryStatus.stale &&
            !mutable.onlyHashChange &&
            !isFirstRead
          ) {
            // When we have a stale prefetch entry, we only want to re-use the loading state of the route we're navigating to, to support instant loading navigations
            // this will trigger a lazy fetch for the actual page data by nulling the `rsc` and `prefetchRsc` values for page data,
            // while copying over the `loading` for the segment that contains the page data.
            // We only do this on subsequent reads, as otherwise there'd be no loading data to re-use.

            // We skip this branch if only the hash fragment has changed, as we don't want to trigger a lazy fetch in that case
            applied = triggerLazyFetchForLeafSegments(
              cache,
              currentCache,
              flightSegmentPath,
              treePatch
            )
            // since we re-used the stale cache's loading state & refreshed the data,
            // update the `lastUsedTime` so that it can continue to be re-used for the next 30s
            prefetchValues.lastUsedTime = Date.now()
          } else {
            applied = applyFlightData(
              currentCache,
              cache,
              flightDataPath,
              prefetchValues
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
            // If we applied the cache, we update the "current cache" value so any other
            // segments in the FlightDataPath will be able to reference the updated cache.
            currentCache = cache
          }

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
      mutable.canonicalUrl = updatedCanonicalUrl
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

  const prefetchValues = getOrCreatePrefetchCacheEntry({
    url,
    nextUrl: state.nextUrl,
    tree: state.tree,
    buildId: state.buildId,
    prefetchCache: state.prefetchCache,
  })
  const { treeAtTimeOfPrefetch, data } = prefetchValues

  prefetchQueue.bump(data)

  return data.then(
    ([flightData, canonicalUrlOverride, _postponed]) => {
      let isFirstRead = false
      // we only want to mark this once
      if (!prefetchValues.lastUsedTime) {
        // important: we should only mark the cache node as dirty after we unsuspend from the call above
        prefetchValues.lastUsedTime = Date.now()
        isFirstRead = true
      }

      // Handle case when navigating to page in `pages` from `app`
      if (typeof flightData === 'string') {
        return handleExternalUrl(state, mutable, flightData, pendingPush)
      }

      // Handles case where `<meta http-equiv="refresh">` tag is present,
      // which will trigger an MPA navigation.
      if (document.getElementById('__next-page-redirect')) {
        return handleExternalUrl(state, mutable, href, pendingPush)
      }

      const updatedCanonicalUrl = canonicalUrlOverride
        ? createHrefFromUrl(canonicalUrlOverride)
        : href

      // Track if the navigation was only an update to the hash fragment
      mutable.onlyHashChange =
        !!hash &&
        state.canonicalUrl.split('#', 1)[0] ===
          updatedCanonicalUrl.split('#', 1)[0]

      let currentTree = state.tree
      let currentCache = state.cache
      let scrollableSegments: FlightSegmentPath[] = []
      // TODO: In practice, this is always a single item array. We probably
      // aren't going to every send multiple segments, at least not in this
      // format. So we could remove the extra wrapper for now until
      // that settles.
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
          treePatch,
          href
        )

        // If the tree patch can't be applied to the current tree then we use the tree at time of prefetch
        // TODO-APP: This should instead fill in the missing pieces in `currentTree` with the data from `treeAtTimeOfPrefetch`, then apply the patch.
        if (newTree === null) {
          newTree = applyRouterStatePatchToTree(
            // TODO-APP: remove ''
            flightSegmentPathWithLeadingEmpty,
            treeAtTimeOfPrefetch,
            treePatch,
            href
          )
        }

        if (newTree !== null) {
          if (isNavigatingToNewRootLayout(currentTree, newTree)) {
            return handleExternalUrl(state, mutable, href, pendingPush)
          }

          if (
            // This is just a paranoid check. When PPR is enabled, the server
            // will always send back a static response that's rendered from
            // the root. If for some reason it doesn't, we fall back to the
            // non-PPR implementation.
            // TODO: We should get rid of the else branch and do all navigations
            // via updateCacheNodeOnNavigation. The current structure is just
            // an incremental step.
            flightDataPath.length === 3
          ) {
            const prefetchedTree: FlightRouterState = flightDataPath[0]
            const seedData = flightDataPath[1]
            const head = flightDataPath[2]

            const task = updateCacheNodeOnNavigation(
              currentCache,
              currentTree,
              prefetchedTree,
              seedData,
              head,
              mutable.onlyHashChange
            )
            if (task !== null) {
              // We've created a new Cache Node tree that contains a prefetched
              // version of the next page. This can be rendered instantly.

              // Use the tree computed by updateCacheNodeOnNavigation instead
              // of the one computed by applyRouterStatePatchToTree.
              // TODO: We should remove applyRouterStatePatchToTree
              // from the PPR path entirely.
              const patchedRouterState: FlightRouterState = task.route
              newTree = patchedRouterState

              // It's possible that `updateCacheNodeOnNavigation` only spawned tasks to reuse the existing cache,
              // in which case `task.node` will be null, signaling we don't need to wait for a dynamic request
              // and can simply apply the patched `FlightRouterState`.
              if (task.node !== null) {
                const newCache = task.node

                // The prefetched tree has dynamic holes in it. We initiate a
                // dynamic request to fill them in.
                //
                // Do not block on the result. We'll immediately render the Cache
                // Node tree and suspend on the dynamic parts. When the request
                // comes in, we'll fill in missing data and ping React to
                // re-render. Unlike the lazy fetching model in the non-PPR
                // implementation, this is modeled as a single React update +
                // streaming, rather than multiple top-level updates. (However,
                // even in the new model, we'll still need to sometimes update the
                // root multiple times per navigation, like if the server sends us
                // a different response than we expected. For now, we revert back
                // to the lazy fetching mechanism in that case.)
                listenForDynamicRequest(
                  task,
                  fetchServerResponse(
                    url,
                    currentTree,
                    state.nextUrl,
                    state.buildId
                  )
                )

                mutable.cache = newCache
              }
            } else {
              // Nothing changed, so reuse the old cache.
              // TODO: What if the head changed but not any of the segment data?
              // Is that possible? If so, we should clone the whole tree and
              // update the head.
              newTree = prefetchedTree
            }
          } else {
            // The static response does not include any dynamic holes, so
            // there's no need to do a second request.
            // TODO: As an incremental step this just reverts back to the
            // non-PPR implementation. We can simplify this branch further,
            // given that PPR prefetches are always static and return the whole
            // tree. Or in the meantime we could factor it out into a
            // separate function.
            const cache: CacheNode = createEmptyCacheNode()
            let applied = false

            if (
              prefetchValues.status === PrefetchCacheEntryStatus.stale &&
              !mutable.onlyHashChange &&
              !isFirstRead
            ) {
              // When we have a stale prefetch entry, we only want to re-use the loading state of the route we're navigating to, to support instant loading navigations
              // this will trigger a lazy fetch for the actual page data by nulling the `rsc` and `prefetchRsc` values for page data,
              // while copying over the `loading` for the segment that contains the page data.
              // We only do this on subsequent reads, as otherwise there'd be no loading data to re-use.

              // We skip this branch if only the hash fragment has changed, as we don't want to trigger a lazy fetch in that case
              applied = triggerLazyFetchForLeafSegments(
                cache,
                currentCache,
                flightSegmentPath,
                treePatch
              )
              // since we re-used the stale cache's loading state & refreshed the data,
              // update the `lastUsedTime` so that it can continue to be re-used for the next 30s
              prefetchValues.lastUsedTime = Date.now()
            } else {
              applied = applyFlightData(
                currentCache,
                cache,
                flightDataPath,
                prefetchValues
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
              // If we applied the cache, we update the "current cache" value so any other
              // segments in the FlightDataPath will be able to reference the updated cache.
              currentCache = cache
            }
          }

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
      mutable.canonicalUrl = updatedCanonicalUrl
      mutable.pendingPush = pendingPush
      mutable.scrollableSegments = scrollableSegments
      mutable.hashFragment = hash
      mutable.shouldScroll = shouldScroll

      return handleMutable(state, mutable)
    },
    () => state
  )
}
