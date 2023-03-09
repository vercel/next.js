/** @typedef {import('../types/backend').RuntimeBackend} RuntimeBackend */

/** @type {RuntimeBackend} */
const BACKEND = {
  loadChunk(chunkPath) {
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

  unloadChunk(chunkPath) {
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
      const scripts = document.querySelectorAll(`script[src="/${chunkPath}"]`);
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
        `link[href^="/${chunkPath}"]`
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
