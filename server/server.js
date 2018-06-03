// @flow
import type {IncomingMessage, ServerResponse} from 'http'
import type {MatchedPath} from './lib/path-match'
import type {NextConfig} from './config'

import {STATUS_CODES} from 'http'
import fs from 'fs'
import {parse as parseUrl} from 'url'
import {parse as parseQuerystring} from 'querystring'
import {resolve, join, sep} from 'path'
import send from 'send'
import { createElement } from 'react'
import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import {PHASE_PRODUCTION_SERVER, PHASE_DEVELOPMENT_SERVER, BLOCKED_PAGES, BUILD_MANIFEST, SERVER_DIRECTORY} from '../lib/constants'
import pathMatch from './lib/path-match'
import getConfig from './config'
import * as asset from '../lib/asset' // can be deprecated
import { Router as NextRouter } from '../lib/router'
import { loadGetInitialProps, isResSent } from '../lib/utils'
import requirePage from './require-page'
import Head, { defaultHead } from '../lib/head'

const route = pathMatch()

type ServerConstructor = {|
  dir?: string,
  dev?: boolean,
  quiet?: boolean,
  staticMarkup?: boolean,
  conf?: NextConfig
|}

type UrlParseResult = {|
  protocol?: string;
  slashes?: boolean;
  auth?: string;
  host?: string;
  port?: string;
  hostname?: string;
  hash?: string;
  search?: string;
  query?: any; // null | string | Object
  pathname?: string;
  path?: string;
  href: string;
|}

type ParsedUrl = {|
  protocol?: string;
  slashes?: boolean;
  auth?: string;
  host?: string;
  port?: string;
  hostname?: string;
  hash?: string;
  search?: string;
  query: any; // null | string | Object
  pathname: string;
  path: string;
  href: string;
|}

type Envelope = {|
  statusCode: number,
  content?: string,
  headers?: {|[key: string]: string|},
  filePath?: string,
  finished?: boolean
|}

type Route = {|
  match: (url: string) => *,
  execute: (req: IncomingMessage, res: ServerResponse, params: MatchedPath, parsedUrl: ParsedUrl) => Promise<Envelope>
|}

async function serveFilePath (req: IncomingMessage, res: ServerResponse, filePath: string) {
  return new Promise((resolve, reject) => {
    send(req, filePath)
      .on('directory', () => {
        // We don't allow directories to be read.
        resolve(false)
      })
      .on('error', (err) => {
        // If the file is not found we mark it as not serveable
        if (err.code === 'ENOENT') {
          resolve(false)
          return
        }
        // If the error was anything else we throw
        reject(err)
      })
      .pipe(res)
      .on('finish', () => {
        resolve(true)
      })
  })
}

async function sendEnvelope (req: IncomingMessage, res: ServerResponse, {statusCode, headers, content, filePath, finished}: Envelope): Promise<void> {
  if(finished) {
    return
  }

  res.statusCode = statusCode

  if (headers) {
    for (const header in headers) {
      res.setHeader(header, headers[header])
    }
  }

  // If a filePath is provided we serve the file contents instead of the `content` property
  if (filePath) {
    const servedFile = await serveFilePath(req, res, filePath)
    if (!servedFile) {
      // If the file couldn't be served we return a 404 status
      res.statusCode = 404
      res.end(STATUS_CODES[404])
      return
    }
  }

  res.end(content)
}

function normalizeUrl (req: IncomingMessage, parsedUrl?: UrlParseResult): ParsedUrl {
  if (parsedUrl && typeof parsedUrl === 'object' && typeof parsedUrl.query === 'object') {
    return {...parsedUrl}
  }
  // Parse url if parsedUrl not provided
  if (!parsedUrl || typeof parsedUrl !== 'object') {
    return {...parseUrl(req.url, true)}
  }

  // Parse the querystring ourselves if the user doesn't handle querystring parsing
  if (typeof parsedUrl.query === 'string') {
    return {...parsedUrl, query: parseQuerystring(parsedUrl.query)}
  }

  return {...parsedUrl}
}

// Used to load _app and _document
function getComponent(distDir, page) {
  const componentPath = join(distDir, SERVER_DIRECTORY, 'bundles', 'pages', page)
  const mod = require(componentPath)
  const Component = mod.default || mod
  if (!Component.prototype || !Component.prototype.isReactComponent) {
    throw new Error(`pages${page}.js is not exporting a React element`)
  }

  return Component
}

