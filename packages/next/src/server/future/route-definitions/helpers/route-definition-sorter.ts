import type { RouteDefinition } from '../route-definition'

import path from 'path'

/**
 * Sorts route definitions by pathname, then by page then by filename.
 */
export function routeDefinitionSorter<
  D extends Pick<RouteDefinition, 'page' | 'pathname' | 'filename'>
>(left: D, right: D, pageExtensions: ReadonlyArray<string>) {
  if (left.pathname !== right.pathname) {
    return left.pathname.localeCompare(right.pathname)
  }

  if (left.page !== right.page) {
    return left.page.localeCompare(right.page)
  }

  // Ensure that we use the order of the extensions as the order of the files if
  // the pages are the same besides the extension.
  const extension = {
    left: path.extname(left.filename),
    right: path.extname(right.filename),
  }

  const basename = {
    left: path.basename(left.filename, extension.left),
    right: path.basename(right.filename, extension.right),
  }

  if (basename.left !== basename.right) {
    return basename.left.localeCompare(basename.right)
  }

  const indexes = {
    left: pageExtensions.indexOf(extension.left.slice(1)),
    right: pageExtensions.indexOf(extension.right.slice(1)),
  }

  if (indexes.left !== indexes.right) {
    return indexes.left - indexes.right
  }

  return extension.left.localeCompare(extension.right)
}
