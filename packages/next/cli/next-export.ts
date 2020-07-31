#!/usr/bin/env node
import { resolve, join } from 'path'
import { existsSync } from 'fs'
import arg from 'next/dist/compiled/arg/index.js'
import exportApp from '../export'
import { printAndExit } from '../server/lib/utils'
import { cliCommand } from '../bin/next'

const nextExport: cliCommand = (argv) => {
  const validArgs: arg.Spec = {
    // Types
    '--help': Boolean,
    '--silent': Boolean,
    '--outdir': String,
    '--threads': Number,

    // Aliases
    '-h': '--help',
    '-s': '--silent',
    '-o': '--outdir',
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
    // tslint:disable-next-line
    console.log(`
      Description
        Exports the application for production deployment

      Usage
        $ next export [options] <dir>

      <dir> represents the directory of the Next.js application.
      If no directory is provided, the current directory will be used.

      Options
        -h - list this help
        -o - set the output dir (defaults to 'out')
        -s - do not print any messages to console
    `)
    process.exit(0)
  }

  const dir = resolve(args._[0] || '.')

  // Check if pages dir exists and warn if not
  if (!existsSync(dir)) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }

  const options = {
    silent: args['--silent'] || false,
    threads: args['--threads'],
    outdir: args['--outdir'] ? resolve(args['--outdir']) : join(dir, 'out'),
  }

  exportApp(dir, options)
    .then(() => {
      printAndExit('Export successful', 0)
    })
    .catch((err) => {
      printAndExit(err)
    })
}

export { nextExport }
