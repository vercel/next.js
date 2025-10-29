import type {
  FlightRouterState,
  Segment,
} from '../../../shared/lib/app-router-types'
import { convertDynamicParamType } from '../../../shared/lib/convert-dynamic-param-type'
import { PAGE_SEGMENT_KEY } from '../../../shared/lib/segment'

/**
 * Extracts the route structure from a FlightRouterState tree by finding
 * the page that matches the given pathname. The route includes:
 * - Route groups: (groupName)
 * - Parallel routes: @slotName
 * - Dynamic parameters: [paramName]
 *
 * This differs from extractPathFromFlightRouterState in that it:
 * 1. Searches for a specific pathname match first
 * 2. Preserves route groups and parallel route markers
 * 3. Returns the file-system structure rather than the URL structure
 *
 * @param targetPathname - The pathname to find in the tree (e.g., "/blog/post-1")
 * @param flightRouterState - The FlightRouterState tree to search
 * @returns The canonical route (e.g., "/blog/[slug]") or null if not found
 */
export function extractRouteFromFlightRouterState(
  targetPathname: string,
  flightRouterState: FlightRouterState
): string | null {
  return extract(targetPathname, flightRouterState, [])
}

function extract(
  targetPathname: string,
  flightRouterState: FlightRouterState,
  segments: string[]
): string | null {
  const [segment, parallelRoutes, url] = flightRouterState

  // Skip root segment (empty string) but check all parallel routes
  if (segment === '') {
    if (parallelRoutes) {
      // Try children first (the default parallel route)
      if (parallelRoutes.children) {
        const result = extract(
          targetPathname,
          parallelRoutes.children,
          segments
        )
        if (result !== null) {
          return result
        }
      }

      // If children didn't match, try other parallel routes
      for (const parallelRouteKey in parallelRoutes) {
        if (parallelRouteKey === 'children') continue
        const parallelRouteValue = parallelRoutes[parallelRouteKey]

        // For root-level named parallel routes, add the @slot marker
        const segmentsWithSlot = [`@${parallelRouteKey}`]

        const result = extract(
          targetPathname,
          parallelRouteValue,
          segmentsWithSlot
        )

        if (result !== null) {
          return result
        }
      }
    }
    // If nothing matched in any parallel route, return null
    return null
  }

  // Check if we've reached a page marker
  if (typeof segment === 'string' && segment.startsWith(PAGE_SEGMENT_KEY)) {
    // During client-side navigation, the url field may be null/undefined
    // If the url matches OR is null (meaning this is the active page for the current path),
    // we should return the canonical route we've built
    const urlMatches = url === targetPathname
    const isNullUrl = url === null || url === undefined

    if (urlMatches || isNullUrl) {
      return segments.length > 0 ? '/' + segments.join('/') : '/'
    }
    // This page doesn't match - return null to continue searching
    return null
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

  // Search parallel routes in priority order
  if (parallelRoutes) {
    // Try children first (the default parallel route)
    // If children matches, return immediately - don't check other parallel routes
    if (parallelRoutes.children) {
      const result = extract(
        targetPathname,
        parallelRoutes.children,
        currentSegments
      )
      if (result !== null) {
        return result
      }
    }

    // Only check other parallel routes (named slots) if children didn't match
    // This happens during intercepted routes where the modal is active
    for (const parallelRouteKey in parallelRoutes) {
      // Skip children since we already tried it
      if (parallelRouteKey === 'children') continue
      const parallelRouteValue = parallelRoutes[parallelRouteKey]

      // For named parallel routes, the @slot marker comes AFTER the parent segment
      // Example: /see/@modal/(slot) where "see" is parent, @modal is the slot marker
      const segmentsWithSlot = [...currentSegments, `@${parallelRouteKey}`]

      const result = extract(
        targetPathname,
        parallelRouteValue,
        segmentsWithSlot
      )

      if (result !== null) {
        return result
      }
    }
  }

  return null
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
