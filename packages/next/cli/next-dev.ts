#!/usr/bin/env node
import { resolve } from 'path'
import arg from 'next/dist/compiled/arg/index.js'
import { existsSync } from 'fs'
import startServer from '../server/lib/start-server'
import { printAndExit } from '../server/lib/utils'
import * as Log from '../build/output/log'
import { startedDevelopmentServer } from '../build/output'
import { cliCommand } from '../bin/next'

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
    if (error.code === 'ARG_UNKNOWN_OPTION') {
      return printAndExit(error.message, 1)
    }
    throw error
  }
  if (args['--help']) {
    console.log(`
      Description
        Starts the application in development mode (hot-code reloading, error
        reporting, etc)

      Usage
        $ next dev <dir> -p <port number>

      <dir> represents the directory of the Next.js application.
      If no directory is provided, the current directory will be used.

      Options
        --port, -p      A port number on which to start the application
        --hostname, -H  Hostname on which to start the application
        --help, -h      Displays this message
    `)
    process.exit(0)
  }

  const dir = resolve(args._[0] || '.')

  // Check if pages dir exists and warn if not
  if (!existsSync(dir)) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }

  async function preflight() {
    const { getPackageVersion } = await import('../lib/get-package-version')
    const semver = await import('next/dist/compiled/semver').then(
      (res) => res.default
    )

    const reactVersion: string | null = await getPackageVersion({
      cwd: dir,
      name: 'react',
    })
    if (
      reactVersion &&
      semver.lt(reactVersion, '16.10.0') &&
      semver.coerce(reactVersion)?.version !== '0.0.0'
    ) {
      Log.warn(
        'Fast Refresh is disabled in your application due to an outdated `react` version. Please upgrade 16.10 or newer!' +
          ' Read more: https://err.sh/next.js/react-version'
      )
    } else {
      const reactDomVersion: string | null = await getPackageVersion({
        cwd: dir,
        name: 'react-dom',
      })
      if (
        reactDomVersion &&
        semver.lt(reactDomVersion, '16.10.0') &&
        semver.coerce(reactDomVersion)?.version !== '0.0.0'
      ) {
        Log.warn(
          'Fast Refresh is disabled in your application due to an outdated `react-dom` version. Please upgrade 16.10 or newer!' +
            ' Read more: https://err.sh/next.js/react-version'
        )
      }
    }

    const [sassVersion, nodeSassVersion] = await Promise.all([
      getPackageVersion({ cwd: dir, name: 'sass' }),
      getPackageVersion({ cwd: dir, name: 'node-sass' }),
    ])
    if (sassVersion && nodeSassVersion) {
      Log.warn(
        'Your project has both `sass` and `node-sass` installed as dependencies, but should only use one or the other. ' +
          'Please remove the `node-sass` dependency from your project. ' +
          ' Read more: https://err.sh/next.js/duplicate-sass'
      )
    }
  }

  const port = args['--port'] || 3000
  const appUrl = `http://${args['--hostname'] || 'localhost'}:${port}`

  startServer(
    { dir, dev: true, isNextDevCommand: true },
    port,
    args['--hostname']
  )
    .then(async (app) => {
      startedDevelopmentServer(appUrl)
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
}

export { nextDev }
