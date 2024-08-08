import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import type { FlightDataPath } from '../../../server/app-render/types'
import { invalidateCacheByRouterState } from './invalidate-cache-by-router-state'
import { fillLazyItemsTillLeafWithHead } from './fill-lazy-items-till-leaf-with-head'
import { createRouterCacheKey } from './create-router-cache-key'
import type { PrefetchCacheEntry } from './router-reducer-types'

/**
 * Common logic for filling cache with new sub tree data.
 */
function fillCacheHelper(
  newCache: CacheNode,
  existingCache: CacheNode,
  flightDataPath: FlightDataPath,
  prefetchEntry: PrefetchCacheEntry | undefined,
  fillLazyItems: boolean
): void {
  const isLastEntry = flightDataPath.length <= 5
  const [parallelRouteKey, segment] = flightDataPath

  const cacheKey = createRouterCacheKey(segment)

  const existingChildSegmentMap =
    existingCache.parallelRoutes.get(parallelRouteKey)

  if (!existingChildSegmentMap) {
    // Bailout because the existing cache does not have the path to the leaf node
    // Will trigger lazy fetch in layout-router because of missing segment
    return
  }

  let childSegmentMap = newCache.parallelRoutes.get(parallelRouteKey)
  if (!childSegmentMap || childSegmentMap === existingChildSegmentMap) {
    childSegmentMap = new Map(existingChildSegmentMap)
    newCache.parallelRoutes.set(parallelRouteKey, childSegmentMap)
  }

  const existingChildCacheNode = existingChildSegmentMap.get(cacheKey)
  let childCacheNode = childSegmentMap.get(cacheKey)
  const cacheNodeSeedData = flightDataPath[3]

  if (isLastEntry) {
    if (
      cacheNodeSeedData &&
      (!childCacheNode ||
        !childCacheNode.lazyData ||
        childCacheNode === existingChildCacheNode)
    ) {
      const rsc = cacheNodeSeedData[2]
      const loading = cacheNodeSeedData[3]
      childCacheNode = {
        lazyData: null,
        rsc,
        prefetchRsc: null,
        head: null,
        prefetchHead: null,
        loading,
        parallelRoutes: fillLazyItems
          ? existingChildCacheNode
            ? new Map(existingChildCacheNode.parallelRoutes)
            : new Map()
          : new Map(),
      }

      if (existingChildCacheNode && fillLazyItems) {
        invalidateCacheByRouterState(
          childCacheNode,
          existingChildCacheNode,
          flightDataPath[2]
        )
      }
      if (fillLazyItems) {
        fillLazyItemsTillLeafWithHead(
          childCacheNode,
          existingChildCacheNode,
          flightDataPath[2],
          cacheNodeSeedData,
          flightDataPath[4],
          prefetchEntry
        )
      }

      childSegmentMap.set(cacheKey, childCacheNode)
    }
    return
  }

  if (!childCacheNode || !existingChildCacheNode) {
    // Bailout because the existing cache does not have the path to the leaf node
    // Will trigger lazy fetch in layout-router because of missing segment
    return
  }

  if (childCacheNode === existingChildCacheNode) {
    childCacheNode = {
      lazyData: childCacheNode.lazyData,
      rsc: childCacheNode.rsc,
      prefetchRsc: childCacheNode.prefetchRsc,
      head: childCacheNode.head,
      prefetchHead: childCacheNode.prefetchHead,
      parallelRoutes: new Map(childCacheNode.parallelRoutes),
      loading: childCacheNode.loading,
    } as CacheNode
    childSegmentMap.set(cacheKey, childCacheNode)
  }

  fillCacheHelper(
    childCacheNode,
    existingChildCacheNode,
    flightDataPath.slice(2),
    prefetchEntry,
    fillLazyItems
  )
}

/**
 * Fill cache with rsc based on flightDataPath
 */
export function fillCacheWithNewSubTreeData(
  newCache: CacheNode,
  existingCache: CacheNode,
  flightDataPath: FlightDataPath,
  prefetchEntry?: PrefetchCacheEntry
): void {
  fillCacheHelper(newCache, existingCache, flightDataPath, prefetchEntry, true)
}

export function fillCacheWithNewSubTreeDataButOnlyLoading(
  newCache: CacheNode,
  existingCache: CacheNode,
  flightDataPath: FlightDataPath,
  prefetchEntry?: PrefetchCacheEntry
): void {
  fillCacheHelper(newCache, existingCache, flightDataPath, prefetchEntry, false)
}
