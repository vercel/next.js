import type {
  NextConfig,
  NextConfigComplete,
  ServerRuntime,
} from '../server/config-shared'
import type { webpack5 } from 'next/dist/compiled/webpack/webpack'

import '../server/node-polyfill-fetch'
import chalk from 'next/dist/compiled/chalk'
import getGzipSize from 'next/dist/compiled/gzip-size'
import textTable from 'next/dist/compiled/text-table'
import path from 'path'
import { promises as fs } from 'fs'
import { isValidElementType } from 'next/dist/compiled/react-is'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import {
  Redirect,
  Rewrite,
  Header,
  CustomRoutes,
} from '../lib/load-custom-routes'
import {
  SSG_GET_INITIAL_PROPS_CONFLICT,
  SERVER_PROPS_GET_INIT_PROPS_CONFLICT,
  SERVER_PROPS_SSG_CONFLICT,
  MIDDLEWARE_FILENAME,
  SERVER_RUNTIME,
} from '../lib/constants'
import { EDGE_RUNTIME_WEBPACK } from '../shared/lib/constants'
import prettyBytes from '../lib/pretty-bytes'
import { getRouteRegex } from '../shared/lib/router/utils/route-regex'
import { getRouteMatcher } from '../shared/lib/router/utils/route-matcher'
import { isDynamicRoute } from '../shared/lib/router/utils/is-dynamic'
import escapePathDelimiters from '../shared/lib/router/utils/escape-path-delimiters'
import { findPageFile } from '../server/lib/find-page-file'
import { GetStaticPaths, PageConfig } from 'next/types'
import { BuildManifest } from '../server/get-page-files'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { UnwrapPromise } from '../lib/coalesced-function'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import * as Log from './output/log'
import { loadComponents } from '../server/load-components'
import { trace } from '../trace'
import { setHttpAgentOptions } from '../server/config'
import { recursiveDelete } from '../lib/recursive-delete'
import { Sema } from 'next/dist/compiled/async-sema'
import { MiddlewareManifest } from './webpack/plugins/middleware-plugin'
import { denormalizePagePath } from '../shared/lib/page-path/denormalize-page-path'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { getPageStaticInfo } from './analysis/get-page-static-info'

const { builtinModules } = require('module')
const RESERVED_PAGE = /^\/(_app|_error|_document|api(\/|$))/
const fileGzipStats: { [k: string]: Promise<number> | undefined } = {}
const fsStatGzip = (file: string) => {
  const cached = fileGzipStats[file]
  if (cached) return cached
  return (fileGzipStats[file] = getGzipSize.file(file))
}

const fileSize = async (file: string) => (await fs.stat(file)).size

const fileStats: { [k: string]: Promise<number> | undefined } = {}
const fsStat = (file: string) => {
  const cached = fileStats[file]
  if (cached) return cached
  return (fileStats[file] = fileSize(file))
}

export interface PageInfo {
  isHybridAmp?: boolean
  size: number
  totalSize: number
  static: boolean
  isSsg: boolean
  ssgPageRoutes: string[] | null
  initialRevalidateSeconds: number | false
  pageDuration: number | undefined
  ssgPageDurations: number[] | undefined
  runtime: ServerRuntime
}

