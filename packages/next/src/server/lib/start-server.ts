import type { Duplex } from 'stream'
import type { IncomingMessage, ServerResponse } from 'http'
import type { ChildProcess } from 'child_process'
import type { NextConfigComplete } from '../config-shared'

import http from 'http'
import { isIPv6 } from 'net'
import { initialEnv } from '@next/env'
import * as Log from '../../build/output/log'
import setupDebug from 'next/dist/compiled/debug'
import { splitCookiesString, toNodeOutgoingHttpHeaders } from '../web/utils'
import { getCloneableBody } from '../body-streams'
import { filterReqHeaders } from './server-ipc/utils'
import setupCompression from 'next/dist/compiled/compression'
import { normalizeRepeatedSlashes } from '../../shared/lib/utils'
import { invokeRequest, pipeReadable } from './server-ipc/invoke-request'
import {
  genRouterWorkerExecArgv,
  getDebugPort,
  getNodeOptionsWithoutInspect,
} from './utils'
import { signalFromNodeResponse } from '../web/spec-extension/adapters/next-request'

const debug = setupDebug('next:start-server')

export interface StartServerOptions {
  dir: string
  prevDir?: string
  port: number
  logReady?: boolean
  isDev: boolean
  hostname: string
  useWorkers: boolean
  allowRetry?: boolean
  isTurbopack?: boolean
  customServer?: boolean
  isExperimentalTurbo?: boolean
  minimalMode?: boolean
  keepAliveTimeout?: number
  onStdout?: (data: any) => void
  onStderr?: (data: any) => void
  nextConfig: NextConfigComplete
}

type TeardownServer = () => Promise<void>

export const checkIsNodeDebugging = () => {
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
  return isNodeDebugging
}

export const createRouterWorker = async (
  routerServerPath: string,
  isNodeDebugging: boolean | 'brk',
  jestWorkerPath = require.resolve('next/dist/compiled/jest-worker')
) => {
  const { Worker } =
    require(jestWorkerPath) as typeof import('next/dist/compiled/jest-worker')

  return new Worker(routerServerPath, {
    numWorkers: 1,
    // TODO: do we want to allow more than 8 OOM restarts?
    maxRetries: 8,
    forkOptions: {
      execArgv: await genRouterWorkerExecArgv(
        isNodeDebugging === undefined ? false : isNodeDebugging
      ),
      env: {
        FORCE_COLOR: '1',
        ...((initialEnv || process.env) as typeof process.env),
        NODE_OPTIONS: getNodeOptionsWithoutInspect(),
        ...(process.env.NEXT_CPU_PROF
          ? { __NEXT_PRIVATE_CPU_PROFILE: `CPU.router` }
          : {}),
        WATCHPACK_WATCHER_LIMIT: '20',
      },
    },
    exposedMethods: ['initialize'],
  }) as any as InstanceType<typeof Worker> & {
    initialize: typeof import('./render-server').initialize
  }
}

