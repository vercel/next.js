import type { NextConfigComplete } from '../../config-shared'

import { Worker } from 'next/dist/compiled/jest-worker'
import { getNodeOptionsWithoutInspect } from '../utils'
import { FallbackMode } from '../../base-server'
import { withCoalescedInvoke } from '../../../lib/coalesced-function'
import * as Log from '../../../build/output/log'

export async function getStaticPaths({
  staticPathsCache,
  originalAppPath,
  nextConfig,
  distDir,
  pathname,
}: {
  pathname: string
  distDir: string
  nextConfig: NextConfigComplete
  originalAppPath?: string
  staticPathsCache: Map<
    string,
    {
      paths: string[]
      fallback: FallbackMode
    }
  >
}) {
  const isAppPath = Boolean(originalAppPath)
  // we lazy load the staticPaths to prevent the user
  // from waiting on them for the page to load in dev mode

  const __getStaticPaths = async () => {
    const {
      configFileName,
      publicRuntimeConfig,
      serverRuntimeConfig,
      httpAgentOptions,
    } = nextConfig
    const { locales, defaultLocale } = nextConfig.i18n || {}

    const staticPathsWorker = new Worker(
      require.resolve('../../dev/static-paths-worker'),
      {
        maxRetries: 1,
        // For dev server, it's not necessary to spin up too many workers as long as you are not doing a load test.
        // This helps reusing the memory a lot.
        numWorkers: 1,
        enableWorkerThreads: nextConfig.experimental.workerThreads,
        forkOptions: {
          env: {
            ...process.env,
            // discard --inspect/--inspect-brk flags from process.env.NODE_OPTIONS. Otherwise multiple Node.js debuggers
            // would be started if user launch Next.js in debugging mode. The number of debuggers is linked to
            // the number of workers Next.js tries to launch. The only worker users are interested in debugging
            // is the main Next.js one
            NODE_OPTIONS: getNodeOptionsWithoutInspect(),
          },
        },
      }
    ) as Worker & {
      loadStaticPaths: typeof import('../../dev/static-paths-worker').loadStaticPaths
    }

    staticPathsWorker.getStdout().pipe(process.stdout)
    staticPathsWorker.getStderr().pipe(process.stderr)

    try {
      const pathsResult = await staticPathsWorker.loadStaticPaths({
        distDir: distDir,
        pathname,
        config: {
          configFileName,
          publicRuntimeConfig,
          serverRuntimeConfig,
        },
        httpAgentOptions,
        locales,
        defaultLocale,
        originalAppPath,
        isAppPath,
        requestHeaders: {},
        incrementalCacheHandlerPath:
          nextConfig.experimental.incrementalCacheHandlerPath,
        fetchCacheKeyPrefix: nextConfig.experimental.fetchCacheKeyPrefix,
        isrFlushToDisk: nextConfig.experimental.isrFlushToDisk,
        maxMemoryCacheSize: nextConfig.experimental.isrMemoryCacheSize,
      })
      return pathsResult
    } finally {
      // we don't re-use workers so destroy the used one
      staticPathsWorker.end()
    }
  }
  const result = staticPathsCache.get(pathname)

  const nextInvoke = withCoalescedInvoke(__getStaticPaths)(
    `staticPaths-${pathname}`,
    []
  )
    .then((res) => {
      const { paths: staticPaths = [], fallback } = res.value
      if (!isAppPath && nextConfig.output === 'export') {
        if (fallback === 'blocking') {
          throw new Error(
            'getStaticPaths with "fallback: blocking" cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export'
          )
        } else if (fallback === true) {
          throw new Error(
            'getStaticPaths with "fallback: true" cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export'
          )
        }
      }
      const value: {
        paths: string[]
        fallback: FallbackMode
      } = {
        paths: staticPaths,
        fallback:
          fallback === 'blocking'
            ? 'blocking'
            : fallback === true
            ? 'static'
            : fallback,
      }
      staticPathsCache.set(pathname, value)
      return value
    })
    .catch((err: any) => {
      staticPathsCache.delete(pathname)
      if (!result) throw err
      Log.error(`Failed to generate static paths for ${pathname}:`)
      console.error(err)
    })

  if (result) {
    return result
  }
  return nextInvoke as NonNullable<typeof result>
}
