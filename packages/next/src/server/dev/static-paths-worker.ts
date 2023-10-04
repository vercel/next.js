import type { NextConfigComplete } from '../config-shared'

import '../require-hook'
import '../node-polyfill-fetch'
import '../node-environment'
import '../../lib/polyfill-promise-with-resolvers'

import {
  buildAppStaticPaths,
  buildStaticPaths,
  collectGenerateParams,
  GenerateParams,
} from '../../build/utils'
import { loadComponents } from '../load-components'
import { setHttpClientAndAgentOptions } from '../setup-http-agent-env'
import { IncrementalCache } from '../lib/incremental-cache'
import * as serverHooks from '../../client/components/hooks-server-context'
import { staticGenerationAsyncStorage } from '../../client/components/static-generation-async-storage.external'

const { AppRouteRouteModule } =
  require('../future/route-modules/app-route/module.compiled') as typeof import('../future/route-modules/app-route/module')

type RuntimeConfig = any

// we call getStaticPaths in a separate process to ensure
// side-effects aren't relied on in dev that will break
// during a production build
export async function loadStaticPaths({
  distDir,
  pathname,
  config,
  httpAgentOptions,
  locales,
  defaultLocale,
  isAppPath,
  page,
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
  locales?: string[]
  defaultLocale?: string
  isAppPath: boolean
  page: string
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
  require('../../shared/lib/runtime-config.external').setConfig(config)
  setHttpClientAndAgentOptions({
    httpAgentOptions,
  })

  const components = await loadComponents({
    distDir,
    // In `pages/`, the page is the same as the pathname.
    page: page || pathname,
    isAppPath,
  })

  if (!components.getStaticPaths && !isAppPath) {
    // we shouldn't get to this point since the worker should
    // only be called for SSG pages with getStaticPaths
    throw new Error(
      `Invariant: failed to load page with getStaticPaths for ${pathname}`
    )
  }

  if (isAppPath) {
    const { routeModule } = components
    const generateParams: GenerateParams =
      routeModule && AppRouteRouteModule.is(routeModule)
        ? [
            {
              config: {
                revalidate: routeModule.userland.revalidate,
                dynamic: routeModule.userland.dynamic,
                dynamicParams: routeModule.userland.dynamicParams,
              },
              generateStaticParams: routeModule.userland.generateStaticParams,
              segmentPath: pathname,
            },
          ]
        : await collectGenerateParams(components.ComponentMod.tree)

    return await buildAppStaticPaths({
      page: pathname,
      generateParams,
      configFileName: config.configFileName,
      distDir,
      requestHeaders,
      incrementalCacheHandlerPath,
      serverHooks,
      staticGenerationAsyncStorage,
      isrFlushToDisk,
      fetchCacheKeyPrefix,
      maxMemoryCacheSize,
    })
  }

  return await buildStaticPaths({
    page: pathname,
    getStaticPaths: components.getStaticPaths,
    configFileName: config.configFileName,
    locales,
    defaultLocale,
  })
}
