import type { initScriptLoader } from './script'

export const initalizeScriptLoader: typeof initScriptLoader = (...args) => {
  if (process.env.__NEXT_SCRIPT_IMPORTED) {
    return require('./script').initScriptLoader(...args)
  }
}
