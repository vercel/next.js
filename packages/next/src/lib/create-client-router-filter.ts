import type { Token } from 'next/dist/compiled/path-to-regexp'
import { BloomFilter } from '../shared/lib/bloom-filter'
import { isDynamicRoute } from '../shared/lib/router/utils'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import type { Redirect } from './load-custom-routes'
import { tryToParsePath } from './try-to-parse-path'
import {
  extractInterceptionRouteInformation,
  isInterceptionRouteAppPath,
} from '../server/future/helpers/interception-routes'

export function createClientRouterFilter(
  paths: string[],
  redirects: Redirect[],
  allowedErrorRate?: number
): {
  staticFilter: ReturnType<BloomFilter['export']>
  dynamicFilter: ReturnType<BloomFilter['export']>
} {
  const staticPaths = new Set<string>()
  const dynamicPaths = new Set<string>()

  for (let path of paths) {
    if (isDynamicRoute(path)) {
      if (isInterceptionRouteAppPath(path)) {
        path = extractInterceptionRouteInformation(path).interceptedRoute
      }

      let subPath = ''
      const pathParts = path.split('/')

      // start at 1 since we split on '/' and the path starts
      // with this so the first entry is an empty string
      for (let i = 1; i < pathParts.length + 1; i++) {
        const curPart = pathParts[i]

        if (curPart.startsWith('[')) {
          break
        }
        subPath = `${subPath}/${curPart}`
      }

      if (subPath) {
        dynamicPaths.add(subPath)
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
