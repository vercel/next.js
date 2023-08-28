import './node-environment'
import './require-hook'
import './node-polyfill-fetch'
import './node-polyfill-form'
import './node-polyfill-web-streams'
import './node-polyfill-crypto'

import type { TLSSocket } from 'tls'
import { CacheFs, PageNotFoundError } from '../shared/lib/utils'
import type RenderResult from './render-result'
import type { PrerenderManifest } from '../build'
import { BaseNextRequest, BaseNextResponse } from './base-http'
import type { PagesManifest } from '../build/webpack/plugins/pages-manifest-plugin'
import type { PayloadOptions } from './send-payload'
import type { NextParsedUrlQuery, NextUrlWithParsedQuery } from './request-meta'
import {
  getRouteMatcher,
  Params,
} from '../shared/lib/router/utils/route-matcher'
import { renderToHTML, type RenderOpts } from './render'

import fs from 'fs'
import { join, resolve, isAbsolute } from 'path'
import { IncomingMessage, ServerResponse } from 'http'
import type { PagesAPIRouteModule } from './future/route-modules/pages-api/module'
import type { MiddlewareManifest } from '../build/webpack/plugins/middleware-plugin'
import { addRequestMeta } from './request-meta'
import {
  PAGES_MANIFEST,
  BUILD_ID_FILE,
  PRERENDER_MANIFEST,
  ROUTES_MANIFEST,
  APP_PATHS_MANIFEST,
  NEXT_FONT_MANIFEST,
  PHASE_PRODUCTION_BUILD,
  MIDDLEWARE_MANIFEST,
} from '../shared/lib/constants'
import { findDir } from '../lib/find-pages-dir'
import { getPathMatch } from '../shared/lib/router/utils/path-match'
import getRouteFromAssetPath from '../shared/lib/router/utils/get-route-from-asset-path'
import { NodeNextRequest, NodeNextResponse } from './base-http/node'
import { sendRenderResult } from './send-payload'
import { ParsedUrlQuery } from 'querystring'
import * as Log from '../build/output/log'

import BaseServer, {
  Options,
  FindComponentsResult,
  RequestContext,
} from './base-server'
import { getMaybePagePath, getPagePath, requireFontManifest } from './require'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { loadComponents } from './load-components'
import { FontManifest } from './font-utils'
import { loadEnvConfig } from '@next/env'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { getCloneableBody } from './body-streams'
import { IncrementalCache } from './lib/incremental-cache'
import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'

import { setHttpClientAndAgentOptions } from './setup-http-agent-env'
import { RouteKind } from './future/route-kind'

import { PagesAPIRouteMatch } from './future/route-matches/pages-api-route-match'
import { MatchOptions } from './future/route-matcher-managers/route-matcher-manager'
import { INSTRUMENTATION_HOOK_FILENAME } from '../lib/constants'
import { getTracer } from './lib/trace/tracer'
import { NextNodeServerSpan } from './lib/trace/constants'
import { nodeFs } from './lib/node-fs-methods'
import { getRouteRegex } from '../shared/lib/router/utils/route-regex'
import chalk from 'next/dist/compiled/chalk'
import { RouteModuleLoader } from './future/helpers/module-loader/route-module-loader'
import { loadManifest } from './load-manifest'
import { RouteMatch } from './future/route-matches/route-match'

export * from './base-server'

export interface NodeRequestHandler {
  (
    req: IncomingMessage | BaseNextRequest,
    res: ServerResponse | BaseNextResponse,
    parsedUrl?: NextUrlWithParsedQuery | undefined
  ): Promise<void>
}

export default class NextNodeServer extends BaseServer {
  protected dynamicRoutes?: {
    match: import('../shared/lib/router/utils/route-matcher').RouteMatchFn
    page: string
    re: RegExp
  }[]

