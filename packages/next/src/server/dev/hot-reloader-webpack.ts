import type { NextConfigComplete } from '../config-shared'
import type { CustomRoutes } from '../../lib/load-custom-routes'
import type { Duplex } from 'stream'
import type { Telemetry } from '../../telemetry/storage'
import type { IncomingMessage, ServerResponse } from 'http'
import type { UrlObject } from 'url'
import type { RouteDefinition } from '../future/route-definitions/route-definition'

import { webpack, StringXor } from 'next/dist/compiled/webpack/webpack'
import { getOverlayMiddleware } from 'next/dist/compiled/@next/react-dev-overlay/dist/middleware'
import { WebpackHotMiddleware } from './hot-middleware'
import { join, relative, isAbsolute, posix } from 'path'
import {
  createEntrypoints,
  createPagesMapping,
  finalizeEntrypoint,
  getClientEntry,
  getEdgeServerEntry,
  getAppEntry,
  runDependingOnPageType,
  getStaticInfoIncludingLayouts,
  getInstrumentationEntry,
} from '../../build/entries'
import { watchCompilers } from '../../build/output'
import * as Log from '../../build/output/log'
import getBaseWebpackConfig, {
  loadProjectInfo,
} from '../../build/webpack-config'
import { APP_DIR_ALIAS, WEBPACK_LAYERS } from '../../lib/constants'
import { recursiveDelete } from '../../lib/recursive-delete'
import {
  BLOCKED_PAGES,
  CLIENT_STATIC_FILES_RUNTIME_AMP,
  CLIENT_STATIC_FILES_RUNTIME_MAIN,
  CLIENT_STATIC_FILES_RUNTIME_MAIN_APP,
  CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH,
  COMPILER_NAMES,
  RSC_MODULE_TYPES,
} from '../../shared/lib/constants'
import type { __ApiPreviewProps } from '../api-utils'
import { getPathMatch } from '../../shared/lib/router/utils/path-match'
import { findPageFile } from '../lib/find-page-file'
import {
  BUILDING,
  getEntries,
  EntryTypes,
  getInvalidator,
  onDemandEntryHandler,
} from './on-demand-entry-handler'
import { denormalizePagePath } from '../../shared/lib/page-path/denormalize-page-path'
import { normalizePathSep } from '../../shared/lib/page-path/normalize-path-sep'
import getRouteFromEntrypoint from '../get-route-from-entrypoint'
import {
  difference,
  isInstrumentationHookFile,
  isMiddlewareFile,
  isMiddlewareFilename,
} from '../../build/utils'
import { DecodeError } from '../../shared/lib/utils'
import { type Span, trace } from '../../trace'
import { getProperError } from '../../lib/is-error'
import ws from 'next/dist/compiled/ws'
import { existsSync, promises as fs } from 'fs'
import type { UnwrapPromise } from '../../lib/coalesced-function'
import { getRegistry } from '../../lib/helpers/get-registry'
import { parseVersionInfo } from './parse-version-info'
import type { VersionInfo } from './parse-version-info'
import { isAPIRoute } from '../../lib/is-api-route'
import { getRouteLoaderEntry } from '../../build/webpack/loaders/next-route-loader'
import {
  isInternalComponent,
  isNonRoutePagesPage,
} from '../../lib/is-internal-component'
import { RouteKind } from '../future/route-kind'
import {
  HMR_ACTIONS_SENT_TO_BROWSER,
  type NextJsHotReloaderInterface,
} from './hot-reloader-types'
import type { HMR_ACTION_TYPES } from './hot-reloader-types'
import type { WebpackError } from 'webpack'
import { PAGE_TYPES } from '../../lib/page-types'

const MILLISECONDS_IN_NANOSECOND = 1_000_000
const isTestMode = !!(
  process.env.NEXT_TEST_MODE ||
  process.env.__NEXT_TEST_MODE ||
  process.env.DEBUG
)

function diff(a: Set<any>, b: Set<any>) {
  return new Set([...a].filter((v) => !b.has(v)))
}

const wsServer = new ws.Server({ noServer: true })

export async function renderScriptError(
  res: ServerResponse,
  error: Error,
  { verbose = true } = {}
): Promise<{ finished: true | undefined }> {
  // Asks CDNs and others to not to cache the errored page
  res.setHeader(
    'Cache-Control',
    'no-cache, no-store, max-age=0, must-revalidate'
  )

  if ((error as any).code === 'ENOENT') {
    return { finished: undefined }
  }

  if (verbose) {
    console.error(error.stack)
  }
  res.statusCode = 500
  res.end('500 - Internal Error')
  return { finished: true }
}

function addCorsSupport(req: IncomingMessage, res: ServerResponse) {
  // Only rewrite CORS handling when URL matches a hot-reloader middleware
  if (!req.url!.startsWith('/__next')) {
    return { preflight: false }
  }

  if (!req.headers.origin) {
    return { preflight: false }
  }

  res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET')
  // Based on https://github.com/primus/access-control/blob/4cf1bc0e54b086c91e6aa44fb14966fa5ef7549c/index.js#L158
  if (req.headers['access-control-request-headers']) {
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] as string
    )
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return { preflight: true }
  }

  return { preflight: false }
}

export const matchNextPageBundleRequest = getPathMatch(
  '/_next/static/chunks/pages/:path*.js(\\.map|)'
)

// Iteratively look up the issuer till it ends up at the root
function findEntryModule(
  module: webpack.Module,
  compilation: webpack.Compilation
): any {
  for (;;) {
    const issuer = compilation.moduleGraph.getIssuer(module)
    if (!issuer) return module
    module = issuer
  }
}

