import compression from 'compression'
import fs from 'fs'
import { IncomingMessage, ServerResponse } from 'http'
import { join, resolve, sep } from 'path'
import pathToRegexp from 'path-to-regexp'
import { parse as parseQs, ParsedUrlQuery } from 'querystring'
import { format as formatUrl, parse as parseUrl, UrlWithParsedQuery } from 'url'

import { withCoalescedInvoke } from '../../lib/coalesced-function'
import {
  BUILD_ID_FILE,
  CLIENT_PUBLIC_FILES_PATH,
  CLIENT_STATIC_FILES_PATH,
  CLIENT_STATIC_FILES_RUNTIME,
  DEFAULT_REDIRECT_STATUS,
  PAGES_MANIFEST,
  PHASE_PRODUCTION_SERVER,
  ROUTES_MANIFEST,
  SERVER_DIRECTORY,
  SERVERLESS_DIRECTORY,
} from '../lib/constants'
import {
  getRouteMatcher,
  getRouteRegex,
  getSortedRoutes,
  isDynamicRoute,
} from '../lib/router/utils'
import * as envConfig from '../lib/runtime-config'
import { isResSent, NextApiRequest, NextApiResponse } from '../lib/utils'
import { apiResolver } from './api-utils'
import loadConfig, { isTargetLikeServerless } from './config'
import pathMatch from './lib/path-match'
import { recursiveReadDirSync } from './lib/recursive-readdir-sync'
import { loadComponents, LoadComponentsReturnType } from './load-components'
import { renderToHTML } from './render'
import { getPagePath } from './require'
import Router, { Params, route, Route, RouteMatch } from './router'
import { sendHTML } from './send-html'
import { serveStatic } from './serve-static'
import { getSprCache, initializeSprCache, setSprCache } from './spr-cache'
import { isBlockedPage } from './utils'

const getCustomRouteMatcher = pathMatch(true)

type NextConfig = any

type Rewrite = {
  source: string
  destination: string
}

type Redirect = Rewrite & {
  statusCode?: number
}

type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: Error) => void
) => void

export type ServerConstructor = {
  /**
   * Where the Next project is located - @default '.'
   */
  dir?: string
  staticMarkup?: boolean
  /**
   * Hide error messages containing server information - @default false
   */
  quiet?: boolean
  /**
   * Object what you would use in next.config.js - @default {}
   */
  conf?: NextConfig
  dev?: boolean
}

export default class Server {
  dir: string
  quiet: boolean
  nextConfig: NextConfig
  distDir: string
  pagesDir?: string
  publicDir: string
  hasStaticDir: boolean
  pagesManifest: string
  buildId: string
  renderOpts: {
    poweredByHeader: boolean
    ampBindInitData: boolean
    staticMarkup: boolean
    buildId: string
    generateEtags: boolean
    runtimeConfig?: { [key: string]: any }
    assetPrefix?: string
    canonicalBase: string
    documentMiddlewareEnabled: boolean
    hasCssMode: boolean
    dev?: boolean
  }
  private compression?: Middleware
  private onErrorMiddleware?: ({ err }: { err: Error }) => Promise<void>
  router: Router
  protected dynamicRoutes?: Array<{ page: string; match: RouteMatch }>
  protected customRoutes?: {
    rewrites: Rewrite[]
    redirects: Redirect[]
  }