  constructor(options: Options) {
    // Initialize super class
    super(options)

    /**
     * This sets environment variable to be used at the time of SSR by head.tsx.
     * Using this from process.env allows targeting SSR by calling
     * `process.env.__NEXT_OPTIMIZE_CSS`.
     */
    if (this.renderOpts.optimizeFonts) {
      process.env.__NEXT_OPTIMIZE_FONTS = JSON.stringify(
        this.renderOpts.optimizeFonts
      )
    }
    if (this.renderOpts.optimizeCss) {
      process.env.__NEXT_OPTIMIZE_CSS = JSON.stringify(true)
    }
    if (this.renderOpts.nextScriptWorkers) {
      process.env.__NEXT_SCRIPT_WORKERS = JSON.stringify(true)
    }

    if (this.nextConfig.experimental.deploymentId) {
      process.env.NEXT_DEPLOYMENT_ID = this.nextConfig.experimental.deploymentId
    }

    const { appDocumentPreloading } = this.nextConfig.experimental
    const isDefaultEnabled = typeof appDocumentPreloading === 'undefined'

    if (
      !options.dev &&
      (appDocumentPreloading === true ||
        !(this.minimalMode && isDefaultEnabled))
    ) {
      // pre-warm _document and _app as these will be
      // needed for most requests
      loadComponents({
        distDir: this.distDir,
        pathname: '/_document',
        isAppPath: false,
      }).catch(() => {})
      loadComponents({
        distDir: this.distDir,
        pathname: '/_app',
        isAppPath: false,
      }).catch(() => {})
    }

    if (!options.dev) {
      const routesManifest = this.getRoutesManifest() as {
        dynamicRoutes: {
          page: string
          regex: string
          namedRegex?: string
          routeKeys?: { [key: string]: string }
        }[]
      }
      this.dynamicRoutes = routesManifest.dynamicRoutes.map((r) => {
        const regex = getRouteRegex(r.page)
        const match = getRouteMatcher(regex)

        return {
          match,
          page: r.page,
          regex: regex.re,
        }
      }) as any
    }

    // ensure options are set when loadConfig isn't called
    setHttpClientAndAgentOptions(this.nextConfig)

    // Intercept fetch and other testmode apis.
    if (this.serverOptions.experimentalTestProxy) {
      const { interceptTestApis } = require('../experimental/testmode/server')
      interceptTestApis()
    }
  }

  protected async prepareImpl() {
    await super.prepareImpl()
    if (
      !this.serverOptions.dev &&
      this.nextConfig.experimental.instrumentationHook
    ) {
      try {
        const instrumentationHook = await require(resolve(
          this.serverOptions.dir || '.',
          this.serverOptions.conf.distDir!,
          'server',
          INSTRUMENTATION_HOOK_FILENAME
        ))
        await instrumentationHook.register?.()
      } catch (err: any) {
        if (err.code !== 'MODULE_NOT_FOUND') {
          err.message = `An error occurred while loading instrumentation hook: ${err.message}`
          throw err
        }
      }
    }
  }

  protected loadEnvConfig({
    dev,
    forceReload,
    silent,
  }: {
    dev: boolean
    forceReload?: boolean
    silent?: boolean
  }) {
    loadEnvConfig(
      this.dir,
      dev,
      silent ? { info: () => {}, error: () => {} } : Log,
      forceReload
    )
  }

  protected getIncrementalCache({
    requestHeaders,
    requestProtocol,
  }: {
    requestHeaders: IncrementalCache['requestHeaders']
    requestProtocol: 'http' | 'https'
  }) {
    const dev = !!this.renderOpts.dev
    let CacheHandler: any
    const { incrementalCacheHandlerPath } = this.nextConfig.experimental

    if (incrementalCacheHandlerPath) {
      CacheHandler = require(isAbsolute(incrementalCacheHandlerPath)
        ? incrementalCacheHandlerPath
        : join(this.distDir, incrementalCacheHandlerPath))
      CacheHandler = CacheHandler.default || CacheHandler
    }

    // incremental-cache is request specific
    // although can have shared caches in module scope
    // per-cache handler
    return new IncrementalCache({
      fs: this.getCacheFilesystem(),
      dev,
      requestHeaders,
      requestProtocol,
      appDir: this.hasAppDir,
      allowedRevalidateHeaderKeys:
        this.nextConfig.experimental.allowedRevalidateHeaderKeys,
      minimalMode: this.minimalMode,
      serverDistDir: this.serverDistDir,
      fetchCache: this.nextConfig.experimental.appDir,
      fetchCacheKeyPrefix: this.nextConfig.experimental.fetchCacheKeyPrefix,
      maxMemoryCacheSize: this.nextConfig.experimental.isrMemoryCacheSize,
      flushToDisk:
        !this.minimalMode && this.nextConfig.experimental.isrFlushToDisk,
      getPrerenderManifest: () => this.getPrerenderManifest(),
      CurCacheHandler: CacheHandler,
    })
  }

