import type { RequestHandler } from '../next'

// this must come first as it includes require hooks
import { initializeServerWorker } from './setup-server-worker'
import next from '../next'

export const WORKER_SELF_EXIT_CODE = 77

let result:
  | undefined
  | {
      port: number
      hostname: string
    }

let sandboxContext: undefined | typeof import('../web/sandbox/context')
let requireCacheHotReloader:
  | undefined
  | typeof import('../../build/webpack/plugins/nextjs-require-cache-hot-reloader')

if (process.env.NODE_ENV !== 'production') {
  sandboxContext = require('../web/sandbox/context')
  requireCacheHotReloader = require('../../build/webpack/plugins/nextjs-require-cache-hot-reloader')
}

export function clearModuleContext(target: string) {
  sandboxContext?.clearModuleContext(target)
}

export function deleteAppClientCache() {
  requireCacheHotReloader?.deleteAppClientCache()
}

export function deleteCache(filePath: string) {
  requireCacheHotReloader?.deleteCache(filePath)
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
}): Promise<NonNullable<typeof result>> {
  // if we already setup the server return as we only need to do
  // this on first worker boot
  if (result) {
    return result
  }

  const type = process.env.__NEXT_PRIVATE_RENDER_WORKER!
  process.title = 'next-render-worker-' + type

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

  const app = next({
    ...opts,
    _routerWorker: opts.workerType === 'router',
    _renderWorker: opts.workerType === 'render',
    hostname,
    customServer: false,
    httpServer: server,
    port: opts.port,
    isNodeDebugging: opts.isNodeDebugging,
  })

  requestHandler = app.getRequestHandler()
  upgradeHandler = app.getUpgradeHandler()
  await app.prepare()

  result = {
    port,
    hostname: hostname === '0.0.0.0' ? '127.0.0.1' : hostname,
  }
  return result
}
