/** @typedef {import('../types/backend').RuntimeBackend} RuntimeBackend */

/** @type {RuntimeBackend} */
const BACKEND = {
  loadChunk(chunkPath, from) {
    return new Promise((resolve, reject) => {
      const fromPath = getFirstModuleChunk(from);
      if (fromPath == null) {
        reject(
          `Module ${from} that requested chunk ${chunkPath} has been removed`
        );
        return;
      }

      // We'll only mark the chunk as loaded once the script has been executed,
      // which happens in `registerChunk`. Hence the absence of `resolve()`.
      const path = require("path");
      const resolved = require.resolve(
        "./" + path.relative(path.dirname(fromPath), chunkPath)
      );
      delete require.cache[resolved];
      require(resolved);
    });
  },

  restart: () => {
    throw new Error("restart not implemented for the Node.js backend");
  },
};
