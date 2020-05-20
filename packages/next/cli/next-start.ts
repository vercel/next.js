#!/usr/bin/env node

import { resolve } from 'path'
import arg from 'next/dist/compiled/arg/index.js'
import startServer from '../server/lib/start-server'
import { cliCommand } from '../bin/next'
import * as Log from '../build/output/log'

const nextStart: cliCommand = (argv) => {
  const args = arg(
    {
      // Types
      '--help': Boolean,
      '--port': Number,
      '--hostname': String,
      '--socket': String,

      // Aliases
      '-h': '--help',
      '-p': '--port',
      '-H': '--hostname',
      '-S': '--socket',
    },
    { argv }
  )

  if (args['--help']) {
    // tslint:disable-next-line
    console.log(`
      Description
        Starts the application in production mode.
        The application should be compiled with \`next build\` first.

      Usage
        $ next start <dir> -p <port>

      <dir> represents the directory of the Next.js application.
      If no directory is provided, the current directory will be used.

      Options
        --port, -p      A port number on which to start the application
        --hostname, -H  Hostname on which to start the application
        --socket, -S    Unix Socket to bind the application to. port and hostname will be ignored if socket is provided
        --help, -h      Displays this message
    `)
    process.exit(0)
  }

  const dir = resolve(args._[0] || '.')
  const port = args['--port'] || 3000
  startServer({ dir }, port, args['--hostname'])
    .then(async (app) => {
      // tslint:disable-next-line
      Log.ready(
        `started server on http://${args['--hostname'] || 'localhost'}:${port}`
      )
      await app.prepare()
    })
    .catch((err) => {
      // tslint:disable-next-line
      console.error(err)
      process.exit(1)
    })
}

export { nextStart }
