import type { IncomingHttpHeaders } from 'http'
import { isAbsolute, join } from 'path'
import type { CompiledTestRequestContext } from '../contracts'
import type { PrerenderManifest } from '../../../build'
import type { __ApiPreviewProps } from '../../../server/api-utils'
import { IncrementalCache } from '../../../server/lib/incremental-cache'
import {
  createMemoryCache,
  type IncrementalCacheState,
} from '../../../server/lib/incremental-cache/memory-cache.external'
import { nodeFs } from '../../../server/lib/node-fs-methods'
import { loadManifest } from '../../../server/load-manifest.external'
import {
  getCacheHandlers,
  initializeCacheHandlers,
} from '../../../server/use-cache/handlers'

function loadRequestManifest<T extends object>(path: string, kind: string) {
  try {
    return loadManifest<T>(path)
  } catch {
    // JSON parse errors may quote secret-bearing preview manifest contents.
    throw new Error(`Unable to load compiled ${kind} manifest at ${path}.`)
  }
}

export interface CompiledFileCacheOptions {
  cacheScope: { type: 'file'; directory: string }
  previewPropsPath: string
  prerenderManifestPath: string
}

export interface CompiledFileCache {
  createIncrementalCache(headers: IncomingHttpHeaders): IncrementalCache
  dispose(): Promise<void>
}

// These are the globals actually assigned by initializeCacheHandlers. The
// platform handlers and custom registration promise belong to the AppPage
// runtime, not to a file lease, and are never replaced here.
const fileHandlerSymbols = [
  '@next/cache-handlers-map',
  '@next/cache-handlers-set',
  '@next/cache-handlers-built-in',
  '@next/cache-handlers-private',
  '@next/cache-handlers-dev-fronts',
  '@next/cache-handlers-dev-tiered',
  '@next/cache-handlers-memory-disabled',
].map((name) => Symbol.for(name))

function sameDescriptor(
  actual: PropertyDescriptor | undefined,
  expected: PropertyDescriptor | undefined
) {
  if (!actual || !expected) return actual === expected
  return (
    actual.configurable === expected.configurable &&
    actual.enumerable === expected.enumerable &&
    actual.writable === expected.writable &&
    Object.is(actual.value, expected.value) &&
    actual.get === expected.get &&
    actual.set === expected.set
  )
}

/** Serial file leases inside one real shared AppPage execution realm. */
export function createCompiledFileCacheRealm() {
  let active = false
  let disposed = false
  const directories = new Set<string>()
  return {
    acquire(directory: string, maxMemoryCacheSize: number) {
      if (disposed || active) {
        throw new Error(
          'A compiled cache realm requires a released file lease.'
        )
      }
      if (directories.has(directory)) {
        throw new Error(
          'A compiled cache realm requires a new file cache directory.'
        )
      }
      if (
        Reflect.get(globalThis, Symbol.for('@next/cache-handlers')) !==
        undefined
      ) {
        throw new Error(
          'Compiled request rendering does not support platform cache handlers.'
        )
      }
      if (
        fileHandlerSymbols.some(
          (key) => Reflect.get(globalThis, key) !== undefined
        )
      ) {
        throw new Error(
          'A compiled file cache requires a fresh execution realm.'
        )
      }
      const state: IncrementalCacheState = {
        memoryCache:
          maxMemoryCacheSize > 0
            ? createMemoryCache(maxMemoryCacheSize)
            : undefined,
        tagsManifest: new Map(),
        cacheControls: new Map(),
      }
      const before = fileHandlerSymbols.map((key) =>
        Object.getOwnPropertyDescriptor(globalThis, key)
      )
      initializeCacheHandlers(maxMemoryCacheSize, state.tagsManifest)
      const owned = fileHandlerSymbols.map((key) =>
        Object.getOwnPropertyDescriptor(globalThis, key)
      )
      active = true
      directories.add(directory)
      let released = false
      return {
        state,
        release() {
          if (released) return
          // Validate the entire lease before restoring anything. A replaced
          // descriptor is an ownership failure, never permission to erase it.
          for (let index = 0; index < fileHandlerSymbols.length; index++) {
            if (
              !sameDescriptor(
                Object.getOwnPropertyDescriptor(
                  globalThis,
                  fileHandlerSymbols[index]
                ),
                owned[index]
              )
            ) {
              disposed = true
              throw new Error(
                'Compiled file cache handler ownership changed before release.'
              )
            }
          }
          for (let index = 0; index < fileHandlerSymbols.length; index++) {
            const key = fileHandlerSymbols[index]
            const descriptor = before[index]
            if (descriptor) Object.defineProperty(globalThis, key, descriptor)
            else if (!Reflect.deleteProperty(globalThis, key)) {
              disposed = true
              throw new Error(
                'Unable to release compiled file cache handler state.'
              )
            }
          }
          released = true
          active = false
        },
      }
    },
    dispose() {
      if (active) {
        throw new Error(
          'Cannot close a compiled cache realm with an active file lease.'
        )
      }
      disposed = true
    },
  }
}

