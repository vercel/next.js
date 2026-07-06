import type {
  DynamicParamTypesShort,
  FlightRouterState,
  Segment,
} from './app-router-types'

export function getSegmentValue(segment: Segment) {
  return Array.isArray(segment) ? segment[1] : segment
}

/**
 * Whether a dynamic param type (the short form stored in FlightRouterState
 * dynamic segment tuples) is a catch-all, i.e. its value spans multiple URL
 * path segments (stored joined by `/`). Covers plain (`c`), optional (`oc`),
 * and interception-marked (`ci(.)`, `ci(..)`, ...) catch-alls; there is no
 * optional-intercepted variant. Exhaustive over the union (rather than a
 * prefix check) so adding a new param type fails to compile until it is
 * classified here.
 */
export function isCatchAllParamType(type: DynamicParamTypesShort): boolean {
  switch (type) {
    case 'c':
    case 'ci(..)(..)':
    case 'ci(.)':
    case 'ci(..)':
    case 'ci(...)':
    case 'oc':
      return true
    case 'd':
    case 'di(..)(..)':
    case 'di(.)':
    case 'di(..)':
    case 'di(...)':
      return false
    default:
      return type satisfies never
  }
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
export const NOT_FOUND_SEGMENT_KEY = '/_not-found'
