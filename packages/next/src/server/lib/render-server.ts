import type { NextServer, RequestHandler } from '../next'

import next from '../next'
import { PropagateToWorkersField } from './router-utils/types'

export const WORKER_SELF_EXIT_CODE = 77

let result:
  | undefined
  | {
      requestHandler: ReturnType<
        InstanceType<typeof NextServer>['getRequestHandler']
      >
      upgradeHandler: ReturnType<
        InstanceType<typeof NextServer>['getUpgradeHandler']
      >
    }

let app: ReturnType<typeof next> | undefined

let sandboxContext: undefined | typeof import('../web/sandbox/context')
let requireCacheHotReloader:
  | undefined
  | typeof import('../../build/webpack/plugins/nextjs-require-cache-hot-reloader')

if (process.env.NODE_ENV !== 'production') {
  sandboxContext = require('../web/sandbox/context')
  requireCacheHotReloader = require('../../build/webpack/plugins/nextjs-require-cache-hot-reloader')
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
  field: PropagateToWorkersField,
  value: any
) {
  if (!app) {
    throw new Error('Invariant cant propagate server field, no app initialized')
  }
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

export async function initialize(opts: {
  dir: string
  port: number
  dev: boolean
  minimalMode?: boolean
  hostname?: string
  workerType: 'router' | 'render'
  isNodeDebugging: boolean
  keepAliveTimeout?: number
  serverFields?: any
  server?: any
  experimentalTestProxy: boolean
}) {
  // if we already setup the server return as we only need to do
  // this on first worker boot
  if (result) {
    return result
  }

  const type = process.env.__NEXT_PRIVATE_RENDER_WORKER
  if (type) {
    process.title = 'next-render-worker-' + type
  }

  let requestHandler: RequestHandler
  let upgradeHandler: any

  app = next({
    ...opts,
    _routerWorker: opts.workerType === 'router',
    _renderWorker: opts.workerType === 'render',
    hostname: opts.hostname || 'localhost',
    customServer: false,
    httpServer: opts.server,
    port: opts.port,
    isNodeDebugging: opts.isNodeDebugging,
  })

  requestHandler = app.getRequestHandler()
  upgradeHandler = app.getUpgradeHandler()
  await app.prepare(opts.serverFields)

  result = {
    requestHandler,
    upgradeHandler,
  }

  return result
}
