import type { Options as DevServerOptions } from './dev/next-dev-server'
import type {
  NodeRequestHandler,
  Options as ServerOptions,
} from './next-server'
import type { UrlWithParsedQuery } from 'url'
import type { IncomingMessage, ServerResponse } from 'http'
import type { Duplex } from 'stream'
import type { NextUrlWithParsedQuery, RequestMeta } from './request-meta'

import './require-hook'
import './node-polyfill-crypto'

import type { default as NextNodeServer } from './next-server'
import * as log from '../build/output/log'
import loadConfig from './config'
import path from 'node:path'
import { NON_STANDARD_NODE_ENV } from '../lib/constants'
import {
  PHASE_DEVELOPMENT_SERVER,
  SERVER_FILES_MANIFEST,
} from '../shared/lib/constants'
import { PHASE_PRODUCTION_SERVER } from '../shared/lib/constants'
import { getTracer } from './lib/trace/tracer'
import { NextServerSpan } from './lib/trace/constants'
import { formatUrl } from '../shared/lib/router/utils/format-url'
import type { ServerFields } from './lib/router-utils/setup-dev-bundler'
import type { ServerInitResult } from './lib/render-server'
import { AsyncCallbackSet } from './lib/async-callback-set'
import {
  RouterServerContextSymbol,
  routerServerGlobal,
} from './lib/router-utils/router-server-context'

let ServerImpl: typeof NextNodeServer

const getServerImpl = async () => {
  if (ServerImpl === undefined) {
    ServerImpl = (
      await Promise.resolve(
        require('./next-server') as typeof import('./next-server')
      )
    ).default
  }
  return ServerImpl
}

export type NextServerOptions = Omit<
  ServerOptions | DevServerOptions,
  // This is assigned in this server abstraction.
  'conf'
> &
  Partial<Pick<ServerOptions | DevServerOptions, 'conf'>>

export type NextBundlerOptions = {
  /** @deprecated Use `turbopack` instead */
  turbo?: boolean
  /** Selects Turbopack as the bundler */
  turbopack?: boolean
  /** Selects Webpack as the bundler */
  webpack?: boolean
}

export type RequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl?: NextUrlWithParsedQuery | undefined
) => Promise<void>

export type UpgradeHandler = (
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer
) => Promise<void>

const SYMBOL_LOAD_CONFIG = Symbol('next.load_config')

interface NextWrapperServer {
  // NOTE: the methods/properties here are the public API for custom servers.
  // Consider backwards compatibilty when changing something here!

  options: NextServerOptions
  hostname: string | undefined
  port: number | undefined

  getRequestHandler(): RequestHandler
  prepare(serverFields?: ServerFields): Promise<void>
  setAssetPrefix(assetPrefix: string): void
  close(): Promise<void>

  // used internally
  getUpgradeHandler(): UpgradeHandler

  // legacy methods that we left exposed in the past

  logError(...args: Parameters<NextNodeServer['logError']>): void

  revalidate(
    ...args: Parameters<NextNodeServer['revalidate']>
  ): ReturnType<NextNodeServer['revalidate']>

  logErrorWithOriginalStack(err: unknown, type: string): void

  render(
    ...args: Parameters<NextNodeServer['render']>
  ): ReturnType<NextNodeServer['render']>

  renderToHTML(
    ...args: Parameters<NextNodeServer['renderToHTML']>
  ): ReturnType<NextNodeServer['renderToHTML']>

  renderError(
    ...args: Parameters<NextNodeServer['renderError']>
  ): ReturnType<NextNodeServer['renderError']>

  renderErrorToHTML(
    ...args: Parameters<NextNodeServer['renderErrorToHTML']>
  ): ReturnType<NextNodeServer['renderErrorToHTML']>

  render404(
    ...args: Parameters<NextNodeServer['render404']>
  ): ReturnType<NextNodeServer['render404']>
}

/** The wrapper server used by `next start` */
export class NextServer implements NextWrapperServer {
  private serverPromise?: Promise<NextNodeServer>
  private server?: NextNodeServer
  private reqHandler?: NodeRequestHandler
  private reqHandlerPromise?: Promise<NodeRequestHandler>
  private preparedAssetPrefix?: string

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

