import { __ApiPreviewProps } from './api-utils'
import type { CustomRoutes } from '../lib/load-custom-routes'
import type { DomainLocale } from './config'
import type { DynamicRoutes, PageChecker, Params, Route } from './router'
import type { FontManifest } from './font-utils'
import type { LoadComponentsReturnType } from './load-components'
import type { MiddlewareManifest } from '../build/webpack/plugins/middleware-plugin'
import type { NextConfig, NextConfigComplete } from './config-shared'
import type { NextParsedUrlQuery, NextUrlWithParsedQuery } from './request-meta'
import type { ParsedUrlQuery } from 'querystring'
import type { RenderOpts, RenderOptsPartial } from './render'
import type { ResponseCacheEntry, ResponseCacheValue } from './response-cache'
import type { UrlWithParsedQuery } from 'url'
import {
  CacheFs,
  NormalizeError,
  DecodeError,
  normalizeRepeatedSlashes,
} from '../shared/lib/utils'
import type { PreviewData } from 'next/types'
import type { PagesManifest } from '../build/webpack/plugins/pages-manifest-plugin'
import type { BaseNextRequest, BaseNextResponse } from './base-http'
import type { PayloadOptions } from './send-payload'

import { join, resolve } from '../shared/lib/isomorphic/path'
import { parse as parseQs } from 'querystring'
import { format as formatUrl, parse as parseUrl } from 'url'
import { getRedirectStatus } from '../lib/load-custom-routes'
import {
  NEXT_BUILTIN_DOCUMENT,
  SERVERLESS_DIRECTORY,
  SERVER_DIRECTORY,
  STATIC_STATUS_PAGES,
  TEMPORARY_REDIRECT_STATUS,
} from '../shared/lib/constants'
import {
  getRouteMatcher,
  getRouteRegex,
  getSortedRoutes,
  isDynamicRoute,
} from '../shared/lib/router/utils'
import {
  setLazyProp,
  getCookieParser,
  checkIsManualRevalidate,
} from './api-utils'
import * as envConfig from '../shared/lib/runtime-config'
import { isTargetLikeServerless } from './utils'
import Router from './router'
import { getPathMatch } from '../shared/lib/router/utils/path-match'
import { setRevalidateHeaders } from './send-payload/revalidate-headers'
import { IncrementalCache } from './incremental-cache'
import { execOnce } from '../shared/lib/utils'
import { isBlockedPage, isBot } from './utils'
import RenderResult from './render-result'
import { removePathTrailingSlash } from '../client/normalize-trailing-slash'
import getRouteFromAssetPath from '../shared/lib/router/utils/get-route-from-asset-path'
import { denormalizePagePath } from '../shared/lib/page-path/denormalize-page-path'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import * as Log from '../build/output/log'
import { detectDomainLocale } from '../shared/lib/i18n/detect-domain-locale'
import escapePathDelimiters from '../shared/lib/router/utils/escape-path-delimiters'
import { getUtils } from '../build/webpack/loaders/next-serverless-loader/utils'
import ResponseCache from './response-cache'
import { parseNextUrl } from '../shared/lib/router/utils/parse-next-url'
import isError, { getProperError } from '../lib/is-error'
import { MIDDLEWARE_ROUTE } from '../lib/constants'
import { addRequestMeta, getRequestMeta } from './request-meta'
import { createHeaderRoute, createRedirectRoute } from './server-route-utils'
import { PrerenderManifest } from '../build'
import { ImageConfigComplete } from '../shared/lib/image-config'
import { replaceBasePath } from './router-utils'
import { normalizeViewPath } from '../shared/lib/router/utils/view-paths'

export type FindComponentsResult = {
  components: LoadComponentsReturnType
  query: NextParsedUrlQuery
}

interface RoutingItem {
  page: string
  match: ReturnType<typeof getRouteMatcher>
  ssr?: boolean
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
   * Tells if Next.js is running in a Serverless platform
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
}

export interface BaseRequestHandler {
  (
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl?: NextUrlWithParsedQuery | undefined
  ): Promise<void>
}

type RequestContext = {
  req: BaseNextRequest
  res: BaseNextResponse
  pathname: string
  query: NextParsedUrlQuery
  renderOpts: RenderOptsPartial
}

export default abstract class Server<ServerOptions extends Options = Options> {
  protected dir: string
  protected quiet: boolean
  protected nextConfig: NextConfigComplete
  protected distDir: string
  protected publicDir: string
  protected hasStaticDir: boolean
  protected pagesManifest?: PagesManifest
  protected viewPathsManifest?: PagesManifest
  protected buildId: string
  protected minimalMode: boolean
  protected renderOpts: {
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
    optimizeFonts: boolean
    images: ImageConfigComplete
    fontManifest?: FontManifest
    disableOptimizedLoading?: boolean
    optimizeCss: any
    nextScriptWorkers: any
    locale?: string
    locales?: string[]
    defaultLocale?: string
    domainLocales?: DomainLocale[]
    distDir: string
    runtime?: 'nodejs' | 'edge'
    serverComponents?: boolean
    crossOrigin?: string
    supportsDynamicHTML?: boolean
    serverComponentManifest?: any
    renderServerComponentData?: boolean
    serverComponentProps?: any
    reactRoot: boolean
  }
  protected serverOptions: ServerOptions
  private incrementalCache: IncrementalCache
  private responseCache: ResponseCache
  protected router: Router
  protected dynamicRoutes?: DynamicRoutes
  protected viewPathRoutes?: Record<string, string>
  protected customRoutes: CustomRoutes
  protected middlewareManifest?: MiddlewareManifest
  protected middleware?: RoutingItem[]
  protected serverComponentManifest?: any
  public readonly hostname?: string
  public readonly port?: number

