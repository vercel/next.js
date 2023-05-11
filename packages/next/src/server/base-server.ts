import type { __ApiPreviewProps } from './api-utils'
import type { CustomRoutes } from '../lib/load-custom-routes'
import type { DomainLocale } from './config'
import type { RouterOptions } from './router'
import type { FontManifest, FontConfig } from './font-utils'
import type { LoadComponentsReturnType } from './load-components'
import type { RouteMatchFn } from '../shared/lib/router/utils/route-matcher'
import type { MiddlewareRouteMatch } from '../shared/lib/router/utils/middleware-route-matcher'
import type { Params } from '../shared/lib/router/utils/route-matcher'
import type { NextConfig, NextConfigComplete } from './config-shared'
import type { NextParsedUrlQuery, NextUrlWithParsedQuery } from './request-meta'
import type { ParsedUrlQuery } from 'querystring'
import type { RenderOpts, RenderOptsPartial } from './render'
import type {
  ResponseCacheBase,
  ResponseCacheEntry,
  ResponseCacheValue,
} from './response-cache'
import type { UrlWithParsedQuery } from 'url'
import {
  NormalizeError,
  DecodeError,
  normalizeRepeatedSlashes,
  MissingStaticPage,
} from '../shared/lib/utils'
import type { PreviewData, ServerRuntime } from 'next/types'
import type { PagesManifest } from '../build/webpack/plugins/pages-manifest-plugin'
import type { OutgoingHttpHeaders } from 'http2'
import type { BaseNextRequest, BaseNextResponse } from './base-http'
import type { PayloadOptions } from './send-payload'
import type { PrerenderManifest } from '../build'
import type { ClientReferenceManifest } from '../build/webpack/plugins/flight-manifest-plugin'
import type { NextFontManifest } from '../build/webpack/plugins/next-font-manifest-plugin'

import { format as formatUrl, parse as parseUrl } from 'url'
import { getRedirectStatus } from '../lib/redirect-status'
import { isEdgeRuntime } from '../lib/is-edge-runtime'
import {
  APP_PATHS_MANIFEST,
  NEXT_BUILTIN_DOCUMENT,
  PAGES_MANIFEST,
  STATIC_STATUS_PAGES,
  TEMPORARY_REDIRECT_STATUS,
} from '../shared/lib/constants'
import { isDynamicRoute } from '../shared/lib/router/utils'
import {
  setLazyProp,
  getCookieParser,
  checkIsOnDemandRevalidate,
} from './api-utils'
import { setConfig } from '../shared/lib/runtime-config'
import Router from './router'

import { setRevalidateHeaders } from './send-payload/revalidate-headers'
import { execOnce } from '../shared/lib/utils'
import { isBlockedPage } from './utils'
import { isBot } from '../shared/lib/router/utils/is-bot'
import RenderResult from './render-result'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { denormalizePagePath } from '../shared/lib/page-path/denormalize-page-path'
import * as Log from '../build/output/log'
import escapePathDelimiters from '../shared/lib/router/utils/escape-path-delimiters'
import { getUtils } from './server-utils'
import isError, { getProperError } from '../lib/is-error'
import { addRequestMeta, getRequestMeta } from './request-meta'

import { ImageConfigComplete } from '../shared/lib/image-config'
import { removePathPrefix } from '../shared/lib/router/utils/remove-path-prefix'
import {
  normalizeAppPath,
  normalizeRscPath,
} from '../shared/lib/router/utils/app-paths'
import { getHostname } from '../shared/lib/get-hostname'
import { parseUrl as parseUrlUtil } from '../shared/lib/router/utils/parse-url'
import { getNextPathnameInfo } from '../shared/lib/router/utils/get-next-pathname-info'
import { MiddlewareMatcher } from '../build/analysis/get-page-static-info'
import {
  RSC,
  RSC_VARY_HEADER,
  FLIGHT_PARAMETERS,
} from '../client/components/app-router-headers'
import {
  MatchOptions,
  RouteMatcherManager,
} from './future/route-matcher-managers/route-matcher-manager'
import {
  RouteHandlerManager,
  type RouteHandlerManagerContext,
} from './future/route-handler-managers/route-handler-manager'
import { LocaleRouteNormalizer } from './future/normalizers/locale-route-normalizer'
import { DefaultRouteMatcherManager } from './future/route-matcher-managers/default-route-matcher-manager'
import { AppPageRouteMatcherProvider } from './future/route-matcher-providers/app-page-route-matcher-provider'
import { AppRouteRouteMatcherProvider } from './future/route-matcher-providers/app-route-route-matcher-provider'
import { PagesAPIRouteMatcherProvider } from './future/route-matcher-providers/pages-api-route-matcher-provider'
import { PagesRouteMatcherProvider } from './future/route-matcher-providers/pages-route-matcher-provider'
import { ServerManifestLoader } from './future/route-matcher-providers/helpers/manifest-loaders/server-manifest-loader'
import { getTracer, SpanKind } from './lib/trace/tracer'
import { BaseServerSpan } from './lib/trace/constants'
import { I18NProvider } from './future/helpers/i18n-provider'
import { sendResponse } from './send-response'
import { RouteKind } from './future/route-kind'
import { handleInternalServerErrorResponse } from './future/route-modules/helpers/response-handlers'
import { fromNodeHeaders, toNodeHeaders } from './web/utils'
import { NEXT_QUERY_PARAM_PREFIX } from '../lib/constants'

export type FindComponentsResult = {
  components: LoadComponentsReturnType
  query: NextParsedUrlQuery
}

export interface RoutingItem {
  page: string
  match: RouteMatchFn
  re?: RegExp
}

export interface MiddlewareRoutingItem {
  page: string
  match: MiddlewareRouteMatch
  matchers?: MiddlewareMatcher[]
}

export interface Options {
  /**
   * Object containing the configuration next.config.js
   */
  conf: NextConfig
  /**
   * Set to false when the server was created by Next.js
   */
  customServer?: boolean
  /**
   * Tells if Next.js is running in dev mode
   */
  dev?: boolean
  /**
   * Where the Next project is located
   */
  dir?: string
  /**
   * Tells if Next.js is at the platform-level
   */
  minimalMode?: boolean
  /**
   * Hide error messages containing server information
   */
  quiet?: boolean
  /**
   * The hostname the server is running behind
   */
  hostname?: string
  /**
   * The port the server is running behind
   */
  port?: number
  /**
   * The HTTP Server that Next.js is running behind
   */
  httpServer?: import('http').Server

  _routerWorker?: boolean
  _renderWorker?: boolean

  isNodeDebugging?: 'brk' | boolean
}

export interface BaseRequestHandler {
  (
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl?: NextUrlWithParsedQuery | undefined
  ): Promise<void>
}

export type RequestContext = {
  req: BaseNextRequest
  res: BaseNextResponse
  pathname: string
  query: NextParsedUrlQuery
  renderOpts: RenderOptsPartial
}

export class NoFallbackError extends Error {}

// Internal wrapper around build errors at development
// time, to prevent us from propagating or logging them
export class WrappedBuildError extends Error {
  innerError: Error

  constructor(innerError: Error) {
    super()
    this.innerError = innerError
  }
}

type ResponsePayload = {
  type: 'html' | 'json' | 'rsc'
  body: RenderResult
  revalidateOptions?: any
}

export default abstract class Server<ServerOptions extends Options = Options> {
  protected readonly dir: string
  protected readonly quiet: boolean
  protected readonly nextConfig: NextConfigComplete
  protected readonly distDir: string
  protected readonly publicDir: string
  protected readonly hasStaticDir: boolean
  protected readonly hasAppDir: boolean
  protected readonly pagesManifest?: PagesManifest
  protected readonly appPathsManifest?: PagesManifest
  protected readonly buildId: string
  protected readonly minimalMode: boolean
  protected readonly renderOpts: {
    poweredByHeader: boolean
    buildId: string
    generateEtags: boolean
    runtimeConfig?: { [key: string]: any }
    assetPrefix?: string
    canonicalBase: string
    dev?: boolean
    previewProps: __ApiPreviewProps
    customServer?: boolean
    ampOptimizerConfig?: { [key: string]: any }
    basePath: string
    optimizeFonts: FontConfig
    images: ImageConfigComplete
    fontManifest?: FontManifest
    disableOptimizedLoading?: boolean
    optimizeCss: any
    nextConfigOutput: 'standalone' | 'export'
    nextScriptWorkers: any
    locale?: string
    locales?: string[]
    defaultLocale?: string
    domainLocales?: DomainLocale[]
    distDir: string
    runtime?: ServerRuntime
    serverComponents?: boolean
    crossOrigin?: 'anonymous' | 'use-credentials' | '' | undefined
    supportsDynamicHTML?: boolean
    isBot?: boolean
    clientReferenceManifest?: ClientReferenceManifest
    serverCSSManifest?: any
    serverActionsManifest?: any
    nextFontManifest?: NextFontManifest
    renderServerComponentData?: boolean
    serverComponentProps?: any
    largePageDataBytes?: number
    appDirDevErrorLogger?: (err: any) => Promise<void>
    strictNextHead: boolean
  }
  protected serverOptions: ServerOptions
  private responseCache: ResponseCacheBase
  protected router: Router
  protected appPathRoutes?: Record<string, string[]>
  protected customRoutes: CustomRoutes
  protected clientReferenceManifest?: ClientReferenceManifest
  protected serverCSSManifest?: any
  protected nextFontManifest?: NextFontManifest
  public readonly hostname?: string
  public readonly port?: number

  protected abstract getPublicDir(): string
  protected abstract getHasStaticDir(): boolean
  protected abstract getHasAppDir(dev: boolean): boolean
  protected abstract getPagesManifest(): PagesManifest | undefined
  protected abstract getAppPathsManifest(): PagesManifest | undefined
  protected abstract getBuildId(): string

