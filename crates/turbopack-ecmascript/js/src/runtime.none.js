/** @typedef {import('../types/backend').RuntimeBackend} RuntimeBackend */

/** @type {RuntimeBackend} */
const BACKEND = {
  loadChunk(chunkPath, from) {
    throw new Error("chunk loading is not supported");
  },

  restart: () => {
    throw new Error("restart is not supported");
  },
};
