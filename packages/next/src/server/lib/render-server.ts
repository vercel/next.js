import type { RequestHandler } from '../next'

import './cpu-profile'
import v8 from 'v8'
import http from 'http'
import { isIPv6 } from 'net'

// This is required before other imports to ensure the require hook is setup.
import '../require-hook'

import next from '../next'
import { warn } from '../../build/output/log'
import { getFreePort } from '../lib/worker-utils'

export const WORKER_SELF_EXIT_CODE = 77

const MAXIMUM_HEAP_SIZE_ALLOWED =
  (v8.getHeapStatistics().heap_size_limit / 1024 / 1024) * 0.9

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
  let requestHandler: RequestHandler

  const server = http.createServer((req, res) => {
    return requestHandler(req, res)
      .catch((err) => {
        res.statusCode = 500
        res.end('Internal Server Error')
        console.error(err)
      })
      .finally(() => {
        if (
          process.memoryUsage().heapUsed / 1024 / 1024 >
          MAXIMUM_HEAP_SIZE_ALLOWED
        ) {
          warn(
            'The server is running out of memory, restarting to free up memory.'
          )
          server.close()
          process.exit(WORKER_SELF_EXIT_CODE)
        }
      })
  })

  if (opts.keepAliveTimeout) {
    server.keepAliveTimeout = opts.keepAliveTimeout
  }

  return new Promise(async (resolve, reject) => {
    server.on('error', (err: NodeJS.ErrnoException) => {
      console.error(`Invariant: failed to start render worker`, err)
      process.exit(1)
    })

    let upgradeHandler: any

    if (!opts.dev) {
      server.on('upgrade', (req, socket, upgrade) => {
        upgradeHandler(req, socket, upgrade)
      })
    }

    server.on('listening', async () => {
      try {
        const addr = server.address()
        const port = addr && typeof addr === 'object' ? addr.port : 0

        if (!port) {
          console.error(`Invariant failed to detect render worker port`, addr)
          process.exit(1)
        }

        let hostname =
          !opts.hostname || opts.hostname === '0.0.0.0'
            ? 'localhost'
            : opts.hostname

        if (isIPv6(hostname)) {
          hostname = hostname === '::' ? '[::1]' : `[${hostname}]`
        }
        result = {
          port,
          hostname,
        }
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
        resolve(result)
      } catch (err) {
        return reject(err)
      }
    })
    server.listen(await getFreePort(), '0.0.0.0')
  })
}
