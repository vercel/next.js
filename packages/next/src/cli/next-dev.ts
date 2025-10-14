#!/usr/bin/env node

import '../server/lib/cpu-profile'
import type { StartServerOptions } from '../server/lib/start-server'
import {
  RESTART_EXIT_CODE,
  getNodeDebugType,
  getParsedDebugAddress,
  getMaxOldSpaceSize,
  getParsedNodeOptionsWithoutInspect,
  printAndExit,
  formatNodeOptions,
  formatDebugAddress,
} from '../server/lib/utils'
import * as Log from '../build/output/log'
import { getProjectDir } from '../lib/get-project-dir'
import { PHASE_DEVELOPMENT_SERVER } from '../shared/lib/constants'
import path from 'path'
import type { NextConfigComplete } from '../server/config-shared'
import { traceGlobals } from '../trace/shared'
import { Telemetry } from '../telemetry/storage'
import loadConfig from '../server/config'
import { findPagesDir } from '../lib/find-pages-dir'
import { fileExists, FileType } from '../lib/file-exists'
import { getNpxCommand } from '../lib/helpers/get-npx-command'
import { createSelfSignedCertificate } from '../lib/mkcert'
import type { SelfSignedCertificate } from '../lib/mkcert'
import uploadTrace from '../trace/upload-trace'
import { initialEnv } from '@next/env'
import { fork } from 'child_process'
import type { ChildProcess } from 'child_process'
import {
  getReservedPortExplanation,
  isPortIsReserved,
} from '../lib/helpers/get-reserved-port'
import os from 'os'
import { once } from 'node:events'
import { clearTimeout } from 'timers'
import { flushAllTraces, trace } from '../trace'
import { traceId } from '../trace/shared'
import {
  Bundler,
  finalizeBundlerFromConfig,
  parseBundlerArgs,
} from '../lib/bundler'

export type NextDevOptions = {
  disableSourceMaps: boolean
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
let child: undefined | ChildProcess
// The config in next-dev is only used to access config.distDir for telemetry and trace.
let config: NextConfigComplete
let bundler: Bundler
let traceUploadUrl: string
let sessionStopHandled = false
const sessionStarted = Date.now()
const sessionSpan = trace('next-dev')

// How long should we wait for the child to cleanly exit after sending
// SIGINT/SIGTERM to the child process before sending SIGKILL?
const CHILD_EXIT_TIMEOUT_MS = parseInt(
  process.env.NEXT_EXIT_TIMEOUT_MS ?? '100',
  10
)

const handleSessionStop = async (signal: NodeJS.Signals | number | null) => {
  if (signal != null && child?.pid) child.kill(signal)
  if (sessionStopHandled) return
  sessionStopHandled = true

  // Capture the child's exit code if it has already exited and caused the
  // session stop (via the 'exit' event), otherwise assume success (0).
  const exitCode = child?.exitCode || 0

  if (
    signal != null &&
    child?.pid &&
    child.exitCode === null &&
    child.signalCode === null
  ) {
    let exitTimeout = setTimeout(() => {
      child?.kill('SIGKILL')
    }, CHILD_EXIT_TIMEOUT_MS)
    await once(child, 'exit').catch(() => {})
    clearTimeout(exitTimeout)
  }

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
      const pagesResult = findPagesDir(dir)
      appDir = !!pagesResult.appDir
      pagesDir = !!pagesResult.pagesDir
    }

    config =
      config ||
      (await loadConfig(PHASE_DEVELOPMENT_SERVER, dir, { silent: true }))

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
  process.exit(exitCode)
}

process.on('SIGINT', () => handleSessionStop('SIGINT'))
process.on('SIGTERM', () => handleSessionStop('SIGTERM'))

