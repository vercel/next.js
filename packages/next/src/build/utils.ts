import type { NextConfigComplete } from '../server/config-shared'
import type { ExperimentalPPRConfig } from '../server/lib/experimental/ppr'
import type { AppBuildManifest } from './webpack/plugins/app-build-manifest-plugin'
import type { AssetBinding } from './webpack/loaders/get-module-build-info'
import type { PageConfig, ServerRuntime } from '../types'
import type { BuildManifest } from '../server/get-page-files'
import type {
  Redirect,
  Rewrite,
  Header,
  CustomRoutes,
} from '../lib/load-custom-routes'
import type {
  EdgeFunctionDefinition,
  MiddlewareManifest,
} from './webpack/plugins/middleware-plugin'
import type { WebpackLayerName } from '../lib/constants'
import type { AppPageModule } from '../server/route-modules/app-page/module'
import type { RouteModule } from '../server/route-modules/route-module'
import type { NextComponentType } from '../shared/lib/utils'

import '../server/require-hook'
import '../server/node-polyfill-crypto'
import '../server/node-environment'

import {
  green,
  yellow,
  red,
  cyan,
  white,
  bold,
  underline,
} from '../lib/picocolors'
import getGzipSize from 'next/dist/compiled/gzip-size'
import textTable from 'next/dist/compiled/text-table'
import path from 'path'
import { promises as fs } from 'fs'
import { isValidElementType } from 'next/dist/compiled/react-is'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import browserslist from 'next/dist/compiled/browserslist'
import {
  SSG_GET_INITIAL_PROPS_CONFLICT,
  SERVER_PROPS_GET_INIT_PROPS_CONFLICT,
  SERVER_PROPS_SSG_CONFLICT,
  MIDDLEWARE_FILENAME,
  INSTRUMENTATION_HOOK_FILENAME,
  WEBPACK_LAYERS,
} from '../lib/constants'
import {
  MODERN_BROWSERSLIST_TARGET,
  UNDERSCORE_NOT_FOUND_ROUTE,
} from '../shared/lib/constants'
import prettyBytes from '../lib/pretty-bytes'
import { isDynamicRoute } from '../shared/lib/router/utils/is-dynamic'
import { findPageFile } from '../server/lib/find-page-file'
import { isEdgeRuntime } from '../lib/is-edge-runtime'
import * as Log from './output/log'
import { loadComponents } from '../server/load-components'
import type { LoadComponentsReturnType } from '../server/load-components'
import { trace } from '../trace'
import { setHttpClientAndAgentOptions } from '../server/setup-http-agent-env'
import { Sema } from 'next/dist/compiled/async-sema'
import { denormalizePagePath } from '../shared/lib/page-path/denormalize-page-path'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { getRuntimeContext } from '../server/web/sandbox'
import { isClientReference } from '../lib/client-and-server-references'
import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'
import { denormalizeAppPagePath } from '../shared/lib/page-path/denormalize-app-path'
import { RouteKind } from '../server/route-kind'
import type { PageExtensions } from './page-extensions-type'
import { isInterceptionRouteAppPath } from '../server/lib/interception-routes'
import { checkIsRoutePPREnabled } from '../server/lib/experimental/ppr'
import type { FallbackMode } from '../lib/fallback'
import type { OutgoingHttpHeaders } from 'http'
import type { AppSegmentConfig } from './segment-config/app/app-segment-config'
import type { AppSegment } from './segment-config/app/app-segments'
import { collectSegments } from './segment-config/app/app-segments'
import { createIncrementalCache } from '../export/helpers/create-incremental-cache'
import { collectRootParamKeys } from './segment-config/app/collect-root-param-keys'
import { buildAppStaticPaths } from './static-paths/app'
import { buildPagesStaticPaths } from './static-paths/pages'
import type { PrerenderedRoute } from './static-paths/types'

export type ROUTER_TYPE = 'pages' | 'app'

// Use `print()` for expected console output
const print = console.log

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

export function unique<T>(main: ReadonlyArray<T>, sub: ReadonlyArray<T>): T[] {
  return [...new Set([...main, ...sub])]
}

export function difference<T>(
  main: ReadonlyArray<T> | ReadonlySet<T>,
  sub: ReadonlyArray<T> | ReadonlySet<T>
): T[] {
  const a = new Set(main)
  const b = new Set(sub)
  return [...a].filter((x) => !b.has(x))
}

/**
 * Return an array of the items shared by both arrays.
 */
function intersect<T>(main: ReadonlyArray<T>, sub: ReadonlyArray<T>): T[] {
  const a = new Set(main)
  const b = new Set(sub)
  return [...new Set([...a].filter((x) => b.has(x)))]
}

function sum(a: ReadonlyArray<number>): number {
  return a.reduce((size, stat) => size + stat, 0)
}

type ComputeFilesGroup = {
  files: ReadonlyArray<string>
  size: {
    total: number
  }
}

type ComputeFilesManifest = {
  unique: ComputeFilesGroup
  common: ComputeFilesGroup
}

type ComputeFilesManifestResult = {
  router: {
    pages: ComputeFilesManifest
    app?: ComputeFilesManifest
  }
  sizes: Map<string, number>
}

let cachedBuildManifest: BuildManifest | undefined
let cachedAppBuildManifest: AppBuildManifest | undefined

let lastCompute: ComputeFilesManifestResult | undefined
let lastComputePageInfo: boolean | undefined

