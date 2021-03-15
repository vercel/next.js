import { loadEnvConfig } from '@next/env'
import Worker from 'jest-worker'
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

export async function shouldLoadWithWebpack5(
  phase: string,
  dir: string
): Promise<{
  enable: boolean
  reason:
    | 'no-config'
    | 'test-mode'
    | 'future-flag'
    | 'no-webpack-config'
    | 'webpack-config'
}> {
  await loadEnvConfig(dir, phase === PHASE_DEVELOPMENT_SERVER, Log)

  const path = await findUp(CONFIG_FILE, {
    cwd: dir,
  })

  if (Number(process.env.NEXT_PRIVATE_TEST_WEBPACK5_MODE) > 0) {
    return {
      enable: true,
      reason: 'test-mode',
    }
  }

  // No `next.config.js`:
  if (!path?.length) {
    return {
      enable: true,
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

  if (userConfig.future?.webpack5 === true) {
    return {
      enable: true,
      reason: 'future-flag',
    }
  }

  if (!userConfig.webpack) {
    return {
      enable: true,
      reason: 'future-flag',
    }
  }

  return {
    enable: false,
    reason: 'webpack-config',
  }
}

export async function loadWebpackHook(phase: string, dir: string) {
  const worker: any = new Worker(__filename, { enableWorkerThreads: false })
  let workerResult
  try {
    workerResult = await worker.shouldLoadWithWebpack5(phase, dir)
  } catch {
    // If this errors, it likely will do so again upon boot, so we just swallow
    // it here.
  } finally {
    worker.end()
  }

  install(workerResult.enable || false)
}
