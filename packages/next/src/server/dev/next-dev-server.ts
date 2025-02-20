import type { FindComponentsResult, NodeRequestHandler } from '../next-server'
import type { LoadComponentsReturnType } from '../load-components'
import type { Options as ServerOptions } from '../next-server'
import type { Params } from '../request/params'
import type { ParsedUrl } from '../../shared/lib/router/utils/parse-url'
import type { ParsedUrlQuery } from 'querystring'
import type { UrlWithParsedQuery } from 'url'
import type { MiddlewareRoutingItem } from '../base-server'
import type { RouteDefinition } from '../route-definitions/route-definition'
import type { RouteMatcherManager } from '../route-matcher-managers/route-matcher-manager'
import {
  getRequestMeta,
  type NextParsedUrlQuery,
  type NextUrlWithParsedQuery,
} from '../request-meta'
import type { DevBundlerService } from '../lib/dev-bundler-service'
import type { IncrementalCache } from '../lib/incremental-cache'
import type { UnwrapPromise } from '../../lib/coalesced-function'
import type { NodeNextResponse, NodeNextRequest } from '../base-http/node'
import type { RouteEnsurer } from '../route-matcher-managers/dev-route-matcher-manager'
import type { PagesManifest } from '../../build/webpack/plugins/pages-manifest-plugin'

import fs from 'fs'
import { Worker } from 'next/dist/compiled/jest-worker'
import { join as pathJoin } from 'path'
import { ampValidation } from '../../build/output'
import {
  INSTRUMENTATION_HOOK_FILENAME,
  PUBLIC_DIR_MIDDLEWARE_CONFLICT,
} from '../../lib/constants'
import { findPagesDir } from '../../lib/find-pages-dir'
import {
  PHASE_DEVELOPMENT_SERVER,
  PAGES_MANIFEST,
  APP_PATHS_MANIFEST,
  COMPILER_NAMES,
} from '../../shared/lib/constants'
import Server, { WrappedBuildError } from '../next-server'
import { normalizePagePath } from '../../shared/lib/page-path/normalize-page-path'
import { pathHasPrefix } from '../../shared/lib/router/utils/path-has-prefix'
import { removePathPrefix } from '../../shared/lib/router/utils/remove-path-prefix'
import { Telemetry } from '../../telemetry/storage'
import { type Span, setGlobal, trace } from '../../trace'
import { findPageFile } from '../lib/find-page-file'
import { getFormattedNodeOptionsWithoutInspect } from '../lib/utils'
import { withCoalescedInvoke } from '../../lib/coalesced-function'
import { loadDefaultErrorComponents } from '../load-default-error-components'
import { DecodeError, MiddlewareNotFoundError } from '../../shared/lib/utils'
import * as Log from '../../build/output/log'
import isError, { getProperError } from '../../lib/is-error'
import { isMiddlewareFile } from '../../build/utils'
import { formatServerError } from '../../lib/format-server-error'
import { DevRouteMatcherManager } from '../route-matcher-managers/dev-route-matcher-manager'
import { DevPagesRouteMatcherProvider } from '../route-matcher-providers/dev/dev-pages-route-matcher-provider'
import { DevPagesAPIRouteMatcherProvider } from '../route-matcher-providers/dev/dev-pages-api-route-matcher-provider'
import { DevAppPageRouteMatcherProvider } from '../route-matcher-providers/dev/dev-app-page-route-matcher-provider'
import { DevAppRouteRouteMatcherProvider } from '../route-matcher-providers/dev/dev-app-route-route-matcher-provider'
import { NodeManifestLoader } from '../route-matcher-providers/helpers/manifest-loaders/node-manifest-loader'
import { BatchedFileReader } from '../route-matcher-providers/dev/helpers/file-reader/batched-file-reader'
import { DefaultFileReader } from '../route-matcher-providers/dev/helpers/file-reader/default-file-reader'
import { LRUCache } from '../lib/lru-cache'
import { getMiddlewareRouteMatcher } from '../../shared/lib/router/utils/middleware-route-matcher'
import { DetachedPromise } from '../../lib/detached-promise'
import { isPostpone } from '../lib/router-utils/is-postpone'
import { generateInterceptionRoutesRewrites } from '../../lib/generate-interception-routes-rewrites'
import { buildCustomRoute } from '../../lib/build-custom-route'
import { decorateServerError } from '../../shared/lib/error-source'
import type { ServerOnInstrumentationRequestError } from '../app-render/types'
import type { ServerComponentsHmrCache } from '../response-cache'
import { logRequests } from './log-requests'
import { FallbackMode } from '../../lib/fallback'
import type { ReactDevOverlayType } from '../../client/components/react-dev-overlay/pages/react-dev-overlay'

