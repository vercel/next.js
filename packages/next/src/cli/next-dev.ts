#!/usr/bin/env node

import '../server/lib/cpu-profile'
import type { StartServerOptions } from '../server/lib/start-server'
import { printAndExit } from '../server/lib/utils'
import type { DebugAddress } from '../server/lib/utils'
import * as Log from '../build/output/log'
import { getProjectDir } from '../lib/get-project-dir'
import { PHASE_DEVELOPMENT_SERVER } from '../shared/lib/constants'
import path from 'path'
import type { NextConfigComplete } from '../server/config-shared'
import { traceGlobals } from '../trace/shared'
// Heavy modules - lazy loaded to speed up CLI startup
// import { Telemetry } from '../telemetry/storage' - loaded in handleSessionStop
// import loadConfig from '../server/config' - loaded in handleSessionStop
// import { findPagesDir } from '../lib/find-pages-dir' - loaded in handleSessionStop
// import { getNpxCommand } from '../lib/helpers/get-npx-command' - loaded in preflight
// import { createSelfSignedCertificate } from '../lib/mkcert' - loaded only with --experimental-https
// import uploadTrace from '../trace/upload-trace' - loaded only with --experimental-upload-trace
import type { SelfSignedCertificate } from '../lib/mkcert'
import { fileExists, FileType } from '../lib/file-exists'
import {
  getReservedPortExplanation,
  isPortIsReserved,
} from '../lib/helpers/get-reserved-port'
import { flushAllTraces, trace } from '../trace'
import {
  Bundler,
  finalizeBundlerFromConfig,
  parseBundlerArgs,
} from '../lib/bundler'

export type NextDevOptions = {
  disableSourceMaps: boolean
  // Commander is not putting `--inspect` through the arg parser
  inspect?: DebugAddress | true
  turbo?: boolean
  turbopack?: boolean
  webpack?: boolean
  port: number
  hostname?: string
  experimentalHttps?: boolean
  experimentalHttpsKey?: string
  experimentalHttpsCert?: string
  experimentalHttpsCa?: string
  experimentalUploadTrace?: string
  experimentalNextConfigStripTypes?: boolean
}

type PortSource = 'cli' | 'default' | 'env'

let dir: string
// The config in next-dev is only used to access config.distDir for telemetry and trace.
let config: NextConfigComplete
let bundler: Bundler
let traceUploadUrl: string
let sessionStopHandled = false
const sessionStarted = Date.now()
const sessionSpan = trace('next-dev')

