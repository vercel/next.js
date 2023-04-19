/** @typedef {import('../types/backend').RuntimeBackend} RuntimeBackend */
/** @typedef {import('../types/runtime.dom').ChunkResolver} ChunkResolver */
/** @typedef {import('../types').ChunkPath} ChunkPath */
/** @typedef {import('../types').SourceInfo} SourceInfo */

/** @type {RuntimeBackend} */
let BACKEND;

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
        if (otherChunkPath.endsWith(".css")) {
          // Mark all CSS chunks within the same chunk group as this chunk as loaded.
          // They are just injected as <link> tag and have to way to communicate completion.
          const cssResolver = getOrCreateResolver(otherChunkPath);
          cssResolver.resolve();
        } else if (otherChunkPath.endsWith(".js")) {
          // Chunk might have started loading, so we want to avoid triggering another load.
          getOrCreateResolver(otherChunkPath);
        }
      }

      // This waits for chunks to be loaded, but also marks included items as available.
      await Promise.all(
        params.otherChunks.map((otherChunkData) =>
          loadChunk({ type: SourceTypeRuntime, chunkPath }, otherChunkData)
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

      if (chunkPath.endsWith(".css")) {
        const links = document.querySelectorAll(`link[href="/${chunkPath}"]`);
        for (const link of Array.from(links)) {
          link.remove();
        }
      } else if (chunkPath.endsWith(".js")) {
        // Unloading a JS chunk would have no effect, as it lives in the JS
        // runtime once evaluated.
        // However, we still want to remove the script tag from the DOM to keep
        // the HTML somewhat consistent from the user's perspective.
        const scripts = document.querySelectorAll(
          `script[src="/${chunkPath}"]`
        );
        for (const script of Array.from(scripts)) {
          script.remove();
        }
      } else {
        throw new Error(`can't infer type of chunk from path ${chunkPath}`);
      }
    },

    reloadChunk(chunkPath) {
      return new Promise((resolve, reject) => {
        if (!chunkPath.endsWith(".css")) {
          reject(new Error("The DOM backend can only reload CSS chunks"));
          return;
        }

        const previousLink = document.querySelector(
          `link[type=stylesheet][href^="/${chunkPath}"]`
        );

        if (previousLink == null) {
          reject(new Error(`No link element found for chunk ${chunkPath}`));
          return;
        }

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = `/${chunkPath}?t=${Date.now()}`;
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
        previousLink.parentElement.insertBefore(link, previousLink.nextSibling);
      });
    },

    restart: () => self.location.reload(),
  };

  /**
   * Maps chunk paths to the corresponding resolver.
   *
   * @type {Map<ChunkPath, ChunkResolver>}
   */
  const chunkResolvers = new Map();

  /**
   * @param {ChunkPath} chunkPath
   * @returns {ChunkResolver}
   */
  function getOrCreateResolver(chunkPath) {
    let resolver = chunkResolvers.get(chunkPath);
    if (!resolver) {
      let resolve;
      let reject;
      const promise = new Promise((innerResolve, innerReject) => {
        resolve = innerResolve;
        reject = innerReject;
      });
      resolver = {
        resolved: false,
        promise,
        resolve: () => {
          resolver.resolved = true;
          resolve();
        },
        reject,
      };
      chunkResolvers.set(chunkPath, resolver);
    }
    return resolver;
  }

  function deleteResolver(chunkPath) {
    chunkResolvers.delete(chunkPath);
  }

  /**
   * Loads the given chunk, and returns a promise that resolves once the chunk
   * has been loaded.
   *
   * @param {ChunkPath} chunkPath
   * @param {SourceInfo} source
   */
  async function doLoadChunk(chunkPath, source) {
    const resolver = getOrCreateResolver(chunkPath);
    if (resolver.resolved) {
      return resolver.promise;
    }

    // We don't need to load chunks references from runtime code, as they're already
    // present in the DOM.
    // However, we need to wait for them to register themselves within `registerChunk`
    // before we can start instantiating runtime modules, hence the absense of
    // `resolver.resolve()` in this branch.
    if (source.type === SourceTypeRuntime) {
      return resolver.promise;
    }

    if (chunkPath.endsWith(".css")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `/${chunkPath}`;
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
      script.src = `/${chunkPath}`;
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