// Load ReactDevOverlay only when needed
let ReactDevOverlayImpl: ReactDevOverlayType
const ReactDevOverlay: ReactDevOverlayType = (props) => {
  if (ReactDevOverlayImpl === undefined) {
    ReactDevOverlayImpl =
      require('../../client/components/react-dev-overlay/pages/client').ReactDevOverlay
  }
  return ReactDevOverlayImpl(props)
}

export interface Options extends ServerOptions {
  /**
   * Tells of Next.js is running from the `next dev` command
   */
  isNextDevCommand?: boolean

  /**
   * Interface to the development bundler.
   */
  bundlerService: DevBundlerService

  /**
   * Trace span for server startup.
   */
  startServerSpan: Span
}

export default class DevServer extends Server {
  /**
   * The promise that resolves when the server is ready. When this is unset
   * the server is ready.
   */
  private ready? = new DetachedPromise<void>()
  protected sortedRoutes?: string[]
  private pagesDir?: string
  private appDir?: string
  private actualMiddlewareFile?: string
  private actualInstrumentationHookFile?: string
  private middleware?: MiddlewareRoutingItem
  private originalFetch?: typeof fetch
  private readonly bundlerService: DevBundlerService
  private staticPathsCache: LRUCache<
    UnwrapPromise<ReturnType<DevServer['getStaticPaths']>>
  >
  private startServerSpan: Span
  private readonly serverComponentsHmrCache:
    | ServerComponentsHmrCache
    | undefined

  protected staticPathsWorker?: { [key: string]: any } & {
    loadStaticPaths: typeof import('./static-paths-worker').loadStaticPaths
  }

  private getStaticPathsWorker(): { [key: string]: any } & {
    loadStaticPaths: typeof import('./static-paths-worker').loadStaticPaths
  } {
    const worker = new Worker(require.resolve('./static-paths-worker'), {
      maxRetries: 1,
      // For dev server, it's not necessary to spin up too many workers as long as you are not doing a load test.
      // This helps reusing the memory a lot.
      numWorkers: 1,
      enableWorkerThreads: this.nextConfig.experimental.workerThreads,
      forkOptions: {
        env: {
          ...process.env,
          // discard --inspect/--inspect-brk flags from process.env.NODE_OPTIONS. Otherwise multiple Node.js debuggers
          // would be started if user launch Next.js in debugging mode. The number of debuggers is linked to
          // the number of workers Next.js tries to launch. The only worker users are interested in debugging
          // is the main Next.js one
          NODE_OPTIONS: getFormattedNodeOptionsWithoutInspect(),
        },
      },
    }) as Worker & {
      loadStaticPaths: typeof import('./static-paths-worker').loadStaticPaths
    }

    worker.getStdout().pipe(process.stdout)
    worker.getStderr().pipe(process.stderr)

    return worker
  }

