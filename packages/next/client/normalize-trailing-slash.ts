export function removeTrailingSlash(path: string): string {
  return path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path
}

export const normalizeTrailingSlash = process.env.__NEXT_TRAILING_SLASH
  ? (path: string): string => {
      if (/\.[^/]+\/?$/.test(path)) {
        return removeTrailingSlash(path)
      } else if (path.endsWith('/')) {
        return path
      } else {
        return path + '/'
      }
    }
  : removeTrailingSlash
