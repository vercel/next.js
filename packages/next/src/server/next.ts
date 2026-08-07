import type { Options as DevServerOptions } from './dev/next-dev-server'
import type {
  NodeRequestHandler,
  Options as ServerOptions,
} from './next-server'
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
import { flushAllTraces } from '../trace'
import { formatUrl } from '../shared/lib/router/utils/format-url'
import type { ServerFields } from './lib/router-utils/setup-dev-bundler'
import type { ServerInitResult } from './lib/render-server'
import { AsyncCallbackSet } from './lib/async-callback-set'
import {
  RouterServerContextSymbol,
  routerServerGlobal,
} from './lib/router-utils/router-server-context'
import { PendingWebSocketUpgradeTracker } from './websocket-lifecycle'
import { isRawHttpResponseCommitted } from './websocket-http'
import { addDistinctServerCleanupFailures } from './lib/server-cleanup'
import { RESTART_EXIT_CODE } from './lib/utils'
import { addRequestMeta } from './request-meta'
import { createPromiseWithResolvers } from '../shared/lib/promise-with-resolvers'
import {
  classifyWebSocketUpgradeOwnership,
  createWebSocketUpgradeListenerOwnershipTracker,
  type WebSocketUpgradeListenerOwnershipTracker,
} from './websocket-upgrade-listener'

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

/** @experimental WebSocket Route Handlers are an experimental feature. */
export type UpgradeHandler = (
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer
) => Promise<void>

function removeUpgradeListenerRegistrations(
  server: import('http').Server,
  listener: UpgradeHandler
): unknown[] {
  const failures: unknown[] = []
  let registrationCount = 1
  try {
    registrationCount = server
      .listeners('upgrade')
      .filter((registered) => registered === listener).length
  } catch (error) {
    failures.push(error)
  }

  // EventEmitter.off() removes one matching registration. Snapshot the count
  // so a hostile removeListener observer cannot keep this loop alive by
  // re-registering the handler while teardown is in progress.
  for (let index = 0; index < registrationCount; index++) {
    try {
      server.off('upgrade', listener)
    } catch (error) {
      if (!failures.includes(error)) failures.push(error)
    }
  }
  return failures
}

const SYMBOL_LOAD_CONFIG = Symbol('next.load_config')

type DeprecatedCustomServerMethod =
  | 'setAssetPrefix'
  | 'logError'
  | 'logErrorWithOriginalStack'
  | 'revalidate'
  | 'render'
  | 'renderToHTML'
  | 'renderError'
  | 'renderErrorToHTML'
  | 'render404'

const DEPRECATED_CUSTOM_SERVER_METHOD_GUIDANCE: Record<
  DeprecatedCustomServerMethod,
  string
> = {
  setAssetPrefix: 'Please configure `assetPrefix` in `next.config.js` instead.',
  logError: 'Please use application logging instead.',
  logErrorWithOriginalStack: 'Please use application logging instead.',
  revalidate: 'Please use documented application revalidation APIs instead.',
  render:
    'Please use `app.getRequestHandler()` with an adjusted parsed URL instead.',
  renderToHTML:
    'Please use `app.getRequestHandler()` with an adjusted parsed URL instead.',
  renderError:
    'Please use `app.getRequestHandler()` with an adjusted parsed URL instead.',
  renderErrorToHTML:
    'Please use `app.getRequestHandler()` with an adjusted parsed URL instead.',
  render404:
    'Please use `app.getRequestHandler()` with an adjusted parsed URL instead.',
}

function warnDeprecatedCustomServerMethod(
  method: DeprecatedCustomServerMethod
) {
  log.warnOnce(
    `The \`app.${method}()\` method is deprecated in custom servers. ${DEPRECATED_CUSTOM_SERVER_METHOD_GUIDANCE[method]}`
  )
}

interface NextWrapperServer {
  // NOTE: the methods/properties here are the public API for custom servers.
  // Consider backwards compatibilty when changing something here!

