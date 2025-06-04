import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import { NEXT_URL } from '../client/components/app-router-headers'
import {
  extractInterceptionRouteInformation,
  isInterceptionRouteAppPath,
} from '../shared/lib/router/utils/interception-routes'
import type { Rewrite } from './load-custom-routes'

// a function that converts normalised paths (e.g. /foo/[bar]/[baz]) to the format expected by pathToRegexp (e.g. /foo/:bar/:baz)
function toPathToRegexpPath(path: string): string {
  let result = path.replace(/\(\.\)\[([^\]]+)\]/g, (_match, capture) => {
    const paramName = capture.replace(/\W+/g, '_')
    return `(.)_${paramName}`
  })

  result = result.replace(/\[\[?([^\]]+)\]\]?/g, (_match, capture) => {
    const paramName = capture.replace(/\W+/g, '_')

    if (capture.startsWith('...')) {
      return `:${capture.slice(3)}*`
    }
    return ':' + paramName
  })
  return result
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
      const normalizedAppPath = toPathToRegexpPath(appPath)

      // pathToRegexp returns a regex that matches the path, but we need to
      // convert it to a string that can be used in a header value
      // to the format that Next/the proxy expects
      let interceptingRouteRegex = pathToRegexp(normalizedInterceptingRoute)
        .toString()
        .slice(2, -11)

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

export function isInterceptionRouteRewrite(route: Rewrite) {
  // When we generate interception rewrites in the above implementation, we always do so with only a single `has` condition.
  return route.has?.[0]?.key === NEXT_URL
}
