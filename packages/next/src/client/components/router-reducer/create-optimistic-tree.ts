import type { FlightRouterState } from '../../../server/app-render/types'
import { matchSegment } from '../match-segments'

/**
 * Create optimistic version of router state based on the existing router state and segments.
 * This is used to allow rendering layout-routers up till the point where data is missing.
 */
export function createOptimisticTree(
  segments: string[],
  flightRouterState: FlightRouterState | null,
  parentRefetch: boolean
): FlightRouterState {
  const [existingSegment, existingParallelRoutes, url, refresh, isRootLayout] =
    flightRouterState || [null, {}]
  const segment = segments[0]
  const isLastSegment = segments.length === 1

  const segmentMatches =
    existingSegment !== null && matchSegment(existingSegment, segment)

  // if there are multiple parallel routes at this level, we need to refetch here
  // to ensure we get the correct tree. This is because we don't know which
  // parallel route will match the next segment.
  const hasMultipleParallelRoutes =
    Object.keys(existingParallelRoutes).length > 1
  const shouldRefetchThisLevel =
    !flightRouterState || !segmentMatches || hasMultipleParallelRoutes

  let parallelRoutes: FlightRouterState[1] = {}
  if (existingSegment !== null && segmentMatches) {
    parallelRoutes = existingParallelRoutes
  }

  let childTree

  // if there's multiple parallel routes at this level, we shouldn't create an
  // optimistic tree for the next level because we don't know which one will
  // match the next segment.
  if (!isLastSegment && !hasMultipleParallelRoutes) {
    const childItem = createOptimisticTree(
      segments.slice(1),
      parallelRoutes ? parallelRoutes.children : null,
      parentRefetch || shouldRefetchThisLevel
    )

    childTree = childItem
  }

  const result: FlightRouterState = [
    segment,
    {
      ...parallelRoutes,
      ...(childTree ? { children: childTree } : {}),
    },
  ]

  if (url) {
    result[2] = url
  }

  if (!parentRefetch && shouldRefetchThisLevel) {
    result[3] = 'refetch'
  } else if (segmentMatches && refresh) {
    result[3] = refresh
  }

  if (segmentMatches && isRootLayout) {
    result[4] = isRootLayout
  }

  return result
}
