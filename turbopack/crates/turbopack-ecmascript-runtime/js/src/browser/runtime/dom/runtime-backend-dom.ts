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
  return (
    (self.TURBOPACK_ASSET_SUFFIX ??
      document?.currentScript
        ?.getAttribute?.('src')
        ?.replace(/^(.*(?=\?)|^.*$)/, '')) ||
    ''
  )
}

type ChunkResolver = {
  resolved: boolean
  loadingStarted: boolean
  retryAttempts: number
  resolve: () => void
  reject: (error?: Error) => void
  promise: Promise<any>
}

let BACKEND: RuntimeBackend

/**
 * Maps chunk paths to the corresponding resolver.
 */
const chunkResolvers: Map<ChunkUrl, ChunkResolver> = new Map()

// Keep in sync with Next's client chunk retry policy.
const MAX_CHUNK_LOAD_RETRY_ATTEMPTS = 1
const BASE_CHUNK_LOAD_RETRY_DELAY_MS = 200
const MAX_CHUNK_LOAD_RETRY_JITTER_MS = 400
const MAX_CHUNK_LOAD_RETRY_RTT_MS = 500
const MAX_CHUNK_LOAD_RETRY_TOTAL_DELAY_MS = 1500

;(() => {
  BACKEND = {
    async registerChunk(chunk, params) {
      let chunkPath = getPathFromScript(chunk)
      let chunkUrl = getUrlFromScript(chunk)

      const resolver = getOrCreateResolver(chunkUrl)
      resolver.resolve()

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
    loadChunkCached(sourceType: SourceType, chunkUrl: ChunkUrl) {
      return doLoadChunk(sourceType, chunkUrl)
    },

    async loadWebAssembly(
      _sourceType: SourceType,
      _sourceData: SourceData,
      wasmChunkPath: ChunkPath,
      _edgeModule: () => WebAssembly.Module,
      importsObj: WebAssembly.Imports
    ): Promise<Exports> {
      const req = fetchWebAssembly(wasmChunkPath)

      const { instance } = await WebAssembly.instantiateStreaming(
        req,
        importsObj
      )

      return instance.exports
    },

    async loadWebAssemblyModule(
      _sourceType: SourceType,
      _sourceData: SourceData,
      wasmChunkPath: ChunkPath,
      _edgeModule: () => WebAssembly.Module
    ): Promise<WebAssembly.Module> {
      const req = fetchWebAssembly(wasmChunkPath)

      return await WebAssembly.compileStreaming(req)
    },
  }

  function getOrCreateResolver(chunkUrl: ChunkUrl): ChunkResolver {
    let resolver = chunkResolvers.get(chunkUrl)
    if (!resolver) {
      let resolve: () => void
      let reject: (error?: Error) => void
      const promise = new Promise<void>((innerResolve, innerReject) => {
        resolve = innerResolve
        reject = innerReject
      })
      resolver = {
        resolved: false,
        loadingStarted: false,
        retryAttempts: 0,
        promise,
        resolve: () => {
          resolver!.resolved = true
          resolve()
        },
        reject: reject!,
      }
      chunkResolvers.set(chunkUrl, resolver)
    }
    return resolver
  }

  function rejectChunkResolver(
    chunkUrl: ChunkUrl,
    resolver: ChunkResolver,
    error?: Error
  ) {
    // Match webpack behavior: failed chunk loads are not cached.
    if (chunkResolvers.get(chunkUrl) === resolver) {
      chunkResolvers.delete(chunkUrl)
    }
    resolver.reject(error)
  }

  function getChunkLoadRetryDelayMs() {
    const jitter = Math.floor(
      Math.random() * (MAX_CHUNK_LOAD_RETRY_JITTER_MS + 1)
    )

    let rtt = 0
    if ('connection' in navigator) {
      const connection = navigator.connection as { rtt?: number } | undefined
      if (connection?.rtt) {
        rtt = Math.min(MAX_CHUNK_LOAD_RETRY_RTT_MS, connection.rtt)
      }
    }

    return Math.min(
      MAX_CHUNK_LOAD_RETRY_TOTAL_DELAY_MS,
      BASE_CHUNK_LOAD_RETRY_DELAY_MS + jitter + rtt
    )
  }

  function retryChunkLoad(
    sourceType: SourceType,
    chunkUrl: ChunkUrl,
    resolver: ChunkResolver,
    error?: Error
  ) {
    if (
      resolver.retryAttempts >= MAX_CHUNK_LOAD_RETRY_ATTEMPTS ||
      chunkResolvers.get(chunkUrl) !== resolver
    ) {
      rejectChunkResolver(chunkUrl, resolver, error)
      return
    }

    resolver.retryAttempts++
    setTimeout(() => {
      if (resolver.resolved || chunkResolvers.get(chunkUrl) !== resolver) {
        return
      }
      loadChunkImpl(sourceType, chunkUrl, resolver)
    }, getChunkLoadRetryDelayMs())
  }

  function loadChunkImpl(
    sourceType: SourceType,
    chunkUrl: ChunkUrl,
    resolver: ChunkResolver
  ) {
    if (typeof importScripts === 'function') {
      // We're in a web worker
      if (isCss(chunkUrl)) {
        // ignore
      } else if (isJs(chunkUrl)) {
        self.TURBOPACK_NEXT_CHUNK_URLS!.push(chunkUrl)
        try {
          importScripts(chunkUrl)
        } catch (error) {
          retryChunkLoad(sourceType, chunkUrl, resolver, error as Error)
        }
      } else {
        throw new Error(
          `can't infer type of chunk from URL ${chunkUrl} in worker`
        )
      }
      return
    }

    // TODO(PACK-2140): remove this once all filenames are guaranteed to be escaped.
    const decodedChunkUrl = decodeURI(chunkUrl)
    // Escape URLs for safe use in CSS selectors
    const escapedChunkUrl = CSS.escape(chunkUrl)
    const escapedDecodedChunkUrl = CSS.escape(decodedChunkUrl)

    if (isCss(chunkUrl)) {
      const previousLinks = document.querySelectorAll(
        `link[rel=stylesheet][href="${escapedChunkUrl}"],link[rel=stylesheet][href^="${escapedChunkUrl}?"],link[rel=stylesheet][href="${escapedDecodedChunkUrl}"],link[rel=stylesheet][href^="${escapedDecodedChunkUrl}?"]`
      )
      if (previousLinks.length > 0) {
        // CSS chunks do not register themselves, and as such must be marked as
        // loaded instantly.
        resolver.resolve()
      } else {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = chunkUrl
        link.onerror = () => {
          link.remove()
          retryChunkLoad(sourceType, chunkUrl, resolver)
        }
        link.onload = () => {
          // CSS chunks do not register themselves, and as such must be marked as
          // loaded instantly.
          resolver.resolve()
        }
        // Append to the `head` for webpack compatibility.
        document.head.appendChild(link)
      }
    } else if (isJs(chunkUrl)) {
      const previousScripts = document.querySelectorAll(
        `script[src="${escapedChunkUrl}"],script[src^="${escapedChunkUrl}?"],script[src="${escapedDecodedChunkUrl}"],script[src^="${escapedDecodedChunkUrl}?"]`
      )
      if (previousScripts.length > 0) {
        // There is this edge where the script already failed loading, but we
        // can't detect that. The Promise will never resolve in this case.
        for (const script of Array.from(previousScripts)) {
          script.addEventListener(
            'error',
            () => {
              script.remove()
              retryChunkLoad(sourceType, chunkUrl, resolver)
            },
            { once: true }
          )
        }
      } else {
        const script = document.createElement('script')
        script.src = chunkUrl
        // We'll only mark the chunk as loaded once the script has been executed,
        // which happens in `registerChunk`. Hence the absence of `resolve()` in
        // this branch.
        script.onerror = () => {
          script.remove()
          retryChunkLoad(sourceType, chunkUrl, resolver)
        }
        // Append to the `head` for webpack compatibility.
        document.head.appendChild(script)
      }
    } else {
      throw new Error(`can't infer type of chunk from URL ${chunkUrl}`)
    }
  }

  /**
   * Loads the given chunk, and returns a promise that resolves once the chunk
   * has been loaded.
   */
  function doLoadChunk(sourceType: SourceType, chunkUrl: ChunkUrl) {
    const resolver = getOrCreateResolver(chunkUrl)
    if (resolver.loadingStarted) {
      return resolver.promise
    }

    if (sourceType === SourceType.Runtime) {
      // We don't need to load chunks references from runtime code, as they're already
      // present in the DOM.
      resolver.loadingStarted = true

      if (isCss(chunkUrl)) {
        // CSS chunks do not register themselves, and as such must be marked as
        // loaded instantly.
        resolver.resolve()
      }

      // We need to wait for JS chunks to register themselves within `registerChunk`
      // before we can start instantiating runtime modules, hence the absence of
      // `resolver.resolve()` in this branch.

      return resolver.promise
    }

    resolver.loadingStarted = true
    loadChunkImpl(sourceType, chunkUrl, resolver)
    return resolver.promise
  }

  function fetchWebAssembly(wasmChunkPath: ChunkPath) {
    return fetch(getChunkRelativeUrl(wasmChunkPath))
  }
})()
