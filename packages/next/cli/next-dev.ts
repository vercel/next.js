#!/usr/bin/env node
import arg from 'next/dist/compiled/arg/index.js'
import { existsSync, watchFile } from 'fs'
import spawn from 'next/dist/compiled/cross-spawn'
import { printAndExit } from '../server/lib/utils'
import * as Log from '../build/output/log'
import { cliCommand } from '../bin/next'
import isError from '../lib/is-error'
import { getProjectDir } from '../lib/get-project-dir'
import { CONFIG_FILES } from '../shared/lib/constants'
import path from 'path'
import { eventCrashReport } from '../telemetry/events'
import loadConfig from '../server/config'
import { PHASE_DEVELOPMENT_SERVER } from '../shared/lib/constants'
// import { join } from 'path'
// import { Telemetry } from '../telemetry/storage'

const nextDev: cliCommand = (argv) => {
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
    if (isError(error) && error.code === 'ARG_UNKNOWN_OPTION') {
      return printAndExit(error.message, 1)
    }
    throw error
  }
  if (args['--help']) {
    console.log(`
      Description
        Starts the application in development mode (hot-code reloading, error
        reporting, etc.)

      Usage
        $ next dev <dir> -p <port number>

      <dir> represents the directory of the Next.js application.
      If no directory is provided, the current directory will be used.

      Options
        --port, -p      A port number on which to start the application
        --hostname, -H  Hostname on which to start the application (default: 0.0.0.0)
        --help, -h      Displays this message
    `)
    process.exit(0)
  }

  const dir = getProjectDir(args._[0])

  // Check if pages dir exists and warn if not
  if (!existsSync(dir)) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }

  const allowRetry = !args['--port']
  let port: number =
    args['--port'] || (process.env.PORT && parseInt(process.env.PORT)) || 3000

  // we allow the server to use a random port while testing
  // instead of attempting to find a random port and then hope
  // it doesn't become occupied before we leverage it
  if (process.env.__NEXT_RAND_PORT) {
    port = 0
  }

  // We do not set a default host value here to prevent breaking
  // some set-ups that rely on listening on other interfaces
  const host = args['--hostname']

  loadConfig(PHASE_DEVELOPMENT_SERVER, dir)
    .then((_nextConfig) => {
      // const distDir = join(dir, nextConfig.distDir)
      // const telemetry = new Telemetry({ distDir })

      let fatalError: string | null
      const startDev = () => {
        fatalError = null

        const child = spawn(
          process.argv0,
          [
            // '--max_old_space_size=50',
            require.resolve('../bin/next-dev'),
            allowRetry ? '1' : '0',
            dir,
            String(port),
            host ?? '0.0.0.0',
          ],
          {
            env: {
              FORCE_COLOR: '1',
              ...process.env,
            },
          }
        )

        child.stdout?.pipe(process.stdout)
        child.stderr?.on('data', (data) => {
          const err = data.toString()
          console.error(err)
          const matchedFatalError = /^FATAL ERROR: (.*)/m.exec(err)
          if (matchedFatalError) {
            fatalError = matchedFatalError[1]
          }
        })
        child.on('close', (code) => {
          if (fatalError) {
            console.log(eventCrashReport(fatalError))
            Log.info('restarting server due to fatal error')
            startDev()
          } else {
            process.exit(code ?? 1)
          }
        })
      }
      startDev()
    })
    .catch(() => {
      // loadConfig logs errors
    })

  for (const CONFIG_FILE of CONFIG_FILES) {
    watchFile(path.join(dir, CONFIG_FILE), (cur: any, prev: any) => {
      if (cur.size > 0 || prev.size > 0) {
        console.log(
          `\n> Found a change in ${CONFIG_FILE}. Restart the server to see the changes in effect.`
        )
      }
    })
  }
}

export { nextDev }
