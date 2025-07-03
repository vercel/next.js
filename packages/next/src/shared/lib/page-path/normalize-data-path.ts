/**
 * strip _next/data/<build-id>/ prefix and .json suffix
 */
export function normalizeDataPath(pathname: string) {
  pathname = pathname
    .replace(/\/_next\/data\/[^/]{1,}/, '')
    .replace(/\.json$/, '')

  if (pathname === '/index') {
    return '/'
  }
  return pathname
}
