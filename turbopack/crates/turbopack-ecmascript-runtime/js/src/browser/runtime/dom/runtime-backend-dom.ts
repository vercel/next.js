/**
 * This file contains the runtime code specific to the Turbopack development
 * ECMAScript DOM runtime.
 *
 * It will be appended to the base development runtime code.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../../../browser/runtime/base/runtime-base.ts" />
/// <reference path="../../../shared/runtime-types.d.ts" />

type ChunkResolver = {
  resolved: boolean;
  resolve: () => void;
  reject: (error?: Error) => void;
  promise: Promise<void>;
};

let BACKEND: RuntimeBackend;

function augmentContext(context: unknown): unknown {
  return context;
}

function fetchWebAssembly(wasmChunkPath: ChunkPath) {
  return fetch(getChunkRelativeUrl(wasmChunkPath));
}

async function loadWebAssembly(
  _source: unknown,
  wasmChunkPath: ChunkPath,
  importsObj: WebAssembly.Imports
): Promise<Exports> {
  const req = fetchWebAssembly(wasmChunkPath);

  const { instance } = await WebAssembly.instantiateStreaming(req, importsObj);

  return instance.exports;
}

async function loadWebAssemblyModule(
  _source: unknown,
  wasmChunkPath: ChunkPath
): Promise<WebAssembly.Module> {
  const req = fetchWebAssembly(wasmChunkPath);

  return await WebAssembly.compileStreaming(req);
}

/**
 * Maps chunk paths to the corresponding resolver.
 */
const chunkResolvers: Map<ChunkUrl, ChunkResolver> = new Map();

(() => {
  BACKEND = {
    async registerChunk(chunkPath, params) {
      const chunkUrl = getChunkRelativeUrl(chunkPath);

      const resolver = getOrCreateResolver(chunkUrl);
      resolver.resolve();

      if (params == null) {
        return;
      }

      for (const otherChunkData of params.otherChunks) {
        const otherChunkPath = getChunkPath(otherChunkData)
        const otherChunkUrl = getChunkRelativeUrl(otherChunkPath);

        // Chunk might have started loading, so we want to avoid triggering another load.
        getOrCreateResolver(otherChunkUrl);
      }

      // This waits for chunks to be loaded, but also marks included items as available.
      await Promise.all(
        params.otherChunks.map((otherChunkData) =>
          loadChunk({ type: SourceType.Runtime, chunkPath }, otherChunkData)
        )
      );

      if (params.runtimeModuleIds.length > 0) {
        for (const moduleId of params.runtimeModuleIds) {
          getOrInstantiateRuntimeModule(moduleId, chunkPath);
        }
      }
    },

    /**
     * Loads the given chunk, and returns a promise that resolves once the chunk
     * has been loaded.
    */
    loadChunk(chunkUrl, source) {
      return doLoadChunk(chunkUrl, source);
    },
  };

  function getOrCreateResolver(chunkUrl: ChunkUrl): ChunkResolver {
    let resolver = chunkResolvers.get(chunkUrl);
    if (!resolver) {
      let resolve: () => void;
      let reject: (error?: Error) => void;
      const promise = new Promise<void>((innerResolve, innerReject) => {
        resolve = innerResolve;
        reject = innerReject;
      });
      resolver = {
        resolved: false,
        promise,
        resolve: () => {
          resolver!.resolved = true;
          resolve();
        },
        reject: reject!,
      };
      chunkResolvers.set(chunkUrl, resolver);
    }
    return resolver;
  }

   /**
    * Loads the given chunk, and returns a promise that resolves once the chunk
    * has been loaded.
    */
  function doLoadChunk(chunkUrl: ChunkUrl, source: SourceInfo) {
    const resolver = getOrCreateResolver(chunkUrl);
    if (resolver.resolved) {
      return resolver.promise;
    }

    if (source.type === SourceType.Runtime) {
      // We don't need to load chunks references from runtime code, as they're already
      // present in the DOM.

      if (isCss(chunkUrl)) {
        // CSS chunks do not register themselves, and as such must be marked as
        // loaded instantly.
        resolver.resolve();
      }

      // We need to wait for JS chunks to register themselves within `registerChunk`
      // before we can start instantiating runtime modules, hence the absence of
      // `resolver.resolve()` in this branch.

      return resolver.promise;
    }

    if (typeof importScripts === "function") {
      // We're in a web worker
      if (isCss(chunkUrl)) {
        // ignore
      } else if (isJs(chunkUrl)) {
        importScripts(TURBOPACK_WORKER_LOCATION + chunkUrl);
      } else {
        throw new Error(`can't infer type of chunk from URL ${chunkUrl} in worker`);
      }
    } else {
      // TODO(PACK-2140): remove this once all filenames are guaranteed to be escaped.
      const decodedChunkUrl = decodeURI(chunkUrl);

      if (isCss(chunkUrl)) {
        const previousLinks = document.querySelectorAll(
          `link[rel=stylesheet][href="${chunkUrl}"],link[rel=stylesheet][href^="${chunkUrl}?"],link[rel=stylesheet][href="${decodedChunkUrl}"],link[rel=stylesheet][href^="${decodedChunkUrl}?"]`
        );
        if (previousLinks.length > 0) {
          // CSS chunks do not register themselves, and as such must be marked as
          // loaded instantly.
          resolver.resolve();
        } else {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = chunkUrl;
          link.onerror = () => {
            resolver.reject();
          };
          link.onload = () => {
            // CSS chunks do not register themselves, and as such must be marked as
            // loaded instantly.
            resolver.resolve();
          };
          document.body.appendChild(link);
        }
      } else if (isJs(chunkUrl)) {
        const previousScripts = document.querySelectorAll(
          `script[src="${chunkUrl}"],script[src^="${chunkUrl}?"],script[src="${decodedChunkUrl}"],script[src^="${decodedChunkUrl}?"]`
        );
        if (previousScripts.length > 0) {
          // There is this edge where the script already failed loading, but we
          // can't detect that. The Promise will never resolve in this case.
          for (const script of Array.from(previousScripts)) {
            script.addEventListener("error", () => {
              resolver.reject();
            });
          }
        } else {
          const script = document.createElement("script");
          script.src = chunkUrl;
          // We'll only mark the chunk as loaded once the script has been executed,
          // which happens in `registerChunk`. Hence the absence of `resolve()` in
          // this branch.
          script.onerror = () => {
            resolver.reject();
          };
          document.body.appendChild(script);
        }
      } else {
        throw new Error(`can't infer type of chunk from URL ${chunkUrl}`);
      }
    }

    return resolver.promise;
  }

})();
