import type { WebNextRequest, WebNextResponse } from './base-http/web'
import type RenderResult from './render-result'
import type { NextParsedUrlQuery, NextUrlWithParsedQuery } from './request-meta'
import type { Params } from './request/params'
import type { LoadComponentsReturnType } from './load-components'
import type {
  LoadedRenderOpts,
  MiddlewareRoutingItem,
  NormalizedRouteManifest,
  Options,
  RouteHandler,
} from './base-server'
import type { Revalidate, ExpireTime } from './lib/revalidate'

import { byteLength } from './api-utils/web'
import BaseServer, { NoFallbackError } from './base-server'
import { generateETag } from './lib/etag'
import { addRequestMeta, getRequestMeta } from './request-meta'
import WebResponseCache from './response-cache/web'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { isDynamicRoute } from '../shared/lib/router/utils'
import {
  interpolateDynamicPath,
  normalizeVercelUrl,
  normalizeDynamicRouteParams,
} from './server-utils'
import { getNamedRouteRegex } from '../shared/lib/router/utils/route-regex'
import { getRouteMatcher } from '../shared/lib/router/utils/route-matcher'
import { IncrementalCache } from './lib/incremental-cache'
import type { PAGE_TYPES } from '../lib/page-types'
import type { Rewrite } from '../lib/load-custom-routes'
import { buildCustomRoute } from '../lib/build-custom-route'
import { UNDERSCORE_NOT_FOUND_ROUTE } from '../api/constants'
import { getEdgeInstrumentationModule } from './web/globals'
import type { ServerOnInstrumentationRequestError } from './app-render/types'
import { getEdgePreviewProps } from './web/get-edge-preview-props'

interface WebServerOptions extends Options {
  buildId: string
  webServerConfig: {
    page: string
    pathname: string
    pagesType: PAGE_TYPES
    loadComponent: (page: string) => Promise<LoadComponentsReturnType | null>
    extendRenderOpts: Partial<BaseServer['renderOpts']> & {
      serverActionsManifest?: any
    }
    renderToHTML:
      | typeof import('./app-render/app-render').renderToHTMLOrFlight
      | undefined
    incrementalCacheHandler?: any
    interceptionRouteRewrites?: Rewrite[]
  }
}

type WebRouteHandler = RouteHandler<WebNextRequest, WebNextResponse>

export default class NextWebServer extends BaseServer<
  WebServerOptions,
  WebNextRequest,
  WebNextResponse
