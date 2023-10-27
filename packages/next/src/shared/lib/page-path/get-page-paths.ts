import { denormalizePagePath } from './denormalize-page-path'
import path from '../isomorphic/path'

/**
 * Calculate all possible pagePaths for a given normalized pagePath along with
 * allowed extensions. This can be used to check which one of the files exists
 * and to debug inspected locations.
 *
 * For pages, map `/route` to [`/route.[ext]`, `/route/index.[ext]`]
 * For app paths, map `/route/page` to [`/route/page.[ext]`] or `/route/route`
 * to [`/route/route.[ext]`]
 *
 * @param normalizedPagePath Normalized page path (it will denormalize).
 * @param extensions Allowed extensions.
 */
export function getPagePaths(
  normalizedPagePath: string,
  extensions: string[],
  isAppDir: boolean
) {
  const page = denormalizePagePath(normalizedPagePath)

  let prefixes: string[]
  if (isAppDir) {
    prefixes = [page]
  } else if (normalizedPagePath.endsWith('/index')) {
    prefixes = [path.join(page, 'index')]
  } else {
    prefixes = [page, path.join(page, 'index')]
  }

  const paths: string[] = []
  for (const extension of extensions) {
    for (const prefix of prefixes) {
      paths.push(`${prefix}.${extension}`)
    }
  }

  return paths
}
