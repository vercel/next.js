/** @typedef {import('../types/backend').RuntimeBackend} RuntimeBackend */
/** @typedef {import('../types/runtime.none').ChunkRunner} ChunkRunner */
/** @typedef {import('../types').ModuleId} ModuleId */
/** @typedef {import('../types').ChunkPath} ChunkPath */
/** @typedef {import('../types').ChunkData} ChunkData */

/** @type {RuntimeBackend} */
let BACKEND;

(() => {
  BACKEND = {
    // The "none" runtime expects all chunks within the same chunk group to be
    // registered before any of them are instantiated.
    // Furthermore, modules must be instantiated synchronously, hence we don't
    // use promises here.
    registerChunk(chunkPath, params) {
      registeredChunks.add(chunkPath);
      instantiateDependentChunks(chunkPath);

      if (params == null) {
        return;
      }

      if (params.otherChunks.length === 0) {
        // The current chunk does not depend on any other chunks, it can be
        // instantiated immediately.
        instantiateRuntimeModules(params.runtimeModuleIds, chunkPath);
      } else {
        // The current chunk depends on other chunks, so we need to wait for
        // those chunks to be registered before instantiating the runtime
        // modules.
        registerChunkRunner(
          chunkPath,
          params.otherChunks,
          params.runtimeModuleIds
        );
      }
    },

    loadChunk(chunkPath, fromChunkPath) {
      throw new Error("chunk loading is not supported");
    },

    restart: () => {
      throw new Error("restart is not supported");
    },
  };

  /** @type {Set<ChunkPath>} */
  const registeredChunks = new Set();
  /** @type {Map<ChunkPath, Set<ChunkRunner>>} */
  const runners = new Map();

  /**
   * Registers a chunk runner that will be instantiated once all of the
   * dependencies of the chunk have been registered.
   *
   * @param {ChunkPath} chunkPath
   * @param {ChunkData[]} otherChunks
   * @param {ModuleId[]} runtimeModuleIds
   */
  function registerChunkRunner(chunkPath, otherChunks, runtimeModuleIds) {
    const requiredChunks = new Set();
    const runner = {
      runtimeModuleIds,
      chunkPath,
      requiredChunks,
    };

    for (const otherChunkData of otherChunks) {
      const otherChunkPath =
        typeof otherChunkData === "string"
          ? otherChunkData
          : otherChunkData.path;
      if (registeredChunks.has(otherChunkPath)) {
        continue;
      }

      requiredChunks.add(otherChunkPath);
      let runnersForChunk = runners.get(otherChunkPath);
      if (runnersForChunk == null) {
        runnersForChunk = new Set();
        runners.set(otherChunkPath, runnersForChunk);
      }
      runnersForChunk.add(runner);
    }
    // When all chunks are already registered, we can instantiate the runtime module
    if (runner.requiredChunks.size === 0) {
      instantiateRuntimeModules(runner.runtimeModuleIds, runner.chunkPath);
    }
  }

  /**
   * Instantiates any chunk runners that were waiting for the given chunk to be
   * registered.
   *
   * @param {ChunkPath} chunkPath
   */
  function instantiateDependentChunks(chunkPath) {
    // Run any chunk runners that were waiting for this chunk to be
    // registered.
    const runnersForChunk = runners.get(chunkPath);
    if (runnersForChunk != null) {
      for (const runner of runnersForChunk) {
        runner.requiredChunks.delete(chunkPath);

        if (runner.requiredChunks.size === 0) {
          instantiateRuntimeModules(runner.runtimeModuleIds, runner.chunkPath);
        }
      }
      runners.delete(chunkPath);
    }
  }

  /**
   * Instantiates the runtime modules for the given chunk.
   *
   * @param {ModuleId[]} runtimeModuleIds
   * @param {ChunkPath} chunkPath
   */
  function instantiateRuntimeModules(runtimeModuleIds, chunkPath) {
    for (const moduleId of runtimeModuleIds) {
      getOrInstantiateRuntimeModule(moduleId, chunkPath);
    }
  }
})();
