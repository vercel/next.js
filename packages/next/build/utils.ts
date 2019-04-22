import crypto from 'crypto'
import findUp from 'find-up'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

import { recursiveReadDir } from '../lib/recursive-readdir'

const fsExists = promisify(fs.exists)
const fsReadFile = promisify(fs.readFile)

export function collectPages(
  directory: string,
  pageExtensions: string[]
): Promise<string[]> {
  return recursiveReadDir(
    directory,
    new RegExp(`\\.(?:${pageExtensions.join('|')})$`)
  )
}

export function printTreeView(list: string[]) {
  list
    .sort((a, b) => (a > b ? 1 : -1))
    .forEach((item, i) => {
      const corner =
        i === 0
          ? list.length === 1
            ? '─'
            : '┌'
          : i === list.length - 1
          ? '└'
          : '├'
      console.log(` \x1b[90m${corner}\x1b[39m ${item}`)
    })

  console.log()
}

function flatten<T>(arr: T[][]): T[] {
  return arr.reduce((acc, val) => acc.concat(val), [] as T[])
}

function getPossibleFiles(pageExtensions: string[], pages: string[]) {
  const res = pages.map(page =>
    pageExtensions
      .map(e => `${page}.${e}`)
      .concat(pageExtensions.map(e => `${path.join(page, 'index')}.${e}`))
      .concat(page)
  )
  return flatten<string>(res)
}

export async function getFileForPage({
  page,
  pagesDirectory,
  pageExtensions,
}: {
  page: string
  pagesDirectory: string
  pageExtensions: string[]
}) {
  const theFile = getPossibleFiles(pageExtensions, [
    path.join(pagesDirectory, page),
  ]).find(f => fs.existsSync(f) && fs.lstatSync(f).isFile())
  if (theFile) {
    return path.sep + path.relative(pagesDirectory, theFile)
  }
  return theFile
}

export async function getSpecifiedPages(
  dir: string,
  pagesString: string,
  pageExtensions: string[]
) {
  const pagesDir = path.join(dir, 'pages')

  const reservedPages = ['/_app', '/_document', '/_error']

  const explodedPages = [
    ...new Set([...pagesString.split(','), ...reservedPages]),
  ].map(p => {
    let resolvedPage: string | undefined
    if (path.isAbsolute(p)) {
      resolvedPage = getPossibleFiles(pageExtensions, [
        path.join(pagesDir, p),
        p,
      ]).find(f => fs.existsSync(f) && fs.lstatSync(f).isFile())
    } else {
      resolvedPage = getPossibleFiles(pageExtensions, [
        path.join(pagesDir, p),
        path.join(dir, p),
      ]).find(f => fs.existsSync(f) && fs.lstatSync(f).isFile())
    }
    return { original: p, resolved: resolvedPage || null }
  })

  const missingPage = explodedPages.find(
    ({ original, resolved }) => !resolved && !reservedPages.includes(original)
  )
  if (missingPage) {
    throw new Error(`Unable to identify page: ${missingPage.original}`)
  }

  const resolvedPagePaths = explodedPages
    .filter(page => page.resolved)
    .map(page => '/' + path.relative(pagesDir, page.resolved!))
  return resolvedPagePaths.sort()
}

export async function getCacheIdentifier({
  pagesDirectory,
  env = {},
}: {
  pagesDirectory: string
  env?: any
}) {
  let selectivePageBuildingCacheIdentifier = ''

  const envObject = env
    ? Object.keys(env)
        .sort()
        // eslint-disable-next-line
        .reduce((a, c) => ((a[c] = env[c]), a), {} as any)
    : {}

  selectivePageBuildingCacheIdentifier += JSON.stringify(envObject)

  const pkgPath = await findUp('package.json', { cwd: pagesDirectory })
  if (pkgPath) {
    const yarnLock = path.join(path.dirname(pkgPath), 'yarn.lock')
    const packageLock = path.join(path.dirname(pkgPath), 'package-lock.json')

    if (await fsExists(yarnLock)) {
      selectivePageBuildingCacheIdentifier += await fsReadFile(yarnLock, 'utf8')
    } else if (await fsExists(packageLock)) {
      selectivePageBuildingCacheIdentifier += await fsReadFile(
        packageLock,
        'utf8'
      )
    } else {
      selectivePageBuildingCacheIdentifier += JSON.stringify(require(pkgPath))
    }
  }

  return crypto
    .createHash('sha1')
    .update(selectivePageBuildingCacheIdentifier)
    .digest('hex')
}
