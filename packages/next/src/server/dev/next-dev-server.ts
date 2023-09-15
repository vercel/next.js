import type { FindComponentsResult } from '../next-server'
import type { LoadComponentsReturnType } from '../load-components'
import type { Options as ServerOptions } from '../next-server'
import type { Params } from '../../shared/lib/router/utils/route-matcher'
import type { ParsedUrl } from '../../shared/lib/router/utils/parse-url'
import type { ParsedUrlQuery } from 'querystring'
import type { UrlWithParsedQuery } from 'url'
import type { BaseNextRequest, BaseNextResponse } from '../base-http'
import type { FallbackMode, MiddlewareRoutingItem } from '../base-server'
import type { FunctionComponent } from 'react'
import type {
  NextParsedUrlQuery,
  NextUrlWithParsedQuery,
} from '../request-meta'
import type { RouteDefinition } from '../future/route-definitions/route-definition'
import type { InternalRootRouteDefinition } from '../future/route-definitions/internal-route-definition'

import { Worker } from 'next/dist/compiled/jest-worker'
import { join as pathJoin } from 'path'
import { ampValidation } from '../../build/output'
import {
  INSTRUMENTATION_HOOK_FILENAME,
  PUBLIC_DIR_MIDDLEWARE_CONFLICT,
} from '../../lib/constants'
import { fileExists } from '../../lib/file-exists'
import { findPagesDir } from '../../lib/find-pages-dir'
import { PHASE_DEVELOPMENT_SERVER } from '../../shared/lib/constants'
import Server, { WrappedBuildError } from '../next-server'
import { pathHasPrefix } from '../../shared/lib/router/utils/path-has-prefix'
import { removePathPrefix } from '../../shared/lib/router/utils/remove-path-prefix'
import { Telemetry } from '../../telemetry/storage'
import { setGlobal } from '../../trace'
import { getNodeOptionsWithoutInspect } from '../lib/utils'
import {
  UnwrapPromise,
  withCoalescedInvoke,
} from '../../lib/coalesced-function'
import { loadDefaultErrorComponents } from '../load-default-error-components'
import { DecodeError, MiddlewareNotFoundError } from '../../shared/lib/utils'
import * as Log from '../../build/output/log'
import isError, { getProperError } from '../../lib/is-error'
import { NodeNextResponse, NodeNextRequest } from '../base-http/node'
import { formatServerError } from '../../lib/format-server-error'
import { NextBuildContext } from '../../build/build-context'
import { IncrementalCache } from '../lib/incremental-cache'
import LRUCache from 'next/dist/compiled/lru-cache'
import { getMiddlewareRouteMatcher } from '../../shared/lib/router/utils/middleware-route-matcher'
import { BaseRouteComponentsLoader } from '../future/route-components-loader/base-route-components-loader'
import { NextDevRouteDefinitionManagerBuilder } from '../future/route-definitions/managers/builders/next-dev-route-definition-manager-builder'
import {
  RouteEnsurer,
  DevRouteManager,
} from '../future/route-manager/dev-route-manager'
import { NextRouteMatcherBuilder } from '../future/route-matchers/managers/builders/next-route-matcher-manager-builder'
import { RouteKind } from '../future/route-kind'

// Load ReactDevOverlay only when needed
let ReactDevOverlayImpl: FunctionComponent
const ReactDevOverlay = (props: any) => {
  if (ReactDevOverlayImpl === undefined) {
    ReactDevOverlayImpl =
      require('next/dist/compiled/@next/react-dev-overlay/dist/client').ReactDevOverlay
  }
  return ReactDevOverlayImpl(props)
}

export interface Options extends ServerOptions {
  /**
   * Tells of Next.js is running from the `next dev` command
   */
  isNextDevCommand?: boolean
}

export default class DevServer extends Server {
  private devReady: Promise<void>
  private setDevReady?: Function
  protected sortedRoutes?: string[]
  private pagesDir?: string
  private appDir?: string
  private middleware?: MiddlewareRoutingItem
  private originalFetch: typeof fetch
  private staticPathsCache: LRUCache<
    string,
    UnwrapPromise<ReturnType<DevServer['getStaticPaths']>>
  >

