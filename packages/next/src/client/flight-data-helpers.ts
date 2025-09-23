import type { FlightRouterState, Segment } from '../server/app-render/types'
import { PAGE_SEGMENT_KEY } from '../shared/lib/segment'

/**
 * This function is used to prepare the flight router state for the request.
 * It removes markers that are not needed by the server, and are purely used
 * for stashing state on the client.
 * @param flightRouterState - The flight router state to prepare.
 * @param isHmrRefresh - Whether this is an HMR refresh request.
 * @returns The prepared flight router state.
 */
export function prepareFlightRouterStateForRequest(
  flightRouterState: FlightRouterState,
  isHmrRefresh?: boolean
): string {
  // HMR requests need the complete, unmodified state for proper functionality
  if (isHmrRefresh) {
    return encodeURIComponent(JSON.stringify(flightRouterState))
  }

  return encodeURIComponent(
    JSON.stringify(stripClientOnlyDataFromFlightRouterState(flightRouterState))
  )
}

/**
 * Recursively strips client-only data from FlightRouterState while preserving
 * server-needed information for proper rendering decisions.
 */
function stripClientOnlyDataFromFlightRouterState(
  flightRouterState: FlightRouterState
): FlightRouterState {
  const [segment, parallelRoutes, , refreshMarker, isRootLayout] =
    flightRouterState

  // __PAGE__ segments are always fetched from the server, so there's
  // no need to send them up
  const cleanedSegment = stripSearchParamsFromPageSegment(segment)

  // Recursively process parallel routes
  const cleanedParallelRoutes: { [key: string]: FlightRouterState } = {}
  for (const [key, childState] of Object.entries(parallelRoutes)) {
    cleanedParallelRoutes[key] =
      stripClientOnlyDataFromFlightRouterState(childState)
  }

  const result: FlightRouterState = [
    cleanedSegment,
    cleanedParallelRoutes,
    null, // URLs omitted - server reconstructs paths from segments
    shouldPreserveRefreshMarker(refreshMarker) ? refreshMarker : null,
  ]

  // Append optional fields if present
  if (isRootLayout !== undefined) {
    result[4] = isRootLayout
  }

  return result
}

/**
 * Strips search parameters from __PAGE__ segments to prevent sensitive
 * client-side data from being sent to the server.
 */
function stripSearchParamsFromPageSegment(segment: Segment): Segment {
  if (
    typeof segment === 'string' &&
    segment.startsWith(PAGE_SEGMENT_KEY + '?')
  ) {
    return PAGE_SEGMENT_KEY
  }
  return segment
}

/**
 * Determines whether the refresh marker should be sent to the server
 * Client-only markers like 'refresh' are stripped, while server-needed markers
 * like 'refetch' and 'inside-shared-layout' are preserved.
 */
function shouldPreserveRefreshMarker(
  refreshMarker: FlightRouterState[3]
): boolean {
  return Boolean(refreshMarker && refreshMarker !== 'refresh')
}
