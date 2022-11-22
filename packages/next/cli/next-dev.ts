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
import type { NextConfig } from '../types'
import type { NextConfigComplete } from '../server/config-shared'
import { traceGlobals } from '../trace/shared'

let isTurboSession = false
let sessionStopHandled = false
let sessionStarted = Date.now()

const handleSessionStop = async () => {
  if (sessionStopHandled) return
  sessionStopHandled = true

  const { eventCliSession } =
    require('../telemetry/events/session-stopped') as typeof import('../telemetry/events/session-stopped')
  const telemetry = traceGlobals.get('telemetry') as InstanceType<
    typeof import('../telemetry/storage').Telemetry
  >
  if (!telemetry) {
    process.exit(0)
  }

  telemetry.record(
    eventCliSession({
      cliCommand: 'dev',
      turboFlag: isTurboSession,
      durationMilliseconds: Date.now() - sessionStarted,
      pagesDir: !!traceGlobals.get('pagesDir'),
      appDir: !!traceGlobals.get('appDir'),
    })
  )
  await telemetry.flush()
  process.exit(0)
}

process.on('SIGINT', handleSessionStop)
process.on('SIGTERM', handleSessionStop)

const nextDev: cliCommand = async (argv) => {
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

  // check for postcss, babelrc, swc plugins
  async function validateNextConfig(isCustomTurbopack: boolean) {
    const { findConfigPath } =
      require('../lib/find-config') as typeof import('../lib/find-config')
    const { getPkgManager } =
      require('../lib/helpers/get-pkg-manager') as typeof import('../lib/helpers/get-pkg-manager')
    const { getBabelConfigFile } =
      require('../build/webpack-config') as typeof import('../build/webpack-config')
    const { defaultConfig } =
      require('../server/config-shared') as typeof import('../server/config-shared')
    const { default: loadConfig } =
      require('../server/config') as typeof import('../server/config')
    const { PHASE_DEVELOPMENT_SERVER } =
      require('../shared/lib/constants') as typeof import('../shared/lib/constants')
    const chalk =
      require('next/dist/compiled/chalk') as typeof import('next/dist/compiled/chalk')
    const { interopDefault } =
      require('../lib/interop-default') as typeof import('../lib/interop-default')
    const findUp =
      require('next/dist/compiled/find-up') as typeof import('next/dist/compiled/find-up')

    // To regenerate the TURBOPACK gradient require('gradient-string')('blue', 'red')('>>> TURBOPACK')
    const isTTY = process.stdout.isTTY

    const turbopackGradient = `${chalk.bold(
      isTTY
        ? '\x1B[38;2;0;0;255m>\x1B[39m\x1B[38;2;23;0;232m>\x1B[39m\x1B[38;2;46;0;209m>\x1B[39m \x1B[38;2;70;0;185mT\x1B[39m\x1B[38;2;93;0;162mU\x1B[39m\x1B[38;2;116;0;139mR\x1B[39m\x1B[38;2;139;0;116mB\x1B[39m\x1B[38;2;162;0;93mO\x1B[39m\x1B[38;2;185;0;70mP\x1B[39m\x1B[38;2;209;0;46mA\x1B[39m\x1B[38;2;232;0;23mC\x1B[39m\x1B[38;2;255;0;0mK\x1B[39m'
        : '>>> TURBOPACK'
    )} ${chalk.dim('(alpha)')}\n\n`

    let thankYouMsg = `Thank you for trying Next.js v13 with Turbopack! As a reminder,\nTurbopack is currently in alpha and not yet ready for production.\nWe appreciate your ongoing support as we work to make it ready\nfor everyone.\n`

    let unsupportedParts = ''
    // TODO: warning for postcss mentioning sidecar
    let babelrc = await getBabelConfigFile(dir)
    if (babelrc) babelrc = path.basename(babelrc)

    let hasNonDefaultConfig
    let postcssFile
    let tailwindFile
    let rawNextConfig: NextConfig = {}

    try {
      rawNextConfig = interopDefault(
        await loadConfig(PHASE_DEVELOPMENT_SERVER, dir, undefined, true)
      ) as NextConfig

      if (typeof rawNextConfig === 'function') {
        rawNextConfig = (rawNextConfig as any)(PHASE_DEVELOPMENT_SERVER, {
          defaultConfig,
        })
      }

      const checkUnsupportedCustomConfig = (
        configKey = '',
        parentUserConfig: any,
        parentDefaultConfig: any
      ): boolean => {
        try {
          // these should not error
          if (
            configKey === 'serverComponentsExternalPackages' ||
            configKey === 'appDir' ||
            configKey === 'transpilePackages' ||
            configKey === 'reactStrictMode' ||
            configKey === 'swcMinify' ||
            configKey === 'configFileName'
          ) {
            return false
          }
          let userValue = parentUserConfig?.[configKey]
          let defaultValue = parentDefaultConfig?.[configKey]

          if (typeof defaultValue !== 'object') {
            return defaultValue !== userValue
          }
          return Object.keys(userValue || {}).some((key: string) => {
            return checkUnsupportedCustomConfig(key, userValue, defaultValue)
          })
        } catch (e) {
          console.error(
            `Unexpected error occurred while checking ${configKey}`,
            e
          )
          return false
        }
      }

      hasNonDefaultConfig = Object.keys(rawNextConfig).some((key) =>
        checkUnsupportedCustomConfig(key, rawNextConfig, defaultConfig)
      )

      const packagePath = findUp.sync('package.json', { cwd: dir })
      let hasSideCar = false

      if (packagePath) {
        const pkgData = require(packagePath)
        hasSideCar = Object.values(
          (pkgData.scripts || {}) as Record<string, string>
        ).some(
          (script) => script.includes('tailwind') || script.includes('postcss')
        )
      }
      postcssFile = !hasSideCar && (await findConfigPath(dir, 'postcss'))
      tailwindFile = !hasSideCar && (await findConfigPath(dir, 'tailwind'))

      if (postcssFile) postcssFile = path.basename(postcssFile)
      if (tailwindFile) tailwindFile = path.basename(tailwindFile)
    } catch (e) {
      console.error('Unexpected error occurred while checking config', e)
    }

    const hasWarningOrError =
      tailwindFile || postcssFile || babelrc || hasNonDefaultConfig
    if (!hasWarningOrError) {
      thankYouMsg = chalk.dim(thankYouMsg)
    }
    console.log(turbopackGradient + thankYouMsg)

    let feedbackMessage = `Learn more about Next.js v13 and Turbopack: ${chalk.underline(
      'https://nextjs.link/with-turbopack'
    )}\nPlease direct feedback to: ${chalk.underline(
      'https://nextjs.link/turbopack-feedback'
    )}\n`

    if (!hasWarningOrError) {
      feedbackMessage = chalk.dim(feedbackMessage)
    }

    if (babelrc) {
      unsupportedParts += `\n- Babel detected (${chalk.cyan(
        babelrc
      )})\n  ${chalk.dim(
        `Babel is not yet supported. To use Turbopack at the moment,\n  you'll need to remove your usage of Babel.`
      )}`
    }
    if (hasNonDefaultConfig) {
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

    if (postcssFile || tailwindFile) {
      console.warn(
        `${chalk.bold.yellow(
          'Warning:'
        )} You are using configuration that may require additional\nsetup with Turbopack. If you already made these changes please\nignore this warning.\n`
      )
    }

    if (postcssFile) {
      console.warn(
        `- PostCSS detected (${chalk.cyan(postcssFile)})\n` +
          `  ${chalk.dim(
            'PostCSS is not yet supported by Next.js v13 with Turbopack.\n  To use with Turbopack, see: https://nextjs.link/turbopack-postcss'
          )}\n`
      )
    }

    if (tailwindFile) {
      console.warn(
        `- Tailwind detected (${chalk.cyan(tailwindFile)})\n` +
          `  ${chalk.dim(
            'Tailwind is not yet supported by Next.js v13 with Turbopack.\n  To use with Turbopack, see: https://nextjs.link/turbopack-tailwind'
          )}\n`
      )
    }

    if (unsupportedParts) {
      const pkgManager = getPkgManager(dir)

      console.error(
        `${chalk.bold.red(
          'Error:'
        )} You are using configuration and/or tools that are not yet\nsupported by Next.js v13 with Turbopack:\n${unsupportedParts}\n
If you cannot make the changes above, but still want to try out\nNext.js v13 with Turbopack, create the Next.js v13 playground app\nby running the following commands:

  ${chalk.bold.cyan(
    `${
      pkgManager === 'npm'
        ? 'npx create-next-app'
        : `${pkgManager} create next-app`
    } --example with-turbopack with-turbopack-app`
  )}\n  cd with-turbopack-app\n  ${pkgManager} run dev
        `
      )
      console.warn(feedbackMessage)

      if (!isCustomTurbopack) {
        process.exit(1)
      } else {
        console.warn(
          `\n${chalk.bold.yellow(
            'Warning:'
          )} Unsupported config found; but continuing with custom Turbopack binary.\n`
        )
      }
    }
    console.log(feedbackMessage)

    return rawNextConfig
  }

  if (args['--turbo']) {
    isTurboSession = true

    const { loadBindings, __isCustomTurbopackBinary } =
      require('../build/swc') as typeof import('../build/swc')
    const { eventCliSession } =
      require('../telemetry/events/version') as typeof import('../telemetry/events/version')
    const { findPagesDir } =
      require('../lib/find-pages-dir') as typeof import('../lib/find-pages-dir')
    const { setGlobal } = require('../trace') as typeof import('../trace')
    const { Telemetry } =
      require('../telemetry/storage') as typeof import('../telemetry/storage')
    const findUp =
      require('next/dist/compiled/find-up') as typeof import('next/dist/compiled/find-up')

    const isCustomTurbopack = await __isCustomTurbopackBinary()
    const rawNextConfig = await validateNextConfig(isCustomTurbopack)

    const distDir = path.join(dir, rawNextConfig.distDir || '.next')
    const { pagesDir, appDir } = findPagesDir(
      dir,
      !!rawNextConfig.experimental?.appDir
    )
    const telemetry = new Telemetry({
      distDir,
    })
    setGlobal('appDir', appDir)
    setGlobal('pagesDir', pagesDir)
    setGlobal('telemetry', telemetry)

    if (!isCustomTurbopack) {
      telemetry.record(
        eventCliSession(distDir, rawNextConfig as NextConfigComplete, {
          webpackVersion: 5,
          cliCommand: 'dev',
          isSrcDir: path
            .relative(dir, pagesDir || appDir || '')
            .startsWith('src'),
          hasNowJson: !!(await findUp('now.json', { cwd: dir })),
          isCustomServer: false,
          turboFlag: true,
          pagesDir: !!pagesDir,
          appDir: !!appDir,
        })
      )
    }

    const turboJson = findUp.sync('turbo.json', { cwd: dir })
    // eslint-disable-next-line no-shadow
    const packagePath = findUp.sync('package.json', { cwd: dir })

    let bindings: any = await loadBindings()
    let server = bindings.turbo.startDev({
      ...devServerOptions,
      showAll: args['--show-all'] ?? false,
      root:
        args['--root'] ??
        (turboJson
          ? path.dirname(turboJson)
          : packagePath
          ? path.dirname(packagePath)
          : undefined),
      serverComponentsExternalPackages:
        rawNextConfig.experimental?.serverComponentsExternalPackages,
    })
    // Start preflight after server is listening and ignore errors:
    preflight().catch(() => {})

    await telemetry.flush()
    return server
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
