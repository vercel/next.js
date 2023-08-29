#!/usr/bin/env node
import type { StartServerOptions } from '../server/lib/start-server'
import { getPort, printAndExit } from '../server/lib/utils'
import * as Log from '../build/output/log'
import { CliCommand } from '../lib/commands'
import { getProjectDir } from '../lib/get-project-dir'
import { CONFIG_FILES, PHASE_DEVELOPMENT_SERVER } from '../shared/lib/constants'
import path from 'path'
import { NextConfigComplete } from '../server/config-shared'
import { traceGlobals } from '../trace/shared'
import { Telemetry } from '../telemetry/storage'
import loadConfig from '../server/config'
import { findPagesDir } from '../lib/find-pages-dir'
import { findRootDir } from '../lib/find-root'
import { fileExists, FileType } from '../lib/file-exists'
import { getNpxCommand } from '../lib/helpers/get-npx-command'
import Watchpack from 'watchpack'
import { resetEnv } from '@next/env'
import { createSelfSignedCertificate } from '../lib/mkcert'
import uploadTrace from '../trace/upload-trace'
import { startServer } from '../server/lib/start-server'

let dir: string
let config: NextConfigComplete
let isTurboSession = false
let traceUploadUrl: string
let sessionStopHandled = false
let sessionStarted = Date.now()

const handleSessionStop = async () => {
  if (sessionStopHandled) return
  sessionStopHandled = true

  try {
    const { eventCliSessionStopped } =
      require('../telemetry/events/session-stopped') as typeof import('../telemetry/events/session-stopped')

    config =
      config ||
      (await loadConfig(
        PHASE_DEVELOPMENT_SERVER,
        dir,
        undefined,
        undefined,
        true
      ))

    let telemetry =
      (traceGlobals.get('telemetry') as InstanceType<
        typeof import('../telemetry/storage').Telemetry
      >) ||
      new Telemetry({
        distDir: path.join(dir, config.distDir),
      })

    let pagesDir: boolean = !!traceGlobals.get('pagesDir')
    let appDir: boolean = !!traceGlobals.get('appDir')

    if (
      typeof traceGlobals.get('pagesDir') === 'undefined' ||
      typeof traceGlobals.get('appDir') === 'undefined'
    ) {
      const pagesResult = findPagesDir(dir, true)
      appDir = !!pagesResult.appDir
      pagesDir = !!pagesResult.pagesDir
    }

    telemetry.record(
      eventCliSessionStopped({
        cliCommand: 'dev',
        turboFlag: isTurboSession,
        durationMilliseconds: Date.now() - sessionStarted,
        pagesDir,
        appDir,
      }),
      true
    )
    telemetry.flushDetached('dev', dir)
  } catch (_) {
    // errors here aren't actionable so don't add
    // noise to the output
  }

  if (traceUploadUrl) {
    if (isTurboSession) {
      console.warn(
        'Uploading traces with Turbopack is not yet supported. Skipping sending trace.'
      )
    } else {
      uploadTrace({
        traceUploadUrl,
        mode: 'dev',
        isTurboSession,
        projectDir: dir,
        distDir: config.distDir,
      })
    }
  }

  // ensure we re-enable the terminal cursor before exiting
  // the program, or the cursor could remain hidden
  process.stdout.write('\x1B[?25h')
  process.stdout.write('\n')
  process.exit(0)
}

process.on('SIGINT', handleSessionStop)
process.on('SIGTERM', handleSessionStop)

function watchConfigFiles(
  dirToWatch: string,
  onChange: (filename: string) => void
) {
  const wp = new Watchpack()
  wp.watch({ files: CONFIG_FILES.map((file) => path.join(dirToWatch, file)) })
  wp.on('change', onChange)
}

