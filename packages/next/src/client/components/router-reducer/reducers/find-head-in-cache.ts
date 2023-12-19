import type { FlightRouterState } from '../../../../server/app-render/types'
import type { CacheNode } from '../../../../shared/lib/app-router-context.shared-runtime'
import { createRouterCacheKey } from '../create-router-cache-key'

export function findHeadInCache(
  cache: CacheNode,
  parallelRoutes: FlightRouterState[1]
): CacheNode | null {
  const isLastItem = Object.keys(parallelRoutes).length === 0
  if (isLastItem) {
    // Returns the entire Cache Node of the segment whose head we will render.
    return cache
  }
  for (const key in parallelRoutes) {
    const [segment, childParallelRoutes] = parallelRoutes[key]
    const childSegmentMap = cache.parallelRoutes.get(key)
    if (!childSegmentMap) {
      continue
    }

    const cacheKey = createRouterCacheKey(segment)

    const cacheNode = childSegmentMap.get(cacheKey)
    if (!cacheNode) {
      continue
    }

    const item = findHeadInCache(cacheNode, childParallelRoutes)
    if (item) {
      return item
    }
  }

  return null
}
