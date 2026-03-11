#!/usr/bin/env node

// Ensure NEXT_PRIVATE_START_TIME is set for accurate "Ready in" timing.
// This should already be set by bin/next.ts, but we set it here as a fallback
// in case the module is loaded through a different code path.
if (!process.env.NEXT_PRIVATE_START_TIME) {
  process.env.NEXT_PRIVATE_START_TIME = Date.now().toString()
}

import '../server/lib/cpu-profile'
import { saveCpuProfile } from '../server/lib/cpu-profile'
import { startServer } from '../server/lib/start-server'
import {
  getParsedDebugAddress,
  formatDebugAddress,
  printAndExit,
  type DebugAddress,
} from '../server/lib/utils'
import { getProjectDir } from '../lib/get-project-dir'
import {
  getReservedPortExplanation,
  isPortIsReserved,
} from '../lib/helpers/get-reserved-port'
import * as Log from '../build/output/log'

export type NextStartOptions = {
  port: number
  hostname?: string
  // Commander is not putting `--inspect` through the arg parser
  inspect?: DebugAddress | true
  keepAliveTimeout?: number
  experimentalNextConfigStripTypes?: boolean
  experimentalCpuProf?: boolean
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
  const inspect = options.inspect
  const port = options.port
  const keepAliveTimeout = options.keepAliveTimeout

  if (isPortIsReserved(port)) {
    printAndExit(getReservedPortExplanation(port), 1)
  }

  if (inspect) {
    const inspector = await import('inspector')
    const isInspecting = inspector.url() !== undefined
    if (isInspecting) {
      Log.warn(
        `The Node.js debugger port is already open at ${process.debugPort}. Ignoring '--inspect${inspect === true ? '' : `="${formatDebugAddress(inspect)}"`}'.`
      )
    } else {
      const inspectAddress: DebugAddress =
        inspect === true ? getParsedDebugAddress(true) : inspect
      // TODO: Implement --inspect-wait
      const wait = false
      try {
        inspector.open(inspectAddress.port, inspectAddress.host, wait)
      } catch (error) {
        console.error(
          `Failed to start the Node.js inspector with --inspect="${formatDebugAddress(inspectAddress)}":`,
          error
        )
        return process.exit(1)
      }
    }
  }

  if (options.experimentalCpuProf) {
    Log.info(`CPU profiling enabled. Profile will be saved on exit (Ctrl+C).`)
    // Save CPU profile on shutdown signals, but let start-server.ts handle graceful exit
    process.on('SIGTERM', () => saveCpuProfile())
    process.on('SIGINT', () => saveCpuProfile())
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