  protected abstract getPublicDir(): string
  protected abstract getHasStaticDir(): boolean
  protected abstract getPagesManifest(): PagesManifest | undefined
  protected abstract getViewPathsManifest(): PagesManifest | undefined
  protected abstract getBuildId(): string
  protected abstract generatePublicRoutes(): Route[]
  protected abstract generateImageRoutes(): Route[]
  protected abstract generateStaticRoutes(): Route[]
  protected abstract generateFsStaticRoutes(): Route[]
  protected abstract generateCatchAllMiddlewareRoute(): Route | undefined
  protected abstract generateRewrites({
    restrictedRedirectPaths,
  }: {
    restrictedRedirectPaths: string[]
  }): {
    beforeFiles: Route[]
    afterFiles: Route[]
    fallback: Route[]
  }
  protected abstract getFilesystemPaths(): Set<string>
  protected abstract getMiddleware(): {
    match: (pathname: string | null | undefined) =>
      | false
      | {
          [paramName: string]: string | string[]
        }
    page: string
  }[]
  protected abstract findPageComponents(
    pathname: string,
    query?: NextParsedUrlQuery,
    params?: Params | null
  ): Promise<FindComponentsResult | null>
  protected abstract hasMiddleware(
    pathname: string,
    _isSSR?: boolean
  ): Promise<boolean>
  protected abstract getPagePath(pathname: string, locales?: string[]): string
  protected abstract getFontManifest(): FontManifest | undefined
  protected abstract getMiddlewareManifest(): MiddlewareManifest | undefined
  protected abstract getRoutesManifest(): CustomRoutes
  protected abstract getPrerenderManifest(): PrerenderManifest
  protected abstract getServerComponentManifest(): any

  protected abstract sendRenderResult(
    req: BaseNextRequest,
    res: BaseNextResponse,
    options: {
      result: RenderResult
      type: 'html' | 'json'
      generateEtags: boolean
      poweredByHeader: boolean
      options?: PayloadOptions
    }
  ): Promise<void>

  protected abstract runApi(
    req: BaseNextRequest,
    res: BaseNextResponse,
    query: ParsedUrlQuery,
    params: Params | boolean,
    page: string,
    builtPagePath: string
  ): Promise<boolean>

  protected abstract renderHTML(
    req: BaseNextRequest,
    res: BaseNextResponse,
    pathname: string,
    query: NextParsedUrlQuery,
    renderOpts: RenderOpts
  ): Promise<RenderResult | null>

  protected abstract handleCompression(
    req: BaseNextRequest,
    res: BaseNextResponse
  ): void

  protected abstract loadEnvConfig(params: { dev: boolean }): void

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

    this.dir = resolve(dir)
    this.quiet = quiet
    this.loadEnvConfig({ dev })

    // TODO: should conf be normalized to prevent missing
    // values from causing issues as this can be user provided
    this.nextConfig = conf as NextConfigComplete
    this.hostname = hostname
    this.port = port
    this.distDir = join(this.dir, this.nextConfig.distDir)
    this.publicDir = this.getPublicDir()
    this.hasStaticDir = !minimalMode && this.getHasStaticDir()

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

    const serverComponents = this.nextConfig.experimental.serverComponents
    this.serverComponentManifest = serverComponents
      ? this.getServerComponentManifest()
      : undefined

    this.renderOpts = {
      poweredByHeader: this.nextConfig.poweredByHeader,
      canonicalBase: this.nextConfig.amp.canonicalBase || '',
      buildId: this.buildId,
      generateEtags,
      previewProps: this.getPreviewProps(),
      customServer: customServer === true ? true : undefined,
      ampOptimizerConfig: this.nextConfig.experimental.amp?.optimizer,
      basePath: this.nextConfig.basePath,
      images: this.nextConfig.images,
      optimizeFonts: !!this.nextConfig.optimizeFonts && !dev,
      fontManifest:
        this.nextConfig.optimizeFonts && !dev
          ? this.getFontManifest()
          : undefined,
      optimizeCss: this.nextConfig.experimental.optimizeCss,
      nextScriptWorkers: this.nextConfig.experimental.nextScriptWorkers,
      disableOptimizedLoading: this.nextConfig.experimental.runtime
        ? true
        : this.nextConfig.experimental.disableOptimizedLoading,
      domainLocales: this.nextConfig.i18n?.domains,
      distDir: this.distDir,
      runtime: this.nextConfig.experimental.runtime,
      serverComponents,
      crossOrigin: this.nextConfig.crossOrigin
        ? this.nextConfig.crossOrigin
        : undefined,
      reactRoot: this.nextConfig.experimental.reactRoot === true,
    }

    // Only the `publicRuntimeConfig` key is exposed to the client side
    // It'll be rendered as part of __NEXT_DATA__ on the client side
    if (Object.keys(publicRuntimeConfig).length > 0) {
      this.renderOpts.runtimeConfig = publicRuntimeConfig
    }

    // Initialize next/config with the environment configuration
    envConfig.setConfig({
      serverRuntimeConfig,
      publicRuntimeConfig,
    })

    this.pagesManifest = this.getPagesManifest()
    this.viewPathsManifest = this.getViewPathsManifest()
    this.middlewareManifest = this.getMiddlewareManifest()

    this.customRoutes = this.getCustomRoutes()
    this.router = new Router(this.generateRoutes())
    this.setAssetPrefix(assetPrefix)