  options: NextServerOptions
  hostname: string | undefined
  port: number | undefined

  getRequestHandler(): RequestHandler
  prepare(serverFields?: ServerFields): Promise<void>
  /** @deprecated Configure `assetPrefix` in `next.config.js` instead. */
  setAssetPrefix(assetPrefix: string): void
  /**
   * Closes the Next.js server.
   *
   * With experimental WebSocket Route Handlers enabled, repeated calls share
   * one teardown promise. A single teardown failure is rethrown unchanged;
   * multiple distinct failures reject with an ordered `AggregateError`.
   */
  close(): Promise<void>

  /**
   * Returns the handler for a custom server's Node.js `upgrade` event.
   * Call this after `prepare()` and attach the returned handler before the
   * server starts accepting connections.
   *
   * @experimental WebSocket Route Handlers are an experimental feature.
   */
  getUpgradeHandler(): UpgradeHandler

  // legacy methods that we left exposed in the past

  /** @deprecated Use application logging instead. */
  logError(...args: Parameters<NextNodeServer['logError']>): void

  /** @deprecated Use documented application revalidation APIs instead. */
  revalidate(
    ...args: Parameters<NextNodeServer['revalidate']>
  ): ReturnType<NextNodeServer['revalidate']>

  /** @deprecated Use application logging instead. */
  logErrorWithOriginalStack(err: unknown, type: string): void

  /**
   * @deprecated Use `app.getRequestHandler()` with an adjusted parsed URL instead.
   */
  render(
    ...args: Parameters<NextNodeServer['render']>
  ): ReturnType<NextNodeServer['render']>

  /**
   * @deprecated Use `app.getRequestHandler()` with an adjusted parsed URL instead.
   */
  renderToHTML(
    ...args: Parameters<NextNodeServer['renderToHTML']>
  ): ReturnType<NextNodeServer['renderToHTML']>

  /**
   * @deprecated Use `app.getRequestHandler()` with an adjusted parsed URL instead.
   */
  renderError(
    ...args: Parameters<NextNodeServer['renderError']>
  ): ReturnType<NextNodeServer['renderError']>

  /**
   * @deprecated Use `app.getRequestHandler()` with an adjusted parsed URL instead.
   */
  renderErrorToHTML(
    ...args: Parameters<NextNodeServer['renderErrorToHTML']>
  ): ReturnType<NextNodeServer['renderErrorToHTML']>

  /**
   * @deprecated Use `app.getRequestHandler()` with an adjusted parsed URL instead.
   */
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
      parsedUrl?: NextUrlWithParsedQuery
    ) => {
      const tracer = getTracer()
      return tracer.withPropagatedContext(req.headers, () =>
        tracer.trace(NextServerSpan.getRequestHandler, async () => {
          const requestHandler = await this.getServerRequestHandler()
          return requestHandler(req, res, parsedUrl)
        })
      )
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
      parsedUrl?: NextUrlWithParsedQuery
    ) => {
      const tracer = getTracer()
      return tracer.withPropagatedContext(req.headers, () =>
        tracer.trace(NextServerSpan.getRequestHandlerWithMetadata, async () => {
          const server = await this.getServer()
          const handler = server.getRequestHandlerWithMetadata(meta)
          return handler(req, res, parsedUrl)
        })
      )
    }
  }

  /** @experimental WebSocket Route Handlers are an experimental feature. */
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
            SERVER_FILES_MANIFEST + '.json'
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

interface CustomServerPrepareGeneration {
  promise: Promise<void>
  init?: ServerInitResult
  pendingUpgrades: PendingWebSocketUpgradeTracker
  cleanupListeners?: AsyncCallbackSet
  reportCleanupFailures?: boolean
}

interface CustomServerCloseGeneration {
  prepare: CustomServerPrepareGeneration
  promise: Promise<void>
}

