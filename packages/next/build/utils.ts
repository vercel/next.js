import chalk from 'chalk'
import fs from 'fs'
import textTable from 'next/dist/compiled/text-table'
import path from 'path'
import stripAnsi from 'strip-ansi'
import { promisify } from 'util'

import { isValidElementType } from 'react-is'
import prettyBytes from '../lib/pretty-bytes'
import { recursiveReadDir } from '../lib/recursive-readdir'
import { getPageChunks } from './webpack/plugins/chunk-graph-plugin'

const fsStatPromise = promisify(fs.stat)
const fileStats: { [k: string]: Promise<fs.Stats> } = {}
const fsStat = (file: string) => {
  if (fileStats[file]) return fileStats[file]

  fileStats[file] = fsStatPromise(file)

  return fileStats[file]
}

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
  pageInfos: Map<string, PageInfo>,
  serverless: boolean
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
        `${symbol} ${
          item.startsWith('/_')
            ? ' '
            : pageInfo && pageInfo.static
            ? chalk.bold('⚡')
            : serverless
            ? 'λ'
            : 'σ'
        } ${item}`,
        ...(pageInfo
          ? [
              pageInfo.isAmp
                ? chalk.cyan('AMP')
                : pageInfo.size >= 0
                ? getPrettySize(pageInfo.size)
                : '',
              pageInfo.chunks ? pageInfo.chunks.internal.size.toString() : '',
              pageInfo.chunks ? pageInfo.chunks.external.size.toString() : '',
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
  console.log(
    textTable(
      [
        serverless
          ? [
              'λ',
              '(Lambda)',
              `page was emitted as a lambda (i.e. ${chalk.cyan(
                'getInitialProps'
              )})`,
            ]
          : [
              'σ',
              '(Server)',
              `page will be server rendered (i.e. ${chalk.cyan(
                'getInitialProps'
              )})`,
            ],
        [
          chalk.bold('⚡'),
          '(Static File)',
          'page was prerendered as static HTML',
        ],
      ],
      {
        align: ['l', 'l', 'l'],
        stringLength: str => stripAnsi(str).length,
      }
    )
  )

  console.log()
}

export async function getPageSizeInKb(
  page: string,
  distPath: string,
  buildId: string,
  buildManifest: { pages: { [k: string]: string[] } },
  isModern: boolean
): Promise<number> {
  const clientBundle = path.join(
    distPath,
    `static/${buildId}/pages/`,
    `${page}${isModern ? '.module' : ''}.js`
  )

  // With granularChunks flag enabled, each page may have additional chunks that it depends on
  const baseDeps = page === '/_app' ? [] : buildManifest.pages['/_app']

  // Get the list of chunks specific to this page
  // With granularChunks: false, this will be []
  const deps = (buildManifest.pages[page] || [])
    .filter(
      dep => !baseDeps.includes(dep) && /\.module\.js$/.test(dep) === isModern
    )
    .map(dep => `${distPath}/${dep}`)

  // Add the main bundle for the page
  deps.push(clientBundle)

  try {
    let depStats = await Promise.all(deps.map(fsStat))

    return depStats.reduce((size, stat) => size + stat.size, 0)
  } catch (_) {}
  return -1
}

export function isPageStatic(
  serverBundle: string,
  runtimeEnvConfig: any
): { static?: boolean; prerender?: boolean; isHybridAmp?: boolean } {
  try {
    require('../next-server/lib/runtime-config').setConfig(runtimeEnvConfig)
    const mod = require(serverBundle)
    const Comp = mod.default || mod

    if (!Comp || !isValidElementType(Comp) || typeof Comp === 'string') {
      throw new Error('INVALID_DEFAULT_EXPORT')
    }
    const config = mod.config || {}

    return {
      static: typeof (Comp as any).getInitialProps !== 'function',
      prerender: config.experimentalPrerender === true,
      isHybridAmp: config.amp === 'hybrid',
    }
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') return {}
    throw err
  }
}

export function hasCustomAppGetInitialProps(
  _appBundle: string,
  runtimeEnvConfig: any
): boolean {
  require('../next-server/lib/runtime-config').setConfig(runtimeEnvConfig)
  let mod = require(_appBundle)

  if (_appBundle.endsWith('_app.js')) {
    mod = mod.default || mod
  } else {
    // since we don't output _app in serverless mode get it from a page
    mod = mod._app
  }
  return mod.getInitialProps !== mod.origGetInitialProps
}
