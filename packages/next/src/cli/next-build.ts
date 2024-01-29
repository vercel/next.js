#!/usr/bin/env node

import '../server/lib/cpu-profile'
import { existsSync } from 'fs'
import * as Log from '../build/output/log'
import type { CliCommand } from '../lib/commands'
import build from '../build'
import { printAndExit } from '../server/lib/utils'
import isError from '../lib/is-error'
import { getProjectDir } from '../lib/get-project-dir'

const nextBuild: CliCommand = (args) => {
  if (args['--help']) {
    printAndExit(
      `
      Description
        Compiles the application for production deployment

      Usage
        $ next build <dir>

      <dir> represents the directory of the Next.js application.
      If no directory is provided, the current directory will be used.

      Options
      --profile                Can be used to enable React Production Profiling
      --no-lint                Disable linting
      --no-mangling            Disable mangling
      --experimental-app-only  Only build 'app' routes
      --experimental-turbo     Enable experimental turbo mode
      --help, -h               Displays this message
    `,
      0
    )
  }
  if (args['--profile']) {
    Log.warn('Profiling is enabled. Note: This may affect performance')
  }
  if (args['--no-lint']) {
    Log.warn('Linting is disabled')
  }
  if (args['--no-mangling']) {
    Log.warn(
      'Mangling is disabled. Note: This may affect performance and should only be used for debugging purposes'
    )
  }
  const dir = getProjectDir(args._[0])

  // Check if the provided directory exists
  if (!existsSync(dir)) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }

  if (args['--experimental-turbo']) {
    process.env.TURBOPACK = '1'
  }

  return build(
    dir,
    args['--profile'],
    args['--debug'] || process.env.NEXT_DEBUG_BUILD,
    !args['--no-lint'],
    args['--no-mangling'],
    args['--experimental-app-only'],
    !!process.env.TURBOPACK,
    args['--build-mode'] || 'default'
  ).catch((err) => {
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
}

export { nextBuild }
