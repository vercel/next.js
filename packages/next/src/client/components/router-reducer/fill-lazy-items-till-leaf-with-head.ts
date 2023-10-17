import { CacheStates } from '../../../shared/lib/app-router-context.shared-runtime'
import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import type { FlightRouterState } from '../../../server/app-render/types'
import { createRouterCacheKey } from './create-router-cache-key'

export function fillLazyItemsTillLeafWithHead(
  newCache: CacheNode,
  existingCache: CacheNode | undefined,
  routerState: FlightRouterState,
  head: React.ReactNode,
  wasPrefetched?: boolean
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
    const cacheKey = createRouterCacheKey(segmentForParallelRoute)

    if (existingCache) {
      const existingParallelRoutesCacheNode =
        existingCache.parallelRoutes.get(key)
      if (existingParallelRoutesCacheNode) {
        let parallelRouteCacheNode = new Map(existingParallelRoutesCacheNode)
        const existingCacheNode = parallelRouteCacheNode.get(cacheKey)
        const newCacheNode: CacheNode =
          wasPrefetched && existingCacheNode
            ? ({
                status: existingCacheNode.status,
                data: existingCacheNode.data,
                subTreeData: existingCacheNode.subTreeData,
                parallelRoutes: new Map(existingCacheNode.parallelRoutes),
              } as CacheNode)
            : {
                status: CacheStates.LAZY_INITIALIZED,
                data: null,
                subTreeData: null,
                parallelRoutes: new Map(existingCacheNode?.parallelRoutes),
              }
        // Overrides the cache key with the new cache node.
        parallelRouteCacheNode.set(cacheKey, newCacheNode)
        // Traverse deeper to apply the head / fill lazy items till the head.
        fillLazyItemsTillLeafWithHead(
          newCacheNode,
          existingCacheNode,
          parallelRouteState,
          head,
          wasPrefetched
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

    const existingParallelRoutes = newCache.parallelRoutes.get(key)
    if (existingParallelRoutes) {
      existingParallelRoutes.set(cacheKey, newCacheNode)
    } else {
      newCache.parallelRoutes.set(key, new Map([[cacheKey, newCacheNode]]))
    }

    fillLazyItemsTillLeafWithHead(
      newCacheNode,
      undefined,
      parallelRouteState,
      head,
      wasPrefetched
    )
  }
}
