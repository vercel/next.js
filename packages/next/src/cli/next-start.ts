#!/usr/bin/env node

import arg from 'next/dist/compiled/arg/index.js'
import { startServer } from '../server/lib/start-server'
import { getPort, printAndExit } from '../server/lib/utils'
import * as Log from '../build/output/log'
import isError from '../lib/is-error'
import { getProjectDir } from '../lib/get-project-dir'
import { CliCommand } from '../lib/commands'
import { isIPv6 } from 'net'

const nextStart: CliCommand = (argv) => {
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
  const host = args['--hostname'] || '0.0.0.0'
  const port = getPort(args)

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

  startServer({
    dir,
    hostname: host,
    port,
    keepAliveTimeout,
  })
    .then(async (app) => {
      const appUrl = `http://${app.hostname}:${app.port}`
      const hostname = isIPv6(host) ? `[${host}]` : host
      Log.ready(`started server on ${hostname}:${app.port}, url: ${appUrl}`)
      await app.prepare()
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}

export { nextStart }
