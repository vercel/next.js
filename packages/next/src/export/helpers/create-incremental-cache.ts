import path from 'path'
import fs from 'fs'
import { IncrementalCache } from '../../server/lib/incremental-cache'
import { hasNextSupport } from '../../telemetry/ci-info'

export function createIncrementalCache(
  incrementalCacheHandlerPath: string | undefined,
  isrMemoryCacheSize: number | undefined,
  fetchCacheKeyPrefix: string | undefined,
  distDir: string
) {
  // Custom cache handler overrides.
  let CacheHandler: any
  if (incrementalCacheHandlerPath) {
    CacheHandler = require(incrementalCacheHandlerPath)
    CacheHandler = CacheHandler.default || CacheHandler
  }

  const incrementalCache = new IncrementalCache({
    dev: false,
    requestHeaders: {},
    flushToDisk: true,
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
    fs: {
      readFile: (f) => fs.promises.readFile(f),
      readFileSync: (f) => fs.readFileSync(f),
      writeFile: (f, d) => fs.promises.writeFile(f, d),
      mkdir: (dir) => fs.promises.mkdir(dir, { recursive: true }),
      stat: (f) => fs.promises.stat(f),
    },
    serverDistDir: path.join(distDir, 'server'),
    CurCacheHandler: CacheHandler,
    minimalMode: hasNextSupport,
  })

  ;(globalThis as any).__incrementalCache = incrementalCache

  return incrementalCache
}
