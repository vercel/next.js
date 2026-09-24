#!/usr/bin/env node

import { saveCpuProfile } from '../server/lib/cpu-profile'
import { existsSync } from 'fs'
import { italic } from '../lib/picocolors'
import build from '../build'
import { error as logError, prefixes, warn } from '../build/output/log'
import { printAndExit } from '../server/lib/utils'
import isError from '../lib/is-error'
import { getProjectDir } from '../lib/get-project-dir'
import { enableMemoryDebuggingMode } from '../lib/memory/startup'
import { disableMemoryDebuggingMode } from '../lib/memory/shutdown'
import { Bundler, parseBundlerArgs } from '../lib/bundler'
import { parseBuildPathsInput } from '../lib/resolve-build-paths'
import { fork, type ChildProcess } from 'node:child_process'
import type { UpgradeContext, NudgeKind } from '../lib/upgrade/nudge'
import type { UpgradeAction } from '../lib/upgrade/prompt'
import { UpgradeOutput } from '../lib/upgrade/output'
import { clearLine, cursorTo, moveCursor } from 'node:readline'

export type NextBuildOptions = {
  analyze?: boolean
  experimentalAnalyze?: boolean
  debug?: boolean
  debugPrerender?: boolean
  profile?: boolean
  mangling: boolean
  turbo?: boolean
  turbopack?: boolean
  webpack?: boolean
  customWebpack?: boolean
  experimentalDebugMemoryUsage: boolean
  experimentalAppOnly?: boolean
  experimentalTurbo?: boolean
  experimentalBuildMode: 'default' | 'compile' | 'generate' | 'generate-env'
  experimentalUploadTrace?: string
  experimentalNextConfigStripTypes?: boolean
  debugBuildPaths?: string
  experimentalCpuProf?: boolean
  internalTrace?: string | boolean
}

