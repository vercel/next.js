/**
 * This file contains runtime types that are shared between all TurboPack
 * ECMAScript runtimes.
 *
 * It is separate from `runtime-utils.ts` because it can be used outside of
 * runtime code, hence it should not contain any function declarations that are
 * specific to the runtime context.
 */

type CurrentScript = { getAttribute: (name: string) => string | null }
type ChunkListPath = string & { readonly brand: unique symbol }
type ChunkListScript = CurrentScript & { readonly brand: unique symbol }
type ChunkPath = string & { readonly brand: unique symbol }
type ChunkScript = CurrentScript & { readonly brand: unique symbol }
type ChunkUrl = string & { readonly brand: unique symbol }
// TODO this should actually be `string | number`
type ModuleId = string

interface Exports {
  __esModule?: boolean

  [key: string]: any
}

type ChunkData =
  | ChunkPath
  | {
      path: ChunkPath
      included: ModuleId[]
      excluded: ModuleId[]
      moduleChunks: ChunkPath[]
    }

type CommonJsRequire = (moduleId: ModuleId) => Exports
type ModuleContextFactory = (map: ModuleContextMap) => ModuleContext
type EsmImport = (
  moduleId: ModuleId,
  allowExportDefault: boolean
) => EsmNamespaceObject | Promise<EsmNamespaceObject>
type EsmExport = (exportGetters: Record<string, () => any>) => void
type EsmExportOther = (
  id: ModuleId,
  exportGetters: Record<string, () => any>
) => void
type ExportValue = (value: any) => void
type ExportNamespace = (namespace: any) => void
type DynamicExport = (object: Record<string, any>) => void

type LoadChunk = (chunkPath: ChunkPath) => Promise<any> | undefined
type LoadChunkByUrl = (chunkUrl: ChunkUrl) => Promise<any> | undefined
type LoadWebAssembly = (
  wasmChunkPath: ChunkPath,
  edgeModule: () => WebAssembly.Module,
  imports: WebAssembly.Imports
) => Exports
type LoadWebAssemblyModule = (
  wasmChunkPath: ChunkPath,
  edgeModule: () => WebAssembly.Module
) => WebAssembly.Module

type ModuleCache<M> = Record<ModuleId, M>
// TODO properly type values here
type ModuleFactories = Record<ModuleId, Function>
// The value is an array with scope hoisting
type CompressedModuleFactories = Record<
  ModuleId,
  Function | [Function, ModuleId[]]
>

type RelativeURL = (inputUrl: string) => void
type ResolvePathFromModule = (moduleId: string) => string

type AsyncModule = (
  body: (
    handleAsyncDependencies: (
      deps: Dep[]
    ) => Exports[] | Promise<() => Exports[]>,
    asyncResult: (err?: any) => void
  ) => void,
  hasAwait: boolean
) => void

type ResolveAbsolutePath = (modulePath?: string) => string
type GetWorkerBlobURL = (chunks: ChunkPath[]) => string

interface Module {
  exports: Function | Exports | Promise<Exports> | AsyncModulePromise
  error: Error | undefined
  loaded: boolean
  id: ModuleId
  namespaceObject?:
    | EsmNamespaceObject
    | Promise<EsmNamespaceObject>
    | AsyncModulePromise<EsmNamespaceObject>
  [REEXPORTED_OBJECTS]?: any[]
}

interface ModuleWithDirection extends Module {
  children: ModuleId[]
  parents: ModuleId[]
}

interface TurbopackBaseContext<M> {
  a: AsyncModule
  e: Module['exports']
  r: CommonJsRequire
  t: CommonJsRequire
  f: ModuleContextFactory
  i: EsmImport
  s: EsmExport
  o: EsmExportOther
  j: DynamicExport
  v: ExportValue
  n: ExportNamespace
  m: Module
  c: ModuleCache<M>
  M: ModuleFactories
  l: LoadChunk
  L: LoadChunkByUrl
  w: LoadWebAssembly
  u: LoadWebAssemblyModule
  P: ResolveAbsolutePath
  U: RelativeURL
  b: GetWorkerBlobURL
  z: CommonJsRequire
}
