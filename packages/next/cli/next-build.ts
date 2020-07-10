#!/usr/bin/env node
import { existsSync } from 'fs'
import arg from 'next/dist/compiled/arg/index.js'
import { resolve } from 'path'
import * as Log from '../build/output/log'
import { cliCommand } from '../bin/next'
import build from '../build'
import { printAndExit } from '../server/lib/utils'

const nextBuild: cliCommand = (argv) => {
  const args = arg(
    {
      // Types
      '--help': Boolean,
      '--profile': Boolean,
      // Aliases
      '-h': '--help',
    },
    { argv }
  )

  if (args['--help']) {
    printAndExit(
      `
      Description
        Compiles the application for production deployment

      Usage
        $ next build <dir>

      <dir> represents the directory of the Next.js application.
      If no directory is provided, the current directory will be used.

      --profile can be used to enable React Production Profiling
    `,
      0
    )
  }
  if (args['--profile']) {
    Log.warn('Profiling is enabled. Note: This may affect performance')
  }
  const dir = resolve(args._[0] || '.')

  // Check if the provided directory exists
  if (!existsSync(dir)) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }

  build(dir, null, args['--profile'])
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('')
      console.error('> Build error occurred')
      printAndExit(err)
    })
}

export { nextBuild }
