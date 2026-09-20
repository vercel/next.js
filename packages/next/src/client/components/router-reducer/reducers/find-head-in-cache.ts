import type { RouteTree } from '../../segment-cache/cache'
import type {
  FlightRouterState,
  CacheNode,
} from '../../../../shared/lib/app-router-types'
import { DEFAULT_SEGMENT_KEY } from '../../../../shared/lib/segment'
import { createSegmentKey } from '../create-segment-key'

export function findHeadInCache(
  cache: RouteTree<CacheNode>,
  parallelRoutes: FlightRouterState[1]
): [RouteTree<CacheNode>, string] | null {
  return findHeadInCacheImpl(cache, parallelRoutes, '')
}

function findHeadInCacheImpl(
  cache: RouteTree<CacheNode>,
  parallelRoutes: FlightRouterState[1],
  keyPrefix: string
): [RouteTree<CacheNode>, string] | null {
  const isLastItem = Object.keys(parallelRoutes).length === 0
  if (isLastItem) {
    // Returns the render tree of the segment whose head we will render.
    return [cache, keyPrefix]
  }

  // First try the 'children' parallel route if it exists
  // when starting from the "root", this corresponds with the main page component
  const parallelRoutesKeys = Object.keys(parallelRoutes).filter(
    (key) => key !== 'children'
  )

  // if we are at the root, we need to check the children slot first
  if ('children' in parallelRoutes) {
    parallelRoutesKeys.unshift('children')
  }

  const slots = cache.slots
  if (slots !== null) {
    for (const key of parallelRoutesKeys) {
      const [segment, childParallelRoutes] = parallelRoutes[key]
      // If the parallel is not matched and using the default segment,
      // skip searching the head from it.
      if (segment === DEFAULT_SEGMENT_KEY) {
        continue
      }

      const childRenderTree = slots.get(key)
      if (!childRenderTree) {
        continue
      }

      // This key identifies the Head component, not a cache entry. On the
      // server it must match even when resuming with previously unknown params.
      const segmentKey = createSegmentKey(segment)

      const item = findHeadInCacheImpl(
        childRenderTree,
        childParallelRoutes,
        keyPrefix + '/' + segmentKey
      )

      if (item) {
        return item
      }
    }
  }

  return null
}
