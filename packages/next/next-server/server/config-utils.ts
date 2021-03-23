import { loadEnvConfig } from '@next/env'
import { Worker } from 'jest-worker'
import findUp from 'next/dist/compiled/find-up'
import { init as initWebpack } from 'next/dist/compiled/webpack/webpack'
import { CONFIG_FILE, PHASE_DEVELOPMENT_SERVER } from '../lib/constants'
import { NextConfig, normalizeConfig } from './config-shared'
import * as Log from '../../build/output/log'

let installed: boolean = false

export function install(useWebpack5: boolean) {
  if (installed) {
    return
  }
  installed = true

  initWebpack(useWebpack5)

  // hook the Node.js require so that webpack requires are
  // routed to the bundled and now initialized webpack version
  require('../../build/webpack/require-hook')
}

type CheckReasons =
  | 'test-mode'
  | 'no-config'
  | 'future-flag'
  | 'no-webpack-config'
  | 'webpack-config'

type CheckResult = {
  enabled: boolean
  reason: CheckReasons
}

export async function shouldLoadWithWebpack5(
  phase: string,
  dir: string
): Promise<CheckResult> {
  await loadEnvConfig(dir, phase === PHASE_DEVELOPMENT_SERVER, Log)

  const path = await findUp(CONFIG_FILE, {
    cwd: dir,
  })

  if (Number(process.env.NEXT_PRIVATE_TEST_WEBPACK5_MODE) > 0) {
    return {
      enabled: true,
      reason: 'test-mode',
    }
  }

  // No `next.config.js`:
  if (!path?.length) {
    // Use webpack 5 by default in new apps:
    return {
      enabled: true,
      reason: 'no-config',
    }
  }

  // Default to webpack 4 for backwards compatibility on boot:
  install(false)

  const userConfigModule = require(path)
  const userConfig: Partial<NextConfig> = normalizeConfig(
    phase,
    userConfigModule.default || userConfigModule
  )

  // Opted-in manually
  if (userConfig.future?.webpack5 === true) {
    return {
      enabled: true,
      reason: 'future-flag',
    }
  }

  // The user isn't configuring webpack
  if (!userConfig.webpack) {
    return {
      enabled: true,
      reason: 'no-webpack-config',
    }
  }

  return {
    enabled: false,
    reason: 'webpack-config',
  }
}

function reasonMessage(reason: CheckReasons) {
  switch (reason) {
    case 'future-flag':
      return 'future.webpack5 option enabled'
    case 'no-config':
      return 'no next.config.js'
    case 'no-webpack-config':
      return 'no custom webpack configuration in next.config.js'
    case 'test-mode':
      return 'internal test mode'
    default:
      return ''
  }
}

export async function loadWebpackHook(phase: string, dir: string) {
  let useWebpack5 = false
  const worker: any = new Worker(__filename, { enableWorkerThreads: false })
  try {
    const result: CheckResult = await worker.shouldLoadWithWebpack5(phase, dir)
    if (result.enabled) {
      Log.info(`Using webpack 5. Reason: ${reasonMessage(result.reason)}`)
    } else {
      Log.info(
        'Using webpack 4. Reason: the next.config.js has custom webpack configuration',
        reasonMessage(result.reason)
      )
    }
    useWebpack5 = Boolean(result.enabled)
  } catch {
    // If this errors, it likely will do so again upon boot, so we just swallow
    // it here.
  } finally {
    worker.end()
  }

  install(useWebpack5)
}
