import type { NextServerOptions, NextServer, RequestHandler } from '../next'
import { warn } from '../../build/output/log'
import http from 'http'
import next from '../next'

interface StartServerOptions extends NextServerOptions {
  allowRetry?: boolean
  keepAliveTimeout?: number
}

export function startServer(opts: StartServerOptions) {
  let requestHandler: RequestHandler

  const server = http.createServer((req, res) => {
    return requestHandler(req, res)
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

    server.on('listening', () => {
      const addr = server.address()
      const hostname =
        !opts.hostname || opts.hostname === '0.0.0.0'
          ? 'localhost'
          : opts.hostname

      const app = next({
        ...opts,
        hostname,
        customServer: false,
        httpServer: server,
        port: addr && typeof addr === 'object' ? addr.port : port,
      })

      requestHandler = app.getRequestHandler()
      resolve(app)
    })

    server.listen(port, opts.hostname)
  })
}
