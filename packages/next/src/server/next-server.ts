import './node-environment'
import './require-hook'
import './node-polyfill-fetch'
import './node-polyfill-form'
import './node-polyfill-web-streams'
import './node-polyfill-crypto'

import type { TLSSocket } from 'tls'
import {
  CacheFs,
  DecodeError,
  PageNotFoundError,
  MiddlewareNotFoundError,
} from '../shared/lib/utils'
import type { MiddlewareManifest } from '../build/webpack/plugins/middleware-plugin'
import type RenderResult from './render-result'
import type { FetchEventResult } from './web/types'
import type { PrerenderManifest } from '../build'
import { BaseNextRequest, BaseNextResponse } from './base-http'
import type { PagesManifest } from '../build/webpack/plugins/pages-manifest-plugin'
import type { PayloadOptions } from './send-payload'
import type { NextParsedUrlQuery, NextUrlWithParsedQuery } from './request-meta'
import {
  getRouteMatcher,
  Params,
} from '../shared/lib/router/utils/route-matcher'
import type { MiddlewareRouteMatch } from '../shared/lib/router/utils/middleware-route-matcher'
import type { RouteMatch } from './future/route-matches/route-match'
import { renderToHTML, type RenderOpts } from './render'

import fs from 'fs'
import { join, resolve, isAbsolute } from 'path'
import { IncomingMessage, ServerResponse } from 'http'
import type { PagesAPIRouteModule } from './future/route-modules/pages-api/module'
import { addRequestMeta, getRequestMeta } from './request-meta'
import {
  PAGES_MANIFEST,
  BUILD_ID_FILE,
  MIDDLEWARE_MANIFEST,
  PRERENDER_MANIFEST,
  ROUTES_MANIFEST,
  CLIENT_PUBLIC_FILES_PATH,
  APP_PATHS_MANIFEST,
  SERVER_DIRECTORY,
  NEXT_FONT_MANIFEST,
  PHASE_PRODUCTION_BUILD,
} from '../shared/lib/constants'
import { findDir } from '../lib/find-pages-dir'
import { UrlWithParsedQuery } from 'url'
import { getPathMatch } from '../shared/lib/router/utils/path-match'
import getRouteFromAssetPath from '../shared/lib/router/utils/get-route-from-asset-path'
import { NodeNextRequest, NodeNextResponse } from './base-http/node'
import { sendRenderResult } from './send-payload'
import { getExtension, serveStatic } from './serve-static'
import { ParsedUrlQuery } from 'querystring'
import { ParsedUrl, parseUrl } from '../shared/lib/router/utils/parse-url'
import * as Log from '../build/output/log'

import BaseServer, {
  Options,
  FindComponentsResult,
  MiddlewareRoutingItem,
  NoFallbackError,
  RequestContext,
} from './base-server'
import { getMaybePagePath, getPagePath, requireFontManifest } from './require'
import { denormalizePagePath } from '../shared/lib/page-path/denormalize-page-path'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { loadComponents } from './load-components'
import isError, { getProperError } from '../lib/is-error'
import { FontManifest } from './font-utils'
import { splitCookiesString, toNodeOutgoingHttpHeaders } from './web/utils'
import { getMiddlewareRouteMatcher } from '../shared/lib/router/utils/middleware-route-matcher'
import { loadEnvConfig } from '@next/env'
import { urlQueryToSearchParams } from '../shared/lib/router/utils/querystring'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { getNextPathnameInfo } from '../shared/lib/router/utils/get-next-pathname-info'
import { getCloneableBody } from './body-streams'
import { checkIsOnDemandRevalidate } from './api-utils'
import ResponseCache from './response-cache'
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
import { invokeRequest, pipeReadable } from './lib/server-ipc/invoke-request'
import { filterReqHeaders } from './lib/server-ipc/utils'
import { createRequestResponseMocks } from './lib/mock-request'
import chalk from 'next/dist/compiled/chalk'
import { NEXT_RSC_UNION_QUERY } from '../client/components/app-router-headers'
import { signalFromNodeResponse } from './web/spec-extension/adapters/next-request'
import { RouteModuleLoader } from './future/helpers/module-loader/route-module-loader'
import { loadManifest } from './load-manifest'

