import { posix } from 'path'
import fs from 'fs'
import {
  type CacheHandler,
  IncrementalCache,
} from '../../server/lib/incremental-cache'
import { interopDefault } from '../../lib/interop-default'
import { NextConfigComplete } from '../../server/config-shared'

type IncrementalCacheOptions = {
  distDir: string
  incrementalCacheHandlerPath?: string
  fetchCacheKeyPrefix?: string
  isrMemoryCacheSize?: NextConfigComplete['experimental']['isrMemoryCacheSize']
}

export function getIncrementalCache({
  distDir,
  fetchCacheKeyPrefix,
  isrMemoryCacheSize,
  incrementalCacheHandlerPath,
}: IncrementalCacheOptions) {
  // Load the cache handler from configuration if it's provided.
  let CurCacheHandler: typeof CacheHandler | undefined
  if (incrementalCacheHandlerPath) {
    CurCacheHandler = interopDefault(require(incrementalCacheHandlerPath))
  }

  // Create the incremental cache instance.
  return new IncrementalCache({
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
    serverDistDir: posix.join(distDir, 'server'),
    CurCacheHandler,
  })
}
