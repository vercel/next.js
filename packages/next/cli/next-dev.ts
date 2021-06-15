#!/usr/bin/env node
import { resolve } from 'path'
import arg from 'next/dist/compiled/arg/index.js'
import { existsSync } from 'fs'
import startServer from '../server/lib/start-server'
import { printAndExit } from '../server/lib/utils'
import * as Log from '../build/output/log'
import { startedDevelopmentServer } from '../build/output'
import { cliCommand } from '../bin/next'
import detectPort from 'detect-port'
import prompts, { PromptObject } from 'prompts'
import clearConsole from '../server/lib/clearConsole'

const nextDev: cliCommand = async (argv) => {
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
        --hostname, -H  Hostname on which to start the application (default: 0.0.0.0)
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

  async function choosePort(defaultPort: number): Promise<number> {
    const availablePort: number = await detectPort(defaultPort)

    if (defaultPort === availablePort) return defaultPort

    // Default port is not free,
    // prompt user to allow another port

    const isTerminalInteractive = process.stdout.isTTY

    // Simply log instructions if terminal is not interactive
    if (!isTerminalInteractive) {
      let message = `Something is already running on port ${defaultPort}.`
      const packageJsonPath = require('next/dist/compiled/find-up').sync(
        'package.json',
        { cwd: dir }
      )
      const { scripts } = require(packageJsonPath)
      if (scripts) {
        const scriptsArray = Object.entries(scripts)
        const nextScript = scriptsArray.find(([_, cmd]) => cmd === 'next')
        if (nextScript) {
          message += `\`npm run ${nextScript[0]} -- -p <some other port>\``
        }
      }
      console.error(message)
    }

    // Terimal is interactive
    // prompt to run on another port

    const isRoot = process.getuid && process.getuid() === 0
    const isAdminRequired =
      process.platform !== 'win32' && defaultPort < 1024 && !isRoot

    const message = isAdminRequired
      ? `Admin permissions are required to run a server on a port below 1024.`
      : `Something is already running on port ${defaultPort}.`

    const question: PromptObject = {
      type: 'confirm',
      name: 'shouldChangePort',
      message: `${message}\n\nWould you like to run the app on another port instead?`,
      initial: true,
    }

    clearConsole()
    const answer = await prompts(question)

    if (answer.shouldChangePort) {
      clearConsole()
      return availablePort
    }
    process.exit()
  }

  const defaultPort =
    args['--port'] || (process.env.PORT && parseInt(process.env.PORT)) || 3000
  const port = await choosePort(defaultPort)
  const host = args['--hostname'] || '0.0.0.0'
  const appUrl = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`

  startServer({ dir, dev: true, isNextDevCommand: true }, port, host)
    .then(async (app) => {
      startedDevelopmentServer(appUrl, `${host}:${port}`)
      // Start preflight after server is listening and ignore errors:
      preflight().catch(() => {})
      // Finalize server bootup:
      await app.prepare()
    })
    .catch(() => process.nextTick(() => process.exit(1)))
}

export { nextDev }
