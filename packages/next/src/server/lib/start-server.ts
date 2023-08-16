import '../node-polyfill-fetch'

import type { IncomingMessage, ServerResponse } from 'http'

import http from 'http'
import * as Log from '../../build/output/log'
import setupDebug from 'next/dist/compiled/debug'
import { getDebugPort } from './utils'
import { formatHostname } from './format-hostname'
import { initialize } from './router-server'
import {
  WorkerRequestHandler,
  WorkerUpgradeHandler,
} from './setup-server-worker'
import { checkIsNodeDebugging } from './is-node-debugging'
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
  isExperimentalTestProxy?: boolean
}

export async function getRequestHandlers({
  dir,
  port,
  isDev,
  hostname,
  minimalMode,
  isNodeDebugging,
  keepAliveTimeout,
  experimentalTestProxy,
}: {
  dir: string
  port: number
  isDev: boolean
  hostname: string
  minimalMode?: boolean
  isNodeDebugging?: boolean
  keepAliveTimeout?: number
  experimentalTestProxy?: boolean
}): ReturnType<typeof initialize> {
  return initialize({
    dir,
    port,
    hostname,
    dev: isDev,
    minimalMode,
    workerType: 'router',
    isNodeDebugging: isNodeDebugging || false,
    keepAliveTimeout,
    experimentalTestProxy,
  })
}

export async function startServer({
  dir,
  port,
  isDev,
  hostname,
  minimalMode,
  allowRetry,
  keepAliveTimeout,
  isExperimentalTestProxy,
  logReady = true,
}: StartServerOptions): Promise<void> {
  let handlersReady = () => {}
  let handlersError = () => {}

  let handlersPromise: Promise<void> | undefined = new Promise<void>(
    (resolve, reject) => {
      handlersReady = resolve
      handlersError = reject
    }
  )
  let requestHandler: WorkerRequestHandler = async (
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> => {
    if (handlersPromise) {
      await handlersPromise
      return requestHandler(req, res)
    }
    throw new Error('Invariant request handler was not setup')
  }
  let upgradeHandler: WorkerUpgradeHandler = async (
    req,
    socket,
    head
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

  const isNodeDebugging = checkIsNodeDebugging()

  await new Promise<void>((resolve) => {
    server.on('listening', async () => {
      const addr = server.address()
      const actualHostname = formatHostname(
        typeof addr === 'object'
          ? addr?.address || hostname || 'localhost'
          : addr
      )

      const formattedHostname =
        !hostname || hostname === '0.0.0.0'
          ? 'localhost'
          : actualHostname === '[::]'
          ? '[::1]'
          : actualHostname

      port = typeof addr === 'object' ? addr?.port || port : port
      const appUrl = `http://${formattedHostname}:${port}`

      if (isNodeDebugging) {
        const debugPort = getDebugPort()
        Log.info(
          `the --inspect${
            isNodeDebugging === 'brk' ? '-brk' : ''
          } option was detected, the Next.js router server should be inspected at port ${debugPort}.`
        )
      }

      if (logReady) {
        Log.ready(`started server on ${actualHostname}:${port}, url: ${appUrl}`)
        // expose the main port to render workers
        process.env.PORT = port + ''
      }

      try {
        const cleanup = () => {
          debug('start-server process cleanup')
          server.close()
          process.exit(0)
        }
        process.on('exit', cleanup)
        process.on('SIGINT', cleanup)
        process.on('SIGTERM', cleanup)
        process.on('uncaughtException', cleanup)
        process.on('unhandledRejection', cleanup)

        const initResult = await getRequestHandlers({
          dir,
          port,
          isDev,
          hostname,
          minimalMode,
          isNodeDebugging: Boolean(isNodeDebugging),
          keepAliveTimeout,
          experimentalTestProxy: !!isExperimentalTestProxy,
        })
        requestHandler = initResult[0]
        upgradeHandler = initResult[1]
        handlersReady()
      } catch (err) {
        // fatal error if we can't setup
        handlersError()
        console.error(err)
        process.exit(1)
      }

      resolve()
    })
    server.listen(port, hostname)
  })
}
