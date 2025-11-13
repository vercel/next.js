import { normalizeAppPath } from './app-paths'

// order matters here, the first match will be used
export const INTERCEPTION_ROUTE_MARKERS = [
  '(..)(..)',
  '(.)',
  '(..)',
  '(...)',
] as const

export function isInterceptionRouteAppPath(path: string): boolean {
  // TODO-APP: add more serious validation
  return (
    path
      .split('/')
      .find((segment) =>
        INTERCEPTION_ROUTE_MARKERS.find((m) => segment.startsWith(m))
      ) !== undefined
  )
}

type InterceptionRouteInformation = {
  /**
   * The intercepting route. This is the route that is being intercepted or the
   * route that the user was coming from. This is matched by the Next-Url
   * header.
   */
  interceptingRoute: string

  /**
   * The intercepted route. This is the route that is being intercepted or the
   * route that the user is going to. This is matched by the request pathname.
   */
  interceptedRoute: string
}

export function extractInterceptionRouteInformation(
  path: string
): InterceptionRouteInformation {
  let interceptingRoute: string | undefined
  let marker: (typeof INTERCEPTION_ROUTE_MARKERS)[number] | undefined
  let interceptedRoute: string | undefined

  for (const segment of path.split('/')) {
    marker = INTERCEPTION_ROUTE_MARKERS.find((m) => segment.startsWith(m))
    if (marker) {
      ;[interceptingRoute, interceptedRoute] = path.split(marker, 2)
      break
    }
  }

  if (!interceptingRoute || !marker || !interceptedRoute) {
    throw new Error(
      `Invalid interception route: ${path}. Must be in the format /<intercepting route>/(..|...|..)(..)/<intercepted route>`
    )
  }

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
