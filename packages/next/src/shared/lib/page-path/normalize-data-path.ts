const NEXT_DATA_PATHNAME_REGEX = /^\/_next\/data\/([^/]+)\/(.*)\.json$/

export function parseDataPathname(
  pathname: string
): { buildId: string; pathname: string } | undefined {
  const match = pathname.match(NEXT_DATA_PATHNAME_REGEX)
  if (!match) return

  const [, buildId, routePath] = match
  const routePathname = `/${routePath}`

  return {
    buildId,
    pathname: routePathname === '/index' ? '/' : routePathname,
  }
}

/**
 * strip _next/data/<build-id>/ prefix and .json suffix
 */
export function normalizeDataPath(pathname: string) {
  return parseDataPathname(pathname)?.pathname ?? pathname
}
