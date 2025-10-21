import type { NextConfigComplete } from '../config-shared'

import '../require-hook'
import '../node-environment'

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
import type { AppPageRouteModule } from '../route-modules/app-page/module'
import type { AppRouteRouteModule } from '../route-modules/app-route/module'

type RuntimeConfig = {
  pprConfig: ExperimentalPPRConfig | undefined
  configFileName: string
  cacheComponents: boolean
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
  cacheMaxMemorySize,
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
  cacheMaxMemorySize: number
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
}): Promise<StaticPathsResult> {
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
    cacheMaxMemorySize,
  })

  // update work memory runtime-config
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
    needsManifestsForLegacyReasons: true,
  })

  if (isAppPath) {
    const routeModule = components.routeModule
    const segments = await collectSegments(
      // We know this is an app page or app route module because we checked
      // above that the page type is 'app'.
      routeModule as AppPageRouteModule | AppRouteRouteModule
    )

    const isRoutePPREnabled =
      isAppPageRouteModule(routeModule) &&
      checkIsRoutePPREnabled(config.pprConfig)

    const rootParamKeys = collectRootParamKeys(routeModule)

    return buildAppStaticPaths({
      dir,
      page: pathname,
      cacheComponents: config.cacheComponents,
      segments,
      distDir,
      requestHeaders,
      cacheHandler,
      cacheLifeProfiles,
      isrFlushToDisk,
      fetchCacheKeyPrefix,
      cacheMaxMemorySize,
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
