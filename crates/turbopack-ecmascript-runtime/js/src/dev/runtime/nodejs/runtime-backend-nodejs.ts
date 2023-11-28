/**
 * This file contains the runtime code specific to the Turbopack development
 * ECMAScript Node.js runtime.
 *
 * It will be appended to the base development runtime code.
 */

/// <reference path="../base/runtime-base.ts" />
/// <reference path="../../../shared-node/base-externals-utils.ts" />
/// <reference path="../../../shared-node/node-externals-utils.ts" />
/// <reference path="../../../shared-node/node-wasm-utils.ts" />

interface RequireContextEntry {
  // Only the Node.js backend has this flag.
  external: boolean;
}

type ExternalRequire = (
  id: ModuleId,
  esm?: boolean
) => Exports | EsmNamespaceObject;
type ExternalImport = (id: ModuleId) => Promise<Exports | EsmNamespaceObject>;

interface TurbopackDevContext extends TurbopackDevBaseContext {
  x: ExternalRequire;
  y: ExternalImport;
}

function augmentContext(context: TurbopackDevBaseContext): TurbopackDevContext {
  const nodejsContext = context as TurbopackDevContext;
  nodejsContext.x = externalRequire;
  nodejsContext.y = externalImport;
  return nodejsContext;
}

function resolveChunkPath(chunkPath: ChunkPath, source: SourceInfo) {
  let fromChunkPath = undefined;
  switch (source.type) {
    case SourceType.Runtime:
      fromChunkPath = source.chunkPath;
      break;
    case SourceType.Parent:
      fromChunkPath = getFirstModuleChunk(source.parentId);
      break;
    case SourceType.Update:
      break;
  }

  const path = require("node:path");
  return path.resolve(
    __dirname,
    path.posix.relative(path.dirname(fromChunkPath), chunkPath)
  );
}

function loadWebAssembly(
  source: SourceInfo,
  chunkPath: ChunkPath,
  imports: WebAssembly.Imports
) {
  const resolved = resolveChunkPath(chunkPath, source);

  return instantiateWebAssemblyFromPath(resolved, imports);
}

function loadWebAssemblyModule(source: SourceInfo, chunkPath: ChunkPath) {
  const resolved = resolveChunkPath(chunkPath, source);

  return compileWebAssemblyFromPath(resolved);
}

let BACKEND: RuntimeBackend;

(() => {
  BACKEND = {
    registerChunk(chunkPath, params) {
      if (params == null) {
        return;
      }

      if (params.runtimeModuleIds.length > 0) {
        for (const otherChunkData of params.otherChunks) {
          loadChunk(getChunkPath(otherChunkData), {
            type: SourceType.Runtime,
            chunkPath,
          });
        }

        for (const moduleId of params.runtimeModuleIds) {
          getOrInstantiateRuntimeModule(moduleId, chunkPath);
        }
      }
    },

    async loadChunk(chunkPath, source) {
      loadChunk(chunkPath, source);
    },

    restart: () => {
      throw new Error("restart not implemented for the Node.js backend");
    },
  };

  function loadChunk(chunkPath: ChunkPath, source: SourceInfo) {
    if (!chunkPath.endsWith(".js")) {
      // We only support loading JS chunks in Node.js.
      // This branch can be hit when trying to load a CSS chunk.
      return;
    }

    // We'll only mark the chunk as loaded once the script has been executed,
    // which happens in `registerChunk`. Hence the absence of `resolve()`.
    const resolved = resolveChunkPath(chunkPath, source);

    require(resolved);
  }
})();

function _eval(_: EcmascriptModuleEntry): ModuleFactory {
  throw new Error("HMR evaluation is not implemented on this backend");
}
