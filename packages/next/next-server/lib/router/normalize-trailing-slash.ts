export function normalizeTrailingSlash(
  path: string,
  requireSlash?: boolean
): string {
  if (path === '/') {
    return path
  } else if (path.endsWith('/')) {
    return requireSlash ? path : path.slice(0, -1)
  } else {
    return requireSlash ? path + '/' : path
  }
}