export type CompiledFileCacheRealm = ReturnType<
  typeof createCompiledFileCacheRealm
>

/**
 * Initialize real default caches for one file. Direct isolated callers require
 * a fresh process and retain their existing disposal behavior. A shared worker
 * may supply its owned serial realm; it releases only after request cleanup.
 * The host owns disk directories until the actual worker has exited.
 */
export function createCompiledFileCache(
  metadata: CompiledTestRequestContext | undefined,
  options: CompiledFileCacheOptions,
  realm?: CompiledFileCacheRealm
): CompiledFileCache {
  if (!metadata?.incrementalCache) {
    throw new Error(
      'Compiled request rendering requires resolved cache metadata.'
    )
  }
  if (
    options.cacheScope?.type !== 'file' ||
    !isAbsolute(options.cacheScope.directory)
  ) {
    throw new Error(
      'Compiled request rendering requires an explicit file cache lease.'
    )
  }
  if (
    !options.previewPropsPath ||
    !options.prerenderManifestPath ||
    !isAbsolute(options.previewPropsPath) ||
    !isAbsolute(options.prerenderManifestPath)
  ) {
    throw new Error(
      'Compiled request rendering requires emitted preview and prerender manifests.'
    )
  }
  if (metadata.mode !== 'development' && metadata.mode !== 'production') {
    throw new Error(
      'Compiled request rendering requires resolved compiler mode.'
    )
  }
  const config = metadata.incrementalCache
  if (config.customHandlersConfigured) {
    throw new Error(
      'Compiled request rendering does not support custom cache handlers.'
    )
  }
  if (
    Reflect.get(globalThis, Symbol.for('@next/cache-handlers')) !== undefined
  ) {
    throw new Error(
      'Compiled request rendering does not support platform cache handlers.'
    )
  }

  // Read actual immutable artifacts before initializing realm-global handlers.
  const previewProps = loadRequestManifest<__ApiPreviewProps>(
    options.previewPropsPath,
    'preview'
  )
  const prerenderManifest = loadRequestManifest<PrerenderManifest>(
    options.prerenderManifestPath,
    'prerender'
  )
  if (
    !previewProps ||
    typeof previewProps !== 'object' ||
    ['previewModeId', 'previewModeSigningKey', 'previewModeEncryptionKey'].some(
      (key) =>
        typeof Reflect.get(previewProps, key) !== 'string' ||
        !Reflect.get(previewProps, key)
    ) ||
    !prerenderManifest ||
    prerenderManifest.version !== 4 ||
    !prerenderManifest.routes ||
    !prerenderManifest.dynamicRoutes ||
    !Array.isArray(prerenderManifest.notFoundRoutes)
  ) {
    throw new Error('Invalid compiled request manifest structure.')
  }
  if (getCacheHandlers() !== undefined) {
    throw new Error('A compiled file cache requires a fresh execution realm.')
  }
  const lease = realm?.acquire(
    options.cacheScope.directory,
    config.cacheMaxMemorySize
  )
  if (!lease) initializeCacheHandlers(config.cacheMaxMemorySize)
  let disposed = false

  return {
    createIncrementalCache(headers) {
      if (disposed) {
        throw new Error('The compiled file cache has been disposed.')
      }
      return new IncrementalCache({
        fs: nodeFs,
        dev: metadata.mode === 'development',
        minimalMode: false,
        requestHeaders: headers,
        allowedRevalidateHeaderKeys: config.allowedRevalidateHeaderKeys,
        serverDistDir: join(options.cacheScope.directory, 'server'),
        fetchCacheKeyPrefix: config.fetchCacheKeyPrefix,
        maxMemoryCacheSize: config.cacheMaxMemorySize,
        flushToDisk: config.isrFlushToDisk,
        previewProps,
        prerenderManifest,
        ...(lease ? { cacheHandlerState: lease.state } : {}),
      })
    },
    async dispose() {
      disposed = true
      lease?.release()
    },
  }
}
