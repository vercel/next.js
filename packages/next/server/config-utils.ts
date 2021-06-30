import path from 'path'
import { Worker } from 'jest-worker'
import * as Log from '../build/output/log'
import { CheckReasons, CheckResult } from './config-utils-worker'
import { install, shouldLoadWithWebpack5 } from './config-utils-worker'
import { PHASE_PRODUCTION_SERVER } from '../shared/lib/constants'

export { install, shouldLoadWithWebpack5 }

function reasonMessage(reason: CheckReasons) {
  switch (reason) {
    case 'default':
      return 'Enabled by default'
    case 'flag-disabled':
      return 'webpack5 flag is set to false in next.config.js'
    case 'test-mode':
      return 'internal test mode'
    default:
      return ''
  }
}

export async function loadWebpackHook(phase: string, dir: string) {
  let useWebpack5 = true
  let usesRemovedFlag = false
  const worker = new Worker(
    path.resolve(__dirname, './config-utils-worker.js'),
    {
      enableWorkerThreads: false,
      numWorkers: 1,
      forkOptions: {
        env: {
          ...process.env,
          NODE_OPTIONS: '',
        },
      },
    }
  ) as Worker & {
    shouldLoadWithWebpack5: typeof import('./config-utils-worker').shouldLoadWithWebpack5
  }
  try {
    const result: CheckResult = await worker.shouldLoadWithWebpack5(phase, dir)
    if (result.reason === 'future-flag') {
      usesRemovedFlag = true
    } else {
      if (phase !== PHASE_PRODUCTION_SERVER) {
        Log.info(
          `Using webpack ${result.enabled ? '5' : '4'}. Reason: ${reasonMessage(
            result.reason
          )} https://nextjs.org/docs/messages/webpack5`
        )
      }
    }

    useWebpack5 = Boolean(result.enabled)
  } catch {
    // If this errors, it likely will do so again upon boot, so we just swallow
    // it here.
  } finally {
    worker.end()
  }

  if (usesRemovedFlag) {
    throw new Error(
      '`future.webpack5` in `next.config.js` has moved to the top level `webpack5` flag https://nextjs.org/docs/messages/future-webpack5-moved-to-webpack5'
    )
  }

  install(useWebpack5)
}
