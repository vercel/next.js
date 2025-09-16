import { pathHasPrefix } from '../router/utils/path-has-prefix'

/**
 * strip _next/data/<build-id>/ prefix and .json suffix
 */
export function normalizeDataPath(pathname: string) {
  if (!pathHasPrefix(pathname || '/', '/_next/data')) {
    return pathname
  }
  pathname = pathname
    .replace(/\/_next\/data\/[^/]{1,}/, '')
    .replace(/\.json$/, '')

  if (pathname === '/index') {
    return '/'
  }
  return pathname
}