export async function startServer({
  dir,
  nextConfig,
  prevDir,
  port,
  isDev,
  hostname,
  useWorkers,
  minimalMode,
  allowRetry,
  keepAliveTimeout,
  onStdout,
  onStderr,
  logReady = true,
}: StartServerOptions): Promise<TeardownServer> {
  const sockets = new Set<ServerResponse | Duplex>()
  let worker: import('next/dist/compiled/jest-worker').Worker | undefined
  let routerPort: number | undefined
  let handlersReady = () => {}
  let handlersError = () => {}

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
    if (handlersPromise) {
      await handlersPromise
      return requestHandler(_req, _res)
    }
    throw new Error('Invariant request handler was not setup')
  }
  let upgradeHandler = async (
    _req: IncomingMessage,
    _socket: ServerResponse | Duplex,
    _head: Buffer
  ): Promise<void> => {
    if (handlersPromise) {
      await handlersPromise
      return upgradeHandler(_req, _socket, _head)
    }
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

  if (keepAliveTimeout) {
    server.keepAliveTimeout = keepAliveTimeout
  }
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

  let targetHost = hostname
  const isNodeDebugging = checkIsNodeDebugging()

  await new Promise<void>((resolve) => {
    server.on('listening', () => {
      const addr = server.address()
      port = typeof addr === 'object' ? addr?.port || port : port

      let host = !hostname || hostname === '0.0.0.0' ? 'localhost' : hostname

      let normalizedHostname = hostname || '0.0.0.0'

      if (isIPv6(hostname)) {
        host = host === '::' ? '[::1]' : `[${host}]`
        normalizedHostname = `[${hostname}]`
      }
      targetHost = host

      const appUrl = `http://${host}:${port}`

      if (isNodeDebugging) {
        const debugPort = getDebugPort()
        Log.info(
          `the --inspect${
            isNodeDebugging === 'brk' ? '-brk' : ''
          } option was detected, the Next.js proxy server should be inspected at port ${debugPort}.`
        )
      }

      if (logReady) {
        Log.ready(
          `started server on ${normalizedHostname}${
            (port + '').startsWith(':') ? '' : ':'
          }${port}, url: ${appUrl}`
        )
        // expose the main port to render workers
        process.env.PORT = port + ''
      }
      resolve()
    })
    server.listen(port, hostname === 'localhost' ? '0.0.0.0' : hostname)
  })

  try {
    if (useWorkers) {
      const httpProxy =
        require('next/dist/compiled/http-proxy') as typeof import('next/dist/compiled/http-proxy')

      let routerServerPath = require.resolve('./router-server')
      let jestWorkerPath = require.resolve('next/dist/compiled/jest-worker')

      if (prevDir) {
        jestWorkerPath = jestWorkerPath.replace(prevDir, dir)
        routerServerPath = routerServerPath.replace(prevDir, dir)
      }

      const routerWorker = await createRouterWorker(
        routerServerPath,
        isNodeDebugging,
        jestWorkerPath
      )
      const cleanup = () => {
        debug('start-server process cleanup')

        for (const curWorker of ((routerWorker as any)._workerPool?._workers ||
          []) as {
          _child?: ChildProcess
        }[]) {
          curWorker._child?.kill('SIGKILL')
        }
      }
      process.on('exit', cleanup)
      process.on('SIGINT', cleanup)
      process.on('SIGTERM', cleanup)
      process.on('uncaughtException', cleanup)
      process.on('unhandledRejection', cleanup)

      let didInitialize = false

      for (const _worker of ((routerWorker as any)._workerPool?._workers ||
        []) as {
        _child: ChildProcess
      }[]) {
        // eslint-disable-next-line no-loop-func
        _worker._child.on('exit', (code, signal) => {
          // catch failed initializing without retry
          if ((code || signal) && !didInitialize) {
            routerWorker?.end()
            process.exit(1)
          }
        })
      }

      const workerStdout = routerWorker.getStdout()
      const workerStderr = routerWorker.getStderr()

      workerStdout.on('data', (data) => {
        if (typeof onStdout === 'function') {
          onStdout(data)
        } else {
          process.stdout.write(data)
        }
      })
      workerStderr.on('data', (data) => {
        if (typeof onStderr === 'function') {
          onStderr(data)
        } else {
          process.stderr.write(data)
        }
      })

      const initializeResult = await routerWorker.initialize({
        dir,
        port,
        hostname,
        dev: !!isDev,
        minimalMode,
        workerType: 'router',
        isNodeDebugging: !!isNodeDebugging,
        keepAliveTimeout,
      })
      routerPort = initializeResult.port
      didInitialize = true

      let compress: ReturnType<typeof setupCompression> | undefined

      if (nextConfig?.compress !== false) {
        compress = setupCompression()
      }

      const getProxyServer = (pathname: string) => {
        const targetUrl = `http://${
          targetHost === 'localhost' ? '127.0.0.1' : targetHost
        }:${routerPort}${pathname}`
        const proxyServer = httpProxy.createProxy({
          target: targetUrl,
          changeOrigin: false,
          ignorePath: true,
          xfwd: true,
          ws: true,
          followRedirects: false,
        })

        // add error listener to prevent uncaught exceptions
        proxyServer.on('error', (_err) => {
          // TODO?: enable verbose error logs with --debug flag?
        })

        proxyServer.on('proxyRes', (proxyRes, innerReq, innerRes) => {
          const cleanupProxy = (err: any) => {
            // cleanup event listeners to allow clean garbage collection
            proxyRes.removeListener('error', cleanupProxy)
            proxyRes.removeListener('close', cleanupProxy)
            innerRes.removeListener('error', cleanupProxy)
            innerRes.removeListener('close', cleanupProxy)

            // destroy all source streams to propagate the caught event backward
            innerReq.destroy(err)
            proxyRes.destroy(err)
          }

          proxyRes.once('error', cleanupProxy)
          proxyRes.once('close', cleanupProxy)
          innerRes.once('error', cleanupProxy)
          innerRes.once('close', cleanupProxy)
        })
        return proxyServer
      }

      // proxy to router worker
      requestHandler = async (req, res) => {
        const urlParts = (req.url || '').split('?')
        const urlNoQuery = urlParts[0]

        // this normalizes repeated slashes in the path e.g. hello//world ->
        // hello/world or backslashes to forward slashes, this does not
        // handle trailing slash as that is handled the same as a next.config.js
        // redirect
        if (urlNoQuery?.match(/(\\|\/\/)/)) {
          const cleanUrl = normalizeRepeatedSlashes(req.url!)
          res.statusCode = 308
          res.setHeader('Location', cleanUrl)
          res.end(cleanUrl)
          return
        }

        if (typeof compress === 'function') {
          // @ts-expect-error not express req/res
          compress(req, res, () => {})
        }

        const targetUrl = `http://${
          targetHost === 'localhost' ? '127.0.0.1' : targetHost
        }:${routerPort}${req.url || '/'}`

        const invokeRes = await invokeRequest(
          targetUrl,
          {
            headers: req.headers,
            method: req.method,
            signal: signalFromNodeResponse(res),
          },
          getCloneableBody(req).cloneBodyStream()
        )

        res.statusCode = invokeRes.status
        res.statusMessage = invokeRes.statusText

        for (const [key, value] of Object.entries(
          filterReqHeaders(toNodeOutgoingHttpHeaders(invokeRes.headers))
        )) {
          if (value !== undefined) {
            if (key === 'set-cookie') {
              const curValue = res.getHeader(key) as string
              const newValue: string[] = [] as string[]

              for (const cookie of Array.isArray(curValue)
                ? curValue
                : splitCookiesString(curValue || '')) {
                newValue.push(cookie)
              }
              for (const val of (Array.isArray(value)
                ? value
                : value
                ? [value]
                : []) as string[]) {
                newValue.push(val)
              }
              res.setHeader(key, newValue)
            } else {
              res.setHeader(key, value as string)
            }
          }
        }

        if (invokeRes.body) {
          await pipeReadable(invokeRes.body, res)
        } else {
          res.end()
        }
      }
      upgradeHandler = async (req, socket, head) => {
        // add error listeners to prevent uncaught exceptions on socket errors
        req.on('error', (_err) => {
          // TODO: log socket errors?
          // console.log(_err)
        })
        socket.on('error', (_err) => {
          // TODO: log socket errors?
          // console.log(_err)
        })
        const proxyServer = getProxyServer(req.url || '/')
        proxyServer.on('proxyReqWs', (proxyReq) => {
          socket.on('close', () => proxyReq.destroy())
        })
        proxyServer.ws(req, socket, head)
      }
      handlersReady()
    } else {
      // when not using a worker start next in main process
      const next = require('../next') as typeof import('../next').default
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
      await app.prepare()
      handlersReady()
    }
  } catch (err) {
    // fatal error if we can't setup
    handlersError()
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
  teardown.port = routerPort
  return teardown
}
