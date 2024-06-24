if (performance.getEntriesByName('next-start').length === 0) {
  performance.mark('next-start')
}
import '../next'
import '../require-hook'

import type { IncomingMessage, ServerResponse } from 'http'
import type { SelfSignedCertificate } from '../../lib/mkcert'
import type { WorkerRequestHandler, WorkerUpgradeHandler } from './types'

import fs from 'fs'
import v8 from 'v8'
import path from 'path'
import http from 'http'
import https from 'https'
import os from 'os'
import Watchpack from 'next/dist/compiled/watchpack'
import * as Log from '../../build/output/log'
import setupDebug from 'next/dist/compiled/debug'
import {
  RESTART_EXIT_CODE,
  getFormattedDebugAddress,
  getNodeDebugType,
} from './utils'
import { formatHostname } from './format-hostname'
import { initialize } from './router-server'
import { CONFIG_FILES } from '../../shared/lib/constants'
import { getStartServerInfo, logStartInfo } from './app-info-log'
import { validateTurboNextConfig } from '../../lib/turbopack-warning'
import { type Span, trace, flushAllTraces } from '../../trace'
import { isPostpone } from './router-utils/is-postpone'

const debug = setupDebug('next:start-server')
let startServerSpan: Span | undefined

export interface StartServerOptions {
  dir: string
  port: number
  isDev: boolean
  hostname?: string
  allowRetry?: boolean
  customServer?: boolean
  minimalMode?: boolean
  keepAliveTimeout?: number
  // this is dev-server only
  selfSignedCertificate?: SelfSignedCertificate
}

export async function getRequestHandlers({
  dir,
  port,
  isDev,
  onCleanup,
  server,
  hostname,
  minimalMode,
  isNodeDebugging,
  keepAliveTimeout,
  experimentalHttpsServer,
  quiet,
}: {
  dir: string
  port: number
  isDev: boolean
  onCleanup: (listener: () => Promise<void>) => void
  server?: import('http').Server
  hostname?: string
  minimalMode?: boolean
  isNodeDebugging?: boolean
  keepAliveTimeout?: number
  experimentalHttpsServer?: boolean
  quiet?: boolean
}): ReturnType<typeof initialize> {
  return initialize({
    dir,
    port,
    hostname,
    onCleanup,
    dev: isDev,
    minimalMode,
    server,
    isNodeDebugging: isNodeDebugging || false,
    keepAliveTimeout,
    experimentalHttpsServer,
    startServerSpan,
    quiet,
  })
}