/** The wrapper server used for `import next from "next" (in a custom server)` */
class NextCustomServer implements NextWrapperServer {
  private didWebSocketSetup: boolean = false
  private isClosing: boolean = false
  private prepareGeneration?: CustomServerPrepareGeneration
  private closeGeneration?: CustomServerCloseGeneration
  private pendingUpgrades = new PendingWebSocketUpgradeTracker()
  private webSocketServer?: import('http').Server
  private readonly webSocketUpgradeServers = new Set<import('http').Server>()
  private webSocketUpgradeOwnership?: WebSocketUpgradeListenerOwnershipTracker
  private webSocketRegistration?: Promise<void>
  private webSocketAutomaticUpgradeListener?: UpgradeHandler
  private webSocketUpgradeListener?: (
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer
  ) => Promise<void>
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

  prepare(): Promise<void> {
    if (this.prepareGeneration) return this.prepareGeneration.promise

    // Publish the preparation generation before running any user- or
    // adapter-controlled initialization. close() can then wait for this exact
    // generation without mistaking an in-flight prepare for a pre-prepare
    // no-op, and concurrent prepare callers cannot install competing servers.
    const preparing = createPromiseWithResolvers<void>()
    const generation: CustomServerPrepareGeneration = {
      promise: preparing.promise,
      pendingUpgrades: new PendingWebSocketUpgradeTracker(),
    }
    this.prepareGeneration = generation
    this.pendingUpgrades = generation.pendingUpgrades
    this.cleanupListeners = undefined
    this.isClosing = false
    void this.prepareImpl(generation).then(
      async (init) => {
        try {
          generation.init = init
          if (this.prepareGeneration === generation) this.init = init
          this.setupWebSocketHandler(this.options.httpServer)
          preparing.resolve()
        } catch (error) {
          // Listener registration is the final prepare step. If it fails, the
          // router is already live and must be rolled back through the same
          // authoritative close generation used by a concurrent close().
          generation.reportCleanupFailures = true
          const failures = [error]
          try {
            await this.closeImpl(1011)
          } catch (cleanupError) {
            addDistinctServerCleanupFailures(failures, cleanupError)
          }
          generation.init = undefined
          if (this.prepareGeneration === generation) {
            this.prepareGeneration = undefined
            this.init = undefined
            this.cleanupListeners = undefined
          }
          if (this.closeGeneration?.prepare === generation) {
            this.closeGeneration = undefined
          }
          this.isClosing = false
          preparing.reject(
            failures.length === 1
              ? error
              : new AggregateError(
                  failures,
                  'Failed to prepare the Next.js custom server',
                  { cause: error }
                )
          )
        }
      },
      (error) => {
        if (this.prepareGeneration === generation) {
          this.prepareGeneration = undefined
        }
        preparing.reject(error)
      }
    )
    return preparing.promise
  }

  private async prepareImpl(
    generation: CustomServerPrepareGeneration
  ): Promise<ServerInitResult> {
    if (this.options.dev) {
      process.env.__NEXT_DEV_SERVER = '1'
    }

    const { getRequestHandlers } =
      require('./lib/start-server') as typeof import('./lib/start-server')

    let onDevServerCleanup: AsyncCallbackSet['add'] | undefined
    if (this.options.dev) {
      generation.cleanupListeners = new AsyncCallbackSet()
      this.cleanupListeners = generation.cleanupListeners
      onDevServerCleanup = generation.cleanupListeners.add.bind(
        generation.cleanupListeners
      )
    }

    const initResult = await getRequestHandlers({
      dir: this.options.dir!,
      port: this.options.port || 3000,
      isDev: !!this.options.dev,
      onDevServerCleanup,
      hostname: this.options.hostname || 'localhost',
      minimalMode: this.options.minimalMode,
      quiet: this.options.quiet,
      restartServer: async () => {
        try {
          try {
            if (generation.init) {
              await this.closeImpl(1012)
            } else {
              // getRequestHandlers() may request a restart before it returns
              // the initialized server. Waiting for prepare() from inside that
              // callback would form prepare -> restart -> close -> prepare.
              // Only pre-initialization resources are reachable here; drain
              // them without publishing a terminal close generation. In the
              // normal path, where initialization has completed, closeImpl()
              // remains the authoritative teardown.
              await Promise.allSettled([
                generation.pendingUpgrades.closePending(),
                generation.cleanupListeners?.runAll(),
              ])
            }
          } catch (error) {
            // A restart must still flush its trace receipt before the process
            // exits, even when experimental WebSocket teardown reports a
            // failure to ordinary app.close() callers.
            console.error(
              'Failed to close the Next.js custom server during restart',
              error
            )
          }
          await flushAllTraces()
        } finally {
          process.exit(RESTART_EXIT_CODE)
        }
      },
    })
    return initResult
  }

