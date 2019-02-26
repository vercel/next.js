#!/usr/bin/env node
import { join } from 'path'
import arg from 'arg'

['react', 'react-dom'].forEach((dependency) => {
  try {
    // When 'npm link' is used it checks the clone location. Not the project.
    require.resolve(dependency)
  } catch (err) {
    // tslint:disable-next-line
    console.warn(`The module '${dependency}' was not found. Next.js requires that you include it in 'dependencies' of your 'package.json'. To add it, run 'npm install --save ${dependency}'`)
  }
})

const defaultCommand = 'dev'
const commands: {[command: string]: () => Promise<any>} = {
  build: () => import('./next-build'),
  start: () => import('./next-start'),
  export: () => import('./next-export'),
  dev: () => import('./next-dev'),
}

const args = arg({
  // Types
  '--version': Boolean,
  '--help': Boolean,
  '--inspect': Boolean,

  // Aliases
  '-v': '--version',
  '-h': '--help',
}, {
  permissive: true,
})

// Version is inlined into the file using taskr build pipeline
if (args['--version']) {
  // tslint:disable-next-line
  console.log(`Next.js v${process.env.__NEXT_VERSION}`)
  process.exit(0)
}

// Check if we are running `next <subcommand>` or `next`
const foundCommand = Boolean(commands[args._[0]])

// Makes sure the `next <subcommand> --help` case is covered
// This help message is only showed for `next --help`
if (!foundCommand && args['--help']) {
  // tslint:disable-next-line
  console.log(`
    Usage
      $ next <command>

    Available commands
      ${Object.keys(commands).join(', ')}

    Options
      --version, -p   Version number
      --inspect       Enable the Node.js inspector
      --help, -h      Displays this message

    For more information run a command with the --help flag
      $ next build --help
  `)
  process.exit(0)
}

const command = foundCommand ? args._[0] : defaultCommand
const forwardedArgs = foundCommand ? args._.slice(1) : args._

// Make sure the `next <subcommand> --help` case is covered
if (args['--help']) {
  forwardedArgs.push('--help')
}

const defaultEnv = command === 'dev' ? 'development' : 'production'
process.env.NODE_ENV = process.env.NODE_ENV || defaultEnv

const bin = join(__dirname, 'next-' + command)

process.argv = [ process.argv[0], bin, ...forwardedArgs ]
commands[command]()

if (command === 'dev') {
  const {CONFIG_FILE} = require('next-server/constants')
  const {watchFile} = require('fs')
  watchFile(`${process.cwd()}/${CONFIG_FILE}`, (cur: any, prev: any) => {
    if (cur.size > 0 || prev.size > 0) {
      // tslint:disable-next-line
      console.log(`\n> Found a change in ${CONFIG_FILE}. Restart the server to see the changes in effect.`)
    }
  })
}
