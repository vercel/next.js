/** @typedef {import('../types/backend').RuntimeBackend} RuntimeBackend */
/** @typedef {import('../types').SourceInfo} SourceInfo */
/** @typedef {import('../types').ChunkPath} ChunkPath */

/** @type {RuntimeBackend} */
let BACKEND;

(() => {
  BACKEND = {
    registerChunk(chunkPath, params) {
      if (params == null) {
        return;
      }

      if (params.runtimeModuleIds.length > 0) {
        for (const otherChunkData of params.otherChunks) {
          loadChunk(
            typeof otherChunkData === "string"
              ? otherChunkData
              : otherChunkData.path,
            {
              type: SourceTypeRuntime,
              chunkPath,
            }
          );
        }

        for (const moduleId of params.runtimeModuleIds) {
          getOrInstantiateRuntimeModule(moduleId, chunkPath);
        }
      }
    },

    async loadChunk(chunkPath, source) {
      loadChunk(chunkPath, source);
    },

    restart: () => {
      throw new Error("restart not implemented for the Node.js backend");
    },
  };

  /**
   * @param {ChunkPath} chunkPath
   * @param {SourceInfo} source
   */
  function loadChunk(chunkPath, source) {
    if (!chunkPath.endsWith(".js")) {
      // We only support loading JS chunks in Node.js.
      // This branch can be hit when trying to load a CSS chunk.
      return;
    }

    let fromChunkPath = undefined;
    switch (source.type) {
      case SourceTypeRuntime:
        fromChunkPath = source.chunkPath;
        break;
      case SourceTypeParent:
        fromChunkPath = getFirstModuleChunk(source.parentId);
        break;
      case SourceTypeUpdate:
        break;
    }

    // We'll only mark the chunk as loaded once the script has been executed,
    // which happens in `registerChunk`. Hence the absence of `resolve()`.
    const path = require("path");
    const resolved = require.resolve(
      "./" + path.relative(path.dirname(fromChunkPath), chunkPath)
    );
    delete require.cache[resolved];
    require(resolved);
  }
})();
