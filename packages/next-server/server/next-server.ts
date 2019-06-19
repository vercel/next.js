import fs from 'fs'
import { IncomingMessage, ServerResponse } from 'http'
import { join, resolve, sep } from 'path'
import { parse as parseQs, ParsedUrlQuery } from 'querystring'
import { parse as parseUrl, UrlWithParsedQuery } from 'url'

import {
  BUILD_ID_FILE,
  BUILD_MANIFEST,
  CLIENT_PUBLIC_FILES_PATH,
  CLIENT_STATIC_FILES_PATH,
  CLIENT_STATIC_FILES_RUNTIME,
  PAGES_MANIFEST,
  PHASE_PRODUCTION_SERVER,
  SERVER_DIRECTORY,
  SERVERLESS_DIRECTORY,
} from '../lib/constants'
import {
  getRouteMatcher,
  getRouteRegex,
  getSortedRoutes,
} from '../lib/router/utils'
import * as envConfig from '../lib/runtime-config'
import { NextApiRequest, NextApiResponse } from '../lib/utils'
import { parse as parseCookies } from 'cookie'
import {
  parseQuery,
  sendJson,
  sendData,
  parseBody,
  sendError,
  ApiError,
  sendStatusCode,
} from './api-utils'
import loadConfig from './config'
import { recursiveReadDirSync } from './lib/recursive-readdir-sync'
import {
  interopDefault,
  loadComponents,
  LoadComponentsReturnType,
} from './load-components'
import { renderToHTML } from './render'
import { getPagePath } from './require'
import Router, { route, Route, RouteMatch } from './router'
import { sendHTML } from './send-html'
import { serveStatic } from './serve-static'
import { isBlockedPage, isInternalUrl } from './utils'

type NextConfig = any

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
}