const handleSessionStop = async () => {
  if (sessionStopHandled) return
  sessionStopHandled = true

  sessionSpan.stop()
  await flushAllTraces({ end: true })

  try {
    const { eventCliSessionStopped } =
      require('../telemetry/events/session-stopped') as typeof import('../telemetry/events/session-stopped')

    let pagesDir: boolean = !!traceGlobals.get('pagesDir')
    let appDir: boolean = !!traceGlobals.get('appDir')

    if (
      typeof traceGlobals.get('pagesDir') === 'undefined' ||
      typeof traceGlobals.get('appDir') === 'undefined'
    ) {
      const { findPagesDir } =
        require('../lib/find-pages-dir') as typeof import('../lib/find-pages-dir')
      const pagesResult = findPagesDir(dir)
      appDir = !!pagesResult.appDir
      pagesDir = !!pagesResult.pagesDir
    }

    const loadConfig = (
      require('../server/config') as typeof import('../server/config')
    ).default
    config =
      config ||
      (await loadConfig(PHASE_DEVELOPMENT_SERVER, dir, { silent: true }))

    const { Telemetry } =
      require('../telemetry/storage') as typeof import('../telemetry/storage')
    let telemetry =
      (traceGlobals.get('telemetry') as InstanceType<
        typeof import('../telemetry/storage').Telemetry
      >) ||
      new Telemetry({
        distDir: path.join(dir, config.distDir),
      })
    // Reading the config can modify environment variables that influence the bundler selection.
    bundler = finalizeBundlerFromConfig(bundler)

    telemetry.record(
      eventCliSessionStopped({
        cliCommand: 'dev',
        turboFlag: bundler === Bundler.Turbopack,
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
    const uploadTrace = (
      require('../trace/upload-trace') as typeof import('../trace/upload-trace')
    ).default
    uploadTrace({
      traceUploadUrl,
      mode: 'dev',
      projectDir: dir,
      distDir: config.distDir,
      isTurboSession: bundler === Bundler.Turbopack,
    })
  }

  // ensure we re-enable the terminal cursor before exiting
  // the program, or the cursor could remain hidden
  process.stdout.write('\x1B[?25h')
  process.stdout.write('\n')
  process.exit(0)
}

process.on('SIGINT', () => handleSessionStop())
process.on('SIGTERM', () => handleSessionStop())

const nextDev = async (
  options: NextDevOptions,
  portSource: PortSource,
  directory?: string
) => {
  bundler = parseBundlerArgs(options)

  dir = getProjectDir(process.env.NEXT_PRIVATE_DEV_DIR || directory)

  // Check if pages dir exists and warn if not
  if (!(await fileExists(dir, FileType.Directory))) {
    printAndExit(`> No such directory exists as the project root: ${dir}`)
  }

  async function preflight(skipOnReboot: boolean) {
    const { getPackageVersion, getDependencies } = (await Promise.resolve(
      require('../lib/get-package-version') as typeof import('../lib/get-package-version')
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
        const { getNpxCommand } =
          require('../lib/helpers/get-npx-command') as typeof import('../lib/helpers/get-npx-command')
        const command = getNpxCommand(dir)
        Log.warn(
          'Your project has `@next/font` installed as a dependency, please use the built-in `next/font` instead. ' +
            'The `@next/font` package will be removed in Next.js 14. ' +
            `You can migrate by running \`${command} @next/codemod@latest built-in-next-font .\`. Read more: https://nextjs.org/docs/messages/built-in-next-font`
        )
      }
    }
  }

  let port = options.port

  if (isPortIsReserved(port)) {
    printAndExit(getReservedPortExplanation(port), 1)
  }

  // If neither --port nor PORT were specified, it's okay to retry new ports.
  const allowRetry = portSource === 'default'

  // We do not set a default host value here to prevent breaking
  // some set-ups that rely on listening on other interfaces
  const host = options.hostname

  if (
    options.experimentalUploadTrace &&
    !process.env.NEXT_TRACE_UPLOAD_DISABLED
  ) {
    traceUploadUrl = options.experimentalUploadTrace
  }

  const devServerOptions: StartServerOptions = {
    dir,
    port,
    allowRetry,
    isDev: true,
    hostname: host,
  }

  // Set TURBOPACK env if using turbopack bundler
  if (bundler === Bundler.Turbopack) {
    process.env.TURBOPACK = '1'
  }

  const runDevServer = async (reboot: boolean) => {
    try {
      // Load startServer from bundled version with optional bytecode caching
      // The Rust wrapper handles restarts via exit code 77
      const { startServer } =
        require('../server/lib/start-server-with-cache') as typeof import('../server/lib/start-server-with-cache')

      let certificate: SelfSignedCertificate | undefined
      if (!!options.experimentalHttps) {
        Log.warn(
          'Self-signed certificates are currently an experimental feature, use with caution.'
        )

        const key = options.experimentalHttpsKey
        const cert = options.experimentalHttpsCert
        const rootCA = options.experimentalHttpsCa

        if (key && cert) {
          certificate = {
            key: path.resolve(key),
            cert: path.resolve(cert),
            rootCA: rootCA ? path.resolve(rootCA) : undefined,
          }
        } else {
          const { createSelfSignedCertificate } =
            require('../lib/mkcert') as typeof import('../lib/mkcert')
          certificate = await createSelfSignedCertificate(host)
        }
      }

      // Start server directly in this process
      // Exit code 77 (from config watcher) will be handled by Rust wrapper
      await startServer({
        ...devServerOptions,
        selfSignedCertificate: certificate,
      })

      await preflight(reboot)
    } catch (err) {
      console.error(err)
      process.exit(1)
    }
  }

  await runDevServer(false)
}

export { nextDev }
