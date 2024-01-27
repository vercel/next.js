import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import { NEXT_URL } from '../client/components/app-router-headers'
import {
  INTERCEPTION_ROUTE_MARKERS,
  extractInterceptionRouteInformation,
  isInterceptionRouteAppPath,
} from '../server/future/helpers/interception-routes'
import type { Rewrite } from './load-custom-routes'

// a function that converts normalised paths (e.g. /foo/[bar]/[baz]) to the format expected by pathToRegexp (e.g. /foo/:bar/:baz)
function toPathToRegexpPath(path: string): string {
  return path.replace(/\[\[?([^\]]+)\]\]?/g, (_, capture) => {
    // handle catch-all segments (e.g. /foo/bar/[...baz] or /foo/bar/[[...baz]])
    if (capture.startsWith('...')) {
      return `:${capture.slice(3)}*`
    }
    return ':' + capture
  })
}

// for interception routes we don't have access to the dynamic segments from the
// referrer route so we mark them as noop for the app renderer so that it
// can retrieve them from the router state later on. This also allows us to
// compile the route properly with path-to-regexp, otherwise it will throw
function voidParamsBeforeInterceptionMarker(path: string): string {
  let newPath = []

  let foundInterceptionMarker = false
  for (const segment of path.split('/')) {
    if (
      INTERCEPTION_ROUTE_MARKERS.find((marker) => segment.startsWith(marker))
    ) {
      foundInterceptionMarker = true
    }

    if (segment.startsWith(':') && !foundInterceptionMarker) {
      newPath.push('__NEXT_EMPTY_PARAM__')
    } else {
      newPath.push(segment)
    }
  }

  return newPath.join('/')
}

export function generateInterceptionRoutesRewrites(
  appPaths: string[],
  basePath = ''
): Rewrite[] {
  const rewrites: Rewrite[] = []

  for (const appPath of appPaths) {
    if (isInterceptionRouteAppPath(appPath)) {
      const { interceptingRoute, interceptedRoute } =
        extractInterceptionRouteInformation(appPath)

      const normalizedInterceptingRoute = `${
        interceptingRoute !== '/' ? toPathToRegexpPath(interceptingRoute) : ''
      }/(.*)?`

      const normalizedInterceptedRoute = toPathToRegexpPath(interceptedRoute)
      const normalizedAppPath = voidParamsBeforeInterceptionMarker(
        toPathToRegexpPath(appPath)
      )

      // pathToRegexp returns a regex that matches the path, but we need to
      // convert it to a string that can be used in a header value
      // to the format that Next/the proxy expects
      let interceptingRouteRegex = pathToRegexp(normalizedInterceptingRoute)
        .toString()
        .slice(2, -3)

      rewrites.push({
        source: `${basePath}${normalizedInterceptedRoute}`,
        destination: `${basePath}${normalizedAppPath}`,
        has: [
          {
            type: 'header',
            key: NEXT_URL,
            value: interceptingRouteRegex,
          },
        ],
      })
    }
  }

  return rewrites
}