  public constructor({
    dir = '.',
    staticMarkup = false,
    quiet = false,
    conf = null,
    dev = false,
  }: ServerConstructor = {}) {
    this.dir = resolve(dir)
    this.quiet = quiet
    const phase = this.currentPhase()
    this.nextConfig = loadConfig(phase, this.dir, conf)
    this.distDir = join(this.dir, this.nextConfig.distDir)
    this.publicDir = join(this.dir, CLIENT_PUBLIC_FILES_PATH)
    this.hasStaticDir = fs.existsSync(join(this.dir, 'static'))
    this.pagesManifest = join(
      this.distDir,
      this.nextConfig.target === 'server'
        ? SERVER_DIRECTORY
        : SERVERLESS_DIRECTORY,
      PAGES_MANIFEST
    )

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
      ampBindInitData: this.nextConfig.experimental.ampBindInitData,
      poweredByHeader: this.nextConfig.poweredByHeader,
      canonicalBase: this.nextConfig.amp.canonicalBase,
      documentMiddlewareEnabled: this.nextConfig.experimental
        .documentMiddleware,
      hasCssMode: this.nextConfig.experimental.css,
      staticMarkup,
      buildId: this.buildId,
      generateEtags,
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
    if (this.nextConfig.target === 'server') {
      envConfig.setConfig({
        serverRuntimeConfig,
        publicRuntimeConfig,
      })
    }

    this.router = new Router(this.generateRoutes())
    this.setAssetPrefix(assetPrefix)

    // call init-server middleware, this is also handled
    // individually in serverless bundles when deployed
    if (!dev && this.nextConfig.experimental.plugins) {
      const serverPath = join(
        this.distDir,
        this._isLikeServerless ? 'serverless' : 'server'
      )
      const initServer = require(join(serverPath, 'init-server.js')).default
      this.onErrorMiddleware = require(join(
        serverPath,
        'on-error-server.js'
      )).default
      initServer()
    }

    initializeSprCache({
      dev,
      distDir: this.distDir,
      pagesDir: join(
        this.distDir,
        this._isLikeServerless
          ? SERVERLESS_DIRECTORY
          : `${SERVER_DIRECTORY}/static/${this.buildId}`,
        'pages'
      ),
      flushToDisk: this.nextConfig.experimental.sprFlushToDisk,
    })
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

  private handleRequest(
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

    res.statusCode = 200
    return this.run(req, res, parsedUrl).catch(err => {
      this.logError(err)
      res.statusCode = 500
      res.end('Internal Server Error')
    })
  }

  public getRequestHandler() {
    return this.handleRequest.bind(this)
  }

  public setAssetPrefix(prefix?: string) {
    this.renderOpts.assetPrefix = prefix ? prefix.replace(/\/$/, '') : ''
  }

  // Backwards compatibility
  public async prepare(): Promise<void> {}

  // Backwards compatibility
  protected async close(): Promise<void> {}

  protected setImmutableAssetCacheControl(res: ServerResponse) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  }

  protected getCustomRoutes() {
    return require(join(this.distDir, ROUTES_MANIFEST))
  }

