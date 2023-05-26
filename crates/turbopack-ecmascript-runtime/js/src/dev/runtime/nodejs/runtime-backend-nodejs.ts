/**
 * This file contains the runtime code specific to the Turbopack development
 * ECMAScript Node.js runtime.
 *
 * It will be appended to the base development runtime code.
 */

/// <reference path="../base/runtime-base.ts" />

interface RequireContextEntry {
  // Only the Node.js backend has this flag.
  external: boolean;
}

type ExternalRequire = (id: ModuleId) => Exports | EsmNamespaceObject;

interface TurbopackDevContext {
  x: ExternalRequire;
}

function commonJsRequireContext(
  entry: RequireContextEntry,
  sourceModule: Module
): Exports {
  return entry.external
    ? externalRequire(entry.id(), false)
    : commonJsRequire(sourceModule, entry.id());
}

function externalRequire(
  id: ModuleId,
  esm: boolean = false
): Exports | EsmNamespaceObject {
  let raw;
  try {
    raw = require(id);
  } catch (err) {
    // TODO(alexkirsz) This can happen when a client-side module tries to load
    // an external module we don't provide a shim for (e.g. querystring, url).
    // For now, we fail semi-silently, but in the future this should be a
    // compilation error.
    throw new Error(`Failed to load external module ${id}: ${err}`);
  }
  if (!esm) {
    return raw;
  }
  const ns = {};
  interopEsm(raw, ns, raw.__esModule);
  return ns;
}
externalRequire.resolve = (
  id: string,
  options?:
    | {
        paths?: string[] | undefined;
      }
    | undefined
) => {
  return require.resolve(id, options);
};

function augmentContext(context: TurbopackDevBaseContext): TurbopackDevContext {
  const nodejsContext = context as TurbopackDevContext;
  nodejsContext.x = externalRequire;
  return nodejsContext;
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

    // We'll only mark the chunk as loaded once the script has been executed,
    // which happens in `registerChunk`. Hence the absence of `resolve()`.
    const path = require("path");
    const resolved = require.resolve(
      "./" + path.relative(path.dirname(fromChunkPath), chunkPath)
    );
    delete require.cache[resolved];
    require(resolved);
  }
})();

function _eval({ code, url, map }: EcmascriptModuleEntry): ModuleFactory {
  throw new Error("HMR evaluation is not implemented on this backend");
}
