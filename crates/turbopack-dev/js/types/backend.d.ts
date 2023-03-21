import {
  GetFirstModuleChunk,
  GetOrInstantiateRuntimeModule,
  SourceType,
} from "types";

export { RuntimeBackend } from "types";

declare global {
  declare const getFirstModuleChunk: GetFirstModuleChunk;
  declare const getOrInstantiateRuntimeModule: GetOrInstantiateRuntimeModule;
  declare const SourceTypeRuntime: SourceType.Runtime;
  declare const SourceTypeParent: SourceType.Parent;
  declare const SourceTypeUpdate: SourceType.Update;
}