function erroredPages(compilation: webpack.Compilation) {
  const failedPages: { [page: string]: WebpackError[] } = {}
  for (const error of compilation.errors) {
    if (!error.module) {
      continue
    }

    const entryModule = findEntryModule(error.module, compilation)
    const { name } = entryModule
    if (!name) {
      continue
    }

    // Only pages have to be reloaded
    const enhancedName = getRouteFromEntrypoint(name)

    if (!enhancedName) {
      continue
    }

    if (!failedPages[enhancedName]) {
      failedPages[enhancedName] = []
    }

    failedPages[enhancedName].push(error)
  }

  return failedPages
}

export async function getVersionInfo(enabled: boolean): Promise<VersionInfo> {
  let installed = '0.0.0'

  if (!enabled) {
    return { installed, staleness: 'unknown' }
  }

  try {
    installed = require('next/package.json').version

    const registry = getRegistry()
    const res = await fetch(`${registry}-/package/next/dist-tags`)

    if (!res.ok) return { installed, staleness: 'unknown' }

    const tags = await res.json()

    return parseVersionInfo({
      installed,
      latest: tags.latest,
      canary: tags.canary,
    })
  } catch (e) {
    console.error('parse version e', e)
    return { installed, staleness: 'unknown' }
  }
}

export default class HotReloaderWebpack implements NextJsHotReloaderInterface {
  private hasAmpEntrypoints: boolean
  private hasAppRouterEntrypoints: boolean
  private hasPagesRouterEntrypoints: boolean
  private dir: string
  private buildId: string
  private interceptors: any[]
  private pagesDir?: string
  private distDir: string
  private webpackHotMiddleware?: WebpackHotMiddleware
  private config: NextConfigComplete
  private clientStats: webpack.Stats | null
  private clientError: Error | null = null
  private serverError: Error | null = null
  private hmrServerError: Error | null = null
  private serverPrevDocumentHash: string | null
  private serverChunkNames?: Set<string>
  private prevChunkNames?: Set<any>
  private onDemandEntries?: ReturnType<typeof onDemandEntryHandler>
  private previewProps: __ApiPreviewProps
  private watcher: any
  private rewrites: CustomRoutes['rewrites']
  private fallbackWatcher: any
  private hotReloaderSpan: Span
  private pagesMapping: { [key: string]: string } = {}
  private appDir?: string
  private telemetry: Telemetry
  private versionInfo: VersionInfo = {
    staleness: 'unknown',
    installed: '0.0.0',
  }
  private reloadAfterInvalidation: boolean = false

  public serverStats: webpack.Stats | null
  public edgeServerStats: webpack.Stats | null
  public multiCompiler?: webpack.MultiCompiler
  public activeWebpackConfigs?: Array<
    UnwrapPromise<ReturnType<typeof getBaseWebpackConfig>>
  >

  constructor(
    dir: string,
    {
      config,
      pagesDir,
      distDir,
      buildId,
      previewProps,
      rewrites,
      appDir,
      telemetry,
    }: {
      config: NextConfigComplete
      pagesDir?: string
      distDir: string
      buildId: string
      previewProps: __ApiPreviewProps
      rewrites: CustomRoutes['rewrites']
      appDir?: string
      telemetry: Telemetry
    }
  ) {
    this.hasAmpEntrypoints = false
    this.hasAppRouterEntrypoints = false
    this.hasPagesRouterEntrypoints = false
    this.buildId = buildId
    this.dir = dir
    this.interceptors = []
    this.pagesDir = pagesDir
    this.appDir = appDir
    this.distDir = distDir
    this.clientStats = null
    this.serverStats = null
    this.edgeServerStats = null
    this.serverPrevDocumentHash = null
    this.telemetry = telemetry

    this.config = config
    this.previewProps = previewProps
    this.rewrites = rewrites
    this.hotReloaderSpan = trace('hot-reloader', undefined, {
      version: process.env.__NEXT_VERSION as string,
    })
    // Ensure the hotReloaderSpan is flushed immediately as it's the parentSpan for all processing
    // of the current `next dev` invocation.
    this.hotReloaderSpan.stop()
  }

  public async run(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: UrlObject
  ): Promise<{ finished?: true }> {
    // Usually CORS support is not needed for the hot-reloader (this is dev only feature)
    // With when the app runs for multi-zones support behind a proxy,
    // the current page is trying to access this URL via assetPrefix.
    // That's when the CORS support is needed.
    const { preflight } = addCorsSupport(req, res)
    if (preflight) {
      return {}
    }

    // When a request comes in that is a page bundle, e.g. /_next/static/<buildid>/pages/index.js
    // we have to compile the page using on-demand-entries, this middleware will handle doing that
    // by adding the page to on-demand-entries, waiting till it's done
    // and then the bundle will be served like usual by the actual route in server/index.js
    const handlePageBundleRequest = async (
      pageBundleRes: ServerResponse,
      parsedPageBundleUrl: UrlObject
    ): Promise<{ finished?: true }> => {
      const { pathname } = parsedPageBundleUrl
      const params = matchNextPageBundleRequest(pathname)
      if (!params) {
        return {}
      }

      let decodedPagePath: string

      try {
        decodedPagePath = `/${params.path
          .map((param: string) => decodeURIComponent(param))
          .join('/')}`
      } catch (_) {
        throw new DecodeError('failed to decode param')
      }

      const page = denormalizePagePath(decodedPagePath)

      if (page === '/_error' || BLOCKED_PAGES.indexOf(page) === -1) {
        try {
          await this.ensurePage({ page, clientOnly: true, url: req.url })
        } catch (error) {
          return await renderScriptError(pageBundleRes, getProperError(error))
        }

        const errors = await this.getCompilationErrors(page)
        if (errors.length > 0) {
          return await renderScriptError(pageBundleRes, errors[0], {
            verbose: false,
          })
        }
      }

      return {}
    }

    const { finished } = await handlePageBundleRequest(res, parsedUrl)

    for (const fn of this.interceptors) {
      await new Promise<void>((resolve, reject) => {
        fn(req, res, (err: Error) => {
          if (err) return reject(err)
          resolve()
        })
      })
    }

    return { finished }
  }

  public setHmrServerError(error: Error | null): void {
    this.hmrServerError = error
  }