const nextDev: CliCommand = async (args) => {
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
        --experimental-upload-trace=<trace-url>  [EXPERIMENTAL] Report a subset of the debugging trace to a remote http url. Includes sensitive data. Disabled by default and url must be provided.
        --help, -h      Displays this message
    `)
    process.exit(0)
  }
  dir = getProjectDir(process.env.NEXT_PRIVATE_DEV_DIR || args._[0])

  // Check if pages dir exists and warn if not
  if (!(await fileExists(dir, FileType.Directory))) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }

  async function preflight(skipOnReboot: boolean) {
    const { getPackageVersion, getDependencies } = (await Promise.resolve(
      require('../lib/get-package-version')
    )) as typeof import('../lib/get-package-version')

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

    if (!skipOnReboot) {
      const { dependencies, devDependencies } = await getDependencies({
        cwd: dir,
      })

      // Warn if @next/font is installed as a dependency. Ignore `workspace:*` to not warn in the Next.js monorepo.
      if (
        dependencies['@next/font'] ||
        (devDependencies['@next/font'] &&
          devDependencies['@next/font'] !== 'workspace:*')
      ) {
        const command = getNpxCommand(dir)
        Log.warn(
          'Your project has `@next/font` installed as a dependency, please use the built-in `next/font` instead. ' +
            'The `@next/font` package will be removed in Next.js 14. ' +
            `You can migrate by running \`${command} @next/codemod@latest built-in-next-font .\`. Read more: https://nextjs.org/docs/messages/built-in-next-font`
        )
      }
    }
  }

  const port = getPort(args)
  // If neither --port nor PORT were specified, it's okay to retry new ports.
  const allowRetry =
    args['--port'] === undefined && process.env.PORT === undefined

  // We do not set a default host value here to prevent breaking
  // some set-ups that rely on listening on other interfaces
  const host = args['--hostname']
  config = await loadConfig(PHASE_DEVELOPMENT_SERVER, dir)

  const isExperimentalTestProxy = args['--experimental-test-proxy']

  if (args['--experimental-upload-trace']) {
    traceUploadUrl = args['--experimental-upload-trace']
  }

  const devServerOptions: StartServerOptions = {
    dir,
    port,
    allowRetry,
    isDev: true,
    hostname: host,
    isExperimentalTestProxy,
  }

  if (args['--turbo']) {
    process.env.TURBOPACK = '1'
  }
  if (args['--experimental-turbo']) {
    process.env.EXPERIMENTAL_TURBOPACK = '1'
  }

  if (process.env.TURBOPACK) {
    isTurboSession = true

    const { validateTurboNextConfig } =
      require('../lib/turbopack-warning') as typeof import('../lib/turbopack-warning')
    const { loadBindings, __isCustomTurbopackBinary, teardownHeapProfiler } =
      require('../build/swc') as typeof import('../build/swc')
    const { eventCliSession } =
      require('../telemetry/events/version') as typeof import('../telemetry/events/version')
    const { setGlobal } = require('../trace') as typeof import('../trace')
    require('../telemetry/storage') as typeof import('../telemetry/storage')
    const findUp =
      require('next/dist/compiled/find-up') as typeof import('next/dist/compiled/find-up')

    const isCustomTurbopack = await __isCustomTurbopackBinary()
    const rawNextConfig = await validateTurboNextConfig({
      isCustomTurbopack,
      ...devServerOptions,
      isDev: true,
    })

    const distDir = path.join(dir, rawNextConfig.distDir || '.next')
    const { pagesDir, appDir } = findPagesDir(dir, true)
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

    // Turbopack need to be in control over reading the .env files and watching them.
    // So we need to start with a initial env to know which env vars are coming from the user.
    resetEnv()
    let bindings = await loadBindings()

    let server = bindings.turbo.startDev({
      ...devServerOptions,
      showAll: args['--show-all'] ?? false,
      root: args['--root'] ?? findRootDir(dir),
    })
    // Start preflight after server is listening and ignore errors:
    preflight(false).catch(() => {})

    if (!isCustomTurbopack) {
      await telemetry.flush()
    }

    // There are some cases like test fixtures teardown that normal flush won't hit.
    // Force flush those on those case, but don't wait for it.
    ;['SIGTERM', 'SIGINT', 'beforeExit', 'exit'].forEach((event) =>
      process.on(event, () => teardownHeapProfiler())
    )

    return server
  } else {
    const runDevServer = async (reboot: boolean) => {
      try {
        if (!!args['--experimental-https']) {
          Log.warn(
            'Self-signed certificates are currently an experimental feature, use at your own risk.'
          )

          let certificate: { key: string; cert: string } | undefined

          if (
            args['--experimental-https-key'] &&
            args['--experimental-https-cert']
          ) {
            certificate = {
              key: path.resolve(args['--experimental-https-key']),
              cert: path.resolve(args['--experimental-https-cert']),
            }
          } else {
            certificate = await createSelfSignedCertificate(host)
          }

          await startServer({
            ...devServerOptions,
            selfSignedCertificate: certificate,
          })
        } else {
          await startServer(devServerOptions)
        }

        await preflight(reboot)
      } catch (err) {
        console.error(err)
        process.exit(1)
      }
    }

    // TODO: move config file watching to inner process
    watchConfigFiles(devServerOptions.dir, async (filename) => {
      if (process.env.__NEXT_DISABLE_MEMORY_WATCHER) {
        Log.info(
          `Detected change, manual restart required due to '__NEXT_DISABLE_MEMORY_WATCHER' usage`
        )
        return
      }
      Log.warn(
        `\n> Found a change in ${path.basename(
          filename
        )}. Restarting the server to apply the changes...`
      )
    })

    await runDevServer(false)
  }
}

export { nextDev }
