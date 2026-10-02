#!/usr/bin/env node

import { saveCpuProfile } from '../server/lib/cpu-profile'
import { existsSync } from 'fs'
import path from 'path'
import { Telemetry } from '../telemetry/storage'
import { italic } from '../lib/picocolors'
import { warn } from '../build/output/log'
import { getParsedNodeOptions, printAndExit } from '../server/lib/utils'
import isError from '../lib/is-error'
import { getProjectDir } from '../lib/get-project-dir'
import { warnMissingReactDependencies } from '../lib/warn-missing-react-dependencies'
import { enableMemoryDebuggingMode } from '../lib/memory/startup'
import { disableMemoryDebuggingMode } from '../lib/memory/shutdown'
import { Bundler, parseBundlerArgs } from '../lib/bundler'
import { parseBuildPathsInput } from '../lib/resolve-build-paths'
import { fork } from 'child_process'
import { constants } from 'os'
import type { UpgradeContext } from '../lib/upgrade/nudge'
import {
  uncork,
  forwardUpgradeInput,
  forwardUpgradeResize,
  handleUpgradeOutputMessages,
  isUpgradeOutputManaged,
  killUpgradeWork,
  restoreUpgradeEnvironment,
  signalUpgradeWork,
  waitForUpgradeOutput,
} from '../lib/upgrade-output'

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
  // Validate CLI-only input before capturing output. Config still loads once,
  // in the work process, after the supervisor is ready to handle its failure.
  const dir = getProjectDir(directory)
  const bundler = parseBundlerArgs(options)
  if (!existsSync(dir)) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }
  if (
    (options.analyze || options.experimentalAnalyze) &&
    bundler !== Bundler.Turbopack
  ) {
    printAndExit('--analyze is only compatible with the Turbopack bundler.')
  }

  // Only interactive humans need a supervisor. Keep config, compilation and
  // their exception handlers out of the process that owns the upgrade menu.
  if (!isUpgradeOutputManaged()) {
    const { shouldPromptForUpgrade } = await import('../lib/upgrade/nudge.js')
    // Preloads already ran in this process. Forking would replay them and can
    // collide with ports or other resources they own; keep the ordinary build.
    const nodeOptions = getParsedNodeOptions()
    const hasPreload =
      nodeOptions.require !== undefined ||
      nodeOptions.r !== undefined ||
      nodeOptions.import !== undefined ||
      nodeOptions.loader !== undefined ||
      nodeOptions['experimental-loader'] !== undefined
    if (!hasPreload && (await shouldPromptForUpgrade())) {
      return runBuildChild(options, dir)
    }
  }

  process.title = `next-build (v${process.env.__NEXT_VERSION})`

  // Every handled signal saves the profile and releases held logs before exit.
  // Use the signal's usual status instead of repeating the same cleanup.
  const onSignal = async (signal: NodeJS.Signals) => {
    saveCpuProfile()
    await uncork()
    process.exit(128 + constants.signals[signal])
  }
  process.on('SIGTERM', onSignal)
  process.on('SIGINT', onSignal)
  if (isUpgradeOutputManaged()) {
    process.on('SIGHUP', onSignal)
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

  warnMissingReactDependencies(dir)

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

  const build = (require('../build') as typeof import('../build')).default

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
    .catch(async (err) => {
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
        console.error(`> ${err.message}`)
      } else {
        console.error('> Build error occurred')
        console.error(err)
      }
      await uncork()
      process.exit(1)
    })
    .finally(() => {
      if (experimentalDebugMemoryUsage) {
        disableMemoryDebuggingMode()
      }
    })
}

