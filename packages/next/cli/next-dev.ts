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
import { join } from 'path'
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

  const devNodeArgs = process.env.__NEXT_DEV_NODE_ARGS?.split(',') ?? []
  let serverPort: string | undefined
  let restartServer = () => {}

  const startDev = () => {
    let fatalError: string | undefined
    let restartOnClose = false
    let compiledSuccessfully = false

    const child = spawn(
      process.argv0,
      [
        ...devNodeArgs,
        require.resolve('../bin/next-dev'),
        !serverPort && allowRetry ? '1' : '0',
        dir,
        serverPort ?? String(port),
        host ?? '0.0.0.0',
      ],
      {
        env: {
          FORCE_COLOR: '1',
          ...process.env,
        },
      }
    )
    const startTime = Date.now()

    restartServer = () => {
      restartOnClose = true
      child.kill('SIGKILL')
    }

    child.stdout?.on('data', (chunk) => {
      process.stdout.write(chunk)

      if (!serverPort) {
        const matchedPort = /started server on .+:(.+), url: /.exec(
          chunk.toString()
        )
        if (matchedPort) {
          serverPort = matchedPort[1]
        }
      }

      if (!compiledSuccessfully) {
        compiledSuccessfully =
          /compiled client and server successfully in /.test(chunk.toString())
      }
    })

    child.stderr?.on('data', (chunk) => {
      process.stderr.write(chunk)
      if (fatalError) return
      const msg = chunk.toString()
      const matchedFatalError = /^FATAL ERROR: (.+)/m.exec(msg)
      if (matchedFatalError) {
        fatalError = matchedFatalError[1]
      }
    })

    child.on('close', (code) => {
      if (restartOnClose) {
        startDev()
        return
      }

      if (fatalError) {
        loadConfig(PHASE_DEVELOPMENT_SERVER, dir)
          .then((nextConfig) => {
            const distDir = join(dir, nextConfig.distDir)
            console.log({ distDir })
            // const telemetry = new Telemetry({ distDir })
            if (!fatalError) return
            return eventCrashReport({
              error: fatalError,
              childProcessDuration: Date.now() - startTime,
              compiledSuccessfully,
              dir,
              nextConfig,
            })
          })
          .then(console.log)
          .catch(() => {})
        Log.error(fatalError)
        Log.info('Restarting the server due to a fatal error')
        startDev()
      } else {
        process.exit(code ?? 1)
      }
    })
  }
  startDev()

  for (const CONFIG_FILE of CONFIG_FILES) {
    // eslint-disable-next-line no-loop-func
    watchFile(path.join(dir, CONFIG_FILE), (cur: any, prev: any) => {
      if (cur.size > 0 || prev.size > 0) {
        Log.info(`Found a change in ${CONFIG_FILE}. Restarting the server.`)
        restartServer()
      }
    })
  }
}

export { nextDev }
