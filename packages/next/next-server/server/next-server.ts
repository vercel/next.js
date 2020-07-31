import compression from 'next/dist/compiled/compression'
import fs from 'fs'
import chalk from 'next/dist/compiled/chalk'
import { IncomingMessage, ServerResponse } from 'http'
import Proxy from 'next/dist/compiled/http-proxy'
import { join, relative, resolve, sep } from 'path'
import { parse as parseQs, ParsedUrlQuery } from 'querystring'
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
  PHASE_PRODUCTION_SERVER,
  PRERENDER_MANIFEST,
  ROUTES_MANIFEST,
  SERVERLESS_DIRECTORY,
  SERVER_DIRECTORY,
} from '../lib/constants'
import {
  getRouteMatcher,
  getRouteRegex,
  getSortedRoutes,
  isDynamicRoute,
} from '../lib/router/utils'
import * as envConfig from '../lib/runtime-config'
import { isResSent, NextApiRequest, NextApiResponse } from '../lib/utils'
import { apiResolver, tryGetPreviewData, __ApiPreviewProps } from './api-utils'
import loadConfig, { isTargetLikeServerless } from './config'
import pathMatch from './lib/path-match'
import { recursiveReadDirSync } from './lib/recursive-readdir-sync'
import { loadComponents, LoadComponentsReturnType } from './load-components'
import { normalizePagePath } from './normalize-page-path'
import { RenderOpts, RenderOptsPartial, renderToHTML } from './render'
import { getPagePath, requireFontManifest } from './require'
import Router, {
  DynamicRoutes,
  PageChecker,
  Params,
  prepareDestination,
  route,
  Route,
} from './router'
import { sendPayload } from './send-payload'
import { serveStatic } from './serve-static'
import { IncrementalCache } from './incremental-cache'
import { execOnce } from '../lib/utils'
import { isBlockedPage } from './utils'
import { compile as compilePathToRegex } from 'next/dist/compiled/path-to-regexp'
import { loadEnvConfig } from '../../lib/load-env-config'
import './node-polyfill-fetch'
import { PagesManifest } from '../../build/webpack/plugins/pages-manifest-plugin'
import { removePathTrailingSlash } from '../../client/normalize-trailing-slash'
import getRouteFromAssetPath from '../lib/router/utils/get-route-from-asset-path'
import { FontManifest } from './font-utils'

const getCustomRouteMatcher = pathMatch(true)

type NextConfig = any

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: Error) => void
) => void

type FindComponentsResult = {
  components: LoadComponentsReturnType
  query: ParsedUrlQuery
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
  conf?: NextConfig
  dev?: boolean
  customServer?: boolean
}

export default class Server {
  dir: string
  quiet: boolean
  nextConfig: NextConfig
  distDir: string
  pagesDir?: string
  publicDir: string
  hasStaticDir: boolean
  serverBuildDir: string
  pagesManifest?: PagesManifest
  buildId: string
  renderOpts: {
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
    fontManifest: FontManifest
  }
  private compression?: Middleware
  private onErrorMiddleware?: ({ err }: { err: Error }) => Promise<void>
  private incrementalCache: IncrementalCache
  router: Router
  protected dynamicRoutes?: DynamicRoutes
  protected customRoutes: CustomRoutes

