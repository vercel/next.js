/// <reference path="./build-base.ts" />

module.exports = (sourcePath: ChunkPath) => ({
  m: (id: ModuleId) => getOrInstantiateRuntimeModule(sourcePath, id),
  c: (chunkData: ChunkData) => loadRuntimeChunk(sourcePath, chunkData),
})