  private setupWebSocketHandler(
    customServer?: import('http').Server,
    _req?: IncomingMessage
  ) {
    if (this.didWebSocketSetup || this.isClosing) return

    customServer = customServer || (_req?.socket as any)?.server
    if (!customServer) return

    const publicUpgradeListener = this.getOrCreateWebSocketUpgradeListener()
    const upgradeListener = this.webSocketAutomaticUpgradeListener!
    const registration = createPromiseWithResolvers<void>()
    this.didWebSocketSetup = true
    this.webSocketServer = customServer
    this.webSocketRegistration = registration.promise
    const serverWasTracked = this.webSocketUpgradeServers.has(customServer)
    this.webSocketUpgradeServers.add(customServer)
    let ownership: WebSocketUpgradeListenerOwnershipTracker | undefined
    let ownershipDisposed = false
    const disposeOwnership = () => {
      if (!ownership || ownershipDisposed) return
      ownershipDisposed = true
      ownership.dispose()
    }
    let registered = false
    try {
      ownership = createWebSocketUpgradeListenerOwnershipTracker(
        customServer,
        upgradeListener,
        [publicUpgradeListener]
      )
      this.webSocketUpgradeOwnership = ownership
      customServer.on('upgrade', upgradeListener)
      registered = true
      if (
        this.webSocketRegistration !== registration.promise ||
        this.webSocketServer !== customServer ||
        this.isClosing
      ) {
        // EventEmitter emits `newListener` before inserting the listener. A
        // public observer can begin close() during that callback, so detach
        // the listener which `on()` just inserted before publishing
        // registration completion.
        registered = false
        customServer.off('upgrade', upgradeListener)
      }
    } catch (error) {
      const failures = [error]
      // `EventEmitter.on()` is a public synchronous capability. A subclass can
      // insert the listener and then throw, so registration failure still owes
      // an explicit rollback before this instance drops ownership state.
      try {
        customServer.off('upgrade', upgradeListener)
      } catch (cleanupError) {
        if (!failures.includes(cleanupError)) failures.push(cleanupError)
      }
      try {
        disposeOwnership()
      } catch (cleanupError) {
        if (!failures.includes(cleanupError)) failures.push(cleanupError)
      }
      if (failures.length === 1) throw failures[0]
      throw new AggregateError(
        failures,
        'Failed to register the custom-server WebSocket upgrade listener',
        { cause: failures[0] }
      )
    } finally {
      registration.resolve()
      if (!registered && this.webSocketRegistration === registration.promise) {
        this.didWebSocketSetup = false
        this.webSocketServer = undefined
        this.webSocketUpgradeOwnership = undefined
        this.webSocketRegistration = undefined
        if (!serverWasTracked) this.webSocketUpgradeServers.delete(customServer)
        disposeOwnership()
      }
    }
  }