  protected abstract getFilesystemPaths(): Set<string>
  protected abstract findPageComponents(params: {
    pathname: string
    query: NextParsedUrlQuery
    params: Params
    isAppPath: boolean
    sriEnabled?: boolean
    appPaths?: string[] | null
    shouldEnsure: boolean
  }): Promise<FindComponentsResult | null>
  protected abstract getFontManifest(): FontManifest | undefined
  protected abstract getPrerenderManifest(): PrerenderManifest
  protected abstract getServerComponentManifest(): any
  protected abstract getServerCSSManifest(): any
  protected abstract getNextFontManifest(): NextFontManifest | undefined
  protected abstract attachRequestMeta(
    req: BaseNextRequest,
    parsedUrl: NextUrlWithParsedQuery
  ): void
  protected abstract getFallback(page: string): Promise<string>
  protected abstract getCustomRoutes(): CustomRoutes
  protected abstract hasPage(pathname: string): Promise<boolean>

  protected abstract generateRoutes(dev?: boolean): RouterOptions

  protected abstract sendRenderResult(
    req: BaseNextRequest,
    res: BaseNextResponse,
    options: {
      result: RenderResult
      type: 'html' | 'json' | 'rsc'
      generateEtags: boolean
      poweredByHeader: boolean
      options?: PayloadOptions
    }
  ): Promise<void>

  protected abstract runApi(
    req: BaseNextRequest,
    res: BaseNextResponse,
    query: ParsedUrlQuery,
    params: Params | undefined,
    page: string,
    builtPagePath: string
  ): Promise<boolean>

  protected abstract renderHTML(
    req: BaseNextRequest,
    res: BaseNextResponse,
    pathname: string,
    query: NextParsedUrlQuery,
    renderOpts: RenderOpts
  ): Promise<RenderResult>

  protected abstract handleCompression(
    req: BaseNextRequest,
    res: BaseNextResponse
  ): void

  protected abstract getIncrementalCache(options: {
    requestHeaders: Record<string, undefined | string | string[]>
    requestProtocol: 'http' | 'https'
  }): import('./lib/incremental-cache').IncrementalCache

  protected abstract getResponseCache(options: {
    dev: boolean
  }): ResponseCacheBase

  protected abstract loadEnvConfig(params: {
    dev: boolean
    forceReload?: boolean
  }): void

  // TODO-APP: (wyattjoh): Make protected again. Used for turbopack in route-resolver.ts right now.
  public readonly matchers: RouteMatcherManager
  protected readonly handlers: RouteHandlerManager
  protected readonly i18nProvider?: I18NProvider
  protected readonly localeNormalizer?: LocaleRouteNormalizer
  protected readonly isRouterWorker?: boolean
  protected readonly isRenderWorker?: boolean

  public constructor(options: ServerOptions) {
    const {
      dir = '.',
      quiet = false,
      conf,
      dev = false,
      minimalMode = false,
      customServer = true,
      hostname,
      port,
    } = options
    this.serverOptions = options
    this.isRouterWorker = options._routerWorker
    this.isRenderWorker = options._renderWorker

    this.dir =
      process.env.NEXT_RUNTIME === 'edge' ? dir : require('path').resolve(dir)

    this.quiet = quiet
    this.loadEnvConfig({ dev })

    // TODO: should conf be normalized to prevent missing
    // values from causing issues as this can be user provided
    this.nextConfig = conf as NextConfigComplete
    this.hostname = hostname
    this.port = port
    this.distDir =
      process.env.NEXT_RUNTIME === 'edge'
        ? this.nextConfig.distDir
        : require('path').join(this.dir, this.nextConfig.distDir)
    this.publicDir = this.getPublicDir()
    this.hasStaticDir = !minimalMode && this.getHasStaticDir()

    this.i18nProvider = this.nextConfig.i18n?.locales
      ? new I18NProvider(this.nextConfig.i18n)
      : undefined

    // Configure the locale normalizer, it's used for routes inside `pages/`.
    this.localeNormalizer = this.i18nProvider
      ? new LocaleRouteNormalizer(this.i18nProvider)
      : undefined

    // Only serverRuntimeConfig needs the default
    // publicRuntimeConfig gets it's default in client/index.js
    const {
      serverRuntimeConfig = {},
      publicRuntimeConfig,
      assetPrefix,
      generateEtags,
    } = this.nextConfig

    this.buildId = this.getBuildId()
    this.minimalMode = minimalMode || !!process.env.NEXT_PRIVATE_MINIMAL_MODE

    this.hasAppDir =
      !!this.nextConfig.experimental.appDir && this.getHasAppDir(dev)
    const serverComponents = this.hasAppDir
    this.clientReferenceManifest = serverComponents
      ? this.getServerComponentManifest()
      : undefined
    this.serverCSSManifest = serverComponents
      ? this.getServerCSSManifest()
      : undefined
    this.nextFontManifest = this.getNextFontManifest()

    this.renderOpts = {
      strictNextHead: !!this.nextConfig.experimental.strictNextHead,
      poweredByHeader: this.nextConfig.poweredByHeader,
      canonicalBase: this.nextConfig.amp.canonicalBase || '',
      buildId: this.buildId,
      generateEtags,
      previewProps: this.getPrerenderManifest().preview,
      customServer: customServer === true ? true : undefined,
      ampOptimizerConfig: this.nextConfig.experimental.amp?.optimizer,
      basePath: this.nextConfig.basePath,
      images: this.nextConfig.images,
      optimizeFonts: this.nextConfig.optimizeFonts as FontConfig,
      fontManifest:
        (this.nextConfig.optimizeFonts as FontConfig) && !dev
          ? this.getFontManifest()
          : undefined,
      optimizeCss: this.nextConfig.experimental.optimizeCss,
      nextConfigOutput: this.nextConfig.output,
      nextScriptWorkers: this.nextConfig.experimental.nextScriptWorkers,
      disableOptimizedLoading:
        this.nextConfig.experimental.disableOptimizedLoading,
      domainLocales: this.nextConfig.i18n?.domains,
      distDir: this.distDir,
      serverComponents,
      crossOrigin: this.nextConfig.crossOrigin
        ? this.nextConfig.crossOrigin
        : undefined,
      largePageDataBytes: this.nextConfig.experimental.largePageDataBytes,
      // Only the `publicRuntimeConfig` key is exposed to the client side
      // It'll be rendered as part of __NEXT_DATA__ on the client side
      runtimeConfig:
        Object.keys(publicRuntimeConfig).length > 0
          ? publicRuntimeConfig
          : undefined,
    }

    // Initialize next/config with the environment configuration
    setConfig({
      serverRuntimeConfig,
      publicRuntimeConfig,
    })

    this.pagesManifest = this.getPagesManifest()
    this.appPathsManifest = this.getAppPathsManifest()

    // Configure the routes.
    const { matchers, handlers } = this.getRoutes()
    this.matchers = matchers
    this.handlers = handlers

    // Start route compilation. We don't wait for the routes to finish loading
    // because we use the `waitTillReady` promise below in `handleRequest` to
    // wait. Also we can't `await` in the constructor.
    matchers.reload()

    this.customRoutes = this.getCustomRoutes()
    this.router = new Router(this.generateRoutes(dev))
    this.setAssetPrefix(assetPrefix)

    this.responseCache = this.getResponseCache({ dev })
  }

  protected getRoutes(): {
    matchers: RouteMatcherManager
    handlers: RouteHandlerManager
  } {
    // Create a new manifest loader that get's the manifests from the server.
    const manifestLoader = new ServerManifestLoader((name) => {
      switch (name) {
        case PAGES_MANIFEST:
          return this.getPagesManifest() ?? null
        case APP_PATHS_MANIFEST:
          return this.getAppPathsManifest() ?? null
        default:
          return null
      }
    })

    // Configure the matchers and handlers.
    const matchers: RouteMatcherManager = new DefaultRouteMatcherManager()
    const handlers = new RouteHandlerManager()

    // Match pages under `pages/`.
    matchers.push(
      new PagesRouteMatcherProvider(
        this.distDir,
        manifestLoader,
        this.i18nProvider
      )
    )

    // Match api routes under `pages/api/`.
    matchers.push(
      new PagesAPIRouteMatcherProvider(
        this.distDir,
        manifestLoader,
        this.i18nProvider
      )
    )

    // If the app directory is enabled, then add the app matchers and handlers.
    if (this.hasAppDir) {
      // Match app pages under `app/`.
      matchers.push(
        new AppPageRouteMatcherProvider(this.distDir, manifestLoader)
      )
      matchers.push(
        new AppRouteRouteMatcherProvider(this.distDir, manifestLoader)
      )
    }

    return { matchers, handlers }
  }

  public logError(err: Error): void {
    if (this.quiet) return
    console.error(err)
  }

  public async handleRequest(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl?: NextUrlWithParsedQuery
  ): Promise<void> {
    await this.prepare()
    const method = req.method.toUpperCase()
    return getTracer().trace(
      BaseServerSpan.handleRequest,
      {
        spanName: `${method} ${req.url}`,
        kind: SpanKind.SERVER,
        attributes: {
          'http.method': method,
          'http.target': req.url,
        },
        // We will fire this from the renderer worker
        hideSpan: this.isRouterWorker,
      },
      async (span) =>
        this.handleRequestImpl(req, res, parsedUrl).finally(() => {
          if (!span) return
          span.setAttributes({
            'http.status_code': res.statusCode,
          })
          const rootSpanAttributes = getTracer().getRootSpanAttributes()
          // We were unable to get attributes, probably OTEL is not enabled
          if (!rootSpanAttributes) return

          if (
            rootSpanAttributes.get('next.span_type') !==
            BaseServerSpan.handleRequest
          ) {
            console.warn(
              `Unexpected root span type '${rootSpanAttributes.get(
                'next.span_type'
              )}'. Please report this Next.js issue https://github.com/vercel/next.js`
            )
            return
          }

          const route = rootSpanAttributes.get('next.route')
          if (route) {
            const newName = `${method} ${route}`
            span.setAttributes({
              'next.route': route,
              'http.route': route,
              'next.span_name': newName,
            })
            span.updateName(newName)
          }
        })
    )
  }

