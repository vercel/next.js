import path from 'path'
import { Worker } from 'jest-worker'
import * as Log from '../build/output/log'
import { CheckResult } from './config-utils-worker'
import { install, shouldLoadWithWebpack5 } from './config-utils-worker'
import { PHASE_PRODUCTION_SERVER } from '../shared/lib/constants'
import { getNodeOptionsWithoutInspect } from './lib/utils'

export { install, shouldLoadWithWebpack5 }

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
          NODE_OPTIONS: getNodeOptionsWithoutInspect(),
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
      // Only when webpack 4 is used this message is shown
      // TODO: Remove when webpack 4 is no longer supported
      if (phase !== PHASE_PRODUCTION_SERVER && !result.enabled) {
        Log.info(
          `Using webpack 4 in Next.js is deprecated. Please upgrade to using webpack 5: https://nextjs.org/docs/messages/webpack5`
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