  protected generateRoutes(): Route[] {
    this.customRoutes = this.getCustomRoutes()

    const publicRoutes = fs.existsSync(this.publicDir)
      ? this.generatePublicRoutes()
      : []

    const staticFilesRoute = this.hasStaticDir
      ? [
          {
            // It's very important to keep this route's param optional.
            // (but it should support as many params as needed, separated by '/')
            // Otherwise this will lead to a pretty simple DOS attack.
            // See more: https://github.com/zeit/next.js/issues/2617
            match: route('/static/:path*'),
            fn: async (req, res, params, parsedUrl) => {
              const p = join(this.dir, 'static', ...(params.path || []))
              await this.serveStatic(req, res, p, parsedUrl)
            },
          } as Route,
        ]
      : []

    const routes: Route[] = [
      {
        match: route('/_next/static/:path*'),
        fn: async (req, res, params, parsedUrl) => {
          // The commons folder holds commonschunk files
          // The chunks folder holds dynamic entries
          // The buildId folder holds pages and potentially other assets. As buildId changes per build it can be long-term cached.

          // make sure to 404 for /_next/static itself
          if (!params.path) return this.render404(req, res, parsedUrl)

          if (
            params.path[0] === CLIENT_STATIC_FILES_RUNTIME ||
            params.path[0] === 'chunks' ||
            params.path[0] === this.buildId
          ) {
            this.setImmutableAssetCacheControl(res)
          }
          const p = join(
            this.distDir,
            CLIENT_STATIC_FILES_PATH,
            ...(params.path || [])
          )
          await this.serveStatic(req, res, p, parsedUrl)
        },
      },
      {
        match: route('/_next/data/:path*'),
        fn: async (req, res, params, _parsedUrl) => {
          // Make sure to 404 for /_next/data/ itself and
          // we also want to 404 if the buildId isn't correct
          if (!params.path || params.path[0] !== this.buildId) {
            return this.render404(req, res, _parsedUrl)
          }
          // remove buildId from URL
          params.path.shift()

          // show 404 if it doesn't end with .json
          if (!params.path[params.path.length - 1].endsWith('.json')) {
            return this.render404(req, res, _parsedUrl)
          }

          // re-create page's pathname
          const pathname = `/${params.path.join('/')}`
            .replace(/\.json$/, '')
            .replace(/\/index$/, '/')

          req.url = pathname
          const parsedUrl = parseUrl(pathname, true)
          await this.render(
            req,
            res,
            pathname,
            { _nextSprData: '1' },
            parsedUrl
          )
        },
      },
      {
        match: route('/_next/:path*'),
        // This path is needed because `render()` does a check for `/_next` and the calls the routing again
        fn: async (req, res, _params, parsedUrl) => {
          await this.render404(req, res, parsedUrl)
        },
      },
      ...publicRoutes,
      ...staticFilesRoute,
      {
        match: route('/api/:path*'),
        fn: async (req, res, params, parsedUrl) => {
          const { pathname } = parsedUrl
          await this.handleApiRequest(
            req as NextApiRequest,
            res as NextApiResponse,
            pathname!
          )
        },
      },
    ]

    if (this.customRoutes) {
      const { redirects, rewrites } = this.customRoutes

      const getCustomRoute = (
        r: { source: string; destination: string; statusCode?: number },
        type: 'redirect' | 'rewrite'
      ) => ({
        ...r,
        type,
        matcher: getCustomRouteMatcher(r.source),
      })

      const customRoutes = [
        ...redirects.map(r => getCustomRoute(r, 'redirect')),
        ...rewrites.map(r => getCustomRoute(r, 'rewrite')),
      ]

      routes.push(
        ...customRoutes.map((r, idx) => {
          return {
            match: r.matcher,
            fn: async (req, res, params, parsedUrl) => {
              let destinationCompiler = pathToRegexp.compile(r.destination)
              let newUrl = destinationCompiler(params) // /blog/123
              let newParams = params // { id: 123 }
              let statusCode = r.statusCode
              const followingRoutes = customRoutes.slice(idx + 1)

              for (const followingRoute of followingRoutes) {
                if (
                  r.type === 'redirect' &&
                  followingRoute.type !== 'redirect'
                ) {
                  continue
                }

                // TODO: add an error if they try to rewrite to a dynamic page
                const curParams = followingRoute.matcher(newUrl)

                if (curParams) {
                  destinationCompiler = pathToRegexp.compile(
                    followingRoute.destination
                  )
                  newUrl = destinationCompiler(newParams)
                  statusCode = followingRoute.statusCode
                  newParams = { ...newParams, ...curParams }
                }
              }

              if (r.type === 'redirect') {
                res.setHeader('Location', newUrl)
                res.statusCode = statusCode || DEFAULT_REDIRECT_STATUS
                res.end()
                return
              }
              return this.render(req, res, newUrl, newParams, parsedUrl)
            },
          } as Route
        })
      )
    }

    if (this.nextConfig.useFileSystemPublicRoutes) {
      this.dynamicRoutes = this.getDynamicRoutes()

      // It's very important to keep this route's param optional.
      // (but it should support as many params as needed, separated by '/')
      // Otherwise this will lead to a pretty simple DOS attack.
      // See more: https://github.com/zeit/next.js/issues/2617
      routes.push({
        match: route('/:path*'),
        fn: async (req, res, _params, parsedUrl) => {
          const { pathname, query } = parsedUrl
          if (!pathname) {
            throw new Error('pathname is undefined')
          }

          await this.render(req, res, pathname, query, parsedUrl)
        },
      })
    }

    return routes
  }