  constructor(options: Options) {
    try {
      // Increase the number of stack frames on the server
      Error.stackTraceLimit = 50
    } catch {}
    super({ ...options, dev: true })
    this.bundlerService = options.bundlerService
    this.startServerSpan =
      options.startServerSpan ?? trace('start-next-dev-server')
    this.renderOpts.dev = true
    this.renderOpts.ErrorDebug = ReactDevOverlay
    this.staticPathsCache = new LRUCache(
      // 5MB
      5 * 1024 * 1024,
      function length(value) {
        return JSON.stringify(value.staticPaths)?.length ?? 0
      }
    )
    this.renderOpts.ampSkipValidation =
      this.nextConfig.experimental?.amp?.skipValidation ?? false
    this.renderOpts.ampValidator = (html: string, pathname: string) => {
      const validatorPath =
        (this.nextConfig.experimental &&
          this.nextConfig.experimental.amp &&
          this.nextConfig.experimental.amp.validator) ||
        require.resolve(
          'next/dist/compiled/amphtml-validator/validator_wasm.js'
        )

      const AmpHtmlValidator =
        require('next/dist/compiled/amphtml-validator') as typeof import('next/dist/compiled/amphtml-validator')
      return AmpHtmlValidator.getInstance(validatorPath).then((validator) => {
        const result = validator.validateString(html)
        ampValidation(
          pathname,
          result.errors
            .filter((e) => e.severity === 'ERROR')
            .filter((e) => this._filterAmpDevelopmentScript(html, e)),
          result.errors.filter((e) => e.severity !== 'ERROR')
        )
      })
    }

    const { pagesDir, appDir } = findPagesDir(this.dir)
    this.pagesDir = pagesDir
    this.appDir = appDir

    if (this.nextConfig.experimental.serverComponentsHmrCache) {
      this.serverComponentsHmrCache = new LRUCache(
        this.nextConfig.cacheMaxMemorySize,
        function length(value) {
          return JSON.stringify(value).length
        }
      )
    }
  }

  protected override getServerComponentsHmrCache() {
    return this.serverComponentsHmrCache
  }

  protected getRouteMatchers(): RouteMatcherManager {
    const { pagesDir, appDir } = findPagesDir(this.dir)

    const ensurer: RouteEnsurer = {
      ensure: async (match, pathname) => {
        await this.ensurePage({
          definition: match.definition,
          page: match.definition.page,
          clientOnly: false,
          url: pathname,
        })
      },
    }

    const matchers = new DevRouteMatcherManager(
      super.getRouteMatchers(),
      ensurer,
      this.dir
    )
    const extensions = this.nextConfig.pageExtensions
    const extensionsExpression = new RegExp(`\\.(?:${extensions.join('|')})$`)

    // If the pages directory is available, then configure those matchers.
    if (pagesDir) {
      const fileReader = new BatchedFileReader(
        new DefaultFileReader({
          // Only allow files that have the correct extensions.
          pathnameFilter: (pathname) => extensionsExpression.test(pathname),
        })
      )

      matchers.push(
        new DevPagesRouteMatcherProvider(
          pagesDir,
          extensions,
          fileReader,
          this.localeNormalizer
        )
      )
      matchers.push(
        new DevPagesAPIRouteMatcherProvider(
          pagesDir,
          extensions,
          fileReader,
          this.localeNormalizer
        )
      )
    }

    if (appDir) {
      // We create a new file reader for the app directory because we don't want
      // to include any folders or files starting with an underscore. This will
      // prevent the reader from wasting time reading files that we know we
      // don't care about.
      const fileReader = new BatchedFileReader(
        new DefaultFileReader({
          // Ignore any directory prefixed with an underscore.
          ignorePartFilter: (part) => part.startsWith('_'),
        })
      )

      matchers.push(
        new DevAppPageRouteMatcherProvider(appDir, extensions, fileReader)
      )
      matchers.push(
        new DevAppRouteRouteMatcherProvider(appDir, extensions, fileReader)
      )
    }

    return matchers
  }

  protected getBuildId(): string {
    return 'development'
  }

  protected async prepareImpl(): Promise<void> {
    setGlobal('distDir', this.distDir)
    setGlobal('phase', PHASE_DEVELOPMENT_SERVER)

    const telemetry = new Telemetry({ distDir: this.distDir })

    await super.prepareImpl()
    await this.matchers.reload()

    this.ready?.resolve()
    this.ready = undefined

    // In dev, this needs to be called after prepare because the build entries won't be known in the constructor
    this.interceptionRoutePatterns = this.getinterceptionRoutePatterns()

    // This is required by the tracing subsystem.
    setGlobal('appDir', this.appDir)
    setGlobal('pagesDir', this.pagesDir)
    setGlobal('telemetry', telemetry)

    process.on('unhandledRejection', (reason) => {
      if (isPostpone(reason)) {
        // React postpones that are unhandled might end up logged here but they're
        // not really errors. They're just part of rendering.
        return
      }
      this.logErrorWithOriginalStack(reason, 'unhandledRejection')
    })
    process.on('uncaughtException', (err) => {
      this.logErrorWithOriginalStack(err, 'uncaughtException')
    })
  }

