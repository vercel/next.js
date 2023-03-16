import { isIPv6 } from 'net'
import * as Log from '../../build/output/log'
import { getNodeOptionsWithoutInspect } from './utils'
import type { IncomingMessage, ServerResponse } from 'http'

interface StartServerOptions {
  dir: string
  port: number
  isDev: boolean
  hostname: string
  useWorkers: boolean
  allowRetry?: boolean
  isTurbopack?: boolean
  keepAliveTimeout?: number
}

type TeardownServer = () => Promise<void>

export async function startServer({
  dir,
  port,
  isDev,
  hostname,
  useWorkers,
  allowRetry,
  keepAliveTimeout,
}: StartServerOptions): Promise<TeardownServer> {
  const http = await import('http')
  const sockets = new Set<ServerResponse>()
  let worker: import('next/dist/compiled/jest-worker').Worker | undefined
  let handlersReady = () => {}
  let handlersError = () => {}

  let isNodeDebugging: 'brk' | boolean = !!(
    process.execArgv.some((localArg) => localArg.startsWith('--inspect')) ||
    process.env.NODE_OPTIONS?.match?.(/--inspect(=\S+)?( |$)/)
  )

  if (
    process.execArgv.some((localArg) => localArg.startsWith('--inspect-brk')) ||
    process.env.NODE_OPTIONS?.match?.(/--inspect-brk(=\S+)?( |$)/)
  ) {
    isNodeDebugging = 'brk'
  }

  let handlersPromise: Promise<void> | undefined = new Promise<void>(
    (resolve, reject) => {
      handlersReady = resolve
      handlersError = reject
    }
  )
  let requestHandler = async (
    _req: IncomingMessage,
    _res: ServerResponse
  ): Promise<void> => {
    throw new Error('Invariant request handler was not setup')
  }
  let upgradeHandler = async (
    _req: IncomingMessage,
    _socket: ServerResponse,
    _head: Buffer
  ): Promise<void> => {
    throw new Error('Invariant upgrade handler was not setup')
  }

  // setup server listener as fast as possible
  const server = http.createServer(async (req, res) => {
    try {
      if (handlersPromise) {
        await handlersPromise
        handlersPromise = undefined
      }
      sockets.add(res)
      res.on('close', () => sockets.delete(res))
      await requestHandler(req, res)
    } catch (err) {
      res.statusCode = 500
      res.end('Internal Server Error')
      Log.error(`Failed to handle request for ${req.url}`)
      console.error(err)
    }
  })
  server.on('upgrade', async (req, socket, head) => {
    try {
      sockets.add(socket)
      socket.on('close', () => sockets.delete(socket))
      await upgradeHandler(req, socket, head)
    } catch (err) {
      socket.destroy()
      Log.error(`Failed to handle request for ${req.url}`)
      console.error(err)
    }
  })

  let portRetryCount = 0

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (
      allowRetry &&
      port &&
      isDev &&
      err.code === 'EADDRINUSE' &&
      portRetryCount < 10
    ) {
      Log.warn(`Port ${port} is in use, trying ${port + 1} instead.`)
      port += 1
      portRetryCount += 1
      server.listen(port, hostname)
    } else {
      Log.error(`Failed to start server`)
      console.error(err)
      process.exit(1)
    }
  })
  const host = hostname || '0.0.0.0'
  const normalizedHost = isIPv6(host) ? `[${host}]` : host

  await new Promise<void>((resolve) => {
    server.on('listening', () => {
      const addr = server.address()
      port = typeof addr === 'object' ? addr?.port || port : port
      const appUrl = `http://${host}:${port}`
      Log.ready(`started server on ${normalizedHost}:${port}, url: ${appUrl}`)
      resolve()
    })
    server.listen(port, hostname)
  })

  try {
    if (useWorkers) {
      const { Worker } =
        require('next/dist/compiled/jest-worker') as typeof import('next/dist/compiled/jest-worker')

      const httpProxy =
        require('next/dist/compiled/http-proxy') as typeof import('next/dist/compiled/http-proxy')

      const routerWorker = new Worker(require.resolve('./render-server'), {
        numWorkers: 1,
        forkOptions: {
          env: {
            ...process.env,
            // we don't pass down NODE_OPTIONS as it can
            // extra memory usage
            NODE_OPTIONS: getNodeOptionsWithoutInspect()
              .replace(/--max-old-space-size=[\d]{1,}/, '')
              .trim(),
          },
        },
        exposedMethods: ['initialize'],
      }) as any as InstanceType<typeof Worker> & {
        initialize: typeof import('./render-server').initialize
      }
      routerWorker.getStdout().pipe(process.stdout)
      routerWorker.getStderr().pipe(process.stderr)

      const { port: routerPort } = await routerWorker.initialize({
        dir,
        port,
        hostname,
        dev: !!isDev,
        workerType: 'router',
        keepAliveTimeout,
      })

      const getProxyServer = (pathname: string) => {
        const targetUrl = `http://${normalizedHost}:${routerPort}${pathname}`

        const proxyServer = httpProxy.createProxy({
          target: targetUrl,
          changeOrigin: true,
          ignorePath: true,
          xfwd: true,
          ws: true,
        })

        proxyServer.on('error', () => {
          // TODO?: enable verbose error logs with --debug flag?
        })
        return proxyServer
      }

      // proxy to router worker
      requestHandler = async (req, res) => {
        const proxyServer = getProxyServer(req.url || '/')
        proxyServer.web(req, res)
      }
      upgradeHandler = async (req, socket, head) => {
        const proxyServer = getProxyServer(req.url || '/')
        proxyServer.ws(req, socket, head)
      }
      handlersReady()
    } else {
      // when not using a worker start next in main process
      const { default: next } = require('../next') as typeof import('../next')
      const addr = server.address()
      const app = next({
        dir,
        hostname,
        dev: isDev,
        isNodeDebugging,
        httpServer: server,
        customServer: false,
        port: addr && typeof addr === 'object' ? addr.port : port,
      })
      // handle in process
      requestHandler = app.getRequestHandler()
      upgradeHandler = app.getUpgradeHandler()
      handlersReady()
      await app.prepare()
    }
  } catch (err) {
    // fatal error if we can't setup
    handlersError()
    Log.error(`Failed to setup request handlers`)
    console.error(err)
    process.exit(1)
  }

  // return teardown function for destroying the server
  async function teardown() {
    server.close()
    sockets.forEach((socket) => {
      sockets.delete(socket)
      socket.destroy()
    })

    if (worker) {
      await worker.end()
    }
  }
  return teardown
}
