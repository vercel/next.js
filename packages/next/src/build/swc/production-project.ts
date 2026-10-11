import path from 'path'
import { createDefineEnv } from './index'
import { normalizePath } from '../../lib/normalize-path'
import { getSupportedBrowsers } from '../get-supported-browsers'
import type { NextConfigComplete } from '../../server/config-shared'
import type { ProjectOptions } from './types'

/** Production options shared by ordinary application builds and explicit test graphs. */
export function createProductionProjectOptions({
  dir,
  distDir,
  config,
  buildId,
  encryptionKey,
  previewProps,
  rewrites,
  clientRouterFilters,
  noMangling = false,
}: {
  dir: string
  distDir: string
  config: NextConfigComplete
  buildId: string
  encryptionKey: string
  previewProps: ProjectOptions['previewProps']
  rewrites: Parameters<typeof createDefineEnv>[0]['rewrites']
  clientRouterFilters: Parameters<
    typeof createDefineEnv
  >[0]['clientRouterFilters']
  noMangling?: boolean
}): Omit<ProjectOptions, 'debugBuildPaths'> {
  const dev = false
  const rootPath = config.turbopack?.root || config.outputFileTracingRoot || dir
  const supportedBrowsers = getSupportedBrowsers(dir, dev)
  const currentNodeJsVersion = process.versions.node
  const persistentCaching =
    config.experimental.turbopackFileSystemCacheForBuild || false
  const hasRewrites =
    rewrites.beforeFiles.length > 0 ||
    rewrites.afterFiles.length > 0 ||
    rewrites.fallback.length > 0
  return {
    rootPath,
    projectPath: normalizePath(path.relative(rootPath, dir) || '.'),
    distDir,
    nextConfig: config,
    watch: {
      enable: false,
    },
    dev,
    env: process.env as Record<string, string>,
    defineEnv: createDefineEnv({
      isTurbopack: true,
      clientRouterFilters: clientRouterFilters,
      config,
      dev,
      distDir,
      projectPath: dir,
      fetchCacheKeyPrefix: config.experimental.fetchCacheKeyPrefix,
      hasRewrites,
      // Implemented separately in Turbopack, doesn't have to be passed here.
      middlewareMatchers: undefined,
      rewrites,
    }),
    buildId,
    encryptionKey,
    previewProps,
    browserslistQuery: supportedBrowsers.join(', '),
    noMangling,
    writeRoutesHashesManifest:
      !!process.env.NEXT_TURBOPACK_WRITE_ROUTES_HASHES_MANIFEST,
    currentNodeJsVersion,
    isPersistentCachingEnabled: persistentCaching,
    deferredEntries: config.experimental.deferredEntries,
    nextVersion: process.env.__NEXT_VERSION as string,
  }
}
