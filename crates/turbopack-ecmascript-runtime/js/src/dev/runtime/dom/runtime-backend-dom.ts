/**
 * This file contains the runtime code specific to the Turbopack development
 * ECMAScript DOM runtime.
 *
 * It will be appended to the base development runtime code.
 */

/// <reference path="../base/runtime-base.ts" />

type ChunkResolver = {
  resolved: boolean;
  resolve: () => void;
  reject: (error?: Error) => void;
  promise: Promise<void>;
};

let BACKEND: RuntimeBackend;

function augmentContext(context: TurbopackDevBaseContext): TurbopackDevContext {
  return context;
}

function commonJsRequireContext(
  entry: RequireContextEntry,
  sourceModule: Module
): Exports {
  return commonJsRequire(sourceModule, entry.id());
}

async function loadWebAssembly(
  _source: SourceInfo,
  wasmChunkPath: ChunkPath,
  importsObj: WebAssembly.Imports
): Promise<Exports> {
  const chunkUrl = `/${getChunkRelativeUrl(wasmChunkPath)}`;

  const req = fetch(chunkUrl);
  const { instance } = await WebAssembly.instantiateStreaming(req, importsObj);

  return instance.exports;
}

(() => {
  BACKEND = {
    async registerChunk(chunkPath, params) {
      const resolver = getOrCreateResolver(chunkPath);
      resolver.resolve();

      if (params == null) {
        return;
      }

      for (const otherChunkData of params.otherChunks) {
        const otherChunkPath = getChunkPath(otherChunkData);
        // Chunk might have started loading, so we want to avoid triggering another load.
        getOrCreateResolver(otherChunkPath);
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

    loadChunk(chunkPath, source) {
      return doLoadChunk(chunkPath, source);
    },

    unloadChunk(chunkPath) {
      deleteResolver(chunkPath);

      const chunkUrl = getChunkRelativeUrl(chunkPath);

      if (chunkPath.endsWith(".css")) {
        const links = document.querySelectorAll(`link[href="${chunkUrl}"]`);
        for (const link of Array.from(links)) {
          link.remove();
        }
      } else if (chunkPath.endsWith(".js")) {
        // Unloading a JS chunk would have no effect, as it lives in the JS
        // runtime once evaluated.
        // However, we still want to remove the script tag from the DOM to keep
        // the HTML somewhat consistent from the user's perspective.
        const scripts = document.querySelectorAll(`script[src="${chunkUrl}"]`);
        for (const script of Array.from(scripts)) {
          script.remove();
        }
      } else {
        throw new Error(`can't infer type of chunk from path ${chunkPath}`);
      }
    },

    reloadChunk(chunkPath) {
      return new Promise<void>((resolve, reject) => {
        if (!chunkPath.endsWith(".css")) {
          reject(new Error("The DOM backend can only reload CSS chunks"));
          return;
        }

        const encodedChunkPath = chunkPath
          .split("/")
          .map((p) => encodeURIComponent(p))
          .join("/");

        const chunkUrl = `/${getChunkRelativeUrl(encodedChunkPath)}`;

        const previousLink = document.querySelector(
          `link[rel=stylesheet][href^="${chunkUrl}"]`
        );

        if (previousLink == null) {
          reject(new Error(`No link element found for chunk ${chunkPath}`));
          return;
        }

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = chunkUrl;
        link.onerror = () => {
          reject();
        };
        link.onload = () => {
          // First load the new CSS, then remove the old one. This prevents visible
          // flickering that would happen in-between removing the previous CSS and
          // loading the new one.
          previousLink.remove();

          // CSS chunks do not register themselves, and as such must be marked as
          // loaded instantly.
          resolve();
        };

        // Make sure to insert the new CSS right after the previous one, so that
        // its precedence is higher.
        previousLink.parentElement!.insertBefore(
          link,
          previousLink.nextSibling
        );
      });
    },

    restart: () => self.location.reload(),
  };

  /**
   * Maps chunk paths to the corresponding resolver.
   */
  const chunkResolvers: Map<ChunkPath, ChunkResolver> = new Map();

  function getOrCreateResolver(chunkPath: ChunkPath): ChunkResolver {
    let resolver = chunkResolvers.get(chunkPath);
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
      chunkResolvers.set(chunkPath, resolver);
    }
    return resolver;
  }

  function deleteResolver(chunkPath: ChunkPath) {
    chunkResolvers.delete(chunkPath);
  }

  /**
   * Loads the given chunk, and returns a promise that resolves once the chunk
   * has been loaded.
   */
  async function doLoadChunk(chunkPath: ChunkPath, source: SourceInfo) {
    const resolver = getOrCreateResolver(chunkPath);
    if (resolver.resolved) {
      return resolver.promise;
    }

    if (source.type === SourceType.Runtime) {
      // We don't need to load chunks references from runtime code, as they're already
      // present in the DOM.

      if (chunkPath.endsWith(".css")) {
        // CSS chunks do not register themselves, and as such must be marked as
        // loaded instantly.
        resolver.resolve();
      }

      // We need to wait for JS chunks to register themselves within `registerChunk`
      // before we can start instantiating runtime modules, hence the absence of
      // `resolver.resolve()` in this branch.

      return resolver.promise;
    }

    const chunkUrl = `/${getChunkRelativeUrl(chunkPath)}`;

    if (chunkPath.endsWith(".css")) {
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
    } else if (chunkPath.endsWith(".js")) {
      const script = document.createElement("script");
      script.src = chunkUrl;
      // We'll only mark the chunk as loaded once the script has been executed,
      // which happens in `registerChunk`. Hence the absence of `resolve()` in
      // this branch.
      script.onerror = () => {
        resolver.reject();
      };
      document.body.appendChild(script);
    } else {
      throw new Error(`can't infer type of chunk from path ${chunkPath}`);
    }

    return resolver.promise;
  }
})();

function _eval({ code, url, map }: EcmascriptModuleEntry): ModuleFactory {
  code += `\n\n//# sourceURL=${location.origin}/${url}`;
  if (map) code += `\n//# sourceMappingURL=${map}`;
  return eval(code);
}