  protected async hasPage(pathname: string): Promise<boolean> {
    let normalizedPath: string
    try {
      normalizedPath = normalizePagePath(pathname)
    } catch (err) {
      console.error(err)
      // if normalizing the page fails it means it isn't valid
      // so it doesn't exist so don't throw and return false
      // to ensure we return 404 instead of 500
      return false
    }

    if (isMiddlewareFile(normalizedPath)) {
      return findPageFile(
        this.dir,
        normalizedPath,
        this.nextConfig.pageExtensions,
        false
      ).then(Boolean)
    }

    let appFile: string | null = null
    let pagesFile: string | null = null

    if (this.appDir) {
      appFile = await findPageFile(
        this.appDir,
        normalizedPath + '/page',
        this.nextConfig.pageExtensions,
        true
      )
    }

    if (this.pagesDir) {
      pagesFile = await findPageFile(
        this.pagesDir,
        normalizedPath,
        this.nextConfig.pageExtensions,
        false
      )
    }
    if (appFile && pagesFile) {
      return false
    }

    return Boolean(appFile || pagesFile)
  }

  async runMiddleware(params: {
    request: NodeNextRequest
    response: NodeNextResponse
    parsedUrl: ParsedUrl
    parsed: UrlWithParsedQuery
    middlewareList: MiddlewareRoutingItem[]
  }) {
    try {
      const result = await super.runMiddleware({
        ...params,
        onWarning: (warn) => {
          this.logErrorWithOriginalStack(warn, 'warning')
        },
      })

      if ('finished' in result) {
        return result
      }

      result.waitUntil.catch((error) => {
        this.logErrorWithOriginalStack(error, 'unhandledRejection')
      })
      return result
    } catch (error) {
      if (error instanceof DecodeError) {
        throw error
      }

      /**
       * We only log the error when it is not a MiddlewareNotFound error as
       * in that case we should be already displaying a compilation error
       * which is what makes the module not found.
       */
      if (!(error instanceof MiddlewareNotFoundError)) {
        this.logErrorWithOriginalStack(error)
      }

      const err = getProperError(error)
      decorateServerError(err, COMPILER_NAMES.edgeServer)
      const { request, response, parsedUrl } = params

      /**
       * When there is a failure for an internal Next.js request from
       * middleware we bypass the error without finishing the request
       * so we can serve the required chunks to render the error.
       */
      if (
        request.url.includes('/_next/static') ||
        request.url.includes('/__nextjs_original-stack-frame') ||
        request.url.includes('/__nextjs_source-map') ||
        request.url.includes('/__nextjs_error_feedback')
      ) {
        return { finished: false }
      }

      response.statusCode = 500
      await this.renderError(err, request, response, parsedUrl.pathname)
      return { finished: true }
    }
  }

  async runEdgeFunction(params: {
    req: NodeNextRequest
    res: NodeNextResponse
    query: ParsedUrlQuery
    params: Params | undefined
    page: string
    appPaths: string[] | null
    isAppPath: boolean
  }) {
    try {
      return super.runEdgeFunction({
        ...params,
        onError: (err) => this.logErrorWithOriginalStack(err, 'app-dir'),
        onWarning: (warn) => {
          this.logErrorWithOriginalStack(warn, 'warning')
        },
      })
    } catch (error) {
      if (error instanceof DecodeError) {
        throw error
      }
      this.logErrorWithOriginalStack(error, 'warning')
      const err = getProperError(error)
      const { req, res, page } = params

      res.statusCode = 500
      await this.renderError(err, req, res, page)
      return null
    }
  }

  public getRequestHandler(): NodeRequestHandler {
    const handler = super.getRequestHandler()

    return (req, res, parsedUrl) => {
      const request = this.normalizeReq(req)
      const response = this.normalizeRes(res)
      const loggingConfig = this.nextConfig.logging

      if (loggingConfig !== false) {
        const start = Date.now()
        const isMiddlewareRequest = getRequestMeta(req, 'middlewareInvoke')

        if (!isMiddlewareRequest) {
          response.originalResponse.once('close', () => {
            // NOTE: The route match is only attached to the request's meta data
            // after the request handler is created, so we need to check it in the
            // close handler and not before.
            const routeMatch = getRequestMeta(req).match

            if (!routeMatch) {
              return
            }

            logRequests({
              request,
              response,
              loggingConfig,
              requestDurationInMs: Date.now() - start,
            })
          })
        }
      }

      return handler(request, response, parsedUrl)
    }
  }

