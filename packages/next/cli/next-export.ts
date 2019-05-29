#!/usr/bin/env node
import { resolve, join } from 'path'
import { existsSync } from 'fs'
import arg from 'next/dist/compiled/arg/index.js'
import exportApp from '../export'
import { printAndExit } from '../server/lib/utils'
import { cliCommand } from '../bin/next'

const nextExport: cliCommand = argv => {
  const args = arg(
    {
      // Types
      '--help': Boolean,
      '--silent': Boolean,
      '--outdir': String,
      '--threads': Number,
      '--concurrency': Number,

      // Aliases
      '-h': '--help',
      '-s': '--silent',
      '-o': '--outdir',
    },
    { argv }
  )

  if (args['--help']) {
    // tslint:disable-next-line
    console.log(`
      Description
        Exports the application for production deployment

      Usage
        $ next export [options] <dir>

      <dir> represents where the compiled dist folder should go.
      If no directory is provided, the 'out' folder will be created in the current directory.

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

  if (!existsSync(join(dir, 'pages'))) {
    if (existsSync(join(dir, '..', 'pages'))) {
      printAndExit(
        '> No `pages` directory found. Did you mean to run `next` in the parent (`../`) directory?'
      )
    }

    printAndExit(
      "> Couldn't find a `pages` directory. Please create one under the project root"
    )
  }

  const options = {
    silent: args['--silent'] || false,
    threads: args['--threads'],
    concurrency: args['--concurrency'],
    outdir: args['--outdir'] ? resolve(args['--outdir']) : join(dir, 'out'),
  }

  exportApp(dir, options)
    .then(() => {
      printAndExit('Export successful', 0)
    })
    .catch(err => {
      printAndExit(err)
    })
}

export { nextExport }