  protected getPagesManifest(): PagesManifest | undefined {
    return loadManifest(join(this.serverDistDir, PAGES_MANIFEST))
  }

  protected getAppPathsManifest(): PagesManifest | undefined {
    if (!this.hasAppDir) return undefined

    return loadManifest(join(this.serverDistDir, APP_PATHS_MANIFEST))
  }

  protected async hasPage(pathname: string): Promise<boolean> {
    return !!getMaybePagePath(
      pathname,
      this.distDir,
      this.nextConfig.i18n?.locales,
      this.hasAppDir
    )
  }

  protected getBuildId(): string {
    const buildIdFile = join(this.distDir, BUILD_ID_FILE)
    try {
      return fs.readFileSync(buildIdFile, 'utf8').trim()
    } catch (err) {
      if (!fs.existsSync(buildIdFile)) {
        throw new Error(
          `Could not find a production build in the '${this.distDir}' directory. Try building your app with 'next build' before starting the production server. https://nextjs.org/docs/messages/production-start-no-build-id`
        )
      }

      throw err
    }
  }

  protected getHasAppDir(dev: boolean): boolean {
    return Boolean(findDir(dev ? this.dir : this.serverDistDir, 'app'))
  }

  protected sendRenderResult(
    req: NodeNextRequest,
    res: NodeNextResponse,
    options: {
      result: RenderResult
      type: 'html' | 'json'
      generateEtags: boolean
      poweredByHeader: boolean
      options?: PayloadOptions | undefined
    }
  ): Promise<void> {
    return sendRenderResult({
      req: req.originalRequest,
      res: res.originalResponse,
      ...options,
    })
  }

  protected async runApi(
    req: BaseNextRequest | NodeNextRequest,
    res: BaseNextResponse | NodeNextResponse,
    query: ParsedUrlQuery,
    match: PagesAPIRouteMatch
  ): Promise<boolean> {
    // The module supports minimal mode, load the minimal module.
    const module = await RouteModuleLoader.load<PagesAPIRouteModule>(
      match.definition.filename
    )

    query = { ...query, ...match.params }

    delete query.__nextLocale
    delete query.__nextDefaultLocale
    delete query.__nextInferredLocaleFromDefault

    await module.render(
      (req as NodeNextRequest).originalRequest,
      (res as NodeNextResponse).originalResponse,
      {
        previewProps: this.renderOpts.previewProps,
        trustHostHeader: this.nextConfig.experimental.trustHostHeader,
        allowedRevalidateHeaderKeys:
          this.nextConfig.experimental.allowedRevalidateHeaderKeys,
        hostname: this.fetchHostname,
        minimalMode: this.minimalMode,
        dev: this.renderOpts.dev === true,
        query,
        params: match.params,
        page: match.definition.pathname,
      }
    )

    return true
  }

  protected async renderHTML(
    req: NodeNextRequest,
    res: NodeNextResponse,
    pathname: string,
    query: NextParsedUrlQuery,
    renderOpts: RenderOpts
  ): Promise<RenderResult> {
    return getTracer().trace(NextNodeServerSpan.renderHTML, async () =>
      this.renderHTMLImpl(req, res, pathname, query, renderOpts)
    )
  }

