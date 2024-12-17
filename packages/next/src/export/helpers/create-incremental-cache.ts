import path from 'path'
import { IncrementalCache } from '../../server/lib/incremental-cache'
import { hasNextSupport } from '../../server/ci-info'
import { nodeFs } from '../../server/lib/node-fs-methods'
import { interopDefault } from '../../lib/interop-default'
import { formatDynamicImportPath } from '../../lib/format-dynamic-import-path'

export async function createIncrementalCache({
  cacheHandler,
  dynamicIO,
  cacheMaxMemorySize,
  fetchCacheKeyPrefix,
  distDir,
  dir,
  flushToDisk,
  cacheHandlers,
}: {
  dynamicIO: boolean
  cacheHandler?: string
  cacheMaxMemorySize?: number
  fetchCacheKeyPrefix?: string
  distDir: string
  dir: string
  flushToDisk?: boolean
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

  if (!(globalThis as any).__nextCacheHandlers && cacheHandlers) {
    ;(globalThis as any).__nextCacheHandlers = {}

    for (const key of Object.keys(cacheHandlers)) {
      if (cacheHandlers[key]) {
        ;(globalThis as any).__nextCacheHandlers[key] = interopDefault(
          await import(formatDynamicImportPath(dir, cacheHandlers[key])).then(
            (mod) => mod.default || mod
          )
        )
      }
    }
  }

  const incrementalCache = new IncrementalCache({
    dev: false,
    requestHeaders: {},
    flushToDisk,
    dynamicIO,
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
