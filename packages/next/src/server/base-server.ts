import type { __ApiPreviewProps } from './api-utils'
import type { LoadComponentsReturnType } from './load-components'
import type { MiddlewareRouteMatch } from '../shared/lib/router/utils/middleware-route-matcher'
import type { Params } from './request/params'
import type { NextConfig, NextConfigComplete } from './config-shared'
import type {
  NextParsedUrlQuery,
  NextUrlWithParsedQuery,
  RequestMeta,
} from './request-meta'
import type { ParsedUrlQuery } from 'querystring'
import type { RenderOptsPartial as PagesRenderOptsPartial } from './render'
import type {
  RenderOptsPartial as AppRenderOptsPartial,
  ServerOnInstrumentationRequestError,
} from './app-render/types'
import type {
  ServerComponentsHmrCache,
  ResponseCacheBase,
} from './response-cache'
import type { UrlWithParsedQuery } from 'url'
import {
  NormalizeError,
  DecodeError,
  normalizeRepeatedSlashes,
  MissingStaticPage,
} from '../shared/lib/utils'
import type { PagesManifest } from '../build/webpack/plugins/pages-manifest-plugin'
import type { BaseNextRequest, BaseNextResponse } from './base-http'
import type {
  ManifestRewriteRoute,
  ManifestRoute,
  PrerenderManifest,
} from '../build'
import type { ClientReferenceManifest } from '../build/webpack/plugins/flight-manifest-plugin'
import type { NextFontManifest } from '../build/webpack/plugins/next-font-manifest-plugin'
import type { PagesAPIRouteMatch } from './route-matches/pages-api-route-match'
import type {
  Server as HTTPServer,
  IncomingMessage,
  ServerResponse as HTTPServerResponse,
} from 'http'
import type { ProxyMatcher } from '../build/analysis/get-page-static-info'
import type { TLSSocket } from 'tls'
import type { PathnameNormalizer } from './normalizers/request/pathname-normalizer'
import type { InstrumentationModule } from './instrumentation/types'

import * as path from 'path'
import { format as formatUrl, parse as parseUrl } from 'url'
import { formatHostname } from './lib/format-hostname'
import {
  APP_PATHS_MANIFEST,
  NEXT_BUILTIN_DOCUMENT,
  PAGES_MANIFEST,
  STATIC_STATUS_PAGES,
  UNDERSCORE_NOT_FOUND_ROUTE,
  UNDERSCORE_NOT_FOUND_ROUTE_ENTRY,
} from '../shared/lib/constants'
import { isDynamicRoute } from '../shared/lib/router/utils'
import { execOnce } from '../shared/lib/utils'
import { isBlockedPage } from './utils'
import { getBotType, isBot } from '../shared/lib/router/utils/is-bot'
import RenderResult from './render-result'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { denormalizePagePath } from '../shared/lib/page-path/denormalize-page-path'
import * as Log from '../build/output/log'
import { getServerUtils } from './server-utils'
import isError, { getProperError } from '../lib/is-error'
import {
  addRequestMeta,
  getRequestMeta,
  removeRequestMeta,
  setRequestMeta,
} from './request-meta'
import { removePathPrefix } from '../shared/lib/router/utils/remove-path-prefix'
import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'
import { getHostname } from '../shared/lib/get-hostname'
import { parseUrl as parseUrlUtil } from '../shared/lib/router/utils/parse-url'
import { getNextPathnameInfo } from '../shared/lib/router/utils/get-next-pathname-info'
import {
  RSC_HEADER,
  NEXT_RSC_UNION_QUERY,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_URL,
  NEXT_ROUTER_STATE_TREE_HEADER,
} from '../client/components/app-router-headers'
import type {
  MatchOptions,
  RouteMatcherManager,
} from './route-matcher-managers/route-matcher-manager'
import { LocaleRouteNormalizer } from './normalizers/locale-route-normalizer'
import { DefaultRouteMatcherManager } from './route-matcher-managers/default-route-matcher-manager'
import { AppPageRouteMatcherProvider } from './route-matcher-providers/app-page-route-matcher-provider'
import { AppRouteRouteMatcherProvider } from './route-matcher-providers/app-route-route-matcher-provider'
import { PagesAPIRouteMatcherProvider } from './route-matcher-providers/pages-api-route-matcher-provider'
import { PagesRouteMatcherProvider } from './route-matcher-providers/pages-route-matcher-provider'
import { ServerManifestLoader } from './route-matcher-providers/helpers/manifest-loaders/server-manifest-loader'
import {
  getTracer,
  isBubbledError,
  SpanKind,
  SpanStatusCode,
} from './lib/trace/tracer'
import { BaseServerSpan } from './lib/trace/constants'
import { I18NProvider } from './lib/i18n-provider'
import { sendResponse } from './send-response'
import { normalizeNextQueryParam } from './web/utils'
import {
  HTML_CONTENT_TYPE_HEADER,
  JSON_CONTENT_TYPE_HEADER,
  MATCHED_PATH_HEADER,
  NEXT_RESUME_HEADER,
} from '../lib/constants'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import { matchNextDataPathname } from './lib/match-next-data-pathname'
import getRouteFromAssetPath from '../shared/lib/router/utils/get-route-from-asset-path'
import { RSCPathnameNormalizer } from './normalizers/request/rsc'
import { stripFlightHeaders } from './app-render/strip-flight-headers'
import {
  isAppPageRouteModule,
  isAppRouteRouteModule,
} from './route-modules/checks'
import { PrefetchRSCPathnameNormalizer } from './normalizers/request/prefetch-rsc'
import { NextDataPathnameNormalizer } from './normalizers/request/next-data'
import { getIsPossibleServerAction } from './lib/server-action-request-meta'
import { isInterceptionRouteAppPath } from '../shared/lib/router/utils/interception-routes'
import { toRoute } from './lib/to-route'
import type { DeepReadonly } from '../shared/lib/deep-readonly'
import { isNodeNextRequest, isNodeNextResponse } from './base-http/helpers'
import { patchSetHeaderWithCookieSupport } from './lib/patch-set-header'
import { checkIsAppPPREnabled } from './lib/experimental/ppr'
import {
  getBuiltinRequestContext,
  type WaitUntil,
} from './after/builtin-request-context'
import { NextRequestHint } from './web/adapter'
import type { RouteModule } from './route-modules/route-module'
import { type FallbackMode, parseFallbackField } from '../lib/fallback'
import { SegmentPrefixRSCPathnameNormalizer } from './normalizers/request/segment-prefix-rsc'
import { shouldServeStreamingMetadata } from './lib/streaming-metadata'
import { decodeQueryPathParameter } from './lib/decode-query-path-parameter'
import { NoFallbackError } from '../shared/lib/no-fallback-error.external'
import { fixMojibake } from './lib/fix-mojibake'
import { computeCacheBustingSearchParam } from '../shared/lib/router/utils/cache-busting-search-param'
import { setCacheBustingSearchParamWithHash } from '../client/components/router-reducer/set-cache-busting-search-param'
import type { CacheControl } from './lib/cache-control'
import type { PrerenderedRoute } from '../build/static-paths/types'
import { createOpaqueFallbackRouteParams } from './request/fallback-params'
import { RouteKind } from './route-kind'

export type FindComponentsResult = {
  components: LoadComponentsReturnType
  query: NextParsedUrlQuery
}

export interface MiddlewareRoutingItem {
  page: string
  match: MiddlewareRouteMatch
  matchers?: ProxyMatcher[]
}

export type RouteHandler<
  ServerRequest extends BaseNextRequest = BaseNextRequest,
  ServerResponse extends BaseNextResponse = BaseNextResponse,
> = (
  req: ServerRequest,
  res: ServerResponse,
  parsedUrl: NextUrlWithParsedQuery
) => PromiseLike<boolean> | boolean

/**
 * The normalized route manifest is the same as the route manifest, but with
 * the rewrites normalized to the object shape that the router expects.
 */
export type NormalizedRouteManifest = {
  readonly dynamicRoutes: ReadonlyArray<ManifestRoute>
  readonly rewrites: {
    readonly beforeFiles: ReadonlyArray<ManifestRewriteRoute>
    readonly afterFiles: ReadonlyArray<ManifestRewriteRoute>
    readonly fallback: ReadonlyArray<ManifestRewriteRoute>
  }
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
   * Enables the experimental testing mode.
   */
  experimentalTestProxy?: boolean

  /**
   * Whether or not the dev server is running in experimental HTTPS mode
   */
  experimentalHttpsServer?: boolean
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
  httpServer?: HTTPServer
}

export type RenderOpts = PagesRenderOptsPartial & AppRenderOptsPartial

export type LoadedRenderOpts = RenderOpts &
  LoadComponentsReturnType &
  RequestLifecycleOpts

export type RequestLifecycleOpts = {
  waitUntil: ((promise: Promise<any>) => void) | undefined
  onClose: (callback: () => void) => void
  onAfterTaskError: ((error: unknown) => void) | undefined
}

type BaseRenderOpts = RenderOpts & {
  poweredByHeader: boolean
  generateEtags: boolean
  previewProps: __ApiPreviewProps
}

/**
 * The public interface for rendering with the server programmatically. This
 * would typically only allow the base request or response to extend it, but
 * because this can be programmatically accessed, we assume that it could also
 * be the base Node.js request and response types.
 */
export interface BaseRequestHandler<
  ServerRequest extends BaseNextRequest | IncomingMessage = BaseNextRequest,
  ServerResponse extends
    | BaseNextResponse
    | HTTPServerResponse = BaseNextResponse,
> {
  (
    req: ServerRequest,
    res: ServerResponse,
    parsedUrl?: NextUrlWithParsedQuery | undefined
  ): Promise<void> | void
}

export type RequestContext<
  ServerRequest extends BaseNextRequest = BaseNextRequest,
  ServerResponse extends BaseNextResponse = BaseNextResponse,
> = {
  req: ServerRequest
  res: ServerResponse
  pathname: string
  query: NextParsedUrlQuery
  renderOpts: RenderOpts
}

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
  body: RenderResult
  cacheControl?: CacheControl
}

export type NextEnabledDirectories = {
  readonly pages: boolean
  readonly app: boolean
}

export default abstract class Server<
  ServerOptions extends Options = Options,
  ServerRequest extends BaseNextRequest = BaseNextRequest,
  ServerResponse extends BaseNextResponse = BaseNextResponse,
