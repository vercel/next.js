import type { RequestHandler } from '../next'

// this must come first as it includes require hooks
import { initializeServerWorker } from './setup-server-worker'
import next from '../next'
import { PropagateToWorkersField } from './router-utils/types'

export const WORKER_SELF_EXIT_CODE = 77

let result:
  | undefined
  | {
      port: number
      hostname: string
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
}): Promise<NonNullable<typeof result>> {
  // if we already setup the server return as we only need to do
  // this on first worker boot
  if (result) {
    return result
  }

  process.title = 'next-render-worker'

  let requestHandler: RequestHandler
  let upgradeHandler: any

  const { port, server, hostname } = await initializeServerWorker(
    (...args) => {
      return requestHandler(...args)
    },
    (...args) => {
      return upgradeHandler(...args)
    },
    opts
  )

  app = next({
    ...opts,
    _routerWorker: opts.workerType === 'router',
    _renderWorker: opts.workerType === 'render',
    hostname: hostname === '0.0.0.0' ? 'localhost' : hostname,
    customServer: false,
    httpServer: server,
    port: opts.port,
    isNodeDebugging: opts.isNodeDebugging,
  })

  requestHandler = app.getRequestHandler()
  upgradeHandler = app.getUpgradeHandler()
  await app.prepare(opts.serverFields)

  result = {
    port,
    hostname: hostname === '0.0.0.0' ? '127.0.0.1' : hostname,
  }
  return result
}
