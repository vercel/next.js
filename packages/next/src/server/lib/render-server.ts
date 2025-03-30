import type { NextServer, RequestHandler, UpgradeHandler } from '../next'
import type { DevBundlerService } from './dev-bundler-service'
import type { PropagateToWorkersField } from './router-utils/types'

import next from '../next'
import type { Span } from '../../trace'

export type ServerInitResult = {
  requestHandler: RequestHandler
  upgradeHandler: UpgradeHandler
  server: NextServer
  // Make an effort to close upgraded HTTP requests (e.g. Turbopack HMR websockets)
  closeUpgraded: () => void
}

let initializations: Record<string, Promise<ServerInitResult> | undefined> = {}

let sandboxContext: undefined | typeof import('../web/sandbox/context')

if (process.env.NODE_ENV !== 'production') {
  sandboxContext = require('../web/sandbox/context')
}

export function clearAllModuleContexts() {
  return sandboxContext?.clearAllModuleContexts()
}

export function clearModuleContext(target: string) {
  return sandboxContext?.clearModuleContext(target)
}

export async function getServerField(
  dir: string,
  field: PropagateToWorkersField
) {
  const initialization = await initializations[dir]
  if (!initialization) {
    throw new Error('Invariant cant propagate server field, no app initialized')
  }
  const { server } = initialization
  let wrappedServer = server['server']! // NextServer.server is private
  return wrappedServer[field as keyof typeof wrappedServer]
}

export async function propagateServerField(
  dir: string,
  field: PropagateToWorkersField,
  value: any
) {
  const initialization = await initializations[dir]
  if (!initialization) {
    throw new Error('Invariant cant propagate server field, no app initialized')
  }
  const { server } = initialization
  let wrappedServer = server['server']
  const _field = field as keyof NonNullable<typeof wrappedServer>

  if (wrappedServer) {
    if (typeof wrappedServer[_field] === 'function') {
      // @ts-expect-error
      await wrappedServer[_field].apply(
        wrappedServer,
        Array.isArray(value) ? value : []
      )
    } else {
      // @ts-expect-error
      wrappedServer[_field] = value
    }
  }
}

async function initializeImpl(opts: {
  dir: string
  port: number
  dev: boolean
  minimalMode?: boolean
  hostname?: string
  keepAliveTimeout?: number
  serverFields?: any
  server?: any
  experimentalTestProxy: boolean
  experimentalHttpsServer: boolean
  _ipcPort?: string
  _ipcKey?: string
  bundlerService: DevBundlerService | undefined
  startServerSpan: Span | undefined
  quiet?: boolean
  onDevServerCleanup: ((listener: () => Promise<void>) => void) | undefined
}): Promise<ServerInitResult> {
  const type = process.env.__NEXT_PRIVATE_RENDER_WORKER
  if (type) {
    process.title = 'next-render-worker-' + type
  }

  let requestHandler: RequestHandler
  let upgradeHandler: UpgradeHandler

  const server = next({
    ...opts,
    hostname: opts.hostname || 'localhost',
    customServer: false,
    httpServer: opts.server,
    port: opts.port,
  }) as NextServer // should return a NextServer when `customServer: false`
  requestHandler = server.getRequestHandler()
  upgradeHandler = server.getUpgradeHandler()

  await server.prepare(opts.serverFields)

  return {
    requestHandler,
    upgradeHandler,
    server,
    closeUpgraded() {
      opts.bundlerService?.close()
    },
  }
}

export async function initialize(
  opts: Parameters<typeof initializeImpl>[0]
): Promise<ServerInitResult> {
  // if we already setup the server return as we only need to do
  // this on first worker boot
  if (initializations[opts.dir]) {
    return initializations[opts.dir]!
  }
  return (initializations[opts.dir] = initializeImpl(opts))
}
