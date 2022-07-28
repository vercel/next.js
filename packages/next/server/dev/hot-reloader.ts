import { getOverlayMiddleware } from 'next/dist/compiled/@next/react-dev-overlay/dist/middleware'
import { IncomingMessage, ServerResponse } from 'http'
import { WebpackHotMiddleware } from './hot-middleware'
import { join, relative, isAbsolute } from 'path'
import { UrlObject } from 'url'
import { webpack, StringXor } from 'next/dist/compiled/webpack/webpack'
import type { webpack5 } from 'next/dist/compiled/webpack/webpack'
import {
  createEntrypoints,
  createPagesMapping,
  finalizeEntrypoint,
  getClientEntry,
  getEdgeServerEntry,
  getAppEntry,
  runDependingOnPageType,
} from '../../build/entries'
import { watchCompilers } from '../../build/output'
import * as Log from '../../build/output/log'
import getBaseWebpackConfig from '../../build/webpack-config'
import { API_ROUTE, APP_DIR_ALIAS } from '../../lib/constants'
import { recursiveDelete } from '../../lib/recursive-delete'
import {
  BLOCKED_PAGES,
  NEXT_CLIENT_SSR_ENTRY_SUFFIX,
} from '../../shared/lib/constants'
import { __ApiPreviewProps } from '../api-utils'
import { getPathMatch } from '../../shared/lib/router/utils/path-match'
import { findPageFile } from '../lib/find-page-file'
import {
  BUILDING,
  entries,
  onDemandEntryHandler,
} from './on-demand-entry-handler'
import { denormalizePagePath } from '../../shared/lib/page-path/denormalize-page-path'
import { normalizePathSep } from '../../shared/lib/page-path/normalize-path-sep'
import getRouteFromEntrypoint from '../get-route-from-entrypoint'
import { fileExists } from '../../lib/file-exists'
import {
  difference,
  withoutRSCExtensions,
  isMiddlewareFilename,
} from '../../build/utils'
import { NextConfigComplete } from '../config-shared'
import { CustomRoutes } from '../../lib/load-custom-routes'
import { DecodeError } from '../../shared/lib/utils'
import { Span, trace } from '../../trace'
import { getProperError } from '../../lib/is-error'
import ws from 'next/dist/compiled/ws'
import { promises as fs } from 'fs'
import { getPageStaticInfo } from '../../build/analysis/get-page-static-info'
import { serverComponentRegex } from '../../build/webpack/loaders/utils'
import { stringify } from 'querystring'

const wsServer = new ws.Server({ noServer: true })

export async function renderScriptError(
  res: ServerResponse,
  error: Error,
  { verbose = true } = {}
) {
  // Asks CDNs and others to not to cache the errored page
  res.setHeader(
    'Cache-Control',
    'no-cache, no-store, max-age=0, must-revalidate'
  )

  if ((error as any).code === 'ENOENT') {
    res.statusCode = 404
    res.end('404 - Not Found')
    return
  }

  if (verbose) {
    console.error(error.stack)
  }
  res.statusCode = 500
  res.end('500 - Internal Error')
}