  private async handleRequestImpl(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl?: NextUrlWithParsedQuery
  ): Promise<void> {
    try {
      // Wait for the matchers to be ready.
      await this.matchers.waitTillReady()

      // ensure cookies set in middleware are merged and
      // not overridden by API routes/getServerSideProps
      const _res = (res as any).originalResponse || res
      const origSetHeader = _res.setHeader.bind(_res)

      _res.setHeader = (name: string, val: string | string[]) => {
        if (name.toLowerCase() === 'set-cookie') {
          const middlewareValue = getRequestMeta(req, '_nextMiddlewareCookie')

          if (
            !middlewareValue ||
            !Array.isArray(val) ||
            !val.every((item, idx) => item === middlewareValue[idx])
          ) {
            val = [
              // TODO: (wyattjoh) find out why this is called multiple times resulting in duplicate cookies being added
              ...new Set([
                ...(middlewareValue || []),
                ...(typeof val === 'string'
                  ? [val]
                  : Array.isArray(val)
                  ? val
                  : []),
              ]),
            ]
          }
        }
        return origSetHeader(name, val)
      }

      const urlParts = (req.url || '').split('?')
      const urlNoQuery = urlParts[0]

      // this normalizes repeated slashes in the path e.g. hello//world ->
      // hello/world or backslashes to forward slashes, this does not
      // handle trailing slash as that is handled the same as a next.config.js
      // redirect
      if (urlNoQuery?.match(/(\\|\/\/)/)) {
        const cleanUrl = normalizeRepeatedSlashes(req.url!)
        res.redirect(cleanUrl, 308).body(cleanUrl).send()
        return
      }

      setLazyProp({ req: req as any }, 'cookies', getCookieParser(req.headers))

      // Parse url if parsedUrl not provided
      if (!parsedUrl || typeof parsedUrl !== 'object') {
        parsedUrl = parseUrl(req.url!, true)
      }

      // Parse the querystring ourselves if the user doesn't handle querystring parsing
      if (typeof parsedUrl.query === 'string') {
        parsedUrl.query = Object.fromEntries(
          new URLSearchParams(parsedUrl.query)
        )
      }
      // in minimal mode we detect RSC revalidate if the .rsc
      // path is requested
      if (this.minimalMode && req.url.endsWith('.rsc')) {
        parsedUrl.query.__nextDataReq = '1'
      }

      req.url = normalizeRscPath(req.url, this.hasAppDir)
      parsedUrl.pathname = normalizeRscPath(
        parsedUrl.pathname || '',
        this.hasAppDir
      )

      this.attachRequestMeta(req, parsedUrl)

      const domainLocale = this.i18nProvider?.detectDomainLocale(
        getHostname(parsedUrl, req.headers)
      )

      const defaultLocale =
        domainLocale?.defaultLocale || this.nextConfig.i18n?.defaultLocale
      parsedUrl.query.__nextDefaultLocale = defaultLocale

      const url = parseUrlUtil(req.url.replace(/^\/+/, '/'))
      const pathnameInfo = getNextPathnameInfo(url.pathname, {
        nextConfig: this.nextConfig,
        i18nProvider: this.i18nProvider,
      })
      url.pathname = pathnameInfo.pathname

      if (pathnameInfo.basePath) {
        req.url = removePathPrefix(req.url!, this.nextConfig.basePath)
        addRequestMeta(req, '_nextHadBasePath', true)
      }

      if (
        this.minimalMode &&
        typeof req.headers['x-matched-path'] === 'string'
      ) {
        try {
          if (this.hasAppDir) {
            // ensure /index path is normalized for prerender
            // in minimal mode
            if (req.url.match(/^\/index($|\?)/)) {
              req.url = req.url.replace(/^\/index/, '/')
            }
            parsedUrl.pathname =
              parsedUrl.pathname === '/index' ? '/' : parsedUrl.pathname
          }
          // x-matched-path is the source of truth, it tells what page
          // should be rendered because we don't process rewrites in minimalMode
          let matchedPath = normalizeRscPath(
            new URL(req.headers['x-matched-path'], 'http://localhost').pathname,
            this.hasAppDir
          )

          let urlPathname = new URL(req.url, 'http://localhost').pathname

          // For ISR  the URL is normalized to the prerenderPath so if
          // it's a data request the URL path will be the data URL,
          // basePath is already stripped by this point
          if (urlPathname.startsWith(`/_next/data/`)) {
            parsedUrl.query.__nextDataReq = '1'
          }

          const normalizedUrlPath = this.stripNextDataPath(urlPathname)
          matchedPath = this.stripNextDataPath(matchedPath, false)

          // Perform locale detection and normalization.
          const localeAnalysisResult = this.i18nProvider?.analyze(matchedPath, {
            defaultLocale,
          })

          // The locale result will be defined even if the locale was not
          // detected for the request because it will be inferred from the
          // default locale.
          if (localeAnalysisResult) {
            parsedUrl.query.__nextLocale = localeAnalysisResult.detectedLocale

            // If the detected locale was inferred from the default locale, we
            // need to modify the metadata on the request to indicate that.
            if (localeAnalysisResult.inferredFromDefault) {
              parsedUrl.query.__nextInferredLocaleFromDefault = '1'
            } else {
              delete parsedUrl.query.__nextInferredLocaleFromDefault
            }
          }

          // TODO: check if this is needed any more?
          matchedPath = denormalizePagePath(matchedPath)

          let srcPathname = matchedPath
          const match = await this.matchers.match(matchedPath, {
            i18n: localeAnalysisResult,
          })

          // Update the source pathname to the matched page's pathname.
          if (match) srcPathname = match.definition.pathname

          // The page is dynamic if the params are defined.
          const pageIsDynamic = typeof match?.params !== 'undefined'

          // The rest of this function can't handle i18n properly, so ensure we
          // restore the pathname with the locale information stripped from it
          // now that we're done matching if we're using i18n.
          if (localeAnalysisResult) {
            matchedPath = localeAnalysisResult.pathname
          }

          const utils = getUtils({
            pageIsDynamic,
            page: srcPathname,
            i18n: this.nextConfig.i18n,
            basePath: this.nextConfig.basePath,
            rewrites: this.customRoutes.rewrites,
          })

          // Ensure parsedUrl.pathname includes locale before processing
          // rewrites or they won't match correctly.
          if (defaultLocale && !pathnameInfo.locale) {
            parsedUrl.pathname = `/${defaultLocale}${parsedUrl.pathname}`
          }

          const pathnameBeforeRewrite = parsedUrl.pathname
          const rewriteParams = utils.handleRewrites(req, parsedUrl)
          const rewriteParamKeys = Object.keys(rewriteParams)
          const didRewrite = pathnameBeforeRewrite !== parsedUrl.pathname

          if (didRewrite) {
            addRequestMeta(req, '_nextRewroteUrl', parsedUrl.pathname!)
            addRequestMeta(req, '_nextDidRewrite', true)
          }
          const routeParamKeys = new Set<string>()

          for (const key of Object.keys(parsedUrl.query)) {
            const value = parsedUrl.query[key]

            if (
              key !== NEXT_QUERY_PARAM_PREFIX &&
              key.startsWith(NEXT_QUERY_PARAM_PREFIX)
            ) {
              const normalizedKey = key.substring(
                NEXT_QUERY_PARAM_PREFIX.length
              )
              parsedUrl.query[normalizedKey] = value

              routeParamKeys.add(normalizedKey)
              delete parsedUrl.query[key]
            }
          }

          // interpolate dynamic params and normalize URL if needed
          if (pageIsDynamic) {
            let params: ParsedUrlQuery | false = {}

            let paramsResult = utils.normalizeDynamicRouteParams(
              parsedUrl.query
            )

            // for prerendered ISR paths we attempt parsing the route
            // params from the URL directly as route-matches may not
            // contain the correct values due to the filesystem path
            // matching before the dynamic route has been matched
            if (
              !paramsResult.hasValidParams &&
              pageIsDynamic &&
              !isDynamicRoute(normalizedUrlPath)
            ) {
              let matcherParams = utils.dynamicRouteMatcher?.(normalizedUrlPath)

              if (matcherParams) {
                utils.normalizeDynamicRouteParams(matcherParams)
                Object.assign(paramsResult.params, matcherParams)
                paramsResult.hasValidParams = true
              }
            }

            if (paramsResult.hasValidParams) {
              params = paramsResult.params
            }

            if (
              req.headers['x-now-route-matches'] &&
              isDynamicRoute(matchedPath) &&
              !paramsResult.hasValidParams
            ) {
              const opts: Record<string, string> = {}
              const routeParams = utils.getParamsFromRouteMatches(
                req,
                opts,
                parsedUrl.query.__nextLocale || ''
              )

              // If this returns a locale, it means that the locale was detected
              // from the pathname.
              if (opts.locale) {
                parsedUrl.query.__nextLocale = opts.locale

                // As the locale was parsed from the pathname, we should mark
                // that the locale was not inferred as the default.
                delete parsedUrl.query.__nextInferredLocaleFromDefault
              }
              paramsResult = utils.normalizeDynamicRouteParams(
                routeParams,
                true
              )

              if (paramsResult.hasValidParams) {
                params = paramsResult.params
              }
            }

            // handle the actual dynamic route name being requested
            if (
              pageIsDynamic &&
              utils.defaultRouteMatches &&
              normalizedUrlPath === srcPathname &&
              !paramsResult.hasValidParams &&
              !utils.normalizeDynamicRouteParams({ ...params }, true)
                .hasValidParams
            ) {
              params = utils.defaultRouteMatches
            }

            if (params) {
              matchedPath = utils.interpolateDynamicPath(srcPathname, params)
              req.url = utils.interpolateDynamicPath(req.url!, params)
            }
          }

          if (pageIsDynamic || didRewrite) {
            utils.normalizeVercelUrl(req, true, [
              ...rewriteParamKeys,
              ...Object.keys(utils.defaultRouteRegex?.groups || {}),
            ])
          }
          for (const key of routeParamKeys) {
            delete parsedUrl.query[key]
          }
          parsedUrl.pathname = `${this.nextConfig.basePath || ''}${
            matchedPath === '/' && this.nextConfig.basePath ? '' : matchedPath
          }`
          url.pathname = parsedUrl.pathname
        } catch (err) {
          if (err instanceof DecodeError || err instanceof NormalizeError) {
            res.statusCode = 400
            return this.renderError(null, req, res, '/_error', {})
          }
          throw err
        }
      }

      addRequestMeta(req, '__nextHadTrailingSlash', pathnameInfo.trailingSlash)
      addRequestMeta(req, '__nextIsLocaleDomain', Boolean(domainLocale))

      if (pathnameInfo.locale) {
        req.url = formatUrl(url)
        addRequestMeta(req, '__nextStrippedLocale', true)
      }

      // If we aren't in minimal mode or there is no locale in the query
      // string, add the locale to the query string.
      if (!this.minimalMode || !parsedUrl.query.__nextLocale) {
        // If the locale is in the pathname, add it to the query string.
        if (pathnameInfo.locale) {
          parsedUrl.query.__nextLocale = pathnameInfo.locale
        }
        // If the default locale is available, add it to the query string and
        // mark it as inferred rather than implicit.
        else if (defaultLocale) {
          parsedUrl.query.__nextLocale = defaultLocale
          parsedUrl.query.__nextInferredLocaleFromDefault = '1'
        }
      }

      if (
        // Edge runtime always has minimal mode enabled.
        process.env.NEXT_RUNTIME !== 'edge' &&
        !this.minimalMode &&
        defaultLocale
      ) {
        const { getLocaleRedirect } =
          require('../shared/lib/i18n/get-locale-redirect') as typeof import('../shared/lib/i18n/get-locale-redirect')
        const redirect = getLocaleRedirect({
          defaultLocale,
          domainLocale,
          headers: req.headers,
          nextConfig: this.nextConfig,
          pathLocale: pathnameInfo.locale,
          urlParsed: {
            ...url,
            pathname: pathnameInfo.locale
              ? `/${pathnameInfo.locale}${url.pathname}`
              : url.pathname,
          },
        })

        if (redirect) {
          return res
            .redirect(redirect, TEMPORARY_REDIRECT_STATUS)
            .body(redirect)
            .send()
        }
      }

      res.statusCode = 200
      return await this.run(req, res, parsedUrl)
    } catch (err: any) {
      if (
        (err && typeof err === 'object' && err.code === 'ERR_INVALID_URL') ||
        err instanceof DecodeError ||
        err instanceof NormalizeError
      ) {
        res.statusCode = 400
        return this.renderError(null, req, res, '/_error', {})
      }

      if (this.minimalMode || this.renderOpts.dev) {
        throw err
      }
      this.logError(getProperError(err))
      res.statusCode = 500
      res.body('Internal Server Error').send()
    }
  }

