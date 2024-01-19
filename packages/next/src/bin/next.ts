#!/usr/bin/env node

import '../server/require-hook'
import * as log from '../build/output/log'
import arg from 'next/dist/compiled/arg/index.js'
import semver from 'next/dist/compiled/semver'
import { NON_STANDARD_NODE_ENV } from '../lib/constants'
import { commands } from '../lib/commands'
import { commandArgs } from '../lib/command-args'
import { getValidatedArgs } from '../lib/get-validated-args'

const args = arg(
  {
    // Types
    '--version': Boolean,
    '--help': Boolean,
    '--inspect': Boolean,

    // Aliases
    '-v': '--version',
    '-h': '--help',
  },
  {
    permissive: true,
  }
)

// Version is inlined into the file using taskr build pipeline
if (args['--version']) {
  console.log(`Next.js v${process.env.__NEXT_VERSION}`)
  process.exit(0)
}

// Check if we are running `next <subcommand>` or `next`
const foundCommand = Boolean(commands[args._[0]])

// Makes sure the `next --help` case is covered
// This help message is only showed for `next --help`
// `next <subcommand> --help` falls through to be handled later
if (!foundCommand && args['--help']) {
  console.log(`
    Usage
      $ next <command>

    Available commands
      ${Object.keys(commands).join(', ')}

    Options
      --version, -v   Version number
      --help, -h      Displays this message

    For more information run a command with the --help flag
      $ next build --help
  `)
  process.exit(0)
}

// Check supported Node.js version first
if (
  semver.lt(process.versions.node, process.env.__NEXT_REQUIRED_NODE_VERSION!)
) {
  console.error(
    `You are using Node.js ${process.versions.node}. For Next.js, Node.js version >= v${process.env.__NEXT_REQUIRED_NODE_VERSION} is required.`
  )
  process.exit(1)
}

// Start performance profiling after Node.js version is checked
performance.mark('next-start')

const defaultCommand = 'dev'
const command = foundCommand ? args._[0] : defaultCommand

if (['experimental-compile', 'experimental-generate'].includes(command)) {
  args._.push('--build-mode', command)
}

const forwardedArgs = foundCommand ? args._.slice(1) : args._

if (args['--inspect'])
  throw new Error(
    `--inspect flag is deprecated. Use env variable NODE_OPTIONS instead: NODE_OPTIONS='--inspect' next ${command}`
  )

// Make sure the `next <subcommand> --help` case is covered
if (args['--help']) {
  forwardedArgs.push('--help')
}

const defaultEnv = command === 'dev' ? 'development' : 'production'

const standardEnv = ['production', 'development', 'test']

if (process.env.NODE_ENV) {
  const isNotStandard = !standardEnv.includes(process.env.NODE_ENV)
  const shouldWarnCommands =
    process.env.NODE_ENV === 'development'
      ? ['start', 'build']
      : process.env.NODE_ENV === 'production'
      ? ['dev']
      : []

  if (isNotStandard || shouldWarnCommands.includes(command)) {
    log.warn(NON_STANDARD_NODE_ENV)
  }
}

;(process.env as any).NODE_ENV = process.env.NODE_ENV || defaultEnv
;(process.env as any).NEXT_RUNTIME = 'nodejs'

if (command === 'build') {
  process.on('SIGTERM', () => process.exit(0))
  process.on('SIGINT', () => process.exit(0))
}

async function main() {
  const currentArgsSpec = commandArgs[command]()
  const validatedArgs = getValidatedArgs(currentArgsSpec, forwardedArgs)

  for (const dependency of ['react', 'react-dom']) {
    try {
      // When 'npm link' is used it checks the clone location. Not the project.
      require.resolve(dependency)
    } catch (err) {
      console.warn(
        `The module '${dependency}' was not found. Next.js requires that you include it in 'dependencies' of your 'package.json'. To add it, run 'npm install ${dependency}'`
      )
    }
  }

  await commands[command]()
    .then((exec) => exec(validatedArgs))
    .then(() => {
      if (command === 'build' || command === 'experimental-compile') {
        // ensure process exits after build completes so open handles/connections
        // don't cause process to hang
        process.exit(0)
      }
    })
}

main()
