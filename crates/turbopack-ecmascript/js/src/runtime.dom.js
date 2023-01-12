/** @typedef {import('../types/backend').RuntimeBackend} RuntimeBackend */

/** @type {RuntimeBackend} */
const BACKEND = {
  loadChunk(chunkPath, _from) {
    return new Promise((resolve, reject) => {
      if (chunkPath.endsWith(".css")) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = `/${chunkPath}`;
        link.onerror = () => {
          reject();
        };
        link.onload = () => {
          // CSS chunks do not register themselves, and as such must be marked as
          // loaded instantly.
          resolve();
        };
        document.body.appendChild(link);
      } else if (chunkPath.endsWith(".js")) {
        const script = document.createElement("script");
        script.src = `/${chunkPath}`;
        // We'll only mark the chunk as loaded once the script has been executed,
        // which happens in `registerChunk`. Hence the absence of `resolve()` in
        // this branch.
        script.onerror = () => {
          reject();
        };
        document.body.appendChild(script);
      } else {
        throw new Error(`can't infer type of chunk from path ${chunkPath}`);
      }
    });
  },

  restart: () => self.location.reload(),
};
