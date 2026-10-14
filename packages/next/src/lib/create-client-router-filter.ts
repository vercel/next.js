import type { Route } from '../shared/lib/route-types'
import type { Token } from 'next/dist/compiled/path-to-regexp'
import { BloomFilter } from '../shared/lib/bloom-filter'
import { isDynamicRoute } from '../shared/lib/router/utils'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import type { Redirect } from './load-custom-routes'
import { tryToParsePath } from './try-to-parse-path'
import {
  extractInterceptionRouteInformation,
  isInterceptionRouteAppPath,
} from '../shared/lib/router/utils/interception-routes'
import { DYNAMIC_FILTER_PLACEHOLDER } from '../shared/lib/router/utils/dynamic-filter-pattern'

export function createClientRouterFilter(
  paths: Route[],
  redirects: Redirect[],
  allowedErrorRate?: number
): {
  staticFilter: ReturnType<BloomFilter['export']>
  dynamicFilter: ReturnType<BloomFilter['export']>
} {
  const staticPaths = new Set<Route>()
  const dynamicPaths = new Set<string>()

  for (let path of paths) {
    if (isDynamicRoute(path)) {
      if (isInterceptionRouteAppPath(path)) {
        // This caller supplies normalized matcher paths, so rebasing the marker
        // constructs another URL pathname rather than a raw App module name.
        path = extractInterceptionRouteInformation(path)
          .interceptedRoute as Route
      }

      let subPath = ''
      const pathParts = path.split('/')

      // start at 1 since we split on '/' and the path starts
      // with this so the first entry is an empty string
      for (let i = 1; i < pathParts.length; i++) {
        const curPart = pathParts[i]

        if (curPart.startsWith('[')) {
          break
        }
        subPath = `${subPath}/${curPart}`
      }

      if (subPath) {
        dynamicPaths.add(subPath)
      } else {
        // The route begins with a dynamic segment, so it has no static
        // prefix to anchor the prefix-based dynamic filter on (e.g.
        // `/[locale]/about`). Store its normalized pattern instead so the
        // client can still detect it when a pages dynamic route would
        // otherwise shadow it.
        dynamicPaths.add(normalizeRouteToFilterPattern(path))
      }
    } else {
      staticPaths.add(path)
    }
  }

  for (const redirect of redirects) {
    const { source } = redirect
    const path = removeTrailingSlash(source)
    let tokens: Token[] = []

    try {
      tokens = tryToParsePath(source).tokens || []
    } catch {}

    if (tokens.every((token) => typeof token === 'string')) {
      // only include static redirects initially
      // @ts-ignore Human review: a static path-to-regexp source can retain escaping; it is not necessarily the normalized URL pathname stored by the other static entries. Preserve redirect filtering.
      staticPaths.add(path)
    }
  }

  const staticFilter = BloomFilter.from([...staticPaths], allowedErrorRate)

  const dynamicFilter = BloomFilter.from([...dynamicPaths], allowedErrorRate)
  const data = {
    staticFilter: staticFilter.export(),
    dynamicFilter: dynamicFilter.export(),
  }
  return data
}

/**
 * Replace every dynamic segment of a route with the placeholder token, e.g.
 * `/[locale]/about` -> `/[]/about`, `/[lang]` -> `/[]`. This is the encode half
 * of the dynamic filter; the pages router decodes it with
 * `hasDynamicFilterCandidate`, and both rely on `DYNAMIC_FILTER_PLACEHOLDER`.
 */
function normalizeRouteToFilterPattern(route: Route): string {
  return route
    .split('/')
    .map((segment) =>
      segment.startsWith('[') ? DYNAMIC_FILTER_PLACEHOLDER : segment
    )
    .join('/')
}
