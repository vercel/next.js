import { RouteDefinition } from '../route-definition'

/**
 * Sorts route definitions by pathname, then by page, then by bundle path, then
 * by filename.
 */
export function routeDefinitionSorter<D extends RouteDefinition>(
  left: D,
  right: D
) {
  if (left.pathname !== right.pathname) {
    return left.pathname.localeCompare(right.pathname)
  }

  if (left.page !== right.page) {
    return left.page.localeCompare(right.page)
  }

  if (left.bundlePath !== right.bundlePath) {
    return left.bundlePath.localeCompare(right.bundlePath)
  }

  return left.filename.localeCompare(right.filename)
}
