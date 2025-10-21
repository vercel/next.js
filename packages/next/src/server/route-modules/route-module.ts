import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  InstrumentationOnRequestError,
  RequestErrorContext,
} from '../instrumentation/types'
import type { ParsedUrlQuery } from 'node:querystring'
import type { UrlWithParsedQuery } from 'node:url'
import type {
  PrerenderManifest,
  RequiredServerFilesManifest,
} from '../../build'
import type { DevRoutesManifest } from '../lib/router-utils/setup-dev-bundler'
import type { RouteDefinition } from '../route-definitions/route-definition'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'
import {
  BUILD_ID_FILE,
  BUILD_MANIFEST,
  CLIENT_REFERENCE_MANIFEST,
  DYNAMIC_CSS_MANIFEST,
  NEXT_FONT_MANIFEST,
  PRERENDER_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  ROUTES_MANIFEST,
  SERVER_FILES_MANIFEST,
  SERVER_REFERENCE_MANIFEST,
  SUBRESOURCE_INTEGRITY_MANIFEST,
} from '../../shared/lib/constants'
import { parseReqUrl } from '../../lib/url'
import {
  normalizeLocalePath,
  type PathLocale,
} from '../../shared/lib/i18n/normalize-locale-path'
import { isDynamicRoute } from '../../shared/lib/router/utils'
import { removePathPrefix } from '../../shared/lib/router/utils/remove-path-prefix'
import { getServerUtils } from '../server-utils'
import { detectDomainLocale } from '../../shared/lib/i18n/detect-domain-locale'
import { getHostname } from '../../shared/lib/get-hostname'
import { checkIsOnDemandRevalidate } from '../api-utils'
import type { PreviewData } from '../../types'
import type { BuildManifest } from '../get-page-files'
import type { ReactLoadableManifest } from '../load-components'
import type { NextFontManifest } from '../../build/webpack/plugins/next-font-manifest-plugin'
import { normalizeDataPath } from '../../shared/lib/page-path/normalize-data-path'
import { pathHasPrefix } from '../../shared/lib/router/utils/path-has-prefix'
import { addRequestMeta, getRequestMeta } from '../request-meta'
import { normalizePagePath } from '../../shared/lib/page-path/normalize-page-path'
import { isStaticMetadataRoute } from '../../lib/metadata/is-metadata-route'
import { IncrementalCache } from '../lib/incremental-cache'
import { initializeCacheHandlers, setCacheHandler } from '../use-cache/handlers'
import { interopDefault } from '../app-render/interop-default'
import { RouteKind } from '../route-kind'
import type { BaseNextRequest } from '../base-http'
import type { I18NConfig, NextConfigComplete } from '../config-shared'
import ResponseCache, { type ResponseGenerator } from '../response-cache'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import {
  RouterServerContextSymbol,
  routerServerGlobal,
  type RouterServerContext,
} from '../lib/router-utils/router-server-context'
import { decodePathParams } from '../lib/router-utils/decode-path-params'
import { removeTrailingSlash } from '../../shared/lib/router/utils/remove-trailing-slash'
import { isInterceptionRouteRewrite } from '../../lib/generate-interception-routes-rewrites'

/**
 * RouteModuleOptions is the options that are passed to the route module, other
 * route modules should extend this class to add specific options for their
 * route.
 */
export interface RouteModuleOptions<
  D extends RouteDefinition = RouteDefinition,
  U = unknown,
> {
  readonly definition: Readonly<D>
  readonly userland: Readonly<U>
  readonly distDir: string
  readonly relativeProjectDir: string
}

/**
 * RouteHandlerContext is the base context for a route handler.
 */
export interface RouteModuleHandleContext {
  /**
   * Any matched parameters for the request. This is only defined for dynamic
   * routes.
   */
  params: Record<string, string | string[] | undefined> | undefined
}

const dynamicImportEsmDefault = (id: string) =>
  import(/* webpackIgnore: true */ /* turbopackIgnore: true */ id).then(
    (mod) => mod.default || mod
  )

