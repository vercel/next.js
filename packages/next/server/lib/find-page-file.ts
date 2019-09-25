import { join } from 'path'
import chalk from 'chalk'
import { isWriteable } from '../../build/is-writeable'
import { warn } from '../../build/output/log'
const { trueCasePath } = require('true-case-path')

async function isTrueCasePagePath(pagePath: string, pagesDir: string) {
  try {
    const fullPagePath = join(pagesDir, pagePath)
    const truePagePath = await trueCasePath(fullPagePath)
    return fullPagePath === truePagePath
  } catch (err) {
    return false
  }
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

    if (await isWriteable(pagePath)) {
      foundPagePaths.push(relativePagePath)
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

  if (foundPagePaths.length > 1) {
    warn(
      `Duplicate page detected. ${chalk.cyan(
        join('pages', foundPagePaths[0])
      )} and ${chalk.cyan(
        join('pages', foundPagePaths[1])
      )} both resolve to ${chalk.cyan(normalizedPagePath)}.`
    )
  }

  if (!(await isTrueCasePagePath(foundPagePaths[0], rootDir))) {
    return null
  }

  return foundPagePaths[0]
}
