import type { CacheNode } from '../../shared/lib/app-router-context'
import type { FlightRouterState } from '../../server/app-render'
import { fetchServerResponse } from './app-router.client'

export const createOptimisticTree = (
  existingState: any,
  url: URL,
  // /dashboard/integrations ['', 'dashboard', 'integrations', 'page']
  segments: string[],
  existingFlightRouterState: FlightRouterState | null,
  childNodes: CacheNode['childNodes'] | null,
  isFirstSegment: boolean,
  parentFetchingData: boolean,
  initialMap = new Map()
): {
  childNodes: CacheNode['childNodes']
  tree: FlightRouterState
} => {
  const [existingSegment, existingParallelRoutes] =
    existingFlightRouterState || [null, {}]
  const segment = segments[0]
  const isLastSegment = segments.length === 1

  let parallelRoutes: FlightRouterState[1] = {}
  if (existingSegment === segment) {
    parallelRoutes = existingParallelRoutes
  }

  if (childNodes) {
    for (const [key, value] of childNodes) {
      initialMap.set(key, {
        subTreeData: value.subTreeData,
        childNodes: new Map(),
      })
    }
  }

  let startedFetch = false
  if (!isFirstSegment && !parentFetchingData) {
    // Seed the cache with missing item
    if (childNodes && !childNodes.has(segment)) {
      startedFetch = true
      console.log('KICKING OFF DATA FETCH IN PUSH', {
        segment,
        url,
      })

      initialMap.set(segment, {
        data: fetchServerResponse(url, existingState.tree),
        subTreeData: null,
        childNodes: new Map(),
      })
    }
  }

  let childTree
  if (!isLastSegment) {
    const passedChildNodes = isFirstSegment
      ? childNodes
      : childNodes && childNodes.has(segment)
      ? childNodes.get(segment)!.childNodes
      : null
    const childItem = createOptimisticTree(
      existingState,
      url,
      segments.slice(1),
      parallelRoutes ? parallelRoutes.children : null,
      passedChildNodes,
      false,
      parentFetchingData || startedFetch,
      isFirstSegment ? initialMap : initialMap.get(segment)!.childNodes
    )

    childTree = childItem.tree
  }

  const result: FlightRouterState = [
    segment,
    {
      ...parallelRoutes,
      ...(childTree ? { children: childTree } : {}),
    },
  ]

  // Add url into the tree
  if (isFirstSegment) {
    result[2] = url.pathname + url.search
  }

  return {
    childNodes: initialMap,
    tree: result,
  }
}
