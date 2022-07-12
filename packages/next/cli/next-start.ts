#!/usr/bin/env node

import chalk from 'chalk'
import arg from 'next/dist/compiled/arg/index.js'
import { startServer } from '../server/lib/start-server'
import { printAndExit } from '../server/lib/utils'
import { cliCommand } from '../bin/next'
import { getNetworkHost } from '../lib/get-network-host'
import * as Log from '../build/output/log'
import isError from '../lib/is-error'
import { getProjectDir } from '../lib/get-project-dir'

const nextStart: cliCommand = (argv) => {
  const validArgs: arg.Spec = {
    // Types
    '--help': Boolean,
    '--port': Number,
    '--hostname': String,
    '--keepAliveTimeout': Number,

    // Aliases
    '-h': '--help',
    '-p': '--port',
    '-H': '--hostname',
  }
  let args: arg.Result<arg.Spec>
  try {
    args = arg(validArgs, { argv })
  } catch (error) {
    if (isError(error) && error.code === 'ARG_UNKNOWN_OPTION') {
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
        --keepAliveTimeout  Max milliseconds to wait before closing inactive connections
        --help, -h      Displays this message
    `)
    process.exit(0)
  }

  const dir = getProjectDir(args._[0])
  let port: number =
    args['--port'] || (process.env.PORT && parseInt(process.env.PORT)) || 3000
  const host = args['--hostname'] || '0.0.0.0'
  const appUrl = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`

  if (process.env.__NEXT_FORCED_PORT) {
    port = parseInt(process.env.__NEXT_FORCED_PORT, 10) || 0
  }

  const keepAliveTimeoutArg: number | undefined = args['--keepAliveTimeout']
  if (
    typeof keepAliveTimeoutArg !== 'undefined' &&
    (Number.isNaN(keepAliveTimeoutArg) ||
      !Number.isFinite(keepAliveTimeoutArg) ||
      keepAliveTimeoutArg < 0)
  ) {
    printAndExit(
      `Invalid --keepAliveTimeout, expected a non negative number but received "${keepAliveTimeoutArg}"`,
      1
    )
  }

  const keepAliveTimeout = keepAliveTimeoutArg
    ? Math.ceil(keepAliveTimeoutArg)
    : undefined
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

  startServer({
    dir,
    hostname: host,
    port,
    keepAliveTimeout,
  })
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
