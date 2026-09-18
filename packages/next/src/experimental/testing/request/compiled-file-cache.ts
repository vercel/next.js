import type { IncomingHttpHeaders } from 'http'
import { isAbsolute, join } from 'path'
import type { CompiledTestRequestContext } from '../contracts'
import type { PrerenderManifest } from '../../../build'
import type { __ApiPreviewProps } from '../../../server/api-utils'
import { IncrementalCache } from '../../../server/lib/incremental-cache'
import { nodeFs } from '../../../server/lib/node-fs-methods'
import { loadManifest } from '../../../server/load-manifest.external'
import { initializeCacheHandlers } from '../../../server/use-cache/handlers'

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

/**
 * Initialize the default Next caches in a fresh file execution realm. B owns
 * the private dist-style disk directory and removes it only after process exit.
 * Requests share the file's caches intentionally; each still gets its own
 * IncrementalCache because request/revalidation headers are instance state.
 *
 * Disposal forbids new requests, but deliberately does not reset global cache
 * state. The execution host must terminate this realm before another file.
 */
export function createCompiledFileCache(
  metadata: CompiledTestRequestContext | undefined,
  options: CompiledFileCacheOptions
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
  if (!initializeCacheHandlers(config.cacheMaxMemorySize)) {
    throw new Error('A compiled file cache requires a fresh execution realm.')
  }
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
      })
    },
    async dispose() {
      disposed = true
    },
  }
}