  public async handleRequest(
    req: NodeNextRequest,
    res: NodeNextResponse,
    parsedUrl?: NextUrlWithParsedQuery
  ): Promise<void> {
    const span = trace('handle-request', undefined, { url: req.url })
    const result = await span.traceAsyncFn(async () => {
      await this.ready?.promise
      return await super.handleRequest(req, res, parsedUrl)
    })
    const memoryUsage = process.memoryUsage()
    span
      .traceChild('memory-usage', {
        url: req.url,
        'memory.rss': String(memoryUsage.rss),
        'memory.heapUsed': String(memoryUsage.heapUsed),
        'memory.heapTotal': String(memoryUsage.heapTotal),
      })
      .stop()
    return result
  }

  async run(
    req: NodeNextRequest,
    res: NodeNextResponse,
    parsedUrl: UrlWithParsedQuery
  ): Promise<void> {
    await this.ready?.promise

    const { basePath } = this.nextConfig
    let originalPathname: string | null = null

    // TODO: see if we can remove this in the future
    if (basePath && pathHasPrefix(parsedUrl.pathname || '/', basePath)) {
      // strip basePath before handling dev bundles
      // If replace ends up replacing the full url it'll be `undefined`, meaning we have to default it to `/`
      originalPathname = parsedUrl.pathname
      parsedUrl.pathname = removePathPrefix(parsedUrl.pathname || '/', basePath)
    }

    const { pathname } = parsedUrl

    if (pathname!.startsWith('/_next')) {
      if (fs.existsSync(pathJoin(this.publicDir, '_next'))) {
        throw new Error(PUBLIC_DIR_MIDDLEWARE_CONFLICT)
      }
    }

    if (originalPathname) {
      // restore the path before continuing so that custom-routes can accurately determine
      // if they should match against the basePath or not
      parsedUrl.pathname = originalPathname
    }
    try {
      return await super.run(req, res, parsedUrl)
    } catch (error) {
      const err = getProperError(error)
      formatServerError(err)
      this.logErrorWithOriginalStack(err)
      if (!res.sent) {
        res.statusCode = 500
        try {
          return await this.renderError(err, req, res, pathname!, {
            __NEXT_PAGE: (isError(err) && err.page) || pathname || '',
          })
        } catch (internalErr) {
          console.error(internalErr)
          res.body('Internal Server Error').send()
        }
      }
    }
  }

  protected logErrorWithOriginalStack(
    err?: unknown,
    type?: 'unhandledRejection' | 'uncaughtException' | 'warning' | 'app-dir'
  ): void {
    this.bundlerService.logErrorWithOriginalStack(err, type)
  }

  protected getPagesManifest(): PagesManifest | undefined {
    return (
      NodeManifestLoader.require(
        pathJoin(this.serverDistDir, PAGES_MANIFEST)
      ) ?? undefined
    )
  }

  protected getAppPathsManifest(): PagesManifest | undefined {
    if (!this.enabledDirectories.app) return undefined

    return (
      NodeManifestLoader.require(
        pathJoin(this.serverDistDir, APP_PATHS_MANIFEST)
      ) ?? undefined
    )
  }

  protected getinterceptionRoutePatterns(): RegExp[] {
    const rewrites = generateInterceptionRoutesRewrites(
      Object.keys(this.appPathRoutes ?? {}),
      this.nextConfig.basePath
    ).map((route) => new RegExp(buildCustomRoute('rewrite', route).regex))

    if (this.nextConfig.output === 'export' && rewrites.length > 0) {
      Log.error(
        'Intercepting routes are not supported with static export.\nRead more: https://nextjs.org/docs/app/building-your-application/deploying/static-exports#unsupported-features'
      )

      process.exit(1)
    }

    return rewrites ?? []
  }

