import type { Options as DevServerOptions } from './dev/next-dev-server'
import type { NodeRequestHandler } from './next-server'
import type { UrlWithParsedQuery } from 'url'
import type { NextConfigComplete } from './config-shared'
import type { IncomingMessage, ServerResponse } from 'http'
import type { NextParsedUrlQuery, NextUrlWithParsedQuery } from './request-meta'

import './require-hook'
import './node-polyfill-fetch'
import './node-polyfill-crypto'
import { default as Server } from './next-server'
import * as log from '../build/output/log'
import loadConfig from './config'
import { join, resolve } from 'path'
import { NON_STANDARD_NODE_ENV } from '../lib/constants'
import {
  PHASE_DEVELOPMENT_SERVER,
  SERVER_DIRECTORY,
} from '../shared/lib/constants'
import { PHASE_PRODUCTION_SERVER } from '../shared/lib/constants'
import { getTracer } from './lib/trace/tracer'
import { NextServerSpan } from './lib/trace/constants'
import { formatUrl } from '../shared/lib/router/utils/format-url'
import { findDir } from '../lib/find-pages-dir'

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

  async serveStatic(...args: Parameters<Server['serveStatic']>) {
    const server = await this.getServer()
    return server.serveStatic(...args)
  }

  async prepare() {
    if (this.standaloneMode) return

    const server = await this.getServer()

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
    // Memoize request handler creation
    if (!this.reqHandlerPromise) {
      this.reqHandlerPromise = this.getServer().then((server) =>
        getTracer().wrap(
          NextServerSpan.getServerRequestHandler,
          server.getRequestHandler().bind(server)
        )
      )
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

    const { createServerHandler } =
      require('./lib/render-server-standalone') as typeof import('./lib/render-server-standalone')

    let handlerPromise: Promise<ReturnType<typeof createServerHandler>>

    return new Proxy(
      {},
      {
        get: function (_, propKey) {
          switch (propKey) {
            case 'prepare':
              return async () => {
                // Instead of running Next Server's `prepare`, we'll run the loadConfig first to determine
                // if we should run the standalone server or not.
                const config = await server[SYMBOL_LOAD_CONFIG]()

                // Check if the application has app dir or not. This depends on the mode (dev or prod).
                // For dev, `app` should be existing in the sources and for prod it should be existing
                // in the dist folder.
                const distDir =
                  process.env.NEXT_RUNTIME === 'edge'
                    ? config.distDir
                    : join(dir, config.distDir)
                const serverDistDir = join(distDir, SERVER_DIRECTORY)
                const hasAppDir = !!findDir(
                  options.dev ? dir : serverDistDir,
                  'app'
                )

                if (hasAppDir) {
                  shouldUseStandaloneMode = true
                  server[SYMBOL_SET_STANDALONE_MODE]()

                  handlerPromise =
                    handlerPromise ||
                    createServerHandler({
                      port: options.port || 3000,
                      dev: options.dev,
                      dir,
                      hostname: options.hostname || 'localhost',
                      minimalMode: false,
                    })
                } else {
                  return server.prepare()
                }
              }
            case 'getRequestHandler': {
              return () => {
                let handler: RequestHandler
                return async (req: IncomingMessage, res: ServerResponse) => {
                  if (shouldUseStandaloneMode) {
                    const standaloneHandler = await handlerPromise
                    return standaloneHandler(req, res)
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
                  const handler = await handlerPromise
                  req.url = formatUrl({
                    ...parsedUrl,
                    pathname,
                    query,
                  })
                  return handler(req, res)
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
