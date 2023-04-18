import { ChunkPath, ModuleId } from "./index";

export type ChunkRunner = {
  requiredChunks: Set<ChunkPath>;
  chunkPath: ChunkPath;
  runtimeModuleIds: ModuleId[];
};
