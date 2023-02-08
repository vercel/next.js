import { FlightRouterState } from '../../../../server/app-render'
import { ChildSegmentMap } from '../../../../shared/lib/app-router-context'

export function findHeadInCache(
  childSegmentMap: ChildSegmentMap,
  parallelRoutes: FlightRouterState[1]
): React.ReactNode {
  const isLastItem = Object.keys(parallelRoutes).length === 0
  if (isLastItem) {
    return cache.head
  }
  for (const key in parallelRoutes) {
    const [segment, childParallelRoutes] = parallelRoutes[key]
    const childSegmentMap = cache.parallelRoutes.get(key)
    if (!childSegmentMap) {
      continue
    }

    const cacheKey = Array.isArray(segment) ? segment[1] : segment

    const cacheNode = childSegmentMap.get(cacheKey)
    if (!cacheNode) {
      continue
    }

    const item = findHeadInCache(cacheNode, childParallelRoutes)
    if (item) {
      return item
    }
  }

  return undefined
}