  private async renderHTMLImpl(
    req: NodeNextRequest,
    res: NodeNextResponse,
    pathname: string,
    query: NextParsedUrlQuery,
    renderOpts: RenderOpts
  ): Promise<RenderResult> {
    // Due to the way we pass data by mutating `renderOpts`, we can't extend the
    // object here but only updating its `nextFontManifest` field.
    // https://github.com/vercel/next.js/blob/df7cbd904c3bd85f399d1ce90680c0ecf92d2752/packages/next/server/render.tsx#L947-L952
    renderOpts.nextFontManifest = this.nextFontManifest

    if (this.hasAppDir && renderOpts.isAppPath) {
      const { renderToHTMLOrFlight: appRenderToHTMLOrFlight } =
        require('./app-render/app-render') as typeof import('./app-render/app-render')
      return appRenderToHTMLOrFlight(
        req.originalRequest,
        res.originalResponse,
        pathname,
        query,
        renderOpts
      )
    }

    // TODO: re-enable this once we've refactored to use implicit matches
    // throw new Error('Invariant: render should have used routeModule')

    return renderToHTML(
      req.originalRequest,
      res.originalResponse,
      pathname,
      query,
      renderOpts
    )
  }

  protected getPagePath(pathname: string, locales?: string[]): string {
    return getPagePath(pathname, this.distDir, locales, this.hasAppDir)
  }

  protected async renderPageComponent(ctx: RequestContext) {
    return super.renderPageComponent(ctx)
  }

  protected async findPageComponents({
    pathname,
    query,
    params,
    isAppPath,
  }: {
    pathname: string
    query: NextParsedUrlQuery
    params: Params | null
    isAppPath: boolean
  }): Promise<FindComponentsResult | null> {
    let route = pathname
    if (isAppPath) {
      // When in App we get page instead of route
      route = pathname.replace(/\/[^/]*$/, '')
    }

    return getTracer().trace(
      NextNodeServerSpan.findPageComponents,
      {
        spanName: `resolving page into components`,
        attributes: {
          'next.route': route,
        },
      },
      () => this.findPageComponentsImpl({ pathname, query, params, isAppPath })
    )
  }

  private async findPageComponentsImpl({
    pathname,
    query,
    params,
    isAppPath,
  }: {
    pathname: string
    query: NextParsedUrlQuery
    params: Params | null
    isAppPath: boolean
  }): Promise<FindComponentsResult | null> {
    const paths: string[] = [pathname]
    if (query.amp) {
      // try serving a static AMP version first
      paths.unshift(
        (isAppPath ? normalizeAppPath(pathname) : normalizePagePath(pathname)) +
          '.amp'
      )
    }

    if (query.__nextLocale) {
      paths.unshift(
        ...paths.map(
          (path) => `/${query.__nextLocale}${path === '/' ? '' : path}`
        )
      )
    }

    for (const pagePath of paths) {
      try {
        const components = await loadComponents({
          distDir: this.distDir,
          pathname: pagePath,
          isAppPath,
        })

        if (
          query.__nextLocale &&
          typeof components.Component === 'string' &&
          !pagePath.startsWith(`/${query.__nextLocale}`)
        ) {
          // if loading an static HTML file the locale is required
          // to be present since all HTML files are output under their locale
          continue
        }

        return {
          components,
          query: {
            ...(components.getStaticProps
              ? ({
                  amp: query.amp,
                  __nextDataReq: query.__nextDataReq,
                  __nextLocale: query.__nextLocale,
                  __nextDefaultLocale: query.__nextDefaultLocale,
                } as NextParsedUrlQuery)
              : query),
            // For appDir params is excluded.
            ...((isAppPath ? {} : params) || {}),
          },
        }
      } catch (err) {
        // we should only not throw if we failed to find the page
        // in the pages-manifest
        if (!(err instanceof PageNotFoundError)) {
          throw err
        }
      }
    }
    return null
  }

  protected getFontManifest(): FontManifest {
    return requireFontManifest(this.distDir)
  }

  protected getNextFontManifest() {
    return loadManifest(
      join(this.distDir, 'server', NEXT_FONT_MANIFEST + '.json')
    )
  }

  protected async getFallback(page: string): Promise<string> {
    page = normalizePagePath(page)
    const cacheFs = this.getCacheFilesystem()
    const html = await cacheFs.readFile(
      join(this.serverDistDir, 'pages', `${page}.html`)
    )

    return html.toString('utf8')
  }

  /**
   * Checks if a middleware exists. This method is useful for the development
   * server where we need to check the filesystem. Here we just check the
   * middleware manifest.
   */
  protected hasMiddleware(): boolean {
    try {
      const manifest = require(join(
        this.serverDistDir,
        MIDDLEWARE_MANIFEST
      )) as MiddlewareManifest
      return !!manifest.middleware['/']
    } catch (_) {
      return false
    }
  }

