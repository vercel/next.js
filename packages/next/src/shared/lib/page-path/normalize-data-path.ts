import type { Route } from '../route-types'
import { pathHasPrefix } from '../router/utils/path-has-prefix'

/**
 * strip _next/data/<build-id>/ prefix and .json suffix
 */
export function normalizeDataPath(pathname: Route): Route {
  if (!pathHasPrefix(pathname || '/', '/_next/data')) {
    return pathname
  }
  pathname = pathname
    .replace(/\/_next\/data\/[^/]{1,}/, '')
    .replace(/\.json$/, '') as Route

  if (pathname === '/index') {
    return '/' as Route
  }
  return pathname
}
