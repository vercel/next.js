import '../next-server/server/node-polyfill-fetch'
import {
  default as Server,
  ServerConstructor,
} from '../next-server/server/next-server'
import { NON_STANDARD_NODE_ENV } from '../lib/constants'
import * as log from '../build/output/log'
import loadConfig, { NextConfig } from '../next-server/server/config'
import { resolve } from 'path'
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_SERVER,
} from '../next-server/lib/constants'
import { IncomingMessage, ServerResponse } from 'http'
import { UrlWithParsedQuery } from 'url'

type NextServerConstructor = ServerConstructor & {
  /**
   * Whether to launch Next.js in dev mode - @default false
   */
  dev?: boolean
}

let ServerImpl: typeof Server

const getServerImpl = async () => {
  if (ServerImpl === undefined)
    ServerImpl = (await import('../next-server/server/next-server')).default
  return ServerImpl
}

export class NextServer {
  private serverPromise?: Promise<Server>
  private server?: Server
  private reqHandlerPromise?: Promise<any>
  private preparedAssetPrefix?: string
  options: NextServerConstructor

  constructor(options: NextServerConstructor) {
    this.options = options
  }

  getRequestHandler() {
    return async (
      req: IncomingMessage,
      res: ServerResponse,
      parsedUrl?: UrlWithParsedQuery
    ) => {
      const requestHandler = await this.getServerRequestHandler()
      return requestHandler(req, res, parsedUrl)
    }
  }

  setAssetPrefix(assetPrefix: string) {
    if (this.server) {
      this.server.setAssetPrefix(assetPrefix)
    } else {
      this.preparedAssetPrefix = assetPrefix
    }
  }

  logError(...args: Parameters<Server['logError']>) {
    if (this.server) {
      this.server.logError(...args)
    }
  }

  async render(...args: Parameters<Server['render']>) {
    const server = await this.getServer()
    return server.render(...args)
  }

  async renderToHTML(...args: Parameters<Server['renderToHTML']>) {
    const server = await this.getServer()
    return server.renderToHTML(...args)
  }

  async renderError(...args: Parameters<Server['renderError']>) {
    const server = await this.getServer()
    return server.renderError(...args)
  }

  async renderErrorToHTML(...args: Parameters<Server['renderErrorToHTML']>) {
    const server = await this.getServer()
    return server.renderErrorToHTML(...args)
  }

  async render404(...args: Parameters<Server['render404']>) {
    const server = await this.getServer()
    return server.render404(...args)
  }

  async serveStatic(...args: Parameters<Server['serveStatic']>) {
    const server = await this.getServer()
    return server.serveStatic(...args)
  }

  async prepare() {
    const server = await this.getServer()
    return server.prepare()
  }

  async close() {
    const server = await this.getServer()
    return (server as any).close()
  }

  private async createServer(
    options: NextServerConstructor & {
      conf: NextConfig
      isNextDevCommand?: boolean
    }
  ): Promise<Server> {
    if (options.dev) {
      const DevServer = require('./next-dev-server').default
      return new DevServer(options)
    }
    return new (await getServerImpl())(options)
  }

  private async loadConfig() {
    const phase = this.options.dev
      ? PHASE_DEVELOPMENT_SERVER
      : PHASE_PRODUCTION_SERVER
    const dir = resolve(this.options.dir || '.')
    const conf = await loadConfig(phase, dir, this.options.conf)
    return conf
  }

  private async getServer() {
    if (!this.serverPromise) {
      setTimeout(getServerImpl, 10)
      this.serverPromise = this.loadConfig().then(async (conf) => {
        this.server = await this.createServer({
          ...this.options,
          conf,
        })
        if (this.preparedAssetPrefix) {
          this.server.setAssetPrefix(this.preparedAssetPrefix)
        }
        return this.server
      })
    }
    return this.serverPromise
  }

  private async getServerRequestHandler() {
    // Memoize request handler creation
    if (!this.reqHandlerPromise) {
      this.reqHandlerPromise = this.getServer().then((server) =>
        server.getRequestHandler().bind(server)
      )
    }
    return this.reqHandlerPromise
  }
}

// This file is used for when users run `require('next')`
function createServer(options: NextServerConstructor): NextServer {
  const standardEnv = ['production', 'development', 'test']

  if (options == null) {
    throw new Error(
      'The server has not been instantiated properly. https://nextjs.org/docs/messages/invalid-server-options'
    )
  }

  if (
    !(options as any).isNextDevCommand &&
    process.env.NODE_ENV &&
    !standardEnv.includes(process.env.NODE_ENV)
  ) {
    log.warn(NON_STANDARD_NODE_ENV)
  }

  if (options.dev) {
    if (typeof options.dev !== 'boolean') {
      console.warn(
        "Warning: 'dev' is not a boolean which could introduce unexpected behavior. https://nextjs.org/docs/messages/invalid-server-options"
      )
    }
  }

  return new NextServer(options)
}

// Support commonjs `require('next')`
module.exports = createServer
exports = module.exports

// Support `import next from 'next'`
export default createServer