  protected async normalizeNextData(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl: NextUrlWithParsedQuery
  ) {
    const params = getPathMatch('/_next/data/:path*')(parsedUrl.pathname)

    // ignore for non-next data URLs
    if (!params || !params.path) {
      return {
        finished: false,
      }
    }

    if (params.path[0] !== this.buildId) {
      // ignore if its a middleware request
      if (req.headers['x-middleware-invoke']) {
        return {
          finished: false,
        }
      }

      // Make sure to 404 if the buildId isn't correct
      await this.render404(req, res, parsedUrl)
      return {
        finished: true,
      }
    }

    // remove buildId from URL
    params.path.shift()

    const lastParam = params.path[params.path.length - 1]

    // show 404 if it doesn't end with .json
    if (typeof lastParam !== 'string' || !lastParam.endsWith('.json')) {
      await this.render404(req, res, parsedUrl)
      return {
        finished: true,
      }
    }

    // re-create page's pathname
    let pathname = `/${params.path.join('/')}`
    pathname = getRouteFromAssetPath(pathname, '.json')

    // ensure trailing slash is normalized per config
    if (this.hasMiddleware()) {
      if (this.nextConfig.trailingSlash && !pathname.endsWith('/')) {
        pathname += '/'
      }
      if (
        !this.nextConfig.trailingSlash &&
        pathname.length > 1 &&
        pathname.endsWith('/')
      ) {
        pathname = pathname.substring(0, pathname.length - 1)
      }
    }

    if (this.i18nProvider) {
      // Remove the port from the hostname if present.
      const hostname = req?.headers.host?.split(':')[0].toLowerCase()

      const domainLocale = this.i18nProvider.detectDomainLocale(hostname)
      const defaultLocale =
        domainLocale?.defaultLocale ?? this.i18nProvider.config.defaultLocale

      const localePathResult = this.i18nProvider.analyze(pathname)

      // If the locale is detected from the path, we need to remove it
      // from the pathname.
      if (localePathResult.detectedLocale) {
        pathname = localePathResult.pathname
      }

      // Update the query with the detected locale and default locale.
      parsedUrl.query.__nextLocale = localePathResult.detectedLocale
      parsedUrl.query.__nextDefaultLocale = defaultLocale

      // If the locale is not detected from the path, we need to mark that
      // it was not inferred from default.
      if (!parsedUrl.query.__nextLocale) {
        delete parsedUrl.query.__nextInferredLocaleFromDefault
      }

      // If no locale was detected and we don't have middleware, we need
      // to render a 404 page.
      // NOTE: (wyattjoh) we may need to change this for app/
      if (!localePathResult.detectedLocale && !this.hasMiddleware()) {
        parsedUrl.query.__nextLocale = defaultLocale
        await this.render404(req, res, parsedUrl)
        return { finished: true }
      }
    }

    parsedUrl.pathname = pathname
    parsedUrl.query.__nextDataReq = '1'

    return {
      finished: false,
    }
  }

  protected async handleCatchallRenderRequest(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl: NextUrlWithParsedQuery
  ) {
    let { pathname, query } = parsedUrl

    if (!pathname) {
      throw new Error('pathname is undefined')
    }

    try {
      // next.js core assumes page path without trailing slash
      pathname = removeTrailingSlash(pathname)

      const options: MatchOptions = {
        i18n: this.i18nProvider?.fromQuery(pathname, query),
      }
      const match = await this.matchers.match(pathname, options)

      // Try to handle the given route with the configured handlers.
      if (match) {
        // Add the match to the request so we don't have to re-run the matcher
        // for the same request.
        addRequestMeta(req, '_nextMatch', match)
        let handled = false

        // If the route was detected as being a Pages API route, then handle
        // it.
        // TODO: move this behavior into a route handler.
        if (match.definition.kind === RouteKind.PAGES_API) {
          if (this.nextConfig.output === 'export') {
            await this.render404(req, res, parsedUrl)
            return { finished: true }
          }

          handled = await this.handleApiRequest(
            req,
            res,
            query,
            // TODO: see if we can add a runtime check for this
            match as PagesAPIRouteMatch
          )
          if (handled) return { finished: true }
        }
        // else if (match.definition.kind === RouteKind.METADATA_ROUTE) {
        //   handled = await this.handlers.handle(match, req, res)
        //   if (handled) return { finished: true }
        // }
      }
      await this.render(req, res, pathname, query, parsedUrl)

      return {
        finished: true,
      }
    } catch (err: any) {
      try {
        if (this.renderOpts.dev) {
          const { formatServerError } =
            require('../lib/format-server-error') as typeof import('../lib/format-server-error')
          formatServerError(err)
          await this.logErrorWithOriginalStack(err)
        } else {
          this.logError(err)
        }
        res.statusCode = 500
        await this.renderError(err, req, res, pathname, query)
        return {
          finished: true,
        }
      } catch {}

      throw err
    }
  }

