#!/usr/bin/env node
import { resolve, join } from 'path'
import { existsSync } from 'fs'
import arg from 'arg'
import build from '../build'
import { printAndExit } from '../server/lib/utils'
import { cliCommand } from '../bin/next'

const nextBuild: cliCommand = (argv) => {
  const args = arg({
    // Types
    '--help': Boolean,
    // Aliases
    '-h': '--help',
  }, { argv })

  if (args['--help']) {
    printAndExit(`
      Description
        Compiles the application for production deployment

      Usage
        $ next build <dir>

      <dir> represents where the compiled dist folder should go.
      If no directory is provided, the dist folder will be created in the current directory.
      You can set a custom folder in config https://github.com/zeit/next.js#custom-configuration, otherwise it will be created inside '.next'
    `, 0)
  }

  const dir = resolve(args._[0] || '.')

  // Check if the provided directory exists
  if (!existsSync(dir)) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }

  // Check if the pages directory exists
  if (!existsSync(join(dir, 'pages'))) {
    // Check one level down the tree to see if the pages directory might be there
    if (existsSync(join(dir, '..', 'pages'))) {
      printAndExit('> No `pages` directory found. Did you mean to run `next` in the parent (`../`) directory?')
    }

    printAndExit('> Couldn\'t find a `pages` directory. Please create one under the project root')
  }

  build(dir)
    .catch((err) => {
      // tslint:disable-next-line
      console.error('> Build error occurred')
      printAndExit(err)
    })
}

export { nextBuild }