  private invokeDevMethod({ method, args }: { method: string; args: any[] }) {
    return (global as any)._nextDevHandlers[method](this.dir, ...args)
  }

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
          NODE_OPTIONS: getNodeOptionsWithoutInspect(),
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
    this.originalFetch = global.fetch
    this.renderOpts.dev = true
    this.renderOpts.appDirDevErrorLogger = (err: any) =>
      this.logErrorWithOriginalStack(err, 'app-dir')
    ;(this.renderOpts as any).ErrorDebug = ReactDevOverlay
    this.devReady = new Promise((resolve) => {
      this.setDevReady = resolve
    })
    this.staticPathsCache = new LRUCache({
      // 5MB
      max: 5 * 1024 * 1024,
      length(value) {
        return JSON.stringify(value.staticPaths).length
      },
    })
    ;(this.renderOpts as any).ampSkipValidation =
      this.nextConfig.experimental?.amp?.skipValidation ?? false
    ;(this.renderOpts as any).ampValidator = (
      html: string,
      pathname: string
    ) => {
      const validatorPath =
        this.nextConfig.experimental &&
        this.nextConfig.experimental.amp &&
        this.nextConfig.experimental.amp.validator
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

    const definitions = NextDevRouteDefinitionManagerBuilder.build(
      this.dir,
      this.nextConfig.pageExtensions,
      this.i18nProvider
    )

    const ensurer: RouteEnsurer = {
      ensure: async (definition) => {
        // Ensure the page. Once this is finished we have to check if there is a
        // compilation error. If there is, we throw it so that the route manager
        // can handle it.
        await this.ensurePage({
          page: definition.page,
          clientOnly: false,
          definition,
        })

        // If there is a compilation error, we throw it so that the route
        // manager can handle it.
        // TODO: maybe we can have the ensure method throw the error instead?
        const err = await this.getCompilationError(definition.page)
        if (!err) return

        // Wrap build errors so that they don't get logged again
        throw new WrappedBuildError(err)
      },
    }

    // Configure the route manager to use the development definitions.
    this.routes = new DevRouteManager(
      this.routes,
      ensurer,
      new BaseRouteComponentsLoader(this.distDir),
      definitions,
      NextRouteMatcherBuilder.build(definitions)
    )
  }

  protected getBuildId(): string {
    return 'development'
  }

  protected async prepareImpl(): Promise<void> {
    setGlobal('distDir', this.distDir)
    setGlobal('phase', PHASE_DEVELOPMENT_SERVER)

    const telemetry = new Telemetry({ distDir: this.distDir })

    await super.prepareImpl()
    await this.runInstrumentationHookIfAvailable()
    await this.routes.load()
    this.setDevReady!()

    // This is required by the tracing subsystem.
    setGlobal('appDir', this.appDir)
    setGlobal('pagesDir', this.pagesDir)
    setGlobal('telemetry', telemetry)

    process.on('unhandledRejection', (reason) => {
      this.logErrorWithOriginalStack(reason, 'unhandledRejection').catch(
        () => {}
      )
    })
    process.on('uncaughtException', (err) => {
      this.logErrorWithOriginalStack(err, 'uncaughtException').catch(() => {})
    })
  }

  protected async close(): Promise<void> {}

  async runMiddleware(params: {
    request: BaseNextRequest
    response: BaseNextResponse
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
      ;(err as any).middleware = true
      const { request, response, parsedUrl } = params

      /**
       * When there is a failure for an internal Next.js request from
       * middleware we bypass the error without finishing the request
       * so we can serve the required chunks to render the error.
       */
      if (
        request.url.includes('/_next/static') ||
        request.url.includes('/__nextjs_original-stack-frame')
      ) {
        return { finished: false }
      }

      response.statusCode = 500
      await this.renderError(err, request, response, parsedUrl.pathname)
      return { finished: true }
    }
  }

  protected async runEdgeFunction(params: {
    req: BaseNextRequest
    res: BaseNextResponse
    query: ParsedUrlQuery
    params: Params | undefined
    page: string
  }) {
    try {
      return super.runEdgeFunction({
        ...params,
        onWarning: (warn) => {
          this.logErrorWithOriginalStack(warn, 'warning')
        },
      })
    } catch (err) {
      if (err instanceof DecodeError) {
        throw err
      }

      this.logErrorWithOriginalStack(err, 'warning')
      const { req, res } = params

      res.statusCode = 500
      await this.renderError(getProperError(err), req, res, params.page)
      return null
    }
  }

  public async handleRequest(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl?: NextUrlWithParsedQuery
  ): Promise<void> {
    await this.devReady
    return await super.handleRequest(req, res, parsedUrl)
  }