const nextBuild = async (options: NextBuildOptions, directory?: string) => {
  if (process.env.NEXT_PRIVATE_UPGRADE_BUILD_WORKER === '1') {
    // The parent forwards this pipe to a TTY. Expose its cursor operations so
    // the existing build spinner behaves as it does without the supervisor.
    const stream = process.stdout
    Object.defineProperties(stream, {
      isTTY: { value: true },
      columns: {
        value: Number(process.env.NEXT_PRIVATE_UPGRADE_TERMINAL_COLUMNS) || 80,
        writable: true,
      },
      clearLine: {
        value: (direction: -1 | 0 | 1) => clearLine(stream, direction),
      },
      cursorTo: { value: (x: number, y?: number) => cursorTo(stream, x, y) },
      moveCursor: { value: (x: number, y: number) => moveCursor(stream, x, y) },
    })
  }
  let worker: ChildProcess | null = null
  let interruption: number | null = null
  const upgradeState: {
    controller: AbortController | null
    policy: NudgeKind | null
  } = { controller: null, policy: null }
  process.title = `next-build (v${process.env.__NEXT_VERSION})`
  const onTerminate = () => {
    saveCpuProfile()
    if (worker) {
      interruption = 143
      upgradeState.controller?.abort()
      worker.kill('SIGTERM')
      return
    }
    process.exit(143)
  }
  const onInterrupt = () => {
    saveCpuProfile()
    if (worker) {
      interruption = 130
      upgradeState.controller?.abort()
      worker.kill('SIGINT')
      return
    }
    process.exit(130)
  }
  const onHangup = () => {
    saveCpuProfile()
    if (worker) {
      interruption = 129
      upgradeState.controller?.abort()
      worker.kill('SIGHUP')
      return
    }
    process.exit(129)
  }
  process.on('SIGTERM', onTerminate)
  process.on('SIGINT', onInterrupt)
  if (process.env.NEXT_PRIVATE_UPGRADE_BUILD_WORKER === '1') {
    process.on('message', (message: { nextBuildShutdown?: boolean }) => {
      if (message?.nextBuildShutdown) {
        onTerminate()
      }
    })
  }

  const {
    analyze,
    experimentalAnalyze,
    debug,
    debugPrerender,
    experimentalDebugMemoryUsage,
    profile,
    mangling,
    experimentalAppOnly,
    experimentalBuildMode,
    experimentalUploadTrace,
    debugBuildPaths,
  } = options

  let traceUploadUrl: string | undefined
  if (experimentalUploadTrace && !process.env.NEXT_TRACE_UPLOAD_DISABLED) {
    traceUploadUrl = experimentalUploadTrace
  }

  const bundler = parseBundlerArgs(options)

  if ((analyze || experimentalAnalyze) && bundler !== Bundler.Turbopack) {
    printAndExit('--analyze is only compatible with the Turbopack bundler.')
  }

  if (!mangling) {
    warn(
      `Mangling is disabled. ${italic('Note: This may affect performance and should only be used for debugging purposes.')}`
    )
  }

  if (profile) {
    warn(
      `Profiling is enabled. ${italic('Note: This may affect performance.')}`
    )
  }

  if (debugPrerender) {
    warn(
      `Prerendering is running in debug mode with NODE_ENV='development'. ${italic(
        'This will affect performance and should not be used for production.'
      )}`
    )
  }

  if (experimentalDebugMemoryUsage) {
    process.env.EXPERIMENTAL_DEBUG_MEMORY_USAGE = '1'
    enableMemoryDebuggingMode()
  }

  const dir = getProjectDir(directory)

  if (!existsSync(dir)) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }

  let debugBuildPathsPatterns: string[] | undefined

  if (debugBuildPaths) {
    const patterns = parseBuildPathsInput(debugBuildPaths)

    if (patterns.length > 0) {
      debugBuildPathsPatterns = patterns
    }
  }

  const enabledFeatures = Object.fromEntries(
    Object.entries({
      experimentalDebugMemoryUsage,
      experimentalBuildMode:
        experimentalBuildMode !== 'default' ? experimentalBuildMode : undefined,
      experimentalCpuProf: options.experimentalCpuProf,
    }).filter(([_, value]) => value !== undefined && value !== false)
  )

  const { shouldPromptForUpgrade, runUpgrade } = await import(
    '../lib/upgrade/nudge.js'
  )
  const humanUpgrade = await shouldPromptForUpgrade()
  if (humanUpgrade) {
    process.on('SIGHUP', onHangup)
  }

  if (humanUpgrade && process.env.NEXT_PRIVATE_UPGRADE_BUILD_WORKER !== '1') {
    // Config is loaded by build(), so the parent must own output before it
    // knows whether this project offers an upgrade.
    const { nudgeUpgrade } = await import('../lib/upgrade/nudge.js')
    const output = new UpgradeOutput(
      process.stdout,
      process.stderr,
      Boolean(process.stderr.isTTY)
    )
    const workerEnv = {
      ...process.env,
      NEXT_PRIVATE_UPGRADE_BUILD_WORKER: '1',
      NEXT_PRIVATE_UPGRADE_TERMINAL_COLUMNS: String(process.stdout.columns),
    }
    worker = fork(require.resolve('../bin/next'), process.argv.slice(2), {
      cwd: process.cwd(),
      env: {
        ...workerEnv,
        ...(process.env.FORCE_COLOR === undefined &&
        !process.env.NO_COLOR &&
        !process.env.CI &&
        process.env.TERM !== 'dumb'
          ? { FORCE_COLOR: '1' }
          : {}),
      },
      stdio: [
        'ignore',
        'pipe',
        process.stderr.isTTY ? 'pipe' : 'inherit',
        'ipc',
      ],
    })
    worker.stdout!.pipe(output.stdout, { end: false })
    worker.stderr?.pipe(output.stderr, { end: false })
    const buildWorker = worker
    buildWorker.on('error', (error) => {
      logError(`Could not start the build: ${String(error)}`)
    })
    const closed = new Promise<number>((resolveClose) => {
      buildWorker.once('close', (code, signal) => {
        resolveClose(code ?? (signal ? 1 : 0))
      })
    })
    let stopTimeout: NodeJS.Timeout | undefined
    let offer: Promise<void> = Promise.resolve()
    buildWorker.on(
      'message',
      (message: { nextUpgradeContext?: UpgradeContext }) => {
        if (!message.nextUpgradeContext) {
          return
        }
        const context = message.nextUpgradeContext
        const controller = new AbortController()
        upgradeState.controller = controller
        offer = (async () => {
          try {
            const action = await nudgeUpgrade(
              dir,
              context,
              'build',
              controller.signal,
              (show) => {
                return (async (): Promise<UpgradeAction> => {
                  let warning: string | null = null
                  try {
                    if (
                      !(await output.hold(() => {
                        warning =
                          'Upgrade prompt closed because buffered build output reached 1 MiB.'
                        controller.abort()
                      }))
                    ) {
                      warning ??=
                        'Upgrade prompt skipped because build output ended with an incomplete character or terminal escape sequence.'
                      return 'skip'
                    }
                    return await show()
                  } finally {
                    await output.resume(
                      warning ? `${prefixes.warn} ${warning}\n` : null
                    )
                  }
                })()
              }
            )
            if (action === 'interrupt') {
              interruption = 130
              buildWorker.kill('SIGINT')
            } else if (
              action === 'update' &&
              context.experimental.agenticAutoUpgrade &&
              !controller.signal.aborted
            ) {
              upgradeState.policy = context.experimental.agenticAutoUpgrade
              // A descendant can keep a pipe open after the build exits.
              // Never hand off an upgrade without a bounded, drained shutdown.
              stopTimeout = setTimeout(
                () => {
                  buildWorker.kill('SIGKILL')
                  warn('Build shutdown timed out. The upgrade was not started.')
                  process.exit(1)
                },
                Number(process.env.NEXT_EXIT_TIMEOUT_MS) || 5000
              )
              // IPC lets the build flush its last logs and exit with a known
              // status on Windows, where SIGTERM forcefully ends child processes.
              buildWorker.send({ nextBuildShutdown: true }, (error) => {
                if (error) {
                  warn(`Could not stop the build: ${String(error)}`)
                  buildWorker.kill('SIGKILL')
                }
              })
            }
          } catch (error) {
            warn(`Could not offer the upgrade: ${String(error)}`)
          } finally {
            upgradeState.controller = null
          }
        })()
      }
    )
    const code = await closed
    clearTimeout(stopTimeout)
    upgradeState.controller?.abort()
    await offer
    try {
      await output.whenDrained()
    } catch (error) {
      logError(`Could not drain build output: ${String(error)}`)
      process.exit(1)
    }
    if (upgradeState.policy && code === 143 && interruption === null) {
      process.off('SIGTERM', onTerminate)
      process.off('SIGINT', onInterrupt)
      process.off('SIGHUP', onHangup)
      try {
        process.exit(await runUpgrade(dir, upgradeState.policy))
      } catch (error) {
        logError(`Could not start the upgrade: ${String(error)}`)
        process.exit(1)
      }
    }
    if (upgradeState.policy && code !== 143) {
      warn('Build cleanup failed. The upgrade was not started.')
    }
    process.exit(interruption ?? code)
  }

  return build(
    dir,
    analyze || experimentalAnalyze,
    profile,
    debug || Boolean(process.env.NEXT_DEBUG_BUILD),
    debugPrerender,
    !mangling,
    experimentalAppOnly,
    bundler,
    experimentalBuildMode,
    traceUploadUrl,
    debugBuildPathsPatterns,
    enabledFeatures
  )
    .catch((err) => {
      if (experimentalDebugMemoryUsage) {
        disableMemoryDebuggingMode()
      }
      console.error('')
      if (
        isError(err) &&
        (err.code === 'INVALID_RESOLVE_ALIAS' ||
          err.code === 'WEBPACK_ERRORS' ||
          err.code === 'BUILD_OPTIMIZATION_FAILED' ||
          err.code === 'NEXT_EXPORT_ERROR' ||
          err.code === 'NEXT_STATIC_GEN_BAILOUT' ||
          err.code === 'EDGE_RUNTIME_UNSUPPORTED_API')
      ) {
        printAndExit(`> ${err.message}`)
      } else {
        console.error('> Build error occurred')
        printAndExit(err)
      }
    })
    .finally(() => {
      if (experimentalDebugMemoryUsage) {
        disableMemoryDebuggingMode()
      }
    })
}

export { nextBuild, saveCpuProfile }
