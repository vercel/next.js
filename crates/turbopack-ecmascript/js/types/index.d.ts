import { RefreshRuntimeGlobals } from "@next/react-refresh-utils/dist/runtime";
import { ServerMessage } from "./protocol";
import { Hot } from "./hot";

export type RefreshHelpers = RefreshRuntimeGlobals["$RefreshHelpers$"];

type ChunkPath = string;
type ModuleId = string;

interface Chunk {}

interface Exports {
  __esModule?: boolean;

  [key: string]: any;
}

export type ChunkModule = () => void;
export type Runnable = (...args: any[]) => boolean;
export type ChunkRegistration = [
  chunkPath: ChunkPath,
  chunkModules: ChunkModule[],
  ...run: Runnable[]
];

interface Module {
  exports: Exports;
  loaded: boolean;
  id: ModuleId;
  hot?: Hot;
  children: ModuleId[];
  parents: ModuleId[];
  interopNamespace?: EsmInteropNamespace;
}

type ModuleCache = Record<ModuleId, Module>;

type CommonJsRequire = (moduleId: ModuleId) => Exports;

export type EsmInteropNamespace = Record<string, any>;
type EsmImport = (
  moduleId: ModuleId,
  allowExportDefault: boolean
) => EsmInteropNamespace;
type EsmExport = (exportGetters: Record<string, () => any>) => void;
type ExportValue = (value: any) => void;

type LoadChunk = (chunkPath: ChunkPath) => Promise<any> | undefined;

interface TurbopackContext {
  e: Module["exports"];
  r: CommonJsRequire;
  i: EsmImport;
  s: EsmExport;
  v: ExportValue;
  m: Module;
  c: ModuleCache;
  l: LoadChunk;
  p: Partial<NodeJS.Process> & Pick<NodeJS.Process, "env">;
}

type ModuleFactory = (
  this: Module["exports"],
  context: TurbopackContext
) => undefined;

// string encoding of a module factory (used in hmr updates)
type ModuleFactoryString = string;

interface Runtime {
  loadedChunks: Set<ChunkPath>;
  modules: Record<ModuleId, ModuleFactory>;
  cache: Record<string, Module>;

  instantiateRuntimeModule: (moduleId: ModuleId) => Module;
  registerChunkList: (chunkPath: ChunkPath, chunkPaths: ChunkPath[]) => void;
}

interface RuntimeBackend {
  loadChunk: (chunkPath: ChunkPath, from?: ModuleId) => Promise<void>;
  reloadChunk?: (chunkPath: ChunkPath) => Promise<void>;
  unloadChunk?: (chunkPath: ChunkPath) => void;

  restart: () => void;
}

export type UpdateCallback = (update: ServerMessage) => void;
export type ChunkUpdateProvider = {
  push: (registration: [ChunkPath, UpdateCallback]) => void;
};

export interface TurbopackGlobals {
  // This is used by the Next.js integration test suite to notify it when HMR
  // updates have been completed.
  __NEXT_HMR_CB?: null | (() => void);
  TURBOPACK?: ChunkRegistration[];
  TURBOPACK_CHUNK_UPDATE_LISTENERS?:
    | ChunkUpdateProvider
    | [ChunkPath, UpdateCallback][];
}

export type GetFirstModuleChunk = (moduleId: ModuleId) => ChunkPath | null;

declare global {
  var TURBOPACK: ChunkRegistration[];
  var TURBOPACK_CHUNK_UPDATE_LISTENERS:
    | ChunkUpdateProvider
    | [ChunkPath, UpdateCallback][]
    | undefined;

  var $RefreshHelpers$: RefreshRuntimeGlobals["$RefreshHelpers$"];
  var $RefreshReg$: RefreshRuntimeGlobals["$RefreshReg$"];
  var $RefreshSig$: RefreshRuntimeGlobals["$RefreshSig$"];
  var $RefreshInterceptModuleExecution$: RefreshRuntimeGlobals["$RefreshInterceptModuleExecution$"];

  interface NodeModule {
    hot: Hot;
  }
}
