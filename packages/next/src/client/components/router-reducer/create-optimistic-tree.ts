import type {
  FlightRouterState,
  Segment,
} from '../../../server/app-render/types'
import { matchDynamicSegment, matchSegment } from '../match-segments'

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
  let segment: Segment = segments[0]
  let segmentMatches = false
  const isLastSegment = segments.length === 1

  if (existingSegment !== null) {
    // attempts to match a dynamic segment. Since "segment" is derived from the URL
    // it won't pass the "matchSegment" check because, for ex, "en" won't ever match ['lang', 'en', 'd'].
    const matchedDynamicSegment = matchDynamicSegment(existingSegment, segment)

    if (matchedDynamicSegment) {
      // if we do manage to match against a dynamic segment, update the segment key
      // e.g. "en" -> ['lang', 'en', 'd']
      segment = existingSegment
    }

    segmentMatches = matchSegment(existingSegment, segment)
  }

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