export async function startServer(
  serverOptions: StartServerOptions
): Promise<void> {
  const {
    dir,
    isDev,
    hostname,
    minimalMode,
    allowRetry,
    keepAliveTimeout,
    selfSignedCertificate,
  } = serverOptions
  let { port } = serverOptions

  process.title = `next-server (v${process.env.__NEXT_VERSION})`
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
  if (selfSignedCertificate && !isDev) {
    throw new Error(
      'Using a self signed certificate is only supported with `next dev`.'
    )
  }

  async function requestListener(req: IncomingMessage, res: ServerResponse) {
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
    } finally {
      if (isDev) {
        if (
          v8.getHeapStatistics().used_heap_size >
          0.8 * v8.getHeapStatistics().heap_size_limit
        ) {
          Log.warn(
            `Server is approaching the used memory threshold, restarting...`
          )
          trace('server-restart-close-to-memory-threshold', undefined, {
            'memory.heapSizeLimit': String(
              v8.getHeapStatistics().heap_size_limit
            ),
            'memory.heapUsed': String(v8.getHeapStatistics().used_heap_size),
          }).stop()
          await flushAllTraces()
          process.exit(RESTART_EXIT_CODE)
        }
      }
    }
  }

  const server = selfSignedCertificate
    ? https.createServer(
        {
          key: fs.readFileSync(selfSignedCertificate.key),
          cert: fs.readFileSync(selfSignedCertificate.cert),
        },
        requestListener
      )
    : http.createServer(requestListener)

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

  await new Promise<void>((resolve) => {
    server.on('listening', async () => {
      const nodeDebugType = getNodeDebugType()

      const addr = server.address()
      const actualHostname = formatHostname(
        typeof addr === 'object'
          ? addr?.address || hostname || 'localhost'
          : addr
      )
      const formattedHostname =
        !hostname || actualHostname === '0.0.0.0'
          ? 'localhost'
          : actualHostname === '[::]'
            ? '[::1]'
            : formatHostname(hostname)

      port = typeof addr === 'object' ? addr?.port || port : port

      const networkUrl = hostname ? `http://${actualHostname}:${port}` : null
      const appUrl = `${
        selfSignedCertificate ? 'https' : 'http'
      }://${formattedHostname}:${port}`

      if (nodeDebugType) {
        const formattedDebugAddress = getFormattedDebugAddress()
        Log.info(
          `the --${nodeDebugType} option was detected, the Next.js router server should be inspected at ${formattedDebugAddress}.`
        )
      }

      // expose the main port to render workers
      process.env.PORT = port + ''
      process.env.__NEXT_PRIVATE_ORIGIN = appUrl

      // Only load env and config in dev to for logging purposes
      let envInfo: string[] | undefined
      let expFeatureInfo: string[] | undefined
      if (isDev) {
        const startServerInfo = await getStartServerInfo(dir, isDev)
        envInfo = startServerInfo.envInfo
        expFeatureInfo = startServerInfo.expFeatureInfo
      }
      logStartInfo({
        networkUrl,
        appUrl,
        envInfo,
        expFeatureInfo,
        maxExperimentalFeatures: 3,
      })

      Log.event(`Starting...`)

      try {
        const cleanupListeners = [() => new Promise((res) => server.close(res))]
        let cleanupStarted = false
        const cleanup = () => {
          if (cleanupStarted) {
            // We can get duplicate signals, e.g. when `ctrl+c` is used in an
            // interactive shell (i.e. bash, zsh), the shell will recursively
            // send SIGINT to children. The parent `next-dev` process will also
            // send us SIGINT.
            return
          }
          cleanupStarted = true
          ;(async () => {
            debug('start-server process cleanup')
            await Promise.all(cleanupListeners.map((f) => f()))
            debug('start-server process cleanup finished')
            process.exit(0)
          })()
        }
        const exception = (err: Error) => {
          if (isPostpone(err)) {
            // React postpones that are unhandled might end up logged here but they're
            // not really errors. They're just part of rendering.
            return
          }

          // This is the render worker, we keep the process alive
          console.error(err)
        }
        // Make sure commands gracefully respect termination signals (e.g. from Docker)
        // Allow the graceful termination to be manually configurable
        if (!process.env.NEXT_MANUAL_SIG_HANDLE) {
          process.on('SIGINT', cleanup)
          process.on('SIGTERM', cleanup)
        }
        process.on('rejectionHandled', () => {
          // It is ok to await a Promise late in Next.js as it allows for better
          // prefetching patterns to avoid waterfalls. We ignore loggining these.
          // We should've already errored in anyway unhandledRejection.
        })
        process.on('uncaughtException', exception)
        process.on('unhandledRejection', exception)

        const initResult = await getRequestHandlers({
          dir,
          port,
          isDev,
          onCleanup: (listener) => cleanupListeners.push(listener),
          server,
          hostname,
          minimalMode,
          isNodeDebugging: Boolean(nodeDebugType),
          keepAliveTimeout,
          experimentalHttpsServer: !!selfSignedCertificate,
        })
        requestHandler = initResult[0]
        upgradeHandler = initResult[1]

        const startServerProcessDuration =
          performance.mark('next-start-end') &&
          performance.measure(
            'next-start-duration',
            'next-start',
            'next-start-end'
          ).duration

        handlersReady()
        const formatDurationText =
          startServerProcessDuration > 2000
            ? `${Math.round(startServerProcessDuration / 100) / 10}s`
            : `${Math.round(startServerProcessDuration)}ms`

        Log.event(`Ready in ${formatDurationText}`)

        if (process.env.TURBOPACK) {
          await validateTurboNextConfig({
            dir: serverOptions.dir,
            isDev: true,
          })
        }
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

  if (isDev) {
    function watchConfigFiles(
      dirToWatch: string,
      onChange: (filename: string) => void
    ) {
      const wp = new Watchpack()
      wp.watch({
        files: CONFIG_FILES.map((file) => path.join(dirToWatch, file)),
      })
      wp.on('change', onChange)
    }
    watchConfigFiles(dir, async (filename) => {
      if (process.env.__NEXT_DISABLE_MEMORY_WATCHER) {
        Log.info(
          `Detected change, manual restart required due to '__NEXT_DISABLE_MEMORY_WATCHER' usage`
        )
        return
      }

      Log.warn(
        `Found a change in ${path.basename(
          filename
        )}. Restarting the server to apply the changes...`
      )
      process.exit(RESTART_EXIT_CODE)
    })
  }
}

if (process.env.NEXT_PRIVATE_WORKER && process.send) {
  process.addListener('message', async (msg: any) => {
    if (msg && typeof msg && msg.nextWorkerOptions && process.send) {
      startServerSpan = trace('start-dev-server', undefined, {
        cpus: String(os.cpus().length),
        platform: os.platform(),
        'memory.freeMem': String(os.freemem()),
        'memory.totalMem': String(os.totalmem()),
        'memory.heapSizeLimit': String(v8.getHeapStatistics().heap_size_limit),
      })
      await startServerSpan.traceAsyncFn(() =>
        startServer(msg.nextWorkerOptions)
      )
      const memoryUsage = process.memoryUsage()
      startServerSpan.setAttribute('memory.rss', String(memoryUsage.rss))
      startServerSpan.setAttribute(
        'memory.heapTotal',
        String(memoryUsage.heapTotal)
      )
      startServerSpan.setAttribute(
        'memory.heapUsed',
        String(memoryUsage.heapUsed)
      )
      process.send({ nextServerReady: true })
    }
  })
  process.send({ nextWorkerReady: true })
}
