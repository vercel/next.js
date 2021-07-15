#!/usr/bin/env node

import { resolve } from 'path'
import chalk from 'chalk'
import arg from 'next/dist/compiled/arg/index.js'
import startServer from '../server/lib/start-server'
import { printAndExit } from '../server/lib/utils'
import { cliCommand } from '../bin/next'
import { getNetworkHost } from '../lib/get-network-host'
import * as Log from '../build/output/log'
const nextStart: cliCommand = (argv) => {
  const validArgs: arg.Spec = {
    // Types
    '--help': Boolean,
    '--port': Number,
    '--hostname': String,

    // Aliases
    '-h': '--help',
    '-p': '--port',
    '-H': '--hostname',
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
        --hostname, -H  Hostname on which to start the application (default: 0.0.0.0)
        --help, -h      Displays this message
    `)
    process.exit(0)
  }

  const dir = resolve(args._[0] || '.')
  const port =
    args['--port'] || (process.env.PORT && parseInt(process.env.PORT)) || 3000
  const host = args['--hostname'] || '0.0.0.0'
  const appUrl = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`

  function logNetworkUrls() {
    const space = ' '.repeat(8)
    let message = `started server on - \n`
    message +=
      space + `local - url: ${chalk.green(appUrl)}, on - ${host}:${port} \n`

    const networkHost = getNetworkHost()
    if (networkHost) {
      message +=
        space + `network - url: ${chalk.green(`http://${networkHost}:${port}`)}`
    }

    Log.ready(message)
  }

  startServer({ dir }, port, host)
    .then(async (app) => {
      logNetworkUrls()
      await app.prepare()
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}

export { nextStart }
