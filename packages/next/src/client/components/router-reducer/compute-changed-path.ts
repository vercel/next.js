import type {
  FlightRouterState,
  Segment,
} from '../../../shared/lib/app-router-types'
import { INTERCEPTION_ROUTE_MARKERS } from '../../../shared/lib/router/utils/interception-routes'
import type { Params } from '../../../server/request/params'
import {
  isGroupSegment,
  DEFAULT_SEGMENT_KEY,
  PAGE_SEGMENT_KEY,
} from '../../../shared/lib/segment'
import { matchSegment } from '../match-segments'

const removeLeadingSlash = (segment: string): string => {
  return segment[0] === '/' ? segment.slice(1) : segment
}

const segmentToPathname = (segment: Segment): string => {
  if (typeof segment === 'string') {
    // 'children' is not a valid path -- it's technically a parallel route that corresponds with the current segment's page
    // if we don't skip it, then the computed pathname might be something like `/children` which doesn't make sense.
    if (segment === 'children') return ''

    return segment
  }

  return segment[1]
}

function normalizeSegments(segments: string[]): string {
  return (
    segments.reduce((acc, segment) => {
      segment = removeLeadingSlash(segment)
      if (segment === '' || isGroupSegment(segment)) {
        return acc
      }

      return `${acc}/${segment}`
    }, '') || '/'
  )
}

export function extractPathFromFlightRouterState(
  flightRouterState: FlightRouterState
): string | undefined {
  const segment = Array.isArray(flightRouterState[0])
    ? flightRouterState[0][1]
    : flightRouterState[0]

  if (
    segment === DEFAULT_SEGMENT_KEY ||
    INTERCEPTION_ROUTE_MARKERS.some((m) => segment.startsWith(m))
  )
    return undefined

  if (segment.startsWith(PAGE_SEGMENT_KEY)) return ''

  const segments = [segmentToPathname(segment)]
  const parallelRoutes = flightRouterState[1] ?? {}

  const childrenPath = parallelRoutes.children
    ? extractPathFromFlightRouterState(parallelRoutes.children)
    : undefined

  if (childrenPath !== undefined) {
    segments.push(childrenPath)
  } else {
    for (const [key, value] of Object.entries(parallelRoutes)) {
      if (key === 'children') continue

      const childPath = extractPathFromFlightRouterState(value)

      if (childPath !== undefined) {
        segments.push(childPath)
      }
    }
  }

  return normalizeSegments(segments)
}

function computeChangedPathImpl(
  treeA: FlightRouterState,
  treeB: FlightRouterState
): string | null {
  const [segmentA, parallelRoutesA] = treeA
  const [segmentB, parallelRoutesB] = treeB

  const normalizedSegmentA = segmentToPathname(segmentA)
  const normalizedSegmentB = segmentToPathname(segmentB)

  if (
    INTERCEPTION_ROUTE_MARKERS.some(
      (m) =>
        normalizedSegmentA.startsWith(m) || normalizedSegmentB.startsWith(m)
    )
  ) {
    return ''
  }

  if (!matchSegment(segmentA, segmentB)) {
    // once we find where the tree changed, we compute the rest of the path by traversing the tree
    return extractPathFromFlightRouterState(treeB) ?? ''
  }

  for (const parallelRouterKey in parallelRoutesA) {
    if (parallelRoutesB[parallelRouterKey]) {
      const changedPath = computeChangedPathImpl(
        parallelRoutesA[parallelRouterKey],
        parallelRoutesB[parallelRouterKey]
      )
      if (changedPath !== null) {
        return `${segmentToPathname(segmentB)}/${changedPath}`
      }
    }
  }

  return null
}

export function computeChangedPath(
  treeA: FlightRouterState,
  treeB: FlightRouterState
): string | null {
  const changedPath = computeChangedPathImpl(treeA, treeB)

  if (changedPath == null || changedPath === '/') {
    return changedPath
  }

  // lightweight normalization to remove route groups
  return normalizeSegments(changedPath.split('/'))
}

/**
 * Recursively extracts dynamic parameters from FlightRouterState.
 */
export function getSelectedParams(
  currentTree: FlightRouterState,
  params: Params = {}
): Params {
  const parallelRoutes = currentTree[1]

  for (const parallelRoute of Object.values(parallelRoutes)) {
    const segment = parallelRoute[0]
    const isDynamicParameter = Array.isArray(segment)
    const segmentValue = isDynamicParameter ? segment[1] : segment
    if (!segmentValue || segmentValue.startsWith(PAGE_SEGMENT_KEY)) continue

    // Ensure catchAll and optional catchall are turned into an array
    const isCatchAll =
      isDynamicParameter && (segment[2] === 'c' || segment[2] === 'oc')

    if (isCatchAll) {
      params[segment[0]] = segment[1].split('/')
    } else if (isDynamicParameter) {
      params[segment[0]] = segment[1]
    }

    params = getSelectedParams(parallelRoute, params)
  }

  return params
}
