#!/usr/bin/env node

import '../server/lib/cpu-profile'
import { startServer } from '../server/lib/start-server'
import { printAndExit } from '../server/lib/utils'
import { getProjectDir } from '../lib/get-project-dir'
import {
  getReservedPortExplanation,
  isPortIsReserved,
} from '../lib/helpers/get-reserved-port'

export type NextStartOptions = {
  port: number
  hostname?: string
  keepAliveTimeout?: number
}

/**
 * Start the Next.js server
 *
 * @param options The options for the start command
 * @param directory The directory to start the server in
 */
const nextStart = async (options: NextStartOptions, directory?: string) => {
  const dir = getProjectDir(directory)
  const hostname = options.hostname
  const port = options.port
  const keepAliveTimeout = options.keepAliveTimeout

  if (isPortIsReserved(port)) {
    printAndExit(getReservedPortExplanation(port), 1)
  }

  await startServer({
    dir,
    isDev: false,
    hostname,
    port,
    keepAliveTimeout,
  })
}

export { nextStart }
