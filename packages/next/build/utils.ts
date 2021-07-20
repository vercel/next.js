import '../server/node-polyfill-fetch'
import chalk from 'chalk'
import getGzipSize from 'next/dist/compiled/gzip-size'
import textTable from 'next/dist/compiled/text-table'
import path from 'path'
import { promises as fs } from 'fs'
import { isValidElementType } from 'react-is'
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
} from '../lib/constants'
import prettyBytes from '../lib/pretty-bytes'
import { recursiveReadDir } from '../lib/recursive-readdir'
import { getRouteMatcher, getRouteRegex } from '../shared/lib/router/utils'
import { isDynamicRoute } from '../shared/lib/router/utils/is-dynamic'
import escapePathDelimiters from '../shared/lib/router/utils/escape-path-delimiters'
import { findPageFile } from '../server/lib/find-page-file'
import { GetStaticPaths } from 'next/types'
import { denormalizePagePath } from '../server/normalize-page-path'
import { BuildManifest } from '../server/get-page-files'
import { removePathTrailingSlash } from '../client/normalize-trailing-slash'
import { UnwrapPromise } from '../lib/coalesced-function'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import * as Log from './output/log'
import { loadComponents } from '../server/load-components'
import { trace } from '../telemetry/trace'

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
  isHybridAmp?: boolean
  size: number
  totalSize: number
  static: boolean
  isSsg: boolean
  ssgPageRoutes: string[] | null
  initialRevalidateSeconds: number | false
  pageDuration: number | undefined
  ssgPageDurations: number[] | undefined
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
    useStatic404,
    gzipSize = true,
  }: {
    distPath: string
    buildId: string
    pagesDir: string
    pageExtensions: string[]
    buildManifest: BuildManifest
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
    const symbol =
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

    messages.push([
      `${symbol} ${
        item === '/_app'
          ? ' '
          : pageInfo?.static
          ? '○'
          : pageInfo?.isSsg
          ? '●'
          : 'λ'
      } ${
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
        [
          'λ',
          serverless ? '(Lambda)' : '(Server)',
          `server-side renders at runtime (uses ${chalk.cyan(
            'getInitialProps'
          )} or ${chalk.cyan('getServerSideProps')})`,
        ],
        [
          '○',
          '(Static)',
          'automatically rendered as static HTML (uses no initial props)',
        ],
        [
          '●',
          '(SSG)',
          `automatically generated as static HTML + JSON (uses ${chalk.cyan(
            'getStaticProps'
          )})`,
        ],
        [
          '',
          '(ISR)',
          `incremental static regeneration (uses revalidate in ${chalk.cyan(
            'getStaticProps'
          )})`,
        ],
      ] as [string, string, string][],
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
      entry = removePathTrailingSlash(entry)

      const localePathResult = normalizeLocalePath(entry, locales)
      let cleanedEntry = entry

      if (localePathResult.detectedLocale) {
        cleanedEntry = entry.substr(localePathResult.detectedLocale.length + 1)
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
          `Invalid locale returned from getStaticPaths for ${page}, the locale ${entry.locale} is not specified in next.config.js`
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
  runtimeEnvConfig: any,
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
}> {
  const isPageStaticSpan = trace('is-page-static-utils', parentId)
  return isPageStaticSpan.traceAsyncFn(async () => {
    try {
      require('../shared/lib/runtime-config').setConfig(runtimeEnvConfig)
      const components = await loadComponents(distDir, page, serverless)
      const mod = components.ComponentMod
      const Comp = mod.default || mod

      if (!Comp || !isValidElementType(Comp) || typeof Comp === 'string') {
        throw new Error('INVALID_DEFAULT_EXPORT')
      }

      const hasGetInitialProps = !!(Comp as any).getInitialProps
      const hasStaticProps = !!(await mod.getStaticProps)
      const hasStaticPaths = !!(await mod.getStaticPaths)
      const hasServerProps = !!(await mod.getServerSideProps)
      const hasLegacyServerProps = !!(await mod.unstable_getServerProps)
      const hasLegacyStaticProps = !!(await mod.unstable_getStaticProps)
      const hasLegacyStaticPaths = !!(await mod.unstable_getStaticPaths)
      const hasLegacyStaticParams = !!(await mod.unstable_getStaticParams)

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
          mod.getStaticPaths,
          locales,
          defaultLocale
        ))
      }

      const isNextImageImported = (global as any).__NEXT_IMAGE_IMPORTED
      const config = mod.config || {}
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
      }
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') return {}
      throw err
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
      'Conflicting paths returned from getStaticPaths, paths must unique per page.\n' +
        'See more info here: https://nextjs.org/docs/messages/conflicting-ssg-paths\n\n' +
        conflictingPathsOutput
    )
    process.exit(1)
  }
}

export function getCssFilePaths(buildManifest: BuildManifest): string[] {
  const cssFiles = new Set<string>()
  Object.values(buildManifest.pages).forEach((files) => {
    files.forEach((file) => {
      if (file.endsWith('.css')) {
        cssFiles.add(file)
      }
    })
  })

  return [...cssFiles]
}
