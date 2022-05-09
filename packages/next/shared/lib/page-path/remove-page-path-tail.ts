import { normalizePathSep } from './normalize-path-sep'

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
export function removePagePathTail(
  pagePath: string,
  extensions: string[],
  stripIndex?: boolean
) {
  pagePath = normalizePathSep(pagePath).replace(
    new RegExp(`\\.+(?:${extensions.join('|')})$`),
    ''
  )

  if (stripIndex) {
    pagePath = pagePath.replace(/\/index$/, '') || '/'
  }

  return pagePath
}
