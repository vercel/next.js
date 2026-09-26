/**
 * This file contains the runtime code specific to the Turbopack ECMAScript DOM runtime.
 *
 * It will be appended to the base runtime code.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../../../browser/runtime/base/runtime-base.ts" />
/// <reference path="../../../shared/runtime/runtime-types.d.ts" />

function getAssetSuffixFromScriptSrc() {
  // TURBOPACK_ASSET_SUFFIX is set in web workers
  if (self.TURBOPACK_ASSET_SUFFIX != null) return self.TURBOPACK_ASSET_SUFFIX
  const src =
    typeof document === 'undefined'
      ? ''
      : (document.currentScript?.getAttribute?.('src') ?? '')
  const qi = src.indexOf('?')
  return qi >= 0 ? src.slice(qi) : ''
}

type LazyChunkPromise = {
  promise?: Promise<void>
  resolve?: () => void
  reject?: (error?: Error) => void
}

type ChunkResolver = {
  loaded: boolean
  registered: boolean
  loadingStarted: boolean
  retryAttempts: number
  load: LazyChunkPromise
  registration: LazyChunkPromise
}

let BACKEND: RuntimeBackend

/**
 * Maps chunk paths to the corresponding resolver.
 */
const chunkResolvers: Map<ChunkUrl, ChunkResolver> = new Map()