> {
  constructor(options: WebServerOptions) {
    super(options)

    // Extend `renderOpts`.
    Object.assign(this.renderOpts, options.webServerConfig.extendRenderOpts)
  }

  protected async getIncrementalCache({
    requestHeaders,
  }: {
    requestHeaders: IncrementalCache['requestHeaders']
  }) {
    const dev = !!this.renderOpts.dev
    // incremental-cache is request specific
    // although can have shared caches in module scope
    // per-cache handler
    return new IncrementalCache({
      dev,
      requestHeaders,
      dynamicIO: Boolean(this.nextConfig.experimental.dynamicIO),
      requestProtocol: 'https',
      allowedRevalidateHeaderKeys:
        this.nextConfig.experimental.allowedRevalidateHeaderKeys,
      minimalMode: this.minimalMode,
      fetchCacheKeyPrefix: this.nextConfig.experimental.fetchCacheKeyPrefix,
      maxMemoryCacheSize: this.nextConfig.cacheMaxMemorySize,
      flushToDisk: false,
      CurCacheHandler:
        this.serverOptions.webServerConfig.incrementalCacheHandler,
      getPrerenderManifest: () => this.getPrerenderManifest(),
    })
  }
  protected getResponseCache() {
    return new WebResponseCache(this.minimalMode)
  }

  protected async hasPage(page: string) {
    return page === this.serverOptions.webServerConfig.page
  }

  protected getBuildId() {
    return this.serverOptions.buildId
  }

  protected getEnabledDirectories() {
    return {
      app: this.serverOptions.webServerConfig.pagesType === 'app',
      pages: this.serverOptions.webServerConfig.pagesType === 'pages',
    }
  }

  protected getPagesManifest() {
    return {
      // keep same theme but server path doesn't need to be accurate
      [this.serverOptions.webServerConfig.pathname]:
        `server${this.serverOptions.webServerConfig.page}.js`,
    }
  }

  protected getAppPathsManifest() {
    const page = this.serverOptions.webServerConfig.page
    return {
      [this.serverOptions.webServerConfig.page]: `app${page}.js`,
    }
  }

  protected attachRequestMeta(
    req: WebNextRequest,
    parsedUrl: NextUrlWithParsedQuery
  ) {
    addRequestMeta(req, 'initQuery', { ...parsedUrl.query })
  }

  protected getPrerenderManifest() {
    return {
      version: -1 as any, // letting us know this doesn't conform to spec
      routes: {},
      dynamicRoutes: {},
      notFoundRoutes: [],
      preview: getEdgePreviewProps(),
    }
  }

  protected getNextFontManifest() {
    return this.serverOptions.webServerConfig.extendRenderOpts.nextFontManifest
  }

  protected handleCatchallRenderRequest: WebRouteHandler = async (
    req,
    res,
    parsedUrl
  ) => {
    let { pathname, query } = parsedUrl
    if (!pathname) {
      throw new Error('pathname is undefined')
    }

    // interpolate query information into page for dynamic route
    // so that rewritten paths are handled properly
    const normalizedPage = this.serverOptions.webServerConfig.pathname

    if (pathname !== normalizedPage) {
      pathname = normalizedPage

      if (isDynamicRoute(pathname)) {
        const routeRegex = getNamedRouteRegex(pathname, {
          prefixRouteKeys: false,
        })
        const dynamicRouteMatcher = getRouteMatcher(routeRegex)
        const defaultRouteMatches = dynamicRouteMatcher(
          pathname
        ) as NextParsedUrlQuery
        const paramsResult = normalizeDynamicRouteParams(
          query,
          false,
          routeRegex,
          defaultRouteMatches
        )
        const normalizedParams = paramsResult.hasValidParams
          ? paramsResult.params
          : query

        pathname = interpolateDynamicPath(
          pathname,
          normalizedParams,
          routeRegex
        )
        normalizeVercelUrl(
          req,
          true,
          Object.keys(routeRegex.routeKeys),
          true,
          routeRegex
        )
      }
    }

    // next.js core assumes page path without trailing slash
    pathname = removeTrailingSlash(pathname)

    if (this.i18nProvider) {
      const { detectedLocale } = await this.i18nProvider.analyze(pathname)
      if (detectedLocale) {
        addRequestMeta(req, 'locale', detectedLocale)
      }
    }

    const bubbleNoFallback = getRequestMeta(req, 'bubbleNoFallback')

    try {
      await this.render(req, res, pathname, query, parsedUrl, true)

      return true
    } catch (err) {
      if (err instanceof NoFallbackError && bubbleNoFallback) {
        return false
      }
      throw err
    }
  }

  protected renderHTML(
    req: WebNextRequest,
    res: WebNextResponse,
    pathname: string,
    query: NextParsedUrlQuery,
    renderOpts: LoadedRenderOpts
  ): Promise<RenderResult> {
    const { renderToHTML } = this.serverOptions.webServerConfig
    if (!renderToHTML) {
      throw new Error(
        'Invariant: routeModule should be configured when rendering pages'
      )
    }

    // For edge runtime if the pathname hit as /_not-found entrypoint,
    // override the pathname to /404 for rendering
    if (pathname === UNDERSCORE_NOT_FOUND_ROUTE) {
      pathname = '/404'
    }
    return renderToHTML(
      req as any,
      res as any,
      pathname,
      query,
      // Edge runtime does not support ISR/PPR, so we don't need to pass in
      // the unknown params.
      null,
      Object.assign(renderOpts, {
        disableOptimizedLoading: true,
        runtime: 'experimental-edge',
      }),
      undefined,
      false,
      {
        buildId: this.serverOptions.buildId,
      }
    )
  }

  protected async sendRenderResult(
    _req: WebNextRequest,
    res: WebNextResponse,
    options: {
      result: RenderResult
      type: 'html' | 'json'
      generateEtags: boolean
      poweredByHeader: boolean
      revalidate: Revalidate | undefined
      expireTime: ExpireTime | undefined
    }
  ): Promise<void> {
    res.setHeader('X-Edge-Runtime', '1')

    // Add necessary headers.
    // @TODO: Share the isomorphic logic with server/send-payload.ts.
    if (options.poweredByHeader && options.type === 'html') {
      res.setHeader('X-Powered-By', 'Next.js')
    }

    if (!res.getHeader('Content-Type')) {
      res.setHeader(
        'Content-Type',
        options.result.contentType
          ? options.result.contentType
          : options.type === 'json'
            ? 'application/json'
            : 'text/html; charset=utf-8'
      )
    }

    let promise: Promise<void> | undefined
    if (options.result.isDynamic) {
      promise = options.result.pipeTo(res.transformStream.writable)
    } else {
      const payload = options.result.toUnchunkedString()
      res.setHeader('Content-Length', String(byteLength(payload)))
      if (options.generateEtags) {
        res.setHeader('ETag', generateETag(payload))
      }
      res.body(payload)
    }

    res.send()

    // If we have a promise, wait for it to resolve.
    if (promise) await promise
  }

  protected async findPageComponents({
    page,
    query,
    params,
    url: _url,
  }: {
    page: string
    query: NextParsedUrlQuery
    params: Params | null
    isAppPath: boolean
    url?: string
  }) {
    const result = await this.serverOptions.webServerConfig.loadComponent(page)
    if (!result) return null

    return {
      query: {
        ...(query || {}),
        ...(params || {}),
      },
      components: result,
    }
  }

  // Below are methods that are not implemented by the web server as they are
  // handled by the upstream proxy (edge runtime or node server).

  protected async runApi() {
    // This web server does not need to handle API requests.
    return true
  }

  protected async handleApiRequest() {
    // Edge API requests are handled separately in minimal mode.
    return false
  }

  protected loadEnvConfig() {
    // The web server does not need to load the env config. This is done by the
    // runtime already.
  }

  protected getPublicDir() {
    // Public files are not handled by the web server.
    return ''
  }

  protected getHasStaticDir() {
    return false
  }

  protected getFontManifest() {
    return undefined
  }

  protected handleCompression() {
    // For the web server layer, compression is automatically handled by the
    // upstream proxy (edge runtime or node server) and we can simply skip here.
  }

  protected async handleUpgrade(): Promise<void> {
    // The web server does not support web sockets.
  }

  protected async getFallbackErrorComponents(
    _url?: string
  ): Promise<LoadComponentsReturnType | null> {
    // The web server does not need to handle fallback errors in production.
    return null
  }
  protected getRoutesManifest(): NormalizedRouteManifest | undefined {
    // The web server does not need to handle rewrite rules. This is done by the
    // upstream proxy (edge runtime or node server).
    return undefined
  }

  protected getMiddleware(): MiddlewareRoutingItem | undefined {
    // The web server does not need to handle middleware. This is done by the
    // upstream proxy (edge runtime or node server).
    return undefined
  }

  protected getFilesystemPaths() {
    return new Set<string>()
  }

  protected getinterceptionRoutePatterns(): RegExp[] {
    return (
      this.serverOptions.webServerConfig.interceptionRouteRewrites?.map(
        (rewrite) => new RegExp(buildCustomRoute('rewrite', rewrite).regex)
      ) ?? []
    )
  }

  protected async loadInstrumentationModule() {
    return await getEdgeInstrumentationModule()
  }

  protected async instrumentationOnRequestError(
    ...args: Parameters<ServerOnInstrumentationRequestError>
  ) {
    await super.instrumentationOnRequestError(...args)
    const err = args[0]

    if (
      process.env.NODE_ENV !== 'production' &&
      typeof __next_log_error__ === 'function'
    ) {
      __next_log_error__(err)
    } else {
      console.error(err)
    }
  }
}
