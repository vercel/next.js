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
import { setGlobal, traceGlobals } from '../trace/shared'
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

type NextDevOptions = {
  turbo?: boolean
  port: number
  hostname?: string
  experimentalHttps?: boolean
  experimentalHttpsKey?: string
  experimentalHttpsCert?: string
  experimentalHttpsCa?: string
  experimentalUploadTrace?: string
}

type PortSource = 'cli' | 'default' | 'env'

let dir: string
let child: undefined | ChildProcess
let config: NextConfigComplete
let isTurboSession = false
let traceUploadUrl: string
let sessionStopHandled = false
let sessionStarted = Date.now()

// How long should we wait for the child to cleanly exit after sending
// SIGINT/SIGTERM to the child process before sending SIGKILL?
const CHILD_EXIT_TIMEOUT_MS = 1000

const handleSessionStop = async (signal: NodeJS.Signals | number | null) => {
  if (signal != null && child?.pid) child.kill(signal)
  if (sessionStopHandled) return
  sessionStopHandled = true

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

  try {
    const { eventCliSessionStopped } =
      require('../telemetry/events/session-stopped') as typeof import('../telemetry/events/session-stopped')

    config = config || (await loadConfig(PHASE_DEVELOPMENT_SERVER, dir))

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
      const pagesResult = findPagesDir(dir)
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
    uploadTrace({
      traceUploadUrl,
      mode: 'dev',
      projectDir: dir,
      distDir: config.distDir,
    })
  }

  // ensure we re-enable the terminal cursor before exiting
  // the program, or the cursor could remain hidden
  process.stdout.write('\x1B[?25h')
  process.stdout.write('\n')
  process.exit(0)
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
  dir = getProjectDir(process.env.NEXT_PRIVATE_DEV_DIR || directory)

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

  const port = options.port

  if (isPortIsReserved(port)) {
    printAndExit(getReservedPortExplanation(port), 1)
  }

  // If neither --port nor PORT were specified, it's okay to retry new ports.
  const allowRetry = portSource === 'default'

  // We do not set a default host value here to prevent breaking
  // some set-ups that rely on listening on other interfaces
  const host = options.hostname

  config = await loadConfig(PHASE_DEVELOPMENT_SERVER, dir)

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

  if (options.turbo) {
    process.env.TURBOPACK = '1'
  }

  isTurboSession = !!process.env.TURBOPACK

  const distDir = path.join(dir, config.distDir ?? '.next')
  setGlobal('phase', PHASE_DEVELOPMENT_SERVER)
  setGlobal('distDir', distDir)

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

      if (nodeDebugType) {
        const address = getParsedDebugAddress()
        address.port = address.port + 1
        nodeOptions[nodeDebugType] = formatDebugAddress(address)
      }

      child = fork(startServerPath, {
        stdio: 'inherit',
        env: {
          ...defaultEnv,
          TURBOPACK: process.env.TURBOPACK,
          NEXT_PRIVATE_WORKER: '1',
          NODE_EXTRA_CA_CERTS: startServerOptions.selfSignedCertificate
            ? startServerOptions.selfSignedCertificate.rootCA
            : defaultEnv.NODE_EXTRA_CA_CERTS,
          NODE_OPTIONS: formatNodeOptions(nodeOptions),
        },
      })

      child.on('message', (msg: any) => {
        if (msg && typeof msg === 'object') {
          if (msg.nextWorkerReady) {
            child?.send({ nextWorkerOptions: startServerOptions })
          } else if (msg.nextServerReady && !resolved) {
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
            uploadTrace({
              traceUploadUrl,
              mode: 'dev',
              projectDir: dir,
              distDir: config.distDir,
              sync: true,
            })
          }
          return startServer(startServerOptions)
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
