#!/usr/bin/env node
import arg from 'next/dist/compiled/arg/index.js'
import { existsSync, watchFile } from 'fs'
import { startServer } from '../server/lib/start-server'
import { printAndExit } from '../server/lib/utils'
import * as Log from '../build/output/log'
import { startedDevelopmentServer } from '../build/output'
import { cliCommand } from '../bin/next'
import isError from '../lib/is-error'
import { getProjectDir } from '../lib/get-project-dir'
import { CONFIG_FILES } from '../shared/lib/constants'
import path from 'path'

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

  async function preflight() {
    const { getPackageVersion } = await Promise.resolve(
      require('../lib/get-package-version')
    )
    const [sassVersion, nodeSassVersion] = await Promise.all([
      getPackageVersion({ cwd: dir, name: 'sass' }),
      getPackageVersion({ cwd: dir, name: 'node-sass' }),
    ])
    if (sassVersion && nodeSassVersion) {
      Log.warn(
        'Your project has both `sass` and `node-sass` installed as dependencies, but should only use one or the other. ' +
          'Please remove the `node-sass` dependency from your project. ' +
          ' Read more: https://nextjs.org/docs/messages/duplicate-sass'
      )
    }
  }
  const allowRetry = !args['--port']
  let port: number =
    args['--port'] || (process.env.PORT && parseInt(process.env.PORT)) || 3000

  // we allow the server to use a random port while testing
  // instead of attempting to find a random port and then hope
  // it doesn't become occupied before we leverage it
  if (process.env.__NEXT_FORCED_PORT) {
    port = parseInt(process.env.__NEXT_FORCED_PORT, 10) || 0
  }

  // We do not set a default host value here to prevent breaking
  // some set-ups that rely on listening on other interfaces
  const host = args['--hostname']

  startServer({
    allowRetry,
    dev: true,
    dir,
    hostname: host,
    isNextDevCommand: true,
    port,
  })
    .then(async (app) => {
      const appUrl = `http://${app.hostname}:${app.port}`
      startedDevelopmentServer(appUrl, `${host || '0.0.0.0'}:${app.port}`)
      // Start preflight after server is listening and ignore errors:
      preflight().catch(() => {})
      // Finalize server bootup:
      await app.prepare()
    })
    .catch((err) => {
      if (err.code === 'EADDRINUSE') {
        let errorMessage = `Port ${port} is already in use.`
        const pkgAppPath = require('next/dist/compiled/find-up').sync(
          'package.json',
          {
            cwd: dir,
          }
        )
        const appPackage = require(pkgAppPath)
        if (appPackage.scripts) {
          const nextScript = Object.entries(appPackage.scripts).find(
            (scriptLine) => scriptLine[1] === 'next'
          )
          if (nextScript) {
            errorMessage += `\nUse \`npm run ${nextScript[0]} -- -p <some other port>\`.`
          }
        }
        console.error(errorMessage)
      } else {
        console.error(err)
      }
      process.nextTick(() => process.exit(1))
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