export async function computeFromManifest(
  manifests: {
    build: BuildManifest
    app?: AppBuildManifest
  },
  distPath: string,
  gzipSize: boolean = true,
  pageInfos?: Map<string, PageInfo>
): Promise<ComputeFilesManifestResult> {
  if (
    Object.is(cachedBuildManifest, manifests.build) &&
    lastComputePageInfo === !!pageInfos &&
    Object.is(cachedAppBuildManifest, manifests.app)
  ) {
    return lastCompute!
  }

  // Determine the files that are in pages and app and count them, this will
  // tell us if they are unique or common.

  const countBuildFiles = (
    map: Map<string, number>,
    key: string,
    manifest: Record<string, ReadonlyArray<string>>
  ) => {
    for (const file of manifest[key]) {
      if (key === '/_app') {
        map.set(file, Infinity)
      } else if (map.has(file)) {
        map.set(file, map.get(file)! + 1)
      } else {
        map.set(file, 1)
      }
    }
  }

  const files: {
    pages: {
      each: Map<string, number>
      expected: number
    }
    app?: {
      each: Map<string, number>
      expected: number
    }
  } = {
    pages: { each: new Map(), expected: 0 },
  }

  for (const key in manifests.build.pages) {
    if (pageInfos) {
      const pageInfo = pageInfos.get(key)
      // don't include AMP pages since they don't rely on shared bundles
      // AMP First pages are not under the pageInfos key
      if (pageInfo?.isHybridAmp) {
        continue
      }
    }

    files.pages.expected++
    countBuildFiles(files.pages.each, key, manifests.build.pages)
  }

  // Collect the build files form the app manifest.
  if (manifests.app?.pages) {
    files.app = { each: new Map<string, number>(), expected: 0 }

    for (const key in manifests.app.pages) {
      files.app.expected++
      countBuildFiles(files.app.each, key, manifests.app.pages)
    }
  }

  const getSize = gzipSize ? fsStatGzip : fsStat
  const stats = new Map<string, number>()

  // For all of the files in the pages and app manifests, compute the file size
  // at once.

  await Promise.all(
    [
      ...new Set<string>([
        ...files.pages.each.keys(),
        ...(files.app?.each.keys() ?? []),
      ]),
    ].map(async (f) => {
      try {
        // Add the file size to the stats.
        stats.set(f, await getSize(path.join(distPath, f)))
      } catch {}
    })
  )

  const groupFiles = async (listing: {
    each: Map<string, number>
    expected: number
  }): Promise<ComputeFilesManifest> => {
    const entries = [...listing.each.entries()]

    const shapeGroup = (group: [string, number][]): ComputeFilesGroup =>
      group.reduce(
        (acc, [f]) => {
          acc.files.push(f)

          const size = stats.get(f)
          if (typeof size === 'number') {
            acc.size.total += size
          }

          return acc
        },
        {
          files: [] as string[],
          size: {
            total: 0,
          },
        }
      )

    return {
      unique: shapeGroup(entries.filter(([, len]) => len === 1)),
      common: shapeGroup(
        entries.filter(
          ([, len]) => len === listing.expected || len === Infinity
        )
      ),
    }
  }

  lastCompute = {
    router: {
      pages: await groupFiles(files.pages),
      app: files.app ? await groupFiles(files.app) : undefined,
    },
    sizes: stats,
  }

  cachedBuildManifest = manifests.build
  cachedAppBuildManifest = manifests.app
  lastComputePageInfo = !!pageInfos
  return lastCompute!
}

export function isMiddlewareFilename(file?: string | null) {
  return file === MIDDLEWARE_FILENAME || file === `src/${MIDDLEWARE_FILENAME}`
}

export function isInstrumentationHookFilename(file?: string | null) {
  return (
    file === INSTRUMENTATION_HOOK_FILENAME ||
    file === `src/${INSTRUMENTATION_HOOK_FILENAME}`
  )
}

const filterAndSortList = (
  list: ReadonlyArray<string>,
  routeType: ROUTER_TYPE,
  hasCustomApp: boolean
) => {
  let pages: string[]
  if (routeType === 'app') {
    // filter out static app route of /favicon.ico
    pages = list.filter((e) => e !== '/favicon.ico')
  } else {
    // filter built-in pages
    pages = list
      .slice()
      .filter(
        (e) =>
          !(
            e === '/_document' ||
            e === '/_error' ||
            (!hasCustomApp && e === '/_app')
          )
      )
  }
  return pages.sort((a, b) => a.localeCompare(b))
}

export interface PageInfo {
  isHybridAmp?: boolean
  size: number
  totalSize: number
  isStatic: boolean
  isSSG: boolean
  /**
   * If true, it means that the route has partial prerendering enabled.
   */
  isRoutePPREnabled: boolean
  ssgPageRoutes: string[] | null
  initialRevalidateSeconds: number | false
  pageDuration: number | undefined
  ssgPageDurations: number[] | undefined
  runtime: ServerRuntime
  hasEmptyPrelude?: boolean
  hasPostponed?: boolean
  isDynamicAppRoute?: boolean
}

export type PageInfos = Map<string, PageInfo>

export interface RoutesUsingEdgeRuntime {
  [route: string]: 0
}

export function collectRoutesUsingEdgeRuntime(
  input: PageInfos
): RoutesUsingEdgeRuntime {
  const routesUsingEdgeRuntime: RoutesUsingEdgeRuntime = {}
  for (const [route, info] of input.entries()) {
    if (isEdgeRuntime(info.runtime)) {
      routesUsingEdgeRuntime[route] = 0
    }
  }

  return routesUsingEdgeRuntime
}

