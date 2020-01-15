import compression from 'compression'
import fs from 'fs'
import { IncomingMessage, ServerResponse } from 'http'
import { join, resolve, sep } from 'path'
import { compile as compilePathToRegex } from 'path-to-regexp'
import { parse as parseQs, ParsedUrlQuery } from 'querystring'
import { format as formatUrl, parse as parseUrl, UrlWithParsedQuery } from 'url'

import { withCoalescedInvoke } from '../../lib/coalesced-function'
import {
  BUILD_ID_FILE,
  CLIENT_PUBLIC_FILES_PATH,
  CLIENT_STATIC_FILES_PATH,
  CLIENT_STATIC_FILES_RUNTIME,
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
import Router, {
  Params,
  route,
  Route,
  DynamicRoutes,
  PageChecker,
} from './router'
import { sendHTML } from './send-html'
import { serveStatic } from './serve-static'
import { getSprCache, initializeSprCache, setSprCache } from './spr-cache'
import { isBlockedPage } from './utils'
import {
  Redirect,
  Rewrite,
  RouteType,
  Header,
  getRedirectStatus,
} from '../../lib/check-custom-routes'

const getCustomRouteMatcher = pathMatch(true)

type NextConfig = any

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
  serverBuildDir: string
  pagesManifest?: { [name: string]: string }
  buildId: string
  renderOpts: {
    poweredByHeader: boolean
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
  protected dynamicRoutes?: DynamicRoutes
  protected customRoutes?: {
    rewrites: Rewrite[]
    redirects: Redirect[]
    headers: Header[]
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

    this.serverBuildDir = join(
      this.distDir,
      this._isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY
    )
    const pagesManifestPath = join(this.serverBuildDir, PAGES_MANIFEST)

    if (!dev) {
      this.pagesManifest = require(pagesManifestPath)
    }

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

    if (parsedUrl.pathname!.startsWith(this.nextConfig.experimental.basePath)) {
      // If replace ends up replacing the full url it'll be `undefined`, meaning we have to default it to `/`
      parsedUrl.pathname =
        parsedUrl.pathname!.replace(
          this.nextConfig.experimental.basePath,
          ''
        ) || '/'
      req.url = req.url!.replace(this.nextConfig.experimental.basePath, '')
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

  protected generateRoutes(): {
    routes: Route[]
    fsRoutes: Route[]
    catchAllRoute: Route
    pageChecker: PageChecker
    dynamicRoutes: DynamicRoutes | undefined
  } {
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
            name: 'static catchall',
            fn: async (req, res, params, parsedUrl) => {
              const p = join(this.dir, 'static', ...(params.path || []))
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
          // The commons folder holds commonschunk files
          // The chunks folder holds dynamic entries
          // The buildId folder holds pages and potentially other assets. As buildId changes per build it can be long-term cached.

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
          const pathname = `/${params.path.join('/')}`
            .replace(/\.json$/, '')
            .replace(/\/index$/, '/')

          req.url = pathname
          const parsedUrl = parseUrl(pathname, true)
          await this.render(
            req,
            res,
            pathname,
            { _nextDataReq: '1' },
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
    const routes: Route[] = []

    if (this.customRoutes) {
      const { redirects, rewrites, headers } = this.customRoutes

      const getCustomRoute = (
        r: Rewrite | Redirect | Header,
        type: RouteType
      ) => ({
        ...r,
        type,
        matcher: getCustomRouteMatcher(r.source),
      })

      // Headers come very first
      routes.push(
        ...headers.map(r => {
          const route = getCustomRoute(r, 'header')
          return {
            check: true,
            match: route.matcher,
            type: route.type,
            name: `${route.type} ${route.source} header route`,
            fn: async (_req, res, _params, _parsedUrl) => {
              for (const header of (route as Header).headers) {
                res.setHeader(header.key, header.value)
              }
              return { finished: false }
            },
          } as Route
        })
      )

      const customRoutes = [
        ...redirects.map(r => getCustomRoute(r, 'redirect')),
        ...rewrites.map(r => getCustomRoute(r, 'rewrite')),
      ]

      routes.push(
        ...customRoutes.map(route => {
          return {
            check: true,
            match: route.matcher,
            type: route.type,
            statusCode: (route as Redirect).statusCode,
            name: `${route.type} ${route.source} route`,
            fn: async (_req, res, params, _parsedUrl) => {
              const parsedDestination = parseUrl(route.destination, true)
              const destQuery = parsedDestination.query
              let destinationCompiler = compilePathToRegex(
                `${parsedDestination.pathname!}${parsedDestination.hash || ''}`
              )
              let newUrl

              Object.keys(destQuery).forEach(key => {
                const val = destQuery[key]
                if (
                  typeof val === 'string' &&
                  val.startsWith(':') &&
                  params[val.substr(1)]
                ) {
                  destQuery[key] = params[val.substr(1)]
                }
              })

              try {
                newUrl = destinationCompiler(params)
              } catch (err) {
                if (
                  err.message.match(
                    /Expected .*? to not repeat, but got an array/
                  )
                ) {
                  throw new Error(
                    `To use a multi-match in the destination you must add \`*\` at the end of the param name to signify it should repeat. https://err.sh/zeit/next.js/invalid-multi-match`
                  )
                }
                throw err
              }

              if (route.type === 'redirect') {
                const parsedNewUrl = parseUrl(newUrl)
                const updatedDestination = formatUrl({
                  ...parsedDestination,
                  pathname: parsedNewUrl.pathname,
                  hash: parsedNewUrl.hash,
                  search: undefined,
                })

                res.setHeader('Location', updatedDestination)
                res.statusCode = getRedirectStatus(route as Redirect)

                // Since IE11 doesn't support the 308 header add backwards
                // compatibility using refresh header
                if (res.statusCode === 308) {
                  res.setHeader('Refresh', `0;url=${updatedDestination}`)
                }

                res.end()
                return {
                  finished: true,
                }
              } else {
                ;(_req as any)._nextDidRewrite = true
              }

              return {
                finished: false,
                pathname: newUrl,
                query: parsedDestination.query,
              }
            },
          } as Route
        })
      )
    }

    const catchAllRoute: Route = {
      match: route('/:path*'),
      type: 'route',
      name: 'Catchall render',
      fn: async (req, res, params, parsedUrl) => {
        const { pathname, query } = parsedUrl
        if (!pathname) {
          throw new Error('pathname is undefined')
        }

        // Used in development to check public directory paths
        if (await this._beforeCatchAllRender(req, res, params, parsedUrl)) {
          return {
            finished: true,
          }
        }

        if (params?.path?.[0] === 'api') {
          const handled = await this.handleApiRequest(
            req as NextApiRequest,
            res as NextApiResponse,
            pathname!
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

    if (this.nextConfig.useFileSystemPublicRoutes) {
      this.dynamicRoutes = this.getDynamicRoutes()

      // It's very important to keep this route's param optional.
      // (but it should support as many params as needed, separated by '/')
      // Otherwise this will lead to a pretty simple DOS attack.
      // See more: https://github.com/zeit/next.js/issues/2617
      routes.push(catchAllRoute)
    }

    return {
      routes,
      fsRoutes,
      catchAllRoute,
      dynamicRoutes: this.dynamicRoutes,
      pageChecker: this.hasPage.bind(this),
    }
  }

  private async getPagePath(pathname: string) {
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
  ) {
    return false
  }

  // Used to build API page in development
  protected async ensureApiPage(pathname: string) {}

  /**
   * Resolves `API` request, in development builds on demand
   * @param req http request
   * @param res http response
   * @param pathname path of request
   */
  private async handleApiRequest(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string
  ) {
    let page = pathname
    let params: Params | boolean = false
    let pageFound = await this.hasPage(page)

    if (!pageFound && this.dynamicRoutes) {
      for (const dynamicRoute of this.dynamicRoutes) {
        params = dynamicRoute.match(pathname)
        if (params) {
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

    const builtPagePath = await this.getPagePath(page)
    const pageModule = require(builtPagePath)

    if (!this.renderOpts.dev && this._isLikeServerless) {
      if (typeof pageModule.default === 'function') {
        await pageModule.default(req, res)
        return true
      }
    }

    await apiResolver(req, res, params, pageModule, this.onErrorMiddleware)
    return true
  }

  protected generatePublicRoutes(): Route[] {
    const publicFiles = new Set(
      recursiveReadDirSync(this.publicDir).map(p => p.replace(/\\/g, '/'))
    )

    return [
      {
        match: route('/:path*'),
        name: 'public folder catchall',
        fn: async (req, res, params, parsedUrl) => {
          const path = `/${(params.path || []).join('/')}`

          if (publicFiles.has(path)) {
            await this.serveStatic(
              req,
              res,
              // we need to re-encode it since send decodes it
              join(this.dir, 'public', encodeURIComponent(path)),
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
    const dynamicRoutedPages = Object.keys(this.pagesManifest!).filter(
      isDynamicRoute
    )
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

    const html = await this.renderToHTML(req, res, pathname, query, {})
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
    const isSSG = !!result.unstable_getStaticProps

    // non-spr requests should render like normal
    if (!isSSG) {
      // handle serverless
      if (isLikeServerless) {
        const curUrl = parseUrl(req.url!, true)
        req.url = formatUrl({
          ...curUrl,
          search: undefined,
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
    const isDataReq = query._nextDataReq
    delete query._nextDataReq

    // Compute the SPR cache key
    const ssgCacheKey = parseUrl(req.url || '').pathname!

    // Complete the response with cached data if its present
    const cachedData = await getSprCache(ssgCacheKey)
    if (cachedData) {
      const data = isDataReq
        ? JSON.stringify(cachedData.pageData)
        : cachedData.html

      this.__sendPayload(
        res,
        data,
        isDataReq ? 'application/json' : 'text/html; charset=utf-8',
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
    if (isLikeServerless && isDataReq) {
      let { pathname } = parseUrl(req.url || '', true)
      pathname = !pathname || pathname === '/' ? '/index' : pathname
      req.url = `/_next/data/${this.buildId}${pathname}.json`
    }

    const doRender = withCoalescedInvoke(async function(): Promise<{
      html: string | null
      pageData: any
      sprRevalidate: number | false
    }> {
      let pageData: any
      let html: string | null
      let sprRevalidate: number | false

      let renderResult
      // handle serverless
      if (isLikeServerless) {
        renderResult = await result.Component.renderReqToHTML(req, res, true)

        html = renderResult.html
        pageData = renderResult.renderOpts.pageData
        sprRevalidate = renderResult.renderOpts.revalidate
      } else {
        const renderOpts = {
          ...result,
          ...opts,
        }
        renderResult = await renderToHTML(req, res, pathname, query, renderOpts)

        html = renderResult
        pageData = renderOpts.pageData
        sprRevalidate = renderOpts.revalidate
      }

      return { html, pageData, sprRevalidate }
    })

    return doRender(ssgCacheKey, []).then(
      async ({ isOrigin, value: { html, pageData, sprRevalidate } }) => {
        // Respond to the request if a payload wasn't sent above (from cache)
        if (!isResSent(res)) {
          this.__sendPayload(
            res,
            isDataReq ? JSON.stringify(pageData) : html,
            isDataReq ? 'application/json' : 'text/html; charset=utf-8',
            sprRevalidate
          )
        }

        // Update the SPR cache if the head request
        if (isOrigin) {
          await setSprCache(
            ssgCacheKey,
            { html: html!, pageData },
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
      hasAmp,
    }: {
      amphtml?: boolean
      hasAmp?: boolean
    } = {}
  ): Promise<string | null> {
    return this.findPageComponents(pathname, query)
      .then(
        result => {
          return this.renderToHTMLWithComponents(
            req,
            res,
            pathname,
            result.unstable_getStaticProps
              ? { _nextDataReq: query._nextDataReq }
              : query,
            result,
            { ...this.renderOpts, amphtml, hasAmp }
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
                      ? { _nextDataReq: query._nextDataReq }
                      : query),
                    ...params,
                  },
                  result,
                  {
                    ...this.renderOpts,
                    amphtml,
                    hasAmp,
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
