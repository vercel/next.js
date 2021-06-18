import compression from 'next/dist/compiled/compression'
import fs from 'fs'
import chalk from 'chalk'
import { IncomingMessage, ServerResponse } from 'http'
import Proxy from 'next/dist/compiled/http-proxy'
import { join, relative, resolve, sep } from 'path'
import {
  parse as parseQs,
  stringify as stringifyQs,
  ParsedUrlQuery,
} from 'querystring'
import { format as formatUrl, parse as parseUrl, UrlWithParsedQuery } from 'url'
import { PrerenderManifest } from '../../build'
import {
  getRedirectStatus,
  Header,
  Redirect,
  Rewrite,
  RouteType,
  CustomRoutes,
} from '../../lib/load-custom-routes'
import { withCoalescedInvoke } from '../../lib/coalesced-function'
import {
  BUILD_ID_FILE,
  CLIENT_PUBLIC_FILES_PATH,
  CLIENT_STATIC_FILES_PATH,
  CLIENT_STATIC_FILES_RUNTIME,
  PAGES_MANIFEST,
  PERMANENT_REDIRECT_STATUS,
  PRERENDER_MANIFEST,
  ROUTES_MANIFEST,
  SERVERLESS_DIRECTORY,
  SERVER_DIRECTORY,
  STATIC_STATUS_PAGES,
  TEMPORARY_REDIRECT_STATUS,
} from '../lib/constants'
import {
  getRouteMatcher,
  getRouteRegex,
  getSortedRoutes,
  isDynamicRoute,
} from '../lib/router/utils'
import * as envConfig from '../lib/runtime-config'
import { isResSent, NextApiRequest, NextApiResponse } from '../lib/utils'
import {
  apiResolver,
  setLazyProp,
  getCookieParser,
  tryGetPreviewData,
  __ApiPreviewProps,
} from './api-utils'
import { DomainLocales, isTargetLikeServerless, NextConfig } from './config'
import pathMatch from '../lib/router/utils/path-match'
import { recursiveReadDirSync } from './lib/recursive-readdir-sync'
import {
  loadComponents,
  LoadComponentsReturnType,
  loadDefaultErrorComponents,
} from './load-components'
import { normalizePagePath } from './normalize-page-path'
import { RenderOpts, RenderOptsPartial, renderToHTML } from './render'
import { getPagePath, requireFontManifest } from './require'
import Router, {
  DynamicRoutes,
  PageChecker,
  Params,
  route,
  Route,
} from './router'
import prepareDestination, {
  compileNonPath,
} from '../lib/router/utils/prepare-destination'
import { sendPayload, setRevalidateHeaders } from './send-payload'
import { serveStatic } from './serve-static'
import { IncrementalCache } from './incremental-cache'
import { execOnce } from '../lib/utils'
import { isBlockedPage } from './utils'
import { loadEnvConfig } from '@next/env'
import './node-polyfill-fetch'
import { PagesManifest } from '../../build/webpack/plugins/pages-manifest-plugin'
import { removePathTrailingSlash } from '../../client/normalize-trailing-slash'
import getRouteFromAssetPath from '../lib/router/utils/get-route-from-asset-path'
import { FontManifest } from './font-utils'
import { denormalizePagePath } from './denormalize-page-path'
import accept from '@hapi/accept'
import { normalizeLocalePath } from '../lib/i18n/normalize-locale-path'
import { detectLocaleCookie } from '../lib/i18n/detect-locale-cookie'
import * as Log from '../../build/output/log'
import { imageOptimizer } from './image-optimizer'
import { detectDomainLocale } from '../lib/i18n/detect-domain-locale'
import cookie from 'next/dist/compiled/cookie'
import escapePathDelimiters from '../lib/router/utils/escape-path-delimiters'
import { getUtils } from '../../build/webpack/loaders/next-serverless-loader/utils'
import { PreviewData } from 'next/types'
import HotReloader from '../../server/hot-reloader'

const getCustomRouteMatcher = pathMatch(true)

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: Error) => void
) => void

type FindComponentsResult = {
  components: LoadComponentsReturnType
  query: ParsedUrlQuery
}

type DynamicRouteItem = {
  page: string
  match: ReturnType<typeof getRouteMatcher>
}

export type ServerConstructor = {
  /**
   * Where the Next project is located - @default '.'
   */
  dir?: string
  /**
   * Hide error messages containing server information - @default false
   */
  quiet?: boolean
  /**
   * Object what you would use in next.config.js - @default {}
   */
  conf?: NextConfig | null
  dev?: boolean
  customServer?: boolean
}

