import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'

/**
 * Normalizes the trailing slash of a path according to the `trailingSlash` option
 * in `next.config.js`.
 */
export const normalizePathTrailingSlash = process.env.__NEXT_TRAILING_SLASH
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
