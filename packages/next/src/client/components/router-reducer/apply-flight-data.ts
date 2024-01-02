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
  const [treePatch, cacheNodeSeedData, head] = flightDataPath.slice(-3)

  // Handles case where prefetch only returns the router tree patch without rendered components.
  if (cacheNodeSeedData === null) {
    return false
  }

  if (flightDataPath.length === 3) {
    const rsc = cacheNodeSeedData[2]
    cache.rsc = rsc
    // This is a PPR-only field. When PPR is enabled, we shouldn't hit
    // this path during a navigation, but until PPR is fully implemented
    // yet it's possible the existing node does have a non-null
    // `prefetchRsc`. As an incremental step, we'll just de-opt to the
    // old behavior — no PPR value.
    cache.prefetchRsc = null
    fillLazyItemsTillLeafWithHead(
      cache,
      existingCache,
      treePatch,
      cacheNodeSeedData,
      head,
      wasPrefetched
    )
  } else {
    // Copy rsc for the root node of the cache.
    cache.rsc = existingCache.rsc
    // This is a PPR-only field. Unlike the previous branch, since we're
    // just cloning the existing cache node, we might as well keep the
    // PPR value, if it exists.
    cache.prefetchRsc = existingCache.prefetchRsc
    cache.parallelRoutes = new Map(existingCache.parallelRoutes)
    // Create a copy of the existing cache with the rsc applied.
    fillCacheWithNewSubTreeData(
      cache,
      existingCache,
      flightDataPath,
      wasPrefetched
    )
  }

  return true
}
