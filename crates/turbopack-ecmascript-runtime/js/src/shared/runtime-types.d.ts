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
type EsmImport = (
  moduleId: ModuleId,
  allowExportDefault: boolean
) => EsmNamespaceObject | Promise<EsmNamespaceObject>;
type EsmExport = (exportGetters: Record<string, () => any>) => void;
type ExportValue = (value: any) => void;
type ExportNamespace = (namespace: any) => void;
type DynamicExport = (object: Record<string, any>) => void;

type LoadChunk = (chunkPath: ChunkPath) => Promise<any> | undefined;

type ModuleCache = Record<ModuleId, Module>;
type ModuleFactories = Record<ModuleId, ModuleFactory>;

type AsyncModule = (
  body: (
    handleAsyncDependencies: (
      deps: Dep[]
    ) => Exports[] | Promise<() => Exports[]>,
    asyncResult: (err?: any) => void
  ) => void,
  hasAwait: boolean
) => void;

interface TurbopackBaseContext {
  a: AsyncModule;
  e: Module["exports"];
  r: CommonJsRequire;
  f: RequireContextFactory;
  i: EsmImport;
  s: EsmExport;
  j: DynamicExport;
  v: ExportValue;
  n: ExportNamespace;
  m: Module;
  c: ModuleCache;
  l: LoadChunk;
  g: typeof globalThis;
  __dirname: string;
}
