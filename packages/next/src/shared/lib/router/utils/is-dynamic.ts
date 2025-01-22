import {
  extractInterceptionRouteInformation,
  isInterceptionRouteAppPath,
} from '../../../../server/lib/interception-routes'

// Identify /.*[param].*/ in route string
const TEST_ROUTE = /\/[^/]*\[[^/]+\][^/]*(?=\/|$)/

// Identify /[param]/ in route string
const TEST_STRICT_ROUTE = /\[[^/]+\](?=\/|$)/

export function isDynamicRoute(route: string, strict: boolean = true): boolean {
  if (isInterceptionRouteAppPath(route)) {
    route = extractInterceptionRouteInformation(route).interceptedRoute
  }

  if (strict) {
    return TEST_STRICT_ROUTE.test(route)
  }

  return TEST_ROUTE.test(route)
}
