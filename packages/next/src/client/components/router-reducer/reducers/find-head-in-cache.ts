import { FlightRouterState } from '../../../../server/app-render'
import { ChildSegmentMap } from '../../../../shared/lib/app-router-context'

export function findHeadInCache(
  childSegmentMap: ChildSegmentMap,
  parallelRoutes: FlightRouterState[1]
): React.ReactNode {
  if (!childSegmentMap) {
    return undefined
  }
  for (const key in parallelRoutes) {
    const [segment, childParallelRoutes] = parallelRoutes[key]
    const isLastItem = Object.keys(childParallelRoutes).length === 0

    const cacheKey = Array.isArray(segment) ? segment[1] : segment

    const cacheNode = childSegmentMap.get(cacheKey)
    if (!cacheNode) {
      continue
    }

    if (isLastItem && cacheNode.head) return cacheNode.head

    const segmentMap = cacheNode.parallelRoutes.get(key)
    if (segmentMap) {
      const item = findHeadInCache(segmentMap, childParallelRoutes)
      if (item) {
        return item
      }
    }
  }

  return undefined
}