export default class Server {
  nextConfig: NextConfig
  distDir: string
  staticDir: string
  dev: boolean
  quiet: boolean
  routes: Array<Route>
  buildManifest: *
  DocumentComponent: *
  AppComponent: *
  staticMarkup: boolean
  buildId: string
  constructor ({ dir = '.', dev = false, quiet = false, staticMarkup = false, conf }: ServerConstructor = {}) {
    const phase = dev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_SERVER

    this.nextConfig = getConfig(phase, dir, conf)
    this.distDir = join(dir, this.nextConfig.distDir)
    this.staticDir = join(dir, 'static')
    this.dev = dev
    this.staticMarkup = staticMarkup
    this.buildId = this.readBuildId()
    this.buildManifest = require(join(this.distDir, BUILD_MANIFEST))
    // Preload Document and App since they're not dynamic
    this.DocumentComponent = getComponent(this.distDir, '/_document')
    this.AppComponent = getComponent(this.distDir, '/_app')
  }

  readBuildId () {
    const buildIdPath = join(this.distDir, 'BUILD_ID')
    const buildId = fs.readFileSync(buildIdPath, 'utf8')
    return buildId.trim()
  }

  setAssetPrefix (prefix: string): void {
    this.nextConfig.assetPrefix = prefix.replace(/\/$/, '')
    asset.setAssetPrefix(this.nextConfig.assetPrefix)
  }

  log (fn: () => void): void {
    if (this.quiet) {
      return
    }

    fn()
  }

  isServeableUrl (path: string) {
    const resolved = resolve(path)
    if (
      resolved.indexOf(this.distDir + sep) !== 0 &&
      resolved.indexOf(this.staticDir + sep) !== 0
    ) {
      // Seems like the user is trying to traverse the filesystem.
      return false
    }

    return true
  }

  async serveStatic (req: IncomingMessage, res: ServerResponse, filePath: string): Promise<Envelope> {
    if (!this.isServeableUrl(filePath)) {
      // There's no need to render a full 404 page here, since it's just a static file.
      return {
        statusCode: 404,
        content: STATUS_CODES[404]
      }
    }

    return {
      statusCode: 200,
      filePath
    }
  }

  async defineRoutes (): Promise<void> {
    const {useFileSystemPublicRoutes} = this.nextConfig
    const routes: Array<Route> = [
      {
        // This is the dynamic imports bundle path        
        match: route('/_next/webpack/chunks/:name'),
        execute: async (req, res, params: {name: string}) => {
          const filePath = join(this.distDir, 'chunks', params.name)
          return this.serveStatic(req, res, filePath)
        }
      },
      {
        // This is to support, webpack dynamic import support with HMR        
        match: route('/_next/webpack/:id'),
        execute: async (req, res, params: {id: string}) => {
          const filePath = join(this.distDir, 'chunks', params.id)
          return this.serveStatic(req, res, filePath)
        }
      },
      {
        // Serves the source maps for specific page bundles        
        match: route('/_next/:buildId/page/:path*.js.map'),
        execute: async (req, res, params: {path: string[]}) => {
          const paths = params.path || ['']
          const page = `/${paths.join('/')}`
          const filePath = join(this.distDir, 'bundles', 'pages', `${page}.js.map`)
          return this.serveStatic(req, res, filePath)
        }        
      },
      {
        // Serves the page client side javascript        
        match: route('/_next/:buildId/page/:path*.js'),
        execute: async(req, res, params: {path: string[]}) => {
          const paths = params.path || ['']
          const page = `/${paths.join('/')}`
          const filePath = join(this.distDir, 'bundles', 'pages', `${page}.js`)
          return this.serveStatic(req, res, filePath)
        }
      },
      {
        // Serves the .next/static files
        match: route('/_next/static/:path*'),
        execute: async (req, res, params: {path: string[]}) => {
          const filePath = join(this.distDir, 'static', ...(params.path || []))
          return this.serveStatic(req, res, filePath)
        }        
      },
      {
        // It's very important keep this route's param optional.
        // (but it should support as many as params, seperated by '/')
        // Othewise this will lead to a pretty simple DOS attack.
        // See more: https://github.com/zeit/next.js/issues/2617
        // Serves the /static files      
        match: route('/static/:path*'),
        execute: async (req, res, params: {path: string[]}) => {
          const filePath = join(this.staticDir, ...(params.path || []))
          return this.serveStatic(req, res, filePath)
        }
      }
    ]

    if (useFileSystemPublicRoutes) {
      // This is the route that renders all pages
      routes.push({
        // It's very important keep this route's param optional.
        // (but it should support as many as params, seperated by '/')
        // Othewise this will lead to a pretty simple DOS attack.
        // See more: https://github.com/zeit/next.js/issues/2617
        // Serves the /static files      
        match: route('/:path*'),
        execute: async (req, res, params, parsedUrl) => {
          const { pathname, query } = parsedUrl
          return this.render(req, res, pathname, query, parsedUrl)
        }
      })
    }

    this.routes = routes
  }