  public getRequestHandler(): BaseRequestHandler {
    return this.handleRequest.bind(this)
  }

  protected async handleUpgrade(
    _req: BaseNextRequest,
    _socket: any,
    _head?: any
  ): Promise<void> {}

  public setAssetPrefix(prefix?: string): void {
    this.renderOpts.assetPrefix = prefix ? prefix.replace(/\/$/, '') : ''
  }

  protected preparedPromise: Promise<void> | null = null
  /**
   * Runs async initialization of server.
   * It is idempotent, won't fire underlying initialization more than once.
   */
  public async prepare(): Promise<void> {
    if (this.preparedPromise === null) {
      this.preparedPromise = this.prepareImpl()
    }
    return this.preparedPromise
  }
  protected async prepareImpl(): Promise<void> {}

  // Backwards compatibility
  protected async close(): Promise<void> {}

  protected async _beforeCatchAllRender(
    _req: BaseNextRequest,
    _res: BaseNextResponse,
    _params: Params,
    _parsedUrl: UrlWithParsedQuery
  ): Promise<boolean> {
    return false
  }

  protected getAppPathRoutes(): Record<string, string[]> {
    const appPathRoutes: Record<string, string[]> = {}

    Object.keys(this.appPathsManifest || {}).forEach((entry) => {
      const normalizedPath = normalizeAppPath(entry)
      if (!appPathRoutes[normalizedPath]) {
        appPathRoutes[normalizedPath] = []
      }
      appPathRoutes[normalizedPath].push(entry)
    })
    return appPathRoutes
  }

  protected async run(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl: UrlWithParsedQuery
  ): Promise<void> {
    return getTracer().trace(BaseServerSpan.run, async () =>
      this.runImpl(req, res, parsedUrl)
    )
  }

  private async runImpl(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl: UrlWithParsedQuery
  ): Promise<void> {
    this.handleCompression(req, res)

    // set incremental cache to request meta so it can
    // be passed down for edge functions and the fetch disk
    // cache can be leveraged locally
    if (
      !(this.serverOptions as any).webServerConfig &&
      !getRequestMeta(req, '_nextIncrementalCache')
    ) {
      let protocol: 'http:' | 'https:' = 'https:'

      try {
        const parsedFullUrl = new URL(
          getRequestMeta(req, '__NEXT_INIT_URL') || '/',
          'http://n'
        )
        protocol = parsedFullUrl.protocol as 'https:' | 'http:'
      } catch (_) {}

      const incrementalCache = this.getIncrementalCache({
        requestHeaders: Object.assign({}, req.headers),
        requestProtocol: protocol.substring(0, protocol.length - 1) as
          | 'http'
          | 'https',
      })
      addRequestMeta(req, '_nextIncrementalCache', incrementalCache)
      ;(globalThis as any).__incrementalCache = incrementalCache
    }

    try {
      const matched = await this.router.execute(req, res, parsedUrl)
      if (matched) {
        return
      }
    } catch (err) {
      if (err instanceof DecodeError || err instanceof NormalizeError) {
        res.statusCode = 400
        return this.renderError(null, req, res, '/_error', {})
      }
      throw err
    }

    await this.render404(req, res, parsedUrl)
  }

  private async pipe(
    fn: (ctx: RequestContext) => Promise<ResponsePayload | null>,
    partialContext: Omit<RequestContext, 'renderOpts'>
  ): Promise<void> {
    return getTracer().trace(BaseServerSpan.pipe, async () =>
      this.pipeImpl(fn, partialContext)
    )
  }

  private async pipeImpl(
    fn: (ctx: RequestContext) => Promise<ResponsePayload | null>,
    partialContext: Omit<RequestContext, 'renderOpts'>
  ): Promise<void> {
    const isBotRequest = isBot(partialContext.req.headers['user-agent'] || '')
    const ctx: RequestContext = {
      ...partialContext,
      renderOpts: {
        ...this.renderOpts,
        supportsDynamicHTML: !isBotRequest,
        isBot: !!isBotRequest,
      },
    }
    const payload = await fn(ctx)
    if (payload === null) {
      return
    }
    const { req, res } = ctx
    const { body, type, revalidateOptions } = payload
    if (!res.sent) {
      const { generateEtags, poweredByHeader, dev } = this.renderOpts
      if (dev) {
        // In dev, we should not cache pages for any reason.
        res.setHeader('Cache-Control', 'no-store, must-revalidate')
      }
      return this.sendRenderResult(req, res, {
        result: body,
        type,
        generateEtags,
        poweredByHeader,
        options: revalidateOptions,
      })
    }
  }

  private async getStaticHTML(
    fn: (ctx: RequestContext) => Promise<ResponsePayload | null>,
    partialContext: Omit<RequestContext, 'renderOpts'>
  ): Promise<string | null> {
    const ctx: RequestContext = {
      ...partialContext,
      renderOpts: {
        ...this.renderOpts,
        supportsDynamicHTML: false,
      },
    }
    const payload = await fn(ctx)
    if (payload === null) {
      return null
    }
    return payload.body.toUnchunkedString()
  }

  public async render(
    req: BaseNextRequest,
    res: BaseNextResponse,
    pathname: string,
    query: NextParsedUrlQuery = {},
    parsedUrl?: NextUrlWithParsedQuery,
    internalRender = false
  ): Promise<void> {
    return getTracer().trace(BaseServerSpan.render, async () =>
      this.renderImpl(req, res, pathname, query, parsedUrl, internalRender)
    )
  }

