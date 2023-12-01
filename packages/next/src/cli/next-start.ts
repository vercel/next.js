#!/usr/bin/env node
import '../server/lib/cpu-profile'
import { startServer } from '../server/lib/start-server'
import { getPort, printAndExit } from '../server/lib/utils'
import { getProjectDir } from '../lib/get-project-dir'
import type { CliCommand } from '../lib/commands'
import {
  getReservedPortExplanation,
  isPortIsReserved,
} from '../lib/helpers/get-reserved-port'

const nextStart: CliCommand = async (args) => {
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
        --port, -p          A port number on which to start the application
        --hostname, -H      Hostname on which to start the application (default: 0.0.0.0)
        --keepAliveTimeout  Max milliseconds to wait before closing inactive connections
        --help, -h          Displays this message
    `)
    process.exit(0)
  }

  const dir = getProjectDir(args._[0])
  const host = args['--hostname']
  const port = getPort(args)

  if (isPortIsReserved(port)) {
    printAndExit(getReservedPortExplanation(port), 1)
  }

  const isExperimentalTestProxy = args['--experimental-test-proxy']

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

  await startServer({
    dir,
    isDev: false,
    isExperimentalTestProxy,
    hostname: host,
    port,
    keepAliveTimeout,
  })
}

export { nextStart }
