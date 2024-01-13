import type { NextEnabledDirectories } from '../../server/base-server'

import path from 'path'
import { IncrementalCache } from '../../server/lib/incremental-cache'
import { hasNextSupport } from '../../telemetry/ci-info'
import { nodeFs } from '../../server/lib/node-fs-methods'
import { interopDefault } from '../../lib/interop-default'
import { formatDynamicImportPath } from '../../lib/format-dynamic-import-path'

export async function createIncrementalCache({
  incrementalCacheHandlerPath,
  isrMemoryCacheSize,
  fetchCacheKeyPrefix,
  distDir,
  dir,
  enabledDirectories,
  experimental,
  flushToDisk,
}: {
  incrementalCacheHandlerPath?: string
  isrMemoryCacheSize?: number
  fetchCacheKeyPrefix?: string
  distDir: string
  dir: string
  enabledDirectories: NextEnabledDirectories
  experimental: { ppr: boolean }
  flushToDisk?: boolean
}) {
  // Custom cache handler overrides.
  let CacheHandler: any
  if (incrementalCacheHandlerPath) {
    CacheHandler = interopDefault(
      await import(
        formatDynamicImportPath(dir, incrementalCacheHandlerPath)
      ).then((mod) => mod.default || mod)
    )
  }

  const incrementalCache = new IncrementalCache({
    dev: false,
    requestHeaders: {},
    flushToDisk,
    fetchCache: true,
    maxMemoryCacheSize: isrMemoryCacheSize,
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
