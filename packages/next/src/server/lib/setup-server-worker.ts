import './cpu-profile'
import v8 from 'v8'
import http, { IncomingMessage, ServerResponse } from 'http'

// This is required before other imports to ensure the require hook is setup.
import '../require-hook'
import '../node-polyfill-fetch'

import { warn } from '../../build/output/log'
import { getFreePort } from '../lib/worker-utils'
import { Duplex } from 'stream'

process.on('unhandledRejection', (err) => {
  console.error(err)
})

process.on('uncaughtException', (err) => {
  console.error(err)
})

export const WORKER_SELF_EXIT_CODE = 77

const MAXIMUM_HEAP_SIZE_ALLOWED =
  (v8.getHeapStatistics().heap_size_limit / 1024 / 1024) * 0.9

export async function initializeServerWorker(
  requestHandler: (req: IncomingMessage, res: ServerResponse) => Promise<any>,
  upgradeHandler: (req: IncomingMessage, socket: Duplex, head: Buffer) => any,
  opts: {
    dir: string
    port: number
    dev: boolean
    minimalMode?: boolean
    hostname?: string
    workerType: 'router' | 'render'
    isNodeDebugging: boolean
    keepAliveTimeout?: number
  }
): Promise<{
  port: number
  hostname: string
  server: http.Server
}> {
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
      console.error(`Invariant: failed to start server worker`, err)
      process.exit(1)
    })

    if (upgradeHandler) {
      server.on('upgrade', (req, socket, upgrade) => {
        upgradeHandler(req, socket, upgrade)
      })
    }
    const hostname =
      !opts.hostname || opts.hostname === 'localhost'
        ? '0.0.0.0'
        : opts.hostname

    server.on('listening', async () => {
      try {
        const addr = server.address()
        const port = addr && typeof addr === 'object' ? addr.port : 0

        if (!port) {
          console.error(`Invariant failed to detect render worker port`, addr)
          process.exit(1)
        }

        resolve({
          server,
          port,
          hostname,
        })
      } catch (err) {
        return reject(err)
      }
    })
    server.listen(await getFreePort(), hostname)
  })
}
