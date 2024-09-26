import type { FlightRouterState, Segment } from '../../server/app-render/types'

export function isGroupSegment(segment: string) {
  // Use array[0] for performant purpose
  return segment[0] === '(' && segment.endsWith(')')
}

export function addSearchParamsIfPageSegment(
  segment: Segment,
  searchParams: Record<string, string | string[] | undefined>
) {
  const isPageSegment = segment.includes(PAGE_SEGMENT_KEY)

  if (isPageSegment) {
    const stringifiedQuery = JSON.stringify(searchParams)
    return stringifiedQuery !== '{}'
      ? PAGE_SEGMENT_KEY + '?' + stringifiedQuery
      : PAGE_SEGMENT_KEY
  }

  return segment
}

/**
 * Add search params to the page segments in the flight router state
 * Page segments that are associated with search params have a page segment key
 * followed by a query string. This function will add those params to the page segment.
 * This is useful if we return an aliased prefetch entry (ie, won't have search params)
 * but the canonical router URL has search params.
 */
export function addSearchParamsToPageSegments(
  flightRouterState: FlightRouterState,
  searchParams: Record<string, string | string[] | undefined>
): FlightRouterState {
  const [segment, parallelRoutes, ...rest] = flightRouterState

  // If it's a page segment, modify the segment by adding search params
  if (segment.includes(PAGE_SEGMENT_KEY)) {
    const newSegment = addSearchParamsIfPageSegment(segment, searchParams)
    return [newSegment, parallelRoutes, ...rest]
  }

  // Otherwise, recurse through the parallel routes and return a new tree
  const updatedParallelRoutes: { [key: string]: FlightRouterState } = {}

  for (const [key, parallelRoute] of Object.entries(parallelRoutes)) {
    updatedParallelRoutes[key] = addSearchParamsToPageSegments(
      parallelRoute,
      searchParams
    )
  }

  return [segment, updatedParallelRoutes, ...rest]
}

export const PAGE_SEGMENT_KEY = '__PAGE__'
export const DEFAULT_SEGMENT_KEY = '__DEFAULT__'
