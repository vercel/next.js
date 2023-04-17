import {
  GetFirstModuleChunk,
  GetOrInstantiateRuntimeModule,
  LoadChunk,
  SourceType,
} from ".";
import { DevRuntimeParams } from "./runtime";

export { RuntimeBackend } from "types";

declare global {
  declare const RUNTIME_PARAMS: DevRuntimeParams;
  declare const getFirstModuleChunk: GetFirstModuleChunk;
  declare const getOrInstantiateRuntimeModule: GetOrInstantiateRuntimeModule;
  declare const loadChunk: InternalLoadChunk;
  declare const SourceTypeRuntime: SourceType.Runtime;
  declare const SourceTypeParent: SourceType.Parent;
  declare const SourceTypeUpdate: SourceType.Update;
}
