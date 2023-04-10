import { normalizeAppPath } from '../../../shared/lib/router/utils/app-paths'

// order matters here, the first match will be used
export const INTERCEPTION_ROUTE_MARKERS = ['(..)(..)', '(..)', '(...)'] as const

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

export function extractInterceptionRouteInformation(path: string) {
  let interceptingRoute: string | undefined,
    marker: typeof INTERCEPTION_ROUTE_MARKERS[number] | undefined,
    interceptedRoute: string | undefined

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

  interceptingRoute = interceptingRoute.slice(0, -1) // remove the trailing slash
  interceptingRoute = normalizeAppPath(interceptingRoute) // normalize the path, e.g. /(blog)/feed -> /feed

  if (marker === '(..)') {
    // (..) indicates that we should remove the last segment of the intercepting
    // route to prepend the intercepted route.
    interceptedRoute =
      interceptingRoute.split('/').slice(0, -1).join('/') +
      '/' +
      interceptedRoute
  }

  if (marker === '(...)') {
    // (...) will match the route segment in the root directory, so we need to
    // use the root directory to prepend the intercepted route.
    interceptedRoute = '/' + interceptedRoute
  }

  if (marker === '(..)(..)') {
    // (..)(..) indicates that we should remove the last two segments of the
    // intercepting route to prepend the intercepted route.
    interceptedRoute =
      interceptingRoute.split('/').slice(0, -2).join('/') +
      '/' +
      interceptedRoute
  }
  return { interceptingRoute, interceptedRoute }
}