  /**
   * @internal - this method is internal to Next.js and should not be used
   * directly by end-users, only used in testing
   */
  getRequestHandlerWithMetadata(meta: RequestMeta): RequestHandler {
    return async (
      req: IncomingMessage,
      res: ServerResponse,
      parsedUrl?: UrlWithParsedQuery
    ) => {
      return getTracer().trace(
        NextServerSpan.getRequestHandlerWithMetadata,
        async () => {
          const server = await this.getServer()
          const handler = server.getRequestHandlerWithMetadata(meta)
          return handler(req, res, parsedUrl)
        }
      )
    }
  }

  getUpgradeHandler(): UpgradeHandler {
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

  logError(...args: Parameters<NextWrapperServer['logError']>) {
    if (this.server) {
      this.server.logError(...args)
    }
  }

  async logErrorWithOriginalStack(err: unknown, type: string) {
    const server = await this.getServer()
    // this is only available on dev server
    if ((server as any).logErrorWithOriginalStack) {
      return (server as any).logErrorWithOriginalStack(err, type)
    }
  }

  async revalidate(...args: Parameters<NextWrapperServer['revalidate']>) {
    const server = await this.getServer()
    return server.revalidate(...args)
  }

  async render(...args: Parameters<NextWrapperServer['render']>) {
    const server = await this.getServer()
    return server.render(...args)
  }

  async renderToHTML(...args: Parameters<NextWrapperServer['renderToHTML']>) {
    const server = await this.getServer()
    return server.renderToHTML(...args)
  }

  async renderError(...args: Parameters<NextWrapperServer['renderError']>) {
    const server = await this.getServer()
    return server.renderError(...args)
  }

  async renderErrorToHTML(
    ...args: Parameters<NextWrapperServer['renderErrorToHTML']>
  ) {
    const server = await this.getServer()
    return server.renderErrorToHTML(...args)
  }

  async render404(...args: Parameters<NextWrapperServer['render404']>) {
    const server = await this.getServer()
    return server.render404(...args)
  }

  async prepare(serverFields?: ServerFields) {
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
    if (this.server) {
      await this.server.close()
    }
  }

  private async createServer(
    options: ServerOptions | DevServerOptions
  ): Promise<NextNodeServer> {
    let ServerImplementation: typeof NextNodeServer
    if (options.dev) {
      ServerImplementation = (
        require('./dev/next-dev-server') as typeof import('./dev/next-dev-server')
      ).default as typeof import('./dev/next-dev-server').default
    } else {
      ServerImplementation = await getServerImpl()
    }
    const server = new ServerImplementation(options)

    return server
  }

  private async [SYMBOL_LOAD_CONFIG]() {
    const dir = path.resolve(
      /* turbopackIgnore: true */ this.options.dir || '.'
    )

    const config = await loadConfig(
      this.options.dev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_SERVER,
      dir,
      {
        customConfig: this.options.conf,
        silent: true,
      }
    )

    // check serialized build config when available
    if (!this.options.dev) {
      try {
        const serializedConfig = require(
          /* turbopackIgnore: true */
          path.join(
            /* turbopackIgnore: true */ dir,
            config.distDir,
            SERVER_FILES_MANIFEST
          )
        ).config

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

/** The wrapper server used for `import next from "next" (in a custom server)` */
class NextCustomServer implements NextWrapperServer {
  private didWebSocketSetup: boolean = false
  protected cleanupListeners?: AsyncCallbackSet

  protected init?: ServerInitResult

  public options: NextServerOptions

  constructor(options: NextServerOptions) {
    this.options = options
  }

  protected getInit() {
    if (!this.init) {
      throw new Error(
        'prepare() must be called before performing this operation'
      )
    }
    return this.init
  }

  protected get requestHandler() {
    return this.getInit().requestHandler
  }
  protected get upgradeHandler() {
    return this.getInit().upgradeHandler
  }
  protected get server() {
    return this.getInit().server
  }

  get hostname() {
    return this.options.hostname
  }

  get port() {
    return this.options.port
  }

  async prepare() {
    const { getRequestHandlers } =
      require('./lib/start-server') as typeof import('./lib/start-server')

    let onDevServerCleanup: AsyncCallbackSet['add'] | undefined
    if (this.options.dev) {
      this.cleanupListeners = new AsyncCallbackSet()
      onDevServerCleanup = this.cleanupListeners.add.bind(this.cleanupListeners)
    }

    const initResult = await getRequestHandlers({
      dir: this.options.dir!,
      port: this.options.port || 3000,
      isDev: !!this.options.dev,
      onDevServerCleanup,
      hostname: this.options.hostname || 'localhost',
      minimalMode: this.options.minimalMode,
      quiet: this.options.quiet,
    })
    this.init = initResult
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

      return this.requestHandler(req, res)
    }
  }

  async render(...args: Parameters<NextWrapperServer['render']>) {
    let [req, res, pathname, query, parsedUrl] = args
    this.setupWebSocketHandler(this.options.httpServer, req as IncomingMessage)

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

    await this.requestHandler(req as IncomingMessage, res as ServerResponse)
    return
  }

  setAssetPrefix(assetPrefix: string): void {
    this.server.setAssetPrefix(assetPrefix)

    // update the router-server nextConfig instance as
    // this is the source of truth for "handler" in serverful
    const relativeProjectDir = path.relative(
      process.cwd(),
      this.options.dir || ''
    )

    if (
      routerServerGlobal[RouterServerContextSymbol]?.[relativeProjectDir]
        ?.nextConfig
    ) {
      routerServerGlobal[RouterServerContextSymbol][
        relativeProjectDir
      ].nextConfig.assetPrefix = assetPrefix
    }
  }

  getUpgradeHandler(): UpgradeHandler {
    return this.server.getUpgradeHandler()
  }

  logError(...args: Parameters<NextWrapperServer['logError']>) {
    this.server.logError(...args)
  }

  logErrorWithOriginalStack(err: unknown, type: string) {
    return this.server.logErrorWithOriginalStack(err, type)
  }

  async revalidate(...args: Parameters<NextWrapperServer['revalidate']>) {
    return this.server.revalidate(...args)
  }

  async renderToHTML(...args: Parameters<NextWrapperServer['renderToHTML']>) {
    return this.server.renderToHTML(...args)
  }

  async renderError(...args: Parameters<NextWrapperServer['renderError']>) {
    return this.server.renderError(...args)
  }

  async renderErrorToHTML(
    ...args: Parameters<NextWrapperServer['renderErrorToHTML']>
  ) {
    return this.server.renderErrorToHTML(...args)
  }

  async render404(...args: Parameters<NextWrapperServer['render404']>) {
    return this.server.render404(...args)
  }

  async close() {
    await Promise.allSettled([
      this.init?.server.close(),
      this.cleanupListeners?.runAll(),
    ])
  }
}

// This file is used for when users run `require('next')`
function createServer(
  options: NextServerOptions & NextBundlerOptions
): NextWrapperServer {
  // next sets customServer to false when calling this function, in that case we don't want to modify the environment variables
  const isCustomServer = options?.customServer ?? true
  if (isCustomServer) {
    const selectTurbopack =
      options &&
      (options.turbo || options.turbopack || process.env.IS_TURBOPACK_TEST)
    const selectWebpack =
      options && (options.webpack || process.env.IS_WEBPACK_TEST)
    if (selectTurbopack && selectWebpack) {
      throw new Error('Pass either `webpack` or `turbopack`, not both.')
    }
    if (selectTurbopack || !selectWebpack) {
      process.env.TURBOPACK ??= selectTurbopack ? '1' : 'auto'
    }
  } else {
    if (options && (options.webpack || options.turbo || options.turbopack)) {
      throw new Error(
        'Only custom servers can pass `webpack`, `turbo`, or `turbopack`.'
      )
    }
  }

  // The package is used as a TypeScript plugin.
  if (
    options &&
    'typescript' in options &&
    'version' in (options as any).typescript
  ) {
    const pluginMod: typeof import('./next-typescript') =
      require('./next-typescript') as typeof import('./next-typescript')
    return pluginMod.createTSPlugin(
      options as any
    ) as unknown as NextWrapperServer
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
    const dir = path.resolve(/* turbopackIgnore: true */ options.dir || '.')

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