export async function printTreeView(
  lists: {
    pages: ReadonlyArray<string>
    app: ReadonlyArray<string> | undefined
  },
  pageInfos: Map<string, PageInfo>,
  {
    distPath,
    buildId,
    pagesDir,
    pageExtensions,
    buildManifest,
    appBuildManifest,
    middlewareManifest,
    useStaticPages404,
    gzipSize = true,
  }: {
    distPath: string
    buildId: string
    pagesDir?: string
    pageExtensions: PageExtensions
    buildManifest: BuildManifest
    appBuildManifest?: AppBuildManifest
    middlewareManifest: MiddlewareManifest
    useStaticPages404: boolean
    gzipSize?: boolean
  }
) {
  const getPrettySize = (_size: number): string => {
    const size = prettyBytes(_size)
    return white(bold(size))
  }

  const MIN_DURATION = 300
  const getPrettyDuration = (_duration: number): string => {
    const duration = `${_duration} ms`
    // green for 300-1000ms
    if (_duration < 1000) return green(duration)
    // yellow for 1000-2000ms
    if (_duration < 2000) return yellow(duration)
    // red for >= 2000ms
    return red(bold(duration))
  }

  const getCleanName = (fileName: string) =>
    fileName
      // Trim off `static/`
      .replace(/^static\//, '')
      // Re-add `static/` for root files
      .replace(/^<buildId>/, 'static')
      // Remove file hash
      .replace(/(?:^|[.-])([0-9a-z]{6})[0-9a-z]{14}(?=\.)/, '.$1')

  // Check if we have a custom app.
  const hasCustomApp = !!(
    pagesDir && (await findPageFile(pagesDir, '/_app', pageExtensions, false))
  )

  // Collect all the symbols we use so we can print the icons out.
  const usedSymbols = new Set()

  const messages: [string, string, string][] = []

  const stats = await computeFromManifest(
    { build: buildManifest, app: appBuildManifest },
    distPath,
    gzipSize,
    pageInfos
  )

  const printFileTree = async ({
    list,
    routerType,
  }: {
    list: ReadonlyArray<string>
    routerType: ROUTER_TYPE
  }) => {
    const filteredPages = filterAndSortList(list, routerType, hasCustomApp)
    if (filteredPages.length === 0) {
      return
    }

    messages.push(
      [
        routerType === 'app' ? 'Route (app)' : 'Route (pages)',
        'Size',
        'First Load JS',
      ].map((entry) => underline(entry)) as [string, string, string]
    )

    filteredPages.forEach((item, i, arr) => {
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

      let symbol: string

      if (item === '/_app' || item === '/_app.server') {
        symbol = ' '
      } else if (isEdgeRuntime(pageInfo?.runtime)) {
        symbol = 'ƒ'
      } else if (pageInfo?.isRoutePPREnabled) {
        if (
          // If the page has an empty prelude, then it's equivalent to a dynamic page
          pageInfo?.hasEmptyPrelude ||
          // ensure we don't mark dynamic paths that postponed as being dynamic
          // since in this case we're able to partially prerender it
          (pageInfo.isDynamicAppRoute && !pageInfo.hasPostponed)
        ) {
          symbol = 'ƒ'
        } else if (!pageInfo?.hasPostponed) {
          symbol = '○'
        } else {
          symbol = '◐'
        }
      } else if (pageInfo?.isStatic) {
        symbol = '○'
      } else if (pageInfo?.isSSG) {
        symbol = '●'
      } else {
        symbol = 'ƒ'
      }

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
            ? cyan('AMP')
            : pageInfo.size >= 0
              ? prettyBytes(pageInfo.size)
              : ''
          : '',
        pageInfo
          ? ampFirst
            ? cyan('AMP')
            : pageInfo.size >= 0
              ? getPrettySize(pageInfo.totalSize)
              : ''
          : '',
      ])

      const uniqueCssFiles =
        buildManifest.pages[item]?.filter(
          (file) =>
            file.endsWith('.css') &&
            stats.router[routerType]?.unique.files.includes(file)
        ) || []

      if (uniqueCssFiles.length > 0) {
        const contSymbol = i === arr.length - 1 ? ' ' : '├'

        uniqueCssFiles.forEach((file, index, { length }) => {
          const innerSymbol = index === length - 1 ? '└' : '├'
          const size = stats.sizes.get(file)
          messages.push([
            `${contSymbol}   ${innerSymbol} ${getCleanName(file)}`,
            typeof size === 'number' ? prettyBytes(size) : '',
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

        routes.forEach(
          ({ route, duration, avgDuration }, index, { length }) => {
            const innerSymbol = index === length - 1 ? '└' : '├'
            messages.push([
              `${contSymbol}   ${innerSymbol} ${route}${
                duration > MIN_DURATION
                  ? ` (${getPrettyDuration(duration)})`
                  : ''
              }${
                avgDuration && avgDuration > MIN_DURATION
                  ? ` (avg ${getPrettyDuration(avgDuration)})`
                  : ''
              }`,
              '',
              '',
            ])
          }
        )
      }
    })

    const sharedFilesSize = stats.router[routerType]?.common.size.total
    const sharedFiles = stats.router[routerType]?.common.files ?? []

    messages.push([
      '+ First Load JS shared by all',
      typeof sharedFilesSize === 'number' ? getPrettySize(sharedFilesSize) : '',
      '',
    ])
    const sharedCssFiles: string[] = []
    const sharedJsChunks = [
      ...sharedFiles
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
    ]

    // if the some chunk are less than 10kb or we don't know the size, we only show the total size of the rest
    const tenKbLimit = 10 * 1000
    let restChunkSize = 0
    let restChunkCount = 0
    sharedJsChunks.forEach((fileName, index, { length }) => {
      const innerSymbol = index + restChunkCount === length - 1 ? '└' : '├'

      const originalName = fileName.replace('<buildId>', buildId)
      const cleanName = getCleanName(fileName)
      const size = stats.sizes.get(originalName)

      if (!size || size < tenKbLimit) {
        restChunkCount++
        restChunkSize += size || 0
        return
      }

      messages.push([`  ${innerSymbol} ${cleanName}`, prettyBytes(size), ''])
    })

    if (restChunkCount > 0) {
      messages.push([
        `  └ other shared chunks (total)`,
        prettyBytes(restChunkSize),
        '',
      ])
    }
  }

  // If enabled, then print the tree for the app directory.
  if (lists.app && stats.router.app) {
    await printFileTree({
      routerType: 'app',
      list: lists.app,
    })

    messages.push(['', '', ''])
  }

  pageInfos.set('/404', {
    ...(pageInfos.get('/404') || pageInfos.get('/_error'))!,
    isStatic: useStaticPages404,
  })

  // If there's no app /_notFound page present, then the 404 is still using the pages/404
  if (
    !lists.pages.includes('/404') &&
    !lists.app?.includes(UNDERSCORE_NOT_FOUND_ROUTE)
  ) {
    lists.pages = [...lists.pages, '/404']
  }

  // Print the tree view for the pages directory.
  await printFileTree({
    routerType: 'pages',
    list: lists.pages,
  })

  const middlewareInfo = middlewareManifest.middleware?.['/']
  if (middlewareInfo?.files.length > 0) {
    const middlewareSizes = await Promise.all(
      middlewareInfo.files
        .map((dep) => `${distPath}/${dep}`)
        .map(gzipSize ? fsStatGzip : fsStat)
    )

    messages.push(['', '', ''])
    messages.push(['ƒ Middleware', getPrettySize(sum(middlewareSizes)), ''])
  }

  print(
    textTable(messages, {
      align: ['l', 'l', 'r'],
      stringLength: (str) => stripAnsi(str).length,
    })
  )

  const staticFunctionInfo =
    lists.app && stats.router.app ? 'generateStaticParams' : 'getStaticProps'
  print()
  print(
    textTable(
      [
        usedSymbols.has('○') && [
          '○',
          '(Static)',
          'prerendered as static content',
        ],
        usedSymbols.has('●') && [
          '●',
          '(SSG)',
          `prerendered as static HTML (uses ${cyan(staticFunctionInfo)})`,
        ],
        usedSymbols.has('ISR') && [
          '',
          '(ISR)',
          `incremental static regeneration (uses revalidate in ${cyan(
            staticFunctionInfo
          )})`,
        ],
        usedSymbols.has('◐') && [
          '◐',
          '(Partial Prerender)',
          'prerendered as static HTML with dynamic server-streamed content',
        ],
        usedSymbols.has('ƒ') && ['ƒ', '(Dynamic)', `server-rendered on demand`],
      ].filter((x) => x) as [string, string, string][],
      {
        align: ['l', 'l', 'l'],
        stringLength: (str) => stripAnsi(str).length,
      }
    )
  )

  print()
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
    print(underline(type))

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

    print(`${routesStr}\n`)
  }

  print()
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

export async function getJsPageSizeInKb(
  routerType: ROUTER_TYPE,
  page: string,
  distPath: string,
  buildManifest: BuildManifest,
  appBuildManifest?: AppBuildManifest,
  gzipSize: boolean = true,
  cachedStats?: ComputeFilesManifestResult
): Promise<[number, number]> {
  const pageManifest = routerType === 'pages' ? buildManifest : appBuildManifest
  if (!pageManifest) {
    throw new Error('expected appBuildManifest with an "app" pageType')
  }

  // Normalize appBuildManifest keys
  if (routerType === 'app') {
    pageManifest.pages = Object.entries(pageManifest.pages).reduce(
      (acc: Record<string, string[]>, [key, value]) => {
        const newKey = normalizeAppPath(key)
        acc[newKey] = value as string[]
        return acc
      },
      {}
    )
  }

  // If stats was not provided, then compute it again.
  const stats =
    cachedStats ??
    (await computeFromManifest(
      { build: buildManifest, app: appBuildManifest },
      distPath,
      gzipSize
    ))

  const pageData = stats.router[routerType]
  if (!pageData) {
    // This error shouldn't happen and represents an error in Next.js.
    throw new Error('expected "app" manifest data with an "app" pageType')
  }

  const pagePath =
    routerType === 'pages'
      ? denormalizePagePath(page)
      : denormalizeAppPagePath(page)

  const fnFilterJs = (entry: string) => entry.endsWith('.js')

  const pageFiles = (pageManifest.pages[pagePath] ?? []).filter(fnFilterJs)
  const appFiles = (pageManifest.pages['/_app'] ?? []).filter(fnFilterJs)

  const fnMapRealPath = (dep: string) => `${distPath}/${dep}`

  const allFilesReal = unique(pageFiles, appFiles).map(fnMapRealPath)
  const selfFilesReal = difference(
    // Find the files shared by the pages files and the unique files...
    intersect(pageFiles, pageData.unique.files),
    // but without the common files.
    pageData.common.files
  ).map(fnMapRealPath)

  const getSize = gzipSize ? fsStatGzip : fsStat

  // Try to get the file size from the page data if available, otherwise do a
  // raw compute.
  const getCachedSize = async (file: string) => {
    const key = file.slice(distPath.length + 1)
    const size: number | undefined = stats.sizes.get(key)

    // If the size wasn't in the stats bundle, then get it from the file
    // directly.
    if (typeof size !== 'number') {
      return getSize(file)
    }

    return size
  }

  try {
    // Doesn't use `Promise.all`, as we'd double compute duplicate files. This
    // function is memoized, so the second one will instantly resolve.
    const allFilesSize = sum(await Promise.all(allFilesReal.map(getCachedSize)))
    const selfFilesSize = sum(
      await Promise.all(selfFilesReal.map(getCachedSize))
    )

    return [selfFilesSize, allFilesSize]
  } catch {}
  return [-1, -1]
}

type PageIsStaticResult = {
  isRoutePPREnabled?: boolean
  isStatic?: boolean
  isAmpOnly?: boolean
  isHybridAmp?: boolean
  hasServerProps?: boolean
  hasStaticProps?: boolean
  prerenderedRoutes: PrerenderedRoute[] | undefined
  prerenderFallbackMode: FallbackMode | undefined
  rootParamKeys: readonly string[] | undefined
  isNextImageImported?: boolean
  traceIncludes?: string[]
  traceExcludes?: string[]
  appConfig?: AppSegmentConfig
}

export async function isPageStatic({
  dir,
  page,
  distDir,
  configFileName,
  runtimeEnvConfig,
  httpAgentOptions,
  locales,
  defaultLocale,
  parentId,
  pageRuntime,
  edgeInfo,
  pageType,
  dynamicIO,
  authInterrupts,
  originalAppPath,
  isrFlushToDisk,
  maxMemoryCacheSize,
  nextConfigOutput,
  cacheHandler,
  cacheHandlers,
  cacheLifeProfiles,
  pprConfig,
  buildId,
  sriEnabled,
}: {
  dir: string
  page: string
  distDir: string
  dynamicIO: boolean
  authInterrupts: boolean
  configFileName: string
  runtimeEnvConfig: any
  httpAgentOptions: NextConfigComplete['httpAgentOptions']
  locales?: readonly string[]
  defaultLocale?: string
  parentId?: any
  edgeInfo?: any
  pageType?: 'pages' | 'app'
  pageRuntime?: ServerRuntime
  originalAppPath?: string
  isrFlushToDisk?: boolean
  maxMemoryCacheSize?: number
  cacheHandler?: string
  cacheHandlers?: Record<string, string | undefined>
  cacheLifeProfiles?: {
    [profile: string]: import('../server/use-cache/cache-life').CacheLife
  }
  nextConfigOutput: 'standalone' | 'export' | undefined
  pprConfig: ExperimentalPPRConfig | undefined
  buildId: string
  sriEnabled: boolean
}): Promise<PageIsStaticResult> {
  await createIncrementalCache({
    cacheHandler,
    cacheHandlers,
    distDir,
    dir,
    flushToDisk: isrFlushToDisk,
    cacheMaxMemorySize: maxMemoryCacheSize,
  })

  const isPageStaticSpan = trace('is-page-static-utils', parentId)
  return isPageStaticSpan
    .traceAsyncFn(async (): Promise<PageIsStaticResult> => {
      require('../shared/lib/runtime-config.external').setConfig(
        runtimeEnvConfig
      )
      setHttpClientAndAgentOptions({
        httpAgentOptions,
      })

      let componentsResult: LoadComponentsReturnType
      let prerenderedRoutes: PrerenderedRoute[] | undefined
      let prerenderFallbackMode: FallbackMode | undefined
      let appConfig: AppSegmentConfig = {}
      let rootParamKeys: readonly string[] | undefined
      let isClientComponent: boolean = false
      const pathIsEdgeRuntime = isEdgeRuntime(pageRuntime)

      if (pathIsEdgeRuntime) {
        const runtime = await getRuntimeContext({
          paths: edgeInfo.files.map((file: string) => path.join(distDir, file)),
          edgeFunctionEntry: {
            ...edgeInfo,
            wasm: (edgeInfo.wasm ?? []).map((binding: AssetBinding) => ({
              ...binding,
              filePath: path.join(distDir, binding.filePath),
            })),
          },
          name: edgeInfo.name,
          useCache: true,
          distDir,
        })
        const mod = (
          await runtime.context._ENTRIES[`middleware_${edgeInfo.name}`]
        ).ComponentMod

        // This is not needed during require.
        const buildManifest = {} as BuildManifest

        isClientComponent = isClientReference(mod)
        componentsResult = {
          Component: mod.default,
          Document: mod.Document,
          App: mod.App,
          routeModule: mod.routeModule,
          page,
          ComponentMod: mod,
          pageConfig: mod.config || {},
          buildManifest,
          reactLoadableManifest: {},
          getServerSideProps: mod.getServerSideProps,
          getStaticPaths: mod.getStaticPaths,
          getStaticProps: mod.getStaticProps,
        }
      } else {
        componentsResult = await loadComponents({
          distDir,
          page: originalAppPath || page,
          isAppPath: pageType === 'app',
          isDev: false,
          sriEnabled,
        })
      }
      const Comp = componentsResult.Component as NextComponentType | undefined

      const routeModule: RouteModule = componentsResult.routeModule

      let isRoutePPREnabled: boolean = false

      if (pageType === 'app') {
        const ComponentMod: AppPageModule = componentsResult.ComponentMod

        isClientComponent = isClientReference(componentsResult.ComponentMod)

        let segments
        try {
          segments = await collectSegments(componentsResult)
        } catch (err) {
          throw new Error(`Failed to collect configuration for ${page}`, {
            cause: err,
          })
        }

        appConfig = reduceAppConfig(segments)

        if (appConfig.dynamic === 'force-static' && pathIsEdgeRuntime) {
          Log.warn(
            `Page "${page}" is using runtime = 'edge' which is currently incompatible with dynamic = 'force-static'. Please remove either "runtime" or "force-static" for correct behavior`
          )
        }

        rootParamKeys = collectRootParamKeys(componentsResult)

        // A page supports partial prerendering if it is an app page and either
        // the whole app has PPR enabled or this page has PPR enabled when we're
        // in incremental mode.
        isRoutePPREnabled =
          routeModule.definition.kind === RouteKind.APP_PAGE &&
          !isInterceptionRouteAppPath(page) &&
          checkIsRoutePPREnabled(pprConfig, appConfig)

        // If force dynamic was set and we don't have PPR enabled, then set the
        // revalidate to 0.
        // TODO: (PPR) remove this once PPR is enabled by default
        if (appConfig.dynamic === 'force-dynamic' && !isRoutePPREnabled) {
          appConfig.revalidate = 0
        }

        // If the page is dynamic and we're not in edge runtime, then we need to
        // build the static paths. The edge runtime doesn't support static
        // paths.
        if (isDynamicRoute(page) && !pathIsEdgeRuntime) {
          ;({ prerenderedRoutes, fallbackMode: prerenderFallbackMode } =
            await buildAppStaticPaths({
              dir,
              page,
              dynamicIO,
              authInterrupts,
              segments,
              distDir,
              requestHeaders: {},
              isrFlushToDisk,
              maxMemoryCacheSize,
              cacheHandler,
              cacheLifeProfiles,
              ComponentMod,
              nextConfigOutput,
              isRoutePPREnabled,
              buildId,
              rootParamKeys,
            }))
        }
      } else {
        if (!Comp || !isValidElementType(Comp) || typeof Comp === 'string') {
          throw new Error('INVALID_DEFAULT_EXPORT')
        }
      }

      const hasGetInitialProps = !!Comp?.getInitialProps
      const hasStaticProps = !!componentsResult.getStaticProps
      const hasStaticPaths = !!componentsResult.getStaticPaths
      const hasServerProps = !!componentsResult.getServerSideProps

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

      if (hasStaticProps && hasStaticPaths) {
        ;({ prerenderedRoutes, fallbackMode: prerenderFallbackMode } =
          await buildPagesStaticPaths({
            page,
            locales,
            defaultLocale,
            configFileName,
            getStaticPaths: componentsResult.getStaticPaths!,
          }))
      }

      const isNextImageImported = (globalThis as any).__NEXT_IMAGE_IMPORTED
      const config: PageConfig = isClientComponent
        ? {}
        : componentsResult.pageConfig

      let isStatic = false
      if (!hasStaticProps && !hasGetInitialProps && !hasServerProps) {
        isStatic = true
      }

      // When PPR is enabled, any route may be completely static, so
      // mark this route as static.
      if (isRoutePPREnabled) {
        isStatic = true
      }

      return {
        isStatic,
        isRoutePPREnabled,
        isHybridAmp: config.amp === 'hybrid',
        isAmpOnly: config.amp === true,
        prerenderFallbackMode,
        prerenderedRoutes,
        rootParamKeys,
        hasStaticProps,
        hasServerProps,
        isNextImageImported,
        appConfig,
      }
    })
    .catch((err) => {
      if (err.message === 'INVALID_DEFAULT_EXPORT') {
        throw err
      }
      console.error(err)
      throw new Error(`Failed to collect page data for ${page}`)
    })
}

type ReducedAppConfig = Pick<
  AppSegmentConfig,
  | 'revalidate'
  | 'dynamic'
  | 'fetchCache'
  | 'preferredRegion'
  | 'experimental_ppr'
  | 'runtime'
  | 'maxDuration'
>

/**
 * Collect the app config from the generate param segments. This only gets a
 * subset of the config options.
 *
 * @param segments the generate param segments
 * @returns the reduced app config
 */
export function reduceAppConfig(
  segments: Pick<AppSegment, 'config'>[]
): ReducedAppConfig {
  const config: ReducedAppConfig = {}

  for (const segment of segments) {
    const {
      dynamic,
      fetchCache,
      preferredRegion,
      revalidate,
      experimental_ppr,
      runtime,
      maxDuration,
    } = segment.config || {}

    // TODO: should conflicting configs here throw an error
    // e.g. if layout defines one region but page defines another

    if (typeof preferredRegion !== 'undefined') {
      config.preferredRegion = preferredRegion
    }

    if (typeof dynamic !== 'undefined') {
      config.dynamic = dynamic
    }

    if (typeof fetchCache !== 'undefined') {
      config.fetchCache = fetchCache
    }

    if (typeof revalidate !== 'undefined') {
      config.revalidate = revalidate
    }

    // Any revalidate number overrides false, and shorter revalidate overrides
    // longer (initially).
    if (
      typeof revalidate === 'number' &&
      (typeof config.revalidate !== 'number' || revalidate < config.revalidate)
    ) {
      config.revalidate = revalidate
    }

    // If partial prerendering has been set, only override it if the current
    // value is provided as it's resolved from root layout to leaf page.
    if (typeof experimental_ppr !== 'undefined') {
      config.experimental_ppr = experimental_ppr
    }

    if (typeof runtime !== 'undefined') {
      config.runtime = runtime
    }

    if (typeof maxDuration !== 'undefined') {
      config.maxDuration = maxDuration
    }
  }

  return config
}

export async function hasCustomGetInitialProps({
  page,
  distDir,
  runtimeEnvConfig,
  checkingApp,
  sriEnabled,
}: {
  page: string
  distDir: string
  runtimeEnvConfig: any
  checkingApp: boolean
  sriEnabled: boolean
}): Promise<boolean> {
  require('../shared/lib/runtime-config.external').setConfig(runtimeEnvConfig)

  const components = await loadComponents({
    distDir,
    page: page,
    isAppPath: false,
    isDev: false,
    sriEnabled,
  })
  let mod = components.ComponentMod

  if (checkingApp) {
    mod = (await mod._app) || mod.default || mod
  } else {
    mod = mod.default || mod
  }
  mod = await mod
  return mod.getInitialProps !== mod.origGetInitialProps
}

export async function getDefinedNamedExports({
  page,
  distDir,
  runtimeEnvConfig,
  sriEnabled,
}: {
  page: string
  distDir: string
  runtimeEnvConfig: any
  sriEnabled: boolean
}): Promise<ReadonlyArray<string>> {
  require('../shared/lib/runtime-config.external').setConfig(runtimeEnvConfig)
  const components = await loadComponents({
    distDir,
    page: page,
    isAppPath: false,
    isDev: false,
    sriEnabled,
  })

  return Object.keys(components.ComponentMod).filter((key) => {
    return typeof components.ComponentMod[key] !== 'undefined'
  })
}

export function detectConflictingPaths(
  combinedPages: string[],
  ssgPages: Set<string>,
  additionalGeneratedSSGPaths: Map<string, string[]>
) {
  const conflictingPaths = new Map<
    string,
    Array<{
      path: string
      page: string
    }>
  >()

  const dynamicSsgPages = [...ssgPages].filter((page) => isDynamicRoute(page))
  const additionalSsgPathsByPath: {
    [page: string]: { [path: string]: string }
  } = {}

  additionalGeneratedSSGPaths.forEach((paths, pathsPage) => {
    additionalSsgPathsByPath[pathsPage] ||= {}
    paths.forEach((curPath) => {
      const currentPath = curPath.toLowerCase()
      additionalSsgPathsByPath[pathsPage][currentPath] = curPath
    })
  })

  additionalGeneratedSSGPaths.forEach((paths, pathsPage) => {
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

          conflictingPath =
            additionalGeneratedSSGPaths.get(page) == null
              ? undefined
              : additionalSsgPathsByPath[page][lowerPath]
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

export async function copyTracedFiles(
  dir: string,
  distDir: string,
  pageKeys: readonly string[],
  appPageKeys: readonly string[] | undefined,
  tracingRoot: string,
  serverConfig: NextConfigComplete,
  middlewareManifest: MiddlewareManifest,
  hasNodeMiddleware: boolean,
  hasInstrumentationHook: boolean,
  staticPages: Set<string>
) {
  const outputPath = path.join(distDir, 'standalone')
  let moduleType = false
  const nextConfig = {
    ...serverConfig,
    distDir: `./${path.relative(dir, distDir)}`,
  }
  try {
    const packageJsonPath = path.join(distDir, '../package.json')
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))
    moduleType = packageJson.type === 'module'
  } catch {}
  const copiedFiles = new Set()
  await fs.rm(outputPath, { recursive: true, force: true })

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
            try {
              await fs.symlink(symlink, fileOutputPath)
            } catch (e: any) {
              if (e.code !== 'EEXIST') {
                throw e
              }
            }
          } else {
            await fs.copyFile(tracedFilePath, fileOutputPath)
          }
        }

        await copySema.release()
      })
    )
  }

  async function handleEdgeFunction(page: EdgeFunctionDefinition) {
    async function handleFile(file: string) {
      const originalPath = path.join(distDir, file)
      const fileOutputPath = path.join(
        outputPath,
        path.relative(tracingRoot, distDir),
        file
      )
      await fs.mkdir(path.dirname(fileOutputPath), { recursive: true })
      await fs.copyFile(originalPath, fileOutputPath)
    }
    await Promise.all([
      page.files.map(handleFile),
      page.wasm?.map((file) => handleFile(file.filePath)),
      page.assets?.map((file) => handleFile(file.filePath)),
    ])
  }

  const edgeFunctionHandlers: Promise<any>[] = []

  for (const middleware of Object.values(middlewareManifest.middleware)) {
    if (isMiddlewareFilename(middleware.name)) {
      edgeFunctionHandlers.push(handleEdgeFunction(middleware))
    }
  }

  for (const page of Object.values(middlewareManifest.functions)) {
    edgeFunctionHandlers.push(handleEdgeFunction(page))
  }

  await Promise.all(edgeFunctionHandlers)

  for (const page of pageKeys) {
    if (middlewareManifest.functions.hasOwnProperty(page)) {
      continue
    }
    const route = normalizePagePath(page)

    if (staticPages.has(route)) {
      continue
    }

    const pageFile = path.join(
      distDir,
      'server',
      'pages',
      `${normalizePagePath(page)}.js`
    )
    const pageTraceFile = `${pageFile}.nft.json`
    await handleTraceFiles(pageTraceFile).catch((err) => {
      if (err.code !== 'ENOENT' || (page !== '/404' && page !== '/500')) {
        Log.warn(`Failed to copy traced files for ${pageFile}`, err)
      }
    })
  }

  if (hasNodeMiddleware) {
    const middlewareFile = path.join(distDir, 'server', 'middleware.js')
    const middlewareTrace = `${middlewareFile}.nft.json`
    await handleTraceFiles(middlewareTrace)
  }

  if (appPageKeys) {
    for (const page of appPageKeys) {
      if (middlewareManifest.functions.hasOwnProperty(page)) {
        continue
      }
      const pageFile = path.join(distDir, 'server', 'app', `${page}.js`)
      const pageTraceFile = `${pageFile}.nft.json`
      await handleTraceFiles(pageTraceFile).catch((err) => {
        Log.warn(`Failed to copy traced files for ${pageFile}`, err)
      })
    }
  }

  if (hasInstrumentationHook) {
    await handleTraceFiles(
      path.join(distDir, 'server', 'instrumentation.js.nft.json')
    )
  }

  await handleTraceFiles(path.join(distDir, 'next-server.js.nft.json'))
  const serverOutputPath = path.join(
    outputPath,
    path.relative(tracingRoot, dir),
    'server.js'
  )
  await fs.mkdir(path.dirname(serverOutputPath), { recursive: true })

  await fs.writeFile(
    serverOutputPath,
    `${
      moduleType
        ? `performance.mark('next-start');
import path from 'path'
import { fileURLToPath } from 'url'
import module from 'module'
const require = module.createRequire(import.meta.url)
const __dirname = fileURLToPath(new URL('.', import.meta.url))
`
        : `const path = require('path')`
    }

const dir = path.join(__dirname)

process.env.NODE_ENV = 'production'
process.chdir(__dirname)

const currentPort = parseInt(process.env.PORT, 10) || 3000
const hostname = process.env.HOSTNAME || '0.0.0.0'

let keepAliveTimeout = parseInt(process.env.KEEP_ALIVE_TIMEOUT, 10)
const nextConfig = ${JSON.stringify(nextConfig)}

process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig)

require('next')
const { startServer } = require('next/dist/server/lib/start-server')

if (
  Number.isNaN(keepAliveTimeout) ||
  !Number.isFinite(keepAliveTimeout) ||
  keepAliveTimeout < 0
) {
  keepAliveTimeout = undefined
}

startServer({
  dir,
  isDev: false,
  config: nextConfig,
  hostname,
  port: currentPort,
  allowRetry: false,
  keepAliveTimeout,
}).catch((err) => {
  console.error(err);
  process.exit(1);
});`
  )
}

