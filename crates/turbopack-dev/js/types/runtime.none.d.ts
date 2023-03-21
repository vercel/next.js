export type ChunkRunner = {
  requiredChunks: Set<ChunkPath>;
  chunkPath: ChunkPath;
  runtimeModuleIds: ModuleId[];
};
