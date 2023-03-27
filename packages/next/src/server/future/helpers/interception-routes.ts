import { normalizeAppPath } from '../../../shared/lib/router/utils/app-paths'

// order matters here, the first match will be used
const specialMarkers = ['(..)(..)', '(..)', '(...)'] as const

export function isIntersectionRouteAppPath(path: string): boolean {
  // TODO-APP: add more serious validation
  return (
    path
      .split('/')
      .find(
        (p) =>
          p.startsWith('(..)') ||
          p.startsWith('(...)') ||
          p.startsWith('(..)(..)')
      ) !== undefined
  )
}

export function extractInterceptionRouteInformation(path: string) {
  let interceptingRoute: string | undefined,
    marker: typeof specialMarkers[number] | undefined,
    interceptedRoute: string | undefined

  for (const segment of path.split('/')) {
    if (specialMarkers.some((m) => segment.startsWith(m))) {
      marker = specialMarkers.find((m) => segment.startsWith(m))
      ;[interceptingRoute, interceptedRoute] = path.split(marker!, 2)
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

  console.log(interceptingRoute, marker, interceptedRoute)
  if (marker === '(..)') {
    interceptedRoute =
      interceptingRoute.split('/').slice(0, -1).join('/') +
      '/' +
      interceptedRoute
  }

  if (marker === '(...)') {
    interceptedRoute = '/' + interceptedRoute
  }

  if (marker === '(..)(..)') {
    interceptedRoute =
      interceptingRoute.split('/').slice(0, -2).join('/') +
      '/' +
      interceptedRoute
  }
  return [interceptingRoute, interceptedRoute]
}
