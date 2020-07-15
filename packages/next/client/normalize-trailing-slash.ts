/**
 * Removes the trailing slash of a path if there is one. Preserves the root path `/`.
 */
export function removePathTrailingSlash(path: string): string {
  return path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path
}

/**
 * Normalizes the trailing slash of a path according to the `trailingSlash` option
 * in `next.config.js`.
 */
export const normalizePathTrailingSlash = process.env.__NEXT_TRAILING_SLASH
  ? (path: string): string => {
      if (/\.[^/]+\/?$/.test(path)) {
        return removePathTrailingSlash(path)
      } else if (path.endsWith('/')) {
        return path
      } else {
        return path + '/'
      }
    }
  : removePathTrailingSlash
