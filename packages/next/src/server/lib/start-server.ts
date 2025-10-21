// Start CPU profile if it wasn't already started.
import './cpu-profile'
import { getNetworkHost } from '../../lib/get-network-host'

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
import { exec } from 'child_process'
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
import { isIPv6 } from './is-ipv6'
import { AsyncCallbackSet } from './async-callback-set'
import type { NextServer } from '../next'
import type { ConfiguredExperimentalFeature } from '../config'

const debug = setupDebug('next:start-server')
let startServerSpan: Span | undefined

/**
 * Get the process ID (PID) of the process using the specified port
 */
async function getProcessIdUsingPort(port: number): Promise<string | null> {
  const timeoutMs = 250
  const processLookupController = new AbortController()

  const pidPromise = new Promise<string | null>((resolve) => {
    const handleError = (error: Error) => {
      debug('Failed to get process ID for port', port, error)
      resolve(null)
    }

    try {
      // Use lsof on Unix-like systems (macOS, Linux)
      if (process.platform !== 'win32') {
        exec(
          `lsof -ti:${port} -sTCP:LISTEN`,
          { signal: processLookupController.signal },
          (error, stdout) => {
            if (error) {
              handleError(error)
              return
            }
            // `-sTCP` will ensure there's only one port, clean up output
            const pid = stdout.trim()
            resolve(pid || null)
          }
        )
      } else {
        // Use netstat on Windows
        exec(
          `netstat -ano | findstr /C:":${port} " | findstr LISTENING`,
          { signal: processLookupController.signal },
          (error, stdout) => {
            if (error) {
              handleError(error)
              return
            }
            // Clean up output and extract PID
            const cleanOutput = stdout.replace(/\s+/g, ' ').trim()
            if (cleanOutput) {
              const lines = cleanOutput.split('\n')
              const firstLine = lines[0].trim()
              if (firstLine) {
                const parts = firstLine.split(' ')
                const pid = parts[parts.length - 1]
                resolve(pid || null)
              } else {
                resolve(null)
              }
            } else {
              resolve(null)
            }
          }
        )
      }
    } catch (cause) {
      handleError(
        new Error('Unexpected error during process lookup', { cause })
      )
    }
  })

  const timeoutId = setTimeout(() => {
    processLookupController.abort(
      `PID detection timed out after ${timeoutMs}ms for port ${port}.`
    )
  }, timeoutMs)

  pidPromise.finally(() => clearTimeout(timeoutId))

  return pidPromise
}

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
  onDevServerCleanup,
  server,
  hostname,
  minimalMode,
  keepAliveTimeout,
  experimentalHttpsServer,
  quiet,
}: {
  dir: string
  port: number
  isDev: boolean
  onDevServerCleanup: ((listener: () => Promise<void>) => void) | undefined
  server?: import('http').Server
  hostname?: string
  minimalMode?: boolean
  keepAliveTimeout?: number
  experimentalHttpsServer?: boolean
  quiet?: boolean
}): ReturnType<typeof initialize> {
  return initialize({
    dir,
    port,
    hostname,
    onDevServerCleanup,
    dev: isDev,
    minimalMode,
    server,
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

  let nextServer: NextServer | undefined

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
  const originalPort = port

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (
      allowRetry &&
      port &&
      isDev &&
      err.code === 'EADDRINUSE' &&
      portRetryCount < 10
    ) {
      port += 1
      portRetryCount += 1
      server.listen(port, hostname)
    } else {
      Log.error(`Failed to start server`)
      console.error(err)
      process.exit(1)
    }
  })

  let cleanupListeners = isDev ? new AsyncCallbackSet() : undefined

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

      if (portRetryCount) {
        const pid = await getProcessIdUsingPort(originalPort)
        if (pid) {
          Log.warn(
            `Port ${originalPort} is in use by process ${pid}, using available port ${port} instead.`
          )
        } else {
          Log.warn(
            `Port ${originalPort} is in use by an unknown process, using available port ${port} instead.`
          )
        }
      }

      const networkHostname =
        hostname ?? getNetworkHost(isIPv6(actualHostname) ? 'IPv6' : 'IPv4')

      const protocol = selfSignedCertificate ? 'https' : 'http'

      const networkUrl = networkHostname
        ? `${protocol}://${formatHostname(networkHostname)}:${port}`
        : null

      const appUrl = `${protocol}://${formattedHostname}:${port}`

      if (nodeDebugType) {
        const formattedDebugAddress = getFormattedDebugAddress()
        Log.info(
          `the --${nodeDebugType} option was detected, the Next.js router server should be inspected at ${formattedDebugAddress}.`
        )
      }

      // Store the selected port to:
      // - expose it to render workers
      // - re-use it for automatic dev server restarts with a randomly selected port
      process.env.PORT = port + ''

      process.env.__NEXT_PRIVATE_ORIGIN = appUrl

      // Set experimental HTTPS flag for metadata resolution
      if (selfSignedCertificate) {
        process.env.__NEXT_EXPERIMENTAL_HTTPS = '1'
      }

      // Only load env and config in dev to for logging purposes
      let envInfo: string[] | undefined
      let experimentalFeatures: ConfiguredExperimentalFeature[] | undefined
      let cacheComponents: boolean | undefined
      try {
        if (isDev) {
          const startServerInfo = await getStartServerInfo({ dir, dev: isDev })
          envInfo = startServerInfo.envInfo
          cacheComponents = startServerInfo.cacheComponents
          experimentalFeatures = startServerInfo.experimentalFeatures
        }
        logStartInfo({
          networkUrl,
          appUrl,
          envInfo,
          experimentalFeatures,
          cacheComponents,
          logBundler: isDev,
        })

        Log.event(`Starting...`)

        let cleanupStarted = false
        let closeUpgraded: (() => void) | null = null
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

            // first, stop accepting new connections and finish pending requests,
            // because they might affect `nextServer.close()` (e.g. by scheduling an `after`)
            await new Promise<void>((res) => {
              server.close((err) => {
                if (err) console.error(err)
                res()
              })
              if (isDev) {
                server.closeAllConnections()
                closeUpgraded?.()
              }
            })

            // now that no new requests can come in, clean up the rest
            await Promise.all([
              nextServer?.close().catch(console.error),
              cleanupListeners?.runAll().catch(console.error),
            ])

            // Flush telemetry if this is a dev server
            if (isDev) {
              try {
                const { traceGlobals } =
                  require('../../trace/shared') as typeof import('../../trace/shared')
                const telemetry = traceGlobals.get('telemetry') as
                  | InstanceType<
                      typeof import('../../telemetry/storage').Telemetry
                    >
                  | undefined
                if (telemetry) {
                  await telemetry.flush()
                }
              } catch (_) {
                // Ignore telemetry errors during cleanup
              }
            }

            debug('start-server process cleanup finished')
            process.exit(0)
          })()
        }

        // Make sure commands gracefully respect termination signals (e.g. from Docker)
        // Allow the graceful termination to be manually configurable
        if (!process.env.NEXT_MANUAL_SIG_HANDLE) {
          process.on('SIGINT', cleanup)
          process.on('SIGTERM', cleanup)
        }

        const initResult = await getRequestHandlers({
          dir,
          port,
          isDev,
          onDevServerCleanup: cleanupListeners
            ? cleanupListeners.add.bind(cleanupListeners)
            : undefined,
          server,
          hostname,
          minimalMode,
          keepAliveTimeout,
          experimentalHttpsServer: !!selfSignedCertificate,
        })
        requestHandler = initResult.requestHandler
        upgradeHandler = initResult.upgradeHandler
        nextServer = initResult.server
        closeUpgraded = initResult.closeUpgraded

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
            isDev: serverOptions.isDev,
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
    if (
      msg &&
      typeof msg === 'object' &&
      msg.nextWorkerOptions &&
      process.send
    ) {
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
      process.send({ nextServerReady: true, port: process.env.PORT })
    }
  })
  process.send({ nextWorkerReady: true })
}
