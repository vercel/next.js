import type { initScriptLoader } from './script'

export const initalizeScriptLoader: typeof initScriptLoader = (...args) => {
  return require('./script').initScriptLoader(...args)
}
