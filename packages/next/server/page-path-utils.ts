import { isDynamicRoute } from '../shared/lib/router/utils'
import { join, posix } from '../shared/lib/isomorphic/path'
import { flatten } from '../shared/lib/flatten'

/**
 * For a given page path, this function ensures that there is a leading slash.
 * If there is not a leading slash, one is added, otherwise it is noop.
 */
export function ensureLeadingSlash(path: string) {
  return path.startsWith('/') ? path : `/${path}`
}

/**
 * For a given page path, this function ensures that there is no backslash
 * escaping slashes in the path. Example:
 *  - `foo\/bar\/baz` -> `foo/bar/baz`
 */
export function normalizePathSep(path: string): string {
  return path.replace(/\\/g, '/')
}

/**
 * Removes the file extension for a page and the trailing `index` if it exists
 * making sure to not return an empty string. The page head is not touched
 * and returned as it is passed. Examples:
 *   - `/foo/bar/baz/index.js` -> `/foo/bar/baz`
 *   - `/foo/bar/baz.js` -> `/foo/bar/baz`
 *
 * @param pagePath A page to a page file (absolute or relative)
 * @param extensions Extensions allowed for the page.
 */
export function removePagePathTail(pagePath: string, extensions: string[]) {
  return (
    normalizePathSep(pagePath)
      .replace(new RegExp(`\\.+(?:${extensions.join('|')})$`), '')
      .replace(/\/index$/, '') || '/'
  )
}

/**
 * Takes a page and transforms it into its file counterpart ensuring that the
 * output is normalized. Note this function is not idempotent because a page
 * `/index` can be referencing `/index/index.js` and `/index/index` could be
 * referencing `/index/index/index.js`. Examples:
 *  - `/` -> `/index`
 *  - `/index/foo` -> `/index/index/foo`
 *  - `/index` -> `/index/index`
 */
export function normalizePagePath(page: string): string {
  const normalized = ensureLeadingSlash(
    /^\/index(\/|$)/.test(page) && !isDynamicRoute(page)
      ? `/index${page}`
      : page === '/'
      ? '/index'
      : page
  )

  const resolvedPage = posix.normalize(normalized)
  if (resolvedPage !== normalized) {
    throw new Error(
      `Requested and resolved page mismatch: ${normalized} ${resolvedPage}`
    )
  }

  return normalized
}

/**
 * Performs the opposite transformation of `normalizePagePath`. Note that
 * this function is not idempotent either in cases where there are multiple
 * leading `/index` for the page. Examples:
 *  - `/index` -> `/`
 *  - `/index/foo` -> `/foo`
 *  - `/index/index` -> `/index`
 */
export function denormalizePagePath(page: string) {
  let _page = normalizePathSep(page)
  return _page.startsWith('/index/') && !isDynamicRoute(_page)
    ? _page.slice(6)
    : _page !== '/index'
    ? _page
    : '/'
}

/**
 * Calculate all possible pagePaths for a given normalized pagePath along with
 * allowed extensions. This can be used to check which one of the files exists
 * and to debug inspected locations.
 *
 * @param normalizedPagePath Normalized page path (it will denormalize).
 * @param extensions Allowed extensions.
 */
export function getPagePaths(normalizedPagePath: string, extensions: string[]) {
  const page = denormalizePagePath(normalizedPagePath)
  return flatten(
    extensions.map((extension) => {
      return !normalizedPagePath.endsWith('/index')
        ? [`${page}.${extension}`, join(page, `index.${extension}`)]
        : [join(page, `index.${extension}`)]
    })
  )
}
