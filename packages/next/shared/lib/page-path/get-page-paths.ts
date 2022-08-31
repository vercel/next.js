import { denormalizePagePath } from './denormalize-page-path'
import { flatten } from '../flatten'
import { join } from '../isomorphic/path'

/**
 * Calculate all possible pagePaths for a given normalized pagePath along with
 * allowed extensions. This can be used to check which one of the files exists
 * and to debug inspected locations.
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

  return flatten(
    extensions.map((extension) => {
      const appPage = join(page, `page.${extension}`)
      const folderIndexPage = join(page, `index.${extension}`)

      if (!normalizedPagePath.endsWith('/index')) {
        return isAppDir ? [appPage] : [`${page}.${extension}`, folderIndexPage]
      }
      return [isAppDir ? appPage : folderIndexPage]
    })
  )
}
