import { join } from 'path'
import chalk from 'chalk'
import { isWriteable } from '../../build/is-writeable'
import { warn } from '../../build/output/log'

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

  return foundPagePaths[0]
}
