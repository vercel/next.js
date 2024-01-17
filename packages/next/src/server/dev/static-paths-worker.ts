import type { NextConfigComplete } from '../config-shared'

import '../require-hook'
import '../node-environment'

import {
  buildAppStaticPaths,
  buildStaticPaths,
  collectGenerateParams,
} from '../../build/utils'
import type { GenerateParamsResults } from '../../build/utils'
import { loadComponents } from '../load-components'
import { setHttpClientAndAgentOptions } from '../setup-http-agent-env'
import type { IncrementalCache } from '../lib/incremental-cache'
import { isAppRouteRouteModule } from '../future/route-modules/checks'

type RuntimeConfig = {
  configFileName: string
  publicRuntimeConfig: { [key: string]: any }
  serverRuntimeConfig: { [key: string]: any }
}

// we call getStaticPaths in a separate process to ensure
// side-effects aren't relied on in dev that will break
// during a production build
export async function loadStaticPaths({
  dir,
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
  cacheHandler,
  ppr,
}: {
  dir: string
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
  cacheHandler?: string
  ppr: boolean
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
    const generateParams: GenerateParamsResults =
      routeModule && isAppRouteRouteModule(routeModule)
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
      dir,
      page: pathname,
      generateParams,
      configFileName: config.configFileName,
      distDir,
      requestHeaders,
      cacheHandler,
      isrFlushToDisk,
      fetchCacheKeyPrefix,
      maxMemoryCacheSize,
      ppr,
      ComponentMod: components.ComponentMod,
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
