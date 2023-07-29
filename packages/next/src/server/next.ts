import type { Options as DevServerOptions } from './dev/next-dev-server'
import type { NodeRequestHandler } from './next-server'
import type { UrlWithParsedQuery } from 'url'
import type { NextConfigComplete } from './config-shared'
import type { IncomingMessage, ServerResponse } from 'http'
import {
  addRequestMeta,
  type NextParsedUrlQuery,
  type NextUrlWithParsedQuery,
} from './request-meta'

import './require-hook'
import './node-polyfill-fetch'
import './node-polyfill-crypto'

import url from 'url'
import { default as Server } from './next-server'
import * as log from '../build/output/log'
import loadConfig from './config'
import { resolve } from 'path'
import { NON_STANDARD_NODE_ENV } from '../lib/constants'
import { PHASE_DEVELOPMENT_SERVER } from '../shared/lib/constants'
import { PHASE_PRODUCTION_SERVER } from '../shared/lib/constants'
import { getTracer } from './lib/trace/tracer'
import { NextServerSpan } from './lib/trace/constants'
import { formatUrl } from '../shared/lib/router/utils/format-url'
import { proxyRequest } from './lib/router-utils/proxy-request'
import { TLSSocket } from 'tls'

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

const SYMBOL_SET_STANDALONE_MODE = Symbol('next.set_standalone_mode')
const SYMBOL_LOAD_CONFIG = Symbol('next.load_config')

export class NextServer {
  private serverPromise?: Promise<Server>
  private server?: Server
  private reqHandler?: NodeRequestHandler
  private reqHandlerPromise?: Promise<NodeRequestHandler>
  private preparedAssetPrefix?: string

  private standaloneMode?: boolean

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

  [SYMBOL_SET_STANDALONE_MODE]() {
    this.standaloneMode = true
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

  if (options.customServer !== false) {
    // If the `app` dir exists, we'll need to run the standalone server to have
    // both types of renderers (pages, app) running in separated processes,
    // instead of having the Next server only.
    let shouldUseStandaloneMode = false
    const dir = resolve(options.dir || '.')
    const server = new NextServer(options)

    const { createRouterWorker, checkIsNodeDebugging } =
      require('./lib/start-server') as typeof import('./lib/start-server')

    let didWebSocketSetup = false
    let serverPort: number = 0
    let fetchHostname: string | undefined

    function setupWebSocketHandler(
      customServer?: import('http').Server,
      _req?: IncomingMessage
    ) {
      if (!didWebSocketSetup) {
        didWebSocketSetup = true
        customServer = customServer || (_req?.socket as any)?.server

        if (!customServer) {
          // this is very unlikely to happen but show an error in case
          // it does somehow
          console.error(
            `Invalid IncomingMessage received, make sure http.createServer is being used to handle requests.`
          )
        } else {
          customServer.on('upgrade', async (req, socket, head) => {
            if (shouldUseStandaloneMode) {
              await proxyRequest(
                req,
                socket as any,
                url.parse(
                  `http://${fetchHostname}:${serverPort}${req.url}`,
                  true
                ),
                head
              )
            }
          })
        }
      }
    }
    return new Proxy(
      {},
      {
        get: function (_, propKey) {
          switch (propKey) {
            case 'prepare':
              return async () => {
                shouldUseStandaloneMode = true
                server[SYMBOL_SET_STANDALONE_MODE]()
                const isNodeDebugging = checkIsNodeDebugging()
                const routerWorker = await createRouterWorker(
                  require.resolve('./lib/router-server'),
                  isNodeDebugging
                )

                const initResult = await routerWorker.initialize({
                  dir,
                  port: options.port || 3000,
                  hostname: options.hostname || 'localhost',
                  isNodeDebugging: !!isNodeDebugging,
                  workerType: 'router',
                  dev: !!options.dev,
                  minimalMode: options.minimalMode,
                })
                fetchHostname = initResult.hostname
                serverPort = initResult.port
              }
            case 'getRequestHandler': {
              return () => {
                let handler: RequestHandler
                return async (req: IncomingMessage, res: ServerResponse) => {
                  if (shouldUseStandaloneMode) {
                    setupWebSocketHandler(options.httpServer, req)
                    const parsedUrl = url.parse(
                      `http://${fetchHostname}:${serverPort}${req.url}`,
                      true
                    )
                    if ((req?.socket as TLSSocket)?.encrypted) {
                      req.headers['x-forwarded-proto'] = 'https'
                    }
                    addRequestMeta(req, '__NEXT_INIT_QUERY', parsedUrl.query)

                    await proxyRequest(req, res, parsedUrl, undefined, req)
                    return
                  }
                  handler = handler || server.getRequestHandler()
                  return handler(req, res)
                }
              }
            }
            case 'render': {
              return async (
                req: IncomingMessage,
                res: ServerResponse,
                pathname: string,
                query?: NextParsedUrlQuery,
                parsedUrl?: NextUrlWithParsedQuery
              ) => {
                if (shouldUseStandaloneMode) {
                  setupWebSocketHandler(options.httpServer, req)

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

                  if ((req?.socket as TLSSocket)?.encrypted) {
                    req.headers['x-forwarded-proto'] = 'https'
                  }
                  addRequestMeta(
                    req,
                    '__NEXT_INIT_QUERY',
                    parsedUrl?.query || query || {}
                  )

                  await proxyRequest(
                    req,
                    res,
                    url.parse(
                      `http://${fetchHostname}:${serverPort}${req.url}`,
                      true
                    ),
                    undefined,
                    req
                  )
                  return
                }

                return server.render(req, res, pathname, query, parsedUrl)
              }
            }
            default: {
              const method = server[propKey as keyof NextServer]
              if (typeof method === 'function') {
                return method.bind(server)
              }
            }
          }
        },
      }
    ) as any
  }
  return new NextServer(options)
}

// Support commonjs `require('next')`
module.exports = createServer
// exports = module.exports

// Support `import next from 'next'`
export default createServer
