/* eslint-disable import/first */
import { IncomingMessage, ServerResponse } from 'http'
import { resolve, join, sep } from 'path'
import { parse as parseUrl, UrlWithParsedQuery } from 'url'
import { parse as parseQs, ParsedUrlQuery } from 'querystring'
import fs from 'fs'
import { renderToHTML } from './render'
import { sendHTML } from './send-html'
import { serveStatic } from './serve-static'
import Router, { route, Route } from './router'
import { isInternalUrl, isBlockedPage } from './utils'
import loadConfig from './config'
import { recursiveReadDirSync } from './lib/recursive-readdir-sync'
import {
  PHASE_PRODUCTION_SERVER,
  BUILD_ID_FILE,
  CLIENT_PUBLIC_FILES_PATH,
  CLIENT_STATIC_FILES_PATH,
  CLIENT_STATIC_FILES_RUNTIME,
  SERVER_DIRECTORY,
  PAGES_MANIFEST,
} from '../lib/constants'
import * as envConfig from '../lib/runtime-config'
import { loadComponents, interopDefault } from './load-components'
import { getPagePath } from './require';

type NextConfig = any

export type ServerConstructor = {
  dir?: string
  staticMarkup?: boolean
  quiet?: boolean
  conf?: NextConfig,
}

export default class Server {
  dir: string
  quiet: boolean
  nextConfig: NextConfig
  distDir: string
  publicDir: string
  buildId: string
  renderOpts: {
    poweredByHeader: boolean
    ampBindInitData: boolean
    staticMarkup: boolean
    buildId: string
    generateEtags: boolean
    runtimeConfig?: { [key: string]: any }
    assetPrefix?: string,
  }
  router: Router

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
    parsedUrl?: UrlWithParsedQuery,
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
    return this.run(req, res, parsedUrl).catch((err) => {
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
            ...(params.path || []),
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
          await this.handleApiRequest(req, res, pathname!)
        },
      },
    ]

    if (fs.existsSync(this.publicDir)) {
      routes.push(...this.generatePublicRoutes())
    }

    if (this.nextConfig.useFileSystemPublicRoutes) {
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
  private async handleApiRequest(req: IncomingMessage, res: ServerResponse, pathname: string) {
    const resolverFunction = await this.resolveApiRequest(pathname)
    if (resolverFunction === null) {
      res.statusCode = 404
      res.end('Not Found')
      return
    }

    const resolver = interopDefault(require(resolverFunction))
    resolver(req, res)
  }

  /**
   * Resolves path to resolver function
   * @param pathname path of request
   */
  private resolveApiRequest(pathname: string) {
    return getPagePath(pathname, this.distDir, this.nextConfig.target === 'serverless')
  }

  private generatePublicRoutes(): Route[] {
    const routes: Route[] = []
    const publicFiles = recursiveReadDirSync(this.publicDir)
    const serverBuildPath = join(this.distDir, SERVER_DIRECTORY)
    const pagesManifest = require(join(serverBuildPath, PAGES_MANIFEST))

    publicFiles.forEach((path) => {
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

  private async run(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: UrlWithParsedQuery,
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
    html: string,
  ) {
    const { generateEtags, poweredByHeader } = this.renderOpts
    return sendHTML(req, res, html, { generateEtags, poweredByHeader })
  }

  public async render(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    query: ParsedUrlQuery = {},
    parsedUrl?: UrlWithParsedQuery,
  ): Promise<void> {
    const url: any = req.url
    if (isInternalUrl(url)) {
      return this.handleRequest(req, res, parsedUrl)
    }

    if (isBlockedPage(pathname)) {
      return this.render404(req, res, parsedUrl)
    }

    const html = await this.renderToHTML(req, res, pathname, query, {
      dataOnly: this.renderOpts.ampBindInitData && Boolean(query.dataOnly) || (req.headers && (req.headers.accept || '').indexOf('application/amp.bind+json') !== -1),
    })
    // Request was ended by the user
    if (html === null) {
      return
    }

    return this.sendHTML(req, res, html)
  }

  private async renderToHTMLWithComponents(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    query: ParsedUrlQuery = {},
    opts: any,
  ) {
    const serverless = this.nextConfig.target === 'serverless'
    // try serving a static AMP version first
    if (query.amp) {
      try {
        const result = await loadComponents(this.distDir, this.buildId, (pathname === '/' ? '/index' : pathname) + '.amp', serverless)
        if (typeof result.Component === 'string') return result.Component
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
    }
    const result = await loadComponents(this.distDir, this.buildId, pathname, serverless)
    // handle static page
    if (typeof result.Component === 'string') return result.Component
    // handle serverless
    if (typeof result.Component === 'object' &&
      typeof result.Component.renderReqToHTML === 'function'
    ) {
      return result.Component.renderReqToHTML(req, res)
    }
    return renderToHTML(req, res, pathname, query, { ...result, ...opts })
  }

  public async renderToHTML(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    query: ParsedUrlQuery = {},
    { amphtml, dataOnly, hasAmp }: {
      amphtml?: boolean,
      hasAmp?: boolean,
      dataOnly?: boolean,
    } = {},
  ): Promise<string | null> {
    try {
      // To make sure the try/catch is executed
      const html = await this.renderToHTMLWithComponents(
        req,
        res,
        pathname,
        query,
        { ...this.renderOpts, amphtml, hasAmp, dataOnly },
      )
      return html
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        res.statusCode = 404
        return this.renderErrorToHTML(null, req, res, pathname, query)
      } else {
        this.logError(err)
        res.statusCode = 500
        return this.renderErrorToHTML(err, req, res, pathname, query)
      }
    }
  }

  public async renderError(
    err: Error | null,
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    query: ParsedUrlQuery = {},
  ): Promise<void> {
    res.setHeader(
      'Cache-Control',
      'no-cache, no-store, max-age=0, must-revalidate',
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
    query: ParsedUrlQuery = {},
  ) {
    return this.renderToHTMLWithComponents(req, res, '/_error', query, {
      ...this.renderOpts,
      err,
    })
  }

  public async render404(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl?: UrlWithParsedQuery,
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
    parsedUrl?: UrlWithParsedQuery,
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
          }' directory! Try building your app with 'next build' before starting the server.`,
        )
      }

      throw err
    }
  }
}