;(() => {
  BACKEND = {
    async registerChunk(chunk, params) {
      // `chunk` is `undefined` for an inlined entry-only registration, which has no source chunk.
      let chunkPath: ChunkPath | undefined
      if (chunk != null) {
        chunkPath = getPathFromScript(chunk)
        const resolver = getOrCreateResolver(getUrlFromScript(chunk))
        markChunkRegistered(resolver)
      }

      if (params == null) {
        return
      }

      for (const otherChunkData of params.otherChunks) {
        const otherChunkPath = getChunkPath(otherChunkData)
        const otherChunkUrl = getChunkRelativeUrl(otherChunkPath)

        // Chunk might have started loading, so we want to avoid triggering another load.
        getOrCreateResolver(otherChunkUrl)
      }

      // This waits for chunks to be loaded, but also marks included items as available.
      await Promise.all(
        params.otherChunks.map((otherChunkData) =>
          loadInitialChunk(chunkPath, otherChunkData)
        )
      )

      if (params.runtimeModuleIds.length > 0) {
        for (const moduleId of params.runtimeModuleIds) {
          getOrInstantiateRuntimeModule(chunkPath, moduleId)
        }
      }
    },

    /**
     * Loads the given chunk, and returns a promise that resolves once the chunk
     * has been loaded.
     */
    loadChunkCached(
      sourceType: SourceType,
      chunkUrl: ChunkUrl,
      resolveOnLoad = false
    ) {
      return doLoadChunk(sourceType, chunkUrl, resolveOnLoad)
    },
  }

  function getOrCreateResolver(chunkUrl: ChunkUrl): ChunkResolver {
    let resolver = chunkResolvers.get(chunkUrl)
    if (!resolver) {
      resolver = {
        loaded: false,
        registered: false,
        loadingStarted: false,
        retryAttempts: 0,
        load: {},
        registration: {},
      }
      chunkResolvers.set(chunkUrl, resolver)
    }
    return resolver
  }

  function getOrCreatePromise(
    state: LazyChunkPromise,
    completed: boolean
  ): Promise<void> {
    if (completed) return Promise.resolve()
    if (!state.promise) {
      state.promise = new Promise<void>((resolve, reject) => {
        state.resolve = resolve
        state.reject = reject
      })
    }
    return state.promise
  }

  function getResolverPromise(
    resolver: ChunkResolver,
    resolveOnLoad: boolean
  ): Promise<void> {
    return resolveOnLoad
      ? getOrCreatePromise(resolver.load, resolver.loaded)
      : getOrCreatePromise(resolver.registration, resolver.registered)
  }

  function markChunkLoaded(resolver: ChunkResolver) {
    resolver.loaded = true
    resolver.load.resolve?.()
  }

  function markChunkRegistered(resolver: ChunkResolver) {
    resolver.registered = true
    markChunkLoaded(resolver)
    resolver.registration.resolve?.()
  }

  /**
   * Rejects a chunk resolver and drops it from the cache.
   * We don't want to cache failed chunk loads: a later
   * request for the same chunk should try again.
   */
  function rejectChunkResolver(
    chunkUrl: ChunkUrl,
    resolver: ChunkResolver,
    error?: Error
  ) {
    if (chunkResolvers.get(chunkUrl) === resolver) {
      chunkResolvers.delete(chunkUrl)
    }
    resolver.load.reject?.(error)
    resolver.registration.reject?.(error)
  }

  function getChunkLoadRetryDelayMs() {
    const jitter = Math.floor(
      Math.random() * (CHUNK_LOAD_RETRY_MAX_JITTER_MS + 1)
    )
    return CHUNK_LOAD_RETRY_BASE_DELAY_MS + jitter
  }

  function isRetryableChunkLoadError(error?: Error): boolean {
    return (
      error == null ||
      (error instanceof DOMException && error.name === 'NetworkError')
    )
  }

  /**
   * Handles a failed chunk load: retries the load once after a short delay.
   */
  function onChunkLoadError(
    sourceType: SourceType,
    chunkUrl: ChunkUrl,
    resolver: ChunkResolver,
    error?: Error,
    reload?: () => void
  ) {
    if (
      !isRetryableChunkLoadError(error) ||
      resolver.retryAttempts >= CHUNK_LOAD_RETRY_MAX_ATTEMPTS ||
      chunkResolvers.get(chunkUrl) !== resolver
    ) {
      rejectChunkResolver(chunkUrl, resolver, error)
      return
    }

    resolver.retryAttempts++
    setTimeout(() => {
      // if this chunk is being fetched multiple times, and one of those
      // attempts succeeds. or, if this chunk has another resolver
      // mapped to it - it's safe to skip retrying.
      if (resolver.loaded || chunkResolvers.get(chunkUrl) !== resolver) {
        return
      }
      if (reload) {
        reload()
      } else {
        resolver.loadingStarted = false
        doLoadChunk(sourceType, chunkUrl, resolver.registration.promise == null)
      }
    }, getChunkLoadRetryDelayMs())
  }

  function getExistingScripts(chunkUrl: ChunkUrl): HTMLScriptElement[] {
    const requested = new URL(chunkUrl, document.baseURI).href
    return Array.from(document.scripts).filter((script) => {
      const src = script.getAttribute('src')
      if (src == null) return false
      const existing = new URL(src, document.baseURI).href
      return existing === requested || existing.startsWith(`${requested}?`)
    })
  }

  /**
   * Loads the given chunk, and returns a promise that resolves once the chunk
   * has been loaded.
   */
  function doLoadChunk(
    sourceType: SourceType,
    chunkUrl: ChunkUrl,
    resolveOnLoad = false
  ) {
    const resolver = getOrCreateResolver(chunkUrl)
    const promise = getResolverPromise(resolver, resolveOnLoad)
    if (resolver.loadingStarted) {
      return promise
    }

    if (sourceType === SourceType.Runtime) {
      // We don't need to load chunks references from runtime code, as they're already
      // present in the DOM.
      resolver.loadingStarted = true

      if (isCss(chunkUrl)) {
        // CSS chunks do not register themselves, and as such must be marked as
        // loaded instantly.
        markChunkRegistered(resolver)
      }

      // We need to wait for JS chunks to register themselves within `registerChunk`
      // before we can start instantiating runtime modules, hence the absence of
      // `markChunkRegistered()` in this branch.

      return promise
    }

    resolver.loadingStarted = true

    if (typeof importScripts === 'function') {
      // We're in a classic web worker.
      if (isCss(chunkUrl)) {
        // ignore
      } else if (isJs(chunkUrl)) {
        self.TURBOPACK_NEXT_CHUNK_URLS!.push(chunkUrl)
        try {
          importScripts(chunkUrl)
          markChunkLoaded(resolver)
        } catch (error) {
          onChunkLoadError(sourceType, chunkUrl, resolver, error as Error)
        }
      } else {
        throw new Error(
          `can't infer type of chunk from URL ${chunkUrl} in worker`
        )
      }
    } else if (typeof document !== 'undefined') {
      // TODO(PACK-2140): remove this once all filenames are guaranteed to be escaped.
      const decodedChunkUrl = decodeURI(chunkUrl)

      if (isCss(chunkUrl)) {
        const previousLinks = document.querySelectorAll(
          `link[rel=stylesheet][href="${chunkUrl}"],link[rel=stylesheet][href^="${chunkUrl}?"],link[rel=stylesheet][href="${decodedChunkUrl}"],link[rel=stylesheet][href^="${decodedChunkUrl}?"]`
        )
        if (previousLinks.length > 0) {
          // CSS chunks do not register themselves, and as such must be marked as
          // loaded instantly.
          markChunkRegistered(resolver)
        } else {
          const createLink = () => {
            const link = document.createElement('link')
            link.rel = 'stylesheet'
            link.crossOrigin = CROSS_ORIGIN
            link.href = chunkUrl
            link.onerror = () => {
              // Re-insert a fresh tag at the same position on retry to preserve
              // cascade order.
              const anchor = document.createComment('')
              link.replaceWith(anchor)
              onChunkLoadError(sourceType, chunkUrl, resolver, undefined, () =>
                anchor.replaceWith(createLink())
              )
            }
            link.onload = () => {
              // CSS chunks do not register themselves, and as such must be marked as
              // loaded instantly.
              markChunkRegistered(resolver)
            }
            return link
          }
          // Append to the `head` for webpack compatibility.
          document.head.appendChild(createLink())
        }
      } else if (isJs(chunkUrl)) {
        const previousScripts = getExistingScripts(chunkUrl)
        if (previousScripts.length > 0) {
          for (const script of Array.from(previousScripts)) {
            script.addEventListener('load', () => markChunkLoaded(resolver), {
              once: true,
            })
            script.addEventListener(
              'error',
              () => {
                // Drop the failed tag so a retry can re-add it cleanly.
                script.remove()
                onChunkLoadError(sourceType, chunkUrl, resolver)
              },
              { once: true }
            )
          }
        } else {
          const script = document.createElement('script')
          script.crossOrigin = CROSS_ORIGIN
          script.src = chunkUrl
          script.onload = () => markChunkLoaded(resolver)
          script.onerror = () => {
            // Drop the failed tag so a retry can re-add it cleanly.
            script.remove()
            onChunkLoadError(sourceType, chunkUrl, resolver)
          }
          // Append to the `head` for webpack compatibility.
          document.head.appendChild(script)
        }
      } else {
        throw new Error(`can't infer type of chunk from URL ${chunkUrl}`)
      }
    } else {
      throw new Error('chunk loading is not supported in module workers')
    }

    return promise
  }
})()
