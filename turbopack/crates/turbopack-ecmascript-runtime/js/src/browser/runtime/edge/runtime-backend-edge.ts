/**
 * This file contains the runtime code specific to the Turbopack development
 * ECMAScript "None" runtime (e.g. for Edge).
 *
 * It will be appended to the base development runtime code.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../base/runtime-base.ts" />
/// <reference path="../../../shared/require-type.d.ts" />
/// <reference path="../../../shared-node/base-externals-utils.ts" />

type ChunkRunner = {
  requiredChunks: Set<ChunkPath>
  chunkPath: ChunkPath
  runtimeModuleIds: ModuleId[]
}

let BACKEND: RuntimeBackend
;(() => {
  BACKEND = {
    // The "none" runtime expects all chunks within the same chunk group to be
    // registered before any of them are instantiated.
    // Furthermore, modules must be instantiated synchronously, hence we don't
    // use promises here.
    registerChunk(chunkPath, params) {
      registeredChunks.add(chunkPath)
      instantiateDependentChunks(chunkPath)

      if (params == null) {
        return
      }

      if (params.otherChunks.length === 0) {
        // The current chunk does not depend on any other chunks, it can be
        // instantiated immediately.
        instantiateRuntimeModules(params.runtimeModuleIds, chunkPath)
      } else {
        // The current chunk depends on other chunks, so we need to wait for
        // those chunks to be registered before instantiating the runtime
        // modules.
        registerChunkRunner(
          chunkPath,
          params.otherChunks.filter((chunk) =>
            // The none runtime can only handle JS chunks, so we only wait for these
            isJs(getChunkPath(chunk))
          ),
          params.runtimeModuleIds
        )
      }
    },

    loadChunkCached(_sourceType: SourceType, _chunkUrl: ChunkUrl) {
      throw new Error('chunk loading is not supported')
    },

    async loadWebAssembly(
      _sourceType: SourceType,
      _sourceData: SourceData,
      chunkPath: ChunkPath,
      edgeModule: () => WebAssembly.Module,
      imports: WebAssembly.Imports
    ): Promise<Exports> {
      const module = await loadEdgeWasm(chunkPath, edgeModule)

      return await WebAssembly.instantiate(module, imports)
    },

    async loadWebAssemblyModule(
      _sourceType: SourceType,
      _sourceData: SourceData,
      chunkPath: ChunkPath,
      edgeModule: () => WebAssembly.Module
    ): Promise<WebAssembly.Module> {
      return loadEdgeWasm(chunkPath, edgeModule)
    },
  }

  const registeredChunks: Set<ChunkPath> = new Set()
  const runners: Map<ChunkPath, Set<ChunkRunner>> = new Map()

  /**
   * Registers a chunk runner that will be instantiated once all of the
   * dependencies of the chunk have been registered.
   */
  function registerChunkRunner(
    chunkPath: ChunkPath,
    otherChunks: ChunkData[],
    runtimeModuleIds: ModuleId[]
  ) {
    const requiredChunks: Set<ChunkPath> = new Set()
    const runner = {
      runtimeModuleIds,
      chunkPath,
      requiredChunks,
    }

    for (const otherChunkData of otherChunks) {
      const otherChunkPath = getChunkPath(otherChunkData)
      if (registeredChunks.has(otherChunkPath)) {
        continue
      }

      requiredChunks.add(otherChunkPath)
      let runnersForChunk = runners.get(otherChunkPath)
      if (runnersForChunk == null) {
        runnersForChunk = new Set()
        runners.set(otherChunkPath, runnersForChunk)
      }
      runnersForChunk.add(runner)
    }
    // When all chunks are already registered, we can instantiate the runtime module
    if (runner.requiredChunks.size === 0) {
      instantiateRuntimeModules(runner.runtimeModuleIds, runner.chunkPath)
    }
  }

  /**
   * Instantiates any chunk runners that were waiting for the given chunk to be
   * registered.
   */
  function instantiateDependentChunks(chunkPath: ChunkPath) {
    // Run any chunk runners that were waiting for this chunk to be
    // registered.
    const runnersForChunk = runners.get(chunkPath)
    if (runnersForChunk != null) {
      for (const runner of runnersForChunk) {
        runner.requiredChunks.delete(chunkPath)

        if (runner.requiredChunks.size === 0) {
          instantiateRuntimeModules(runner.runtimeModuleIds, runner.chunkPath)
        }
      }
      runners.delete(chunkPath)
    }
  }

  /**
   * Instantiates the runtime modules for the given chunk.
   */
  function instantiateRuntimeModules(
    runtimeModuleIds: ModuleId[],
    chunkPath: ChunkPath
  ) {
    for (const moduleId of runtimeModuleIds) {
      getOrInstantiateRuntimeModule(chunkPath, moduleId)
    }
  }

  async function loadEdgeWasm(
    chunkPath: ChunkPath,
    edgeModule: () => WebAssembly.Module
  ): Promise<WebAssembly.Module> {
    let module
    try {
      module = edgeModule()
    } catch (_e) {}

    if (!module) {
      throw new Error(
        `dynamically loading WebAssembly is not supported in this runtime as global was not injected for chunk '${chunkPath}'`
      )
    }

    return module
  }
})()