/**
 * RouteModule is the base class for all route modules. This class should be
 * extended by all route modules.
 */
export abstract class RouteModule<
  D extends RouteDefinition = RouteDefinition,
  U = unknown,
> {
  /**
   * The userland module. This is the module that is exported from the user's
   * code. This is marked as readonly to ensure that the module is not mutated
   * because the module (when compiled) only provides getters.
   */
  public readonly userland: Readonly<U>

  /**
   * The definition of the route.
   */
  public readonly definition: Readonly<D>

  /**
   * The shared modules that are exposed and required for the route module.
   */
  public static readonly sharedModules: any

  public isDev: boolean
  public distDir: string
  public relativeProjectDir: string
  public incrementCache?: IncrementalCache
  public responseCache?: ResponseCache

  constructor({
    userland,
    definition,
    distDir,
    relativeProjectDir,
  }: RouteModuleOptions<D, U>) {
    this.userland = userland
    this.definition = definition
    this.isDev = process.env.NODE_ENV === 'development'
    this.distDir = distDir
    this.relativeProjectDir = relativeProjectDir
  }

  public async instrumentationOnRequestError(
    req: IncomingMessage | BaseNextRequest,
    ...args: Parameters<InstrumentationOnRequestError>
  ) {
    if (process.env.NEXT_RUNTIME === 'edge') {
      const { getEdgeInstrumentationModule } = await import('../web/globals')
      const instrumentation = await getEdgeInstrumentationModule()

      if (instrumentation) {
        await instrumentation.onRequestError?.(...args)
      }
    } else {
      const { join } = require('node:path') as typeof import('node:path')
      const absoluteProjectDir = join(
        /* turbopackIgnore: true */
        process.cwd(),
        getRequestMeta(req, 'relativeProjectDir') || this.relativeProjectDir
      )

      const { instrumentationOnRequestError } = await import(
        '../lib/router-utils/instrumentation-globals.external.js'
      )

      return instrumentationOnRequestError(
        absoluteProjectDir,
        this.distDir,
        ...args
      )
    }
  }

  private loadManifests(
    srcPage: string,
    projectDir?: string
  ): {
    buildId: string
    buildManifest: BuildManifest
    fallbackBuildManifest: BuildManifest
    routesManifest: DeepReadonly<DevRoutesManifest>
    nextFontManifest: DeepReadonly<NextFontManifest>
    prerenderManifest: DeepReadonly<PrerenderManifest>
    serverFilesManifest: RequiredServerFilesManifest
    reactLoadableManifest: DeepReadonly<ReactLoadableManifest>
    subresourceIntegrityManifest: any
    clientReferenceManifest: any
    serverActionsManifest: any
    dynamicCssManifest: any
    interceptionRoutePatterns: RegExp[]
  } {
    if (process.env.NEXT_RUNTIME === 'edge') {
      const { getEdgePreviewProps } =
        require('../web/get-edge-preview-props') as typeof import('../web/get-edge-preview-props')

      const maybeJSONParse = (str?: string) =>
        str ? JSON.parse(str) : undefined

      return {
        buildId: process.env.__NEXT_BUILD_ID || '',
        buildManifest: self.__BUILD_MANIFEST as any,
        fallbackBuildManifest: {} as any,
        reactLoadableManifest: maybeJSONParse(self.__REACT_LOADABLE_MANIFEST),
        nextFontManifest: maybeJSONParse(self.__NEXT_FONT_MANIFEST),
        prerenderManifest: {
          routes: {},
          dynamicRoutes: {},
          notFoundRoutes: [],
          version: 4,
          preview: getEdgePreviewProps(),
        },
        routesManifest: {
          version: 4,
          caseSensitive: Boolean(process.env.__NEXT_CASE_SENSITIVE_ROUTES),
          basePath: process.env.__NEXT_BASE_PATH || '',
          rewrites: (process.env.__NEXT_REWRITES as any) || {
            beforeFiles: [],
            afterFiles: [],
            fallback: [],
          },
          redirects: [],
          headers: [],
          i18n:
            (process.env.__NEXT_I18N_CONFIG as any as I18NConfig) || undefined,
          skipProxyUrlNormalize: Boolean(
            process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE
          ),
        },
        serverFilesManifest: {
          config: (globalThis as any).nextConfig || {},
        } as any,
        clientReferenceManifest: self.__RSC_MANIFEST?.[srcPage],
        serverActionsManifest: maybeJSONParse(self.__RSC_SERVER_MANIFEST),
        subresourceIntegrityManifest: maybeJSONParse(
          self.__SUBRESOURCE_INTEGRITY_MANIFEST
        ),
        dynamicCssManifest: maybeJSONParse(self.__DYNAMIC_CSS_MANIFEST),
        interceptionRoutePatterns: (
          maybeJSONParse(self.__INTERCEPTION_ROUTE_REWRITE_MANIFEST) ?? []
        ).map((rewrite: any) => new RegExp(rewrite.regex)),
      }
    } else {
      if (!projectDir) {
        throw new Error('Invariant: projectDir is required for node runtime')
      }
      const { loadManifestFromRelativePath } =
        require('../load-manifest.external') as typeof import('../load-manifest.external')
      const normalizedPagePath = normalizePagePath(srcPage)

      const router =
        this.definition.kind === RouteKind.PAGES ||
        this.definition.kind === RouteKind.PAGES_API
          ? 'pages'
          : 'app'

      const [
        routesManifest,
        prerenderManifest,
        buildManifest,
        fallbackBuildManifest,
        reactLoadableManifest,
        nextFontManifest,
        clientReferenceManifest,
        serverActionsManifest,
        subresourceIntegrityManifest,
        serverFilesManifest,
        buildId,
        dynamicCssManifest,
      ] = [
        loadManifestFromRelativePath<DevRoutesManifest>({
          projectDir,
          distDir: this.distDir,
          manifest: ROUTES_MANIFEST,
          shouldCache: !this.isDev,
        }),
        loadManifestFromRelativePath<PrerenderManifest>({
          projectDir,
          distDir: this.distDir,
          manifest: PRERENDER_MANIFEST,
          shouldCache: !this.isDev,
        }),
        loadManifestFromRelativePath<BuildManifest>({
          projectDir,
          distDir: this.distDir,
          manifest: BUILD_MANIFEST,
          shouldCache: !this.isDev,
        }),
        srcPage === '/_error'
          ? loadManifestFromRelativePath<BuildManifest>({
              projectDir,
              distDir: this.distDir,
              manifest: `fallback-${BUILD_MANIFEST}`,
              shouldCache: !this.isDev,
              handleMissing: true,
            })
          : ({} as BuildManifest),
        loadManifestFromRelativePath<ReactLoadableManifest>({
          projectDir,
          distDir: this.distDir,
          manifest: process.env.TURBOPACK
            ? `server/${router === 'app' ? 'app' : 'pages'}${normalizedPagePath}/${REACT_LOADABLE_MANIFEST}`
            : REACT_LOADABLE_MANIFEST,
          handleMissing: true,
          shouldCache: !this.isDev,
        }),
        loadManifestFromRelativePath<NextFontManifest>({
          projectDir,
          distDir: this.distDir,
          manifest: `server/${NEXT_FONT_MANIFEST}.json`,
          shouldCache: !this.isDev,
        }),
        router === 'app' && !isStaticMetadataRoute(srcPage)
          ? loadManifestFromRelativePath({
              distDir: this.distDir,
              projectDir,
              useEval: true,
              handleMissing: true,
              manifest: `server/app${srcPage.replace(/%5F/g, '_') + '_' + CLIENT_REFERENCE_MANIFEST}.js`,
              shouldCache: !this.isDev,
            })
          : undefined,
        router === 'app'
          ? loadManifestFromRelativePath<any>({
              distDir: this.distDir,
              projectDir,
              manifest: `server/${SERVER_REFERENCE_MANIFEST}.json`,
              handleMissing: true,
              shouldCache: !this.isDev,
            })
          : {},
        loadManifestFromRelativePath<Record<string, string>>({
          projectDir,
          distDir: this.distDir,
          manifest: `server/${SUBRESOURCE_INTEGRITY_MANIFEST}.json`,
          handleMissing: true,
          shouldCache: !this.isDev,
        }),
        this.isDev
          ? ({} as any)
          : loadManifestFromRelativePath<RequiredServerFilesManifest>({
              projectDir,
              distDir: this.distDir,
              manifest: SERVER_FILES_MANIFEST,
            }),
        this.isDev
          ? 'development'
          : loadManifestFromRelativePath<any>({
              projectDir,
              distDir: this.distDir,
              manifest: BUILD_ID_FILE,
              skipParse: true,
            }),
        loadManifestFromRelativePath<any>({
          projectDir,
          distDir: this.distDir,
          manifest: DYNAMIC_CSS_MANIFEST,
          handleMissing: true,
        }),
      ]

      return {
        buildId,
        buildManifest,
        fallbackBuildManifest,
        routesManifest,
        nextFontManifest,
        prerenderManifest,
        serverFilesManifest,
        reactLoadableManifest,
        clientReferenceManifest: (clientReferenceManifest as any)
          ?.__RSC_MANIFEST?.[srcPage.replace(/%5F/g, '_')],
        serverActionsManifest,
        subresourceIntegrityManifest,
        dynamicCssManifest,
        interceptionRoutePatterns: routesManifest.rewrites.beforeFiles
          .filter(isInterceptionRouteRewrite)
          .map((rewrite) => new RegExp(rewrite.regex)),
      }
    }
  }

  public async loadCustomCacheHandlers(
    req: IncomingMessage | BaseNextRequest,
    nextConfig: NextConfigComplete
  ) {
    if (process.env.NEXT_RUNTIME !== 'edge') {
      const {
        cacheMaxMemorySize,
        experimental: { cacheHandlers },
      } = nextConfig
      if (!cacheHandlers) return

      // If we've already initialized the cache handlers interface, don't do it
      // again.
      if (!initializeCacheHandlers(cacheMaxMemorySize)) return

      for (const [kind, handler] of Object.entries(cacheHandlers)) {
        if (!handler) continue

        const { formatDynamicImportPath } =
          require('../../lib/format-dynamic-import-path') as typeof import('../../lib/format-dynamic-import-path')

        const { join } = require('node:path') as typeof import('node:path')
        const absoluteProjectDir = join(
          /* turbopackIgnore: true */
          process.cwd(),
          getRequestMeta(req, 'relativeProjectDir') || this.relativeProjectDir
        )

        setCacheHandler(
          kind,
          interopDefault(
            await dynamicImportEsmDefault(
              formatDynamicImportPath(
                `${absoluteProjectDir}/${this.distDir}`,
                handler
              )
            )
          )
        )
      }
    }
  }

  public async getIncrementalCache(
    req: IncomingMessage | BaseNextRequest,
    nextConfig: NextConfigComplete,
    prerenderManifest: DeepReadonly<PrerenderManifest>
  ): Promise<IncrementalCache> {
    if (process.env.NEXT_RUNTIME === 'edge') {
      return (globalThis as any).__incrementalCache
    } else {
      let CacheHandler: any
      const { cacheHandler } = nextConfig

      if (cacheHandler) {
        const { formatDynamicImportPath } =
          require('../../lib/format-dynamic-import-path') as typeof import('../../lib/format-dynamic-import-path')

        CacheHandler = interopDefault(
          await dynamicImportEsmDefault(
            formatDynamicImportPath(this.distDir, cacheHandler)
          )
        )
      }
      const { join } = require('node:path') as typeof import('node:path')
      const projectDir = join(
        /* turbopackIgnore: true */
        process.cwd(),
        getRequestMeta(req, 'relativeProjectDir') || this.relativeProjectDir
      )

      await this.loadCustomCacheHandlers(req, nextConfig)

      // incremental-cache is request specific
      // although can have shared caches in module scope
      // per-cache handler
      return new IncrementalCache({
        fs: (
          require('../lib/node-fs-methods') as typeof import('../lib/node-fs-methods')
        ).nodeFs,
        dev: this.isDev,
        requestHeaders: req.headers,
        allowedRevalidateHeaderKeys:
          nextConfig.experimental.allowedRevalidateHeaderKeys,
        minimalMode: getRequestMeta(req, 'minimalMode'),
        serverDistDir: `${projectDir}/${this.distDir}/server`,
        fetchCacheKeyPrefix: nextConfig.experimental.fetchCacheKeyPrefix,
        maxMemoryCacheSize: nextConfig.cacheMaxMemorySize,
        flushToDisk: nextConfig.experimental.isrFlushToDisk,
        getPrerenderManifest: () => prerenderManifest,
        CurCacheHandler: CacheHandler,
      })
    }
  }

  public async onRequestError(
    req: IncomingMessage | BaseNextRequest,
    err: unknown,
    errorContext: RequestErrorContext,
    routerServerContext?: RouterServerContext[string]
  ) {
    if (routerServerContext?.logErrorWithOriginalStack) {
      routerServerContext.logErrorWithOriginalStack(err, 'app-dir')
    } else {
      console.error(err)
    }
    await this.instrumentationOnRequestError(
      req,
      err,
      {
        path: req.url || '/',
        headers: req.headers,
        method: req.method || 'GET',
      },
      errorContext
    )
  }

  public async prepare(
    req: IncomingMessage | BaseNextRequest,
    res: ServerResponse | null,
    {
      srcPage,
      multiZoneDraftMode,
    }: {
      srcPage: string
      multiZoneDraftMode?: boolean
    }
  ): Promise<
    | {
        buildId: string
        locale?: string
        locales?: readonly string[]
        defaultLocale?: string
        query: ParsedUrlQuery
        originalQuery: ParsedUrlQuery
        originalPathname: string
        params?: ParsedUrlQuery
        parsedUrl: UrlWithParsedQuery
        previewData: PreviewData
        pageIsDynamic: boolean
        isDraftMode: boolean
        resolvedPathname: string
        encodedResolvedPathname: string
        isNextDataRequest: boolean
        buildManifest: DeepReadonly<BuildManifest>
        fallbackBuildManifest: DeepReadonly<BuildManifest>
        nextFontManifest: DeepReadonly<NextFontManifest>
        serverFilesManifest: DeepReadonly<RequiredServerFilesManifest>
        reactLoadableManifest: DeepReadonly<ReactLoadableManifest>
        routesManifest: DeepReadonly<DevRoutesManifest>
        prerenderManifest: DeepReadonly<PrerenderManifest>
        // we can't pull in the client reference type or it causes issues with
        // our pre-compiled types
        clientReferenceManifest?: any
        serverActionsManifest?: any
        dynamicCssManifest?: any
        subresourceIntegrityManifest?: DeepReadonly<Record<string, string>>
        isOnDemandRevalidate: boolean
        revalidateOnlyGenerated: boolean
        nextConfig: NextConfigComplete
        routerServerContext?: RouterServerContext[string]
        interceptionRoutePatterns?: any
      }
    | undefined
  > {
    let absoluteProjectDir: string | undefined

    // edge runtime handles loading instrumentation at the edge adapter level
    if (process.env.NEXT_RUNTIME !== 'edge') {
      const { join, relative } =
        require('node:path') as typeof import('node:path')

      absoluteProjectDir = join(
        /* turbopackIgnore: true */
        process.cwd(),
        getRequestMeta(req, 'relativeProjectDir') || this.relativeProjectDir
      )

      const absoluteDistDir = getRequestMeta(req, 'distDir')

      if (absoluteDistDir) {
        this.distDir = relative(absoluteProjectDir, absoluteDistDir)
      }
      const { ensureInstrumentationRegistered } = await import(
        '../lib/router-utils/instrumentation-globals.external.js'
      )
      // ensure instrumentation is registered and pass
      // onRequestError below
      ensureInstrumentationRegistered(absoluteProjectDir, this.distDir)
    }
    const manifests = await this.loadManifests(srcPage, absoluteProjectDir)
    const { routesManifest, prerenderManifest, serverFilesManifest } = manifests

    const { basePath, i18n, rewrites } = routesManifest

    if (basePath) {
      req.url = removePathPrefix(req.url || '/', basePath)
    }

    const parsedUrl = parseReqUrl(req.url || '/')
    // if we couldn't parse the URL we can't continue
    if (!parsedUrl) {
      return
    }
    let isNextDataRequest = false

    if (pathHasPrefix(parsedUrl.pathname || '/', '/_next/data')) {
      isNextDataRequest = true
      parsedUrl.pathname = normalizeDataPath(parsedUrl.pathname || '/')
    }
    let originalPathname = parsedUrl.pathname || '/'
    const originalQuery = { ...parsedUrl.query }
    const pageIsDynamic = isDynamicRoute(srcPage)

    let localeResult: PathLocale | undefined
    let detectedLocale: string | undefined

    if (i18n) {
      localeResult = normalizeLocalePath(
        parsedUrl.pathname || '/',
        i18n.locales
      )

      if (localeResult.detectedLocale) {
        req.url = `${localeResult.pathname}${parsedUrl.search}`
        originalPathname = localeResult.pathname

        if (!detectedLocale) {
          detectedLocale = localeResult.detectedLocale
        }
      }
    }

    // Normalize the page path for route matching. The srcPage contains the
    // internal page path (e.g., /app/[slug]/page), but route matchers expect
    // the pathname format (e.g., /app/[slug]).
    const normalizedSrcPage = normalizeAppPath(srcPage)

    const serverUtils = getServerUtils({
      page: normalizedSrcPage,
      i18n,
      basePath,
      rewrites,
      pageIsDynamic,
      trailingSlash: process.env.__NEXT_TRAILING_SLASH as any as boolean,
      caseSensitive: Boolean(routesManifest.caseSensitive),
    })

    const domainLocale = detectDomainLocale(
      i18n?.domains,
      getHostname(parsedUrl, req.headers),
      detectedLocale
    )
    addRequestMeta(req, 'isLocaleDomain', Boolean(domainLocale))

    const defaultLocale = domainLocale?.defaultLocale || i18n?.defaultLocale

    // Ensure parsedUrl.pathname includes locale before processing
    // rewrites or they won't match correctly.
    if (defaultLocale && !detectedLocale) {
      parsedUrl.pathname = `/${defaultLocale}${parsedUrl.pathname === '/' ? '' : parsedUrl.pathname}`
    }
    const locale =
      getRequestMeta(req, 'locale') || detectedLocale || defaultLocale

    // we apply rewrites against cloned URL so that we don't
    // modify the original with the rewrite destination
    const { rewriteParams, rewrittenParsedUrl } = serverUtils.handleRewrites(
      req,
      parsedUrl
    )
    const rewriteParamKeys = Object.keys(rewriteParams)
    Object.assign(parsedUrl.query, rewrittenParsedUrl.query)

    // after processing rewrites we want to remove locale
    // from parsedUrl pathname
    if (i18n) {
      parsedUrl.pathname = normalizeLocalePath(
        parsedUrl.pathname || '/',
        i18n.locales
      ).pathname

      rewrittenParsedUrl.pathname = normalizeLocalePath(
        rewrittenParsedUrl.pathname || '/',
        i18n.locales
      ).pathname
    }

    let params: Record<string, undefined | string | string[]> | undefined =
      getRequestMeta(req, 'params')

    // attempt parsing from pathname
    if (!params && serverUtils.dynamicRouteMatcher) {
      const paramsMatch = serverUtils.dynamicRouteMatcher(
        normalizeDataPath(
          rewrittenParsedUrl?.pathname || parsedUrl.pathname || '/'
        )
      )
      const paramsResult = serverUtils.normalizeDynamicRouteParams(
        paramsMatch || {},
        true
      )

      if (paramsResult.hasValidParams) {
        params = paramsResult.params
      }
    }

    // Local "next start" expects the routing parsed query values
    // to not be present in the URL although when deployed proxies
    // will add query values from resolving the routes to pass to function.

    // TODO: do we want to change expectations for "next start"
    // to include these query values in the URL which affects asPath
    // but would match deployed behavior, e.g. a rewrite from middleware
    // that adds a query param would be in asPath as query but locally
    // it won't be in the asPath but still available in the query object
    const query = getRequestMeta(req, 'query') || {
      ...parsedUrl.query,
    }

    const routeParamKeys = new Set<string>()
    const combinedParamKeys = []

    // We don't include rewriteParamKeys in the combinedParamKeys
    // for app router since the searchParams is populated from the
    // URL so we don't want to strip the rewrite params from the URL
    // so that searchParams can include them.
    if (
      this.definition.kind === RouteKind.PAGES ||
      this.definition.kind === RouteKind.PAGES_API
    ) {
      for (const key of [
        ...rewriteParamKeys,
        ...Object.keys(serverUtils.defaultRouteMatches || {}),
      ]) {
        // We only want to filter rewrite param keys from the URL
        // if they are matches from the URL e.g. the key/value matches
        // before and after applying the rewrites /:path for /hello and
        // { path: 'hello' } but not for { path: 'another' } and /hello
        // TODO: we should prefix rewrite param keys the same as we do
        // for dynamic routes so we can identify them properly
        const originalValue = Array.isArray(originalQuery[key])
          ? originalQuery[key].join('')
          : originalQuery[key]

        const queryValue = Array.isArray(query[key])
          ? query[key].join('')
          : query[key]

        if (!(key in originalQuery) || originalValue === queryValue) {
          combinedParamKeys.push(key)
        }
      }
    }

    serverUtils.normalizeCdnUrl(req, combinedParamKeys)
    serverUtils.normalizeQueryParams(query, routeParamKeys)
    serverUtils.filterInternalQuery(originalQuery, combinedParamKeys)

    if (pageIsDynamic) {
      const queryResult = serverUtils.normalizeDynamicRouteParams(query, true)

      const paramsResult = serverUtils.normalizeDynamicRouteParams(
        params || {},
        true
      )
      const paramsToInterpolate: ParsedUrlQuery =
        paramsResult.hasValidParams && params
          ? params
          : queryResult.hasValidParams
            ? query
            : {}

      req.url = serverUtils.interpolateDynamicPath(
        req.url || '/',
        paramsToInterpolate
      )
      parsedUrl.pathname = serverUtils.interpolateDynamicPath(
        parsedUrl.pathname || '/',
        paramsToInterpolate
      )
      originalPathname = serverUtils.interpolateDynamicPath(
        originalPathname,
        paramsToInterpolate
      )

      // try pulling from query if valid
      if (!params) {
        if (queryResult.hasValidParams) {
          params = Object.assign({}, queryResult.params)

          // If we pulled from query remove it so it's
          // only in params
          for (const key in serverUtils.defaultRouteMatches) {
            delete query[key]
          }
        } else {
          // use final params from URL matching
          const paramsMatch = serverUtils.dynamicRouteMatcher?.(
            normalizeDataPath(
              localeResult?.pathname || parsedUrl.pathname || '/'
            )
          )
          // we don't normalize these as they are allowed to be
          // the literal slug matches here e.g. /blog/[slug]
          // actually being requested
          if (paramsMatch) {
            params = Object.assign({}, paramsMatch)
          }
        }
      }
    }

    // Remove any normalized params from the query if they
    // weren't present as non-prefixed query key e.g.
    // ?search=1&nxtPsearch=hello we don't delete search
    for (const key of routeParamKeys) {
      if (!(key in originalQuery)) {
        delete query[key]
      }
    }

    const { isOnDemandRevalidate, revalidateOnlyGenerated } =
      checkIsOnDemandRevalidate(req, prerenderManifest.preview)

    let isDraftMode = false
    let previewData: PreviewData

    // preview data relies on non-edge utils
    if (process.env.NEXT_RUNTIME !== 'edge' && res) {
      const { tryGetPreviewData } =
        require('../api-utils/node/try-get-preview-data') as typeof import('../api-utils/node/try-get-preview-data')

      previewData = tryGetPreviewData(
        req,
        res,
        prerenderManifest.preview,
        Boolean(multiZoneDraftMode)
      )
      isDraftMode = previewData !== false
    }

    const relativeProjectDir =
      getRequestMeta(req, 'relativeProjectDir') || this.relativeProjectDir

    const routerServerContext =
      routerServerGlobal[RouterServerContextSymbol]?.[relativeProjectDir]
    const nextConfig =
      routerServerContext?.nextConfig || serverFilesManifest.config

    let resolvedPathname = normalizedSrcPage
    if (isDynamicRoute(resolvedPathname) && params) {
      resolvedPathname = serverUtils.interpolateDynamicPath(
        resolvedPathname,
        params
      )
    }

    if (resolvedPathname === '/index') {
      resolvedPathname = '/'
    }
    const encodedResolvedPathname = resolvedPathname

    // we decode for cache key/manifest usage encoded is
    // for URL building
    try {
      resolvedPathname = decodePathParams(resolvedPathname)
    } catch (_) {}

    resolvedPathname = removeTrailingSlash(resolvedPathname)

    return {
      query,
      originalQuery,
      originalPathname,
      params,
      parsedUrl,
      locale,
      isNextDataRequest,
      locales: i18n?.locales,
      defaultLocale,
      isDraftMode,
      previewData,
      pageIsDynamic,
      resolvedPathname,
      encodedResolvedPathname,
      isOnDemandRevalidate,
      revalidateOnlyGenerated,
      ...manifests,
      serverActionsManifest: manifests.serverActionsManifest,
      clientReferenceManifest: manifests.clientReferenceManifest,
      nextConfig,
      routerServerContext,
    }
  }

  public getResponseCache(req: IncomingMessage | BaseNextRequest) {
    if (!this.responseCache) {
      const minimalMode = getRequestMeta(req, 'minimalMode') ?? false
      this.responseCache = new ResponseCache(minimalMode)
    }
    return this.responseCache
  }

  public async handleResponse({
    req,
    nextConfig,
    cacheKey,
    routeKind,
    isFallback,
    prerenderManifest,
    isRoutePPREnabled,
    isOnDemandRevalidate,
    revalidateOnlyGenerated,
    responseGenerator,
    waitUntil,
  }: {
    req: IncomingMessage | BaseNextRequest
    nextConfig: NextConfigComplete
    cacheKey: string | null
    routeKind: RouteKind
    isFallback?: boolean
    prerenderManifest: DeepReadonly<PrerenderManifest>
    isRoutePPREnabled?: boolean
    isOnDemandRevalidate?: boolean
    revalidateOnlyGenerated?: boolean
    responseGenerator: ResponseGenerator
    waitUntil?: (prom: Promise<any>) => void
  }) {
    const responseCache = this.getResponseCache(req)
    const cacheEntry = await responseCache.get(cacheKey, responseGenerator, {
      routeKind,
      isFallback,
      isRoutePPREnabled,
      isOnDemandRevalidate,
      isPrefetch: req.headers.purpose === 'prefetch',
      incrementalCache: await this.getIncrementalCache(
        req,
        nextConfig,
        prerenderManifest
      ),
      waitUntil,
    })

    if (!cacheEntry) {
      if (
        cacheKey &&
        // revalidate only generated can bail even if cacheKey is provided
        !(isOnDemandRevalidate && revalidateOnlyGenerated)
      ) {
        // A cache entry might not be generated if a response is written
        // in `getInitialProps` or `getServerSideProps`, but those shouldn't
        // have a cache key. If we do have a cache key but we don't end up
        // with a cache entry, then either Next.js or the application has a
        // bug that needs fixing.
        throw new Error('invariant: cache entry required but not generated')
      }
    }
    return cacheEntry
  }
}
