import type { Options as DevServerOptions } from './dev/next-dev-server'
import type {
  NodeRequestHandler,
  Options as ServerOptions,
} from './next-server'
import type { UrlWithParsedQuery } from 'url'
import type { NextConfigComplete } from './config-shared'
import type { IncomingMessage, ServerResponse } from 'http'
import type { NextUrlWithParsedQuery } from './request-meta'
import type { WorkerRequestHandler, WorkerUpgradeHandler } from './lib/types'

import './require-hook'
import './node-polyfill-crypto'

import type { default as Server } from './next-server'
import * as log from '../build/output/log'
import loadConfig from './config'
import path, { resolve } from 'path'
import { NON_STANDARD_NODE_ENV } from '../lib/constants'
import {
  PHASE_DEVELOPMENT_SERVER,
  SERVER_FILES_MANIFEST,
} from '../shared/lib/constants'
import { PHASE_PRODUCTION_SERVER } from '../shared/lib/constants'
import { getTracer } from './lib/trace/tracer'
import { NextServerSpan } from './lib/trace/constants'
import { formatUrl } from '../shared/lib/router/utils/format-url'
import { checkNodeDebugType } from './lib/utils'

let ServerImpl: typeof Server

const getServerImpl = async () => {
  if (ServerImpl === undefined) {
    ServerImpl = (await Promise.resolve(require('./next-server'))).default
  }
  return ServerImpl
}

export type NextServerOptions = Omit<
  ServerOptions | DevServerOptions,
  // This is assigned in this server abstraction.
  'conf'
> &
  Partial<Pick<ServerOptions | DevServerOptions, 'conf'>> & {
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

export class NextServer {
  private serverPromise?: Promise<Server>
  private server?: Server
  private reqHandler?: NodeRequestHandler
  private reqHandlerPromise?: Promise<NodeRequestHandler>
  private preparedAssetPrefix?: string

  protected standaloneMode?: boolean

  public options: NextServerOptions

  constructor(options: NextServerOptions) {
    this.options = options
  }

  get hostname() {
    return this.options.hostname
  }

  get port() {
    return this.options.port
  }

  getRequestHandler(): RequestHandler {
    return async (
      req: IncomingMessage,
      res: ServerResponse,
      parsedUrl?: UrlWithParsedQuery
    ) => {
      return getTracer().trace(NextServerSpan.getRequestHandler, async () => {
        const requestHandler = await this.getServerRequestHandler()
        return requestHandler(req, res, parsedUrl)
      })
    }
  }

  getUpgradeHandler() {
    return async (req: IncomingMessage, socket: any, head: any) => {
      const server = await this.getServer()
      // @ts-expect-error we mark this as protected so it
      // causes an error here
      return server.handleUpgrade.apply(server, [req, socket, head])
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

  async prepare(serverFields?: any) {
    if (this.standaloneMode) return

    const server = await this.getServer()

    if (serverFields) {
      Object.assign(server, serverFields)
    }
    // We shouldn't prepare the server in production,
    // because this code won't be executed when deployed
    if (this.options.dev) {
      await server.prepare()
    }
  }

  async close() {
    const server = await this.getServer()
    return (server as any).close()
  }

  private async createServer(
    options: ServerOptions | DevServerOptions
  ): Promise<Server> {
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
    const dir = resolve(this.options.dir || '.')

    const config =
      this.options.preloadedConfig ||
      (await loadConfig(
        this.options.dev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_SERVER,
        dir,
        {
          customConfig: this.options.conf,
          silent: true,
        }
      ))

    // check serialized build config when available
    if (process.env.NODE_ENV === 'production') {
      try {
        const serializedConfig = require(path.join(
          dir,
          '.next',
          SERVER_FILES_MANIFEST
        )).config

        // @ts-expect-error internal field
        config.experimental.isExperimentalCompile =
          serializedConfig.experimental.isExperimentalCompile
      } catch (_) {
        // if distDir is customized we don't know until we
        // load the config so fallback to loading the config
        // from next.config.js
      }
    }

    return config
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

  private async getServerRequestHandler() {
    if (this.reqHandler) return this.reqHandler

    // Memoize request handler creation
    if (!this.reqHandlerPromise) {
      this.reqHandlerPromise = this.getServer().then((server) => {
        this.reqHandler = getTracer().wrap(
          NextServerSpan.getServerRequestHandler,
          server.getRequestHandler().bind(server)
        )
        delete this.reqHandlerPromise
        return this.reqHandler
      })
    }
    return this.reqHandlerPromise
  }
}

class NextCustomServer extends NextServer {
  protected standaloneMode = true
  private didWebSocketSetup: boolean = false

  // @ts-expect-error These are initialized in prepare()
  protected requestHandler: WorkerRequestHandler
  // @ts-expect-error These are initialized in prepare()
  protected upgradeHandler: WorkerUpgradeHandler

  async prepare() {
    const { getRequestHandlers } =
      require('./lib/start-server') as typeof import('./lib/start-server')

    const isNodeDebugging = !!checkNodeDebugType()

    const initResult = await getRequestHandlers({
      dir: this.options.dir!,
      port: this.options.port || 3000,
      isDev: !!this.options.dev,
      hostname: this.options.hostname || 'localhost',
      minimalMode: this.options.minimalMode,
      isNodeDebugging: !!isNodeDebugging,
    })
    this.requestHandler = initResult[0]
    this.upgradeHandler = initResult[1]
  }

  private setupWebSocketHandler(
    customServer?: import('http').Server,
    _req?: IncomingMessage
  ) {
    if (!this.didWebSocketSetup) {
      this.didWebSocketSetup = true
      customServer = customServer || (_req?.socket as any)?.server

      if (customServer) {
        customServer.on('upgrade', async (req, socket, head) => {
          this.upgradeHandler(req, socket, head)
        })
      }
    }
  }

  getRequestHandler() {
    return async (
      req: IncomingMessage,
      res: ServerResponse,
      parsedUrl?: UrlWithParsedQuery
    ) => {
      this.setupWebSocketHandler(this.options.httpServer, req)

      if (parsedUrl) {
        req.url = formatUrl(parsedUrl)
      }

      return this.requestHandler(req, res)
    }
  }

  async render(...args: Parameters<Server['render']>) {
    let [req, res, pathname, query, parsedUrl] = args
    this.setupWebSocketHandler(this.options.httpServer, req as any)

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

    await this.requestHandler(req as any, res as any)
    return
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

  // When the caller is a custom server (using next()).
  if (options.customServer !== false) {
    const dir = resolve(options.dir || '.')

    return new NextCustomServer({
      ...options,
      dir,
    })
  }

  // When the caller is Next.js internals (i.e. render worker, start server, etc)
  return new NextServer(options)
}

// Support commonjs `require('next')`
module.exports = createServer
// exports = module.exports

// Support `import next from 'next'`
export default createServer
