import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { parsePath } from '../shared/lib/router/utils/parse-path'

/**
 * Normalizes the trailing slash of a path according to the `trailingSlash` option
 * in `next.config.js`.
 */
export const normalizePathTrailingSlash = (path: string) => {
  if (!path.startsWith('/') || process.env.__NEXT_MANUAL_TRAILING_SLASH) {
    return path
  }

  const { pathname, query, hash } = parsePath(path)
  if (process.env.__NEXT_TRAILING_SLASH) {
    if (/\.[^/]+\/?$/.test(pathname)) {
      return `${removeTrailingSlash(pathname)}${query}${hash}`
    } else if (pathname.endsWith('/')) {
      return `${pathname}${query}${hash}`
    } else {
      return `${pathname}/${query}${hash}`
    }
  }

  return `${removeTrailingSlash(pathname)}${query}${hash}`
}
