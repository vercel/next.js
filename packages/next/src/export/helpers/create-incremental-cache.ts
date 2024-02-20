import type { NextEnabledDirectories } from '../../server/base-server'

import path from 'path'
import { IncrementalCache } from '../../server/lib/incremental-cache'
import { hasNextSupport } from '../../telemetry/ci-info'
import { nodeFs } from '../../server/lib/node-fs-methods'
import { interopDefault } from '../../lib/interop-default'
import { formatDynamicImportPath } from '../../lib/format-dynamic-import-path'

export async function createIncrementalCache({
  cacheHandler,
  cacheMaxMemorySize,
  fetchCacheKeyPrefix,
  distDir,
  dir,
  enabledDirectories,
  experimental,
  flushToDisk,
}: {
  cacheHandler?: string
  cacheMaxMemorySize?: number
  fetchCacheKeyPrefix?: string
  distDir: string
  dir: string
  enabledDirectories: NextEnabledDirectories
  experimental: { ppr: boolean }
  flushToDisk?: boolean
}) {
  // Custom cache handler overrides.
  let CacheHandler: any
  if (cacheHandler) {
    CacheHandler = interopDefault(
      await import(formatDynamicImportPath(dir, cacheHandler)).then(
        (mod) => mod.default || mod
      )
    )
  }

  const incrementalCache = new IncrementalCache({
    dev: false,
    requestHeaders: {},
    flushToDisk,
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
    experimental,
  })

  ;(globalThis as any).__incrementalCache = incrementalCache

  return incrementalCache
}
