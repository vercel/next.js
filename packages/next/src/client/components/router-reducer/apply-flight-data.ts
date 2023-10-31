import { CacheStates } from '../../../shared/lib/app-router-context.shared-runtime'
import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import type { FlightDataPath } from '../../../server/app-render/types'
import { fillLazyItemsTillLeafWithHead } from './fill-lazy-items-till-leaf-with-head'
import { fillCacheWithNewSubTreeData } from './fill-cache-with-new-subtree-data'

export function applyFlightData(
  existingCache: CacheNode,
  cache: CacheNode,
  flightDataPath: FlightDataPath,
  wasPrefetched: boolean = false
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
    fillLazyItemsTillLeafWithHead(
      cache,
      existingCache,
      treePatch,
      head,
      wasPrefetched
    )
  } else {
    // Copy subTreeData for the root node of the cache.
    cache.status = CacheStates.READY
    cache.subTreeData = existingCache.subTreeData
    cache.parallelRoutes = new Map(existingCache.parallelRoutes)
    // Create a copy of the existing cache with the subTreeData applied.
    fillCacheWithNewSubTreeData(
      cache,
      existingCache,
      flightDataPath,
      wasPrefetched
    )
  }

  return true
}
