import path from 'path'
import { IncrementalCache } from '../../server/lib/incremental-cache'
import { hasNextSupport } from '../../server/ci-info'
import { nodeFs } from '../../server/lib/node-fs-methods'
import { interopDefault } from '../../lib/interop-default'
import { formatDynamicImportPath } from '../../lib/format-dynamic-import-path'
import { cacheHandlerGlobal } from '../../server/use-cache/constants'
import DefaultCacheHandler from '../../server/lib/cache-handlers/default'

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
  cacheMaxMemorySize?: number
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

  if (!cacheHandlerGlobal.__nextCacheHandlers && cacheHandlers) {
    cacheHandlerGlobal.__nextCacheHandlers = {}

    for (const key of Object.keys(cacheHandlers)) {
      if (cacheHandlers[key]) {
        ;(globalThis as any).__nextCacheHandlers[key] = interopDefault(
          await import(formatDynamicImportPath(dir, cacheHandlers[key])).then(
            (mod) => mod.default || mod
          )
        )
      }
    }

    if (!cacheHandlers.default) {
      cacheHandlerGlobal.__nextCacheHandlers.default = DefaultCacheHandler
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
