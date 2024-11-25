import type {
  CacheNodeSeedData,
  FlightRouterState,
} from '../../../server/app-render/types'
import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import {
  addSearchParamsIfPageSegment,
  PAGE_SEGMENT_KEY,
} from '../../../shared/lib/segment'
import type { NormalizedFlightData } from '../../flight-data-helpers'
import { createEmptyCacheNode } from '../app-router'
import { applyRouterStatePatchToTree } from './apply-router-state-patch-to-tree'
import { createHrefFromUrl } from './create-href-from-url'
import { createRouterCacheKey } from './create-router-cache-key'
import { fillCacheWithNewSubTreeDataButOnlyLoading } from './fill-cache-with-new-subtree-data'
import { handleMutable } from './handle-mutable'
import type { Mutable, ReadonlyReducerState } from './router-reducer-types'

/**
 * This is a stop-gap until per-segment caching is implemented. It leverages the `aliased` flag that is added
 * to prefetch entries when it's determined that the loading state from that entry should be used for this navigation.
 * This function takes the aliased entry and only applies the loading state to the updated cache node.
 * We should remove this once per-segment fetching is implemented as ideally the prefetch cache will contain a
 * more granular segment map and so the router will be able to simply re-use the loading segment for the new navigation.
 */
export function handleAliasedPrefetchEntry(
  state: ReadonlyReducerState,
  flightData: NormalizedFlightData[],
  url: URL,
  mutable: Mutable
) {
  let currentTree = state.tree
  let currentCache = state.cache
  const href = createHrefFromUrl(url)
  let applied

  for (const normalizedFlightData of flightData) {
    // If the segment doesn't have a loading component, we don't need to do anything.
    if (!hasLoadingComponentInSeedData(normalizedFlightData.seedData)) {
      continue
    }

    let treePatch = normalizedFlightData.tree
    // Segments are keyed by searchParams (e.g. __PAGE__?{"foo":"bar"}). We might return a less specific, param-less entry,
    // so we ensure that the final tree contains the correct searchParams (reflected in the URL) are provided in the updated FlightRouterState tree.
    // We only do this on the first read, as otherwise we'd be overwriting the searchParams that may have already been set
    treePatch = addSearchParamsToPageSegments(
      treePatch,
      Object.fromEntries(url.searchParams)
    )

    const { seedData, isRootRender, pathToSegment } = normalizedFlightData
    // TODO-APP: remove ''
    const flightSegmentPathWithLeadingEmpty = ['', ...pathToSegment]

    // Segments are keyed by searchParams (e.g. __PAGE__?{"foo":"bar"}). We might return a less specific, param-less entry,
    // so we ensure that the final tree contains the correct searchParams (reflected in the URL) are provided in the updated FlightRouterState tree.
    // We only do this on the first read, as otherwise we'd be overwriting the searchParams that may have already been set
    treePatch = addSearchParamsToPageSegments(
      treePatch,
      Object.fromEntries(url.searchParams)
    )

    let newTree = applyRouterStatePatchToTree(
      flightSegmentPathWithLeadingEmpty,
      currentTree,
      treePatch,
      href
    )

    const newCache = createEmptyCacheNode()

    // The prefetch cache entry was aliased -- this signals that we only fill in the cache with the
    // loading state and not the actual parallel route seed data.
    if (isRootRender && seedData) {
      // Fill in the cache with the new loading / rsc data
      const rsc = seedData[1]
      const loading = seedData[3]
      newCache.loading = loading
      newCache.rsc = rsc

      // Construct a new tree and apply the aliased loading state for each parallel route
      fillNewTreeWithOnlyLoadingSegments(
        newCache,
        currentCache,
        treePatch,
        seedData
      )
    } else {
      // Copy rsc for the root node of the cache.
      newCache.rsc = currentCache.rsc
      newCache.prefetchRsc = currentCache.prefetchRsc
      newCache.loading = currentCache.loading
      newCache.parallelRoutes = new Map(currentCache.parallelRoutes)

      // copy the loading state only into the leaf node (the part that changed)
      fillCacheWithNewSubTreeDataButOnlyLoading(
        newCache,
        currentCache,
        normalizedFlightData
      )
    }

    // If we don't have an updated tree, there's no reason to update the cache, as the tree
    // dictates what cache nodes to render.
    if (newTree) {
      currentTree = newTree
      currentCache = newCache
      applied = true
    }
  }

  if (!applied) {
    return false
  }

  mutable.patchedTree = currentTree
  mutable.cache = currentCache
  mutable.canonicalUrl = href
  mutable.hashFragment = url.hash

  return handleMutable(state, mutable)
}

