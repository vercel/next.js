import { ensureLeadingSlash } from './ensure-leading-slash'
import { normalizePathSep } from './normalize-path-sep'
import path from '../isomorphic/path'
import { removePagePathTail } from './remove-page-path-tail'

/**
 * Given the absolute path to the pages folder, an absolute file path for a
 * page and the page extensions, this function will return the page path
 * relative to the pages folder. It doesn't consider index tail. Example:
 *  - `/Users/rick/my-project/pages/foo/bar/baz.js` -> `/foo/bar/baz`
 *
 * @param filepath Absolute path to the page.
 * @param opts.pagesDir Absolute path to the pages folder.
 * @param opts.extensions Extensions allowed for the page.
 * @param opts.keepIndex When true the trailing `index` kept in the path.
 */
export function absolutePathToPage(
  pagePath: string,
  options: {
    extensions: string[]
    keepIndex?: boolean
    pagesDir: string
  }
) {
  return removePagePathTail(
    normalizePathSep(
      ensureLeadingSlash(path.relative(options.pagesDir, pagePath))
    ),
    {
      extensions: options.extensions,
      keepIndex: options.keepIndex,
    }
  )
}
