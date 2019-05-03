import crypto from 'crypto'
import findUp from 'find-up'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import prettyBytes from '../lib/pretty-bytes'
import { recursiveReadDir } from '../lib/recursive-readdir'

const fsStat = promisify(fs.stat)
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

interface ChunksItem {
  external: Set<string>,
  internal: Set<string>
}

interface PageInfo {
  ampOnly: boolean,
  serverSize: number,
  clientSize: number,
  chunks: ChunksItem
}

export function printTreeView(list: string[], pageInfos: Map<string, PageInfo>) {
  /*
    red for >250kb
    yellow for >100kb
    green for <100kb
  */
  const getSizeColor = (size: number): string => {
    if (size < 100 * 1000) return '\x1b[32m'
    if (size < 250 * 1000) return '\x1b[33m'
    return '\x1b[31m'
  }

  list
    .sort((a, b) => (a > b ? 1 : -1))
    .forEach((item, i) => {
      const info = pageInfos.get(item)
      let numExternal
      let numInternal
      let serverSize
      let clientSize
      let isAmp

      if (info) {
        isAmp = info.ampOnly
        serverSize = info.serverSize
        clientSize = info.clientSize

        if (info.chunks) {
          const { chunks } = info
          numExternal = chunks.external.size
          numInternal = chunks.internal.size
        }
      }

      const corner =
        i === 0
          ? list.length === 1
            ? '─'
            : '┌'
          : '├'

      console.log(` \x1b[90m${corner}\x1b[39m ${item}${isAmp ? ' (AMP)' : ''}`)

      if (typeof numExternal === 'number') {
        console.log(` \x1b[90m| \x1b[39mPackages: ${numExternal} Local modules: ${numInternal}`);
      }
      let sizes = ' \x1b[90m|'

      if (typeof serverSize === 'number') {
        sizes += getSizeColor(serverSize) +
          ` Server size: ${prettyBytes(serverSize)}`
      }
      if (typeof clientSize === 'number') {
        sizes += getSizeColor(clientSize) +
          ` Client size: ${prettyBytes(clientSize)}`
      }

      if (sizes) console.log(sizes)
      console.log(` \x1b[90m${i === list.length - 1 ? '└' : '|'}`);
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

export async function getPageInfo(
  page: string,
  distPath: string,
  buildId: string,
  dev: boolean,
  serverless?: boolean,
) {
  const info: any = {}
  const staticPath = dev ? 'development' : buildId
  const clientBundle = path.join(
    distPath, `static/${staticPath}/pages/`, `${page}.js`
  )
  const serverPath = serverless
    ? path.join(distPath, 'serverless/pages')
    : path.join(distPath, 'server/static', staticPath, 'pages')

  const serverBundle = path.join(serverPath, `${page}.js`)
  info.clientBundle = clientBundle

  if (!dev) {
    try {
      info.serverSize = (await fsStat(serverBundle)).size
    } catch (_) {}
    try {
      info.clientSize = (await fsStat(clientBundle)).size
    } catch (_) {}
  }

  if (page.match(/(_app|_error|_document)/)) return info

  return info
}
