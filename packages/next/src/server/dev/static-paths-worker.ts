import type { NextConfigComplete } from '../config-shared'

import '../require-hook'
import '../node-environment'

import { reduceAppConfig } from '../../build/utils'
import { collectSegments } from '../../build/segment-config/app/app-segments'
import type { StaticPathsResult } from '../../build/static-paths/types'
import { loadComponents } from '../load-components'
import { setHttpClientAndAgentOptions } from '../setup-http-agent-env'
import type { IncrementalCache } from '../lib/incremental-cache'
import { isAppPageRouteModule } from '../route-modules/checks'
import {
  checkIsRoutePPREnabled,
  type ExperimentalPPRConfig,
} from '../lib/experimental/ppr'
import { InvariantError } from '../../shared/lib/invariant-error'
import { collectRootParamKeys } from '../../build/segment-config/app/collect-root-param-keys'
import { buildAppStaticPaths } from '../../build/static-paths/app'
import { buildPagesStaticPaths } from '../../build/static-paths/pages'
import { createIncrementalCache } from '../../export/helpers/create-incremental-cache'

type RuntimeConfig = {
  pprConfig: ExperimentalPPRConfig | undefined
  configFileName: string
  publicRuntimeConfig: { [key: string]: any }
  serverRuntimeConfig: { [key: string]: any }
  dynamicIO: boolean
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
  cacheHandlers,
  cacheLifeProfiles,
  nextConfigOutput,
  buildId,
  authInterrupts,
  sriEnabled,
}: {
  dir: string
  distDir: string
  pathname: string
  config: RuntimeConfig
  httpAgentOptions: NextConfigComplete['httpAgentOptions']
  locales?: readonly string[]
  defaultLocale?: string
  isAppPath: boolean
  page: string
  isrFlushToDisk?: boolean
  fetchCacheKeyPrefix?: string
  maxMemoryCacheSize?: number
  requestHeaders: IncrementalCache['requestHeaders']
  cacheHandler?: string
  cacheHandlers?: NextConfigComplete['experimental']['cacheHandlers']
  cacheLifeProfiles?: {
    [profile: string]: import('../../server/use-cache/cache-life').CacheLife
  }
  nextConfigOutput: 'standalone' | 'export' | undefined
  buildId: string
  authInterrupts: boolean
  sriEnabled: boolean
}): Promise<Partial<StaticPathsResult>> {
  // this needs to be initialized before loadComponents otherwise
  // "use cache" could be missing it's cache handlers
  await createIncrementalCache({
    dir,
    distDir,
    cacheHandler,
    cacheHandlers,
    requestHeaders,
    fetchCacheKeyPrefix,
    flushToDisk: isrFlushToDisk,
    cacheMaxMemorySize: maxMemoryCacheSize,
  })

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
    isDev: true,
    sriEnabled,
  })

  if (isAppPath) {
    const segments = await collectSegments(components)

    const isRoutePPREnabled =
      isAppPageRouteModule(components.routeModule) &&
      checkIsRoutePPREnabled(config.pprConfig, reduceAppConfig(segments))

    const rootParamKeys = collectRootParamKeys(components)

    return buildAppStaticPaths({
      dir,
      page: pathname,
      dynamicIO: config.dynamicIO,
      segments,
      distDir,
      requestHeaders,
      cacheHandler,
      cacheLifeProfiles,
      isrFlushToDisk,
      fetchCacheKeyPrefix,
      maxMemoryCacheSize,
      ComponentMod: components.ComponentMod,
      nextConfigOutput,
      isRoutePPREnabled,
      buildId,
      authInterrupts,
      rootParamKeys,
    })
  } else if (!components.getStaticPaths) {
    // We shouldn't get to this point since the worker should only be called for
    // SSG pages with getStaticPaths.
    throw new InvariantError(
      `Failed to load page with getStaticPaths for ${pathname}`
    )
  }

  return buildPagesStaticPaths({
    page: pathname,
    getStaticPaths: components.getStaticPaths,
    configFileName: config.configFileName,
    locales,
    defaultLocale,
  })
}
