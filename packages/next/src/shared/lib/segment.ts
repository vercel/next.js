import type { FlightRouterState, Segment } from './app-router-types'

export function getSegmentValue(segment: Segment) {
  return Array.isArray(segment) ? segment[1] : segment
}

export function isGroupSegment(segment: string) {
  // Use array[0] for performant purpose
  return segment[0] === '(' && segment.endsWith(')')
}

export function isParallelRouteSegment(segment: string) {
  return segment.startsWith('@') && segment !== '@children'
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

export function computeSelectedLayoutSegment(
  segments: string[] | null,
  parallelRouteKey: string
): string | null {
  if (!segments || segments.length === 0) {
    return null
  }

  // For 'children', use first segment; for other parallel routes, use last segment
  const rawSegment =
    parallelRouteKey === 'children'
      ? segments[0]
      : segments[segments.length - 1]

  // If the default slot is showing, return null since it's not technically "selected" (it's a fallback)
  // Returning an internal value like `__DEFAULT__` would be confusing
  return rawSegment === DEFAULT_SEGMENT_KEY ? null : rawSegment
}

/** Get the canonical parameters from the current level to the leaf node. */
export function getSelectedLayoutSegmentPath(
  tree: FlightRouterState,
  parallelRouteKey: string,
  first = true,
  segmentPath: string[] = []
): string[] {
  let node: FlightRouterState
  if (first) {
    // Use the provided parallel route key on the first parallel route
    node = tree[1][parallelRouteKey]
  } else {
    // After first parallel route prefer children, if there's no children pick the first parallel route.
    const parallelRoutes = tree[1]
    node = parallelRoutes.children ?? Object.values(parallelRoutes)[0]
  }

  if (!node) return segmentPath
  const segment = node[0]

  let segmentValue = getSegmentValue(segment)

  if (!segmentValue || segmentValue.startsWith(PAGE_SEGMENT_KEY)) {
    return segmentPath
  }

  segmentPath.push(segmentValue)

  return getSelectedLayoutSegmentPath(
    node,
    parallelRouteKey,
    false,
    segmentPath
  )
}

export const PAGE_SEGMENT_KEY = '__PAGE__'
export const DEFAULT_SEGMENT_KEY = '__DEFAULT__'