> {
  public readonly hostname?: string
  public readonly fetchHostname?: string
  public readonly port?: number
  protected readonly dir: string
  protected readonly quiet: boolean
  protected readonly nextConfig: NextConfigComplete
  protected readonly distDir: string
  protected readonly publicDir: string
  protected readonly hasStaticDir: boolean
  protected readonly pagesManifest?: PagesManifest
  protected readonly appPathsManifest?: PagesManifest
  protected readonly buildId: string
  protected readonly minimalMode: boolean
  protected readonly renderOpts: BaseRenderOpts
  protected readonly serverOptions: Readonly<ServerOptions>
  protected readonly appPathRoutes?: Record<string, string[]>
  protected readonly clientReferenceManifest?: DeepReadonly<ClientReferenceManifest>
  protected interceptionRoutePatterns: RegExp[]
  protected nextFontManifest?: DeepReadonly<NextFontManifest>
  protected instrumentation: InstrumentationModule | undefined
  private readonly responseCache: ResponseCacheBase

  protected abstract getPublicDir(): string
  protected abstract getHasStaticDir(): boolean
  protected abstract getPagesManifest(): PagesManifest | undefined
  protected abstract getAppPathsManifest(): PagesManifest | undefined
  protected abstract getBuildId(): string
  protected abstract getinterceptionRoutePatterns(): RegExp[]

  protected readonly enabledDirectories: NextEnabledDirectories
  protected abstract getEnabledDirectories(dev: boolean): NextEnabledDirectories

  protected readonly experimentalTestProxy?: boolean

  protected abstract findPageComponents(params: {
    locale: string | undefined
    page: string
    query: NextParsedUrlQuery
    params: Params
    isAppPath: boolean
    // The following parameters are used in the development server's
    // implementation.
    sriEnabled?: boolean
    appPaths?: ReadonlyArray<string> | null
    shouldEnsure?: boolean
    url?: string
  }): Promise<FindComponentsResult | null>
  protected abstract getPrerenderManifest(): DeepReadonly<PrerenderManifest>
  protected abstract getNextFontManifest():
    | DeepReadonly<NextFontManifest>
    | undefined
  protected abstract attachRequestMeta(
    req: ServerRequest,
    parsedUrl: NextUrlWithParsedQuery
  ): void
  protected abstract hasPage(pathname: string): Promise<boolean>

  protected abstract sendRenderResult(
    req: ServerRequest,
    res: ServerResponse,
    options: {
      result: RenderResult
      generateEtags: boolean
      poweredByHeader: boolean
      cacheControl: CacheControl | undefined
    }
  ): Promise<void>

  protected abstract runApi(
    req: ServerRequest,
    res: ServerResponse,
    query: ParsedUrlQuery,
    match: PagesAPIRouteMatch
  ): Promise<boolean>

  protected abstract renderHTML(
    req: ServerRequest,
    res: ServerResponse,
    pathname: string,
    query: NextParsedUrlQuery,
    renderOpts: LoadedRenderOpts
  ): Promise<RenderResult>

  protected abstract getIncrementalCache(options: {
    requestHeaders: Record<string, undefined | string | string[]>
  }): Promise<import('./lib/incremental-cache').IncrementalCache>

  protected abstract getResponseCache(options: {
    dev: boolean
  }): ResponseCacheBase

  protected getServerComponentsHmrCache():
    | ServerComponentsHmrCache
    | undefined {
    return this.nextConfig.experimental.serverComponentsHmrCache
      ? (globalThis as any).__serverComponentsHmrCache
      : undefined
  }

  protected abstract loadEnvConfig(params: {
    dev: boolean
    forceReload: boolean
  }): void

  // TODO-APP: (wyattjoh): Make protected again. Used for turbopack in route-resolver.ts right now.
  public readonly matchers: RouteMatcherManager
  protected readonly i18nProvider?: I18NProvider
  protected readonly localeNormalizer?: LocaleRouteNormalizer

  protected readonly normalizers: {
    readonly rsc: RSCPathnameNormalizer | undefined
    readonly prefetchRSC: PrefetchRSCPathnameNormalizer | undefined
    readonly segmentPrefetchRSC: SegmentPrefixRSCPathnameNormalizer | undefined
    readonly data: NextDataPathnameNormalizer | undefined
  }

  private readonly isAppPPREnabled: boolean
  private readonly isAppSegmentPrefetchEnabled: boolean

  /**
   * This is used to persist cache scopes across
   * prefetch -> full route requests for cache components
   * it's only fully used in dev
   */

  public constructor(options: ServerOptions) {
    const {
      dir = '.',
      quiet = false,
      conf,
      dev = false,
      minimalMode = false,
      hostname,
      port,
      experimentalTestProxy,
    } = options

    this.experimentalTestProxy = experimentalTestProxy
    this.serverOptions = options

    this.dir = path.resolve(/* turbopackIgnore: true */ dir)

    this.quiet = quiet
    this.loadEnvConfig({ dev, forceReload: false })

    // TODO: should conf be normalized to prevent missing
    // values from causing issues as this can be user provided
    this.nextConfig = conf as NextConfigComplete
    this.hostname = hostname
    if (this.hostname) {
      // we format the hostname so that it can be fetched
      this.fetchHostname = formatHostname(this.hostname)
    }
    this.port = port
    this.distDir = path.join(
      /* turbopackIgnore: true */ this.dir,
      this.nextConfig.distDir
    )
    this.publicDir = this.getPublicDir()
    this.hasStaticDir = !minimalMode && this.getHasStaticDir()

    this.i18nProvider = this.nextConfig.i18n?.locales
      ? new I18NProvider(this.nextConfig.i18n)
      : undefined

    // Configure the locale normalizer, it's used for routes inside `pages/`.
    this.localeNormalizer = this.i18nProvider
      ? new LocaleRouteNormalizer(this.i18nProvider)
      : undefined

    const { assetPrefix, generateEtags } = this.nextConfig

    this.buildId = this.getBuildId()
    // this is a hack to avoid Webpack knowing this is equal to this.minimalMode
    // because we replace this.minimalMode to true in production bundles.
    const minimalModeKey = 'minimalMode'
    this[minimalModeKey] =
      minimalMode || !!process.env.NEXT_PRIVATE_MINIMAL_MODE

    this.enabledDirectories = this.getEnabledDirectories(dev)

    this.isAppPPREnabled =
      this.enabledDirectories.app &&
      checkIsAppPPREnabled(this.nextConfig.experimental.ppr)

    this.isAppSegmentPrefetchEnabled =
      this.enabledDirectories.app &&
      this.nextConfig.experimental.clientSegmentCache === true

    this.normalizers = {
      // We should normalize the pathname from the RSC prefix only in minimal
      // mode as otherwise that route is not exposed external to the server as
      // we instead only rely on the headers.
      rsc:
        this.enabledDirectories.app && this.minimalMode
          ? new RSCPathnameNormalizer()
          : undefined,
      prefetchRSC:
        this.isAppPPREnabled && this.minimalMode
          ? new PrefetchRSCPathnameNormalizer()
          : undefined,
      segmentPrefetchRSC:
        this.isAppSegmentPrefetchEnabled && this.minimalMode
          ? new SegmentPrefixRSCPathnameNormalizer()
          : undefined,
      data: this.enabledDirectories.pages
        ? new NextDataPathnameNormalizer(this.buildId)
        : undefined,
    }

    this.nextFontManifest = this.getNextFontManifest()
    process.env.NEXT_DEPLOYMENT_ID = this.nextConfig.deploymentId || ''

    this.renderOpts = {
      dir: this.dir,
      supportsDynamicResponse: true,
      trailingSlash: this.nextConfig.trailingSlash,
      deploymentId: this.nextConfig.deploymentId,
      poweredByHeader: this.nextConfig.poweredByHeader,
      generateEtags,
      previewProps: this.getPrerenderManifest().preview,
      basePath: this.nextConfig.basePath,
      images: this.nextConfig.images,
      optimizeCss: this.nextConfig.experimental.optimizeCss,
      nextConfigOutput: this.nextConfig.output,
      nextScriptWorkers: this.nextConfig.experimental.nextScriptWorkers,
      disableOptimizedLoading:
        this.nextConfig.experimental.disableOptimizedLoading,
      domainLocales: this.nextConfig.i18n?.domains,
      distDir: this.distDir,
      serverComponents: this.enabledDirectories.app,
      cacheLifeProfiles: this.nextConfig.cacheLife,
      enableTainting: this.nextConfig.experimental.taint,
      crossOrigin: this.nextConfig.crossOrigin
        ? this.nextConfig.crossOrigin
        : undefined,
      largePageDataBytes: this.nextConfig.experimental.largePageDataBytes,

      isExperimentalCompile: this.nextConfig.experimental.isExperimentalCompile,
      // `htmlLimitedBots` is passed to server as serialized config in string format
      htmlLimitedBots: this.nextConfig.htmlLimitedBots,
      cacheComponents: this.nextConfig.cacheComponents ?? false,
      experimental: {
        expireTime: this.nextConfig.expireTime,
        staleTimes: this.nextConfig.experimental.staleTimes,
        clientTraceMetadata: this.nextConfig.experimental.clientTraceMetadata,
        clientSegmentCache:
          this.nextConfig.experimental.clientSegmentCache === 'client-only'
            ? 'client-only'
            : Boolean(this.nextConfig.experimental.clientSegmentCache),
        clientParamParsingOrigins:
          this.nextConfig.experimental.clientParamParsingOrigins,
        dynamicOnHover: this.nextConfig.experimental.dynamicOnHover ?? false,
        inlineCss: this.nextConfig.experimental.inlineCss ?? false,
        authInterrupts: !!this.nextConfig.experimental.authInterrupts,
      },
      onInstrumentationRequestError:
        this.instrumentationOnRequestError.bind(this),
      reactMaxHeadersLength: this.nextConfig.reactMaxHeadersLength,
    }

    this.pagesManifest = this.getPagesManifest()
    this.appPathsManifest = this.getAppPathsManifest()
    this.appPathRoutes = this.getAppPathRoutes()
    this.interceptionRoutePatterns = this.getinterceptionRoutePatterns()

    // Configure the routes.
    this.matchers = this.getRouteMatchers()

    // Start route compilation. We don't wait for the routes to finish loading
    // because we use the `waitTillReady` promise below in `handleRequest` to
    // wait. Also we can't `await` in the constructor.
    void this.matchers.reload()

    this.setAssetPrefix(assetPrefix)
    this.responseCache = this.getResponseCache({ dev })
  }

  protected reloadMatchers() {
    return this.matchers.reload()
  }

  private handleRSCRequest: RouteHandler<ServerRequest, ServerResponse> = (
    req,
    _res,
    parsedUrl
  ) => {
    if (!parsedUrl.pathname) return false

    if (this.normalizers.segmentPrefetchRSC?.match(parsedUrl.pathname)) {
      const result = this.normalizers.segmentPrefetchRSC.extract(
        parsedUrl.pathname
      )
      if (!result) return false

      const { originalPathname, segmentPath } = result
      parsedUrl.pathname = originalPathname

      // Mark the request as a router prefetch request.
      req.headers[RSC_HEADER] = '1'
      req.headers[NEXT_ROUTER_PREFETCH_HEADER] = '1'
      req.headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER] = segmentPath

      addRequestMeta(req, 'isRSCRequest', true)
      addRequestMeta(req, 'isPrefetchRSCRequest', true)
      addRequestMeta(req, 'segmentPrefetchRSCRequest', segmentPath)
    } else if (this.normalizers.prefetchRSC?.match(parsedUrl.pathname)) {
      parsedUrl.pathname = this.normalizers.prefetchRSC.normalize(
        parsedUrl.pathname,
        true
      )

      // Mark the request as a router prefetch request.
      req.headers[RSC_HEADER] = '1'
      req.headers[NEXT_ROUTER_PREFETCH_HEADER] = '1'
      addRequestMeta(req, 'isRSCRequest', true)
      addRequestMeta(req, 'isPrefetchRSCRequest', true)
    } else if (this.normalizers.rsc?.match(parsedUrl.pathname)) {
      parsedUrl.pathname = this.normalizers.rsc.normalize(
        parsedUrl.pathname,
        true
      )

      // Mark the request as a RSC request.
      req.headers[RSC_HEADER] = '1'
      addRequestMeta(req, 'isRSCRequest', true)
    } else if (req.headers['x-now-route-matches']) {
      // If we didn't match, return with the flight headers stripped. If in
      // minimal mode we didn't match based on the path, this can't be a RSC
      // request. This is because Vercel only sends this header during
      // revalidation requests and we want the cache to instead depend on the
      // request path for flight information.
      stripFlightHeaders(req.headers)

      return false
    } else if (req.headers[RSC_HEADER] === '1') {
      addRequestMeta(req, 'isRSCRequest', true)

      if (req.headers[NEXT_ROUTER_PREFETCH_HEADER] === '1') {
        addRequestMeta(req, 'isPrefetchRSCRequest', true)

        const segmentPrefetchRSCRequest =
          req.headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]
        if (typeof segmentPrefetchRSCRequest === 'string') {
          addRequestMeta(
            req,
            'segmentPrefetchRSCRequest',
            segmentPrefetchRSCRequest
          )
        }
      }
    } else {
      // Otherwise just return without doing anything.
      return false
    }

    if (req.url) {
      const parsed = parseUrl(req.url)
      parsed.pathname = parsedUrl.pathname
      req.url = formatUrl(parsed)
    }

    return false
  }

  private handleNextDataRequest: RouteHandler<ServerRequest, ServerResponse> =
    async (req, res, parsedUrl) => {
      const middleware = await this.getMiddleware()
      const params = matchNextDataPathname(parsedUrl.pathname)

      // ignore for non-next data URLs
      if (!params || !params.path) {
        return false
      }

      if (params.path[0] !== this.buildId) {
        // Ignore if its a middleware request when we aren't on edge.
        if (getRequestMeta(req, 'middlewareInvoke')) {
          return false
        }

        // Make sure to 404 if the buildId isn't correct
        await this.render404(req, res, parsedUrl)
        return true
      }

      // remove buildId from URL
      params.path.shift()

      const lastParam = params.path[params.path.length - 1]

      // show 404 if it doesn't end with .json
      if (typeof lastParam !== 'string' || !lastParam.endsWith('.json')) {
        await this.render404(req, res, parsedUrl)
        return true
      }

      // re-create page's pathname
      let pathname = `/${params.path.join('/')}`
      pathname = getRouteFromAssetPath(pathname, '.json')

      // ensure trailing slash is normalized per config
      if (middleware) {
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
        const hostname = req?.headers.host?.split(':', 1)[0].toLowerCase()

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
        addRequestMeta(req, 'locale', localePathResult.detectedLocale)
        addRequestMeta(req, 'defaultLocale', defaultLocale)

        // If the locale is not detected from the path, we need to mark that
        // it was not inferred from default.
        if (!localePathResult.detectedLocale) {
          removeRequestMeta(req, 'localeInferredFromDefault')
        }

        // If no locale was detected and we don't have middleware, we need
        // to render a 404 page.
        if (!localePathResult.detectedLocale && !middleware) {
          addRequestMeta(req, 'locale', defaultLocale)
          await this.render404(req, res, parsedUrl)
          return true
        }
      }

      parsedUrl.pathname = pathname
      addRequestMeta(req, 'isNextDataReq', true)

      return false
    }

  protected handleNextImageRequest: RouteHandler<
    ServerRequest,
    ServerResponse
  > = () => false

  protected handleCatchallRenderRequest: RouteHandler<
    ServerRequest,
    ServerResponse
  > = () => false

  protected handleCatchallMiddlewareRequest: RouteHandler<
    ServerRequest,
    ServerResponse
  > = () => false

  protected getRouteMatchers(): RouteMatcherManager {
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
    if (this.enabledDirectories.app) {
      // Match app pages under `app/`.
      matchers.push(
        new AppPageRouteMatcherProvider(this.distDir, manifestLoader)
      )
      matchers.push(
        new AppRouteRouteMatcherProvider(this.distDir, manifestLoader)
      )
    }

    return matchers
  }

  protected async instrumentationOnRequestError(
    ...args: Parameters<ServerOnInstrumentationRequestError>
  ) {
    const [err, req, ctx] = args

    if (this.instrumentation) {
      try {
        await this.instrumentation.onRequestError?.(
          err,
          {
            path: req.url || '',
            method: req.method || 'GET',
            // Normalize middleware headers and other server request headers
            headers:
              req instanceof NextRequestHint
                ? Object.fromEntries(req.headers.entries())
                : req.headers,
          },
          ctx
        )
      } catch (handlerErr) {
        // Log the soft error and continue, since errors can thrown from react stream handler
        console.error('Error in instrumentation.onRequestError:', handlerErr)
      }
    }
  }

  public logError(err: Error): void {
    if (this.quiet) return
    Log.error(err)
  }

  public async handleRequest(
    req: ServerRequest,
    res: ServerResponse,
    parsedUrl?: NextUrlWithParsedQuery
  ): Promise<void> {
    await this.prepare()
    const method = req.method.toUpperCase()
    const tracer = getTracer()

    return tracer.withPropagatedContext(req.headers, () => {
      return tracer.trace(
        BaseServerSpan.handleRequest,
        {
          spanName: `${method}`,
          kind: SpanKind.SERVER,
          attributes: {
            'http.method': method,
            'http.target': req.url,
          },
        },
        async (span) =>
          this.handleRequestImpl(req, res, parsedUrl).finally(() => {
            if (!span) return

            const isRSCRequest = getRequestMeta(req, 'isRSCRequest') ?? false
            span.setAttributes({
              'http.status_code': res.statusCode,
              'next.rsc': isRSCRequest,
            })

            if (res.statusCode && res.statusCode >= 500) {
              // For 5xx status codes: SHOULD be set to 'Error' span status.
              // x-ref: https://opentelemetry.io/docs/specs/semconv/http/http-spans/#status
              span.setStatus({
                code: SpanStatusCode.ERROR,
              })
              // For span status 'Error', SHOULD set 'error.type' attribute.
              span.setAttribute('error.type', res.statusCode.toString())
            }

            const rootSpanAttributes = tracer.getRootSpanAttributes()
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
              const name = isRSCRequest
                ? `RSC ${method} ${route}`
                : `${method} ${route}`

              span.setAttributes({
                'next.route': route,
                'http.route': route,
                'next.span_name': name,
              })
              span.updateName(name)
            } else {
              span.updateName(isRSCRequest ? `RSC ${method}` : `${method}`)
            }
          })
      )
    })
  }

  private async handleRequestImpl(
    req: ServerRequest,
    res: ServerResponse,
    parsedUrl?: NextUrlWithParsedQuery
  ): Promise<void> {
    try {
      // Wait for the matchers to be ready.
      await this.matchers.waitTillReady()

      // ensure cookies set in middleware are merged and
      // not overridden by API routes/getServerSideProps
      patchSetHeaderWithCookieSupport(
        req,
        isNodeNextResponse(res) ? res.originalResponse : res
      )

      const urlParts = (req.url || '').split('?', 1)
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

      // Parse url if parsedUrl not provided
      if (!parsedUrl || typeof parsedUrl !== 'object') {
        if (!req.url) {
          throw new Error('Invariant: url can not be undefined')
        }

        parsedUrl = parseUrl(req.url!, true)
      }

      if (!parsedUrl.pathname) {
        throw new Error("Invariant: pathname can't be empty")
      }

      // Parse the querystring ourselves if the user doesn't handle querystring parsing
      if (typeof parsedUrl.query === 'string') {
        parsedUrl.query = Object.fromEntries(
          new URLSearchParams(parsedUrl.query)
        )
      }

      // Update the `x-forwarded-*` headers.
      const { originalRequest = null } = isNodeNextRequest(req) ? req : {}
      const xForwardedProto = originalRequest?.headers['x-forwarded-proto']
      const isHttps = xForwardedProto
        ? xForwardedProto === 'https'
        : !!(originalRequest?.socket as TLSSocket)?.encrypted

      req.headers['x-forwarded-host'] ??= req.headers['host'] ?? this.hostname
      req.headers['x-forwarded-port'] ??= this.port
        ? this.port.toString()
        : isHttps
          ? '443'
          : '80'
      req.headers['x-forwarded-proto'] ??= isHttps ? 'https' : 'http'
      req.headers['x-forwarded-for'] ??= originalRequest?.socket?.remoteAddress

      // This should be done before any normalization of the pathname happens as
      // it captures the initial URL.
      this.attachRequestMeta(req, parsedUrl)

      let finished = await this.handleRSCRequest(req, res, parsedUrl)
      if (finished) return

      const domainLocale = this.i18nProvider?.detectDomainLocale(
        getHostname(parsedUrl, req.headers)
      )

      const defaultLocale =
        domainLocale?.defaultLocale || this.nextConfig.i18n?.defaultLocale
      addRequestMeta(req, 'defaultLocale', defaultLocale)

      const url = parseUrlUtil(req.url.replace(/^\/+/, '/'))
      const pathnameInfo = getNextPathnameInfo(url.pathname, {
        nextConfig: this.nextConfig,
        i18nProvider: this.i18nProvider,
      })
      url.pathname = pathnameInfo.pathname

      if (pathnameInfo.basePath) {
        req.url = removePathPrefix(req.url!, this.nextConfig.basePath)
      }

      const useMatchedPathHeader =
        this.minimalMode && typeof req.headers[MATCHED_PATH_HEADER] === 'string'

      // TODO: merge handling with invokePath
      if (useMatchedPathHeader) {
        try {
          if (this.enabledDirectories.app) {
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
          let { pathname: matchedPath } = new URL(
            fixMojibake(req.headers[MATCHED_PATH_HEADER] as string),
            'http://localhost'
          )

          let { pathname: urlPathname } = new URL(req.url, 'http://localhost')

          // For ISR the URL is normalized to the prerenderPath so if
          // it's a data request the URL path will be the data URL,
          // basePath is already stripped by this point
          if (this.normalizers.data?.match(urlPathname)) {
            addRequestMeta(req, 'isNextDataReq', true)
          }

          // It's important to execute the following block even it the request
          // matches a pages data route from above.
          if (
            this.isAppPPREnabled &&
            this.minimalMode &&
            req.headers[NEXT_RESUME_HEADER] === '1' &&
            req.method === 'POST'
          ) {
            // Decode the postponed state from the request body, it will come as
            // an array of buffers, so collect them and then concat them to form
            // the string.
            const body: Array<Buffer> = []
            for await (const chunk of req.body) {
              body.push(chunk)
            }
            const postponed = Buffer.concat(body).toString('utf8')

            addRequestMeta(req, 'postponed', postponed)
          }

          // If the request is a next data request and it has a postponed state,
          // we should error, as it represents an unprocessable request.
          if (
            getRequestMeta(req, 'isNextDataReq') &&
            getRequestMeta(req, 'postponed')
          ) {
            // The server understood that this is a PPR resume request, as the
            // headers were included to correctly indicate a resume request, but
            // because the request URL indicates that this should render a next
            // data route (a pages router route), this represents an
            // unprocessable request.
            res.statusCode = 422
            res.send()
            return
          }

          matchedPath = this.normalize(matchedPath)
          const normalizedUrlPath = this.stripNextDataPath(urlPathname)

          matchedPath = denormalizePagePath(matchedPath)

          // Perform locale detection and normalization.
          const localeAnalysisResult = this.i18nProvider?.analyze(matchedPath, {
            defaultLocale,
          })

          // The locale result will be defined even if the locale was not
          // detected for the request because it will be inferred from the
          // default locale.
          if (localeAnalysisResult) {
            addRequestMeta(req, 'locale', localeAnalysisResult.detectedLocale)

            // If the detected locale was inferred from the default locale, we
            // need to modify the metadata on the request to indicate that.
            if (localeAnalysisResult.inferredFromDefault) {
              addRequestMeta(req, 'localeInferredFromDefault', true)
            } else {
              removeRequestMeta(req, 'localeInferredFromDefault')
            }
          }

          let srcPathname = matchedPath
          let pageIsDynamic = isDynamicRoute(srcPathname)
          let paramsResult: {
            params: ParsedUrlQuery | false
            hasValidParams: boolean
          } = {
            params: false,
            hasValidParams: false,
          }

          const match = await this.matchers.match(srcPathname, {
            i18n: localeAnalysisResult,
          })

          if (!pageIsDynamic && match) {
            // Update the source pathname to the matched page's pathname.
            srcPathname = match.definition.pathname

            // The page is dynamic if the params are defined. We know at this
            // stage that the matched path is not a static page if the params
            // were parsed from the matched path header.
            if (typeof match.params !== 'undefined') {
              pageIsDynamic = true
              paramsResult.params = match.params
              paramsResult.hasValidParams = true
            }
          }

          // The rest of this function can't handle i18n properly, so ensure we
          // restore the pathname with the locale information stripped from it
          // now that we're done matching if we're using i18n.
          if (localeAnalysisResult) {
            matchedPath = localeAnalysisResult.pathname
          }

          const utils = getServerUtils({
            pageIsDynamic,
            page: srcPathname,
            i18n: this.nextConfig.i18n,
            basePath: this.nextConfig.basePath,
            rewrites: this.getRoutesManifest()?.rewrites || {
              beforeFiles: [],
              afterFiles: [],
              fallback: [],
            },
            caseSensitive: !!this.nextConfig.experimental.caseSensitiveRoutes,
          })

          // Ensure parsedUrl.pathname includes locale before processing
          // rewrites or they won't match correctly.
          if (defaultLocale && !pathnameInfo.locale) {
            parsedUrl.pathname = `/${defaultLocale}${parsedUrl.pathname}`
          }

          // Store a copy of `parsedUrl.query` before calling handleRewrites.
          // Since `handleRewrites` might add new queries to `parsedUrl.query`.
          const originQueryParams = { ...parsedUrl.query }

          const pathnameBeforeRewrite = parsedUrl.pathname
          const { rewriteParams, rewrittenParsedUrl } = utils.handleRewrites(
            req,
            parsedUrl
          )
          const rewriteParamKeys = Object.keys(rewriteParams)

          // Create a copy of the query params to avoid mutating the original
          // object. This prevents any overlapping query params that have the
          // same normalized key from causing issues.
          const rewrittenQueryParams = { ...rewrittenParsedUrl.query }
          const didRewrite =
            pathnameBeforeRewrite !== rewrittenParsedUrl.pathname

          if (didRewrite && rewrittenParsedUrl.pathname) {
            addRequestMeta(req, 'rewroteURL', rewrittenParsedUrl.pathname)
          }

          const routeParamKeys = new Set<string>()
          for (const [key, value] of Object.entries(parsedUrl.query)) {
            const normalizedKey = normalizeNextQueryParam(key)
            if (!normalizedKey) continue

            // Remove the prefixed key from the query params because we want
            // to consume it for the dynamic route matcher.
            delete parsedUrl.query[key]
            routeParamKeys.add(normalizedKey)

            if (typeof value === 'undefined') continue

            rewrittenQueryParams[normalizedKey] = Array.isArray(value)
              ? value.map((v) => decodeQueryPathParameter(v))
              : decodeQueryPathParameter(value)
          }

          // interpolate dynamic params and normalize URL if needed
          if (pageIsDynamic) {
            let params: ParsedUrlQuery | false = {}

            // If we don't already have valid params, try to parse them from
            // the query params.
            if (!paramsResult.hasValidParams) {
              paramsResult = utils.normalizeDynamicRouteParams(
                rewrittenQueryParams,
                false
              )
            }

            // for prerendered ISR paths we attempt parsing the route
            // params from the URL directly as route-matches may not
            // contain the correct values due to the filesystem path
            // matching before the dynamic route has been matched
            if (
              !paramsResult.hasValidParams &&
              !isDynamicRoute(normalizedUrlPath)
            ) {
              let matcherParams = utils.dynamicRouteMatcher?.(normalizedUrlPath)

              if (matcherParams) {
                utils.normalizeDynamicRouteParams(matcherParams, false)
                Object.assign(paramsResult.params, matcherParams)
                paramsResult.hasValidParams = true
              }
            }

            // if an action request is bypassing a prerender and we
            // don't have the params in the URL since it was prerendered
            // and matched during handle: 'filesystem' rather than dynamic route
            // resolving we need to parse the params from the matched-path.
            // Note: this is similar to above case but from match-path instead
            // of from the request URL since a rewrite could cause that to not
            // match the src pathname
            if (
              // we can have a collision with /index and a top-level /[slug]
              matchedPath !== '/index' &&
              !paramsResult.hasValidParams &&
              !isDynamicRoute(matchedPath)
            ) {
              let matcherParams = utils.dynamicRouteMatcher?.(matchedPath)

              if (matcherParams) {
                const curParamsResult = utils.normalizeDynamicRouteParams(
                  matcherParams,
                  false
                )

                if (curParamsResult.hasValidParams) {
                  Object.assign(params, matcherParams)
                  paramsResult = curParamsResult
                }
              }
            }

            if (paramsResult.hasValidParams) {
              params = paramsResult.params
            }

            const routeMatchesHeader = req.headers['x-now-route-matches']
            if (
              typeof routeMatchesHeader === 'string' &&
              routeMatchesHeader &&
              isDynamicRoute(matchedPath) &&
              !paramsResult.hasValidParams
            ) {
              const routeMatches =
                utils.getParamsFromRouteMatches(routeMatchesHeader)

              if (routeMatches) {
                paramsResult = utils.normalizeDynamicRouteParams(
                  routeMatches,
                  true
                )

                if (paramsResult.hasValidParams) {
                  params = paramsResult.params
                }
              }
            }

            // Try to parse the params from the query if we couldn't parse them
            // from the route matches but ignore missing optional params.
            if (!paramsResult.hasValidParams) {
              paramsResult = utils.normalizeDynamicRouteParams(
                rewrittenQueryParams,
                true
              )

              if (paramsResult.hasValidParams) {
                params = paramsResult.params
              }
            }

            // If the pathname being requested is the same as the source
            // pathname, and we don't have valid params, we want to use the
            // default route matches.
            if (
              utils.defaultRouteMatches &&
              normalizedUrlPath === srcPathname &&
              !paramsResult.hasValidParams
            ) {
              params = utils.defaultRouteMatches

              // If the route matches header is an empty string, we want to
              // render a fallback shell. This is because we know this came from
              // a prerender (it has the header) but it's values were filtered
              // out (because the allowQuery was empty). If it was undefined
              // then we know that the request is hitting the lambda directly.
              if (routeMatchesHeader === '') {
                addRequestMeta(req, 'renderFallbackShell', true)
              }
            }

            if (params) {
              matchedPath = utils.interpolateDynamicPath(srcPathname, params)
              req.url = utils.interpolateDynamicPath(req.url!, params)

              // If the request is for a segment prefetch, we need to update the
              // segment prefetch request path to include the interpolated
              // params.
              let segmentPrefetchRSCRequest = getRequestMeta(
                req,
                'segmentPrefetchRSCRequest'
              )
              if (
                segmentPrefetchRSCRequest &&
                isDynamicRoute(segmentPrefetchRSCRequest, false)
              ) {
                segmentPrefetchRSCRequest = utils.interpolateDynamicPath(
                  segmentPrefetchRSCRequest,
                  params
                )

                req.headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER] =
                  segmentPrefetchRSCRequest
                addRequestMeta(
                  req,
                  'segmentPrefetchRSCRequest',
                  segmentPrefetchRSCRequest
                )
              }
            }
          }

          if (pageIsDynamic || didRewrite) {
            utils.normalizeCdnUrl(req, [
              ...rewriteParamKeys,
              ...Object.keys(utils.defaultRouteRegex?.groups || {}),
            ])
          }

          // Remove the route `params` keys from `parsedUrl.query` if they are
          // not in the original query params.
          // If it's used in both route `params` and query `searchParams`, it should be kept.
          for (const key of routeParamKeys) {
            if (!(key in originQueryParams)) {
              delete parsedUrl.query[key]
            }
          }

          parsedUrl.pathname = matchedPath
          url.pathname = parsedUrl.pathname

          // For Pages Router routes, use the normalized queryParams from
          // handleRewrites to ensure catch-all routes get proper array values.
          // App Router routes should not include rewrite query params as they
          // affect RSC payload.
          if (
            match?.definition.kind === RouteKind.PAGES ||
            match?.definition.kind === RouteKind.PAGES_API
          ) {
            parsedUrl.query = rewrittenQueryParams
          }

          finished = await this.normalizeAndAttachMetadata(req, res, parsedUrl)
          if (finished) return
        } catch (err) {
          if (err instanceof DecodeError || err instanceof NormalizeError) {
            res.statusCode = 400
            return this.renderError(null, req, res, '/_error', {})
          }
          throw err
        }
      }

      addRequestMeta(req, 'isLocaleDomain', Boolean(domainLocale))

      if (pathnameInfo.locale) {
        req.url = formatUrl(url)
        addRequestMeta(req, 'didStripLocale', true)
      }

      // If we aren't in minimal mode or there is no locale in the query
      // string, add the locale to the query string.
      if (!this.minimalMode || !getRequestMeta(req, 'locale')) {
        // If the locale is in the pathname, add it to the query string.
        if (pathnameInfo.locale) {
          addRequestMeta(req, 'locale', pathnameInfo.locale)
        }
        // If the default locale is available, add it to the query string and
        // mark it as inferred rather than implicit.
        else if (defaultLocale) {
          addRequestMeta(req, 'locale', defaultLocale)
          addRequestMeta(req, 'localeInferredFromDefault', true)
        }
      }

      // set incremental cache to request meta so it can
      // be passed down for edge functions and the fetch disk
      // cache can be leveraged locally
      if (
        !(this.serverOptions as any).webServerConfig &&
        !getRequestMeta(req, 'incrementalCache')
      ) {
        const incrementalCache = await this.getIncrementalCache({
          requestHeaders: Object.assign({}, req.headers),
        })

        incrementalCache.resetRequestCache()
        addRequestMeta(req, 'incrementalCache', incrementalCache)
        // This is needed for pages router to leverage unstable_cache
        // TODO: re-work this handling to not use global and use a AsyncStore
        ;(globalThis as any).__incrementalCache = incrementalCache
      }

      // set server components HMR cache to request meta so it can be passed
      // down for edge functions
      if (!getRequestMeta(req, 'serverComponentsHmrCache')) {
        addRequestMeta(
          req,
          'serverComponentsHmrCache',
          this.getServerComponentsHmrCache()
        )
      }

      // when invokePath is specified we can short short circuit resolving
      // we only honor this header if we are inside of a render worker to
      // prevent external users coercing the routing path
      const invokePath = getRequestMeta(req, 'invokePath')
      const useInvokePath = !useMatchedPathHeader && invokePath

      if (useInvokePath) {
        const invokeStatus = getRequestMeta(req, 'invokeStatus')
        if (invokeStatus) {
          const invokeQuery = getRequestMeta(req, 'invokeQuery')

          if (invokeQuery) {
            Object.assign(parsedUrl.query, invokeQuery)
          }

          res.statusCode = invokeStatus
          let err: Error | null = getRequestMeta(req, 'invokeError') || null

          return this.renderError(err, req, res, '/_error', parsedUrl.query)
        }

        const parsedMatchedPath = new URL(invokePath || '/', 'http://n')
        const invokePathnameInfo = getNextPathnameInfo(
          parsedMatchedPath.pathname,
          {
            nextConfig: this.nextConfig,
            parseData: false,
          }
        )

        if (invokePathnameInfo.locale) {
          addRequestMeta(req, 'locale', invokePathnameInfo.locale)
        }

        if (parsedUrl.pathname !== parsedMatchedPath.pathname) {
          parsedUrl.pathname = parsedMatchedPath.pathname
          addRequestMeta(req, 'rewroteURL', invokePathnameInfo.pathname)
        }
        const normalizeResult = normalizeLocalePath(
          removePathPrefix(parsedUrl.pathname, this.nextConfig.basePath || ''),
          this.nextConfig.i18n?.locales
        )

        if (normalizeResult.detectedLocale) {
          addRequestMeta(req, 'locale', normalizeResult.detectedLocale)
        }
        parsedUrl.pathname = normalizeResult.pathname

        for (const key of Object.keys(parsedUrl.query)) {
          delete parsedUrl.query[key]
        }
        const invokeQuery = getRequestMeta(req, 'invokeQuery')

        if (invokeQuery) {
          Object.assign(parsedUrl.query, invokeQuery)
        }

        finished = await this.normalizeAndAttachMetadata(req, res, parsedUrl)
        if (finished) return

        await this.handleCatchallRenderRequest(req, res, parsedUrl)
        return
      }

      if (getRequestMeta(req, 'middlewareInvoke')) {
        finished = await this.normalizeAndAttachMetadata(req, res, parsedUrl)
        if (finished) return

        finished = await this.handleCatchallMiddlewareRequest(
          req,
          res,
          parsedUrl
        )
        if (finished) return

        const err = new Error()
        ;(err as any).result = {
          response: new Response(null, {
            headers: {
              'x-middleware-next': '1',
            },
          }),
        }
        ;(err as any).bubble = true
        throw err
      }

      // This wasn't a request via the matched path or the invoke path, so
      // prepare for a legacy run by removing the base path.

      // ensure we strip the basePath when not using an invoke header
      if (!useMatchedPathHeader && pathnameInfo.basePath) {
        parsedUrl.pathname = removePathPrefix(
          parsedUrl.pathname,
          pathnameInfo.basePath
        )
      }

      res.statusCode = 200
      return await this.run(req, res, parsedUrl)
    } catch (err: any) {
      if (err instanceof NoFallbackError) {
        throw err
      }

      if (
        (err && typeof err === 'object' && err.code === 'ERR_INVALID_URL') ||
        err instanceof DecodeError ||
        err instanceof NormalizeError
      ) {
        res.statusCode = 400
        return this.renderError(null, req, res, '/_error', {})
      }

      if (
        this.minimalMode ||
        this.renderOpts.dev ||
        (isBubbledError(err) && err.bubble)
      ) {
        throw err
      }
      this.logError(getProperError(err))
      res.statusCode = 500
      res.body('Internal Server Error').send()
    }
  }

  /**
   * Normalizes a pathname without attaching any metadata from any matched
   * normalizer.
   *
   * @param pathname the pathname to normalize
   * @returns the normalized pathname
   */
  private normalize = (pathname: string) => {
    const normalizers: Array<PathnameNormalizer> = []

    if (this.normalizers.data) {
      normalizers.push(this.normalizers.data)
    }

    // We have to put the segment prefetch normalizer before the RSC normalizer
    // because the RSC normalizer will match the prefetch RSC routes too.
    if (this.normalizers.segmentPrefetchRSC) {
      normalizers.push(this.normalizers.segmentPrefetchRSC)
    }

    // We have to put the prefetch normalizer before the RSC normalizer
    // because the RSC normalizer will match the prefetch RSC routes too.
    if (this.normalizers.prefetchRSC) {
      normalizers.push(this.normalizers.prefetchRSC)
    }

    if (this.normalizers.rsc) {
      normalizers.push(this.normalizers.rsc)
    }

    for (const normalizer of normalizers) {
      if (!normalizer.match(pathname)) continue

      return normalizer.normalize(pathname, true)
    }

    return pathname
  }

  private normalizeAndAttachMetadata: RouteHandler<
    ServerRequest,
    ServerResponse
  > = async (req, res, url) => {
    let finished = await this.handleNextImageRequest(req, res, url)
    if (finished) return true

    if (this.enabledDirectories.pages) {
      finished = await this.handleNextDataRequest(req, res, url)
      if (finished) return true
    }

    return false
  }

  /**
   * @internal - this method is internal to Next.js and should not be used directly by end-users
   */
  public getRequestHandlerWithMetadata(
    meta: RequestMeta
  ): BaseRequestHandler<ServerRequest, ServerResponse> {
    const handler = this.getRequestHandler()
    return (req, res, parsedUrl) => {
      setRequestMeta(req, meta)
      return handler(req, res, parsedUrl)
    }
  }

  public getRequestHandler(): BaseRequestHandler<
    ServerRequest,
    ServerResponse
  > {
    return this.handleRequest.bind(this)
  }

  protected abstract handleUpgrade(
    req: ServerRequest,
    socket: any,
    head?: any
  ): Promise<void>

  public setAssetPrefix(prefix?: string): void {
    this.nextConfig.assetPrefix = prefix ? prefix.replace(/\/$/, '') : ''
  }

  protected prepared: boolean = false
  protected preparedPromise: Promise<void> | null = null
  /**
   * Runs async initialization of server.
   * It is idempotent, won't fire underlying initialization more than once.
   */
  public async prepare(): Promise<void> {
    if (this.prepared) return

    // Get instrumentation module
    if (!this.instrumentation) {
      this.instrumentation = await this.loadInstrumentationModule()
    }
    if (this.preparedPromise === null) {
      this.preparedPromise = this.prepareImpl().then(() => {
        this.prepared = true
        this.preparedPromise = null
      })
    }
    return this.preparedPromise
  }
  protected async prepareImpl(): Promise<void> {}
  protected async loadInstrumentationModule(): Promise<any> {}

  public async close(): Promise<void> {}

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
    req: ServerRequest,
    res: ServerResponse,
    parsedUrl: UrlWithParsedQuery
  ): Promise<void> {
    return getTracer().trace(BaseServerSpan.run, async () =>
      this.runImpl(req, res, parsedUrl)
    )
  }

  private async runImpl(
    req: ServerRequest,
    res: ServerResponse,
    parsedUrl: UrlWithParsedQuery
  ): Promise<void> {
    await this.handleCatchallRenderRequest(req, res, parsedUrl)
  }

  private async pipe(
    fn: (
      ctx: RequestContext<ServerRequest, ServerResponse>
    ) => Promise<ResponsePayload | null>,
    partialContext: Omit<
      RequestContext<ServerRequest, ServerResponse>,
      'renderOpts'
    >
  ): Promise<void> {
    return getTracer().trace(BaseServerSpan.pipe, async () =>
      this.pipeImpl(fn, partialContext)
    )
  }

  private async pipeImpl(
    fn: (
      ctx: RequestContext<ServerRequest, ServerResponse>
    ) => Promise<ResponsePayload | null>,
    partialContext: Omit<
      RequestContext<ServerRequest, ServerResponse>,
      'renderOpts'
    >
  ): Promise<void> {
    const ua = partialContext.req.headers['user-agent'] || ''

    const ctx: RequestContext<ServerRequest, ServerResponse> = {
      ...partialContext,
      renderOpts: {
        ...this.renderOpts,
        // `renderOpts.botType` is accumulated in `this.renderImpl()`
        supportsDynamicResponse: !this.renderOpts.botType,
        serveStreamingMetadata: shouldServeStreamingMetadata(
          ua,
          this.nextConfig.htmlLimitedBots
        ),
      },
    }

    const payload = await fn(ctx)
    if (payload === null) {
      return
    }
    const { req, res } = ctx
    const originalStatus = res.statusCode
    const { body } = payload
    let { cacheControl } = payload
    if (!res.sent) {
      const { generateEtags, poweredByHeader, dev } = this.renderOpts

      // In dev, we should not cache pages for any reason.
      if (dev) {
        res.setHeader('Cache-Control', 'no-store, must-revalidate')
        cacheControl = undefined
      }

      if (cacheControl && cacheControl.expire === undefined) {
        cacheControl.expire = this.nextConfig.expireTime
      }

      await this.sendRenderResult(req, res, {
        result: body,
        generateEtags,
        poweredByHeader,
        cacheControl,
      })
      res.statusCode = originalStatus
    }
  }

  private async getStaticHTML(
    fn: (
      ctx: RequestContext<ServerRequest, ServerResponse>
    ) => Promise<ResponsePayload | null>,
    partialContext: Omit<
      RequestContext<ServerRequest, ServerResponse>,
      'renderOpts'
    >
  ): Promise<string | null> {
    const ctx: RequestContext<ServerRequest, ServerResponse> = {
      ...partialContext,
      renderOpts: {
        ...this.renderOpts,
        supportsDynamicResponse: false,
      },
    }
    const payload = await fn(ctx)
    if (payload === null) {
      return null
    }
    return payload.body.toUnchunkedString()
  }

  public async render(
    req: ServerRequest,
    res: ServerResponse,
    pathname: string,
    query: NextParsedUrlQuery = {},
    parsedUrl?: NextUrlWithParsedQuery,
    internalRender = false
  ): Promise<void> {
    return getTracer().trace(BaseServerSpan.render, async () =>
      this.renderImpl(req, res, pathname, query, parsedUrl, internalRender)
    )
  }

  protected getWaitUntil(): WaitUntil | undefined {
    const builtinRequestContext = getBuiltinRequestContext()
    if (builtinRequestContext) {
      // the platform provided a request context.
      // use the `waitUntil` from there, whether actually present or not --
      // if not present, `after` will error.

      // NOTE: if we're in an edge runtime sandbox, this context will be used to forward the outer waitUntil.
      return builtinRequestContext.waitUntil
    }

    if (this.minimalMode) {
      // we're built for a serverless environment, and `waitUntil` is not available,
      // but using a noop would likely lead to incorrect behavior,
      // because we have no way of keeping the invocation alive.
      // return nothing, and `after` will error if used.
      //
      // NOTE: for edge functions, `NextWebServer` always runs in minimal mode.
      //
      // NOTE: if we're in an edge runtime sandbox, waitUntil will be passed in using "@next/request-context",
      // so we won't get here.
      return undefined
    }

    return this.getInternalWaitUntil()
  }

  protected getInternalWaitUntil(): WaitUntil | undefined {
    return undefined
  }

  private async renderImpl(
    req: ServerRequest,
    res: ServerResponse,
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
      this.serverOptions.customServer &&
      pathname === '/index' &&
      !(await this.hasPage('/index'))
    ) {
      // maintain backwards compatibility for custom server
      // (see custom-server integration tests)
      pathname = '/'
    }

    const ua = req.headers['user-agent'] || ''
    this.renderOpts.botType = getBotType(ua)

    // we allow custom servers to call render for all URLs
    // so check if we need to serve a static _next file or not.
    // we don't modify the URL for _next/data request but still
    // call render so we special case this to prevent an infinite loop
    if (
      !internalRender &&
      !this.minimalMode &&
      !getRequestMeta(req, 'isNextDataReq') &&
      (req.url?.match(/^\/_next\//) ||
        (this.hasStaticDir && req.url!.match(/^\/static\//)))
    ) {
      return this.handleRequest(req, res, parsedUrl)
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
    urlPathname: string
    requestHeaders: import('./lib/incremental-cache').IncrementalCache['requestHeaders']
    page: string
    isAppPath: boolean
  }): Promise<{
    staticPaths?: string[]
    prerenderedRoutes?: PrerenderedRoute[]
    fallbackMode?: FallbackMode
  }> {
    // Read whether or not fallback should exist from the manifest.
    const fallbackField =
      this.getPrerenderManifest().dynamicRoutes[pathname]?.fallback

    return {
      // `staticPaths` is intentionally set to `undefined` as it should've
      // been caught when checking disk data.
      staticPaths: undefined,
      fallbackMode: parseFallbackField(fallbackField),
    }
  }

  private async renderToResponseWithComponents(
    requestContext: RequestContext<ServerRequest, ServerResponse>,
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

  protected pathCouldBeIntercepted(resolvedPathname: string): boolean {
    return (
      isInterceptionRouteAppPath(resolvedPathname) ||
      this.interceptionRoutePatterns.some((regexp) => {
        return regexp.test(resolvedPathname)
      })
    )
  }

  protected setVaryHeader(
    req: ServerRequest,
    res: ServerResponse,
    isAppPath: boolean,
    resolvedPathname: string
  ): void {
    const baseVaryHeader = `${RSC_HEADER}, ${NEXT_ROUTER_STATE_TREE_HEADER}, ${NEXT_ROUTER_PREFETCH_HEADER}, ${NEXT_ROUTER_SEGMENT_PREFETCH_HEADER}`
    const isRSCRequest = getRequestMeta(req, 'isRSCRequest') ?? false

    let addedNextUrlToVary = false

    if (isAppPath && this.pathCouldBeIntercepted(resolvedPathname)) {
      // Interception route responses can vary based on the `Next-URL` header.
      // We use the Vary header to signal this behavior to the client to properly cache the response.
      res.appendHeader('vary', `${baseVaryHeader}, ${NEXT_URL}`)
      addedNextUrlToVary = true
    } else if (isAppPath || isRSCRequest) {
      // We don't need to include `Next-URL` in the Vary header for non-interception routes since it won't affect the response.
      // We also set this header for pages to avoid caching issues when navigating between pages and app.
      res.appendHeader('vary', baseVaryHeader)
    }

    if (!addedNextUrlToVary) {
      // Remove `Next-URL` from the request headers we determined it wasn't necessary to include in the Vary header.
      // This is to avoid any dependency on the `Next-URL` header being present when preparing the response.
      delete req.headers[NEXT_URL]
    }
  }

  private async renderToResponseWithComponentsImpl(
    {
      req,
      res,
      pathname,
      renderOpts: opts,
    }: RequestContext<ServerRequest, ServerResponse>,
    { components, query }: FindComponentsResult
  ): Promise<ResponsePayload | null> {
    if (pathname === UNDERSCORE_NOT_FOUND_ROUTE) {
      pathname = '/404'
    }
    const isErrorPathname = pathname === '/_error'
    const is404Page =
      pathname === '/404' || (isErrorPathname && res.statusCode === 404)
    const is500Page =
      pathname === '/500' || (isErrorPathname && res.statusCode === 500)
    const isAppPath = components.isAppPath === true

    const hasServerProps = !!components.getServerSideProps
    const isPossibleServerAction = getIsPossibleServerAction(req)
    let isSSG = !!components.getStaticProps
    // NOTE: Don't delete headers[RSC] yet, it still needs to be used in renderToHTML later
    const isRSCRequest = getRequestMeta(req, 'isRSCRequest') ?? false

    // Not all CDNs respect the Vary header when caching. We must assume that
    // only the URL is used to vary the responses. The Next client computes a
    // hash of the header values and sends it as a search param. Before
    // responding to a request, we must verify that the hash matches the
    // expected value. Neglecting to do this properly can lead to cache
    // poisoning attacks on certain CDNs.
    if (
      !this.minimalMode &&
      this.nextConfig.experimental.validateRSCRequestHeaders &&
      isRSCRequest &&
      // In the event that we're serving a NoFallbackError, the headers will
      // already be stripped so this comparison will always fail, resulting in
      // a redirect loop.
      !is404Page
    ) {
      const headers = req.headers

      const prefetchHeaderValue = headers[NEXT_ROUTER_PREFETCH_HEADER]
      const routerPrefetch =
        prefetchHeaderValue !== undefined
          ? // We only recognize '1' and '2'. Strip all other values here.
            prefetchHeaderValue === '1' || prefetchHeaderValue === '2'
            ? prefetchHeaderValue
            : undefined
          : // For runtime prefetches, we always perform a dynamic request,
            // so we don't expect the header to be stripped by an intermediate layer.
            // This should only happen for static prefetches, so we only handle those here.
            getRequestMeta(req, 'isPrefetchRSCRequest')
            ? '1'
            : undefined

      const segmentPrefetchRSCRequest =
        headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER] ||
        getRequestMeta(req, 'segmentPrefetchRSCRequest')

      const expectedHash = computeCacheBustingSearchParam(
        routerPrefetch,
        segmentPrefetchRSCRequest,
        headers[NEXT_ROUTER_STATE_TREE_HEADER],
        headers[NEXT_URL]
      )
      const actualHash =
        getRequestMeta(req, 'cacheBustingSearchParam') ??
        new URL(req.url || '', 'http://localhost').searchParams.get(
          NEXT_RSC_UNION_QUERY
        )

      if (expectedHash !== actualHash) {
        // The hash sent by the client does not match the expected value.
        // Redirect to the URL with the correct cache-busting search param.
        // This prevents cache poisoning attacks on CDNs that don't respect Vary headers.
        // Note: When no headers are present, expectedHash is empty string and client
        // must send `_rsc` param, otherwise actualHash is null and hash check fails.
        const url = new URL(req.url || '', 'http://localhost')
        setCacheBustingSearchParamWithHash(url, expectedHash)
        res.statusCode = 307
        res.setHeader('location', `${url.pathname}${url.search}`)
        res.body('').send()
        return null
      }
    }

    // Compute the iSSG cache key. We use the rewroteUrl since
    // pages with fallback: false are allowed to be rewritten to
    // and we need to look up the path by the rewritten path
    let urlPathname = parseUrl(req.url || '').pathname || '/'

    let resolvedUrlPathname = getRequestMeta(req, 'rewroteURL') || urlPathname

    this.setVaryHeader(req, res, isAppPath, resolvedUrlPathname)

    let staticPaths: string[] | undefined
    let hasFallback = false

    const prerenderManifest = this.getPrerenderManifest()

    if (
      hasFallback ||
      staticPaths?.includes(resolvedUrlPathname) ||
      // this signals revalidation in deploy environments
      // TODO: make this more generic
      req.headers['x-now-route-matches']
    ) {
      isSSG = true
    } else if (!this.renderOpts.dev) {
      isSSG ||= !!prerenderManifest.routes[toRoute(pathname)]
    }

    // Toggle whether or not this is a Data request
    const isNextDataRequest =
      !!(
        getRequestMeta(req, 'isNextDataReq') ||
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
      res.setHeader(MATCHED_PATH_HEADER, pathname)
      res.setHeader('x-middleware-skip', '1')
      res.setHeader(
        'cache-control',
        'private, no-cache, no-store, max-age=0, must-revalidate'
      )
      res.body('{}').send()
      return null
    }

    // normalize req.url for SSG paths as it is not exposed
    // to getStaticProps and the asPath should not expose /_next/data
    if (
      isSSG &&
      this.minimalMode &&
      req.headers[MATCHED_PATH_HEADER] &&
      req.url.startsWith('/_next/data')
    ) {
      req.url = this.stripNextDataPath(req.url)
    }

    const locale = getRequestMeta(req, 'locale')

    if (
      !!req.headers['x-nextjs-data'] &&
      (!res.statusCode || res.statusCode === 200)
    ) {
      res.setHeader(
        'x-nextjs-matched-path',
        `${locale ? `/${locale}` : ''}${pathname}`
      )
    }

    let routeModule: RouteModule | undefined
    if (components.routeModule) {
      routeModule = components.routeModule
    }

    /**
     * If the route being rendered is an app page, and the ppr feature has been
     * enabled, then the given route _could_ support PPR.
     */
    const couldSupportPPR: boolean =
      this.isAppPPREnabled &&
      typeof routeModule !== 'undefined' &&
      isAppPageRouteModule(routeModule)

    // When enabled, this will allow the use of the `?__nextppronly` query to
    // enable debugging of the static shell.
    const hasDebugStaticShellQuery =
      process.env.__NEXT_EXPERIMENTAL_STATIC_SHELL_DEBUGGING === '1' &&
      typeof query.__nextppronly !== 'undefined' &&
      couldSupportPPR

    // This page supports PPR if it is marked as being `PARTIALLY_STATIC` in the
    // prerender manifest and this is an app page.
    const isRoutePPREnabled: boolean =
      couldSupportPPR &&
      ((
        prerenderManifest.routes[pathname] ??
        prerenderManifest.dynamicRoutes[pathname]
      )?.renderingMode === 'PARTIALLY_STATIC' ||
        // Ideally we'd want to check the appConfig to see if this page has PPR
        // enabled or not, but that would require plumbing the appConfig through
        // to the server during development. We assume that the page supports it
        // but only during development.
        (hasDebugStaticShellQuery &&
          (this.renderOpts.dev === true ||
            this.experimentalTestProxy === true)))

    // If we're in minimal mode, then try to get the postponed information from
    // the request metadata. If available, use it for resuming the postponed
    // render.
    const minimalPostponed = isRoutePPREnabled
      ? getRequestMeta(req, 'postponed')
      : undefined

    // we need to ensure the status code if /404 is visited directly
    if (is404Page && !isNextDataRequest && !isRSCRequest) {
      res.statusCode = 404
    }

    // ensure correct status is set when visiting a status page
    // directly e.g. /500
    if (STATIC_STATUS_PAGES.includes(pathname)) {
      res.statusCode = parseInt(pathname.slice(1), 10)
    }

    if (
      // Server actions can use non-GET/HEAD methods.
      !isPossibleServerAction &&
      // Resume can use non-GET/HEAD methods.
      !minimalPostponed &&
      !is404Page &&
      !is500Page &&
      pathname !== '/_error' &&
      req.method !== 'HEAD' &&
      req.method !== 'GET' &&
      (typeof components.Component === 'string' || isSSG)
    ) {
      res.statusCode = 405
      res.setHeader('Allow', ['GET', 'HEAD'])
      res.body('Method Not Allowed').send()
      return null
    }

    // handle static page
    if (typeof components.Component === 'string') {
      return {
        body: RenderResult.fromStatic(
          components.Component,
          HTML_CONTENT_TYPE_HEADER
        ),
      }
    }

    if (opts.supportsDynamicResponse === true) {
      const ua = req.headers['user-agent'] || ''
      const isBotRequest = isBot(ua)
      const isSupportedDocument =
        typeof components.Document?.getInitialProps !== 'function' ||
        // The built-in `Document` component also supports dynamic HTML for concurrent mode.
        NEXT_BUILTIN_DOCUMENT in components.Document

      // Disable dynamic HTML in cases that we know it won't be generated,
      // so that we can continue generating a cache key when possible.
      // TODO-APP: should the first render for a dynamic app path
      // be static so we can collect revalidate and populate the
      // cache if there are no dynamic data requirements
      opts.supportsDynamicResponse =
        !isSSG && !isBotRequest && isSupportedDocument
    }

    // In development, we always want to generate dynamic HTML.
    if (!isNextDataRequest && isAppPath && opts.dev) {
      opts.supportsDynamicResponse = true
    }

    if (isSSG && this.minimalMode && req.headers[MATCHED_PATH_HEADER]) {
      // the url value is already correct when the matched-path header is set
      resolvedUrlPathname = urlPathname
    }

    urlPathname = removeTrailingSlash(urlPathname)
    resolvedUrlPathname = removeTrailingSlash(resolvedUrlPathname)
    if (this.localeNormalizer) {
      resolvedUrlPathname = this.localeNormalizer.normalize(resolvedUrlPathname)
    }

    // remove /_next/data prefix from urlPathname so it matches
    // for direct page visit and /_next/data visit
    if (isNextDataRequest) {
      resolvedUrlPathname = this.stripNextDataPath(resolvedUrlPathname)
      urlPathname = this.stripNextDataPath(urlPathname)
    }

    // use existing incrementalCache instance if available
    const incrementalCache: import('./lib/incremental-cache').IncrementalCache =
      await this.getIncrementalCache({
        requestHeaders: Object.assign({}, req.headers),
      })

    // TODO: investigate, this is not safe across multiple concurrent requests
    incrementalCache.resetRequestCache()

    if (
      routeModule?.isDev &&
      isDynamicRoute(pathname) &&
      (components.getStaticPaths || isAppPath)
    ) {
      const pathsResults = await this.getStaticPaths({
        pathname,
        urlPathname,
        requestHeaders: req.headers,
        page: components.page,
        isAppPath,
      })
      if (isAppPath && this.nextConfig.cacheComponents) {
        if (pathsResults.prerenderedRoutes?.length) {
          let smallestFallbackRouteParams = null
          for (const route of pathsResults.prerenderedRoutes) {
            const fallbackRouteParams = route.fallbackRouteParams
            if (!fallbackRouteParams || fallbackRouteParams.length === 0) {
              // There are no fallback route params so we don't need to continue
              smallestFallbackRouteParams = null
              break
            }
            if (
              smallestFallbackRouteParams === null ||
              fallbackRouteParams.length < smallestFallbackRouteParams.length
            ) {
              smallestFallbackRouteParams = fallbackRouteParams
            }
          }
          if (smallestFallbackRouteParams) {
            addRequestMeta(
              req,
              'devValidatingFallbackParams',
              createOpaqueFallbackRouteParams(smallestFallbackRouteParams)!
            )
          }
        }
      }
    }

    // An OPTIONS request to a page handler is invalid.
    if (
      req.method === 'OPTIONS' &&
      !is404Page &&
      (!routeModule || !isAppRouteRouteModule(routeModule))
    ) {
      await sendResponse(req, res, new Response(null, { status: 400 }))
      return null
    }

    const request = isNodeNextRequest(req) ? req.originalRequest : req
    const response = isNodeNextResponse(res) ? res.originalResponse : res

    const parsedInitUrl = parseUrl(getRequestMeta(req, 'initURL') || req.url)
    let initPathname = parsedInitUrl.pathname || '/'

    for (const normalizer of [
      this.normalizers.segmentPrefetchRSC,
      this.normalizers.prefetchRSC,
      this.normalizers.rsc,
    ]) {
      if (normalizer?.match(initPathname)) {
        initPathname = normalizer.normalize(initPathname)
      }
    }

    // On minimal mode, the request url of dynamic route can be a
    // literal dynamic route ('/[slug]') instead of actual URL, so overwriting to initPathname
    // will transform back the resolved url to the dynamic route pathname.
    if (!(this.minimalMode && isErrorPathname)) {
      request.url = `${initPathname}${parsedInitUrl.search || ''}`
    }

    // propagate the request context for dev
    setRequestMeta(request, getRequestMeta(req))
    addRequestMeta(request, 'distDir', this.distDir)
    addRequestMeta(request, 'query', query)
    addRequestMeta(request, 'params', opts.params)
    addRequestMeta(request, 'minimalMode', this.minimalMode)

    if (opts.err) {
      addRequestMeta(request, 'invokeError', opts.err)
    }

    const handler: (
      req: ServerRequest | IncomingMessage,
      res: ServerResponse | HTTPServerResponse,
      ctx: {
        waitUntil: ReturnType<Server['getWaitUntil']>
      }
    ) => Promise<void> = components.ComponentMod.handler

    const maybeDevRequest =
      // we need to capture fetch metrics when they are set
      // and can't wait for handler to resolve as the fetch
      // metrics are logged on response close which happens
      // before handler resolves
      process.env.NODE_ENV === 'development'
        ? new Proxy(request, {
            get(target: any, prop) {
              if (typeof target[prop] === 'function') {
                return target[prop].bind(target)
              }
              return target[prop]
            },
            set(target: any, prop, value) {
              if (prop === 'fetchMetrics') {
                ;(req as any).fetchMetrics = value
              }
              target[prop] = value
              return true
            },
          })
        : request

    await handler(maybeDevRequest, response, {
      waitUntil: this.getWaitUntil(),
    })

    // response is handled fully in handler
    return null
  }

  private stripNextDataPath(filePath: string, stripLocale = true) {
    if (filePath.includes(this.buildId)) {
      const splitPath = filePath.substring(
        filePath.indexOf(this.buildId) + this.buildId.length
      )

      filePath = denormalizePagePath(splitPath.replace(/\.json$/, ''))
    }

    if (this.localeNormalizer && stripLocale) {
      return this.localeNormalizer.normalize(filePath)
    }
    return filePath
  }

  // map the route to the actual bundle name
  protected getOriginalAppPaths(route: string) {
    if (this.enabledDirectories.app) {
      const originalAppPath = this.appPathRoutes?.[route]

      if (!originalAppPath) {
        return null
      }

      return originalAppPath
    }
    return null
  }

  protected async renderPageComponent(
    ctx: RequestContext<ServerRequest, ServerResponse>,
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
      locale: getRequestMeta(ctx.req, 'locale'),
      page,
      query,
      params: ctx.renderOpts.params || {},
      isAppPath,
      sriEnabled: !!this.nextConfig.experimental.sri?.algorithm,
      appPaths,
      // Ensuring for loading page component routes is done via the matcher.
      shouldEnsure: false,
    })
    if (result) {
      getTracer().setRootSpanAttribute('next.route', pathname)
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
    ctx: RequestContext<ServerRequest, ServerResponse>
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

  protected abstract getMiddleware(): Promise<MiddlewareRoutingItem | undefined>
  protected abstract getFallbackErrorComponents(
    url?: string
  ): Promise<LoadComponentsReturnType | null>
  protected abstract getRoutesManifest(): NormalizedRouteManifest | undefined

  private async renderToResponseImpl(
    ctx: RequestContext<ServerRequest, ServerResponse>
  ): Promise<ResponsePayload | null> {
    const { req, res, query, pathname } = ctx
    let page = pathname
    const bubbleNoFallback =
      getRequestMeta(ctx.req, 'bubbleNoFallback') ?? false

    if (
      !this.minimalMode &&
      this.nextConfig.experimental.validateRSCRequestHeaders
    ) {
      addRequestMeta(
        ctx.req,
        'cacheBustingSearchParam',
        query[NEXT_RSC_UNION_QUERY]
      )
    }
    delete query[NEXT_RSC_UNION_QUERY]

    const options: MatchOptions = {
      i18n: this.i18nProvider?.fromRequest(req, pathname),
    }

    const existingMatch = getRequestMeta(ctx.req, 'match')

    let fastPath = true
    // when a specific invoke-output is meant to be matched
    // ensure a prior dynamic route/page doesn't take priority
    const invokeOutput = getRequestMeta(ctx.req, 'invokeOutput')

    if (
      (!this.minimalMode &&
        typeof invokeOutput === 'string' &&
        isDynamicRoute(invokeOutput || '') &&
        invokeOutput !== existingMatch?.definition.pathname) ||
      // Parallel routes are matched in `existingMatch` but since currently
      // there can be multiple matches it's not guaranteed to be the right match
      // therefor we need to opt-out of the fast path for parallel routes.
      existingMatch?.definition.page.includes('/@')
    ) {
      fastPath = false
    }

    try {
      for await (const match of fastPath && existingMatch
        ? [existingMatch]
        : this.matchers.matchAll(pathname, options)) {
        if (
          !this.minimalMode &&
          typeof invokeOutput === 'string' &&
          isDynamicRoute(invokeOutput || '') &&
          invokeOutput !== match.definition.pathname
        ) {
          continue
        }

        const result = await this.renderPageComponent(
          {
            ...ctx,
            pathname: match.definition.pathname,
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
              matchedPath: ctx.req.headers[MATCHED_PATH_HEADER],
              initUrl: getRequestMeta(ctx.req, 'initURL'),
              didRewrite: !!getRequestMeta(ctx.req, 'rewroteURL'),
              rewroteUrl: getRequestMeta(ctx.req, 'rewroteURL'),
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
        addRequestMeta(ctx.req, 'customErrorRender', true)
        await this.renderErrorToResponse(ctx, err)
        removeRequestMeta(ctx.req, 'customErrorRender')
      }

      const isWrappedError = err instanceof WrappedBuildError

      if (!isWrappedError) {
        if (this.minimalMode || this.renderOpts.dev) {
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

    const middleware = await this.getMiddleware()
    if (
      middleware &&
      !!ctx.req.headers['x-nextjs-data'] &&
      (!res.statusCode || res.statusCode === 200 || res.statusCode === 404)
    ) {
      const locale = getRequestMeta(req, 'locale')

      res.setHeader(
        'x-nextjs-matched-path',
        `${locale ? `/${locale}` : ''}${pathname}`
      )
      res.statusCode = 200
      res.setHeader('Content-Type', JSON_CONTENT_TYPE_HEADER)
      res.body('{}')
      res.send()
      return null
    }

    res.statusCode = 404
    return this.renderErrorToResponse(ctx, null)
  }

  public async renderToHTML(
    req: ServerRequest,
    res: ServerResponse,
    pathname: string,
    query: ParsedUrlQuery = {}
  ): Promise<string | null> {
    return getTracer().trace(BaseServerSpan.renderToHTML, async () => {
      return this.renderToHTMLImpl(req, res, pathname, query)
    })
  }

  private async renderToHTMLImpl(
    req: ServerRequest,
    res: ServerResponse,
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
    req: ServerRequest,
    res: ServerResponse,
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
    req: ServerRequest,
    res: ServerResponse,
    pathname: string,
    query: NextParsedUrlQuery = {},
    setHeaders = true
  ): Promise<void> {
    if (setHeaders) {
      res.setHeader(
        'Cache-Control',
        'private, no-cache, no-store, max-age=0, must-revalidate'
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
    ctx: RequestContext<ServerRequest, ServerResponse>,
    err: Error | null
  ): Promise<ResponsePayload | null> {
    return getTracer().trace(BaseServerSpan.renderErrorToResponse, async () => {
      return this.renderErrorToResponseImpl(ctx, err)
    })
  }

  protected async renderErrorToResponseImpl(
    ctx: RequestContext<ServerRequest, ServerResponse>,
    err: Error | null
  ): Promise<ResponsePayload | null> {
    // Short-circuit favicon.ico in development to avoid compiling 404 page when the app has no favicon.ico.
    // Since favicon.ico is automatically requested by the browser.
    if (this.renderOpts.dev && ctx.pathname === '/favicon.ico') {
      return {
        body: RenderResult.EMPTY,
      }
    }
    const { res, query } = ctx

    try {
      let result: null | FindComponentsResult = null

      const is404 = res.statusCode === 404
      let using404Page = false
      const hasAppDir = this.enabledDirectories.app

      if (is404) {
        if (hasAppDir) {
          // Use the not-found entry in app directory
          result = await this.findPageComponents({
            locale: getRequestMeta(ctx.req, 'locale'),
            page: UNDERSCORE_NOT_FOUND_ROUTE_ENTRY,
            query,
            params: {},
            isAppPath: true,
            shouldEnsure: true,
            url: ctx.req.url,
          })
          using404Page = result !== null
        }

        if (!result && (await this.hasPage('/404'))) {
          result = await this.findPageComponents({
            locale: getRequestMeta(ctx.req, 'locale'),
            page: '/404',
            query,
            params: {},
            isAppPath: false,
            // Ensuring can't be done here because you never "match" a 404 route.
            shouldEnsure: true,
            url: ctx.req.url,
          })
          using404Page = result !== null
        }
      }
      let statusPage = `/${res.statusCode}`

      if (
        !getRequestMeta(ctx.req, 'customErrorRender') &&
        !result &&
        STATIC_STATUS_PAGES.includes(statusPage)
      ) {
        // skip ensuring /500 in dev mode as it isn't used and the
        // dev overlay is used instead
        if (statusPage !== '/500' || !this.renderOpts.dev) {
          if (!result && hasAppDir) {
            // Otherwise if app router present, load app router built-in 500 page
            result = await this.findPageComponents({
              locale: getRequestMeta(ctx.req, 'locale'),
              page: statusPage,
              query,
              params: {},
              isAppPath: true,
              // Ensuring can't be done here because you never "match" a 500
              // route.
              shouldEnsure: true,
              url: ctx.req.url,
            })
          }
          // If the above App Router result is empty, fallback to pages router 500 page
          result = await this.findPageComponents({
            locale: getRequestMeta(ctx.req, 'locale'),
            page: statusPage,
            query,
            params: {},
            isAppPath: false,
            // Ensuring can't be done here because you never "match" a 500
            // route.
            shouldEnsure: true,
            url: ctx.req.url,
          })
        }
      }

      if (!result) {
        result = await this.findPageComponents({
          locale: getRequestMeta(ctx.req, 'locale'),
          page: '/_error',
          query,
          params: {},
          isAppPath: false,
          // Ensuring can't be done here because you never "match" an error
          // route.
          shouldEnsure: true,
          url: ctx.req.url,
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
              </script>`,
              HTML_CONTENT_TYPE_HEADER
            ),
          }
        }

        throw new WrappedBuildError(
          new Error('missing required error components')
        )
      }

      // If the page has a route module, use it for the new match. If it doesn't
      // have a route module, remove the match.
      if (result.components.routeModule) {
        addRequestMeta(ctx.req, 'match', {
          definition: result.components.routeModule.definition,
          params: undefined,
        })
      } else {
        removeRequestMeta(ctx.req, 'match')
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
      const fallbackComponents = await this.getFallbackErrorComponents(
        ctx.req.url
      )

      if (fallbackComponents) {
        // There was an error, so use it's definition from the route module
        // to add the match to the request.
        addRequestMeta(ctx.req, 'match', {
          definition: fallbackComponents.routeModule!.definition,
          params: undefined,
        })

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
        body: RenderResult.fromStatic('Internal Server Error', 'text/plain'),
      }
    }
  }

  public async renderErrorToHTML(
    err: Error | null,
    req: ServerRequest,
    res: ServerResponse,
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

  public async render404(
    req: ServerRequest,
    res: ServerResponse,
    parsedUrl?: Pick<NextUrlWithParsedQuery, 'pathname' | 'query'>,
    setHeaders = true
  ): Promise<void> {
    const { pathname, query } = parsedUrl ? parsedUrl : parseUrl(req.url!, true)

    // Ensure the locales are provided on the request meta.
    if (this.nextConfig.i18n) {
      if (!getRequestMeta(req, 'locale')) {
        addRequestMeta(req, 'locale', this.nextConfig.i18n.defaultLocale)
      }
      addRequestMeta(req, 'defaultLocale', this.nextConfig.i18n.defaultLocale)
    }

    res.statusCode = 404
    return this.renderError(null, req, res, pathname!, query, setHeaders)
  }
}
