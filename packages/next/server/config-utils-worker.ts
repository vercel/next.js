import { loadEnvConfig } from '@next/env'
import findUp from 'next/dist/compiled/find-up'
import { init as initWebpack } from 'next/dist/compiled/webpack/webpack'
import { CONFIG_FILE, PHASE_DEVELOPMENT_SERVER } from '../shared/lib/constants'
import { NextConfig, normalizeConfig } from './config-shared'
import * as Log from '../build/output/log'

let installed: boolean = false

export function install(useWebpack5: boolean) {
  if (installed) {
    return
  }
  installed = true

  initWebpack(useWebpack5)

  // hook the Node.js require so that webpack requires are
  // routed to the bundled and now initialized webpack version
  require('../build/webpack/require-hook')
}

export type CheckReasons =
  | 'test-mode'
  | 'default'
  | 'flag-disabled'
  | 'future-flag'

export type CheckResult = {
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

  if (Number(process.env.NEXT_PRIVATE_TEST_WEBPACK4_MODE) > 0) {
    return {
      enabled: false,
      reason: 'test-mode',
    }
  }

  // Use webpack 5 by default in apps that do not have next.config.js
  if (!path?.length) {
    return {
      enabled: true,
      reason: 'default',
    }
  }

  // Default to webpack 4 for backwards compatibility on boot:
  install(false)

  const userConfigModule = require(path)
  const userConfig: Partial<NextConfig> = normalizeConfig(
    phase,
    userConfigModule.default || userConfigModule
  )

  if (userConfig.future?.webpack5) {
    return {
      enabled: false,
      reason: 'future-flag',
    }
  }
  if (userConfig.webpack5 === false) {
    return {
      enabled: false,
      reason: 'flag-disabled',
    }
  }

  return {
    enabled: true,
    reason: 'default',
  }
}
