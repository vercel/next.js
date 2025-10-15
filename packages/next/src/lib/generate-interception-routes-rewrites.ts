import { NEXT_URL } from '../client/components/app-router-headers'
import {
  extractInterceptionRouteInformation,
  isInterceptionRouteAppPath,
} from '../shared/lib/router/utils/interception-routes'
import type { Rewrite } from './load-custom-routes'
import type { DeepReadonly } from '../shared/lib/deep-readonly'
import { getNamedRouteRegex } from '../shared/lib/router/utils/route-regex'

export function generateInterceptionRoutesRewrites(
  appPaths: string[],
  basePath = ''
): Rewrite[] {
  const rewrites: Rewrite[] = []

  for (const appPath of appPaths) {
    if (isInterceptionRouteAppPath(appPath)) {
      const { interceptingRoute, interceptedRoute } =
        extractInterceptionRouteInformation(appPath)

      const destination = getNamedRouteRegex(basePath + appPath, {
        prefixRouteKeys: true,
      })

      const header = getNamedRouteRegex(interceptingRoute, {
        prefixRouteKeys: true,
        reference: destination.reference,
      })

      const source = getNamedRouteRegex(basePath + interceptedRoute, {
        prefixRouteKeys: true,
        reference: header.reference,
      })

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
        internal: true,
        regex: source.namedRegex,
      })
    }
  }

  return rewrites
}

export function isInterceptionRouteRewrite(route: DeepReadonly<Rewrite>) {
  // When we generate interception rewrites in the above implementation, we always do so with only a single `has` condition.
  return route.has?.[0]?.key === NEXT_URL
}
