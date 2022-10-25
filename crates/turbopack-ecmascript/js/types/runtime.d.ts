import { ModuleId } from "./index";

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