  /**
   * Resolves `API` request, in development builds on demand
   * @param req http request
   * @param res http response
   * @param pathname path of request
   */
  private async handleApiRequest(
    req: NextApiRequest,
    res: NextApiResponse,
    pathname: string
  ) {
    let params: Params | boolean = false
    let resolverFunction: any

    try {
      resolverFunction = await this.resolveApiRequest(pathname)
    } catch (err) {}

    if (
      this.dynamicRoutes &&
      this.dynamicRoutes.length > 0 &&
      !resolverFunction
    ) {
      for (const dynamicRoute of this.dynamicRoutes) {
        params = dynamicRoute.match(pathname)
        if (params) {
          resolverFunction = await this.resolveApiRequest(dynamicRoute.page)
          break
        }
      }
    }

    if (!resolverFunction) {
      return this.render404(req, res)
    }

    if (!this.renderOpts.dev && this._isLikeServerless) {
      const mod = require(resolverFunction)
      if (typeof mod.default === 'function') {
        return mod.default(req, res)
      }
    }

    await apiResolver(
      req,
      res,
      params,
      resolverFunction ? require(resolverFunction) : undefined,
      this.onErrorMiddleware
    )
  }

  /**
   * Resolves path to resolver function
   * @param pathname path of request
   */
  protected async resolveApiRequest(pathname: string): Promise<string | null> {
    return getPagePath(
      pathname,
      this.distDir,
      this._isLikeServerless,
      this.renderOpts.dev
    )
  }

  protected generatePublicRoutes(): Route[] {
    const routes: Route[] = []
    const publicFiles = recursiveReadDirSync(this.publicDir)
    const serverBuildPath = join(
      this.distDir,
      this._isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY
    )
    const pagesManifest = require(join(serverBuildPath, PAGES_MANIFEST))

    publicFiles.forEach(path => {
      const unixPath = path.replace(/\\/g, '/')
      // Only include public files that will not replace a page path
      if (!pagesManifest[unixPath]) {
        routes.push({
          match: route(unixPath),
          fn: async (req, res, _params, parsedUrl) => {
            const p = join(this.publicDir, unixPath)
            await this.serveStatic(req, res, p, parsedUrl)
          },
        })
      }
    })

    return routes
  }

  protected getDynamicRoutes() {
    const manifest = require(this.pagesManifest)
    const dynamicRoutedPages = Object.keys(manifest).filter(isDynamicRoute)
    return getSortedRoutes(dynamicRoutedPages).map(page => ({
      page,
      match: getRouteMatcher(getRouteRegex(page)),
    }))
  }

  private handleCompression(req: IncomingMessage, res: ServerResponse) {
    if (this.compression) {
      this.compression(req, res, () => {})
    }
  }

