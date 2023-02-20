import { CacheNode } from '../../../shared/lib/app-router-context'
import { FlightRouterState } from '../../../server/app-render'

/**
 * Invalidate cache one level down from the router state.
 */
export function invalidateCacheByRouterState(
  newCache: CacheNode,
  existingCache: CacheNode,
  routerState: FlightRouterState
): void {
  // Remove segment that we got data for so that it is filled in during rendering of subTreeData.
  for (const key in routerState[1]) {
    const segmentForParallelRoute = routerState[1][key][0]
    const cacheKey = Array.isArray(segmentForParallelRoute)
      ? segmentForParallelRoute[1]
      : segmentForParallelRoute
    const existingParallelRoutesCacheNode =
      existingCache.parallelRoutes.get(key)
    if (existingParallelRoutesCacheNode) {
      let parallelRouteCacheNode = new Map(existingParallelRoutesCacheNode)
      parallelRouteCacheNode.delete(cacheKey)
      newCache.parallelRoutes.set(key, parallelRouteCacheNode)
    }
  }
}
