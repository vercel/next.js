import { ModuleId, ChunkPath } from "./index";

export type ModuleEffect =
  | {
      type: "unaccepted";
      dependencyChain: ModuleId[];
    }
  | {
      type: "self-declined";
      dependencyChain: ModuleId[];
      moduleId: ModuleId;
    }
  | {
      type: "accepted";
      moduleId: ModuleId;
      outdatedModules: Set<ModuleId>;
    };

export type DevRuntimeParams = {
  otherChunks: ChunkData[];
  runtimeModuleIds: ModuleId[];
};
