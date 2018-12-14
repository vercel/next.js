#!/usr/bin/env node

import { resolve } from 'path'
import arg from 'arg'
import startServer from '../server/lib/start-server'

const args = arg({
  // Types
  '--help': Boolean,
  '--port': Number,
  '--hostname': String,

  // Aliases
  '-h': '--help',
  '-p': '--port',
  '-H': '--hostname'
})

// Defaults
const {
  '--help': help = false,
  '--port': port = 3000,
  '--hostname': hostname = ''
} = args

if (help) {
  console.log(`
    Description
      Starts the application in production mode.
      The application should be compiled with \`next build\` first.

    Usage
      $ next start <dir> -p <port>

    <dir> is the directory that contains the compiled dist folder
    created by running \`next build\`.
    If no directory is provided, the current directory will be assumed.
    You can set a custom dist folder in config https://github.com/zeit/next.js#custom-configuration

    Options
      --port, -p      A port number on which to start the application
      --hostname, -H  Hostname on which to start the application
      --help, -h      Displays this message
  `)
  process.exit(0)
}

const dir = resolve(args._[0] || '.')

startServer({dir}, port, hostname)
  .then(() => {
    console.log(`> Ready on http://${hostname}:${port}`)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
