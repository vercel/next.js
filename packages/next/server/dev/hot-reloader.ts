import { getOverlayMiddleware } from '@next/react-dev-overlay/lib/middleware'
import { NextHandleFunction } from 'connect'
import { IncomingMessage, ServerResponse } from 'http'
import { WebpackHotMiddleware } from './hot-middleware'
import { join } from 'path'
import { UrlObject } from 'url'
import { webpack, isWebpack5 } from 'next/dist/compiled/webpack/webpack'
import { createEntrypoints, createPagesMapping } from '../../build/entries'
import { watchCompilers } from '../../build/output'
import getBaseWebpackConfig from '../../build/webpack-config'
import { API_ROUTE } from '../../lib/constants'
import { recursiveDelete } from '../../lib/recursive-delete'
import { BLOCKED_PAGES } from '../../shared/lib/constants'
import { __ApiPreviewProps } from '../api-utils'
import { route } from '../router'
import { findPageFile } from '../lib/find-page-file'
import onDemandEntryHandler, {
  entries,
  BUILDING,
} from './on-demand-entry-handler'
import { denormalizePagePath, normalizePathSep } from '../normalize-page-path'
import getRouteFromEntrypoint from '../get-route-from-entrypoint'
import { isWriteable } from '../../build/is-writeable'
import { ClientPagesLoaderOptions } from '../../build/webpack/loaders/next-client-pages-loader'
import { stringify } from 'querystring'
import { difference } from '../../build/utils'
import { NextConfigComplete } from '../config-shared'
import { CustomRoutes } from '../../lib/load-custom-routes'
import { DecodeError } from '../../shared/lib/utils'

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

const matchNextPageBundleRequest = route(
  '/_next/static/chunks/pages/:path*.js(\\.map|)'
)

// Recursively look up the issuer till it ends up at the root
function findEntryModule(issuer: any): any {
  if (issuer.issuer) {
    return findEntryModule(issuer.issuer)
  }

  return issuer
}