export default class Server {
  protected dir: string
  protected quiet: boolean
  protected nextConfig: NextConfig
  protected distDir: string
  protected pagesDir?: string
  protected publicDir: string
  protected hasStaticDir: boolean
  protected serverBuildDir: string
  protected pagesManifest?: PagesManifest
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
    images: string
    fontManifest: FontManifest
    optimizeImages: boolean
    disableOptimizedLoading?: boolean
    optimizeCss: any
    locale?: string
    locales?: string[]
    defaultLocale?: string
    domainLocales?: DomainLocales
    distDir: string
  }
  private compression?: Middleware
  private incrementalCache: IncrementalCache
  protected router: Router
  protected dynamicRoutes?: DynamicRoutes
  protected customRoutes: CustomRoutes

  public constructor({
    dir = '.',
    quiet = false,
    conf,
    dev = false,
    minimalMode = false,
    customServer = true,
  }: ServerConstructor & { conf: NextConfig; minimalMode?: boolean }) {
    this.dir = resolve(dir)
    this.quiet = quiet
    loadEnvConfig(this.dir, dev, Log)

    this.nextConfig = conf
    this.distDir = join(this.dir, this.nextConfig.distDir)
    this.publicDir = join(this.dir, CLIENT_PUBLIC_FILES_PATH)
    this.hasStaticDir = !minimalMode && fs.existsSync(join(this.dir, 'static'))

    // Only serverRuntimeConfig needs the default
    // publicRuntimeConfig gets it's default in client/index.js
    const {
      serverRuntimeConfig = {},
      publicRuntimeConfig,
      assetPrefix,
      generateEtags,
      compress,
    } = this.nextConfig

    this.buildId = this.readBuildId()
    this.minimalMode = minimalMode

    this.renderOpts = {
      poweredByHeader: this.nextConfig.poweredByHeader,
      canonicalBase: this.nextConfig.amp.canonicalBase,
      buildId: this.buildId,
      generateEtags,
      previewProps: this.getPreviewProps(),
      customServer: customServer === true ? true : undefined,
      ampOptimizerConfig: this.nextConfig.experimental.amp?.optimizer,
      basePath: this.nextConfig.basePath,
      images: JSON.stringify(this.nextConfig.images),
      optimizeFonts: !!this.nextConfig.optimizeFonts && !dev,
      fontManifest:
        this.nextConfig.optimizeFonts && !dev
          ? requireFontManifest(this.distDir, this._isLikeServerless)
          : null,
      optimizeImages: !!this.nextConfig.experimental.optimizeImages,
      optimizeCss: this.nextConfig.experimental.optimizeCss,
      disableOptimizedLoading: this.nextConfig.experimental
        .disableOptimizedLoading,
      domainLocales: this.nextConfig.i18n?.domains,
      distDir: this.distDir,
    }

    // Only the `publicRuntimeConfig` key is exposed to the client side
    // It'll be rendered as part of __NEXT_DATA__ on the client side
    if (Object.keys(publicRuntimeConfig).length > 0) {
      this.renderOpts.runtimeConfig = publicRuntimeConfig
    }

    if (compress && this.nextConfig.target === 'server') {
      this.compression = compression() as Middleware
    }

    // Initialize next/config with the environment configuration
    envConfig.setConfig({
      serverRuntimeConfig,
      publicRuntimeConfig,
    })

    this.serverBuildDir = join(
      this.distDir,
      this._isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY
    )
    const pagesManifestPath = join(this.serverBuildDir, PAGES_MANIFEST)

    if (!dev) {
      this.pagesManifest = require(pagesManifestPath)
    }

    this.customRoutes = this.getCustomRoutes()
    this.router = new Router(this.generateRoutes())
    this.setAssetPrefix(assetPrefix)

    this.incrementalCache = new IncrementalCache({
      dev,
      distDir: this.distDir,
      pagesDir: join(
        this.distDir,
        this._isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY,
        'pages'
      ),
      locales: this.nextConfig.i18n?.locales,
      flushToDisk: !minimalMode && this.nextConfig.experimental.sprFlushToDisk,
    })

    /**
     * This sets environment variable to be used at the time of SSR by head.tsx.
     * Using this from process.env allows targeting both serverless and SSR by calling
     * `process.env.__NEXT_OPTIMIZE_IMAGES`.
     * TODO(atcastle@): Remove this when experimental.optimizeImages are being cleaned up.
     */
    if (this.renderOpts.optimizeFonts) {
      process.env.__NEXT_OPTIMIZE_FONTS = JSON.stringify(true)
    }
    if (this.renderOpts.optimizeImages) {
      process.env.__NEXT_OPTIMIZE_IMAGES = JSON.stringify(true)
    }
    if (this.renderOpts.optimizeCss) {
      process.env.__NEXT_OPTIMIZE_CSS = JSON.stringify(true)
    }
  }

  public logError(err: Error): void {
    if (this.quiet) return
    console.error(err)
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl?: UrlWithParsedQuery
  ): Promise<void> {
    setLazyProp({ req: req as any }, 'cookies', getCookieParser(req))

    // Parse url if parsedUrl not provided
    if (!parsedUrl || typeof parsedUrl !== 'object') {
      const url: any = req.url
      parsedUrl = parseUrl(url, true)
    }
    const { basePath, i18n } = this.nextConfig

    // Parse the querystring ourselves if the user doesn't handle querystring parsing
    if (typeof parsedUrl.query === 'string') {
      parsedUrl.query = parseQs(parsedUrl.query)
    }
    ;(req as any).__NEXT_INIT_QUERY = Object.assign({}, parsedUrl.query)

    if (basePath && req.url?.startsWith(basePath)) {
      // store original URL to allow checking if basePath was
      // provided or not
      ;(req as any)._nextHadBasePath = true
      req.url = req.url!.replace(basePath, '') || '/'
    }

    if (
      this.minimalMode &&
      req.headers['x-matched-path'] &&
      typeof req.headers['x-matched-path'] === 'string'
    ) {
      const reqUrlIsDataUrl = req.url?.includes('/_next/data')
      const matchedPathIsDataUrl = req.headers['x-matched-path']?.includes(
        '/_next/data'
      )
      const isDataUrl = reqUrlIsDataUrl || matchedPathIsDataUrl

      let parsedPath = parseUrl(
        isDataUrl ? req.url! : (req.headers['x-matched-path'] as string),
        true
      )
      const { pathname, query } = parsedPath
      let matchedPathname = pathname as string

      let matchedPathnameNoExt = isDataUrl
        ? matchedPathname.replace(/\.json$/, '')
        : matchedPathname

      if (i18n) {
        const localePathResult = normalizeLocalePath(
          matchedPathname || '/',
          i18n.locales
        )

        if (localePathResult.detectedLocale) {
          parsedUrl.query.__nextLocale = localePathResult.detectedLocale
        }
      }

      if (isDataUrl) {
        matchedPathname = denormalizePagePath(matchedPathname)
        matchedPathnameNoExt = denormalizePagePath(matchedPathnameNoExt)
      }

      const pageIsDynamic = isDynamicRoute(matchedPathnameNoExt)
      const combinedRewrites: Rewrite[] = []

      combinedRewrites.push(...this.customRoutes.rewrites.beforeFiles)
      combinedRewrites.push(...this.customRoutes.rewrites.afterFiles)
      combinedRewrites.push(...this.customRoutes.rewrites.fallback)

      const utils = getUtils({
        pageIsDynamic,
        page: matchedPathnameNoExt,
        i18n: this.nextConfig.i18n,
        basePath: this.nextConfig.basePath,
        rewrites: combinedRewrites,
      })

      utils.handleRewrites(req, parsedUrl)

      // interpolate dynamic params and normalize URL if needed
      if (pageIsDynamic) {
        let params: ParsedUrlQuery | false = {}

        Object.assign(parsedUrl.query, query)
        const paramsResult = utils.normalizeDynamicRouteParams(parsedUrl.query)

        if (paramsResult.hasValidParams) {
          params = paramsResult.params
        } else if (req.headers['x-now-route-matches']) {
          const opts: Record<string, string> = {}
          params = utils.getParamsFromRouteMatches(
            req,
            opts,
            (parsedUrl.query.__nextLocale as string | undefined) || ''
          )

          if (opts.locale) {
            parsedUrl.query.__nextLocale = opts.locale
          }
        } else {
          params = utils.dynamicRouteMatcher!(matchedPathnameNoExt)
        }

        if (params) {
          params = utils.normalizeDynamicRouteParams(params).params

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
        utils.normalizeVercelUrl(req, true)
      }

      parsedUrl.pathname = `${basePath || ''}${
        matchedPathname === '/' && basePath ? '' : matchedPathname
      }`
    }

    if (i18n) {
      // get pathname from URL with basePath stripped for locale detection
      let { pathname, ...parsed } = parseUrl(req.url || '/')
      pathname = pathname || '/'

      let defaultLocale = i18n.defaultLocale
      let detectedLocale = detectLocaleCookie(req, i18n.locales)
      let acceptPreferredLocale =
        i18n.localeDetection !== false
          ? accept.language(req.headers['accept-language'], i18n.locales)
          : detectedLocale

      const { host } = req?.headers || {}
      // remove port from host if present
      const hostname = host?.split(':')[0].toLowerCase()

      const detectedDomain = detectDomainLocale(i18n.domains, hostname)
      if (detectedDomain) {
        defaultLocale = detectedDomain.defaultLocale
        detectedLocale = defaultLocale
        ;(req as any).__nextIsLocaleDomain = true
      }

      // if not domain specific locale use accept-language preferred
      detectedLocale = detectedLocale || acceptPreferredLocale

      let localeDomainRedirect: string | undefined
      ;(req as any).__nextHadTrailingSlash = pathname!.endsWith('/')

      if (pathname === '/') {
        ;(req as any).__nextHadTrailingSlash = this.nextConfig.trailingSlash
      }
      const localePathResult = normalizeLocalePath(pathname!, i18n.locales)

      if (localePathResult.detectedLocale) {
        detectedLocale = localePathResult.detectedLocale
        req.url = formatUrl({
          ...parsed,
          pathname: localePathResult.pathname,
        })
        ;(req as any).__nextStrippedLocale = true
      }

      // If a detected locale is a domain specific locale and we aren't already
      // on that domain and path prefix redirect to it to prevent duplicate
      // content from multiple domains
      if (detectedDomain && pathname === '/') {
        const localeToCheck = acceptPreferredLocale
        // const localeToCheck = localePathResult.detectedLocale
        //   ? detectedLocale
        //   : acceptPreferredLocale

        const matchedDomain = detectDomainLocale(
          i18n.domains,
          undefined,
          localeToCheck
        )

        if (
          matchedDomain &&
          (matchedDomain.domain !== detectedDomain.domain ||
            localeToCheck !== matchedDomain.defaultLocale)
        ) {
          localeDomainRedirect = `http${matchedDomain.http ? '' : 's'}://${
            matchedDomain.domain
          }/${
            localeToCheck === matchedDomain.defaultLocale ? '' : localeToCheck
          }`
        }
      }

      const denormalizedPagePath = denormalizePagePath(pathname || '/')
      const detectedDefaultLocale =
        !detectedLocale ||
        detectedLocale.toLowerCase() === defaultLocale.toLowerCase()
      const shouldStripDefaultLocale = false
      // detectedDefaultLocale &&
      // denormalizedPagePath.toLowerCase() ===
      //   `/${i18n.defaultLocale.toLowerCase()}`

      const shouldAddLocalePrefix =
        !detectedDefaultLocale && denormalizedPagePath === '/'

      detectedLocale = detectedLocale || i18n.defaultLocale

      if (
        i18n.localeDetection !== false &&
        (localeDomainRedirect ||
          shouldAddLocalePrefix ||
          shouldStripDefaultLocale)
      ) {
        // set the NEXT_LOCALE cookie when a user visits the default locale
        // with the locale prefix so that they aren't redirected back to
        // their accept-language preferred locale
        if (
          shouldStripDefaultLocale &&
          acceptPreferredLocale !== defaultLocale
        ) {
          const previous = res.getHeader('set-cookie')

          res.setHeader('set-cookie', [
            ...(typeof previous === 'string'
              ? [previous]
              : Array.isArray(previous)
              ? previous
              : []),
            cookie.serialize('NEXT_LOCALE', defaultLocale, {
              httpOnly: true,
              path: '/',
            }),
          ])
        }

        res.setHeader(
          'Location',
          localeDomainRedirect
            ? localeDomainRedirect
            : formatUrl({
                // make sure to include any query values when redirecting
                ...parsed,
                pathname: shouldStripDefaultLocale
                  ? basePath || `/`
                  : `${basePath || ''}/${detectedLocale}`,
              })
        )
        res.statusCode = TEMPORARY_REDIRECT_STATUS
        res.end()
        return
      }

      parsedUrl.query.__nextDefaultLocale =
        detectedDomain?.defaultLocale || i18n.defaultLocale

      if (!this.minimalMode || !parsedUrl.query.__nextLocale) {
        parsedUrl.query.__nextLocale =
          localePathResult.detectedLocale ||
          detectedDomain?.defaultLocale ||
          defaultLocale
      }
    }

    res.statusCode = 200
    try {
      return await this.run(req, res, parsedUrl)
    } catch (err) {
      if (this.minimalMode) {
        throw err
      }
      this.logError(err)
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  }

  public getRequestHandler() {
    return this.handleRequest.bind(this)
  }

  public setAssetPrefix(prefix?: string): void {
    this.renderOpts.assetPrefix = prefix ? prefix.replace(/\/$/, '') : ''
  }

  // Backwards compatibility
  public async prepare(): Promise<void> {}

  // Backwards compatibility
  protected async close(): Promise<void> {}

  protected setImmutableAssetCacheControl(res: ServerResponse): void {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  }

  protected getCustomRoutes(): CustomRoutes {
    const customRoutes = require(join(this.distDir, ROUTES_MANIFEST))
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

  private _cachedPreviewManifest: PrerenderManifest | undefined
  protected getPrerenderManifest(): PrerenderManifest {
    if (this._cachedPreviewManifest) {
      return this._cachedPreviewManifest
    }
    const manifest = require(join(this.distDir, PRERENDER_MANIFEST))
    return (this._cachedPreviewManifest = manifest)
  }

  protected getPreviewProps(): __ApiPreviewProps {
    return this.getPrerenderManifest().preview
  }

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
    pageChecker: PageChecker
    useFileSystemPublicRoutes: boolean
    dynamicRoutes: DynamicRoutes | undefined
    locales: string[]
  } {
    const server: Server = this
    const publicRoutes = fs.existsSync(this.publicDir)
      ? this.generatePublicRoutes()
      : []

    const staticFilesRoute = this.hasStaticDir
      ? [
          {
            // It's very important to keep this route's param optional.
            // (but it should support as many params as needed, separated by '/')
            // Otherwise this will lead to a pretty simple DOS attack.
            // See more: https://github.com/vercel/next.js/issues/2617
            match: route('/static/:path*'),
            name: 'static catchall',
            fn: async (req, res, params, parsedUrl) => {
              const p = join(this.dir, 'static', ...params.path)
              await this.serveStatic(req, res, p, parsedUrl)
              return {
                finished: true,
              }
            },
          } as Route,
        ]
      : []

    const fsRoutes: Route[] = [
      {
        match: route('/_next/static/:path*'),
        type: 'route',
        name: '_next/static catchall',
        fn: async (req, res, params, parsedUrl) => {
          // make sure to 404 for /_next/static itself
          if (!params.path) {
            await this.render404(req, res, parsedUrl)
            return {
              finished: true,
            }
          }

          if (
            params.path[0] === CLIENT_STATIC_FILES_RUNTIME ||
            params.path[0] === 'chunks' ||
            params.path[0] === 'css' ||
            params.path[0] === 'media' ||
            params.path[0] === this.buildId ||
            params.path[0] === 'pages' ||
            params.path[1] === 'pages'
          ) {
            this.setImmutableAssetCacheControl(res)
          }
          const p = join(
            this.distDir,
            CLIENT_STATIC_FILES_PATH,
            ...(params.path || [])
          )
          await this.serveStatic(req, res, p, parsedUrl)
          return {
            finished: true,
          }
        },
      },
      {
        match: route('/_next/data/:path*'),
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

          // show 404 if it doesn't end with .json
          if (!params.path[params.path.length - 1].endsWith('.json')) {
            await this.render404(req, res, _parsedUrl)
            return {
              finished: true,
            }
          }

          // re-create page's pathname
          let pathname = `/${params.path.join('/')}`
          pathname = getRouteFromAssetPath(pathname, '.json')

          const { i18n } = this.nextConfig

          if (i18n) {
            const { host } = req?.headers || {}
            // remove port from host and remove port if present
            const hostname = host?.split(':')[0].toLowerCase()
            const localePathResult = normalizeLocalePath(pathname, i18n.locales)
            const { defaultLocale } =
              detectDomainLocale(i18n.domains, hostname) || {}

            let detectedLocale = ''

            if (localePathResult.detectedLocale) {
              pathname = localePathResult.pathname
              detectedLocale = localePathResult.detectedLocale
            }

            _parsedUrl.query.__nextLocale = detectedLocale!
            _parsedUrl.query.__nextDefaultLocale =
              defaultLocale || i18n.defaultLocale

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
            parsedUrl
          )
          return {
            finished: true,
          }
        },
      },
      {
        match: route('/_next/image'),
        type: 'route',
        name: '_next/image catchall',
        fn: (req, res, _params, parsedUrl) =>
          imageOptimizer(
            server,
            req,
            res,
            parsedUrl,
            server.nextConfig,
            server.distDir
          ),
      },
      {
        match: route('/_next/:path*'),
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
      ...staticFilesRoute,
    ]

    const getCustomRoute = (
      r: Rewrite | Redirect | Header,
      type: RouteType
    ) => {
      const match = getCustomRouteMatcher(r.source)

      return {
        ...r,
        type,
        match,
        name: type,
        fn: async (_req, _res, _params, _parsedUrl) => ({ finished: false }),
      } as Route & Rewrite & Header
    }

    // Headers come very first
    const headers = this.minimalMode
      ? []
      : this.customRoutes.headers.map((r) => {
          const headerRoute = getCustomRoute(r, 'header')
          return {
            match: headerRoute.match,
            has: headerRoute.has,
            type: headerRoute.type,
            name: `${headerRoute.type} ${headerRoute.source} header route`,
            fn: async (_req, res, params, _parsedUrl) => {
              const hasParams = Object.keys(params).length > 0

              for (const header of (headerRoute as Header).headers) {
                let { key, value } = header
                if (hasParams) {
                  key = compileNonPath(key, params)
                  value = compileNonPath(value, params)
                }
                res.setHeader(key, value)
              }
              return { finished: false }
            },
          } as Route
        })

    // since initial query values are decoded by querystring.parse
    // we need to re-encode them here but still allow passing through
    // values from rewrites/redirects
    const stringifyQuery = (req: IncomingMessage, query: ParsedUrlQuery) => {
      const initialQueryValues = Object.values((req as any).__NEXT_INIT_QUERY)

      return stringifyQs(query, undefined, undefined, {
        encodeURIComponent(value) {
          if (initialQueryValues.some((val) => val === value)) {
            return encodeURIComponent(value)
          }
          return value
        },
      })
    }

    const redirects = this.minimalMode
      ? []
      : this.customRoutes.redirects.map((redirect) => {
          const redirectRoute = getCustomRoute(redirect, 'redirect')
          return {
            internal: redirectRoute.internal,
            type: redirectRoute.type,
            match: redirectRoute.match,
            has: redirectRoute.has,
            statusCode: redirectRoute.statusCode,
            name: `Redirect route ${redirectRoute.source}`,
            fn: async (req, res, params, parsedUrl) => {
              const { parsedDestination } = prepareDestination(
                redirectRoute.destination,
                params,
                parsedUrl.query,
                false
              )

              const { query } = parsedDestination
              delete (parsedDestination as any).query

              parsedDestination.search = stringifyQuery(req, query)

              const updatedDestination = formatUrl(parsedDestination)

              res.setHeader('Location', updatedDestination)
              res.statusCode = getRedirectStatus(redirectRoute as Redirect)

              // Since IE11 doesn't support the 308 header add backwards
              // compatibility using refresh header
              if (res.statusCode === 308) {
                res.setHeader('Refresh', `0;url=${updatedDestination}`)
              }

              res.end()
              return {
                finished: true,
              }
            },
          } as Route
        })

    const buildRewrite = (rewrite: Rewrite, check = true) => {
      const rewriteRoute = getCustomRoute(rewrite, 'rewrite')
      return {
        ...rewriteRoute,
        check,
        type: rewriteRoute.type,
        name: `Rewrite route ${rewriteRoute.source}`,
        match: rewriteRoute.match,
        fn: async (req, res, params, parsedUrl) => {
          const { newUrl, parsedDestination } = prepareDestination(
            rewriteRoute.destination,
            params,
            parsedUrl.query,
            true
          )

          // external rewrite, proxy it
          if (parsedDestination.protocol) {
            const { query } = parsedDestination
            delete (parsedDestination as any).query
            parsedDestination.search = stringifyQuery(req, query)

            const target = formatUrl(parsedDestination)
            const proxy = new Proxy({
              target,
              changeOrigin: true,
              ignorePath: true,
              proxyTimeout: 30_000, // limit proxying to 30 seconds
            })

            await new Promise((proxyResolve, proxyReject) => {
              let finished = false

              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.on('close', () => {
                  if (!finished) {
                    finished = true
                    proxyResolve(true)
                  }
                })
              })
              proxy.on('error', (err) => {
                if (!finished) {
                  finished = true
                  proxyReject(err)
                }
              })
              proxy.web(req, res)
            })

            return {
              finished: true,
            }
          }
          ;(req as any)._nextRewroteUrl = newUrl
          ;(req as any)._nextDidRewrite =
            (req as any)._nextRewroteUrl !== req.url

          return {
            finished: false,
            pathname: newUrl,
            query: parsedDestination.query,
          }
        },
      } as Route
    }

    let beforeFiles: Route[] = []
    let afterFiles: Route[] = []
    let fallback: Route[] = []

    if (!this.minimalMode) {
      if (Array.isArray(this.customRoutes.rewrites)) {
        afterFiles = this.customRoutes.rewrites.map((r) => buildRewrite(r))
      } else {
        beforeFiles = this.customRoutes.rewrites.beforeFiles.map((r) =>
          buildRewrite(r, false)
        )
        afterFiles = this.customRoutes.rewrites.afterFiles.map((r) =>
          buildRewrite(r)
        )
        fallback = this.customRoutes.rewrites.fallback.map((r) =>
          buildRewrite(r)
        )
      }
    }

    const catchAllRoute: Route = {
      match: route('/:path*'),
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

        if (pathname === '/api' || pathname.startsWith('/api/')) {
          delete query._nextBubbleNoFallback

          const handled = await this.handleApiRequest(
            req as NextApiRequest,
            res as NextApiResponse,
            pathname,
            query
          )
          if (handled) {
            return { finished: true }
          }
        }

        try {
          await this.render(req, res, pathname, query, parsedUrl)

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
      this.dynamicRoutes = this.getDynamicRoutes()
    }

    return {
      headers,
      fsRoutes,
      rewrites: {
        beforeFiles,
        afterFiles,
        fallback,
      },
      redirects,
      catchAllRoute,
      useFileSystemPublicRoutes,
      dynamicRoutes: this.dynamicRoutes,
      basePath: this.nextConfig.basePath,
      pageChecker: this.hasPage.bind(this),
      locales: this.nextConfig.i18n?.locales || [],
    }
  }

  private async getPagePath(
    pathname: string,
    locales?: string[]
  ): Promise<string> {
    return getPagePath(
      pathname,
      this.distDir,
      this._isLikeServerless,
      this.renderOpts.dev,
      locales
    )
  }

  protected async hasPage(pathname: string): Promise<boolean> {
    let found = false
    try {
      found = !!(await this.getPagePath(
        pathname,
        this.nextConfig.i18n?.locales
      ))
    } catch (_) {}

    return found
  }

  protected async _beforeCatchAllRender(
    _req: IncomingMessage,
    _res: ServerResponse,
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
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    query: ParsedUrlQuery
  ): Promise<boolean> {
    let page = pathname
    let params: Params | boolean = false
    let pageFound = await this.hasPage(page)

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
      builtPagePath = await this.getPagePath(page)
    } catch (err) {
      if (err.code === 'ENOENT') {
        return false
      }
      throw err
    }

    const pageModule = await require(builtPagePath)
    query = { ...query, ...params }

    delete query.__nextLocale
    delete query.__nextDefaultLocale

    if (!this.renderOpts.dev && this._isLikeServerless) {
      if (typeof pageModule.default === 'function') {
        prepareServerlessUrl(req, query)
        await pageModule.default(req, res)
        return true
      }
    }

    await apiResolver(
      req,
      res,
      query,
      pageModule,
      this.renderOpts.previewProps,
      false
    )
    return true
  }

  protected generatePublicRoutes(): Route[] {
    const publicFiles = new Set(
      recursiveReadDirSync(this.publicDir).map((p) =>
        encodeURI(p.replace(/\\/g, '/'))
      )
    )

    return [
      {
        match: route('/:path*'),
        name: 'public folder catchall',
        fn: async (req, res, params, parsedUrl) => {
          const pathParts: string[] = params.path || []
          const { basePath } = this.nextConfig

          // if basePath is defined require it be present
          if (basePath) {
            const basePathParts = basePath.split('/')
            // remove first empty value
            basePathParts.shift()

            if (
              !basePathParts.every((part: string, idx: number) => {
                return part === pathParts[idx]
              })
            ) {
              return { finished: false }
            }

            pathParts.splice(0, basePathParts.length)
          }

          const path = `/${pathParts.join('/')}`

          if (publicFiles.has(path)) {
            await this.serveStatic(
              req,
              res,
              join(this.publicDir, ...pathParts),
              parsedUrl
            )
            return {
              finished: true,
            }
          }
          return {
            finished: false,
          }
        },
      } as Route,
    ]
  }

  protected getDynamicRoutes(): Array<DynamicRouteItem> {
    const addedPages = new Set<string>()

    return getSortedRoutes(
      Object.keys(this.pagesManifest!).map(
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
      .filter((item): item is DynamicRouteItem => Boolean(item))
  }

  private handleCompression(req: IncomingMessage, res: ServerResponse): void {
    if (this.compression) {
      this.compression(req, res, () => {})
    }
  }

  protected async run(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: UrlWithParsedQuery
  ): Promise<void> {
    this.handleCompression(req, res)

    try {
      const matched = await this.router.execute(req, res, parsedUrl)
      if (matched) {
        return
      }
    } catch (err) {
      if (err.code === 'DECODE_FAILED' || err.code === 'ENAMETOOLONG') {
        res.statusCode = 400
        return this.renderError(null, req, res, '/_error', {})
      }
      throw err
    }

    await this.render404(req, res, parsedUrl)
  }

  protected async sendHTML(
    req: IncomingMessage,
    res: ServerResponse,
    html: string
  ): Promise<void> {
    const { generateEtags, poweredByHeader } = this.renderOpts
    return sendPayload(req, res, html, 'html', {
      generateEtags,
      poweredByHeader,
    })
  }

  public async render(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    query: ParsedUrlQuery = {},
    parsedUrl?: UrlWithParsedQuery
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

    const url: any = req.url

    // we allow custom servers to call render for all URLs
    // so check if we need to serve a static _next file or not.
    // we don't modify the URL for _next/data request but still
    // call render so we special case this to prevent an infinite loop
    if (
      !this.minimalMode &&
      !query._nextDataReq &&
      (url.match(/^\/_next\//) ||
        (this.hasStaticDir && url.match(/^\/static\//)))
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

    const html = await this.renderToHTML(req, res, pathname, query)
    // Request was ended by the user
    if (html === null) {
      return
    }

    return this.sendHTML(req, res, html)
  }

  private async findPageComponents(
    pathname: string,
    query: ParsedUrlQuery = {},
    params: Params | null = null
  ): Promise<FindComponentsResult | null> {
    let paths = [
      // try serving a static AMP version first
      query.amp ? normalizePagePath(pathname) + '.amp' : null,
      pathname,
    ].filter(Boolean)

    if (query.__nextLocale) {
      paths = [
        ...paths.map(
          (path) => `/${query.__nextLocale}${path === '/' ? '' : path}`
        ),
        ...paths,
      ]
    }

    for (const pagePath of paths) {
      try {
        const components = await loadComponents(
          this.distDir,
          pagePath!,
          !this.renderOpts.dev && this._isLikeServerless
        )
        // if loading an static HTML file the locale is required
        // to be present since all HTML files are output under their locale
        if (
          query.__nextLocale &&
          typeof components.Component === 'string' &&
          !pagePath?.startsWith(`/${query.__nextLocale}`)
        ) {
          const err = new Error('NOT_FOUND')
          ;(err as any).code = 'ENOENT'
          throw err
        }

        return {
          components,
          query: {
            ...(components.getStaticProps
              ? {
                  amp: query.amp,
                  _nextDataReq: query._nextDataReq,
                  __nextLocale: query.__nextLocale,
                  __nextDefaultLocale: query.__nextDefaultLocale,
                }
              : query),
            ...(params || {}),
          },
        }
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
    }
    return null
  }

  protected async getStaticPaths(
    pathname: string
  ): Promise<{
    staticPaths: string[] | undefined
    fallbackMode: 'static' | 'blocking' | false
  }> {
    // `staticPaths` is intentionally set to `undefined` as it should've
    // been caught when checking disk data.
    const staticPaths = undefined

    // Read whether or not fallback should exist from the manifest.
    const fallbackField = this.getPrerenderManifest().dynamicRoutes[pathname]
      .fallback

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

  private async renderToHTMLWithComponents(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    { components, query }: FindComponentsResult,
    opts: RenderOptsPartial
  ): Promise<string | null> {
    const is404Page = pathname === '/404'
    const is500Page = pathname === '/500'

    const isLikeServerless =
      typeof components.Component === 'object' &&
      typeof (components.Component as any).renderReqToHTML === 'function'
    const isSSG = !!components.getStaticProps
    const hasServerProps = !!components.getServerSideProps
    const hasStaticPaths = !!components.getStaticPaths
    const hasGetInitialProps = !!(components.Component as any).getInitialProps

    // Toggle whether or not this is a Data request
    const isDataReq = !!query._nextDataReq && (isSSG || hasServerProps)
    delete query._nextDataReq

    // we need to ensure the status code if /404 is visited directly
    if (is404Page && !isDataReq) {
      res.statusCode = 404
    }

    // ensure correct status is set when visiting a status page
    // directly e.g. /500
    if (STATIC_STATUS_PAGES.includes(pathname)) {
      res.statusCode = parseInt(pathname.substr(1), 10)
    }

    // handle static page
    if (typeof components.Component === 'string') {
      return components.Component
    }

    if (!query.amp) {
      delete query.amp
    }

    const locale = query.__nextLocale as string
    const defaultLocale = isSSG
      ? this.nextConfig.i18n?.defaultLocale
      : (query.__nextDefaultLocale as string)

    const { i18n } = this.nextConfig
    const locales = i18n?.locales

    let previewData: PreviewData
    let isPreviewMode = false

    if (hasServerProps || isSSG) {
      previewData = tryGetPreviewData(req, res, this.renderOpts.previewProps)
      isPreviewMode = previewData !== false
    }

    // Compute the iSSG cache key. We use the rewroteUrl since
    // pages with fallback: false are allowed to be rewritten to
    // and we need to look up the path by the rewritten path
    let urlPathname = parseUrl(req.url || '').pathname || '/'

    let resolvedUrlPathname = (req as any)._nextRewroteUrl
      ? (req as any)._nextRewroteUrl
      : urlPathname

    urlPathname = removePathTrailingSlash(urlPathname)
    resolvedUrlPathname = normalizeLocalePath(
      removePathTrailingSlash(resolvedUrlPathname),
      this.nextConfig.i18n?.locales
    ).pathname

    const stripNextDataPath = (path: string) => {
      if (path.includes(this.buildId)) {
        const splitPath = path.substring(
          path.indexOf(this.buildId) + this.buildId.length
        )

        path = denormalizePagePath(splitPath.replace(/\.json$/, ''))
      }

      if (this.nextConfig.i18n) {
        return normalizeLocalePath(path, locales).pathname
      }
      return path
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

      if (statusCode === PERMANENT_REDIRECT_STATUS) {
        res.setHeader('Refresh', `0;url=${redirect.destination}`)
      }

      res.statusCode = statusCode
      res.setHeader('Location', redirect.destination)
      res.end()
    }

    // remove /_next/data prefix from urlPathname so it matches
    // for direct page visit and /_next/data visit
    if (isDataReq) {
      resolvedUrlPathname = stripNextDataPath(resolvedUrlPathname)
      urlPathname = stripNextDataPath(urlPathname)
    }

    let ssgCacheKey =
      isPreviewMode || !isSSG || this.minimalMode
        ? undefined // Preview mode bypasses the cache
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
            // An improperly encoded URL was provided, this is considered
            // a bad request (400)
            const err: Error & { code?: string } = new Error(
              'failed to decode param'
            )
            err.code = 'DECODE_FAILED'
            throw err
          }
          return seg
        })
        .join('/')
    }

    // Complete the response with cached data if its present
    const cachedData = ssgCacheKey
      ? await this.incrementalCache.get(ssgCacheKey)
      : undefined

    if (cachedData) {
      const data = isDataReq
        ? JSON.stringify(cachedData.pageData)
        : cachedData.html

      const revalidateOptions = !this.renderOpts.dev
        ? {
            private: isPreviewMode,
            stateful: false, // GSP response
            revalidate:
              cachedData.curRevalidate !== undefined
                ? cachedData.curRevalidate
                : /* default to minimum revalidate (this should be an invariant) */ 1,
          }
        : undefined

      if (!isDataReq && cachedData.pageData?.pageProps?.__N_REDIRECT) {
        await handleRedirect(cachedData.pageData)
      } else if (cachedData.isNotFound) {
        if (revalidateOptions) {
          setRevalidateHeaders(res, revalidateOptions)
        }
        if (isDataReq) {
          res.statusCode = 404
          res.end('{"notFound":true}')
        } else {
          await this.render404(req, res, {
            pathname,
            query,
          } as UrlWithParsedQuery)
        }
      } else {
        sendPayload(
          req,
          res,
          data,
          isDataReq ? 'json' : 'html',
          {
            generateEtags: this.renderOpts.generateEtags,
            poweredByHeader: this.renderOpts.poweredByHeader,
          },
          revalidateOptions
        )
      }

      // Stop the request chain here if the data we sent was up-to-date
      if (!cachedData.isStale) {
        return null
      }
    }

    // If we're here, that means data is missing or it's stale.
    const maybeCoalesceInvoke = ssgCacheKey
      ? (fn: any) => withCoalescedInvoke(fn).bind(null, ssgCacheKey!, [])
      : (fn: any) => async () => {
          const value = await fn()
          return { isOrigin: true, value }
        }

    const doRender = maybeCoalesceInvoke(
      async (): Promise<{
        html: string | null
        pageData: any
        sprRevalidate: number | false
        isNotFound?: boolean
        isRedirect?: boolean
      }> => {
        let pageData: any
        let html: string | null
        let sprRevalidate: number | false
        let isNotFound: boolean | undefined
        let isRedirect: boolean | undefined

        let renderResult
        // handle serverless
        if (isLikeServerless) {
          renderResult = await (components.Component as any).renderReqToHTML(
            req,
            res,
            'passthrough',
            {
              locale,
              locales,
              defaultLocale,
              optimizeCss: this.renderOpts.optimizeCss,
              distDir: this.distDir,
              fontManifest: this.renderOpts.fontManifest,
              domainLocales: this.renderOpts.domainLocales,
            }
          )

          html = renderResult.html
          pageData = renderResult.renderOpts.pageData
          sprRevalidate = renderResult.renderOpts.revalidate
          isNotFound = renderResult.renderOpts.isNotFound
          isRedirect = renderResult.renderOpts.isRedirect
        } else {
          const origQuery = parseUrl(req.url || '', true).query
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

          renderResult = await renderToHTML(
            req,
            res,
            pathname,
            query,
            renderOpts
          )

          html = renderResult
          // TODO: change this to a different passing mechanism
          pageData = (renderOpts as any).pageData
          sprRevalidate = (renderOpts as any).revalidate
          isNotFound = (renderOpts as any).isNotFound
          isRedirect = (renderOpts as any).isRedirect
        }

        return { html, pageData, sprRevalidate, isNotFound, isRedirect }
      }
    )

    const isProduction = !this.renderOpts.dev
    const isDynamicPathname = isDynamicRoute(pathname)
    const didRespond = isResSent(res)

    const { staticPaths, fallbackMode } = hasStaticPaths
      ? await this.getStaticPaths(pathname)
      : { staticPaths: undefined, fallbackMode: false }

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
        let html: string

        // Production already emitted the fallback as static HTML.
        if (isProduction) {
          html = await this.incrementalCache.getFallback(
            locale ? `/${locale}${pathname}` : pathname
          )
        }
        // We need to generate the fallback on-demand for development.
        else {
          query.__nextFallback = 'true'
          if (isLikeServerless) {
            prepareServerlessUrl(req, query)
          }
          const { value: renderResult } = await doRender()
          html = renderResult.html
        }

        sendPayload(req, res, html, 'html', {
          generateEtags: this.renderOpts.generateEtags,
          poweredByHeader: this.renderOpts.poweredByHeader,
        })
        return null
      }
    }

    const {
      isOrigin,
      value: { html, pageData, sprRevalidate, isNotFound, isRedirect },
    } = await doRender()
    let resHtml = html

    const revalidateOptions =
      !this.renderOpts.dev || (hasServerProps && !isDataReq)
        ? {
            private: isPreviewMode,
            stateful: !isSSG,
            revalidate: sprRevalidate,
          }
        : undefined

    if (
      !isResSent(res) &&
      !isNotFound &&
      (isSSG || isDataReq || hasServerProps)
    ) {
      if (isRedirect && !isDataReq) {
        await handleRedirect(pageData)
      } else {
        sendPayload(
          req,
          res,
          isDataReq ? JSON.stringify(pageData) : html,
          isDataReq ? 'json' : 'html',
          {
            generateEtags: this.renderOpts.generateEtags,
            poweredByHeader: this.renderOpts.poweredByHeader,
          },
          revalidateOptions
        )
      }
      resHtml = null
    }

    // Update the cache if the head request and cacheable
    if (isOrigin && ssgCacheKey) {
      await this.incrementalCache.set(
        ssgCacheKey,
        { html: html!, pageData, isNotFound, isRedirect },
        sprRevalidate
      )
    }

    if (!isResSent(res) && isNotFound) {
      if (revalidateOptions) {
        setRevalidateHeaders(res, revalidateOptions)
      }
      if (isDataReq) {
        res.statusCode = 404
        res.end('{"notFound":true}')
      } else {
        await this.render404(req, res, {
          pathname,
          query,
        } as UrlWithParsedQuery)
      }
    }
    return resHtml
  }

  public async renderToHTML(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    query: ParsedUrlQuery = {}
  ): Promise<string | null> {
    const bubbleNoFallback = !!query._nextBubbleNoFallback
    delete query._nextBubbleNoFallback

    try {
      const result = await this.findPageComponents(pathname, query)
      if (result) {
        try {
          return await this.renderToHTMLWithComponents(
            req,
            res,
            pathname,
            result,
            { ...this.renderOpts }
          )
        } catch (err) {
          const isNoFallbackError = err instanceof NoFallbackError

          if (!isNoFallbackError || (isNoFallbackError && bubbleNoFallback)) {
            throw err
          }
        }
      }

      if (this.dynamicRoutes) {
        for (const dynamicRoute of this.dynamicRoutes) {
          const params = dynamicRoute.match(pathname)
          if (!params) {
            continue
          }

          const dynamicRouteResult = await this.findPageComponents(
            dynamicRoute.page,
            query,
            params
          )
          if (dynamicRouteResult) {
            try {
              return await this.renderToHTMLWithComponents(
                req,
                res,
                dynamicRoute.page,
                dynamicRouteResult,
                { ...this.renderOpts, params }
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
    } catch (err) {
      const isNoFallbackError = err instanceof NoFallbackError

      if (isNoFallbackError && bubbleNoFallback) {
        throw err
      }
      if (err && err.code === 'DECODE_FAILED') {
        this.logError(err)
        res.statusCode = 400
        return await this.renderErrorToHTML(err, req, res, pathname, query)
      }
      res.statusCode = 500
      const html = await this.renderErrorToHTML(err, req, res, pathname, query)

      if (this.minimalMode) {
        throw err
      }
      this.logError(err)
      return html
    }
    res.statusCode = 404
    return await this.renderErrorToHTML(null, req, res, pathname, query)
  }

  public async renderError(
    err: Error | null,
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    query: ParsedUrlQuery = {},
    setHeaders = true
  ): Promise<void> {
    if (setHeaders) {
      res.setHeader(
        'Cache-Control',
        'no-cache, no-store, max-age=0, must-revalidate'
      )
    }
    const html = await this.renderErrorToHTML(err, req, res, pathname, query)

    if (this.minimalMode && res.statusCode === 500) {
      throw err
    }
    if (html === null) {
      return
    }
    return this.sendHTML(req, res, html)
  }

  private customErrorNo404Warn = execOnce(() => {
    console.warn(
      chalk.bold.yellow(`Warning: `) +
        chalk.yellow(
          `You have added a custom /_error page without a custom /404 page. This prevents the 404 page from being auto statically optimized.\nSee here for info: https://nextjs.org/docs/messages/custom-error-no-custom-404`
        )
    )
  })

  public async renderErrorToHTML(
    err: Error | null,
    req: IncomingMessage,
    res: ServerResponse,
    _pathname: string,
    query: ParsedUrlQuery = {}
  ) {
    let html: string | null
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
        html = await this.renderToHTMLWithComponents(
          req,
          res,
          statusPage,
          result!,
          {
            ...this.renderOpts,
            err,
          }
        )
      } catch (maybeFallbackError) {
        if (maybeFallbackError instanceof NoFallbackError) {
          throw new Error('invariant: failed to render error page')
        }
        throw maybeFallbackError
      }
    } catch (renderToHtmlError) {
      console.error(renderToHtmlError)
      res.statusCode = 500

      if (this.renderOpts.dev) {
        await ((this as any).hotReloader as HotReloader).buildFallbackError()

        const fallbackResult = await loadDefaultErrorComponents(this.distDir)
        return this.renderToHTMLWithComponents(
          req,
          res,
          '/_error',
          {
            query,
            components: fallbackResult,
          },
          {
            ...this.renderOpts,
            err,
          }
        )
      }
      html = 'Internal Server Error'
    }
    return html
  }

  public async render404(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl?: UrlWithParsedQuery,
    setHeaders = true
  ): Promise<void> {
    const url: any = req.url
    const { pathname, query } = parsedUrl ? parsedUrl : parseUrl(url, true)
    const { i18n } = this.nextConfig

    if (i18n) {
      query.__nextLocale = query.__nextLocale || i18n.defaultLocale
      query.__nextDefaultLocale =
        query.__nextDefaultLocale || i18n.defaultLocale
    }
    res.statusCode = 404
    return this.renderError(null, req, res, pathname!, query, setHeaders)
  }

  public async serveStatic(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    parsedUrl?: UrlWithParsedQuery
  ): Promise<void> {
    if (!this.isServeableUrl(path)) {
      return this.render404(req, res, parsedUrl)
    }

    if (!(req.method === 'GET' || req.method === 'HEAD')) {
      res.statusCode = 405
      res.setHeader('Allow', ['GET', 'HEAD'])
      return this.renderError(null, req, res, path)
    }

    try {
      await serveStatic(req, res, path)
    } catch (err) {
      if (err.code === 'ENOENT' || err.statusCode === 404) {
        this.render404(req, res, parsedUrl)
      } else if (err.statusCode === 412) {
        res.statusCode = 412
        return this.renderError(err, req, res, path)
      } else {
        throw err
      }
    }
  }

  private _validFilesystemPathSet: Set<string> | null = null
  private getFilesystemPaths(): Set<string> {
    if (this._validFilesystemPathSet) {
      return this._validFilesystemPathSet
    }

    const pathUserFilesStatic = join(this.dir, 'static')
    let userFilesStatic: string[] = []
    if (this.hasStaticDir && fs.existsSync(pathUserFilesStatic)) {
      userFilesStatic = recursiveReadDirSync(pathUserFilesStatic).map((f) =>
        join('.', 'static', f)
      )
    }

    let userFilesPublic: string[] = []
    if (this.publicDir && fs.existsSync(this.publicDir)) {
      userFilesPublic = recursiveReadDirSync(this.publicDir).map((f) =>
        join('.', 'public', f)
      )
    }

    let nextFilesStatic: string[] = []
    nextFilesStatic = !this.minimalMode
      ? recursiveReadDirSync(join(this.distDir, 'static')).map((f) =>
          join('.', relative(this.dir, this.distDir), 'static', f)
        )
      : []

    return (this._validFilesystemPathSet = new Set<string>([
      ...nextFilesStatic,
      ...userFilesPublic,
      ...userFilesStatic,
    ]))
  }

  protected isServeableUrl(untrustedFileUrl: string): boolean {
    // This method mimics what the version of `send` we use does:
    // 1. decodeURIComponent:
    //    https://github.com/pillarjs/send/blob/0.17.1/index.js#L989
    //    https://github.com/pillarjs/send/blob/0.17.1/index.js#L518-L522
    // 2. resolve:
    //    https://github.com/pillarjs/send/blob/de073ed3237ade9ff71c61673a34474b30e5d45b/index.js#L561

    let decodedUntrustedFilePath: string
    try {
      // (1) Decode the URL so we have the proper file name
      decodedUntrustedFilePath = decodeURIComponent(untrustedFileUrl)
    } catch {
      return false
    }

    // (2) Resolve "up paths" to determine real request
    const untrustedFilePath = resolve(decodedUntrustedFilePath)

    // don't allow null bytes anywhere in the file path
    if (untrustedFilePath.indexOf('\0') !== -1) {
      return false
    }

    // Check if .next/static, static and public are in the path.
    // If not the path is not available.
    if (
      (untrustedFilePath.startsWith(join(this.distDir, 'static') + sep) ||
        untrustedFilePath.startsWith(join(this.dir, 'static') + sep) ||
        untrustedFilePath.startsWith(join(this.dir, 'public') + sep)) === false
    ) {
      return false
    }

    // Check against the real filesystem paths
    const filesystemUrls = this.getFilesystemPaths()
    const resolved = relative(this.dir, untrustedFilePath)
    return filesystemUrls.has(resolved)
  }

  protected readBuildId(): string {
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

  protected get _isLikeServerless(): boolean {
    return isTargetLikeServerless(this.nextConfig.target)
  }
}

function prepareServerlessUrl(
  req: IncomingMessage,
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

class NoFallbackError extends Error {}