  async run(
    req: NodeNextRequest,
    res: NodeNextResponse,
    parsedUrl: UrlWithParsedQuery
  ): Promise<void> {
    await this.devReady

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
      if (await fileExists(pathJoin(this.publicDir, '_next'))) {
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
      this.logErrorWithOriginalStack(err).catch(() => {})
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

  protected async logErrorWithOriginalStack(
    err?: unknown,
    type?: 'unhandledRejection' | 'uncaughtException' | 'warning' | 'app-dir'
  ): Promise<void> {
    if (this.isRenderWorker) {
      await this.invokeDevMethod({
        method: 'logErrorWithOriginalStack',
        args: [err, type],
      })
      return
    }
    throw new Error(
      'Invariant logErrorWithOriginalStack called outside render worker'
    )
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
    return this.routes.hasDefinition(
      {
        kind: RouteKind.INTERNAL_ROOT,
        page: '/middleware',
      },
      {
        kind: RouteKind.INTERNAL_ROOT,
        page: '/src/middleware',
      }
    )
  }

  protected async handleCatchallMiddlewareRequest(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsed: NextUrlWithParsedQuery
  ) {
    await this.ensureMiddleware()

    return super.handleCatchallMiddlewareRequest(req, res, parsed)
  }

  protected async ensureMiddleware() {
    try {
      const definition = await this.routes.findDefinition(
        {
          kind: RouteKind.INTERNAL_ROOT,
          page: '/middleware',
        },
        {
          kind: RouteKind.INTERNAL_ROOT,
          page: '/src/middleware',
        }
      )
      if (!definition) return

      return this.ensurePage({
        page: definition.page,
        clientOnly: false,
        definition,
      })
    } catch (err) {
      console.error(err)
    }
  }

  private async runInstrumentationHookIfAvailable() {
    let definition: InternalRootRouteDefinition | null = null
    try {
      definition =
        await this.routes.findDefinition<InternalRootRouteDefinition>(
          {
            kind: RouteKind.INTERNAL_ROOT,
            page: `/src/${INSTRUMENTATION_HOOK_FILENAME}`,
          },
          {
            kind: RouteKind.INTERNAL_ROOT,
            page: `/${INSTRUMENTATION_HOOK_FILENAME}`,
          }
        )
    } catch {}

    // If the instrumentation hook doesn't exist, we don't need to run it.
    if (!definition) return

    NextBuildContext!.hasInstrumentationHook = true

    try {
      const instrumentationHook = await require(definition.filename)
      await instrumentationHook.register()
    } catch (err: any) {
      err.message = `An error occurred while loading instrumentation hook: ${err.message}`
      throw err
    }
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
    fallbackMode?: false | 'static' | 'blocking'
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
          distDir: this.distDir,
          pathname,
          config: {
            configFileName,
            publicRuntimeConfig,
            serverRuntimeConfig,
          },
          httpAgentOptions,
          locales,
          defaultLocale,
          page,
          isAppPath,
          requestHeaders,
          incrementalCacheHandlerPath:
            this.nextConfig.experimental.incrementalCacheHandlerPath,
          fetchCacheKeyPrefix: this.nextConfig.experimental.fetchCacheKeyPrefix,
          isrFlushToDisk: this.nextConfig.experimental.isrFlushToDisk,
          maxMemoryCacheSize: this.nextConfig.experimental.isrMemoryCacheSize,
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
        const { paths: staticPaths = [], fallback } = res.value
        if (!isAppPath && this.nextConfig.output === 'export') {
          if (fallback === 'blocking') {
            throw new Error(
              'getStaticPaths with "fallback: blocking" cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export'
            )
          } else if (fallback === true) {
            throw new Error(
              'getStaticPaths with "fallback: true" cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export'
            )
          }
        }
        const value: {
          staticPaths: string[]
          fallbackMode: FallbackMode
        } = {
          staticPaths,
          fallbackMode:
            fallback === 'blocking'
              ? 'blocking'
              : fallback === true
              ? 'static'
              : fallback,
        }
        this.staticPathsCache.set(pathname, value)
        return value
      })
      .catch((err) => {
        this.staticPathsCache.del(pathname)
        if (!result) throw err
        Log.error(`Failed to generate static paths for ${pathname}:`)
        console.error(err)
      })

    if (result) {
      return result
    }
    return nextInvoke as NonNullable<typeof result>
  }

  private restorePatchedGlobals(): void {
    global.fetch = this.originalFetch
  }

  protected async ensurePage(opts: {
    page: string
    clientOnly: boolean
    definition: RouteDefinition | null
  }): Promise<void> {
    if (!this.isRenderWorker) {
      throw new Error('Invariant ensurePage called outside render worker')
    }

    await this.invokeDevMethod({
      method: 'ensurePage',
      args: [opts],
    })
  }

  protected async findPageComponents({
    page,
    query,
    params,
    definition,
  }: {
    page: string
    query: NextParsedUrlQuery
    params: Params
    definition: RouteDefinition
  }): Promise<FindComponentsResult | null> {
    await this.devReady

    const compilationErr = await this.getCompilationError(page)
    if (compilationErr) {
      // Wrap build errors so that they don't get logged again
      throw new WrappedBuildError(compilationErr)
    }

    try {
      this.nextFontManifest = super.getNextFontManifest()
      // before we re-evaluate a route module, we want to restore globals that might
      // have been patched previously to their original state so that we don't
      // patch on top of the previous patch, which would keep the context of the previous
      // patched global in memory, creating a memory leak.
      this.restorePatchedGlobals()

      return await super.findPageComponents({
        definition,
        query,
        params,
      })
    } catch (err) {
      if ((err as any).code !== 'ENOENT') {
        throw err
      }
      return null
    }
  }

  protected async getFallbackErrorComponents(): Promise<LoadComponentsReturnType | null> {
    if (this.isRenderWorker) {
      await this.invokeDevMethod({
        method: 'getFallbackErrorComponents',
        args: [],
      })
      return await loadDefaultErrorComponents(this.distDir)
    }
    throw new Error(
      `Invariant getFallbackErrorComponents called outside render worker`
    )
  }

  async getCompilationError(page: string): Promise<any> {
    if (this.isRenderWorker) {
      return await this.invokeDevMethod({
        method: 'getCompilationError',
        args: [page],
      })
    }
    throw new Error(
      'Invariant getCompilationError called outside render worker'
    )
  }
}
