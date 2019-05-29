import chalk from 'chalk'
import crypto from 'crypto'
import findUp from 'find-up'
import fs from 'fs'
import textTable from 'next/dist/compiled/text-table'
import path from 'path'
import stripAnsi from 'strip-ansi'
import { promisify } from 'util'

import prettyBytes from '../lib/pretty-bytes'
import { recursiveReadDir } from '../lib/recursive-readdir'
import { getPageChunks } from './webpack/plugins/chunk-graph-plugin'

const fsStat = promisify(fs.stat)
const fsExists = promisify(fs.exists)
const fsReadFile = promisify(fs.readFile)
const nextEnvConfig = require('next-server/config')

export function collectPages(
  directory: string,
  pageExtensions: string[]
): Promise<string[]> {
  return recursiveReadDir(
    directory,
    new RegExp(`\\.(?:${pageExtensions.join('|')})$`)
  )
}

export interface PageInfo {
  isAmp?: boolean
  size: number
  chunks?: ReturnType<typeof getPageChunks>
  static?: boolean
  serverBundle: string
}

export function printTreeView(
  list: string[],
  pageInfos: Map<string, PageInfo>
) {
  const getPrettySize = (_size: number): string => {
    const size = prettyBytes(_size)
    // green for 0-100kb
    if (_size < 100 * 1000) return chalk.green(size)
    // yellow for 100-250kb
    if (_size < 250 * 1000) return chalk.yellow(size)
    // red for >= 250kb
    return chalk.red.bold(size)
  }

  const messages: string[][] = [
    ['Page', 'Size', 'Files', 'Packages'].map(entry => chalk.underline(entry)),
  ]

  list
    .sort((a, b) => a.localeCompare(b))
    .forEach((item, i) => {
      const symbol =
        i === 0
          ? list.length === 1
            ? '─'
            : '┌'
          : i === list.length - 1
          ? '└'
          : '├'

      const pageInfo = pageInfos.get(item)

      messages.push([
        `${symbol} ${item}`,
        ...(pageInfo
          ? [
              pageInfo.isAmp
                ? chalk.cyan('AMP')
                : pageInfo.size >= 0
                ? getPrettySize(pageInfo.size)
                : 'N/A',
              pageInfo.chunks
                ? pageInfo.chunks.internal.size.toString()
                : 'N/A',
              pageInfo.chunks
                ? pageInfo.chunks.external.size.toString()
                : 'N/A',
            ]
          : ['', '', '']),
      ])
    })

  console.log(
    textTable(messages, {
      align: ['l', 'l', 'r', 'r'],
      stringLength: str => stripAnsi(str).length,
    })
  )

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

export async function getPageSizeInKb(
  page: string,
  distPath: string,
  buildId: string
): Promise<number> {
  const clientBundle = path.join(
    distPath,
    `static/${buildId}/pages/`,
    `${page}.js`
  )
  try {
    return (await fsStat(clientBundle)).size
  } catch (_) {}
  return -1
}

export function isPageStatic(
  serverBundle: string,
  runtimeEnvConfig: any
): boolean {
  try {
    nextEnvConfig.setConfig(runtimeEnvConfig)
    const Comp = require(serverBundle).default
    if (!Comp) {
      const pageStartIdx = serverBundle.indexOf('pages/') + 5
      console.log(
        'not exporting invalid page',
        serverBundle.substr(pageStartIdx),
        '(no default export)'
      )
      return false
    }
    return typeof Comp.getInitialProps !== 'function'
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') return false
    throw err
  }
}

export function hasCustomAppGetInitialProps(
  _appBundle: string,
  runtimeEnvConfig: any
): boolean {
  nextEnvConfig.setConfig(runtimeEnvConfig)
  let mod = require(_appBundle)

  if (_appBundle.endsWith('_app.js')) {
    mod = mod.default
  } else {
    // since we don't output _app in serverless mode get it from a page
    mod = mod._app
  }
  return mod.getInitialProps !== mod.origGetInitialProps
}
