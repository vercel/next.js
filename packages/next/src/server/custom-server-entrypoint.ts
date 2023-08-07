import type { Options as DevServerOptions } from './dev/next-dev-server'
import type { NodeRequestHandler } from './next-server'
import type { UrlWithParsedQuery } from 'url'
import type { NextConfigComplete } from './config-shared'
import type { IncomingMessage, ServerResponse } from 'http'
import {
  type NextParsedUrlQuery,
  type NextUrlWithParsedQuery,
} from './request-meta'

import './require-hook'
import './node-polyfill-fetch'
import './node-polyfill-crypto'

import type { default as Server } from './next-server'
import * as log from '../build/output/log'
import loadConfig from './config'
import { resolve } from 'path'
import { NON_STANDARD_NODE_ENV } from '../lib/constants'
import { PHASE_DEVELOPMENT_SERVER } from '../shared/lib/constants'
import { PHASE_PRODUCTION_SERVER } from '../shared/lib/constants'
import { getTracer } from './lib/trace/tracer'
import { NextServerSpan } from './lib/trace/constants'
import { formatUrl } from '../shared/lib/router/utils/format-url'
import {
  WorkerRequestHandler,
  WorkerUpgradeHandler,
} from './lib/setup-server-worker'
import { checkIsNodeDebugging } from './lib/is-node-debugging'

let ServerImpl: typeof Server

const getServerImpl = async () => {
  if (ServerImpl === undefined) {
    ServerImpl = (await Promise.resolve(require('./next-server'))).default
  }
  return ServerImpl
}

export type NextServerOptions = Partial<DevServerOptions> & {
  preloadedConfig?: NextConfigComplete
  internal_setStandaloneConfig?: boolean
}

export interface RequestHandler {
  (
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl?: NextUrlWithParsedQuery | undefined
  ): Promise<void>
}

const SYMBOL_LOAD_CONFIG = Symbol('next.load_config')

class NextServer {
  private serverPromise?: Promise<Server>
  private server?: Server
  private preparedAssetPrefix?: string
  private didWebSocketSetup: boolean = false
  private requestHandler: WorkerRequestHandler
  private upgradeHandler: WorkerUpgradeHandler
  private dir: string

  private standaloneMode: boolean = true

  public options: NextServerOptions

  constructor(dir: string, options: NextServerOptions) {
    this.dir = dir
    this.options = options
  }

  get hostname() {
    return this.options.hostname
  }

  get port() {
    return this.options.port
  }

  private setupWebSocketHandler(
    customServer?: import('http').Server,
    _req?: IncomingMessage
  ) {
    if (!this.didWebSocketSetup) {
      this.didWebSocketSetup = true
      customServer = customServer || (_req?.socket as any)?.server

      if (!customServer) {
        // this is very unlikely to happen but show an error in case
        // it does somehow
        console.error(
          `Invalid IncomingMessage received, make sure http.createServer is being used to handle requests.`
        )
      } else {
        customServer.on('upgrade', async (req, socket, head) => {
          this.upgradeHandler(req, socket, head)
        })
      }
    }
  }

  getRequestHandler(): RequestHandler {
    return async (
      req: IncomingMessage,
      res: ServerResponse,
      parsedUrl?: UrlWithParsedQuery
    ) => {
      this.setupWebSocketHandler(this.options.httpServer, req)

      if (parsedUrl) {
        req.url = formatUrl(parsedUrl)
      }

      return getTracer().trace(NextServerSpan.getRequestHandler, async () => {
        return this.requestHandler(req, res)
      })
    }
  }

  getUpgradeHandler() {
    return async (req: IncomingMessage, socket: any, head: any) => {
      this.upgradeHandler(req, socket, head)
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

  async render(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    query?: NextParsedUrlQuery,
    parsedUrl?: NextUrlWithParsedQuery
  ): Promise<void> {
    if (!pathname.startsWith('/')) {
      console.error(`Cannot render page with path "${pathname}"`)
      pathname = `/${pathname}`
    }
    pathname = pathname === '/index' ? '/' : pathname

    req.url = formatUrl({
      ...parsedUrl,
      pathname,
      query,
    })

    await this.requestHandler(req, res)
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

  async prepare() {
    const { getRouterRequestHandlers } =
      require('./lib/get-router-request-handlers') as typeof import('./lib/get-router-request-handlers')

    const isNodeDebugging = checkIsNodeDebugging()

    const initResult = await getRouterRequestHandlers({
      dir: this.dir,
      port: this.options.port || 3000,
      isDev: !!this.options.dev,
      hostname: this.options.hostname || 'localhost',
      minimalMode: this.options.minimalMode,
      isNodeDebugging: !!isNodeDebugging,
    })
    this.requestHandler = initResult[0]
    this.upgradeHandler = initResult[1]
  }

  async close() {
    const server = await this.getServer()
    return (server as any).close()
  }

  private async createServer(options: DevServerOptions): Promise<Server> {
    let ServerImplementation: typeof Server
    if (options.dev) {
      ServerImplementation = require('./dev/next-dev-server').default
    } else {
      ServerImplementation = await getServerImpl()
    }
    const server = new ServerImplementation(options)

    return server
  }

  private async [SYMBOL_LOAD_CONFIG]() {
    return (
      this.options.preloadedConfig ||
      loadConfig(
        this.options.dev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_SERVER,
        resolve(this.options.dir || '.'),
        this.options.conf,
        undefined,
        !!this.options._renderWorker
      )
    )
  }

  private async getServer() {
    if (!this.serverPromise) {
      this.serverPromise = this[SYMBOL_LOAD_CONFIG]().then(async (conf) => {
        if (this.standaloneMode) {
          process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(conf)
        }

        if (!this.options.dev) {
          if (conf.output === 'standalone') {
            if (!process.env.__NEXT_PRIVATE_STANDALONE_CONFIG) {
              log.warn(
                `"next start" does not work with "output: standalone" configuration. Use "node .next/standalone/server.js" instead.`
              )
            }
          } else if (conf.output === 'export') {
            throw new Error(
              `"next start" does not work with "output: export" configuration. Use "npx serve@latest out" instead.`
            )
          }
        }

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
}

// This file is used for when users run `require('next')`
function createServer(options: NextServerOptions): NextServer {
  // The package is used as a TypeScript plugin.
  if (
    options &&
    'typescript' in options &&
    'version' in (options as any).typescript
  ) {
    return require('./next-typescript').createTSPlugin(options)
  }

  if (options == null) {
    throw new Error(
      'The server has not been instantiated properly. https://nextjs.org/docs/messages/invalid-server-options'
    )
  }

  if (
    !('isNextDevCommand' in options) &&
    process.env.NODE_ENV &&
    !['production', 'development', 'test'].includes(process.env.NODE_ENV)
  ) {
    log.warn(NON_STANDARD_NODE_ENV)
  }

  if (options.dev && typeof options.dev !== 'boolean') {
    console.warn(
      "Warning: 'dev' is not a boolean which could introduce unexpected behavior. https://nextjs.org/docs/messages/invalid-server-options"
    )
  }

  const dir = resolve(options.dir || '.')
  const server = new NextServer(dir, options)

  return server as any
}

// Support commonjs `require('next')`
module.exports = createServer
// exports = module.exports

// Support `import next from 'next'`
export default createServer
