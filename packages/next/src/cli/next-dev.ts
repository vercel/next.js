#!/usr/bin/env node
import arg from 'next/dist/compiled/arg/index.js'
import { startServer, StartServerOptions } from '../server/lib/start-server'
import { getPort, printAndExit } from '../server/lib/utils'
import * as Log from '../build/output/log'
import { CliCommand } from '../lib/commands'
import isError from '../lib/is-error'
import { getProjectDir } from '../lib/get-project-dir'
import { CONFIG_FILES, PHASE_DEVELOPMENT_SERVER } from '../shared/lib/constants'
import path from 'path'
import {
  defaultConfig,
  NextConfig,
  NextConfigComplete,
} from '../server/config-shared'
import { traceGlobals } from '../trace/shared'
import { Telemetry } from '../telemetry/storage'
import loadConfig from '../server/config'
import { findPagesDir } from '../lib/find-pages-dir'
import { findRootDir } from '../lib/find-root'
import { fileExists, FileType } from '../lib/file-exists'
import { getNpxCommand } from '../lib/helpers/get-npx-command'
import Watchpack from 'watchpack'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import { getPossibleInstrumentationHookFilenames } from '../build/worker'

let dir: string
let isTurboSession = false
let sessionStopHandled = false
let sessionStarted = Date.now()

