import type { Route } from '../shared/lib/route-types'
import { NEXT_URL } from '../client/components/app-router-headers'
import {
  extractInterceptionRouteInformation,
  isInterceptionRouteAppPath,
} from '../shared/lib/router/utils/interception-routes'
import type { Rewrite } from './load-custom-routes'
import { getNamedRouteRegex } from '../shared/lib/router/utils/route-regex'

export function generateInterceptionRoutesRewrites(
  appPaths: Route[],
  basePath = ''
): Rewrite[] {
  const rewrites: Rewrite[] = []

  for (const appPath of appPaths) {
    if (isInterceptionRouteAppPath(appPath)) {
      const { interceptingRoute, interceptedRoute } =
        extractInterceptionRouteInformation(appPath)

      // These are normalized matcher keys (not raw module identifiers); adding
      // the configured base path preserves the URL pathname representation.
      const destination = getNamedRouteRegex((basePath + appPath) as Route, {
        prefixRouteKeys: true,
      })

      const header = getNamedRouteRegex(interceptingRoute as Route, {
        prefixRouteKeys: true,
        reference: destination.reference,
      })

      const source = getNamedRouteRegex(
        (basePath + interceptedRoute) as Route,
        {
          prefixRouteKeys: true,
          reference: header.reference,
        }
      )

      const headerRegex = header.namedRegex
        // Strip ^ and $ anchors since matchHas() will add them automatically
        .replace(/^\^/, '')
        .replace(/\$$/, '')
        // Replace matching the `/` with matching any route segment.
        .replace(/^\/\(\?:\/\)\?$/, '/.*')
        // Replace the optional trailing with slash capture group with one that
        // will match any descendants.
        .replace(/\(\?:\/\)\?$/, '(?:/.*)?')

      rewrites.push({
        source: source.pathToRegexpPattern,
        destination: destination.pathToRegexpPattern,
        has: [
          {
            type: 'header',
            key: NEXT_URL,
            value: headerRegex,
          },
        ],
        regex: source.namedRegex,
      })
    }
  }

  return rewrites
}