  private getOrCreateWebSocketUpgradeListener(): UpgradeHandler {
    if (!this.webSocketUpgradeListener) {
      const claimedRequests = new WeakSet<IncomingMessage>()
      const dispatchUpgrade = async (
        invokedListener: UpgradeHandler,
        otherOwnedListener: UpgradeHandler,
        req: IncomingMessage,
        socket: Duplex,
        head: Buffer
      ) => {
        let finishUpgrade: (() => void) | undefined
        try {
          const requestServer = (
            req.socket as typeof req.socket & {
              server?: import('http').Server
            }
          ).server
          const upgradeListeners = requestServer?.listeners('upgrade')
          const ownsServerRegistration = Boolean(
            requestServer &&
              upgradeListeners?.some(
                (listener) =>
                  listener === invokedListener ||
                  listener === otherOwnedListener
              )
          )
          if (requestServer && ownsServerRegistration) {
            this.webSocketUpgradeServers.add(requestServer)
          }
          const ownership =
            invokedListener === this.webSocketAutomaticUpgradeListener &&
            requestServer === this.webSocketServer &&
            this.webSocketUpgradeOwnership
              ? this.webSocketUpgradeOwnership.getOwnership()
              : classifyWebSocketUpgradeOwnership(
                  upgradeListeners,
                  invokedListener,
                  [otherOwnedListener]
                )

          // Shared dispatch is intentionally left unclaimed so one outer
          // dispatcher can call the public handler with coordinated ownership.
          // Every Next-owned path claims synchronously before touching request
          // metadata, upgrade admission, or the socket.
          if (ownership !== 'shared') {
            if (claimedRequests.has(req)) return
            claimedRequests.add(req)
          }

          if (this.isClosing) {
            if (requestServer && ownsServerRegistration) {
              const removalFailures = [
                ...removeUpgradeListenerRegistrations(
                  requestServer,
                  invokedListener
                ),
                ...removeUpgradeListenerRegistrations(
                  requestServer,
                  otherOwnedListener
                ),
              ]
              this.webSocketUpgradeServers.delete(requestServer)
              if (removalFailures.length > 0) {
                console.error(
                  'Failed to remove a custom-server WebSocket upgrade listener during shutdown',
                  removalFailures.length === 1
                    ? removalFailures[0]
                    : new AggregateError(removalFailures)
                )
              }
            }
            // A shared dispatcher belongs to embedding code. Removing this
            // Next.js listener is safe, but the sibling owner must retain the
            // socket. Exclusive and coordinated dispatches belong to Next.js.
            if (ownership !== 'shared' && !socket.destroyed) socket.destroy()
            return
          }

          // Node invokes sibling upgrade listeners synchronously without
          // awaiting promises. Leave a shared dispatch untouched so another
          // listener can make the ownership decision.
          if (ownership === 'shared') return

          addRequestMeta(req, 'webSocketUpgradeOwnership', ownership)

          finishUpgrade = this.pendingUpgrades.track(socket)
          if (
            this.isClosing ||
            socket.destroyed ||
            socket.readableEnded ||
            socket.writableEnded
          ) {
            if (!socket.destroyed) socket.destroy()
            return
          }
          await this.upgradeHandler(req, socket, head)
        } catch (error) {
          let shouldDestroy = true
          try {
            shouldDestroy =
              !this.isClosing || !isRawHttpResponseCommitted(socket)
          } catch {}
          if (shouldDestroy && !socket.destroyed) {
            try {
              socket.destroy()
            } catch (destroyError) {
              console.error(
                'Failed to destroy a custom-server WebSocket upgrade after an error',
                destroyError
              )
            }
          }
          console.error('Error handling upgrade request', error)
        } finally {
          try {
            finishUpgrade?.()
          } catch (error) {
            console.error(
              'Failed to release custom-server WebSocket upgrade tracking',
              error
            )
          }
        }
      }
      let publicUpgradeListener!: UpgradeHandler
      let automaticUpgradeListener!: UpgradeHandler
      publicUpgradeListener = (req, socket, head) =>
        dispatchUpgrade(
          publicUpgradeListener,
          automaticUpgradeListener,
          req,
          socket,
          head
        )
      automaticUpgradeListener = (req, socket, head) =>
        dispatchUpgrade(
          automaticUpgradeListener,
          publicUpgradeListener,
          req,
          socket,
          head
        )
      this.webSocketUpgradeListener = publicUpgradeListener
      this.webSocketAutomaticUpgradeListener = automaticUpgradeListener
    }
    return this.webSocketUpgradeListener
  }

