import { ModuleId } from "./index";
import { RuntimeBackend, TurbopackGlobals } from "types";
import { RefreshRuntimeGlobals } from "@next/react-refresh-utils/dist/runtime";

export interface Loader {
  promise: Promise<undefined>;
  onLoad: () => void;
}

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
