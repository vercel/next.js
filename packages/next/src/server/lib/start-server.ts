import '../node-polyfill-fetch'

import type { Duplex } from 'stream'
import type { IncomingMessage, ServerResponse } from 'http'

import http from 'http'
import { isIPv6 } from 'net'
import * as Log from '../../build/output/log'
import setupDebug from 'next/dist/compiled/debug'
import { getDebugPort } from './utils'
import { initialize } from './router-server'
const debug = setupDebug('next:start-server')

export interface StartServerOptions {
  dir: string
  port: number
  logReady?: boolean
  isDev: boolean
  hostname: string
  allowRetry?: boolean
  customServer?: boolean
  minimalMode?: boolean
  keepAliveTimeout?: number
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

export async function startServer({
  dir,
  port,
  isDev,
  hostname,
  minimalMode,
  allowRetry,
  keepAliveTimeout,
  logReady = true,
}: StartServerOptions): Promise<TeardownServer> {
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
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> => {
    if (handlersPromise) {
      await handlersPromise
      return requestHandler(req, res)
    }
    throw new Error('Invariant request handler was not setup')
  }
  let upgradeHandler = async (
    req: IncomingMessage,
    socket: ServerResponse | Duplex,
    head: Buffer
  ): Promise<void> => {
    if (handlersPromise) {
      await handlersPromise
      return upgradeHandler(req, socket, head)
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
    server.on('listening', async () => {
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

      try {
        const cleanup = () => {
          debug('start-server process cleanup')
          process.exit(0)
        }
        process.on('exit', cleanup)
        process.on('SIGINT', cleanup)
        process.on('SIGTERM', cleanup)
        process.on('uncaughtException', cleanup)
        process.on('unhandledRejection', cleanup)

        const initResult = await initialize({
          dir,
          port,
          hostname: targetHost,
          dev: !!isDev,
          minimalMode,
          workerType: 'router',
          isNodeDebugging: !!isNodeDebugging,
          keepAliveTimeout,
        })
        requestHandler = initResult[0]
        upgradeHandler = initResult[1]
        routerPort = port
        handlersReady()
      } catch (err) {
        // fatal error if we can't setup
        handlersError()
        console.error(err)
        process.exit(1)
      }

      resolve()
    })
    server.listen(port, hostname === 'localhost' ? '0.0.0.0' : hostname)
  })

  // return teardown function for destroying the server
  async function teardown() {
    server.close()
  }
  teardown.port = routerPort
  return teardown
}
