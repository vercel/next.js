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

const nextStart = async (options: NextStartOptions, directory?: string) => {
  const dir = getProjectDir(directory)
  const host = options.hostname
  const port = options.port
  let keepAliveTimeout = options.keepAliveTimeout

  if (isPortIsReserved(port)) {
    printAndExit(getReservedPortExplanation(port), 1)
  }

  await startServer({
    dir,
    isDev: false,
    hostname: host,
    port,
    keepAliveTimeout,
  })
}

export { nextStart }