export * from './base-server'

export interface NodeRequestHandler {
  (
    req: IncomingMessage | BaseNextRequest,
    res: ServerResponse | BaseNextResponse,
    parsedUrl?: NextUrlWithParsedQuery | undefined
  ): Promise<void>
}

const MiddlewareMatcherCache = new WeakMap<
  MiddlewareManifest['middleware'][string],
  MiddlewareRouteMatch
>()

function getMiddlewareMatcher(
  info: MiddlewareManifest['middleware'][string]
): MiddlewareRouteMatch {
  const stored = MiddlewareMatcherCache.get(info)
  if (stored) {
    return stored
  }

  if (!Array.isArray(info.matchers)) {
    throw new Error(
      `Invariant: invalid matchers for middleware ${JSON.stringify(info)}`
    )
  }

  const matcher = getMiddlewareRouteMatcher(info.matchers)
  MiddlewareMatcherCache.set(info, matcher)
  return matcher
}

export default class NextNodeServer extends BaseServer {
  private imageResponseCache?: ResponseCache
  protected renderWorkersPromises?: Promise<void>
  protected renderWorkerOpts?: Parameters<
    typeof import('./lib/render-server').initialize
  >[0]
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

    if (!this.minimalMode) {
      this.imageResponseCache = new ResponseCache(this.minimalMode)
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

    // incremental-cache is request specific with a shared
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

  protected getResponseCache() {
    return new ResponseCache(this.minimalMode)
  }

  protected getPublicDir(): string {
    return join(this.dir, CLIENT_PUBLIC_FILES_PATH)
  }

  protected getHasStaticDir(): boolean {
    return fs.existsSync(join(this.dir, 'static'))
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

  protected sendStatic(
    req: NodeNextRequest,
    res: NodeNextResponse,
    path: string
  ): Promise<void> {
    return serveStatic(req.originalRequest, res.originalResponse, path)
  }

  protected async runApi(
    req: BaseNextRequest | NodeNextRequest,
    res: BaseNextResponse | NodeNextResponse,
    query: ParsedUrlQuery,
    match: PagesAPIRouteMatch
  ): Promise<boolean> {
    const edgeFunctionsPages = this.getEdgeFunctionsPages()

    for (const edgeFunctionsPage of edgeFunctionsPages) {
      if (edgeFunctionsPage === match.definition.pathname) {
        const handledAsEdgeFunction = await this.runEdgeFunction({
          req,
          res,
          query,
          params: match.params,
          page: match.definition.pathname,
          appPaths: null,
        })

        if (handledAsEdgeFunction) {
          return true
        }
      }
    }

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
        revalidate: this.revalidate.bind(this),
        trustHostHeader: this.nextConfig.experimental.trustHostHeader,
        allowedRevalidateHeaderKeys:
          this.nextConfig.experimental.allowedRevalidateHeaderKeys,
        hostname: this.hostname,
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

  private streamResponseChunk(res: ServerResponse, chunk: any) {
    res.write(chunk)
    // When streaming is enabled, we need to explicitly
    // flush the response to avoid it being buffered.
    if ('flush' in res) {
      ;(res as any).flush()
    }
  }

  protected async imageOptimizer(
    req: NodeNextRequest,
    res: NodeNextResponse,
    paramsResult: import('./image-optimizer').ImageParamsResult
  ): Promise<{ buffer: Buffer; contentType: string; maxAge: number }> {
    const { imageOptimizer } =
      require('./image-optimizer') as typeof import('./image-optimizer')

    return imageOptimizer(
      req.originalRequest,
      res.originalResponse,
      paramsResult,
      this.nextConfig,
      this.renderOpts.dev,
      async (newReq, newRes, newParsedUrl) => {
        if (newReq.url === req.url) {
          throw new Error(`Invariant attempted to optimize _next/image itself`)
        }

        if (this.isRenderWorker) {
          const invokeRes = await invokeRequest(
            `http://${this.hostname || '127.0.0.1'}:${this.port}${
              newReq.url || ''
            }`,
            {
              method: newReq.method || 'GET',
              headers: newReq.headers,
              signal: signalFromNodeResponse(res.originalResponse),
            }
          )
          const filteredResHeaders = filterReqHeaders(
            toNodeOutgoingHttpHeaders(invokeRes.headers)
          )

          for (const key of Object.keys(filteredResHeaders)) {
            newRes.setHeader(key, filteredResHeaders[key] || '')
          }
          newRes.statusCode = invokeRes.status || 200

          if (invokeRes.body) {
            await pipeReadable(invokeRes.body, newRes)
          } else {
            res.send()
          }
          return
        }
        return this.getRequestHandler()(
          new NodeNextRequest(newReq),
          new NodeNextResponse(newRes),
          newParsedUrl
        )
      }
    )
  }

  protected getPagePath(pathname: string, locales?: string[]): string {
    return getPagePath(pathname, this.distDir, locales, this.hasAppDir)
  }

  protected async renderPageComponent(
    ctx: RequestContext,
    bubbleNoFallback: boolean
  ) {
    const edgeFunctionsPages = this.getEdgeFunctionsPages() || []
    if (edgeFunctionsPages.length) {
      const appPaths = this.getOriginalAppPaths(ctx.pathname)
      const isAppPath = Array.isArray(appPaths)

      let page = ctx.pathname
      if (isAppPath) {
        // When it's an array, we need to pass all parallel routes to the loader.
        page = appPaths[0]
      }

      for (const edgeFunctionsPage of edgeFunctionsPages) {
        if (edgeFunctionsPage === page) {
          await this.runEdgeFunction({
            req: ctx.req,
            res: ctx.res,
            query: ctx.query,
            params: ctx.renderOpts.params,
            page,
            appPaths,
          })
          return null
        }
      }
    }

    return super.renderPageComponent(ctx, bubbleNoFallback)
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

  protected async normalizeNextData(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl: NextUrlWithParsedQuery
  ) {
    const params = getPathMatch('/_next/data/:path*')(parsedUrl.pathname)

    // ignore for non-next data URLs
    if (!params || !params.path || params.path[0] !== this.buildId) {
      return { finished: false }
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
    if (this.getMiddleware()) {
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
      if (!localePathResult.detectedLocale && !this.getMiddleware()) {
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

  protected async handleNextImageRequest(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl: NextUrlWithParsedQuery
  ) {
    if (this.minimalMode || this.nextConfig.output === 'export') {
      res.statusCode = 400
      res.body('Bad Request').send()
      return {
        finished: true,
      }
    }
    const { ImageOptimizerCache } =
      require('./image-optimizer') as typeof import('./image-optimizer')

    const imageOptimizerCache = new ImageOptimizerCache({
      distDir: this.distDir,
      nextConfig: this.nextConfig,
    })

    const { getHash, sendResponse, ImageError } =
      require('./image-optimizer') as typeof import('./image-optimizer')

    if (!this.imageResponseCache) {
      throw new Error('invariant image optimizer cache was not initialized')
    }
    const imagesConfig = this.nextConfig.images

    if (imagesConfig.loader !== 'default' || imagesConfig.unoptimized) {
      await this.render404(req, res)
      return { finished: true }
    }
    const paramsResult = ImageOptimizerCache.validateParams(
      (req as NodeNextRequest).originalRequest,
      parsedUrl.query,
      this.nextConfig,
      !!this.renderOpts.dev
    )

    if ('errorMessage' in paramsResult) {
      res.statusCode = 400
      res.body(paramsResult.errorMessage).send()
      return { finished: true }
    }
    const cacheKey = ImageOptimizerCache.getCacheKey(paramsResult)

    try {
      const cacheEntry = await this.imageResponseCache.get(
        cacheKey,
        async () => {
          const { buffer, contentType, maxAge } = await this.imageOptimizer(
            req as NodeNextRequest,
            res as NodeNextResponse,
            paramsResult
          )
          const etag = getHash([buffer])

          return {
            value: {
              kind: 'IMAGE',
              buffer,
              etag,
              extension: getExtension(contentType) as string,
            },
            revalidate: maxAge,
          }
        },
        {
          incrementalCache: imageOptimizerCache,
        }
      )

      if (cacheEntry?.value?.kind !== 'IMAGE') {
        throw new Error('invariant did not get entry from image response cache')
      }
      sendResponse(
        (req as NodeNextRequest).originalRequest,
        (res as NodeNextResponse).originalResponse,
        paramsResult.href,
        cacheEntry.value.extension,
        cacheEntry.value.buffer,
        paramsResult.isStatic,
        cacheEntry.isMiss ? 'MISS' : cacheEntry.isStale ? 'STALE' : 'HIT',
        imagesConfig,
        cacheEntry.revalidate || 0,
        Boolean(this.renderOpts.dev)
      )
    } catch (err) {
      if (err instanceof ImageError) {
        res.statusCode = err.statusCode
        res.body(err.message).send()
        return {
          finished: true,
        }
      }
      throw err
    }
    return { finished: true }
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
    query._nextBubbleNoFallback = '1'
    const bubbleNoFallback = true

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

        // TODO-APP: move this to a route handler
        const edgeFunctionsPages = this.getEdgeFunctionsPages()
        for (const edgeFunctionsPage of edgeFunctionsPages) {
          if (edgeFunctionsPage === match.definition.page) {
            if (this.nextConfig.output === 'export') {
              await this.render404(req, res, parsedUrl)
              return { finished: true }
            }
            delete query._nextBubbleNoFallback
            delete query[NEXT_RSC_UNION_QUERY]

            const handledAsEdgeFunction = await this.runEdgeFunction({
              req,
              res,
              query,
              params: match.params,
              page: match.definition.page,
              match,
              appPaths: null,
            })

            if (handledAsEdgeFunction) {
              return { finished: true }
            }
          }
        }
        let handled = false

        // If the route was detected as being a Pages API route, then handle
        // it.
        // TODO: move this behavior into a route handler.
        if (match.definition.kind === RouteKind.PAGES_API) {
          if (this.nextConfig.output === 'export') {
            await this.render404(req, res, parsedUrl)
            return { finished: true }
          }
          delete query._nextBubbleNoFallback

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

      await this.render(req, res, pathname, query, parsedUrl, true)

      return {
        finished: true,
      }
    } catch (err: any) {
      if (err instanceof NoFallbackError && bubbleNoFallback) {
        if (this.isRenderWorker) {
          res.setHeader('x-no-fallback', '1')
          res.send()
          return {
            finished: true,
          }
        }

        return {
          finished: false,
        }
      }

      try {
        if (this.renderOpts.dev) {
          const { formatServerError } =
            require('../lib/format-server-error') as typeof import('../lib/format-server-error')
          formatServerError(err)
          await (this as any).logErrorWithOriginalStack(err)
        } else {
          this.logError(err)
        }
        res.statusCode = 500
        await this.renderError(err, req, res, pathname, query)
        return {
          finished: true,
        }
      } catch (_) {}

      throw err
    }
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
    // This is just optimization to fire prepare as soon as possible
    // It will be properly awaited later
    void this.prepare()
    const handler = super.getRequestHandler()
    return async (req, res, parsedUrl) => {
      const normalizedReq = this.normalizeReq(req)
      const normalizedRes = this.normalizeRes(res)

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
            process.stdout.write('\n')
            process.stdout.write(
              `-  ${chalk.grey('┌')} ${chalk.cyan(req.method || 'GET')} ${
                req.url
              } ${res.statusCode} in ${getDurationStr(reqDuration)}\n`
            )

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

              if (nestedLevel === 0) return ''
              return ` ${nestedLevel} level${nestedLevel === 1 ? '' : 's'} `
            }

            for (let i = 0; i < fetchMetrics.length; i++) {
              const metric = fetchMetrics[i]
              const lastItem = i === fetchMetrics.length - 1
              let cacheStatus = metric.cacheStatus
              const duration = metric.end - metric.start

              if (cacheStatus === 'hit') {
                cacheStatus = chalk.green('HIT')
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

              process.stdout.write(`   ${chalk.grey('│')}\n`)
              process.stdout.write(
                `   ${chalk.grey(
                  `${lastItem ? '└' : '├'}──${calcNestedLevel(
                    fetchMetrics.slice(0, i),
                    metric.start
                  )}──`
                )} ${chalk.cyan(metric.method)} ${url} ${
                  metric.status
                } in ${getDurationStr(duration)} (cache: ${cacheStatus})\n`
              )
            }
            process.stdout.write('\n')
          } else if (this.nextConfig.experimental.logging === 'verbose') {
            process.stdout.write(
              `- ${chalk.cyan(req.method || 'GET')} ${req.url} ${
                res.statusCode
              } in ${getDurationStr(reqDuration)}\n`
            )
          }
          origRes.off('close', reqCallback)
        }
        origRes.on('close', reqCallback)
      }
      return handler(normalizedReq, normalizedRes, parsedUrl)
    }
  }

  public async revalidate({
    urlPath,
    revalidateHeaders,
    opts,
  }: {
    urlPath: string
    revalidateHeaders: { [key: string]: string | string[] }
    opts: { unstable_onlyGenerated?: boolean }
  }) {
    const mocked = createRequestResponseMocks({
      url: urlPath,
      headers: revalidateHeaders,
    })

    const handler = this.getRequestHandler()
    await handler(
      new NodeNextRequest(mocked.req),
      new NodeNextResponse(mocked.res)
    )
    await mocked.res.hasStreamed

    if (
      mocked.res.getHeader('x-nextjs-cache') !== 'REVALIDATED' &&
      !(mocked.res.statusCode === 404 && opts.unstable_onlyGenerated)
    ) {
      throw new Error(`Invalid response ${mocked.res.statusCode}`)
    }
  }

  public async render(
    req: BaseNextRequest | IncomingMessage,
    res: BaseNextResponse | ServerResponse,
    pathname: string,
    query?: NextParsedUrlQuery,
    parsedUrl?: NextUrlWithParsedQuery,
    internal = false
  ): Promise<void> {
    return super.render(
      this.normalizeReq(req),
      this.normalizeRes(res),
      pathname,
      query,
      parsedUrl,
      internal
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
    const { req, res, query } = ctx
    const is404 = res.statusCode === 404

    if (is404 && this.hasAppDir && this.isRenderWorker) {
      const notFoundPathname = this.renderOpts.dev
        ? '/not-found'
        : '/_not-found'

      if (this.renderOpts.dev) {
        await (this as any)
          .ensurePage({
            page: notFoundPathname,
            clientOnly: false,
          })
          .catch(() => {})
      }

      if (this.getEdgeFunctionsPages().includes(notFoundPathname)) {
        await this.runEdgeFunction({
          req: req as BaseNextRequest,
          res: res as BaseNextResponse,
          query: query || {},
          params: {},
          page: notFoundPathname,
          appPaths: null,
        })
        return null
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

  protected getMiddlewareManifest(): MiddlewareManifest | null {
    if (this.minimalMode) return null
    const manifest: MiddlewareManifest = require(join(
      this.serverDistDir,
      MIDDLEWARE_MANIFEST
    ))
    return manifest
  }

  /** Returns the middleware routing item if there is one. */
  protected getMiddleware(): MiddlewareRoutingItem | undefined {
    const manifest = this.getMiddlewareManifest()
    const middleware = manifest?.middleware?.['/']
    if (!middleware) {
      return
    }

    return {
      match: getMiddlewareMatcher(middleware),
      page: '/',
    }
  }

  protected getEdgeFunctionsPages(): string[] {
    const manifest = this.getMiddlewareManifest()
    if (!manifest) {
      return []
    }

    return Object.keys(manifest.functions)
  }

  /**
   * Get information for the edge function located in the provided page
   * folder. If the edge function info can't be found it will throw
   * an error.
   */
  protected getEdgeFunctionInfo(params: {
    page: string
    /** Whether we should look for a middleware or not */
    middleware: boolean
  }): {
    name: string
    paths: string[]
    wasm: { filePath: string; name: string }[]
    assets: { filePath: string; name: string }[]
  } | null {
    const manifest = this.getMiddlewareManifest()
    if (!manifest) {
      return null
    }

    let foundPage: string

    try {
      foundPage = denormalizePagePath(normalizePagePath(params.page))
    } catch (err) {
      return null
    }

    let pageInfo = params.middleware
      ? manifest.middleware[foundPage]
      : manifest.functions[foundPage]

    if (!pageInfo) {
      if (!params.middleware) {
        throw new PageNotFoundError(foundPage)
      }
      return null
    }

    return {
      name: pageInfo.name,
      paths: pageInfo.files.map((file) => join(this.distDir, file)),
      wasm: (pageInfo.wasm ?? []).map((binding) => ({
        ...binding,
        filePath: join(this.distDir, binding.filePath),
      })),
      assets: (pageInfo.assets ?? []).map((binding) => {
        return {
          ...binding,
          filePath: join(this.distDir, binding.filePath),
        }
      }),
    }
  }

  /**
   * Checks if a middleware exists. This method is useful for the development
   * server where we need to check the filesystem. Here we just check the
   * middleware manifest.
   */
  protected async hasMiddleware(pathname: string): Promise<boolean> {
    const info = this.getEdgeFunctionInfo({ page: pathname, middleware: true })
    return Boolean(info && info.paths.length > 0)
  }

  /**
   * A placeholder for a function to be defined in the development server.
   * It will make sure that the root middleware or an edge function has been compiled
   * so that we can run it.
   */
  protected async ensureMiddleware() {}
  protected async ensureEdgeFunction(_params: {
    page: string
    appPaths: string[] | null
  }) {}

  /**
   * This method gets all middleware matchers and execute them when the request
   * matches. It will make sure that each middleware exists and is compiled and
   * ready to be invoked. The development server will decorate it to add warns
   * and errors with rich traces.
   */
  protected async runMiddleware(params: {
    request: BaseNextRequest
    response: BaseNextResponse
    parsedUrl: ParsedUrl
    parsed: UrlWithParsedQuery
    onWarning?: (warning: Error) => void
  }) {
    // Middleware is skipped for on-demand revalidate requests
    if (
      checkIsOnDemandRevalidate(params.request, this.renderOpts.previewProps)
        .isOnDemandRevalidate
    ) {
      return { finished: false }
    }

    let url: string

    if (this.nextConfig.skipMiddlewareUrlNormalize) {
      url = getRequestMeta(params.request, '__NEXT_INIT_URL')!
    } else {
      // For middleware to "fetch" we must always provide an absolute URL
      const query = urlQueryToSearchParams(params.parsed.query).toString()
      const locale = params.parsed.query.__nextLocale

      url = `${getRequestMeta(params.request, '_protocol')}://${
        this.hostname
      }:${this.port}${locale ? `/${locale}` : ''}${params.parsed.pathname}${
        query ? `?${query}` : ''
      }`
    }

    if (!url.startsWith('http')) {
      throw new Error(
        'To use middleware you must provide a `hostname` and `port` to the Next.js Server'
      )
    }

    const page: {
      name?: string
      params?: { [key: string]: string | string[] }
    } = {}

    const middleware = this.getMiddleware()
    if (!middleware) {
      return { finished: false }
    }
    if (!(await this.hasMiddleware(middleware.page))) {
      return { finished: false }
    }

    await this.ensureMiddleware()
    const middlewareInfo = this.getEdgeFunctionInfo({
      page: middleware.page,
      middleware: true,
    })

    if (!middlewareInfo) {
      throw new MiddlewareNotFoundError()
    }

    const method = (params.request.method || 'GET').toUpperCase()
    const { run } = require('./web/sandbox') as typeof import('./web/sandbox')

    const result = await run({
      distDir: this.distDir,
      name: middlewareInfo.name,
      paths: middlewareInfo.paths,
      edgeFunctionEntry: middlewareInfo,
      request: {
        headers: params.request.headers,
        method,
        nextConfig: {
          basePath: this.nextConfig.basePath,
          i18n: this.nextConfig.i18n,
          trailingSlash: this.nextConfig.trailingSlash,
        },
        url: url,
        page: page,
        body: getRequestMeta(params.request, '__NEXT_CLONABLE_BODY'),
        signal: signalFromNodeResponse(
          (params.response as NodeNextResponse).originalResponse
        ),
      },
      useCache: true,
      onWarning: params.onWarning,
    })

    if (!this.renderOpts.dev) {
      result.waitUntil.catch((error) => {
        console.error(`Uncaught: middleware waitUntil errored`, error)
      })
    }

    if (!result) {
      this.render404(params.request, params.response, params.parsed)
      return { finished: true }
    }

    for (let [key, value] of result.response.headers) {
      if (key.toLowerCase() !== 'set-cookie') continue

      // Clear existing header.
      result.response.headers.delete(key)

      // Append each cookie individually.
      const cookies = splitCookiesString(value)
      for (const cookie of cookies) {
        result.response.headers.append(key, cookie)
      }

      // Add cookies to request meta.
      addRequestMeta(params.request, '_nextMiddlewareCookie', cookies)
    }

    return result
  }

  protected async handleCatchallMiddlewareRequest(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsed: NextUrlWithParsedQuery
  ) {
    const isMiddlewareInvoke =
      this.isRenderWorker && req.headers['x-middleware-invoke']

    const handleFinished = (finished: boolean = false) => {
      if (isMiddlewareInvoke && !finished) {
        res.setHeader('x-middleware-invoke', '1')
        res.body('').send()
        return { finished: true }
      }
      return { finished }
    }

    if (this.isRenderWorker && !isMiddlewareInvoke) {
      return { finished: false }
    }

    const middleware = this.getMiddleware()
    if (!middleware) {
      return handleFinished()
    }

    const initUrl = getRequestMeta(req, '__NEXT_INIT_URL')!
    const parsedUrl = parseUrl(initUrl)
    const pathnameInfo = getNextPathnameInfo(parsedUrl.pathname, {
      nextConfig: this.nextConfig,
      i18nProvider: this.i18nProvider,
    })

    parsedUrl.pathname = pathnameInfo.pathname
    const normalizedPathname = removeTrailingSlash(parsed.pathname || '')
    if (!middleware.match(normalizedPathname, req, parsedUrl.query)) {
      return handleFinished()
    }

    let result: Awaited<
      ReturnType<typeof NextNodeServer.prototype.runMiddleware>
    >

    try {
      await this.ensureMiddleware()

      result = await this.runMiddleware({
        request: req,
        response: res,
        parsedUrl: parsedUrl,
        parsed: parsed,
      })

      if (isMiddlewareInvoke && 'response' in result) {
        for (const [key, value] of Object.entries(
          toNodeOutgoingHttpHeaders(result.response.headers)
        )) {
          if (key !== 'content-encoding' && value !== undefined) {
            res.setHeader(key, value as string | string[])
          }
        }
        res.statusCode = result.response.status

        const { originalResponse } = res as NodeNextResponse
        for await (const chunk of result.response.body || ([] as any)) {
          if (originalResponse.destroyed) break
          this.streamResponseChunk(originalResponse, chunk)
        }
        res.send()
        return {
          finished: true,
        }
      }
    } catch (err) {
      if (isError(err) && err.code === 'ENOENT') {
        await this.render404(req, res, parsed)
        return { finished: true }
      }

      if (err instanceof DecodeError) {
        res.statusCode = 400
        this.renderError(err, req, res, parsed.pathname || '')
        return { finished: true }
      }

      const error = getProperError(err)
      console.error(error)
      res.statusCode = 500
      this.renderError(error, req, res, parsed.pathname || '')
      return { finished: true }
    }

    if ('finished' in result) {
      return result
    }
    return { finished: false }
  }

  private _cachedPreviewManifest: PrerenderManifest | undefined
  protected getPrerenderManifest(): PrerenderManifest {
    if (this._cachedPreviewManifest) {
      return this._cachedPreviewManifest
    }
    if (
      this.renderOpts?.dev ||
      this.serverOptions?.dev ||
      this.renderWorkerOpts?.dev ||
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
      this.hostname && this.port
        ? `${protocol}://${this.hostname}:${this.port}${req.url}`
        : (this.nextConfig.experimental as any).trustHostHeader
        ? `https://${req.headers.host || 'localhost'}${req.url}`
        : req.url

    addRequestMeta(req, '__NEXT_INIT_URL', initUrl)
    addRequestMeta(req, '__NEXT_INIT_QUERY', { ...parsedUrl.query })
    addRequestMeta(req, '_protocol', protocol)

    if (!isUpgradeReq) {
      addRequestMeta(req, '__NEXT_CLONABLE_BODY', getCloneableBody(req.body))
    }
  }

  protected async runEdgeFunction(params: {
    req: BaseNextRequest | NodeNextRequest
    res: BaseNextResponse | NodeNextResponse
    query: ParsedUrlQuery
    params: Params | undefined
    page: string
    appPaths: string[] | null
    match?: RouteMatch
    onWarning?: (warning: Error) => void
  }): Promise<FetchEventResult | null> {
    let edgeInfo: ReturnType<typeof this.getEdgeFunctionInfo> | undefined

    const { query, page, match } = params

    if (!match)
      await this.ensureEdgeFunction({ page, appPaths: params.appPaths })
    edgeInfo = this.getEdgeFunctionInfo({
      page,
      middleware: false,
    })

    if (!edgeInfo) {
      return null
    }

    // For edge to "fetch" we must always provide an absolute URL
    const isDataReq = !!query.__nextDataReq
    const initialUrl = new URL(
      getRequestMeta(params.req, '__NEXT_INIT_URL') || '/',
      'http://n'
    )
    const queryString = urlQueryToSearchParams({
      ...Object.fromEntries(initialUrl.searchParams),
      ...query,
      ...params.params,
    }).toString()

    if (isDataReq) {
      params.req.headers['x-nextjs-data'] = '1'
    }
    initialUrl.search = queryString
    const url = initialUrl.toString()

    if (!url.startsWith('http')) {
      throw new Error(
        'To use middleware you must provide a `hostname` and `port` to the Next.js Server'
      )
    }

    const { run } = require('./web/sandbox') as typeof import('./web/sandbox')
    const result = await run({
      distDir: this.distDir,
      name: edgeInfo.name,
      paths: edgeInfo.paths,
      edgeFunctionEntry: edgeInfo,
      request: {
        headers: params.req.headers,
        method: params.req.method,
        nextConfig: {
          basePath: this.nextConfig.basePath,
          i18n: this.nextConfig.i18n,
          trailingSlash: this.nextConfig.trailingSlash,
        },
        url,
        page: {
          name: params.page,
          ...(params.params && { params: params.params }),
        },
        body: getRequestMeta(params.req, '__NEXT_CLONABLE_BODY'),
        signal: signalFromNodeResponse(
          (params.res as NodeNextResponse).originalResponse
        ),
      },
      useCache: true,
      onWarning: params.onWarning,
      incrementalCache:
        (globalThis as any).__incrementalCache ||
        getRequestMeta(params.req, '_nextIncrementalCache'),
    })

    params.res.statusCode = result.response.status
    params.res.statusMessage = result.response.statusText

    // TODO: (wyattjoh) investigate improving this

    result.response.headers.forEach((value, key) => {
      // The append handling is special cased for `set-cookie`.
      if (key.toLowerCase() === 'set-cookie') {
        // TODO: (wyattjoh) replace with native response iteration when we can upgrade undici
        for (const cookie of splitCookiesString(value)) {
          params.res.appendHeader(key, cookie)
        }
      } else {
        params.res.appendHeader(key, value)
      }
    })

    const nodeResStream = (params.res as NodeNextResponse).originalResponse
    if (result.response.body) {
      // TODO(gal): not sure that we always need to stream
      const { consumeUint8ArrayReadableStream } =
        require('next/dist/compiled/edge-runtime') as typeof import('next/dist/compiled/edge-runtime')
      try {
        for await (const chunk of consumeUint8ArrayReadableStream(
          result.response.body
        )) {
          if (nodeResStream.destroyed) break
          nodeResStream.write(chunk)
        }
      } finally {
        nodeResStream.end()
      }
    } else {
      nodeResStream.end()
    }

    return result
  }

  protected get serverDistDir() {
    return join(this.distDir, SERVER_DIRECTORY)
  }
}