    this.incrementalCache = new IncrementalCache({
      fs: this.getCacheFilesystem(),
      dev,
      distDir: this.distDir,
      pagesDir: join(this.serverDistDir, 'pages'),
      locales: this.nextConfig.i18n?.locales,
      max: this.nextConfig.experimental.isrMemoryCacheSize,
      flushToDisk: !minimalMode && this.nextConfig.experimental.isrFlushToDisk,
      getPrerenderManifest: () => {
        if (dev) {
          return {
            version: -1 as any, // letting us know this doesn't conform to spec
            routes: {},
            dynamicRoutes: {},
            notFoundRoutes: [],
            preview: null as any, // `preview` is special case read in next-dev-server
          }
        } else {
          return this.getPrerenderManifest()
        }
      },
    })
    this.responseCache = new ResponseCache(
      this.incrementalCache,
      this.minimalMode
    )
  }

  public logError(err: Error): void {
    if (this.quiet) return
    console.error(err)
  }

  private async handleRequest(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl?: NextUrlWithParsedQuery
  ): Promise<void> {
    try {
      const urlParts = (req.url || '').split('?')
      const urlNoQuery = urlParts[0]

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
        parsedUrl.query = parseQs(parsedUrl.query)
      }

      // When there are hostname and port we build an absolute URL
      const initUrl =
        this.hostname && this.port
          ? `http://${this.hostname}:${this.port}${req.url}`
          : req.url

      addRequestMeta(req, '__NEXT_INIT_URL', initUrl)
      addRequestMeta(req, '__NEXT_INIT_QUERY', { ...parsedUrl.query })

      const url = parseNextUrl({
        headers: req.headers,
        nextConfig: this.nextConfig,
        url: req.url?.replace(/^\/+/, '/'),
      })

      if (url.basePath) {
        req.url = replaceBasePath(req.url!, this.nextConfig.basePath)
        addRequestMeta(req, '_nextHadBasePath', true)
      }

      if (
        this.minimalMode &&
        req.headers['x-matched-path'] &&
        typeof req.headers['x-matched-path'] === 'string'
      ) {
        const reqUrlIsDataUrl = req.url?.includes('/_next/data')
        const parsedMatchedPath = parseUrl(req.headers['x-matched-path'] || '')
        const matchedPathIsDataUrl =
          parsedMatchedPath.pathname?.includes('/_next/data')
        const isDataUrl = reqUrlIsDataUrl || matchedPathIsDataUrl

        let parsedPath = parseUrl(
          isDataUrl ? req.url! : (req.headers['x-matched-path'] as string),
          true
        )
        let matchedPathname = parsedPath.pathname!

        let matchedPathnameNoExt = isDataUrl
          ? matchedPathname.replace(/\.json$/, '')
          : matchedPathname

        let srcPathname = isDataUrl
          ? this.stripNextDataPath(
              parsedMatchedPath.pathname?.replace(/\.json$/, '') ||
                matchedPathnameNoExt
            ) || '/'
          : matchedPathnameNoExt

        if (this.nextConfig.i18n) {
          const localePathResult = normalizeLocalePath(
            matchedPathname || '/',
            this.nextConfig.i18n.locales
          )

          if (localePathResult.detectedLocale) {
            parsedUrl.query.__nextLocale = localePathResult.detectedLocale
          }
        }

        if (isDataUrl) {
          matchedPathname = denormalizePagePath(matchedPathname)
          matchedPathnameNoExt = denormalizePagePath(matchedPathnameNoExt)
          srcPathname = denormalizePagePath(srcPathname)
        }

        if (!isDynamicRoute(srcPathname) && !this.hasPage(srcPathname)) {
          for (const dynamicRoute of this.dynamicRoutes || []) {
            if (dynamicRoute.match(srcPathname)) {
              srcPathname = dynamicRoute.page
              break
            }
          }
        }

        const pageIsDynamic = isDynamicRoute(srcPathname)
        const utils = getUtils({
          pageIsDynamic,
          page: srcPathname,
          i18n: this.nextConfig.i18n,
          basePath: this.nextConfig.basePath,
          rewrites: this.customRoutes.rewrites,
        })

        try {
          // ensure parsedUrl.pathname includes URL before processing
          // rewrites or they won't match correctly
          if (this.nextConfig.i18n && !url.locale?.path.detectedLocale) {
            parsedUrl.pathname = `/${url.locale?.locale}${parsedUrl.pathname}`
          }
          const pathnameBeforeRewrite = parsedUrl.pathname
          const rewriteParams = utils.handleRewrites(req, parsedUrl)
          const rewriteParamKeys = Object.keys(rewriteParams)
          const didRewrite = pathnameBeforeRewrite !== parsedUrl.pathname

          if (didRewrite) {
            addRequestMeta(req, '_nextRewroteUrl', parsedUrl.pathname!)
            addRequestMeta(req, '_nextDidRewrite', true)
          }

          // interpolate dynamic params and normalize URL if needed
          if (pageIsDynamic) {
            let params: ParsedUrlQuery | false = {}

            Object.assign(parsedUrl.query, parsedPath.query)
            const paramsResult = utils.normalizeDynamicRouteParams(
              parsedUrl.query
            )

            if (paramsResult.hasValidParams) {
              params = paramsResult.params
            } else if (req.headers['x-now-route-matches']) {
              const opts: Record<string, string> = {}
              params = utils.getParamsFromRouteMatches(
                req,
                opts,
                parsedUrl.query.__nextLocale || ''
              )

              if (opts.locale) {
                parsedUrl.query.__nextLocale = opts.locale
              }
            } else {
              params = utils.dynamicRouteMatcher!(matchedPathnameNoExt) || {}
            }

            if (params) {
              if (!paramsResult.hasValidParams) {
                params = utils.normalizeDynamicRouteParams(params).params
              }

              matchedPathname = utils.interpolateDynamicPath(
                matchedPathname,
                params
              )
              req.url = utils.interpolateDynamicPath(req.url!, params)
            }

            if (reqUrlIsDataUrl && matchedPathIsDataUrl) {
              req.url = formatUrl({
                ...parsedPath,
                pathname: matchedPathname,
              })
            }
            Object.assign(parsedUrl.query, params)
          }

          if (pageIsDynamic || didRewrite) {
            utils.normalizeVercelUrl(req, true, [
              ...rewriteParamKeys,
              ...Object.keys(utils.defaultRouteRegex?.groups || {}),
            ])
          }
        } catch (err) {
          if (err instanceof DecodeError || err instanceof NormalizeError) {
            res.statusCode = 400
            return this.renderError(null, req, res, '/_error', {})
          }
          throw err
        }

        parsedUrl.pathname = `${this.nextConfig.basePath || ''}${
          matchedPathname === '/' && this.nextConfig.basePath
            ? ''
            : matchedPathname
        }`
        url.pathname = parsedUrl.pathname
      }

      addRequestMeta(req, '__nextHadTrailingSlash', url.locale?.trailingSlash)
      if (url.locale?.domain) {
        addRequestMeta(req, '__nextIsLocaleDomain', true)
      }

      if (url.locale?.path.detectedLocale) {
        req.url = formatUrl(url)
        addRequestMeta(req, '__nextStrippedLocale', true)
      }

      if (!this.minimalMode || !parsedUrl.query.__nextLocale) {
        if (url?.locale?.locale) {
          parsedUrl.query.__nextLocale = url.locale.locale
        }
      }

      if (url?.locale?.defaultLocale) {
        parsedUrl.query.__nextDefaultLocale = url.locale.defaultLocale
      }

      if (url.locale?.redirect) {
        res
          .redirect(url.locale.redirect, TEMPORARY_REDIRECT_STATUS)
          .body(url.locale.redirect)
          .send()
        return
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

  public setAssetPrefix(prefix?: string): void {
    this.renderOpts.assetPrefix = prefix ? prefix.replace(/\/$/, '') : ''
  }

  // Backwards compatibility
  public async prepare(): Promise<void> {}

  // Backwards compatibility
  protected async close(): Promise<void> {}

  protected getCustomRoutes(): CustomRoutes {
    const customRoutes = this.getRoutesManifest()
    let rewrites: CustomRoutes['rewrites']

    // rewrites can be stored as an array when an array is
    // returned in next.config.js so massage them into
    // the expected object format
    if (Array.isArray(customRoutes.rewrites)) {
      rewrites = {
        beforeFiles: [],
        afterFiles: customRoutes.rewrites,
        fallback: [],
      }
    } else {
      rewrites = customRoutes.rewrites
    }
    return Object.assign(customRoutes, { rewrites })
  }

  protected getPreviewProps(): __ApiPreviewProps {
    return this.getPrerenderManifest().preview
  }

  protected async ensureMiddleware(_pathname: string, _isSSR?: boolean) {}

  protected generateRoutes(): {
    basePath: string
    headers: Route[]
    rewrites: {
      beforeFiles: Route[]
      afterFiles: Route[]
      fallback: Route[]
    }
    fsRoutes: Route[]
    redirects: Route[]
    catchAllRoute: Route
    catchAllMiddleware?: Route
    pageChecker: PageChecker
    useFileSystemPublicRoutes: boolean
    dynamicRoutes: DynamicRoutes | undefined
    locales: string[]
  } {
    const publicRoutes = this.generatePublicRoutes()
    const imageRoutes = this.generateImageRoutes()
    const staticFilesRoutes = this.generateStaticRoutes()

    const fsRoutes: Route[] = [
      ...this.generateFsStaticRoutes(),
      {
        match: getPathMatch('/_next/data/:path*'),
        type: 'route',
        name: '_next/data catchall',
        fn: async (req, res, params, _parsedUrl) => {
          // Make sure to 404 for /_next/data/ itself and
          // we also want to 404 if the buildId isn't correct
          if (!params.path || params.path[0] !== this.buildId) {
            await this.render404(req, res, _parsedUrl)
            return {
              finished: true,
            }
          }
          // remove buildId from URL
          params.path.shift()

          const lastParam = params.path[params.path.length - 1]

          // show 404 if it doesn't end with .json
          if (typeof lastParam !== 'string' || !lastParam.endsWith('.json')) {
            await this.render404(req, res, _parsedUrl)
            return {
              finished: true,
            }
          }

          // re-create page's pathname
          let pathname = `/${params.path.join('/')}`
          pathname = getRouteFromAssetPath(pathname, '.json')

          if (this.nextConfig.i18n) {
            const { host } = req?.headers || {}
            // remove port from host and remove port if present
            const hostname = host?.split(':')[0].toLowerCase()
            const localePathResult = normalizeLocalePath(
              pathname,
              this.nextConfig.i18n.locales
            )
            const { defaultLocale } =
              detectDomainLocale(this.nextConfig.i18n.domains, hostname) || {}

            let detectedLocale = ''

            if (localePathResult.detectedLocale) {
              pathname = localePathResult.pathname
              detectedLocale = localePathResult.detectedLocale
            }

            _parsedUrl.query.__nextLocale = detectedLocale
            _parsedUrl.query.__nextDefaultLocale =
              defaultLocale || this.nextConfig.i18n.defaultLocale

            if (!detectedLocale) {
              _parsedUrl.query.__nextLocale =
                _parsedUrl.query.__nextDefaultLocale
              await this.render404(req, res, _parsedUrl)
              return { finished: true }
            }
          }

          const parsedUrl = parseUrl(pathname, true)

          await this.render(
            req,
            res,
            pathname,
            { ..._parsedUrl.query, _nextDataReq: '1' },
            parsedUrl,
            true
          )
          return {
            finished: true,
          }
        },
      },
      ...imageRoutes,
      {
        match: getPathMatch('/_next/:path*'),
        type: 'route',
        name: '_next catchall',
        // This path is needed because `render()` does a check for `/_next` and the calls the routing again
        fn: async (req, res, _params, parsedUrl) => {
          await this.render404(req, res, parsedUrl)
          return {
            finished: true,
          }
        },
      },
      ...publicRoutes,
      ...staticFilesRoutes,
    ]

    const restrictedRedirectPaths = this.nextConfig.basePath
      ? [`${this.nextConfig.basePath}/_next`]
      : ['/_next']

    // Headers come very first
    const headers = this.minimalMode
      ? []
      : this.customRoutes.headers.map((rule) =>
          createHeaderRoute({ rule, restrictedRedirectPaths })
        )

    const redirects = this.minimalMode
      ? []
      : this.customRoutes.redirects.map((rule) =>
          createRedirectRoute({ rule, restrictedRedirectPaths })
        )

    const rewrites = this.generateRewrites({ restrictedRedirectPaths })
    const catchAllMiddleware = this.generateCatchAllMiddlewareRoute()

    const catchAllRoute: Route = {
      match: getPathMatch('/:path*'),
      type: 'route',
      name: 'Catchall render',
      fn: async (req, res, _params, parsedUrl) => {
        let { pathname, query } = parsedUrl
        if (!pathname) {
          throw new Error('pathname is undefined')
        }

        // next.js core assumes page path without trailing slash
        pathname = removePathTrailingSlash(pathname)

        if (this.nextConfig.i18n) {
          const localePathResult = normalizeLocalePath(
            pathname,
            this.nextConfig.i18n?.locales
          )

          if (localePathResult.detectedLocale) {
            pathname = localePathResult.pathname
            parsedUrl.query.__nextLocale = localePathResult.detectedLocale
          }
        }
        const bubbleNoFallback = !!query._nextBubbleNoFallback

        if (pathname.match(MIDDLEWARE_ROUTE)) {
          await this.render404(req, res, parsedUrl)
          return {
            finished: true,
          }
        }

        if (pathname === '/api' || pathname.startsWith('/api/')) {
          delete query._nextBubbleNoFallback

          const handled = await this.handleApiRequest(req, res, pathname, query)
          if (handled) {
            return { finished: true }
          }
        }

        try {
          await this.render(req, res, pathname, query, parsedUrl, true)

          return {
            finished: true,
          }
        } catch (err) {
          if (err instanceof NoFallbackError && bubbleNoFallback) {
            return {
              finished: false,
            }
          }
          throw err
        }
      },
    }

    const { useFileSystemPublicRoutes } = this.nextConfig

    if (useFileSystemPublicRoutes) {
      this.viewPathRoutes = this.getViewPathRoutes()
      this.dynamicRoutes = this.getDynamicRoutes()
      if (!this.minimalMode) {
        this.middleware = this.getMiddleware()
      }
    }

    return {
      headers,
      fsRoutes,
      rewrites,
      redirects,
      catchAllRoute,
      catchAllMiddleware,
      useFileSystemPublicRoutes,
      dynamicRoutes: this.dynamicRoutes,
      basePath: this.nextConfig.basePath,
      pageChecker: this.hasPage.bind(this),
      locales: this.nextConfig.i18n?.locales || [],
    }
  }

  protected async hasPage(pathname: string): Promise<boolean> {
    let found = false
    try {
      found = !!this.getPagePath(pathname, this.nextConfig.i18n?.locales)
    } catch (_) {}

    return found
  }

  protected async _beforeCatchAllRender(
    _req: BaseNextRequest,
    _res: BaseNextResponse,
    _params: Params,
    _parsedUrl: UrlWithParsedQuery
  ): Promise<boolean> {
    return false
  }

  // Used to build API page in development
  protected async ensureApiPage(_pathname: string): Promise<void> {}

  /**
   * Resolves `API` request, in development builds on demand
   * @param req http request
   * @param res http response
   * @param pathname path of request
   */
  private async handleApiRequest(
    req: BaseNextRequest,
    res: BaseNextResponse,
    pathname: string,
    query: ParsedUrlQuery
  ): Promise<boolean> {
    let page = pathname
    let params: Params | false = false
    let pageFound = !isDynamicRoute(page) && (await this.hasPage(page))

    if (!pageFound && this.dynamicRoutes) {
      for (const dynamicRoute of this.dynamicRoutes) {
        params = dynamicRoute.match(pathname)
        if (dynamicRoute.page.startsWith('/api') && params) {
          page = dynamicRoute.page
          pageFound = true
          break
        }
      }
    }

    if (!pageFound) {
      return false
    }
    // Make sure the page is built before getting the path
    // or else it won't be in the manifest yet
    await this.ensureApiPage(page)

    let builtPagePath
    try {
      builtPagePath = this.getPagePath(page)
    } catch (err) {
      if (isError(err) && err.code === 'ENOENT') {
        return false
      }
      throw err
    }

    return this.runApi(req, res, query, params, page, builtPagePath)
  }

  protected getDynamicRoutes(): Array<RoutingItem> {
    const addedPages = new Set<string>()

    return getSortedRoutes(
      [
        ...Object.keys(this.viewPathRoutes || {}),
        ...Object.keys(this.pagesManifest!),
      ].map(
        (page) =>
          normalizeLocalePath(page, this.nextConfig.i18n?.locales).pathname
      )
    )
      .map((page) => {
        if (addedPages.has(page) || !isDynamicRoute(page)) return null
        addedPages.add(page)
        return {
          page,
          match: getRouteMatcher(getRouteRegex(page)),
        }
      })
      .filter((item): item is RoutingItem => Boolean(item))
  }

  protected getViewPathRoutes(): Record<string, string> {
    const viewPathRoutes: Record<string, string> = {}

    Object.keys(this.viewPathsManifest || {}).forEach((entry) => {
      viewPathRoutes[normalizeViewPath(entry)] = entry
    })
    return viewPathRoutes
  }

  protected getViewPathLayouts(pathname: string): string[] {
    const layoutPaths: string[] = []

    if (this.viewPathRoutes) {
      const paths = Object.values(this.viewPathRoutes)
      const parts = pathname.split('/').filter(Boolean)

      for (let i = 1; i < parts.length; i++) {
        const layoutPath = `/${parts.slice(0, i).join('/')}/layout`

        if (paths.includes(layoutPath)) {
          layoutPaths.push(layoutPath)
        }
      }

      if (this.viewPathRoutes['/layout']) {
        layoutPaths.unshift('/layout')
      }
    }
    return layoutPaths
  }

  protected async run(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl: UrlWithParsedQuery
  ): Promise<void> {
    this.handleCompression(req, res)

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
    partialContext: {
      req: BaseNextRequest
      res: BaseNextResponse
      pathname: string
      query: NextParsedUrlQuery
    }
  ): Promise<void> {
    const isBotRequest = isBot(partialContext.req.headers['user-agent'] || '')
    const ctx = {
      ...partialContext,
      renderOpts: {
        ...this.renderOpts,
        supportsDynamicHTML: !isBotRequest,
      },
    } as const
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
    partialContext: {
      req: BaseNextRequest
      res: BaseNextResponse
      pathname: string
      query: ParsedUrlQuery
    }
  ): Promise<string | null> {
    const payload = await fn({
      ...partialContext,
      renderOpts: {
        ...this.renderOpts,
        supportsDynamicHTML: false,
      },
    })
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
      !query._nextDataReq &&
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

  protected async getStaticPaths(pathname: string): Promise<{
    staticPaths: string[] | undefined
    fallbackMode: 'static' | 'blocking' | false
  }> {
    // `staticPaths` is intentionally set to `undefined` as it should've
    // been caught when checking disk data.
    const staticPaths = undefined

    // Read whether or not fallback should exist from the manifest.
    const fallbackField =
      this.getPrerenderManifest().dynamicRoutes[pathname].fallback

    return {
      staticPaths,
      fallbackMode:
        typeof fallbackField === 'string'
          ? 'static'
          : fallbackField === null
          ? 'blocking'
          : false,
    }
  }

  private async renderToResponseWithComponents(
    { req, res, pathname, renderOpts: opts }: RequestContext,
    { components, query }: FindComponentsResult
  ): Promise<ResponsePayload | null> {
    const is404Page = pathname === '/404'
    const is500Page = pathname === '/500'

    const isLikeServerless =
      typeof components.ComponentMod === 'object' &&
      typeof (components.ComponentMod as any).renderReqToHTML === 'function'
    const hasServerProps = !!components.getServerSideProps
    const hasStaticPaths = !!components.getStaticPaths
    const hasGetInitialProps = !!components.Component?.getInitialProps
    const isServerComponent = !!components.ComponentMod?.__next_rsc__
    const isSSG =
      !!components.getStaticProps ||
      // For static server component pages, we currently always consider them
      // as SSG since we also need to handle the next data (flight JSON).
      (isServerComponent &&
        !hasServerProps &&
        !hasGetInitialProps &&
        process.env.NEXT_RUNTIME !== 'edge')

    // Toggle whether or not this is a Data request
    const isDataReq =
      !!query._nextDataReq && (isSSG || hasServerProps || isServerComponent)

    delete query._nextDataReq

    // Don't delete query.__flight__ yet, it still needs to be used in renderToHTML later
    const isFlightRequest = Boolean(
      this.serverComponentManifest && query.__flight__
    )

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
        // When concurrent features is enabled, the built-in `Document`
        // component also supports dynamic HTML.
        (this.renderOpts.reactRoot &&
          NEXT_BUILTIN_DOCUMENT in components.Document)

      // Disable dynamic HTML in cases that we know it won't be generated,
      // so that we can continue generating a cache key when possible.
      opts.supportsDynamicHTML =
        !isSSG &&
        !isLikeServerless &&
        !isBotRequest &&
        !query.amp &&
        isSupportedDocument
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

    let isManualRevalidate = false
    let revalidateOnlyGenerated = false

    if (isSSG) {
      ;({ isManualRevalidate, revalidateOnlyGenerated } =
        checkIsManualRevalidate(req, this.renderOpts.previewProps))
    }

    // Compute the iSSG cache key. We use the rewroteUrl since
    // pages with fallback: false are allowed to be rewritten to
    // and we need to look up the path by the rewritten path
    let urlPathname = parseUrl(req.url || '').pathname || '/'

    let resolvedUrlPathname =
      getRequestMeta(req, '_nextRewroteUrl') || urlPathname

    urlPathname = removePathTrailingSlash(urlPathname)
    resolvedUrlPathname = normalizeLocalePath(
      removePathTrailingSlash(resolvedUrlPathname),
      this.nextConfig.i18n?.locales
    ).pathname

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
      isPreviewMode || !isSSG || opts.supportsDynamicHTML || isFlightRequest
        ? null // Preview mode, manual revalidate, flight request can bypass the cache
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

    const doRender: () => Promise<ResponseCacheEntry | null> = async () => {
      let pageData: any
      let body: RenderResult | null
      let sprRevalidate: number | false
      let isNotFound: boolean | undefined
      let isRedirect: boolean | undefined

      // handle serverless
      if (isLikeServerless) {
        const renderResult = await (
          components.ComponentMod as any
        ).renderReqToHTML(req, res, 'passthrough', {
          locale,
          locales,
          defaultLocale,
          optimizeCss: this.renderOpts.optimizeCss,
          nextScriptWorkers: this.renderOpts.nextScriptWorkers,
          distDir: this.distDir,
          fontManifest: this.renderOpts.fontManifest,
          domainLocales: this.renderOpts.domainLocales,
        })

        body = renderResult.html
        pageData = renderResult.renderOpts.pageData
        sprRevalidate = renderResult.renderOpts.revalidate
        isNotFound = renderResult.renderOpts.isNotFound
        isRedirect = renderResult.renderOpts.isRedirect
      } else {
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
        }

        const renderResult = await this.renderHTML(
          req,
          res,
          pathname,
          query,
          renderOpts
        )

        body = renderResult
        // TODO: change this to a different passing mechanism
        pageData = (renderOpts as any).pageData
        sprRevalidate = (renderOpts as any).revalidate
        isNotFound = (renderOpts as any).isNotFound
        isRedirect = (renderOpts as any).isRedirect
      }

      let value: ResponseCacheValue | null
      if (isNotFound) {
        value = null
      } else if (isRedirect) {
        value = { kind: 'REDIRECT', props: pageData }
      } else {
        if (!body) {
          return null
        }
        value = { kind: 'PAGE', html: body, pageData }
      }
      return { revalidate: sprRevalidate, value }
    }

    const cacheEntry = await this.responseCache.get(
      ssgCacheKey,
      async (hasResolved, hadCache) => {
        const isProduction = !this.renderOpts.dev
        const isDynamicPathname = isDynamicRoute(pathname)
        const didRespond = hasResolved || res.sent

        let { staticPaths, fallbackMode } = hasStaticPaths
          ? await this.getStaticPaths(pathname)
          : { staticPaths: undefined, fallbackMode: false }

        if (
          fallbackMode === 'static' &&
          isBot(req.headers['user-agent'] || '')
        ) {
          fallbackMode = 'blocking'
        }

        // skip manual revalidate if cache is not present and
        // revalidate-if-generated is set
        if (
          isManualRevalidate &&
          revalidateOnlyGenerated &&
          !hadCache &&
          !this.minimalMode
        ) {
          await this.render404(req, res)
          return null
        }

        // only allow manual revalidate for fallback: true/blocking
        // or for prerendered fallback: false paths
        if (isManualRevalidate && (fallbackMode !== false || hadCache)) {
          fallbackMode = 'blocking'
        }

        // When we did not respond from cache, we need to choose to block on
        // rendering or return a skeleton.
        //
        // * Data requests always block.
        //
        // * Blocking mode fallback always blocks.
        //
        // * Preview mode toggles all pages to be resolved in a blocking manner.
        //
        // * Non-dynamic pages should block (though this is an impossible
        //   case in production).
        //
        // * Dynamic pages should return their skeleton if not defined in
        //   getStaticPaths, then finish the data request on the client-side.
        //
        if (
          this.minimalMode !== true &&
          fallbackMode !== 'blocking' &&
          ssgCacheKey &&
          !didRespond &&
          !isPreviewMode &&
          isDynamicPathname &&
          // Development should trigger fallback when the path is not in
          // `getStaticPaths`
          (isProduction ||
            !staticPaths ||
            !staticPaths.includes(
              // we use ssgCacheKey here as it is normalized to match the
              // encoding from getStaticPaths along with including the locale
              query.amp ? ssgCacheKey.replace(/\.amp$/, '') : ssgCacheKey
            ))
        ) {
          if (
            // In development, fall through to render to handle missing
            // getStaticPaths.
            (isProduction || staticPaths) &&
            // When fallback isn't present, abort this render so we 404
            fallbackMode !== 'static'
          ) {
            throw new NoFallbackError()
          }

          if (!isDataReq) {
            // Production already emitted the fallback as static HTML.
            if (isProduction) {
              const html = await this.incrementalCache.getFallback(
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
              if (isLikeServerless) {
                prepareServerlessUrl(req, query)
              }
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
        isManualRevalidate,
      }
    )

    if (!cacheEntry) {
      if (ssgCacheKey && !(isManualRevalidate && revalidateOnlyGenerated)) {
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
        isManualRevalidate
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
        await this.render404(
          req,
          res,
          {
            pathname,
            query,
          } as UrlWithParsedQuery,
          false
        )
        return null
      }
    } else if (cachedData.kind === 'REDIRECT') {
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
    } else {
      return {
        type: isDataReq ? 'json' : 'html',
        body: isDataReq
          ? RenderResult.fromStatic(JSON.stringify(cachedData.pageData))
          : cachedData.html,
        revalidateOptions,
      }
    }
  }

  private stripNextDataPath(path: string) {
    if (path.includes(this.buildId)) {
      const splitPath = path.substring(
        path.indexOf(this.buildId) + this.buildId.length
      )

      path = denormalizePagePath(splitPath.replace(/\.json$/, ''))
    }

    if (this.nextConfig.i18n) {
      const { locales } = this.nextConfig.i18n
      return normalizeLocalePath(path, locales).pathname
    }
    return path
  }

  private async renderToResponse(
    ctx: RequestContext
  ): Promise<ResponsePayload | null> {
    const { res, query, pathname } = ctx
    let page = pathname
    const bubbleNoFallback = !!query._nextBubbleNoFallback
    delete query._nextBubbleNoFallback
    // map the route to the actual bundle name e.g.
    // `/dashboard/rootonly/hello` -> `/dashboard+rootonly/hello`
    const getOriginalViewPath = (viewPath: string) => {
      if (this.nextConfig.experimental.viewsDir) {
        const originalViewPath =
          this.viewPathRoutes?.[`${viewPath}/index`] ||
          this.viewPathRoutes?.[`${viewPath}`]

        if (!originalViewPath) {
          return null
        }

        return originalViewPath
      }
      return null
    }

    try {
      // Ensure a request to the URL /accounts/[id] will be treated as a dynamic
      // route correctly and not loaded immediately without parsing params.
      if (!isDynamicRoute(pathname)) {
        const viewPath = getOriginalViewPath(pathname)

        if (typeof viewPath === 'string') {
          page = viewPath
        }
        const result = await this.findPageComponents(page, query)
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
      }

      if (this.dynamicRoutes) {
        for (const dynamicRoute of this.dynamicRoutes) {
          const params = dynamicRoute.match(pathname)
          if (!params) {
            continue
          }
          page = dynamicRoute.page
          const viewPath = getOriginalViewPath(page)

          if (typeof viewPath === 'string') {
            page = viewPath
          }

          const dynamicRouteResult = await this.findPageComponents(
            page,
            query,
            params
          )
          if (dynamicRouteResult) {
            try {
              return await this.renderToResponseWithComponents(
                {
                  ...ctx,
                  pathname: page,
                  renderOpts: {
                    ...ctx.renderOpts,
                    params,
                  },
                },
                dynamicRouteResult
              )
            } catch (err) {
              const isNoFallbackError = err instanceof NoFallbackError

              if (
                !isNoFallbackError ||
                (isNoFallbackError && bubbleNoFallback)
              ) {
                throw err
              }
            }
          }
        }
      }
    } catch (error) {
      const err = getProperError(error)
      if (err instanceof NoFallbackError && bubbleNoFallback) {
        throw err
      }
      if (err instanceof DecodeError || err instanceof NormalizeError) {
        res.statusCode = 400
        return await this.renderErrorToResponse(ctx, err)
      }

      res.statusCode = 500
      const isWrappedError = err instanceof WrappedBuildError
      const response = await this.renderErrorToResponse(
        ctx,
        isWrappedError ? (err as WrappedBuildError).innerError : err
      )

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
      return response
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
    const { res, query } = ctx
    try {
      let result: null | FindComponentsResult = null

      const is404 = res.statusCode === 404
      let using404Page = false

      // use static 404 page if available and is 404 response
      if (is404) {
        result = await this.findPageComponents('/404', query)
        using404Page = result !== null
      }
      let statusPage = `/${res.statusCode}`

      if (!result && STATIC_STATUS_PAGES.includes(statusPage)) {
        result = await this.findPageComponents(statusPage, query)
      }

      if (!result) {
        result = await this.findPageComponents('/_error', query)
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
          result!
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

  protected getCacheFilesystem(): CacheFs {
    return {
      readFile: () => Promise.resolve(''),
      readFileSync: () => '',
      writeFile: () => Promise.resolve(),
      mkdir: () => Promise.resolve(),
      stat: () => Promise.resolve({ mtime: new Date() }),
    }
  }

  protected async getFallbackErrorComponents(): Promise<LoadComponentsReturnType | null> {
    // The development server will provide an implementation for this
    return null
  }

  public async render404(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl?: NextUrlWithParsedQuery,
    setHeaders = true
  ): Promise<void> {
    const { pathname, query }: NextUrlWithParsedQuery = parsedUrl
      ? parsedUrl
      : parseUrl(req.url!, true)

    if (this.nextConfig.i18n) {
      query.__nextLocale =
        query.__nextLocale || this.nextConfig.i18n.defaultLocale
      query.__nextDefaultLocale =
        query.__nextDefaultLocale || this.nextConfig.i18n.defaultLocale
    }

    res.statusCode = 404
    return this.renderError(null, req, res, pathname!, query, setHeaders)
  }

  protected get _isLikeServerless(): boolean {
    return isTargetLikeServerless(this.nextConfig.target)
  }

  protected get serverDistDir() {
    return join(
      this.distDir,
      this._isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY
    )
  }
}

export function prepareServerlessUrl(
  req: BaseNextRequest,
  query: ParsedUrlQuery
): void {
  const curUrl = parseUrl(req.url!, true)
  req.url = formatUrl({
    ...curUrl,
    search: undefined,
    query: {
      ...curUrl.query,
      ...query,
    },
  })
}

export { stringifyQuery } from './server-route-utils'

class NoFallbackError extends Error {}

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
  type: 'html' | 'json'
  body: RenderResult
  revalidateOptions?: any
}