  protected async run(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: UrlWithParsedQuery
  ) {
    this.handleCompression(req, res)

    try {
      const fn = this.router.match(req, res, parsedUrl)
      if (fn) {
        await fn()
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
  ) {
    const { generateEtags, poweredByHeader } = this.renderOpts
    return sendHTML(req, res, html, { generateEtags, poweredByHeader })
  }

  public async render(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    query: ParsedUrlQuery = {},
    parsedUrl?: UrlWithParsedQuery
  ): Promise<void> {
    const url: any = req.url

    if (
      url.match(/^\/_next\//) ||
      (this.hasStaticDir && url.match(/^\/static\//))
    ) {
      return this.handleRequest(req, res, parsedUrl)
    }

    if (isBlockedPage(pathname)) {
      return this.render404(req, res, parsedUrl)
    }

    const html = await this.renderToHTML(req, res, pathname, query, {
      dataOnly:
        (this.renderOpts.ampBindInitData && Boolean(query.dataOnly)) ||
        (req.headers &&
          (req.headers.accept || '').indexOf('application/amp.bind+json') !==
            -1),
    })
    // Request was ended by the user
    if (html === null) {
      return
    }

    return this.sendHTML(req, res, html)
  }

  private async findPageComponents(
    pathname: string,
    query: ParsedUrlQuery = {}
  ) {
    const serverless = !this.renderOpts.dev && this._isLikeServerless
    // try serving a static AMP version first
    if (query.amp) {
      try {
        return await loadComponents(
          this.distDir,
          this.buildId,
          (pathname === '/' ? '/index' : pathname) + '.amp',
          serverless
        )
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
    }
    return await loadComponents(
      this.distDir,
      this.buildId,
      pathname,
      serverless
    )
  }

  private __sendPayload(
    res: ServerResponse,
    payload: any,
    type: string,
    revalidate?: number | false
  ) {
    // TODO: ETag? Cache-Control headers? Next-specific headers?
    res.setHeader('Content-Type', type)
    res.setHeader('Content-Length', Buffer.byteLength(payload))
    if (!this.renderOpts.dev) {
      if (revalidate) {
        res.setHeader(
          'Cache-Control',
          `s-maxage=${revalidate}, stale-while-revalidate`
        )
      } else if (revalidate === false) {
        res.setHeader(
          'Cache-Control',
          `s-maxage=31536000, stale-while-revalidate`
        )
      }
    }
    res.end(payload)
  }

  private async renderToHTMLWithComponents(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    query: ParsedUrlQuery = {},
    result: LoadComponentsReturnType,
    opts: any
  ): Promise<string | null> {
    // handle static page
    if (typeof result.Component === 'string') {
      return result.Component
    }

    // check request state
    const isLikeServerless =
      typeof result.Component === 'object' &&
      typeof result.Component.renderReqToHTML === 'function'
    const isSpr = !!result.unstable_getStaticProps

    // non-spr requests should render like normal
    if (!isSpr) {
      // handle serverless
      if (isLikeServerless) {
        const curUrl = parseUrl(req.url!, true)
        req.url = formatUrl({
          ...curUrl,
          query: {
            ...curUrl.query,
            ...query,
          },
        })
        return result.Component.renderReqToHTML(req, res)
      }

      return renderToHTML(req, res, pathname, query, {
        ...result,
        ...opts,
      })
    }

    // Toggle whether or not this is an SPR Data request
    const isSprData = isSpr && query._nextSprData
    if (isSprData) {
      delete query._nextSprData
    }
    // Compute the SPR cache key
    const sprCacheKey = parseUrl(req.url || '').pathname!

    // Complete the response with cached data if its present
    const cachedData = await getSprCache(sprCacheKey)
    if (cachedData) {
      const data = isSprData
        ? JSON.stringify(cachedData.pageData)
        : cachedData.html

      this.__sendPayload(
        res,
        data,
        isSprData ? 'application/json' : 'text/html; charset=utf-8',
        cachedData.curRevalidate
      )

      // Stop the request chain here if the data we sent was up-to-date
      if (!cachedData.isStale) {
        return null
      }
    }

    // If we're here, that means data is missing or it's stale.

    // Serverless requests need its URL transformed back into the original
    // request path (to emulate lambda behavior in production)
    if (isLikeServerless && isSprData) {
      let { pathname } = parseUrl(req.url || '', true)
      pathname = !pathname || pathname === '/' ? '/index' : pathname
      req.url = `/_next/data/${this.buildId}${pathname}.json`
    }

    const doRender = withCoalescedInvoke(async function(): Promise<{
      html: string | null
      sprData: any
      sprRevalidate: number | false
    }> {
      let sprData: any
      let html: string | null
      let sprRevalidate: number | false

      let renderResult
      // handle serverless
      if (isLikeServerless) {
        renderResult = await result.Component.renderReqToHTML(req, res, true)

        html = renderResult.html
        sprData = renderResult.renderOpts.sprData
        sprRevalidate = renderResult.renderOpts.revalidate
      } else {
        const renderOpts = {
          ...result,
          ...opts,
        }
        renderResult = await renderToHTML(req, res, pathname, query, renderOpts)

        html = renderResult
        sprData = renderOpts.sprData
        sprRevalidate = renderOpts.revalidate
      }

      return { html, sprData, sprRevalidate }
    })

    return doRender(sprCacheKey, []).then(
      async ({ isOrigin, value: { html, sprData, sprRevalidate } }) => {
        // Respond to the request if a payload wasn't sent above (from cache)
        if (!isResSent(res)) {
          this.__sendPayload(
            res,
            isSprData ? JSON.stringify(sprData) : html,
            isSprData ? 'application/json' : 'text/html; charset=utf-8',
            sprRevalidate
          )
        }

        // Update the SPR cache if the head request
        if (isOrigin) {
          await setSprCache(
            sprCacheKey,
            { html: html!, pageData: sprData },
            sprRevalidate
          )
        }

        return null
      }
    )
  }

  public renderToHTML(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    query: ParsedUrlQuery = {},
    {
      amphtml,
      dataOnly,
      hasAmp,
    }: {
      amphtml?: boolean
      hasAmp?: boolean
      dataOnly?: boolean
    } = {}
  ): Promise<string | null> {
    return this.findPageComponents(pathname, query)
      .then(
        result => {
          return this.renderToHTMLWithComponents(
            req,
            res,
            pathname,
            query,
            result,
            { ...this.renderOpts, amphtml, hasAmp, dataOnly }
          )
        },
        err => {
          if (err.code !== 'ENOENT' || !this.dynamicRoutes) {
            return Promise.reject(err)
          }

          for (const dynamicRoute of this.dynamicRoutes) {
            const params = dynamicRoute.match(pathname)
            if (!params) {
              continue
            }

            return this.findPageComponents(dynamicRoute.page, query).then(
              result => {
                return this.renderToHTMLWithComponents(
                  req,
                  res,
                  dynamicRoute.page,
                  // only add params for SPR enabled pages
                  {
                    ...(result.unstable_getStaticProps
                      ? { _nextSprData: query._nextSprData }
                      : query),
                    ...params,
                  },
                  result,
                  {
                    ...this.renderOpts,
                    amphtml,
                    hasAmp,
                    dataOnly,
                  }
                )
              }
            )
          }

          return Promise.reject(err)
        }
      )
      .catch(err => {
        if (err && err.code === 'ENOENT') {
          res.statusCode = 404
          return this.renderErrorToHTML(null, req, res, pathname, query)
        } else {
          this.logError(err)
          res.statusCode = 500
          return this.renderErrorToHTML(err, req, res, pathname, query)
        }
      })
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

  public async renderErrorToHTML(
    err: Error | null,
    req: IncomingMessage,
    res: ServerResponse,
    _pathname: string,
    query: ParsedUrlQuery = {}
  ) {
    const result = await this.findPageComponents('/_error', query)
    let html
    try {
      html = await this.renderToHTMLWithComponents(
        req,
        res,
        '/_error',
        query,
        result,
        {
          ...this.renderOpts,
          err,
        }
      )
    } catch (err) {
      console.error(err)
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
    if (!pathname) {
      throw new Error('pathname is undefined')
    }
    res.statusCode = 404
    return this.renderError(null, req, res, pathname, query)
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

  private isServeableUrl(path: string): boolean {
    const resolved = resolve(path)
    if (
      resolved.indexOf(join(this.distDir) + sep) !== 0 &&
      resolved.indexOf(join(this.dir, 'static') + sep) !== 0 &&
      resolved.indexOf(join(this.dir, 'public') + sep) !== 0
    ) {
      // Seems like the user is trying to traverse the filesystem.
      return false
    }

    return true
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

  private get _isLikeServerless(): boolean {
    return isTargetLikeServerless(this.nextConfig.target)
  }
}