  protected getMiddleware() {
    // We need to populate the match
    // field as it isn't serializable
    if (this.middleware?.match === null) {
      this.middleware.match = getMiddlewareRouteMatcher(
        this.middleware.matchers || []
      )
    }
    return this.middleware
  }

  protected getNextFontManifest() {
    return undefined
  }

  protected async hasMiddleware(): Promise<boolean> {
    return this.hasPage(this.actualMiddlewareFile!)
  }

  protected async ensureMiddleware(url: string) {
    return this.ensurePage({
      page: this.actualMiddlewareFile!,
      clientOnly: false,
      definition: undefined,
      url,
    })
  }

  protected async loadInstrumentationModule(): Promise<any> {
    let instrumentationModule: any
    if (
      this.actualInstrumentationHookFile &&
      (await this.ensurePage({
        page: this.actualInstrumentationHookFile!,
        clientOnly: false,
        definition: undefined,
      })
        .then(() => true)
        .catch(() => false))
    ) {
      try {
        instrumentationModule = await require(
          pathJoin(this.distDir, 'server', INSTRUMENTATION_HOOK_FILENAME)
        )
      } catch (err: any) {
        err.message = `An error occurred while loading instrumentation hook: ${err.message}`
        throw err
      }
    }
    return instrumentationModule
  }

  protected async runInstrumentationHookIfAvailable() {
    await this.startServerSpan
      .traceChild('run-instrumentation-hook')
      .traceAsyncFn(() => this.instrumentation?.register?.())
  }

  protected async ensureEdgeFunction({
    page,
    appPaths,
    url,
  }: {
    page: string
    appPaths: string[] | null
    url: string
  }) {
    return this.ensurePage({
      page,
      appPaths,
      clientOnly: false,
      definition: undefined,
      url,
    })
  }

  generateRoutes(_dev?: boolean) {
    // In development we expose all compiled files for react-error-overlay's line show feature
    // We use unshift so that we're sure the routes is defined before Next's default routes
    // routes.unshift({
    //   match: getPathMatch('/_next/development/:path*'),
    //   type: 'route',
    //   name: '_next/development catchall',
    //   fn: async (req, res, params) => {
    //     const p = pathJoin(this.distDir, ...(params.path || []))
    //     await this.serveStatic(req, res, p)
    //     return {
    //       finished: true,
    //     }
    //   },
    // })
  }

  _filterAmpDevelopmentScript(
    html: string,
    event: { line: number; col: number; code: string }
  ): boolean {
    if (event.code !== 'DISALLOWED_SCRIPT_TAG') {
      return true
    }

    const snippetChunks = html.split('\n')

    let snippet
    if (
      !(snippet = html.split('\n')[event.line - 1]) ||
      !(snippet = snippet.substring(event.col))
    ) {
      return true
    }

    snippet = snippet + snippetChunks.slice(event.line).join('\n')
    snippet = snippet.substring(0, snippet.indexOf('</script>'))

    return !snippet.includes('data-amp-development-mode-only')
  }