  async match(req: IncomingMessage, res: ServerResponse, parsedUrl: ParsedUrl): Promise<(() => Promise<Envelope>) | false> {
    const {pathname} = parsedUrl

    if(!this.routes) {
      throw new Error('No routes defined')
    }

    for(const route of this.routes) {
      const params = route.match(pathname)
      if(params) {
        return async (): Promise<Envelope> => {
          return route.execute(req, res, params, parsedUrl)
        }
      }
    }

    return false
  }

  async render (req: IncomingMessage, res: ServerResponse, pathname: string, query: {|[string]: *|}, parsedUrl: ParsedUrl): Promise<Envelope> {
    // Block internal pages that shouldn't be rendered directly
    if (BLOCKED_PAGES.indexOf(pathname) !== -1) {
      return {
        statusCode: 404,
        content: STATUS_CODES[404]
      }
    }

    const dev = this.dev
    const App = this.AppComponent
    const Document = this.DocumentComponent
    const buildManifest = this.buildManifest
    const staticMarkup = this.staticMarkup
    const buildId = this.buildId
    const assetPrefix = this.nextConfig.assetPrefix
    let runtimeConfig
    const nextExport = false
    let err
    const PageComponent = await requirePage(pathname, {distDir: this.distDir})

    const asPath = req.url
    const router = new NextRouter(pathname, query, asPath)    
    // const ctx = { err, req, res, pathname, query, asPath }
    const pageContext = { req, res, pathname, query, asPath }
    const appContext = {Component: PageComponent, router, ctx: pageContext}
    const props = await loadGetInitialProps(App, appContext)

    // the response might be finished by the user using getInitialProps
    if (isResSent(res)) {
      return {
        finished: true
      }
    }

    const renderPage = (enhancer = Page => Page) => {
      const app = createElement(App, {
        Component: enhancer(PageComponent),
        router,
        ...props
      })

      const render = staticMarkup ? renderToStaticMarkup : renderToString

      let html
      let head
      let errorHtml = ''

      try {
        html = render(app)
      } finally {
        head = Head.rewind() || defaultHead()
      }
      // const chunks = loadChunks({ dev, dir, dist, availableChunks })
      const chunks = {
        names: [],
        filenames: []
      }

      return { html, head, errorHtml, chunks, buildManifest }
    }

    const documentContext = { ...pageContext, renderPage }
    const documentProps = await loadGetInitialProps(Document, documentContext)

    // the response might be finished by the user using getInitialProps
    if (isResSent(res)) {
      return {
        finished: true
      }
    }

    const documentElement = createElement(Document, {
      __NEXT_DATA__: {
        props,
        page: pathname, // the rendered page
        pathname, // the requested path
        query,
        buildId,
        assetPrefix,
        runtimeConfig,
        nextExport,
        err: (err) ? serializeError(dev, err) : null
      },
      dev,
      staticMarkup,
      buildManifest,
      ...documentProps
    })
    
    // Since the document is not rehydrated on the client side we render to static markup
    const documentHTML = '<!DOCTYPE html>' + renderToStaticMarkup(documentElement)

    return {
      statusCode: 200,
      content: documentHTML
    }
  }

  async prepare (): Promise<void> {
    await this.defineRoutes()
  }

  async handleRequest (req: IncomingMessage, res: ServerResponse, parsedUrl?: UrlParseResult): Promise<void> {
    const url = normalizeUrl(req, parsedUrl)

    try {
      await this.run(req, res, url)
    } catch (err) {
      this.log(() => console.error(err))
      res.statusCode = 500
      res.end(STATUS_CODES[500])
    }
  }

  getRequestHandler (): (req: IncomingMessage, res: ServerResponse, parsedUrl?: UrlParseResult) => Promise<void> {
    return this.handleRequest.bind(this)
  }

  async runEnvelope (req: IncomingMessage, res: ServerResponse, parsedUrl: ParsedUrl): Promise<Envelope> {
    // Next.js only implements GET and HEAD requests. Anything else is a 501
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return {
        statusCode: 501,
        content: STATUS_CODES[501]
      }
    }

    const fn = await this.match(req, res, parsedUrl)

    if(fn) {
      const envelope = await fn()
      return envelope
    }

    return {
      statusCode: 404,
      content: STATUS_CODES[404]
    }
  }

  async run (req: IncomingMessage, res: ServerResponse, parsedUrl: ParsedUrl): Promise<void> {
    const envelope = await this.runEnvelope(req, res, parsedUrl)
    await sendEnvelope(req, res, envelope)
  }
}