// exit event must be synchronous
process.on('exit', () => child?.kill('SIGKILL'))

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

  const startServerPath = require.resolve('../server/lib/start-server')

  async function startServer(startServerOptions: StartServerOptions) {
    return new Promise<void>((resolve) => {
      let resolved = false
      const defaultEnv = (initialEnv || process.env) as typeof process.env

      const nodeOptions = getParsedNodeOptionsWithoutInspect()
      const nodeDebugType = getNodeDebugType()

      let maxOldSpaceSize: string | number | undefined = getMaxOldSpaceSize()
      if (!maxOldSpaceSize && !process.env.NEXT_DISABLE_MEM_OVERRIDE) {
        const totalMem = os.totalmem()
        const totalMemInMB = Math.floor(totalMem / 1024 / 1024)
        maxOldSpaceSize = Math.floor(totalMemInMB * 0.5).toString()

        nodeOptions['max-old-space-size'] = maxOldSpaceSize

        // Ensure the max_old_space_size is not also set.
        delete nodeOptions['max_old_space_size']
      }

      if (options.disableSourceMaps) {
        delete nodeOptions['enable-source-maps']
      } else {
        nodeOptions['enable-source-maps'] = true
      }

      if (nodeDebugType) {
        const address = getParsedDebugAddress()
        address.port = address.port + 1
        nodeOptions[nodeDebugType] = formatDebugAddress(address)
      }

      child = fork(startServerPath, {
        stdio: 'inherit',
        env: {
          ...defaultEnv,
          ...(bundler === Bundler.Turbopack
            ? { TURBOPACK: process.env.TURBOPACK }
            : undefined),
          NEXT_PRIVATE_WORKER: '1',
          NEXT_PRIVATE_TRACE_ID: traceId,
          NODE_EXTRA_CA_CERTS: startServerOptions.selfSignedCertificate
            ? startServerOptions.selfSignedCertificate.rootCA
            : defaultEnv.NODE_EXTRA_CA_CERTS,
          NODE_OPTIONS: formatNodeOptions(nodeOptions),
          // There is a node.js bug on MacOS which causes closing file watchers to be really slow.
          // This limits the number of watchers to mitigate the issue.
          // https://github.com/nodejs/node/issues/29949
          WATCHPACK_WATCHER_LIMIT:
            os.platform() === 'darwin' ? '20' : undefined,
        },
      })

      child.on('message', (msg: any) => {
        if (msg && typeof msg === 'object') {
          if (msg.nextWorkerReady) {
            child?.send({ nextWorkerOptions: startServerOptions })
          } else if (msg.nextServerReady && !resolved) {
            if (msg.port) {
              // Store the used port in case a random one was selected, so that
              // it can be re-used on automatic dev server restarts.
              port = parseInt(msg.port, 10)
            }

            resolved = true
            resolve()
          }
        }
      })

      child.on('exit', async (code, signal) => {
        if (sessionStopHandled || signal) {
          return
        }
        if (code === RESTART_EXIT_CODE) {
          // Starting the dev server will overwrite the `.next/trace` file, so we
          // must upload the existing contents before restarting the server to
          // preserve the metrics.
          if (traceUploadUrl) {
            // Postpone loading next config when we need to get
            //  config.distDir for upload trace.
            config =
              config ||
              (await loadConfig(PHASE_DEVELOPMENT_SERVER, dir, {
                silent: true,
              }))
            bundler = finalizeBundlerFromConfig(bundler)
            uploadTrace({
              traceUploadUrl,
              mode: 'dev',
              projectDir: dir,
              distDir: config.distDir,
              isTurboSession: bundler === Bundler.Turbopack,
              sync: true,
            })
          }

          return startServer({ ...startServerOptions, port })
        }
        // Call handler (e.g. upload telemetry). Don't try to send a signal to
        // the child, as it has already exited.
        await handleSessionStop(/* signal */ null)
      })
    })
  }

  const runDevServer = async (reboot: boolean) => {
    try {
      if (!!options.experimentalHttps) {
        Log.warn(
          'Self-signed certificates are currently an experimental feature, use with caution.'
        )

        let certificate: SelfSignedCertificate | undefined

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

  await runDevServer(false)
}

export { nextDev }