  protected async getStaticPaths({
    pathname,
    requestHeaders,
    page,
    isAppPath,
  }: {
    pathname: string
    requestHeaders: IncrementalCache['requestHeaders']
    page: string
    isAppPath: boolean
  }): Promise<{
    staticPaths?: string[]
    fallbackMode?: FallbackMode
  }> {
    // we lazy load the staticPaths to prevent the user
    // from waiting on them for the page to load in dev mode

    const __getStaticPaths = async () => {
      const {
        configFileName,
        publicRuntimeConfig,
        serverRuntimeConfig,
        httpAgentOptions,
      } = this.nextConfig
      const { locales, defaultLocale } = this.nextConfig.i18n || {}
      const staticPathsWorker = this.getStaticPathsWorker()

      try {
        const pathsResult = await staticPathsWorker.loadStaticPaths({
          dir: this.dir,
          distDir: this.distDir,
          pathname,
          config: {
            pprConfig: this.nextConfig.experimental.ppr,
            configFileName,
            publicRuntimeConfig,
            serverRuntimeConfig,
            dynamicIO: Boolean(this.nextConfig.experimental.dynamicIO),
          },
          httpAgentOptions,
          locales,
          defaultLocale,
          page,
          isAppPath,
          requestHeaders,
          cacheHandler: this.nextConfig.cacheHandler,
          cacheHandlers: this.nextConfig.experimental.cacheHandlers,
          cacheLifeProfiles: this.nextConfig.experimental.cacheLife,
          fetchCacheKeyPrefix: this.nextConfig.experimental.fetchCacheKeyPrefix,
          isrFlushToDisk: this.nextConfig.experimental.isrFlushToDisk,
          maxMemoryCacheSize: this.nextConfig.cacheMaxMemorySize,
          nextConfigOutput: this.nextConfig.output,
          buildId: this.buildId,
          authInterrupts: Boolean(this.nextConfig.experimental.authInterrupts),
          sriEnabled: Boolean(this.nextConfig.experimental.sri?.algorithm),
        })
        return pathsResult
      } finally {
        // we don't re-use workers so destroy the used one
        staticPathsWorker.end()
      }
    }
    const result = this.staticPathsCache.get(pathname)

    const nextInvoke = withCoalescedInvoke(__getStaticPaths)(
      `staticPaths-${pathname}`,
      []
    )
      .then((res) => {
        const { prerenderedRoutes: staticPaths, fallbackMode: fallback } =
          res.value
        if (!isAppPath && this.nextConfig.output === 'export') {
          if (fallback === FallbackMode.BLOCKING_STATIC_RENDER) {
            throw new Error(
              'getStaticPaths with "fallback: blocking" cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export'
            )
          } else if (fallback === FallbackMode.PRERENDER) {
            throw new Error(
              'getStaticPaths with "fallback: true" cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export'
            )
          }
        }

        const value: {
          staticPaths: string[] | undefined
          fallbackMode: FallbackMode | undefined
        } = {
          staticPaths: staticPaths?.map((route) => route.pathname),
          fallbackMode: fallback,
        }
        this.staticPathsCache.set(pathname, value)
        return value
      })
      .catch((err) => {
        this.staticPathsCache.remove(pathname)
        if (!result) throw err
        Log.error(`Failed to generate static paths for ${pathname}:`)
        console.error(err)
      })

    if (result) {
      return result
    }
    return nextInvoke as NonNullable<typeof result>
  }

  protected async ensurePage(opts: {
    page: string
    clientOnly: boolean
    appPaths?: ReadonlyArray<string> | null
    definition: RouteDefinition | undefined
    url?: string
  }): Promise<void> {
    await this.bundlerService.ensurePage(opts)
  }

  protected async findPageComponents({
    locale,
    page,
    query,
    params,
    isAppPath,
    appPaths = null,
    shouldEnsure,
    url,
  }: {
    locale: string | undefined
    page: string
    query: NextParsedUrlQuery
    params: Params
    isAppPath: boolean
    sriEnabled?: boolean
    appPaths?: ReadonlyArray<string> | null
    shouldEnsure: boolean
    url?: string
  }): Promise<FindComponentsResult | null> {
    await this.ready?.promise

    const compilationErr = await this.getCompilationError(page)
    if (compilationErr) {
      // Wrap build errors so that they don't get logged again
      throw new WrappedBuildError(compilationErr)
    }
    if (shouldEnsure || this.serverOptions.customServer) {
      await this.ensurePage({
        page,
        appPaths,
        clientOnly: false,
        definition: undefined,
        url,
      })
    }

    this.nextFontManifest = super.getNextFontManifest()

    return await super.findPageComponents({
      page,
      query,
      params,
      locale,
      isAppPath,
      shouldEnsure,
      url,
    })
  }

  protected async getFallbackErrorComponents(
    url?: string
  ): Promise<LoadComponentsReturnType | null> {
    await this.bundlerService.getFallbackErrorComponents(url)
    return await loadDefaultErrorComponents(this.distDir)
  }

  async getCompilationError(page: string): Promise<any> {
    return await this.bundlerService.getCompilationError(page)
  }

  protected async instrumentationOnRequestError(
    ...args: Parameters<ServerOnInstrumentationRequestError>
  ) {
    await super.instrumentationOnRequestError(...args)

    const err = args[0]
    this.logErrorWithOriginalStack(err, 'app-dir')
  }
}