export async function printTreeView(
  list: readonly string[],
  pageInfos: Map<string, PageInfo>,
  serverless: boolean,
  {
    distPath,
    buildId,
    pagesDir,
    pageExtensions,
    buildManifest,
    middlewareManifest,
    useStatic404,
    gzipSize = true,
  }: {
    distPath: string
    buildId: string
    pagesDir: string
    pageExtensions: string[]
    buildManifest: BuildManifest
    middlewareManifest: MiddlewareManifest
    useStatic404: boolean
    gzipSize?: boolean
  }
) {
  const getPrettySize = (_size: number): string => {
    const size = prettyBytes(_size)
    // green for 0-130kb
    if (_size < 130 * 1000) return chalk.green(size)
    // yellow for 130-170kb
    if (_size < 170 * 1000) return chalk.yellow(size)
    // red for >= 170kb
    return chalk.red.bold(size)
  }

  const MIN_DURATION = 300
  const getPrettyDuration = (_duration: number): string => {
    const duration = `${_duration} ms`
    // green for 300-1000ms
    if (_duration < 1000) return chalk.green(duration)
    // yellow for 1000-2000ms
    if (_duration < 2000) return chalk.yellow(duration)
    // red for >= 2000ms
    return chalk.red.bold(duration)
  }

  const getCleanName = (fileName: string) =>
    fileName
      // Trim off `static/`
      .replace(/^static\//, '')
      // Re-add `static/` for root files
      .replace(/^<buildId>/, 'static')
      // Remove file hash
      .replace(/(?:^|[.-])([0-9a-z]{6})[0-9a-z]{14}(?=\.)/, '.$1')

  const messages: [string, string, string][] = [
    ['Page', 'Size', 'First Load JS'].map((entry) =>
      chalk.underline(entry)
    ) as [string, string, string],
  ]

  const hasCustomApp = await findPageFile(pagesDir, '/_app', pageExtensions)
  pageInfos.set('/404', {
    ...(pageInfos.get('/404') || pageInfos.get('/_error')),
    static: useStatic404,
  } as any)

  if (!list.includes('/404')) {
    list = [...list, '/404']
  }

  const sizeData = await computeFromManifest(
    buildManifest,
    distPath,
    gzipSize,
    pageInfos
  )

  const usedSymbols = new Set()

  const pageList = list
    .slice()
    .filter(
      (e) =>
        !(
          e === '/_document' ||
          e === '/_error' ||
          (!hasCustomApp && e === '/_app')
        )
    )
    .sort((a, b) => a.localeCompare(b))

  pageList.forEach((item, i, arr) => {
    const border =
      i === 0
        ? arr.length === 1
          ? '─'
          : '┌'
        : i === arr.length - 1
        ? '└'
        : '├'

    const pageInfo = pageInfos.get(item)
    const ampFirst = buildManifest.ampFirstPages.includes(item)
    const totalDuration =
      (pageInfo?.pageDuration || 0) +
      (pageInfo?.ssgPageDurations?.reduce((a, b) => a + (b || 0), 0) || 0)

    const symbol =
      item === '/_app' || item === '/_app.server'
        ? ' '
        : pageInfo?.static
        ? '○'
        : pageInfo?.isSsg
        ? '●'
        : pageInfo?.runtime === SERVER_RUNTIME.edge
        ? 'ℇ'
        : 'λ'

    usedSymbols.add(symbol)

    if (pageInfo?.initialRevalidateSeconds) usedSymbols.add('ISR')

    messages.push([
      `${border} ${symbol} ${
        pageInfo?.initialRevalidateSeconds
          ? `${item} (ISR: ${pageInfo?.initialRevalidateSeconds} Seconds)`
          : item
      }${
        totalDuration > MIN_DURATION
          ? ` (${getPrettyDuration(totalDuration)})`
          : ''
      }`,
      pageInfo
        ? ampFirst
          ? chalk.cyan('AMP')
          : pageInfo.size >= 0
          ? prettyBytes(pageInfo.size)
          : ''
        : '',
      pageInfo
        ? ampFirst
          ? chalk.cyan('AMP')
          : pageInfo.size >= 0
          ? getPrettySize(pageInfo.totalSize)
          : ''
        : '',
    ])

    const uniqueCssFiles =
      buildManifest.pages[item]?.filter(
        (file) => file.endsWith('.css') && sizeData.uniqueFiles.includes(file)
      ) || []

    if (uniqueCssFiles.length > 0) {
      const contSymbol = i === arr.length - 1 ? ' ' : '├'

      uniqueCssFiles.forEach((file, index, { length }) => {
        const innerSymbol = index === length - 1 ? '└' : '├'
        messages.push([
          `${contSymbol}   ${innerSymbol} ${getCleanName(file)}`,
          prettyBytes(sizeData.sizeUniqueFiles[file]),
          '',
        ])
      })
    }

    if (pageInfo?.ssgPageRoutes?.length) {
      const totalRoutes = pageInfo.ssgPageRoutes.length
      const contSymbol = i === arr.length - 1 ? ' ' : '├'

      let routes: { route: string; duration: number; avgDuration?: number }[]
      if (
        pageInfo.ssgPageDurations &&
        pageInfo.ssgPageDurations.some((d) => d > MIN_DURATION)
      ) {
        const previewPages = totalRoutes === 8 ? 8 : Math.min(totalRoutes, 7)
        const routesWithDuration = pageInfo.ssgPageRoutes
          .map((route, idx) => ({
            route,
            duration: pageInfo.ssgPageDurations![idx] || 0,
          }))
          .sort(({ duration: a }, { duration: b }) =>
            // Sort by duration
            // keep too small durations in original order at the end
            a <= MIN_DURATION && b <= MIN_DURATION ? 0 : b - a
          )
        routes = routesWithDuration.slice(0, previewPages)
        const remainingRoutes = routesWithDuration.slice(previewPages)
        if (remainingRoutes.length) {
          const remaining = remainingRoutes.length
          const avgDuration = Math.round(
            remainingRoutes.reduce(
              (total, { duration }) => total + duration,
              0
            ) / remainingRoutes.length
          )
          routes.push({
            route: `[+${remaining} more paths]`,
            duration: 0,
            avgDuration,
          })
        }
      } else {
        const previewPages = totalRoutes === 4 ? 4 : Math.min(totalRoutes, 3)
        routes = pageInfo.ssgPageRoutes
          .slice(0, previewPages)
          .map((route) => ({ route, duration: 0 }))
        if (totalRoutes > previewPages) {
          const remaining = totalRoutes - previewPages
          routes.push({ route: `[+${remaining} more paths]`, duration: 0 })
        }
      }

      routes.forEach(({ route, duration, avgDuration }, index, { length }) => {
        const innerSymbol = index === length - 1 ? '└' : '├'
        messages.push([
          `${contSymbol}   ${innerSymbol} ${route}${
            duration > MIN_DURATION ? ` (${getPrettyDuration(duration)})` : ''
          }${
            avgDuration && avgDuration > MIN_DURATION
              ? ` (avg ${getPrettyDuration(avgDuration)})`
              : ''
          }`,
          '',
          '',
        ])
      })
    }
  })

  const sharedFilesSize = sizeData.sizeCommonFiles
  const sharedFiles = sizeData.sizeCommonFile

  messages.push([
    '+ First Load JS shared by all',
    getPrettySize(sharedFilesSize),
    '',
  ])
  const sharedFileKeys = Object.keys(sharedFiles)
  const sharedCssFiles: string[] = []
  ;[
    ...sharedFileKeys
      .filter((file) => {
        if (file.endsWith('.css')) {
          sharedCssFiles.push(file)
          return false
        }
        return true
      })
      .map((e) => e.replace(buildId, '<buildId>'))
      .sort(),
    ...sharedCssFiles.map((e) => e.replace(buildId, '<buildId>')).sort(),
  ].forEach((fileName, index, { length }) => {
    const innerSymbol = index === length - 1 ? '└' : '├'

    const originalName = fileName.replace('<buildId>', buildId)
    const cleanName = getCleanName(fileName)

    messages.push([
      `  ${innerSymbol} ${cleanName}`,
      prettyBytes(sharedFiles[originalName]),
      '',
    ])
  })

  const middlewareInfo = middlewareManifest.middleware?.['/']
  if (middlewareInfo?.files.length > 0) {
    const sizes = await Promise.all(
      middlewareInfo.files
        .map((dep) => `${distPath}/${dep}`)
        .map(gzipSize ? fsStatGzip : fsStat)
    )

    messages.push(['', '', ''])
    messages.push(['ƒ Middleware', getPrettySize(sum(sizes)), ''])
  }

  console.log(
    textTable(messages, {
      align: ['l', 'l', 'r'],
      stringLength: (str) => stripAnsi(str).length,
    })
  )

  console.log()
  console.log(
    textTable(
      [
        usedSymbols.has('ℇ') && [
          'ℇ',
          '(Streaming)',
          `server-side renders with streaming (uses React 18 SSR streaming or Server Components)`,
        ],
        usedSymbols.has('λ') && [
          'λ',
          serverless ? '(Lambda)' : '(Server)',
          `server-side renders at runtime (uses ${chalk.cyan(
            'getInitialProps'
          )} or ${chalk.cyan('getServerSideProps')})`,
        ],
        usedSymbols.has('○') && [
          '○',
          '(Static)',
          'automatically rendered as static HTML (uses no initial props)',
        ],
        usedSymbols.has('●') && [
          '●',
          '(SSG)',
          `automatically generated as static HTML + JSON (uses ${chalk.cyan(
            'getStaticProps'
          )})`,
        ],
        usedSymbols.has('ISR') && [
          '',
          '(ISR)',
          `incremental static regeneration (uses revalidate in ${chalk.cyan(
            'getStaticProps'
          )})`,
        ],
      ].filter((x) => x) as [string, string, string][],
      {
        align: ['l', 'l', 'l'],
        stringLength: (str) => stripAnsi(str).length,
      }
    )
  )

  console.log()
}

export function printCustomRoutes({
  redirects,
  rewrites,
  headers,
}: CustomRoutes) {
  const printRoutes = (
    routes: Redirect[] | Rewrite[] | Header[],
    type: 'Redirects' | 'Rewrites' | 'Headers'
  ) => {
    const isRedirects = type === 'Redirects'
    const isHeaders = type === 'Headers'
    console.log(chalk.underline(type))
    console.log()

    /*
        ┌ source
        ├ permanent/statusCode
        └ destination
     */
    const routesStr = (routes as any[])
      .map((route: { source: string }) => {
        let routeStr = `┌ source: ${route.source}\n`

        if (!isHeaders) {
          const r = route as Rewrite
          routeStr += `${isRedirects ? '├' : '└'} destination: ${
            r.destination
          }\n`
        }
        if (isRedirects) {
          const r = route as Redirect
          routeStr += `└ ${
            r.statusCode
              ? `status: ${r.statusCode}`
              : `permanent: ${r.permanent}`
          }\n`
        }

        if (isHeaders) {
          const r = route as Header
          routeStr += `└ headers:\n`

          for (let i = 0; i < r.headers.length; i++) {
            const header = r.headers[i]
            const last = i === headers.length - 1

            routeStr += `  ${last ? '└' : '├'} ${header.key}: ${header.value}\n`
          }
        }

        return routeStr
      })
      .join('\n')

    console.log(routesStr, '\n')
  }

  if (redirects.length) {
    printRoutes(redirects, 'Redirects')
  }
  if (headers.length) {
    printRoutes(headers, 'Headers')
  }

  const combinedRewrites = [
    ...rewrites.beforeFiles,
    ...rewrites.afterFiles,
    ...rewrites.fallback,
  ]
  if (combinedRewrites.length) {
    printRoutes(combinedRewrites, 'Rewrites')
  }
}

type ComputeManifestShape = {
  commonFiles: string[]
  uniqueFiles: string[]
  sizeUniqueFiles: { [file: string]: number }
  sizeCommonFile: { [file: string]: number }
  sizeCommonFiles: number
}

let cachedBuildManifest: BuildManifest | undefined

let lastCompute: ComputeManifestShape | undefined
let lastComputePageInfo: boolean | undefined

export async function computeFromManifest(
  manifest: BuildManifest,
  distPath: string,
  gzipSize: boolean = true,
  pageInfos?: Map<string, PageInfo>
): Promise<ComputeManifestShape> {
  if (
    Object.is(cachedBuildManifest, manifest) &&
    lastComputePageInfo === !!pageInfos
  ) {
    return lastCompute!
  }

  let expected = 0
  const files = new Map<string, number>()
  Object.keys(manifest.pages).forEach((key) => {
    if (pageInfos) {
      const pageInfo = pageInfos.get(key)
      // don't include AMP pages since they don't rely on shared bundles
      // AMP First pages are not under the pageInfos key
      if (pageInfo?.isHybridAmp) {
        return
      }
    }

    ++expected
    manifest.pages[key].forEach((file) => {
      if (key === '/_app') {
        files.set(file, Infinity)
      } else if (files.has(file)) {
        files.set(file, files.get(file)! + 1)
      } else {
        files.set(file, 1)
      }
    })
  })

  const getSize = gzipSize ? fsStatGzip : fsStat

  const commonFiles = [...files.entries()]
    .filter(([, len]) => len === expected || len === Infinity)
    .map(([f]) => f)
  const uniqueFiles = [...files.entries()]
    .filter(([, len]) => len === 1)
    .map(([f]) => f)

  let stats: [string, number][]
  try {
    stats = await Promise.all(
      commonFiles.map(
        async (f) =>
          [f, await getSize(path.join(distPath, f))] as [string, number]
      )
    )
  } catch (_) {
    stats = []
  }

  let uniqueStats: [string, number][]
  try {
    uniqueStats = await Promise.all(
      uniqueFiles.map(
        async (f) =>
          [f, await getSize(path.join(distPath, f))] as [string, number]
      )
    )
  } catch (_) {
    uniqueStats = []
  }

  lastCompute = {
    commonFiles,
    uniqueFiles,
    sizeUniqueFiles: uniqueStats.reduce(
      (obj, n) => Object.assign(obj, { [n[0]]: n[1] }),
      {}
    ),
    sizeCommonFile: stats.reduce(
      (obj, n) => Object.assign(obj, { [n[0]]: n[1] }),
      {}
    ),
    sizeCommonFiles: stats.reduce((size, [f, stat]) => {
      if (f.endsWith('.css')) return size
      return size + stat
    }, 0),
  }

  cachedBuildManifest = manifest
  lastComputePageInfo = !!pageInfos
  return lastCompute!
}

export function difference<T>(main: T[] | Set<T>, sub: T[] | Set<T>): T[] {
  const a = new Set(main)
  const b = new Set(sub)
  return [...a].filter((x) => !b.has(x))
}

function intersect<T>(main: T[], sub: T[]): T[] {
  const a = new Set(main)
  const b = new Set(sub)
  return [...new Set([...a].filter((x) => b.has(x)))]
}

function sum(a: number[]): number {
  return a.reduce((size, stat) => size + stat, 0)
}

export async function getJsPageSizeInKb(
  page: string,
  distPath: string,
  buildManifest: BuildManifest,
  gzipSize: boolean = true,
  computedManifestData?: ComputeManifestShape
): Promise<[number, number]> {
  const data =
    computedManifestData ||
    (await computeFromManifest(buildManifest, distPath, gzipSize))

  const fnFilterJs = (entry: string) => entry.endsWith('.js')

  const pageFiles = (
    buildManifest.pages[denormalizePagePath(page)] || []
  ).filter(fnFilterJs)
  const appFiles = (buildManifest.pages['/_app'] || []).filter(fnFilterJs)

  const fnMapRealPath = (dep: string) => `${distPath}/${dep}`

  const allFilesReal = [...new Set([...pageFiles, ...appFiles])].map(
    fnMapRealPath
  )
  const selfFilesReal = difference(
    intersect(pageFiles, data.uniqueFiles),
    data.commonFiles
  ).map(fnMapRealPath)

  const getSize = gzipSize ? fsStatGzip : fsStat

  try {
    // Doesn't use `Promise.all`, as we'd double compute duplicate files. This
    // function is memoized, so the second one will instantly resolve.
    const allFilesSize = sum(await Promise.all(allFilesReal.map(getSize)))
    const selfFilesSize = sum(await Promise.all(selfFilesReal.map(getSize)))

    return [selfFilesSize, allFilesSize]
  } catch (_) {}
  return [-1, -1]
}

export async function buildStaticPaths(
  page: string,
  getStaticPaths: GetStaticPaths,
  configFileName: string,
  locales?: string[],
  defaultLocale?: string
): Promise<
  Omit<UnwrapPromise<ReturnType<GetStaticPaths>>, 'paths'> & {
    paths: string[]
    encodedPaths: string[]
  }
> {
  const prerenderPaths = new Set<string>()
  const encodedPrerenderPaths = new Set<string>()
  const _routeRegex = getRouteRegex(page)
  const _routeMatcher = getRouteMatcher(_routeRegex)

  // Get the default list of allowed params.
  const _validParamKeys = Object.keys(_routeMatcher(page))

  const staticPathsResult = await getStaticPaths({ locales, defaultLocale })

  const expectedReturnVal =
    `Expected: { paths: [], fallback: boolean }\n` +
    `See here for more info: https://nextjs.org/docs/messages/invalid-getstaticpaths-value`

  if (
    !staticPathsResult ||
    typeof staticPathsResult !== 'object' ||
    Array.isArray(staticPathsResult)
  ) {
    throw new Error(
      `Invalid value returned from getStaticPaths in ${page}. Received ${typeof staticPathsResult} ${expectedReturnVal}`
    )
  }

  const invalidStaticPathKeys = Object.keys(staticPathsResult).filter(
    (key) => !(key === 'paths' || key === 'fallback')
  )

  if (invalidStaticPathKeys.length > 0) {
    throw new Error(
      `Extra keys returned from getStaticPaths in ${page} (${invalidStaticPathKeys.join(
        ', '
      )}) ${expectedReturnVal}`
    )
  }

  if (
    !(
      typeof staticPathsResult.fallback === 'boolean' ||
      staticPathsResult.fallback === 'blocking'
    )
  ) {
    throw new Error(
      `The \`fallback\` key must be returned from getStaticPaths in ${page}.\n` +
        expectedReturnVal
    )
  }

  const toPrerender = staticPathsResult.paths

  if (!Array.isArray(toPrerender)) {
    throw new Error(
      `Invalid \`paths\` value returned from getStaticPaths in ${page}.\n` +
        `\`paths\` must be an array of strings or objects of shape { params: [key: string]: string }`
    )
  }

  toPrerender.forEach((entry) => {
    // For a string-provided path, we must make sure it matches the dynamic
    // route.
    if (typeof entry === 'string') {
      entry = removeTrailingSlash(entry)

      const localePathResult = normalizeLocalePath(entry, locales)
      let cleanedEntry = entry

      if (localePathResult.detectedLocale) {
        cleanedEntry = entry.slice(localePathResult.detectedLocale.length + 1)
      } else if (defaultLocale) {
        entry = `/${defaultLocale}${entry}`
      }

      const result = _routeMatcher(cleanedEntry)
      if (!result) {
        throw new Error(
          `The provided path \`${cleanedEntry}\` does not match the page: \`${page}\`.`
        )
      }

      // If leveraging the string paths variant the entry should already be
      // encoded so we decode the segments ensuring we only escape path
      // delimiters
      prerenderPaths.add(
        entry
          .split('/')
          .map((segment) =>
            escapePathDelimiters(decodeURIComponent(segment), true)
          )
          .join('/')
      )
      encodedPrerenderPaths.add(entry)
    }
    // For the object-provided path, we must make sure it specifies all
    // required keys.
    else {
      const invalidKeys = Object.keys(entry).filter(
        (key) => key !== 'params' && key !== 'locale'
      )

      if (invalidKeys.length) {
        throw new Error(
          `Additional keys were returned from \`getStaticPaths\` in page "${page}". ` +
            `URL Parameters intended for this dynamic route must be nested under the \`params\` key, i.e.:` +
            `\n\n\treturn { params: { ${_validParamKeys
              .map((k) => `${k}: ...`)
              .join(', ')} } }` +
            `\n\nKeys that need to be moved: ${invalidKeys.join(', ')}.\n`
        )
      }

      const { params = {} } = entry
      let builtPage = page
      let encodedBuiltPage = page

      _validParamKeys.forEach((validParamKey) => {
        const { repeat, optional } = _routeRegex.groups[validParamKey]
        let paramValue = params[validParamKey]
        if (
          optional &&
          params.hasOwnProperty(validParamKey) &&
          (paramValue === null ||
            paramValue === undefined ||
            (paramValue as any) === false)
        ) {
          paramValue = []
        }
        if (
          (repeat && !Array.isArray(paramValue)) ||
          (!repeat && typeof paramValue !== 'string')
        ) {
          throw new Error(
            `A required parameter (${validParamKey}) was not provided as ${
              repeat ? 'an array' : 'a string'
            } in getStaticPaths for ${page}`
          )
        }
        let replaced = `[${repeat ? '...' : ''}${validParamKey}]`
        if (optional) {
          replaced = `[${replaced}]`
        }
        builtPage = builtPage
          .replace(
            replaced,
            repeat
              ? (paramValue as string[])
                  .map((segment) => escapePathDelimiters(segment, true))
                  .join('/')
              : escapePathDelimiters(paramValue as string, true)
          )
          .replace(/(?!^)\/$/, '')

        encodedBuiltPage = encodedBuiltPage
          .replace(
            replaced,
            repeat
              ? (paramValue as string[]).map(encodeURIComponent).join('/')
              : encodeURIComponent(paramValue as string)
          )
          .replace(/(?!^)\/$/, '')
      })

      if (entry.locale && !locales?.includes(entry.locale)) {
        throw new Error(
          `Invalid locale returned from getStaticPaths for ${page}, the locale ${entry.locale} is not specified in ${configFileName}`
        )
      }
      const curLocale = entry.locale || defaultLocale || ''

      prerenderPaths.add(
        `${curLocale ? `/${curLocale}` : ''}${
          curLocale && builtPage === '/' ? '' : builtPage
        }`
      )
      encodedPrerenderPaths.add(
        `${curLocale ? `/${curLocale}` : ''}${
          curLocale && encodedBuiltPage === '/' ? '' : encodedBuiltPage
        }`
      )
    }
  })

  return {
    paths: [...prerenderPaths],
    fallback: staticPathsResult.fallback,
    encodedPaths: [...encodedPrerenderPaths],
  }
}

export async function isPageStatic(
  page: string,
  distDir: string,
  serverless: boolean,
  configFileName: string,
  runtimeEnvConfig: any,
  httpAgentOptions: NextConfigComplete['httpAgentOptions'],
  locales?: string[],
  defaultLocale?: string,
  parentId?: any
): Promise<{
  isStatic?: boolean
  isAmpOnly?: boolean
  isHybridAmp?: boolean
  hasServerProps?: boolean
  hasStaticProps?: boolean
  prerenderRoutes?: string[]
  encodedPrerenderRoutes?: string[]
  prerenderFallback?: boolean | 'blocking'
  isNextImageImported?: boolean
  traceIncludes?: string[]
  traceExcludes?: string[]
}> {
  const isPageStaticSpan = trace('is-page-static-utils', parentId)
  return isPageStaticSpan.traceAsyncFn(async () => {
    require('../shared/lib/runtime-config').setConfig(runtimeEnvConfig)
    setHttpAgentOptions(httpAgentOptions)

    const mod = await loadComponents(distDir, page, serverless)
    const Comp = mod.Component

    if (!Comp || !isValidElementType(Comp) || typeof Comp === 'string') {
      throw new Error('INVALID_DEFAULT_EXPORT')
    }

    const hasGetInitialProps = !!(Comp as any).getInitialProps
    const hasStaticProps = !!mod.getStaticProps
    const hasStaticPaths = !!mod.getStaticPaths
    const hasServerProps = !!mod.getServerSideProps
    const hasLegacyServerProps = !!(await mod.ComponentMod
      .unstable_getServerProps)
    const hasLegacyStaticProps = !!(await mod.ComponentMod
      .unstable_getStaticProps)
    const hasLegacyStaticPaths = !!(await mod.ComponentMod
      .unstable_getStaticPaths)
    const hasLegacyStaticParams = !!(await mod.ComponentMod
      .unstable_getStaticParams)

    if (hasLegacyStaticParams) {
      throw new Error(
        `unstable_getStaticParams was replaced with getStaticPaths. Please update your code.`
      )
    }

    if (hasLegacyStaticPaths) {
      throw new Error(
        `unstable_getStaticPaths was replaced with getStaticPaths. Please update your code.`
      )
    }

    if (hasLegacyStaticProps) {
      throw new Error(
        `unstable_getStaticProps was replaced with getStaticProps. Please update your code.`
      )
    }

    if (hasLegacyServerProps) {
      throw new Error(
        `unstable_getServerProps was replaced with getServerSideProps. Please update your code.`
      )
    }

    // A page cannot be prerendered _and_ define a data requirement. That's
    // contradictory!
    if (hasGetInitialProps && hasStaticProps) {
      throw new Error(SSG_GET_INITIAL_PROPS_CONFLICT)
    }

    if (hasGetInitialProps && hasServerProps) {
      throw new Error(SERVER_PROPS_GET_INIT_PROPS_CONFLICT)
    }

    if (hasStaticProps && hasServerProps) {
      throw new Error(SERVER_PROPS_SSG_CONFLICT)
    }

    const pageIsDynamic = isDynamicRoute(page)
    // A page cannot have static parameters if it is not a dynamic page.
    if (hasStaticProps && hasStaticPaths && !pageIsDynamic) {
      throw new Error(
        `getStaticPaths can only be used with dynamic pages, not '${page}'.` +
          `\nLearn more: https://nextjs.org/docs/routing/dynamic-routes`
      )
    }

    if (hasStaticProps && pageIsDynamic && !hasStaticPaths) {
      throw new Error(
        `getStaticPaths is required for dynamic SSG pages and is missing for '${page}'.` +
          `\nRead more: https://nextjs.org/docs/messages/invalid-getstaticpaths-value`
      )
    }

    let prerenderRoutes: Array<string> | undefined
    let encodedPrerenderRoutes: Array<string> | undefined
    let prerenderFallback: boolean | 'blocking' | undefined
    if (hasStaticProps && hasStaticPaths) {
      ;({
        paths: prerenderRoutes,
        fallback: prerenderFallback,
        encodedPaths: encodedPrerenderRoutes,
      } = await buildStaticPaths(
        page,
        mod.getStaticPaths!,
        configFileName,
        locales,
        defaultLocale
      ))
    }

    const isNextImageImported = (global as any).__NEXT_IMAGE_IMPORTED
    const config: PageConfig = mod.pageConfig
    return {
      isStatic: !hasStaticProps && !hasGetInitialProps && !hasServerProps,
      isHybridAmp: config.amp === 'hybrid',
      isAmpOnly: config.amp === true,
      prerenderRoutes,
      prerenderFallback,
      encodedPrerenderRoutes,
      hasStaticProps,
      hasServerProps,
      isNextImageImported,
      traceIncludes: config.unstable_includeFiles || [],
      traceExcludes: config.unstable_excludeFiles || [],
    }
  })
}

export async function hasCustomGetInitialProps(
  page: string,
  distDir: string,
  isLikeServerless: boolean,
  runtimeEnvConfig: any,
  checkingApp: boolean
): Promise<boolean> {
  require('../shared/lib/runtime-config').setConfig(runtimeEnvConfig)

  const components = await loadComponents(distDir, page, isLikeServerless)
  let mod = components.ComponentMod

  if (checkingApp) {
    mod = (await mod._app) || mod.default || mod
  } else {
    mod = mod.default || mod
  }
  mod = await mod
  return mod.getInitialProps !== mod.origGetInitialProps
}

export async function getNamedExports(
  page: string,
  distDir: string,
  isLikeServerless: boolean,
  runtimeEnvConfig: any
): Promise<Array<string>> {
  require('../shared/lib/runtime-config').setConfig(runtimeEnvConfig)
  const components = await loadComponents(distDir, page, isLikeServerless)
  let mod = components.ComponentMod

  return Object.keys(mod)
}

export function detectConflictingPaths(
  combinedPages: string[],
  ssgPages: Set<string>,
  additionalSsgPaths: Map<string, string[]>
) {
  const conflictingPaths = new Map<
    string,
    Array<{
      path: string
      page: string
    }>
  >()

  const dynamicSsgPages = [...ssgPages].filter((page) => isDynamicRoute(page))

  additionalSsgPaths.forEach((paths, pathsPage) => {
    paths.forEach((curPath) => {
      const lowerPath = curPath.toLowerCase()
      let conflictingPage = combinedPages.find(
        (page) => page.toLowerCase() === lowerPath
      )

      if (conflictingPage) {
        conflictingPaths.set(lowerPath, [
          { path: curPath, page: pathsPage },
          { path: conflictingPage, page: conflictingPage },
        ])
      } else {
        let conflictingPath: string | undefined

        conflictingPage = dynamicSsgPages.find((page) => {
          if (page === pathsPage) return false

          conflictingPath = additionalSsgPaths
            .get(page)
            ?.find((compPath) => compPath.toLowerCase() === lowerPath)
          return conflictingPath
        })

        if (conflictingPage && conflictingPath) {
          conflictingPaths.set(lowerPath, [
            { path: curPath, page: pathsPage },
            { path: conflictingPath, page: conflictingPage },
          ])
        }
      }
    })
  })

  if (conflictingPaths.size > 0) {
    let conflictingPathsOutput = ''

    conflictingPaths.forEach((pathItems) => {
      pathItems.forEach((pathItem, idx) => {
        const isDynamic = pathItem.page !== pathItem.path

        if (idx > 0) {
          conflictingPathsOutput += 'conflicts with '
        }

        conflictingPathsOutput += `path: "${pathItem.path}"${
          isDynamic ? ` from page: "${pathItem.page}" ` : ' '
        }`
      })
      conflictingPathsOutput += '\n'
    })

    Log.error(
      'Conflicting paths returned from getStaticPaths, paths must be unique per page.\n' +
        'See more info here: https://nextjs.org/docs/messages/conflicting-ssg-paths\n\n' +
        conflictingPathsOutput
    )
    process.exit(1)
  }
}

/**
 * With RSC we automatically add .server and .client to page extensions. This
 * function allows to remove them for cases where we just need to strip out
 * the actual extension keeping the .server and .client.
 */
export function withoutRSCExtensions(pageExtensions: string[]): string[] {
  return pageExtensions.filter(
    (ext) => !ext.startsWith('client.') && !ext.startsWith('server.')
  )
}

export function isServerComponentPage(
  nextConfig: NextConfigComplete,
  filePath: string
): boolean {
  if (!nextConfig.experimental.serverComponents) {
    return false
  }

  const rawPageExtensions = withoutRSCExtensions(
    nextConfig.pageExtensions || []
  )
  return rawPageExtensions.some((ext) => {
    return filePath.endsWith(`.server.${ext}`)
  })
}

export function getUnresolvedModuleFromError(
  error: string
): string | undefined {
  const moduleErrorRegex = new RegExp(
    `Module not found: Error: Can't resolve '(\\w+)'`
  )
  const [, moduleName] = error.match(moduleErrorRegex) || []
  return builtinModules.find((item: string) => item === moduleName)
}

export async function copyTracedFiles(
  dir: string,
  distDir: string,
  pageKeys: string[],
  tracingRoot: string,
  serverConfig: { [key: string]: any },
  middlewareManifest: MiddlewareManifest
) {
  const outputPath = path.join(distDir, 'standalone')
  const copiedFiles = new Set()
  await recursiveDelete(outputPath)

  async function handleTraceFiles(traceFilePath: string) {
    const traceData = JSON.parse(await fs.readFile(traceFilePath, 'utf8')) as {
      files: string[]
    }
    const copySema = new Sema(10, { capacity: traceData.files.length })
    const traceFileDir = path.dirname(traceFilePath)

    await Promise.all(
      traceData.files.map(async (relativeFile) => {
        await copySema.acquire()

        const tracedFilePath = path.join(traceFileDir, relativeFile)
        const fileOutputPath = path.join(
          outputPath,
          path.relative(tracingRoot, tracedFilePath)
        )

        if (!copiedFiles.has(fileOutputPath)) {
          copiedFiles.add(fileOutputPath)

          await fs.mkdir(path.dirname(fileOutputPath), { recursive: true })
          const symlink = await fs.readlink(tracedFilePath).catch(() => null)

          if (symlink) {
            console.log('symlink', path.relative(tracingRoot, symlink))
            await fs.symlink(symlink, fileOutputPath)
          } else {
            await fs.copyFile(tracedFilePath, fileOutputPath)
          }
        }

        await copySema.release()
      })
    )
  }

  for (const middleware of Object.values(middlewareManifest.middleware) || []) {
    if (isMiddlewareFilename(middleware.name)) {
      for (const file of middleware.files) {
        const originalPath = path.join(distDir, file)
        const fileOutputPath = path.join(
          outputPath,
          path.relative(tracingRoot, distDir),
          file
        )
        await fs.mkdir(path.dirname(fileOutputPath), { recursive: true })
        await fs.copyFile(originalPath, fileOutputPath)
      }
    }
  }

  for (const page of pageKeys) {
    const pageFile = path.join(
      distDir,
      'server',
      'pages',
      `${normalizePagePath(page)}.js`
    )
    const pageTraceFile = `${pageFile}.nft.json`
    await handleTraceFiles(pageTraceFile)
  }
  await handleTraceFiles(path.join(distDir, 'next-server.js.nft.json'))
  const serverOutputPath = path.join(
    outputPath,
    path.relative(tracingRoot, dir),
    'server.js'
  )
  await fs.writeFile(
    serverOutputPath,
    `
process.env.NODE_ENV = 'production'
process.chdir(__dirname)
const NextServer = require('next/dist/server/next-server').default
const http = require('http')
const path = require('path')

// Make sure commands gracefully respect termination signals (e.g. from Docker)
process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

let handler

const server = http.createServer(async (req, res) => {
  try {
    await handler(req, res)
  } catch (err) {
    console.error(err);
    res.statusCode = 500
    res.end('internal server error')
  }
})
const currentPort = parseInt(process.env.PORT, 10) || 3000

server.listen(currentPort, (err) => {
  if (err) {
    console.error("Failed to start server", err)
    process.exit(1)
  }
  const nextServer = new NextServer({
    hostname: 'localhost',
    port: currentPort,
    dir: path.join(__dirname),
    dev: false,
    conf: ${JSON.stringify({
      ...serverConfig,
      distDir: `./${path.relative(dir, distDir)}`,
    })},
  })
  handler = nextServer.getRequestHandler()

  console.log("Listening on port", currentPort)
})
    `
  )
}
export function isReservedPage(page: string) {
  return RESERVED_PAGE.test(page)
}

export function isCustomErrorPage(page: string) {
  return page === '/404' || page === '/500'
}

// FIX ME: it does not work for non-middleware edge functions
//  since chunks don't contain runtime specified somehow
export async function isEdgeRuntimeCompiled(
  compilation: webpack5.Compilation,
  module: any,
  config: NextConfig
) {
  if (!module) return false

  for (const chunk of compilation.chunkGraph.getModuleChunksIterable(module)) {
    let runtimes: string[]
    if (typeof chunk.runtime === 'string') {
      runtimes = [chunk.runtime]
    } else if (chunk.runtime) {
      runtimes = [...chunk.runtime]
    } else {
      runtimes = []
    }

    if (runtimes.some((r) => r === EDGE_RUNTIME_WEBPACK)) {
      return true
    }
  }

  const staticInfo = await getPageStaticInfo({
    pageFilePath: module.resource,
    nextConfig: config,
  })

  // Check the page runtime as well since we cannot detect the runtime from
  // compilation when it's for the client part of edge function
  return staticInfo.runtime === SERVER_RUNTIME.edge
}

export function getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage(
  name: string
) {
  return (
    `You're using a Node.js module (${name}) which is not supported in the Edge Runtime.\n` +
    'Learn more: https://nextjs.org/docs/api-reference/edge-runtime'
  )
}

export function isMiddlewareFile(file: string) {
  return (
    file === `/${MIDDLEWARE_FILENAME}` || file === `/src/${MIDDLEWARE_FILENAME}`
  )
}

export function isMiddlewareFilename(file?: string) {
  return file === MIDDLEWARE_FILENAME || file === `src/${MIDDLEWARE_FILENAME}`
}

export function getPossibleMiddlewareFilenames(
  folder: string,
  extensions: string[]
) {
  return extensions.map((extension) =>
    path.join(folder, `${MIDDLEWARE_FILENAME}.${extension}`)
  )
}

export class MiddlewareInServerlessTargetError extends Error {
  constructor() {
    super(
      'Next.js Middleware is not supported in the deprecated serverless target.\n' +
        'Please remove `target: "serverless" from your next.config.js to use Middleware.'
    )
    this.name = 'MiddlewareInServerlessTargetError'
  }
}

export class NestedMiddlewareError extends Error {
  constructor(nestedFileNames: string[], mainDir: string, pagesDir: string) {
    super(
      `Nested Middleware is not allowed, found:\n` +
        `${nestedFileNames.map((file) => `pages${file}`).join('\n')}\n` +
        `Please move your code to a single file at ${path.join(
          path.posix.sep,
          path.relative(mainDir, path.resolve(pagesDir, '..')),
          'middleware'
        )} instead.\n` +
        `Read More - https://nextjs.org/docs/messages/nested-middleware`
    )
  }
}
