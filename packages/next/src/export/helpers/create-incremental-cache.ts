import path from 'path'
import { IncrementalCache } from '../../server/lib/incremental-cache'
import { hasNextSupport } from '../../server/ci-info'
import { nodeFs } from '../../server/lib/node-fs-methods'
import { interopDefault } from '../../lib/interop-default'
import { formatDynamicImportPath } from '../../lib/format-dynamic-import-path'
import {
  getCacheHandler,
  initializeCacheHandlers,
  setCacheHandler,
} from '../../server/use-cache/handlers'
import type { CacheHandler } from '../../server/lib/cache-handlers/types'
import { findCacheHandlerByAlias } from '../../server/lib/cache-handlers/utils'

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

  if (cacheHandlers && initializeCacheHandlers()) {
    const cacheHandlersByPath = new Map<string, CacheHandler>()
    for (const [kind, handler] of Object.entries(cacheHandlers)) {
      if (!handler) continue

      let handlerInstance = getCacheHandler(handler)
      const handlerPath = findCacheHandlerByAlias(
        handler,
        cacheHandlers,
        (alias) => {
          if (alias) {
            handlerInstance = getCacheHandler(alias)
          }
          return !!handlerInstance
        }
      )

      if (!handlerInstance && handlerPath) {
        if (cacheHandlersByPath.has(handlerPath)) {
          handlerInstance = cacheHandlersByPath.get(handlerPath)!
        } else {
          handlerInstance = interopDefault(
            await import(formatDynamicImportPath(dir, handlerPath)).then(
              (mod) => mod.default || mod
            )
          )
          cacheHandlersByPath.set(handlerPath, handlerInstance!)
        }
      }

      setCacheHandler(kind, handlerInstance!)
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
