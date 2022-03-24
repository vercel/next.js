import { join, sep as pathSeparator, normalize } from 'path'
import chalk from '../../lib/chalk'
import { warn } from '../../build/output/log'
import { promises } from 'fs'
import { denormalizePagePath } from '../normalize-page-path'
import { fileExists } from '../../lib/file-exists'

async function isTrueCasePagePath(pagePath: string, pagesDir: string) {
  const pageSegments = normalize(pagePath).split(pathSeparator).filter(Boolean)

  const segmentExistsPromises = pageSegments.map(async (segment, i) => {
    const segmentParentDir = join(pagesDir, ...pageSegments.slice(0, i))
    const parentDirEntries = await promises.readdir(segmentParentDir)
    return parentDirEntries.includes(segment)
  })

  return (await Promise.all(segmentExistsPromises)).every(Boolean)
}

export async function findPageFile(
  rootDir: string,
  normalizedPagePath: string,
  pageExtensions: string[]
): Promise<string | null> {
  const foundPagePaths: string[] = []
  const isRootPaths = rootDir.replace(/\\/g, '/').endsWith('/root')
  const page = denormalizePagePath(normalizedPagePath)

  for (const extension of pageExtensions) {
    const pathsToCheck: string[] = []

    if (!normalizedPagePath.endsWith('/index') || isRootPaths) {
      pathsToCheck.push(`${page}.${extension}`)
    }

    pathsToCheck.push(join(page, `index.${extension}`))

    for (const pathToCheck of pathsToCheck) {
      const pagePathWithIndex = join(rootDir, pathToCheck)

      if (await fileExists(pagePathWithIndex)) {
        foundPagePaths.push(pathToCheck)
        // page.js and page/index.js is not a duplicate in root folder
        if (isRootPaths) break
      }
    }
  }

  if (foundPagePaths.length < 1) {
    return null
  }

  if (!(await isTrueCasePagePath(foundPagePaths[0], rootDir))) {
    return null
  }

  if (foundPagePaths.length > 1) {
    warn(
      `Duplicate page detected. ${chalk.cyan(
        join('pages', foundPagePaths[0])
      )} and ${chalk.cyan(
        join('pages', foundPagePaths[1])
      )} both resolve to ${chalk.cyan(normalizedPagePath)}.`
    )
  }

  return foundPagePaths[0]
}
