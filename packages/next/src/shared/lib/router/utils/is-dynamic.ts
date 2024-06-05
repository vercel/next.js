import {
  extractInterceptionRouteInformation,
  isInterceptionRouteAppPath,
} from '../../../../server/lib/interception-routes'

// Identify /[param]/ in route string
const TEST_ROUTE = /\/\[[^/]+?\](?=\/|$)/

export function isDynamicRoute(route: string): boolean {
  if (isInterceptionRouteAppPath(route)) {
    route = extractInterceptionRouteInformation(route).interceptedRoute
  }

  return TEST_ROUTE.test(route)
}
