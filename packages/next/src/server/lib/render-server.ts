import v8 from 'v8'
import http from 'http'
import next from '../next'
import { isIPv6 } from 'net'
import { warn } from '../../build/output/log'
import type { RequestHandler } from '../next'
import {
  deleteCache as _deleteCache,
  deleteAppClientCache as _deleteAppClientCache,
} from '../../build/webpack/plugins/nextjs-require-cache-hot-reloader'
import { clearModuleContext as _clearModuleContext } from '../web/sandbox/context'
export const WORKER_SELF_EXIT_CODE = 77

const MAXIMUM_HEAP_SIZE_ALLOWED =
  (v8.getHeapStatistics().heap_size_limit / 1024 / 1024) * 0.9

let result:
  | undefined
  | {
      port: number
      hostname: string
    }

export function clearModuleContext(target: string, content: string) {
  _clearModuleContext(target, content)
}

export function deleteAppClientCache() {
  _deleteAppClientCache()
}

export function deleteCache(filePath: string) {
  _deleteCache(filePath)
}

export async function initialize(opts: {
  dir: string
  port: number
  dev: boolean
  hostname?: string
  workerType: 'router' | 'render'
  keepAliveTimeout?: number
}): Promise<NonNullable<typeof result>> {
  // if we already setup the server return as we only need to do
  // this on first worker boot
  if (result) {
    return result
  }
  let requestHandler: RequestHandler

  const server = http.createServer((req, res) => {
    return requestHandler(req, res).finally(() => {
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

  return new Promise((resolve, reject) => {
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
        })

        requestHandler = app.getRequestHandler()
        upgradeHandler = app.getUpgradeHandler()
        await app.prepare()
        resolve(result)
      } catch (err) {
        return reject(err)
      }
    })
    server.listen(0, opts.hostname)
  })
}