  public clearHmrServerError(): void {
    if (this.hmrServerError) {
      this.setHmrServerError(null)
      this.send({ action: HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE })
    }
  }

  protected async refreshServerComponents(): Promise<void> {
    this.send({
      action: HMR_ACTIONS_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
      // TODO: granular reloading of changes
      // entrypoints: serverComponentChanges,
    })
  }

  public onHMR(req: IncomingMessage, _socket: Duplex, head: Buffer) {
    wsServer.handleUpgrade(req, req.socket, head, (client) => {
      this.webpackHotMiddleware?.onHMR(client)
      this.onDemandEntries?.onHMR(client, () => this.hmrServerError)

      client.addEventListener('message', ({ data }) => {
        data = typeof data !== 'string' ? data.toString() : data

        try {
          const payload = JSON.parse(data)

          let traceChild:
            | {
                name: string
                startTime?: bigint
                endTime?: bigint
                attrs?: Record<string, number | string | undefined | string[]>
              }
            | undefined

          switch (payload.event) {
            case 'span-end': {
              traceChild = {
                name: payload.spanName,
                startTime:
                  BigInt(Math.floor(payload.startTime)) *
                  BigInt(MILLISECONDS_IN_NANOSECOND),
                attrs: payload.attributes,
                endTime:
                  BigInt(Math.floor(payload.endTime)) *
                  BigInt(MILLISECONDS_IN_NANOSECOND),
              }
              break
            }
            case 'client-hmr-latency': {
              traceChild = {
                name: payload.event,
                startTime:
                  BigInt(payload.startTime) *
                  BigInt(MILLISECONDS_IN_NANOSECOND),
                endTime:
                  BigInt(payload.endTime) * BigInt(MILLISECONDS_IN_NANOSECOND),
                attrs: {
                  updatedModules: payload.updatedModules.map((m: string) =>
                    m
                      .replace(`(${WEBPACK_LAYERS.appPagesBrowser})/`, '')
                      .replace(/^\.\//, '[project]/')
                  ),
                  page: payload.page,
                  isPageHidden: payload.isPageHidden,
                },
              }
              break
            }
            case 'client-reload-page':
            case 'client-success': {
              traceChild = {
                name: payload.event,
              }
              break
            }
            case 'client-error': {
              traceChild = {
                name: payload.event,
                attrs: { errorCount: payload.errorCount },
              }
              break
            }
            case 'client-warning': {
              traceChild = {
                name: payload.event,
                attrs: { warningCount: payload.warningCount },
              }
              break
            }
            case 'client-removed-page':
            case 'client-added-page': {
              traceChild = {
                name: payload.event,
                attrs: { page: payload.page || '' },
              }
              break
            }
            case 'client-full-reload': {
              const { event, stackTrace, hadRuntimeError } = payload

              traceChild = {
                name: event,
                attrs: { stackTrace: stackTrace ?? '' },
              }

              if (hadRuntimeError) {
                Log.warn(
                  `Fast Refresh had to perform a full reload due to a runtime error.`
                )
                break
              }

              let fileMessage = ''
              if (stackTrace) {
                const file = /Aborted because (.+) is not accepted/.exec(
                  stackTrace
                )?.[1]
                if (file) {
                  // `file` is filepath in `pages/` but it can be weird long webpack url in `app/`.
                  // If it's a webpack loader URL, it will start with '(app-pages)/./'
                  if (
                    file.startsWith(`(${WEBPACK_LAYERS.appPagesBrowser})/./`)
                  ) {
                    const fileUrl = new URL(file, 'file://')
                    const cwd = process.cwd()
                    const modules = fileUrl.searchParams
                      .getAll('modules')
                      .map((filepath) => filepath.slice(cwd.length + 1))
                      .filter(
                        (filepath) => !filepath.startsWith('node_modules')
                      )

                    if (modules.length > 0) {
                      fileMessage = ` when ${modules.join(', ')} changed`
                    }
                  } else {
                    fileMessage = ` when ${file} changed`
                  }
                }
              }

              Log.warn(
                `Fast Refresh had to perform a full reload${fileMessage}. Read more: https://nextjs.org/docs/messages/fast-refresh-reload`
              )
              break
            }
            default: {
              break
            }
          }

          if (traceChild) {
            this.hotReloaderSpan.manualTraceChild(
              traceChild.name,
              traceChild.startTime || process.hrtime.bigint(),
              traceChild.endTime || process.hrtime.bigint(),
              { ...traceChild.attrs, clientId: payload.id }
            )
          }
        } catch (_) {
          // invalid WebSocket message
        }
      })
    })
  }

  private async clean(span: Span): Promise<void> {
    return span
      .traceChild('clean')
      .traceAsyncFn(() =>
        recursiveDelete(join(this.dir, this.config.distDir), /^cache/)
      )
  }

  private async getWebpackConfig(span: Span) {
    const webpackConfigSpan = span.traceChild('get-webpack-config')

    const pageExtensions = this.config.pageExtensions

    return webpackConfigSpan.traceAsyncFn(async () => {
      const pagePaths = !this.pagesDir
        ? ([] as (string | null)[])
        : await webpackConfigSpan
            .traceChild('get-page-paths')
            .traceAsyncFn(() =>
              Promise.all([
                findPageFile(this.pagesDir!, '/_app', pageExtensions, false),
                findPageFile(
                  this.pagesDir!,
                  '/_document',
                  pageExtensions,
                  false
                ),
              ])
            )

      this.pagesMapping = webpackConfigSpan
        .traceChild('create-pages-mapping')
        .traceFn(() =>
          createPagesMapping({
            isDev: true,
            pageExtensions: this.config.pageExtensions,
            pagesType: PAGE_TYPES.PAGES,
            pagePaths: pagePaths.filter(
              (i: string | null): i is string => typeof i === 'string'
            ),
            pagesDir: this.pagesDir,
          })
        )

      const entrypoints = await webpackConfigSpan
        .traceChild('create-entrypoints')
        .traceAsyncFn(() =>
          createEntrypoints({
            appDir: this.appDir,
            buildId: this.buildId,
            config: this.config,
            envFiles: [],
            isDev: true,
            pages: this.pagesMapping,
            pagesDir: this.pagesDir,
            previewMode: this.previewProps,
            rootDir: this.dir,
            pageExtensions: this.config.pageExtensions,
          })
        )

      const commonWebpackOptions = {
        dev: true,
        buildId: this.buildId,
        config: this.config,
        pagesDir: this.pagesDir,
        rewrites: this.rewrites,
        originalRewrites: this.config._originalRewrites,
        originalRedirects: this.config._originalRedirects,
        runWebpackSpan: this.hotReloaderSpan,
        appDir: this.appDir,
      }

      return webpackConfigSpan
        .traceChild('generate-webpack-config')
        .traceAsyncFn(async () => {
          const info = await loadProjectInfo({
            dir: this.dir,
            config: commonWebpackOptions.config,
            dev: true,
          })
          return Promise.all([
            // order is important here
            getBaseWebpackConfig(this.dir, {
              ...commonWebpackOptions,
              compilerType: COMPILER_NAMES.client,
              entrypoints: entrypoints.client,
              ...info,
            }),
            getBaseWebpackConfig(this.dir, {
              ...commonWebpackOptions,
              compilerType: COMPILER_NAMES.server,
              entrypoints: entrypoints.server,
              ...info,
            }),
            getBaseWebpackConfig(this.dir, {
              ...commonWebpackOptions,
              compilerType: COMPILER_NAMES.edgeServer,
              entrypoints: entrypoints.edgeServer,
              ...info,
            }),
          ])
        })
    })
  }

  public async buildFallbackError(): Promise<void> {
    if (this.fallbackWatcher) return

    const info = await loadProjectInfo({
      dir: this.dir,
      config: this.config,
      dev: true,
    })
    const fallbackConfig = await getBaseWebpackConfig(this.dir, {
      runWebpackSpan: this.hotReloaderSpan,
      dev: true,
      compilerType: COMPILER_NAMES.client,
      config: this.config,
      buildId: this.buildId,
      pagesDir: this.pagesDir,
      rewrites: {
        beforeFiles: [],
        afterFiles: [],
        fallback: [],
      },
      originalRewrites: {
        beforeFiles: [],
        afterFiles: [],
        fallback: [],
      },
      originalRedirects: [],
      isDevFallback: true,
      entrypoints: (
        await createEntrypoints({
          appDir: this.appDir,
          buildId: this.buildId,
          config: this.config,
          envFiles: [],
          isDev: true,
          pages: {
            '/_app': 'next/dist/pages/_app',
            '/_error': 'next/dist/pages/_error',
          },
          pagesDir: this.pagesDir,
          previewMode: this.previewProps,
          rootDir: this.dir,
          pageExtensions: this.config.pageExtensions,
        })
      ).client,
      ...info,
    })
    const fallbackCompiler = webpack(fallbackConfig)

    this.fallbackWatcher = await new Promise((resolve) => {
      let bootedFallbackCompiler = false
      fallbackCompiler.watch(
        // @ts-ignore webpack supports an array of watchOptions when using a multiCompiler
        fallbackConfig.watchOptions,
        // Errors are handled separately
        (_err: any) => {
          if (!bootedFallbackCompiler) {
            bootedFallbackCompiler = true
            resolve(true)
          }
        }
      )
    })
  }

  private async tracedGetVersionInfo(span: Span, enabled: boolean) {
    const versionInfoSpan = span.traceChild('get-version-info')
    return versionInfoSpan.traceAsyncFn<VersionInfo>(async () =>
      getVersionInfo(enabled)
    )
  }

  public async start(): Promise<void> {
    const startSpan = this.hotReloaderSpan.traceChild('start')
    startSpan.stop() // Stop immediately to create an artificial parent span

    this.versionInfo = await this.tracedGetVersionInfo(
      startSpan,
      isTestMode || this.telemetry.isEnabled
    )

    await this.clean(startSpan)
    // Ensure distDir exists before writing package.json
    await fs.mkdir(this.distDir, { recursive: true })

    const distPackageJsonPath = join(this.distDir, 'package.json')
    // Ensure commonjs handling is used for files in the distDir (generally .next)
    // Files outside of the distDir can be "type": "module"
    await fs.writeFile(distPackageJsonPath, '{"type": "commonjs"}')

    this.activeWebpackConfigs = await this.getWebpackConfig(startSpan)

    for (const config of this.activeWebpackConfigs) {
      const defaultEntry = config.entry
      config.entry = async (...args) => {
        const outputPath = this.multiCompiler?.outputPath || ''
        const entries = getEntries(outputPath)
        // @ts-ignore entry is always a function
        const entrypoints = await defaultEntry(...args)
        const isClientCompilation = config.name === COMPILER_NAMES.client
        const isNodeServerCompilation = config.name === COMPILER_NAMES.server
        const isEdgeServerCompilation =
          config.name === COMPILER_NAMES.edgeServer

        await Promise.all(
          Object.keys(entries).map(async (entryKey) => {
            const entryData = entries[entryKey]
            const { bundlePath, dispose } = entryData

            const result =
              /^(client|server|edge-server)@(app|pages|root)@(.*)/g.exec(
                entryKey
              )
            const [, key /* pageType */, , page] = result! // this match should always happen

            if (key === COMPILER_NAMES.client && !isClientCompilation) return
            if (key === COMPILER_NAMES.server && !isNodeServerCompilation)
              return
            if (key === COMPILER_NAMES.edgeServer && !isEdgeServerCompilation)
              return

            const isEntry = entryData.type === EntryTypes.ENTRY
            const isChildEntry = entryData.type === EntryTypes.CHILD_ENTRY

            // Check if the page was removed or disposed and remove it
            if (isEntry) {
              const pageExists =
                !dispose && existsSync(entryData.absolutePagePath)
              if (!pageExists) {
                delete entries[entryKey]
                return
              }
            }

            // For child entries, if it has an entry file and it's gone, remove it
            if (isChildEntry) {
              if (entryData.absoluteEntryFilePath) {
                const pageExists =
                  !dispose && existsSync(entryData.absoluteEntryFilePath)
                if (!pageExists) {
                  delete entries[entryKey]
                  return
                }
              }
            }

            // Ensure _error is considered a `pages` page.
            if (page === '/_error') {
              this.hasPagesRouterEntrypoints = true
            }

            const hasAppDir = !!this.appDir
            const isAppPath = hasAppDir && bundlePath.startsWith('app/')
            const staticInfo = isEntry
              ? await getStaticInfoIncludingLayouts({
                  isInsideAppDir: isAppPath,
                  pageExtensions: this.config.pageExtensions,
                  pageFilePath: entryData.absolutePagePath,
                  appDir: this.appDir,
                  config: this.config,
                  isDev: true,
                  page,
                })
              : {}

            if (staticInfo.amp === true || staticInfo.amp === 'hybrid') {
              this.hasAmpEntrypoints = true
            }
            const isServerComponent =
              isAppPath && staticInfo.rsc !== RSC_MODULE_TYPES.client

            const pageType: PAGE_TYPES = entryData.bundlePath.startsWith(
              'pages/'
            )
              ? PAGE_TYPES.PAGES
              : entryData.bundlePath.startsWith('app/')
              ? PAGE_TYPES.APP
              : PAGE_TYPES.ROOT

            if (pageType === 'pages') {
              this.hasPagesRouterEntrypoints = true
            }
            if (pageType === 'app') {
              this.hasAppRouterEntrypoints = true
            }

            const isInstrumentation =
              isInstrumentationHookFile(page) && pageType === PAGE_TYPES.ROOT

            runDependingOnPageType({
              page,
              pageRuntime: staticInfo.runtime,
              pageType,
              onEdgeServer: () => {
                // TODO-APP: verify if child entry should support.
                if (!isEdgeServerCompilation || !isEntry) return
                entries[entryKey].status = BUILDING

                if (isInstrumentation) {
                  const normalizedBundlePath = bundlePath.replace('src/', '')
                  entrypoints[normalizedBundlePath] = finalizeEntrypoint({
                    compilerType: COMPILER_NAMES.edgeServer,
                    name: normalizedBundlePath,
                    value: getInstrumentationEntry({
                      absolutePagePath: entryData.absolutePagePath,
                      isEdgeServer: true,
                      isDev: true,
                    }),
                    isServerComponent: true,
                    hasAppDir,
                  })
                  return
                }
                const appDirLoader = isAppPath
                  ? getAppEntry({
                      name: bundlePath,
                      page,
                      appPaths: entryData.appPaths,
                      pagePath: posix.join(
                        APP_DIR_ALIAS,
                        relative(
                          this.appDir!,
                          entryData.absolutePagePath
                        ).replace(/\\/g, '/')
                      ),
                      appDir: this.appDir!,
                      pageExtensions: this.config.pageExtensions,
                      rootDir: this.dir,
                      isDev: true,
                      tsconfigPath: this.config.typescript.tsconfigPath,
                      basePath: this.config.basePath,
                      assetPrefix: this.config.assetPrefix,
                      nextConfigOutput: this.config.output,
                      preferredRegion: staticInfo.preferredRegion,
                      middlewareConfig: Buffer.from(
                        JSON.stringify(staticInfo.middleware || {})
                      ).toString('base64'),
                    }).import
                  : undefined

                entrypoints[bundlePath] = finalizeEntrypoint({
                  compilerType: COMPILER_NAMES.edgeServer,
                  name: bundlePath,
                  value: getEdgeServerEntry({
                    absolutePagePath: entryData.absolutePagePath,
                    rootDir: this.dir,
                    buildId: this.buildId,
                    bundlePath,
                    config: this.config,
                    isDev: true,
                    page,
                    pages: this.pagesMapping,
                    isServerComponent,
                    appDirLoader,
                    pagesType: isAppPath ? PAGE_TYPES.APP : PAGE_TYPES.PAGES,
                    preferredRegion: staticInfo.preferredRegion,
                  }),
                  hasAppDir,
                })
              },
              onClient: () => {
                if (!isClientCompilation) return
                if (isChildEntry) {
                  entries[entryKey].status = BUILDING
                  entrypoints[bundlePath] = finalizeEntrypoint({
                    name: bundlePath,
                    compilerType: COMPILER_NAMES.client,
                    value: entryData.request,
                    hasAppDir,
                  })
                } else {
                  entries[entryKey].status = BUILDING
                  entrypoints[bundlePath] = finalizeEntrypoint({
                    name: bundlePath,
                    compilerType: COMPILER_NAMES.client,
                    value: getClientEntry({
                      absolutePagePath: entryData.absolutePagePath,
                      page,
                    }),
                    hasAppDir,
                  })
                }
              },
              onServer: () => {
                // TODO-APP: verify if child entry should support.
                if (!isNodeServerCompilation || !isEntry) return
                entries[entryKey].status = BUILDING
                let relativeRequest = relative(
                  config.context!,
                  entryData.absolutePagePath
                )
                if (
                  !isAbsolute(relativeRequest) &&
                  !relativeRequest.startsWith('../')
                ) {
                  relativeRequest = `./${relativeRequest}`
                }

                let value: { import: string; layer?: string } | string
                if (isInstrumentation) {
                  value = getInstrumentationEntry({
                    absolutePagePath: entryData.absolutePagePath,
                    isEdgeServer: false,
                    isDev: true,
                  })
                  entrypoints[bundlePath] = finalizeEntrypoint({
                    compilerType: COMPILER_NAMES.server,
                    name: bundlePath,
                    isServerComponent: true,
                    value,
                    hasAppDir,
                  })
                } else if (isAppPath) {
                  value = getAppEntry({
                    name: bundlePath,
                    page,
                    appPaths: entryData.appPaths,
                    pagePath: posix.join(
                      APP_DIR_ALIAS,
                      relative(
                        this.appDir!,
                        entryData.absolutePagePath
                      ).replace(/\\/g, '/')
                    ),
                    appDir: this.appDir!,
                    pageExtensions: this.config.pageExtensions,
                    rootDir: this.dir,
                    isDev: true,
                    tsconfigPath: this.config.typescript.tsconfigPath,
                    basePath: this.config.basePath,
                    assetPrefix: this.config.assetPrefix,
                    nextConfigOutput: this.config.output,
                    preferredRegion: staticInfo.preferredRegion,
                    middlewareConfig: Buffer.from(
                      JSON.stringify(staticInfo.middleware || {})
                    ).toString('base64'),
                  })
                } else if (isAPIRoute(page)) {
                  value = getRouteLoaderEntry({
                    kind: RouteKind.PAGES_API,
                    page,
                    absolutePagePath: relativeRequest,
                    preferredRegion: staticInfo.preferredRegion,
                    middlewareConfig: staticInfo.middleware || {},
                  })
                } else if (
                  !isMiddlewareFile(page) &&
                  !isInternalComponent(relativeRequest) &&
                  !isNonRoutePagesPage(page) &&
                  !isInstrumentation
                ) {
                  value = getRouteLoaderEntry({
                    kind: RouteKind.PAGES,
                    page,
                    pages: this.pagesMapping,
                    absolutePagePath: relativeRequest,
                    preferredRegion: staticInfo.preferredRegion,
                    middlewareConfig: staticInfo.middleware ?? {},
                  })
                } else {
                  value = relativeRequest
                }

                entrypoints[bundlePath] = finalizeEntrypoint({
                  compilerType: COMPILER_NAMES.server,
                  name: bundlePath,
                  isServerComponent,
                  value,
                  hasAppDir,
                })
              },
            })
          })
        )

        if (!this.hasAmpEntrypoints) {
          delete entrypoints[CLIENT_STATIC_FILES_RUNTIME_AMP]
        }
        if (!this.hasPagesRouterEntrypoints) {
          delete entrypoints[CLIENT_STATIC_FILES_RUNTIME_MAIN]
          delete entrypoints['pages/_app']
          delete entrypoints['pages/_error']
          delete entrypoints['/_error']
          delete entrypoints['pages/_document']
        }
        // Remove React Refresh entrypoint chunk as `app` doesn't require it.
        if (!this.hasAmpEntrypoints && !this.hasPagesRouterEntrypoints) {
          delete entrypoints[CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH]
        }
        if (!this.hasAppRouterEntrypoints) {
          delete entrypoints[CLIENT_STATIC_FILES_RUNTIME_MAIN_APP]
        }

        return entrypoints
      }
    }

    // Enable building of client compilation before server compilation in development
    // @ts-ignore webpack 5
    this.activeWebpackConfigs.parallelism = 1

    this.multiCompiler = webpack(
      this.activeWebpackConfigs
    ) as unknown as webpack.MultiCompiler

    // Copy over the filesystem so that it is shared between all compilers.
    const inputFileSystem = this.multiCompiler.compilers[0].inputFileSystem
    for (const compiler of this.multiCompiler.compilers) {
      compiler.inputFileSystem = inputFileSystem
      // This is set for the initial compile. After that Watching class in webpack adds it.
      compiler.fsStartTime = Date.now()
      // Ensure NodeEnvironmentPlugin doesn't purge the inputFileSystem. Purging is handled in `done` below.
      compiler.hooks.beforeRun.intercept({
        register(tapInfo: any) {
          if (tapInfo.name === 'NodeEnvironmentPlugin') {
            return null
          }
          return tapInfo
        },
      })
    }

    this.multiCompiler.hooks.done.tap('NextjsHotReloader', () => {
      inputFileSystem.purge!()
    })
    watchCompilers(
      this.multiCompiler.compilers[0],
      this.multiCompiler.compilers[1],
      this.multiCompiler.compilers[2]
    )

    // Watch for changes to client/server page files so we can tell when just
    // the server file changes and trigger a reload for GS(S)P pages
    const changedClientPages = new Set<string>()
    const changedServerPages = new Set<string>()
    const changedEdgeServerPages = new Set<string>()

    const changedServerComponentPages = new Set<string>()
    const changedCSSImportPages = new Set<string>()

    const prevClientPageHashes = new Map<string, string>()
    const prevServerPageHashes = new Map<string, string>()
    const prevEdgeServerPageHashes = new Map<string, string>()
    const prevCSSImportModuleHashes = new Map<string, string>()

    const pageExtensionRegex = new RegExp(
      `\\.(?:${this.config.pageExtensions.join('|')})$`
    )

    const trackPageChanges =
      (
        pageHashMap: Map<string, string>,
        changedItems: Set<string>,
        serverComponentChangedItems?: Set<string>
      ) =>
      (stats: webpack.Compilation) => {
        try {
          stats.entrypoints.forEach((entry, key) => {
            if (
              key.startsWith('pages/') ||
              key.startsWith('app/') ||
              isMiddlewareFilename(key)
            ) {
              // TODO this doesn't handle on demand loaded chunks
              entry.chunks.forEach((chunk) => {
                if (chunk.id === key) {
                  const modsIterable: any =
                    stats.chunkGraph.getChunkModulesIterable(chunk)

                  let hasCSSModuleChanges = false
                  let chunksHash = new StringXor()
                  let chunksHashServerLayer = new StringXor()

                  modsIterable.forEach((mod: any) => {
                    if (
                      mod.resource &&
                      mod.resource.replace(/\\/g, '/').includes(key) &&
                      // Shouldn't match CSS modules, etc.
                      pageExtensionRegex.test(mod.resource)
                    ) {
                      // use original source to calculate hash since mod.hash
                      // includes the source map in development which changes
                      // every time for both server and client so we calculate
                      // the hash without the source map for the page module
                      const hash = require('crypto')
                        .createHash('sha1')
                        .update(mod.originalSource().buffer())
                        .digest()
                        .toString('hex')

                      if (
                        mod.layer === WEBPACK_LAYERS.reactServerComponents &&
                        mod?.buildInfo?.rsc?.type !== 'client'
                      ) {
                        chunksHashServerLayer.add(hash)
                      }

                      chunksHash.add(hash)
                    } else {
                      // for non-pages we can use the module hash directly
                      const hash = stats.chunkGraph.getModuleHash(
                        mod,
                        chunk.runtime
                      )

                      if (
                        mod.layer === WEBPACK_LAYERS.reactServerComponents &&
                        mod?.buildInfo?.rsc?.type !== 'client'
                      ) {
                        chunksHashServerLayer.add(hash)
                      }

                      chunksHash.add(hash)

                      // Both CSS import changes from server and client
                      // components are tracked.
                      if (
                        key.startsWith('app/') &&
                        /\.(css|scss|sass)$/.test(mod.resource || '')
                      ) {
                        const resourceKey = mod.layer + ':' + mod.resource
                        const prevHash =
                          prevCSSImportModuleHashes.get(resourceKey)
                        if (prevHash && prevHash !== hash) {
                          hasCSSModuleChanges = true
                        }
                        prevCSSImportModuleHashes.set(resourceKey, hash)
                      }
                    }
                  })

                  const prevHash = pageHashMap.get(key)
                  const curHash = chunksHash.toString()
                  if (prevHash && prevHash !== curHash) {
                    changedItems.add(key)
                  }
                  pageHashMap.set(key, curHash)

                  if (serverComponentChangedItems) {
                    const serverKey =
                      WEBPACK_LAYERS.reactServerComponents + ':' + key
                    const prevServerHash = pageHashMap.get(serverKey)
                    const curServerHash = chunksHashServerLayer.toString()
                    if (prevServerHash && prevServerHash !== curServerHash) {
                      serverComponentChangedItems.add(key)
                    }
                    pageHashMap.set(serverKey, curServerHash)
                  }

                  if (hasCSSModuleChanges) {
                    changedCSSImportPages.add(key)
                  }
                }
              })
            }
          })
        } catch (err) {
          console.error(err)
        }
      }

    this.multiCompiler.compilers[0].hooks.emit.tap(
      'NextjsHotReloaderForClient',
      trackPageChanges(prevClientPageHashes, changedClientPages)
    )
    this.multiCompiler.compilers[1].hooks.emit.tap(
      'NextjsHotReloaderForServer',
      trackPageChanges(
        prevServerPageHashes,
        changedServerPages,
        changedServerComponentPages
      )
    )
    this.multiCompiler.compilers[2].hooks.emit.tap(
      'NextjsHotReloaderForServer',
      trackPageChanges(
        prevEdgeServerPageHashes,
        changedEdgeServerPages,
        changedServerComponentPages
      )
    )

    // This plugin watches for changes to _document.js and notifies the client side that it should reload the page
    this.multiCompiler.compilers[1].hooks.failed.tap(
      'NextjsHotReloaderForServer',
      (err: Error) => {
        this.serverError = err
        this.serverStats = null
        this.serverChunkNames = undefined
      }
    )

    this.multiCompiler.compilers[2].hooks.done.tap(
      'NextjsHotReloaderForServer',
      (stats) => {
        this.serverError = null
        this.edgeServerStats = stats
      }
    )

    this.multiCompiler.compilers[1].hooks.done.tap(
      'NextjsHotReloaderForServer',
      (stats) => {
        this.serverError = null
        this.serverStats = stats

        if (!this.pagesDir) {
          return
        }

        const { compilation } = stats

        // We only watch `_document` for changes on the server compilation
        // the rest of the files will be triggered by the client compilation
        const documentChunk = compilation.namedChunks.get('pages/_document')
        // If the document chunk can't be found we do nothing
        if (!documentChunk) {
          return
        }

        // Initial value
        if (this.serverPrevDocumentHash === null) {
          this.serverPrevDocumentHash = documentChunk.hash || null
          return
        }

        // If _document.js didn't change we don't trigger a reload.
        if (documentChunk.hash === this.serverPrevDocumentHash) {
          return
        }

        // As document chunk will change if new app pages are joined,
        // since react bundle is different it will effect the chunk hash.
        // So we diff the chunk changes, if there's only new app page chunk joins,
        // then we don't trigger a reload by checking pages/_document chunk change.
        if (this.appDir) {
          const chunkNames = new Set(compilation.namedChunks.keys())
          const diffChunkNames = difference<string>(
            this.serverChunkNames || new Set(),
            chunkNames
          )

          if (
            diffChunkNames.length === 0 ||
            diffChunkNames.every((chunkName) => chunkName.startsWith('app/'))
          ) {
            return
          }
          this.serverChunkNames = chunkNames
        }

        this.serverPrevDocumentHash = documentChunk.hash || null

        // Notify reload to reload the page, as _document.js was changed (different hash)
        this.send({ action: HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE })
      }
    )

    this.multiCompiler.hooks.done.tap('NextjsHotReloaderForServer', () => {
      const reloadAfterInvalidation = this.reloadAfterInvalidation
      this.reloadAfterInvalidation = false

      const serverOnlyChanges = difference<string>(
        changedServerPages,
        changedClientPages
      )

      const edgeServerOnlyChanges = difference<string>(
        changedEdgeServerPages,
        changedClientPages
      )

      const pageChanges = serverOnlyChanges
        .concat(edgeServerOnlyChanges)
        .filter((key) => key.startsWith('pages/'))
      const middlewareChanges = Array.from(changedEdgeServerPages).filter(
        (name) => isMiddlewareFilename(name)
      )

      if (middlewareChanges.length > 0) {
        this.send({
          event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
        })
      }

      if (pageChanges.length > 0) {
        this.send({
          event: HMR_ACTIONS_SENT_TO_BROWSER.SERVER_ONLY_CHANGES,
          pages: serverOnlyChanges.map((pg) =>
            denormalizePagePath(pg.slice('pages'.length))
          ),
        })
      }

      if (
        changedServerComponentPages.size ||
        changedCSSImportPages.size ||
        reloadAfterInvalidation
      ) {
        this.refreshServerComponents()
      }

      changedClientPages.clear()
      changedServerPages.clear()
      changedEdgeServerPages.clear()
      changedServerComponentPages.clear()
      changedCSSImportPages.clear()
    })

    this.multiCompiler.compilers[0].hooks.failed.tap(
      'NextjsHotReloaderForClient',
      (err: Error) => {
        this.clientError = err
        this.clientStats = null
      }
    )
    this.multiCompiler.compilers[0].hooks.done.tap(
      'NextjsHotReloaderForClient',
      (stats) => {
        this.clientError = null
        this.clientStats = stats

        const { compilation } = stats
        const chunkNames = new Set(
          [...compilation.namedChunks.keys()].filter(
            (name) => !!getRouteFromEntrypoint(name)
          )
        )

        if (this.prevChunkNames) {
          // detect chunks which have to be replaced with a new template
          // e.g, pages/index.js <-> pages/_error.js
          const addedPages = diff(chunkNames, this.prevChunkNames!)
          const removedPages = diff(this.prevChunkNames!, chunkNames)

          if (addedPages.size > 0) {
            for (const addedPage of addedPages) {
              const page = getRouteFromEntrypoint(addedPage)
              this.send({
                action: HMR_ACTIONS_SENT_TO_BROWSER.ADDED_PAGE,
                data: [page],
              })
            }
          }

          if (removedPages.size > 0) {
            for (const removedPage of removedPages) {
              const page = getRouteFromEntrypoint(removedPage)
              this.send({
                action: HMR_ACTIONS_SENT_TO_BROWSER.REMOVED_PAGE,
                data: [page],
              })
            }
          }
        }

        this.prevChunkNames = chunkNames
      }
    )

    this.webpackHotMiddleware = new WebpackHotMiddleware(
      this.multiCompiler.compilers,
      this.versionInfo
    )

    let booted = false

    this.watcher = await new Promise((resolve) => {
      const watcher = this.multiCompiler?.watch(
        // @ts-ignore webpack supports an array of watchOptions when using a multiCompiler
        this.activeWebpackConfigs.map((config) => config.watchOptions!),
        // Errors are handled separately
        (_err: any) => {
          if (!booted) {
            booted = true
            resolve(watcher)
          }
        }
      )
    })

    this.onDemandEntries = onDemandEntryHandler({
      hotReloader: this,
      multiCompiler: this.multiCompiler,
      pagesDir: this.pagesDir,
      appDir: this.appDir,
      rootDir: this.dir,
      nextConfig: this.config,
      ...(this.config.onDemandEntries as {
        maxInactiveAge: number
        pagesBufferLength: number
      }),
    })

    this.interceptors = [
      getOverlayMiddleware({
        rootDirectory: this.dir,
        stats: () => this.clientStats,
        serverStats: () => this.serverStats,
        edgeServerStats: () => this.edgeServerStats,
      }),
    ]
  }

  public invalidate(
    { reloadAfterInvalidation }: { reloadAfterInvalidation: boolean } = {
      reloadAfterInvalidation: false,
    }
  ) {
    // Cache the `reloadAfterInvalidation` flag, and use it to reload the page when compilation is done
    this.reloadAfterInvalidation = reloadAfterInvalidation
    const outputPath = this.multiCompiler?.outputPath
    return outputPath && getInvalidator(outputPath)?.invalidate()
  }

  public async stop(): Promise<void> {
    await new Promise((resolve, reject) => {
      this.watcher.close((err: any) => (err ? reject(err) : resolve(true)))
    })

    if (this.fallbackWatcher) {
      await new Promise((resolve, reject) => {
        this.fallbackWatcher.close((err: any) =>
          err ? reject(err) : resolve(true)
        )
      })
    }
    this.multiCompiler = undefined
  }

  public async getCompilationErrors(page: string) {
    const getErrors = ({ compilation }: webpack.Stats) => {
      const failedPages = erroredPages(compilation)
      const normalizedPage = normalizePathSep(page)
      // If there is an error related to the requesting page we display it instead of the first error
      return failedPages[normalizedPage]?.length > 0
        ? failedPages[normalizedPage]
        : compilation.errors
    }

    if (this.clientError) {
      return [this.clientError]
    } else if (this.serverError) {
      return [this.serverError]
    } else if (this.clientStats?.hasErrors()) {
      return getErrors(this.clientStats)
    } else if (this.serverStats?.hasErrors()) {
      return getErrors(this.serverStats)
    } else if (this.edgeServerStats?.hasErrors()) {
      return getErrors(this.edgeServerStats)
    } else {
      return []
    }
  }

  public send(action: HMR_ACTION_TYPES): void {
    this.webpackHotMiddleware!.publish(action)
  }

  public async ensurePage({
    page,
    clientOnly,
    appPaths,
    definition,
    isApp,
    url,
  }: {
    page: string
    clientOnly: boolean
    appPaths?: ReadonlyArray<string> | null
    isApp?: boolean
    definition?: RouteDefinition
    url?: string
  }): Promise<void> {
    // Make sure we don't re-build or dispose prebuilt pages
    if (page !== '/_error' && BLOCKED_PAGES.indexOf(page) !== -1) {
      return
    }
    const error = clientOnly
      ? this.clientError
      : this.serverError || this.clientError
    if (error) {
      throw error
    }

    return this.onDemandEntries?.ensurePage({
      page,
      appPaths,
      definition,
      isApp,
      url,
    })
  }
}
