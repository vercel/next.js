#!/usr/bin/env node

import '../server/lib/cpu-profile'
import { existsSync } from 'fs'
import { italic } from '../lib/picocolors'
import build from '../build'
import { warn } from '../build/output/log'
import { printAndExit } from '../server/lib/utils'
import isError from '../lib/is-error'
import { getProjectDir } from '../lib/get-project-dir'
import { enableMemoryDebuggingMode } from '../lib/memory/startup'
import { disableMemoryDebuggingMode } from '../lib/memory/shutdown'
import { parseBundlerArgs } from '../lib/bundler'
import {
  resolveBuildPaths,
  parseBuildPathsInput,
} from '../lib/resolve-build-paths'

export type NextBuildOptions = {
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
}

const nextBuild = async (options: NextBuildOptions, directory?: string) => {
  process.on('SIGTERM', () => process.exit(143))
  process.on('SIGINT', () => process.exit(130))

  const {
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
      `Prerendering is running in debug mode. ${italic(
        'Note: This may affect performance and should not be used for production.'
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

  const bundler = parseBundlerArgs(options)

  // Resolve selective build paths
  let resolvedAppPaths: string[] | undefined
  let resolvedPagePaths: string[] | undefined

  if (debugBuildPaths) {
    try {
      const patterns = parseBuildPathsInput(debugBuildPaths)

      if (patterns.length > 0) {
        const resolved = await resolveBuildPaths(patterns, dir)
        // Pass empty arrays to indicate "build nothing" vs undefined for "build everything"
        resolvedAppPaths = resolved.appPaths
        resolvedPagePaths = resolved.pagePaths
      }
    } catch (err) {
      printAndExit(
        `Failed to resolve build paths: ${isError(err) ? err.message : String(err)}`
      )
    }
  }

  return build(
    dir,
    profile,
    debug || Boolean(process.env.NEXT_DEBUG_BUILD),
    debugPrerender,
    !mangling,
    experimentalAppOnly,
    bundler,
    experimentalBuildMode,
    traceUploadUrl,
    resolvedAppPaths,
    resolvedPagePaths
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

export { nextBuild }
