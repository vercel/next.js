import path from 'path'
import { Worker } from 'jest-worker'
import * as Log from '../../build/output/log'
import { CheckReasons, CheckResult } from './config-utils-worker'
import { install, shouldLoadWithWebpack5 } from './config-utils-worker'
import { PHASE_PRODUCTION_SERVER } from '../lib/constants'

export { install, shouldLoadWithWebpack5 }

function reasonMessage(reason: CheckReasons) {
  switch (reason) {
    case 'future-flag':
      return 'future.webpack5 option enabled'
    case 'no-future-flag':
      return 'future.webpack5 option disabled'
    case 'no-config':
      return 'no next.config.js'
    case 'webpack-config':
      return 'custom webpack configuration in next.config.js'
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
  const worker: any = new Worker(
    path.resolve(__dirname, './config-utils-worker.js'),
    {
      enableWorkerThreads: false,
      numWorkers: 1,
    }
  )
  try {
    const result: CheckResult = await worker.shouldLoadWithWebpack5(phase, dir)
    // Don't log which webpack version is being used when booting production server as it's not used after build
    if (phase !== PHASE_PRODUCTION_SERVER) {
      Log.info(
        `Using webpack ${result.enabled ? '5' : '4'}. Reason: ${reasonMessage(
          result.reason
        )} https://nextjs.org/docs/messages/webpack5`
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
