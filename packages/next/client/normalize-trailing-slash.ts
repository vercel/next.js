import { UrlObject } from 'url'

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
const normalizePathTrailingSlash = process.env.__NEXT_TRAILING_SLASH
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

/**
 * Normalizes the trailing slash of the path of a parsed url. Non-destructive.
 */
export function normalizeTrailingSlash(url: URL): URL
export function normalizeTrailingSlash(url: UrlObject): UrlObject
export function normalizeTrailingSlash(url: UrlObject | URL): UrlObject | URL {
  const normalizedPath =
    url.pathname && normalizePathTrailingSlash(url.pathname)
  return url.pathname === normalizedPath
    ? url
    : url instanceof URL
    ? Object.assign(new URL(url.href), { pathname: normalizedPath })
    : Object.assign({}, url, { pathname: normalizedPath })
}