function hasLoadingComponentInSeedData(seedData: CacheNodeSeedData | null) {
  if (!seedData) return false

  const parallelRoutes = seedData[2]
  const loading = seedData[3]

  if (loading) {
    return true
  }

  for (const key in parallelRoutes) {
    if (hasLoadingComponentInSeedData(parallelRoutes[key])) {
      return true
    }
  }

  return false
}

function fillNewTreeWithOnlyLoadingSegments(
  newCache: CacheNode,
  existingCache: CacheNode,
  routerState: FlightRouterState,
  cacheNodeSeedData: CacheNodeSeedData | null
) {
  const isLastSegment = Object.keys(routerState[1]).length === 0
  if (isLastSegment) {
    return
  }

  for (const key in routerState[1]) {
    const parallelRouteState = routerState[1][key]
    const segmentForParallelRoute = parallelRouteState[0]
    const cacheKey = createRouterCacheKey(segmentForParallelRoute)

    const parallelSeedData =
      cacheNodeSeedData !== null && cacheNodeSeedData[2][key] !== undefined
        ? cacheNodeSeedData[2][key]
        : null

    let newCacheNode: CacheNode
    if (parallelSeedData !== null) {
      // New data was sent from the server.
      const rsc = parallelSeedData[1]
      const loading = parallelSeedData[3]
      newCacheNode = {
        lazyData: null,
        // copy the layout but null the page segment as that's not meant to be used
        rsc: segmentForParallelRoute.includes(PAGE_SEGMENT_KEY) ? null : rsc,
        prefetchRsc: null,
        head: null,
        prefetchHead: null,
        parallelRoutes: new Map(),
        loading,
      }
    } else {
      // No data available for this node. This will trigger a lazy fetch
      // during render.
      newCacheNode = {
        lazyData: null,
        rsc: null,
        prefetchRsc: null,
        head: null,
        prefetchHead: null,
        parallelRoutes: new Map(),
        loading: null,
      }
    }

    const existingParallelRoutes = newCache.parallelRoutes.get(key)
    if (existingParallelRoutes) {
      existingParallelRoutes.set(cacheKey, newCacheNode)
    } else {
      newCache.parallelRoutes.set(key, new Map([[cacheKey, newCacheNode]]))
    }

    fillNewTreeWithOnlyLoadingSegments(
      newCacheNode,
      existingCache,
      parallelRouteState,
      parallelSeedData
    )
  }
}

/**
 * Add search params to the page segments in the flight router state
 * Page segments that are associated with search params have a page segment key
 * followed by a query string. This function will add those params to the page segment.
 * This is useful if we return an aliased prefetch entry (ie, won't have search params)
 * but the canonical router URL has search params.
 */
export function addSearchParamsToPageSegments(
  flightRouterState: FlightRouterState,
  searchParams: Record<string, string | string[] | undefined>
): FlightRouterState {
  const [segment, parallelRoutes, ...rest] = flightRouterState

  // If it's a page segment, modify the segment by adding search params
  if (segment.includes(PAGE_SEGMENT_KEY)) {
    const newSegment = addSearchParamsIfPageSegment(segment, searchParams)
    return [newSegment, parallelRoutes, ...rest]
  }

  // Otherwise, recurse through the parallel routes and return a new tree
  const updatedParallelRoutes: { [key: string]: FlightRouterState } = {}

  for (const [key, parallelRoute] of Object.entries(parallelRoutes)) {
    updatedParallelRoutes[key] = addSearchParamsToPageSegments(
      parallelRoute,
      searchParams
    )
  }

  return [segment, updatedParallelRoutes, ...rest]
}
