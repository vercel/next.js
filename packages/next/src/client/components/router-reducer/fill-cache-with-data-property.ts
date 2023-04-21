import { CacheNode, CacheStates } from '../../../shared/lib/app-router-context'
import { fetchServerResponse } from './fetch-server-response'

/**
 * Kick off fetch based on the common layout between two routes. Fill cache with data property holding the in-progress fetch.
 */
export function fillCacheWithDataProperty(
  newCache: CacheNode,
  existingCache: CacheNode,
  segments: string[],
  fetchResponse: () => ReturnType<typeof fetchServerResponse>
): { bailOptimistic: boolean } | undefined {
  const isLastEntry = segments.length === 1

  const parallelRouteKey = 'children'
  const [segment] = segments

  const existingChildSegmentMap =
    existingCache.parallelRoutes.get(parallelRouteKey)

  if (!existingChildSegmentMap) {
    // Bailout because the existing cache does not have the path to the leaf node
    // Will trigger lazy fetch in layout-router because of missing segment
    return { bailOptimistic: true }
  }

  let childSegmentMap = newCache.parallelRoutes.get(parallelRouteKey)

  if (!childSegmentMap || childSegmentMap === existingChildSegmentMap) {
    childSegmentMap = new Map(existingChildSegmentMap)
    newCache.parallelRoutes.set(parallelRouteKey, childSegmentMap)
  }

  const existingChildCacheNode = existingChildSegmentMap.get(segment)
  let childCacheNode = childSegmentMap.get(segment)

  // In case of last segment start off the fetch at this level and don't copy further down.
  if (isLastEntry) {
    if (
      !childCacheNode ||
      !childCacheNode.data ||
      childCacheNode === existingChildCacheNode
    ) {
      childSegmentMap.set(segment, {
        status: CacheStates.DATA_FETCH,
        data: fetchResponse(),
        subTreeData: null,
        parallelRoutes: new Map(),
      })
    }
    return
  }

  if (!childCacheNode || !existingChildCacheNode) {
    // Start fetch in the place where the existing cache doesn't have the data yet.
    if (!childCacheNode) {
      childSegmentMap.set(segment, {
        status: CacheStates.DATA_FETCH,
        data: fetchResponse(),
        subTreeData: null,
        parallelRoutes: new Map(),
      })
    }
    return
  }

  if (childCacheNode === existingChildCacheNode) {
    childCacheNode = {
      status: childCacheNode.status,
      data: childCacheNode.data,
      subTreeData: childCacheNode.subTreeData,
      parallelRoutes: new Map(childCacheNode.parallelRoutes),
    } as CacheNode
    childSegmentMap.set(segment, childCacheNode)
  }

  return fillCacheWithDataProperty(
    childCacheNode,
    existingChildCacheNode,
    segments.slice(1),
    fetchResponse
  )
}
