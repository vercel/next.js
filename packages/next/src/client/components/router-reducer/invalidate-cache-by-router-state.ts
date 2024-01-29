import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import type { FlightRouterState } from '../../../server/app-render/types'
import { createRouterCacheKey } from './create-router-cache-key'

/**
 * Invalidate cache one level down from the router state.
 */
export function invalidateCacheByRouterState(
  newCache: CacheNode,
  existingCache: CacheNode,
  routerState: FlightRouterState
): void {
  // Remove segment that we got data for so that it is filled in during rendering of rsc.
  for (const key in routerState[1]) {
    const segmentForParallelRoute = routerState[1][key][0]
    const cacheKey = createRouterCacheKey(segmentForParallelRoute)
    const existingParallelRoutesCacheNode =
      existingCache.parallelRoutes.get(key)
    if (existingParallelRoutesCacheNode) {
      let parallelRouteCacheNode = new Map(existingParallelRoutesCacheNode)
      parallelRouteCacheNode.delete(cacheKey)
      newCache.parallelRoutes.set(key, parallelRouteCacheNode)
    }
  }
}