  public constructor({
    dir = '.',
    quiet = false,
    conf = null,
    dev = false,
    customServer = true,
  }: ServerConstructor = {}) {
    this.dir = resolve(dir)
    this.quiet = quiet
    const phase = this.currentPhase()
    loadEnvConfig(this.dir, dev)

    this.nextConfig = loadConfig(phase, this.dir, conf)
    this.distDir = join(this.dir, this.nextConfig.distDir)
    this.publicDir = join(this.dir, CLIENT_PUBLIC_FILES_PATH)
    this.hasStaticDir = fs.existsSync(join(this.dir, 'static'))

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

    this.renderOpts = {
      poweredByHeader: this.nextConfig.poweredByHeader,
      canonicalBase: this.nextConfig.amp.canonicalBase,
      buildId: this.buildId,
      generateEtags,
      previewProps: this.getPreviewProps(),
      customServer: customServer === true ? true : undefined,
      ampOptimizerConfig: this.nextConfig.experimental.amp?.optimizer,
      basePath: this.nextConfig.basePath,
      optimizeFonts: this.nextConfig.experimental.optimizeFonts,
      fontManifest: this.nextConfig.experimental.optimizeFonts
        ? requireFontManifest(this.distDir, this._isLikeServerless)
        : null,
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

    // call init-server middleware, this is also handled
    // individually in serverless bundles when deployed
    if (!dev && this.nextConfig.experimental.plugins) {
      const initServer = require(join(this.serverBuildDir, 'init-server.js'))
        .default
      this.onErrorMiddleware = require(join(
        this.serverBuildDir,
        'on-error-server.js'
      )).default
      initServer()
    }

    this.incrementalCache = new IncrementalCache({
      dev,
      distDir: this.distDir,
      pagesDir: join(
        this.distDir,
        this._isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY,
        'pages'
      ),
      flushToDisk: this.nextConfig.experimental.sprFlushToDisk,
    })

    /**
     * This sets environment variable to be used at the time of SSR by head.tsx.
     * Using this from process.env allows targetting both serverless and SSR by calling
     * `process.env.__NEXT_OPTIMIZE_FONTS`.
     * TODO(prateekbh@): Remove this when experimental.optimizeFonts are being clened up.
     */
    if (this.renderOpts.optimizeFonts) {
      process.env.__NEXT_OPTIMIZE_FONTS = JSON.stringify(true)
    }
  }

  protected currentPhase(): string {
    return PHASE_PRODUCTION_SERVER
  }

  private logError(err: Error): void {
    if (this.onErrorMiddleware) {
      this.onErrorMiddleware({ err })
    }
    if (this.quiet) return
    // tslint:disable-next-line
    console.error(err)
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl?: UrlWithParsedQuery
  ): Promise<void> {
    // Parse url if parsedUrl not provided
    if (!parsedUrl || typeof parsedUrl !== 'object') {
      const url: any = req.url
      parsedUrl = parseUrl(url, true)
    }

    // Parse the querystring ourselves if the user doesn't handle querystring parsing
    if (typeof parsedUrl.query === 'string') {
      parsedUrl.query = parseQs(parsedUrl.query)
    }

    const { basePath } = this.nextConfig

    if (basePath && req.url?.startsWith(basePath)) {
      // store original URL to allow checking if basePath was
      // provided or not
      ;(req as any)._nextHadBasePath = true
      req.url = req.url!.replace(basePath, '') || '/'
    }

    res.statusCode = 200
    try {
      return await this.run(req, res, parsedUrl)
    } catch (err) {
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
    return require(join(this.distDir, ROUTES_MANIFEST))
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
    rewrites: Route[]
    fsRoutes: Route[]
    redirects: Route[]
    catchAllRoute: Route
    pageChecker: PageChecker
    useFileSystemPublicRoutes: boolean
    dynamicRoutes: DynamicRoutes | undefined
  } {
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
              const p = join(
                this.dir,
                'static',
                ...(params.path || []).map(encodeURIComponent)
              )
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
          const pathname = getRouteFromAssetPath(
            `/${params.path
              // we need to re-encode the params since they are decoded
              // by path-match and we are re-building the URL
              .map((param: string) => encodeURIComponent(param))
              .join('/')}`,
            '.json'
          )

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

    const getCustomRouteBasePath = (r: { basePath?: false }) => {
      return r.basePath !== false && this.renderOpts.dev
        ? this.nextConfig.basePath
        : ''
    }

    const getCustomRoute = (r: Rewrite | Redirect | Header, type: RouteType) =>
      ({
        ...r,
        type,
        match: getCustomRouteMatcher(`${getCustomRouteBasePath(r)}${r.source}`),
        name: type,
        fn: async (_req, _res, _params, _parsedUrl) => ({ finished: false }),
      } as Route & Rewrite & Header)

    const updateHeaderValue = (value: string, params: Params): string => {
      if (!value.includes(':')) {
        return value
      }

      for (const key of Object.keys(params)) {
        if (value.includes(`:${key}`)) {
          value = value
            .replace(
              new RegExp(`:${key}\\*`, 'g'),
              `:${key}--ESCAPED_PARAM_ASTERISKS`
            )
            .replace(
              new RegExp(`:${key}\\?`, 'g'),
              `:${key}--ESCAPED_PARAM_QUESTION`
            )
            .replace(
              new RegExp(`:${key}\\+`, 'g'),
              `:${key}--ESCAPED_PARAM_PLUS`
            )
            .replace(
              new RegExp(`:${key}(?!\\w)`, 'g'),
              `--ESCAPED_PARAM_COLON${key}`
            )
        }
      }
      value = value
        .replace(/(:|\*|\?|\+|\(|\)|\{|\})/g, '\\$1')
        .replace(/--ESCAPED_PARAM_PLUS/g, '+')
        .replace(/--ESCAPED_PARAM_COLON/g, ':')
        .replace(/--ESCAPED_PARAM_QUESTION/g, '?')
        .replace(/--ESCAPED_PARAM_ASTERISKS/g, '*')

      // the value needs to start with a forward-slash to be compiled
      // correctly
      return compilePathToRegex(`/${value}`, { validate: false })(
        params
      ).substr(1)
    }

    // Headers come very first
    const headers = this.customRoutes.headers.map((r) => {
      const headerRoute = getCustomRoute(r, 'header')
      return {
        match: headerRoute.match,
        type: headerRoute.type,
        name: `${headerRoute.type} ${headerRoute.source} header route`,
        fn: async (_req, res, params, _parsedUrl) => {
          const hasParams = Object.keys(params).length > 0

          for (const header of (headerRoute as Header).headers) {
            let { key, value } = header
            if (hasParams) {
              key = updateHeaderValue(key, params)
              value = updateHeaderValue(value, params)
            }
            res.setHeader(key, value)
          }
          return { finished: false }
        },
      } as Route
    })

    const redirects = this.customRoutes.redirects.map((redirect) => {
      const redirectRoute = getCustomRoute(redirect, 'redirect')
      return {
        type: redirectRoute.type,
        match: redirectRoute.match,
        statusCode: redirectRoute.statusCode,
        name: `Redirect route`,
        fn: async (_req, res, params, parsedUrl) => {
          const { parsedDestination } = prepareDestination(
            redirectRoute.destination,
            params,
            parsedUrl.query,
            false,
            getCustomRouteBasePath(redirectRoute)
          )
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

    const rewrites = this.customRoutes.rewrites.map((rewrite) => {
      const rewriteRoute = getCustomRoute(rewrite, 'rewrite')
      return {
        ...rewriteRoute,
        check: true,
        type: rewriteRoute.type,
        name: `Rewrite route`,
        match: rewriteRoute.match,
        fn: async (req, res, params, parsedUrl) => {
          const { newUrl, parsedDestination } = prepareDestination(
            rewriteRoute.destination,
            params,
            parsedUrl.query,
            true,
            getCustomRouteBasePath(rewriteRoute)
          )

          // external rewrite, proxy it
          if (parsedDestination.protocol) {
            const target = formatUrl(parsedDestination)
            const proxy = new Proxy({
              target,
              changeOrigin: true,
              ignorePath: true,
            })
            proxy.web(req, res)

            proxy.on('error', (err: Error) => {
              console.error(`Error occurred proxying ${target}`, err)
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
    })

    const catchAllRoute: Route = {
      match: route('/:path*'),
      type: 'route',
      name: 'Catchall render',
      fn: async (req, res, params, parsedUrl) => {
        let { pathname, query } = parsedUrl
        if (!pathname) {
          throw new Error('pathname is undefined')
        }

        // next.js core assumes page path without trailing slash
        pathname = removePathTrailingSlash(pathname)

        if (params?.path?.[0] === 'api') {
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

        await this.render(req, res, pathname, query, parsedUrl)
        return {
          finished: true,
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
      rewrites,
      redirects,
      catchAllRoute,
      useFileSystemPublicRoutes,
      dynamicRoutes: this.dynamicRoutes,
      basePath: this.nextConfig.basePath,
      pageChecker: this.hasPage.bind(this),
    }
  }

  private async getPagePath(pathname: string): Promise<string> {
    return getPagePath(
      pathname,
      this.distDir,
      this._isLikeServerless,
      this.renderOpts.dev
    )
  }

  protected async hasPage(pathname: string): Promise<boolean> {
    let found = false
    try {
      found = !!(await this.getPagePath(pathname))
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

    const pageModule = require(builtPagePath)
    query = { ...query, ...params }

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
      false,
      this.onErrorMiddleware
    )
    return true
  }

  protected generatePublicRoutes(): Route[] {
    const publicFiles = new Set(
      recursiveReadDirSync(this.publicDir).map((p) => p.replace(/\\/g, '/'))
    )

    return [
      {
        match: route('/:path*'),
        name: 'public folder catchall',
        fn: async (req, res, params, parsedUrl) => {
          const pathParts: string[] = params.path || []
          const path = `/${pathParts.join('/')}`

          if (publicFiles.has(path)) {
            await this.serveStatic(
              req,
              res,
              // we need to re-encode it since send decodes it
              join(this.publicDir, ...pathParts.map(encodeURIComponent)),
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

  protected getDynamicRoutes() {
    return getSortedRoutes(Object.keys(this.pagesManifest!))
      .filter(isDynamicRoute)
      .map((page) => ({
        page,
        match: getRouteMatcher(getRouteRegex(page)),
      }))
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
      if (err.code === 'DECODE_FAILED') {
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
        `Cannot render page with path "${pathname}", did you mean "/${pathname}"?. See more info here: https://err.sh/next.js/render-no-starting-slash`
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
      !query._nextDataReq &&
      (url.match(/^\/_next\//) ||
        (this.hasStaticDir && url.match(/^\/static\//)))
    ) {
      return this.handleRequest(req, res, parsedUrl)
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
    const paths = [
      // try serving a static AMP version first
      query.amp ? normalizePagePath(pathname) + '.amp' : null,
      pathname,
    ].filter(Boolean)
    for (const pagePath of paths) {
      try {
        const components = await loadComponents(
          this.distDir,
          pagePath!,
          !this.renderOpts.dev && this._isLikeServerless
        )
        return {
          components,
          query: {
            ...(components.getStaticProps
              ? { _nextDataReq: query._nextDataReq, amp: query.amp }
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
    hasStaticFallback: boolean
  }> {
    // `staticPaths` is intentionally set to `undefined` as it should've
    // been caught when checking disk data.
    const staticPaths = undefined

    // Read whether or not fallback should exist from the manifest.
    const hasStaticFallback =
      typeof this.getPrerenderManifest().dynamicRoutes[pathname].fallback ===
      'string'

    return { staticPaths, hasStaticFallback }
  }

  private async renderToHTMLWithComponents(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    { components, query }: FindComponentsResult,
    opts: RenderOptsPartial
  ): Promise<string | null> {
    // we need to ensure the status code if /404 is visited directly
    if (pathname === '/404') {
      res.statusCode = 404
    }

    // handle static page
    if (typeof components.Component === 'string') {
      return components.Component
    }

    // check request state
    const isLikeServerless =
      typeof components.Component === 'object' &&
      typeof (components.Component as any).renderReqToHTML === 'function'
    const isSSG = !!components.getStaticProps
    const isServerProps = !!components.getServerSideProps
    const hasStaticPaths = !!components.getStaticPaths

    if (!query.amp) {
      delete query.amp
    }

    // Toggle whether or not this is a Data request
    const isDataReq = !!query._nextDataReq && (isSSG || isServerProps)
    delete query._nextDataReq

    let previewData: string | false | object | undefined
    let isPreviewMode = false

    if (isServerProps || isSSG) {
      previewData = tryGetPreviewData(req, res, this.renderOpts.previewProps)
      isPreviewMode = previewData !== false
    }

    // Compute the iSSG cache key. We use the rewroteUrl since
    // pages with fallback: false are allowed to be rewritten to
    // and we need to look up the path by the rewritten path
    let urlPathname = (req as any)._nextRewroteUrl
      ? (req as any)._nextRewroteUrl
      : `${parseUrl(req.url || '').pathname!}`

    // remove trailing slash
    urlPathname = urlPathname.replace(/(?!^)\/$/, '')

    // remove /_next/data prefix from urlPathname so it matches
    // for direct page visit and /_next/data visit
    if (isDataReq && urlPathname.includes(this.buildId)) {
      urlPathname = (urlPathname.split(this.buildId).pop() || '/')
        .replace(/\.json$/, '')
        .replace(/\/index$/, '/')
    }

    const ssgCacheKey =
      isPreviewMode || !isSSG
        ? undefined // Preview mode bypasses the cache
        : `${urlPathname}${query.amp ? '.amp' : ''}`

    // Complete the response with cached data if its present
    const cachedData = ssgCacheKey
      ? await this.incrementalCache.get(ssgCacheKey)
      : undefined

    if (cachedData) {
      const data = isDataReq
        ? JSON.stringify(cachedData.pageData)
        : cachedData.html

      sendPayload(
        req,
        res,
        data,
        isDataReq ? 'json' : 'html',
        {
          generateEtags: this.renderOpts.generateEtags,
          poweredByHeader: this.renderOpts.poweredByHeader,
        },
        !this.renderOpts.dev
          ? {
              private: isPreviewMode,
              stateful: false, // GSP response
              revalidate:
                cachedData.curRevalidate !== undefined
                  ? cachedData.curRevalidate
                  : /* default to minimum revalidate (this should be an invariant) */ 1,
            }
          : undefined
      )

      // Stop the request chain here if the data we sent was up-to-date
      if (!cachedData.isStale) {
        return null
      }
    }

    // If we're here, that means data is missing or it's stale.
    const maybeCoalesceInvoke = ssgCacheKey
      ? (fn: any) => withCoalescedInvoke(fn).bind(null, ssgCacheKey, [])
      : (fn: any) => async () => {
          const value = await fn()
          return { isOrigin: true, value }
        }

    const doRender = maybeCoalesceInvoke(
      async (): Promise<{
        html: string | null
        pageData: any
        sprRevalidate: number | false
      }> => {
        let pageData: any
        let html: string | null
        let sprRevalidate: number | false

        let renderResult
        // handle serverless
        if (isLikeServerless) {
          renderResult = await (components.Component as any).renderReqToHTML(
            req,
            res,
            'passthrough',
            {
              fontManifest: this.renderOpts.fontManifest,
            }
          )

          html = renderResult.html
          pageData = renderResult.renderOpts.pageData
          sprRevalidate = renderResult.renderOpts.revalidate
        } else {
          const renderOpts: RenderOpts = {
            ...components,
            ...opts,
            isDataReq,
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
        }

        return { html, pageData, sprRevalidate }
      }
    )

    const isProduction = !this.renderOpts.dev
    const isDynamicPathname = isDynamicRoute(pathname)
    const didRespond = isResSent(res)

    const { staticPaths, hasStaticFallback } = hasStaticPaths
      ? await this.getStaticPaths(pathname)
      : { staticPaths: undefined, hasStaticFallback: false }

    // When we did not respond from cache, we need to choose to block on
    // rendering or return a skeleton.
    //
    // * Data requests always block.
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
      ssgCacheKey &&
      !didRespond &&
      !isDataReq &&
      !isPreviewMode &&
      isDynamicPathname &&
      // Development should trigger fallback when the path is not in
      // `getStaticPaths`
      (isProduction || !staticPaths || !staticPaths.includes(urlPathname))
    ) {
      if (
        // In development, fall through to render to handle missing
        // getStaticPaths.
        (isProduction || staticPaths) &&
        // When fallback isn't present, abort this render so we 404
        !hasStaticFallback
      ) {
        throw new NoFallbackError()
      }

      let html: string

      // Production already emitted the fallback as static HTML.
      if (isProduction) {
        html = await this.incrementalCache.getFallback(pathname)
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

    const {
      isOrigin,
      value: { html, pageData, sprRevalidate },
    } = await doRender()
    let resHtml = html
    if (!isResSent(res) && (isSSG || isDataReq || isServerProps)) {
      sendPayload(
        req,
        res,
        isDataReq ? JSON.stringify(pageData) : html,
        isDataReq ? 'json' : 'html',
        {
          generateEtags: this.renderOpts.generateEtags,
          poweredByHeader: this.renderOpts.poweredByHeader,
        },
        !this.renderOpts.dev || (isServerProps && !isDataReq)
          ? {
              private: isPreviewMode,
              stateful: !isSSG,
              revalidate: sprRevalidate,
            }
          : undefined
      )
      resHtml = null
    }

    // Update the cache if the head request and cacheable
    if (isOrigin && ssgCacheKey) {
      await this.incrementalCache.set(
        ssgCacheKey,
        { html: html!, pageData },
        sprRevalidate
      )
    }

    return resHtml
  }

  public async renderToHTML(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    query: ParsedUrlQuery = {}
  ): Promise<string | null> {
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
          if (!(err instanceof NoFallbackError)) {
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
              if (!(err instanceof NoFallbackError)) {
                throw err
              }
            }
          }
        }
      }
    } catch (err) {
      this.logError(err)
      res.statusCode = 500
      return await this.renderErrorToHTML(err, req, res, pathname, query)
    }

    res.statusCode = 404
    return await this.renderErrorToHTML(null, req, res, pathname, query)
  }

  public async renderError(
    err: Error | null,
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    query: ParsedUrlQuery = {}
  ): Promise<void> {
    res.setHeader(
      'Cache-Control',
      'no-cache, no-store, max-age=0, must-revalidate'
    )
    const html = await this.renderErrorToHTML(err, req, res, pathname, query)
    if (html === null) {
      return
    }
    return this.sendHTML(req, res, html)
  }

  private customErrorNo404Warn = execOnce(() => {
    console.warn(
      chalk.bold.yellow(`Warning: `) +
        chalk.yellow(
          `You have added a custom /_error page without a custom /404 page. This prevents the 404 page from being auto statically optimized.\nSee here for info: https://err.sh/next.js/custom-error-no-custom-404`
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
    let result: null | FindComponentsResult = null

    const is404 = res.statusCode === 404
    let using404Page = false

    // use static 404 page if available and is 404 response
    if (is404) {
      result = await this.findPageComponents('/404')
      using404Page = result !== null
    }

    if (!result) {
      result = await this.findPageComponents('/_error', query)
    }

    if (
      process.env.NODE_ENV !== 'production' &&
      !using404Page &&
      (await this.hasPage('/_error')) &&
      !(await this.hasPage('/404'))
    ) {
      this.customErrorNo404Warn()
    }

    let html: string | null
    try {
      try {
        html = await this.renderToHTMLWithComponents(
          req,
          res,
          using404Page ? '/404' : '/_error',
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
      html = 'Internal Server Error'
    }
    return html
  }

  public async render404(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl?: UrlWithParsedQuery
  ): Promise<void> {
    const url: any = req.url
    const { pathname, query } = parsedUrl ? parsedUrl : parseUrl(url, true)
    res.statusCode = 404
    return this.renderError(null, req, res, pathname!, query)
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
    nextFilesStatic = recursiveReadDirSync(
      join(this.distDir, 'static')
    ).map((f) => join('.', relative(this.dir, this.distDir), 'static', f))

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
          `Could not find a valid build in the '${this.distDir}' directory! Try building your app with 'next build' before starting the server.`
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
