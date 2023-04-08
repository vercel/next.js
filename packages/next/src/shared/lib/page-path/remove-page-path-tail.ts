import { normalizePathSep } from './normalize-path-sep'

/**
 * Removes the file extension for a page and the trailing `index` if it exists
 * making sure to not return an empty string. The page head is not touched
 * and returned as it is passed. Examples:
 *   - `/foo/bar/baz/index.js` -> `/foo/bar/baz`
 *   - `/foo/bar/baz.js` -> `/foo/bar/baz`
 *
 * @param pagePath A page to a page file (absolute or relative)
 * @param options.extensions Extensions allowed for the page.
 * @param options.keepIndex When true the trailing `index` is _not_ removed.
 */
export function removePagePathTail(
  pagePath: string,
  options: {
    extensions: ReadonlyArray<string>
    keepIndex?: boolean
  }
) {
  pagePath = normalizePathSep(pagePath).replace(
    new RegExp(`\\.+(?:${options.extensions.join('|')})$`),
    ''
  )

  if (options.keepIndex !== true) {
    pagePath = pagePath.replace(/\/index$/, '') || '/'
  }

  return pagePath
}
