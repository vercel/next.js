#!/usr/bin/env node
import arg from 'next/dist/compiled/arg/index.js'
import { existsSync, watchFile } from 'fs'
import { startServer } from '../server/lib/start-server'
import { getPort, printAndExit } from '../server/lib/utils'
import * as Log from '../build/output/log'
import { startedDevelopmentServer } from '../build/output'
import { cliCommand } from '../lib/commands'
import isError from '../lib/is-error'
import { getProjectDir } from '../lib/get-project-dir'
import { CONFIG_FILES } from '../shared/lib/constants'
import path from 'path'
import { loadBindings } from '../build/swc'
import { NextConfig } from '../types'
import { getPkgManager } from '../lib/helpers/get-pkg-manager'

const nextDev: cliCommand = (argv) => {
  const validArgs: arg.Spec = {
    // Types
    '--help': Boolean,
    '--port': Number,
    '--hostname': String,
    '--turbo': Boolean,

    // To align current messages with native binary.
    // Will need to adjust subcommand later.
    '--show-all': Boolean,
    '--root': String,

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

  const port = getPort(args)
  // If neither --port nor PORT were specified, it's okay to retry new ports.
  const allowRetry =
    args['--port'] === undefined && process.env.PORT === undefined

  // We do not set a default host value here to prevent breaking
  // some set-ups that rely on listening on other interfaces
  const host = args['--hostname']

  const devServerOptions = {
    allowRetry,
    dev: true,
    dir,
    hostname: host,
    isNextDevCommand: true,
    port,
  }

  if (args['--turbo']) {
    // check for postcss, babelrc, swc plugins
    return new Promise(async (resolve) => {
      const chalk =
        require('next/dist/compiled/chalk') as typeof import('next/dist/compiled/chalk')

      // To regenerate the TURBOPACK gradient require('gradient-string')('blue', 'red')('>>> TURBOPACK')
      console.log(
        `${chalk.bold(
          '\x1B[38;2;0;0;255m>\x1B[39m\x1B[38;2;23;0;232m>\x1B[39m\x1B[38;2;46;0;209m>\x1B[39m \x1B[38;2;70;0;185mT\x1B[39m\x1B[38;2;93;0;162mU\x1B[39m\x1B[38;2;116;0;139mR\x1B[39m\x1B[38;2;139;0;116mB\x1B[39m\x1B[38;2;162;0;93mO\x1B[39m\x1B[38;2;185;0;70mP\x1B[39m\x1B[38;2;209;0;46mA\x1B[39m\x1B[38;2;232;0;23mC\x1B[39m\x1B[38;2;255;0;0mK\x1B[39m'
        )} ${chalk.dim('(alpha)')}\n\n` +
          `Thank you for trying Next.js 13 with Turbopack! As a reminder,\nTurbopack is currently in alpha and not yet ready for production\nuse. We appreciate your ongoing support as we work to make it ready\nfor everyone.\n\n`
      )

      const { getBabelConfigFile } =
        require('../build/webpack-config') as typeof import('../build/webpack-config')
      const { defaultConfig } =
        require('../server/config-shared') as typeof import('../server/config-shared')
      const { default: loadConfig } =
        require('../server/config') as typeof import('../server/config')
      const { PHASE_DEVELOPMENT_SERVER } =
        require('../shared/lib/constants') as typeof import('../shared/lib/constants')

      let unsupportedParts = ''
      const babelrc = '.babelrc' || (await getBabelConfigFile(dir))
      const rawNextConfig = (await loadConfig(
        PHASE_DEVELOPMENT_SERVER,
        dir,
        undefined,
        true
      )) as NextConfig

      const hasNonDefaultConfig = Object.keys(rawNextConfig).some(
        (configKey) => {
          if (!(configKey in defaultConfig)) return false
          if (typeof defaultConfig[configKey] !== 'object') {
            return defaultConfig[configKey] !== rawNextConfig[configKey]
          }
          return (
            JSON.stringify(rawNextConfig[configKey]) !==
            JSON.stringify(defaultConfig[configKey])
          )
        }
      )
      const feedbackMessage = `Please direct any feedback to: ${chalk.underline(
        'https://nextjs.link/turbopack-feedback'
      )}\n`
      if (babelrc) {
        unsupportedParts += `\n- Babel detected (${chalk.cyan(
          babelrc
        )})\n  ${chalk.dim(
          `Babel is not yet supported. To use Turbopack at the moment,\n  you'll need to remove your usage of Babel.`
        )}`
      }
      if (hasNonDefaultConfig || true) {
        unsupportedParts += `\n\n- Unsupported Next.js configuration option(s) (${chalk.cyan(
          'next.config.js'
        )})\n  ${chalk.dim(
          `The only configurations options supported are:\n    - ${chalk.cyan(
            'experimental.serverComponentsExternalPackages'
          )}\n    - ${chalk.cyan(
            'experimental.transpilePackages'
          )}\n  To use Turbopack, remove other configuration options.`
        )}   `
      }

      if (unsupportedParts) {
        console.error(
          `${chalk.bold.red(
            'Error:'
          )} You are using configuration and/or tools that are not yet\nsupported by Next.js v13 with Turbopack:\n${unsupportedParts}\n
If you cannot make the changes above, but still want to try out\nNext.js v13 with Turbopack, create the Next.js 13 playground app\nby running the following command
        
  ${chalk.bold.cyan(
    `npx create-next-app --example with-turbopack with-turbopack-app`
  )}\n  cd with-turbopack-app\n  npm run dev
  
        `
        )
        console.warn(feedbackMessage)
        process.exit(1)
      }
      console.warn(feedbackMessage)
      process.exit(0)
      loadBindings()
        .then((bindings: any) => {
      const server = bindings.turbo.startDev({
            ...devServerOptions,
        showAll: args['--show-all'] ?? false,
            serverComponentsExternalPackages:
              rawNextConfig.experimental?.serverComponentsExternalPackages,
          })
          // Start preflight after server is listening and ignore errors:
          preflight().catch(() => {})
      return server
        })
        .then(resolve)
    })
  } else {
    startServer(devServerOptions)
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
  }

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
