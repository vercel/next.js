#!/usr/bin/env node
import { join } from 'path'
import spawn from 'cross-spawn'
import arg from 'arg'

['react', 'react-dom'].forEach(dependency => {
  try {
    // When 'npm link' is used it checks the clone location. Not the project.
    require.resolve(dependency)
  } catch (err) {
    console.warn(`The module '${dependency}' was not found. Next.js requires that you include it in 'dependencies' of your 'package.json'. To add it, run 'npm install --save ${dependency}'`)
  }
})

const defaultCommand = 'dev'
const commands = [
  'build',
  'start',
  'export',
  defaultCommand
]

const args = arg({
  // Types
  '--version': Boolean,
  '--help': Boolean,
  '--node-args': String,
  '--inspect': Boolean,

  // Aliases
  '-v': '--version',
  '-h': '--help'
}, {
  permissive: true
})

// Version is inlined into the file using taskr build pipeline
if (args['--version']) {
  console.log(`Next.js v${process.env.NEXT_VERSION}`)
  process.exit(0)
}

// Check if we are running `next <subcommand>` or `next`
const foundCommand = args._.find(cmd => commands.includes(cmd))

// Makes sure the `next <subcommand> --help` case is covered
// This help message is only showed for `next --help`
if (!foundCommand && args['--help']) {
  console.log(`
    Usage
      $ next <command>

    Available commands
      ${commands.join(', ')}
      
    Options
      --version, -p   Version number
      --node-args     Node arguments applied to the process
      --help, -h      Displays this message  

    For more information run a command with the --help flag
      $ next build --help
  `)
  process.exit(0)
}

// Add support for `--node-args` to send Node.js arguments to the spawned process
const nodeArguments = args['--node-args'] && args['--node-args'] !== '' ? args['--node-args'].split(' ') : []
if (args['--inspect']) {
  console.log('The `--inspect` option is deprecated in favor of `--node-args`')
  nodeArguments.push('--inspect')
}

if (nodeArguments.length > 0) {
  console.log(`Passing arguments to Node.js: "${nodeArguments.join(' ')}"`)
}

const command = foundCommand || defaultCommand
const forwardedArgs = args._.filter(arg => arg !== command)

// Make sure the `next <subcommand> --help` case is covered
if (args['--help']) {
  forwardedArgs.push('--help')
}

const defaultEnv = command === 'dev' ? 'development' : 'production'
process.env.NODE_ENV = process.env.NODE_ENV || defaultEnv

const bin = join(__dirname, 'next-' + command)

const startProcess = () => {
  const proc = spawn('node', [...nodeArguments, bin, ...forwardedArgs], { stdio: 'inherit' })
  proc.on('close', (code, signal) => {
    if (code !== null) {
      process.exit(code)
    }
    if (signal) {
      if (signal === 'SIGKILL') {
        process.exit(137)
      }
      console.log(`got signal ${signal}, exiting`)
      process.exit(signal === 'SIGINT' ? 0 : 1)
    }
    process.exit(0)
  })
  proc.on('error', (err) => {
    console.error(err)
    process.exit(1)
  })
  return proc
}

let proc = startProcess()

function wrapper () {
  if (proc) {
    proc.kill()
  }
}

process.on('SIGINT', wrapper)
process.on('SIGTERM', wrapper)
process.on('exit', wrapper)

if (command === 'dev') {
  const {CONFIG_FILE} = require('next-server/constants')
  const {watchFile} = require('fs')
  watchFile(`${process.cwd()}/${CONFIG_FILE}`, (cur: any, prev: any) => {
    if (cur.size > 0 || prev.size > 0) {
      console.log(`\n> Found a change in ${CONFIG_FILE}, restarting the server...`)
      // Don't listen to 'close' now since otherwise parent gets killed by listener
      proc.removeAllListeners('close')
      proc.kill()
      proc = startProcess()
    }
  })
}