export function isReservedPage(page: string) {
  return RESERVED_PAGE.test(page)
}

export function isAppBuiltinNotFoundPage(page: string) {
  return /next[\\/]dist[\\/]client[\\/]components[\\/]not-found-error/.test(
    page
  )
}

export function isCustomErrorPage(page: string) {
  return page === '/404' || page === '/500'
}

export function isMiddlewareFile(file: string) {
  return (
    file === `/${MIDDLEWARE_FILENAME}` || file === `/src/${MIDDLEWARE_FILENAME}`
  )
}

export function isInstrumentationHookFile(file: string) {
  return (
    file === `/${INSTRUMENTATION_HOOK_FILENAME}` ||
    file === `/src/${INSTRUMENTATION_HOOK_FILENAME}`
  )
}

export function getPossibleInstrumentationHookFilenames(
  folder: string,
  extensions: string[]
) {
  const files = []
  for (const extension of extensions) {
    files.push(
      path.join(folder, `${INSTRUMENTATION_HOOK_FILENAME}.${extension}`),
      path.join(folder, `src`, `${INSTRUMENTATION_HOOK_FILENAME}.${extension}`)
    )
  }

  return files
}

export function getPossibleMiddlewareFilenames(
  folder: string,
  extensions: string[]
) {
  return extensions.map((extension) =>
    path.join(folder, `${MIDDLEWARE_FILENAME}.${extension}`)
  )
}

