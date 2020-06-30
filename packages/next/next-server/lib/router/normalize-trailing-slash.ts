export function normalizeTrailingSlash(
  path: string,
  requireSlash?: boolean
): string {
  if (requireSlash) {
    if (!path.endsWith('/') && !/\.[^/]+$/.test(path)) {
      return path + '/'
    } else if (/\.[^/]+\/$/.test(path)) {
      return path.slice(0, -1)
    } else {
      return path
    }
  } else {
    if (path.endsWith('/') && path !== '/') {
      return path.slice(0, -1)
    } else {
      return path
    }
  }
}
