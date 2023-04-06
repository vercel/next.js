import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import { NEXT_URL } from '../client/components/app-router-headers'
import {
  extractInterceptionRouteInformation,
  isInterceptionRouteAppPath,
} from '../server/future/helpers/interception-routes'
import { Rewrite } from './load-custom-routes'

// a function that converts normalised paths (e.g. /foo/[bar]/[baz]) to the format expected by pathToRegexp (e.g. /foo/:bar/:baz)
function toPathToRegexpPath(path: string): string {
  return path.replace(/\[([^\]]+)\]/g, ':$1')
}

export function generateInterceptionRoutesRewrites(
  appPaths: string[]
): Rewrite[] {
  const rewrites: Rewrite[] = []

  for (const appPath of appPaths) {
    if (isInterceptionRouteAppPath(appPath)) {
      const { interceptingRoute, interceptedRoute } =
        extractInterceptionRouteInformation(appPath)

      const normalizedInterceptingRoute = `${toPathToRegexpPath(
        interceptingRoute
      )}/(.*)?`

      const normalizedInterceptedRoute = toPathToRegexpPath(interceptedRoute)
      const normalizedAppPath = toPathToRegexpPath(appPath)

      // pathToRegexp returns a regex that matches the path, but we need to
      // convert it to a string that can be used in a header value
      // to the format that Next/the proxy expects
      let interceptingRouteRegex = pathToRegexp(normalizedInterceptingRoute)
        .toString()
        .slice(2, -3)

      rewrites.push({
        source: normalizedInterceptedRoute,
        destination: normalizedAppPath,
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