export default class Server {
  dir: string
  quiet: boolean
  nextConfig: NextConfig
  distDir: string
  publicDir: string
  buildManifest: string
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
    autoExport: boolean
    dev?: boolean
  }
  router: Router
  private dynamicRoutes?: Array<{ page: string; match: RouteMatch }>

  public constructor({
    dir = '.',
    staticMarkup = false,
    quiet = false,
    conf = null,
  }: ServerConstructor = {}) {
    this.dir = resolve(dir)
    this.quiet = quiet
    const phase = this.currentPhase()
    this.nextConfig = loadConfig(phase, this.dir, conf)
    this.distDir = join(this.dir, this.nextConfig.distDir)
    // this.pagesDir = join(this.dir, 'pages')
    this.publicDir = join(this.dir, CLIENT_PUBLIC_FILES_PATH)
    this.buildManifest = join(this.distDir, BUILD_MANIFEST)

    // Only serverRuntimeConfig needs the default
    // publicRuntimeConfig gets it's default in client/index.js
    const {
      serverRuntimeConfig = {},
      publicRuntimeConfig,
      assetPrefix,
      generateEtags,
    } = this.nextConfig

    this.buildId = this.readBuildId()

    this.renderOpts = {
      ampBindInitData: this.nextConfig.experimental.ampBindInitData,
      poweredByHeader: this.nextConfig.poweredByHeader,
      canonicalBase: this.nextConfig.amp.canonicalBase,
      autoExport: this.nextConfig.experimental.autoExport,
      staticMarkup,
      buildId: this.buildId,
      generateEtags,
    }

    // Only the `publicRuntimeConfig` key is exposed to the client side
    // It'll be rendered as part of __NEXT_DATA__ on the client side
    if (publicRuntimeConfig) {
      this.renderOpts.runtimeConfig = publicRuntimeConfig
    }

    // Initialize next/config with the environment configuration
    envConfig.setConfig({
      serverRuntimeConfig,
      publicRuntimeConfig,
    })

    const routes = this.generateRoutes()
    this.router = new Router(routes)

    this.setAssetPrefix(assetPrefix)
  }

  private currentPhase(): string {
    return PHASE_PRODUCTION_SERVER
  }

  private logError(...args: any): void {
    if (this.quiet) return
    // tslint:disable-next-line
    console.error(...args)
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
  private async close(): Promise<void> {}

  private setImmutableAssetCacheControl(res: ServerResponse) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  }

  private generateRoutes(): Route[] {
    const routes: Route[] = [
      {
        match: route('/_next/static/:path*'),
        fn: async (req, res, params, parsedUrl) => {
          // The commons folder holds commonschunk files
          // The chunks folder holds dynamic entries
          // The buildId folder holds pages and potentially other assets. As buildId changes per build it can be long-term cached.
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
        match: route('/_next/:path*'),
        // This path is needed because `render()` does a check for `/_next` and the calls the routing again
        fn: async (req, res, _params, parsedUrl) => {
          await this.render404(req, res, parsedUrl)
        },
      },
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
      },
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

    if (fs.existsSync(this.publicDir)) {
      routes.push(...this.generatePublicRoutes())
    }

    if (this.nextConfig.useFileSystemPublicRoutes) {
      this.dynamicRoutes = this.nextConfig.experimental.dynamicRouting
        ? this.getDynamicRoutes()
        : []

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
    const resolverFunction = await this.resolveApiRequest(pathname)
    if (resolverFunction === null) {
      res.statusCode = 404
      res.end('Not Found')
      return
    }

    try {
      // Parsing of cookies
      req.cookies = parseCookies(req.headers.cookie || '')
      // Parsing query string
      req.query = parseQuery(req)
      // // Parsing of body
      req.body = await parseBody(req)

      res.status = statusCode => sendStatusCode(res, statusCode)
      res.send = data => sendData(res, data)
      res.json = data => sendJson(res, data)

      const resolver = interopDefault(require(resolverFunction))
      resolver(req, res)
    } catch (e) {
      if (e instanceof ApiError) {
        sendError(res, e.statusCode, e.message)
      } else {
        sendError(res, 500, e.message)
      }
    }
  }

  /**
   * Resolves path to resolver function
   * @param pathname path of request
   */
  private resolveApiRequest(pathname: string) {
    return getPagePath(
      pathname,
      this.distDir,
      this.nextConfig.target === 'serverless'
    )
  }

  private generatePublicRoutes(): Route[] {
    const routes: Route[] = []
    const publicFiles = recursiveReadDirSync(this.publicDir)
    const serverBuildPath = join(
      this.distDir,
      this.nextConfig.target === 'serverless'
        ? SERVERLESS_DIRECTORY
        : SERVER_DIRECTORY
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

  private getDynamicRoutes() {
    const manifest = require(this.buildManifest)
    const dynamicRoutedPages = Object.keys(manifest.pages).filter(p =>
      p.includes('/$')
    )
    return getSortedRoutes(dynamicRoutedPages).map(page => ({
      page,
      match: getRouteMatcher(getRouteRegex(page)),
    }))
  }

  private async run(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: UrlWithParsedQuery
  ) {
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

    if (req.method === 'GET' || req.method === 'HEAD') {
      await this.render404(req, res, parsedUrl)
    } else {
      res.statusCode = 501
      res.end('Not Implemented')
    }
  }

  private async sendHTML(
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
    if (isInternalUrl(url)) {
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
    const serverless =
      !this.renderOpts.dev && this.nextConfig.target === 'serverless'
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

  private async renderToHTMLWithComponents(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    query: ParsedUrlQuery = {},
    result: LoadComponentsReturnType,
    opts: any
  ) {
    // handle static page
    if (typeof result.Component === 'string') {
      return result.Component
    }

    // handle serverless
    if (
      typeof result.Component === 'object' &&
      typeof result.Component.renderReqToHTML === 'function'
    ) {
      return result.Component.renderReqToHTML(req, res)
    }

    return renderToHTML(req, res, pathname, query, {
      ...result,
      ...opts,
      PageConfig: result.PageConfig,
    })
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
              result =>
                this.renderToHTMLWithComponents(
                  req,
                  res,
                  dynamicRoute.page,
                  { ...query, ...params },
                  result,
                  { ...this.renderOpts, amphtml, hasAmp, dataOnly }
                )
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

    try {
      await serveStatic(req, res, path)
    } catch (err) {
      if (err.code === 'ENOENT' || err.statusCode === 404) {
        this.render404(req, res, parsedUrl)
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

  private readBuildId(): string {
    const buildIdFile = join(this.distDir, BUILD_ID_FILE)
    try {
      return fs.readFileSync(buildIdFile, 'utf8').trim()
    } catch (err) {
      if (!fs.existsSync(buildIdFile)) {
        throw new Error(
          `Could not find a valid build in the '${
            this.distDir
          }' directory! Try building your app with 'next build' before starting the server.`
        )
      }

      throw err
    }
  }
}
