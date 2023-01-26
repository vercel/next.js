import {
  FlightRouterState,
  FlightDataPath,
  Segment,
} from '../../../server/app-render'
import { matchSegment } from '../match-segments'

export function shouldHardNavigate(
  flightSegmentPath: FlightDataPath,
  flightRouterState: FlightRouterState,
  treePatch: FlightRouterState
): boolean {
  const [segment, parallelRoutes] = flightRouterState
  // TODO-APP: Check if `as` can be replaced.
  const [currentSegment, parallelRouteKey] = flightSegmentPath as [
    Segment,
    string
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
    flightSegmentPath.slice(2),
    parallelRoutes[parallelRouteKey],
    treePatch
  )
}
