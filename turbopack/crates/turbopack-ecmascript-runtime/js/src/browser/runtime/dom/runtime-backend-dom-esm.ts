/**
 * This file contains the runtime code specific to the Turbopack ECMAScript DOM
 * runtime when `esm_chunks` is enabled.
 *
 * In this mode, regular chunks are emitted as ES modules (`export default
 * [factories...]`) and loaded via `import()` instead of `<script>` tags.
 * The evaluate (bootstrap) chunk reads its RuntimeParams from the module-level
 * `__turbopack_params__` const defined before the runtime IIFE.
 *
 * It will be appended to the base runtime code.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../../../browser/runtime/base/runtime-base.ts" />
/// <reference path="../../../shared/runtime/runtime-types.d.ts" />

// In dev mode, addModuleToChunk and registerChunkList are defined by
// dev-base.ts (concatenated into the same IIFE). Declare them optional so the
// typeof checks work in production builds where dev-base.ts is absent.
declare function addModuleToChunk(
  moduleId: ModuleId,
  chunkPath: ChunkPath
): void
declare function registerChunkList(chunkList: ChunkList): void

function getAssetSuffixFromScriptSrc() {
  // TURBOPACK_ASSET_SUFFIX is set in web workers.
  if (self.TURBOPACK_ASSET_SUFFIX != null) return self.TURBOPACK_ASSET_SUFFIX
  // RUNTIME_URL is set by the runtime epilogue (import.meta.url in ESM mode).
  const qi = RUNTIME_URL.indexOf('?')
  return qi >= 0 ? RUNTIME_URL.slice(qi) : ''
}

type ChunkResolver = {
  resolved: boolean
  loadingStarted: boolean
  resolve: () => void
  reject: (error?: Error) => void
  promise: Promise<any>
}

let BACKEND: RuntimeBackend

/**
 * Maps chunk URLs to the corresponding resolver.
 */
const chunkResolvers: Map<ChunkUrl, ChunkResolver> = new Map()

;(() => {
  BACKEND = {
    async registerChunk(_chunk, params) {
      // In ESM mode this is only called once — from the runtime epilogue with
      // `params = __turbopack_params__`. Regular chunks are registered inside
      // doLoadChunk's import() .then() handler via installCompressedModuleFactories.
      if (params == null) {
        return
      }

      for (const otherChunkData of params.otherChunks) {
        const otherChunkPath = getChunkPath(otherChunkData)
        const otherChunkUrl = getChunkRelativeUrl(otherChunkPath)

        // Ensure a resolver exists so that loadInitialChunk can await it.
        getOrCreateResolver(otherChunkUrl)
      }

      await Promise.all(
        params.otherChunks.map((otherChunkData) =>
          loadInitialChunk('' as ChunkPath, otherChunkData)
        )
      )

      if (params.runtimeModuleIds.length > 0) {
        for (const moduleId of params.runtimeModuleIds) {
          getOrInstantiateRuntimeModule('' as ChunkPath, moduleId)
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

  /**
   * Loads the given chunk via `import()` (JS) or `<link>` (CSS), and returns a
   * promise that resolves once the chunk has been loaded and its module factories
   * have been installed.
   */
  function doLoadChunk(sourceType: SourceType, chunkUrl: ChunkUrl) {
    const resolver = getOrCreateResolver(chunkUrl)
    if (resolver.loadingStarted) {
      return resolver.promise
    }

    resolver.loadingStarted = true

    // TODO(PACK-2140): remove this once all filenames are guaranteed to be escaped.
    const decodedChunkUrl = decodeURI(chunkUrl)

    if (isCss(chunkUrl)) {
      const previousLinks = document.querySelectorAll(
        `link[rel=stylesheet][href="${chunkUrl}"],link[rel=stylesheet][href^="${chunkUrl}?"],link[rel=stylesheet][href="${decodedChunkUrl}"],link[rel=stylesheet][href^="${decodedChunkUrl}?"]`
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
          resolver.reject()
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
      // Use dynamic import() to load JS chunks as ES modules.
      import(/* turbopackIgnore: true */ chunkUrl)
        .then(({ default: data }) => {
          if (data && data.chunkList) {
            // Chunk list: the default export is { chunkList: { chunks, source } }.
            // In dev mode, register it for HMR tracking. In production the
            // registerChunkList function doesn't exist — just resolve.
            if (typeof registerChunkList === 'function') {
              const chunkPath = getPathFromScript(chunkUrl as ChunkPath)
              registerChunkList({
                script: chunkPath,
                chunks: data.chunkList.chunks,
                source: data.chunkList.source,
              })
            }
          } else {
            // Module factories: the default export is CompressedModuleFactories.
            const chunkPath = getPathFromScript(chunkUrl as ChunkPath)
            installCompressedModuleFactories(
              data as CompressedModuleFactories,
              /* offset= */ 0,
              moduleFactories,
              // Pass the addModuleToChunk callback for HMR tracking in dev mode.
              // In production, addModuleToChunk is not defined (dev-base.ts is not
              // concatenated), so the typeof check makes this safe.
              typeof addModuleToChunk !== 'undefined'
                ? (id: ModuleId) => addModuleToChunk(id, chunkPath)
                : undefined
            )
          }
          resolver.resolve()
        })
        .catch((err: Error) => resolver.reject(err))
    } else {
      throw new Error(`can't infer type of chunk from URL ${chunkUrl}`)
    }

    return resolver.promise
  }

  function fetchWebAssembly(wasmChunkPath: ChunkPath) {
    return fetch(getChunkRelativeUrl(wasmChunkPath))
  }
})()
