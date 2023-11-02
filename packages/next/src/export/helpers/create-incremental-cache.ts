import type { NextEnabledDirectories } from '../../server/base-server'

import path from 'path'
import { IncrementalCache } from '../../server/lib/incremental-cache'
import { hasNextSupport } from '../../telemetry/ci-info'
import { nodeFs } from '../../server/lib/node-fs-methods'

export function createIncrementalCache(
  cacheHandler: string | undefined,
  cacheMaxMemorySize: number | undefined,
  fetchCacheKeyPrefix: string | undefined,
  distDir: string,
  dir: string,
  enabledDirectories: NextEnabledDirectories
) {
  // Custom cache handler overrides.
  let CacheHandler: any
  if (cacheHandler) {
    CacheHandler = require(path.isAbsolute(cacheHandler)
      ? cacheHandler
      : path.join(dir, cacheHandler))
    CacheHandler = CacheHandler.default || CacheHandler
  }

  const incrementalCache = new IncrementalCache({
    dev: false,
    requestHeaders: {},
    flushToDisk: true,
    fetchCache: true,
    maxMemoryCacheSize: cacheMaxMemorySize,
    fetchCacheKeyPrefix,
    getPrerenderManifest: () => ({
      version: 4,
      routes: {},
      dynamicRoutes: {},
      preview: {
        previewModeEncryptionKey: '',
        previewModeId: '',
        previewModeSigningKey: '',
      },
      notFoundRoutes: [],
    }),
    fs: nodeFs,
    pagesDir: enabledDirectories.pages,
    appDir: enabledDirectories.app,
    serverDistDir: path.join(distDir, 'server'),
    CurCacheHandler: CacheHandler,
    minimalMode: hasNextSupport,
  })

  ;(globalThis as any).__incrementalCache = incrementalCache

  return incrementalCache
}
