// @flow
import type {IncomingMessage, ServerResponse} from 'http'
import type {NextConfig} from './config'

import {STATUS_CODES} from 'http'
import {parse as parseUrl} from 'url'
import {parse as parseQuerystring} from 'querystring'
import {resolve, join, sep} from 'path'
import send from 'send'
import {PHASE_PRODUCTION_SERVER, PHASE_DEVELOPMENT_SERVER} from '../lib/constants'
import getConfig from './config'
import * as asset from '../lib/asset' // can be deprecated

type ServerConstructor = {
  dir?: string,
  dev?: boolean,
  quiet?: boolean,
  conf?: NextConfig
}

type UrlParseResult = {
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
}

type Envelope = {
  statusCode: number,
  content?: string,
  headers?: {[key: string]: string},
  filePath?: string
}

async function serveFilePath (req: IncomingMessage, res: ServerResponse, filePath: string) {
  return new Promise((resolve, reject) => {
    send(req, filePath)
      .on('directory', () => {
        // We don't allow directories to be read.
        resolve(false)
      })
      .on('error', () => {
        resolve(false)
      })
      .pipe(res)
      .on('finish', () => {
        resolve(true)
      })
  })
}

async function sendEnvelope (req: IncomingMessage, res: ServerResponse, {statusCode, headers, content, filePath}: Envelope): Promise<void> {
  res.statusCode = statusCode

  if (headers) {
    for (const header of Object.keys(headers)) {
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

export default class Server {
  nextConfig: NextConfig
  distDir: string
  staticDir: string
  dev: boolean
  quiet: boolean
  constructor ({ dir = '.', dev = false, quiet = false, conf }: ServerConstructor = {}) {
    const phase = dev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_SERVER

    this.nextConfig = getConfig(phase, dir, conf)
    this.distDir = join(dir, this.nextConfig.distDir)
    this.staticDir = join(dir, 'static')
    this.dev = dev
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
    const routes = {
      // This is the dynamic imports bundle path
      '/_next/webpack/chunks/:name': async (req: IncomingMessage, res: ServerResponse, params: {name: string}): Envelope => {
        const filePath = join(this.distDir, 'chunks', params.name)
        return this.serveStatic(req, res, filePath)
      },
      // This is to support, webpack dynamic import support with HMR
      '/_next/webpack/:id': async (req: IncomingMessage, res: ServerResponse, params: {id: string}) => {
        const filePath = join(this.distDir, 'chunks', params.id)
        return this.serveStatic(req, res, filePath)
      },
      // Serves the source maps for specific page bundles
      '/_next/:buildId/page/:path*.js.map': async (req: IncomingMessage, res: ServerResponse, params: {path: [string]}): Envelope => {
        const paths = params.path || ['']
        const page = `/${paths.join('/')}`
        const filePath = join(this.distDir, 'bundles', 'pages', `${page}.js.map`)
        return this.serveStatic(req, res, filePath)
      },
      // Serves the page bundles
      '/_next/:buildId/page/:path*.js': async (req: IncomingMessage, res: ServerResponse, params: {path: [string]}): Envelope => {
        const paths = params.path || ['']
        const page = `/${paths.join('/')}`
        const filePath = join(this.distDir, 'bundles', 'pages', `${page}.js`)
        return this.serveStatic(req, res, filePath)
      },
      // Serves the .next/static files
      '/_next/static/:path*.js.map': async (req: IncomingMessage, res: ServerResponse, params: {path: [string]}): Envelope => {
        const filePath = join(this.distDir, 'static', ...(params.path || []))
        return this.serveStatic(req, res, filePath)
      },
      // It's very important keep this route's param optional.
      // (but it should support as many as params, seperated by '/')
      // Othewise this will lead to a pretty simple DOS attack.
      // See more: https://github.com/zeit/next.js/issues/2617
      '/static/:path*': async (req: IncomingMessage, res: ServerResponse, params: {path: [string]}): Envelope => {
        const filePath = join(this.dir, 'static', ...(params.path || []))
        return this.serveStatic(req, res, filePath)
      }
    }

    if (useFileSystemPublicRoutes) {
      routes['/:path*'] = async (req, res, params, parsedUrl) => {
        const { pathname, query } = parsedUrl
        return this.render(req, res, pathname, query, parsedUrl)
      }
    }
  }

  async prepare (): Promise<void> {
    await this.defineRoutes()
  }

  async handleRequest (req: IncomingMessage, res: ServerResponse, parsedUrl?: UrlParseResult): Promise<void> {
    // Parse url if parsedUrl not provided
    if (!parsedUrl || typeof parsedUrl !== 'object') {
      parsedUrl = parseUrl(req.url, true)
    }

    // Parse the querystring ourselves if the user doesn't handle querystring parsing
    if (typeof parsedUrl.query === 'string') {
      parsedUrl.query = parseQuerystring(parsedUrl.query)
    }

    res.statusCode = 200
    try {
      await this.run(req, res, parsedUrl)
    } catch (err) {
      this.log(() => console.error(err))
      res.statusCode = 500
      res.end(STATUS_CODES[500])
    }
  }

  getRequestHandler (): (req: IncomingMessage, res: ServerResponse, parsedUrl?: UrlParseResult) => Promise<void> {
    return this.handleRequest.bind(this)
  }

  async runEnvelope (req: IncomingMessage, res: ServerResponse, parsedUrl?: UrlParseResult): Promise<Envelope> {
    // Next.js only implements GET and HEAD requests. Anything else is a 501
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return {
        statusCode: 501,
        content: STATUS_CODES[501]
      }
    }

    return {
      statusCode: 404,
      content: '404'
    }
  }

  async run (req: IncomingMessage, res: ServerResponse, parsedUrl?: UrlParseResult): Promise<void> {
    const envelope = await this.runEnvelope(req, res, parsedUrl)
    await sendEnvelope(req, res, envelope)
  }
}
