/**
 * This file contains the runtime code specific to the Turbopack development
 * ECMAScript "None" runtime (e.g. for Edge).
 *
 * It will be appended to the base development runtime code.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../base/runtime-base.ts" />
/// <reference path="../../../shared/require-type.d.ts" />
/// <reference path="../../../shared-node/base-externals-utils.ts" />

type ChunkRunner = {
  requiredChunks: Set<ChunkPath>;
  chunkPath: ChunkPath;
  runtimeModuleIds: ModuleId[];
};

let BACKEND: RuntimeBackend;

type ExternalRequire = (
  id: ModuleId,
  thunk: () => any,
  esm?: boolean
) => Exports | EsmNamespaceObject;
type ExternalImport = (id: ModuleId) => Promise<Exports | EsmNamespaceObject>;

interface TurbopackEdgeContext extends TurbopackBaseContext<Module> {
  x: ExternalRequire;
  y: ExternalImport;
}

function augmentContext(context: TurbopackBaseContext<Module>): TurbopackEdgeContext {
  const nodejsContext = context as TurbopackEdgeContext;
  nodejsContext.x = externalRequire;
  nodejsContext.y = externalImport;
  return nodejsContext;
}

async function loadWebAssembly(
  source: SourceInfo,
  chunkPath: ChunkPath,
  imports: WebAssembly.Imports
): Promise<Exports> {
  const module = await loadWebAssemblyModule(source, chunkPath);

  return await WebAssembly.instantiate(module, imports);
}

function getFileStem(path: string): string {
  const fileName = path.split("/").pop()!;

  const stem = fileName.split(".").shift()!;

  if (stem === "") {
    return fileName;
  }

  return stem;
}

type GlobalWithInjectedWebAssembly = typeof globalThis & {
  [key: `wasm_${string}`]: WebAssembly.Module;
};

async function loadWebAssemblyModule(
  _source: SourceInfo,
  chunkPath: ChunkPath
): Promise<WebAssembly.Module> {
  const stem = getFileStem(chunkPath);

  // very simple escaping just replacing unsupported characters with `_`
  const escaped = stem.replace(/[^a-zA-Z0-9$_]/gi, "_");

  const identifier: `wasm_${string}` = `wasm_${escaped}`;

  const module = (globalThis as GlobalWithInjectedWebAssembly)[identifier];

  if (!module) {
    throw new Error(
      `dynamically loading WebAssembly is not supported in this runtime and global \`${identifier}\` was not injected`
    );
  }

  return module;
}

(() => {
  BACKEND = {
    // The "none" runtime expects all chunks within the same chunk group to be
    // registered before any of them are instantiated.
    // Furthermore, modules must be instantiated synchronously, hence we don't
    // use promises here.
    registerChunk(chunkPath, params) {
      registeredChunks.add(chunkPath);
      instantiateDependentChunks(chunkPath);

      if (params == null) {
        return;
      }

      if (params.otherChunks.length === 0) {
        // The current chunk does not depend on any other chunks, it can be
        // instantiated immediately.
        instantiateRuntimeModules(params.runtimeModuleIds, chunkPath);
      } else {
        // The current chunk depends on other chunks, so we need to wait for
        // those chunks to be registered before instantiating the runtime
        // modules.
        registerChunkRunner(
          chunkPath,
          params.otherChunks.filter((chunk) =>
            // The none runtime can only handle JS chunks, so we only wait for these
            getChunkPath(chunk).endsWith(".js")
          ),
          params.runtimeModuleIds
        );
      }
    },

    loadChunk(_chunkPath, _fromChunkPath) {
      throw new Error("chunk loading is not supported");
    },
  };

  const registeredChunks: Set<ChunkPath> = new Set();
  const runners: Map<ChunkPath, Set<ChunkRunner>> = new Map();

  /**
   * Registers a chunk runner that will be instantiated once all of the
   * dependencies of the chunk have been registered.
   */
  function registerChunkRunner(
    chunkPath: ChunkPath,
    otherChunks: ChunkData[],
    runtimeModuleIds: ModuleId[]
  ) {
    const requiredChunks: Set<ChunkPath> = new Set();
    const runner = {
      runtimeModuleIds,
      chunkPath,
      requiredChunks,
    };

    for (const otherChunkData of otherChunks) {
      const otherChunkPath = getChunkPath(otherChunkData);
      if (registeredChunks.has(otherChunkPath)) {
        continue;
      }

      requiredChunks.add(otherChunkPath);
      let runnersForChunk = runners.get(otherChunkPath);
      if (runnersForChunk == null) {
        runnersForChunk = new Set();
        runners.set(otherChunkPath, runnersForChunk);
      }
      runnersForChunk.add(runner);
    }
    // When all chunks are already registered, we can instantiate the runtime module
    if (runner.requiredChunks.size === 0) {
      instantiateRuntimeModules(runner.runtimeModuleIds, runner.chunkPath);
    }
  }

  /**
   * Instantiates any chunk runners that were waiting for the given chunk to be
   * registered.
   */
  function instantiateDependentChunks(chunkPath: ChunkPath) {
    // Run any chunk runners that were waiting for this chunk to be
    // registered.
    const runnersForChunk = runners.get(chunkPath);
    if (runnersForChunk != null) {
      for (const runner of runnersForChunk) {
        runner.requiredChunks.delete(chunkPath);

        if (runner.requiredChunks.size === 0) {
          instantiateRuntimeModules(runner.runtimeModuleIds, runner.chunkPath);
        }
      }
      runners.delete(chunkPath);
    }
  }

  /**
   * Instantiates the runtime modules for the given chunk.
   */
  function instantiateRuntimeModules(
    runtimeModuleIds: ModuleId[],
    chunkPath: ChunkPath
  ) {
    for (const moduleId of runtimeModuleIds) {
      getOrInstantiateRuntimeModule(moduleId, chunkPath);
    }
  }
})();
