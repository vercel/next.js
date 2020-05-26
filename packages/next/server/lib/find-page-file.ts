import { join, sep as pathSeparator, normalize } from 'path'
import chalk from 'next/dist/compiled/chalk'
import { isWriteable } from '../../build/is-writeable'
import { warn } from '../../build/output/log'
import fs from 'fs'
import { promisify } from 'util'

const readdir = promisify(fs.readdir)

async function isTrueCasePagePath(pagePath: string, pagesDir: string) {
  const pageSegments = normalize(pagePath).split(pathSeparator).filter(Boolean)

  const segmentExistsPromises = pageSegments.map(async (segment, i) => {
    const segmentParentDir = join(pagesDir, ...pageSegments.slice(0, i))
    const parentDirEntries = await readdir(segmentParentDir)
    return parentDirEntries.includes(segment)
  })

  return (await Promise.all(segmentExistsPromises)).every(Boolean)
}

export async function findPageFile(
  rootDir: string,
  normalizedPagePath: string,
  pageExtensions: string[]
): Promise<string | null> {
  let foundPagePaths: string[] = []

  for (const extension of pageExtensions) {
    const relativePagePath = `${normalizedPagePath}.${extension}`
    const pagePath = join(rootDir, relativePagePath)

    // only /index and /sub/index when /sub/index/index.js is allowed
    // see test/integration/route-indexes for expected index handling
    if (
      normalizedPagePath.startsWith('/index') ||
      !normalizedPagePath.endsWith('/index')
    ) {
      if (await isWriteable(pagePath)) {
        foundPagePaths.push(relativePagePath)
      }
    }

    const relativePagePathWithIndex = join(
      normalizedPagePath,
      `index.${extension}`
    )
    const pagePathWithIndex = join(rootDir, relativePagePathWithIndex)
    if (await isWriteable(pagePathWithIndex)) {
      foundPagePaths.push(relativePagePathWithIndex)
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
