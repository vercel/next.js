import { fileExists } from '../../lib/file-exists'
import { getPagePaths } from '../../shared/lib/page-path/get-page-paths'
import { nonNullable } from '../../lib/non-nullable'
import { join, sep, normalize } from 'path'
import { promises as fsPromises } from 'fs'
import { warn } from '../../build/output/log'
import { cyan } from '../../lib/picocolors'
import { isMetadataRouteFile } from '../../lib/metadata/is-metadata-route'
import { escapeStringRegexp } from '../../shared/lib/escape-regexp'
import type { PageExtensions } from '../../build/page-extensions-type'

async function isTrueCasePagePath(pagePath: string, pagesDir: string) {
  const pageSegments = normalize(pagePath).split(sep).filter(Boolean)
  const segmentExistsPromises = pageSegments.map(async (segment, i) => {
    const segmentParentDir = join(pagesDir, ...pageSegments.slice(0, i))
    const parentDirEntries = await fsPromises.readdir(segmentParentDir)
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
  pageExtensions: PageExtensions,
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
      `Duplicate page detected. ${cyan(join('pages', existingPath))} and ${cyan(
        join('pages', others[0])
      )} both resolve to ${cyan(normalizedPagePath)}.`
    )
  }

  return existingPath
}

/**
 *
 * createValidFileMatcher receives configured page extensions and return helpers to determine:
 * `isLayoutsLeafPage`: if a file is a valid page file or routes file under app directory
 * `isTrackedFiles`: if it's a tracked file for our file watcher
 *
 */
export function createValidFileMatcher(
  pageExtensions: PageExtensions,
  appDirPath: string | undefined
) {
  // Helper to create extension regex pattern
  const extPattern = `(?:${pageExtensions
    .map((extension) => escapeStringRegexp(extension))
    .join('|')})`

  // Pattern factory for "leaf" files that can appear at start of path or after separator
  // e.g., 'page.tsx', '/path/page.tsx', '\\path\\route.js'
  const createLeafPattern = (fileNames: string[]): RegExp => {
    const names =
      fileNames.length === 1 ? fileNames[0] : `(${fileNames.join('|')})`
    return new RegExp(`(^${names}|[\\\\/]${names})\\.${extPattern}$`)
  }

  // Pattern factory for root-only files (no path separator allowed)
  const createRootOnlyPattern = (fileName: string): RegExp =>
    new RegExp(`^${fileName}\\.${extPattern}$`)

  // All file matching patterns
  const validExtensionFileRegex = new RegExp(`\\.${extPattern}$`)
  const leafOnlyPageFileRegex = createLeafPattern(['page', 'route'])
  const leafOnlyRouteFileRegex = createLeafPattern(['route'])
  const leafOnlyLayoutFileRegex = createLeafPattern(['layout'])
  const leafOnlyDefaultFileRegex = createLeafPattern(['default'])
  const rootNotFoundFileRegex = createRootOnlyPattern('not-found')
  /** TODO-METADATA: support other metadata routes
   *  regex for:
   *
   * /robots.txt|<ext>
   * /sitemap.xml|<ext>
   * /favicon.ico
   * /manifest.json|<ext>
   * <route>/icon.png|jpg|<ext>
   * <route>/apple-touch-icon.png|jpg|<ext>
   *
   */

  /**
   * Match the file if it's a metadata route file, static: if the file is a static metadata file.
   * It needs to be a file which doesn't match the custom metadata routes e.g. `app/robots.txt/route.js`
   */
  function isMetadataFile(filePath: string) {
    const appDirRelativePath = appDirPath
      ? filePath.replace(appDirPath, '')
      : filePath

    return isMetadataRouteFile(appDirRelativePath, pageExtensions, true)
  }

  // Determine if the file is leaf node page file or route file under layouts,
  // 'page.<extension>' | 'route.<extension>'
  function isAppRouterPage(filePath: string) {
    return leafOnlyPageFileRegex.test(filePath) || isMetadataFile(filePath)
  }

  // Determine if the file is leaf node route file under app directory
  function isAppRouterRoute(filePath: string) {
    return leafOnlyRouteFileRegex.test(filePath)
  }

  function isAppLayoutPage(filePath: string) {
    return leafOnlyLayoutFileRegex.test(filePath)
  }

  function isAppDefaultPage(filePath: string) {
    return leafOnlyDefaultFileRegex.test(filePath)
  }

  function isPageFile(filePath: string) {
    return validExtensionFileRegex.test(filePath) || isMetadataFile(filePath)
  }

  function isRootNotFound(filePath: string) {
    if (!appDirPath) {
      return false
    }
    if (!filePath.startsWith(appDirPath + sep)) {
      return false
    }
    const rest = filePath.slice(appDirPath.length + 1)
    return rootNotFoundFileRegex.test(rest)
  }

  return {
    isPageFile,
    isAppRouterPage,
    isAppRouterRoute,
    isAppLayoutPage,
    isAppDefaultPage,
    isMetadataFile,
    isRootNotFound,
  }
}
