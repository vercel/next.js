import type { NextServer, RequestHandler } from '../next'
import type { DevBundlerService } from './dev-bundler-service'
import type { PropagateToWorkersField } from './router-utils/types'

import next from '../next'
import type { Span } from '../../trace'

let initializations: Record<
  string,
  | Promise<{
      requestHandler: ReturnType<
        InstanceType<typeof NextServer>['getRequestHandler']
      >
      upgradeHandler: ReturnType<
        InstanceType<typeof NextServer>['getUpgradeHandler']
      >
      app: ReturnType<typeof next>
    }>
  | undefined
> = {}

let sandboxContext: undefined | typeof import('../web/sandbox/context')
let requireCacheHotReloader:
  | undefined
  | typeof import('../../build/webpack/plugins/nextjs-require-cache-hot-reloader')

if (process.env.NODE_ENV !== 'production') {
  sandboxContext = require('../web/sandbox/context')
  requireCacheHotReloader = require('../../build/webpack/plugins/nextjs-require-cache-hot-reloader')
}

export function clearAllModuleContexts() {
  return sandboxContext?.clearAllModuleContexts()
}

export function clearModuleContext(target: string) {
  return sandboxContext?.clearModuleContext(target)
}

export function deleteAppClientCache() {
  return requireCacheHotReloader?.deleteAppClientCache()
}

export function deleteCache(filePaths: string[]) {
  for (const filePath of filePaths) {
    requireCacheHotReloader?.deleteCache(filePath)
  }
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
  const { app } = initialization
  let appField = (app as any).server

  if (appField) {
    if (typeof appField[field] === 'function') {
      await appField[field].apply(
        (app as any).server,
        Array.isArray(value) ? value : []
      )
    } else {
      appField[field] = value
    }
  }
}

async function initializeImpl(opts: {
  dir: string
  port: number
  dev: boolean
  minimalMode?: boolean
  hostname?: string
  isNodeDebugging: boolean
  keepAliveTimeout?: number
  serverFields?: any
  server?: any
  experimentalTestProxy: boolean
  experimentalHttpsServer: boolean
  _ipcPort?: string
  _ipcKey?: string
  bundlerService: DevBundlerService | undefined
  startServerSpan: Span | undefined
}) {
  const type = process.env.__NEXT_PRIVATE_RENDER_WORKER
  if (type) {
    process.title = 'next-render-worker-' + type
  }

  let requestHandler: RequestHandler
  let upgradeHandler: any

  const app = next({
    ...opts,
    hostname: opts.hostname || 'localhost',
    customServer: false,
    httpServer: opts.server,
    port: opts.port,
    isNodeDebugging: opts.isNodeDebugging,
  })
  requestHandler = app.getRequestHandler()
  upgradeHandler = app.getUpgradeHandler()

  await app.prepare(opts.serverFields)

  return {
    requestHandler,
    upgradeHandler,
    app,
  }
}

export async function initialize(
  opts: Parameters<typeof initializeImpl>[0]
): Promise<{
  requestHandler: ReturnType<
    InstanceType<typeof NextServer>['getRequestHandler']
  >
  upgradeHandler: ReturnType<
    InstanceType<typeof NextServer>['getUpgradeHandler']
  >
  app: NextServer
}> {
  // if we already setup the server return as we only need to do
  // this on first worker boot
  if (initializations[opts.dir]) {
    return initializations[opts.dir]!
  }
  return (initializations[opts.dir] = initializeImpl(opts))
}
