import { CacheNode, CacheStates } from '../../../shared/lib/app-router-context'
import { FlightRouterState } from '../../../server/app-render'

export function fillLazyItemsTillLeafWithHead(
  newCache: CacheNode,
  existingCache: CacheNode | undefined,
  routerState: FlightRouterState,
  head: React.ReactNode
): void {
  const isLastSegment = Object.keys(routerState[1]).length === 0
  if (isLastSegment) {
    newCache.head = head
    return
  }
  // Remove segment that we got data for so that it is filled in during rendering of subTreeData.
  for (const key in routerState[1]) {
    const parallelRouteState = routerState[1][key]
    const segmentForParallelRoute = parallelRouteState[0]
    const cacheKey = Array.isArray(segmentForParallelRoute)
      ? segmentForParallelRoute[1]
      : segmentForParallelRoute
    if (existingCache) {
      const existingParallelRoutesCacheNode =
        existingCache.parallelRoutes.get(key)
      if (existingParallelRoutesCacheNode) {
        let parallelRouteCacheNode = new Map(existingParallelRoutesCacheNode)
        parallelRouteCacheNode.delete(cacheKey)
        const newCacheNode: CacheNode = {
          status: CacheStates.LAZY_INITIALIZED,
          data: null,
          subTreeData: null,
          parallelRoutes: new Map(),
        }
        parallelRouteCacheNode.set(cacheKey, newCacheNode)
        fillLazyItemsTillLeafWithHead(
          newCacheNode,
          undefined,
          parallelRouteState,
          head
        )

        newCache.parallelRoutes.set(key, parallelRouteCacheNode)
        continue
      }
    }

    const newCacheNode: CacheNode = {
      status: CacheStates.LAZY_INITIALIZED,
      data: null,
      subTreeData: null,
      parallelRoutes: new Map(),
    }
    newCache.parallelRoutes.set(key, new Map([[cacheKey, newCacheNode]]))
    fillLazyItemsTillLeafWithHead(
      newCacheNode,
      undefined,
      parallelRouteState,
      head
    )
  }
}
