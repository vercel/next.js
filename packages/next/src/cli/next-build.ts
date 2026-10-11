#!/usr/bin/env node

import { saveCpuProfile } from '../server/lib/cpu-profile'
import { existsSync } from 'fs'
import { italic } from '../lib/picocolors'
import build from '../build'
import { warn } from '../build/output/log'
import {
  blockOnOutputWrites,
  getNodeDebugType,
  getParsedNodeOptions,
  printAndExit,
} from '../server/lib/utils'
import isError from '../lib/is-error'
import { getProjectDir } from '../lib/get-project-dir'
import { warnMissingReactDependencies } from '../lib/warn-missing-react-dependencies'
import { enableMemoryDebuggingMode } from '../lib/memory/startup'
import { disableMemoryDebuggingMode } from '../lib/memory/shutdown'
import { Bundler, parseBundlerArgs } from '../lib/bundler'
import { parseBuildPathsInput } from '../lib/resolve-build-paths'
import {
  closedUpgradeMenu,
  createPromptOutput,
  drainPromptOutput,
  flushUpgradeTelemetry,
  getPromptOutputEnv,
  reassertRawMode,
  showUpgradeMenu,
} from '../lib/upgrade/prompt-output'
import type { UpgradeContext } from '../lib/upgrade/nudge'
import { fork } from 'child_process'
import { once } from 'events'
import os from 'os'

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
  process.title = `next-build (v${process.env.__NEXT_VERSION})`

  // To show the upgrade menu without pausing the build, run the build in a
  // child and keep the menu here.
  if (process.env.NEXT_PRIVATE_UPGRADE_BUILD_CHILD === '1') {
    blockOnOutputWrites()
  } else if (await shouldBuildInChild()) {
    return buildInChild()
  }

  const onTerminate = () => {
    saveCpuProfile()
    process.exit(143)
  }
  const onInterrupt = () => {
    saveCpuProfile()
    process.exit(130)
  }
  process.on('SIGTERM', onTerminate)
  process.on('SIGINT', onInterrupt)

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
  warnMissingReactDependencies(dir)

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

// Debugger and profiler runs stay in one process and skip the menu. Otherwise
// the debugger would attach to the wrong process, or there would be two
// profiles.
async function shouldBuildInChild() {
  const nodeOptions = getParsedNodeOptions()
  if (
    process.env.NEXT_CPU_PROF ||
    getNodeDebugType(nodeOptions) ||
    ['inspect-wait', 'cpu-prof', 'heap-prof', 'prof'].some(
      (flag) => nodeOptions[flag]
    )
  ) {
    return false
  }
  const { shouldPromptForUpgrade } = await import('../lib/upgrade/nudge.js')
  return shouldPromptForUpgrade()
}

// Always exits by itself; the caller would exit with 0 if this returned.
async function buildInChild(): Promise<never> {
  // Rerun the same command as a child, with its output piped to us.
  const child = fork(process.argv[1], process.argv.slice(2), {
    stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
    env: {
      ...process.env,
      ...getPromptOutputEnv(),
      NEXT_PRIVATE_UPGRADE_BUILD_CHILD: '1',
    },
  })
  const exited = once(child, 'exit') as Promise<
    [number | null, NodeJS.Signals | null]
  >
  const output = createPromptOutput()
  output.attach(child)

  // Don't leave the build running if we exit first.
  process.on('exit', () => child.kill())

  // Pass signals to the build and close the menu. Remember the signal: the
  // build may already be done, and then its exit code says nothing about it.
  const controller = new AbortController()
  const aborted = once(controller.signal, 'abort')
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const
  let received: NodeJS.Signals | undefined
  function onSignal(signal: NodeJS.Signals) {
    received ??= signal
    controller.abort()
    child.kill(signal)
  }
  for (const signal of signals) {
    process.on(signal, onSignal)
  }

  // The child asks for the menu once it has loaded the config.
  let menu: Promise<void> | undefined
  child.on(
    'message',
    (message: {
      nextUpgradeContext?: UpgradeContext
      dir?: string
      telemetryDisabled?: string
    }) => {
      const { nextUpgradeContext: context, dir } = message ?? {}
      if (!context || !dir || menu) {
        return
      }
      menu = (async () => {
        const result = await showUpgradeMenu(output, {
          dir,
          context,
          command: 'build',
          signal: controller.signal,
          initialAssessment: null,
          telemetryDisabled: message.telemetryDisabled,
        })
        if (result === 'interrupt') {
          // Ctrl+C in the menu
          onSignal('SIGINT')
        } else if (result) {
          // Upgrade: show the result of a build that already finished, or stop
          // the build and drop its output.
          const finished = child.exitCode !== null || child.signalCode !== null
          if (finished) {
            output.release()
          } else {
            output.discard()
          }
          child.kill('SIGTERM')
          await exited
          // Stopped while the build was ending. Exit below with the signal.
          if (received) {
            return
          }
          // From here Ctrl+C should stop the upgrade, so stop catching it.
          for (const signal of signals) {
            process.off(signal, onSignal)
          }
          const { runUpgrade } = await import('../lib/upgrade/nudge.js')
          const exitCode = await runUpgrade(dir, result.policy, result.nudgeId)
          await flushUpgradeTelemetry()
          // A build that failed still fails the command.
          process.exit(exitCode || (finished ? (child.exitCode ?? 1) : 0))
        }
      })()
    }
  )

  // If the build finishes first, keep the menu up until the user answers.
  const [code, signal] = await exited
  reassertRawMode()
  await drainPromptOutput(child)
  // After a signal, don't wait on a network check the menu may still be making.
  await Promise.race([menu, aborted.then(() => closedUpgradeMenu(menu))])
  await flushUpgradeTelemetry()

  const stoppedBy = received ?? signal
  process.exit(stoppedBy ? 128 + os.constants.signals[stoppedBy] : code!)
}

export { nextBuild, saveCpuProfile }
