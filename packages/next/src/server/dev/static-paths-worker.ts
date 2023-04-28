import type { NextConfigComplete } from '../config-shared'
import type { AppRouteUserlandModule } from '../future/route-modules/app-route/module'

import '../require-hook'
import '../node-polyfill-fetch'
import '../node-environment'

import { collectGenerateParams, GenerateParams } from '../../build/utils'
import { loadComponents } from '../load-components'
import { setHttpClientAndAgentOptions } from '../config'
import { IncrementalCache } from '../lib/incremental-cache'
import * as serverHooks from '../../client/components/hooks-server-context'
import { staticGenerationAsyncStorage } from '../../client/components/static-generation-async-storage'
import { getStaticPaths } from '../../build/future/is-static/pages'
import { generateStaticParams } from '../../build/future/is-static/app-page'

type RuntimeConfig = any

// we call getStaticPaths in a separate process to ensure
// side-effects aren't relied on in dev that will break
// during a production build
export async function loadStaticPaths({
  distDir,
  pathname,
  config,
  httpAgentOptions,
  enableUndici,
  locales,
  defaultLocale,
  isAppPath,
  originalAppPath,
  isrFlushToDisk,
  fetchCacheKeyPrefix,
  maxMemoryCacheSize,
  requestHeaders,
  incrementalCacheHandlerPath,
}: {
  distDir: string
  pathname: string
  config: RuntimeConfig
  httpAgentOptions: NextConfigComplete['httpAgentOptions']
  enableUndici: NextConfigComplete['enableUndici']
  locales?: string[]
  defaultLocale?: string
  isAppPath?: boolean
  originalAppPath?: string
  isrFlushToDisk?: boolean
  fetchCacheKeyPrefix?: string
  maxMemoryCacheSize?: number
  requestHeaders: IncrementalCache['requestHeaders']
  incrementalCacheHandlerPath?: string
}): Promise<{
  paths?: string[]
  encodedPaths?: string[]
  fallback?: boolean | 'blocking'
}> {
  // update work memory runtime-config
  require('../../shared/lib/runtime-config').setConfig(config)
  setHttpClientAndAgentOptions({
    httpAgentOptions,
    experimental: { enableUndici },
  })

  const components = await loadComponents({
    distDir,
    pathname: originalAppPath || pathname,
    hasServerComponents: false,
    isAppPath: !!isAppPath,
  })

  if (!components.getStaticPaths && !isAppPath) {
    // we shouldn't get to this point since the worker should
    // only be called for SSG pages with getStaticPaths
    throw new Error(
      `Invariant: failed to load page with getStaticPaths for ${pathname}`
    )
  }

  if (isAppPath) {
    const userland: AppRouteUserlandModule | undefined =
      components.ComponentMod.routeModule?.userland
    const generateParams: GenerateParams = userland
      ? [
          {
            config: {
              revalidate: userland.revalidate,
              dynamic: userland.dynamic,
              dynamicParams: userland.dynamicParams,
            },
            generateStaticParams: userland.generateStaticParams,
            segmentPath: pathname,
          },
        ]
      : await collectGenerateParams(components.ComponentMod.tree)

    return await generateStaticParams({
      page: pathname,
      distDir,
      configFileName: config.configFileName,
      generateParams,
      isrFlushToDisk,
      incrementalCacheHandlerPath,
      requestHeaders,
      maxMemoryCacheSize,
      fetchCacheKeyPrefix,
      staticGenerationAsyncStorage,
      serverHooks,
    })
  }

  if (!components.getStaticPaths) {
    throw new Error(
      `Invariant: attempted to buildStaticPaths without "getStaticPaths": ${pathname}`
    )
  }

  return await getStaticPaths({
    page: pathname,
    locales,
    defaultLocale,
    getStaticPaths: components.getStaticPaths,
    configFileName: config.configFileName,
  })
}
