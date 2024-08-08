import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import type {
  FlightDataPath,
  CacheNodeSeedData,
} from '../../../server/app-render/types'
import { invalidateCacheByRouterState } from './invalidate-cache-by-router-state'
import { fillLazyItemsTillLeafWithHead } from './fill-lazy-items-till-leaf-with-head'
import { createRouterCacheKey } from './create-router-cache-key'
import type { PrefetchCacheEntry } from './router-reducer-types'

/**
 * Fill cache with rsc based on flightDataPath
 */
export function fillCacheWithNewSubTreeData(
  newCache: CacheNode,
  existingCache: CacheNode,
  flightDataPath: FlightDataPath,
  prefetchEntry?: PrefetchCacheEntry
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

  if (isLastEntry) {
    if (
      !childCacheNode ||
      !childCacheNode.lazyData ||
      childCacheNode === existingChildCacheNode
    ) {
      const seedData: CacheNodeSeedData = flightDataPath[3]
      const rsc = seedData[2]
      const loading = seedData[3]
      childCacheNode = {
        lazyData: null,
        rsc,
        prefetchRsc: null,
        head: null,
        prefetchHead: null,
        loading,
        // Ensure segments other than the one we got data for are preserved.
        parallelRoutes: existingChildCacheNode
          ? new Map(existingChildCacheNode.parallelRoutes)
          : new Map(),
      }

      if (existingChildCacheNode) {
        invalidateCacheByRouterState(
          childCacheNode,
          existingChildCacheNode,
          flightDataPath[2]
        )
      }

      fillLazyItemsTillLeafWithHead(
        childCacheNode,
        existingChildCacheNode,
        flightDataPath[2],
        seedData,
        flightDataPath[4],
        prefetchEntry
      )

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

  fillCacheWithNewSubTreeData(
    childCacheNode,
    existingChildCacheNode,
    flightDataPath.slice(2),
    prefetchEntry
  )
}