  private async renderImpl(
    req: BaseNextRequest,
    res: BaseNextResponse,
    pathname: string,
    query: NextParsedUrlQuery = {},
    parsedUrl?: NextUrlWithParsedQuery,
    internalRender = false
  ): Promise<void> {
    if (!pathname.startsWith('/')) {
      console.warn(
        `Cannot render page with path "${pathname}", did you mean "/${pathname}"?. See more info here: https://nextjs.org/docs/messages/render-no-starting-slash`
      )
    }

    if (
      this.renderOpts.customServer &&
      pathname === '/index' &&
      !(await this.hasPage('/index'))
    ) {
      // maintain backwards compatibility for custom server
      // (see custom-server integration tests)
      pathname = '/'
    }

    // we allow custom servers to call render for all URLs
    // so check if we need to serve a static _next file or not.
    // we don't modify the URL for _next/data request but still
    // call render so we special case this to prevent an infinite loop
    if (
      !internalRender &&
      !this.minimalMode &&
      !query.__nextDataReq &&
      (req.url?.match(/^\/_next\//) ||
        (this.hasStaticDir && req.url!.match(/^\/static\//)))
    ) {
      return this.handleRequest(req, res, parsedUrl)
    }

    // Custom server users can run `app.render()` which needs compression.
    if (this.renderOpts.customServer) {
      this.handleCompression(req, res)
    }

    if (isBlockedPage(pathname)) {
      return this.render404(req, res, parsedUrl)
    }

    return this.pipe((ctx) => this.renderToResponse(ctx), {
      req,
      res,
      pathname,
      query,
    })
  }

  protected async getStaticPaths({
    pathname,
  }: {
    pathname: string
    requestHeaders: import('./lib/incremental-cache').IncrementalCache['requestHeaders']
    originalAppPath?: string
  }): Promise<{
    staticPaths?: string[]
    fallbackMode?: 'static' | 'blocking' | false
  }> {
    // `staticPaths` is intentionally set to `undefined` as it should've
    // been caught when checking disk data.
    const staticPaths = undefined

    // Read whether or not fallback should exist from the manifest.
    const fallbackField =
      this.getPrerenderManifest().dynamicRoutes[pathname]?.fallback

    return {
      staticPaths,
      fallbackMode:
        typeof fallbackField === 'string'
          ? 'static'
          : fallbackField === null
          ? 'blocking'
          : fallbackField,
    }
  }

  private async renderToResponseWithComponents(
    requestContext: RequestContext,
    findComponentsResult: FindComponentsResult
  ): Promise<ResponsePayload | null> {
    return getTracer().trace(
      BaseServerSpan.renderToResponseWithComponents,
      async () =>
        this.renderToResponseWithComponentsImpl(
          requestContext,
          findComponentsResult
        )
    )
  }

  private async renderToResponseWithComponentsImpl(
    { req, res, pathname, renderOpts: opts }: RequestContext,
    { components, query }: FindComponentsResult
  ): Promise<ResponsePayload | null> {
    const is404Page = pathname === '/404'
    const is500Page = pathname === '/500'
    const isAppPath = components.isAppPath
    const hasServerProps = !!components.getServerSideProps
    let hasStaticPaths = !!components.getStaticPaths

    const hasGetInitialProps = !!components.Component?.getInitialProps
    let isSSG = !!components.getStaticProps

    // Compute the iSSG cache key. We use the rewroteUrl since
    // pages with fallback: false are allowed to be rewritten to
    // and we need to look up the path by the rewritten path
    let urlPathname = parseUrl(req.url || '').pathname || '/'

    let resolvedUrlPathname =
      getRequestMeta(req, '_nextRewroteUrl') || urlPathname

    let staticPaths: string[] | undefined
    let fallbackMode: false | undefined | 'blocking' | 'static'

    if (isAppPath) {
      const pathsResult = await this.getStaticPaths({
        pathname,
        originalAppPath: components.pathname,
        requestHeaders: req.headers,
      })

      staticPaths = pathsResult.staticPaths
      fallbackMode = pathsResult.fallbackMode

      const hasFallback = typeof fallbackMode !== 'undefined'

      if (hasFallback) {
        hasStaticPaths = true
      }

      if (hasFallback || staticPaths?.includes(resolvedUrlPathname)) {
        isSSG = true
      } else if (!this.renderOpts.dev) {
        const manifest = this.getPrerenderManifest()
        isSSG =
          isSSG || !!manifest.routes[pathname === '/index' ? '/' : pathname]
      }
    }

    // Toggle whether or not this is a Data request
    let isDataReq =
      !!(
        query.__nextDataReq ||
        (req.headers['x-nextjs-data'] &&
          (this.serverOptions as any).webServerConfig)
      ) &&
      (isSSG || hasServerProps)

    // when we are handling a middleware prefetch and it doesn't
    // resolve to a static data route we bail early to avoid
    // unexpected SSR invocations
    if (
      !isSSG &&
      req.headers['x-middleware-prefetch'] &&
      !(is404Page || pathname === '/_error')
    ) {
      res.setHeader('x-middleware-skip', '1')
      res.body('{}').send()
      return null
    }

    if (isAppPath) {
      res.setHeader('vary', RSC_VARY_HEADER)

      if (isSSG && req.headers[RSC.toLowerCase()]) {
        if (!this.minimalMode) {
          isDataReq = true
        }
        // strip header so we generate HTML still
        if (
          !isEdgeRuntime(opts.runtime) ||
          (this.serverOptions as any).webServerConfig
        ) {
          for (const param of FLIGHT_PARAMETERS) {
            delete req.headers[param.toString().toLowerCase()]
          }
        }
      }
    }

    delete query.__nextDataReq

    // normalize req.url for SSG paths as it is not exposed
    // to getStaticProps and the asPath should not expose /_next/data
    if (
      isSSG &&
      this.minimalMode &&
      req.headers['x-matched-path'] &&
      req.url.startsWith('/_next/data')
    ) {
      req.url = this.stripNextDataPath(req.url)
    }

    if (
      !!req.headers['x-nextjs-data'] &&
      (!res.statusCode || res.statusCode === 200)
    ) {
      res.setHeader(
        'x-nextjs-matched-path',
        `${query.__nextLocale ? `/${query.__nextLocale}` : ''}${pathname}`
      )
    }

    // Don't delete headers[RSC] yet, it still needs to be used in renderToHTML later
    const isFlightRequest = Boolean(
      this.clientReferenceManifest && req.headers[RSC.toLowerCase()]
    )

    // For pages we need to ensure the correct Vary header is set too, to avoid
    // caching issues when navigating between pages and app
    if (!isAppPath && isFlightRequest) {
      res.setHeader('vary', RSC_VARY_HEADER)
    }

    // we need to ensure the status code if /404 is visited directly
    if (is404Page && !isDataReq && !isFlightRequest) {
      res.statusCode = 404
    }

    // ensure correct status is set when visiting a status page
    // directly e.g. /500
    if (STATIC_STATUS_PAGES.includes(pathname)) {
      res.statusCode = parseInt(pathname.slice(1), 10)
    }

    // static pages can only respond to GET/HEAD
    // requests so ensure we respond with 405 for
    // invalid requests
    if (
      !is404Page &&
      !is500Page &&
      pathname !== '/_error' &&
      req.method !== 'HEAD' &&
      req.method !== 'GET' &&
      (typeof components.Component === 'string' || isSSG)
    ) {
      res.statusCode = 405
      res.setHeader('Allow', ['GET', 'HEAD'])
      await this.renderError(null, req, res, pathname)
      return null
    }

    // handle static page
    if (typeof components.Component === 'string') {
      return {
        type: 'html',
        // TODO: Static pages should be serialized as RenderResult
        body: RenderResult.fromStatic(components.Component),
      }
    }

    if (!query.amp) {
      delete query.amp
    }

    if (opts.supportsDynamicHTML === true) {
      const isBotRequest = isBot(req.headers['user-agent'] || '')
      const isSupportedDocument =
        typeof components.Document?.getInitialProps !== 'function' ||
        // The built-in `Document` component also supports dynamic HTML for concurrent mode.
        NEXT_BUILTIN_DOCUMENT in components.Document

      // Disable dynamic HTML in cases that we know it won't be generated,
      // so that we can continue generating a cache key when possible.
      // TODO-APP: should the first render for a dynamic app path
      // be static so we can collect revalidate and populate the
      // cache if there are no dynamic data requirements
      opts.supportsDynamicHTML =
        !isSSG && !isBotRequest && !query.amp && isSupportedDocument
      opts.isBot = isBotRequest
    }

    // In development, we always want to generate dynamic HTML.
    if (
      !isDataReq &&
      isAppPath &&
      opts.dev &&
      opts.supportsDynamicHTML === false
    ) {
      opts.supportsDynamicHTML = true
    }

    const defaultLocale = isSSG
      ? this.nextConfig.i18n?.defaultLocale
      : query.__nextDefaultLocale

    const locale = query.__nextLocale
    const locales = this.nextConfig.i18n?.locales

    let previewData: PreviewData
    let isPreviewMode = false

    if (hasServerProps || isSSG) {
      // For the edge runtime, we don't support preview mode in SSG.
      if (process.env.NEXT_RUNTIME !== 'edge') {
        const { tryGetPreviewData } =
          require('./api-utils/node') as typeof import('./api-utils/node')
        previewData = tryGetPreviewData(req, res, this.renderOpts.previewProps)
        isPreviewMode = previewData !== false
      }
    }

    let isOnDemandRevalidate = false
    let revalidateOnlyGenerated = false

    if (isSSG) {
      ;({ isOnDemandRevalidate, revalidateOnlyGenerated } =
        checkIsOnDemandRevalidate(req, this.renderOpts.previewProps))
    }

    if (isSSG && this.minimalMode && req.headers['x-matched-path']) {
      // the url value is already correct when the matched-path header is set
      resolvedUrlPathname = urlPathname
    }

    urlPathname = removeTrailingSlash(urlPathname)
    resolvedUrlPathname = removeTrailingSlash(resolvedUrlPathname)
    if (this.localeNormalizer) {
      resolvedUrlPathname = this.localeNormalizer.normalize(resolvedUrlPathname)
    }

    const handleRedirect = (pageData: any) => {
      const redirect = {
        destination: pageData.pageProps.__N_REDIRECT,
        statusCode: pageData.pageProps.__N_REDIRECT_STATUS,
        basePath: pageData.pageProps.__N_REDIRECT_BASE_PATH,
      }
      const statusCode = getRedirectStatus(redirect)
      const { basePath } = this.nextConfig

      if (
        basePath &&
        redirect.basePath !== false &&
        redirect.destination.startsWith('/')
      ) {
        redirect.destination = `${basePath}${redirect.destination}`
      }

      if (redirect.destination.startsWith('/')) {
        redirect.destination = normalizeRepeatedSlashes(redirect.destination)
      }

      res
        .redirect(redirect.destination, statusCode)
        .body(redirect.destination)
        .send()
    }

    // remove /_next/data prefix from urlPathname so it matches
    // for direct page visit and /_next/data visit
    if (isDataReq) {
      resolvedUrlPathname = this.stripNextDataPath(resolvedUrlPathname)
      urlPathname = this.stripNextDataPath(urlPathname)
    }

    let ssgCacheKey =
      isPreviewMode || !isSSG || opts.supportsDynamicHTML
        ? null // Preview mode, on-demand revalidate, flight request can bypass the cache
        : `${locale ? `/${locale}` : ''}${
            (pathname === '/' || resolvedUrlPathname === '/') && locale
              ? ''
              : resolvedUrlPathname
          }${query.amp ? '.amp' : ''}`

    if ((is404Page || is500Page) && isSSG) {
      ssgCacheKey = `${locale ? `/${locale}` : ''}${pathname}${
        query.amp ? '.amp' : ''
      }`
    }

    if (ssgCacheKey) {
      // we only encode path delimiters for path segments from
      // getStaticPaths so we need to attempt decoding the URL
      // to match against and only escape the path delimiters
      // this allows non-ascii values to be handled e.g. Japanese characters

      // TODO: investigate adding this handling for non-SSG pages so
      // non-ascii names work there also
      ssgCacheKey = ssgCacheKey
        .split('/')
        .map((seg) => {
          try {
            seg = escapePathDelimiters(decodeURIComponent(seg), true)
          } catch (_) {
            // An improperly encoded URL was provided
            throw new DecodeError('failed to decode param')
          }
          return seg
        })
        .join('/')

      // ensure /index and / is normalized to one key
      ssgCacheKey =
        ssgCacheKey === '/index' && pathname === '/' ? '/' : ssgCacheKey
    }
    let protocol: 'http:' | 'https:' = 'https:'

    try {
      const parsedFullUrl = new URL(
        getRequestMeta(req, '__NEXT_INIT_URL') || '/',
        'http://n'
      )
      protocol = parsedFullUrl.protocol as 'https:' | 'http:'
    } catch (_) {}

    // use existing incrementalCache instance if available
    const incrementalCache =
      (globalThis as any).__incrementalCache ||
      this.getIncrementalCache({
        requestHeaders: Object.assign({}, req.headers),
        requestProtocol: protocol.substring(0, protocol.length - 1) as
          | 'http'
          | 'https',
      })

    const doRender: () => Promise<ResponseCacheEntry | null> = async () => {
      // In development, we always want to generate dynamic HTML.
      const supportsDynamicHTML =
        (!isDataReq && opts.dev) || !(isSSG || hasStaticPaths)

      const match =
        pathname !== '/_error' && !is404Page && !is500Page
          ? getRequestMeta(req, '_nextMatch')
          : undefined

      if (match) {
        const context: RouteHandlerManagerContext = {
          params: match.params,
          prerenderManifest: this.getPrerenderManifest(),
          staticGenerationContext: {
            originalPathname: components.ComponentMod.originalPathname,
            supportsDynamicHTML,
            incrementalCache,
            isRevalidate: isSSG,
          },
        }

        try {
          // Handle the match and collect the response if it's a static response.
          const response = await this.handlers.handle(match, req, context)
          if (response) {
            ;(req as any).fetchMetrics = (
              context.staticGenerationContext as any
            ).fetchMetrics

            const cacheTags = (context.staticGenerationContext as any).fetchTags

            // If the request is for a static response, we can cache it so long
            // as it's not edge.
            if (isSSG && process.env.NEXT_RUNTIME !== 'edge') {
              const blob = await response.blob()

              // Copy the headers from the response.
              const headers = toNodeHeaders(response.headers)

              if (cacheTags) {
                headers['x-next-cache-tags'] = cacheTags
              }

              if (!headers['content-type'] && blob.type) {
                headers['content-type'] = blob.type
              }
              let revalidate: number | false | undefined =
                context.staticGenerationContext.store?.revalidate

              if (typeof revalidate == 'undefined') {
                revalidate = false
              }

              // Create the cache entry for the response.
              const cacheEntry: ResponseCacheEntry = {
                value: {
                  kind: 'ROUTE',
                  status: response.status,
                  body: Buffer.from(await blob.arrayBuffer()),
                  headers,
                },
                revalidate,
              }

              return cacheEntry
            }

            // Send the response now that we have copied it into the cache.
            await sendResponse(req, res, response)

            return null
          }
        } catch (err) {
          // If an error was thrown while handling an app route request, we
          // should return a 500 response.
          if (match.definition.kind === RouteKind.APP_ROUTE) {
            // If this is during static generation, throw the error again.
            if (isSSG) throw err

            // Otherwise, send a 500 response.
            Log.error(err)
            await sendResponse(req, res, handleInternalServerErrorResponse())

            return null
          }
        }
      }

      let pageData: any
      let body: RenderResult
      let isrRevalidate: number | false
      let isNotFound: boolean | undefined
      let isRedirect: boolean | undefined
      let headers: OutgoingHttpHeaders | undefined

      const origQuery = parseUrl(req.url || '', true).query

      // clear any dynamic route params so they aren't in
      // the resolvedUrl
      if (opts.params) {
        Object.keys(opts.params).forEach((key) => {
          delete origQuery[key]
        })
      }
      const hadTrailingSlash =
        urlPathname !== '/' && this.nextConfig.trailingSlash

      const resolvedUrl = formatUrl({
        pathname: `${resolvedUrlPathname}${hadTrailingSlash ? '/' : ''}`,
        // make sure to only add query values from original URL
        query: origQuery,
      })

      const renderOpts: RenderOpts = {
        ...components,
        ...opts,
        ...(isAppPath && this.nextConfig.experimental.appDir
          ? {
              incrementalCache,
              isRevalidate: isSSG,
              originalPathname: components.ComponentMod.originalPathname,
            }
          : {}),
        isDataReq,
        resolvedUrl,
        locale,
        locales,
        defaultLocale,
        // For getServerSideProps and getInitialProps we need to ensure we use the original URL
        // and not the resolved URL to prevent a hydration mismatch on
        // asPath
        resolvedAsPath:
          hasServerProps || hasGetInitialProps
            ? formatUrl({
                // we use the original URL pathname less the _next/data prefix if
                // present
                pathname: `${urlPathname}${hadTrailingSlash ? '/' : ''}`,
                query: origQuery,
              })
            : resolvedUrl,

        supportsDynamicHTML,
        isOnDemandRevalidate,
      }

      const renderResult = await this.renderHTML(
        req,
        res,
        pathname,
        query,
        renderOpts
      )

      body = renderResult

      const renderResultMeta = renderResult.metadata()

      pageData = renderResultMeta.pageData
      isrRevalidate = renderResultMeta.revalidate
      isNotFound = renderResultMeta.isNotFound
      isRedirect = renderResultMeta.isRedirect

      const cacheTags = (renderOpts as any).fetchTags

      if (cacheTags) {
        headers = {
          'x-next-cache-tags': cacheTags,
        }
      }
      ;(req as any).fetchMetrics = (renderOpts as any).fetchMetrics

      // we don't throw static to dynamic errors in dev as isSSG
      // is a best guess in dev since we don't have the prerender pass
      // to know whether the path is actually static or not
      if (isAppPath && isSSG && isrRevalidate === 0 && !this.renderOpts.dev) {
        const staticBailoutInfo: {
          stack?: string
          description?: string
        } = renderResultMeta.staticBailoutInfo || {}

        const err = new Error(
          `Page changed from static to dynamic at runtime ${urlPathname}${
            staticBailoutInfo.description
              ? `, reason: ${staticBailoutInfo.description}`
              : ``
          }` +
            `\nsee more here https://nextjs.org/docs/messages/app-static-to-dynamic-error`
        )

        if (staticBailoutInfo.stack) {
          const stack = staticBailoutInfo.stack as string
          err.stack = err.message + stack.substring(stack.indexOf('\n'))
        }

        throw err
      }

      let value: ResponseCacheValue | null
      if (isNotFound) {
        value = null
      } else if (isRedirect) {
        value = { kind: 'REDIRECT', props: pageData }
      } else {
        if (body.isNull()) {
          return null
        }
        value = { kind: 'PAGE', html: body, pageData, headers }
      }
      return { revalidate: isrRevalidate, value }
    }

    const cacheEntry = await this.responseCache.get(
      ssgCacheKey,
      async (hasResolved, hadCache): Promise<ResponseCacheEntry | null> => {
        const isProduction = !this.renderOpts.dev
        const isDynamicPathname = isDynamicRoute(pathname)
        const didRespond = hasResolved || res.sent

        if (!staticPaths) {
          ;({ staticPaths, fallbackMode } = hasStaticPaths
            ? await this.getStaticPaths({
                pathname,
                requestHeaders: req.headers,
              })
            : { staticPaths: undefined, fallbackMode: false })
        }

        if (
          fallbackMode === 'static' &&
          isBot(req.headers['user-agent'] || '')
        ) {
          fallbackMode = 'blocking'
        }

        // skip on-demand revalidate if cache is not present and
        // revalidate-if-generated is set
        if (
          isOnDemandRevalidate &&
          revalidateOnlyGenerated &&
          !hadCache &&
          !this.minimalMode
        ) {
          await this.render404(req, res)
          return null
        }

        if (hadCache?.isStale === -1) {
          isOnDemandRevalidate = true
        }

        // only allow on-demand revalidate for fallback: true/blocking
        // or for prerendered fallback: false paths
        if (isOnDemandRevalidate && (fallbackMode !== false || hadCache)) {
          fallbackMode = 'blocking'
        }

        // We use `ssgCacheKey` here as it is normalized to match the encoding
        // from getStaticPaths along with including the locale.
        //
        // We use the `resolvedUrlPathname` for the development case when this
        // is an app path since it doesn't include locale information.
        let staticPathKey =
          ssgCacheKey ?? (opts.dev && isAppPath ? resolvedUrlPathname : null)
        if (staticPathKey && query.amp) {
          staticPathKey = staticPathKey.replace(/\.amp$/, '')
        }

        const isPageIncludedInStaticPaths =
          staticPathKey && staticPaths?.includes(staticPathKey)

        // When we did not respond from cache, we need to choose to block on
        // rendering or return a skeleton.
        //
        // - Data requests always block.
        // - Blocking mode fallback always blocks.
        // - Preview mode toggles all pages to be resolved in a blocking manner.
        // - Non-dynamic pages should block (though this is an impossible
        //   case in production).
        // - Dynamic pages should return their skeleton if not defined in
        //   getStaticPaths, then finish the data request on the client-side.
        //
        if (
          process.env.NEXT_RUNTIME !== 'edge' &&
          !this.minimalMode &&
          fallbackMode !== 'blocking' &&
          staticPathKey &&
          !didRespond &&
          !isPreviewMode &&
          isDynamicPathname &&
          (isProduction || !staticPaths || !isPageIncludedInStaticPaths)
        ) {
          if (
            // In development, fall through to render to handle missing
            // getStaticPaths.
            (isProduction || (staticPaths && staticPaths?.length > 0)) &&
            // When fallback isn't present, abort this render so we 404
            fallbackMode !== 'static'
          ) {
            throw new NoFallbackError()
          }

          if (!isDataReq) {
            // Production already emitted the fallback as static HTML.
            if (isProduction) {
              const html = await this.getFallback(
                locale ? `/${locale}${pathname}` : pathname
              )
              return {
                value: {
                  kind: 'PAGE',
                  html: RenderResult.fromStatic(html),
                  pageData: {},
                },
              }
            }
            // We need to generate the fallback on-demand for development.
            else {
              query.__nextFallback = 'true'
              const result = await doRender()
              if (!result) {
                return null
              }
              // Prevent caching this result
              delete result.revalidate
              return result
            }
          }
        }

        const result = await doRender()
        if (!result) {
          return null
        }

        return {
          ...result,
          revalidate:
            result.revalidate !== undefined
              ? result.revalidate
              : /* default to minimum revalidate (this should be an invariant) */ 1,
        }
      },
      {
        incrementalCache,
        isOnDemandRevalidate: isOnDemandRevalidate,
        isPrefetch: req.headers.purpose === 'prefetch',
      }
    )

    if (!cacheEntry) {
      if (ssgCacheKey && !(isOnDemandRevalidate && revalidateOnlyGenerated)) {
        // A cache entry might not be generated if a response is written
        // in `getInitialProps` or `getServerSideProps`, but those shouldn't
        // have a cache key. If we do have a cache key but we don't end up
        // with a cache entry, then either Next.js or the application has a
        // bug that needs fixing.
        throw new Error('invariant: cache entry required but not generated')
      }
      return null
    }

    if (isSSG && !this.minimalMode) {
      // set x-nextjs-cache header to match the header
      // we set for the image-optimizer
      res.setHeader(
        'x-nextjs-cache',
        isOnDemandRevalidate
          ? 'REVALIDATED'
          : cacheEntry.isMiss
          ? 'MISS'
          : cacheEntry.isStale
          ? 'STALE'
          : 'HIT'
      )
    }

    const { revalidate, value: cachedData } = cacheEntry
    const revalidateOptions: any =
      typeof revalidate !== 'undefined' &&
      (!this.renderOpts.dev || (hasServerProps && !isDataReq))
        ? {
            // When the page is 404 cache-control should not be added unless
            // we are rendering the 404 page for notFound: true which should
            // cache according to revalidate correctly
            private: isPreviewMode || (is404Page && cachedData),
            stateful: !isSSG,
            revalidate,
          }
        : undefined

    if (!cachedData) {
      if (revalidateOptions) {
        setRevalidateHeaders(res, revalidateOptions)
      }
      if (isDataReq) {
        res.statusCode = 404
        res.body('{"notFound":true}').send()
        return null
      } else {
        if (this.renderOpts.dev) {
          query.__nextNotFoundSrcPage = pathname
        }
        await this.render404(req, res, { pathname, query }, false)
        return null
      }
    } else if (cachedData.kind === 'REDIRECT') {
      if (revalidateOptions) {
        setRevalidateHeaders(res, revalidateOptions)
      }
      if (isDataReq) {
        return {
          type: 'json',
          body: RenderResult.fromStatic(
            // @TODO: Handle flight data.
            JSON.stringify(cachedData.props)
          ),
          revalidateOptions,
        }
      } else {
        await handleRedirect(cachedData.props)
        return null
      }
    } else if (cachedData.kind === 'IMAGE') {
      throw new Error('invariant SSG should not return an image cache value')
    } else if (cachedData.kind === 'ROUTE') {
      const headers = { ...cachedData.headers }

      if (!(this.minimalMode && isSSG)) {
        delete headers['x-next-cache-tags']
      }

      await sendResponse(
        req,
        res,
        new Response(cachedData.body, {
          headers: fromNodeHeaders(headers),
          status: cachedData.status || 200,
        })
      )
      return null
    } else {
      if (isAppPath) {
        if (
          this.minimalMode &&
          isSSG &&
          cachedData.headers?.['x-next-cache-tags']
        ) {
          res.setHeader(
            'x-next-cache-tags',
            cachedData.headers['x-next-cache-tags'] as string
          )
        }
        if (isDataReq && typeof cachedData.pageData !== 'string') {
          throw new Error(
            'invariant: Expected pageData to be a string for app data request but received ' +
              typeof cachedData.pageData +
              '. This is a bug in Next.js.'
          )
        }

        return {
          type: isDataReq ? 'rsc' : 'html',
          body: isDataReq
            ? RenderResult.fromStatic(cachedData.pageData as string)
            : cachedData.html,
          revalidateOptions,
        }
      }

      return {
        type: isDataReq ? 'json' : 'html',
        body: isDataReq
          ? RenderResult.fromStatic(JSON.stringify(cachedData.pageData))
          : cachedData.html,
        revalidateOptions,
      }
    }
  }

  private stripNextDataPath(path: string, stripLocale = true) {
    if (path.includes(this.buildId)) {
      const splitPath = path.substring(
        path.indexOf(this.buildId) + this.buildId.length
      )

      path = denormalizePagePath(splitPath.replace(/\.json$/, ''))
    }

    if (this.localeNormalizer && stripLocale) {
      return this.localeNormalizer.normalize(path)
    }
    return path
  }

  // map the route to the actual bundle name
  protected getOriginalAppPaths(route: string) {
    if (this.hasAppDir) {
      const originalAppPath = this.appPathRoutes?.[route]

      if (!originalAppPath) {
        return null
      }

      return originalAppPath
    }
    return null
  }

  protected async renderPageComponent(
    ctx: RequestContext,
    bubbleNoFallback: boolean
  ) {
    const { query, pathname } = ctx

    const appPaths = this.getOriginalAppPaths(pathname)
    const isAppPath = Array.isArray(appPaths)

    let page = pathname
    if (isAppPath) {
      // the last item in the array is the root page, if there are parallel routes
      page = appPaths[appPaths.length - 1]
    }

    const result = await this.findPageComponents({
      pathname: page,
      query,
      params: ctx.renderOpts.params || {},
      isAppPath,
      sriEnabled: !!this.nextConfig.experimental.sri?.algorithm,
      appPaths,
      // Ensuring for loading page component routes is done via the matcher.
      shouldEnsure: false,
    })
    if (result) {
      try {
        return await this.renderToResponseWithComponents(ctx, result)
      } catch (err) {
        const isNoFallbackError = err instanceof NoFallbackError

        if (!isNoFallbackError || (isNoFallbackError && bubbleNoFallback)) {
          throw err
        }
      }
    }
    return false
  }

  private async renderToResponse(
    ctx: RequestContext
  ): Promise<ResponsePayload | null> {
    return getTracer().trace(
      BaseServerSpan.renderToResponse,
      {
        spanName: `rendering page`,
        attributes: {
          'next.route': ctx.pathname,
        },
      },
      async () => {
        return this.renderToResponseImpl(ctx)
      }
    )
  }

  private async renderToResponseImpl(
    ctx: RequestContext
  ): Promise<ResponsePayload | null> {
    const { res, query, pathname } = ctx
    let page = pathname
    const bubbleNoFallback = !!query._nextBubbleNoFallback
    delete query._nextBubbleNoFallback

    const options: MatchOptions = {
      i18n: this.i18nProvider?.fromQuery(pathname, query),
    }

    try {
      for await (const match of this.matchers.matchAll(pathname, options)) {
        const result = await this.renderPageComponent(
          {
            ...ctx,
            // Use the overridden pathname if available, otherwise use the
            // original pathname.
            pathname:
              match.definition.pathnameOverride || match.definition.pathname,
            renderOpts: {
              ...ctx.renderOpts,
              params: match.params,
            },
          },
          bubbleNoFallback
        )
        if (result !== false) return result
      }

      // currently edge functions aren't receiving the x-matched-path
      // header so we need to fallback to matching the current page
      // when we weren't able to match via dynamic route to handle
      // the rewrite case
      // @ts-expect-error extended in child class web-server
      if (this.serverOptions.webServerConfig) {
        // @ts-expect-error extended in child class web-server
        ctx.pathname = this.serverOptions.webServerConfig.page
        const result = await this.renderPageComponent(ctx, bubbleNoFallback)
        if (result !== false) return result
      }
    } catch (error) {
      const err = getProperError(error)

      if (error instanceof MissingStaticPage) {
        console.error(
          'Invariant: failed to load static page',
          JSON.stringify(
            {
              page,
              url: ctx.req.url,
              matchedPath: ctx.req.headers['x-matched-path'],
              initUrl: getRequestMeta(ctx.req, '__NEXT_INIT_URL'),
              didRewrite: getRequestMeta(ctx.req, '_nextDidRewrite'),
              rewroteUrl: getRequestMeta(ctx.req, '_nextRewroteUrl'),
            },
            null,
            2
          )
        )
        throw err
      }

      if (err instanceof NoFallbackError && bubbleNoFallback) {
        throw err
      }
      if (err instanceof DecodeError || err instanceof NormalizeError) {
        res.statusCode = 400
        return await this.renderErrorToResponse(ctx, err)
      }

      res.statusCode = 500

      // if pages/500 is present we still need to trigger
      // /_error `getInitialProps` to allow reporting error
      if (await this.hasPage('/500')) {
        ctx.query.__nextCustomErrorRender = '1'
        await this.renderErrorToResponse(ctx, err)
        delete ctx.query.__nextCustomErrorRender
      }

      const isWrappedError = err instanceof WrappedBuildError

      if (!isWrappedError) {
        if (
          (this.minimalMode && process.env.NEXT_RUNTIME !== 'edge') ||
          this.renderOpts.dev
        ) {
          if (isError(err)) err.page = page
          throw err
        }
        this.logError(getProperError(err))
      }
      const response = await this.renderErrorToResponse(
        ctx,
        isWrappedError ? (err as WrappedBuildError).innerError : err
      )
      return response
    }

    if (
      this.router.hasMiddleware &&
      !!ctx.req.headers['x-nextjs-data'] &&
      (!res.statusCode || res.statusCode === 200 || res.statusCode === 404)
    ) {
      res.setHeader(
        'x-nextjs-matched-path',
        `${query.__nextLocale ? `/${query.__nextLocale}` : ''}${pathname}`
      )
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.body('{}')
      res.send()
      return null
    }

    res.statusCode = 404
    return this.renderErrorToResponse(ctx, null)
  }

  public async renderToHTML(
    req: BaseNextRequest,
    res: BaseNextResponse,
    pathname: string,
    query: ParsedUrlQuery = {}
  ): Promise<string | null> {
    return getTracer().trace(BaseServerSpan.renderToHTML, async () => {
      return this.renderToHTMLImpl(req, res, pathname, query)
    })
  }

  private async renderToHTMLImpl(
    req: BaseNextRequest,
    res: BaseNextResponse,
    pathname: string,
    query: ParsedUrlQuery = {}
  ): Promise<string | null> {
    return this.getStaticHTML((ctx) => this.renderToResponse(ctx), {
      req,
      res,
      pathname,
      query,
    })
  }

  public async renderError(
    err: Error | null,
    req: BaseNextRequest,
    res: BaseNextResponse,
    pathname: string,
    query: NextParsedUrlQuery = {},
    setHeaders = true
  ): Promise<void> {
    return getTracer().trace(BaseServerSpan.renderError, async () => {
      return this.renderErrorImpl(err, req, res, pathname, query, setHeaders)
    })
  }

  private async renderErrorImpl(
    err: Error | null,
    req: BaseNextRequest,
    res: BaseNextResponse,
    pathname: string,
    query: NextParsedUrlQuery = {},
    setHeaders = true
  ): Promise<void> {
    if (setHeaders) {
      res.setHeader(
        'Cache-Control',
        'no-cache, no-store, max-age=0, must-revalidate'
      )
    }

    return this.pipe(
      async (ctx) => {
        const response = await this.renderErrorToResponse(ctx, err)
        if (this.minimalMode && res.statusCode === 500) {
          throw err
        }
        return response
      },
      { req, res, pathname, query }
    )
  }

  private customErrorNo404Warn = execOnce(() => {
    Log.warn(
      `You have added a custom /_error page without a custom /404 page. This prevents the 404 page from being auto statically optimized.\nSee here for info: https://nextjs.org/docs/messages/custom-error-no-custom-404`
    )
  })

  private async renderErrorToResponse(
    ctx: RequestContext,
    err: Error | null
  ): Promise<ResponsePayload | null> {
    return getTracer().trace(BaseServerSpan.renderErrorToResponse, async () => {
      return this.renderErrorToResponseImpl(ctx, err)
    })
  }

  private async renderErrorToResponseImpl(
    ctx: RequestContext,
    err: Error | null
  ): Promise<ResponsePayload | null> {
    const { res, query } = ctx
    try {
      let result: null | FindComponentsResult = null

      const is404 = res.statusCode === 404
      let using404Page = false

      // use static 404 page if available and is 404 response
      if (is404) {
        if (this.hasAppDir) {
          // Use the not-found entry in app directory
          result = await this.findPageComponents({
            pathname: this.renderOpts.dev ? '/not-found' : '/_not-found',
            query,
            params: {},
            isAppPath: true,
            shouldEnsure: true,
          })
          using404Page = result !== null
        }

        if (!result && (await this.hasPage('/404'))) {
          result = await this.findPageComponents({
            pathname: '/404',
            query,
            params: {},
            isAppPath: false,
            // Ensuring can't be done here because you never "match" a 404 route.
            shouldEnsure: true,
          })
          using404Page = result !== null
        }
      }
      let statusPage = `/${res.statusCode}`

      if (
        !ctx.query.__nextCustomErrorRender &&
        !result &&
        STATIC_STATUS_PAGES.includes(statusPage)
      ) {
        // skip ensuring /500 in dev mode as it isn't used and the
        // dev overlay is used instead
        if (statusPage !== '/500' || !this.renderOpts.dev) {
          result = await this.findPageComponents({
            pathname: statusPage,
            query,
            params: {},
            isAppPath: false,
            // Ensuring can't be done here because you never "match" a 500
            // route.
            shouldEnsure: true,
          })
        }
      }

      if (!result) {
        result = await this.findPageComponents({
          pathname: '/_error',
          query,
          params: {},
          isAppPath: false,
          // Ensuring can't be done here because you never "match" an error
          // route.
          shouldEnsure: true,
        })
        statusPage = '/_error'
      }

      if (
        process.env.NODE_ENV !== 'production' &&
        !using404Page &&
        (await this.hasPage('/_error')) &&
        !(await this.hasPage('/404'))
      ) {
        this.customErrorNo404Warn()
      }

      if (!result) {
        // this can occur when a project directory has been moved/deleted
        // which is handled in the parent process in development
        if (this.renderOpts.dev) {
          return {
            type: 'html',
            // wait for dev-server to restart before refreshing
            body: RenderResult.fromStatic(
              `
              <pre>missing required error components, refreshing...</pre>
              <script>
                async function check() {
                  const res = await fetch(location.href).catch(() => ({}))

                  if (res.status === 200) {
                    location.reload()
                  } else {
                    setTimeout(check, 1000)
                  }
                }
                check()
              </script>`
            ),
          }
        }

        throw new WrappedBuildError(
          new Error('missing required error components')
        )
      }

      try {
        return await this.renderToResponseWithComponents(
          {
            ...ctx,
            pathname: statusPage,
            renderOpts: {
              ...ctx.renderOpts,
              err,
            },
          },
          result
        )
      } catch (maybeFallbackError) {
        if (maybeFallbackError instanceof NoFallbackError) {
          throw new Error('invariant: failed to render error page')
        }
        throw maybeFallbackError
      }
    } catch (error) {
      const renderToHtmlError = getProperError(error)
      const isWrappedError = renderToHtmlError instanceof WrappedBuildError
      if (!isWrappedError) {
        this.logError(renderToHtmlError)
      }
      res.statusCode = 500
      const fallbackComponents = await this.getFallbackErrorComponents()

      if (fallbackComponents) {
        return this.renderToResponseWithComponents(
          {
            ...ctx,
            pathname: '/_error',
            renderOpts: {
              ...ctx.renderOpts,
              // We render `renderToHtmlError` here because `err` is
              // already captured in the stacktrace.
              err: isWrappedError
                ? renderToHtmlError.innerError
                : renderToHtmlError,
            },
          },
          {
            query,
            components: fallbackComponents,
          }
        )
      }
      return {
        type: 'html',
        body: RenderResult.fromStatic('Internal Server Error'),
      }
    }
  }

  public async renderErrorToHTML(
    err: Error | null,
    req: BaseNextRequest,
    res: BaseNextResponse,
    pathname: string,
    query: ParsedUrlQuery = {}
  ): Promise<string | null> {
    return this.getStaticHTML((ctx) => this.renderErrorToResponse(ctx, err), {
      req,
      res,
      pathname,
      query,
    })
  }

  protected async getFallbackErrorComponents(): Promise<LoadComponentsReturnType | null> {
    // The development server will provide an implementation for this
    return null
  }

  public async render404(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl?: Pick<NextUrlWithParsedQuery, 'pathname' | 'query'>,
    setHeaders = true
  ): Promise<void> {
    const { pathname, query } = parsedUrl ? parsedUrl : parseUrl(req.url!, true)

    if (this.nextConfig.i18n) {
      query.__nextLocale ||= this.nextConfig.i18n.defaultLocale
      query.__nextDefaultLocale ||= this.nextConfig.i18n.defaultLocale
    }

    res.statusCode = 404
    return this.renderError(null, req, res, pathname!, query, setHeaders)
  }
}
