'use strict'

/** @typedef {import("../../../../").Compiler} Compiler */
/** @typedef {import("../../../../").NormalModule} NormalModule */

class ReorderModulesPlugin {
  /**
   * @param {Compiler} compiler compiler
   */
  apply(compiler) {
    compiler.hooks.compilation.tap('ReorderModulesPlugin', (compilation) => {
      compilation.hooks.seal.tap('ReorderModulesPlugin', () => {
        const sortedModules = [...compilation.modules].sort((a, _b) =>
          /** @type {NormalModule} */
          (a).request.includes('b.js') ? -1 : 1
        )
        compilation.modules = new Set(sortedModules)
      })
    })
  }
}

module.exports = {
  plugins: [new ReorderModulesPlugin()],
  optimization: {
    sideEffects: true,
  },
}