async function runBuildChild(
  options: NextBuildOptions,
  directory: string
): Promise<never> {
  const { nudgeUpgrade, runUpgrade } = await import('../lib/upgrade/nudge.js')
  const controller = new AbortController()

  // A choice is committed before awaiting telemetry or shutdown. Safeguards
  // and workload failures can end a pending menu, but cannot undo Upgrade.
  let phase = 'prompt' as 'prompt' | 'running' | 'upgrade' | 'exit'
  let offer: Promise<void> | null = null
  let stopping: Promise<void> | null = null
  let upgradeResult: string | number | null = null
  let stopped = false
  let complete = false
  let workError: Error | null = null
  let interruption: NodeJS.Signals | null = null

  // Keep real output TTYs and give menu input only to the parent. After Skip,
  // stdin is forwarded through the pipe; typed input may echo or reach plugins.
  // Preserve entry, arguments and cwd without repeating CLI initialization.
  const worker = fork(process.argv[1], process.argv.slice(2), {
    stdio: ['pipe', 'inherit', 'inherit', 'ipc'],
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      // This is the main build, so do not use the compiler-worker marker that
      // suppresses startup warnings. Supervision has its own entry marker.
      NEXT_PRIVATE_UPGRADE_BUILD_WORKER: '1',
      NEXT_PRIVATE_UPGRADE_PROCESS_GROUP: '1',
      __NEXT_PRIVATE_CPU_PROFILE: process.env.NEXT_CPU_PROF
        ? 'build-worker'
        : undefined,
    },
  })
  forwardUpgradeResize(worker)
  const exited = new Promise<number>((resolve) => {
    worker.once('close', (code, signal) => {
      stopped = true
      resolve(
        code !== null && code >= 0
          ? code
          : signal
            ? 128 + constants.signals[signal]
            : 1
      )
    })
  })

  // Restore the screen before giving output back. Fatal shutdown releases
  // logs without forwarding keys; Skip lets the existing build keep running.
  const release = () => {
    if (worker.connected) {
      worker.send({ nextUpgradeContinue: true })
    }
    if (phase === 'running' && !stopped) {
      forwardUpgradeInput(worker)
    }
  }

  // All shutdown paths share input cleanup, one close wait and descendant
  // cleanup. Upgrade discards logs immediately; other exits give the child a
  // bounded time to finish. A second interrupt can force-kill a slow cleanup.
  const stopBuildChild = (forceKill: boolean) => {
    stopping ??= (async () => {
      if (worker.stdin) {
        process.stdin.unpipe(worker.stdin)
      }
      if (forceKill) {
        killUpgradeWork(worker)
      } else {
        controller.abort()
        release()
        if (interruption && !stopped && !complete) {
          signalUpgradeWork(worker, interruption)
        }
      }

      const timeout = forceKill
        ? null
        : setTimeout(() => killUpgradeWork(worker), 5_000)
      try {
        await exited
        killUpgradeWork(worker)
      } finally {
        if (timeout) {
          clearTimeout(timeout)
        }
      }
    })().catch((error) => {
      console.error(error)
      process.exit(1)
    })
    return stopping
  }
  const onSignal = (signal: NodeJS.Signals) => {
    if (interruption) {
      killUpgradeWork(worker)
      return
    }
    interruption = signal
    phase = 'exit'
    controller.abort()
    void stopBuildChild(false)
  }
  const onExit = () => {
    phase = 'exit'
    killUpgradeWork(worker)
  }
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP']
  if (process.platform !== 'win32') {
    signals.push('SIGQUIT')
  }
  for (const signal of signals) {
    process.on(signal, onSignal)
  }
  const removeSignalHandlers = () => {
    for (const signal of signals) {
      process.off(signal, onSignal)
    }
  }
  process.once('exit', onExit)

  // IPC failure can arrive before close. Preserve the diagnostic and drain
  // through the same exit path; committed Upgrade no longer needs these logs.
  worker.on('error', (error) => {
    if (phase === 'upgrade') {
      return
    }
    workError = error
    phase = 'exit'
    void stopBuildChild(false)
  })
  worker.on('message', (message: any) => {
    if (message.nextBuildReady) {
      worker.send({ nextBuildOptions: options, directory })
    } else if (message.nextBuildComplete) {
      complete = true
    } else if (
      message.nextUpgradeContext &&
      offer === null &&
      phase === 'prompt'
    ) {
      const context = message.nextUpgradeContext as UpgradeContext
      const environment: Record<string, string | null> | null =
        message.nextUpgradeEnvironment ?? null
      offer = (async () => {
        // Assessment and telemetry need the flags loaded by config/.env. Other
        // project env changes stay isolated until the upgrade handoff.
        restoreUpgradeEnvironment(
          Object.fromEntries(
            Object.entries(environment ?? {}).filter(
              ([key]) =>
                key === 'NEXT_TELEMETRY_DISABLED' ||
                key === 'NEXT_TELEMETRY_DEBUG' ||
                key === '__NEXT_AGENT_UPGRADE'
            )
          )
        )
        const telemetry = new Telemetry({
          distDir: path.join(directory, context.distDir),
          skipNotify: true,
        })
        let nudgeId: string | null = null
        try {
          const action = await nudgeUpgrade(
            directory,
            context,
            'build',
            controller.signal,
            null,
            {
              telemetry,
              onNudgeId(id) {
                nudgeId = id
              },
            }
          ).catch((error) => {
            warn(`Could not offer the upgrade: ${String(error)}`)
          })

          // Commit before the first wait after choosing. Late Skip/fatal
          // messages can no longer cancel Upgrade while telemetry flushes.
          if (phase === 'prompt') {
            if (action === 'interrupt') {
              onSignal('SIGINT')
            } else if (
              action === 'update' &&
              context.experimental.agentUpgrade
            ) {
              phase = 'upgrade'
              await stopBuildChild(true)
            } else {
              phase = 'running'
              release()
            }
          }
        } finally {
          // Flush once, including policy-only events and failed assessments.
          await telemetry.flush()
        }
        if (phase === 'upgrade' && context.experimental.agentUpgrade) {
          removeSignalHandlers()
          restoreUpgradeEnvironment(environment)
          upgradeResult = await runUpgrade(
            directory,
            context.experimental.agentUpgrade,
            nudgeId
          )
        }
      })()
      // Cancelled assessment may outlive this CLI. Always observe rejection,
      // even when the exit path no longer needs to await the offer.
      void offer.catch(console.error)
    } else if (message.nextUpgradeSkip && phase === 'prompt') {
      phase = 'running'
      controller.abort()
      release()
    } else if (
      message.nextUpgradeOutput &&
      phase !== 'upgrade' &&
      phase !== 'exit'
    ) {
      phase = 'exit'
      void stopBuildChild(false)
    }
  })

  try {
    const code = await exited
    if (phase === 'prompt' || (phase !== 'upgrade' && code !== 0)) {
      phase = 'exit'
      await stopBuildChild(false)
    }
    await stopping
    if (workError) {
      console.error(workError)
    } else if (phase === 'exit' && !interruption && code !== 0) {
      console.error(`Build stopped (${worker.signalCode ?? `exit ${code}`}).`)
    }

    // Upgrade must finish its handoff. Otherwise a cancelled assessment must
    // never keep an already finished build alive after Skip or fatal shutdown.
    if (phase === 'upgrade' || !controller.signal.aborted) {
      // An interrupt may arrive after close, while telemetry is still pending.
      // Let it end this wait too; the observed offer can settle independently.
      await Promise.race([
        offer,
        new Promise<void>((resolve) => {
          controller.signal.addEventListener('abort', () => resolve(), {
            once: true,
          })
        }),
      ])
    }
    saveCpuProfile()
    return process.exit(
      interruption
        ? 128 + constants.signals[interruption]
        : workError
          ? 1
          : (upgradeResult ?? code)
    )
  } finally {
    phase = 'exit'
    controller.abort()
    removeSignalHandlers()
    process.off('exit', onExit)
    killUpgradeWork(worker)
  }
}

// Supervision is installed before importing build. The normal CLI has already
// parsed options in the parent; only those options arrive through this channel.
export function startBuildWorker() {
  // Consume the entry marker so a plugin's forked CLI is not mistaken for this
  // worker. Output management is process-local after the handshake is installed.
  handleUpgradeOutputMessages()
  delete process.env.NEXT_PRIVATE_UPGRADE_BUILD_WORKER
  process.on(
    'message',
    async (message: {
      nextBuildOptions: NextBuildOptions | undefined
      directory: string
    }) => {
      if (!message.nextBuildOptions) {
        return
      }
      try {
        await nextBuild(message.nextBuildOptions, message.directory)
        process.send?.({ nextBuildComplete: true })
        await waitForUpgradeOutput()
        saveCpuProfile()
        await uncork()
        process.exit(0)
      } catch (error) {
        console.error(error)
        await uncork()
        process.exit(1)
      }
    }
  )
  process.send!({ nextBuildReady: true })
}

export { nextBuild, saveCpuProfile }