function erroredPages(compilation: webpack.compilation.Compilation) {
  const failedPages: { [page: string]: any[] } = {}
  for (const error of compilation.errors) {
    if (!error.origin) {
      continue
    }

    const entryModule = findEntryModule(error.origin)
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
  private webpackHotMiddleware: (NextHandleFunction & any) | null
  private config: NextConfigComplete
  private stats: webpack.Stats | null
  private serverStats: webpack.Stats | null
  private clientError: Error | null = null
  private serverError: Error | null = null
  private serverPrevDocumentHash: string | null
  private prevChunkNames?: Set<any>
  private onDemandEntries: any
  private previewProps: __ApiPreviewProps
  private watcher: any
  private rewrites: CustomRoutes['rewrites']
  private fallbackWatcher: any
  public isWebpack5: any

  constructor(
    dir: string,
    {
      config,
      pagesDir,
      buildId,
      previewProps,
      rewrites,
    }: {
      config: NextConfigComplete
      pagesDir: string
      buildId: string
      previewProps: __ApiPreviewProps
      rewrites: CustomRoutes['rewrites']
    }
  ) {
    this.buildId = buildId
    this.dir = dir
    this.middlewares = []
    this.pagesDir = pagesDir
    this.webpackHotMiddleware = null
    this.stats = null
    this.serverStats = null
    this.serverPrevDocumentHash = null

    this.config = config
    this.previewProps = previewProps
    this.rewrites = rewrites
    this.isWebpack5 = isWebpack5
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
      const params: { path: string[] } | null = matchNextPageBundleRequest(
        pathname
      )
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
          await this.ensurePage(page)
        } catch (error) {
          await renderScriptError(pageBundleRes, error)
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

  private async clean(): Promise<void> {
    return recursiveDelete(join(this.dir, this.config.distDir), /^cache/)
  }

  private async getWebpackConfig() {
    const pagePaths = await Promise.all([
      findPageFile(this.pagesDir, '/_app', this.config.pageExtensions),
      findPageFile(this.pagesDir, '/_document', this.config.pageExtensions),
    ])

    const pages = createPagesMapping(
      pagePaths.filter((i) => i !== null) as string[],
      this.config.pageExtensions
    )
    const entrypoints = createEntrypoints(
      pages,
      'server',
      this.buildId,
      this.previewProps,
      this.config,
      []
    )

    return Promise.all([
      getBaseWebpackConfig(this.dir, {
        dev: true,
        isServer: false,
        config: this.config,
        buildId: this.buildId,
        pagesDir: this.pagesDir,
        rewrites: this.rewrites,
        entrypoints: entrypoints.client,
      }),
      getBaseWebpackConfig(this.dir, {
        dev: true,
        isServer: true,
        config: this.config,
        buildId: this.buildId,
        pagesDir: this.pagesDir,
        rewrites: this.rewrites,
        entrypoints: entrypoints.server,
      }),
    ])
  }

  public async buildFallbackError(): Promise<void> {
    if (this.fallbackWatcher) return

    const fallbackConfig = await getBaseWebpackConfig(this.dir, {
      dev: true,
      isServer: false,
      config: this.config,
      buildId: this.buildId,
      pagesDir: this.pagesDir,
      rewrites: {
        beforeFiles: [],
        afterFiles: [],
        fallback: [],
      },
      isDevFallback: true,
      entrypoints: createEntrypoints(
        {
          '/_app': 'next/dist/pages/_app',
          '/_error': 'next/dist/pages/_error',
        },
        'server',
        this.buildId,
        this.previewProps,
        this.config,
        []
      ).client,
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
    await this.clean()

    const configs = await this.getWebpackConfig()

    for (const config of configs) {
      const defaultEntry = config.entry
      config.entry = async (...args) => {
        // @ts-ignore entry is always a functon
        const entrypoints = await defaultEntry(...args)

        const isClientCompilation = config.name === 'client'

        await Promise.all(
          Object.keys(entries).map(async (page) => {
            if (isClientCompilation && page.match(API_ROUTE)) {
              return
            }
            const {
              serverBundlePath,
              clientBundlePath,
              absolutePagePath,
            } = entries[page]
            const pageExists = await isWriteable(absolutePagePath)
            if (!pageExists) {
              // page was removed
              delete entries[page]
              return
            }

            entries[page].status = BUILDING
            const pageLoaderOpts: ClientPagesLoaderOptions = {
              page,
              absolutePagePath,
            }

            entrypoints[
              isClientCompilation ? clientBundlePath : serverBundlePath
            ] = isClientCompilation
              ? `next-client-pages-loader?${stringify(pageLoaderOpts)}!`
              : absolutePagePath
          })
        )

        return entrypoints
      }
    }

    const multiCompiler = webpack(configs)

    watchCompilers(multiCompiler.compilers[0], multiCompiler.compilers[1])

    // Watch for changes to client/server page files so we can tell when just
    // the server file changes and trigger a reload for GS(S)P pages
    const changedClientPages = new Set<string>()
    const changedServerPages = new Set<string>()
    const prevClientPageHashes = new Map<string, string>()
    const prevServerPageHashes = new Map<string, string>()

    const trackPageChanges = (
      pageHashMap: Map<string, string>,
      changedItems: Set<string>
    ) => (stats: webpack.compilation.Compilation) => {
      stats.entrypoints.forEach((entry, key) => {
        if (key.startsWith('pages/')) {
          entry.chunks.forEach((chunk: any) => {
            if (chunk.id === key) {
              const prevHash = pageHashMap.get(key)

              if (prevHash && prevHash !== chunk.hash) {
                changedItems.add(key)
              }
              pageHashMap.set(key, chunk.hash)
            }
          })
        }
      })
    }

    multiCompiler.compilers[0].hooks.emit.tap(
      'NextjsHotReloaderForClient',
      trackPageChanges(prevClientPageHashes, changedClientPages)
    )
    multiCompiler.compilers[1].hooks.emit.tap(
      'NextjsHotReloaderForServer',
      trackPageChanges(prevServerPageHashes, changedServerPages)
    )

    // This plugin watches for changes to _document.js and notifies the client side that it should reload the page
    multiCompiler.compilers[1].hooks.failed.tap(
      'NextjsHotReloaderForServer',
      (err: Error) => {
        this.serverError = err
        this.serverStats = null
      }
    )
    multiCompiler.compilers[1].hooks.done.tap(
      'NextjsHotReloaderForServer',
      (stats) => {
        this.serverError = null
        this.serverStats = stats

        const serverOnlyChanges = difference<string>(
          changedServerPages,
          changedClientPages
        )
        changedClientPages.clear()
        changedServerPages.clear()

        if (serverOnlyChanges.length > 0) {
          this.send({
            event: 'serverOnlyChanges',
            pages: serverOnlyChanges.map((pg) =>
              denormalizePagePath(pg.substr('pages'.length))
            ),
          })
        }

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
          this.serverPrevDocumentHash = documentChunk.hash
          return
        }

        // If _document.js didn't change we don't trigger a reload
        if (documentChunk.hash === this.serverPrevDocumentHash) {
          return
        }

        // Notify reload to reload the page, as _document.js was changed (different hash)
        this.send('reloadPage')
        this.serverPrevDocumentHash = documentChunk.hash
      }
    )

    multiCompiler.compilers[0].hooks.failed.tap(
      'NextjsHotReloaderForClient',
      (err: Error) => {
        this.clientError = err
        this.stats = null
      }
    )
    multiCompiler.compilers[0].hooks.done.tap(
      'NextjsHotReloaderForClient',
      (stats) => {
        this.clientError = null
        this.stats = stats

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

    this.onDemandEntries = onDemandEntryHandler(this.watcher, multiCompiler, {
      pagesDir: this.pagesDir,
      pageExtensions: this.config.pageExtensions,
      ...(this.config.onDemandEntries as {
        maxInactiveAge: number
        pagesBufferLength: number
      }),
    })

    this.middlewares = [
      // must come before hotMiddleware
      this.onDemandEntries.middleware,
      this.webpackHotMiddleware.middleware,
      getOverlayMiddleware({
        isWebpack5,
        rootDirectory: this.dir,
        stats: () => this.stats,
        serverStats: () => this.serverStats,
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
    const normalizedPage = normalizePathSep(page)

    if (this.clientError || this.serverError) {
      return [this.clientError || this.serverError]
    } else if (this.stats?.hasErrors()) {
      const { compilation } = this.stats
      const failedPages = erroredPages(compilation)

      // If there is an error related to the requesting page we display it instead of the first error
      if (
        failedPages[normalizedPage] &&
        failedPages[normalizedPage].length > 0
      ) {
        return failedPages[normalizedPage]
      }

      // If none were found we still have to show the other errors
      return this.stats.compilation.errors
    } else if (this.serverStats?.hasErrors()) {
      const { compilation } = this.serverStats
      const failedPages = erroredPages(compilation)

      // If there is an error related to the requesting page we display it instead of the first error
      if (
        failedPages[normalizedPage] &&
        failedPages[normalizedPage].length > 0
      ) {
        return failedPages[normalizedPage]
      }

      // If none were found we still have to show the other errors
      return this.serverStats.compilation.errors
    }

    return []
  }

  public send(action?: string | any, ...args: any[]): void {
    this.webpackHotMiddleware!.publish(
      action && typeof action === 'object' ? action : { action, data: args }
    )
  }

  public async ensurePage(page: string) {
    // Make sure we don't re-build or dispose prebuilt pages
    if (page !== '/_error' && BLOCKED_PAGES.indexOf(page) !== -1) {
      return
    }
    if (this.serverError || this.clientError) {
      return Promise.reject(this.serverError || this.clientError)
    }
    return this.onDemandEntries.ensurePage(page)
  }
}

function diff(a: Set<any>, b: Set<any>) {
  return new Set([...a].filter((v) => !b.has(v)))
}