export class NestedMiddlewareError extends Error {
  constructor(
    nestedFileNames: string[],
    mainDir: string,
    pagesOrAppDir: string
  ) {
    super(
      `Nested Middleware is not allowed, found:\n` +
        `${nestedFileNames.map((file) => `pages${file}`).join('\n')}\n` +
        `Please move your code to a single file at ${path.join(
          path.posix.sep,
          path.relative(mainDir, path.resolve(pagesOrAppDir, '..')),
          'middleware'
        )} instead.\n` +
        `Read More - https://nextjs.org/docs/messages/nested-middleware`
    )
  }
}

export function getSupportedBrowsers(
  dir: string,
  isDevelopment: boolean
): string[] {
  let browsers: any
  try {
    const browsersListConfig = browserslist.loadConfig({
      path: dir,
      env: isDevelopment ? 'development' : 'production',
    })
    // Running `browserslist` resolves `extends` and other config features into a list of browsers
    if (browsersListConfig && browsersListConfig.length > 0) {
      browsers = browserslist(browsersListConfig)
    }
  } catch {}

  // When user has browserslist use that target
  if (browsers && browsers.length > 0) {
    return browsers
  }

  // Uses modern browsers as the default.
  return MODERN_BROWSERSLIST_TARGET
}

export function isWebpackServerOnlyLayer(
  layer: WebpackLayerName | null | undefined
): boolean {
  return Boolean(
    layer && WEBPACK_LAYERS.GROUP.serverOnly.includes(layer as any)
  )
}

