import type {
  FlightRouterState,
  Segment,
} from '../../../shared/lib/app-router-types'
import { convertDynamicParamType } from '../../../shared/lib/convert-dynamic-param-type'
import { PAGE_SEGMENT_KEY } from '../../../shared/lib/segment'

/**
 * Extracts all route structures from a FlightRouterState tree by finding
 * all pages that match the given pathname. Each route includes:
 * - Route groups: (groupName)
 * - Parallel routes: @slotName
 * - Dynamic parameters: [paramName]
 *
 * This differs from extractPathFromFlightRouterState in that it:
 * 1. Searches for all pathname matches across parallel routes
 * 2. Preserves route groups and parallel route markers
 * 3. Returns the file-system structure rather than the URL structure
 *
 * @param targetPathname - The pathname to find in the tree (e.g., "/blog/post-1")
 * @param flightRouterState - The FlightRouterState tree to search
 * @returns Array of canonical routes (e.g., ["/blog/[slug]", "/blog/@modal/[slug]"])
 */
export function extractRoutesFromFlightRouterState(
  targetPathname: string,
  flightRouterState: FlightRouterState
): string[] {
  const results: string[] = []
  extract(targetPathname, flightRouterState, [], results)
  return results
}

function extract(
  targetPathname: string,
  flightRouterState: FlightRouterState,
  segments: string[],
  results: string[]
): void {
  const [segment, parallelRoutes, url] = flightRouterState

  // Skip root segment (empty string) but check all parallel routes
  if (segment === '') {
    if (parallelRoutes) {
      // Check children (the default parallel route)
      if (parallelRoutes.children) {
        extract(targetPathname, parallelRoutes.children, segments, results)
      }

      // Also check other parallel routes
      for (const parallelRouteKey in parallelRoutes) {
        if (parallelRouteKey === 'children') continue
        const parallelRouteValue = parallelRoutes[parallelRouteKey]

        // For root-level named parallel routes, add the @slot marker
        const segmentsWithSlot = [`@${parallelRouteKey}`]

        extract(targetPathname, parallelRouteValue, segmentsWithSlot, results)
      }
    }
    return
  }

  // Check if we've reached a page marker
  if (typeof segment === 'string' && segment.startsWith(PAGE_SEGMENT_KEY)) {
    // During client-side navigation, the url field may be null/undefined
    // If the url matches OR is null (meaning this is the active page for the current path),
    // we should add the canonical route we've built to results
    const urlMatches = url === targetPathname
    const isNullUrl = url === null || url === undefined

    if (urlMatches || isNullUrl) {
      const route = segments.length > 0 ? '/' + segments.join('/') : '/'
      results.push(route)
    }
    // This page doesn't match or was added - return to continue searching other branches
    return
  }

  // Get the segment value for the canonical route
  const segmentValue = getCanonicalSegmentValue(segment)

  // Skip synthetic '(slot)' segments that Next.js adds internally for parallel routes
  // These only appear immediately after a @parallelRoute marker, e.g., @modal/(slot)
  // We must be careful not to skip user-defined (slot) route groups elsewhere
  const lastSegment = segments.length > 0 ? segments[segments.length - 1] : null
  const isAfterParallelRoute = lastSegment?.startsWith('@')
  const isSyntheticSlot = segmentValue === '(slot)' && isAfterParallelRoute

  // Build the current path with this segment (skip synthetic slots)
  const currentSegments = isSyntheticSlot
    ? segments
    : [...segments, segmentValue]

  // Search all parallel routes
  if (parallelRoutes) {
    // Check children (the default parallel route)
    if (parallelRoutes.children) {
      extract(targetPathname, parallelRoutes.children, currentSegments, results)
    }

    // Also check other parallel routes (named slots)
    for (const parallelRouteKey in parallelRoutes) {
      // Skip children since we already checked it
      if (parallelRouteKey === 'children') continue
      const parallelRouteValue = parallelRoutes[parallelRouteKey]

      // For named parallel routes, the @slot marker comes AFTER the parent segment
      // Example: /see/@modal/(slot) where "see" is parent, @modal is the slot marker
      const segmentsWithSlot = [...currentSegments, `@${parallelRouteKey}`]

      extract(targetPathname, parallelRouteValue, segmentsWithSlot, results)
    }
  }
}

/**
 * Converts a Segment to its canonical string representation matching the file system structure:
 * - Dynamic segments: [paramName, value, 'd'|'di'] → [paramName]
 * - Catch-all segments: [paramName, value, 'c'|'ci'] → [...paramName]
 * - Optional catch-all segments: [paramName, value, 'oc'] → [[...paramName]]
 * - Static segments/route groups: kept as-is
 */
function getCanonicalSegmentValue(segment: Segment): string {
  if (Array.isArray(segment)) {
    const [paramName, , paramType] = segment
    return convertDynamicParamType(paramType, paramName)
  }

  // Static segment or route group - keep as-is
  return segment
}
