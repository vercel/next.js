/**
 * This file contains the runtime code specific to the Turbopack development
 * ECMAScript DOM runtime.
 *
 * It will be appended to the base development runtime code.
 */

/// <reference path="../base/runtime-base.ts" />
/// <reference path="../../../../shared/require-type.d.ts" />

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

function fetchWebAssembly(wasmChunkPath: ChunkPath) {
  return fetch(getChunkRelativeUrl(wasmChunkPath));
}

async function loadWebAssembly(
  _source: SourceInfo,
  wasmChunkPath: ChunkPath,
  importsObj: WebAssembly.Imports
): Promise<Exports> {
  const req = fetchWebAssembly(wasmChunkPath);

  const { instance } = await WebAssembly.instantiateStreaming(req, importsObj);

  return instance.exports;
}

async function loadWebAssemblyModule(
  _source: SourceInfo,
  wasmChunkPath: ChunkPath
): Promise<WebAssembly.Module> {
  const req = fetchWebAssembly(wasmChunkPath);

  return await WebAssembly.compileStreaming(req);
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
      // TODO(PACK-2140): remove this once all filenames are guaranteed to be escaped.
      const decodedChunkUrl = decodeURI(chunkUrl);

      if (chunkPath.endsWith(".css")) {
        const links = document.querySelectorAll(
          `link[href="${chunkUrl}"],link[href^="${chunkUrl}?"],link[href="${decodedChunkUrl}"],link[href^="${decodedChunkUrl}?"]`
        );
        for (const link of Array.from(links)) {
          link.remove();
        }
      } else if (chunkPath.endsWith(".js")) {
        // Unloading a JS chunk would have no effect, as it lives in the JS
        // runtime once evaluated.
        // However, we still want to remove the script tag from the DOM to keep
        // the HTML somewhat consistent from the user's perspective.
        const scripts = document.querySelectorAll(
          `script[src="${chunkUrl}"],script[src^="${chunkUrl}?"],script[src="${decodedChunkUrl}"],script[src^="${decodedChunkUrl}?"]`
        );
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

        const chunkUrl = getChunkRelativeUrl(chunkPath);
        const decodedChunkUrl = decodeURI(chunkUrl);

        const previousLinks = document.querySelectorAll(
          `link[rel=stylesheet][href="${chunkUrl}"],link[rel=stylesheet][href^="${chunkUrl}?"],link[rel=stylesheet][href="${decodedChunkUrl}"],link[rel=stylesheet][href^="${decodedChunkUrl}?"]`
        );

        if (previousLinks.length == 0) {
          reject(new Error(`No link element found for chunk ${chunkPath}`));
          return;
        }

        const link = document.createElement("link");
        link.rel = "stylesheet";

        if (navigator.userAgent.includes("Firefox")) {
          // Firefox won't reload CSS files that were previously loaded on the current page,
          // we need to add a query param to make sure CSS is actually reloaded from the server.
          //
          // I believe this is this issue: https://bugzilla.mozilla.org/show_bug.cgi?id=1037506
          //
          // Safari has a similar issue, but only if you have a `<link rel=preload ... />` tag
          // pointing to the same URL as the stylesheet: https://bugs.webkit.org/show_bug.cgi?id=187726
          link.href = `${chunkUrl}?ts=${Date.now()}`;
        } else {
          link.href = chunkUrl;
        }

        link.onerror = () => {
          reject();
        };
        link.onload = () => {
          // First load the new CSS, then remove the old ones. This prevents visible
          // flickering that would happen in-between removing the previous CSS and
          // loading the new one.
          for (const previousLink of Array.from(previousLinks))
            previousLink.remove();

          // CSS chunks do not register themselves, and as such must be marked as
          // loaded instantly.
          resolve();
        };

        // Make sure to insert the new CSS right after the previous one, so that
        // its precedence is higher.
        previousLinks[0].parentElement!.insertBefore(
          link,
          previousLinks[0].nextSibling
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

    const chunkUrl = getChunkRelativeUrl(chunkPath);
    const decodedChunkUrl = decodeURI(chunkUrl);

    if (chunkPath.endsWith(".css")) {
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
    } else if (chunkPath.endsWith(".js")) {
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
      throw new Error(`can't infer type of chunk from path ${chunkPath}`);
    }

    return resolver.promise;
  }
})();

function _eval({ code, url, map }: EcmascriptModuleEntry): ModuleFactory {
  code += `\n\n//# sourceURL=${encodeURI(
    location.origin + CHUNK_BASE_PATH + url
  )}`;
  if (map) {
    code += `\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${btoa(
      // btoa doesn't handle nonlatin characters, so escape them as \x sequences
      // See https://stackoverflow.com/a/26603875
      unescape(encodeURIComponent(map))
    )}`;
  }

  return eval(code);
}