export function isWebpackClientOnlyLayer(
  layer: WebpackLayerName | null | undefined
): boolean {
  return Boolean(
    layer && WEBPACK_LAYERS.GROUP.clientOnly.includes(layer as any)
  )
}

export function isWebpackDefaultLayer(
  layer: WebpackLayerName | null | undefined
): boolean {
  return (
    layer === null ||
    layer === undefined ||
    layer === WEBPACK_LAYERS.pagesDirBrowser ||
    layer === WEBPACK_LAYERS.pagesDirEdge ||
    layer === WEBPACK_LAYERS.pagesDirNode
  )
}

export function isWebpackBundledLayer(
  layer: WebpackLayerName | null | undefined
): boolean {
  return Boolean(layer && WEBPACK_LAYERS.GROUP.bundled.includes(layer as any))
}

export function isWebpackAppPagesLayer(
  layer: WebpackLayerName | null | undefined
): boolean {
  return Boolean(layer && WEBPACK_LAYERS.GROUP.appPages.includes(layer as any))
}

export function collectMeta({
  status,
  headers,
}: {
  status?: number
  headers?: OutgoingHttpHeaders
}): {
  status?: number
  headers?: Record<string, string>
} {
  const meta: {
    status?: number
    headers?: Record<string, string>
  } = {}

  if (status !== 200) {
    meta.status = status
  }

  if (headers && Object.keys(headers).length) {
    meta.headers = {}

    // normalize header values as initialHeaders
    // must be Record<string, string>
    for (const key in headers) {
      // set-cookie is already handled - the middleware cookie setting case
      // isn't needed for the prerender manifest since it can't read cookies
      if (key === 'x-middleware-set-cookie') continue

      let value = headers[key]

      if (Array.isArray(value)) {
        if (key === 'set-cookie') {
          value = value.join(',')
        } else {
          value = value[value.length - 1]
        }
      }

      if (typeof value === 'string') {
        meta.headers[key] = value
      }
    }
  }

  return meta
}
