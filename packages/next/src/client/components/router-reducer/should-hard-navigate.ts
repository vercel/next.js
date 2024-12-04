import type {
  FlightRouterState,
  FlightDataPath,
  Segment,
} from '../../../server/app-render/types'
import { getNextFlightSegmentPath } from '../../flight-data-helpers'
import { matchSegment } from '../match-segments'

// TODO-APP: flightSegmentPath will be empty in case of static response, needs to be handled.
export function shouldHardNavigate(
  flightSegmentPath: FlightDataPath,
  flightRouterState: FlightRouterState
): boolean {
  const [segment, parallelRoutes] = flightRouterState
  // TODO-APP: Check if `as` can be replaced.
  const [currentSegment, parallelRouteKey] = flightSegmentPath as [
    Segment,
    string,
  ]

  // Check if current segment matches the existing segment.
  if (!matchSegment(currentSegment, segment)) {
    // If dynamic parameter in tree doesn't match up with segment path a hard navigation is triggered.
    if (Array.isArray(currentSegment)) {
      return true
    }

    // If the existing segment did not match soft navigation is triggered.
    return false
  }
  const lastSegment = flightSegmentPath.length <= 2

  if (lastSegment) {
    return false
  }

  return shouldHardNavigate(
    getNextFlightSegmentPath(flightSegmentPath),
    parallelRoutes[parallelRouteKey]
  )
}
