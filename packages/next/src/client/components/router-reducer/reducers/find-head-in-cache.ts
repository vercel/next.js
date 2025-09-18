import type {
  FlightRouterState,
  CacheNode,
} from '../../../../shared/lib/app-router-types'
import { DEFAULT_SEGMENT_KEY } from '../../../../shared/lib/segment'
import { createRouterCacheKey } from '../create-router-cache-key'

export function findHeadInCache(
  cache: CacheNode,
  parallelRoutes: FlightRouterState[1]
): [CacheNode, string, string] | null {
  return findHeadInCacheImpl(cache, parallelRoutes, '', '')
}

function findHeadInCacheImpl(
  cache: CacheNode,
  parallelRoutes: FlightRouterState[1],
  keyPrefix: string,
  keyPrefixWithoutSearchParams: string
): [CacheNode, string, string] | null {
  const isLastItem = Object.keys(parallelRoutes).length === 0
  if (isLastItem) {
    // Returns the entire Cache Node of the segment whose head we will render.
    return [cache, keyPrefix, keyPrefixWithoutSearchParams]
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
    // If the parallel is not matched and using the default segment,
    // skip searching the head from it.
    if (segment === DEFAULT_SEGMENT_KEY) {
      continue
    }
    const childSegmentMap = cache.parallelRoutes.get(key)
    if (!childSegmentMap) {
      continue
    }

    const cacheKey = createRouterCacheKey(segment)
    const cacheKeyWithoutSearchParams = createRouterCacheKey(segment, true)

    const cacheNode = childSegmentMap.get(cacheKey)
    if (!cacheNode) {
      continue
    }

    const item = findHeadInCacheImpl(
      cacheNode,
      childParallelRoutes,
      keyPrefix + '/' + cacheKey,
      keyPrefix + '/' + cacheKeyWithoutSearchParams
    )

    if (item) {
      return item
    }
  }

  return null
}
