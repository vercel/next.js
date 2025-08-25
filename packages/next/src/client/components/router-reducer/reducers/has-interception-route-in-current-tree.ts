import type { FlightRouterState } from '../../../../shared/lib/app-router-types'
import { isInterceptionRouteAppPath } from '../../../../shared/lib/router/utils/interception-routes'

export function hasInterceptionRouteInCurrentTree([
  segment,
  parallelRoutes,
]: FlightRouterState): boolean {
  // If we have a dynamic segment, it's marked as an interception route by the presence of the `i` suffix.
  if (Array.isArray(segment) && (segment[2] === 'di' || segment[2] === 'ci')) {
    return true
  }

  // If segment is not an array, apply the existing string-based check
  if (typeof segment === 'string' && isInterceptionRouteAppPath(segment)) {
    return true
  }

  // Iterate through parallelRoutes if they exist
  if (parallelRoutes) {
    for (const key in parallelRoutes) {
      if (hasInterceptionRouteInCurrentTree(parallelRoutes[key])) {
        return true
      }
    }
  }

  return false
}
