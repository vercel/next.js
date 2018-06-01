// @flow
import type {IncomingMessage, ServerResponse} from 'http'
import type {NextConfig} from './config'

import {STATUS_CODES} from 'http'
import {parse as parseUrl} from 'url'
import {parse as parseQuerystring} from 'querystring'
import {join} from 'path'
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
  content: string,
  headers?: {[key: string]: string}
}

async function sendEnvelope (res: ServerResponse, {statusCode, headers, content}: Envelope): Promise<void> {
  res.statusCode = statusCode

  if (headers) {
    for (const header of Object.keys(headers)) {
      res.setHeader(header, headers[header])
    }
  }

  res.end(content)
}

export default class Server {
  nextConfig: NextConfig
  distDir: string
  dev: boolean
  quiet: boolean
  constructor ({ dir = '.', dev = false, quiet = false, conf }: ServerConstructor = {}) {
    const phase = dev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_SERVER

    this.nextConfig = getConfig(phase, dir, conf)
    this.distDir = join(dir, this.nextConfig.distDir)
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

  async prepare (): Promise<void> {
    // await this.defineRoutes()
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
    await sendEnvelope(res, envelope)
  }
}
