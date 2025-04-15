import type { FlightRouterState } from '../../../../server/app-render/types'
import type { CacheNode } from '../../../../shared/lib/app-router-context.shared-runtime'
import { createRouterCacheKey } from '../create-router-cache-key'

export function findHeadInCache(
  cache: CacheNode,
  parallelRoutes: FlightRouterState[1]
): [CacheNode, string] | null {
  return findHeadInCacheImpl(cache, parallelRoutes, '')
}

function findHeadInCacheImpl(
  cache: CacheNode,
  parallelRoutes: FlightRouterState[1],
  keyPrefix: string
): [CacheNode, string] | null {
  const isLastItem = Object.keys(parallelRoutes).length === 0
  if (isLastItem) {
    // Returns the entire Cache Node of the segment whose head we will render.
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

  for (const key of parallelRoutesKeys) {
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

    const item = findHeadInCacheImpl(
      cacheNode,
      childParallelRoutes,
      keyPrefix + '/' + cacheKey
    )
    if (item) {
      return item
    }
  }

  return null
}
