import type { NextServerOptions, NextServer, RequestHandler } from '../next'
import { warn } from '../../build/output/log'
import http from 'http'
import next from '../next'
import { isIPv6 } from 'net'
import v8 from 'v8'
const isChildProcess = !!process.env.__NEXT_DEV_CHILD_PROCESS

interface StartServerOptions extends NextServerOptions {
  allowRetry?: boolean
  keepAliveTimeout?: number
}

export const WORKER_SELF_EXIT_CODE = 77

const MAXIMUM_HEAP_SIZE_ALLOWED =
  (v8.getHeapStatistics().heap_size_limit / 1024 / 1024) * 0.9

export function startServer(opts: StartServerOptions) {
  let requestHandler: RequestHandler

  const server = http.createServer((req, res) => {
    return requestHandler(req, res).finally(() => {
      if (
        isChildProcess &&
        process.memoryUsage().heapUsed / 1024 / 1024 > MAXIMUM_HEAP_SIZE_ALLOWED
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

  return new Promise<NextServer>((resolve, reject) => {
    let port = opts.port
    let retryCount = 0

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (
        port &&
        opts.allowRetry &&
        err.code === 'EADDRINUSE' &&
        retryCount < 10
      ) {
        warn(`Port ${port} is in use, trying ${port + 1} instead.`)
        port += 1
        retryCount += 1
        server.listen(port, opts.hostname)
      } else {
        reject(err)
      }
    })

    let upgradeHandler: any

    if (!opts.dev) {
      server.on('upgrade', (req, socket, upgrade) => {
        upgradeHandler(req, socket, upgrade)
      })
    }

    server.on('listening', () => {
      const addr = server.address()
      let hostname =
        !opts.hostname || opts.hostname === '0.0.0.0'
          ? 'localhost'
          : opts.hostname
      if (isIPv6(hostname)) {
        hostname = hostname === '::' ? '[::1]' : `[${hostname}]`
      }

      const app = next({
        ...opts,
        hostname,
        customServer: false,
        httpServer: server,
        port: addr && typeof addr === 'object' ? addr.port : port,
      })

      requestHandler = app.getRequestHandler()
      upgradeHandler = app.getUpgradeHandler()
      resolve(app)
    })

    server.listen(port, opts.hostname)
  })
}
