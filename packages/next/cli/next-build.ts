#!/usr/bin/env node
import { existsSync } from 'fs'
import arg from 'next/dist/compiled/arg/index.js'
import { resolve } from 'path'
import { cliCommand } from '../bin/next'
import build from '../build'
import { printAndExit } from '../server/lib/utils'

const nextBuild: cliCommand = (argv) => {
  const validArgs: arg.Spec = {
    // Types
    '--help': Boolean,
    // Aliases
    '-h': '--help',
  }

  let args: arg.Result<arg.Spec>
  try {
    args = arg(validArgs, { argv })
  } catch (error) {
    if (error.code === 'ARG_UNKNOWN_OPTION') {
      printAndExit(error.message, 1)
    }
  }
  if (args!['--help']) {
    printAndExit(
      `
      Description
        Compiles the application for production deployment

      Usage
        $ next build <dir>

      <dir> represents the directory of the Next.js application.
      If no directory is provided, the current directory will be used.
    `,
      0
    )
  }

  const dir = resolve(args!._[0] || '.')

  // Check if the provided directory exists
  if (!existsSync(dir)) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }

  build(dir)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('')
      console.error('> Build error occurred')
      printAndExit(err)
    })
}

export { nextBuild }