  // Used in development only, overloaded in next-dev-server
  protected async logErrorWithOriginalStack(..._args: any[]): Promise<void> {
    throw new Error(
      'logErrorWithOriginalStack can only be called on the development server'
    )
  }

  // Used in development only, overloaded in next-dev-server
  protected async ensurePage(_opts: {
    page: string
    clientOnly: boolean
    appPaths?: string[] | null
    match?: RouteMatch
  }): Promise<void> {
    throw new Error('ensurePage can only be called on the development server')
  }

  /**
   * Resolves `API` request, in development builds on demand
   * @param req http request
   * @param res http response
   * @param pathname path of request
   */
  protected async handleApiRequest(
    req: BaseNextRequest,
    res: BaseNextResponse,
    query: ParsedUrlQuery,
    match: PagesAPIRouteMatch
  ): Promise<boolean> {
    return this.runApi(req, res, query, match)
  }

  protected async getPrefetchRsc(pathname: string) {
    return this.getCacheFilesystem()
      .readFile(join(this.serverDistDir, 'app', `${pathname}.prefetch.rsc`))
      .then((res) => res.toString())
  }

  protected getCacheFilesystem(): CacheFs {
    return nodeFs
  }

  private normalizeReq(
    req: BaseNextRequest | IncomingMessage
  ): BaseNextRequest {
    return req instanceof IncomingMessage ? new NodeNextRequest(req) : req
  }

  private normalizeRes(
    res: BaseNextResponse | ServerResponse
  ): BaseNextResponse {
    return res instanceof ServerResponse ? new NodeNextResponse(res) : res
  }

  public getRequestHandler(): NodeRequestHandler {
    const handler = this.makeRequestHandler()
    if (this.serverOptions.experimentalTestProxy) {
      const {
        wrapRequestHandlerNode,
      } = require('../experimental/testmode/server')
      return wrapRequestHandlerNode(handler)
    }
    return handler
  }

