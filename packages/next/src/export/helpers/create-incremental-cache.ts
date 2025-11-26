import path from 'path'
import { IncrementalCache } from '../../server/lib/incremental-cache'
import { hasNextSupport } from '../../server/ci-info'
import { nodeFs } from '../../server/lib/node-fs-methods'
import { interopDefault } from '../../lib/interop-default'
import { formatDynamicImportPath } from '../../lib/format-dynamic-import-path'
import {
  initializeCacheHandlers,
  setCacheHandler,
} from '../../server/use-cache/handlers'

export async function createIncrementalCache({
  cacheHandler,
  cacheMaxMemorySize,
  fetchCacheKeyPrefix,
  distDir,
  dir,
  flushToDisk,
  cacheHandlers,
  requestHeaders,
}: {
  cacheHandler?: string
  cacheMaxMemorySize: number
  fetchCacheKeyPrefix?: string
  distDir: string
  dir: string
  flushToDisk?: boolean
  requestHeaders?: Record<string, string | string[] | undefined>
  cacheHandlers?: Record<string, string | undefined>
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

  if (cacheHandlers && initializeCacheHandlers(cacheMaxMemorySize)) {
    for (const [kind, handler] of Object.entries(cacheHandlers)) {
      if (!handler) continue

      setCacheHandler(
        kind,
        interopDefault(
          await import(formatDynamicImportPath(dir, handler)).then(
            (mod) => mod.default || mod
          )
        )
      )
    }
  }

  const incrementalCache = new IncrementalCache({
    dev: false,
    requestHeaders: requestHeaders || {},
    flushToDisk,
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
    serverDistDir: path.join(distDir, 'server'),
    CurCacheHandler: CacheHandler,
    minimalMode: hasNextSupport,
  })

  ;(globalThis as any).__incrementalCache = incrementalCache

  return incrementalCache
}
