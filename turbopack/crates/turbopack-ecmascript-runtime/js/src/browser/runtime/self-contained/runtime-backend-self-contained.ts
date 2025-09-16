/**
 * This file contains the runtime code specific to the Turbopack self-contained
 * ECMAScript runtime: a backend that performs no runtime chunk loading and
 * registers chunks only via `globalThis`/`self` (no DOM). It is used both for
 * the Edge execution environment and for single-chunk (service-worker) bundles,
 * where everything is inlined into one file.
 *
 * It will be appended to the base runtime code.
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
    registerChunk(_chunk, params) {
      if (params == null) {
        return
      }

      instantiateRuntimeModules(params.runtimeModuleIds)
    },

    loadChunkCached(_sourceType: SourceType, _chunkUrl: ChunkUrl) {
      throw new Error('chunk loading is not supported')
    },
  }

  /**
   * Instantiates the runtime modules for the given chunk.
   */
  function instantiateRuntimeModules(runtimeModuleIds: ModuleId[]) {
    for (const moduleId of runtimeModuleIds) {
      getOrInstantiateRuntimeModule(undefined, moduleId)
    }
  }
})()
