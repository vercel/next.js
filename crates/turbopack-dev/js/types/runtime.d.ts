import { ModuleId } from "./index";
import { RuntimeBackend, TurbopackGlobals } from "types";
import { RefreshRuntimeGlobals } from "@next/react-refresh-utils/dist/runtime";

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
  otherChunks: ChunkPath[];
  runtimeModuleIds: ModuleId[];
};