function addCorsSupport(req: IncomingMessage, res: ServerResponse) {
  const isApiRoute = req.url!.match(API_ROUTE)
  // API routes handle their own CORS headers
  if (isApiRoute) {
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

const matchNextPageBundleRequest = getPathMatch(
  '/_next/static/chunks/pages/:path*.js(\\.map|)'
)

// Recursively look up the issuer till it ends up at the root
function findEntryModule(
  compilation: webpack5.Compilation,
  issuerModule: any
): any {
  const issuer = compilation.moduleGraph.getIssuer(issuerModule)
  if (issuer) {
    return findEntryModule(compilation, issuer)
  }

  return issuerModule
}

function erroredPages(compilation: webpack5.Compilation) {
  const failedPages: { [page: string]: any[] } = {}
  for (const error of compilation.errors) {
    if (!error.module) {
      continue
    }

    const entryModule = findEntryModule(compilation, error.module)
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

export default class HotReloader {
  private dir: string
  private buildId: string
  private middlewares: any[]
  private pagesDir: string
  private distDir: string
  private webpackHotMiddleware?: WebpackHotMiddleware
  private config: NextConfigComplete
  private hasServerComponents: boolean
  private hasReactRoot: boolean
  public clientStats: webpack5.Stats | null
  public serverStats: webpack5.Stats | null
  public edgeServerStats: webpack5.Stats | null
  private clientError: Error | null = null
  private serverError: Error | null = null
  private serverPrevDocumentHash: string | null
  private prevChunkNames?: Set<any>
  private onDemandEntries?: ReturnType<typeof onDemandEntryHandler>
  private previewProps: __ApiPreviewProps
  private watcher: any
  private rewrites: CustomRoutes['rewrites']
  private fallbackWatcher: any
  private hotReloaderSpan: Span
  private pagesMapping: { [key: string]: string } = {}
  private appDir?: string

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
    }: {
      config: NextConfigComplete
      pagesDir: string
      distDir: string
      buildId: string
      previewProps: __ApiPreviewProps
      rewrites: CustomRoutes['rewrites']
      appDir?: string
    }
  ) {
    this.buildId = buildId
    this.dir = dir
    this.middlewares = []
    this.pagesDir = pagesDir
    this.appDir = appDir
    this.distDir = distDir
    this.clientStats = null
    this.serverStats = null
    this.edgeServerStats = null
    this.serverPrevDocumentHash = null

    this.config = config
    this.hasReactRoot = !!process.env.__NEXT_REACT_ROOT
    this.hasServerComponents =
      this.hasReactRoot && !!config.experimental.serverComponents
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
      const params = matchNextPageBundleRequest<{ path: string[] }>(pathname)
      if (!params) {
        return {}
      }

      let decodedPagePath: string

      try {
        decodedPagePath = `/${params.path
          .map((param) => decodeURIComponent(param))
          .join('/')}`
      } catch (_) {
        throw new DecodeError('failed to decode param')
      }

      const page = denormalizePagePath(decodedPagePath)

      if (page === '/_error' || BLOCKED_PAGES.indexOf(page) === -1) {
        try {
          await this.ensurePage(page, true)
        } catch (error) {
          await renderScriptError(pageBundleRes, getProperError(error))
          return { finished: true }
        }

        const errors = await this.getCompilationErrors(page)
        if (errors.length > 0) {
          await renderScriptError(pageBundleRes, errors[0], { verbose: false })
          return { finished: true }
        }
      }

      return {}
    }

    const { finished } = await handlePageBundleRequest(res, parsedUrl)

    for (const fn of this.middlewares) {
      await new Promise<void>((resolve, reject) => {
        fn(req, res, (err: Error) => {
          if (err) return reject(err)
          resolve()
        })
      })
    }

    return { finished }
  }

  public onHMR(req: IncomingMessage, _res: ServerResponse, head: Buffer) {
    wsServer.handleUpgrade(req, req.socket, head, (client) => {
      this.webpackHotMiddleware?.onHMR(client)
      this.onDemandEntries?.onHMR(client)

      client.addEventListener('message', ({ data }) => {
        data = typeof data !== 'string' ? data.toString() : data

        try {
          const payload = JSON.parse(data)

          let traceChild:
            | {
                name: string
                startTime?: bigint
                endTime?: bigint
                attrs?: Record<string, number | string>
              }
            | undefined

          switch (payload.event) {
            case 'client-hmr-latency': {
              traceChild = {
                name: payload.event,
                startTime: BigInt(payload.startTime * 1000 * 1000),
                endTime: BigInt(payload.endTime * 1000 * 1000),
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
              Log.warn(
                'Fast Refresh had to perform a full reload. Read more: https://nextjs.org/docs/basic-features/fast-refresh#how-it-works'
              )
              if (payload.stackTrace) {
                console.warn(payload.stackTrace)
              }
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

    const rawPageExtensions = this.hasServerComponents
      ? withoutRSCExtensions(this.config.pageExtensions)
      : this.config.pageExtensions

    return webpackConfigSpan.traceAsyncFn(async () => {
      const pagePaths = await webpackConfigSpan
        .traceChild('get-page-paths')
        .traceAsyncFn(() =>
          Promise.all([
            findPageFile(this.pagesDir, '/_app', rawPageExtensions),
            findPageFile(this.pagesDir, '/_document', rawPageExtensions),
          ])
        )

      this.pagesMapping = webpackConfigSpan
        .traceChild('create-pages-mapping')
        .traceFn(() =>
          createPagesMapping({
            hasServerComponents: this.hasServerComponents,
            isDev: true,
            pageExtensions: this.config.pageExtensions,
            pagesType: 'pages',
            pagePaths: pagePaths.filter(
              (i): i is string => typeof i === 'string'
            ),
          })
        )

      const entrypoints = await webpackConfigSpan
        .traceChild('create-entrypoints')
        .traceAsyncFn(() =>
          createEntrypoints({
            buildId: this.buildId,
            config: this.config,
            envFiles: [],
            isDev: true,
            pages: this.pagesMapping,
            pagesDir: this.pagesDir,
            previewMode: this.previewProps,
            rootDir: this.dir,
            target: 'server',
            pageExtensions: this.config.pageExtensions,
          })
        )

      const commonWebpackOptions = {
        dev: true,
        buildId: this.buildId,
        config: this.config,
        hasReactRoot: this.hasReactRoot,
        pagesDir: this.pagesDir,
        rewrites: this.rewrites,
        runWebpackSpan: this.hotReloaderSpan,
        appDir: this.appDir,
      }

      return webpackConfigSpan
        .traceChild('generate-webpack-config')
        .traceAsyncFn(() =>
          Promise.all([
            getBaseWebpackConfig(this.dir, {
              ...commonWebpackOptions,
              compilerType: 'client',
              entrypoints: entrypoints.client,
            }),
            getBaseWebpackConfig(this.dir, {
              ...commonWebpackOptions,
              compilerType: 'server',
              entrypoints: entrypoints.server,
            }),
            getBaseWebpackConfig(this.dir, {
              ...commonWebpackOptions,
              compilerType: 'edge-server',
              entrypoints: entrypoints.edgeServer,
            }),
          ])
        )
    })
  }

  public async buildFallbackError(): Promise<void> {
    if (this.fallbackWatcher) return

    const fallbackConfig = await getBaseWebpackConfig(this.dir, {
      runWebpackSpan: this.hotReloaderSpan,
      dev: true,
      compilerType: 'client',
      config: this.config,
      buildId: this.buildId,
      pagesDir: this.pagesDir,
      rewrites: {
        beforeFiles: [],
        afterFiles: [],
        fallback: [],
      },
      isDevFallback: true,
      entrypoints: (
        await createEntrypoints({
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
          target: 'server',
          pageExtensions: this.config.pageExtensions,
        })
      ).client,
      hasReactRoot: this.hasReactRoot,
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

  public async start(): Promise<void> {
    const startSpan = this.hotReloaderSpan.traceChild('start')
    startSpan.stop() // Stop immediately to create an artificial parent span

    await this.clean(startSpan)

    // Ensure distDir exists before writing package.json
    await fs.mkdir(this.distDir, { recursive: true })

    const distPackageJsonPath = join(this.distDir, 'package.json')

    // Ensure commonjs handling is used for files in the distDir (generally .next)
    // Files outside of the distDir can be "type": "module"
    await fs.writeFile(distPackageJsonPath, '{"type": "commonjs"}')

    const configs = await this.getWebpackConfig(startSpan)

    for (const config of configs) {
      const defaultEntry = config.entry
      config.entry = async (...args) => {
        // @ts-ignore entry is always a function
        const entrypoints = await defaultEntry(...args)
        const isClientCompilation = config.name === 'client'
        const isNodeServerCompilation = config.name === 'server'
        const isEdgeServerCompilation = config.name === 'edge-server'

        await Promise.all(
          Object.keys(entries).map(async (pageKey) => {
            const { bundlePath, absolutePagePath, dispose } = entries[pageKey]

            // @FIXME
            const { clientLoader } = entries[pageKey] as any

            const result = /^(client|server|edge-server)(.*)/g.exec(pageKey)
            const [, key, page] = result! // this match should always happen
            if (key === 'client' && !isClientCompilation) return
            if (key === 'server' && !isNodeServerCompilation) return
            if (key === 'edge-server' && !isEdgeServerCompilation) return

            // Check if the page was removed or disposed and remove it
            const pageExists = !dispose && (await fileExists(absolutePagePath))
            if (!pageExists) {
              delete entries[pageKey]
              return
            }

            const isServerComponent =
              serverComponentRegex.test(absolutePagePath)
            const isInsideAppDir =
              this.appDir && absolutePagePath.startsWith(this.appDir)

            const staticInfo = await getPageStaticInfo({
              pageFilePath: absolutePagePath,
              nextConfig: this.config,
            })

            runDependingOnPageType({
              page,
              pageRuntime: staticInfo.runtime,
              onEdgeServer: () => {
                if (!isEdgeServerCompilation) return
                entries[pageKey].status = BUILDING
                entrypoints[bundlePath] = finalizeEntrypoint({
                  compilerType: 'edge-server',
                  name: bundlePath,
                  value: getEdgeServerEntry({
                    absolutePagePath,
                    buildId: this.buildId,
                    bundlePath,
                    config: this.config,
                    isDev: true,
                    page,
                    pages: this.pagesMapping,
                    isServerComponent,
                  }),
                  appDir: this.config.experimental.appDir,
                })
              },
              onClient: () => {
                if (!isClientCompilation) return
                if (isServerComponent || isInsideAppDir) {
                  entries[pageKey].status = BUILDING
                  entrypoints[bundlePath] = finalizeEntrypoint({
                    name: bundlePath,
                    compilerType: 'client',
                    value:
                      `next-client-pages-loader?${stringify({
                        isServerComponent,
                        page: denormalizePagePath(
                          bundlePath.replace(/^pages/, '')
                        ),
                        absolutePagePath: clientLoader,
                      })}!` + clientLoader,
                    appDir: this.config.experimental.appDir,
                  })
                } else {
                  entries[pageKey].status = BUILDING
                  entrypoints[bundlePath] = finalizeEntrypoint({
                    name: bundlePath,
                    compilerType: 'client',
                    value: getClientEntry({
                      absolutePagePath,
                      page,
                    }),
                    appDir: this.config.experimental.appDir,
                  })
                }
              },
              onServer: () => {
                if (!isNodeServerCompilation) return
                entries[pageKey].status = BUILDING
                let request = relative(config.context!, absolutePagePath)
                if (!isAbsolute(request) && !request.startsWith('../')) {
                  request = `./${request}`
                }

                entrypoints[bundlePath] = finalizeEntrypoint({
                  compilerType: 'server',
                  name: bundlePath,
                  isServerComponent,
                  value:
                    this.appDir && bundlePath.startsWith('app/')
                      ? getAppEntry({
                          name: bundlePath,
                          pagePath: join(
                            APP_DIR_ALIAS,
                            relative(this.appDir!, absolutePagePath)
                          ),
                          appDir: this.appDir!,
                          pageExtensions: this.config.pageExtensions,
                        })
                      : request,
                  appDir: this.config.experimental.appDir,
                })
              },
            })
          })
        )

        return entrypoints
      }
    }

    // Enable building of client compilation before server compilation in development
    // @ts-ignore webpack 5
    configs.parallelism = 1

    const multiCompiler = webpack(configs) as unknown as webpack5.MultiCompiler

    watchCompilers(
      multiCompiler.compilers[0],
      multiCompiler.compilers[1],
      multiCompiler.compilers[2]
    )

    // Watch for changes to client/server page files so we can tell when just
    // the server file changes and trigger a reload for GS(S)P pages
    const changedClientPages = new Set<string>()
    const changedServerPages = new Set<string>()
    const changedEdgeServerPages = new Set<string>()
    const prevClientPageHashes = new Map<string, string>()
    const prevServerPageHashes = new Map<string, string>()
    const prevEdgeServerPageHashes = new Map<string, string>()

    const trackPageChanges =
      (pageHashMap: Map<string, string>, changedItems: Set<string>) =>
      (stats: webpack5.Compilation) => {
        try {
          stats.entrypoints.forEach((entry, key) => {
            if (
              key.startsWith('pages/') ||
              (key.startsWith('app/') &&
                !key.endsWith(NEXT_CLIENT_SSR_ENTRY_SUFFIX)) ||
              isMiddlewareFilename(key)
            ) {
              // TODO this doesn't handle on demand loaded chunks
              entry.chunks.forEach((chunk) => {
                if (chunk.id === key) {
                  const modsIterable: any =
                    stats.chunkGraph.getChunkModulesIterable(chunk)

                  let chunksHash = new StringXor()

                  modsIterable.forEach((mod: any) => {
                    if (
                      mod.resource &&
                      mod.resource.replace(/\\/g, '/').includes(key)
                    ) {
                      // use original source to calculate hash since mod.hash
                      // includes the source map in development which changes
                      // every time for both server and client so we calculate
                      // the hash without the source map for the page module
                      const hash = require('crypto')
                        .createHash('sha256')
                        .update(mod.originalSource().buffer())
                        .digest()
                        .toString('hex')

                      chunksHash.add(hash)
                    } else {
                      // for non-pages we can use the module hash directly
                      const hash = stats.chunkGraph.getModuleHash(
                        mod,
                        chunk.runtime
                      )
                      chunksHash.add(hash)
                    }
                  })
                  const prevHash = pageHashMap.get(key)
                  const curHash = chunksHash.toString()

                  if (prevHash && prevHash !== curHash) {
                    changedItems.add(key)
                  }
                  pageHashMap.set(key, curHash)
                }
              })
            }
          })
        } catch (err) {
          console.error(err)
        }
      }

    multiCompiler.compilers[0].hooks.emit.tap(
      'NextjsHotReloaderForClient',
      trackPageChanges(prevClientPageHashes, changedClientPages)
    )
    multiCompiler.compilers[1].hooks.emit.tap(
      'NextjsHotReloaderForServer',
      trackPageChanges(prevServerPageHashes, changedServerPages)
    )
    multiCompiler.compilers[2].hooks.emit.tap(
      'NextjsHotReloaderForServer',
      trackPageChanges(prevEdgeServerPageHashes, changedEdgeServerPages)
    )

    // This plugin watches for changes to _document.js and notifies the client side that it should reload the page
    multiCompiler.compilers[1].hooks.failed.tap(
      'NextjsHotReloaderForServer',
      (err: Error) => {
        this.serverError = err
        this.serverStats = null
      }
    )

    multiCompiler.compilers[2].hooks.done.tap(
      'NextjsHotReloaderForServer',
      (stats) => {
        this.serverError = null
        this.edgeServerStats = stats
      }
    )

    multiCompiler.compilers[1].hooks.done.tap(
      'NextjsHotReloaderForServer',
      (stats) => {
        this.serverError = null
        this.serverStats = stats

        const { compilation } = stats

        // We only watch `_document` for changes on the server compilation
        // the rest of the files will be triggered by the client compilation
        const documentChunk = compilation.namedChunks.get('pages/_document')
        // If the document chunk can't be found we do nothing
        if (!documentChunk) {
          console.warn('_document.js chunk not found')
          return
        }

        // Initial value
        if (this.serverPrevDocumentHash === null) {
          this.serverPrevDocumentHash = documentChunk.hash || null
          return
        }

        // If _document.js didn't change we don't trigger a reload
        if (documentChunk.hash === this.serverPrevDocumentHash) {
          return
        }

        // Notify reload to reload the page, as _document.js was changed (different hash)
        this.send('reloadPage')
        this.serverPrevDocumentHash = documentChunk.hash || null
      }
    )
    multiCompiler.hooks.done.tap('NextjsHotReloaderForServer', () => {
      const serverOnlyChanges = difference<string>(
        changedServerPages,
        changedClientPages
      )
      const serverComponentChanges = serverOnlyChanges.filter((key) =>
        key.startsWith('app/')
      )
      const pageChanges = serverOnlyChanges.filter((key) =>
        key.startsWith('pages/')
      )
      const middlewareChanges = Array.from(changedEdgeServerPages).filter(
        (name) => isMiddlewareFilename(name)
      )
      changedClientPages.clear()
      changedServerPages.clear()
      changedEdgeServerPages.clear()

      if (middlewareChanges.length > 0) {
        this.send({
          event: 'middlewareChanges',
        })
      }

      if (pageChanges.length > 0) {
        this.send({
          event: 'serverOnlyChanges',
          pages: serverOnlyChanges.map((pg) =>
            denormalizePagePath(pg.slice('pages'.length))
          ),
        })
      }

      if (serverComponentChanges.length > 0) {
        this.send({
          action: 'serverComponentChanges',
          // TODO: granular reloading of changes
          // entrypoints: serverComponentChanges,
        })
      }
    })

    multiCompiler.compilers[0].hooks.failed.tap(
      'NextjsHotReloaderForClient',
      (err: Error) => {
        this.clientError = err
        this.clientStats = null
      }
    )
    multiCompiler.compilers[0].hooks.done.tap(
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
              this.send('addedPage', page)
            }
          }

          if (removedPages.size > 0) {
            for (const removedPage of removedPages) {
              const page = getRouteFromEntrypoint(removedPage)
              this.send('removedPage', page)
            }
          }
        }

        this.prevChunkNames = chunkNames
      }
    )

    this.webpackHotMiddleware = new WebpackHotMiddleware(
      multiCompiler.compilers
    )

    let booted = false

    this.watcher = await new Promise((resolve) => {
      const watcher = multiCompiler.watch(
        // @ts-ignore webpack supports an array of watchOptions when using a multiCompiler
        configs.map((config) => config.watchOptions!),
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
      multiCompiler,
      pagesDir: this.pagesDir,
      appDir: this.appDir,
      rootDir: this.dir,
      nextConfig: this.config,
      ...(this.config.onDemandEntries as {
        maxInactiveAge: number
        pagesBufferLength: number
      }),
    })

    this.middlewares = [
      getOverlayMiddleware({
        rootDirectory: this.dir,
        stats: () => this.clientStats,
        serverStats: () => this.serverStats,
        edgeServerStats: () => this.edgeServerStats,
      }),
    ]
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
  }

  public async getCompilationErrors(page: string) {
    const getErrors = ({ compilation }: webpack5.Stats) => {
      const failedPages = erroredPages(compilation)
      const normalizedPage = normalizePathSep(page)
      // If there is an error related to the requesting page we display it instead of the first error
      return failedPages[normalizedPage]?.length > 0
        ? failedPages[normalizedPage]
        : compilation.errors
    }

    if (this.clientError || this.serverError) {
      return [this.clientError || this.serverError]
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

  public send(action?: string | any, ...args: any[]): void {
    this.webpackHotMiddleware!.publish(
      action && typeof action === 'object' ? action : { action, data: args }
    )
  }

  public async ensurePage(page: string, clientOnly: boolean = false) {
    // Make sure we don't re-build or dispose prebuilt pages
    if (page !== '/_error' && BLOCKED_PAGES.indexOf(page) !== -1) {
      return
    }
    const error = clientOnly
      ? this.clientError
      : this.serverError || this.clientError
    if (error) {
      return Promise.reject(error)
    }
    return this.onDemandEntries?.ensurePage(page, clientOnly) as any
  }
}

function diff(a: Set<any>, b: Set<any>) {
  return new Set([...a].filter((v) => !b.has(v)))
}