const handleSessionStop = async () => {
  if (sessionStopHandled) return
  sessionStopHandled = true

  try {
    const { eventCliSession } =
      require('../telemetry/events/session-stopped') as typeof import('../telemetry/events/session-stopped')

    const config = await loadConfig(
      PHASE_DEVELOPMENT_SERVER,
      dir,
      undefined,
      undefined,
      true
    )

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
      const pagesResult = findPagesDir(dir, !!config.experimental.appDir)
      appDir = !!pagesResult.appDir
      pagesDir = !!pagesResult.pagesDir
    }

    telemetry.record(
      eventCliSession({
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

  // ensure we re-enable the terminal cursor before exiting
  // the program, or the cursor could remain hidden
  process.stdout.write('\x1B[?25h')
  process.stdout.write('\n')
  process.exit(0)
}

process.on('SIGINT', handleSessionStop)
process.on('SIGTERM', handleSessionStop)

let unwatchConfigFiles: () => void

function watchConfigFiles(
  dirToWatch: string,
  onChange = (filename: string) =>
    Log.warn(
      `\n> Found a change in ${path.basename(
        filename
      )}. Restart the server to see the changes in effect.`
    )
) {
  if (unwatchConfigFiles) {
    unwatchConfigFiles()
  }

  const wp = new Watchpack()
  wp.watch({ files: CONFIG_FILES.map((file) => path.join(dirToWatch, file)) })
  wp.on('change', onChange)
  unwatchConfigFiles = () => wp.close()
}

const nextDev: CliCommand = async (argv) => {
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
  dir = getProjectDir(process.env.NEXT_PRIVATE_DEV_DIR || args._[0])

  // Check if pages dir exists and warn if not
  if (!(await fileExists(dir, FileType.Directory))) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }

  async function preflight() {
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

  const port = getPort(args)
  // If neither --port nor PORT were specified, it's okay to retry new ports.
  const allowRetry =
    args['--port'] === undefined && process.env.PORT === undefined

  // We do not set a default host value here to prevent breaking
  // some set-ups that rely on listening on other interfaces
  const host = args['--hostname']

  const devServerOptions: StartServerOptions = {
    dir,
    port,
    allowRetry,
    isDev: true,
    hostname: host,
    // This is required especially for app dir.
    useWorkers: true,
  }

  if (args['--turbo']) {
    process.env.TURBOPACK = '1'
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
    const { pagesDir, appDir } = findPagesDir(
      dir,
      typeof rawNextConfig?.experimental?.appDir === 'undefined'
        ? !!defaultConfig.experimental?.appDir
        : !!rawNextConfig.experimental?.appDir
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

    if (process.platform === 'darwin') {
      // rust needs stdout to be blocking, otherwise it will throw an error (on macOS at least) when writing a lot of data (logs) to it
      // see https://github.com/napi-rs/napi-rs/issues/1630
      // and https://github.com/nodejs/node/blob/main/doc/api/process.md#a-note-on-process-io
      if (process.stdout._handle != null) {
        // @ts-ignore
        process.stdout._handle.setBlocking(true)
      }
      if (process.stderr._handle != null) {
        // @ts-ignore
        process.stderr._handle.setBlocking(true)
      }
    }

    let bindings: any = await loadBindings()
    let server = bindings.turbo.startDev({
      ...devServerOptions,
      showAll: args['--show-all'] ?? false,
      root: args['--root'] ?? findRootDir(dir),
    })
    // Start preflight after server is listening and ignore errors:
    preflight().catch(() => {})

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
    let cleanupFns: (() => Promise<void> | void)[] = []
    const runDevServer = async () => {
      const oldCleanupFns = cleanupFns
      cleanupFns = []
      await Promise.allSettled(oldCleanupFns.map((fn) => fn()))

      try {
        let shouldFilter = false
        let devServerTeardown: (() => Promise<void>) | undefined
        let config: NextConfig | undefined

        watchConfigFiles(devServerOptions.dir, (filename) => {
          Log.warn(
            `\n> Found a change in ${path.basename(
              filename
            )}. Restarting the server to apply the changes...`
          )
          runDevServer()
        })
        cleanupFns.push(unwatchConfigFiles)

        const setupFork = async (newDir?: string) => {
          // if we're using workers we can auto restart on config changes
          if (process.env.__NEXT_DISABLE_MEMORY_WATCHER && devServerTeardown) {
            Log.info(
              `Detected change, manual restart required due to '__NEXT_DISABLE_MEMORY_WATCHER' usage`
            )
            return
          }

          if (devServerTeardown) {
            await devServerTeardown()
            devServerTeardown = undefined
          }

          const startDir = dir
          if (newDir) {
            dir = newDir
            process.env = Object.keys(process.env).reduce((newEnv, key) => {
              newEnv[key] = process.env[key]?.replace(startDir, newDir)
              return newEnv
            }, {} as typeof process.env)

            process.chdir(newDir)

            devServerOptions.dir = newDir
            devServerOptions.prevDir = startDir
          }

          // since errors can start being logged from the fork
          // before we detect the project directory rename
          // attempt suppressing them long enough to check
          const filterForkErrors = (chunk: Buffer, fd: 'stdout' | 'stderr') => {
            const cleanChunk = stripAnsi(chunk + '')
            if (
              cleanChunk.match(
                /(ENOENT|Module build failed|Module not found|Cannot find module|Can't resolve)/
              )
            ) {
              if (startDir === dir) {
                try {
                  // check if start directory is still valid
                  const result = findPagesDir(
                    startDir,
                    !!config?.experimental?.appDir
                  )
                  shouldFilter = !Boolean(result.pagesDir || result.appDir)
                } catch (_) {
                  shouldFilter = true
                }
              }
              if (shouldFilter || startDir !== dir) {
                shouldFilter = true
                return
              }
            }
            process[fd].write(chunk)
          }

          let resolveCleanup!: (cleanup: () => Promise<void>) => void
          let cleanupPromise = new Promise<() => Promise<void>>((resolve) => {
            resolveCleanup = resolve
          })
          const cleanupWrapper = async () => {
            const promise = cleanupPromise
            cleanupPromise = Promise.resolve(async () => {})
            const cleanup = await promise
            await cleanup()
          }
          cleanupFns.push(cleanupWrapper)
          devServerTeardown = cleanupWrapper

          try {
            devServerOptions.onStdout = (chunk) => {
              filterForkErrors(chunk, 'stdout')
            }
            devServerOptions.onStderr = (chunk) => {
              filterForkErrors(chunk, 'stderr')
            }
            shouldFilter = false
            resolveCleanup(await startServer(devServerOptions))
          } finally {
            // fallback to noop, if not provided
            resolveCleanup(async () => {})
          }

          if (!config) {
            config = await loadConfig(
              PHASE_DEVELOPMENT_SERVER,
              dir,
              undefined,
              undefined,
              true
            )
          }
        }

        await setupFork()
        await preflight()

        const parentDir = path.join('/', dir, '..')
        const watchedEntryLength = parentDir.split('/').length + 1
        const previousItems = new Set<string>()
        const instrumentationFilePaths = !!config?.experimental
          ?.instrumentationHook
          ? getPossibleInstrumentationHookFilenames(dir, config.pageExtensions!)
          : []

        const instrumentationFileWatcher = new Watchpack({})
        cleanupFns.push(() => instrumentationFileWatcher.close())

        instrumentationFileWatcher.watch({
          files: instrumentationFilePaths,
          startTime: 0,
        })

        let instrumentationFileLastHash: string | undefined = undefined
        const previousInstrumentationFiles = new Set<string>()
        instrumentationFileWatcher.on('aggregated', async () => {
          const knownFiles = instrumentationFileWatcher.getTimeInfoEntries()
          const instrumentationFile = [...knownFiles.entries()].find(
            ([key, value]) => instrumentationFilePaths.includes(key) && value
          )?.[0]

          if (instrumentationFile) {
            const fs = require('fs') as typeof import('fs')
            const instrumentationFileHash = (
              require('crypto') as typeof import('crypto')
            )
              .createHash('sha256')
              .update(await fs.promises.readFile(instrumentationFile, 'utf8'))
              .digest('hex')

            if (
              instrumentationFileLastHash &&
              instrumentationFileHash !== instrumentationFileLastHash
            ) {
              Log.warn(
                `The instrumentation file has changed, restarting the server to apply changes.`
              )
              return setupFork()
            } else {
              if (
                !instrumentationFileLastHash &&
                previousInstrumentationFiles.size !== 0
              ) {
                Log.warn(
                  'The instrumentation file was added, restarting the server to apply changes.'
                )
                return setupFork()
              }
              instrumentationFileLastHash = instrumentationFileHash
            }
          } else if (
            [...previousInstrumentationFiles.keys()].find((key) =>
              instrumentationFilePaths.includes(key)
            )
          ) {
            Log.warn(
              `The instrumentation file has been removed, restarting the server to apply changes.`
            )
            instrumentationFileLastHash = undefined
            return setupFork()
          }

          previousInstrumentationFiles.clear()
          knownFiles.forEach((_: any, key: any) =>
            previousInstrumentationFiles.add(key)
          )
        })

        const projectFolderWatcher = new Watchpack({
          ignored: (entry: string) => {
            return !(entry.split('/').length <= watchedEntryLength)
          },
        })
        cleanupFns.push(() => projectFolderWatcher.close())

        projectFolderWatcher.watch({ directories: [parentDir], startTime: 0 })

        projectFolderWatcher.on('aggregated', async () => {
          const knownFiles = projectFolderWatcher.getTimeInfoEntries()
          const newFiles: string[] = []
          let hasPagesApp = false

          // if the dir still exists nothing to check
          try {
            const result = findPagesDir(dir, !!config?.experimental?.appDir)
            hasPagesApp = Boolean(result.pagesDir || result.appDir)
          } catch (err) {
            // if findPagesDir throws validation error let this be
            // handled in the dev-server itself in the fork
            if ((err as any).message?.includes('experimental')) {
              return
            }
          }

          // try to find new dir introduced
          if (previousItems.size) {
            for (const key of knownFiles.keys()) {
              if (!previousItems.has(key)) {
                newFiles.push(key)
              }
            }
            previousItems.clear()
          }

          for (const key of knownFiles.keys()) {
            previousItems.add(key)
          }

          if (hasPagesApp) {
            return
          }

          // if we failed to find the new dir it may have been moved
          // to a new parent directory which we can't track as easily
          // so exit gracefully
          try {
            const result = findPagesDir(
              newFiles[0],
              !!config?.experimental?.appDir
            )
            hasPagesApp = Boolean(result.pagesDir || result.appDir)
          } catch (_) {}

          if (hasPagesApp && newFiles.length === 1) {
            Log.info(
              `Detected project directory rename, restarting in new location`
            )
            setupFork(newFiles[0])
            watchConfigFiles(newFiles[0])
          } else {
            Log.error(
              `Project directory could not be found, restart Next.js in your new directory`
            )
            process.exit(0)
          }
        })
      } catch (err) {
        console.error(err)
        process.exit(1)
      }
    }
    await runDevServer()
  }
}

export { nextDev }
