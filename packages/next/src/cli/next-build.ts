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

export type NextBuildOptions = {
  debug?: boolean
  profile?: boolean
  lint: boolean
  mangling: boolean
  experimentalDebugMemoryUsage: boolean
  experimentalAppOnly?: boolean
  experimentalTurbo?: boolean
  experimentalBuildMode: 'default' | 'compile' | 'generate'
  experimentalUploadTrace?: string
}

const nextBuild = (options: NextBuildOptions, directory?: string) => {
  process.on('SIGTERM', () => process.exit(143))
  process.on('SIGINT', () => process.exit(130))

  const {
    debug,
    experimentalDebugMemoryUsage,
    profile,
    lint,
    mangling,
    experimentalAppOnly,
    experimentalTurbo,
    experimentalBuildMode,
    experimentalUploadTrace,
  } = options

  let traceUploadUrl: string | undefined
  if (experimentalUploadTrace && !process.env.NEXT_TRACE_UPLOAD_DISABLED) {
    traceUploadUrl = experimentalUploadTrace
  }

  if (!lint) {
    warn('Linting is disabled.')
  }

  if (!mangling) {
    warn(
      'Mangling is disabled. Note: This may affect performance and should only be used for debugging purposes.'
    )
  }

  if (profile) {
    warn(
      `Profiling is enabled. ${italic('Note: This may affect performance.')}`
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

  if (experimentalTurbo) {
    process.env.TURBOPACK = '1'
  }

  return build(
    dir,
    profile,
    debug || Boolean(process.env.NEXT_DEBUG_BUILD),
    lint,
    !mangling,
    experimentalAppOnly,
    !!process.env.TURBOPACK,
    experimentalBuildMode,
    traceUploadUrl
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
