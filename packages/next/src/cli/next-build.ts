#!/usr/bin/env node

import { saveCpuProfile } from '../server/lib/cpu-profile'
import { existsSync } from 'fs'
import { italic } from '../lib/picocolors'
import build from '../build'
import { warn } from '../build/output/log'
import { printAndExit } from '../server/lib/utils'
import isError from '../lib/is-error'
import { getProjectDir } from '../lib/get-project-dir'
import { enableMemoryDebuggingMode } from '../lib/memory/startup'
import { disableMemoryDebuggingMode } from '../lib/memory/shutdown'
import { Bundler, parseBundlerArgs } from '../lib/bundler'
import { parseBuildPathsInput } from '../lib/resolve-build-paths'

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
  wasi?: boolean
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
  const onTerminate = () => {
    saveCpuProfile()
    process.exit(143)
  }
  const onInterrupt = () => {
    saveCpuProfile()
    process.exit(130)
  }
  const onHangup = () => {
    saveCpuProfile()
    process.exit(129)
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

  if (options.wasi && bundler !== Bundler.Turbopack) {
    printAndExit('--wasi is only compatible with the Turbopack bundler.')
  }
  if (options.wasi && (analyze || experimentalAnalyze)) {
    printAndExit('--wasi does not yet support --analyze.')
  }
  if (options.wasi) {
    // Private process-wide selection is inherited by Next build workers. It is set before config
    // loading so a next.config.ts transform uses the same N-API/WASI binding as the build.
    process.env.NEXT_PRIVATE_BUILD_WASI = '1'
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
      wasi: options.wasi,
    }).filter(([_, value]) => value !== undefined && value !== false)
  )

  const { shouldPromptForUpgrade, runUpgrade } = await import(
    '../lib/upgrade/nudge.js'
  )
  const humanUpgrade = await shouldPromptForUpgrade()
  if (humanUpgrade) {
    process.on('SIGHUP', onHangup)
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
    enabledFeatures,
    humanUpgrade
  )
    .then(async (action) => {
      if (action === 'interrupt') {
        process.exit(130)
      }
      if (action) {
        process.off('SIGTERM', onTerminate)
        process.off('SIGINT', onInterrupt)
        process.off('SIGHUP', onHangup)
        process.exit(await runUpgrade(dir, action))
      }
    })
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
