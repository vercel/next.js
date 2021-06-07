#!/usr/bin/env node
import { existsSync } from 'fs'
import arg from 'next/dist/compiled/arg/index.js'
import { resolve, join } from 'path'
import { cliCommand } from '../bin/next'
import { runLintCheck } from '../lib/eslint/runLintCheck'
import { printAndExit } from '../server/lib/utils'

const nextLint: cliCommand = (argv) => {
  const validArgs: arg.Spec = {
    // Types
    '--help': Boolean,
    '--dir': [String],

    // Aliases
    '-h': '--help',
    '-d': '--dir',
  }

  let args: arg.Result<arg.Spec>
  try {
    args = arg(validArgs, { argv })
  } catch (error) {
    if (error.code === 'ARG_UNKNOWN_OPTION') {
      return printAndExit(error.message, 1)
    }
    throw error
  }
  if (args['--help']) {
    printAndExit(
      `
      Description
        Run ESLint on every file in specified directories. 
        If not configured, ESLint will be set up for the first time.

      Usage
        $ next lint <baseDir> [options]

      <baseDir> represents the directory of the Next.js application.
      If no directory is provided, the current directory will be used.

      Options
      -h - list this help
      -d - set directory, or directories, to run ESLint (defaults to only 'pages')
    `,
      0
    )
  }

  const baseDir = resolve(args._[0] || '.')

  // Check if the provided directory exists
  if (!existsSync(baseDir)) {
    printAndExit(`> No such directory exists as the project root: ${baseDir}`)
  }

  const dirs: string[] = args['--dir']
  const lintDirs = dirs
    ? dirs.reduce((res: string[], d: string) => {
        const currDir = join(baseDir, d)
        if (!existsSync(currDir)) return res
        res.push(currDir)
        return res
      }, [])
    : null

  runLintCheck(baseDir, lintDirs)
    .then((results) => {
      if (results) console.log(results)
    })
    .catch((err) => {
      printAndExit(err.message)
    })
}

export { nextLint }