  private makeRequestHandler(): NodeRequestHandler {
    // This is just optimization to fire prepare as soon as possible
    // It will be properly awaited later
    void this.prepare()
    const handler = super.getRequestHandler()
    return (req, res, parsedUrl) => {
      const normalizedReq = this.normalizeReq(req)
      const normalizedRes = this.normalizeRes(res)

      const enabledVerboseLogging =
        this.nextConfig.experimental.logging === 'verbose'
      if (this.renderOpts.dev) {
        const _req = req as NodeNextRequest | IncomingMessage
        const _res = res as NodeNextResponse | ServerResponse
        const origReq = 'originalRequest' in _req ? _req.originalRequest : _req
        const origRes =
          'originalResponse' in _res ? _res.originalResponse : _res

        const reqStart = Date.now()

        const reqCallback = () => {
          // if we already logged in a render worker
          // don't log again in the router worker.
          // we also don't log for middleware alone
          if (
            (normalizedReq as any).didInvokePath ||
            origReq.headers['x-middleware-invoke']
          ) {
            return
          }
          const reqEnd = Date.now()
          const fetchMetrics = (normalizedReq as any).fetchMetrics || []
          const reqDuration = reqEnd - reqStart

          const getDurationStr = (duration: number) => {
            let durationStr = duration.toString()

            if (duration < 500) {
              durationStr = chalk.green(duration + 'ms')
            } else if (duration < 2000) {
              durationStr = chalk.yellow(duration + 'ms')
            } else {
              durationStr = chalk.red(duration + 'ms')
            }
            return durationStr
          }

          if (Array.isArray(fetchMetrics) && fetchMetrics.length) {
            if (enabledVerboseLogging) {
              process.stdout.write('\n')
              process.stdout.write(
                `- ${chalk.cyan(req.method || 'GET')} ${req.url} ${
                  res.statusCode
                } in ${getDurationStr(reqDuration)}\n`
              )
            }

            const calcNestedLevel = (
              prevMetrics: any[],
              start: number
            ): string => {
              let nestedLevel = 0

              for (let i = 0; i < prevMetrics.length; i++) {
                const metric = prevMetrics[i]
                const prevMetric = prevMetrics[i - 1]

                if (
                  metric.end <= start &&
                  !(prevMetric && prevMetric.start < metric.end)
                ) {
                  nestedLevel += 1
                }
              }
              return `${'───'.repeat(nestedLevel + 1)}`
            }

            for (let i = 0; i < fetchMetrics.length; i++) {
              const metric = fetchMetrics[i]
              const lastItem = i === fetchMetrics.length - 1
              let { cacheStatus, cacheReason } = metric

              const duration = metric.end - metric.start

              if (cacheStatus === 'hit') {
                cacheStatus = chalk.green('HIT')
              } else if (cacheStatus === 'skip') {
                cacheStatus = `${chalk.yellow('SKIP')}, reason: ${cacheReason}`
              } else {
                cacheStatus = chalk.yellow('MISS')
              }
              let url = metric.url

              if (url.length > 48) {
                const parsed = new URL(url)
                const truncatedHost =
                  parsed.host.length > 16
                    ? parsed.host.substring(0, 16) + '..'
                    : parsed.host

                const truncatedPath =
                  parsed.pathname.length > 24
                    ? parsed.pathname.substring(0, 24) + '..'
                    : parsed.pathname

                const truncatedSearch =
                  parsed.search.length > 16
                    ? parsed.search.substring(0, 16) + '..'
                    : parsed.search

                url =
                  parsed.protocol +
                  '//' +
                  truncatedHost +
                  truncatedPath +
                  truncatedSearch
              }

              if (enabledVerboseLogging) {
                process.stdout.write(
                  `   ${chalk.grey(
                    `${lastItem ? '└' : '├'}${calcNestedLevel(
                      fetchMetrics.slice(0, i),
                      metric.start
                    )}`
                  )} ${chalk.cyan(metric.method)} ${url} ${
                    metric.status
                  } in ${getDurationStr(duration)} (cache: ${cacheStatus})\n`
                )
              }
            }
          } else {
            if (enabledVerboseLogging) {
              process.stdout.write(
                `- ${chalk.cyan(req.method || 'GET')} ${req.url} ${
                  res.statusCode
                } in ${getDurationStr(reqDuration)}\n`
              )
            }
          }
          origRes.off('close', reqCallback)
        }
        origRes.on('close', reqCallback)
      }
      return handler(normalizedReq, normalizedRes, parsedUrl)
    }
  }

  public async render(
    req: BaseNextRequest | IncomingMessage,
    res: BaseNextResponse | ServerResponse,
    pathname: string,
    query?: NextParsedUrlQuery,
    parsedUrl?: NextUrlWithParsedQuery
  ): Promise<void> {
    return super.render(
      this.normalizeReq(req),
      this.normalizeRes(res),
      pathname,
      query,
      parsedUrl
    )
  }

  public async renderToHTML(
    req: BaseNextRequest | IncomingMessage,
    res: BaseNextResponse | ServerResponse,
    pathname: string,
    query?: ParsedUrlQuery
  ): Promise<string | null> {
    return super.renderToHTML(
      this.normalizeReq(req),
      this.normalizeRes(res),
      pathname,
      query
    )
  }

