/**
 * This file contains runtime types that are shared between all TurboPack
 * ECMAScript runtimes.
 *
 * It is separate from `runtime-utils.ts` because it can be used outside of
 * runtime code, hence it should not contain any function declarations that are
 * specific to the runtime context.
 */

type ChunkPath = string;
type ModuleId = string;

type ChunkData =
  | ChunkPath
  | {
      path: ChunkPath;
      included: ModuleId[];
      excluded: ModuleId[];
      moduleChunks: ChunkPath[];
    };

type CommonJsRequire = (moduleId: ModuleId) => Exports;
type ModuleContextFactory = (map: ModuleContextMap) => ModuleContext;
type EsmImport = (
  moduleId: ModuleId,
  allowExportDefault: boolean
) => EsmNamespaceObject | Promise<EsmNamespaceObject>;
type EsmExport = (exportGetters: Record<string, () => any>) => void;
type ExportValue = (value: any) => void;
type ExportNamespace = (namespace: any) => void;
type DynamicExport = (object: Record<string, any>) => void;

type LoadChunk = (chunkPath: ChunkPath) => Promise<any> | undefined;
type LoadWebAssembly = (
  wasmChunkPath: ChunkPath,
  imports: WebAssembly.Imports
) => Exports;
type LoadWebAssemblyModule = (wasmChunkPath: ChunkPath) => WebAssembly.Module;

type ModuleCache = Record<ModuleId, Module>;
type ModuleFactories = Record<ModuleId, ModuleFactory>;

type RelativeURL = (inputUrl: string) => void;
type ResolvePathFromModule = (moduleId: string) => string;

type AsyncModule = (
  body: (
    handleAsyncDependencies: (
      deps: Dep[]
    ) => Exports[] | Promise<() => Exports[]>,
    asyncResult: (err?: any) => void
  ) => void,
  hasAwait: boolean
) => void;

type ResolveAbsolutePath = (modulePath?: string) => string;

interface TurbopackBaseContext {
  a: AsyncModule;
  e: Module["exports"];
  r: CommonJsRequire;
  t: CommonJsRequire;
  f: ModuleContextFactory;
  i: EsmImport;
  s: EsmExport;
  j: DynamicExport;
  v: ExportValue;
  n: ExportNamespace;
  m: Module;
  c: ModuleCache;
  M: ModuleFactories;
  l: LoadChunk;
  w: LoadWebAssembly;
  u: LoadWebAssemblyModule;
  g: typeof globalThis;
  P: ResolveAbsolutePath;
  U: RelativeURL;
  __dirname: string;
}