  getRequestHandler(): RequestHandler {
    return async (
      req: IncomingMessage,
      res: ServerResponse,
      parsedUrl?: NextUrlWithParsedQuery
    ) => {
      this.setupWebSocketHandler(this.options.httpServer, req)

      if (parsedUrl) {
        req.url = formatUrl(parsedUrl)
      }

      return this.requestHandler(req, res)
    }
  }

  async render(...args: Parameters<NextWrapperServer['render']>) {
    warnDeprecatedCustomServerMethod('render')
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
    warnDeprecatedCustomServerMethod('setAssetPrefix')
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

  /** @experimental WebSocket Route Handlers are an experimental feature. */
  getUpgradeHandler(): UpgradeHandler {
    // Resolve the initialized router wrapper now so callers get a useful
    // error if prepare() was skipped. The listener itself stays stable so an
    // ordinary HTTP request cannot install a second copy after explicit
    // custom-server wiring.
    this.getInit()
    this.didWebSocketSetup = true
    return this.getOrCreateWebSocketUpgradeListener()
  }

  logError(...args: Parameters<NextWrapperServer['logError']>) {
    warnDeprecatedCustomServerMethod('logError')
    this.server.logError(...args)
  }

  logErrorWithOriginalStack(err: unknown, type: string) {
    warnDeprecatedCustomServerMethod('logErrorWithOriginalStack')
    return this.server.logErrorWithOriginalStack(err, type)
  }

  async revalidate(...args: Parameters<NextWrapperServer['revalidate']>) {
    warnDeprecatedCustomServerMethod('revalidate')
    return this.server.revalidate(...args)
  }

  async renderToHTML(...args: Parameters<NextWrapperServer['renderToHTML']>) {
    warnDeprecatedCustomServerMethod('renderToHTML')
    return this.server.renderToHTML(...args)
  }

  async renderError(...args: Parameters<NextWrapperServer['renderError']>) {
    warnDeprecatedCustomServerMethod('renderError')
    return this.server.renderError(...args)
  }

  async renderErrorToHTML(
    ...args: Parameters<NextWrapperServer['renderErrorToHTML']>
  ) {
    warnDeprecatedCustomServerMethod('renderErrorToHTML')
    return this.server.renderErrorToHTML(...args)
  }

  async render404(...args: Parameters<NextWrapperServer['render404']>) {
    warnDeprecatedCustomServerMethod('render404')
    return this.server.render404(...args)
  }

  private closeImpl(code?: number): Promise<void> {
    const generation = this.prepareGeneration
    if (!generation) {
      if (this.closeGeneration && !this.closeGeneration.prepare.init) {
        return this.closeGeneration.promise
      }
      // close() historically did nothing before prepare(). Do not memoize that
      // no-op: a later preparation creates the first closeable generation.
      return Promise.resolve()
    }
    if (this.closeGeneration?.prepare === generation) {
      return this.closeGeneration.promise
    }

    // Install the authoritative promise before changing EventEmitter state or
    // invoking any lifecycle capability. In particular, server.off() emits the
    // public removeListener event synchronously and can re-enter app.close().
    const closing = createPromiseWithResolvers<void>()
    this.closeGeneration = { prepare: generation, promise: closing.promise }

    this.isClosing = true
    const closePending = generation.pendingUpgrades.closePending()
    // Preparation can still be settling. Mark the eagerly-latched drain as
    // observed until the ordered shutdown phase awaits its real result.
    void closePending.catch(() => {})
    const webSocketServer = this.webSocketServer
    const webSocketUpgradeListener = this.webSocketUpgradeListener
    const webSocketAutomaticUpgradeListener =
      this.webSocketAutomaticUpgradeListener
    const webSocketUpgradeOwnership = this.webSocketUpgradeOwnership
    const webSocketRegistration = this.webSocketRegistration
    const webSocketUpgradeServers = new Set(this.webSocketUpgradeServers)
    if (webSocketServer) webSocketUpgradeServers.add(webSocketServer)

    // Clear owned registration state before invoking public EventEmitter
    // removal hooks. Re-entrant close() callers observe the promise above.
    this.webSocketServer = undefined
    this.webSocketUpgradeOwnership = undefined
    this.webSocketRegistration = undefined
    this.webSocketUpgradeServers.clear()

    const runClose = async () => {
      const failures: unknown[] = []
      const addFailure = (error: unknown) => {
        addDistinctServerCleanupFailures(failures, error)
      }
      const settle = async (stages: Array<() => void | PromiseLike<void>>) => {
        const results = await Promise.allSettled(
          stages.map(async (stage) => stage())
        )
        for (const result of results) {
          if (result.status === 'rejected') addFailure(result.reason)
        }
      }

      await settle([
        async () => {
          await webSocketRegistration
          if (webSocketUpgradeListener || webSocketAutomaticUpgradeListener) {
            const removalFailures: unknown[] = []
            try {
              webSocketUpgradeOwnership?.dispose()
            } catch (error) {
              removalFailures.push(error)
            }
            for (const server of webSocketUpgradeServers) {
              for (const listener of [
                webSocketAutomaticUpgradeListener,
                webSocketUpgradeListener,
              ]) {
                if (!listener) continue
                for (const error of removeUpgradeListenerRegistrations(
                  server,
                  listener
                )) {
                  addDistinctServerCleanupFailures(removalFailures, error)
                }
              }
            }
            if (removalFailures.length === 1) throw removalFailures[0]
            if (removalFailures.length > 1) {
              throw new AggregateError(
                removalFailures,
                'Failed to remove the custom-server WebSocket upgrade listener',
                { cause: removalFailures[0] }
              )
            }
          }
        },
      ])

      let prepareFailed = false
      if (!generation.init) {
        try {
          await generation.promise
        } catch {
          prepareFailed = true
        }
      }

      const init = generation.init
      // Complete every admitted raw handler before taking the one
      // authoritative registry snapshot. No peer can register after this
      // phase because closePending() latched admission synchronously above.
      await settle([() => closePending])
      await settle([() => init?.closeUpgraded(code)])
      await settle([
        () => init?.server.close(),
        () => generation.cleanupListeners?.runAll(),
      ])

      // close() predates WebSocket Route Handlers and historically swallowed
      // every cleanup rejection. Preserve that behavior unless the application
      // explicitly opts into the experimental public teardown contract.
      if (
        prepareFailed ||
        (!init?.webSocketRouteHandlersEnabled &&
          !generation.reportCleanupFailures)
      ) {
        return
      }
      if (failures.length === 1) throw failures[0]
      if (failures.length > 1) {
        throw new AggregateError(
          failures,
          'Failed to close the Next.js custom server',
          { cause: failures[0] }
        )
      }
    }

    void runClose().then(
      () => {
        // A failed preparation never created a closeable generation. Release
        // the terminal state so a later successful prepare() can be closed.
        if (!generation.init) {
          if (this.closeGeneration?.promise === closing.promise) {
            this.closeGeneration = undefined
          }
          if (!this.prepareGeneration) this.isClosing = false
        }
        closing.resolve()
      },
      (error) => {
        closing.reject(error)
      }
    )
    return closing.promise
  }

  close(): Promise<void> {
    return this.closeImpl()
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
    // Rspack is selected through env/config side effects instead of a custom
    // server option, so don't fall back to the default Turbopack auto mode.
    const selectRspack = !!process.env.NEXT_RSPACK
    if (selectTurbopack && selectWebpack && selectRspack) {
      throw new Error('Pass either `webpack` or `turbopack`, not both.')
    }
    if (selectTurbopack) {
      process.env.TURBOPACK ??= '1'
    } else if (!selectWebpack && !selectRspack) {
      process.env.TURBOPACK ??= 'auto'
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
