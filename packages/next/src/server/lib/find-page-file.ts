import { fileExists } from '../../lib/file-exists'
import { getPagePaths } from '../../shared/lib/page-path/get-page-paths'
import { nonNullable } from '../../lib/non-nullable'
import { join, sep, normalize } from 'path'
import { promises } from 'fs'
import { warn } from '../../build/output/log'
import chalk from '../../lib/chalk'

async function isTrueCasePagePath(pagePath: string, pagesDir: string) {
  const pageSegments = normalize(pagePath).split(sep).filter(Boolean)
  const segmentExistsPromises = pageSegments.map(async (segment, i) => {
    const segmentParentDir = join(pagesDir, ...pageSegments.slice(0, i))
    const parentDirEntries = await promises.readdir(segmentParentDir)
    return parentDirEntries.includes(segment)
  })

  return (await Promise.all(segmentExistsPromises)).every(Boolean)
}

/**
 * Finds a page file with the given parameters. If the page is duplicated with
 * multiple extensions it will throw, otherwise it will return the *relative*
 * path to the page file or null if it is not found.
 *
 * @param pagesDir Absolute path to the pages folder with trailing `/pages`.
 * @param normalizedPagePath The page normalized (it will be denormalized).
 * @param pageExtensions Array of page extensions.
 */
export async function findPageFile(
  pagesDir: string,
  normalizedPagePath: string,
  pageExtensions: string[],
  isAppDir: boolean
): Promise<string | null> {
  const pagePaths = getPagePaths(normalizedPagePath, pageExtensions, isAppDir)
  const [existingPath, ...others] = (
    await Promise.all(
      pagePaths.map(async (path) => {
        const filePath = join(pagesDir, path)
        try {
          return (await fileExists(filePath)) ? path : null
        } catch (err: any) {
          if (!err?.code?.includes('ENOTDIR')) throw err
        }
        return null
      })
    )
  ).filter(nonNullable)

  if (!existingPath) {
    return null
  }

  if (!(await isTrueCasePagePath(existingPath, pagesDir))) {
    return null
  }

  if (others.length > 0) {
    warn(
      `Duplicate page detected. ${chalk.cyan(
        join('pages', existingPath)
      )} and ${chalk.cyan(
        join('pages', others[0])
      )} both resolve to ${chalk.cyan(normalizedPagePath)}.`
    )
  }

  return existingPath
}

/**
 *
 * createValidFileMatcher receives configured page extensions and return helpers to determine:
 * `isLayoutsLeafPage`: if a file is a valid page file or routes file under app directory
 * `isTrackedFiles`: if it's a tracked file for webpack watcher
 *
 */
export function createValidFileMatcher(
  pageExtensions: string[],
  appDirPath: string | undefined
) {
  const validExtensionFileRegex = new RegExp(
    `\\.+(?:${pageExtensions.join('|')})$`
  )
  const leafOnlyPageFileRegex = new RegExp(
    `(^(page|route)|[\\\\/](page|route))\\.(?:${pageExtensions.join('|')})$`
  )
  // TODO: support other metadata routes
  // regex for /robots.txt|((j|t)sx?)
  // regex for /sitemap.xml|((j|t)sx?)
  const metadataRoutesRelativePathRegex = new RegExp(
    `^[\\\\/]robots\\.(?:${pageExtensions.concat('txt').join('|')})$` +
      '|' +
      `^[\\\\/]sitemap\\.(?:${pageExtensions.concat('xml').join('|')})$` +
      '|' +
      `^[\\\\/]favicon\\.ico$`
  )

  function isMetadataRouteFile(filePath: string) {
    if (!appDirPath) return false
    const relativePath = filePath.replace(appDirPath, '')
    // console.log('isMetadataRouteFile', filePath, relativePath, metadataRoutesRelativePathRegex.test(relativePath))
    return metadataRoutesRelativePathRegex.test(relativePath)
  }

  // Determine if the file is leaf node page file or route file under layouts,
  // 'page.<extension>' | 'route.<extension>'
  function isAppRouterPage(filePath: string) {
    return leafOnlyPageFileRegex.test(filePath) || isMetadataRouteFile(filePath)
  }

  function isPageFile(filePath: string) {
    return (
      validExtensionFileRegex.test(filePath) || isMetadataRouteFile(filePath)
    )
  }

  return {
    isPageFile,
    isAppRouterPage,
    isMetadataRouteFile,
  }
}