  protected async renderErrorToResponseImpl(
    ctx: RequestContext,
    err: Error | null
  ) {
    const { res } = ctx
    const is404 = res.statusCode === 404

    if (is404 && this.hasAppDir && this.isRenderWorker) {
      const notFoundPathname = this.renderOpts.dev
        ? '/not-found'
        : '/_not-found'

      if (this.renderOpts.dev) {
        await this.ensurePage({
          page: notFoundPathname,
          clientOnly: false,
        }).catch(() => {})
      }
    }
    return super.renderErrorToResponseImpl(ctx, err)
  }

  public async renderError(
    err: Error | null,
    req: BaseNextRequest | IncomingMessage,
    res: BaseNextResponse | ServerResponse,
    pathname: string,
    query?: NextParsedUrlQuery,
    setHeaders?: boolean
  ): Promise<void> {
    return super.renderError(
      err,
      this.normalizeReq(req),
      this.normalizeRes(res),
      pathname,
      query,
      setHeaders
    )
  }

  public async renderErrorToHTML(
    err: Error | null,
    req: BaseNextRequest | IncomingMessage,
    res: BaseNextResponse | ServerResponse,
    pathname: string,
    query?: ParsedUrlQuery
  ): Promise<string | null> {
    return super.renderErrorToHTML(
      err,
      this.normalizeReq(req),
      this.normalizeRes(res),
      pathname,
      query
    )
  }

  public async render404(
    req: BaseNextRequest | IncomingMessage,
    res: BaseNextResponse | ServerResponse,
    parsedUrl?: NextUrlWithParsedQuery,
    setHeaders?: boolean
  ): Promise<void> {
    return super.render404(
      this.normalizeReq(req),
      this.normalizeRes(res),
      parsedUrl,
      setHeaders
    )
  }

  private _cachedPreviewManifest: PrerenderManifest | undefined
  protected getPrerenderManifest(): PrerenderManifest {
    if (this._cachedPreviewManifest) {
      return this._cachedPreviewManifest
    }
    if (
      this.renderOpts?.dev ||
      this.serverOptions?.dev ||
      process.env.NODE_ENV === 'development' ||
      process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD
    ) {
      this._cachedPreviewManifest = {
        version: 4,
        routes: {},
        dynamicRoutes: {},
        notFoundRoutes: [],
        preview: {
          previewModeId: require('crypto').randomBytes(16).toString('hex'),
          previewModeSigningKey: require('crypto')
            .randomBytes(32)
            .toString('hex'),
          previewModeEncryptionKey: require('crypto')
            .randomBytes(32)
            .toString('hex'),
        },
      }
      return this._cachedPreviewManifest
    }

    const manifest = loadManifest(join(this.distDir, PRERENDER_MANIFEST))

    return (this._cachedPreviewManifest = manifest)
  }

  protected getRoutesManifest() {
    return getTracer().trace(NextNodeServerSpan.getRoutesManifest, () => {
      const manifest = require(join(this.distDir, ROUTES_MANIFEST))

      if (Array.isArray(manifest.rewrites)) {
        manifest.rewrites = {
          beforeFiles: [],
          afterFiles: manifest.rewrites,
          fallback: [],
        }
      }
      return manifest
    })
  }

  protected attachRequestMeta(
    req: BaseNextRequest,
    parsedUrl: NextUrlWithParsedQuery,
    isUpgradeReq?: boolean
  ) {
    const protocol =
      ((req as NodeNextRequest).originalRequest?.socket as TLSSocket)
        ?.encrypted || req.headers['x-forwarded-proto']?.includes('https')
        ? 'https'
        : 'http'

    // When there are hostname and port we build an absolute URL
    const initUrl =
      this.fetchHostname && this.port
        ? `${protocol}://${this.fetchHostname}:${this.port}${req.url}`
        : this.nextConfig.experimental.trustHostHeader
        ? `https://${req.headers.host || 'localhost'}${req.url}`
        : req.url

    addRequestMeta(req, '__NEXT_INIT_URL', initUrl)
    addRequestMeta(req, '__NEXT_INIT_QUERY', { ...parsedUrl.query })
    addRequestMeta(req, '_protocol', protocol)

    if (!isUpgradeReq) {
      addRequestMeta(req, '__NEXT_CLONABLE_BODY', getCloneableBody(req.body))
    }
  }
}
