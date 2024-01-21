import { normalizeAppPath } from '../../../shared/lib/router/utils/app-paths'

// order matters here, the first match will be used
export const INTERCEPTION_ROUTE_MARKERS = [
  '(..)(..)',
  '(.)',
  '(..)',
  '(...)',
] as const

export const INTERCEPTION_ROUTE_REGEXP =
  /(?<interceptingRoute>.*\/)(?<marker>\(\.\.\)\(\.\.\)|\(\.{1,3}\))(?<interceptedRoute>.+)/

export function isInterceptionRouteAppPath(path: string): boolean {
  return Boolean(path.match(INTERCEPTION_ROUTE_REGEXP))
}

export function extractInterceptionRouteInformation(path: string) {
  const interceptedRouteMatch = path.match(INTERCEPTION_ROUTE_REGEXP)

  if (!interceptedRouteMatch?.groups) {
    throw new Error(
      `Invalid interception route: ${path}. Must be in the format /<intercepting route>/(...)|(..)(..)|(..)|(.)<intercepted route>`
    )
  }

  let { interceptingRoute, marker, interceptedRoute } =
    interceptedRouteMatch.groups
  interceptingRoute = normalizeAppPath(interceptingRoute) // normalize the path, e.g. /(blog)/feed -> /feed

  switch (marker) {
    case '(.)':
      // (.) indicates that we should match with sibling routes, so we just need to append the intercepted route to the intercepting route
      if (interceptingRoute === '/') {
        interceptedRoute = `/${interceptedRoute}`
      } else {
        interceptedRoute = interceptingRoute + '/' + interceptedRoute
      }
      break
    case '(..)':
      // (..) indicates that we should match at one level up, so we need to remove the last segment of the intercepting route
      if (interceptingRoute === '/') {
        throw new Error(
          `Invalid interception route: ${path}. Cannot use (..) marker at the root level, use (.) instead.`
        )
      }
      interceptedRoute = interceptingRoute
        .split('/')
        .slice(0, -1)
        .concat(interceptedRoute)
        .join('/')
      break
    case '(...)':
      // (...) will match the route segment in the root directory, so we need to use the root directory to prepend the intercepted route
      interceptedRoute = '/' + interceptedRoute
      break
    case '(..)(..)':
      // (..)(..) indicates that we should match at two levels up, so we need to remove the last two segments of the intercepting route

      const splitInterceptingRoute = interceptingRoute.split('/')
      if (splitInterceptingRoute.length <= 2) {
        throw new Error(
          `Invalid interception route: ${path}. Cannot use (..)(..) marker at the root level or one level up.`
        )
      }

      interceptedRoute = splitInterceptingRoute
        .slice(0, -2)
        .concat(interceptedRoute)
        .join('/')
      break
    default:
      throw new Error('Invariant: unexpected marker')
  }

  return { interceptingRoute, interceptedRoute }
}
